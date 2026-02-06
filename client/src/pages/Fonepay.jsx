import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  RefreshCw,
  Wallet,
  CheckCircle,
  XCircle,
  Clock,
  TrendingUp,
  Phone,
  Building,
  CreditCard,
  Calendar,
  IndianRupee,
  Eye,
  EyeOff
} from 'lucide-react';

import socket from '../utils/socket';
import {
  getFonepayTransactions,
  getFonepaySummary,
  getFonepayStatus,
  triggerFonepaySync
} from '../utils/api';

function Fonepay() {
  const { t } = useTranslation();
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({
    totalAmount: 0,
    successCount: 0,
    failedCount: 0,
    totalCount: 0
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ status: 'idle', lastSync: null });
  const [initiatorSearch, setInitiatorSearch] = useState('');
  const [amountSearch, setAmountSearch] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [issuerFilter, setIssuerFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [showAmount, setShowAmount] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [allIssuers, setAllIssuers] = useState([]);
  const itemsPerPage = 25;

  // Auto-hide amount after 10 seconds
  useEffect(() => {
    if (showAmount) {
      const timer = setTimeout(() => {
        setShowAmount(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [showAmount]);

  // Fetch transactions with filters (server-side filtering)
  const fetchTransactions = useCallback(async (filters = {}) => {
    try {
      const params = {
        limit: 1000,
        ...filters
      };

      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (params[key] === '' || params[key] === 'all') {
          delete params[key];
        }
      });

      const txnRes = await getFonepayTransactions(params);
      setTransactions(txnRes.data.transactions || txnRes.data || []);
      setTotalCount(txnRes.data.total || txnRes.data.count || 0);
    } catch (error) {
      console.error('Failed to fetch transactions:', error);
    }
  }, []);

  // Fetch summary and status (doesn't need filters)
  const fetchSummaryAndStatus = useCallback(async () => {
    try {
      const [summaryRes, statusRes] = await Promise.all([
        getFonepaySummary(),
        getFonepayStatus()
      ]);

      if (summaryRes.data) {
        setSummary({
          totalAmount: summaryRes.data.totalAmount || 0,
          successCount: summaryRes.data.successCount || 0,
          failedCount: summaryRes.data.failedCount || 0,
          totalCount: summaryRes.data.totalCount || 0
        });
      }

      if (statusRes.data) {
        setSyncStatus({
          status: statusRes.data.status || 'idle',
          lastSync: statusRes.data.lastSyncTime || null
        });
      }
    } catch (error) {
      console.error('Failed to fetch summary:', error);
    }
  }, []);

  // Fetch all issuers for dropdown (initial load only)
  const fetchIssuers = useCallback(async () => {
    try {
      const txnRes = await getFonepayTransactions({ limit: 5000 });
      const transactions = txnRes.data.transactions || txnRes.data || [];
      const issuers = [...new Set(transactions.map(t => t.issuer_name).filter(Boolean))];
      setAllIssuers(issuers);
    } catch (error) {
      console.error('Failed to fetch issuers:', error);
    }
  }, []);

  // Initial data fetch
  const fetchData = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      fetchTransactions(),
      fetchSummaryAndStatus(),
      fetchIssuers()
    ]);
    setLoading(false);
  }, [fetchTransactions, fetchSummaryAndStatus, fetchIssuers]);

  useEffect(() => {
    fetchData();

    // Socket listeners for real-time updates
    socket.on('fonepay:update', () => {
      fetchTransactions({
        initiator: initiatorSearch,
        amount: amountSearch,
        fromDate,
        toDate,
        status: statusFilter,
        issuer: issuerFilter
      });
      fetchSummaryAndStatus();
    });
    socket.on('fonepay:status', (status) => {
      setSyncStatus(prev => ({ ...prev, status: status.status }));
      if (status.status === 'syncing') {
        setSyncing(true);
      } else {
        setSyncing(false);
        fetchTransactions({
          initiator: initiatorSearch,
          amount: amountSearch,
          fromDate,
          toDate,
          status: statusFilter,
          issuer: issuerFilter
        });
        fetchSummaryAndStatus();
      }
    });

    return () => {
      socket.off('fonepay:update');
      socket.off('fonepay:status');
    };
  }, [fetchData, fetchTransactions, fetchSummaryAndStatus, initiatorSearch, amountSearch, fromDate, toDate, statusFilter, issuerFilter]);

  // Debounced search effect - refetch when filters change
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTransactions({
        initiator: initiatorSearch,
        amount: amountSearch,
        fromDate,
        toDate,
        status: statusFilter,
        issuer: issuerFilter
      });
      setCurrentPage(1);
    }, 300); // 300ms debounce for text inputs

    return () => clearTimeout(timer);
  }, [initiatorSearch, amountSearch, fromDate, toDate, statusFilter, issuerFilter, fetchTransactions]);

  // Manual sync
  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await triggerFonepaySync();
      // Status will update via socket
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncing(false);
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return `Rs. ${Math.abs(amount || 0).toLocaleString('en-IN')}`;
  };

  // Format date
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  // Get status badge
  const getStatusBadge = (status) => {
    const statusLower = (status || '').toLowerCase();
    if (statusLower === 'success' || statusLower === 'completed') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle size={12} className="mr-1" />
          Success
        </span>
      );
    } else if (statusLower === 'failed' || statusLower === 'failure') {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
          <XCircle size={12} className="mr-1" />
          Failed
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <Clock size={12} className="mr-1" />
          {status || 'Pending'}
        </span>
      );
    }
  };

  // Get issuer icon/color
  const getIssuerStyle = (issuer) => {
    const issuerLower = (issuer || '').toLowerCase();
    if (issuerLower.includes('esewa')) {
      return 'bg-green-500';
    } else if (issuerLower.includes('khalti')) {
      return 'bg-purple-500';
    } else if (issuerLower.includes('ime')) {
      return 'bg-red-500';
    } else if (issuerLower.includes('connect')) {
      return 'bg-blue-500';
    } else {
      return 'bg-gray-500';
    }
  };

  // Use allIssuers from initial fetch for dropdown, fallback to current transactions
  const uniqueIssuers = allIssuers.length > 0 ? allIssuers : [...new Set(transactions.map(t => t.issuer_name).filter(Boolean))];

  // Server-side filtering - transactions are already filtered
  // Just paginate the results
  const totalPages = Math.ceil(transactions.length / itemsPerPage);
  const paginatedTransactions = transactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Calculate summary from current filtered results
  const filteredSummary = {
    total: transactions.reduce((sum, t) => sum + (t.amount || 0), 0),
    count: transactions.length
  };

  // Check if any filters are active
  const hasActiveFilters = initiatorSearch || amountSearch || fromDate || toDate || statusFilter !== 'all' || issuerFilter !== 'all';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-gray-400" size={32} />
        <span className="ml-2 text-gray-500">Loading Fonepay data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Wallet className="text-purple-600" />
            Fonepay Transactions
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Digital payment transactions from Fonepay portal
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Sync Status */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
            syncStatus.status === 'syncing'
              ? 'bg-blue-100 text-blue-700'
              : syncStatus.status === 'success'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700'
          }`}>
            {syncing ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Clock size={16} />
            )}
            <span className="hidden sm:inline">
              {syncing ? 'Syncing...' : syncStatus.lastSync
                ? `Last: ${formatDate(syncStatus.lastSync)}`
                : 'Auto-sync: 1 hour'}
            </span>
          </div>

          {/* Manual Sync Button */}
          <button
            onClick={handleManualSync}
            disabled={syncing}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              syncing
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-purple-600 text-white hover:bg-purple-700'
            }`}
          >
            <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Collections</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-purple-600">
                  {showAmount ? formatCurrency(summary.totalAmount) : 'Rs. XXX.XX'}
                </p>
                <button
                  onClick={() => setShowAmount(!showAmount)}
                  className="p-1 hover:bg-purple-100 rounded-full transition-colors"
                  title={showAmount ? 'Hide amount' : 'Show amount for 10 seconds'}
                >
                  {showAmount ? (
                    <EyeOff className="text-purple-500" size={18} />
                  ) : (
                    <Eye className="text-purple-500" size={18} />
                  )}
                </button>
              </div>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <TrendingUp className="text-purple-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Successful</p>
              <p className="text-2xl font-bold text-green-600">{summary.successCount}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <CheckCircle className="text-green-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Failed</p>
              <p className="text-2xl font-bold text-red-600">{summary.failedCount}</p>
            </div>
            <div className="p-3 bg-red-100 rounded-full">
              <XCircle className="text-red-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Transactions</p>
              <p className="text-2xl font-bold text-gray-900">{summary.totalCount}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-full">
              <CreditCard className="text-gray-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Initiator Search */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">Phone Number</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search phone..."
                value={initiatorSearch}
                onChange={(e) => {
                  setInitiatorSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="input pl-9 w-full"
              />
            </div>
          </div>

          {/* Amount Search */}
          <div className="relative">
            <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="text"
                placeholder="Search amount..."
                value={amountSearch}
                onChange={(e) => {
                  setAmountSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="input pl-9 w-full"
              />
            </div>
          </div>

          {/* From Date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="input pl-9 w-full"
              />
            </div>
          </div>

          {/* To Date */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To Date</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                type="date"
                value={toDate}
                onChange={(e) => {
                  setToDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="input pl-9 w-full"
              />
            </div>
          </div>

          {/* Status Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="input w-full"
            >
              <option value="all">All Status</option>
              <option value="success">Success</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          {/* Issuer Filter */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Issuer</label>
            <select
              value={issuerFilter}
              onChange={(e) => {
                setIssuerFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="input w-full"
            >
              <option value="all">All Issuers</option>
              {uniqueIssuers.map(issuer => (
                <option key={issuer} value={issuer}>{issuer}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Summary */}
        {hasActiveFilters && (
          <div className="mt-3 pt-3 border-t border-gray-200 flex items-center justify-between">
            <span className="text-sm text-gray-600">
              Found {transactions.length} transactions
              {totalCount > transactions.length && ` (of ${totalCount} total)`}
              {filteredSummary.total > 0 && (
                <span className="ml-2 font-medium text-purple-600">
                  (Total: {formatCurrency(filteredSummary.total)})
                </span>
              )}
            </span>
            <button
              onClick={() => {
                setInitiatorSearch('');
                setAmountSearch('');
                setFromDate('');
                setToDate('');
                setStatusFilter('all');
                setIssuerFilter('all');
                setCurrentPage(1);
              }}
              className="text-sm text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* Transactions Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th className="text-left">Date & Time</th>
                <th className="text-left">PRN</th>
                <th className="text-left">Terminal</th>
                <th className="text-left">Initiator</th>
                <th className="text-right">Amount</th>
                <th className="text-center">Status</th>
                <th className="text-left">Issuer</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center text-gray-500 py-12">
                    <Wallet className="mx-auto mb-3 text-gray-300" size={48} />
                    <p>No transactions found</p>
                    {transactions.length === 0 && (
                      <button
                        onClick={handleManualSync}
                        className="mt-3 text-purple-600 hover:underline"
                      >
                        Click to sync from Fonepay
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((txn, index) => (
                  <tr key={txn.id || index} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap">
                      <div className="text-sm font-medium">{formatDate(txn.transaction_date)}</div>
                    </td>
                    <td>
                      <div className="text-sm font-mono">{txn.prn_third_party || '-'}</div>
                      {txn.prn_hub && txn.prn_hub !== 'N/A' && (
                        <div className="text-xs text-gray-500">Hub: {txn.prn_hub}</div>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Building size={14} className="text-gray-400" />
                        <div>
                          <div className="text-sm">{txn.terminal_name || '-'}</div>
                          <div className="text-xs text-gray-500">{txn.terminal_id || ''}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <Phone size={14} className="text-gray-400" />
                        <span className="text-sm font-medium">{txn.initiator || '-'}</span>
                      </div>
                    </td>
                    <td className="text-right">
                      <span className="font-bold text-gray-900">{formatCurrency(txn.amount)}</span>
                    </td>
                    <td className="text-center">
                      {getStatusBadge(txn.status)}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${getIssuerStyle(txn.issuer_name)}`}></span>
                        <span className="text-sm">{txn.issuer_name || '-'}</span>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              Page {currentPage} of {totalPages} ({transactions.length} transactions)
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              {/* Page numbers */}
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3 py-1 rounded text-sm ${
                      currentPage === pageNum
                        ? 'bg-purple-600 text-white'
                        : 'border border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1 rounded border border-gray-300 text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Fonepay;
