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

    // Sync pending sales bills to local database
    const psbResult = await this.syncPendingSalesBills();

    // Also try to sync pending invoices when Tally reconnects
    const pendingResult = await this.syncPendingInvoices();

    return {
      success: stockResult.success && partyResult.success,
      stock: stockResult,
      parties: partyResult,
      pendingSalesBills: psbResult,
      pendingInvoices: pendingResult
    };
  }

  /**
   * Sync pending sales bills from Tally to local database
   * Fetches all pending sales bills and stores locally for fast access
   */
  async syncPendingSalesBills() {
    try {
      console.log('Syncing pending sales bills from Tally...');

      // Fetch pending sales bills from Tally
      const bills = await tallyConnector.getPendingSalesBills();

      if (!bills || bills.length === 0) {
        console.log('No pending sales bills found in Tally');
        db.updatePSBSyncState(0, 0);
        return { success: true, count: 0 };
      }

      // Find max alterId
      let maxAlterId = 0;
      for (const bill of bills) {
        if (bill.alterId && bill.alterId > maxAlterId) {
          maxAlterId = bill.alterId;
        }
      }

      // Batch upsert all bills
      const count = db.upsertPendingSalesBills(bills);

      // Update sync state
      db.updatePSBSyncState(maxAlterId, count);

      console.log(`Pending sales bills sync complete: ${count} bills synced`);

      // Broadcast update
      if (this.io) {
        this.io.emit('pendingSalesBills:updated', { count });
      }

      return { success: true, count, lastAlterId: maxAlterId };
    } catch (error) {
      console.error('Pending sales bills sync error:', error.message);
      return { success: false, error: error.message };
    }
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
}

// Export singleton
export const syncService = new SyncService();
export default syncService;
