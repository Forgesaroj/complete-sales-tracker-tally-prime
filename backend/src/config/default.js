// Configuration for Tally Dashboard Server
// Load dotenv — supports ENV_FILE for live mode: ENV_FILE=.env.live node src/index.js
import dotenv from 'dotenv';
dotenv.config({ path: process.env.ENV_FILE || '.env' });

export const config = {
  // Server settings
  server: {
    port: parseInt(process.env.PORT) || 3001,
    host: process.env.HOST || '0.0.0.0'  // Listen on all interfaces for LAN access
  },

  // Tally Prime connection settings
  tally: {
    host: process.env.TALLY_HOST || 'localhost',
    port: parseInt(process.env.TALLY_PORT) || 9000,
    companyName: process.env.TALLY_COMPANY || '',  // Billing company name
    odbcCompanyName: process.env.ODBC_COMPANY || '',  // Cheque/ODBC company name
    syncInterval: parseInt(process.env.SYNC_INTERVAL) || 120000  // Poll every 2 minutes (gentle on Tally)
  },

  // Database settings
  database: {
    path: process.env.DB_PATH || './data/dashboard.db'
  },

  // Voucher type mappings (as configured in your Tally)
  voucherTypes: {
    sales: [
      'Sales',
      'Credit Sales',
      'Pending Sales Bill',
      'A Pto Bill'
    ],
    receipt: [
      'Bank Receipt',
      'Counter Receipt',
      'Receipt',
      'Dashboard Receipt'  // Used when creating receipts from dashboard
    ]
  },

  // Bill status workflow
  billStatus: {
    CREATED: 'created',
    PARTIAL: 'partial',
    PAID: 'paid',
    READY: 'ready',
    DISPATCHED: 'dispatched',
    CUSTOMER_TAKEN: 'customer_taken'
  },

  // Notification settings
  notifications: {
    enabled: true,
    largeBillThreshold: 50000  // Alert for bills above this amount
  }
};

export default config;
