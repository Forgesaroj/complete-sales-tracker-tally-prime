import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import { db } from '../database/database.js';
import {
  formatPaymentReminder,
  formatReceiptConfirmation,
  formatChequeNotification,
  formatOutstandingReport
} from './messageTemplates.js';

const TEST_SERVER = process.env.WHATSAPP_TEST_URL || 'http://localhost:3099';
const isTestMode = () => process.env.WHATSAPP_TEST === 'true';
const SESSION_DIR = path.resolve('./data/baileys-session');

class WhatsAppService {
  constructor() {
    this.sock = null;
    this.io = null;
    this.status = 'disconnected'; // disconnected, qr_pending, connecting, ready, error
    this.qrCode = null; // data URL
    this.clientInfo = null;
    this.lastError = null;
    this.isInitializing = false;
    this.saveCreds = null;
    this.onMessageReceived = null; // callback for incoming messages
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

    // ===== REAL MODE (Baileys) =====
    this.isInitializing = true;
    this.lastError = null;

    try {
      // Close existing socket if any
      if (this.sock) {
        try { this.sock.end(undefined); } catch (e) { /* ignore */ }
        this.sock = null;
      }

      // Ensure session directory exists
      if (!fs.existsSync(SESSION_DIR)) {
        fs.mkdirSync(SESSION_DIR, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
      this.saveCreds = saveCreds;

      const { version } = await fetchLatestBaileysVersion();

      this.emitStatus('connecting');

      this.sock = makeWASocket({
        version,
        auth: state,
        printQRInTerminal: true,
        browser: ['Tally Dashboard', 'Chrome', '1.0.0'],
        generateHighQualityLinkPreview: false,
        syncFullHistory: false
      });

      // Save credentials on update
      this.sock.ev.on('creds.update', saveCreds);

      // Connection updates (QR, connected, disconnected)
      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // QR code received — show to user
        if (qr) {
          try {
            const qrDataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 2 });
            this.qrCode = qrDataUrl;
            this.emitStatus('qr_pending', { qr: qrDataUrl });
            console.log('[WhatsApp] QR code received — scan with phone (Settings > Linked Devices)');
          } catch (e) {
            console.error('[WhatsApp] QR generation error:', e.message);
          }
        }

        if (connection === 'open') {
          // Connected!
          this.qrCode = null;
          this.isInitializing = false;
          const me = this.sock.user;
          this.clientInfo = {
            pushname: me?.name || 'Unknown',
            wid: me?.id || '',
            platform: 'Baileys'
          };
          this.emitStatus('ready', { clientInfo: this.clientInfo });
          console.log('[WhatsApp] Connected as:', this.clientInfo.pushname, this.clientInfo.wid);
        }

        if (connection === 'close') {
          this.qrCode = null;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

          if (statusCode === DisconnectReason.loggedOut) {
            // Session expired — user logged out from phone
            this.clientInfo = null;
            this.isInitializing = false;
            this.lastError = 'Logged out from phone. Please re-scan QR code.';
            this.emitStatus('disconnected', { reason: 'logged_out' });
            console.log('[WhatsApp] Logged out — session cleared');
            // Delete session files so fresh QR appears next time
            try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch {}
          } else if (shouldReconnect) {
            // Auto-reconnect
            console.log('[WhatsApp] Disconnected, reconnecting...', statusCode);
            this.emitStatus('connecting');
            // Re-initialize after short delay
            setTimeout(() => {
              this.isInitializing = false;
              this.status = 'disconnected';
              this.initialize().catch(e => console.error('[WhatsApp] Reconnect failed:', e.message));
            }, 3000);
          } else {
            this.clientInfo = null;
            this.isInitializing = false;
            this.lastError = `Disconnected: ${statusCode}`;
            this.emitStatus('error', { error: this.lastError });
          }
        }
      });

      // Incoming messages
      this.sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const msg of messages) {
          if (msg.key.fromMe) continue; // skip our own messages
          const text = msg.message?.conversation
            || msg.message?.extendedTextMessage?.text
            || '';
          if (!text) continue;

          const sender = msg.key.remoteJid;
          const pushName = msg.pushName || '';
          console.log(`[WhatsApp] Incoming from ${pushName} (${sender}): ${text.slice(0, 80)}`);

          // Log incoming message
          try {
            db.logWhatsAppMessage({
              phone: sender?.replace('@s.whatsapp.net', '') || '',
              party_name: pushName,
              message_type: 'text',
              direction: 'incoming',
              message_body: text,
              status: 'received',
              wa_message_id: msg.key.id
            });
          } catch {}

          // Call handler if registered
          if (this.onMessageReceived) {
            try {
              await this.onMessageReceived({ sender, pushName, text, message: msg });
            } catch (e) {
              console.error('[WhatsApp] Message handler error:', e.message);
            }
          }
        }
      });

    } catch (error) {
      this.lastError = error.message;
      this.isInitializing = false;
      this.emitStatus('error', { error: error.message });
      console.error('[WhatsApp] Initialize error:', error.message);
      throw error;
    }
  }

  // Register a handler for incoming messages
  onMessage(handler) {
    this.onMessageReceived = handler;
  }

  // Format phone number to WhatsApp JID
  formatPhoneNumber(phone) {
    let clean = String(phone).replace(/[\s\-\+\(\)]/g, '');
    // Nepal: 10-digit starting with 9, prefix 977
    if (clean.startsWith('0')) clean = '977' + clean.slice(1);
    if (!clean.startsWith('977') && clean.length === 10 && clean.startsWith('9')) {
      clean = '977' + clean;
    }
    return clean + '@s.whatsapp.net';
  }

  // Format phone for test server (just digits)
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

    // ===== REAL MODE (Baileys) =====
    const jid = this.formatPhoneNumber(phone);
    try {
      const result = await this.sock.sendMessage(jid, { text: message });
      db.logWhatsAppMessage({
        phone,
        party_name: partyName,
        message_type: 'text',
        template_name: templateName,
        message_body: message,
        status: 'sent',
        wa_message_id: result?.key?.id || null,
        related_voucher: relatedVoucher
      });
      return { success: true, messageId: result?.key?.id };
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

    // ===== REAL MODE (Baileys) =====
    const jid = this.formatPhoneNumber(phone);
    try {
      const fileBuffer = fs.readFileSync(filePath);
      const fileName = filePath.split('/').pop();
      const ext = fileName.split('.').pop().toLowerCase();
      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

      let msgContent;
      if (imageExts.includes(ext)) {
        msgContent = { image: fileBuffer, caption, fileName };
      } else {
        msgContent = { document: fileBuffer, caption, fileName, mimetype: 'application/octet-stream' };
      }

      const result = await this.sock.sendMessage(jid, msgContent);
      db.logWhatsAppMessage({
        phone,
        party_name: partyName,
        message_type: 'media',
        message_body: caption || filePath,
        status: 'sent',
        wa_message_id: result?.key?.id || null
      });
      return { success: true, messageId: result?.key?.id };
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
    if (isTestMode()) return true;
    if (this.status !== 'ready') return false;
    try {
      const jid = this.formatPhoneNumber(phone);
      const [result] = await this.sock.onWhatsApp(jid.replace('@s.whatsapp.net', ''));
      return result?.exists || false;
    } catch {
      return false;
    }
  }

  // Resolve phone for a party: whatsapp_contacts (primary) → parties.phone
  resolvePhone(partyName) {
    const contacts = db.getWhatsAppContactByParty(partyName);
    if (contacts.length > 0) return contacts[0].phone;
    const party = db.db.prepare("SELECT phone FROM parties WHERE name = ? AND phone IS NOT NULL AND phone != ''").get(partyName);
    return party?.phone || null;
  }

  // Reply to a message (for command responses)
  async reply(jid, text, quotedMsg = null) {
    if (this.status !== 'ready' || isTestMode()) return;
    try {
      await this.sock.sendMessage(jid, { text }, quotedMsg ? { quoted: quotedMsg } : undefined);
    } catch (e) {
      console.error('[WhatsApp] Reply error:', e.message);
    }
  }

  // Logout
  async logout() {
    if (isTestMode()) {
      this.clientInfo = null;
      this.emitStatus('disconnected');
      return;
    }
    if (this.sock) {
      try {
        await this.sock.logout();
      } catch (e) {
        console.error('[WhatsApp] Logout error:', e.message);
      }
      this.sock = null;
      this.clientInfo = null;
      this.qrCode = null;
      this.emitStatus('disconnected');
      // Clear session so fresh QR next time
      try { fs.rmSync(SESSION_DIR, { recursive: true, force: true }); } catch {}
    }
  }

  // Destroy (for server shutdown)
  async destroy() {
    if (isTestMode()) {
      this.clientInfo = null;
      this.status = 'disconnected';
      return;
    }
    if (this.sock) {
      try {
        this.sock.end(undefined);
      } catch (e) {
        console.error('[WhatsApp] Destroy error:', e.message);
      }
      this.sock = null;
      this.clientInfo = null;
      this.qrCode = null;
      this.status = 'disconnected';
    }
  }
}

export const whatsappService = new WhatsAppService();
export default whatsappService;
