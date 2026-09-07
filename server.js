const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const DB = require('./db');
const { CHIT_CONFIGS, CORE_REFERRALS, getSchemeMonthFromDate } = require('./chitConfig');
const { logLoginActivity } = require('./googleSheetLogger');

const PORT = process.env.PORT || 3000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.json': 'application/json'
};

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (e) {
        try {
          const params = new URLSearchParams(body);
          const obj = {};
          for (const [k, v] of params.entries()) obj[k] = v;
          resolve(obj);
        } catch (err) {
          resolve({});
        }
      }
    });
    req.on('error', reject);
  });
}

async function handleRequest(req, res) {
  // Ensure DB connection is initialized before processing request
  try {
    await DB.initDatabase();
  } catch (dbErr) {
    console.error('DB Connection error during request:', dbErr);
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end();
    return;
  }

  // API Routes
  if (pathname.startsWith('/api/')) {
    try {
      // 1. Get Chit Configurations
      if (pathname === '/api/config' && method === 'GET') {
        return sendJSON(res, 200, {
          success: true,
          configs: CHIT_CONFIGS,
          coreReferrals: CORE_REFERRALS
        });
      }

      // 2. Authentication (Admin / Customer Login)
      if (pathname === '/api/auth/login' && method === 'POST') {
        const body = await parseBody(req);
        const { username, password } = body;
        if (!username || !password) {
          return sendJSON(res, 400, { success: false, message: 'Username/Mobile and Password required' });
        }

        const user = await DB.authenticate(username, password);
        if (!user) {
          return sendJSON(res, 401, { success: false, message: 'Invalid credentials. Please check your username/password.' });
        }

        let customerData = null;
        if (user.role === 'customer' && user.customerId && user.version) {
          customerData = await DB.getCustomerById(user.version, user.customerId);
        }

        // Record successful login activity to Google Sheet
        logLoginActivity(req, user.username || username);

        return sendJSON(res, 200, {
          success: true,
          user,
          customer: customerData
        });
      }

      // Change Password
      if (pathname === '/api/auth/change-password' && method === 'POST') {
        const body = await parseBody(req);
        const { username, oldPassword, newPassword } = body;
        const result = await DB.changePassword(username, oldPassword, newPassword);
        return sendJSON(res, result.success ? 200 : 400, result);
      }


      // 3. Get Customers
      if (pathname === '/api/customers' && method === 'GET') {
        const version = parsedUrl.query.version || 'JV_3.0';
        const referral = parsedUrl.query.referral || null;
        const customers = await DB.getCustomers(version, referral);
        return sendJSON(res, 200, { success: true, customers });
      }

      // 4. Add Customer
      if (pathname === '/api/customers' && method === 'POST') {
        const body = await parseBody(req);
        const { name, mobile, referral, version, schemeType, password } = body;

        if (!name || !referral || !version || !schemeType) {
          return sendJSON(res, 400, { success: false, message: 'Missing required fields (name, referral, version, schemeType)' });
        }

        const newCustomer = await DB.addCustomer({
          name,
          mobile,
          referral,
          version,
          schemeType,
          password: password || '1234'
        });

        return sendJSON(res, 201, {
          success: true,
          message: 'Customer added successfully',
          customer: newCustomer
        });
      }

      // 5. Delete Customer
      if (pathname === '/api/customers' && method === 'DELETE') {
        const body = await parseBody(req);
        const { version, customerId } = body;
        if (!version || !customerId) {
          return sendJSON(res, 400, { success: false, message: 'Version and customerId required' });
        }
        await DB.deleteCustomer(version, customerId);
        return sendJSON(res, 200, { success: true, message: 'Customer deleted successfully' });
      }

      // 6. Update Month Payment
      if (pathname === '/api/payments/update' && method === 'POST') {
        const body = await parseBody(req);
        const { version, customerId, monthIndex, isPaid, paidDate } = body;

        if (!version || !customerId || monthIndex === undefined) {
          return sendJSON(res, 400, { success: false, message: 'Missing required fields' });
        }

        const updated = await DB.updatePayment(version, customerId, parseInt(monthIndex), isPaid, paidDate);
        if (!updated) {
          return sendJSON(res, 404, { success: false, message: 'Customer not found' });
        }

        return sendJSON(res, 200, { success: true, message: 'Payment updated', customer: updated });
      }

      // 7. Update Auction Withdrawal
      if (pathname === '/api/withdrawals/update' && method === 'POST') {
        const body = await parseBody(req);
        const { version, customerId, isWithdrawn, withdrawDate, disbursedBy, amount } = body;

        if (!version || !customerId) {
          return sendJSON(res, 400, { success: false, message: 'Missing required fields' });
        }

        const updated = await DB.updateWithdrawal(version, customerId, isWithdrawn, withdrawDate, disbursedBy, amount);
        if (!updated) {
          return sendJSON(res, 404, { success: false, message: 'Customer not found' });
        }

        return sendJSON(res, 200, { success: true, message: 'Withdrawal updated', customer: updated });
      }

      // 8. Financial Reports Analytics
      if (pathname === '/api/reports' && method === 'GET') {
        const version = parsedUrl.query.version || 'JV_3.0';
        const config = CHIT_CONFIGS[version] || CHIT_CONFIGS['JV_3.0'];
        const customers = await DB.getCustomers(version);

        const monthlyStats = config.months.map((mObj, mIdx) => {
          let totalCollection = 0;
          let referralSplit = {};
          CORE_REFERRALS.forEach(r => referralSplit[r] = 0);

          customers.forEach(c => {
            const scheme = config.schemes[c.schemeType] || Object.values(config.schemes)[0];
            (c.payments || []).forEach((payItem, payIdx) => {
              if (payItem && payItem.isPaid) {
                const colMonthIdx = payItem.paidDate ? getSchemeMonthFromDate(payItem.paidDate, version) : payIdx;
                const targetColIdx = (colMonthIdx !== null && colMonthIdx !== undefined) ? colMonthIdx : payIdx;

                if (targetColIdx === mIdx) {
                  const payable = (scheme.monthlyPayable && scheme.monthlyPayable[payIdx]) || scheme.basePayable;
                  totalCollection += payable;
                  if (referralSplit[c.referral] !== undefined) {
                    referralSplit[c.referral] += payable;
                  }
                }
              }
            });
          });

          return {
            monthIndex: mIdx,
            monthTa: mObj.ta,
            monthEn: mObj.en,
            totalCollection,
            referralSplit
          };
        });

        let totalWithdrawals = 0;
        let referralWithdrawals = {};
        CORE_REFERRALS.forEach(r => referralWithdrawals[r] = 0);

        customers.forEach(c => {
          if (c.withdrawal && c.withdrawal.isWithdrawn) {
            totalWithdrawals += 1;
            if (referralWithdrawals[c.referral] !== undefined) {
              referralWithdrawals[c.referral] += 1;
            }
          }
        });

        return sendJSON(res, 200, {
          success: true,
          version,
          monthlyStats,
          totalCustomers: customers.length,
          totalWithdrawals,
          referralWithdrawals
        });
      }

      // 9. Accounts & Balance Sheet API (with Carry Forward)
      if (pathname === '/api/accounts/summary' && method === 'GET') {
        const version = parsedUrl.query.version || 'JV_3.0';
        const monthIndex = parseInt(parsedUrl.query.monthIndex || '0');
        const summary = await DB.getAccountsSummary(version, monthIndex);
        return sendJSON(res, 200, { success: true, summary });
      }

      if (pathname === '/api/accounts/transfers' && method === 'POST') {
        const body = await parseBody(req);
        const { version, monthIndex, entryType, fromReferral, toReferral, otherRecipientName, otherSenderName, otherPartyName, amount, date, notes } = body;

        if (!version || monthIndex === undefined || !fromReferral || !toReferral || !amount) {
          return sendJSON(res, 400, { success: false, message: 'Missing required transfer fields' });
        }

        const transfer = await DB.recordTransfer({
          version,
          monthIndex,
          entryType,
          fromReferral,
          toReferral,
          otherRecipientName,
          otherSenderName,
          otherPartyName,
          amount,
          date,
          notes
        });

        return sendJSON(res, 201, { success: true, message: 'Fund entry recorded successfully', transfer });
      }

      if (pathname === '/api/accounts/partner-breakdown' && method === 'GET') {
        const partner = parsedUrl.query.partner || 'PLSSV';
        const version = parsedUrl.query.version || 'JV_1.0';
        const breakdown = await DB.getPartnerMonthlyBreakdown(partner, version);
        return sendJSON(res, 200, { success: true, breakdown });
      }

      if (pathname === '/api/accounts/master-balance-sheet' && method === 'GET') {
        const version = parsedUrl.query.version || 'Overall';
        const monthIndex = parseInt(parsedUrl.query.monthIndex || '0');
        const summary = await DB.getMasterAccountsSummary(version, monthIndex);
        return sendJSON(res, 200, { success: true, summary });
      }

      if (pathname === '/api/accounts/transfers' && method === 'DELETE') {
        const body = await parseBody(req);
        const { transferId } = body;
        if (!transferId) {
          return sendJSON(res, 400, { success: false, message: 'TransferId required' });
        }
        await DB.deleteTransfer(transferId);
        return sendJSON(res, 200, { success: true, message: 'Transfer deleted' });
      }

      if (pathname === '/api/accounts/disbursals' && method === 'POST') {
        const body = await parseBody(req);
        const { version, monthIndex, customerId, customerName, disbursedBy, amount, date, notes } = body;

        if (!version || monthIndex === undefined || !customerId || !disbursedBy || !amount) {
          return sendJSON(res, 400, { success: false, message: 'Missing required disbursal fields' });
        }

        const disbursal = await DB.recordDisbursal({
          version,
          monthIndex,
          customerId,
          customerName,
          disbursedBy,
          amount,
          date,
          notes
        });

        return sendJSON(res, 201, { success: true, message: 'Auction payout recorded', disbursal });
      }

      if (pathname === '/api/accounts/disbursals' && method === 'DELETE') {
        const body = await parseBody(req);
        const { disbursalId } = body;
        if (!disbursalId) {
          return sendJSON(res, 400, { success: false, message: 'DisbursalId required' });
        }
        await DB.deleteDisbursal(disbursalId);
        return sendJSON(res, 200, { success: true, message: 'Disbursal deleted' });
      }

      // 10. Master Admin Supervisory Analytics Endpoints
      if (pathname === '/api/master/partner-analytics' && method === 'GET') {
        const referral = parsedUrl.query.referral || 'PLSSV';
        const targetVersion = parsedUrl.query.version || null;
        const analytics = await DB.getMasterPartnerAnalytics(referral, targetVersion);
        return sendJSON(res, 200, { success: true, analytics });
      }

      if (pathname === '/api/master/consolidated-summary' && method === 'GET') {
        const targetVersion = parsedUrl.query.version || null;
        const summary = await DB.getMasterConsolidatedSummary(targetVersion);
        return sendJSON(res, 200, { success: true, summary });
      }

      return sendJSON(res, 404, { success: false, message: 'API endpoint not found' });
    } catch (err) {
      console.error('API Error:', err);
      return sendJSON(res, 500, { success: false, message: 'Internal server error', error: err.message });
    }
  }

  // Static File Serving (fallback for Vercel / local development)
  let safePath = pathname || '/';
  if (safePath === '/' || safePath === '') safePath = '/index.html';

  if (safePath.startsWith('/assets/')) {
    safePath = safePath.replace('/assets/', '/assests/');
  }

  let decodedPath = safePath;
  try {
    decodedPath = decodeURIComponent(safePath);
  } catch (e) {
    decodedPath = safePath;
  }

  const filePath = path.join(__dirname, decodedPath);

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
}

const server = http.createServer(handleRequest);

if (require.main === module) {
  async function startServer() {
    try {
      console.log('Initializing database connection...');
      await DB.initDatabase();
      server.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`🚀 JayanVijayan Chit Fund System is running!`);
        console.log(`🍃 Connected to MongoDB Atlas Cluster`);
        console.log(`🌐 Local Web URL: http://localhost:${PORT}`);
        console.log(`====================================================`);
      });
    } catch (err) {
      console.error('Failed to start server:', err);
      process.exit(1);
    }
  }
  startServer();
}

module.exports = handleRequest;
