/**
 * Rush Dashboard - Dark Theme Wholesale POS Dashboard
 * Comprehensive dashboard with sidebar navigation, stats, bills, counter, dispatch, sacks, daybook
 */

import React, { useState, useEffect, useCallback } from 'react';
import socket from '../utils/socket';
import {
  getDashboardSummary,
  getAllPendingBills,
  getBills,
  getDaybook,
  getSacks,
  updateBillDispatch,
  updateSackStatus,
  getTallyStatus,
  getSyncStatus,
  getAllVouchers,
  getVoucherTypesList,
  getFonepayTransactions,
  getFonepaySummary,
  getRBBTransactions,
  getRBBSummary,
  getStockItems,
  getDebtors,
  createInvoice,
  getPendingInvoices,
  syncPendingInvoices,
  retryFailedInvoices,
  getDashboardBillHistory,
  getDashboardBillSummary,
  getRBBStatus,
  startRBBService,
  stopRBBService,
  triggerRBBSync,
  getAgents,
  getAppSettings,
  saveAppSettings,
  getTallyVoucherTypes,
  syncDeletedVouchers,
  getDeletedVouchers,
  restoreDeletedVoucher,
  getBillItems,
  addBillItem,
  updateBillItems,
  searchStockItems,
  getBillPrintData,
  testEmailConnection,
  sendTestEmail,
  emailBill
} from '../utils/api';

const API_BASE = import.meta.env.VITE_API_URL || '';

// Page titles with icons
const PAGE_TITLES = {
  dashboard: '📊 Dashboard',
  counter: '💳 Counter',
  pending: '⏳ Pending Bills',
  vouchers: '📜 Total Vouchers',
  bills: '🧾 All Bills',
  deleted: '🗑️ Deleted Vouchers',
  dispatch: '📦 Dispatch',
  sacks: '🎒 Sacks',
  daybook: '📒 Daybook',
  fonepay: '📱 Fonepay',
  rbb: '🏦 RBB Banking',
  'bill-history': '📋 Dashboard Bills',
  parties: '👥 Parties',
  settings: '⚙️ Settings'
};

// Format currency
const formatCurrency = (amount) => {
  const num = Math.abs(Number(amount) || 0);
  return `₹${num.toLocaleString('en-IN')}`;
};

// Format time ago
const formatTimeAgo = (dateStr) => {
  if (!dateStr) return '';
  const now = new Date();

  // Handle YYYYMMDD format from Tally
  let then;
  if (/^\d{8}$/.test(dateStr)) {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    then = new Date(year, month, day);
  } else {
    then = new Date(dateStr);
  }

  if (isNaN(then.getTime())) return '';
  const diff = Math.floor((now - then) / 1000);

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)} days ago`;
};

// Parse date from various formats (YYYYMMDD, YYYY-MM-DD, ISO, etc.)
const parseDate = (dateStr) => {
  if (!dateStr) return null;

  // Handle YYYYMMDD format (from Tally)
  if (/^\d{8}$/.test(dateStr)) {
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6)) - 1;
    const day = parseInt(dateStr.substring(6, 8));
    return new Date(year, month, day);
  }

  // Handle standard date formats
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
};

// Format days ago (for pending bills)
const formatDaysAgo = (dateStr) => {
  if (!dateStr) return '';
  const now = new Date();
  const then = parseDate(dateStr);
  if (!then) return '';

  const diffDays = Math.floor((now - then) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return '1 day ago';
  return `${diffDays} days ago`;
};

// Convert AD to BS (Nepali Date) - Simplified approximation
const toNepaliDate = (dateStr) => {
  if (!dateStr) return '';
  const date = parseDate(dateStr);
  if (!date) return '';

  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  // Approximate conversion (AD to BS offset is ~56 years 8 months)
  let bsYear = year + 56;
  let bsMonth = month + 8;
  let bsDay = day + 15;

  if (bsDay > 30) {
    bsDay -= 30;
    bsMonth += 1;
  }
  if (bsMonth > 12) {
    bsMonth -= 12;
    bsYear += 1;
  }

  const nepaliMonths = ['बैशाख', 'जेठ', 'असार', 'श्रावण', 'भदौ', 'असोज', 'कार्तिक', 'मंसिर', 'पुष', 'माघ', 'फाल्गुन', 'चैत'];
  return `${bsDay} ${nepaliMonths[bsMonth - 1]} ${bsYear}`;
};

// Format date as DD/MM/YYYY
const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const date = parseDate(dateStr);
  if (!date) return '';

  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
};

export default function RushDashboard({ onSwitchToLegacy }) {
  // State
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isSimpleMode, setIsSimpleMode] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('rushDarkMode');
    return saved !== 'false'; // Default to dark mode
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Data state
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalReceived: 0,
    pendingAmount: 0,
    billCount: 0,
    pendingCount: 0
  });
  const [bills, setBills] = useState([]);
  const [pendingBills, setPendingBills] = useState([]); // Critical pending bills only
  const [pendingBillsCounts, setPendingBillsCounts] = useState({ total: 0, critical: 0, normal: 0 });
  const [allVouchers, setAllVouchers] = useState([]);
  const [voucherTypes, setVoucherTypes] = useState([]);
  const [daybook, setDaybook] = useState([]);
  const [sacks, setSacks] = useState([]);
  const [fonepayTxns, setFonepayTxns] = useState([]);
  const [fonepaySummary, setFonepaySummary] = useState({ total: 0, count: 0 });
  const [rbbTxns, setRbbTxns] = useState([]);
  const [rbbSummary, setRbbSummary] = useState({ total: 0, count: 0 });
  const [appSettings, setAppSettings] = useState({
    agent_ledger_group: 'Agent Agents',
    sales_ledger: '1 Sales A/c',
    default_godown: 'Main Location',
    business_name: '',
    business_address: '',
    business_phone: '',
    business_pan: '',
    smtp_host: '',
    smtp_port: '587',
    smtp_secure: 'false',
    smtp_user: '',
    smtp_pass: '',
    smtp_from_name: '',
    smtp_from_email: ''
  });
  const [pendingInvoices, setPendingInvoices] = useState([]);
  const [pendingInvoicesLoading, setPendingInvoicesLoading] = useState(false);
  const [syncingPendingInvoices, setSyncingPendingInvoices] = useState(false);
  const [loading, setLoading] = useState(true);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [fonepayLoading, setFonepayLoading] = useState(false);
  const [rbbLoading, setRbbLoading] = useState(false);
  const [deletedVouchers, setDeletedVouchers] = useState([]);
  const [deletedVouchersCount, setDeletedVouchersCount] = useState(0);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [restoringVoucher, setRestoringVoucher] = useState(null);

  // Connection status
  const [tallyConnected, setTallyConnected] = useState(false);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingDeleted, setSyncingDeleted] = useState(false);

  // Filter state
  const [billFilter, setBillFilter] = useState('all');
  const [daybookDate, setDaybookDate] = useState(new Date().toISOString().split('T')[0]);

  // Voucher filter and sorting state
  const getTodayYYYYMMDD = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  };
  const getTodayISO = () => new Date().toISOString().split('T')[0];

  const [voucherDateFrom, setVoucherDateFrom] = useState(getTodayISO());
  const [voucherDateTo, setVoucherDateTo] = useState(getTodayISO());
  const [voucherSort, setVoucherSort] = useState({ field: 'id', direction: 'desc' }); // Default: highest UID first
  const [voucherTypeFilter, setVoucherTypeFilter] = useState('');

  // Recent vouchers sort (dashboard panel)
  const [recentVoucherSort, setRecentVoucherSort] = useState({ field: 'alter_id', direction: 'desc' });

  // Fonepay filter state (default: no date filter to show all records)
  const [fonepayDateFrom, setFonepayDateFrom] = useState('');
  const [fonepayDateTo, setFonepayDateTo] = useState('');
  const [fonepaySearch, setFonepaySearch] = useState('');

  // RBB filter state (default: no date filter to show all records)
  const [rbbDateFrom, setRbbDateFrom] = useState('');
  const [rbbDateTo, setRbbDateTo] = useState('');
  const [rbbSearch, setRbbSearch] = useState('');
  const [rbbServiceStatus, setRbbServiceStatus] = useState({ isRunning: false, status: 'idle', lastSyncTime: null });
  const [rbbServiceLoading, setRbbServiceLoading] = useState(false);

  // Dashboard Bill History state
  const [billHistory, setBillHistory] = useState([]);
  const [billHistoryLoading, setBillHistoryLoading] = useState(false);
  const [billHistoryDate, setBillHistoryDate] = useState(getTodayISO());
  const [billSummary, setBillSummary] = useState({ total_count: 0, synced_count: 0, pending_count: 0, failed_count: 0, total_amount: 0, synced_amount: 0 });

  // Payment modal state (SFL fields)
  const [paymentModal, setPaymentModal] = useState({ open: false, bill: null });
  const [paymentModes, setPaymentModes] = useState({
    cashTeller1: '', cashTeller2: '', chequeReceipt: '', qrCode: '', discount: '', bankDeposit: '', esewa: ''
  });
  const [paymentLoading, setPaymentLoading] = useState(false);

  // Items modal state (for viewing/adding/editing items to pending bills)
  const [itemsModal, setItemsModal] = useState({ open: false, bill: null, items: [], loading: false });
  const [editingItems, setEditingItems] = useState([]); // Working copy for editing
  const [hasItemChanges, setHasItemChanges] = useState(false); // Track if items were modified
  const [newItemForm, setNewItemForm] = useState({ stockItem: '', quantity: 1, rate: '' });
  const [itemStockSearch, setItemStockSearch] = useState('');
  const [itemStockResults, setItemStockResults] = useState([]);
  const [showItemStockDropdown, setShowItemStockDropdown] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [savingItems, setSavingItems] = useState(false);
  const [editingItemIndex, setEditingItemIndex] = useState(-1); // Which item row is being edited

  // Email modal state
  const [emailModal, setEmailModal] = useState({ open: false, billId: null, sending: false });
  const [emailRecipient, setEmailRecipient] = useState('');
  const [emailTestResult, setEmailTestResult] = useState(null);
  const [emailTestLoading, setEmailTestLoading] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('');

  // Create Bill modal state
  const [createBillModal, setCreateBillModal] = useState(false);
  const [newBill, setNewBill] = useState({
    partyName: '',
    voucherType: 'Pending Sales Bill',
    date: new Date().toISOString().split('T')[0],
    narration: '',
    agent: '',
    items: [{ name: '', quantity: 1, rate: '', amount: 0 }]
  });
  const [createBillLoading, setCreateBillLoading] = useState(false);

  // Stock items, parties, and agents for autocomplete
  const [stockItems, setStockItems] = useState([]);
  const [partyList, setPartyList] = useState([]);
  const [agentList, setAgentList] = useState([]);
  const [tallyVoucherTypes, setTallyVoucherTypes] = useState([]);
  const [partySearch, setPartySearch] = useState('');
  const [showPartyDropdown, setShowPartyDropdown] = useState(false);
  const [showAgentDropdown, setShowAgentDropdown] = useState(false);
  const [activeItemDropdown, setActiveItemDropdown] = useState(-1); // Which item row has dropdown open
  const [highlightedStockIndex, setHighlightedStockIndex] = useState(0); // For keyboard nav in stock dropdown
  const [highlightedPartyIndex, setHighlightedPartyIndex] = useState(0); // For keyboard nav in party dropdown

  // Toasts
  const [toasts, setToasts] = useState([]);

  // Notifications
  const [notifications, setNotifications] = useState([]);

  // Add toast notification - defined early so other callbacks can use it
  const addToast = useCallback((type, title, message) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      const [summaryRes, billsRes, pendingRes] = await Promise.all([
        getDashboardSummary(),
        getBills({ limit: 50 }),
        getAllPendingBills()
      ]);

      setSummary(summaryRes.data || { totalSales: 0, totalReceived: 0, pendingAmount: 0, billCount: 0, pendingCount: 0 });
      setBills(Array.isArray(billsRes.data) ? billsRes.data : []);
      // Handle new response format: { bills, counts, description }
      const pendingData = pendingRes.data;
      if (pendingData?.bills) {
        setPendingBills(pendingData.bills);
        setPendingBillsCounts(pendingData.counts || { total: 0, critical: 0, normal: 0 });
      } else if (Array.isArray(pendingData)) {
        setPendingBills(pendingData);
        setPendingBillsCounts({ total: pendingData.length, critical: pendingData.length, normal: 0 });
      } else {
        setPendingBills([]);
        setPendingBillsCounts({ total: 0, critical: 0, normal: 0 });
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch daybook
  const fetchDaybook = useCallback(async () => {
    try {
      const res = await getDaybook({ date: daybookDate });
      setDaybook(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Failed to fetch daybook:', error);
      setDaybook([]);
    }
  }, [daybookDate]);

  // Fetch sacks
  const fetchSacks = useCallback(async () => {
    try {
      const res = await getSacks();
      setSacks(Array.isArray(res.data) ? res.data : []);
    } catch (error) {
      console.error('Failed to fetch sacks:', error);
      setSacks([]);
    }
  }, []);

  // Fetch ALL vouchers (all types - Sales, Receipt, Payment, Journal, Purchase, etc.)
  const fetchAllVouchers = useCallback(async () => {
    setVouchersLoading(true);
    try {
      // Convert ISO date (YYYY-MM-DD) to Tally format (YYYYMMDD)
      const dateFrom = voucherDateFrom ? voucherDateFrom.replace(/-/g, '') : undefined;
      const dateTo = voucherDateTo ? voucherDateTo.replace(/-/g, '') : undefined;

      const [vouchersRes, typesRes] = await Promise.all([
        getAllVouchers({
          limit: 2000,
          dateFrom,
          dateTo,
          voucherType: voucherTypeFilter || undefined
        }),
        getVoucherTypesList()
      ]);
      setAllVouchers(Array.isArray(vouchersRes.data) ? vouchersRes.data : []);
      setVoucherTypes(Array.isArray(typesRes.data) ? typesRes.data : []);
    } catch (error) {
      console.error('Failed to fetch vouchers:', error);
      setAllVouchers([]);
      setVoucherTypes([]);
    } finally {
      setVouchersLoading(false);
    }
  }, [voucherDateFrom, voucherDateTo, voucherTypeFilter]);

  // Auto-fetch vouchers when date filter changes
  useEffect(() => {
    if (currentPage === 'vouchers') {
      fetchAllVouchers();
    }
  }, [voucherDateFrom, voucherDateTo, voucherTypeFilter, currentPage, fetchAllVouchers]);

  // Fetch deleted vouchers
  const fetchDeletedVouchers = useCallback(async () => {
    setDeletedLoading(true);
    try {
      const res = await getDeletedVouchers({ limit: 1000 });
      setDeletedVouchers(res.data?.vouchers || []);
      setDeletedVouchersCount(res.data?.count || 0);
    } catch (error) {
      console.error('Failed to fetch deleted vouchers:', error);
      setDeletedVouchers([]);
      setDeletedVouchersCount(0);
    } finally {
      setDeletedLoading(false);
    }
  }, []);

  // Restore a deleted voucher
  const handleRestoreVoucher = useCallback(async (guid) => {
    setRestoringVoucher(guid);
    try {
      const res = await restoreDeletedVoucher(guid);
      if (res.data?.success) {
        addToast('success', 'Restored', 'Voucher restored successfully');
        fetchDeletedVouchers(); // Refresh the list
        fetchAllVouchers(); // Refresh main vouchers list
      } else {
        addToast('error', 'Failed', res.data?.error || 'Could not restore voucher');
      }
    } catch (error) {
      addToast('error', 'Failed', error.message || 'Could not restore voucher');
    } finally {
      setRestoringVoucher(null);
    }
  }, [addToast, fetchDeletedVouchers, fetchAllVouchers]);

  // Auto-fetch deleted vouchers when page changes
  useEffect(() => {
    if (currentPage === 'deleted') {
      fetchDeletedVouchers();
    }
  }, [currentPage, fetchDeletedVouchers]);

  // Fetch Fonepay transactions
  const fetchFonepay = useCallback(async () => {
    setFonepayLoading(true);
    try {
      // Build params with date filters - use high limit to get all records
      const params = { limit: 10000 };
      if (fonepayDateFrom) params.fromDate = fonepayDateFrom;
      if (fonepayDateTo) params.toDate = fonepayDateTo;

      const [txnRes, summaryRes] = await Promise.all([
        getFonepayTransactions(params),
        getFonepaySummary()
      ]);
      // API returns { success, count, transactions } - extract the transactions array
      const txnData = txnRes.data?.transactions || txnRes.data || [];
      setFonepayTxns(Array.isArray(txnData) ? txnData : []);
      // API returns { success, totalCount, totalAmount, successCount, failedCount }
      const summary = summaryRes.data || {};
      setFonepaySummary({ total: summary.totalAmount || 0, count: summary.totalCount || 0 });
    } catch (error) {
      console.error('Failed to fetch Fonepay:', error);
      setFonepayTxns([]);
    } finally {
      setFonepayLoading(false);
    }
  }, [fonepayDateFrom, fonepayDateTo]);

  // Fetch RBB transactions
  const fetchRBB = useCallback(async () => {
    setRbbLoading(true);
    try {
      // Build params with date filters - use high limit to get all records
      const params = { limit: 10000 };
      if (rbbDateFrom) params.fromDate = rbbDateFrom;
      if (rbbDateTo) params.toDate = rbbDateTo;

      const [txnRes, summaryRes] = await Promise.all([
        getRBBTransactions(params),
        getRBBSummary()
      ]);
      // API returns { success, count, transactions } - extract the transactions array
      const txnData = txnRes.data?.transactions || txnRes.data || [];
      setRbbTxns(Array.isArray(txnData) ? txnData : []);
      // API returns { success, accountBalance, accountNumber, ... }
      const summary = summaryRes.data || {};
      setRbbSummary({ total: summary.accountBalance || 0, count: txnData.length || 0 });
    } catch (error) {
      console.error('Failed to fetch RBB:', error);
      setRbbTxns([]);
    } finally {
      setRbbLoading(false);
    }
  }, [rbbDateFrom, rbbDateTo]);

  // Fetch RBB service status
  const fetchRBBStatus = useCallback(async () => {
    try {
      const res = await getRBBStatus();
      setRbbServiceStatus(res.data || { isRunning: false, status: 'idle' });
    } catch (error) {
      console.error('Failed to fetch RBB status:', error);
    }
  }, []);

  // Start RBB scraper service
  const handleStartRBBService = async () => {
    setRbbServiceLoading(true);
    try {
      await startRBBService();
      await fetchRBBStatus();
    } catch (error) {
      console.error('Failed to start RBB service:', error);
    } finally {
      setRbbServiceLoading(false);
    }
  };

  // Stop RBB scraper service
  const handleStopRBBService = async () => {
    setRbbServiceLoading(true);
    try {
      await stopRBBService();
      await fetchRBBStatus();
    } catch (error) {
      console.error('Failed to stop RBB service:', error);
    } finally {
      setRbbServiceLoading(false);
    }
  };

  // Trigger RBB sync manually
  const handleTriggerRBBSync = async () => {
    setRbbLoading(true);
    try {
      await triggerRBBSync();
      // Wait a bit for sync to process then refresh
      setTimeout(async () => {
        await fetchRBB();
        await fetchRBBStatus();
      }, 3000);
    } catch (error) {
      console.error('Failed to trigger RBB sync:', error);
      setRbbLoading(false);
    }
  };

  // Fetch pending invoices (locally saved bills)
  const fetchPendingInvoices = useCallback(async () => {
    setPendingInvoicesLoading(true);
    try {
      const res = await getPendingInvoices();
      setPendingInvoices(res.data?.invoices || []);
    } catch (error) {
      console.error('Failed to fetch pending invoices:', error);
      setPendingInvoices([]);
    } finally {
      setPendingInvoicesLoading(false);
    }
  }, []);

  // Fetch app settings
  const fetchAppSettings = useCallback(async () => {
    try {
      const res = await getAppSettings();
      if (res.data?.settings) {
        setAppSettings(prev => ({ ...prev, ...res.data.settings }));
      }
    } catch (error) {
      console.error('Failed to fetch app settings:', error);
    }
  }, []);

  // Save app settings
  const handleSaveSettings = useCallback(async () => {
    try {
      await saveAppSettings(appSettings);
      addToast('success', 'Settings Saved', 'Configuration updated successfully');
    } catch (error) {
      console.error('Failed to save settings:', error);
      addToast('error', 'Save Failed', 'Could not save settings');
    }
  }, [appSettings, addToast]);

  // Fetch dashboard bill history
  const fetchBillHistory = useCallback(async () => {
    setBillHistoryLoading(true);
    try {
      const [historyRes, summaryRes] = await Promise.all([
        getDashboardBillHistory({ fromDate: billHistoryDate, toDate: billHistoryDate }),
        getDashboardBillSummary(billHistoryDate)
      ]);
      setBillHistory(historyRes.data?.invoices || []);
      setBillSummary(summaryRes.data || { total_count: 0, synced_count: 0, pending_count: 0, failed_count: 0, total_amount: 0, synced_amount: 0 });
    } catch (error) {
      console.error('Failed to fetch bill history:', error);
      setBillHistory([]);
    } finally {
      setBillHistoryLoading(false);
    }
  }, [billHistoryDate]);

  // Sync all pending invoices to Tally
  const handleSyncPendingInvoices = useCallback(async () => {
    setSyncingPendingInvoices(true);
    try {
      const res = await syncPendingInvoices();
      const result = res.data;
      if (result.success) {
        addToast('success', '✓ Sync Complete', `${result.synced} synced, ${result.failed} failed`);
        fetchPendingInvoices(); // Refresh the list
      } else {
        addToast('error', 'Sync Failed', result.error || 'Unknown error');
      }
    } catch (error) {
      addToast('error', 'Sync Failed', error.response?.data?.error || error.message);
    } finally {
      setSyncingPendingInvoices(false);
    }
  }, [addToast, fetchPendingInvoices]);

  // Fetch stock items and parties for Create Bill
  const fetchCreateBillData = useCallback(async () => {
    try {
      const [stockRes, partiesRes, agentsRes, voucherTypesRes] = await Promise.all([
        getStockItems(),
        getDebtors(),
        getAgents(),
        getTallyVoucherTypes()
      ]);
      const items = stockRes.data?.items || [];
      const parties = partiesRes.data?.ledgers || [];
      const agents = agentsRes.data?.agents || [];
      const vTypes = voucherTypesRes.data?.voucherTypes || [];
      setStockItems(Array.isArray(items) ? items : []);
      setPartyList(Array.isArray(parties) ? parties : []);
      setAgentList(Array.isArray(agents) ? agents : []);
      setTallyVoucherTypes(Array.isArray(vTypes) ? vTypes : []);
    } catch (error) {
      console.error('Failed to fetch create bill data:', error);
    }
  }, []);

  // Check Tally status
  const checkTallyStatus = useCallback(async () => {
    try {
      const res = await getTallyStatus();
      setTallyConnected(res.data?.connected || false);
    } catch {
      setTallyConnected(false);
    }
  }, []);

  // Check sync status
  const checkSyncStatus = useCallback(async () => {
    try {
      const res = await getSyncStatus();
      setSyncRunning(res.data?.isRunning || false);
    } catch {
      setSyncRunning(false);
    }
  }, []);

  // Start sync service
  const startSyncService = useCallback(async () => {
    setSyncLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/sync/start`, { method: 'POST' });
      const data = await res.json();
      setSyncRunning(data.isRunning);
      addToast('success', 'Sync Started', 'Auto-sync service is now running');
    } catch (error) {
      addToast('error', 'Failed', 'Could not start sync service');
    } finally {
      setSyncLoading(false);
    }
  }, [addToast]);

  // Stop sync service
  const stopSyncService = useCallback(async () => {
    setSyncLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/sync/stop`, { method: 'POST' });
      const data = await res.json();
      setSyncRunning(data.isRunning);
      addToast('success', 'Sync Stopped', 'Auto-sync service has been stopped');
    } catch (error) {
      addToast('error', 'Failed', 'Could not stop sync service');
    } finally {
      setSyncLoading(false);
    }
  }, [addToast]);

  // Trigger manual sync
  const triggerManualSync = useCallback(async () => {
    setRefreshing(true);
    try {
      await fetch(`${API_BASE}/api/sync/trigger`, { method: 'POST' });
      await Promise.all([
        fetchData(),
        fetchDaybook(),
        fetchAllVouchers()
      ]);
      addToast('success', 'Refreshed', 'Data synced from Tally');
    } catch (error) {
      addToast('error', 'Sync Failed', 'Could not sync with Tally');
    } finally {
      setRefreshing(false);
    }
  }, [fetchData, fetchDaybook, fetchAllVouchers, addToast]);

  // Sync deleted vouchers from Tally
  const triggerSyncDeleted = useCallback(async () => {
    setSyncingDeleted(true);
    try {
      const result = await syncDeletedVouchers();
      if (result.data?.success) {
        const { deleted, checked, tallyCount } = result.data;
        if (deleted > 0) {
          addToast('success', 'Deleted Synced', `Found ${deleted} deleted vouchers (checked ${checked} local vs ${tallyCount} in Tally)`);
          // Refresh data after deletions
          await Promise.all([fetchData(), fetchAllVouchers(), fetchDeletedVouchers()]);
        } else {
          addToast('success', 'No Deletions', `All ${checked} local vouchers still exist in Tally`);
        }
      } else {
        addToast('error', 'Sync Failed', result.data?.error || 'Could not sync deleted vouchers');
      }
    } catch (error) {
      addToast('error', 'Sync Failed', error.message || 'Could not sync deleted vouchers');
    } finally {
      setSyncingDeleted(false);
    }
  }, [fetchData, fetchAllVouchers, fetchDeletedVouchers, addToast]);

  // Initial load
  useEffect(() => {
    fetchData();
    fetchDaybook();
    fetchSacks();
    fetchAllVouchers(); // Load vouchers for dashboard "Recently Altered" panel
    fetchPendingInvoices(); // Load locally saved pending invoices
    fetchAppSettings(); // Load app settings
    checkTallyStatus();
    checkSyncStatus();

    // Socket listeners
    socket.on('bill:new', (bill) => {
      addToast('bill', 'New Bill Created', `${bill.voucherNumber} · ${bill.partyName} · ${formatCurrency(bill.amount)}`);
      fetchData();
    });
    socket.on('payment:created', () => fetchData());
    socket.on('sync:update', () => {
      fetchData();
      fetchDaybook();
    });
    socket.on('dispatch:updated', fetchData);
    socket.on('sack:statusChanged', fetchSacks);

    const statusInterval = setInterval(() => {
      checkTallyStatus();
      checkSyncStatus();
    }, 15000);

    return () => {
      socket.off('bill:new');
      socket.off('payment:created');
      socket.off('sync:update');
      socket.off('dispatch:updated');
      socket.off('sack:statusChanged');
      clearInterval(statusInterval);
    };
  }, []);

  // Fetch daybook when date changes
  useEffect(() => {
    fetchDaybook();
  }, [daybookDate, fetchDaybook]);

  // Fetch RBB when date filters change (only if on RBB page)
  useEffect(() => {
    if (currentPage === 'rbb') {
      fetchRBB();
    }
  }, [rbbDateFrom, rbbDateTo, currentPage, fetchRBB]);

  // Fetch bill history when date changes (only if on bill-history page)
  useEffect(() => {
    if (currentPage === 'bill-history') {
      fetchBillHistory();
    }
  }, [billHistoryDate, currentPage, fetchBillHistory]);

  // Update theme when dark mode changes
  useEffect(() => {
    localStorage.setItem('rushDarkMode', isDarkMode.toString());
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(prev => !prev);
  };

  // Navigate to page
  const goToPage = (page) => {
    setCurrentPage(page);
    setMobileMenuOpen(false);
    if (page === 'sacks') fetchSacks();
    if (page === 'daybook') fetchDaybook();
    if (page === 'vouchers') fetchAllVouchers();
    if (page === 'fonepay') fetchFonepay();
    if (page === 'rbb') { fetchRBB(); fetchRBBStatus(); }
    if (page === 'bill-history') fetchBillHistory();
    if (page === 'create-bill') fetchCreateBillData();
  };

  // Open payment modal
  const openPaymentModal = (bill) => {
    setPaymentModal({ open: true, bill });
    setPaymentModes({ cashTeller1: '', cashTeller2: '', chequeReceipt: '', qrCode: '', discount: '', bankDeposit: '', esewa: '' });
  };

  // Close payment modal
  const closePaymentModal = () => {
    setPaymentModal({ open: false, bill: null });
    setPaymentModes({ cashTeller1: '', cashTeller2: '', chequeReceipt: '', qrCode: '', discount: '', bankDeposit: '', esewa: '' });
  };

  // Open items modal for a pending bill
  const openItemsModal = async (bill) => {
    setItemsModal({ open: true, bill, items: [], loading: true });
    setEditingItems([]);
    setHasItemChanges(false);
    setEditingItemIndex(-1);
    setNewItemForm({ stockItem: '', quantity: 1, rate: '' });
    setItemStockSearch('');
    setItemStockResults([]);

    try {
      // Use preloaded items if available (from includeItems=true in bills fetch)
      if (bill.items && bill.items.length > 0) {
        const items = bill.items;
        setItemsModal(prev => ({ ...prev, items, loading: false }));
        setEditingItems(items.map(item => ({ ...item })));
        return;
      }

      // Fallback: fetch from API
      const response = await getBillItems(bill.id);
      const items = response.data.items || [];
      setItemsModal(prev => ({
        ...prev,
        items: items,
        loading: false
      }));
      // Initialize editing items with current items
      setEditingItems(items.map(item => ({ ...item })));
    } catch (error) {
      console.error('Failed to fetch bill items:', error);
      addToast('Failed to fetch bill items', 'error');
      setItemsModal(prev => ({ ...prev, loading: false }));
    }
  };

  // Close items modal
  const closeItemsModal = () => {
    if (hasItemChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to close?')) {
        return;
      }
    }
    setItemsModal({ open: false, bill: null, items: [], loading: false });
    setEditingItems([]);
    setHasItemChanges(false);
    setEditingItemIndex(-1);
    setNewItemForm({ stockItem: '', quantity: 1, rate: '' });
    setItemStockSearch('');
  };

  // Print a pending bill
  const printBill = async (bill) => {
    try {
      addToast('info', 'Preparing Print', 'Loading bill data...');
      const { data } = await getBillPrintData(bill.id);

      const nepaliDate = toNepaliDate(data.bill.voucherDate);
      const printWindow = window.open('', '_blank', 'width=800,height=600');

      const itemsHTML = data.items.map((item, idx) => `
        <tr>
          <td style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:center">${idx + 1}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #ddd">${item.stockItem}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:center">${item.quantity} ${item.unit}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:right">Rs ${Number(item.rate).toLocaleString('en-IN')}</td>
          <td style="padding:6px 10px;border-bottom:1px solid #ddd;text-align:right">Rs ${Number(item.amount).toLocaleString('en-IN')}</td>
        </tr>
      `).join('');

      const total = data.items.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);
      const totalQty = data.items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

      printWindow.document.write(`<!DOCTYPE html><html><head>
        <title>Bill - ${data.bill.voucherNumber}</title>
        <style>
          *{margin:0;padding:0;box-sizing:border-box}
          body{font-family:'Segoe UI',Arial,sans-serif;padding:20px;color:#333}
          .header{text-align:center;margin-bottom:20px;border-bottom:2px solid #333;padding-bottom:15px}
          .header h1{font-size:22px;margin-bottom:4px}
          .header .addr{font-size:12px;color:#666}
          .header .pan{font-size:11px;color:#888;margin-top:4px}
          .doc-title-wrap{text-align:center}
          .doc-title{font-size:16px;font-weight:700;margin:15px 0;text-transform:uppercase;letter-spacing:1px;border:1px solid #333;display:inline-block;padding:4px 20px}
          .info-row{display:flex;justify-content:space-between;margin-bottom:6px;font-size:13px}
          .info-section{margin-bottom:15px;padding:10px;background:#f9f9f9;border-radius:4px}
          table{width:100%;border-collapse:collapse;margin:15px 0}
          th{background:#333;color:white;padding:8px 10px;font-size:12px;text-transform:uppercase}
          th:first-child{border-radius:4px 0 0 0}th:last-child{border-radius:0 4px 0 0}
          .total-row td{font-weight:700;border-top:2px solid #333;padding:10px}
          .footer{margin-top:40px;display:flex;justify-content:space-between;font-size:12px}
          .footer .sign{border-top:1px solid #999;padding-top:5px;text-align:center;width:150px}
          @media print{body{padding:10px}.no-print{display:none}}
        </style>
      </head><body>
        <div class="header">
          <h1>${data.business.businessName || 'Business'}</h1>
          ${data.business.businessAddress ? `<div class="addr">${data.business.businessAddress}</div>` : ''}
          ${data.business.businessPhone ? `<div class="addr">Phone: ${data.business.businessPhone}</div>` : ''}
          ${data.business.businessPAN ? `<div class="pan">PAN: ${data.business.businessPAN}</div>` : ''}
        </div>
        <div class="doc-title-wrap"><span class="doc-title">${data.bill.voucherType || 'Pending Sales Bill'}</span></div>
        <div class="info-section">
          <div class="info-row"><span><strong>Party:</strong> ${data.bill.partyName}</span><span><strong>Bill No:</strong> ${data.bill.voucherNumber}</span></div>
          <div class="info-row"><span>${data.party?.address ? `<strong>Address:</strong> ${data.party.address}` : ''}</span><span><strong>Date:</strong> ${formatDate(data.bill.voucherDate)}</span></div>
          <div class="info-row"><span>${data.party?.phone ? `<strong>Phone:</strong> ${data.party.phone}` : ''}</span><span style="font-size:12px;color:#555">${nepaliDate}</span></div>
        </div>
        <table>
          <thead><tr>
            <th style="width:40px;text-align:center">#</th>
            <th style="text-align:left">Item</th>
            <th style="width:100px;text-align:center">Qty</th>
            <th style="width:100px;text-align:right">Rate</th>
            <th style="width:120px;text-align:right">Amount</th>
          </tr></thead>
          <tbody>${itemsHTML}</tbody>
          <tfoot><tr class="total-row">
            <td colspan="2" style="text-align:right">Total:</td>
            <td style="text-align:center">${totalQty}</td>
            <td></td>
            <td style="text-align:right">Rs ${total.toLocaleString('en-IN')}</td>
          </tr></tfoot>
        </table>
        ${data.bill.narration ? `<div style="font-size:12px;color:#666;margin:10px 0"><strong>Narration:</strong> ${data.bill.narration}</div>` : ''}
        <div class="footer"><div class="sign">Prepared By</div><div class="sign">Received By</div></div>
        <script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script>
      </body></html>`);
      printWindow.document.close();
    } catch (error) {
      console.error('Print failed:', error);
      addToast('error', 'Print Failed', error.message || 'Could not load bill data');
    }
  };

  // Email handlers
  const handleTestEmailConnection = async () => {
    setEmailTestLoading(true);
    setEmailTestResult(null);
    try {
      const { data } = await testEmailConnection();
      setEmailTestResult(data);
    } catch (error) {
      setEmailTestResult({ success: false, error: error.response?.data?.error || error.message });
    } finally {
      setEmailTestLoading(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailAddress) return;
    setEmailTestLoading(true);
    setEmailTestResult(null);
    try {
      const { data } = await sendTestEmail(testEmailAddress);
      setEmailTestResult(data);
      addToast('success', 'Test Email Sent', `Email sent to ${testEmailAddress}`);
    } catch (error) {
      setEmailTestResult({ success: false, error: error.response?.data?.error || error.message });
      addToast('error', 'Email Failed', error.response?.data?.error || error.message);
    } finally {
      setEmailTestLoading(false);
    }
  };

  const handleEmailBill = async () => {
    if (!emailRecipient || !emailModal.billId) return;
    setEmailModal(prev => ({ ...prev, sending: true }));
    try {
      const { data } = await emailBill(emailModal.billId, emailRecipient);
      if (data.success) {
        addToast('success', 'Email Sent', `Bill emailed to ${emailRecipient}`);
        setEmailModal({ open: false, billId: null, sending: false });
        setEmailRecipient('');
      } else {
        addToast('error', 'Email Failed', data.error);
      }
    } catch (error) {
      addToast('error', 'Email Failed', error.response?.data?.error || error.message);
    } finally {
      setEmailModal(prev => ({ ...prev, sending: false }));
    }
  };

  // Search stock items for add item form
  const searchItemStock = async (query) => {
    setItemStockSearch(query);
    setNewItemForm(prev => ({ ...prev, stockItem: query }));

    if (query.length < 2) {
      setItemStockResults([]);
      setShowItemStockDropdown(false);
      return;
    }

    // Filter from loaded stock items
    const filtered = stockItems.filter(item =>
      item.name?.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 10);

    setItemStockResults(filtered);
    setShowItemStockDropdown(true);
  };

  // Select stock item from dropdown
  const selectItemStock = (item) => {
    setNewItemForm(prev => ({
      ...prev,
      stockItem: item.name,
      rate: item.rate || ''
    }));
    setItemStockSearch(item.name);
    setShowItemStockDropdown(false);
  };

  // Update an item in the editing list
  const updateEditingItem = (index, field, value) => {
    setEditingItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      // Recalculate amount
      if (field === 'quantity' || field === 'rate') {
        const qty = field === 'quantity' ? parseFloat(value) || 0 : parseFloat(updated[index].quantity) || 0;
        const rate = field === 'rate' ? parseFloat(value) || 0 : parseFloat(updated[index].rate) || 0;
        updated[index].amount = qty * rate;
      }
      return updated;
    });
    setHasItemChanges(true);
  };

  // Delete an item from the editing list
  const deleteEditingItem = (index) => {
    if (!window.confirm('Delete this item?')) return;
    setEditingItems(prev => prev.filter((_, i) => i !== index));
    setHasItemChanges(true);
    setEditingItemIndex(-1);
  };

  // Add new item to editing list (local only)
  const addItemToEditingList = () => {
    if (!newItemForm.stockItem || !newItemForm.quantity || !newItemForm.rate) {
      addToast('Please fill in all fields', 'error');
      return;
    }

    const newItem = {
      stockItem: newItemForm.stockItem,
      quantity: parseFloat(newItemForm.quantity),
      rate: parseFloat(newItemForm.rate),
      amount: parseFloat(newItemForm.quantity) * parseFloat(newItemForm.rate)
    };

    setEditingItems(prev => [...prev, newItem]);
    setHasItemChanges(true);
    setNewItemForm({ stockItem: '', quantity: 1, rate: '' });
    setItemStockSearch('');
    addToast('Item added to list. Click "Save All Changes" to sync to Tally.', 'info');
  };

  // Save all item changes to Tally
  const saveAllItemChanges = async () => {
    if (!itemsModal.bill || editingItems.length === 0) {
      addToast('No items to save', 'error');
      return;
    }

    setSavingItems(true);
    try {
      await updateBillItems(itemsModal.bill.id, editingItems);
      addToast('Items saved to Tally!', 'success');

      // Refresh items list
      const response = await getBillItems(itemsModal.bill.id);
      const items = response.data.items || [];
      setItemsModal(prev => ({
        ...prev,
        items: items
      }));
      setEditingItems(items.map(item => ({ ...item })));
      setHasItemChanges(false);

      // Refresh pending bills to update amount
      fetchData();
    } catch (error) {
      console.error('Failed to save items:', error);
      addToast(error.response?.data?.error || 'Failed to save items', 'error');
    } finally {
      setSavingItems(false);
    }
  };

  // Legacy: Add item directly to Tally (kept for backward compatibility)
  const handleAddItem = async () => {
    if (!itemsModal.bill || !newItemForm.stockItem || !newItemForm.quantity || !newItemForm.rate) {
      addToast('Please fill in all fields', 'error');
      return;
    }

    setAddingItem(true);
    try {
      await addBillItem(itemsModal.bill.id, {
        stockItem: newItemForm.stockItem,
        quantity: parseFloat(newItemForm.quantity),
        rate: parseFloat(newItemForm.rate)
      });

      addToast('Item added successfully!', 'success');

      // Refresh items list
      const response = await getBillItems(itemsModal.bill.id);
      const items = response.data.items || [];
      setItemsModal(prev => ({
        ...prev,
        items: items
      }));
      setEditingItems(items.map(item => ({ ...item })));

      // Reset form
      setNewItemForm({ stockItem: '', quantity: 1, rate: '' });
      setItemStockSearch('');

      // Refresh pending bills to update amount
      fetchData();
    } catch (error) {
      console.error('Failed to add item:', error);
      addToast(error.response?.data?.error || 'Failed to add item', 'error');
    } finally {
      setAddingItem(false);
    }
  };

  // Open create bill modal
  const openCreateBillModal = () => {
    setCreateBillModal(true);
    setNewBill({
      partyName: '',
      voucherType: 'Pending Sales Bill',
      date: new Date().toISOString().split('T')[0],
      narration: '',
      agent: '',
      items: [{ name: '', quantity: 1, rate: '', amount: 0 }]
    });
  };

  // Close create bill / reset form after submission
  const closeCreateBillModal = () => {
    // Reset form for new entry
    setNewBill({
      partyName: '',
      voucherType: 'Pending Sales Bill',
      date: new Date().toISOString().split('T')[0],
      narration: '',
      items: [{ name: '', quantity: 1, rate: '', amount: 0 }]
    });
    // Go back to dashboard
    setCurrentPage('dashboard');
  };

  // Add inventory item
  const addBillItem = () => {
    setNewBill(prev => ({
      ...prev,
      items: [...prev.items, { name: '', quantity: 1, rate: '', amount: 0 }]
    }));
  };

  // Remove inventory item
  const removeBillItem = (index) => {
    setNewBill(prev => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
  };

  // Update inventory item
  const updateBillItem = (index, field, value) => {
    setNewBill(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], [field]: value };
      // Auto-calculate amount
      if (field === 'quantity' || field === 'rate') {
        const qty = parseFloat(items[index].quantity) || 0;
        const rate = parseFloat(items[index].rate) || 0;
        items[index].amount = qty * rate;
      }
      return { ...prev, items };
    });
  };

  // Calculate bill total
  const getBillTotal = () => {
    return newBill.items.reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  // Submit new bill to Tally
  const submitNewBill = async () => {
    const total = getBillTotal();
    const validItems = newBill.items.filter(i => i.name && i.amount > 0);

    console.log('[Create Bill] Starting submission...');
    console.log('[Create Bill] Party:', newBill.partyName);
    console.log('[Create Bill] Items:', validItems);
    console.log('[Create Bill] Total:', total);

    if (!newBill.partyName) {
      addToast('error', 'Missing Party', 'Please select a party name');
      return;
    }
    if (validItems.length === 0) {
      addToast('error', 'No Items', 'Add at least one item with quantity and rate');
      return;
    }

    setCreateBillLoading(true);
    try {
      // Format items for Tally API
      const items = validItems.map(item => ({
        stockItem: item.name,
        quantity: parseFloat(item.quantity) || 1,
        rate: parseFloat(item.rate) || 0,
        amount: item.amount || 0
      }));

      const payload = {
        partyName: newBill.partyName,
        items,
        narration: newBill.narration || `Created from Dashboard`,
        voucherType: newBill.voucherType || 'Pending Sales Bill',
        date: newBill.date,
        numPackages: newBill.agent || ''
      };

      console.log('[Create Bill] Sending to API:', payload);

      // Call API to create invoice in Tally
      const response = await createInvoice(payload);

      console.log('[Create Bill] API Response:', response.data);

      const result = response.data;

      if (result.success) {
        if (result.mode === 'online') {
          addToast('success', '✓ Bill Created in Tally', `${newBill.voucherType} for ${newBill.partyName} - ${items.length} items, Rs ${total.toLocaleString('en-IN')}`);
        } else {
          // Saved offline/pending
          addToast('warning', '⏳ Bill Saved Locally', `${result.invoiceNumber} - Will sync when Tally is online`);
          fetchPendingInvoices(); // Refresh pending invoices list
        }
        closeCreateBillModal();
        fetchData();
      } else {
        console.error('[Create Bill] API returned error:', result);
        addToast('error', 'Creation Failed', result.error || 'Unknown error');
      }
    } catch (error) {
      console.error('[Create Bill] Error:', error);
      console.error('[Create Bill] Response data:', error.response?.data);
      addToast('error', 'Creation Failed', error.response?.data?.error || error.message);
    } finally {
      setCreateBillLoading(false);
    }
  };

  // Calculate total payment from SFL fields
  const totalPayment = Object.values(paymentModes).reduce((sum, v) => sum + (parseFloat(v) || 0), 0);

  // Submit payment with SFL fields to Tally
  const submitPayment = async () => {
    if (!paymentModal.bill || totalPayment <= 0) return;

    const bill = paymentModal.bill;
    const masterId = bill.tally_master_id || bill.master_id || bill.id;
    const billAmount = Math.abs(bill.pending_amount || bill.amount);
    const newVoucherType = totalPayment >= billAmount ? 'Sales' : 'Credit Sales';

    setPaymentLoading(true);
    try {
      const response = await fetch(`/api/receipt/pending-sales-bills/${masterId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyName: bill.party_name,
          amount: billAmount,
          date: bill.voucher_date,
          voucherNumber: bill.voucher_number,
          guid: bill.tally_guid,
          paymentModes: {
            cashTeller1: parseFloat(paymentModes.cashTeller1) || 0,
            cashTeller2: parseFloat(paymentModes.cashTeller2) || 0,
            chequeReceipt: parseFloat(paymentModes.chequeReceipt) || 0,
            qrCode: parseFloat(paymentModes.qrCode) || 0,
            discount: parseFloat(paymentModes.discount) || 0,
            bankDeposit: parseFloat(paymentModes.bankDeposit) || 0,
            esewa: parseFloat(paymentModes.esewa) || 0
          }
        })
      });
      const data = await response.json();
      if (response.ok && data.success) {
        addToast('success', 'Payment Completed', `${formatCurrency(totalPayment)} from ${bill.party_name} - Updated to ${newVoucherType}`);
        closePaymentModal();
        fetchData();
      } else {
        addToast('error', 'Payment Failed', data.error || 'Failed to complete payment');
      }
    } catch (error) {
      addToast('error', 'Payment Failed', error.message);
    } finally {
      setPaymentLoading(false);
    }
  };

  // Update dispatch status
  const updateDispatch = async (billId, newStatus) => {
    try {
      await updateBillDispatch(billId, newStatus);
      addToast('success', 'Dispatch Updated', `Status changed to ${newStatus}`);
      fetchData();
    } catch (error) {
      addToast('error', 'Update Failed', error.message);
    }
  };

  // Filter bills (ensure bills is array)
  const billsArray = Array.isArray(bills) ? bills : [];
  const filteredBills = billsArray.filter(bill => {
    if (billFilter === 'all') return true;
    if (billFilter === 'unpaid') return bill.payment_status === 'pending';
    if (billFilter === 'paid') return bill.payment_status === 'paid';
    if (billFilter === 'credit') return bill.voucher_type?.toLowerCase().includes('credit');
    return true;
  }).filter(bill => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return bill.party_name?.toLowerCase().includes(q) ||
           bill.voucher_number?.toLowerCase().includes(q);
  });

  // Group bills by dispatch status for kanban
  const dispatchGroups = {
    pending: billsArray.filter(b => b.dispatch_status === 'pending' || b.dispatch_status === 'created'),
    packing: billsArray.filter(b => b.dispatch_status === 'packing'),
    ready: billsArray.filter(b => b.dispatch_status === 'ready'),
    dispatched: billsArray.filter(b => b.dispatch_status === 'dispatched' || b.dispatch_status === 'customer_taken')
  };

  // Ensure arrays are always arrays
  const pendingBillsArray = Array.isArray(pendingBills) ? pendingBills : [];
  const sacksArray = Array.isArray(sacks) ? sacks : [];
  const daybookArray = Array.isArray(daybook) ? daybook : [];

  // Calculate daybook totals
  const daybookTotals = daybookArray.reduce((acc, entry) => {
    if (entry.voucher_type?.toLowerCase().includes('sales')) {
      acc.debit += Math.abs(entry.amount || 0);
    }
    if (entry.voucher_type?.toLowerCase().includes('receipt')) {
      acc.credit += Math.abs(entry.amount || 0);
    }
    return acc;
  }, { debit: 0, credit: 0 });

  return (
    <div className={`rush-dashboard ${isDarkMode ? 'dark' : 'light'}`} data-mode={isSimpleMode ? 'simple' : 'advanced'}>
      {/* SIDEBAR */}
      <nav className={`sidebar ${mobileMenuOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-icon">R</div>
          <div>
            <h2>Rush Wholesale</h2>
            <span>POS Dashboard</span>
          </div>
        </div>

        <div className="nav">
          <div className="nav-label">Main</div>
          <div className={`nav-item ${currentPage === 'dashboard' ? 'active' : ''}`} onClick={() => goToPage('dashboard')}>
            <span className="nav-icon">📊</span> Dashboard
          </div>
          <div className={`nav-item create-bill-btn ${currentPage === 'create-bill' ? 'active' : ''}`} onClick={() => goToPage('create-bill')} style={{ background: currentPage === 'create-bill' ? 'var(--blue)' : 'var(--blue-g)', color: currentPage === 'create-bill' ? 'white' : 'var(--blue)', fontWeight: '600' }}>
            <span className="nav-icon">➕</span> Create Bill
          </div>
          <div className={`nav-item ${currentPage === 'counter' ? 'active' : ''}`} onClick={() => goToPage('counter')}>
            <span className="nav-icon">🖥️</span> Counter
            {pendingBillsArray.length > 0 && <span className="nav-badge red">{pendingBillsArray.length}</span>}
          </div>
          <div className={`nav-item ${currentPage === 'pending' ? 'active' : ''}`} onClick={() => goToPage('pending')}>
            <span className="nav-icon">⏳</span> Pending Bills
            {pendingBillsArray.length > 0 && <span className="nav-badge amber">{pendingBillsArray.length}</span>}
          </div>
          <div className={`nav-item ${currentPage === 'vouchers' ? 'active' : ''}`} onClick={() => goToPage('vouchers')}>
            <span className="nav-icon">📜</span> Total Vouchers
            {billsArray.length > 0 && <span className="nav-badge blue">{billsArray.length}</span>}
          </div>
          <div className={`nav-item ${currentPage === 'bills' ? 'active' : ''}`} onClick={() => goToPage('bills')}>
            <span className="nav-icon">🧾</span> All Bills
          </div>
          <div className={`nav-item ${currentPage === 'deleted' ? 'active' : ''}`} onClick={() => goToPage('deleted')}>
            <span className="nav-icon">🗑️</span> Deleted Vouchers
            {deletedVouchersCount > 0 && <span className="nav-badge red">{deletedVouchersCount}</span>}
          </div>

          <div className="nav-label">Operations</div>
          <div className={`nav-item ${currentPage === 'dispatch' ? 'active' : ''}`} onClick={() => goToPage('dispatch')}>
            <span className="nav-icon">📦</span> Dispatch
            {dispatchGroups.pending.length > 0 && <span className="nav-badge amber">{dispatchGroups.pending.length}</span>}
          </div>
          <div className={`nav-item ${currentPage === 'sacks' ? 'active' : ''}`} onClick={() => goToPage('sacks')}>
            <span className="nav-icon">🎒</span> Sacks
          </div>

          <div className="nav-label">Accounts</div>
          <div className={`nav-item ${currentPage === 'daybook' ? 'active' : ''}`} onClick={() => goToPage('daybook')}>
            <span className="nav-icon">📒</span> Daybook
          </div>
          <div className={`nav-item ${currentPage === 'parties' ? 'active' : ''}`} onClick={() => goToPage('parties')}>
            <span className="nav-icon">👥</span> Parties
          </div>

          <div className="nav-label">Payments</div>
          <div className={`nav-item ${currentPage === 'fonepay' ? 'active' : ''}`} onClick={() => goToPage('fonepay')}>
            <span className="nav-icon">📱</span> Fonepay
            {fonepayTxns.length > 0 && <span className="nav-badge green">{fonepayTxns.length}</span>}
          </div>
          <div className={`nav-item ${currentPage === 'rbb' ? 'active' : ''}`} onClick={() => goToPage('rbb')}>
            <span className="nav-icon">🏦</span> RBB Banking
            {rbbTxns.length > 0 && <span className="nav-badge cyan">{rbbTxns.length}</span>}
          </div>
          <div className={`nav-item ${currentPage === 'bill-history' ? 'active' : ''}`} onClick={() => goToPage('bill-history')}>
            <span className="nav-icon">📋</span> Dashboard Bills
            {billHistory.length > 0 && <span className="nav-badge orange">{billHistory.length}</span>}
          </div>

          <div className="nav-label adv">System</div>
          <div className={`nav-item adv ${currentPage === 'settings' ? 'active' : ''}`} onClick={() => goToPage('settings')}>
            <span className="nav-icon">⚙️</span> Settings
          </div>
        </div>

        {/* Pending Bills Summary Card */}
        {pendingBillsArray.length > 0 && (
          <div className="sidebar-pending-card" onClick={() => goToPage('pending')}>
            <div className="spc-header">
              <span className="spc-icon">⏳</span>
              <span className="spc-title">Pending Bills</span>
            </div>
            <div className="spc-stats">
              <div className="spc-stat">
                <span className="spc-count">{pendingBillsArray.length}</span>
                <span className="spc-label">Bills</span>
                {pendingBillsCounts.critical > 0 && (
                  <span style={{ fontSize: '10px', color: 'var(--red)', marginLeft: '4px' }}>({pendingBillsCounts.critical} critical)</span>
                )}
              </div>
              <div className="spc-divider"></div>
              <div className="spc-stat">
                <span className="spc-amount">Rs {Math.abs(summary.pendingAmount).toLocaleString('en-IN')}</span>
                <span className="spc-label">Total Due</span>
              </div>
            </div>
            <button className="spc-btn">
              View All →
            </button>
          </div>
        )}

        <div className="sidebar-footer">
          <div className="sync-bar">
            <span className={`sync-dot ${tallyConnected ? '' : 'offline'}`}></span>
            {tallyConnected ? 'Tally Connected' : 'Tally Offline'}
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--t3)' }}>
              {syncRunning ? '⟳' : ''}
            </span>
          </div>
        </div>
      </nav>

      {/* TOPBAR */}
      <header className="topbar">
        <button
          className="top-btn mobile-menu-btn"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={{ display: 'none' }}
        >
          ☰
        </button>

        <div className="page-title">
          {PAGE_TITLES[currentPage]}
          <span className="live"><span className="live-dot"></span>LIVE</span>
        </div>

        <input
          className="search-box"
          placeholder="🔍 Search bills, parties..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <div className="mode-tog">
          <button
            className={isSimpleMode ? 'active' : ''}
            onClick={() => setIsSimpleMode(true)}
          >
            Simple
          </button>
          <button
            className={!isSimpleMode ? 'active' : ''}
            onClick={() => setIsSimpleMode(false)}
          >
            Advanced
          </button>
        </div>

        {/* Theme Toggle */}
        <button
          className="top-btn"
          onClick={toggleDarkMode}
          title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDarkMode ? '☀️' : '🌙'}
        </button>

        {/* Refresh Button */}
        <button
          className="top-btn"
          onClick={triggerManualSync}
          disabled={refreshing}
          title="Sync with Tally"
        >
          {refreshing ? '⟳' : '🔄'}
        </button>

        <div className="top-btn" onClick={() => setNotifPanelOpen(!notifPanelOpen)}>
          🔔
          {notifications.filter(n => !n.read).length > 0 && <span className="notif-dot"></span>}
        </div>

        <div className="avatar">S</div>
      </header>

      {/* TOASTS */}
      <div className="toasts">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast ${toast.type}`}>
            <span className="toast-ic">{toast.type === 'bill' ? '🧾' : toast.type === 'success' ? '✅' : '❌'}</span>
            <div>
              <div className="toast-title">{toast.title}</div>
              <div className="toast-msg">{toast.message}</div>
            </div>
          </div>
        ))}
      </div>

      {/* NOTIFICATION PANEL */}
      <div className={`notif-panel ${notifPanelOpen ? 'open' : ''}`}>
        <div className="np-head">
          <h3>🔔 Notifications</h3>
          <button className="m-close" onClick={() => setNotifPanelOpen(false)}>✕</button>
        </div>
        <div className="np-list">
          {notifications.length === 0 ? (
            <div className="empty-state">No notifications</div>
          ) : notifications.map((notif, i) => (
            <div key={i} className={`np-item ${!notif.read ? 'unread' : ''}`}>
              <div className="np-title">{notif.title}</div>
              <div className="np-msg">{notif.message}</div>
              <div className="np-time">{formatTimeAgo(notif.created_at)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <main className="main-content">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
            <div className="loading-spinner"></div>
          </div>
        ) : (
          <>
            {/* DASHBOARD PAGE */}
            <div className={`page ${currentPage === 'dashboard' ? 'active' : ''}`}>
              <div className="stats">
                <div className="stat blue">
                  <div className="stat-top">
                    <span className="stat-label">Today's Sales</span>
                    <span className="stat-ic blue">🧾</span>
                  </div>
                  <div className="stat-val">{formatCurrency(summary.totalSales)}</div>
                  <div className="stat-sub">{summary.billCount} bills today</div>
                </div>

                <div className="stat green">
                  <div className="stat-top">
                    <span className="stat-label">Received</span>
                    <span className="stat-ic green">💰</span>
                  </div>
                  <div className="stat-val">{formatCurrency(summary.totalReceived)}</div>
                  <div className="stat-sub">
                    {summary.totalSales > 0 ? Math.round((summary.totalReceived / summary.totalSales) * 100) : 0}% collected
                  </div>
                </div>

                <div className="stat red">
                  <div className="stat-top">
                    <span className="stat-label">Unpaid Bills</span>
                    <span className="stat-ic red">⚠️</span>
                  </div>
                  <div className="stat-val">{pendingBillsArray.length}</div>
                  <div className="stat-sub">{formatCurrency(summary.pendingAmount)} outstanding</div>
                </div>

                <div className="stat amber">
                  <div className="stat-top">
                    <span className="stat-label">Pending Dispatch</span>
                    <span className="stat-ic amber">📦</span>
                  </div>
                  <div className="stat-val">{dispatchGroups.pending.length}</div>
                  <div className="stat-sub">Awaiting dispatch</div>
                </div>

                <div className="stat purple adv">
                  <div className="stat-top">
                    <span className="stat-label">Credit Outstanding</span>
                    <span className="stat-ic blue">📋</span>
                  </div>
                  <div className="stat-val">{formatCurrency(summary.pendingAmount)}</div>
                  <div className="stat-sub">{pendingBillsArray.length} parties</div>
                </div>

                <div className="stat cyan adv">
                  <div className="stat-top">
                    <span className="stat-label">Sacks In Progress</span>
                    <span className="stat-ic blue">🎒</span>
                  </div>
                  <div className="stat-val">{sacksArray.filter(s => s.status !== 'dispatched').length}</div>
                  <div className="stat-sub">Collecting bags</div>
                </div>
              </div>

              <div className="sec-head">
                <div className="sec-title">
                  Recent Bills <span className="cnt">{bills.length} today</span>
                </div>
                <div className="tabs">
                  {['all', 'unpaid', 'paid', 'credit'].map(filter => (
                    <button
                      key={filter}
                      className={`tab ${billFilter === filter ? 'active' : ''}`}
                      onClick={() => setBillFilter(filter)}
                    >
                      {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bills-grid">
                {filteredBills.slice(0, 12).map(bill => (
                  <BillCard key={bill.id} bill={bill} onPay={() => openPaymentModal(bill)} />
                ))}
              </div>

              {/* Pending Invoices Panel - Locally saved bills waiting to sync */}
              {pendingInvoices.length > 0 && (
                <div style={{ marginTop: '24px' }}>
                  <div className="sec-head">
                    <div className="sec-title" style={{ color: 'var(--orange)' }}>
                      ⏳ Pending Bills (Local) <span className="cnt">{pendingInvoices.length}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        className="btn btn-s"
                        onClick={fetchPendingInvoices}
                        disabled={pendingInvoicesLoading}
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                      >
                        {pendingInvoicesLoading ? '⟳' : '🔄'} Refresh
                      </button>
                      <button
                        className="btn btn-p"
                        onClick={handleSyncPendingInvoices}
                        disabled={syncingPendingInvoices || !tallyConnected}
                        style={{ padding: '6px 12px', fontSize: '12px' }}
                        title={!tallyConnected ? 'Connect Tally first to sync' : 'Sync all pending to Tally'}
                      >
                        {syncingPendingInvoices ? '⟳ Syncing...' : '📤 Sync All to Tally'}
                      </button>
                    </div>
                  </div>

                  <div style={{ background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--orange)', padding: '0', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                      <thead>
                        <tr style={{ background: 'var(--orange)', color: 'white' }}>
                          <th style={{ padding: '12px', textAlign: 'left' }}>Invoice #</th>
                          <th style={{ padding: '12px', textAlign: 'left' }}>Tally Voucher</th>
                          <th style={{ padding: '12px', textAlign: 'left' }}>Date</th>
                          <th style={{ padding: '12px', textAlign: 'left' }}>Party</th>
                          <th style={{ padding: '12px', textAlign: 'left' }}>Type</th>
                          <th style={{ padding: '12px', textAlign: 'center' }}>Items</th>
                          <th style={{ padding: '12px', textAlign: 'right' }}>Amount</th>
                          <th style={{ padding: '12px', textAlign: 'center' }}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendingInvoices.map((inv, i) => (
                          <tr key={inv.id || i} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px', fontWeight: '600', color: 'var(--blue)' }}>{inv.invoice_number}</td>
                            <td style={{ padding: '10px 12px', fontWeight: '600', color: inv.tally_voucher_number ? 'var(--green)' : 'var(--t3)' }}>
                              {inv.tally_voucher_number || (inv.status === 'synced' ? `#${inv.tally_master_id || '-'}` : '-')}
                            </td>
                            <td style={{ padding: '10px 12px', color: 'var(--t2)' }}>{inv.invoice_date ? formatDate(inv.invoice_date.replace(/-/g, '')) : '-'}</td>
                            <td style={{ padding: '10px 12px' }}>{inv.party_name}</td>
                            <td style={{ padding: '10px 12px', color: 'var(--t2)' }}>{inv.voucher_type || 'Sales'}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>{inv.items?.length || 0}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: '600', color: 'var(--green)' }}>Rs {Number(inv.total_amount || 0).toLocaleString('en-IN')}</td>
                            <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                              <span style={{
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '11px',
                                fontWeight: '600',
                                background: inv.status === 'pending' ? 'var(--orange-g)' : inv.status === 'synced' ? 'var(--green-g)' : 'var(--red-g)',
                                color: inv.status === 'pending' ? 'var(--orange)' : inv.status === 'synced' ? 'var(--green)' : 'var(--red)'
                              }}>
                                {inv.status === 'pending' ? '⏳ Pending' : inv.status === 'synced' ? '✓ Synced' : '✗ Failed'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!tallyConnected && (
                    <div style={{ marginTop: '8px', padding: '8px 12px', background: 'var(--red-g)', borderRadius: '6px', color: 'var(--red)', fontSize: '12px' }}>
                      ⚠ Tally is not connected. Start Tally to sync pending bills.
                    </div>
                  )}
                </div>
              )}

              {/* Recently Altered Vouchers Panel - Zoomed 130% */}
              <div style={{ transform: 'scale(1)', transformOrigin: 'top left', fontSize: '130%' }}>
                <div className="sec-head" style={{ marginTop: '24px' }}>
                  <div className="sec-title">
                    🔄 Recently Altered Vouchers <span className="cnt">{allVouchers.length > 0 ? Math.min(allVouchers.length, 15) : 0} shown</span>
                  </div>
                  <button
                    className="btn btn-s"
                    onClick={() => setCurrentPage('vouchers')}
                    style={{ fontSize: '14px', padding: '8px 16px' }}
                  >
                    View All →
                  </button>
                </div>

                <div className="vouchers-table-wrapper" style={{ maxHeight: '500px', overflow: 'auto', background: 'var(--bg2)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <table className="vouchers-table">
                  <thead>
                    <tr>
                      <th
                        className="sortable"
                        onClick={() => setRecentVoucherSort(s => ({ field: 'alter_id', direction: s.field === 'alter_id' && s.direction === 'desc' ? 'asc' : 'desc' }))}
                      >
                        Alt ID {recentVoucherSort.field === 'alter_id' && <span className="sort-arrow">{recentVoucherSort.direction === 'asc' ? '▲' : '▼'}</span>}
                      </th>
                      <th
                        className="sortable"
                        onClick={() => setRecentVoucherSort(s => ({ field: 'id', direction: s.field === 'id' && s.direction === 'desc' ? 'asc' : 'desc' }))}
                      >
                        UID {recentVoucherSort.field === 'id' && <span className="sort-arrow">{recentVoucherSort.direction === 'asc' ? '▲' : '▼'}</span>}
                      </th>
                      <th
                        className="sortable"
                        onClick={() => setRecentVoucherSort(s => ({ field: 'voucher_date', direction: s.field === 'voucher_date' && s.direction === 'desc' ? 'asc' : 'desc' }))}
                      >
                        Date {recentVoucherSort.field === 'voucher_date' && <span className="sort-arrow">{recentVoucherSort.direction === 'asc' ? '▲' : '▼'}</span>}
                      </th>
                      <th>Voucher No.</th>
                      <th
                        className="sortable"
                        onClick={() => setRecentVoucherSort(s => ({ field: 'party_name', direction: s.field === 'party_name' && s.direction === 'asc' ? 'desc' : 'asc' }))}
                      >
                        Ledger Name {recentVoucherSort.field === 'party_name' && <span className="sort-arrow">{recentVoucherSort.direction === 'asc' ? '▲' : '▼'}</span>}
                      </th>
                      <th>Type</th>
                      <th
                        className="sortable r"
                        onClick={() => setRecentVoucherSort(s => ({ field: 'amount', direction: s.field === 'amount' && s.direction === 'desc' ? 'asc' : 'desc' }))}
                      >
                        Amount {recentVoucherSort.field === 'amount' && <span className="sort-arrow">{recentVoucherSort.direction === 'asc' ? '▲' : '▼'}</span>}
                      </th>
                      <th>Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...allVouchers]
                      .sort((a, b) => {
                        const field = recentVoucherSort.field;
                        const dir = recentVoucherSort.direction === 'asc' ? 1 : -1;
                        if (field === 'party_name') {
                          return (a.party_name || '').localeCompare(b.party_name || '') * dir;
                        }
                        if (field === 'voucher_date') {
                          return ((a.voucher_date || '') > (b.voucher_date || '') ? 1 : -1) * dir;
                        }
                        return ((a[field] || 0) - (b[field] || 0)) * dir;
                      })
                      .slice(0, 15)
                      .map((v, idx) => (
                        <tr key={v.id || idx}>
                          <td style={{ fontFamily: 'var(--mono)', fontWeight: '700', color: 'var(--blue)' }}>
                            {v.alter_id || '-'}
                          </td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: 'var(--t2)' }}>
                            {v.id || '-'}
                          </td>
                          <td className="date-cell">
                            {formatDate(v.voucher_date)}
                          </td>
                          <td style={{ fontWeight: '600' }}>
                            {v.voucher_number || v.tally_master_id || `#${v.alter_id}` || '-'}
                          </td>
                          <td className="party-cell" style={{ maxWidth: '180px' }}>
                            {v.party_name || '-'}
                          </td>
                          <td>
                            <span className={`vt-badge ${(v.voucher_type || '').toLowerCase().includes('receipt') ? 'receipt' : (v.voucher_type || '').toLowerCase().includes('payment') ? 'payment' : 'sales'}`}>
                              {v.voucher_type || '-'}
                            </span>
                          </td>
                          <td className="r amt-cell" style={{ color: 'var(--green)' }}>
                            Rs {(v.amount || 0).toLocaleString('en-IN')}
                          </td>
                          <td className="age-cell">
                            <span className={`age-badge ${formatDaysAgo(v.voucher_date) === 'Today' ? 'today' : 'old'}`}>
                              {formatDaysAgo(v.voucher_date)}
                            </span>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {allVouchers.length === 0 && (
                  <div className="empty-state" style={{ padding: '40px 20px' }}>
                    <div style={{ color: 'var(--t3)' }}>No vouchers found. Check the Vouchers page.</div>
                  </div>
                )}
                </div>
              </div>
            </div>

            {/* CREATE BILL PAGE */}
            <div className={`page ${currentPage === 'create-bill' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                  <div className="sec-title" style={{ fontSize: '20px' }}>
                    ➕ Create New Bill
                  </div>
                  <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--t3)' }}>
                    <span style={{ padding: '4px 8px', background: 'var(--bg2)', borderRadius: '4px' }}>↑↓ Navigate</span>
                    <span style={{ padding: '4px 8px', background: 'var(--bg2)', borderRadius: '4px' }}>Enter Select/Add Row</span>
                    <span style={{ padding: '4px 8px', background: 'var(--bg2)', borderRadius: '4px' }}>Tab Quick Select</span>
                    <span style={{ padding: '4px 8px', background: 'var(--bg2)', borderRadius: '4px' }}>Esc Close</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button className="btn btn-o" onClick={() => goToPage('dashboard')}>← Back</button>
                  <button
                    className="btn btn-p"
                    onClick={submitNewBill}
                    disabled={createBillLoading || !newBill.partyName || getBillTotal() <= 0}
                    style={{ padding: '10px 24px', fontSize: '14px' }}
                  >
                    {createBillLoading ? '⟳ Creating...' : '✅ Create Bill'}
                  </button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
                {/* Left: Items */}
                <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--t1)' }}>📦 Inventory Items</h3>
                      <span style={{ fontSize: '11px', color: stockItems.length > 0 ? 'var(--green)' : 'var(--red)' }}>
                        {stockItems.length > 0 ? `${stockItems.length} items synced` : '⚠ No items synced - run Tally sync first'}
                      </span>
                    </div>
                    <button className="btn btn-s" onClick={addBillItem} style={{ padding: '6px 12px', fontSize: '12px' }}>
                      + Add Item
                    </button>
                  </div>

                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg2)', fontSize: '12px', color: 'var(--t2)' }}>
                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600' }}>#</th>
                        <th style={{ padding: '10px', textAlign: 'left', fontWeight: '600' }}>Item Name</th>
                        <th style={{ padding: '10px', textAlign: 'center', fontWeight: '600', width: '100px' }}>Qty</th>
                        <th style={{ padding: '10px', textAlign: 'right', fontWeight: '600', width: '120px' }}>Rate</th>
                        <th style={{ padding: '10px', textAlign: 'right', fontWeight: '600', width: '130px' }}>Amount</th>
                        <th style={{ padding: '10px', width: '50px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {newBill.items.map((item, index) => {
                        // Filter items by name (all words in any order) OR price with scoring
                        const searchTerm = item.name?.trim().toLowerCase() || '';
                        const searchWords = searchTerm.split(/\s+/).filter(w => w.length > 0);
                        const filteredStock = stockItems
                          .map(s => {
                            if (!item.name || searchWords.length === 0) return { ...s, score: 0 };
                            const itemName = s.name?.toLowerCase() || '';
                            const itemPrice = (s.selling_price || 0).toString();
                            const itemCost = (s.standard_cost || 0).toString();
                            let score = 0;
                            let matchCount = 0;
                            // Check each word and score matches
                            for (const word of searchWords) {
                              const nameMatch = itemName.includes(word);
                              const exactPriceMatch = itemPrice === word || itemCost === word;
                              const partialPriceMatch = itemPrice.includes(word) || itemCost.includes(word);
                              if (nameMatch || exactPriceMatch || partialPriceMatch) {
                                matchCount++;
                                if (exactPriceMatch) score += 10; // Exact price match = highest
                                else if (itemName.startsWith(word)) score += 5; // Name starts with word
                                else if (nameMatch) score += 3; // Name contains word
                                else if (partialPriceMatch) score += 2; // Partial price match
                              }
                            }
                            // All words must match
                            if (matchCount < searchWords.length) return { ...s, score: -1 };
                            return { ...s, score };
                          })
                          .filter(s => s.score >= 0)
                          .sort((a, b) => b.score - a.score) // Best matches first
                          .slice(0, 20);

                        return (
                        <tr key={index} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '8px 10px', color: 'var(--t3)', fontSize: '13px' }}>{index + 1}</td>
                          <td style={{ padding: '8px 10px', position: 'relative' }}>
                            <input
                              id={`item-${index}`}
                              type="text"
                              placeholder="Search name or price..."
                              value={item.name}
                              onChange={(e) => {
                                updateBillItem(index, 'name', e.target.value);
                                setActiveItemDropdown(index);
                                setHighlightedStockIndex(0);
                              }}
                              onFocus={() => {
                                setActiveItemDropdown(index);
                                setHighlightedStockIndex(0);
                              }}
                              onBlur={() => setTimeout(() => setActiveItemDropdown(-1), 200)}
                              onKeyDown={(e) => {
                                if (activeItemDropdown !== index || filteredStock.length === 0) return;
                                if (e.key === 'ArrowDown') {
                                  e.preventDefault();
                                  setHighlightedStockIndex(prev => Math.min(prev + 1, filteredStock.length - 1));
                                } else if (e.key === 'ArrowUp') {
                                  e.preventDefault();
                                  setHighlightedStockIndex(prev => Math.max(prev - 1, 0));
                                } else if (e.key === 'Enter' && filteredStock[highlightedStockIndex]) {
                                  e.preventDefault();
                                  const stock = filteredStock[highlightedStockIndex];
                                  updateBillItem(index, 'name', stock.name);
                                  if (stock.selling_price) updateBillItem(index, 'rate', stock.selling_price);
                                  else if (stock.standard_cost) updateBillItem(index, 'rate', stock.standard_cost);
                                  setActiveItemDropdown(-1);
                                  // Auto-focus quantity field
                                  setTimeout(() => document.getElementById(`qty-${index}`)?.focus(), 50);
                                } else if (e.key === 'Escape') {
                                  setActiveItemDropdown(-1);
                                } else if (e.key === 'Tab' && !e.shiftKey && filteredStock.length > 0 && item.name) {
                                  // Tab selects first match if typing
                                  const stock = filteredStock[0];
                                  updateBillItem(index, 'name', stock.name);
                                  if (stock.selling_price) updateBillItem(index, 'rate', stock.selling_price);
                                  else if (stock.standard_cost) updateBillItem(index, 'rate', stock.standard_cost);
                                  setActiveItemDropdown(-1);
                                }
                              }}
                              style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', background: 'var(--bg)' }}
                            />
                            {activeItemDropdown === index && stockItems.length > 0 && (
                              <div style={{ position: 'absolute', top: '100%', left: '10px', right: '10px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', maxHeight: '250px', overflow: 'auto', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                                {filteredStock.length === 0 ? (
                                  <div style={{ padding: '12px', color: 'var(--t3)', fontSize: '13px', textAlign: 'center' }}>No items found</div>
                                ) : filteredStock.map((stock, i) => (
                                  <div
                                    key={i}
                                    onClick={() => {
                                      updateBillItem(index, 'name', stock.name);
                                      if (stock.selling_price) updateBillItem(index, 'rate', stock.selling_price);
                                      else if (stock.standard_cost) updateBillItem(index, 'rate', stock.standard_cost);
                                      setActiveItemDropdown(-1);
                                      setTimeout(() => document.getElementById(`qty-${index}`)?.focus(), 50);
                                    }}
                                    style={{
                                      padding: '10px 12px',
                                      cursor: 'pointer',
                                      borderBottom: '1px solid var(--border)',
                                      fontSize: '13px',
                                      background: i === highlightedStockIndex ? 'var(--bg2)' : 'transparent',
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center'
                                    }}
                                    onMouseEnter={() => setHighlightedStockIndex(i)}
                                  >
                                    <div>
                                      <div style={{ fontWeight: '600' }}>{stock.name}</div>
                                      {stock.closing_balance > 0 && <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Stock: {stock.closing_balance} {stock.base_units || ''}</div>}
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                      {stock.selling_price > 0 && <div style={{ fontWeight: '700', color: 'var(--green)' }}>₹{stock.selling_price.toLocaleString('en-IN')}</div>}
                                      {!stock.selling_price && stock.standard_cost > 0 && <div style={{ fontWeight: '600', color: 'var(--t2)' }}>₹{stock.standard_cost.toLocaleString('en-IN')}</div>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <input
                              id={`qty-${index}`}
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => updateBillItem(index, 'quantity', e.target.value)}
                              onFocus={(e) => e.target.select()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  document.getElementById(`rate-${index}`)?.focus();
                                }
                              }}
                              style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', textAlign: 'center', background: 'var(--bg)' }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            <input
                              id={`rate-${index}`}
                              type="number"
                              placeholder="0.00"
                              value={item.rate}
                              onChange={(e) => updateBillItem(index, 'rate', e.target.value)}
                              onFocus={(e) => e.target.select()}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || (e.key === 'Tab' && !e.shiftKey)) {
                                  e.preventDefault();
                                  const isLastRow = index === newBill.items.length - 1;
                                  if (isLastRow) {
                                    addBillItem();
                                    setTimeout(() => document.getElementById(`item-${index + 1}`)?.focus(), 50);
                                  } else {
                                    document.getElementById(`item-${index + 1}`)?.focus();
                                  }
                                }
                              }}
                              style={{ width: '100%', padding: '8px', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '14px', textAlign: 'right', background: 'var(--bg)' }}
                            />
                          </td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: '600', fontSize: '14px', color: 'var(--green)' }}>
                            Rs {(item.amount || 0).toLocaleString('en-IN')}
                          </td>
                          <td style={{ padding: '8px 10px' }}>
                            {newBill.items.length > 1 && (
                              <button
                                onClick={() => removeBillItem(index)}
                                style={{ background: 'var(--red-g)', color: 'var(--red)', border: 'none', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px' }}
                              >
                                ✕
                              </button>
                            )}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: 'var(--bg2)' }}>
                        <td colSpan="4" style={{ padding: '12px', textAlign: 'right', fontWeight: '700', fontSize: '16px' }}>Total:</td>
                        <td style={{ padding: '12px', textAlign: 'right', fontWeight: '700', fontSize: '18px', color: 'var(--blue)' }}>
                          Rs {getBillTotal().toLocaleString('en-IN')}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Right: Bill Details */}
                <div style={{ background: 'var(--card)', borderRadius: '12px', padding: '20px', border: '1px solid var(--border)', height: 'fit-content' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--t1)', marginBottom: '16px' }}>📋 Bill Details</h3>

                  <div style={{ marginBottom: '16px', position: 'relative' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '13px', color: 'var(--t2)' }}>
                      Party Name *
                      <span style={{ fontSize: '10px', color: partyList.length > 0 ? 'var(--green)' : 'var(--red)', marginLeft: '8px' }}>
                        ({partyList.length > 0 ? `${partyList.length} parties` : 'No parties synced'})
                      </span>
                    </label>
                    {(() => {
                      const filteredParties = partyList.filter(p => !newBill.partyName || p.name?.toLowerCase().includes(newBill.partyName.toLowerCase())).slice(0, 15);
                      return (
                        <>
                          <input
                            type="text"
                            placeholder={partyList.length > 0 ? "Search party/customer... (↑↓ Enter)" : "Sync Tally first to load parties..."}
                            value={newBill.partyName}
                            onChange={(e) => {
                              setNewBill(prev => ({ ...prev, partyName: e.target.value }));
                              setShowPartyDropdown(true);
                              setHighlightedPartyIndex(0);
                            }}
                            onFocus={() => {
                              setShowPartyDropdown(true);
                              setHighlightedPartyIndex(0);
                            }}
                            onBlur={() => setTimeout(() => setShowPartyDropdown(false), 200)}
                            onKeyDown={(e) => {
                              if (!showPartyDropdown || filteredParties.length === 0) return;
                              if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setHighlightedPartyIndex(prev => Math.min(prev + 1, filteredParties.length - 1));
                              } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setHighlightedPartyIndex(prev => Math.max(prev - 1, 0));
                              } else if (e.key === 'Enter' && filteredParties[highlightedPartyIndex]) {
                                e.preventDefault();
                                setNewBill(prev => ({ ...prev, partyName: filteredParties[highlightedPartyIndex].name }));
                                setShowPartyDropdown(false);
                                // Focus first item input
                                setTimeout(() => document.querySelector('input[placeholder="Search name or price..."]')?.focus(), 50);
                              } else if (e.key === 'Escape') {
                                setShowPartyDropdown(false);
                              } else if (e.key === 'Tab' && filteredParties.length > 0 && newBill.partyName) {
                                setNewBill(prev => ({ ...prev, partyName: filteredParties[0].name }));
                                setShowPartyDropdown(false);
                              }
                            }}
                            style={{ width: '100%', padding: '12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)' }}
                          />
                          {showPartyDropdown && partyList.length > 0 && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', maxHeight: '250px', overflow: 'auto', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                              {filteredParties.length === 0 ? (
                                <div style={{ padding: '12px', color: 'var(--t3)', fontSize: '13px', textAlign: 'center' }}>No parties found</div>
                              ) : filteredParties.map((party, i) => (
                                <div
                                  key={i}
                                  onClick={() => {
                                    setNewBill(prev => ({ ...prev, partyName: party.name }));
                                    setShowPartyDropdown(false);
                                    setTimeout(() => document.querySelector('input[placeholder="Search name or price..."]')?.focus(), 50);
                                  }}
                                  style={{
                                    padding: '10px 12px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid var(--border)',
                                    fontSize: '13px',
                                    background: i === highlightedPartyIndex ? 'var(--bg2)' : 'transparent',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center'
                                  }}
                                  onMouseEnter={() => setHighlightedPartyIndex(i)}
                                >
                                  <div style={{ fontWeight: '600' }}>{party.name}</div>
                                  {party.closing_balance !== 0 && (
                                    <div style={{ fontSize: '11px', color: party.closing_balance > 0 ? 'var(--red)' : 'var(--green)', fontWeight: '600' }}>
                                      ₹{Math.abs(party.closing_balance).toLocaleString('en-IN')} {party.closing_balance > 0 ? 'Dr' : 'Cr'}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '13px', color: 'var(--t2)' }}>
                      Voucher Type
                      <span style={{ fontSize: '10px', color: tallyVoucherTypes.length > 0 ? 'var(--green)' : 'var(--orange)', marginLeft: '8px' }}>
                        ({tallyVoucherTypes.length > 0 ? `${tallyVoucherTypes.length} types from Tally` : 'Using defaults'})
                      </span>
                    </label>
                    <select
                      value={newBill.voucherType}
                      onChange={(e) => setNewBill(prev => ({ ...prev, voucherType: e.target.value }))}
                      style={{ width: '100%', padding: '12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)' }}
                    >
                      {tallyVoucherTypes.length > 0 ? (
                        tallyVoucherTypes.map((vt, idx) => (
                          <option key={idx} value={vt.name}>{vt.name}</option>
                        ))
                      ) : (
                        <>
                          <option value="Pending Sales Bill">Pending Sales Bill</option>
                          <option value="Sales">Sales</option>
                          <option value="Purchase">Purchase</option>
                          <option value="Credit Note">Credit Note</option>
                          <option value="Debit Note">Debit Note</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '13px', color: 'var(--t2)' }}>Date</label>
                    <input
                      type="date"
                      value={newBill.date}
                      onChange={(e) => setNewBill(prev => ({ ...prev, date: e.target.value }))}
                      style={{ width: '100%', padding: '12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)' }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px', position: 'relative' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '13px', color: 'var(--t2)' }}>
                      Staff / Agent (Num Packages)
                      <span style={{ fontSize: '10px', color: agentList.length > 0 ? 'var(--green)' : 'var(--orange)', marginLeft: '8px' }}>
                        ({agentList.length > 0 ? `${agentList.length} agents` : 'No agents found'})
                      </span>
                    </label>
                    {(() => {
                      const filteredAgents = agentList.filter(a => !newBill.agent || a.name?.toLowerCase().includes(newBill.agent.toLowerCase())).slice(0, 15);
                      return (
                        <>
                          <input
                            type="text"
                            placeholder={agentList.length > 0 ? "Click to select staff/agent..." : "No agents in Tally Agent Ledger"}
                            value={newBill.agent}
                            onChange={(e) => {
                              setNewBill(prev => ({ ...prev, agent: e.target.value }));
                              setShowAgentDropdown(true);
                            }}
                            onFocus={() => setShowAgentDropdown(true)}
                            onBlur={() => setTimeout(() => setShowAgentDropdown(false), 200)}
                            style={{ width: '100%', padding: '12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)', cursor: 'pointer' }}
                          />
                          {showAgentDropdown && agentList.length > 0 && (
                            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px', maxHeight: '200px', overflow: 'auto', zIndex: 100, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                              {filteredAgents.length === 0 ? (
                                <div style={{ padding: '12px', color: 'var(--t3)', fontSize: '13px', textAlign: 'center' }}>No agents found</div>
                              ) : filteredAgents.map((agent, i) => (
                                <div
                                  key={i}
                                  onClick={() => {
                                    setNewBill(prev => ({ ...prev, agent: agent.name }));
                                    setShowAgentDropdown(false);
                                  }}
                                  style={{
                                    padding: '10px 12px',
                                    cursor: 'pointer',
                                    borderBottom: '1px solid var(--border)',
                                    fontSize: '13px',
                                    fontWeight: '600'
                                  }}
                                  onMouseEnter={(e) => e.target.style.background = 'var(--bg2)'}
                                  onMouseLeave={(e) => e.target.style.background = 'transparent'}
                                >
                                  {agent.name}
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontWeight: '600', fontSize: '13px', color: 'var(--t2)' }}>Narration / Notes</label>
                    <textarea
                      placeholder="Optional notes"
                      value={newBill.narration}
                      onChange={(e) => setNewBill(prev => ({ ...prev, narration: e.target.value }))}
                      rows={3}
                      style={{ width: '100%', padding: '12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)', resize: 'vertical' }}
                    />
                  </div>

                  {/* Summary */}
                  <div style={{ background: 'var(--blue-g)', borderRadius: '8px', padding: '16px', marginTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: 'var(--t2)', fontSize: '13px' }}>Items:</span>
                      <span style={{ fontWeight: '600' }}>{newBill.items.filter(i => i.name).length}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: 'var(--t2)', fontSize: '13px' }}>Total Qty:</span>
                      <span style={{ fontWeight: '600' }}>{newBill.items.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0)}</span>
                    </div>
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', marginTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontWeight: '700', fontSize: '15px' }}>Grand Total:</span>
                      <span style={{ fontWeight: '700', fontSize: '18px', color: 'var(--blue)' }}>Rs {getBillTotal().toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* COUNTER PAGE */}
            <div className={`page ${currentPage === 'counter' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>💳 Counter — Live Bills</div>
                <span className="live" style={{ fontSize: '13px' }}>
                  <span className="live-dot"></span>Real-time from Tally
                </span>
              </div>

              <div className="counter-list">
                {pendingBillsArray.map((bill, index) => (
                  <div key={bill.id} className={`counter-row ${bill.payment_status === 'paid' ? 'paid' : 'unpaid'}`}>
                    <div className="c-num">{String(index + 1).padStart(2, '0')}</div>
                    <div className="c-info">
                      <div className="c-party">{bill.party_name}</div>
                      <div className="c-inv">{bill.voucher_number} · {bill.voucher_type}</div>
                      <div className="c-time">{formatTimeAgo(bill.voucher_date)}</div>
                    </div>
                    <div className="c-amt" style={{ color: bill.payment_status === 'paid' ? 'var(--green)' : 'var(--red)' }}>
                      {formatCurrency(bill.pending_amount || bill.amount)}
                    </div>
                    {bill.payment_status !== 'paid' ? (
                      <button className="c-btn pay" onClick={() => openPaymentModal(bill)}>💰 PAY</button>
                    ) : (
                      <button className="c-btn done">✅ PAID</button>
                    )}
                  </div>
                ))}

                {pendingBillsArray.length === 0 && (
                  <div className="empty-state">No pending bills. All caught up! 🎉</div>
                )}
              </div>
            </div>

            {/* PENDING BILLS PAGE */}
            <div className={`page ${currentPage === 'pending' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>
                  ⏳ Pending Bills
                  <span className="cnt" style={{ marginLeft: '8px' }}>{pendingBillsArray.length} bills</span>
                  {pendingBillsCounts.critical > 0 && (
                    <span className="cnt" style={{ marginLeft: '8px', background: 'var(--red-g)', color: 'var(--red)' }}>{pendingBillsCounts.critical} critical</span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '14px', color: 'var(--t2)' }}>
                    Total: <strong style={{ color: 'var(--red)' }}>{formatCurrency(summary.pendingAmount)}</strong>
                  </span>
                </div>
              </div>

              <div className="pending-list">
                {pendingBillsArray.map((bill, index) => {
                  const isCritical = bill.is_critical === 1 || bill.udf_payment_total > 0;
                  return (
                    <div key={bill.id} className="pending-item" style={isCritical ? { borderLeft: '3px solid var(--red)' } : {}}>
                      <div className="pending-left">
                        <div className="pending-num" style={isCritical ? { background: 'var(--red-g)', color: 'var(--red)' } : {}}>{String(index + 1).padStart(2, '0')}</div>
                        <div className="pending-info">
                          <div className="pending-party">
                            {bill.party_name}
                            {bill.party_address && <span className="pending-addr">, {bill.party_address}</span>}
                            {isCritical && (
                              <span style={{ marginLeft: '8px', fontSize: '10px', background: 'var(--red)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>CRITICAL</span>
                            )}
                          </div>
                          <div className="pending-meta">
                            <span className="pending-inv">{bill.voucher_number}</span>
                            <span className="pending-dot">•</span>
                            <span className="pending-date">{formatDate(bill.voucher_date)}</span>
                            <span className="pending-dot">•</span>
                            <span className="pending-bs">{toNepaliDate(bill.voucher_date)}</span>
                            {bill.udf_payment_total > 0 && (
                              <>
                                <span className="pending-dot">•</span>
                                <span style={{ color: 'var(--amber)', fontSize: '11px' }}>UDF: {formatCurrency(bill.udf_payment_total)}</span>
                              </>
                            )}
                          </div>
                          <div className="pending-ago">{formatDaysAgo(bill.voucher_date)}</div>
                        </div>
                      </div>
                      <div className="pending-right">
                        <div className="pending-amt">Rs {Math.abs(bill.pending_amount || bill.amount).toLocaleString('en-IN')}</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          <button
                            className="pending-pay-btn"
                            style={{ background: 'var(--blue-g)', color: 'var(--blue)' }}
                            onClick={() => openItemsModal(bill)}
                          >
                            📦 Items
                          </button>
                          <button
                            className="pending-pay-btn"
                            style={{ background: 'var(--cyan-g, rgba(0,188,212,0.1))', color: 'var(--cyan, #00bcd4)' }}
                            onClick={() => printBill(bill)}
                          >
                            🖨 Print
                          </button>
                          <button
                            className="pending-pay-btn"
                            style={{ background: 'var(--purple-g, rgba(156,39,176,0.1))', color: 'var(--purple, #9c27b0)' }}
                            onClick={() => {
                              setEmailRecipient('');
                              setEmailModal({ open: true, billId: bill.id, sending: false });
                            }}
                          >
                            📧 Email
                          </button>
                          <button className="pending-pay-btn" onClick={() => openPaymentModal(bill)}>
                            💰 Pay
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {pendingBillsArray.length === 0 && (
                  <div className="empty-state" style={{ padding: '60px 20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
                    <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>No Pending Bills!</div>
                    <div style={{ color: 'var(--t3)' }}>All payments are up to date</div>
                  </div>
                )}
              </div>
            </div>

            {/* TOTAL VOUCHERS PAGE */}
            <div className={`page ${currentPage === 'vouchers' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>
                  📜 Total Vouchers
                  <span className="cnt" style={{ marginLeft: '8px' }}>{allVouchers.length} vouchers</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Date Range Filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--card)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--t3)', fontWeight: '600' }}>From:</span>
                    <input
                      type="date"
                      value={voucherDateFrom}
                      onChange={(e) => setVoucherDateFrom(e.target.value)}
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', color: 'var(--t1)' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--t3)', fontWeight: '600', marginLeft: '8px' }}>To:</span>
                    <input
                      type="date"
                      value={voucherDateTo}
                      onChange={(e) => setVoucherDateTo(e.target.value)}
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', color: 'var(--t1)' }}
                    />
                    <button
                      onClick={() => { setVoucherDateFrom(getTodayISO()); setVoucherDateTo(getTodayISO()); }}
                      style={{ background: 'var(--blue-g)', color: 'var(--blue)', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => { setVoucherDateFrom(''); setVoucherDateTo(''); }}
                      style={{ background: 'var(--bg)', color: 'var(--t2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', cursor: 'pointer' }}
                    >
                      All
                    </button>
                  </div>
                  <input
                    className="search-box"
                    placeholder="Search vouchers..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ width: '180px' }}
                  />
                  <button className="btn btn-p" onClick={fetchAllVouchers} disabled={vouchersLoading} style={{ padding: '6px 12px', fontSize: '12px' }}>
                    {vouchersLoading ? '⟳ Loading...' : '🔄 Refresh'}
                  </button>
                  <button className="btn btn-o" style={{ padding: '6px 12px', fontSize: '12px' }}>Export CSV</button>
                </div>
              </div>

              {/* Voucher Type Summary */}
              {voucherTypes.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                  {voucherTypes.map((vt, i) => (
                    <div key={i} className={`vt-badge ${
                      vt.voucher_type?.toLowerCase().includes('sales') ? 'sales' :
                      vt.voucher_type?.toLowerCase().includes('receipt') ? 'receipt' :
                      vt.voucher_type?.toLowerCase().includes('payment') ? 'payment' :
                      vt.voucher_type?.toLowerCase().includes('purchase') ? 'payment' :
                      vt.voucher_type?.toLowerCase().includes('journal') ? 'journal' : 'journal'
                    }`} style={{ cursor: 'pointer', padding: '6px 12px' }}>
                      {vt.voucher_type}: {vt.count}
                    </div>
                  ))}
                </div>
              )}

              {vouchersLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                  <div className="loading-spinner"></div>
                  <span style={{ marginLeft: '12px', color: 'var(--t2)' }}>Loading all vouchers...</span>
                </div>
              ) : (
              <div className="vouchers-table-wrapper">
                <table className="vouchers-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th
                        className="sortable"
                        onClick={() => setVoucherSort(s => ({ field: 'id', direction: s.field === 'id' && s.direction === 'asc' ? 'desc' : 'asc' }))}
                      >
                        UID {voucherSort.field === 'id' && <span className="sort-arrow">{voucherSort.direction === 'asc' ? '▲' : '▼'}</span>}
                      </th>
                      <th
                        className="sortable"
                        onClick={() => setVoucherSort(s => ({ field: 'alter_id', direction: s.field === 'alter_id' && s.direction === 'asc' ? 'desc' : 'asc' }))}
                      >
                        Alt ID {voucherSort.field === 'alter_id' && <span className="sort-arrow">{voucherSort.direction === 'asc' ? '▲' : '▼'}</span>}
                      </th>
                      <th>GUID</th>
                      <th
                        className="sortable"
                        onClick={() => setVoucherSort(s => ({ field: 'voucher_type', direction: s.field === 'voucher_type' && s.direction === 'asc' ? 'desc' : 'asc' }))}
                      >
                        Voucher Type {voucherSort.field === 'voucher_type' && <span className="sort-arrow">{voucherSort.direction === 'asc' ? '▲' : '▼'}</span>}
                      </th>
                      <th
                        className="sortable"
                        onClick={() => setVoucherSort(s => ({ field: 'party_name', direction: s.field === 'party_name' && s.direction === 'asc' ? 'desc' : 'asc' }))}
                      >
                        Party Name {voucherSort.field === 'party_name' && <span className="sort-arrow">{voucherSort.direction === 'asc' ? '▲' : '▼'}</span>}
                      </th>
                      <th
                        className="r sortable"
                        onClick={() => setVoucherSort(s => ({ field: 'amount', direction: s.field === 'amount' && s.direction === 'asc' ? 'desc' : 'asc' }))}
                      >
                        Amount {voucherSort.field === 'amount' && <span className="sort-arrow">{voucherSort.direction === 'asc' ? '▲' : '▼'}</span>}
                      </th>
                      <th
                        className="sortable"
                        onClick={() => setVoucherSort(s => ({ field: 'voucher_date', direction: s.field === 'voucher_date' && s.direction === 'asc' ? 'desc' : 'asc' }))}
                      >
                        English Date {voucherSort.field === 'voucher_date' && <span className="sort-arrow">{voucherSort.direction === 'asc' ? '▲' : '▼'}</span>}
                      </th>
                      <th>Nepali Date</th>
                      <th>Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allVouchers
                    .filter(v => {
                      if (!searchQuery) return true;
                      const q = searchQuery.toLowerCase();
                      return v.party_name?.toLowerCase().includes(q) ||
                             v.voucher_number?.toLowerCase().includes(q) ||
                             v.voucher_type?.toLowerCase().includes(q);
                    })
                    .sort((a, b) => {
                      const { field, direction } = voucherSort;
                      let aVal = a[field];
                      let bVal = b[field];

                      // Handle null/undefined
                      if (aVal == null) aVal = '';
                      if (bVal == null) bVal = '';

                      // Numeric fields
                      if (field === 'id' || field === 'amount') {
                        aVal = Number(aVal) || 0;
                        bVal = Number(bVal) || 0;
                      } else {
                        aVal = String(aVal).toLowerCase();
                        bVal = String(bVal).toLowerCase();
                      }

                      if (aVal < bVal) return direction === 'asc' ? -1 : 1;
                      if (aVal > bVal) return direction === 'asc' ? 1 : -1;
                      return 0;
                    })
                    .map((voucher, index) => (
                      <tr key={voucher.id || index} className={voucher.payment_status === 'pending' ? 'unpaid-row' : ''}>
                        <td className="idx">{index + 1}</td>
                        <td className="mono">{voucher.id || '-'}</td>
                        <td className="mono">{voucher.alter_id || voucher.voucher_number || '-'}</td>
                        <td className="mono guid">{voucher.tally_guid || voucher.master_id || '-'}</td>
                        <td>
                          <span className={`vt-badge ${
                            voucher.voucher_type?.toLowerCase().includes('sales') ? 'sales' :
                            voucher.voucher_type?.toLowerCase().includes('receipt') ? 'receipt' :
                            voucher.voucher_type?.toLowerCase().includes('payment') ? 'payment' :
                            voucher.voucher_type?.toLowerCase().includes('purchase') ? 'payment' : 'journal'}`}>
                            {voucher.voucher_type || 'Unknown'}
                          </span>
                        </td>
                        <td className="party-cell">{voucher.party_name || '-'}</td>
                        <td className={`r amt-cell ${(voucher.amount || 0) < 0 ? 'credit' : 'debit'}`}>
                          Rs {Math.abs(voucher.amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="date-cell">{formatDate(voucher.voucher_date)}</td>
                        <td className="date-cell nepali">{toNepaliDate(voucher.voucher_date)}</td>
                        <td className="age-cell">
                          <span className={`age-badge ${formatDaysAgo(voucher.voucher_date) === 'Today' ? 'today' :
                            formatDaysAgo(voucher.voucher_date).includes('1 day') ? 'recent' : 'old'}`}>
                            {formatDaysAgo(voucher.voucher_date)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {allVouchers.length === 0 && (
                  <div className="empty-state" style={{ padding: '60px 20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>📜</div>
                    <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>No Vouchers Found</div>
                    <div style={{ color: 'var(--t3)' }}>
                      {searchQuery ? 'Try a different search term' : 'No vouchers synced from Tally yet. Click Refresh to load.'}
                    </div>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* ALL BILLS PAGE */}
            <div className={`page ${currentPage === 'bills' ? 'active' : ''}`}>
              <div className="sec-head">
                <div className="sec-title">🧾 All Bills <span className="cnt">{bills.length}</span></div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-p">+ Create Bill</button>
                  <button className="btn btn-o">Export</button>
                </div>
              </div>

              <div className="bills-grid">
                {filteredBills.map(bill => (
                  <BillCard key={bill.id} bill={bill} onPay={() => openPaymentModal(bill)} />
                ))}
              </div>
            </div>

            {/* DELETED VOUCHERS PAGE */}
            <div className={`page ${currentPage === 'deleted' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>
                  🗑️ Deleted Vouchers
                  <span className="cnt" style={{ marginLeft: '8px' }}>{deletedVouchersCount} vouchers</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <button
                    className="btn btn-p"
                    onClick={fetchDeletedVouchers}
                    disabled={deletedLoading}
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    {deletedLoading ? '⟳ Loading...' : '🔄 Refresh'}
                  </button>
                  <button
                    className="btn btn-o"
                    onClick={triggerSyncDeleted}
                    disabled={syncingDeleted || !tallyConnected}
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                  >
                    {syncingDeleted ? '⟳ Syncing...' : '🔍 Sync Deleted from Tally'}
                  </button>
                </div>
              </div>

              <div style={{
                background: 'var(--card)',
                padding: '12px 16px',
                borderRadius: '8px',
                marginBottom: '16px',
                border: '1px solid var(--border)',
                fontSize: '13px',
                color: 'var(--t2)'
              }}>
                <strong style={{ color: 'var(--amber)' }}>ℹ️ Note:</strong> These vouchers were deleted in Tally and are kept here for reference.
                You can restore them locally (they will reappear on next sync if still in Tally) or permanently delete them from the database.
              </div>

              {deletedLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                  <div className="loading-spinner"></div>
                  <span style={{ marginLeft: '12px', color: 'var(--t2)' }}>Loading deleted vouchers...</span>
                </div>
              ) : deletedVouchers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--t3)' }}>
                  <div style={{ fontSize: '48px', marginBottom: '12px' }}>✓</div>
                  <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px', color: 'var(--green)' }}>No Deleted Vouchers</div>
                  <div style={{ color: 'var(--t3)' }}>All vouchers are in sync with Tally</div>
                </div>
              ) : (
                <div className="vouchers-table-wrapper">
                  <table className="vouchers-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>UID</th>
                        <th>GUID</th>
                        <th>Voucher Type</th>
                        <th>Voucher No</th>
                        <th>Party Name</th>
                        <th className="r">Amount</th>
                        <th>Date</th>
                        <th>Deleted At</th>
                        <th>Reason</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {deletedVouchers.map((v, idx) => (
                        <tr key={v.tally_guid || idx} style={{ opacity: 0.85 }}>
                          <td style={{ color: 'var(--t3)', fontSize: '11px' }}>{idx + 1}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{v.id}</td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--t3)', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {v.tally_guid?.substring(0, 12)}...
                          </td>
                          <td>
                            <span className={`vt-badge ${
                              v.voucher_type?.toLowerCase().includes('sales') ? 'sales' :
                              v.voucher_type?.toLowerCase().includes('receipt') ? 'receipt' :
                              v.voucher_type?.toLowerCase().includes('payment') ? 'payment' : 'journal'
                            }`}>
                              {v.voucher_type}
                            </span>
                          </td>
                          <td style={{ fontWeight: '600' }}>{v.voucher_number}</td>
                          <td>{v.party_name}</td>
                          <td className="r" style={{ fontWeight: '600', color: v.amount < 0 ? 'var(--red)' : 'var(--green)' }}>
                            {formatCurrency(v.amount)}
                          </td>
                          <td style={{ fontSize: '12px' }}>{formatDate(v.voucher_date)}</td>
                          <td style={{ fontSize: '11px', color: 'var(--t3)' }}>
                            {v.deleted_at ? new Date(v.deleted_at).toLocaleString() : '-'}
                          </td>
                          <td style={{ fontSize: '11px', color: 'var(--amber)' }}>{v.delete_reason || '-'}</td>
                          <td>
                            <button
                              className="btn btn-sm"
                              onClick={() => handleRestoreVoucher(v.tally_guid)}
                              disabled={restoringVoucher === v.tally_guid}
                              style={{
                                padding: '4px 8px',
                                fontSize: '11px',
                                background: 'var(--green-g)',
                                color: 'var(--green)',
                                border: '1px solid var(--green)',
                                borderRadius: '4px',
                                cursor: 'pointer'
                              }}
                            >
                              {restoringVoucher === v.tally_guid ? '...' : '↩ Restore'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* DISPATCH PAGE */}
            <div className={`page ${currentPage === 'dispatch' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>📦 Dispatch Board</div>
              </div>

              <div className="kanban">
                <KanbanColumn
                  title="Paid — To Pack"
                  color="amber"
                  items={dispatchGroups.pending.filter(b => b.payment_status === 'paid')}
                  onMove={(id) => updateDispatch(id, 'packing')}
                  moveLabel="→ Move to Packing"
                />
                <KanbanColumn
                  title="Packing"
                  color="orange"
                  items={dispatchGroups.packing}
                  onMove={(id) => updateDispatch(id, 'ready')}
                  moveLabel="→ Mark Ready"
                />
                <KanbanColumn
                  title="Ready"
                  color="cyan"
                  items={dispatchGroups.ready}
                  onMove={(id) => updateDispatch(id, 'dispatched')}
                  moveLabel="✓ Dispatched"
                  moveStyle={{ borderColor: 'var(--green)', color: 'var(--green)' }}
                />
                <KanbanColumn
                  title="Dispatched"
                  color="green"
                  items={dispatchGroups.dispatched}
                  faded
                />
              </div>
            </div>

            {/* SACKS PAGE */}
            <div className={`page ${currentPage === 'sacks' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>🎒 Sack / Bag Consolidation</div>
                <button className="btn btn-p">+ New Sack</button>
              </div>

              <div className="sacks-grid">
                {sacksArray.map(sack => (
                  <SackCard key={sack.id} sack={sack} onUpdateStatus={async (status) => {
                    await updateSackStatus(sack.id, status);
                    fetchSacks();
                  }} />
                ))}

                {sacksArray.length === 0 && (
                  <div className="empty-state">No sacks yet. Create one to consolidate bags.</div>
                )}
              </div>
            </div>

            {/* DAYBOOK PAGE */}
            <div className={`page ${currentPage === 'daybook' ? 'active' : ''}`}>
              <div className="daybook-container">
                <div className="db-head">
                  <div className="sec-title" style={{ marginBottom: 0 }}>📒 Columnar Daybook</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--t2)' }}>Date:</span>
                    <input
                      type="date"
                      value={daybookDate}
                      onChange={(e) => setDaybookDate(e.target.value)}
                    />
                    <button className="btn btn-o" style={{ padding: '5px 10px', fontSize: '11px' }}>Export</button>
                  </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Type</th>
                        <th>Vch No</th>
                        <th>Party</th>
                        <th>Method</th>
                        <th className="r">Debit</th>
                        <th className="r">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daybook.map((entry, index) => (
                        <tr key={entry.id || index}>
                          <td>{index + 1}</td>
                          <td>
                            <span className={`vt ${entry.voucher_type?.toLowerCase().includes('sales') ? 'sales' :
                              entry.voucher_type?.toLowerCase().includes('receipt') ? 'receipt' :
                              entry.voucher_type?.toLowerCase().includes('payment') ? 'payment' : 'journal'}`}>
                              {entry.voucher_type?.split(' ')[0] || 'Entry'}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{entry.voucher_number}</td>
                          <td className="party">{entry.party_name}</td>
                          <td>{entry.payment_method || '—'}</td>
                          <td className={`r ${entry.amount > 0 ? 'dr' : ''}`}>
                            {entry.amount > 0 ? formatCurrency(entry.amount).replace('₹', '') : '—'}
                          </td>
                          <td className={`r ${entry.amount < 0 ? 'cr' : ''}`}>
                            {entry.amount < 0 ? formatCurrency(entry.amount).replace('₹', '') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan="5" style={{ textAlign: 'right', fontSize: '13px' }}>TOTAL</td>
                        <td className="r" style={{ color: 'var(--red)', fontFamily: 'var(--mono)' }}>
                          {formatCurrency(daybookTotals.debit).replace('₹', '')}
                        </td>
                        <td className="r" style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>
                          {formatCurrency(daybookTotals.credit).replace('₹', '')}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                <div className="db-summary">
                  <div className="db-sum-item">
                    <span className="lb">💵 Total Sales</span>
                    <span className="vl" style={{ color: 'var(--blue)' }}>{formatCurrency(daybookTotals.debit)}</span>
                  </div>
                  <div className="db-sum-item">
                    <span className="lb">💰 Total Received</span>
                    <span className="vl" style={{ color: 'var(--green)' }}>{formatCurrency(daybookTotals.credit)}</span>
                  </div>
                  <div className="db-sum-item">
                    <span className="lb">⏳ Outstanding</span>
                    <span className="vl" style={{ color: 'var(--red)' }}>{formatCurrency(daybookTotals.debit - daybookTotals.credit)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* PARTIES PAGE */}
            <div className={`page ${currentPage === 'parties' ? 'active' : ''}`}>
              <div className="sec-head">
                <div className="sec-title" style={{ fontSize: '18px' }}>👥 Parties</div>
              </div>
              <div className="empty-state">
                Party ledger with outstanding balances — coming soon.
              </div>
            </div>

            {/* FONEPAY PAGE */}
            <div className={`page ${currentPage === 'fonepay' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>
                  📱 Fonepay Transactions
                  <span className="cnt" style={{ marginLeft: '8px' }}>{fonepayTxns.length} transactions</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Date Range Filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--card)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--t3)', fontWeight: '600' }}>From:</span>
                    <input
                      type="date"
                      value={fonepayDateFrom}
                      onChange={(e) => setFonepayDateFrom(e.target.value)}
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', color: 'var(--t1)' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--t3)', fontWeight: '600', marginLeft: '8px' }}>To:</span>
                    <input
                      type="date"
                      value={fonepayDateTo}
                      onChange={(e) => setFonepayDateTo(e.target.value)}
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', color: 'var(--t1)' }}
                    />
                    <button
                      onClick={() => { setFonepayDateFrom(getTodayISO()); setFonepayDateTo(getTodayISO()); }}
                      style={{ background: 'var(--blue-g)', color: 'var(--blue)', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => { setFonepayDateFrom(''); setFonepayDateTo(''); }}
                      style={{ background: 'var(--bg)', color: 'var(--t2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', cursor: 'pointer' }}
                    >
                      All
                    </button>
                  </div>
                  <input
                    className="search-box"
                    placeholder="Search initiator, amount..."
                    value={fonepaySearch}
                    onChange={(e) => setFonepaySearch(e.target.value)}
                    style={{ width: '180px' }}
                  />
                  <div style={{ background: 'var(--green-g)', color: 'var(--green)', padding: '6px 14px', borderRadius: '8px', fontFamily: 'var(--mono)', fontWeight: '700' }}>
                    Total: Rs {(fonepaySummary.total || 0).toLocaleString('en-IN')}
                  </div>
                  <button className="btn btn-p" onClick={fetchFonepay} disabled={fonepayLoading} style={{ padding: '6px 12px', fontSize: '12px' }}>
                    {fonepayLoading ? '⟳ Loading...' : '🔄 Refresh'}
                  </button>
                </div>
              </div>

              {fonepayLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                  <div className="loading-spinner"></div>
                  <span style={{ marginLeft: '12px', color: 'var(--t2)' }}>Loading Fonepay transactions...</span>
                </div>
              ) : (
              <div className="vouchers-table-wrapper">
                <table className="vouchers-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Date & Time</th>
                      <th>Initiator (Number)</th>
                      <th className="r">Amount</th>
                      <th>Transaction ID</th>
                      <th>Nepali Date</th>
                      <th>Status</th>
                      <th>Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fonepayTxns.filter(t => {
                      if (!fonepaySearch) return true;
                      const q = fonepaySearch.toLowerCase();
                      // Parse raw_data for initiator if available
                      let initiator = '';
                      try {
                        if (t.raw_data) {
                          const raw = JSON.parse(t.raw_data);
                          initiator = raw.initiator || '';
                        }
                      } catch (e) {}
                      // Search by initiator (number), amount, and transaction ID
                      const amountStr = String(t.amount || '');
                      return t.transaction_id?.toLowerCase().includes(q) ||
                             initiator?.includes(q) ||
                             amountStr.includes(q) ||
                             t.description?.toLowerCase().includes(q);
                    }).map((txn, index) => {
                      // Parse raw_data for initiator and issuer
                      let initiator = '-', issuerName = '';
                      try {
                        if (txn.raw_data) {
                          const raw = JSON.parse(txn.raw_data);
                          initiator = raw.initiator || '-';
                          issuerName = raw.issuerName || '';
                        }
                      } catch (e) {}
                      // Format date with time
                      const dateTime = txn.transaction_date || '';
                      return (
                      <tr key={txn.id || index}>
                        <td className="idx">{index + 1}</td>
                        <td className="date-cell" style={{ whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: '600' }}>{formatDate(dateTime)}</div>
                          <div style={{ fontSize: '10px', color: 'var(--t3)' }}>{dateTime.split(' ')[1] || ''}</div>
                        </td>
                        <td className="party-cell">
                          <div style={{ fontWeight: '600', fontFamily: 'var(--mono)' }}>{initiator}</div>
                          {issuerName && <div style={{ color: 'var(--t3)', fontSize: '10px' }}>{issuerName}</div>}
                        </td>
                        <td className="r amt-cell" style={{ color: 'var(--green)', fontSize: '14px' }}>
                          + Rs {Math.abs(txn.amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td className="mono" style={{ fontSize: '10px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{txn.transaction_id || '-'}</td>
                        <td className="date-cell nepali">{toNepaliDate(dateTime)}</td>
                        <td>
                          <span className={`vt-badge receipt`}>
                            {txn.status === 'success' ? 'Deposited' : txn.status || 'Pending'}
                          </span>
                        </td>
                        <td className="age-cell">
                          <span className={`age-badge ${formatDaysAgo(dateTime) === 'Today' ? 'today' : 'old'}`}>
                            {formatDaysAgo(dateTime)}
                          </span>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>

                {fonepayTxns.length === 0 && (
                  <div className="empty-state" style={{ padding: '60px 20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>📱</div>
                    <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>No Fonepay Transactions</div>
                    <div style={{ color: 'var(--t3)' }}>Click Refresh to load transactions from Fonepay</div>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* RBB BANKING PAGE */}
            <div className={`page ${currentPage === 'rbb' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>
                  🏦 RBB Banking Transactions
                  <span className="cnt" style={{ marginLeft: '8px' }}>{rbbTxns.length} transactions</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Date Range Filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--card)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--t3)', fontWeight: '600' }}>From:</span>
                    <input
                      type="date"
                      value={rbbDateFrom}
                      onChange={(e) => setRbbDateFrom(e.target.value)}
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', color: 'var(--t1)' }}
                    />
                    <span style={{ fontSize: '11px', color: 'var(--t3)', fontWeight: '600', marginLeft: '8px' }}>To:</span>
                    <input
                      type="date"
                      value={rbbDateTo}
                      onChange={(e) => setRbbDateTo(e.target.value)}
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', color: 'var(--t1)' }}
                    />
                    <button
                      onClick={() => { setRbbDateFrom(getTodayISO()); setRbbDateTo(getTodayISO()); }}
                      style={{ background: 'var(--blue-g)', color: 'var(--blue)', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => { setRbbDateFrom(''); setRbbDateTo(''); }}
                      style={{ background: 'var(--bg)', color: 'var(--t2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', cursor: 'pointer' }}
                    >
                      All
                    </button>
                  </div>
                  <input
                    className="search-box"
                    placeholder="Search ref, amount..."
                    value={rbbSearch}
                    onChange={(e) => setRbbSearch(e.target.value)}
                    style={{ width: '160px' }}
                  />
                  <div style={{ background: 'var(--cyan-g)', color: 'var(--cyan)', padding: '6px 14px', borderRadius: '8px', fontFamily: 'var(--mono)', fontWeight: '700' }}>
                    Balance: Rs {(rbbSummary.total || 0).toLocaleString('en-IN')}
                  </div>
                  {/* Service Status & Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--card)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <span style={{
                      width: '8px', height: '8px', borderRadius: '50%',
                      background: rbbServiceStatus.isRunning ? 'var(--green)' : 'var(--red)',
                      boxShadow: rbbServiceStatus.isRunning ? '0 0 6px var(--green)' : 'none'
                    }}></span>
                    <span style={{ fontSize: '11px', color: 'var(--t2)', fontWeight: '600' }}>
                      {rbbServiceStatus.isRunning ? 'Running' : 'Stopped'}
                    </span>
                    {rbbServiceStatus.lastSyncTime && (
                      <span style={{ fontSize: '10px', color: 'var(--t3)' }}>
                        Last: {formatTimeAgo(rbbServiceStatus.lastSyncTime)}
                      </span>
                    )}
                  </div>
                  {rbbServiceStatus.isRunning ? (
                    <button
                      className="btn"
                      onClick={handleStopRBBService}
                      disabled={rbbServiceLoading}
                      style={{ padding: '6px 12px', fontSize: '12px', background: 'var(--red-g)', color: 'var(--red)', border: 'none' }}
                    >
                      {rbbServiceLoading ? '...' : '⏹ Stop'}
                    </button>
                  ) : (
                    <button
                      className="btn"
                      onClick={handleStartRBBService}
                      disabled={rbbServiceLoading}
                      style={{ padding: '6px 12px', fontSize: '12px', background: 'var(--green-g)', color: 'var(--green)', border: 'none' }}
                    >
                      {rbbServiceLoading ? '...' : '▶ Start'}
                    </button>
                  )}
                  <button
                    className="btn"
                    onClick={handleTriggerRBBSync}
                    disabled={rbbLoading || !rbbServiceStatus.isRunning}
                    title={!rbbServiceStatus.isRunning ? 'Start service first' : 'Sync from bank now'}
                    style={{ padding: '6px 12px', fontSize: '12px', background: 'var(--blue-g)', color: 'var(--blue)', border: 'none', opacity: !rbbServiceStatus.isRunning ? 0.5 : 1 }}
                  >
                    {rbbLoading ? '⟳...' : '📥 Sync'}
                  </button>
                  <button className="btn btn-p" onClick={fetchRBB} disabled={rbbLoading} style={{ padding: '6px 12px', fontSize: '12px' }}>
                    {rbbLoading ? '⟳ Loading...' : '🔄 Refresh'}
                  </button>
                </div>
              </div>

              {rbbLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                  <div className="loading-spinner"></div>
                  <span style={{ marginLeft: '12px', color: 'var(--t2)' }}>Loading RBB transactions...</span>
                </div>
              ) : (
              <div className="vouchers-table-wrapper">
                <table className="vouchers-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Date</th>
                      <th>Description</th>
                      <th className="r" style={{ color: 'var(--red)' }}>Debit (DR)</th>
                      <th className="r" style={{ color: 'var(--green)' }}>Credit (CR)</th>
                      <th className="r">Balance</th>
                      <th>Reference</th>
                      <th>Nepali Date</th>
                      <th>Age</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Filter first, then calculate debit/credit based on balance change
                      const filtered = rbbTxns.filter(t => {
                        if (!rbbSearch) return true;
                        const q = rbbSearch.toLowerCase();
                        const amountStr = String(t.credit || t.debit || '');
                        return t.transaction_id?.toLowerCase().includes(q) ||
                               t.description?.toLowerCase().includes(q) ||
                               t.reference_number?.toLowerCase().includes(q) ||
                               amountStr.includes(q);
                      });

                      return filtered.map((txn, index) => {
                        const dateStr = txn.transaction_date || txn.value_date || '';
                        const currentBalance = txn.balance || 0;
                        // Get previous transaction's balance (next in array since sorted DESC by date)
                        const prevBalance = index < filtered.length - 1 ? (filtered[index + 1].balance || 0) : currentBalance;
                        // Calculate the transaction amount from balance difference
                        const balanceDiff = currentBalance - prevBalance;
                        // If balance increased → Credit, if decreased → Debit
                        const isDebit = balanceDiff < 0;
                        const transactionAmount = Math.abs(balanceDiff);

                        return (
                        <tr key={txn.id || index} className={isDebit ? 'unpaid-row' : ''}>
                          <td className="idx">{index + 1}</td>
                          <td className="date-cell" style={{ whiteSpace: 'nowrap' }}>
                            <div style={{ fontWeight: '600' }}>{formatDate(dateStr)}</div>
                            <div style={{ fontSize: '10px', color: 'var(--t3)' }}>{dateStr.split(' ')[1] || ''}</div>
                          </td>
                          <td className="party-cell" style={{ maxWidth: '220px' }}>{txn.description || '-'}</td>
                          <td className="r amt-cell" style={{ color: 'var(--red)', fontSize: '14px' }}>
                            {isDebit && transactionAmount > 0 ? `Rs ${transactionAmount.toLocaleString('en-IN')}` : '-'}
                          </td>
                          <td className="r amt-cell" style={{ color: 'var(--green)', fontSize: '14px' }}>
                            {!isDebit && transactionAmount > 0 ? `Rs ${transactionAmount.toLocaleString('en-IN')}` : '-'}
                          </td>
                          <td className="r" style={{ fontFamily: 'var(--mono)', fontSize: '13px', fontWeight: '600', color: 'var(--t1)' }}>
                            Rs {currentBalance.toLocaleString('en-IN')}
                          </td>
                          <td className="mono" style={{ fontSize: '10px' }}>{txn.reference_number || '-'}</td>
                          <td className="date-cell nepali">{toNepaliDate(dateStr)}</td>
                          <td className="age-cell">
                            <span className={`age-badge ${formatDaysAgo(dateStr) === 'Today' ? 'today' : 'old'}`}>
                              {formatDaysAgo(dateStr)}
                            </span>
                          </td>
                        </tr>
                      );
                      });
                    })()}
                  </tbody>
                </table>

                {rbbTxns.length === 0 && (
                  <div className="empty-state" style={{ padding: '60px 20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏦</div>
                    <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>No RBB Transactions</div>
                    <div style={{ color: 'var(--t3)' }}>Click Refresh to load transactions from RBB Smart Banking</div>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* DASHBOARD BILLS HISTORY PAGE */}
            <div className={`page ${currentPage === 'bill-history' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>
                  📋 Dashboard Bills History
                  <span className="cnt" style={{ marginLeft: '8px' }}>{billHistory.length} bills</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Date Filter */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--card)', padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '11px', color: 'var(--t3)', fontWeight: '600' }}>Date:</span>
                    <input
                      type="date"
                      value={billHistoryDate}
                      onChange={(e) => setBillHistoryDate(e.target.value)}
                      style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', color: 'var(--t1)' }}
                    />
                    <button
                      onClick={() => setBillHistoryDate(getTodayISO())}
                      style={{ background: 'var(--blue-g)', color: 'var(--blue)', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Today
                    </button>
                  </div>
                  {/* Summary Cards */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <div style={{ background: 'var(--green-g)', color: 'var(--green)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                      ✓ Synced: {billSummary.synced_count || 0} (Rs {Number(billSummary.synced_amount || 0).toLocaleString('en-IN')})
                    </div>
                    <div style={{ background: 'var(--orange-g)', color: 'var(--orange)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                      ⏳ Pending: {billSummary.pending_count || 0}
                    </div>
                    <div style={{ background: 'var(--red-g)', color: 'var(--red)', padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: '600' }}>
                      ✗ Failed: {billSummary.failed_count || 0}
                    </div>
                  </div>
                  <button className="btn btn-p" onClick={fetchBillHistory} disabled={billHistoryLoading} style={{ padding: '6px 12px', fontSize: '12px' }}>
                    {billHistoryLoading ? '⟳ Loading...' : '🔄 Refresh'}
                  </button>
                </div>
              </div>

              {billHistoryLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
                  <div className="loading-spinner"></div>
                  <span style={{ marginLeft: '12px', color: 'var(--t2)' }}>Loading bill history...</span>
                </div>
              ) : (
              <div className="vouchers-table-wrapper">
                <table className="vouchers-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Local Invoice</th>
                      <th>Tally #</th>
                      <th>Bill Date</th>
                      <th>Created</th>
                      <th>Synced At</th>
                      <th>Party</th>
                      <th className="r">Items</th>
                      <th className="r">Amount</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billHistory.map((inv, index) => (
                      <tr key={inv.id || index} className={inv.status === 'failed' ? 'unpaid-row' : ''}>
                        <td className="idx">{index + 1}</td>
                        <td style={{ fontWeight: '600', color: 'var(--blue)' }}>{inv.invoice_number}</td>
                        <td style={{ fontWeight: '600', color: inv.tally_master_id ? 'var(--green)' : 'var(--t3)' }}>
                          {inv.tally_master_id ? `#${inv.tally_master_id}` : '-'}
                        </td>
                        <td className="date-cell">
                          <div style={{ fontWeight: '600' }}>{inv.invoice_date ? formatDate(String(inv.invoice_date).replace(/-/g, '')) : '-'}</div>
                          <div style={{ fontSize: '10px', color: 'var(--cyan)' }}>{inv.invoice_date ? toNepaliDate(String(inv.invoice_date).replace(/-/g, '')) : ''}</div>
                        </td>
                        <td className="date-cell" style={{ fontSize: '11px' }}>
                          <div style={{ color: 'var(--t2)' }}>{inv.created_at ? formatDate(inv.created_at.split(' ')[0].replace(/-/g, '')) : '-'}</div>
                          <div style={{ fontSize: '9px', color: 'var(--t3)' }}>{inv.created_at ? inv.created_at.split(' ')[1] : ''}</div>
                        </td>
                        <td className="date-cell" style={{ fontSize: '11px' }}>
                          {inv.synced_at ? (
                            <>
                              <div style={{ color: 'var(--green)', fontWeight: '600' }}>{formatDate(inv.synced_at.split(' ')[0].replace(/-/g, ''))}</div>
                              <div style={{ fontSize: '9px', color: 'var(--t3)' }}>{inv.synced_at.split(' ')[1]}</div>
                            </>
                          ) : (
                            <span style={{ color: 'var(--t3)' }}>-</span>
                          )}
                        </td>
                        <td className="party-cell">{inv.party_name}</td>
                        <td className="r">{inv.items?.length || 0}</td>
                        <td className="r amt-cell" style={{ fontWeight: '600', color: 'var(--green)' }}>
                          Rs {Number(inv.total_amount || 0).toLocaleString('en-IN')}
                        </td>
                        <td>
                          <span style={{
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '600',
                            background: inv.status === 'pending' ? 'var(--orange-g)' : inv.status === 'synced' ? 'var(--green-g)' : 'var(--red-g)',
                            color: inv.status === 'pending' ? 'var(--orange)' : inv.status === 'synced' ? 'var(--green)' : 'var(--red)'
                          }}>
                            {inv.status === 'pending' ? '⏳ Pending' : inv.status === 'synced' ? '✓ Synced' : '✗ Failed'}
                          </span>
                          {inv.sync_error && (
                            <div style={{ fontSize: '10px', color: 'var(--red)', marginTop: '4px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={inv.sync_error}>
                              {inv.sync_error}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {billHistory.length === 0 && (
                  <div className="empty-state" style={{ padding: '60px 20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
                    <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>No Bills for {billHistoryDate}</div>
                    <div style={{ color: 'var(--t3)' }}>Bills created from Dashboard will appear here</div>
                  </div>
                )}
              </div>
              )}

              {/* Daily Summary */}
              <div style={{ marginTop: '20px', padding: '16px', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div style={{ fontWeight: '600', marginBottom: '12px', color: 'var(--t1)' }}>📊 Daily Summary for {billHistoryDate}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                  <div style={{ padding: '12px', background: 'var(--bg)', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--blue)' }}>{billSummary.total_count || 0}</div>
                    <div style={{ fontSize: '12px', color: 'var(--t3)' }}>Total Bills</div>
                  </div>
                  <div style={{ padding: '12px', background: 'var(--bg)', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--green)' }}>{billSummary.synced_count || 0}</div>
                    <div style={{ fontSize: '12px', color: 'var(--t3)' }}>Synced to Tally</div>
                  </div>
                  <div style={{ padding: '12px', background: 'var(--bg)', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--cyan)' }}>Rs {Number(billSummary.total_amount || 0).toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '12px', color: 'var(--t3)' }}>Total Amount</div>
                  </div>
                  <div style={{ padding: '12px', background: 'var(--bg)', borderRadius: '8px', textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--green)' }}>Rs {Number(billSummary.synced_amount || 0).toLocaleString('en-IN')}</div>
                    <div style={{ fontSize: '12px', color: 'var(--t3)' }}>Synced Amount</div>
                  </div>
                </div>
              </div>
            </div>

            {/* SETTINGS PAGE */}
            <div className={`page ${currentPage === 'settings' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>⚙️ Settings</div>
              </div>

              <div className="settings-grid">
                <div className="s-card">
                  <div className="s-card-h">🔗 Tally Connection</div>
                  <div className="s-card-b">
                    <div className="s-row">
                      <div>
                        <div className="s-name">Tally Host</div>
                        <div className="s-desc">192.168.1.251:9900</div>
                      </div>
                      <span style={{ color: tallyConnected ? 'var(--green)' : 'var(--red)', fontSize: '12px', fontWeight: '600' }}>
                        ● {tallyConnected ? 'Connected' : 'Disconnected'}
                      </span>
                    </div>
                    <div className="s-row">
                      <div>
                        <div className="s-name">Auto Sync Service</div>
                        <div className="s-desc">{syncRunning ? 'Running - syncs every 30s' : 'Stopped'}</div>
                      </div>
                      <button
                        className={`btn ${syncRunning ? 'btn-o' : 'btn-p'}`}
                        style={{ padding: '5px 12px', fontSize: '11px' }}
                        onClick={syncRunning ? stopSyncService : startSyncService}
                        disabled={syncLoading}
                      >
                        {syncLoading ? '⟳' : syncRunning ? '⏹ Stop' : '▶ Start'}
                      </button>
                    </div>
                    <div className="s-row">
                      <div>
                        <div className="s-name">Manual Sync</div>
                        <div className="s-desc">Trigger immediate sync with Tally</div>
                      </div>
                      <button
                        className="btn btn-p"
                        style={{ padding: '5px 12px', fontSize: '11px' }}
                        onClick={triggerManualSync}
                        disabled={refreshing}
                      >
                        {refreshing ? '⟳ Syncing...' : '🔄 Sync Now'}
                      </button>
                    </div>
                    <div className="s-row">
                      <div>
                        <div className="s-name">Sync Deleted</div>
                        <div className="s-desc">Remove vouchers deleted in Tally</div>
                      </div>
                      <button
                        className="btn btn-o"
                        style={{ padding: '5px 12px', fontSize: '11px' }}
                        onClick={triggerSyncDeleted}
                        disabled={syncingDeleted || !tallyConnected}
                      >
                        {syncingDeleted ? '⟳ Checking...' : '🗑️ Sync Deleted'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="s-card">
                  <div className="s-card-h">🎨 Appearance</div>
                  <div className="s-card-b">
                    <div className="s-row">
                      <div>
                        <div className="s-name">Theme Mode</div>
                        <div className="s-desc">{isDarkMode ? 'Dark mode active' : 'Light mode active'}</div>
                      </div>
                      <div className="mode-tog">
                        <button
                          className={isDarkMode ? 'active' : ''}
                          onClick={() => setIsDarkMode(true)}
                        >
                          🌙 Dark
                        </button>
                        <button
                          className={!isDarkMode ? 'active' : ''}
                          onClick={() => setIsDarkMode(false)}
                        >
                          ☀️ Light
                        </button>
                      </div>
                    </div>
                    <div className="s-row">
                      <div>
                        <div className="s-name">Legacy UI</div>
                        <div className="s-desc">Switch to old dashboard design</div>
                      </div>
                      <button
                        className="btn btn-o"
                        style={{ padding: '5px 10px', fontSize: '11px' }}
                        onClick={onSwitchToLegacy}
                      >
                        Switch to Legacy
                      </button>
                    </div>
                  </div>
                </div>

                <div className="s-card">
                  <div className="s-card-h">🔔 Notifications</div>
                  <div className="s-card-b">
                    <div className="s-row">
                      <div>
                        <div className="s-name">New Bill Alert</div>
                        <div className="s-desc">Sound + Toast on new bill</div>
                      </div>
                      <div className="toggle on"></div>
                    </div>
                    <div className="s-row">
                      <div>
                        <div className="s-name">Unpaid Warning</div>
                        <div className="s-desc">Alert after 15 min unpaid</div>
                      </div>
                      <div className="toggle on"></div>
                    </div>
                  </div>
                </div>

                <div className="s-card">
                  <div className="s-card-h">👥 Invoice Settings</div>
                  <div className="s-card-b">
                    <div className="s-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <div className="s-name">Agent/Staff Ledger Group</div>
                        <div className="s-desc">Tally ledger group for Num Packages field</div>
                      </div>
                      <input
                        type="text"
                        value={appSettings.agent_ledger_group || 'Agent Agents'}
                        onChange={(e) => setAppSettings(prev => ({ ...prev, agent_ledger_group: e.target.value }))}
                        onBlur={() => handleSaveSettings()}
                        placeholder="Agent Agents"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          fontSize: '14px',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          background: 'var(--bg)',
                          color: 'var(--t1)'
                        }}
                      />
                    </div>
                    <div className="s-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <div className="s-name">Default Sales Ledger</div>
                        <div className="s-desc">Ledger for sales transactions</div>
                      </div>
                      <input
                        type="text"
                        value={appSettings.sales_ledger || '1 Sales A/c'}
                        onChange={(e) => setAppSettings(prev => ({ ...prev, sales_ledger: e.target.value }))}
                        onBlur={() => handleSaveSettings()}
                        placeholder="1 Sales A/c"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          fontSize: '14px',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          background: 'var(--bg)',
                          color: 'var(--t1)'
                        }}
                      />
                    </div>
                    <div className="s-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <div className="s-name">Default Godown</div>
                        <div className="s-desc">Default inventory location</div>
                      </div>
                      <input
                        type="text"
                        value={appSettings.default_godown || 'Main Location'}
                        onChange={(e) => setAppSettings(prev => ({ ...prev, default_godown: e.target.value }))}
                        onBlur={() => handleSaveSettings()}
                        placeholder="Main Location"
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          fontSize: '14px',
                          border: '1px solid var(--border)',
                          borderRadius: '8px',
                          background: 'var(--bg)',
                          color: 'var(--t1)'
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="s-card">
                  <div className="s-card-h">🏢 Business Info (Print/Email)</div>
                  <div className="s-card-b">
                    {[
                      { key: 'business_name', label: 'Business Name', placeholder: 'Your Business Name' },
                      { key: 'business_address', label: 'Address', placeholder: 'City, District' },
                      { key: 'business_phone', label: 'Phone', placeholder: '01-XXXXXXX' },
                      { key: 'business_pan', label: 'PAN/VAT No.', placeholder: '000000000' }
                    ].map(field => (
                      <div key={field.key} className="s-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                        <div className="s-name">{field.label}</div>
                        <input
                          type="text"
                          value={appSettings[field.key] || ''}
                          onChange={(e) => setAppSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                          onBlur={() => handleSaveSettings()}
                          placeholder={field.placeholder}
                          style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)', color: 'var(--t1)' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="s-card">
                  <div className="s-card-h">📧 Email / SMTP Settings</div>
                  <div className="s-card-b">
                    {[
                      { key: 'smtp_host', label: 'SMTP Host', placeholder: 'smtp.gmail.com' },
                      { key: 'smtp_port', label: 'SMTP Port', placeholder: '587' },
                      { key: 'smtp_user', label: 'Username', placeholder: 'you@example.com' },
                      { key: 'smtp_pass', label: 'Password', placeholder: '********', type: 'password' },
                      { key: 'smtp_from_name', label: 'From Name', placeholder: 'Your Business' },
                      { key: 'smtp_from_email', label: 'From Email', placeholder: 'billing@example.com' }
                    ].map(field => (
                      <div key={field.key} className="s-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                        <div className="s-name">{field.label}</div>
                        <input
                          type={field.type || 'text'}
                          value={appSettings[field.key] || ''}
                          onChange={(e) => setAppSettings(prev => ({ ...prev, [field.key]: e.target.value }))}
                          onBlur={() => handleSaveSettings()}
                          placeholder={field.placeholder}
                          style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)', color: 'var(--t1)' }}
                        />
                      </div>
                    ))}
                    <div className="s-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--t2)' }}>
                        <input
                          type="checkbox"
                          checked={appSettings.smtp_secure === 'true'}
                          onChange={(e) => {
                            const val = e.target.checked ? 'true' : 'false';
                            setAppSettings(prev => ({ ...prev, smtp_secure: val }));
                            setTimeout(() => handleSaveSettings(), 100);
                          }}
                        />
                        Use SSL/TLS (port 465)
                      </label>
                    </div>
                    <div className="s-row" style={{ flexDirection: 'column', gap: '8px' }}>
                      <button
                        onClick={handleTestEmailConnection}
                        disabled={emailTestLoading}
                        style={{
                          width: '100%', padding: '10px', background: emailTestLoading ? 'var(--bg4)' : 'var(--blue)',
                          color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: emailTestLoading ? 'not-allowed' : 'pointer'
                        }}
                      >
                        {emailTestLoading ? '⟳ Testing...' : '🔌 Test SMTP Connection'}
                      </button>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <input
                          type="email"
                          value={testEmailAddress}
                          onChange={(e) => setTestEmailAddress(e.target.value)}
                          placeholder="test@example.com"
                          style={{ flex: 1, padding: '10px 12px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)', color: 'var(--t1)' }}
                        />
                        <button
                          onClick={handleSendTestEmail}
                          disabled={emailTestLoading || !testEmailAddress}
                          style={{
                            padding: '10px 16px', background: emailTestLoading || !testEmailAddress ? 'var(--bg4)' : 'var(--green)',
                            color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: emailTestLoading || !testEmailAddress ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap'
                          }}
                        >
                          📨 Send Test
                        </button>
                      </div>
                      {emailTestResult && (
                        <div style={{
                          padding: '10px', borderRadius: '8px', fontSize: '12px',
                          background: emailTestResult.success ? 'var(--green-g, rgba(76,175,80,0.1))' : 'var(--red-g, rgba(244,67,54,0.1))',
                          color: emailTestResult.success ? 'var(--green)' : 'var(--red)'
                        }}>
                          {emailTestResult.success ? (emailTestResult.message || 'Success!') : emailTestResult.error}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="s-card">
                  <div className="s-card-h">📊 Dashboard Info</div>
                  <div className="s-card-b">
                    <div className="s-row">
                      <div>
                        <div className="s-name">Total Bills Today</div>
                        <div className="s-desc">Synced from Tally</div>
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '14px', fontWeight: '700' }}>
                        {summary.billCount}
                      </span>
                    </div>
                    <div className="s-row">
                      <div>
                        <div className="s-name">Today's Sales</div>
                        <div className="s-desc">Total amount</div>
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '14px', fontWeight: '700', color: 'var(--blue)' }}>
                        {formatCurrency(summary.totalSales)}
                      </span>
                    </div>
                    <div className="s-row">
                      <div>
                        <div className="s-name">Pending Amount</div>
                        <div className="s-desc">Outstanding balance</div>
                      </div>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: '14px', fontWeight: '700', color: 'var(--red)' }}>
                        {formatCurrency(summary.pendingAmount)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* PAYMENT MODAL */}
      <div className={`overlay ${paymentModal.open ? 'open' : ''}`} onClick={closePaymentModal}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <div className="m-head">
            <h3>💰 Record Payment</h3>
            <button className="m-close" onClick={closePaymentModal}>✕</button>
          </div>

          {paymentModal.bill && (() => {
            const billAmt = Math.abs(paymentModal.bill.pending_amount || paymentModal.bill.amount);
            const isFullPay = totalPayment >= billAmt;
            const balanceAfter = Math.max(0, billAmt - totalPayment);
            return (
            <>
              <div className="m-body">
                <div className="m-bill">
                  <div>
                    <div className="party">{paymentModal.bill.party_name}</div>
                    <div className="inv">{paymentModal.bill.voucher_number} · {paymentModal.bill.voucher_type}</div>
                  </div>
                  <div className="total">{formatCurrency(billAmt)}</div>
                </div>

                {/* Quick Actions */}
                <div style={{ display: 'flex', gap: '8px', margin: '12px 0' }}>
                  <button
                    className="btn btn-o"
                    style={{ flex: 1, color: 'var(--green)' }}
                    onClick={() => setPaymentModes({ cashTeller1: String(billAmt), cashTeller2: '', chequeReceipt: '', qrCode: '', discount: '', bankDeposit: '', esewa: '' })}
                  >
                    Full Payment
                  </button>
                  <button
                    className="btn btn-o"
                    style={{ flex: 1 }}
                    onClick={() => setPaymentModes({ cashTeller1: '', cashTeller2: '', chequeReceipt: '', qrCode: '', discount: '', bankDeposit: '', esewa: '' })}
                  >
                    Clear All
                  </button>
                </div>

                {/* SFL Payment Fields */}
                <div style={{ fontSize: '13px', fontWeight: '600', color: 'var(--t2)', marginBottom: '8px' }}>Payment Breakdown (SFL Fields)</div>
                {[
                  { key: 'cashTeller1', label: 'Cash Teller 1', icon: '💵', sfl: 'SFL1' },
                  { key: 'cashTeller2', label: 'Cash Teller 2', icon: '💵', sfl: 'SFL2' },
                  { key: 'chequeReceipt', label: 'Cheque Receipt', icon: '📝', sfl: 'SFL3' },
                  { key: 'qrCode', label: 'Q/R Code', icon: '📱', sfl: 'SFL4' },
                  { key: 'discount', label: 'Discount', icon: '🏷', sfl: 'SFL5' },
                  { key: 'bankDeposit', label: 'Bank Deposit', icon: '🏦', sfl: 'SFL6' },
                  { key: 'esewa', label: 'Esewa', icon: '📲', sfl: 'SFL7' }
                ].map(field => (
                  <div key={field.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid var(--bg3, rgba(255,255,255,0.05))' }}>
                    <span style={{ fontSize: '16px', width: '24px', textAlign: 'center' }}>{field.icon}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '12px', color: 'var(--t3)' }}>{field.label} <span style={{ opacity: 0.5 }}>({field.sfl})</span></div>
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={paymentModes[field.key]}
                      onChange={(e) => setPaymentModes(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder="0"
                      style={{
                        width: '120px', padding: '8px 10px', textAlign: 'right',
                        fontFamily: 'var(--mono)', fontSize: '14px', fontWeight: '600',
                        border: '1px solid var(--border)', borderRadius: '6px',
                        background: 'var(--bg)', color: 'var(--t1)'
                      }}
                    />
                  </div>
                ))}

                {/* Summary */}
                <div style={{ margin: '12px 0', padding: '12px', background: 'var(--bg2, rgba(255,255,255,0.03))', borderRadius: '8px', fontSize: '13px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--t3)' }}>Bill Amount:</span>
                    <span style={{ fontWeight: '600' }}>{formatCurrency(billAmt)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ color: 'var(--t3)' }}>Total Payment:</span>
                    <span style={{ fontWeight: '600', color: totalPayment > 0 ? 'var(--green)' : 'var(--t3)' }}>{formatCurrency(totalPayment)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '6px' }}>
                    <span style={{ fontWeight: '700' }}>Balance After:</span>
                    <span style={{ fontWeight: '700', color: balanceAfter > 0 ? 'var(--amber)' : 'var(--green)' }}>{formatCurrency(balanceAfter)}</span>
                  </div>
                </div>

                {/* Voucher Type Preview */}
                {totalPayment > 0 && (
                  <div style={{
                    padding: '10px', borderRadius: '8px', textAlign: 'center', fontSize: '13px', fontWeight: '600',
                    background: isFullPay ? 'var(--green-g, rgba(76,175,80,0.1))' : 'var(--amber-g, rgba(255,152,0,0.1))',
                    color: isFullPay ? 'var(--green)' : 'var(--amber)'
                  }}>
                    Will update to: <strong>{isFullPay ? 'Sales' : 'Credit Sales'}</strong>
                    {isFullPay ? ' (Full Payment)' : ' (Partial Payment)'}
                  </div>
                )}
              </div>

              <div className="m-foot">
                <button className="btn btn-o" onClick={closePaymentModal}>Cancel</button>
                <button
                  className="btn-confirm"
                  onClick={submitPayment}
                  disabled={paymentLoading || totalPayment <= 0}
                  style={{
                    background: paymentLoading || totalPayment <= 0 ? 'var(--bg4)' : isFullPay ? 'var(--green)' : 'var(--amber)',
                    cursor: paymentLoading || totalPayment <= 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  {paymentLoading ? '⟳ Processing...' : `✅ Complete (${formatCurrency(totalPayment)})`}
                </button>
              </div>
            </>
            );
          })()}
        </div>
      </div>

      {/* ITEMS MODAL - View, Add, Edit, Delete Items on Pending Bill */}
      <div className={`overlay ${itemsModal.open ? 'open' : ''}`} onClick={closeItemsModal}>
        <div className="modal" style={{ maxWidth: '800px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
          <div className="m-head">
            <h3>📦 Bill Items {hasItemChanges && <span style={{ color: 'var(--amber)', fontSize: '12px' }}>(unsaved changes)</span>}</h3>
            <button className="m-close" onClick={closeItemsModal}>✕</button>
          </div>

          {itemsModal.bill && (
            <>
              <div className="m-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {/* Bill Info */}
                <div className="m-bill" style={{ marginBottom: '16px' }}>
                  <div>
                    <div className="party">{itemsModal.bill.party_name}</div>
                    <div className="inv">{itemsModal.bill.voucher_number} · {itemsModal.bill.voucher_type}</div>
                  </div>
                  <div className="total">
                    {hasItemChanges ? (
                      <span style={{ color: 'var(--amber)' }}>{formatCurrency(editingItems.reduce((sum, i) => sum + (i.amount || 0), 0))}</span>
                    ) : formatCurrency(itemsModal.bill.amount)}
                  </div>
                </div>

                {/* Editable Items List */}
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontWeight: '600', marginBottom: '12px', color: 'var(--t1)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>Items ({editingItems.length})</span>
                    {hasItemChanges && <span style={{ fontSize: '12px', color: 'var(--amber)' }}>⚠️ Click "Save All Changes" to sync to Tally</span>}
                  </div>

                  {itemsModal.loading ? (
                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--t3)' }}>Loading items...</div>
                  ) : editingItems.length > 0 ? (
                    <div style={{ background: 'var(--bg3)', borderRadius: '8px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg4)', color: 'var(--t2)' }}>
                            <th style={{ padding: '10px 8px', textAlign: 'left', width: '30px' }}>#</th>
                            <th style={{ padding: '10px 8px', textAlign: 'left' }}>Item</th>
                            <th style={{ padding: '10px 8px', textAlign: 'right', width: '80px' }}>Qty</th>
                            <th style={{ padding: '10px 8px', textAlign: 'right', width: '100px' }}>Rate</th>
                            <th style={{ padding: '10px 8px', textAlign: 'right', width: '100px' }}>Amount</th>
                            <th style={{ padding: '10px 8px', textAlign: 'center', width: '80px' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {editingItems.map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid var(--bg4)' }}>
                              <td style={{ padding: '8px', color: 'var(--t3)' }}>{idx + 1}</td>
                              <td style={{ padding: '8px', color: 'var(--t1)' }}>{item.stockItem}</td>
                              <td style={{ padding: '8px' }}>
                                <input
                                  type="number"
                                  min="1"
                                  value={item.quantity}
                                  onChange={(e) => updateEditingItem(idx, 'quantity', e.target.value)}
                                  style={{
                                    width: '60px',
                                    padding: '4px 6px',
                                    border: '1px solid var(--bg4)',
                                    borderRadius: '4px',
                                    background: 'var(--bg2)',
                                    color: 'var(--t1)',
                                    textAlign: 'right'
                                  }}
                                />
                              </td>
                              <td style={{ padding: '8px' }}>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.rate}
                                  onChange={(e) => updateEditingItem(idx, 'rate', e.target.value)}
                                  style={{
                                    width: '80px',
                                    padding: '4px 6px',
                                    border: '1px solid var(--bg4)',
                                    borderRadius: '4px',
                                    background: 'var(--bg2)',
                                    color: 'var(--t1)',
                                    textAlign: 'right'
                                  }}
                                />
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right', color: 'var(--green)', fontWeight: '600' }}>
                                {formatCurrency(item.amount || 0)}
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                <button
                                  onClick={() => deleteEditingItem(idx)}
                                  style={{
                                    padding: '4px 8px',
                                    background: 'var(--red-g)',
                                    color: 'var(--red)',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    fontSize: '12px'
                                  }}
                                  title="Delete item"
                                >
                                  🗑️
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: 'var(--bg4)' }}>
                            <td colSpan="4" style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '600', color: 'var(--t1)' }}>Total:</td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '700', color: 'var(--amber)' }}>
                              {formatCurrency(editingItems.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0))}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ) : (
                    <div style={{ textAlign: 'center', padding: '20px', color: 'var(--t3)', background: 'var(--bg3)', borderRadius: '8px' }}>
                      No items - add items below
                    </div>
                  )}
                </div>

                {/* Add New Item Form */}
                <div style={{ background: 'var(--blue-g)', padding: '16px', borderRadius: '8px', border: '1px solid var(--blue)' }}>
                  <div style={{ fontWeight: '600', marginBottom: '12px', color: 'var(--blue)' }}>
                    ➕ Add New Item
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                    {/* Stock Item Search */}
                    <div className="field" style={{ margin: 0, position: 'relative' }}>
                      <label style={{ fontSize: '11px', color: 'var(--t3)' }}>Stock Item</label>
                      <input
                        type="text"
                        placeholder="Search item..."
                        value={itemStockSearch}
                        onChange={(e) => searchItemStock(e.target.value)}
                        onFocus={() => itemStockResults.length > 0 && setShowItemStockDropdown(true)}
                        style={{ width: '100%' }}
                      />
                      {showItemStockDropdown && itemStockResults.length > 0 && (
                        <div style={{
                          position: 'absolute',
                          top: '100%',
                          left: 0,
                          right: 0,
                          background: 'var(--bg2)',
                          border: '1px solid var(--bg4)',
                          borderRadius: '6px',
                          maxHeight: '200px',
                          overflowY: 'auto',
                          zIndex: 100,
                          boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
                        }}>
                          {itemStockResults.map((item, idx) => (
                            <div
                              key={idx}
                              onClick={() => selectItemStock(item)}
                              style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                borderBottom: '1px solid var(--bg4)',
                                fontSize: '13px'
                              }}
                              onMouseEnter={(e) => e.target.style.background = 'var(--bg3)'}
                              onMouseLeave={(e) => e.target.style.background = 'transparent'}
                            >
                              <div style={{ color: 'var(--t1)' }}>{item.name}</div>
                              {item.rate && <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Rate: {formatCurrency(item.rate)}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Quantity */}
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '11px', color: 'var(--t3)' }}>Qty</label>
                      <input
                        type="number"
                        min="1"
                        value={newItemForm.quantity}
                        onChange={(e) => setNewItemForm(prev => ({ ...prev, quantity: e.target.value }))}
                        style={{ width: '100%' }}
                      />
                    </div>

                    {/* Rate */}
                    <div className="field" style={{ margin: 0 }}>
                      <label style={{ fontSize: '11px', color: 'var(--t3)' }}>Rate</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={newItemForm.rate}
                        onChange={(e) => setNewItemForm(prev => ({ ...prev, rate: e.target.value }))}
                        style={{ width: '100%' }}
                      />
                    </div>

                    {/* Add Button */}
                    <button
                      onClick={addItemToEditingList}
                      disabled={!newItemForm.stockItem || !newItemForm.quantity || !newItemForm.rate}
                      style={{
                        padding: '10px 16px',
                        background: (!newItemForm.stockItem || !newItemForm.quantity || !newItemForm.rate) ? 'var(--bg4)' : 'var(--green)',
                        color: 'white',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: (!newItemForm.stockItem || !newItemForm.quantity || !newItemForm.rate) ? 'not-allowed' : 'pointer',
                        fontWeight: '600',
                        fontSize: '13px'
                      }}
                    >
                      ➕ Add
                    </button>
                  </div>

                  {/* Amount preview */}
                  {newItemForm.quantity && newItemForm.rate && (
                    <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--t2)' }}>
                      Amount: <strong style={{ color: 'var(--green)' }}>{formatCurrency(newItemForm.quantity * newItemForm.rate)}</strong>
                    </div>
                  )}
                </div>
              </div>

              <div className="m-foot" style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn btn-o" onClick={closeItemsModal}>Cancel</button>
                  <button
                    className="btn btn-o"
                    style={{ color: 'var(--cyan, #00bcd4)' }}
                    onClick={() => itemsModal.bill && printBill(itemsModal.bill)}
                    disabled={editingItems.length === 0}
                  >
                    🖨 Print
                  </button>
                  <button
                    className="btn btn-o"
                    style={{ color: 'var(--purple, #9c27b0)' }}
                    onClick={() => {
                      if (!itemsModal.bill) return;
                      setEmailRecipient('');
                      setEmailModal({ open: true, billId: itemsModal.bill.id, sending: false });
                    }}
                    disabled={editingItems.length === 0}
                  >
                    📧 Email
                  </button>
                </div>
                <button
                  onClick={saveAllItemChanges}
                  disabled={savingItems || editingItems.length === 0}
                  style={{
                    padding: '12px 24px',
                    background: (savingItems || editingItems.length === 0) ? 'var(--bg4)' : hasItemChanges ? 'var(--amber)' : 'var(--green)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: (savingItems || editingItems.length === 0) ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '14px'
                  }}
                >
                  {savingItems ? '⟳ Saving...' : '💾 Save All Changes to Tally'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* EMAIL BILL MODAL */}
      <div className={`overlay ${emailModal.open ? 'open' : ''}`} onClick={() => !emailModal.sending && setEmailModal({ open: false, billId: null, sending: false })}>
        <div className="modal" style={{ maxWidth: '400px' }} onClick={(e) => e.stopPropagation()}>
          <div className="m-head">
            <h3>📧 Email Bill</h3>
            <button className="m-close" onClick={() => setEmailModal({ open: false, billId: null, sending: false })}>✕</button>
          </div>
          <div className="m-body" style={{ padding: '20px' }}>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', marginBottom: '6px', color: 'var(--t2)' }}>Recipient Email</label>
              <input
                type="email"
                value={emailRecipient}
                onChange={(e) => setEmailRecipient(e.target.value)}
                placeholder="party@example.com"
                disabled={emailModal.sending}
                style={{
                  width: '100%', padding: '10px 12px', fontSize: '14px',
                  border: '1px solid var(--border)', borderRadius: '8px',
                  background: 'var(--bg)', color: 'var(--t1)'
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleEmailBill()}
              />
            </div>
          </div>
          <div className="m-foot" style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
            <button className="btn btn-o" onClick={() => setEmailModal({ open: false, billId: null, sending: false })}>Cancel</button>
            <button
              onClick={handleEmailBill}
              disabled={emailModal.sending || !emailRecipient}
              style={{
                padding: '10px 20px', background: emailModal.sending || !emailRecipient ? 'var(--bg4)' : 'var(--blue)',
                color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: emailModal.sending || !emailRecipient ? 'not-allowed' : 'pointer'
              }}
            >
              {emailModal.sending ? '⟳ Sending...' : '📨 Send Email'}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

// Bill Card Component
function BillCard({ bill, onPay }) {
  const paymentStatus = bill.payment_status || 'pending';
  const dispatchStatus = bill.dispatch_status || 'pending';

  return (
    <div className={`bill-card ${paymentStatus}`}>
      <div className="bill-top">
        <div>
          <div className="bill-party">{bill.party_name}</div>
          <div className="bill-inv">{bill.voucher_number}</div>
        </div>
        <div>
          <div className="bill-amt">{formatCurrency(bill.amount)}</div>
        </div>
      </div>

      <div className="bill-meta">
        <span>🕐 {formatTimeAgo(bill.voucher_date)}</span>
        <span>📋 {bill.voucher_type}</span>
        {bill.item_count && <span>📦 {bill.item_count} items</span>}
      </div>

      <div className="bill-bot">
        <span className={`badge-s ${paymentStatus}`}>
          ● {paymentStatus.toUpperCase()}
        </span>
        <span className={`badge-d ${dispatchStatus}`}>
          {dispatchStatus.replace('_', ' ')}
        </span>
        <div className="bill-acts">
          {paymentStatus !== 'paid' && (
            <button className="bill-act pay" onClick={onPay}>💰</button>
          )}
          <button className="bill-act">👁️</button>
        </div>
      </div>
    </div>
  );
}

// Kanban Column Component
function KanbanColumn({ title, color, items, onMove, moveLabel, moveStyle, faded }) {
  return (
    <div className="kanban-col">
      <div className="kanban-head">
        <div className="kanban-title">
          <span className={`dot ${color}`}></span>
          {title}
        </div>
        <span className="kanban-cnt">{items.length}</span>
      </div>
      <div className="kanban-body">
        {items.map(item => (
          <div key={item.id} className="k-item" style={faded ? { opacity: 0.55 } : {}}>
            <div className="k-top">
              <span className="k-party">{item.party_name}</span>
              <span className="k-amt">{formatCurrency(item.amount)}</span>
            </div>
            <div className="k-inv">{item.voucher_number} · {item.payment_status}</div>
            {onMove && (
              <button className="k-move" style={moveStyle} onClick={() => onMove(item.id)}>
                {moveLabel}
              </button>
            )}
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ color: 'var(--t3)', fontSize: '11px', textAlign: 'center', padding: '20px' }}>
            No items
          </div>
        )}
      </div>
    </div>
  );
}

// Sack Card Component
function SackCard({ sack, onUpdateStatus }) {
  const statusMap = {
    collecting: 'collecting',
    ready: 'ready',
    dispatched: 'dispatched'
  };

  return (
    <div className="sack">
      <div className="sack-head">
        <div className="sack-party">{sack.party_name || 'Unknown Party'}</div>
        <span className={`sack-st ${statusMap[sack.status] || 'collecting'}`}>
          {sack.status || 'Collecting'}
        </span>
      </div>

      <div className="sack-body">
        <div className="sack-label">Bills</div>
        {sack.items?.map((item, i) => (
          <div key={i} className="sack-bag">
            <div className="src">🏪 {item.voucher_number || item.invoice_number}</div>
            <span className="bag-cnt">{item.bag_count || 1} bag</span>
          </div>
        ))}

        <div className="sack-total">
          <span>Total Bags</span>
          <span style={{ color: 'var(--blue)' }}>
            {(Array.isArray(sack.items) ? sack.items : []).reduce((sum, item) => sum + (item.bag_count || 1), 0) || 0} bags → 1 sack
          </span>
        </div>
      </div>

      <div className="sack-acts">
        {sack.status !== 'dispatched' && (
          <>
            <button className="sack-btn">Add Bag</button>
            <button
              className="sack-btn pri"
              onClick={() => onUpdateStatus(sack.status === 'collecting' ? 'ready' : 'dispatched')}
            >
              {sack.status === 'collecting' ? 'All Collected ✓' : '🚚 Dispatch Sack'}
            </button>
          </>
        )}
        {sack.status === 'dispatched' && (
          <button className="sack-btn" style={{ opacity: 0.5, cursor: 'default' }}>
            Dispatched ✅
          </button>
        )}
      </div>
    </div>
  );
}
