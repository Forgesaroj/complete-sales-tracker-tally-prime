/**
 * Receipts Routes
 * Receipt creation and pending sales bills management
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * POST /api/receipt
 * Create Receipt voucher in Tally with multiple payment modes
 *
 * Payment Modes (Ledger Names):
 *   - cashTeller1: Cash Teller 1
 *   - cashTeller2: Cash Teller 2
 *   - chequeReceipt: Cheque receipt
 *   - qrCode: Q/R code
 *   - discount: Discount
 *   - bankDeposit: Bank Deposit(All)
 *   - esewa: Esewa
 *
 * Body: { partyName, voucherType, narration, paymentModes: { cashTeller1, cashTeller2, chequeReceipt, qrCode, discount, bankDeposit, esewa } }
 */
router.post('/', async (req, res) => {
  try {
    const { partyName, voucherType, narration, paymentModes, date, company } = req.body;

    if (!partyName) {
      return res.status(400).json({ error: 'partyName is required' });
    }

    // Calculate total from payment modes
    const total =
      (parseFloat(paymentModes?.cashTeller1) || 0) +
      (parseFloat(paymentModes?.cashTeller2) || 0) +
      (parseFloat(paymentModes?.chequeReceipt) || 0) +
      (parseFloat(paymentModes?.qrCode) || 0) +
      (parseFloat(paymentModes?.discount) || 0) +
      (parseFloat(paymentModes?.bankDeposit) || 0) +
      (parseFloat(paymentModes?.esewa) || 0);

    if (total <= 0) {
      return res.status(400).json({ error: 'At least one payment mode must have a value' });
    }

    console.log('=== CREATE RECEIPT REQUEST ===');
    console.log('Party:', partyName);
    console.log('Payment Breakdown:');
    console.log('  Cash Teller 1:', paymentModes?.cashTeller1 || 0);
    console.log('  Cash Teller 2:', paymentModes?.cashTeller2 || 0);
    console.log('  Cheque receipt:', paymentModes?.chequeReceipt || 0);
    console.log('  Q/R code:', paymentModes?.qrCode || 0);
    console.log('  Discount:', paymentModes?.discount || 0);
    console.log('  Bank Deposit(All):', paymentModes?.bankDeposit || 0);
    console.log('  Esewa:', paymentModes?.esewa || 0);
    console.log('  Total:', total);

    // Check if Tally is connected
    const connectionStatus = await tallyConnector.checkConnection();

    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Receipt creation requires Tally to be online.'
      });
    }

    const result = await tallyConnector.createReceiptWithPaymentModes({
      partyName,
      voucherType: voucherType || 'Receipt',
      narration: narration || 'Receipt via Dashboard',
      paymentModes: paymentModes || {},
      date,
      company: company || null
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Receipt created successfully in Tally',
        total,
        created: result.created,
        paymentBreakdown: {
          cashTeller1: parseFloat(paymentModes?.cashTeller1) || 0,
          cashTeller2: parseFloat(paymentModes?.cashTeller2) || 0,
          chequeReceipt: parseFloat(paymentModes?.chequeReceipt) || 0,
          qrCode: parseFloat(paymentModes?.qrCode) || 0,
          discount: parseFloat(paymentModes?.discount) || 0,
          bankDeposit: parseFloat(paymentModes?.bankDeposit) || 0,
          esewa: parseFloat(paymentModes?.esewa) || 0
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to create receipt'
      });
    }
  } catch (error) {
    console.error('Receipt creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/receipt/voucher-types
 * Get available voucher types for the dropdown
 */
router.get('/voucher-types', (req, res) => {
  res.json({
    success: true,
    voucherTypes: [
      { value: 'Sales', label: 'Sales' },
      { value: 'Credit Sales', label: 'Credit Sales' },
      { value: 'Pending Sales Bill', label: 'Pending Sales Bill' },
      { value: 'Receipt', label: 'Receipt' },
      { value: 'Payment', label: 'Payment' },
      { value: 'Journal', label: 'Journal' },
      { value: 'Contra', label: 'Contra' }
    ]
  });
});

/**
 * GET /api/receipt/parties?q=search&company=billing|odbc|both
 * Search parties by company for receipt creation
 * company=both merges billing + ODBC, deduplicates by name
 */
router.get('/parties', (req, res) => {
  try {
    const { q, company } = req.query;
    if (!q || q.length < 1) return res.json({ success: true, parties: [] });

    let parties;
    if (company === 'both') {
      // Search both companies, deduplicate
      const billing = db.searchParties(q, 50);
      const odbc = db.db.prepare(
        `SELECT DISTINCT party_name as name FROM odbc_vouchers
         WHERE party_name LIKE ? AND party_name != ''
         ORDER BY party_name LIMIT 50`
      ).all(`%${q}%`);
      const seen = new Set();
      parties = [];
      for (const p of [...billing, ...odbc]) {
        const key = p.name.toLowerCase();
        if (!seen.has(key)) { seen.add(key); parties.push(p); }
      }
      parties = parties.slice(0, 30);
    } else if (company === 'odbc') {
      // ODBC parties from odbc_vouchers (no separate parties table)
      parties = db.db.prepare(
        `SELECT DISTINCT party_name as name FROM odbc_vouchers
         WHERE party_name LIKE ? AND party_name != ''
         ORDER BY party_name LIMIT 30`
      ).all(`%${q}%`);
    } else {
      // Billing parties from parties table
      parties = db.searchParties(q, 30);
    }
    res.json({ success: true, parties });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== PENDING SALES BILLS (RECEIPT WORKFLOW) ====================

/**
 * GET /api/receipt/pending-sales-bills
 * Get all Pending Sales Bills from Tally (waiting for payment confirmation)
 */
router.get('/pending-sales-bills', async (req, res) => {
  try {
    // Check if Tally is connected
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Cannot fetch pending bills.'
      });
    }

    const bills = await tallyConnector.getPendingSalesBills();
    res.json({
      success: true,
      count: bills.length,
      bills
    });
  } catch (error) {
    console.error('Error fetching pending sales bills:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/receipt/voucher/:masterId/complete-payment
 * Complete payment for a Pending Sales Bill
 */
router.put('/voucher/:masterId/complete-payment', async (req, res) => {
  try {
    const { masterId } = req.params;
    const {
      paymentModes,
      newVoucherType,
      billAmount,
      voucherNumber,
      originalVoucherType = 'Pending Sales Bill'
    } = req.body;

    if (!masterId) {
      return res.status(400).json({ error: 'masterId is required' });
    }

    // Calculate total from payment modes
    const total =
      (parseFloat(paymentModes?.cashTeller1) || 0) +
      (parseFloat(paymentModes?.cashTeller2) || 0) +
      (parseFloat(paymentModes?.chequeReceipt) || 0) +
      (parseFloat(paymentModes?.qrCode) || 0) +
      (parseFloat(paymentModes?.discount) || 0) +
      (parseFloat(paymentModes?.bankDeposit) || 0) +
      (parseFloat(paymentModes?.esewa) || 0);

    if (total <= 0) {
      return res.status(400).json({ error: 'At least one payment mode must have a value' });
    }

    // Determine voucher type based on payment vs bill amount
    let finalVoucherType = newVoucherType;
    if (!finalVoucherType && billAmount) {
      finalVoucherType = total >= billAmount ? 'Sales' : 'Credit Sales';
    }
    finalVoucherType = finalVoucherType || 'Sales';

    // Check if Tally is connected
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Cannot update voucher.'
      });
    }

    console.log(`=== COMPLETE PAYMENT REQUEST ===`);
    console.log(`Voucher: ${voucherNumber || masterId}`);
    console.log(`MasterID: ${masterId}`);
    console.log(`Bill Amount: ${billAmount || 'N/A'}`);
    console.log(`Total Payment: ${total}`);
    console.log(`Type Change: ${originalVoucherType} -> ${finalVoucherType}`);

    const result = await tallyConnector.alterVoucherWithPayment({
      masterId,
      voucherNumber,
      newVoucherType: finalVoucherType,
      originalVoucherType,
      paymentModes: paymentModes || {}
    });

    if (result.success) {
      res.json({
        success: true,
        message: `Voucher updated to ${finalVoucherType} with payment UDF fields (SFL1-SFL7)`,
        total,
        newVoucherType: finalVoucherType,
        altered: result.altered || 1,
        paymentBreakdown: {
          cashTeller1: parseFloat(paymentModes?.cashTeller1) || 0,
          cashTeller2: parseFloat(paymentModes?.cashTeller2) || 0,
          chequeReceipt: parseFloat(paymentModes?.chequeReceipt) || 0,
          qrCode: parseFloat(paymentModes?.qrCode) || 0,
          discount: parseFloat(paymentModes?.discount) || 0,
          bankDeposit: parseFloat(paymentModes?.bankDeposit) || 0,
          esewa: parseFloat(paymentModes?.esewa) || 0
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to update voucher'
      });
    }
  } catch (error) {
    console.error('Error completing payment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/receipt/pending-sales-bills/:masterId/complete
 * Complete payment on a Pending Sales Bill - EDIT ONLY (no deletion)
 */
router.post('/pending-sales-bills/:masterId/complete', async (req, res) => {
  try {
    const { masterId } = req.params;
    const {
      partyName,
      amount,
      date,
      voucherNumber,
      guid,
      paymentModes
    } = req.body;

    if (!masterId) {
      return res.status(400).json({ error: 'masterId is required' });
    }

    if (!partyName) {
      return res.status(400).json({ error: 'partyName is required' });
    }

    // Calculate total from payment modes
    const total =
      (parseFloat(paymentModes?.cashTeller1) || 0) +
      (parseFloat(paymentModes?.cashTeller2) || 0) +
      (parseFloat(paymentModes?.chequeReceipt) || 0) +
      (parseFloat(paymentModes?.qrCode) || 0) +
      (parseFloat(paymentModes?.discount) || 0) +
      (parseFloat(paymentModes?.bankDeposit) || 0) +
      (parseFloat(paymentModes?.esewa) || 0);

    if (total <= 0) {
      return res.status(400).json({ error: 'At least one payment mode must have a value' });
    }

    // Determine voucher type based on payment vs bill amount
    const billAmount = parseFloat(amount) || 0;
    const newVoucherType = total >= billAmount ? 'Sales' : 'Credit Sales';

    // Check if Tally is connected
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Cannot complete payment.'
      });
    }

    console.log(`=== COMPLETE PAYMENT (NEW METHOD) ===`);
    console.log(`Voucher: ${voucherNumber}`);
    console.log(`MasterID: ${masterId}`);
    console.log(`Party: ${partyName}`);
    console.log(`Bill Amount: ${billAmount}`);
    console.log(`Total Payment: ${total}`);
    console.log(`New Voucher Type: ${newVoucherType}`);

    const result = await tallyConnector.completePaymentOnBill({
      masterId,
      guid,
      date,
      voucherNumber,
      partyName,
      amount: billAmount,
      newVoucherType,
      paymentModes: paymentModes || {}
    });

    if (result.success) {
      res.json({
        success: true,
        message: `Bill updated to ${newVoucherType} with payment UDF fields (no deletion)`,
        total,
        newVoucherType,
        paymentBreakdown: {
          cashTeller1: parseFloat(paymentModes?.cashTeller1) || 0,
          cashTeller2: parseFloat(paymentModes?.cashTeller2) || 0,
          chequeReceipt: parseFloat(paymentModes?.chequeReceipt) || 0,
          qrCode: parseFloat(paymentModes?.qrCode) || 0,
          discount: parseFloat(paymentModes?.discount) || 0,
          bankDeposit: parseFloat(paymentModes?.bankDeposit) || 0,
          esewa: parseFloat(paymentModes?.esewa) || 0
        }
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to update bill with payment'
      });
    }
  } catch (error) {
    console.error('Error updating bill with payment:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
