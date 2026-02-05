import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  TrendingUp,
  TrendingDown,
  Receipt,
  Clock,
  CheckCircle,
  AlertCircle,
  Package,
  Banknote
} from 'lucide-react';

import socket from '../utils/socket';
import { getDashboardSummary, getPendingBills, getBills } from '../utils/api';
import PaymentModal from '../components/PaymentModal';

function Dashboard({ isSimpleMode }) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalReceived: 0,
    pendingAmount: 0,
    billCount: 0,
    pendingCount: 0
  });
  const [pendingBills, setPendingBills] = useState([]);
  const [recentBills, setRecentBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBill, setSelectedBill] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    fetchData();

    // Real-time updates
    socket.on('bill:new', fetchData);
    socket.on('payment:created', fetchData);
    socket.on('sync:update', fetchData);

    return () => {
      socket.off('bill:new');
      socket.off('payment:created');
      socket.off('sync:update');
    };
  }, []);

  const fetchData = async () => {
    try {
      const [summaryRes, pendingRes, billsRes] = await Promise.all([
        getDashboardSummary(),
        getPendingBills(),
        getBills()
      ]);

      setSummary(summaryRes.data);
      setPendingBills(pendingRes.data);
      setRecentBills(billsRes.data.slice(0, 10));
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return `₹${Math.abs(amount).toLocaleString('en-IN')}`;
  };

  const handleReceivePayment = (bill) => {
    setSelectedBill(bill);
    setShowPaymentModal(true);
  };

  const handlePaymentSuccess = () => {
    setShowPaymentModal(false);
    setSelectedBill(null);
    fetchData();
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      partial: { color: 'bg-orange-100 text-orange-800', icon: AlertCircle },
      paid: { color: 'bg-green-100 text-green-800', icon: CheckCircle }
    };
    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;

    return (
      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${badge.color}`}>
        <Icon size={12} className="mr-1" />
        {t(`status.${status}`)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">{t('common.loading')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t('dashboard.totalSales')}</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(summary.totalSales)}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <TrendingUp className="text-blue-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t('dashboard.totalReceived')}</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.totalReceived)}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <Banknote className="text-green-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t('dashboard.pending')}</p>
              <p className="text-2xl font-bold text-orange-600">{formatCurrency(summary.pendingAmount)}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <Clock className="text-orange-600" size={24} />
            </div>
          </div>
        </div>

        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{t('dashboard.billsToday')}</p>
              <p className="text-2xl font-bold text-gray-900">{summary.billCount}</p>
            </div>
            <div className="p-3 bg-gray-100 rounded-full">
              <Receipt className="text-gray-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      {/* Pending Bills - Always shown */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <div className="flex items-center">
            <AlertCircle className="text-orange-500 mr-2" size={20} />
            <span>{t('dashboard.pendingBills')} ({pendingBills.length})</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{t('bills.invoiceNo')}</th>
                <th>{t('bills.party')}</th>
                <th className="text-right">{t('bills.amount')}</th>
                <th>{t('bills.status')}</th>
                <th>{t('bills.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {pendingBills.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center text-gray-500 py-8">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                pendingBills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-gray-50">
                    <td className="font-medium">{bill.voucher_number}</td>
                    <td>{bill.party_name}</td>
                    <td className="text-right font-medium">{formatCurrency(bill.amount)}</td>
                    <td>{getStatusBadge(bill.payment_status)}</td>
                    <td>
                      <button
                        onClick={() => handleReceivePayment(bill)}
                        className="btn btn-success text-sm py-1 px-3"
                      >
                        <Banknote size={16} className="inline mr-1" />
                        {isSimpleMode ? '💰' : t('bills.receivePayment')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Bills - Only in advanced mode */}
      {!isSimpleMode && (
        <div className="card">
          <div className="card-header">
            <span>{t('dashboard.recentBills')}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('bills.invoiceNo')}</th>
                  <th>{t('bills.party')}</th>
                  <th>{t('daybook.voucherType')}</th>
                  <th className="text-right">{t('bills.amount')}</th>
                  <th>{t('bills.paymentStatus')}</th>
                  <th>{t('bills.dispatchStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {recentBills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-gray-50">
                    <td className="font-medium">{bill.voucher_number}</td>
                    <td>{bill.party_name}</td>
                    <td className="text-sm text-gray-500">{bill.voucher_type}</td>
                    <td className="text-right font-medium">{formatCurrency(bill.amount)}</td>
                    <td>{getStatusBadge(bill.payment_status)}</td>
                    <td>
                      <span className={`badge badge-${bill.dispatch_status}`}>
                        {t(`status.${bill.dispatch_status}`)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && selectedBill && (
        <PaymentModal
          bill={selectedBill}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedBill(null);
          }}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}

export default Dashboard;
