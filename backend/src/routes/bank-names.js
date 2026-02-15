/**
 * Bank Names Routes
 * Short name → Full name mapping for banks
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';

const router = Router();

/**
 * GET /api/bank-names
 * List all bank name mappings
 */
router.get('/', (req, res) => {
  try {
    const banks = db.getBankNames();
    res.json({ success: true, banks, count: banks.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/bank-names
 * Create a new bank name mapping
 */
router.post('/', (req, res) => {
  try {
    const { shortName, fullName } = req.body;
    if (!shortName || !fullName) return res.status(400).json({ success: false, error: 'shortName and fullName are required' });
    const result = db.createBankName(shortName, fullName);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error) {
    if (error.message.includes('UNIQUE')) return res.status(409).json({ success: false, error: `Short name "${req.body.shortName}" already exists` });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/bank-names/:id
 * Update a bank name mapping
 */
router.put('/:id', (req, res) => {
  try {
    const { shortName, fullName } = req.body;
    if (!shortName || !fullName) return res.status(400).json({ success: false, error: 'shortName and fullName are required' });
    db.updateBankName(parseInt(req.params.id), shortName, fullName);
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE')) return res.status(409).json({ success: false, error: `Short name "${req.body.shortName}" already exists` });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/bank-names/:id
 * Delete a bank name mapping
 */
router.delete('/:id', (req, res) => {
  try {
    db.deleteBankName(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/bank-names/lookup/:shortName
 * Lookup full name by short name
 */
router.get('/lookup/:shortName', (req, res) => {
  try {
    const bank = db.getBankNameByShort(req.params.shortName);
    res.json({ success: true, bank: bank || null });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== LEDGER MAPPING ====================

/**
 * GET /api/bank-names/ledger-mappings
 * List all ledger mappings (billing party → ODBC party)
 */
router.get('/ledger-mappings', (req, res) => {
  try {
    const mappings = db.getLedgerMappings();
    res.json({ success: true, mappings, count: mappings.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/bank-names/ledger-mappings
 * Create or update a ledger mapping
 */
router.post('/ledger-mappings', (req, res) => {
  try {
    const { billingParty, odbcParty } = req.body;
    if (!billingParty || !odbcParty) return res.status(400).json({ success: false, error: 'billingParty and odbcParty are required' });
    db.upsertLedgerMapping(billingParty, odbcParty);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PUT /api/bank-names/ledger-mappings/:id
 * Update a ledger mapping
 */
router.put('/ledger-mappings/:id', (req, res) => {
  try {
    const { billingParty, odbcParty } = req.body;
    if (!billingParty || !odbcParty) return res.status(400).json({ success: false, error: 'billingParty and odbcParty are required' });
    db.updateLedgerMapping(parseInt(req.params.id), billingParty, odbcParty);
    res.json({ success: true });
  } catch (error) {
    if (error.message.includes('UNIQUE')) return res.status(409).json({ success: false, error: `Billing party "${req.body.billingParty}" already mapped` });
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * DELETE /api/bank-names/ledger-mappings/:id
 * Delete a ledger mapping
 */
router.delete('/ledger-mappings/:id', (req, res) => {
  try {
    db.deleteLedgerMapping(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/bank-names/ledger-mappings/lookup/:billingParty
 * Lookup ODBC party by billing party name
 */
router.get('/ledger-mappings/lookup/:billingParty', (req, res) => {
  try {
    const mapping = db.getLedgerMapping(decodeURIComponent(req.params.billingParty));
    res.json({ success: true, mapping: mapping || null });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== PHONE → PARTY MAPPINGS ====================

router.get('/phone-mappings', (req, res) => {
  try {
    const mappings = db.getAllPhoneMappings(req.query.party || null);
    res.json({ success: true, mappings, count: mappings.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/phone-mappings', (req, res) => {
  try {
    const { phone, partyName } = req.body;
    if (!phone || !partyName) return res.status(400).json({ success: false, error: 'phone and partyName are required' });
    db.upsertPartyPhone(phone, partyName, 'manual');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/phone-mappings/:phone', (req, res) => {
  try {
    db.deletePartyPhone(decodeURIComponent(req.params.phone));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
