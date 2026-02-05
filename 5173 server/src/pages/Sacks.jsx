import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Package,
  Plus,
  Search,
  CheckCircle,
  Truck,
  X,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { getSacks, getSackById, createSack, addSackItem, updateSackStatus, getPendingBills } from '../utils/api';

function Sacks() {
  const { t } = useTranslation();
  const [sacks, setSacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewSackModal, setShowNewSackModal] = useState(false);
  const [expandedSack, setExpandedSack] = useState(null);
  const [expandedSackDetails, setExpandedSackDetails] = useState(null);

  useEffect(() => {
    fetchSacks();
  }, []);

  const fetchSacks = async () => {
    try {
      const { data } = await getSacks();
      setSacks(data);
    } catch (error) {
      console.error('Failed to fetch sacks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExpandSack = async (sackId) => {
    if (expandedSack === sackId) {
      setExpandedSack(null);
      setExpandedSackDetails(null);
      return;
    }

    try {
      const { data } = await getSackById(sackId);
      setExpandedSack(sackId);
      setExpandedSackDetails(data);
    } catch (error) {
      console.error('Failed to fetch sack details:', error);
    }
  };

  const handleStatusChange = async (sackId, status) => {
    try {
      await updateSackStatus(sackId, status);
      fetchSacks();
      if (expandedSack === sackId) {
        const { data } = await getSackById(sackId);
        setExpandedSackDetails(data);
      }
    } catch (error) {
      console.error('Failed to update sack status:', error);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      packing: 'bg-yellow-100 text-yellow-800',
      ready: 'bg-blue-100 text-blue-800',
      dispatched: 'bg-green-100 text-green-800'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status] || styles.packing}`}>
        {t(`sacks.${status}`)}
      </span>
    );
  };

  const formatCurrency = (amount) => {
    return `₹${Math.abs(amount || 0).toLocaleString('en-IN')}`;
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('sacks.title')}</h1>
        <button
          onClick={() => setShowNewSackModal(true)}
          className="btn btn-primary flex items-center"
        >
          <Plus size={18} className="mr-2" />
          {t('sacks.newSack')}
        </button>
      </div>

      {/* Sacks List */}
      <div className="space-y-4">
        {sacks.length === 0 ? (
          <div className="card p-8 text-center text-gray-500">
            <Package size={48} className="mx-auto mb-4 text-gray-300" />
            <p>{t('common.noData')}</p>
          </div>
        ) : (
          sacks.map((sack) => (
            <div key={sack.id} className="card overflow-hidden">
              {/* Sack Header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => handleExpandSack(sack.id)}
              >
                <div className="flex items-center space-x-4">
                  <Package className="text-gray-400" size={24} />
                  <div>
                    <div className="font-bold">{sack.sack_number}</div>
                    <div className="text-sm text-gray-500">{sack.customer_name}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-4">
                  <div className="text-sm text-gray-500">
                    {sack.item_count} {t('sacks.items')}
                  </div>
                  {getStatusBadge(sack.status)}
                  {expandedSack === sack.id ? (
                    <ChevronUp size={20} className="text-gray-400" />
                  ) : (
                    <ChevronDown size={20} className="text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {expandedSack === sack.id && expandedSackDetails && (
                <div className="border-t border-gray-200">
                  {/* Items */}
                  <div className="p-4 bg-gray-50">
                    <h4 className="font-medium mb-3">{t('sacks.items')}:</h4>
                    {expandedSackDetails.items?.length === 0 ? (
                      <p className="text-gray-500 text-sm">No items added yet</p>
                    ) : (
                      <div className="space-y-2">
                        {expandedSackDetails.items?.map((item, idx) => (
                          <div key={idx} className="flex items-center justify-between bg-white p-3 rounded-lg">
                            <div>
                              {item.bill_id ? (
                                <>
                                  <span className="font-medium">{item.voucher_number}</span>
                                  <span className="text-sm text-gray-500 ml-2">(Your Bill)</span>
                                  {item.payment_status === 'paid' ? (
                                    <span className="ml-2 text-green-600">✓ Paid</span>
                                  ) : (
                                    <span className="ml-2 text-yellow-600">⏳ Pending</span>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className="font-medium">{item.external_vendor}</span>
                                  <span className="text-sm text-gray-500 ml-2">(External)</span>
                                </>
                              )}
                            </div>
                            <div className="font-medium">
                              {formatCurrency(item.bill_amount || item.external_amount)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add Item Buttons */}
                    <div className="flex gap-2 mt-4">
                      <AddItemButton sackId={sack.id} onAdded={() => handleExpandSack(sack.id)} />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-3 p-4 bg-white border-t border-gray-200">
                    {sack.status === 'packing' && (
                      <button
                        onClick={() => handleStatusChange(sack.id, 'ready')}
                        className="btn btn-primary"
                      >
                        <CheckCircle size={18} className="mr-2" />
                        Mark Ready
                      </button>
                    )}
                    {sack.status === 'ready' && (
                      <button
                        onClick={() => handleStatusChange(sack.id, 'dispatched')}
                        className="btn btn-success"
                      >
                        <Truck size={18} className="mr-2" />
                        Mark Dispatched
                      </button>
                    )}
                    {sack.status === 'dispatched' && (
                      <span className="text-green-600 font-medium flex items-center">
                        <CheckCircle size={18} className="mr-2" />
                        Dispatched
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* New Sack Modal */}
      {showNewSackModal && (
        <NewSackModal
          onClose={() => setShowNewSackModal(false)}
          onCreated={() => {
            setShowNewSackModal(false);
            fetchSacks();
          }}
        />
      )}
    </div>
  );
}

// Add Item Button Component
function AddItemButton({ sackId, onAdded }) {
  const { t } = useTranslation();
  const [showBillSearch, setShowBillSearch] = useState(false);
  const [showExternalForm, setShowExternalForm] = useState(false);
  const [bills, setBills] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [externalVendor, setExternalVendor] = useState('');
  const [externalAmount, setExternalAmount] = useState('');

  const fetchBills = async () => {
    try {
      const { data } = await getPendingBills();
      setBills(data);
    } catch (error) {
      console.error('Failed to fetch bills:', error);
    }
  };

  const handleAddBill = async (billId) => {
    try {
      await addSackItem(sackId, { billId });
      setShowBillSearch(false);
      onAdded();
    } catch (error) {
      console.error('Failed to add bill to sack:', error);
    }
  };

  const handleAddExternal = async () => {
    try {
      await addSackItem(sackId, {
        externalVendor,
        externalAmount: parseFloat(externalAmount)
      });
      setShowExternalForm(false);
      setExternalVendor('');
      setExternalAmount('');
      onAdded();
    } catch (error) {
      console.error('Failed to add external item:', error);
    }
  };

  const filteredBills = bills.filter(b =>
    b.voucher_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    b.party_name?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (showBillSearch) {
    return (
      <div className="w-full space-y-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Search bill..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            onFocus={fetchBills}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
          />
          <button onClick={() => setShowBillSearch(false)} className="p-2">
            <X size={18} />
          </button>
        </div>
        {bills.length > 0 && (
          <div className="max-h-40 overflow-y-auto bg-white border border-gray-200 rounded-lg">
            {filteredBills.map((bill) => (
              <button
                key={bill.id}
                onClick={() => handleAddBill(bill.id)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0"
              >
                <span className="font-medium">{bill.voucher_number}</span>
                <span className="text-gray-500 ml-2">{bill.party_name}</span>
                <span className="float-right">₹{bill.amount?.toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (showExternalForm) {
    return (
      <div className="w-full space-y-2">
        <input
          type="text"
          placeholder={t('sacks.externalVendor')}
          value={externalVendor}
          onChange={(e) => setExternalVendor(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg"
        />
        <div className="flex gap-2">
          <input
            type="number"
            placeholder={t('sacks.externalAmount')}
            value={externalAmount}
            onChange={(e) => setExternalAmount(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
          />
          <button
            onClick={handleAddExternal}
            className="btn btn-primary"
            disabled={!externalVendor || !externalAmount}
          >
            Add
          </button>
          <button onClick={() => setShowExternalForm(false)} className="p-2">
            <X size={18} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        onClick={() => setShowBillSearch(true)}
        className="btn btn-outline text-sm"
      >
        <Plus size={16} className="mr-1" />
        {t('sacks.addBill')}
      </button>
      <button
        onClick={() => setShowExternalForm(true)}
        className="btn btn-outline text-sm"
      >
        <Plus size={16} className="mr-1" />
        {t('sacks.addExternal')}
      </button>
    </>
  );
}

// New Sack Modal
function NewSackModal({ onClose, onCreated }) {
  const { t } = useTranslation();
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await createSack({ customerName, notes });
      onCreated();
    } catch (error) {
      console.error('Failed to create sack:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-md w-full mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">{t('sacks.newSack')}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('sacks.customer')} *
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 border border-gray-300 rounded-lg"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              className="flex-1 py-2 bg-blue-600 text-white rounded-lg"
              disabled={loading || !customerName}
            >
              {loading ? '...' : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default Sacks;
