/**
 * Nepali Date (Bikram Sambat) Utilities
 * Converts between AD and BS dates
 */

// BS calendar data - number of days in each month for years 2075-2095
const bsCalendarData = {
  2075: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2076: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2077: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2078: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2080: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2081: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2082: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2084: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2085: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2086: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2087: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2088: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2089: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2090: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2091: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2092: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2093: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2094: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2095: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30]
};

// Reference date: 2000-01-01 AD = 2056-09-17 BS
const refAD = { year: 2000, month: 1, day: 1 };
const refBS = { year: 2056, month: 9, day: 17 };

/**
 * Get total days in a BS year
 */
function getDaysInBSYear(year) {
  if (!bsCalendarData[year]) {
    // Default to common year pattern if not in data
    return 365;
  }
  return bsCalendarData[year].reduce((a, b) => a + b, 0);
}

/**
 * Get days in a BS month
 */
function getDaysInBSMonth(year, month) {
  if (!bsCalendarData[year]) {
    // Default pattern
    return [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30][month - 1];
  }
  return bsCalendarData[year][month - 1];
}

/**
 * Check if AD year is leap year
 */
function isLeapYearAD(year) {
  return (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);
}

/**
 * Get days in AD month
 */
function getDaysInADMonth(year, month) {
  const daysInMonths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month === 2 && isLeapYearAD(year)) {
    return 29;
  }
  return daysInMonths[month - 1];
}

/**
 * Convert AD date to number of days from reference
 */
function adToDays(year, month, day) {
  let days = 0;

  // Add days for years
  for (let y = refAD.year; y < year; y++) {
    days += isLeapYearAD(y) ? 366 : 365;
  }
  for (let y = year; y < refAD.year; y++) {
    days -= isLeapYearAD(y) ? 366 : 365;
  }

  // Add days for months
  for (let m = 1; m < month; m++) {
    days += getDaysInADMonth(year, m);
  }
  for (let m = 1; m < refAD.month; m++) {
    days -= getDaysInADMonth(refAD.year, m);
  }

  // Add days
  days += day - refAD.day;

  return days;
}

/**
 * Convert AD date to BS date
 * @param {Date|string} adDate - AD date as Date object or string (YYYY-MM-DD or YYYYMMDD)
 * @returns {{year: number, month: number, day: number}} BS date
 */
export function adToBS(adDate) {
  let year, month, day;

  if (typeof adDate === 'string') {
    // Parse YYYY-MM-DD or YYYYMMDD format
    if (adDate.includes('-')) {
      const parts = adDate.split('-');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else {
      year = parseInt(adDate.substring(0, 4), 10);
      month = parseInt(adDate.substring(4, 6), 10);
      day = parseInt(adDate.substring(6, 8), 10);
    }
  } else if (adDate instanceof Date) {
    year = adDate.getFullYear();
    month = adDate.getMonth() + 1;
    day = adDate.getDate();
  } else {
    throw new Error('Invalid date format');
  }

  // Calculate days from reference
  const totalDays = adToDays(year, month, day);

  // Start from reference BS date
  let bsYear = refBS.year;
  let bsMonth = refBS.month;
  let bsDay = refBS.day + totalDays;

  // Normalize days
  while (bsDay > getDaysInBSMonth(bsYear, bsMonth)) {
    bsDay -= getDaysInBSMonth(bsYear, bsMonth);
    bsMonth++;
    if (bsMonth > 12) {
      bsMonth = 1;
      bsYear++;
    }
  }
  while (bsDay < 1) {
    bsMonth--;
    if (bsMonth < 1) {
      bsMonth = 12;
      bsYear--;
    }
    bsDay += getDaysInBSMonth(bsYear, bsMonth);
  }

  return { year: bsYear, month: bsMonth, day: bsDay };
}

/**
 * Format BS date in various formats
 * @param {{year: number, month: number, day: number}} bsDate
 * @param {string} format - Format: 'YYYY-MM-DD', 'DD-MM-YYYY', 'nepali-short'
 * @returns {string}
 */
export function formatBSDate(bsDate, format = 'DD-MM-YYYY') {
  const { year, month, day } = bsDate;
  const dd = String(day).padStart(2, '0');
  const mm = String(month).padStart(2, '0');

  switch (format) {
    case 'YYYY-MM-DD':
      return `${year}-${mm}-${dd}`;
    case 'DD-MM-YYYY':
      return `${dd}-${mm}-${year}`;
    case 'nepali-short':
      return `${dd}-${mm}-${year}`;
    case 'DD/MM/YYYY':
      return `${dd}/${mm}/${year}`;
    default:
      return `${dd}-${mm}-${year}`;
  }
}

/**
 * Convert AD date string to formatted BS date string
 * @param {string} adDateString - AD date string (YYYY-MM-DD or YYYYMMDD)
 * @param {string} format - Output format
 * @returns {string} Formatted BS date
 */
export function adStringToBS(adDateString, format = 'DD-MM-YYYY') {
  try {
    const bsDate = adToBS(adDateString);
    return formatBSDate(bsDate, format);
  } catch (e) {
    console.error('Date conversion error:', e);
    return '';
  }
}

/**
 * Get today's date in BS format
 * @param {string} format - Output format
 * @returns {string} Today's BS date
 */
export function getTodayBS(format = 'DD-MM-YYYY') {
  return adStringToBS(new Date(), format);
}

export default {
  adToBS,
  formatBSDate,
  adStringToBS,
  getTodayBS
};
