/**
 * MCP Tools — Write Operations (Create vouchers in Tally)
 */

import { z } from 'zod';
import { textResponse, errorResponse } from '../helpers.js';
import config from '../../../config/default.js';

export function registerWriteTools(server, tally, db) {

  server.tool('create-sales-invoice',
    'Create a Sales Invoice in Tally with inventory items. Verify party_name and stock item names exist before calling (use list-ledgers and list-stock-items). Requires Tally connection.',
    {
      party_name: z.string().describe('Exact Tally ledger name for the customer'),
      items: z.array(z.object({
        stock_item: z.string().describe('Exact stock item name from Tally'),
        quantity: z.number().describe('Quantity to sell'),
        rate: z.number().describe('Price per unit'),
        unit: z.string().optional().describe('Unit of measure, default: "Nos"')
      })).describe('Array of items to include in the invoice'),
      voucher_type: z.string().optional().describe('Default: "Sales". Also: "Credit Sales", "Pending Sales Bill"'),
      sales_ledger: z.string().optional().describe('Sales ledger name. Default from settings.'),
      narration: z.string().optional().describe('Description/note for the invoice'),
      date: z.string().optional().describe('Invoice date YYYY-MM-DD, default: today')
    },
    async ({ party_name, items, voucher_type, sales_ledger, narration, date }) => {
      try {
        const defaultSalesLedger = db.getSetting('sales_ledger') || '1 Sales A/c';
        const defaultGodown = db.getSetting('default_godown') || 'Main Location';

        const invoiceData = {
          partyName: party_name,
          voucherType: voucher_type || 'Sales',
          salesLedger: sales_ledger || defaultSalesLedger,
          items: items.map(item => ({
            name: item.stock_item,
            quantity: item.quantity,
            rate: item.rate,
            unit: item.unit || 'Nos',
            godown: defaultGodown
          })),
          narration: narration || '',
          date: date || new Date().toISOString().split('T')[0]
        };

        const result = await tally.createSalesInvoice(invoiceData);
        return textResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.tool('create-receipt',
    'Create a Receipt voucher in Tally recording payment received. Supports multiple payment modes. Requires Tally connection.',
    {
      party_name: z.string().describe('Exact Tally ledger name for the party'),
      payment_modes: z.object({
        cash_teller_1: z.number().optional().describe('Cash teller 1 amount'),
        cash_teller_2: z.number().optional().describe('Cash teller 2 amount'),
        cheque_receipt: z.number().optional().describe('Cheque amount'),
        qr_code: z.number().optional().describe('QR payment amount'),
        discount: z.number().optional().describe('Discount amount'),
        bank_deposit: z.number().optional().describe('Bank deposit amount'),
        esewa: z.number().optional().describe('eSewa payment amount')
      }).describe('Payment mode amounts. At least one must be > 0.'),
      narration: z.string().optional().describe('Description/note'),
      date: z.string().optional().describe('Receipt date YYYY-MM-DD, default: today')
    },
    async ({ party_name, payment_modes, narration, date }) => {
      try {
        const receiptData = {
          partyName: party_name,
          cashTeller1: payment_modes.cash_teller_1 || 0,
          cashTeller2: payment_modes.cash_teller_2 || 0,
          chequeReceipt: payment_modes.cheque_receipt || 0,
          qrCode: payment_modes.qr_code || 0,
          discount: payment_modes.discount || 0,
          bankDeposit: payment_modes.bank_deposit || 0,
          esewa: payment_modes.esewa || 0,
          narration: narration || '',
          date: date || new Date().toISOString().split('T')[0]
        };

        const total = receiptData.cashTeller1 + receiptData.cashTeller2 +
          receiptData.chequeReceipt + receiptData.qrCode +
          receiptData.discount + receiptData.bankDeposit + receiptData.esewa;

        if (total <= 0) {
          return errorResponse(new Error('At least one payment mode must have an amount > 0'));
        }

        const result = await tally.createReceiptWithPaymentModes(receiptData);
        return textResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
