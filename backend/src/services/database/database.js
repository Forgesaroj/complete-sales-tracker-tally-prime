/**
 * Database Service - SQLite
 * Stores bills, receipts, sacks, users, and sync state
 */

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import config from '../../config/default.js';

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

    // Add Tally timestamp columns (migration)
    const tallyTimestampMigrations = [
      'ALTER TABLE bills ADD COLUMN tally_created_date TEXT',
      'ALTER TABLE bills ADD COLUMN tally_altered_date TEXT',
      'ALTER TABLE bills ADD COLUMN tally_entry_time TEXT'
    ];
    for (const sql of tallyTimestampMigrations) {
      try { this.db.exec(sql); } catch (e) { /* Column exists */ }
    }

    // Add soft delete columns (migration)
    const softDeleteMigrations = [
      'ALTER TABLE bills ADD COLUMN is_deleted INTEGER DEFAULT 0',
      'ALTER TABLE bills ADD COLUMN deleted_at TEXT',
      'ALTER TABLE bills ADD COLUMN delete_reason TEXT'
    ];
    for (const sql of softDeleteMigrations) {
      try { this.db.exec(sql); } catch (e) { /* Column exists */ }
    }

    // Create index for deleted vouchers
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_bills_deleted ON bills(is_deleted)`);

    // Add UDF payment total column for critical pending bill detection (migration)
    const udfPaymentMigrations = [
      'ALTER TABLE bills ADD COLUMN udf_payment_total REAL DEFAULT 0',
      'ALTER TABLE bills ADD COLUMN is_critical INTEGER DEFAULT 0'
    ];
    for (const sql of udfPaymentMigrations) {
      try { this.db.exec(sql); } catch (e) { /* Column exists */ }
    }

    // Add critical_reason column (migration) - tracks WHY voucher was marked critical
    // Values: 'udf_change', 'audited_edit', 'post_dated', or comma-separated combo
    try { this.db.exec("ALTER TABLE bills ADD COLUMN critical_reason TEXT DEFAULT NULL"); } catch (e) { /* exists */ }

    // Create index for critical pending bills
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_bills_critical ON bills(is_critical, voucher_type)`);

    // Add conversion tracking columns (migration)
    // conversion_status: 'active' (default), 'converted', 'deleted'
    // converted_to_type: The voucher type it was converted to (e.g., 'Sales', 'Credit Sales')
    const conversionMigrations = [
      "ALTER TABLE bills ADD COLUMN conversion_status TEXT DEFAULT 'active'",
      'ALTER TABLE bills ADD COLUMN converted_to_type TEXT',
      'ALTER TABLE bills ADD COLUMN converted_at TEXT'
    ];
    for (const sql of conversionMigrations) {
      try { this.db.exec(sql); } catch (e) { /* Column exists */ }
    }

    // Create index for conversion status
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_bills_conversion ON bills(conversion_status)`);

    // Add audit_status column (migration)
    // audit_status: null (unreviewed), 'audited', 'need_to_ask', 'non_audited'
    try { this.db.exec("ALTER TABLE bills ADD COLUMN audit_status TEXT DEFAULT NULL"); } catch (e) { /* exists */ }

    // Payment mode breakdown columns (extracted from receipt ledger entries)
    const payModeCols = ['pay_cash', 'pay_qr', 'pay_cheque', 'pay_discount', 'pay_esewa', 'pay_bank_deposit'];
    for (const col of payModeCols) {
      try { this.db.exec(`ALTER TABLE bills ADD COLUMN ${col} REAL DEFAULT 0`); } catch (e) { /* exists */ }
    }

    // ==================== BILL ITEMS TABLE ====================
    // Stores inventory line items for each bill (cached from Tally)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bill_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id INTEGER NOT NULL,
        tally_guid TEXT,
        stock_item TEXT NOT NULL,
        quantity REAL NOT NULL,
        rate REAL NOT NULL,
        amount REAL NOT NULL,
        godown TEXT DEFAULT '',
        unit TEXT DEFAULT 'Nos',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
      )
    `);

    // Indexes for bill items
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_bill_items_bill ON bill_items(bill_id);
      CREATE INDEX IF NOT EXISTS idx_bill_items_stock ON bill_items(stock_item);
    `);

    // Add items_synced column to bills to track if items are cached
    try {
      this.db.exec('ALTER TABLE bills ADD COLUMN items_synced INTEGER DEFAULT 0');
    } catch (e) { /* Column exists */ }

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
        synced_at TEXT,
        tally_master_id TEXT,
        tally_guid TEXT,
        tally_voucher_number TEXT
      )
    `);

    // Create index for pending invoices
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_pending_invoices_status ON pending_invoices(status);
      CREATE INDEX IF NOT EXISTS idx_pending_invoices_date ON pending_invoices(invoice_date);
    `);

    // Migration: Add tally_master_id columns if missing
    try {
      this.db.exec(`ALTER TABLE pending_invoices ADD COLUMN tally_master_id TEXT`);
    } catch (e) { /* column already exists */ }
    try {
      this.db.exec(`ALTER TABLE pending_invoices ADD COLUMN tally_guid TEXT`);
    } catch (e) { /* column already exists */ }
    try {
      this.db.exec(`ALTER TABLE pending_invoices ADD COLUMN tally_voucher_number TEXT`);
    } catch (e) { /* column already exists */ }

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

    // App settings table (key-value store for configurable options)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT,
        description TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize default settings
    this.db.exec(`
      INSERT OR IGNORE INTO app_settings (key, value, description) VALUES
        ('agent_ledger_group', 'Agent Agents', 'Tally ledger group for agents/staff'),
        ('sales_ledger', '1 Sales A/c', 'Default sales ledger for invoices'),
        ('default_godown', 'Main Location', 'Default godown for inventory'),
        ('business_name', '', 'Business name for invoices/prints'),
        ('business_address', '', 'Business address line'),
        ('business_phone', '', 'Business phone number'),
        ('business_pan', '', 'Business PAN/VAT number'),
        ('smtp_host', '', 'SMTP server hostname'),
        ('smtp_port', '587', 'SMTP server port'),
        ('smtp_secure', 'false', 'Use SSL/TLS (true for port 465)'),
        ('smtp_user', '', 'SMTP username/email'),
        ('smtp_pass', '', 'SMTP password'),
        ('smtp_from_name', '', 'Email from name'),
        ('smtp_from_email', '', 'Email from address'),
        ('voucher_lock_auto_enabled', 'false', 'Auto-lock vouchers at EOD'),
        ('voucher_lock_auto_time', '18:00', 'Time to auto-lock vouchers'),
        ('voucher_lock_last_action', '[]', 'Log of lock/unlock actions')
    `);

    // Update existing setting if it was the old default
    this.db.exec(`
      UPDATE app_settings SET value = 'Agent Agents'
      WHERE key = 'agent_ledger_group' AND value = 'Agent Ledger'
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

    // Add bill linking columns for Fonepay transactions
    try {
      this.db.exec(`ALTER TABLE fonepay_transactions ADD COLUMN voucher_number TEXT`);
      this.db.exec(`ALTER TABLE fonepay_transactions ADD COLUMN party_name TEXT`);
      this.db.exec(`ALTER TABLE fonepay_transactions ADD COLUMN linked_at TEXT`);
      this.db.exec(`ALTER TABLE fonepay_transactions ADD COLUMN company_name TEXT`);
    } catch (e) {
      // Columns already exist, ignore
    }

    // Create index for transactions
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_fonepay_txn_date ON fonepay_transactions(transaction_date);
      CREATE INDEX IF NOT EXISTS idx_fonepay_txn_id ON fonepay_transactions(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_fonepay_txn_issuer ON fonepay_transactions(issuer_name);
      CREATE INDEX IF NOT EXISTS idx_fonepay_txn_voucher ON fonepay_transactions(voucher_number);
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

    // ==================== RBB SMART BANKING ====================
    // RBB Bank transactions (deposits from Fonepay settlements)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rbb_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transaction_id TEXT UNIQUE,
        transaction_date TEXT,
        value_date TEXT,
        description TEXT,
        reference_number TEXT,
        debit REAL DEFAULT 0,
        credit REAL DEFAULT 0,
        balance REAL DEFAULT 0,
        transaction_type TEXT,
        remarks TEXT,
        raw_data TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for RBB transactions
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_rbb_txn_date ON rbb_transactions(transaction_date);
      CREATE INDEX IF NOT EXISTS idx_rbb_txn_id ON rbb_transactions(transaction_id);
      CREATE INDEX IF NOT EXISTS idx_rbb_txn_ref ON rbb_transactions(reference_number);
    `);

    // RBB sync state
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS rbb_sync_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        last_sync_time TEXT,
        sync_status TEXT DEFAULT 'idle',
        error_message TEXT,
        total_syncs INTEGER DEFAULT 0,
        account_number TEXT,
        account_balance REAL DEFAULT 0
      )
    `);

    // Initialize RBB sync state
    this.db.exec(`
      INSERT OR IGNORE INTO rbb_sync_state (id, sync_status) VALUES (1, 'idle')
    `);

    // ==================== CHEQUE TRACKING SYSTEM ====================
    // Post-dated cheque management with multi-company support

    // Main cheques table - stores all cheque details
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cheques (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cheque_number TEXT,
        bank_name TEXT NOT NULL,
        branch TEXT,
        amount REAL NOT NULL,
        party_name TEXT NOT NULL,
        cheque_date TEXT,
        received_date TEXT NOT NULL,
        deposit_date TEXT,
        clear_date TEXT,
        status TEXT DEFAULT 'pending',
        narration TEXT,
        tally_voucher_id TEXT,
        tally_company TEXT DEFAULT 'ODBC CHq Mgmt',
        synced_to_tally INTEGER DEFAULT 0,
        sync_error TEXT,
        bounce_reason TEXT,
        bounce_date TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Cheque-to-Bill linking (one bill can have multiple cheques)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cheque_bill_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id INTEGER REFERENCES bills(id),
        cheque_id INTEGER REFERENCES cheques(id),
        voucher_number TEXT,
        bill_amount REAL NOT NULL,
        cheque_amount REAL NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Multi-payment tracking for bills (cheque + cash + QR combined)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bill_payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bill_id INTEGER REFERENCES bills(id),
        voucher_number TEXT NOT NULL,
        party_name TEXT NOT NULL,
        bill_amount REAL NOT NULL,
        cash_amount REAL DEFAULT 0,
        qr_amount REAL DEFAULT 0,
        cheque_total REAL DEFAULT 0,
        discount REAL DEFAULT 0,
        esewa_amount REAL DEFAULT 0,
        bank_deposit REAL DEFAULT 0,
        total_paid REAL DEFAULT 0,
        balance_due REAL DEFAULT 0,
        payment_status TEXT DEFAULT 'pending',
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Cheque date confirmation queue (for rush-time deferred entry)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cheque_date_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cheque_id INTEGER REFERENCES cheques(id),
        party_name TEXT NOT NULL,
        bank_name TEXT NOT NULL,
        amount REAL NOT NULL,
        confirmed INTEGER DEFAULT 0,
        confirmed_date TEXT,
        confirmed_by INTEGER REFERENCES users(id),
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Indexes for cheque tracking
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_cheques_status ON cheques(status);
      CREATE INDEX IF NOT EXISTS idx_cheques_party ON cheques(party_name);
      CREATE INDEX IF NOT EXISTS idx_cheques_cheque_date ON cheques(cheque_date);
      CREATE INDEX IF NOT EXISTS idx_cheques_synced ON cheques(synced_to_tally);
      CREATE INDEX IF NOT EXISTS idx_cheque_payments_bill ON cheque_bill_payments(bill_id);
      CREATE INDEX IF NOT EXISTS idx_cheque_payments_cheque ON cheque_bill_payments(cheque_id);
      CREATE INDEX IF NOT EXISTS idx_bill_payments_voucher ON bill_payments(voucher_number);
      CREATE INDEX IF NOT EXISTS idx_cheque_queue_confirmed ON cheque_date_queue(confirmed);
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

    // ==================== OUTSTANDING BILLS (Ageing) ====================
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS outstanding_bills (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        party_name TEXT NOT NULL,
        bill_name TEXT NOT NULL,
        bill_date TEXT,
        closing_balance REAL DEFAULT 0,
        credit_period INTEGER DEFAULT 0,
        ageing_days INTEGER DEFAULT 0,
        ageing_bucket TEXT DEFAULT '0-30',
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(party_name, bill_name)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_outstanding_party ON outstanding_bills(party_name);
      CREATE INDEX IF NOT EXISTS idx_outstanding_bucket ON outstanding_bills(ageing_bucket);
    `);

    // ==================== STOCK GROUPS ====================
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS stock_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        parent TEXT,
        closing_balance REAL DEFAULT 0,
        closing_value REAL DEFAULT 0,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_stock_groups_parent ON stock_groups(parent);
    `);

    // ==================== PRICE LISTS ====================
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS price_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        stock_item TEXT NOT NULL,
        price_level TEXT NOT NULL,
        rate REAL DEFAULT 0,
        synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(stock_item, price_level)
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_price_lists_item ON price_lists(stock_item);
      CREATE INDEX IF NOT EXISTS idx_price_lists_level ON price_lists(price_level);
    `);

    // ==================== BANK / FONEPAY RECONCILIATION ====================
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS bank_reconciliation (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recon_type TEXT DEFAULT 'rbb_tally',
        source_type TEXT NOT NULL,
        source_id TEXT,
        source_date TEXT,
        source_amount REAL DEFAULT 0,
        source_description TEXT,
        target_type TEXT,
        target_id TEXT,
        target_date TEXT,
        target_amount REAL DEFAULT 0,
        target_description TEXT,
        match_status TEXT DEFAULT 'unmatched',
        match_confidence REAL DEFAULT 0,
        matched_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_recon_status ON bank_reconciliation(match_status);
      CREATE INDEX IF NOT EXISTS idx_recon_type ON bank_reconciliation(recon_type);
      CREATE INDEX IF NOT EXISTS idx_recon_source ON bank_reconciliation(source_type, source_id);
      CREATE INDEX IF NOT EXISTS idx_recon_target ON bank_reconciliation(target_type, target_id);
    `);

    // Cheque Post Audit Log
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cheque_post_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        posted_at TEXT DEFAULT CURRENT_TIMESTAMP,
        voucher_date TEXT NOT NULL,
        total_amount REAL DEFAULT 0,
        total_cheques INTEGER DEFAULT 0,
        total_parties INTEGER DEFAULT 0,
        journal_voucher_number TEXT,
        journal_success INTEGER DEFAULT 0,
        master_ids TEXT,
        receipts_json TEXT,
        results_json TEXT
      )
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_post_log_date ON cheque_post_log(voucher_date);
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

    // Determine critical status and reason
    const udfPaymentTotal = bill.udfPaymentTotal || 0;
    const voucherAmount = Math.abs(bill.amount);
    const oldUdf = existing ? (existing.udf_payment_total || 0) : 0;
    const udfChanged = oldUdf > 0 && udfPaymentTotal > 0 && udfPaymentTotal !== oldUdf;
    // UDF matches amount = entries are correct, no need to flag
    const udfMatchesAmount = udfPaymentTotal > 0 && Math.abs(udfPaymentTotal - voucherAmount) < 1;
    const auditedAndEdited = existing && existing.audit_status === 'audited' && bill.alterId && existing.alter_id !== bill.alterId;
    // Post-dated: voucher date is after today
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const isPostDated = bill.date && bill.date > today;

    // Build critical reasons array
    const reasons = [];
    if (udfChanged && !udfMatchesAmount) reasons.push('udf_change');
    if (auditedAndEdited) reasons.push('audited_edit');
    if (isPostDated) reasons.push('post_dated');

    // Preserve existing reasons if still critical
    const existingReasons = existing?.critical_reason ? existing.critical_reason.split(',') : [];
    // Keep old reasons that are still valid, add new ones
    // Remove udf_change if UDF now matches amount (resolved)
    const filteredExisting = existingReasons.filter(r => r && r !== '' && !(r === 'udf_change' && udfMatchesAmount));
    const allReasons = [...new Set([...filteredExisting, ...reasons])];

    const hasNewCritical = reasons.length > 0;
    const isCritical = hasNewCritical ? 1 : (existing ? existing.is_critical : 0);
    const criticalReason = allReasons.length > 0 ? allReasons.join(',') : (existing?.critical_reason || null);

    const stmt = this.db.prepare(`
      INSERT INTO bills (
        tally_guid, tally_master_id, voucher_number, voucher_type,
        voucher_date, party_name, amount, narration, alter_id,
        tally_created_date, tally_altered_date, tally_entry_time,
        udf_payment_total, is_critical, critical_reason,
        pay_cash, pay_qr, pay_cheque, pay_discount, pay_esewa, pay_bank_deposit,
        synced_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(tally_guid) DO UPDATE SET
        voucher_number = excluded.voucher_number,
        voucher_type = excluded.voucher_type,
        voucher_date = excluded.voucher_date,
        party_name = excluded.party_name,
        amount = excluded.amount,
        narration = excluded.narration,
        alter_id = excluded.alter_id,
        tally_altered_date = excluded.tally_altered_date,
        tally_entry_time = excluded.tally_entry_time,
        udf_payment_total = excluded.udf_payment_total,
        is_critical = excluded.is_critical,
        critical_reason = excluded.critical_reason,
        pay_cash = excluded.pay_cash,
        pay_qr = excluded.pay_qr,
        pay_cheque = excluded.pay_cheque,
        pay_discount = excluded.pay_discount,
        pay_esewa = excluded.pay_esewa,
        pay_bank_deposit = excluded.pay_bank_deposit,
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
      bill.alterId || 0,
      bill.createdDate || bill.date,
      bill.alteredDate || null,
      bill.entryTime || null,
      udfPaymentTotal,
      isCritical,
      criticalReason,
      bill.payCash || 0,
      bill.payQr || 0,
      bill.payCheque || 0,
      bill.payDiscount || 0,
      bill.payEsewa || 0,
      bill.payBankDeposit || 0
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
      { db: 'narration', new: 'narration' },
      { db: 'udf_payment_total', new: 'udfPaymentTotal' }
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
   * Get all bills for a date (excludes deleted)
   */
  getBillsByDate(date) {
    return this.db.prepare(`
      SELECT * FROM bills
      WHERE voucher_date = ?
      AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY id DESC
    `).all(date);
  }

  /**
   * Get today's bills (excludes deleted)
   */
  getTodayBills() {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return this.getBillsByDate(today);
  }

  /**
   * Get CRITICAL pending bills only (Pending Sales Bill with UDF payment values but NOT fully paid)
   * These are exceptional cases that need attention
   */
  getPendingBills() {
    return this.db.prepare(`
      SELECT * FROM bills
      WHERE voucher_type = 'Pending Sales Bill'
      AND is_critical = 1
      AND (udf_payment_total < amount)
      AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY voucher_date DESC, id DESC
    `).all();
  }

  /**
   * Get ALL pending sales bills (both critical and normal, excluding fully paid)
   * Use this for complete list view
   */
  getAllPendingSalesBills() {
    return this.db.prepare(`
      SELECT * FROM bills
      WHERE voucher_type = 'Pending Sales Bill'
      AND (udf_payment_total < amount OR udf_payment_total = 0 OR udf_payment_total IS NULL)
      AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY is_critical DESC, voucher_date DESC, id DESC
    `).all();
  }

  /**
   * Get cleared bills (fully paid Pending Sales Bills, or converted to Sales/Credit Sales with payment)
   */
  getClearedBills() {
    return this.db.prepare(`
      SELECT * FROM bills
      WHERE (
        (voucher_type = 'Pending Sales Bill' AND udf_payment_total >= amount AND udf_payment_total > 0)
        OR (voucher_type IN ('Sales', 'Credit Sales') AND udf_payment_total > 0)
      )
      AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY voucher_date DESC, id DESC
    `).all();
  }

  /**
   * Get count of critical vs normal pending bills (excluding fully paid)
   */
  getPendingBillsCounts() {
    const result = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_critical = 1 AND udf_payment_total < amount THEN 1 ELSE 0 END) as critical,
        SUM(CASE WHEN (is_critical = 0 OR is_critical IS NULL) THEN 1 ELSE 0 END) as normal
      FROM bills
      WHERE voucher_type = 'Pending Sales Bill'
      AND (udf_payment_total < amount OR udf_payment_total = 0 OR udf_payment_total IS NULL)
      AND (is_deleted = 0 OR is_deleted IS NULL)
    `).get();
    return {
      total: result?.total || 0,
      critical: result?.critical || 0,
      normal: result?.normal || 0
    };
  }

  /**
   * Get ALL vouchers (all types - Sales, Receipt, Payment, Journal, Purchase, etc.)
   * Excludes deleted vouchers by default
   */
  getAllVouchers(options = {}) {
    const { limit = 500, offset = 0, voucherType, dateFrom, dateTo, search, auditStatus, isCritical, criticalReason, includeDeleted = false } = options;

    let where = ' WHERE 1=1';
    const params = [];

    // Exclude deleted vouchers unless specifically requested
    if (!includeDeleted) {
      where += ' AND (is_deleted = 0 OR is_deleted IS NULL)';
    }

    if (voucherType) {
      where += ' AND voucher_type = ?';
      params.push(voucherType);
    }

    if (dateFrom) {
      where += ' AND voucher_date >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      where += ' AND voucher_date <= ?';
      params.push(dateTo);
    }

    if (search) {
      where += ' AND (party_name LIKE ? OR voucher_number LIKE ? OR narration LIKE ?)';
      const q = `%${search}%`;
      params.push(q, q, q);
    }

    if (auditStatus) {
      if (auditStatus === 'unset') {
        where += ' AND (audit_status IS NULL OR audit_status = \'\')';
      } else {
        where += ' AND audit_status = ?';
        params.push(auditStatus);
      }
    }

    if (isCritical === '1') {
      where += ' AND is_critical = 1';
    }

    // Filter by critical reason (searches within comma-separated critical_reason field)
    // Also includes vouchers where is_critical was cleared by auditing but reason is still stored
    if (criticalReason) {
      where += " AND (critical_reason LIKE ? OR critical_reason LIKE ? OR critical_reason LIKE ? OR critical_reason = ?)";
      params.push(`${criticalReason},%`, `%,${criticalReason},%`, `%,${criticalReason}`, criticalReason);
    }

    const total = this.db.prepare('SELECT COUNT(*) as cnt FROM bills' + where).get(...params).cnt;

    const sql = 'SELECT * FROM bills' + where + ' ORDER BY alter_id DESC, id DESC LIMIT ? OFFSET ?';
    const vouchers = this.db.prepare(sql).all(...params, limit, offset);

    return { vouchers, total };
  }

  /**
   * Get deleted vouchers only (truly deleted, NOT converted)
   */
  getDeletedVouchers(options = {}) {
    const { limit = 500, offset = 0, voucherType, dateFrom, dateTo } = options;

    // Only return truly deleted vouchers (conversion_status = 'deleted'), NOT converted ones
    let sql = "SELECT * FROM bills WHERE is_deleted = 1 AND (conversion_status = 'deleted' OR conversion_status IS NULL)";
    const params = [];

    if (voucherType) {
      sql += ' AND voucher_type = ?';
      params.push(voucherType);
    }

    if (dateFrom) {
      sql += ' AND voucher_date >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      sql += ' AND voucher_date <= ?';
      params.push(dateTo);
    }

    sql += ' ORDER BY deleted_at DESC, id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.db.prepare(sql).all(...params);
  }

  /**
   * Get converted vouchers (Pending bills that were converted to Sales/Credit/Apto)
   */
  getConvertedVouchers(options = {}) {
    const { limit = 500, offset = 0, voucherType, convertedToType, dateFrom, dateTo } = options;

    let sql = "SELECT * FROM bills WHERE is_deleted = 1 AND conversion_status = 'converted'";
    const params = [];

    if (voucherType) {
      sql += ' AND voucher_type = ?';
      params.push(voucherType);
    }

    if (convertedToType) {
      sql += ' AND converted_to_type = ?';
      params.push(convertedToType);
    }

    if (dateFrom) {
      sql += ' AND voucher_date >= ?';
      params.push(dateFrom);
    }

    if (dateTo) {
      sql += ' AND voucher_date <= ?';
      params.push(dateTo);
    }

    sql += ' ORDER BY converted_at DESC, id DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    return this.db.prepare(sql).all(...params);
  }

  /**
   * Get deleted vouchers count (truly deleted only, NOT converted)
   */
  getDeletedVouchersCount() {
    const result = this.db.prepare("SELECT COUNT(*) as count FROM bills WHERE is_deleted = 1 AND (conversion_status = 'deleted' OR conversion_status IS NULL)").get();
    return result?.count || 0;
  }

  /**
   * Get converted vouchers count
   */
  getConvertedVouchersCount() {
    const result = this.db.prepare("SELECT COUNT(*) as count FROM bills WHERE is_deleted = 1 AND conversion_status = 'converted'").get();
    return result?.count || 0;
  }

  /**
   * Restore a deleted voucher (undelete)
   */
  restoreDeletedVoucher(guid) {
    const result = this.db.prepare(`
      UPDATE bills SET
        is_deleted = 0,
        deleted_at = NULL,
        delete_reason = NULL,
        conversion_status = 'active',
        converted_to_type = NULL,
        converted_at = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE tally_guid = ? AND is_deleted = 1
    `).run(guid);

    if (result.changes > 0) {
      console.log(`Voucher ${guid} restored from deleted`);
    }
    return result;
  }

  /**
   * Permanently delete a voucher (hard delete - use with caution)
   */
  permanentlyDeleteVoucher(guid) {
    const result = this.db.prepare('DELETE FROM bills WHERE tally_guid = ? AND is_deleted = 1').run(guid);
    if (result.changes > 0) {
      console.log(`Voucher ${guid} permanently deleted`);
    }
    return result;
  }

  /**
   * Get distinct voucher types in database (excluding deleted)
   */
  getVoucherTypes() {
    return this.db.prepare(`
      SELECT DISTINCT voucher_type, COUNT(*) as count
      FROM bills
      WHERE is_deleted = 0 OR is_deleted IS NULL
      GROUP BY voucher_type
      ORDER BY count DESC
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

  // ==================== BILL ITEMS METHODS ====================

  /**
   * Get items for a bill from database
   * @param {number} billId - The bill ID
   * @returns {Array} Array of item objects
   */
  getBillItems(billId) {
    return this.db.prepare(`
      SELECT * FROM bill_items WHERE bill_id = ? ORDER BY id
    `).all(billId);
  }

  /**
   * Get items for multiple bills at once (batch query)
   * @param {Array<number>} billIds - Array of bill IDs
   * @returns {Object} Map of billId -> items array
   */
  getBillItemsBatch(billIds) {
    if (!billIds || billIds.length === 0) return {};
    const placeholders = billIds.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT * FROM bill_items WHERE bill_id IN (${placeholders}) ORDER BY bill_id, id
    `).all(...billIds);

    const result = {};
    for (const id of billIds) result[id] = [];
    for (const row of rows) {
      if (!result[row.bill_id]) result[row.bill_id] = [];
      result[row.bill_id].push(row);
    }
    return result;
  }

  /**
   * Save items for a bill (replaces existing items)
   * @param {number} billId - The bill ID
   * @param {Array} items - Array of item objects {stockItem, quantity, rate, amount, godown, unit}
   */
  saveBillItems(billId, items) {
    // Delete existing items for this bill
    this.db.prepare('DELETE FROM bill_items WHERE bill_id = ?').run(billId);

    // Insert new items
    const insert = this.db.prepare(`
      INSERT INTO bill_items (bill_id, stock_item, quantity, rate, amount, godown, unit)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items) => {
      for (const item of items) {
        insert.run(
          billId,
          item.stockItem || item.stock_item,
          Math.abs(item.quantity || 0),  // Store as positive
          Math.abs(item.rate || 0),       // Store as positive
          Math.abs(item.amount || 0),     // Store as positive
          item.godown || '',
          item.unit || 'Nos'
        );
      }
    });

    insertMany(items);

    // Mark bill as having items synced
    this.db.prepare('UPDATE bills SET items_synced = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(billId);
  }

  /**
   * Check if bill has items cached
   * @param {number} billId - The bill ID
   * @returns {boolean}
   */
  hasBillItemsCached(billId) {
    const bill = this.db.prepare('SELECT items_synced FROM bills WHERE id = ?').get(billId);
    return bill?.items_synced === 1;
  }

  /**
   * Clear bill items cache (force refresh from Tally on next load)
   * @param {number} billId - The bill ID
   */
  clearBillItemsCache(billId) {
    this.db.prepare('DELETE FROM bill_items WHERE bill_id = ?').run(billId);
    this.db.prepare('UPDATE bills SET items_synced = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(billId);
  }

  /**
   * Clear ALL bills and items from database (for full refresh sync)
   * WARNING: This deletes all voucher data - use with caution
   */
  clearAllBillsAndItems() {
    console.log('Clearing all bills and items from database...');

    // Disable foreign key checks temporarily
    this.db.pragma('foreign_keys = OFF');

    try {
      // Delete from all related tables first
      const itemsDeleted = this.db.prepare('DELETE FROM bill_items').run();
      console.log(`  Deleted ${itemsDeleted.changes} bill items`);

      // Delete from receipts table (references bills)
      const receiptsDeleted = this.db.prepare('DELETE FROM receipts WHERE bill_id IS NOT NULL').run();
      console.log(`  Deleted ${receiptsDeleted.changes} receipts`);

      // Delete from cheques table (references bills)
      try {
        const chequesDeleted = this.db.prepare('DELETE FROM cheques WHERE bill_id IS NOT NULL').run();
        console.log(`  Deleted ${chequesDeleted.changes} cheques`);
      } catch (e) { /* table may not exist */ }

      // Delete from sack_items table (references bills)
      try {
        const sackItemsDeleted = this.db.prepare('DELETE FROM sack_items WHERE bill_id IS NOT NULL').run();
        console.log(`  Deleted ${sackItemsDeleted.changes} sack items`);
      } catch (e) { /* table may not exist */ }

      // Delete from voucher_history (references bills by master_id)
      try {
        const historyDeleted = this.db.prepare('DELETE FROM voucher_history').run();
        console.log(`  Deleted ${historyDeleted.changes} voucher history records`);
      } catch (e) { /* table may not exist */ }

      // Delete from voucher_changes (references bills)
      try {
        const changesDeleted = this.db.prepare('DELETE FROM voucher_changes').run();
        console.log(`  Deleted ${changesDeleted.changes} voucher change records`);
      } catch (e) { /* table may not exist */ }

      // Now delete all bills
      const billsDeleted = this.db.prepare('DELETE FROM bills').run();
      console.log(`  Deleted ${billsDeleted.changes} bills`);

      // Reset AlterID to 0 to force full re-sync
      this.db.prepare(`UPDATE sync_state SET last_alter_id = 0 WHERE id = 1`).run();
      console.log('  Reset last_alter_id to 0');

      return {
        billsDeleted: billsDeleted.changes,
        itemsDeleted: itemsDeleted.changes
      };
    } finally {
      // Re-enable foreign key checks
      this.db.pragma('foreign_keys = ON');
    }
  }

  /**
   * Find if a pending bill was likely converted to another voucher type
   * Checks for Sales/Credit/Apto bills with same party and similar amount
   * @param {string} partyName - The party name to search for
   * @param {number} amount - The bill amount
   * @param {string} voucherDate - The original voucher date (YYYYMMDD)
   * @returns {Object|null} The matching voucher if found, or null
   */
  findConversionTarget(partyName, amount, voucherDate) {
    // Look for Sales, Credit Sales, or Apto bills for the same party with similar amount
    // Within a reasonable date range (same fiscal year or recent)
    const conversionTypes = ['Sales', 'Credit Sales', 'Apto Bill', 'Apto Sales'];

    // Allow 5% tolerance for amount matching (in case of rounding)
    const amountMin = Math.abs(amount) * 0.95;
    const amountMax = Math.abs(amount) * 1.05;

    const result = this.db.prepare(`
      SELECT * FROM bills
      WHERE party_name = ?
      AND voucher_type IN (${conversionTypes.map(() => '?').join(',')})
      AND ABS(amount) BETWEEN ? AND ?
      AND (is_deleted = 0 OR is_deleted IS NULL)
      AND voucher_date >= ?
      ORDER BY voucher_date DESC
      LIMIT 1
    `).get(partyName, ...conversionTypes, amountMin, amountMax, voucherDate);

    return result || null;
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

  /**
   * Get all bill GUIDs from local database
   * Used for comparing with Tally to detect deleted vouchers
   * @param {Array} voucherTypes - Optional array of voucher types to filter
   * @returns {Array} Array of {guid, id, voucherNumber, voucherType}
   */
  getAllBillGuids(voucherTypes = null) {
    // Only get non-deleted vouchers for comparison with Tally
    let sql = 'SELECT id, tally_guid as guid, voucher_number, voucher_type FROM bills WHERE (is_deleted = 0 OR is_deleted IS NULL)';
    const params = [];

    if (voucherTypes && voucherTypes.length > 0) {
      sql += ` AND voucher_type IN (${voucherTypes.map(() => '?').join(',')})`;
      params.push(...voucherTypes);
    }

    return this.db.prepare(sql).all(...params);
  }

  /**
   * Update voucher type when Tally changes it (e.g., Pending Sales Bill → Sales)
   */
  updateBillVoucherType(guid, newType) {
    return this.db.prepare(`
      UPDATE bills SET voucher_type = ?, updated_at = CURRENT_TIMESTAMP
      WHERE tally_guid = ? AND (is_deleted = 0 OR is_deleted IS NULL)
    `).run(newType, guid);
  }

  /**
   * Mark a bill as deleted in Tally (truly deleted, not converted)
   * Saves to history before deletion
   * @param {string} guid - The Tally GUID of the bill
   * @param {string} reason - Reason for deletion (e.g., 'Deleted in Tally')
   */
  markBillAsDeleted(guid, reason = 'Deleted in Tally') {
    const bill = this.db.prepare('SELECT * FROM bills WHERE tally_guid = ? AND is_deleted = 0').get(guid);
    if (!bill) return null;

    // Save to history before marking as deleted
    this.saveVoucherHistory(bill, 'deleted', null);

    // Log the deletion in change log
    this.db.prepare(`
      INSERT INTO voucher_change_log (
        master_id, old_alter_id, new_alter_id, field_name, old_value, new_value
      ) VALUES (?, ?, NULL, 'status', 'active', 'deleted')
    `).run(bill.tally_master_id, bill.alter_id);

    // Soft delete - mark as deleted with conversion_status = 'deleted'
    const result = this.db.prepare(`
      UPDATE bills SET
        is_deleted = 1,
        deleted_at = CURRENT_TIMESTAMP,
        delete_reason = ?,
        conversion_status = 'deleted',
        updated_at = CURRENT_TIMESTAMP
      WHERE tally_guid = ?
    `).run(reason, guid);

    console.log(`Bill ${bill.voucher_number} (GUID: ${guid}) marked as DELETED: ${reason}`);
    return result;
  }

  /**
   * Mark a bill as converted to another voucher type (not deleted)
   * Used when Pending Sales Bill is converted to Sales/Credit/Apto bill in Tally
   * @param {string} guid - The Tally GUID of the bill
   * @param {string} convertedToType - The voucher type it was converted to (e.g., 'Sales', 'Credit Sales')
   */
  markBillAsConverted(guid, convertedToType = 'Sales') {
    const bill = this.db.prepare('SELECT * FROM bills WHERE tally_guid = ? AND is_deleted = 0').get(guid);
    if (!bill) return null;

    // Save to history before marking as converted
    this.saveVoucherHistory(bill, 'converted', null);

    // Log the conversion in change log
    this.db.prepare(`
      INSERT INTO voucher_change_log (
        master_id, old_alter_id, new_alter_id, field_name, old_value, new_value
      ) VALUES (?, ?, NULL, 'voucher_type', ?, ?)
    `).run(bill.tally_master_id, bill.alter_id, bill.voucher_type, convertedToType);

    // Mark as converted (not deleted) - removes from active list but NOT in deleted vouchers
    const result = this.db.prepare(`
      UPDATE bills SET
        is_deleted = 1,
        deleted_at = CURRENT_TIMESTAMP,
        delete_reason = ?,
        conversion_status = 'converted',
        converted_to_type = ?,
        converted_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE tally_guid = ?
    `).run(`Converted to ${convertedToType}`, convertedToType, guid);

    console.log(`Bill ${bill.voucher_number} (GUID: ${guid}) marked as CONVERTED to ${convertedToType}`);
    return result;
  }

  /**
   * Mark multiple bills as deleted
   * @param {Array} guids - Array of Tally GUIDs to mark as deleted
   * @param {string} reason - Reason for deletion
   * @returns {Object} {deleted: number, errors: number}
   */
  markBillsAsDeleted(guids, reason = 'Deleted in Tally') {
    let deleted = 0;
    let errors = 0;

    const transaction = this.db.transaction(() => {
      for (const guid of guids) {
        try {
          const result = this.markBillAsDeleted(guid, reason);
          if (result && result.changes > 0) {
            deleted++;
          }
        } catch (error) {
          console.error(`Error marking bill ${guid} as deleted:`, error.message);
          errors++;
        }
      }
    });

    transaction();
    return { deleted, errors };
  }

  /**
   * Get bills count
   */
  getBillsCount() {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM bills').get();
    return result?.count || 0;
  }

  /**
   * Get max alter_id from bills
   */
  getMaxBillAlterId() {
    const result = this.db.prepare('SELECT MAX(alter_id) as max_id FROM bills').get();
    return result?.max_id || 0;
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

  // ==================== COLUMNAR DASHBOARD ====================

  /**
   * Get party-grouped columnar view:
   * - Bill amount from Sales-type vouchers
   * - Payment modes from receipt voucher ledger entries (pay_* columns)
   */
  getColumnarBills(date, search = '') {
    let sql = `
      SELECT
        party_name,
        SUM(CASE WHEN voucher_type IN ('Sales','Credit Sales','A Pto Bill','Debit Note') THEN ABS(amount) ELSE 0 END) as bill_amount,
        SUM(CASE WHEN voucher_type = 'Pending Sales Bill' THEN ABS(amount) ELSE 0 END) as pending_amount,
        SUM(COALESCE(pay_cash, 0)) as cash,
        SUM(COALESCE(pay_qr, 0)) as qr,
        SUM(COALESCE(pay_cheque, 0)) as cheque,
        SUM(COALESCE(pay_discount, 0)) as discount,
        SUM(COALESCE(pay_esewa, 0)) as esewa,
        SUM(COALESCE(pay_bank_deposit, 0)) as bank_deposit,
        GROUP_CONCAT(DISTINCT voucher_number) as voucher_numbers,
        COUNT(CASE WHEN voucher_type IN ('Sales','Credit Sales','A Pto Bill','Debit Note') THEN 1 END) as bill_count,
        COUNT(CASE WHEN voucher_type = 'Pending Sales Bill' THEN 1 END) as pending_count,
        COUNT(CASE WHEN voucher_type IN ('Bank Receipt','Counter Receipt','Receipt','Dashboard Receipt','Credit Note') THEN 1 END) as receipt_count,
        COUNT(CASE WHEN voucher_type = 'Sales' THEN 1 END) as sales_count,
        COUNT(CASE WHEN voucher_type = 'Credit Sales' THEN 1 END) as credit_sales_count,
        COUNT(CASE WHEN voucher_type = 'A Pto Bill' THEN 1 END) as apto_count,
        COUNT(CASE WHEN voucher_type = 'Debit Note' THEN 1 END) as debit_note_count,
        COUNT(CASE WHEN voucher_type IN ('Bank Receipt','Counter Receipt','Receipt','Dashboard Receipt') THEN 1 END) as receipt_only_count,
        COUNT(CASE WHEN voucher_type = 'Credit Note' THEN 1 END) as credit_note_count
      FROM bills
      WHERE voucher_date = ?
        AND (is_deleted = 0 OR is_deleted IS NULL)
    `;
    const params = [date];

    if (search) {
      sql += ` AND (party_name LIKE ? OR voucher_number LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ` GROUP BY party_name HAVING bill_amount > 0 OR pending_amount > 0 OR (cash + qr + cheque + discount + esewa + bank_deposit) > 0 ORDER BY party_name`;

    const rows = this.db.prepare(sql).all(...params);

    // Detect parties where receipt count exceeds bill count (duplicate receipts)
    // e.g. 2 bills + 2 receipts = OK, 1 bill + 2 receipts = DUPLICATE
    let dupFilter = `
      SELECT party_name,
        GROUP_CONCAT(CASE WHEN voucher_type IN ('Bank Receipt','Counter Receipt','Receipt','Dashboard Receipt','Credit Note') THEN voucher_type END) as receipt_types,
        COUNT(CASE WHEN voucher_type IN ('Bank Receipt','Counter Receipt','Receipt','Dashboard Receipt','Credit Note') THEN 1 END) as rcpt_cnt,
        COUNT(CASE WHEN voucher_type IN ('Sales','Credit Sales','Pending Sales Bill','A Pto Bill','Debit Note') THEN 1 END) as bill_cnt
      FROM bills
      WHERE voucher_date = ?
        AND (is_deleted = 0 OR is_deleted IS NULL)
    `;
    const dupParams = [date];
    if (search) {
      dupFilter += ` AND (party_name LIKE ? OR voucher_number LIKE ?)`;
      dupParams.push(`%${search}%`, `%${search}%`);
    }
    dupFilter += ` GROUP BY party_name HAVING rcpt_cnt > bill_cnt AND rcpt_cnt > 1`;
    const dupRows = this.db.prepare(dupFilter).all(...dupParams);
    const dupMap = {};
    for (const d of dupRows) {
      dupMap[d.party_name] = d.receipt_types;
    }

    return rows.map(r => {
      const totalPaid = (r.cash || 0) + (r.qr || 0) + (r.cheque || 0) + (r.discount || 0) + (r.esewa || 0) + (r.bank_deposit || 0);
      const dup = dupMap[r.party_name];
      const balance = r.bill_amount - totalPaid;
      // Entries mismatch: party has receipts but total paid != bill amount
      const isMismatch = r.receipt_count > 0 && r.bill_count > 0 && Math.abs(balance) > 1;
      const warnings = [];
      if (dup) warnings.push(`DUPLICATE: ${dup}`);
      if (isMismatch) warnings.push(`MISMATCH: Bill ${r.bill_amount} vs Paid ${totalPaid}`);
      return {
        party_name: r.party_name,
        bill_amount: r.bill_amount,
        pending_amount: r.pending_amount || 0,
        voucher_numbers: r.voucher_numbers,
        bill_count: r.bill_count,
        pending_count: r.pending_count || 0,
        receipt_count: r.receipt_count,
        sales_count: r.sales_count || 0,
        credit_sales_count: r.credit_sales_count || 0,
        apto_count: r.apto_count || 0,
        debit_note_count: r.debit_note_count || 0,
        receipt_only_count: r.receipt_only_count || 0,
        credit_note_count: r.credit_note_count || 0,
        cash: r.cash || 0,
        qr: r.qr || 0,
        cheque: r.cheque || 0,
        discount: r.discount || 0,
        esewa: r.esewa || 0,
        bank_deposit: r.bank_deposit || 0,
        total_paid: totalPaid,
        balance,
        is_critical: !!dup,
        is_mismatch: isMismatch,
        critical_reason: dup || null,
        warnings
      };
    });
  }

  /**
   * Get alterations for columnar audit:
   * 1. Changes to vouchers ON this date that happened later (post-date edits)
   * 2. Changes that HAPPENED on this date to vouchers from any date (e.g. deletions)
   */
  getColumnarAlterations(date) {
    const isoDate = date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');

    const rows = this.db.prepare(`
      SELECT
        b.party_name,
        b.voucher_type,
        b.voucher_number,
        b.voucher_date,
        b.amount,
        b.tally_master_id as master_id,
        vcl.field_name,
        vcl.old_value,
        vcl.new_value,
        vcl.old_alter_id,
        vcl.new_alter_id,
        vcl.changed_at,
        CASE
          WHEN b.voucher_date = ? AND DATE(vcl.changed_at) > ? THEN 'post_date_edit'
          WHEN DATE(vcl.changed_at) = ? AND b.voucher_date != ? THEN 'changed_today'
          ELSE 'other'
        END as alteration_type
      FROM voucher_change_log vcl
      JOIN bills b ON b.tally_master_id = vcl.master_id
      WHERE (b.voucher_date = ? AND DATE(vcl.changed_at) > ?)
         OR (DATE(vcl.changed_at) = ? AND b.voucher_date != ?)
      ORDER BY vcl.changed_at DESC
    `).all(date, isoDate, isoDate, date, date, isoDate, isoDate, date);

    return rows;
  }

  // ==================== DAYBOOK ====================

  /**
   * Get daybook data with proper debit/credit classification for ALL voucher types
   * Supports date range (fromDate to toDate)
   */
  getDaybook(fromDate, toDate, voucherTypes = null) {
    let sql = `
      SELECT
        id, voucher_date, voucher_number, voucher_type, party_name, amount, narration,
        CASE
          WHEN voucher_type IN ('Sales', 'Credit Sales', 'Pending Sales Bill', 'A Pto Bill', 'Debit Note')
            THEN ABS(amount)
          WHEN voucher_type IN ('Purchase', 'Payment')
            THEN ABS(amount)
          WHEN voucher_type IN ('Journal', 'Cheque Journal') AND amount > 0
            THEN amount
          WHEN voucher_type NOT IN ('Bank Receipt', 'Counter Receipt', 'Receipt', 'Dashboard Receipt', 'Credit Note', 'Contra', 'Journal', 'Cheque Journal') AND amount > 0
            THEN amount
          ELSE 0
        END as debit,
        CASE
          WHEN voucher_type IN ('Bank Receipt', 'Counter Receipt', 'Receipt', 'Dashboard Receipt', 'Credit Note')
            THEN ABS(amount)
          WHEN voucher_type IN ('Contra')
            THEN ABS(amount)
          WHEN voucher_type IN ('Journal', 'Cheque Journal') AND amount < 0
            THEN ABS(amount)
          WHEN voucher_type NOT IN ('Sales', 'Credit Sales', 'Pending Sales Bill', 'A Pto Bill', 'Debit Note', 'Purchase', 'Payment', 'Journal', 'Cheque Journal') AND amount < 0
            THEN ABS(amount)
          ELSE 0
        END as credit,
        payment_status, dispatch_status
      FROM bills
      WHERE voucher_date BETWEEN ? AND ?
        AND (is_deleted = 0 OR is_deleted IS NULL)
    `;

    const params = [fromDate, toDate];

    if (voucherTypes && voucherTypes.length > 0) {
      sql += ` AND voucher_type IN (${voucherTypes.map(() => '?').join(',')})`;
      params.push(...voucherTypes);
    }

    sql += ' ORDER BY voucher_date ASC, id ASC';

    return this.db.prepare(sql).all(...params);
  }

  /**
   * Get party-wise summary with proper debit/credit for all voucher types
   */
  getPartySummary(fromDate, toDate) {
    return this.db.prepare(`
      SELECT
        party_name,
        SUM(CASE
          WHEN voucher_type IN ('Sales', 'Credit Sales', 'Pending Sales Bill', 'A Pto Bill', 'Debit Note', 'Purchase', 'Payment')
            THEN ABS(amount)
          WHEN voucher_type IN ('Journal', 'Cheque Journal') AND amount > 0
            THEN amount
          WHEN voucher_type NOT IN ('Bank Receipt', 'Counter Receipt', 'Receipt', 'Dashboard Receipt', 'Credit Note', 'Contra', 'Journal', 'Cheque Journal') AND amount > 0
            THEN amount
          ELSE 0
        END) as total_debit,
        SUM(CASE
          WHEN voucher_type IN ('Bank Receipt', 'Counter Receipt', 'Receipt', 'Dashboard Receipt', 'Credit Note', 'Contra')
            THEN ABS(amount)
          WHEN voucher_type IN ('Journal', 'Cheque Journal') AND amount < 0
            THEN ABS(amount)
          WHEN voucher_type NOT IN ('Sales', 'Credit Sales', 'Pending Sales Bill', 'A Pto Bill', 'Debit Note', 'Purchase', 'Payment', 'Journal', 'Cheque Journal') AND amount < 0
            THEN ABS(amount)
          ELSE 0
        END) as total_credit
      FROM bills
      WHERE voucher_date BETWEEN ? AND ?
        AND (is_deleted = 0 OR is_deleted IS NULL)
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
   * Format: DB-MMDD-NNN (e.g., DB-0210-001 for Feb 10)
   */
  getNextInvoiceNumber() {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const monthNum = parseInt(today.slice(5, 7)); // 1-12
    const dayNum = parseInt(today.slice(8, 10)); // 1-31

    // Month: A=Jan(1), B=Feb(2), C=Mar(3)... L=Dec(12)
    const monthLetter = String.fromCharCode(64 + monthNum); // 65=A

    // Day: tens digit encoded (0→0, 1→A, 2→B, 3→C), ones digit stays as number
    const dayTens = Math.floor(dayNum / 10);
    const dayOnes = dayNum % 10;
    const tensCode = dayTens === 0 ? '0' : String.fromCharCode(64 + dayTens); // 1→A, 2→B, 3→C
    const dateCode = `${monthLetter}${tensCode}${dayOnes}`;

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
    const num = String(updated.last_number).padStart(2, '0');

    return `DB-${dateCode}-${num}`;
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
   * Get dashboard bill history (all statuses) with optional date filter
   */
  getDashboardBillHistory(fromDate = null, toDate = null) {
    let sql = `SELECT * FROM pending_invoices`;
    const params = [];

    if (fromDate && toDate) {
      sql += ` WHERE DATE(invoice_date) BETWEEN ? AND ?`;
      params.push(fromDate, toDate);
    } else if (fromDate) {
      sql += ` WHERE DATE(invoice_date) >= ?`;
      params.push(fromDate);
    } else if (toDate) {
      sql += ` WHERE DATE(invoice_date) <= ?`;
      params.push(toDate);
    }

    sql += ` ORDER BY created_at DESC`;
    return this.db.prepare(sql).all(...params);
  }

  /**
   * Get dashboard bill summary by date
   */
  getDashboardBillSummary(date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    return this.db.prepare(`
      SELECT
        COUNT(*) as total_count,
        SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) as synced_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_count,
        SUM(total_amount) as total_amount,
        SUM(CASE WHEN status = 'synced' THEN total_amount ELSE 0 END) as synced_amount
      FROM pending_invoices
      WHERE DATE(invoice_date) = ?
    `).get(targetDate);
  }

  /**
   * Get pending invoice by ID
   */
  getPendingInvoiceById(id) {
    return this.db.prepare('SELECT * FROM pending_invoices WHERE id = ?').get(id);
  }

  /**
   * Update pending invoice status after sync attempt
   * @param {number} id - Pending invoice ID
   * @param {string} status - 'synced', 'failed', etc.
   * @param {string|null} error - Error message if failed
   * @param {object|null} tallyResult - Result from Tally containing voucherId, guid, voucherNumber
   */
  updatePendingInvoiceStatus(id, status, error = null, tallyResult = null) {
    if (status === 'synced') {
      return this.db.prepare(`
        UPDATE pending_invoices SET
          status = 'synced',
          synced_at = CURRENT_TIMESTAMP,
          sync_error = NULL,
          tally_master_id = ?,
          tally_guid = ?,
          tally_voucher_number = ?
        WHERE id = ?
      `).run(
        tallyResult?.voucherId || tallyResult?.masterId || null,
        tallyResult?.guid || null,
        tallyResult?.voucherNumber || null,
        id
      );
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

  // ==================== FONEPAY BILL LINKING ====================

  /**
   * Link Fonepay transaction to a bill
   * Displays: Company Name | Bill Number | Bill Date
   */
  linkFonepayToBill(transactionId, billData) {
    const { voucherNumber, partyName, companyName, billDate } = billData;

    // Create display description: "CompanyName | BillNo | Date"
    const displayDesc = `${companyName || 'FOR DB'} | ${voucherNumber} | ${billDate || ''}`;

    return this.db.prepare(`
      UPDATE fonepay_transactions SET
        voucher_number = ?,
        party_name = ?,
        company_name = ?,
        description = ?,
        linked_at = CURRENT_TIMESTAMP
      WHERE transaction_id = ?
    `).run(voucherNumber, partyName, companyName, displayDesc, transactionId);
  }

  /**
   * Get Fonepay transactions linked to a bill
   */
  getFonepayForBill(voucherNumber) {
    return this.db.prepare(`
      SELECT * FROM fonepay_transactions
      WHERE voucher_number = ?
      ORDER BY transaction_date DESC
    `).all(voucherNumber);
  }

  /**
   * Get unlinked Fonepay transactions (not assigned to any bill)
   */
  getUnlinkedFonepayTransactions() {
    return this.db.prepare(`
      SELECT * FROM fonepay_transactions
      WHERE voucher_number IS NULL
      ORDER BY transaction_date DESC
      LIMIT 100
    `).all();
  }

  /**
   * Get Fonepay transaction by ID
   */
  getFonepayTransactionById(transactionId) {
    return this.db.prepare(`
      SELECT * FROM fonepay_transactions WHERE transaction_id = ?
    `).get(transactionId);
  }

  /**
   * Find matching Fonepay transaction by amount and date
   * Used to auto-match QR payments to incoming transactions
   */
  findMatchingFonepayTransaction(amount, date) {
    return this.db.prepare(`
      SELECT * FROM fonepay_transactions
      WHERE amount = ?
      AND DATE(transaction_date) = DATE(?)
      AND voucher_number IS NULL
      ORDER BY transaction_date DESC
      LIMIT 1
    `).get(amount, date);
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

  // ==================== RBB SMART BANKING ====================

  /**
   * Save RBB transaction
   */
  saveRBBTransaction(txn) {
    const stmt = this.db.prepare(`
      INSERT INTO rbb_transactions (
        transaction_id, transaction_date, value_date, description, reference_number,
        debit, credit, balance, transaction_type, remarks, raw_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(transaction_id) DO UPDATE SET
        transaction_date = excluded.transaction_date,
        value_date = excluded.value_date,
        description = excluded.description,
        reference_number = excluded.reference_number,
        debit = excluded.debit,
        credit = excluded.credit,
        balance = excluded.balance,
        transaction_type = excluded.transaction_type,
        remarks = excluded.remarks,
        raw_data = excluded.raw_data
    `);

    // Generate unique transaction ID
    const txnId = txn.id || `RBB-${(txn.date || '').replace(/[^0-9]/g, '')}-${txn.reference || ''}-${txn.credit || txn.debit || 0}`;

    return stmt.run(
      txnId,
      txn.date || txn.transactionDate || '',
      txn.valueDate || txn.date || '',
      txn.description || txn.particulars || '',
      txn.reference || txn.referenceNumber || '',
      txn.debit || 0,
      txn.credit || 0,
      txn.balance || 0,
      txn.type || (txn.credit > 0 ? 'credit' : 'debit'),
      txn.remarks || '',
      JSON.stringify(txn)
    );
  }

  /**
   * Get RBB transactions
   */
  getRBBTransactions(limit = 100, offset = 0) {
    return this.db.prepare(`
      SELECT * FROM rbb_transactions ORDER BY transaction_date DESC, id DESC LIMIT ? OFFSET ?
    `).all(limit, offset);
  }

  /**
   * Get RBB transactions by date range
   */
  getRBBTransactionsByDateRange(fromDate, toDate) {
    return this.db.prepare(`
      SELECT * FROM rbb_transactions
      WHERE DATE(transaction_date) >= DATE(?) AND DATE(transaction_date) <= DATE(?)
      ORDER BY transaction_date DESC, id DESC
    `).all(fromDate, toDate);
  }

  /**
   * Get RBB transactions count
   */
  getRBBTransactionsCount() {
    const result = this.db.prepare('SELECT COUNT(*) as count FROM rbb_transactions').get();
    return result.count;
  }

  /**
   * Get the latest RBB transaction date (for incremental sync)
   * Returns the date of the most recent transaction in YYYY-MM-DD format
   */
  getLatestRBBTransactionDate() {
    const result = this.db.prepare(`
      SELECT MAX(DATE(transaction_date)) as latest_date FROM rbb_transactions
    `).get();
    return result?.latest_date || null;
  }

  /**
   * Get RBB sync state
   */
  getRBBSyncState() {
    return this.db.prepare('SELECT * FROM rbb_sync_state WHERE id = 1').get();
  }

  /**
   * Update RBB sync state
   */
  updateRBBSyncState(state) {
    return this.db.prepare(`
      UPDATE rbb_sync_state SET
        last_sync_time = CURRENT_TIMESTAMP,
        sync_status = ?,
        error_message = ?,
        total_syncs = total_syncs + 1,
        account_number = COALESCE(?, account_number),
        account_balance = COALESCE(?, account_balance)
      WHERE id = 1
    `).run(
      state.status || 'idle',
      state.error || null,
      state.accountNumber || null,
      state.accountBalance || null
    );
  }

  /**
   * Get RBB summary (credits from Fonepay)
   */
  getRBBSummary() {
    const result = this.db.prepare(`
      SELECT
        COUNT(*) as totalCount,
        COALESCE(SUM(credit), 0) as totalCredit,
        COALESCE(SUM(debit), 0) as totalDebit,
        COUNT(CASE WHEN credit > 0 THEN 1 END) as creditCount,
        COUNT(CASE WHEN debit > 0 THEN 1 END) as debitCount
      FROM rbb_transactions
    `).get();
    return result;
  }

  /**
   * Get today's RBB transactions
   */
  getTodayRBBTransactions() {
    const today = new Date().toISOString().split('T')[0];
    return this.db.prepare(`
      SELECT * FROM rbb_transactions
      WHERE DATE(transaction_date) = DATE(?)
      ORDER BY id DESC
    `).all(today);
  }

  // ==================== CHEQUE TRACKING ====================

  /**
   * Create a new cheque entry
   * Can be created without cheque_date for rush-time entry
   */
  createCheque(cheque) {
    const today = new Date().toISOString().split('T')[0];
    const stmt = this.db.prepare(`
      INSERT INTO cheques (
        cheque_number, bank_name, branch, amount, party_name,
        cheque_date, received_date, narration, tally_company, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `);

    const result = stmt.run(
      cheque.chequeNumber || null,  // Can be null for rush entry
      cheque.bankName,
      cheque.branch || '',
      cheque.amount,
      cheque.partyName,
      cheque.chequeDate || null,    // Null = needs date confirmation later
      cheque.receivedDate || today,
      cheque.narration || '',
      cheque.tallyCompany || 'ODBC CHq Mgmt'
    );

    const chequeId = result.lastInsertRowid;

    // If no cheque_date, add to date confirmation queue
    if (!cheque.chequeDate) {
      this.db.prepare(`
        INSERT INTO cheque_date_queue (cheque_id, party_name, bank_name, amount)
        VALUES (?, ?, ?, ?)
      `).run(chequeId, cheque.partyName, cheque.bankName, cheque.amount);
    }

    return { id: chequeId, status: 'pending', needsDateConfirm: !cheque.chequeDate };
  }

  /**
   * Confirm cheque date (for rush-time deferred entry)
   */
  confirmChequeDate(chequeId, chequeDate, chequeNumber = null, userId = null) {
    // Update cheque with confirmed date and number
    const updateFields = ['cheque_date = ?', 'updated_at = CURRENT_TIMESTAMP'];
    const params = [chequeDate];

    if (chequeNumber) {
      updateFields.push('cheque_number = ?');
      params.push(chequeNumber);
    }

    params.push(chequeId);

    this.db.prepare(`
      UPDATE cheques SET ${updateFields.join(', ')} WHERE id = ?
    `).run(...params);

    // Mark as confirmed in queue
    this.db.prepare(`
      UPDATE cheque_date_queue SET
        confirmed = 1,
        confirmed_date = CURRENT_TIMESTAMP,
        confirmed_by = ?
      WHERE cheque_id = ?
    `).run(userId, chequeId);

    return this.getChequeById(chequeId);
  }

  /**
   * Get cheques pending date confirmation
   */
  getPendingDateConfirmations() {
    return this.db.prepare(`
      SELECT c.*, q.created_at as queue_created_at
      FROM cheques c
      JOIN cheque_date_queue q ON c.id = q.cheque_id
      WHERE q.confirmed = 0
      ORDER BY q.created_at ASC
    `).all();
  }

  /**
   * Get cheque by ID
   */
  getChequeById(id) {
    return this.db.prepare('SELECT * FROM cheques WHERE id = ?').get(id);
  }

  /**
   * Get all cheques with optional filters
   */
  getCheques(filters = {}) {
    let sql = 'SELECT * FROM cheques WHERE 1=1';
    const params = [];

    if (filters.status) {
      sql += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.partyName) {
      sql += ' AND party_name LIKE ?';
      params.push(`%${filters.partyName}%`);
    }
    if (filters.fromDate) {
      sql += ' AND cheque_date >= ?';
      params.push(filters.fromDate);
    }
    if (filters.toDate) {
      sql += ' AND cheque_date <= ?';
      params.push(filters.toDate);
    }
    if (filters.syncedToTally !== undefined) {
      sql += ' AND synced_to_tally = ?';
      params.push(filters.syncedToTally ? 1 : 0);
    }

    sql += ' ORDER BY received_date DESC, id DESC';

    if (filters.limit) {
      sql += ' LIMIT ?';
      params.push(filters.limit);
    }

    return this.db.prepare(sql).all(...params);
  }

  /**
   * Get cheques by status
   */
  getChequesByStatus(status) {
    return this.db.prepare(`
      SELECT * FROM cheques WHERE status = ? ORDER BY cheque_date ASC
    `).all(status);
  }

  /**
   * Get pending cheques (not yet deposited)
   */
  getPendingCheques() {
    return this.getChequesByStatus('pending');
  }

  /**
   * Get cheques due for deposit (cheque_date <= today)
   */
  getChequesDueForDeposit() {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    return this.db.prepare(`
      SELECT * FROM cheques
      WHERE status = 'pending'
      AND cheque_date IS NOT NULL
      AND cheque_date <= ?
      ORDER BY cheque_date ASC
    `).all(today);
  }

  /**
   * Update cheque status
   */
  updateChequeStatus(id, status, additionalData = {}) {
    let sql = 'UPDATE cheques SET status = ?, updated_at = CURRENT_TIMESTAMP';
    const params = [status];

    if (status === 'deposited' && additionalData.depositDate) {
      sql += ', deposit_date = ?';
      params.push(additionalData.depositDate);
    }
    if (status === 'cleared' && additionalData.clearDate) {
      sql += ', clear_date = ?';
      params.push(additionalData.clearDate);
    }
    if (status === 'bounced') {
      sql += ', bounce_date = ?, bounce_reason = ?';
      params.push(additionalData.bounceDate || new Date().toISOString().split('T')[0]);
      params.push(additionalData.bounceReason || 'Unknown');
    }

    sql += ' WHERE id = ?';
    params.push(id);

    return this.db.prepare(sql).run(...params);
  }

  /**
   * Mark cheque as synced to Tally
   */
  markChequeSynced(id, tallyVoucherId, error = null) {
    return this.db.prepare(`
      UPDATE cheques SET
        synced_to_tally = ?,
        tally_voucher_id = ?,
        sync_error = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(error ? 0 : 1, tallyVoucherId, error, id);
  }

  /**
   * Get cheques not synced to Tally
   */
  getUnsyncedCheques() {
    return this.db.prepare(`
      SELECT * FROM cheques
      WHERE synced_to_tally = 0
      AND cheque_date IS NOT NULL
      ORDER BY received_date ASC
    `).all();
  }

  /**
   * Link cheque to bill payment
   */
  linkChequeToBill(chequeId, billId, voucherNumber, billAmount, chequeAmount) {
    return this.db.prepare(`
      INSERT INTO cheque_bill_payments (
        bill_id, cheque_id, voucher_number, bill_amount, cheque_amount
      ) VALUES (?, ?, ?, ?, ?)
    `).run(billId, chequeId, voucherNumber, billAmount, chequeAmount);
  }

  /**
   * Get cheques linked to a bill
   */
  getChequesForBill(billId) {
    return this.db.prepare(`
      SELECT c.*, cbp.cheque_amount, cbp.bill_amount
      FROM cheques c
      JOIN cheque_bill_payments cbp ON c.id = cbp.cheque_id
      WHERE cbp.bill_id = ?
      ORDER BY c.cheque_date ASC
    `).all(billId);
  }

  /**
   * Get cheques for a voucher number
   */
  getChequesForVoucher(voucherNumber) {
    return this.db.prepare(`
      SELECT c.*, cbp.cheque_amount, cbp.bill_amount
      FROM cheques c
      JOIN cheque_bill_payments cbp ON c.id = cbp.cheque_id
      WHERE cbp.voucher_number = ?
      ORDER BY c.cheque_date ASC
    `).all(voucherNumber);
  }

  // ==================== BILL PAYMENTS (MULTI-MODE) ====================

  /**
   * Create or update bill payment record with mixed payment modes
   */
  upsertBillPayment(payment) {
    const totalPaid = (payment.cashAmount || 0) +
                      (payment.qrAmount || 0) +
                      (payment.chequeTotal || 0) +
                      (payment.discount || 0) +
                      (payment.esewaAmount || 0) +
                      (payment.bankDeposit || 0);

    const balanceDue = (payment.billAmount || 0) - totalPaid;
    const status = balanceDue <= 0 ? 'paid' : (totalPaid > 0 ? 'partial' : 'pending');

    const existing = this.db.prepare(
      'SELECT id FROM bill_payments WHERE voucher_number = ?'
    ).get(payment.voucherNumber);

    if (existing) {
      return this.db.prepare(`
        UPDATE bill_payments SET
          cash_amount = ?,
          qr_amount = ?,
          cheque_total = ?,
          discount = ?,
          esewa_amount = ?,
          bank_deposit = ?,
          total_paid = ?,
          balance_due = ?,
          payment_status = ?,
          notes = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        payment.cashAmount || 0,
        payment.qrAmount || 0,
        payment.chequeTotal || 0,
        payment.discount || 0,
        payment.esewaAmount || 0,
        payment.bankDeposit || 0,
        totalPaid,
        balanceDue,
        status,
        payment.notes || null,
        existing.id
      );
    }

    return this.db.prepare(`
      INSERT INTO bill_payments (
        bill_id, voucher_number, party_name, bill_amount,
        cash_amount, qr_amount, cheque_total, discount,
        esewa_amount, bank_deposit, total_paid, balance_due,
        payment_status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payment.billId || null,
      payment.voucherNumber,
      payment.partyName,
      payment.billAmount,
      payment.cashAmount || 0,
      payment.qrAmount || 0,
      payment.chequeTotal || 0,
      payment.discount || 0,
      payment.esewaAmount || 0,
      payment.bankDeposit || 0,
      totalPaid,
      balanceDue,
      status,
      payment.notes || null
    );
  }

  /**
   * Get payment details for a bill
   */
  getBillPayment(voucherNumber) {
    const payment = this.db.prepare(`
      SELECT * FROM bill_payments WHERE voucher_number = ?
    `).get(voucherNumber);

    if (payment) {
      // Also get linked cheques
      payment.cheques = this.getChequesForVoucher(voucherNumber);
    }

    return payment;
  }

  /**
   * Get all partial payments (bills with balance due)
   */
  getPartialPayments() {
    return this.db.prepare(`
      SELECT * FROM bill_payments
      WHERE payment_status = 'partial'
      ORDER BY updated_at DESC
    `).all();
  }

  /**
   * Get cheque tracking summary
   */
  getChequesSummary() {
    return this.db.prepare(`
      SELECT
        status,
        COUNT(*) as count,
        SUM(amount) as total_amount
      FROM cheques
      GROUP BY status
    `).all();
  }

  /**
   * Get customer cheque summary (credit + cheques + payments)
   */
  getCustomerChequeSummary(partyName) {
    const cheques = this.db.prepare(`
      SELECT * FROM cheques
      WHERE party_name = ?
      ORDER BY cheque_date DESC
    `).all(partyName);

    const pendingTotal = cheques
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + c.amount, 0);

    const depositedTotal = cheques
      .filter(c => c.status === 'deposited')
      .reduce((sum, c) => sum + c.amount, 0);

    const clearedTotal = cheques
      .filter(c => c.status === 'cleared')
      .reduce((sum, c) => sum + c.amount, 0);

    const bouncedTotal = cheques
      .filter(c => c.status === 'bounced')
      .reduce((sum, c) => sum + c.amount, 0);

    return {
      partyName,
      cheques,
      summary: {
        pending: pendingTotal,
        deposited: depositedTotal,
        cleared: clearedTotal,
        bounced: bouncedTotal,
        total: pendingTotal + depositedTotal
      }
    };
  }

  // ==================== APP SETTINGS ====================

  /**
   * Get a setting by key
   */
  getSetting(key) {
    const row = this.db.prepare('SELECT value FROM app_settings WHERE key = ?').get(key);
    return row?.value || null;
  }

  /**
   * Get all settings
   */
  getAllSettings() {
    return this.db.prepare('SELECT key, value, description, updated_at FROM app_settings').all();
  }

  /**
   * Set a setting value
   */
  setSetting(key, value) {
    return this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `).run(key, value);
  }

  /**
   * Set multiple settings at once
   */
  setSettings(settings) {
    const stmt = this.db.prepare(`
      INSERT INTO app_settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET
        value = excluded.value,
        updated_at = CURRENT_TIMESTAMP
    `);

    const transaction = this.db.transaction((items) => {
      for (const [key, value] of Object.entries(items)) {
        stmt.run(key, value);
      }
    });

    return transaction(settings);
  }

  // ==================== OUTSTANDING BILLS ====================

  upsertOutstandingBills(bills) {
    const stmt = this.db.prepare(`
      INSERT INTO outstanding_bills (party_name, bill_name, bill_date, closing_balance, credit_period, ageing_days, ageing_bucket, synced_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(party_name, bill_name) DO UPDATE SET
        bill_date = excluded.bill_date,
        closing_balance = excluded.closing_balance,
        credit_period = excluded.credit_period,
        ageing_days = excluded.ageing_days,
        ageing_bucket = excluded.ageing_bucket,
        synced_at = CURRENT_TIMESTAMP
    `);

    const tx = this.db.transaction((items) => {
      for (const b of items) {
        stmt.run(b.partyName, b.billName, b.billDate, b.closingBalance, b.creditPeriod || 0, b.ageingDays || 0, b.ageingBucket || '0-30');
      }
    });

    tx(bills);
    return bills.length;
  }

  clearOutstandingBills() {
    return this.db.prepare('DELETE FROM outstanding_bills').run();
  }

  getOutstandingBills(party = null) {
    if (party) {
      return this.db.prepare('SELECT * FROM outstanding_bills WHERE party_name = ? ORDER BY closing_balance DESC').all(party);
    }
    return this.db.prepare('SELECT * FROM outstanding_bills ORDER BY closing_balance DESC').all();
  }

  getAgeingSummary() {
    return this.db.prepare(`
      SELECT ageing_bucket,
        COUNT(*) as bill_count,
        SUM(closing_balance) as total_amount,
        COUNT(DISTINCT party_name) as party_count
      FROM outstanding_bills
      GROUP BY ageing_bucket
      ORDER BY CASE ageing_bucket
        WHEN '0-30' THEN 1
        WHEN '30-60' THEN 2
        WHEN '60-90' THEN 3
        WHEN '90+' THEN 4
      END
    `).all();
  }

  getOutstandingParties() {
    return this.db.prepare(`
      SELECT party_name,
        SUM(closing_balance) as total_outstanding,
        COUNT(*) as bill_count,
        MIN(bill_date) as oldest_bill_date
      FROM outstanding_bills
      GROUP BY party_name
      ORDER BY total_outstanding DESC
    `).all();
  }

  // ==================== STOCK GROUPS ====================

  upsertStockGroups(groups) {
    const stmt = this.db.prepare(`
      INSERT INTO stock_groups (name, parent, closing_balance, closing_value, synced_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(name) DO UPDATE SET
        parent = excluded.parent,
        closing_balance = excluded.closing_balance,
        closing_value = excluded.closing_value,
        synced_at = CURRENT_TIMESTAMP
    `);

    const tx = this.db.transaction((items) => {
      for (const g of items) {
        stmt.run(g.name, g.parent, g.closingBalance || 0, g.closingValue || 0);
      }
    });

    tx(groups);
    return groups.length;
  }

  getAllStockGroups() {
    return this.db.prepare('SELECT * FROM stock_groups ORDER BY name').all();
  }

  getStockGroupSummary() {
    return this.db.prepare(`
      SELECT sg.name, sg.parent, sg.closing_balance, sg.closing_value,
        (SELECT COUNT(*) FROM stock_items si WHERE si.parent = sg.name) as item_count
      FROM stock_groups sg
      ORDER BY sg.closing_value DESC
    `).all();
  }

  // ==================== PRICE LISTS ====================

  upsertPriceLists(prices) {
    const stmt = this.db.prepare(`
      INSERT INTO price_lists (stock_item, price_level, rate, synced_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(stock_item, price_level) DO UPDATE SET
        rate = excluded.rate,
        synced_at = CURRENT_TIMESTAMP
    `);

    const tx = this.db.transaction((items) => {
      for (const p of items) {
        stmt.run(p.stockItem, p.priceLevel, p.rate || 0);
      }
    });

    tx(prices);
    return prices.length;
  }

  getPriceLists(level = null) {
    if (level) {
      return this.db.prepare('SELECT * FROM price_lists WHERE price_level = ? ORDER BY stock_item').all(level);
    }
    return this.db.prepare('SELECT * FROM price_lists ORDER BY stock_item, price_level').all();
  }

  getPriceLevels() {
    return this.db.prepare('SELECT DISTINCT price_level FROM price_lists ORDER BY price_level').all().map(r => r.price_level);
  }

  getItemPrices(itemName) {
    return this.db.prepare('SELECT * FROM price_lists WHERE stock_item = ? ORDER BY price_level').all(itemName);
  }

  // ==================== BANK / FONEPAY RECONCILIATION ====================

  createReconMatch(match) {
    return this.db.prepare(`
      INSERT INTO bank_reconciliation (recon_type, source_type, source_id, source_date, source_amount, source_description, target_type, target_id, target_date, target_amount, target_description, match_status, match_confidence, matched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      match.reconType, match.sourceType, match.sourceId, match.sourceDate, match.sourceAmount, match.sourceDescription,
      match.targetType, match.targetId, match.targetDate, match.targetAmount, match.targetDescription,
      match.matchStatus || 'matched', match.matchConfidence || 1.0
    );
  }

  getReconMatches(reconType = null) {
    if (reconType) {
      return this.db.prepare('SELECT * FROM bank_reconciliation WHERE recon_type = ? ORDER BY created_at DESC').all(reconType);
    }
    return this.db.prepare('SELECT * FROM bank_reconciliation ORDER BY created_at DESC').all();
  }

  getReconSummary(reconType = null) {
    const where = reconType ? `WHERE recon_type = '${reconType}'` : '';
    return this.db.prepare(`
      SELECT recon_type, match_status,
        COUNT(*) as count,
        SUM(source_amount) as total_source_amount,
        SUM(target_amount) as total_target_amount
      FROM bank_reconciliation ${where}
      GROUP BY recon_type, match_status
    `).all();
  }

  clearReconByType(reconType) {
    return this.db.prepare('DELETE FROM bank_reconciliation WHERE recon_type = ?').run(reconType);
  }

  getUnmatchedRBB() {
    // RBB transactions not yet matched in bank_reconciliation
    return this.db.prepare(`
      SELECT r.* FROM rbb_transactions r
      WHERE r.id NOT IN (
        SELECT source_id FROM bank_reconciliation WHERE source_type = 'rbb' AND match_status = 'matched'
      )
      ORDER BY r.transaction_date DESC
    `).all();
  }

  getUnmatchedTallyVouchers(reconType) {
    return this.db.prepare(`
      SELECT * FROM bank_reconciliation
      WHERE recon_type = ? AND match_status = 'unmatched' AND target_type IS NULL
      ORDER BY created_at DESC
    `).all(reconType);
  }

  getUnmatchedFonepay() {
    return this.db.prepare(`
      SELECT f.* FROM fonepay_transactions f
      WHERE f.id NOT IN (
        SELECT source_id FROM bank_reconciliation WHERE source_type = 'fonepay' AND match_status = 'matched'
      )
      ORDER BY f.transaction_date DESC
    `).all();
  }

  // ==================== CHEQUE POST AUDIT LOG ====================

  savePostLog(data) {
    const { voucherDate, totalAmount, totalCheques, totalParties, journalVoucherNumber, journalSuccess, masterIds, receipts, results } = data;
    const stmt = this.db.prepare(`
      INSERT INTO cheque_post_log (voucher_date, total_amount, total_cheques, total_parties, journal_voucher_number, journal_success, master_ids, receipts_json, results_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    return stmt.run(voucherDate, totalAmount, totalCheques, totalParties, journalVoucherNumber || '', journalSuccess ? 1 : 0, JSON.stringify(masterIds || []), JSON.stringify(receipts || []), JSON.stringify(results || {}));
  }

  getPostLogs(limit = 50, offset = 0) {
    return this.db.prepare(`SELECT * FROM cheque_post_log ORDER BY posted_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
  }

  getPostedMasterIds(voucherDate) {
    const rows = this.db.prepare(`SELECT master_ids FROM cheque_post_log WHERE voucher_date = ?`).all(voucherDate);
    const ids = new Set();
    for (const row of rows) {
      try { const arr = JSON.parse(row.master_ids); arr.forEach(id => ids.add(String(id))); } catch (e) {}
    }
    return [...ids];
  }

  getPostLogCount() {
    return this.db.prepare(`SELECT COUNT(*) as count FROM cheque_post_log`).get().count;
  }

  getPostLogStats() {
    return this.db.prepare(`
      SELECT
        COUNT(*) as total_posts,
        SUM(total_cheques) as total_cheques,
        SUM(total_amount) as total_amount,
        SUM(total_parties) as total_parties,
        SUM(CASE WHEN journal_success = 1 THEN 1 ELSE 0 END) as successful_journals,
        MIN(posted_at) as first_post,
        MAX(posted_at) as last_post
      FROM cheque_post_log
    `).get();
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
