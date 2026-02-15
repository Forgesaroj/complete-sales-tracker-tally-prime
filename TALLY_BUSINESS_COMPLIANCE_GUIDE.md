# TALLY PRIME - BUSINESS FEATURES & COMPLIANCE GUIDE

## COMPREHENSIVE BUSINESS SOLUTIONS

---

## 1. GST (GOODS AND SERVICES TAX) MANAGEMENT

### GST Configuration in Tally Prime

#### Step-by-Step Setup
```
Gateway of Tally → Create → Company
  ├─ Company Information
  ├─ Registration Details
  │  ├─ GST Registration: Yes
  │  ├─ GSTIN: 18AABCU9603R1Z0
  │  ├─ HSN Code Applicability: Yes
  │  └─ Supply Type: Intra-State/Inter-State
  │
  ├─ Tax Settings
  │  ├─ Tax Ledgers Creation
  │  │  ├─ Input SGST 5% (Under Input Tax Credit)
  │  │  ├─ Input CGST 5%
  │  │  ├─ Input IGST 5%
  │  │  ├─ Output SGST 5% (Under Tax Payable)
  │  │  ├─ Output CGST 5%
  │  │  └─ Output IGST 5%
  │  │
  │  ├─ Tax Rate Configuration
  │  │  ├─ 5% (Clothing, Books)
  │  │  ├─ 12% (Electronics, Furniture)
  │  │  ├─ 18% (General goods, Services)
  │  │  └─ 28% (Luxury items)
  │  │
  │  └─ Reverse Charge Settings
  │     ├─ Threshold Limit: ₹5,00,000
  │     └─ Applicable Services
  │
  └─ E-Invoicing Settings
     ├─ IRN Generation: Automatic
     ├─ API Credentials
     └─ Reporting Settings
```

### Ledger-Wise GST Configuration

```
Gateway → Create → Ledger

For Sales Ledger (Party):
├─ Ledger Name: ABC Trading Company
├─ Parent: Sundry Debtors
├─ Applicable Ledger: ABC Trading Company
├─ Ledger Type: Sales
│
├─ GST Details
│  ├─ GSTIN: 18XYZAB1234C1Z5
│  ├─ State: Karnataka
│  ├─ GST Type: Regular/Composition/Unregistered
│  ├─ Supply Type: Intra-State/Inter-State
│  └─ Tax Rate: 5%/12%/18%/28%
│
└─ Tax Application
   ├─ Apply on Amount: After discount
   ├─ Method: Automatic/Manual
   └─ Reverse Charge: Yes/No

For Purchase Ledger (Vendor):
├─ Same structure as Sales
├─ But Parent: Sundry Creditors
└─ Track Reverse Charge eligible supplies
```

### Stock Item GST Configuration

```
Gateway → Create → Stock Item

For Each Product:
├─ Stock Item Name: Cotton Shirt
├─ Category: Clothing
├─ Unit: Pieces
│
├─ GST Details
│  ├─ HSN Code: 6204
│  ├─ SAC Code: (if service)
│  ├─ Tax Rate: 5%
│  ├─ ITC Eligibility: Yes/No
│  └─ Exemption: No/Nil-Rated/Exempt
│
├─ Pricing
│  ├─ Rate (Excluding Tax): ₹300
│  ├─ Tax Amount: ₹15
│  └─ Rate (Including Tax): ₹315
│
└─ Godown Configuration
   ├─ Godown 1: Primary Warehouse
   ├─ Godown 2: Secondary Warehouse
   └─ Opening Balance per godown
```

### HSN/SAC Code Classification

```
HSN CODE STRUCTURE (12 digits):

62    → Articles of Apparel
├─ 6204 → Women's or Girls' Suits, Ensembles, Trousers
├─ 6205 → Men's or Boys' Shirts
├─ 6206 → Women's or Girls' Blouses
└─ 6207 → Men's or Boys' Singlets, Undershirts

84    → Nuclear Reactors, Boilers, Machinery
83    → Articles of Iron or Steel
...

SAC CODE STRUCTURE (6 digits) - For Services:

998    → Services
├─ 9988 → Telecommunications Services
├─ 9989 → Broadcasting and Other Related Services
└─ 9990 → Professional Services (Consulting, Legal, etc.)
```

### GST Journal Entries

#### Intra-State Sales (5% Tax)

```
Voucher Type: Sales
Ledger Entries:

Dr. Sundry Debtors (ABC Company)    ₹525
    Cr. Sales                        ₹500
    Cr. Output SGST 5%               ₹25
```

#### Inter-State Sales (5% Tax)

```
Voucher Type: Sales
Ledger Entries:

Dr. Sundry Debtors (Party in Mumbai)  ₹525
    Cr. Sales                         ₹500
    Cr. Output IGST 5%                ₹25
```

#### Purchase with ITC

```
Voucher Type: Purchase
Ledger Entries:

Dr. Purchases                     ₹500
Dr. Input SGST 5% (Eligible)      ₹25
    Cr. Sundry Creditors          ₹525
```

#### Reverse Charge Supplies

```
Voucher Type: Purchase (Reverse Charge)
Ledger Entries:

Dr. Purchases                     ₹500
Dr. Input SGST 5% (Reverse Charge) ₹25
    Cr. Liability (RCM Payable)   ₹525

Later when paid:
Dr. Liability (RCM Payable)       ₹525
    Cr. Bank                      ₹525
```

### GST Return Filing (GSTR)

#### GSTR-1 (Outward Supplies)

```
Reports → GST → GSTR-1

Contains:
├─ B2B Sales
│  ├─ Party GSTIN
│  ├─ Invoice Number & Date
│  ├─ Invoice Amount
│  ├─ HSN Code
│  └─ Tax Details (SGST, CGST, IGST)
│
├─ B2C Sales
│  └─ Consolidated by GSTIN
│
├─ Exports
│  └─ Marked as Zero-Rated
│
└─ Amendments
   └─ All modifications tracked

Tally Feature: Auto-calculation with SAC mapping
Period: Monthly (Due by 11th next month)
```

#### GSTR-2 (Inward Supplies)

```
Reports → GST → GSTR-2

Contains:
├─ B2B Purchases
│  ├─ Vendor GSTIN
│  ├─ Invoice References
│  ├─ HSN/SAC Codes
│  └─ Tax Amounts
│
├─ Imports
├─ Non-Taxable Purchases
└─ Amendments

Matching: Compare with vendor's GSTR-1
```

#### GSTR-3B (Summary & ITC Claim)

```
Reports → GST → GSTR-3B

Contains:
├─ Summary of Outward Supplies
│  ├─ B2B Supplies Value
│  ├─ B2C Supplies Value
│  ├─ Exports
│  └─ Total Tax Payable
│
├─ Inward Supplies (ITC Claim)
│  ├─ ITC on Inputs
│  ├─ ITC on Capital Goods
│  ├─ ITC on Services
│  └─ Total ITC Claimed
│
└─ Tax Payable
   └─ Output Tax - Input Tax = Payable Amount

Due: 20th of following month
```

#### GSTR-9 (Annual Return)

```
Reports → GST → GSTR-9

Contains:
├─ Annual Summary
├─ Details of Supplies
├─ Details of ITC
├─ Reconciliation
└─ Certification

Due: Last day of year
```

### E-Invoicing Integration

#### E-Invoice Requirements

```
Government Portal: https://einvoice1.gst.gov.in

Required Details:
├─ Seller GSTIN
├─ Buyer GSTIN (or Buyer Name if unregistered)
├─ Invoice Number & Date
├─ HSN/SAC Codes
├─ Item Quantity & Value
├─ Tax Rates & Amounts
├─ Buyer Address
└─ Invoice Type (Tax Invoice, Bill, etc.)

IRN Generation:
├─ Unique 64-character code
├─ Automatically generated
├─ QR Code included
└─ Used for ITC/GST reconciliation
```

#### E-Invoice XML Structure (Sample)

```xml
<Invoice>
  <InvoiceType>Tax Invoice</InvoiceType>
  <InvoiceNumber>INV-2026-001</InvoiceNumber>
  <InvoiceDate>2026-02-14</InvoiceDate>
  <InvoicePeriod>2026-02</InvoicePeriod>
  
  <!-- Seller Details -->
  <SellerDetails>
    <GSTIN>18AABCU9603R1Z0</GSTIN>
    <LegalName>ABC Company</LegalName>
    <Address>
      <BuildingNo>123</BuildingNo>
      <Street>Main Street</Street>
      <City>Kathmandu</City>
      <State>State Code</State>
      <PostCode>12345</PostCode>
      <Country>IN</Country>
    </Address>
  </SellerDetails>
  
  <!-- Buyer Details -->
  <BuyerDetails>
    <GSTIN>18XYZAB1234C1Z5</GSTIN>
    <LegalName>XYZ Trading</LegalName>
    <Address>
      <City>Delhi</City>
      <State>State Code</State>
      <Country>IN</Country>
    </Address>
  </BuyerDetails>
  
  <!-- Line Items -->
  <LineItems>
    <Item>
      <ItemNo>1</ItemNo>
      <ItemDescription>Cotton Shirt</ItemDescription>
      <HSNCode>6205</HSNCode>
      <ItemQuantity>100</ItemQuantity>
      <UnitOfMeasure>PCS</UnitOfMeasure>
      <ItemPrice>300</ItemPrice>
      <LineAmount>30000</LineAmount>
      <SGSTRate>5</SGSTRate>
      <SGSTAmount>1500</SGSTAmount>
      <CGSTRate>5</CGSTRate>
      <CGSTAmount>1500</CGSTAmount>
      <IGSTRate>0</IGSTRate>
      <IGSTAmount>0</IGSTAmount>
    </Item>
  </LineItems>
  
  <!-- Totals -->
  <DocumentTotals>
    <TaxableAmount>30000</TaxableAmount>
    <SGSTTotal>1500</SGSTTotal>
    <CGSTTotal>1500</CGSTTotal>
    <IgstTotal>0</IgstTotal>
    <TotalInvoiceValue>33000</TotalInvoiceValue>
  </DocumentTotals>
  
  <!-- Signature -->
  <Signature>DIGITAL_SIGNATURE</Signature>
</Invoice>
```

### E-Way Bill Management

```
E-Way Bill: Electronic Way Bill for movement of goods > ₹50,000

Required for:
├─ Inter-State Movement
├─ Intra-State (some states)
├─ Supply > ₹50,000 value
└─ Even for free samples > ₹50,000

Generated in: https://ewaybill.eway.gst.gov.in

In Tally Prime:
├─ Auto-generation on invoice creation
├─ QR Code in print format
├─ Tracking number provided
└─ Can cancel within validity period

Tally Integration:
├─ Automatic E-Way Bill generation
├─ Print with invoice
├─ Track expiry dates
└─ Manage cancellations
```

---

## 2. INVENTORY MANAGEMENT

### Stock Valuation Methods

#### FIFO (First In First Out)
```
Suitable for: Perishable goods, Fashion items

Example:
Opening Stock:
  10 units @ ₹100 = ₹1000

Purchases:
  20 units @ ₹120 = ₹2400
  15 units @ ₹130 = ₹1950

Sales (closing):
  30 units

Calculation:
  Sale Price = 10 @ ₹100 + 20 @ ₹120 = ₹1000 + ₹2400 = ₹3400

Closing Stock:
  15 units @ ₹130 = ₹1950
```

#### LIFO (Last In First Out)
```
Suitable for: Commodities, Bulk items

Same Example:
Sale Price = 15 @ ₹130 + 15 @ ₹120 = ₹1950 + ₹1800 = ₹3750

Closing Stock:
  10 @ ₹100 + 5 @ ₹120 = ₹1000 + ₹600 = ₹1600
```

#### WAC (Weighted Average Cost)
```
Suitable for: Most businesses (default)

Average Cost = Total Value / Total Quantity
            = (1000 + 2400 + 1950) / (10 + 20 + 15)
            = 5350 / 45
            = ₹118.89 per unit

Sale Price = 30 × 118.89 = ₹3566.7
Closing Stock = 15 × 118.89 = ₹1783.35
```

### Inventory Configuration in Tally

#### Stock Item Master

```
Gateway → Create → Stock Item

Name: Cotton Shirt
├─ Unit: Pieces
├─ Category: Clothing
├─ HSN Code: 6204
├─ Barcode: 8901234567890
│
├─ Opening Balance
│  ├─ Quantity: 500
│  ├─ Rate: ₹300
│  └─ Value: ₹150,000
│
├─ Reorder Point: 100 units
├─ Reorder Quantity: 500 units
│
├─ Godown Allocation
│  ├─ Godown 1 (Primary): 300 units
│  ├─ Godown 2 (Secondary): 200 units
│  └─ Shelf Tracking: Rack A1, Shelf 2
│
├─ Pricing
│  ├─ Cost Price: ₹250
│  ├─ Selling Price: ₹300
│  ├─ Wholesale Price: ₹280
│  └─ Markup: 20%
│
├─ Tax Details
│  ├─ HSN Code: 6204
│  ├─ GST Rate: 5%
│  ├─ ITC Eligible: Yes
│  └─ Exemption Status: No
│
└─ Batch & Expiry
   ├─ Batch Tracking: Yes
   ├─ Expiry Date Tracking: Yes
   └─ Serial Number: No
```

### Inventory Reports

#### Stock Summary
```
Reports → Inventory → Stock Summary

Shows:
├─ Quantity by Location
├─ Value of Stock
├─ Slow-Moving Items
├─ Fast-Moving Items
├─ Stock Aging
└─ Valuation Method Impact
```

#### Stock Ledger
```
Reports → Inventory → Stock Ledger

Tracks:
├─ Opening Balance
├─ Purchases (Date, Qty, Rate)
├─ Sales (Date, Qty, Rate)
├─ Adjustments
├─ Closing Balance
└─ Closing Value

Period: Daily/Monthly/Yearly
```

#### Reorder Report
```
Reports → Inventory → Reorder Report

Identifies:
├─ Items below reorder point
├─ Recommended order quantity
├─ Vendor for item
├─ Lead time
└─ Auto-send alerts to buyers
```

#### Batch & Expiry Report
```
Reports → Inventory → Batch & Expiry

Shows:
├─ Batch-wise quantities
├─ Expiry dates
├─ Days to expiry
├─ Batch-wise valuation
└─ Expired stock alerts
```

---

## 3. PAYROLL MANAGEMENT

### Salary Structure Setup

#### Employee Master

```
Gateway → Create → Employee

Emp ID: EMP001
├─ Employee Details
│  ├─ Name: John Doe
│  ├─ Date of Birth: 1990-05-15
│  ├─ Date of Joining: 2024-01-01
│  ├─ Department: Operations
│  ├─ Designation: Manager
│  ├─ Reporting Manager: Senior Manager
│  ├─ Bank Account: 1234567890123
│  ├─ PAN: ABCDE1234F
│  └─ Aadhar: 1234 5678 9012 3456
│
├─ Salary Structure
│  ├─ Basic Salary: ₹30,000
│  ├─ HRA: ₹9,000
│  ├─ Dearness Allowance: ₹3,000
│  ├─ Conveyance: ₹1,200
│  ├─ Medical: ₹1,000
│  ├─ Special Allowance: ₹5,800
│  └─ Gross Salary: ₹50,000
│
├─ Deductions
│  ├─ Professional Tax: ₹200
│  ├─ Employee PF: ₹1,800
│  ├─ Employee ESI: ₹975
│  └─ TDS: Calculated
│
├─ Employer Contributions
│  ├─ Employer PF: ₹3,600
│  ├─ Employer ESI: ₹3,925
│  └─ Gratuity Reserve: ₹416.67
│
└─ Compliance
   ├─ ESI Applicable: Yes
   ├─ PF Applicable: Yes
   ├─ Gratuity Applicable: Yes
   └─ Tax Status: Monthly TDS
```

### Salary Processing

```
Gateway → Processing → Payroll

For Month: February 2026

Steps:
1. Create Payroll Entry
   ├─ Month & Year
   ├─ Select Employees
   ├─ Basic Salary
   ├─ Allowances
   └─ Generate Salary Sheet

2. Review & Approve
   ├─ Check calculations
   ├─ Review deductions
   ├─ Verify gross-to-net
   └─ Approve for posting

3. Post to Accounting
   ├─ Create salary voucher
   ├─ Post to salary ledgers
   ├─ Update employee ledger
   └─ Create payroll expense entries

4. Print Salary Slips
   ├─ Individual slip per employee
   ├─ Show breakdown
   ├─ Sign-off section
   └─ Tax calculation summary

5. Pay Salary
   ├─ Bank Transfer (Automated)
   ├─ Cash Payment
   ├─ Cheque Payment
   └─ Digital Wallet
```

### Payroll Accounting Entries

```
Salary Payment Journal Entry:

Dr. Salary & Wages             ₹50,000
Dr. Employer PF Contribution   ₹3,600
Dr. Employer ESI Contribution  ₹3,925
    Cr. Salary Payable                 ₹50,000
    Cr. Employee PF Payable            ₹1,800
    Cr. Employee ESI Payable           ₹975
    Cr. Professional Tax Payable       ₹200
    Cr. TDS Payable                    ₹3,550
    Cr. Bank (Net Salary)              ₹44,000

Total Left Side = Total Right Side ✓
```

### Tax Calculations

#### TDS (Tax Deducted at Source)

```
Gross Salary:          ₹50,000 × 12 = ₹6,00,000
Less: Standard Deduction: ₹50,000
Taxable Income:        ₹5,50,000

Tax Brackets (2024-25):
├─ ₹0 to ₹2,50,000:       Nil
├─ ₹2,50,001 to ₹5,00,000: 5% = ₹12,500
├─ ₹5,00,001 to ₹10,00,000: 20% on amount above ₹5,00,000
│                           = ₹(5,50,000 - 5,00,000) × 20%
│                           = ₹10,000
└─ Above ₹10,00,000:      30%

Total Tax: ₹22,500
Monthly TDS: ₹1,875 (or as applicable)
```

#### Provident Fund (PF)

```
Employee Contribution: 12% of basic salary
Employer Contribution: 12% of basic salary

Example:
Basic Salary: ₹30,000

Employee PF: ₹30,000 × 12% = ₹3,600
Employer PF: ₹30,000 × 12% = ₹3,600

Total PF Account: ₹7,200 per month

Government contribution for low wage workers:
├─ If basic < ₹15,000: Government adds 3.67%
└─ Limited to max ₹225 per month
```

#### ESI (Employees' State Insurance)

```
Applicable if: Gross monthly wage ≤ ₹21,000

Employee Contribution: 0.75% of gross
Employer Contribution: 3.25% of gross

Example:
Gross Salary: ₹50,000

Employee ESI: 0% (exceeds limit)
Employer ESI: 0% (exceeds limit)

But if Gross was ₹18,000:
Employee ESI: ₹18,000 × 0.75% = ₹135
Employer ESI: ₹18,000 × 3.25% = ₹585
```

### Reports

#### Payroll Summary
```
Reports → Payroll → Monthly Summary

Shows:
├─ Total Gross Salary Paid
├─ Total Deductions
├─ Total Net Paid
├─ Tax Deducted
├─ PF Contributions
├─ ESI Contributions
└─ Variance from budget
```

#### Salary Register
```
Reports → Payroll → Salary Register

Lists:
├─ Employee-wise salary
├─ Component-wise breakup
├─ Deduction details
├─ Net amount paid
└─ Payment method
```

#### Form 16 (Annual Tax Certificate)
```
Generated Annually (Jan 31st deadline)

Contains:
├─ Employee PAN
├─ Gross Income
├─ Deductions
├─ Tax Paid
└─ TDS Details by Quarter
```

---

## 4. BANKING & RECONCILIATION

### Bank Reconciliation Process

#### Setup Bank Ledger

```
Gateway → Create → Ledger

Name: HDFC Bank Current Account
├─ Parent: Bank Accounts
├─ Ledger Type: Bank
├─ Bank Name: HDFC Bank
├─ Account Number: 1234567890123
├─ IFSC Code: HDFC0001234
├─ Branch: Kathmandu
│
├─ Opening Balance
│  ├─ Date: 2026-01-01
│  ├─ Amount: ₹1,00,000
│  └─ Nature: Debit (Asset)
│
└─ Bank Statement Settings
   ├─ Reconciliation Frequency: Monthly
   ├─ Statement Format: CSV
   └─ Statement Provider: Internet Banking
```

#### Bank Statement Import

```
Reports → Bank Reconciliation → Bank Statement

Import Process:
├─ Download Statement (CSV format)
├─ Upload in Tally: F3 → Import → Bank Statement
├─ Map columns:
│  ├─ Date Column
│  ├─ Reference Column
│  ├─ Debit Column
│  ├─ Credit Column
│  └─ Balance Column
│
├─ Reconcile:
│  ├─ Match with Tally entries
│  ├─ Identify clearances
│  ├─ Mark uncleared items
│  └─ Identify discrepancies
│
└─ Generate Report
   ├─ Reconciled Balance
   ├─ Outstanding Cheques
   ├─ Outstanding Deposits
   └─ Discrepancies
```

#### Reconciliation Steps

```
Step 1: Tally Balance
Balance as per Tally: ₹5,00,000

Step 2: Bank Statement Balance
Balance as per Bank: ₹4,95,000

Step 3: Identify Outstanding Items
Outstanding Cheques:
  CQ001 dated 2026-02-10: ₹10,000
  CQ002 dated 2026-02-12: ₹5,000

Outstanding Deposits:
  Cheque from ABC dated 2026-02-08: ₹10,000

Step 4: Reconciliation
Tally Balance:                      ₹5,00,000
  Less: Outstanding Cheques:        ₹15,000
  Add: Outstanding Deposits:        ₹10,000
Reconciled Balance:                 ₹4,95,000

Bank Balance:                       ₹4,95,000 ✓

Reconciliation Complete!
```

### Connected Banking (Tally Prime 7.0+)

```
Features Available:
├─ Real-time Balance Updates
├─ Automated Reconciliation
├─ Online Payments
├─ View Transactions Live
├─ Download Statements
└─ Set Up Alerts

Supported Banks:
├─ SBI (State Bank of India)
├─ HDFC Bank
├─ ICICI Bank
├─ Axis Bank
├─ Yes Bank
└─ Others (expanding)

Setup:
├─ Enable Connected Banking
├─ Login with Net Banking credentials
├─ Select Accounts to link
├─ Grant Permissions
└─ Auto-sync enabled
```

### Online Payment Processing

```
Create Payment through Tally:
1. Create Payment Voucher
2. Click "Pay Online"
3. System shows payment details
4. Confirm through Net Banking (OTP)
5. Payment processed
6. Auto-reconciliation in Tally

Benefits:
├─ Instant processing
├─ No manual bank entry needed
├─ Reconciled automatically
├─ Audit trail maintained
└─ Secure transaction
```

---

## 5. ANALYTICS & REPORTING

### Dashboard Reports

```
TallyPrime Dashboard (Home Screen)

Widgets Available:
├─ Cash Flow Summary
│  └─ Today's opening, inflows, outflows, closing
│
├─ Sales Overview
│  ├─ Total sales today
│  ├─ Sales by product
│  ├─ Sales by customer
│  └─ Pending vs received
│
├─ Inventory Status
│  ├─ Stock value
│  ├─ Low stock alerts
│  ├─ Fast movers
│  └─ Slow movers
│
├─ Receivables Status
│  ├─ Total outstanding
│  ├─ Overdue amounts
│  ├─ By customer
│  └─ Aging analysis
│
├─ Payables Status
│  ├─ Total payable
│  ├─ Overdue payments
│  ├─ By vendor
│  └─ Payment schedule
│
└─ Financial Health
   ├─ Profit & Loss (Month-to-date)
   ├─ Key ratios
   ├─ Cash position
   └─ Comparison with budget
```

### Advanced Reports

#### Trial Balance
```
Reports → Financial → Trial Balance

Date: 2026-02-14

Ledger                          Debit        Credit
─────────────────────────────────────────────────────
Cash in Hand                   50,000
Bank Account                   3,00,000
Inventory                      1,50,000
Furniture                      50,000
Machinery                      2,00,000
Sundry Debtors                 1,50,000
                                         Capital          5,00,000
                                         Sales            3,00,000
                                         Purchases        1,00,000
                                         Rent Paid        10,000
                                         Utilities        5,000

Total                          9,00,000      9,00,000
```

#### Profit & Loss Statement
```
For Period: Apr 2025 - Feb 2026

Income:
├─ Sales                       ₹50,00,000
├─ Less: Returns               (₹2,00,000)
├─ Net Sales                   ₹48,00,000
│
└─ Other Income
  ├─ Interest Received         ₹50,000
  └─ Miscellaneous            ₹25,000
  
Total Income:                  ₹48,75,000

Expenses:
├─ Cost of Goods Sold
│  ├─ Opening Stock           ₹10,00,000
│  ├─ Purchases               ₹30,00,000
│  ├─ Less: Closing Stock     (₹12,00,000)
│  └─ COGS                    ₹28,00,000
│
├─ Gross Profit               ₹20,00,000
│
├─ Operating Expenses
│  ├─ Salary & Wages          ₹6,00,000
│  ├─ Rent                    ₹1,20,000
│  ├─ Utilities               ₹60,000
│  ├─ Transport               ₹40,000
│  ├─ Depreciation            ₹1,00,000
│  └─ Other Expenses          ₹80,000
│  Total Operating Exp         ₹9,00,000
│
├─ EBITDA                      ₹11,00,000
│
├─ Interest Expense           ₹(60,000)
│
└─ Net Profit Before Tax       ₹11,00,000 - ₹60,000 = ₹10,40,000

Less: Tax (30%)               ₹(3,12,000)

Net Profit After Tax          ₹7,28,000
```

#### Balance Sheet
```
As on: 2026-02-14

ASSETS
├─ Current Assets
│  ├─ Cash in Hand            ₹50,000
│  ├─ Bank Balance            ₹3,00,000
│  ├─ Sundry Debtors          ₹1,50,000
│  └─ Inventory               ₹1,20,000
│  Subtotal                   ₹6,20,000
│
├─ Fixed Assets
│  ├─ Land & Building         ₹5,00,000
│  ├─ Machinery               ₹2,00,000
│  ├─ Furniture               ₹50,000
│  └─ Less: Depreciation      (₹1,00,000)
│  Subtotal                   ₹6,50,000
│
Total Assets                  ₹12,70,000

LIABILITIES
├─ Current Liabilities
│  ├─ Sundry Creditors        ₹1,00,000
│  ├─ Loan (Current)          ₹50,000
│  └─ Outstanding Expenses    ₹20,000
│  Subtotal                   ₹1,70,000
│
├─ Long-term Liabilities
│  ├─ Bank Loan               ₹3,00,000
│  └─ Deferred Tax            ₹30,000
│  Subtotal                   ₹3,30,000
│
Total Liabilities             ₹5,00,000

EQUITY
├─ Capital                    ₹5,00,000
├─ Reserves & Surplus         ₹1,00,000
├─ Current Year Profit        ₹1,70,000
└─ Less: Drawings             (₹0)

Total Equity                  ₹7,70,000

TOTAL LIABILITIES + EQUITY    ₹12,70,000

Assets = Liabilities + Equity ✓
```

#### Cash Flow Statement
```
For Period: Apr 2025 - Feb 2026

A. Operating Activities
├─ Net Profit                  ₹7,28,000
├─ Add: Depreciation           ₹1,00,000
├─ Add: Interest Paid          ₹60,000
│
├─ Working Capital Changes:
│  ├─ Decrease in Debtors      ₹20,000
│  ├─ Increase in Creditors    ₹10,000
│  └─ Decrease in Inventory    ₹30,000
│
Net Cash from Operations       ₹8,48,000

B. Investing Activities
├─ Purchase of Fixed Assets    (₹2,00,000)
├─ Sale of Equipment           ₹50,000
│
Net Cash from Investing        (₹1,50,000)

C. Financing Activities
├─ New Loan Raised             ₹3,00,000
├─ Loan Repayment              (₹1,00,000)
├─ Dividends Paid              (₹1,00,000)
│
Net Cash from Financing        ₹1,00,000

Net Change in Cash             ₹7,98,000
Opening Cash Balance           ₹1,00,000
Closing Cash Balance           ₹8,98,000
```

---

## 6. MULTI-COMPANY OPERATIONS

### Company Setup

```
Gateway → F3 (Company) → Create

Company Name: ABC Trading Nepal
├─ Company Details
│  ├─ Legal Name: ABC Trading Nepal Pvt. Ltd.
│  ├─ Registration No: 1234/2070
│  ├─ PAN: 1234567890
│  ├─ Address: Kathmandu, Nepal
│  ├─ Contact Number: 9841234567
│  └─ Email: info@abctrading.np
│
├─ Financial Year
│  ├─ Start: April 2025
│  └─ End: March 2026
│
├─ Currency & Symbols
│  ├─ Currency: Nepali Rupee (NPR)
│  ├─ Currency Symbol: Rs.
│  └─ Decimal Places: 2
│
├─ Books of Accounts
│  ├─ Method: Accrual
│  ├─ Financial Year: As above
│  └─ Lock Periods
│
└─ Tax Configuration
   ├─ Tax Authority: Nepal IRD
   ├─ VAT Applicable: Yes/No
   ├─ Income Tax: Yes
   └─ Other Taxes
```

### Multi-Company Consolidation

```
Reports → Consolidation → Multi-Company Report

Consolidation Steps:
1. Connect Multiple Companies
   ├─ Company 1: Kathmandu Branch
   ├─ Company 2: Pokhara Branch
   ├─ Company 3: Biratnagar Branch
   └─ Company 4: Head Office

2. Define Consolidation Rules
   ├─ Inter-company eliminations
   ├─ Exchange rate translations
   ├─ Minority interests
   └─ Goodwill treatment

3. Generate Consolidated Reports
   ├─ Consolidated Balance Sheet
   ├─ Consolidated P&L
   ├─ Consolidated Cash Flow
   └─ Segment-wise disclosures

4. Analysis
   ├─ Company-wise performance
   ├─ Variance analysis
   ├─ Trend analysis
   └─ Comparative metrics
```

---

## TRAINING & CERTIFICATION

### Official Courses

```
Tally Education (https://tallyeducation.com/tepl/)

Courses Available:

1. TallyEssential
   ├─ Duration: 90 hours
   ├─ Topics: Basic accounting, voucher types, reports
   └─ Certification: Entry-level

2. TallyProfessional
   ├─ Duration: 150 hours
   ├─ Topics: Advanced accounting, GST, TDS, taxation
   └─ Certification: Professional-level

3. TDL Essential
   ├─ Duration: 60 hours
   ├─ Topics: Custom field creation, TDL coding
   └─ Certification: Developer

4. GST using TallyPrime
   ├─ Duration: 40 hours
   ├─ Topics: Complete GST setup, compliance
   └─ Certification: GST specialist

5. Payroll Management
   ├─ Duration: 30 hours
   ├─ Topics: Salary processing, tax calculations
   └─ Certification: Payroll expert

6. Advanced Features
   ├─ Duration: 50 hours
   ├─ Topics: Integration, automation, reporting
   └─ Certification: Advanced practitioner
```

---

**Document Version**: 1.0
**Last Updated**: February 14, 2026
**Status**: Complete & Production Ready

**Next**: Study these materials and implement in your connector!

