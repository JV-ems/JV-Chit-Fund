/**
 * Customer Email Configuration Mapping for Automatic Monthly Backup Emails.
 * 
 * Configured ONLY for PLSSV and Ramana as requested.
 * Future customer email addresses can be safely added here without modifying
 * existing customer database records or MongoDB structures.
 */

const CUSTOMER_EMAIL_MAP = {
  'PLSSV': 'plssv6896@gmail.com',
  'Ramana': 'venkataramanankm@gmail.com'
};

/**
 * Helper to normalize and look up customer email address.
 * Matches against key, referral name, customer name, or customer ID.
 * Returns null if no email is configured.
 */
function getCustomerEmail(identifier) {
  if (!identifier) return null;
  const key = String(identifier).trim();
  
  // Direct key lookup
  if (CUSTOMER_EMAIL_MAP[key]) {
    return CUSTOMER_EMAIL_MAP[key];
  }
  
  // Case-insensitive or partial name match
  const lowerKey = key.toLowerCase();
  for (const [name, email] of Object.entries(CUSTOMER_EMAIL_MAP)) {
    if (name.toLowerCase() === lowerKey || lowerKey.includes(name.toLowerCase())) {
      return email;
    }
  }
  
  return null;
}

/**
 * Configuration toggle for temporary daily email test schedule.
 * Set to false or change config to disable temporary daily test emails.
 * Does NOT affect the production monthly backup routine.
 */
const ENABLE_DAILY_TEST_SCHEDULE = true;

module.exports = {
  CUSTOMER_EMAIL_MAP,
  getCustomerEmail,
  ENABLE_DAILY_TEST_SCHEDULE
};

