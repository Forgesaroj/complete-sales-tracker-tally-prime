/**
 * Balance Sheet Routes
 * Live Balance Sheet from Tally
 */

import { Router } from 'express';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * GET /api/balance-sheet
 * Get live Balance Sheet from Tally
 * Query params: ?from=YYYYMMDD&to=YYYYMMDD
 */
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    const bs = await tallyConnector.getBalanceSheet(from || null, to || null);
    res.json({ success: true, ...bs });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
