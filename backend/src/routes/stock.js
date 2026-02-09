/**
 * Stock Routes
 * Stock items management
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * GET /api/stock
 * Get all stock items from local database (synced from Tally)
 */
router.get('/', (req, res) => {
  try {
    const { search } = req.query;
    let items;

    if (search) {
      items = db.searchStockItems(search);
    } else {
      items = db.getAllStockItems();
    }

    res.json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stock/summary
 * Get stock items with balance > 0 (inventory on hand)
 */
router.get('/summary', (req, res) => {
  try {
    const allItems = db.getAllStockItems();
    const items = allItems.filter(item => item.closingBalance > 0);
    res.json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stock/search
 * Search stock items by name
 */
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }
    const items = db.searchStockItems(q);
    res.json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stock/tally
 * Fetch stock items directly from Tally (use sparingly)
 */
router.get('/tally', async (req, res) => {
  try {
    const items = await tallyConnector.getStockItems();
    res.json({
      success: true,
      count: items.length,
      items
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
