/**
 * Columnar Dashboard Routes
 * Party-grouped bills with payment mode breakdown
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';

const router = Router();

/**
 * GET /api/columnar
 * Get party-grouped bills with payment breakdown columns
 */
router.get('/', (req, res) => {
  try {
    const { date, search } = req.query;

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const d = date || today;

    const allBills = db.getColumnarBills(d, search || '');

    // Separate confirmed bills (have bill_amount) from pending-only entries
    const bills = allBills.filter(r => r.bill_amount > 0 || r.total_paid > 0);
    const pendingBills = allBills.filter(r => r.pending_amount > 0);

    // Totals only from confirmed bills (exclude pending)
    const totals = bills.reduce((acc, row) => ({
      bill_amount: acc.bill_amount + (row.bill_amount || 0),
      cash: acc.cash + (row.cash || 0),
      qr: acc.qr + (row.qr || 0),
      cheque: acc.cheque + (row.cheque || 0),
      discount: acc.discount + (row.discount || 0),
      esewa: acc.esewa + (row.esewa || 0),
      bank_deposit: acc.bank_deposit + (row.bank_deposit || 0),
      total_paid: acc.total_paid + (row.total_paid || 0),
      balance: acc.balance + (row.balance || 0)
    }), { bill_amount: 0, cash: 0, qr: 0, cheque: 0, discount: 0, esewa: 0, bank_deposit: 0, total_paid: 0, balance: 0 });

    const pendingTotal = pendingBills.reduce((s, r) => s + (r.pending_amount || 0), 0);

    // Voucher type counts across all parties
    const voucherCounts = allBills.reduce((acc, r) => ({
      total: acc.total + (r.bill_count || 0) + (r.pending_count || 0) + (r.receipt_count || 0),
      sales: acc.sales + (r.sales_count || 0),
      credit_sales: acc.credit_sales + (r.credit_sales_count || 0),
      apto: acc.apto + (r.apto_count || 0),
      pending: acc.pending + (r.pending_count || 0),
      debit_note: acc.debit_note + (r.debit_note_count || 0),
      receipt: acc.receipt + (r.receipt_only_count || 0),
      credit_note: acc.credit_note + (r.credit_note_count || 0)
    }), { total: 0, sales: 0, credit_sales: 0, apto: 0, pending: 0, debit_note: 0, receipt: 0, credit_note: 0 });

    // Get alterations: field-level changes made AFTER the voucher date
    const alterations = db.getColumnarAlterations(d);

    res.json({
      date: d,
      bills,
      pendingBills,
      count: bills.length,
      pendingCount: pendingBills.length,
      pendingTotal,
      totals,
      voucherCounts,
      alterations
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/columnar/details
 * Get individual vouchers for a party on a specific date
 */
router.get('/details', (req, res) => {
  try {
    const { date, party } = req.query;
    if (!date || !party) {
      return res.status(400).json({ error: 'date and party params required' });
    }
    const rows = db.db.prepare(`
      SELECT id, tally_master_id, voucher_type, voucher_number, amount,
        COALESCE(pay_cash, 0) as pay_cash, COALESCE(pay_qr, 0) as pay_qr,
        COALESCE(pay_cheque, 0) as pay_cheque, COALESCE(pay_discount, 0) as pay_discount,
        COALESCE(pay_esewa, 0) as pay_esewa, COALESCE(pay_bank_deposit, 0) as pay_bank_deposit,
        narration
      FROM bills
      WHERE voucher_date = ? AND party_name = ? AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY voucher_type, id
    `).all(date, party);
    res.json({ date, party, vouchers: rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
