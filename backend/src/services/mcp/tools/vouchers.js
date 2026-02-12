/**
 * MCP Tools — Vouchers/Bills
 */

import { z } from 'zod';
import { userDateToTally, todayTally, truncateResults, textResponse, errorResponse } from '../helpers.js';

export function registerVoucherTools(server, tally, db) {

  server.tool('get-vouchers',
    'Query vouchers/bills from local database with filters. Returns paginated results sorted by date descending.',
    {
      date_from: z.string().optional().describe('Start date YYYY-MM-DD'),
      date_to: z.string().optional().describe('End date YYYY-MM-DD'),
      voucher_type: z.string().optional().describe('e.g. "Sales", "Credit Sales", "Receipt", "Pending Sales Bill"'),
      party_name: z.string().optional().describe('Search party name (partial match)'),
      limit: z.number().optional().describe('Max results, default 50, max 200'),
      offset: z.number().optional().describe('Pagination offset, default 0')
    },
    async ({ date_from, date_to, voucher_type, party_name, limit, offset }) => {
      try {
        const options = {
          limit: Math.min(limit || 50, 200),
          offset: offset || 0
        };
        if (voucher_type) options.voucherType = voucher_type;
        if (date_from) options.dateFrom = userDateToTally(date_from);
        if (date_to) options.dateTo = userDateToTally(date_to);
        if (party_name) options.search = party_name;

        const result = db.getAllVouchers(options);
        return textResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.tool('get-voucher-detail',
    'Get complete detail of a single voucher including line items. Fetches live from Tally.',
    {
      master_id: z.string().describe('Tally Master ID of the voucher')
    },
    async ({ master_id }) => {
      try {
        const voucher = await tally.getCompleteVoucherViaCollection(master_id);
        return textResponse(voucher);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.tool('get-daybook',
    'Get daybook entries (all voucher types) for a date or date range from local database.',
    {
      date: z.string().optional().describe('Single date YYYY-MM-DD (default: today)'),
      date_from: z.string().optional().describe('Start date YYYY-MM-DD (overrides date)'),
      date_to: z.string().optional().describe('End date YYYY-MM-DD (overrides date)'),
      voucher_types: z.string().optional().describe('Comma-separated voucher types filter')
    },
    async ({ date, date_from, date_to, voucher_types }) => {
      try {
        let from, to;
        if (date_from && date_to) {
          from = userDateToTally(date_from);
          to = userDateToTally(date_to);
        } else {
          const d = userDateToTally(date) || todayTally();
          from = d;
          to = d;
        }
        const types = voucher_types ? voucher_types.split(',').map(t => t.trim()) : null;
        const result = db.getDaybook(from, to, types);
        return textResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.tool('get-party-summary',
    'Get party-wise transaction summary for a date range. Shows total debit, credit, and balance per party.',
    {
      date_from: z.string().optional().describe('Start date YYYY-MM-DD (default: today)'),
      date_to: z.string().optional().describe('End date YYYY-MM-DD (default: today)')
    },
    async ({ date_from, date_to }) => {
      try {
        const from = userDateToTally(date_from) || todayTally();
        const to = userDateToTally(date_to) || todayTally();
        const result = db.getPartySummary(from, to);
        return textResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
