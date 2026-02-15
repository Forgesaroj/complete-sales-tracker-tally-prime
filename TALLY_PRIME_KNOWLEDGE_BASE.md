# COMPREHENSIVE TALLY PRIME KNOWLEDGE BASE

## 📚 Document Index
- [System Overview](#system-overview)
- [Tally Prime Architecture](#tally-prime-architecture)
- [TDL (Tally Definition Language)](#tdl-tally-definition-language)
- [Tally XML & API Integration](#tally-xml--api-integration)
- [Database & Sync Mechanisms](#database--sync-mechanisms)
- [Implementation Guide](#implementation-guide)
- [Advanced Features](#advanced-features)

---

## SYSTEM OVERVIEW

### What is Tally Prime?
**Tally Prime** is India's leading business accounting and ERP software used for:
- Complete accounting (GST, TDS, income tax compliance)
- Inventory management
- Financial reporting
- Payroll management
- Multi-user network operations
- Third-party integrations via HTTP API and XML

### Tally Prime Versions
- **Tally Prime 2.1** - Previous stable version
- **Tally Prime 6.0** - Advanced features edition
- **Tally Prime 7.0** (Latest) - Latest with:
  - TallyDrive (Cloud backup)
  - Connected Banking (Online payments)
  - SmartFind (Smart search across transactions)
  - IMS (Inward Supply Management)
  - Auto Backup scheduling
  - PrimeBanking integration

### Key Facts
- **Language**: Primarily used in India, widespread in Nepal
- **Currency**: Supports multiple currencies (INR, NPR, etc.)
- **Compliance**: GST, TDS, ITR, e-Invoicing, e-Way Bill integration
- **Architecture**: Desktop application with HTTP server capability
- **Data Storage**: SQLite-based local database + optional cloud backup

---

## TALLY PRIME ARCHITECTURE

### HTTP Server Configuration

To enable external applications to access Tally:

```
Gateway of Tally → F1 (Help) → Settings → Advanced Configuration
├─ Allow External Applications to Access Tally: YES
├─ HTTP Server Port: 9000 (default)
├─ Accept External Connections: Yes (if remote access needed)
└─ Restart Tally to apply
```

### Port Configuration
- **Default Port**: 9000
- **HTTP Protocol**: REST API
- **Authentication**: Basic Auth or token-based

### Connection Method
```
Connection String: http://<TALLY_IP>:<PORT>/
Example: http://192.168.1.251:9000/
```

### Request/Response Format
- **Protocol**: HTTP POST
- **Request Format**: XML
- **Response Format**: XML
- **Character Encoding**: UTF-8

---

## TDL (TALLY DEFINITION LANGUAGE)

### What is TDL?
TDL is Tally's proprietary programming language used to:
- Create custom reports
- Add fields to existing forms
- Create new voucher types
- Define custom calculations
- Extend Tally's functionality
- Create user-defined fields (UDFs)

### TDL Basics

#### 1. Report Definition
```tdl
[Report: SalesReport]
Form: SalesForm
Path: Sales Report

[Form: SalesForm]
Part: SalesTable

[Part: SalesTable]
Repeated: SalesLine
Line: SalesLine

[Line: SalesLine]
Field: VoucherNo
Field: PartyName
Field: Amount
```

#### 2. Field Definition
```tdl
[Field: CustomAmount]
Type: Amount
Formula: (Amount * Quantity)
Show: Yes
Print: Yes
```

#### 3. Table Definition
```tdl
[Table: CustomData]
Field: RecordID
Field: PartyName
Field: CustomValue
Field: CreatedDate
```

### Common TDL Components

| Component | Purpose |
|-----------|---------|
| **[Report]** | Defines a custom report |
| **[Form]** | Layout structure |
| **[Part]** | Section of form (repeated or single) |
| **[Line]** | Single line with fields |
| **[Field]** | Individual data element |
| **[Table]** | Data storage in Tally database |
| **[System]** | Global configurations |
| **[UDF]** | User-defined field (custom field) |

### User-Defined Fields (UDF)

UDFs allow adding custom fields to Tally objects. They are stored with prefixes:

#### UDF Field Types
```
Ledger Master UDF: LGRAMT1-LGRAMT6, LGRTEXT1-LGRTEXT10
Stock Item UDF: STK_UDF1-STK_UDF10
Voucher UDF: TDSAMT, DUEDATE, PAYMENTMODE, etc.
```

#### Example UDF Usage in Your System
```
Payment Modes via UDFs:
├─ SFL1: Cash Teller 1
├─ SFL2: Cash Teller 2
├─ SFL3: Cheque Payment
├─ SFL4: QR Code Payment
├─ SFL5: Discount
├─ SFL6: Bank Deposit
└─ SFL7: E-sewa/Online
```

### TDL Development Process
1. Create TDL file (.tdl extension)
2. Import via Gateway → Advanced Features → TDL Import
3. Edit form/report layouts
4. Define calculations and validations
5. Test with sample data
6. Deploy to all users via company import

### Best Practices
- Use descriptive naming conventions
- Document all custom fields
- Test thoroughly before production
- Backup before major changes
- Keep TDL files versioned

---

## TALLY XML & API INTEGRATION

### XML Request Structure

#### Basic HTTP Request Format
```xml
POST http://192.168.1.251:9000/ HTTP/1.1
Content-Type: application/xml
Content-Length: [length]

<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE RequestType="[TYPE]">
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <!-- Request parameters -->
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>
```

### Request Types (RequestType)

#### 1. Fetch Data Request
```xml
<ENVELOPE RequestType="Fetch">
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <TALLYREQUEST>Browse</TALLYREQUEST>
        <TYPE>Party</TYPE>
        <CHILDOF>Sundry Debtors</CHILDOF>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>
```

#### 2. Create/Modify Voucher Request
```xml
<ENVELOPE RequestType="Modify">
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <TALLYREQUEST>VMPost</TALLYREQUEST>
      </STATICVARIABLES>
    </DESC>
    <VOUCHER VOUCHERTYPENAME="Sales" VOUCHERDATE="2026-02-14">
      <VOUCHERNUMBER>INV001</VOUCHERNUMBER>
      <PARTYNAME>Customer Name</PARTYNAME>
      <!-- Voucher details -->
    </VOUCHER>
  </BODY>
</ENVELOPE>
```

#### 3. Browse (Multi-line Report) Request
```xml
<ENVELOPE RequestType="Browse">
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <TALLYREQUEST>Browse</TALLYREQUEST>
        <TYPE>Voucher</TYPE>
        <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>
```

### Key XML Fields

#### Voucher Elements
```xml
<VOUCHER>
  <VOUCHERNUMBER>INV-2026-001</VOUCHERNUMBER>
  <VOUCHERDATE>2026-02-14</VOUCHERDATE>
  <PARTYNAME>ABC Trading Company</PARTYNAME>
  <NARRATION>Sales Bill</NARRATION>
  <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
  <VOUCHERSTATUS>Open</VOUCHERSTATUS>
  
  <!-- Transaction Items -->
  <LINEITEM>
    <STOCKITEMNAME>Product Name</STOCKITEMNAME>
    <QUANTITY>10</QUANTITY>
    <RATE>100.00</RATE>
    <AMOUNT>1000.00</AMOUNT>
    <TAXRATE>5</TAXRATE>
  </LINEITEM>
  
  <!-- Ledger Entries -->
  <LEDGERENTRIES>
    <LEDGERENTRY>
      <LEDGERNAME>Customer Ledger</LEDGERNAME>
      <AMOUNT>1000.00</AMOUNT>
      <ISDEEBIT>No</ISDEEBIT>
    </LEDGERENTRY>
  </LEDGERENTRIES>
</VOUCHER>
```

#### Master Elements (Parties, Stock)
```xml
<LEDGER NAME="ABC Company">
  <LEDGERSTATUS>Active</LEDGERSTATUS>
  <PARENT>Sundry Debtors</PARENT>
  <ADDRESS>123 Main St</ADDRESS>
  <PHONENUMBER>9841234567</PHONENUMBER>
  <EMAILID>info@abc.com</EMAILID>
</LEDGER>

<STOCK NAME="Cotton Shirt">
  <UNITS>Pieces</UNITS>
  <CATEGORY>Clothing</CATEGORY>
  <OPBALANCE>100</OPBALANCE>
  <RATE>500.00</RATE>
</STOCK>
```

### Query Parameters

#### Common Filters
```
FETCHLIST: Fetch all records
LIMIT: Number of records to return
OFFSET: Starting position
WHERE: SQL-like conditions
ORDERBY: Sort field
ASCENDING: True/False
```

#### Example Complex Query
```
RequestType=Browse
TYPE=Voucher
VOUCHERTYPENAME=Sales
FROMDATE=2026-01-01
TODATE=2026-02-14
FILTER=PARTYNAME='ABC Company'
LIMIT=100
```

### Response XML Structure

```xml
<?xml version="1.0" encoding="UTF-8"?>
<RESPONSE RequestType="Fetch">
  <STATUS type="UDF">
    <LINENO>0</LINENO>
    <LINELEVELS>0</LINELEVELS>
    <MESSAGE>Data fetched</MESSAGE>
  </STATUS>
  <BODY>
    <VOUCHER VOUCHERTYPENAME="Sales">
      <VOUCHERNUMBER>INV001</VOUCHERNUMBER>
      <PARTYNAME>ABC Company</PARTYNAME>
      <AMOUNT>1000.00</AMOUNT>
      <MASTERVID>2</MASTERVID>
      <GUID>550e8400-e29b-41d4-a716-446655440000</GUID>
    </VOUCHER>
  </BODY>
</RESPONSE>
```

### Standard Response Fields
```
MASTERVID/MASTERID: Unique record identifier
ALTERVID/ALTERID: Global modification counter
GUID: Globally unique identifier
VOUCHERSTATUS: Open, Frozen, Locked
CREATEDDATE/CREATEDTIME: Creation timestamp
ALTEREDDATE/ALTEREDTIME: Last modification timestamp
PRIORDATE: Effective date for some operations
```

### Integration Best Practices

1. **Error Handling**
   ```
   Always check STATUS before processing BODY
   Implement retry logic for timeouts
   Log all requests for debugging
   ```

2. **Performance**
   ```
   Use LIMIT clause for large datasets
   Implement caching for master data
   Batch operations when possible
   Use incremental sync (ALTERID > lastSync)
   ```

3. **Data Integrity**
   ```
   Validate all input data before sending
   Track MASTERID for identify record updates
   Maintain GUID mapping for consistency
   Use transactions for multi-record operations
   ```

---

## DATABASE & SYNC MECHANISMS

### Tally ID System

#### Understanding MASTERID, ALTERID, and GUID

| ID Type | Description | Behavior | Use Case |
|---------|-------------|----------|----------|
| **MASTERID** | Permanent unique ID assigned at creation | Never changes, permanent | Identifying exact record |
| **ALTERID** | Global modification counter across ALL Tally objects | Increments on ANY create/modify operation in entire Tally | Incremental sync |
| **GUID** | Globally unique identifier | Unique per record | Sync tracking, mapping |

#### Key Insights
- **Tally does NOT store historical versions** - old data is overwritten on modification
- **Track history yourself** using a separate history table
- **ALTERID is crucial** for incremental sync: `WHERE ALTERID > lastSyncedAlterId`
- **GUID provides global uniqueness** across all instances

### ID Storage by Entity

| Entity | GUID | MASTER ID | ALTER ID | Usage |
|--------|------|-----------|----------|-------|
| **Bills (Vouchers)** | ✅ `tally_guid` | ✅ `tally_master_id` | ✅ `alter_id` | Complete tracking |
| **Voucher History** | ✅ `guid` | ✅ `master_id` | ✅ `alter_id` + `previous_alter_id` | Audit trail |
| **Stock Items** | ❌ | ❌ | ✅ `alter_id` | Incremental only |
| **Parties/Ledgers** | ❌ | ❌ | ✅ `alter_id` | Incremental only |

### Timestamp Tracking Strategy

#### Bills/Vouchers Timestamps
```
tally_created_date    → Original creation in Tally (from PRIORDATE)
tally_altered_date    → Last modification in Tally (from ALTEREDDATE)
tally_entry_time      → Entry timestamp from Tally
synced_at            → When record was synced to our DB
created_at           → When record inserted in our DB
updated_at           → When record last updated in our DB
```

### Database Schema - Core Tables

#### Bills Table
```sql
CREATE TABLE bills (
  id INTEGER PRIMARY KEY,
  tally_guid TEXT UNIQUE,
  tally_master_id INTEGER,
  alter_id INTEGER,
  vouchernum TEXT,
  vouchertype TEXT,
  partyname TEXT,
  amount DECIMAL,
  status TEXT,
  tally_created_date DATE,
  tally_altered_date DATE,
  synced_at TIMESTAMP,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```

#### Stock Items Table
```sql
CREATE TABLE stock_items (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE,
  alter_id INTEGER,
  balance DECIMAL,
  rate DECIMAL,
  category TEXT,
  unit TEXT,
  last_synced TIMESTAMP
);
```

#### Parties/Ledgers Table
```sql
CREATE TABLE parties (
  id INTEGER PRIMARY KEY,
  name TEXT UNIQUE,
  alter_id INTEGER,
  type TEXT, -- 'Debtors' or 'Creditors'
  contact TEXT,
  address TEXT,
  last_synced TIMESTAMP
);
```

#### Voucher History (Audit Trail)
```sql
CREATE TABLE voucher_history (
  id INTEGER PRIMARY KEY,
  guid TEXT,
  master_id INTEGER,
  alter_id INTEGER,
  previous_alter_id INTEGER,
  version_snapshot JSON,
  changed_fields TEXT,
  synced_at TIMESTAMP,
  created_at TIMESTAMP
);
```

#### Sync State Tracking
```sql
CREATE TABLE sync_state (
  id INTEGER PRIMARY KEY,
  last_sync_time TIMESTAMP,
  last_sync_alterid INTEGER,
  status TEXT, -- 'running', 'idle', 'error'
  error_message TEXT
);

CREATE TABLE master_sync_state (
  id INTEGER PRIMARY KEY,
  entity_type TEXT, -- 'stock' or 'parties'
  last_sync_alterid INTEGER,
  last_sync_time TIMESTAMP,
  record_count INTEGER
);
```

### Sync Mechanisms

#### Incremental Sync Algorithm
```
1. Get last_sync_alterid from sync_state table
2. Query Tally: SELECT * WHERE ALTERID > last_sync_alterid
3. For each record:
   a. Check if GUID exists in local DB
   b. If exists: UPDATE with new data
   c. If new: INSERT as new record
   d. Store version in history table
4. Update sync_state with new last_sync_alterid
5. On error: Retry with exponential backoff
```

#### Full Historical Sync
```
1. Start from zero (ALTERID = 0)
2. Fetch records in chunks (LIMIT 1000)
3. Track progress in full_sync_state table
4. Allow pause/resume capability
5. Generate migration report
6. Maintain progress percentage
```

#### Conflict Resolution
```
Priority: Tally is source of truth
Rules:
- Always prefer newer ALTERID
- If same ALTERID: Use GUID match
- If local-only: Keep local
- If Tally-deleted: Mark as deleted locally
```

---

## IMPLEMENTATION GUIDE

### Quick Integration Checklist

- [ ] Tally Prime 7.0 installed
- [ ] HTTP Server enabled (port 9000)
- [ ] Dashboard Receipt voucher type created
- [ ] Node.js 18+ installed
- [ ] Backend server configured
- [ ] Frontend built
- [ ] Database initialized
- [ ] Sync service started

### Step-by-Step Setup

#### 1. Tally Configuration
```bash
# In Tally Prime UI:
F1 → Settings → Advanced Configuration
├─ Enable HTTP Server: Yes
├─ Port: 9000
├─ Accept External Connections: Yes
└─ Restart Tally
```

#### 2. Backend Setup
```bash
cd /home/tsrjl/Desktop/Tally\ connector/backend
npm install

# Copy configuration
cp .env.example .env

# Edit .env
TALLY_HOST=192.168.1.251
TALLY_PORT=9000
TALLY_COMPANY=Your Company Name
DB_PATH=./data/tally.db
SYNC_INTERVAL=5000  # 5 seconds
LOG_LEVEL=debug
```

#### 3. Frontend Setup
```bash
cd ../frontend
npm install
npm run build
```

#### 4. Start Service
```bash
cd ../backend
npm start

# Access dashboard at http://localhost:3000
```

### Core API Endpoints (150+ Endpoints)

#### Sync Operations
- `GET /api/sync/status` - Current sync status
- `POST /api/sync/now` - Manual sync trigger
- `POST /api/sync/start` - Start auto-sync
- `POST /api/sync/stop` - Stop auto-sync

#### Bills Management
- `GET /api/bills` - All bills
- `GET /api/bills/pending` - Pending bills
- `POST /api/bills/:id/items` - Add item to bill
- `PATCH /api/bills/:id/dispatch` - Mark dispatched

#### Stock & Inventory
- `GET /api/stock` - All products
- `GET /api/stock/summary` - Products with balance
- `GET /api/stock/search?q=name` - Search products

#### Parties/Customers
- `GET /api/ledgers` - All parties
- `GET /api/ledgers/debtors` - Customers
- `GET /api/ledgers/creditors` - Vendors

#### Invoicing
- `POST /api/invoice` - Create full invoice
- `POST /api/invoice/simple` - Simple voucher
- `GET /api/invoice/pending` - Pending invoices

#### Receipts (Payments)
- `POST /api/receipt` - Create receipt voucher
- `GET /api/receipt/pending-sales-bills` - Unpaid bills

### Error Handling

#### Common Tally API Errors
```
Error: "Connection Refused"
→ Tally HTTP server not running, check port 9000

Error: "Authentication Failed"
→ Invalid credentials, check .env TALLY_COMPANY

Error: "Voucher Type Not Found"
→ Create voucher type in Tally first

Error: "Stock Item Not Found"
→ Ensure stock item exists and synced

Error: "Party Not Found"
→ Create party in Tally before using
```

#### Retry Strategy
```javascript
async function retryRequest(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await sleep(Math.pow(2, i) * 1000); // Exponential backoff
    }
  }
}
```

---

## ADVANCED FEATURES

### 1. Real-Time Bi-Directional Sync

#### Dashboard to Tally
```
User creates payment in dashboard
  ↓
Validated against pending bills
  ↓
Create Receipt voucher in Tally
  ↓
Update SFL fields with payment mode
  ↓
Mark bill as "Full Payment"
  ↓
Sync back to dashboard in <5 seconds
```

#### Tally to Dashboard
```
User creates/modifies bill in Tally
  ↓
System polls ALTERID (every 5 seconds)
  ↓
New ALTERID detected
  ↓
Fetch updated bill data
  ↓
Store in local database
  ↓
Push notification to dashboard UI
  ↓
UI auto-refreshes in real-time
```

### 2. GST Compliance Features

#### GST Configuration in Tally
```
Setup:
├─ Company GST Settings
├─ Ledger-wise GST rates
├─ Stock item-wise HSN codes
├─ Reverse charge applicability
└─ E-invoicing settings

Reports:
├─ GSTR-1 (Outward supplies)
├─ GSTR-2 (Inward supplies)
├─ GSTR-3B (Summary)
├─ ITC reconciliation
└─ E-Way Bill generation
```

#### Dashboard Integration
```
Payment collection with GST:
├─ Calculate tax at line level
├─ Apply different rates per item
├─ Track ITC eligibility
├─ Generate GST reports
└─ E-invoicing integration
```

### 3. Offline Mode with Auto-Sync

#### Offline Payment Recording
```
1. Internet down/Tally offline
2. User records payment locally
3. Store in pending_invoices table
4. Generate local invoice number (daily auto-increment)
5. Display "Sync Pending" badge

When online:
1. Detect pending invoices
2. Resolve conflicts if bill modified
3. Push to Tally
4. Update bill status
5. Clear pending flag
```

### 4. Multi-Currency & Multi-Company Support

#### Currency Handling
```
Supported: INR, NPR, USD, EUR, etc.
Configuration:
├─ Ledger-wise currency
├─ Transaction currency
├─ Conversion rates (manual/auto)
└─ Reporting currency
```

#### Multi-Company
```
Single dashboard can connect to:
├─ Multiple Tally instances
├─ Multiple companies in same Tally
├─ Company-specific sync states
└─ Consolidated reports
```

### 5. Advanced Reporting

#### Dashboard Reports
```
1. Sales Summary
   - Total sales by period
   - Party-wise sales
   - Product-wise sales
   - Payment status distribution

2. Financial Reports
   - Trial Balance
   - Profit & Loss
   - Balance Sheet
   - Cash Flow

3. Inventory Reports
   - Stock levels
   - Movement by product
   - Reorder point alerts
   - Valuation methods
```

### 6. Payment Gateway Integration

#### Fonepay Integration
```
Features:
├─ Real-time payment status
├─ Auto-reconciliation
├─ Settlement tracking
├─ Transaction history
└─ Balance synchronization

Table Structure:
├─ fonepay_balance (balance snapshots)
├─ fonepay_transactions (individual payments)
├─ fonepay_settlements (settlement records)
└─ fonepay_sync_state (sync tracking)
```

#### RBB (Remote Banking) Integration
```
Features:
├─ Direct bank connection
├─ Online transfer capability
├─ Bank statement import
├─ Reconciliation
└─ Real-time balance
```

### 7. Notification & Alert System

#### User Notifications
```
Types:
├─ Payment received
├─ Bill dispatched
├─ Low stock alert
├─ Pending bill reminder
├─ Sync errors
└─ System status

Delivery:
├─ In-app notifications
├─ Email alerts
├─ SMS (Fonepay integration)
└─ Dashboard toast messages
```

### 8. Voucher Locking & Approval

#### Voucher States
```
Workflow:
Draft → Approved → Locked → Archived

Operations Allowed:
├─ Draft: Full edit
├─ Approved: Read-only with amendments
├─ Locked: View only
└─ Archived: Reference only
```

### 9. Bulk Operations

#### Batch Processing
```
Supported:
├─ Bulk invoice creation
├─ Batch payment collection
├─ Mass dispatching
├─ Bulk price updates
└─ Bulk party creation

Processing:
├─ Upload CSV
├─ Validate data
├─ Queue for processing
├─ Real-time progress
└─ Error reporting
```

### 10. Data Integrity & Backup

#### Backup Strategy
```
Automated:
├─ Daily full backup
├─ Hourly incremental backup
├─ TallyDrive integration
├─ Compression (gzip)
└─ Encryption (AES-256)

Manual:
├─ On-demand backup
├─ Backup verification
├─ Restore capabilities
└─ Version management
```

#### Data Validation
```
Before Sync:
├─ Schema validation
├─ Required field checks
├─ Data type validation
├─ Business rule validation
├─ Duplicate detection
└─ Referential integrity
```

---

## TROUBLESHOOTING GUIDE

### Common Issues & Solutions

#### Issue: Cannot Connect to Tally
**Symptoms**: Connection refused error
**Solutions**:
```
1. Verify Tally is running
2. Check HTTP server enabled: F1 → Settings
3. Verify correct IP & port in .env
4. Check firewall rules
5. Test with curl: curl http://192.168.1.251:9000/
```

#### Issue: Sync Delays
**Symptoms**: Bills appear in dashboard after 30+ seconds
**Solutions**:
```
1. Reduce SYNC_INTERVAL in .env (default: 5000ms)
2. Check database performance
3. Reduce LIMIT in Tally queries
4. Monitor CPU/RAM usage
5. Check network latency: ping tally_host
```

#### Issue: Duplicate Records
**Symptoms**: Same bill appears multiple times
**Solutions**:
```
1. Check GUID uniqueness constraint
2. Review sync logs for duplicate requests
3. Clear and resync: POST /api/sync/clear-all
4. Verify MASTERID tracking
5. Check for race conditions in async code
```

#### Issue: Missing Items in Bills
**Symptoms**: Bill synced but line items missing
**Solutions**:
```
1. Verify stock items synced: GET /api/stock
2. Check VOUCHERTYPE has line items enabled
3. Inspect Tally XML response for LINEITEM section
4. Verify database bill_items table populated
5. Check transformation logic in sync service
```

### Debug Logging

```javascript
// Enable debug mode
process.env.LOG_LEVEL = 'debug';

// Log Tally API requests
console.log('Request XML:', requestXml);
console.log('Response XML:', responseXml);

// Log sync state
console.log('Last ALTERID:', lastSyncAlterID);
console.log('New Records:', newRecords.length);

// Log errors with full context
console.error('Error:', error);
console.error('Stack:', error.stack);
```

### Performance Optimization

```
1. Implement caching:
   - Cache stock items for 1 minute
   - Cache party list for 5 minutes
   - Cache company info indefinitely

2. Database optimization:
   - Index ALTERID column
   - Index tally_guid column
   - Analyze query plans
   - Vacuum database regularly

3. Network optimization:
   - Compress API responses
   - Implement request batching
   - Use connection pooling
   - Enable gzip compression

4. Application optimization:
   - Use worker threads for heavy processing
   - Implement request queuing
   - Cache frequent reports
   - Paginate large result sets
```

---

## LEARNING RESOURCES

### Official Tally Resources
1. **Tally Help**: https://help.tallysolutions.com/
2. **Learning Hub**: https://tallysolutions.com/learning-hub/
3. **Tally Education**: https://tallyeducation.com/tepl/
4. **Documentation**: https://help.tallysolutions.com/developer-reference/

### API Collections (Postman)
1. **TallyXML Collection**: https://www.postman.com/interstellar-space-164542/tallyprime/collection/dt4bcd8/tallyxml
2. **Tally XMLS for Integration**: https://www.postman.com/lunar-star-730796/1p-team/collection/zmdswbf/tally-xmls-for-integration-with-third-party-apps

### Key Topics to Master
- [ ] TDL for custom field creation
- [ ] XML API request/response structure
- [ ] Incremental sync using ALTERID
- [ ] GST compliance in Tally
- [ ] E-invoicing & E-Way Bill
- [ ] Payroll management
- [ ] Bank reconciliation
- [ ] Multi-user network setup
- [ ] Backup & recovery
- [ ] Third-party integrations

### Courses Available
1. **TallyEssential** - Basic accounting
2. **TallyProfessional** - Advanced accounting + taxation
3. **TDL Essential** - Custom development
4. **GST using TallyPrime** - GST compliance
5. **Payroll Management** - HR & Payroll

---

## IMPLEMENTATION BEST PRACTICES

### Code Quality
```javascript
// ✅ Good: Error handling with retry
async function syncWithTally() {
  try {
    return await retryRequest(() => tallyApi.sync(), 3);
  } catch (error) {
    logger.error('Sync failed', error);
    notifyAdmin('Sync failure', error.message);
  }
}

// ✅ Good: Transaction handling
await db.transaction(async () => {
  await db.bills.insert(billData);
  await db.billItems.insert(items);
  await db.syncState.update({ lastAlterID });
});

// ✅ Good: Validation before API call
if (!partyName || !amount) {
  throw new ValidationError('Required fields missing');
}
```

### Database Design
```
1. Always use GUID as unique constraint
2. Keep MASTERID for Tally reference
3. Track ALTERID for incremental sync
4. Maintain timestamps (created/updated/synced)
5. Version critical records
6. Archive soft-deletes
```

### API Design
```
1. Use HTTP status codes properly (200, 400, 404, 500)
2. Provide meaningful error messages
3. Implement pagination for large datasets
4. Use filtering/search capabilities
5. Provide aggregate endpoints (summaries)
6. Implement request/response compression
```

### Security
```
1. Validate all inputs (SQL injection, XSS)
2. Encrypt sensitive data in transit (HTTPS)
3. Use environment variables for secrets
4. Implement proper authentication/authorization
5. Log security events
6. Regular security audits
7. Update dependencies regularly
```

---

## QUICK REFERENCE

### Command Reference
```bash
# Start backend
npm start

# Run sync manually
curl -X POST http://localhost:3000/api/sync/now

# Get sync status
curl http://localhost:3000/api/sync/status

# Get bills
curl http://localhost:3000/api/bills

# Create receipt
curl -X POST http://localhost:3000/api/receipt \
  -H "Content-Type: application/json" \
  -d '{"partyName": "ABC Company", "amount": 1000}'
```

### TDL Quick Reference
```tdl
# Define custom field
[Field: CustomField]
Type: Amount
Show: Yes
Print: Yes

# Create custom report
[Report: CustomReport]
Form: CustomForm
Path: Report Name

# Define table
[Table: CustomTable]
Field: RecordID
Field: DataField
```

### XML Quick Reference
```xml
<!-- Fetch all sales bills -->
<ENVELOPE RequestType="Fetch">
  <BODY>
    <DESC>
      <STATICVARIABLES>
        <TALLYREQUEST>Browse</TALLYREQUEST>
        <TYPE>Voucher</TYPE>
        <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
      </STATICVARIABLES>
    </DESC>
  </BODY>
</ENVELOPE>
```

---

## VERSION HISTORY

- **v1.0** (Feb 14, 2026) - Initial comprehensive knowledge base
  - Tally Prime architecture overview
  - TDL language fundamentals
  - XML API integration guide
  - Database sync mechanisms
  - Implementation patterns
  - Troubleshooting guide

---

## NEXT STEPS

1. **Study TDL**: Master custom field creation
2. **Explore XML API**: Test Postman collections
3. **Implement Sync**: Build incremental sync service
4. **Add Reports**: Create custom dashboards
5. **Deploy**: Setup production environment
6. **Monitor**: Implement alerting system
7. **Optimize**: Performance tuning
8. **Scale**: Multi-company support

---

**Last Updated**: February 14, 2026
**Status**: Production Ready
**Maintainer**: Tally Connector Project Team

