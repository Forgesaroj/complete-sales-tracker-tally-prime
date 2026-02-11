# Tally Dashboard - Complete Backend API Reference

> **Total: 151+ endpoints across 20 route modules**
> Base URL: `http://localhost:3001/api`

---

## 1. Dashboard `/api/dashboard`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 1 | GET | `/api/dashboard/summary` | Get today's sales total, pending amount, bill count, etc. |

---

## 2. Bills `/api/bills`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 2 | GET | `/api/bills` | Get all bills (with filters: date, status, type) |
| 3 | GET | `/api/bills/pending` | Get urgent pending bills (ones with UDF payment data) |
| 4 | GET | `/api/bills/pending/all` | Get ALL pending sales bills (both urgent & normal) |
| 5 | GET | `/api/bills/cleared` | Get bills that were paid (moved from pending) |
| 6 | GET | `/api/bills/pending/counts` | Get count of urgent vs normal pending bills |
| 7 | GET | `/api/bills/batch-items` | Get line items for multiple bills at once |
| 8 | GET | `/api/bills/:id` | Get one specific bill by ID |
| 9 | GET | `/api/bills/:id/print-data` | Get bill + items + business info for printing |
| 10 | GET | `/api/bills/:id/items` | Get line items (products) in a bill |
| 11 | PUT | `/api/bills/:id/items` | Replace all items in a pending bill |
| 12 | POST | `/api/bills/:id/items` | Add one new item to a pending bill |
| 13 | PATCH | `/api/bills/:id/dispatch` | Mark a bill as dispatched/not dispatched |

---

## 3. Sacks `/api/sacks`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 14 | POST | `/api/sacks` | Create a new sack (for packing goods) |
| 15 | GET | `/api/sacks` | Get all sacks |
| 16 | GET | `/api/sacks/:id` | Get one sack with its items |
| 17 | POST | `/api/sacks/:id/items` | Add an item to a sack |
| 18 | PATCH | `/api/sacks/:id/status` | Change sack status (packing/ready/dispatched) |

---

## 4. Sync (Tally <-> Dashboard) `/api/sync`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 19 | GET | `/api/sync/status` | Check if sync is running, last sync time |
| 20 | POST | `/api/sync/stop` | Stop auto-sync |
| 21 | POST | `/api/sync/start` | Start auto-sync |
| 22 | POST | `/api/sync/trigger` | Manually sync today's data from Tally |
| 23 | POST | `/api/sync/date-range` | Sync a specific date range from Tally |
| 24 | POST | `/api/sync/masters` | Sync stock items + parties from Tally |
| 25 | POST | `/api/sync/stock` | Sync only stock items from Tally |
| 26 | POST | `/api/sync/parties` | Sync only parties (customers/vendors) from Tally |
| 27 | POST | `/api/sync/deleted` | Find vouchers deleted in Tally |
| 28 | GET | `/api/sync/master-state` | Check when stock/parties were last synced |
| 29 | POST | `/api/sync/reset-stock` | Wipe & re-sync all stock items |
| 30 | POST | `/api/sync/reset-parties` | Wipe & re-sync all parties |
| 31 | GET | `/api/sync/full-history/status` | Check progress of full historical sync |
| 32 | POST | `/api/sync/full-history` | Start syncing ALL historical data from Tally |
| 33 | POST | `/api/sync/full-history/resume` | Resume interrupted historical sync |
| 34 | POST | `/api/sync/full-history/reset` | Reset historical sync state |
| 35 | POST | `/api/sync/full-refresh` | Nuke everything & re-sync from scratch |
| 36 | POST | `/api/sync/clear-all` | Delete all bills & items from database |

---

## 5. Stock Items (Inventory) `/api/stock`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 37 | GET | `/api/stock` | Get all products in inventory |
| 38 | GET | `/api/stock/summary` | Get products with stock balance > 0 |
| 39 | GET | `/api/stock/search` | Search products by name |
| 40 | GET | `/api/stock/tally` | Fetch products directly from Tally (live) |

---

## 6. Ledgers (Parties/Customers) `/api/ledgers`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 41 | GET | `/api/ledgers` | Get all parties |
| 42 | GET | `/api/ledgers/debtors` | Get customers (who owe you money) |
| 43 | GET | `/api/ledgers/creditors` | Get vendors (who you owe money to) |
| 44 | GET | `/api/ledgers/search` | Search parties by name |
| 45 | GET | `/api/ledgers/tally` | Fetch parties directly from Tally (live) |
| 46 | GET | `/api/ledgers/sales` | Get sales ledgers from Tally |
| 47 | GET | `/api/ledgers/agents` | Get sales agents from Tally |

---

## 7. Invoice Creation `/api/invoice`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 48 | POST | `/api/invoice` | Create a full sales invoice (with items) in Tally |
| 49 | POST | `/api/invoice/simple` | Create a simple sales voucher (no items) |
| 50 | GET | `/api/invoice/pending` | Get invoices waiting to sync to Tally |
| 51 | GET | `/api/invoice/pending/count` | Count of pending invoices |
| 52 | GET | `/api/invoice/history` | Get history of invoices created from dashboard |
| 53 | GET | `/api/invoice/summary` | Get invoice summary for a date (synced/pending/failed) |
| 54 | POST | `/api/invoice/pending/sync` | Push all pending invoices to Tally now |
| 55 | POST | `/api/invoice/pending/retry-failed` | Retry invoices that failed to sync |
| 56 | DELETE | `/api/invoice/pending/:id` | Delete a pending invoice |
| 57 | GET | `/api/invoice/godowns` | Get warehouse/godown list from Tally |

---

## 8. Receipts (Payment Collection) `/api/receipt`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 58 | POST | `/api/receipt` | Create a Receipt voucher with 7 payment modes (SFL1-SFL7) |
| 59 | GET | `/api/receipt/voucher-types` | Get dropdown options (Sales, Receipt, etc.) |
| 60 | GET | `/api/receipt/pending-sales-bills` | Get unpaid Pending Sales Bills from Tally |
| 61 | PUT | `/api/receipt/voucher/:masterId/complete-payment` | Complete payment on a pending bill (alter voucher type + SFL fields) |
| 62 | POST | `/api/receipt/pending-sales-bills/:masterId/complete` | Same but edit-only (no deletion) |

---

## 9. Users `/api/users`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 63 | POST | `/api/users/auth/login` | Login with username/password |
| 64 | GET | `/api/users` | Get all users |
| 65 | POST | `/api/users` | Create a new user |
| 66 | PATCH | `/api/users/:id/notifications` | Update notification preferences |
| 67 | GET | `/api/users/notifications` | Get unread notifications |
| 68 | PATCH | `/api/users/notifications/:id/read` | Mark a notification as read |

---

## 10. Fonepay `/api/fonepay`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 69 | GET | `/api/fonepay/dashboard` | Fonepay overview (today's collections, status) |
| 70 | GET | `/api/fonepay/status` | Is Fonepay sync running? |
| 71 | POST | `/api/fonepay/sync` | Manually sync Fonepay transactions |
| 72 | POST | `/api/fonepay/start` | Start Fonepay auto-sync service |
| 73 | POST | `/api/fonepay/stop` | Stop Fonepay auto-sync service |
| 74 | PUT | `/api/fonepay/credentials` | Save Fonepay login credentials |
| 75 | PUT | `/api/fonepay/interval` | Change how often Fonepay syncs |
| 76 | GET | `/api/fonepay/transactions` | Get Fonepay payments (with date filters) |
| 77 | GET | `/api/fonepay/summary` | Total collections, success/fail counts |
| 78 | GET | `/api/fonepay/transactions/today` | Today's Fonepay payments only |
| 79 | GET | `/api/fonepay/settlements` | Bank settlement records |
| 80 | GET | `/api/fonepay/balance` | Latest Fonepay account balance |
| 81 | GET | `/api/fonepay/balance/history` | Balance over time |
| 82 | POST | `/api/fonepay/historical` | Fetch old transactions by date range |
| 83 | POST | `/api/fonepay/qr/generate` | Generate QR code for a payment amount |
| 84 | POST | `/api/fonepay/qr/generate-for-bill` | Generate QR code for a specific bill |
| 85 | POST | `/api/fonepay/link-to-bill` | Link a Fonepay payment to a bill |
| 86 | GET | `/api/fonepay/unlinked` | Get Fonepay payments not matched to any bill |
| 87 | GET | `/api/fonepay/for-bill/:voucherNumber` | Get Fonepay payments for a specific bill |
| 88 | POST | `/api/fonepay/auto-match` | Auto-match Fonepay payment to a bill |

---

## 11. RBB Smart Banking `/api/rbb`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 89 | GET | `/api/rbb/status` | Is RBB scraper running? |
| 90 | POST | `/api/rbb/sync` | Manually scrape bank statement now |
| 91 | GET | `/api/rbb/transactions` | Get bank transactions (with date filters) |
| 92 | GET | `/api/rbb/summary` | Account balance & transaction count |
| 93 | POST | `/api/rbb/start` | Start RBB auto-scraper service |
| 94 | POST | `/api/rbb/stop` | Stop RBB auto-scraper service |

---

## 12. Cheques `/api/cheques`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 95 | POST | `/api/cheques/receipt-activity` | Record cheque received against a bill |
| 96 | PUT | `/api/cheques/receipt-activity/:chequeId/update-date` | Update cheque date & sync to Tally |
| 97 | POST | `/api/cheques/receipt-activity/:chequeId/add-breakdown` | Add another cheque to same bill |
| 98 | GET | `/api/cheques/receipt-activity/pending-dates` | Cheques waiting for date confirmation |
| 99 | POST | `/api/cheques` | Create a new cheque entry |
| 100 | GET | `/api/cheques` | Get all cheques (with filters) |
| 101 | GET | `/api/cheques/pending` | Cheques not yet deposited |
| 102 | GET | `/api/cheques/due-today` | Cheques to deposit today |
| 103 | GET | `/api/cheques/needs-date` | Cheques missing a date |
| 104 | GET | `/api/cheques/unsynced` | Cheques not yet sent to Tally |
| 105 | GET | `/api/cheques/summary` | Count by status (pending/deposited/cleared/bounced) |
| 106 | GET | `/api/cheques/:id` | Get one cheque |
| 107 | PUT | `/api/cheques/:id/confirm-date` | Confirm a cheque's date |
| 108 | PUT | `/api/cheques/:id/status` | Change status (pending -> deposited -> cleared/bounced) |
| 109 | POST | `/api/cheques/sync-pending` | Sync all unsynced cheques to Tally |
| 110 | GET | `/api/cheques/party/:partyName` | All cheques from a specific customer |
| 111 | GET | `/api/cheques/bill/:voucherNumber` | All cheques linked to a specific bill |

---

## 13. Bill Payments `/api/bill-payments`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 112 | POST | `/api/bill-payments` | Record multi-mode payment for a bill |
| 113 | GET | `/api/bill-payments/:voucherNumber` | Get payment details + linked cheques for a bill |
| 114 | GET | `/api/bill-payments/partial` | Get all bills with partial payments |

---

## 14. Tally Connection `/api/tally`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 115 | GET | `/api/tally/status` | Is Tally running and connected? |
| 116 | GET | `/api/tally/companies` | List companies open in Tally |
| 117 | POST | `/api/tally/company` | Switch active company |
| 118 | GET | `/api/tally/voucher-types` | Get all voucher types configured in Tally |

---

## 15. Voucher History (Change Tracking) `/api/voucher-history`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 119 | GET | `/api/voucher-history/stats` | How many changes tracked total |
| 120 | GET | `/api/voucher-history/recent-changes` | Recent field-level changes across all vouchers |
| 121 | GET | `/api/voucher-history/by-alterid/:alterId` | Find voucher by Tally alter ID |
| 122 | GET | `/api/voucher-history` | Get all recent voucher changes |
| 123 | GET | `/api/voucher-history/:masterId/changes` | Field-by-field change log for one voucher |
| 124 | GET | `/api/voucher-history/:masterId` | Full change history for one voucher |

---

## 16. All Vouchers `/api/vouchers`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 125 | GET | `/api/vouchers` | Get all vouchers (any type, with pagination & filters) |
| 126 | GET | `/api/vouchers/types` | List all voucher types with counts |
| 127 | GET | `/api/vouchers/deleted` | Get soft-deleted vouchers |
| 128 | POST | `/api/vouchers/restore/:guid` | Restore a deleted voucher |
| 129 | DELETE | `/api/vouchers/permanent/:guid` | Permanently delete a voucher |

---

## 17. Payments `/api/payments`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 130 | POST | `/api/payments` | Create payment receipt & sync to Tally |
| 131 | GET | `/api/payments` | Get payment history |

---

## 18. Daybook `/api/daybook`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 132 | GET | `/api/daybook` | Get columnar daybook (date & type filters) |
| 133 | GET | `/api/daybook/party-summary` | Party-wise totals for a date range |

---

## 19. Config / Settings `/api/config`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 134 | GET | `/api/config/voucher-types` | Get configured voucher types |
| 135 | GET | `/api/config/bill-statuses` | Get bill status options |
| 136 | GET | `/api/config/settings` | Get all app settings |
| 137 | GET | `/api/config/settings/:key` | Get one specific setting |
| 138 | POST | `/api/config/settings` | Save multiple settings at once |
| 139 | PUT | `/api/config/settings/:key` | Update one specific setting |

---

## 20. Email `/api/email`

| # | Method | Endpoint | Description |
|---|--------|----------|-------------|
| 140 | POST | `/api/email/test-connection` | Test if SMTP server is reachable |
| 141 | POST | `/api/email/test` | Send a test email to verify setup |
| 142 | POST | `/api/email/send-bill` | Email a bill/invoice to a customer |

---

## 21. Legacy Redirect Routes (Backward Compatibility)

These old URLs still work but redirect to their new locations:

| # | Method | Old Endpoint | Redirects To |
|---|--------|--------------|--------------|
| 143 | POST | `/api/auth/login` | `/api/users/auth/login` |
| 144 | GET | `/api/notifications` | `/api/users/notifications` |
| 145 | PATCH | `/api/notifications/:id/read` | `/api/users/notifications/:id/read` |
| 146 | GET | `/api/pending-invoices` | `/api/invoice/pending` |
| 147 | GET | `/api/pending-invoices/count` | `/api/invoice/pending/count` |
| 148 | POST | `/api/pending-invoices/sync` | `/api/invoice/pending/sync` |
| 149 | DELETE | `/api/pending-invoices/:id` | `/api/invoice/pending/:id` |
| 150 | GET | `/api/godowns` | `/api/invoice/godowns` |
| 151 | GET | `/api/voucher-types` | `/api/receipt/voucher-types` |
| 152 | GET | `/api/pending-sales-bills` | `/api/receipt/pending-sales-bills` |
| 153 | POST | `/api/pending-sales-bills/:masterId/complete` | `/api/receipt/pending-sales-bills/:masterId/complete` |
| 154 | PUT | `/api/voucher/:masterId/complete-payment` | `/api/receipt/voucher/:masterId/complete-payment` |
| 155 | POST | `/api/cheque-receipt-activity` | `/api/cheques/receipt-activity` |
| 156 | PUT | `/api/cheque-receipt-activity/:chequeId/update-date` | `/api/cheques/receipt-activity/:chequeId/update-date` |
| 157 | POST | `/api/cheque-receipt-activity/:chequeId/add-breakdown` | `/api/cheques/receipt-activity/:chequeId/add-breakdown` |
| 158 | GET | `/api/cheque-receipt-activity/pending-dates` | `/api/cheques/receipt-activity/pending-dates` |

---

## Summary

| Category | Endpoints | Description |
|----------|-----------|-------------|
| Dashboard | 1 | Sales overview & stats |
| Bills | 12 | Bill CRUD, items, printing, dispatch |
| Sacks | 5 | Packing & dispatch tracking |
| Sync | 18 | Tally data synchronization |
| Stock | 4 | Inventory/product management |
| Ledgers | 7 | Party/customer/vendor management |
| Invoice | 10 | Sales invoice creation & offline queue |
| Receipt | 5 | Payment collection with 7 modes (SFL1-SFL7) |
| Users | 6 | Authentication & notifications |
| Fonepay | 20 | Fonepay payment integration |
| RBB | 6 | RBB Smart Banking integration |
| Cheques | 17 | Cheque tracking & management |
| Bill Payments | 3 | Multi-mode bill payment records |
| Tally | 4 | Tally connection & company management |
| Voucher History | 6 | Change tracking & audit trail |
| Vouchers | 5 | All voucher types CRUD |
| Payments | 2 | Simple payment/receipt records |
| Daybook | 2 | Columnar daybook & party summary |
| Config | 6 | App settings & configuration |
| Email | 3 | SMTP email for bills |
| Legacy Redirects | 16 | Backward compatibility redirects |
| **TOTAL** | **158** | |
