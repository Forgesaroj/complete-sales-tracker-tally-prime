import { Router } from 'express';
import { db } from '../services/database/database.js';
import { whatsappService } from '../services/whatsapp/whatsappService.js';

const router = Router();

// ==================== CONNECTION ====================

// GET /status — connection status + client info
router.get('/status', (req, res) => {
  res.json({ success: true, ...whatsappService.getStatus() });
});

// POST /initialize — start WhatsApp client (triggers QR if no session)
router.post('/initialize', async (req, res) => {
  try {
    await whatsappService.initialize();
    res.json({ success: true, status: whatsappService.status });
  } catch (error) {
    // If it's already initializing/connected, return status rather than error
    if (error.message.includes('already')) {
      return res.json({ success: true, status: whatsappService.status, message: error.message });
    }
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /logout — disconnect + clear session
router.post('/logout', async (req, res) => {
  try {
    await whatsappService.logout();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== SENDING ====================

// POST /send — send text message { phone, message, partyName? }
router.post('/send', async (req, res) => {
  try {
    const { phone, message, partyName } = req.body;
    if (!phone || !message) return res.status(400).json({ success: false, error: 'Phone and message required' });
    const result = await whatsappService.sendMessage(phone, message, partyName);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /send-media — send image/file { phone, filePath, caption?, partyName? }
router.post('/send-media', async (req, res) => {
  try {
    const { phone, filePath, caption, partyName } = req.body;
    if (!phone || !filePath) return res.status(400).json({ success: false, error: 'Phone and filePath required' });
    const result = await whatsappService.sendMedia(phone, filePath, caption, partyName);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /send-reminder — send payment reminder { partyName, phone? }
router.post('/send-reminder', async (req, res) => {
  try {
    const { partyName, phone: inputPhone } = req.body;
    if (!partyName) return res.status(400).json({ success: false, error: 'partyName required' });
    let sentToAdmin = false;
    let phone = inputPhone || whatsappService.resolvePhone(partyName);
    if (!phone) {
      const adminPhone = db.getSetting('admin_whatsapp_phone');
      if (adminPhone) { phone = adminPhone; sentToAdmin = true; }
      else return res.status(400).json({ success: false, error: `No phone number found for ${partyName}` });
    }

    // Get outstanding data for this party
    const outstanding = db.db.prepare(
      `SELECT SUM(CASE WHEN closing_balance < 0 THEN ABS(closing_balance) ELSE 0 END) as total_outstanding,
              COUNT(*) as bill_count
       FROM outstanding_bills WHERE party_name = ?`
    ).get(partyName);

    const outstandingData = {
      totalOutstanding: outstanding?.total_outstanding || 0,
      overdueAmount: 0,
      billCount: outstanding?.bill_count || 0
    };

    const result = await whatsappService.sendPaymentReminder(partyName, phone, outstandingData);
    res.json({ success: true, ...result, phone, sentToAdmin });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /send-receipt — send receipt confirmation { partyName, phone?, receiptData }
router.post('/send-receipt', async (req, res) => {
  try {
    const { partyName, phone: inputPhone, receiptData } = req.body;
    if (!partyName || !receiptData) return res.status(400).json({ success: false, error: 'partyName and receiptData required' });
    let sentToAdmin = false;
    let phone = inputPhone || whatsappService.resolvePhone(partyName);
    if (!phone) {
      const adminPhone = db.getSetting('admin_whatsapp_phone');
      if (adminPhone) { phone = adminPhone; sentToAdmin = true; }
      else return res.status(400).json({ success: false, error: `No phone number found for ${partyName}` });
    }
    const result = await whatsappService.sendReceiptConfirmation(partyName, phone, receiptData);
    res.json({ success: true, ...result, phone, sentToAdmin });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /send-outstanding — send outstanding report { partyName, phone? }
router.post('/send-outstanding', async (req, res) => {
  try {
    const { partyName, phone: inputPhone } = req.body;
    if (!partyName) return res.status(400).json({ success: false, error: 'partyName required' });
    let sentToAdmin = false;
    let phone = inputPhone || whatsappService.resolvePhone(partyName);
    if (!phone) {
      const adminPhone = db.getSetting('admin_whatsapp_phone');
      if (adminPhone) { phone = adminPhone; sentToAdmin = true; }
      else return res.status(400).json({ success: false, error: `No phone number found for ${partyName}` });
    }

    // Get bill details
    const bills = db.db.prepare(
      `SELECT bill_name, closing_balance, bill_date,
              CAST(julianday('now') - julianday(bill_date) AS INTEGER) as ageing_days
       FROM outstanding_bills WHERE party_name = ? AND closing_balance < 0 ORDER BY bill_date`
    ).all(partyName).map(b => ({
      billName: b.bill_name,
      amount: b.closing_balance,
      dueDate: b.bill_date,
      ageingDays: b.ageing_days > 0 ? b.ageing_days : 0
    }));

    const result = await whatsappService.sendOutstandingReport(partyName, phone, bills);
    res.json({ success: true, ...result, phone, sentToAdmin, billCount: bills.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /check-number — check if registered on WhatsApp { phone }
router.post('/check-number', async (req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'phone required' });
    const registered = await whatsappService.isRegistered(phone);
    res.json({ success: true, phone, registered });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== CONTACTS ====================

// GET /contacts — list contacts, optional ?partyName= filter
router.get('/contacts', (req, res) => {
  try {
    const contacts = db.getWhatsAppContacts(req.query.partyName || null);
    res.json({ success: true, contacts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /contacts — add/update contact { partyName, phone, label?, notes? }
router.post('/contacts', (req, res) => {
  try {
    const { partyName, phone, label, source, notes } = req.body;
    if (!partyName || !phone) return res.status(400).json({ success: false, error: 'partyName and phone required' });
    const id = db.upsertWhatsAppContact(partyName, phone, label || 'primary', source || 'manual', notes || '');
    res.json({ success: true, id });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /contacts/:id
router.delete('/contacts/:id', (req, res) => {
  try {
    db.deleteWhatsAppContact(parseInt(req.params.id));
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /contacts/import — bulk import from Tally party phone numbers
router.post('/contacts/import', (req, res) => {
  try {
    const parties = db.db.prepare("SELECT name, phone FROM parties WHERE phone IS NOT NULL AND phone != '' AND phone != 'null'").all();
    let imported = 0;
    for (const p of parties) {
      try {
        db.upsertWhatsAppContact(p.name, p.phone, 'primary', 'tally', '');
        imported++;
      } catch (e) { /* skip duplicates */ }
    }
    res.json({ success: true, imported, total: parties.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /contacts/:id/verify — check WhatsApp registration, update DB
router.post('/contacts/:id/verify', async (req, res) => {
  try {
    const contact = db.db.prepare('SELECT * FROM whatsapp_contacts WHERE id = ?').get(parseInt(req.params.id));
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });
    const registered = await whatsappService.isRegistered(contact.phone);
    db.verifyWhatsAppContact(contact.id, registered);
    res.json({ success: true, phone: contact.phone, registered });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==================== MESSAGE LOG ====================

// GET /messages — message log with filters
router.get('/messages', (req, res) => {
  try {
    const messages = db.getWhatsAppMessageLog({
      partyName: req.query.partyName,
      phone: req.query.phone,
      fromDate: req.query.fromDate,
      toDate: req.query.toDate,
      status: req.query.status,
      limit: parseInt(req.query.limit) || 50,
      offset: parseInt(req.query.offset) || 0
    });
    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /messages/stats — message stats
router.get('/messages/stats', (req, res) => {
  try {
    const stats = db.getWhatsAppMessageStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
