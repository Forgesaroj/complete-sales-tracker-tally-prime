/**
 * Collection Routes
 * Cheque collection management — assign cheques to staff, track results, create Tally receipts
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

function co() { return db.getCompanyNames(); }

// ==================== STAFF ====================

router.get('/staff', (req, res) => {
  try {
    const activeOnly = req.query.active !== '0';
    const staff = db.getCollectionStaff(activeOnly);
    res.json({ success: true, staff });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/staff', (req, res) => {
  try {
    const { name, phone, tallyLedgerName } = req.body;
    if (!name || !tallyLedgerName) return res.status(400).json({ success: false, error: 'Name and Tally ledger name required' });
    const result = db.createCollectionStaff({ name, phone, tallyLedgerName });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/staff/:id', (req, res) => {
  try {
    db.updateCollectionStaff(parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/staff/:id', (req, res) => {
  try {
    db.deactivateCollectionStaff(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/staff/:id/history', (req, res) => {
  try {
    const batches = db.getCollectionBatches({ staffId: parseInt(req.params.id) });
    const stats = db.getCollectionStats(parseInt(req.params.id));
    res.json({ success: true, batches, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== BATCHES ====================

router.get('/batches', (req, res) => {
  try {
    const { status, staffId, fromDate, toDate } = req.query;
    const batches = db.getCollectionBatches({ status, staffId: staffId ? parseInt(staffId) : null, fromDate, toDate });
    res.json({ success: true, batches });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/batches', (req, res) => {
  try {
    const { staffId, chequeIds } = req.body;
    if (!staffId || !chequeIds || !chequeIds.length) return res.status(400).json({ success: false, error: 'Staff ID and cheque IDs required' });
    const result = db.createCollectionBatch(parseInt(staffId), chequeIds.map(Number));
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/batches/:id', (req, res) => {
  try {
    const batch = db.getCollectionBatchById(parseInt(req.params.id));
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
    const items = db.getCollectionBatchItems(batch.id);
    res.json({ success: true, batch, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/batches/:id/print', (req, res) => {
  try {
    const batch = db.getCollectionBatchById(parseInt(req.params.id));
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
    const items = db.getCollectionBatchItems(batch.id);
    const staff = db.getCollectionStaffById(batch.staff_id);
    res.json({ success: true, batch, items, staff, printedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/batches/:id/items/:itemId', (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'Status required' });
    db.updateBatchItemStatus(parseInt(req.params.itemId), status, notes || '');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/batches/:id/bulk-update', (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates || !updates.length) return res.status(400).json({ success: false, error: 'Updates required' });
    db.bulkUpdateBatchItems(parseInt(req.params.id), updates);
    const batch = db.getCollectionBatchById(parseInt(req.params.id));
    const items = db.getCollectionBatchItems(batch.id);
    res.json({ success: true, batch, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/batches/:id/complete', (req, res) => {
  try {
    db.completeBatch(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/batches/:id/create-receipt', async (req, res) => {
  try {
    const batchId = parseInt(req.params.id);
    const batch = db.getCollectionBatchById(batchId);
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });

    const items = db.getCollectionBatchItems(batchId);
    const collectedItems = items.filter(i => i.status === 'collected');
    if (collectedItems.length === 0) return res.status(400).json({ success: false, error: 'No collected cheques to receipt' });

    const receiptData = {
      staffLedger: batch.tally_ledger_name,
      collectedItems: collectedItems.map(i => ({
        partyName: i.party_name,
        amount: i.amount,
        chequeNumber: i.cheque_number,
        chequeDate: i.cheque_date,
        bankName: i.bank_name,
        billRef: i.bill_ref
      })),
      date: batch.assigned_date,
      narration: `Collection batch #${batchId} by ${batch.staff_name} - ${collectedItems.length} cheques`
    };

    const result = await tallyConnector.pushCollectionReceipt(receiptData, co().odbc);

    if (result.success) {
      db.completeBatch(batchId);
      db.markBatchTallySynced(batchId, result.voucherId || '', null);
      res.json({ success: true, tallyResult: result });
    } else {
      db.markBatchTallySynced(batchId, '', result.error || 'Failed');
      res.json({ success: false, error: result.error || 'Tally receipt creation failed', tallyResult: result });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== DATA ====================

router.get('/assignable-cheques', (req, res) => {
  try {
    const cheques = db.getAssignableCheques();
    res.json({ success: true, cheques, count: cheques.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CHEQUE RECEIVABLE (from ODBC Tally) ====================

router.get('/cheque-receivable', async (req, res) => {
  try {
    const receivable = await tallyConnector.getODBCChequeReceivable(co().odbc);
    res.json({ success: true, receivable, count: receivable.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Also provide a local-DB version: extract individual cheques from synced ODBC Sales vouchers
router.get('/cheque-receivable/local', (req, res) => {
  try {
    const { fromDate, toDate, party } = req.query;
    const cheques = db.getODBCChequeReceivable(fromDate, toDate, party);
    res.json({ success: true, cheques, count: cheques.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const staffId = req.query.staffId ? parseInt(req.query.staffId) : null;
    const stats = db.getCollectionStats(staffId);
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
