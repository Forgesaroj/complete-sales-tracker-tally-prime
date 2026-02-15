/**
 * Cheques Routes
 * Cheque tracking and management with configurable company integration
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/** Get configured company names from settings */
function co() { return db.getCompanyNames(); }

// ==================== CHEQUE RECEIPT ACTIVITY ====================
// Main workflow for entering cheque receipts on bills

/**
 * POST /api/cheques/receipt-activity
 * Main entry point for cheque receipt on bills
 * Handles:
 *   - Single cheque with optional date (confirm later)
 *   - Multiple cheques (breakdown) for one bill
 *   - Auto-push to ODBC CHq Mgmt company
 *   - Links cheques to bill
 */
router.post('/receipt-activity', async (req, res) => {
  try {
    const { voucherNumber, partyName, billAmount, billId, cheques } = req.body;

    // Validate required fields
    if (!voucherNumber) {
      return res.status(400).json({ error: 'voucherNumber is required' });
    }
    if (!partyName) {
      return res.status(400).json({ error: 'partyName is required' });
    }
    if (!billAmount || billAmount <= 0) {
      return res.status(400).json({ error: 'Valid billAmount is required' });
    }
    if (!cheques || !Array.isArray(cheques) || cheques.length === 0) {
      return res.status(400).json({ error: 'At least one cheque is required' });
    }

    // Validate each cheque
    for (let i = 0; i < cheques.length; i++) {
      if (!cheques[i].bankName) {
        return res.status(400).json({ error: `Cheque ${i + 1}: bankName is required` });
      }
      if (!cheques[i].amount || cheques[i].amount <= 0) {
        return res.status(400).json({ error: `Cheque ${i + 1}: Valid amount is required` });
      }
    }

    const totalChequeAmount = cheques.reduce((sum, c) => sum + c.amount, 0);

    console.log('=== CHEQUE RECEIPT ACTIVITY ===');
    console.log(`Bill: ${voucherNumber}, Party: ${partyName}`);
    console.log(`Bill Amount: Rs. ${billAmount}, Cheques: ${cheques.length}, Total: Rs. ${totalChequeAmount}`);

    // Check Tally connection
    let tallyConnected = false;
    try {
      const conn = await tallyConnector.checkConnection();
      tallyConnected = conn.connected;
    } catch (e) { /* ignore */ }

    const createdCheques = [];
    let syncedCount = 0, pendingDateCount = 0;

    // Process each cheque
    for (const cheque of cheques) {
      const result = db.createCheque({
        partyName,
        bankName: cheque.bankName,
        amount: cheque.amount,
        chequeNumber: cheque.chequeNumber || null,
        chequeDate: cheque.chequeDate || null,
        branch: cheque.branch || '',
        narration: `For bill ${voucherNumber}`
      });

      db.linkChequeToBill(result.id, billId || null, voucherNumber, billAmount, cheque.amount);

      if (result.needsDateConfirm) pendingDateCount++;

      // Sync to Tally if date provided and connected
      let syncResult = { success: false };
      if (cheque.chequeDate && tallyConnected) {
        try {
          syncResult = await tallyConnector.pushChequeToCompany({
            partyName,
            amount: cheque.amount,
            bankName: 'Cheque in Hand',
            chequeNumber: cheque.chequeNumber || '',
            chequeDate: cheque.chequeDate,
            narration: `For bill ${voucherNumber}`
          }, co().odbc);

          if (syncResult.success) {
            db.markChequeSynced(result.id, syncResult.voucherId);
            syncedCount++;
          } else {
            db.markChequeSynced(result.id, null, syncResult.error);
          }
        } catch (e) {
          db.markChequeSynced(result.id, null, e.message);
        }
      }

      createdCheques.push({
        id: result.id,
        bankName: cheque.bankName,
        amount: cheque.amount,
        chequeNumber: cheque.chequeNumber || null,
        chequeDate: cheque.chequeDate || null,
        needsDateConfirm: result.needsDateConfirm,
        synced: syncResult.success
      });
    }

    // Update bill payment record
    db.upsertBillPayment({
      billId, voucherNumber, partyName, billAmount,
      chequeTotal: totalChequeAmount
    });

    const payment = db.getBillPayment(voucherNumber);

    // Broadcast
    const io = req.app.get('io');
    if (io) {
      io.emit('cheque:received', { voucherNumber, partyName, totalChequeAmount, chequeCount: cheques.length });
    }

    res.json({
      success: true,
      message: pendingDateCount > 0
        ? `${cheques.length} cheque(s) recorded. ${pendingDateCount} need date confirmation.`
        : `${cheques.length} cheque(s) recorded. ${syncedCount} synced to Tally.`,
      voucherNumber, partyName, billAmount, totalChequeAmount,
      balanceDue: payment?.balance_due || (billAmount - totalChequeAmount),
      paymentStatus: payment?.payment_status || 'pending',
      cheques: createdCheques,
      summary: { total: cheques.length, synced: syncedCount, pendingDate: pendingDateCount }
    });
  } catch (error) {
    console.error('Cheque receipt activity error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/cheques/receipt-activity/:chequeId/update-date
 * Update cheque date and sync to Tally
 */
router.put('/receipt-activity/:chequeId/update-date', async (req, res) => {
  try {
    const chequeId = parseInt(req.params.chequeId);
    const { chequeDate, chequeNumber } = req.body;

    if (!chequeDate || !/^\d{8}$/.test(chequeDate)) {
      return res.status(400).json({ error: 'chequeDate required (YYYYMMDD format)' });
    }

    const cheque = db.getChequeById(chequeId);
    if (!cheque) return res.status(404).json({ error: 'Cheque not found' });

    const updated = db.confirmChequeDate(chequeId, chequeDate, chequeNumber);

    // Sync to Tally
    let synced = false;
    try {
      const conn = await tallyConnector.checkConnection();
      if (conn.connected) {
        const result = await tallyConnector.pushChequeToCompany({
          partyName: updated.party_name,
          amount: updated.amount,
          bankName: 'Cheque in Hand',
          chequeNumber: updated.cheque_number || '',
          chequeDate,
          narration: updated.narration || `Cheque from ${updated.party_name}`
        }, co().odbc);

        if (result.success) {
          db.markChequeSynced(chequeId, result.voucherId);
          synced = true;
        }
      }
    } catch (e) { /* ignore */ }

    const io = req.app.get('io');
    if (io) io.emit('cheque:dateUpdated', { chequeId, chequeDate, synced });

    res.json({
      success: true,
      message: synced ? 'Date updated & synced to ODBC CHq Mgmt' : 'Date updated. Will sync later.',
      cheque: updated, synced
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/cheques/receipt-activity/:chequeId/add-breakdown
 * Add another cheque to same bill (breakdown)
 */
router.post('/receipt-activity/:chequeId/add-breakdown', async (req, res) => {
  try {
    const existingChequeId = parseInt(req.params.chequeId);
    const { bankName, amount, chequeNumber, chequeDate } = req.body;

    if (!bankName) return res.status(400).json({ error: 'bankName required' });
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Valid amount required' });

    const existing = db.getChequeById(existingChequeId);
    if (!existing) return res.status(404).json({ error: 'Cheque not found' });

    const billLink = db.db.prepare('SELECT * FROM cheque_bill_payments WHERE cheque_id = ?').get(existingChequeId);
    if (!billLink) return res.status(400).json({ error: 'Cannot find bill link' });

    const result = db.createCheque({
      partyName: existing.party_name, bankName, amount,
      chequeNumber: chequeNumber || null,
      chequeDate: chequeDate || null,
      narration: `Breakdown for ${billLink.voucher_number}`
    });

    db.linkChequeToBill(result.id, billLink.bill_id, billLink.voucher_number, billLink.bill_amount, amount);

    // Update total
    const allCheques = db.getChequesForVoucher(billLink.voucher_number);
    const newTotal = allCheques.reduce((sum, c) => sum + c.cheque_amount, 0);
    db.upsertBillPayment({
      billId: billLink.bill_id, voucherNumber: billLink.voucher_number,
      partyName: existing.party_name, billAmount: billLink.bill_amount, chequeTotal: newTotal
    });

    // Sync if date provided
    let synced = false;
    if (chequeDate) {
      try {
        const conn = await tallyConnector.checkConnection();
        if (conn.connected) {
          const syncResult = await tallyConnector.pushChequeToCompany({
            partyName: existing.party_name, amount,
            bankName: 'Cheque in Hand', chequeNumber: chequeNumber || '', chequeDate,
            narration: `Breakdown for ${billLink.voucher_number}`
          }, co().odbc);
          if (syncResult.success) { db.markChequeSynced(result.id, syncResult.voucherId); synced = true; }
        }
      } catch (e) { /* ignore */ }
    }

    res.json({
      success: true,
      message: 'Breakdown cheque added',
      newCheque: { id: result.id, bankName, amount, needsDateConfirm: result.needsDateConfirm, synced },
      billSummary: { voucherNumber: billLink.voucher_number, totalCheques: allCheques.length, totalChequeAmount: newTotal }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cheques/receipt-activity/pending-dates
 * Get all cheques needing date confirmation, grouped by bill
 */
router.get('/receipt-activity/pending-dates', (req, res) => {
  try {
    const cheques = db.getPendingDateConfirmations();

    const groupedByBill = {};
    for (const cheque of cheques) {
      const billLink = db.db.prepare('SELECT voucher_number, bill_amount FROM cheque_bill_payments WHERE cheque_id = ?').get(cheque.id);
      const vn = billLink?.voucher_number || 'Unknown';

      if (!groupedByBill[vn]) {
        groupedByBill[vn] = { voucherNumber: vn, billAmount: billLink?.bill_amount || 0, partyName: cheque.party_name, cheques: [] };
      }
      groupedByBill[vn].cheques.push({
        id: cheque.id, bankName: cheque.bank_name, amount: cheque.amount, receivedDate: cheque.received_date
      });
    }

    res.json({ success: true, totalPending: cheques.length, bills: Object.values(groupedByBill) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== CHEQUE TRACKING ====================

/**
 * POST /api/cheques
 * Create a new cheque entry
 * Supports rush-time entry where cheque date can be confirmed later
 * Auto-pushes to Cheque Management Company (ODBC CHq Mgmt)
 */
router.post('/', async (req, res) => {
  try {
    const {
      partyName,
      bankName,
      amount,
      chequeNumber,
      chequeDate,
      branch,
      narration,
      voucherNumber,
      billId,
      pushToTally = true
    } = req.body;

    // Validate required fields
    if (!partyName) {
      return res.status(400).json({ error: 'partyName is required' });
    }
    if (!bankName) {
      return res.status(400).json({ error: 'bankName is required' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    // Create cheque in local database
    const chequeResult = db.createCheque({
      partyName,
      bankName,
      amount,
      chequeNumber,
      chequeDate,
      branch,
      narration
    });

    const chequeId = chequeResult.id;

    // Link to bill if provided
    if (billId || voucherNumber) {
      db.linkChequeToBill(
        chequeId,
        billId || null,
        voucherNumber || null,
        amount,  // Will be updated when more info available
        amount
      );
    }

    // Push to Tally Cheque Management Company if cheque date is confirmed
    let tallyResult = { success: false, message: 'Waiting for date confirmation' };

    if (pushToTally && chequeDate) {
      try {
        const connectionStatus = await tallyConnector.checkConnection();
        if (connectionStatus.connected) {
          tallyResult = await tallyConnector.pushChequeToCompany({
            partyName,
            amount,
            bankName: 'Cheque in Hand',  // Ledger in Cheque Management Company
            chequeNumber: chequeNumber || '',
            chequeDate,
            narration: narration || `Cheque from ${partyName}`
          }, co().odbc);

          if (tallyResult.success) {
            db.markChequeSynced(chequeId, tallyResult.voucherId || null);
          } else {
            db.markChequeSynced(chequeId, null, tallyResult.error);
          }
        } else {
          tallyResult = { success: false, message: 'Tally not connected. Will sync later.' };
        }
      } catch (tallyError) {
        tallyResult = { success: false, error: tallyError.message };
        db.markChequeSynced(chequeId, null, tallyError.message);
      }
    }

    // Broadcast cheque created event
    const io = req.app.get('io');
    if (io) {
      io.emit('cheque:new', {
        chequeId,
        partyName,
        amount,
        needsDateConfirm: chequeResult.needsDateConfirm
      });
    }

    res.json({
      success: true,
      chequeId,
      needsDateConfirm: chequeResult.needsDateConfirm,
      syncedToTally: tallyResult.success,
      tallyMessage: tallyResult.message || tallyResult.error || null
    });
  } catch (error) {
    console.error('Error creating cheque:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cheques
 * Get all cheques with optional filters
 * Query params: status, partyName, fromDate, toDate, syncedToTally, limit
 */
router.get('/', (req, res) => {
  try {
    const { status, partyName, fromDate, toDate, syncedToTally, limit } = req.query;

    const cheques = db.getCheques({
      status,
      partyName,
      fromDate,
      toDate,
      syncedToTally: syncedToTally === 'true' ? true : (syncedToTally === 'false' ? false : undefined),
      limit: limit ? parseInt(limit) : undefined
    });

    res.json({
      success: true,
      count: cheques.length,
      cheques
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cheques/pending
 * Get pending cheques (not yet deposited)
 */
router.get('/pending', (req, res) => {
  try {
    const cheques = db.getPendingCheques();
    const total = cheques.reduce((sum, c) => sum + c.amount, 0);

    res.json({
      success: true,
      count: cheques.length,
      total,
      cheques
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cheques/due-today
 * Get cheques due for deposit today (cheque_date <= today)
 */
router.get('/due-today', (req, res) => {
  try {
    const cheques = db.getChequesDueForDeposit();
    const total = cheques.reduce((sum, c) => sum + c.amount, 0);

    res.json({
      success: true,
      count: cheques.length,
      total,
      cheques,
      message: cheques.length > 0 ? `${cheques.length} cheque(s) due for deposit` : 'No cheques due today'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cheques/needs-date
 * Get cheques pending date confirmation (rush-time entries)
 */
router.get('/needs-date', (req, res) => {
  try {
    const cheques = db.getPendingDateConfirmations();
    const total = cheques.reduce((sum, c) => sum + c.amount, 0);

    res.json({
      success: true,
      count: cheques.length,
      total,
      cheques,
      message: cheques.length > 0 ? `${cheques.length} cheque(s) need date confirmation` : 'All cheques have dates'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cheques/unsynced
 * Get cheques not yet synced to Tally
 */
router.get('/unsynced', (req, res) => {
  try {
    const cheques = db.getUnsyncedCheques();
    const total = cheques.reduce((sum, c) => sum + c.amount, 0);

    res.json({
      success: true,
      count: cheques.length,
      total,
      cheques
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cheques/summary
 * Get cheque tracking summary by status
 */
router.get('/summary', (req, res) => {
  try {
    const summary = db.getChequesSummary();

    // Convert to object format
    const result = {
      pending: { count: 0, amount: 0 },
      deposited: { count: 0, amount: 0 },
      cleared: { count: 0, amount: 0 },
      bounced: { count: 0, amount: 0 }
    };

    for (const row of summary) {
      if (result[row.status]) {
        result[row.status] = {
          count: row.count,
          amount: row.total_amount || 0
        };
      }
    }

    res.json({
      success: true,
      summary: result,
      totalPending: result.pending.amount + result.deposited.amount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CHEQUE RECONCILIATION ENDPOINTS
// Must be before /:id to avoid greedy matching
// ============================================

/**
 * Merge local cheques with ODBC cheques by party+amount+date
 */
function mergeCheques(localCheques, odbcCheques) {
  const merged = [];
  const matchedOdbc = new Set();

  for (const local of localCheques) {
    const localParty = (local.party_name || '').toLowerCase();
    const localAmt = parseFloat(local.amount) || 0;
    const localDate = local.cheque_date || '';

    let matchIdx = odbcCheques.findIndex((o, i) => {
      if (matchedOdbc.has(i)) return false;
      const odbcParty = (o.partyName || '').toLowerCase();
      const odbcAmt = parseFloat(o.amount) || 0;
      const odbcDate = o.chequeDate || o.voucherDate || '';
      return odbcParty === localParty && Math.abs(odbcAmt - localAmt) < 0.01 &&
        (localDate === odbcDate || !localDate || !odbcDate);
    });

    if (matchIdx >= 0) {
      matchedOdbc.add(matchIdx);
      merged.push({
        ...local,
        source: 'both',
        matchedInODBC: true,
        odbcVoucherNumber: odbcCheques[matchIdx].voucherNumber,
        odbcBankName: odbcCheques[matchIdx].bankName
      });
    } else {
      merged.push({ ...local, source: 'local', matchedInODBC: false });
    }
  }

  // Add ODBC-only entries
  odbcCheques.forEach((o, i) => {
    if (!matchedOdbc.has(i)) {
      merged.push({
        party_name: o.partyName,
        amount: o.amount,
        cheque_number: o.chequeNumber,
        cheque_date: o.chequeDate || o.voucherDate,
        bank_name: o.bankName,
        narration: o.narration,
        voucher_number: o.voucherNumber,
        master_id: o.masterId,
        alter_id: o.alterId,
        bill_allocations: o.billAllocations,
        source: 'odbc',
        matchedInLocal: false,
        status: 'unknown'
      });
    }
  });

  return merged;
}

/**
 * GET /api/cheques/reconciliation
 * Main reconciliation endpoint - returns everything the dashboard needs
 */
router.get('/reconciliation', async (req, res) => {
  try {
    let tallyConnected = false;
    let reconciliation = null;
    let odbcCheques = [];

    // Try fetching from Tally
    try {
      reconciliation = await tallyConnector.getChequeReconBalances(co().billing);
      if (reconciliation) tallyConnected = true;
    } catch (e) {
      console.log('Tally not connected for recon balances:', e.message);
    }

    try {
      if (tallyConnected) {
        odbcCheques = await tallyConnector.getODBCCheques(co().odbc);
        // Auto-save bank short names from bill allocations
        try {
          const bankShorts = [];
          for (const v of odbcCheques) {
            for (const ba of (v.billAllocations || [])) {
              const bn = ba.billName || '';
              if (bn.includes('/')) bankShorts.push(bn.substring(bn.indexOf('/') + 1).trim());
            }
          }
          if (bankShorts.length) db.ensureBankNames(bankShorts);
        } catch (e2) { /* non-fatal */ }
      }
    } catch (e) {
      console.log('Could not fetch ODBC cheques:', e.message);
    }

    // Always available from local DB
    const localCheques = db.getCheques({});
    const summary = db.getChequesSummary();

    const summaryObj = { pending: { count: 0, amount: 0 }, deposited: { count: 0, amount: 0 }, cleared: { count: 0, amount: 0 }, bounced: { count: 0, amount: 0 } };
    for (const row of summary) {
      if (summaryObj[row.status]) {
        summaryObj[row.status] = { count: row.count, amount: row.total_amount || 0 };
      }
    }

    const merged = mergeCheques(localCheques, odbcCheques);

    res.json({
      tallyConnected,
      reconciliation: reconciliation || { chequeReceipt: { name: 'Cheque Receipt', balance: 0 }, chequeManagement: { name: 'Cheque Management', balance: 0 }, counterSales: { name: 'Counter Sales', balance: 0, company: co().odbc }, pendingToPost: 0, mismatch: 0, isReconciled: true },
      odbcCheques,
      localCheques,
      summary: summaryObj,
      merged
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cheques/reconciliation/debug-ledgers
 * Lists all ledgers from a company for debugging ledger names
 */
router.get('/reconciliation/debug-ledgers', async (req, res) => {
  try {
    const company = req.query.company || co().odbc;
    const group = req.query.group || 'Sales Accounts';
    const ledgers = await tallyConnector.getLedgersFromCompany(group, company);
    // Also try fetching all groups
    const groups = ['Sales Accounts', 'Direct Incomes', 'Indirect Incomes', 'Current Liabilities', 'Current Assets'];
    const allResults = {};
    for (const g of groups) {
      try {
        const result = await tallyConnector.getLedgersFromCompany(g, company);
        if (result.length > 0) allResults[g] = result.map(l => ({ name: l.name, parent: l.parent, balance: l.closingBalance || l.balance }));
      } catch(e) {}
    }
    res.json({ company, requestedGroup: group, ledgers, allGroups: allResults });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cheques/reconciliation/balances
 * Lightweight - only fetches Cheque Receipt and Cheque Management balances
 */
router.get('/reconciliation/balances', async (req, res) => {
  try {
    const reconciliation = await tallyConnector.getChequeReconBalances(co().billing);
    if (!reconciliation) {
      return res.json({ tallyConnected: false, reconciliation: null });
    }
    res.json({ tallyConnected: true, reconciliation });
  } catch (error) {
    res.json({ tallyConnected: false, error: error.message });
  }
});

/**
 * GET /api/cheques/reconciliation/odbc-cheques
 * Gets ODBC vouchers from local DB (fast). Use POST sync-odbc to refresh from Tally.
 */
router.get('/reconciliation/odbc-cheques', async (req, res) => {
  try {
    const { fromDate, toDate, voucherType, search } = req.query;
    const cheques = db.getODBCVouchers({ fromDate, toDate, voucherType, search });
    const stats = db.getODBCVoucherStats();
    const types = db.getODBCVoucherTypes();
    res.json({ success: true, cheques, count: cheques.length, stats, types });
  } catch (error) {
    res.json({ success: false, cheques: [], error: error.message });
  }
});

/**
 * POST /api/cheques/sync-odbc
 * Sync ODBC company vouchers from Tally into local DB
 */
router.post('/sync-odbc', async (req, res) => {
  try {
    const vouchers = await tallyConnector.getODBCCheques(co().odbc);
    const count = db.upsertODBCVouchers(vouchers);
    const stats = db.getODBCVoucherStats();

    // Auto-save bank short names from bill allocations (format: chequeNum/bankShort)
    try {
      const bankShorts = [];
      for (const v of vouchers) {
        for (const ba of (v.billAllocations || [])) {
          const bn = ba.billName || '';
          if (bn.includes('/')) {
            const short = bn.substring(bn.indexOf('/') + 1).trim();
            if (short) bankShorts.push(short);
          }
        }
      }
      if (bankShorts.length) db.ensureBankNames(bankShorts);
    } catch (e) { /* non-fatal */ }

    // Sync outstanding bills using Tally's Bills Receivable report
    // This gives us BILLPARTY + BILLREF + BILLCL — the reliable source
    let outstandingCount = 0;
    try {
      const reportResults = await tallyConnector.getOutstandingBillsReport(co().odbc);
      outstandingCount = db.syncOutstandingBills(reportResults);
      console.log(`Synced ${outstandingCount} outstanding bills from Tally`);
    } catch (obErr) {
      console.warn('Failed to sync outstanding bills (non-fatal):', obErr.message);
    }

    res.json({ success: true, synced: count, outstandingBills: outstandingCount, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DEBUG: Raw Tally XML query for bill allocations (temporary)
router.get('/debug-bills-xml', async (req, res) => {
  try {
    const approach = req.query.approach || 'report';
    let xml;
    if (approach === 'report') {
      // Try Report export — should preserve ledger→bill hierarchy
      xml = `<ENVELOPE>
<HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
<BODY><EXPORTDATA>
<REQUESTDESC>
<REPORTNAME>Bills Receivable</REPORTNAME>
<STATICVARIABLES>
<SVCURRENTCOMPANY>${co().odbc}</SVCURRENTCOMPANY>
<EXPLODEFLAG>Yes</EXPLODEFLAG>
</STATICVARIABLES>
</REQUESTDESC>
</EXPORTDATA></BODY></ENVELOPE>`;
    } else if (approach === 'ledger-only') {
      // Ledger without BILLALLOCATIONS — should return LEDGER objects
      xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>LedgerBills</ID></HEADER>
<BODY><DESC>
<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
<SVCURRENTCOMPANY>${co().odbc}</SVCURRENTCOMPANY></STATICVARIABLES>
<TDL><TDLMESSAGE>
<COLLECTION NAME="LedgerBills" ISMODIFY="No">
<TYPE>Ledger</TYPE><CHILDOF>Sundry Debtors</CHILDOF><BELONGSTO>Yes</BELONGSTO>
<FETCH>NAME,CLOSINGBALANCE</FETCH>
<FILTER>HasBalance</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="HasBalance">NOT $$IsZero:$CLOSINGBALANCE</SYSTEM>
</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
    } else {
      // Sales voucher with explicit bill fields
      xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>SalesBills</ID></HEADER>
<BODY><DESC>
<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
<SVCURRENTCOMPANY>${co().odbc}</SVCURRENTCOMPANY></STATICVARIABLES>
<TDL><TDLMESSAGE>
<COLLECTION NAME="SalesBills" ISMODIFY="No">
<TYPE>Voucher</TYPE>
<FETCH>DATE,VOUCHERTYPENAME,PARTYLEDGERNAME,AMOUNT,ALLLEDGERENTRIES.LIST,ALLLEDGERENTRIES.LIST.BILLALLOCATIONS.LIST,ALLLEDGERENTRIES.LIST.BILLALLOCATIONS.LIST.NAME,ALLLEDGERENTRIES.LIST.BILLALLOCATIONS.LIST.BILLTYPE,ALLLEDGERENTRIES.LIST.BILLALLOCATIONS.LIST.AMOUNT</FETCH>
<FILTER>IsSales</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="IsSales">$$IsEqual:$VOUCHERTYPENAME:"Sales"</SYSTEM>
</TDLMESSAGE></TDL></DESC></BODY></ENVELOPE>`;
    }
    const rawXml = await tallyConnector.sendRawRequest(xml);
    const limit = parseInt(req.query.limit) || 5000;
    res.type('text/xml').send(rawXml.substring(0, limit));
  } catch (error) {
    res.status(500).send(error.message);
  }
});

// ============================================
// CHEQUE POST ENDPOINTS
// Fetch receipts from For DB, push to ODBC
// ============================================

/**
 * GET /api/cheques/cheque-post/receipts
 * Fetch cheque receipts from local database (bills with pay_cheque > 0)
 */
router.get('/cheque-post/receipts', (req, res) => {
  try {
    const { date } = req.query;
    const d = date || new Date().toISOString().split('T')[0].replace(/-/g, '');

    const rows = db.db.prepare(`
      SELECT party_name, voucher_type, voucher_number, tally_master_id,
        COALESCE(pay_cheque, 0) as cheque_amount, amount,
        voucher_date, narration
      FROM bills
      WHERE voucher_date = ? AND COALESCE(pay_cheque, 0) > 0
        AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY party_name, id
    `).all(d);

    // Group by party_name to combine multiple cheque receipts for same party
    const partyMap = {};
    for (const r of rows) {
      const key = r.party_name;
      if (!partyMap[key]) {
        partyMap[key] = {
          partyName: r.party_name,
          voucherType: r.voucher_type,
          voucherNumber: r.voucher_number,
          voucherDate: d,
          chequeReceiptAmount: 0,
          totalAmount: 0,
          masterId: r.tally_master_id || r.party_name,
          vouchers: []
        };
      }
      partyMap[key].chequeReceiptAmount += r.cheque_amount;
      partyMap[key].totalAmount += Math.abs(r.amount || 0);
      partyMap[key].vouchers.push({
        voucherNumber: r.voucher_number,
        voucherType: r.voucher_type,
        chequeAmount: r.cheque_amount,
        amount: r.amount
      });
    }

    const vouchers = Object.values(partyMap);
    res.json({ success: true, vouchers, date: d });
  } catch (error) {
    res.json({ success: false, vouchers: [], error: error.message });
  }
});

/**
 * GET /api/cheques/cheque-post/odbc-parties
 * Fetch party names (Sundry Debtors) from ODBC CHq Mgmt
 */
router.get('/cheque-post/odbc-parties', async (req, res) => {
  try {
    const parties = await tallyConnector.getLedgersFromCompany('Sundry Debtors', co().odbc);
    res.json({ success: true, parties: parties.map(p => ({ name: p.name, balance: p.balance })) });
  } catch (error) {
    res.json({ success: false, parties: [], error: error.message });
  }
});

/**
 * GET /api/cheques/cheque-post/odbc-banks
 * Fetch bank/cash ledger names from ODBC CHq Mgmt
 */
router.get('/cheque-post/odbc-banks', async (req, res) => {
  try {
    const banks = await tallyConnector.getLedgersFromCompany('Bank Accounts', co().odbc);
    const cash = await tallyConnector.getLedgersFromCompany('Cash-in-Hand', co().odbc);
    res.json({ success: true, banks: [...banks, ...cash].map(b => b.name) });
  } catch (error) {
    res.json({ success: false, banks: [], error: error.message });
  }
});

/**
 * POST /api/cheques/cheque-post/sync
 * Push cheque details as Sales Voucher to ODBC CHq Mgmt
 */
router.post('/cheque-post/sync', async (req, res) => {
  try {
    const { partyName, chequeLines, date, narration } = req.body;

    if (!partyName || !chequeLines || !chequeLines.length) {
      return res.status(400).json({ error: 'partyName and chequeLines are required' });
    }

    // Ensure all parties exist in ODBC company (main + overrides)
    const allParties = [partyName, ...chequeLines.map(l => l.partyOverride).filter(p => p && p.trim())];
    const uniqueParties = [...new Set(allParties)];
    for (const p of uniqueParties) {
      const exists = await tallyConnector.partyExistsInCompany(p, co().odbc);
      if (!exists) {
        return res.status(400).json({ error: `Party "${p}" not found in ${co().odbc}. Please select a valid party.` });
      }
    }

    const vchDate = date || new Date().toISOString().split('T')[0].replace(/-/g, '');
    // Auto-generate unique voucher number: date-seq/partyShortName
    const partyShort = partyName.split(',')[0].trim().substring(0, 20);
    const seq = String(Date.now()).slice(-4);
    const voucherNumber = `${vchDate}-${seq}/${partyShort}`;

    const result = await tallyConnector.createODBCSalesVoucher({
      partyName,
      chequeLines,
      date: vchDate,
      voucherNumber,
      narration: narration || `Cheque posting from Dashboard`
    }, co().odbc);

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cheques/cheque-post/sync-all
 * Sync multiple receipts to ODBC + create Journal in billing company
 * Body: { receipts: [{ partyName, chequeLines, ... }], date, billingCompany }
 */
router.post('/cheque-post/sync-all', async (req, res) => {
  try {
    const { receipts, date, billingCompany = co().billing } = req.body;

    if (!receipts || !receipts.length) {
      return res.status(400).json({ error: 'No receipts to sync' });
    }

    const vchDate = date || new Date().toISOString().split('T')[0].replace(/-/g, '');
    const odbcResults = [];
    let totalAmount = 0;
    let totalCheques = 0;
    const partyChequeCounts = {}; // { partyName: count }

    // Step 1: Push each receipt to ODBC CHq Mgmt
    for (const r of receipts) {
      try {
        // Validate all parties (main + overrides)
        const allPs = [r.partyName, ...(r.chequeLines || []).map(l => l.partyOverride).filter(p => p && p.trim())];
        const uniquePs = [...new Set(allPs)];
        let partyMissing = false;
        for (const p of uniquePs) {
          const exists = await tallyConnector.partyExistsInCompany(p, co().odbc);
          if (!exists) {
            odbcResults.push({ partyName: r.partyName, success: false, error: `Party "${p}" not found in ${co().odbc}` });
            partyMissing = true;
            break;
          }
        }
        if (partyMissing) continue;

        const partyShort = r.partyName.split(',')[0].trim().substring(0, 20);
        const seq = String(Date.now()).slice(-4);
        const voucherNumber = `${vchDate}-${seq}/${partyShort}`;

        // Build narration with account holder names (stored here since bill ref is chequeNum/bank only)
        const holders = r.chequeLines
          .map(l => l.accountHolderName).filter(Boolean)
          .filter((v, i, a) => a.indexOf(v) === i); // unique
        const narr = holders.length > 0
          ? `Cheque from ${holders.join(', ')}`
          : (r.narration || 'Cheque posting from Dashboard');

        const result = await tallyConnector.createODBCSalesVoucher({
          partyName: r.partyName,
          chequeLines: r.chequeLines,
          date: vchDate,
          voucherNumber,
          narration: narr
        }, co().odbc);

        const lineCount = r.chequeLines.length;
        const lineTotal = r.chequeLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);

        if (result.success) {
          totalAmount += lineTotal;
          totalCheques += lineCount;
          partyChequeCounts[r.partyName] = (partyChequeCounts[r.partyName] || 0) + lineCount;
        }

        odbcResults.push({ partyName: r.partyName, ...result, chequeCount: lineCount, amount: lineTotal });
      } catch (err) {
        odbcResults.push({ partyName: r.partyName, success: false, error: err.message });
      }
    }

    // Step 2: Create Journal in billing company (only if at least one ODBC push succeeded)
    let journalResult = null;
    const successCount = odbcResults.filter(r => r.success).length;
    if (successCount > 0 && totalAmount > 0) {
      // Build narration: "5 cheques - PartyA (3), PartyB (2)"
      const partyParts = Object.entries(partyChequeCounts)
        .map(([name, count]) => `${name.split(',')[0].trim()} (${count})`)
        .join(', ');
      const narration = `${totalCheques} cheques - ${partyParts}`;

      journalResult = await tallyConnector.createChequeJournal({
        totalAmount,
        chequeCount: totalCheques,
        narration,
        date: vchDate
      }, billingCompany);
    }

    const summary = {
      totalReceipts: receipts.length,
      successfulODBC: successCount,
      totalCheques,
      totalAmount,
      journalCreated: journalResult?.success || false
    };

    // Save audit log
    try {
      const masterIds = receipts.map(r => r.masterId).filter(Boolean);
      db.savePostLog({
        voucherDate: vchDate,
        totalAmount,
        totalCheques,
        totalParties: Object.keys(partyChequeCounts).length,
        journalVoucherNumber: journalResult?.voucherNumber || '',
        journalSuccess: journalResult?.success || false,
        masterIds,
        receipts: receipts.map(r => ({ partyName: r.partyName, odbcParty: r.odbcParty || r.partyName, chequeCount: r.chequeLines?.length, amount: r.chequeLines?.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0), chequeLines: (r.chequeLines || []).map(l => ({ chequeNumber: l.chequeNumber, bankName: l.bankName, accountHolderName: l.accountHolderName, chequeDate: l.chequeDate, amount: l.amount })) })),
        results: { odbcResults, journalResult, summary }
      });
    } catch (logErr) {
      console.error('Failed to save post log:', logErr);
    }

    res.json({ success: true, odbcResults, journalResult, summary });
  } catch (error) {
    console.error('Sync-all error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cheques/cheque-post/log
 * Audit log of all cheque postings
 */
router.get('/cheque-post/log', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    const logs = db.getPostLogs(limit, offset);
    const total = db.getPostLogCount();
    const stats = db.getPostLogStats();
    // Parse JSON fields
    const parsed = logs.map(l => ({
      ...l,
      master_ids: (() => { try { return JSON.parse(l.master_ids); } catch { return []; } })(),
      receipts: (() => { try { return JSON.parse(l.receipts_json); } catch { return []; } })(),
      results: (() => { try { return JSON.parse(l.results_json); } catch { return {}; } })()
    }));
    res.json({ logs: parsed, total, stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cheques/cheque-post/posted?date=YYYYMMDD
 * Returns list of already-posted masterIds for a given date
 */
router.get('/cheque-post/posted', (req, res) => {
  try {
    const date = req.query.date || '';
    const masterIds = db.getPostedMasterIds(date);
    res.json({ masterIds });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cheques/odbc-voucher/:masterId
 * Fetch ODBC voucher detail (bill allocations) from Tally by MASTERID
 */
router.get('/odbc-voucher/:masterId', async (req, res) => {
  try {
    const detail = await tallyConnector.getODBCVoucherDetail(req.params.masterId, co().odbc);
    if (!detail) {
      return res.status(404).json({ success: false, error: 'Voucher not found' });
    }
    res.json({ success: true, ...detail });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cheques/:id
 * Get single cheque by ID
 */
router.get('/:id', (req, res) => {
  try {
    const cheque = db.getChequeById(req.params.id);
    if (!cheque) {
      return res.status(404).json({ error: 'Cheque not found' });
    }

    res.json({
      success: true,
      cheque
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/cheques/:id/confirm-date
 * Confirm cheque date (for rush-time deferred entries)
 * Also triggers sync to Tally if not already synced
 */
router.put('/:id/confirm-date', async (req, res) => {
  try {
    const { chequeDate, chequeNumber, userId } = req.body;

    if (!chequeDate) {
      return res.status(400).json({ error: 'chequeDate is required (YYYYMMDD format)' });
    }

    const chequeId = parseInt(req.params.id);
    const cheque = db.getChequeById(chequeId);

    if (!cheque) {
      return res.status(404).json({ error: 'Cheque not found' });
    }

    // Confirm the date
    const updatedCheque = db.confirmChequeDate(chequeId, chequeDate, chequeNumber, userId);

    // Try to push to Tally if not already synced
    let tallyResult = { success: false };
    if (!cheque.synced_to_tally) {
      try {
        const connectionStatus = await tallyConnector.checkConnection();
        if (connectionStatus.connected) {
          tallyResult = await tallyConnector.pushChequeToCompany({
            partyName: updatedCheque.party_name,
            amount: updatedCheque.amount,
            bankName: 'Cheque in Hand',
            chequeNumber: updatedCheque.cheque_number || '',
            chequeDate: chequeDate,
            narration: updatedCheque.narration || `Cheque from ${updatedCheque.party_name}`
          }, co().odbc);

          if (tallyResult.success) {
            db.markChequeSynced(chequeId, tallyResult.voucherId || null);
          }
        }
      } catch (tallyError) {
        console.error('Error syncing cheque to Tally:', tallyError);
      }
    }

    // Broadcast update
    const io = req.app.get('io');
    if (io) {
      io.emit('cheque:dateConfirmed', {
        chequeId,
        chequeDate,
        partyName: updatedCheque.party_name
      });
    }

    res.json({
      success: true,
      message: 'Cheque date confirmed',
      cheque: updatedCheque,
      syncedToTally: tallyResult.success
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/cheques/:id/status
 * Update cheque status (pending → deposited → cleared/bounced)
 */
router.put('/:id/status', (req, res) => {
  try {
    const { status, depositDate, clearDate, bounceDate, bounceReason } = req.body;
    const validStatuses = ['pending', 'deposited', 'cleared', 'bounced'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Valid status is required (pending, deposited, cleared, bounced)' });
    }

    const chequeId = parseInt(req.params.id);
    const cheque = db.getChequeById(chequeId);

    if (!cheque) {
      return res.status(404).json({ error: 'Cheque not found' });
    }

    db.updateChequeStatus(chequeId, status, {
      depositDate,
      clearDate,
      bounceDate,
      bounceReason
    });

    // Broadcast status change
    const io = req.app.get('io');
    if (io) {
      io.emit('cheque:statusChanged', {
        chequeId,
        oldStatus: cheque.status,
        newStatus: status,
        partyName: cheque.party_name,
        amount: cheque.amount
      });
    }

    res.json({
      success: true,
      message: `Cheque status updated to ${status}`,
      chequeId,
      newStatus: status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/cheques/sync-pending
 * Sync all unsynced cheques to Tally Cheque Management Company
 */
router.post('/sync-pending', async (req, res) => {
  try {
    // Check Tally connection
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Cannot sync cheques.'
      });
    }

    const unsyncedCheques = db.getUnsyncedCheques();
    if (unsyncedCheques.length === 0) {
      return res.json({
        success: true,
        message: 'No cheques to sync',
        synced: 0,
        failed: 0
      });
    }

    let synced = 0;
    let failed = 0;
    const errors = [];

    for (const cheque of unsyncedCheques) {
      try {
        const result = await tallyConnector.pushChequeToCompany({
          partyName: cheque.party_name,
          amount: cheque.amount,
          bankName: 'Cheque in Hand',
          chequeNumber: cheque.cheque_number || '',
          chequeDate: cheque.cheque_date,
          narration: cheque.narration || `Cheque from ${cheque.party_name}`
        }, co().odbc);

        if (result.success) {
          db.markChequeSynced(cheque.id, result.voucherId || null);
          synced++;
        } else {
          db.markChequeSynced(cheque.id, null, result.error);
          failed++;
          errors.push({ chequeId: cheque.id, error: result.error });
        }
      } catch (err) {
        failed++;
        errors.push({ chequeId: cheque.id, error: err.message });
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
 * GET /api/cheques/party/:partyName
 * Get cheque summary for a specific customer
 */
router.get('/party/:partyName', (req, res) => {
  try {
    const partyName = decodeURIComponent(req.params.partyName);
    const result = db.getCustomerChequeSummary(partyName);

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/cheques/bill/:voucherNumber
 * Get all cheques linked to a specific bill/voucher
 */
router.get('/bill/:voucherNumber', (req, res) => {
  try {
    const voucherNumber = decodeURIComponent(req.params.voucherNumber);
    const cheques = db.getChequesForVoucher(voucherNumber);
    const total = cheques.reduce((sum, c) => sum + c.cheque_amount, 0);

    res.json({
      success: true,
      voucherNumber,
      count: cheques.length,
      totalChequeAmount: total,
      cheques
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
