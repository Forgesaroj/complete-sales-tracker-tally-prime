/**
 * Services Index
 * Re-exports all services for backward compatibility
 *
 * Structure:
 *   services/
 *   ├── tally/         - Tally Prime integration
 *   ├── database/      - SQLite database
 *   ├── sync/          - Sync services
 *   └── payment/       - Payment integrations (Fonepay, RBB)
 */

// Tally
export { tallyConnector } from './tally/index.js';

// Database
export { db } from './database/index.js';

// Sync
export { syncService } from './sync/index.js';

// Payment
export { fonepayService, rbbService } from './payment/index.js';
