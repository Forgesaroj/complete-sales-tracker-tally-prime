/**
 * Ledgers Routes
 * Parties and ledger management
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * GET /api/ledgers
 * Get all parties from local database (synced from Tally)
 */
router.get('/', (req, res) => {
  try {
    const { search } = req.query;
    let ledgers;

    if (search) {
      ledgers = db.searchParties(search);
    } else {
      ledgers = db.getAllParties();
    }

    res.json({
      success: true,
      count: ledgers.length,
      ledgers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledgers/debtors
 * Get Sundry Debtors (customers) from local database
 */
router.get('/debtors', (req, res) => {
  try {
    const { search } = req.query;
    let ledgers = db.getDebtors();

    if (search) {
      const searchLower = search.toLowerCase();
      ledgers = ledgers.filter(l => l.name.toLowerCase().includes(searchLower));
    }

    res.json({
      success: true,
      count: ledgers.length,
      ledgers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledgers/creditors
 * Get Sundry Creditors (vendors) from local database
 */
router.get('/creditors', (req, res) => {
  try {
    const { search } = req.query;
    let ledgers = db.getCreditors();

    if (search) {
      const searchLower = search.toLowerCase();
      ledgers = ledgers.filter(l => l.name.toLowerCase().includes(searchLower));
    }

    res.json({
      success: true,
      count: ledgers.length,
      ledgers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledgers/search
 * Search parties by name
 */
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query (q) is required' });
    }
    const ledgers = db.searchParties(q);
    res.json({
      success: true,
      count: ledgers.length,
      ledgers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledgers/tally
 * Fetch ledgers directly from Tally (use sparingly)
 */
router.get('/tally', async (req, res) => {
  try {
    const { group } = req.query;
    const parentGroup = group || 'Sundry Debtors';
    const ledgers = await tallyConnector.getLedgers(parentGroup);
    res.json({
      success: true,
      count: ledgers.length,
      ledgers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledgers/sales
 * Fetch sales ledgers from Tally (for invoice creation)
 */
router.get('/sales', async (req, res) => {
  try {
    const ledgers = await tallyConnector.getLedgers('Sales Accounts');
    res.json({
      success: true,
      count: ledgers.length,
      ledgers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledgers/agents
 * Fetch agent ledgers from Tally (for staff/agent selection)
 * Uses configurable ledger group from settings
 */
router.get('/agents', async (req, res) => {
  try {
    // Get the agent ledger group from settings (default: 'Agent Ledger')
    const agentGroup = db.getSetting('agent_ledger_group') || 'Agent Ledger';
    const ledgers = await tallyConnector.getLedgers(agentGroup);
    res.json({
      success: true,
      count: ledgers.length,
      agentGroup,
      agents: ledgers
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
