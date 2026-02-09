/**
 * Tally Routes
 * Direct Tally connection and company management
 */

import { Router } from 'express';
import { tallyConnector } from '../services/tally/tallyConnector.js';
import config from '../config/default.js';

const router = Router();

/**
 * GET /api/tally/status
 * Check Tally connection
 */
router.get('/status', async (req, res) => {
  try {
    const status = await tallyConnector.checkConnection();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tally/companies
 * Get list of companies from Tally
 */
router.get('/companies', async (req, res) => {
  try {
    const companies = await tallyConnector.getCompanies();
    const activeCompany = tallyConnector.companyName || config.tally.companyName;
    res.json({
      companies,
      activeCompany
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/tally/company
 * Set active company
 */
router.post('/company', async (req, res) => {
  try {
    const { companyName } = req.body;
    if (!companyName) {
      return res.status(400).json({ error: 'companyName is required' });
    }

    // Set the active company
    tallyConnector.setCompany(companyName);

    res.json({
      success: true,
      activeCompany: companyName,
      message: 'Company changed. Data will sync on next interval.'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tally/voucher-types
 * Get all voucher types from Tally
 */
router.get('/voucher-types', async (req, res) => {
  try {
    const voucherTypes = await tallyConnector.getVoucherTypes();
    res.json({
      success: true,
      count: voucherTypes.length,
      voucherTypes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
