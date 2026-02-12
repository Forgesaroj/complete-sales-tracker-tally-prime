/**
 * MCP Tools — Banking (RBB transactions, Fonepay, Cheques)
 */

import { z } from 'zod';
import { userDateToTally, truncateResults, textResponse, errorResponse } from '../helpers.js';

export function registerBankingTools(server, tally, db) {

  server.tool('get-bank-transactions',
    'Get bank transactions from local database. Supports RBB bank and Fonepay payment transactions.',
    {
      source: z.enum(['rbb', 'fonepay']).describe('Transaction source: "rbb" or "fonepay"'),
      from_date: z.string().optional().describe('Start date YYYY-MM-DD'),
      to_date: z.string().optional().describe('End date YYYY-MM-DD'),
      limit: z.number().optional().describe('Max results, default 50')
    },
    async ({ source, from_date, to_date, limit }) => {
      try {
        const maxResults = limit || 50;
        let result;

        if (source === 'rbb') {
          if (from_date && to_date) {
            result = db.getRBBTransactionsByDateRange(from_date, to_date);
          } else {
            result = db.getRBBTransactions(maxResults);
          }
        } else {
          if (from_date) {
            result = db.getFonepayTransactionsByDate(from_date);
          } else {
            result = db.getFonepayTransactions(maxResults);
          }
        }

        return textResponse(truncateResults(result, maxResults));
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.tool('get-cheques',
    'Get cheque records from local database with optional status filter.',
    {
      status: z.string().optional().describe('Filter: "pending", "deposited", "cleared", "bounced"'),
      party_name: z.string().optional().describe('Filter by party name')
    },
    async ({ status, party_name }) => {
      try {
        const filters = {};
        if (status) filters.status = status;
        if (party_name) filters.partyName = party_name;

        const result = db.getCheques(filters);
        return textResponse(truncateResults(result));
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
