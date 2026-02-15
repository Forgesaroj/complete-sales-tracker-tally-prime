/**
 * Ledger (Both) Routes
 * Combined view of Sundry Debtors from both Billing and ODBC companies
 * Shows billing balance + cheque total + cheque overdue per customer
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

function co() { return db.getCompanyNames(); }

/**
 * GET /api/ledger-both
 * Fetches live Tally balances from both companies + local DB for cheque overdue
 */
router.get('/', async (req, res) => {
  try {
    const companies = co();
    const t0 = Date.now();

    // Sequential fetch — Tally is single-threaded, parallel requests queue up and timeout
    console.log('[ledger-both] Fetching billing balances...');
    const billingBalances = await tallyConnector.getAllPartyBalances(companies.billing);
    console.log(`[ledger-both] Got ${billingBalances.length} billing parties (${Date.now() - t0}ms)`);

    console.log('[ledger-both] Fetching ODBC balances...');
    const odbcBalances = await tallyConnector.getAllPartyBalances(companies.odbc);
    console.log(`[ledger-both] Got ${odbcBalances.length} ODBC parties (${Date.now() - t0}ms)`);

    // Cheque overdue from local DB (ODBC company has no bill allocations in Tally)
    const odbcOutstanding = db.db.prepare(
      'SELECT party_name, COUNT(*) as bill_count, SUM(ABS(closing_balance)) as overdue_amount FROM odbc_outstanding_bills WHERE ageing_days > 0 GROUP BY party_name'
    ).all();
    const odbcOverdueMap = {};
    for (const row of odbcOutstanding) {
      odbcOverdueMap[row.party_name] = { amount: row.overdue_amount, count: row.bill_count };
    }
    console.log(`[ledger-both] Got ${odbcOutstanding.length} parties with overdue cheques from DB (${Date.now() - t0}ms)`);

    // Load ledger mappings from local DB
    const mappings = db.getLedgerMappings();

    // Build lookup maps
    const billingToOdbc = {};  // billingParty → odbcParty
    const odbcToBilling = {};  // odbcParty → billingParty
    for (const m of mappings) {
      billingToOdbc[m.billing_party] = m.odbc_party;
      odbcToBilling[m.odbc_party] = m.billing_party;
    }

    // Build billing balance map (with parent group)
    const billingMap = {};
    const billingGroupMap = {};
    for (const p of billingBalances) {
      if (p.name) {
        billingMap[p.name] = Math.abs(p.balance);
        billingGroupMap[p.name] = p.parent || '';
      }
    }

    // Build ODBC balance map
    const odbcMap = {};
    for (const p of odbcBalances) {
      if (p.name) odbcMap[p.name] = Math.abs(p.balance);
    }

    const rows = [];
    const usedBillingParties = new Set();

    // Process ODBC parties (skip zero-balance unless mapped)
    for (const odbcName of Object.keys(odbcMap)) {
      const mappedBilling = odbcToBilling[odbcName];
      const overdue = odbcOverdueMap[odbcName] || { amount: 0, count: 0 };
      const chqTotal = odbcMap[odbcName];
      // Cap overdue to cheque_total — overdue can't exceed what's actually owed
      const cappedOverdue = Math.min(overdue.amount, chqTotal);

      if (mappedBilling) {
        // Mapped: combine both (even if billing balance is 0, mapping exists)
        rows.push({
          billing_party: mappedBilling,
          odbc_party: odbcName,
          type: 'both',
          group: billingGroupMap[mappedBilling] || '',
          billing_balance: billingMap[mappedBilling] || 0,
          cheque_total: chqTotal,
          cheque_overdue: cappedOverdue,
          cheque_overdue_count: overdue.count
        });
        usedBillingParties.add(mappedBilling);
      } else if (chqTotal > 0) {
        // ODBC only — only include if has balance
        rows.push({
          billing_party: null,
          odbc_party: odbcName,
          type: 'cheque',
          group: '',
          billing_balance: 0,
          cheque_total: chqTotal,
          cheque_overdue: cappedOverdue,
          cheque_overdue_count: overdue.count
        });
      }
    }

    // Remaining billing-only parties (only those with balance)
    for (const billingName of Object.keys(billingMap)) {
      if (usedBillingParties.has(billingName)) continue;
      const bal = billingMap[billingName];
      if (bal <= 0) continue;
      rows.push({
        billing_party: billingName,
        odbc_party: billingToOdbc[billingName] || null,
        type: 'billing',
        group: billingGroupMap[billingName] || '',
        billing_balance: bal,
        cheque_total: 0,
        cheque_overdue: 0,
        cheque_overdue_count: 0
      });
    }

    // Sort by highest total (billing + cheque) first
    rows.sort((a, b) => (b.billing_balance + b.cheque_total) - (a.billing_balance + a.cheque_total));

    // Summary
    const summary = {
      total_billing: rows.reduce((s, r) => s + r.billing_balance, 0),
      total_cheque: rows.reduce((s, r) => s + r.cheque_total, 0),
      total_cheque_overdue: rows.reduce((s, r) => s + r.cheque_overdue, 0),
      mapped_count: rows.filter(r => r.type === 'both').length,
      billing_only_count: rows.filter(r => r.type === 'billing').length,
      cheque_only_count: rows.filter(r => r.type === 'cheque').length
    };

    // Party name lists for mapping dropdowns (sorted alphabetically)
    const allBillingParties = Object.keys(billingMap).sort();
    const allOdbcParties = Object.keys(odbcMap).sort();

    console.log(`[ledger-both] ${rows.length} rows: ${summary.mapped_count} mapped, ${summary.billing_only_count} billing-only, ${summary.cheque_only_count} cheque-only (${Date.now() - t0}ms)`);
    res.json({ success: true, rows, summary, billing_company: companies.billing, odbc_company: companies.odbc, allBillingParties, allOdbcParties });
  } catch (error) {
    console.error('[ledger-both] ERROR:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
