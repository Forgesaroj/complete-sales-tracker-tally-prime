/**
 * Fonepay Scraper Service
 * Automates login and data extraction from Fonepay merchant portal
 *
 * Features:
 * - Automated login with username/password
 * - Extracts transaction history, balance, and settlements
 * - Runs on configurable interval (default: 1 minute)
 * - Real-time updates via Socket.io
 */

import puppeteer from 'puppeteer';
import { db } from '../database/database.js';

class FonepayService {
  constructor() {
    this.browser = null;
    this.page = null;
    this.io = null;
    this.syncInterval = null;
    this.isRunning = false;
    this.lastSyncTime = null;
    this.status = 'idle';
    this.error = null;

    // Configuration from environment variables
    this.config = {
      loginUrl: 'https://login.fonepay.com/#/',
      paymentsUrl: 'https://login.fonepay.com/#/payments',
      username: process.env.FONEPAY_USERNAME || '',
      password: process.env.FONEPAY_PASSWORD || '',
      intervalMs: parseInt(process.env.FONEPAY_INTERVAL_MS) || 60000, // 1 minute default
      headless: process.env.FONEPAY_HEADLESS !== 'false' // true by default
    };
  }

  /**
   * Set Socket.io instance for real-time updates
   */
  setSocketIO(io) {
    this.io = io;
  }

  /**
   * Get current service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      status: this.status,
      lastSyncTime: this.lastSyncTime,
      error: this.error,
      intervalMs: this.config.intervalMs,
      configured: !!(this.config.username && this.config.password)
    };
  }

  /**
   * Initialize browser instance
   */
  async initBrowser() {
    if (this.browser) {
      return;
    }

    console.log('[Fonepay] Launching browser...');
    this.browser = await puppeteer.launch({
      headless: this.config.headless,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--window-size=1366,768'
      ]
    });

    this.page = await this.browser.newPage();

    // Set viewport and user agent
    await this.page.setViewport({ width: 1366, height: 768 });
    await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    console.log('[Fonepay] Browser initialized');
  }

  /**
   * Login to Fonepay portal
   */
  async login() {
    if (!this.config.username || !this.config.password) {
      throw new Error('Fonepay credentials not configured. Set FONEPAY_USERNAME and FONEPAY_PASSWORD in .env');
    }

    console.log('[Fonepay] Navigating to login page...');
    await this.page.goto(this.config.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for the Angular app to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Take screenshot of login page
    await this.takeScreenshot('login-page');

    console.log('[Fonepay] Waiting for login form...');

    // Wait for any input field
    await this.page.waitForSelector('input', { timeout: 15000 });

    // Get all input fields
    const inputs = await this.page.$$('input');
    console.log(`[Fonepay] Found ${inputs.length} input fields`);

    // Fill username - find the first visible input that's not password type
    console.log('[Fonepay] Filling username...');

    // Use page.evaluate to find and fill the username input more reliably
    await this.page.evaluate((username) => {
      const inputs = document.querySelectorAll('input');
      for (const input of inputs) {
        // Skip hidden inputs and password inputs
        if (input.type === 'password' || input.type === 'hidden') continue;
        // Check if visible
        const style = window.getComputedStyle(input);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        // This should be the username field
        input.focus();
        input.value = username;
        // Trigger input event for Angular
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('Filled username in:', input);
        break;
      }
    }, this.config.username);

    // Small delay
    await new Promise(resolve => setTimeout(resolve, 500));

    // Fill password field using page.evaluate
    console.log('[Fonepay] Filling password...');
    await this.page.evaluate((password) => {
      const passwordInput = document.querySelector('input[type="password"]');
      if (passwordInput) {
        passwordInput.focus();
        passwordInput.value = password;
        // Trigger input event for Angular
        passwordInput.dispatchEvent(new Event('input', { bubbles: true }));
        passwordInput.dispatchEvent(new Event('change', { bubbles: true }));
        console.log('Filled password');
      }
    }, this.config.password);

    // Take screenshot after filling form
    await this.takeScreenshot('login-filled');

    // Small delay before clicking
    await new Promise(resolve => setTimeout(resolve, 500));

    // Find and click login/sign in button
    console.log('[Fonepay] Looking for submit button...');

    // Try multiple button selectors
    const buttonClicked = await this.page.evaluate(() => {
      // Look for buttons with various text
      const buttons = document.querySelectorAll('button, input[type="submit"]');
      for (const btn of buttons) {
        const text = (btn.innerText || btn.value || '').toLowerCase();
        if (text.includes('sign in') || text.includes('login') || text.includes('submit')) {
          btn.click();
          return true;
        }
      }
      // Try clicking any button with type submit
      const submitBtn = document.querySelector('button[type="submit"]');
      if (submitBtn) {
        submitBtn.click();
        return true;
      }
      return false;
    });

    console.log(`[Fonepay] Button clicked: ${buttonClicked}`);

    // Wait for navigation or page change
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Take screenshot after login attempt
    await this.takeScreenshot('after-login');

    const currentUrl = this.page.url();
    console.log(`[Fonepay] Current URL after login: ${currentUrl}`);

    // Check the hash route, not domain (domain is login.fonepay.com but hash changes)
    const hashRoute = currentUrl.split('#')[1] || '';
    if (hashRoute === '/' || hashRoute === '' || hashRoute.includes('signin')) {
      console.log('[Fonepay] Warning: Still on login page, login may have failed');
      // Check for error messages
      const errorText = await this.page.evaluate(() => {
        const errors = document.querySelectorAll('.error, .alert, [class*="error"], [class*="alert"]');
        return Array.from(errors).map(e => e.innerText).join(' ');
      });
      if (errorText) {
        console.log('[Fonepay] Error messages:', errorText);
      }
    } else {
      console.log('[Fonepay] Login successful! Route:', hashRoute);
    }
  }

  /**
   * Check if currently logged in by verifying page content
   */
  async isLoggedIn() {
    try {
      const url = this.page.url();
      // Check hash route, not domain (domain is login.fonepay.com)
      const hashRoute = url.split('#')[1] || '';

      // If we're on the root hash route or no hash, we're on login page
      if (hashRoute === '/' || hashRoute === '' || hashRoute.includes('signin')) {
        return false;
      }

      // Also check if the page has content (not blank)
      const pageContent = await this.page.evaluate(() => document.body.innerText || '');
      if (pageContent.length < 50) {
        console.log('[Fonepay] Page appears blank, assuming not logged in');
        return false;
      }

      // Check if it's the merchant panel
      if (pageContent.includes('Merchant Panel') || pageContent.includes('Payments')) {
        return true;
      }

      return false;
    } catch (e) {
      console.log('[Fonepay] Error checking login status:', e.message);
      return false;
    }
  }

  /**
   * Close browser and cleanup
   */
  async closeBrowser() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {
        console.log('[Fonepay] Error closing browser:', e.message);
      }
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Extract data from payments page
   */
  async extractPaymentsData() {
    console.log('[Fonepay] Extracting payments page data...');

    const data = {
      balance: 0,
      todayTransactions: 0,
      todayAmount: 0,
      pendingSettlement: 0,
      extractedAt: new Date().toISOString()
    };

    try {
      // Wait for page content to load
      await this.page.waitForSelector('table, .card, .summary, [class*="balance"], [class*="total"]', { timeout: 15000 }).catch(() => {});

      // Extract data from the payments page
      const extractedData = await this.page.evaluate(() => {
        const result = {
          balance: 0,
          todayTransactions: 0,
          todayAmount: 0,
          pendingSettlement: 0,
          pageText: document.body.innerText.substring(0, 2000) // First 2000 chars for debugging
        };

        // Look for any numbers that could be balance/amounts
        const allText = document.body.innerText;

        // Find amounts in format like "Rs. 1,234.56" or "NPR 1234"
        const amountMatches = allText.match(/(?:Rs\.?|NPR|रू\.?)\s*([\d,]+\.?\d*)/gi);
        if (amountMatches) {
          amountMatches.forEach(match => {
            const numStr = match.replace(/[^\d.,]/g, '').replace(/,/g, '');
            const num = parseFloat(numStr);
            if (!isNaN(num) && num > result.balance) {
              result.balance = num;
            }
          });
        }

        // Count table rows as transactions
        const tableRows = document.querySelectorAll('table tbody tr');
        result.todayTransactions = tableRows.length;

        // Sum up amounts from table
        tableRows.forEach(row => {
          const cells = row.querySelectorAll('td');
          cells.forEach(cell => {
            const text = cell.innerText || '';
            const numMatch = text.match(/[\d,]+\.?\d*/);
            if (numMatch) {
              const num = parseFloat(numMatch[0].replace(/,/g, ''));
              if (!isNaN(num) && num > 0 && num < 1000000) {
                result.todayAmount += num;
              }
            }
          });
        });

        return result;
      });

      Object.assign(data, extractedData);
      console.log('[Fonepay] Payments data extracted:', JSON.stringify(data, null, 2));

    } catch (error) {
      console.error('[Fonepay] Error extracting payments data:', error.message);
    }

    return data;
  }

  /**
   * Extract transactions from payments page table
   * Table columns: Action, Transmission Date, PRN (Third Party), Terminal ID, Terminal Name, PRN (Hub), Initiator, Transaction Amount, Payment Status, Issuer Name
   */
  async extractPaymentsTransactions() {
    console.log('[Fonepay] Extracting transactions from payments page...');

    const transactions = [];

    try {
      // Wait for table to load
      await this.page.waitForSelector('table', { timeout: 10000 }).catch(() => {});

      // Extract transactions from table with proper column mapping
      const extractedTransactions = await this.page.evaluate(() => {
        const txns = [];
        const tables = document.querySelectorAll('table');

        tables.forEach(table => {
          const rows = table.querySelectorAll('tbody tr');

          rows.forEach((row, index) => {
            if (index >= 100) return; // Limit to 100 transactions

            const cells = row.querySelectorAll('td');
            const cellTexts = Array.from(cells).map(c => (c.innerText || '').trim());

            // Column mapping based on Fonepay Payment Details table:
            // 0: Action (menu icon)
            // 1: Transmission Date
            // 2: PRN (Third Party)
            // 3: Terminal ID
            // 4: Terminal Name
            // 5: PRN (Hub)
            // 6: Initiator (phone number)
            // 7: Transaction Amount
            // 8: Payment Status
            // 9: Issuer Name

            if (cellTexts.length >= 8) {
              const txn = {
                transmissionDate: cellTexts[1] || '',
                prnThirdParty: cellTexts[2] || 'N/A',
                terminalId: cellTexts[3] || '',
                terminalName: cellTexts[4] || '',
                prnHub: cellTexts[5] || 'N/A',
                initiator: cellTexts[6] || '',
                amount: 0,
                status: (cellTexts[8] || '').toLowerCase(),
                issuerName: cellTexts[9] || '',
                // Legacy fields for backward compatibility
                id: '',
                date: cellTexts[1] || '',
                description: cellTexts[2] || 'N/A',
                type: 'payment',
                rawData: cellTexts.join(' | ')
              };

              // Parse amount (remove commas and convert to number)
              const amountText = cellTexts[7] || '0';
              const amount = parseFloat(amountText.replace(/[^\d.]/g, ''));
              if (!isNaN(amount)) {
                txn.amount = amount;
              }

              // Only add if we have meaningful data
              if (txn.amount > 0 || txn.terminalId) {
                txns.push(txn);
              }
            }
          });
        });

        return txns;
      });

      transactions.push(...extractedTransactions);
      console.log(`[Fonepay] Extracted ${transactions.length} transactions from payments page`);

      // Log first few transactions for debugging
      if (transactions.length > 0) {
        console.log('[Fonepay] Sample transactions:', JSON.stringify(transactions.slice(0, 3), null, 2));
      }

    } catch (error) {
      console.error('[Fonepay] Error extracting payments transactions:', error.message);
    }

    return transactions;
  }

  /**
   * Extract dashboard data (balance, summary)
   */
  async extractDashboardData() {
    console.log('[Fonepay] Extracting dashboard data...');

    const data = {
      balance: 0,
      todayTransactions: 0,
      todayAmount: 0,
      pendingSettlement: 0,
      extractedAt: new Date().toISOString()
    };

    try {
      // Wait for dashboard content to load
      await this.page.waitForSelector('.dashboard, .summary, .balance, [class*="card"], [class*="stat"]', { timeout: 10000 }).catch(() => {});

      // Extract data from the page
      const extractedData = await this.page.evaluate(() => {
        const result = {
          balance: 0,
          todayTransactions: 0,
          todayAmount: 0,
          pendingSettlement: 0,
          rawText: document.body.innerText
        };

        // Look for balance-related elements
        const balanceElements = document.querySelectorAll('[class*="balance"], [class*="amount"], [class*="total"]');
        balanceElements.forEach(el => {
          const text = el.innerText || '';
          const numbers = text.match(/[\d,]+\.?\d*/g);
          if (numbers && numbers.length > 0) {
            const num = parseFloat(numbers[0].replace(/,/g, ''));
            if (!isNaN(num) && num > result.balance) {
              result.balance = num;
            }
          }
        });

        // Look for transaction count
        const countElements = document.querySelectorAll('[class*="count"], [class*="transaction"]');
        countElements.forEach(el => {
          const text = el.innerText || '';
          const numbers = text.match(/\d+/g);
          if (numbers && numbers.length > 0) {
            const num = parseInt(numbers[0]);
            if (!isNaN(num) && num < 10000) { // Likely a count, not an amount
              result.todayTransactions = num;
            }
          }
        });

        return result;
      });

      Object.assign(data, extractedData);
      console.log('[Fonepay] Dashboard data extracted:', data);

    } catch (error) {
      console.error('[Fonepay] Error extracting dashboard data:', error.message);
    }

    return data;
  }

  /**
   * Extract transaction history
   */
  async extractTransactions() {
    console.log('[Fonepay] Extracting transactions...');

    const transactions = [];

    try {
      // Navigate to transactions page if not already there
      const transactionLinks = [
        'a[href*="transaction"]',
        'a[href*="history"]',
        'a:contains("Transactions")',
        'a:contains("History")',
        '[routerlink*="transaction"]'
      ];

      for (const selector of transactionLinks) {
        try {
          const link = await this.page.$(selector);
          if (link) {
            await link.click();
            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 2000));
            break;
          }
        } catch (e) {
          continue;
        }
      }

      // Wait for table to load
      await this.page.waitForSelector('table, .transaction-list, [class*="table"]', { timeout: 10000 }).catch(() => {});

      // Extract transactions from table
      const extractedTransactions = await this.page.evaluate(() => {
        const txns = [];
        const rows = document.querySelectorAll('table tbody tr, .transaction-item, [class*="transaction-row"]');

        rows.forEach((row, index) => {
          if (index >= 100) return; // Limit to 100 transactions

          const cells = row.querySelectorAll('td, .cell, [class*="col"]');
          const rowText = row.innerText || '';

          // Try to parse transaction data
          const txn = {
            id: '',
            date: '',
            description: '',
            amount: 0,
            status: '',
            type: ''
          };

          // Extract from cells if available
          if (cells.length >= 3) {
            cells.forEach((cell, cellIndex) => {
              const text = (cell.innerText || '').trim();

              // Detect date (format: YYYY-MM-DD or DD/MM/YYYY)
              if (text.match(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/)) {
                txn.date = text;
              }
              // Detect amount (number with possible decimals)
              else if (text.match(/^[\d,]+\.?\d*$/)) {
                const amount = parseFloat(text.replace(/,/g, ''));
                if (!isNaN(amount)) {
                  txn.amount = amount;
                }
              }
              // Detect status
              else if (text.match(/success|failed|pending|completed/i)) {
                txn.status = text.toLowerCase();
              }
              // First cell might be ID
              else if (cellIndex === 0 && text.length < 30) {
                txn.id = text;
              }
              // Otherwise it's likely description
              else if (text.length > 0 && text.length < 100) {
                txn.description = text;
              }
            });
          }

          if (txn.amount > 0 || txn.id) {
            txns.push(txn);
          }
        });

        return txns;
      });

      transactions.push(...extractedTransactions);
      console.log(`[Fonepay] Extracted ${transactions.length} transactions`);

    } catch (error) {
      console.error('[Fonepay] Error extracting transactions:', error.message);
    }

    return transactions;
  }

  /**
   * Extract settlement/payout information
   */
  async extractSettlements() {
    console.log('[Fonepay] Extracting settlements...');

    const settlements = [];

    try {
      // Navigate to settlements page
      const settlementLinks = [
        'a[href*="settlement"]',
        'a[href*="payout"]',
        'a:contains("Settlement")',
        'a:contains("Payout")',
        '[routerlink*="settlement"]'
      ];

      for (const selector of settlementLinks) {
        try {
          const link = await this.page.$(selector);
          if (link) {
            await link.click();
            await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
            await new Promise(resolve => setTimeout(resolve, 2000));
            break;
          }
        } catch (e) {
          continue;
        }
      }

      // Wait for content to load
      await this.page.waitForSelector('table, .settlement-list, [class*="table"]', { timeout: 10000 }).catch(() => {});

      // Extract settlement data
      const extractedSettlements = await this.page.evaluate(() => {
        const stmts = [];
        const rows = document.querySelectorAll('table tbody tr, .settlement-item');

        rows.forEach((row, index) => {
          if (index >= 50) return;

          const cells = row.querySelectorAll('td');
          const settlement = {
            id: '',
            date: '',
            amount: 0,
            status: '',
            bankRef: ''
          };

          cells.forEach((cell, cellIndex) => {
            const text = (cell.innerText || '').trim();

            if (text.match(/\d{4}-\d{2}-\d{2}|\d{2}\/\d{2}\/\d{4}/)) {
              settlement.date = text;
            } else if (text.match(/^[\d,]+\.?\d*$/)) {
              const amount = parseFloat(text.replace(/,/g, ''));
              if (!isNaN(amount)) {
                settlement.amount = amount;
              }
            } else if (text.match(/success|pending|processed/i)) {
              settlement.status = text.toLowerCase();
            } else if (cellIndex === 0) {
              settlement.id = text;
            }
          });

          if (settlement.amount > 0) {
            stmts.push(settlement);
          }
        });

        return stmts;
      });

      settlements.push(...extractedSettlements);
      console.log(`[Fonepay] Extracted ${settlements.length} settlements`);

    } catch (error) {
      console.error('[Fonepay] Error extracting settlements:', error.message);
    }

    return settlements;
  }

  /**
   * Take screenshot for debugging
   */
  async takeScreenshot(name = 'fonepay') {
    if (!this.page) return null;

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `/tmp/${name}-${timestamp}.png`;

    try {
      await this.page.screenshot({ path: filename, fullPage: true });
      console.log(`[Fonepay] Screenshot saved: ${filename}`);
      return filename;
    } catch (error) {
      console.error('[Fonepay] Screenshot failed:', error.message);
      return null;
    }
  }

  /**
   * Main sync function - incremental sync from last date to today
   */
  async sync() {
    if (!this.config.username || !this.config.password) {
      console.log('[Fonepay] Skipping sync - credentials not configured');
      return { success: false, error: 'Credentials not configured' };
    }

    // Prevent concurrent syncs
    if (this.status === 'syncing') {
      console.log('[Fonepay] Sync already in progress, skipping');
      return { success: false, error: 'Sync already in progress' };
    }

    this.status = 'syncing';
    this.error = null;
    this.emitStatus();

    try {
      // Get the latest transaction date from database for incremental sync
      const latestDate = db.getLatestFonepayTransactionDate();
      const today = new Date().toISOString().split('T')[0];

      // If we have data, sync from latest date; otherwise sync last 7 days
      let fromDate;
      if (latestDate) {
        fromDate = latestDate;
        console.log(`[Fonepay] Incremental sync from ${fromDate} to ${today}`);
      } else {
        // No data - fetch last 7 days
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        fromDate = weekAgo.toISOString().split('T')[0];
        console.log(`[Fonepay] Initial sync from ${fromDate} to ${today}`);
      }

      // Close any existing browser first to ensure clean state
      await this.closeBrowser();

      // Initialize fresh browser
      await this.initBrowser();

      // Login to Fonepay
      await this.login();
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Navigate to payments page
      console.log('[Fonepay] Navigating to payments page...');
      await this.page.goto(this.config.paymentsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Click Payment Details
      await this.page.evaluate(() => {
        const links = document.querySelectorAll('a, span');
        for (const link of links) {
          if (link.textContent.trim() === 'Payment Details') {
            link.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
            return true;
          }
        }
        return false;
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Click Reset to clear existing filters
      await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if ((btn.innerText || '').toLowerCase().trim() === 'reset') {
            btn.click();
            return true;
          }
        }
        return false;
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Set date filters for incremental sync
      console.log(`[Fonepay] Setting date filter: ${fromDate} to ${today}`);
      await this.page.evaluate((fromDate, toDate) => {
        const allInputs = Array.from(document.querySelectorAll('input'));
        let fromInput = null;
        let toInput = null;

        // Find date inputs by label
        allInputs.forEach((input) => {
          let parent = input.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            const labelEl = parent.querySelector('label, span.label, div.label');
            if (labelEl) {
              const labelText = (labelEl.textContent || '').trim().toLowerCase();
              if (labelText === 'from date' && !fromInput) fromInput = input;
              if (labelText === 'to date' && !toInput) toInput = input;
            }
            parent = parent.parentElement;
          }
        });

        // Fallback: find by date pattern
        if (!fromInput || !toInput) {
          allInputs.forEach((input) => {
            const value = input.value || '';
            if (value.match(/^\d{4}-\d{2}-\d{2}$/) || value.match(/^[A-Z][a-z]{2}\s+\d+,\s+\d{4}$/)) {
              if (!fromInput) fromInput = input;
              else if (!toInput) toInput = input;
            }
          });
        }

        // Set values
        if (fromInput) {
          fromInput.focus();
          fromInput.value = fromDate;
          fromInput.dispatchEvent(new Event('input', { bubbles: true }));
          fromInput.dispatchEvent(new Event('change', { bubbles: true }));
          fromInput.dispatchEvent(new Event('blur', { bubbles: true }));
        }
        if (toInput) {
          toInput.focus();
          toInput.value = toDate;
          toInput.dispatchEvent(new Event('input', { bubbles: true }));
          toInput.dispatchEvent(new Event('change', { bubbles: true }));
          toInput.dispatchEvent(new Event('blur', { bubbles: true }));
        }
      }, fromDate, today);

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Click Search
      await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          if ((btn.innerText || '').toLowerCase().trim() === 'search') {
            btn.click();
            return true;
          }
        }
        return false;
      });
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Extract transactions with pagination
      let allTransactions = [];
      let pageNum = 1;
      let hasMore = true;
      let seenIds = new Set();
      let noNewCount = 0;

      while (hasMore && pageNum <= 20) { // Max 20 pages for incremental sync
        const transactions = await this.extractPaymentsTransactions();
        console.log(`[Fonepay] Page ${pageNum}: ${transactions.length} transactions`);

        if (transactions.length === 0) {
          hasMore = false;
          break;
        }

        let newCount = 0;
        for (const txn of transactions) {
          const txnId = `${txn.transmissionDate}-${txn.initiator}-${txn.amount}`;
          if (!seenIds.has(txnId) && txn.initiator) { // Only add if has initiator
            allTransactions.push(txn);
            seenIds.add(txnId);
            newCount++;
          }
        }

        if (newCount === 0) {
          noNewCount++;
          if (noNewCount >= 2) {
            hasMore = false;
            break;
          }
        } else {
          noNewCount = 0;
        }

        // Try next page
        const nextPageNum = pageNum + 1;
        const nextClicked = await this.page.evaluate((target) => {
          const elements = document.querySelectorAll('a, button, li, span, div');
          for (const el of elements) {
            if ((el.innerText || '').trim() === String(target)) {
              el.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
              return true;
            }
          }
          // Try next arrow
          for (const el of elements) {
            const text = (el.innerText || '').trim();
            if ((text === '>' || text === 'Next') && !el.classList.contains('disabled')) {
              el.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
              return true;
            }
          }
          return false;
        }, nextPageNum);

        if (!nextClicked) {
          hasMore = false;
        } else {
          await new Promise(resolve => setTimeout(resolve, 3000));
          pageNum++;
        }
      }

      console.log(`[Fonepay] Total new transactions: ${allTransactions.length}`);

      // Save transactions to database
      for (const txn of allTransactions) {
        db.saveFonepayTransaction(txn);
      }

      this.lastSyncTime = new Date().toISOString();
      this.status = 'success';

      // Close browser
      await this.closeBrowser();

      const result = {
        success: true,
        fromDate,
        toDate: today,
        transactionCount: allTransactions.length,
        syncedAt: this.lastSyncTime
      };

      this.emitUpdate(result);
      console.log(`[Fonepay] Incremental sync completed: ${allTransactions.length} new transactions`);

      return result;

    } catch (error) {
      console.error('[Fonepay] Sync failed:', error.message);
      this.status = 'error';
      this.error = error.message;
      await this.takeScreenshot('error').catch(() => {});
      await this.closeBrowser();
      this.emitStatus();
      return { success: false, error: error.message };
    }
  }

  /**
   * Emit status update via Socket.io
   */
  emitStatus() {
    if (this.io) {
      this.io.emit('fonepay:status', this.getStatus());
    }
  }

  /**
   * Emit data update via Socket.io
   */
  emitUpdate(data) {
    if (this.io) {
      this.io.emit('fonepay:update', data);
      this.io.emit('fonepay:status', this.getStatus());
    }
  }

  /**
   * Start the sync service
   */
  async start() {
    if (this.isRunning) {
      console.log('[Fonepay] Service already running');
      return false;
    }

    if (!this.config.username || !this.config.password) {
      console.log('[Fonepay] Cannot start - credentials not configured');
      console.log('  Set FONEPAY_USERNAME and FONEPAY_PASSWORD in your .env file');
      return false;
    }

    console.log('[Fonepay] Starting sync service...');
    console.log(`  → Interval: ${this.config.intervalMs}ms (${this.config.intervalMs / 1000}s)`);
    console.log(`  → Headless: ${this.config.headless}`);

    this.isRunning = true;

    // Initial sync
    await this.sync();

    // Set up recurring sync
    this.syncInterval = setInterval(async () => {
      if (!this.isRunning) return;
      await this.sync();
    }, this.config.intervalMs);

    console.log('[Fonepay] Sync service started');
    return true;
  }

  /**
   * Stop the sync service
   */
  async stop() {
    console.log('[Fonepay] Stopping sync service...');

    this.isRunning = false;

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }

    this.status = 'stopped';
    this.emitStatus();

    console.log('[Fonepay] Sync service stopped');
  }

  /**
   * Trigger manual sync
   */
  async syncNow() {
    return await this.sync();
  }

  /**
   * Fetch historical transactions with date range
   * @param {string} fromDate - Start date in YYYY-MM-DD format
   * @param {string} toDate - End date in YYYY-MM-DD format
   */
  async fetchHistoricalData(fromDate, toDate) {
    console.log(`[Fonepay] Fetching historical data from ${fromDate} to ${toDate}...`);

    if (!this.config.username || !this.config.password) {
      return { success: false, error: 'Credentials not configured' };
    }

    this.status = 'syncing';
    this.error = null;
    this.emitStatus();

    try {
      // Close any existing browser first
      await this.closeBrowser();

      // Initialize fresh browser
      await this.initBrowser();

      // Login to Fonepay
      await this.login();
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Navigate to payments page
      console.log('[Fonepay] Navigating to payments page...');
      await this.page.goto(this.config.paymentsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Click Payment Details
      await this.page.evaluate(() => {
        const links = document.querySelectorAll('a, span');
        for (const link of links) {
          if (link.textContent.trim() === 'Payment Details') {
            link.dispatchEvent(new MouseEvent('click', { view: window, bubbles: true, cancelable: true }));
            return true;
          }
        }
        return false;
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Take screenshot to see current state
      await this.takeScreenshot('before-date-filter');

      // Set date filters using proper date picker interaction
      console.log('[Fonepay] Setting date filters...');

      // First, click the Reset button to clear any existing filters
      await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = (btn.innerText || '').toLowerCase().trim();
          if (text === 'reset') {
            btn.click();
            return true;
          }
        }
        return false;
      });
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Now set the date fields using Angular-compatible approach
      const dateSet = await this.page.evaluate((fromDate, toDate) => {
        const results = { fromDate: false, toDate: false, logs: [] };

        // Find all inputs on the page
        const allInputs = Array.from(document.querySelectorAll('input'));
        results.logs.push(`Found ${allInputs.length} inputs`);

        // Find From Date and To Date inputs by looking at their parent label text
        let fromInput = null;
        let toInput = null;

        // Look for inputs with specific parent structure
        allInputs.forEach((input, idx) => {
          // Go up to find the label
          let parent = input.parentElement;
          for (let i = 0; i < 5 && parent; i++) {
            const labelEl = parent.querySelector('label, span.label, div.label');
            if (labelEl) {
              const labelText = (labelEl.textContent || '').trim().toLowerCase();
              if (labelText === 'from date' && !fromInput) {
                fromInput = input;
                results.logs.push(`Found From Date input at index ${idx}`);
              }
              if (labelText === 'to date' && !toInput) {
                toInput = input;
                results.logs.push(`Found To Date input at index ${idx}`);
              }
            }
            parent = parent.parentElement;
          }
        });

        // If we didn't find by label, try to find by value pattern (date fields usually have date values)
        if (!fromInput || !toInput) {
          allInputs.forEach((input, idx) => {
            const value = input.value || '';
            // Date inputs often have date-like values
            if (value.match(/^\d{4}-\d{2}-\d{2}$/) || value.match(/^[A-Z][a-z]{2}\s+\d+,\s+\d{4}$/)) {
              if (!fromInput) {
                fromInput = input;
                results.logs.push(`Found From Date by value pattern at index ${idx}: ${value}`);
              } else if (!toInput) {
                toInput = input;
                results.logs.push(`Found To Date by value pattern at index ${idx}: ${value}`);
              }
            }
          });
        }

        // Set the values with proper Angular event dispatching
        if (fromInput) {
          // Use Angular's native value accessor
          const ngModel = fromInput.getAttribute('ng-reflect-model') || fromInput.getAttribute('formcontrolname');
          fromInput.focus();
          fromInput.value = fromDate;
          fromInput.dispatchEvent(new Event('input', { bubbles: true }));
          fromInput.dispatchEvent(new Event('change', { bubbles: true }));
          fromInput.dispatchEvent(new Event('blur', { bubbles: true }));
          results.fromDate = true;
          results.logs.push(`Set From Date to: ${fromDate} (ngModel: ${ngModel})`);
        }

        if (toInput) {
          const ngModel = toInput.getAttribute('ng-reflect-model') || toInput.getAttribute('formcontrolname');
          toInput.focus();
          toInput.value = toDate;
          toInput.dispatchEvent(new Event('input', { bubbles: true }));
          toInput.dispatchEvent(new Event('change', { bubbles: true }));
          toInput.dispatchEvent(new Event('blur', { bubbles: true }));
          results.toDate = true;
          results.logs.push(`Set To Date to: ${toDate} (ngModel: ${ngModel})`);
        }

        return results;
      }, fromDate, toDate);

      console.log('[Fonepay] Date filter result:', JSON.stringify(dateSet, null, 2));

      await new Promise(resolve => setTimeout(resolve, 1000));
      await this.takeScreenshot('after-date-set');

      // Look for and click search/filter button
      console.log('[Fonepay] Clicking Search button...');
      const searchClicked = await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = (btn.innerText || '').toLowerCase().trim();
          if (text === 'search') {
            btn.click();
            return 'search';
          }
        }
        return false;
      });
      console.log(`[Fonepay] Search button clicked: ${searchClicked}`);

      // Wait for results to load
      await new Promise(resolve => setTimeout(resolve, 5000));
      await this.takeScreenshot('after-search');

      // Extract all transactions (handle pagination)
      let allTransactions = [];
      let pageNum = 1;
      let hasMore = true;
      let seenTransactionIds = new Set();
      let consecutiveNoNewPages = 0;

      while (hasMore && pageNum <= 100) { // Max 100 pages
        console.log(`[Fonepay] Extracting page ${pageNum}...`);

        const transactions = await this.extractPaymentsTransactions();
        console.log(`[Fonepay] Found ${transactions.length} transactions on page ${pageNum}`);

        if (transactions.length === 0) {
          hasMore = false;
          break;
        }

        // Add all transactions from this page (dedup by unique ID)
        let newCount = 0;
        for (const txn of transactions) {
          const txnId = `${txn.transmissionDate}-${txn.initiator}-${txn.amount}`;
          if (!seenTransactionIds.has(txnId)) {
            allTransactions.push(txn);
            seenTransactionIds.add(txnId);
            newCount++;
          }
        }
        console.log(`[Fonepay] Added ${newCount} new transactions (total: ${allTransactions.length})`)

        // If no new transactions were added, we might be stuck on same page
        if (newCount === 0) {
          consecutiveNoNewPages++;
          if (consecutiveNoNewPages >= 2) {
            console.log('[Fonepay] No new transactions for 2 consecutive pages, stopping');
            hasMore = false;
            break;
          }
        } else {
          consecutiveNoNewPages = 0;
        }

        // Try to click next page - look for ">" button or next page number
        console.log('[Fonepay] Looking for next page button...');

        // First, find current page number
        const currentPageInfo = await this.page.evaluate(() => {
          // Look for active/current page indicator
          const allLinks = document.querySelectorAll('a, button, li, span');
          for (const el of allLinks) {
            const text = (el.innerText || '').trim();
            // Check if this looks like an active page number
            if (/^\d+$/.test(text)) {
              const parent = el.parentElement;
              if (el.classList.contains('active') || el.classList.contains('current') ||
                  parent?.classList.contains('active') || parent?.classList.contains('current') ||
                  el.style.backgroundColor || el.style.color) {
                return { currentPage: parseInt(text), element: 'found' };
              }
            }
          }
          return { currentPage: 1, element: 'not found' };
        });

        console.log(`[Fonepay] Current page info:`, JSON.stringify(currentPageInfo));
        const nextPageNum = currentPageInfo.currentPage + 1;

        // Click on the next page number directly using Puppeteer's click
        const nextClicked = await this.page.evaluate((targetPage) => {
          // Find all elements that might be page numbers
          const allElements = document.querySelectorAll('a, button, li, span, div');

          for (const el of allElements) {
            const text = (el.innerText || '').trim();
            if (text === String(targetPage)) {
              // Dispatch proper Angular-compatible click event
              const clickEvent = new MouseEvent('click', {
                view: window,
                bubbles: true,
                cancelable: true
              });
              el.dispatchEvent(clickEvent);
              return { clicked: true, method: 'pageNumber', targetPage };
            }
          }

          // Try ">" or "Next" button as fallback
          for (const el of allElements) {
            const text = (el.innerText || '').trim();
            if (text === '>' || text === '›' || text === 'Next' || text === '»') {
              if (!el.classList.contains('disabled')) {
                const clickEvent = new MouseEvent('click', {
                  view: window,
                  bubbles: true,
                  cancelable: true
                });
                el.dispatchEvent(clickEvent);
                return { clicked: true, method: 'arrow', text };
              }
            }
          }

          return { clicked: false };
        }, nextPageNum);

        console.log('[Fonepay] Next page click result:', JSON.stringify(nextClicked));

        if (!nextClicked.clicked) {
          console.log('[Fonepay] No more pages available');
          hasMore = false;
        } else {
          console.log('[Fonepay] Waiting for page to update...');
          // Wait longer for Angular to update
          await new Promise(resolve => setTimeout(resolve, 4000));

          // Wait for table rows to potentially change
          await this.page.waitForFunction(() => {
            const rows = document.querySelectorAll('table tbody tr');
            return rows.length > 0;
          }, { timeout: 5000 }).catch(() => {});

          await this.takeScreenshot(`page-${pageNum + 1}`);
          pageNum++;
        }
      }

      console.log(`[Fonepay] Total transactions extracted: ${allTransactions.length}`);

      // Save transactions to database
      for (const txn of allTransactions) {
        db.saveFonepayTransaction(txn);
      }

      this.lastSyncTime = new Date().toISOString();
      this.status = 'success';

      // Close browser
      await this.closeBrowser();

      const result = {
        success: true,
        fromDate,
        toDate,
        transactionCount: allTransactions.length,
        transactions: allTransactions,
        syncedAt: this.lastSyncTime
      };

      this.emitUpdate(result);
      return result;

    } catch (error) {
      console.error('[Fonepay] Historical fetch failed:', error.message);
      this.status = 'error';
      this.error = error.message;
      await this.takeScreenshot('historical-error').catch(() => {});
      await this.closeBrowser();
      this.emitStatus();
      return { success: false, error: error.message };
    }
  }

  /**
   * Update credentials
   */
  updateCredentials(username, password) {
    this.config.username = username;
    this.config.password = password;
    console.log('[Fonepay] Credentials updated');
  }

  /**
   * Update sync interval
   */
  updateInterval(intervalMs) {
    this.config.intervalMs = intervalMs;

    // Restart interval if running
    if (this.isRunning && this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = setInterval(async () => {
        if (!this.isRunning) return;
        await this.sync();
      }, this.config.intervalMs);
    }

    console.log(`[Fonepay] Interval updated to ${intervalMs}ms`);
  }

  /**
   * Generate a dynamic QR code for payment collection
   * @param {number} amount - Amount in NPR
   * @param {string} remarks - Optional remarks/description
   * @returns {Object} - { success, qrImage (base64), amount, prn }
   */
  async generateQR(amount, remarks = '') {
    console.log(`[Fonepay] Generating QR for amount: Rs. ${amount}`);

    if (!this.config.username || !this.config.password) {
      return { success: false, error: 'Credentials not configured' };
    }

    if (!amount || amount <= 0) {
      return { success: false, error: 'Invalid amount' };
    }

    try {
      // Close any existing browser first
      await this.closeBrowser();

      // Initialize fresh browser (non-headless for debugging if needed)
      await this.initBrowser();

      // Login to Fonepay
      await this.login();
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Navigate to Payment Request page
      const qrUrl = 'https://login.fonepay.com/#/paymentRequest';
      console.log('[Fonepay QR] Navigating to Payment Request page...');
      await this.page.goto(qrUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 3000));

      await this.takeScreenshot('qr-page-initial');

      // Wait for the form to load
      await this.page.waitForSelector('select, ng-select, .ng-select', { timeout: 10000 }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 1: Select Sub-Merchant dropdown - "Trishakti Stores"
      console.log('[Fonepay QR] Selecting Sub-Merchant...');

      const subMerchantSelected = await this.page.evaluate(() => {
        const results = { logs: [] };

        // Find all dropdowns/selects on the page
        const selects = document.querySelectorAll('select, .ng-select, [class*="select"]');
        results.logs.push(`Found ${selects.length} select elements`);

        // Look for labels to identify which dropdown is which
        const allLabels = document.querySelectorAll('label');
        results.logs.push(`Found ${allLabels.length} labels`);

        // Find Sub-Merchant dropdown by label
        for (const label of allLabels) {
          const labelText = (label.textContent || '').toLowerCase();
          if (labelText.includes('sub-merchant') || labelText.includes('sub merchant') || labelText.includes('submerchant')) {
            results.logs.push(`Found Sub-Merchant label: ${label.textContent}`);

            // Find associated select - could be sibling or in same parent
            let parent = label.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              const select = parent.querySelector('select, .ng-select, input[type="text"]');
              if (select) {
                results.logs.push(`Found associated select element`);

                // If it's a native select
                if (select.tagName === 'SELECT') {
                  const options = select.querySelectorAll('option');
                  for (const opt of options) {
                    if ((opt.textContent || '').toLowerCase().includes('trishakti')) {
                      select.value = opt.value;
                      select.dispatchEvent(new Event('change', { bubbles: true }));
                      results.selected = true;
                      results.logs.push(`Selected: ${opt.textContent}`);
                      return results;
                    }
                  }
                }

                // If it's an ng-select or custom dropdown, click to open it
                select.click();
                results.logs.push('Clicked to open dropdown');
                break;
              }
              parent = parent.parentElement;
            }
          }
        }

        return results;
      });

      console.log('[Fonepay QR] Sub-Merchant selection result:', JSON.stringify(subMerchantSelected, null, 2));
      await new Promise(resolve => setTimeout(resolve, 1000));

      // If dropdown is open (ng-select), find and click the option
      await this.page.evaluate(() => {
        // Look for dropdown options containing "trishakti"
        const options = document.querySelectorAll('.ng-option, .ng-dropdown-panel-items div, [class*="option"], li');
        for (const opt of options) {
          const text = (opt.textContent || '').toLowerCase();
          if (text.includes('trishakti')) {
            opt.click();
            return true;
          }
        }
        return false;
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.takeScreenshot('qr-after-submerchant');

      // Step 2: Select Terminal dropdown - "Trishakti Stores"
      console.log('[Fonepay QR] Selecting Terminal...');

      const terminalSelected = await this.page.evaluate(() => {
        const results = { logs: [] };

        const allLabels = document.querySelectorAll('label');

        for (const label of allLabels) {
          const labelText = (label.textContent || '').toLowerCase();
          if (labelText.includes('terminal') && !labelText.includes('sub')) {
            results.logs.push(`Found Terminal label: ${label.textContent}`);

            let parent = label.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              const select = parent.querySelector('select, .ng-select, input');
              if (select) {
                results.logs.push(`Found terminal select element`);

                if (select.tagName === 'SELECT') {
                  const options = select.querySelectorAll('option');
                  for (const opt of options) {
                    if ((opt.textContent || '').toLowerCase().includes('trishakti')) {
                      select.value = opt.value;
                      select.dispatchEvent(new Event('change', { bubbles: true }));
                      results.selected = true;
                      results.logs.push(`Selected: ${opt.textContent}`);
                      return results;
                    }
                  }
                }

                // Click to open dropdown
                select.click();
                results.logs.push('Clicked terminal dropdown');
                break;
              }
              parent = parent.parentElement;
            }
          }
        }

        return results;
      });

      console.log('[Fonepay QR] Terminal selection result:', JSON.stringify(terminalSelected, null, 2));
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Select terminal option
      await this.page.evaluate(() => {
        const options = document.querySelectorAll('.ng-option, .ng-dropdown-panel-items div, [class*="option"], li');
        for (const opt of options) {
          const text = (opt.textContent || '').toLowerCase();
          if (text.includes('trishakti')) {
            opt.click();
            return true;
          }
        }
        return false;
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
      await this.takeScreenshot('qr-after-terminal');

      // Step 3: Enter amount
      console.log(`[Fonepay QR] Entering amount: ${amount}`);

      const amountEntered = await this.page.evaluate((amount) => {
        const results = { logs: [] };

        // Find amount input by label or placeholder
        const allLabels = document.querySelectorAll('label');
        for (const label of allLabels) {
          const labelText = (label.textContent || '').toLowerCase();
          if (labelText.includes('amount') || labelText.includes('रकम')) {
            results.logs.push(`Found Amount label: ${label.textContent}`);

            let parent = label.parentElement;
            for (let i = 0; i < 5 && parent; i++) {
              const input = parent.querySelector('input[type="text"], input[type="number"], input:not([type="hidden"])');
              if (input) {
                input.focus();
                input.value = String(amount);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.dispatchEvent(new Event('change', { bubbles: true }));
                results.entered = true;
                results.logs.push(`Entered amount: ${amount}`);
                return results;
              }
              parent = parent.parentElement;
            }
          }
        }

        // Fallback: find by placeholder
        const inputs = document.querySelectorAll('input');
        for (const input of inputs) {
          const placeholder = (input.placeholder || '').toLowerCase();
          if (placeholder.includes('amount') || placeholder.includes('रकम') || input.type === 'number') {
            input.focus();
            input.value = String(amount);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            input.dispatchEvent(new Event('change', { bubbles: true }));
            results.entered = true;
            results.logs.push(`Entered amount via fallback: ${amount}`);
            return results;
          }
        }

        return results;
      }, amount);

      console.log('[Fonepay QR] Amount entry result:', JSON.stringify(amountEntered, null, 2));
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 4: Enter remarks if provided
      if (remarks) {
        console.log(`[Fonepay QR] Entering remarks: ${remarks}`);
        await this.page.evaluate((remarks) => {
          const allLabels = document.querySelectorAll('label');
          for (const label of allLabels) {
            const labelText = (label.textContent || '').toLowerCase();
            if (labelText.includes('remark') || labelText.includes('note') || labelText.includes('description')) {
              let parent = label.parentElement;
              for (let i = 0; i < 5 && parent; i++) {
                const input = parent.querySelector('input, textarea');
                if (input) {
                  input.focus();
                  input.value = remarks;
                  input.dispatchEvent(new Event('input', { bubbles: true }));
                  input.dispatchEvent(new Event('change', { bubbles: true }));
                  return true;
                }
                parent = parent.parentElement;
              }
            }
          }
          return false;
        }, remarks);
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      await this.takeScreenshot('qr-before-generate');

      // Step 5: Click Generate QR button
      console.log('[Fonepay QR] Clicking Generate QR button...');

      const generateClicked = await this.page.evaluate(() => {
        const buttons = document.querySelectorAll('button');
        for (const btn of buttons) {
          const text = (btn.innerText || '').toLowerCase();
          if (text.includes('generate') || text.includes('create') || text.includes('qr')) {
            btn.click();
            return { clicked: true, text: btn.innerText };
          }
        }
        // Try submit button
        const submitBtn = document.querySelector('button[type="submit"]');
        if (submitBtn) {
          submitBtn.click();
          return { clicked: true, text: 'submit' };
        }
        return { clicked: false };
      });

      console.log('[Fonepay QR] Generate button click result:', JSON.stringify(generateClicked));

      // Wait for QR to generate
      await new Promise(resolve => setTimeout(resolve, 5000));
      await this.takeScreenshot('qr-after-generate');

      // Step 6: Extract QR code image
      console.log('[Fonepay QR] Extracting QR code image...');

      const qrData = await this.page.evaluate(() => {
        const result = { found: false, logs: [] };

        // Try to find QR code as canvas
        const canvases = document.querySelectorAll('canvas');
        result.logs.push(`Found ${canvases.length} canvas elements`);

        for (const canvas of canvases) {
          if (canvas.width > 50 && canvas.height > 50) {
            try {
              result.qrImage = canvas.toDataURL('image/png');
              result.found = true;
              result.source = 'canvas';
              result.logs.push(`Extracted QR from canvas (${canvas.width}x${canvas.height})`);
              return result;
            } catch (e) {
              result.logs.push(`Canvas extraction failed: ${e.message}`);
            }
          }
        }

        // Try to find QR code as img
        const images = document.querySelectorAll('img');
        result.logs.push(`Found ${images.length} img elements`);

        for (const img of images) {
          const src = img.src || '';
          // QR images might be data URLs or have qr in the path
          if (src.startsWith('data:image') || src.toLowerCase().includes('qr')) {
            if (img.width > 50 && img.height > 50) {
              result.qrImage = src;
              result.found = true;
              result.source = 'img';
              result.logs.push(`Found QR image: ${src.substring(0, 50)}...`);
              return result;
            }
          }
        }

        // Try to find QR in SVG
        const svgs = document.querySelectorAll('svg');
        result.logs.push(`Found ${svgs.length} SVG elements`);

        for (const svg of svgs) {
          if (svg.querySelector('rect, path') && svg.getAttribute('width')) {
            const serializer = new XMLSerializer();
            const svgStr = serializer.serializeToString(svg);
            result.qrImage = 'data:image/svg+xml;base64,' + btoa(svgStr);
            result.found = true;
            result.source = 'svg';
            result.logs.push('Extracted QR from SVG');
            return result;
          }
        }

        // Check for any element with qr-related class
        const qrElements = document.querySelectorAll('[class*="qr"], [id*="qr"]');
        result.logs.push(`Found ${qrElements.length} QR-related elements`);

        return result;
      });

      console.log('[Fonepay QR] QR extraction result:', JSON.stringify({ ...qrData, qrImage: qrData.qrImage ? '[BASE64_DATA]' : null }, null, 2));

      // Try to extract PRN (Payment Reference Number)
      const prn = await this.page.evaluate(() => {
        // Look for PRN in the page
        const allText = document.body.innerText;
        const prnMatch = allText.match(/PRN[:\s]*([A-Z0-9]+)/i);
        return prnMatch ? prnMatch[1] : null;
      });

      await this.closeBrowser();

      if (qrData.found && qrData.qrImage) {
        console.log(`[Fonepay QR] QR generated successfully for Rs. ${amount}`);
        return {
          success: true,
          qrImage: qrData.qrImage,
          amount,
          remarks,
          prn,
          generatedAt: new Date().toISOString()
        };
      } else {
        console.error('[Fonepay QR] Failed to extract QR code');
        return {
          success: false,
          error: 'QR code not found on page',
          logs: qrData.logs
        };
      }

    } catch (error) {
      console.error('[Fonepay QR] QR generation failed:', error.message);
      await this.takeScreenshot('qr-error').catch(() => {});
      await this.closeBrowser();
      return { success: false, error: error.message };
    }
  }
}

// Export singleton
export const fonepayService = new FonepayService();
export default fonepayService;
