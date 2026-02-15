/**
 * Collection Routes
 * Cheque collection management — assign cheques to staff, track results, create Tally receipts
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

function co() { return db.getCompanyNames(); }

// ==================== STAFF ====================

router.get('/staff', (req, res) => {
  try {
    const activeOnly = req.query.active !== '0';
    const staff = db.getCollectionStaff(activeOnly);
    res.json({ success: true, staff });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/staff', (req, res) => {
  try {
    const { name, phone, tallyLedgerName } = req.body;
    if (!name || !tallyLedgerName) return res.status(400).json({ success: false, error: 'Name and Tally ledger name required' });
    const result = db.createCollectionStaff({ name, phone, tallyLedgerName });
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/staff/:id', (req, res) => {
  try {
    db.updateCollectionStaff(parseInt(req.params.id), req.body);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/staff/:id', (req, res) => {
  try {
    db.deactivateCollectionStaff(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/staff/:id/history', (req, res) => {
  try {
    const batches = db.getCollectionBatches({ staffId: parseInt(req.params.id) });
    const stats = db.getCollectionStats(parseInt(req.params.id));
    res.json({ success: true, batches, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== BATCHES ====================

router.get('/batches', (req, res) => {
  try {
    const { status, staffId, fromDate, toDate } = req.query;
    const batches = db.getCollectionBatches({ status, staffId: staffId ? parseInt(staffId) : null, fromDate, toDate });
    res.json({ success: true, batches });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/batches', (req, res) => {
  try {
    const { staffId, chequeIds } = req.body;
    if (!staffId || !chequeIds || !chequeIds.length) return res.status(400).json({ success: false, error: 'Staff ID and cheque IDs required' });
    const result = db.createCollectionBatch(parseInt(staffId), chequeIds.map(Number));
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/batches/:id', (req, res) => {
  try {
    const batch = db.getCollectionBatchById(parseInt(req.params.id));
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
    const items = db.getCollectionBatchItems(batch.id);
    res.json({ success: true, batch, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/batches/:id/print', (req, res) => {
  try {
    const batch = db.getCollectionBatchById(parseInt(req.params.id));
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });
    const items = db.getCollectionBatchItems(batch.id);
    const staff = db.getCollectionStaffById(batch.staff_id);
    res.json({ success: true, batch, items, staff, printedAt: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/batches/:id/items/:itemId', (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!status) return res.status(400).json({ success: false, error: 'Status required' });
    db.updateBatchItemStatus(parseInt(req.params.itemId), status, notes || '');
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/batches/:id/bulk-update', (req, res) => {
  try {
    const { updates } = req.body;
    if (!updates || !updates.length) return res.status(400).json({ success: false, error: 'Updates required' });
    db.bulkUpdateBatchItems(parseInt(req.params.id), updates);
    const batch = db.getCollectionBatchById(parseInt(req.params.id));
    const items = db.getCollectionBatchItems(batch.id);
    res.json({ success: true, batch, items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/batches/:id/complete', (req, res) => {
  try {
    db.completeBatch(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/batches/:id/create-receipt', async (req, res) => {
  try {
    const batchId = parseInt(req.params.id);
    const batch = db.getCollectionBatchById(batchId);
    if (!batch) return res.status(404).json({ success: false, error: 'Batch not found' });

    const items = db.getCollectionBatchItems(batchId);
    const collectedItems = items.filter(i => i.status === 'collected');
    if (collectedItems.length === 0) return res.status(400).json({ success: false, error: 'No collected cheques to receipt' });

    const receiptData = {
      staffLedger: batch.tally_ledger_name,
      collectedItems: collectedItems.map(i => ({
        partyName: i.party_name,
        amount: i.amount,
        chequeNumber: i.cheque_number,
        chequeDate: i.cheque_date,
        bankName: i.bank_name,
        billRef: i.bill_ref
      })),
      date: batch.assigned_date,
      narration: `Collection batch #${batchId} by ${batch.staff_name} - ${collectedItems.length} cheques`
    };

    const result = await tallyConnector.pushCollectionReceipt(receiptData, co().odbc);

    if (result.success) {
      db.completeBatch(batchId);
      db.markBatchTallySynced(batchId, result.voucherId || '', null);
      res.json({ success: true, tallyResult: result });
    } else {
      db.markBatchTallySynced(batchId, '', result.error || 'Failed');
      res.json({ success: false, error: result.error || 'Tally receipt creation failed', tallyResult: result });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== DATA ====================

router.get('/assignable-cheques', (req, res) => {
  try {
    const cheques = db.getAssignableCheques();
    res.json({ success: true, cheques, count: cheques.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CHEQUE RECEIVABLE (from ODBC Tally) ====================

router.get('/cheque-receivable', async (req, res) => {
  try {
    const receivable = await tallyConnector.getODBCChequeReceivable(co().odbc);
    res.json({ success: true, receivable, count: receivable.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Also provide a local-DB version: extract individual cheques from synced ODBC Sales vouchers
router.get('/cheque-receivable/local', (req, res) => {
  try {
    const { fromDate, toDate, party } = req.query;
    const cheques = db.getODBCChequeReceivable(fromDate, toDate, party);
    res.json({ success: true, cheques, count: cheques.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== PARTY BALANCES (Live Tally) ====================

router.get('/party-balances', async (req, res) => {
  try {
    const companies = co();
    const [billingBalances, odbcBalances, billingBills] = await Promise.all([
      tallyConnector.getAllPartyBalances(companies.billing),
      tallyConnector.getAllPartyBalances(companies.odbc),
      tallyConnector.getLedgerBillAllocations(companies.billing)
    ]);

    // Build unified map keyed by party name
    const balances = {};
    console.log(`[party-balances] billing: ${billingBalances.length}, odbc: ${odbcBalances.length}, bills: ${billingBills.length}`);

    // Billing company balances (total credit — use abs since Tally may return negative for credit balances)
    for (const p of billingBalances) {
      if (!p.name) continue;
      if (!balances[p.name]) balances[p.name] = { billing_balance: 0, odbc_balance: 0, overdue_amount: 0, overdue_count: 0 };
      balances[p.name].billing_balance = Math.abs(p.balance);
    }

    // ODBC company balances
    for (const p of odbcBalances) {
      if (!p.name) continue;
      if (!balances[p.name]) balances[p.name] = { billing_balance: 0, odbc_balance: 0, overdue_amount: 0, overdue_count: 0 };
      balances[p.name].odbc_balance = Math.abs(p.balance);
    }

    // Overdue from billing bill allocations
    for (const party of billingBills) {
      if (!party.partyName) continue;
      if (!balances[party.partyName]) balances[party.partyName] = { billing_balance: 0, odbc_balance: 0, overdue_amount: 0, overdue_count: 0 };
      let overdueAmt = 0, overdueCount = 0;
      for (const bill of party.bills) {
        // Bills with ageing > credit period are overdue; if no credit period, use 30 days default
        const dueDays = bill.creditPeriod || 30;
        if (bill.ageingDays > dueDays) {
          overdueAmt += bill.closingBalance;
          overdueCount++;
        }
      }
      balances[party.partyName].overdue_amount = overdueAmt;
      balances[party.partyName].overdue_count = overdueCount;
    }

    console.log(`[party-balances] final map has ${Object.keys(balances).length} parties`);
    res.json({ success: true, balances, billing_company: companies.billing, odbc_company: companies.odbc });
  } catch (error) {
    console.error('[party-balances] ERROR:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/stats', (req, res) => {
  try {
    const staffId = req.query.staffId ? parseInt(req.query.staffId) : null;
    const stats = db.getCollectionStats(staffId);
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== RECEIPT BOOK ASSIGNMENTS ====================

router.get('/book-assignments', (req, res) => {
  try {
    const { status, staffName } = req.query;
    let sql = 'SELECT * FROM receipt_book_assignments WHERE 1=1';
    const params = [];
    if (status) { sql += ' AND status = ?'; params.push(status); }
    if (staffName) { sql += ' AND staff_name LIKE ?'; params.push(`%${staffName}%`); }
    sql += ' ORDER BY assigned_date DESC, id DESC';
    const assignments = db.db.prepare(sql).all(...params);
    res.json({ success: true, assignments });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/book-assignments', (req, res) => {
  try {
    const { staffName, ranges, assignedDate, routeName, notes } = req.body;
    if (!staffName || !ranges || !ranges.length) {
      return res.status(400).json({ success: false, error: 'Staff name and at least one range required' });
    }
    const date = assignedDate || new Date().toISOString().split('T')[0];
    const stmt = db.db.prepare(
      `INSERT INTO receipt_book_assignments (staff_name, book_start, book_end, available_from, assigned_date, route_name, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const ids = [];
    const insertMany = db.db.transaction((items) => {
      for (const r of items) {
        const result = stmt.run(staffName, r.bookStart, r.bookEnd, r.availableFrom || r.bookStart, date, routeName || null, notes || null);
        ids.push(result.lastInsertRowid);
      }
    });
    insertMany(ranges);
    res.json({ success: true, ids, count: ids.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.put('/book-assignments/:id', (req, res) => {
  try {
    const { status, routeName, notes } = req.body;
    const updates = [];
    const params = [];
    if (status) { updates.push('status = ?'); params.push(status); }
    if (routeName !== undefined) { updates.push('route_name = ?'); params.push(routeName); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'Nothing to update' });
    params.push(parseInt(req.params.id));
    db.db.prepare(`UPDATE receipt_book_assignments SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.delete('/book-assignments/:id', (req, res) => {
  try {
    db.db.prepare('DELETE FROM receipt_book_assignments WHERE id = ?').run(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== COLLECTION POST ====================

router.post('/post', async (req, res) => {
  try {
    const { date, bookNumber, staffName, assignmentId, bookId, entries } = req.body;
    // If bookId provided, look up the book for cycle info
    let book = null;
    if (bookId) {
      book = db.db.prepare('SELECT * FROM receipt_books WHERE id = ?').get(parseInt(bookId));
    }
    if (!entries || !entries.length) {
      return res.status(400).json({ success: false, error: 'At least one entry required' });
    }

    const postDate = (date || new Date().toISOString().split('T')[0]).replace(/-/g, '');
    const voucherType = db.getSetting('vt_collection_post') || 'Dashboard Receipt';
    const results = [];

    // Process entries sequentially (Tally can't handle concurrent XML imports)
    for (const entry of entries) {
      const { receiptNumber, partyName, cash, fonepay, cheque, bankDeposit, discount } = entry;
      const cashAmt = parseFloat(cash) || 0;
      const fonepayAmt = parseFloat(fonepay) || 0;
      const chequeAmt = parseFloat(cheque) || 0;
      const bankAmt = parseFloat(bankDeposit) || 0;
      const discountAmt = parseFloat(discount) || 0;
      const total = cashAmt + fonepayAmt + chequeAmt + bankAmt + discountAmt;

      if (!partyName || total <= 0) {
        results.push({ receiptNumber, partyName, total, success: false, error: 'Missing party or zero amount' });
        continue;
      }

      const paymentModes = {};
      if (cashAmt > 0) paymentModes.cashTeller1 = cashAmt;
      if (fonepayAmt > 0) paymentModes.qrCode = fonepayAmt;
      if (chequeAmt > 0) paymentModes.chequeReceipt = chequeAmt;
      if (bankAmt > 0) paymentModes.bankDeposit = bankAmt;
      if (discountAmt > 0) paymentModes.discount = discountAmt;

      const narration = `Collection Post - Book #${bookNumber || '?'} Rcpt #${receiptNumber || '?'}${staffName ? ' by ' + staffName : ''}`;

      try {
        const result = await tallyConnector.createReceiptWithPaymentModes({
          partyName,
          voucherType,
          voucherNumber: receiptNumber || null,
          narration,
          paymentModes,
          date: postDate,
          company: null
        });

        // Save to tracking table (capture voucherId as tally_master_id)
        const tallyMasterId = result.success ? (result.voucherId || null) : null;
        db.db.prepare(
          `INSERT INTO collection_posts (date, book_number, receipt_number, party_name, cash, fonepay, cheque, bank_deposit, discount, total, staff_name, assignment_id, tally_success, tally_error, tally_master_id, book_id, cycle_number)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(postDate, bookNumber || '', receiptNumber || '', partyName, cashAmt, fonepayAmt, chequeAmt, bankAmt, discountAmt, total, staffName || '', assignmentId || null, result.success ? 1 : 0, result.error || null, tallyMasterId, book ? book.id : null, book ? book.current_cycle : null);

        results.push({ receiptNumber, partyName, total, success: result.success, error: result.error || null, tallyMasterId });
      } catch (err) {
        // Save failed entry
        db.db.prepare(
          `INSERT INTO collection_posts (date, book_number, receipt_number, party_name, cash, fonepay, cheque, bank_deposit, discount, total, staff_name, assignment_id, tally_success, tally_error, tally_master_id, book_id, cycle_number)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(postDate, bookNumber || '', receiptNumber || '', partyName, cashAmt, fonepayAmt, chequeAmt, bankAmt, discountAmt, total, staffName || '', assignmentId || null, 0, err.message, null, book ? book.id : null, book ? book.current_cycle : null);

        results.push({ receiptNumber, partyName, total, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;

    // If all entries succeeded and using book system, check if book should be marked posted
    if (book && successCount === results.length && successCount > 0) {
      // Check if summary matches
      const validation = db.db.prepare(
        `SELECT COUNT(*) as cnt, SUM(total) as total FROM collection_posts WHERE book_id = ? AND cycle_number = ? AND tally_success = 1`
      ).get(book.id, book.current_cycle);
      const summaryMatches = !book.summary_entry_count || (validation.cnt >= book.summary_entry_count);
      if (summaryMatches) {
        db.db.prepare(`UPDATE receipt_books SET status = 'posted' WHERE id = ?`).run(book.id);
      }
    }

    res.json({ success: successCount > 0, results, successCount, totalCount: results.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get existing entries for an assignment (for loading previously posted rows)
router.get('/post/entries', (req, res) => {
  try {
    const { assignmentId } = req.query;
    if (!assignmentId) return res.status(400).json({ success: false, error: 'assignmentId required' });
    const entries = db.db.prepare(
      'SELECT * FROM collection_posts WHERE assignment_id = ? ORDER BY receipt_number ASC, id ASC'
    ).all(parseInt(assignmentId));
    res.json({ success: true, entries });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/post/history', (req, res) => {
  try {
    const { date, bookNumber, staffName } = req.query;
    let sql = 'SELECT * FROM collection_posts WHERE 1=1';
    const params = [];
    if (date) { sql += ' AND date = ?'; params.push(date); }
    if (bookNumber) { sql += ' AND book_number = ?'; params.push(bookNumber); }
    if (staffName) { sql += ' AND staff_name LIKE ?'; params.push(`%${staffName}%`); }
    sql += ' ORDER BY created_at DESC LIMIT 200';
    const posts = db.db.prepare(sql).all(...params);
    res.json({ success: true, posts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Receipt book summaries — grouped by assignment_id, with date ranges and totals
router.get('/post/books', (req, res) => {
  try {
    const books = db.db.prepare(`
      SELECT
        cp.assignment_id,
        cp.book_number,
        cp.staff_name,
        MIN(cp.receipt_number) as first_receipt,
        MAX(cp.receipt_number) as last_receipt,
        MIN(cp.date) as first_date,
        MAX(cp.date) as last_date,
        COUNT(*) as entry_count,
        SUM(CASE WHEN cp.tally_success = 1 THEN 1 ELSE 0 END) as success_count,
        SUM(cp.total) as total_amount,
        SUM(cp.cash) as total_cash,
        SUM(cp.fonepay) as total_fonepay,
        SUM(cp.cheque) as total_cheque,
        SUM(cp.bank_deposit) as total_bank,
        SUM(cp.discount) as total_discount,
        MIN(cp.created_at) as created_at,
        rba.book_start,
        rba.book_end,
        rba.available_from,
        rba.status as assignment_status
      FROM collection_posts cp
      LEFT JOIN receipt_book_assignments rba ON cp.assignment_id = rba.id
      GROUP BY COALESCE(cp.assignment_id, cp.book_number || '-' || cp.staff_name)
      ORDER BY MAX(cp.created_at) DESC
    `).all();
    res.json({ success: true, books });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Search receipt entries across all books
router.get('/post/search', (req, res) => {
  try {
    const { q, dateFrom, dateTo } = req.query;
    let sql = 'SELECT * FROM collection_posts WHERE tally_success = 1';
    const params = [];
    if (q) {
      sql += ' AND (receipt_number LIKE ? OR party_name LIKE ? OR book_number LIKE ?)';
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (dateFrom) { sql += ' AND date >= ?'; params.push(dateFrom.replace(/-/g, '')); }
    if (dateTo) { sql += ' AND date <= ?'; params.push(dateTo.replace(/-/g, '')); }
    sql += ' ORDER BY date DESC, receipt_number ASC LIMIT 200';
    const entries = db.db.prepare(sql).all(...params);
    res.json({ success: true, entries });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== RECEIPT BOOKS (INVENTORY LIFECYCLE) ====================

// Bulk create receipt books from a range
// Generate letter label: 0→A, 1→B, ..., 25→Z, 26→AA, 27→AB, ..., 701→ZZ, 702→AAA
function toLetterLabel(index) {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}

router.post('/books/bulk-create', (req, res) => {
  try {
    const { rangeStart, rangeEnd, pagesPerBook = 50, numberingMode = 'sequential', batchLabel, startBookNumber, restartEvery } = req.body;
    const start = parseInt(rangeStart);
    const end = parseInt(rangeEnd);
    const ppb = parseInt(pagesPerBook);
    if (!start || !end || !ppb || end < start || ppb < 1) {
      return res.status(400).json({ success: false, error: 'Invalid range or pages per book' });
    }

    // Determine starting book number: explicit param > auto (max existing + 1)
    let firstBookNum;
    if (startBookNumber && parseInt(startBookNumber) > 0) {
      firstBookNum = parseInt(startBookNumber);
    } else {
      const maxBook = db.db.prepare('SELECT MAX(book_number) as mx FROM receipt_books').get();
      firstBookNum = (maxBook.mx || 0) + 1;
    }

    const batchId = `batch_${Date.now()}`;
    const books = [];
    const stmt = db.db.prepare(
      `INSERT INTO receipt_books (book_number, book_label, page_start, page_end, pages, numbering_mode, batch_id, available_from)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const insertAll = db.db.transaction(() => {
      let bookNum = firstBookNum;
      if (numberingMode === 'restart') {
        // Restart mode: numbering resets every `restartEvery` pages
        // Each reset group gets a letter (A, B, C...)
        // Within each group, books are pagesPerBook pages each
        const setSize = parseInt(restartEvery) || ppb; // default: same as pagesPerBook (each book is its own set)
        const totalRange = end - start + 1;
        const numSets = Math.ceil(totalRange / setSize);
        const booksPerSet = Math.ceil(setSize / ppb);

        for (let s = 0; s < numSets; s++) {
          const letter = toLetterLabel(s);
          const prefix = batchLabel ? `${batchLabel}-${letter}` : letter;
          for (let b = 0; b < booksPerSet; b++) {
            const pageStart = b * ppb + 1;
            const pageEnd = Math.min(pageStart + ppb - 1, setSize);
            if (pageStart > setSize) break;
            const pages = pageEnd - pageStart + 1;
            const label = `${prefix}`;
            const result = stmt.run(bookNum, label, pageStart, pageEnd, pages, 'restart', batchId, pageStart);
            books.push({ id: result.lastInsertRowid, bookNumber: bookNum, label, pageStart, pageEnd });
            bookNum++;
          }
        }
      } else {
        // Sequential: each book gets a unique range + letter label
        let seqIdx = 0;
        for (let pageStart = start; pageStart <= end; pageStart += ppb) {
          const pageEnd = Math.min(pageStart + ppb - 1, end);
          const pages = pageEnd - pageStart + 1;
          const letter = toLetterLabel(seqIdx);
          const label = batchLabel ? `${batchLabel}-${letter}` : letter;
          const result = stmt.run(bookNum, label, pageStart, pageEnd, pages, 'sequential', batchId, pageStart);
          seqIdx++;
          books.push({ id: result.lastInsertRowid, bookNumber: bookNum, label, pageStart, pageEnd });
          bookNum++;
        }
      }
    });
    insertAll();
    res.json({ success: true, books, count: books.length, batchId });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create single receipt book
router.post('/books', (req, res) => {
  try {
    const { pageStart, pageEnd, label, numberingMode = 'sequential' } = req.body;
    const ps = parseInt(pageStart);
    const pe = parseInt(pageEnd);
    if (!ps || !pe || pe < ps) return res.status(400).json({ success: false, error: 'Invalid page range' });
    const pages = pe - ps + 1;
    // Auto-assign book_number as max existing + 1
    const maxBook = db.db.prepare('SELECT MAX(book_number) as mx FROM receipt_books').get();
    const bookNum = (maxBook.mx || 0) + 1;
    const result = db.db.prepare(
      `INSERT INTO receipt_books (book_number, book_label, page_start, page_end, pages, numbering_mode, available_from)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(bookNum, label || null, ps, pe, pages, numberingMode, ps);
    res.json({ success: true, id: result.lastInsertRowid, bookNumber: bookNum });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// List all receipt books with status counts
router.get('/books', (req, res) => {
  try {
    const { status, assignedTo } = req.query;
    let sql = 'SELECT * FROM receipt_books WHERE 1=1';
    const params = [];
    if (status && status !== 'all') { sql += ' AND status = ?'; params.push(status); }
    if (assignedTo) { sql += ' AND assigned_to LIKE ?'; params.push(`%${assignedTo}%`); }
    sql += ' ORDER BY book_number ASC';
    const books = db.db.prepare(sql).all(...params);

    // Get counts per status
    const counts = {};
    const countRows = db.db.prepare('SELECT status, COUNT(*) as cnt FROM receipt_books GROUP BY status').all();
    for (const r of countRows) counts[r.status] = r.cnt;

    // Get entry counts per book for currently listed books
    const bookIds = books.map(b => b.id);
    if (bookIds.length > 0) {
      const placeholders = bookIds.map(() => '?').join(',');
      const entryCounts = db.db.prepare(
        `SELECT book_id, cycle_number, COUNT(*) as cnt, SUM(CASE WHEN tally_success = 1 THEN 1 ELSE 0 END) as success_cnt,
         SUM(total) as total_amount
         FROM collection_posts WHERE book_id IN (${placeholders}) GROUP BY book_id, cycle_number`
      ).all(...bookIds);
      const entryMap = {};
      for (const ec of entryCounts) {
        if (!entryMap[ec.book_id]) entryMap[ec.book_id] = {};
        entryMap[ec.book_id][ec.cycle_number] = { count: ec.cnt, successCount: ec.success_cnt, totalAmount: ec.total_amount };
      }
      for (const b of books) {
        b.entries = entryMap[b.id] || {};
        const currentCycleData = entryMap[b.id]?.[b.current_cycle];
        b.currentCycleEntries = currentCycleData ? currentCycleData.count : 0;
        b.currentCycleSuccess = currentCycleData ? currentCycleData.successCount : 0;
        b.currentCycleTotal = currentCycleData ? currentCycleData.totalAmount : 0;
      }
    }

    res.json({ success: true, books, counts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get single book detail
router.get('/books/:id', (req, res) => {
  try {
    const book = db.db.prepare('SELECT * FROM receipt_books WHERE id = ?').get(parseInt(req.params.id));
    if (!book) return res.status(404).json({ success: false, error: 'Book not found' });
    res.json({ success: true, book });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update book metadata
router.put('/books/:id', (req, res) => {
  try {
    const { label, notes, routeName } = req.body;
    const updates = [];
    const params = [];
    if (label !== undefined) { updates.push('book_label = ?'); params.push(label); }
    if (notes !== undefined) { updates.push('notes = ?'); params.push(notes); }
    if (routeName !== undefined) { updates.push('route_name = ?'); params.push(routeName); }
    if (updates.length === 0) return res.status(400).json({ success: false, error: 'Nothing to update' });
    params.push(parseInt(req.params.id));
    db.db.prepare(`UPDATE receipt_books SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Delete book (only inactive/ready with no entries)
router.delete('/books/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const book = db.db.prepare('SELECT * FROM receipt_books WHERE id = ?').get(id);
    if (!book) return res.status(404).json({ success: false, error: 'Book not found' });
    if (book.status !== 'inactive' && book.status !== 'ready') {
      return res.status(400).json({ success: false, error: 'Can only delete inactive or ready books' });
    }
    const entryCount = db.db.prepare('SELECT COUNT(*) as cnt FROM collection_posts WHERE book_id = ?').get(id);
    if (entryCount.cnt > 0) return res.status(400).json({ success: false, error: 'Book has entries, cannot delete' });
    db.db.prepare('DELETE FROM receipt_books WHERE id = ?').run(id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Batch mark books as ready (inactive → ready)
router.post('/books/mark-ready', (req, res) => {
  try {
    const { bookIds } = req.body;
    if (!bookIds || !bookIds.length) return res.status(400).json({ success: false, error: 'No book IDs provided' });
    const placeholders = bookIds.map(() => '?').join(',');
    const result = db.db.prepare(
      `UPDATE receipt_books SET status = 'ready' WHERE id IN (${placeholders}) AND status IN ('inactive', 'posted')`
    ).run(...bookIds.map(id => parseInt(id)));
    res.json({ success: true, count: result.changes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Batch mark books as inactive (ready → inactive)
router.post('/books/mark-inactive', (req, res) => {
  try {
    const { bookIds } = req.body;
    if (!bookIds || !bookIds.length) return res.status(400).json({ success: false, error: 'No book IDs provided' });
    const placeholders = bookIds.map(() => '?').join(',');
    const result = db.db.prepare(
      `UPDATE receipt_books SET status = 'inactive' WHERE id IN (${placeholders}) AND status = 'ready'`
    ).run(...bookIds.map(id => parseInt(id)));
    res.json({ success: true, count: result.changes });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Batch assign books (ready → assigned)
router.post('/books/assign', (req, res) => {
  try {
    const { bookIds, staffName, routeName } = req.body;
    if (!bookIds || !bookIds.length || !staffName) {
      return res.status(400).json({ success: false, error: 'Book IDs and staff name required' });
    }
    const today = new Date().toISOString().split('T')[0];
    const assignMany = db.db.transaction(() => {
      const stmt = db.db.prepare(
        `UPDATE receipt_books SET status = 'assigned', current_cycle = current_cycle + 1, assigned_to = ?,
         assigned_date = ?, returned_date = NULL, route_name = ?,
         summary_entry_count = NULL, summary_cash = NULL, summary_fonepay = NULL,
         summary_cheque = NULL, summary_bank_deposit = NULL, summary_discount = NULL,
         summary_total = NULL, summary_entered_at = NULL
         WHERE id = ? AND status = 'ready'`
      );
      let count = 0;
      for (const id of bookIds) {
        const result = stmt.run(staffName.trim(), today, routeName || null, parseInt(id));
        count += result.changes;
      }
      return count;
    });
    const count = assignMany();
    res.json({ success: true, count });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Return book (assigned → returned)
router.post('/books/:id/return', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const today = new Date().toISOString().split('T')[0];
    const result = db.db.prepare(
      `UPDATE receipt_books SET status = 'returned', returned_date = ? WHERE id = ? AND status = 'assigned'`
    ).run(today, id);
    if (result.changes === 0) return res.status(400).json({ success: false, error: 'Book not found or not in assigned status' });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Re-ready book (posted → ready, if unused pages)
router.post('/books/:id/reready', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const book = db.db.prepare('SELECT * FROM receipt_books WHERE id = ?').get(id);
    if (!book) return res.status(404).json({ success: false, error: 'Book not found' });
    if (book.status !== 'posted') return res.status(400).json({ success: false, error: 'Book must be in posted status' });

    // Find max used receipt number for this book's current cycle
    const maxUsed = db.db.prepare(
      `SELECT MAX(CAST(receipt_number AS INTEGER)) as mx FROM collection_posts WHERE book_id = ? AND cycle_number = ? AND tally_success = 1`
    ).get(id, book.current_cycle);
    const nextAvailable = (maxUsed.mx || book.page_start - 1) + 1;

    if (nextAvailable > book.page_end) {
      return res.status(400).json({ success: false, error: 'No unused pages remaining in this book' });
    }

    db.db.prepare(
      `UPDATE receipt_books SET status = 'ready', available_from = ?, assigned_to = NULL, assigned_date = NULL,
       returned_date = NULL, route_name = NULL,
       summary_entry_count = NULL, summary_cash = NULL, summary_fonepay = NULL,
       summary_cheque = NULL, summary_bank_deposit = NULL, summary_discount = NULL,
       summary_total = NULL, summary_entered_at = NULL
       WHERE id = ?`
    ).run(nextAvailable, id);
    res.json({ success: true, availableFrom: nextAvailable, remainingPages: book.page_end - nextAvailable + 1 });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Save book summary (for current cycle)
router.put('/books/:id/summary', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { entryCount, cash, fonepay, cheque, bankDeposit, discount } = req.body;
    const total = (parseFloat(cash) || 0) + (parseFloat(fonepay) || 0) + (parseFloat(cheque) || 0) +
                  (parseFloat(bankDeposit) || 0) + (parseFloat(discount) || 0);
    db.db.prepare(
      `UPDATE receipt_books SET summary_entry_count = ?, summary_cash = ?, summary_fonepay = ?,
       summary_cheque = ?, summary_bank_deposit = ?, summary_discount = ?, summary_total = ?,
       summary_entered_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).run(parseInt(entryCount) || 0, parseFloat(cash) || 0, parseFloat(fonepay) || 0,
          parseFloat(cheque) || 0, parseFloat(bankDeposit) || 0, parseFloat(discount) || 0, total, id);
    res.json({ success: true, total });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get entries for a book (current cycle by default)
router.get('/books/:id/entries', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const book = db.db.prepare('SELECT * FROM receipt_books WHERE id = ?').get(id);
    if (!book) return res.status(404).json({ success: false, error: 'Book not found' });
    const cycle = parseInt(req.query.cycle) || book.current_cycle;
    const entries = db.db.prepare(
      `SELECT * FROM collection_posts WHERE book_id = ? AND cycle_number = ? ORDER BY CAST(receipt_number AS INTEGER) ASC`
    ).all(id, cycle);
    const posted = entries.filter(e => e.tally_success);
    const failed = entries.filter(e => !e.tally_success);
    res.json({ success: true, entries, posted, failed, cycle, book });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Validate book entries against summary
router.get('/books/:id/validate', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const book = db.db.prepare('SELECT * FROM receipt_books WHERE id = ?').get(id);
    if (!book) return res.status(404).json({ success: false, error: 'Book not found' });
    const actual = db.db.prepare(
      `SELECT COUNT(*) as entry_count, SUM(cash) as cash, SUM(fonepay) as fonepay,
       SUM(cheque) as cheque, SUM(bank_deposit) as bank_deposit, SUM(discount) as discount, SUM(total) as total
       FROM collection_posts WHERE book_id = ? AND cycle_number = ? AND tally_success = 1`
    ).get(id, book.current_cycle);
    const summary = {
      entryCount: book.summary_entry_count || 0,
      cash: book.summary_cash || 0,
      fonepay: book.summary_fonepay || 0,
      cheque: book.summary_cheque || 0,
      bankDeposit: book.summary_bank_deposit || 0,
      discount: book.summary_discount || 0,
      total: book.summary_total || 0
    };
    const differences = {
      entryCount: (actual.entry_count || 0) - summary.entryCount,
      cash: (actual.cash || 0) - summary.cash,
      fonepay: (actual.fonepay || 0) - summary.fonepay,
      cheque: (actual.cheque || 0) - summary.cheque,
      bankDeposit: (actual.bank_deposit || 0) - summary.bankDeposit,
      discount: (actual.discount || 0) - summary.discount,
      total: (actual.total || 0) - summary.total
    };
    const valid = Object.values(differences).every(d => Math.abs(d) < 0.01);
    res.json({ success: true, valid, summary, actual: { entryCount: actual.entry_count || 0, cash: actual.cash || 0, fonepay: actual.fonepay || 0, cheque: actual.cheque || 0, bankDeposit: actual.bank_deposit || 0, discount: actual.discount || 0, total: actual.total || 0 }, differences });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get book cycle history
router.get('/books/:id/history', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const book = db.db.prepare('SELECT * FROM receipt_books WHERE id = ?').get(id);
    if (!book) return res.status(404).json({ success: false, error: 'Book not found' });
    const cycles = db.db.prepare(
      `SELECT cycle_number, COUNT(*) as entry_count, SUM(CASE WHEN tally_success = 1 THEN 1 ELSE 0 END) as success_count,
       SUM(cash) as cash, SUM(fonepay) as fonepay, SUM(cheque) as cheque,
       SUM(bank_deposit) as bank_deposit, SUM(discount) as discount, SUM(total) as total,
       MIN(date) as first_date, MAX(date) as last_date, MIN(receipt_number) as first_receipt, MAX(receipt_number) as last_receipt,
       staff_name
       FROM collection_posts WHERE book_id = ? GROUP BY cycle_number ORDER BY cycle_number ASC`
    ).all(id);
    res.json({ success: true, book, cycles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
