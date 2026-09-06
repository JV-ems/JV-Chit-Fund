// Chit Fund Scheme Configurations for JV 1.0, JV 2.0, and JV 3.0 (English Version)

const CHIT_CONFIGS = {
  'JV_2.0': {
    name: 'JV 2.0',
    title: 'JV Chit Fund',
    slogan: 'Save Monthly, Grow Yearly',
    headerGreeting: 'ஸ்ரீ வரதராஜப் பரப்ரஹ்மணே நம:',
    welcomeText: 'Welcome to JV 2.0',
    since: '2025',
    footerRule: 'Subscription must be paid between 1st and 5th of each month',
    months: [
      { id: 'M1', name: 'Thai', num: 1 },
      { id: 'M2', name: 'Masi', num: 2 },
      { id: 'M3', name: 'Panguni', num: 3 },
      { id: 'M4', name: 'Chithirai', num: 4 },
      { id: 'M5', name: 'Vaikasi', num: 5 },
      { id: 'M6', name: 'Aani', num: 6 },
      { id: 'M7', name: 'Aadi', num: 7 },
      { id: 'M8', name: 'Aavani', num: 8 },
      { id: 'M9', name: 'Purattasi', num: 9 },
      { id: 'M10', name: 'Aippasi', num: 10 },
      { id: 'M11', name: 'Karthigai', num: 11 },
      { id: 'M12', name: 'Margazhi', num: 12 }
    ],
    schemes: {
      '1250': {
        name: 'Rs. 1,250 Plan',
        basePayable: 1250,
        monthlyPayable: [1250, 1250, 1145, 1160, 1175, 1190, 1200, 1210, 1220, 1230, 1240, 1250],
        received: [12250, 12450, 12650, 12850, 13050, 13250, 13500, 13750, 14050, 14300, 14550, 14850]
      }
    }
  },
  'JV_3.0': {
    name: 'JV 3.0',
    title: 'JV Chit Fund',
    slogan: 'Save Monthly, Grow Yearly 📈',
    headerGreeting: 'ஸ்ரீ வரதராஜப் பரப்ரஹ்மணே நம:',
    welcomeText: 'Welcome to JV 3.0',
    since: '2025',
    footerRule: 'Subscription must be paid between 1st and 5th of each month',
    months: [
      { id: 'M1', name: 'Vaikasi', num: 1 },
      { id: 'M2', name: 'Aani', num: 2 },
      { id: 'M3', name: 'Aadi', num: 3 },
      { id: 'M4', name: 'Aavani', num: 4 },
      { id: 'M5', name: 'Purattasi', num: 5 },
      { id: 'M6', name: 'Aippasi', num: 6 },
      { id: 'M7', name: 'Karthigai', num: 7 },
      { id: 'M8', name: 'Margazhi', num: 8 },
      { id: 'M9', name: 'Thai', num: 9 },
      { id: 'M10', name: 'Masi', num: 10 },
      { id: 'M11', name: 'Panguni', num: 11 },
      { id: 'M12', name: 'Chithirai', num: 12 }
    ],
    schemes: {
      '1000': {
        name: 'Rs. 1,000 Plan',
        basePayable: 1000,
        monthlyPayable: [1000, 900, 910, 920, 930, 940, 950, 960, 970, 980, 990, 1000],
        received: [9520, 9640, 9760, 9880, 10100, 10370, 10640, 10910, 11180, 11500, 11820, 12140]
      },
      '2500': {
        name: 'Rs. 2,500 Plan',
        basePayable: 2500,
        monthlyPayable: [2500, 2500, 2275, 2300, 2325, 2350, 2375, 2400, 2425, 2450, 2475, 2500],
        received: [24750, 25100, 25500, 25900, 26300, 26700, 27100, 27550, 28000, 28500, 29000, 29500]
      },
      '5000': {
        name: 'Rs. 5,000 Plan',
        basePayable: 5000,
        monthlyPayable: [5000, 5000, 4560, 4600, 4660, 4700, 4750, 4800, 4850, 4900, 4960, 5000],
        received: [49500, 50200, 51000, 51800, 52600, 53400, 54200, 55100, 56000, 57000, 58000, 59000]
      }
    }
  },
  'JV_1.0': {
    name: 'JV 1.0',
    title: 'JV Chit Fund',
    slogan: 'Save Monthly, Grow Yearly 📈',
    headerGreeting: 'ஸ்ரீ வரதராஜப் பரப்ரஹ்மணே நம:',
    welcomeText: 'Welcome to JV 1.0 – 2nd Year',
    since: '2025',
    footerRule: 'Every month 1 to 5 payable amount.',
    subNote: 'JV Chit Fund – Building Trust, Creating Wealth',
    months: [
      { id: 'M1', name: 'October (Oct)', tamilName: 'அக்டோபர் (Oct)', num: 1 },
      { id: 'M2', name: 'November (Nov)', tamilName: 'நவம்பர் (Nov)', num: 2 },
      { id: 'M3', name: 'December (Dec)', tamilName: 'டிசம்பர் (Dec)', num: 3 },
      { id: 'M4', name: 'January (Jan)', tamilName: 'ஜனவரி (Jan)', num: 4 },
      { id: 'M5', name: 'February (Feb)', tamilName: 'பிப்ரவரி (Feb)', num: 5 },
      { id: 'M6', name: 'March (Mar)', tamilName: 'மார்ச் (Mar)', num: 6 },
      { id: 'M7', name: 'April (Apr)', tamilName: 'ஏப்ரல் (Apr)', num: 7 },
      { id: 'M8', name: 'May (May)', tamilName: 'மே (May)', num: 8 },
      { id: 'M9', name: 'June (Jun)', tamilName: 'ஜூன் (Jun)', num: 9 },
      { id: 'M10', name: 'July (Jul)', tamilName: 'ஜூலை (Jul)', num: 10 },
      { id: 'M11', name: 'August (Aug)', tamilName: 'ஆகஸ்ட் (Aug)', num: 11 },
      { id: 'M12', name: 'September (Sep)', tamilName: 'செப்டம்பர் (Sep)', num: 12 }
    ],
    schemes: {
      '1250': {
        name: 'Rs. 1,250 Plan',
        basePayable: 1250,
        monthlyPayable: [1250, 1250, 1145, 1160, 1175, 1190, 1200, 1210, 1220, 1230, 1240, 1250],
        received: [12250, 12450, 12650, 12850, 13050, 13250, 13500, 13750, 14050, 14300, 14550, 14850]
      },
      '2500': {
        name: 'Rs. 2,500 Plan',
        basePayable: 2500,
        monthlyPayable: [2500, 2250, 2270, 2300, 2320, 2350, 2370, 2400, 2420, 2450, 2470, 2500],
        received: [23790, 24080, 24370, 24660, 25200, 25860, 26530, 27200, 27860, 28650, 29440, 30230]
      },
      '5000': {
        name: 'Rs. 5,000 Plan',
        basePayable: 5000,
        monthlyPayable: [5000, 4500, 4550, 4600, 4650, 4700, 4750, 4800, 4850, 4900, 4950, 5000],
        received: [47585, 48165, 48740, 49320, 50400, 51735, 53060, 54390, 55720, 57300, 58880, 60500]
      }
    }
  }
};

// Start calendar months for each version:
CHIT_CONFIGS['JV_1.0'].startCalendarMonth = 10; // October
CHIT_CONFIGS['JV_2.0'].startCalendarMonth = 1;  // January (Thai)
CHIT_CONFIGS['JV_3.0'].startCalendarMonth = 5;  // May (Vaikasi)

function getSchemeMonthFromDate(dateStr, version = 'JV_1.0') {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const parts = dateStr.split('-');
  if (parts.length < 2) return null;
  const calMonth = parseInt(parts[1], 10);
  if (isNaN(calMonth) || calMonth < 1 || calMonth > 12) return null;

  const cfg = CHIT_CONFIGS[version] || CHIT_CONFIGS['JV_1.0'];
  const startMonth = cfg.startCalendarMonth || 10;
  return (calMonth - startMonth + 12) % 12;
}

const CORE_REFERRALS = ['PLSSV', 'Arun', 'Varatha', 'Ramana', 'Vicky'];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { CHIT_CONFIGS, CORE_REFERRALS, getSchemeMonthFromDate };
}

if (typeof window !== 'undefined') {
  window.CHIT_CONFIGS = CHIT_CONFIGS;
  window.CORE_REFERRALS = CORE_REFERRALS;
  window.getSchemeMonthFromDate = getSchemeMonthFromDate;
}
