const DB = require('./db');
const { CHIT_CONFIGS, CORE_REFERRALS } = require('./chitConfig');
const { getCustomerEmail, CUSTOMER_EMAIL_MAP } = require('./customerEmailConfig');
const { generateCustomerBalanceSheetPDF } = require('./pdfGenerator');

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
 * Generates individual balance sheet PDFs per customer and sends separate emails ONLY
 * to customers with a configured email address.
 */
async function processMonthlyBackupEmail(force = false) {
  const monthInfo = getCurrentChitFundMonthInfo();

  if (!force) {
    const alreadySent = await DB.isBackupSent(monthInfo.monthKey);
    if (alreadySent) {
      console.log(`[MonthlyBackup] Backup email already processed for ${monthInfo.monthKey}. Skipping.`);
      return { success: true, skipped: true, message: `Backup already processed for ${monthInfo.monthKey}` };
    }
  }

  const report = await generatePersonWiseBackupData();
  console.log(`[MonthlyBackup] Compiled balance sheet backup for ${report.totalCustomers} customers (${monthInfo.monthName} ${monthInfo.year})`);

  const results = [];
  const senderEmail = process.env.SMTP_FROM || process.env.SMTP_USER || 'jvchitfund@gmail.com';

  // Setup nodemailer transporter if SMTP credentials exist
  let transporter = null;
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  // Identify all unique persons/customers
  const allPersonKeys = Array.from(new Set([
    ...CORE_REFERRALS,
    ...Object.keys(CUSTOMER_EMAIL_MAP)
  ]));

  for (const personKey of allPersonKeys) {
    const toEmail = getCustomerEmail(personKey);

    // Filter customer account records for this specific person/referral only
    const personAccounts = report.customerBackups.filter(c => 
      c.referral === personKey || 
      c.name === personKey || 
      (c.name && c.name.toLowerCase().includes(personKey.toLowerCase()))
    );

    if (!toEmail) {
      console.log(`[MonthlyBackup] Customer '${personKey}' has no configured email address. Backup generated; email skipped.`);
      results.push({ person: personKey, emailSent: false, reason: 'No email configured' });
      continue;
    }

    try {
      // 1. Generate individual balance sheet PDF for this customer ONLY
      const pdfBuffer = await generateCustomerBalanceSheetPDF({
        name: personKey,
        email: toEmail,
        monthInfo,
        accounts: personAccounts
      });

      const pdfFilename = `${personKey}_Balance_Sheet_${monthInfo.monthName}_${monthInfo.year}.pdf`;
      const subject = `JV Chit Fund - Monthly Balance Sheet - ${personKey} - ${monthInfo.monthName} ${monthInfo.year}`;
      const bodyText = `Dear ${personKey},\n\n` +
        `Please find attached your individual monthly balance sheet report for ${monthInfo.monthName} ${monthInfo.year}.\n\n` +
        `Summary Details:\n` +
        `- Month: ${monthInfo.monthName} ${monthInfo.year} (${monthInfo.monthKey})\n` +
        `- Customer / Partner Name: ${personKey}\n` +
        `- Total Subscriptions/Accounts: ${personAccounts.length}\n\n` +
        `This is an automated confidential backup email containing ONLY your balance sheet.\n\n` +
        `Best regards,\n` +
        `JV Chit Fund Management\n` +
        `jvchitfund@gmail.com`;

      if (transporter) {
        await transporter.sendMail({
          from: `"JV Chit Fund" <${senderEmail}>`,
          to: toEmail,
          subject: subject,
          text: bodyText,
          attachments: [
            {
              filename: pdfFilename,
              content: pdfBuffer,
              contentType: 'application/pdf'
            }
          ]
        });
        console.log(`[MonthlyBackup] Successfully sent separate balance sheet PDF email to ${personKey} <${toEmail}>`);
        results.push({ person: personKey, email: toEmail, pdfFilename, pdfSize: pdfBuffer.length, emailSent: true });
      } else {
        console.warn(`[MonthlyBackup] SMTP credentials not set. Compiled PDF (${pdfFilename}, ${pdfBuffer.length} bytes) for ${personKey} <${toEmail}> but skipped sending.`);
        results.push({ person: personKey, email: toEmail, pdfFilename, pdfSize: pdfBuffer.length, emailSent: false, reason: 'SMTP credentials not configured' });
      }
    } catch (err) {
      console.error(`[MonthlyBackup] Failed to send balance sheet email to ${personKey} <${toEmail}>:`, err.message);
      results.push({ person: personKey, email: toEmail, emailSent: false, error: err.message });
    }
  }

  // Record log entry
  const sentCount = results.filter(r => r.emailSent).length;
  const recipientSummary = results.map(r => `${r.person}:${r.email || 'N/A'}`).join(', ');
  await DB.recordBackupSent(monthInfo.monthKey, recipientSummary, report.totalCustomers);

  return {
    success: true,
    monthKey: monthInfo.monthKey,
    monthName: monthInfo.monthName,
    results,
    totalCustomers: report.totalCustomers,
    sentCount
  };
}

/**
 * Execute temporary DAILY TEST backup email transmission.
 * Runs on a daily schedule solely for testing email delivery.
 * Keeps production monthly backup logic completely intact.
 */
async function processDailyTestBackupEmail(force = true) {
  const { ENABLE_DAILY_TEST_SCHEDULE } = require('./customerEmailConfig');
  if (!ENABLE_DAILY_TEST_SCHEDULE && !force) {
    console.log('[DailyTestBackup] Daily test schedule is disabled in config. Skipping.');
    return { success: false, disabled: true, message: 'Daily test schedule disabled in config' };
  }

  console.log('[DailyTestBackup] Initiating daily test email transmission...');
  return processMonthlyBackupEmail(true);
}

module.exports = {
  getCurrentChitFundMonthInfo,
  generatePersonWiseBackupData,
  processMonthlyBackupEmail,
  processDailyTestBackupEmail
};

