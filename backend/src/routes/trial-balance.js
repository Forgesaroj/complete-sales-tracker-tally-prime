/**
 * Trial Balance Routes
 * Live Trial Balance from Tally
 */

import { Router } from 'express';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * GET /api/trial-balance
 * Get live Trial Balance from Tally
 * Query params: ?from=YYYYMMDD&to=YYYYMMDD
 */
router.get('/', async (req, res) => {
  try {
    const { from, to } = req.query;
    const tb = await tallyConnector.getTrialBalance(from || null, to || null);
    res.json({ success: true, ...tb });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
