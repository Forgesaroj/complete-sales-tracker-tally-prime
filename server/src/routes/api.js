/**
 * API Routes
 * REST endpoints for the Dashboard
 */

import { Router } from 'express';
import { db } from '../services/database.js';
import { tallyConnector } from '../services/tallyConnector.js';
import { syncService } from '../services/syncService.js';
import { fonepayService } from '../services/fonepayService.js';
import config from '../config/default.js';

const router = Router();

// ==================== DASHBOARD ====================

/**
 * GET /api/dashboard/summary
 * Get dashboard summary stats
 */
router.get('/dashboard/summary', (req, res) => {
  try {
    const summary = db.getDashboardSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== BILLS ====================

/**
 * GET /api/bills
 * Get bills with optional filters
 */
router.get('/bills', (req, res) => {
  try {
    const { date, status, voucherType } = req.query;

    let bills;
    if (date) {
      bills = db.getBillsByDate(date);
    } else {
      bills = db.getTodayBills();
    }

    // Apply filters
    if (status) {
      bills = bills.filter(b => b.payment_status === status);
    }
    if (voucherType) {
      bills = bills.filter(b => b.voucher_type === voucherType);
    }

    res.json(bills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bills/pending
 * Get all pending bills
 */
router.get('/bills/pending', (req, res) => {
  try {
    const bills = db.getPendingBills();
    res.json(bills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bills/:id
 * Get single bill with receipts
 */
router.get('/bills/:id', (req, res) => {
  try {
    const bill = db.getBillById(req.params.id);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const receipts = db.getReceiptsByBill(bill.id);
    res.json({ ...bill, receipts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/bills/:id/dispatch
 * Update bill dispatch status
 */
router.patch('/bills/:id/dispatch', (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = Object.values(config.billStatus);

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = db.updateBillDispatchStatus(req.params.id, status);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Broadcast status change
    const io = req.app.get('io');
    if (io) {
      io.emit('bill:dispatchChanged', {
        billId: parseInt(req.params.id),
        newStatus: status
      });
    }

    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PAYMENTS ====================

/**
 * POST /api/payments
 * Create payment (receipt) - syncs to Tally
 */
router.post('/payments', async (req, res) => {
  try {
    const { billId, amount, paymentMode, userId } = req.body;

    // Validate
    if (!billId || !amount) {
      return res.status(400).json({ error: 'billId and amount are required' });
    }

    const bill = db.getBillById(billId);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Create receipt in dashboard database first
    const receiptResult = db.createReceipt({
      billId,
      amount,
      paymentMode: paymentMode || 'Cash',
      createdBy: userId || 1,
      syncedToTally: false
    });

    const receiptId = receiptResult.lastInsertRowid;

    // Post receipt to Tally
    const tallyResult = await tallyConnector.createReceipt({
      partyName: bill.party_name,
      amount: amount,
      paymentMode: paymentMode || 'Cash',
      billNumber: bill.voucher_number,
      narration: `Payment for ${bill.voucher_number} via Dashboard`
    });

    if (tallyResult.success) {
      // Update receipt sync status
      db.updateReceiptSync(receiptId, tallyResult.guid || null, true);

      // Update bill payment status
      const totalReceived = (bill.amount_received || 0) + amount;
      const newStatus = totalReceived >= bill.amount ? 'paid' : 'partial';
      db.updateBillPaymentStatus(billId, newStatus, totalReceived);

      // Broadcast update
      const io = req.app.get('io');
      if (io) {
        io.emit('payment:created', {
          billId,
          amount,
          newStatus,
          voucherNumber: bill.voucher_number,
          partyName: bill.party_name
        });
      }

      res.json({
        success: true,
        receiptId,
        syncedToTally: true,
        billStatus: newStatus
      });
    } else {
      // Tally sync failed - keep in queue for retry
      db.updateReceiptSync(receiptId, null, false, tallyResult.error);

      res.status(500).json({
        success: false,
        error: 'Failed to sync with Tally',
        details: tallyResult.error,
        receiptId
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payments
 * Get payment history
 */
router.get('/payments', (req, res) => {
  try {
    const { billId } = req.query;

    if (billId) {
      const receipts = db.getReceiptsByBill(billId);
      return res.json(receipts);
    }

    // Get today's receipts
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const bills = db.getBillsByDate(today).filter(b =>
      config.voucherTypes.receipt.includes(b.voucher_type)
    );
    res.json(bills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== DAYBOOK ====================

/**
 * GET /api/daybook
 * Get columnar daybook
 */
router.get('/daybook', (req, res) => {
  try {
    const { date, voucherTypes } = req.query;

    const queryDate = date || new Date().toISOString().split('T')[0].replace(/-/g, '');
    const types = voucherTypes ? voucherTypes.split(',') : null;

    const daybook = db.getDaybook(queryDate, types);

    // Calculate totals
    const totals = daybook.reduce((acc, row) => ({
      debit: acc.debit + (row.debit || 0),
      credit: acc.credit + (row.credit || 0)
    }), { debit: 0, credit: 0 });

    res.json({
      date: queryDate,
      entries: daybook,
      totals: {
        ...totals,
        balance: totals.debit - totals.credit
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/daybook/party-summary
 * Get party-wise summary
 */
router.get('/daybook/party-summary', (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const from = fromDate || today;
    const to = toDate || today;

    const summary = db.getPartySummary(from, to);

    // Calculate balances
    const result = summary.map(party => ({
      ...party,
      balance: party.total_debit - party.total_credit,
      status: party.total_debit <= party.total_credit ? 'cleared' : 'pending'
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SACKS ====================

/**
 * POST /api/sacks
 * Create new sack
 */
router.post('/sacks', (req, res) => {
  try {
    const { customerName, notes, userId } = req.body;

    if (!customerName) {
      return res.status(400).json({ error: 'customerName is required' });
    }

    const result = db.createSack({
      customerName,
      notes,
      createdBy: userId || 1
    });

    res.json({
      success: true,
      id: result.id,
      sackNumber: result.sackNumber
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sacks
 * Get all sacks
 */
router.get('/sacks', (req, res) => {
  try {
    const { status } = req.query;
    const sacks = db.getAllSacks(status);
    res.json(sacks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sacks/:id
 * Get sack with items
 */
router.get('/sacks/:id', (req, res) => {
  try {
    const sack = db.getSackById(req.params.id);
    if (!sack) {
      return res.status(404).json({ error: 'Sack not found' });
    }
    res.json(sack);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sacks/:id/items
 * Add item to sack
 */
router.post('/sacks/:id/items', (req, res) => {
  try {
    const sackId = parseInt(req.params.id);
    const { billId, externalVendor, externalAmount, description } = req.body;

    if (!billId && !externalVendor) {
      return res.status(400).json({ error: 'Either billId or externalVendor is required' });
    }

    // Verify sack exists
    const sack = db.getSackById(sackId);
    if (!sack) {
      return res.status(404).json({ error: 'Sack not found' });
    }

    // If billId provided, verify it exists
    if (billId) {
      const bill = db.getBillById(billId);
      if (!bill) {
        return res.status(404).json({ error: 'Bill not found' });
      }
    }

    const result = db.addSackItem({
      sackId,
      billId,
      externalVendor,
      externalAmount,
      description
    });

    res.json({
      success: true,
      itemId: result.lastInsertRowid
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/sacks/:id/status
 * Update sack status
 */
router.patch('/sacks/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['packing', 'ready', 'dispatched'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = db.updateSackStatus(req.params.id, status);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Sack not found' });
    }

    // Broadcast status change
    const io = req.app.get('io');
    if (io) {
      io.emit('sack:statusChanged', {
        sackId: parseInt(req.params.id),
        newStatus: status
      });
    }

    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== SYNC ====================

/**
 * GET /api/sync/status
 * Get sync status
 */
router.get('/sync/status', (req, res) => {
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
router.post('/sync/stop', (req, res) => {
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
router.post('/sync/start', async (req, res) => {
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
router.post('/sync/trigger', async (req, res) => {
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
 * Body: { fromDate: "YYYYMMDD", toDate: "YYYYMMDD" }
 */
router.post('/sync/date-range', async (req, res) => {
  try {
    const { fromDate, toDate } = req.body;

    if (!fromDate || !toDate) {
      return res.status(400).json({ error: 'fromDate and toDate are required (YYYYMMDD format)' });
    }

    // Validate date format
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
router.post('/sync/masters', async (req, res) => {
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
router.post('/sync/stock', async (req, res) => {
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
router.post('/sync/parties', async (req, res) => {
  try {
    const result = await syncService.syncParties();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sync/master-state
 * Get master sync state (last sync AlterIDs)
 */
router.get('/sync/master-state', (req, res) => {
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
router.post('/sync/reset-stock', async (req, res) => {
  try {
    // Clear stock items and reset alter_id
    db.clearStockItems();
    db.updateStockSyncState(0);

    // Trigger full sync
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
router.post('/sync/reset-parties', async (req, res) => {
  try {
    // Clear parties and reset alter_id
    db.clearParties();
    db.updatePartySyncState(0);

    // Trigger full sync
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
router.get('/sync/full-history/status', (req, res) => {
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
 * Fetches ALL vouchers from start date to today in batches
 *
 * Body (optional): {
 *   startDate: "YYYYMMDD" (default: 1 year ago),
 *   batchDays: number (default: 7)
 * }
 */
router.post('/sync/full-history', async (req, res) => {
  try {
    const { startDate, batchDays } = req.body;

    // Check if Tally is connected
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Cannot start full history sync.'
      });
    }

    // Start full sync (runs in background)
    console.log(`Starting full historical sync: startDate=${startDate || 'auto'}, batchDays=${batchDays || 7}`);

    // Send immediate response, sync runs asynchronously
    res.json({
      success: true,
      message: 'Full historical sync started. Check /api/sync/full-history/status for progress.',
      startDate: startDate || 'auto (1 year ago)',
      batchDays: batchDays || 7
    });

    // Run sync in background
    syncService.syncFullHistory(startDate, batchDays || 7)
      .then(result => {
        console.log('Full sync completed:', result);
      })
      .catch(err => {
        console.error('Full sync failed:', err.message);
      });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/full-history/resume
 * Resume an interrupted full historical sync
 */
router.post('/sync/full-history/resume', async (req, res) => {
  try {
    // Check if Tally is connected
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

    // Resume in background
    syncService.resumeFullSync()
      .then(result => {
        console.log('Resume sync completed:', result);
      })
      .catch(err => {
        console.error('Resume sync failed:', err.message);
      });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sync/full-history/reset
 * Reset full sync state (to start fresh)
 */
router.post('/sync/full-history/reset', (req, res) => {
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

// ==================== VOUCHER HISTORY ====================

/**
 * GET /api/voucher-history/stats
 * Get history statistics (MUST be before :masterId route)
 */
router.get('/voucher-history/stats', (req, res) => {
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
router.get('/voucher-history/recent-changes', (req, res) => {
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
router.get('/voucher-history/by-alterid/:alterId', (req, res) => {
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
router.get('/voucher-history', (req, res) => {
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
router.get('/voucher-history/:masterId/changes', (req, res) => {
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
router.get('/voucher-history/:masterId', (req, res) => {
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

/**
 * GET /api/voucher-history/recent-changes
 * Get recent field-level changes across all vouchers
 */
router.get('/voucher-history/recent-changes', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const changes = db.getRecentChanges(limit);

    res.json({
      success: true,
      count: changes.length,
      changes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voucher-history/stats
 * Get history statistics
 */
router.get('/voucher-history/stats', (req, res) => {
  try {
    const stats = db.getHistoryStats();

    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tally/status
 * Check Tally connection
 */
router.get('/tally/status', async (req, res) => {
  try {
    const status = await tallyConnector.checkConnection();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tally/companies
 * Get list of companies from Tally
 */
router.get('/tally/companies', async (req, res) => {
  try {
    const companies = await tallyConnector.getCompanies();
    const activeCompany = tallyConnector.companyName || config.tally.companyName;
    res.json({
      companies,
      activeCompany
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tally/company
 * Set active company
 */
router.post('/tally/company', async (req, res) => {
  try {
    const { companyName } = req.body;
    if (!companyName) {
      return res.status(400).json({ error: 'companyName is required' });
    }

    // Set the active company
    tallyConnector.setCompany(companyName);

    // Clear existing data and re-sync with new company
    // Note: In production, you might want to keep data separate per company

    res.json({
      success: true,
      activeCompany: companyName,
      message: 'Company changed. Data will sync on next interval.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== STOCK ITEMS ====================

/**
 * GET /api/stock
 * Get all stock items from local database (synced from Tally)
 */
router.get('/stock', (req, res) => {
  try {
    const { search } = req.query;
    let items;

    if (search) {
      items = db.searchStockItems(search);
    } else {
      items = db.getAllStockItems();
    }

    res.json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stock/summary
 * Get stock items with balance > 0 (inventory on hand)
 */
router.get('/stock/summary', (req, res) => {
  try {
    const allItems = db.getAllStockItems();
    const items = allItems.filter(item => item.closingBalance > 0);
    res.json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stock/search
 * Search stock items by name
 */
router.get('/stock/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }
    const items = db.searchStockItems(q);
    res.json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stock/tally
 * Fetch stock items directly from Tally (use sparingly)
 */
router.get('/stock/tally', async (req, res) => {
  try {
    const items = await tallyConnector.getStockItems();
    res.json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== LEDGERS (PARTIES) ====================

/**
 * GET /api/ledgers
 * Get all parties from local database (synced from Tally)
 */
router.get('/ledgers', (req, res) => {
  try {
    const { search } = req.query;
    let ledgers;

    if (search) {
      ledgers = db.searchParties(search);
    } else {
      ledgers = db.getAllParties();
    }

    res.json({
      success: true,
      count: ledgers.length,
      ledgers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledgers/debtors
 * Get Sundry Debtors (customers) from local database
 */
router.get('/ledgers/debtors', (req, res) => {
  try {
    const { search } = req.query;
    let ledgers = db.getDebtors();

    if (search) {
      const searchLower = search.toLowerCase();
      ledgers = ledgers.filter(l => l.name.toLowerCase().includes(searchLower));
    }

    res.json({
      success: true,
      count: ledgers.length,
      ledgers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledgers/creditors
 * Get Sundry Creditors (vendors) from local database
 */
router.get('/ledgers/creditors', (req, res) => {
  try {
    const { search } = req.query;
    let ledgers = db.getCreditors();

    if (search) {
      const searchLower = search.toLowerCase();
      ledgers = ledgers.filter(l => l.name.toLowerCase().includes(searchLower));
    }

    res.json({
      success: true,
      count: ledgers.length,
      ledgers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledgers/search
 * Search parties by name
 */
router.get('/ledgers/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }
    const ledgers = db.searchParties(q);
    res.json({
      success: true,
      count: ledgers.length,
      ledgers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledgers/tally
 * Fetch ledgers directly from Tally (use sparingly)
 */
router.get('/ledgers/tally', async (req, res) => {
  try {
    const { group } = req.query;
    const parentGroup = group || 'Sundry Debtors';
    const ledgers = await tallyConnector.getLedgers(parentGroup);
    res.json({
      success: true,
      count: ledgers.length,
      ledgers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledgers/sales
 * Fetch sales ledgers from Tally (for invoice creation)
 */
router.get('/ledgers/sales', async (req, res) => {
  try {
    const ledgers = await tallyConnector.getLedgers('Sales Accounts');
    res.json({
      success: true,
      count: ledgers.length,
      ledgers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== INVOICE CREATION ====================

/**
 * POST /api/invoice
 * Create Sales Invoice in Tally (with inventory items)
 * If Tally is offline, saves locally with daily invoice number (DB-YYYYMMDD-NNN)
 * Body: { partyName, items: [{stockItem, quantity, rate, unit}], narration, voucherType, salesLedger }
 */
router.post('/invoice', async (req, res) => {
  try {
    const { partyName, items, narration, voucherType, salesLedger, date } = req.body;

    if (!partyName) {
      return res.status(400).json({ error: 'partyName is required' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required with at least one item' });
    }

    // Validate items
    for (const item of items) {
      if (!item.stockItem) {
        return res.status(400).json({ error: 'Each item must have stockItem name' });
      }
      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({ error: 'Each item must have valid quantity' });
      }
      if (!item.rate || item.rate <= 0) {
        return res.status(400).json({ error: 'Each item must have valid rate' });
      }
    }

    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => sum + (item.amount || item.quantity * item.rate), 0);

    console.log('Creating invoice with items:', JSON.stringify(items, null, 2));

    // Check if Tally is connected
    const connectionStatus = await tallyConnector.checkConnection();

    if (connectionStatus.connected) {
      // Tally is online - try to create invoice directly
      try {
        const result = await tallyConnector.createSalesInvoice({
          partyName,
          items,
          narration: narration || 'Invoice created via Dashboard',
          voucherType: voucherType || 'Sales',
          salesLedger: salesLedger || '1 Sales A/c',
          date
        });

        if (result.success) {
          return res.json({
            success: true,
            message: 'Invoice created successfully in Tally',
            created: result.created,
            mode: 'online'
          });
        } else {
          // Tally returned error - save locally
          console.log('Tally error, saving locally:', result.error);
          const pending = db.createPendingInvoice({
            partyName,
            items,
            totalAmount,
            narration: narration || 'Invoice created via Dashboard',
            voucherType: voucherType || 'Sales',
            salesLedger: salesLedger || '1 Sales A/c',
            date
          });

          return res.json({
            success: true,
            message: `Invoice saved locally (Tally error: ${result.error}). Will sync when Tally is available.`,
            invoiceNumber: pending.invoiceNumber,
            mode: 'offline',
            pendingId: pending.id
          });
        }
      } catch (tallyError) {
        // Network error during creation - save locally
        console.log('Tally network error, saving locally:', tallyError.message);
        const pending = db.createPendingInvoice({
          partyName,
          items,
          totalAmount,
          narration: narration || 'Invoice created via Dashboard',
          voucherType: voucherType || 'Sales',
          salesLedger: salesLedger || '1 Sales A/c',
          date
        });

        return res.json({
          success: true,
          message: 'Invoice saved locally. Will sync when Tally is available.',
          invoiceNumber: pending.invoiceNumber,
          mode: 'offline',
          pendingId: pending.id
        });
      }
    } else {
      // Tally is offline - save locally
      console.log('Tally offline, saving invoice locally');
      const pending = db.createPendingInvoice({
        partyName,
        items,
        totalAmount,
        narration: narration || 'Invoice created via Dashboard',
        voucherType: voucherType || 'Sales',
        salesLedger: salesLedger || '1 Sales A/c',
        date
      });

      return res.json({
        success: true,
        message: 'Tally is offline. Invoice saved locally and will sync when Tally is available.',
        invoiceNumber: pending.invoiceNumber,
        mode: 'offline',
        pendingId: pending.id
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PENDING INVOICES (OFFLINE MODE) ====================

/**
 * GET /api/pending-invoices
 * Get all pending invoices waiting to sync
 */
router.get('/pending-invoices', (req, res) => {
  try {
    const invoices = db.getAllPendingInvoices();
    // Parse items JSON for each invoice
    const parsed = invoices.map(inv => ({
      ...inv,
      items: JSON.parse(inv.items)
    }));
    res.json({
      success: true,
      count: parsed.length,
      invoices: parsed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pending-invoices/count
 * Get count of pending invoices
 */
router.get('/pending-invoices/count', (req, res) => {
  try {
    const count = db.getPendingInvoiceCount();
    const todayCount = db.getTodayInvoiceCount();
    res.json({
      success: true,
      pendingCount: count,
      todayInvoiceCount: todayCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pending-invoices/sync
 * Manually trigger sync of all pending invoices
 */
router.post('/pending-invoices/sync', async (req, res) => {
  try {
    // Check Tally connection first
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Cannot sync pending invoices.'
      });
    }

    const pendingInvoices = db.getPendingInvoices();
    if (pendingInvoices.length === 0) {
      return res.json({
        success: true,
        message: 'No pending invoices to sync',
        synced: 0,
        failed: 0
      });
    }

    let synced = 0;
    let failed = 0;
    const errors = [];

    for (const invoice of pendingInvoices) {
      try {
        const items = JSON.parse(invoice.items);
        const result = await tallyConnector.createSalesInvoice({
          partyName: invoice.party_name,
          items,
          narration: invoice.narration || `Dashboard Invoice: ${invoice.invoice_number}`,
          voucherType: invoice.voucher_type || 'Sales',
          salesLedger: invoice.sales_ledger || '1 Sales A/c',
          date: invoice.invoice_date
        });

        if (result.success) {
          db.updatePendingInvoiceStatus(invoice.id, 'synced');
          synced++;
          console.log(`Synced pending invoice ${invoice.invoice_number} to Tally`);
        } else {
          db.updatePendingInvoiceStatus(invoice.id, 'failed', result.error);
          failed++;
          errors.push({ invoiceNumber: invoice.invoice_number, error: result.error });
        }
      } catch (err) {
        db.updatePendingInvoiceStatus(invoice.id, 'failed', err.message);
        failed++;
        errors.push({ invoiceNumber: invoice.invoice_number, error: err.message });
      }
    }

    res.json({
      success: true,
      message: `Sync complete: ${synced} synced, ${failed} failed`,
      synced,
      failed,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/pending-invoices/:id
 * Delete a pending invoice
 */
router.delete('/pending-invoices/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.db.prepare('DELETE FROM pending_invoices WHERE id = ?').run(id);
    res.json({ success: true, message: 'Pending invoice deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/godowns
 * Fetch godowns (warehouses) from Tally
 */
router.get('/godowns', async (req, res) => {
  try {
    const godowns = await tallyConnector.getGodowns();
    res.json({
      success: true,
      count: godowns.length,
      godowns
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== RECEIPT CREATION ====================

/**
 * POST /api/receipt
 * Create Receipt voucher in Tally with multiple payment modes
 *
 * Payment Modes (Ledger Names):
 *   - cashTeller1: Cash Teller 1
 *   - cashTeller2: Cash Teller 2
 *   - chequeReceipt: Cheque receipt
 *   - qrCode: Q/R code
 *   - discount: Discount
 *   - bankDeposit: Bank Deposit(All)
 *   - esewa: Esewa
 *
 * Body: { partyName, voucherType, narration, paymentModes: { cashTeller1, cashTeller2, chequeReceipt, qrCode, discount, bankDeposit, esewa } }
 */
router.post('/receipt', async (req, res) => {
  try {
    const { partyName, voucherType, narration, paymentModes, date } = req.body;

    if (!partyName) {
      return res.status(400).json({ error: 'partyName is required' });
    }

    // Calculate total from payment modes
    const total =
      (parseFloat(paymentModes?.cashTeller1) || 0) +
      (parseFloat(paymentModes?.cashTeller2) || 0) +
      (parseFloat(paymentModes?.chequeReceipt) || 0) +
      (parseFloat(paymentModes?.qrCode) || 0) +
      (parseFloat(paymentModes?.discount) || 0) +
      (parseFloat(paymentModes?.bankDeposit) || 0) +
      (parseFloat(paymentModes?.esewa) || 0);

    if (total <= 0) {
      return res.status(400).json({ error: 'At least one payment mode must have a value' });
    }

    console.log('=== CREATE RECEIPT REQUEST ===');
    console.log('Party:', partyName);
    console.log('Payment Breakdown:');
    console.log('  Cash Teller 1:', paymentModes?.cashTeller1 || 0);
    console.log('  Cash Teller 2:', paymentModes?.cashTeller2 || 0);
    console.log('  Cheque receipt:', paymentModes?.chequeReceipt || 0);
    console.log('  Q/R code:', paymentModes?.qrCode || 0);
    console.log('  Discount:', paymentModes?.discount || 0);
    console.log('  Bank Deposit(All):', paymentModes?.bankDeposit || 0);
    console.log('  Esewa:', paymentModes?.esewa || 0);
    console.log('  Total:', total);

    // Check if Tally is connected
    const connectionStatus = await tallyConnector.checkConnection();

    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Receipt creation requires Tally to be online.'
      });
    }

    const result = await tallyConnector.createReceiptWithPaymentModes({
      partyName,
      voucherType: voucherType || 'Receipt',
      narration: narration || 'Receipt via Dashboard',
      paymentModes: paymentModes || {},
      date
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Receipt created successfully in Tally',
        total,
        created: result.created,
        paymentBreakdown: {
          cashTeller1: parseFloat(paymentModes?.cashTeller1) || 0,
          cashTeller2: parseFloat(paymentModes?.cashTeller2) || 0,
          chequeReceipt: parseFloat(paymentModes?.chequeReceipt) || 0,
          qrCode: parseFloat(paymentModes?.qrCode) || 0,
          discount: parseFloat(paymentModes?.discount) || 0,
          bankDeposit: parseFloat(paymentModes?.bankDeposit) || 0,
          esewa: parseFloat(paymentModes?.esewa) || 0
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to create receipt'
      });
    }
  } catch (error) {
    console.error('Receipt creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/voucher-types
 * Get available voucher types for the dropdown
 */
router.get('/voucher-types', (req, res) => {
  res.json({
    success: true,
    voucherTypes: [
      { value: 'Sales', label: 'Sales' },
      { value: 'Credit Sales', label: 'Credit Sales' },
      { value: 'Pending Sales Bill', label: 'Pending Sales Bill' },
      { value: 'Receipt', label: 'Receipt' },
      { value: 'Payment', label: 'Payment' },
      { value: 'Journal', label: 'Journal' },
      { value: 'Contra', label: 'Contra' }
    ]
  });
});

// ==================== PENDING SALES BILLS (RECEIPT WORKFLOW) ====================

/**
 * GET /api/pending-sales-bills
 * Get all Pending Sales Bills from Tally (waiting for payment confirmation)
 */
router.get('/pending-sales-bills', async (req, res) => {
  try {
    // Check if Tally is connected
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Cannot fetch pending bills.'
      });
    }

    const bills = await tallyConnector.getPendingSalesBills();
    res.json({
      success: true,
      count: bills.length,
      bills
    });
  } catch (error) {
    console.error('Error fetching pending sales bills:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/voucher/:masterId/complete-payment
 * Complete payment for a Pending Sales Bill
 * - Changes voucher type based on payment:
 *   - Full Payment (payment >= bill amount) → "Sales"
 *   - Partial Payment (payment < bill amount) → "Credit Sales"
 * - Updates UDF fields (SFL1-SFL7, SFLTot) with payment breakdown
 *
 * Body: {
 *   paymentModes: { cashTeller1, cashTeller2, chequeReceipt, qrCode, discount, bankDeposit, esewa },
 *   newVoucherType,
 *   billAmount,
 *   voucherNumber,
 *   originalVoucherType
 * }
 *
 * Payment Modes (Ledger Names):
 *   - SFL1: Cash Teller 1
 *   - SFL2: Cash Teller 2
 *   - SFL3: Cheque receipt
 *   - SFL4: Q/R code
 *   - SFL5: Discount
 *   - SFL6: Bank Deposit(All)
 *   - SFL7: Esewa
 *   - SFLTot: Total (auto-calculated)
 */
router.put('/voucher/:masterId/complete-payment', async (req, res) => {
  try {
    const { masterId } = req.params;
    const {
      paymentModes,
      newVoucherType,
      billAmount,
      voucherNumber,
      originalVoucherType = 'Pending Sales Bill'
    } = req.body;

    if (!masterId) {
      return res.status(400).json({ error: 'masterId is required' });
    }

    // Calculate total from payment modes (new field names)
    const total =
      (parseFloat(paymentModes?.cashTeller1) || 0) +
      (parseFloat(paymentModes?.cashTeller2) || 0) +
      (parseFloat(paymentModes?.chequeReceipt) || 0) +
      (parseFloat(paymentModes?.qrCode) || 0) +
      (parseFloat(paymentModes?.discount) || 0) +
      (parseFloat(paymentModes?.bankDeposit) || 0) +
      (parseFloat(paymentModes?.esewa) || 0);

    if (total <= 0) {
      return res.status(400).json({ error: 'At least one payment mode must have a value' });
    }

    // Determine voucher type based on payment vs bill amount
    // Full Payment → Sales, Partial Payment → Credit Sales
    let finalVoucherType = newVoucherType;
    if (!finalVoucherType && billAmount) {
      finalVoucherType = total >= billAmount ? 'Sales' : 'Credit Sales';
    }
    finalVoucherType = finalVoucherType || 'Sales';

    // Check if Tally is connected
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Cannot update voucher.'
      });
    }

    console.log(`=== COMPLETE PAYMENT REQUEST ===`);
    console.log(`Voucher: ${voucherNumber || masterId}`);
    console.log(`MasterID: ${masterId}`);
    console.log(`Bill Amount: ${billAmount || 'N/A'}`);
    console.log(`Total Payment: ${total}`);
    console.log(`Type Change: ${originalVoucherType} -> ${finalVoucherType}`);
    console.log(`Payment Breakdown (UDF Fields):`);
    console.log(`  SFL1 (Cash Teller 1): ${paymentModes?.cashTeller1 || 0}`);
    console.log(`  SFL2 (Cash Teller 2): ${paymentModes?.cashTeller2 || 0}`);
    console.log(`  SFL3 (Cheque receipt): ${paymentModes?.chequeReceipt || 0}`);
    console.log(`  SFL4 (Q/R code): ${paymentModes?.qrCode || 0}`);
    console.log(`  SFL5 (Discount): ${paymentModes?.discount || 0}`);
    console.log(`  SFL6 (Bank Deposit): ${paymentModes?.bankDeposit || 0}`);
    console.log(`  SFL7 (Esewa): ${paymentModes?.esewa || 0}`);

    const result = await tallyConnector.alterVoucherWithPayment({
      masterId,
      voucherNumber,
      newVoucherType: finalVoucherType,
      originalVoucherType,
      paymentModes: paymentModes || {}
    });

    if (result.success) {
      res.json({
        success: true,
        message: `Voucher updated to ${finalVoucherType} with payment UDF fields (SFL1-SFL7)`,
        total,
        newVoucherType: finalVoucherType,
        altered: result.altered || 1,
        paymentBreakdown: {
          cashTeller1: parseFloat(paymentModes?.cashTeller1) || 0,
          cashTeller2: parseFloat(paymentModes?.cashTeller2) || 0,
          chequeReceipt: parseFloat(paymentModes?.chequeReceipt) || 0,
          qrCode: parseFloat(paymentModes?.qrCode) || 0,
          discount: parseFloat(paymentModes?.discount) || 0,
          bankDeposit: parseFloat(paymentModes?.bankDeposit) || 0,
          esewa: parseFloat(paymentModes?.esewa) || 0
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to update voucher'
      });
    }
  } catch (error) {
    console.error('Error completing payment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pending-sales-bills/:masterId/complete
 * Complete payment on a Pending Sales Bill - EDIT ONLY (no deletion)
 * This method EDITS the existing voucher to:
 * 1. Change voucher type (Sales or Credit Sales)
 * 2. Add UDF fields (SFL1-SFL7, SFLTot) with payment breakdown
 *
 * Body: {
 *   partyName,
 *   amount,       // Bill amount
 *   date,         // Original voucher date (YYYYMMDD)
 *   voucherNumber,
 *   guid,
 *   paymentModes: { cashTeller1, cashTeller2, chequeReceipt, qrCode, discount, bankDeposit, esewa }
 * }
 *
 * UDF Fields saved on the voucher:
 *   - SFL1: Cash Teller 1
 *   - SFL2: Cash Teller 2
 *   - SFL3: Cheque receipt
 *   - SFL4: Q/R code
 *   - SFL5: Discount
 *   - SFL6: Bank Deposit(All)
 *   - SFL7: Esewa
 *   - SFLTot: Total (auto-calculated)
 */
router.post('/pending-sales-bills/:masterId/complete', async (req, res) => {
  try {
    const { masterId } = req.params;
    const {
      partyName,
      amount,
      date,
      voucherNumber,
      guid,
      paymentModes
    } = req.body;

    if (!masterId) {
      return res.status(400).json({ error: 'masterId is required' });
    }

    if (!partyName) {
      return res.status(400).json({ error: 'partyName is required' });
    }

    // Calculate total from payment modes
    const total =
      (parseFloat(paymentModes?.cashTeller1) || 0) +
      (parseFloat(paymentModes?.cashTeller2) || 0) +
      (parseFloat(paymentModes?.chequeReceipt) || 0) +
      (parseFloat(paymentModes?.qrCode) || 0) +
      (parseFloat(paymentModes?.discount) || 0) +
      (parseFloat(paymentModes?.bankDeposit) || 0) +
      (parseFloat(paymentModes?.esewa) || 0);

    if (total <= 0) {
      return res.status(400).json({ error: 'At least one payment mode must have a value' });
    }

    // Determine voucher type based on payment vs bill amount
    // Full Payment → Sales, Partial Payment → Credit Sales
    const billAmount = parseFloat(amount) || 0;
    const newVoucherType = total >= billAmount ? 'Sales' : 'Credit Sales';

    // Check if Tally is connected
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Cannot complete payment.'
      });
    }

    console.log(`=== COMPLETE PAYMENT (NEW METHOD) ===`);
    console.log(`Voucher: ${voucherNumber}`);
    console.log(`MasterID: ${masterId}`);
    console.log(`Party: ${partyName}`);
    console.log(`Bill Amount: ${billAmount}`);
    console.log(`Total Payment: ${total}`);
    console.log(`New Voucher Type: ${newVoucherType}`);
    console.log(`Payment UDF Fields:`);
    console.log(`  SFL1 (Cash Teller 1): ${paymentModes?.cashTeller1 || 0}`);
    console.log(`  SFL2 (Cash Teller 2): ${paymentModes?.cashTeller2 || 0}`);
    console.log(`  SFL3 (Cheque receipt): ${paymentModes?.chequeReceipt || 0}`);
    console.log(`  SFL4 (Q/R code): ${paymentModes?.qrCode || 0}`);
    console.log(`  SFL5 (Discount): ${paymentModes?.discount || 0}`);
    console.log(`  SFL6 (Bank Deposit): ${paymentModes?.bankDeposit || 0}`);
    console.log(`  SFL7 (Esewa): ${paymentModes?.esewa || 0}`);

    const result = await tallyConnector.completePaymentOnBill({
      masterId,
      guid,
      date,
      voucherNumber,
      partyName,
      amount: billAmount,
      newVoucherType,
      paymentModes: paymentModes || {}
    });

    if (result.success) {
      res.json({
        success: true,
        message: `Bill updated to ${newVoucherType} with payment UDF fields (no deletion)`,
        total,
        newVoucherType,
        paymentBreakdown: {
          cashTeller1: parseFloat(paymentModes?.cashTeller1) || 0,
          cashTeller2: parseFloat(paymentModes?.cashTeller2) || 0,
          chequeReceipt: parseFloat(paymentModes?.chequeReceipt) || 0,
          qrCode: parseFloat(paymentModes?.qrCode) || 0,
          discount: parseFloat(paymentModes?.discount) || 0,
          bankDeposit: parseFloat(paymentModes?.bankDeposit) || 0,
          esewa: parseFloat(paymentModes?.esewa) || 0
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to update bill with payment'
      });
    }
  } catch (error) {
    console.error('Error updating bill with payment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/invoice/simple
 * Create simple Sales voucher (without inventory - for services)
 * Body: { partyName, amount, narration, voucherType, salesLedger }
 */
router.post('/invoice/simple', async (req, res) => {
  try {
    const { partyName, amount, narration, voucherType, salesLedger, date } = req.body;

    if (!partyName) {
      return res.status(400).json({ error: 'partyName is required' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const result = await tallyConnector.createSimpleSalesVoucher({
      partyName,
      amount,
      narration: narration || 'Sales via Dashboard',
      voucherType: voucherType || 'Sales',
      salesLedger: salesLedger || 'Sales Account',
      date
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Sales voucher created successfully in Tally',
        created: result.created
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to create sales voucher'
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== USERS ====================

/**
 * POST /api/auth/login
 * Simple login (for development - use proper auth in production!)
 */
router.post('/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;

    const user = db.getUserByUsername(username);
    if (!user || user.password_hash !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // In production, use JWT tokens!
    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        language: user.language
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/users
 * Get all users (admin only in production)
 */
router.get('/users', (req, res) => {
  try {
    const users = db.getAllUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/users
 * Create new user
 */
router.post('/users', (req, res) => {
  try {
    const { username, password, displayName, role, language } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'username and password required' });
    }

    const result = db.createUser({
      username,
      password,  // Should hash in production!
      displayName: displayName || username,
      role: role || 'cashier',
      language: language || 'en'
    });

    res.json({
      success: true,
      userId: result.lastInsertRowid
    });
  } catch (error) {
    if (error.message.includes('UNIQUE')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/users/:id/notifications
 * Update user notification preferences
 */
router.patch('/users/:id/notifications', (req, res) => {
  try {
    const { notifyNewBill, notifyPayment, notifyLargeBill, notifyDispatch, largeBillThreshold } = req.body;

    const result = db.updateUserNotificationPrefs(req.params.id, {
      notifyNewBill,
      notifyPayment,
      notifyLargeBill,
      notifyDispatch,
      largeBillThreshold
    });

    if (result.changes === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== NOTIFICATIONS ====================

/**
 * GET /api/notifications
 * Get user's unread notifications
 */
router.get('/notifications', (req, res) => {
  try {
    const userId = req.query.userId || 1;  // In production, get from auth token
    const notifications = db.getUnreadNotifications(userId);
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Mark notification as read
 */
router.patch('/notifications/:id/read', (req, res) => {
  try {
    db.markNotificationRead(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CONFIG ====================

/**
 * GET /api/config/voucher-types
 * Get configured voucher types
 */
router.get('/config/voucher-types', (req, res) => {
  res.json(config.voucherTypes);
});

/**
 * GET /api/config/bill-statuses
 * Get bill status options
 */
router.get('/config/bill-statuses', (req, res) => {
  res.json(config.billStatus);
});

// ==================== FONEPAY ====================

/**
 * GET /api/fonepay/dashboard
 * Get Fonepay dashboard summary
 */
router.get('/fonepay/dashboard', (req, res) => {
  try {
    const dashboard = db.getFonepayDashboard();
    const serviceStatus = fonepayService.getStatus();
    res.json({
      success: true,
      ...dashboard,
      service: serviceStatus
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fonepay/status
 * Get Fonepay sync service status
 */
router.get('/fonepay/status', (req, res) => {
  try {
    const status = fonepayService.getStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fonepay/sync
 * Manually trigger Fonepay sync
 */
router.post('/fonepay/sync', async (req, res) => {
  try {
    const result = await fonepayService.syncNow();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fonepay/start
 * Start Fonepay sync service
 */
router.post('/fonepay/start', async (req, res) => {
  try {
    const started = await fonepayService.start();
    res.json({
      success: started,
      message: started ? 'Fonepay sync service started' : 'Failed to start (check credentials)',
      status: fonepayService.getStatus()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fonepay/stop
 * Stop Fonepay sync service
 */
router.post('/fonepay/stop', async (req, res) => {
  try {
    await fonepayService.stop();
    res.json({
      success: true,
      message: 'Fonepay sync service stopped',
      status: fonepayService.getStatus()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/fonepay/credentials
 * Update Fonepay credentials
 */
router.put('/fonepay/credentials', (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    fonepayService.updateCredentials(username, password);
    res.json({
      success: true,
      message: 'Credentials updated. Restart the service to apply.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/fonepay/interval
 * Update sync interval
 */
router.put('/fonepay/interval', (req, res) => {
  try {
    const { intervalMs } = req.body;

    if (!intervalMs || intervalMs < 10000) {
      return res.status(400).json({ error: 'Interval must be at least 10000ms (10 seconds)' });
    }

    fonepayService.updateInterval(intervalMs);
    res.json({
      success: true,
      message: `Interval updated to ${intervalMs}ms`,
      status: fonepayService.getStatus()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fonepay/transactions
 * Get Fonepay transactions
 */
router.get('/fonepay/transactions', (req, res) => {
  try {
    const {
      limit = 1000,
      offset = 0,
      date,
      fromDate,
      toDate,
      initiator,
      amount,
      status,
      issuer
    } = req.query;

    let query = 'SELECT * FROM fonepay_transactions WHERE 1=1';
    const params = [];

    // Filter by single date
    if (date) {
      query += ' AND DATE(transaction_date) = DATE(?)';
      params.push(date);
    }

    // Filter by date range
    if (fromDate) {
      query += ' AND DATE(transaction_date) >= DATE(?)';
      params.push(fromDate);
    }
    if (toDate) {
      query += ' AND DATE(transaction_date) <= DATE(?)';
      params.push(toDate);
    }

    // Filter by initiator (phone number) - partial match
    if (initiator) {
      query += ' AND initiator LIKE ?';
      params.push(`%${initiator}%`);
    }

    // Filter by amount - partial match on string
    if (amount) {
      query += ' AND CAST(amount AS TEXT) LIKE ?';
      params.push(`%${amount}%`);
    }

    // Filter by status
    if (status && status !== 'all') {
      query += ' AND LOWER(status) = LOWER(?)';
      params.push(status);
    }

    // Filter by issuer
    if (issuer && issuer !== 'all') {
      query += ' AND LOWER(issuer_name) = LOWER(?)';
      params.push(issuer);
    }

    query += ' ORDER BY transaction_date DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const transactions = db.db.prepare(query).all(...params);

    // Get total count for pagination (without limit)
    let countQuery = query.replace(/ORDER BY.*$/, '').replace('SELECT *', 'SELECT COUNT(*) as total');
    countQuery = countQuery.replace(' LIMIT ? OFFSET ?', '');
    const countParams = params.slice(0, -2); // Remove limit and offset
    const totalResult = db.db.prepare(countQuery).get(...countParams);

    res.json({
      success: true,
      count: transactions.length,
      total: totalResult?.total || transactions.length,
      transactions
    });
  } catch (error) {
    console.error('Fonepay transactions error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fonepay/summary
 * Get Fonepay transaction summary
 */
router.get('/fonepay/summary', (req, res) => {
  try {
    const summary = db.db.prepare(`
      SELECT
        COUNT(*) as totalCount,
        COALESCE(SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END), 0) as totalAmount,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successCount,
        COUNT(CASE WHEN status = 'failed' OR status = 'failure' THEN 1 END) as failedCount
      FROM fonepay_transactions
    `).get();

    res.json({
      success: true,
      ...summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fonepay/transactions/today
 * Get today's Fonepay transactions
 */
router.get('/fonepay/transactions/today', (req, res) => {
  try {
    const transactions = db.getTodayFonepayTransactions();
    const total = transactions.reduce((sum, txn) => sum + (txn.amount || 0), 0);

    res.json({
      success: true,
      count: transactions.length,
      total,
      transactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fonepay/settlements
 * Get Fonepay settlements
 */
router.get('/fonepay/settlements', (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const settlements = db.getFonepaySettlements(parseInt(limit));

    res.json({
      success: true,
      count: settlements.length,
      settlements
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fonepay/balance
 * Get latest Fonepay balance
 */
router.get('/fonepay/balance', (req, res) => {
  try {
    const balance = db.getLatestFonepayBalance();
    res.json({
      success: true,
      ...balance
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fonepay/balance/history
 * Get Fonepay balance history
 */
router.get('/fonepay/balance/history', (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const history = db.getFonepayBalanceHistory(parseInt(limit));

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
 * POST /api/fonepay/historical
 * Fetch historical transactions from Fonepay portal with date range
 * Body: { fromDate: "YYYY-MM-DD", toDate: "YYYY-MM-DD" }
 */
router.post('/fonepay/historical', async (req, res) => {
  try {
    const { fromDate, toDate } = req.body;

    if (!fromDate || !toDate) {
      return res.status(400).json({ error: 'fromDate and toDate are required (YYYY-MM-DD format)' });
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(fromDate) || !dateRegex.test(toDate)) {
      return res.status(400).json({ error: 'Dates must be in YYYY-MM-DD format' });
    }

    console.log(`[Fonepay API] Fetching historical data from ${fromDate} to ${toDate}`);

    const result = await fonepayService.fetchHistoricalData(fromDate, toDate);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fonepay/qr/generate
 * Generate a dynamic QR code for payment collection
 * Body: { amount: number, remarks?: string }
 */
router.post('/fonepay/qr/generate', async (req, res) => {
  try {
    const { amount, remarks } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    console.log(`[Fonepay API] Generating QR for Rs. ${amount}`);

    const result = await fonepayService.generateQR(amount, remarks || '');

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
