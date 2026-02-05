/**
 * Tally Prime XML Connector Service
 * Handles all communication with Tally Prime via XML over HTTP
 *
 * Tally Prime 7.0 acts as HTTP server
 * - POST requests with XML body
 * - Response in XML format
 */

import axios from 'axios';
import { parseStringPromise, Builder } from 'xml2js';
import config from '../config/default.js';

class TallyConnector {
  constructor() {
    this.baseUrl = `http://${config.tally.host}:${config.tally.port}`;
    this.companyName = config.tally.companyName;
    this.lastRequestTime = 0;
    this.minRequestInterval = 5000; // Minimum 5 seconds between requests to be gentle on Tally
    this.requestQueue = [];
    this.isProcessingQueue = false;
  }

  /**
   * Wait for minimum interval between requests
   */
  async throttle() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      const waitTime = this.minRequestInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.lastRequestTime = Date.now();
  }

  /**
   * Send XML request to Tally and get response
   */
  async sendRequest(xmlData) {
    // Throttle requests to prevent overwhelming Tally
    await this.throttle();

    try {
      const response = await axios.post(this.baseUrl, xmlData, {
        headers: {
          'Content-Type': 'text/xml;charset=UTF-8'
        },
        timeout: 60000 // Increased timeout to 60 seconds
      });

      return await parseStringPromise(response.data, {
        explicitArray: false,
        ignoreAttrs: false,
        trim: true
      });
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Cannot connect to Tally on port ' + config.tally.port);
      }
      throw error;
    }
  }

  /**
   * Check if Tally is connected
   */
  async checkConnection() {
    // Simple request to check if Tally responds
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>TestConn</ID></HEADER>
<BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
<TDL><TDLMESSAGE><COLLECTION NAME="TestConn"><TYPE>Company</TYPE><FETCH>NAME</FETCH></COLLECTION></TDLMESSAGE></TDL>
</DESC></BODY></ENVELOPE>`;

    try {
      const response = await this.sendRequest(xml);
      const status = response?.ENVELOPE?.HEADER?.STATUS;
      return {
        connected: status === '1' || status === 1,
        companies: this.extractCompanies(response)
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Extract companies from response
   */
  extractCompanies(response) {
    try {
      const data = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!data) return [];
      const companies = data.COMPANY;
      if (!companies) return [];
      const companyList = Array.isArray(companies) ? companies : [companies];

      // Extract just the company names
      return companyList.map(c => {
        if (typeof c === 'string') return c;
        if (c.NAME) {
          return typeof c.NAME === 'object' ? c.NAME._ : c.NAME;
        }
        if (c.$?.NAME) return c.$.NAME;
        return String(c);
      }).filter(Boolean);
    } catch {
      return [];
    }
  }

  /**
   * Get list of all companies from Tally
   */
  async getCompanies() {
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>CompanyList</ID></HEADER>
<BODY><DESC><STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
<TDL><TDLMESSAGE><COLLECTION NAME="CompanyList"><TYPE>Company</TYPE><FETCH>NAME,STARTINGFROM,BOOKSFROM</FETCH></COLLECTION></TDLMESSAGE></TDL>
</DESC></BODY></ENVELOPE>`;

    try {
      const response = await this.sendRequest(xml);
      return this.extractCompanies(response);
    } catch (error) {
      console.error('Error fetching companies:', error.message);
      return [];
    }
  }

  /**
   * Set active company for queries
   */
  setCompany(companyName) {
    this.companyName = companyName;
    console.log('Active company set to:', companyName);
  }

  /**
   * Get vouchers for a date range
   */
  async getVouchers(fromDate, toDate, voucherTypes = null) {
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>VchColl</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
<SVFROMDATE>${fromDate}</SVFROMDATE>
<SVTODATE>${toDate}</SVTODATE>
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="VchColl" ISMODIFY="No">
<TYPE>Voucher</TYPE>
<FETCH>DATE,VOUCHERTYPENAME,VOUCHERNUMBER,PARTYLEDGERNAME,AMOUNT,NARRATION,GUID,MASTERID,ALTERID</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      const response = await this.sendRequest(xml);
      return this.parseVouchers(response, voucherTypes);
    } catch (error) {
      console.error('Error fetching vouchers:', error.message);
      return [];
    }
  }

  /**
   * Get ONLY new/modified vouchers since last AlterID (incremental sync - lightweight)
   * This is the recommended approach to avoid overloading Tally
   * Excludes cancelled and optional vouchers
   */
  async getVouchersIncremental(lastAlterId = 0, voucherTypes = null) {
    // Use ALTERID filter to only get new/changed vouchers
    // Also exclude cancelled and optional vouchers for cleaner data
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>VchIncr</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="VchIncr" ISMODIFY="No">
<TYPE>Voucher</TYPE>
<FETCH>DATE,VOUCHERTYPENAME,VOUCHERNUMBER,PARTYLEDGERNAME,AMOUNT,NARRATION,GUID,MASTERID,ALTERID</FETCH>
<FILTER>IncrFilter,NotCancelled,NotOptional</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="IncrFilter">$ALTERID > ${lastAlterId}</SYSTEM>
<SYSTEM TYPE="Formulae" NAME="NotCancelled">$$IsEqual:$IsCancelled:No</SYSTEM>
<SYSTEM TYPE="Formulae" NAME="NotOptional">$$IsEqual:$IsOptional:No</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Fetching vouchers with ALTERID > ${lastAlterId} (incremental sync)`);
      const response = await this.sendRequest(xml);
      return this.parseVouchers(response, voucherTypes);
    } catch (error) {
      console.error('Error fetching incremental vouchers:', error.message);
      return [];
    }
  }

  /**
   * Get today's sales vouchers
   */
  async getTodaySalesVouchers() {
    const today = this.formatDate(new Date());
    return this.getVouchers(today, today, config.voucherTypes.sales);
  }

  /**
   * Get all vouchers for today
   */
  async getTodayVouchers() {
    const today = this.formatDate(new Date());
    const allTypes = [...config.voucherTypes.sales, ...config.voucherTypes.receipt];
    return this.getVouchers(today, today, allTypes);
  }

  /**
   * Parse vouchers from Tally response
   */
  parseVouchers(response, filterTypes = null) {
    try {
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) {
        console.log('No collection in response');
        return [];
      }

      let vouchers = collection.VOUCHER;
      if (!vouchers) {
        console.log('No vouchers in collection');
        return [];
      }

      vouchers = Array.isArray(vouchers) ? vouchers : [vouchers];
      console.log(`Found ${vouchers.length} vouchers from Tally`);

      const parsed = vouchers.map(v => {
        // Handle different response formats
        const guid = v.GUID || v.$?.GUID || v.$?.REMOTEID || '';
        const masterId = v.MASTERID?._ || v.MASTERID || '';
        const alterId = v.ALTERID?._ || v.ALTERID || '0';
        const dateRaw = v.DATE?._ || v.DATE || '';
        const voucherType = v.VOUCHERTYPENAME || '';
        const voucherNumber = v.VOUCHERNUMBER || '';
        const partyName = v.PARTYLEDGERNAME?._ || v.PARTYLEDGERNAME || '';
        const amountRaw = v.AMOUNT?._ || v.AMOUNT || '0';
        let narration = v.NARRATION || '';
        // Handle narration as object or string
        if (typeof narration === 'object') {
          narration = narration._ || '';
        }

        return {
          guid: String(guid),
          masterId: String(masterId).trim(),
          alterId: parseInt(String(alterId).trim()) || 0,
          date: String(dateRaw),
          voucherType: String(voucherType),
          voucherNumber: String(voucherNumber),
          partyName: String(partyName),
          amount: parseFloat(String(amountRaw).replace(/[^\d.-]/g, '')) || 0,
          narration: String(narration)
        };
      });

      // Filter by voucher types if specified
      if (filterTypes && filterTypes.length > 0) {
        const filtered = parsed.filter(v => filterTypes.includes(v.voucherType));
        console.log(`Filtered to ${filtered.length} vouchers of types: ${filterTypes.join(', ')}`);
        return filtered;
      }

      return parsed;
    } catch (error) {
      console.error('Error parsing vouchers:', error);
      return [];
    }
  }

  /**
   * Get all party balances (Sundry Debtors)
   */
  async getAllPartyBalances() {
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>PartyBal</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="PartyBal" ISMODIFY="No">
<TYPE>Ledger</TYPE>
<CHILDOF>Sundry Debtors</CHILDOF>
<FETCH>NAME,CLOSINGBALANCE</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      const response = await this.sendRequest(xml);
      return this.parsePartyBalances(response);
    } catch (error) {
      console.error('Error fetching party balances:', error.message);
      return [];
    }
  }

  /**
   * Parse party balances
   */
  parsePartyBalances(response) {
    try {
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) return [];

      let ledgers = collection.LEDGER;
      if (!ledgers) return [];

      ledgers = Array.isArray(ledgers) ? ledgers : [ledgers];

      return ledgers.map(l => ({
        name: l.NAME?._ || l.NAME || '',
        balance: parseFloat(String(l.CLOSINGBALANCE?._ || l.CLOSINGBALANCE || '0').replace(/[^\d.-]/g, '')) || 0
      }));
    } catch (error) {
      console.error('Error parsing party balances:', error);
      return [];
    }
  }

  /**
   * Get all stock items with details including selling price
   */
  async getStockItems() {
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>StockItems</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="StockItems" ISMODIFY="No">
<TYPE>Stock Item</TYPE>
<FETCH>NAME,PARENT,BASEUNITS,OPENINGBALANCE,CLOSINGBALANCE,CLOSINGVALUE,CLOSINGRATE,HSNCODE,GSTRATE,ALTERID,STANDARDCOST,STANDARDPRICE</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      console.log('Fetching stock items from Tally...');
      const response = await this.sendRequest(xml);
      return this.parseStockItems(response);
    } catch (error) {
      console.error('Error fetching stock items:', error.message);
      return [];
    }
  }

  /**
   * Get stock items with closing balance and value (inventory summary)
   */
  async getStockSummary() {
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>StockSummary</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="StockSummary" ISMODIFY="No">
<TYPE>Stock Item</TYPE>
<FETCH>NAME,PARENT,BASEUNITS,CLOSINGBALANCE,CLOSINGVALUE,CLOSINGRATE,HSNCODE</FETCH>
<FILTER>HasStock</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="HasStock">$CLOSINGBALANCE > 0</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      console.log('Fetching stock summary from Tally...');
      const response = await this.sendRequest(xml);
      return this.parseStockItems(response);
    } catch (error) {
      console.error('Error fetching stock summary:', error.message);
      return [];
    }
  }

  /**
   * Get stock items incrementally (only changed since lastAlterId)
   */
  async getStockItemsIncremental(lastAlterId = 0) {
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>StockIncr</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="StockIncr" ISMODIFY="No">
<TYPE>Stock Item</TYPE>
<FETCH>NAME,PARENT,BASEUNITS,OPENINGBALANCE,CLOSINGBALANCE,CLOSINGVALUE,CLOSINGRATE,HSNCODE,GSTRATE,ALTERID,STANDARDCOST,STANDARDPRICE</FETCH>
<FILTER>IncrFilter</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="IncrFilter">$ALTERID > ${lastAlterId}</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Fetching stock items with ALTERID > ${lastAlterId}`);
      const response = await this.sendRequest(xml);
      return this.parseStockItems(response);
    } catch (error) {
      console.error('Error fetching incremental stock items:', error.message);
      return [];
    }
  }

  /**
   * Parse stock items response
   */
  parseStockItems(response) {
    try {
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) {
        console.log('No stock collection in response');
        return [];
      }

      let items = collection.STOCKITEM;
      if (!items) {
        console.log('No stock items found');
        return [];
      }

      items = Array.isArray(items) ? items : [items];
      console.log(`Found ${items.length} stock items from Tally`);

      return items.map(item => {
        // Extract name (multiple formats like ledgers)
        let name = '';
        if (item.$?.NAME) {
          name = item.$.NAME;
        } else if (item.NAME?._) {
          name = item.NAME._;
        } else if (typeof item.NAME === 'string') {
          name = item.NAME;
        } else if (item._) {
          name = item._;
        }

        // Extract other fields with fallback handling
        let parent = '';
        if (item.PARENT?._) parent = item.PARENT._;
        else if (typeof item.PARENT === 'string') parent = item.PARENT;

        let baseUnits = '';
        if (item.BASEUNITS?._) baseUnits = item.BASEUNITS._;
        else if (typeof item.BASEUNITS === 'string') baseUnits = item.BASEUNITS;

        const openingBalance = item.OPENINGBALANCE?._ || item.OPENINGBALANCE || '0';
        const closingBalance = item.CLOSINGBALANCE?._ || item.CLOSINGBALANCE || '0';
        const closingValue = item.CLOSINGVALUE?._ || item.CLOSINGVALUE || '0';
        const closingRate = item.CLOSINGRATE?._ || item.CLOSINGRATE || '0';
        const hsnCode = item.HSNCODE?._ || item.HSNCODE || '';
        const gstRate = item.GSTRATE?._ || item.GSTRATE || '0';
        const alterId = item.ALTERID?._ || item.ALTERID || '0';
        const standardCost = item.STANDARDCOST?._ || item.STANDARDCOST || '0';
        const standardPrice = item.STANDARDPRICE?._ || item.STANDARDPRICE || '0';

        return {
          name: String(name).trim(),
          parent: String(parent).trim(),
          baseUnits: String(baseUnits).trim(),
          openingBalance: parseFloat(String(openingBalance).replace(/[^\d.-]/g, '')) || 0,
          closingBalance: parseFloat(String(closingBalance).replace(/[^\d.-]/g, '')) || 0,
          closingValue: parseFloat(String(closingValue).replace(/[^\d.-]/g, '')) || 0,
          closingRate: parseFloat(String(closingRate).replace(/[^\d.-]/g, '')) || 0,
          hsnCode: String(hsnCode).trim(),
          gstRate: parseFloat(String(gstRate).replace(/[^\d.-]/g, '')) || 0,
          alterId: parseInt(String(alterId).trim()) || 0,
          standardCost: parseFloat(String(standardCost).replace(/[^\d.-]/g, '')) || 0,
          sellingPrice: parseFloat(String(standardPrice).replace(/[^\d.-]/g, '')) || 0
        };
      }).filter(item => item.name); // Filter out items with empty names
    } catch (error) {
      console.error('Error parsing stock items:', error);
      return [];
    }
  }

  /**
   * Get all ledgers (parties) for dropdown
   * Uses BELONGSTO to get all nested ledgers under the parent group
   */
  async getLedgers(parentGroup = 'Sundry Debtors') {
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>LedgerList</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="LedgerList" ISMODIFY="No">
<TYPE>Ledger</TYPE>
<BELONGSTO>Yes</BELONGSTO>
<CHILDOF>${parentGroup}</CHILDOF>
<FETCH>NAME,PARENT,CLOSINGBALANCE,ADDRESS,STATENAME,GSTIN</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Fetching ledgers under ${parentGroup}...`);
      const response = await this.sendRequest(xml);
      return this.parseLedgers(response);
    } catch (error) {
      console.error('Error fetching ledgers:', error.message);
      return [];
    }
  }

  /**
   * Parse ledgers response
   */
  parseLedgers(response) {
    try {
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) return [];

      let ledgers = collection.LEDGER;
      if (!ledgers) return [];

      ledgers = Array.isArray(ledgers) ? ledgers : [ledgers];

      return ledgers.map(l => {
        // Try multiple ways to get the name - Tally XML can have different formats
        let name = '';
        if (l.$?.NAME) name = l.$.NAME;
        else if (l.NAME?._) name = l.NAME._;
        else if (typeof l.NAME === 'string') name = l.NAME;
        else if (l._) name = l._;

        return {
          name: String(name),
          parent: l.PARENT?._ || l.PARENT || '',
          balance: parseFloat(String(l.CLOSINGBALANCE?._ || l.CLOSINGBALANCE || '0').replace(/[^\d.-]/g, '')) || 0,
          address: l.ADDRESS?._ || l.ADDRESS || '',
          state: l.STATENAME?._ || l.STATENAME || '',
          gstin: l.GSTIN?._ || l.GSTIN || ''
        };
      }).filter(l => l.name); // Filter out empty names
    } catch (error) {
      console.error('Error parsing ledgers:', error);
      return [];
    }
  }

  /**
   * Create Sales Invoice in Tally
   * @param {Object} invoiceData - Invoice details
   * @param {string} invoiceData.partyName - Customer/Party ledger name
   * @param {string} invoiceData.voucherType - Voucher type (default: Sales)
   * @param {Array} invoiceData.items - Array of line items [{stockItem, quantity, rate, amount, godown}]
   * @param {string} invoiceData.narration - Invoice narration
   * @param {string} invoiceData.date - Invoice date (YYYYMMDD format)
   * @param {string} invoiceData.godown - Default godown/warehouse name
   */
  async createSalesInvoice(invoiceData) {
    const {
      partyName,
      voucherType = 'Sales',
      items = [],
      narration = 'Invoice created via Dashboard',
      date = null,
      salesLedger = '1 Sales A/c',
      godown = 'Main Location'
    } = invoiceData;

    const invoiceDate = date || this.formatDate(new Date());

    // Escape XML special characters
    const safePartyName = this.escapeXml(partyName);
    const safeSalesLedger = this.escapeXml(salesLedger);
    const safeNarration = this.escapeXml(narration);
    const safeVoucherType = this.escapeXml(voucherType);
    const safeGodown = this.escapeXml(godown);

    // Calculate totals
    const totalAmount = items.reduce((sum, item) => sum + (item.amount || item.quantity * item.rate), 0);

    // Build inventory entries XML - minimal format for Tally
    const inventoryEntries = items.map(item => {
      const qty = item.quantity || 1;
      const rate = item.rate || 0;
      const amount = item.amount || (qty * rate);
      const safeStockItem = this.escapeXml(item.stockItem);
      const safeUnit = this.escapeXml(item.unit || 'Nos');
      const itemGodown = item.godown ? this.escapeXml(item.godown) : safeGodown;

      return `<ALLINVENTORYENTRIES.LIST>
<STOCKITEMNAME>${safeStockItem}</STOCKITEMNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<RATE>${rate}/${safeUnit}</RATE>
<AMOUNT>${amount}</AMOUNT>
<ACTUALQTY>${qty} ${safeUnit}</ACTUALQTY>
<BILLEDQTY>${qty} ${safeUnit}</BILLEDQTY>
<BATCHALLOCATIONS.LIST>
<GODOWNNAME>${itemGodown}</GODOWNNAME>
<AMOUNT>${amount}</AMOUNT>
<ACTUALQTY>${qty} ${safeUnit}</ACTUALQTY>
<BILLEDQTY>${qty} ${safeUnit}</BILLEDQTY>
</BATCHALLOCATIONS.LIST>
<ACCOUNTINGALLOCATIONS.LIST>
<LEDGERNAME>${safeSalesLedger}</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<AMOUNT>${amount}</AMOUNT>
</ACCOUNTINGALLOCATIONS.LIST>
</ALLINVENTORYENTRIES.LIST>`;
    }).join('\n');

    // Build company variable if set
    const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';

    // Build inventory entries with BATCHALLOCATIONS for godown tracking
    const inventoryXml = items.map(item => {
      const qty = item.quantity || 1;
      const rate = item.rate || 0;
      const amount = item.amount || (qty * rate);
      const safeStockItem = this.escapeXml(item.stockItem);
      const safeUnit = this.escapeXml(item.unit || 'Nos');
      const itemGodown = item.godown ? this.escapeXml(item.godown) : safeGodown;

      return `<ALLINVENTORYENTRIES.LIST>
<STOCKITEMNAME>${safeStockItem}</STOCKITEMNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<RATE>${rate}/${safeUnit}</RATE>
<AMOUNT>${amount}</AMOUNT>
<ACTUALQTY>${qty} ${safeUnit}</ACTUALQTY>
<BILLEDQTY>${qty} ${safeUnit}</BILLEDQTY>
<BATCHALLOCATIONS.LIST>
<GODOWNNAME>${itemGodown}</GODOWNNAME>
<AMOUNT>${amount}</AMOUNT>
<ACTUALQTY>${qty} ${safeUnit}</ACTUALQTY>
<BILLEDQTY>${qty} ${safeUnit}</BILLEDQTY>
</BATCHALLOCATIONS.LIST>
<ACCOUNTINGALLOCATIONS.LIST>
<LEDGERNAME>${safeSalesLedger}</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<AMOUNT>${amount}</AMOUNT>
</ACCOUNTINGALLOCATIONS.LIST>
</ALLINVENTORYENTRIES.LIST>`;
    }).join('\n');

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
<BODY>
<DESC><STATICVARIABLES>${companyVar}</STATICVARIABLES></DESC>
<DATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="${safeVoucherType}" ACTION="Create">
<DATE>${invoiceDate}</DATE>
<VOUCHERTYPENAME>${safeVoucherType}</VOUCHERTYPENAME>
<NARRATION>${safeNarration}</NARRATION>
<PARTYLEDGERNAME>${safePartyName}</PARTYLEDGERNAME>
<LEDGERENTRIES.LIST>
<LEDGERNAME>${safePartyName}</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>-${totalAmount}</AMOUNT>
</LEDGERENTRIES.LIST>
${inventoryXml}
</VOUCHER>
</TALLYMESSAGE>
</DATA>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Creating ${voucherType} invoice for ${partyName}, Amount: ${totalAmount}`);
      console.log('Invoice XML:', xml);
      const response = await this.sendRequest(xml);
      const result = this.parseImportResponse(response);
      console.log('Invoice result:', result);
      return result;
    } catch (error) {
      console.error('Error creating sales invoice:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create simple Sales voucher (without inventory - for services)
   */
  async createSimpleSalesVoucher(data) {
    const {
      partyName,
      amount,
      voucherType = 'Sales',
      narration = 'Sales via Dashboard',
      date = null,
      salesLedger = '1 Sales A/c'
    } = data;

    const voucherDate = date || this.formatDate(new Date());
    const safePartyName = this.escapeXml(partyName);
    const safeSalesLedger = this.escapeXml(salesLedger);
    const safeVoucherType = this.escapeXml(voucherType);
    const safeNarration = this.escapeXml(narration);
    const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
<BODY>
<DESC><STATICVARIABLES>${companyVar}</STATICVARIABLES></DESC>
<DATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="${safeVoucherType}" ACTION="Create">
<DATE>${voucherDate}</DATE>
<VOUCHERTYPENAME>${safeVoucherType}</VOUCHERTYPENAME>
<NARRATION>${safeNarration}</NARRATION>
<PARTYLEDGERNAME>${safePartyName}</PARTYLEDGERNAME>
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>${safePartyName}</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>-${Math.abs(amount)}</AMOUNT>
</ALLLEDGERENTRIES.LIST>
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>${safeSalesLedger}</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<AMOUNT>${Math.abs(amount)}</AMOUNT>
</ALLLEDGERENTRIES.LIST>
</VOUCHER>
</TALLYMESSAGE>
</DATA>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Creating simple ${voucherType} for ${partyName}, Amount: ${amount}`);
      const response = await this.sendRequest(xml);
      return this.parseImportResponse(response);
    } catch (error) {
      console.error('Error creating sales voucher:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create Receipt Voucher in Tally with multiple payment modes
   * Uses custom UDF fields for payment breakdown (for Tally dashboard):
   * - SFL1: Cash Teller 1
   * - SFL2: Cash Teller 2
   * - SFL3: Cheque receipt
   * - SFL4: Q/R code
   * - SFL5: Discount
   * - SFL6: Bank Deposit(All)
   * - SFL7: Esewa
   * - SFLTot: Total
   *
   * Payment Modes from Frontend:
   * - cashTeller1 → Cash Teller 1 ledger
   * - cashTeller2 → Cash Teller 2 ledger
   * - chequeReceipt → Cheque receipt ledger
   * - qrCode → Q/R code ledger
   * - discount → Discount ledger
   * - bankDeposit → Bank Deposit(All) ledger
   * - esewa → Esewa ledger
   */
  async createReceiptWithPaymentModes(receiptData) {
    const {
      partyName,
      voucherType = 'Dashboard Receipt',
      date = null,
      narration = 'Receipt via Dashboard',
      paymentModes = {
        cashTeller1: 0,
        cashTeller2: 0,
        chequeReceipt: 0,
        qrCode: 0,
        discount: 0,
        bankDeposit: 0,
        esewa: 0
      }
    } = receiptData;

    const receiptDate = date || this.formatDate(new Date());
    const safePartyName = this.escapeXml(partyName);
    const safeVoucherType = this.escapeXml(voucherType);
    const safeNarration = this.escapeXml(narration);
    const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';

    // Calculate total from payment modes
    const totalAmount =
      (parseFloat(paymentModes.cashTeller1) || 0) +
      (parseFloat(paymentModes.cashTeller2) || 0) +
      (parseFloat(paymentModes.chequeReceipt) || 0) +
      (parseFloat(paymentModes.qrCode) || 0) +
      (parseFloat(paymentModes.discount) || 0) +
      (parseFloat(paymentModes.bankDeposit) || 0) +
      (parseFloat(paymentModes.esewa) || 0);

    // Build ledger entries based on payment modes
    // Each payment mode has its own Tally ledger
    const ledgerEntries = [];

    // Cash Teller 1 entry (SFL1)
    if (parseFloat(paymentModes.cashTeller1) > 0) {
      ledgerEntries.push(`<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>Cash Teller 1</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>-${paymentModes.cashTeller1}</AMOUNT>
</ALLLEDGERENTRIES.LIST>`);
    }

    // Cash Teller 2 entry (SFL2)
    if (parseFloat(paymentModes.cashTeller2) > 0) {
      ledgerEntries.push(`<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>Cash Teller 2</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>-${paymentModes.cashTeller2}</AMOUNT>
</ALLLEDGERENTRIES.LIST>`);
    }

    // Cheque receipt entry (SFL3)
    if (parseFloat(paymentModes.chequeReceipt) > 0) {
      ledgerEntries.push(`<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>Cheque receipt</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>-${paymentModes.chequeReceipt}</AMOUNT>
</ALLLEDGERENTRIES.LIST>`);
    }

    // Q/R code entry (SFL4)
    if (parseFloat(paymentModes.qrCode) > 0) {
      ledgerEntries.push(`<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>Q/R code</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>-${paymentModes.qrCode}</AMOUNT>
</ALLLEDGERENTRIES.LIST>`);
    }

    // Discount entry (SFL5)
    if (parseFloat(paymentModes.discount) > 0) {
      ledgerEntries.push(`<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>Discount</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>-${paymentModes.discount}</AMOUNT>
</ALLLEDGERENTRIES.LIST>`);
    }

    // Bank Deposit(All) entry (SFL6)
    if (parseFloat(paymentModes.bankDeposit) > 0) {
      ledgerEntries.push(`<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>Bank Deposit(All)</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>-${paymentModes.bankDeposit}</AMOUNT>
</ALLLEDGERENTRIES.LIST>`);
    }

    // Esewa entry (SFL7)
    if (parseFloat(paymentModes.esewa) > 0) {
      ledgerEntries.push(`<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>Esewa</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>-${paymentModes.esewa}</AMOUNT>
</ALLLEDGERENTRIES.LIST>`);
    }

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
<BODY>
<DESC><STATICVARIABLES>${companyVar}</STATICVARIABLES></DESC>
<DATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="${safeVoucherType}" ACTION="Create">
<DATE>${receiptDate}</DATE>
<VOUCHERTYPENAME>${safeVoucherType}</VOUCHERTYPENAME>
<NARRATION>${safeNarration}</NARRATION>
<PARTYLEDGERNAME>${safePartyName}</PARTYLEDGERNAME>
<UDF:VCHNarr_AIARSM_SFL1.LIST><UDF:VCHNarr_AIARSM_SFL1>${paymentModes.cashTeller1 || 0}</UDF:VCHNarr_AIARSM_SFL1></UDF:VCHNarr_AIARSM_SFL1.LIST>
<UDF:VCHNarr_AIARSM_SFL2.LIST><UDF:VCHNarr_AIARSM_SFL2>${paymentModes.cashTeller2 || 0}</UDF:VCHNarr_AIARSM_SFL2></UDF:VCHNarr_AIARSM_SFL2.LIST>
<UDF:VCHNarr_AIARSM_SFL3.LIST><UDF:VCHNarr_AIARSM_SFL3>${paymentModes.chequeReceipt || 0}</UDF:VCHNarr_AIARSM_SFL3></UDF:VCHNarr_AIARSM_SFL3.LIST>
<UDF:VCHNarr_AIARSM_SFL4.LIST><UDF:VCHNarr_AIARSM_SFL4>${paymentModes.qrCode || 0}</UDF:VCHNarr_AIARSM_SFL4></UDF:VCHNarr_AIARSM_SFL4.LIST>
<UDF:VCHNarr_AIARSM_SFL5.LIST><UDF:VCHNarr_AIARSM_SFL5>${paymentModes.discount || 0}</UDF:VCHNarr_AIARSM_SFL5></UDF:VCHNarr_AIARSM_SFL5.LIST>
<UDF:VCHNarr_AIARSM_SFL6.LIST><UDF:VCHNarr_AIARSM_SFL6>${paymentModes.bankDeposit || 0}</UDF:VCHNarr_AIARSM_SFL6></UDF:VCHNarr_AIARSM_SFL6.LIST>
<UDF:VCHNarr_AIARSM_SFL7.LIST><UDF:VCHNarr_AIARSM_SFL7>${paymentModes.esewa || 0}</UDF:VCHNarr_AIARSM_SFL7></UDF:VCHNarr_AIARSM_SFL7.LIST>
<UDF:VCHNarr_AIARSM_SFLTot.LIST><UDF:VCHNarr_AIARSM_SFLTot>${totalAmount}</UDF:VCHNarr_AIARSM_SFLTot></UDF:VCHNarr_AIARSM_SFLTot.LIST>
${ledgerEntries.join('\n')}
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>${safePartyName}</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<AMOUNT>${totalAmount}</AMOUNT>
</ALLLEDGERENTRIES.LIST>
</VOUCHER>
</TALLYMESSAGE>
</DATA>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Creating ${voucherType} for ${partyName}, Total: ${totalAmount}`);
      console.log('Payment modes:', paymentModes);
      const response = await this.sendRequest(xml);
      const result = this.parseImportResponse(response);
      console.log('Receipt result:', result);
      return result;
    } catch (error) {
      console.error('Error creating receipt:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create simple Receipt Voucher in Tally (single payment mode)
   */
  async createReceipt(receiptData) {
    const {
      partyName,
      amount,
      paymentMode = 'Cash',
      billNumber = null,
      narration = 'Payment received via Dashboard'
    } = receiptData;

    const contraLedger = paymentMode === 'Cash' ? 'Cash' : paymentMode;
    const today = this.formatDate(new Date());

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
<BODY>
<DESC><STATICVARIABLES></STATICVARIABLES></DESC>
<DATA>
<TALLYMESSAGE>
<VOUCHER VCHTYPE="Receipt" ACTION="Create">
<DATE>${today}</DATE>
<VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
<NARRATION>${narration}</NARRATION>
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>${contraLedger}</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>-${Math.abs(amount)}</AMOUNT>
</ALLLEDGERENTRIES.LIST>
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>${partyName}</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<AMOUNT>${Math.abs(amount)}</AMOUNT>
${billNumber ? `<BILLALLOCATIONS.LIST><NAME>${billNumber}</NAME><BILLTYPE>Agst Ref</BILLTYPE><AMOUNT>${Math.abs(amount)}</AMOUNT></BILLALLOCATIONS.LIST>` : ''}
</ALLLEDGERENTRIES.LIST>
</VOUCHER>
</TALLYMESSAGE>
</DATA>
</BODY>
</ENVELOPE>`;

    try {
      const response = await this.sendRequest(xml);
      return this.parseImportResponse(response);
    } catch (error) {
      console.error('Error creating receipt:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse import response
   */
  parseImportResponse(response) {
    try {
      console.log('Import response:', JSON.stringify(response, null, 2));

      // NEW: Check for direct RESPONSE format (returned by "Import Data" requests)
      const directResponse = response?.RESPONSE;
      if (directResponse) {
        const created = parseInt(directResponse.CREATED) || 0;
        const altered = parseInt(directResponse.ALTERED) || 0;
        const errors = parseInt(directResponse.ERRORS) || 0;
        const exceptions = parseInt(directResponse.EXCEPTIONS) || 0;
        const lastVchId = directResponse.LASTVCHID;

        console.log(`Direct RESPONSE format: created=${created}, altered=${altered}, exceptions=${exceptions}, lastVchId=${lastVchId}`);

        if (created > 0 || altered > 0) {
          return {
            success: true,
            created,
            altered,
            errors,
            voucherId: lastVchId,
            message: `Success: ${altered > 0 ? 'altered' : 'created'}`
          };
        }

        if (exceptions > 0) {
          return { success: false, error: 'Operation failed with exceptions', created, altered, errors, exceptions };
        }

        return { success: false, error: 'No records were created or altered', created: 0, altered: 0 };
      }

      // FIRST: Check for IMPORTRESULT in DATA - this is the most reliable indicator
      const importResult = response?.ENVELOPE?.BODY?.DATA?.IMPORTRESULT;

      if (importResult) {
        const created = parseInt(importResult.CREATED) || 0;
        const errors = parseInt(importResult.ERRORS) || 0;
        const altered = parseInt(importResult.ALTERED) || 0;
        const exceptions = parseInt(importResult.EXCEPTIONS) || 0;
        const lineError = importResult.LINEERROR;

        // Check for line errors FIRST - this indicates the operation failed
        if (lineError) {
          console.error('Tally line error:', lineError);
          return { success: false, error: lineError, created, altered, errors, exceptions };
        }

        // Check for exceptions (errors that don't have LINEERROR)
        if (exceptions > 0 && created === 0 && altered === 0) {
          console.error('Tally operation had exceptions');
          return { success: false, error: 'Operation failed with exceptions', created, altered, errors, exceptions };
        }

        if (created > 0 || altered > 0) {
          // Get the voucher ID if available
          const lastVchId = response?.ENVELOPE?.BODY?.DESC?.CMPINFO?.IDINFO?.LASTVCHID ||
                            response?.ENVELOPE?.BODY?.DESC?.CMPINFOEX?.IDINFO?.LASTCREATEDVCHID;
          return {
            success: true,
            created,
            altered,
            errors,
            voucherId: lastVchId,
            message: 'Success'
          };
        }

        if (errors > 0) {
          return { success: false, error: 'Import failed with errors', errors };
        }

        // IMPORTRESULT exists but nothing was created/altered
        console.log('IMPORTRESULT shows no changes: created=0, altered=0');
        return { success: false, error: 'No records were created or altered', created: 0, altered: 0 };
      }

      // SECOND: Check for LASTCREATEDVCHID only if no IMPORTRESULT (for simple Create operations)
      const lastVchId = response?.ENVELOPE?.BODY?.DESC?.CMPINFO?.IDINFO?.LASTVCHID ||
                        response?.ENVELOPE?.BODY?.DESC?.CMPINFOEX?.IDINFO?.LASTCREATEDVCHID;
      // Only trust this if it's non-zero and there was no IMPORTRESULT
      if (lastVchId && lastVchId !== '0' && parseInt(lastVchId) > 0) {
        console.log('Voucher created with ID (no IMPORTRESULT):', lastVchId);
        return { success: true, created: 1, voucherId: lastVchId };
      }

      // Check for line errors at top level
      const lineError = response?.ENVELOPE?.BODY?.DATA?.LINEERROR;
      if (lineError) {
        console.error('Tally line error:', lineError);
        return { success: false, error: lineError };
      }

      // Check for other error formats
      const errorMsg = response?.ENVELOPE?.BODY?.DATA?.ERRORMSG ||
                       response?.ENVELOPE?.ERRORMSG ||
                       response?.ENVELOPE?.BODY?.DESC?.CMPINFO?.ERRORMSG;
      if (errorMsg) {
        console.error('Tally error:', errorMsg);
        return { success: false, error: errorMsg };
      }

      // Check for status in header - STATUS=1 only means request was received
      // It does NOT mean records were created/altered - need explicit confirmation
      const status = response?.ENVELOPE?.HEADER?.STATUS;
      if (status === '1' || status === 1) {
        // STATUS=1 just means request was processed, not that anything was changed
        // For Create operations, we need LASTCREATEDVCHID or IMPORTRESULT
        // For Alter operations, we need IMPORTRESULT with altered > 0
        console.log('Tally returned STATUS=1 but no explicit create/alter confirmation');
        return { success: false, error: 'No records were created or altered', status: 1 };
      }

      // Log full response for debugging
      console.log('Unknown response format - no success indicators found');
      return { success: false, error: 'Unknown response format from Tally' };
    } catch (error) {
      console.error('Parse error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Format date to YYYYMMDD
   */
  formatDate(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  /**
   * Escape XML special characters
   */
  escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Get all godowns (warehouses) from Tally
   */
  async getGodowns() {
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>GodownList</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="GodownList" ISMODIFY="No">
<TYPE>Godown</TYPE>
<FETCH>NAME,PARENT</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      console.log('Fetching godowns from Tally...');
      const response = await this.sendRequest(xml);
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) return [];

      let godowns = collection.GODOWN;
      if (!godowns) return [];

      godowns = Array.isArray(godowns) ? godowns : [godowns];
      return godowns.map(g => {
        let name = '';
        if (g.$?.NAME) name = g.$.NAME;
        else if (g.NAME?._) name = g.NAME._;
        else if (typeof g.NAME === 'string') name = g.NAME;
        else if (g._) name = g._;

        return {
          name: String(name),
          parent: g.PARENT?._ || g.PARENT || ''
        };
      }).filter(g => g.name);
    } catch (error) {
      console.error('Error fetching godowns:', error.message);
      return [];
    }
  }

  /**
   * Get Pending Sales Bills from Tally
   * These are bills waiting for payment confirmation
   * Uses Collection export for reliable data retrieval
   */
  async getPendingSalesBills() {
    const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';

    // Use Collection export - more reliable than TDL reports
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>PendingSalesBills</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="PendingSalesBills">
<TYPE>Voucher</TYPE>
<NATIVEMETHOD>MasterId,VoucherNumber,Date,PartyLedgerName,Amount,Narration,Guid,AlterId</NATIVEMETHOD>
<FILTER>IsPendingSale,NotCancelled</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="IsPendingSale">$VOUCHERTYPENAME = "Pending Sales Bill"</SYSTEM>
<SYSTEM TYPE="Formulae" NAME="NotCancelled">$IsCancelled = No</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      console.log('Fetching pending sales bills from Tally...');
      const response = await this.sendRequest(xml);
      return this.parsePendingSalesBills(response);
    } catch (error) {
      console.error('Error fetching pending sales bills:', error.message);
      return [];
    }
  }

  /**
   * Parse pending sales bills from Collection response
   * Response structure: ENVELOPE.BODY.DATA.COLLECTION.VOUCHER[]
   */
  parsePendingSalesBills(response) {
    try {
      // Get vouchers from Collection response
      let vouchers = response?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER;

      if (!vouchers) {
        console.log('No pending sales bills found');
        return [];
      }

      if (!Array.isArray(vouchers)) vouchers = [vouchers];

      return vouchers.map(v => {
        // Parse date (format: YYYYMMDD)
        let dateStr = '';
        const rawDate = v.DATE?._ || v.DATE;
        if (rawDate) {
          dateStr = String(rawDate).trim();
          // Convert YYYYMMDD to DD/MM/YYYY
          if (dateStr.length === 8 && !dateStr.includes('-')) {
            dateStr = `${dateStr.slice(6, 8)}/${dateStr.slice(4, 6)}/${dateStr.slice(0, 4)}`;
          }
        }

        // Parse amount (may be negative in Tally)
        let amount = 0;
        const rawAmount = v.AMOUNT?._ || v.AMOUNT;
        if (rawAmount) {
          amount = parseFloat(String(rawAmount).replace(/[^0-9.-]/g, '')) || 0;
        }

        // Get party name
        const partyName = v.PARTYLEDGERNAME?._ || v.PARTYLEDGERNAME || '';

        // Get master ID (may have leading space)
        const masterId = String(v.MASTERID?._ || v.MASTERID || '').trim();

        // Get narration (handle empty object case)
        let narration = v.NARRATION?._ || v.NARRATION || '';
        if (typeof narration === 'object') narration = '';

        return {
          masterId,
          voucherNumber: v.VOUCHERNUMBER?._ || v.VOUCHERNUMBER || '',
          date: dateStr,
          partyName: typeof partyName === 'string' ? partyName : '',
          amount: Math.abs(amount),
          narration,
          guid: v.GUID?._ || v.GUID || '',
          alterId: parseInt(v.ALTERID?._ || v.ALTERID) || 0,
          // UDF fields not available in Collection export
          sfl1: 0,
          sfl2: 0,
          sfl3: 0,
          sfl4: 0,
          sfl5: 0,
          sfl6: 0,
          sfl7: 0,
          sflTot: 0
        };
      }).filter(v => v.masterId && v.voucherNumber);
    } catch (error) {
      console.error('Error parsing pending sales bills:', error);
      return [];
    }
  }

  /**
   * Get complete voucher data from Tally by MASTERID
   * Fetches all voucher details including inventory entries, ledger entries, etc.
   * This is needed for the export-delete-recreate workflow
   */
  async getCompleteVoucher(masterId) {
    const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';

    // Fetch complete voucher data using Object export
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Object</TYPE><ID>Vouchers</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
<MASTERID>${masterId}</MASTERID>
</STATICVARIABLES>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Fetching complete voucher data for MASTERID: ${masterId}`);
      const response = await this.sendRequest(xml);

      // Extract voucher from response
      const voucher = response?.ENVELOPE?.BODY?.DATA?.TALLYMESSAGE?.VOUCHER;
      if (!voucher) {
        console.log('Voucher not found in Object export, trying Collection...');
        return await this.getCompleteVoucherViaCollection(masterId);
      }

      console.log('Complete voucher data retrieved');
      return { success: true, voucher, rawResponse: response };
    } catch (error) {
      console.error('Error fetching complete voucher:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Alternative method to get complete voucher via Collection with all fields
   */
  async getCompleteVoucherViaCollection(masterId) {
    const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>CompleteVoucher</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="CompleteVoucher">
<TYPE>Voucher</TYPE>
<FILTER>MatchMasterId</FILTER>
<FETCH>*</FETCH>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="MatchMasterId">$MASTERID = ${masterId}</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Fetching voucher via Collection for MASTERID: ${masterId}`);
      const response = await this.sendRequest(xml);

      let voucher = response?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER;
      if (Array.isArray(voucher)) voucher = voucher[0];

      if (!voucher) {
        return { success: false, error: 'Voucher not found' };
      }

      console.log('Complete voucher data retrieved via Collection');
      return { success: true, voucher, rawResponse: response };
    } catch (error) {
      console.error('Error fetching voucher via Collection:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Delete a voucher from Tally by MASTERID
   */
  async deleteVoucher(masterId, voucherType = 'Pending Sales Bill') {
    const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';
    const safeVoucherType = this.escapeXml(voucherType);

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
<BODY>
<DESC><STATICVARIABLES>${companyVar}</STATICVARIABLES></DESC>
<DATA>
<TALLYMESSAGE>
<VOUCHER REMOTEID="${masterId}" VCHTYPE="${safeVoucherType}" ACTION="Delete">
</VOUCHER>
</TALLYMESSAGE>
</DATA>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Deleting voucher with MASTERID: ${masterId}, Type: ${voucherType}`);
      const response = await this.sendRequest(xml);
      const result = this.parseImportResponse(response);
      console.log('Delete voucher result:', result);
      return result;
    } catch (error) {
      console.error('Error deleting voucher:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Complete payment on a Pending Sales Bill - EDIT ONLY (no deletion)
   *
   * IMPORTANT: Tally Prime XML API has a limitation - voucher TYPE cannot be changed
   * for invoice vouchers with inventory entries. So we:
   * 1. Update ONLY the UDF fields (SFL1-SFL7, SFLTot) with payment breakdown
   * 2. Keep the voucher as "Pending Sales Bill"
   * 3. The UDF fields track that payment was received
   *
   * The voucher remains "Pending Sales Bill" but SFLTot > 0 indicates payment received
   */
  async completePaymentOnBill(data) {
    const {
      masterId,
      guid,
      date,
      voucherNumber,
      partyName,
      amount,
      newVoucherType = 'Sales', // Note: Type change may not work due to Tally limitation
      paymentModes = {
        cashTeller1: 0,
        cashTeller2: 0,
        chequeReceipt: 0,
        qrCode: 0,
        discount: 0,
        bankDeposit: 0,
        esewa: 0
      }
    } = data;

    if (!masterId && !guid) {
      return { success: false, error: 'MASTERID or GUID required' };
    }

    const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';

    // Calculate UDF totals
    const sfl1 = parseFloat(paymentModes.cashTeller1) || 0;
    const sfl2 = parseFloat(paymentModes.cashTeller2) || 0;
    const sfl3 = parseFloat(paymentModes.chequeReceipt) || 0;
    const sfl4 = parseFloat(paymentModes.qrCode) || 0;
    const sfl5 = parseFloat(paymentModes.discount) || 0;
    const sfl6 = parseFloat(paymentModes.bankDeposit) || 0;
    const sfl7 = parseFloat(paymentModes.esewa) || 0;
    const sflTot = sfl1 + sfl2 + sfl3 + sfl4 + sfl5 + sfl6 + sfl7;

    console.log('=== COMPLETE PAYMENT ON BILL ===');
    console.log(`MasterID: ${masterId}, GUID: ${guid}`);
    console.log(`Voucher: ${voucherNumber}, Party: ${partyName}`);
    console.log(`UDF Values: SFL1=${sfl1}, SFL2=${sfl2}, SFL3=${sfl3}, SFL4=${sfl4}, SFL5=${sfl5}, SFL6=${sfl6}, SFL7=${sfl7}, Tot=${sflTot}`);

    // Convert date to YYYYMMDD format if needed
    let vchDate = date;
    if (date && date.includes('/')) {
      // DD/MM/YYYY to YYYYMMDD
      vchDate = date.split('/').reverse().join('');
    }
    // Use today if no date
    if (!vchDate) {
      const today = new Date();
      vchDate = `${today.getFullYear()}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getDate()).padStart(2,'0')}`;
    }

    console.log(`Voucher date for alter: ${vchDate}`);

    // Determine new voucher type based on payment amount
    const targetVoucherType = sflTot >= (amount || 0) ? 'Sales' : 'Credit Sales';
    console.log(`Target voucher type: ${targetVoucherType} (payment=${sflTot}, billAmount=${amount})`);

    // Method 1: Try using "Import Data" format with MASTERID inside voucher tag
    // This is the correct Tally format for altering vouchers
    console.log('Attempt 1: Using Import Data format with MASTERID...');
    const alterXml1 = `<ENVELOPE>
<HEADER>
<TALLYREQUEST>Import Data</TALLYREQUEST>
</HEADER>
<BODY>
<IMPORTDATA>
<REQUESTDESC>
<REPORTNAME>Vouchers</REPORTNAME>
${companyVar ? `<STATICVARIABLES>${companyVar}</STATICVARIABLES>` : ''}
</REQUESTDESC>
<REQUESTDATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER REMOTEID="${masterId}" Action="Alter">
<MASTERID>${masterId}</MASTERID>
<DATE>${vchDate}</DATE>
<VOUCHERTYPENAME>${targetVoucherType}</VOUCHERTYPENAME>
<UDF:VCHNarr_AIARSM_SFL1.LIST><UDF:VCHNarr_AIARSM_SFL1>${sfl1}</UDF:VCHNarr_AIARSM_SFL1></UDF:VCHNarr_AIARSM_SFL1.LIST>
<UDF:VCHNarr_AIARSM_SFL2.LIST><UDF:VCHNarr_AIARSM_SFL2>${sfl2}</UDF:VCHNarr_AIARSM_SFL2></UDF:VCHNarr_AIARSM_SFL2.LIST>
<UDF:VCHNarr_AIARSM_SFL3.LIST><UDF:VCHNarr_AIARSM_SFL3>${sfl3}</UDF:VCHNarr_AIARSM_SFL3></UDF:VCHNarr_AIARSM_SFL3.LIST>
<UDF:VCHNarr_AIARSM_SFL4.LIST><UDF:VCHNarr_AIARSM_SFL4>${sfl4}</UDF:VCHNarr_AIARSM_SFL4></UDF:VCHNarr_AIARSM_SFL4.LIST>
<UDF:VCHNarr_AIARSM_SFL5.LIST><UDF:VCHNarr_AIARSM_SFL5>${sfl5}</UDF:VCHNarr_AIARSM_SFL5></UDF:VCHNarr_AIARSM_SFL5.LIST>
<UDF:VCHNarr_AIARSM_SFL6.LIST><UDF:VCHNarr_AIARSM_SFL6>${sfl6}</UDF:VCHNarr_AIARSM_SFL6></UDF:VCHNarr_AIARSM_SFL6.LIST>
<UDF:VCHNarr_AIARSM_SFL7.LIST><UDF:VCHNarr_AIARSM_SFL7>${sfl7}</UDF:VCHNarr_AIARSM_SFL7></UDF:VCHNarr_AIARSM_SFL7.LIST>
<UDF:VCHNarr_AIARSM_SFLTot.LIST><UDF:VCHNarr_AIARSM_SFLTot>${sflTot}</UDF:VCHNarr_AIARSM_SFLTot></UDF:VCHNarr_AIARSM_SFLTot.LIST>
</VOUCHER>
</TALLYMESSAGE>
</REQUESTDATA>
</IMPORTDATA>
</BODY>
</ENVELOPE>`;

    try {
      console.log('Sending ALTER request with Import Data format...');
      const response1 = await this.sendRequest(alterXml1);
        console.log('Raw response:', JSON.stringify(response1, null, 2));
        const result1 = this.parseImportResponse(response1);
        console.log('Parse result:', result1);

      if (result1.success && (result1.altered > 0 || result1.created > 0)) {
        console.log('SUCCESS: Voucher altered using Import Data format');
        return { success: true, altered: result1.altered || 1, method: 'IMPORT_DATA' };
      }
    } catch (err) {
      console.error('Import Data method failed:', err.message);
    }

    // Method 2: Try alternate Import Data format with GUID
    if (guid) {
      console.log('Attempt 2: Using Import Data format with GUID...');
      const alterXml2 = `<ENVELOPE>
<HEADER>
<TALLYREQUEST>Import Data</TALLYREQUEST>
</HEADER>
<BODY>
<IMPORTDATA>
<REQUESTDESC>
<REPORTNAME>Vouchers</REPORTNAME>
${companyVar ? `<STATICVARIABLES>${companyVar}</STATICVARIABLES>` : ''}
</REQUESTDESC>
<REQUESTDATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER REMOTEID="${guid}" Action="Alter">
<GUID>${guid}</GUID>
<DATE>${vchDate}</DATE>
<VOUCHERTYPENAME>${targetVoucherType}</VOUCHERTYPENAME>
<UDF:VCHNarr_AIARSM_SFL1.LIST><UDF:VCHNarr_AIARSM_SFL1>${sfl1}</UDF:VCHNarr_AIARSM_SFL1></UDF:VCHNarr_AIARSM_SFL1.LIST>
<UDF:VCHNarr_AIARSM_SFL2.LIST><UDF:VCHNarr_AIARSM_SFL2>${sfl2}</UDF:VCHNarr_AIARSM_SFL2></UDF:VCHNarr_AIARSM_SFL2.LIST>
<UDF:VCHNarr_AIARSM_SFL3.LIST><UDF:VCHNarr_AIARSM_SFL3>${sfl3}</UDF:VCHNarr_AIARSM_SFL3></UDF:VCHNarr_AIARSM_SFL3.LIST>
<UDF:VCHNarr_AIARSM_SFL4.LIST><UDF:VCHNarr_AIARSM_SFL4>${sfl4}</UDF:VCHNarr_AIARSM_SFL4></UDF:VCHNarr_AIARSM_SFL4.LIST>
<UDF:VCHNarr_AIARSM_SFL5.LIST><UDF:VCHNarr_AIARSM_SFL5>${sfl5}</UDF:VCHNarr_AIARSM_SFL5></UDF:VCHNarr_AIARSM_SFL5.LIST>
<UDF:VCHNarr_AIARSM_SFL6.LIST><UDF:VCHNarr_AIARSM_SFL6>${sfl6}</UDF:VCHNarr_AIARSM_SFL6></UDF:VCHNarr_AIARSM_SFL6.LIST>
<UDF:VCHNarr_AIARSM_SFL7.LIST><UDF:VCHNarr_AIARSM_SFL7>${sfl7}</UDF:VCHNarr_AIARSM_SFL7></UDF:VCHNarr_AIARSM_SFL7.LIST>
<UDF:VCHNarr_AIARSM_SFLTot.LIST><UDF:VCHNarr_AIARSM_SFLTot>${sflTot}</UDF:VCHNarr_AIARSM_SFLTot></UDF:VCHNarr_AIARSM_SFLTot.LIST>
</VOUCHER>
</TALLYMESSAGE>
</REQUESTDATA>
</IMPORTDATA>
</BODY>
</ENVELOPE>`;

      try {
        console.log('Sending ALTER request with GUID...');
        const response2 = await this.sendRequest(alterXml2);
        console.log('Raw response:', JSON.stringify(response2, null, 2));
        const result2 = this.parseImportResponse(response2);
        console.log('Parse result:', result2);

        if (result2.success && (result2.altered > 0 || result2.created > 0)) {
          console.log('SUCCESS: Voucher altered using GUID');
          return { success: true, altered: result2.altered || 1, method: 'GUID' };
        }
      } catch (err) {
        console.error('GUID method failed:', err.message);
      }
    }

    // Method 3: Try old format with MASTERID attribute
    console.log('Attempt 3: Using old format with MASTERID attribute...');
    const alterXml3 = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
<BODY>
<DESC><STATICVARIABLES>${companyVar}</STATICVARIABLES></DESC>
<DATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER MASTERID="${masterId}" VCHTYPE="Pending Sales Bill" ACTION="Alter">
<DATE>${vchDate}</DATE>
<VOUCHERTYPENAME>${targetVoucherType}</VOUCHERTYPENAME>
<UDF:VCHNarr_AIARSM_SFL1.LIST><UDF:VCHNarr_AIARSM_SFL1>${sfl1}</UDF:VCHNarr_AIARSM_SFL1></UDF:VCHNarr_AIARSM_SFL1.LIST>
<UDF:VCHNarr_AIARSM_SFL2.LIST><UDF:VCHNarr_AIARSM_SFL2>${sfl2}</UDF:VCHNarr_AIARSM_SFL2></UDF:VCHNarr_AIARSM_SFL2.LIST>
<UDF:VCHNarr_AIARSM_SFL3.LIST><UDF:VCHNarr_AIARSM_SFL3>${sfl3}</UDF:VCHNarr_AIARSM_SFL3></UDF:VCHNarr_AIARSM_SFL3.LIST>
<UDF:VCHNarr_AIARSM_SFL4.LIST><UDF:VCHNarr_AIARSM_SFL4>${sfl4}</UDF:VCHNarr_AIARSM_SFL4></UDF:VCHNarr_AIARSM_SFL4.LIST>
<UDF:VCHNarr_AIARSM_SFL5.LIST><UDF:VCHNarr_AIARSM_SFL5>${sfl5}</UDF:VCHNarr_AIARSM_SFL5></UDF:VCHNarr_AIARSM_SFL5.LIST>
<UDF:VCHNARR_AIARSM_SFL6.LIST><UDF:VCHNARR_AIARSM_SFL6>${sfl6}</UDF:VCHNARR_AIARSM_SFL6></UDF:VCHNARR_AIARSM_SFL6.LIST>
<UDF:VCHNARR_AIARSM_SFL7.LIST><UDF:VCHNARR_AIARSM_SFL7>${sfl7}</UDF:VCHNARR_AIARSM_SFL7></UDF:VCHNARR_AIARSM_SFL7.LIST>
<UDF:VCHNARR_AIARSM_SFLTOT.LIST><UDF:VCHNARR_AIARSM_SFLTOT>${sflTot}</UDF:VCHNARR_AIARSM_SFLTOT></UDF:VCHNARR_AIARSM_SFLTOT.LIST>
</VOUCHER>
</TALLYMESSAGE>
</DATA>
</BODY>
</ENVELOPE>`;

    try {
      console.log('Sending ALTER request with MASTERID attribute...');
      const response3 = await this.sendRequest(alterXml3);
      console.log('Raw response:', JSON.stringify(response3, null, 2));
      const result3 = this.parseImportResponse(response3);
      console.log('Parse result:', result3);

      if (result3.success && (result3.altered > 0 || result3.created > 0)) {
        console.log('SUCCESS: Voucher altered using MASTERID attribute');
        return { success: true, altered: result3.altered || 1, method: 'MASTERID_ATTR' };
      }
    } catch (err) {
      console.error('MASTERID attribute method failed:', err.message);
    }

    // All ALTER methods failed - this is expected for Invoice vouchers in Tally
    // Fallback: Create a Receipt voucher instead to record the payment
    console.log('ALTER failed - creating Receipt voucher as fallback...');

    try {
      // Create Receipt with payment breakdown using UDF fields
      const receiptResult = await this.createReceiptWithPaymentModes({
        partyName,
        amount: sflTot,  // Total payment amount
        billNumber: voucherNumber,
        narration: `Payment for ${voucherNumber}`,
        paymentModes: {
          cashTeller1: sfl1,
          cashTeller2: sfl2,
          chequeReceipt: sfl3,
          qrCode: sfl4,
          discount: sfl5,
          bankDeposit: sfl6,
          esewa: sfl7
        }
      });

      if (receiptResult.success) {
        console.log('Receipt created successfully as fallback');
        return {
          success: true,
          altered: 0,
          created: 1,
          method: 'RECEIPT_FALLBACK',
          message: 'Created Receipt voucher (UDF update not supported for Invoice vouchers)'
        };
      }
    } catch (err) {
      console.error('Receipt creation failed:', err.message);
    }

    // Final failure
    console.error('All methods failed including Receipt creation.');
    return {
      success: false,
      error: 'Could not update voucher or create receipt. Please check Tally directly.'
    };
  }

  /**
   * Alter a voucher to update payment details and change voucher type
   * Updates UDF fields (SFL1-SFL7, SFLTot) and changes type based on payment:
   * - Full Payment (payment >= bill amount) → "Sales"
   * - Partial Payment (payment < bill amount) → "Credit Sales"
   *
   * @param {Object} data - Voucher update data
   * @param {string} data.masterId - Tally MASTERID of the voucher
   * @param {string} data.voucherNumber - Voucher number (for reference)
   * @param {string} data.newVoucherType - New voucher type (Sales or Credit Sales)
   * @param {string} data.originalVoucherType - Original voucher type (default: Pending Sales Bill)
   * @param {Object} data.paymentModes - Payment breakdown:
   *   - cashTeller1: Cash Teller 1
   *   - cashTeller2: Cash Teller 2
   *   - chequeReceipt: Cheque receipt
   *   - qrCode: Q/R code
   *   - discount: Discount
   *   - bankDeposit: Bank Deposit(All)
   *   - esewa: Esewa
   */
  async alterVoucherWithPayment(data) {
    const {
      masterId,
      voucherNumber,
      newVoucherType = 'Sales',
      originalVoucherType = 'Pending Sales Bill',
      paymentModes = {
        cashTeller1: 0,
        cashTeller2: 0,
        chequeReceipt: 0,
        qrCode: 0,
        discount: 0,
        bankDeposit: 0,
        esewa: 0
      }
    } = data;

    if (!masterId) {
      return { success: false, error: 'MASTERID is required to alter voucher' };
    }

    const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';
    const safeNewVoucherType = this.escapeXml(newVoucherType);
    const safeOriginalVoucherType = this.escapeXml(originalVoucherType);

    // Calculate total from payment modes (SFLTot = sum of SFL1-SFL7)
    const sfl1 = parseFloat(paymentModes.cashTeller1) || 0;    // Cash Teller 1
    const sfl2 = parseFloat(paymentModes.cashTeller2) || 0;    // Cash Teller 2
    const sfl3 = parseFloat(paymentModes.chequeReceipt) || 0;  // Cheque receipt
    const sfl4 = parseFloat(paymentModes.qrCode) || 0;         // Q/R code
    const sfl5 = parseFloat(paymentModes.discount) || 0;       // Discount
    const sfl6 = parseFloat(paymentModes.bankDeposit) || 0;    // Bank Deposit(All)
    const sfl7 = parseFloat(paymentModes.esewa) || 0;          // Esewa
    const sflTot = sfl1 + sfl2 + sfl3 + sfl4 + sfl5 + sfl6 + sfl7;

    // Tally XML for altering voucher:
    // - VCHTYPE attribute should be ORIGINAL voucher type for identification
    // - VOUCHERTYPENAME element changes the type to new type
    // - REMOTEID uses MASTERID for voucher identification
    // - ACTION="Alter" tells Tally to modify existing voucher
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
<BODY>
<DESC><STATICVARIABLES>${companyVar}</STATICVARIABLES></DESC>
<DATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER REMOTEID="${masterId}" VCHTYPE="${safeOriginalVoucherType}" ACTION="Alter">
<VOUCHERTYPENAME>${safeNewVoucherType}</VOUCHERTYPENAME>
<UDF:VCHNARR_AIARSM_SFL1.LIST><UDF:VCHNARR_AIARSM_SFL1>${sfl1}</UDF:VCHNARR_AIARSM_SFL1></UDF:VCHNARR_AIARSM_SFL1.LIST>
<UDF:VCHNARR_AIARSM_SFL2.LIST><UDF:VCHNARR_AIARSM_SFL2>${sfl2}</UDF:VCHNARR_AIARSM_SFL2></UDF:VCHNARR_AIARSM_SFL2.LIST>
<UDF:VCHNARR_AIARSM_SFL3.LIST><UDF:VCHNARR_AIARSM_SFL3>${sfl3}</UDF:VCHNARR_AIARSM_SFL3></UDF:VCHNARR_AIARSM_SFL3.LIST>
<UDF:VCHNARR_AIARSM_SFL4.LIST><UDF:VCHNARR_AIARSM_SFL4>${sfl4}</UDF:VCHNARR_AIARSM_SFL4></UDF:VCHNARR_AIARSM_SFL4.LIST>
<UDF:VCHNARR_AIARSM_SFL5.LIST><UDF:VCHNARR_AIARSM_SFL5>${sfl5}</UDF:VCHNARR_AIARSM_SFL5></UDF:VCHNARR_AIARSM_SFL5.LIST>
<UDF:VCHNARR_AIARSM_SFL6.LIST><UDF:VCHNARR_AIARSM_SFL6>${sfl6}</UDF:VCHNARR_AIARSM_SFL6></UDF:VCHNARR_AIARSM_SFL6.LIST>
<UDF:VCHNARR_AIARSM_SFL7.LIST><UDF:VCHNARR_AIARSM_SFL7>${sfl7}</UDF:VCHNARR_AIARSM_SFL7></UDF:VCHNARR_AIARSM_SFL7.LIST>
<UDF:VCHNARR_AIARSM_SFLTOT.LIST><UDF:VCHNARR_AIARSM_SFLTOT>${sflTot}</UDF:VCHNARR_AIARSM_SFLTOT></UDF:VCHNARR_AIARSM_SFLTOT.LIST>
</VOUCHER>
</TALLYMESSAGE>
</DATA>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Altering voucher ${voucherNumber || masterId}:`);
      console.log(`  Original Type: ${originalVoucherType} -> New Type: ${newVoucherType}`);
      console.log(`  Payment UDF Fields:`);
      console.log(`    SFL1 (Cash Teller 1): ${sfl1}`);
      console.log(`    SFL2 (Cash Teller 2): ${sfl2}`);
      console.log(`    SFL3 (Cheque receipt): ${sfl3}`);
      console.log(`    SFL4 (Q/R code): ${sfl4}`);
      console.log(`    SFL5 (Discount): ${sfl5}`);
      console.log(`    SFL6 (Bank Deposit): ${sfl6}`);
      console.log(`    SFL7 (Esewa): ${sfl7}`);
      console.log(`    SFLTot (Total): ${sflTot}`);
      console.log('XML Request:', xml);

      const response = await this.sendRequest(xml);
      const result = this.parseImportResponse(response);
      console.log('Alter voucher result:', result);
      return result;
    } catch (error) {
      console.error('Error altering voucher:', error.message);
      return { success: false, error: error.message };
    }
  }
}

export const tallyConnector = new TallyConnector();
export default tallyConnector;
