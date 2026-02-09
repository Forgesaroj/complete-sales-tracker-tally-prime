/**
 * Fonepay Routes
 * Fonepay QR payment integration
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { fonepayService } from '../services/payment/fonepayService.js';

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
    const { amount, voucherNumber, partyName, billDate, companyName = 'FOR DB' } = req.body;

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
    const { transactionId, voucherNumber, partyName, billDate, companyName = 'FOR DB' } = req.body;

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
 * Find and link a matching Fonepay transaction to a bill by amount and date
 */
router.post('/auto-match', (req, res) => {
  try {
    const { amount, date, voucherNumber, partyName, billDate, companyName = 'FOR DB' } = req.body;

    if (!amount || !voucherNumber) {
      return res.status(400).json({ error: 'amount and voucherNumber are required' });
    }

    const searchDate = date || new Date().toISOString().split('T')[0];

    // Find matching transaction
    const txn = db.findMatchingFonepayTransaction(amount, searchDate);

    if (!txn) {
      return res.json({
        success: false,
        message: `No unlinked transaction found for Rs. ${amount} on ${searchDate}`,
        matched: false
      });
    }

    // Link it to the bill
    db.linkFonepayToBill(txn.transaction_id, {
      voucherNumber,
      partyName,
      companyName,
      billDate
    });

    res.json({
      success: true,
      message: 'Transaction auto-matched and linked to bill',
      matched: true,
      transaction: {
        transactionId: txn.transaction_id,
        amount: txn.amount,
        date: txn.transaction_date,
        issuer: txn.issuer_name
      },
      bill: {
        voucherNumber,
        partyName,
        displayDescription: `${companyName} | ${voucherNumber} | ${billDate || ''}`
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
