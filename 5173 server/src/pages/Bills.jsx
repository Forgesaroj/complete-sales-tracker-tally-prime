import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Filter,
  RefreshCw,
  Banknote,
  Package,
  CheckCircle,
  Truck,
  User
} from 'lucide-react';

import socket from '../utils/socket';
import { getBills, updateBillDispatch } from '../utils/api';
import PaymentModal from '../components/PaymentModal';

function Bills({ isSimpleMode }) {
  const { t } = useTranslation();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedBill, setSelectedBill] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  useEffect(() => {
    fetchBills();

    socket.on('bill:new', fetchBills);
    socket.on('payment:created', fetchBills);
    socket.on('bill:statusChanged', fetchBills);
    socket.on('bill:dispatchChanged', fetchBills);

    return () => {
      socket.off('bill:new');
      socket.off('payment:created');
      socket.off('bill:statusChanged');
      socket.off('bill:dispatchChanged');
    };
  }, []);

  const fetchBills = async () => {
    try {
      const { data } = await getBills();
      setBills(data);
    } catch (error) {
      console.error('Failed to fetch bills:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDispatchStatus = async (billId, status) => {
    try {
      await updateBillDispatch(billId, status);
      fetchBills();
    } catch (error) {
      console.error('Failed to update dispatch status:', error);
    }
  };

  const formatCurrency = (amount) => {
    return `₹${Math.abs(amount).toLocaleString('en-IN')}`;
  };

  const filteredBills = bills.filter((bill) => {
    const matchesSearch =
      bill.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bill.party_name?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      bill.payment_status === statusFilter ||
      bill.dispatch_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getPaymentStatusBadge = (status) => {
    const colors = {
      pending: 'bg-yellow-100 text-yellow-800',
      partial: 'bg-orange-100 text-orange-800',
      paid: 'bg-green-100 text-green-800'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status] || colors.pending}`}>
        {t(`status.${status}`)}
      </span>
    );
  };

  const getDispatchStatusBadge = (status) => {
    const colors = {
      created: 'bg-gray-100 text-gray-800',
      ready: 'bg-blue-100 text-blue-800',
      dispatched: 'bg-purple-100 text-purple-800',
      customer_taken: 'bg-green-100 text-green-800'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status] || colors.created}`}>
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
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('nav.bills')}</h1>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder={t('common.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg w-full sm:w-64"
            />
          </div>

          {/* Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg"
          >
            <option value="all">All Status</option>
            <option value="pending">{t('status.pending')}</option>
            <option value="partial">{t('status.partial')}</option>
            <option value="paid">{t('status.paid')}</option>
            <option value="ready">{t('status.ready')}</option>
            <option value="dispatched">{t('status.dispatched')}</option>
          </select>

          {/* Refresh */}
          <button
            onClick={fetchBills}
            className="btn btn-outline flex items-center justify-center"
          >
            <RefreshCw size={18} />
          </button>
        </div>
      </div>

      {/* Bills Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>{t('bills.invoiceNo')}</th>
                <th>{t('bills.party')}</th>
                {!isSimpleMode && <th>{t('daybook.voucherType')}</th>}
                <th className="text-right">{t('bills.amount')}</th>
                <th>{t('bills.paymentStatus')}</th>
                <th>{t('bills.dispatchStatus')}</th>
                <th>{t('bills.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredBills.length === 0 ? (
                <tr>
                  <td colSpan={isSimpleMode ? 6 : 7} className="text-center text-gray-500 py-8">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                filteredBills.map((bill) => (
                  <tr key={bill.id} className="hover:bg-gray-50">
                    <td className="font-medium">{bill.voucher_number}</td>
                    <td>{bill.party_name}</td>
                    {!isSimpleMode && <td className="text-sm text-gray-500">{bill.voucher_type}</td>}
                    <td className="text-right font-medium">{formatCurrency(bill.amount)}</td>
                    <td>{getPaymentStatusBadge(bill.payment_status)}</td>
                    <td>{getDispatchStatusBadge(bill.dispatch_status)}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        {/* Payment button */}
                        {bill.payment_status !== 'paid' && (
                          <button
                            onClick={() => {
                              setSelectedBill(bill);
                              setShowPaymentModal(true);
                            }}
                            className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                            title={t('bills.receivePayment')}
                          >
                            <Banknote size={18} />
                          </button>
                        )}

                        {/* Dispatch actions */}
                        {bill.payment_status === 'paid' && bill.dispatch_status === 'created' && (
                          <button
                            onClick={() => handleDispatchStatus(bill.id, 'ready')}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                            title={t('bills.markReady')}
                          >
                            <Package size={18} />
                          </button>
                        )}

                        {bill.dispatch_status === 'ready' && (
                          <>
                            <button
                              onClick={() => handleDispatchStatus(bill.id, 'dispatched')}
                              className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg"
                              title={t('bills.markDispatched')}
                            >
                              <Truck size={18} />
                            </button>
                            <button
                              onClick={() => handleDispatchStatus(bill.id, 'customer_taken')}
                              className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                              title={t('bills.customerTaken')}
                            >
                              <User size={18} />
                            </button>
                          </>
                        )}

                        {bill.dispatch_status === 'dispatched' && (
                          <CheckCircle className="text-green-500" size={18} />
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Modal */}
      {showPaymentModal && selectedBill && (
        <PaymentModal
          bill={selectedBill}
          onClose={() => {
            setShowPaymentModal(false);
            setSelectedBill(null);
          }}
          onSuccess={() => {
            setShowPaymentModal(false);
            setSelectedBill(null);
            fetchBills();
          }}
        />
      )}
    </div>
  );
}

export default Bills;
