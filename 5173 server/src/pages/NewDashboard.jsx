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
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  EyeOff
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
  const [activeTab, setActiveTab] = useState('bills'); // 'bills' or 'activity'

  // Tally connection status
  const [tallyStatus, setTallyStatus] = useState({ connected: false, checking: true });

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

  // Offline invoice creation modal
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newInvoice, setNewInvoice] = useState({
    partyName: '',
    amount: '',
    narration: ''
  });
  const [creatingInvoice, setCreatingInvoice] = useState(false);

  // Web narration for payment
  const [webNarration, setWebNarration] = useState('');

  // Refs for performance
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Load cached data immediately on mount + setup fast sync
  useEffect(() => {
    loadCachedBills();
    checkTallyStatus();

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
  }, [selectedBill, totalPayment, paymentModes, clearSelection, loadPendingBills]);

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

  // CREATE OFFLINE INVOICE - Creates a pending sales bill locally when Tally is offline
  const createOfflineInvoice = useCallback(async () => {
    if (!newInvoice.partyName || !newInvoice.amount) {
      setMessage({ type: 'error', text: 'Party name and amount are required' });
      return;
    }

    setCreatingInvoice(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/api/pending-sales-bills/offline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyName: newInvoice.partyName,
          amount: parseFloat(newInvoice.amount),
          narration: newInvoice.narration || `Web Invoice - ${getTodayBSFormatted('nepali')}`
        })
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setMessage({
          type: 'success',
          text: `Offline invoice created: ${data.voucherNumber}`
        });
        setCreateModalOpen(false);
        setNewInvoice({ partyName: '', amount: '', narration: '' });
        loadPendingBills(false);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create invoice' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setCreatingInvoice(false);
    }
  }, [newInvoice, loadPendingBills]);

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
            <h1 className="text-xl font-bold text-gray-800">Pending Bills</h1>
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

              {/* Toggle Bills View */}
              <button
                onClick={() => setShowBills(prev => !prev)}
                className={`p-2 rounded-lg ${showBills ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-600'}`}
                title={showBills ? 'Hide Bills' : 'Show Bills'}
              >
                {showBills ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>

              {/* Create Offline Invoice */}
              <button
                onClick={() => setCreateModalOpen(true)}
                className="p-2 hover:bg-gray-100 rounded-lg text-green-600"
                title="Create Offline Invoice"
              >
                <Plus size={18} />
              </button>

              {/* Activity Log */}
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

          {/* Search */}
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
        {/* Tabs */}
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setActiveTab('bills')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'bills'
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            Pending Bills ({filteredBills.length})
          </button>
          <button
            onClick={() => { setActiveTab('activity'); loadActivities(); }}
            className={`px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'activity'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-gray-600 hover:bg-gray-100'
            }`}
          >
            <History size={16} />
            Tally Alterations
          </button>
        </div>

        {activeTab === 'bills' ? (
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
                  Bills List
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
        ) : (
          /* Activity Log Tab Content */
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
      </div>

      {/* Activity Log Panel */}
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

      {/* Create Offline Invoice Modal */}
      {createModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-4 border-b flex items-center justify-between bg-green-50">
              <h2 className="font-bold text-green-800 flex items-center gap-2">
                <Plus size={18} />
                Create Offline Invoice
              </h2>
              <button onClick={() => setCreateModalOpen(false)} className="p-1 hover:bg-green-100 rounded">
                <X size={18} className="text-green-600" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Today's Date */}
              <div className="text-center text-sm text-gray-600">
                आज: {getTodayBSFormatted('nepali')}
              </div>

              {/* Party Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Party Name *
                </label>
                <input
                  type="text"
                  value={newInvoice.partyName}
                  onChange={(e) => setNewInvoice(prev => ({ ...prev, partyName: e.target.value }))}
                  placeholder="Enter party/customer name"
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  autoFocus
                />
              </div>

              {/* Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Amount (Rs) *
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  value={newInvoice.amount}
                  onChange={(e) => setNewInvoice(prev => ({ ...prev, amount: e.target.value }))}
                  placeholder="0"
                  className="w-full p-2 border rounded text-right font-mono focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              {/* Narration */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Narration
                </label>
                <textarea
                  value={newInvoice.narration}
                  onChange={(e) => setNewInvoice(prev => ({ ...prev, narration: e.target.value }))}
                  placeholder="Web Invoice - बैशाख २०८१..."
                  rows={2}
                  className="w-full p-2 border rounded focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>

              {/* Info */}
              <div className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded">
                ⚠️ This creates a local pending sales bill. When Tally comes online, sync manually to create in Tally.
              </div>
            </div>

            <div className="p-4 border-t bg-gray-50 flex gap-2">
              <button
                onClick={() => setCreateModalOpen(false)}
                className="flex-1 py-2 px-4 border border-gray-300 rounded text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                onClick={createOfflineInvoice}
                disabled={creatingInvoice || !newInvoice.partyName || !newInvoice.amount}
                className="flex-1 py-2 px-4 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {creatingInvoice ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Plus size={16} />
                    Create Invoice
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
