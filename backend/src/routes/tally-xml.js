/**
 * Tally XML Viewer Routes
 * Fetch raw XML data from Tally for viewing/debugging
 */

import { Router } from 'express';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * GET /api/tally-xml/vouchers
 * Get voucher list from Tally for a date range
 */
router.get('/vouchers', async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;
    if (!fromDate || !toDate) {
      return res.status(400).json({ error: 'fromDate and toDate are required (YYYYMMDD format)' });
    }
    const vouchers = await tallyConnector.getVouchersXmlList(fromDate, toDate);
    res.json({ vouchers, count: vouchers.length });
  } catch (error) {
    console.error('Error fetching XML voucher list:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/tally-xml/voucher/:masterId
 * Get full raw XML for a single voucher
 */
router.get('/voucher/:masterId', async (req, res) => {
  try {
    const { masterId } = req.params;
    const result = await tallyConnector.getVoucherRawXml(masterId);
    res.json({
      masterId,
      rawXml: result.rawXml,
      parsed: result.parsed
    });
  } catch (error) {
    console.error('Error fetching voucher XML:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
