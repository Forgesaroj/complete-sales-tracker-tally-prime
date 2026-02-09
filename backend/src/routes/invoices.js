/**
 * Invoices Routes
 * Invoice creation and pending invoices management
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * POST /api/invoice
 * Create Sales Invoice in Tally (with inventory items)
 * If Tally is offline, saves locally with daily invoice number (DB-YYYYMMDD-NNN)
 * Body: { partyName, items: [{stockItem, quantity, rate, unit}], narration, voucherType, salesLedger }
 */
router.post('/', async (req, res) => {
  try {
    const { partyName, items, narration, voucherType, salesLedger, date } = req.body;

    if (!partyName) {
      return res.status(400).json({ error: 'partyName is required' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array is required with at least one item' });
    }

    // Validate items
    for (const item of items) {
      if (!item.stockItem) {
        return res.status(400).json({ error: 'Each item must have stockItem name' });
      }
      if (!item.quantity || item.quantity <= 0) {
        return res.status(400).json({ error: 'Each item must have valid quantity' });
      }
      if (!item.rate || item.rate <= 0) {
        return res.status(400).json({ error: 'Each item must have valid rate' });
      }
    }

    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => sum + (item.amount || item.quantity * item.rate), 0);

    console.log('Creating invoice with items:', JSON.stringify(items, null, 2));

    // Check if Tally is connected
    const connectionStatus = await tallyConnector.checkConnection();

    if (connectionStatus.connected) {
      // Tally is online - try to create invoice directly
      try {
        const result = await tallyConnector.createSalesInvoice({
          partyName,
          items,
          narration: narration || 'Invoice created via Dashboard',
          voucherType: voucherType || 'Sales',
          salesLedger: salesLedger || '1 Sales A/c',
          date
        });

        if (result.success) {
          return res.json({
            success: true,
            message: 'Invoice created successfully in Tally',
            created: result.created,
            mode: 'online'
          });
        } else {
          // Tally returned error - save locally
          console.log('Tally error, saving locally:', result.error);
          const pending = db.createPendingInvoice({
            partyName,
            items,
            totalAmount,
            narration: narration || 'Invoice created via Dashboard',
            voucherType: voucherType || 'Sales',
            salesLedger: salesLedger || '1 Sales A/c',
            date
          });

          return res.json({
            success: true,
            message: `Invoice saved locally (Tally error: ${result.error}). Will sync when Tally is available.`,
            invoiceNumber: pending.invoiceNumber,
            mode: 'offline',
            pendingId: pending.id
          });
        }
      } catch (tallyError) {
        // Network error during creation - save locally
        console.log('Tally network error, saving locally:', tallyError.message);
        const pending = db.createPendingInvoice({
          partyName,
          items,
          totalAmount,
          narration: narration || 'Invoice created via Dashboard',
          voucherType: voucherType || 'Sales',
          salesLedger: salesLedger || '1 Sales A/c',
          date
        });

        return res.json({
          success: true,
          message: 'Invoice saved locally. Will sync when Tally is available.',
          invoiceNumber: pending.invoiceNumber,
          mode: 'offline',
          pendingId: pending.id
        });
      }
    } else {
      // Tally is offline - save locally
      console.log('Tally offline, saving invoice locally');
      const pending = db.createPendingInvoice({
        partyName,
        items,
        totalAmount,
        narration: narration || 'Invoice created via Dashboard',
        voucherType: voucherType || 'Sales',
        salesLedger: salesLedger || '1 Sales A/c',
        date
      });

      return res.json({
        success: true,
        message: 'Tally is offline. Invoice saved locally and will sync when Tally is available.',
        invoiceNumber: pending.invoiceNumber,
        mode: 'offline',
        pendingId: pending.id
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/invoice/simple
 * Create simple Sales voucher (without inventory - for services)
 * Body: { partyName, amount, narration, voucherType, salesLedger }
 */
router.post('/simple', async (req, res) => {
  try {
    const { partyName, amount, narration, voucherType, salesLedger, date } = req.body;

    if (!partyName) {
      return res.status(400).json({ error: 'partyName is required' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const result = await tallyConnector.createSimpleSalesVoucher({
      partyName,
      amount,
      narration: narration || 'Sales via Dashboard',
      voucherType: voucherType || 'Sales',
      salesLedger: salesLedger || 'Sales Account',
      date
    });

    if (result.success) {
      res.json({
        success: true,
        message: 'Sales voucher created successfully in Tally',
        created: result.created
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error || 'Failed to create sales voucher'
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== PENDING INVOICES (OFFLINE MODE) ====================

/**
 * GET /api/invoice/pending
 * Get all pending invoices waiting to sync
 */
router.get('/pending', (req, res) => {
  try {
    const invoices = db.getAllPendingInvoices();
    // Parse items JSON for each invoice
    const parsed = invoices.map(inv => ({
      ...inv,
      items: JSON.parse(inv.items)
    }));
    res.json({
      success: true,
      count: parsed.length,
      invoices: parsed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/invoice/pending/count
 * Get count of pending invoices
 */
router.get('/pending/count', (req, res) => {
  try {
    const count = db.getPendingInvoiceCount();
    const todayCount = db.getTodayInvoiceCount();
    res.json({
      success: true,
      pendingCount: count,
      todayInvoiceCount: todayCount
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/invoice/history
 * Get dashboard bill history (all statuses) with optional date filter
 */
router.get('/history', (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    const invoices = db.getDashboardBillHistory(fromDate, toDate);
    // Parse items JSON for each invoice
    const parsed = invoices.map(inv => ({
      ...inv,
      items: JSON.parse(inv.items)
    }));
    res.json({
      success: true,
      count: parsed.length,
      invoices: parsed
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/invoice/summary
 * Get dashboard bill summary for a date (default: today)
 */
router.get('/summary', (req, res) => {
  try {
    const { date } = req.query;
    const summary = db.getDashboardBillSummary(date);
    res.json({
      success: true,
      date: date || new Date().toISOString().split('T')[0],
      ...summary
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/invoice/pending/sync
 * Manually trigger sync of all pending invoices
 */
router.post('/pending/sync', async (req, res) => {
  try {
    // Check Tally connection first
    const connectionStatus = await tallyConnector.checkConnection();
    if (!connectionStatus.connected) {
      return res.status(503).json({
        success: false,
        error: 'Tally is not connected. Cannot sync pending invoices.'
      });
    }

    const pendingInvoices = db.getPendingInvoices();
    if (pendingInvoices.length === 0) {
      return res.json({
        success: true,
        message: 'No pending invoices to sync',
        synced: 0,
        failed: 0
      });
    }

    let synced = 0;
    let failed = 0;
    const errors = [];

    for (const invoice of pendingInvoices) {
      try {
        const items = JSON.parse(invoice.items);
        const result = await tallyConnector.createSalesInvoice({
          partyName: invoice.party_name,
          items,
          narration: invoice.narration || `Dashboard Invoice: ${invoice.invoice_number}`,
          voucherType: invoice.voucher_type || 'Sales',
          salesLedger: invoice.sales_ledger || '1 Sales A/c',
          date: invoice.invoice_date
        });

        if (result.success) {
          // Save the Tally MasterID/VoucherId so sync recognizes it
          db.updatePendingInvoiceStatus(invoice.id, 'synced', null, {
            voucherId: result.voucherId,
            guid: result.guid,
            voucherNumber: result.voucherNumber
          });
          synced++;
          console.log(`Synced pending invoice ${invoice.invoice_number} to Tally (MasterID: ${result.voucherId})`);
        } else {
          db.updatePendingInvoiceStatus(invoice.id, 'failed', result.error);
          failed++;
          errors.push({ invoiceNumber: invoice.invoice_number, error: result.error });
        }
      } catch (err) {
        db.updatePendingInvoiceStatus(invoice.id, 'failed', err.message);
        failed++;
        errors.push({ invoiceNumber: invoice.invoice_number, error: err.message });
      }
    }

    res.json({
      success: true,
      message: `Sync complete: ${synced} synced, ${failed} failed`,
      synced,
      failed,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/invoice/pending/retry-failed
 * Reset failed invoices back to pending for retry
 */
router.post('/pending/retry-failed', (req, res) => {
  try {
    const result = db.db.prepare(`
      UPDATE pending_invoices
      SET status = 'pending', sync_error = NULL
      WHERE status = 'failed'
    `).run();
    res.json({
      success: true,
      message: `${result.changes} failed invoices reset to pending`,
      count: result.changes
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/invoice/pending/:id
 * Delete a pending invoice
 */
router.delete('/pending/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.db.prepare('DELETE FROM pending_invoices WHERE id = ?').run(id);
    res.json({ success: true, message: 'Pending invoice deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/invoice/godowns
 * Fetch godowns (warehouses) from Tally
 */
router.get('/godowns', async (req, res) => {
  try {
    const godowns = await tallyConnector.getGodowns();
    res.json({
      success: true,
      count: godowns.length,
      godowns
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
