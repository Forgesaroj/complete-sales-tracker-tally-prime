# Tally Dashboard - Data Sync Reference

## Currently Synced Data

### Vouchers (Transactions)
| Field | Tally Field | Description |
|-------|-------------|-------------|
| guid | GUID | Unique identifier for voucher |
| masterId | MASTERID | Master record ID |
| alterId | ALTERID | Alteration ID (increments on every change) |
| date | DATE | Voucher date (YYYYMMDD format) |
| voucherType | VOUCHERTYPENAME | Type of voucher |
| voucherNumber | VOUCHERNUMBER | Voucher/Bill number |
| partyName | PARTYLEDGERNAME | Customer/Party name |
| amount | AMOUNT | Transaction amount |
| narration | NARRATION | Notes/description |

### Voucher Types Being Synced

#### Sales Vouchers (configured in server/src/config/default.js)
- Credit Sales
- Pending Sales Bill
- Sales
- A Pto Bill

#### Receipt Vouchers
- Bank Receipt
- Counter Receipt
- Receipt
- Dashboard Receipt

---

## Additional Data That CAN Be Synced (Not Yet Implemented)

### Master Data

#### Ledgers (Parties/Customers)
```
FETCH: NAME, PARENT, ADDRESS, STATENAME, PINCODE, GSTIN, PHONENUMBER, EMAIL, CLOSINGBALANCE, CREDITPERIOD, CREDITLIMIT
```

#### Stock Items (Inventory)
```
FETCH: NAME, PARENT, BASEUNITS, OPENINGBALANCE, CLOSINGBALANCE, HSNCODE, GSTRATE, IGSTRATE, CGSTRATE, SGSTRATE
```

#### Stock Groups
```
FETCH: NAME, PARENT, ISADDABLE
```

#### Units of Measure
```
FETCH: NAME, ORIGINALNAME, ISSIMPLEUNIT, BASEUNITS, ADDITIONALUNITS
```

#### Godowns (Warehouses)
```
FETCH: NAME, PARENT, ADDRESS, HASNOSPACE, ISEXTERNAL, ISINTERNAL
```

#### Cost Centers
```
FETCH: NAME, PARENT, CATEGORY
```

### Transaction Details

#### Inventory Entries (Line Items)
```
FETCH: STOCKITEMNAME, ISDEEMEDPOSITIVE, ACTUALQTY, BILLEDQTY, RATE, AMOUNT, GODOWNNAME, BATCHNAME
```

#### Accounting Entries (Ledger Postings)
```
FETCH: LEDGERNAME, ISDEEMEDPOSITIVE, AMOUNT, BILLALLOCATIONS
```

#### Bill Allocations (Invoice References)
```
FETCH: NAME, BILLTYPE, AMOUNT
```

#### Bank Allocations
```
FETCH: INSTRUMENTDATE, INSTRUMENTNUMBER, BANKNAME, TRANSACTIONTYPE
```

#### Batch Allocations
```
FETCH: BATCHNAME, GODOWNNAME, AMOUNT, ACTUALQTY, BILLEDQTY
```

### Reports That Can Be Exported

#### Day Book
- All transactions for a date range

#### Outstanding Reports
- Receivables (Sundry Debtors)
- Payables (Sundry Creditors)

#### Stock Summary
- Current stock levels by item

#### Sales Register
- Sales transactions with details

#### Purchase Register
- Purchase transactions with details

#### Ledger Reports
- Party-wise transaction history

---

## Sync Methods

### 1. Incremental Sync (ALTERID) - Currently Used
- Fetches only NEW/modified vouchers since last sync
- Lightweight, doesn't overload Tally
- Uses filter: `$ALTERID > lastSyncedAlterId`

### 2. Date Range Sync
- Fetches all vouchers in a date range
- Heavier, use for initial sync or catching up

### 3. Full Sync
- Fetches all data regardless of date
- Very heavy, avoid in production

---

## Filters Applied

| Filter | Purpose |
|--------|---------|
| `$$IsEqual:$IsCancelled:No` | Exclude cancelled vouchers |
| `$$IsEqual:$IsOptional:No` | Exclude optional vouchers |
| `$ALTERID > X` | Incremental sync |

---

## XML Request Format

### Basic Voucher Fetch
```xml
<ENVELOPE>
<HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>VchColl</ID>
</HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
  <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
  <SVFROMDATE>20250101</SVFROMDATE>
  <SVTODATE>20251231</SVTODATE>
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="VchColl" ISMODIFY="No">
  <TYPE>Voucher</TYPE>
  <FETCH>DATE,VOUCHERTYPENAME,VOUCHERNUMBER,PARTYLEDGERNAME,AMOUNT,NARRATION,GUID,MASTERID,ALTERID</FETCH>
  <FILTER>NotCancelled</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="NotCancelled">$$IsEqual:$IsCancelled:No</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>
```

### Ledger Fetch (Sundry Debtors)
```xml
<ENVELOPE>
<HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>LedgerColl</ID>
</HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
  <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="LedgerColl" ISMODIFY="No">
  <TYPE>Ledger</TYPE>
  <CHILDOF>Sundry Debtors</CHILDOF>
  <FETCH>NAME,CLOSINGBALANCE,ADDRESS,STATENAME,GSTIN,PHONENUMBER</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>
```

### Stock Items Fetch
```xml
<ENVELOPE>
<HEADER>
  <VERSION>1</VERSION>
  <TALLYREQUEST>Export</TALLYREQUEST>
  <TYPE>Collection</TYPE>
  <ID>StockColl</ID>
</HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
  <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="StockColl" ISMODIFY="No">
  <TYPE>Stock Item</TYPE>
  <FETCH>NAME,PARENT,BASEUNITS,CLOSINGBALANCE,CLOSINGVALUE,HSNCODE</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>
```

---

## Connection Settings

| Setting | Current Value | Description |
|---------|---------------|-------------|
| TALLY_HOST | 192.168.1.251 | Tally server IP |
| TALLY_PORT | 9900 | XML/ODBC port |
| SYNC_INTERVAL | 30000 | Auto-sync every 30 seconds |
| Request Throttle | 5000ms | Min 5 seconds between requests |
| Timeout | 60000ms | 60 second request timeout |

---

## Performance Tips

1. **Use Incremental Sync** - Only fetches changed data
2. **Exclude Cancelled** - Reduces data volume
3. **Throttle Requests** - Prevents Tally hang
4. **Avoid Peak Hours** - Sync during low-usage times
5. **Date Range Limits** - Don't fetch too much history at once

---

---

## Stock Items (NOW AVAILABLE)

### API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/stock` | Get all stock items |
| `GET /api/stock/summary` | Get items with stock > 0 |
| `GET /api/stock/incremental/:lastAlterId` | Get changed items since lastAlterId |

### Stock Item Fields
| Field | Tally Field | Description |
|-------|-------------|-------------|
| name | NAME | Item name |
| parent | PARENT | Stock group |
| baseUnits | BASEUNITS | Unit of measure (Pcs, Kg, etc.) |
| openingBalance | OPENINGBALANCE | Opening quantity |
| closingBalance | CLOSINGBALANCE | Current stock quantity |
| closingValue | CLOSINGVALUE | Current stock value (Rs) |
| closingRate | CLOSINGRATE | Average rate per unit |
| hsnCode | HSNCODE | HSN/SAC code for GST |
| gstRate | GSTRATE | GST rate % |
| alterId | ALTERID | For incremental sync |

### Example Response
```json
{
  "success": true,
  "count": 150,
  "items": [
    {
      "name": "Cotton Shirt Blue M",
      "parent": "Shirts",
      "baseUnits": "Pcs",
      "openingBalance": 100,
      "closingBalance": 45,
      "closingValue": 22500,
      "closingRate": 500,
      "hsnCode": "6205",
      "gstRate": 12,
      "alterId": 15234
    }
  ]
}
```

---

## Future Enhancements (Can Be Added)

1. **Line Item Sync** - Get individual items in each bill
2. **Party Master Sync** - Sync customer/vendor details
3. ~~**Stock Sync**~~ - ✅ NOW AVAILABLE
4. **Outstanding Sync** - Party-wise balances
5. **GST Reports** - Tax-related data
6. **Bank Reconciliation** - Bank transaction matching
