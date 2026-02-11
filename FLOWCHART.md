# Tally Dashboard - Complete Working Flowchart

> How every button, action, and feature works end-to-end
> Frontend (React) -> Backend (Express) -> Tally Prime / SQLite DB

---

## Architecture Overview

```
Browser (React :5173)
    |
    | axios / fetch / socket.io
    v
Backend (Express :3001)
    |
    |--- SQLite DB (bills, vouchers, items, sacks, cheques, settings)
    |--- Tally Prime (XML API on :9000)
    |--- Fonepay Scraper (Puppeteer -> login.fonepay.com)
    |--- RBB Scraper (Puppeteer -> smartbanking.rbb.com.np)
    |--- Nodemailer (SMTP email)
```

---

## TOPBAR ACTIONS

### Sync Button (Manual Sync)
```
User clicks Sync button
  |
  v
POST /api/sync/trigger
  |
  v
Backend: syncService.syncNow()
  |
  v
Tally XML: Fetch vouchers with ALTERID > lastSyncId
  |
  v
Parse XML -> Insert/Update bills in SQLite
  |
  v
Socket.io emit 'sync:update'
  |
  v
Frontend: fetchData() refreshes dashboard
```

### Tally Status Check (Every 15 seconds)
```
setInterval (15s)
  |
  v
GET /api/tally/status
  |
  v
Backend: tallyConnector.checkConnection()
  |
  v
HTTP POST to Tally :9000 with test XML
  |
  v
Response: { connected: true/false, company: "Company Name" }
  |
  v
Frontend: Shows green/red dot in topbar
```

### Sync Status Check (Every 15 seconds)
```
setInterval (15s)
  |
  v
GET /api/sync/status
  |
  v
Backend: Returns { isRunning, lastSync, interval, voucherCount }
  |
  v
Frontend: Shows sync indicator in topbar
```

---

## DASHBOARD PAGE

### On Page Load
```
User opens Dashboard
  |
  v
fetchData() fires (useEffect on mount)
  |
  v
Promise.all([
  GET /api/dashboard/summary     -> { totalSales, totalReceived, pendingAmount, billCount }
  GET /api/bills?limit=50        -> [ bill objects with items ]
  GET /api/bills/pending/all     -> { bills: [...], counts: { total, critical, normal } }
  GET /api/bills/cleared         -> { bills: [...], count: N }
])
  |
  v
Frontend: Sets summary, bills, pendingBills, clearedBills state
  |
  v
Renders: Stats cards, recent bills list, pending summary
```

### Dashboard Summary Endpoint (Behind the scenes)
```
GET /api/dashboard/summary
  |
  v
Backend: db.getDashboardSummary()
  |
  v
SQLite: SELECT SUM(amount), COUNT(*) FROM bills WHERE date = today
  |
  v
Returns: { totalSales, totalReceived, pendingAmount, billCount, pendingCount }
```

---

## CREATE BILL PAGE

### On Page Load
```
User clicks "Create Bill" in sidebar
  |
  v
fetchCreateBillData() fires
  |
  v
Promise.all([
  GET /api/stock          -> { items: [{ name, rate, unit, group }] }
  GET /api/ledgers/debtors -> { ledgers: [{ name, address, phone }] }
  GET /api/ledgers/agents  -> { agents: [{ name }] }
  GET /api/tally/voucher-types -> { voucherTypes: [{ name }] }
])
  |
  v
Frontend: Populates dropdowns (party, items, agent, voucher type)
```

### Create Bill Button (Submit)
```
User fills form + clicks "Create Bill"
  |
  v
submitNewBill()
  |
  v
POST /api/invoice
Body: {
  partyName: "Customer Name",
  voucherType: "Pending Sales Bill",
  date: "20260209",
  agent: "Agent Name",
  items: [
    { stockItem: "Product 1", qty: 10, rate: 100, amount: 1000, unit: "ps" }
  ],
  narration: "Created from Dashboard"
}
  |
  v
Backend: tallyConnector.createSalesVoucher(data)
  |
  +---> Tally CONNECTED?
  |       |
  |       YES: Build XML -> POST to Tally :9000
  |       |     |
  |       |     v
  |       |   Tally creates voucher -> Returns { success, voucherNumber, masterId }
  |       |     |
  |       |     v
  |       |   Save to SQLite: pending_invoices (status='synced')
  |       |     |
  |       |     v
  |       |   Response: { success: true, voucherNumber: "123" }
  |       |
  |       NO: Save to SQLite: pending_invoices (status='pending')
  |             |
  |             v
  |           Response: { success: true, offline: true, message: "Saved locally" }
  |
  v
Frontend: Toast "Bill created!" -> Navigate to dashboard
```

### Stock Item Search (While typing)
```
User types in item field
  |
  v
Filter from preloaded stockItems array (client-side)
  |
  v
Show autocomplete dropdown with matching items
  |
  v
User selects item -> auto-fills rate, unit
```

---

## COUNTER PAGE

### On Page Load
```
Uses same pendingBills data from fetchData()
  |
  v
Displays pending bills as cards with PAY button
```

### PAY Button
```
User clicks PAY on a pending bill
  |
  v
openPaymentModal(bill)
  |
  v
PaymentModal opens with bill info
  |
  v
(See PAYMENT MODAL FLOW below)
```

---

## PENDING BILLS PAGE

### Pending Tab / Cleared Tab
```
User clicks Pending or Cleared tab
  |
  v
setPendingTab('pending' or 'cleared')
  |
  v
Pending: Shows pendingBills array (from fetchData)
Cleared: Shows clearedBills array (from fetchData)
```

### Items Button (per bill)
```
User clicks Items icon on a bill
  |
  v
openItemsModal(bill)
  |
  v
GET /api/bills/{id}/items
  |
  v
Backend: Check SQLite cache first
  |
  +---> Cache HIT? Return cached items
  |
  +---> Cache MISS?
          |
          v
        tallyConnector.getVoucherDetails(masterId)
          |
          v
        Tally XML: Fetch full voucher with inventory entries
          |
          v
        Parse XML -> Extract STOCKITEMNAME, RATE, ACTUALQTY, AMOUNT
          |
          v
        Cache in SQLite bill_items table
          |
          v
        Return items array
  |
  v
Frontend: Opens Items Modal with product list
```

### Print Button (per bill)
```
User clicks Print icon
  |
  v
printBill(bill)
  |
  v
GET /api/bills/{id}/print-data
  |
  v
Backend: Returns {
  bill: { party_name, voucher_number, date, amount },
  items: [{ stockItem, qty, rate, amount }],
  business: { name, address, phone, pan }
}
  |
  v
Frontend: Opens new window with print-formatted HTML
  |
  v
window.print() auto-triggers browser print dialog
  |
  v
User prints / saves as PDF
```

### Email Button (per bill)
```
User clicks Email icon
  |
  v
Opens email modal (input for recipient email)
  |
  v
User enters email + clicks Send
  |
  v
POST /api/email/send-bill
Body: { billId, toEmail, nepaliDate }
  |
  v
Backend: emailService.sendBillEmail()
  |
  v
1. Fetch bill + items from DB
2. Generate HTML email with bill details
3. nodemailer.sendMail() via SMTP
  |
  v
Response: { success: true }
  |
  v
Frontend: Toast "Email sent!"
```

### PAY Button (per bill)
```
(See PAYMENT MODAL FLOW below)
```

---

## PAYMENT MODAL FLOW (Most Important)

```
User clicks PAY on a Pending Sales Bill
  |
  v
PaymentModal opens showing:
  - Bill info (party, amount, voucher number)
  - 7 payment mode inputs (SFL1-SFL7)
  - Total calculation
  - Full/Partial payment indicator

User enters payment amounts:
  - Cash Teller 1 (SFL1): 5000
  - Q/R Code (SFL4): 2000
  - Total: 7000

User clicks "Complete Payment"
  |
  v
POST /api/receipt/pending-sales-bills/{masterId}/complete
Body: {
  partyName: "Customer",
  amount: 10000,           (bill amount)
  date: "20260209",
  voucherNumber: "PS-001",
  guid: "abc-123-def",
  paymentModes: {
    cashTeller1: 5000,     (SFL1)
    cashTeller2: 0,        (SFL2)
    chequeReceipt: 0,      (SFL3)
    qrCode: 2000,          (SFL4)
    discount: 0,           (SFL5)
    bankDeposit: 0,        (SFL6)
    esewa: 0               (SFL7)
  }
}
  |
  v
Backend: receipts.js route handler
  |
  v
1. Calculate total (7000)
2. Determine voucher type:
   - total >= billAmount? -> "Sales" (fully paid)
   - total < billAmount?  -> "Credit Sales" (partial)
   In this case: 7000 < 10000 -> "Credit Sales"
  |
  v
3. tallyConnector.completePaymentOnBill()
  |
  v
  Try Method 1: ALTER voucher XML
  +---> Build XML to:
  |     - Change voucher type: "Pending Sales Bill" -> "Credit Sales"
  |     - Set UDF fields: SFL1=5000, SFL4=2000
  |     - POST to Tally :9000
  |
  +---> SUCCESS?
  |       |
  |       v
  |     4. _createDashboardReceipt()
  |       |
  |       v
  |     tallyConnector.createReceiptWithPaymentModes()
  |       |
  |       v
  |     Build Receipt XML:
  |       - Voucher Type: "Dashboard Receipt"
  |       - Party: "Customer"
  |       - Debit Entries (payment ledgers with amounts > 0):
  |           Cash Teller 1: Dr 5000
  |           Q/R code:      Dr 2000
  |       - Credit Entry:
  |           Customer:      Cr 7000
  |       |
  |       v
  |     POST to Tally :9000 -> Creates Receipt voucher
  |
  +---> FAILED? Try Method 2 (different XML format)
  +---> FAILED? Try Method 3 (collection-based alter)
  +---> ALL FAILED? Create standalone Receipt only
  |
  v
Response: { success: true, newVoucherType: "Credit Sales", total: 7000 }
  |
  v
Frontend: Shows success checkmark
  |
  v
setTimeout -> onSuccess() -> closes modal -> fetchData() refreshes list
  |
  v
Bill moves from Pending tab to Cleared tab
```

---

## TOTAL VOUCHERS PAGE

### On Page Load
```
User clicks "Total Vouchers" in sidebar
  |
  v
fetchAllVouchers() fires (useEffect when currentPage='vouchers')
  |
  v
Promise.all([
  GET /api/vouchers?limit=2000&dateFrom=X&dateTo=Y&voucherType=Z
  GET /api/vouchers/types
])
  |
  v
Backend (vouchers route):
  db.getAllVouchers(params)
  |
  v
SQLite: SELECT * FROM bills WHERE date BETWEEN ? AND ? ORDER BY date DESC
  |
  v
Returns: [ { voucher_number, party_name, amount, voucher_type, date, ... } ]
  |
  v
Frontend: Renders voucher table with type filter dropdown
```

### Date Filter (Today / Custom / All)
```
User clicks "Today" or picks date range
  |
  v
Sets voucherDateFrom, voucherDateTo state
  |
  v
useEffect triggers fetchAllVouchers()
  |
  v
API called with new date params -> table refreshes
```

---

## ALL BILLS PAGE

### On Page Load
```
Uses bills data from fetchData() (same as dashboard)
  |
  v
GET /api/bills?limit=50&includeItems=true
  |
  v
Backend: db.getBills({ limit: 50, includeItems: true })
  |
  v
SQLite: SELECT * FROM bills ORDER BY voucher_date DESC LIMIT 50
  + JOIN bill_items for each bill
  |
  v
Frontend: Renders bill cards with party, amount, status, items count
```

---

## DELETED VOUCHERS PAGE

### On Page Load
```
User clicks "Deleted Vouchers"
  |
  v
fetchDeletedVouchers()
  |
  v
GET /api/vouchers/deleted?limit=1000
  |
  v
Backend: db.getDeletedVouchers()
  |
  v
SQLite: SELECT * FROM bills WHERE is_deleted = 1
  |
  v
Frontend: Shows deleted vouchers with Restore button
```

### Sync Deleted from Tally Button
```
User clicks "Sync Deleted from Tally"
  |
  v
POST /api/sync/deleted
  |
  v
Backend: tallyConnector.getDeletedVouchers()
  |
  v
Tally XML: Request all vouchers -> Compare with SQLite
  |
  v
Vouchers in DB but NOT in Tally = deleted
  |
  v
Mark as is_deleted=1 in SQLite
  |
  v
Response: { deleted: 5, message: "Found 5 deleted vouchers" }
  |
  v
Frontend: fetchDeletedVouchers() refreshes list
```

### Restore Button (per voucher)
```
User clicks Restore on a deleted voucher
  |
  v
POST /api/vouchers/restore/{guid}
  |
  v
Backend: db.restoreVoucher(guid)
  |
  v
SQLite: UPDATE bills SET is_deleted = 0 WHERE guid = ?
  |
  v
Response: { success: true }
  |
  v
Frontend: Toast "Restored" -> refreshes both deleted & voucher lists
```

---

## DISPATCH PAGE (Kanban Board)

### On Page Load
```
Uses bills data from fetchData()
  |
  v
Bills sorted into 3 columns by dispatch_status:
  - New (no dispatch status)
  - Packing (dispatch_status = 'packing')
  - Ready (dispatch_status = 'ready')
  - Dispatched (dispatch_status = 'dispatched')
```

### Move Bill Between Columns
```
User clicks move button on a bill card
  |
  v
PATCH /api/bills/{id}/dispatch
Body: { status: "packing" | "ready" | "dispatched" }
  |
  v
Backend: db.updateBillDispatch(id, status)
  |
  v
SQLite: UPDATE bills SET dispatch_status = ? WHERE id = ?
  |
  v
Socket.io emit 'dispatch:updated'
  |
  v
Frontend: fetchData() -> bill moves to new column
```

---

## SACKS PAGE

### On Page Load
```
User clicks "Sacks"
  |
  v
fetchSacks()
  |
  v
GET /api/sacks
  |
  v
Backend: db.getAllSacks()
  |
  v
SQLite: SELECT * FROM sacks LEFT JOIN sack_items
  |
  v
Frontend: Shows sack cards with items list & status
```

### Update Sack Status
```
User clicks "All Collected" or "Dispatch Sack"
  |
  v
PATCH /api/sacks/{id}/status
Body: { status: "ready" | "dispatched" }
  |
  v
Backend: db.updateSackStatus(id, status)
  |
  v
SQLite: UPDATE sacks SET status = ? WHERE id = ?
  |
  v
Socket.io emit 'sack:statusChanged'
  |
  v
Frontend: fetchSacks() refreshes
```

---

## DAYBOOK PAGE

### On Page Load
```
User clicks "Daybook"
  |
  v
fetchDaybook() fires
  |
  v
GET /api/daybook?date=2026-02-09
  |
  v
Backend: db.getDaybook({ date })
  |
  v
SQLite: SELECT * FROM bills
  WHERE voucher_date = ?
  ORDER BY voucher_number
  |
  v
Returns columnar data: [ { voucher_number, party_name, type, debit, credit } ]
  |
  v
Frontend: Renders daybook table with Dr/Cr columns
```

### Date Filter
```
User changes date picker
  |
  v
setDaybookDate(newDate)
  |
  v
useEffect triggers fetchDaybook()
  |
  v
API called with new date -> table refreshes
```

---

## PARTIES PAGE

### On Page Load
```
Uses partyList from fetchCreateBillData()
  |
  v
GET /api/ledgers/debtors
  |
  v
Backend: Check SQLite cache -> or fetch from Tally
  |
  v
Tally XML: <STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
  |
  v
Returns: [{ name, parent_group, closing_balance, address, phone }]
  |
  v
Frontend: Searchable party list with balance info
```

---

## FONEPAY PAGE

### On Page Load
```
User clicks "Fonepay"
  |
  v
fetchFonepay()
  |
  v
Promise.all([
  GET /api/fonepay/transactions?limit=10000&fromDate=X&toDate=Y
  GET /api/fonepay/summary
])
  |
  v
Backend (fonepay transactions):
  db.getFonepayTransactions(params)
  |
  v
SQLite: SELECT * FROM fonepay_transactions WHERE date BETWEEN ? AND ?
  |
  v
Backend (fonepay summary):
  db.getFonepaySummary()
  |
  v
SQLite: SELECT COUNT(*), SUM(amount) FROM fonepay_transactions
  |
  v
Frontend: Shows transaction list + summary cards (total, count)
```

### Date Filter (Today / Custom / All)
```
Same pattern as vouchers - sets fonepayDateFrom/To -> useEffect -> fetchFonepay()
```

---

## RBB BANKING PAGE

### On Page Load
```
User clicks "RBB Banking"
  |
  v
Promise.all([
  fetchRBB(),
  fetchRBBStatus()
])
  |
  v
fetchRBB():
  GET /api/rbb/transactions?limit=10000
  GET /api/rbb/summary
  |
  v
SQLite: SELECT * FROM rbb_transactions ORDER BY transaction_date DESC
  |
  v
fetchRBBStatus():
  GET /api/rbb/status
  |
  v
Returns: { isRunning: true/false, status: 'idle'|'syncing'|'waiting' }
  |
  v
Frontend: Shows transactions + service status badge
```

### Start RBB Scraper
```
User clicks Start
  |
  v
POST /api/rbb/start
  |
  v
Backend: rbbService.start()
  |
  v
1. Launch Puppeteer browser (headless: false)
2. Navigate to https://smartbanking.rbb.com.np/#/login
3. Fill username + password using keyboard.type()
4. Wait for OTP (2 min timeout)
5. Navigate to /account
6. Click Statement button
7. Set date range using keyboard.type() (NOT nativeInputValueSetter!)
8. Click Show button
9. Scroll to load lazy content
10. Extract table data
11. Parse transactions -> Save to SQLite
  |
  v
Response: { success: true, status: 'running' }
```

### Stop RBB Scraper
```
User clicks Stop
  |
  v
POST /api/rbb/stop
  |
  v
Backend: rbbService.stop() -> Close Puppeteer browser
  |
  v
Response: { success: true, status: 'idle' }
```

### Manual Sync
```
User clicks Sync
  |
  v
POST /api/rbb/sync
  |
  v
Backend: rbbService.syncNow() -> Scrape latest transactions
  |
  v
Frontend: Wait 3s -> fetchRBB() + fetchRBBStatus()
```

---

## DASHBOARD BILLS PAGE (Bill History)

### On Page Load
```
User clicks "Dashboard Bills"
  |
  v
fetchBillHistory()
  |
  v
Promise.all([
  GET /api/invoice/history?fromDate=X&toDate=X
  GET /api/invoice/summary?date=X
])
  |
  v
Backend (history):
  db.getDashboardBillHistory(params)
  |
  v
SQLite: SELECT * FROM pending_invoices WHERE date = ?
  |
  v
Backend (summary):
  db.getDashboardBillSummary(date)
  |
  v
SQLite: SELECT
  COUNT(*) as total_count,
  SUM(CASE WHEN status='synced') as synced_count,
  SUM(CASE WHEN status='pending') as pending_count,
  SUM(CASE WHEN status='failed') as failed_count
FROM pending_invoices WHERE date = ?
  |
  v
Frontend: Shows bills with status badges (Synced/Pending/Failed) + summary cards
```

### Sync Pending Button
```
User clicks "Sync Pending"
  |
  v
POST /api/invoice/pending/sync
  |
  v
Backend: For each pending invoice:
  tallyConnector.createSalesVoucher(invoice)
  |
  v
  +---> SUCCESS: Update status='synced' in SQLite
  +---> FAILED:  Update status='failed', error message in SQLite
  |
  v
Response: { success: true, synced: 5, failed: 1 }
  |
  v
Frontend: Toast "5 synced, 1 failed" -> fetchPendingInvoices() refreshes
```

### Retry Failed Button
```
User clicks "Retry Failed"
  |
  v
POST /api/invoice/pending/retry-failed
  |
  v
Backend: UPDATE pending_invoices SET status='pending' WHERE status='failed'
  |
  v
Then runs sync again for those invoices
  |
  v
Frontend: fetchPendingInvoices() refreshes
```

---

## SETTINGS PAGE

### On Page Load
```
User clicks "Settings"
  |
  v
fetchAppSettings()
  |
  v
GET /api/config/settings
  |
  v
Backend: db.getAllSettings()
  |
  v
SQLite: SELECT * FROM app_settings
  |
  v
Returns: { settings: { business_name, smtp_host, smtp_port, ... } }
  |
  v
Frontend: Populates settings form fields
```

### Save Settings Button
```
User fills settings + clicks Save
  |
  v
POST /api/config/settings
Body: { settings: { business_name: "My Shop", smtp_host: "smtp.gmail.com", ... } }
  |
  v
Backend: For each key-value pair:
  db.upsertSetting(key, value)
  |
  v
SQLite: INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)
  |
  v
Response: { success: true }
  |
  v
Frontend: Toast "Settings Saved!"
```

### Test Email Connection
```
User clicks "Test Connection" in Email settings
  |
  v
POST /api/email/test-connection
  |
  v
Backend: emailService.testConnection()
  |
  v
1. Read SMTP settings from DB
2. Create nodemailer transporter
3. transporter.verify()
  |
  v
Response: { success: true/false, message: "Connection OK" / error }
  |
  v
Frontend: Toast with result
```

### Send Test Email
```
User enters email + clicks "Send Test"
  |
  v
POST /api/email/test
Body: { toEmail: "user@example.com" }
  |
  v
Backend: emailService.sendTestEmail(toEmail)
  |
  v
nodemailer.sendMail({
  from: settings.smtp_from,
  to: toEmail,
  subject: "Test Email from Tally Dashboard",
  html: "<h1>It works!</h1>"
})
  |
  v
Response: { success: true }
  |
  v
Frontend: Toast "Test email sent!"
```

---

## ITEMS MODAL (Edit Bill Items)

### View Items
```
User clicks Items icon on a bill
  |
  v
GET /api/bills/{id}/items
  |
  v
(See Pending Bills -> Items Button flow above)
  |
  v
Modal opens with editable item rows
```

### Add Item
```
User clicks + Add in items modal
  |
  v
Adds empty row to local editingItems array
  |
  v
User fills: Stock Item (dropdown), Qty, Rate
  |
  v
Amount auto-calculates: qty * rate
```

### Save All Changes to Tally
```
User clicks "Save All Changes to Tally"
  |
  v
PUT /api/bills/{id}/items
Body: { items: [
  { stockItem: "Product A", quantity: 10, rate: 100, amount: 1000, unit: "ps" },
  { stockItem: "Product B", quantity: 5, rate: 200, amount: 1000, unit: "ps" }
]}
  |
  v
Backend: tallyConnector.updatePendingBillItems(masterId, items)
  |
  v
1. Fetch current voucher from Tally (full XML)
2. Build ALTER XML with new inventory entries
3. Keep party, date, narration same
4. Replace all INVENTORYENTRIES.LIST
5. POST to Tally :9000
  |
  v
Tally processes ALTER -> Returns { altered: 1 }
  |
  v
Backend: Update bill_items cache in SQLite
  |
  v
Response: { success: true, message: "Items updated" }
  |
  v
Frontend: Toast "Items saved!" -> refreshes item list
```

---

## SOCKET.IO REAL-TIME EVENTS

```
Backend emits events -> All connected browsers receive instantly

bill:new
  Trigger: New voucher synced from Tally
  Action: Toast notification + fetchData()

payment:created
  Trigger: Payment recorded via PaymentModal
  Action: fetchData() refreshes dashboard

sync:update
  Trigger: Sync cycle completes
  Action: fetchData() + fetchDaybook()

dispatch:updated
  Trigger: Bill moved in dispatch kanban
  Action: fetchData() refreshes

sack:statusChanged
  Trigger: Sack status updated
  Action: fetchSacks() refreshes
```

---

## DATA REFRESH CYCLE

```
                    +---> Every 15s: Check Tally + Sync status
                    |
Initial Load -------+---> fetchData() (dashboard, bills, pending, cleared)
                    |
                    +---> Socket.io listeners for real-time updates

Page Navigation:
  dashboard    -> fetchData()
  create-bill  -> fetchCreateBillData()
  counter      -> (uses fetchData results)
  pending      -> (uses fetchData results)
  vouchers     -> fetchAllVouchers()
  bills        -> (uses fetchData results)
  deleted      -> fetchDeletedVouchers()
  dispatch     -> (uses fetchData results)
  sacks        -> fetchSacks()
  daybook      -> fetchDaybook()
  parties      -> (uses fetchCreateBillData results)
  fonepay      -> fetchFonepay()
  rbb          -> fetchRBB() + fetchRBBStatus()
  bill-history -> fetchBillHistory()
  settings     -> fetchAppSettings()
```

---

## PAYMENT MODES (SFL1-SFL7 UDF Fields)

These 7 fields are stored as User Defined Fields on Tally vouchers:

| Field | Tally UDF | Ledger Name | Description |
|-------|-----------|-------------|-------------|
| cashTeller1 | SFL1 | Cash Teller 1 | Cash register 1 |
| cashTeller2 | SFL2 | Cash Teller 2 | Cash register 2 |
| chequeReceipt | SFL3 | Cheque receipt | Cheque payment |
| qrCode | SFL4 | Q/R code | QR code scan payment |
| discount | SFL5 | Discount | Discount given |
| bankDeposit | SFL6 | Bank Deposit(All) | Direct bank deposit |
| esewa | SFL7 | Esewa | eSewa digital wallet |

When payment is completed:
1. Voucher type changes: Pending Sales Bill -> Sales (full) or Credit Sales (partial)
2. SFL1-SFL7 UDF fields are set with amounts
3. A separate "Dashboard Receipt" voucher is created with ledger entries

---

## DATABASE TABLES (SQLite)

| Table | Purpose |
|-------|---------|
| bills | All synced vouchers from Tally |
| bill_items | Line items (products) for each bill |
| pending_invoices | Locally created invoices waiting to sync |
| sacks | Packing sack records |
| sack_items | Items inside each sack |
| receipts | Payment receipt records |
| cheques | Cheque tracking |
| cheque_breakdowns | Multi-cheque payments |
| bill_payments | Multi-mode payment records |
| fonepay_transactions | Fonepay payment records |
| fonepay_sync_state | Fonepay scraper state |
| rbb_transactions | RBB bank transactions |
| rbb_sync_state | RBB scraper state |
| app_settings | Key-value settings store |
| users | Dashboard user accounts |
| notifications | User notifications |
| sync_state | Tally sync tracking (lastAlterId) |
| voucher_history | Change tracking audit trail |
