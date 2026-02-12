/**
 * MCP Tools — Outstanding (Receivables/Payables with ageing)
 */

import { z } from 'zod';
import { textResponse, errorResponse } from '../helpers.js';

export function registerOutstandingTools(server, tally, db) {

  server.tool('get-outstanding',
    'Get outstanding receivables/payables with ageing analysis from local cache.',
    {
      party_name: z.string().optional().describe('Filter to specific party'),
      report_type: z.enum(['detail', 'ageing', 'party_summary']).optional()
        .describe('Report type: "detail" (bill-wise), "ageing" (0-30/30-60/60-90/90+ days), "party_summary". Default: detail')
    },
    async ({ party_name, report_type }) => {
      try {
        const type = report_type || 'detail';
        let result;

        if (type === 'ageing') {
          result = db.getAgeingSummary();
        } else if (type === 'party_summary') {
          result = db.getOutstandingParties();
        } else {
          result = db.getOutstandingBills(party_name || null);
        }

        return textResponse(result);
      } catch (error) {
        return errorResponse(error);
      }
    }
  );
}
