/**
 * MCP Tools — Masters (Ledgers, Stock Items, Groups, Godowns)
 */

import { z } from 'zod';
import { truncateResults, textResponse, errorResponse } from '../helpers.js';

export function registerMasterTools(server, tally, db) {

  server.tool('list-ledgers',
    'List party ledgers (customers/vendors) from local database. Use to look up party names.',
    {
      group: z.string().optional().describe('Parent group filter: "Sundry Debtors", "Sundry Creditors", "Sales Accounts"'),
      search: z.string().optional().describe('Search filter on party name (partial match)')
    },
    async ({ group, search }) => {
      try {
        const result = search
          ? db.searchParties(search)
          : db.getAllParties(group || null);
        return textResponse(truncateResults(result));
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.tool('list-stock-items',
    'List stock items (inventory master) from local database. Returns name, group, unit, balance, value.',
    {
      search: z.string().optional().describe('Search filter on item name'),
      in_stock_only: z.boolean().optional().describe('Only items with closing balance > 0. Default: false')
    },
    async ({ search, in_stock_only }) => {
      try {
        let items;
        if (search) {
          items = db.searchStockItems(search);
        } else if (in_stock_only) {
          items = db.getStockItemsWithBalance();
        } else {
          items = db.getAllStockItems();
        }
        return textResponse(truncateResults(items));
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.tool('list-stock-groups',
    'List stock groups (categories) with item counts and values from local cache.',
    {},
    async () => {
      try {
        const groups = db.getStockGroupSummary();
        return textResponse(groups);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );

  server.tool('list-godowns',
    'List godowns (warehouses) from Tally. Requires live Tally connection.',
    {},
    async () => {
      try {
        const godowns = await tally.getGodowns();
        return textResponse(godowns);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
