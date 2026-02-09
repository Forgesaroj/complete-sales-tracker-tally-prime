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
    const { limit = 500, offset = 0, voucherType, dateFrom, dateTo } = req.query;
    const vouchers = db.getAllVouchers({
      limit: parseInt(limit),
      offset: parseInt(offset),
      voucherType,
      dateFrom,
      dateTo
    });
    res.json(vouchers);
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
