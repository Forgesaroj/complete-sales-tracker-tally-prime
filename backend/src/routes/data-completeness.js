import { Router } from 'express';
import { db } from '../services/database/database.js';
import tallyConnector from '../services/tally/tallyConnector.js';

const router = Router();

// GET /api/data-completeness — live computed completeness data
router.get('/', (req, res) => {
  try {
    // ---- Gather live stats from DB ----
    const totalBills = db.db.prepare("SELECT COUNT(*) as c FROM bills WHERE (is_deleted = 0 OR is_deleted IS NULL)").get().c;
    const deletedBills = db.db.prepare("SELECT COUNT(*) as c FROM bills WHERE is_deleted = 1").get().c;
    const withTimestamp = db.db.prepare("SELECT COUNT(*) as c FROM bills WHERE tally_created_datetime IS NOT NULL AND tally_created_datetime != '' AND (is_deleted = 0 OR is_deleted IS NULL)").get().c;
    const withAction = db.db.prepare("SELECT COUNT(*) as c FROM bills WHERE object_update_action IS NOT NULL AND (is_deleted = 0 OR is_deleted IS NULL)").get().c;
    const withEnteredBy = db.db.prepare("SELECT COUNT(*) as c FROM bills WHERE entered_by IS NOT NULL AND entered_by != '' AND (is_deleted = 0 OR is_deleted IS NULL)").get().c;
    const withAuditStatus = db.db.prepare("SELECT COUNT(*) as c FROM bills WHERE audit_status IS NOT NULL AND audit_status != 'pending' AND (is_deleted = 0 OR is_deleted IS NULL)").get().c;
    const withCriticalFlag = db.db.prepare("SELECT COUNT(*) as c FROM bills WHERE is_critical = 1 AND (is_deleted = 0 OR is_deleted IS NULL)").get().c;

    // ODBC
    let odbcVouchers = 0;
    try { odbcVouchers = db.db.prepare("SELECT COUNT(*) as c FROM odbc_vouchers").get().c; } catch {}

    // Change log
    let changeLogEntries = 0;
    try { changeLogEntries = db.db.prepare("SELECT COUNT(*) as c FROM voucher_change_log").get().c; } catch {}

    // Parties
    let totalParties = 0;
    try { totalParties = db.db.prepare("SELECT COUNT(*) as c FROM ledgers").get().c; } catch {}

    // Stock
    let totalStockItems = 0;
    try { totalStockItems = db.db.prepare("SELECT COUNT(*) as c FROM stock_items").get().c; } catch {}
    let totalStockGroups = 0;
    try { totalStockGroups = db.db.prepare("SELECT COUNT(*) as c FROM stock_groups").get().c; } catch {}

    // Fonepay
    let fonepayTxns = 0;
    let fonepayLinked = 0;
    try { fonepayTxns = db.db.prepare("SELECT COUNT(*) as c FROM fonepay_transactions").get().c; } catch {}
    try { fonepayLinked = db.db.prepare("SELECT COUNT(*) as c FROM fonepay_transactions WHERE linked_bill_id IS NOT NULL").get().c; } catch {}

    // RBB
    let rbbTxns = 0;
    try { rbbTxns = db.db.prepare("SELECT COUNT(*) as c FROM rbb_transactions").get().c; } catch {}

    // Cheques
    let totalCheques = 0;
    try { totalCheques = db.db.prepare("SELECT COUNT(*) as c FROM cheques").get().c; } catch {}

    // Outstanding
    let outstandingBills = 0;
    try { outstandingBills = db.db.prepare("SELECT COUNT(*) as c FROM outstanding_bills").get().c; } catch {}

    // Phone mappings
    let phoneMappings = 0;
    try { phoneMappings = db.db.prepare("SELECT COUNT(*) as c FROM fonepay_party_phones").get().c; } catch {}

    // Ledger mappings
    let ledgerMappings = 0;
    try { ledgerMappings = db.db.prepare("SELECT COUNT(*) as c FROM ledger_mappings").get().c; } catch {}

    // Collection batches
    let collectionBatches = 0;
    try { collectionBatches = db.db.prepare("SELECT COUNT(*) as c FROM collection_batches").get().c; } catch {}

    // Sync state
    let lastSyncTime = null;
    try {
      const sync = db.db.prepare("SELECT last_sync FROM sync_state ORDER BY last_sync DESC LIMIT 1").get();
      lastSyncTime = sync?.last_sync || null;
    } catch {}

    // Action breakdown
    let actionBreakdown = {};
    try {
      const actions = db.db.prepare("SELECT object_update_action, COUNT(*) as c FROM bills WHERE object_update_action IS NOT NULL AND (is_deleted = 0 OR is_deleted IS NULL) GROUP BY object_update_action").all();
      for (const a of actions) actionBreakdown[a.object_update_action] = a.c;
    } catch {}

    // Tally connection
    const tallyConnected = tallyConnector.isConnected || false;

    // Build categories
    const categories = [
      {
        name: 'Dashboard Overview',
        components: [
          { name: 'Dashboard Summary', source: 'SQLite bills', method: 'GET /api/dashboard/summary', refresh: 'Page load', score: 80, detail: 'Single-company totals', count: null },
          { name: 'Tally Connection', source: 'Tally live', method: 'GET /api/tally/status', refresh: 'Real-time', score: tallyConnected ? 95 : 40, detail: tallyConnected ? 'Connected' : 'Disconnected', count: null },
          { name: 'Sync Status', source: 'SQLite sync_state', method: 'GET /api/sync/status', refresh: 'Real-time', score: 90, detail: lastSyncTime ? `Last: ${lastSyncTime}` : 'No sync recorded', count: null },
          { name: 'Date/Time Display', source: 'Browser local', method: 'NepaliDate + Date()', refresh: '1 second', score: 100, detail: 'Nepali + English live clock', count: null },
        ]
      },
      {
        name: 'Total Vouchers',
        components: [
          { name: 'Voucher List (FOR DB)', source: 'SQLite bills', method: 'GET /api/vouchers', refresh: 'Auto 2min', score: 95, detail: `${totalBills} active vouchers`, count: totalBills },
          { name: 'Voucher List (ODBC)', source: 'SQLite odbc_vouchers', method: 'GET /api/vouchers/combined', refresh: 'Manual', score: 85, detail: `${odbcVouchers} ODBC vouchers`, count: odbcVouchers },
          { name: 'Created At Timestamp', source: 'Tally UPDATEDDATETIME', method: 'Sync + backfill', refresh: 'On sync', score: totalBills > 0 ? Math.round(withTimestamp / totalBills * 100) : 0, detail: `${withTimestamp}/${totalBills} filled`, count: withTimestamp },
          { name: 'Object Update Action', source: 'Tally OBJECTUPDATEACTION', method: 'Sync + backfill', refresh: 'On sync', score: totalBills > 0 ? Math.round(withAction / totalBills * 100) : 0, detail: `${withAction}/${totalBills} filled`, count: withAction },
          { name: 'Entered By', source: 'Tally ENTEREDBY', method: 'Sync + backfill', refresh: 'On sync', score: totalBills > 0 ? Math.round(withEnteredBy / totalBills * 100) : 0, detail: `${withEnteredBy}/${totalBills} filled`, count: withEnteredBy },
          { name: 'Audit Status', source: 'SQLite audit_status', method: 'PUT /api/vouchers/:id/audit', refresh: 'On change', score: 90, detail: `${withAuditStatus} audited`, count: withAuditStatus },
          { name: 'Critical Flags', source: 'Computed during upsert', method: 'Auto', refresh: 'On sync', score: 90, detail: `${withCriticalFlag} flagged`, count: withCriticalFlag },
          { name: 'Change Log', source: 'SQLite voucher_change_log', method: 'GET /api/voucher-history', refresh: 'On sync', score: 60, detail: `${changeLogEntries} entries (only tracked fields)`, count: changeLogEntries },
          { name: 'Voucher Lock', source: 'Tally UDF + local', method: 'POST /api/voucher-lock', refresh: 'On click', score: 85, detail: 'Edit blocking works, delete bypass exists', count: null },
        ]
      },
      {
        name: 'Deleted Vouchers',
        components: [
          { name: 'Deleted List', source: 'SQLite bills (is_deleted=1)', method: 'GET /api/vouchers/deleted', refresh: 'On load', score: 80, detail: `${deletedBills} deleted vouchers`, count: deletedBills },
          { name: 'Restore Voucher', source: 'SQLite + Tally', method: 'POST /api/vouchers/restore', refresh: 'On action', score: 80, detail: 'Available', count: null },
        ]
      },
      {
        name: 'Daybook',
        components: [
          { name: 'Daybook Entries', source: 'SQLite bills', method: 'GET /api/daybook', refresh: 'On date change', score: 85, detail: 'Single-company only', count: null },
          { name: 'Party Summary', source: 'SQLite bills (grouped)', method: 'GET /api/daybook/party-summary', refresh: 'On date change', score: 85, detail: 'Grouped by party', count: null },
        ]
      },
      {
        name: 'Receipt Creation',
        components: [
          { name: 'Create Receipt', source: 'Tally live (write)', method: 'POST /api/receipts', refresh: 'On submit', score: 90, detail: 'All payment modes supported', count: null },
          { name: 'Payment Modes', source: 'User input', method: 'Frontend form', refresh: 'N/A', score: 95, detail: 'Cash, QR, Cheque, Discount, eSewa, Bank', count: null },
        ]
      },
      {
        name: 'Fonepay Integration',
        components: [
          { name: 'Transactions', source: 'SQLite fonepay_transactions', method: 'GET /api/fonepay/transactions', refresh: 'Scraper sync', score: 90, detail: `${fonepayTxns} transactions`, count: fonepayTxns },
          { name: 'Link to Bill', source: 'SQLite cross-table', method: 'POST /api/fonepay/link-to-bill', refresh: 'On action', score: 90, detail: `${fonepayLinked} linked`, count: fonepayLinked },
          { name: 'Suggest Matches', source: 'SQLite (computed)', method: 'POST /api/fonepay/suggest-matches', refresh: 'On click', score: 85, detail: '3-tier: phone+amount, phone, amount', count: null },
          { name: 'Phone Mappings', source: 'SQLite fonepay_party_phones', method: 'GET/POST/DELETE /api/bank-names/phone-mappings', refresh: 'On change', score: 90, detail: `${phoneMappings} mappings`, count: phoneMappings },
        ]
      },
      {
        name: 'RBB Banking',
        components: [
          { name: 'RBB Transactions', source: 'SQLite rbb_transactions', method: 'GET /api/rbb/transactions', refresh: 'Scraper sync', score: 85, detail: `${rbbTxns} transactions`, count: rbbTxns },
          { name: 'RBB Sync', source: 'RBB portal scraper', method: 'POST /api/rbb/sync', refresh: 'Manual/OTP', score: 70, detail: 'Requires OTP each session', count: null },
        ]
      },
      {
        name: 'Outstanding & Ageing',
        components: [
          { name: 'Outstanding Bills', source: 'SQLite outstanding_bills', method: 'GET /api/outstanding', refresh: 'Manual sync', score: 85, detail: `${outstandingBills} records`, count: outstandingBills },
          { name: 'Ageing Summary', source: 'SQLite outstanding_bills', method: 'GET /api/outstanding/ageing', refresh: 'Manual sync', score: 85, detail: '0-30/30-60/60-90/90+ buckets', count: null },
          { name: 'Outstanding Sync', source: 'Tally live', method: 'POST /api/outstanding/sync', refresh: 'Manual', score: 80, detail: 'Manual button only', count: null },
        ]
      },
      {
        name: 'Financial Reports',
        components: [
          { name: 'Profit & Loss', source: 'Tally live', method: 'GET /api/profit-loss', refresh: 'On-demand', score: 90, detail: 'Live from Tally', count: null },
          { name: 'Balance Sheet', source: 'Tally live', method: 'GET /api/balance-sheet', refresh: 'On-demand', score: 90, detail: 'Live from Tally', count: null },
          { name: 'Trial Balance', source: 'Tally live', method: 'GET /api/trial-balance', refresh: 'On-demand', score: 90, detail: 'Live from Tally', count: null },
          { name: 'Cash Flow', source: 'Tally live', method: 'GET /api/cash-flow', refresh: 'On-demand', score: 85, detail: 'Indirect method only', count: null },
          { name: 'Ratio Analysis', source: 'Tally live', method: 'GET /api/ratios', refresh: 'On-demand', score: 80, detail: '120s timeout', count: null },
        ]
      },
      {
        name: 'Inventory',
        components: [
          { name: 'Stock Items', source: 'SQLite stock_items', method: 'GET /api/stock', refresh: 'Master sync', score: 85, detail: `${totalStockItems} items`, count: totalStockItems },
          { name: 'Stock Groups', source: 'SQLite stock_groups', method: 'GET /api/stock-groups', refresh: 'Master sync', score: 85, detail: `${totalStockGroups} groups`, count: totalStockGroups },
          { name: 'Inventory Movement', source: 'Tally live', method: 'GET /api/inventory-movement', refresh: 'On-demand', score: 80, detail: 'Live from Tally', count: null },
        ]
      },
      {
        name: 'Cheque Management',
        components: [
          { name: 'Cheque List', source: 'SQLite cheques', method: 'GET /api/cheques', refresh: 'ODBC sync', score: 85, detail: `${totalCheques} cheques`, count: totalCheques },
          { name: 'ODBC Voucher Sync', source: 'Tally ODBC', method: 'POST /api/cheques/sync-odbc', refresh: 'Manual', score: 85, detail: `${odbcVouchers} vouchers`, count: odbcVouchers },
        ]
      },
      {
        name: 'Collection',
        components: [
          { name: 'Collection Batches', source: 'SQLite collection_batches', method: 'GET /api/collection/batches', refresh: 'Local DB', score: 85, detail: `${collectionBatches} batches`, count: collectionBatches },
          { name: 'Create Receipt', source: 'Tally live (write)', method: 'POST /api/collection/batches/:id/create-receipt', refresh: 'On action', score: 80, detail: 'Batch to receipt', count: null },
        ]
      },
      {
        name: 'Ledger (Both)',
        components: [
          { name: 'Combined Balances', source: 'Tally live (2 companies)', method: 'GET /api/ledger-both', refresh: 'On-demand', score: 80, detail: '180s timeout, sequential queries', count: null },
          { name: 'Ledger Mappings', source: 'SQLite ledger_mappings', method: 'GET /api/bank-names/ledger-mappings', refresh: 'On load', score: 90, detail: `${ledgerMappings} mappings`, count: ledgerMappings },
        ]
      },
      {
        name: 'Settings',
        components: [
          { name: 'Ledger Mappings', source: 'SQLite ledger_mappings', method: 'CRUD /api/bank-names/ledger-mappings', refresh: 'On change', score: 90, detail: `${ledgerMappings} configured`, count: ledgerMappings },
          { name: 'Phone Mappings', source: 'SQLite fonepay_party_phones', method: 'CRUD /api/bank-names/phone-mappings', refresh: 'On change', score: 90, detail: `${phoneMappings} configured`, count: phoneMappings },
          { name: 'App Settings', source: 'SQLite app_settings', method: 'GET/POST /api/config/settings', refresh: 'On change', score: 85, detail: 'Editable via UI', count: null },
        ]
      },
      {
        name: 'Sync Engine',
        components: [
          { name: 'Incremental Voucher Sync', source: 'Tally → SQLite', method: 'syncService.syncIncremental()', refresh: 'Every 120s', score: 90, detail: 'Auto, ALTERID-based', count: null },
          { name: 'Master Data Sync', source: 'Tally → SQLite', method: 'syncService.syncMasters()', refresh: 'Startup + periodic', score: 85, detail: `${totalParties} parties, ${totalStockItems} items`, count: totalParties },
          { name: 'Deleted Detection', source: 'Tally → SQLite', method: 'Full sync comparison', refresh: 'Manual only', score: 60, detail: '~2072 false-active vouchers', count: null },
          { name: 'Fonepay Scraper', source: 'Fonepay portal', method: 'Playwright', refresh: 'Scheduled', score: 75, detail: 'Credential-dependent', count: null },
          { name: 'RBB Scraper', source: 'RBB portal', method: 'Playwright', refresh: 'Manual', score: 70, detail: 'OTP-dependent', count: null },
        ]
      },
      {
        name: 'MCP Tools',
        components: [
          { name: 'Master Tools (4)', source: 'SQLite local', method: 'list-ledgers, stock-items, groups, godowns', refresh: 'On-demand', score: 95, detail: 'Instant local queries', count: null },
          { name: 'Voucher Tools (4)', source: 'SQLite + Tally', method: 'get-vouchers, daybook, party-summary, detail', refresh: 'On-demand', score: 90, detail: 'Mixed local/live', count: null },
          { name: 'Financial Tools (5)', source: 'Tally live', method: 'P&L, BS, TB, Cash Flow, Ratios', refresh: 'On-demand', score: 85, detail: 'Live from Tally', count: null },
          { name: 'Write Tools (2)', source: 'Tally live', method: 'create-sales-invoice, create-receipt', refresh: 'On-demand', score: 90, detail: 'Creates in Tally', count: null },
        ]
      },
    ];

    // Calculate overall
    let totalComponents = 0;
    let totalScore = 0;
    const categorySummary = categories.map(cat => {
      const catTotal = cat.components.length;
      const catScore = Math.round(cat.components.reduce((s, c) => s + c.score, 0) / catTotal);
      totalComponents += catTotal;
      totalScore += cat.components.reduce((s, c) => s + c.score, 0);
      return { name: cat.name, components: catTotal, avgScore: catScore };
    });

    const overallScore = Math.round(totalScore / totalComponents);

    // Action breakdown for vouchers
    const priorityImprovements = [
      { priority: 'HIGH', item: 'Full alteration history — Log every ALTERID change', current: 60, target: 90 },
      { priority: 'HIGH', item: 'Deleted voucher detection — Fix ~2072 false-active vouchers', current: 60, target: 85 },
      { priority: 'MED', item: 'ODBC auto-sync — Make ODBC sync automatic', current: 80, target: 95 },
      { priority: 'MED', item: 'Sync failure alerts — Notify on stale data', current: 0, target: 80 },
      { priority: 'LOW', item: 'Multi-period financial comparison', current: 0, target: 70 },
      { priority: 'LOW', item: 'Export to Excel/PDF for reports', current: 0, target: 80 },
    ];

    res.json({
      lastUpdated: new Date().toISOString(),
      overallScore,
      totalComponents,
      categories,
      categorySummary,
      actionBreakdown,
      priorityImprovements,
      dbStats: {
        totalBills, deletedBills, withTimestamp, withAction, withEnteredBy, withAuditStatus, withCriticalFlag,
        odbcVouchers, changeLogEntries, totalParties, totalStockItems, totalStockGroups,
        fonepayTxns, fonepayLinked, rbbTxns, totalCheques, outstandingBills,
        phoneMappings, ledgerMappings, collectionBatches
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
