const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const dns = require('dns');
const mongoose = require('mongoose');

// Configure custom DNS resolvers for Windows SRV record resolution
try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch (e) {
  console.log('DNS config warning:', e.message);
}

const { CHIT_CONFIGS, CORE_REFERRALS, getSchemeMonthFromDate } = require('./chitConfig');

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://jvchitfund_db_user:CWmlSuUW9pofTrrn@cluster0.ju4gflm.mongodb.net/jvchitfund?retryWrites=true&w=majority';
const DATA_DIR = path.join(__dirname, 'data');

const FILES = {
  users: path.join(DATA_DIR, 'master_users.json'),
  'JV_1.0': path.join(DATA_DIR, 'jv_1_customers.json'),
  'JV_2.0': path.join(DATA_DIR, 'jv_2_customers.json'),
  'JV_3.0': path.join(DATA_DIR, 'jv_3_customers.json'),
  accounts: path.join(DATA_DIR, 'jv_accounts.json')
};

// ==========================================
// MONGOOSE SCHEMAS & MODELS
// ==========================================
const UserSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  mobile: { type: String, default: '' },
  name: { type: String, default: '' },
  role: { type: String, default: 'customer' },
  referral: { type: String, default: '' },
  version: { type: String, default: '' },
  schemeType: { type: String, default: '' },
  customerId: { type: String, default: null },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
}, { timestamps: true });

const CustomerSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  mainCustomerId: { type: String, default: null },
  shortCustomerId: { type: String, default: null },
  seqNo: { type: Number, default: 0 },
  password: { type: String, default: '1234' },
  sno: { type: Number, default: 0 },
  name: { type: String, required: true },
  mobile: { type: String, default: '' },
  referral: { type: String, required: true },
  version: { type: String, required: true },
  schemeType: { type: String, required: true },
  payments: { type: mongoose.Schema.Types.Mixed, default: [] },
  withdrawal: {
    isWithdrawn: { type: Boolean, default: false },
    withdrawDate: { type: String, default: null },
    disbursedBy: { type: String, default: null },
    amount: { type: Number, default: 0 }
  },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });

const TransferSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  version: { type: String, required: true },
  monthIndex: { type: Number, required: true },
  entryType: { type: String, default: 'DR' },
  fromReferral: { type: String, default: '' },
  toReferral: { type: String, default: '' },
  isOutside: { type: Boolean, default: false },
  otherPartyName: { type: String, default: null },
  otherRecipientName: { type: String, default: null },
  otherSenderName: { type: String, default: null },
  amount: { type: Number, default: 0 },
  date: { type: String, default: '' },
  notes: { type: String, default: '' },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });

const DisbursalSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  version: { type: String, required: true },
  monthIndex: { type: Number, required: true },
  customerId: { type: String, required: true },
  customerName: { type: String, default: '' },
  disbursedBy: { type: String, required: true },
  amount: { type: Number, default: 0 },
  date: { type: String, default: '' },
  notes: { type: String, default: '' },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, { timestamps: true });

const User = mongoose.model('User', UserSchema);
const Customer = mongoose.model('Customer', CustomerSchema);
const Transfer = mongoose.model('Transfer', TransferSchema);
const Disbursal = mongoose.model('Disbursal', DisbursalSchema);

// Simple secure hash
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function readJSONFile(file, defaultData = []) {
  try {
    if (!fs.existsSync(file)) return defaultData;
    let content = fs.readFileSync(file, 'utf-8');
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }
    return JSON.parse(content.trim() || '[]');
  } catch (e) {
    console.error(`Error reading ${file}:`, e);
    return defaultData;
  }
}

function generateCustomerIDs(version, schemeType, seqNo, dateInput = null) {
  const verStr = String(version || 'JV_1.0');
  const parts = verStr.split('_');
  const verNum = parts[1] ? parts[1].split('.')[0] : '1';

  let schemeNum = 1;
  const cfg = CHIT_CONFIGS[verStr];
  if (cfg && cfg.schemes) {
    const keys = Object.keys(cfg.schemes);
    const idx = keys.indexOf(String(schemeType));
    if (idx !== -1) {
      schemeNum = idx + 1;
    }
  } else {
    if (String(schemeType) === '2500') schemeNum = 2;
    else if (String(schemeType) === '5000') schemeNum = 3;
  }

  const year = dateInput ? new Date(dateInput).getFullYear() : new Date().getFullYear();
  const seqPadded = String(seqNo || 1).padStart(3, '0');

  const mainCustomerId = `${verNum}JV${schemeNum}${year}${seqPadded}`;
  const shortCustomerId = `JV${seqPadded}`;
  return { mainCustomerId, shortCustomerId };
}

// Connect to MongoDB Atlas & Migrate JSON data if collections are empty
async function initDatabase() {
  try {
    if (mongoose.connection.readyState === 0) {
      console.log('Connecting to MongoDB Atlas...');
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 15000
      });
      console.log('Connected to MongoDB Atlas!');
    }

    // 1. Migrate / Seed Admin & Users
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('Seeding users into MongoDB...');
      let jsonUsers = readJSONFile(FILES.users, []);
      if (!jsonUsers || jsonUsers.length === 0) {
        jsonUsers = [
          { id: 'adm_1', username: 'PLSSV', name: 'PLSSV (Partner Admin)', role: 'admin', referral: 'PLSSV', mobile: '6384625665', passwordHash: hashPassword('1234') },
          { id: 'adm_2', username: 'Arun', name: 'Arun (Partner Admin)', role: 'admin', referral: 'Arun', mobile: '9488517403', passwordHash: hashPassword('1234') },
          { id: 'adm_3', username: 'Varatha', name: 'Varatha (Partner Admin)', role: 'admin', referral: 'Varatha', mobile: '7092202771', passwordHash: hashPassword('1234') },
          { id: 'adm_4', username: 'Ramana', name: 'Ramana (Partner Admin)', role: 'admin', referral: 'Ramana', mobile: '6369999091', passwordHash: hashPassword('1234') },
          { id: 'adm_5', username: 'Vicky', name: 'Vicky (Partner Admin)', role: 'admin', referral: 'Vicky', mobile: '9025445125', passwordHash: hashPassword('1234') },
          { id: 'adm_6', username: 'admin', name: 'Master Admin', role: 'admin', referral: 'All', mobile: '', passwordHash: hashPassword('admin123') }
        ];
      }
      for (const u of jsonUsers) {
        await User.updateOne({ id: u.id }, { $set: u }, { upsert: true });
      }
      console.log('Users seeded successfully!');
    }

    // Update partner admin mobile numbers in MongoDB
    const adminMobiles = {
      'PLSSV': '6384625665',
      'Arun': '9488517403',
      'Varatha': '7092202771',
      'Ramana': '6369999091',
      'Vicky': '9025445125'
    };
    for (const [username, mobile] of Object.entries(adminMobiles)) {
      await User.updateOne(
        { username, role: 'admin' },
        { $set: { mobile } }
      );
    }

    // 2. Migrate Customers
    const customerCount = await Customer.countDocuments();
    if (customerCount === 0) {
      console.log('Seeding customers into MongoDB...');
      for (const ver of ['JV_1.0', 'JV_2.0', 'JV_3.0']) {
        const jsonCusts = readJSONFile(FILES[ver], []);
        for (const c of jsonCusts) {
          if (!c.version) c.version = ver;
          await Customer.updateOne({ id: c.id }, { $set: c }, { upsert: true });
        }
      }
      console.log('Customers seeded successfully!');
    }

    // Safely backfill missing customer IDs / password / seqNo for existing records
    const existingCusts = await Customer.find({}).sort({ createdAt: 1, sno: 1 });
    let currentSeq = 1;
    for (const c of existingCusts) {
      let needsUpdate = false;
      const updates = {};

      if (!c.seqNo || c.seqNo === 0) {
        updates.seqNo = currentSeq;
        needsUpdate = true;
      } else {
        currentSeq = Math.max(currentSeq, c.seqNo);
      }

      if (!c.password) {
        updates.password = '1234';
        needsUpdate = true;
      }

      if (!c.mainCustomerId || !c.shortCustomerId || c.mainCustomerId.startsWith('10JV') || c.mainCustomerId.startsWith('20JV') || c.mainCustomerId.startsWith('30JV')) {
        const targetSeq = updates.seqNo || c.seqNo || currentSeq;
        const ids = generateCustomerIDs(c.version, c.schemeType, targetSeq, c.createdAt);
        updates.mainCustomerId = ids.mainCustomerId;
        updates.shortCustomerId = ids.shortCustomerId;
        needsUpdate = true;
      }

      if (needsUpdate) {
        await Customer.updateOne({ _id: c._id }, { $set: updates });
      }
      currentSeq++;
    }

    // 3. Migrate Accounts (Transfers & Disbursals)
    const transferCount = await Transfer.countDocuments();
    const disbursalCount = await Disbursal.countDocuments();
    if (transferCount === 0 && disbursalCount === 0) {
      console.log('Seeding accounts transfers and disbursals into MongoDB...');
      const accountsObj = readJSONFile(FILES.accounts, { transfers: [], disbursals: [] });
      if (accountsObj.transfers && accountsObj.transfers.length > 0) {
        for (const t of accountsObj.transfers) {
          await Transfer.updateOne({ id: t.id }, { $set: t }, { upsert: true });
        }
      }
      if (accountsObj.disbursals && accountsObj.disbursals.length > 0) {
        for (const d of accountsObj.disbursals) {
          await Disbursal.updateOne({ id: d.id }, { $set: d }, { upsert: true });
        }
      }
      console.log('Accounts data seeded successfully!');
    }
  } catch (err) {
    console.error('Failed to initialize MongoDB connection or migration:', err);
    throw err;
  }
}

const DB = {
  initDatabase,

  // Authentication
  async authenticate(username, password) {
    const inputHash = hashPassword(password);
    const trimmedUsername = (username || '').trim();
    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${trimmedUsername}$`, 'i') } },
        { mobile: trimmedUsername }
      ],
      passwordHash: inputHash
    }).lean();

    if (!user) return null;
    const { passwordHash, ...safeUser } = user;
    return safeUser;
  },

  async getAllUsers() {
    const users = await User.find({}).lean();
    return users.map(({ passwordHash, ...u }) => u);
  },

  async changePassword(usernameOrMobile, oldPassword, newPassword) {
    const trimmed = (usernameOrMobile || '').trim();
    if (!trimmed || !oldPassword || !newPassword) {
      return { success: false, message: 'Current password and new password are required' };
    }
    const oldHash = hashPassword(oldPassword);
    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${trimmed}$`, 'i') } },
        { mobile: trimmed },
        { id: trimmed },
        { referral: trimmed }
      ],
      passwordHash: oldHash
    });
    if (!user) {
      return { success: false, message: 'Current password is incorrect' };
    }
    const newHash = hashPassword(newPassword);
    user.passwordHash = newHash;
    await user.save();
    return { success: true, message: 'Password changed successfully!' };
  },

  async resetPassword(usernameOrMobile, newPassword) {
    const trimmed = (usernameOrMobile || '').trim();
    if (!trimmed || !newPassword) {
      return { success: false, message: 'Username/Mobile and New Password are required' };
    }
    const user = await User.findOne({
      $or: [
        { username: { $regex: new RegExp(`^${trimmed}$`, 'i') } },
        { mobile: trimmed },
        { id: trimmed },
        { referral: trimmed }
      ]
    });
    if (!user) {
      return { success: false, message: 'User or Mobile number not found' };
    }
    const newHash = hashPassword(newPassword);
    user.passwordHash = newHash;
    await user.save();
    return { success: true, message: 'Password reset successfully!' };
  },


  // Customer Management
  async getCustomers(version = 'JV_3.0', referral = null) {
    const query = { version };
    if (referral && referral !== 'All') {
      query.referral = referral;
    }
    const list = await Customer.find(query).lean();
    return list;
  },

  async getCustomerById(version, customerId) {
    const customer = await Customer.findOne({ id: customerId, version }).lean();
    return customer || await Customer.findOne({ id: customerId }).lean();
  },

  async addCustomer({ name, mobile, referral, version = 'JV_3.0', schemeType = '1000', password = '1234' }) {
    const allCustsInVer = await Customer.find({ version }).lean();
    const maxSno = allCustsInVer.length > 0 ? Math.max(...allCustsInVer.map(c => c.sno || 0)) : 0;
    
    const allCustsAllVer = await Customer.find({}).lean();
    const maxSeqNo = allCustsAllVer.length > 0 ? Math.max(...allCustsAllVer.map(c => c.seqNo || 0)) : 0;
    const nextSeq = maxSeqNo + 1;

    const ids = generateCustomerIDs(version, schemeType, nextSeq);
    const customerId = `CUST_${version.replace('.', '_')}_${Date.now()}`;

    // Initialize 12 months payment array
    const payments = Array(12).fill(null).map((_, idx) => ({
      monthIndex: idx,
      isPaid: false,
      paidDate: null,
      amount: 0
    }));

    const newCustomer = {
      id: customerId,
      mainCustomerId: ids.mainCustomerId,
      shortCustomerId: ids.shortCustomerId,
      seqNo: nextSeq,
      password: password || '1234',
      sno: maxSno + 1,
      name: name.trim(),
      mobile: mobile ? mobile.trim() : '',
      referral: referral.trim(),
      version,
      schemeType: schemeType.toString(),
      payments,
      withdrawal: {
        isWithdrawn: false,
        withdrawDate: null,
        disbursedBy: null,
        amount: 0
      },
      createdAt: new Date().toISOString()
    };

    await Customer.create(newCustomer);

    // Create user login account for customer
    if (mobile && mobile.trim()) {
      const mob = mobile.trim();
      await User.deleteMany({ mobile: mob, version });
      await User.create({
        id: `user_${customerId}`,
        username: mob,
        mobile: mob,
        name: name.trim(),
        role: 'customer',
        referral: referral.trim(),
        version,
        schemeType: schemeType.toString(),
        customerId: customerId,
        passwordHash: hashPassword(password || '1234')
      });
    }

    return newCustomer;
  },

  async updatePayment(version, customerId, monthIndex, isPaid, paidDate) {
    const customer = await Customer.findOne({ id: customerId, version });
    if (!customer) return null;

    if (!customer.payments || customer.payments.length === 0) {
      customer.payments = Array(12).fill(null).map((_, idx) => ({
        monthIndex: idx,
        isPaid: false,
        paidDate: null
      }));
    }

    customer.payments[monthIndex] = {
      monthIndex,
      isPaid: !!isPaid,
      paidDate: isPaid ? (paidDate || new Date().toISOString().split('T')[0]) : null
    };

    customer.markModified('payments');
    await customer.save();
    return customer.toObject();
  },

  async updateWithdrawal(version, customerId, isWithdrawn, withdrawDate, disbursedBy = null, amount = 0) {
    const customer = await Customer.findOne({ id: customerId, version });
    if (!customer) return null;

    customer.withdrawal = {
      isWithdrawn: !!isWithdrawn,
      withdrawDate: isWithdrawn ? (withdrawDate || new Date().toISOString().split('T')[0]) : null,
      disbursedBy: isWithdrawn ? (disbursedBy || customer.referral) : null,
      amount: isWithdrawn ? (amount || 0) : 0
    };

    customer.markModified('withdrawal');
    await customer.save();
    return customer.toObject();
  },

  async deleteCustomer(version, customerId) {
    await Customer.deleteOne({ id: customerId, version });
    await User.deleteMany({ customerId });
    return true;
  },

  // ==========================================
  // ACCOUNTS & BALANCE SHEET METHODS
  // ==========================================
  async getAccountsData() {
    const transfers = await Transfer.find({}).lean();
    const disbursals = await Disbursal.find({}).lean();
    return { transfers, disbursals };
  },

  async recordTransfer({ version, monthIndex, entryType = 'DR', fromReferral, toReferral, otherRecipientName, otherSenderName, otherPartyName, amount, date, notes }) {
    const fromRef = (fromReferral || '').trim();
    const toRef = (toReferral || '').trim();
    const isOutside = fromRef === 'Others' || toRef === 'Others';
    const outsideName = (otherPartyName || (toRef === 'Others' ? otherRecipientName : otherSenderName) || '').trim();

    const newTransfer = {
      id: `TRF_${Date.now()}_${Math.floor(Math.random()*1000)}`,
      version,
      monthIndex: parseInt(monthIndex),
      entryType: (entryType || (fromRef === 'Others' ? 'CR' : 'DR')).toUpperCase(),
      fromReferral: fromRef,
      toReferral: toRef,
      isOutside,
      otherPartyName: isOutside ? outsideName : null,
      otherRecipientName: (toRef === 'Others' && outsideName) ? outsideName : null,
      otherSenderName: (fromRef === 'Others' && outsideName) ? outsideName : null,
      amount: parseFloat(amount) || 0,
      date: date || new Date().toISOString().split('T')[0],
      notes: notes ? notes.trim() : '',
      createdAt: new Date().toISOString()
    };

    await Transfer.create(newTransfer);
    return newTransfer;
  },

  async deleteTransfer(transferId) {
    await Transfer.deleteOne({ id: transferId });
    return true;
  },

  async recordDisbursal({ version, monthIndex, customerId, customerName, disbursedBy, amount, date, notes }) {
    await Disbursal.deleteMany({ version, customerId });
    
    const newDisbursal = {
      id: `DISB_${Date.now()}_${Math.floor(Math.random()*1000)}`,
      version,
      monthIndex: parseInt(monthIndex),
      customerId,
      customerName: customerName || '',
      disbursedBy: disbursedBy.trim(),
      amount: parseFloat(amount) || 0,
      date: date || new Date().toISOString().split('T')[0],
      notes: notes ? notes.trim() : '',
      createdAt: new Date().toISOString()
    };

    await Disbursal.create(newDisbursal);
    await this.updateWithdrawal(version, customerId, true, newDisbursal.date, disbursedBy, newDisbursal.amount);
    return newDisbursal;
  },

  async deleteDisbursal(disbursalId) {
    const disb = await Disbursal.findOne({ id: disbursalId }).lean();
    if (disb) {
      await this.updateWithdrawal(disb.version, disb.customerId, false, null, null, 0);
      await Disbursal.deleteOne({ id: disbursalId });
    }
    return true;
  },

  // Compute sequential carry-forward balances across months 0 to targetMonthIndex
  async getAccountsSummary(version = 'JV_1.0', targetMonthIndex = 0) {
    const targetMIdx = parseInt(targetMonthIndex);
    const config = CHIT_CONFIGS[version] || CHIT_CONFIGS['JV_1.0'] || CHIT_CONFIGS['JV_3.0'] || {};
    const customers = await this.getCustomers(version);
    const acc = await this.getAccountsData();

    // Track running balances across months
    let runningBalances = {};
    CORE_REFERRALS.forEach(r => {
      runningBalances[r] = 0; // Starts at 0 for Month 0
    });

    let monthlyComputedStats = [];
    const maxMonths = (config.months || []).length || 12;
    const safeTargetMIdx = Math.min(targetMIdx, maxMonths - 1);

    // Calculate month by month up to targetMonthIndex
    for (let m = 0; m <= safeTargetMIdx; m++) {
      let partnerStats = {};
      CORE_REFERRALS.forEach(r => {
        partnerStats[r] = {
          referral: r,
          openingBalance: runningBalances[r], // Carried forward from previous month
          collectionsCR: 0,
          transfersIn: 0,
          transfersOut: 0,
          outsideCR: 0,
          outsideDR: 0,
          disbursalsDR: 0,
          netCurrent: 0,
          closingBalance: 0
        };
      });

      let mCollectionsCR = 0;
      customers.forEach(c => {
        const scheme = (config.schemes && config.schemes[c.schemeType]) || (config.schemes && Object.values(config.schemes)[0]) || { basePayable: 1000 };
        (c.payments || []).forEach((payItem, payIdx) => {
          if (payItem && payItem.isPaid) {
            const colMonthIdx = payItem.paidDate ? getSchemeMonthFromDate(payItem.paidDate, version) : payIdx;
            const targetColIdx = (colMonthIdx !== null && colMonthIdx !== undefined) ? colMonthIdx : payIdx;

            if (targetColIdx === m) {
              const payable = (scheme.monthlyPayable && scheme.monthlyPayable[payIdx]) || scheme.basePayable || 1000;
              mCollectionsCR += payable;
              if (partnerStats[c.referral]) {
                partnerStats[c.referral].collectionsCR += payable;
              }
            }
          }
        });
      });

      const rawTransfers = (acc.transfers || []).filter(t => t.version === version && t.monthIndex === m);
      let mOutsideCR = 0;
      let mOutsideDR = 0;

      const mTransfers = rawTransfers.map(t => {
        const isFromOutside = t.fromReferral === 'Others';
        const isToOutside = t.toReferral === 'Others';
        const isOutside = isFromOutside || isToOutside;
        const outsidePersonName = t.otherPartyName || (isToOutside ? t.otherRecipientName : t.otherSenderName) || (isOutside ? 'External Party' : null);

        if (isFromOutside) {
          mOutsideCR += t.amount;
          if (partnerStats[t.toReferral]) {
            partnerStats[t.toReferral].transfersIn += t.amount;
            partnerStats[t.toReferral].outsideCR += t.amount;
          }
        } else if (isToOutside) {
          mOutsideDR += t.amount;
          if (partnerStats[t.fromReferral]) {
            partnerStats[t.fromReferral].transfersOut += t.amount;
            partnerStats[t.fromReferral].outsideDR += t.amount;
          }
        } else {
          if (partnerStats[t.fromReferral]) {
            partnerStats[t.fromReferral].transfersOut += t.amount;
          }
          if (partnerStats[t.toReferral]) {
            partnerStats[t.toReferral].transfersIn += t.amount;
          }
        }

        return {
          ...t,
          isOutside,
          outsidePersonName
        };
      });

      const mDisbursals = (acc.disbursals || []).filter(d => d.version === version && d.monthIndex === m);
      let mDisbursalsDR = 0;
      mDisbursals.forEach(d => {
        mDisbursalsDR += d.amount;
        if (partnerStats[d.disbursedBy]) {
          partnerStats[d.disbursedBy].disbursalsDR += d.amount;
        }
      });

      CORE_REFERRALS.forEach(r => {
        const p = partnerStats[r];
        p.netCurrent = (p.collectionsCR + p.transfersIn) - (p.disbursalsDR + p.transfersOut);
        p.closingBalance = p.openingBalance + p.netCurrent;
        runningBalances[r] = p.closingBalance;
      });

      const totalMonthCR = mCollectionsCR + mOutsideCR;
      const totalMonthDR = mDisbursalsDR + mOutsideDR;

      monthlyComputedStats.push({
        monthIndex: m,
        collectionsCR: mCollectionsCR,
        outsideCR: mOutsideCR,
        totalMonthCR,
        disbursalsDR: mDisbursalsDR,
        outsideDR: mOutsideDR,
        totalMonthDR,
        masterNetDifference: totalMonthCR - totalMonthDR,
        partnerStats,
        transfers: mTransfers,
        disbursals: mDisbursals
      });
    }

    const currentStats = monthlyComputedStats[safeTargetMIdx] || {
      collectionsCR: 0,
      outsideCR: 0,
      totalMonthCR: 0,
      disbursalsDR: 0,
      outsideDR: 0,
      totalMonthDR: 0,
      masterNetDifference: 0,
      partnerStats: {},
      transfers: [],
      disbursals: []
    };

    const currentPartners = Object.values(currentStats.partnerStats);
    const monthObj = (config.months && config.months[safeTargetMIdx]) || { name: `Month ${safeTargetMIdx+1}` };
    const outsideTransactions = (currentStats.transfers || []).filter(t => t.isOutside);
    const totalPartnerClosing = currentPartners.reduce((sum, p) => sum + (p.closingBalance || 0), 0);
    const isReconciled = Math.abs(totalPartnerClosing - currentStats.masterNetDifference) < 1;

    return {
      version,
      monthIndex: safeTargetMIdx,
      monthInfo: monthObj,
      collectionsCR: currentStats.collectionsCR,
      outsideCR: currentStats.outsideCR,
      totalMonthCR: currentStats.totalMonthCR,
      disbursalsDR: currentStats.disbursalsDR,
      outsideDR: currentStats.outsideDR,
      totalMonthDR: currentStats.totalMonthDR,
      masterNetDifference: currentStats.masterNetDifference,
      isMasterTallied: isReconciled,
      isZeroNet: currentStats.masterNetDifference === 0,
      partnerClosingSum: totalPartnerClosing,
      partnerBalances: currentPartners,
      transfers: currentStats.transfers,
      disbursals: currentStats.disbursals,
      outsideTransactions,
      outsideSummary: {
        totalOutsideCR: currentStats.outsideCR,
        totalOutsideDR: currentStats.outsideDR,
        count: outsideTransactions.length
      }
    };
  },

  // Per-partner detailed breakdown across months and versions
  async getPartnerMonthlyBreakdown(partnerName = 'PLSSV', targetVersion = 'JV_1.0') {
    const config = CHIT_CONFIGS[targetVersion] || CHIT_CONFIGS['JV_1.0'] || {};
    const months = config.months || [];
    const monthlyList = [];

    for (let idx = 0; idx < months.length; idx++) {
      const mObj = months[idx];
      const summary = await this.getAccountsSummary(targetVersion, idx);
      const pBal = (summary.partnerBalances || []).find(p => p.referral === partnerName) || {
        openingBalance: 0,
        collectionsCR: 0,
        transfersIn: 0,
        transfersOut: 0,
        outsideCR: 0,
        outsideDR: 0,
        disbursalsDR: 0,
        netCurrent: 0,
        closingBalance: 0
      };

      monthlyList.push({
        monthIndex: idx,
        monthName: mObj.name || `Month ${idx + 1}`,
        tamilName: mObj.tamilName || '',
        openingBalance: pBal.openingBalance,
        collectionsCR: pBal.collectionsCR,
        transfersIn: pBal.transfersIn,
        outsideCR: pBal.outsideCR,
        totalInflow: pBal.collectionsCR + pBal.transfersIn,
        disbursalsDR: pBal.disbursalsDR,
        transfersOut: pBal.transfersOut,
        outsideDR: pBal.outsideDR,
        totalOutflow: pBal.disbursalsDR + pBal.transfersOut,
        netCurrent: pBal.netCurrent,
        closingBalance: pBal.closingBalance
      });
    }

    const versionTotals = [];
    for (const v of ['JV_1.0', 'JV_2.0', 'JV_3.0']) {
      const vConfig = CHIT_CONFIGS[v] || {};
      const lastMonthIdx = Math.max(0, (vConfig.months || []).length - 1);
      const vSummary = await this.getAccountsSummary(v, lastMonthIdx);
      const p = (vSummary.partnerBalances || []).find(x => x.referral === partnerName);
      if (p) {
        versionTotals.push({
          version: v,
          collectionsCR: p.collectionsCR,
          transfersIn: p.transfersIn,
          outsideCR: p.outsideCR,
          disbursalsDR: p.disbursalsDR,
          transfersOut: p.transfersOut,
          outsideDR: p.outsideDR,
          closingBalance: p.closingBalance
        });
      }
    }

    return {
      partner: partnerName,
      version: targetVersion,
      monthlyBreakdown: monthlyList,
      versionBreakdown: versionTotals
    };
  },

  // Master Accounts Summary: Consolidated across all partners & versions
  async getMasterAccountsSummary(version = 'Overall', targetMonthIndex = 0) {
    if (version && version !== 'Overall') {
      return await this.getAccountsSummary(version, targetMonthIndex);
    }

    const versions = ['JV_1.0', 'JV_2.0', 'JV_3.0'];
    let combinedPartners = {};
    CORE_REFERRALS.forEach(r => {
      combinedPartners[r] = {
        referral: r,
        openingBalance: 0,
        collectionsCR: 0,
        transfersIn: 0,
        transfersOut: 0,
        outsideCR: 0,
        outsideDR: 0,
        disbursalsDR: 0,
        netCurrent: 0,
        closingBalance: 0
      };
    });

    let totalCollectionsCR = 0;
    let totalOutsideCR = 0;
    let totalDisbursalsDR = 0;
    let totalOutsideDR = 0;
    let allTransfers = [];
    let allDisbursals = [];

    for (const v of versions) {
      const summary = await this.getAccountsSummary(v, targetMonthIndex);
      totalCollectionsCR += summary.collectionsCR || 0;
      totalOutsideCR += summary.outsideCR || 0;
      totalDisbursalsDR += summary.disbursalsDR || 0;
      totalOutsideDR += summary.outsideDR || 0;
      allTransfers.push(...(summary.transfers || []));
      allDisbursals.push(...(summary.disbursals || []));

      (summary.partnerBalances || []).forEach(p => {
        if (combinedPartners[p.referral]) {
          combinedPartners[p.referral].openingBalance += p.openingBalance;
          combinedPartners[p.referral].collectionsCR += p.collectionsCR;
          combinedPartners[p.referral].transfersIn += p.transfersIn;
          combinedPartners[p.referral].transfersOut += p.transfersOut;
          combinedPartners[p.referral].outsideCR += p.outsideCR;
          combinedPartners[p.referral].outsideDR += p.outsideDR;
          combinedPartners[p.referral].disbursalsDR += p.disbursalsDR;
          combinedPartners[p.referral].netCurrent += p.netCurrent;
          combinedPartners[p.referral].closingBalance += p.closingBalance;
        }
      });
    }

    const totalMonthCR = totalCollectionsCR + totalOutsideCR;
    const totalMonthDR = totalDisbursalsDR + totalOutsideDR;
    const masterNetDifference = totalMonthCR - totalMonthDR;
    const partnerBalancesList = Object.values(combinedPartners);
    const totalPartnerClosing = partnerBalancesList.reduce((sum, p) => sum + (p.closingBalance || 0), 0);
    const isReconciled = Math.abs(totalPartnerClosing - masterNetDifference) < 1;
    const outsideTransactions = allTransfers.filter(t => t.isOutside);

    return {
      version: 'Overall',
      monthIndex: parseInt(targetMonthIndex),
      monthInfo: { name: `Month ${parseInt(targetMonthIndex) + 1}` },
      collectionsCR: totalCollectionsCR,
      outsideCR: totalOutsideCR,
      totalMonthCR,
      disbursalsDR: totalDisbursalsDR,
      outsideDR: totalOutsideDR,
      totalMonthDR,
      masterNetDifference,
      isMasterTallied: isReconciled,
      isZeroNet: masterNetDifference === 0,
      partnerClosingSum: totalPartnerClosing,
      partnerBalances: partnerBalancesList,
      transfers: allTransfers,
      disbursals: allDisbursals,
      outsideTransactions,
      outsideSummary: {
        totalOutsideCR,
        totalOutsideDR,
        count: outsideTransactions.length
      }
    };
  },

  // ==========================================
  // MASTER ADMIN SUPERVISORY ANALYTICS
  // ==========================================
  async getMasterPartnerAnalytics(referralName = 'PLSSV', targetVersion = null) {
    const acc = await this.getAccountsData();
    const isOverallPartner = referralName === 'Overall' || referralName === 'All';
    const versions = (targetVersion && targetVersion !== 'Overall') ? [targetVersion] : ['JV_1.0', 'JV_2.0', 'JV_3.0'];

    let overallCR = 0;
    let overallDR = 0;
    let versionBreakdown = {};
    let allPartnerCustomers = [];
    let pendingCustomers = [];
    let withdrawnCustomers = [];

    for (const ver of versions) {
      const config = CHIT_CONFIGS[ver] || {};
      const customers = isOverallPartner ? await this.getCustomers(ver, 'All') : await this.getCustomers(ver, referralName);

      let verCR = 0;
      let verDR = 0;

      customers.forEach(c => {
        const scheme = (config.schemes && config.schemes[c.schemeType]) || (config.schemes && Object.values(config.schemes)[0]) || { basePayable: parseInt(c.schemeType) || 1000 };
        let paidMonthsCount = 0;
        let unpaidMonthsList = [];

        (config.months || []).forEach((mObj, idx) => {
          const pay = c.payments && c.payments[idx];
          const payable = (scheme.monthlyPayable && scheme.monthlyPayable[idx]) || scheme.basePayable;
          if (pay && pay.isPaid) {
            verCR += payable;
            paidMonthsCount++;
          } else {
            unpaidMonthsList.push({ monthIndex: idx, monthName: mObj.name || `Month ${idx+1}`, payable });
          }
        });

        const custEntry = {
          ...c,
          version: ver,
          paidMonthsCount,
          totalMonths: (config.months || []).length,
          unpaidMonthsList
        };

        allPartnerCustomers.push(custEntry);

        if (unpaidMonthsList.length > 0) {
          const totalDue = unpaidMonthsList.reduce((sum, item) => sum + item.payable, 0);
          pendingCustomers.push({
            ...custEntry,
            totalDue,
            unpaidCount: unpaidMonthsList.length
          });
        }

        if (c.withdrawal && c.withdrawal.isWithdrawn) {
          const wAmt = c.withdrawal.amount || (scheme.received ? scheme.received[0] : 0);
          verDR += wAmt;
          withdrawnCustomers.push({
            ...custEntry,
            withdrawnAmount: wAmt,
            withdrawnDate: c.withdrawal.withdrawDate,
            disbursedBy: c.withdrawal.disbursedBy
          });
        }
      });

      overallCR += verCR;
      overallDR += verDR;

      versionBreakdown[ver] = {
        version: ver,
        customerCount: customers.length,
        collectionsCR: verCR,
        payoutsDR: verDR,
        net: verCR - verDR
      };
    }

    const sentTransfers = isOverallPartner
      ? (acc.transfers || [])
      : (acc.transfers || []).filter(t => t.fromReferral === referralName);
    const receivedTransfers = isOverallPartner
      ? (acc.transfers || [])
      : (acc.transfers || []).filter(t => t.toReferral === referralName);
    const totalSent = isOverallPartner ? 0 : sentTransfers.reduce((sum, t) => sum + t.amount, 0);
    const totalReceived = isOverallPartner ? 0 : receivedTransfers.reduce((sum, t) => sum + t.amount, 0);

    return {
      partner: isOverallPartner ? 'Overall (All Partners)' : referralName,
      targetVersion: targetVersion || 'Overall',
      overallCR,
      overallDR,
      netCash: isOverallPartner ? (overallCR - overallDR) : (overallCR + totalReceived - overallDR - totalSent),
      versionBreakdown: Object.values(versionBreakdown),
      totalCustomers: allPartnerCustomers.length,
      customers: allPartnerCustomers,
      pendingCustomers,
      withdrawnCustomers,
      transfers: {
        sent: sentTransfers,
        received: receivedTransfers,
        totalSent,
        totalReceived
      }
    };
  },

  async getMasterConsolidatedSummary(targetVersion = null) {
    let partnerOverview = {};
    CORE_REFERRALS.forEach(r => {
      partnerOverview[r] = {
        referral: r,
        totalCustomers: 0,
        totalCR: 0,
        totalDR: 0,
        pendingCount: 0,
        withdrawnCount: 0
      };
    });

    let overallAllJVCR = 0;
    let overallAllJVDR = 0;
    let totalAllCustomers = 0;
    let totalAllWithdrawn = 0;

    for (const r of CORE_REFERRALS) {
      const analytics = await this.getMasterPartnerAnalytics(r, targetVersion);
      partnerOverview[r].totalCustomers = analytics.totalCustomers;
      partnerOverview[r].totalCR = analytics.overallCR;
      partnerOverview[r].totalDR = analytics.overallDR;
      partnerOverview[r].pendingCount = analytics.pendingCustomers.length;
      partnerOverview[r].withdrawnCount = analytics.withdrawnCustomers.length;

      overallAllJVCR += analytics.overallCR;
      overallAllJVDR += analytics.overallDR;
      totalAllCustomers += analytics.totalCustomers;
      totalAllWithdrawn += analytics.withdrawnCustomers.length;
    }

    return {
      targetVersion: targetVersion || 'Overall',
      overallAllJVCR,
      overallAllJVDR,
      netAllJVBalance: overallAllJVCR - overallAllJVDR,
      totalAllCustomers,
      totalAllWithdrawn,
      partnerOverview: Object.values(partnerOverview)
    };
  }
};

module.exports = DB;
