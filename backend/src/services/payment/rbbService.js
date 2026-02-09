/**
 * RBB Smart Banking Scraper Service
 * Automates login and data extraction from RBB Smart Banking portal
 *
 * Features:
 * - Automated login with username/password
 * - Extracts transaction history (Fonepay deposits in 4 phases)
 * - Account balance tracking
 * - Real-time updates via Socket.io
 */

import puppeteer from 'puppeteer';
import { db } from '../database/index.js';

class RBBService {
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
      loginUrl: 'https://smartbanking.rbb.com.np/#/login',
      dashboardUrl: 'https://smartbanking.rbb.com.np/#/dashboard',
      statementUrl: 'https://smartbanking.rbb.com.np/#/account/statement',
      username: process.env.RBB_USERNAME || '',
      password: process.env.RBB_PASSWORD || '',
      intervalMs: parseInt(process.env.RBB_INTERVAL_MS) || 3600000, // 1 hour default
      headless: process.env.RBB_HEADLESS !== 'false' // true by default
    };
  }

  /**
   * Set Socket.io instance for real-time updates
   */
  setSocketIO(io) {
    this.io = io;
  }

  /**
   * Emit status update to connected clients
   */
  emitStatus(status, data = {}) {
    this.status = status;
    if (this.io) {
      this.io.emit('rbb:status', { status, ...data });
    }
  }

  /**
   * Emit data update to connected clients
   */
  emitUpdate(data) {
    if (this.io) {
      this.io.emit('rbb:update', data);
    }
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
   * Initialize browser instance (fresh each time)
   */
  async initBrowser() {
    // Close existing browser if any
    await this.closeBrowser();

    console.log('[RBB] Launching browser...');
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

    console.log('[RBB] Browser initialized');
  }

  /**
   * Login to RBB Smart Banking portal
   */
  async login() {
    if (!this.config.username || !this.config.password) {
      throw new Error('RBB credentials not configured. Set RBB_USERNAME and RBB_PASSWORD in .env');
    }

    console.log('[RBB] Navigating to login page...');
    await this.page.goto(this.config.loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // Wait for the app to load
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if already logged in
    const currentUrl = this.page.url();
    if (currentUrl.includes('dashboard')) {
      console.log('[RBB] Already logged in');
      return true;
    }

    console.log('[RBB] Entering credentials...');

    // Wait for and fill username field
    await this.page.waitForSelector('input[formcontrolname="username"], input[name="username"], input[type="text"]', { timeout: 10000 });
    await this.page.type('input[formcontrolname="username"], input[name="username"], input[type="text"]', this.config.username, { delay: 50 });

    // Fill password field
    await this.page.waitForSelector('input[formcontrolname="password"], input[name="password"], input[type="password"]', { timeout: 10000 });
    await this.page.type('input[formcontrolname="password"], input[name="password"], input[type="password"]', this.config.password, { delay: 50 });

    // Click login button
    console.log('[RBB] Clicking login button...');
    await this.page.click('button[type="submit"], button.login-btn, .btn-login');

    // Wait for navigation or error
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Check for OTP requirement or successful login
    const afterLoginUrl = this.page.url();
    if (afterLoginUrl.includes('otp') || afterLoginUrl.includes('verify')) {
      console.log('[RBB] OTP verification required - manual intervention needed');
      this.emitStatus('otp_required', { message: 'OTP verification required' });
      // Wait for manual OTP entry (up to 2 minutes)
      await new Promise(resolve => setTimeout(resolve, 120000));
    }

    // Verify login success
    const finalUrl = this.page.url();
    if (finalUrl.includes('dashboard') || finalUrl.includes('home')) {
      console.log('[RBB] Login successful');
      return true;
    }

    // Check for error messages
    const errorElement = await this.page.$('.error-message, .alert-danger, .toast-error');
    if (errorElement) {
      const errorText = await this.page.evaluate(el => el.textContent, errorElement);
      throw new Error(`Login failed: ${errorText}`);
    }

    throw new Error('Login failed - unable to reach dashboard');
  }

  /**
   * Navigate to account statement page and fetch transactions
   */
  async fetchTransactions(fromDate = null, toDate = null) {
    console.log('[RBB] Fetching transactions...');

    // First go to account page to find Statement button
    console.log('[RBB] Going to account page...');
    await this.page.goto('https://smartbanking.rbb.com.np/#/account', { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Take screenshot for debugging
    try {
      await this.page.screenshot({ path: '/tmp/rbb-before-statement.png' });
      console.log('[RBB] Screenshot saved to /tmp/rbb-before-statement.png');
    } catch (e) {}

    // Log all clickable elements for debugging
    const pageElements = await this.page.evaluate(() => {
      const clickables = document.querySelectorAll('a, button, [role="button"], span, div');
      return Array.from(clickables).map(el => ({
        tag: el.tagName,
        text: (el.textContent || '').trim().substring(0, 50),
        classes: el.className
      })).filter(el => el.text.toLowerCase().includes('statement'));
    });
    console.log('[RBB] Elements containing "statement":', JSON.stringify(pageElements, null, 2));

    // Try to click Statement button on the account card
    let navigationSuccess = false;

    try {
      console.log('[RBB] Looking for Statement button...');

      // Try clicking using XPath for exact text match
      const statementElements = await this.page.$$('xpath/.//button[contains(text(), "Statement")] | .//a[contains(text(), "Statement")] | .//span[contains(text(), "Statement")] | .//div[text()=" Statement "]');

      if (statementElements.length > 0) {
        console.log(`[RBB] Found ${statementElements.length} elements with Statement text via XPath`);
        await statementElements[0].click();
        await new Promise(resolve => setTimeout(resolve, 5000));
        navigationSuccess = true;
      } else {
        // Fallback: use page.evaluate to find and click
        const clicked = await this.page.evaluate(() => {
          // Look for all clickable elements
          const allElements = document.querySelectorAll('button, a, span, div, [role="button"]');

          for (const el of allElements) {
            const text = (el.textContent || el.innerText || '').trim();
            // Match elements that have exactly "Statement" or have Statement as first word
            if (text === 'Statement' || text.startsWith('Statement ') || text === ' Statement ') {
              console.log('Clicking element:', text);
              el.click();
              return { clicked: true, text: text, tag: el.tagName };
            }
          }

          // If not found, try looking for anchor with Statement
          const anchors = document.querySelectorAll('a');
          for (const a of anchors) {
            if (a.textContent.toLowerCase().includes('statement')) {
              a.click();
              return { clicked: true, text: a.textContent, tag: 'A' };
            }
          }

          return { clicked: false };
        });

        if (clicked.clicked) {
          console.log(`[RBB] Clicked Statement element: "${clicked.text}" (${clicked.tag})`);
          await new Promise(resolve => setTimeout(resolve, 5000));
          navigationSuccess = true;
        }
      }

      // Check if URL changed to statement page
      const newUrl = this.page.url();
      console.log('[RBB] URL after clicking:', newUrl);
      if (newUrl.includes('statement')) {
        console.log('[RBB] Successfully navigated to statement page');
      }
    } catch (e) {
      console.log('[RBB] Error clicking Statement button:', e.message);
    }

    // Take screenshot after navigation attempt
    try {
      await this.page.screenshot({ path: '/tmp/rbb-after-click.png' });
      console.log('[RBB] Screenshot saved to /tmp/rbb-after-click.png');
    } catch (e) {}

    // If navigation didn't work, try direct URL
    const currentUrl = this.page.url();
    if (!currentUrl.includes('statement')) {
      console.log('[RBB] Statement page not reached, trying direct URL...');
      await this.page.goto(this.config.statementUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Take screenshot after navigation
    try {
      await this.page.screenshot({ path: '/tmp/rbb-statement-page.png' });
      console.log('[RBB] Screenshot saved to /tmp/rbb-statement-page.png');
    } catch (e) {}

    // Log current URL and page content for debugging
    console.log('[RBB] Current URL:', this.page.url());

    // Wait for the page to fully load (wait for loading indicator to disappear)
    console.log('[RBB] Waiting for page to finish loading...');
    await this.waitForPageLoad();
    console.log('[RBB] Page load complete, continuing...');

    // Take screenshot after initial load
    try {
      console.log('[RBB] Taking screenshot after load...');
      await this.page.screenshot({ path: '/tmp/rbb-after-load.png' });
      console.log('[RBB] Screenshot saved to /tmp/rbb-after-load.png');
    } catch (e) {
      console.log('[RBB] Screenshot error:', e.message);
    }

    // Log page content to understand the structure
    console.log('[RBB] Getting page content...');
    let initialPageContent = '';
    try {
      initialPageContent = await this.page.evaluate(() => {
        return document.body.innerText.substring(0, 1500);
      });
      console.log('[RBB] Page content after load:', initialPageContent.substring(0, 300));
    } catch (e) {
      console.log('[RBB] Page content error:', e.message);
    }

    // Set date range - use last sync date for incremental sync
    // If no previous data, use a default start date
    // RBB portal uses YYYY/MM/DD format with slashes
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // Get the latest transaction date from database for incremental sync
    const lastTransactionDate = db.getLatestRBBTransactionDate();
    let startDate;

    if (lastTransactionDate) {
      // Start from the last transaction date (to catch any missed transactions)
      startDate = lastTransactionDate;
      console.log(`[RBB] Incremental sync: Starting from last transaction date: ${startDate}`);
    } else {
      // No previous data - use default historical start date
      startDate = '2025-07-17';
      console.log(`[RBB] Full sync: No previous data, starting from ${startDate}`);
    }

    // Convert to YYYY/MM/DD format for RBB portal
    const formatDateForRBB = (dateStr) => {
      return dateStr.replace(/-/g, '/');
    };

    const fromDateFormatted = formatDateForRBB(startDate);
    const toDateFormatted = formatDateForRBB(todayStr);

    await this.setDateFilter(fromDateFormatted, toDateFormatted);

    console.log(`[RBB] Date range set: ${fromDateFormatted} to ${toDateFormatted}`);

    // Wait again after setting date filter
    await this.waitForPageLoad();

    // Wait for table to load
    console.log('[RBB] Waiting for transaction table...');
    try {
      await this.page.waitForSelector('table tbody tr:not(:empty)', { timeout: 20000 });
    } catch (e) {
      console.log('[RBB] Table selector timeout - checking page content...');
    }

    // Log the page structure for debugging
    const pageInfo = await this.page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      const rows = document.querySelectorAll('table tbody tr, .mat-row');
      return {
        tableCount: tables.length,
        rowCount: rows.length,
        bodyText: document.body.innerText.substring(0, 500)
      };
    });
    console.log('[RBB] Page info:', JSON.stringify(pageInfo, null, 2));

    // Scroll down to load all transactions (handle both page scroll and table scroll)
    console.log('[RBB] Scrolling to load all transactions...');

    // First scroll the page
    let previousHeight = 0;
    for (let i = 0; i < 20; i++) {
      const currentHeight = await this.page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight);
        return document.body.scrollHeight;
      });

      if (currentHeight === previousHeight) {
        console.log(`[RBB] Page scroll complete after ${i + 1} iterations`);
        break;
      }
      previousHeight = currentHeight;
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    // Also try to scroll within any scrollable table container
    await this.page.evaluate(() => {
      const tableContainer = document.querySelector('.table-container, .mat-table-container, [class*="scroll"], table');
      if (tableContainer && tableContainer.scrollHeight > tableContainer.clientHeight) {
        tableContainer.scrollTop = tableContainer.scrollHeight;
      }
    });
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Close any open calendar/overlay and scroll to see pagination
    console.log('[RBB] Closing any open overlays...');
    await this.page.keyboard.press('Escape');
    await new Promise(resolve => setTimeout(resolve, 500));
    await this.page.click('body', { position: { x: 100, y: 100 } });
    await new Promise(resolve => setTimeout(resolve, 500));

    // Scroll down to see the pagination controls
    await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Check for pagination - RBB uses "Showing X - Y entry of Z" format
    console.log('[RBB] Checking for pagination...');

    const paginationInfo = await this.page.evaluate(() => {
      const bodyText = document.body.innerText;
      // Look for "Showing X - Y entry of Z" pattern
      const entryMatch = bodyText.match(/Showing\s+(\d+)\s*-\s*(\d+)\s+entry\s+of\s+(\d+)/i);
      if (entryMatch) {
        const startEntry = parseInt(entryMatch[1]);
        const endEntry = parseInt(entryMatch[2]);
        const totalEntries = parseInt(entryMatch[3]);
        const entriesPerPage = endEntry - startEntry + 1;
        const totalPages = Math.ceil(totalEntries / entriesPerPage);
        const currentPage = Math.ceil(startEntry / entriesPerPage);
        return {
          found: true,
          currentPage: currentPage,
          totalPages: totalPages,
          totalEntries: totalEntries,
          entriesPerPage: entriesPerPage
        };
      }
      return { found: false, currentPage: 1, totalPages: 1, totalEntries: 0 };
    });

    console.log('[RBB] Pagination info:', JSON.stringify(paginationInfo));

    let allTransactions = [];

    // If we have multiple pages, we need to iterate through them
    if (paginationInfo.found && paginationInfo.totalPages > 1) {
      console.log(`[RBB] Found ${paginationInfo.totalEntries} total transactions across ${paginationInfo.totalPages} pages`);

      for (let page = 1; page <= paginationInfo.totalPages; page++) {
        console.log(`[RBB] Processing page ${page} of ${paginationInfo.totalPages}...`);

        // Extract transactions from current page
        const pageTransactions = await this.extractPageTransactions();
        console.log(`[RBB] Page ${page}: Found ${pageTransactions.length} transactions`);
        allTransactions = allTransactions.concat(pageTransactions);

        // If not on last page, click Next (the ">" button)
        if (page < paginationInfo.totalPages) {
          // Scroll to bottom to ensure pagination is visible
          await this.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
          await new Promise(resolve => setTimeout(resolve, 1000));

          // Take screenshot of pagination area for debugging
          try {
            await this.page.screenshot({ path: `/tmp/rbb-pagination-page${page}.png` });
            console.log(`[RBB] Pagination screenshot saved for page ${page}`);
          } catch (e) {}

          // Debug: get the full HTML of the pagination control
          const paginationHTML = await this.page.evaluate(() => {
            const paginationControl = document.querySelector('dir-pagination-controls, .pagination-wrapper');
            if (paginationControl) {
              return {
                html: paginationControl.innerHTML.substring(0, 500),
                outerHTML: paginationControl.outerHTML.substring(0, 300),
                children: Array.from(paginationControl.children).map(c => ({
                  tag: c.tagName,
                  text: c.textContent.trim().substring(0, 30),
                  class: c.className
                }))
              };
            }
            return { found: false };
          });
          console.log('[RBB] Pagination HTML:', JSON.stringify(paginationHTML, null, 2));

          // Find and click the ">" next button inside dir-pagination-controls
          // The structure uses <a class="pagination-button right"> for next
          const nextClicked = await this.page.evaluate(() => {
            // Find the dir-pagination-controls element
            const paginationControl = document.querySelector('dir-pagination-controls, .pagination-wrapper');

            if (paginationControl) {
              // Look for pagination-button with "right" class or containing ">"
              const buttons = paginationControl.querySelectorAll('a.pagination-button, .pagination-button');
              for (const btn of buttons) {
                const text = (btn.textContent || '').trim();
                const classes = btn.className || '';
                // Match right arrow button (not disabled)
                if ((text === '>' || text === '›' || classes.includes('right')) &&
                    !classes.includes('disabled') && !btn.hasAttribute('disabled')) {
                  btn.click();
                  return { clicked: true, text: text, method: 'pagination-button', classes: classes };
                }
              }

              // Also try finding any <a> with > text that's not disabled
              const links = paginationControl.querySelectorAll('a');
              for (const link of links) {
                const text = (link.textContent || '').trim();
                const parent = link.parentElement;
                const parentClasses = parent ? parent.className : '';
                // Skip if parent is disabled
                if (parentClasses.includes('disabled')) continue;

                if (text === '>' || text === '›') {
                  link.click();
                  return { clicked: true, text: text, method: 'pagination-link' };
                }
              }
            }

            // Fallback: find any non-disabled element with ">" at bottom of page
            const allLinks = document.querySelectorAll('a, span, li');
            for (const el of allLinks) {
              const rect = el.getBoundingClientRect();
              const text = (el.textContent || '').trim();
              const parent = el.parentElement;
              const parentClasses = parent ? parent.className : '';

              // Must be at bottom and not disabled
              if (text === '>' && rect.top > 400 && !parentClasses.includes('disabled')) {
                el.click();
                return { clicked: true, text: text, method: 'fallback', top: rect.top };
              }
            }

            return { clicked: false };
          });

          if (nextClicked.clicked) {
            console.log(`[RBB] Clicked Next (${nextClicked.text}), waiting for page load...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
            await this.waitForPageLoad();
          } else {
            console.log('[RBB] Could not find Next button, stopping pagination');
            break;
          }
        }
      }

      console.log(`[RBB] Total transactions from all pages: ${allTransactions.length}`);
      return allTransactions;
    }

    // Scroll back to top
    await this.page.evaluate(() => window.scrollTo(0, 0));
    await new Promise(resolve => setTimeout(resolve, 500));

    // Extract transactions from the page (single page case)
    // RBB Statement Table Format: TRANSACTION DATE | VALUE DATE | CHQ. NO. | DESCRIPTION | AMOUNT | BALANCE
    const transactions = await this.page.evaluate(() => {
      const data = [];

      // Find the transaction table - look for table with transaction headers
      const tables = document.querySelectorAll('table');
      let transactionTable = null;

      for (const table of tables) {
        const headerText = table.innerText.toLowerCase();
        if (headerText.includes('transaction date') || headerText.includes('description') && headerText.includes('balance')) {
          transactionTable = table;
          break;
        }
      }

      if (!transactionTable) {
        console.log('Transaction table not found');
        return data;
      }

      // Get all rows from tbody
      const rows = transactionTable.querySelectorAll('tbody tr');
      console.log(`Found ${rows.length} rows in transaction table`);

      rows.forEach((row, index) => {
        const cells = row.querySelectorAll('td');
        console.log(`Row ${index}: ${cells.length} cells`);

        if (cells.length >= 5) {
          // RBB Format: TRANSACTION DATE | VALUE DATE | CHQ. NO. | DESCRIPTION | AMOUNT | BALANCE
          const dateText = cells[0]?.textContent?.trim() || '';
          const valueDateText = cells[1]?.textContent?.trim() || '';
          const chequeNo = cells[2]?.textContent?.trim() || '';
          const description = cells[3]?.textContent?.trim() || '';
          const amountText = cells[4]?.textContent?.trim() || '0';
          const balanceText = cells[5]?.textContent?.trim() || '0';

          // Parse amount - remove commas and parse
          const amount = parseFloat(amountText.replace(/,/g, '').replace(/[^0-9.-]/g, '')) || 0;
          const balance = parseFloat(balanceText.replace(/,/g, '').replace(/[^0-9.-]/g, '')) || 0;

          // Skip header rows and empty rows
          if (dateText.toLowerCase().includes('transaction') || dateText.toLowerCase().includes('date')) {
            return; // Skip header row
          }

          // Skip rows without valid dates (like "-" or "N/A" for opening/closing balance)
          const isValidDate = dateText && dateText !== '-' && dateText !== 'N/A' && /\d{4}/.test(dateText);

          // Determine debit/credit based on description or amount sign
          // RBB: positive amounts are credits (deposits), we need to check description for transaction type
          let debit = 0;
          let credit = 0;

          // Check if it's opening/closing balance
          if (description.toLowerCase().includes('opening balance') || description.toLowerCase().includes('closing balance')) {
            // Skip opening/closing balance entries or handle specially
            return;
          }

          // For RBB, we can determine type by description keywords or use amount sign
          // Typically: ESEWASTLMT, FONEPAY, etc. are credits (deposits)
          // Withdrawals would be debits
          if (amount > 0) {
            credit = Math.abs(amount);
          } else {
            debit = Math.abs(amount);
          }

          const txn = {
            date: dateText,
            valueDate: valueDateText,
            reference: chequeNo,
            description: description,
            debit: debit,
            credit: credit,
            balance: balance
          };

          // Only add if has valid transaction data
          if (isValidDate || (description && (debit > 0 || credit > 0))) {
            data.push(txn);
          }
        }
      });

      return data;
    });

    console.log(`[RBB] Found ${transactions.length} transactions`);

    // Take final screenshot
    try {
      await this.page.screenshot({ path: '/tmp/rbb-after-extract.png' });
    } catch (e) {}

    return transactions;
  }

  /**
   * Extract transactions from the current page view
   */
  async extractPageTransactions() {
    return await this.page.evaluate(() => {
      const data = [];

      // Find the transaction table
      const tables = document.querySelectorAll('table');
      let transactionTable = null;

      for (const table of tables) {
        const headerText = table.innerText.toLowerCase();
        if (headerText.includes('transaction date') || (headerText.includes('description') && headerText.includes('balance'))) {
          transactionTable = table;
          break;
        }
      }

      if (!transactionTable) {
        return data;
      }

      // Get all rows from tbody
      const rows = transactionTable.querySelectorAll('tbody tr');

      rows.forEach((row) => {
        const cells = row.querySelectorAll('td');

        if (cells.length >= 5) {
          const dateText = cells[0]?.textContent?.trim() || '';
          const valueDateText = cells[1]?.textContent?.trim() || '';
          const chequeNo = cells[2]?.textContent?.trim() || '';
          const description = cells[3]?.textContent?.trim() || '';
          const amountText = cells[4]?.textContent?.trim() || '0';
          const balanceText = cells[5]?.textContent?.trim() || '0';

          const amount = parseFloat(amountText.replace(/,/g, '').replace(/[^0-9.-]/g, '')) || 0;
          const balance = parseFloat(balanceText.replace(/,/g, '').replace(/[^0-9.-]/g, '')) || 0;

          // Skip header rows
          if (dateText.toLowerCase().includes('transaction') || dateText.toLowerCase().includes('date')) {
            return;
          }

          // Skip opening/closing balance entries
          if (description.toLowerCase().includes('opening balance') || description.toLowerCase().includes('closing balance')) {
            return;
          }

          // Determine debit/credit
          let debit = 0;
          let credit = 0;
          if (amount > 0) {
            credit = Math.abs(amount);
          } else {
            debit = Math.abs(amount);
          }

          const isValidDate = dateText && dateText !== '-' && dateText !== 'N/A' && /\d{4}/.test(dateText);

          if (isValidDate || (description && (debit > 0 || credit > 0))) {
            data.push({
              date: dateText,
              valueDate: valueDateText,
              reference: chequeNo,
              description: description,
              debit: debit,
              credit: credit,
              balance: balance
            });
          }
        }
      });

      return data;
    });
  }

  /**
   * Wait for page to finish loading (wait for Loading indicator to disappear)
   */
  async waitForPageLoad() {
    // Wait for any loading indicators to disappear
    try {
      // Wait up to 15 seconds for loading to complete
      for (let i = 0; i < 30; i++) {
        const isLoading = await this.page.evaluate(() => {
          const bodyText = document.body.innerText.toLowerCase();
          return bodyText.includes('loading') || document.querySelector('.loading, .spinner, .mat-spinner, [class*="loading"]');
        });

        if (!isLoading) {
          console.log('[RBB] Page finished loading');
          break;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (e) {
      console.log('[RBB] Error waiting for page load:', e.message);
    }

    // Additional wait for Angular to settle
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  /**
   * Set date filter on statement page using JavaScript to trigger Angular change detection
   */
  async setDateFilter(fromDate, toDate) {
    console.log(`[RBB] Setting date filter: ${fromDate} to ${toDate}`);

    try {
      // First, click somewhere else to dismiss any open calendar/overlay
      await this.page.click('body');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Press Escape multiple times to close any open overlays
      await this.page.keyboard.press('Escape');
      await new Promise(resolve => setTimeout(resolve, 300));
      await this.page.keyboard.press('Escape');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Use actual keyboard typing to trigger Angular's native event handlers
      // This simulates real user interaction

      // Find and clear FROM date input
      const fromInput = await this.page.$('input[name="fromDate"]');
      const toInput = await this.page.$('input[name="toDate"]');

      if (fromInput && toInput) {
        console.log('[RBB] Found date inputs, typing dates like a real user...');

        // Click FROM input to focus it
        await fromInput.click();
        await new Promise(resolve => setTimeout(resolve, 500));

        // Close any date picker that opened
        await this.page.keyboard.press('Escape');
        await new Promise(resolve => setTimeout(resolve, 300));

        // Select all and delete existing content
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('a');
        await this.page.keyboard.up('Control');
        await this.page.keyboard.press('Backspace');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Type the FROM date
        await this.page.keyboard.type(fromDate, { delay: 50 });
        console.log(`[RBB] Typed FROM date: ${fromDate}`);

        // Press Tab to move to next field and close date picker
        await this.page.keyboard.press('Tab');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Now handle TO date - it should already be focused from Tab
        // Clear it
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('a');
        await this.page.keyboard.up('Control');
        await this.page.keyboard.press('Backspace');
        await new Promise(resolve => setTimeout(resolve, 200));

        // Type the TO date
        await this.page.keyboard.type(toDate, { delay: 50 });
        console.log(`[RBB] Typed TO date: ${toDate}`);

        // Press Tab to blur and close any date picker
        await this.page.keyboard.press('Tab');
        await new Promise(resolve => setTimeout(resolve, 500));

        // Verify values were set
        const dateResult = await this.page.evaluate(() => {
          const from = document.querySelector('input[name="fromDate"]');
          const to = document.querySelector('input[name="toDate"]');
          return {
            fromValue: from ? from.value : 'not found',
            toValue: to ? to.value : 'not found'
          };
        });
        console.log('[RBB] Date values after typing:', JSON.stringify(dateResult));

      } else {
        console.log('[RBB] Date input fields not found!');
        console.log(`[RBB] fromInput: ${!!fromInput}, toInput: ${!!toInput}`);
      }

      // Wait a moment for Angular to process
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Take screenshot to verify dates are entered
      try {
        await this.page.screenshot({ path: '/tmp/rbb-dates-entered.png' });
        console.log('[RBB] Screenshot saved after entering dates');
      } catch (e) {}

      // CRITICAL: Close the calendar picker before clicking Show
      console.log('[RBB] Closing calendar picker...');

      // Press Escape multiple times to close calendar
      await this.page.keyboard.press('Escape');
      await new Promise(resolve => setTimeout(resolve, 300));
      await this.page.keyboard.press('Escape');
      await new Promise(resolve => setTimeout(resolve, 500));

      // Click on the page heading to close any dropdown/calendar
      await this.page.click('body', { position: { x: 100, y: 100 } });
      await new Promise(resolve => setTimeout(resolve, 500));

      // Take screenshot to verify calendar is closed
      try {
        await this.page.screenshot({ path: '/tmp/rbb-before-show.png' });
        console.log('[RBB] Screenshot saved before Show button click');
      } catch (e) {}

      // Click the Show button and wait for network response
      console.log('[RBB] Looking for Show button...');

      // Get the Show button's bounding box for a real mouse click
      const showButtonInfo = await this.page.evaluate(() => {
        const allElements = document.querySelectorAll('button, div, span, a');
        for (const el of allElements) {
          const text = (el.textContent || '').trim();
          if (text === 'Show') {
            const rect = el.getBoundingClientRect();
            return {
              found: true,
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
              tag: el.tagName,
              text: text
            };
          }
        }
        return { found: false };
      });

      console.log('[RBB] Show button info:', JSON.stringify(showButtonInfo));

      if (showButtonInfo.found) {
        // Click at the exact coordinates
        console.log(`[RBB] Clicking Show button at (${showButtonInfo.x}, ${showButtonInfo.y})...`);
        await this.page.mouse.click(showButtonInfo.x, showButtonInfo.y);
        console.log('[RBB] Show button clicked via mouse.click');
      } else {
        // Fallback to evaluate click
        console.log('[RBB] Show button not found, trying evaluate...');
        await this.page.evaluate(() => {
          const allElements = document.querySelectorAll('button, div, span, a');
          for (const el of allElements) {
            const text = (el.textContent || '').trim().toLowerCase();
            if (text === 'show') {
              el.click();
              return;
            }
          }
        });
      }

      // Wait for transactions to load
      console.log('[RBB] Waiting for transactions to load (15 seconds)...');
      await new Promise(resolve => setTimeout(resolve, 15000));

      // Take screenshot after Show
      try {
        await this.page.screenshot({ path: '/tmp/rbb-after-show.png' });
        console.log('[RBB] Screenshot saved after Show button click');
      } catch (e) {}

    } catch (e) {
      console.log('[RBB] Error setting date filter:', e.message);
    }
  }

  /**
   * Get account balance from dashboard
   */
  async fetchAccountBalance() {
    console.log('[RBB] Fetching account balance...');

    await this.page.goto(this.config.dashboardUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Take screenshot for debugging
    try {
      await this.page.screenshot({ path: '/tmp/rbb-dashboard.png' });
      console.log('[RBB] Dashboard screenshot saved to /tmp/rbb-dashboard.png');
    } catch (e) {}

    const balanceInfo = await this.page.evaluate(() => {
      // RBB Smart Banking specific: Look for account card with balance info
      // Format from user: "01 Account 1620100002431001 Usable Balance NPR. 991,385.25 Actual Balance NPR. 994,385.25"

      let balance = 0;
      let accountNumber = '';

      // Try to find text containing "Usable Balance" or "Available Balance"
      const bodyText = document.body.innerText;

      // Extract account number (format: 16XXXXXXXXXX)
      const accountMatch = bodyText.match(/(\d{16})/);
      if (accountMatch) {
        accountNumber = accountMatch[1];
      }

      // Extract balance after "Usable Balance NPR." or "Available Balance"
      const usableMatch = bodyText.match(/Usable Balance\s*(?:NPR\.?)?\s*([\d,]+\.?\d*)/i);
      const availableMatch = bodyText.match(/Available Balance\s*(?:NPR\.?)?\s*([\d,]+\.?\d*)/i);

      if (usableMatch) {
        balance = parseFloat(usableMatch[1].replace(/,/g, ''));
      } else if (availableMatch) {
        balance = parseFloat(availableMatch[1].replace(/,/g, ''));
      } else {
        // Fallback: find elements with balance class
        const balanceEl = document.querySelector('.account-balance, .balance-amount, .available-balance, [class*="balance"]');
        if (balanceEl) {
          balance = parseFloat(balanceEl.textContent.replace(/[^0-9.-]/g, '')) || 0;
        }
      }

      // Also extract Actual Balance
      const actualMatch = bodyText.match(/Actual Balance\s*(?:NPR\.?)?\s*([\d,]+\.?\d*)/i);
      const actualBalance = actualMatch ? parseFloat(actualMatch[1].replace(/,/g, '')) : balance;

      return {
        balance: balance,
        actualBalance: actualBalance,
        accountNumber: accountNumber
      };
    });

    console.log('[RBB] Balance info:', JSON.stringify(balanceInfo));
    return balanceInfo;
  }

  /**
   * Run a single sync cycle
   */
  async sync() {
    if (this.status === 'syncing') {
      console.log('[RBB] Sync already in progress, skipping...');
      return;
    }

    this.emitStatus('syncing');
    this.error = null;

    try {
      await this.initBrowser();
      await this.login();

      // Fetch account balance from dashboard
      const balanceInfo = await this.fetchAccountBalance();
      console.log('[RBB] Account balance:', balanceInfo.balance);

      // Now fetch transactions - browser is still on dashboard page
      // fetchTransactions will click Statement button from dashboard
      const transactions = await this.fetchTransactions();

      // Save transactions to database
      let savedCount = 0;
      let duplicateCount = 0;
      for (const txn of transactions) {
        try {
          db.saveRBBTransaction(txn);
          savedCount++;
        } catch (e) {
          // Duplicate or error
          if (e.message?.includes('UNIQUE constraint')) {
            duplicateCount++;
          } else {
            console.log('[RBB] Error saving transaction:', e.message);
          }
        }
      }

      console.log(`[RBB] Saved ${savedCount} new transactions, ${duplicateCount} duplicates skipped`);

      // Update sync state
      this.lastSyncTime = new Date().toISOString();
      db.updateRBBSyncState({
        status: 'success',
        accountNumber: balanceInfo.accountNumber,
        accountBalance: balanceInfo.balance
      });

      this.emitStatus('success', {
        transactionsSaved: savedCount,
        totalTransactions: transactions.length,
        balance: balanceInfo.balance,
        lastSync: this.lastSyncTime
      });

      this.emitUpdate({ transactions: savedCount });

    } catch (error) {
      console.error('[RBB] Sync error:', error.message);
      this.error = error.message;
      this.emitStatus('error', { error: error.message });

      db.updateRBBSyncState({
        status: 'error',
        error: error.message
      });
    } finally {
      // Always close browser after sync
      await this.closeBrowser();
    }
  }

  /**
   * Start the sync scheduler
   */
  start() {
    if (this.isRunning) {
      console.log('[RBB] Service already running');
      return;
    }

    if (!this.config.username || !this.config.password) {
      console.log('[RBB] Not starting - credentials not configured');
      return;
    }

    console.log(`[RBB] Starting sync service (interval: ${this.config.intervalMs}ms)`);
    this.isRunning = true;

    // Run initial sync
    this.sync();

    // Schedule periodic syncs
    this.syncInterval = setInterval(() => {
      this.sync();
    }, this.config.intervalMs);
  }

  /**
   * Stop the sync scheduler
   */
  async stop() {
    console.log('[RBB] Stopping sync service...');
    this.isRunning = false;

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    await this.closeBrowser();
  }

  /**
   * Close browser instance
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * Manual sync trigger
   */
  async triggerSync() {
    console.log('[RBB] Manual sync triggered');
    await this.sync();
  }
}

// Export singleton
export const rbbService = new RBBService();
export default rbbService;
