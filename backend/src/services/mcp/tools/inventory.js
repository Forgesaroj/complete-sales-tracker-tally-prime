/**
 * MCP Tools — Inventory (Stock balances and movements)
 */

import { z } from 'zod';
import { userDateToTally, truncateResults, textResponse, errorResponse } from '../helpers.js';

export function registerInventoryTools(server, tally, db) {

  server.tool('get-stock-summary',
    'Get current stock balances from local database. Shows closing quantity, value, and rate per item.',
    {
      search: z.string().optional().describe('Filter by item name'),
      in_stock_only: z.boolean().optional().describe('Only items with balance > 0. Default: true')
    },
    async ({ search, in_stock_only }) => {
      try {
        let items;
        if (search) {
          items = db.searchStockItems(search);
        } else if (in_stock_only === false) {
          items = db.getAllStockItems();
        } else {
          items = db.getStockItemsWithBalance();
        }
        return textResponse(truncateResults(items));
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.tool('get-inventory-movement',
    'Get inventory movements (stock in/out) from Tally for a date range. Requires Tally connection.',
    {
      from_date: z.string().describe('Start date YYYY-MM-DD (required)'),
      to_date: z.string().describe('End date YYYY-MM-DD (required)'),
      stock_item: z.string().optional().describe('Filter to specific stock item name')
    },
    async ({ from_date, to_date, stock_item }) => {
      try {
        const result = await tally.getInventoryMovement(
          userDateToTally(from_date),
          userDateToTally(to_date),
          stock_item || null
        );
        return textResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
