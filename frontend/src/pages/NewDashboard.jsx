/**
 * New Dashboard - Pending Sales Bills with Payment
 * OPTIMIZED VERSION - Fast Loading & Hang-Free
 *
 * Features:
 * - Local caching for instant load
 * - Debounced search (no lag while typing)
 * - Pagination with "Load More"
 * - Virtual rendering (only visible items)
 * - useMemo/useCallback optimizations
 * - Activity Log with alterId tracking
 * - Chart of Accounts with Ledger Account Book
 * - Sync Start/Stop controls
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  RefreshCw,
  Wifi,
  WifiOff,
  Search,
  Banknote,
  CreditCard,
  Building2,
  Smartphone,
  Percent,
  FileText,
  CheckCircle,
  AlertCircle,
  Send,
  X,
  ChevronRight,
  ChevronDown,
  Printer,
  History,
  Plus,
  MessageSquare,
  Eye,
  EyeOff,
  Play,
  Square,
  User,
  FolderTree,
  Folder,
  FolderOpen,
  BookOpen,
  Database,
  Package,
  Users,
  Calendar,
  RotateCcw,
  Download,
  Clock
} from 'lucide-react';
import { adStringToBS, getTodayBSFormatted } from '../utils/nepaliDate';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const CACHE_KEY = 'pendingBills_cache';
const CACHE_DURATION = 60000; // 1 minute cache
const PAGE_SIZE = 50; // Show 50 items at a time
const MAX_ALTER_KEY = 'maxAlterId_cache'; // Track last alterId for incremental sync

export default function NewDashboard() {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  // Pending bills
  const [pendingBills, setPendingBills] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedBill, setSelectedBill] = useState(null);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [maxAlterId, setMaxAlterId] = useState(0); // Track max alterId for incremental sync
  const [syncing, setSyncing] = useState(false); // Show subtle sync indicator
  const [showBills, setShowBills] = useState(true); // Toggle bills list visibility
  const [activeTab, setActiveTab] = useState('bills'); // 'bills', 'activity', or 'coa'

  // Tally connection status
  const [tallyStatus, setTallyStatus] = useState({ connected: false, checking: true });

  // Sync service control
  const [syncServiceRunning, setSyncServiceRunning] = useState(true);
  const [syncServiceLoading, setSyncServiceLoading] = useState(false);

  // Payment modes state - maps to UDF fields SFL1-SFL7
  const [paymentModes, setPaymentModes] = useState({
    cashTeller1: '',
    cashTeller2: '',
    chequeReceipt: '',
    qrCode: '',
    discount: '',
    bankDeposit: '',
    esewa: ''
  });

  // Print modal state
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printBill, setPrintBill] = useState(null);
  const [printLoading, setPrintLoading] = useState(false);

  // Activity log state
  const [activityOpen, setActivityOpen] = useState(false);
  const [activities, setActivities] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // Create bill modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creatingBill, setCreatingBill] = useState(false);
  const [newBill, setNewBill] = useState({
    partyName: '',
    amount: '',
    narration: ''
  });
  const [parties, setParties] = useState([]);
  const [partySearch, setPartySearch] = useState('');

  // Chart of Accounts state
  const [coaData, setCoaData] = useState({ groups: [], allLedgers: [] });
  const [coaLoading, setCoaLoading] = useState(false);
  const [coaSearch, setCoaSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [allLedgersSearch, setAllLedgersSearch] = useState('');

  // Ledger Account Book (Transaction History)
  const [selectedLedger, setSelectedLedger] = useState(null);
  const [ledgerTransactions, setLedgerTransactions] = useState([]);
  const [ledgerTransLoading, setLedgerTransLoading] = useState(false);
  const [ledgerTransTotals, setLedgerTransTotals] = useState({ debit: 0, credit: 0, netBalance: 0 });

  // Web narration for payment
  const [webNarration, setWebNarration] = useState('');

  // Sync panel state
  const [syncState, setSyncState] = useState({
    stockItemsCount: 0,
    partiesCount: 0,
    lastStockAlterId: 0,
    lastPartyAlterId: 0
  });
  const [partialSyncLoading, setPartialSyncLoading] = useState({
    stock: false,
    parties: false,
    masters: false,
    vouchers: false,
    psb: false,
    udf: false,
    resetStock: false,
    resetParties: false
  });

  // Recently Altered Vouchers state
  const [recentVouchers, setRecentVouchers] = useState([]);
  const [recentVouchersLoading, setRecentVouchersLoading] = useState(false);
  const [recentVouchersState, setRecentVouchersState] = useState({
    count: 0,
    totalCount: 0,
    lastAlterId: 0,
    lastSyncTime: null
  });
  const [recentVouchersSearch, setRecentVouchersSearch] = useState('');

  // Refs for performance
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Load cached data immediately on mount + setup fast sync
  useEffect(() => {
    loadCachedBills();
    checkTallyStatus();
    checkSyncStatus();

    // Load fresh data in background
    loadPendingBills(false);

    // Check tally status every 15 seconds (faster than before)
    const statusInterval = setInterval(checkTallyStatus, 15000);

    // Auto-refresh bills every 8 seconds for faster sync
    const syncInterval = setInterval(() => {
      loadPendingBills(false);
    }, 8000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(syncInterval);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Debounced search - wait 150ms after user stops typing (faster)
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setDisplayCount(PAGE_SIZE); // Reset pagination on new search
    }, 150);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  // Load from localStorage cache - INSTANTLY shows cached bills
  const loadCachedBills = useCallback(() => {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp, alterId } = JSON.parse(cached);
        // Always show cached data immediately - even if old
        if (data && data.length > 0) {
          setPendingBills(data);
          if (alterId) setMaxAlterId(alterId);
        }
      }
      // Also load cached maxAlterId
      const cachedAlterId = localStorage.getItem(MAX_ALTER_KEY);
      if (cachedAlterId) {
        setMaxAlterId(parseInt(cachedAlterId, 10));
      }
    } catch (e) {
      console.warn('Cache read error:', e);
    }
  }, []);

  // Save to localStorage cache
  const saveCachedBills = useCallback((bills, alterId) => {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: bills,
        timestamp: Date.now(),
        alterId: alterId
      }));
      if (alterId) {
        localStorage.setItem(MAX_ALTER_KEY, alterId.toString());
      }
    } catch (e) {
      console.warn('Cache write error:', e);
    }
  }, []);

  const checkTallyStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/tally/status`, {
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      const data = await res.json();
      setTallyStatus({ connected: data.connected, checking: false });
    } catch {
      setTallyStatus({ connected: false, checking: false });
    }
  }, []);

  // Check sync service status
  const checkSyncStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/sync/status`);
      const data = await res.json();
      setSyncServiceRunning(data.isRunning);
    } catch {
      console.warn('Failed to check sync status');
    }
  }, []);

  // Stop sync service
  const stopSyncService = useCallback(async () => {
    setSyncServiceLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/sync/stop`, { method: 'POST' });
      const data = await res.json();
      setSyncServiceRunning(data.isRunning);
      setMessage({ type: 'success', text: 'Sync service stopped' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to stop sync service' });
    } finally {
      setSyncServiceLoading(false);
    }
  }, []);

  // Start sync service
  const startSyncService = useCallback(async () => {
    setSyncServiceLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/sync/start`, { method: 'POST' });
      const data = await res.json();
      setSyncServiceRunning(data.isRunning);
      if (data.success) {
        setMessage({ type: 'success', text: 'Sync service started' });
      } else {
        setMessage({ type: 'error', text: data.message || 'Failed to start sync' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to start sync service' });
    } finally {
      setSyncServiceLoading(false);
    }
  }, []);

  // Load master sync state
  const loadSyncState = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/sync/master-state`);
      const data = await res.json();
      setSyncState(data);
    } catch (error) {
      console.error('Error loading sync state:', error);
    }
  }, []);

  // Load recently altered vouchers from database
  const loadRecentVouchers = useCallback(async () => {
    setRecentVouchersLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/all-vouchers/recent?limit=200`);
      const data = await res.json();
      if (data.success) {
        setRecentVouchers(data.vouchers || []);
        setRecentVouchersState({
          count: data.count,
          totalCount: data.totalCount,
          lastAlterId: data.lastAlterId,
          lastSyncTime: data.lastSyncTime
        });
      }
    } catch (error) {
      console.error('Error loading recent vouchers:', error);
    } finally {
      setRecentVouchersLoading(false);
    }
  }, []);

  // Sync vouchers incrementally (only new/modified based on AlterID)
  // Sync vouchers with ledger entries (for local balance calculation)
  const syncVouchersIncremental = useCallback(async () => {
    setPartialSyncLoading(prev => ({ ...prev, vouchers: true }));
    try {
      const res = await fetch(`${API_BASE}/api/all-vouchers/sync-with-entries`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const msg = data.count > 0
          ? `Synced ${data.count} vouchers (${data.newVouchers} new, ${data.alteredVouchers} altered) with ${data.ledgerEntriesCount} entries`
          : 'No new or altered vouchers';
        setMessage({ type: 'success', text: msg });
        loadRecentVouchers();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to sync vouchers' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to sync vouchers' });
    } finally {
      setPartialSyncLoading(prev => ({ ...prev, vouchers: false }));
    }
  }, [loadRecentVouchers]);

  // Partial sync - Stock items only
  const syncStock = useCallback(async () => {
    setPartialSyncLoading(prev => ({ ...prev, stock: true }));
    try {
      const res = await fetch(`${API_BASE}/api/sync/stock`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Stock items synced: ${data.count} items` });
        loadSyncState();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to sync stock items' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to sync stock items' });
    } finally {
      setPartialSyncLoading(prev => ({ ...prev, stock: false }));
    }
  }, [loadSyncState]);

  // Partial sync - Parties only
  const syncParties = useCallback(async () => {
    setPartialSyncLoading(prev => ({ ...prev, parties: true }));
    try {
      const res = await fetch(`${API_BASE}/api/sync/parties`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Parties synced: ${data.count} (${data.debtors} debtors, ${data.creditors} creditors)` });
        loadSyncState();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to sync parties' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to sync parties' });
    } finally {
      setPartialSyncLoading(prev => ({ ...prev, parties: false }));
    }
  }, [loadSyncState]);

  // Partial sync - Masters (stock + parties)
  const syncMasters = useCallback(async () => {
    setPartialSyncLoading(prev => ({ ...prev, masters: true }));
    try {
      const res = await fetch(`${API_BASE}/api/sync/masters`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Masters synced: ${data.stock?.count || 0} stock items, ${data.parties?.count || 0} parties` });
        loadSyncState();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to sync masters' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to sync masters' });
    } finally {
      setPartialSyncLoading(prev => ({ ...prev, masters: false }));
    }
  }, [loadSyncState]);

  // Partial sync - Pending Sales Bills only
  const syncPSB = useCallback(async () => {
    setPartialSyncLoading(prev => ({ ...prev, psb: true }));
    try {
      const res = await fetch(`${API_BASE}/api/pending-sales-bills/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Pending bills synced: ${data.count} bills` });
        loadPendingBills(true);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to sync pending bills' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to sync pending bills' });
    } finally {
      setPartialSyncLoading(prev => ({ ...prev, psb: false }));
    }
  }, []);

  // Sync UDF fields from Tally - detects payments made via UDF and marks as paid
  const syncUDF = useCallback(async () => {
    setPartialSyncLoading(prev => ({ ...prev, udf: true }));
    try {
      const res = await fetch(`${API_BASE}/api/pending-sales-bills/sync-udf`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        const msg = data.markedAsPaid > 0
          ? `UDF Sync: ${data.markedAsPaid} bills marked as paid`
          : `UDF Sync complete: No new payments detected`;
        setMessage({ type: 'success', text: msg });
        loadPendingBills(true);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to sync UDF fields' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to sync UDF fields' });
    } finally {
      setPartialSyncLoading(prev => ({ ...prev, udf: false }));
    }
  }, []);

  // Reset and full sync - Stock items
  const resetAndSyncStock = useCallback(async () => {
    if (!confirm('This will reset all stock items and do a full sync. Continue?')) return;
    setPartialSyncLoading(prev => ({ ...prev, resetStock: true }));
    try {
      const res = await fetch(`${API_BASE}/api/sync/reset-stock`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Stock items reset and synced: ${data.count} items` });
        loadSyncState();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to reset stock items' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to reset stock items' });
    } finally {
      setPartialSyncLoading(prev => ({ ...prev, resetStock: false }));
    }
  }, [loadSyncState]);

  // Reset and full sync - Parties
  const resetAndSyncParties = useCallback(async () => {
    if (!confirm('This will reset all parties and do a full sync. Continue?')) return;
    setPartialSyncLoading(prev => ({ ...prev, resetParties: true }));
    try {
      const res = await fetch(`${API_BASE}/api/sync/reset-parties`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `Parties reset and synced: ${data.count} parties` });
        loadSyncState();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to reset parties' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to reset parties' });
    } finally {
      setPartialSyncLoading(prev => ({ ...prev, resetParties: false }));
    }
  }, [loadSyncState]);

  const loadPendingBills = useCallback(async (fullRefresh = false) => {
    // Abort previous request if still pending
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    try {
      // Only show loading on manual full refresh, use subtle syncing for auto-refresh
      if (fullRefresh) {
        setLoading(true);
      } else {
        setSyncing(true);
      }

      // Use incremental fetch if we have existing bills and not forcing full refresh
      const useIncremental = !fullRefresh && maxAlterId > 0 && pendingBills.length > 0;
      const url = useIncremental
        ? `${API_BASE}/api/pending-sales-bills?since_alter_id=${maxAlterId}`
        : `${API_BASE}/api/pending-sales-bills`;

      const res = await fetch(url, {
        signal: abortControllerRef.current.signal
      });
      const data = await res.json();

      if (data.success) {
        const newBills = data.bills || [];

        if (useIncremental && newBills.length > 0) {
          // Merge new/updated bills into existing list
          setPendingBills(prev => {
            const billMap = new Map(prev.map(b => [b.masterId, b]));
            // Update existing or add new bills
            newBills.forEach(bill => {
              billMap.set(bill.masterId, bill);
            });
            // Convert back to array and sort by date desc
            const merged = Array.from(billMap.values());
            merged.sort((a, b) => {
              const dateCompare = (b.date || '').localeCompare(a.date || '');
              if (dateCompare !== 0) return dateCompare;
              return (b.alterId || 0) - (a.alterId || 0);
            });
            return merged;
          });
        } else if (!useIncremental) {
          // Full refresh - replace all bills
          setPendingBills(newBills);
        }

        // Update maxAlterId
        if (data.maxAlterId && data.maxAlterId > maxAlterId) {
          setMaxAlterId(data.maxAlterId);
        }

        // Save to cache (use current state for incremental)
        if (!useIncremental) {
          saveCachedBills(newBills, data.maxAlterId);
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        console.error('Error loading pending bills:', error);
      }
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, [saveCachedBills, maxAlterId, pendingBills.length]);

  // Load parties for autocomplete
  const loadParties = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/parties`);
      const data = await res.json();
      if (data.success) {
        setParties(data.parties || []);
      }
    } catch (error) {
      console.error('Error loading parties:', error);
    }
  }, []);

  // Create new Pending Sales Bill
  const createPendingSalesBill = useCallback(async () => {
    if (!newBill.partyName || !newBill.amount) {
      setMessage({ type: 'error', text: 'Party name and amount are required' });
      return;
    }

    setCreatingBill(true);
    try {
      const res = await fetch(`${API_BASE}/api/pending-sales-bills/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyName: newBill.partyName,
          amount: parseFloat(newBill.amount),
          narration: newBill.narration || '',
          voucherType: 'Pending Sales Bill'
        })
      });
      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: `Bill created successfully${data.voucherNumber ? ` - ${data.voucherNumber}` : ''}` });
        setCreateModalOpen(false);
        setNewBill({ partyName: '', amount: '', narration: '' });
        loadPendingBills(true); // Refresh the list
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create bill' });
      }
    } catch (error) {
      console.error('Error creating bill:', error);
      setMessage({ type: 'error', text: 'Failed to create bill' });
    } finally {
      setCreatingBill(false);
    }
  }, [newBill, loadPendingBills]);

  // Filtered parties for autocomplete
  const filteredParties = useMemo(() => {
    return parties.filter(p =>
      p.name?.toLowerCase().includes(partySearch.toLowerCase())
    ).slice(0, 10);
  }, [parties, partySearch]);

  // Load Chart of Accounts
  const loadChartOfAccounts = useCallback(async (forceRefresh = false) => {
    setCoaLoading(true);
    try {
      const url = forceRefresh
        ? `${API_BASE}/api/chart-of-accounts?refresh=true`
        : `${API_BASE}/api/chart-of-accounts`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setCoaData({
          groups: data.groups || [],
          allLedgers: data.allLedgers || []
        });
      }
    } catch (error) {
      console.error('Error loading chart of accounts:', error);
      setMessage({ type: 'error', text: 'Failed to load Chart of Accounts' });
    } finally {
      setCoaLoading(false);
    }
  }, []);

  // Load ledger transactions (Account Book)
  const loadLedgerTransactions = useCallback(async (ledgerName, forceTally = false) => {
    setSelectedLedger(ledgerName);
    setLedgerTransLoading(true);
    try {
      const url = forceTally
        ? `${API_BASE}/api/chart-of-accounts/ledgers/${encodeURIComponent(ledgerName)}/transactions?source=tally`
        : `${API_BASE}/api/chart-of-accounts/ledgers/${encodeURIComponent(ledgerName)}/transactions`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setLedgerTransactions(data.vouchers || []);
        setLedgerTransTotals(data.totals || { debit: 0, credit: 0, netBalance: 0 });
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to load transactions' });
      }
    } catch (error) {
      console.error('Error loading ledger transactions:', error);
      setMessage({ type: 'error', text: 'Failed to load transactions' });
    } finally {
      setLedgerTransLoading(false);
    }
  }, []);

  // Toggle group expansion
  const toggleGroup = useCallback((groupName) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupName]: !prev[groupName]
    }));
  }, []);

  // Filter Chart of Accounts by search
  const filteredCoaGroups = useMemo(() => {
    return coaData.groups.map(group => ({
      ...group,
      ledgers: group.ledgers?.filter(ledger =>
        ledger.name?.toLowerCase().includes(coaSearch.toLowerCase())
      ) || []
    })).filter(group =>
      group.name?.toLowerCase().includes(coaSearch.toLowerCase()) ||
      group.ledgers.length > 0
    );
  }, [coaData.groups, coaSearch]);

  // Filtered all ledgers for the All Ledgers tab
  const filteredAllLedgers = useMemo(() => {
    if (!allLedgersSearch) return coaData.allLedgers;
    const query = allLedgersSearch.toLowerCase();
    return coaData.allLedgers.filter(ledger =>
      ledger.name?.toLowerCase().includes(query) ||
      ledger.parent?.toLowerCase().includes(query)
    );
  }, [coaData.allLedgers, allLedgersSearch]);

  // Filtered recently altered vouchers
  const filteredRecentVouchers = useMemo(() => {
    if (!recentVouchersSearch) return recentVouchers;
    const query = recentVouchersSearch.toLowerCase();
    return recentVouchers.filter(v =>
      v.party_name?.toLowerCase().includes(query) ||
      v.voucher_number?.toLowerCase().includes(query) ||
      v.voucher_type?.toLowerCase().includes(query)
    );
  }, [recentVouchers, recentVouchersSearch]);

  // Memoized filtered bills - only recalculates when search or bills change
  const filteredBills = useMemo(() => {
    if (!debouncedSearch) return pendingBills;

    const query = debouncedSearch.toLowerCase();
    return pendingBills.filter(bill =>
      bill.partyName?.toLowerCase().includes(query) ||
      bill.voucherNumber?.toLowerCase().includes(query)
    );
  }, [pendingBills, debouncedSearch]);

  // Display limited items for performance
  const displayedBills = useMemo(() => {
    return filteredBills.slice(0, displayCount);
  }, [filteredBills, displayCount]);

  const hasMore = displayCount < filteredBills.length;

  // Load more items
  const loadMore = useCallback(() => {
    setDisplayCount(prev => prev + PAGE_SIZE);
  }, []);

  // Calculate total payment - memoized
  const totalPayment = useMemo(() => {
    return (
      (parseFloat(paymentModes.cashTeller1) || 0) +
      (parseFloat(paymentModes.cashTeller2) || 0) +
      (parseFloat(paymentModes.chequeReceipt) || 0) +
      (parseFloat(paymentModes.qrCode) || 0) +
      (parseFloat(paymentModes.discount) || 0) +
      (parseFloat(paymentModes.bankDeposit) || 0) +
      (parseFloat(paymentModes.esewa) || 0)
    );
  }, [paymentModes]);

  const isFullPayment = selectedBill && totalPayment >= selectedBill.amount;
  const newVoucherType = isFullPayment ? 'Sales' : 'Credit Sales';
  const balanceAfter = selectedBill ? Math.max(0, selectedBill.amount - totalPayment) : 0;

  // Update payment mode - useCallback for stable reference
  const updatePaymentMode = useCallback((field, value) => {
    setPaymentModes(prev => ({ ...prev, [field]: value }));
  }, []);

  // Select a bill
  const selectBill = useCallback((bill) => {
    setSelectedBill(bill);
    setMessage(null);

    // Pre-fill existing UDF values if any
    if (bill.sfl1 || bill.sfl2 || bill.sfl3 || bill.sfl4 || bill.sfl5 || bill.sfl6 || bill.sfl7) {
      setPaymentModes({
        cashTeller1: bill.sfl1 > 0 ? String(bill.sfl1) : '',
        cashTeller2: bill.sfl2 > 0 ? String(bill.sfl2) : '',
        chequeReceipt: bill.sfl3 > 0 ? String(bill.sfl3) : '',
        qrCode: bill.sfl4 > 0 ? String(bill.sfl4) : '',
        discount: bill.sfl5 > 0 ? String(bill.sfl5) : '',
        bankDeposit: bill.sfl6 > 0 ? String(bill.sfl6) : '',
        esewa: bill.sfl7 > 0 ? String(bill.sfl7) : ''
      });
    } else {
      setPaymentModes({
        cashTeller1: '',
        cashTeller2: '',
        chequeReceipt: '',
        qrCode: '',
        discount: '',
        bankDeposit: '',
        esewa: ''
      });
    }
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedBill(null);
    setPaymentModes({
      cashTeller1: '',
      cashTeller2: '',
      chequeReceipt: '',
      qrCode: '',
      discount: '',
      bankDeposit: '',
      esewa: ''
    });
    setWebNarration('');
    setMessage(null);
  }, []);

  // Clear payment fields
  const clearPayments = useCallback(() => {
    setPaymentModes({
      cashTeller1: '',
      cashTeller2: '',
      chequeReceipt: '',
      qrCode: '',
      discount: '',
      bankDeposit: '',
      esewa: ''
    });
  }, []);

  // Set full payment
  const setFullPayment = useCallback(() => {
    if (selectedBill) {
      setPaymentModes({
        cashTeller1: String(selectedBill.amount),
        cashTeller2: '',
        chequeReceipt: '',
        qrCode: '',
        discount: '',
        bankDeposit: '',
        esewa: ''
      });
    }
  }, [selectedBill]);

  // Complete payment
  const completePayment = useCallback(async () => {
    if (!selectedBill) return;
    if (totalPayment <= 0) {
      setMessage({ type: 'error', text: 'Enter at least one payment amount' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/api/pending-sales-bills/${selectedBill.masterId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyName: selectedBill.partyName,
          amount: selectedBill.amount,
          date: selectedBill.date,
          voucherNumber: selectedBill.voucherNumber,
          guid: selectedBill.guid,
          webNarration: webNarration || '',
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

      const data = await res.json();

      if (res.ok && data.success) {
        setMessage({
          type: 'success',
          text: `${selectedBill.voucherNumber} updated to ${data.newVoucherType}! Rs ${totalPayment.toLocaleString()}`
        });
        clearSelection();
        loadPendingBills(false); // Refresh in background
      } else {
        setMessage({ type: 'error', text: data.error || 'Payment failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  }, [selectedBill, totalPayment, paymentModes, webNarration, clearSelection, loadPendingBills]);

  // Memoized total for all filtered bills
  const totalAmount = useMemo(() => {
    return filteredBills.reduce((sum, b) => sum + (b.amount || 0), 0);
  }, [filteredBills]);

  // Load bill with inventory for printing - show bill immediately, load inventory in background
  const loadBillForPrint = useCallback(async (bill) => {
    setPrintModalOpen(true);
    // Show basic bill info immediately
    setPrintBill(bill);
    setPrintLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/pending-sales-bills/${bill.masterId}/inventory`, {
        signal: AbortSignal.timeout(8000) // 8 second timeout for inventory
      });
      const data = await res.json();

      if (data.success && data.bill) {
        // Update with inventory data
        setPrintBill(prev => ({
          ...prev,
          ...data.bill
        }));
      }
    } catch (error) {
      // Keep showing basic bill info on error
      console.log('Inventory load skipped:', error.message);
    } finally {
      setPrintLoading(false);
    }
  }, []);

  // Print the bill
  const handlePrint = useCallback(() => {
    const printContent = document.getElementById('print-content');
    if (!printContent) return;

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bill - ${printBill?.voucherNumber || ''}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f5f5f5; }
          .header { text-align: center; margin-bottom: 20px; }
          .party-info { margin-bottom: 15px; }
          .totals { margin-top: 15px; text-align: right; }
          .total-row { font-weight: bold; font-size: 1.2em; }
          @media print { body { padding: 0; } }
        </style>
      </head>
      <body>
        ${printContent.innerHTML}
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.print();
  }, [printBill]);

  // Load activity log
  const loadActivities = useCallback(async () => {
    setActivityLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/activity/today`);
      const data = await res.json();
      if (data.success) {
        setActivities(data.activities || []);
      }
    } catch (error) {
      console.error('Error loading activities:', error);
    } finally {
      setActivityLoading(false);
    }
  }, []);

  // Toggle activity panel
  const toggleActivity = useCallback(() => {
    if (!activityOpen) {
      loadActivities();
    }
    setActivityOpen(prev => !prev);
  }, [activityOpen, loadActivities]);

  // Bill row component - for performance with narration and BS date
  const BillRow = useCallback(({ bill }) => {
    const isSelected = selectedBill?.masterId === bill.masterId;
    const bsDate = adStringToBS(bill.date, 'nepali-short');
    return (
      <div
        className={`p-3 transition-colors ${
          isSelected
            ? 'bg-blue-50 border-l-4 border-blue-500'
            : 'hover:bg-gray-50'
        }`}
      >
        <div className="flex items-center gap-2">
          {/* Main Content - clickable */}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => selectBill(bill)}>
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-800 truncate">
                {bill.partyName}
              </span>
              {bill.sflTot > 0 && (
                <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                  Paid
                </span>
              )}
              {bill.isOffline && (
                <span className="px-1.5 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">
                  Offline
                </span>
              )}
            </div>
            <div className="text-sm text-gray-500 flex items-center gap-2 flex-wrap">
              <span className="font-mono">{bill.voucherNumber}</span>
              <span>•</span>
              <span>{bill.date}</span>
              <span className="text-xs text-purple-600">({bsDate})</span>
            </div>
            {/* Show narration if exists */}
            {bill.narration && (
              <div className="text-xs text-gray-400 mt-0.5 truncate flex items-center gap-1">
                <MessageSquare size={10} />
                {bill.narration}
              </div>
            )}
          </div>

          {/* Amount */}
          <div className="text-right">
            <div className="font-bold text-red-600">
              Rs {bill.amount?.toLocaleString()}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-1">
            {/* Print */}
            <button
              onClick={(e) => { e.stopPropagation(); loadBillForPrint(bill); }}
              className="p-1.5 hover:bg-gray-200 rounded text-gray-500 hover:text-blue-600"
              title="Print Bill"
            >
              <Printer size={16} />
            </button>
            {/* Select */}
            <ChevronRight size={18} className="text-gray-400 cursor-pointer" onClick={() => selectBill(bill)} />
          </div>
        </div>
      </div>
    );
  }, [selectedBill, selectBill, loadBillForPrint]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Tabs */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => setActiveTab('bills')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'bills'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <FileText size={18} />
                Pending Bills
              </button>
              <button
                onClick={() => { setActiveTab('activity'); loadActivities(); }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'activity'
                    ? 'bg-purple-100 text-purple-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <History size={18} />
                Activity Log
              </button>
              <button
                onClick={() => {
                  setActiveTab('coa');
                  if (coaData.groups.length === 0) {
                    loadChartOfAccounts();
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'coa'
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <FolderTree size={18} />
                Chart of Accounts
              </button>
              <button
                onClick={() => {
                  setActiveTab('ledgers');
                  if (coaData.allLedgers.length === 0) {
                    loadChartOfAccounts();
                  }
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'ledgers'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <BookOpen size={18} />
                All Ledgers
              </button>
              <button
                onClick={() => {
                  setActiveTab('recent');
                  loadRecentVouchers();
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'recent'
                    ? 'bg-orange-100 text-orange-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Clock size={18} />
                Recent Vouchers
              </button>
              <button
                onClick={() => {
                  setActiveTab('sync');
                  loadSyncState();
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === 'sync'
                    ? 'bg-green-100 text-green-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Database size={18} />
                Sync Data
              </button>
            </div>
            <div className="flex items-center gap-3">
              {/* Sync Status - subtle indicator */}
              {syncing && (
                <div className="flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-blue-50 text-blue-600">
                  <RefreshCw size={10} className="animate-spin" />
                  <span>Syncing</span>
                </div>
              )}

              {/* Tally Status */}
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${
                tallyStatus.checking
                  ? 'bg-gray-100 text-gray-600'
                  : tallyStatus.connected
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
              }`}>
                {tallyStatus.checking ? (
                  <RefreshCw size={12} className="animate-spin" />
                ) : tallyStatus.connected ? (
                  <Wifi size={12} />
                ) : (
                  <WifiOff size={12} />
                )}
                <span>{tallyStatus.connected ? 'Online' : 'Offline'}</span>
              </div>

              {/* Sync Service Control */}
              <button
                onClick={syncServiceRunning ? stopSyncService : startSyncService}
                disabled={syncServiceLoading}
                className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs transition-colors ${
                  syncServiceLoading
                    ? 'bg-gray-100 text-gray-500 cursor-wait'
                    : syncServiceRunning
                      ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                      : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
                title={syncServiceRunning ? 'Stop Sync Service' : 'Start Sync Service'}
              >
                {syncServiceLoading ? (
                  <RefreshCw size={12} className="animate-spin" />
                ) : syncServiceRunning ? (
                  <Square size={12} />
                ) : (
                  <Play size={12} />
                )}
                <span>{syncServiceRunning ? 'Stop Sync' : 'Start Sync'}</span>
              </button>

              {/* Toggle Bills View */}
              <button
                onClick={() => setShowBills(prev => !prev)}
                className={`p-2 rounded-lg ${showBills ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'}`}
                title={showBills ? 'Hide Bills' : 'Show Bills'}
              >
                {showBills ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>

              {/* Create Bill */}
              <button
                onClick={() => {
                  loadParties();
                  setCreateModalOpen(true);
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                title="Create Pending Sales Bill"
              >
                <Plus size={16} />
                <span>Create Bill</span>
              </button>

              {/* Activity Log Panel Toggle */}
              <button
                onClick={toggleActivity}
                className={`p-2 rounded-lg ${activityOpen ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'}`}
                title="Activity Log"
              >
                <History size={18} />
              </button>

              {/* Refresh */}
              <button
                onClick={() => loadPendingBills(true)}
                className="p-2 hover:bg-gray-100 rounded-lg"
                disabled={loading}
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Search - Bills Tab */}
          {activeTab === 'bills' && (
            <div className="relative mt-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search party name or voucher number..."
                className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"
              />
              {searchQuery !== debouncedSearch && (
                <RefreshCw size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
              )}
            </div>
          )}

          {/* Search - Chart of Accounts Tab */}
          {activeTab === 'coa' && (
            <div className="relative mt-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={coaSearch}
                onChange={(e) => setCoaSearch(e.target.value)}
                placeholder="Search ledger or group..."
                className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"
              />
            </div>
          )}

          {/* Search - All Ledgers Tab */}
          {activeTab === 'ledgers' && (
            <div className="relative mt-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={allLedgersSearch}
                onChange={(e) => setAllLedgersSearch(e.target.value)}
                placeholder="Search ledger name..."
                className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"
              />
            </div>
          )}

          {/* Search - Recent Vouchers Tab */}
          {activeTab === 'recent' && (
            <div className="relative mt-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={recentVouchersSearch}
                onChange={(e) => setRecentVouchersSearch(e.target.value)}
                placeholder="Search party, voucher number, or type..."
                className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm"
              />
            </div>
          )}
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`mx-4 mt-4 p-3 rounded-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {message.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-4">
        {/* Pending Bills Tab Content */}
        {activeTab === 'bills' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Bills List */}
            <div className={`${showBills ? 'lg:col-span-2' : 'lg:col-span-1'} bg-white rounded-lg shadow-sm overflow-hidden`}>
              {/* Header with toggle */}
              <div
                className="p-3 border-b bg-gray-50 flex items-center justify-between cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => setShowBills(prev => !prev)}
              >
                <div className="flex items-center gap-2">
                  {showBills ? <Eye size={16} className="text-blue-600" /> : <EyeOff size={16} className="text-gray-400" />}
                  <span className="font-medium text-gray-700">
                    Bills List ({filteredBills.length})
                    {!showBills && (
                      <span className="text-xs text-blue-600 ml-2">Click to expand</span>
                    )}
                  </span>
                </div>
                <span className="text-sm font-medium text-red-600">
                  Rs {totalAmount.toLocaleString()}
                </span>
              </div>

              {/* Bills content - only show when expanded */}
              {showBills && (
                <>
                  {loading && pendingBills.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                      Loading...
                    </div>
                  ) : filteredBills.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      No pending bills found
                    </div>
                  ) : (
                    <>
                      <div className="divide-y max-h-[60vh] overflow-y-auto">
                        {displayedBills.map((bill) => (
                          <BillRow key={bill.masterId} bill={bill} />
                        ))}
                      </div>

                      {/* Load More Button */}
                      {hasMore && (
                        <div className="p-3 border-t bg-gray-50">
                          <button
                            onClick={(e) => { e.stopPropagation(); loadMore(); }}
                            className="w-full py-2 text-sm text-blue-600 hover:bg-blue-50 rounded flex items-center justify-center gap-1"
                          >
                            <ChevronDown size={16} />
                            Load More ({filteredBills.length - displayedBills.length} remaining)
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            {/* Payment Panel */}
            <div className={`${showBills ? '' : 'lg:col-span-2'} bg-white rounded-lg shadow-sm`}>
              {selectedBill ? (
                <>
                  {/* Selected Bill Info */}
                  <div className="p-3 border-b bg-blue-50">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-blue-800">{selectedBill.voucherNumber}</span>
                      <button onClick={clearSelection} className="p-1 hover:bg-blue-100 rounded">
                        <X size={16} className="text-blue-600" />
                      </button>
                    </div>
                    <div className="text-blue-700 text-sm">{selectedBill.partyName}</div>
                    <div className="text-blue-600 text-xs mt-1">{selectedBill.date}</div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-sm text-gray-600">Bill Amount:</span>
                      <span className="text-lg font-bold text-red-600">
                        Rs {selectedBill.amount?.toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Payment Form */}
                  <div className="p-3">
                    {/* Quick Actions */}
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={setFullPayment}
                        className="flex-1 py-1.5 text-xs border border-green-500 text-green-700 rounded hover:bg-green-50"
                      >
                        Full Payment
                      </button>
                      <button
                        onClick={clearPayments}
                        className="flex-1 py-1.5 text-xs border border-gray-300 text-gray-600 rounded hover:bg-gray-50"
                      >
                        Clear
                      </button>
                    </div>

                    {/* Payment Fields - Inline inputs to prevent focus loss */}
                    <div className="space-y-2">
                      {/* Cash Teller 1 */}
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-100 rounded"><Banknote size={14} className="text-gray-600" /></div>
                        <div className="flex-1">
                          <div className="text-xs text-gray-500">Cash Teller 1 (SFL1)</div>
                          <input type="number" inputMode="decimal" value={paymentModes.cashTeller1}
                            onChange={(e) => updatePaymentMode('cashTeller1', e.target.value)}
                            placeholder="0" className="w-full p-1 border rounded text-right text-sm font-mono" />
                        </div>
                      </div>
                      {/* Cash Teller 2 */}
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-100 rounded"><Banknote size={14} className="text-gray-600" /></div>
                        <div className="flex-1">
                          <div className="text-xs text-gray-500">Cash Teller 2 (SFL2)</div>
                          <input type="number" inputMode="decimal" value={paymentModes.cashTeller2}
                            onChange={(e) => updatePaymentMode('cashTeller2', e.target.value)}
                            placeholder="0" className="w-full p-1 border rounded text-right text-sm font-mono" />
                        </div>
                      </div>
                      {/* Cheque */}
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-100 rounded"><CreditCard size={14} className="text-gray-600" /></div>
                        <div className="flex-1">
                          <div className="text-xs text-gray-500">Cheque (SFL3)</div>
                          <input type="number" inputMode="decimal" value={paymentModes.chequeReceipt}
                            onChange={(e) => updatePaymentMode('chequeReceipt', e.target.value)}
                            placeholder="0" className="w-full p-1 border rounded text-right text-sm font-mono" />
                        </div>
                      </div>
                      {/* Q/R Code */}
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-100 rounded"><FileText size={14} className="text-gray-600" /></div>
                        <div className="flex-1">
                          <div className="text-xs text-gray-500">Q/R Code (SFL4)</div>
                          <input type="number" inputMode="decimal" value={paymentModes.qrCode}
                            onChange={(e) => updatePaymentMode('qrCode', e.target.value)}
                            placeholder="0" className="w-full p-1 border rounded text-right text-sm font-mono" />
                        </div>
                      </div>
                      {/* Discount */}
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-100 rounded"><Percent size={14} className="text-gray-600" /></div>
                        <div className="flex-1">
                          <div className="text-xs text-gray-500">Discount (SFL5)</div>
                          <input type="number" inputMode="decimal" value={paymentModes.discount}
                            onChange={(e) => updatePaymentMode('discount', e.target.value)}
                            placeholder="0" className="w-full p-1 border rounded text-right text-sm font-mono" />
                        </div>
                      </div>
                      {/* Bank Deposit */}
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-100 rounded"><Building2 size={14} className="text-gray-600" /></div>
                        <div className="flex-1">
                          <div className="text-xs text-gray-500">Bank Deposit (SFL6)</div>
                          <input type="number" inputMode="decimal" value={paymentModes.bankDeposit}
                            onChange={(e) => updatePaymentMode('bankDeposit', e.target.value)}
                            placeholder="0" className="w-full p-1 border rounded text-right text-sm font-mono" />
                        </div>
                      </div>
                      {/* Esewa */}
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-100 rounded"><Smartphone size={14} className="text-gray-600" /></div>
                        <div className="flex-1">
                          <div className="text-xs text-gray-500">Esewa (SFL7)</div>
                          <input type="number" inputMode="decimal" value={paymentModes.esewa}
                            onChange={(e) => updatePaymentMode('esewa', e.target.value)}
                            placeholder="0" className="w-full p-1 border rounded text-right text-sm font-mono" />
                        </div>
                      </div>
                    </div>

                    {/* Web Narration */}
                    <div className="mt-3">
                      <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                        <MessageSquare size={12} />
                        Web Narration (optional)
                      </div>
                      <input
                        type="text"
                        value={webNarration}
                        onChange={(e) => setWebNarration(e.target.value)}
                        placeholder="Add note for this payment..."
                        className="w-full p-1.5 border rounded text-sm"
                      />
                    </div>

                    {/* Summary */}
                    <div className="mt-3 p-2 bg-gray-100 rounded text-sm space-y-1">
                      <div className="flex justify-between">
                        <span>Total Payment:</span>
                        <span className={`font-medium ${totalPayment > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          Rs {totalPayment.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between border-t pt-1">
                        <span>Balance:</span>
                        <span className={`font-bold ${balanceAfter > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          Rs {balanceAfter.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    {/* Voucher Type Preview */}
                    {totalPayment > 0 && (
                      <div className={`mt-3 p-2 rounded text-xs flex items-center gap-1 ${
                        isFullPayment ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                      }`}>
                        <CheckCircle size={14} />
                        <span>Updates to: <strong>{newVoucherType}</strong></span>
                      </div>
                    )}

                    {/* Submit Button */}
                    <button
                      onClick={completePayment}
                      disabled={submitting || totalPayment <= 0 || !tallyStatus.connected}
                      className={`w-full mt-3 p-3 rounded-lg flex items-center justify-center gap-2 text-white font-medium ${
                        submitting || totalPayment <= 0 || !tallyStatus.connected
                          ? 'bg-gray-400 cursor-not-allowed'
                          : isFullPayment
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-orange-600 hover:bg-orange-700'
                      }`}
                    >
                      <Send size={16} />
                      {submitting ? 'Processing...' : `Complete (Rs ${totalPayment.toLocaleString()})`}
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  <FileText size={48} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Select a bill from the list to receive payment</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Activity Log Tab Content */}
        {activeTab === 'activity' && (
          <div className="bg-white rounded-lg shadow-sm">
            <div className="p-4 border-b bg-purple-50 flex items-center justify-between">
              <h2 className="font-bold text-purple-800 flex items-center gap-2">
                <History size={18} />
                Recently Altered on Tally Prime
              </h2>
              <button
                onClick={loadActivities}
                className="p-2 hover:bg-purple-100 rounded"
                disabled={activityLoading}
              >
                <RefreshCw size={16} className={activityLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            <div className="p-4">
              {activityLoading ? (
                <div className="p-8 text-center text-gray-500">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                  Loading activities...
                </div>
              ) : activities.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <History size={48} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No altered vouchers found today</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Summary Stats */}
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    <div className="p-3 bg-purple-50 rounded-lg text-center">
                      <div className="text-2xl font-bold text-purple-700">
                        {activities.filter(a => a.action_type === 'TALLY_ALTERATION').length}
                      </div>
                      <div className="text-xs text-purple-600">Tally Changes</div>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg text-center">
                      <div className="text-2xl font-bold text-green-700">
                        {activities.filter(a => a.action_type === 'FULL_PAYMENT').length}
                      </div>
                      <div className="text-xs text-green-600">Full Payments</div>
                    </div>
                    <div className="p-3 bg-orange-50 rounded-lg text-center">
                      <div className="text-2xl font-bold text-orange-700">
                        {activities.filter(a => a.action_type === 'PARTIAL_PAYMENT').length}
                      </div>
                      <div className="text-xs text-orange-600">Partial Payments</div>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-lg text-center">
                      <div className="text-2xl font-bold text-blue-700">
                        Rs {activities.reduce((sum, a) => sum + (a.amount || 0), 0).toLocaleString()}
                      </div>
                      <div className="text-xs text-blue-600">Total Collected</div>
                    </div>
                  </div>

                  {/* Activity List */}
                  <div className="divide-y max-h-[60vh] overflow-y-auto">
                    {activities.map((act) => (
                      <div key={act.id} className={`p-3 hover:bg-gray-50 ${
                        act.status === 'success' ? '' : 'bg-red-50'
                      }`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                act.action_type === 'TALLY_ALTERATION' ? 'bg-purple-200 text-purple-800' :
                                act.action_type === 'FULL_PAYMENT' ? 'bg-green-200 text-green-800' :
                                act.action_type === 'PARTIAL_PAYMENT' ? 'bg-orange-200 text-orange-800' :
                                act.action_type === 'FULL_CREDIT' ? 'bg-blue-200 text-blue-800' :
                                'bg-gray-200 text-gray-800'
                              }`}>
                                {act.action_type === 'TALLY_ALTERATION' ? 'Tally Change' : act.action_type?.replace('_', ' ')}
                              </span>
                              {act.status !== 'success' && (
                                <span className="px-2 py-0.5 bg-red-200 text-red-800 rounded text-xs">
                                  {act.status}
                                </span>
                              )}
                            </div>
                            <div className="font-medium text-gray-800">{act.party_name}</div>
                            <div className="text-sm text-gray-500 flex items-center gap-2">
                              <span className="font-mono">{act.voucher_number}</span>
                              {act.master_id && (
                                <>
                                  <span>•</span>
                                  <span className="text-xs">ID: {act.master_id}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            {act.amount > 0 && (
                              <div className="font-bold text-green-600">
                                Rs {act.amount?.toLocaleString()}
                              </div>
                            )}
                            <div className="text-xs text-gray-400">
                              {new Date(act.created_at).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                        {act.error_message && (
                          <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                            {act.error_message}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chart of Accounts Tab Content */}
        {activeTab === 'coa' && (
          <div className="bg-white rounded-lg shadow-sm">
            {/* Header */}
            <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
              <span className="font-medium text-gray-700 flex items-center gap-2">
                <FolderTree size={18} />
                Chart of Accounts
              </span>
              <button
                onClick={() => loadChartOfAccounts(true)}
                disabled={coaLoading}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw size={14} className={coaLoading ? 'animate-spin' : ''} />
                Sync from Tally
              </button>
            </div>

            {/* Content */}
            {coaLoading ? (
              <div className="p-8 text-center text-gray-500">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                Loading Chart of Accounts...
              </div>
            ) : filteredCoaGroups.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <FolderTree size={48} className="mx-auto mb-3 opacity-50" />
                <p className="mb-3">No data found. Click Sync to load from Tally.</p>
              </div>
            ) : (
              <div className="divide-y max-h-[70vh] overflow-y-auto">
                {filteredCoaGroups.map((group) => (
                  <div key={group.name}>
                    {/* Group Header */}
                    <div
                      onClick={() => toggleGroup(group.name)}
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2">
                        {expandedGroups[group.name] ? (
                          <FolderOpen size={18} className="text-yellow-600" />
                        ) : (
                          <Folder size={18} className="text-yellow-600" />
                        )}
                        <span className="font-medium">{group.name}</span>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {group.ledgers?.length || 0} ledgers
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-mono ${group.closingBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          Rs {Math.abs(group.closingBalance || 0).toLocaleString()}
                        </span>
                        {expandedGroups[group.name] ? (
                          <ChevronDown size={18} className="text-gray-400" />
                        ) : (
                          <ChevronRight size={18} className="text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Ledgers */}
                    {expandedGroups[group.name] && group.ledgers && (
                      <div className="bg-gray-50 border-t">
                        {group.ledgers.map((ledger) => (
                          <div
                            key={ledger.name}
                            className="flex items-center justify-between px-4 py-2 pl-10 border-b border-gray-100 hover:bg-gray-100"
                          >
                            <div className="flex items-center gap-2">
                              <User size={14} className="text-gray-400" />
                              <span className="text-sm">{ledger.name}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className={`text-sm font-mono ${ledger.closingBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                Rs {Math.abs(ledger.closingBalance || 0).toLocaleString()}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  loadLedgerTransactions(ledger.name);
                                }}
                                className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                                title="View Transactions"
                              >
                                <BookOpen size={16} />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* All Ledgers Tab Content */}
        {activeTab === 'ledgers' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Ledgers List */}
            <div className="lg:col-span-1 bg-white rounded-lg shadow-sm overflow-hidden">
              <div className="p-3 border-b bg-indigo-50 flex items-center justify-between">
                <span className="font-medium text-indigo-700 flex items-center gap-2">
                  <BookOpen size={18} />
                  All Ledgers ({filteredAllLedgers.length})
                </span>
                <button
                  onClick={() => loadChartOfAccounts(true)}
                  disabled={coaLoading}
                  className="flex items-center gap-1 px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 disabled:opacity-50"
                >
                  <RefreshCw size={12} className={coaLoading ? 'animate-spin' : ''} />
                  Sync
                </button>
              </div>

              {coaLoading ? (
                <div className="p-8 text-center text-gray-500">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                  Loading ledgers...
                </div>
              ) : filteredAllLedgers.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <BookOpen size={48} className="mx-auto mb-3 opacity-50" />
                  <p>No ledgers found</p>
                </div>
              ) : (
                <div className="divide-y max-h-[70vh] overflow-y-auto">
                  {filteredAllLedgers.map((ledger, idx) => (
                    <div
                      key={idx}
                      onClick={() => loadLedgerTransactions(ledger.name)}
                      className={`p-3 cursor-pointer transition-colors ${
                        selectedLedger === ledger.name
                          ? 'bg-indigo-50 border-l-4 border-indigo-500'
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium text-gray-800 truncate">
                        {ledger.name}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                        <span className="truncate">{ledger.parent || 'No Group'}</span>
                        {ledger.closingBalance !== undefined && (
                          <span className={`ml-auto font-mono ${
                            ledger.closingBalance >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}>
                            {ledger.closingBalance >= 0 ? 'Dr' : 'Cr'} {Math.abs(ledger.closingBalance || 0).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Ledger Transactions Panel */}
            <div className="lg:col-span-2 bg-white rounded-lg shadow-sm">
              {selectedLedger ? (
                <>
                  <div className="p-3 border-b bg-indigo-50 flex items-center justify-between">
                    <div>
                      <h3 className="font-bold text-indigo-800">{selectedLedger}</h3>
                      <p className="text-xs text-indigo-600">Transaction History</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => loadLedgerTransactions(selectedLedger, true)}
                        disabled={ledgerTransLoading}
                        className="flex items-center gap-1 px-2 py-1 bg-indigo-600 text-white rounded text-xs hover:bg-indigo-700 disabled:opacity-50"
                      >
                        <RefreshCw size={12} className={ledgerTransLoading ? 'animate-spin' : ''} />
                        Refresh from Tally
                      </button>
                      <button
                        onClick={() => setSelectedLedger(null)}
                        className="p-1 hover:bg-indigo-100 rounded"
                      >
                        <X size={16} className="text-indigo-600" />
                      </button>
                    </div>
                  </div>

                  {/* Totals Summary */}
                  <div className="p-3 bg-gray-50 border-b grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-xs text-gray-500">Total Debit</div>
                      <div className="font-bold text-green-600">Rs {ledgerTransTotals.debit?.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Total Credit</div>
                      <div className="font-bold text-red-600">Rs {ledgerTransTotals.credit?.toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-500">Net Balance</div>
                      <div className={`font-bold ${ledgerTransTotals.netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        Rs {Math.abs(ledgerTransTotals.netBalance || 0).toLocaleString()}
                        <span className="text-xs ml-1">({ledgerTransTotals.netBalance >= 0 ? 'Dr' : 'Cr'})</span>
                      </div>
                    </div>
                  </div>

                  {/* Transactions Table */}
                  {ledgerTransLoading ? (
                    <div className="p-8 text-center text-gray-500">
                      <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                      Loading transactions...
                    </div>
                  ) : ledgerTransactions.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      No transactions found
                    </div>
                  ) : (
                    <div className="overflow-x-auto max-h-[50vh] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr>
                            <th className="px-3 py-2 text-left">Date</th>
                            <th className="px-3 py-2 text-left">Voucher</th>
                            <th className="px-3 py-2 text-left">Party/Narration</th>
                            <th className="px-3 py-2 text-right">Debit</th>
                            <th className="px-3 py-2 text-right">Credit</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {ledgerTransactions.map((txn, idx) => (
                            <React.Fragment key={idx}>
                              <tr className="hover:bg-gray-50">
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <div>{txn.date}</div>
                                  <div className="text-xs text-purple-600">{adStringToBS(txn.date, 'nepali-short')}</div>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="font-mono text-xs">{txn.voucherNumber}</div>
                                  <div className="text-xs text-gray-500">{txn.voucherType}</div>
                                </td>
                                <td className="px-3 py-2">
                                  <div className="font-medium truncate max-w-[200px]">{txn.partyLedgerName}</div>
                                  {txn.narration && (
                                    <div className="text-xs text-gray-400 truncate max-w-[200px]">{txn.narration}</div>
                                  )}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-green-600">
                                  {txn.debit > 0 ? txn.debit.toLocaleString() : '-'}
                                </td>
                                <td className="px-3 py-2 text-right font-mono text-red-600">
                                  {txn.credit > 0 ? txn.credit.toLocaleString() : '-'}
                                </td>
                              </tr>
                              {/* Inventory Items if present */}
                              {txn.inventoryItems && txn.inventoryItems.length > 0 && (
                                <tr className="bg-blue-50">
                                  <td colSpan={5} className="px-3 py-2">
                                    <div className="text-xs text-blue-700 font-medium mb-1">Stock Items:</div>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                      {txn.inventoryItems.map((item, iIdx) => (
                                        <div key={iIdx} className="text-xs bg-white p-1.5 rounded border">
                                          <div className="font-medium truncate">{item.stockItemName}</div>
                                          <div className="text-gray-500">
                                            Qty: {item.billedQty || item.actualQty} @ Rs {item.rate?.toLocaleString()}
                                          </div>
                                          <div className="text-blue-600 font-medium">Rs {Math.abs(item.amount || 0).toLocaleString()}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-8 text-center text-gray-500">
                  <BookOpen size={48} className="mx-auto mb-3 opacity-50" />
                  <p>Select a ledger to view transactions</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Recent Vouchers Tab Content */}
        {activeTab === 'recent' && (
          <div className="bg-white rounded-lg shadow-sm">
            {/* Header */}
            <div className="p-3 border-b bg-orange-50 flex items-center justify-between">
              <div>
                <span className="font-medium text-orange-700 flex items-center gap-2">
                  <Clock size={18} />
                  Recently Altered Vouchers
                </span>
                <div className="text-xs text-orange-600 mt-1">
                  Total: {recentVouchersState.totalCount} | Last AlterID: {recentVouchersState.lastAlterId}
                  {recentVouchersState.lastSyncTime && (
                    <span> | Synced: {new Date(recentVouchersState.lastSyncTime).toLocaleString()}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={syncVouchersIncremental}
                  disabled={partialSyncLoading.vouchers || !tallyStatus.connected}
                  className="flex items-center gap-1 px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm hover:bg-orange-700 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={partialSyncLoading.vouchers ? 'animate-spin' : ''} />
                  Sync New Vouchers
                </button>
                <button
                  onClick={loadRecentVouchers}
                  disabled={recentVouchersLoading}
                  className="flex items-center gap-1 px-2 py-1.5 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={recentVouchersLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Vouchers Table */}
            {recentVouchersLoading ? (
              <div className="p-8 text-center text-gray-500">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                Loading vouchers...
              </div>
            ) : filteredRecentVouchers.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Clock size={48} className="mx-auto mb-3 opacity-50" />
                <p>No vouchers found. Click "Sync New Vouchers" to fetch from Tally.</p>
              </div>
            ) : (
              <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">AlterID</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-left">Voucher No</th>
                      <th className="px-3 py-2 text-left">Party</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-left">Narration</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredRecentVouchers.map((v, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-xs text-orange-600 font-bold">
                          {v.alter_id}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <div>{v.voucher_date}</div>
                          <div className="text-xs text-purple-600">{adStringToBS(v.voucher_date, 'nepali-short')}</div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded text-xs ${
                            v.voucher_type === 'Sales' ? 'bg-green-100 text-green-700' :
                            v.voucher_type === 'Receipt' ? 'bg-blue-100 text-blue-700' :
                            v.voucher_type === 'Payment' ? 'bg-red-100 text-red-700' :
                            v.voucher_type === 'Purchase' ? 'bg-purple-100 text-purple-700' :
                            v.voucher_type === 'Journal' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {v.voucher_type}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{v.voucher_number}</td>
                        <td className="px-3 py-2">
                          <div className="font-medium truncate max-w-[200px]">{v.party_name}</div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          <span className={v.amount >= 0 ? 'text-green-600' : 'text-red-600'}>
                            Rs {Math.abs(v.amount || 0).toLocaleString()}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <div className="text-xs text-gray-500 truncate max-w-[200px]">{v.narration || '-'}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Sync Data Tab Content */}
        {activeTab === 'sync' && (
          <div className="bg-white rounded-lg shadow-sm">
            {/* Header */}
            <div className="p-4 border-b bg-green-50">
              <h2 className="font-bold text-green-800 flex items-center gap-2">
                <Database size={20} />
                Partial Sync Controls
              </h2>
              <p className="text-sm text-green-600 mt-1">
                Sync specific data from Tally Prime without affecting other data
              </p>
            </div>

            <div className="p-4 space-y-6">
              {/* Sync Status Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg text-center">
                  <Package size={24} className="mx-auto text-blue-600 mb-2" />
                  <div className="text-2xl font-bold text-blue-700">{syncState.stockItemsCount || 0}</div>
                  <div className="text-xs text-blue-600">Stock Items</div>
                  <div className="text-xs text-gray-500 mt-1">AlterID: {syncState.lastStockAlterId || 0}</div>
                </div>
                <div className="p-4 bg-purple-50 rounded-lg text-center">
                  <Users size={24} className="mx-auto text-purple-600 mb-2" />
                  <div className="text-2xl font-bold text-purple-700">{syncState.partiesCount || 0}</div>
                  <div className="text-xs text-purple-600">Parties</div>
                  <div className="text-xs text-gray-500 mt-1">AlterID: {syncState.lastPartyAlterId || 0}</div>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg text-center">
                  <FileText size={24} className="mx-auto text-orange-600 mb-2" />
                  <div className="text-2xl font-bold text-orange-700">{pendingBills.length}</div>
                  <div className="text-xs text-orange-600">Pending Bills</div>
                  <div className="text-xs text-gray-500 mt-1">Cached locally</div>
                </div>
                <div className="p-4 bg-green-50 rounded-lg text-center">
                  <Wifi size={24} className={`mx-auto mb-2 ${tallyStatus.connected ? 'text-green-600' : 'text-red-500'}`} />
                  <div className={`text-2xl font-bold ${tallyStatus.connected ? 'text-green-700' : 'text-red-600'}`}>
                    {tallyStatus.connected ? 'Online' : 'Offline'}
                  </div>
                  <div className="text-xs text-green-600">Tally Status</div>
                </div>
              </div>

              {/* Partial Sync Actions */}
              <div className="space-y-4">
                <h3 className="font-medium text-gray-700 flex items-center gap-2">
                  <Download size={16} />
                  Incremental Sync (Fast)
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <button
                    onClick={syncStock}
                    disabled={partialSyncLoading.stock || !tallyStatus.connected}
                    className="p-3 bg-blue-100 hover:bg-blue-200 rounded-lg text-blue-700 flex flex-col items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {partialSyncLoading.stock ? (
                      <RefreshCw size={20} className="animate-spin" />
                    ) : (
                      <Package size={20} />
                    )}
                    <span className="text-sm font-medium">Sync Stock Items</span>
                  </button>
                  <button
                    onClick={syncParties}
                    disabled={partialSyncLoading.parties || !tallyStatus.connected}
                    className="p-3 bg-purple-100 hover:bg-purple-200 rounded-lg text-purple-700 flex flex-col items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {partialSyncLoading.parties ? (
                      <RefreshCw size={20} className="animate-spin" />
                    ) : (
                      <Users size={20} />
                    )}
                    <span className="text-sm font-medium">Sync Parties</span>
                  </button>
                  <button
                    onClick={syncMasters}
                    disabled={partialSyncLoading.masters || !tallyStatus.connected}
                    className="p-3 bg-green-100 hover:bg-green-200 rounded-lg text-green-700 flex flex-col items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {partialSyncLoading.masters ? (
                      <RefreshCw size={20} className="animate-spin" />
                    ) : (
                      <Database size={20} />
                    )}
                    <span className="text-sm font-medium">Sync All Masters</span>
                  </button>
                  <button
                    onClick={syncPSB}
                    disabled={partialSyncLoading.psb || !tallyStatus.connected}
                    className="p-3 bg-orange-100 hover:bg-orange-200 rounded-lg text-orange-700 flex flex-col items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {partialSyncLoading.psb ? (
                      <RefreshCw size={20} className="animate-spin" />
                    ) : (
                      <FileText size={20} />
                    )}
                    <span className="text-sm font-medium">Sync Pending Bills</span>
                  </button>
                  <button
                    onClick={syncUDF}
                    disabled={partialSyncLoading.udf || !tallyStatus.connected}
                    className="p-3 bg-teal-100 hover:bg-teal-200 rounded-lg text-teal-700 flex flex-col items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {partialSyncLoading.udf ? (
                      <RefreshCw size={20} className="animate-spin" />
                    ) : (
                      <CheckCircle size={20} />
                    )}
                    <span className="text-sm font-medium">Sync UDF Payments</span>
                  </button>
                </div>
              </div>

              {/* Full Reset Sync */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium text-gray-700 flex items-center gap-2">
                  <RotateCcw size={16} />
                  Full Sync (Reset & Reload)
                </h3>
                <p className="text-xs text-gray-500">
                  Use these if data is out of sync. Will clear existing data and reload everything from Tally.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <button
                    onClick={resetAndSyncStock}
                    disabled={partialSyncLoading.resetStock || !tallyStatus.connected}
                    className="p-3 bg-red-50 hover:bg-red-100 rounded-lg text-red-700 flex flex-col items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border border-red-200"
                  >
                    {partialSyncLoading.resetStock ? (
                      <RefreshCw size={20} className="animate-spin" />
                    ) : (
                      <RotateCcw size={20} />
                    )}
                    <span className="text-sm font-medium">Reset Stock Items</span>
                  </button>
                  <button
                    onClick={resetAndSyncParties}
                    disabled={partialSyncLoading.resetParties || !tallyStatus.connected}
                    className="p-3 bg-red-50 hover:bg-red-100 rounded-lg text-red-700 flex flex-col items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed border border-red-200"
                  >
                    {partialSyncLoading.resetParties ? (
                      <RefreshCw size={20} className="animate-spin" />
                    ) : (
                      <RotateCcw size={20} />
                    )}
                    <span className="text-sm font-medium">Reset Parties</span>
                  </button>
                </div>
              </div>

              {/* Sync Service Control */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-medium text-gray-700 flex items-center gap-2">
                  {syncServiceRunning ? <Play size={16} /> : <Square size={16} />}
                  Auto Sync Service
                </h3>
                <div className="flex items-center gap-4">
                  <div className={`px-4 py-2 rounded-lg ${syncServiceRunning ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    Status: {syncServiceRunning ? 'Running' : 'Stopped'}
                  </div>
                  <button
                    onClick={syncServiceRunning ? stopSyncService : startSyncService}
                    disabled={syncServiceLoading}
                    className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                      syncServiceLoading
                        ? 'bg-gray-200 text-gray-500'
                        : syncServiceRunning
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {syncServiceLoading ? (
                      <RefreshCw size={16} className="animate-spin" />
                    ) : syncServiceRunning ? (
                      <Square size={16} />
                    ) : (
                      <Play size={16} />
                    )}
                    {syncServiceRunning ? 'Stop Service' : 'Start Service'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Activity Log Panel (Side Panel) */}
      {activityOpen && (
        <div className="fixed inset-y-0 right-0 w-80 bg-white shadow-lg z-20 overflow-y-auto">
          <div className="p-4 border-b bg-blue-50 flex items-center justify-between sticky top-0">
            <h2 className="font-bold text-blue-800 flex items-center gap-2">
              <History size={18} />
              Today's Activity
            </h2>
            <button onClick={() => setActivityOpen(false)} className="p-1 hover:bg-blue-100 rounded">
              <X size={18} className="text-blue-600" />
            </button>
          </div>
          <div className="p-2">
            {activityLoading ? (
              <div className="p-4 text-center text-gray-500">
                <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                Loading...
              </div>
            ) : activities.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                No activity today
              </div>
            ) : (
              <div className="space-y-2">
                {activities.map((act) => (
                  <div key={act.id} className={`p-2 rounded text-sm ${
                    act.status === 'success' ? 'bg-green-50' : 'bg-red-50'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className={`px-1.5 py-0.5 rounded text-xs ${
                        act.action_type === 'FULL_PAYMENT' ? 'bg-green-200 text-green-800' :
                        act.action_type === 'PARTIAL_PAYMENT' ? 'bg-orange-200 text-orange-800' :
                        act.action_type === 'FULL_CREDIT' ? 'bg-blue-200 text-blue-800' :
                        'bg-gray-200 text-gray-800'
                      }`}>
                        {act.action_type?.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(act.created_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="mt-1 font-medium text-gray-800 truncate">{act.party_name}</div>
                    <div className="text-xs text-gray-500">{act.voucher_number}</div>
                    {act.amount > 0 && (
                      <div className="text-xs font-medium text-green-700">Rs {act.amount?.toLocaleString()}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Print Modal */}
      {printModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-white">
              <h2 className="font-bold text-gray-800">Print Bill</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrint}
                  disabled={printLoading || !printBill}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 flex items-center gap-2 disabled:bg-gray-400"
                >
                  <Printer size={16} />
                  Print
                </button>
                <button onClick={() => setPrintModalOpen(false)} className="p-2 hover:bg-gray-100 rounded">
                  <X size={18} />
                </button>
              </div>
            </div>

            {printLoading ? (
              <div className="p-8 text-center text-gray-500">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                Loading bill details...
              </div>
            ) : printBill ? (
              <div id="print-content" className="p-6">
                <div className="header text-center mb-6">
                  <h1 className="text-xl font-bold">SALES BILL</h1>
                  <p className="text-gray-600">Bill No: {printBill.voucherNumber}</p>
                </div>

                <div className="party-info grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="text-sm text-gray-500">Party Name</div>
                    <div className="font-medium">{printBill.partyName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-500">Date</div>
                    <div className="font-medium">{printBill.date}</div>
                  </div>
                </div>

                {printBill.inventoryItems && printBill.inventoryItems.length > 0 ? (
                  <table className="w-full border-collapse border mb-4">
                    <thead>
                      <tr className="bg-gray-100">
                        <th className="border p-2 text-left">S.N.</th>
                        <th className="border p-2 text-left">Item</th>
                        <th className="border p-2 text-right">Qty</th>
                        <th className="border p-2 text-right">Rate</th>
                        <th className="border p-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printBill.inventoryItems.map((item, idx) => (
                        <tr key={idx}>
                          <td className="border p-2">{idx + 1}</td>
                          <td className="border p-2">{item.stockItemName}</td>
                          <td className="border p-2 text-right">{item.quantity}</td>
                          <td className="border p-2 text-right">{item.rate?.toLocaleString()}</td>
                          <td className="border p-2 text-right">{item.amount?.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-4 text-center text-gray-500 border rounded mb-4">
                    No inventory details available
                  </div>
                )}

                <div className="totals border-t pt-4">
                  <div className="flex justify-end">
                    <div className="w-48">
                      <div className="flex justify-between py-1">
                        <span>Sub Total:</span>
                        <span>Rs {printBill.amount?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between py-2 border-t font-bold text-lg">
                        <span>Total:</span>
                        <span>Rs {printBill.amount?.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {printBill.narration && (
                  <div className="mt-4 p-2 bg-gray-50 rounded text-sm">
                    <span className="text-gray-500">Narration:</span> {printBill.narration}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-8 text-center text-gray-500">
                No bill data available
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ledger Account Book Modal */}
      {selectedLedger && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gray-50">
              <div>
                <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                  <BookOpen size={20} />
                  {selectedLedger}
                </h2>
                <p className="text-sm text-gray-500">Ledger Account Book</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => loadLedgerTransactions(selectedLedger, true)}
                  disabled={ledgerTransLoading}
                  className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={ledgerTransLoading ? 'animate-spin' : ''} />
                  Sync
                </button>
                <button
                  onClick={() => setSelectedLedger(null)}
                  className="p-2 hover:bg-gray-200 rounded-lg"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Totals Summary */}
            <div className="grid grid-cols-3 gap-4 p-4 bg-gray-50 border-b">
              <div className="text-center">
                <p className="text-xs text-gray-500">Total Debit</p>
                <p className="text-lg font-bold text-blue-600">Rs {ledgerTransTotals.debit?.toLocaleString() || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Total Credit</p>
                <p className="text-lg font-bold text-green-600">Rs {ledgerTransTotals.credit?.toLocaleString() || 0}</p>
              </div>
              <div className="text-center">
                <p className="text-xs text-gray-500">Net Balance</p>
                <p className={`text-lg font-bold ${ledgerTransTotals.netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Rs {Math.abs(ledgerTransTotals.netBalance || 0).toLocaleString()}
                  {ledgerTransTotals.netBalance < 0 ? ' Cr' : ' Dr'}
                </p>
              </div>
            </div>

            {/* Transactions Table */}
            <div className="overflow-auto max-h-[50vh]">
              {ledgerTransLoading ? (
                <div className="p-8 text-center text-gray-500">
                  <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                  Loading transactions...
                </div>
              ) : ledgerTransactions.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <FileText size={48} className="mx-auto mb-3 opacity-50" />
                  <p>No transactions found</p>
                  <button
                    onClick={() => loadLedgerTransactions(selectedLedger, true)}
                    className="mt-3 text-blue-600 hover:underline text-sm"
                  >
                    Sync from Tally
                  </button>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 sticky top-0">
                    <tr>
                      <th className="text-left p-3">Date</th>
                      <th className="text-left p-3">Particulars</th>
                      <th className="text-left p-3">Type</th>
                      <th className="text-right p-3">Debit</th>
                      <th className="text-right p-3">Credit</th>
                      <th className="text-right p-3">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ledgerTransactions.map((txn, idx) => (
                      <React.Fragment key={idx}>
                        <tr className="hover:bg-gray-50">
                          <td className="p-3 whitespace-nowrap">
                            {txn.date ? `${txn.date.slice(6, 8)}/${txn.date.slice(4, 6)}/${txn.date.slice(0, 4)}` : '-'}
                          </td>
                          <td className="p-3">
                            <div className="font-medium">{txn.otherLedgersDisplay || txn.partyName || '-'}</div>
                            {txn.voucherNumber && (
                              <div className="text-xs text-gray-500">{txn.voucherNumber}</div>
                            )}
                            {txn.hasInventory && (
                              <div className="text-xs text-purple-600 mt-0.5">
                                {txn.inventoryItems?.length} item(s)
                              </div>
                            )}
                          </td>
                          <td className="p-3">
                            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">{txn.voucherType}</span>
                          </td>
                          <td className="p-3 text-right font-mono text-blue-600">
                            {txn.debit > 0 ? txn.debit.toLocaleString() : '-'}
                          </td>
                          <td className="p-3 text-right font-mono text-green-600">
                            {txn.credit > 0 ? txn.credit.toLocaleString() : '-'}
                          </td>
                          <td className="p-3 text-right font-mono">
                            {txn.runningBalance !== undefined ? (
                              <span className={txn.runningBalance >= 0 ? 'text-blue-600' : 'text-red-600'}>
                                {Math.abs(txn.runningBalance).toLocaleString()}
                              </span>
                            ) : '-'}
                          </td>
                        </tr>
                        {/* Inventory Items Row */}
                        {txn.hasInventory && txn.inventoryItems?.length > 0 && (
                          <tr className="bg-purple-50">
                            <td colSpan={6} className="px-3 py-2">
                              <div className="text-xs">
                                <div className="font-medium text-purple-700 mb-1">Stock Items:</div>
                                <div className="grid grid-cols-4 gap-2 text-gray-600">
                                  {txn.inventoryItems.map((item, i) => (
                                    <div key={i} className="bg-white p-1.5 rounded border border-purple-100">
                                      <div className="font-medium text-gray-800 truncate">{item.stockItemName}</div>
                                      <div className="flex justify-between text-xs mt-0.5">
                                        <span>Qty: {item.quantity}</span>
                                        <span>@ Rs {item.rate?.toLocaleString()}</span>
                                      </div>
                                      <div className="text-right text-purple-700 font-medium">
                                        Rs {item.amount?.toLocaleString()}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Create Bill Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-bold text-gray-800">Create Pending Sales Bill</h2>
              <button
                onClick={() => setCreateModalOpen(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              {/* Today's Date */}
              <div className="text-center text-sm text-gray-600">
                आज: {getTodayBSFormatted('nepali')}
              </div>

              {/* Party Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <User size={14} className="inline mr-1" />
                  Party Name *
                </label>
                <input
                  type="text"
                  value={newBill.partyName}
                  onChange={(e) => {
                    setNewBill({ ...newBill, partyName: e.target.value });
                    setPartySearch(e.target.value);
                  }}
                  placeholder="Enter or search party name"
                  className="w-full p-2 border rounded-lg"
                />
                {/* Party suggestions */}
                {partySearch && filteredParties.length > 0 && (
                  <div className="mt-1 border rounded-lg max-h-32 overflow-y-auto bg-white shadow-lg">
                    {filteredParties.map((party, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          setNewBill({ ...newBill, partyName: party.name });
                          setPartySearch('');
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-100 text-sm"
                      >
                        {party.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Banknote size={14} className="inline mr-1" />
                  Amount *
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={newBill.amount}
                  onChange={(e) => setNewBill({ ...newBill, amount: e.target.value })}
                  placeholder="Enter amount"
                  className="w-full p-2 border rounded-lg font-mono"
                />
              </div>

              {/* Narration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <FileText size={14} className="inline mr-1" />
                  Narration (Optional)
                </label>
                <textarea
                  value={newBill.narration}
                  onChange={(e) => setNewBill({ ...newBill, narration: e.target.value })}
                  placeholder="Enter narration"
                  rows={2}
                  className="w-full p-2 border rounded-lg"
                />
              </div>

              {/* Tally Status Note */}
              {!tallyStatus.connected && (
                <div className="p-3 bg-orange-50 rounded-lg text-sm text-orange-700">
                  <AlertCircle size={14} className="inline mr-1" />
                  Tally is offline. Bill will be saved locally and synced when Tally is online.
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-3 p-4 border-t">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={createPendingSalesBill}
                disabled={creatingBill || !newBill.partyName || !newBill.amount}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  creatingBill || !newBill.partyName || !newBill.amount
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 text-white hover:bg-green-700'
                }`}
              >
                {creatingBill ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Create Bill
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
