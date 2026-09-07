const https = require('https');
const http = require('http');

// =========================================================================
// GOOGLE SHEET LOGIN ACTIVITY LOG CONFIGURATION
// 
// IMPORTANT: Direct spreadsheet links (https://docs.google.com/spreadsheets/d/.../edit)
// do not accept direct HTTP POST requests from external servers.
// 
// To send rows to your Google Sheet:
// 1. Open your Google Sheet -> Extensions -> Apps Script
// 2. Paste the following script:
// 
//    function doPost(e) {
//      var data = JSON.parse(e.postData.contents);
//      var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
//      sheet.appendRow([data.date, data.time, data.username, data.ipAddress]);
//      return ContentService.createTextOutput("Success");
//    }
// 
// 3. Click Deploy -> New deployment -> Select 'Web app'
// 4. Set 'Execute as': 'Me' & 'Who has access': 'Anyone'
// 5. Copy the generated Web App URL (https://script.google.com/macros/s/.../exec)
// 6. Paste the Web App URL below or set process.env.GOOGLE_SHEET_URL
// =========================================================================

const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL || "https://docs.google.com/spreadsheets/d/1BVGVfttDPRuquhOFIZnl3G2HVJfEaEsfgI28Ak6iVVw/edit?usp=sharing";

/**
 * Extract client IP address from proxy headers (Vercel, Cloudflare, Nginx) or socket
 */
function getClientIp(req) {
  if (!req) return '0.0.0.0';
  
  const forwarded = req.headers ? req.headers['x-forwarded-for'] : null;
  if (forwarded) {
    const ips = String(forwarded).split(',').map(ip => ip.trim());
    if (ips[0]) return ips[0];
  }
  if (req.headers && req.headers['x-real-ip']) {
    return String(req.headers['x-real-ip']).trim();
  }
  if (req.headers && req.headers['cf-connecting-ip']) {
    return String(req.headers['cf-connecting-ip']).trim();
  }
  const remoteAddr = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  if (remoteAddr === '::1' || remoteAddr === '127.0.0.1' || remoteAddr === '::ffff:127.0.0.1') {
    return '127.0.0.1';
  }
  return remoteAddr.replace(/^::ffff:/, '');
}

/**
 * Format current date and time strictly as:
 * Date: DD-MM-YYYY (e.g. 07-09-2026)
 * Time: hh:mm:ss AM/PM (e.g. 10:30:25 AM)
 */
function getFormattedDateTime(dateObj = new Date()) {
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const year = dateObj.getFullYear();
  const dateStr = `${day}-${month}-${year}`;

  let hours = dateObj.getHours();
  const minutes = String(dateObj.getMinutes()).padStart(2, '0');
  const seconds = String(dateObj.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  const hoursStr = String(hours).padStart(2, '0');
  const timeStr = `${hoursStr}:${minutes}:${seconds} ${ampm}`;

  return { date: dateStr, time: timeStr };
}

/**
 * Log successful login event to Google Sheet.
 * Columns recorded: Date | Time | Username | IP Address
 */
async function logLoginActivity(req, username) {
  try {
    const { date, time } = getFormattedDateTime(new Date());
    const ipAddress = getClientIp(req);
    const logUser = (username || 'UNKNOWN').trim();

    const payload = {
      date,
      time,
      username: logUser,
      ipAddress
    };

    console.log(`[GoogleSheetLogger] Recording login: ${date} ${time} | User: ${logUser} | IP: ${ipAddress}`);

    const targetUrl = process.env.GOOGLE_SCRIPT_WEBHOOK_URL || GOOGLE_SHEET_URL;

    if (!targetUrl || targetUrl.includes('XXXXXXXXXXXX')) {
      console.log('[GoogleSheetLogger] Note: GOOGLE_SHEET_URL is set to placeholder.');
      return payload;
    }

    if (targetUrl.includes('docs.google.com/spreadsheets')) {
      console.warn('[GoogleSheetLogger] WARNING: GOOGLE_SHEET_URL is a direct spreadsheet view/edit link (docs.google.com/spreadsheets). Direct POST requests to edit links return 405 error. Please create a Google Apps Script Web App (Extensions -> Apps Script) and paste the Web App Webhook URL (https://script.google.com/macros/s/.../exec) into GOOGLE_SHEET_URL.');
    }

    // Perform non-blocking asynchronous POST request using global fetch
    if (typeof fetch === 'function') {
      fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'follow'
      }).then(res => {
        console.log(`[GoogleSheetLogger] Sheet response status: ${res.status}`);
      }).catch(err => {
        console.error('[GoogleSheetLogger] Failed to transmit login log to Google Sheet:', err.message);
      });
    }

    return payload;
  } catch (err) {
    console.error('[GoogleSheetLogger] Error creating login activity record:', err);
  }
}

module.exports = {
  GOOGLE_SHEET_URL,
  logLoginActivity,
  getClientIp,
  getFormattedDateTime
};
