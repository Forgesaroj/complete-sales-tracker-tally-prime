import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000
});

// Dashboard
export const getDashboardSummary = () => api.get('/dashboard/summary');

// Bills
export const getBills = (params = {}) => api.get('/bills', { params: { includeItems: 'true', ...params } });
export const getPendingBills = () => api.get('/bills/pending'); // Critical pending bills only
export const getAllPendingBills = () => api.get('/bills/pending/all'); // All pending sales bills
export const getPendingBillsCounts = () => api.get('/bills/pending/counts');
export const getClearedBills = () => api.get('/bills/cleared');
export const getBillById = (id) => api.get(`/bills/${id}`);
export const updateBillDispatch = (id, status) => api.patch(`/bills/${id}/dispatch`, { status });
export const getBillItems = (id) => api.get(`/bills/${id}/items`, { timeout: 30000 });
export const getBillItemsBatch = (ids) => api.get('/bills/batch-items', { params: { ids: ids.join(',') }, timeout: 30000 });
export const addBillItem = (id, item) => api.post(`/bills/${id}/items`, item, { timeout: 60000 });
export const updateBillItems = (id, items) => api.put(`/bills/${id}/items`, { items }, { timeout: 60000 });
export const getBillPrintData = (id) => api.get(`/bills/${id}/print-data`, { timeout: 30000 });

// Email
export const testEmailConnection = () => api.post('/email/test-connection');
export const sendTestEmail = (toEmail) => api.post('/email/test', { toEmail });
export const emailBill = (billId, toEmail, nepaliDate = '') =>
  api.post('/email/send-bill', { billId, toEmail, nepaliDate }, { timeout: 30000 });

// Vouchers (ALL types - Sales, Receipt, Payment, Journal, Purchase, etc.)
export const getAllVouchers = (params = {}) => api.get('/vouchers', { params });
export const getVoucherTypesList = () => api.get('/vouchers/types');
export const getDeletedVouchers = (params = {}) => api.get('/vouchers/deleted', { params });
export const restoreDeletedVoucher = (guid) => api.post(`/vouchers/restore/${guid}`);
export const permanentlyDeleteVoucher = (guid) => api.delete(`/vouchers/permanent/${guid}`);
export const updateVoucherAuditStatus = (id, status) => api.patch(`/vouchers/${id}/audit-status`, { status });
export const bulkUpdateAuditStatus = (ids, status) => api.patch('/vouchers/bulk-audit', { ids, status });

// Voucher History & Change Log
export const getVoucherHistory = (masterId) => api.get(`/voucher-history/${masterId}`);
export const getVoucherChangeLog = (masterId) => api.get(`/voucher-history/${masterId}/changes`);
export const getRecentChanges = (limit = 50) => api.get('/voucher-history/recent-changes', { params: { limit } });
export const getHistoryStats = () => api.get('/voucher-history/stats');

// Payments
export const createPayment = (data) => api.post('/payments', data);
export const getPayments = (params = {}) => api.get('/payments', { params });

// Daybook
export const getDaybook = (params = {}) => api.get('/daybook', { params });
export const getPartySummary = (params = {}) => api.get('/daybook/party-summary', { params });

// Sacks
export const getSacks = (params = {}) => api.get('/sacks', { params });
export const getSackById = (id) => api.get(`/sacks/${id}`);
export const createSack = (data) => api.post('/sacks', data);
export const addSackItem = (sackId, data) => api.post(`/sacks/${sackId}/items`, data);
export const updateSackStatus = (id, status) => api.patch(`/sacks/${id}/status`, { status });

// Sync
export const getSyncStatus = () => api.get('/sync/status');
export const startSyncService = () => api.post('/sync/start');
export const stopSyncService = () => api.post('/sync/stop');
export const triggerSync = () => api.post('/sync/trigger');
export const syncDateRange = (fromDate, toDate) => api.post('/sync/date-range', { fromDate, toDate });
export const syncDeletedVouchers = (voucherTypes = null) => api.post('/sync/deleted', { voucherTypes });
export const getTallyStatus = () => api.get('/tally/status');

// Companies
export const getCompanies = () => api.get('/tally/companies');
export const setActiveCompany = (companyName) => api.post('/tally/company', { companyName });

// Tally Voucher Types
export const getTallyVoucherTypes = () => api.get('/tally/voucher-types');

// Auth
export const login = (credentials) => api.post('/auth/login', credentials);

// Users
export const getUsers = () => api.get('/users');
export const createUser = (data) => api.post('/users', data);
export const updateUserNotifications = (id, prefs) => api.patch(`/users/${id}/notifications`, prefs);

// Notifications
export const getNotifications = (userId) => api.get('/notifications', { params: { userId } });
export const markNotificationRead = (id) => api.patch(`/notifications/${id}/read`);

// Config
export const getVoucherTypes = () => api.get('/config/voucher-types');
export const getBillStatuses = () => api.get('/config/bill-statuses');

// App Settings
export const getAppSettings = () => api.get('/config/settings');
export const saveAppSettings = (settings) => api.post('/config/settings', { settings });
export const updateSetting = (key, value) => api.put(`/config/settings/${key}`, { value });

// Fonepay
export const getFonepayTransactions = (params = {}) => api.get('/fonepay/transactions', { params });
export const getFonepaySummary = () => api.get('/fonepay/summary');
export const getFonepayStatus = () => api.get('/fonepay/status');
export const triggerFonepaySync = () => api.post('/fonepay/sync');
export const fetchFonepayHistorical = (fromDate, toDate) => api.post('/fonepay/historical', { fromDate, toDate });
export const generateFonepayQR = (amount, remarks = '') => api.post('/fonepay/qr/generate', { amount, remarks }, { timeout: 60000 });

// RBB Smart Banking
export const getRBBTransactions = (params = {}) => api.get('/rbb/transactions', { params });
export const getRBBSummary = () => api.get('/rbb/summary');
export const getRBBStatus = () => api.get('/rbb/status');
export const triggerRBBSync = () => api.post('/rbb/sync');
export const startRBBService = () => api.post('/rbb/start');
export const stopRBBService = () => api.post('/rbb/stop');

// Stock Items (Inventory)
export const getStockItems = (params = {}) => api.get('/stock', { params });
export const searchStockItems = (q) => api.get('/stock/search', { params: { q } });

// Ledgers (Parties)
export const getLedgers = (params = {}) => api.get('/ledgers', { params });
export const getDebtors = (params = {}) => api.get('/ledgers/debtors', { params });
export const getCreditors = (params = {}) => api.get('/ledgers/creditors', { params });
export const searchLedgers = (q) => api.get('/ledgers/search', { params: { q } });
export const getAgents = () => api.get('/ledgers/agents');

// Invoice Creation (sends to Tally)
export const createInvoice = (data) => api.post('/invoice', data, { timeout: 30000 });
export const createSimpleInvoice = (data) => api.post('/invoice/simple', data, { timeout: 30000 });
export const getPendingInvoices = () => api.get('/invoice/pending');
export const syncPendingInvoices = () => api.post('/invoice/pending/sync');
export const retryFailedInvoices = () => api.post('/invoice/pending/retry-failed');
export const deletePendingInvoice = (id) => api.delete(`/invoice/pending/${id}`);
export const getDashboardBillHistory = (params = {}) => api.get('/invoice/history', { params });
export const getDashboardBillSummary = (date) => api.get('/invoice/summary', { params: { date } });

// Outstanding & Ageing
export const getOutstandingBills = (party = '', overdue = false) => api.get('/outstanding', { params: { ...(party ? { party } : {}), ...(overdue ? { overdue: '1' } : {}) } });
export const getAgeingSummary = (overdue = false) => api.get('/outstanding/ageing', { params: overdue ? { overdue: '1' } : {} });
export const getOutstandingParties = (overdue = false) => api.get('/outstanding/parties', { params: overdue ? { overdue: '1' } : {} });
export const getReceivableSummary = () => api.get('/outstanding/summary');
export const getCustomerOutstanding = (partyName) => api.get(`/outstanding/customer/${encodeURIComponent(partyName)}`);
export const syncOutstanding = () => api.post('/outstanding/sync', {}, { timeout: 30000 });

// Profit & Loss
export const getProfitAndLoss = (from = '', to = '') => api.get('/profit-loss', { params: { from, to } });

// Balance Sheet
export const getBalanceSheet = (from = '', to = '') => api.get('/balance-sheet', { params: { from, to }, timeout: 60000 });

// Trial Balance
export const getTrialBalance = (from = '', to = '') => api.get('/trial-balance', { params: { from, to }, timeout: 60000 });

// Cash Flow
export const getCashFlow = (from, to) => api.get('/cash-flow', { params: { from, to }, timeout: 60000 });

// Ratio Analysis (fetches BS + P&L, so needs extra time)
export const getRatioAnalysis = (from = '', to = '') => api.get('/ratios', { params: { from, to }, timeout: 120000 });

// Stock Groups
export const getStockGroupList = () => api.get('/stock-groups');
export const getStockGroupSummary = () => api.get('/stock-groups/summary');
export const syncStockGroups = () => api.post('/stock-groups/sync', {}, { timeout: 30000 });

// Price Lists
export const getPriceListData = (level = '') => api.get('/price-lists', { params: level ? { level } : {} });
export const getPriceLevels = () => api.get('/price-lists/levels');
export const getItemPrices = (name) => api.get(`/price-lists/item/${encodeURIComponent(name)}`);
export const syncPriceLists = () => api.post('/price-lists/sync', {}, { timeout: 30000 });

// Inventory Movement
export const getInventoryMovement = (from, to, item = '') => api.get('/inventory-movement', { params: { from, to, ...(item ? { item } : {}) } });
export const getInventoryMovementSummary = (from, to) => api.get('/inventory-movement/summary', { params: { from, to } });

// Bank & Fonepay Reconciliation
export const getReconMatches = (type = '') => api.get('/bank-recon', { params: type ? { type } : {} });
export const getReconSummary = (type = '') => api.get('/bank-recon/summary', { params: type ? { type } : {} });
export const getUnmatchedRBB = () => api.get('/bank-recon/unmatched/rbb');
export const getUnmatchedFonepay = () => api.get('/bank-recon/unmatched/fonepay');
export const fetchTallyBankVouchers = (bankLedger, from, to) => api.post('/bank-recon/fetch-tally', { bankLedger, from, to }, { timeout: 30000 });
export const autoMatchRecon = (type, bankLedger = '', from = '', to = '') => api.post('/bank-recon/auto-match', { type, bankLedger, from, to }, { timeout: 60000 });
export const manualMatchRecon = (data) => api.post('/bank-recon/manual-match', data);

// Tally XML Viewer
export const getTallyXmlVouchers = (fromDate, toDate) => api.get('/tally-xml/vouchers', { params: { fromDate, toDate }, timeout: 120000 });
export const getTallyXmlVoucherDetail = (masterId) => api.get(`/tally-xml/voucher/${masterId}`, { timeout: 120000 });

// Columnar Dashboard
export const getColumnarBills = (params = {}) => api.get('/columnar', { params });
export const getColumnarDetails = (params = {}) => api.get('/columnar/details', { params });

// Cheque Reconciliation
export const getChequeReconciliation = () => api.get('/cheques/reconciliation', { timeout: 30000 });
export const getChequeReconBalances = () => api.get('/cheques/reconciliation/balances', { timeout: 15000 });
export const getODBCCheques = (params) => api.get('/cheques/reconciliation/odbc-cheques', { params, timeout: 30000 });
export const syncODBCVouchers = () => api.post('/cheques/sync-odbc', {}, { timeout: 60000 });

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

// Cheque Post (receipts -> ODBC)
export const getChequePostReceipts = (date) => api.get('/cheques/cheque-post/receipts', { params: { date }, timeout: 30000 });
export const getODBCParties = () => api.get('/cheques/cheque-post/odbc-parties', { timeout: 30000 });
export const getODBCBanks = () => api.get('/cheques/cheque-post/odbc-banks', { timeout: 30000 });
export const syncChequePost = (data) => api.post('/cheques/cheque-post/sync', data, { timeout: 60000 });
export const syncAllChequePosts = (data) => api.post('/cheques/cheque-post/sync-all', data, { timeout: 120000 });
export const getPostedMasterIds = (date) => api.get('/cheques/cheque-post/posted', { params: { date } });
export const getChequePostLog = (params) => api.get('/cheques/cheque-post/log', { params });
export const getODBCVoucherDetail = (masterId) => api.get(`/cheques/odbc-voucher/${masterId}`, { timeout: 30000 });

// Voucher Lock
export const getVoucherLockStatus = () => api.get('/voucher-lock/status', { timeout: 30000 });
export const lockVouchers = (data) => api.post('/voucher-lock/lock', data, { timeout: 600000 });
export const unlockVouchers = (data) => api.post('/voucher-lock/unlock', data, { timeout: 600000 });
export const setVoucherLockSchedule = (data) => api.put('/voucher-lock/schedule', data);
export const getVoucherLockLog = () => api.get('/voucher-lock/log');
export const toggleVoucherLock = (data) => api.post('/voucher-lock/toggle', data, { timeout: 30000 });

// Chat / AI Assistant
export const getChatStatus = () => api.get('/chat/status');
export const chatQuery = (command, params) => api.post('/chat/query', { command, params }, { timeout: 30000 });
export const chatMessage = (message, history = []) => api.post('/chat/message', { message, history }, { timeout: 60000 });

// Cheque Collection
export const getCollectionStaff = () => api.get('/collection/staff');
export const createCollectionStaff = (data) => api.post('/collection/staff', data);
export const updateCollectionStaff = (id, data) => api.put(`/collection/staff/${id}`, data);
export const deleteCollectionStaff = (id) => api.delete(`/collection/staff/${id}`);
export const getStaffHistory = (id) => api.get(`/collection/staff/${id}/history`);
export const getCollectionBatches = (params = {}) => api.get('/collection/batches', { params });
export const createCollectionBatch = (data) => api.post('/collection/batches', data);
export const getCollectionBatch = (id) => api.get(`/collection/batches/${id}`);
export const getBatchPrintData = (id) => api.get(`/collection/batches/${id}/print`);
export const updateBatchItem = (batchId, itemId, data) => api.put(`/collection/batches/${batchId}/items/${itemId}`, data);
export const bulkUpdateBatchItems = (batchId, data) => api.put(`/collection/batches/${batchId}/bulk-update`, data);
export const completeBatch = (id) => api.post(`/collection/batches/${id}/complete`);
export const createCollectionReceipt = (id) => api.post(`/collection/batches/${id}/create-receipt`, {}, { timeout: 60000 });
export const getAssignableCheques = () => api.get('/collection/assignable-cheques');
export const getCollectionStats = () => api.get('/collection/stats');

// Cheque Receivable (from ODBC company)
export const getChequeReceivable = () => api.get('/collection/cheque-receivable', { timeout: 30000 });
export const getChequeReceivableLocal = (params = {}) => api.get('/collection/cheque-receivable/local', { params });

// Bank Names
export const getBankNames = () => api.get('/bank-names');
export const createBankName = (data) => api.post('/bank-names', data);
export const updateBankName = (id, data) => api.put(`/bank-names/${id}`, data);
export const deleteBankName = (id) => api.delete(`/bank-names/${id}`);

// Ledger Mapping (billing party → ODBC party)
export const getLedgerMappings = () => api.get('/bank-names/ledger-mappings');
export const upsertLedgerMapping = (data) => api.post('/bank-names/ledger-mappings', data);
export const updateLedgerMappingApi = (id, data) => api.put(`/bank-names/ledger-mappings/${id}`, data);
export const deleteLedgerMapping = (id) => api.delete(`/bank-names/ledger-mappings/${id}`);

export default api;
