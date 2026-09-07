const https = require('https');
const http = require('http');

// =========================================================================
// GOOGLE SHEET LOGIN ACTIVITY LOG CONFIGURATION
// Place your Google Sheet / Google Apps Script Web App URL here or via GOOGLE_SHEET_URL env variable.
// Example: "https://docs.google.com/spreadsheets/d/XXXXXXXXXXXX/edit"
// Or Apps Script Web App: "https://script.google.com/macros/s/XXXXXXXXXXXXXXXX/exec"
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
 * 
 * Never blocks the login request or throws errors back to the caller.
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
