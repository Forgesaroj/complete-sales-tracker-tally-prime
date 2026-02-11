/**
 * Stock Groups Routes
 * Category-wise stock group reports
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * GET /api/stock-groups
 * Get all stock groups (cached)
 */
router.get('/', (req, res) => {
  try {
    const groups = db.getAllStockGroups();
    res.json({ success: true, count: groups.length, groups });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stock-groups/summary
 * Get stock groups with item counts and total values
 */
router.get('/summary', (req, res) => {
  try {
    const groups = db.getStockGroupSummary();
    const totalValue = groups.reduce((s, g) => s + (g.closing_value || 0), 0);
    res.json({ success: true, count: groups.length, totalValue, groups });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/stock-groups/sync
 * Refresh stock groups from Tally
 */
router.post('/sync', async (req, res) => {
  try {
    const groups = await tallyConnector.getStockGroups();
    const count = db.upsertStockGroups(groups);
    res.json({ success: true, message: `Synced ${count} stock groups`, count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
