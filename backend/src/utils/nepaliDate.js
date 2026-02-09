/**
 * Nepali Date (Bikram Sambat) Utility for Backend
 * Converts AD (Gregorian) to BS (Bikram Sambat) dates
 */

// BS calendar data - days in each month for years 2080-2090 BS
const bsMonthDays = {
  2080: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2081: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2082: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2083: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2084: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2085: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2086: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2087: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
  2088: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2089: [31, 31, 32, 32, 31, 30, 30, 29, 30, 29, 30, 30],
  2090: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 29, 31],
};

// Reference date: 2080-01-01 BS = 2023-04-14 AD
const referenceBS = { year: 2080, month: 1, day: 1 };
const referenceAD = new Date(2023, 3, 14); // April 14, 2023

/**
 * Get days in a specific BS month
 */
function getDaysInBSMonth(year, month) {
  if (!bsMonthDays[year]) return 30; // Default
  return bsMonthDays[year][month - 1] || 30;
}

/**
 * Convert AD date to BS date
 * @param {Date|string} adDate - AD date (Date object or YYYY-MM-DD string)
 * @returns {object} - { year, month, day }
 */
function adToBS(adDate) {
  let date;

  if (typeof adDate === 'string') {
    // Handle YYYYMMDD format
    if (/^\d{8}$/.test(adDate)) {
      const year = parseInt(adDate.substring(0, 4));
      const month = parseInt(adDate.substring(4, 6)) - 1;
      const day = parseInt(adDate.substring(6, 8));
      date = new Date(year, month, day);
    }
    // Handle YYYY-MM-DD format
    else if (/^\d{4}-\d{2}-\d{2}$/.test(adDate)) {
      date = new Date(adDate);
    } else {
      date = new Date(adDate);
    }
  } else {
    date = new Date(adDate);
  }

  // Calculate days difference from reference date
  const diffTime = date.getTime() - referenceAD.getTime();
  let diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  let bsYear = referenceBS.year;
  let bsMonth = referenceBS.month;
  let bsDay = referenceBS.day;

  // Add the difference in days
  bsDay += diffDays;

  // Normalize the date
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
 * Format BS date to DD-MM-YYYY string (Tally format)
 * @param {object} bsDate - { year, month, day }
 * @returns {string} - DD-MM-YYYY format
 */
function formatBSForTally(bsDate) {
  const { year, month, day } = bsDate;
  return `${String(day).padStart(2, '0')}-${String(month).padStart(2, '0')}-${year}`;
}

/**
 * Convert AD date string to BS date in DD-MM-YYYY format (for Tally MINepDate)
 * @param {string} adDateString - YYYY-MM-DD or YYYYMMDD format
 * @returns {string} - DD-MM-YYYY BS date
 */
function adToNepaliDateString(adDateString) {
  if (!adDateString) {
    // Use today's date if not provided
    adDateString = new Date().toISOString().split('T')[0];
  }

  const bsDate = adToBS(adDateString);
  return formatBSForTally(bsDate);
}

export { adToBS, formatBSForTally, adToNepaliDateString };
export default { adToBS, formatBSForTally, adToNepaliDateString };
