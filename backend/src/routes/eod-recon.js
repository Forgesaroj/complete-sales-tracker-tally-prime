/**
 * EOD Reconciliation Route
 * Provides end-of-day reconciliation data from all sources:
 * - Billing company (bills table) - sales & SFL payment mode breakdown
 * - ODBC company (odbc_vouchers table) - cheque company activity
 * - Fonepay portal (fonepay_transactions) - QR payment verification
 * - RBB bank (rbb_transactions) - settlement verification
 * - Cheques (cheques table) - due/overdue/deposited
 * - SFL vs Receipt matching - detect missing receipts
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';

const router = Router();

/**
 * GET /api/eod-recon?date=YYYYMMDD
 * Returns complete EOD reconciliation data for a given date
 */
router.get('/', (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10).replace(/-/g, '');

    // Convert YYYYMMDD to YYYY-MM-DD for fonepay/rbb/cheques queries
    const dateHyphen = date.length === 8
      ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
      : date;

    // ===== BILLING COMPANY — SALES =====

    const salesTypes = ['Sales', 'Credit Sales', 'Pending Sales Bill', 'A Pto Bill', 'Debit Note'];
    const salesRows = db.db.prepare(`
      SELECT voucher_type, SUM(ABS(amount)) as total, COUNT(*) as count
      FROM bills
      WHERE voucher_date = ? AND voucher_type IN (${salesTypes.map(() => '?').join(',')})
      AND (is_deleted = 0 OR is_deleted IS NULL)
      GROUP BY voucher_type
    `).all(date, ...salesTypes);

    const sales = {};
    let totalSales = 0, salesCount = 0;
    for (const row of salesRows) {
      sales[row.voucher_type] = { total: row.total, count: row.count };
      totalSales += row.total;
      salesCount += row.count;
    }

    // ===== BILLING COMPANY — PAYMENT MODE BREAKDOWN (from SFL fields) =====
    // SFL1-7 are on ALL voucher types (Sales, Credit Sales, etc.) — not just receipts
    // This captures counter collections: cash, QR, cheque, discount, bank deposit, esewa

    const sflRow = db.db.prepare(`
      SELECT
        SUM(COALESCE(udf_sfl1, 0)) as cash_teller_1,
        SUM(COALESCE(udf_sfl2, 0)) as cash_teller_2,
        SUM(COALESCE(udf_sfl3, 0)) as cheque,
        SUM(COALESCE(udf_sfl4, 0)) as qr,
        SUM(COALESCE(udf_sfl5, 0)) as discount,
        SUM(COALESCE(udf_sfl6, 0)) as bank_deposit,
        SUM(COALESCE(udf_sfl7, 0)) as esewa,
        SUM(COALESCE(udf_payment_total, 0)) as total_collected,
        COUNT(*) as paid_count
      FROM bills
      WHERE voucher_date = ?
      AND (is_deleted = 0 OR is_deleted IS NULL)
      AND COALESCE(udf_payment_total, 0) > 0
    `).get(date);

    // Build receipts object from SFL totals
    const receipts = {};
    if (sflRow) {
      if (sflRow.cash_teller_1 > 0) receipts['Cash Teller 1'] = sflRow.cash_teller_1;
      if (sflRow.cash_teller_2 > 0) receipts['Cash Teller 2'] = sflRow.cash_teller_2;
      if (sflRow.cheque > 0) receipts['Cheque receipt'] = sflRow.cheque;
      if (sflRow.qr > 0) receipts['Q/R code'] = sflRow.qr;
      if (sflRow.discount > 0) receipts['Discount'] = sflRow.discount;
      if (sflRow.bank_deposit > 0) receipts['Bank Deposit(All)'] = sflRow.bank_deposit;
      if (sflRow.esewa > 0) receipts['Esewa'] = sflRow.esewa;
    }

    // Fallback: if SFL columns are all zero (pre-migration data), use ledger_entries from receipts
    const hasSflData = sflRow && sflRow.total_collected > 0;
    if (!hasSflData) {
      const receiptTypes = ['Bank Receipt', 'Counter Receipt', 'Receipt', 'Dashboard Receipt'];
      const receiptRows = db.db.prepare(`
        SELECT ledger_entries, pay_cash, pay_qr, pay_cheque, pay_discount, pay_esewa, pay_bank_deposit
        FROM bills
        WHERE voucher_date = ? AND voucher_type IN (${receiptTypes.map(() => '?').join(',')})
        AND (is_deleted = 0 OR is_deleted IS NULL)
      `).all(date, ...receiptTypes);

      for (const r of receiptRows) {
        try {
          const entries = JSON.parse(r.ledger_entries || '[]');
          for (const e of entries) {
            if (e.isDebit && e.ledger) {
              receipts[e.ledger] = (receipts[e.ledger] || 0) + (e.amount || 0);
            }
          }
        } catch {}
      }
    }

    const totalReceipts = Object.values(receipts).reduce((s, v) => s + v, 0);
    const receiptCount = sflRow ? sflRow.paid_count : 0;

    // Discount details for audit (from SFL5 on all vouchers)
    const discountVouchers = db.db.prepare(`
      SELECT party_name, voucher_number, voucher_type, udf_sfl5 as amount
      FROM bills
      WHERE voucher_date = ? AND COALESCE(udf_sfl5, 0) > 0
      AND (is_deleted = 0 OR is_deleted IS NULL)
      ORDER BY udf_sfl5 DESC
    `).all(date);

    // ===== ODBC COMPANY =====

    const odbcRows = db.db.prepare(`
      SELECT voucher_type, amount, ledger_entries, party_name, voucher_number
      FROM odbc_vouchers WHERE voucher_date = ?
    `).all(date);

    const odbcLedgerTotals = {};
    for (const r of odbcRows) {
      try {
        const entries = JSON.parse(r.ledger_entries || '[]');
        for (const e of entries) {
          if (e.isDebit && e.ledger) {
            odbcLedgerTotals[e.ledger] = (odbcLedgerTotals[e.ledger] || 0) + (e.amount || 0);
          }
        }
      } catch {}
    }

    const odbcTotalReceipts = Object.values(odbcLedgerTotals).reduce((s, v) => s + v, 0);

    // ===== FONEPAY =====

    const fonepayRows = db.db.prepare(`
      SELECT transaction_id, amount, transaction_date, description, issuer_name
      FROM fonepay_transactions WHERE DATE(transaction_date) = DATE(?)
    `).all(dateHyphen);

    const fonepayTotal = fonepayRows.reduce((s, r) => s + (r.amount || 0), 0);

    // ===== RBB BANK =====

    const rbbRows = db.db.prepare(`
      SELECT description, credit, debit, transaction_date
      FROM rbb_transactions WHERE DATE(transaction_date) = DATE(?)
    `).all(dateHyphen);

    // Classify RBB transactions
    let rbbTotalCredits = 0, rbbCreditCount = 0;
    let rbbTotalDebits = 0, rbbDebitCount = 0;
    // Fonepay settlements to RBB = ESEWASTLMT credits (eSewa issuer) + FONEPAY credits (other issuers)
    let esewaSettlements = 0, fonepaySettlements = 0, otherCredits = 0;
    const rbbCredits = [];
    const rbbDebits = [];

    for (const r of rbbRows) {
      if (r.credit > 0) {
        rbbTotalCredits += r.credit;
        rbbCreditCount++;
        rbbCredits.push(r);

        const desc = (r.description || '').toUpperCase();
        if (desc.includes('ESEWASTLMT') || desc.includes('ESEWA')) {
          esewaSettlements += r.credit;
        } else if (desc.includes('FONEPAY')) {
          fonepaySettlements += r.credit;
        } else {
          otherCredits += r.credit;
        }
      }
      if (r.debit > 0) {
        rbbTotalDebits += r.debit;
        rbbDebitCount++;
        rbbDebits.push(r);
      }
    }

    // Total Fonepay settlement to RBB = ESEWASTLMT + FONEPAY credits
    // (eSewa is a Fonepay issuer — customers pay QR via eSewa wallet, settles as ESEWASTLMT)
    const rbbFonepaySettlement = esewaSettlements + fonepaySettlements;

    // ===== CHEQUES =====

    const dueToday = db.db.prepare(`
      SELECT party_name, amount, cheque_number, cheque_date, status, bank_name
      FROM cheques WHERE cheque_date = ?
      ORDER BY amount DESC
    `).all(dateHyphen);

    const overdue = db.db.prepare(`
      SELECT party_name, amount, cheque_number, cheque_date, status, bank_name
      FROM cheques WHERE cheque_date < ? AND status = 'pending'
      ORDER BY cheque_date ASC
    `).all(dateHyphen);

    const depositedToday = db.db.prepare(`
      SELECT party_name, amount, cheque_number, cheque_date, bank_name
      FROM cheques WHERE deposit_date = ? AND status IN ('deposited', 'cleared')
      ORDER BY amount DESC
    `).all(dateHyphen);

    // ===== SFL vs RECEIPT RECONCILIATION =====
    // Detect bills with SFL payment values but no Dashboard Receipt created

    const sflBills = db.db.prepare(`
      SELECT voucher_number, party_name, amount, udf_payment_total, voucher_type
      FROM bills
      WHERE voucher_date = ? AND (is_deleted = 0 OR is_deleted IS NULL)
      AND voucher_type IN ('Sales', 'Credit Sales', 'Pending Sales Bill', 'A Pto Bill')
      AND COALESCE(udf_payment_total, 0) > 0
    `).all(date);

    const dashReceipts = db.db.prepare(`
      SELECT voucher_number, party_name, amount, narration
      FROM bills
      WHERE voucher_date = ? AND (is_deleted = 0 OR is_deleted IS NULL)
      AND voucher_type = 'Dashboard Receipt'
    `).all(date);

    // Match by party_name
    const receiptByParty = {};
    for (const r of dashReceipts) {
      if (!receiptByParty[r.party_name]) receiptByParty[r.party_name] = [];
      receiptByParty[r.party_name].push(r);
    }

    const matchedParties = new Set();
    const sflOnly = [];
    const amountMismatch = [];

    for (const bill of sflBills) {
      const partyReceipts = receiptByParty[bill.party_name];
      if (!partyReceipts || partyReceipts.length === 0) {
        sflOnly.push(bill);
      } else {
        // Find matching receipt by amount
        const match = partyReceipts.find(r => Math.abs(r.amount - bill.udf_payment_total) < 1);
        if (match) {
          matchedParties.add(bill.party_name);
        } else {
          amountMismatch.push({
            voucher_number: bill.voucher_number,
            party_name: bill.party_name,
            sfl_amount: bill.udf_payment_total,
            receipt_amount: partyReceipts[0].amount,
            diff: Math.abs(bill.udf_payment_total - partyReceipts[0].amount)
          });
        }
      }
    }

    // Receipts without matching SFL bill
    const sflParties = new Set(sflBills.map(b => b.party_name));
    const receiptOnly = dashReceipts.filter(r => !sflParties.has(r.party_name));

    const sflVsReceipt = {
      totalSflBills: sflBills.length,
      totalDashReceipts: dashReceipts.length,
      sflTotal: sflBills.reduce((s, b) => s + b.udf_payment_total, 0),
      receiptTotal: dashReceipts.reduce((s, r) => s + Math.abs(r.amount), 0),
      matched: matchedParties.size,
      sflOnly,
      receiptOnly,
      amountMismatch
    };

    // ===== RECONCILIATION CHECKS =====

    // Check 1: QR System vs Fonepay Portal (same day)
    const systemQR = (receipts['Q/R code'] || 0)
      + Object.entries(odbcLedgerTotals)
          .filter(([k]) => k.toLowerCase().includes('qr') || k.toLowerCase().includes('q/r'))
          .reduce((s, [, v]) => s + v, 0);

    // Check 2: Fonepay Portal vs RBB Settlement (ESEWASTLMT + FONEPAY credits)
    // eSewa is a Fonepay issuer, not a separate payment channel
    const fonepayVsRbbDiff = Math.abs(fonepayTotal - rbbFonepaySettlement);
    let fonepayVsRbbNote = '';
    if (rbbFonepaySettlement > fonepayTotal && fonepayVsRbbDiff > 1) {
      fonepayVsRbbNote = 'RBB received more than portal shows — possible missing portal transaction (manual fonepay entry needed)';
    } else if (fonepayTotal > rbbFonepaySettlement && fonepayVsRbbDiff > 1) {
      fonepayVsRbbNote = 'Portal shows more than RBB received — settlement pending or decreased';
    }

    // Check 3: Esewa (SFL7) — display only, direct personal transfers
    const systemEsewa = (receipts['Esewa'] || 0)
      + Object.entries(odbcLedgerTotals)
          .filter(([k]) => k.toLowerCase().includes('esewa'))
          .reduce((s, [, v]) => s + v, 0);

    // Check 4: Bank Deposit — display only, multiple banks
    const systemBankDeposit = (receipts['Bank Deposit(All)'] || 0)
      + Object.entries(odbcLedgerTotals)
          .filter(([k]) => k.toLowerCase().includes('bank deposit'))
          .reduce((s, [, v]) => s + v, 0);

    const checks = {
      qrVsFonepay: {
        label: 'QR System vs Fonepay Portal',
        system: systemQR,
        external: fonepayTotal,
        diff: Math.abs(systemQR - fonepayTotal),
        match: Math.abs(systemQR - fonepayTotal) < 1
      },
      fonepayVsRbb: {
        label: 'Fonepay Portal vs RBB Settlement',
        system: fonepayTotal,
        external: rbbFonepaySettlement,
        externalDetail: { esewastlmt: esewaSettlements, fonepay: fonepaySettlements },
        diff: fonepayVsRbbDiff,
        match: fonepayVsRbbDiff < 1,
        note: fonepayVsRbbNote
      },
      esewa: {
        label: 'Esewa (Direct Personal)',
        system: systemEsewa,
        displayOnly: true
      },
      bankDeposit: {
        label: 'Bank Deposit',
        system: systemBankDeposit,
        rbbOtherCredits: otherCredits,
        displayOnly: true
      }
    };

    // ===== FONEPAY SETTLEMENT LEDGER =====
    // Accounting-style entries: Fonepay collections (credit) vs RBB settlements (debit)

    // Credit side: Fonepay portal transactions (money collected from customers via QR)
    const fonepayCredits = fonepayRows.map(r => ({
      date: r.transaction_date,
      description: r.description || r.issuer_name || r.transaction_id,
      amount: r.amount || 0,
      issuer: r.issuer_name || '',
      type: 'collection'
    }));

    // Debit side: RBB settlement transactions (Fonepay settled to RBB bank)
    const fonepayDebits = rbbCredits
      .filter(r => {
        const desc = (r.description || '').toUpperCase();
        return desc.includes('ESEWASTLMT') || desc.includes('ESEWA') || desc.includes('FONEPAY');
      })
      .map(r => {
        const desc = (r.description || '').toUpperCase();
        return {
          date: r.transaction_date,
          description: r.description,
          amount: r.credit || 0,
          type: desc.includes('ESEWASTLMT') || desc.includes('ESEWA') ? 'ESEWASTLMT' : 'FONEPAY'
        };
      });

    const fonepayLedger = {
      credits: fonepayCredits,
      totalCredits: fonepayTotal,
      debits: fonepayDebits,
      totalDebits: rbbFonepaySettlement,
      balance: fonepayTotal - rbbFonepaySettlement // positive = Fonepay owes, negative = RBB got more
    };

    // ===== COMBINED CASH =====

    const billingCashTeller1 = receipts['Cash Teller 1'] || 0;
    const billingCashTeller2 = receipts['Cash Teller 2'] || 0;

    const odbcCash = Object.entries(odbcLedgerTotals)
      .filter(([k]) => k.toLowerCase().includes('cash'))
      .reduce((s, [, v]) => s + v, 0);

    const totalExpectedCash = billingCashTeller1 + billingCashTeller2 + odbcCash;

    res.json({
      success: true,
      date,
      billing: {
        sales,
        totalSales,
        salesCount,
        receipts,
        totalReceipts,
        receiptCount,
        discountDetails: discountVouchers
      },
      odbc: {
        receipts: odbcLedgerTotals,
        totalReceipts: odbcTotalReceipts,
        voucherCount: odbcRows.length
      },
      fonepay: {
        total: fonepayTotal,
        count: fonepayRows.length,
        transactions: fonepayRows
      },
      rbb: {
        totalCredits: rbbTotalCredits,
        creditCount: rbbCreditCount,
        totalDebits: rbbTotalDebits,
        debitCount: rbbDebitCount,
        esewaSettlements,
        fonepaySettlements,
        fonepaySettlementTotal: rbbFonepaySettlement,
        otherCredits,
        credits: rbbCredits,
        debits: rbbDebits
      },
      cheques: {
        dueToday,
        overdue,
        depositedToday
      },
      checks,
      sflVsReceipt,
      fonepayLedger,
      combinedCash: {
        billingCashTeller1,
        billingCashTeller2,
        odbcCash,
        totalExpectedCash
      }
    });
  } catch (err) {
    console.error('EOD Recon error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
