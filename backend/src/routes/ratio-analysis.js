/**
 * Ratio Analysis Routes
 * Computed from Balance Sheet + P&L data
 */

import { Router } from 'express';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * GET /api/ratios
 * Get financial ratio analysis (computed from BS + P&L)
 * Query params: ?from=YYYYMMDD&to=YYYYMMDD
 */
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    const ratios = await tallyConnector.getRatioAnalysis(from || null, to || null);
    res.json({ success: true, ...ratios });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
