/**
 * Voucher Lock Routes
 * Lock/unlock vouchers via UDF field to prevent edit & delete in TallyPrime
 * Uses LOCAL DB for voucher lookup (instant) — only sends ALTER to Tally
 */

import { Router } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { tallyConnector } from '../services/tally/tallyConnector.js';
import { db } from '../services/database/database.js';
import config from '../config/default.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const router = Router();

// Auto-lock scheduler state
let autoLockInterval = null;
let lastAutoLockDate = null;

/**
 * Format date as YYYYMMDD to match DB storage format
 * DB stores dates as '20250717' not '2025-07-17'
 */
function formatSqlDate(dateStr) {
  if (!dateStr) {
    const now = new Date();
    return now.toISOString().split('T')[0].replace(/-/g, '');
  }
  // If already YYYYMMDD, return as-is
  if (/^\d{8}$/.test(dateStr)) {
    return dateStr;
  }
  // Convert YYYY-MM-DD to YYYYMMDD
  return dateStr.replace(/-/g, '');
}

/**
 * Get vouchers from local DB by date range
 */
function getLocalVouchers(toDate, fromDate) {
  const to = formatSqlDate(toDate);
  let sql = `SELECT tally_master_id, tally_guid, voucher_type FROM bills
    WHERE (is_deleted = 0 OR is_deleted IS NULL)
    AND tally_master_id IS NOT NULL
    AND voucher_date <= ?`;
  const params = [to];

  if (fromDate) {
    const from = formatSqlDate(fromDate);
    sql += ' AND voucher_date >= ?';
    params.push(from);
  }

  return db.db.prepare(sql).all(...params);
}

/**
 * Log a lock/unlock action
 */
function logAction(action, details) {
  try {
    const logStr = db.getSetting('voucher_lock_last_action') || '[]';
    const log = JSON.parse(logStr);
    log.unshift({
      action,
      ...details,
      timestamp: new Date().toISOString()
    });
    if (log.length > 50) log.length = 50;
    db.setSetting('voucher_lock_last_action', JSON.stringify(log));
  } catch (e) {
    console.error('[VoucherLock] Error logging action:', e.message);
  }
}

/**
 * GET /api/voucher-lock/status
 * Get lock status from local DB counts + local settings
 */
router.get('/status', async (req, res) => {
  try {
    // Use local DB counts instead of slow Tally fetch
    const totalVouchers = db.db.prepare(
      `SELECT COUNT(*) as cnt FROM bills WHERE (is_deleted = 0 OR is_deleted IS NULL) AND tally_master_id IS NOT NULL`
    ).get().cnt;

    const autoEnabled = db.getSetting('voucher_lock_auto_enabled') === 'true';
    const autoTime = db.getSetting('voucher_lock_auto_time') || '18:00';
    const lastActionStr = db.getSetting('voucher_lock_last_action') || '[]';
    let lastAction = null;
    try {
      const log = JSON.parse(lastActionStr);
      lastAction = log[0] || null;
    } catch {}

    const connected = await tallyConnector.checkConnection().then(() => true).catch(() => false);

    res.json({
      tallyConnected: connected,
      defaultCompany: config.tally.companyName || 'FOR DB',
      forDB: { totalVouchers, locked: lastAction?.totalLocked || 0, unlocked: 0 },
      odbc: { totalVouchers: 0, locked: 0, unlocked: 0 },
      autoEnabled,
      autoTime,
      lastAction
    });
  } catch (error) {
    console.error('[VoucherLock] Status error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/voucher-lock/lock
 * Lock vouchers up to a given date — queries LOCAL DB, sends ALTER to Tally
 * Body: { date?: 'YYYY-MM-DD', company?: 'For DB' | db.getCompanyNames().odbc | 'both' }
 */
router.post('/lock', async (req, res) => {
  try {
    const { date, company } = req.body;
    const lockDate = date || new Date().toISOString().split('T')[0];
    const defaultCompany = config.tally.companyName || 'FOR DB';
    const target = company || defaultCompany;

    // Try LOCAL DB first (instant), fallback to Tally fetch if empty
    let vouchers = getLocalVouchers(lockDate);
    let source = 'local DB';
    if (vouchers.length === 0) {
      console.log(`[VoucherLock] No vouchers in local DB, fetching from Tally...`);
      vouchers = await tallyConnector.fetchVoucherIds(lockDate, null, target !== 'both' ? target : defaultCompany);
      source = 'Tally';
    }
    console.log(`[VoucherLock] Found ${vouchers.length} vouchers from ${source} up to ${lockDate}`);

    if (vouchers.length === 0) {
      return res.json({ success: false, lockDate, totalLocked: 0, message: 'No vouchers found. Check Tally connection and company name.' });
    }

    // Send single ALTER to Tally
    let result = null;
    if (target === 'both') {
      result = await tallyConnector.setVoucherLockUDF(vouchers, 'Yes', defaultCompany);
      const odbcResult = await tallyConnector.setVoucherLockUDF(vouchers, 'Yes', db.getCompanyNames().odbc);
      if (result.count === 0) result = odbcResult;
    } else {
      result = await tallyConnector.setVoucherLockUDF(vouchers, 'Yes', target);
    }

    const totalLocked = result?.count || 0;
    const errors = result?.errors || [];
    logAction('lock', { date: lockDate, target, totalLocked, voucherCount: vouchers.length, errors });

    res.json({ success: totalLocked > 0, lockDate, totalLocked, voucherCount: vouchers.length, errors });
  } catch (error) {
    console.error('[VoucherLock] Lock error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/voucher-lock/unlock
 * Unlock vouchers in a date range — queries LOCAL DB, sends ALTER to Tally
 * Body: { fromDate: 'YYYY-MM-DD', toDate: 'YYYY-MM-DD', company?: string }
 */
router.post('/unlock', async (req, res) => {
  try {
    const { fromDate, toDate, company } = req.body;
    if (!fromDate || !toDate) {
      return res.status(400).json({ error: 'fromDate and toDate are required' });
    }

    const defaultCompany = config.tally.companyName || 'FOR DB';
    const target = company || defaultCompany;

    // Try LOCAL DB first (instant), fallback to Tally fetch if empty
    let vouchers = getLocalVouchers(toDate, fromDate);
    let source = 'local DB';
    if (vouchers.length === 0) {
      console.log(`[VoucherLock] No vouchers in local DB, fetching from Tally...`);
      vouchers = await tallyConnector.fetchVoucherIds(toDate, fromDate, target !== 'both' ? target : defaultCompany);
      source = 'Tally';
    }
    console.log(`[VoucherLock] Found ${vouchers.length} vouchers from ${source} (${fromDate} to ${toDate})`);

    if (vouchers.length === 0) {
      return res.json({ success: false, fromDate, toDate, totalUnlocked: 0, message: 'No vouchers found. Check Tally connection and company name.' });
    }

    // Send single ALTER to Tally
    let result = null;
    if (target === 'both') {
      result = await tallyConnector.setVoucherLockUDF(vouchers, 'No', defaultCompany);
      const odbcResult = await tallyConnector.setVoucherLockUDF(vouchers, 'No', db.getCompanyNames().odbc);
      if (result.count === 0) result = odbcResult;
    } else {
      result = await tallyConnector.setVoucherLockUDF(vouchers, 'No', target);
    }

    const totalUnlocked = result?.count || 0;
    const errors = result?.errors || [];
    logAction('unlock', { fromDate, toDate, target, totalUnlocked, voucherCount: vouchers.length, errors });

    res.json({ success: totalUnlocked > 0, fromDate, toDate, totalUnlocked, voucherCount: vouchers.length, errors });
  } catch (error) {
    console.error('[VoucherLock] Unlock error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/voucher-lock/schedule
 * Set auto-lock schedule
 * Body: { enabled: boolean, time: '18:00' }
 */
router.put('/schedule', async (req, res) => {
  try {
    const { enabled, time } = req.body;

    if (typeof enabled === 'boolean') {
      db.setSetting('voucher_lock_auto_enabled', enabled.toString());
    }
    if (time) {
      db.setSetting('voucher_lock_auto_time', time);
    }

    setupAutoLock();

    res.json({
      success: true,
      autoEnabled: db.getSetting('voucher_lock_auto_enabled') === 'true',
      autoTime: db.getSetting('voucher_lock_auto_time') || '18:00'
    });
  } catch (error) {
    console.error('[VoucherLock] Schedule error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/voucher-lock/toggle
 * Lock or unlock a single voucher by bill ID
 * Body: { billId: number, lockValue: 'Yes'|'No', company?: string }
 */
router.post('/toggle', async (req, res) => {
  try {
    const { billId, lockValue, company } = req.body;
    if (!billId) return res.status(400).json({ error: 'billId is required' });

    const defaultCompany = config.tally.companyName || 'FOR DB';
    const target = company || defaultCompany;
    const lock = lockValue === 'Yes' || lockValue === true ? 'Yes' : 'No';

    const voucher = db.db.prepare(
      `SELECT tally_master_id, tally_guid, voucher_type FROM bills WHERE id = ?`
    ).get(billId);

    if (!voucher || !voucher.tally_master_id) {
      return res.json({ success: false, error: 'Voucher not found or missing Tally ID' });
    }

    const guid = voucher.tally_guid || voucher.tally_master_id;
    const result = await tallyConnector.toggleSingleVoucherLock(
      guid, voucher.tally_master_id, voucher.voucher_type, lock, target
    );

    res.json({ success: result.success, altered: result.altered, lockValue: lock });
  } catch (error) {
    console.error('[VoucherLock] Toggle error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voucher-lock/tdl
 * Download the voucher-lock.tdl file
 */
router.get('/tdl', (req, res) => {
  const tdlPath = path.resolve(__dirname, '../../tdl/voucher-lock.tdl');
  res.download(tdlPath, 'voucher-lock.tdl');
});

/**
 * GET /api/voucher-lock/log
 * Get recent lock/unlock actions
 */
router.get('/log', (req, res) => {
  try {
    const logStr = db.getSetting('voucher_lock_last_action') || '[]';
    const log = JSON.parse(logStr);
    res.json({ log });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Auto-lock scheduler — checks every 60 seconds if it's time to lock
 */
function setupAutoLock() {
  if (autoLockInterval) {
    clearInterval(autoLockInterval);
    autoLockInterval = null;
  }

  const enabled = db.getSetting('voucher_lock_auto_enabled') === 'true';
  if (!enabled) {
    console.log('[VoucherLock] Auto-lock disabled');
    return;
  }

  const autoTime = db.getSetting('voucher_lock_auto_time') || '18:00';
  console.log(`[VoucherLock] Auto-lock enabled at ${autoTime}`);

  autoLockInterval = setInterval(async () => {
    try {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];

      if (lastAutoLockDate === todayStr) return;

      const currentTime = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
      const targetTime = db.getSetting('voucher_lock_auto_time') || '18:00';

      if (currentTime >= targetTime) {
        console.log(`[VoucherLock] Auto-lock triggered at ${currentTime} (target: ${targetTime})`);
        lastAutoLockDate = todayStr;

        const autoCompany = config.tally.companyName || 'FOR DB';
        const vouchers = getLocalVouchers(todayStr);
        const result = await tallyConnector.setVoucherLockUDF(vouchers, 'Yes', autoCompany);

        logAction('auto-lock', {
          date: todayStr,
          target: autoCompany,
          totalLocked: result?.count || 0,
          voucherCount: vouchers.length
        });

        console.log(`[VoucherLock] Auto-lock complete: ${result?.count || 0} vouchers locked`);
      }
    } catch (error) {
      console.error('[VoucherLock] Auto-lock error:', error.message);
    }
  }, 60000);
}

// Initialize auto-lock on module load
try {
  setupAutoLock();
} catch (e) {
  setTimeout(() => setupAutoLock(), 5000);
}

export default router;
