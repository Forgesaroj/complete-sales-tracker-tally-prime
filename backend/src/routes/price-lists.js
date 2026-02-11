/**
 * Price Lists Routes
 * Customer-specific pricing / price levels from Tally
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * GET /api/price-lists
 * Get all price lists (cached). Optional ?level=LevelName filter
 */
router.get('/', (req, res) => {
  try {
    const { level } = req.query;
    const prices = db.getPriceLists(level || null);
    res.json({ success: true, count: prices.length, prices });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/price-lists/levels
 * Get distinct price level names
 */
router.get('/levels', (req, res) => {
  try {
    const levels = db.getPriceLevels();
    res.json({ success: true, levels });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/price-lists/item/:name
 * Get all prices for a specific stock item
 */
router.get('/item/:name', (req, res) => {
  try {
    const prices = db.getItemPrices(req.params.name);
    res.json({ success: true, stockItem: req.params.name, count: prices.length, prices });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/price-lists/sync
 * Refresh price lists from Tally
 */
router.post('/sync', async (req, res) => {
  try {
    const items = await tallyConnector.getPriceLists();

    // Flatten for DB storage
    const allPrices = [];
    for (const item of items) {
      // Add standard price as a level
      if (item.standardPrice) {
        allPrices.push({ stockItem: item.name, priceLevel: 'Standard', rate: item.standardPrice });
      }
      for (const pl of (item.priceLevels || [])) {
        allPrices.push({ stockItem: item.name, priceLevel: pl.levelName, rate: pl.rate });
      }
    }

    const count = db.upsertPriceLists(allPrices);
    res.json({ success: true, message: `Synced ${count} price entries from ${items.length} items`, itemCount: items.length, priceCount: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
