/**
 * Sync Service
 * Handles periodic synchronization between Tally and Dashboard
 * Polls Tally every X seconds and updates local database
 */

import { tallyConnector } from './tallyConnector.js';
import { db } from './database.js';
import config from '../config/default.js';

class SyncService {
  constructor() {
    this.isRunning = false;
    this.isSyncing = false;  // Prevents overlapping syncs
    this.syncInterval = null;
    this.masterSyncInterval = null;  // For periodic master data sync
    this.io = null;  // Socket.io instance for real-time updates
    this.lastKnownVouchers = new Set();
  }

  /**
   * Set Socket.io instance for real-time broadcasts
   */
  setSocketIO(io) {
    this.io = io;
  }

  /**
   * Start the sync service
   */
  async start() {
    if (this.isRunning) {
      console.log('Sync service already running');
      return;
    }

    const interval = config.tally.syncInterval || 0;
    console.log(`Starting sync service (interval: ${interval === 0 ? 'MANUAL ONLY' : interval + 'ms'})...`);

    // Check Tally connection first
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      console.error('Cannot start sync - Tally not connected:', connectionStatus.error);
      db.updateSyncState({ status: 'error', error: connectionStatus.error });
      return false;
    }

    console.log('Tally connected. Companies:', connectionStatus.companies);
    this.isRunning = true;

    // Run initial master data sync (stock items and parties)
    console.log('Running initial master data sync...');
    await this.syncMasters();

    // Only set up auto-sync if interval > 0
    if (interval > 0) {
      // Run initial voucher sync
      await this.syncNow();

      // Set up interval for continuous sync
      this.syncInterval = setInterval(() => {
        this.syncNow();
      }, interval);

      // Set up less frequent master sync (every 5 minutes)
      this.masterSyncInterval = setInterval(() => {
        this.syncMasters();
      }, 5 * 60 * 1000);
    } else {
      console.log('Auto-sync disabled. Use manual sync from dashboard.');
      db.updateSyncState({ status: 'idle', error: null });
    }

    return true;
  }

  /**
   * Stop the sync service
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.masterSyncInterval) {
      clearInterval(this.masterSyncInterval);
      this.masterSyncInterval = null;
    }
    this.isRunning = false;
    console.log('Sync service stopped');
  }

  /**
   * Perform auto sync using incremental AlterID method (lightweight - recommended)
   * Only fetches NEW/modified vouchers since last sync
   */
  async syncNow() {
    return this.syncIncremental();
  }

  /**
   * Incremental sync - Only fetch vouchers with ALTERID > lastAlterId
   * This is the most efficient method and won't overload Tally
   */
  async syncIncremental() {
    // Prevent overlapping syncs
    if (this.isSyncing) {
      console.log('Sync already in progress, skipping...');
      return { success: false, error: 'Sync already in progress' };
    }

    this.isSyncing = true;
    try {
      db.updateSyncState({ status: 'syncing' });

      const lastAlterId = db.getLastAlterId();
      console.log(`Incremental sync: fetching vouchers with ALTERID > ${lastAlterId}`);

      // Fetch only new/modified vouchers
      const allTypes = [...config.voucherTypes.sales, ...config.voucherTypes.receipt];
      const vouchers = await tallyConnector.getVouchersIncremental(lastAlterId, allTypes);

      let newVouchers = [];
      let maxAlterId = lastAlterId;

      for (const voucher of vouchers) {
        // Track max AlterID
        if (voucher.alterId > maxAlterId) {
          maxAlterId = voucher.alterId;
        }

        // Check if exists
        const existing = db.getBillByGuid(voucher.guid);

        if (!existing) {
          db.upsertBill(voucher);
          newVouchers.push(voucher);
        } else {
          db.upsertBill(voucher);
        }
      }

      // Update last AlterID
      if (maxAlterId > lastAlterId) {
        db.setLastAlterId(maxAlterId);
      }

      // Update sync state
      db.updateSyncState({
        status: 'idle',
        voucherCount: vouchers.length,
        lastAlterId: maxAlterId,
        error: null
      });

      // Broadcast new vouchers
      if (newVouchers.length > 0 && this.io) {
        for (const voucher of newVouchers) {
          this.broadcastNewVoucher(voucher);
        }
      }

      console.log(`Incremental sync complete: ${vouchers.length} vouchers, ${newVouchers.length} new, maxAlterId=${maxAlterId}`);

      return {
        success: true,
        total: vouchers.length,
        new: newVouchers.length,
        lastAlterId: maxAlterId
      };
    } catch (error) {
      console.error('Incremental sync error:', error.message);
      db.updateSyncState({
        status: 'error',
        error: error.message
      });
      return {
        success: false,
        error: error.message
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Sync specific date range (for manual sync)
   */
  async syncDateRange(fromDate, toDate) {
    // Prevent overlapping syncs
    if (this.isSyncing) {
      console.log('Sync already in progress, skipping...');
      return { success: false, error: 'Sync already in progress' };
    }

    this.isSyncing = true;
    try {
      db.updateSyncState({ status: 'syncing' });

      console.log(`Syncing vouchers from ${fromDate} to ${toDate}`);

      // Fetch all vouchers (sales + receipts) from Tally
      const allTypes = [...config.voucherTypes.sales, ...config.voucherTypes.receipt];
      const vouchers = await tallyConnector.getVouchers(fromDate, toDate, allTypes);

      let newVouchers = [];
      let updatedCount = 0;

      for (const voucher of vouchers) {
        // Check if this is a new voucher
        const existing = db.getBillByGuid(voucher.guid);

        if (!existing) {
          // New voucher - insert it
          db.upsertBill(voucher);
          newVouchers.push(voucher);
        } else {
          // Existing voucher - update if needed
          db.upsertBill(voucher);
          updatedCount++;
        }
      }

      // Update sync state
      db.updateSyncState({
        status: 'idle',
        voucherCount: vouchers.length,
        error: null
      });

      // Broadcast new vouchers via WebSocket
      if (newVouchers.length > 0 && this.io) {
        for (const voucher of newVouchers) {
          this.broadcastNewVoucher(voucher);
        }
      }

      // Update payment status based on receipts
      await this.updatePaymentStatuses();

      return {
        success: true,
        total: vouchers.length,
        new: newVouchers.length,
        updated: updatedCount
      };
    } catch (error) {
      console.error('Sync error:', error.message);
      db.updateSyncState({
        status: 'error',
        error: error.message
      });
      return {
        success: false,
        error: error.message
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Update payment statuses based on receipts
   */
  async updatePaymentStatuses() {
    // Get all pending sales bills
    const pendingBills = db.getPendingBills();

    for (const bill of pendingBills) {
      // Get total receipts for this party
      const receipts = db.getReceiptsByBill(bill.id);
      const totalReceived = receipts.reduce((sum, r) => sum + r.amount, 0);

      // Update status
      let status = 'pending';
      if (totalReceived >= bill.amount) {
        status = 'paid';
      } else if (totalReceived > 0) {
        status = 'partial';
      }

      if (status !== bill.payment_status) {
        db.updateBillPaymentStatus(bill.id, status, totalReceived);

        // Broadcast status change
        if (this.io) {
          this.io.emit('bill:statusChanged', {
            billId: bill.id,
            voucherNumber: bill.voucher_number,
            partyName: bill.party_name,
            oldStatus: bill.payment_status,
            newStatus: status
          });
        }
      }
    }
  }

  /**
   * Broadcast new voucher to all connected clients
   */
  broadcastNewVoucher(voucher) {
    if (!this.io) return;

    const isSales = config.voucherTypes.sales.includes(voucher.voucherType);
    const isReceipt = config.voucherTypes.receipt.includes(voucher.voucherType);

    if (isSales) {
      // New bill created
      this.io.emit('bill:new', {
        guid: voucher.guid,
        voucherNumber: voucher.voucherNumber,
        voucherType: voucher.voucherType,
        partyName: voucher.partyName,
        amount: Math.abs(voucher.amount),
        date: voucher.date
      });

      // Create notifications for users who want them
      this.createBillNotifications(voucher);
    }

    if (isReceipt) {
      // Payment received
      this.io.emit('receipt:new', {
        guid: voucher.guid,
        voucherNumber: voucher.voucherNumber,
        partyName: voucher.partyName,
        amount: Math.abs(voucher.amount),
        date: voucher.date
      });
    }

    // Always emit general sync update
    this.io.emit('sync:update', {
      timestamp: new Date().toISOString(),
      type: isSales ? 'bill' : 'receipt'
    });
  }

  /**
   * Create notifications for new bill
   */
  createBillNotifications(voucher) {
    const amount = Math.abs(voucher.amount);

    // Get all users who want notifications
    const users = db.getAllUsers();

    for (const user of users) {
      // Check if user wants new bill notifications
      if (user.notify_new_bill) {
        db.createNotification({
          userId: user.id,
          type: 'new_bill',
          title: 'New Bill Created',
          message: `Bill ${voucher.voucherNumber} for ${voucher.partyName} - ₹${amount.toLocaleString()}`,
          data: {
            voucherNumber: voucher.voucherNumber,
            partyName: voucher.partyName,
            amount: amount
          }
        });
      }

      // Check for large bill notification
      if (user.notify_large_bill && amount >= user.large_bill_threshold) {
        db.createNotification({
          userId: user.id,
          type: 'large_bill',
          title: 'Large Bill Alert!',
          message: `Large bill ${voucher.voucherNumber} - ₹${amount.toLocaleString()} for ${voucher.partyName}`,
          data: {
            voucherNumber: voucher.voucherNumber,
            partyName: voucher.partyName,
            amount: amount
          }
        });
      }
    }
  }

  /**
   * Get today's date in Tally format (YYYYMMDD)
   */
  getTodayTallyDate() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Get date X days ago in Tally format (YYYYMMDD)
   */
  getDateDaysAgo(days) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Get sync status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      isSyncing: this.isSyncing,
      ...db.getSyncState()
    };
  }

  /**
   * Sync stock items from Tally to local database
   * Uses incremental sync with ALTERID
   */
  async syncStockItems() {
    try {
      const lastAlterId = db.getLastStockAlterId();
      const currentCount = db.getStockItemsCount();

      // If no items in DB or never synced, do full sync
      let items;
      if (currentCount === 0 || lastAlterId === 0) {
        console.log('Performing full stock items sync...');
        items = await tallyConnector.getStockItems();
      } else {
        console.log(`Syncing stock items with ALTERID > ${lastAlterId}`);
        items = await tallyConnector.getStockItemsIncremental(lastAlterId);
      }

      if (!items || items.length === 0) {
        console.log('No new stock items to sync');
        return { success: true, count: 0 };
      }

      // Find max alterId
      let maxAlterId = lastAlterId;
      for (const item of items) {
        if (item.alterId && item.alterId > maxAlterId) {
          maxAlterId = item.alterId;
        }
      }

      // Batch upsert all items
      const count = db.upsertStockItems(items);

      // Update sync state
      if (maxAlterId > lastAlterId) {
        db.updateStockSyncState(maxAlterId);
      }

      console.log(`Stock sync complete: ${count} items synced, maxAlterId=${maxAlterId}`);
      return { success: true, count, lastAlterId: maxAlterId };
    } catch (error) {
      console.error('Stock sync error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync parties (ledgers) from Tally to local database
   * Uses incremental sync with ALTERID
   */
  async syncParties() {
    try {
      const lastAlterId = db.getLastPartyAlterId();
      console.log(`Syncing parties with ALTERID > ${lastAlterId}`);

      // Fetch ledgers from Tally (Sundry Debtors and Sundry Creditors)
      const debtors = await tallyConnector.getLedgers('Sundry Debtors');
      const creditors = await tallyConnector.getLedgers('Sundry Creditors');

      // Add groupType to each party
      const debtorsWithType = debtors.map(p => ({ ...p, groupType: 'debtor' }));
      const creditorsWithType = creditors.map(p => ({ ...p, groupType: 'creditor' }));

      const allParties = [...debtorsWithType, ...creditorsWithType];

      if (!allParties || allParties.length === 0) {
        console.log('No parties to sync');
        return { success: true, count: 0 };
      }

      // Find max alterId
      let maxAlterId = lastAlterId;
      for (const party of allParties) {
        if (party.alterId && party.alterId > maxAlterId) {
          maxAlterId = party.alterId;
        }
      }

      // Batch upsert all parties
      const count = db.upsertParties(allParties);

      // Update sync state
      if (maxAlterId > lastAlterId) {
        db.updatePartySyncState(maxAlterId);
      }

      console.log(`Party sync complete: ${count} parties synced (${debtors.length} debtors, ${creditors.length} creditors)`);
      return { success: true, count, debtors: debtors.length, creditors: creditors.length };
    } catch (error) {
      console.error('Party sync error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Sync all master data (stock items + parties)
   */
  async syncMasters() {
    console.log('Starting master data sync...');

    const stockResult = await this.syncStockItems();
    const partyResult = await this.syncParties();

    // Also try to sync pending invoices when Tally reconnects
    const pendingResult = await this.syncPendingInvoices();

    return {
      success: stockResult.success && partyResult.success,
      stock: stockResult,
      parties: partyResult,
      pendingInvoices: pendingResult
    };
  }

  /**
   * Sync pending invoices to Tally (when Tally comes online)
   * Called automatically during master sync
   */
  async syncPendingInvoices() {
    try {
      const pendingInvoices = db.getPendingInvoices();
      if (pendingInvoices.length === 0) {
        return { success: true, synced: 0, failed: 0 };
      }

      console.log(`Syncing ${pendingInvoices.length} pending invoices to Tally...`);

      let synced = 0;
      let failed = 0;

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

            // Broadcast sync success via socket.io
            if (this.io) {
              this.io.emit('pendingInvoiceSynced', {
                invoiceNumber: invoice.invoice_number,
                partyName: invoice.party_name
              });
            }
          } else {
            db.updatePendingInvoiceStatus(invoice.id, 'failed', result.error);
            failed++;
            console.error(`Failed to sync invoice ${invoice.invoice_number}: ${result.error}`);
          }
        } catch (err) {
          db.updatePendingInvoiceStatus(invoice.id, 'failed', err.message);
          failed++;
          console.error(`Error syncing invoice ${invoice.invoice_number}: ${err.message}`);
        }
      }

      console.log(`Pending invoice sync complete: ${synced} synced, ${failed} failed`);
      return { success: true, synced, failed };
    } catch (error) {
      console.error('Pending invoice sync error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * FULL HISTORICAL SYNC
   * Fetches ALL vouchers from Tally from a start date to today
   * Uses date-based batching to avoid overwhelming Tally
   * After completion, incremental sync can be used for ongoing updates
   *
   * @param {string} startDate - Start date in YYYYMMDD format (default: 1 year ago)
   * @param {number} batchDays - Number of days per batch (default: 7)
   */
  async syncFullHistory(startDate = null, batchDays = 7) {
    // Prevent overlapping syncs
    if (this.isSyncing) {
      console.log('Sync already in progress, cannot start full history sync');
      return { success: false, error: 'Sync already in progress' };
    }

    this.isSyncing = true;
    const startTime = Date.now();

    try {
      // Determine date range
      const today = new Date();
      const todayStr = this.formatDateYYYYMMDD(today);

      // Default start: 1 year ago or provided date
      let fromDate;
      if (startDate) {
        fromDate = startDate;
      } else {
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        fromDate = this.formatDateYYYYMMDD(oneYearAgo);
      }

      console.log('='.repeat(60));
      console.log('STARTING FULL HISTORICAL SYNC');
      console.log('='.repeat(60));
      console.log(`Date range: ${fromDate} to ${todayStr}`);
      console.log(`Batch size: ${batchDays} days`);

      // Initialize sync state
      db.updateFullSyncState({
        status: 'in_progress',
        startDate: fromDate,
        currentDate: fromDate,
        endDate: todayStr,
        totalVouchersSynced: 0,
        maxAlterId: 0,
        batchesCompleted: 0,
        startedAt: new Date().toISOString(),
        completedAt: null,
        lastError: null
      });

      // Broadcast start
      if (this.io) {
        this.io.emit('fullSync:started', { fromDate, toDate: todayStr, batchDays });
      }

      // Calculate batches
      const batches = this.generateDateBatches(fromDate, todayStr, batchDays);
      console.log(`Total batches to process: ${batches.length}`);

      let totalVouchers = 0;
      let maxAlterId = 0;
      let batchesCompleted = 0;
      const allTypes = [...config.voucherTypes.sales, ...config.voucherTypes.receipt];

      // Process each batch
      for (const batch of batches) {
        try {
          console.log(`\nBatch ${batchesCompleted + 1}/${batches.length}: ${batch.from} to ${batch.to}`);

          // Fetch vouchers for this date range
          const vouchers = await tallyConnector.getVouchers(batch.from, batch.to, allTypes);
          console.log(`  Fetched ${vouchers.length} vouchers`);

          // Save to database
          for (const voucher of vouchers) {
            db.upsertBill(voucher);

            // Track max ALTERID
            if (voucher.alterId > maxAlterId) {
              maxAlterId = voucher.alterId;
            }
          }

          totalVouchers += vouchers.length;
          batchesCompleted++;

          // Update progress
          db.updateFullSyncState({
            currentDate: batch.to,
            totalVouchersSynced: totalVouchers,
            maxAlterId,
            batchesCompleted
          });

          // Broadcast progress
          if (this.io) {
            this.io.emit('fullSync:progress', {
              batch: batchesCompleted,
              totalBatches: batches.length,
              currentDate: batch.to,
              vouchersSynced: totalVouchers,
              maxAlterId,
              percentComplete: Math.round((batchesCompleted / batches.length) * 100)
            });
          }

          // Small delay between batches to be gentle on Tally
          await new Promise(resolve => setTimeout(resolve, 2000));

        } catch (batchError) {
          console.error(`  Batch error: ${batchError.message}`);
          db.updateFullSyncState({ lastError: batchError.message });

          // Continue with next batch rather than failing completely
          batchesCompleted++;
        }
      }

      // Update sync state to completed
      const duration = Math.round((Date.now() - startTime) / 1000);
      db.updateFullSyncState({
        status: 'completed',
        currentDate: todayStr,
        completedAt: new Date().toISOString()
      });

      // Update main sync state with max ALTERID for future incremental syncs
      if (maxAlterId > db.getLastAlterId()) {
        db.setLastAlterId(maxAlterId);
      }

      console.log('\n' + '='.repeat(60));
      console.log('FULL HISTORICAL SYNC COMPLETED');
      console.log('='.repeat(60));
      console.log(`Total vouchers synced: ${totalVouchers}`);
      console.log(`Max ALTERID: ${maxAlterId}`);
      console.log(`Duration: ${duration} seconds`);
      console.log('='.repeat(60));

      // Broadcast completion
      if (this.io) {
        this.io.emit('fullSync:completed', {
          totalVouchers,
          maxAlterId,
          duration,
          batchesCompleted: batches.length
        });
      }

      return {
        success: true,
        totalVouchers,
        maxAlterId,
        batchesCompleted: batches.length,
        duration,
        message: `Full historical sync completed. ${totalVouchers} vouchers synced. Max ALTERID: ${maxAlterId}`
      };

    } catch (error) {
      console.error('Full history sync error:', error.message);
      db.updateFullSyncState({
        status: 'error',
        lastError: error.message
      });

      if (this.io) {
        this.io.emit('fullSync:error', { error: error.message });
      }

      return { success: false, error: error.message };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Generate date batches for historical sync
   * @param {string} fromDate - Start date YYYYMMDD
   * @param {string} toDate - End date YYYYMMDD
   * @param {number} batchDays - Days per batch
   * @returns {Array} Array of {from, to} date pairs
   */
  generateDateBatches(fromDate, toDate, batchDays) {
    const batches = [];
    const parseDate = (str) => {
      const y = parseInt(str.slice(0, 4));
      const m = parseInt(str.slice(4, 6)) - 1;
      const d = parseInt(str.slice(6, 8));
      return new Date(y, m, d);
    };

    let current = parseDate(fromDate);
    const end = parseDate(toDate);

    while (current <= end) {
      const batchEnd = new Date(current);
      batchEnd.setDate(batchEnd.getDate() + batchDays - 1);

      // Don't go past the end date
      if (batchEnd > end) {
        batchEnd.setTime(end.getTime());
      }

      batches.push({
        from: this.formatDateYYYYMMDD(current),
        to: this.formatDateYYYYMMDD(batchEnd)
      });

      // Move to next batch
      current.setDate(current.getDate() + batchDays);
    }

    return batches;
  }

  /**
   * Format date to YYYYMMDD
   */
  formatDateYYYYMMDD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  /**
   * Resume a previously interrupted full sync
   */
  async resumeFullSync() {
    const state = db.getFullSyncState();

    if (!state || state.status !== 'in_progress') {
      return { success: false, error: 'No sync in progress to resume' };
    }

    console.log(`Resuming full sync from ${state.current_date}`);

    // Resume from where we left off
    return this.syncFullHistory(state.current_date, 7);
  }

  /**
   * Get full sync status
   */
  getFullSyncStatus() {
    const state = db.getFullSyncState();
    const billsCount = db.getBillsCount();
    const maxAlterId = db.getMaxBillAlterId();

    return {
      ...state,
      billsInDatabase: billsCount,
      maxAlterIdInDatabase: maxAlterId,
      canResumeSync: state?.status === 'in_progress'
    };
  }
}

// Export singleton
export const syncService = new SyncService();
export default syncService;
