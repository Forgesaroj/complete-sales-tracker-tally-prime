# Tally Prime Dashboard Connector - Development Notes

## Project Overview
A real-time dashboard connector for Tally Prime ERP that syncs vouchers, stock items, parties, and enables offline invoice creation with automatic Tally sync.

---

## Tally ID System

### Understanding MASTERID, ALTERID, and GUID

| ID Type | Description | Behavior |
|---------|-------------|----------|
| **MASTERID** | Permanent unique ID assigned when record is created | Never changes, even if voucher is modified |
| **ALTERID** | Global modification counter across ALL Tally objects | Increments on ANY create/modify operation |
| **GUID** | Globally unique identifier | Unique per record, used for sync |

### Key Insight
- Tally does NOT store historical versions - old data is overwritten on modification
- We track history ourselves using the voucher_history table
- ALTERID is used for incremental sync: `WHERE ALTERID > lastSyncedAlterId`

---

## ID Storage by Entity

| Entity | GUID | MASTER ID | ALTER ID |
|--------|------|-----------|----------|
| **Bills (Vouchers)** | ✅ `tally_guid` | ✅ `tally_master_id` | ✅ `alter_id` |
| **Voucher History** | ✅ `guid` | ✅ `master_id` | ✅ `alter_id` + `previous_alter_id` |
| **Voucher Change Log** | ❌ | ✅ `master_id` | ✅ `old_alter_id` + `new_alter_id` |
| **Stock Items** | ❌ | ❌ | ✅ `alter_id` |
| **Parties/Ledgers** | ❌ | ❌ | ✅ `alter_id` |

---

## Timestamp Tracking

### Bills/Vouchers Timestamps
| Column | Description |
|--------|-------------|
| `tally_created_date` | Original creation date in Tally (from PRIORDATE) |
| `tally_altered_date` | Last modification date in Tally (from ALTEREDDATE) |
| `tally_entry_time` | Entry timestamp from Tally |
| `synced_at` | When record was synced from Tally to our DB |
| `created_at` | When record was first inserted in our DB |
| `updated_at` | When record was last updated in our DB |

---

## Database Schema (SQLite)

### Core Tables
- `users` - Dashboard users with roles and notification preferences
- `bills` - Vouchers synced from Tally (Sales, Receipts, etc.)
- `receipts` - Receipts created from Dashboard
- `sacks` / `sack_items` - Bundle/sack management
- `sync_state` - Main sync state tracking

### Master Data
- `stock_items` - Stock items with balances and pricing
- `parties` - Sundry Debtors and Creditors
- `master_sync_state` - Tracks last sync ALTERID for stock/parties

### History Tracking
- `voucher_history` - Complete snapshots of voucher versions
- `voucher_change_log` - Field-level change tracking

### Offline Mode
- `pending_invoices` - Invoices created when Tally is offline
- `daily_invoice_counter` - Auto-incrementing invoice numbers (resets daily)

### Fonepay Integration
- `fonepay_balance` - Balance snapshots
- `fonepay_transactions` - Transaction records
- `fonepay_settlements` - Settlement records
- `fonepay_sync_state` - Fonepay sync tracking

### Full Historical Sync
- `full_sync_state` - Tracks progress of full historical data fetch

---

## API Endpoints

### Sync Operations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sync/status` | Get current sync status |
| POST | `/api/sync/now` | Trigger manual sync |
| POST | `/api/sync/start` | Start auto-sync service |
| POST | `/api/sync/stop` | Stop auto-sync service |

### Full Historical Sync
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/sync/full-history/status` | Get full sync progress |
| POST | `/api/sync/full-history` | Start full historical sync |
| POST | `/api/sync/full-history/resume` | Resume interrupted sync |
| POST | `/api/sync/full-history/reset` | Reset sync state |

### Voucher History
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/voucher-history/stats` | Get history statistics |
| GET | `/api/voucher-history/:masterId` | Get voucher history by MASTERID |
| GET | `/api/voucher-history/:masterId/changes` | Get field-level changes |
| GET | `/api/voucher-by-alterid/:alterId` | Get voucher by ALTERID |
| GET | `/api/recent-changes` | Get recent voucher changes |

### Bills/Vouchers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bills` | Get all bills |
| GET | `/api/bills/today` | Get today's bills |
| GET | `/api/bills/pending` | Get pending bills |
| GET | `/api/bills/:id` | Get bill by ID |
| PUT | `/api/bills/:id/payment-status` | Update payment status |
| PUT | `/api/bills/:id/dispatch-status` | Update dispatch status |

### Stock Items
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/stock` | Get all stock items |
| GET | `/api/stock/search` | Search stock items |
| GET | `/api/stock/with-balance` | Get items with balance > 0 |
| POST | `/api/stock/sync` | Sync stock from Tally |
| POST | `/api/stock/reset-sync` | Reset and full sync |

### Parties/Ledgers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/parties` | Get all parties |
| GET | `/api/parties/debtors` | Get Sundry Debtors |
| GET | `/api/parties/creditors` | Get Sundry Creditors |
| GET | `/api/parties/search` | Search parties |
| POST | `/api/parties/sync` | Sync parties from Tally |
| POST | `/api/parties/reset-sync` | Reset and full sync |

### Offline Invoices
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/invoices/pending` | Get pending invoices |
| POST | `/api/invoices/create` | Create offline invoice |
| POST | `/api/invoices/sync-pending` | Sync pending to Tally |

### Fonepay
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/fonepay/dashboard` | Get Fonepay dashboard |
| GET | `/api/fonepay/transactions` | Get transactions (with filters) |
| GET | `/api/fonepay/summary` | Get transaction summary |
| POST | `/api/fonepay/sync` | Sync from Fonepay |
| POST | `/api/fonepay/qr/generate` | Generate payment QR |

### Dashboard
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/summary` | Get dashboard summary |
| GET | `/api/daybook` | Get columnar daybook |
| GET | `/api/party-summary` | Get party-wise summary |

### Tally Connection
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tally/status` | Check Tally connection |
| GET | `/api/tally/company` | Get active company info |

---

## Sync System

### Incremental Sync (Regular)
1. Get `lastAlterId` from sync_state
2. Query Tally: `WHERE ALTERID > lastAlterId`
3. Upsert vouchers to database
4. If voucher exists and ALTERID changed → save to history
5. Update `lastAlterId` with max ALTERID from batch

### Full Historical Sync
1. Determine date range (default: 1 year ago to today)
2. Generate date batches (default: 7 days per batch)
3. For each batch:
   - Fetch vouchers from Tally for date range
   - Save to database with ALTERID tracking
   - Track max ALTERID
   - Emit progress via WebSocket
4. Update main sync state with max ALTERID
5. Future syncs use incremental mode

### Auto-Sync Service
- Configurable interval (default: 5 minutes)
- Uses incremental sync
- Broadcasts updates via Socket.IO

---

## WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `sync:started` | Server → Client | Sync started |
| `sync:complete` | Server → Client | Sync completed with stats |
| `sync:error` | Server → Client | Sync error occurred |
| `fullSync:started` | Server → Client | Full history sync started |
| `fullSync:progress` | Server → Client | Progress update |
| `fullSync:completed` | Server → Client | Full sync completed |
| `fullSync:error` | Server → Client | Full sync error |

---

## Configuration

Located in `server/src/config/default.js`:

```javascript
{
  port: 3001,
  tally: {
    host: 'localhost',
    port: 9000
  },
  database: {
    path: './data/dashboard.db'
  },
  sync: {
    interval: 300000,  // 5 minutes
    autoStart: true
  },
  voucherTypes: {
    sales: ['Sales', 'Credit Sales', 'Pending Sales Bill', 'A Pto Bill'],
    receipt: ['Bank Receipt', 'Counter Receipt', 'Receipt', 'Dashboard Receipt']
  }
}
```

---

## Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite (better-sqlite3)
- **Real-time**: Socket.IO
- **Frontend**: React + Vite
- **Tally Integration**: XML-based HTTP API (port 9000)

---

## File Structure

```
server/
├── src/
│   ├── config/
│   │   └── default.js          # Configuration
│   ├── routes/
│   │   └── api.js              # All API endpoints
│   ├── services/
│   │   ├── database.js         # SQLite database service
│   │   ├── syncService.js      # Tally sync service
│   │   ├── tallyConnector.js   # Tally XML API connector
│   │   └── fonepayService.js   # Fonepay integration
│   └── index.js                # Server entry point
├── data/
│   └── dashboard.db            # SQLite database
└── package.json

client/                         # React frontend (Vite)
├── src/
│   ├── pages/
│   │   └── NewDashboard.jsx    # Main dashboard
│   └── ...
└── package.json
```

---

## Key Implementation Details

### Voucher History Tracking
When a voucher is modified (detected by ALTERID change):
1. Save complete snapshot to `voucher_history`
2. Log field-level changes to `voucher_change_log`
3. Update current record in `bills`

### Offline Invoice System
1. User creates invoice when Tally is offline
2. Invoice saved to `pending_invoices` with auto-generated number (DB-YYYYMMDD-NNN)
3. When Tally comes online, pending invoices are synced
4. Status updated to 'synced' on success

### Fonepay Integration
- Scrapes Fonepay merchant portal for transactions
- Stores transaction details including issuer, initiator, PRN
- Supports QR code generation for payment collection

---

## Version History

- **v1.0** - Initial release with basic sync
- **v1.1** - Added ALTERID-based incremental sync
- **v1.2** - Added voucher history tracking
- **v1.3** - Added full historical sync (date-batched)
- **v1.4** - Added Fonepay integration
- **v1.5** - Added offline invoice creation

---

*Last Updated: 2026-02-06*
