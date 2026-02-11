/**
 * Cash Flow Statement Routes
 * Live Cash Flow from Tally
 */

import { Router } from 'express';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * GET /api/cash-flow
 * Get live Cash Flow Statement from Tally
 * Query params: ?from=YYYYMMDD&to=YYYYMMDD (required)
 */
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to dates are required (YYYYMMDD format)' });
    }
    const cf = await tallyConnector.getCashFlow(from, to);
    res.json({ success: true, ...cf });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
