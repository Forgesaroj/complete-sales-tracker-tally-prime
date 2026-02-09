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
export const getBillById = (id) => api.get(`/bills/${id}`);
export const updateBillDispatch = (id, status) => api.patch(`/bills/${id}/dispatch`, { status });
export const getBillItems = (id) => api.get(`/bills/${id}/items`);
export const getBillItemsBatch = (ids) => api.get('/bills/batch-items', { params: { ids: ids.join(',') } });
export const addBillItem = (id, item) => api.post(`/bills/${id}/items`, item, { timeout: 60000 });
export const updateBillItems = (id, items) => api.put(`/bills/${id}/items`, { items }, { timeout: 60000 });
export const getBillPrintData = (id) => api.get(`/bills/${id}/print-data`);

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

export default api;
