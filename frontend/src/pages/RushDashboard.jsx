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
  updateVoucherAuditStatus,
  bulkUpdateAuditStatus,
  getBillItems,
  addBillItem,
  updateBillItems,
  searchStockItems,
  getBillPrintData,
  testEmailConnection,
  sendTestEmail,
  emailBill,
  getClearedBills,
  getOutstandingBills,
  getAgeingSummary,
  getOutstandingParties,
  getCustomerOutstanding,
  getReceivableSummary,
  syncOutstanding,
  getProfitAndLoss,
  getStockGroupList,
  getStockGroupSummary,
  syncStockGroups,
  getPriceListData,
  getPriceLevels,
  syncPriceLists,
  getInventoryMovement,
  getInventoryMovementSummary,
  getReconMatches,
  getReconSummary,
  getUnmatchedRBB,
  getUnmatchedFonepay,
  autoMatchRecon,
  fetchTallyBankVouchers,
  getVoucherChangeLog,
  getRecentChanges,
  getBalanceSheet,
  getTrialBalance,
  getCashFlow,
  getRatioAnalysis,
  startSyncService as startSyncApi,
  stopSyncService as stopSyncApi,
  triggerSync,
  getTallyXmlVouchers,
  getTallyXmlVoucherDetail,
  getColumnarBills,
  getColumnarDetails,
  getChequeReconciliation,
  updateChequeStatus,
  syncPendingCheques,
  getChequePostReceipts,
  getODBCParties,
  syncChequePost,
  syncAllChequePosts,
  getPostedMasterIds,
  getChequePostLog,
  getChequeSummary,
  getCheques,
  getVoucherLockStatus,
  lockVouchers,
  unlockVouchers,
  setVoucherLockSchedule,
  toggleVoucherLock,
  getCompanies,
  getODBCCheques,
  syncODBCVouchers,
  getCollectionStaff,
  createCollectionStaff,
  updateCollectionStaff,
  deleteCollectionStaff,
  getCollectionBatches,
  createCollectionBatch,
  getCollectionBatch,
  getBatchPrintData,
  updateBatchItem,
  bulkUpdateBatchItems,
  createCollectionReceipt,
  getAssignableCheques,
  getCollectionStats,
  getChequeReceivableLocal,
  getODBCVoucherDetail,
  getBankNames,
  createBankName,
  updateBankName,
  deleteBankName,
  getLedgerMappings,
  upsertLedgerMapping,
  updateLedgerMappingApi,
  deleteLedgerMapping
} from '../utils/api';
import ChatPanel from '../components/ChatPanel';


// Page titles with icons
const PAGE_TITLES = {
  dashboard: '📊 Dashboard',
  pending: '⏳ Pending Bills',
  vouchers: '📜 Total Vouchers',

  deleted: '🗑️ Deleted Vouchers',
  dispatch: '📦 Dispatch',
  sacks: '🎒 Sacks',
  daybook: '📒 Daybook',
  fonepay: '📱 Fonepay',
  rbb: '🏦 RBB Banking',
  'bill-history': '📋 Dashboard Bills',
  parties: '👥 Parties',
  outstanding: '💰 Outstanding & Ageing',
  'stock-groups': '📦 Stock Groups',
  'profit-loss': '📈 Profit & Loss',
  'price-lists': '🏷️ Price Lists',
  'bank-recon': '🏦 Bank Reconciliation',
  'inventory-movement': '📊 Inventory Movement',
  'balance-sheet': '📊 Balance Sheet',
  'trial-balance': '⚖️ Trial Balance',
  'cash-flow': '💵 Cash Flow',
  'ratio-analysis': '📉 Ratio Analysis',
  'xml-viewer': '🔍 XML Viewer',
  'columnar': '📋 Columnar Dashboard',
  'cheques': '📝 Cheque Management',
  'cheque-post': '📝 Cheque Post',
  'cheque-vouchers': '📋 Cheque Voucher List',
  collection: '📦 Cheque Collection',
  'bank-names': '🏦 Bank Names',
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

export default function RushDashboard() {
  // State
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isSimpleMode, setIsSimpleMode] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('rushDarkMode');
    return saved !== 'false'; // Default to dark mode
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

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
  const [clearedBills, setClearedBills] = useState([]);
  const [pendingTab, setPendingTab] = useState('pending'); // 'pending' or 'cleared'
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
  const [voucherLock, setVoucherLock] = useState(null);
  const [voucherLockLoading, setVoucherLockLoading] = useState(false);
  const [voucherLockDate, setVoucherLockDate] = useState(new Date().toISOString().split('T')[0]);
  const [unlockFromDate, setUnlockFromDate] = useState('');
  const [unlockToDate, setUnlockToDate] = useState('');
  const [lockCompany, setLockCompany] = useState('For DB');
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
  const [tallyCompanies, setTallyCompanies] = useState([]);
  const [syncRunning, setSyncRunning] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingDeleted, setSyncingDeleted] = useState(false);

  // Filter state
  const [billFilter, setBillFilter] = useState('all');
  const [daybookFromDate, setDaybookFromDate] = useState(new Date().toISOString().split('T')[0]);
  const [daybookToDate, setDaybookToDate] = useState(new Date().toISOString().split('T')[0]);
  const [daybookView, setDaybookView] = useState('columnar'); // 'columnar' or 'normal'
  const [daybookTypeFilter, setDaybookTypeFilter] = useState('');

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
  const [voucherSort, setVoucherSort] = useState({ field: 'alter_id', direction: 'desc' }); // Default: highest Alt ID first
  const [voucherTypeFilter, setVoucherTypeFilter] = useState('');
  const [auditFilter, setAuditFilter] = useState('non_audited');
  const [criticalFilter, setCriticalFilter] = useState(false);
  const [criticalReasonFilter, setCriticalReasonFilter] = useState(''); // '', 'udf_change', 'audited_edit', 'post_dated'
  const [voucherPage, setVoucherPage] = useState(1);
  const [voucherTotal, setVoucherTotal] = useState(0);
  const [selectedVouchers, setSelectedVouchers] = useState(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const VOUCHERS_PER_PAGE = 100;

  // Recent vouchers sort (dashboard panel)
  const [recentVoucherSort, setRecentVoucherSort] = useState({ field: 'alter_id', direction: 'desc' });

  // Voucher change log
  const [expandedVoucherId, setExpandedVoucherId] = useState(null);
  const [voucherChanges, setVoucherChanges] = useState([]);
  const [changesLoading, setChangesLoading] = useState(false);

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

  // Outstanding & Ageing state
  const [outstandingBills, setOutstandingBills] = useState([]);
  const [ageingSummary, setAgeingSummary] = useState([]);
  const [outstandingParties, setOutstandingParties] = useState([]);
  const [outstandingTab, setOutstandingTab] = useState('bills');
  const [outstandingLoading, setOutstandingLoading] = useState(false);
  const [outstandingSyncing, setOutstandingSyncing] = useState(false);
  const [outstandingSearch, setOutstandingSearch] = useState('');
  const [receivableSummary, setReceivableSummary] = useState(null);
  const [outstandingOverdue, setOutstandingOverdue] = useState(false);

  // Bank Names state
  const [bankNamesList, setBankNamesList] = useState([]);
  const [bankNamesLoading, setBankNamesLoading] = useState(false);
  const [bnEditId, setBnEditId] = useState(null);
  const [bnEditShort, setBnEditShort] = useState('');
  const [bnEditFull, setBnEditFull] = useState('');
  const [bnNewShort, setBnNewShort] = useState('');
  const [bnNewFull, setBnNewFull] = useState('');
  // Ledger Mapping state
  const [ledgerMappings, setLedgerMappings] = useState([]);
  const [lmEditId, setLmEditId] = useState(null);
  const [lmEditBilling, setLmEditBilling] = useState('');
  const [lmEditOdbc, setLmEditOdbc] = useState('');
  const [lmNewBilling, setLmNewBilling] = useState('');
  const [lmNewOdbc, setLmNewOdbc] = useState('');
  const [lmSearch, setLmSearch] = useState('');
  const [lmBillingParties, setLmBillingParties] = useState([]);
  const [lmOdbcParties, setLmOdbcParties] = useState([]);
  const [lmDropdown, setLmDropdown] = useState(null); // 'new-billing', 'new-odbc', 'edit-billing', 'edit-odbc'

  // Profit & Loss state
  const [profitLoss, setProfitLoss] = useState(null);
  const [plLoading, setPlLoading] = useState(false);
  const [plDateFrom, setPlDateFrom] = useState('');
  const [plDateTo, setPlDateTo] = useState('');

  // Stock Groups state
  const [stockGroups, setStockGroups] = useState([]);
  const [stockGroupsLoading, setStockGroupsLoading] = useState(false);
  const [stockGroupsSyncing, setStockGroupsSyncing] = useState(false);

  // Price Lists state
  const [priceLists, setPriceLists] = useState([]);
  const [priceLevels, setPriceLevels] = useState([]);
  const [priceListLevel, setPriceListLevel] = useState('');
  const [priceListLoading, setPriceListLoading] = useState(false);
  const [priceListSyncing, setPriceListSyncing] = useState(false);

  // Inventory Movement state
  const [invMovements, setInvMovements] = useState([]);
  const [invSummary, setInvSummary] = useState([]);
  const [invLoading, setInvLoading] = useState(false);
  const [invDateFrom, setInvDateFrom] = useState(getTodayISO());
  const [invDateTo, setInvDateTo] = useState(getTodayISO());
  const [invTab, setInvTab] = useState('movements');

  // Bank Recon state
  const [reconMatches, setReconMatches] = useState([]);
  const [reconSummary, setReconSummary] = useState([]);
  const [reconUnmatchedRBB, setReconUnmatchedRBB] = useState([]);
  const [reconUnmatchedFP, setReconUnmatchedFP] = useState([]);
  const [reconTab, setReconTab] = useState('summary');
  const [reconLoading, setReconLoading] = useState(false);
  const [reconMatching, setReconMatching] = useState(false);
  const [reconType, setReconType] = useState('rbb_tally');
  const [reconBankLedger, setReconBankLedger] = useState('RBB Bank');
  const [reconDateFrom, setReconDateFrom] = useState('');
  const [reconDateTo, setReconDateTo] = useState('');

  // Balance Sheet state
  const [balanceSheet, setBalanceSheet] = useState(null);
  const [bsLoading, setBsLoading] = useState(false);
  const [bsDateFrom, setBsDateFrom] = useState('');
  const [bsDateTo, setBsDateTo] = useState('');

  // Trial Balance state
  const [trialBalance, setTrialBalance] = useState(null);
  const [tbLoading, setTbLoading] = useState(false);
  const [tbDateFrom, setTbDateFrom] = useState('');
  const [tbDateTo, setTbDateTo] = useState('');
  const [tbSearch, setTbSearch] = useState('');

  // Cash Flow state
  const [cashFlow, setCashFlow] = useState(null);
  const [cfLoading, setCfLoading] = useState(false);
  const [cfDateFrom, setCfDateFrom] = useState(getTodayISO());
  const [cfDateTo, setCfDateTo] = useState(getTodayISO());

  // Ratio Analysis state
  const [ratios, setRatios] = useState(null);
  const [ratiosLoading, setRatiosLoading] = useState(false);
  const [ratiosDateFrom, setRatiosDateFrom] = useState('');
  const [ratiosDateTo, setRatiosDateTo] = useState('');

  // XML Viewer state
  const [xmlVouchers, setXmlVouchers] = useState([]);
  const [xmlLoading, setXmlLoading] = useState(false);
  const [xmlDetailLoading, setXmlDetailLoading] = useState(false);
  const [xmlSelectedVoucher, setXmlSelectedVoucher] = useState(null);
  const [xmlRawData, setXmlRawData] = useState(null);
  const [xmlSearch, setXmlSearch] = useState('');
  const [xmlTypeFilter, setXmlTypeFilter] = useState('');
  const [xmlSort, setXmlSort] = useState({ field: 'masterId', dir: 'desc' });
  const [xmlFind, setXmlFind] = useState('');
  const getDateMonthsAgo = (months) => {
    const d = new Date();
    d.setMonth(d.getMonth() - months);
    return d.toISOString().split('T')[0];
  };
  const [xmlFromDate, setXmlFromDate] = useState(getDateMonthsAgo(5));
  const [xmlToDate, setXmlToDate] = useState(getTodayISO());

  // Columnar Dashboard state
  const [colBills, setColBills] = useState([]);
  const [colTotals, setColTotals] = useState({});
  const [colPendingBills, setColPendingBills] = useState([]);
  const [colPendingTotal, setColPendingTotal] = useState(0);
  const [colAlterations, setColAlterations] = useState([]);
  const [colVoucherCounts, setColVoucherCounts] = useState({});
  const [altSort, setAltSort] = useState({ key: 'changed_at', dir: 'desc' });
  const [altExpandedId, setAltExpandedId] = useState(null);
  const [altChangeLog, setAltChangeLog] = useState([]);
  const [altChangeLoading, setAltChangeLoading] = useState(false);
  const [colLoading, setColLoading] = useState(false);
  const [colDate, setColDate] = useState(getTodayISO());
  const [colSearch, setColSearch] = useState('');
  const [colTypeFilter, setColTypeFilter] = useState('');
  const [expandedColParty, setExpandedColParty] = useState(null);
  const [colPartyDetails, setColPartyDetails] = useState([]);
  const [colDetailsLoading, setColDetailsLoading] = useState(false);

  // Cheque Management state
  const [chequeRecon, setChequeRecon] = useState(null);
  const [chequesList, setChequesList] = useState([]);
  const [chequeODBC, setChequeODBC] = useState([]);
  const [chequeSummary, setChequeSummary] = useState(null);
  const [chequeTab, setChequeTab] = useState('dashboard');
  const [chequeLoading, setChequeLoading] = useState(false);
  const [chequeSyncing, setChequeSyncing] = useState(false);
  const [chequeSearch, setChequeSearch] = useState('');
  const [chequeStatusFilter, setChequeStatusFilter] = useState('');
  const [chequeExpandedParty, setChequeExpandedParty] = useState(null);

  // Cheque Voucher List state (all vouchers from cheque company)
  const [chqVouchers, setChqVouchers] = useState([]);
  const [chqVouchersLoading, setChqVouchersLoading] = useState(false);
  const [chqSyncing, setChqSyncing] = useState(false);
  const [chqStats, setChqStats] = useState(null);
  const [chqSearch, setChqSearch] = useState('');
  const [chqTypeFilter, setChqTypeFilter] = useState('');
  const [chqSortField, setChqSortField] = useState('voucherDate');
  const [chqSortDir, setChqSortDir] = useState('desc');

  // Cheque Collection state
  const [collTab, setCollTab] = useState('assign');
  const [collStaff, setCollStaff] = useState([]);
  const [collBatches, setCollBatches] = useState([]);
  const [collAssignable, setCollAssignable] = useState([]);
  const [collSelected, setCollSelected] = useState(new Set());
  const [collSelectedStaff, setCollSelectedStaff] = useState('');
  const [collActiveBatch, setCollActiveBatch] = useState(null);
  const [collActiveBatchItems, setCollActiveBatchItems] = useState([]);
  const [collStats, setCollStats] = useState(null);
  const [collLoading, setCollLoading] = useState(false);
  const [collSyncing, setCollSyncing] = useState(false);
  const [collSearch, setCollSearch] = useState('');
  const [collShowStaffForm, setCollShowStaffForm] = useState(false);
  const [collNewStaff, setCollNewStaff] = useState({ name: '', phone: '', tallyLedgerName: '' });
  const [collPrintData, setCollPrintData] = useState(null);
  const [collItemStatuses, setCollItemStatuses] = useState({});
  const [collReceivable, setCollReceivable] = useState([]);
  const [collRecvLoading, setCollRecvLoading] = useState(false);
  const [collRecvSearch, setCollRecvSearch] = useState('');
  const [collRecvSyncing, setCollRecvSyncing] = useState(false);
  const [collRecvFilter, setCollRecvFilter] = useState('pending');

  // Cheque Post state
  const [cpReceipts, setCpReceipts] = useState([]);
  const [cpOdbcParties, setCpOdbcParties] = useState([]);
  const [cpLoading, setCpLoading] = useState(false);
  const [cpSyncing, setCpSyncing] = useState(null);
  const [cpDate, setCpDate] = useState(getTodayISO());
  const [cpForms, setCpForms] = useState(() => {
    try { return JSON.parse(localStorage.getItem('cpForms') || '{}'); } catch { return {}; }
  });
  const [cpPartyFilter, setCpPartyFilter] = useState({});
  const [cpPartyDropdown, setCpPartyDropdown] = useState(null);
  const [cpExpanded, setCpExpanded] = useState({});  // { [masterId]: true/false }
  const [cpBsDate, setCpBsDate] = useState({});  // { 'masterId-lineIdx': 'dd-mm' or 'dd-mm-yyyy' }

  // Bikram Sambat calendar data: days per month for each BS year
  const BS_DATA = {
    2080: [31,32,31,32,31,30,30,30,29,30,29,31],
    2081: [31,31,32,31,31,31,30,29,30,29,30,30],
    2082: [31,31,32,32,31,30,30,29,30,29,30,30],
    2083: [31,32,31,32,31,30,30,30,29,29,30,31],
    2084: [30,32,31,32,31,30,30,30,29,30,29,31],
    2085: [31,31,32,31,31,31,30,29,30,29,30,30],
    2086: [31,31,32,32,31,30,30,29,30,29,30,30],
    2087: [31,32,31,32,31,30,30,30,29,29,30,31],
    2088: [31,31,31,32,31,31,29,30,30,29,30,30],
    2089: [31,31,32,31,31,31,30,29,30,29,30,30],
    2090: [31,32,31,32,31,30,30,30,29,29,30,31]
  };
  // Reference: 1 Baisakh 2080 BS = 14 April 2023 AD
  const bsToAd = (bsY, bsM, bsD) => {
    if (!BS_DATA[bsY]) return null;
    if (bsM < 1 || bsM > 12) return null;
    if (bsD < 1 || bsD > (BS_DATA[bsY]?.[bsM - 1] || 32)) return null;
    let totalDays = 0;
    for (let y = 2080; y < bsY; y++) {
      if (!BS_DATA[y]) return null;
      totalDays += BS_DATA[y].reduce((a, b) => a + b, 0);
    }
    for (let m = 0; m < bsM - 1; m++) totalDays += BS_DATA[bsY][m];
    totalDays += bsD - 1;
    const ref = new Date(2023, 3, 14); // April 14, 2023
    ref.setDate(ref.getDate() + totalDays);
    return ref;
  };
  // Get current BS year/month from today's AD date
  const getCurrentBsYear = () => {
    const today = new Date();
    let totalDays = Math.floor((today - new Date(2023, 3, 14)) / 86400000);
    if (totalDays < 0) return 2080;
    for (let y = 2080; y <= 2090; y++) {
      if (!BS_DATA[y]) return y;
      const yearDays = BS_DATA[y].reduce((a, b) => a + b, 0);
      if (totalDays < yearDays) return y;
      totalDays -= yearDays;
    }
    return 2090;
  };
  const handleBsDateInput = (masterId, li, val) => {
    const key = `${masterId}-${li}`;
    setCpBsDate(prev => ({ ...prev, [key]: val }));
    // Parse: 0901 (ddmm), 09012082 (ddmmyyyy), dd-mm, dd-mm-yyyy
    let bsD, bsM, bsY;
    const digits = val.replace(/[^0-9]/g, '');
    if (digits.length >= 4 && !val.includes('-')) {
      // No dashes: ddmm or ddmmyyyy
      bsD = parseInt(digits.slice(0, 2));
      bsM = parseInt(digits.slice(2, 4));
      bsY = digits.length >= 8 ? parseInt(digits.slice(4, 8)) : getCurrentBsYear();
    } else {
      const parts = val.split('-').map(Number);
      if (parts.length >= 2) { bsD = parts[0]; bsM = parts[1]; bsY = parts[2] || getCurrentBsYear(); }
    }
    if (bsD > 0 && bsM > 0) {
      const adDate = bsToAd(bsY, bsM, bsD);
      if (adDate) {
        const iso = `${adDate.getFullYear()}-${String(adDate.getMonth() + 1).padStart(2, '0')}-${String(adDate.getDate()).padStart(2, '0')}`;
        cpUpdateLine(masterId, li, 'chequeDate', iso);
      }
    }
  };

  // Auto-save forms to localStorage on every change
  useEffect(() => {
    if (Object.keys(cpForms).length > 0) {
      localStorage.setItem('cpForms', JSON.stringify(cpForms));
    }
  }, [cpForms]);

  // Cheque Post multi-step: 'entry' -> 'confirm'
  const [cpStep, setCpStep] = useState('entry');
  const [cpSelected, setCpSelected] = useState({}); // { [masterId]: true/false }
  const [cpSyncAllLoading, setCpSyncAllLoading] = useState(false);
  const [cpSyncResults, setCpSyncResults] = useState(null);
  const [cpPostedCount, setCpPostedCount] = useState(0);
  const [cpPostedData, setCpPostedData] = useState(null); // posted log entries for current date
  const [cpShowPosted, setCpShowPosted] = useState(false); // toggle posted view
  const [cpFetchedDetails, setCpFetchedDetails] = useState({}); // { voucherId: { loading, lines } }

  // Cheque Management page state
  const [cmPostLog, setCmPostLog] = useState([]);
  const [cmStats, setCmStats] = useState(null);
  const [cmLoading, setCmLoading] = useState(false);
  const [cmTab, setCmTab] = useState('dashboard');

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
  const [newItemForm, setNewItemForm] = useState({ stockItem: '', quantity: 1, rate: '', unit: '' });
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
      const [summaryRes, billsRes, pendingRes, clearedRes] = await Promise.all([
        getDashboardSummary(),
        getBills({ limit: 50 }),
        getAllPendingBills(),
        getClearedBills()
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
      // Cleared bills
      const clearedData = clearedRes.data;
      setClearedBills(Array.isArray(clearedData) ? clearedData : (clearedData?.bills || []));
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch daybook
  const fetchDaybook = useCallback(async () => {
    try {
      const params = {
        fromDate: daybookFromDate.replace(/-/g, ''),
        toDate: daybookToDate.replace(/-/g, ''),
      };
      if (daybookTypeFilter) params.voucherTypes = daybookTypeFilter;
      const res = await getDaybook(params);
      const data = res.data || {};
      setDaybook(Array.isArray(data.entries) ? data.entries : (Array.isArray(data) ? data : []));
    } catch (error) {
      console.error('Failed to fetch daybook:', error);
      setDaybook([]);
    }
  }, [daybookFromDate, daybookToDate, daybookTypeFilter]);

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
      const offset = (voucherPage - 1) * VOUCHERS_PER_PAGE;

      const [vouchersRes, typesRes] = await Promise.all([
        getAllVouchers({
          limit: VOUCHERS_PER_PAGE,
          offset,
          dateFrom,
          dateTo,
          voucherType: voucherTypeFilter || undefined,
          search: debouncedSearch || undefined,
          auditStatus: auditFilter || undefined,
          isCritical: criticalFilter ? '1' : undefined,
          criticalReason: criticalReasonFilter || undefined
        }),
        getVoucherTypesList()
      ]);
      const data = vouchersRes.data || {};
      setAllVouchers(Array.isArray(data.vouchers) ? data.vouchers : []);
      setVoucherTotal(data.total || 0);
      setVoucherTypes(Array.isArray(typesRes.data) ? typesRes.data : []);
      setSelectedVouchers(new Set());
    } catch (error) {
      console.error('Failed to fetch vouchers:', error);
      setAllVouchers([]);
      setVoucherTotal(0);
      setVoucherTypes([]);
    } finally {
      setVouchersLoading(false);
    }
  }, [voucherDateFrom, voucherDateTo, voucherTypeFilter, voucherPage, debouncedSearch, auditFilter, criticalFilter, criticalReasonFilter]);

  // Fetch change log for a specific voucher
  const fetchVoucherChanges = useCallback(async (masterId) => {
    if (expandedVoucherId === masterId) {
      setExpandedVoucherId(null);
      setVoucherChanges([]);
      return;
    }
    setExpandedVoucherId(masterId);
    setChangesLoading(true);
    try {
      const res = await getVoucherChangeLog(masterId);
      setVoucherChanges(res.data?.changes || []);
    } catch (error) {
      console.error('Failed to fetch change log:', error);
      setVoucherChanges([]);
    } finally {
      setChangesLoading(false);
    }
  }, [expandedVoucherId]);

  // Debounce search query (400ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      if (searchQuery !== debouncedSearch) setVoucherPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Auto-fetch vouchers when filters change
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

  // Fetch voucher lock status
  const fetchVoucherLockStatus = useCallback(async () => {
    setVoucherLockLoading(true);
    try {
      const res = await getVoucherLockStatus();
      setVoucherLock(res.data);
      // Set company selector to match the configured company
      if (res.data.defaultCompany) setLockCompany(res.data.defaultCompany);
    } catch (error) {
      console.error('Failed to fetch voucher lock status:', error);
    }
    setVoucherLockLoading(false);
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

  // Fetch stock items and parties for Create Bill (each loads independently)
  const fetchCreateBillData = useCallback(async () => {
    const [stockRes, partiesRes, agentsRes, voucherTypesRes] = await Promise.allSettled([
      getStockItems(),
      getDebtors(),
      getAgents(),
      getTallyVoucherTypes()
    ]);
    if (stockRes.status === 'fulfilled') {
      const items = stockRes.value.data?.items || [];
      setStockItems(Array.isArray(items) ? items : []);
    } else {
      console.error('Failed to load stock items:', stockRes.reason);
    }
    if (partiesRes.status === 'fulfilled') {
      const parties = partiesRes.value.data?.ledgers || [];
      setPartyList(Array.isArray(parties) ? parties : []);
    } else {
      console.error('Failed to load parties:', partiesRes.reason);
    }
    if (agentsRes.status === 'fulfilled') {
      const agents = agentsRes.value.data?.agents || [];
      setAgentList(Array.isArray(agents) ? agents : []);
    } else {
      console.error('Failed to load agents:', agentsRes.reason);
    }
    if (voucherTypesRes.status === 'fulfilled') {
      const vTypes = voucherTypesRes.value.data?.voucherTypes || [];
      setTallyVoucherTypes(Array.isArray(vTypes) ? vTypes : []);
    } else {
      console.error('Failed to load voucher types:', voucherTypesRes.reason);
    }
  }, []);

  // Check Tally status
  const checkTallyStatus = useCallback(async () => {
    try {
      const res = await getTallyStatus();
      const connected = res.data?.connected || false;
      setTallyConnected(connected);
      if (connected) {
        try {
          const cRes = await getCompanies();
          setTallyCompanies(cRes.data?.companies || []);
        } catch { /* ignore */ }
      } else {
        setTallyCompanies([]);
      }
    } catch {
      setTallyConnected(false);
      setTallyCompanies([]);
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
      const res = await startSyncApi();
      setSyncRunning(res.data?.isRunning || false);
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
      const res = await stopSyncApi();
      setSyncRunning(res.data?.isRunning || false);
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
      await triggerSync();
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

  // Fetch daybook when date/filter changes
  useEffect(() => {
    fetchDaybook();
  }, [fetchDaybook]);

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
  // Fetch Outstanding & Ageing
  const fetchOutstanding = useCallback(async (overdue = false) => {
    setOutstandingLoading(true);
    try {
      const [billsRes, ageingRes, partiesRes, summaryRes] = await Promise.all([
        getOutstandingBills('', overdue), getAgeingSummary(overdue), getOutstandingParties(overdue), getReceivableSummary()
      ]);
      setOutstandingBills(billsRes.data.bills || []);
      setAgeingSummary(ageingRes.data.summary || []);
      setOutstandingParties(partiesRes.data.parties || []);
      setReceivableSummary(summaryRes.data);
    } catch (e) { console.error('Outstanding fetch error:', e); }
    setOutstandingLoading(false);
  }, []);

  const handleSyncOutstanding = async () => {
    setOutstandingSyncing(true);
    try {
      await syncOutstanding();
      await fetchOutstanding(outstandingOverdue);
    } catch (e) { console.error('Outstanding sync error:', e); }
    setOutstandingSyncing(false);
  };

  // Bank Names
  const fetchBankNames = useCallback(async () => {
    setBankNamesLoading(true);
    try {
      const res = await getBankNames();
      setBankNamesList(res.data.banks || []);
    } catch (e) { console.error('Bank names fetch error:', e); }
    setBankNamesLoading(false);
  }, []);

  const handleAddBankName = async () => {
    if (!bnNewShort.trim() || !bnNewFull.trim()) return;
    try {
      await createBankName({ shortName: bnNewShort, fullName: bnNewFull });
      setBnNewShort(''); setBnNewFull('');
      fetchBankNames();
    } catch (e) {
      addToast('error', 'Error', e.response?.data?.error || e.message);
    }
  };

  const handleUpdateBankName = async (id) => {
    if (!bnEditShort.trim() || !bnEditFull.trim()) return;
    try {
      await updateBankName(id, { shortName: bnEditShort, fullName: bnEditFull });
      setBnEditId(null);
      fetchBankNames();
    } catch (e) {
      addToast('error', 'Error', e.response?.data?.error || e.message);
    }
  };

  const handleDeleteBankName = async (id, name) => {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await deleteBankName(id);
      fetchBankNames();
    } catch (e) {
      addToast('error', 'Error', e.response?.data?.error || e.message);
    }
  };

  // Ledger Mapping
  const fetchLedgerMappings = useCallback(async () => {
    try {
      const res = await getLedgerMappings();
      setLedgerMappings(res.data.mappings || []);
    } catch (e) { console.error('Ledger mappings fetch error:', e); }
  }, []);

  const handleAddLedgerMapping = async () => {
    if (!lmNewBilling.trim() || !lmNewOdbc.trim()) return;
    try {
      await upsertLedgerMapping({ billingParty: lmNewBilling, odbcParty: lmNewOdbc });
      setLmNewBilling(''); setLmNewOdbc('');
      fetchLedgerMappings();
    } catch (e) {
      addToast('error', 'Error', e.response?.data?.error || e.message);
    }
  };

  const handleUpdateLedgerMapping = async (id) => {
    if (!lmEditBilling.trim() || !lmEditOdbc.trim()) return;
    try {
      await updateLedgerMappingApi(id, { billingParty: lmEditBilling, odbcParty: lmEditOdbc });
      setLmEditId(null);
      fetchLedgerMappings();
    } catch (e) {
      addToast('error', 'Error', e.response?.data?.error || e.message);
    }
  };

  const handleDeleteLedgerMapping = async (id, name) => {
    if (!confirm(`Delete mapping for "${name}"?`)) return;
    try {
      await deleteLedgerMapping(id);
      fetchLedgerMappings();
    } catch (e) {
      addToast('error', 'Error', e.response?.data?.error || e.message);
    }
  };

  // Fetch Profit & Loss
  const fetchProfitLoss = useCallback(async () => {
    setPlLoading(true);
    try {
      const from = plDateFrom ? plDateFrom.replace(/-/g, '') : '';
      const to = plDateTo ? plDateTo.replace(/-/g, '') : '';
      const res = await getProfitAndLoss(from, to);
      setProfitLoss(res.data);
    } catch (e) { console.error('P&L fetch error:', e); }
    setPlLoading(false);
  }, [plDateFrom, plDateTo]);

  // Fetch Balance Sheet
  const fetchBalanceSheet = useCallback(async () => {
    setBsLoading(true);
    try {
      const from = bsDateFrom ? bsDateFrom.replace(/-/g, '') : '';
      const to = bsDateTo ? bsDateTo.replace(/-/g, '') : '';
      const res = await getBalanceSheet(from, to);
      setBalanceSheet(res.data);
    } catch (e) { console.error('Balance Sheet fetch error:', e); }
    setBsLoading(false);
  }, [bsDateFrom, bsDateTo]);

  // Fetch Trial Balance
  const fetchTrialBalance = useCallback(async () => {
    setTbLoading(true);
    try {
      const from = tbDateFrom ? tbDateFrom.replace(/-/g, '') : '';
      const to = tbDateTo ? tbDateTo.replace(/-/g, '') : '';
      const res = await getTrialBalance(from, to);
      setTrialBalance(res.data);
    } catch (e) { console.error('Trial Balance fetch error:', e); }
    setTbLoading(false);
  }, [tbDateFrom, tbDateTo]);

  // Fetch Cash Flow
  const fetchCashFlow = useCallback(async () => {
    setCfLoading(true);
    try {
      const from = cfDateFrom ? cfDateFrom.replace(/-/g, '') : '';
      const to = cfDateTo ? cfDateTo.replace(/-/g, '') : '';
      if (!from || !to) { alert('Please select both From and To dates'); setCfLoading(false); return; }
      const res = await getCashFlow(from, to);
      setCashFlow(res.data);
    } catch (e) { console.error('Cash Flow fetch error:', e); }
    setCfLoading(false);
  }, [cfDateFrom, cfDateTo]);

  // Fetch Ratio Analysis
  const fetchRatios = useCallback(async () => {
    setRatiosLoading(true);
    try {
      const from = ratiosDateFrom ? ratiosDateFrom.replace(/-/g, '') : '';
      const to = ratiosDateTo ? ratiosDateTo.replace(/-/g, '') : '';
      const res = await getRatioAnalysis(from, to);
      setRatios(res.data);
    } catch (e) { console.error('Ratio Analysis fetch error:', e); }
    setRatiosLoading(false);
  }, [ratiosDateFrom, ratiosDateTo]);

  // Fetch Columnar Dashboard
  const fetchColumnar = useCallback(async () => {
    setColLoading(true);
    try {
      const d = colDate.replace(/-/g, '');
      const params = { date: d };
      if (colSearch) params.search = colSearch;
      const res = await getColumnarBills(params);
      setColBills(res.data?.bills || []);
      setColTotals(res.data?.totals || {});
      setColPendingBills(res.data?.pendingBills || []);
      setColPendingTotal(res.data?.pendingTotal || 0);
      setColAlterations(res.data?.alterations || []);
      setColVoucherCounts(res.data?.voucherCounts || {});
    } catch (e) { console.error('Columnar fetch error:', e); }
    setColLoading(false);
  }, [colDate, colSearch]);

  // Fetch individual vouchers for a party (columnar expand)
  const fetchColDetails = useCallback(async (partyName) => {
    if (expandedColParty === partyName) {
      setExpandedColParty(null);
      return;
    }
    setExpandedColParty(partyName);
    setColDetailsLoading(true);
    try {
      const d = colDate.replace(/-/g, '');
      const res = await getColumnarDetails({ date: d, party: partyName });
      setColPartyDetails(res.data?.vouchers || []);
    } catch (e) { console.error('Columnar details error:', e); }
    setColDetailsLoading(false);
  }, [colDate, expandedColParty]);

  // Fetch XML Vouchers from Tally
  const fetchXmlVouchers = useCallback(async () => {
    setXmlLoading(true);
    try {
      const from = xmlFromDate.replace(/-/g, '');
      const to = xmlToDate.replace(/-/g, '');
      const res = await getTallyXmlVouchers(from, to);
      setXmlVouchers(res.data?.vouchers || []);
    } catch (e) { console.error('XML vouchers fetch error:', e); }
    setXmlLoading(false);
  }, [xmlFromDate, xmlToDate]);

  const fetchXmlVoucherDetail = async (masterId) => {
    setXmlDetailLoading(true);
    setXmlSelectedVoucher(masterId);
    try {
      const res = await getTallyXmlVoucherDetail(masterId);
      setXmlRawData(res.data);
    } catch (e) {
      console.error('XML detail fetch error:', e);
      setXmlRawData({ error: e.message });
    }
    setXmlDetailLoading(false);
  };

  // Fetch Stock Groups
  const fetchStockGroups = useCallback(async () => {
    setStockGroupsLoading(true);
    try {
      const res = await getStockGroupSummary();
      setStockGroups(res.data.groups || []);
    } catch (e) { console.error('Stock groups fetch error:', e); }
    setStockGroupsLoading(false);
  }, []);

  const handleSyncStockGroups = async () => {
    setStockGroupsSyncing(true);
    try {
      await syncStockGroups();
      await fetchStockGroups();
    } catch (e) { console.error('Stock groups sync error:', e); }
    setStockGroupsSyncing(false);
  };

  // Fetch Price Lists
  const fetchPriceLists = useCallback(async () => {
    setPriceListLoading(true);
    try {
      const [pricesRes, levelsRes] = await Promise.all([
        getPriceListData(priceListLevel), getPriceLevels()
      ]);
      setPriceLists(pricesRes.data.prices || []);
      setPriceLevels(levelsRes.data.levels || []);
    } catch (e) { console.error('Price lists fetch error:', e); }
    setPriceListLoading(false);
  }, [priceListLevel]);

  const handleSyncPriceLists = async () => {
    setPriceListSyncing(true);
    try {
      await syncPriceLists();
      await fetchPriceLists();
    } catch (e) { console.error('Price lists sync error:', e); }
    setPriceListSyncing(false);
  };

  // Fetch Inventory Movement
  const fetchInventoryMovement = useCallback(async () => {
    setInvLoading(true);
    try {
      const from = invDateFrom.replace(/-/g, '');
      const to = invDateTo.replace(/-/g, '');
      const [movRes, sumRes] = await Promise.all([
        getInventoryMovement(from, to), getInventoryMovementSummary(from, to)
      ]);
      setInvMovements(movRes.data.movements || []);
      setInvSummary(sumRes.data.summary || []);
    } catch (e) { console.error('Inventory movement fetch error:', e); }
    setInvLoading(false);
  }, [invDateFrom, invDateTo]);

  // Fetch Bank Recon
  const fetchRecon = useCallback(async () => {
    setReconLoading(true);
    try {
      const [matchRes, sumRes, rbbRes, fpRes] = await Promise.all([
        getReconMatches(reconType), getReconSummary(reconType), getUnmatchedRBB(), getUnmatchedFonepay()
      ]);
      setReconMatches(matchRes.data.matches || []);
      setReconSummary(sumRes.data.summary || []);
      setReconUnmatchedRBB(rbbRes.data.transactions || []);
      setReconUnmatchedFP(fpRes.data.transactions || []);
    } catch (e) { console.error('Recon fetch error:', e); }
    setReconLoading(false);
  }, [reconType]);

  const handleAutoMatch = async () => {
    setReconMatching(true);
    try {
      const from = reconDateFrom ? reconDateFrom.replace(/-/g, '') : '';
      const to = reconDateTo ? reconDateTo.replace(/-/g, '') : '';
      await autoMatchRecon(reconType, reconBankLedger, from, to);
      await fetchRecon();
    } catch (e) {
      console.error('Auto-match error:', e);
      alert('Auto-match failed: ' + (e.response?.data?.error || e.message));
    }
    setReconMatching(false);
  };

  const fetchChequeRecon = async () => {
    setChequeLoading(true);
    try {
      const res = await getChequeReconciliation();
      setChequeRecon(res.data.reconciliation);
      setChequesList(res.data.merged || []);
      setChequeODBC(res.data.odbcCheques || []);
      setChequeSummary(res.data.summary);
    } catch (e) { console.error('Cheque recon error:', e); }
    setChequeLoading(false);
  };

  const fetchChequeVouchers = async () => {
    setChqVouchersLoading(true);
    try {
      const res = await getODBCCheques({});
      setChqVouchers(res.data?.cheques || []);
      setChqStats(res.data?.stats || null);
    } catch (e) { console.error('Cheque vouchers fetch error:', e); }
    setChqVouchersLoading(false);
  };

  const handleSyncODBCVouchers = async () => {
    setChqSyncing(true);
    try {
      const res = await syncODBCVouchers();
      if (res.data?.success) {
        addToast('success', 'Synced', `${res.data.synced} vouchers synced from Tally`);
        await fetchChequeVouchers();
      } else {
        addToast('error', 'Sync Failed', res.data?.error || 'Unknown error');
      }
    } catch (e) {
      addToast('error', 'Sync Failed', e.response?.data?.error || e.message);
    }
    setChqSyncing(false);
  };

  const fetchChequeManagement = async () => {
    setCmLoading(true);
    try {
      const res = await getChequePostLog({ limit: 100 });
      setCmPostLog(res.data.logs || []);
      setCmStats(res.data.stats || null);
    } catch (e) { console.error('Cheque management fetch error:', e); }
    setCmLoading(false);
  };

  // ==================== CHEQUE COLLECTION ====================
  const fetchCollectionData = async () => {
    setCollLoading(true);
    try {
      const [staffRes, batchesRes, chequesRes, statsRes] = await Promise.all([
        getCollectionStaff(),
        getCollectionBatches(),
        getAssignableCheques(),
        getCollectionStats()
      ]);
      setCollStaff(staffRes.data.staff || []);
      setCollBatches(batchesRes.data.batches || []);
      setCollAssignable(chequesRes.data.cheques || []);
      setCollStats(statsRes.data.stats || null);
    } catch (e) { console.error('Collection fetch error:', e); }
    setCollLoading(false);
  };

  const fetchChequeReceivable = async () => {
    setCollRecvLoading(true);
    try {
      const res = await getChequeReceivableLocal();
      setCollReceivable(res.data.cheques || []);
    } catch (e) { console.error('Cheque receivable fetch error:', e); }
    setCollRecvLoading(false);
  };

  const handleSyncAndFetchReceivable = async () => {
    setCollRecvSyncing(true);
    try {
      await syncODBCVouchers();
      addToast('success', 'ODBC Synced', 'Vouchers re-synced from Tally');
      await fetchChequeReceivable();
    } catch (e) {
      addToast('error', 'Sync Failed', e.response?.data?.error || e.message);
    }
    setCollRecvSyncing(false);
  };

  const handleCreateBatch = async () => {
    if (!collSelectedStaff || collSelected.size === 0) return;
    setCollSyncing(true);
    try {
      await createCollectionBatch({ staffId: parseInt(collSelectedStaff), chequeIds: Array.from(collSelected) });
      setCollSelected(new Set());
      addToast('success', 'Batch Created', `${collSelected.size} cheques assigned`);
      await fetchCollectionData();
      // Auto-show print for latest batch
      const bRes = await getCollectionBatches({ status: 'assigned' });
      const latest = (bRes.data.batches || [])[0];
      if (latest) {
        const pRes = await getBatchPrintData(latest.id);
        setCollPrintData(pRes.data);
      }
    } catch (e) {
      addToast('error', 'Error', e.response?.data?.error || e.message);
    }
    setCollSyncing(false);
  };

  const handleOpenBatch = async (batchId) => {
    try {
      const res = await getCollectionBatch(batchId);
      setCollActiveBatch(res.data.batch);
      setCollActiveBatchItems(res.data.items || []);
      const statuses = {};
      (res.data.items || []).forEach(i => { statuses[i.id] = i.status; });
      setCollItemStatuses(statuses);
    } catch (e) { console.error(e); }
  };

  const handleSaveBatchResults = async () => {
    if (!collActiveBatch) return;
    setCollSyncing(true);
    try {
      const updates = Object.entries(collItemStatuses).map(([itemId, status]) => ({ itemId: parseInt(itemId), status, notes: '' }));
      await bulkUpdateBatchItems(collActiveBatch.id, { updates });
      addToast('success', 'Saved', 'Batch items updated');
      await handleOpenBatch(collActiveBatch.id);
      await fetchCollectionData();
    } catch (e) {
      addToast('error', 'Error', e.response?.data?.error || e.message);
    }
    setCollSyncing(false);
  };

  const handleCreateReceipt = async () => {
    if (!collActiveBatch) return;
    setCollSyncing(true);
    try {
      // First save statuses
      const updates = Object.entries(collItemStatuses).map(([itemId, status]) => ({ itemId: parseInt(itemId), status, notes: '' }));
      await bulkUpdateBatchItems(collActiveBatch.id, { updates });
      // Then create receipt
      const res = await createCollectionReceipt(collActiveBatch.id);
      if (res.data.success) {
        addToast('success', 'Receipt Created', 'Tally receipt created successfully');
      } else {
        addToast('error', 'Tally Error', res.data.error || 'Failed to create receipt');
      }
      setCollActiveBatch(null);
      await fetchCollectionData();
    } catch (e) {
      addToast('error', 'Error', e.response?.data?.error || e.message);
    }
    setCollSyncing(false);
  };

  const handleAddStaff = async () => {
    if (!collNewStaff.name || !collNewStaff.tallyLedgerName) return;
    try {
      await createCollectionStaff(collNewStaff);
      setCollNewStaff({ name: '', phone: '', tallyLedgerName: '' });
      setCollShowStaffForm(false);
      addToast('success', 'Staff Added', `${collNewStaff.name} added`);
      const res = await getCollectionStaff();
      setCollStaff(res.data.staff || []);
    } catch (e) {
      addToast('error', 'Error', e.response?.data?.error || e.message);
    }
  };

  const handleDeleteStaff = async (id) => {
    if (!confirm('Deactivate this staff?')) return;
    try {
      await deleteCollectionStaff(id);
      const res = await getCollectionStaff();
      setCollStaff(res.data.staff || []);
    } catch (e) { addToast('error', 'Error', e.message); }
  };

  const handleChequeStatusChange = async (id, newStatus) => {
    try {
      await updateChequeStatus(id, { status: newStatus });
      await fetchChequeRecon();
    } catch (e) {
      alert('Status update failed: ' + (e.response?.data?.error || e.message));
    }
  };

  const handleSyncCheques = async () => {
    setChequeSyncing(true);
    try {
      await syncPendingCheques();
      await fetchChequeRecon();
    } catch (e) {
      alert('Sync failed: ' + (e.response?.data?.error || e.message));
    }
    setChequeSyncing(false);
  };

  // Auto-match ODBC party by name similarity
  const cpAutoMatchParty = (receiptPartyName, odbcParties) => {
    if (!receiptPartyName || !odbcParties.length) return '';
    // Check saved ledger mapping first
    const saved = ledgerMappings.find(m => m.billing_party.toLowerCase() === receiptPartyName.toLowerCase().trim());
    if (saved) {
      // Verify the mapped ODBC party still exists
      const exists = odbcParties.find(p => p.name.toLowerCase() === saved.odbc_party.toLowerCase());
      if (exists) return exists.name;
    }
    const rName = receiptPartyName.toLowerCase().trim();
    // Exact match first
    const exact = odbcParties.find(p => p.name.toLowerCase().trim() === rName);
    if (exact) return exact.name;
    // Match by first part (before comma - name without phone)
    const rFirst = rName.split(',')[0].trim();
    const partial = odbcParties.find(p => p.name.toLowerCase().trim().split(',')[0].trim() === rFirst);
    if (partial) return partial.name;
    // Starts-with match
    const starts = odbcParties.find(p => p.name.toLowerCase().startsWith(rFirst) || rFirst.startsWith(p.name.toLowerCase().split(',')[0].trim()));
    if (starts) return starts.name;
    return '';
  };

  const fetchChequePost = async (d) => {
    setCpLoading(true);
    try {
      const dateParam = (d || cpDate).replace(/-/g, '');
      const [rcptRes, partyRes, postedRes, logRes] = await Promise.all([
        getChequePostReceipts(dateParam),
        getODBCParties(),
        getPostedMasterIds(dateParam),
        getChequePostLog({ limit: 100 })
      ]);
      const allVouchers = rcptRes.data.vouchers || [];
      const postedIds = new Set((postedRes.data.masterIds || []).map(String));
      // Filter out already-posted receipts
      const vouchers = allVouchers.filter(v => !postedIds.has(String(v.masterId)));
      const parties = partyRes.data.parties || [];
      setCpReceipts(vouchers);
      setCpOdbcParties(parties);
      // Get posted logs for current date
      const allLogs = logRes.data.logs || [];
      const dateLogs = allLogs.filter(l => l.voucher_date === dateParam);
      if (postedIds.size > 0) { setCpPostedCount(postedIds.size); setCpPostedData(dateLogs); }
      else { setCpPostedCount(0); setCpPostedData(null); }
      // Initialize forms with auto-matched party, auto-filled amount & A/C holder
      const forms = {};
      for (const r of vouchers) {
        if (!forms[r.masterId]) {
          const autoParty = cpAutoMatchParty(r.partyName, parties);
          const holderName = (r.partyName || '').split(',')[0].trim();
          forms[r.masterId] = {
            odbcParty: autoParty,
            chequeLines: [{ bankName: '', chequeNumber: '', chequeDate: '', amount: String(r.chequeReceiptAmount || ''), accountHolderName: holderName }]
          };
        }
      }
      setCpForms(prev => ({ ...forms, ...prev }));
    } catch (e) { console.error('Cheque post fetch error:', e); }
    setCpLoading(false);
  };

  const cpUpdateForm = (masterId, field, value) => {
    setCpForms(prev => ({ ...prev, [masterId]: { ...prev[masterId], [field]: value } }));
  };

  const cpUpdateLine = (masterId, lineIdx, field, value) => {
    setCpForms(prev => {
      const form = { ...prev[masterId] };
      const lines = [...form.chequeLines];
      lines[lineIdx] = { ...lines[lineIdx], [field]: value };
      return { ...prev, [masterId]: { ...form, chequeLines: lines } };
    });
  };

  const cpUpdateLineMulti = (masterId, lineIdx, updates) => {
    setCpForms(prev => {
      const form = { ...prev[masterId] };
      const lines = [...form.chequeLines];
      lines[lineIdx] = { ...lines[lineIdx], ...updates };
      return { ...prev, [masterId]: { ...form, chequeLines: lines } };
    });
  };

  const cpAddLine = (masterId, prefillAmount) => {
    setCpForms(prev => {
      const form = { ...prev[masterId] };
      const lines = form.chequeLines || [];
      const lastLine = lines[lines.length - 1] || {};
      const lastNum = parseInt(lastLine.chequeNumber);
      const nextNum = lastNum && !isNaN(lastNum) ? String(lastNum + 1) : '';
      const lastBank = lastLine.bankName || '';
      return { ...prev, [masterId]: { ...form, chequeLines: [...lines, {
        bankName: lastBank,
        chequeNumber: nextNum,
        chequeDate: '',
        amount: prefillAmount != null ? String(prefillAmount) : '',
        accountHolderName: lastLine.accountHolderName || '',
        _hasSlash: !!lastBank
      }] } };
    });
  };

  // Auto-add next line when amount entered and total < receipt amount
  const cpAmountBlur = (masterId, lineIdx, receiptAmount) => {
    setCpForms(prev => {
      const form = prev[masterId];
      if (!form) return prev;
      const lines = form.chequeLines;
      const total = lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
      const remaining = receiptAmount - total;
      if (lineIdx === lines.length - 1 && remaining > 0.01) {
        const lastLine = lines[lines.length - 1] || {};
        const lastNum = parseInt(lastLine.chequeNumber);
        const nextNum = lastNum && !isNaN(lastNum) ? String(lastNum + 1) : '';
        const lastBank = lastLine.bankName || '';
        return { ...prev, [masterId]: { ...form, chequeLines: [...lines, {
          bankName: lastBank,
          chequeNumber: nextNum,
          chequeDate: '',
          amount: String(Math.round(remaining * 100) / 100),
          accountHolderName: lastLine.accountHolderName || '',
          _hasSlash: !!lastBank
        }] } };
      }
      return prev;
    });
  };

  const cpRemoveLine = (masterId, lineIdx) => {
    setCpForms(prev => {
      const form = { ...prev[masterId] };
      const lines = form.chequeLines.filter((_, i) => i !== lineIdx);
      return { ...prev, [masterId]: { ...form, chequeLines: lines.length ? lines : [{ bankName: '', chequeNumber: '', chequeDate: '', amount: '', accountHolderName: '' }] } };
    });
  };

  const cpSyncOne = async (receipt) => {
    const form = cpForms[receipt.masterId];
    if (!form?.odbcParty) return alert('Please select ODBC party name');
    const totalLines = form.chequeLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
    if (Math.abs(totalLines - receipt.chequeReceiptAmount) > 0.01) {
      return alert(`Cheque lines total (${formatCurrency(totalLines)}) does not match receipt amount (${formatCurrency(receipt.chequeReceiptAmount)}). Please adjust.`);
    }
    const missingFields = form.chequeLines.some(l => !l.bankName || !l.chequeNumber || !l.amount);
    if (missingFields) return alert('Please fill cheque number, bank name, and amount for all lines');

    setCpSyncing(receipt.masterId);
    try {
      const res = await syncChequePost({
        partyName: form.odbcParty,
        chequeLines: form.chequeLines.map(l => ({
          bankName: l.bankName,
          chequeNumber: l.chequeNumber,
          chequeDate: (l.chequeDate || '').replace(/-/g, ''),
          amount: parseFloat(l.amount),
          accountHolderName: l.accountHolderName || ''
        })),
        date: receipt.voucherDate,
        narration: `Cheque from ${receipt.partyName}`
      });
      if (res.data.success) {
        alert(`Synced ${form.chequeLines.length} cheques for ${receipt.partyName} to ODBC`);
        // Save ledger mapping for future auto-fill
        if (receipt.partyName && form.odbcParty && receipt.partyName.toLowerCase() !== form.odbcParty.toLowerCase()) {
          try { await upsertLedgerMapping({ billingParty: receipt.partyName, odbcParty: form.odbcParty }); } catch {}
        }
        // Remove from forms
        setCpForms(prev => { const n = { ...prev }; delete n[receipt.masterId]; return n; });
        fetchChequePost(cpDate);
      } else {
        alert('Sync failed: ' + (res.data.error || 'Unknown error'));
      }
    } catch (e) {
      alert('Sync error: ' + (e.response?.data?.error || e.message));
    }
    setCpSyncing(null);
  };

  // AD to BS display (approximate, for confirmation screen)
  const adToBsDisplay = (adDateStr) => {
    if (!adDateStr) return '';
    const ad = new Date(adDateStr);
    if (isNaN(ad.getTime())) return adDateStr;
    const ref = new Date(2023, 3, 14); // 1 Baisakh 2080
    let totalDays = Math.floor((ad - ref) / 86400000);
    if (totalDays < 0) return adDateStr;
    const bsMonths = ['Bai','Jes','Asa','Shr','Bhd','Asw','Kar','Man','Pou','Mag','Fal','Cha'];
    let bsY = 2080, bsM = 0, bsD = 1;
    for (bsY = 2080; bsY <= 2090; bsY++) {
      if (!BS_DATA[bsY]) break;
      const yearDays = BS_DATA[bsY].reduce((a, b) => a + b, 0);
      if (totalDays < yearDays) break;
      totalDays -= yearDays;
    }
    if (BS_DATA[bsY]) {
      for (bsM = 0; bsM < 12; bsM++) {
        if (totalDays < BS_DATA[bsY][bsM]) break;
        totalDays -= BS_DATA[bsY][bsM];
      }
      bsD = totalDays + 1;
    }
    return `${String(bsD).padStart(2,'0')}-${bsMonths[bsM]}-${bsY}`;
  };

  // Sync all selected receipts + create journal
  const cpSyncAll = async () => {
    const selectedReceipts = cpReceipts.filter(r => cpSelected[r.masterId]);
    if (!selectedReceipts.length) return alert('No receipts selected');

    // Validate all selected have party and matching amounts
    for (const r of selectedReceipts) {
      const form = cpForms[r.masterId];
      if (!form?.odbcParty) return alert(`Select ODBC party for ${r.partyName}`);
      const total = form.chequeLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
      if (Math.abs(total - r.chequeReceiptAmount) > 0.01) return alert(`Amount mismatch for ${r.partyName}`);
      if (form.chequeLines.some(l => !l.bankName || !l.chequeNumber || !l.amount)) return alert(`Fill all fields for ${r.partyName}`);
    }

    setCpSyncAllLoading(true);
    try {
      const payload = {
        receipts: selectedReceipts.map(r => {
          const form = cpForms[r.masterId];
          return {
            masterId: r.masterId,
            partyName: form.odbcParty,
            billingPartyName: r.partyName,
            chequeLines: form.chequeLines.map(l => ({
              bankName: l.bankName,
              chequeNumber: l.chequeNumber,
              chequeDate: (l.chequeDate || '').replace(/-/g, ''),
              amount: parseFloat(l.amount),
              accountHolderName: l.accountHolderName || ''
            })),
            narration: `Cheque from ${r.partyName}`
          };
        }),
        date: (cpDate || '').replace(/-/g, ''),
        billingCompany: 'For DB'
      };

      const res = await syncAllChequePosts(payload);
      setCpSyncResults(res.data);

      if (res.data.summary?.journalCreated) {
        // Save ledger mappings for all posted parties
        for (const r of selectedReceipts) {
          const form = cpForms[r.masterId];
          if (r.partyName && form?.odbcParty && r.partyName.toLowerCase() !== form.odbcParty.toLowerCase()) {
            try { await upsertLedgerMapping({ billingParty: r.partyName, odbcParty: form.odbcParty }); } catch {}
          }
        }
        // Clear synced forms
        setCpForms(prev => {
          const n = { ...prev };
          for (const r of selectedReceipts) delete n[r.masterId];
          return n;
        });
      }
    } catch (e) {
      alert('Sync error: ' + (e.response?.data?.error || e.message));
    }
    setCpSyncAllLoading(false);
  };

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
    if (page === 'outstanding') fetchOutstanding(outstandingOverdue);
    if (page === 'bank-names') {
      fetchBankNames(); fetchLedgerMappings();
      getDebtors().then(r => setLmBillingParties((r.data.ledgers || []).map(l => l.name))).catch(() => {});
      getODBCParties().then(r => setLmOdbcParties((r.data.parties || []).map(p => p.name))).catch(() => {});
    }
    if (page === 'profit-loss') fetchProfitLoss();
    if (page === 'stock-groups') fetchStockGroups();
    if (page === 'price-lists') fetchPriceLists();
    if (page === 'inventory-movement') fetchInventoryMovement();
    if (page === 'bank-recon') fetchRecon();
    if (page === 'balance-sheet') fetchBalanceSheet();
    if (page === 'trial-balance') fetchTrialBalance();
    if (page === 'cash-flow') fetchCashFlow();
    if (page === 'ratio-analysis') fetchRatios();
    if (page === 'xml-viewer') fetchXmlVouchers();
    if (page === 'columnar') fetchColumnar();
    if (page === 'cheques') { fetchChequeRecon(); fetchChequeManagement(); }
    if (page === 'cheque-post') { fetchChequePost(); fetchLedgerMappings(); }
    if (page === 'cheque-vouchers') fetchChequeVouchers();
    if (page === 'collection') fetchCollectionData();
    if (page === 'settings') fetchVoucherLockStatus();
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
    setNewItemForm({ stockItem: '', quantity: 1, rate: '', unit: '' });
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
    setNewItemForm({ stockItem: '', quantity: 1, rate: '', unit: '' });
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
      rate: item.rate || '',
      unit: item.base_units || 'Nos'
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
      amount: parseFloat(newItemForm.quantity) * parseFloat(newItemForm.rate),
      unit: newItemForm.unit || 'Nos'
    };

    setEditingItems(prev => [...prev, newItem]);
    setHasItemChanges(true);
    setNewItemForm({ stockItem: '', quantity: 1, rate: '', unit: '' });
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
        rate: parseFloat(newItemForm.rate),
        unit: newItemForm.unit || 'Nos'
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
      setNewItemForm({ stockItem: '', quantity: 1, rate: '', unit: '' });
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
      agent: '',
      items: [{ name: '', quantity: 1, rate: '', unit: '', amount: 0 }]
    });
    // Go back to dashboard
    setCurrentPage('dashboard');
  };

  // Add inventory item
  const addBillItem = () => {
    setNewBill(prev => ({
      ...prev,
      items: [...prev.items, { name: '', quantity: 1, rate: '', unit: '', amount: 0 }]
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
        amount: item.amount || 0,
        unit: item.unit || 'Nos'
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
<div className={`nav-item ${currentPage === 'pending' ? 'active' : ''}`} onClick={() => goToPage('pending')}>
            <span className="nav-icon">⏳</span> Pending Bills
            {pendingBillsArray.length > 0 && <span className="nav-badge amber">{pendingBillsArray.length}</span>}
          </div>
          <div className={`nav-item ${currentPage === 'vouchers' ? 'active' : ''}`} onClick={() => goToPage('vouchers')}>
            <span className="nav-icon">📜</span> Total Vouchers
            {billsArray.length > 0 && <span className="nav-badge blue">{billsArray.length}</span>}
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
          <div className={`nav-item ${currentPage === 'columnar' ? 'active' : ''}`} onClick={() => goToPage('columnar')}>
            <span className="nav-icon">📋</span> Columnar
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

          <div className="nav-label">Cheque Mgmt</div>
          <div className={`nav-item ${currentPage === 'cheques' ? 'active' : ''}`} onClick={() => goToPage('cheques')}>
            <span className="nav-icon">📝</span> Cheques
          </div>
          <div className={`nav-item ${currentPage === 'cheque-post' ? 'active' : ''}`} onClick={() => goToPage('cheque-post')}>
            <span className="nav-icon">📮</span> Cheque Post
          </div>
          <div className={`nav-item ${currentPage === 'cheque-vouchers' ? 'active' : ''}`} onClick={() => goToPage('cheque-vouchers')}>
            <span className="nav-icon">📋</span> Cheque Vouchers
          </div>
          <div className={`nav-item ${currentPage === 'collection' ? 'active' : ''}`} onClick={() => goToPage('collection')}>
            <span className="nav-icon">📦</span> Collection
          </div>
          <div className={`nav-item ${currentPage === 'bank-names' ? 'active' : ''}`} onClick={() => goToPage('bank-names')}>
            <span className="nav-icon">🏦</span> Bank Names
          </div>

          <div className="nav-label adv">Reports</div>
          <div className={`nav-item adv ${currentPage === 'outstanding' ? 'active' : ''}`} onClick={() => goToPage('outstanding')}>
            <span className="nav-icon">💰</span> Outstanding
          </div>
          <div className={`nav-item adv ${currentPage === 'stock-groups' ? 'active' : ''}`} onClick={() => goToPage('stock-groups')}>
            <span className="nav-icon">📦</span> Stock Groups
          </div>
          <div className={`nav-item adv ${currentPage === 'profit-loss' ? 'active' : ''}`} onClick={() => goToPage('profit-loss')}>
            <span className="nav-icon">📈</span> Profit & Loss
          </div>
          <div className={`nav-item adv ${currentPage === 'balance-sheet' ? 'active' : ''}`} onClick={() => goToPage('balance-sheet')}>
            <span className="nav-icon">📊</span> Balance Sheet
          </div>
          <div className={`nav-item adv ${currentPage === 'trial-balance' ? 'active' : ''}`} onClick={() => goToPage('trial-balance')}>
            <span className="nav-icon">⚖️</span> Trial Balance
          </div>
          <div className={`nav-item adv ${currentPage === 'cash-flow' ? 'active' : ''}`} onClick={() => goToPage('cash-flow')}>
            <span className="nav-icon">💵</span> Cash Flow
          </div>
          <div className={`nav-item adv ${currentPage === 'ratio-analysis' ? 'active' : ''}`} onClick={() => goToPage('ratio-analysis')}>
            <span className="nav-icon">📉</span> Ratio Analysis
          </div>
          <div className={`nav-item adv ${currentPage === 'price-lists' ? 'active' : ''}`} onClick={() => goToPage('price-lists')}>
            <span className="nav-icon">🏷️</span> Price Lists
          </div>
          <div className={`nav-item adv ${currentPage === 'bank-recon' ? 'active' : ''}`} onClick={() => goToPage('bank-recon')}>
            <span className="nav-icon">🏦</span> Reconciliation
          </div>
          <div className={`nav-item adv ${currentPage === 'inventory-movement' ? 'active' : ''}`} onClick={() => goToPage('inventory-movement')}>
            <span className="nav-icon">📊</span> Inventory Move
          </div>

          <div className="nav-label adv">System</div>
          <div className={`nav-item adv ${currentPage === 'xml-viewer' ? 'active' : ''}`} onClick={() => goToPage('xml-viewer')}>
            <span className="nav-icon">🔍</span> XML Viewer
          </div>
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

        {tallyCompanies.length > 0 && (
          <div className="tally-companies-badge">
            <span className="tcb-dot"></span>
            <span className="tcb-count">{tallyCompanies.length} {tallyCompanies.length === 1 ? 'Company' : 'Companies'}</span>
            <span className="tcb-names">{tallyCompanies.join(' | ')}</span>
          </div>
        )}

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

        <div className="top-btn" onClick={() => { setChatPanelOpen(!chatPanelOpen); if (!chatPanelOpen) setNotifPanelOpen(false); }} title="Tally Assistant">
          🤖
        </div>

        <div className="top-btn" onClick={() => { setNotifPanelOpen(!notifPanelOpen); if (!notifPanelOpen) setChatPanelOpen(false); }}>
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

      {/* CHAT PANEL */}
      <ChatPanel open={chatPanelOpen} onClose={() => setChatPanelOpen(false)} />

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
                      .map((v, idx) => {
                        const mid = v.tally_master_id || v.master_id;
                        const isExp = expandedVoucherId === mid;
                        return (
                        <React.Fragment key={v.id || idx}>
                        <tr
                          onClick={() => mid && fetchVoucherChanges(mid)}
                          style={{ cursor: mid ? 'pointer' : 'default', background: isExp ? 'var(--bg)' : undefined }}
                        >
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
                        {isExp && (
                          <tr>
                            <td colSpan="8" style={{ padding: 0, border: 'none' }}>
                              <div style={{ background: 'var(--bg)', borderLeft: '3px solid var(--blue)', padding: '10px 14px', margin: '0 4px 6px 4px', borderRadius: '0 6px 6px 0', fontSize: '12px' }}>
                                <div style={{ fontWeight: '700', color: 'var(--blue)', marginBottom: '6px' }}>Alteration Log</div>
                                {changesLoading ? (
                                  <span style={{ color: 'var(--t3)' }}>Loading...</span>
                                ) : voucherChanges.length === 0 ? (
                                  <span style={{ color: 'var(--t3)' }}>No field changes recorded.</span>
                                ) : (
                                  voucherChanges.map((c, ci) => (
                                    <div key={ci} style={{ display: 'flex', gap: '8px', padding: '3px 0', borderBottom: '1px solid var(--border)' }}>
                                      <span style={{ fontWeight: '600', color: 'var(--orange)', minWidth: '100px' }}>{c.field_name}</span>
                                      <span style={{ color: 'var(--red)', fontFamily: 'var(--mono)' }}>{c.old_value || '-'}</span>
                                      <span style={{ color: 'var(--t3)' }}>→</span>
                                      <span style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>{c.new_value || '-'}</span>
                                      <span style={{ color: 'var(--t3)', marginLeft: 'auto', fontSize: '10px' }}>{c.changed_at ? new Date(c.changed_at + 'Z').toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' }) : ''}</span>
                                    </div>
                                  ))
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                        );
                      })}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
                  <div className="sec-title" style={{ fontSize: '20px' }}>
                    ➕ Create New Bill
                  </div>
                  {/* Tally Status Badge */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                    background: tallyConnected ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                    color: tallyConnected ? 'var(--green)' : 'var(--red)'
                  }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: tallyConnected ? 'var(--green)' : 'var(--red)' }}></span>
                    {tallyConnected ? 'Tally Online' : 'Tally Offline'}
                  </div>
                  {/* Pending Invoices Badge */}
                  {pendingInvoices.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: '600',
                        background: 'rgba(245,158,11,0.15)', color: 'var(--orange)'
                      }}>
                        {pendingInvoices.length} pending
                      </span>
                      <button
                        onClick={handleSyncPendingInvoices}
                        disabled={syncingPendingInvoices || !tallyConnected}
                        style={{
                          padding: '4px 10px', borderRadius: '6px', border: 'none', fontSize: '12px', cursor: 'pointer',
                          background: syncingPendingInvoices || !tallyConnected ? 'var(--bg2)' : 'var(--blue-g)',
                          color: syncingPendingInvoices || !tallyConnected ? 'var(--t3)' : 'var(--blue)',
                          opacity: syncingPendingInvoices || !tallyConnected ? 0.5 : 1
                        }}
                        title={tallyConnected ? 'Sync pending invoices to Tally' : 'Tally offline'}
                      >
                        {syncingPendingInvoices ? '⟳ Syncing...' : '↑ Sync'}
                      </button>
                    </div>
                  )}
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
                    {createBillLoading ? '⟳ Creating...' : tallyConnected ? '✅ Create Bill' : '💾 Save Offline'}
                  </button>
                </div>
              </div>

              {/* Offline Mode Banner */}
              {!tallyConnected && (
                <div style={{
                  padding: '10px 16px', marginBottom: '16px', borderRadius: '8px',
                  background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)',
                  color: 'var(--orange)', fontSize: '13px'
                }}>
                  <strong>Offline Mode:</strong> Bills will be saved locally as DB-YYYYMMDD-NNN and sync automatically when Tally is back online.
                </div>
              )}

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
                                  if (stock.base_units) updateBillItem(index, 'unit', stock.base_units);
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
                                  if (stock.base_units) updateBillItem(index, 'unit', stock.base_units);
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
                                      if (stock.base_units) updateBillItem(index, 'unit', stock.base_units);
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


            {/* PENDING BILLS PAGE */}
            <div className={`page ${currentPage === 'pending' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '0' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>
                  {pendingTab === 'pending' ? '⏳ Pending Bills' : '✅ Cleared Bills'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {pendingTab === 'pending' && (
                    <span style={{ fontSize: '14px', color: 'var(--t2)' }}>
                      Total: <strong style={{ color: 'var(--red)' }}>{formatCurrency(summary.pendingAmount)}</strong>
                    </span>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '2px solid var(--border)' }}>
                <button
                  onClick={() => setPendingTab('pending')}
                  style={{
                    padding: '10px 20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                    background: 'none', border: 'none', color: pendingTab === 'pending' ? 'var(--amber)' : 'var(--t3)',
                    borderBottom: pendingTab === 'pending' ? '2px solid var(--amber)' : '2px solid transparent',
                    marginBottom: '-2px'
                  }}
                >
                  ⏳ Pending ({pendingBillsArray.length})
                </button>
                <button
                  onClick={() => setPendingTab('cleared')}
                  style={{
                    padding: '10px 20px', fontSize: '13px', fontWeight: '600', cursor: 'pointer',
                    background: 'none', border: 'none', color: pendingTab === 'cleared' ? 'var(--green)' : 'var(--t3)',
                    borderBottom: pendingTab === 'cleared' ? '2px solid var(--green)' : '2px solid transparent',
                    marginBottom: '-2px'
                  }}
                >
                  ✅ Cleared ({clearedBills.length})
                </button>
              </div>

              {/* PENDING TAB */}
              {pendingTab === 'pending' && (
                <div className="pending-list">
                  {pendingBillsArray.map((bill, index) => {
                    const isCritical = bill.is_critical === 1;
                    return (
                      <div key={bill.id} className="pending-item" style={isCritical ? { borderLeft: '3px solid var(--red)' } : {}}>
                        <div className="pending-left">
                          <div className="pending-num" style={isCritical ? { background: 'var(--red-g)', color: 'var(--red)' } : {}}>{String(index + 1).padStart(2, '0')}</div>
                          <div className="pending-info">
                            <div className="pending-party">
                              {bill.party_name}
                              {bill.party_address && <span className="pending-addr">, {bill.party_address}</span>}
                              {isCritical && bill.critical_reason && (() => {
                                const udfMatch = bill.udf_payment_total > 0 && Math.abs((bill.udf_payment_total || 0) - Math.abs(bill.amount || 0)) < 1;
                                return bill.critical_reason.split(',').filter(r => !(r === 'udf_change' && udfMatch)).map(r => {
                                  const labels = { udf_change: 'UDF', audited_edit: 'AUDIT-EDIT', post_dated: 'POST-DATE' };
                                  const colors = { udf_change: '#e65100', audited_edit: '#c62828', post_dated: '#6a1b9a' };
                                  return (
                                    <span key={r} style={{ marginLeft: '4px', fontSize: '10px', background: colors[r] || 'var(--red)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>
                                      {labels[r] || r}
                                    </span>
                                  );
                                });
                              })()}
                              {isCritical && !bill.critical_reason && (
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
              )}

              {/* CLEARED TAB */}
              {pendingTab === 'cleared' && (
                <div className="pending-list">
                  {clearedBills.map((bill, index) => (
                    <div key={bill.id} className="pending-item" style={{ borderLeft: '3px solid var(--green)' }}>
                      <div className="pending-left">
                        <div className="pending-num" style={{ background: 'var(--green-g)', color: 'var(--green)' }}>{String(index + 1).padStart(2, '0')}</div>
                        <div className="pending-info">
                          <div className="pending-party">
                            {bill.party_name}
                            {bill.party_address && <span className="pending-addr">, {bill.party_address}</span>}
                            <span style={{ marginLeft: '8px', fontSize: '10px', background: bill.voucher_type === 'Sales' ? 'var(--green)' : 'var(--amber)', color: 'white', padding: '2px 6px', borderRadius: '4px' }}>
                              {bill.voucher_type}
                            </span>
                          </div>
                          <div className="pending-meta">
                            <span className="pending-inv">{bill.voucher_number}</span>
                            <span className="pending-dot">•</span>
                            <span className="pending-date">{formatDate(bill.voucher_date)}</span>
                            <span className="pending-dot">•</span>
                            <span className="pending-bs">{toNepaliDate(bill.voucher_date)}</span>
                            <span className="pending-dot">•</span>
                            <span style={{ color: 'var(--green)', fontSize: '11px' }}>Paid: {formatCurrency(bill.udf_payment_total)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="pending-right">
                        <div className="pending-amt" style={{ color: 'var(--green)' }}>Rs {Math.abs(bill.amount).toLocaleString('en-IN')}</div>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
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
                        </div>
                      </div>
                    </div>
                  ))}

                  {clearedBills.length === 0 && (
                    <div className="empty-state" style={{ padding: '60px 20px' }}>
                      <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
                      <div style={{ fontSize: '18px', fontWeight: '600', marginBottom: '8px' }}>No Cleared Bills Yet</div>
                      <div style={{ color: 'var(--t3)' }}>Bills will appear here after payment is completed</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* TOTAL VOUCHERS PAGE */}
            <div className={`page ${currentPage === 'vouchers' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>
                  📜 Total Vouchers
                  <span className="cnt" style={{ marginLeft: '8px' }}>{voucherTotal} vouchers</span>
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
                      onClick={() => { setVoucherDateFrom(getTodayISO()); setVoucherDateTo(getTodayISO()); setVoucherPage(1); }}
                      style={{ background: 'var(--blue-g)', color: 'var(--blue)', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Today
                    </button>
                    <button
                      onClick={() => { setVoucherDateFrom(''); setVoucherDateTo(''); setVoucherPage(1); }}
                      style={{ background: 'var(--bg)', color: 'var(--t2)', border: '1px solid var(--border)', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', cursor: 'pointer' }}
                    >
                      All
                    </button>
                  </div>
                  <select
                    value={voucherTypeFilter}
                    onChange={(e) => { setVoucherTypeFilter(e.target.value); setVoucherPage(1); }}
                    style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--t1)', minWidth: '160px' }}
                  >
                    <option value="">All Types ({voucherTypes.reduce((s, vt) => s + vt.count, 0)})</option>
                    {voucherTypes.map((vt, i) => (
                      <option key={i} value={vt.voucher_type}>{vt.voucher_type} ({vt.count})</option>
                    ))}
                  </select>
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
                  <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />
                  <select
                    value={lockCompany}
                    onChange={(e) => setLockCompany(e.target.value)}
                    style={{ padding: '6px 8px', fontSize: '11px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--t1)' }}
                  >
                    <option value={voucherLock?.defaultCompany || 'FOR DB'}>{voucherLock?.defaultCompany || 'FOR DB'}</option>
                    <option value="ODBC CHq Mgmt">ODBC CHq Mgmt</option>
                    <option value="both">Both Companies</option>
                  </select>
                  <button
                    onClick={async () => {
                      const lockTo = voucherDateTo || voucherDateFrom || new Date().toISOString().split('T')[0];
                      if (!confirm(`Lock all vouchers up to ${lockTo} in "${lockCompany}"?`)) return;
                      setVoucherLockLoading(true);
                      try {
                        const res = await lockVouchers({ date: lockTo, company: lockCompany });
                        if (res.data.success) {
                          addToast('success', 'Locked', `${res.data.totalLocked} vouchers locked in "${lockCompany}"`);
                        } else {
                          addToast('error', 'Lock Failed', res.data.errors?.join(', ') || res.data.message || `0 vouchers locked`);
                        }
                      } catch (e) { addToast('error', 'Lock Failed', e.response?.data?.error || e.message); }
                      setVoucherLockLoading(false);
                    }}
                    disabled={voucherLockLoading}
                    style={{ padding: '6px 12px', fontSize: '12px', background: voucherLockLoading ? 'var(--bg4)' : 'var(--red)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: voucherLockLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {voucherLockLoading ? '⟳ ...' : '🔒 Lock'}
                  </button>
                  <button
                    onClick={async () => {
                      const from = voucherDateFrom;
                      const to = voucherDateTo;
                      if (!from || !to) { addToast('error', 'Error', 'Set From/To dates first'); return; }
                      if (!confirm(`Unlock vouchers from ${from} to ${to} in "${lockCompany}"?`)) return;
                      setVoucherLockLoading(true);
                      try {
                        const res = await unlockVouchers({ fromDate: from, toDate: to, company: lockCompany });
                        if (res.data.success) {
                          addToast('success', 'Unlocked', `${res.data.totalUnlocked} vouchers unlocked in "${lockCompany}"`);
                        } else {
                          addToast('error', 'Unlock Failed', res.data.errors?.join(', ') || res.data.message || `0 vouchers unlocked`);
                        }
                      } catch (e) { addToast('error', 'Unlock Failed', e.response?.data?.error || e.message); }
                      setVoucherLockLoading(false);
                    }}
                    disabled={voucherLockLoading}
                    style={{ padding: '6px 12px', fontSize: '12px', background: voucherLockLoading ? 'var(--bg4)' : 'var(--green)', color: 'white', border: 'none', borderRadius: '6px', fontWeight: '600', cursor: voucherLockLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                  >
                    {voucherLockLoading ? '⟳ ...' : '🔓 Unlock'}
                  </button>
                </div>
              </div>

              {/* Audit & Critical Filter Buttons */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: 'var(--t2)', fontWeight: '600', marginRight: '4px' }}>Status:</span>
                {[
                  { key: '', label: 'All', bg: 'var(--bg)', color: 'var(--t2)', border: 'var(--border)' },
                  { key: 'non_audited', label: 'Non Audited', bg: 'var(--red-g)', color: 'var(--red)', border: 'var(--red)' },
                  { key: 'need_to_ask', label: 'Need to Ask', bg: 'var(--amber-g)', color: 'var(--amber)', border: 'var(--amber)' },
                  { key: 'audited', label: 'Audited', bg: 'var(--green-g)', color: 'var(--green)', border: 'var(--green)' },
                  { key: 'unset', label: 'Unset', bg: 'var(--bg)', color: 'var(--t3)', border: 'var(--border)' },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => { setAuditFilter(auditFilter === f.key ? '' : f.key); setVoucherPage(1); }}
                    style={{
                      padding: '4px 10px', fontSize: '11px', fontWeight: auditFilter === f.key ? '700' : '500',
                      borderRadius: '4px', cursor: 'pointer', transition: 'all 0.15s',
                      background: auditFilter === f.key ? f.bg : 'var(--bg)',
                      color: auditFilter === f.key ? f.color : 'var(--t3)',
                      border: auditFilter === f.key ? `2px solid ${f.border}` : '1px solid var(--border)',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
                <div style={{ width: '1px', height: '20px', background: 'var(--border)', margin: '0 4px' }} />
                <button
                  onClick={() => { setCriticalFilter(!criticalFilter); setCriticalReasonFilter(''); setVoucherPage(1); }}
                  style={{
                    padding: '4px 10px', fontSize: '11px', fontWeight: criticalFilter ? '700' : '500',
                    borderRadius: '4px', cursor: 'pointer', transition: 'all 0.15s',
                    background: criticalFilter ? 'var(--red-g)' : 'var(--bg)',
                    color: criticalFilter ? 'var(--red)' : 'var(--t3)',
                    border: criticalFilter ? '2px solid var(--red)' : '1px solid var(--border)',
                  }}
                >
                  CRITICAL
                </button>
                {[
                  { key: 'udf_change', label: 'UDF Change', color: '#e65100', bg: '#fff3e0', border: '#e65100' },
                  { key: 'audited_edit', label: 'Audited Edit', color: '#c62828', bg: '#ffebee', border: '#c62828' },
                  { key: 'post_dated', label: 'Post Dated', color: '#6a1b9a', bg: '#f3e5f5', border: '#6a1b9a' },
                ].map(f => (
                  <button
                    key={f.key}
                    onClick={() => { setCriticalReasonFilter(criticalReasonFilter === f.key ? '' : f.key); setCriticalFilter(false); setVoucherPage(1); }}
                    style={{
                      padding: '4px 10px', fontSize: '11px', fontWeight: criticalReasonFilter === f.key ? '700' : '500',
                      borderRadius: '4px', cursor: 'pointer', transition: 'all 0.15s',
                      background: criticalReasonFilter === f.key ? f.bg : 'var(--bg)',
                      color: criticalReasonFilter === f.key ? f.color : 'var(--t3)',
                      border: criticalReasonFilter === f.key ? `2px solid ${f.border}` : '1px solid var(--border)',
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Bulk Action Bar */}
              {selectedVouchers.size > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', marginBottom: '10px',
                  background: 'var(--blue-g)', border: '1px solid var(--blue)', borderRadius: '8px',
                }}>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--blue)' }}>
                    {selectedVouchers.size} selected
                  </span>
                  <div style={{ width: '1px', height: '18px', background: 'var(--blue)', opacity: 0.3 }} />
                  <span style={{ fontSize: '11px', color: 'var(--t2)' }}>Set audit:</span>
                  {[
                    { key: 'audited', label: 'Audited', bg: 'var(--green)', color: '#fff' },
                    { key: 'need_to_ask', label: 'Need to Ask', bg: 'var(--amber)', color: '#fff' },
                    { key: 'non_audited', label: 'Non Audited', bg: 'var(--red)', color: '#fff' },
                  ].map(opt => (
                    <button
                      key={opt.key}
                      disabled={bulkUpdating}
                      onClick={async () => {
                        setBulkUpdating(true);
                        try {
                          await bulkUpdateAuditStatus([...selectedVouchers], opt.key);
                          setAllVouchers(prev => prev.map(v =>
                            selectedVouchers.has(v.id) ? { ...v, audit_status: opt.key } : v
                          ));
                          setSelectedVouchers(new Set());
                        } catch (err) { console.error('Bulk audit failed:', err); }
                        finally { setBulkUpdating(false); }
                      }}
                      style={{
                        padding: '4px 10px', fontSize: '11px', fontWeight: '600', borderRadius: '4px',
                        cursor: bulkUpdating ? 'wait' : 'pointer', border: 'none',
                        background: opt.bg, color: opt.color, opacity: bulkUpdating ? 0.6 : 1,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <div style={{ flex: 1 }} />
                  <button
                    onClick={() => setSelectedVouchers(new Set())}
                    style={{ padding: '4px 8px', fontSize: '10px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t2)', cursor: 'pointer' }}
                  >
                    Clear
                  </button>
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
                      <th style={{ width: '32px', padding: '4px' }}>
                        <input
                          type="checkbox"
                          checked={allVouchers.length > 0 && selectedVouchers.size === allVouchers.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedVouchers(new Set(allVouchers.map(v => v.id)));
                            } else {
                              setSelectedVouchers(new Set());
                            }
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      </th>
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
                      <th>Audit</th>
                      <th style={{ width: '50px', textAlign: 'center' }}>Lock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allVouchers
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
                    .map((voucher, index) => {
                      const mid = voucher.tally_master_id || voucher.master_id;
                      const isExpanded = expandedVoucherId === mid;
                      return (
                      <React.Fragment key={voucher.id || index}>
                      <tr
                        className={`${voucher.payment_status === 'pending' ? 'unpaid-row' : ''} ${isExpanded ? 'expanded-row' : ''}`}
                        onClick={() => mid && fetchVoucherChanges(mid)}
                        style={{ cursor: mid ? 'pointer' : 'default' }}
                      >
                        <td style={{ padding: '4px', textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedVouchers.has(voucher.id)}
                            onChange={(e) => {
                              setSelectedVouchers(prev => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(voucher.id);
                                else next.delete(voucher.id);
                                return next;
                              });
                            }}
                            style={{ cursor: 'pointer' }}
                          />
                        </td>
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
                          {voucher.is_critical === 1 && voucher.critical_reason && (() => {
                            const udfMatch = voucher.udf_payment_total > 0 && Math.abs((voucher.udf_payment_total || 0) - Math.abs(voucher.amount || 0)) < 1;
                            const reasons = voucher.critical_reason.split(',').filter(r => !(r === 'udf_change' && udfMatch));
                            return reasons.map(r => {
                              const labels = { udf_change: 'UDF', audited_edit: 'AUDIT-EDIT', post_dated: 'POST-DATE' };
                              const colors = { udf_change: '#e65100', audited_edit: '#c62828', post_dated: '#6a1b9a' };
                              return (
                                <span key={r} style={{ marginLeft: '4px', fontSize: '9px', background: colors[r] || 'var(--red)', color: 'white', padding: '1px 5px', borderRadius: '3px', fontWeight: '700' }}>
                                  {labels[r] || r}
                                </span>
                              );
                            });
                          })()}
                          {voucher.is_critical === 1 && !voucher.critical_reason && (
                            <span style={{ marginLeft: '4px', fontSize: '9px', background: 'var(--red)', color: 'white', padding: '1px 5px', borderRadius: '3px', fontWeight: '700' }}>CRITICAL</span>
                          )}
                          {voucher.is_critical !== 1 && voucher.critical_reason && (() => {
                            const udfMatch = voucher.udf_payment_total > 0 && Math.abs((voucher.udf_payment_total || 0) - Math.abs(voucher.amount || 0)) < 1;
                            const reasons = voucher.critical_reason.split(',').filter(r => !(r === 'udf_change' && udfMatch));
                            return reasons.map(r => {
                              const labels = { udf_change: 'UDF', audited_edit: 'AUDIT-EDIT', post_dated: 'POST-DATE' };
                              const colors = { udf_change: '#e65100', audited_edit: '#c62828', post_dated: '#6a1b9a' };
                              return (
                                <span key={r} style={{ marginLeft: '4px', fontSize: '9px', background: 'transparent', color: colors[r] || 'var(--t3)', padding: '1px 5px', borderRadius: '3px', fontWeight: '600', border: `1px solid ${colors[r] || 'var(--border)'}`, opacity: 0.6 }}>
                                  {labels[r] || r}
                                </span>
                              );
                            });
                          })()}
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
                        <td onClick={(e) => e.stopPropagation()} style={{ padding: '4px' }}>
                          <select
                            value={voucher.audit_status || ''}
                            onChange={async (e) => {
                              const val = e.target.value || null;
                              try {
                                await updateVoucherAuditStatus(voucher.id, val);
                                setAllVouchers(prev => prev.map(v => v.id === voucher.id ? { ...v, audit_status: val } : v));
                              } catch (err) { console.error('Audit update failed:', err); }
                            }}
                            style={{
                              fontSize: '10px', padding: '3px 4px', borderRadius: '4px', cursor: 'pointer',
                              border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)',
                              ...(voucher.audit_status === 'audited' ? { background: 'var(--green-g)', color: 'var(--green)', fontWeight: '700' } :
                                  voucher.audit_status === 'need_to_ask' ? { background: 'var(--amber-g)', color: 'var(--amber)', fontWeight: '700' } :
                                  voucher.audit_status === 'non_audited' ? { background: 'var(--red-g)', color: 'var(--red)', fontWeight: '700' } : {})
                            }}
                          >
                            <option value="">—</option>
                            <option value="audited">Audited</option>
                            <option value="need_to_ask">Need to Ask</option>
                            <option value="non_audited">Non Audited</option>
                          </select>
                        </td>
                        <td onClick={(e) => e.stopPropagation()} style={{ padding: '4px', textAlign: 'center' }}>
                          <button
                            onClick={async () => {
                              const isLocked = voucher._locked;
                              try {
                                const res = await toggleVoucherLock({ billId: voucher.id, lockValue: isLocked ? 'No' : 'Yes', company: lockCompany });
                                if (res.data.success) {
                                  setAllVouchers(prev => prev.map(v => v.id === voucher.id ? { ...v, _locked: !isLocked } : v));
                                  addToast('success', isLocked ? 'Unlocked' : 'Locked', `Voucher ${voucher.voucher_number || voucher.id} ${isLocked ? 'unlocked' : 'locked'}`);
                                } else {
                                  addToast('error', 'Failed', res.data.error || 'Could not toggle lock');
                                }
                              } catch (e) { addToast('error', 'Error', e.message); }
                            }}
                            title={voucher._locked ? 'Click to unlock' : 'Click to lock'}
                            style={{
                              padding: '3px 8px', fontSize: '14px', border: 'none', borderRadius: '4px', cursor: 'pointer',
                              background: voucher._locked ? 'var(--red-g)' : 'var(--bg)',
                              color: voucher._locked ? 'var(--red)' : 'var(--t3)',
                            }}
                          >
                            {voucher._locked ? '🔒' : '🔓'}
                          </button>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="change-log-row">
                          <td colSpan="13" style={{ padding: 0, border: 'none' }}>
                            <div style={{ background: 'var(--bg)', borderLeft: '3px solid var(--blue)', padding: '12px 16px', margin: '0 8px 8px 8px', borderRadius: '0 8px 8px 0' }}>
                              <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--blue)', marginBottom: '8px' }}>
                                Alteration History — Master ID: {mid}
                              </div>
                              {changesLoading ? (
                                <div style={{ color: 'var(--t3)', fontSize: '12px' }}>Loading changes...</div>
                              ) : voucherChanges.length === 0 ? (
                                <div style={{ color: 'var(--t3)', fontSize: '12px' }}>No field changes recorded for this voucher.</div>
                              ) : (
                                <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                                  <thead>
                                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                      <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--t2)', fontWeight: '600' }}>Field</th>
                                      <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--t2)', fontWeight: '600' }}>Old Value</th>
                                      <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--t2)', fontWeight: '600' }}>New Value</th>
                                      <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--t2)', fontWeight: '600' }}>Alter ID</th>
                                      <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--t2)', fontWeight: '600' }}>Changed At</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {voucherChanges.map((c, ci) => (
                                      <tr key={ci} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '4px 8px', fontWeight: '600', color: 'var(--orange)' }}>{c.field_name}</td>
                                        <td style={{ padding: '4px 8px', color: 'var(--red)', fontFamily: 'var(--mono)' }}>{c.old_value || '-'}</td>
                                        <td style={{ padding: '4px 8px', color: 'var(--green)', fontFamily: 'var(--mono)' }}>{c.new_value || '-'}</td>
                                        <td style={{ padding: '4px 8px', color: 'var(--t3)', fontFamily: 'var(--mono)' }}>{c.old_alter_id} → {c.new_alter_id}</td>
                                        <td style={{ padding: '4px 8px', color: 'var(--t3)' }}>{c.changed_at ? new Date(c.changed_at + 'Z').toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' }) : '-'}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                      );
                    })}
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

                {/* Pagination */}
                {voucherTotal > VOUCHERS_PER_PAGE && (
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', padding: '16px 0', flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-o"
                      disabled={voucherPage <= 1 || vouchersLoading}
                      onClick={() => setVoucherPage(1)}
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                    >
                      First
                    </button>
                    <button
                      className="btn btn-o"
                      disabled={voucherPage <= 1 || vouchersLoading}
                      onClick={() => setVoucherPage(p => Math.max(1, p - 1))}
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                    >
                      ← Prev
                    </button>
                    {(() => {
                      const totalPages = Math.ceil(voucherTotal / VOUCHERS_PER_PAGE);
                      const pages = [];
                      let start = Math.max(1, voucherPage - 2);
                      let end = Math.min(totalPages, start + 4);
                      if (end - start < 4) start = Math.max(1, end - 4);
                      for (let p = start; p <= end; p++) pages.push(p);
                      return pages.map(p => (
                        <button
                          key={p}
                          className={`btn ${p === voucherPage ? 'btn-p' : 'btn-o'}`}
                          onClick={() => setVoucherPage(p)}
                          disabled={vouchersLoading}
                          style={{ padding: '6px 10px', fontSize: '12px', minWidth: '36px', fontWeight: p === voucherPage ? '700' : '400' }}
                        >
                          {p}
                        </button>
                      ));
                    })()}
                    <button
                      className="btn btn-o"
                      disabled={voucherPage >= Math.ceil(voucherTotal / VOUCHERS_PER_PAGE) || vouchersLoading}
                      onClick={() => setVoucherPage(p => p + 1)}
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                    >
                      Next →
                    </button>
                    <button
                      className="btn btn-o"
                      disabled={voucherPage >= Math.ceil(voucherTotal / VOUCHERS_PER_PAGE) || vouchersLoading}
                      onClick={() => setVoucherPage(Math.ceil(voucherTotal / VOUCHERS_PER_PAGE))}
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                    >
                      Last
                    </button>
                    <span style={{ fontSize: '12px', color: 'var(--t3)', marginLeft: '8px' }}>
                      Page {voucherPage} of {Math.ceil(voucherTotal / VOUCHERS_PER_PAGE)} ({voucherTotal} total)
                    </span>
                  </div>
                )}
              </div>
              )}
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
                            {v.deleted_at ? new Date(v.deleted_at + 'Z').toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' }) : '-'}
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
                {/* Header with toggle + date range */}
                <div className="db-head" style={{ flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div className="sec-title" style={{ marginBottom: 0 }}>📒 Daybook</div>
                    <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                      <button
                        onClick={() => setDaybookView('columnar')}
                        style={{
                          padding: '4px 12px', fontSize: '11px', fontWeight: '600', border: 'none', cursor: 'pointer',
                          background: daybookView === 'columnar' ? 'var(--blue)' : 'var(--bg2)',
                          color: daybookView === 'columnar' ? '#fff' : 'var(--t2)',
                        }}
                      >
                        Columnar
                      </button>
                      <button
                        onClick={() => setDaybookView('normal')}
                        style={{
                          padding: '4px 12px', fontSize: '11px', fontWeight: '600', border: 'none', cursor: 'pointer',
                          background: daybookView === 'normal' ? 'var(--blue)' : 'var(--bg2)',
                          color: daybookView === 'normal' ? '#fff' : 'var(--t2)',
                        }}
                      >
                        Normal
                      </button>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--t3)' }}>({daybookArray.length} entries)</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: 'var(--t2)' }}>From:</span>
                    <input type="date" value={daybookFromDate} onChange={(e) => setDaybookFromDate(e.target.value)} />
                    <span style={{ fontSize: '11px', color: 'var(--t2)' }}>To:</span>
                    <input type="date" value={daybookToDate} onChange={(e) => setDaybookToDate(e.target.value)} />
                    <button
                      onClick={() => { const t = new Date().toISOString().split('T')[0]; setDaybookFromDate(t); setDaybookToDate(t); }}
                      style={{ background: 'var(--blue-g)', color: 'var(--blue)', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '10px', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Today
                    </button>
                    <select
                      value={daybookTypeFilter}
                      onChange={(e) => setDaybookTypeFilter(e.target.value)}
                      style={{ padding: '4px 8px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--t1)' }}
                    >
                      <option value="">All Types</option>
                      {[...new Set(daybookArray.map(e => e.voucher_type))].sort().map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Summary Cards */}
                <div className="db-summary" style={{ marginBottom: '12px' }}>
                  <div className="db-sum-item">
                    <span className="lb">Total Debit</span>
                    <span className="vl" style={{ color: 'var(--red)' }}>{formatCurrency(daybookTotals.debit)}</span>
                  </div>
                  <div className="db-sum-item">
                    <span className="lb">Total Credit</span>
                    <span className="vl" style={{ color: 'var(--green)' }}>{formatCurrency(daybookTotals.credit)}</span>
                  </div>
                  <div className="db-sum-item">
                    <span className="lb">Balance</span>
                    <span className="vl" style={{ color: daybookTotals.debit - daybookTotals.credit > 0 ? 'var(--red)' : 'var(--green)' }}>
                      {formatCurrency(daybookTotals.debit - daybookTotals.credit)} {daybookTotals.debit - daybookTotals.credit > 0 ? 'Dr' : 'Cr'}
                    </span>
                  </div>
                </div>

                {/* Columnar Daybook Table */}
                {daybookView === 'columnar' && (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Vch No</th>
                        <th>Party</th>
                        <th>Narration</th>
                        <th className="r">Debit</th>
                        <th className="r">Credit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daybookArray.length === 0 ? (
                        <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>No entries for selected date range</td></tr>
                      ) : daybookArray.map((entry, index) => (
                        <tr key={entry.id || index}>
                          <td>{index + 1}</td>
                          <td style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>{formatDate(entry.voucher_date)}</td>
                          <td>
                            <span className={`vt ${entry.voucher_type?.toLowerCase().includes('sales') ? 'sales' :
                              entry.voucher_type?.toLowerCase().includes('receipt') ? 'receipt' :
                              entry.voucher_type?.toLowerCase().includes('payment') || entry.voucher_type?.toLowerCase().includes('purchase') ? 'payment' : 'journal'}`}>
                              {entry.voucher_type || 'Entry'}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{entry.voucher_number || '—'}</td>
                          <td className="party">{entry.party_name || '—'}</td>
                          <td style={{ fontSize: '11px', color: 'var(--t3)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.narration || '—'}
                          </td>
                          <td className="r" style={{ color: entry.debit > 0 ? 'var(--red)' : 'var(--t3)', fontFamily: 'var(--mono)' }}>
                            {entry.debit > 0 ? formatCurrency(entry.debit).replace('₹', '') : '—'}
                          </td>
                          <td className="r" style={{ color: entry.credit > 0 ? 'var(--green)' : 'var(--t3)', fontFamily: 'var(--mono)' }}>
                            {entry.credit > 0 ? formatCurrency(entry.credit).replace('₹', '') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {daybookArray.length > 0 && (
                    <tfoot>
                      <tr style={{ fontWeight: '700' }}>
                        <td colSpan="6" style={{ textAlign: 'right' }}>TOTAL</td>
                        <td className="r" style={{ color: 'var(--red)', fontFamily: 'var(--mono)' }}>
                          {formatCurrency(daybookTotals.debit).replace('₹', '')}
                        </td>
                        <td className="r" style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>
                          {formatCurrency(daybookTotals.credit).replace('₹', '')}
                        </td>
                      </tr>
                    </tfoot>
                    )}
                  </table>
                </div>
                )}

                {/* Normal Daybook Table */}
                {daybookView === 'normal' && (
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>Type</th>
                        <th>Vch No</th>
                        <th>Party</th>
                        <th>Narration</th>
                        <th className="r">Amount</th>
                        <th>Dr/Cr</th>
                      </tr>
                    </thead>
                    <tbody>
                      {daybookArray.length === 0 ? (
                        <tr><td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>No entries for selected date range</td></tr>
                      ) : daybookArray.map((entry, index) => {
                        const isDr = entry.debit > 0;
                        return (
                        <tr key={entry.id || index}>
                          <td>{index + 1}</td>
                          <td style={{ fontSize: '11px', whiteSpace: 'nowrap' }}>{formatDate(entry.voucher_date)}</td>
                          <td>
                            <span className={`vt ${entry.voucher_type?.toLowerCase().includes('sales') ? 'sales' :
                              entry.voucher_type?.toLowerCase().includes('receipt') ? 'receipt' :
                              entry.voucher_type?.toLowerCase().includes('payment') || entry.voucher_type?.toLowerCase().includes('purchase') ? 'payment' : 'journal'}`}>
                              {entry.voucher_type || 'Entry'}
                            </span>
                          </td>
                          <td style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{entry.voucher_number || '—'}</td>
                          <td className="party">{entry.party_name || '—'}</td>
                          <td style={{ fontSize: '11px', color: 'var(--t3)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {entry.narration || '—'}
                          </td>
                          <td className="r" style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: isDr ? 'var(--red)' : 'var(--green)' }}>
                            {formatCurrency(isDr ? entry.debit : entry.credit).replace('₹', '')}
                          </td>
                          <td>
                            <span style={{
                              fontSize: '10px', fontWeight: '700', padding: '2px 6px', borderRadius: '3px',
                              background: isDr ? 'var(--red-g)' : 'var(--green-g)',
                              color: isDr ? 'var(--red)' : 'var(--green)',
                            }}>
                              {isDr ? 'Dr' : 'Cr'}
                            </span>
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                    {daybookArray.length > 0 && (
                    <tfoot>
                      <tr style={{ fontWeight: '700' }}>
                        <td colSpan="6" style={{ textAlign: 'right' }}>TOTAL Dr / Cr</td>
                        <td className="r" style={{ fontFamily: 'var(--mono)' }}>
                          <span style={{ color: 'var(--red)' }}>{formatCurrency(daybookTotals.debit).replace('₹', '')}</span>
                          {' / '}
                          <span style={{ color: 'var(--green)' }}>{formatCurrency(daybookTotals.credit).replace('₹', '')}</span>
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                    )}
                  </table>
                </div>
                )}

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

            {/* OUTSTANDING & AGEING PAGE */}
            <div className={`page ${currentPage === 'outstanding' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>Outstanding & Ageing</div>
                <button className="btn btn-p" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={handleSyncOutstanding} disabled={outstandingSyncing}>
                  {outstandingSyncing ? 'Syncing...' : 'Sync from Tally'}
                </button>
              </div>

              {/* Summary Cards */}
              {receivableSummary && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                  <div style={{ padding: '16px', background: outstandingOverdue ? 'var(--card)' : 'var(--blue-g, rgba(59,130,246,0.1))', borderRadius: '12px', border: outstandingOverdue ? '1px solid var(--border)' : '2px solid var(--blue)', cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => { setOutstandingOverdue(false); fetchOutstanding(false); }}>
                    <div style={{ fontSize: '12px', color: 'var(--t3)', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Receivable</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{formatCurrency(receivableSummary.total?.amount || 0)}</div>
                    <div style={{ fontSize: '12px', color: 'var(--t3)', marginTop: '4px' }}>{receivableSummary.total?.parties || 0} parties | {receivableSummary.total?.bills || 0} bills</div>
                  </div>
                  <div style={{ padding: '16px', background: outstandingOverdue ? 'var(--red-g, rgba(239,68,68,0.1))' : 'var(--card)', borderRadius: '12px', border: outstandingOverdue ? '2px solid var(--red)' : '1px solid var(--border)', cursor: 'pointer', transition: 'all 0.2s' }} onClick={() => { setOutstandingOverdue(true); fetchOutstanding(true); }}>
                    <div style={{ fontSize: '12px', color: 'var(--t3)', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Overdue Receivable</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--red)', fontFamily: 'var(--mono)' }}>{formatCurrency(receivableSummary.overdue?.amount || 0)}</div>
                    <div style={{ fontSize: '12px', color: 'var(--t3)', marginTop: '4px' }}>{receivableSummary.overdue?.parties || 0} parties | {receivableSummary.overdue?.bills || 0} bills</div>
                  </div>
                  <div style={{ padding: '16px', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--t3)', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current (0-30 days)</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--green)', fontFamily: 'var(--mono)' }}>{formatCurrency((receivableSummary.total?.amount || 0) - (receivableSummary.overdue?.amount || 0))}</div>
                    <div style={{ fontSize: '12px', color: 'var(--t3)', marginTop: '4px' }}>{(receivableSummary.total?.bills || 0) - (receivableSummary.overdue?.bills || 0)} bills within terms</div>
                  </div>
                  <div style={{ padding: '16px', background: 'var(--card)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '12px', color: 'var(--t3)', marginBottom: '4px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Overdue %</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: (receivableSummary.overdue?.amount || 0) / (receivableSummary.total?.amount || 1) > 0.5 ? 'var(--red)' : 'var(--orange)', fontFamily: 'var(--mono)' }}>{receivableSummary.total?.amount ? ((receivableSummary.overdue?.amount || 0) / receivableSummary.total.amount * 100).toFixed(1) : '0.0'}%</div>
                    <div style={{ fontSize: '12px', color: 'var(--t3)', marginTop: '4px' }}>of total receivable</div>
                  </div>
                </div>
              )}

              {/* View indicator + Tabs */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['bills', 'ageing', 'parties'].map(t => (
                    <button key={t} className={`btn ${outstandingTab === t ? 'btn-p' : 'btn-o'}`} style={{ padding: '6px 14px', fontSize: '12px', textTransform: 'capitalize' }} onClick={() => setOutstandingTab(t)}>{t}</button>
                  ))}
                </div>
                {outstandingOverdue && <span style={{ fontSize: '12px', color: 'var(--red)', fontWeight: '600', padding: '4px 10px', background: 'var(--red-g, rgba(239,68,68,0.1))', borderRadius: '6px' }}>Showing Overdue Only (30+ days)</span>}
              </div>

              {outstandingLoading ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading...</div> : (
                <>
                  {outstandingTab === 'bills' && (
                    <div className="table-wrap">
                      <input type="text" placeholder="Search party..." value={outstandingSearch} onChange={e => setOutstandingSearch(e.target.value)} style={{ marginBottom: '12px', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', width: '300px' }} />
                      <table className="data-table">
                        <thead><tr><th>Party</th><th>Bill</th><th>Date</th><th>Days</th><th>Bucket</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                        <tbody>
                          {outstandingBills.filter(b => !outstandingSearch || b.party_name.toLowerCase().includes(outstandingSearch.toLowerCase())).map((b, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: '600' }}>{b.party_name}</td>
                              <td>{b.bill_name}</td>
                              <td>{b.bill_date || '-'}</td>
                              <td>{b.ageing_days}</td>
                              <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: b.ageing_bucket === '90+' ? 'var(--red-g)' : b.ageing_bucket === '60-90' ? 'var(--orange-g)' : b.ageing_bucket === '30-60' ? 'var(--yellow-g)' : 'var(--green-g)', color: b.ageing_bucket === '90+' ? 'var(--red)' : b.ageing_bucket === '60-90' ? 'var(--orange)' : b.ageing_bucket === '30-60' ? 'var(--yellow)' : 'var(--green)' }}>{b.ageing_bucket}</span></td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '600' }}>{formatCurrency(b.closing_balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {outstandingBills.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--t3)' }}>No outstanding bills. Click "Sync from Tally" to fetch data.</div>}
                    </div>
                  )}

                  {outstandingTab === 'ageing' && (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead><tr><th>Bucket</th><th>Bills</th><th>Parties</th><th style={{ textAlign: 'right' }}>Total Amount</th></tr></thead>
                        <tbody>
                          {ageingSummary.map((a, i) => (
                            <tr key={i}>
                              <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: '600', background: a.ageing_bucket === '90+' ? 'var(--red-g)' : a.ageing_bucket === '60-90' ? 'var(--orange-g)' : a.ageing_bucket === '30-60' ? 'var(--yellow-g)' : 'var(--green-g)', color: a.ageing_bucket === '90+' ? 'var(--red)' : a.ageing_bucket === '60-90' ? 'var(--orange)' : a.ageing_bucket === '30-60' ? 'var(--yellow)' : 'var(--green)' }}>{a.ageing_bucket} days</span></td>
                              <td>{a.bill_count}</td>
                              <td>{a.party_count}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '700', fontSize: '14px' }}>{formatCurrency(a.total_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {ageingSummary.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--t3)' }}>No ageing data. Sync outstanding bills first.</div>}
                    </div>
                  )}

                  {outstandingTab === 'parties' && (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead><tr><th>Party</th><th>Bills</th><th>Oldest Bill</th><th style={{ textAlign: 'right' }}>Total Outstanding</th></tr></thead>
                        <tbody>
                          {outstandingParties.map((p, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: '600' }}>{p.party_name}</td>
                              <td>{p.bill_count}</td>
                              <td>{p.oldest_bill_date || '-'}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '700', color: 'var(--red)' }}>{formatCurrency(p.total_outstanding)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {outstandingParties.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--t3)' }}>No data. Sync from Tally first.</div>}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* STOCK GROUPS PAGE */}
            <div className={`page ${currentPage === 'stock-groups' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>📦 Stock Groups</div>
                <button className="btn btn-p" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={handleSyncStockGroups} disabled={stockGroupsSyncing}>
                  {stockGroupsSyncing ? '⟳ Syncing...' : '🔄 Sync from Tally'}
                </button>
              </div>

              {stockGroupsLoading ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading...</div> : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Group</th><th>Parent</th><th style={{ textAlign: 'right' }}>Items</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Value</th></tr></thead>
                    <tbody>
                      {stockGroups.map((g, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: '600' }}>{g.name}</td>
                          <td style={{ color: 'var(--t3)' }}>{g.parent || '-'}</td>
                          <td style={{ textAlign: 'right' }}>{g.item_count || 0}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{Number(g.closing_balance || 0).toLocaleString()}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--blue)' }}>{formatCurrency(g.closing_value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {stockGroups.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--t3)' }}>No stock groups. Click "Sync from Tally" to fetch.</div>}
                </div>
              )}
            </div>

            {/* PROFIT & LOSS PAGE */}
            <div className={`page ${currentPage === 'profit-loss' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>📈 Profit & Loss</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="date" value={plDateFrom} onChange={e => setPlDateFrom(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  <span style={{ color: 'var(--t3)' }}>to</span>
                  <input type="date" value={plDateTo} onChange={e => setPlDateTo(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  <button className="btn btn-p" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={fetchProfitLoss} disabled={plLoading}>
                    {plLoading ? '⟳ Loading...' : '📊 Fetch P&L'}
                  </button>
                </div>
              </div>

              {plLoading ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading from Tally...</div> : profitLoss ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* Income Column */}
                  <div className="s-card">
                    <div className="s-card-h" style={{ color: 'var(--green)' }}>Income</div>
                    <div className="s-card-b">
                      {profitLoss.income && (
                        <>
                          <div className="s-row"><div><div className="s-name">Sales Accounts</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--green)' }}>{formatCurrency(profitLoss.income.salesTotal)}</span></div>
                          {(profitLoss.income.salesAccounts || []).map((a, i) => (
                            <div key={i} className="s-row" style={{ paddingLeft: '16px' }}><div><div className="s-desc">{a.name}</div></div><span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{formatCurrency(Math.abs(a.amount))}</span></div>
                          ))}
                          <div className="s-row"><div><div className="s-name">Direct Incomes</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--green)' }}>{formatCurrency(profitLoss.income.directIncomesTotal)}</span></div>
                          <div className="s-row"><div><div className="s-name">Indirect Incomes</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--green)' }}>{formatCurrency(profitLoss.income.indirectIncomesTotal)}</span></div>
                          <div className="s-row" style={{ borderTop: '2px solid var(--border)', paddingTop: '8px', marginTop: '8px' }}><div><div className="s-name" style={{ fontSize: '14px', fontWeight: '700' }}>Total Income</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '700', fontSize: '16px', color: 'var(--green)' }}>{formatCurrency(profitLoss.income.total)}</span></div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Expenses Column */}
                  <div className="s-card">
                    <div className="s-card-h" style={{ color: 'var(--red)' }}>Expenses</div>
                    <div className="s-card-b">
                      {profitLoss.expenses && (
                        <>
                          <div className="s-row"><div><div className="s-name">Purchase Accounts</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--red)' }}>{formatCurrency(profitLoss.expenses.purchasesTotal)}</span></div>
                          {(profitLoss.expenses.purchaseAccounts || []).map((a, i) => (
                            <div key={i} className="s-row" style={{ paddingLeft: '16px' }}><div><div className="s-desc">{a.name}</div></div><span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{formatCurrency(Math.abs(a.amount))}</span></div>
                          ))}
                          <div className="s-row"><div><div className="s-name">Direct Expenses</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--red)' }}>{formatCurrency(profitLoss.expenses.directExpensesTotal)}</span></div>
                          <div className="s-row"><div><div className="s-name">Indirect Expenses</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--red)' }}>{formatCurrency(profitLoss.expenses.indirectExpensesTotal)}</span></div>
                          <div className="s-row" style={{ borderTop: '2px solid var(--border)', paddingTop: '8px', marginTop: '8px' }}><div><div className="s-name" style={{ fontSize: '14px', fontWeight: '700' }}>Total Expenses</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '700', fontSize: '16px', color: 'var(--red)' }}>{formatCurrency(profitLoss.expenses.total)}</span></div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Summary Row */}
                  <div className="s-card" style={{ gridColumn: '1 / -1' }}>
                    <div className="s-card-b" style={{ display: 'flex', justifyContent: 'space-around', padding: '16px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '12px', color: 'var(--t3)', marginBottom: '4px' }}>Gross Profit</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'var(--mono)', color: (profitLoss.grossProfit || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCurrency(profitLoss.grossProfit)}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '12px', color: 'var(--t3)', marginBottom: '4px' }}>Net Profit</div>
                        <div style={{ fontSize: '24px', fontWeight: '700', fontFamily: 'var(--mono)', color: (profitLoss.netProfit || 0) >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCurrency(profitLoss.netProfit)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Click "Fetch P&L" to load Profit & Loss from Tally. Leave dates blank for full period.</div>}
            </div>

            {/* PRICE LISTS PAGE */}
            <div className={`page ${currentPage === 'price-lists' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>🏷️ Price Lists</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select value={priceListLevel} onChange={e => { setPriceListLevel(e.target.value); }} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }}>
                    <option value="">All Levels</option>
                    {priceLevels.map(l => <option key={l} value={l}>{l}</option>)}
                  </select>
                  <button className="btn btn-o" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={fetchPriceLists}>Filter</button>
                  <button className="btn btn-p" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={handleSyncPriceLists} disabled={priceListSyncing}>
                    {priceListSyncing ? '⟳ Syncing...' : '🔄 Sync from Tally'}
                  </button>
                </div>
              </div>

              {priceListLoading ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading...</div> : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Stock Item</th><th>Price Level</th><th style={{ textAlign: 'right' }}>Rate</th></tr></thead>
                    <tbody>
                      {priceLists.map((p, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: '600' }}>{p.stock_item}</td>
                          <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: 'var(--blue-g)', color: 'var(--blue)' }}>{p.price_level}</span></td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '600' }}>{formatCurrency(p.rate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {priceLists.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--t3)' }}>No price lists. Click "Sync from Tally" to fetch.</div>}
                </div>
              )}
            </div>

            {/* BANK RECONCILIATION PAGE */}
            <div className={`page ${currentPage === 'bank-recon' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>🏦 Reconciliation</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <select value={reconType} onChange={e => setReconType(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }}>
                    <option value="rbb_tally">RBB ↔ Tally</option>
                    <option value="fonepay_rbb">Fonepay ↔ RBB</option>
                    <option value="fonepay_tally">Fonepay ↔ Tally</option>
                  </select>
                  <button className="btn btn-o" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={fetchRecon}>🔄 Refresh</button>
                </div>
              </div>

              {/* Auto-Match Controls */}
              <div className="s-card" style={{ marginBottom: '16px' }}>
                <div className="s-card-h">Auto-Match Settings</div>
                <div className="s-card-b" style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {(reconType === 'rbb_tally' || reconType === 'fonepay_tally') && (
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <label style={{ fontSize: '12px', color: 'var(--t3)' }}>Bank Ledger:</label>
                      <input type="text" value={reconBankLedger} onChange={e => setReconBankLedger(e.target.value)} placeholder="e.g. RBB Bank" style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px', width: '150px' }} />
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <label style={{ fontSize: '12px', color: 'var(--t3)' }}>From:</label>
                    <input type="date" value={reconDateFrom} onChange={e => setReconDateFrom(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <label style={{ fontSize: '12px', color: 'var(--t3)' }}>To:</label>
                    <input type="date" value={reconDateTo} onChange={e => setReconDateTo(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  </div>
                  <button className="btn btn-p" style={{ padding: '8px 18px', fontSize: '12px', fontWeight: '600' }} onClick={handleAutoMatch} disabled={reconMatching}>
                    {reconMatching ? '⟳ Matching...' : '⚡ Auto-Match'}
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {['summary', 'matched', 'unmatched-rbb', 'unmatched-fonepay'].map(t => (
                  <button key={t} className={`btn ${reconTab === t ? 'btn-p' : 'btn-o'}`} style={{ padding: '6px 14px', fontSize: '12px', textTransform: 'capitalize' }} onClick={() => setReconTab(t)}>{t.replace(/-/g, ' ')}</button>
                ))}
              </div>

              {reconLoading ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading...</div> : (
                <>
                  {reconTab === 'summary' && (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead><tr><th>Type</th><th>Status</th><th style={{ textAlign: 'right' }}>Count</th><th style={{ textAlign: 'right' }}>Source Amount</th><th style={{ textAlign: 'right' }}>Target Amount</th></tr></thead>
                        <tbody>
                          {reconSummary.map((s, i) => (
                            <tr key={i}>
                              <td>{s.recon_type}</td>
                              <td><span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', background: s.match_status === 'matched' ? 'var(--green-g)' : s.match_status === 'manual_match' ? 'var(--blue-g)' : 'var(--red-g)', color: s.match_status === 'matched' ? 'var(--green)' : s.match_status === 'manual_match' ? 'var(--blue)' : 'var(--red)' }}>{s.match_status}</span></td>
                              <td style={{ textAlign: 'right' }}>{s.count}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{formatCurrency(s.total_source_amount)}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{formatCurrency(s.total_target_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {reconSummary.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--t3)' }}>No reconciliation data yet. Use auto-match to start matching.</div>}
                    </div>
                  )}

                  {reconTab === 'matched' && (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead><tr><th>Source</th><th style={{ textAlign: 'right' }}>Amount</th><th>Target</th><th style={{ textAlign: 'right' }}>Amount</th><th>Confidence</th></tr></thead>
                        <tbody>
                          {reconMatches.filter(m => m.match_status === 'matched' || m.match_status === 'manual_match').map((m, i) => (
                            <tr key={i}>
                              <td style={{ fontSize: '12px' }}>{m.source_description}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '12px' }}>{formatCurrency(m.source_amount)}</td>
                              <td style={{ fontSize: '12px' }}>{m.target_description}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '12px' }}>{formatCurrency(m.target_amount)}</td>
                              <td><span style={{ fontSize: '11px', fontWeight: '600', color: m.match_confidence >= 0.9 ? 'var(--green)' : 'var(--yellow)' }}>{Math.round(m.match_confidence * 100)}%</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {reconTab === 'unmatched-rbb' && (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead><tr><th>Date</th><th>Description</th><th style={{ textAlign: 'right' }}>Credit</th><th style={{ textAlign: 'right' }}>Debit</th><th style={{ textAlign: 'right' }}>Balance</th></tr></thead>
                        <tbody>
                          {reconUnmatchedRBB.map((r, i) => (
                            <tr key={i}>
                              <td>{r.transaction_date}</td>
                              <td style={{ fontSize: '12px' }}>{r.description}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{r.credit > 0 ? formatCurrency(r.credit) : '-'}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)' }}>{r.debit > 0 ? formatCurrency(r.debit) : '-'}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{formatCurrency(r.balance)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {reconUnmatchedRBB.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--t3)' }}>All RBB transactions matched!</div>}
                    </div>
                  )}

                  {reconTab === 'unmatched-fonepay' && (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead><tr><th>Date</th><th>Description</th><th>Issuer</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                        <tbody>
                          {reconUnmatchedFP.map((f, i) => (
                            <tr key={i}>
                              <td>{f.transaction_date}</td>
                              <td style={{ fontSize: '12px' }}>{f.description}</td>
                              <td>{f.issuer_name || '-'}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--green)' }}>{formatCurrency(f.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {reconUnmatchedFP.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--t3)' }}>All Fonepay transactions matched!</div>}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* INVENTORY MOVEMENT PAGE */}
            <div className={`page ${currentPage === 'inventory-movement' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>📊 Inventory Movement</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="date" value={invDateFrom} onChange={e => setInvDateFrom(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  <span style={{ color: 'var(--t3)' }}>to</span>
                  <input type="date" value={invDateTo} onChange={e => setInvDateTo(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  <button className="btn btn-p" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={fetchInventoryMovement} disabled={invLoading}>
                    {invLoading ? '⟳ Loading...' : '📊 Fetch'}
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {['movements', 'summary'].map(t => (
                  <button key={t} className={`btn ${invTab === t ? 'btn-p' : 'btn-o'}`} style={{ padding: '6px 14px', fontSize: '12px', textTransform: 'capitalize' }} onClick={() => setInvTab(t)}>{t}</button>
                ))}
              </div>

              {invLoading ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading from Tally...</div> : (
                <>
                  {invTab === 'movements' && (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead><tr><th>Date</th><th>Type</th><th>Voucher#</th><th>Party</th><th>Item</th><th style={{ textAlign: 'right' }}>Qty</th><th>Direction</th><th style={{ textAlign: 'right' }}>Amount</th></tr></thead>
                        <tbody>
                          {invMovements.flatMap((m, mi) => (m.items || []).map((item, ii) => (
                            <tr key={`${mi}-${ii}`}>
                              <td>{m.date}</td>
                              <td><span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: m.voucherType === 'Sales' ? 'var(--green-g)' : 'var(--blue-g)', color: m.voucherType === 'Sales' ? 'var(--green)' : 'var(--blue)' }}>{m.voucherType}</span></td>
                              <td>{m.voucherNumber}</td>
                              <td style={{ fontSize: '12px' }}>{m.partyName}</td>
                              <td style={{ fontWeight: '600' }}>{item.stockItem}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{item.quantity}</td>
                              <td><span style={{ fontSize: '11px', fontWeight: '600', color: item.direction === 'in' ? 'var(--green)' : 'var(--red)' }}>{item.direction === 'in' ? '↓ IN' : '↑ OUT'}</span></td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '12px' }}>{formatCurrency(Math.abs(item.amount))}</td>
                            </tr>
                          )))}
                        </tbody>
                      </table>
                      {invMovements.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--t3)' }}>No movements found. Select a date range and click Fetch.</div>}
                    </div>
                  )}

                  {invTab === 'summary' && (
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead><tr><th>Stock Item</th><th style={{ textAlign: 'right' }}>Qty In</th><th style={{ textAlign: 'right' }}>Qty Out</th><th style={{ textAlign: 'right' }}>Net</th><th style={{ textAlign: 'right' }}>In Value</th><th style={{ textAlign: 'right' }}>Out Value</th></tr></thead>
                        <tbody>
                          {invSummary.map((s, i) => (
                            <tr key={i}>
                              <td style={{ fontWeight: '600' }}>{s.stockItem}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--green)' }}>{s.totalIn}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)' }}>{s.totalOut}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '600', color: s.netQuantity >= 0 ? 'var(--green)' : 'var(--red)' }}>{s.netQuantity}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '12px' }}>{formatCurrency(s.inValue)}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '12px' }}>{formatCurrency(s.outValue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {invSummary.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--t3)' }}>No data. Fetch inventory movements first.</div>}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* BALANCE SHEET PAGE */}
            <div className={`page ${currentPage === 'balance-sheet' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>📊 Balance Sheet</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="date" value={bsDateFrom} onChange={e => setBsDateFrom(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  <span style={{ color: 'var(--t3)' }}>to</span>
                  <input type="date" value={bsDateTo} onChange={e => setBsDateTo(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  <button className="btn btn-p" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={fetchBalanceSheet} disabled={bsLoading}>
                    {bsLoading ? '⟳ Loading...' : '📊 Fetch'}
                  </button>
                </div>
              </div>

              {bsLoading ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading from Tally...</div> : balanceSheet ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* Assets Column */}
                  <div className="s-card">
                    <div className="s-card-h" style={{ color: 'var(--blue)' }}>Assets</div>
                    <div className="s-card-b">
                      {balanceSheet.assets.fixed.length > 0 && (
                        <>
                          <div className="s-row" style={{ borderBottom: '1px solid var(--border)' }}><div><div className="s-name" style={{ fontWeight: '600' }}>Fixed Assets</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--blue)' }}>{formatCurrency(balanceSheet.assets.totalFixed)}</span></div>
                          {balanceSheet.assets.fixed.map((g, i) => (
                            <div key={i} className="s-row" style={{ paddingLeft: '16px' }}><div><div className="s-desc">{g.name}</div></div><span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{formatCurrency(Math.abs(g.closingBalance))}</span></div>
                          ))}
                        </>
                      )}
                      {balanceSheet.assets.current.length > 0 && (
                        <>
                          <div className="s-row" style={{ borderBottom: '1px solid var(--border)', marginTop: '8px' }}><div><div className="s-name" style={{ fontWeight: '600' }}>Current Assets</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--blue)' }}>{formatCurrency(balanceSheet.assets.totalCurrent)}</span></div>
                          {balanceSheet.assets.current.map((g, i) => (
                            <div key={i} className="s-row" style={{ paddingLeft: '16px' }}><div><div className="s-desc">{g.name}</div></div><span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{formatCurrency(Math.abs(g.closingBalance))}</span></div>
                          ))}
                        </>
                      )}
                      {balanceSheet.assets.investments.length > 0 && (
                        <>
                          <div className="s-row" style={{ borderBottom: '1px solid var(--border)', marginTop: '8px' }}><div><div className="s-name" style={{ fontWeight: '600' }}>Investments</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--blue)' }}>{formatCurrency(balanceSheet.assets.totalInvestments)}</span></div>
                          {balanceSheet.assets.investments.map((g, i) => (
                            <div key={i} className="s-row" style={{ paddingLeft: '16px' }}><div><div className="s-desc">{g.name}</div></div><span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{formatCurrency(Math.abs(g.closingBalance))}</span></div>
                          ))}
                        </>
                      )}
                      <div className="s-row" style={{ borderTop: '2px solid var(--border)', paddingTop: '8px', marginTop: '12px' }}>
                        <div><div className="s-name" style={{ fontSize: '14px', fontWeight: '700' }}>Total Assets</div></div>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: '700', fontSize: '16px', color: 'var(--blue)' }}>{formatCurrency(balanceSheet.assets.total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Liabilities + Equity Column */}
                  <div className="s-card">
                    <div className="s-card-h" style={{ color: 'var(--red)' }}>Liabilities & Equity</div>
                    <div className="s-card-b">
                      {balanceSheet.liabilities.current.length > 0 && (
                        <>
                          <div className="s-row" style={{ borderBottom: '1px solid var(--border)' }}><div><div className="s-name" style={{ fontWeight: '600' }}>Current Liabilities</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--red)' }}>{formatCurrency(balanceSheet.liabilities.totalCurrent)}</span></div>
                          {balanceSheet.liabilities.current.map((g, i) => (
                            <div key={i} className="s-row" style={{ paddingLeft: '16px' }}><div><div className="s-desc">{g.name}</div></div><span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{formatCurrency(Math.abs(g.closingBalance))}</span></div>
                          ))}
                        </>
                      )}
                      {balanceSheet.liabilities.longTerm.length > 0 && (
                        <>
                          <div className="s-row" style={{ borderBottom: '1px solid var(--border)', marginTop: '8px' }}><div><div className="s-name" style={{ fontWeight: '600' }}>Long-Term Liabilities</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--red)' }}>{formatCurrency(balanceSheet.liabilities.totalLongTerm)}</span></div>
                          {balanceSheet.liabilities.longTerm.map((g, i) => (
                            <div key={i} className="s-row" style={{ paddingLeft: '16px' }}><div><div className="s-desc">{g.name}</div></div><span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{formatCurrency(Math.abs(g.closingBalance))}</span></div>
                          ))}
                        </>
                      )}
                      <div className="s-row" style={{ borderTop: '1px solid var(--border)', paddingTop: '8px', marginTop: '8px' }}>
                        <div><div className="s-name" style={{ fontWeight: '600' }}>Total Liabilities</div></div>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--red)' }}>{formatCurrency(balanceSheet.liabilities.total)}</span>
                      </div>
                      {balanceSheet.equity.items.length > 0 && (
                        <>
                          <div className="s-row" style={{ borderBottom: '1px solid var(--border)', marginTop: '12px' }}><div><div className="s-name" style={{ fontWeight: '600', color: 'var(--purple)' }}>Equity</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--purple)' }}>{formatCurrency(balanceSheet.equity.total)}</span></div>
                          {balanceSheet.equity.items.map((g, i) => (
                            <div key={i} className="s-row" style={{ paddingLeft: '16px' }}><div><div className="s-desc">{g.name}</div></div><span style={{ fontFamily: 'var(--mono)', fontSize: '12px' }}>{formatCurrency(Math.abs(g.closingBalance))}</span></div>
                          ))}
                        </>
                      )}
                      <div className="s-row" style={{ borderTop: '2px solid var(--border)', paddingTop: '8px', marginTop: '12px' }}>
                        <div><div className="s-name" style={{ fontSize: '14px', fontWeight: '700' }}>Total Liabilities + Equity</div></div>
                        <span style={{ fontFamily: 'var(--mono)', fontWeight: '700', fontSize: '16px', color: 'var(--red)' }}>{formatCurrency(balanceSheet.liabilities.total + balanceSheet.equity.total)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Net Worth Summary */}
                  <div className="s-card" style={{ gridColumn: '1 / -1' }}>
                    <div className="s-card-b" style={{ display: 'flex', justifyContent: 'space-around', padding: '16px' }}>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '12px', color: 'var(--t3)', marginBottom: '4px' }}>Total Assets</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{formatCurrency(balanceSheet.assets.total)}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '12px', color: 'var(--t3)', marginBottom: '4px' }}>Total Liabilities</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'var(--mono)', color: 'var(--red)' }}>{formatCurrency(balanceSheet.liabilities.total)}</div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '12px', color: 'var(--t3)', marginBottom: '4px' }}>Net Worth</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'var(--mono)', color: balanceSheet.netWorth >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCurrency(balanceSheet.netWorth)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--t3)' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>📊</div>
                  <div style={{ fontSize: '16px', marginBottom: '8px' }}>Balance Sheet</div>
                  <div style={{ fontSize: '13px' }}>Select date range and click Fetch to load from Tally</div>
                </div>
              )}
            </div>

            {/* TRIAL BALANCE PAGE */}
            <div className={`page ${currentPage === 'trial-balance' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>⚖️ Trial Balance</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="date" value={tbDateFrom} onChange={e => setTbDateFrom(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  <span style={{ color: 'var(--t3)' }}>to</span>
                  <input type="date" value={tbDateTo} onChange={e => setTbDateTo(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  <button className="btn btn-p" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={fetchTrialBalance} disabled={tbLoading}>
                    {tbLoading ? '⟳ Loading...' : '⚖️ Fetch'}
                  </button>
                </div>
              </div>

              {tbLoading ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading from Tally...</div> : trialBalance && trialBalance.ledgers ? (
                <>
                  {/* Summary Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div className="s-card"><div className="s-card-b" style={{ textAlign: 'center', padding: '12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Total Debit</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{formatCurrency(trialBalance.totalDebit)}</div>
                    </div></div>
                    <div className="s-card"><div className="s-card-b" style={{ textAlign: 'center', padding: '12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Total Credit</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--mono)', color: 'var(--red)' }}>{formatCurrency(trialBalance.totalCredit)}</div>
                    </div></div>
                    <div className="s-card"><div className="s-card-b" style={{ textAlign: 'center', padding: '12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Difference</div>
                      <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--mono)', color: trialBalance.isBalanced ? 'var(--green)' : 'var(--red)' }}>
                        {trialBalance.isBalanced ? '✓ Balanced' : formatCurrency(trialBalance.difference)}
                      </div>
                    </div></div>
                  </div>

                  {/* Search */}
                  <div style={{ marginBottom: '12px' }}>
                    <input placeholder="Search ledgers..." value={tbSearch} onChange={e => setTbSearch(e.target.value)} style={{ width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '13px' }} />
                  </div>

                  {/* Table */}
                  <div style={{ overflow: 'auto', maxHeight: '60vh' }}>
                    <table className="rush-table">
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left' }}>Ledger Name</th>
                          <th style={{ textAlign: 'left' }}>Group</th>
                          <th style={{ textAlign: 'right' }}>Debit (Dr)</th>
                          <th style={{ textAlign: 'right' }}>Credit (Cr)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trialBalance.ledgers
                          .filter(l => !tbSearch || l.name.toLowerCase().includes(tbSearch.toLowerCase()) || l.parent.toLowerCase().includes(tbSearch.toLowerCase()))
                          .map((l, i) => (
                          <tr key={i}>
                            <td style={{ fontSize: '13px' }}>{l.name}</td>
                            <td style={{ fontSize: '12px', color: 'var(--t3)' }}>{l.parent}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '12px', color: l.debit > 0 ? 'var(--blue)' : 'var(--t3)' }}>{l.debit > 0 ? formatCurrency(l.debit) : '-'}</td>
                            <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: '12px', color: l.credit > 0 ? 'var(--red)' : 'var(--t3)' }}>{l.credit > 0 ? formatCurrency(l.credit) : '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ fontWeight: '700', borderTop: '2px solid var(--border)' }}>
                          <td colSpan="2">Total ({trialBalance.count} ledgers)</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{formatCurrency(trialBalance.totalDebit)}</td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--red)' }}>{formatCurrency(trialBalance.totalCredit)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--t3)' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚖️</div>
                  <div style={{ fontSize: '16px', marginBottom: '8px' }}>Trial Balance</div>
                  <div style={{ fontSize: '13px' }}>Select date range and click Fetch to load all ledgers from Tally</div>
                </div>
              )}
            </div>

            {/* CASH FLOW PAGE */}
            <div className={`page ${currentPage === 'cash-flow' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>💵 Cash Flow Statement</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="date" value={cfDateFrom} onChange={e => setCfDateFrom(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  <span style={{ color: 'var(--t3)' }}>to</span>
                  <input type="date" value={cfDateTo} onChange={e => setCfDateTo(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  <button className="btn btn-p" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={fetchCashFlow} disabled={cfLoading}>
                    {cfLoading ? '⟳ Loading...' : '💵 Fetch'}
                  </button>
                </div>
              </div>

              {cfLoading ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading from Tally...</div> : cashFlow ? (
                <>
                  {/* Summary Cards */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                    <div className="s-card"><div className="s-card-b" style={{ textAlign: 'center', padding: '12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Opening Cash</div>
                      <div style={{ fontSize: '16px', fontWeight: '700', fontFamily: 'var(--mono)', color: 'var(--t1)' }}>{formatCurrency(cashFlow.openingCash)}</div>
                    </div></div>
                    <div className="s-card"><div className="s-card-b" style={{ textAlign: 'center', padding: '12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Net Cash Flow</div>
                      <div style={{ fontSize: '16px', fontWeight: '700', fontFamily: 'var(--mono)', color: cashFlow.netCashFlow >= 0 ? 'var(--green)' : 'var(--red)' }}>{cashFlow.netCashFlow >= 0 ? '+' : ''}{formatCurrency(cashFlow.netCashFlow)}</div>
                    </div></div>
                    <div className="s-card"><div className="s-card-b" style={{ textAlign: 'center', padding: '12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Closing Cash</div>
                      <div style={{ fontSize: '16px', fontWeight: '700', fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{formatCurrency(cashFlow.closingCash)}</div>
                    </div></div>
                    <div className="s-card"><div className="s-card-b" style={{ textAlign: 'center', padding: '12px' }}>
                      <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Operating</div>
                      <div style={{ fontSize: '16px', fontWeight: '700', fontFamily: 'var(--mono)', color: cashFlow.operating.net >= 0 ? 'var(--green)' : 'var(--red)' }}>{formatCurrency(cashFlow.operating.net)}</div>
                    </div></div>
                  </div>

                  {/* Three Activity Sections */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                    {[
                      { title: 'Operating Activities', data: cashFlow.operating, color: 'var(--green)' },
                      { title: 'Investing Activities', data: cashFlow.investing, color: 'var(--orange)' },
                      { title: 'Financing Activities', data: cashFlow.financing, color: 'var(--purple)' }
                    ].map((section, idx) => (
                      <div key={idx} className="s-card">
                        <div className="s-card-h" style={{ color: section.color }}>{section.title}</div>
                        <div className="s-card-b">
                          <div className="s-row"><div><div className="s-name" style={{ color: 'var(--green)' }}>Inflows</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--green)' }}>{formatCurrency(section.data.totalInflow)}</span></div>
                          {(section.data.inflows || []).slice(0, 5).map((e, i) => (
                            <div key={i} className="s-row" style={{ paddingLeft: '12px' }}><div><div className="s-desc">{e.partyName || e.voucherType} {e.voucherNumber}</div></div><span style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{formatCurrency(e.amount)}</span></div>
                          ))}
                          {(section.data.inflows || []).length > 5 && <div style={{ paddingLeft: '12px', fontSize: '11px', color: 'var(--t3)' }}>+{section.data.inflows.length - 5} more...</div>}
                          <div className="s-row" style={{ marginTop: '8px' }}><div><div className="s-name" style={{ color: 'var(--red)' }}>Outflows</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--red)' }}>{formatCurrency(section.data.totalOutflow)}</span></div>
                          {(section.data.outflows || []).slice(0, 5).map((e, i) => (
                            <div key={i} className="s-row" style={{ paddingLeft: '12px' }}><div><div className="s-desc">{e.partyName || e.voucherType} {e.voucherNumber}</div></div><span style={{ fontFamily: 'var(--mono)', fontSize: '11px' }}>{formatCurrency(e.amount)}</span></div>
                          ))}
                          {(section.data.outflows || []).length > 5 && <div style={{ paddingLeft: '12px', fontSize: '11px', color: 'var(--t3)' }}>+{section.data.outflows.length - 5} more...</div>}
                          <div className="s-row" style={{ borderTop: '2px solid var(--border)', paddingTop: '8px', marginTop: '8px' }}><div><div className="s-name" style={{ fontWeight: '700' }}>Net</div></div><span style={{ fontFamily: 'var(--mono)', fontWeight: '700', color: section.data.net >= 0 ? 'var(--green)' : 'var(--red)' }}>{section.data.net >= 0 ? '+' : ''}{formatCurrency(section.data.net)}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--t3)' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>💵</div>
                  <div style={{ fontSize: '16px', marginBottom: '8px' }}>Cash Flow Statement</div>
                  <div style={{ fontSize: '13px' }}>Select date range and click Fetch to analyze cash movements from Tally</div>
                </div>
              )}
            </div>

            {/* RATIO ANALYSIS PAGE */}
            <div className={`page ${currentPage === 'ratio-analysis' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>📉 Ratio Analysis</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input type="date" value={ratiosDateFrom} onChange={e => setRatiosDateFrom(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  <span style={{ color: 'var(--t3)' }}>to</span>
                  <input type="date" value={ratiosDateTo} onChange={e => setRatiosDateTo(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  <button className="btn btn-p" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={fetchRatios} disabled={ratiosLoading}>
                    {ratiosLoading ? '⟳ Loading...' : '📉 Analyze'}
                  </button>
                </div>
              </div>

              {ratiosLoading ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Computing ratios from Tally...</div> : ratios && ratios.liquidity ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  {/* Liquidity Ratios */}
                  <div className="s-card">
                    <div className="s-card-h" style={{ color: 'var(--blue)' }}>Liquidity Ratios</div>
                    <div className="s-card-b">
                      {Object.entries(ratios.liquidity).map(([key, r]) => (
                        <div key={key} className="s-row">
                          <div>
                            <div className="s-name">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</div>
                            <div className="s-desc">{r.formula} (Good: {r.good})</div>
                          </div>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: '700', fontSize: '16px', color: parseFloat(r.value) >= parseFloat(r.good?.replace(/[><% ]/g, '')) ? 'var(--green)' : 'var(--amber)' }}>
                            {r.value?.toFixed(2)}{r.unit || ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Leverage Ratios */}
                  <div className="s-card">
                    <div className="s-card-h" style={{ color: 'var(--orange)' }}>Leverage Ratios</div>
                    <div className="s-card-b">
                      {Object.entries(ratios.leverage).map(([key, r]) => (
                        <div key={key} className="s-row">
                          <div>
                            <div className="s-name">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</div>
                            <div className="s-desc">{r.formula} (Good: {r.good})</div>
                          </div>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: '700', fontSize: '16px', color: parseFloat(r.value) <= parseFloat(r.good?.replace(/[><% ]/g, '')) ? 'var(--green)' : 'var(--amber)' }}>
                            {r.value?.toFixed(2)}{r.unit || ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Profitability Ratios */}
                  <div className="s-card">
                    <div className="s-card-h" style={{ color: 'var(--green)' }}>Profitability Ratios</div>
                    <div className="s-card-b">
                      {Object.entries(ratios.profitability).map(([key, r]) => (
                        <div key={key} className="s-row">
                          <div>
                            <div className="s-name">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</div>
                            <div className="s-desc">{r.formula} (Good: {r.good})</div>
                          </div>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: '700', fontSize: '16px', color: parseFloat(r.value) >= parseFloat(r.good?.replace(/[><% ]/g, '')) ? 'var(--green)' : 'var(--amber)' }}>
                            {r.value?.toFixed(2)}{r.unit || ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Efficiency Ratios */}
                  <div className="s-card">
                    <div className="s-card-h" style={{ color: 'var(--purple)' }}>Efficiency Ratios</div>
                    <div className="s-card-b">
                      {Object.entries(ratios.efficiency).map(([key, r]) => (
                        <div key={key} className="s-row">
                          <div>
                            <div className="s-name">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</div>
                            <div className="s-desc">{r.formula} (Good: {r.good})</div>
                          </div>
                          <span style={{ fontFamily: 'var(--mono)', fontWeight: '700', fontSize: '16px', color: parseFloat(r.value) >= parseFloat(r.good?.replace(/[><% ]/g, '')) ? 'var(--green)' : 'var(--amber)' }}>
                            {r.value?.toFixed(2)}{r.unit || ''}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--t3)' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>📉</div>
                  <div style={{ fontSize: '16px', marginBottom: '8px' }}>Ratio Analysis</div>
                  <div style={{ fontSize: '13px' }}>Select date range and click Analyze to compute financial ratios from Tally</div>
                </div>
              )}
            </div>

            {/* COLUMNAR DASHBOARD PAGE */}
            <div className={`page ${currentPage === 'columnar' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>Columnar Dashboard</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="date" value={colDate} onChange={e => setColDate(e.target.value)} style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--t1)' }} />
                  <input type="text" placeholder="Search party..." value={colSearch} onChange={e => setColSearch(e.target.value)} style={{ padding: '6px 10px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '6px', background: 'var(--card)', color: 'var(--t1)', width: '160px' }} />
                  <button onClick={fetchColumnar} style={{ padding: '6px 14px', fontSize: '12px', background: 'var(--blue)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
                    {colLoading ? 'Loading...' : 'Load'}
                  </button>
                </div>
              </div>

              {/* Summary Cards */}
              {colBills.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                  {[
                    { label: 'Parties', value: colBills.length, color: 'var(--blue)' },
                    { label: 'Bill Amount', value: formatCurrency(colTotals.bill_amount), color: 'var(--t1)' },
                    { label: 'Cash', value: formatCurrency(colTotals.cash), color: '#2e7d32' },
                    { label: 'QR', value: formatCurrency(colTotals.qr), color: '#1565c0' },
                    { label: 'Cheque', value: formatCurrency(colTotals.cheque), color: '#6a1b9a' },
                    { label: 'Discount', value: formatCurrency(colTotals.discount), color: '#e65100' },
                    { label: 'eSewa', value: formatCurrency(colTotals.esewa), color: '#00695c' },
                    { label: 'Bank Dep.', value: formatCurrency(colTotals.bank_deposit), color: '#37474f' },
                    { label: 'Balance', value: formatCurrency(colTotals.balance), color: colTotals.balance > 0 ? 'var(--red)' : 'var(--green)' }
                  ].map(c => (
                    <div key={c.label} style={{ background: 'var(--card)', borderRadius: '8px', padding: '10px 12px', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '10px', color: 'var(--t3)', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.label}</div>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: c.color, fontFamily: 'var(--mono)' }}>{c.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Voucher Type Counts */}
              {colVoucherCounts.total > 0 && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ background: 'var(--card)', borderRadius: '8px', padding: '8px 14px', border: '2px solid var(--blue)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--t3)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Vouchers</span>
                    <span style={{ fontSize: '16px', fontWeight: '800', color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{colVoucherCounts.total}</span>
                  </div>
                  {[
                    { label: 'Sales', count: colVoucherCounts.sales, color: '#1565c0' },
                    { label: 'Credit Sales', count: colVoucherCounts.credit_sales, color: '#6a1b9a' },
                    { label: 'A Pto Bill', count: colVoucherCounts.apto, color: '#00695c' },
                    { label: 'Pending', count: colVoucherCounts.pending, color: '#e65100' },
                    { label: 'Debit Note', count: colVoucherCounts.debit_note, color: '#c62828' },
                    { label: 'Receipt', count: colVoucherCounts.receipt, color: '#2e7d32' },
                    { label: 'Credit Note', count: colVoucherCounts.credit_note, color: '#37474f' }
                  ].filter(t => t.count > 0).map(t => (
                    <div key={t.label} style={{ background: 'var(--card)', borderRadius: '6px', padding: '6px 12px', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '10px', color: 'var(--t3)' }}>{t.label}</span>
                      <span style={{ fontSize: '14px', fontWeight: '700', color: t.color, fontFamily: 'var(--mono)' }}>{t.count}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Table */}
              {colLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading...</div>
              ) : colBills.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>
                  <div style={{ fontSize: '28px', marginBottom: '8px' }}>📋</div>
                  <div>Select a date range and click Load</div>
                </div>
              ) : (
                <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>#</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Date</th>
                        <th style={{ padding: '8px 10px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase' }}>Party Name</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--t3)', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Bill Amt</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#2e7d32', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Cash</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#1565c0', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>QR</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#6a1b9a', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Cheque</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#e65100', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Discount</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#00695c', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>eSewa</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: '#37474f', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Bank Dep.</th>
                        <th style={{ padding: '8px 10px', textAlign: 'right', color: 'var(--t3)', fontWeight: '600', fontSize: '10px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {colBills.map((row, i) => {
                        const isZeroBal = Math.abs(row.balance) < 1;
                        const isExpanded = expandedColParty === row.party_name;
                        const receiptTypes = ['Bank Receipt','Counter Receipt','Receipt','Dashboard Receipt','Credit Note'];
                        return (
                          <React.Fragment key={row.party_name}>
                            <tr onClick={() => fetchColDetails(row.party_name)} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: row.is_critical ? 'rgba(211,47,47,0.08)' : row.is_mismatch ? 'rgba(230,81,0,0.06)' : isZeroBal ? 'rgba(46,125,50,0.04)' : (row.balance > 0 ? 'rgba(211,47,47,0.04)' : 'var(--card)') }}>
                              <td style={{ padding: '6px 10px', color: 'var(--t3)', fontSize: '11px' }}>{i + 1}</td>
                              <td style={{ padding: '6px 10px', color: 'var(--t3)', fontSize: '11px', whiteSpace: 'nowrap' }}>{formatDate(colDate.replace(/-/g, ''))}</td>
                              <td style={{ padding: '6px 10px', fontWeight: '600' }}>
                                <span style={{ marginRight: '4px', fontSize: '10px', color: 'var(--t3)' }}>{isExpanded ? '▼' : '▶'}</span>
                                {row.party_name}
                                <span style={{ marginLeft: '6px', fontSize: '9px', color: 'var(--t3)' }}>
                                  {row.bill_count > 0 && `${row.bill_count} bill${row.bill_count > 1 ? 's' : ''}`}
                                  {row.pending_count > 0 && <span style={{ color: 'var(--amber)' }}>{row.bill_count > 0 ? ' + ' : ''}{row.pending_count} pending</span>}
                                  {row.receipt_count > 0 && ` / ${row.receipt_count} rcpt`}
                                </span>
                                {row.is_critical && (
                                  <span style={{ marginLeft: '6px', background: '#d32f2f', color: '#fff', padding: '1px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: '700' }} title={row.critical_reason}>
                                    DUPLICATE: {row.critical_reason}
                                  </span>
                                )}
                                {row.is_mismatch && (
                                  <span style={{ marginLeft: '6px', background: '#e65100', color: '#fff', padding: '1px 6px', borderRadius: '3px', fontSize: '9px', fontWeight: '700' }}>
                                    ENTRIES MISMATCH
                                  </span>
                                )}
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '700', fontFamily: 'var(--mono)' }}>
                                {formatCurrency(row.bill_amount)}
                                {row.pending_amount > 0 && (
                                  <div style={{ fontSize: '9px', color: 'var(--amber)', fontWeight: '600' }}>+{formatCurrency(row.pending_amount)} pending</div>
                                )}
                              </td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: row.cash > 0 ? '#2e7d32' : 'var(--t4)' }}>{row.cash > 0 ? formatCurrency(row.cash) : ''}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: row.qr > 0 ? '#1565c0' : 'var(--t4)' }}>{row.qr > 0 ? formatCurrency(row.qr) : ''}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: row.cheque > 0 ? '#6a1b9a' : 'var(--t4)' }}>{row.cheque > 0 ? formatCurrency(row.cheque) : ''}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: row.discount > 0 ? '#e65100' : 'var(--t4)' }}>{row.discount > 0 ? formatCurrency(row.discount) : ''}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: row.esewa > 0 ? '#00695c' : 'var(--t4)' }}>{row.esewa > 0 ? formatCurrency(row.esewa) : ''}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: row.bank_deposit > 0 ? '#37474f' : 'var(--t4)' }}>{row.bank_deposit > 0 ? formatCurrency(row.bank_deposit) : ''}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontWeight: '700', fontFamily: 'var(--mono)', color: isZeroBal ? '#2e7d32' : 'var(--red)' }}>
                                {isZeroBal ? (
                                  <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: '4px', fontSize: '10px' }}>ZERO</span>
                                ) : formatCurrency(row.balance)}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={11} style={{ padding: 0, border: 'none' }}>
                                  <div style={{ background: 'var(--bg)', borderLeft: '3px solid var(--blue)', margin: '0 0 0 20px', padding: '8px 12px' }}>
                                    {colDetailsLoading ? (
                                      <div style={{ padding: '8px', color: 'var(--t3)', fontSize: '11px' }}>Loading...</div>
                                    ) : (
                                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                        <thead>
                                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                            <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--t3)', fontSize: '9px', textTransform: 'uppercase' }}>Type</th>
                                            <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--t3)', fontSize: '9px', textTransform: 'uppercase' }}>Vch No</th>
                                            <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--t3)', fontSize: '9px', textTransform: 'uppercase' }}>Master ID</th>
                                            <th style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--t3)', fontSize: '9px', textTransform: 'uppercase' }}>Amount</th>
                                            <th style={{ padding: '4px 8px', textAlign: 'right', color: '#2e7d32', fontSize: '9px', textTransform: 'uppercase' }}>Cash</th>
                                            <th style={{ padding: '4px 8px', textAlign: 'right', color: '#1565c0', fontSize: '9px', textTransform: 'uppercase' }}>QR</th>
                                            <th style={{ padding: '4px 8px', textAlign: 'right', color: '#6a1b9a', fontSize: '9px', textTransform: 'uppercase' }}>Cheque</th>
                                            <th style={{ padding: '4px 8px', textAlign: 'right', color: '#e65100', fontSize: '9px', textTransform: 'uppercase' }}>Discount</th>
                                            <th style={{ padding: '4px 8px', textAlign: 'right', color: '#00695c', fontSize: '9px', textTransform: 'uppercase' }}>eSewa</th>
                                            <th style={{ padding: '4px 8px', textAlign: 'right', color: '#37474f', fontSize: '9px', textTransform: 'uppercase' }}>Bank Dep.</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {colPartyDetails.map(v => {
                                            const isReceipt = receiptTypes.includes(v.voucher_type);
                                            return (
                                              <tr key={v.id} style={{ borderBottom: '1px solid var(--border)', borderLeft: `3px solid ${isReceipt ? '#e65100' : '#1565c0'}` }}>
                                                <td style={{ padding: '4px 8px', fontWeight: '600', color: isReceipt ? '#e65100' : '#1565c0' }}>{v.voucher_type}</td>
                                                <td style={{ padding: '4px 8px', color: 'var(--t3)' }}>{v.voucher_number || '-'}</td>
                                                <td style={{ padding: '4px 8px', color: 'var(--t3)', fontFamily: 'var(--mono)', fontSize: '10px' }}>{v.tally_master_id || '-'}</td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '600' }}>{formatCurrency(Math.abs(v.amount))}</td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: '#2e7d32' }}>{v.pay_cash > 0 ? formatCurrency(v.pay_cash) : ''}</td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: '#1565c0' }}>{v.pay_qr > 0 ? formatCurrency(v.pay_qr) : ''}</td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: '#6a1b9a' }}>{v.pay_cheque > 0 ? formatCurrency(v.pay_cheque) : ''}</td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: '#e65100' }}>{v.pay_discount > 0 ? formatCurrency(v.pay_discount) : ''}</td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: '#00695c' }}>{v.pay_esewa > 0 ? formatCurrency(v.pay_esewa) : ''}</td>
                                                <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: '#37474f' }}>{v.pay_bank_deposit > 0 ? formatCurrency(v.pay_bank_deposit) : ''}</td>
                                              </tr>
                                            );
                                          })}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)', fontWeight: '700' }}>
                        <td colSpan={3} style={{ padding: '8px 10px', fontSize: '11px', textTransform: 'uppercase', color: 'var(--t3)' }}>Totals ({colBills.length} parties)</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{formatCurrency(colTotals.bill_amount)}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: '#2e7d32' }}>{colTotals.cash > 0 ? formatCurrency(colTotals.cash) : ''}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: '#1565c0' }}>{colTotals.qr > 0 ? formatCurrency(colTotals.qr) : ''}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: '#6a1b9a' }}>{colTotals.cheque > 0 ? formatCurrency(colTotals.cheque) : ''}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: '#e65100' }}>{colTotals.discount > 0 ? formatCurrency(colTotals.discount) : ''}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: '#00695c' }}>{colTotals.esewa > 0 ? formatCurrency(colTotals.esewa) : ''}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: '#37474f' }}>{colTotals.bank_deposit > 0 ? formatCurrency(colTotals.bank_deposit) : ''}</td>
                        <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: colTotals.balance > 0 ? 'var(--red)' : '#2e7d32' }}>{formatCurrency(colTotals.balance)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* Pending Bills Section */}
              {colPendingBills.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <div className="sec-head" style={{ marginBottom: '10px' }}>
                    <div className="sec-title" style={{ fontSize: '15px', color: 'var(--amber)' }}>Pending Sales Bills ({colPendingBills.length})</div>
                    <span style={{ fontSize: '12px', color: 'var(--amber)', fontWeight: '700' }}>Total: {formatCurrency(colPendingTotal)}</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="v-table" style={{ width: '100%', fontSize: '12px' }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>#</th>
                          <th style={{ padding: '8px 10px', textAlign: 'left' }}>Party Name</th>
                          <th style={{ padding: '8px 10px', textAlign: 'right' }}>Pending Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {colPendingBills.map((row, i) => (
                          <tr key={row.party_name} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--card)' : 'var(--bg)', borderLeft: '3px solid var(--amber)' }}>
                            <td style={{ padding: '8px 10px', color: 'var(--t3)' }}>{i + 1}</td>
                            <td style={{ padding: '8px 10px', fontWeight: '600' }}>{row.party_name}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--amber)', fontWeight: '700' }}>{formatCurrency(row.pending_amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ fontWeight: '700', borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                          <td colSpan="2" style={{ padding: '8px 10px' }}>Total ({colPendingBills.length} pending)</td>
                          <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--amber)' }}>{formatCurrency(colPendingTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Alterations Section - changes made after voucher date OR changes happening on this date */}
              {colAlterations.length > 0 && (
                <div style={{ marginTop: '20px' }}>
                  <div className="sec-head" style={{ marginBottom: '10px' }}>
                    <div className="sec-title" style={{ fontSize: '15px', color: '#c62828' }}>Audit Trail ({colAlterations.length} changes)</div>
                    <span style={{ fontSize: '11px', color: 'var(--t3)' }}>Post-date edits to this date's vouchers & changes made on this date to other dates' vouchers</span>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="v-table" style={{ width: '100%', fontSize: '11px' }}>
                      <thead>
                        <tr>
                          {[
                            { key: 'party_name', label: 'Party' },
                            { key: 'voucher_type', label: 'Type' },
                            { key: 'voucher_date', label: 'Vchr Date' },
                            { key: 'field_name', label: 'Field Changed' },
                            { key: 'old_value', label: 'Old Value' },
                            { key: 'new_value', label: 'New Value' },
                            { key: 'old_alter_id', label: 'Alter ID' },
                            { key: 'changed_at', label: 'Changed At' }
                          ].map(col => (
                            <th key={col.key} style={{ padding: '6px 8px', textAlign: 'left', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                              onClick={() => setAltSort(prev => ({ key: col.key, dir: prev.key === col.key && prev.dir === 'asc' ? 'desc' : 'asc' }))}>
                              {col.label} {altSort.key === col.key ? (altSort.dir === 'asc' ? '▲' : '▼') : ''}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...colAlterations].sort((a, b) => {
                          const k = altSort.key;
                          let va = a[k], vb = b[k];
                          if (k === 'old_alter_id' || k === 'new_alter_id') { va = Number(va) || 0; vb = Number(vb) || 0; }
                          else { va = String(va || '').toLowerCase(); vb = String(vb || '').toLowerCase(); }
                          if (va < vb) return altSort.dir === 'asc' ? -1 : 1;
                          if (va > vb) return altSort.dir === 'asc' ? 1 : -1;
                          return 0;
                        }).map((alt, i) => {
                          const fieldLabels = { voucher_type: 'Voucher Type', amount: 'Amount', udf_payment_total: 'UDF/SFL Total', party_name: 'Party Name', voucher_date: 'Voucher Date', voucher_number: 'Voucher No.', narration: 'Narration', is_deleted: 'Deleted', status: 'Status' };
                          const fieldColors = { voucher_type: '#c62828', amount: '#e65100', udf_payment_total: '#e65100', party_name: '#6a1b9a', voucher_date: '#1565c0', voucher_number: '#37474f', narration: '#546e7a', is_deleted: '#b71c1c', status: '#b71c1c' };
                          const isChangedToday = alt.alteration_type === 'changed_today';
                          const vDate = alt.voucher_date ? alt.voucher_date.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : '';
                          const isExpanded = altExpandedId === `${alt.master_id}-${i}`;
                          return (
                            <React.Fragment key={`${alt.master_id}-${alt.field_name}-${i}`}>
                            <tr style={{ borderBottom: '1px solid var(--border)', background: isExpanded ? 'var(--blue-g)' : i % 2 === 0 ? 'var(--card)' : 'var(--bg)', borderLeft: `3px solid ${isChangedToday ? '#ff6f00' : (fieldColors[alt.field_name] || '#c62828')}`, cursor: 'pointer' }}
                              onClick={async () => {
                                const rowId = `${alt.master_id}-${i}`;
                                if (altExpandedId === rowId) { setAltExpandedId(null); setAltChangeLog([]); return; }
                                setAltExpandedId(rowId);
                                setAltChangeLoading(true);
                                try {
                                  const res = await getVoucherChangeLog(alt.master_id);
                                  setAltChangeLog(res.data?.changes || []);
                                } catch (e) { setAltChangeLog([]); }
                                finally { setAltChangeLoading(false); }
                              }}>
                              <td style={{ padding: '6px 8px', fontWeight: '600' }}>
                                {alt.party_name}
                                {isChangedToday && (
                                  <span style={{ display: 'block', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: '#fff3e0', color: '#e65100', marginTop: '2px', width: 'fit-content' }}>Changed Today</span>
                                )}
                                {!isChangedToday && (
                                  <span style={{ display: 'block', fontSize: '9px', padding: '1px 4px', borderRadius: '3px', background: '#fce4ec', color: '#c62828', marginTop: '2px', width: 'fit-content' }}>Edited Later</span>
                                )}
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: alt.voucher_type?.includes('Sales') ? 'var(--blue-g)' : alt.voucher_type?.includes('Receipt') ? 'var(--green-g)' : 'var(--bg)', color: alt.voucher_type?.includes('Sales') ? 'var(--blue)' : alt.voucher_type?.includes('Receipt') ? 'var(--green)' : 'var(--t2)' }}>
                                  {alt.voucher_type}
                                </span>
                              </td>
                              <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', fontSize: '10px', color: isChangedToday ? '#e65100' : 'var(--t3)' }}>
                                {vDate}
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <span style={{ fontSize: '10px', fontWeight: '700', color: fieldColors[alt.field_name] || 'var(--t2)', background: 'rgba(0,0,0,0.04)', padding: '1px 5px', borderRadius: '3px' }}>
                                  {fieldLabels[alt.field_name] || alt.field_name}
                                </span>
                              </td>
                              <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', color: 'var(--red)', textDecoration: 'line-through', opacity: 0.7 }}>
                                {alt.field_name === 'amount' || alt.field_name === 'udf_payment_total' ? formatCurrency(Math.abs(parseFloat(alt.old_value) || 0)) : (alt.old_value || '-')}
                              </td>
                              <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', color: 'var(--green)', fontWeight: '600' }}>
                                {alt.field_name === 'amount' || alt.field_name === 'udf_payment_total' ? formatCurrency(Math.abs(parseFloat(alt.new_value) || 0)) : (alt.new_value || '-')}
                              </td>
                              <td style={{ padding: '6px 8px', fontFamily: 'var(--mono)', fontSize: '10px', color: 'var(--t3)' }}>
                                {alt.old_alter_id} → {alt.new_alter_id}
                              </td>
                              <td style={{ padding: '6px 8px', fontSize: '10px', color: 'var(--t3)' }}>
                                {new Date(alt.changed_at + 'Z').toLocaleString('en-US', { timeZone: 'Asia/Kathmandu', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan="8" style={{ padding: 0, border: 'none' }}>
                                  <div style={{ background: 'var(--bg)', borderLeft: '3px solid var(--blue)', padding: '12px 16px', margin: '0 8px 8px 8px', borderRadius: '0 8px 8px 0' }}>
                                    <div style={{ fontSize: '12px', fontWeight: '700', color: 'var(--blue)', marginBottom: '8px' }}>
                                      Alteration History — {alt.party_name} (Master ID: {alt.master_id})
                                    </div>
                                    {altChangeLoading ? (
                                      <div style={{ color: 'var(--t3)', fontSize: '12px' }}>Loading changes...</div>
                                    ) : altChangeLog.length === 0 ? (
                                      <div style={{ color: 'var(--t3)', fontSize: '12px' }}>No field changes recorded for this voucher.</div>
                                    ) : (
                                      <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                                        <thead>
                                          <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                            <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--t2)', fontWeight: '600' }}>Field</th>
                                            <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--t2)', fontWeight: '600' }}>Old Value</th>
                                            <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--t2)', fontWeight: '600' }}>New Value</th>
                                            <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--t2)', fontWeight: '600' }}>Alter ID</th>
                                            <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--t2)', fontWeight: '600' }}>Changed At</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {altChangeLog.map((c, ci) => (
                                            <tr key={ci} style={{ borderBottom: '1px solid var(--border)' }}>
                                              <td style={{ padding: '4px 8px', fontWeight: '600', color: fieldColors[c.field_name] || 'var(--orange)' }}>{fieldLabels[c.field_name] || c.field_name}</td>
                                              <td style={{ padding: '4px 8px', color: 'var(--red)', fontFamily: 'var(--mono)', textDecoration: 'line-through', opacity: 0.7 }}>
                                                {c.field_name === 'amount' || c.field_name === 'udf_payment_total' ? formatCurrency(Math.abs(parseFloat(c.old_value) || 0)) : (c.old_value || '-')}
                                              </td>
                                              <td style={{ padding: '4px 8px', color: 'var(--green)', fontFamily: 'var(--mono)', fontWeight: '600' }}>
                                                {c.field_name === 'amount' || c.field_name === 'udf_payment_total' ? formatCurrency(Math.abs(parseFloat(c.new_value) || 0)) : (c.new_value || '-')}
                                              </td>
                                              <td style={{ padding: '4px 8px', color: 'var(--t3)', fontFamily: 'var(--mono)' }}>{c.old_alter_id} → {c.new_alter_id}</td>
                                              <td style={{ padding: '4px 8px', color: 'var(--t3)' }}>{c.changed_at ? new Date(c.changed_at + 'Z').toLocaleString('en-US', { timeZone: 'Asia/Kathmandu' }) : '-'}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* CHEQUE MANAGEMENT PAGE */}
            <div className={`page ${currentPage === 'cheques' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>Cheque Management</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <button className="btn btn-p" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={() => { fetchChequeRecon(); fetchChequeManagement(); }} disabled={chequeLoading || cmLoading}>
                    {chequeLoading || cmLoading ? 'Loading...' : 'Refresh'}
                  </button>
                  <button onClick={() => goToPage('cheque-post')}
                    style={{ padding: '6px 14px', fontSize: '12px', fontWeight: '600', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                    Post Cheques
                  </button>
                </div>
              </div>

              {/* Reconciliation Cards */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1', minWidth: '140px', background: chequeRecon?.pendingToPost > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)', border: `1px solid ${chequeRecon?.pendingToPost > 0 ? 'var(--orange)' : 'var(--green)'}`, borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Pending to Post</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--mono)', color: chequeRecon?.pendingToPost > 0 ? 'var(--orange)' : 'var(--green)' }}>
                    {chequeRecon ? formatCurrency(Math.abs(chequeRecon.pendingToPost || 0)) : 'Offline'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--t3)' }}>Cheque Receipt (For DB)</div>
                </div>
                <div style={{ flex: '1', minWidth: '140px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Cheque Mgmt</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--mono)', color: 'var(--t1)' }}>
                    {chequeRecon ? formatCurrency(Math.abs(chequeRecon.chequeManagement?.balance || 0)) : 'Offline'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--t3)' }}>For DB</div>
                </div>
                <div style={{ flex: '1', minWidth: '140px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Counter Sales</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--mono)', color: 'var(--t1)' }}>
                    {chequeRecon ? formatCurrency(Math.abs(chequeRecon.counterSales?.balance || 0)) : 'Offline'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--t3)' }}>ODBC CHq Mgmt</div>
                </div>
                <div style={{ flex: '1', minWidth: '140px', background: chequeRecon?.isReconciled ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${chequeRecon?.isReconciled ? 'var(--green)' : 'var(--red)'}`, borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Mismatch</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--mono)', color: chequeRecon?.isReconciled ? 'var(--green)' : 'var(--red)' }}>
                    {chequeRecon ? (chequeRecon.isReconciled ? 'Matched' : formatCurrency(chequeRecon.mismatch || 0)) : 'Offline'}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--t3)' }}>{chequeRecon?.isReconciled ? 'Mgmt = Counter Sales' : 'Mgmt vs Counter Sales'}</div>
                </div>
                <div style={{ flex: '1', minWidth: '140px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Total Cheques</div>
                  <div style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--mono)', color: 'var(--t1)' }}>
                    {chequesList.length}
                  </div>
                  <div style={{ fontSize: '10px', color: 'var(--t3)' }}>ODBC Entries</div>
                </div>
              </div>

              {/* Tab Bar */}
              <div style={{ display: 'flex', gap: '2px', marginBottom: '16px', background: 'var(--bg)', borderRadius: '8px', padding: '3px', border: '1px solid var(--border)' }}>
                {[{k:'dashboard',l:'Dashboard'},{k:'recon',l:'Recon'},{k:'odbc',l:'Tally ODBC'},{k:'all',l:'All Cheques'},{k:'pending',l:'Pending'},{k:'party',l:'By Party'},{k:'audit',l:'Audit Log'}].map(t => (
                  <button key={t.k} onClick={() => { if (t.k === 'dashboard' || t.k === 'audit') setCmTab(t.k); setChequeTab(t.k); }} style={{ flex: 1, padding: '8px 12px', fontSize: '12px', fontWeight: chequeTab === t.k ? '600' : '400', background: chequeTab === t.k ? 'var(--card)' : 'transparent', color: chequeTab === t.k ? 'var(--accent)' : 'var(--t3)', border: 'none', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s' }}>
                    {t.l}
                  </button>
                ))}
              </div>

              {chequeLoading && chequeTab !== 'dashboard' && chequeTab !== 'audit' ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading cheque data...</div>
              ) : (
                <>
                  {/* Dashboard Tab */}
                  {chequeTab === 'dashboard' && (
                    <div>
                      {/* Stats Cards */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '6px' }}>Total Posts</div>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{cmStats?.total_posts || 0}</div>
                        </div>
                        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '6px' }}>Total Cheques Posted</div>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--t1)', fontFamily: 'var(--mono)' }}>{cmStats?.total_cheques || 0}</div>
                        </div>
                        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '6px' }}>Total Amount Posted</div>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--green)', fontFamily: 'var(--mono)' }}>{formatCurrency(cmStats?.total_amount || 0)}</div>
                        </div>
                        <div style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '6px' }}>Total Parties</div>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--t1)', fontFamily: 'var(--mono)' }}>{cmStats?.total_parties || 0}</div>
                        </div>
                        <div style={{ background: cmStats?.successful_journals === cmStats?.total_posts ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)', border: `1px solid ${cmStats?.successful_journals === cmStats?.total_posts ? 'var(--green)' : 'var(--orange)'}`, borderRadius: '10px', padding: '16px', textAlign: 'center' }}>
                          <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '6px' }}>Journals Success</div>
                          <div style={{ fontSize: '24px', fontWeight: '700', color: cmStats?.successful_journals === cmStats?.total_posts ? 'var(--green)' : 'var(--orange)', fontFamily: 'var(--mono)' }}>{cmStats?.successful_journals || 0}/{cmStats?.total_posts || 0}</div>
                        </div>
                      </div>

                      {/* Reconciliation summary */}
                      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
                        <div style={{ flex: '1', minWidth: '180px', background: chequeRecon?.pendingToPost > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)', border: `1px solid ${chequeRecon?.pendingToPost > 0 ? 'var(--orange)' : 'var(--green)'}`, borderRadius: '10px', padding: '16px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Pending to Post</div>
                          <div style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'var(--mono)', color: chequeRecon?.pendingToPost > 0 ? 'var(--orange)' : 'var(--green)' }}>
                            {chequeRecon ? formatCurrency(Math.abs(chequeRecon.pendingToPost || 0)) : 'Tally Offline'}
                          </div>
                          {chequeRecon?.pendingToPost > 0 && <div style={{ fontSize: '10px', color: 'var(--orange)', marginTop: '2px' }}>Cheque Receipt balance remaining</div>}
                        </div>
                        <div style={{ flex: '1', minWidth: '180px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Cheque Mgmt (For DB)</div>
                          <div style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'var(--mono)', color: 'var(--t1)' }}>
                            {chequeRecon ? formatCurrency(Math.abs(chequeRecon.chequeManagement?.balance || 0)) : 'Tally Offline'}
                          </div>
                        </div>
                        <div style={{ flex: '1', minWidth: '180px', background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Counter Sales (ODBC)</div>
                          <div style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'var(--mono)', color: 'var(--t1)' }}>
                            {chequeRecon ? formatCurrency(Math.abs(chequeRecon.counterSales?.balance || 0)) : 'Tally Offline'}
                          </div>
                        </div>
                        <div style={{ flex: '1', minWidth: '180px', background: chequeRecon?.isReconciled ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)', border: `1px solid ${chequeRecon?.isReconciled ? 'var(--green)' : 'var(--red)'}`, borderRadius: '10px', padding: '16px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Reconciliation</div>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: chequeRecon?.isReconciled ? 'var(--green)' : 'var(--red)' }}>
                            {chequeRecon ? (chequeRecon.isReconciled ? 'Matched' : `Diff: ${formatCurrency(chequeRecon.mismatch || 0)}`) : 'Tally Offline'}
                          </div>
                          <div style={{ fontSize: '10px', color: 'var(--t3)', marginTop: '2px' }}>{chequeRecon?.isReconciled ? 'Mgmt = Counter Sales' : 'Mgmt vs Counter Sales'}</div>
                        </div>
                      </div>

                      {/* Quick action */}
                      <div style={{ background: 'var(--card)', borderRadius: '10px', border: '2px solid var(--accent)', padding: '20px', textAlign: 'center' }}>
                        <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--t1)', marginBottom: '8px' }}>Quick Post Cheques</div>
                        <div style={{ fontSize: '12px', color: 'var(--t3)', marginBottom: '12px' }}>Enter cheque details, confirm, and post to both ODBC CHq Mgmt and For DB in one go</div>
                        <button onClick={() => goToPage('cheque-post')}
                          style={{ padding: '10px 32px', fontSize: '14px', fontWeight: '700', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                          Go to Cheque Post
                        </button>
                      </div>

                      {/* Recent Posts */}
                      {cmPostLog.length > 0 && (
                        <div style={{ marginTop: '16px' }}>
                          <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--t1)', marginBottom: '8px' }}>Recent Posts</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            {cmPostLog.slice(0, 5).map((log, i) => (
                              <div key={log.id || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '12px' }}>
                                <div>
                                  <span style={{ fontWeight: '600', color: 'var(--t1)' }}>{log.voucher_date}</span>
                                  <span style={{ color: 'var(--t3)', marginLeft: '8px' }}>{log.total_parties} parties, {log.total_cheques} cheques</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                  <span style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--green)' }}>{formatCurrency(log.total_amount)}</span>
                                  <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: '600', background: log.journal_success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: log.journal_success ? 'var(--green)' : 'var(--red)' }}>
                                    {log.journal_success ? 'Journal OK' : 'Journal Failed'}
                                  </span>
                                  <span style={{ color: 'var(--t3)', fontSize: '10px' }}>{new Date(log.posted_at).toLocaleString()}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          <button onClick={() => setChequeTab('audit')} style={{ marginTop: '8px', fontSize: '12px', color: 'var(--accent)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>View full audit log</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Audit Log Tab */}
                  {chequeTab === 'audit' && (
                    <div>
                      {cmLoading ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading audit log...</div>
                      ) : cmPostLog.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '60px', color: 'var(--t3)' }}>
                          <div style={{ fontSize: '32px', marginBottom: '8px' }}>📋</div>
                          <div>No cheque postings recorded yet</div>
                          <button onClick={() => goToPage('cheque-post')} style={{ marginTop: '12px', padding: '8px 20px', fontSize: '13px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>Post Cheques</button>
                        </div>
                      ) : (
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)' }}>#</th>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)' }}>Date/Time</th>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)' }}>Voucher Date</th>
                                <th style={{ padding: '8px', textAlign: 'center', color: 'var(--t3)' }}>Parties</th>
                                <th style={{ padding: '8px', textAlign: 'center', color: 'var(--t3)' }}>Cheques</th>
                                <th style={{ padding: '8px', textAlign: 'right', color: 'var(--t3)' }}>Amount</th>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)' }}>Journal #</th>
                                <th style={{ padding: '8px', textAlign: 'center', color: 'var(--t3)' }}>Status</th>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)' }}>Details</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cmPostLog.map((log, i) => {
                                const receipts = log.receipts || [];
                                return (
                                  <tr key={log.id || i} style={{ borderTop: '1px solid var(--border)' }}>
                                    <td style={{ padding: '8px', color: 'var(--t3)' }}>{i + 1}</td>
                                    <td style={{ padding: '8px', color: 'var(--t2)', fontSize: '11px', whiteSpace: 'nowrap' }}>{new Date(log.posted_at).toLocaleString()}</td>
                                    <td style={{ padding: '8px', fontWeight: '600', color: 'var(--t1)', fontFamily: 'var(--mono)' }}>{log.voucher_date}</td>
                                    <td style={{ padding: '8px', textAlign: 'center', color: 'var(--t1)' }}>{log.total_parties}</td>
                                    <td style={{ padding: '8px', textAlign: 'center', fontWeight: '600', color: 'var(--accent)' }}>{log.total_cheques}</td>
                                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--green)' }}>{formatCurrency(log.total_amount)}</td>
                                    <td style={{ padding: '8px', color: 'var(--t2)', fontSize: '11px', fontFamily: 'var(--mono)' }}>{log.journal_voucher_number || '-'}</td>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                      <span style={{ padding: '2px 8px', borderRadius: '8px', fontSize: '10px', fontWeight: '600', background: log.journal_success ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: log.journal_success ? 'var(--green)' : 'var(--red)' }}>
                                        {log.journal_success ? 'Success' : 'Failed'}
                                      </span>
                                    </td>
                                    <td style={{ padding: '8px', fontSize: '11px', color: 'var(--t3)' }}>
                                      {receipts.map((r, j) => <span key={j}>{r.partyName?.split(',')[0]} ({r.chequeCount}){j < receipts.length - 1 ? ', ' : ''}</span>)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Search bar for recon and all tabs */}
                  {(chequeTab === 'recon' || chequeTab === 'all' || chequeTab === 'odbc') && (
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                      <input type="text" placeholder="Search party, bank, cheque #..." value={chequeSearch} onChange={e => setChequeSearch(e.target.value)} style={{ flex: 1, minWidth: '200px', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                      {chequeTab === 'all' && (
                        <select value={chequeStatusFilter} onChange={e => setChequeStatusFilter(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }}>
                          <option value="">All Status</option>
                          <option value="pending">Pending</option>
                          <option value="deposited">Deposited</option>
                          <option value="cleared">Cleared</option>
                          <option value="bounced">Bounced</option>
                        </select>
                      )}
                    </div>
                  )}

                  {/* Tab 1: Recon (merged list) */}
                  {chequeTab === 'recon' && (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                            <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>#</th>
                            <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Party</th>
                            <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Bank</th>
                            <th style={{ padding: '8px', textAlign: 'right', color: 'var(--t3)', fontWeight: '600' }}>Amount</th>
                            <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Cheque #</th>
                            <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Cheque Date</th>
                            <th style={{ padding: '8px', textAlign: 'center', color: 'var(--t3)', fontWeight: '600' }}>Source</th>
                            <th style={{ padding: '8px', textAlign: 'center', color: 'var(--t3)', fontWeight: '600' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {chequesList
                            .filter(c => {
                              if (!chequeSearch) return true;
                              const s = chequeSearch.toLowerCase();
                              return (c.party_name || '').toLowerCase().includes(s) || (c.bank_name || '').toLowerCase().includes(s) || (c.cheque_number || '').toLowerCase().includes(s);
                            })
                            .map((c, i) => (
                            <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? 'var(--bg)' : 'transparent' }}>
                              <td style={{ padding: '8px', color: 'var(--t3)' }}>{i + 1}</td>
                              <td style={{ padding: '8px', color: 'var(--t1)', fontWeight: '500' }}>{c.party_name}</td>
                              <td style={{ padding: '8px', color: 'var(--t2)' }}>{c.bank_name || c.odbcBankName || '-'}</td>
                              <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--t1)' }}>{formatCurrency(c.amount)}</td>
                              <td style={{ padding: '8px', color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{c.cheque_number || '-'}</td>
                              <td style={{ padding: '8px', color: 'var(--t2)' }}>{c.cheque_date ? String(c.cheque_date).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : '-'}</td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600',
                                  background: c.source === 'both' ? 'rgba(34,197,94,0.15)' : c.source === 'local' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
                                  color: c.source === 'both' ? 'var(--green)' : c.source === 'local' ? 'var(--orange)' : 'var(--blue)' }}>
                                  {c.source === 'both' ? 'Both' : c.source === 'local' ? 'Local' : 'Tally'}
                                </span>
                              </td>
                              <td style={{ padding: '8px', textAlign: 'center' }}>
                                <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600',
                                  background: c.status === 'cleared' ? 'rgba(34,197,94,0.15)' : c.status === 'bounced' ? 'rgba(239,68,68,0.15)' : c.status === 'deposited' ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.15)',
                                  color: c.status === 'cleared' ? 'var(--green)' : c.status === 'bounced' ? 'var(--red)' : c.status === 'deposited' ? 'var(--blue)' : 'var(--orange)' }}>
                                  {c.status || 'unknown'}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {chequesList.length === 0 && (
                            <tr><td colSpan={8} style={{ padding: '24px', textAlign: 'center', color: 'var(--t3)' }}>No cheques found</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Tab: Tally ODBC (ODBC CHq Mgmt vouchers) */}
                  {chequeTab === 'odbc' && (() => {
                    const odbcFiltered = chequeODBC.filter(c => {
                      if (!chequeSearch) return true;
                      const s = chequeSearch.toLowerCase();
                      return (c.partyName || '').toLowerCase().includes(s) || (c.bankName || '').toLowerCase().includes(s) || (c.chequeNumber || '').toLowerCase().includes(s) || (c.voucherNumber || '').toLowerCase().includes(s);
                    });
                    const odbcTotal = odbcFiltered.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
                    return (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--t3)' }}>
                            {odbcFiltered.length} vouchers from <strong style={{ color: 'var(--t1)' }}>ODBC CHq Mgmt</strong> &mdash; Total: <strong style={{ color: 'var(--green)', fontFamily: 'var(--mono)' }}>{formatCurrency(odbcTotal)}</strong>
                          </div>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>#</th>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Voucher #</th>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Date</th>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Party</th>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Bank</th>
                                <th style={{ padding: '8px', textAlign: 'right', color: 'var(--t3)', fontWeight: '600' }}>Amount</th>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Cheque #</th>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Cheque Date</th>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Narration</th>
                              </tr>
                            </thead>
                            <tbody>
                              {odbcFiltered.map((c, i) => (
                                <tr key={c.masterId || i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? 'var(--bg)' : 'transparent' }}>
                                  <td style={{ padding: '8px', color: 'var(--t3)' }}>{i + 1}</td>
                                  <td style={{ padding: '8px', color: 'var(--blue)', fontFamily: 'var(--mono)', fontWeight: '500' }}>{c.voucherNumber || '-'}</td>
                                  <td style={{ padding: '8px', color: 'var(--t2)' }}>{c.voucherDate ? String(c.voucherDate).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : '-'}</td>
                                  <td style={{ padding: '8px', color: 'var(--t1)', fontWeight: '500' }}>{c.partyName || '-'}</td>
                                  <td style={{ padding: '8px', color: 'var(--t2)' }}>{c.bankName || '-'}</td>
                                  <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--t1)' }}>{formatCurrency(c.amount)}</td>
                                  <td style={{ padding: '8px', color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{c.chequeNumber || '-'}</td>
                                  <td style={{ padding: '8px', color: 'var(--t2)' }}>{c.chequeDate ? String(c.chequeDate).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : '-'}</td>
                                  <td style={{ padding: '8px', color: 'var(--t3)', fontSize: '11px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.narration || '-'}</td>
                                </tr>
                              ))}
                              {odbcFiltered.length === 0 && (
                                <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: 'var(--t3)' }}>
                                  {chequeODBC.length === 0 ? 'No vouchers from ODBC CHq Mgmt (Tally may be offline)' : 'No matching vouchers'}
                                </td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Tab 2: All Cheques (local DB) */}
                  {chequeTab === 'all' && (() => {
                    const filtered = chequesList
                      .filter(c => c.source !== 'odbc')
                      .filter(c => !chequeStatusFilter || c.status === chequeStatusFilter)
                      .filter(c => {
                        if (!chequeSearch) return true;
                        const s = chequeSearch.toLowerCase();
                        return (c.party_name || '').toLowerCase().includes(s) || (c.bank_name || '').toLowerCase().includes(s);
                      });
                    return (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                              <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>#</th>
                              <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Party</th>
                              <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Bank</th>
                              <th style={{ padding: '8px', textAlign: 'right', color: 'var(--t3)', fontWeight: '600' }}>Amount</th>
                              <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Cheque #</th>
                              <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Cheque Date</th>
                              <th style={{ padding: '8px', textAlign: 'center', color: 'var(--t3)', fontWeight: '600' }}>Status</th>
                              <th style={{ padding: '8px', textAlign: 'center', color: 'var(--t3)', fontWeight: '600' }}>Synced</th>
                              <th style={{ padding: '8px', textAlign: 'center', color: 'var(--t3)', fontWeight: '600' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filtered.map((c, i) => (
                              <tr key={c.id || i} style={{ borderBottom: '1px solid var(--border)',
                                background: c.status === 'bounced' ? 'rgba(239,68,68,0.05)' : c.status === 'cleared' ? 'rgba(34,197,94,0.05)' : i % 2 ? 'var(--bg)' : 'transparent' }}>
                                <td style={{ padding: '8px', color: 'var(--t3)' }}>{i + 1}</td>
                                <td style={{ padding: '8px', color: 'var(--t1)', fontWeight: '500' }}>{c.party_name}</td>
                                <td style={{ padding: '8px', color: 'var(--t2)' }}>{c.bank_name || '-'}</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--t1)' }}>{formatCurrency(c.amount)}</td>
                                <td style={{ padding: '8px', color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{c.cheque_number || '-'}</td>
                                <td style={{ padding: '8px', color: 'var(--t2)' }}>{c.cheque_date ? String(c.cheque_date).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : '-'}</td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                  <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600',
                                    background: c.status === 'cleared' ? 'rgba(34,197,94,0.15)' : c.status === 'bounced' ? 'rgba(239,68,68,0.15)' : c.status === 'deposited' ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.15)',
                                    color: c.status === 'cleared' ? 'var(--green)' : c.status === 'bounced' ? 'var(--red)' : c.status === 'deposited' ? 'var(--blue)' : 'var(--orange)' }}>
                                    {c.status}
                                  </span>
                                </td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                  {c.matchedInODBC || c.synced_to_tally ? <span style={{ color: 'var(--green)' }}>Yes</span> : <span style={{ color: 'var(--t3)' }}>No</span>}
                                </td>
                                <td style={{ padding: '8px', textAlign: 'center' }}>
                                  {c.id && c.status === 'pending' && (
                                    <button onClick={() => handleChequeStatusChange(c.id, 'deposited')} style={{ padding: '3px 8px', fontSize: '10px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Deposit</button>
                                  )}
                                  {c.id && c.status === 'deposited' && (
                                    <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                                      <button onClick={() => handleChequeStatusChange(c.id, 'cleared')} style={{ padding: '3px 8px', fontSize: '10px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Clear</button>
                                      <button onClick={() => handleChequeStatusChange(c.id, 'bounced')} style={{ padding: '3px 8px', fontSize: '10px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Bounce</button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                            {filtered.length === 0 && (
                              <tr><td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: 'var(--t3)' }}>No cheques found</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}

                  {/* Tab 3: Pending */}
                  {chequeTab === 'pending' && (() => {
                    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
                    const pendingList = chequesList.filter(c => c.status === 'pending' && c.source !== 'odbc');
                    return (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                          <div style={{ fontSize: '13px', color: 'var(--t2)' }}>{pendingList.length} pending cheques</div>
                          <button onClick={handleSyncCheques} disabled={chequeSyncing} style={{ padding: '6px 14px', fontSize: '12px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                            {chequeSyncing ? 'Syncing...' : 'Sync All to Tally'}
                          </button>
                        </div>
                        <div style={{ overflowX: 'auto' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>#</th>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Party</th>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Bank</th>
                                <th style={{ padding: '8px', textAlign: 'right', color: 'var(--t3)', fontWeight: '600' }}>Amount</th>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Cheque #</th>
                                <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Cheque Date</th>
                                <th style={{ padding: '8px', textAlign: 'center', color: 'var(--t3)', fontWeight: '600' }}>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {pendingList.map((c, i) => {
                                const isDueToday = c.cheque_date === today;
                                const needsDate = !c.cheque_date;
                                return (
                                  <tr key={c.id || i} style={{ borderBottom: '1px solid var(--border)', background: isDueToday ? 'rgba(245,158,11,0.08)' : i % 2 ? 'var(--bg)' : 'transparent' }}>
                                    <td style={{ padding: '8px', color: 'var(--t3)' }}>{i + 1}</td>
                                    <td style={{ padding: '8px', color: 'var(--t1)', fontWeight: '500' }}>{c.party_name}</td>
                                    <td style={{ padding: '8px', color: 'var(--t2)' }}>{c.bank_name || '-'}</td>
                                    <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--t1)' }}>{formatCurrency(c.amount)}</td>
                                    <td style={{ padding: '8px', color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{c.cheque_number || '-'}</td>
                                    <td style={{ padding: '8px', color: isDueToday ? 'var(--orange)' : 'var(--t2)' }}>
                                      {needsDate ? <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '10px', background: 'rgba(239,68,68,0.15)', color: 'var(--red)' }}>Needs Date</span>
                                        : <>{String(c.cheque_date).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')} {isDueToday && <span style={{ fontSize: '10px', color: 'var(--orange)', fontWeight: '600' }}> DUE TODAY</span>}</>}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                      <button onClick={() => handleChequeStatusChange(c.id, 'deposited')} style={{ padding: '3px 10px', fontSize: '10px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Mark Deposited</button>
                                    </td>
                                  </tr>
                                );
                              })}
                              {pendingList.length === 0 && (
                                <tr><td colSpan={7} style={{ padding: '24px', textAlign: 'center', color: 'var(--t3)' }}>No pending cheques</td></tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Tab 4: By Party */}
                  {chequeTab === 'party' && (() => {
                    const localOnly = chequesList.filter(c => c.source !== 'odbc');
                    const partyMap = {};
                    for (const c of localOnly) {
                      const p = c.party_name || 'Unknown';
                      if (!partyMap[p]) partyMap[p] = { cheques: [], total: 0, pending: 0, cleared: 0, bounced: 0 };
                      partyMap[p].cheques.push(c);
                      partyMap[p].total += parseFloat(c.amount) || 0;
                      if (c.status === 'pending' || c.status === 'deposited') partyMap[p].pending += parseFloat(c.amount) || 0;
                      if (c.status === 'cleared') partyMap[p].cleared += parseFloat(c.amount) || 0;
                      if (c.status === 'bounced') partyMap[p].bounced += parseFloat(c.amount) || 0;
                    }
                    const parties = Object.entries(partyMap).sort((a, b) => b[1].total - a[1].total);

                    return (
                      <div>
                        {parties.map(([name, data]) => (
                          <div key={name} style={{ marginBottom: '4px', border: '1px solid var(--border)', borderRadius: '8px', overflow: 'hidden' }}>
                            <div onClick={() => setChequeExpandedParty(chequeExpandedParty === name ? null : name)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--card)', cursor: 'pointer' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <span style={{ color: 'var(--t1)', fontWeight: '600', fontSize: '13px' }}>{name}</span>
                                <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', background: 'var(--bg)', color: 'var(--t3)' }}>{data.cheques.length} cheques</span>
                              </div>
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'center', fontSize: '12px' }}>
                                {data.pending > 0 && <span style={{ color: 'var(--orange)' }}>Pending: {formatCurrency(data.pending)}</span>}
                                {data.cleared > 0 && <span style={{ color: 'var(--green)' }}>Cleared: {formatCurrency(data.cleared)}</span>}
                                {data.bounced > 0 && <span style={{ color: 'var(--red)' }}>Bounced: {formatCurrency(data.bounced)}</span>}
                                <span style={{ fontWeight: '600', fontFamily: 'var(--mono)', color: 'var(--t1)' }}>{formatCurrency(data.total)}</span>
                                <span style={{ color: 'var(--t3)', fontSize: '14px' }}>{chequeExpandedParty === name ? '▼' : '▶'}</span>
                              </div>
                            </div>
                            {chequeExpandedParty === name && (
                              <div style={{ padding: '0' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                  <thead>
                                    <tr style={{ background: 'var(--bg)' }}>
                                      <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--t3)' }}>Bank</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'right', color: 'var(--t3)' }}>Amount</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--t3)' }}>Cheque #</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'left', color: 'var(--t3)' }}>Date</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--t3)' }}>Status</th>
                                      <th style={{ padding: '6px 8px', textAlign: 'center', color: 'var(--t3)' }}>Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {data.cheques.map((c, i) => (
                                      <tr key={c.id || i} style={{ borderTop: '1px solid var(--border)' }}>
                                        <td style={{ padding: '6px 8px', color: 'var(--t2)' }}>{c.bank_name || '-'}</td>
                                        <td style={{ padding: '6px 8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--t1)' }}>{formatCurrency(c.amount)}</td>
                                        <td style={{ padding: '6px 8px', color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{c.cheque_number || '-'}</td>
                                        <td style={{ padding: '6px 8px', color: 'var(--t2)' }}>{c.cheque_date ? String(c.cheque_date).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : '-'}</td>
                                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                          <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: '600',
                                            background: c.status === 'cleared' ? 'rgba(34,197,94,0.15)' : c.status === 'bounced' ? 'rgba(239,68,68,0.15)' : c.status === 'deposited' ? 'rgba(59,130,246,0.15)' : 'rgba(245,158,11,0.15)',
                                            color: c.status === 'cleared' ? 'var(--green)' : c.status === 'bounced' ? 'var(--red)' : c.status === 'deposited' ? 'var(--blue)' : 'var(--orange)' }}>
                                            {c.status}
                                          </span>
                                        </td>
                                        <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                          {c.id && c.status === 'pending' && <button onClick={() => handleChequeStatusChange(c.id, 'deposited')} style={{ padding: '2px 6px', fontSize: '10px', background: 'var(--blue)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Deposit</button>}
                                          {c.id && c.status === 'deposited' && (
                                            <div style={{ display: 'flex', gap: '3px', justifyContent: 'center' }}>
                                              <button onClick={() => handleChequeStatusChange(c.id, 'cleared')} style={{ padding: '2px 6px', fontSize: '10px', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Clear</button>
                                              <button onClick={() => handleChequeStatusChange(c.id, 'bounced')} style={{ padding: '2px 6px', fontSize: '10px', background: 'var(--red)', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Bounce</button>
                                            </div>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        ))}
                        {parties.length === 0 && (
                          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>No cheques found</div>
                        )}
                      </div>
                    );
                  })()}
                </>
              )}
            </div>

            {/* CHEQUE POST PAGE - Fast Entry with Collapsed Cards */}
            <div className={`page ${currentPage === 'cheque-post' ? 'active' : ''}`} onClick={() => { setCpPartyDropdown(null); setCpBankDropdown(null); }}>
              <div className="sec-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>Cheque Post {cpStep === 'confirm' ? '- Confirmation' : cpSyncResults ? '- Results' : ''}</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {cpStep === 'entry' && !cpSyncResults && <>
                    <input type="date" value={cpDate} onChange={e => { setCpDate(e.target.value); fetchChequePost(e.target.value); }} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                    <span style={{ fontSize: '11px', color: 'var(--green)' }}>Auto-saved</span>
                    {cpPostedCount > 0 && <button onClick={() => setCpShowPosted(!cpShowPosted)} style={{ fontSize: '11px', color: cpShowPosted ? 'var(--accent)' : 'var(--green)', padding: '2px 8px', background: cpShowPosted ? 'rgba(99,102,241,0.15)' : 'rgba(34,197,94,0.1)', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: '600' }}>{cpPostedCount} posted {cpShowPosted ? '(hide)' : '(view)'}</button>}
                    <button className="btn btn-p" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={() => fetchChequePost(cpDate)} disabled={cpLoading}>
                      {cpLoading ? 'Loading...' : 'Refresh'}
                    </button>
                  </>}
                </div>
              </div>

              {/* Posted cheques view */}
              {cpShowPosted && cpPostedData && cpPostedData.length > 0 && (
                <div style={{ margin: '0 0 16px 0' }}>
                  {cpPostedData.map((log, logIdx) => {
                    const receipts = log.receipts || [];
                    const results = log.results || {};
                    const odbcResults = results.odbcResults || [];
                    const journalResult = results.journalResult;
                    const summary = results.summary || {};
                    // Build per-party data merging receipts + odbcResults
                    const partyEntries = receipts.map((r, ri) => {
                      const odbc = odbcResults[ri] || odbcResults.find(o => o.partyName === r.partyName) || {};
                      const lines = (r.chequeLines && r.chequeLines.length > 0) ? r.chequeLines : null;
                      const partyAmt = lines ? lines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0) : (parseFloat(r.amount) || 0);
                      return { party: r.odbcParty || r.partyName, lines, chequeCount: r.chequeCount || (lines ? lines.length : 0), amount: partyAmt, odbcSuccess: odbc.success, odbcVoucherId: odbc.voucherId, odbcError: odbc.error };
                    });
                    const totalCheques = partyEntries.reduce((s, p) => s + p.chequeCount, 0);
                    const totalAmt = partyEntries.reduce((s, p) => s + p.amount, 0);
                    let lineNum = 0;
                    return (
                      <div key={logIdx} style={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', marginBottom: '8px' }}>
                        <div style={{ padding: '10px 16px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--green)' }}>Posted</span>
                            <span style={{ fontSize: '11px', color: 'var(--t3)' }}>{new Date(log.posted_at).toLocaleString()}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '13px', fontWeight: '700', fontFamily: 'var(--mono)', color: 'var(--t1)' }}>{totalCheques} cheques | Rs {totalAmt.toLocaleString('en-IN')}</span>
                            <button onClick={() => { const el = document.getElementById(`cp-posted-${logIdx}`); if (el) { const w = window.open('', '_blank', 'width=900,height=700'); w.document.write('<html><head><title>Cheque Post - ' + cpDate + '</title><style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:5px 8px;text-align:left}th{background:#f5f5f5;font-weight:700}.r{text-align:right}.party-hdr{background:#e8f0fe;font-weight:700}.jrnl-box{background:#f0faf0;border:1px solid #c0e0c0;padding:10px 14px;border-radius:6px;margin-bottom:14px}.section-title{font-size:14px;font-weight:700;margin:12px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px}@media print{body{padding:10px}}</style></head><body>' + el.innerHTML + '</body></html>'); w.document.close(); w.print(); } }}
                              style={{ padding: '4px 10px', fontSize: '11px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t2)', cursor: 'pointer' }}>Print</button>
                          </div>
                        </div>
                        <div id={`cp-posted-${logIdx}`} style={{ padding: '12px 16px' }}>
                          <div style={{ textAlign: 'center', marginBottom: '14px' }}>
                            <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--t1)' }}>Cheque Post Details</div>
                            <div style={{ fontSize: '11px', color: 'var(--t3)' }}>Date: {cpDate} | {totalCheques} cheques | {partyEntries.length} parties | Rs {totalAmt.toLocaleString('en-IN')}</div>
                          </div>

                          {/* Billing Company Journal Voucher */}
                          {(log.journal_voucher_number || journalResult) && (
                            <div className="jrnl-box" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px' }}>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: 'var(--t1)', marginBottom: '6px' }}>Billing Company — Journal Voucher</div>
                              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', fontSize: '12px' }}>
                                {log.journal_voucher_number && <span style={{ fontFamily: 'var(--mono)', color: 'var(--accent)' }}>Vch#: {log.journal_voucher_number}</span>}
                                <span style={{ color: journalResult?.success ? 'var(--green)' : 'var(--red)' }}>{journalResult?.success ? 'Created' : 'Failed'}</span>
                              </div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginTop: '8px' }}>
                                <thead>
                                  <tr style={{ background: 'rgba(34,197,94,0.08)' }}>
                                    <th style={{ padding: '4px 8px', textAlign: 'left', borderBottom: '1px solid rgba(34,197,94,0.2)', color: 'var(--t3)' }}>Ledger</th>
                                    <th style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid rgba(34,197,94,0.2)', color: 'var(--t3)' }}>Debit</th>
                                    <th style={{ padding: '4px 8px', textAlign: 'right', borderBottom: '1px solid rgba(34,197,94,0.2)', color: 'var(--t3)' }}>Credit</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  <tr>
                                    <td style={{ padding: '4px 8px', color: 'var(--t1)' }}>Cheque Management</td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--t1)' }}>Rs {totalAmt.toLocaleString('en-IN')}</td>
                                    <td style={{ padding: '4px 8px' }}></td>
                                  </tr>
                                  <tr>
                                    <td style={{ padding: '4px 8px', color: 'var(--t1)' }}>Cheque Receipt</td>
                                    <td style={{ padding: '4px 8px' }}></td>
                                    <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--t1)' }}>Rs {totalAmt.toLocaleString('en-IN')}</td>
                                  </tr>
                                </tbody>
                              </table>
                            </div>
                          )}

                          {/* ODBC Entries by Party */}
                          <div className="section-title" style={{ fontSize: '13px', fontWeight: '700', color: 'var(--t1)', marginBottom: '8px', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>ODBC Cheque Entries</div>
                          {partyEntries.map((pe, pi) => (
                            <div key={pi} style={{ marginBottom: '10px', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
                              <div className="party-hdr" style={{ padding: '6px 10px', background: 'rgba(99,102,241,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--t1)' }}>{pe.party}</span>
                                  <span style={{ fontSize: '11px', color: 'var(--t3)' }}>{pe.chequeCount} chq{pe.chequeCount > 1 ? 's' : ''}</span>
                                  {pe.odbcSuccess !== undefined && (
                                    <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', background: pe.odbcSuccess ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: pe.odbcSuccess ? 'var(--green)' : 'var(--red)' }}>
                                      {pe.odbcSuccess ? 'Synced' : pe.odbcError || 'Failed'}
                                    </span>
                                  )}
                                  {pe.odbcVoucherId && <span style={{ fontSize: '10px', color: 'var(--t3)', fontFamily: 'var(--mono)' }}>ID: {pe.odbcVoucherId}</span>}
                                </div>
                                <span style={{ fontSize: '12px', fontWeight: '700', fontFamily: 'var(--mono)', color: 'var(--t1)' }}>Rs {pe.amount.toLocaleString('en-IN')}</span>
                              </div>
                              {(() => {
                                const displayLines = pe.lines || (pe.odbcVoucherId && cpFetchedDetails[pe.odbcVoucherId]?.lines) || null;
                                if (displayLines) return (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                                  <thead>
                                    <tr style={{ background: 'var(--bg)' }}>
                                      <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--t3)', width: '30px' }}>#</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--t3)' }}>Bill Name</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--t3)' }}>A/C Holder</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--t3)' }}>BS Date</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'left', color: 'var(--t3)' }}>AD Date</th>
                                      <th style={{ padding: '4px 8px', textAlign: 'right', color: 'var(--t3)' }}>Amount</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {displayLines.map((cl, ci) => { lineNum++; const adDate = cl.chequeDate || ''; return (
                                      <tr key={ci} style={{ borderTop: ci > 0 ? '1px solid var(--border)' : 'none' }}>
                                        <td style={{ padding: '4px 8px', color: 'var(--t3)' }}>{lineNum}</td>
                                        <td style={{ padding: '4px 8px', color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{cl.billName || [cl.chequeNumber, cl.bankName].filter(Boolean).join('/')}</td>
                                        <td style={{ padding: '4px 8px', color: 'var(--t2)' }}>{cl.accountHolderName || ''}</td>
                                        <td style={{ padding: '4px 8px', color: 'var(--accent)', fontFamily: 'var(--mono)', fontSize: '10px' }}>{adToBsDisplay(adDate)}</td>
                                        <td style={{ padding: '4px 8px', color: 'var(--t2)', fontSize: '10px' }}>{adDate}</td>
                                        <td style={{ padding: '4px 8px', textAlign: 'right', fontFamily: 'var(--mono)', color: 'var(--t1)' }}>Rs {(parseFloat(cl.amount) || 0).toLocaleString('en-IN')}</td>
                                      </tr>
                                    ); })}
                                  </tbody>
                                </table>
                                );
                                // No lines available — show summary with Load Details button
                                const fetching = pe.odbcVoucherId && cpFetchedDetails[pe.odbcVoucherId]?.loading;
                                return (
                                  <div style={{ padding: '6px 10px', fontSize: '11px', color: 'var(--t3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span>{pe.chequeCount} cheque(s) — Rs {pe.amount.toLocaleString('en-IN')}</span>
                                    {pe.odbcVoucherId && (
                                      <button disabled={fetching} onClick={async () => {
                                        setCpFetchedDetails(prev => ({ ...prev, [pe.odbcVoucherId]: { loading: true, lines: null } }));
                                        try {
                                          const res = await getODBCVoucherDetail(pe.odbcVoucherId);
                                          setCpFetchedDetails(prev => ({ ...prev, [pe.odbcVoucherId]: { loading: false, lines: res.data.chequeLines || [] } }));
                                        } catch { setCpFetchedDetails(prev => ({ ...prev, [pe.odbcVoucherId]: { loading: false, lines: null } })); }
                                      }} style={{ padding: '2px 8px', fontSize: '10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '4px', cursor: fetching ? 'wait' : 'pointer' }}>
                                        {fetching ? 'Loading...' : 'Load Details'}
                                      </button>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          ))}

                          {/* Grand Total */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', borderTop: '2px solid var(--border)', marginTop: '4px', fontWeight: '700', fontSize: '13px' }}>
                            <span style={{ color: 'var(--t1)' }}>Grand Total — {totalCheques} cheques, {partyEntries.length} parties</span>
                            <span style={{ fontFamily: 'var(--mono)', color: 'var(--t1)' }}>Rs {totalAmt.toLocaleString('en-IN')}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {cpStep === 'entry' && (cpLoading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Fetching cheque receipts from Tally...</div>
              ) : cpReceipts.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: 'var(--t3)' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📝</div>
                  <div>No cheque receipt vouchers found for this date</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {cpReceipts.map((r, ri) => {
                    const form = cpForms[r.masterId] || { odbcParty: '', chequeLines: [{ bankName: '', chequeNumber: '', chequeDate: '', amount: '', accountHolderName: '' }] };
                    const linesTotal = form.chequeLines.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0);
                    const remaining = r.chequeReceiptAmount - linesTotal;
                    const isMatched = Math.abs(remaining) < 0.01;
                    const linesReady = form.chequeLines.length > 0 && form.chequeLines.every(l => l.bankName && l.chequeNumber && l.amount);
                    const canSync = isMatched && form.odbcParty && linesReady;
                    const isExpanded = cpExpanded[r.masterId];
                    const partySearch = cpPartyFilter[r.masterId] || '';
                    const filteredParties = partySearch ? cpOdbcParties.filter(p => p.name.toLowerCase().includes(partySearch.toLowerCase())) : cpOdbcParties;

                    return (
                      <div key={r.masterId} style={{ border: `2px solid ${canSync ? 'var(--green)' : form.odbcParty ? 'var(--border)' : 'var(--orange)'}`, borderRadius: '10px', overflow: 'hidden', background: 'var(--card)', transition: 'border-color 0.3s' }}>
                        {/* Collapsed Header - click to expand */}
                        <div onClick={() => setCpExpanded(prev => ({ ...prev, [r.masterId]: !prev[r.masterId] }))}
                          style={{ padding: '10px 16px', background: 'var(--bg)', borderBottom: isExpanded ? '1px solid var(--border)' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                            <input type="checkbox" checked={!!cpSelected[r.masterId]} onClick={e => e.stopPropagation()} onChange={e => setCpSelected(prev => ({ ...prev, [r.masterId]: e.target.checked }))} disabled={!canSync}
                              style={{ width: '16px', height: '16px', accentColor: 'var(--green)', cursor: canSync ? 'pointer' : 'not-allowed', opacity: canSync ? 1 : 0.4, flexShrink: 0 }} />
                            <span style={{ color: 'var(--t3)', fontSize: '14px' }}>{isExpanded ? '▼' : '▶'}</span>
                            <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--t1)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.partyName}</span>
                            <span style={{ fontSize: '11px', color: 'var(--t3)', whiteSpace: 'nowrap' }}>#{r.voucherNumber}</span>
                            {form.chequeLines.length > 1 && <span style={{ padding: '1px 6px', borderRadius: '8px', fontSize: '10px', background: 'var(--bg)', color: 'var(--t3)', border: '1px solid var(--border)' }}>{form.chequeLines.length} chqs</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            {isMatched && <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', background: 'rgba(34,197,94,0.15)', color: 'var(--green)', fontWeight: '600' }}>Matched</span>}
                            {canSync && <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', background: 'rgba(34,197,94,0.15)', color: 'var(--green)', fontWeight: '600' }}>Ready</span>}
                            {!isMatched && linesTotal > 0 && <span style={{ fontSize: '11px', color: 'var(--orange)', fontFamily: 'var(--mono)' }}>{formatCurrency(linesTotal)}/</span>}
                            <span style={{ fontSize: '16px', fontWeight: '700', fontFamily: 'var(--mono)', color: 'var(--accent)' }}>{formatCurrency(r.chequeReceiptAmount)}</span>
                          </div>
                        </div>

                        {/* Expanded Entry Form */}
                        {isExpanded && (
                        <div style={{ padding: '10px 16px' }}>
                          {/* ODBC Party - searchable input */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', position: 'relative' }} onClick={e => e.stopPropagation()}>
                            <label style={{ fontSize: '11px', color: 'var(--t3)', fontWeight: '600', minWidth: '50px' }}>Party:</label>
                            {form.odbcParty ? (
                              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', background: 'rgba(34,197,94,0.08)', border: '1px solid var(--green)', borderRadius: '6px' }}>
                                <span style={{ fontSize: '12px', color: 'var(--t1)', flex: 1 }}>{form.odbcParty}</span>
                                <button onClick={() => { cpUpdateForm(r.masterId, 'odbcParty', ''); setCpPartyFilter(prev => ({ ...prev, [r.masterId]: '' })); }}
                                  style={{ padding: '0 4px', fontSize: '14px', background: 'transparent', color: 'var(--t3)', border: 'none', cursor: 'pointer', lineHeight: 1 }}>x</button>
                              </div>
                            ) : (
                              <div style={{ flex: 1, position: 'relative' }}>
                                <input type="text" value={partySearch} placeholder="Type to search ODBC party..."
                                  onChange={e => { setCpPartyFilter(prev => ({ ...prev, [r.masterId]: e.target.value })); setCpPartyDropdown(r.masterId); }}
                                  onFocus={() => setCpPartyDropdown(r.masterId)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && filteredParties.length > 0) {
                                      cpUpdateForm(r.masterId, 'odbcParty', filteredParties[0].name);
                                      setCpPartyDropdown(null);
                                    } else if (e.key === 'Escape') setCpPartyDropdown(null);
                                  }}
                                  style={{ width: '100%', padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--orange)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                                {cpPartyDropdown === r.masterId && filteredParties.length > 0 && (
                                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '260px', overflow: 'auto', background: 'var(--card)', border: '2px solid var(--accent)', borderTop: 'none', borderRadius: '0 0 8px 8px', zIndex: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.35)' }}>
                                    <div style={{ padding: '4px 10px', fontSize: '10px', color: 'var(--t3)', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>{filteredParties.length} results - Enter to select first</div>
                                    {filteredParties.slice(0, 20).map((p, pi) => (
                                      <div key={p.name} onClick={() => { cpUpdateForm(r.masterId, 'odbcParty', p.name); setCpPartyDropdown(null); setCpPartyFilter(prev => ({ ...prev, [r.masterId]: '' })); }}
                                        style={{ padding: '8px 12px', fontSize: '13px', color: pi === 0 ? 'var(--accent)' : 'var(--t1)', cursor: 'pointer', borderBottom: '1px solid var(--border)', fontWeight: pi === 0 ? '700' : '400', background: pi === 0 ? 'rgba(99,102,241,0.1)' : 'transparent' }}
                                        onMouseEnter={e => { e.target.style.background = 'rgba(99,102,241,0.18)'; e.target.style.color = 'var(--accent)'; }} onMouseLeave={e => { e.target.style.background = pi === 0 ? 'rgba(99,102,241,0.1)' : 'transparent'; e.target.style.color = pi === 0 ? 'var(--accent)' : 'var(--t1)'; }}>
                                        {p.name}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Cheque lines - compact table with BS date */}
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg)' }}>
                                <th style={{ padding: '4px 6px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600', width: '30px' }}>#</th>
                                <th style={{ padding: '4px 6px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Bill Name (chq#/bank)</th>
                                <th style={{ padding: '4px 6px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>A/C Holder</th>
                                <th style={{ padding: '4px 6px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600', width: '90px' }}>BS Date</th>
                                <th style={{ padding: '4px 6px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600', width: '120px' }}>AD Date</th>
                                <th style={{ padding: '4px 6px', textAlign: 'right', color: 'var(--t3)', fontWeight: '600', width: '110px' }}>Amount</th>
                                <th style={{ width: '30px' }}></th>
                              </tr>
                            </thead>
                            <tbody>
                              {form.chequeLines.map((line, li) => {
                                const bsKey = `${r.masterId}-${li}`;
                                const hasSlash = line._hasSlash || !!line.bankName;
                                const combinedVal = hasSlash ? `${line.chequeNumber}/${line.bankName}` : line.chequeNumber;
                                return (
                                <tr key={li} style={{ borderTop: '1px solid var(--border)' }}>
                                  <td style={{ padding: '4px 6px', color: 'var(--t3)' }}>{li + 1}</td>
                                  <td style={{ padding: '3px 4px' }}>
                                    <input type="text" data-field="chqbank" value={combinedVal}
                                      onChange={e => {
                                        const val = e.target.value;
                                        if (val.includes('/')) {
                                          const slashIdx = val.indexOf('/');
                                          cpUpdateLineMulti(r.masterId, li, { chequeNumber: val.substring(0, slashIdx), bankName: val.substring(slashIdx + 1), _hasSlash: true });
                                        } else {
                                          cpUpdateLineMulti(r.masterId, li, { chequeNumber: val, bankName: '', _hasSlash: false });
                                        }
                                      }}
                                      onBlur={() => {
                                        if (line.chequeNumber && !line.bankName && li > 0) {
                                          const prevBank = form.chequeLines[li - 1]?.bankName || '';
                                          const prevHolder = form.chequeLines[li - 1]?.accountHolderName || '';
                                          if (prevBank) cpUpdateLineMulti(r.masterId, li, { bankName: prevBank, _hasSlash: true, accountHolderName: line.accountHolderName || prevHolder });
                                        }
                                      }}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          const prevLine = li > 0 ? form.chequeLines[li - 1] : null;
                                          const prevBank = prevLine?.bankName || '';
                                          const prevHolder = prevLine?.accountHolderName || '';
                                          if (line.chequeNumber && !line.bankName && prevBank) {
                                            cpUpdateLineMulti(r.masterId, li, { bankName: prevBank, _hasSlash: true, accountHolderName: line.accountHolderName || prevHolder });
                                          }
                                          const currentBank = line.bankName || prevBank;
                                          const bankChanged = !prevLine || currentBank !== prevBank;
                                          if (bankChanged || li === 0) {
                                            e.target.closest('tr').querySelector('input[data-field="holder"]')?.focus();
                                          } else {
                                            if (!line.accountHolderName && prevHolder) cpUpdateLine(r.masterId, li, 'accountHolderName', prevHolder);
                                            e.target.closest('tr').querySelector('input[data-field="bsdate"]')?.focus();
                                          }
                                        }
                                      }}
                                      placeholder="Chq# / Bank"
                                      style={{ width: '100%', padding: '5px 6px', background: 'var(--bg)', border: `1px solid ${line.chequeNumber && line.bankName ? 'var(--border)' : 'var(--orange)'}`, borderRadius: '4px', color: 'var(--t1)', fontSize: '12px' }} />
                                  </td>
                                  <td style={{ padding: '3px 4px' }}>
                                    <input type="text" data-field="holder" value={line.accountHolderName} onChange={e => cpUpdateLine(r.masterId, li, 'accountHolderName', e.target.value)}
                                      placeholder="A/C holder"
                                      onKeyDown={e => { if (e.key === 'Enter') e.target.closest('tr').querySelector('input[data-field="bsdate"]')?.focus(); }}
                                      style={{ width: '100%', padding: '5px 6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--t1)', fontSize: '12px' }} />
                                  </td>
                                  <td style={{ padding: '3px 4px' }}>
                                    <input type="text" data-field="bsdate" value={cpBsDate[bsKey] || ''} placeholder="dd-mm"
                                      onChange={e => handleBsDateInput(r.masterId, li, e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') e.target.closest('tr').querySelector('input[type="number"]')?.focus(); }}
                                      title="Nepali date (dd-mm or dd-mm-yyyy)"
                                      style={{ width: '100%', padding: '5px 6px', background: 'var(--bg)', border: `1px solid ${cpBsDate[bsKey] ? 'var(--accent)' : 'var(--border)'}`, borderRadius: '4px', color: 'var(--accent)', fontSize: '12px', fontFamily: 'var(--mono)' }} />
                                  </td>
                                  <td style={{ padding: '3px 4px' }}>
                                    <input type="date" value={line.chequeDate} onChange={e => cpUpdateLine(r.masterId, li, 'chequeDate', e.target.value)}
                                      onKeyDown={e => { if (e.key === 'Enter') e.target.closest('tr').querySelector('input[type="number"]')?.focus(); }}
                                      style={{ width: '100%', padding: '5px 6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--t1)', fontSize: '11px' }} />
                                  </td>
                                  <td style={{ padding: '3px 4px' }}>
                                    <input type="number" value={line.amount} onChange={e => cpUpdateLine(r.masterId, li, 'amount', e.target.value)} placeholder="0"
                                      onBlur={() => cpAmountBlur(r.masterId, li, r.chequeReceiptAmount)}
                                      onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          if (canSync) cpSyncOne(r);
                                          else if (li === form.chequeLines.length - 1) { cpAddLine(r.masterId); setTimeout(() => { const rows = e.target.closest('tbody')?.querySelectorAll('tr'); if (rows?.[li + 1]) rows[li + 1].querySelector('input')?.focus(); }, 50); }
                                        }
                                      }}
                                      style={{ width: '100%', padding: '5px 6px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--t1)', fontSize: '12px', textAlign: 'right', fontFamily: 'var(--mono)' }} />
                                  </td>
                                  <td style={{ padding: '3px 4px', textAlign: 'center' }}>
                                    {form.chequeLines.length > 1 && (
                                      <button onClick={() => cpRemoveLine(r.masterId, li)} style={{ padding: '0 4px', fontSize: '14px', background: 'transparent', color: 'var(--red)', border: 'none', cursor: 'pointer', lineHeight: 1 }}>x</button>
                                    )}
                                  </td>
                                </tr>); })}
                            </tbody>
                          </table>

                          {/* Footer: Add line + Progress */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                            <button onClick={() => cpAddLine(r.masterId)} style={{ padding: '4px 12px', fontSize: '11px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t2)', cursor: 'pointer' }}>
                              + Add Line
                            </button>

                            <div style={{ flex: 1, margin: '0 12px' }}>
                              <div style={{ height: '4px', background: 'var(--bg)', borderRadius: '2px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', width: `${Math.min(100, (linesTotal / r.chequeReceiptAmount) * 100)}%`, background: isMatched ? 'var(--green)' : linesTotal > r.chequeReceiptAmount ? 'var(--red)' : 'var(--orange)', borderRadius: '2px', transition: 'width 0.3s' }} />
                              </div>
                              <div style={{ fontSize: '10px', color: isMatched ? 'var(--green)' : 'var(--t3)', textAlign: 'center', marginTop: '2px', fontFamily: 'var(--mono)' }}>
                                {isMatched ? 'Matched' : `${formatCurrency(linesTotal)} / ${formatCurrency(r.chequeReceiptAmount)}`}
                              </div>
                            </div>

                            <span style={{ fontSize: '11px', color: canSync ? 'var(--green)' : 'var(--orange)', fontWeight: '600' }}>
                              {canSync ? 'Ready' : !form.odbcParty ? 'Select party' : !linesReady ? 'Fill fields' : 'Match amount'}
                            </span>
                          </div>
                        </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Select All + Next Button - always visible */}
                  {(() => { const selCount = Object.values(cpSelected).filter(Boolean).length; const hasSelection = selCount > 0; return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', padding: '12px 16px', background: 'var(--card)', borderRadius: '10px', border: `2px solid ${hasSelection ? 'var(--accent)' : 'var(--border)'}`, transition: 'border-color 0.3s' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: 'var(--t2)' }}>
                      <input type="checkbox" checked={cpReceipts.filter(r => { const f = cpForms[r.masterId]; const lt = (f?.chequeLines || []).reduce((s, l) => s + (parseFloat(l.amount) || 0), 0); const lr = (f?.chequeLines || []).length > 0 && (f?.chequeLines || []).every(l => l.bankName && l.chequeNumber && l.amount); return Math.abs(r.chequeReceiptAmount - lt) < 0.01 && f?.odbcParty && lr; }).every(r => cpSelected[r.masterId])}
                        onChange={e => { const ready = cpReceipts.filter(r => { const f = cpForms[r.masterId]; const lt = (f?.chequeLines || []).reduce((s, l) => s + (parseFloat(l.amount) || 0), 0); const lr = (f?.chequeLines || []).length > 0 && (f?.chequeLines || []).every(l => l.bankName && l.chequeNumber && l.amount); return Math.abs(r.chequeReceiptAmount - lt) < 0.01 && f?.odbcParty && lr; }); const newSel = {}; if (e.target.checked) ready.forEach(r => { newSel[r.masterId] = true; }); setCpSelected(newSel); }}
                        style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }} />
                      Select All Ready ({cpReceipts.filter(r => { const f = cpForms[r.masterId]; const lt = (f?.chequeLines || []).reduce((s, l) => s + (parseFloat(l.amount) || 0), 0); const lr = (f?.chequeLines || []).length > 0 && (f?.chequeLines || []).every(l => l.bankName && l.chequeNumber && l.amount); return Math.abs(r.chequeReceiptAmount - lt) < 0.01 && f?.odbcParty && lr; }).length})
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--t3)' }}>{selCount} selected</span>
                      <button onClick={() => setCpStep('confirm')} disabled={!hasSelection}
                        style={{ padding: '10px 28px', fontSize: '14px', fontWeight: '700', background: hasSelection ? 'var(--accent)' : 'var(--bg)', color: hasSelection ? '#fff' : 'var(--t3)', border: hasSelection ? 'none' : '1px solid var(--border)', borderRadius: '8px', cursor: hasSelection ? 'pointer' : 'not-allowed', transition: 'all 0.2s', opacity: hasSelection ? 1 : 0.6 }}>
                        {hasSelection ? `Next (${selCount}) →` : 'Select vouchers to continue'}
                      </button>
                    </div>
                  </div>
                  ); })()}
                </div>
              ))}

              {/* STEP: CONFIRM - show after clicking Next */}
              {cpStep === 'confirm' && !cpSyncResults && (() => {
                const selected = cpReceipts.filter(r => cpSelected[r.masterId]);
                const allCheques = [];
                let grandTotal = 0;
                for (const r of selected) {
                  const form = cpForms[r.masterId] || { odbcParty: '', chequeLines: [] };
                  for (const l of form.chequeLines) {
                    const amt = parseFloat(l.amount) || 0;
                    allCheques.push({ party: form.odbcParty || r.partyName, ...l, amount: amt });
                    grandTotal += amt;
                  }
                }
                return (
                  <div style={{ marginTop: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <button onClick={() => setCpStep('entry')} style={{ padding: '6px 16px', fontSize: '12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t2)', cursor: 'pointer' }}>
                        Back to Entry
                      </button>
                      <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--t1)' }}>Confirmation - {selected.length} parties, {allCheques.length} cheques</div>
                    </div>

                    {/* Summary cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '16px' }}>
                      <div style={{ padding: '12px', background: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Total Cheques</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--accent)' }}>{allCheques.length}</div>
                      </div>
                      <div style={{ padding: '12px', background: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Total Amount</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--green)' }}>{formatCurrency(grandTotal)}</div>
                      </div>
                      <div style={{ padding: '12px', background: 'var(--card)', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                        <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Parties</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--t1)' }}>{selected.length}</div>
                      </div>
                    </div>

                    {/* Cheque details table */}
                    <div style={{ background: 'var(--card)', borderRadius: '10px', border: '1px solid var(--border)', overflow: 'hidden', marginBottom: '16px' }}>
                      <div style={{ padding: '10px 14px', background: 'var(--bg)', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: '700', color: 'var(--t1)' }}>
                        ODBC CHq Mgmt - Cheque Entries
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg)' }}>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--t3)' }}>#</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--t3)' }}>Party (ODBC)</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--t3)' }}>Bill Name</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--t3)' }}>Cheque #</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--t3)' }}>Bank</th>
                            <th style={{ padding: '6px 10px', textAlign: 'left', color: 'var(--t3)' }}>BS Date</th>
                            <th style={{ padding: '6px 10px', textAlign: 'right', color: 'var(--t3)' }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allCheques.map((c, i) => (
                            <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '6px 10px', color: 'var(--t3)' }}>{i + 1}</td>
                              <td style={{ padding: '6px 10px', color: 'var(--t1)', fontWeight: '600' }}>{c.party}</td>
                              <td style={{ padding: '6px 10px', color: 'var(--t2)', fontSize: '11px' }}>{[c.chequeNumber, c.bankName].filter(Boolean).join('/')}</td>
                              <td style={{ padding: '6px 10px', color: 'var(--t1)', fontFamily: 'var(--mono)' }}>{c.chequeNumber}</td>
                              <td style={{ padding: '6px 10px', color: 'var(--t2)' }}>{c.bankName}</td>
                              <td style={{ padding: '6px 10px', color: 'var(--accent)', fontFamily: 'var(--mono)' }}>{adToBsDisplay(c.chequeDate)}</td>
                              <td style={{ padding: '6px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--t1)' }}>{formatCurrency(c.amount)}</td>
                            </tr>
                          ))}
                          <tr style={{ borderTop: '2px solid var(--border)', background: 'var(--bg)' }}>
                            <td colSpan={6} style={{ padding: '8px 10px', fontWeight: '700', color: 'var(--t1)', textAlign: 'right' }}>Total:</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '700', fontSize: '14px', color: 'var(--green)' }}>{formatCurrency(grandTotal)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Journal voucher preview */}
                    <div style={{ background: 'var(--card)', borderRadius: '10px', border: '2px solid var(--accent)', overflow: 'hidden', marginBottom: '16px' }}>
                      <div style={{ padding: '10px 14px', background: 'rgba(99,102,241,0.08)', borderBottom: '1px solid var(--border)', fontSize: '12px', fontWeight: '700', color: 'var(--accent)' }}>
                        Journal Voucher - For DB (Billing Company)
                      </div>
                      <div style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
                          <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.06)', borderRadius: '6px', border: '1px solid rgba(239,68,68,0.15)' }}>
                            <div style={{ fontSize: '10px', color: 'var(--t3)', marginBottom: '2px' }}>DEBIT</div>
                            <div style={{ fontWeight: '700', color: 'var(--t1)' }}>Cheque Management</div>
                            <div style={{ fontFamily: 'var(--mono)', fontWeight: '700', color: 'var(--red)', fontSize: '16px' }}>{formatCurrency(grandTotal)}</div>
                          </div>
                          <div style={{ padding: '8px 12px', background: 'rgba(34,197,94,0.06)', borderRadius: '6px', border: '1px solid rgba(34,197,94,0.15)' }}>
                            <div style={{ fontSize: '10px', color: 'var(--t3)', marginBottom: '2px' }}>CREDIT</div>
                            <div style={{ fontWeight: '700', color: 'var(--t1)' }}>Cheque Receipt</div>
                            <div style={{ fontFamily: 'var(--mono)', fontWeight: '700', color: 'var(--green)', fontSize: '16px' }}>{formatCurrency(grandTotal)}</div>
                          </div>
                        </div>
                        <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--t3)' }}>
                          <strong>Narration:</strong> {allCheques.length} cheques - {selected.map(r => {
                            const form = cpForms[r.masterId];
                            return `${(form?.odbcParty || r.partyName).split(',')[0].trim()} (${form?.chequeLines?.length || 0})`;
                          }).join(', ')}
                        </div>
                        <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--t3)' }}>
                          <strong>Voucher #:</strong> CHQ-{allCheques.length}chqs-{(cpDate || '').replace(/-/g, '')}
                        </div>
                      </div>
                    </div>

                    {/* Confirm button */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                      <button onClick={() => setCpStep('entry')} style={{ padding: '10px 24px', fontSize: '14px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--t2)', cursor: 'pointer' }}>
                        Back
                      </button>
                      <button onClick={cpSyncAll} disabled={cpSyncAllLoading}
                        style={{ padding: '10px 32px', fontSize: '14px', fontWeight: '700', background: 'var(--green)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', opacity: cpSyncAllLoading ? 0.6 : 1 }}>
                        {cpSyncAllLoading ? 'Posting to Tally...' : `Confirm & Post All (${allCheques.length} cheques)`}
                      </button>
                    </div>
                  </div>
                );
              })()}

              {/* STEP: RESULTS */}
              {cpSyncResults && (
                <div style={{ marginTop: '16px' }}>
                  <div style={{ background: 'var(--card)', borderRadius: '10px', border: `2px solid ${cpSyncResults.summary?.journalCreated ? 'var(--green)' : 'var(--orange)'}`, padding: '20px', textAlign: 'center' }}>
                    <div style={{ fontSize: '32px', marginBottom: '8px' }}>{cpSyncResults.summary?.journalCreated ? '✓' : '!'}</div>
                    <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--t1)', marginBottom: '8px' }}>
                      {cpSyncResults.summary?.journalCreated ? 'All Posted Successfully' : 'Partial Success'}
                    </div>
                    <div style={{ fontSize: '13px', color: 'var(--t2)', marginBottom: '4px' }}>
                      ODBC: {cpSyncResults.summary?.successfulODBC}/{cpSyncResults.summary?.totalReceipts} receipts | {cpSyncResults.summary?.totalCheques} cheques | {formatCurrency(cpSyncResults.summary?.totalAmount || 0)}
                    </div>
                    {cpSyncResults.journalResult && (
                      <div style={{ fontSize: '12px', color: cpSyncResults.journalResult.success ? 'var(--green)' : 'var(--red)', marginTop: '4px' }}>
                        Journal: {cpSyncResults.journalResult.success ? `Created (${cpSyncResults.journalResult.voucherNumber})` : `Failed: ${cpSyncResults.journalResult.error}`}
                      </div>
                    )}
                    {cpSyncResults.odbcResults?.some(r => !r.success) && (
                      <div style={{ marginTop: '8px', textAlign: 'left', fontSize: '11px' }}>
                        {cpSyncResults.odbcResults.filter(r => !r.success).map((r, i) => (
                          <div key={i} style={{ color: 'var(--red)', padding: '2px 0' }}>Failed: {r.partyName} - {r.error}</div>
                        ))}
                      </div>
                    )}
                    <button onClick={() => { setCpSyncResults(null); setCpStep('entry'); setCpSelected({}); fetchChequePost(cpDate); }}
                      style={{ marginTop: '16px', padding: '8px 24px', fontSize: '13px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* XML VIEWER PAGE */}
            <div className={`page ${currentPage === 'xml-viewer' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>Tally XML Viewer</div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <input type="date" value={xmlFromDate} onChange={e => setXmlFromDate(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  <span style={{ color: 'var(--t3)', fontSize: '12px' }}>to</span>
                  <input type="date" value={xmlToDate} onChange={e => setXmlToDate(e.target.value)} style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }} />
                  <button className="btn btn-p" style={{ padding: '6px 14px', fontSize: '12px' }} onClick={fetchXmlVouchers} disabled={xmlLoading}>
                    {xmlLoading ? 'Fetching...' : 'Fetch from Tally'}
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search party, voucher no, narration..."
                  value={xmlSearch}
                  onChange={e => setXmlSearch(e.target.value)}
                  style={{ padding: '6px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px', flex: '1', minWidth: '200px' }}
                />
                <select
                  value={xmlTypeFilter}
                  onChange={e => setXmlTypeFilter(e.target.value)}
                  style={{ padding: '6px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '12px' }}
                >
                  <option value="">All Types</option>
                  {[...new Set(xmlVouchers.map(v => v.voucherType))].sort().map(t => (
                    <option key={t} value={t}>{t} ({xmlVouchers.filter(v => v.voucherType === t).length})</option>
                  ))}
                </select>
                <span style={{ fontSize: '12px', color: 'var(--t3)' }}>
                  {xmlVouchers.length} vouchers from Tally
                </span>
              </div>

              {xmlLoading ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--t3)' }}>
                  <div style={{ fontSize: '24px', marginBottom: '12px' }}>Fetching vouchers from Tally...</div>
                  <div style={{ fontSize: '13px' }}>This may take a while for 5 months of data</div>
                </div>
              ) : xmlVouchers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--t3)' }}>
                  <div style={{ fontSize: '40px', marginBottom: '12px' }}>🔍</div>
                  <div style={{ fontSize: '16px', marginBottom: '8px' }}>XML Viewer</div>
                  <div style={{ fontSize: '13px' }}>Click "Fetch from Tally" to load vouchers and view their raw XML data</div>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '12px', height: 'calc(100vh - 220px)' }}>
                  {/* Left: Voucher List */}
                  <div style={{ width: '45%', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)' }}>
                    <table className="table" style={{ fontSize: '11px' }}>
                      <thead>
                        <tr>
                          {[
                            { key: 'masterId', label: 'MID' },
                            { key: 'voucherType', label: 'Type' },
                            { key: 'partyLedgerName', label: 'Party' },
                            { key: 'voucherNumber', label: 'No' },
                            { key: 'amount', label: 'Amount', className: 'r' },
                            { key: 'date', label: 'Date' },
                          ].map(col => (
                            <th
                              key={col.key}
                              className={col.className || ''}
                              onClick={() => setXmlSort(prev => ({ field: col.key, dir: prev.field === col.key && prev.dir === 'desc' ? 'asc' : 'desc' }))}
                              style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                            >
                              {col.label} {xmlSort.field === col.key ? (xmlSort.dir === 'desc' ? '▼' : '▲') : ''}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {xmlVouchers
                          .filter(v => {
                            const q = xmlSearch.toLowerCase();
                            const matchSearch = !q || (v.partyLedgerName || '').toLowerCase().includes(q) || (v.partyName || '').toLowerCase().includes(q) || (v.voucherNumber || '').toLowerCase().includes(q) || (v.narration || '').toLowerCase().includes(q) || (v.masterId || '').includes(q);
                            const matchType = !xmlTypeFilter || v.voucherType === xmlTypeFilter;
                            return matchSearch && matchType;
                          })
                          .sort((a, b) => {
                            const f = xmlSort.field;
                            let av = a[f] || '', bv = b[f] || '';
                            if (f === 'masterId' || f === 'amount') { av = parseFloat(av) || 0; bv = parseFloat(bv) || 0; }
                            else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
                            if (av < bv) return xmlSort.dir === 'asc' ? -1 : 1;
                            if (av > bv) return xmlSort.dir === 'asc' ? 1 : -1;
                            return 0;
                          })
                          .map(v => {
                            const isSelected = xmlSelectedVoucher === v.masterId;
                            const partyDiffers = v.partyLedgerName && v.partyName && v.partyLedgerName !== v.partyName;
                            return (
                              <tr
                                key={v.masterId}
                                onClick={() => fetchXmlVoucherDetail(v.masterId)}
                                style={{ cursor: 'pointer', background: isSelected ? 'var(--blue-g)' : undefined, borderLeft: isSelected ? '3px solid var(--blue)' : undefined }}
                              >
                                <td className="mono" style={{ fontSize: '10px' }}>{v.masterId}</td>
                                <td>
                                  <span className={`vt-badge ${v.voucherType?.toLowerCase().includes('sales') ? 'sales' : v.voucherType?.toLowerCase().includes('receipt') ? 'receipt' : v.voucherType?.toLowerCase().includes('payment') ? 'payment' : 'journal'}`} style={{ fontSize: '9px', padding: '1px 5px' }}>
                                    {v.voucherType}
                                  </span>
                                </td>
                                <td style={{ maxWidth: '180px' }}>
                                  <div style={{ fontWeight: '600', fontSize: '11px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {v.partyLedgerName || '-'}
                                  </div>
                                  {partyDiffers && (
                                    <div style={{ fontSize: '10px', color: 'var(--green)', fontWeight: '500' }}>
                                      PARTYNAME: {v.partyName}
                                    </div>
                                  )}
                                </td>
                                <td className="mono" style={{ fontSize: '10px' }}>{v.voucherNumber || '-'}</td>
                                <td className="r mono" style={{ fontSize: '11px', fontWeight: '600' }}>
                                  {formatCurrency(v.amount)}
                                </td>
                                <td style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>
                                  {v.date ? `${v.date.slice(6,8)}/${v.date.slice(4,6)}/${v.date.slice(0,4)}` : '-'}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  {/* Right: XML Detail */}
                  <div style={{ width: '55%', overflowY: 'auto', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--card)' }}>
                    {xmlDetailLoading ? (
                      <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading XML from Tally...</div>
                    ) : xmlRawData ? (
                      <div style={{ padding: '0' }}>
                        {/* Tab: Raw XML / Parsed JSON */}
                        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 2 }}>
                          <button
                            onClick={() => setXmlSelectedVoucher(prev => prev)}
                            style={{ padding: '8px 16px', fontSize: '12px', fontWeight: '600', background: 'var(--blue-g)', color: 'var(--blue)', border: 'none', borderBottom: '2px solid var(--blue)', cursor: 'default' }}
                          >
                            MasterID: {xmlSelectedVoucher}
                          </button>
                          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 8px' }}>
                            <div style={{ position: 'relative', width: '100%', maxWidth: '280px' }}>
                              <input
                                type="text"
                                placeholder="Find in XML..."
                                value={xmlFind}
                                onChange={e => setXmlFind(e.target.value)}
                                style={{ width: '100%', padding: '4px 28px 4px 10px', fontSize: '11px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--t1)', fontFamily: 'var(--mono)' }}
                              />
                              {xmlFind && (
                                <>
                                  <span style={{ position: 'absolute', right: '24px', top: '50%', transform: 'translateY(-50%)', fontSize: '9px', color: 'var(--t3)' }}>
                                    {(xmlRawData?.rawXml || '').toLowerCase().split(xmlFind.toLowerCase()).length - 1}
                                  </span>
                                  <button onClick={() => setXmlFind('')} style={{ position: 'absolute', right: '4px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: '12px', padding: '0 2px' }}>x</button>
                                </>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              if (xmlRawData?.rawXml) {
                                navigator.clipboard.writeText(xmlRawData.rawXml);
                              }
                            }}
                            style={{ padding: '6px 12px', fontSize: '11px', background: 'transparent', color: 'var(--t2)', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            Copy XML
                          </button>
                        </div>

                        {/* Key Fields Summary */}
                        {xmlRawData.parsed && (() => {
                          const env = xmlRawData.parsed?.ENVELOPE;
                          const voucher = env?.BODY?.[0]?.DESC?.[0]?.DATA?.[0]?.COLLECTION?.[0]?.VOUCHER?.[0]
                                       || env?.COLLECTION?.[0]?.VOUCHER?.[0]
                                       || env?.BODY?.[0]?.DATA?.[0]?.COLLECTION?.[0]?.VOUCHER?.[0]
                                       || null;
                          if (!voucher) return null;

                          const getVal = (obj, key) => {
                            const v = obj?.[key];
                            if (!v) return '';
                            if (Array.isArray(v)) return typeof v[0] === 'object' ? (v[0]._ || JSON.stringify(v[0])) : v[0];
                            if (typeof v === 'object') return v._ || JSON.stringify(v);
                            return v;
                          };

                          return (
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg)' }}>
                              <div style={{ fontSize: '13px', fontWeight: '700', marginBottom: '8px', color: 'var(--t1)' }}>Key Fields</div>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: '11px' }}>
                                {['PARTYLEDGERNAME', 'PARTYNAME', 'DATE', 'VOUCHERTYPENAME', 'VOUCHERNUMBER', 'AMOUNT', 'NARRATION', 'GUID', 'MASTERID', 'ALTERID', 'EFFECTIVEDATE', 'ALTEREDDATE', 'PRIORDATE', 'VCHSTATUSDATE'].map(field => {
                                  const val = getVal(voucher, field);
                                  if (!val) return null;
                                  const isPartyField = field === 'PARTYLEDGERNAME' || field === 'PARTYNAME';
                                  return (
                                    <div key={field} style={{ display: 'flex', gap: '6px', padding: '2px 0' }}>
                                      <span style={{ color: 'var(--blue)', fontWeight: '600', minWidth: '140px', fontFamily: 'var(--mono)', fontSize: '10px' }}>{field}:</span>
                                      <span style={{ color: isPartyField ? 'var(--green)' : 'var(--t1)', fontWeight: isPartyField ? '700' : '400' }}>{String(val)}</span>
                                    </div>
                                  );
                                })}
                              </div>

                              {/* Ledger Entries */}
                              {(() => {
                                const ledgerEntries = voucher?.['ALLLEDGERENTRIES.LIST'] || voucher?.['LEDGERENTRIES.LIST'] || [];
                                const entries = Array.isArray(ledgerEntries) ? ledgerEntries : [ledgerEntries];
                                if (entries.length === 0 || !entries[0]) return null;
                                return (
                                  <div style={{ marginTop: '10px' }}>
                                    <div style={{ fontSize: '12px', fontWeight: '700', marginBottom: '4px', color: 'var(--orange)' }}>Ledger Entries ({entries.length})</div>
                                    <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse' }}>
                                      <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                          <th style={{ textAlign: 'left', padding: '3px 6px', color: 'var(--t3)' }}>Ledger</th>
                                          <th style={{ textAlign: 'right', padding: '3px 6px', color: 'var(--t3)' }}>Amount</th>
                                          <th style={{ textAlign: 'left', padding: '3px 6px', color: 'var(--t3)' }}>Deemed+</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {entries.map((le, i) => (
                                          <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '3px 6px', fontWeight: '600' }}>{getVal(le, 'LEDGERNAME')}</td>
                                            <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'var(--mono)' }}>{getVal(le, 'AMOUNT')}</td>
                                            <td style={{ padding: '3px 6px', fontSize: '10px' }}>{getVal(le, 'ISDEEMEDPOSITIVE')}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                );
                              })()}
                            </div>
                          );
                        })()}

                        {/* Raw XML */}
                        <pre style={{ padding: '12px 16px', margin: 0, fontSize: '10px', fontFamily: 'var(--mono)', color: 'var(--t2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.5 }}>
                          {(() => {
                            const xml = xmlRawData.rawXml || 'No XML data';
                            if (!xmlFind) return xml;
                            const parts = xml.split(new RegExp(`(${xmlFind.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
                            return parts.map((part, i) =>
                              part.toLowerCase() === xmlFind.toLowerCase()
                                ? <mark key={i} style={{ background: '#f59e0b', color: '#000', borderRadius: '2px', padding: '0 1px' }}>{part}</mark>
                                : part
                            );
                          })()}
                        </pre>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--t3)' }}>
                        <div style={{ fontSize: '32px', marginBottom: '12px' }}>👈</div>
                        <div style={{ fontSize: '14px' }}>Click a voucher to view its XML data</div>
                        <div style={{ fontSize: '12px', marginTop: '8px' }}>Shows PARTYLEDGERNAME, PARTYNAME, all ledger entries and raw XML</div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* CHEQUE VOUCHER LIST PAGE */}
            <div className={`page ${currentPage === 'cheque-vouchers' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div className="sec-title" style={{ fontSize: '18px' }}>📋 Cheque Company Vouchers</div>
                  {chqStats?.lastSyncedAt && (
                    <div style={{ fontSize: '11px', color: 'var(--t3)', marginTop: '4px' }}>
                      Last synced: {new Date(chqStats.lastSyncedAt).toLocaleString()}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="rush-btn" onClick={handleSyncODBCVouchers} disabled={chqSyncing} style={{ padding: '8px 16px', fontSize: '12px', background: chqSyncing ? 'var(--bg2)' : 'var(--accent)', color: chqSyncing ? 'var(--t3)' : '#fff', border: 'none', borderRadius: 'var(--r)', cursor: chqSyncing ? 'wait' : 'pointer' }}>
                    {chqSyncing ? '⟳ Syncing from Tally...' : '🔄 Sync from Tally'}
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  className="search-box"
                  placeholder="🔍 Search party, voucher#, bank, narration..."
                  value={chqSearch}
                  onChange={(e) => setChqSearch(e.target.value)}
                  style={{ width: '300px' }}
                />
                <select
                  value={chqTypeFilter}
                  onChange={(e) => setChqTypeFilter(e.target.value)}
                  style={{ padding: '7px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--r)', color: 'var(--t1)', fontSize: '12px', fontFamily: 'var(--font)' }}
                >
                  <option value="">All Voucher Types</option>
                  {[...new Set(chqVouchers.map(v => v.voucherType).filter(Boolean))].sort().map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {chqVouchersLoading ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                  <div className="loading-spinner"></div>
                </div>
              ) : (() => {
                const filtered = chqVouchers
                  .filter(v => {
                    if (chqTypeFilter && v.voucherType !== chqTypeFilter) return false;
                    if (!chqSearch) return true;
                    const s = chqSearch.toLowerCase();
                    return (v.partyName || '').toLowerCase().includes(s)
                      || (v.voucherNumber || '').toLowerCase().includes(s)
                      || (v.bankName || '').toLowerCase().includes(s)
                      || (v.chequeNumber || '').toLowerCase().includes(s)
                      || (v.narration || '').toLowerCase().includes(s);
                  })
                  .sort((a, b) => {
                    const av = a[chqSortField] || '';
                    const bv = b[chqSortField] || '';
                    if (['amount', 'masterId', 'alterId'].includes(chqSortField)) return chqSortDir === 'asc' ? (parseFloat(av) || 0) - (parseFloat(bv) || 0) : (parseFloat(bv) || 0) - (parseFloat(av) || 0);
                    return chqSortDir === 'asc' ? String(av).localeCompare(String(bv)) : String(bv).localeCompare(String(av));
                  });

                const totalAmt = filtered.reduce((s, v) => s + (parseFloat(v.amount) || 0), 0);
                const typeCounts = {};
                filtered.forEach(v => { typeCounts[v.voucherType || 'Unknown'] = (typeCounts[v.voucherType || 'Unknown'] || 0) + 1; });

                const sortIcon = (field) => chqSortField === field ? (chqSortDir === 'asc' ? ' ▲' : ' ▼') : '';
                const toggleSort = (field) => {
                  if (chqSortField === field) setChqSortDir(d => d === 'asc' ? 'desc' : 'asc');
                  else { setChqSortField(field); setChqSortDir('asc'); }
                };

                return (
                  <div>
                    {/* Summary cards */}
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                      <div style={{ padding: '10px 16px', background: 'var(--blue-g)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px' }}>📄</span>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--t3)', textTransform: 'uppercase' }}>Total Vouchers</div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--blue)', fontFamily: 'var(--mono)' }}>{filtered.length}</div>
                        </div>
                      </div>
                      <div style={{ padding: '10px 16px', background: 'rgba(34,197,94,0.1)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '18px' }}>💰</span>
                        <div>
                          <div style={{ fontSize: '10px', color: 'var(--t3)', textTransform: 'uppercase' }}>Total Amount</div>
                          <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--green)', fontFamily: 'var(--mono)' }}>{formatCurrency(totalAmt)}</div>
                        </div>
                      </div>
                      {Object.entries(typeCounts).map(([type, count]) => (
                        <div key={type} style={{ padding: '10px 16px', background: 'var(--bg2)', borderRadius: 'var(--r)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', border: chqTypeFilter === type ? '1px solid var(--blue)' : '1px solid var(--border)' }}
                          onClick={() => setChqTypeFilter(chqTypeFilter === type ? '' : type)}>
                          <div>
                            <div style={{ fontSize: '10px', color: 'var(--t3)', textTransform: 'uppercase' }}>{type}</div>
                            <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--t1)', fontFamily: 'var(--mono)' }}>{count}</div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Table */}
                    <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--r)' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg)', borderBottom: '2px solid var(--border)' }}>
                            <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>#</th>
                            <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600', cursor: 'pointer' }} onClick={() => toggleSort('voucherNumber')}>Voucher #{sortIcon('voucherNumber')}</th>
                            <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600', cursor: 'pointer' }} onClick={() => toggleSort('voucherType')}>Type{sortIcon('voucherType')}</th>
                            <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600', cursor: 'pointer' }} onClick={() => toggleSort('voucherDate')}>Date{sortIcon('voucherDate')}</th>
                            <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600', cursor: 'pointer' }} onClick={() => toggleSort('partyName')}>Party{sortIcon('partyName')}</th>
                            <th style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--t3)', fontWeight: '600', cursor: 'pointer' }} onClick={() => toggleSort('amount')}>Amount{sortIcon('amount')}</th>
                            <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Receipt Mode</th>
                            <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Cheque #</th>
                            <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Cheque Date</th>
                            <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600', cursor: 'pointer' }} onClick={() => toggleSort('masterId')}>Master ID{sortIcon('masterId')}</th>
                            <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>GUID</th>
                            <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600', cursor: 'pointer' }} onClick={() => toggleSort('alterId')}>Alter ID{sortIcon('alterId')}</th>
                            <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)', fontWeight: '600' }}>Narration</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((v, i) => {
                            const modes = (v.ledgerEntries || []).map(e => e.ledger).filter(Boolean);
                            return (
                            <tr key={v.masterId || i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 ? 'var(--bg)' : 'transparent' }}>
                              <td style={{ padding: '8px', color: 'var(--t3)' }}>{i + 1}</td>
                              <td style={{ padding: '8px', color: 'var(--blue)', fontFamily: 'var(--mono)', fontWeight: '500' }}>{v.voucherNumber || '-'}</td>
                              <td style={{ padding: '8px' }}>
                                <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', background: 'var(--bg2)', color: 'var(--t2)', border: '1px solid var(--border)' }}>
                                  {v.voucherType || '-'}
                                </span>
                              </td>
                              <td style={{ padding: '8px', color: 'var(--t2)' }}>{v.voucherDate ? String(v.voucherDate).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : '-'}</td>
                              <td style={{ padding: '8px', color: 'var(--t1)', fontWeight: '500' }}>{v.partyName || '-'}</td>
                              <td style={{ padding: '8px', textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--t1)' }}>{formatCurrency(v.amount)}</td>
                              <td style={{ padding: '8px', fontSize: '10px' }}>
                                {modes.length > 0 ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {modes.map((m, j) => (
                                      <span key={j} style={{ padding: '1px 6px', borderRadius: '8px', background: m === 'Cash' ? 'rgba(34,197,94,0.15)' : 'rgba(59,130,246,0.1)', color: m === 'Cash' ? 'var(--green)' : 'var(--blue)', fontWeight: '500', whiteSpace: 'nowrap' }}>
                                        {m}
                                      </span>
                                    ))}
                                  </div>
                                ) : '-'}
                              </td>
                              <td style={{ padding: '8px', color: 'var(--t2)', fontFamily: 'var(--mono)' }}>{v.chequeNumber || '-'}</td>
                              <td style={{ padding: '8px', color: 'var(--t2)' }}>{v.chequeDate ? String(v.chequeDate).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : '-'}</td>
                              <td style={{ padding: '8px', color: 'var(--t3)', fontFamily: 'var(--mono)', fontSize: '11px' }}>{v.masterId || '-'}</td>
                              <td style={{ padding: '8px', color: 'var(--t3)', fontFamily: 'var(--mono)', fontSize: '10px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.guid || ''}>{v.guid ? v.guid.substring(0, 12) + '...' : '-'}</td>
                              <td style={{ padding: '8px', color: 'var(--t3)', fontFamily: 'var(--mono)', fontSize: '11px' }}>{v.alterId || '-'}</td>
                              <td style={{ padding: '8px', color: 'var(--t3)', fontSize: '11px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.narration || ''}>{v.narration || '-'}</td>
                            </tr>
                            );
                          })}
                          {filtered.length === 0 && (
                            <tr><td colSpan={12} style={{ padding: '30px', textAlign: 'center', color: 'var(--t3)' }}>
                              {chqVouchers.length === 0 ? 'No vouchers in DB. Click "Sync from Tally" to fetch.' : 'No matching vouchers'}
                            </td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* CHEQUE COLLECTION PAGE */}
            <div className={`page ${currentPage === 'collection' ? 'active' : ''}`}>
              {/* Tabs */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {[['assign', 'Assign'], ['collect', 'Collect'], ['receivable', 'Receivable'], ['staff', 'Staff'], ['history', 'History']].map(([key, label]) => (
                  <button key={key} onClick={() => { setCollTab(key); if (key === 'assign' || key === 'collect' || key === 'history') fetchCollectionData(); if (key === 'receivable') fetchChequeReceivable(); }}
                    style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', cursor: 'pointer', fontWeight: collTab === key ? '700' : '500',
                      background: collTab === key ? 'var(--accent)' : 'var(--card)', color: collTab === key ? '#fff' : 'var(--t2)', fontSize: '13px' }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* ASSIGN TAB */}
              {collTab === 'assign' && (
                <div>
                  {/* Staff selector + Create Batch */}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap' }}>
                    <select value={collSelectedStaff} onChange={e => setCollSelectedStaff(e.target.value)}
                      style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--t1)', fontSize: '13px', minWidth: '180px' }}>
                      <option value="">-- Select Staff --</option>
                      {collStaff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.tally_ledger_name})</option>)}
                    </select>
                    <button onClick={() => { setCollShowStaffForm(true); setCollTab('staff'); }}
                      style={{ padding: '8px 14px', borderRadius: '8px', border: '1px dashed var(--border)', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', fontSize: '12px' }}>
                      + Add Staff
                    </button>
                    <div style={{ flex: 1 }} />
                    <input placeholder="Search cheques..." value={collSearch} onChange={e => setCollSearch(e.target.value)}
                      style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--t1)', fontSize: '13px', width: '200px' }} />
                  </div>

                  {/* Stats bar */}
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', fontSize: '12px', color: 'var(--t3)' }}>
                    <span>Available: <b style={{ color: 'var(--t1)' }}>{collAssignable.length}</b> cheques</span>
                    <span>|</span>
                    <span>Selected: <b style={{ color: 'var(--accent)' }}>{collSelected.size}</b></span>
                    <span>|</span>
                    <span>Amount: <b style={{ color: 'var(--accent)' }}>{formatCurrency(collAssignable.filter(c => collSelected.has(c.id)).reduce((s, c) => s + (c.amount || 0), 0))}</b></span>
                  </div>

                  {/* Cheques table */}
                  {collLoading ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading...</div> : (
                    <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
                      <table className="table" style={{ fontSize: '12px' }}>
                        <thead>
                          <tr style={{ background: 'var(--card)' }}>
                            <th style={{ padding: '8px', width: '30px' }}>
                              <input type="checkbox" checked={collAssignable.length > 0 && collSelected.size === collAssignable.filter(c => {
                                const s = collSearch.toLowerCase();
                                return !s || (c.party_name || '').toLowerCase().includes(s) || (c.cheque_number || '').includes(s);
                              }).length}
                                onChange={e => {
                                  const s = collSearch.toLowerCase();
                                  const filtered = collAssignable.filter(c => !s || (c.party_name || '').toLowerCase().includes(s) || (c.cheque_number || '').includes(s));
                                  setCollSelected(e.target.checked ? new Set(filtered.map(c => c.id)) : new Set());
                                }} />
                            </th>
                            <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)' }}>Party Name</th>
                            <th style={{ padding: '8px', textAlign: 'right', color: 'var(--t3)' }}>Amount</th>
                            <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)' }}>Cheque #</th>
                            <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)' }}>Date</th>
                            <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)' }}>Bank</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(() => {
                            const s = collSearch.toLowerCase();
                            const filtered = collAssignable.filter(c => !s || (c.party_name || '').toLowerCase().includes(s) || (c.cheque_number || '').includes(s));
                            if (filtered.length === 0) return <tr><td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--t3)' }}>No assignable cheques</td></tr>;
                            return filtered.map(c => (
                              <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: collSelected.has(c.id) ? 'rgba(99,102,241,0.08)' : 'transparent' }}
                                onClick={() => { const s = new Set(collSelected); s.has(c.id) ? s.delete(c.id) : s.add(c.id); setCollSelected(s); }}>
                                <td style={{ padding: '8px' }}><input type="checkbox" checked={collSelected.has(c.id)} readOnly /></td>
                                <td style={{ padding: '8px', color: 'var(--t1)', fontWeight: '500' }}>{c.party_name}</td>
                                <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: 'var(--t1)' }}>{formatCurrency(c.amount)}</td>
                                <td style={{ padding: '8px', color: 'var(--t2)' }}>{c.cheque_number || '-'}</td>
                                <td style={{ padding: '8px', color: 'var(--t2)' }}>{c.cheque_date || '-'}</td>
                                <td style={{ padding: '8px', color: 'var(--t2)' }}>{c.bank_name || '-'}</td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Create batch button */}
                  <div style={{ marginTop: '14px', display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button onClick={handleCreateBatch} disabled={!collSelectedStaff || collSelected.size === 0 || collSyncing}
                      style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: (!collSelectedStaff || collSelected.size === 0) ? 'var(--border)' : 'var(--accent)',
                        color: '#fff', cursor: (!collSelectedStaff || collSelected.size === 0) ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '14px' }}>
                      {collSyncing ? 'Creating...' : `Create Batch & Print (${collSelected.size} cheques)`}
                    </button>
                  </div>
                </div>
              )}

              {/* COLLECT TAB */}
              {collTab === 'collect' && (
                <div>
                  {!collActiveBatch ? (
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: 'var(--t1)' }}>Active Batches</div>
                      {collBatches.filter(b => b.status === 'assigned' || b.status === 'in_progress').length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>No active batches. Assign cheques first.</div>
                      ) : (
                        collBatches.filter(b => b.status === 'assigned' || b.status === 'in_progress').map(b => (
                          <div key={b.id} onClick={() => handleOpenBatch(b.id)}
                            style={{ padding: '14px', marginBottom: '8px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', cursor: 'pointer',
                              display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                              <div style={{ fontWeight: '600', color: 'var(--t1)', fontSize: '14px' }}>Batch #{b.id} - {b.staff_name}</div>
                              <div style={{ fontSize: '12px', color: 'var(--t3)', marginTop: '4px' }}>{b.assigned_date} | {b.total_cheques} cheques | {formatCurrency(b.total_amount)}</div>
                            </div>
                            <div style={{ padding: '4px 10px', borderRadius: '6px', background: 'rgba(99,102,241,0.1)', color: 'var(--accent)', fontSize: '12px', fontWeight: '600' }}>
                              {b.status}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  ) : (
                    <div>
                      {/* Batch header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                        <div>
                          <div style={{ fontWeight: '700', fontSize: '16px', color: 'var(--t1)' }}>Batch #{collActiveBatch.id} - {collActiveBatch.staff_name}</div>
                          <div style={{ fontSize: '12px', color: 'var(--t3)' }}>{collActiveBatch.assigned_date} | {collActiveBatch.total_cheques} cheques | {formatCurrency(collActiveBatch.total_amount)}</div>
                        </div>
                        <button onClick={() => setCollActiveBatch(null)} style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--t2)', cursor: 'pointer', fontSize: '12px' }}>
                          Back
                        </button>
                      </div>

                      {/* Quick action buttons */}
                      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
                        <button onClick={() => { const s = {}; collActiveBatchItems.forEach(i => { s[i.id] = 'collected'; }); setCollItemStatuses(s); }}
                          style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                          Mark All Collected
                        </button>
                        <button onClick={() => { const s = { ...collItemStatuses }; collActiveBatchItems.forEach(i => { if (s[i.id] === 'pending') s[i.id] = 'returned'; }); setCollItemStatuses(s); }}
                          style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: '#f59e0b', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                          Mark Remaining Returned
                        </button>
                      </div>

                      {/* Items table */}
                      <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <table className="table" style={{ fontSize: '12px' }}>
                          <thead>
                            <tr style={{ background: 'var(--card)' }}>
                              <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)' }}>#</th>
                              <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)' }}>Party Name</th>
                              <th style={{ padding: '8px', textAlign: 'right', color: 'var(--t3)' }}>Amount</th>
                              <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)' }}>Cheque #</th>
                              <th style={{ padding: '8px', textAlign: 'left', color: 'var(--t3)' }}>Date</th>
                              <th style={{ padding: '8px', textAlign: 'center', color: 'var(--t3)', minWidth: '120px' }}>Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {collActiveBatchItems.map((item, idx) => {
                              const st = collItemStatuses[item.id] || 'pending';
                              const stColor = st === 'collected' ? '#22c55e' : st === 'returned' ? '#f59e0b' : st === 'bounced' ? '#ef4444' : 'var(--t3)';
                              return (
                                <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', background: st === 'collected' ? 'rgba(34,197,94,0.05)' : st === 'returned' ? 'rgba(245,158,11,0.05)' : st === 'bounced' ? 'rgba(239,68,68,0.05)' : 'transparent' }}>
                                  <td style={{ padding: '8px', color: 'var(--t3)' }}>{idx + 1}</td>
                                  <td style={{ padding: '8px', color: 'var(--t1)', fontWeight: '500' }}>{item.party_name}</td>
                                  <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: 'var(--t1)' }}>{formatCurrency(item.amount)}</td>
                                  <td style={{ padding: '8px', color: 'var(--t2)' }}>{item.cheque_number || '-'}</td>
                                  <td style={{ padding: '8px', color: 'var(--t2)' }}>{item.cheque_date || '-'}</td>
                                  <td style={{ padding: '8px', textAlign: 'center' }}>
                                    <select value={st} onChange={e => setCollItemStatuses(prev => ({ ...prev, [item.id]: e.target.value }))}
                                      style={{ padding: '4px 8px', borderRadius: '6px', border: `1px solid ${stColor}`, background: 'transparent', color: stColor, fontWeight: '600', fontSize: '12px', cursor: 'pointer' }}>
                                      <option value="pending">Pending</option>
                                      <option value="collected">Collected</option>
                                      <option value="returned">Returned</option>
                                      <option value="bounced">Bounced</option>
                                    </select>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Summary + action buttons */}
                      {(() => {
                        const collected = collActiveBatchItems.filter(i => collItemStatuses[i.id] === 'collected');
                        const returned = collActiveBatchItems.filter(i => collItemStatuses[i.id] === 'returned');
                        const bounced = collActiveBatchItems.filter(i => collItemStatuses[i.id] === 'bounced');
                        const collectedAmt = collected.reduce((s, i) => s + (i.amount || 0), 0);
                        return (
                          <div style={{ marginTop: '14px' }}>
                            <div style={{ display: 'flex', gap: '16px', fontSize: '13px', marginBottom: '12px', flexWrap: 'wrap' }}>
                              <span style={{ color: '#22c55e', fontWeight: '600' }}>Collected: {collected.length} ({formatCurrency(collectedAmt)})</span>
                              <span style={{ color: '#f59e0b', fontWeight: '600' }}>Returned: {returned.length}</span>
                              <span style={{ color: '#ef4444', fontWeight: '600' }}>Bounced: {bounced.length}</span>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button onClick={handleSaveBatchResults} disabled={collSyncing}
                                style={{ padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--t1)', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
                                {collSyncing ? 'Saving...' : 'Save Only'}
                              </button>
                              <button onClick={handleCreateReceipt} disabled={collSyncing || collected.length === 0}
                                style={{ padding: '10px 20px', borderRadius: '8px', border: 'none', background: collected.length === 0 ? 'var(--border)' : '#22c55e',
                                  color: '#fff', cursor: collected.length === 0 ? 'not-allowed' : 'pointer', fontWeight: '600', fontSize: '13px' }}>
                                {collSyncing ? 'Creating...' : `Save & Create Receipt (${collected.length} cheques, ${formatCurrency(collectedAmt)})`}
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              )}

              {/* STAFF TAB */}
              {collTab === 'staff' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--t1)' }}>Collection Staff</div>
                    <button onClick={() => setCollShowStaffForm(!collShowStaffForm)}
                      style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}>
                      {collShowStaffForm ? 'Cancel' : '+ Add Staff'}
                    </button>
                  </div>

                  {collShowStaffForm && (
                    <div style={{ padding: '16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', marginBottom: '14px', display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Name *</div>
                        <input value={collNewStaff.name} onChange={e => setCollNewStaff(p => ({ ...p, name: e.target.value }))} placeholder="Mini Gurung"
                          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: '13px', width: '160px' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Phone</div>
                        <input value={collNewStaff.phone} onChange={e => setCollNewStaff(p => ({ ...p, phone: e.target.value }))} placeholder="98XXXXXXXX"
                          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: '13px', width: '130px' }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--t3)', marginBottom: '4px' }}>Tally Ledger Name *</div>
                        <input value={collNewStaff.tallyLedgerName} onChange={e => setCollNewStaff(p => ({ ...p, tallyLedgerName: e.target.value }))} placeholder="Cash By MINI Gurung"
                          style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)', fontSize: '13px', width: '200px' }} />
                      </div>
                      <button onClick={handleAddStaff} disabled={!collNewStaff.name || !collNewStaff.tallyLedgerName}
                        style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: '#fff', cursor: 'pointer', fontWeight: '600', fontSize: '13px' }}>
                        Save
                      </button>
                    </div>
                  )}

                  <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <table className="table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: 'var(--card)' }}>
                          <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)' }}>Name</th>
                          <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)' }}>Phone</th>
                          <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)' }}>Tally Ledger</th>
                          <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--t3)' }}>Status</th>
                          <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--t3)' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {collStaff.length === 0 ? (
                          <tr><td colSpan="5" style={{ textAlign: 'center', padding: '30px', color: 'var(--t3)' }}>No staff added yet</td></tr>
                        ) : collStaff.map(s => (
                          <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 8px', color: 'var(--t1)', fontWeight: '600' }}>{s.name}</td>
                            <td style={{ padding: '10px 8px', color: 'var(--t2)' }}>{s.phone || '-'}</td>
                            <td style={{ padding: '10px 8px', color: 'var(--t2)' }}>{s.tally_ledger_name}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '4px', background: s.active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: s.active ? '#22c55e' : '#ef4444', fontSize: '11px', fontWeight: '600' }}>
                                {s.active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              <button onClick={() => handleDeleteStaff(s.id)} style={{ padding: '4px 10px', borderRadius: '6px', border: '1px solid #ef4444', background: 'transparent', color: '#ef4444', cursor: 'pointer', fontSize: '11px' }}>
                                Remove
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* HISTORY TAB */}
              {collTab === 'history' && (
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '12px', color: 'var(--t1)' }}>Collection History</div>
                  {collStats && (
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                      {[
                        { label: 'Total Batches', value: collStats.totalBatches, color: 'var(--accent)' },
                        { label: 'Active', value: collStats.activeBatches, color: '#f59e0b' },
                        { label: 'Completed', value: collStats.completedBatches, color: '#22c55e' },
                        { label: 'Total Collected', value: formatCurrency(collStats.totalCollected), color: '#22c55e' },
                        { label: 'Total Returned', value: collStats.totalReturned, color: '#f59e0b' },
                        { label: 'Total Bounced', value: collStats.totalBounced, color: '#ef4444' }
                      ].map((s, i) => (
                        <div key={i} style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', minWidth: '120px' }}>
                          <div style={{ fontSize: '11px', color: 'var(--t3)' }}>{s.label}</div>
                          <div style={{ fontSize: '18px', fontWeight: '700', color: s.color }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
                    <table className="table" style={{ fontSize: '12px' }}>
                      <thead>
                        <tr style={{ background: 'var(--card)' }}>
                          <th style={{ padding: '10px 8px', color: 'var(--t3)' }}>Batch</th>
                          <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)' }}>Staff</th>
                          <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)' }}>Date</th>
                          <th style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--t3)' }}>Cheques</th>
                          <th style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--t3)' }}>Amount</th>
                          <th style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--t3)' }}>Collected</th>
                          <th style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--t3)' }}>Returned</th>
                          <th style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--t3)' }}>Bounced</th>
                          <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--t3)' }}>Status</th>
                          <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--t3)' }}>Tally</th>
                        </tr>
                      </thead>
                      <tbody>
                        {collBatches.length === 0 ? (
                          <tr><td colSpan="10" style={{ textAlign: 'center', padding: '30px', color: 'var(--t3)' }}>No collection history</td></tr>
                        ) : collBatches.map(b => (
                          <tr key={b.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                            onClick={() => { if (b.status !== 'completed') { handleOpenBatch(b.id); setCollTab('collect'); } }}>
                            <td style={{ padding: '10px 8px', fontWeight: '600', color: 'var(--accent)' }}>#{b.id}</td>
                            <td style={{ padding: '10px 8px', color: 'var(--t1)', fontWeight: '500' }}>{b.staff_name}</td>
                            <td style={{ padding: '10px 8px', color: 'var(--t2)' }}>{b.assigned_date}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--t1)' }}>{b.total_cheques}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', fontWeight: '600', color: 'var(--t1)' }}>{formatCurrency(b.total_amount)}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', color: '#22c55e', fontWeight: '600' }}>{formatCurrency(b.collected_amount)}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', color: '#f59e0b' }}>{b.returned_count}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'right', color: '#ef4444' }}>{b.bounced_count}</td>
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                                background: b.status === 'completed' ? 'rgba(34,197,94,0.1)' : 'rgba(99,102,241,0.1)',
                                color: b.status === 'completed' ? '#22c55e' : 'var(--accent)' }}>
                                {b.status}
                              </span>
                            </td>
                            <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                              {b.tally_synced ? (
                                <span style={{ color: '#22c55e', fontSize: '11px', fontWeight: '600' }}>Synced</span>
                              ) : b.tally_sync_error ? (
                                <span style={{ color: '#ef4444', fontSize: '11px' }} title={b.tally_sync_error}>Failed</span>
                              ) : (
                                <span style={{ color: 'var(--t3)', fontSize: '11px' }}>-</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* RECEIVABLE TAB */}
              {collTab === 'receivable' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: 'var(--t1)' }}>
                      Cheque Receivable
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      {['pending', 'settled', 'all'].map(f => (
                        <button key={f} onClick={() => setCollRecvFilter(f)}
                          style={{ padding: '5px 12px', borderRadius: '6px', border: '1px solid var(--border)', cursor: 'pointer', fontSize: '12px', fontWeight: '500',
                            background: collRecvFilter === f ? 'var(--accent)' : 'var(--card)', color: collRecvFilter === f ? '#fff' : 'var(--t2)' }}>
                          {f.charAt(0).toUpperCase() + f.slice(1)}
                        </button>
                      ))}
                      <input placeholder="Search party / cheque..." value={collRecvSearch} onChange={e => setCollRecvSearch(e.target.value)}
                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--t1)', fontSize: '12px', width: '200px' }} />
                      <button onClick={handleSyncAndFetchReceivable} disabled={collRecvSyncing}
                        style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', cursor: 'pointer', background: 'var(--accent)', color: '#fff', fontSize: '12px', fontWeight: '600', opacity: collRecvSyncing ? 0.6 : 1 }}>
                        {collRecvSyncing ? 'Syncing...' : 'Re-sync from Tally'}
                      </button>
                    </div>
                  </div>

                  {collRecvLoading ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading cheque receivable...</div>
                  ) : (() => {
                    const search = collRecvSearch.toLowerCase();
                    let filtered = collReceivable;

                    // Apply status filter
                    if (collRecvFilter === 'pending') filtered = filtered.filter(c => !c.settled);
                    else if (collRecvFilter === 'settled') filtered = filtered.filter(c => c.settled);

                    // Apply search filter
                    if (search) {
                      filtered = filtered.filter(c => c.partyName.toLowerCase().includes(search) || (c.chequeNumber || '').toLowerCase().includes(search) || (c.bankName || '').toLowerCase().includes(search) || (c.billName || '').toLowerCase().includes(search));
                    }

                    // Summary stats (from ALL data, not filtered)
                    const allPending = collReceivable.filter(c => !c.settled);
                    const allSettled = collReceivable.filter(c => c.settled);
                    const pendingAmt = allPending.reduce((s, c) => s + c.amount, 0);
                    const settledAmt = allSettled.reduce((s, c) => s + c.amount, 0);
                    const partySet = new Set(allPending.map(c => c.partyName));

                    return (
                      <div>
                        {/* Summary cards */}
                        <div style={{ display: 'flex', gap: '12px', marginBottom: '14px', flexWrap: 'wrap' }}>
                          {[
                            { label: 'Pending', value: `${allPending.length}`, sub: formatCurrency(pendingAmt), color: '#f59e0b' },
                            { label: 'Settled', value: `${allSettled.length}`, sub: formatCurrency(settledAmt), color: '#22c55e' },
                            { label: 'Total', value: collReceivable.length, sub: formatCurrency(pendingAmt + settledAmt), color: 'var(--accent)' },
                            { label: 'Parties', value: partySet.size, sub: 'with pending', color: 'var(--t1)' }
                          ].map((s, i) => (
                            <div key={i} style={{ padding: '10px 16px', borderRadius: '10px', border: '1px solid var(--border)', background: 'var(--card)', minWidth: '120px' }}>
                              <div style={{ fontSize: '11px', color: 'var(--t3)' }}>{s.label}</div>
                              <div style={{ fontSize: '16px', fontWeight: '700', color: s.color }}>{s.value}</div>
                              {s.sub && <div style={{ fontSize: '11px', color: 'var(--t3)' }}>{s.sub}</div>}
                            </div>
                          ))}
                        </div>

                        {filtered.length === 0 ? (
                          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)', background: 'var(--card)', borderRadius: '8px' }}>
                            {collReceivable.length === 0
                              ? 'No cheque receivable data. Click "Re-sync from Tally" to fetch ODBC vouchers.'
                              : 'No results match your filter.'}
                          </div>
                        ) : (
                          <div style={{ overflowX: 'auto', borderRadius: '8px', border: '1px solid var(--border)' }}>
                            <table className="table" style={{ fontSize: '12px' }}>
                              <thead>
                                <tr style={{ background: 'var(--card)' }}>
                                  <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)' }}>Party Name</th>
                                  <th style={{ padding: '10px 8px', textAlign: 'left', color: 'var(--t3)' }}>Bill Ref</th>
                                  <th style={{ padding: '10px 8px', textAlign: 'right', color: 'var(--t3)' }}>Amount</th>
                                  <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--t3)' }}>Ageing</th>
                                  <th style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--t3)' }}>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filtered.slice(0, 500).map((c, i) => (
                                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td style={{ padding: '8px', color: 'var(--t1)', fontWeight: '500', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.partyName}>{c.partyName}</td>
                                    <td style={{ padding: '8px', color: 'var(--t2)', fontSize: '11px' }}>{c.billName || c.voucherNumber || '-'}</td>
                                    <td style={{ padding: '8px', textAlign: 'right', fontWeight: '600', color: 'var(--t1)' }}>{formatCurrency(c.amount)}</td>
                                    <td style={{ padding: '8px', textAlign: 'center', fontSize: '11px' }}>
                                      {c.ageingDays > 0 ? (
                                        <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
                                          background: c.ageingDays > 90 ? 'rgba(239,68,68,0.1)' : c.ageingDays > 30 ? 'rgba(245,158,11,0.1)' : 'rgba(59,130,246,0.1)',
                                          color: c.ageingDays > 90 ? '#ef4444' : c.ageingDays > 30 ? '#f59e0b' : '#3b82f6' }}>
                                          {c.ageingDays}d
                                        </span>
                                      ) : '-'}
                                    </td>
                                    <td style={{ padding: '8px', textAlign: 'center' }}>
                                      <span style={{ padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                                        background: c.settled ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                                        color: c.settled ? '#22c55e' : '#f59e0b' }}>
                                        {c.settled ? 'Settled' : 'Pending'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {filtered.length > 500 && (
                              <div style={{ textAlign: 'center', padding: '10px', color: 'var(--t3)', fontSize: '12px' }}>
                                Showing 500 of {filtered.length} cheques. Use search to filter.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* PRINT SLIP (hidden, shown via window.print) */}
              {collPrintData && (
                <div className="collection-print-slip" style={{ display: 'none' }}>
                  <div style={{ padding: '20px', fontFamily: 'monospace', fontSize: '12px', maxWidth: '600px', margin: '0 auto' }}>
                    <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '16px', borderBottom: '2px solid #000', paddingBottom: '8px', marginBottom: '8px' }}>
                      CHEQUE COLLECTION SLIP
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span>Date: {collPrintData.batch?.assigned_date}</span>
                      <span>Batch #: {collPrintData.batch?.id}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', borderBottom: '1px solid #000', paddingBottom: '8px' }}>
                      <span>Staff: {collPrintData.staff?.name}</span>
                      <span>Phone: {collPrintData.staff?.phone || '-'}</span>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #000' }}>
                          <th style={{ padding: '4px', textAlign: 'left' }}>#</th>
                          <th style={{ padding: '4px', textAlign: 'left' }}>Party Name</th>
                          <th style={{ padding: '4px', textAlign: 'right' }}>Amount</th>
                          <th style={{ padding: '4px', textAlign: 'left' }}>Chq #</th>
                          <th style={{ padding: '4px', textAlign: 'left' }}>Bank</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(collPrintData.items || []).map((item, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #ccc' }}>
                            <td style={{ padding: '3px 4px' }}>{idx + 1}</td>
                            <td style={{ padding: '3px 4px' }}>{item.party_name}</td>
                            <td style={{ padding: '3px 4px', textAlign: 'right' }}>{Number(item.amount || 0).toLocaleString('en-IN')}</td>
                            <td style={{ padding: '3px 4px' }}>{item.cheque_number || '-'}</td>
                            <td style={{ padding: '3px 4px' }}>{item.bank_name || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ borderTop: '2px solid #000', marginTop: '8px', paddingTop: '8px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                      <span>Total: {(collPrintData.items || []).length} cheques</span>
                      <span>Rs {Number(collPrintData.batch?.total_amount || 0).toLocaleString('en-IN')}</span>
                    </div>
                    <div style={{ marginTop: '30px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #ccc', paddingTop: '8px' }}>
                      <span>Staff Signature: ____________</span>
                      <span>Authorized By: ____________</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* BANK NAMES PAGE */}
            <div className={`page ${currentPage === 'bank-names' ? 'active' : ''}`}>
              <div className="sec-head" style={{ marginBottom: '16px' }}>
                <div className="sec-title" style={{ fontSize: '18px' }}>Bank Names</div>
              </div>

              {/* Add New */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
                <input type="text" placeholder="Short name (e.g. garima)" value={bnNewShort} onChange={e => setBnNewShort(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', width: '200px', fontSize: '13px' }} onKeyDown={e => e.key === 'Enter' && document.getElementById('bn-full-input')?.focus()} />
                <input id="bn-full-input" type="text" placeholder="Full name (e.g. Garima Bikas Bank)" value={bnNewFull} onChange={e => setBnNewFull(e.target.value)} style={{ padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', flex: 1, fontSize: '13px' }} onKeyDown={e => e.key === 'Enter' && handleAddBankName()} />
                <button className="btn btn-p" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={handleAddBankName} disabled={!bnNewShort.trim() || !bnNewFull.trim()}>Add</button>
              </div>

              {bankNamesLoading ? <div style={{ textAlign: 'center', padding: '40px', color: 'var(--t3)' }}>Loading...</div> : (
                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th style={{ width: '200px' }}>Short Name</th><th>Full Name</th><th style={{ width: '120px', textAlign: 'center' }}>Actions</th></tr></thead>
                    <tbody>
                      {bankNamesList.map(b => (
                        <tr key={b.id}>
                          {bnEditId === b.id ? (
                            <>
                              <td><input type="text" value={bnEditShort} onChange={e => setBnEditShort(e.target.value)} style={{ padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--blue)', borderRadius: '4px', color: 'var(--t1)', width: '100%', fontSize: '13px' }} /></td>
                              <td><input type="text" value={bnEditFull} onChange={e => setBnEditFull(e.target.value)} style={{ padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--blue)', borderRadius: '4px', color: 'var(--t1)', width: '100%', fontSize: '13px' }} onKeyDown={e => e.key === 'Enter' && handleUpdateBankName(b.id)} /></td>
                              <td style={{ textAlign: 'center' }}>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', fontSize: '14px', marginRight: '8px' }} onClick={() => handleUpdateBankName(b.id)} title="Save">Save</button>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: '14px' }} onClick={() => setBnEditId(null)} title="Cancel">Cancel</button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ fontFamily: 'var(--mono)', fontWeight: '600', color: 'var(--blue)' }}>{b.short_name}</td>
                              <td>{b.full_name || <span style={{ color: 'var(--amber)', fontStyle: 'italic', fontSize: '12px' }}>-- needs full name --</span>}</td>
                              <td style={{ textAlign: 'center' }}>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontSize: '14px', marginRight: '8px' }} onClick={() => { setBnEditId(b.id); setBnEditShort(b.short_name); setBnEditFull(b.full_name); }} title="Edit">Edit</button>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '14px' }} onClick={() => handleDeleteBankName(b.id, b.short_name)} title="Delete">Del</button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {bankNamesList.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--t3)' }}>No bank names configured. Add your first bank name above.</div>}
                  <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--t3)' }}>
                    {bankNamesList.length} bank name{bankNamesList.length !== 1 ? 's' : ''}
                    {bankNamesList.filter(b => !b.full_name).length > 0 && <span style={{ color: 'var(--amber)', marginLeft: '8px' }}>({bankNamesList.filter(b => !b.full_name).length} need full name)</span>}
                  </div>
                </div>
              )}

              {/* Ledger Mapping Section */}
              <div style={{ marginTop: '32px' }} onClick={() => setLmDropdown(null)}>
                <div className="sec-head" style={{ marginBottom: '16px' }}>
                  <div className="sec-title" style={{ fontSize: '18px' }}>Ledger Mapping (Billing → Cheque Company)</div>
                  <div style={{ fontSize: '12px', color: 'var(--t3)', marginTop: '4px' }}>Maps billing company party names to cheque company (ODBC) ledger names. Auto-saved when posting cheques.</div>
                </div>

                {/* Add New Mapping */}
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
                  {/* Billing party input with dropdown */}
                  <div style={{ flex: 1, position: 'relative' }} onClick={e => e.stopPropagation()}>
                    <input type="text" placeholder="Search billing party..." value={lmNewBilling}
                      onChange={e => { setLmNewBilling(e.target.value); setLmDropdown('new-billing'); }}
                      onFocus={() => setLmDropdown('new-billing')}
                      onBlur={() => { setTimeout(() => { if (lmNewBilling) { const f = lmBillingParties.filter(p => p.toLowerCase().includes(lmNewBilling.toLowerCase())); if (f.length === 1) setLmNewBilling(f[0]); } setLmDropdown(d => d === 'new-billing' ? null : d); }, 150); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          const filtered = lmBillingParties.filter(p => p.toLowerCase().includes(lmNewBilling.toLowerCase()));
                          if (filtered.length > 0) setLmNewBilling(filtered[0]);
                          setLmDropdown(null);
                          if (e.key === 'Enter') { e.preventDefault(); document.getElementById('lm-odbc-input')?.focus(); }
                        } else if (e.key === 'Escape') setLmDropdown(null);
                      }}
                      style={{ width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '13px' }} />
                    {lmDropdown === 'new-billing' && lmNewBilling && (() => { const f = lmBillingParties.filter(p => p.toLowerCase().includes(lmNewBilling.toLowerCase())); return f.length > 0 ? (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '200px', overflow: 'auto', background: 'var(--card)', border: '1px solid var(--accent)', borderTop: 'none', borderRadius: '0 0 6px 6px', zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                        {f.length === 1 && <div style={{ padding: '4px 10px', fontSize: '10px', color: 'var(--green)', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>Only match — will auto-select</div>}
                        {f.slice(0, 15).map((p, i) => (
                          <div key={p} onClick={() => { setLmNewBilling(p); setLmDropdown(null); document.getElementById('lm-odbc-input')?.focus(); }}
                            style={{ padding: '6px 12px', fontSize: '12px', cursor: 'pointer', color: i === 0 ? 'var(--accent)' : 'var(--t1)', fontWeight: i === 0 ? '600' : '400', borderBottom: '1px solid var(--border)' }}
                            onMouseEnter={e => e.target.style.background = 'rgba(99,102,241,0.15)'} onMouseLeave={e => e.target.style.background = 'transparent'}>{p}</div>
                        ))}
                      </div>
                    ) : null; })()}
                  </div>
                  <span style={{ color: 'var(--t3)', fontSize: '16px' }}>→</span>
                  {/* ODBC party input with dropdown */}
                  <div style={{ flex: 1, position: 'relative' }} onClick={e => e.stopPropagation()}>
                    <input id="lm-odbc-input" type="text" placeholder="Search ODBC party..." value={lmNewOdbc}
                      onChange={e => { setLmNewOdbc(e.target.value); setLmDropdown('new-odbc'); }}
                      onFocus={() => setLmDropdown('new-odbc')}
                      onBlur={() => { setTimeout(() => { if (lmNewOdbc) { const f = lmOdbcParties.filter(p => p.toLowerCase().includes(lmNewOdbc.toLowerCase())); if (f.length === 1) setLmNewOdbc(f[0]); } setLmDropdown(d => d === 'new-odbc' ? null : d); }, 150); }}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === 'Tab') {
                          const filtered = lmOdbcParties.filter(p => p.toLowerCase().includes(lmNewOdbc.toLowerCase()));
                          if (filtered.length > 0) setLmNewOdbc(filtered[0]);
                          setLmDropdown(null);
                        } else if (e.key === 'Escape') setLmDropdown(null);
                      }}
                      style={{ width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', fontSize: '13px' }} />
                    {lmDropdown === 'new-odbc' && lmNewOdbc && (() => { const f = lmOdbcParties.filter(p => p.toLowerCase().includes(lmNewOdbc.toLowerCase())); return f.length > 0 ? (
                      <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '200px', overflow: 'auto', background: 'var(--card)', border: '1px solid var(--accent)', borderTop: 'none', borderRadius: '0 0 6px 6px', zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                        {f.length === 1 && <div style={{ padding: '4px 10px', fontSize: '10px', color: 'var(--green)', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>Only match — will auto-select</div>}
                        {f.slice(0, 15).map((p, i) => (
                          <div key={p} onClick={() => { setLmNewOdbc(p); setLmDropdown(null); }}
                            style={{ padding: '6px 12px', fontSize: '12px', cursor: 'pointer', color: i === 0 ? 'var(--accent)' : 'var(--t1)', fontWeight: i === 0 ? '600' : '400', borderBottom: '1px solid var(--border)' }}
                            onMouseEnter={e => e.target.style.background = 'rgba(99,102,241,0.15)'} onMouseLeave={e => e.target.style.background = 'transparent'}>{p}</div>
                        ))}
                      </div>
                    ) : null; })()}
                  </div>
                  <button className="btn btn-p" style={{ padding: '8px 16px', fontSize: '13px' }} onClick={handleAddLedgerMapping} disabled={!lmNewBilling.trim() || !lmNewOdbc.trim()}>Add</button>
                </div>

                {/* Search */}
                {ledgerMappings.length > 5 && (
                  <input type="text" placeholder="Search mappings..." value={lmSearch} onChange={e => setLmSearch(e.target.value)} style={{ marginBottom: '12px', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--t1)', width: '300px', fontSize: '13px' }} />
                )}

                <div className="table-wrap">
                  <table className="data-table">
                    <thead><tr><th>Billing Company Party</th><th style={{ width: '40px', textAlign: 'center' }}></th><th>ODBC (Cheque) Company Party</th><th style={{ width: '120px', textAlign: 'center' }}>Actions</th></tr></thead>
                    <tbody>
                      {ledgerMappings.filter(m => !lmSearch || m.billing_party.toLowerCase().includes(lmSearch.toLowerCase()) || m.odbc_party.toLowerCase().includes(lmSearch.toLowerCase())).map(m => (
                        <tr key={m.id}>
                          {lmEditId === m.id ? (
                            <>
                              <td style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                                <input type="text" value={lmEditBilling} onChange={e => { setLmEditBilling(e.target.value); setLmDropdown('edit-billing'); }}
                                  onFocus={() => setLmDropdown('edit-billing')}
                                  onBlur={() => { setTimeout(() => { if (lmEditBilling) { const f = lmBillingParties.filter(p => p.toLowerCase().includes(lmEditBilling.toLowerCase())); if (f.length === 1) setLmEditBilling(f[0]); } setLmDropdown(d => d === 'edit-billing' ? null : d); }, 150); }}
                                  onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Tab') { const f = lmBillingParties.filter(p => p.toLowerCase().includes(lmEditBilling.toLowerCase())); if (f.length > 0) setLmEditBilling(f[0]); setLmDropdown(null); } else if (e.key === 'Escape') setLmDropdown(null); }}
                                  style={{ padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--blue)', borderRadius: '4px', color: 'var(--t1)', width: '100%', fontSize: '13px' }} />
                                {lmDropdown === 'edit-billing' && lmEditBilling && (() => { const f = lmBillingParties.filter(p => p.toLowerCase().includes(lmEditBilling.toLowerCase())); return f.length > 0 ? (
                                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '180px', overflow: 'auto', background: 'var(--card)', border: '1px solid var(--accent)', borderRadius: '0 0 6px 6px', zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                                    {f.length === 1 && <div style={{ padding: '3px 10px', fontSize: '10px', color: 'var(--green)', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>Only match — will auto-select</div>}
                                    {f.slice(0, 12).map((p, i) => (
                                      <div key={p} onClick={() => { setLmEditBilling(p); setLmDropdown(null); }}
                                        style={{ padding: '5px 10px', fontSize: '12px', cursor: 'pointer', color: i === 0 ? 'var(--accent)' : 'var(--t1)', borderBottom: '1px solid var(--border)' }}
                                        onMouseEnter={e => e.target.style.background = 'rgba(99,102,241,0.15)'} onMouseLeave={e => e.target.style.background = 'transparent'}>{p}</div>
                                    ))}
                                  </div>
                                ) : null; })()}
                              </td>
                              <td style={{ textAlign: 'center', color: 'var(--t3)' }}>→</td>
                              <td style={{ position: 'relative' }} onClick={e => e.stopPropagation()}>
                                <input type="text" value={lmEditOdbc} onChange={e => { setLmEditOdbc(e.target.value); setLmDropdown('edit-odbc'); }}
                                  onFocus={() => setLmDropdown('edit-odbc')}
                                  onBlur={() => { setTimeout(() => { if (lmEditOdbc) { const f = lmOdbcParties.filter(p => p.toLowerCase().includes(lmEditOdbc.toLowerCase())); if (f.length === 1) setLmEditOdbc(f[0]); } setLmDropdown(d => d === 'edit-odbc' ? null : d); }, 150); }}
                                  onKeyDown={e => { if (e.key === 'Enter') { const f = lmOdbcParties.filter(p => p.toLowerCase().includes(lmEditOdbc.toLowerCase())); if (f.length > 0) setLmEditOdbc(f[0]); setLmDropdown(null); handleUpdateLedgerMapping(m.id); } else if (e.key === 'Tab') { const f = lmOdbcParties.filter(p => p.toLowerCase().includes(lmEditOdbc.toLowerCase())); if (f.length > 0) setLmEditOdbc(f[0]); setLmDropdown(null); } else if (e.key === 'Escape') setLmDropdown(null); }}
                                  style={{ padding: '4px 8px', background: 'var(--bg)', border: '1px solid var(--blue)', borderRadius: '4px', color: 'var(--t1)', width: '100%', fontSize: '13px' }} />
                                {lmDropdown === 'edit-odbc' && lmEditOdbc && (() => { const f = lmOdbcParties.filter(p => p.toLowerCase().includes(lmEditOdbc.toLowerCase())); return f.length > 0 ? (
                                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, maxHeight: '180px', overflow: 'auto', background: 'var(--card)', border: '1px solid var(--accent)', borderRadius: '0 0 6px 6px', zIndex: 200, boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
                                    {f.length === 1 && <div style={{ padding: '3px 10px', fontSize: '10px', color: 'var(--green)', background: 'var(--bg)', borderBottom: '1px solid var(--border)' }}>Only match — will auto-select</div>}
                                    {f.slice(0, 12).map((p, i) => (
                                      <div key={p} onClick={() => { setLmEditOdbc(p); setLmDropdown(null); }}
                                        style={{ padding: '5px 10px', fontSize: '12px', cursor: 'pointer', color: i === 0 ? 'var(--accent)' : 'var(--t1)', borderBottom: '1px solid var(--border)' }}
                                        onMouseEnter={e => e.target.style.background = 'rgba(99,102,241,0.15)'} onMouseLeave={e => e.target.style.background = 'transparent'}>{p}</div>
                                    ))}
                                  </div>
                                ) : null; })()}
                              </td>
                              <td style={{ textAlign: 'center' }}>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--green)', fontSize: '14px', marginRight: '8px' }} onClick={() => { setLmDropdown(null); handleUpdateLedgerMapping(m.id); }}>Save</button>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', fontSize: '14px' }} onClick={() => { setLmEditId(null); setLmDropdown(null); }}>Cancel</button>
                              </td>
                            </>
                          ) : (
                            <>
                              <td style={{ fontWeight: '600' }}>{m.billing_party}</td>
                              <td style={{ textAlign: 'center', color: 'var(--t3)' }}>→</td>
                              <td style={{ fontFamily: 'var(--mono)', color: 'var(--blue)' }}>{m.odbc_party}</td>
                              <td style={{ textAlign: 'center' }}>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', fontSize: '14px', marginRight: '8px' }} onClick={() => { setLmEditId(m.id); setLmEditBilling(m.billing_party); setLmEditOdbc(m.odbc_party); setLmDropdown(null); }}>Edit</button>
                                <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', fontSize: '14px' }} onClick={() => handleDeleteLedgerMapping(m.id, m.billing_party)}>Del</button>
                              </td>
                            </>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {ledgerMappings.length === 0 && <div style={{ textAlign: 'center', padding: '30px', color: 'var(--t3)' }}>No ledger mappings yet. Mappings are auto-saved when you post cheques with different party names.</div>}
                  <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--t3)' }}>{ledgerMappings.length} mapping{ledgerMappings.length !== 1 ? 's' : ''} configured</div>
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
                  <div className="s-card-h">🏭 Tally Companies</div>
                  <div className="s-card-b">
                    <div className="s-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <div className="s-name">Billing Company</div>
                        <div className="s-desc">Main billing company name in Tally (e.g., For DB)</div>
                      </div>
                      <input
                        type="text"
                        value={appSettings.billing_company || 'For DB'}
                        onChange={(e) => setAppSettings(prev => ({ ...prev, billing_company: e.target.value }))}
                        onBlur={() => handleSaveSettings()}
                        placeholder="For DB"
                        style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)', color: 'var(--t1)' }}
                      />
                    </div>
                    <div className="s-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '8px' }}>
                      <div>
                        <div className="s-name">ODBC Cheque Company</div>
                        <div className="s-desc">Cheque management company name in Tally (e.g., ODBC CHq Mgmt)</div>
                      </div>
                      <input
                        type="text"
                        value={appSettings.odbc_company || 'ODBC CHq Mgmt'}
                        onChange={(e) => setAppSettings(prev => ({ ...prev, odbc_company: e.target.value }))}
                        onBlur={() => handleSaveSettings()}
                        placeholder="ODBC CHq Mgmt"
                        style={{ width: '100%', padding: '10px 12px', fontSize: '14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)', color: 'var(--t1)' }}
                      />
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
                  <div className="s-card-h">🔒 Voucher Lock (EOD)</div>
                  <div className="s-card-b">
                    {voucherLockLoading ? (
                      <div style={{ textAlign: 'center', padding: '20px', color: 'var(--t3)' }}>Loading lock status...</div>
                    ) : voucherLock ? (
                      <>
                        <div className="s-row">
                          <div>
                            <div className="s-name">For DB</div>
                            <div className="s-desc">{voucherLock.forDB?.locked || 0} / {voucherLock.forDB?.totalVouchers || 0} vouchers locked</div>
                          </div>
                          <span style={{
                            padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700',
                            background: voucherLock.forDB?.locked > 0 ? 'var(--green-g, rgba(76,175,80,0.15))' : 'var(--bg3)',
                            color: voucherLock.forDB?.locked > 0 ? 'var(--green)' : 'var(--t3)'
                          }}>
                            {voucherLock.forDB?.locked > 0 ? '🔒 Locked' : '🔓 Open'}
                          </span>
                        </div>
                        <div className="s-row">
                          <div>
                            <div className="s-name">ODBC CHq Mgmt</div>
                            <div className="s-desc">{voucherLock.odbc?.locked || 0} / {voucherLock.odbc?.totalVouchers || 0} vouchers locked</div>
                          </div>
                          <span style={{
                            padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700',
                            background: voucherLock.odbc?.locked > 0 ? 'var(--green-g, rgba(76,175,80,0.15))' : 'var(--bg3)',
                            color: voucherLock.odbc?.locked > 0 ? 'var(--green)' : 'var(--t3)'
                          }}>
                            {voucherLock.odbc?.locked > 0 ? '🔒 Locked' : '🔓 Open'}
                          </span>
                        </div>

                        <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0', paddingTop: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--t2)' }}>Company:</div>
                            <select
                              value={lockCompany}
                              onChange={(e) => setLockCompany(e.target.value)}
                              style={{ padding: '6px 10px', fontSize: '12px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--t1)' }}
                            >
                              <option value={voucherLock?.defaultCompany || 'FOR DB'}>{voucherLock?.defaultCompany || 'FOR DB'}</option>
                              <option value="ODBC CHq Mgmt">ODBC CHq Mgmt</option>
                              <option value="both">Both Companies</option>
                            </select>
                          </div>
                        </div>

                        <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0', paddingTop: '12px' }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--t2)', marginBottom: '8px' }}>Lock Vouchers</div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span style={{ fontSize: '12px', color: 'var(--t3)', whiteSpace: 'nowrap' }}>Up to:</span>
                            <input
                              type="date"
                              value={voucherLockDate}
                              onChange={(e) => setVoucherLockDate(e.target.value)}
                              style={{ flex: 1, padding: '8px 10px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)', color: 'var(--t1)' }}
                            />
                            <button
                              onClick={async () => {
                                if (!confirm(`Lock all vouchers up to ${voucherLockDate} in "${lockCompany}"? This will prevent editing/deleting in Tally.`)) return;
                                setVoucherLockLoading(true);
                                try {
                                  const res = await lockVouchers({ date: voucherLockDate, company: lockCompany });
                                  if (res.data.success) {
                                    addToast('success', 'Vouchers Locked', `Locked ${res.data.totalLocked} vouchers in "${lockCompany}"`);
                                  } else {
                                    addToast('error', 'Lock Failed', res.data.errors?.join(', ') || res.data.message || '0 vouchers locked');
                                  }
                                  fetchVoucherLockStatus();
                                } catch (e) {
                                  addToast('error', 'Lock Failed', e.response?.data?.error || e.message);
                                  setVoucherLockLoading(false);
                                }
                              }}
                              disabled={voucherLockLoading}
                              style={{
                                padding: '8px 16px', background: voucherLockLoading ? 'var(--bg4)' : 'var(--red)',
                                color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: voucherLockLoading ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', fontSize: '13px'
                              }}
                            >
                              🔒 Lock
                            </button>
                          </div>
                        </div>

                        <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0', paddingTop: '12px' }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: 'var(--t2)', marginBottom: '8px' }}>Unlock Vouchers</div>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <input
                              type="date"
                              value={unlockFromDate}
                              onChange={(e) => setUnlockFromDate(e.target.value)}
                              placeholder="From"
                              style={{ flex: 1, minWidth: '120px', padding: '8px 10px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)', color: 'var(--t1)' }}
                            />
                            <span style={{ fontSize: '12px', color: 'var(--t3)' }}>to</span>
                            <input
                              type="date"
                              value={unlockToDate}
                              onChange={(e) => setUnlockToDate(e.target.value)}
                              placeholder="To"
                              style={{ flex: 1, minWidth: '120px', padding: '8px 10px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)', color: 'var(--t1)' }}
                            />
                            <button
                              onClick={async () => {
                                if (!unlockFromDate || !unlockToDate) { addToast('error', 'Error', 'Select both from and to dates'); return; }
                                if (!confirm(`Unlock vouchers from ${unlockFromDate} to ${unlockToDate} in "${lockCompany}"?`)) return;
                                setVoucherLockLoading(true);
                                try {
                                  const res = await unlockVouchers({ fromDate: unlockFromDate, toDate: unlockToDate, company: lockCompany });
                                  if (res.data.success) {
                                    addToast('success', 'Vouchers Unlocked', `Unlocked ${res.data.totalUnlocked} vouchers in "${lockCompany}"`);
                                  } else {
                                    addToast('error', 'Unlock Failed', res.data.errors?.join(', ') || res.data.message || '0 vouchers unlocked');
                                  }
                                  fetchVoucherLockStatus();
                                } catch (e) {
                                  addToast('error', 'Unlock Failed', e.response?.data?.error || e.message);
                                  setVoucherLockLoading(false);
                                }
                              }}
                              disabled={voucherLockLoading || !unlockFromDate || !unlockToDate}
                              style={{
                                padding: '8px 16px', background: (voucherLockLoading || !unlockFromDate || !unlockToDate) ? 'var(--bg4)' : 'var(--green)',
                                color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: (voucherLockLoading || !unlockFromDate || !unlockToDate) ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap', fontSize: '13px'
                              }}
                            >
                              🔓 Unlock
                            </button>
                          </div>
                        </div>

                        <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0', paddingTop: '12px' }}>
                          <div className="s-row">
                            <div>
                              <div className="s-name">Auto-Lock (EOD)</div>
                              <div className="s-desc">Automatically lock vouchers daily</div>
                            </div>
                            <label style={{ position: 'relative', width: '44px', height: '24px', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={voucherLock.autoEnabled}
                                onChange={async (e) => {
                                  try {
                                    await setVoucherLockSchedule({ enabled: e.target.checked, time: voucherLock.autoTime || '18:00' });
                                    fetchVoucherLockStatus();
                                    addToast('success', 'Auto-Lock', e.target.checked ? 'Enabled' : 'Disabled');
                                  } catch (err) {
                                    addToast('error', 'Error', err.message);
                                  }
                                }}
                                style={{ opacity: 0, width: 0, height: 0 }}
                              />
                              <span style={{
                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                background: voucherLock.autoEnabled ? 'var(--blue)' : 'var(--bg4)',
                                borderRadius: '12px', transition: '0.3s'
                              }}>
                                <span style={{
                                  position: 'absolute', top: '2px', left: voucherLock.autoEnabled ? '22px' : '2px',
                                  width: '20px', height: '20px', background: 'white', borderRadius: '50%', transition: '0.3s'
                                }} />
                              </span>
                            </label>
                          </div>
                          {voucherLock.autoEnabled && (
                            <div className="s-row" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '6px' }}>
                              <div className="s-name">Lock Time</div>
                              <input
                                type="time"
                                value={voucherLock.autoTime || '18:00'}
                                onChange={async (e) => {
                                  try {
                                    await setVoucherLockSchedule({ enabled: true, time: e.target.value });
                                    fetchVoucherLockStatus();
                                  } catch (err) {
                                    addToast('error', 'Error', err.message);
                                  }
                                }}
                                style={{ padding: '8px 10px', fontSize: '13px', border: '1px solid var(--border)', borderRadius: '8px', background: 'var(--bg)', color: 'var(--t1)' }}
                              />
                            </div>
                          )}
                        </div>

                        {voucherLock.lastAction && (
                          <div style={{ borderTop: '1px solid var(--border)', margin: '12px 0', paddingTop: '12px' }}>
                            <div style={{ fontSize: '11px', color: 'var(--t3)' }}>
                              Last: {voucherLock.lastAction.action === 'lock' ? '🔒 Locked' : voucherLock.lastAction.action === 'unlock' ? '🔓 Unlocked' : '⏰ Auto-locked'}{' '}
                              {voucherLock.lastAction.totalLocked || voucherLock.lastAction.totalUnlocked || 0} vouchers{' '}
                              on {new Date(voucherLock.lastAction.timestamp).toLocaleString()}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ textAlign: 'center', padding: '20px' }}>
                        <button
                          onClick={fetchVoucherLockStatus}
                          style={{ padding: '10px 20px', background: 'var(--blue)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: '600', cursor: 'pointer' }}
                        >
                          Load Lock Status
                        </button>
                      </div>
                    )}
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
