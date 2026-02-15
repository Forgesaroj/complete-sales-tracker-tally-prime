/**
 * Fonepay Routes
 * Fonepay QR payment integration
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { fonepayService } from '../services/payment/fonepayService.js';
import config from '../config/default.js';

const router = Router();

/**
 * GET /api/fonepay/dashboard
 * Get Fonepay dashboard summary
 */
router.get('/dashboard', (req, res) => {
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
router.get('/status', (req, res) => {
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
router.post('/sync', async (req, res) => {
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
router.post('/start', async (req, res) => {
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
router.post('/stop', async (req, res) => {
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
router.put('/credentials', (req, res) => {
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
router.put('/interval', (req, res) => {
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
router.get('/transactions', (req, res) => {
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
router.get('/summary', (req, res) => {
  try {
    const summary = db.db.prepare(`
      SELECT
        COUNT(*) as totalCount,
        COALESCE(SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END), 0) as totalAmount,
        COUNT(CASE WHEN status = 'success' THEN 1 END) as successCount,
        COUNT(CASE WHEN status = 'failed' OR status = 'failure' THEN 1 END) as failedCount
      FROM fonepay_transactions
    `).get();

    // Add linked/unlinked counts
    const linkStats = db.db.prepare(`
      SELECT
        COUNT(CASE WHEN voucher_number IS NOT NULL THEN 1 END) as linkedCount,
        COALESCE(SUM(CASE WHEN voucher_number IS NOT NULL THEN amount ELSE 0 END), 0) as linkedAmount,
        COUNT(CASE WHEN voucher_number IS NULL THEN 1 END) as unlinkedCount,
        COALESCE(SUM(CASE WHEN voucher_number IS NULL THEN amount ELSE 0 END), 0) as unlinkedAmount
      FROM fonepay_transactions
    `).get();

    res.json({
      success: true,
      ...summary,
      ...linkStats
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fonepay/transactions/today
 * Get today's Fonepay transactions
 */
router.get('/transactions/today', (req, res) => {
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
router.get('/settlements', (req, res) => {
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
 * GET /api/fonepay/ledger
 * Fonepay ledger: every transaction as individual entry
 * CR = Fonepay portal collections (customer paid via QR → Fonepay owes us)
 * DR = RBB settlement (Fonepay settled to bank → reduces what they owe)
 * Balance = Opening + CR total - DR total (zero when fully settled)
 */
router.get('/ledger', (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    // Opening balance from app_settings
    const obRow = db.db.prepare(`SELECT value FROM app_settings WHERE key = 'fonepay_opening_balance'`).get();
    const openingBalance = parseFloat(obRow?.value || '0');

    // 1. Fonepay portal collections → CR entries (have datetime like "2025-07-17 10:30:45")
    let fpQuery = `SELECT transaction_date, amount, initiator, issuer_name, transaction_id, description
      FROM fonepay_transactions WHERE status = 'success'`;
    const fpParams = [];
    if (fromDate) { fpQuery += ' AND DATE(transaction_date) >= DATE(?)'; fpParams.push(fromDate); }
    if (toDate) { fpQuery += ' AND DATE(transaction_date) <= DATE(?)'; fpParams.push(toDate); }
    fpQuery += ' ORDER BY transaction_date DESC';
    const fpRows = db.db.prepare(fpQuery).all(...fpParams);

    // 2. RBB settlements → DR entries (ESEWASTLMT + FONEPAY credits in bank, date only)
    let rbbQuery = `SELECT transaction_date, credit, description, reference_number
      FROM rbb_transactions WHERE credit > 0 AND (
        UPPER(description) LIKE '%ESEWASTLMT%' OR UPPER(description) LIKE '%ESEWA%' OR UPPER(description) LIKE '%FONEPAY%'
      )`;
    const rbbParams = [];
    if (fromDate) { rbbQuery += ' AND DATE(transaction_date) >= DATE(?)'; rbbParams.push(fromDate); }
    if (toDate) { rbbQuery += ' AND DATE(transaction_date) <= DATE(?)'; rbbParams.push(toDate); }
    rbbQuery += ' ORDER BY transaction_date DESC';
    const rbbRows = db.db.prepare(rbbQuery).all(...rbbParams);

    // Build combined ledger entries with sortKey for proper ordering
    const entries = [];

    for (const r of fpRows) {
      // Fonepay has datetime — use as-is for sorting
      const dt = r.transaction_date || '';
      entries.push({
        date: dt,
        sortKey: dt, // "2025-07-17 10:30:45" — sorts by actual time
        description: r.initiator || r.description || r.transaction_id,
        detail: r.issuer_name || '',
        cr: r.amount || 0,
        dr: 0,
        side: 'CR',
        source: 'fonepay'
      });
    }

    // Fonepay settlement schedule:
    // 1st: collections 12AM-10AM → settled at 11AM
    // 2nd: collections 10AM-3PM  → settled at 4PM
    // 3rd: collections 3PM-12AM  → settled at 1AM next day
    const settlementWindows = [
      { start: '00:00', end: '10:00', time: '11:00:00', label: '1st Settlement (11AM)' },
      { start: '10:00', end: '15:00', time: '16:00:00', label: '2nd Settlement (4PM)' },
      { start: '15:00', end: '24:00', time: '23:59:58', label: '3rd Settlement (1AM+1)' },
    ];

    // Determine which settlement windows are active per date (have Fonepay transactions)
    const fpByDate = {};
    for (const r of fpRows) {
      const dt = r.transaction_date || '';
      const dateOnly = dt.split(' ')[0] || dt;
      const timeStr = dt.split(' ')[1] || '00:00:00';
      const hhmm = timeStr.slice(0, 5); // "HH:MM"
      if (!fpByDate[dateOnly]) fpByDate[dateOnly] = new Set();
      for (let i = 0; i < settlementWindows.length; i++) {
        if (hhmm >= settlementWindows[i].start && hhmm < settlementWindows[i].end) {
          fpByDate[dateOnly].add(i);
          break;
        }
      }
    }

    // Group RBB entries by date
    const rbbByDate = {};
    for (const r of rbbRows) {
      const dt = r.transaction_date || '';
      const dateOnly = dt.split(' ')[0] || dt;
      if (!rbbByDate[dateOnly]) rbbByDate[dateOnly] = [];
      rbbByDate[dateOnly].push(r);
    }

    for (const [dateOnly, rows] of Object.entries(rbbByDate)) {
      // Get active windows for this date (windows that had Fonepay transactions)
      const activeWindowIndices = fpByDate[dateOnly]
        ? [...fpByDate[dateOnly]].sort((a, b) => a - b)
        : [0, 1, 2]; // fallback: if no Fonepay data for date, use all windows

      rows.forEach((r, idx) => {
        const desc = (r.description || '').toUpperCase();
        // Assign to the active window at this index, or last active window if more RBB entries than windows
        const windowIdx = idx < activeWindowIndices.length
          ? activeWindowIndices[idx]
          : activeWindowIndices[activeWindowIndices.length - 1];
        const window = settlementWindows[windowIdx];
        entries.push({
          date: r.transaction_date || dateOnly,
          sortKey: dateOnly + ' ' + window.time,
          description: r.description || '',
          detail: (desc.includes('ESEWASTLMT') || desc.includes('ESEWA')) ? 'ESEWASTLMT' : 'FONEPAY',
          settlement: window.label,
          cr: 0,
          dr: r.credit || 0,
          side: 'DR',
          source: 'rbb'
        });
      });
    }

    // 3. Manual adjustments — charges (DR) and missing collections (CR)
    let adjQuery = `SELECT * FROM fonepay_adjustments WHERE 1=1`;
    const adjParams = [];
    if (fromDate) { adjQuery += ' AND date >= ?'; adjParams.push(fromDate); }
    if (toDate) { adjQuery += ' AND date <= ?'; adjParams.push(toDate); }
    const adjRows = db.db.prepare(adjQuery).all(...adjParams);

    for (const a of adjRows) {
      if (a.type === 'collection') {
        // Missing portal transaction — CR entry
        entries.push({
          date: a.date,
          sortKey: a.date + ' 12:00:00', // place mid-day
          description: a.description || 'Missing Portal Txn',
          detail: 'Manual',
          cr: a.amount || 0,
          dr: 0,
          side: 'CR',
          source: 'adjustment',
          adjustmentId: a.id
        });
      } else {
        // Service charge — DR entry
        entries.push({
          date: a.date,
          sortKey: a.date + ' 23:59:59', // place at end of day
          description: a.description || 'Service Charge',
          detail: 'Charge',
          cr: 0,
          dr: a.amount || 0,
          side: 'DR',
          source: 'adjustment',
          adjustmentId: a.id
        });
      }
    }

    // Sort by sortKey descending (newest first), DR after CR on same date
    entries.sort((a, b) => (b.sortKey || '').localeCompare(a.sortKey || ''));

    // Compute running balance from oldest to newest, starting with opening balance
    const sorted = [...entries].reverse();
    let runningBalance = openingBalance;
    for (const e of sorted) {
      runningBalance += e.cr - e.dr;
      e.balance = runningBalance;
    }

    const totalCR = entries.reduce((s, e) => s + e.cr, 0);
    const totalDR = entries.reduce((s, e) => s + e.dr, 0);

    // Clean up sortKey before sending
    for (const e of entries) delete e.sortKey;

    const totalCharges = adjRows.filter(a => a.type !== 'collection').reduce((s, a) => s + (a.amount || 0), 0);
    const totalManualCR = adjRows.filter(a => a.type === 'collection').reduce((s, a) => s + (a.amount || 0), 0);

    res.json({
      success: true,
      openingBalance,
      totalCR,
      totalDR,
      totalCharges,
      totalManualCR,
      balance: openingBalance + totalCR - totalDR,
      crCount: fpRows.length,
      drCount: rbbRows.length,
      chargeCount: adjRows.length,
      entries
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fonepay/balance
 * Get latest Fonepay balance
 */
router.get('/balance', (req, res) => {
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
router.get('/balance/history', (req, res) => {
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
router.post('/historical', async (req, res) => {
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
router.post('/qr/generate', async (req, res) => {
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

/**
 * POST /api/fonepay/qr/generate-for-bill
 * Generate QR for a specific bill with company name, bill number, and date
 * Body: { amount, voucherNumber, partyName, billDate, companyName? }
 */
router.post('/qr/generate-for-bill', async (req, res) => {
  try {
    const { amount, voucherNumber, partyName, billDate, companyName = config.tally.companyName || 'FOR DB' } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }
    if (!voucherNumber) {
      return res.status(400).json({ error: 'voucherNumber is required' });
    }

    // Create remarks with bill info: "CompanyName | BillNo | Date"
    const remarks = `${companyName} | ${voucherNumber} | ${billDate || new Date().toISOString().split('T')[0]}`;

    console.log(`[Fonepay API] Generating QR for bill ${voucherNumber}, Rs. ${amount}`);
    console.log(`[Fonepay API] Remarks: ${remarks}`);

    const result = await fonepayService.generateQR(amount, remarks);

    if (result.success) {
      res.json({
        ...result,
        billInfo: {
          voucherNumber,
          partyName,
          billDate,
          companyName,
          remarks
        }
      });
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fonepay/link-to-bill
 * Link a Fonepay transaction to a bill
 * Updates the transaction description with: Company Name | Bill Number | Bill Date
 */
router.post('/link-to-bill', (req, res) => {
  try {
    const { transactionId, voucherNumber, partyName, billDate, companyName = config.tally.companyName || 'FOR DB' } = req.body;

    if (!transactionId || !voucherNumber) {
      return res.status(400).json({ error: 'transactionId and voucherNumber are required' });
    }

    // Check if transaction exists
    const txn = db.getFonepayTransactionById(transactionId);
    if (!txn) {
      return res.status(404).json({ error: 'Transaction not found' });
    }

    // Link the transaction to the bill
    db.linkFonepayToBill(transactionId, {
      voucherNumber,
      partyName,
      companyName,
      billDate
    });

    // Auto-save phone → party mapping if initiator phone exists
    if (txn.initiator && partyName) {
      try { db.upsertPartyPhone(txn.initiator, partyName, 'auto'); } catch (e) { /* ignore */ }
    }

    res.json({
      success: true,
      message: 'Transaction linked to bill',
      transactionId,
      voucherNumber,
      displayDescription: `${companyName} | ${voucherNumber} | ${billDate || ''}`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fonepay/unlinked
 * Get Fonepay transactions not yet linked to any bill
 */
router.get('/unlinked', (req, res) => {
  try {
    const transactions = db.getUnlinkedFonepayTransactions();
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
 * GET /api/fonepay/for-bill/:voucherNumber
 * Get Fonepay transactions linked to a specific bill
 */
router.get('/for-bill/:voucherNumber', (req, res) => {
  try {
    const transactions = db.getFonepayForBill(req.params.voucherNumber);
    const totalAmount = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);

    res.json({
      success: true,
      voucherNumber: req.params.voucherNumber,
      count: transactions.length,
      totalAmount,
      transactions
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fonepay/auto-match
 * Find a matching Fonepay transaction by amount and date — does NOT link.
 * Returns the match as a suggestion. User must confirm from Fonepay page.
 */
router.post('/auto-match', (req, res) => {
  try {
    const { amount, date, voucherNumber, partyName, billDate, companyName = config.tally.companyName || 'FOR DB' } = req.body;

    if (!amount || !voucherNumber) {
      return res.status(400).json({ error: 'amount and voucherNumber are required' });
    }

    const searchDate = date || new Date().toISOString().split('T')[0];

    // Find matching transaction (does NOT link)
    const txn = db.findMatchingFonepayTransaction(amount, searchDate);

    if (!txn) {
      return res.json({
        success: true,
        message: `No unlinked transaction found for Rs. ${amount} on ${searchDate}`,
        matched: false
      });
    }

    // Only return the suggestion — user must confirm from Fonepay page
    res.json({
      success: true,
      message: 'Match found — confirm from Fonepay page',
      matched: true,
      suggestion: {
        transactionId: txn.transaction_id,
        amount: txn.amount,
        date: txn.transaction_date,
        issuer: txn.issuer_name,
        bill: {
          voucherNumber,
          partyName,
          companyName,
          billDate
        }
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fonepay/unlink
 * Unlink a Fonepay transaction from its bill
 */
router.post('/unlink', (req, res) => {
  try {
    const { transactionId } = req.body;
    if (!transactionId) return res.status(400).json({ error: 'transactionId is required' });

    const result = db.unlinkFonepayFromBill(transactionId);
    res.json({ success: true, changes: result.changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fonepay/bulk-link
 * Bulk link multiple Fonepay transactions to bills
 */
router.post('/bulk-link', (req, res) => {
  try {
    const { links } = req.body;
    if (!links || !links.length) return res.status(400).json({ error: 'links array is required' });

    const linked = db.bulkLinkFonepay(links);

    // Auto-save phone → party mappings for linked transactions
    for (const link of links) {
      if (link.transactionId && link.partyName) {
        try {
          const txn = db.getFonepayTransactionById(link.transactionId);
          if (txn && txn.initiator) {
            db.upsertPartyPhone(txn.initiator, link.partyName, 'auto');
          }
        } catch (e) { /* ignore */ }
      }
    }

    res.json({ success: true, linked, total: links.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fonepay/suggest-matches
 * Match unlinked Fonepay transactions against QR receipts from Tally:
 * - Billing company: "QR Code" / "Q/R code" ledger
 * - ODBC company: "QR Received" ledger
 * Returns pairs without linking — user must confirm
 */
router.post('/suggest-matches', (req, res) => {
  try {
    const { dateFrom, dateTo } = req.body || {};
    const unlinked = db.getUnlinkedFonepayTransactions(dateFrom, dateTo);
    const qrReceipts = db.getQRReceipts();
    const phoneMap = db.getPhonePartyMap(); // {phone: partyName}
    const suggestions = [];

    for (const txn of unlinked) {
      const txnDate = (txn.transaction_date || '').split(' ')[0];
      const txnMs = new Date(txnDate).getTime();
      const txnAmount = Math.abs(txn.amount);
      const knownParty = txn.initiator ? phoneMap[txn.initiator] : null;

      let best = null;
      let confidence = 'low';
      let warning = null;

      // Tier 1: Phone + Amount + Date match (high confidence)
      if (knownParty) {
        best = qrReceipts.find(r => {
          if (Math.abs(r.qr_amount - txnAmount) >= 0.01) return false;
          if (r.party_name.toLowerCase() !== knownParty.toLowerCase()) return false;
          const vd = r.voucher_date || '';
          const vDateFormatted = vd.length === 8 ? `${vd.slice(0,4)}-${vd.slice(4,6)}-${vd.slice(6,8)}` : vd;
          return Math.abs(txnMs - new Date(vDateFormatted).getTime()) / 86400000 <= 2;
        });
        if (best) confidence = 'high';
      }

      // Tier 2: Amount + Date match (any party) — low confidence
      if (!best) {
        best = qrReceipts.find(r => {
          if (Math.abs(r.qr_amount - txnAmount) >= 0.01) return false;
          const vd = r.voucher_date || '';
          const vDateFormatted = vd.length === 8 ? `${vd.slice(0,4)}-${vd.slice(4,6)}-${vd.slice(6,8)}` : vd;
          return Math.abs(txnMs - new Date(vDateFormatted).getTime()) / 86400000 <= 2;
        });
        if (best) {
          confidence = 'low';
          // Warn if phone is known but receipt party differs (Saroj paying for Santosh scenario)
          if (knownParty && best.party_name.toLowerCase() !== knownParty.toLowerCase()) {
            warning = `Phone ${txn.initiator} is mapped to "${knownParty}" but receipt is for "${best.party_name}". May be a third-party payment.`;
          }
        }
      }

      if (!best) continue;

      suggestions.push({
        transactionId: txn.transaction_id,
        amount: txn.amount,
        transactionDate: txn.transaction_date,
        initiator: txn.initiator || '',
        issuerName: txn.issuer_name || '',
        confidence,
        warning,
        matchedReceipt: {
          partyName: best.party_name,
          voucherNumber: best.voucher_number,
          voucherDate: best.voucher_date,
          qrAmount: best.qr_amount,
          source: best.source,
          companyName: best.source === 'billing' ? db.getCompanyNames().billing : db.getCompanyNames().odbc
        }
      });

      // Remove matched receipt so it's not matched twice
      const idx = qrReceipts.indexOf(best);
      if (idx >= 0) qrReceipts.splice(idx, 1);
    }

    res.json({ success: true, suggestions, count: suggestions.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/fonepay/adjustment
 * Add a service charge or manual adjustment entry
 * Body: { date, amount, description? }
 */
router.post('/adjustment', (req, res) => {
  try {
    const { date, amount, description, type = 'charge' } = req.body;
    if (!date || !amount || amount <= 0) {
      return res.status(400).json({ error: 'date and positive amount are required' });
    }
    const validTypes = ['charge', 'collection'];
    const adjType = validTypes.includes(type) ? type : 'charge';
    const defaultDesc = adjType === 'collection' ? 'Missing Portal Txn' : 'Service Charge';
    const result = db.db.prepare(
      `INSERT INTO fonepay_adjustments (date, amount, description, type) VALUES (?, ?, ?, ?)`
    ).run(date, amount, description || defaultDesc, adjType);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/fonepay/adjustments
 * List all adjustments
 */
router.get('/adjustments', (req, res) => {
  try {
    const rows = db.db.prepare(`SELECT * FROM fonepay_adjustments ORDER BY date DESC`).all();
    res.json({ success: true, adjustments: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/fonepay/adjustment/:id
 * Delete an adjustment entry
 */
router.delete('/adjustment/:id', (req, res) => {
  try {
    const result = db.db.prepare(`DELETE FROM fonepay_adjustments WHERE id = ?`).run(req.params.id);
    res.json({ success: true, deleted: result.changes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
