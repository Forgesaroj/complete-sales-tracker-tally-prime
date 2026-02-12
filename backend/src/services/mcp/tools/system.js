/**
 * MCP Tools — System (Dashboard summary, connection status)
 */

import { z } from 'zod';
import { textResponse, errorResponse } from '../helpers.js';

export function registerSystemTools(server, tally, db) {

  server.tool('get-dashboard-summary',
    'Get business dashboard overview: today\'s sales count/total, pending bills, stock counts, sync status, Tally connection status.',
    {},
    async () => {
      try {
        const summary = db.getDashboardSummary();

        let tallyConnected = false;
        try {
          await tally.checkConnection();
          tallyConnected = true;
        } catch {}

        return textResponse({
          ...summary,
          tallyConnected
        });
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
