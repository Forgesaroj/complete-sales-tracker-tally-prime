/**
 * API Routes
 * REST endpoints for the Dashboard
 */

import { Router } from 'express';
import { db } from '../services/database.js';
import { tallyConnector } from '../services/tallyConnector.js';
import { syncService } from '../services/syncService.js';
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
 * GET /api/vouchers
 * Get vouchers by type (Sales, Credit Sales, etc.)
 * Query params:
 *   - types: comma-separated voucher types (e.g., "Sales,Credit Sales")
 *   - limit: max number of results (default 200)
 */
router.get('/vouchers', (req, res) => {
  try {
    const { types, limit } = req.query;
    let vouchers;

    if (types) {
      const typeList = types.split(',').map(t => t.trim());
      vouchers = db.getRecentBillsByTypes(typeList, parseInt(limit) || 200);
    } else {
      vouchers = db.getRecentBills(parseInt(limit) || 200);
    }

    // Transform to frontend format
    const formattedVouchers = vouchers.map(v => ({
      id: v.id,
      masterId: v.master_id || v.id,
      guid: v.tally_guid,
      voucherNumber: v.voucher_number,
      date: v.voucher_date,
      partyName: v.party_name,
      amount: v.amount,
      voucherType: v.voucher_type,
      paymentStatus: v.payment_status,
      alterId: v.alter_id || 0,
      sfl1: v.sfl1 || 0,
      sfl2: v.sfl2 || 0,
      sfl3: v.sfl3 || 0,
      sfl4: v.sfl4 || 0,
      sfl5: v.sfl5 || 0,
      sfl6: v.sfl6 || 0,
      sfl7: v.sfl7 || 0,
      sflTot: v.sfl_tot || 0
    }));

    res.json({
      success: true,
      count: formattedVouchers.length,
      vouchers: formattedVouchers
    });
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
 * GET /api/tally/debug-ledger-vouchers
 * Debug endpoint to test ledger voucher fetching directly
 */
router.get('/tally/debug-ledger-vouchers', async (req, res) => {
  try {
    const { ledger } = req.query;
    if (!ledger) {
      return res.status(400).json({ error: 'ledger query param required' });
    }
    console.log('DEBUG: Fetching ledger vouchers for:', ledger);
    const vouchers = await tallyConnector.getLedgerVouchers(ledger);
    console.log('DEBUG: Got vouchers:', vouchers.length);
    res.json({
      ledger,
      count: vouchers.length,
      vouchers: vouchers.slice(0, 10) // Return first 10 for debugging
    });
  } catch (error) {
    console.error('DEBUG ERROR:', error);
    res.status(500).json({ error: error.message, stack: error.stack });
  }
});

/**
 * GET /api/all-vouchers
 * Get all vouchers from LOCAL DATABASE (fast loading)
 * First loads from cache, then optionally refreshes from Tally
 * Query params:
 *   - refresh: 'true' to force sync from Tally
 *   - search: search query for party name or voucher number
 *   - type: filter by voucher type
 *   - limit: max results (default 500)
 */
router.get('/all-vouchers', async (req, res) => {
  try {
    const { refresh, search, type, limit } = req.query;
    const maxLimit = parseInt(limit) || 500;

    // Check if we need to refresh from Tally
    const currentCount = db.getAllVouchersCount();
    const syncState = db.getAllVouchersSyncState();

    if (refresh === 'true' || currentCount === 0) {
      // Sync from Tally
      const connectionStatus = await tallyConnector.checkConnection();
      if (connectionStatus.connected) {
        console.log('Syncing all vouchers from Tally to database...');

        const toDate = tallyConnector.formatDate(new Date());
        const fromDate = tallyConnector.formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

        const vouchers = await tallyConnector.getVouchers(fromDate, toDate, null);
        if (vouchers && vouchers.length > 0) {
          db.upsertAllVouchers(vouchers);
          db.updateAllVouchersSyncState(vouchers.length, fromDate, toDate);
          console.log(`Synced ${vouchers.length} vouchers to database`);
        }
      } else if (currentCount === 0) {
        return res.status(503).json({
          success: false,
          error: 'Tally not connected and no cached data available'
        });
      }
    }

    // Get vouchers from database (fast)
    let vouchers;
    if (search) {
      vouchers = db.searchAllVouchers(search, maxLimit);
    } else if (type) {
      vouchers = db.getVouchersByType(type, maxLimit);
    } else {
      vouchers = db.getAllVouchers(maxLimit);
    }

    // Transform to frontend format
    const formattedVouchers = vouchers.map(v => ({
      masterId: v.master_id,
      guid: v.guid,
      voucherNumber: v.voucher_number,
      date: v.voucher_date,
      partyName: v.party_name,
      amount: v.amount,
      voucherType: v.voucher_type,
      alterId: v.alter_id || 0,
      narration: v.narration
    }));

    res.json({
      success: true,
      count: formattedVouchers.length,
      totalCached: db.getAllVouchersCount(),
      lastSync: syncState?.last_sync_time,
      fromDate: syncState?.from_date,
      toDate: syncState?.to_date,
      vouchers: formattedVouchers
    });
  } catch (error) {
    console.error('Error fetching all vouchers:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/all-vouchers/sync
 * Force sync all vouchers from Tally to local database
 * BATCHED: Fetches 7 days at a time to prevent Tally memory crashes
 */
router.post('/all-vouchers/sync', async (req, res) => {
  try {
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected'
      });
    }

    const { days = 30 } = req.body;
    const BATCH_DAYS = 7; // Fetch 7 days at a time to prevent memory issues
    const DELAY_MS = 500; // 500ms delay between batches

    const endDate = new Date();
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    let totalVouchers = 0;
    let currentEnd = new Date(endDate);

    console.log(`Syncing vouchers in ${BATCH_DAYS}-day batches from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}...`);

    // Process in batches from newest to oldest
    while (currentEnd > startDate) {
      const batchStart = new Date(Math.max(currentEnd.getTime() - BATCH_DAYS * 24 * 60 * 60 * 1000, startDate.getTime()));

      const fromDate = tallyConnector.formatDate(batchStart);
      const toDate = tallyConnector.formatDate(currentEnd);

      console.log(`  Batch: ${fromDate} to ${toDate}...`);

      try {
        const vouchers = await tallyConnector.getVouchers(fromDate, toDate, null);

        if (vouchers && vouchers.length > 0) {
          db.upsertAllVouchers(vouchers);
          totalVouchers += vouchers.length;
          console.log(`    Fetched ${vouchers.length} vouchers`);
        }
      } catch (batchError) {
        console.error(`    Batch error: ${batchError.message}`);
        // Continue with next batch even if one fails
      }

      // Move to next batch
      currentEnd = new Date(batchStart.getTime() - 1);

      // Small delay to let Tally recover
      if (currentEnd > startDate) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    // Update sync state
    const finalFromDate = tallyConnector.formatDate(startDate);
    const finalToDate = tallyConnector.formatDate(endDate);
    db.updateAllVouchersSyncState(totalVouchers, finalFromDate, finalToDate);

    res.json({
      success: true,
      count: totalVouchers,
      fromDate: finalFromDate,
      toDate: finalToDate,
      message: `Synced ${totalVouchers} vouchers to database (batched)`
    });
  } catch (error) {
    console.error('Error syncing all vouchers:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/all-vouchers/sync-incremental
 * Incremental sync - only fetch vouchers with AlterID greater than last sync
 * This is lightweight and won't crash Tally
 */
router.post('/all-vouchers/sync-incremental', async (req, res) => {
  try {
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected'
      });
    }

    // Get last alter_id from sync state
    const lastAlterId = db.getLastVoucherAlterId();
    console.log(`Incremental voucher sync: fetching vouchers with AlterID > ${lastAlterId}`);

    // Fetch only new/modified vouchers
    const vouchers = await tallyConnector.getVouchersIncremental(lastAlterId);

    if (vouchers && vouchers.length > 0) {
      // Find max alter_id from fetched vouchers
      let maxAlterId = lastAlterId;
      for (const v of vouchers) {
        const alterId = parseInt(v.alterId) || 0;
        if (alterId > maxAlterId) maxAlterId = alterId;
      }

      // Save to database
      db.upsertAllVouchers(vouchers);

      // Update sync state with new max alter_id
      const count = db.getAllVouchersCount();
      db.updateVoucherAlterId(maxAlterId);

      console.log(`Incremental sync complete: ${vouchers.length} new/modified vouchers, maxAlterId=${maxAlterId}`);

      res.json({
        success: true,
        count: vouchers.length,
        totalCount: count,
        lastAlterId: maxAlterId,
        message: `Synced ${vouchers.length} new/modified vouchers`
      });
    } else {
      res.json({
        success: true,
        count: 0,
        totalCount: db.getAllVouchersCount(),
        lastAlterId,
        message: 'No new vouchers to sync'
      });
    }
  } catch (error) {
    console.error('Error in incremental voucher sync:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/all-vouchers/recent
 * Get recently altered vouchers (ordered by alter_id DESC)
 */
router.get('/all-vouchers/recent', (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const vouchers = db.getRecentlyAlteredVouchers(parseInt(limit));
    const syncState = db.getAllVouchersSyncState();

    res.json({
      success: true,
      count: vouchers.length,
      totalCount: db.getAllVouchersCount(),
      lastAlterId: syncState?.last_alter_id || 0,
      lastSyncTime: syncState?.last_sync_time,
      vouchers
    });
  } catch (error) {
    console.error('Error fetching recent vouchers:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/all-vouchers/state
 * Get voucher sync state
 */
router.get('/all-vouchers/state', (req, res) => {
  try {
    const syncState = db.getAllVouchersSyncState();
    const count = db.getAllVouchersCount();
    const maxAlterId = db.getMaxVoucherAlterId();

    res.json({
      success: true,
      count,
      maxAlterId,
      lastSyncedAlterId: syncState?.last_alter_id || 0,
      lastSyncTime: syncState?.last_sync_time,
      fromDate: syncState?.from_date,
      toDate: syncState?.to_date
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/all-vouchers/sync-with-entries
 * Sync vouchers with their ledger entries for local balance calculation
 * Uses AlterID for incremental sync - only fetches new/modified vouchers
 */
router.post('/all-vouchers/sync-with-entries', async (req, res) => {
  try {
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected'
      });
    }

    // Get last synced AlterID
    const lastAlterId = db.getLastVoucherAlterId();
    console.log(`Syncing vouchers with ledger entries (AlterID > ${lastAlterId})...`);

    // Fetch vouchers with ledger entries
    const vouchers = await tallyConnector.getVouchersWithLedgerEntries(lastAlterId);

    if (!vouchers || vouchers.length === 0) {
      return res.json({
        success: true,
        count: 0,
        newVouchers: 0,
        alteredVouchers: 0,
        ledgerEntriesCount: 0,
        message: 'No new or altered vouchers to sync'
      });
    }

    let newCount = 0;
    let alteredCount = 0;
    let maxAlterId = lastAlterId;
    let totalLedgerEntries = 0;

    // Process each voucher
    for (const voucher of vouchers) {
      // Check if voucher exists (altered) or new
      const existingVoucher = db.db.prepare('SELECT master_id, alter_id FROM all_vouchers WHERE master_id = ?').get(voucher.masterId);

      if (existingVoucher) {
        alteredCount++;
      } else {
        newCount++;
      }

      // Upsert voucher
      db.upsertAllVoucher(voucher);

      // Upsert ledger entries
      if (voucher.ledgerEntries && voucher.ledgerEntries.length > 0) {
        db.upsertVoucherLedgerEntries(voucher.masterId, voucher.ledgerEntries, {
          date: voucher.date,
          voucherType: voucher.voucherType,
          voucherNumber: voucher.voucherNumber,
          alterId: voucher.alterId
        });
        totalLedgerEntries += voucher.ledgerEntries.length;
      }

      // Track max AlterID
      if (voucher.alterId > maxAlterId) {
        maxAlterId = voucher.alterId;
      }
    }

    // Update sync state
    db.updateVoucherAlterId(maxAlterId);

    // Get updated counts
    const voucherCount = db.getAllVouchersCount();
    const ledgerEntriesCount = db.getVoucherLedgerEntriesCount();

    res.json({
      success: true,
      count: vouchers.length,
      newVouchers: newCount,
      alteredVouchers: alteredCount,
      ledgerEntriesCount: totalLedgerEntries,
      totalVouchers: voucherCount,
      totalLedgerEntries: ledgerEntriesCount,
      lastAlterId: maxAlterId,
      message: `Synced ${vouchers.length} vouchers (${newCount} new, ${alteredCount} altered) with ${totalLedgerEntries} ledger entries`
    });
  } catch (error) {
    console.error('Error syncing vouchers with entries:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/all-vouchers/rebuild-entries
 * Rebuild all ledger entries from Tally using date-based batches
 * Fetches vouchers 7 days at a time to prevent Tally memory crash
 */
router.post('/all-vouchers/rebuild-entries', async (req, res) => {
  try {
    console.log('Rebuilding all voucher ledger entries from Tally (date-based batches)...');

    // Clear existing entries
    db.db.prepare('DELETE FROM voucher_ledger_entries').run();
    console.log('Cleared existing ledger entries');

    // Get the date range from synced vouchers
    const syncState = db.getAllVouchersSyncState();
    const fromDateStr = syncState?.from_date;
    const toDateStr = syncState?.to_date;

    if (!fromDateStr || !toDateStr) {
      return res.json({
        success: false,
        message: 'No voucher date range found. Please sync vouchers first.'
      });
    }

    // Parse dates (format: YYYYMMDD)
    const parseYYYYMMDD = (str) => {
      const y = parseInt(str.substring(0, 4));
      const m = parseInt(str.substring(4, 6)) - 1;
      const d = parseInt(str.substring(6, 8));
      return new Date(y, m, d);
    };

    const formatYYYYMMDD = (date) => {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}${m}${d}`;
    };

    const BATCH_DAYS = 7;
    const DELAY_MS = 500;

    let startDate = parseYYYYMMDD(fromDateStr);
    const endDate = parseYYYYMMDD(toDateStr);

    let totalVouchers = 0;
    let totalLedgerEntries = 0;
    let batchCount = 0;
    let maxAlterId = 0;

    console.log(`Processing vouchers from ${fromDateStr} to ${toDateStr}`);

    // Process in date batches
    while (startDate <= endDate) {
      const batchEnd = new Date(startDate);
      batchEnd.setDate(batchEnd.getDate() + BATCH_DAYS - 1);
      if (batchEnd > endDate) {
        batchEnd.setTime(endDate.getTime());
      }

      const fromStr = formatYYYYMMDD(startDate);
      const toStr = formatYYYYMMDD(batchEnd);

      console.log(`Batch ${batchCount + 1}: Fetching ${fromStr} to ${toStr}...`);

      const vouchers = await tallyConnector.getVouchersWithLedgerEntriesByDate(fromStr, toStr);
      console.log(`  Got ${vouchers.length} vouchers with entries`);

      // Process each voucher's ledger entries
      for (const voucher of vouchers) {
        if (voucher.ledgerEntries && voucher.ledgerEntries.length > 0) {
          db.upsertVoucherLedgerEntries(voucher.masterId, voucher.ledgerEntries, {
            date: voucher.date,
            voucherType: voucher.voucherType,
            voucherNumber: voucher.voucherNumber,
            alterId: voucher.alterId,
            guid: voucher.guid
          });
          totalLedgerEntries += voucher.ledgerEntries.length;
        }

        if (voucher.alterId > maxAlterId) {
          maxAlterId = voucher.alterId;
        }
      }

      totalVouchers += vouchers.length;
      batchCount++;

      // Move to next batch
      startDate = new Date(batchEnd);
      startDate.setDate(startDate.getDate() + 1);

      // Delay between batches to let Tally breathe
      if (startDate <= endDate) {
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      }
    }

    const ledgerEntriesCount = db.getVoucherLedgerEntriesCount();

    res.json({
      success: true,
      vouchersProcessed: totalVouchers,
      ledgerEntriesCreated: totalLedgerEntries,
      totalLedgerEntries: ledgerEntriesCount,
      maxAlterId,
      batchesProcessed: batchCount,
      dateRange: { from: fromDateStr, to: toDateStr },
      message: `Rebuilt ${ledgerEntriesCount} ledger entries from ${totalVouchers} vouchers in ${batchCount} batches`
    });
  } catch (error) {
    console.error('Error rebuilding ledger entries:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/all-vouchers/test-fetch
 * Test fetching vouchers with ledger entries from Tally (debug)
 */
router.get('/all-vouchers/test-fetch', async (req, res) => {
  try {
    const fromId = parseInt(req.query.from) || 150000;
    const toId = parseInt(req.query.to) || 155000;

    console.log(`Testing fetch: AlterID ${fromId} to ${toId}`);
    const vouchers = await tallyConnector.getVouchersWithLedgerEntriesByRange(fromId, toId);

    res.json({
      success: true,
      fromAlterId: fromId,
      toAlterId: toId,
      vouchersFound: vouchers.length,
      sample: vouchers.slice(0, 3).map(v => ({
        masterId: v.masterId,
        alterId: v.alterId,
        guid: v.guid,
        voucherType: v.voucherType,
        ledgerEntriesCount: v.ledgerEntries?.length || 0
      }))
    });
  } catch (error) {
    console.error('Error testing fetch:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledger/:name/balance
 * Get ledger balance calculated from local voucher data
 */
router.get('/ledger/:name/balance', (req, res) => {
  try {
    const ledgerName = decodeURIComponent(req.params.name);
    const { upToDate } = req.query;

    const balance = db.calculateLedgerBalance(ledgerName, upToDate);
    const entries = db.getLedgerEntries(ledgerName, 100);

    res.json({
      success: true,
      ledgerName,
      balance,
      recentEntries: entries.length,
      entries: entries.slice(0, 20) // Return first 20 for preview
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledger/:name/entries
 * Get all ledger entries from local voucher data
 */
router.get('/ledger/:name/entries', (req, res) => {
  try {
    const ledgerName = decodeURIComponent(req.params.name);
    const { from, to, limit = 500 } = req.query;

    let entries;
    if (from && to) {
      entries = db.getLedgerEntriesByDateRange(ledgerName, from, to);
    } else {
      entries = db.getLedgerEntries(ledgerName, parseInt(limit));
    }

    const balance = db.calculateLedgerBalance(ledgerName);

    res.json({
      success: true,
      ledgerName,
      count: entries.length,
      balance,
      entries
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledgers/balances
 * Get all ledger balances from local voucher data
 */
router.get('/ledgers/balances', (req, res) => {
  try {
    const balances = db.getAllLedgerBalances();
    res.json({
      success: true,
      count: balances.length,
      balances
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CHART OF ACCOUNTS ====================

/**
 * GET /api/chart-of-accounts
 * Get Chart of Accounts from LOCAL DATABASE (fast loading)
 * Query params:
 *   - refresh: 'true' to force sync from Tally
 *   - search: search query for ledger name
 */
router.get('/chart-of-accounts', async (req, res) => {
  try {
    const { refresh, search } = req.query;

    // Check if we need to refresh from Tally
    const groupsCount = db.getAccountGroupsCount();
    const ledgersCount = db.getAccountLedgersCount();
    const syncState = db.getCOASyncState();

    if (refresh === 'true' || (groupsCount === 0 && ledgersCount === 0)) {
      // Sync from Tally
      const connectionStatus = await tallyConnector.checkConnection();
      if (connectionStatus.connected) {
        console.log('Syncing Chart of Accounts from Tally...');

        // Fetch groups and ledgers
        const groups = await tallyConnector.getAllGroups();
        const ledgers = await tallyConnector.getAllLedgers();

        if (groups.length > 0) {
          db.upsertAccountGroups(groups);
        }
        if (ledgers.length > 0) {
          db.upsertAccountLedgers(ledgers);
        }
        db.updateCOASyncState(groups.length, ledgers.length);
        console.log(`Synced ${groups.length} groups and ${ledgers.length} ledgers`);
      } else if (groupsCount === 0 && ledgersCount === 0) {
        return res.status(503).json({
          success: false,
          error: 'Tally not connected and no cached data available'
        });
      }
    }

    // Get data from database
    let groups = db.getAllAccountGroups();
    let ledgers;

    if (search) {
      ledgers = db.searchAccountLedgers(search);
    } else {
      ledgers = db.getAllAccountLedgers();
    }

    // Build hierarchy
    const groupsMap = {};
    groups.forEach(g => {
      groupsMap[g.name] = {
        ...g,
        children: [],
        ledgers: []
      };
    });

    // Assign ledgers to groups
    ledgers.forEach(l => {
      if (groupsMap[l.parent]) {
        groupsMap[l.parent].ledgers.push(l);
      }
    });

    // Build group hierarchy
    groups.forEach(g => {
      if (g.parent && groupsMap[g.parent]) {
        groupsMap[g.parent].children.push(groupsMap[g.name]);
      }
    });

    // Get root groups (no parent or parent not in list)
    const rootGroups = groups
      .filter(g => !g.parent || !groupsMap[g.parent])
      .map(g => groupsMap[g.name]);

    res.json({
      success: true,
      groupsCount: db.getAccountGroupsCount(),
      ledgersCount: db.getAccountLedgersCount(),
      lastSync: syncState?.last_sync_time,
      groups: rootGroups,
      allGroups: groups,
      allLedgers: ledgers
    });
  } catch (error) {
    console.error('Error fetching chart of accounts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/chart-of-accounts/sync
 * Force sync Chart of Accounts from Tally
 * Fetches groups first, then ledgers with a delay to prevent memory issues
 */
router.post('/chart-of-accounts/sync', async (req, res) => {
  try {
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected'
      });
    }

    console.log('Syncing Chart of Accounts from Tally...');

    // Fetch groups first (smaller dataset)
    console.log('  Fetching groups...');
    const groups = await tallyConnector.getAllGroups();
    if (groups.length > 0) {
      db.upsertAccountGroups(groups);
      console.log(`  Saved ${groups.length} groups`);
    }

    // Small delay before fetching ledgers
    await new Promise(resolve => setTimeout(resolve, 500));

    // Fetch ledgers (larger dataset)
    console.log('  Fetching ledgers...');
    const ledgers = await tallyConnector.getAllLedgers();
    if (ledgers.length > 0) {
      db.upsertAccountLedgers(ledgers);
      console.log(`  Saved ${ledgers.length} ledgers`);
    }

    db.updateCOASyncState(groups.length, ledgers.length);

    res.json({
      success: true,
      groupsCount: groups.length,
      ledgersCount: ledgers.length,
      message: `Synced ${groups.length} groups and ${ledgers.length} ledgers`
    });
  } catch (error) {
    console.error('Error syncing chart of accounts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/chart-of-accounts/ledgers
 * Get all ledgers (flat list)
 */
router.get('/chart-of-accounts/ledgers', (req, res) => {
  try {
    const { group, search, withBalance } = req.query;

    let ledgers;
    if (search) {
      ledgers = db.searchAccountLedgers(search);
    } else if (group) {
      ledgers = db.getLedgersByGroup(group);
    } else if (withBalance === 'true') {
      ledgers = db.getLedgersWithBalance();
    } else {
      ledgers = db.getAllAccountLedgers();
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
 * GET /api/chart-of-accounts/groups
 * Get all groups
 */
router.get('/chart-of-accounts/groups', (req, res) => {
  try {
    const groups = db.getAllAccountGroups();
    res.json({
      success: true,
      count: groups.length,
      groups
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/chart-of-accounts/ledgers/:name/transactions
 * Get ledger account book (transaction history) for a specific ledger
 * First loads from cached vouchers in database (fast), then optionally fetches from Tally
 * Query params:
 *   - from: start date (YYYYMMDD)
 *   - to: end date (YYYYMMDD)
 *   - source: 'cache' (default) or 'tally' to force Tally fetch
 */
router.get('/chart-of-accounts/ledgers/:name/transactions', async (req, res) => {
  try {
    const ledgerName = decodeURIComponent(req.params.name);
    const { from, to, source } = req.query;

    let vouchers = [];

    // If source=tally, fetch directly from Tally (with other ledger details)
    if (source === 'tally') {
      const connectionStatus = await tallyConnector.checkConnection();
      if (connectionStatus.connected) {
        vouchers = await tallyConnector.getLedgerVouchers(ledgerName, from, to);
      }
    }

    // Otherwise use cached vouchers (fast but no other ledger details)
    if (vouchers.length === 0 && source !== 'tally') {
      const cachedVouchers = db.getVouchersByParty(ledgerName, 1000);
      if (cachedVouchers && cachedVouchers.length > 0) {
        // Voucher types that increase what party owes (Debit for party)
        const debitVoucherTypes = ['Sales', 'Credit Sales', 'Pending Sales Bill', 'A PTO BILL', 'A Pto Bill', 'Journal'];
        // Voucher types that decrease what party owes (Credit for party)
        const creditVoucherTypes = ['Receipt', 'Bank Receipt', 'Counter Receipt', 'Dashboard Receipt', 'Payment'];

        vouchers = cachedVouchers.map(v => {
          const vType = v.voucher_type || '';
          const amount = Math.abs(v.amount || 0);

          // Determine debit/credit based on voucher type
          const isDebitVoucher = debitVoucherTypes.some(t => vType.toLowerCase().includes(t.toLowerCase()));
          const isCreditVoucher = creditVoucherTypes.some(t => vType.toLowerCase().includes(t.toLowerCase()));

          return {
            guid: v.guid,
            masterId: v.master_id,
            alterId: v.alter_id || 0,
            date: v.voucher_date,
            voucherType: v.voucher_type,
            voucherNumber: v.voucher_number,
            partyName: v.party_name,
            // For cached vouchers, use narration as display (no other ledger info available)
            otherLedgersDisplay: v.narration || '(Sync from Tally for details)',
            amount: amount,
            // Debit = party owes us more (Sales, Credit Sales, etc.)
            // Credit = party owes us less (Receipt, Payment, etc.)
            debit: isDebitVoucher ? amount : 0,
            credit: isCreditVoucher ? amount : 0,
            narration: v.narration || ''
          };
        });
      }
    }

    // If no data found at all
    if (vouchers.length === 0) {
      const connectionStatus = await tallyConnector.checkConnection();
      if (!connectionStatus.connected) {
        return res.status(503).json({
          success: false,
          error: 'Tally is not connected and no cached data available'
        });
      }
      vouchers = await tallyConnector.getLedgerVouchers(ledgerName, from, to);
    }

    // Sort by date descending
    vouchers.sort((a, b) => {
      const dateA = a.date || '';
      const dateB = b.date || '';
      return dateB.localeCompare(dateA);
    });

    // Calculate running balance (process from oldest to newest)
    let runningBalance = 0;
    const vouchersWithBalance = [...vouchers].reverse().map(v => {
      runningBalance += (v.debit || 0) - (v.credit || 0);
      return {
        ...v,
        runningBalance
      };
    }).reverse();

    // Calculate totals
    const totals = vouchers.reduce((acc, v) => ({
      debit: acc.debit + (v.debit || 0),
      credit: acc.credit + (v.credit || 0)
    }), { debit: 0, credit: 0 });

    res.json({
      success: true,
      ledgerName,
      count: vouchers.length,
      source: source === 'tally' ? 'tally' : (vouchers.length > 0 ? 'cache' : 'none'),
      totals: {
        ...totals,
        netBalance: totals.debit - totals.credit
      },
      vouchers: vouchersWithBalance
    });
  } catch (error) {
    console.error('Error fetching ledger transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tally/vouchers
 * Get all vouchers directly from Tally (with alterId)
 * Also saves to local database for caching
 * Query params:
 *   - types: comma-separated voucher types (e.g., "Sales,Credit Sales,Contra,Journal,Payment,Receipt")
 *            If not specified, returns ALL voucher types
 *   - from: start date (YYYYMMDD)
 *   - to: end date (YYYYMMDD)
 */
router.get('/tally/vouchers', async (req, res) => {
  try {
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected'
      });
    }

    const { types, from, to } = req.query;

    // Default to last 30 days if no dates specified
    const toDate = to || tallyConnector.formatDate(new Date());
    const fromDate = from || tallyConnector.formatDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

    // Parse voucher types (null = fetch ALL voucher types)
    const voucherTypes = types ? types.split(',').map(t => t.trim()) : null;

    const vouchers = await tallyConnector.getVouchers(fromDate, toDate, voucherTypes);

    // Transform to frontend format
    const formattedVouchers = vouchers.map(v => ({
      masterId: v.masterId,
      guid: v.guid,
      voucherNumber: v.voucherNumber,
      date: v.date,
      partyName: v.partyName,
      amount: v.amount,
      voucherType: v.voucherType,
      alterId: v.alterId || 0,
      narration: v.narration
    }));

    // Sort by alterId descending
    formattedVouchers.sort((a, b) => (b.alterId || 0) - (a.alterId || 0));

    // Save to database for caching (only if fetching all types)
    if (!voucherTypes && vouchers.length > 0) {
      try {
        db.upsertAllVouchers(vouchers);
        db.updateAllVouchersSyncState(vouchers.length, fromDate, toDate);
        console.log(`Cached ${vouchers.length} vouchers to database`);
      } catch (cacheErr) {
        console.error('Error caching vouchers:', cacheErr.message);
      }
    }

    res.json({
      success: true,
      count: formattedVouchers.length,
      fromDate,
      toDate,
      types: voucherTypes || 'All',
      vouchers: formattedVouchers
    });
  } catch (error) {
    console.error('Error fetching Tally vouchers:', error);
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
 * Get all Pending Sales Bills from LOCAL DATABASE (fast)
 * Bills are synced from Tally periodically in background
 * Query params:
 *   - refresh=true: Force sync from Tally before returning
 *   - search=query: Filter by party name
 *   - since_alter_id=number: Only get bills with alterId > this value (incremental fetch)
 */
router.get('/pending-sales-bills', async (req, res) => {
  try {
    const { refresh, search, since_alter_id } = req.query;

    // If refresh requested or database is empty, sync from Tally
    const currentCount = db.getPendingSalesBillsCount();
    if (refresh === 'true' || currentCount === 0) {
      console.log('Syncing pending sales bills from Tally...');
      const connectionStatus = await tallyConnector.checkConnection();
      if (connectionStatus.connected) {
        const tallyBills = await tallyConnector.getPendingSalesBills();
        if (tallyBills && tallyBills.length > 0) {
          db.upsertPendingSalesBills(tallyBills);
          console.log(`Synced ${tallyBills.length} pending sales bills to database`);
        }
      } else if (currentCount === 0) {
        return res.status(503).json({
          success: false,
          error: 'Tally not connected and no cached data available'
        });
      }
    }

    // Get bills from database (fast)
    let bills;
    if (search) {
      bills = db.searchPendingSalesBills(search);
    } else if (since_alter_id) {
      // Incremental fetch - only get new/changed bills
      bills = db.getPendingSalesBillsSinceAlterId(parseInt(since_alter_id, 10));
    } else {
      bills = db.getAllPendingSalesBills();
    }

    // Transform to frontend format
    const formattedBills = bills.map(bill => ({
      masterId: bill.master_id,
      guid: bill.guid,
      voucherNumber: bill.voucher_number,
      date: bill.voucher_date,
      partyName: bill.party_name,
      amount: bill.amount,
      narration: bill.narration,
      alterId: bill.alter_id,
      sfl1: bill.sfl1,
      sfl2: bill.sfl2,
      sfl3: bill.sfl3,
      sfl4: bill.sfl4,
      sfl5: bill.sfl5,
      sfl6: bill.sfl6,
      sfl7: bill.sfl7,
      sflTot: bill.sfl_tot,
      isOffline: bill.is_offline === 1
    }));

    // Get max alterId for incremental sync tracking
    const maxAlterId = bills.length > 0 ? Math.max(...bills.map(b => b.alter_id || 0)) : 0;

    const syncState = db.getPSBSyncState();
    res.json({
      success: true,
      count: formattedBills.length,
      lastSync: syncState?.last_sync_time,
      maxAlterId: maxAlterId,
      isIncremental: !!since_alter_id,
      bills: formattedBills
    });
  } catch (error) {
    console.error('Error fetching pending sales bills:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pending-sales-bills/sync
 * Force sync pending sales bills from Tally to database
 */
router.post('/pending-sales-bills/sync', async (req, res) => {
  try {
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected'
      });
    }

    const bills = await tallyConnector.getPendingSalesBills();
    if (bills && bills.length > 0) {
      db.upsertPendingSalesBills(bills);
      let maxAlterId = 0;
      bills.forEach(b => { if (b.alterId > maxAlterId) maxAlterId = b.alterId; });
      db.updatePSBSyncState(maxAlterId, bills.length);
    }

    res.json({
      success: true,
      count: bills.length,
      message: `Synced ${bills.length} pending sales bills from Tally`
    });
  } catch (error) {
    console.error('Error syncing pending sales bills:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pending-sales-bills/sync-udf
 * Sync UDF fields from Tally for altered vouchers
 * Checks UDF payment fields and marks bills as paid if sfl_tot >= amount
 * Also logs activity and can auto-create receipts
 */
router.post('/pending-sales-bills/sync-udf', async (req, res) => {
  try {
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected'
      });
    }

    console.log('Syncing UDF fields from Tally...');

    // Fetch all pending sales bills with UDF fields
    const bills = await tallyConnector.getPendingSalesBills();

    let updated = 0;
    let paidCount = 0;
    const paidBills = [];

    for (const bill of bills) {
      // Check if this bill has UDF payment data
      const sflTot = bill.sflTot || 0;

      if (sflTot > 0) {
        // Update the bill with UDF fields
        db.updatePSBUDFFields(bill.masterId, {
          sfl1: bill.sfl1 || 0,
          sfl2: bill.sfl2 || 0,
          sfl3: bill.sfl3 || 0,
          sfl4: bill.sfl4 || 0,
          sfl5: bill.sfl5 || 0,
          sfl6: bill.sfl6 || 0,
          sfl7: bill.sfl7 || 0,
          sflTot: sflTot
        });
        updated++;

        // If fully paid (sfl_tot >= amount), log activity
        if (sflTot >= bill.amount) {
          paidCount++;
          paidBills.push({
            voucherNumber: bill.voucherNumber,
            partyName: bill.partyName,
            amount: bill.amount,
            sflTot: sflTot
          });

          // Log the payment activity
          db.logActivity({
            actionType: 'UDF_PAYMENT_DETECTED',
            voucherNumber: bill.voucherNumber,
            partyName: bill.partyName,
            amount: sflTot,
            details: {
              billAmount: bill.amount,
              sfl1: bill.sfl1,
              sfl2: bill.sfl2,
              sfl3: bill.sfl3,
              sfl4: bill.sfl4,
              sfl5: bill.sfl5,
              sfl6: bill.sfl6,
              sfl7: bill.sfl7,
              source: 'Tally UDF Sync'
            },
            status: 'success'
          });
        }
      }
    }

    // Also upsert all bills to update any new ones
    if (bills.length > 0) {
      db.upsertPendingSalesBills(bills);
    }

    res.json({
      success: true,
      totalBills: bills.length,
      updatedWithUDF: updated,
      markedAsPaid: paidCount,
      paidBills: paidBills,
      message: `Synced ${bills.length} bills, ${updated} with UDF data, ${paidCount} marked as paid`
    });
  } catch (error) {
    console.error('Error syncing UDF fields:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/pending-sales-bills/paid
 * Get paid/completed pending sales bills (where sfl_tot >= amount)
 */
router.get('/pending-sales-bills/paid', (req, res) => {
  try {
    const paidBills = db.getPaidPendingSalesBills();
    res.json({
      success: true,
      count: paidBills.length,
      bills: paidBills
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pending-sales-bills/offline
 * Create an offline pending sales bill (when Tally is offline)
 * This creates a local record that can be synced to Tally later
 */
router.post('/pending-sales-bills/offline', (req, res) => {
  try {
    const { partyName, amount, narration } = req.body;

    if (!partyName || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Party name and amount are required'
      });
    }

    // Generate offline voucher number with timestamp
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const voucherNumber = `WEB-${dateStr}-${timeStr}`;
    const masterId = `offline-${Date.now()}`;

    // Create offline bill record
    const offlineBill = {
      masterId: masterId,
      guid: `OFFLINE-GUID-${masterId}`,
      voucherNumber: voucherNumber,
      date: now.toISOString().slice(0, 10),
      partyName: partyName,
      amount: parseFloat(amount),
      voucherType: 'Pending Sales Bill',
      narration: narration || `Web Invoice - ${now.toLocaleDateString('en-GB')}`,
      alterId: 0,
      sfl1: 0, sfl2: 0, sfl3: 0, sfl4: 0, sfl5: 0, sfl6: 0, sfl7: 0, sflTot: 0,
      isOffline: 1
    };

    // Insert into database
    db.upsertPendingSalesBills([offlineBill]);

    // Log activity
    try {
      db.logActivity({
        actionType: 'OFFLINE_INVOICE_CREATED',
        voucherNumber: voucherNumber,
        partyName: partyName,
        amount: parseFloat(amount),
        details: { narration, isOffline: true },
        status: 'success'
      });
    } catch (logErr) {
      console.error('Error logging activity:', logErr.message);
    }

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('pendingSalesBills:created', { voucherNumber, partyName, amount });
    }

    res.json({
      success: true,
      voucherNumber,
      masterId,
      message: `Offline invoice ${voucherNumber} created successfully`
    });
  } catch (error) {
    console.error('Error creating offline invoice:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pending-sales-bills/create
 * Create a Pending Sales Bill - tries Tally first, falls back to offline
 */
router.post('/pending-sales-bills/create', async (req, res) => {
  try {
    const { partyName, amount, narration, voucherType = 'Pending Sales Bill' } = req.body;

    if (!partyName || !amount) {
      return res.status(400).json({
        success: false,
        error: 'Party name and amount are required'
      });
    }

    // Check if Tally is connected
    const connectionStatus = await tallyConnector.checkConnection();

    if (connectionStatus.connected) {
      // Create directly in Tally
      try {
        const result = await tallyConnector.createPendingSalesBill({
          partyName,
          amount: parseFloat(amount),
          narration: narration || '',
          voucherType
        });

        if (result.success) {
          // Log activity
          try {
            db.logActivity({
              actionType: 'PENDING_BILL_CREATED',
              voucherNumber: result.voucherNumber || '',
              partyName: partyName,
              amount: parseFloat(amount),
              details: { narration, createdInTally: true },
              status: 'success'
            });
          } catch (logErr) {
            console.error('Error logging activity:', logErr.message);
          }

          // Emit socket event
          const io = req.app.get('io');
          if (io) {
            io.emit('pendingSalesBills:created', { voucherNumber: result.voucherNumber, partyName, amount });
          }

          // Trigger a sync to refresh the list
          syncService.syncPendingSalesBills();

          return res.json({
            success: true,
            voucherNumber: result.voucherNumber,
            masterId: result.masterId,
            message: `Bill created in Tally successfully`
          });
        } else {
          throw new Error(result.error || 'Failed to create in Tally');
        }
      } catch (tallyErr) {
        console.error('Error creating in Tally, falling back to offline:', tallyErr.message);
        // Fall through to offline creation
      }
    }

    // Fallback: Create offline bill
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
    const voucherNumber = `WEB-${dateStr}-${timeStr}`;
    const masterId = `offline-${Date.now()}`;

    const offlineBill = {
      masterId: masterId,
      guid: `OFFLINE-GUID-${masterId}`,
      voucherNumber: voucherNumber,
      date: now.toISOString().slice(0, 10),
      partyName: partyName,
      amount: parseFloat(amount),
      voucherType: voucherType,
      narration: narration || `Web Invoice - ${now.toLocaleDateString('en-GB')}`,
      alterId: 0,
      sfl1: 0, sfl2: 0, sfl3: 0, sfl4: 0, sfl5: 0, sfl6: 0, sfl7: 0, sflTot: 0,
      isOffline: 1
    };

    db.upsertPendingSalesBills([offlineBill]);

    // Log activity
    try {
      db.logActivity({
        actionType: 'OFFLINE_BILL_CREATED',
        voucherNumber: voucherNumber,
        partyName: partyName,
        amount: parseFloat(amount),
        details: { narration, isOffline: true },
        status: 'success'
      });
    } catch (logErr) {
      console.error('Error logging activity:', logErr.message);
    }

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.emit('pendingSalesBills:created', { voucherNumber, partyName, amount });
    }

    res.json({
      success: true,
      voucherNumber,
      masterId,
      isOffline: true,
      message: `Offline bill ${voucherNumber} created (will sync when Tally is online)`
    });
  } catch (error) {
    console.error('Error creating pending sales bill:', error);
    res.status(500).json({ success: false, error: error.message });
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

    // Validation removed - allow total = 0 for full credit cases
    // Full credit (total = 0) → only alter voucher type to Credit Sales
    // Payment > 0 → alter voucher AND create receipt

    // Determine voucher type based on payment vs bill amount
    // Full Credit (total = 0) → Credit Sales (only alter, no receipt)
    // Full Payment (total >= bill) → Sales (alter + receipt)
    // Partial Payment (total < bill) → Credit Sales (alter + receipt)
    const billAmount = parseFloat(amount) || 0;
    const isFullCredit = total === 0;
    const newVoucherType = isFullCredit ? 'Credit Sales' : (total >= billAmount ? 'Sales' : 'Credit Sales');

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
      // Remove from local database (bill is no longer pending)
      try {
        db.deletePendingSalesBill(masterId);
        console.log(`Removed bill ${masterId} from local pending_sales_bills table`);
      } catch (dbErr) {
        console.error('Error removing bill from local DB:', dbErr.message);
      }

      const message = isFullCredit
        ? `Bill converted to ${newVoucherType} (full credit, no receipt)`
        : `Bill updated to ${newVoucherType} ${result.created > 0 ? 'AND Receipt created' : ''}`;

      // Log activity
      try {
        db.logActivity({
          actionType: isFullCredit ? 'FULL_CREDIT' : (total >= billAmount ? 'FULL_PAYMENT' : 'PARTIAL_PAYMENT'),
          voucherNumber,
          partyName,
          amount: total,
          details: {
            billAmount,
            newVoucherType,
            paymentModes: {
              cashTeller1: parseFloat(paymentModes?.cashTeller1) || 0,
              cashTeller2: parseFloat(paymentModes?.cashTeller2) || 0,
              chequeReceipt: parseFloat(paymentModes?.chequeReceipt) || 0,
              qrCode: parseFloat(paymentModes?.qrCode) || 0,
              discount: parseFloat(paymentModes?.discount) || 0,
              bankDeposit: parseFloat(paymentModes?.bankDeposit) || 0,
              esewa: parseFloat(paymentModes?.esewa) || 0
            },
            receiptCreated: result.created > 0
          },
          status: 'success'
        });
      } catch (logErr) {
        console.error('Error logging activity:', logErr.message);
      }

      // Emit socket event for real-time update
      const io = req.app.get('io');
      if (io) {
        io.emit('pendingSalesBills:completed', { masterId, voucherNumber, newVoucherType });
        io.emit('activity:new', { actionType: isFullCredit ? 'FULL_CREDIT' : 'PAYMENT', voucherNumber, partyName });
      }

      res.json({
        success: true,
        message,
        total,
        newVoucherType,
        altered: result.altered || 0,
        receiptCreated: result.created || 0,
        method: result.method,
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
      // Log failed activity
      try {
        db.logActivity({
          actionType: 'PAYMENT_FAILED',
          voucherNumber,
          partyName,
          amount: total,
          details: { billAmount, error: result.error },
          status: 'error',
          errorMessage: result.error
        });
      } catch (logErr) {
        console.error('Error logging failed activity:', logErr.message);
      }

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

// ==================== ACTIVITY LOG ====================

/**
 * GET /api/activity
 * Get recent activity logs (payments, alterations, receipts)
 */
router.get('/activity', (req, res) => {
  try {
    const { limit, type, from, to, party } = req.query;
    let activities;

    if (from && to) {
      activities = db.getActivitiesByDateRange(from, to, parseInt(limit) || 100);
    } else if (type) {
      activities = db.getActivitiesByType(type, parseInt(limit) || 50);
    } else if (party) {
      activities = db.getActivitiesByParty(party, parseInt(limit) || 50);
    } else {
      activities = db.getRecentActivities(parseInt(limit) || 50);
    }

    // Parse JSON details field
    const parsed = activities.map(act => ({
      ...act,
      details: act.details ? JSON.parse(act.details) : null
    }));

    res.json({
      success: true,
      count: parsed.length,
      activities: parsed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/activity/today
 * Get today's activity logs
 */
router.get('/activity/today', (req, res) => {
  try {
    const activities = db.getTodayActivities();
    const parsed = activities.map(act => ({
      ...act,
      details: act.details ? JSON.parse(act.details) : null
    }));

    res.json({
      success: true,
      count: parsed.length,
      activities: parsed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/activity/stats
 * Get today's activity statistics by type
 */
router.get('/activity/stats', (req, res) => {
  try {
    const stats = db.getTodayActivityStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/activity
 * Log a new activity (used internally after payment completion)
 */
router.post('/activity', (req, res) => {
  try {
    const { actionType, voucherNumber, partyName, amount, details, userId, status, errorMessage } = req.body;

    if (!actionType) {
      return res.status(400).json({ error: 'actionType is required' });
    }

    const result = db.logActivity({
      actionType,
      voucherNumber,
      partyName,
      amount,
      details,
      userId,
      status: status || 'success',
      errorMessage
    });

    res.json({
      success: true,
      activityId: result.lastInsertRowid
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== BILL INVENTORY (FOR PRINTING) ====================

/**
 * GET /api/pending-sales-bills/:masterId/inventory
 * Get bill inventory items for printing
 */
router.get('/pending-sales-bills/:masterId/inventory', async (req, res) => {
  try {
    const { masterId } = req.params;
    const { refresh } = req.query;

    // Check if we have inventory items in database
    const hasItems = db.hasBillInventoryItems(masterId);

    if (!hasItems || refresh === 'true') {
      // Fetch from Tally
      const connectionStatus = await tallyConnector.checkConnection();
      if (connectionStatus.connected) {
        const voucherDetails = await tallyConnector.getVoucherInventoryDetails(masterId);
        if (voucherDetails && voucherDetails.items && voucherDetails.items.length > 0) {
          db.upsertBillInventoryItems(masterId, voucherDetails.items);
        }
      } else if (!hasItems) {
        return res.status(503).json({
          success: false,
          error: 'Tally not connected and no cached inventory data'
        });
      }
    }

    const bill = db.getBillWithInventory(masterId);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    res.json({
      success: true,
      bill: {
        masterId: bill.master_id,
        guid: bill.guid,
        voucherNumber: bill.voucher_number,
        date: bill.voucher_date,
        partyName: bill.party_name,
        amount: bill.amount,
        narration: bill.narration,
        inventoryItems: bill.inventoryItems.map(item => ({
          stockItemName: item.stock_item_name,
          quantity: item.quantity,
          rate: item.rate,
          amount: item.amount,
          discount: item.discount,
          godown: item.godown,
          batchName: item.batch_name
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching bill inventory:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/pending-sales-bills/sync-inventory
 * Sync inventory items for all pending sales bills from Tally
 */
router.post('/pending-sales-bills/sync-inventory', async (req, res) => {
  try {
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected'
      });
    }

    // Get all pending sales bills
    const bills = db.getAllPendingSalesBills();
    let synced = 0;
    let failed = 0;

    for (const bill of bills) {
      try {
        const voucherDetails = await tallyConnector.getVoucherInventoryDetails(bill.master_id);
        if (voucherDetails && voucherDetails.items && voucherDetails.items.length > 0) {
          db.upsertBillInventoryItems(bill.master_id, voucherDetails.items);
          synced++;
        }
      } catch (err) {
        console.error(`Error syncing inventory for bill ${bill.master_id}:`, err.message);
        failed++;
      }
    }

    res.json({
      success: true,
      message: `Inventory sync complete: ${synced} bills synced, ${failed} failed`,
      synced,
      failed,
      total: bills.length
    });
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

export default router;
