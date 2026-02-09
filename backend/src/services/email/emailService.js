/**
 * Email Service - SMTP email sending for Tally Dashboard
 */

import nodemailer from 'nodemailer';
import { db } from '../database/database.js';

class EmailService {
  constructor() {
    this.transporter = null;
  }

  getConfig() {
    return {
      host: db.getSetting('smtp_host') || '',
      port: parseInt(db.getSetting('smtp_port')) || 587,
      secure: db.getSetting('smtp_secure') === 'true',
      user: db.getSetting('smtp_user') || '',
      pass: db.getSetting('smtp_pass') || '',
      fromName: db.getSetting('smtp_from_name') || db.getSetting('business_name') || 'Tally Dashboard',
      fromEmail: db.getSetting('smtp_from_email') || db.getSetting('smtp_user') || ''
    };
  }

  initTransporter() {
    const config = this.getConfig();
    if (!config.host || !config.user || !config.pass) {
      this.transporter = null;
      return false;
    }

    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
      tls: { rejectUnauthorized: false }
    });
    return true;
  }

  async testConnection() {
    if (!this.initTransporter()) {
      return { success: false, error: 'SMTP not configured. Set host, user, and password.' };
    }
    try {
      await this.transporter.verify();
      return { success: true, message: 'SMTP connection successful' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async sendTestEmail(toEmail) {
    if (!this.initTransporter()) {
      return { success: false, error: 'SMTP not configured' };
    }
    const config = this.getConfig();
    try {
      const result = await this.transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: toEmail,
        subject: 'Test Email from Tally Dashboard',
        text: 'This is a test email. If you received this, email is configured correctly!',
        html: '<h2>Test Email</h2><p>This is a test email from your <strong>Tally Dashboard</strong>.</p><p>If you received this, email is configured correctly!</p>'
      });
      return { success: true, messageId: result.messageId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async sendBillEmail({ toEmail, bill, items, party, business, nepaliDate }) {
    if (!this.initTransporter()) {
      return { success: false, error: 'SMTP not configured' };
    }
    const config = this.getConfig();

    const itemsHTML = items.map((item, idx) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${idx + 1}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee">${item.stockItem || item.stock_item}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:center">${item.quantity} ${item.unit || 'Nos'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">Rs ${Number(item.rate).toLocaleString('en-IN')}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">Rs ${Number(item.amount).toLocaleString('en-IN')}</td>
      </tr>
    `).join('');

    const total = items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
    const totalQty = items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

    const html = `
      <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;color:#333">
        <div style="text-align:center;padding:15px;border-bottom:2px solid #333">
          <h2 style="margin:0">${business.businessName || 'Business'}</h2>
          ${business.businessAddress ? `<p style="margin:4px 0;font-size:13px;color:#666">${business.businessAddress}</p>` : ''}
          ${business.businessPhone ? `<p style="margin:2px 0;font-size:12px;color:#888">Phone: ${business.businessPhone}</p>` : ''}
          ${business.businessPAN ? `<p style="margin:2px 0;font-size:11px;color:#999">PAN: ${business.businessPAN}</p>` : ''}
        </div>

        <div style="text-align:center;padding:10px">
          <span style="border:1px solid #333;padding:4px 20px;font-weight:700;text-transform:uppercase;letter-spacing:1px">${bill.voucherType || 'Pending Sales Bill'}</span>
        </div>

        <table style="width:100%;font-size:13px;margin:10px 0">
          <tr>
            <td><strong>Party:</strong> ${bill.partyName}</td>
            <td style="text-align:right"><strong>Bill No:</strong> ${bill.voucherNumber}</td>
          </tr>
          <tr>
            <td>${party?.address ? `<strong>Address:</strong> ${party.address}` : ''}</td>
            <td style="text-align:right"><strong>Date:</strong> ${bill.voucherDate || ''}${nepaliDate ? ` (${nepaliDate})` : ''}</td>
          </tr>
        </table>

        <table style="width:100%;border-collapse:collapse;margin:15px 0">
          <thead>
            <tr style="background:#333;color:white">
              <th style="padding:8px 10px;font-size:11px;text-align:center;width:30px">#</th>
              <th style="padding:8px 10px;font-size:11px;text-align:left">Item</th>
              <th style="padding:8px 10px;font-size:11px;text-align:center;width:80px">Qty</th>
              <th style="padding:8px 10px;font-size:11px;text-align:right;width:90px">Rate</th>
              <th style="padding:8px 10px;font-size:11px;text-align:right;width:100px">Amount</th>
            </tr>
          </thead>
          <tbody>${itemsHTML}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" style="padding:10px;text-align:right;font-weight:700;border-top:2px solid #333">Total:</td>
              <td style="padding:10px;text-align:center;font-weight:700;border-top:2px solid #333">${totalQty}</td>
              <td style="padding:10px;border-top:2px solid #333"></td>
              <td style="padding:10px;text-align:right;font-weight:700;border-top:2px solid #333">Rs ${total.toLocaleString('en-IN')}</td>
            </tr>
          </tfoot>
        </table>

        <p style="font-size:11px;color:#999;text-align:center;margin-top:20px">Sent from Tally Dashboard</p>
      </div>
    `;

    try {
      const result = await this.transporter.sendMail({
        from: `"${config.fromName}" <${config.fromEmail}>`,
        to: toEmail,
        subject: `Bill ${bill.voucherNumber} - ${bill.partyName} - Rs ${total.toLocaleString('en-IN')}`,
        html
      });
      return { success: true, messageId: result.messageId };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

export const emailService = new EmailService();
export default emailService;
