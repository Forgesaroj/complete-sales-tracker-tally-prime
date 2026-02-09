/**
 * Email Routes - SMTP test and bill emailing
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { emailService } from '../services/email/emailService.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * POST /api/email/test-connection
 * Test SMTP connection
 */
router.post('/test-connection', async (req, res) => {
  try {
    const result = await emailService.testConnection();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/email/test
 * Send test email
 */
router.post('/test', async (req, res) => {
  const { toEmail } = req.body;
  if (!toEmail) return res.status(400).json({ error: 'toEmail is required' });
  try {
    const result = await emailService.sendTestEmail(toEmail);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/email/send-bill
 * Email a bill to a recipient
 */
router.post('/send-bill', async (req, res) => {
  const { billId, toEmail, nepaliDate } = req.body;
  if (!billId || !toEmail) return res.status(400).json({ error: 'billId and toEmail are required' });

  try {
    const bill = db.getBillById(billId);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    const rawItems = db.getBillItems(bill.id);
    const items = rawItems.map(i => ({
      stockItem: i.stock_item,
      quantity: i.quantity,
      rate: i.rate,
      amount: i.amount,
      unit: i.unit || 'Nos'
    }));

    const party = db.getPartyByName(bill.party_name);

    const business = {
      businessName: db.getSetting('business_name') || tallyConnector.companyName || 'Business',
      businessAddress: db.getSetting('business_address') || '',
      businessPhone: db.getSetting('business_phone') || '',
      businessPAN: db.getSetting('business_pan') || ''
    };

    const result = await emailService.sendBillEmail({
      toEmail,
      bill: {
        voucherNumber: bill.voucher_number,
        voucherType: bill.voucher_type,
        voucherDate: bill.voucher_date,
        partyName: bill.party_name,
        amount: bill.amount
      },
      items,
      party: party ? { address: party.address, phone: party.phone } : null,
      business,
      nepaliDate: nepaliDate || ''
    });

    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
