/**
 * Dashboard Routes
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';

const router = Router();

/**
 * GET /api/dashboard/summary
 * Get dashboard summary stats
 */
router.get('/summary', (req, res) => {
  try {
    const summary = db.getDashboardSummary();
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
