const DB = require('./db');
const { CHIT_CONFIGS } = require('./chitConfig');

/**
 * Get current chit fund month key and index based on IST date.
 * October is Month 1 (index 0), September is Month 12 (index 11).
 */
function getCurrentChitFundMonthInfo() {
  const dateObj = new Date();
  // Get month in IST (1-12)
  const options = { timeZone: 'Asia/Kolkata', month: 'numeric', year: 'numeric' };
  const formatter = new Intl.DateTimeFormat('en-US', options);
  const parts = formatter.formatToParts(dateObj);
  const calMonth = parseInt(parts.find(p => p.type === 'month').value, 10);
  const year = parseInt(parts.find(p => p.type === 'year').value, 10);

  // Chit fund month index (October = 0, Nov = 1, ... Sep = 11)
  const chitMonthIdx = (calMonth - 10 + 12) % 12;
  const monthKey = `${year}-${String(calMonth).padStart(2, '0')}_M${chitMonthIdx + 1}`;

  const monthNames = [
    'October', 'November', 'December', 'January', 'February', 'March',
    'April', 'May', 'June', 'July', 'August', 'September'
  ];

  return {
    calMonth,
    year,
    chitMonthIdx,
    monthName: monthNames[chitMonthIdx] || `Month ${chitMonthIdx + 1}`,
    monthKey
  };
}

/**
 * Generate customer-wise balance sheet backup report for all versions.
 * Strictly read-only; does not modify any customer, payment, or admin data.
 */
async function generatePersonWiseBackupData() {
  await DB.initDatabase();
  const monthInfo = getCurrentChitFundMonthInfo();
  const versions = ['JV_1.0', 'JV_2.0', 'JV_3.0'];
  const customerBackups = [];

  for (const ver of versions) {
    const config = CHIT_CONFIGS[ver] || {};
    const customers = await DB.getCustomers(ver, 'All');

    for (const c of customers) {
      const scheme = (config.schemes && config.schemes[c.schemeType]) ||
                     (config.schemes && Object.values(config.schemes)[0]) ||
                     { basePayable: parseInt(c.schemeType) || 1000 };

      let openingBalance = 0;
      const monthlyLedger = [];

      for (let m = 0; m <= monthInfo.chitMonthIdx; m++) {
        const mObj = (config.months && config.months[m]) || { name: `Month ${m + 1}` };
        const pay = c.payments && c.payments[m];
        const crAmount = (pay && pay.isPaid)
          ? ((scheme.monthlyPayable && scheme.monthlyPayable[m]) || scheme.basePayable || 1000)
          : 0;

        let drAmount = 0;
        if (c.withdrawal && c.withdrawal.isWithdrawn) {
          const wDate = c.withdrawal.withdrawDate;
          if (wDate) {
            const wParts = wDate.split('-');
            const wCalMonth = parseInt(wParts[1], 10);
            const wChitIdx = (wCalMonth - 10 + 12) % 12;
            if (wChitIdx === m) {
              drAmount = c.withdrawal.amount || (scheme.received ? scheme.received[0] : 0);
            }
          }
        }

        const netCurrent = crAmount - drAmount;
        const closingBalance = openingBalance + netCurrent;

        monthlyLedger.push({
          monthIndex: m,
          monthName: mObj.name || `Month ${m + 1}`,
          openingBalance,
          crAmount,
          drAmount,
          netCurrent,
          closingBalance
        });

        openingBalance = closingBalance;
      }

      customerBackups.push({
        customerId: c.shortCustomerId || c.mainCustomerId || c.id,
        mainCustomerId: c.mainCustomerId,
        name: c.name,
        referral: c.referral,
        mobile: c.mobile,
        version: ver,
        schemeType: c.schemeType,
        latestBalance: openingBalance,
        monthlyLedger
      });
    }
  }

  return {
    monthInfo,
    totalCustomers: customerBackups.length,
    customerBackups
  };
}

/**
 * Execute automatic monthly backup and email transmission.
 * Deduplicated via DB.isBackupSent check.
 */
async function processMonthlyBackupEmail(force = false) {
  const monthInfo = getCurrentChitFundMonthInfo();
  const recipient = process.env.BACKUP_EMAIL_RECIPIENT || process.env.ADMIN_EMAIL || 'admin-backup-placeholder@jvchitfund.com';

  if (!force) {
    const alreadySent = await DB.isBackupSent(monthInfo.monthKey);
    if (alreadySent) {
      console.log(`[MonthlyBackup] Backup email already processed for ${monthInfo.monthKey}. Skipping.`);
      return { success: true, skipped: true, message: `Backup already processed for ${monthInfo.monthKey}` };
    }
  }

  const report = await generatePersonWiseBackupData();
  console.log(`[MonthlyBackup] Compiled balance sheet backup for ${report.totalCustomers} customers (${monthInfo.monthName} ${monthInfo.year})`);

  let emailSentSuccess = false;

  // Transmit email if SMTP environment variables are configured
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });

      const bodyText = `JayanVijayan Chit Fund - Person-wise Balance Sheet Backup\n` +
        `Month: ${monthInfo.monthName} ${monthInfo.year} (${monthInfo.monthKey})\n` +
        `Total Customers: ${report.totalCustomers}\n\n` +
        JSON.stringify(report.customerBackups, null, 2);

      await transporter.sendMail({
        from: `"JV Chit Fund Backup" <${process.env.SMTP_USER}>`,
        to: recipient,
        subject: `[JV Chit Fund] Monthly Balance Sheet Backup - ${monthInfo.monthName} ${monthInfo.year}`,
        text: bodyText
      });

      emailSentSuccess = true;
      console.log(`[MonthlyBackup] Email sent successfully to ${recipient}`);
    } catch (err) {
      console.error('[MonthlyBackup] SMTP email sending failed:', err.message);
    }
  } else {
    console.warn(`[MonthlyBackup] SMTP environment variables (SMTP_HOST, SMTP_USER, SMTP_PASS) not configured.`);
    console.warn(`[MonthlyBackup] Configured backup email placeholder: '${recipient}'.`);
  }

  // Record log entry to prevent duplicate emails for this month
  await DB.recordBackupSent(monthInfo.monthKey, recipient, report.totalCustomers);

  return {
    success: true,
    monthKey: monthInfo.monthKey,
    monthName: monthInfo.monthName,
    recipient,
    customerCount: report.totalCustomers,
    emailSent: emailSentSuccess
  };
}

module.exports = {
  getCurrentChitFundMonthInfo,
  generatePersonWiseBackupData,
  processMonthlyBackupEmail
};
