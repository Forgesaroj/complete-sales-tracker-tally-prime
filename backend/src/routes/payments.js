/**
 * Payments Routes
 * Simple payment/receipt CRUD operations
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';
import config from '../config/default.js';

const router = Router();

/**
 * POST /api/payments
 * Create payment (receipt) - syncs to Tally
 */
router.post('/', async (req, res) => {
  try {
    const { billId, amount, paymentMode, userId } = req.body;

    // Validate
    if (!billId || !amount) {
      return res.status(400).json({ error: 'billId and amount are required' });
    }

    const bill = db.getBillById(billId);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Create receipt in dashboard database first
    const receiptResult = db.createReceipt({
      billId,
      amount,
      paymentMode: paymentMode || 'Cash',
      createdBy: userId || 1,
      syncedToTally: false
    });

    const receiptId = receiptResult.lastInsertRowid;

    // Post receipt to Tally
    const tallyResult = await tallyConnector.createReceipt({
      partyName: bill.party_name,
      amount: amount,
      paymentMode: paymentMode || 'Cash',
      billNumber: bill.voucher_number,
      narration: `Payment for ${bill.voucher_number} via Dashboard`
    });

    if (tallyResult.success) {
      // Update receipt sync status
      db.updateReceiptSync(receiptId, tallyResult.guid || null, true);

      // Update bill payment status
      const totalReceived = (bill.amount_received || 0) + amount;
      const newStatus = totalReceived >= bill.amount ? 'paid' : 'partial';
      db.updateBillPaymentStatus(billId, newStatus, totalReceived);

      // Broadcast update
      const io = req.app.get('io');
      if (io) {
        io.emit('payment:recorded', {
          billId,
          amount,
          newStatus,
          voucherNumber: bill.voucher_number,
          partyName: bill.party_name
        });
      }

      res.json({
        success: true,
        receiptId,
        syncedToTally: true,
        billStatus: newStatus
      });
    } else {
      // Tally sync failed - keep in queue for retry
      db.updateReceiptSync(receiptId, null, false, tallyResult.error);

      res.status(500).json({
        success: false,
        error: 'Failed to sync with Tally',
        details: tallyResult.error,
        receiptId
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/payments
 * Get payment history
 */
router.get('/', (req, res) => {
  try {
    const { billId } = req.query;

    if (billId) {
      const receipts = db.getReceiptsByBill(billId);
      return res.json(receipts);
    }

    // Get today's receipts
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const bills = db.getBillsByDate(today).filter(b =>
      config.voucherTypes.receipt.includes(b.voucher_type)
    );
    res.json(bills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
