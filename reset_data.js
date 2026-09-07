const fs = require('fs');
const path = require('path');
const dns = require('dns');
const mongoose = require('mongoose');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
  }
} catch (e) {}


const DATA_DIR = path.join(__dirname, 'data');
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://jvchitfund_db_user:CWmlSuUW9pofTrrn@cluster0.ju4gflm.mongodb.net/jvchitfund?retryWrites=true&w=majority';

const crypto = require('crypto');
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

const defaultAdmins = [
  { id: 'adm_1', username: 'PLSSV', name: 'PLSSV (Partner Admin)', role: 'admin', referral: 'PLSSV', mobile: '6384625665', passwordHash: hashPassword('1234') },
  { id: 'adm_2', username: 'Arun', name: 'Arun (Partner Admin)', role: 'admin', referral: 'Arun', mobile: '9488517403', passwordHash: hashPassword('1234') },
  { id: 'adm_3', username: 'Varatha', name: 'Varatha (Partner Admin)', role: 'admin', referral: 'Varatha', mobile: '7092202771', passwordHash: hashPassword('1234') },
  { id: 'adm_4', username: 'Ramana', name: 'Ramana (Partner Admin)', role: 'admin', referral: 'Ramana', mobile: '6369999091', passwordHash: hashPassword('1234') },
  { id: 'adm_5', username: 'Vicky', name: 'Vicky (Partner Admin)', role: 'admin', referral: 'Vicky', mobile: '9025445125', passwordHash: hashPassword('1234') },
  { id: 'adm_6', username: 'admin', name: 'Master Admin', role: 'admin', referral: 'All', mobile: '', passwordHash: hashPassword('admin123') }
];

async function resetAllData() {
  console.log('1. Clearing JSON files in data directory...');
  fs.writeFileSync(path.join(DATA_DIR, 'jv_1_customers.json'), '[]\n', 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'jv_2_customers.json'), '[]\n', 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'jv_3_customers.json'), '[]\n', 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'jv_accounts.json'), JSON.stringify({ transfers: [], disbursals: [] }, null, 2) + '\n', 'utf-8');
  fs.writeFileSync(path.join(DATA_DIR, 'master_users.json'), JSON.stringify(defaultAdmins, null, 2) + '\n', 'utf-8');
  console.log('JSON files reset successfully!');

  console.log('2. Resetting MongoDB Atlas collections...');
  await mongoose.connect(MONGO_URI);
  const db = mongoose.connection.db;

  await db.collection('customers').deleteMany({});
  await db.collection('transfers').deleteMany({});
  await db.collection('disbursals').deleteMany({});
  await db.collection('users').deleteMany({});

  await db.collection('users').insertMany(defaultAdmins);
  console.log('MongoDB Atlas collections cleared and reset to default admin accounts successfully!');

  await mongoose.disconnect();
  console.log('Reset completed!');
}

resetAllData().catch(err => {
  console.error('Reset error:', err);
  process.exit(1);
});
