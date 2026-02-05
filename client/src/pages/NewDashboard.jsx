/**
 * New Dashboard - Pending Sales Bills with Payment
 *
 * Features:
 * - Shows all Pending Sales Bills from Tally
 * - Click bill to select and enter payment
 * - 7 Payment Mode Fields (SFL1-SFL7)
 * - Updates voucher type: Sales (full) or Credit Sales (partial)
 */
import { useState, useEffect } from 'react';
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
  ChevronRight
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function NewDashboard() {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  // Pending bills
  const [pendingBills, setPendingBills] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBill, setSelectedBill] = useState(null);

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

  // Load data on mount
  useEffect(() => {
    checkTallyStatus();
    loadPendingBills();
    const interval = setInterval(checkTallyStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const checkTallyStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/tally/status`);
      const data = await res.json();
      setTallyStatus({ connected: data.connected, checking: false });
    } catch {
      setTallyStatus({ connected: false, checking: false });
    }
  };

  const loadPendingBills = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/pending-sales-bills`);
      const data = await res.json();
      if (data.success) {
        setPendingBills(data.bills || []);
      }
    } catch (error) {
      console.error('Error loading pending bills:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter bills by search
  const filteredBills = pendingBills.filter(bill =>
    bill.partyName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bill.voucherNumber?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate total payment
  const totalPayment =
    (parseFloat(paymentModes.cashTeller1) || 0) +
    (parseFloat(paymentModes.cashTeller2) || 0) +
    (parseFloat(paymentModes.chequeReceipt) || 0) +
    (parseFloat(paymentModes.qrCode) || 0) +
    (parseFloat(paymentModes.discount) || 0) +
    (parseFloat(paymentModes.bankDeposit) || 0) +
    (parseFloat(paymentModes.esewa) || 0);

  const isFullPayment = selectedBill && totalPayment >= selectedBill.amount;
  const newVoucherType = isFullPayment ? 'Sales' : 'Credit Sales';
  const balanceAfter = selectedBill ? Math.max(0, selectedBill.amount - totalPayment) : 0;

  // Update payment mode
  const updatePaymentMode = (field, value) => {
    setPaymentModes(prev => ({ ...prev, [field]: value }));
  };

  // Select a bill
  const selectBill = (bill) => {
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
      clearPayments();
    }
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedBill(null);
    clearPayments();
    setMessage(null);
  };

  // Clear payment fields
  const clearPayments = () => {
    setPaymentModes({
      cashTeller1: '',
      cashTeller2: '',
      chequeReceipt: '',
      qrCode: '',
      discount: '',
      bankDeposit: '',
      esewa: ''
    });
  };

  // Set full payment
  const setFullPayment = () => {
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
  };

  // Complete payment
  const completePayment = async () => {
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
        loadPendingBills();
      } else {
        setMessage({ type: 'error', text: data.error || 'Payment failed' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Payment input component
  const PaymentInput = ({ icon: Icon, label, field, ledgerName }) => (
    <div className="flex items-center gap-2">
      <div className="p-1.5 bg-gray-100 rounded">
        <Icon size={14} className="text-gray-600" />
      </div>
      <div className="flex-1">
        <div className="text-xs text-gray-500">{label} ({ledgerName})</div>
        <input
          type="number"
          inputMode="decimal"
          value={paymentModes[field]}
          onChange={(e) => updatePaymentMode(field, e.target.value)}
          placeholder="0"
          className="w-full p-1 border rounded text-right text-sm font-mono"
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800">Pending Bills</h1>
            <div className="flex items-center gap-3">
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

              {/* Refresh */}
              <button
                onClick={loadPendingBills}
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Bills List */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="p-3 border-b bg-gray-50 flex items-center justify-between">
              <span className="font-medium text-gray-700">
                Pending Bills ({filteredBills.length})
              </span>
              <span className="text-sm text-gray-500">
                Total: Rs {filteredBills.reduce((sum, b) => sum + (b.amount || 0), 0).toLocaleString()}
              </span>
            </div>

            {loading ? (
              <div className="p-8 text-center text-gray-500">
                <RefreshCw size={24} className="animate-spin mx-auto mb-2" />
                Loading...
              </div>
            ) : filteredBills.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No pending bills found
              </div>
            ) : (
              <div className="divide-y max-h-[60vh] overflow-y-auto">
                {filteredBills.map((bill) => (
                  <div
                    key={bill.masterId}
                    onClick={() => selectBill(bill)}
                    className={`p-3 cursor-pointer transition-colors flex items-center gap-3 ${
                      selectedBill?.masterId === bill.masterId
                        ? 'bg-blue-50 border-l-4 border-blue-500'
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800 truncate">
                          {bill.partyName}
                        </span>
                        {bill.sflTot > 0 && (
                          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                            Paid
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500 flex items-center gap-2">
                        <span>{bill.voucherNumber}</span>
                        <span>•</span>
                        <span>{bill.date}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-red-600">
                        Rs {bill.amount?.toLocaleString()}
                      </div>
                    </div>
                    <ChevronRight size={18} className="text-gray-400" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payment Panel */}
          <div className="bg-white rounded-lg shadow-sm">
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

                  {/* Payment Fields */}
                  <div className="space-y-2">
                    <PaymentInput icon={Banknote} label="Cash Teller 1" field="cashTeller1" ledgerName="SFL1" />
                    <PaymentInput icon={Banknote} label="Cash Teller 2" field="cashTeller2" ledgerName="SFL2" />
                    <PaymentInput icon={CreditCard} label="Cheque" field="chequeReceipt" ledgerName="SFL3" />
                    <PaymentInput icon={FileText} label="Q/R Code" field="qrCode" ledgerName="SFL4" />
                    <PaymentInput icon={Percent} label="Discount" field="discount" ledgerName="SFL5" />
                    <PaymentInput icon={Building2} label="Bank Deposit" field="bankDeposit" ledgerName="SFL6" />
                    <PaymentInput icon={Smartphone} label="Esewa" field="esewa" ledgerName="SFL7" />
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
      </div>
    </div>
  );
}
