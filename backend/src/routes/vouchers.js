/**
 * Vouchers Routes
 * API endpoints for ALL voucher types (Sales, Receipt, Payment, Journal, Purchase, etc.)
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';

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

export default router;
