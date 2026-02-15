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

/**
 * GET /api/ledgers/detail
 * Fetch detailed ledger info from Tally (master data + bill allocations)
 * Query: ?name=LedgerName&company=FOR%20DB
 */
router.get('/detail', async (req, res) => {
  try {
    const { name, company } = req.query;
    if (!name) return res.status(400).json({ error: 'Ledger name is required' });
    const detail = await tallyConnector.getLedgerDetail(name, company || null);
    if (!detail) return res.status(404).json({ error: 'Ledger not found' });
    res.json({ success: true, ledger: detail });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledgers/account-view
 * Tally-style ledger account view with all transactions and running balance
 * Query: ?name=LedgerName&from=YYYYMMDD&to=YYYYMMDD&company=FOR%20DB
 */
router.get('/account-view', async (req, res) => {
  try {
    const { name, from, to, company } = req.query;
    if (!name) return res.status(400).json({ error: 'Ledger name is required' });
    const result = await tallyConnector.getLedgerAccountView(name, from || null, to || null, company || null);
    if (!result) return res.status(404).json({ error: 'Ledger not found or no data' });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ledgers/hierarchy/companies
 * Get list of all companies from Tally
 */
router.get('/hierarchy/companies', async (req, res) => {
  try {
    const companies = await tallyConnector.getCompanies();
    res.json({ success: true, companies });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ledgers/hierarchy/sync
 * Sync ALL ledgers + groups from Tally for a specific company
 * Query: ?company=FOR%20DB
 */
router.post('/hierarchy/sync', async (req, res) => {
  try {
    const company = req.query.company || null; // null = default company
    const companyLabel = company || tallyConnector.companyName || 'default';

    console.log(`[Hierarchy] Syncing groups from ${companyLabel}...`);
    const groups = await tallyConnector.getAllGroups(company);
    if (groups.length > 0) {
      db.syncAccountGroups(groups, companyLabel);
      console.log(`[Hierarchy] Synced ${groups.length} groups for ${companyLabel}`);
    }

    console.log(`[Hierarchy] Syncing ledgers from ${companyLabel}...`);
    const ledgers = await tallyConnector.getAllLedgersWithBalances(company);
    console.log(`[Hierarchy] Got ${ledgers.length} ledgers from ${companyLabel}`);

    // Build group hierarchy map
    const groupMap = {};
    for (const g of groups) {
      groupMap[g.name] = g.hierarchy_path || '';
    }

    // Enrich ledgers with hierarchy and group type
    const enrichedLedgers = ledgers.map(l => {
      const hierarchy = groupMap[l.parent] || l.parent;
      let groupType = 'other';
      if (hierarchy.includes('Sundry Debtors')) groupType = 'debtor';
      else if (hierarchy.includes('Sundry Creditors')) groupType = 'creditor';
      else if (hierarchy.includes('Sales Accounts')) groupType = 'sales';
      else if (hierarchy.includes('Purchase Accounts')) groupType = 'purchase';
      else if (hierarchy.includes('Bank Accounts') || hierarchy.includes('Bank OD') || hierarchy.includes('Bank OCC')) groupType = 'bank';
      else if (hierarchy.includes('Cash-in-hand') || hierarchy.includes('Cash-in-Hand')) groupType = 'cash';
      else if (hierarchy.includes('Direct Expenses') || hierarchy.includes('Indirect Expenses')) groupType = 'expense';
      else if (hierarchy.includes('Direct Incomes') || hierarchy.includes('Indirect Incomes')) groupType = 'income';
      else if (hierarchy.includes('Fixed Assets')) groupType = 'fixed_asset';
      else if (hierarchy.includes('Investments')) groupType = 'investment';
      else if (hierarchy.includes('Current Assets')) groupType = 'current_asset';
      else if (hierarchy.includes('Current Liabilities')) groupType = 'current_liability';
      else if (hierarchy.includes('Capital Account')) groupType = 'capital';
      else if (hierarchy.includes('Loans')) groupType = 'loan';

      const absBalance = Math.abs(l.closing_balance);
      return {
        name: l.name,
        parent: l.parent,
        group_type: groupType,
        closing_balance: l.closing_balance,
        opening_balance: l.opening_balance,
        hierarchy_path: hierarchy,
        balance_type: l.closing_balance >= 0 ? 'Dr' : 'Cr',
        abs_balance: absBalance
      };
    });

    res.json({
      success: true,
      company: companyLabel,
      synced: { groups: groups.length, ledgers: ledgers.length },
      count: enrichedLedgers.length,
      groupCount: groups.length,
      ledgers: enrichedLedgers,
      groups
    });
  } catch (error) {
    console.error('[Hierarchy] Sync error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
