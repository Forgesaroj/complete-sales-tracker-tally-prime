#!/usr/bin/env node
/**
 * MCP STDIO Entry Point
 * Standalone process for Claude Desktop and other STDIO-based MCP clients.
 *
 * Usage in claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "tally-connector": {
 *       "command": "node",
 *       "args": ["/path/to/backend/src/mcp-stdio.js"]
 *     }
 *   }
 * }
 *
 * IMPORTANT: This runs as a separate process. The main dashboard server
 * must be running for the DB to have synced data.
 */

import 'dotenv/config';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { db } from './services/database/database.js';
import { tallyConnector } from './services/tally/tallyConnector.js';
import { createMcpServer } from './services/mcp/mcpServer.js';

// Initialize database (reads existing synced data)
db.init();

// Create MCP server with all tools
const server = createMcpServer(tallyConnector, db);

// Connect via STDIO transport
const transport = new StdioServerTransport();
await server.connect(transport);

// Log to stderr (stdout is reserved for JSON-RPC)
console.error('[MCP] Tally Connector MCP server running via STDIO');
