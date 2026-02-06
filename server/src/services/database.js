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

    // Add alter_id column to bills if not exists (migration)
    try {
      this.db.exec(`ALTER TABLE bills ADD COLUMN alter_id INTEGER DEFAULT 0`);
    } catch (e) {
      // Column already exists
    }

    // ==================== VOUCHER HISTORY SYSTEM ====================
    // Comprehensive tracking of all voucher changes

    // Main voucher history table - stores complete snapshots
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS voucher_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        master_id TEXT NOT NULL,
        alter_id INTEGER NOT NULL,
        previous_alter_id INTEGER,
        guid TEXT,
        voucher_number TEXT,
        voucher_type TEXT,
        voucher_date TEXT,
        party_name TEXT,
        amount REAL,
        narration TEXT,
        payment_status TEXT,
        dispatch_status TEXT,
        amount_received REAL,
        change_type TEXT DEFAULT 'modified',
        change_reason TEXT,
        version_number INTEGER DEFAULT 1,
        captured_at TEXT DEFAULT CURRENT_TIMESTAMP,
        tally_sync_time TEXT
      )
    `);

    // Change log table - tracks what fields changed
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS voucher_change_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        master_id TEXT NOT NULL,
        old_alter_id INTEGER,
        new_alter_id INTEGER,
        field_name TEXT NOT NULL,
        old_value TEXT,
        new_value TEXT,
        changed_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migrations for voucher_history table (add new columns if not exist)
    const vhMigrations = [
      'ALTER TABLE voucher_history ADD COLUMN previous_alter_id INTEGER',
      'ALTER TABLE voucher_history ADD COLUMN payment_status TEXT',
      'ALTER TABLE voucher_history ADD COLUMN dispatch_status TEXT',
      'ALTER TABLE voucher_history ADD COLUMN amount_received REAL',
      'ALTER TABLE voucher_history ADD COLUMN change_reason TEXT',
      'ALTER TABLE voucher_history ADD COLUMN version_number INTEGER DEFAULT 1',
      'ALTER TABLE voucher_history ADD COLUMN tally_sync_time TEXT'
    ];
    for (const sql of vhMigrations) {
      try { this.db.exec(sql); } catch (e) { /* Column exists */ }
    }

    // Indexes for fast history lookups
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_vh_master_id ON voucher_history(master_id);
      CREATE INDEX IF NOT EXISTS idx_vh_alter_id ON voucher_history(alter_id);
      CREATE INDEX IF NOT EXISTS idx_vh_date ON voucher_history(voucher_date);
      CREATE INDEX IF NOT EXISTS idx_vh_captured ON voucher_history(captured_at);
      CREATE INDEX IF NOT EXISTS idx_vcl_master_id ON voucher_change_log(master_id);
      CREATE INDEX IF NOT EXISTS idx_vcl_changed ON voucher_change_log(changed_at);
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

    // ==================== FONEPAY TABLES ====================

    // Fonepay balance/summary snapshots
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fonepay_balance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        balance REAL DEFAULT 0,
        today_transactions INTEGER DEFAULT 0,
        today_amount REAL DEFAULT 0,
        pending_settlement REAL DEFAULT 0,
        captured_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Fonepay transactions
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fonepay_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id TEXT UNIQUE,
        transaction_date TEXT,
        description TEXT,
        amount REAL DEFAULT 0,
        status TEXT,
        type TEXT,
        prn_third_party TEXT,
        terminal_id TEXT,
        terminal_name TEXT,
        prn_hub TEXT,
        initiator TEXT,
        issuer_name TEXT,
        raw_data TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Add new columns for existing tables (migration)
    try {
      this.db.exec(`ALTER TABLE fonepay_transactions ADD COLUMN prn_third_party TEXT`);
      this.db.exec(`ALTER TABLE fonepay_transactions ADD COLUMN terminal_id TEXT`);
      this.db.exec(`ALTER TABLE fonepay_transactions ADD COLUMN terminal_name TEXT`);
      this.db.exec(`ALTER TABLE fonepay_transactions ADD COLUMN prn_hub TEXT`);
      this.db.exec(`ALTER TABLE fonepay_transactions ADD COLUMN initiator TEXT`);
      this.db.exec(`ALTER TABLE fonepay_transactions ADD COLUMN issuer_name TEXT`);
    } catch (e) {
      // Columns already exist, ignore
    }

    // Create index for transactions
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fonepay_txn_date ON fonepay_transactions(transaction_date);
      CREATE INDEX IF NOT EXISTS idx_fonepay_txn_id ON fonepay_transactions(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_fonepay_txn_issuer ON fonepay_transactions(issuer_name);
    `);

    // Fonepay settlements
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fonepay_settlements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        settlement_id TEXT UNIQUE,
        settlement_date TEXT,
        amount REAL DEFAULT 0,
        status TEXT,
        bank_ref TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create index for settlements
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fonepay_settlement_date ON fonepay_settlements(settlement_date);
    `);

    // Fonepay sync state
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS fonepay_sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_sync_time TEXT,
        sync_status TEXT DEFAULT 'idle',
        error_message TEXT,
        total_syncs INTEGER DEFAULT 0
      )
    `);

    // Initialize fonepay sync state
    this.db.exec(`
      INSERT OR IGNORE INTO fonepay_sync_state (id, sync_status) VALUES (1, 'idle')
    `);

    // ==================== FULL HISTORICAL SYNC ====================
    // Tracks progress of full historical data fetch from Tally

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS full_sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        status TEXT DEFAULT 'not_started',
        start_date TEXT,
        current_date TEXT,
        end_date TEXT,
        total_vouchers_synced INTEGER DEFAULT 0,
        max_alter_id INTEGER DEFAULT 0,
        batches_completed INTEGER DEFAULT 0,
        started_at TEXT,
        completed_at TEXT,
        last_error TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize full sync state
    this.db.exec(`
      INSERT OR IGNORE INTO full_sync_state (id, status) VALUES (1, 'not_started')
    `);
  }

  // ==================== BILLS ====================

  /**
   * Upsert bill from Tally sync
   * Now saves history and logs field changes when voucher is modified
   */
  upsertBill(bill) {
    // Check if bill already exists
    const existing = this.db.prepare('SELECT * FROM bills WHERE tally_guid = ?').get(bill.guid);

    // If exists and alter_id changed, save old version to history and log changes
    if (existing && bill.alterId && existing.alter_id !== bill.alterId) {
      // Save complete snapshot to history
      this.saveVoucherHistory(existing, 'modified', bill.alterId);

      // Log field-level changes
      const changes = this.logVoucherChanges(existing, bill);
      if (changes.length > 0) {
        console.log(`Voucher ${bill.masterId} modified:`, changes.map(c => `${c.field}: "${c.from}" → "${c.to}"`).join(', '));
      }
    }

    const stmt = this.db.prepare(`
      INSERT INTO bills (
        tally_guid, tally_master_id, voucher_number, voucher_type,
        voucher_date, party_name, amount, narration, alter_id, synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tally_guid) DO UPDATE SET
        voucher_number = excluded.voucher_number,
        amount = excluded.amount,
        narration = excluded.narration,
        alter_id = excluded.alter_id,
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
      bill.narration,
      bill.alterId || 0
    );
  }

  /**
   * Save voucher to history table (complete snapshot before modification)
   */
  saveVoucherHistory(voucher, changeType = 'modified', newAlterId = null) {
    // Get version number for this voucher
    const versionResult = this.db.prepare(`
      SELECT COALESCE(MAX(version_number), 0) + 1 as next_version
      FROM voucher_history WHERE master_id = ?
    `).get(voucher.tally_master_id || voucher.master_id);
    const versionNumber = versionResult?.next_version || 1;

    const stmt = this.db.prepare(`
      INSERT INTO voucher_history (
        master_id, alter_id, previous_alter_id, guid, voucher_number, voucher_type,
        voucher_date, party_name, amount, narration, payment_status, dispatch_status,
        amount_received, change_type, version_number, tally_sync_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    return stmt.run(
      voucher.tally_master_id || voucher.master_id,
      voucher.alter_id || 0,
      newAlterId,  // The new alter_id that replaced this version
      voucher.tally_guid || voucher.guid,
      voucher.voucher_number,
      voucher.voucher_type,
      voucher.voucher_date,
      voucher.party_name,
      voucher.amount,
      voucher.narration,
      voucher.payment_status,
      voucher.dispatch_status,
      voucher.amount_received,
      changeType,
      versionNumber,
      voucher.synced_at
    );
  }

  /**
   * Log field-level changes between old and new voucher
   */
  logVoucherChanges(oldVoucher, newVoucher) {
    const masterId = oldVoucher.tally_master_id || oldVoucher.master_id;
    const oldAlterId = oldVoucher.alter_id;
    const newAlterId = newVoucher.alterId;

    const fieldsToTrack = [
      { db: 'voucher_number', new: 'voucherNumber' },
      { db: 'voucher_type', new: 'voucherType' },
      { db: 'voucher_date', new: 'date' },
      { db: 'party_name', new: 'partyName' },
      { db: 'amount', new: 'amount' },
      { db: 'narration', new: 'narration' }
    ];

    const stmt = this.db.prepare(`
      INSERT INTO voucher_change_log (
        master_id, old_alter_id, new_alter_id, field_name, old_value, new_value
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);

    const changes = [];
    for (const field of fieldsToTrack) {
      const oldVal = String(oldVoucher[field.db] || '');
      let newVal = String(newVoucher[field.new] || '');

      // Handle amount specially (absolute value)
      if (field.db === 'amount') {
        newVal = String(Math.abs(parseFloat(newVoucher[field.new]) || 0));
      }

      if (oldVal !== newVal) {
        stmt.run(masterId, oldAlterId, newAlterId, field.db, oldVal, newVal);
        changes.push({ field: field.db, from: oldVal, to: newVal });
      }
    }

    return changes;
  }

  /**
   * Get voucher history by master_id (all versions)
   */
  getVoucherHistory(masterId) {
    return this.db.prepare(`
      SELECT * FROM voucher_history
      WHERE master_id = ?
      ORDER BY version_number ASC, alter_id ASC
    `).all(masterId);
  }

  /**
   * Get voucher by specific alter_id (from history)
   */
  getVoucherByAlterId(alterId) {
    // First check current bills
    const current = this.db.prepare('SELECT * FROM bills WHERE alter_id = ?').get(alterId);
    if (current) return { ...current, source: 'current' };

    // Then check history
    const history = this.db.prepare('SELECT * FROM voucher_history WHERE alter_id = ?').get(alterId);
    if (history) return { ...history, source: 'history' };

    return null;
  }

  /**
   * Get all voucher history (recent changes)
   */
  getAllVoucherHistory(limit = 100) {
    return this.db.prepare(`
      SELECT * FROM voucher_history
      ORDER BY captured_at DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get change log for a voucher
   */
  getVoucherChangeLog(masterId) {
    return this.db.prepare(`
      SELECT * FROM voucher_change_log
      WHERE master_id = ?
      ORDER BY changed_at ASC
    `).all(masterId);
  }

  /**
   * Get recent changes across all vouchers
   */
  getRecentChanges(limit = 50) {
    return this.db.prepare(`
      SELECT * FROM voucher_change_log
      ORDER BY changed_at DESC
      LIMIT ?
    `).all(limit);
  }

  /**
   * Get history statistics
   */
  getHistoryStats() {
    const stats = this.db.prepare(`
      SELECT
        COUNT(DISTINCT master_id) as vouchers_with_history,
        COUNT(*) as total_versions,
        MAX(captured_at) as last_change
      FROM voucher_history
    `).get();

    const changeStats = this.db.prepare(`
      SELECT
        field_name,
        COUNT(*) as change_count
      FROM voucher_change_log
      GROUP BY field_name
      ORDER BY change_count DESC
    `).all();

    return { ...stats, fieldChanges: changeStats };
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

  // ==================== FONEPAY ====================

  /**
   * Save Fonepay balance snapshot
   */
  saveFonepayBalance(data) {
    const stmt = this.db.prepare(`
      INSERT INTO fonepay_balance (balance, today_transactions, today_amount, pending_settlement)
      VALUES (?, ?, ?, ?)
    `);
    return stmt.run(
      data.balance || 0,
      data.todayTransactions || 0,
      data.todayAmount || 0,
      data.pendingSettlement || 0
    );
  }

  /**
   * Get latest Fonepay balance
   */
  getLatestFonepayBalance() {
    return this.db.prepare(`
      SELECT * FROM fonepay_balance ORDER BY id DESC LIMIT 1
    `).get();
  }

  /**
   * Get Fonepay balance history
   */
  getFonepayBalanceHistory(limit = 100) {
    return this.db.prepare(`
      SELECT * FROM fonepay_balance ORDER BY id DESC LIMIT ?
    `).all(limit);
  }

  /**
   * Save Fonepay transaction with full column mapping
   * Columns: Transmission Date, PRN (Third Party), Terminal ID, Terminal Name, PRN (Hub), Initiator, Amount, Status, Issuer Name
   */
  saveFonepayTransaction(txn) {
    const stmt = this.db.prepare(`
      INSERT INTO fonepay_transactions (
        transaction_id, transaction_date, description, amount, status, type,
        prn_third_party, terminal_id, terminal_name, prn_hub, initiator, issuer_name, raw_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(transaction_id) DO UPDATE SET
        transaction_date = excluded.transaction_date,
        description = excluded.description,
        amount = excluded.amount,
        status = excluded.status,
        type = excluded.type,
        prn_third_party = excluded.prn_third_party,
        terminal_id = excluded.terminal_id,
        terminal_name = excluded.terminal_name,
        prn_hub = excluded.prn_hub,
        initiator = excluded.initiator,
        issuer_name = excluded.issuer_name,
        raw_data = excluded.raw_data
    `);

    // Generate unique transaction ID based on date + initiator + amount to avoid duplicates
    const txnDate = txn.transmissionDate || txn.date || '';
    const txnId = txn.id || `TXN-${txnDate.replace(/[^0-9]/g, '')}-${txn.initiator || ''}-${txn.amount || 0}`;

    return stmt.run(
      txnId,
      txnDate,
      txn.prnThirdParty || txn.description || '',
      txn.amount || 0,
      txn.status || 'unknown',
      txn.type || 'payment',
      txn.prnThirdParty || 'N/A',
      txn.terminalId || '',
      txn.terminalName || '',
      txn.prnHub || 'N/A',
      txn.initiator || '',
      txn.issuerName || '',
      JSON.stringify(txn)
    );
  }

  /**
   * Get Fonepay transactions (latest first)
   */
  getFonepayTransactions(limit = 100, offset = 0) {
    return this.db.prepare(`
      SELECT * FROM fonepay_transactions ORDER BY transaction_date DESC LIMIT ? OFFSET ?
    `).all(limit, offset);
  }

  /**
   * Get Fonepay transactions by date
   */
  getFonepayTransactionsByDate(date) {
    return this.db.prepare(`
      SELECT * FROM fonepay_transactions WHERE transaction_date = ? ORDER BY created_at DESC
    `).all(date);
  }

  /**
   * Get Fonepay transactions count
   */
  getFonepayTransactionsCount() {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM fonepay_transactions').get();
    return result.count;
  }

  /**
   * Get today's Fonepay transactions
   */
  getTodayFonepayTransactions() {
    const today = new Date().toISOString().split('T')[0];
    return this.getFonepayTransactionsByDate(today);
  }

  /**
   * Get the latest transaction date in the database
   * Returns date in YYYY-MM-DD format or null if no transactions
   */
  getLatestFonepayTransactionDate() {
    const result = this.db.prepare(`
      SELECT MAX(DATE(transaction_date)) as latest_date
      FROM fonepay_transactions
    `).get();
    return result?.latest_date || null;
  }

  /**
   * Save Fonepay settlement
   */
  saveFonepaySettlement(settlement) {
    const stmt = this.db.prepare(`
      INSERT INTO fonepay_settlements (
        settlement_id, settlement_date, amount, status, bank_ref
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(settlement_id) DO UPDATE SET
        settlement_date = excluded.settlement_date,
        amount = excluded.amount,
        status = excluded.status,
        bank_ref = excluded.bank_ref
    `);
    return stmt.run(
      settlement.id || `STL-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      settlement.date || new Date().toISOString().split('T')[0],
      settlement.amount || 0,
      settlement.status || 'unknown',
      settlement.bankRef || ''
    );
  }

  /**
   * Get Fonepay settlements
   */
  getFonepaySettlements(limit = 50) {
    return this.db.prepare(`
      SELECT * FROM fonepay_settlements ORDER BY created_at DESC LIMIT ?
    `).all(limit);
  }

  /**
   * Get Fonepay sync state
   */
  getFonepaySyncState() {
    return this.db.prepare('SELECT * FROM fonepay_sync_state WHERE id = 1').get();
  }

  /**
   * Update Fonepay sync state
   */
  updateFonepaySyncState(state) {
    return this.db.prepare(`
      UPDATE fonepay_sync_state SET
        last_sync_time = CURRENT_TIMESTAMP,
        sync_status = ?,
        error_message = ?,
        total_syncs = total_syncs + 1
      WHERE id = 1
    `).run(state.status || 'idle', state.error || null);
  }

  /**
   * Get Fonepay dashboard summary
   */
  getFonepayDashboard() {
    const latestBalance = this.getLatestFonepayBalance();
    const todayTxns = this.getTodayFonepayTransactions();
    const syncState = this.getFonepaySyncState();

    const todayTotal = todayTxns.reduce((sum, txn) => sum + (txn.amount || 0), 0);

    return {
      balance: latestBalance?.balance || 0,
      todayTransactions: todayTxns.length,
      todayAmount: todayTotal,
      pendingSettlement: latestBalance?.pending_settlement || 0,
      lastSync: syncState?.last_sync_time || null,
      syncStatus: syncState?.sync_status || 'idle',
      totalSyncs: syncState?.total_syncs || 0
    };
  }

  // ==================== FULL HISTORICAL SYNC ====================

  /**
   * Get full sync state
   */
  getFullSyncState() {
    return this.db.prepare('SELECT * FROM full_sync_state WHERE id = 1').get();
  }

  /**
   * Update full sync state
   */
  updateFullSyncState(state) {
    const current = this.getFullSyncState();

    const stmt = this.db.prepare(`
      UPDATE full_sync_state SET
        status = ?,
        start_date = ?,
        current_date = ?,
        end_date = ?,
        total_vouchers_synced = ?,
        max_alter_id = ?,
        batches_completed = ?,
        started_at = ?,
        completed_at = ?,
        last_error = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `);

    return stmt.run(
      state.status || current?.status || 'not_started',
      state.startDate || current?.start_date || null,
      state.currentDate || current?.current_date || null,
      state.endDate || current?.end_date || null,
      state.totalVouchersSynced ?? current?.total_vouchers_synced ?? 0,
      state.maxAlterId ?? current?.max_alter_id ?? 0,
      state.batchesCompleted ?? current?.batches_completed ?? 0,
      state.startedAt || current?.started_at || null,
      state.completedAt || current?.completed_at || null,
      state.lastError || current?.last_error || null
    );
  }

  /**
   * Reset full sync state for a new full sync
   */
  resetFullSyncState() {
    return this.db.prepare(`
      UPDATE full_sync_state SET
        status = 'not_started',
        start_date = NULL,
        current_date = NULL,
        end_date = NULL,
        total_vouchers_synced = 0,
        max_alter_id = 0,
        batches_completed = 0,
        started_at = NULL,
        completed_at = NULL,
        last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
    `).run();
  }

  /**
   * Get total bill count
   */
  getBillsCount() {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM bills').get();
    return result.count;
  }

  /**
   * Get max alter_id from bills
   */
  getMaxBillAlterId() {
    const result = this.db.prepare('SELECT MAX(alter_id) as max_id FROM bills').get();
    return result?.max_id || 0;
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
