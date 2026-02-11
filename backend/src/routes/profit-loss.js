/**
 * Profit & Loss Routes
 * Live P&L report from Tally
 */

import { Router } from 'express';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * GET /api/profit-loss
 * Get live Profit & Loss from Tally
 * Query params: ?from=YYYYMMDD&to=YYYYMMDD
 */
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    const pl = await tallyConnector.getProfitAndLoss(from || null, to || null);
    res.json({ success: true, ...pl });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
