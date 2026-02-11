/**
 * Inventory Movement Routes
 * Stock in/out tracking from Tally vouchers
 */

import { Router } from 'express';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * GET /api/inventory-movement
 * Get inventory movements (live from Tally)
 * Query params: from (YYYYMMDD), to (YYYYMMDD), item (optional stock item name)
 */
router.get('/', async (req, res) => {
  try {
    const { from, to, item } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to dates are required (YYYYMMDD format)' });
    }
    const movements = await tallyConnector.getInventoryMovement(from, to, item || null);
    res.json({ success: true, count: movements.length, movements });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/inventory-movement/summary
 * Get net in/out per item for a date range
 */
router.get('/summary', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from and to dates are required (YYYYMMDD format)' });
    }
    const movements = await tallyConnector.getInventoryMovement(from, to);

    // Aggregate by stock item
    const itemMap = {};
    for (const m of movements) {
      for (const item of (m.items || [])) {
        if (!itemMap[item.stockItem]) {
          itemMap[item.stockItem] = { stockItem: item.stockItem, totalIn: 0, totalOut: 0, inValue: 0, outValue: 0 };
        }
        if (item.direction === 'in') {
          itemMap[item.stockItem].totalIn += item.quantity || 0;
          itemMap[item.stockItem].inValue += Math.abs(item.amount || 0);
        } else {
          itemMap[item.stockItem].totalOut += item.quantity || 0;
          itemMap[item.stockItem].outValue += Math.abs(item.amount || 0);
        }
      }
    }

    const summary = Object.values(itemMap).map(i => ({
      ...i,
      netQuantity: i.totalIn - i.totalOut
    })).sort((a, b) => b.outValue - a.outValue);

    res.json({ success: true, count: summary.length, summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
