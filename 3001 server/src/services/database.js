/**
 * Database Service - SQLite
 * Stores bills, receipts, sacks, users, and sync state
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import config from '../config/default.js';

class DatabaseService {
  constructor() {
    this.db = null;
  }

  /**
   * Initialize database connection and create tables
   */
  init() {
    // Ensure data directory exists
    const dbDir = dirname(config.database.path);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(config.database.path);
    this.db.pragma('journal_mode = WAL');  // Better performance

    this.createTables();
    console.log('Database initialized at:', config.database.path);
  }

  /**
   * Create all required tables
   */
  createTables() {
    // Users table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT,
        role TEXT DEFAULT 'cashier',
        language TEXT DEFAULT 'en',
        notify_new_bill INTEGER DEFAULT 1,
        notify_payment INTEGER DEFAULT 1,
        notify_large_bill INTEGER DEFAULT 1,
        notify_dispatch INTEGER DEFAULT 1,
        large_bill_threshold REAL DEFAULT 50000,
        fcm_token TEXT,
        active INTEGER DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Bills synced from Tally
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tally_guid TEXT UNIQUE NOT NULL,
        tally_master_id TEXT,
        voucher_number TEXT,
        voucher_type TEXT NOT NULL,
        voucher_date TEXT NOT NULL,
        party_name TEXT NOT NULL,
        amount REAL NOT NULL,
        narration TEXT,
        payment_status TEXT DEFAULT 'pending',
        dispatch_status TEXT DEFAULT 'created',
        amount_received REAL DEFAULT 0,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for faster queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bills_date ON bills(voucher_date);
      CREATE INDEX IF NOT EXISTS idx_bills_party ON bills(party_name);
      CREATE INDEX IF NOT EXISTS idx_bills_status ON bills(payment_status, dispatch_status);
      CREATE INDEX IF NOT EXISTS idx_bills_guid ON bills(tally_guid);
    `);

    // Receipts table (receipts created from Dashboard)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id INTEGER REFERENCES bills(id),
        tally_guid TEXT,
        amount REAL NOT NULL,
        payment_mode TEXT DEFAULT 'Cash',
        created_by INTEGER REFERENCES users(id),
        synced_to_tally INTEGER DEFAULT 0,
        sync_error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sacks/Bundles table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sacks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sack_number TEXT UNIQUE NOT NULL,
        customer_name TEXT NOT NULL,
        status TEXT DEFAULT 'packing',
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sack items (bills + external vendor items)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sack_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sack_id INTEGER NOT NULL REFERENCES sacks(id) ON DELETE CASCADE,
        bill_id INTEGER REFERENCES bills(id),
        external_vendor TEXT,
        external_amount REAL,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Sync state tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_sync_time TEXT,
        last_voucher_count INTEGER DEFAULT 0,
        last_alter_id INTEGER DEFAULT 0,
        sync_status TEXT DEFAULT 'idle',
        error_message TEXT
      )
    `);

    // Add last_alter_id column if not exists (migration for existing DBs)
    try {
      this.db.exec(`ALTER TABLE sync_state ADD COLUMN last_alter_id INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists, ignore
    }

    // Initialize sync state if not exists
    this.db.exec(`
      INSERT OR IGNORE INTO sync_state (id, sync_status, last_alter_id) VALUES (1, 'idle', 0)
    `);

    // Audit log
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        action TEXT NOT NULL,
        table_name TEXT,
        record_id INTEGER,
        old_value TEXT,
        new_value TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Notifications queue
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER REFERENCES users(id),
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        data TEXT,
        read INTEGER DEFAULT 0,
        sent INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Stock Items table (synced from Tally)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stock_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        parent TEXT,
        base_units TEXT,
        opening_balance REAL DEFAULT 0,
        closing_balance REAL DEFAULT 0,
        closing_value REAL DEFAULT 0,
        closing_rate REAL DEFAULT 0,
        hsn_code TEXT,
        gst_rate REAL DEFAULT 0,
        standard_cost REAL DEFAULT 0,
        selling_price REAL DEFAULT 0,
        alter_id INTEGER DEFAULT 0,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add selling_price and standard_cost columns if they don't exist (migration)
    try {
      this.db.exec(`ALTER TABLE stock_items ADD COLUMN standard_cost REAL DEFAULT 0`);
    } catch (e) { /* Column already exists */ }
    try {
      this.db.exec(`ALTER TABLE stock_items ADD COLUMN selling_price REAL DEFAULT 0`);
    } catch (e) { /* Column already exists */ }

    // Create index for stock items
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_stock_name ON stock_items(name);
      CREATE INDEX IF NOT EXISTS idx_stock_parent ON stock_items(parent);
      CREATE INDEX IF NOT EXISTS idx_stock_alter_id ON stock_items(alter_id);
    `);

    // Parties/Ledgers table (synced from Tally)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS parties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        parent TEXT,
        group_type TEXT DEFAULT 'debtor',
        closing_balance REAL DEFAULT 0,
        address TEXT,
        state TEXT,
        gstin TEXT,
        phone TEXT,
        email TEXT,
        alter_id INTEGER DEFAULT 0,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add group_type column if it doesn't exist (migration)
    try {
      this.db.exec(`ALTER TABLE parties ADD COLUMN group_type TEXT DEFAULT 'debtor'`);
    } catch (e) {
      // Column already exists
    }

    // Create index for parties
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_party_name ON parties(name);
      CREATE INDEX IF NOT EXISTS idx_party_parent ON parties(parent);
      CREATE INDEX IF NOT EXISTS idx_party_alter_id ON parties(alter_id);
      CREATE INDEX IF NOT EXISTS idx_party_group_type ON parties(group_type);
    `);

    // Master sync state (separate from voucher sync)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS master_sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_stock_alter_id INTEGER DEFAULT 0,
        last_party_alter_id INTEGER DEFAULT 0,
        last_stock_sync TEXT,
        last_party_sync TEXT
      )
    `);

    // Initialize master sync state
    this.db.exec(`
      INSERT OR IGNORE INTO master_sync_state (id, last_stock_alter_id, last_party_alter_id) VALUES (1, 0, 0)
    `);

    // Pending invoices table (for offline mode)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_invoices (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        invoice_number TEXT NOT NULL,
        invoice_date TEXT NOT NULL,
        party_name TEXT NOT NULL,
        voucher_type TEXT DEFAULT 'Sales',
        items TEXT NOT NULL,
        total_amount REAL NOT NULL,
        narration TEXT,
        sales_ledger TEXT DEFAULT '1 Sales A/c',
        status TEXT DEFAULT 'pending',
        sync_attempts INTEGER DEFAULT 0,
        sync_error TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        synced_at TEXT
      )
    `);

    // Create index for pending invoices
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pending_invoices_status ON pending_invoices(status);
      CREATE INDEX IF NOT EXISTS idx_pending_invoices_date ON pending_invoices(invoice_date);
    `);

    // Pending Sales Bills table (synced from Tally with ALTERID)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_sales_bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        master_id TEXT UNIQUE NOT NULL,
        guid TEXT,
        voucher_number TEXT NOT NULL,
        voucher_date TEXT NOT NULL,
        party_name TEXT NOT NULL,
        amount REAL NOT NULL,
        narration TEXT,
        alter_id INTEGER DEFAULT 0,
        sfl1 REAL DEFAULT 0,
        sfl2 REAL DEFAULT 0,
        sfl3 REAL DEFAULT 0,
        sfl4 REAL DEFAULT 0,
        sfl5 REAL DEFAULT 0,
        sfl6 REAL DEFAULT 0,
        sfl7 REAL DEFAULT 0,
        sfl_tot REAL DEFAULT 0,
        status TEXT DEFAULT 'pending',
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes for pending_sales_bills
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_psb_master_id ON pending_sales_bills(master_id);
      CREATE INDEX IF NOT EXISTS idx_psb_party ON pending_sales_bills(party_name);
      CREATE INDEX IF NOT EXISTS idx_psb_date ON pending_sales_bills(voucher_date);
      CREATE INDEX IF NOT EXISTS idx_psb_alter_id ON pending_sales_bills(alter_id);
      CREATE INDEX IF NOT EXISTS idx_psb_status ON pending_sales_bills(status);
    `);

    // Pending sales bills sync state
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS psb_sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_alter_id INTEGER DEFAULT 0,
        last_sync_time TEXT,
        bill_count INTEGER DEFAULT 0
      )
    `);

    // Initialize psb sync state
    this.db.exec(`
      INSERT OR IGNORE INTO psb_sync_state (id, last_alter_id, bill_count) VALUES (1, 0, 0)
    `);

    // Activity Log table (tracks all changes: payments, alterations, receipts)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT NOT NULL,
        voucher_number TEXT,
        party_name TEXT,
        amount REAL,
        details TEXT,
        user_id INTEGER REFERENCES users(id),
        status TEXT DEFAULT 'success',
        error_message TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes for activity_log
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_activity_action ON activity_log(action_type);
      CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_log(created_at);
      CREATE INDEX IF NOT EXISTS idx_activity_party ON activity_log(party_name);
      CREATE INDEX IF NOT EXISTS idx_activity_voucher ON activity_log(voucher_number);
    `);

    // Bill inventory items table (stores line items for each bill)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bill_inventory_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_master_id TEXT NOT NULL,
        stock_item_name TEXT NOT NULL,
        quantity REAL DEFAULT 0,
        rate REAL DEFAULT 0,
        amount REAL DEFAULT 0,
        discount REAL DEFAULT 0,
        godown TEXT,
        batch_name TEXT,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bill_master_id) REFERENCES pending_sales_bills(master_id) ON DELETE CASCADE
      )
    `);

    // Indexes for bill_inventory_items
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bii_master_id ON bill_inventory_items(bill_master_id);
      CREATE INDEX IF NOT EXISTS idx_bii_stock_item ON bill_inventory_items(stock_item_name);
    `);

    // Daily invoice counter (resets each day)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_invoice_counter (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        counter_date TEXT NOT NULL,
        last_number INTEGER DEFAULT 0
      )
    `);

    // Initialize daily counter
    this.db.exec(`
      INSERT OR IGNORE INTO daily_invoice_counter (id, counter_date, last_number)
      VALUES (1, date('now'), 0)
    `);

    // Create default admin user if not exists
    const adminExists = this.db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
    if (!adminExists) {
      // Default password: admin123 (should be changed!)
      this.db.prepare(`
        INSERT INTO users (username, password_hash, display_name, role)
        VALUES (?, ?, ?, ?)
      `).run('admin', 'admin123', 'Administrator', 'admin');
      console.log('Default admin user created (username: admin, password: admin123)');
    }
  }

  // ==================== BILLS ====================

  /**
   * Upsert bill from Tally sync
   */
  upsertBill(bill) {
    const stmt = this.db.prepare(`
      INSERT INTO bills (
        tally_guid, tally_master_id, voucher_number, voucher_type,
        voucher_date, party_name, amount, narration, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tally_guid) DO UPDATE SET
        voucher_number = excluded.voucher_number,
        amount = excluded.amount,
        narration = excluded.narration,
        synced_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    `);

    return stmt.run(
      bill.guid,
      bill.masterId,
      bill.voucherNumber,
      bill.voucherType,
      bill.date,
      bill.partyName,
      Math.abs(bill.amount),  // Store as positive
      bill.narration
    );
  }

  /**
   * Get all bills for a date
   */
  getBillsByDate(date) {
    return this.db.prepare(`
      SELECT * FROM bills WHERE voucher_date = ? ORDER BY id DESC
    `).all(date);
  }

  /**
   * Get today's bills
   */
  getTodayBills() {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return this.getBillsByDate(today);
  }

  /**
   * Get pending bills (not fully paid)
   */
  getPendingBills() {
    return this.db.prepare(`
      SELECT * FROM bills
      WHERE payment_status IN ('pending', 'partial')
      AND voucher_type IN ('Sales', 'Credit Sales', 'Pending Sales Bill', 'A Pto Bill')
      ORDER BY voucher_date DESC, id DESC
    `).all();
  }

  /**
   * Get bill by ID
   */
  getBillById(id) {
    return this.db.prepare('SELECT * FROM bills WHERE id = ?').get(id);
  }

  /**
   * Get bill by Tally GUID
   */
  getBillByGuid(guid) {
    return this.db.prepare('SELECT * FROM bills WHERE tally_guid = ?').get(guid);
  }

  /**
   * Update bill payment status
   */
  updateBillPaymentStatus(id, status, amountReceived = null) {
    if (amountReceived !== null) {
      return this.db.prepare(`
        UPDATE bills SET
          payment_status = ?,
          amount_received = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(status, amountReceived, id);
    }
    return this.db.prepare(`
      UPDATE bills SET payment_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(status, id);
  }

  /**
   * Update bill dispatch status
   */
  updateBillDispatchStatus(id, status) {
    return this.db.prepare(`
      UPDATE bills SET dispatch_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(status, id);
  }

  // ==================== RECEIPTS ====================

  /**
   * Create receipt record
   */
  createReceipt(receipt) {
    const stmt = this.db.prepare(`
      INSERT INTO receipts (bill_id, amount, payment_mode, created_by, synced_to_tally)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(
      receipt.billId,
      receipt.amount,
      receipt.paymentMode || 'Cash',
      receipt.createdBy,
      receipt.syncedToTally ? 1 : 0
    );
  }

  /**
   * Update receipt after Tally sync
   */
  updateReceiptSync(id, tallyGuid, synced, error = null) {
    return this.db.prepare(`
      UPDATE receipts SET
        tally_guid = ?,
        synced_to_tally = ?,
        sync_error = ?
      WHERE id = ?
    `).run(tallyGuid, synced ? 1 : 0, error, id);
  }

  /**
   * Get receipts for a bill
   */
  getReceiptsByBill(billId) {
    return this.db.prepare(`
      SELECT r.*, u.display_name as created_by_name
      FROM receipts r
      LEFT JOIN users u ON r.created_by = u.id
      WHERE r.bill_id = ?
      ORDER BY r.created_at DESC
    `).all(billId);
  }

  // ==================== DAYBOOK ====================

  /**
   * Get columnar daybook data
   */
  getDaybook(date, voucherTypes = null) {
    let sql = `
      SELECT
        voucher_date,
        voucher_number,
        voucher_type,
        party_name,
        CASE
          WHEN voucher_type IN ('Sales', 'Credit Sales', 'Pending Sales Bill', 'A Pto Bill')
          THEN amount
          ELSE 0
        END as debit,
        CASE
          WHEN voucher_type IN ('Bank Receipt', 'Counter Receipt', 'Receipt', 'Dashboard Receipt')
          THEN amount
          ELSE 0
        END as credit,
        payment_status,
        dispatch_status
      FROM bills
      WHERE voucher_date = ?
    `;

    const params = [date];

    if (voucherTypes && voucherTypes.length > 0) {
      sql += ` AND voucher_type IN (${voucherTypes.map(() => '?').join(',')})`;
      params.push(...voucherTypes);
    }

    sql += ' ORDER BY id ASC';

    return this.db.prepare(sql).all(...params);
  }

  /**
   * Get party-wise summary
   */
  getPartySummary(fromDate, toDate) {
    return this.db.prepare(`
      SELECT
        party_name,
        SUM(CASE
          WHEN voucher_type IN ('Sales', 'Credit Sales', 'Pending Sales Bill', 'A Pto Bill')
          THEN amount ELSE 0
        END) as total_debit,
        SUM(CASE
          WHEN voucher_type IN ('Bank Receipt', 'Counter Receipt', 'Receipt', 'Dashboard Receipt')
          THEN amount ELSE 0
        END) as total_credit
      FROM bills
      WHERE voucher_date BETWEEN ? AND ?
      GROUP BY party_name
      ORDER BY party_name
    `).all(fromDate, toDate);
  }

  // ==================== SACKS ====================

  /**
   * Create new sack
   */
  createSack(sack) {
    const sackNumber = `SK-${Date.now()}`;
    const stmt = this.db.prepare(`
      INSERT INTO sacks (sack_number, customer_name, notes, created_by)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(sackNumber, sack.customerName, sack.notes, sack.createdBy);
    return { id: result.lastInsertRowid, sackNumber };
  }

  /**
   * Get all sacks
   */
  getAllSacks(status = null) {
    if (status) {
      return this.db.prepare(`
        SELECT s.*,
          (SELECT COUNT(*) FROM sack_items WHERE sack_id = s.id) as item_count
        FROM sacks s
        WHERE s.status = ?
        ORDER BY s.created_at DESC
      `).all(status);
    }
    return this.db.prepare(`
      SELECT s.*,
        (SELECT COUNT(*) FROM sack_items WHERE sack_id = s.id) as item_count
      FROM sacks s
      ORDER BY s.created_at DESC
    `).all();
  }

  /**
   * Get sack by ID with items
   */
  getSackById(id) {
    const sack = this.db.prepare('SELECT * FROM sacks WHERE id = ?').get(id);
    if (!sack) return null;

    const items = this.db.prepare(`
      SELECT si.*, b.voucher_number, b.amount as bill_amount, b.payment_status
      FROM sack_items si
      LEFT JOIN bills b ON si.bill_id = b.id
      WHERE si.sack_id = ?
    `).all(id);

    return { ...sack, items };
  }

  /**
   * Add item to sack
   */
  addSackItem(item) {
    const stmt = this.db.prepare(`
      INSERT INTO sack_items (sack_id, bill_id, external_vendor, external_amount, description)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(
      item.sackId,
      item.billId || null,
      item.externalVendor || null,
      item.externalAmount || null,
      item.description || null
    );
  }

  /**
   * Update sack status
   */
  updateSackStatus(id, status) {
    return this.db.prepare(`
      UPDATE sacks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(status, id);
  }

  // ==================== USERS ====================

  /**
   * Get user by username
   */
  getUserByUsername(username) {
    return this.db.prepare('SELECT * FROM users WHERE username = ? AND active = 1').get(username);
  }

  /**
   * Get user by ID
   */
  getUserById(id) {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  }

  /**
   * Get all users
   */
  getAllUsers() {
    return this.db.prepare(`
      SELECT id, username, display_name, role, language, active, created_at
      FROM users ORDER BY id
    `).all();
  }

  /**
   * Create user
   */
  createUser(user) {
    const stmt = this.db.prepare(`
      INSERT INTO users (username, password_hash, display_name, role, language)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(
      user.username,
      user.password,  // Should be hashed in production!
      user.displayName,
      user.role || 'cashier',
      user.language || 'en'
    );
  }

  /**
   * Update user notification preferences
   */
  updateUserNotificationPrefs(userId, prefs) {
    return this.db.prepare(`
      UPDATE users SET
        notify_new_bill = ?,
        notify_payment = ?,
        notify_large_bill = ?,
        notify_dispatch = ?,
        large_bill_threshold = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      prefs.notifyNewBill ? 1 : 0,
      prefs.notifyPayment ? 1 : 0,
      prefs.notifyLargeBill ? 1 : 0,
      prefs.notifyDispatch ? 1 : 0,
      prefs.largeBillThreshold || 50000,
      userId
    );
  }

  /**
   * Update user FCM token (for push notifications)
   */
  updateUserFcmToken(userId, token) {
    return this.db.prepare(`
      UPDATE users SET fcm_token = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).run(token, userId);
  }

  // ==================== SYNC STATE ====================

  /**
   * Get sync state
   */
  getSyncState() {
    return this.db.prepare('SELECT * FROM sync_state WHERE id = 1').get();
  }

  /**
   * Update sync state
   */
  updateSyncState(state) {
    if (state.lastAlterId !== undefined) {
      return this.db.prepare(`
        UPDATE sync_state SET
          last_sync_time = CURRENT_TIMESTAMP,
          last_voucher_count = ?,
          last_alter_id = ?,
          sync_status = ?,
          error_message = ?
        WHERE id = 1
      `).run(state.voucherCount || 0, state.lastAlterId, state.status || 'idle', state.error || null);
    }
    return this.db.prepare(`
      UPDATE sync_state SET
        last_sync_time = CURRENT_TIMESTAMP,
        last_voucher_count = ?,
        sync_status = ?,
        error_message = ?
      WHERE id = 1
    `).run(state.voucherCount || 0, state.status || 'idle', state.error || null);
  }

  /**
   * Get last AlterID for incremental sync
   */
  getLastAlterId() {
    const state = this.db.prepare('SELECT last_alter_id FROM sync_state WHERE id = 1').get();
    return state?.last_alter_id || 0;
  }

  /**
   * Update last AlterID
   */
  setLastAlterId(alterId) {
    return this.db.prepare('UPDATE sync_state SET last_alter_id = ? WHERE id = 1').run(alterId);
  }

  // ==================== NOTIFICATIONS ====================

  /**
   * Create notification
   */
  createNotification(notification) {
    const stmt = this.db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, data)
      VALUES (?, ?, ?, ?, ?)
    `);
    return stmt.run(
      notification.userId,
      notification.type,
      notification.title,
      notification.message,
      JSON.stringify(notification.data || {})
    );
  }

  /**
   * Get unread notifications for user
   */
  getUnreadNotifications(userId) {
    return this.db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ? AND read = 0
      ORDER BY created_at DESC
      LIMIT 50
    `).all(userId);
  }

  /**
   * Mark notification as read
   */
  markNotificationRead(id) {
    return this.db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id);
  }

  // ==================== DASHBOARD STATS ====================

  /**
   * Get dashboard summary for today
   */
  getDashboardSummary() {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

    const stats = this.db.prepare(`
      SELECT
        (SELECT COALESCE(SUM(amount), 0) FROM bills
         WHERE voucher_date = ? AND voucher_type IN ('Sales', 'Credit Sales', 'Pending Sales Bill', 'A Pto Bill')) as total_sales,
        (SELECT COALESCE(SUM(amount), 0) FROM bills
         WHERE voucher_date = ? AND voucher_type IN ('Bank Receipt', 'Counter Receipt', 'Receipt', 'Dashboard Receipt')) as total_received,
        (SELECT COUNT(*) FROM bills
         WHERE voucher_date = ? AND voucher_type IN ('Sales', 'Credit Sales', 'Pending Sales Bill', 'A Pto Bill')) as bill_count,
        (SELECT COUNT(*) FROM bills
         WHERE payment_status = 'pending' AND voucher_type IN ('Sales', 'Credit Sales', 'Pending Sales Bill', 'A Pto Bill')) as pending_count
    `).get(today, today, today);

    return {
      totalSales: stats.total_sales || 0,
      totalReceived: stats.total_received || 0,
      pendingAmount: (stats.total_sales || 0) - (stats.total_received || 0),
      billCount: stats.bill_count || 0,
      pendingCount: stats.pending_count || 0
    };
  }

  // ==================== STOCK ITEMS ====================

  /**
   * Upsert stock item from Tally
   */
  upsertStockItem(item) {
    const stmt = this.db.prepare(`
      INSERT INTO stock_items (
        name, parent, base_units, opening_balance, closing_balance,
        closing_value, closing_rate, hsn_code, gst_rate, standard_cost, selling_price, alter_id, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        parent = excluded.parent,
        base_units = excluded.base_units,
        opening_balance = excluded.opening_balance,
        closing_balance = excluded.closing_balance,
        closing_value = excluded.closing_value,
        closing_rate = excluded.closing_rate,
        hsn_code = excluded.hsn_code,
        gst_rate = excluded.gst_rate,
        standard_cost = excluded.standard_cost,
        selling_price = excluded.selling_price,
        alter_id = excluded.alter_id,
        updated_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(
      item.name,
      item.parent || '',
      item.baseUnits || '',
      item.openingBalance || 0,
      item.closingBalance || 0,
      item.closingValue || 0,
      item.closingRate || 0,
      item.hsnCode || '',
      item.gstRate || 0,
      item.standardCost || 0,
      item.sellingPrice || 0,
      item.alterId || 0
    );
  }

  /**
   * Bulk upsert stock items
   */
  upsertStockItems(items) {
    const upsert = this.db.transaction((items) => {
      for (const item of items) {
        this.upsertStockItem(item);
      }
    });
    upsert(items);
    return items.length;
  }

  /**
   * Get all stock items from database
   */
  getAllStockItems() {
    return this.db.prepare(`
      SELECT * FROM stock_items ORDER BY name
    `).all();
  }

  /**
   * Get stock items with closing balance > 0
   */
  getStockItemsWithBalance() {
    return this.db.prepare(`
      SELECT * FROM stock_items WHERE closing_balance > 0 ORDER BY name
    `).all();
  }

  /**
   * Search stock items by name
   */
  searchStockItems(query, limit = 50) {
    return this.db.prepare(`
      SELECT * FROM stock_items
      WHERE name LIKE ?
      ORDER BY name
      LIMIT ?
    `).all(`%${query}%`, limit);
  }

  /**
   * Get stock item by name
   */
  getStockItemByName(name) {
    return this.db.prepare('SELECT * FROM stock_items WHERE name = ?').get(name);
  }

  /**
   * Get stock items count
   */
  getStockItemsCount() {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM stock_items').get();
    return result.count;
  }

  // ==================== PARTIES ====================

  /**
   * Upsert party from Tally
   */
  upsertParty(party) {
    const stmt = this.db.prepare(`
      INSERT INTO parties (
        name, parent, group_type, closing_balance, address, state, gstin, phone, email, alter_id, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        parent = excluded.parent,
        group_type = excluded.group_type,
        closing_balance = excluded.closing_balance,
        address = excluded.address,
        state = excluded.state,
        gstin = excluded.gstin,
        phone = excluded.phone,
        email = excluded.email,
        alter_id = excluded.alter_id,
        updated_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(
      party.name,
      party.parent || '',
      party.groupType || 'debtor',
      party.balance || 0,
      party.address || '',
      party.state || '',
      party.gstin || '',
      party.phone || '',
      party.email || '',
      party.alterId || 0
    );
  }

  /**
   * Bulk upsert parties
   */
  upsertParties(parties) {
    const upsert = this.db.transaction((parties) => {
      for (const party of parties) {
        this.upsertParty(party);
      }
    });
    upsert(parties);
    return parties.length;
  }

  /**
   * Get all parties from database
   */
  getAllParties(parentGroup = null) {
    if (parentGroup) {
      return this.db.prepare(`
        SELECT * FROM parties WHERE parent = ? ORDER BY name
      `).all(parentGroup);
    }
    return this.db.prepare(`
      SELECT * FROM parties ORDER BY name
    `).all();
  }

  /**
   * Get Sundry Debtors (customers) - all ledgers under Sundry Debtors group
   */
  getDebtors() {
    return this.db.prepare(`
      SELECT * FROM parties WHERE group_type = 'debtor' ORDER BY name
    `).all();
  }

  /**
   * Get Sundry Creditors (vendors) - all ledgers under Sundry Creditors group
   */
  getCreditors() {
    return this.db.prepare(`
      SELECT * FROM parties WHERE group_type = 'creditor' ORDER BY name
    `).all();
  }

  /**
   * Search parties by name
   */
  searchParties(query, limit = 50) {
    return this.db.prepare(`
      SELECT * FROM parties
      WHERE name LIKE ?
      ORDER BY name
      LIMIT ?
    `).all(`%${query}%`, limit);
  }

  /**
   * Get party by name
   */
  getPartyByName(name) {
    return this.db.prepare('SELECT * FROM parties WHERE name = ?').get(name);
  }

  /**
   * Get parties count
   */
  getPartiesCount() {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM parties').get();
    return result.count;
  }

  // ==================== MASTER SYNC STATE ====================

  /**
   * Get master sync state
   */
  getMasterSyncState() {
    return this.db.prepare('SELECT * FROM master_sync_state WHERE id = 1').get();
  }

  /**
   * Update stock sync state
   */
  updateStockSyncState(lastAlterId) {
    return this.db.prepare(`
      UPDATE master_sync_state SET
        last_stock_alter_id = ?,
        last_stock_sync = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(lastAlterId);
  }

  /**
   * Update party sync state
   */
  updatePartySyncState(lastAlterId) {
    return this.db.prepare(`
      UPDATE master_sync_state SET
        last_party_alter_id = ?,
        last_party_sync = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(lastAlterId);
  }

  /**
   * Get last stock AlterID
   */
  getLastStockAlterId() {
    const state = this.db.prepare('SELECT last_stock_alter_id FROM master_sync_state WHERE id = 1').get();
    return state?.last_stock_alter_id || 0;
  }

  /**
   * Get last party AlterID
   */
  getLastPartyAlterId() {
    const state = this.db.prepare('SELECT last_party_alter_id FROM master_sync_state WHERE id = 1').get();
    return state?.last_party_alter_id || 0;
  }

  /**
   * Clear all stock items (for reset/refresh)
   */
  clearStockItems() {
    return this.db.prepare('DELETE FROM stock_items').run();
  }

  /**
   * Clear all parties (for reset/refresh)
   */
  clearParties() {
    return this.db.prepare('DELETE FROM parties').run();
  }

  // ==================== PENDING INVOICES (OFFLINE MODE) ====================

  /**
   * Get next daily invoice number (resets each day)
   * Format: DB-YYYYMMDD-NNN (e.g., DB-20260204-001)
   */
  getNextInvoiceNumber() {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const dateStr = today.replace(/-/g, ''); // YYYYMMDD

    // Check if we need to reset the counter for a new day
    const currentState = this.db.prepare('SELECT * FROM daily_invoice_counter WHERE id = 1').get();

    if (!currentState || currentState.counter_date !== today) {
      // New day - reset counter
      this.db.prepare(`
        INSERT OR REPLACE INTO daily_invoice_counter (id, counter_date, last_number)
        VALUES (1, ?, 0)
      `).run(today);
    }

    // Increment and get the new number
    this.db.prepare(`
      UPDATE daily_invoice_counter SET last_number = last_number + 1 WHERE id = 1
    `).run();

    const updated = this.db.prepare('SELECT last_number FROM daily_invoice_counter WHERE id = 1').get();
    const num = String(updated.last_number).padStart(3, '0');

    return `DB-${dateStr}-${num}`;
  }

  /**
   * Create pending invoice (when Tally is offline)
   */
  createPendingInvoice(invoice) {
    const invoiceNumber = this.getNextInvoiceNumber();
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');

    const stmt = this.db.prepare(`
      INSERT INTO pending_invoices (
        invoice_number, invoice_date, party_name, voucher_type,
        items, total_amount, narration, sales_ledger, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    const result = stmt.run(
      invoiceNumber,
      invoice.date || today,
      invoice.partyName,
      invoice.voucherType || 'Sales',
      JSON.stringify(invoice.items),
      invoice.totalAmount,
      invoice.narration || '',
      invoice.salesLedger || '1 Sales A/c'
    );

    return {
      id: result.lastInsertRowid,
      invoiceNumber,
      status: 'pending'
    };
  }

  /**
   * Get all pending invoices
   */
  getPendingInvoices() {
    return this.db.prepare(`
      SELECT * FROM pending_invoices
      WHERE status = 'pending'
      ORDER BY created_at ASC
    `).all();
  }

  /**
   * Get all pending invoices (including failed)
   */
  getAllPendingInvoices() {
    return this.db.prepare(`
      SELECT * FROM pending_invoices
      WHERE status IN ('pending', 'failed')
      ORDER BY created_at DESC
    `).all();
  }

  /**
   * Get pending invoice by ID
   */
  getPendingInvoiceById(id) {
    return this.db.prepare('SELECT * FROM pending_invoices WHERE id = ?').get(id);
  }

  /**
   * Update pending invoice status after sync attempt
   */
  updatePendingInvoiceStatus(id, status, error = null) {
    if (status === 'synced') {
      return this.db.prepare(`
        UPDATE pending_invoices SET
          status = 'synced',
          synced_at = CURRENT_TIMESTAMP,
          sync_error = NULL
        WHERE id = ?
      `).run(id);
    }

    return this.db.prepare(`
      UPDATE pending_invoices SET
        status = ?,
        sync_attempts = sync_attempts + 1,
        sync_error = ?
      WHERE id = ?
    `).run(status, error, id);
  }

  /**
   * Get count of pending invoices
   */
  getPendingInvoiceCount() {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM pending_invoices WHERE status = 'pending'
    `).get();
    return result.count;
  }

  /**
   * Get today's dashboard invoice count
   */
  getTodayInvoiceCount() {
    const today = new Date().toISOString().split('T')[0];
    const result = this.db.prepare(`
      SELECT last_number FROM daily_invoice_counter WHERE counter_date = ?
    `).get(today);
    return result?.last_number || 0;
  }

  // ==================== PENDING SALES BILLS ====================

  /**
   * Upsert pending sales bill from Tally
   */
  upsertPendingSalesBill(bill) {
    const stmt = this.db.prepare(`
      INSERT INTO pending_sales_bills (
        master_id, guid, voucher_number, voucher_date, party_name, amount,
        narration, alter_id, sfl1, sfl2, sfl3, sfl4, sfl5, sfl6, sfl7, sfl_tot,
        status, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)
      ON CONFLICT(master_id) DO UPDATE SET
        guid = excluded.guid,
        voucher_number = excluded.voucher_number,
        voucher_date = excluded.voucher_date,
        party_name = excluded.party_name,
        amount = excluded.amount,
        narration = excluded.narration,
        alter_id = excluded.alter_id,
        sfl1 = excluded.sfl1,
        sfl2 = excluded.sfl2,
        sfl3 = excluded.sfl3,
        sfl4 = excluded.sfl4,
        sfl5 = excluded.sfl5,
        sfl6 = excluded.sfl6,
        sfl7 = excluded.sfl7,
        sfl_tot = excluded.sfl_tot,
        updated_at = CURRENT_TIMESTAMP
    `);
    return stmt.run(
      bill.masterId,
      bill.guid || '',
      bill.voucherNumber,
      bill.date,
      bill.partyName,
      Math.abs(bill.amount || 0),
      bill.narration || '',
      bill.alterId || 0,
      bill.sfl1 || 0,
      bill.sfl2 || 0,
      bill.sfl3 || 0,
      bill.sfl4 || 0,
      bill.sfl5 || 0,
      bill.sfl6 || 0,
      bill.sfl7 || 0,
      bill.sflTot || 0
    );
  }

  /**
   * Bulk upsert pending sales bills
   */
  upsertPendingSalesBills(bills) {
    const upsert = this.db.transaction((bills) => {
      for (const bill of bills) {
        this.upsertPendingSalesBill(bill);
      }
    });
    upsert(bills);
    return bills.length;
  }

  /**
   * Get all pending sales bills from database
   */
  getAllPendingSalesBills() {
    return this.db.prepare(`
      SELECT * FROM pending_sales_bills
      WHERE status = 'pending'
      ORDER BY voucher_date DESC, id DESC
    `).all();
  }

  /**
   * Get pending sales bill by master_id
   */
  getPendingSalesBillByMasterId(masterId) {
    return this.db.prepare('SELECT * FROM pending_sales_bills WHERE master_id = ?').get(masterId);
  }

  /**
   * Search pending sales bills by party name
   */
  searchPendingSalesBills(query, limit = 100) {
    return this.db.prepare(`
      SELECT * FROM pending_sales_bills
      WHERE status = 'pending' AND party_name LIKE ?
      ORDER BY voucher_date DESC, id DESC
      LIMIT ?
    `).all(`%${query}%`, limit);
  }

  /**
   * Update pending sales bill status (when payment is made)
   */
  updatePendingSalesBillStatus(masterId, status) {
    return this.db.prepare(`
      UPDATE pending_sales_bills SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE master_id = ?
    `).run(status, masterId);
  }

  /**
   * Delete pending sales bill (when converted to Sales/Credit Sales)
   */
  deletePendingSalesBill(masterId) {
    return this.db.prepare('DELETE FROM pending_sales_bills WHERE master_id = ?').run(masterId);
  }

  /**
   * Get pending sales bills count
   */
  getPendingSalesBillsCount() {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM pending_sales_bills WHERE status = 'pending'
    `).get();
    return result.count;
  }

  /**
   * Get PSB sync state
   */
  getPSBSyncState() {
    return this.db.prepare('SELECT * FROM psb_sync_state WHERE id = 1').get();
  }

  /**
   * Update PSB sync state
   */
  updatePSBSyncState(lastAlterId, billCount) {
    return this.db.prepare(`
      UPDATE psb_sync_state SET
        last_alter_id = ?,
        bill_count = ?,
        last_sync_time = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run(lastAlterId, billCount);
  }

  /**
   * Get last PSB AlterID
   */
  getLastPSBAlterId() {
    const state = this.db.prepare('SELECT last_alter_id FROM psb_sync_state WHERE id = 1').get();
    return state?.last_alter_id || 0;
  }

  /**
   * Clear all pending sales bills (for full refresh)
   */
  clearPendingSalesBills() {
    this.db.prepare('DELETE FROM pending_sales_bills').run();
    this.db.prepare('UPDATE psb_sync_state SET last_alter_id = 0, bill_count = 0 WHERE id = 1').run();
  }

  // ==================== ACTIVITY LOG ====================

  /**
   * Log an activity (payment, alteration, receipt creation, etc.)
   */
  logActivity(activity) {
    const stmt = this.db.prepare(`
      INSERT INTO activity_log (
        action_type, voucher_number, party_name, amount, details, user_id, status, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(
      activity.actionType,
      activity.voucherNumber || null,
      activity.partyName || null,
      activity.amount || null,
      typeof activity.details === 'object' ? JSON.stringify(activity.details) : activity.details,
      activity.userId || null,
      activity.status || 'success',
      activity.errorMessage || null
    );
  }

  /**
   * Get recent activity logs
   */
  getRecentActivities(limit = 50) {
    return this.db.prepare(`
      SELECT * FROM activity_log
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get activity logs by date range
   */
  getActivitiesByDateRange(fromDate, toDate, limit = 100) {
    return this.db.prepare(`
      SELECT * FROM activity_log
      WHERE date(created_at) BETWEEN ? AND ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(fromDate, toDate, limit);
  }

  /**
   * Get activity logs by action type
   */
  getActivitiesByType(actionType, limit = 50) {
    return this.db.prepare(`
      SELECT * FROM activity_log
      WHERE action_type = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(actionType, limit);
  }

  /**
   * Get activity logs for a specific party
   */
  getActivitiesByParty(partyName, limit = 50) {
    return this.db.prepare(`
      SELECT * FROM activity_log
      WHERE party_name = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(partyName, limit);
  }

  /**
   * Get today's activities
   */
  getTodayActivities() {
    return this.db.prepare(`
      SELECT * FROM activity_log
      WHERE date(created_at) = date('now')
      ORDER BY created_at DESC
    `).all();
  }

  /**
   * Get activity count by type for today
   */
  getTodayActivityStats() {
    return this.db.prepare(`
      SELECT
        action_type,
        COUNT(*) as count,
        SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
        SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
        SUM(amount) as total_amount
      FROM activity_log
      WHERE date(created_at) = date('now')
      GROUP BY action_type
    `).all();
  }

  // ==================== BILL INVENTORY ITEMS ====================

  /**
   * Upsert bill inventory items (line items for a bill)
   */
  upsertBillInventoryItems(billMasterId, items) {
    // First delete existing items for this bill
    this.db.prepare('DELETE FROM bill_inventory_items WHERE bill_master_id = ?').run(billMasterId);

    // Then insert new items
    const stmt = this.db.prepare(`
      INSERT INTO bill_inventory_items (
        bill_master_id, stock_item_name, quantity, rate, amount, discount, godown, batch_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const upsert = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(
          billMasterId,
          item.stockItemName || item.name || '',
          item.quantity || 0,
          item.rate || 0,
          item.amount || 0,
          item.discount || 0,
          item.godown || '',
          item.batchName || ''
        );
      }
    });

    upsert(items);
    return items.length;
  }

  /**
   * Get inventory items for a bill
   */
  getBillInventoryItems(billMasterId) {
    return this.db.prepare(`
      SELECT * FROM bill_inventory_items
      WHERE bill_master_id = ?
      ORDER BY id
    `).all(billMasterId);
  }

  /**
   * Get bill with inventory items (for printing)
   */
  getBillWithInventory(masterId) {
    const bill = this.db.prepare('SELECT * FROM pending_sales_bills WHERE master_id = ?').get(masterId);
    if (!bill) return null;

    const items = this.getBillInventoryItems(masterId);
    return { ...bill, inventoryItems: items };
  }

  /**
   * Delete inventory items for a bill
   */
  deleteBillInventoryItems(billMasterId) {
    return this.db.prepare('DELETE FROM bill_inventory_items WHERE bill_master_id = ?').run(billMasterId);
  }

  /**
   * Check if bill has inventory items
   */
  hasBillInventoryItems(billMasterId) {
    const result = this.db.prepare(`
      SELECT COUNT(*) as count FROM bill_inventory_items WHERE bill_master_id = ?
    `).get(billMasterId);
    return result.count > 0;
  }

  /**
   * Close database connection
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

// Export singleton
export const db = new DatabaseService();
export default db;
