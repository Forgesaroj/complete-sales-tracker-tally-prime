import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import QRCode from 'qrcode';
import fs from 'fs';
import { db } from '../database/database.js';
import {
  formatPaymentReminder,
  formatReceiptConfirmation,
  formatChequeNotification,
  formatOutstandingReport
} from './messageTemplates.js';

const TEST_SERVER = process.env.WHATSAPP_TEST_URL || 'http://localhost:3099';
const isTestMode = () => process.env.WHATSAPP_TEST === 'true';

class WhatsAppService {
  constructor() {
    this.client = null;
    this.io = null;
    this.status = 'disconnected'; // disconnected, qr_pending, connecting, ready, error
    this.qrCode = null; // data URL
    this.clientInfo = null;
    this.lastError = null;
    this.isInitializing = false;
  }

  setSocketIO(io) {
    this.io = io;
  }

  emitStatus(status, data = {}) {
    this.status = status;
    if (this.io) {
      this.io.emit('whatsapp:status', { status, testMode: isTestMode(), ...data });
    }
  }

  getStatus() {
    return {
      status: this.status,
      clientInfo: this.clientInfo,
      qrCode: this.qrCode,
      lastError: this.lastError,
      isReady: this.status === 'ready',
      testMode: isTestMode()
    };
  }

  async initialize() {
    if (this.isInitializing) {
      throw new Error('WhatsApp is already initializing');
    }
    if (this.status === 'ready') {
      throw new Error('WhatsApp is already connected');
    }

    // ===== TEST MODE =====
    if (isTestMode()) {
      this.isInitializing = true;
      this.lastError = null;
      try {
        // Check test server is reachable
        const res = await fetch(`${TEST_SERVER}/api/messages`);
        if (!res.ok) throw new Error(`Test server returned ${res.status}`);
        this.clientInfo = { pushname: 'TEST MODE', wid: 'test@localhost', platform: 'test-server' };
        this.isInitializing = false;
        this.emitStatus('ready', { clientInfo: this.clientInfo });
        console.log(`[WhatsApp] TEST MODE — messages go to ${TEST_SERVER}`);
        return;
      } catch (err) {
        this.isInitializing = false;
        this.lastError = `Test server not reachable at ${TEST_SERVER}: ${err.message}`;
        this.emitStatus('error', { error: this.lastError });
        console.error(`[WhatsApp] TEST MODE FAILED — start test server first: cd whatsapp-test && node server.js`);
        throw new Error(this.lastError);
      }
    }

    // ===== REAL MODE =====
    this.isInitializing = true;
    this.lastError = null;

    try {
      // Destroy existing client if any
      if (this.client) {
        try { await this.client.destroy(); } catch (e) { /* ignore */ }
        this.client = null;
      }

      this.client = new Client({
        authStrategy: new LocalAuth({
          dataPath: './data/whatsapp-session'
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-extensions'
          ]
        }
      });

      // QR code event
      this.client.on('qr', async (qr) => {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 2 });
          this.qrCode = qrDataUrl;
          this.emitStatus('qr_pending', { qr: qrDataUrl });
          console.log('[WhatsApp] QR code received — scan with phone');
        } catch (e) {
          console.error('[WhatsApp] QR generation error:', e.message);
        }
      });

      // Authenticated (session restored, no QR needed)
      this.client.on('authenticated', () => {
        this.qrCode = null;
        this.emitStatus('connecting');
        console.log('[WhatsApp] Authenticated (session restored)');
      });

      // Ready
      this.client.on('ready', () => {
        this.qrCode = null;
        this.clientInfo = this.client.info ? {
          pushname: this.client.info.pushname,
          wid: this.client.info.wid?._serialized || this.client.info.wid,
          platform: this.client.info.platform
        } : null;
        this.isInitializing = false;
        this.emitStatus('ready', { clientInfo: this.clientInfo });
        console.log('[WhatsApp] Ready:', this.clientInfo?.pushname || 'unknown');
      });

      // Auth failure
      this.client.on('auth_failure', (msg) => {
        this.lastError = String(msg);
        this.isInitializing = false;
        this.emitStatus('error', { error: String(msg) });
        console.error('[WhatsApp] Auth failure:', msg);
      });

      // Disconnected
      this.client.on('disconnected', (reason) => {
        this.clientInfo = null;
        this.qrCode = null;
        this.isInitializing = false;
        this.emitStatus('disconnected', { reason });
        console.log('[WhatsApp] Disconnected:', reason);
      });

      this.emitStatus('connecting');
      await this.client.initialize();
    } catch (error) {
      this.lastError = error.message;
      this.isInitializing = false;
      this.emitStatus('error', { error: error.message });
      console.error('[WhatsApp] Initialize error:', error.message);
      throw error;
    }
  }

  // Format phone number to WhatsApp chat ID
  formatPhoneNumber(phone) {
    let clean = String(phone).replace(/[\s\-\+\(\)]/g, '');
    // Nepal: 10-digit starting with 9, prefix 977
    if (clean.startsWith('0')) clean = '977' + clean.slice(1);
    if (!clean.startsWith('977') && clean.length === 10 && clean.startsWith('9')) {
      clean = '977' + clean;
    }
    return clean + '@c.us';
  }

  // Format phone for test server (just digits, no @c.us)
  cleanPhone(phone) {
    let clean = String(phone).replace(/[\s\-\+\(\)]/g, '');
    if (clean.startsWith('0')) clean = '977' + clean.slice(1);
    if (!clean.startsWith('977') && clean.length === 10 && clean.startsWith('9')) {
      clean = '977' + clean;
    }
    return clean;
  }

  // Send text message
  async sendMessage(phone, message, partyName = null, templateName = null, relatedVoucher = null) {
    if (this.status !== 'ready') throw new Error('WhatsApp not connected');

    // ===== TEST MODE =====
    if (isTestMode()) {
      try {
        const res = await fetch(`${TEST_SERVER}/api/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: this.cleanPhone(phone),
            partyName: partyName || phone,
            message,
            direction: 'outgoing'
          })
        });
        const data = await res.json();
        const msgId = data.message?.id ? `test-${data.message.id}` : `test-${Date.now()}`;
        db.logWhatsAppMessage({
          phone,
          party_name: partyName,
          message_type: 'text',
          template_name: templateName,
          message_body: message,
          status: 'sent',
          wa_message_id: msgId,
          related_voucher: relatedVoucher
        });
        console.log(`[WhatsApp:TEST] Sent to ${partyName || phone}: ${message.slice(0, 60)}...`);
        return { success: true, messageId: msgId, testMode: true };
      } catch (error) {
        db.logWhatsAppMessage({
          phone,
          party_name: partyName,
          message_type: 'text',
          template_name: templateName,
          message_body: message,
          status: 'failed',
          error_message: error.message,
          related_voucher: relatedVoucher
        });
        throw error;
      }
    }

    // ===== REAL MODE =====
    const chatId = this.formatPhoneNumber(phone);
    try {
      const result = await this.client.sendMessage(chatId, message);
      db.logWhatsAppMessage({
        phone,
        party_name: partyName,
        message_type: 'text',
        template_name: templateName,
        message_body: message,
        status: 'sent',
        wa_message_id: result.id?.id || null,
        related_voucher: relatedVoucher
      });
      return { success: true, messageId: result.id?.id };
    } catch (error) {
      db.logWhatsAppMessage({
        phone,
        party_name: partyName,
        message_type: 'text',
        template_name: templateName,
        message_body: message,
        status: 'failed',
        error_message: error.message,
        related_voucher: relatedVoucher
      });
      throw error;
    }
  }

  // Send media (image/document)
  async sendMedia(phone, filePath, caption = '', partyName = null) {
    if (this.status !== 'ready') throw new Error('WhatsApp not connected');

    // ===== TEST MODE =====
    if (isTestMode()) {
      try {
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = filePath.split('/').pop();
        const ext = fileName.split('.').pop().toLowerCase();
        const mimeTypes = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', pdf: 'application/pdf', webp: 'image/webp' };
        const blob = new Blob([fileBuffer], { type: mimeTypes[ext] || 'application/octet-stream' });

        const fd = new FormData();
        fd.append('file', blob, fileName);
        fd.append('phone', this.cleanPhone(phone));
        fd.append('partyName', partyName || phone);
        fd.append('caption', caption);
        fd.append('direction', 'outgoing');

        const res = await fetch(`${TEST_SERVER}/api/send-media`, {
          method: 'POST',
          body: fd
        });
        const data = await res.json();
        const msgId = data.message?.id ? `test-${data.message.id}` : `test-${Date.now()}`;
        db.logWhatsAppMessage({
          phone,
          party_name: partyName,
          message_type: 'media',
          message_body: caption || filePath,
          status: 'sent',
          wa_message_id: msgId
        });
        console.log(`[WhatsApp:TEST] Media sent to ${partyName || phone}: ${fileName}`);
        return { success: true, messageId: msgId, testMode: true };
      } catch (error) {
        db.logWhatsAppMessage({
          phone,
          party_name: partyName,
          message_type: 'media',
          message_body: caption || filePath,
          status: 'failed',
          error_message: error.message
        });
        throw error;
      }
    }

    // ===== REAL MODE =====
    const chatId = this.formatPhoneNumber(phone);
    try {
      const media = MessageMedia.fromFilePath(filePath);
      const result = await this.client.sendMessage(chatId, media, { caption });
      db.logWhatsAppMessage({
        phone,
        party_name: partyName,
        message_type: 'media',
        message_body: caption || filePath,
        status: 'sent',
        wa_message_id: result.id?.id || null
      });
      return { success: true, messageId: result.id?.id };
    } catch (error) {
      db.logWhatsAppMessage({
        phone,
        party_name: partyName,
        message_type: 'media',
        message_body: caption || filePath,
        status: 'failed',
        error_message: error.message
      });
      throw error;
    }
  }

  // Template: payment reminder
  async sendPaymentReminder(partyName, phone, outstandingData) {
    const message = formatPaymentReminder(partyName, outstandingData);
    return this.sendMessage(phone, message, partyName, 'payment_reminder');
  }

  // Template: receipt confirmation
  async sendReceiptConfirmation(partyName, phone, receiptData) {
    const message = formatReceiptConfirmation(partyName, receiptData);
    return this.sendMessage(phone, message, partyName, 'receipt_confirmation', receiptData.voucherNumber);
  }

  // Template: outstanding report
  async sendOutstandingReport(partyName, phone, bills) {
    const message = formatOutstandingReport(partyName, bills);
    return this.sendMessage(phone, message, partyName, 'outstanding_report');
  }

  // Template: cheque photo
  async sendChequePhoto(phone, imagePath, chequeDetails) {
    const caption = formatChequeNotification(chequeDetails);
    return this.sendMedia(phone, imagePath, caption, chequeDetails.partyName);
  }

  // Check if number is registered on WhatsApp
  async isRegistered(phone) {
    if (isTestMode()) return true; // always true in test mode
    if (this.status !== 'ready') return false;
    try {
      const chatId = this.formatPhoneNumber(phone);
      return await this.client.isRegisteredUser(chatId);
    } catch {
      return false;
    }
  }

  // Resolve phone for a party: whatsapp_contacts (primary) → parties.phone
  resolvePhone(partyName) {
    const contacts = db.getWhatsAppContactByParty(partyName);
    if (contacts.length > 0) return contacts[0].phone;
    // Fallback to Tally party phone
    const party = db.db.prepare("SELECT phone FROM parties WHERE name = ? AND phone IS NOT NULL AND phone != ''").get(partyName);
    return party?.phone || null;
  }

  // Logout
  async logout() {
    if (isTestMode()) {
      this.clientInfo = null;
      this.emitStatus('disconnected');
      return;
    }
    if (this.client) {
      try {
        await this.client.logout();
      } catch (e) {
        console.error('[WhatsApp] Logout error:', e.message);
      }
      this.clientInfo = null;
      this.qrCode = null;
      this.emitStatus('disconnected');
    }
  }

  // Destroy (for server shutdown)
  async destroy() {
    if (isTestMode()) {
      this.clientInfo = null;
      this.status = 'disconnected';
      return;
    }
    if (this.client) {
      try {
        await this.client.destroy();
      } catch (e) {
        console.error('[WhatsApp] Destroy error:', e.message);
      }
      this.client = null;
      this.clientInfo = null;
      this.qrCode = null;
      this.status = 'disconnected';
    }
  }
}

export const whatsappService = new WhatsAppService();
export default whatsappService;
