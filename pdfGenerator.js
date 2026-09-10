const PDFDocument = require('pdfkit');

/**
 * Generate a customer balance sheet PDF as a Buffer using pdfkit.
 * 
 * @param {Object} personData Data object containing person name, monthInfo, summary, and customer list/ledger.
 * @returns {Promise<Buffer>} Buffer containing PDF binary data.
 */
function generateCustomerBalanceSheetPDF(personData) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const buffers = [];

      doc.on('data', chunk => buffers.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(buffers)));
      doc.on('error', err => reject(err));

      const { name, email, monthInfo, accounts = [], ledger = [] } = personData;

      // Color Palette
      const PRIMARY_COLOR = '#1e3a8a';   // Deep Blue
      const ACCENT_COLOR = '#047857';    // Emerald Green
      const DARK_TEXT = '#1f2937';       // Slate Dark
      const LIGHT_BG = '#f3f4f6';        // Light Gray
      const BORDER_COLOR = '#e5e7eb';    // Border Gray

      // Header Banner Background
      doc.rect(0, 0, doc.page.width, 100).fill(PRIMARY_COLOR);

      // Header Text
      doc.fillColor('#ffffff')
         .fontSize(22)
         .font('Helvetica-Bold')
         .text('JV CHIT FUND', 40, 25);

      doc.fontSize(11)
         .font('Helvetica')
         .text('Save Monthly, Grow Yearly | Monthly Balance Sheet', 40, 52);

      doc.fontSize(10)
         .font('Helvetica-Oblique')
         .text(`Cycle Month: ${monthInfo ? monthInfo.monthName : ''} ${monthInfo ? monthInfo.year : ''}`, 40, 68);

      // Reset text position
      let yPos = 120;

      // Customer Info Card
      doc.rect(40, yPos, doc.page.width - 80, 55)
         .fillAndStroke(LIGHT_BG, BORDER_COLOR);

      doc.fillColor(DARK_TEXT)
         .fontSize(12)
         .font('Helvetica-Bold')
         .text(`Customer / Partner: ${name}`, 55, yPos + 12);

      doc.fontSize(10)
         .font('Helvetica')
         .text(`Email: ${email || 'Not Configured'}`, 55, yPos + 30)
         .text(`Generated Date: ${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 320, yPos + 30);

      yPos += 75;

      // Financial Summary Title
      doc.fillColor(PRIMARY_COLOR)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('Monthly Balance Summary', 40, yPos);

      yPos += 20;

      // Calculate totals for person's accounts
      let totalCR = 0;
      let totalDR = 0;
      let netBalance = 0;

      accounts.forEach(acc => {
        const latest = acc.latestBalance || 0;
        netBalance += latest;
        (acc.monthlyLedger || []).forEach(m => {
          totalCR += (m.crAmount || 0);
          totalDR += (m.drAmount || 0);
        });
      });

      // Summary KPI Grid
      const kpiWidth = (doc.page.width - 80 - 20) / 3;
      
      // Box 1: Total Credits
      doc.rect(40, yPos, kpiWidth, 45).fillAndStroke('#ecfdf5', '#a7f3d0');
      doc.fillColor(ACCENT_COLOR).fontSize(9).font('Helvetica-Bold').text('TOTAL COLLECTIONS (CR)', 50, yPos + 8);
      doc.fillColor(DARK_TEXT).fontSize(14).font('Helvetica-Bold').text(`Rs. ${totalCR.toLocaleString('en-IN')}`, 50, yPos + 22);

      // Box 2: Total Debits
      doc.rect(40 + kpiWidth + 10, yPos, kpiWidth, 45).fillAndStroke('#fef2f2', '#fecaca');
      doc.fillColor('#b91c1c').fontSize(9).font('Helvetica-Bold').text('TOTAL WITHDRAWALS (DR)', 50 + kpiWidth + 10, yPos + 8);
      doc.fillColor(DARK_TEXT).fontSize(14).font('Helvetica-Bold').text(`Rs. ${totalDR.toLocaleString('en-IN')}`, 50 + kpiWidth + 10, yPos + 22);

      // Box 3: Net Balance
      doc.rect(40 + (kpiWidth + 10) * 2, yPos, kpiWidth, 45).fillAndStroke('#eff6ff', '#bfdbfe');
      doc.fillColor(PRIMARY_COLOR).fontSize(9).font('Helvetica-Bold').text('NET CLOSING BALANCE', 50 + (kpiWidth + 10) * 2, yPos + 8);
      doc.fillColor(DARK_TEXT).fontSize(14).font('Helvetica-Bold').text(`Rs. ${netBalance.toLocaleString('en-IN')}`, 50 + (kpiWidth + 10) * 2, yPos + 22);

      yPos += 60;

      // Customer Accounts Breakdown Table Title
      doc.fillColor(PRIMARY_COLOR)
         .fontSize(14)
         .font('Helvetica-Bold')
         .text('Account Details Breakdown', 40, yPos);

      yPos += 20;

      // Table Headers
      const colWidths = [70, 110, 80, 80, 80, 95];
      const headers = ['Cust ID', 'Name', 'Version', 'Scheme', 'Paid (CR)', 'Closing Bal'];
      
      doc.rect(40, yPos, doc.page.width - 80, 20).fill(PRIMARY_COLOR);
      
      let xOffset = 45;
      doc.fillColor('#ffffff').fontSize(9).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.text(h, xOffset, yPos + 5, { width: colWidths[i], align: i >= 4 ? 'right' : 'left' });
        xOffset += colWidths[i];
      });

      yPos += 20;

      // Table Rows
      doc.font('Helvetica').fontSize(9);
      if (accounts.length === 0) {
        doc.rect(40, yPos, doc.page.width - 80, 20).stroke(BORDER_COLOR);
        doc.fillColor(DARK_TEXT).text('No customer account records found.', 45, yPos + 5);
        yPos += 20;
      } else {
        accounts.forEach((acc, idx) => {
          if (yPos > doc.page.height - 80) {
            doc.addPage();
            yPos = 40;
          }

          const bgColor = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
          doc.rect(40, yPos, doc.page.width - 80, 20).fillAndStroke(bgColor, BORDER_COLOR);

          let rowX = 45;
          doc.fillColor(DARK_TEXT);
          
          doc.text(acc.customerId || '-', rowX, yPos + 5, { width: colWidths[0] });
          rowX += colWidths[0];

          doc.text(acc.name || '-', rowX, yPos + 5, { width: colWidths[1] });
          rowX += colWidths[1];

          doc.text(acc.version || '-', rowX, yPos + 5, { width: colWidths[2] });
          rowX += colWidths[2];

          doc.text(`Rs. ${acc.schemeType}`, rowX, yPos + 5, { width: colWidths[3] });
          rowX += colWidths[3];

          // Compute total paid for this account
          const totalPaid = (acc.monthlyLedger || []).reduce((sum, m) => sum + (m.crAmount || 0), 0);
          doc.text(`Rs. ${totalPaid.toLocaleString('en-IN')}`, rowX, yPos + 5, { width: colWidths[4], align: 'right' });
          rowX += colWidths[4];

          doc.text(`Rs. ${(acc.latestBalance || 0).toLocaleString('en-IN')}`, rowX, yPos + 5, { width: colWidths[5], align: 'right' });
          
          yPos += 20;
        });
      }

      yPos += 30;

      // Footer notice
      if (yPos > doc.page.height - 60) {
        doc.addPage();
        yPos = doc.page.height - 60;
      }

      doc.rect(40, yPos, doc.page.width - 80, 1).fill('#cbd5e1');
      doc.fillColor('#64748b')
         .fontSize(8)
         .font('Helvetica')
         .text('Confidential — JV Chit Fund Automated Monthly Backup Report.', 40, yPos + 10, { align: 'center' })
         .text('Building Trust, Creating Wealth | Thank you for being a valued customer.', 40, yPos + 22, { align: 'center' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateCustomerBalanceSheetPDF
};
