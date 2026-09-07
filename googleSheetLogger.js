const crypto = require('crypto');
const https = require('https');
const http = require('http');

// =========================================================================
// GOOGLE SHEET LOGIN ACTIVITY LOG CONFIGURATION
// 
// Configured Google Sheet URL:
// https://docs.google.com/spreadsheets/d/1BVGVfttDPRuquhOFIZnl3G2HVJfEaEsfgI28Ak6iVVw/edit?usp=sharing
// 
// Google Sheet ID:
// 1BVGVfttDPRuquhOFIZnl3G2HVJfEaEsfgI28Ak6iVVw
// =========================================================================

const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL || "https://docs.google.com/spreadsheets/d/1BVGVfttDPRuquhOFIZnl3G2HVJfEaEsfgI28Ak6iVVw/edit?usp=sharing";
const GOOGLE_SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID || extractSpreadsheetId(GOOGLE_SHEET_URL) || "1BVGVfttDPRuquhOFIZnl3G2HVJfEaEsfgI28Ak6iVVw";

/**
 * Extract Spreadsheet ID from Google Sheet URL
 */
function extractSpreadsheetId(urlStr) {
  if (!urlStr) return null;
  const match = urlStr.match(/\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

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
 * Generate Google OAuth2 Access Token from Service Account credentials using native Node crypto
 */
async function getGoogleServiceAccountToken(clientEmail, privateKey) {
  try {
    const formattedKey = privateKey.replace(/\\n/g, '\n');
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const claimSet = Buffer.from(JSON.stringify({
      iss: clientEmail,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now
    })).toString('base64url');

    const unsignedToken = `${header}.${claimSet}`;
    const signer = crypto.createSign('RSA-SHA256');
    signer.update(unsignedToken);
    const signature = signer.sign(formattedKey, 'base64url');
    const jwt = `${unsignedToken}.${signature}`;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: jwt
      })
    });

    const tokenData = await res.json();
    return tokenData.access_token || null;
  } catch (e) {
    console.error('[GoogleSheetLogger] Service account token generation error:', e.message);
    return null;
  }
}

/**
 * Append row using Google Sheets API v4
 */
async function appendViaSheetsApi(spreadsheetId, token, apiKey, rowValues) {
  let url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`;
  const headers = { 'Content-Type': 'application/json' };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  } else if (apiKey) {
    url += `&key=${apiKey}`;
  } else {
    return false;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        range: 'A1',
        majorDimension: 'ROWS',
        values: [rowValues]
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    console.log(`[GoogleSheetLogger] Google Sheets API append status: ${res.status}`);
    return res.status === 200;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[GoogleSheetLogger] Sheets API append error:', err.message);
    return false;
  }
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
    const rowValues = [date, time, logUser, ipAddress];

    const payload = {
      date,
      time,
      username: logUser,
      ipAddress
    };

    console.log(`[GoogleSheetLogger] Recording login: ${date} ${time} | User: ${logUser} | IP: ${ipAddress}`);

    const targetUrl = process.env.GOOGLE_SCRIPT_WEBHOOK_URL || GOOGLE_SHEET_URL;
    const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || process.env.GOOGLE_CLIENT_EMAIL;
    const privateKey = process.env.GOOGLE_PRIVATE_KEY;
    const apiKey = process.env.GOOGLE_API_KEY;

    // Method 1: Google Service Account / API Key authentication if configured in backend environment
    if (clientEmail && privateKey) {
      console.log('[GoogleSheetLogger] Attempting append via Service Account credentials...');
      const token = await getGoogleServiceAccountToken(clientEmail, privateKey);
      if (token) {
        const success = await appendViaSheetsApi(GOOGLE_SPREADSHEET_ID, token, null, rowValues);
        if (success) return payload;
      }
    } else if (apiKey) {
      console.log('[GoogleSheetLogger] Attempting append via Google API Key...');
      const success = await appendViaSheetsApi(GOOGLE_SPREADSHEET_ID, null, apiKey, rowValues);
      if (success) return payload;
    }

    // Method 2: Apps Script Web App / Webhook URL posting
    if (targetUrl && (targetUrl.includes('script.google.com') || targetUrl.includes('formResponse') || targetUrl.includes('webhook'))) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      try {
        const res = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          redirect: 'follow',
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        console.log(`[GoogleSheetLogger] Webhook response status: ${res.status}`);
        return payload;
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        console.error('[GoogleSheetLogger] Fetch error transmitting to Google Sheet:', fetchErr.message);
      }
    }

    // Direct edit URL warning and fallback diagnostic info
    if (targetUrl && targetUrl.includes('docs.google.com/spreadsheets')) {
      console.warn(`[GoogleSheetLogger] Target URL is direct sheet edit link: ${targetUrl}`);
      console.warn(`[GoogleSheetLogger] Diagnostic Note: Google Sheet ID is '${GOOGLE_SPREADSHEET_ID}'. Direct HTTP POST to spreadsheet edit view returns 405. Ensure Google Service Account credentials (GOOGLE_SERVICE_ACCOUNT_EMAIL & GOOGLE_PRIVATE_KEY) are set in environment variables OR Apps Script Web App URL (https://script.google.com/macros/s/.../exec) is set in GOOGLE_SHEET_URL.`);
    }

    return payload;
  } catch (err) {
    console.error('[GoogleSheetLogger] Error creating login activity record:', err);
  }
}

module.exports = {
  GOOGLE_SHEET_URL,
  GOOGLE_SPREADSHEET_ID,
  logLoginActivity,
  getClientIp,
  getFormattedDateTime
};
