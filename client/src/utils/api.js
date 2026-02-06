import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 10000
});

// Dashboard
export const getDashboardSummary = () => api.get('/dashboard/summary');

// Bills
export const getBills = (params = {}) => api.get('/bills', { params });
export const getPendingBills = () => api.get('/bills/pending');
export const getBillById = (id) => api.get(`/bills/${id}`);
export const updateBillDispatch = (id, status) => api.patch(`/bills/${id}/dispatch`, { status });

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
export const getTallyStatus = () => api.get('/tally/status');

// Companies
export const getCompanies = () => api.get('/tally/companies');
export const setActiveCompany = (companyName) => api.post('/tally/company', { companyName });

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

// Fonepay
export const getFonepayTransactions = (params = {}) => api.get('/fonepay/transactions', { params });
export const getFonepaySummary = () => api.get('/fonepay/summary');
export const getFonepayStatus = () => api.get('/fonepay/status');
export const triggerFonepaySync = () => api.post('/fonepay/sync');
export const fetchFonepayHistorical = (fromDate, toDate) => api.post('/fonepay/historical', { fromDate, toDate });
export const generateFonepayQR = (amount, remarks = '') => api.post('/fonepay/qr/generate', { amount, remarks }, { timeout: 60000 });

export default api;
