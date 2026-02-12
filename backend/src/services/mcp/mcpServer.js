/**
 * MCP Server — Tally Connector
 * Creates and configures the MCP server with all tools registered.
 * Shared by both STDIO and HTTP transports.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerMasterTools } from './tools/masters.js';
import { registerVoucherTools } from './tools/vouchers.js';
import { registerFinancialTools } from './tools/financials.js';
import { registerInventoryTools } from './tools/inventory.js';
import { registerOutstandingTools } from './tools/outstanding.js';
import { registerBankingTools } from './tools/banking.js';
import { registerWriteTools } from './tools/write.js';
import { registerSystemTools } from './tools/system.js';

/**
 * Create a configured MCP server instance with all Tally tools
 * @param {object} tally - tallyConnector instance
 * @param {object} db - database service instance
 * @returns {McpServer}
 */
export function createMcpServer(tally, db) {
  const server = new McpServer({
    name: 'tally-connector',
    version: '1.0.0'
  });

  // Register all tool categories
  registerMasterTools(server, tally, db);
  registerVoucherTools(server, tally, db);
  registerFinancialTools(server, tally, db);
  registerInventoryTools(server, tally, db);
  registerOutstandingTools(server, tally, db);
  registerBankingTools(server, tally, db);
  registerWriteTools(server, tally, db);
  registerSystemTools(server, tally, db);

  return server;
}
