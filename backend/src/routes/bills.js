/**
 * Bills Routes
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';
import config from '../config/default.js';

const router = Router();

/**
 * GET /api/bills
 * Get bills with optional filters
 */
router.get('/', (req, res) => {
  try {
    const { date, status, voucherType } = req.query;

    let bills;
    if (date) {
      bills = db.getBillsByDate(date);
    } else {
      bills = db.getTodayBills();
    }

    // Apply filters
    if (status) {
      bills = bills.filter(b => b.payment_status === status);
    }
    if (voucherType) {
      bills = bills.filter(b => b.voucher_type === voucherType);
    }

    // Include cached items if requested
    if (req.query.includeItems === 'true' && bills.length > 0) {
      const billIds = bills.map(b => b.id);
      const itemsMap = db.getBillItemsBatch(billIds);
      bills = bills.map(b => ({
        ...b,
        items: (itemsMap[b.id] || []).map(i => ({
          stockItem: i.stock_item,
          quantity: i.quantity,
          rate: i.rate,
          amount: i.amount,
          godown: i.godown || '',
          unit: i.unit || 'Nos'
        }))
      }));
    }

    res.json(bills);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bills/pending
 * Get CRITICAL pending bills (those with UDF payment values - exceptional cases)
 */
router.get('/pending', (req, res) => {
  try {
    const bills = db.getPendingBills();
    const counts = db.getPendingBillsCounts();
    res.json({
      bills,
      counts,
      description: 'Critical pending bills with UDF payment values'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bills/pending/all
 * Get ALL pending sales bills (both critical and normal)
 */
router.get('/pending/all', (req, res) => {
  try {
    const bills = db.getAllPendingSalesBills();
    const counts = db.getPendingBillsCounts();
    res.json({
      bills,
      counts,
      description: 'All pending sales bills (critical ones listed first)'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bills/pending/counts
 * Get counts of critical vs normal pending bills
 */
router.get('/pending/counts', (req, res) => {
  try {
    const counts = db.getPendingBillsCounts();
    res.json(counts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bills/batch-items
 * Get items for multiple bills in one request (from DB cache only - fast)
 */
router.get('/batch-items', (req, res) => {
  try {
    const { ids } = req.query;
    if (!ids) return res.json({});
    const billIds = ids.split(',').map(Number).filter(id => !isNaN(id));
    const itemsMap = db.getBillItemsBatch(billIds);

    // Format items
    const result = {};
    for (const [billId, items] of Object.entries(itemsMap)) {
      result[billId] = items.map(i => ({
        stockItem: i.stock_item,
        quantity: i.quantity,
        rate: i.rate,
        amount: i.amount,
        godown: i.godown || '',
        unit: i.unit || 'Nos'
      }));
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bills/:id/print-data
 * Get all data needed to print a bill (bill + items + party + business info)
 */
router.get('/:id/print-data', (req, res) => {
  try {
    const bill = db.getBillById(req.params.id);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    // Get items from cache
    const rawItems = db.getBillItems(bill.id);
    const items = rawItems.map(i => ({
      stockItem: i.stock_item,
      quantity: i.quantity,
      rate: i.rate,
      amount: i.amount,
      unit: i.unit || 'Nos'
    }));

    // Get party details
    const party = db.getPartyByName(bill.party_name);

    // Get business settings
    const businessName = db.getSetting('business_name') || tallyConnector.companyName || '';
    const businessAddress = db.getSetting('business_address') || '';
    const businessPhone = db.getSetting('business_phone') || '';
    const businessPAN = db.getSetting('business_pan') || '';

    res.json({
      success: true,
      bill: {
        id: bill.id,
        voucherNumber: bill.voucher_number,
        voucherType: bill.voucher_type,
        voucherDate: bill.voucher_date,
        partyName: bill.party_name,
        amount: bill.amount,
        narration: bill.narration
      },
      party: party ? {
        address: party.address,
        phone: party.phone,
        email: party.email,
        gstin: party.gstin
      } : null,
      items,
      business: { businessName, businessAddress, businessPhone, businessPAN }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bills/:id
 * Get single bill with receipts
 */
router.get('/:id', (req, res) => {
  try {
    const bill = db.getBillById(req.params.id);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const receipts = db.getReceiptsByBill(bill.id);
    res.json({ ...bill, receipts });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bills/:id/items
 * Get line items for a bill - first checks database cache, then Tally if needed
 * Query params:
 *   - refresh=true: Force refresh from Tally
 */
router.get('/:id/items', async (req, res) => {
  try {
    const bill = db.getBillById(req.params.id);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    const forceRefresh = req.query.refresh === 'true';

    // Check if items are cached in database (and not forcing refresh)
    if (!forceRefresh && db.hasBillItemsCached(bill.id)) {
      const cachedItems = db.getBillItems(bill.id);
      return res.json({
        success: true,
        billId: bill.id,
        voucherNumber: bill.voucher_number,
        partyName: bill.party_name,
        totalAmount: bill.amount,
        items: cachedItems.map(i => ({
          stockItem: i.stock_item,
          quantity: i.quantity,
          rate: i.rate,
          amount: i.amount,
          godown: i.godown || '',
          unit: i.unit || 'Nos'
        })),
        itemCount: cachedItems.length,
        cached: true
      });
    }

    // Fetch from Tally
    const result = await tallyConnector.getCompleteVoucher(bill.tally_master_id);
    if (!result.success) {
      // If Tally fails but we have cached items, return them
      if (db.hasBillItemsCached(bill.id)) {
        const cachedItems = db.getBillItems(bill.id);
        return res.json({
          success: true,
          billId: bill.id,
          voucherNumber: bill.voucher_number,
          partyName: bill.party_name,
          totalAmount: bill.amount,
          items: cachedItems.map(i => ({
            stockItem: i.stock_item,
            quantity: i.quantity,
            rate: i.rate,
            amount: i.amount,
            godown: i.godown || '',
            unit: i.unit || 'Nos'
          })),
          itemCount: cachedItems.length,
          cached: true,
          tallyError: result.error
        });
      }
      return res.status(500).json({ error: result.error || 'Failed to fetch voucher from Tally' });
    }

    const voucher = result.voucher;

    // Parse inventory entries (line items)
    let items = [];
    const inventoryEntries = voucher?.['ALLINVENTORYENTRIES.LIST'] || voucher?.ALLINVENTORYENTRIES?.LIST || [];
    const entriesArray = Array.isArray(inventoryEntries) ? inventoryEntries : [inventoryEntries].filter(Boolean);

    // Helper to extract value from Tally XML (handles both direct values and TYPE attributes)
    const extractValue = (field) => {
      if (!field) return '';
      if (typeof field === 'object' && field._) return field._;
      return String(field);
    };

    // Helper to parse quantity strings like "7 ps" or " 20 ps"
    const parseQty = (qtyStr) => {
      const str = extractValue(qtyStr);
      const match = str.match(/[\d.]+/);
      return match ? parseFloat(match[0]) : 0;
    };

    // Helper to parse rate strings like "690.00/ps"
    const parseRate = (rateStr) => {
      const str = extractValue(rateStr);
      const match = str.match(/[\d.]+/);
      return match ? parseFloat(match[0]) : 0;
    };

    // Helper to extract unit from quantity string like "7 ps" or "20 Nos"
    const parseUnit = (qtyStr) => {
      const str = extractValue(qtyStr);
      const match = str.match(/[\d.]+\s*(.+)/);
      return match ? match[1].trim() : 'Nos';
    };

    for (const entry of entriesArray) {
      if (!entry) continue;

      const stockItem = extractValue(entry.STOCKITEMNAME);
      const quantity = parseQty(entry.ACTUALQTY) || parseQty(entry.BILLEDQTY) || 0;
      const rate = parseRate(entry.RATE) || 0;
      const amount = parseFloat(extractValue(entry.AMOUNT)) || 0;
      const unit = parseUnit(entry.ACTUALQTY) || parseUnit(entry.BILLEDQTY) || 'Nos';

      // Debug: log raw entry for first item
      if (items.length === 0) {
        console.log('[DEBUG items] Raw entry keys:', Object.keys(entry));
        console.log('[DEBUG items] ACTUALQTY:', JSON.stringify(entry.ACTUALQTY));
        console.log('[DEBUG items] BILLEDQTY:', JSON.stringify(entry.BILLEDQTY));
        console.log('[DEBUG items] RATE:', JSON.stringify(entry.RATE));
        console.log('[DEBUG items] AMOUNT:', JSON.stringify(entry.AMOUNT));
        console.log('[DEBUG items] Parsed → qty:', quantity, 'rate:', rate, 'amount:', amount);
      }

      // Get godown from batch allocations or direct
      let godown = '';
      const batchList = entry['BATCHALLOCATIONS.LIST'] || entry.BATCHALLOCATIONS?.LIST;
      if (batchList) {
        const batch = Array.isArray(batchList) ? batchList[0] : batchList;
        godown = extractValue(batch?.GODOWNNAME);
      }
      if (!godown) godown = extractValue(entry.GODOWNNAME);

      if (stockItem) {
        items.push({
          stockItem,
          quantity: Math.abs(quantity),
          rate: Math.abs(rate),
          amount: Math.abs(amount),
          godown,
          unit
        });
      }
    }

    // Save items to database cache
    if (items.length > 0) {
      db.saveBillItems(bill.id, items);
    }

    res.json({
      success: true,
      billId: bill.id,
      voucherNumber: bill.voucher_number,
      partyName: bill.party_name,
      totalAmount: bill.amount,
      items,
      itemCount: items.length,
      cached: false
    });
  } catch (error) {
    console.error('Error fetching bill items:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/bills/:id/items
 * Update ALL items on a pending bill in Tally (full replacement)
 * This allows adding, editing, and deleting items by sending the complete list
 */
router.put('/:id/items', async (req, res) => {
  try {
    const bill = db.getBillById(req.params.id);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    if (bill.voucher_type !== 'Pending Sales Bill') {
      return res.status(400).json({ error: 'Can only modify items on Pending Sales Bills' });
    }

    const { items } = req.body;
    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'items array is required' });
    }

    // Validate all items
    for (const item of items) {
      if (!item.stockItem || !item.quantity || !item.rate) {
        return res.status(400).json({ error: 'Each item must have stockItem, quantity, and rate' });
      }
    }

    // Update all items on pending bill using Tally connector
    console.log('Updating items:', JSON.stringify(items, null, 2));
    const result = await tallyConnector.updatePendingBillItems({
      masterId: bill.tally_master_id,
      guid: bill.tally_guid,
      voucherNumber: bill.voucher_number,
      voucherDate: bill.voucher_date,
      partyName: bill.party_name,
      items: items.map(item => ({
        stockItem: item.stockItem,
        quantity: parseFloat(item.quantity),
        rate: parseFloat(item.rate),
        amount: parseFloat(item.quantity) * parseFloat(item.rate),
        godown: item.godown || '',
        unit: item.unit || 'Nos'
      }))
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to update items' });
    }

    // Clear and update the local items cache
    db.clearBillItemsCache(bill.id);
    db.saveBillItems(bill.id, items.map(item => ({
      stockItem: item.stockItem,
      quantity: parseFloat(item.quantity),
      rate: parseFloat(item.rate),
      amount: parseFloat(item.quantity) * parseFloat(item.rate),
      godown: item.godown || '',
      unit: item.unit || 'Nos'
    })));

    // Update bill amount in database
    db.db.prepare('UPDATE bills SET amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(result.newTotal, bill.id);

    // Broadcast update via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.emit('bill:itemsUpdated', {
        billId: bill.id,
        itemCount: items.length,
        newTotal: result.newTotal
      });
    }

    res.json({
      success: true,
      message: 'Items updated successfully',
      itemCount: items.length,
      newTotal: result.newTotal
    });
  } catch (error) {
    console.error('Error updating bill items:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/bills/:id/items
 * Add a single item to a pending bill in Tally
 */
router.post('/:id/items', async (req, res) => {
  try {
    const bill = db.getBillById(req.params.id);
    if (!bill) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    if (bill.voucher_type !== 'Pending Sales Bill') {
      return res.status(400).json({ error: 'Can only add items to Pending Sales Bills' });
    }

    const { stockItem, quantity, rate, godown } = req.body;
    if (!stockItem || !quantity || !rate) {
      return res.status(400).json({ error: 'stockItem, quantity, and rate are required' });
    }

    // Add item to pending bill using Tally connector
    const result = await tallyConnector.addItemToPendingBill({
      masterId: bill.tally_master_id,
      guid: bill.tally_guid,
      voucherNumber: bill.voucher_number,
      voucherDate: bill.voucher_date,
      partyName: bill.party_name,
      newItem: {
        stockItem,
        quantity: parseFloat(quantity),
        rate: parseFloat(rate),
        amount: parseFloat(quantity) * parseFloat(rate),
        godown: godown || ''
      }
    });

    if (!result.success) {
      return res.status(500).json({ error: result.error || 'Failed to add item' });
    }

    // Broadcast update via WebSocket
    const io = req.app.get('io');
    if (io) {
      io.emit('bill:itemAdded', {
        billId: bill.id,
        item: { stockItem, quantity, rate, amount: quantity * rate }
      });
    }

    res.json({
      success: true,
      message: 'Item added successfully',
      item: { stockItem, quantity, rate, amount: quantity * rate }
    });
  } catch (error) {
    console.error('Error adding item to bill:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PATCH /api/bills/:id/dispatch
 * Update bill dispatch status
 */
router.patch('/:id/dispatch', (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = Object.values(config.billStatus);

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const result = db.updateBillDispatchStatus(req.params.id, status);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Broadcast status change
    const io = req.app.get('io');
    if (io) {
      io.emit('bill:dispatchChanged', {
        billId: parseInt(req.params.id),
        newStatus: status
      });
    }

    res.json({ success: true, status });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
