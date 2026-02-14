/**
 * Chat Routes — Smart Commands + AI Chat
 *
 * POST /api/chat/query   — Execute predefined smart commands (no API key needed)
 * POST /api/chat/message  — AI chat via Anthropic API (requires ANTHROPIC_API_KEY)
 * GET  /api/chat/status   — Check if AI chat is available
 */

import { Router } from 'express';
import { db } from '../services/database/database.js';
import { tallyConnector } from '../services/tally/tallyConnector.js';

const router = Router();

/**
 * Format date as YYYYMMDD for DB queries
 */
function toDbDate(dateStr) {
  if (!dateStr) {
    return new Date().toISOString().split('T')[0].replace(/-/g, '');
  }
  if (/^\d{8}$/.test(dateStr)) return dateStr;
  return dateStr.replace(/-/g, '');
}

/**
 * Get today's date as YYYYMMDD
 */
function today() {
  return new Date().toISOString().split('T')[0].replace(/-/g, '');
}

/**
 * Smart command handlers — map command names to DB/Tally calls
 */
const COMMANDS = {
  'dashboard': {
    label: 'Dashboard Summary',
    handler: async () => db.getDashboardSummary()
  },
  'sales-today': {
    label: "Today's Sales",
    handler: async () => {
      const t = today();
      return db.getDaybook(t, t, ['Sales']);
    }
  },
  'daybook': {
    label: 'Daybook',
    handler: async (params) => {
      const from = toDbDate(params?.from || params?.date);
      const to = toDbDate(params?.to || params?.date);
      return db.getDaybook(from, to, params?.voucherTypes || null);
    }
  },
  'pending-bills': {
    label: 'Pending Bills',
    handler: async () => db.getPendingBills()
  },
  'party-summary': {
    label: 'Party Summary',
    handler: async (params) => {
      const from = toDbDate(params?.from);
      const to = toDbDate(params?.to);
      return db.getPartySummary(from, to);
    }
  },
  'stock-summary': {
    label: 'Stock Summary',
    handler: async () => db.getStockItemsWithBalance()
  },
  'outstanding': {
    label: 'Outstanding Bills',
    handler: async (params) => {
      if (params?.type === 'ageing') return db.getAgeingSummary();
      if (params?.type === 'parties') return db.getOutstandingParties();
      return db.getOutstandingBills(params?.party || null);
    }
  },
  'cheques': {
    label: 'Cheques',
    handler: async (params) => db.getCheques(params || {})
  },
  'search-party': {
    label: 'Search Party',
    handler: async (params) => db.searchParties(params?.query || '', 20)
  },
  'search-item': {
    label: 'Search Stock Item',
    handler: async (params) => db.searchStockItems(params?.query || '', 20)
  },
  'lock-vouchers': {
    label: 'Lock Vouchers',
    handler: async (params) => {
      const toDate = params?.toDate || new Date().toISOString().split('T')[0];
      const fromDate = params?.fromDate;
      // Get vouchers from local DB
      const to = toDbDate(toDate);
      let sql = `SELECT tally_master_id, tally_guid, voucher_type FROM bills
        WHERE (is_deleted = 0 OR is_deleted IS NULL)
        AND tally_master_id IS NOT NULL
        AND voucher_date <= ?`;
      const sqlParams = [to];
      if (fromDate) {
        sql += ' AND voucher_date >= ?';
        sqlParams.push(toDbDate(fromDate));
      }
      const vouchers = db.db.prepare(sql).all(...sqlParams);
      if (vouchers.length === 0) return { locked: 0, message: 'No vouchers found for the given date range' };

      let locked = 0, failed = 0;
      for (const v of vouchers) {
        try {
          await tallyConnector.setVoucherUDF(v.tally_guid, v.voucher_type, 'LockVoucher', 'Yes');
          locked++;
        } catch { failed++; }
      }
      return { locked, failed, total: vouchers.length };
    }
  },
  'unlock-vouchers': {
    label: 'Unlock Vouchers',
    handler: async (params) => {
      const toDate = params?.toDate || new Date().toISOString().split('T')[0];
      const fromDate = params?.fromDate;
      const to = toDbDate(toDate);
      let sql = `SELECT tally_master_id, tally_guid, voucher_type FROM bills
        WHERE (is_deleted = 0 OR is_deleted IS NULL)
        AND tally_master_id IS NOT NULL
        AND voucher_date <= ?`;
      const sqlParams = [to];
      if (fromDate) {
        sql += ' AND voucher_date >= ?';
        sqlParams.push(toDbDate(fromDate));
      }
      const vouchers = db.db.prepare(sql).all(...sqlParams);
      if (vouchers.length === 0) return { unlocked: 0, message: 'No vouchers found' };

      let unlocked = 0, failed = 0;
      for (const v of vouchers) {
        try {
          await tallyConnector.setVoucherUDF(v.tally_guid, v.voucher_type, 'LockVoucher', 'No');
          unlocked++;
        } catch { failed++; }
      }
      return { unlocked, failed, total: vouchers.length };
    }
  }
};

/**
 * POST /api/chat/query — Execute a smart command
 */
router.post('/query', async (req, res) => {
  try {
    const { command, params } = req.body;

    if (!command || !COMMANDS[command]) {
      return res.status(400).json({
        error: 'Unknown command',
        available: Object.keys(COMMANDS).map(k => ({ command: k, label: COMMANDS[k].label }))
      });
    }

    const result = await COMMANDS[command].handler(params);
    res.json({ command, label: COMMANDS[command].label, data: result });
  } catch (error) {
    console.error('[Chat] Query error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/chat/status — Check AI availability
 */
router.get('/status', (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  res.json({
    aiEnabled: !!apiKey,
    commands: Object.keys(COMMANDS).map(k => ({ command: k, label: COMMANDS[k].label }))
  });
});

/**
 * AI Chat tool definitions for Anthropic API
 */
const AI_TOOLS = [
  {
    name: 'get_dashboard_summary',
    description: 'Get business dashboard overview with today\'s sales, pending bills count, stock counts',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_daybook',
    description: 'Get daybook entries (vouchers/transactions) for a date range. Returns voucher list with party, amount, type.',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD' },
        to: { type: 'string', description: 'End date YYYY-MM-DD' },
        voucherTypes: { type: 'array', items: { type: 'string' }, description: 'Filter by voucher types e.g. ["Sales", "Receipt"]' }
      },
      required: ['from', 'to']
    }
  },
  {
    name: 'get_sales_today',
    description: 'Get today\'s sales vouchers with party names and amounts',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_pending_bills',
    description: 'Get all pending/unpaid sales bills',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_party_summary',
    description: 'Get party-wise transaction summary for a date range',
    input_schema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Start date YYYY-MM-DD' },
        to: { type: 'string', description: 'End date YYYY-MM-DD' }
      },
      required: ['from', 'to']
    }
  },
  {
    name: 'get_stock_summary',
    description: 'Get stock items with current balance/quantity',
    input_schema: { type: 'object', properties: {}, required: [] }
  },
  {
    name: 'get_outstanding',
    description: 'Get outstanding bills. Can return detail, ageing summary, or party-wise summary.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['detail', 'ageing', 'parties'], description: 'Report type' },
        party: { type: 'string', description: 'Filter by party name (for detail type)' }
      },
      required: []
    }
  },
  {
    name: 'get_cheques',
    description: 'Get cheque records with optional filters',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by status' },
        party: { type: 'string', description: 'Filter by party name' }
      },
      required: []
    }
  },
  {
    name: 'search_party',
    description: 'Search for a party/ledger by name',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query' } },
      required: ['query']
    }
  },
  {
    name: 'search_stock_item',
    description: 'Search for a stock item by name',
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query' } },
      required: ['query']
    }
  }
];

/**
 * Map AI tool call to actual DB method
 */
async function executeAiTool(toolName, input) {
  switch (toolName) {
    case 'get_dashboard_summary':
      return db.getDashboardSummary();
    case 'get_daybook':
      return db.getDaybook(toDbDate(input.from), toDbDate(input.to), input.voucherTypes || null);
    case 'get_sales_today': {
      const t = today();
      return db.getDaybook(t, t, ['Sales']);
    }
    case 'get_pending_bills':
      return db.getPendingBills();
    case 'get_party_summary':
      return db.getPartySummary(toDbDate(input.from), toDbDate(input.to));
    case 'get_stock_summary':
      return db.getStockItemsWithBalance();
    case 'get_outstanding':
      if (input.type === 'ageing') return db.getAgeingSummary();
      if (input.type === 'parties') return db.getOutstandingParties();
      return db.getOutstandingBills(input.party || null);
    case 'get_cheques':
      return db.getCheques(input || {});
    case 'search_party':
      return db.searchParties(input.query, 20);
    case 'search_stock_item':
      return db.searchStockItems(input.query, 20);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * POST /api/chat/message — AI chat (requires ANTHROPIC_API_KEY)
 */
router.post('/message', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.json({
      aiEnabled: false,
      message: 'AI chat is not configured. Add ANTHROPIC_API_KEY to your .env file.\nGet your API key from https://console.anthropic.com'
    });
  }

  try {
    const { message, history = [] } = req.body;
    if (!message) return res.status(400).json({ error: 'Message is required' });

    // Build messages array
    const messages = [
      ...history.slice(-10), // Last 10 messages for context
      { role: 'user', content: message }
    ];

    // Call Anthropic API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250514',
        max_tokens: 2048,
        system: `You are a Tally business assistant for a wholesale company. You help users query their business data from Tally accounting software.
Answer concisely. Format numbers with commas (e.g., 1,50,000 for Indian numbering).
Use the tools to fetch real data, then summarize the results clearly.
Today's date is ${new Date().toISOString().split('T')[0]}.
Currency is Nepali Rupees (NPR/Rs).`,
        tools: AI_TOOLS,
        messages
      })
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error('[Chat] Anthropic API error:', response.status, errBody);
      return res.status(response.status).json({
        error: `API error: ${response.status}`,
        detail: errBody
      });
    }

    let result = await response.json();

    // Handle tool use — loop until we get a text response
    let iterations = 0;
    while (result.stop_reason === 'tool_use' && iterations < 5) {
      iterations++;
      const toolBlocks = result.content.filter(b => b.type === 'tool_use');
      const toolResults = [];

      for (const block of toolBlocks) {
        try {
          const data = await executeAiTool(block.name, block.input);
          // Truncate large results
          let resultStr = JSON.stringify(data);
          if (resultStr.length > 20000) {
            const items = Array.isArray(data) ? data.slice(0, 50) : data;
            resultStr = JSON.stringify(items) + `\n... (truncated, showing first 50 of ${Array.isArray(data) ? data.length : '?'} items)`;
          }
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: resultStr
          });
        } catch (err) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: `Error: ${err.message}`,
            is_error: true
          });
        }
      }

      // Continue conversation with tool results
      const nextResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-5-20250514',
          max_tokens: 2048,
          system: `You are a Tally business assistant for a wholesale company. You help users query their business data from Tally accounting software.
Answer concisely. Format numbers with commas (e.g., 1,50,000 for Indian numbering).
Use the tools to fetch real data, then summarize the results clearly.
Today's date is ${new Date().toISOString().split('T')[0]}.
Currency is Nepali Rupees (NPR/Rs).`,
          tools: AI_TOOLS,
          messages: [
            ...messages,
            { role: 'assistant', content: result.content },
            { role: 'user', content: toolResults }
          ]
        })
      });

      if (!nextResponse.ok) {
        const errBody = await nextResponse.text();
        return res.status(nextResponse.status).json({ error: `API error: ${nextResponse.status}`, detail: errBody });
      }

      result = await nextResponse.json();
    }

    // Extract text response
    const textBlocks = result.content.filter(b => b.type === 'text');
    const reply = textBlocks.map(b => b.text).join('\n');

    res.json({
      aiEnabled: true,
      reply,
      usage: result.usage
    });
  } catch (error) {
    console.error('[Chat] AI error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

export default router;
