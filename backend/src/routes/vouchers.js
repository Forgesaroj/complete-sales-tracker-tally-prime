/**
 * Vouchers Routes
 * API endpoints for ALL voucher types (Sales, Receipt, Payment, Journal, Purchase, etc.)
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import tallyConnector from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * GET /api/vouchers
 * Get ALL vouchers (all types)
 */
router.get('/', (req, res) => {
  try {
    const { limit = 100, offset = 0, voucherType, dateFrom, dateTo, search, auditStatus, isCritical, criticalReason } = req.query;
    const parsedLimit = parseInt(limit);
    const parsedOffset = parseInt(offset);
    const result = db.getAllVouchers({
      limit: parsedLimit,
      offset: parsedOffset,
      voucherType,
      dateFrom,
      dateTo,
      search,
      auditStatus,
      isCritical,
      criticalReason
    });
    res.json({
      vouchers: result.vouchers,
      total: result.total,
      limit: parsedLimit,
      offset: parsedOffset
    });
  } catch (error) {
    console.error('Error fetching vouchers:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/vouchers/combined
 * Get vouchers from BOTH companies (FOR DB + ODBC CHq Mgmt) with unified view
 * Query params: limit, offset, voucherType, dateFrom, dateTo, search, company (billing|odbc|both)
 */
router.get('/combined', (req, res) => {
  try {
    const { limit = 100, offset = 0, voucherType, dateFrom, dateTo, search, company } = req.query;
    const result = db.getAllVouchersCombined({
      limit: parseInt(limit),
      offset: parseInt(offset),
      voucherType,
      dateFrom,
      dateTo,
      search,
      company: company === 'both' ? undefined : company
    });
    res.json({
      vouchers: result.vouchers,
      total: result.total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (error) {
    console.error('Error fetching combined vouchers:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/vouchers/combined-types
 * Get voucher types from both companies merged
 */
router.get('/combined-types', (req, res) => {
  try {
    const types = db.getCombinedVoucherTypes();
    res.json(types);
  } catch (error) {
    console.error('Error fetching combined voucher types:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/vouchers/types
 * Get all voucher types with counts
 */
router.get('/types', (req, res) => {
  try {
    const types = db.getVoucherTypes();
    res.json(types);
  } catch (error) {
    console.error('Error fetching voucher types:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/vouchers/deleted
 * Get deleted vouchers
 */
router.get('/deleted', (req, res) => {
  try {
    const { limit = 500, offset = 0, voucherType, dateFrom, dateTo } = req.query;
    const vouchers = db.getDeletedVouchers({
      limit: parseInt(limit),
      offset: parseInt(offset),
      voucherType,
      dateFrom,
      dateTo
    });
    const count = db.getDeletedVouchersCount();
    res.json({
      success: true,
      count,
      vouchers
    });
  } catch (error) {
    console.error('Error fetching deleted vouchers:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vouchers/restore/:guid
 * Restore a deleted voucher
 */
router.post('/restore/:guid', (req, res) => {
  try {
    const { guid } = req.params;
    const result = db.restoreDeletedVoucher(guid);
    if (result.changes > 0) {
      res.json({ success: true, message: 'Voucher restored successfully' });
    } else {
      res.status(404).json({ success: false, error: 'Voucher not found or not deleted' });
    }
  } catch (error) {
    console.error('Error restoring voucher:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/vouchers/:id/critical
 * Mark/unmark a voucher as critical
 */
router.patch('/:id/critical', (req, res) => {
  try {
    const { id } = req.params;
    const { is_critical } = req.body;
    const result = db.db.prepare('UPDATE bills SET is_critical = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(is_critical ? 1 : 0, id);
    if (result.changes > 0) {
      res.json({ success: true, id: parseInt(id), is_critical: is_critical ? 1 : 0 });
    } else {
      res.status(404).json({ error: 'Voucher not found' });
    }
  } catch (error) {
    console.error('Error updating critical status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/vouchers/:id/audit-status
 * Update audit status of a voucher
 */
router.patch('/:id/audit-status', (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const valid = [null, 'audited', 'need_to_ask', 'non_audited'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${valid.join(', ')}` });
    }
    // When setting to 'audited', clear is_critical flag but keep critical_reason for filtering
    let sql;
    if (status === 'audited') {
      sql = 'UPDATE bills SET audit_status = ?, is_critical = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    } else {
      sql = 'UPDATE bills SET audit_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?';
    }
    const result = db.db.prepare(sql).run(status, id);
    if (result.changes > 0) {
      res.json({ success: true, id: parseInt(id), audit_status: status });
    } else {
      res.status(404).json({ error: 'Voucher not found' });
    }
  } catch (error) {
    console.error('Error updating audit status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/vouchers/bulk-audit
 * Bulk update audit status for multiple vouchers
 */
router.patch('/bulk-audit', (req, res) => {
  try {
    const { ids, status } = req.body;
    const valid = [null, 'audited', 'need_to_ask', 'non_audited'];
    if (!valid.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${valid.join(', ')}` });
    }
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'ids must be a non-empty array' });
    }
    const placeholders = ids.map(() => '?').join(',');
    // When setting to 'audited', clear is_critical flag but keep critical_reason for filtering
    let sql;
    if (status === 'audited') {
      sql = `UPDATE bills SET audit_status = ?, is_critical = 0, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`;
    } else {
      sql = `UPDATE bills SET audit_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`;
    }
    const result = db.db.prepare(sql).run(status, ...ids);
    res.json({ success: true, updated: result.changes });
  } catch (error) {
    console.error('Error bulk updating audit status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/vouchers/permanent/:guid
 * Permanently delete a voucher (only works on already soft-deleted vouchers)
 */
router.delete('/permanent/:guid', (req, res) => {
  try {
    const { guid } = req.params;
    const result = db.permanentlyDeleteVoucher(guid);
    if (result.changes > 0) {
      res.json({ success: true, message: 'Voucher permanently deleted' });
    } else {
      res.status(404).json({ success: false, error: 'Voucher not found or not in deleted state' });
    }
  } catch (error) {
    console.error('Error permanently deleting voucher:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/vouchers/backfill-timestamps
 * Backfill tally_created_datetime for existing vouchers that don't have it yet.
 * Fetches UPDATEDDATETIME from Tally in batches.
 */
router.post('/backfill-timestamps', async (req, res) => {
  try {
    // Get vouchers missing tally_created_datetime
    const missing = db.db.prepare(
      "SELECT tally_master_id, tally_guid FROM bills WHERE (tally_created_datetime IS NULL OR tally_created_datetime = '') AND (is_deleted = 0 OR is_deleted IS NULL) ORDER BY CAST(tally_master_id AS INTEGER) DESC LIMIT 500"
    ).all();

    if (missing.length === 0) {
      return res.json({ success: true, message: 'All vouchers already have timestamps', updated: 0 });
    }

    console.log(`[Backfill] Fetching UPDATEDDATETIME for ${missing.length} vouchers from Tally...`);

    // Fetch in batch via TDL collection
    const companyVar = tallyConnector.companyName ? `<SVCURRENTCOMPANY>${tallyConnector.escapeXml(tallyConnector.companyName)}</SVCURRENTCOMPANY>` : '';
    const minId = Math.min(...missing.map(m => parseInt(m.tally_master_id) || 0));

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>BackfillTS</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="BackfillTS">
<TYPE>Voucher</TYPE>
<FILTER>MinMasterId</FILTER>
<FETCH>MASTERID, GUID, UPDATEDDATETIME, OBJECTUPDATEACTION, ENTEREDBY</FETCH>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="MinMasterId">$MASTERID >= ${minId}</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    const response = await tallyConnector.sendRequest(xml);
    let vouchers = response?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER;
    if (!vouchers) return res.json({ success: true, message: 'No vouchers returned from Tally', updated: 0 });
    if (!Array.isArray(vouchers)) vouchers = [vouchers];

    // Build lookup by masterId
    const tsMap = {};
    for (const v of vouchers) {
      const mid = String(v.MASTERID?._ || v.MASTERID || '').trim();
      const udt = String(v.UPDATEDDATETIME?._ || v.UPDATEDDATETIME || '').trim();
      const action = (v.OBJECTUPDATEACTION?._ || v.OBJECTUPDATEACTION || '').trim();
      const entBy = (v.ENTEREDBY?._ || v.ENTEREDBY || '').trim();
      if (mid && udt && udt !== '000000000') tsMap[mid] = { udt, action, entBy };
    }

    // Update DB
    const updateStmt = db.db.prepare(
      "UPDATE bills SET tally_created_datetime = ?, tally_updated_datetime = ?, object_update_action = ?, entered_by = CASE WHEN entered_by IS NULL OR entered_by = '' THEN ? ELSE entered_by END WHERE tally_master_id = ? AND (tally_created_datetime IS NULL OR tally_created_datetime = '')"
    );

    let updated = 0;
    for (const m of missing) {
      const data = tsMap[m.tally_master_id];
      if (data) {
        updateStmt.run(data.udt, data.udt, data.action, data.entBy, m.tally_master_id);
        updated++;
      }
    }

    console.log(`[Backfill] Updated ${updated}/${missing.length} vouchers with UPDATEDDATETIME`);
    res.json({ success: true, updated, total: missing.length, fetched: Object.keys(tsMap).length });
  } catch (error) {
    console.error('Error backfilling timestamps:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
