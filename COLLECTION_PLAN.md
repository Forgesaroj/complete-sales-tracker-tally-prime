# Cheque Collection Management System

## Current Process (Paper-Based)

### How it works today:

**Morning - Giving Cheques to Staff:**
1. You have cheques received from customers (pending in your system)
2. You pick 50 cheques to give to your collection staff (e.g., Mini Gurung)
3. You write all 50 cheque details on a **paper copy** — party name, cheque number, cheque amount
4. Staff takes the paper copy + physical cheques and goes to the bank

**Afternoon - Staff Returns from Bank:**
5. Staff successfully deposited/encashed 20 out of 50 cheques
6. Staff writes the **collected cheque details** on the paper — party name, account holder name, cheque amount, cheque number
7. Staff returns the **remaining 30 cheques** physically
8. You now have two papers — one you gave, one staff returned with results

**Evening - Tally Entry (Manual):**
9. You open Tally (ODBC CHq Mgmt company)
10. You manually create a **Receipt Voucher** with:
    - **Debit:** "Cash By MINI Gurung" = Rs 1,54,500 (total collected)
    - **Credit:** Apsara Dallakoti = Rs 28,700
    - **Credit:** Priyanshu Collection = Rs 25,800
    - **Credit:** Nisham Magar = Rs 12,000
    - **Credit:** Dharmaraj Pangeni = Rs 35,000
    - **Credit:** Eleska Fancy Stores = Rs 26,000
    - **Credit:** Narayan Regmi = Rs 27,000
11. You enter bill allocations for each party manually

**Alternative Payments (Due Cheques):**
12. Sometimes a customer pays the cheque amount by **cash** at counter
13. Sometimes by **QR/Fonepay** or **bank transfer** (with screenshot)
14. You create a simple **Counter Receipt** in Tally for these

### Problems with paper-based system:
- Paper gets lost or damaged
- No record of which cheques were given to which staff
- Hard to track who collected how much
- Manual Tally entry is slow and error-prone (typing 6-7 party names + amounts)
- No history — can't check what happened last week/month
- Multiple staff = multiple papers = confusion
- No way to know which cheques are still with staff vs returned

---

## New Digital System — How It Will Help

### One-Time Setup: Add Your Staff

Go to **Cheque Collection > Staff** tab:
```
Add Staff:
  Name: Mini Gurung
  Phone: 9800000000
  Tally Ledger: Cash By MINI Gurung    <-- This is the debit ledger in ODBC company

Add Staff:
  Name: Ram Bahadur
  Phone: 9811111111
  Tally Ledger: Cash By RAM
```
Now your staff members are saved in the system. You can add/remove anytime.

---

### Daily Workflow (Digital):

#### STEP 1: Assign Cheques to Staff (Replaces paper copy)

Go to **Cheque Collection > Assign** tab:

1. **Select staff** from dropdown: "Mini Gurung"
2. System shows all **pending cheques** (not yet assigned to anyone):

```
 ☐ | Party Name                    | Amount   | Cheque #  | Date     | Bank
 ☑ | Apsara Dallakoti 9808829083   | 28,700   | CHQ-001   | Feb 6    | NIC Asia
 ☑ | Priyanshu Collection          | 25,800   | CHQ-002   | Feb 6    | RBB
 ☑ | Nisham Magar Fancy Stores     | 12,000   | CHQ-003   | Feb 7    | NIC Asia
 ☑ | Dharmaraj Pangeni             | 35,000   | CHQ-004   | Feb 7    | NMB
 ☐ | Some Other Customer           | 45,000   | CHQ-005   | Feb 8    | Nabil
 ... (select as many as you want)
```

3. Click **"Select All"** or pick specific cheques
4. Click **"Create Batch & Print"**

**What happens:**
- System creates **Batch #15** — 50 cheques assigned to Mini Gurung
- All 50 cheques change status from "pending" to **"assigned"**
- These cheques **disappear** from the assignable list (can't be given to another staff)
- **Print dialog** opens with a clean assignment slip:

```
╔═══════════════════════════════════════════════════════╗
║              CHEQUE COLLECTION SLIP                   ║
║  Date: 2026-02-12              Batch #: 15            ║
║  Staff: Mini Gurung            Phone: 9800000000      ║
╠════╦══════════════════════════╦═════════╦════════╦════╣
║ #  ║ Party Name               ║ Amount  ║ Chq #  ║Bank║
╠════╬══════════════════════════╬═════════╬════════╬════╣
║  1 ║ Apsara Dallakoti         ║  28,700 ║ CHQ-001║NIC ║
║  2 ║ Priyanshu Collection     ║  25,800 ║ CHQ-002║RBB ║
║  3 ║ Nisham Magar             ║  12,000 ║ CHQ-003║NIC ║
║  4 ║ Dharmaraj Pangeni        ║  35,000 ║ CHQ-004║NMB ║
║ .. ║ ...                      ║  ...    ║ ...    ║... ║
║ 50 ║ Last Customer            ║  20,000 ║ CHQ-050║RBB ║
╠════╩══════════════════════════╩═════════╩════════╩════╣
║  Total: 50 cheques                   Rs 12,50,000     ║
╠═══════════════════════════════════════════════════════╣
║  Staff Signature: ____________  Authorized: _________ ║
╚═══════════════════════════════════════════════════════╝
```

Give this printed slip to Mini with the physical cheques. Now you have a digital record too.

---

#### STEP 2: Record Collection Results (When Staff Returns)

Go to **Cheque Collection > Collect** tab:

1. You see active batches:
```
 Batch #15 | Mini Gurung | Feb 12 | 50 cheques | Rs 12,50,000 | Status: Assigned
 Batch #14 | Ram Bahadur | Feb 11 | 30 cheques | Rs 8,40,000  | Status: Assigned
```

2. Click **Batch #15** to expand:

3. Staff says "I collected 20 cheques". For each cheque, set the status:

```
 Party Name                  | Amount  | Chq #   | Status
 Apsara Dallakoti            | 28,700  | CHQ-001 | [Collected ▼]
 Priyanshu Collection        | 25,800  | CHQ-002 | [Collected ▼]
 Nisham Magar                | 12,000  | CHQ-003 | [Collected ▼]
 Dharmaraj Pangeni           | 35,000  | CHQ-004 | [Returned  ▼]  <-- Bank rejected / not deposited
 Eleska Fancy Stores         | 26,000  | CHQ-005 | [Collected ▼]
 Narayan Regmi               | 27,000  | CHQ-006 | [Collected ▼]
 Customer X                  | 15,000  | CHQ-007 | [Bounced   ▼]  <-- Cheque bounced at bank
 Customer Y                  | 40,000  | CHQ-008 | [Returned  ▼]
 ... (mark all 50)
```

**Quick buttons available:**
- "Mark All Collected" — if staff collected everything
- "Mark Remaining as Returned" — after marking collected ones

**What happens when you set status:**
- **Collected** → Cheque status changes to "deposited" in main cheques table
- **Returned** → Cheque goes back to "pending" (available for next batch/assignment)
- **Bounced** → Cheque marked as "bounced" (needs follow-up with customer)

**Summary shows:**
```
 Collected: 20 cheques  | Rs 1,54,500
 Returned:  28 cheques  | Rs 9,80,500
 Bounced:    2 cheques  | Rs 15,000
```

---

#### STEP 3: Create Receipt in Tally (One Click)

After marking all cheques, click **"Save & Create Receipt"**

**What the system does automatically:**
1. Checks if all party ledgers exist in ODBC CHq Mgmt company
2. Creates missing parties automatically (under Sundry Debtors)
3. Checks if staff ledger "Cash By MINI Gurung" exists
4. Creates it if missing (under Cash-in-Hand group)
5. **Sends Receipt Voucher to Tally:**

```
RECEIPT VOUCHER in "ODBC CHq Mgmt"
Date: 2026-02-12

 DEBIT:  Cash By MINI Gurung          Rs 1,54,500

 CREDIT: Apsara Dallakoti             Rs 28,700   (Bill: CHQ-001, NIC Asia)
 CREDIT: Priyanshu Collection         Rs 25,800   (Bill: CHQ-002, RBB)
 CREDIT: Nisham Magar                 Rs 12,000   (Bill: CHQ-003, NIC Asia)
 CREDIT: Dharmaraj Pangeni            Rs 35,000   (Bill: CHQ-004, NMB)
 CREDIT: Eleska Fancy Stores          Rs 26,000   (Bill: CHQ-005, NIC Asia)
 CREDIT: Narayan Regmi                Rs 27,000   (Bill: CHQ-006, RBB)

 Narration: Collection batch #15 by Mini Gurung - 20 cheques
```

6. Batch marked as **"Completed"** with Tally voucher ID saved

**Before (manual):** Type 7 ledger names + 7 amounts + bill allocations manually = 10-15 minutes
**After (system):** One click = 2 seconds

---

#### STEP 4: View History (Anytime)

Go to **Cheque Collection > History** tab:

```
 Date     | Staff        | Total Chq | Collected | Returned | Bounced | Amount      | Tally
 Feb 12   | Mini Gurung  | 50        | 20        | 28       | 2       | Rs 1,54,500 | Synced
 Feb 11   | Ram Bahadur  | 30        | 25        | 5        | 0       | Rs 7,25,000 | Synced
 Feb 10   | Mini Gurung  | 45        | 40        | 4        | 1       | Rs 3,20,000 | Synced
 Feb 09   | Mini Gurung  | 35        | 35        | 0        | 0       | Rs 2,10,000 | Synced
```

Click any row to see the full cheque list of that batch.

**Benefits:**
- Know exactly which cheques were given to which staff on which date
- Track collection rate per staff (Mini collected 80%, Ram collected 83%)
- See bounced cheques for follow-up
- Tally voucher ID saved — can verify in Tally anytime
- Search by date, staff name, party name

---

## Cheque Status Flow (Complete Lifecycle)

```
CHEQUE RECEIVED FROM CUSTOMER
        |
        v
    [pending]  -----> Customer pays by cash/QR/bank transfer
        |                    |
        v                    v
    [assigned]          Counter Receipt in Tally
    (given to staff)         (existing system handles this)
        |
        +--------+--------+
        |        |        |
        v        v        v
  [collected] [returned] [bounced]
        |        |        |
        v        |        v
  [deposited]    |    Follow-up with customer
  (in Tally)     |
        |        v
        |    Back to [pending]
        |    (available for next batch)
        v
    [cleared]
    (money in bank)
```

---

## What You Get

| Before (Paper) | After (System) |
|----------------|----------------|
| Write 50 cheque details by hand | Select cheques with checkboxes |
| Paper copy can get lost | Digital record saved permanently |
| No idea which cheques are with staff | Real-time status tracking |
| Staff returns, you count manually | Mark status in system, auto-calculate |
| Type 7+ ledger entries in Tally manually | One click → Receipt created in Tally |
| No history after paper is thrown away | Full searchable history |
| Can't track staff performance | Collection rate per staff |
| Bounced cheques forgotten | Bounced cheques tracked for follow-up |
| Multiple staff = confusion | Each batch linked to specific staff |

---

## Technical Implementation

### Files to Create/Modify

| # | File | Action |
|---|------|--------|
| 1 | `backend/src/services/database/database.js` | Add 3 tables + ~15 methods |
| 2 | `backend/src/services/tally/tallyConnector.js` | Add multi-party Receipt creation |
| 3 | `backend/src/routes/collection.js` | **New** — Collection endpoints |
| 4 | `backend/src/routes/index.js` | Register collection route |
| 5 | `frontend/src/utils/api.js` | Add collection API functions |
| 6 | `frontend/src/pages/RushDashboard.jsx` | Add Collection page (4 tabs) |
| 7 | `frontend/src/index.css` | Print slip styles |

### Database Tables

**`collection_staff`** — Staff who collect cheques
```
id | name | phone | tally_ledger_name | active | created_at
```

**`collection_batches`** — A batch of cheques assigned to staff
```
id | staff_id | assigned_date | return_date | total_cheques | total_amount |
collected_amount | returned_count | bounced_count | status | tally_voucher_id | tally_synced
```

**`collection_batch_items`** — Individual cheques in a batch
```
id | batch_id | cheque_id | party_name | amount | cheque_number | cheque_date |
bank_name | status | collect_date | collect_notes | bill_ref
```

### API Endpoints

| Method | Path | What it does |
|--------|------|-------------|
| `GET` | `/collection/staff` | List all staff members |
| `POST` | `/collection/staff` | Add new staff |
| `PUT` | `/collection/staff/:id` | Edit staff |
| `DELETE` | `/collection/staff/:id` | Remove staff |
| `GET` | `/collection/assignable-cheques` | Pending cheques ready to assign |
| `POST` | `/collection/batches` | Create batch (assign cheques to staff) |
| `GET` | `/collection/batches` | List batches (filter by status/staff/date) |
| `GET` | `/collection/batches/:id` | Batch detail with all cheques |
| `GET` | `/collection/batches/:id/print` | Print slip data |
| `PUT` | `/collection/batches/:id/items/:itemId` | Update single cheque status |
| `PUT` | `/collection/batches/:id/bulk-update` | Update multiple cheques at once |
| `POST` | `/collection/batches/:id/complete` | Mark batch as done |
| `POST` | `/collection/batches/:id/create-receipt` | Create Receipt in Tally ODBC |
| `GET` | `/collection/stats` | Collection statistics |

### Tally Receipt Structure

```xml
RECEIPT VOUCHER → ODBC CHq Mgmt company

DEBIT SIDE (1 entry):
  Ledger: "Cash By MINI Gurung" (staff tracking)
  Amount: Total of all collected cheques

CREDIT SIDE (N entries — one per collected party):
  Ledger: "Apsara Dallakoti" → Amount: 28,700 → Bill: "CHQ-001, NIC Asia"
  Ledger: "Priyanshu Collection" → Amount: 25,800 → Bill: "CHQ-002, RBB"
  ... (one entry per collected cheque)
```

### Frontend Page: 4 Tabs

1. **Assign** — Select cheques + pick staff + create batch + print slip
2. **Collect** — Open batch + mark collected/returned/bounced + create Tally receipt
3. **Staff** — Add/edit/remove collection staff members
4. **History** — Past batches with search, filter, expandable details
