/**
 * Cheques Routes
 * Cheque tracking and management with ODBC CHq Mgmt company integration
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

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
          }, 'ODBC CHq Mgmt');

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
        }, 'ODBC CHq Mgmt');

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
          }, 'ODBC CHq Mgmt');
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
          }, 'ODBC CHq Mgmt');

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
          }, 'ODBC CHq Mgmt');

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
        }, 'ODBC CHq Mgmt');

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
