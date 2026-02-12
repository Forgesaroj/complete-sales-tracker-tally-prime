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
import config from '../../config/default.js';
import { adToNepaliDateString } from '../../utils/nepaliDate.js';

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
  async sendRequest(xmlData, timeoutMs = 60000) {
    // Throttle requests to prevent overwhelming Tally
    await this.throttle();

    try {
      const response = await axios.post(this.baseUrl, xmlData, {
        headers: {
          'Content-Type': 'text/xml;charset=UTF-8'
        },
        timeout: timeoutMs
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
   * Send XML request to Tally and return raw XML string (no parsing)
   */
  async sendRawRequest(xmlData) {
    await this.throttle();
    try {
      const response = await axios.post(this.baseUrl, xmlData, {
        headers: { 'Content-Type': 'text/xml;charset=UTF-8' },
        timeout: 120000,
        responseType: 'text'
      });
      return response.data;
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
   * Includes UDF payment fields for critical bill detection
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
<FETCH>DATE,VOUCHERTYPENAME,VOUCHERNUMBER,PARTYLEDGERNAME,PARTYNAME,AMOUNT,NARRATION,GUID,MASTERID,ALTERID,ALTEREDDATE,PRIORDATE,VCHSTATUSDATE,ALLLEDGERENTRIES.LIST</FETCH>
<COMPUTE>UDFSFLTOT: $$AsAmount:$$String:$VCHNarr_AIARSM_SFLTot</COMPUTE>
<COMPUTE>UDFSFL3: $$AsAmount:$$String:$VCHNarr_AIARSM_SFL3</COMPUTE>
<COMPUTE>UDFSFL5: $$AsAmount:$$String:$VCHNarr_AIARSM_SFL5</COMPUTE>
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
   * Includes UDF payment fields for critical bill detection
   */
  async getVouchersIncremental(lastAlterId = 0, voucherTypes = null) {
    // Use ALTERID filter to only get new/changed vouchers
    // Also exclude cancelled and optional vouchers for cleaner data
    // Include UDF payment total for critical pending bill detection
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
<FETCH>DATE,VOUCHERTYPENAME,VOUCHERNUMBER,PARTYLEDGERNAME,PARTYNAME,AMOUNT,NARRATION,GUID,MASTERID,ALTERID,ALTEREDDATE,PRIORDATE,VCHSTATUSDATE,ALLLEDGERENTRIES.LIST</FETCH>
<COMPUTE>UDFSFLTOT: $$AsAmount:$$String:$VCHNarr_AIARSM_SFLTot</COMPUTE>
<COMPUTE>UDFSFL3: $$AsAmount:$$String:$VCHNarr_AIARSM_SFL3</COMPUTE>
<COMPUTE>UDFSFL5: $$AsAmount:$$String:$VCHNarr_AIARSM_SFL5</COMPUTE>
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
      // Quiet log - only log when there are new vouchers (parsed in caller)
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
      if (!collection) return [];

      let vouchers = collection.VOUCHER;
      if (!vouchers) return [];

      vouchers = Array.isArray(vouchers) ? vouchers : [vouchers];

      const parsed = vouchers.map(v => {
        // Handle different response formats
        const guid = v.GUID || v.$?.GUID || v.$?.REMOTEID || '';
        const safeStr = (val) => {
          if (val == null) return '';
          if (typeof val === 'string') return val;
          if (typeof val === 'number') return String(val);
          if (val._ != null) return String(val._);
          if (val.$ && Object.keys(val).length === 1) return '';
          return '';
        };
        const masterId = safeStr(v.MASTERID);
        const alterId = safeStr(v.ALTERID) || '0';
        const dateRaw = safeStr(v.DATE);
        const voucherType = safeStr(v.VOUCHERTYPENAME);
        const voucherNumber = safeStr(v.VOUCHERNUMBER);
        const partyLedgerName = safeStr(v.PARTYLEDGERNAME);
        const partyNameField = safeStr(v.PARTYNAME);
        // For Receipt-type vouchers, PARTYLEDGERNAME often returns cash/bank ledger.
        // Try PARTYNAME first, then extract from ledger entries (credit-side = party).
        const receiptTypes = ['Bank Receipt', 'Counter Receipt', 'Receipt', 'Dashboard Receipt'];
        let partyName = partyLedgerName || partyNameField;
        if (receiptTypes.includes(voucherType)) {
          if (partyNameField) {
            partyName = partyNameField;
          } else {
            // Extract party from ledger entries: the non-deemed-positive entry is the party
            let ledgerEntries = v['ALLLEDGERENTRIES.LIST'];
            if (ledgerEntries && !Array.isArray(ledgerEntries)) ledgerEntries = [ledgerEntries];
            if (ledgerEntries) {
              const partyEntry = ledgerEntries.find(le => {
                const deemed = safeStr(le.ISDEEMEDPOSITIVE);
                return deemed === 'No' || deemed === 'no';
              });
              if (partyEntry) {
                partyName = safeStr(partyEntry.LEDGERNAME);
              }
            }
          }
        }
        const amountRaw = safeStr(v.AMOUNT) || '0';
        let narration = safeStr(v.NARRATION);

        // Extract payment mode breakdown from ledger entries for receipt-type vouchers
        // Deemed-positive entries (Yes) = debit side = payment modes
        let payCash = 0, payQr = 0, payCheque = 0, payDiscount = 0, payEsewa = 0, payBankDeposit = 0;
        if (receiptTypes.includes(voucherType)) {
          let allEntries = v['ALLLEDGERENTRIES.LIST'];
          if (allEntries && !Array.isArray(allEntries)) allEntries = [allEntries];
          if (allEntries) {
            for (const le of allEntries) {
              const deemed = safeStr(le.ISDEEMEDPOSITIVE);
              if (deemed === 'Yes' || deemed === 'yes') {
                const ledgerName = safeStr(le.LEDGERNAME).toLowerCase();
                const amt = Math.abs(parseFloat(String(safeStr(le.AMOUNT)).replace(/[^\d.-]/g, '')) || 0);
                if (ledgerName.includes('cash teller') || ledgerName === 'cash') {
                  payCash += amt;
                } else if (ledgerName.includes('qr') || ledgerName.includes('q/r')) {
                  payQr += amt;
                } else if (ledgerName.includes('cheque')) {
                  payCheque += amt;
                } else if (ledgerName.includes('discount')) {
                  payDiscount += amt;
                } else if (ledgerName.includes('esewa') || ledgerName.includes('e-sewa')) {
                  payEsewa += amt;
                } else if (ledgerName.includes('bank deposit')) {
                  payBankDeposit += amt;
                } else {
                  // Unknown ledger - treat as cash
                  payCash += amt;
                }
              }
            }
          }
        }

        // Timestamp fields from Tally
        const alteredDate = v.ALTEREDDATE?._ || v.ALTEREDDATE || '';
        const priorDate = v.PRIORDATE?._ || v.PRIORDATE || '';
        const statusDate = v.VCHSTATUSDATE?._ || v.VCHSTATUSDATE || '';

        // Use PRIORDATE as creation date (when voucher was first entered)
        // ALTEREDDATE is when it was last modified
        const createdDate = priorDate || dateRaw;
        const entryTime = statusDate || alteredDate;

        // UDF payment fields (for critical pending bill detection)
        const udfSflTotRaw = v.UDFSFLTOT?._ || v.UDFSFLTOT || '0';
        const udfSfl3Raw = v.UDFSFL3?._ || v.UDFSFL3 || '0';
        const udfSfl5Raw = v.UDFSFL5?._ || v.UDFSFL5 || '0';
        const udfPaymentTotal = parseFloat(String(udfSflTotRaw).replace(/[^\d.-]/g, '')) || 0;
        const udfSfl3 = parseFloat(String(udfSfl3Raw).replace(/[^\d.-]/g, '')) || 0;
        const udfSfl5 = parseFloat(String(udfSfl5Raw).replace(/[^\d.-]/g, '')) || 0;

        return {
          guid: String(guid),
          masterId: String(masterId).trim(),
          alterId: parseInt(String(alterId).trim()) || 0,
          date: String(dateRaw),
          voucherType: String(voucherType),
          voucherNumber: String(voucherNumber),
          partyName: String(partyName),
          amount: parseFloat(String(amountRaw).replace(/[^\d.-]/g, '')) || 0,
          narration: String(narration),
          // Tally timestamps
          createdDate: String(createdDate),
          alteredDate: String(alteredDate),
          entryTime: String(entryTime),
          // UDF payment fields - if has value, bill is critical/exceptional
          udfPaymentTotal: Math.abs(udfPaymentTotal),
          udfSfl3: Math.abs(udfSfl3),
          udfSfl5: Math.abs(udfSfl5),
          // Payment mode breakdown (receipts only)
          payCash, payQr, payCheque, payDiscount, payEsewa, payBankDeposit
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
      if (!collection) return [];

      let items = collection.STOCKITEM;
      if (!items) return [];

      items = Array.isArray(items) ? items : [items];

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
      const response = await this.sendRequest(xml);
      return this.parseLedgers(response);
    } catch (error) {
      console.error('Error fetching ledgers:', error.message);
      return [];
    }
  }

  /**
   * Get all voucher types from Tally
   */
  async getVoucherTypes() {
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>VoucherTypeList</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES><SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT></STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="VoucherTypeList" ISMODIFY="No">
<TYPE>VoucherType</TYPE>
<FETCH>NAME,PARENT,NUMBERINGMETHOD</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      console.log('Fetching voucher types from Tally...');
      const response = await this.sendRequest(xml);
      return this.parseVoucherTypes(response);
    } catch (error) {
      console.error('Error fetching voucher types:', error.message);
      return [];
    }
  }

  /**
   * Parse voucher types response
   */
  parseVoucherTypes(response) {
    try {
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) return [];

      let types = collection.VOUCHERTYPE;
      if (!types) return [];

      types = Array.isArray(types) ? types : [types];

      return types.map(t => {
        let name = '';
        if (t.$?.NAME) name = t.$.NAME;
        else if (t.NAME?._) name = t.NAME._;
        else if (typeof t.NAME === 'string') name = t.NAME;
        else if (t._) name = t._;

        return {
          name: String(name),
          parent: t.PARENT?._ || t.PARENT || '',
          numberingMethod: t.NUMBERINGMETHOD?._ || t.NUMBERINGMETHOD || ''
        };
      }).filter(t => t.name);
    } catch (error) {
      console.error('Error parsing voucher types:', error);
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
      godown = 'Main Location',
      numPackages = '0All',  // Staff name from Agent Ledger
      staffName = null       // Alternative param for staff
    } = invoiceData;

    // Convert date to YYYYMMDD format (Tally format)
    let invoiceDate;
    if (date) {
      // Handle YYYY-MM-DD format from frontend
      invoiceDate = String(date).replace(/-/g, '');
      console.log(`[Invoice] Input date: "${date}" -> Tally format: "${invoiceDate}"`);
    } else {
      invoiceDate = this.formatDate(new Date());
      console.log(`[Invoice] No date provided, using today: "${invoiceDate}"`);
    }

    // Validate date format (must be 8 digits YYYYMMDD)
    if (!/^\d{8}$/.test(invoiceDate)) {
      console.error(`[Invoice] Invalid date format: "${invoiceDate}" (expected YYYYMMDD)`);
      invoiceDate = this.formatDate(new Date());
      console.log(`[Invoice] Falling back to today: "${invoiceDate}"`);
    }

    // Escape XML special characters
    const safePartyName = this.escapeXml(partyName);
    const safeSalesLedger = this.escapeXml(salesLedger);
    const safeNarration = this.escapeXml(narration);
    const safeVoucherType = this.escapeXml(voucherType);
    const safeGodown = this.escapeXml(godown);

    // Calculate totals
    const totalAmount = items.reduce((sum, item) => sum + (item.amount || item.quantity * item.rate), 0);

    // Build company variable if set
    const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';

    // Build inventory entries XML - positive amounts matching Tally native format
    const inventoryXml = items.map(item => {
      const qty = Math.abs(item.quantity || 1);
      const rate = Math.abs(item.rate || 0);
      const amount = Math.abs(item.amount || (qty * rate));
      const safeStockItem = this.escapeXml(item.stockItem);
      const safeUnit = this.escapeXml(item.unit || 'Nos');
      const itemGodown = item.godown ? this.escapeXml(item.godown) : safeGodown;

      return `<ALLINVENTORYENTRIES.LIST>
<STOCKITEMNAME>${safeStockItem}</STOCKITEMNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<ISLASTDEEMEDPOSITIVE>No</ISLASTDEEMEDPOSITIVE>
<ISAUTONEGATE>No</ISAUTONEGATE>
<RATE>${rate}/${safeUnit}</RATE>
<AMOUNT>${amount}</AMOUNT>
<ACTUALQTY> ${qty} ${safeUnit}</ACTUALQTY>
<BILLEDQTY> ${qty} ${safeUnit}</BILLEDQTY>
<BATCHALLOCATIONS.LIST>
<GODOWNNAME>${itemGodown}</GODOWNNAME>
<AMOUNT>${amount}</AMOUNT>
<ACTUALQTY> ${qty} ${safeUnit}</ACTUALQTY>
<BILLEDQTY> ${qty} ${safeUnit}</BILLEDQTY>
</BATCHALLOCATIONS.LIST>
<ACCOUNTINGALLOCATIONS.LIST>
<LEDGERNAME>${safeSalesLedger}</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<AMOUNT>${amount}</AMOUNT>
</ACCOUNTINGALLOCATIONS.LIST>
</ALLINVENTORYENTRIES.LIST>`;
    }).join('\n');

    // Generate Nepali date in DD-MM-YYYY format
    const nepaliDate = adToNepaliDateString(date || invoiceDate);
    const safeStaffName = this.escapeXml(staffName || numPackages || '0All');

    console.log(`[Invoice] Nepali date: ${nepaliDate}, Staff: ${safeStaffName}`);

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
<PARTYNAME>${safePartyName}</PARTYNAME>
<BUYERNAME>${safePartyName}</BUYERNAME>
<CONSIGNEENAME>${safePartyName}</CONSIGNEENAME>
<PARTYMAILINGNAME>${safePartyName}</PARTYMAILINGNAME>
<CONSIGNEEMAILINGNAME>${safePartyName}</CONSIGNEEMAILINGNAME>
<ISINVOICE>Yes</ISINVOICE>
<PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
<VCHENTRYMODE>Item Invoice</VCHENTRYMODE>
<UDF:NUMPACKAGES.LIST><UDF:NUMPACKAGES>${safeStaffName}</UDF:NUMPACKAGES></UDF:NUMPACKAGES.LIST>
<UDF:MINEPDATE.LIST><UDF:MINEPDATE>${nepaliDate}</UDF:MINEPDATE></UDF:MINEPDATE.LIST>
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
<FETCH>*, ALLINVENTORYENTRIES.LIST.STOCKITEMNAME, ALLINVENTORYENTRIES.LIST.ACTUALQTY, ALLINVENTORYENTRIES.LIST.BILLEDQTY, ALLINVENTORYENTRIES.LIST.RATE, ALLINVENTORYENTRIES.LIST.AMOUNT, ALLINVENTORYENTRIES.LIST.GODOWNNAME, ALLINVENTORYENTRIES.LIST.BATCHALLOCATIONS.LIST.GODOWNNAME, LEDGERENTRIES.LIST.LEDGERNAME, LEDGERENTRIES.LIST.AMOUNT</FETCH>
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
  async _createDashboardReceipt(partyName, voucherNumber, paymentModes, totalAmount) {
    try {
      console.log(`Creating Dashboard Receipt for ${partyName}, amount: ${totalAmount}`);
      const receiptResult = await this.createReceiptWithPaymentModes({
        partyName,
        voucherType: 'Dashboard Receipt',
        narration: `Payment for ${voucherNumber}`,
        paymentModes: {
          cashTeller1: parseFloat(paymentModes.cashTeller1) || 0,
          cashTeller2: parseFloat(paymentModes.cashTeller2) || 0,
          chequeReceipt: parseFloat(paymentModes.chequeReceipt) || 0,
          qrCode: parseFloat(paymentModes.qrCode) || 0,
          discount: parseFloat(paymentModes.discount) || 0,
          bankDeposit: parseFloat(paymentModes.bankDeposit) || 0,
          esewa: parseFloat(paymentModes.esewa) || 0
        }
      });
      if (receiptResult.success) {
        console.log('Dashboard Receipt created successfully');
      } else {
        console.error('Dashboard Receipt creation failed:', receiptResult.error);
      }
      return receiptResult;
    } catch (err) {
      console.error('Dashboard Receipt creation error:', err.message);
      return { success: false, error: err.message };
    }
  }

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
        // Also create Dashboard Receipt to record the payment
        await this._createDashboardReceipt(partyName, voucherNumber, paymentModes, sflTot);
        return { success: true, altered: result1.altered || 1, created: 1, method: 'IMPORT_DATA' };
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
          await this._createDashboardReceipt(partyName, voucherNumber, paymentModes, sflTot);
          return { success: true, altered: result2.altered || 1, created: 1, method: 'GUID' };
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
        await this._createDashboardReceipt(partyName, voucherNumber, paymentModes, sflTot);
        return { success: true, altered: result3.altered || 1, created: 1, method: 'MASTERID_ATTR' };
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

  // ==================== MULTI-COMPANY CHEQUE MANAGEMENT ====================

  /**
   * Create a cheque receipt in a specific Tally company
   * Used for pushing cheques to Cheque Management Company (ODBC CHq Mgmt)
   *
   * @param {Object} chequeData - Cheque details
   * @param {string} chequeData.partyName - Customer name (must exist in target company)
   * @param {number} chequeData.amount - Cheque amount
   * @param {string} chequeData.bankName - Bank name ledger in Tally
   * @param {string} chequeData.chequeNumber - Cheque number
   * @param {string} chequeData.chequeDate - Cheque date (YYYYMMDD)
   * @param {string} chequeData.narration - Narration/notes
   * @param {string} targetCompany - Target Tally company name (default: Cheque Management Company)
   */
  async createChequeReceipt(chequeData, targetCompany = 'ODBC CHq Mgmt') {
    const {
      partyName,
      amount,
      bankName = 'Cheque in Hand',
      chequeNumber = '',
      chequeDate = null,
      receivedDate = null,
      narration = ''
    } = chequeData;

    // Use cheque date or received date or today
    const voucherDate = chequeDate || receivedDate || this.formatDate(new Date());
    const safePartyName = this.escapeXml(partyName);
    const safeBankName = this.escapeXml(bankName);
    const safeChequeNumber = this.escapeXml(chequeNumber);
    const safeNarration = this.escapeXml(narration || `Cheque: ${chequeNumber} from ${partyName}`);

    // Use target company for this operation
    const companyVar = `<SVCURRENTCOMPANY>${this.escapeXml(targetCompany)}</SVCURRENTCOMPANY>`;

    // Create Receipt voucher with cheque details
    // Party (debtor) is credited, Bank/Cheque ledger is debited
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
<BODY>
<DESC><STATICVARIABLES>${companyVar}</STATICVARIABLES></DESC>
<DATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="Receipt" ACTION="Create">
<DATE>${voucherDate}</DATE>
<VOUCHERTYPENAME>Receipt</VOUCHERTYPENAME>
<NARRATION>${safeNarration}</NARRATION>
<PARTYLEDGERNAME>${safePartyName}</PARTYLEDGERNAME>
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>${safeBankName}</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>-${Math.abs(amount)}</AMOUNT>
<BANKALLOCATIONS.LIST>
<INSTRUMENTNUMBER>${safeChequeNumber}</INSTRUMENTNUMBER>
<INSTRUMENTDATE>${voucherDate}</INSTRUMENTDATE>
<AMOUNT>-${Math.abs(amount)}</AMOUNT>
<BANKERSDATE>${voucherDate}</BANKERSDATE>
</BANKALLOCATIONS.LIST>
</ALLLEDGERENTRIES.LIST>
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>${safePartyName}</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<AMOUNT>${Math.abs(amount)}</AMOUNT>
</ALLLEDGERENTRIES.LIST>
</VOUCHER>
</TALLYMESSAGE>
</DATA>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Creating cheque receipt in ${targetCompany}:`);
      console.log(`  Party: ${partyName}, Amount: ${amount}`);
      console.log(`  Cheque: ${chequeNumber}, Bank: ${bankName}`);
      console.log(`  Date: ${voucherDate}`);

      const response = await this.sendRequest(xml);
      const result = this.parseImportResponse(response);
      console.log('Cheque receipt result:', result);

      if (result.success) {
        result.company = targetCompany;
        result.chequeNumber = chequeNumber;
      }

      return result;
    } catch (error) {
      console.error('Error creating cheque receipt:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create Post-Dated Cheque (PDC) entry in Tally
   * PDC entries use a special ledger for tracking before deposit date
   */
  async createPDCEntry(chequeData, targetCompany = 'ODBC CHq Mgmt') {
    const {
      partyName,
      amount,
      chequeNumber = '',
      chequeDate,
      bankName = 'PDC Receivable',
      narration = ''
    } = chequeData;

    const receivedDate = this.formatDate(new Date());
    const safePartyName = this.escapeXml(partyName);
    const safeBankName = this.escapeXml(bankName);
    const safeChequeNumber = this.escapeXml(chequeNumber);
    const safeNarration = this.escapeXml(narration || `PDC: ${chequeNumber} from ${partyName}, Due: ${chequeDate}`);

    const companyVar = `<SVCURRENTCOMPANY>${this.escapeXml(targetCompany)}</SVCURRENTCOMPANY>`;

    // Journal entry: Debit PDC Receivable, Credit Party
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
<BODY>
<DESC><STATICVARIABLES>${companyVar}</STATICVARIABLES></DESC>
<DATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="Journal" ACTION="Create">
<DATE>${receivedDate}</DATE>
<VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
<NARRATION>${safeNarration}</NARRATION>
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>${safeBankName}</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>-${Math.abs(amount)}</AMOUNT>
</ALLLEDGERENTRIES.LIST>
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>${safePartyName}</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<AMOUNT>${Math.abs(amount)}</AMOUNT>
</ALLLEDGERENTRIES.LIST>
</VOUCHER>
</TALLYMESSAGE>
</DATA>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Creating PDC entry in ${targetCompany}:`);
      console.log(`  Party: ${partyName}, Amount: ${amount}`);
      console.log(`  Cheque: ${chequeNumber}, Due Date: ${chequeDate}`);

      const response = await this.sendRequest(xml);
      const result = this.parseImportResponse(response);
      console.log('PDC entry result:', result);

      if (result.success) {
        result.company = targetCompany;
        result.chequeNumber = chequeNumber;
        result.dueDate = chequeDate;
      }

      return result;
    } catch (error) {
      console.error('Error creating PDC entry:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get ledgers from a specific company
   * Used to verify party exists in Cheque Management Company
   */
  async getLedgersFromCompany(parentGroup = 'Sundry Debtors', targetCompany = null) {
    const companyVar = targetCompany
      ? `<SVCURRENTCOMPANY>${this.escapeXml(targetCompany)}</SVCURRENTCOMPANY>`
      : (this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '');

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>LedgerList</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="LedgerList" ISMODIFY="No">
<TYPE>Ledger</TYPE>
<BELONGSTO>Yes</BELONGSTO>
<CHILDOF>${parentGroup}</CHILDOF>
<FETCH>NAME,PARENT,CLOSINGBALANCE</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Fetching ledgers under ${parentGroup} from ${targetCompany || 'default company'}...`);
      const response = await this.sendRequest(xml);
      return this.parseLedgers(response);
    } catch (error) {
      console.error('Error fetching ledgers from company:', error.message);
      return [];
    }
  }

  /**
   * Get balance for a specific ledger from a company
   * Used for reconciliation between Cheque Receipt and Cheque Management
   */
  async getLedgerBalance(ledgerName, targetCompany = null) {
    const companyVar = targetCompany
      ? `<SVCURRENTCOMPANY>${this.escapeXml(targetCompany)}</SVCURRENTCOMPANY>`
      : (this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '');

    const safeName = this.escapeXml(ledgerName);

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>LedgerBal</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="LedgerBal" ISMODIFY="No">
<TYPE>Ledger</TYPE>
<FETCH>NAME,PARENT,CLOSINGBALANCE,OPENINGBALANCE</FETCH>
<FILTER>MatchName</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="MatchName">$$IsEqual:$NAME:"${safeName}"</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Fetching balance for "${ledgerName}" from ${targetCompany || 'default company'}...`);
      const response = await this.sendRequest(xml);
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) return null;

      let ledger = collection.LEDGER;
      if (!ledger) return null;
      if (Array.isArray(ledger)) ledger = ledger[0];

      let name = '';
      if (ledger.$?.NAME) name = ledger.$.NAME;
      else if (ledger.NAME?._ ) name = ledger.NAME._;
      else if (typeof ledger.NAME === 'string') name = ledger.NAME;

      return {
        name: String(name),
        parent: ledger.PARENT?._ || ledger.PARENT || '',
        closingBalance: parseFloat(String(ledger.CLOSINGBALANCE?._ || ledger.CLOSINGBALANCE || '0').replace(/[^\d.-]/g, '')) || 0,
        openingBalance: parseFloat(String(ledger.OPENINGBALANCE?._ || ledger.OPENINGBALANCE || '0').replace(/[^\d.-]/g, '')) || 0
      };
    } catch (error) {
      console.error(`Error fetching balance for "${ledgerName}":`, error.message);
      return null;
    }
  }

  /**
   * Get reconciliation balances for cheque management
   * - Cheque Receipt (For DB): balance > 0 = cheques not yet posted to ODBC
   * - Cheque Management (For DB) vs Counter Sales (ODBC CHq Mgmt): must match
   */
  async getChequeReconBalances(billingCompany = 'For DB', chequeCompany = 'ODBC CHq Mgmt') {
    try {
      const [chequeReceipt, chequeManagement, counterSales] = await Promise.all([
        this.getLedgerBalance('Cheque Receipt', billingCompany),
        this.getLedgerBalance('Cheque Management', billingCompany),
        this.getLedgerBalance('Counter Sales Account', chequeCompany)
      ]);

      const receiptBal = chequeReceipt?.closingBalance || 0;
      const mgmtBal = chequeManagement?.closingBalance || 0;
      const counterSalesBal = counterSales?.closingBalance || 0;
      // Cheque Management (For DB) should match Counter Sales (ODBC) — compare absolute values
      const mismatch = Math.abs(Math.abs(mgmtBal) - Math.abs(counterSalesBal));

      return {
        chequeReceipt: { name: 'Cheque Receipt', balance: receiptBal },
        chequeManagement: { name: 'Cheque Management', balance: mgmtBal },
        counterSales: { name: 'Counter Sales Account', balance: counterSalesBal, company: chequeCompany },
        pendingToPost: receiptBal,
        mismatch,
        isReconciled: mismatch < 0.01
      };
    } catch (error) {
      console.error('Error fetching cheque recon balances:', error.message);
      return null;
    }
  }

  // =============================================
  // VOUCHER LOCK METHODS
  // =============================================

  /**
   * Fetch voucher IDs from Tally (lightweight — only MASTERID + VOUCHERTYPENAME)
   * Used as fallback when local DB has no data
   */
  async fetchVoucherIds(toDate, fromDate, companyName) {
    const company = companyName || this.companyName || 'FOR DB';
    const companyVar = `<SVCURRENTCOMPANY>${this.escapeXml(company)}</SVCURRENTCOMPANY>`;
    const svTo = toDate.replace(/-/g, '');
    const svFrom = fromDate ? fromDate.replace(/-/g, '') : '20200401';

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>VchIdsForLock</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
${companyVar}
<SVFROMDATE>${svFrom}</SVFROMDATE>
<SVTODATE>${svTo}</SVTODATE>
</STATICVARIABLES>
<TDL><TDLMESSAGE>
<COLLECTION NAME="VchIdsForLock" ISMODIFY="No">
<TYPE>Voucher</TYPE>
<FETCH>MASTERID,VOUCHERTYPENAME,GUID</FETCH>
</COLLECTION>
</TDLMESSAGE></TDL>
</DESC>
<DATA><COLLECTION>VchIdsForLock</COLLECTION></DATA>
</BODY>
</ENVELOPE>`;

    console.log(`[VoucherLock] Fetching voucher IDs from Tally (${svFrom} to ${svTo}) in "${company}"...`);
    const result = await this.sendRequest(xml, 120000);

    const collection = result?.ENVELOPE?.BODY?.DATA?.COLLECTION;
    if (!collection?.VOUCHER) return [];

    const vouchers = Array.isArray(collection.VOUCHER) ? collection.VOUCHER : [collection.VOUCHER];
    const mapped = vouchers.map(v => {
      // MASTERID comes as object { _: " 69551", $: {TYPE: "Number"} } — extract and trim
      const masterId = (typeof v.MASTERID === 'object' ? v.MASTERID?._ : v.MASTERID);
      const guid = (typeof v.GUID === 'object' ? v.GUID?._ : v.GUID) || v.$?.REMOTEID;
      return {
        tally_master_id: String(masterId || '').trim(),
        tally_guid: guid,
        voucher_type: (typeof v.VOUCHERTYPENAME === 'object' ? v.VOUCHERTYPENAME?._ : v.VOUCHERTYPENAME)
      };
    }).filter(v => v.tally_master_id && v.voucher_type);

    console.log(`[VoucherLock] Fetched ${mapped.length} voucher IDs. Sample: masterId=${mapped[0]?.tally_master_id}, guid=${mapped[0]?.tally_guid}, type=${mapped[0]?.voucher_type}`);
    return mapped;
  }

  /**
   * Lock/unlock vouchers by setting LockVoucher UDF
   * Uses voucher list from local DB or Tally fetch
   * @param {Array} vouchers - [{tally_master_id, tally_guid?, voucher_type}]
   * @param {string} lockValue - 'Yes' or 'No'
   * @param {string} companyName
   */
  async setVoucherLockUDF(vouchers, lockValue = 'Yes', companyName) {
    const company = companyName || this.companyName || 'FOR DB';
    const companyVar = `<SVCURRENTCOMPANY>${this.escapeXml(company)}</SVCURRENTCOMPANY>`;
    const BATCH_SIZE = 200;

    const voucherXmlParts = vouchers
      .filter(v => v.tally_master_id && v.voucher_type)
      .map(v => {
        const remoteId = v.tally_guid || v.tally_master_id;
        return `<VOUCHER REMOTEID="${remoteId}" VCHTYPE="${this.escapeXml(v.voucher_type)}" ACTION="Alter">
<MASTERID>${String(v.tally_master_id).trim()}</MASTERID>
<UDF:LOCKVOUCHER.LIST><UDF:LOCKVOUCHER>${lockValue}</UDF:LOCKVOUCHER></UDF:LOCKVOUCHER.LIST>
</VOUCHER>`;
      });

    if (voucherXmlParts.length === 0) {
      console.log(`[VoucherLock] No vouchers to ${lockValue === 'Yes' ? 'lock' : 'unlock'}`);
      return { count: 0, total: 0, errors: [] };
    }

    const action = lockValue === 'Yes' ? 'lock' : 'unlock';
    const totalBatches = Math.ceil(voucherXmlParts.length / BATCH_SIZE);
    console.log(`[VoucherLock] ${action} ${voucherXmlParts.length} vouchers in ${totalBatches} batches of ${BATCH_SIZE} in "${company}"...`);

    let totalAltered = 0;
    const errors = [];

    for (let i = 0; i < voucherXmlParts.length; i += BATCH_SIZE) {
      const batch = voucherXmlParts.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;

      const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
<BODY>
<DESC><STATICVARIABLES>${companyVar}</STATICVARIABLES></DESC>
<DATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
${batch.join('\n')}
</TALLYMESSAGE>
</DATA>
</BODY>
</ENVELOPE>`;

      try {
        const result = await this.sendRequest(xml, 120000);
        const altered = parseInt(result?.ENVELOPE?.BODY?.DATA?.IMPORTRESULT?.ALTERED || '0');
        const errCount = parseInt(result?.ENVELOPE?.BODY?.DATA?.IMPORTRESULT?.ERRORS || '0');
        totalAltered += altered;
        if (errCount > 0) errors.push(`Batch ${batchNum}: ${errCount} errors`);
        console.log(`[VoucherLock] Batch ${batchNum}/${totalBatches}: altered=${altered}, errors=${errCount}`);
      } catch (err) {
        errors.push(`Batch ${batchNum}: ${err.message}`);
        console.error(`[VoucherLock] Batch ${batchNum} failed: ${err.message}`);
      }
    }

    console.log(`[VoucherLock] Done: ${totalAltered}/${voucherXmlParts.length} ${action}ed in "${company}"`);
    return { count: totalAltered, total: voucherXmlParts.length, errors };
  }


  /**
   * Lock/unlock a single voucher — direct lightweight XML, no batching
   */
  async toggleSingleVoucherLock(guid, masterId, voucherType, lockValue = 'Yes', companyName) {
    const company = companyName || this.companyName || 'FOR DB';
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
<BODY>
<DESC><STATICVARIABLES><SVCURRENTCOMPANY>${this.escapeXml(company)}</SVCURRENTCOMPANY></STATICVARIABLES></DESC>
<DATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER REMOTEID="${guid}" VCHTYPE="${this.escapeXml(voucherType)}" ACTION="Alter">
<MASTERID>${String(masterId).trim()}</MASTERID>
<UDF:LOCKVOUCHER.LIST><UDF:LOCKVOUCHER>${lockValue}</UDF:LOCKVOUCHER></UDF:LOCKVOUCHER.LIST>
</VOUCHER>
</TALLYMESSAGE>
</DATA>
</BODY>
</ENVELOPE>`;
    const result = await this.sendRequest(xml, 15000);
    const altered = parseInt(result?.ENVELOPE?.BODY?.DATA?.IMPORTRESULT?.ALTERED || '0');
    return { success: altered > 0, altered };
  }

  /**
   * Fetch all cheques from ODBC Cheque Management company
   * Pulls Sales Vouchers with Bill Allocations and Bank Allocations
   */
  async getODBCCheques(targetCompany = 'ODBC CHq Mgmt') {
    const companyVar = `<SVCURRENTCOMPANY>${this.escapeXml(targetCompany)}</SVCURRENTCOMPANY>`;

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ODBCVch</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="ODBCVch" ISMODIFY="No">
<TYPE>Voucher</TYPE>
<FETCH>DATE,VOUCHERTYPENAME,VOUCHERNUMBER,PARTYLEDGERNAME,AMOUNT,NARRATION,MASTERID,ALTERID,ALLLEDGERENTRIES.LIST</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Fetching cheques from ${targetCompany}...`);
      const response = await this.sendRequest(xml);
      return this.parseODBCCheques(response);
    } catch (error) {
      console.error('Error fetching ODBC cheques:', error.message);
      return [];
    }
  }

  /**
   * Fetch today's cheque receipt vouchers from billing company
   * Returns vouchers where "Cheque Receipt" ledger appears in entries
   */
  async getChequeReceiptVouchers(date = null, billingCompany = 'For DB') {
    const voucherDate = date || this.formatDate(new Date());
    const companyVar = `<SVCURRENTCOMPANY>${this.escapeXml(billingCompany)}</SVCURRENTCOMPANY>`;

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>ChequeRcptVch</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
<SVFROMDATE>${voucherDate}</SVFROMDATE>
<SVTODATE>${voucherDate}</SVTODATE>
${companyVar}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="ChequeRcptVch" ISMODIFY="No">
<TYPE>Voucher</TYPE>
<FETCH>DATE,VOUCHERTYPENAME,VOUCHERNUMBER,PARTYLEDGERNAME,AMOUNT,NARRATION,MASTERID,ALTERID,ALLLEDGERENTRIES.LIST</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Fetching cheque receipt vouchers for ${voucherDate} from ${billingCompany}...`);
      const response = await this.sendRequest(xml);
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) return [];

      let vouchers = collection.VOUCHER;
      if (!vouchers) return [];
      vouchers = Array.isArray(vouchers) ? vouchers : [vouchers];

      console.log(`Total vouchers fetched from Tally: ${vouchers.length}`);
      // Debug: log sample dates
      if (vouchers.length > 0) {
        const sampleDates = vouchers.slice(0, 3).map(v => v.DATE?._ || v.DATE || 'none');
        console.log(`  Sample dates: ${sampleDates.join(', ')} (looking for: ${voucherDate})`);
      }
      const results = [];
      for (const vch of vouchers) {
        // Verify date matches (safety check in case SVFROMDATE/SVTODATE didn't filter)
        const vchDate = vch.DATE?._ || vch.DATE || '';
        if (vchDate && vchDate !== voucherDate) continue;

        let entries = vch['ALLLEDGERENTRIES.LIST'];
        if (!entries) continue;
        entries = Array.isArray(entries) ? entries : [entries];

        // Check if "Cheque Receipt" ledger is in this voucher
        const hasChequeReceipt = entries.some(e => {
          const ledgerName = (e.LEDGERNAME?._ || e.LEDGERNAME || '').toLowerCase();
          return ledgerName.includes('cheque receipt');
        });
        if (!hasChequeReceipt) continue;

        // Find the cheque receipt entry to get the amount
        const chequeEntry = entries.find(e => {
          const ledgerName = (e.LEDGERNAME?._ || e.LEDGERNAME || '').toLowerCase();
          return ledgerName.includes('cheque receipt');
        });
        const chequeAmount = Math.abs(parseFloat(String(chequeEntry?.AMOUNT?._ || chequeEntry?.AMOUNT || '0').replace(/[^\d.-]/g, '')) || 0);

        const partyName = vch.PARTYLEDGERNAME?._ || vch.PARTYLEDGERNAME || '';
        const voucherNumber = vch.VOUCHERNUMBER?._ || vch.VOUCHERNUMBER || '';
        const voucherType = vch.VOUCHERTYPENAME?._ || vch.VOUCHERTYPENAME || '';
        const totalAmount = Math.abs(parseFloat(String(vch.AMOUNT?._ || vch.AMOUNT || '0').replace(/[^\d.-]/g, '')) || 0);
        const rawNarr = vch.NARRATION;
        const narration = typeof rawNarr === 'string' ? rawNarr : (rawNarr?._ || '');

        results.push({
          partyName,
          voucherNumber,
          voucherType,
          voucherDate,
          totalAmount,
          chequeReceiptAmount: chequeAmount,
          narration,
          masterId: vch.MASTERID?._ || vch.MASTERID || '',
          alterId: vch.ALTERID?._ || vch.ALTERID || ''
        });
      }

      console.log(`Found ${results.length} cheque receipt vouchers for ${voucherDate}`);
      return results;
    } catch (error) {
      console.error('Error fetching cheque receipt vouchers:', error.message);
      return [];
    }
  }

  /**
   * Create Sales Voucher in ODBC CHq Mgmt with multiple cheque lines
   * Each cheque line becomes a bank entry with bill allocation + bank allocation
   */
  async createODBCSalesVoucher(data, targetCompany = 'ODBC CHq Mgmt') {
    const {
      partyName,
      chequeLines,
      date: voucherDate,
      narration = '',
      voucherNumber = ''
    } = data;

    const safeParty = this.escapeXml(partyName);
    const safeNarration = this.escapeXml(narration);
    const companyVar = `<SVCURRENTCOMPANY>${this.escapeXml(targetCompany)}</SVCURRENTCOMPANY>`;
    const totalAmount = chequeLines.reduce((s, c) => s + Math.abs(parseFloat(c.amount) || 0), 0);

    // Build bill allocations XML (one per cheque, all under party ledger entry)
    // Bill Name format: "chequeNumber, bankName, accountHolderName"
    console.log('Cheque lines received:', JSON.stringify(chequeLines.map(c => ({ chequeNumber: c.chequeNumber, chequeDate: c.chequeDate, amount: c.amount, bankName: c.bankName }))));
    const billAllocationsXml = chequeLines.map(c => {
      const amt = Math.abs(parseFloat(c.amount) || 0);
      const parts = [c.chequeNumber || '', c.bankName || '', c.accountHolderName || ''].filter(Boolean);
      const billName = this.escapeXml(parts.join(', '));

      // Format cheque date as Tally Due Date with TYPE and JD attributes
      // Tally requires TYPE="Due Date" and JD (Julian Day) for BILLCREDITPERIOD to work
      let dueDateTag = '';
      if (c.chequeDate) {
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        // Handle both YYYYMMDD and YYYY-MM-DD formats
        let dateStr = String(c.chequeDate);
        if (/^\d{8}$/.test(dateStr)) {
          dateStr = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
        }
        const cd = new Date(dateStr);
        if (!isNaN(cd.getTime())) {
          const tallyDate = `${cd.getDate()}-${months[cd.getMonth()]}-${cd.getFullYear()}`;
          // Tally JD = serial date (days since Dec 31, 1899)
          const tallyEpoch = new Date('1899-12-31T00:00:00Z');
          const jd = Math.floor((cd.getTime() - tallyEpoch.getTime()) / 86400000);
          dueDateTag = `<BILLCREDITPERIOD TYPE="Due Date" JD="${jd}">${tallyDate}</BILLCREDITPERIOD>`;
        }
      }

      console.log(`  Bill "${billName}": chequeDate="${c.chequeDate}" -> dueDateTag="${dueDateTag}"`);
      return `<BILLALLOCATIONS.LIST>
<NAME>${billName}</NAME>
<BILLTYPE>New Ref</BILLTYPE>
${dueDateTag}
<AMOUNT>-${amt}</AMOUNT>
</BILLALLOCATIONS.LIST>`;
    }).join('\n');

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
<BODY>
<DESC><STATICVARIABLES>${companyVar}</STATICVARIABLES></DESC>
<DATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="Sales" ACTION="Create">
<DATE>${voucherDate}</DATE>
<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
<PARTYLEDGERNAME>${safeParty}</PARTYLEDGERNAME>
${voucherNumber ? `<VOUCHERNUMBER>${this.escapeXml(voucherNumber)}</VOUCHERNUMBER>` : ''}
<NARRATION>${safeNarration}</NARRATION>
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>${safeParty}</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>-${totalAmount.toFixed(2)}</AMOUNT>
${billAllocationsXml}
</ALLLEDGERENTRIES.LIST>
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>Counter Sales Account</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<AMOUNT>${totalAmount.toFixed(2)}</AMOUNT>
</ALLLEDGERENTRIES.LIST>
</VOUCHER>
</TALLYMESSAGE>
</DATA>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Creating ODBC Sales Voucher in ${targetCompany}: Party=${partyName}, Total=${totalAmount}, Lines=${chequeLines.length}`);

      const response = await this.sendRequest(xml);
      const result = this.parseImportResponse(response);
      console.log('ODBC Sales Voucher result:', result);

      if (result.success) {
        result.company = targetCompany;
        result.partyName = partyName;
        result.totalAmount = totalAmount;
        result.chequeCount = chequeLines.length;
      }
      return result;
    } catch (error) {
      console.error('Error creating ODBC Sales Voucher:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create Journal Voucher in Billing Company for cheque transfer
   * Dr Cheque Management / Cr Cheque Receipt
   * @param {Object} data - Journal data
   * @param {number} data.totalAmount - Total amount of all cheques
   * @param {number} data.chequeCount - Total number of cheques
   * @param {string} data.narration - Narration text
   * @param {string} data.date - Voucher date (YYYYMMDD)
   * @param {string} targetCompany - Billing company name
   */
  async createChequeJournal(data, targetCompany = 'For DB') {
    const {
      totalAmount,
      chequeCount = 0,
      narration = '',
      date: voucherDate
    } = data;

    const vchDate = voucherDate || this.formatDate(new Date());
    const safeNarration = this.escapeXml(narration);
    const companyVar = `<SVCURRENTCOMPANY>${this.escapeXml(targetCompany)}</SVCURRENTCOMPANY>`;
    const voucherNumber = `CHQ-${chequeCount}chqs-${vchDate}`;
    const amt = Math.abs(totalAmount).toFixed(2);

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
<BODY>
<DESC><STATICVARIABLES>${companyVar}</STATICVARIABLES></DESC>
<DATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER VCHTYPE="Journal" ACTION="Create">
<DATE>${vchDate}</DATE>
<VOUCHERTYPENAME>Journal</VOUCHERTYPENAME>
<VOUCHERNUMBER>${this.escapeXml(voucherNumber)}</VOUCHERNUMBER>
<NARRATION>${safeNarration}</NARRATION>
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>Cheque Management</LEDGERNAME>
<ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
<AMOUNT>-${amt}</AMOUNT>
</ALLLEDGERENTRIES.LIST>
<ALLLEDGERENTRIES.LIST>
<LEDGERNAME>Cheque Receipt</LEDGERNAME>
<ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
<AMOUNT>${amt}</AMOUNT>
</ALLLEDGERENTRIES.LIST>
</VOUCHER>
</TALLYMESSAGE>
</DATA>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Creating Cheque Journal in ${targetCompany}:`);
      console.log(`  Amount: ${amt}, Cheques: ${chequeCount}`);
      console.log(`  Narration: ${narration}`);

      const response = await this.sendRequest(xml);
      const result = this.parseImportResponse(response);
      console.log('Cheque Journal result:', result);

      if (result.success) {
        result.company = targetCompany;
        result.voucherNumber = voucherNumber;
        result.amount = totalAmount;
      }

      return result;
    } catch (error) {
      console.error('Error creating cheque journal:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Parse ODBC cheque vouchers from Tally XML response
   * Extracts bill allocations and bank allocations for cheque details
   */
  parseODBCCheques(response) {
    try {
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) return [];

      let vouchers = collection.VOUCHER;
      if (!vouchers) return [];
      vouchers = Array.isArray(vouchers) ? vouchers : [vouchers];

      const results = [];

      for (const vch of vouchers) {
        const partyName = vch.PARTYLEDGERNAME?._ || vch.PARTYLEDGERNAME || '';
        const voucherNumber = vch.VOUCHERNUMBER?._ || vch.VOUCHERNUMBER || '';
        const voucherDate = vch.DATE?._ || vch.DATE || '';
        const amount = Math.abs(parseFloat(String(vch.AMOUNT?._ || vch.AMOUNT || '0').replace(/[^\d.-]/g, '')) || 0);
        const rawNarr = vch.NARRATION;
        const narration = typeof rawNarr === 'string' ? rawNarr : (rawNarr?._ || '');
        const masterId = vch.MASTERID?._ || vch.MASTERID || '';
        const alterId = vch.ALTERID?._ || vch.ALTERID || '';

        let entries = vch['ALLLEDGERENTRIES.LIST'];
        if (!entries) continue;
        entries = Array.isArray(entries) ? entries : [entries];

        for (const entry of entries) {
          const isDeemedPositive = (entry.ISDEEMEDPOSITIVE?._ || entry.ISDEEMEDPOSITIVE || '').toLowerCase();
          if (isDeemedPositive !== 'yes') continue;

          const bankName = entry.LEDGERNAME?._ || entry.LEDGERNAME || '';
          const entryAmount = Math.abs(parseFloat(String(entry.AMOUNT?._ || entry.AMOUNT || '0').replace(/[^\d.-]/g, '')) || 0);

          // Parse bill allocations
          let billAllocs = entry['BILLALLOCATIONS.LIST'];
          const billAllocations = [];
          if (billAllocs) {
            billAllocs = Array.isArray(billAllocs) ? billAllocs : [billAllocs];
            for (const ba of billAllocs) {
              if (typeof ba === 'string') continue;
              billAllocations.push({
                billName: ba.NAME?._ || ba.NAME || '',
                amount: Math.abs(parseFloat(String(ba.AMOUNT?._ || ba.AMOUNT || '0').replace(/[^\d.-]/g, '')) || 0),
                billDate: ba.BILLDATE?._ || ba.BILLDATE || ''
              });
            }
          }

          // Parse bank allocations for cheque number/date
          let bankAllocs = entry['BANKALLOCATIONS.LIST'];
          let chequeNumber = '';
          let chequeDate = '';
          if (bankAllocs) {
            bankAllocs = Array.isArray(bankAllocs) ? bankAllocs : [bankAllocs];
            for (const bk of bankAllocs) {
              if (typeof bk === 'string') continue;
              chequeNumber = bk.INSTRUMENTNUMBER?._ || bk.INSTRUMENTNUMBER || bk.CHEQUENUMBER?._ || bk.CHEQUENUMBER || '';
              chequeDate = bk.INSTRUMENTDATE?._ || bk.INSTRUMENTDATE || bk.CHEQUEDATE?._ || bk.CHEQUEDATE || '';
            }
          }

          results.push({
            partyName,
            voucherNumber,
            voucherDate,
            amount: entryAmount || amount,
            bankName,
            chequeNumber,
            chequeDate,
            narration,
            billAllocations,
            masterId,
            alterId
          });
        }
      }

      console.log(`Parsed ${results.length} cheque entries from ODBC company`);
      return results;
    } catch (error) {
      console.error('Error parsing ODBC cheques:', error);
      return [];
    }
  }

  /**
   * Check if a party (ledger) exists in a specific company
   */
  async partyExistsInCompany(partyName, targetCompany) {
    const ledgers = await this.getLedgersFromCompany('Sundry Debtors', targetCompany);
    return ledgers.some(l => l.name.toLowerCase() === partyName.toLowerCase());
  }

  /**
   * Create a new ledger (party) in target company if it doesn't exist
   * Used to sync parties between main company and cheque management company
   */
  async createLedgerInCompany(ledgerData, targetCompany = 'ODBC CHq Mgmt') {
    const {
      name,
      parentGroup = 'Sundry Debtors',
      address = '',
      state = '',
      gstin = ''
    } = ledgerData;

    const safeName = this.escapeXml(name);
    const safeParent = this.escapeXml(parentGroup);
    const safeAddress = this.escapeXml(address);
    const safeState = this.escapeXml(state);
    const safeGstin = this.escapeXml(gstin);

    const companyVar = `<SVCURRENTCOMPANY>${this.escapeXml(targetCompany)}</SVCURRENTCOMPANY>`;

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Ledgers</ID></HEADER>
<BODY>
<DESC><STATICVARIABLES>${companyVar}</STATICVARIABLES></DESC>
<DATA>
<TALLYMESSAGE>
<LEDGER NAME="${safeName}" ACTION="Create">
<NAME>${safeName}</NAME>
<PARENT>${safeParent}</PARENT>
${safeAddress ? `<ADDRESS>${safeAddress}</ADDRESS>` : ''}
${safeState ? `<STATENAME>${safeState}</STATENAME>` : ''}
${safeGstin ? `<GSTIN>${safeGstin}</GSTIN>` : ''}
</LEDGER>
</TALLYMESSAGE>
</DATA>
</BODY>
</ENVELOPE>`;

    try {
      console.log(`Creating ledger "${name}" in ${targetCompany}...`);
      const response = await this.sendRequest(xml);
      const result = this.parseImportResponse(response);
      console.log('Ledger creation result:', result);
      return result;
    } catch (error) {
      console.error('Error creating ledger:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Push cheque to Cheque Management Company
   * This is the main method called from the dashboard
   * It handles:
   * 1. Checking if party exists in target company
   * 2. Creating party if needed
   * 3. Creating the cheque receipt/PDC entry
   */
  async pushChequeToCompany(chequeData, targetCompany = 'ODBC CHq Mgmt') {
    const { partyName, chequeDate } = chequeData;

    try {
      // Step 1: Check if party exists in target company
      const partyExists = await this.partyExistsInCompany(partyName, targetCompany);

      if (!partyExists) {
        console.log(`Party "${partyName}" not found in ${targetCompany}, creating...`);
        // Try to get party details from main company
        const mainParties = await this.getLedgersFromCompany('Sundry Debtors', this.companyName);
        const partyDetails = mainParties.find(p => p.name.toLowerCase() === partyName.toLowerCase());

        // Create party in target company
        const createResult = await this.createLedgerInCompany({
          name: partyName,
          parentGroup: 'Sundry Debtors',
          address: partyDetails?.address || '',
          state: partyDetails?.state || '',
          gstin: partyDetails?.gstin || ''
        }, targetCompany);

        if (!createResult.success) {
          return {
            success: false,
            error: `Failed to create party in ${targetCompany}: ${createResult.error}`
          };
        }
        console.log(`Party "${partyName}" created in ${targetCompany}`);
      }

      // Step 2: Determine if PDC or regular cheque receipt
      const today = this.formatDate(new Date());
      const isPostDated = chequeDate && chequeDate > today;

      // Step 3: Create appropriate entry
      if (isPostDated) {
        console.log('Creating PDC entry (post-dated cheque)...');
        return await this.createPDCEntry(chequeData, targetCompany);
      } else {
        console.log('Creating cheque receipt...');
        return await this.createChequeReceipt(chequeData, targetCompany);
      }
    } catch (error) {
      console.error('Error pushing cheque to company:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all voucher GUIDs from Tally for specific voucher types
   * Used to detect deleted vouchers by comparing with local database
   * @param {Array} voucherTypes - Array of voucher type names to fetch
   * @param {string} fromDate - Start date in YYYYMMDD format (optional)
   * @param {string} toDate - End date in YYYYMMDD format (optional)
   * @returns {Array} Array of voucher GUIDs that exist in Tally
   */
  async getAllVoucherGuids(voucherTypes = null, fromDate = null, toDate = null) {
    const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';

    // Build date range variables if provided
    let dateVars = '';
    if (fromDate && toDate) {
      dateVars = `<SVFROMDATE>${fromDate}</SVFROMDATE><SVTODATE>${toDate}</SVTODATE>`;
    }

    // Build voucher type filter
    let typeFilter = '';
    let typeFilterDef = '';
    if (voucherTypes && voucherTypes.length > 0) {
      // Create OR condition for multiple voucher types
      const typeConditions = voucherTypes.map((t, i) => `$VOUCHERTYPENAME = "${this.escapeXml(t)}"`).join(' OR ');
      typeFilter = '<FILTER>VchTypeFilter,NotCancelled</FILTER>';
      typeFilterDef = `<SYSTEM TYPE="Formulae" NAME="VchTypeFilter">${typeConditions}</SYSTEM>
<SYSTEM TYPE="Formulae" NAME="NotCancelled">$$IsEqual:$IsCancelled:No</SYSTEM>`;
    } else {
      typeFilter = '<FILTER>NotCancelled</FILTER>';
      typeFilterDef = '<SYSTEM TYPE="Formulae" NAME="NotCancelled">$$IsEqual:$IsCancelled:No</SYSTEM>';
    }

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>VoucherGuids</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
${dateVars}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="VoucherGuids" ISMODIFY="No">
<TYPE>Voucher</TYPE>
<FETCH>GUID,MASTERID,VOUCHERTYPENAME,VOUCHERNUMBER</FETCH>
${typeFilter}
</COLLECTION>
${typeFilterDef}
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      console.log('Fetching all voucher GUIDs from Tally...');
      const response = await this.sendRequest(xml);
      return this.parseVoucherGuids(response);
    } catch (error) {
      console.error('Error fetching voucher GUIDs:', error.message);
      return [];
    }
  }

  /**
   * Parse voucher GUIDs from response
   */
  parseVoucherGuids(response) {
    try {
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) {
        console.log('No collection in voucher GUID response');
        return [];
      }

      let vouchers = collection.VOUCHER;
      if (!vouchers) {
        console.log('No vouchers in GUID collection');
        return [];
      }

      vouchers = Array.isArray(vouchers) ? vouchers : [vouchers];
      console.log(`Found ${vouchers.length} voucher GUIDs from Tally`);

      return vouchers.map(v => ({
        guid: String(v.GUID || v.$?.GUID || ''),
        masterId: String(v.MASTERID?._ || v.MASTERID || '').trim(),
        voucherType: String(v.VOUCHERTYPENAME || ''),
        voucherNumber: String(v.VOUCHERNUMBER || '')
      })).filter(v => v.guid);
    } catch (error) {
      console.error('Error parsing voucher GUIDs:', error);
      return [];
    }
  }

  /**
   * Check if a specific voucher exists in Tally by GUID
   * @param {string} guid - The voucher GUID to check
   * @returns {boolean} True if voucher exists
   */
  async checkVoucherExists(guid) {
    const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>VchCheck</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="VchCheck" ISMODIFY="No">
<TYPE>Voucher</TYPE>
<FETCH>GUID</FETCH>
<FILTER>GuidMatch</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="GuidMatch">$GUID = "${this.escapeXml(guid)}"</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      const response = await this.sendRequest(xml);
      const voucher = response?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER;
      return !!voucher;
    } catch (error) {
      console.error('Error checking voucher existence:', error.message);
      return true; // Return true on error to avoid false deletions
    }
  }

  /**
   * Add an item to an existing Pending Sales Bill
   * This fetches the complete voucher, adds the new item, and re-saves it
   *
   * @param {Object} data - Data for adding item
   * @param {string} data.masterId - Tally MASTERID of the voucher
   * @param {string} data.guid - Tally GUID of the voucher
   * @param {string} data.voucherNumber - Voucher number
   * @param {string} data.voucherDate - Voucher date (YYYYMMDD)
   * @param {string} data.partyName - Party ledger name
   * @param {Object} data.newItem - New item to add
   * @param {string} data.newItem.stockItem - Stock item name
   * @param {number} data.newItem.quantity - Quantity
   * @param {number} data.newItem.rate - Rate per unit
   * @param {number} data.newItem.amount - Total amount (quantity * rate)
   * @param {string} data.newItem.godown - Godown name (optional)
   */
  async addItemToPendingBill(data) {
    const { masterId, guid, voucherNumber, voucherDate, partyName, newItem } = data;

    if (!masterId) {
      return { success: false, error: 'MASTERID is required' };
    }

    if (!newItem || !newItem.stockItem || !newItem.quantity || !newItem.rate) {
      return { success: false, error: 'New item with stockItem, quantity, and rate is required' };
    }

    console.log('=== ADD ITEM TO PENDING BILL ===');
    console.log(`MasterID: ${masterId}, Voucher: ${voucherNumber}`);
    console.log(`New Item: ${newItem.stockItem} x ${newItem.quantity} @ ${newItem.rate}`);

    try {
      // Step 1: Fetch complete voucher data
      const voucherResult = await this.getCompleteVoucher(masterId);
      if (!voucherResult.success) {
        return { success: false, error: voucherResult.error || 'Failed to fetch voucher' };
      }

      const voucher = voucherResult.voucher;

      // Step 2: Parse existing inventory entries
      let inventoryEntries = voucher?.['ALLINVENTORYENTRIES.LIST'] || voucher?.ALLINVENTORYENTRIES?.LIST || [];
      if (!Array.isArray(inventoryEntries)) {
        inventoryEntries = inventoryEntries ? [inventoryEntries] : [];
      }

      console.log(`Existing items: ${inventoryEntries.length}`);

      // Step 3: Build XML for existing items
      let existingItemsXml = '';
      let existingTotal = 0;

      for (const entry of inventoryEntries) {
        if (!entry) continue;

        const stockItem = entry.STOCKITEMNAME?._ || entry.STOCKITEMNAME || '';
        const qtyStr = String(entry.ACTUALQTY?._ || entry.ACTUALQTY || entry.BILLEDQTY?._ || entry.BILLEDQTY || '0');
        const qty = parseFloat(qtyStr.replace(/[^\d.-]/g, '')) || 0;
        const rate = parseFloat(String(entry.RATE?._ || entry.RATE || '0').replace(/[^\d.-]/g, '')) || 0;
        const amount = parseFloat(String(entry.AMOUNT?._ || entry.AMOUNT || '0').replace(/[^\d.-]/g, '')) || 0;
        // Extract unit from qty string (e.g., "5 ps" → "ps")
        const unitMatch = qtyStr.match(/[\d.]+\s*(.+)/);
        const unit = unitMatch ? unitMatch[1].trim() : 'Nos';

        if (stockItem) {
          existingTotal += Math.abs(amount);
          const absAmt = Math.abs(amount);
          const absQty = Math.abs(qty);
          const absRate = Math.abs(rate);
          existingItemsXml += `
<ALLINVENTORYENTRIES.LIST>
  <STOCKITEMNAME>${this.escapeXml(stockItem)}</STOCKITEMNAME>
  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
  <ISLASTDEEMEDPOSITIVE>No</ISLASTDEEMEDPOSITIVE>
  <ISAUTONEGATE>No</ISAUTONEGATE>
  <RATE>${absRate}/${unit}</RATE>
  <AMOUNT>${absAmt}</AMOUNT>
  <ACTUALQTY> ${absQty} ${unit}</ACTUALQTY>
  <BILLEDQTY> ${absQty} ${unit}</BILLEDQTY>
  <BATCHALLOCATIONS.LIST>
    <GODOWNNAME>Main Location</GODOWNNAME>
    <BATCHNAME>Primary Batch</BATCHNAME>
    <AMOUNT>${absAmt}</AMOUNT>
    <ACTUALQTY> ${absQty} ${unit}</ACTUALQTY>
    <BILLEDQTY> ${absQty} ${unit}</BILLEDQTY>
  </BATCHALLOCATIONS.LIST>
</ALLINVENTORYENTRIES.LIST>`;
        }
      }

      // Step 4: Add new item XML
      const newItemAmount = Math.abs(newItem.quantity * newItem.rate);
      const newItemQty = Math.abs(newItem.quantity);
      const newItemRate = Math.abs(newItem.rate);
      const newItemUnit = newItem.unit || 'Nos';
      const newItemXml = `
<ALLINVENTORYENTRIES.LIST>
  <STOCKITEMNAME>${this.escapeXml(newItem.stockItem)}</STOCKITEMNAME>
  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
  <ISLASTDEEMEDPOSITIVE>No</ISLASTDEEMEDPOSITIVE>
  <ISAUTONEGATE>No</ISAUTONEGATE>
  <RATE>${newItemRate}/${newItemUnit}</RATE>
  <AMOUNT>${newItemAmount}</AMOUNT>
  <ACTUALQTY> ${newItemQty} ${newItemUnit}</ACTUALQTY>
  <BILLEDQTY> ${newItemQty} ${newItemUnit}</BILLEDQTY>
  <BATCHALLOCATIONS.LIST>
    <GODOWNNAME>Main Location</GODOWNNAME>
    <BATCHNAME>Primary Batch</BATCHNAME>
    <AMOUNT>${newItemAmount}</AMOUNT>
    <ACTUALQTY> ${newItemQty} ${newItemUnit}</ACTUALQTY>
    <BILLEDQTY> ${newItemQty} ${newItemUnit}</BILLEDQTY>
  </BATCHALLOCATIONS.LIST>
</ALLINVENTORYENTRIES.LIST>`;

      // Step 5: Calculate new total
      const newTotal = existingTotal + newItemAmount;

      console.log(`Existing total: ${existingTotal}, New item: ${newItemAmount}, New total: ${newTotal}`);

      const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';

      // Step 6: Build the alter voucher XML
      const xml = `<ENVELOPE>
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
<VOUCHER REMOTEID="${masterId}" VCHTYPE="Pending Sales Bill" ACTION="Alter">
<MASTERID>${masterId}</MASTERID>
<DATE>${voucherDate}</DATE>
<VOUCHERTYPENAME>Pending Sales Bill</VOUCHERTYPENAME>
<PARTYLEDGERNAME>${this.escapeXml(partyName)}</PARTYLEDGERNAME>
<PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
<LEDGERENTRIES.LIST>
  <LEDGERNAME>${this.escapeXml(partyName)}</LEDGERNAME>
  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
  <AMOUNT>-${newTotal}</AMOUNT>
</LEDGERENTRIES.LIST>
<LEDGERENTRIES.LIST>
  <LEDGERNAME>Sales A/c</LEDGERNAME>
  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
  <AMOUNT>${newTotal}</AMOUNT>
</LEDGERENTRIES.LIST>
${existingItemsXml}
${newItemXml}
</VOUCHER>
</TALLYMESSAGE>
</REQUESTDATA>
</IMPORTDATA>
</BODY>
</ENVELOPE>`;

      console.log('Sending alter voucher request...');
      const response = await this.sendRequest(xml);
      const result = this.parseImportResponse(response);

      if (result.success) {
        console.log('Item added successfully!');
        return {
          success: true,
          message: 'Item added to pending bill',
          newTotal,
          itemCount: inventoryEntries.length + 1
        };
      } else {
        console.error('Failed to add item:', result.error);
        return { success: false, error: result.error || 'Failed to update voucher' };
      }

    } catch (error) {
      console.error('Error adding item to pending bill:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Update ALL items on a Pending Sales Bill (full replacement)
   * This allows adding, editing, and deleting items by sending the complete list
   *
   * @param {Object} data - Data for updating items
   * @param {string} data.masterId - Tally MASTERID of the voucher
   * @param {string} data.guid - Tally GUID of the voucher
   * @param {string} data.voucherNumber - Voucher number
   * @param {string} data.voucherDate - Voucher date (YYYYMMDD)
   * @param {string} data.partyName - Party ledger name
   * @param {Array} data.items - Complete list of items to set on the bill
   */
  async updatePendingBillItems(data) {
    const { masterId, guid, voucherNumber, voucherDate, partyName, items } = data;

    if (!masterId) {
      return { success: false, error: 'MASTERID is required' };
    }

    if (!items || !Array.isArray(items)) {
      return { success: false, error: 'Items array is required' };
    }

    console.log('=== UPDATE PENDING BILL ITEMS ===');
    console.log(`MasterID: ${masterId}, Voucher: ${voucherNumber}`);
    console.log(`Items count: ${items.length}`);

    try {
      // First, fetch the existing voucher to get the correct sales ledger name
      const existingVoucher = await this.getCompleteVoucher(masterId);
      let salesLedger = '1 Sales A/c'; // Default

      if (existingVoucher.success && existingVoucher.voucher) {
        // Try to find the sales ledger from existing inventory entries
        const invEntries = existingVoucher.voucher['ALLINVENTORYENTRIES.LIST'] || [];
        const entries = Array.isArray(invEntries) ? invEntries : [invEntries].filter(Boolean);

        for (const entry of entries) {
          const accAllocs = entry['ACCOUNTINGALLOCATIONS.LIST'] || entry.ACCOUNTINGALLOCATIONS?.LIST || [];
          const allocs = Array.isArray(accAllocs) ? accAllocs : [accAllocs].filter(Boolean);

          for (const alloc of allocs) {
            const ledgerName = alloc.LEDGERNAME?._ || alloc.LEDGERNAME;
            if (ledgerName && ledgerName !== partyName && !ledgerName.includes(partyName)) {
              salesLedger = ledgerName;
              break;
            }
          }
          if (salesLedger !== '1 Sales A/c') break;
        }
      }

      console.log(`Using sales ledger: ${salesLedger}`);

      // Build XML for all items
      let itemsXml = '';
      let totalAmount = 0;

      for (const item of items) {
        console.log('Processing item:', JSON.stringify(item));
        if (!item.stockItem || !item.quantity || !item.rate) {
          console.log('Skipping item - missing required fields');
          continue;
        }

        const qty = Math.abs(parseFloat(item.quantity));
        const rate = Math.abs(parseFloat(item.rate));
        const amount = qty * rate;
        const unit = item.unit || 'Nos';
        totalAmount += amount;
        console.log(`  -> ${item.stockItem}: qty=${qty}, rate=${rate}, amount=${amount}, unit=${unit}`);

        const godown = item.godown ? this.escapeXml(item.godown) : 'Main Location';
        itemsXml += `
<ALLINVENTORYENTRIES.LIST>
  <STOCKITEMNAME>${this.escapeXml(item.stockItem)}</STOCKITEMNAME>
  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
  <ISLASTDEEMEDPOSITIVE>No</ISLASTDEEMEDPOSITIVE>
  <ISAUTONEGATE>No</ISAUTONEGATE>
  <RATE>${rate}/${unit}</RATE>
  <AMOUNT>${amount}</AMOUNT>
  <ACTUALQTY> ${qty} ${unit}</ACTUALQTY>
  <BILLEDQTY> ${qty} ${unit}</BILLEDQTY>
  <BATCHALLOCATIONS.LIST>
    <GODOWNNAME>${godown}</GODOWNNAME>
    <BATCHNAME>Primary Batch</BATCHNAME>
    <AMOUNT>${amount}</AMOUNT>
    <ACTUALQTY> ${qty} ${unit}</ACTUALQTY>
    <BILLEDQTY> ${qty} ${unit}</BILLEDQTY>
  </BATCHALLOCATIONS.LIST>
  <ACCOUNTINGALLOCATIONS.LIST>
    <LEDGERNAME>${this.escapeXml(salesLedger)}</LEDGERNAME>
    <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
    <ISLASTDEEMEDPOSITIVE>No</ISLASTDEEMEDPOSITIVE>
    <AMOUNT>${amount}</AMOUNT>
  </ACCOUNTINGALLOCATIONS.LIST>
</ALLINVENTORYENTRIES.LIST>`;
      }

      console.log(`Total amount: ${totalAmount}`);

      const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';

      // Build the alter voucher XML using the old Import format (works reliably)
      const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Import</TALLYREQUEST><TYPE>Data</TYPE><ID>Vouchers</ID></HEADER>
<BODY>
<DESC><STATICVARIABLES>${companyVar}</STATICVARIABLES></DESC>
<DATA>
<TALLYMESSAGE xmlns:UDF="TallyUDF">
<VOUCHER REMOTEID="${guid || masterId}" VCHTYPE="Pending Sales Bill" ACTION="Alter" OBJVIEW="Invoice Voucher View">
<MASTERID>${masterId}</MASTERID>
${voucherNumber ? `<VOUCHERNUMBER>${voucherNumber}</VOUCHERNUMBER>` : ''}
<DATE>${voucherDate}</DATE>
<VOUCHERTYPENAME>Pending Sales Bill</VOUCHERTYPENAME>
<PARTYLEDGERNAME>${this.escapeXml(partyName)}</PARTYLEDGERNAME>
<PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
<LEDGERENTRIES.LIST>
  <LEDGERNAME>${this.escapeXml(partyName)}</LEDGERNAME>
  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
  <AMOUNT>-${totalAmount}</AMOUNT>
</LEDGERENTRIES.LIST>
${itemsXml}
</VOUCHER>
</TALLYMESSAGE>
</DATA>
</BODY>
</ENVELOPE>`;

      console.log('=== SENDING XML TO TALLY ===');
      console.log(xml);
      console.log('=== END XML ===');

      const response = await this.sendRequest(xml);
      console.log('=== TALLY RESPONSE ===');
      console.log(JSON.stringify(response, null, 2));
      console.log('=== END RESPONSE ===');

      const result = this.parseImportResponse(response);

      if (result.success) {
        console.log('Items updated successfully!');
        return {
          success: true,
          message: 'Items updated on pending bill',
          newTotal: totalAmount,
          itemCount: items.length
        };
      } else {
        console.error('Failed to update items:', result.error);
        return { success: false, error: result.error || 'Failed to update voucher' };
      }

    } catch (error) {
      console.error('Error updating pending bill items:', error.message);
      return { success: false, error: error.message };
    }
  }

  // ==================== REPORT FEATURES ====================

  /**
   * Helper: Get company XML variable
   */
  getCompanyVar(companyOverride = null) {
    const company = companyOverride || this.companyName;
    return company ? `<SVCURRENTCOMPANY>${this.escapeXml(company)}</SVCURRENTCOMPANY>` : '';
  }

  /**
   * Get outstanding bills with bill allocations per debtor ledger
   * Returns party-wise outstanding with individual bill breakup
   */
  async getLedgerBillAllocations(companyOverride = null) {
    const companyVar = this.getCompanyVar(companyOverride);

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>LedgerBills</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="LedgerBills" ISMODIFY="No">
<TYPE>Ledger</TYPE>
<CHILDOF>Sundry Debtors</CHILDOF>
<BELONGSTO>Yes</BELONGSTO>
<FETCH>NAME,CLOSINGBALANCE,OPENINGBALANCE,BILLALLOCATIONS.LIST</FETCH>
<FILTER>HasBalance</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="HasBalance">$$IsNotEqual:$CLOSINGBALANCE:0</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      const response = await this.sendRequest(xml);
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) return [];

      let ledgers = collection.LEDGER;
      if (!ledgers) return [];
      ledgers = Array.isArray(ledgers) ? ledgers : [ledgers];

      const today = new Date();
      const results = [];

      for (const ledger of ledgers) {
        const name = ledger.$?.NAME || ledger.NAME?._ || ledger.NAME || '';
        const closingBalance = parseFloat(String(ledger.CLOSINGBALANCE?._ || ledger.CLOSINGBALANCE || '0').replace(/[^\d.-]/g, '')) || 0;

        if (!name || closingBalance === 0) continue;

        // Extract bill allocations
        let billAllocs = ledger['BILLALLOCATIONS.LIST'];
        if (!billAllocs) {
          results.push({ partyName: name, totalOutstanding: Math.abs(closingBalance), bills: [] });
          continue;
        }
        billAllocs = Array.isArray(billAllocs) ? billAllocs : [billAllocs];

        const bills = [];
        for (const bill of billAllocs) {
          const billName = bill.NAME?._ || bill.NAME || '';
          const billDate = bill.BILLDATE?._ || bill.BILLDATE || '';
          const billClosing = parseFloat(String(bill.CLOSINGBALANCE?._ || bill.CLOSINGBALANCE || '0').replace(/[^\d.-]/g, '')) || 0;
          const creditPeriod = parseInt(String(bill.BILLCREDITPERIOD?._ || bill.BILLCREDITPERIOD || '0').replace(/[^\d]/g, '')) || 0;

          if (billClosing === 0) continue;

          // Calculate ageing
          let ageingDays = 0;
          let ageingBucket = '0-30';
          if (billDate) {
            const dateStr = String(billDate).replace(/-/g, '');
            if (dateStr.length === 8) {
              const billDateObj = new Date(
                parseInt(dateStr.substring(0, 4)),
                parseInt(dateStr.substring(4, 6)) - 1,
                parseInt(dateStr.substring(6, 8))
              );
              ageingDays = Math.floor((today - billDateObj) / (1000 * 60 * 60 * 24));
            }
          }
          if (ageingDays > 90) ageingBucket = '90+';
          else if (ageingDays > 60) ageingBucket = '60-90';
          else if (ageingDays > 30) ageingBucket = '30-60';
          else ageingBucket = '0-30';

          bills.push({
            billName,
            billDate,
            closingBalance: Math.abs(billClosing),
            creditPeriod,
            ageingDays,
            ageingBucket
          });
        }

        results.push({
          partyName: name,
          totalOutstanding: Math.abs(closingBalance),
          bills
        });
      }

      return results.sort((a, b) => b.totalOutstanding - a.totalOutstanding);
    } catch (error) {
      console.error('Error fetching ledger bill allocations:', error.message);
      return [];
    }
  }

  /**
   * Get Profit & Loss data from Tally
   * Fetches all ledgers under P&L-relevant groups
   */
  async getProfitAndLoss(fromDate = null, toDate = null, companyOverride = null) {
    const companyVar = this.getCompanyVar(companyOverride);
    const dateVars = fromDate && toDate
      ? `<SVFROMDATE>${fromDate}</SVFROMDATE><SVTODATE>${toDate}</SVTODATE>`
      : '';

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>PLLedgers</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
${dateVars}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="PLLedgers" ISMODIFY="No">
<TYPE>Ledger</TYPE>
<FETCH>NAME,PARENT,CLOSINGBALANCE,OPENINGBALANCE</FETCH>
<FILTER>IsPLLedger</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="IsPLLedger">$$IsSales:$Parent OR $$IsPurchase:$Parent OR $$IsDirectExpenses:$Parent OR $$IsIndirectExpenses:$Parent OR $$IsDirectIncomes:$Parent OR $$IsIndirectIncomes:$Parent</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      const response = await this.sendRequest(xml);
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) return this._emptyPL(fromDate, toDate);

      let ledgers = collection.LEDGER;
      if (!ledgers) return this._emptyPL(fromDate, toDate);
      ledgers = Array.isArray(ledgers) ? ledgers : [ledgers];

      // Categorize by parent group
      const salesAccounts = [];
      const purchaseAccounts = [];
      const directExpenses = [];
      const indirectExpenses = [];
      const directIncomes = [];
      const indirectIncomes = [];

      // Known Tally group names for P&L
      const salesGroups = ['sales accounts', 'sales account'];
      const purchaseGroups = ['purchase accounts', 'purchase account'];
      const directExpGroups = ['direct expenses', 'direct expense', 'manufacturing expenses'];
      const indirectExpGroups = ['indirect expenses', 'indirect expense', 'administrative expenses', 'selling expenses'];
      const directIncGroups = ['direct incomes', 'direct income'];
      const indirectIncGroups = ['indirect incomes', 'indirect income'];

      for (const ledger of ledgers) {
        const name = ledger.$?.NAME || ledger.NAME?._ || ledger.NAME || '';
        const parent = (ledger.PARENT?._ || ledger.PARENT || '').toLowerCase();
        const balance = parseFloat(String(ledger.CLOSINGBALANCE?._ || ledger.CLOSINGBALANCE || '0').replace(/[^\d.-]/g, '')) || 0;

        if (!name) continue;
        const entry = { name, parent: ledger.PARENT?._ || ledger.PARENT || '', balance: Math.abs(balance) };

        if (salesGroups.includes(parent)) salesAccounts.push(entry);
        else if (purchaseGroups.includes(parent)) purchaseAccounts.push(entry);
        else if (directExpGroups.some(g => parent.includes(g))) directExpenses.push(entry);
        else if (indirectExpGroups.some(g => parent.includes(g))) indirectExpenses.push(entry);
        else if (directIncGroups.some(g => parent.includes(g))) directIncomes.push(entry);
        else if (indirectIncGroups.some(g => parent.includes(g))) indirectIncomes.push(entry);
      }

      const totalSales = salesAccounts.reduce((s, l) => s + l.balance, 0);
      const totalPurchases = purchaseAccounts.reduce((s, l) => s + l.balance, 0);
      const totalDirectExp = directExpenses.reduce((s, l) => s + l.balance, 0);
      const totalIndirectExp = indirectExpenses.reduce((s, l) => s + l.balance, 0);
      const totalDirectInc = directIncomes.reduce((s, l) => s + l.balance, 0);
      const totalIndirectInc = indirectIncomes.reduce((s, l) => s + l.balance, 0);

      const grossProfit = totalSales + totalDirectInc - totalPurchases - totalDirectExp;
      const netProfit = grossProfit + totalIndirectInc - totalIndirectExp;

      return {
        income: {
          salesAccounts, directIncomes, indirectIncomes,
          totalSales, totalDirectInc, totalIndirectInc,
          totalIncome: totalSales + totalDirectInc + totalIndirectInc
        },
        expenses: {
          purchaseAccounts, directExpenses, indirectExpenses,
          totalPurchases, totalDirectExp, totalIndirectExp,
          totalExpenses: totalPurchases + totalDirectExp + totalIndirectExp
        },
        grossProfit,
        netProfit,
        period: { from: fromDate, to: toDate }
      };
    } catch (error) {
      console.error('Error fetching P&L:', error.message);
      return this._emptyPL(fromDate, toDate);
    }
  }

  _emptyPL(from, to) {
    return {
      income: { salesAccounts: [], directIncomes: [], indirectIncomes: [], totalSales: 0, totalDirectInc: 0, totalIndirectInc: 0, totalIncome: 0 },
      expenses: { purchaseAccounts: [], directExpenses: [], indirectExpenses: [], totalPurchases: 0, totalDirectExp: 0, totalIndirectExp: 0, totalExpenses: 0 },
      grossProfit: 0, netProfit: 0, period: { from, to }
    };
  }

  /**
   * Get stock groups with closing balance and value
   */
  async getStockGroups(companyOverride = null) {
    const companyVar = this.getCompanyVar(companyOverride);

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>StockGroupReport</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="StockGroupReport" ISMODIFY="No">
<TYPE>Stock Group</TYPE>
<FETCH>NAME,PARENT,CLOSINGBALANCE,CLOSINGVALUE,CLOSINGRATE</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      const response = await this.sendRequest(xml);
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) return [];

      let groups = collection.STOCKGROUP || collection['STOCK GROUP'];
      if (!groups) return [];
      groups = Array.isArray(groups) ? groups : [groups];

      return groups.map(g => {
        const name = g.$?.NAME || g.NAME?._ || g.NAME || '';
        const parent = g.PARENT?._ || g.PARENT || '';
        const closingBalance = parseFloat(String(g.CLOSINGBALANCE?._ || g.CLOSINGBALANCE || '0').replace(/[^\d.-]/g, '')) || 0;
        const closingValue = parseFloat(String(g.CLOSINGVALUE?._ || g.CLOSINGVALUE || '0').replace(/[^\d.-]/g, '')) || 0;
        return { name, parent, closingBalance, closingValue };
      }).filter(g => g.name);
    } catch (error) {
      console.error('Error fetching stock groups:', error.message);
      return [];
    }
  }

  /**
   * Get price lists - stock items with price level rates
   */
  async getPriceLists(companyOverride = null) {
    const companyVar = this.getCompanyVar(companyOverride);

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>PriceListColl</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="PriceListColl" ISMODIFY="No">
<TYPE>Stock Item</TYPE>
<FETCH>NAME,PARENT,BASEUNITS,STANDARDPRICE,PRICELEVELLIST.LIST</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      const response = await this.sendRequest(xml);
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) return [];

      let items = collection.STOCKITEM;
      if (!items) return [];
      items = Array.isArray(items) ? items : [items];

      return items.map(item => {
        const name = item.$?.NAME || item.NAME?._ || item.NAME || '';
        const parent = item.PARENT?._ || item.PARENT || '';
        const baseUnits = item.BASEUNITS?._ || item.BASEUNITS || '';
        const standardPrice = parseFloat(String(item.STANDARDPRICE?._ || item.STANDARDPRICE || '0').replace(/[^\d.-]/g, '')) || 0;

        // Parse price level list
        let priceLevelList = item['PRICELEVELLIST.LIST'];
        const priceLevels = [];
        if (priceLevelList) {
          priceLevelList = Array.isArray(priceLevelList) ? priceLevelList : [priceLevelList];
          for (const pl of priceLevelList) {
            const levelName = pl.PRICELEVEL?._ || pl.PRICELEVEL || '';
            const rate = parseFloat(String(pl.RATE?._ || pl.RATE || '0').replace(/[^\d.-]/g, '').split('/')[0]) || 0;
            if (levelName && rate > 0) {
              priceLevels.push({ levelName, rate });
            }
          }
        }

        return { name, parent, baseUnits, standardPrice, priceLevels };
      }).filter(i => i.name);
    } catch (error) {
      console.error('Error fetching price lists:', error.message);
      return [];
    }
  }

  /**
   * Get bank vouchers for reconciliation
   */
  async getBankVouchers(bankLedgerName = 'Bank Account', fromDate = null, toDate = null, companyOverride = null) {
    const companyVar = this.getCompanyVar(companyOverride);
    const safeBankLedger = this.escapeXml(bankLedgerName);
    const dateVars = fromDate && toDate
      ? `<SVFROMDATE>${fromDate}</SVFROMDATE><SVTODATE>${toDate}</SVTODATE>`
      : '';

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>BankVch</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
${dateVars}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="BankVch" ISMODIFY="No">
<TYPE>Voucher</TYPE>
<FETCH>DATE,VOUCHERTYPENAME,VOUCHERNUMBER,PARTYLEDGERNAME,AMOUNT,NARRATION,GUID,MASTERID,EFFECTIVEDATE</FETCH>
<FILTER>IsBankVoucher,NotCancelled</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="IsBankVoucher">$$IsLedgerInVoucher:"${safeBankLedger}"</SYSTEM>
<SYSTEM TYPE="Formulae" NAME="NotCancelled">$$IsEqual:$IsCancelled:No</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      const response = await this.sendRequest(xml);
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) return [];

      let vouchers = collection.VOUCHER;
      if (!vouchers) return [];
      vouchers = Array.isArray(vouchers) ? vouchers : [vouchers];

      return vouchers.map(v => {
        const date = v.DATE?._ || v.DATE || '';
        const voucherType = v.VOUCHERTYPENAME?._ || v.VOUCHERTYPENAME || '';
        const voucherNumber = v.VOUCHERNUMBER?._ || v.VOUCHERNUMBER || '';
        const partyName = v.PARTYLEDGERNAME?._ || v.PARTYLEDGERNAME || '';
        const amount = parseFloat(String(v.AMOUNT?._ || v.AMOUNT || '0').replace(/[^\d.-]/g, '')) || 0;
        const narration = v.NARRATION?._ || v.NARRATION || '';
        const guid = v.GUID?._ || v.GUID || '';
        const masterId = v.MASTERID?._ || v.MASTERID || '';
        return { date, voucherType, voucherNumber, partyName, amount, narration, guid, masterId };
      });
    } catch (error) {
      console.error('Error fetching bank vouchers:', error.message);
      return [];
    }
  }

  /**
   * Get inventory movement - vouchers with stock entries for a date range
   */
  async getInventoryMovement(fromDate, toDate, stockItemName = null, companyOverride = null) {
    const companyVar = this.getCompanyVar(companyOverride);

    let filterList = 'NotCancelled';
    let extraFilter = '';
    if (stockItemName) {
      filterList = 'NotCancelled,MatchStockItem';
      extraFilter = `<SYSTEM TYPE="Formulae" NAME="MatchStockItem">$$IsStockItemInVoucher:${this.escapeXml(stockItemName)}</SYSTEM>`;
    }

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>InvMovement</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
<SVFROMDATE>${fromDate}</SVFROMDATE>
<SVTODATE>${toDate}</SVTODATE>
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="InvMovement" ISMODIFY="No">
<TYPE>Voucher</TYPE>
<FETCH>DATE,VOUCHERTYPENAME,VOUCHERNUMBER,PARTYLEDGERNAME,NARRATION,GUID,MASTERID,ALLINVENTORYENTRIES.LIST</FETCH>
<FILTER>${filterList}</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="NotCancelled">$$IsEqual:$IsCancelled:No</SYSTEM>
${extraFilter}
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      const response = await this.sendRequest(xml);
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) return [];

      let vouchers = collection.VOUCHER;
      if (!vouchers) return [];
      vouchers = Array.isArray(vouchers) ? vouchers : [vouchers];

      const inwardTypes = ['purchase', 'stock journal', 'receipt note', 'delivery note in'];
      const results = [];

      for (const v of vouchers) {
        const date = v.DATE?._ || v.DATE || '';
        const voucherType = v.VOUCHERTYPENAME?._ || v.VOUCHERTYPENAME || '';
        const voucherNumber = v.VOUCHERNUMBER?._ || v.VOUCHERNUMBER || '';
        const partyName = v.PARTYLEDGERNAME?._ || v.PARTYLEDGERNAME || '';
        const narration = v.NARRATION?._ || v.NARRATION || '';

        let entries = v['ALLINVENTORYENTRIES.LIST'];
        if (!entries) continue;
        entries = Array.isArray(entries) ? entries : [entries];

        const items = [];
        for (const entry of entries) {
          const stockItem = entry.STOCKITEMNAME?._ || entry.STOCKITEMNAME || '';
          const qty = parseFloat(String(entry.ACTUALQTY?._ || entry.ACTUALQTY || '0').replace(/[^\d.-]/g, '')) || 0;
          const rate = parseFloat(String(entry.RATE?._ || entry.RATE || '0').replace(/[^\d.-]/g, '').split('/')[0]) || 0;
          const amount = parseFloat(String(entry.AMOUNT?._ || entry.AMOUNT || '0').replace(/[^\d.-]/g, '')) || 0;
          const godown = entry.GODOWNNAME?._ || entry.GODOWNNAME || '';
          const direction = inwardTypes.includes(voucherType.toLowerCase()) ? 'in' : 'out';

          if (stockItem) {
            items.push({ stockItem, quantity: Math.abs(qty), rate, amount: Math.abs(amount), godown, direction });
          }
        }

        if (items.length > 0) {
          results.push({ date, voucherType, voucherNumber, partyName, narration, items });
        }
      }

      return results;
    } catch (error) {
      console.error('Error fetching inventory movement:', error.message);
      return [];
    }
  }
  /**
   * Get Balance Sheet data from Tally
   * Fetches all groups under Balance Sheet categories (Assets, Liabilities, Equity)
   */
  async getBalanceSheet(fromDate = null, toDate = null, companyOverride = null) {
    const companyVar = this.getCompanyVar(companyOverride);
    const dateVars = fromDate && toDate
      ? `<SVFROMDATE>${fromDate}</SVFROMDATE><SVTODATE>${toDate}</SVTODATE>`
      : '';

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>BSGroups</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
${dateVars}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="BSGroups" ISMODIFY="No">
<TYPE>Group</TYPE>
<FETCH>NAME,PARENT,CLOSINGBALANCE,OPENINGBALANCE</FETCH>
<FILTER>IsBSGroup</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="IsBSGroup">NOT $$IsPL:$Name</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      const response = await this.sendRequest(xml);
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) return this._emptyBS(fromDate, toDate);

      let groups = collection.GROUP;
      if (!groups) return this._emptyBS(fromDate, toDate);
      groups = Array.isArray(groups) ? groups : [groups];

      // Categorize groups
      const assetGroups = ['current assets', 'fixed assets', 'investments', 'bank accounts', 'cash-in-hand',
        'deposits (asset)', 'stock-in-hand', 'sundry debtors', 'loans and advances (asset)', 'bank od accounts',
        'loans (liability)', 'secured loans', 'unsecured loans'];
      const liabilityGroups = ['current liabilities', 'sundry creditors', 'duties & taxes',
        'provisions', 'bank od accounts', 'secured loans', 'unsecured loans', 'loans (liability)'];
      const equityGroups = ['capital account', 'reserves & surplus', 'retained earnings'];

      const assets = { fixed: [], current: [], investments: [], other: [] };
      const liabilities = { current: [], longTerm: [], other: [] };
      const equity = [];

      const fixedAssetNames = ['fixed assets'];
      const currentAssetNames = ['current assets', 'bank accounts', 'cash-in-hand', 'sundry debtors',
        'stock-in-hand', 'deposits (asset)', 'loans and advances (asset)'];
      const investmentNames = ['investments'];
      const currentLiabNames = ['current liabilities', 'sundry creditors', 'duties & taxes', 'provisions'];
      const longTermLiabNames = ['secured loans', 'unsecured loans', 'loans (liability)', 'bank od accounts'];

      for (const group of groups) {
        const name = (group.$?.NAME || group.NAME?._ || group.NAME || '').trim();
        const parent = (group.PARENT?._ || group.PARENT || '').trim();
        const closing = parseFloat(String(group.CLOSINGBALANCE?._ || group.CLOSINGBALANCE || '0').replace(/[^\d.-]/g, '')) || 0;
        const opening = parseFloat(String(group.OPENINGBALANCE?._ || group.OPENINGBALANCE || '0').replace(/[^\d.-]/g, '')) || 0;

        if (!name) continue;
        const nameLower = name.toLowerCase();
        const entry = { name, parent, closingBalance: closing, openingBalance: opening };

        if (equityGroups.some(g => nameLower.includes(g))) {
          equity.push(entry);
        } else if (fixedAssetNames.some(g => nameLower.includes(g))) {
          assets.fixed.push(entry);
        } else if (investmentNames.some(g => nameLower.includes(g))) {
          assets.investments.push(entry);
        } else if (currentAssetNames.some(g => nameLower.includes(g))) {
          assets.current.push(entry);
        } else if (longTermLiabNames.some(g => nameLower.includes(g))) {
          liabilities.longTerm.push(entry);
        } else if (currentLiabNames.some(g => nameLower.includes(g))) {
          liabilities.current.push(entry);
        } else {
          // Try to classify by Tally convention: positive = debit (asset), negative = credit (liability)
          if (closing > 0) assets.other.push(entry);
          else if (closing < 0) liabilities.other.push(entry);
        }
      }

      const sum = (arr) => arr.reduce((s, g) => s + Math.abs(g.closingBalance), 0);

      const totalFixedAssets = sum(assets.fixed);
      const totalCurrentAssets = sum(assets.current);
      const totalInvestments = sum(assets.investments);
      const totalOtherAssets = sum(assets.other);
      const totalAssets = totalFixedAssets + totalCurrentAssets + totalInvestments + totalOtherAssets;

      const totalCurrentLiab = sum(liabilities.current);
      const totalLongTermLiab = sum(liabilities.longTerm);
      const totalOtherLiab = sum(liabilities.other);
      const totalLiabilities = totalCurrentLiab + totalLongTermLiab + totalOtherLiab;

      const totalEquity = sum(equity);

      return {
        assets: {
          fixed: assets.fixed, current: assets.current, investments: assets.investments, other: assets.other,
          totalFixed: totalFixedAssets, totalCurrent: totalCurrentAssets, totalInvestments, totalOther: totalOtherAssets, total: totalAssets
        },
        liabilities: {
          current: liabilities.current, longTerm: liabilities.longTerm, other: liabilities.other,
          totalCurrent: totalCurrentLiab, totalLongTerm: totalLongTermLiab, totalOther: totalOtherLiab, total: totalLiabilities
        },
        equity: { items: equity, total: totalEquity },
        netWorth: totalAssets - totalLiabilities,
        period: { from: fromDate, to: toDate }
      };
    } catch (error) {
      console.error('Error fetching Balance Sheet:', error.message);
      return this._emptyBS(fromDate, toDate);
    }
  }

  _emptyBS(from, to) {
    return {
      assets: { fixed: [], current: [], investments: [], other: [], totalFixed: 0, totalCurrent: 0, totalInvestments: 0, totalOther: 0, total: 0 },
      liabilities: { current: [], longTerm: [], other: [], totalCurrent: 0, totalLongTerm: 0, totalOther: 0, total: 0 },
      equity: { items: [], total: 0 },
      netWorth: 0,
      period: { from, to }
    };
  }

  /**
   * Get Trial Balance from Tally
   * Fetches ALL ledgers with opening/closing balances, classified as Dr/Cr
   */
  async getTrialBalance(fromDate = null, toDate = null, companyOverride = null) {
    const companyVar = this.getCompanyVar(companyOverride);
    const dateVars = fromDate && toDate
      ? `<SVFROMDATE>${fromDate}</SVFROMDATE><SVTODATE>${toDate}</SVTODATE>`
      : '';

    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>TBLedgers</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
${dateVars}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="TBLedgers" ISMODIFY="No">
<TYPE>Ledger</TYPE>
<FETCH>NAME,PARENT,CLOSINGBALANCE,OPENINGBALANCE</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      const response = await this.sendRequest(xml);
      const collection = response?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      if (!collection) return this._emptyTB(fromDate, toDate);

      let ledgers = collection.LEDGER;
      if (!ledgers) return this._emptyTB(fromDate, toDate);
      ledgers = Array.isArray(ledgers) ? ledgers : [ledgers];

      const result = [];
      let totalDebit = 0;
      let totalCredit = 0;

      for (const ledger of ledgers) {
        const name = ledger.$?.NAME || ledger.NAME?._ || ledger.NAME || '';
        const parent = ledger.PARENT?._ || ledger.PARENT || '';
        const closing = parseFloat(String(ledger.CLOSINGBALANCE?._ || ledger.CLOSINGBALANCE || '0').replace(/[^\d.-]/g, '')) || 0;
        const opening = parseFloat(String(ledger.OPENINGBALANCE?._ || ledger.OPENINGBALANCE || '0').replace(/[^\d.-]/g, '')) || 0;

        if (!name || closing === 0) continue;

        // Tally convention: positive = Debit, negative = Credit
        const debit = closing > 0 ? closing : 0;
        const credit = closing < 0 ? Math.abs(closing) : 0;

        totalDebit += debit;
        totalCredit += credit;

        result.push({ name, parent, openingBalance: opening, closingBalance: closing, debit, credit });
      }

      // Sort by parent group then name
      result.sort((a, b) => a.parent.localeCompare(b.parent) || a.name.localeCompare(b.name));

      return {
        ledgers: result,
        totalDebit,
        totalCredit,
        difference: Math.abs(totalDebit - totalCredit),
        isBalanced: Math.abs(totalDebit - totalCredit) < 0.01,
        count: result.length,
        period: { from: fromDate, to: toDate }
      };
    } catch (error) {
      console.error('Error fetching Trial Balance:', error.message);
      return this._emptyTB(fromDate, toDate);
    }
  }

  _emptyTB(from, to) {
    return { ledgers: [], totalDebit: 0, totalCredit: 0, difference: 0, isBalanced: true, count: 0, period: { from, to } };
  }

  /**
   * Get Cash Flow data from Tally
   * Fetches vouchers involving Cash and Bank ledgers, categorized into Operating/Investing/Financing
   */
  async getCashFlow(fromDate, toDate, companyOverride = null) {
    const companyVar = this.getCompanyVar(companyOverride);
    const dateVars = fromDate && toDate
      ? `<SVFROMDATE>${fromDate}</SVFROMDATE><SVTODATE>${toDate}</SVTODATE>`
      : '';

    // Fetch cash/bank ledger balances for opening/closing
    const balanceXml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>CashBankLedgers</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
${dateVars}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="CashBankLedgers" ISMODIFY="No">
<TYPE>Ledger</TYPE>
<FETCH>NAME,PARENT,CLOSINGBALANCE,OPENINGBALANCE</FETCH>
<FILTER>IsCashOrBank</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="IsCashOrBank">$$IsCash:$Parent OR $$IsBank:$Parent</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    // Fetch vouchers involving cash/bank
    const voucherXml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>CashBankVch</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
${dateVars}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="CashBankVch" ISMODIFY="No">
<TYPE>Voucher</TYPE>
<FETCH>DATE,VOUCHERTYPENAME,VOUCHERNUMBER,PARTYLEDGERNAME,AMOUNT,NARRATION,ALLLEDGERENTRIES.LIST</FETCH>
<FILTER>NotCancelled</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="NotCancelled">$$IsEqual:$IsCancelled:No</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      // Fetch balances
      const balanceResponse = await this.sendRequest(balanceXml);
      const balanceCollection = balanceResponse?.ENVELOPE?.BODY?.DATA?.COLLECTION;
      let openingCash = 0, closingCash = 0;

      if (balanceCollection) {
        let bLedgers = balanceCollection.LEDGER;
        if (bLedgers) {
          bLedgers = Array.isArray(bLedgers) ? bLedgers : [bLedgers];
          for (const l of bLedgers) {
            const opening = parseFloat(String(l.OPENINGBALANCE?._ || l.OPENINGBALANCE || '0').replace(/[^\d.-]/g, '')) || 0;
            const closing = parseFloat(String(l.CLOSINGBALANCE?._ || l.CLOSINGBALANCE || '0').replace(/[^\d.-]/g, '')) || 0;
            openingCash += opening;
            closingCash += closing;
          }
        }
      }

      // Fetch vouchers
      const voucherResponse = await this.sendRequest(voucherXml);
      const voucherCollection = voucherResponse?.ENVELOPE?.BODY?.DATA?.COLLECTION;

      const operating = { inflows: [], outflows: [] };
      const investing = { inflows: [], outflows: [] };
      const financing = { inflows: [], outflows: [] };

      if (voucherCollection) {
        let vouchers = voucherCollection.VOUCHER;
        if (vouchers) {
          vouchers = Array.isArray(vouchers) ? vouchers : [vouchers];

          // Known group classifications
          const investingKeywords = ['fixed assets', 'investments', 'capital goods'];
          const financingKeywords = ['capital account', 'secured loans', 'unsecured loans', 'loans (liability)', 'bank od accounts', 'reserves & surplus'];

          for (const v of vouchers) {
            const date = v.DATE?._ || v.DATE || '';
            const voucherType = (v.VOUCHERTYPENAME?._ || v.VOUCHERTYPENAME || '').toLowerCase();
            const voucherNumber = v.VOUCHERNUMBER?._ || v.VOUCHERNUMBER || '';
            const partyName = v.PARTYLEDGERNAME?._ || v.PARTYLEDGERNAME || '';
            const amount = parseFloat(String(v.AMOUNT?._ || v.AMOUNT || '0').replace(/[^\d.-]/g, '')) || 0;
            const narration = v.NARRATION?._ || v.NARRATION || '';

            // Check ledger entries to classify
            let entries = v['ALLLEDGERENTRIES.LIST'];
            if (!entries) continue;
            entries = Array.isArray(entries) ? entries : [entries];

            let hasCashBank = false;
            let cashBankAmount = 0;
            let otherLedgerParent = '';

            for (const entry of entries) {
              const ledgerName = (entry.LEDGERNAME?._ || entry.LEDGERNAME || '').toLowerCase();
              const entryAmount = parseFloat(String(entry.AMOUNT?._ || entry.AMOUNT || '0').replace(/[^\d.-]/g, '')) || 0;

              // Check if this entry involves cash/bank
              if (ledgerName.includes('cash') || ledgerName.includes('bank') || ledgerName.includes('petty cash')) {
                hasCashBank = true;
                cashBankAmount = entryAmount;
              } else {
                otherLedgerParent = (entry.LEDGERNAME?._ || entry.LEDGERNAME || '');
              }
            }

            if (!hasCashBank) continue;

            const entry = {
              date, voucherType, voucherNumber, partyName, narration,
              amount: Math.abs(cashBankAmount)
            };

            // Classify based on the other ledger involved
            const otherLower = otherLedgerParent.toLowerCase();
            let category = operating; // default

            if (investingKeywords.some(k => otherLower.includes(k))) {
              category = investing;
            } else if (financingKeywords.some(k => otherLower.includes(k))) {
              category = financing;
            }

            // Positive cashBankAmount = money going out (debit to cash/bank in Tally is positive)
            // In Tally: negative amount on cash/bank = inflow (credit), positive = outflow (debit)
            if (cashBankAmount < 0) {
              category.inflows.push(entry);
            } else {
              category.outflows.push(entry);
            }
          }
        }
      }

      const sumEntries = (entries) => entries.reduce((s, e) => s + e.amount, 0);
      const operatingNet = sumEntries(operating.inflows) - sumEntries(operating.outflows);
      const investingNet = sumEntries(investing.inflows) - sumEntries(investing.outflows);
      const financingNet = sumEntries(financing.inflows) - sumEntries(financing.outflows);

      return {
        operating: { ...operating, totalInflow: sumEntries(operating.inflows), totalOutflow: sumEntries(operating.outflows), net: operatingNet },
        investing: { ...investing, totalInflow: sumEntries(investing.inflows), totalOutflow: sumEntries(investing.outflows), net: investingNet },
        financing: { ...financing, totalInflow: sumEntries(financing.inflows), totalOutflow: sumEntries(financing.outflows), net: financingNet },
        netCashFlow: operatingNet + investingNet + financingNet,
        openingCash: Math.abs(openingCash),
        closingCash: Math.abs(closingCash),
        period: { from: fromDate, to: toDate }
      };
    } catch (error) {
      console.error('Error fetching Cash Flow:', error.message);
      return {
        operating: { inflows: [], outflows: [], totalInflow: 0, totalOutflow: 0, net: 0 },
        investing: { inflows: [], outflows: [], totalInflow: 0, totalOutflow: 0, net: 0 },
        financing: { inflows: [], outflows: [], totalInflow: 0, totalOutflow: 0, net: 0 },
        netCashFlow: 0, openingCash: 0, closingCash: 0,
        period: { from: fromDate, to: toDate }
      };
    }
  }

  /**
   * Get Ratio Analysis — computed from Balance Sheet + P&L data
   * No new Tally request — combines existing data
   */
  async getRatioAnalysis(fromDate = null, toDate = null, companyOverride = null) {
    try {
      const [bs, pl] = await Promise.all([
        this.getBalanceSheet(fromDate, toDate, companyOverride),
        this.getProfitAndLoss(fromDate, toDate, companyOverride)
      ]);

      const totalAssets = bs.assets.total || 1;
      const totalCurrentAssets = bs.assets.totalCurrent || 0;
      const totalCurrentLiab = bs.liabilities.totalCurrent || 1;
      const totalLiabilities = bs.liabilities.total || 1;
      const totalEquity = bs.equity.total || 1;
      const stockInHand = bs.assets.current.filter(g => g.name.toLowerCase().includes('stock')).reduce((s, g) => s + Math.abs(g.closingBalance), 0);

      const totalSales = pl.income.totalSales || 1;
      const totalPurchases = pl.expenses.totalPurchases || 0;
      const grossProfit = pl.grossProfit || 0;
      const netProfit = pl.netProfit || 0;
      const operatingExpenses = pl.expenses.totalDirectExp + pl.expenses.totalIndirectExp;

      const safe = (n, d) => d === 0 ? 0 : n / d;

      return {
        liquidity: {
          currentRatio: { value: safe(totalCurrentAssets, totalCurrentLiab), formula: 'Current Assets / Current Liabilities', good: '> 1.5' },
          quickRatio: { value: safe(totalCurrentAssets - stockInHand, totalCurrentLiab), formula: '(Current Assets - Stock) / Current Liabilities', good: '> 1.0' }
        },
        leverage: {
          debtEquityRatio: { value: safe(totalLiabilities, totalEquity), formula: 'Total Liabilities / Equity', good: '< 2.0' },
          debtRatio: { value: safe(totalLiabilities, totalAssets), formula: 'Total Liabilities / Total Assets', good: '< 0.5' }
        },
        profitability: {
          grossProfitMargin: { value: safe(grossProfit, totalSales) * 100, formula: 'Gross Profit / Sales x 100', good: '> 30%', unit: '%' },
          netProfitMargin: { value: safe(netProfit, totalSales) * 100, formula: 'Net Profit / Sales x 100', good: '> 10%', unit: '%' },
          operatingProfitMargin: { value: safe(totalSales - totalPurchases - operatingExpenses, totalSales) * 100, formula: '(Sales - COGS - OpEx) / Sales x 100', good: '> 15%', unit: '%' },
          returnOnEquity: { value: safe(netProfit, totalEquity) * 100, formula: 'Net Profit / Equity x 100', good: '> 15%', unit: '%' },
          returnOnAssets: { value: safe(netProfit, totalAssets) * 100, formula: 'Net Profit / Total Assets x 100', good: '> 5%', unit: '%' }
        },
        efficiency: {
          inventoryTurnover: { value: safe(totalPurchases, stockInHand), formula: 'Purchases / Average Stock', good: '> 5' },
          debtorsTurnover: { value: safe(totalSales, bs.assets.current.filter(g => g.name.toLowerCase().includes('debtor')).reduce((s, g) => s + Math.abs(g.closingBalance), 0) || 1), formula: 'Sales / Sundry Debtors', good: '> 8' },
          creditorsTurnover: { value: safe(totalPurchases, bs.liabilities.current.filter(g => g.name.toLowerCase().includes('creditor')).reduce((s, g) => s + Math.abs(g.closingBalance), 0) || 1), formula: 'Purchases / Sundry Creditors', good: '> 6' }
        },
        period: { from: fromDate, to: toDate }
      };
    } catch (error) {
      console.error('Error computing ratio analysis:', error.message);
      return {
        liquidity: {}, leverage: {}, profitability: {}, efficiency: {},
        period: { from: fromDate, to: toDate }, error: error.message
      };
    }
  }

  /**
   * Get voucher list from Tally for XML viewer (basic fields, date range)
   */
  async getVouchersXmlList(fromDate, toDate) {
    const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>XmlViewList</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
<SVFROMDATE>${fromDate}</SVFROMDATE>
<SVTODATE>${toDate}</SVTODATE>
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="XmlViewList" ISMODIFY="No">
<TYPE>Voucher</TYPE>
<FETCH>DATE,VOUCHERTYPENAME,VOUCHERNUMBER,PARTYLEDGERNAME,PARTYNAME,AMOUNT,NARRATION,GUID,MASTERID,ALTERID</FETCH>
</COLLECTION>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      const response = await this.sendRequest(xml);
      let vouchers = response?.ENVELOPE?.BODY?.DESC?.DATA?.COLLECTION?.VOUCHER
                  || response?.ENVELOPE?.COLLECTION?.VOUCHER
                  || response?.ENVELOPE?.BODY?.DATA?.COLLECTION?.VOUCHER
                  || [];

      if (!Array.isArray(vouchers)) vouchers = vouchers ? [vouchers] : [];

      const safeStr = (val) => {
        if (val == null) return '';
        if (typeof val === 'string') return val;
        if (typeof val === 'number') return String(val);
        if (val._ != null) return String(val._);
        return '';
      };

      return vouchers.map(v => ({
        guid: v.GUID || v.$?.GUID || '',
        masterId: safeStr(v.MASTERID),
        alterId: safeStr(v.ALTERID),
        date: safeStr(v.DATE),
        voucherType: safeStr(v.VOUCHERTYPENAME),
        voucherNumber: safeStr(v.VOUCHERNUMBER),
        partyLedgerName: safeStr(v.PARTYLEDGERNAME),
        partyName: safeStr(v.PARTYNAME),
        amount: safeStr(v.AMOUNT),
        narration: safeStr(v.NARRATION)
      }));
    } catch (error) {
      console.error('Error fetching vouchers XML list:', error.message);
      throw error;
    }
  }

  /**
   * Get full raw XML for a single voucher by MasterID
   */
  async getVoucherRawXml(masterId) {
    const companyVar = this.companyName ? `<SVCURRENTCOMPANY>${this.escapeXml(this.companyName)}</SVCURRENTCOMPANY>` : '';
    const xml = `<ENVELOPE>
<HEADER><VERSION>1</VERSION><TALLYREQUEST>Export</TALLYREQUEST><TYPE>Collection</TYPE><ID>VchXmlDetail</ID></HEADER>
<BODY>
<DESC>
<STATICVARIABLES>
<SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
${companyVar}
</STATICVARIABLES>
<TDL>
<TDLMESSAGE>
<COLLECTION NAME="VchXmlDetail" ISMODIFY="No">
<TYPE>Voucher</TYPE>
<FETCH>*,ALLLEDGERENTRIES.LIST,ALLINVENTORYENTRIES.LIST,LEDGERENTRIES.LIST,INVENTORYENTRIES.LIST</FETCH>
<FILTER>MasterFilter</FILTER>
</COLLECTION>
<SYSTEM TYPE="Formulae" NAME="MasterFilter">$MASTERID = ${masterId}</SYSTEM>
</TDLMESSAGE>
</TDL>
</DESC>
</BODY>
</ENVELOPE>`;

    try {
      // Get raw XML for display
      const rawXml = await this.sendRawRequest(xml);
      // Also parse it for structured JSON view
      const parsed = await parseStringPromise(rawXml, {
        explicitArray: true,
        ignoreAttrs: false,
        trim: true
      });
      return { rawXml, parsed };
    } catch (error) {
      console.error('Error fetching voucher raw XML:', error.message);
      throw error;
    }
  }
}

export const tallyConnector = new TallyConnector();
export default tallyConnector;
