import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Building2,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Calendar,
  Eye,
  EyeOff,
  Wallet
} from 'lucide-react';

import socket from '../utils/socket';
import {
  getRBBTransactions,
  getRBBSummary,
  getRBBStatus,
  triggerRBBSync
} from '../utils/api';

function RBBBanking() {
  const [transactions, setTransactions] = useState([]);
  const [summary, setSummary] = useState({
    totalCredit: 0,
    totalDebit: 0,
    creditCount: 0,
    debitCount: 0,
    accountBalance: 0,
    accountNumber: ''
  });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState({ status: 'idle', lastSync: null });
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showBalance, setShowBalance] = useState(false);
  const itemsPerPage = 25;

  // Auto-hide balance after 10 seconds
  useEffect(() => {
    if (showBalance) {
      const timer = setTimeout(() => {
        setShowBalance(false);
      }, 10000);
      return () => clearTimeout(timer);
    }
  }, [showBalance]);

  // Fetch data
  const fetchData = useCallback(async () => {
    try {
      const params = {};
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;

      const [txnRes, summaryRes, statusRes] = await Promise.all([
        getRBBTransactions(params),
        getRBBSummary(),
        getRBBStatus()
      ]);

      setTransactions(txnRes.data.transactions || []);

      if (summaryRes.data) {
        setSummary({
          totalCredit: summaryRes.data.totalCredit || 0,
          totalDebit: summaryRes.data.totalDebit || 0,
          creditCount: summaryRes.data.creditCount || 0,
          debitCount: summaryRes.data.debitCount || 0,
          accountBalance: summaryRes.data.accountBalance || 0,
          accountNumber: summaryRes.data.accountNumber || ''
        });
      }

      if (statusRes.data) {
        setSyncStatus({
          status: statusRes.data.status || 'idle',
          lastSync: statusRes.data.lastSyncTime || null,
          configured: statusRes.data.configured
        });
      }
    } catch (error) {
      console.error('Failed to fetch RBB data:', error);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchData();

    // Socket listeners for real-time updates
    socket.on('rbb:update', fetchData);
    socket.on('rbb:status', (status) => {
      setSyncStatus(prev => ({ ...prev, status: status.status }));
      if (status.status === 'syncing') {
        setSyncing(true);
      } else {
        setSyncing(false);
        fetchData();
      }
    });

    return () => {
      socket.off('rbb:update');
      socket.off('rbb:status');
    };
  }, [fetchData]);

  // Manual sync
  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await triggerRBBSync();
      // Status will update via socket
    } catch (error) {
      console.error('Sync failed:', error);
      setSyncing(false);
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    return `Rs. ${Math.abs(amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  // Pagination
  const totalPages = Math.ceil(transactions.length / itemsPerPage);
  const paginatedTransactions = transactions.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="animate-spin text-gray-400" size={32} />
        <span className="ml-2 text-gray-500">Loading RBB Banking data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2">
            <Building2 className="text-blue-600" />
            RBB Smart Banking
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Bank transactions &amp; Fonepay deposit settlements
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Sync Status */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
            syncStatus.status === 'syncing'
              ? 'bg-blue-100 text-blue-700'
              : syncStatus.status === 'success'
                ? 'bg-green-100 text-green-700'
                : syncStatus.status === 'otp_required'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-gray-100 text-gray-700'
          }`}>
            {syncing ? (
              <RefreshCw size={16} className="animate-spin" />
            ) : (
              <Clock size={16} />
            )}
            <span className="hidden sm:inline">
              {syncing ? 'Syncing...' :
                syncStatus.status === 'otp_required' ? 'OTP Required' :
                syncStatus.lastSync ? `Last: ${formatDate(syncStatus.lastSync)}` : 'Not synced'}
            </span>
          </div>

          {/* Manual Sync Button */}
          <button
            onClick={handleManualSync}
            disabled={syncing || !syncStatus.configured}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              syncing || !syncStatus.configured
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            title={!syncStatus.configured ? 'RBB credentials not configured' : ''}
          >
            <RefreshCw size={18} className={syncing ? 'animate-spin' : ''} />
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* Not Configured Warning */}
      {!syncStatus.configured && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800 text-sm">
            RBB Smart Banking credentials not configured. Add <code className="bg-yellow-100 px-1 rounded">RBB_USERNAME</code> and <code className="bg-yellow-100 px-1 rounded">RBB_PASSWORD</code> to your .env file.
          </p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Account Balance</p>
              <div className="flex items-center gap-2">
                <p className="text-2xl font-bold text-blue-600">
                  {showBalance ? formatCurrency(summary.accountBalance) : 'Rs. XXX.XX'}
                </p>
                <button
                  onClick={() => setShowBalance(!showBalance)}
                  className="p-1 hover:bg-blue-100 rounded-full transition-colors"
                  title={showBalance ? 'Hide balance' : 'Show balance for 10 seconds'}
                >
                  {showBalance ? (
                    <EyeOff className="text-blue-500" size={18} />
                  ) : (
                    <Eye className="text-blue-500" size={18} />
                  )}
                </button>
              </div>
              {summary.accountNumber && (
                <p className="text-xs text-gray-400 mt-1">A/C: {summary.accountNumber}</p>
              )}
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <Wallet className="text-blue-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Credits</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.totalCredit)}</p>
              <p className="text-xs text-gray-400 mt-1">{summary.creditCount} deposits</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <ArrowDownRight className="text-green-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Debits</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(summary.totalDebit)}</p>
              <p className="text-xs text-gray-400 mt-1">{summary.debitCount} withdrawals</p>
            </div>
            <div className="p-3 bg-red-100 rounded-full">
              <ArrowUpRight className="text-red-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Net Movement</p>
              <p className={`text-2xl font-bold ${(summary.totalCredit - summary.totalDebit) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(summary.totalCredit - summary.totalDebit)}
              </p>
            </div>
            <div className="p-3 bg-gray-100 rounded-full">
              {(summary.totalCredit - summary.totalDebit) >= 0 ? (
                <TrendingUp className="text-green-600" size={24} />
              ) : (
                <TrendingDown className="text-red-600" size={24} />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
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

          {/* Clear Filters */}
          <div className="flex items-end">
            {(fromDate || toDate) && (
              <button
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setCurrentPage(1);
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="table w-full">
            <thead>
              <tr>
                <th className="text-left">Date</th>
                <th className="text-left">Description</th>
                <th className="text-left">Reference</th>
                <th className="text-right">Debit</th>
                <th className="text-right">Credit</th>
                <th className="text-right">Balance</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center text-gray-500 py-12">
                    <Building2 className="mx-auto mb-3 text-gray-300" size={48} />
                    <p>No transactions found</p>
                    {transactions.length === 0 && syncStatus.configured && (
                      <button
                        onClick={handleManualSync}
                        className="mt-3 text-blue-600 hover:underline"
                      >
                        Click to sync from RBB
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((txn, index) => (
                  <tr key={txn.id || index} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap">
                      <div className="text-sm font-medium">{formatDate(txn.transaction_date)}</div>
                      {txn.value_date && txn.value_date !== txn.transaction_date && (
                        <div className="text-xs text-gray-400">Val: {txn.value_date}</div>
                      )}
                    </td>
                    <td>
                      <div className="text-sm">{txn.description || '-'}</div>
                      {txn.remarks && (
                        <div className="text-xs text-gray-400">{txn.remarks}</div>
                      )}
                    </td>
                    <td>
                      <span className="text-sm font-mono text-gray-600">{txn.reference_number || '-'}</span>
                    </td>
                    <td className="text-right">
                      {txn.debit > 0 ? (
                        <span className="font-medium text-red-600">{formatCurrency(txn.debit)}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="text-right">
                      {txn.credit > 0 ? (
                        <span className="font-medium text-green-600">{formatCurrency(txn.credit)}</span>
                      ) : (
                        <span className="text-gray-300">-</span>
                      )}
                    </td>
                    <td className="text-right">
                      <span className="font-bold text-gray-900">{formatCurrency(txn.balance)}</span>
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

export default RBBBanking;
