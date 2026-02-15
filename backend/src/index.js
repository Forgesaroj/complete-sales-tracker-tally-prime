/**
 * Tally Dashboard Server
 * Main entry point
 *
 * Features:
 * - REST API for dashboard operations
 * - WebSocket for real-time updates
 * - Background sync with Tally Prime
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import os from 'os';

import config from './config/default.js';
import { db } from './services/database/database.js';
import { syncService } from './services/sync/syncService.js';
import { fonepayService } from './services/payment/fonepayService.js';
import { rbbService } from './services/payment/rbbService.js';
import { whatsappService } from './services/whatsapp/whatsappService.js';
import apiRoutes from './routes/index.js';
import { tallyConnector } from './services/tally/tallyConnector.js';
import { createMcpServer } from './services/mcp/mcpServer.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Express
const app = express();
const httpServer = createServer(app);

// Initialize Socket.io for real-time updates
const io = new Server(httpServer, {
  cors: {
    origin: '*',  // In production, restrict to your domain
    methods: ['GET', 'POST']
  }
});

// Make io available to routes
app.set('io', io);

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files (for production build)
app.use(express.static(join(__dirname, '../../frontend/dist')));

// Serve TDL files for download
app.use('/tdl', express.static(join(__dirname, '../tdl')));

// API Routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    sync: syncService.getStatus()
  });
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current sync status on connect
  socket.emit('sync:status', syncService.getStatus());

  // Send dashboard summary on connect
  socket.emit('dashboard:summary', db.getDashboardSummary());

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });

  // Handle manual sync request from client
  socket.on('sync:trigger', async () => {
    const result = await syncService.syncNow();
    socket.emit('sync:complete', result);
  });
});

// MCP Server (Model Context Protocol) — Streamable HTTP transport
const mcpServer = createMcpServer(tallyConnector, db);

app.post('/mcp', async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => transport.close());
    await mcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('[MCP] Error handling request:', error.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'MCP request failed' });
    }
  }
});

app.get('/mcp', (req, res) => {
  res.status(405).json({ error: 'Method not allowed. Use POST for MCP requests.' });
});

app.delete('/mcp', (req, res) => {
  res.status(405).json({ error: 'Method not allowed.' });
});

// Direct TDL file download
app.get('/voucher-lock.tdl', (req, res) => {
  res.download(join(__dirname, '../tdl/voucher-lock.tdl'), 'voucher-lock.tdl');
});

// Catch-all for SPA routing (production only - dev uses proxy)
// Catch-all for SPA routing (serve index.html for non-API routes)
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(join(__dirname, '../../frontend/dist/index.html'));
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Startup sequence
async function start() {
  console.log('═'.repeat(50));
  console.log('  TALLY DASHBOARD SERVER');
  console.log('  Wholesale Business Management');
  console.log('═'.repeat(50));

  // Initialize database
  console.log('\n[1/3] Initializing database...');
  db.init();

  // Start HTTP server
  console.log('\n[2/3] Starting HTTP server...');
  httpServer.listen(config.server.port, config.server.host, () => {
    console.log(`✓ Server running at http://${config.server.host}:${config.server.port}`);
    console.log(`✓ API available at http://${config.server.host}:${config.server.port}/api`);
    console.log(`✓ MCP endpoint at http://${config.server.host}:${config.server.port}/mcp`);

    // Get local IP for LAN access
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`✓ LAN access: http://${iface.address}:${config.server.port}`);
        }
      }
    }
  });

  // Start Tally sync service
  console.log('\n[3/3] Starting Tally sync service...');
  console.log(`  → Connecting to Tally at ${config.tally.host}:${config.tally.port}`);

  // Give sync service access to Socket.io for broadcasts
  syncService.setSocketIO(io);

  // Start sync (will retry if Tally not available)
  const syncStarted = await syncService.start();
  if (syncStarted) {
    console.log('✓ Tally sync service started');
  } else {
    console.log('⚠ Tally sync failed to start - will retry when Tally is available');
    console.log('  Make sure Tally Prime is running with HTTP server enabled');

    // Retry every 10 seconds
    const retryInterval = setInterval(async () => {
      console.log('Retrying Tally connection...');
      const connected = await syncService.start();
      if (connected) {
        console.log('✓ Tally connected!');
        clearInterval(retryInterval);
      }
    }, 10000);
  }

  // Start Fonepay sync service (if configured)
  console.log('\n[4/5] Starting Fonepay sync service...');
  fonepayService.setSocketIO(io);

  if (process.env.FONEPAY_USERNAME && process.env.FONEPAY_PASSWORD) {
    fonepayService.start();
  } else {
    console.log('⚠ Fonepay credentials not configured');
    console.log('  Set FONEPAY_USERNAME and FONEPAY_PASSWORD in .env to enable');
  }

  // Start RBB Smart Banking sync service (if configured)
  console.log('\n[5/5] Starting RBB Smart Banking sync service...');
  rbbService.setSocketIO(io);

  if (process.env.RBB_USERNAME && process.env.RBB_PASSWORD) {
    // RBB service is triggered manually, not auto-started
    console.log('✓ RBB Smart Banking service ready (manual sync only)');
    console.log(`  → Interval: ${process.env.RBB_INTERVAL_MS || 3600000}ms`);
    console.log(`  → Headless: ${process.env.RBB_HEADLESS !== 'false'}`);
  } else {
    console.log('⚠ RBB credentials not configured');
    console.log('  Set RBB_USERNAME and RBB_PASSWORD in .env to enable');
  }

  // Initialize WhatsApp service (non-blocking)
  console.log('\n[6/6] Initializing WhatsApp service...');
  whatsappService.setSocketIO(io);
  whatsappService.initialize().then(() => {
    console.log('✓ WhatsApp service connected');
  }).catch(err => {
    console.log(`⚠ WhatsApp not connected (${err.message}) — initialize from dashboard`);
  });

  console.log('\n' + '═'.repeat(50));
  console.log('  Server ready!');
  console.log('═'.repeat(50) + '\n');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  syncService.stop();
  await fonepayService.stop();
  await rbbService.stop();
  await whatsappService.destroy();
  db.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nShutting down...');
  syncService.stop();
  await fonepayService.stop();
  await rbbService.stop();
  await whatsappService.destroy();
  db.close();
  process.exit(0);
});

// Start the server
start().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
