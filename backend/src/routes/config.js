/**
 * Config Routes
 * Application configuration endpoints
 */

import { Router } from 'express';
import config from '../config/default.js';
import { db } from '../services/database/database.js';

const router = Router();

/**
 * GET /api/config/voucher-types
 * Get configured voucher types
 */
router.get('/voucher-types', (req, res) => {
  res.json(config.voucherTypes);
});

/**
 * GET /api/config/bill-statuses
 * Get bill status options
 */
router.get('/bill-statuses', (req, res) => {
  res.json(config.billStatus);
});

/**
 * GET /api/config/settings
 * Get all app settings
 */
router.get('/settings', (req, res) => {
  try {
    const settings = db.getAllSettings();
    // Convert array to object for easier use
    const settingsObj = {};
    for (const s of settings) {
      settingsObj[s.key] = s.value;
    }
    res.json({
      success: true,
      settings: settingsObj,
      raw: settings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/config/settings/:key
 * Get a specific setting
 */
router.get('/settings/:key', (req, res) => {
  try {
    const value = db.getSetting(req.params.key);
    res.json({
      success: true,
      key: req.params.key,
      value
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/config/settings
 * Update multiple settings
 */
router.post('/settings', (req, res) => {
  try {
    const { settings } = req.body;
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object required' });
    }
    db.setSettings(settings);
    res.json({
      success: true,
      message: 'Settings updated',
      settings
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/config/settings/:key
 * Update a specific setting
 */
router.put('/settings/:key', (req, res) => {
  try {
    const { value } = req.body;
    if (value === undefined) {
      return res.status(400).json({ error: 'Value required' });
    }
    db.setSetting(req.params.key, value);
    res.json({
      success: true,
      key: req.params.key,
      value
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
