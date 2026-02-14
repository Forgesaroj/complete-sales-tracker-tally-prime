/**
 * Outstanding & Ageing Routes
 * Bill-wise receivables and ageing analysis (from ODBC outstanding bills)
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * GET /api/outstanding
 * Get all outstanding bills. Optional ?party=Name&overdue=1 filters
 */
router.get('/', (req, res) => {
  try {
    const { party, overdue } = req.query;
    const bills = db.getOutstandingBills(party || null, overdue === '1');
    res.json({ success: true, count: bills.length, bills });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/outstanding/summary
 * Get total receivable and overdue receivable summary
 */
router.get('/summary', (req, res) => {
  try {
    const summary = db.getReceivableSummary();
    res.json({ success: true, ...summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/outstanding/ageing
 * Get ageing summary (bucketed: 0-30, 30-60, 60-90, 90+). Optional ?overdue=1
 */
router.get('/ageing', (req, res) => {
  try {
    const { overdue } = req.query;
    const summary = db.getAgeingSummary(overdue === '1');
    const total = summary.reduce((s, r) => s + (r.total_amount || 0), 0);
    res.json({ success: true, summary, totalOutstanding: total });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/outstanding/parties
 * Get party-wise outstanding summary. Optional ?overdue=1
 */
router.get('/parties', (req, res) => {
  try {
    const { overdue } = req.query;
    const parties = db.getOutstandingParties(overdue === '1');
    res.json({ success: true, count: parties.length, parties });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/outstanding/customer/:partyName
 * Get single customer's outstanding bills
 */
router.get('/customer/:partyName', (req, res) => {
  try {
    const bills = db.getOutstandingBills(req.params.partyName);
    const total = bills.reduce((s, b) => s + Math.abs(b.closing_balance || 0), 0);
    res.json({ success: true, partyName: req.params.partyName, totalOutstanding: total, count: bills.length, bills });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/outstanding/sync
 * Refresh outstanding bills from Tally
 */
router.post('/sync', async (req, res) => {
  try {
    const data = await tallyConnector.getLedgerBillAllocations();

    // Flatten party bills for DB storage
    const allBills = [];
    for (const party of data) {
      for (const bill of party.bills) {
        allBills.push({
          partyName: party.partyName,
          billName: bill.billName,
          billDate: bill.billDate,
          closingBalance: bill.closingBalance,
          creditPeriod: bill.creditPeriod,
          ageingDays: bill.ageingDays,
          ageingBucket: bill.ageingBucket
        });
      }
    }

    // Clear old and insert fresh
    db.clearOutstandingBills();
    const count = db.upsertOutstandingBills(allBills);

    res.json({
      success: true,
      message: `Synced ${count} outstanding bills from ${data.length} parties`,
      partyCount: data.length,
      billCount: count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
