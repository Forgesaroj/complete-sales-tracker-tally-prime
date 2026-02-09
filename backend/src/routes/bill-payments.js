/**
 * Bill Payments Routes
 * Multi-mode payment management for bills
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * POST /api/bill-payments
 * Create or update multi-mode payment for a bill
 * Supports: cash, QR, cheque(s), discount, esewa, bank deposit
 */
router.post('/', async (req, res) => {
  try {
    const {
      voucherNumber,
      partyName,
      billAmount,
      billId,
      cashAmount,
      qrAmount,
      chequeTotal,
      discount,
      esewaAmount,
      bankDeposit,
      notes,
      cheques
    } = req.body;

    if (!voucherNumber) {
      return res.status(400).json({ error: 'voucherNumber is required' });
    }
    if (!partyName) {
      return res.status(400).json({ error: 'partyName is required' });
    }
    if (!billAmount || billAmount <= 0) {
      return res.status(400).json({ error: 'Valid billAmount is required' });
    }

    // Create cheques if provided
    let actualChequeTotal = chequeTotal || 0;
    const createdCheques = [];

    if (cheques && Array.isArray(cheques) && cheques.length > 0) {
      actualChequeTotal = 0;

      for (const cheque of cheques) {
        const chequeResult = db.createCheque({
          partyName,
          bankName: cheque.bankName,
          amount: cheque.amount,
          chequeNumber: cheque.chequeNumber,
          chequeDate: cheque.chequeDate,
          narration: `For bill ${voucherNumber}`
        });

        // Link cheque to bill
        db.linkChequeToBill(
          chequeResult.id,
          billId || null,
          voucherNumber,
          billAmount,
          cheque.amount
        );

        actualChequeTotal += cheque.amount;
        createdCheques.push({
          id: chequeResult.id,
          amount: cheque.amount,
          needsDateConfirm: chequeResult.needsDateConfirm
        });

        // Try to sync to Tally if cheque has date
        if (cheque.chequeDate) {
          try {
            const connectionStatus = await tallyConnector.checkConnection();
            if (connectionStatus.connected) {
              const tallyResult = await tallyConnector.pushChequeToCompany({
                partyName,
                amount: cheque.amount,
                bankName: 'Cheque in Hand',
                chequeNumber: cheque.chequeNumber || '',
                chequeDate: cheque.chequeDate,
                narration: `For bill ${voucherNumber}`
              }, 'ODBC CHq Mgmt');

              if (tallyResult.success) {
                db.markChequeSynced(chequeResult.id, tallyResult.voucherId);
              }
            }
          } catch (tallyError) {
            console.error('Error syncing cheque:', tallyError);
          }
        }
      }
    }

    // Create/update bill payment record
    db.upsertBillPayment({
      billId,
      voucherNumber,
      partyName,
      billAmount,
      cashAmount: cashAmount || 0,
      qrAmount: qrAmount || 0,
      chequeTotal: actualChequeTotal,
      discount: discount || 0,
      esewaAmount: esewaAmount || 0,
      bankDeposit: bankDeposit || 0,
      notes
    });

    // Auto-link Fonepay transaction if QR amount is specified
    let fonepayMatch = null;
    if (qrAmount && qrAmount > 0) {
      const billDate = req.body.billDate || new Date().toISOString().split('T')[0];
      const companyName = req.body.companyName || 'FOR DB';

      // Try to find matching Fonepay transaction
      const matchingTxn = db.findMatchingFonepayTransaction(qrAmount, new Date().toISOString().split('T')[0]);

      if (matchingTxn) {
        // Link to bill with display: "CompanyName | BillNo | BillDate"
        db.linkFonepayToBill(matchingTxn.transaction_id, {
          voucherNumber,
          partyName,
          companyName,
          billDate
        });

        fonepayMatch = {
          matched: true,
          transactionId: matchingTxn.transaction_id,
          amount: matchingTxn.amount,
          transactionDate: matchingTxn.transaction_date,
          issuer: matchingTxn.issuer_name,
          displayDescription: `${companyName} | ${voucherNumber} | ${billDate}`
        };

        console.log(`[Bill Payment] Auto-linked Fonepay txn ${matchingTxn.transaction_id} to bill ${voucherNumber}`);
      } else {
        fonepayMatch = {
          matched: false,
          message: `No matching Fonepay transaction found for Rs. ${qrAmount}`
        };
      }
    }

    // Get updated payment record
    const payment = db.getBillPayment(voucherNumber);

    // Broadcast update
    const io = req.app.get('io');
    if (io) {
      io.emit('payment:recorded', {
        voucherNumber,
        partyName,
        totalPaid: payment.total_paid,
        balanceDue: payment.balance_due,
        status: payment.payment_status
      });
    }

    res.json({
      success: true,
      message: payment.payment_status === 'paid' ? 'Bill fully paid' : 'Payment recorded',
      payment,
      createdCheques: createdCheques.length > 0 ? createdCheques : undefined,
      fonepay: fonepayMatch
    });
  } catch (error) {
    console.error('Error creating bill payment:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bill-payments/:voucherNumber
 * Get payment details for a bill including linked cheques
 */
router.get('/:voucherNumber', (req, res) => {
  try {
    const voucherNumber = decodeURIComponent(req.params.voucherNumber);
    const payment = db.getBillPayment(voucherNumber);

    if (!payment) {
      return res.status(404).json({ error: 'Payment record not found' });
    }

    // Get linked Fonepay transactions
    const fonepayTxns = db.getFonepayForBill(voucherNumber);

    res.json({
      success: true,
      payment,
      fonepayTransactions: fonepayTxns
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bill-payments/partial
 * Get all bills with partial payments (balance due > 0)
 */
router.get('/partial', (req, res) => {
  try {
    const payments = db.getPartialPayments();

    res.json({
      success: true,
      count: payments.length,
      payments
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
