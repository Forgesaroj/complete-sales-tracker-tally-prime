/**
 * Nepali Date (Bikram Sambat) Utility
 * Converts between AD (Gregorian) and BS (Bikram Sambat) dates
 */

// BS calendar data - days in each month for years 2000-2090 BS
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

// Nepali month names
const nepaliMonths = [
  'बैशाख', 'जेठ', 'असार', 'श्रावण', 'भाद्र', 'आश्विन',
  'कार्तिक', 'मंसिर', 'पौष', 'माघ', 'फाल्गुन', 'चैत्र'
];

const nepaliMonthsEn = [
  'Baisakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
  'Kartik', 'Mangsir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
];

// Nepali digits
const nepaliDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];

/**
 * Convert number to Nepali digits
 */
export function toNepaliDigits(num) {
  return String(num).replace(/\d/g, d => nepaliDigits[parseInt(d)]);
}

/**
 * Get total days in a BS year
 */
function getTotalDaysInBSYear(year) {
  if (!bsMonthDays[year]) return 365; // Default
  return bsMonthDays[year].reduce((sum, days) => sum + days, 0);
}

/**
 * Get days in a specific BS month
 */
function getDaysInBSMonth(year, month) {
  if (!bsMonthDays[year]) return 30; // Default
  return bsMonthDays[year][month - 1] || 30;
}

/**
 * Convert AD date to BS date
 */
export function adToBS(adDate) {
  const date = new Date(adDate);

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
 * Convert BS date to AD date
 */
export function bsToAD(bsYear, bsMonth, bsDay) {
  // Calculate days from reference BS date
  let totalDays = 0;

  if (bsYear >= referenceBS.year) {
    // Forward from reference
    for (let y = referenceBS.year; y < bsYear; y++) {
      totalDays += getTotalDaysInBSYear(y);
    }
    for (let m = 1; m < bsMonth; m++) {
      totalDays += getDaysInBSMonth(bsYear, m);
    }
    totalDays += bsDay - referenceBS.day;
  }

  const result = new Date(referenceAD);
  result.setDate(result.getDate() + totalDays);
  return result;
}

/**
 * Format BS date
 */
export function formatBSDate(bsDate, format = 'YYYY-MM-DD') {
  const { year, month, day } = bsDate;

  switch (format) {
    case 'YYYY-MM-DD':
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    case 'DD/MM/YYYY':
      return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
    case 'nepali':
      return `${toNepaliDigits(day)} ${nepaliMonths[month - 1]} ${toNepaliDigits(year)}`;
    case 'nepali-short':
      return `${toNepaliDigits(year)}/${toNepaliDigits(month)}/${toNepaliDigits(day)}`;
    case 'en':
      return `${day} ${nepaliMonthsEn[month - 1]} ${year}`;
    default:
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
}

/**
 * Get today's date in BS
 */
export function getTodayBS() {
  return adToBS(new Date());
}

/**
 * Format today's BS date
 */
export function getTodayBSFormatted(format = 'YYYY-MM-DD') {
  return formatBSDate(getTodayBS(), format);
}

/**
 * Parse AD date string (YYYY-MM-DD or DD-Mon-YY) to BS formatted
 */
export function adStringToBS(adDateString, format = 'YYYY-MM-DD') {
  if (!adDateString) return '';

  let date;

  // Handle DD-Mon-YY format (e.g., "05-Feb-26" or "5-Feb-2026")
  if (adDateString.includes('-') && /[a-zA-Z]/.test(adDateString)) {
    const parts = adDateString.split('-');
    if (parts.length === 3) {
      const day = parseInt(parts[0]);
      const monthStr = parts[1].toLowerCase();
      let year = parseInt(parts[2]);

      // Convert 2-digit year to 4-digit
      if (year < 100) {
        year = year > 50 ? 1900 + year : 2000 + year;
      }

      const months = {
        'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
        'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11
      };
      const month = months[monthStr.substring(0, 3)];

      if (!isNaN(day) && month !== undefined && !isNaN(year)) {
        date = new Date(year, month, day);
      }
    }
  }

  // Handle YYYY-MM-DD format
  if (!date) {
    date = new Date(adDateString);
  }

  if (isNaN(date.getTime())) return adDateString;

  const bsDate = adToBS(date);
  return formatBSDate(bsDate, format);
}

export default {
  adToBS,
  bsToAD,
  formatBSDate,
  getTodayBS,
  getTodayBSFormatted,
  adStringToBS,
  toNepaliDigits,
  nepaliMonths,
  nepaliMonthsEn
};
