/**
 * MCP Tools — Financial Statements (all require live Tally connection)
 */

import { z } from 'zod';
import { userDateToTally, textResponse, errorResponse } from '../helpers.js';

export function registerFinancialTools(server, tally, db) {

  server.tool('get-balance-sheet',
    'Get Balance Sheet from Tally. Shows assets, liabilities, and equity with group breakdowns. Requires Tally connection.',
    {
      from_date: z.string().optional().describe('Start date YYYY-MM-DD'),
      to_date: z.string().optional().describe('End date YYYY-MM-DD')
    },
    async ({ from_date, to_date }) => {
      try {
        const result = await tally.getBalanceSheet(
          userDateToTally(from_date),
          userDateToTally(to_date)
        );
        return textResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.tool('get-profit-loss',
    'Get Profit & Loss statement from Tally. Shows income, expenses, and net profit. Requires Tally connection.',
    {
      from_date: z.string().optional().describe('Start date YYYY-MM-DD'),
      to_date: z.string().optional().describe('End date YYYY-MM-DD')
    },
    async ({ from_date, to_date }) => {
      try {
        const result = await tally.getProfitAndLoss(
          userDateToTally(from_date),
          userDateToTally(to_date)
        );
        return textResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.tool('get-trial-balance',
    'Get Trial Balance from Tally. Shows debit/credit balances for all ledger accounts. Requires Tally connection.',
    {
      from_date: z.string().optional().describe('Start date YYYY-MM-DD'),
      to_date: z.string().optional().describe('End date YYYY-MM-DD')
    },
    async ({ from_date, to_date }) => {
      try {
        const result = await tally.getTrialBalance(
          userDateToTally(from_date),
          userDateToTally(to_date)
        );
        return textResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.tool('get-cash-flow',
    'Get Cash Flow statement from Tally. Requires date range and Tally connection.',
    {
      from_date: z.string().describe('Start date YYYY-MM-DD (required)'),
      to_date: z.string().describe('End date YYYY-MM-DD (required)')
    },
    async ({ from_date, to_date }) => {
      try {
        const result = await tally.getCashFlow(
          userDateToTally(from_date),
          userDateToTally(to_date)
        );
        return textResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.tool('get-ratio-analysis',
    'Get financial ratio analysis from Tally (current ratio, debt-to-equity, gross margin, etc.). Requires Tally connection.',
    {
      from_date: z.string().optional().describe('Start date YYYY-MM-DD'),
      to_date: z.string().optional().describe('End date YYYY-MM-DD')
    },
    async ({ from_date, to_date }) => {
      try {
        const result = await tally.getRatioAnalysis(
          userDateToTally(from_date),
          userDateToTally(to_date)
        );
        return textResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
