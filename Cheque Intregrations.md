# Cheque Management Company Integration

## Context

**Two Tally Companies:**
- **"For DB"** (Billing) — Sales, credits, cheque receipts
- **"ODBC CHq Mgmt"** (Cheque Company) — Individual cheque tracking via Sales Vouchers + Bill Allocations

**Accounting Flow (For DB):**
1. Customer takes ₹1,00,000 credit → Sales voucher
2. Customer gives 3 cheques (₹10K Feb20, ₹30K Feb28, ₹10K Mar10) → Bank Receipt: `Dr "Cheque Receipt" / Cr Customer`
3. Cheques entered in ODBC → Journal: `Dr "Cheque Management" / Cr "Cheque Receipt"`
4. **Cheque Receipt balance = 0** → All reconciled. **Balance > 0** → Cheques not yet entered in ODBC.

**Cheque Entry Flow (ODBC CHq Mgmt):**
- Sales Voucher with Bill Allocations per cheque (one bill per customer, each allocation = one cheque with bank/date/amount)
- One ₹50,000 bill can have 3 cheque allocations with different dates

**Entry sources:** Both Tally direct AND Dashboard. Need two-way visibility.

---

## What Already Exists

### Database (database.js)
| Table | Purpose | Lines |
|-------|---------|-------|
| `cheques` | Individual cheque records (number, bank, amount, date, status, sync) | 685-706 |
| `cheque_bill_payments` | Links cheques to bills (many-to-many) | 711-720 |
| `bill_payments` | Multi-mode payment tracking per bill | 724-743 |
| `cheque_date_queue` | Rush-time entries pending date confirmation | 747-758 |

**DB Methods:** `createCheque` (3304), `confirmChequeDate` (3341), `getCheques` (3392), `getChequesByStatus` (3430), `getPendingCheques` (3439), `getChequesDueForDeposit` (3446), `updateChequeStatus` (3460), `markChequeSynced` (3487), `getUnsyncedCheques` (3501), `linkChequeToBill` (3513), `getChequesSummary` (3652), `getCustomerChequeSummary` (3666) — **No changes needed**

### Routes (cheques.js) — 17 endpoints exist
Key: `POST /receipt-activity` (24), `GET /summary` (517), `PUT /:id/status` (640), `POST /sync-pending` (690) — **New endpoints insert before `/:id` at line 547**

### TallyConnector (tallyConnector.js) — Push only, no PULL
Existing: `pushChequeToCompany` (2280), `createChequeReceipt` (2023), `createPDCEntry` (2105), `getLedgersFromCompany` (2176), `partyExistsInCompany` (2216) — **Need new PULL methods**

### Frontend — NO cheque page exists
Only: `chequeReceipt` field in payment modal (SFL3), cheque column in columnar. **No API functions, no page.**

---

## Files to Modify

| # | File | What |
|---|------|------|
| 1 | `backend/src/services/tally/tallyConnector.js` | +3 methods: fetch ledger balance, fetch ODBC cheques |
| 2 | `backend/src/routes/cheques.js` | +3 reconciliation endpoints (before `:id` route) |
| 3 | `frontend/src/utils/api.js` | +13 cheque API functions |
| 4 | `frontend/src/pages/RushDashboard.jsx` | +Cheque page (nav, state, fetch, 4-tab UI) |

---

## Step 1: tallyConnector.js — New Methods

### 1a. `getLedgerBalance(ledgerName, targetCompany)`
Insert after `getLedgersFromCompany` (line ~2211)

Fetches CLOSINGBALANCE for ONE specific ledger. Reuses `getLedgersFromCompany` XML pattern but adds TDL filter:
```xml
<COLLECTION NAME="LedgerBal" ISMODIFY="No">
  <TYPE>Ledger</TYPE>
  <FETCH>NAME,PARENT,CLOSINGBALANCE,OPENINGBALANCE</FETCH>
  <FILTER>MatchName</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="MatchName">$$IsEqual:$NAME:"Cheque Receipt"</SYSTEM>
```
With `<SVCURRENTCOMPANY>For DB</SVCURRENTCOMPANY>`.
Returns: `{ name, parent, closingBalance, openingBalance }`

### 1b. `getChequeReconBalances(billingCompany = 'For DB')`
Calls `getLedgerBalance` for both "Cheque Receipt" and "Cheque Management" ledgers.
Returns:
```js
{
  chequeReceipt: { name, balance },    // Balance > 0 = cheques NOT entered in ODBC
  chequeManagement: { name, balance }, // Should match if reconciled
  mismatch: Math.abs(receipt - management),
  isReconciled: mismatch < 0.01
}
```

### 1c. `getODBCCheques(targetCompany = 'ODBC CHq Mgmt')`
Fetches ALL Sales Vouchers from ODBC company. Uses `getVouchers` XML pattern (line 168) with `SVCURRENTCOMPANY`. Also fetches `BILLALLOCATIONS.LIST` nested inside `ALLLEDGERENTRIES.LIST`.

```xml
<COLLECTION NAME="ODBCVch" ISMODIFY="No">
  <TYPE>Voucher</TYPE>
  <FETCH>DATE,VOUCHERTYPENAME,VOUCHERNUMBER,PARTYLEDGERNAME,AMOUNT,NARRATION,MASTERID,ALTERID,ALLLEDGERENTRIES.LIST</FETCH>
</COLLECTION>
```
With `<SVCURRENTCOMPANY>ODBC CHq Mgmt</SVCURRENTCOMPANY>`.

**Parsing:** For each Sales Voucher:
- Party name = `PARTYLEDGERNAME`
- For each `ALLLEDGERENTRIES.LIST` where `ISDEEMEDPOSITIVE = 'Yes'` (debit = bank side):
  - Bank name = `LEDGERNAME`
  - Parse `BILLALLOCATIONS.LIST` inside the ledger entry:
    - Each allocation = one cheque: `{ billName, amount, billDate }`
  - Parse `BANKALLOCATIONS.LIST` if present for cheque number/date

Returns flat array:
```js
[{
  partyName, voucherNumber, voucherDate, amount,
  bankName, chequeNumber, chequeDate,
  billAllocations: [{ billName, amount, billDate }],
  masterId, alterId
}]
```

---

## Step 2: cheques.js — New Endpoints

**Insert at line 547** (after `/summary`, before `/:id`). This ordering is critical because Express matches `/:id` greedily.

### `GET /api/cheques/reconciliation`
Main endpoint. Returns everything the dashboard needs:
```js
router.get('/reconciliation', async (req, res) => {
  // 1. Check Tally connection
  // 2. If connected: getChequeReconBalances('For DB')
  // 3. If connected: getODBCCheques('ODBC CHq Mgmt')
  // 4. Always: db.getCheques({}) for local cheques
  // 5. Always: db.getChequesSummary() for status counts
  // 6. Merge local + ODBC cheques (match by party+amount+date)

  res.json({
    tallyConnected,
    reconciliation: { chequeReceipt, chequeManagement, mismatch, isReconciled },
    odbcCheques: [...],       // From Tally ODBC company
    localCheques: [...],      // From SQLite
    summary: { pending, deposited, cleared, bounced },
    merged: [...]             // Combined with source indicator
  });
});
```

### `GET /api/cheques/reconciliation/balances`
Lightweight — only fetches "Cheque Receipt" and "Cheque Management" balances from For DB.

### `GET /api/cheques/reconciliation/odbc-cheques`
Only fetches cheques from ODBC company. Accepts `?fromDate=&toDate=` for filtering.

### Merge Helper Function
```js
function mergeCheques(localCheques, odbcCheques) {
  // Match local -> ODBC by party_name + amount + cheque_date
  // Return: [...localWithSyncFlag, ...odbcOnlyEntries]
  // Each entry gets: source ('local'|'odbc'|'both'), matchedInODBC, matchedInLocal
}
```

---

## Step 3: api.js — Frontend API Functions

Add after existing exports (currently zero cheque functions):

```js
// Cheque Reconciliation
export const getChequeReconciliation = () => api.get('/cheques/reconciliation', { timeout: 30000 });
export const getChequeReconBalances = () => api.get('/cheques/reconciliation/balances', { timeout: 15000 });
export const getODBCCheques = (params) => api.get('/cheques/reconciliation/odbc-cheques', { params, timeout: 30000 });

// Cheque CRUD
export const getCheques = (params) => api.get('/cheques', { params });
export const getChequeSummary = () => api.get('/cheques/summary');
export const getPendingCheques = () => api.get('/cheques/pending');
export const getChequesDueToday = () => api.get('/cheques/due-today');
export const getChequesNeedingDate = () => api.get('/cheques/needs-date');
export const getUnsyncedCheques = () => api.get('/cheques/unsynced');
export const updateChequeStatus = (id, data) => api.put(`/cheques/${id}/status`, data);
export const confirmChequeDate = (id, data) => api.put(`/cheques/${id}/confirm-date`, data);
export const getPartyCheques = (name) => api.get(`/cheques/party/${encodeURIComponent(name)}`);
export const syncPendingCheques = () => api.post('/cheques/sync-pending', {}, { timeout: 60000 });
```

---

## Step 4: RushDashboard.jsx — Cheque Page

### 4a. Add to PAGE_TITLES
```js
'cheques': 'Cheque Management'
```

### 4b. State Variables (near columnar state ~line 440)
```js
const [chequeRecon, setChequeRecon] = useState(null);
const [chequesList, setChequesList] = useState([]);
const [chequeODBC, setChequeODBC] = useState([]);
const [chequeSummary, setChequeSummary] = useState(null);
const [chequeTab, setChequeTab] = useState('recon');
const [chequeLoading, setChequeLoading] = useState(false);
const [chequeSyncing, setChequeSyncing] = useState(false);
const [chequeSearch, setChequeSearch] = useState('');
const [chequeStatusFilter, setChequeStatusFilter] = useState('');
const [chequeExpandedParty, setChequeExpandedParty] = useState(null);
```

### 4c. Fetch Function
```js
const fetchChequeRecon = async () => {
  setChequeLoading(true);
  try {
    const res = await getChequeReconciliation();
    setChequeRecon(res.data.reconciliation);
    setChequesList(res.data.merged || []);
    setChequeODBC(res.data.odbcCheques || []);
    setChequeSummary(res.data.summary);
  } catch (e) { console.error(e); }
  setChequeLoading(false);
};
```

### 4d. goToPage hook
```js
if (page === 'cheques') fetchChequeRecon();
```

### 4e. Sidebar Nav Item (in Finance/Reports section)
```jsx
<div className={`nav-item ${currentPage === 'cheques' ? 'active' : ''}`}
  onClick={() => goToPage('cheques')}>
  <span className="nav-icon">📝</span> Cheques
</div>
```

### 4f. Page Layout

#### Reconciliation Cards (top row)
```
+----------------+ +----------------+ +----------------+ +----------------+ +----------------+ +----------------+
| Cheque Receipt | | Cheque Mgmt    | |   Mismatch     | | Total Cheques  | |   Pending      | |   Cleared      |
|  Rs 45,000     | |  Rs 35,000     | |  Rs 10,000     | |      12        | |      5         | |      7         |
|  (For DB)      | |  (For DB)      | |  Not Recon     | |  Local + ODBC  | |  Rs 1,50,000   | |  Rs 2,00,000   |
|  Red if > 0    | |                | |  Orange/Green  | |                | |  Amber         | |  Green         |
+----------------+ +----------------+ +----------------+ +----------------+ +----------------+ +----------------+
```
- **Cheque Receipt > 0** = Cheques received from customers but NOT yet entered in ODBC
- **Mismatch = 0** = Green "Reconciled" badge
- **Tally disconnected** = Cards show "Offline" with local-only data

#### Tab Bar
```
[ Recon ] [ All Cheques ] [ Pending ] [ By Party ]
```

#### Tab 1: Recon (merged list)
Table columns: `# | Party | Bank | Amount | Cheque # | Cheque Date | Source | Synced | Status`

| Source | Badge | Meaning |
|--------|-------|---------|
| Local + ODBC | Green "Both" | Dashboard entry synced to Tally |
| Local only | Orange "Local" | Not yet in ODBC (needs sync) |
| ODBC only | Blue "Tally" | Entered directly in Tally |

Searchable, sortable headers (same pattern as audit trail table).

#### Tab 2: All Cheques (local DB)
- Status filter: All / Pending / Deposited / Cleared / Bounced
- Search by party name
- Columns: `# | Party | Bank | Amount | Cheque # | Cheque Date | Received | Status | Synced | Actions`
- Actions: dropdown to change status (pending -> deposited -> cleared/bounced)
- Rows color-coded by status

#### Tab 3: Pending
- Only `status = 'pending'` cheques
- Cheques due today highlighted in amber
- "Mark Deposited" button per row
- Rush-time entries (no date) shown with "Needs Date" warning badge
- "Sync All to Tally" button at top

#### Tab 4: By Party
- Grouped by party_name with expandable rows
- Summary per party: Total cheques | Pending amt | Cleared amt | Bounced amt
- Click to expand -> shows individual cheques for that party
- Shows customer's credit balance from billing company alongside

---

## Data Flow Diagram

```
                    +-------------------+
                    |    TALLY ERP      |
                    |                   |
    +---------------+   "For DB"       |
    | PULL balances |  - Cheque Rcpt   |<-- Customer gives cheque
    |               |  - Cheque Mgmt   |<-- Journal to transfer to ODBC
    |               +-------------------+
    |               +-------------------+
    | PULL cheques  | "ODBC CHq Mgmt"  |
    |<--------------+  - Sales Vch     |<-- Cheque details + Bill Allocations
    |               |  - Bill Allocs   |    (bank, date, number per cheque)
    |  PUSH cheques |                  |
    |-------------->|                  |<-- Dashboard also pushes here
    |               +-------------------+
    |
    v
+-------------------------------------+
|         Dashboard Backend            |
|                                      |
|  SQLite: cheques table               |
|  - Local cheque records              |
|  - Status tracking lifecycle         |
|  - Sync status flag                  |
|                                      |
|  API: /cheques/reconciliation        |
|  - Merge local + ODBC cheques        |
|  - Compare Rcpt vs Mgmt balance      |
+-----------------+--------------------+
                  |
                  v
+-------------------------------------+
|       Dashboard Frontend             |
|                                      |
|  Cheque Page:                        |
|  - Reconciliation cards              |
|  - Merged cheque list                |
|  - Status management                 |
|  - Per-party grouping                |
+--------------------------------------+
```

---

## Cheque Lifecycle

```
Customer gives cheque(s)
    |
    +-- From Dashboard --> SQLite cheques table --> pushChequeToCompany() --> ODBC CHq Mgmt
    |                          status: 'pending'     (auto or manual sync)
    |
    +-- Direct in Tally --> ODBC CHq Mgmt (Sales Voucher + Bill Allocations)
                               |
                               +-> PULLED by getODBCCheques() into dashboard

Cheque Lifecycle (local tracking):
  pending --> deposited --> cleared (success)
                      +--> bounced (with reason)
```

---

## Verification

1. `cd backend && node src/index.js` -- backend starts without errors
2. `cd frontend && npm run build` -- builds clean
3. Open dashboard -> Click "Cheques" in sidebar -> page loads
4. **With Tally connected:**
   - Reconciliation cards show Cheque Receipt & Cheque Management balances from "For DB"
   - If Cheque Receipt balance > 0 -> mismatch card shows orange amount
   - ODBC cheques list populated from "ODBC CHq Mgmt" Sales Vouchers
   - Merged tab shows both Local and ODBC cheques with sync status
5. **With Tally disconnected:**
   - Cards show "Tally Offline"
   - Local cheques still display from SQLite
6. Status changes work: pending -> deposited -> cleared/bounced
7. "Sync to Tally" button pushes unsynced local cheques to ODBC
8. Party tab groups cheques correctly, expandable rows show individual cheques
9. Multiple cheques per bill display correctly (e.g., Rs 10K + Rs 30K + Rs 10K for one Rs 50K bill)



