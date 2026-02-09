/**
 * Voucher History Routes
 * Voucher change tracking and history
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';

const router = Router();

/**
 * GET /api/voucher-history/stats
 * Get history statistics (MUST be before :masterId route)
 */
router.get('/stats', (req, res) => {
  try {
    const stats = db.getHistoryStats();
    res.json({ success: true, ...stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voucher-history/recent-changes
 * Get recent field-level changes across all vouchers
 */
router.get('/recent-changes', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const changes = db.getRecentChanges(limit);
    res.json({ success: true, count: changes.length, changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voucher-history/by-alterid/:alterId
 * Get voucher by specific alter_id (from current or history)
 */
router.get('/by-alterid/:alterId', (req, res) => {
  try {
    const alterId = parseInt(req.params.alterId);
    const voucher = db.getVoucherByAlterId(alterId);

    if (!voucher) {
      return res.status(404).json({
        success: false,
        message: `No voucher found with ALTERID ${alterId}`
      });
    }

    res.json({
      success: true,
      alterId,
      source: voucher.source,
      voucher
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voucher-history
 * Get all recent voucher changes (history log)
 */
router.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const history = db.getAllVoucherHistory(limit);

    res.json({
      success: true,
      count: history.length,
      history
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voucher-history/:masterId/changes
 * Get field-level change log for a voucher
 */
router.get('/:masterId/changes', (req, res) => {
  try {
    const { masterId } = req.params;
    const changes = db.getVoucherChangeLog(masterId);

    res.json({
      success: true,
      masterId,
      changeCount: changes.length,
      changes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voucher-history/:masterId
 * Get change history for a specific voucher (MUST be last)
 */
router.get('/:masterId', (req, res) => {
  try {
    const { masterId } = req.params;
    const history = db.getVoucherHistory(masterId);
    const current = db.db.prepare('SELECT * FROM bills WHERE tally_master_id = ?').get(masterId);

    res.json({
      success: true,
      masterId,
      currentVersion: current || null,
      historyCount: history.length,
      history
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
