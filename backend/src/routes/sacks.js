/**
 * Sacks Routes
 * Bundle/sack management for dispatch
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';

const router = Router();

/**
 * POST /api/sacks
 * Create new sack
 */
router.post('/', (req, res) => {
  try {
    const { customerName, notes, userId } = req.body;

    if (!customerName) {
      return res.status(400).json({ error: 'customerName is required' });
    }

    const result = db.createSack({
      customerName,
      notes,
      createdBy: userId || 1
    });

    res.json({
      success: true,
      id: result.id,
      sackNumber: result.sackNumber
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sacks
 * Get all sacks
 */
router.get('/', (req, res) => {
  try {
    const { status } = req.query;
    const sacks = db.getAllSacks(status);
    res.json(sacks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sacks/:id
 * Get sack with items
 */
router.get('/:id', (req, res) => {
  try {
    const sack = db.getSackById(req.params.id);
    if (!sack) {
      return res.status(404).json({ error: 'Sack not found' });
    }
    res.json(sack);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sacks/:id/items
 * Add item to sack
 */
router.post('/:id/items', (req, res) => {
  try {
    const sackId = parseInt(req.params.id);
    const { billId, externalVendor, externalAmount, description } = req.body;

    if (!billId && !externalVendor) {
      return res.status(400).json({ error: 'Either billId or externalVendor is required' });
    }

    // Verify sack exists
    const sack = db.getSackById(sackId);
    if (!sack) {
      return res.status(404).json({ error: 'Sack not found' });
    }

    // If billId provided, verify it exists
    if (billId) {
      const bill = db.getBillById(billId);
      if (!bill) {
        return res.status(404).json({ error: 'Bill not found' });
      }
    }

    const result = db.addSackItem({
      sackId,
      billId,
      externalVendor,
      externalAmount,
      description
    });

    res.json({
      success: true,
      itemId: result.lastInsertRowid
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/sacks/:id/status
 * Update sack status
 */
router.patch('/:id/status', (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['packing', 'ready', 'dispatched'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = db.updateSackStatus(req.params.id, status);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Sack not found' });
    }

    // Broadcast status change
    const io = req.app.get('io');
    if (io) {
      io.emit('sack:statusChanged', {
        sackId: parseInt(req.params.id),
        newStatus: status
      });
    }

    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
