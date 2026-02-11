/**
 * Bank & Fonepay Reconciliation Routes
 * Matches RBB ↔ Tally, Fonepay ↔ RBB (settlement), Fonepay ↔ Tally
 *
 * Business flow:
 * - Fonepay/eSewa payments get deposited to RBB in time-based batches (not per-transaction)
 * - Bills are paid from RBB
 * - Customers may deposit directly to RBB
 * - Need 3 reconciliation types: rbb_tally, fonepay_rbb, fonepay_tally
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * GET /api/bank-recon
 * Get reconciliation matches. Optional ?type=rbb_tally|fonepay_rbb|fonepay_tally
 */
router.get('/', (req, res) => {
  try {
    const { type } = req.query;
    const matches = db.getReconMatches(type || null);
    res.json({ success: true, count: matches.length, matches });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bank-recon/summary
 * Get reconciliation summary by type and status
 */
router.get('/summary', (req, res) => {
  try {
    const { type } = req.query;
    const summary = db.getReconSummary(type || null);
    res.json({ success: true, summary });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bank-recon/unmatched/rbb
 * Get unmatched RBB transactions
 */
router.get('/unmatched/rbb', (req, res) => {
  try {
    const transactions = db.getUnmatchedRBB();
    res.json({ success: true, count: transactions.length, transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bank-recon/unmatched/fonepay
 * Get unmatched Fonepay transactions
 */
router.get('/unmatched/fonepay', (req, res) => {
  try {
    const transactions = db.getUnmatchedFonepay();
    res.json({ success: true, count: transactions.length, transactions });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/bank-recon/fetch-tally
 * Fetch bank vouchers from Tally for reconciliation
 */
router.post('/fetch-tally', async (req, res) => {
  try {
    const { bankLedger, from, to } = req.body;
    if (!bankLedger || !from || !to) {
      return res.status(400).json({ error: 'bankLedger, from, and to are required' });
    }
    const vouchers = await tallyConnector.getBankVouchers(bankLedger, from, to);
    res.json({ success: true, count: vouchers.length, vouchers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/bank-recon/auto-match
 * Run automatic matching algorithm
 * Body: { type: 'rbb_tally' | 'fonepay_rbb' | 'fonepay_tally', bankLedger?, from?, to? }
 */
router.post('/auto-match', async (req, res) => {
  try {
    const { type, bankLedger, from, to } = req.body;
    if (!type) {
      return res.status(400).json({ error: 'type is required (rbb_tally, fonepay_rbb, fonepay_tally)' });
    }

    let matchCount = 0;

    if (type === 'rbb_tally') {
      // Match RBB transactions with Tally bank vouchers
      if (!bankLedger || !from || !to) {
        return res.status(400).json({ error: 'bankLedger, from, and to are required for rbb_tally' });
      }

      const tallyVouchers = await tallyConnector.getBankVouchers(bankLedger, from, to);
      const unmatchedRBB = db.getUnmatchedRBB();

      // Clear previous matches for this type
      db.clearReconByType('rbb_tally');

      for (const rbb of unmatchedRBB) {
        const rbbAmount = rbb.credit > 0 ? rbb.credit : -rbb.debit;
        const rbbDate = rbb.transaction_date;

        let bestMatch = null;
        let bestConfidence = 0;

        for (const tv of tallyVouchers) {
          const tallyAmount = Math.abs(tv.amount);
          const amountDiff = Math.abs(Math.abs(rbbAmount) - tallyAmount);

          // Exact amount match
          if (amountDiff < 0.01) {
            // Check date proximity (within 2 days)
            const daysDiff = Math.abs(dateDiffDays(rbbDate, tv.date));
            if (daysDiff <= 2) {
              const confidence = daysDiff === 0 ? 1.0 : daysDiff === 1 ? 0.9 : 0.8;
              if (confidence > bestConfidence) {
                bestMatch = tv;
                bestConfidence = confidence;
              }
            }
          }
        }

        if (bestMatch && bestConfidence >= 0.8) {
          db.createReconMatch({
            reconType: 'rbb_tally',
            sourceType: 'rbb', sourceId: String(rbb.id), sourceDate: rbbDate,
            sourceAmount: rbbAmount, sourceDescription: rbb.description,
            targetType: 'tally', targetId: bestMatch.guid, targetDate: bestMatch.date,
            targetAmount: Math.abs(bestMatch.amount), targetDescription: `${bestMatch.voucherType} ${bestMatch.voucherNumber} - ${bestMatch.partyName}`,
            matchStatus: 'matched', matchConfidence: bestConfidence
          });
          matchCount++;
          // Remove matched tally voucher from pool
          const idx = tallyVouchers.indexOf(bestMatch);
          if (idx > -1) tallyVouchers.splice(idx, 1);
        } else {
          // Record as unmatched
          db.createReconMatch({
            reconType: 'rbb_tally',
            sourceType: 'rbb', sourceId: String(rbb.id), sourceDate: rbbDate,
            sourceAmount: rbbAmount, sourceDescription: rbb.description,
            targetType: null, targetId: null, targetDate: null,
            targetAmount: 0, targetDescription: null,
            matchStatus: 'unmatched', matchConfidence: 0
          });
        }
      }
    } else if (type === 'fonepay_rbb') {
      // Match Fonepay settlement amounts with RBB deposits (FONEPAY/ESEWASTLMT entries)
      const unmatchedFonepay = db.getUnmatchedFonepay();
      const unmatchedRBB = db.getUnmatchedRBB();

      // Filter RBB for Fonepay-related deposits
      const fonepayRBB = unmatchedRBB.filter(r =>
        r.description && (r.description.includes('FONEPAY') || r.description.includes('ESEWASTLMT')) && r.credit > 0
      );

      db.clearReconByType('fonepay_rbb');

      // Group Fonepay transactions by date for batch matching
      const fpByDate = {};
      for (const fp of unmatchedFonepay) {
        const date = fp.transaction_date?.split(' ')[0] || fp.transaction_date;
        if (!fpByDate[date]) fpByDate[date] = [];
        fpByDate[date].push(fp);
      }

      for (const rbb of fonepayRBB) {
        const rbbDate = rbb.transaction_date;
        const rbbAmount = rbb.credit;

        // Look for batch of Fonepay transactions whose sum matches
        // Check date and day before (settlements may be next-day)
        for (const dateOffset of [0, -1, 1]) {
          const checkDate = offsetDate(rbbDate, dateOffset);
          const candidates = fpByDate[checkDate] || [];
          const candidateSum = candidates.reduce((s, c) => s + (c.amount || 0), 0);

          if (candidates.length > 0 && Math.abs(candidateSum - rbbAmount) < 1) {
            db.createReconMatch({
              reconType: 'fonepay_rbb',
              sourceType: 'fonepay_batch', sourceId: candidates.map(c => c.id).join(','), sourceDate: checkDate,
              sourceAmount: candidateSum, sourceDescription: `${candidates.length} Fonepay transactions`,
              targetType: 'rbb', targetId: String(rbb.id), targetDate: rbbDate,
              targetAmount: rbbAmount, targetDescription: rbb.description,
              matchStatus: 'matched', matchConfidence: dateOffset === 0 ? 1.0 : 0.85
            });
            matchCount++;
            break;
          }
        }
      }
    } else if (type === 'fonepay_tally') {
      // Match Fonepay transactions with Tally receipt vouchers
      if (!from || !to) {
        return res.status(400).json({ error: 'from and to are required for fonepay_tally' });
      }

      // Fonepay payments appear as receipts in Tally with Fonepay ledger
      const tallyVouchers = await tallyConnector.getBankVouchers('Fonepay', from, to);
      const unmatchedFonepay = db.getUnmatchedFonepay();

      db.clearReconByType('fonepay_tally');

      for (const fp of unmatchedFonepay) {
        const fpAmount = fp.amount;
        const fpDate = fp.transaction_date?.split(' ')[0] || fp.transaction_date;

        let bestMatch = null;
        let bestConfidence = 0;

        for (const tv of tallyVouchers) {
          const amountDiff = Math.abs(fpAmount - Math.abs(tv.amount));
          if (amountDiff < 0.01) {
            const daysDiff = Math.abs(dateDiffDays(fpDate, tv.date));
            if (daysDiff <= 1) {
              const confidence = daysDiff === 0 ? 1.0 : 0.9;
              if (confidence > bestConfidence) {
                bestMatch = tv;
                bestConfidence = confidence;
              }
            }
          }
        }

        if (bestMatch && bestConfidence >= 0.9) {
          db.createReconMatch({
            reconType: 'fonepay_tally',
            sourceType: 'fonepay', sourceId: String(fp.id), sourceDate: fpDate,
            sourceAmount: fpAmount, sourceDescription: `${fp.description || ''} (${fp.issuer_name || ''})`,
            targetType: 'tally', targetId: bestMatch.guid, targetDate: bestMatch.date,
            targetAmount: Math.abs(bestMatch.amount), targetDescription: `${bestMatch.voucherType} ${bestMatch.voucherNumber} - ${bestMatch.partyName}`,
            matchStatus: 'matched', matchConfidence: bestConfidence
          });
          matchCount++;
          const idx = tallyVouchers.indexOf(bestMatch);
          if (idx > -1) tallyVouchers.splice(idx, 1);
        }
      }
    }

    res.json({ success: true, type, matchCount, message: `Auto-matched ${matchCount} entries` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/bank-recon/manual-match
 * Manually match a source with a target
 */
router.post('/manual-match', (req, res) => {
  try {
    const { reconType, sourceType, sourceId, sourceDate, sourceAmount, sourceDescription, targetType, targetId, targetDate, targetAmount, targetDescription } = req.body;
    db.createReconMatch({
      reconType, sourceType, sourceId, sourceDate, sourceAmount: sourceAmount || 0, sourceDescription,
      targetType, targetId, targetDate, targetAmount: targetAmount || 0, targetDescription,
      matchStatus: 'manual_match', matchConfidence: 1.0
    });
    res.json({ success: true, message: 'Manual match created' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Helper: days between two date strings
function dateDiffDays(d1, d2) {
  try {
    const date1 = new Date(d1);
    const date2 = new Date(d2);
    return Math.round((date1 - date2) / (1000 * 60 * 60 * 24));
  } catch {
    return 999;
  }
}

// Helper: offset date string by N days
function offsetDate(dateStr, days) {
  try {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  } catch {
    return dateStr;
  }
}

export default router;
