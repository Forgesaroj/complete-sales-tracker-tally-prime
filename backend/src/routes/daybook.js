/**
 * Daybook Routes
 * Columnar daybook and party summary
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';

const router = Router();

/**
 * GET /api/daybook
 * Get daybook entries (supports date range)
 */
router.get('/', (req, res) => {
  try {
    const { date, fromDate, toDate, voucherTypes } = req.query;

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    // Support both single date and date range
    const from = fromDate || date || today;
    const to = toDate || date || today;
    const types = voucherTypes ? voucherTypes.split(',') : null;

    const entries = db.getDaybook(from, to, types);

    // Calculate totals
    const totals = entries.reduce((acc, row) => ({
      debit: acc.debit + (row.debit || 0),
      credit: acc.credit + (row.credit || 0)
    }), { debit: 0, credit: 0 });

    res.json({
      fromDate: from,
      toDate: to,
      entries,
      count: entries.length,
      totals: {
        ...totals,
        balance: totals.debit - totals.credit
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/daybook/party-summary
 * Get party-wise summary
 */
router.get('/party-summary', (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const from = fromDate || today;
    const to = toDate || today;

    const summary = db.getPartySummary(from, to);

    // Calculate balances
    const result = summary.map(party => ({
      ...party,
      balance: party.total_debit - party.total_credit,
      status: party.total_debit <= party.total_credit ? 'cleared' : 'pending'
    }));

    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
