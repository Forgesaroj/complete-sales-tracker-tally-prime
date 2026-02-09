/**
 * RBB Routes
 * RBB Smart Banking integration
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { rbbService } from '../services/payment/rbbService.js';

const router = Router();

/**
 * GET /api/rbb/status
 * Get RBB Smart Banking sync service status
 */
router.get('/status', (req, res) => {
  try {
    const status = rbbService.getStatus();
    const syncState = db.getRBBSyncState();
    res.json({
      ...status,
      lastSyncTime: syncState?.last_sync_time,
      accountNumber: syncState?.account_number,
      accountBalance: syncState?.account_balance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/rbb/sync
 * Manually trigger RBB sync
 */
router.post('/sync', async (req, res) => {
  try {
    // Run sync in background
    rbbService.triggerSync();
    res.json({ success: true, message: 'RBB sync started' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/rbb/transactions
 * Get RBB bank transactions
 */
router.get('/transactions', (req, res) => {
  try {
    const { limit = 100, offset = 0, fromDate, toDate } = req.query;

    let transactions;
    if (fromDate && toDate) {
      transactions = db.getRBBTransactionsByDateRange(fromDate, toDate);
    } else {
      transactions = db.getRBBTransactions(parseInt(limit), parseInt(offset));
    }

    res.json({
      success: true,
      count: transactions.length,
      transactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/rbb/summary
 * Get RBB transaction summary
 */
router.get('/summary', (req, res) => {
  try {
    const summary = db.getRBBSummary();
    const syncState = db.getRBBSyncState();

    res.json({
      success: true,
      ...summary,
      accountBalance: syncState?.account_balance || 0,
      accountNumber: syncState?.account_number || ''
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/rbb/start
 * Start RBB sync service
 */
router.post('/start', async (req, res) => {
  try {
    rbbService.start();
    res.json({ success: true, message: 'RBB service started' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/rbb/stop
 * Stop RBB sync service
 */
router.post('/stop', async (req, res) => {
  try {
    await rbbService.stop();
    res.json({ success: true, message: 'RBB service stopped' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
