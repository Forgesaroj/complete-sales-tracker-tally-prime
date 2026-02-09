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

### Fonepay Bill Linking
When marking QR payment on a bill:
1. Display format: **Company Name | Bill Number | Bill Date**
2. Fonepay transaction gets linked to the bill in database
3. Auto-match finds transaction by amount and date

#### API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/fonepay/qr/generate-for-bill` | Generate QR with bill info (Company\|Bill\|Date) |
| POST | `/api/fonepay/link-to-bill` | Manually link transaction to bill |
| GET | `/api/fonepay/unlinked` | Get unlinked transactions |
| GET | `/api/fonepay/for-bill/:voucherNumber` | Get transactions for a bill |
| POST | `/api/fonepay/auto-match` | Auto-find and link by amount/date |

#### Example: Mark QR Payment on Bill
```json
POST /api/bill-payments
{
  "voucherNumber": "PSB/001",
  "partyName": "Customer XYZ",
  "billAmount": 5000,
  "billDate": "2026-02-06",
  "companyName": "FOR DB",
  "qrAmount": 2000,
  "cashAmount": 3000
}

// Response includes auto-matched Fonepay transaction:
{
  "success": true,
  "payment": { ... },
  "fonepay": {
    "matched": true,
    "transactionId": "TXN123",
    "displayDescription": "FOR DB | PSB/001 | 2026-02-06"
  }
}
```

### Fonepay Integration
- Scrapes Fonepay merchant portal for transactions
- Stores transaction details including issuer, initiator, PRN
- Supports QR code generation for payment collection

---

## Cheque Tracking System

### Overview
Multi-company cheque management system that:
1. Tracks post-dated cheques from dashboard
2. Auto-pushes cheques to Cheque Management Company ("ODBC CHq Mgmt")
3. Supports rush-time entry (confirm cheque date later)
4. Handles mixed payments (cheque + cash + QR per bill)

### Database Tables

| Table | Purpose |
|-------|---------|
| `cheques` | Main cheque records with status tracking |
| `cheque_bill_payments` | Links cheques to bills (many-to-many) |
| `bill_payments` | Multi-mode payment tracking per bill |
| `cheque_date_queue` | Rush-time entries pending date confirmation |

### Cheque Status Flow
```
pending → deposited → cleared
                   ↘ bounced
```

### API Endpoints

#### Cheque Receipt Activity (Main Workflow)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/cheque-receipt-activity` | Enter cheque(s) on a bill |
| PUT | `/api/cheque-receipt-activity/:id/update-date` | Confirm cheque date & sync |
| POST | `/api/cheque-receipt-activity/:id/add-breakdown` | Add breakdown cheque |
| GET | `/api/cheque-receipt-activity/pending-dates` | Get cheques needing date |

#### Cheque Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/cheques` | Create cheque (auto-push to ODBC CHq Mgmt) |
| GET | `/api/cheques` | List cheques with filters |
| GET | `/api/cheques/pending` | Get pending cheques |
| GET | `/api/cheques/due-today` | Get cheques due for deposit |
| GET | `/api/cheques/needs-date` | Get rush-time entries needing date |
| GET | `/api/cheques/unsynced` | Get cheques not synced to Tally |
| GET | `/api/cheques/summary` | Get summary by status |
| GET | `/api/cheques/:id` | Get single cheque |
| PUT | `/api/cheques/:id/confirm-date` | Confirm cheque date |
| PUT | `/api/cheques/:id/status` | Update status (deposited/cleared/bounced) |
| POST | `/api/cheques/sync-pending` | Sync all unsynced to Tally |
| GET | `/api/cheques/party/:name` | Customer cheque summary |
| GET | `/api/cheques/bill/:voucher` | Cheques for a bill |

#### Bill Payments (Multi-Mode)
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/bill-payments` | Create payment with multiple modes |
| GET | `/api/bill-payments/:voucherNumber` | Get payment details |
| GET | `/api/bill-payments/partial` | Get partial payments |

### Multi-Company Setup
- **Main Company**: "FOR DB" (sales, stock, parties)
- **Cheque Company**: "ODBC CHq Mgmt" (cheque tracking via Sales Vouchers)

### Tally Integration Format
Cheques are pushed to ODBC CHq Mgmt as **Sales Vouchers** with **Bill Allocations**:
- **Voucher Type**: Sales
- **Dr Entry**: Party (Sundry Debtor) with Bill Allocation
- **Cr Entry**: Sales Account
- **Reference Number**: Cheque Number
- **Bill Allocation Name**: Cheque Number (used as ref)

```xml
<VOUCHER VCHTYPE="Sales">
  <REFERENCE>ChequeNumber</REFERENCE>
  <ALLLEDGERENTRIES.LIST>
    <LEDGERNAME>PartyName</LEDGERNAME>
    <BILLALLOCATIONS.LIST>
      <NAME>ChequeNumber</NAME>  <!-- Cheque as Ref -->
      <BILLTYPE>New Ref</BILLTYPE>
      <AMOUNT>-Amount</AMOUNT>
    </BILLALLOCATIONS.LIST>
  </ALLLEDGERENTRIES.LIST>
</VOUCHER>
```

When a cheque is created:
1. Saved to local database
2. If party doesn't exist in ODBC CHq Mgmt → created automatically
3. Sales voucher with Bill Allocation created in ODBC CHq Mgmt

### Rush-Time Entry Flow
1. During rush: Enter party, bank, amount only
2. Cheque saved with `cheque_date = NULL`
3. Added to `cheque_date_queue`
4. Later: Confirm date via `/api/cheques/:id/confirm-date`
5. Auto-syncs to Tally after date confirmation

### Cheque Receipt Activity Example

**Scenario**: Customer pays bill with 2 cheques (breakdown)

```bash
# Step 1: Enter cheques during rush time (no date yet)
POST /api/cheque-receipt-activity
{
  "voucherNumber": "PSB/001",
  "partyName": "Ram Traders",
  "billAmount": 50000,
  "cheques": [
    { "bankName": "Nepal Bank", "amount": 30000 },
    { "bankName": "NIC Asia", "amount": 20000 }
  ]
}
# Response: 2 cheques created, 2 need date confirmation

# Step 2: Later, confirm dates
PUT /api/cheque-receipt-activity/1/update-date
{ "chequeDate": "20260215", "chequeNumber": "123456" }
# → Syncs to ODBC CHq Mgmt automatically

PUT /api/cheque-receipt-activity/2/update-date
{ "chequeDate": "20260228", "chequeNumber": "789012" }
# → Syncs to ODBC CHq Mgmt automatically
```

### Mixed Payment Example
One bill paid with:
- Cash: Rs. 5,000
- QR (Fonepay): Rs. 3,000
- Cheque 1 (Bank A, dated Feb 15): Rs. 10,000
- Cheque 2 (Bank B, dated Feb 28): Rs. 7,000

API call to `/api/bill-payments`:
```json
{
  "voucherNumber": "PSB/001",
  "partyName": "Customer XYZ",
  "billAmount": 25000,
  "cashAmount": 5000,
  "qrAmount": 3000,
  "cheques": [
    { "bankName": "Bank A", "amount": 10000, "chequeDate": "20260215" },
    { "bankName": "Bank B", "amount": 7000, "chequeDate": "20260228" }
  ]
}
```

---

## Version History

- **v1.0** - Initial release with basic sync
- **v1.1** - Added ALTERID-based incremental sync
- **v1.2** - Added voucher history tracking
- **v1.3** - Added full historical sync (date-batched)
- **v1.4** - Added Fonepay integration
- **v1.5** - Added offline invoice creation
- **v1.6** - Added cheque tracking with multi-company support

---

*Last Updated: 2026-02-06*
