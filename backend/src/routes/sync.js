/**
 * Sync Routes
 * Tally synchronization operations
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { syncService } from '../services/sync/syncService.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * GET /api/sync/status
 * Get sync status
 */
router.get('/status', (req, res) => {
  try {
    const status = syncService.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/stop
 * Stop the automatic sync service
 */
router.post('/stop', (req, res) => {
  try {
    syncService.stop();
    res.json({ success: true, message: 'Sync service stopped', isRunning: syncService.isRunning });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/start
 * Start the automatic sync service
 */
router.post('/start', async (req, res) => {
  try {
    const result = await syncService.start();
    res.json({ success: result, message: result ? 'Sync service started' : 'Failed to start sync service', isRunning: syncService.isRunning });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/trigger
 * Manually trigger sync (today only)
 */
router.post('/trigger', async (req, res) => {
  try {
    const result = await syncService.syncNow();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/date-range
 * Sync specific date range (for fetching older data)
 */
router.post('/date-range', async (req, res) => {
  try {
    const { fromDate, toDate } = req.body;

    if (!fromDate || !toDate) {
      return res.status(400).json({ error: 'fromDate and toDate are required (YYYYMMDD format)' });
    }

    const dateRegex = /^\d{8}$/;
    if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
      return res.status(400).json({ error: 'Dates must be in YYYYMMDD format' });
    }

    const result = await syncService.syncDateRange(fromDate, toDate);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/masters
 * Manually trigger master data sync (stock items + parties)
 */
router.post('/masters', async (req, res) => {
  try {
    const result = await syncService.syncMasters();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/stock
 * Manually trigger stock items sync only
 */
router.post('/stock', async (req, res) => {
  try {
    const result = await syncService.syncStockItems();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/parties
 * Manually trigger parties sync only
 */
router.post('/parties', async (req, res) => {
  try {
    const result = await syncService.syncParties();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/deleted
 * Sync deleted vouchers from Tally
 * Compares local database with Tally and removes vouchers that no longer exist
 * This is a heavier operation - use periodically, not on every sync
 */
router.post('/deleted', async (req, res) => {
  try {
    const { voucherTypes } = req.body; // Optional array of voucher types to check

    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Cannot check deleted vouchers.'
      });
    }

    console.log('Starting deleted voucher sync...');
    const result = await syncService.syncDeletedVouchers(voucherTypes);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sync/master-state
 * Get master sync state (last sync AlterIDs)
 */
router.get('/master-state', (req, res) => {
  try {
    const state = db.getMasterSyncState();
    const stockCount = db.getStockItemsCount();
    const partyCount = db.getAllParties().length;

    res.json({
      ...state,
      stockItemsCount: stockCount,
      partiesCount: partyCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/reset-stock
 * Reset stock items - clears table and resets alter_id for full sync
 */
router.post('/reset-stock', async (req, res) => {
  try {
    db.clearStockItems();
    db.updateStockSyncState(0);

    const result = await syncService.syncStockItems();
    res.json({
      message: 'Stock items reset and synced',
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/reset-parties
 * Reset parties - clears table and resets alter_id for full sync
 */
router.post('/reset-parties', async (req, res) => {
  try {
    db.clearParties();
    db.updatePartySyncState(0);

    const result = await syncService.syncParties();
    res.json({
      message: 'Parties reset and synced',
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== FULL HISTORICAL SYNC ====================

/**
 * GET /api/sync/full-history/status
 * Get status of full historical sync
 */
router.get('/full-history/status', (req, res) => {
  try {
    const status = syncService.getFullSyncStatus();
    res.json({
      success: true,
      ...status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/full-history
 * Start full historical sync from Tally
 */
router.post('/full-history', async (req, res) => {
  try {
    const { startDate, batchDays } = req.body;

    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Cannot start full history sync.'
      });
    }

    console.log(`Starting full historical sync: startDate=${startDate || 'auto'}, batchDays=${batchDays || 7}`);

    res.json({
      success: true,
      message: 'Full historical sync started. Check /api/sync/full-history/status for progress.',
      startDate: startDate || 'auto (1 year ago)',
      batchDays: batchDays || 7
    });

    syncService.syncFullHistory(startDate, batchDays || 7)
      .then(result => console.log('Full sync completed:', result))
      .catch(err => console.error('Full sync failed:', err.message));

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/full-history/resume
 * Resume an interrupted full historical sync
 */
router.post('/full-history/resume', async (req, res) => {
  try {
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Cannot resume sync.'
      });
    }

    const state = db.getFullSyncState();
    if (!state || state.status !== 'in_progress') {
      return res.status(400).json({
        success: false,
        error: 'No sync in progress to resume'
      });
    }

    res.json({
      success: true,
      message: `Resuming sync from ${state.current_date}`,
      resumeFrom: state.current_date
    });

    syncService.resumeFullSync()
      .then(result => console.log('Resume sync completed:', result))
      .catch(err => console.error('Resume sync failed:', err.message));

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/full-history/reset
 * Reset full sync state (to start fresh)
 */
router.post('/full-history/reset', (req, res) => {
  try {
    db.resetFullSyncState();
    res.json({
      success: true,
      message: 'Full sync state reset. Ready for new full sync.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== FULL REFRESH SYNC (CLEARS AND RE-SYNCS) ====================

/**
 * POST /api/sync/full-refresh
 * FULL REFRESH: Clears all voucher data and re-syncs from Tally with complete item details
 * WARNING: This deletes all existing bills and items before syncing
 */
router.post('/full-refresh', async (req, res) => {
  try {
    const { startDate, endDate, includeItems = true } = req.body;

    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Cannot start full refresh sync.'
      });
    }

    console.log(`Starting full refresh sync: startDate=${startDate || 'auto'}, endDate=${endDate || 'today'}, includeItems=${includeItems}`);

    // Send immediate response
    res.json({
      success: true,
      message: 'Full refresh sync started. All existing data will be cleared and re-synced from Tally.',
      startDate: startDate || 'auto (1 year ago)',
      endDate: endDate || 'today',
      includeItems,
      note: 'Check backend logs or WebSocket events for progress.'
    });

    // Start the sync in background
    syncService.fullRefreshSync(startDate, endDate, includeItems)
      .then(result => console.log('Full refresh completed:', result))
      .catch(err => console.error('Full refresh failed:', err.message));

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/clear-all
 * Clears all bills and items from database (without re-syncing)
 * Use with caution
 */
router.post('/clear-all', (req, res) => {
  try {
    const result = db.clearAllBillsAndItems();
    res.json({
      success: true,
      message: 'All bills and items cleared from database',
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
