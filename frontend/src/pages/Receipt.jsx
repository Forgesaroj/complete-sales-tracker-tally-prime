/**
 * Receipt Page - Complete Payment for Pending Sales Bills
 *
 * Workflow:
 * 1. Select a Pending Sales Bill
 * 2. Enter payment amounts in various modes
 * 3. System determines new voucher type:
 *    - Full Payment (payment >= bill amount) → "Sales"
 *    - Partial Payment (payment < bill amount) → "Credit Sales"
 * 4. EDITS the original Pending Sales Bill to:
 *    - Change voucher type (Sales or Credit Sales)
 *    - Add UDF fields (SFL1-SFL7) with payment breakdown
 *
 * Payment Modes (Ledger Names):
 *   - SFL1: Cash Teller 1
 *   - SFL2: Cash Teller 2
 *   - SFL3: Cheque receipt
 *   - SFL4: Q/R code
 *   - SFL5: Discount
 *   - SFL6: Bank Deposit(All)
 *   - SFL7: Esewa
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  User,
  Send,
  Wifi,
  WifiOff,
  RefreshCw,
  Banknote,
  CreditCard,
  Building2,
  Smartphone,
  Percent,
  FileText,
  Receipt as ReceiptIcon,
  Search,
  CheckCircle,
  AlertCircle,
  X,
  IndianRupee
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Receipt() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  // Pending bills
  const [pendingBills, setPendingBills] = useState([]);
  const [billSearch, setBillSearch] = useState('');
  const [selectedBill, setSelectedBill] = useState(null);
  const [showBillDropdown, setShowBillDropdown] = useState(false);

  // Tally connection status
  const [tallyStatus, setTallyStatus] = useState({ connected: false, checking: true });

  // Payment form state - maps to Tally ledgers
  const [paymentModes, setPaymentModes] = useState({
    cashTeller1: '',      // Cash Teller 1
    cashTeller2: '',      // Cash Teller 2
    chequeReceipt: '',    // Cheque receipt
    qrCode: '',           // Q/R code
    discount: '',         // Discount
    bankDeposit: '',      // Bank Deposit(All)
    esewa: ''             // Esewa
  });

  // Load pending bills on mount
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
    } catch (error) {
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

  // Filter bills by search (party name or voucher number)
  const filteredBills = pendingBills.filter(bill =>
    bill.partyName?.toLowerCase().includes(billSearch.toLowerCase()) ||
    bill.voucherNumber?.toLowerCase().includes(billSearch.toLowerCase())
  );

  // Update payment mode
  const updatePaymentMode = (field, value) => {
    setPaymentModes(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Calculate total payment
  const calculateTotal = () => {
    return (
      (parseFloat(paymentModes.cashTeller1) || 0) +
      (parseFloat(paymentModes.cashTeller2) || 0) +
      (parseFloat(paymentModes.chequeReceipt) || 0) +
      (parseFloat(paymentModes.qrCode) || 0) +
      (parseFloat(paymentModes.discount) || 0) +
      (parseFloat(paymentModes.bankDeposit) || 0) +
      (parseFloat(paymentModes.esewa) || 0)
    );
  };

  const totalPayment = calculateTotal();

  // Determine voucher type based on payment
  const getNewVoucherType = () => {
    if (!selectedBill) return null;
    const billAmount = selectedBill.amount || 0;
    // Full payment or overpayment → Sales
    // Partial payment → Credit Sales
    return totalPayment >= billAmount ? 'Sales' : 'Credit Sales';
  };

  const newVoucherType = getNewVoucherType();
  const isFullPayment = selectedBill && totalPayment >= selectedBill.amount;
  const remainingAmount = selectedBill ? Math.max(0, selectedBill.amount - totalPayment) : 0;

  // Select a bill
  const selectBill = (bill) => {
    setSelectedBill(bill);
    setBillSearch(`${bill.voucherNumber} - ${bill.partyName}`);
    setShowBillDropdown(false);
    setMessage(null);

    // Pre-fill with existing UDF values if any
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
    }
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedBill(null);
    setBillSearch('');
    setPaymentModes({
      cashTeller1: '',
      cashTeller2: '',
      chequeReceipt: '',
      qrCode: '',
      discount: '',
      bankDeposit: '',
      esewa: ''
    });
    setMessage(null);
  };

  // Complete payment on the Pending Sales Bill
  // This EDITS the original bill (no deletion) to add:
  // - New voucher type (Sales or Credit Sales)
  // - UDF fields (SFL1-SFL7) with payment breakdown
  const completePayment = async () => {
    if (!selectedBill) {
      setMessage({ type: 'error', text: 'Please select a pending bill' });
      return;
    }

    if (totalPayment <= 0) {
      setMessage({ type: 'error', text: 'At least one payment mode must have a value' });
      return;
    }

    if (!tallyStatus.connected) {
      setMessage({ type: 'error', text: 'Tally is offline. Cannot complete payment.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      // Use the new endpoint that edits the voucher directly (no deletion)
      const res = await fetch(`${API_BASE}/api/pending-sales-bills/${selectedBill.masterId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyName: selectedBill.partyName,
          amount: selectedBill.amount,
          date: selectedBill.date ? selectedBill.date.split('/').reverse().join('') : null, // Convert DD/MM/YYYY to YYYYMMDD
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

      // Check if response is OK before parsing JSON
      const contentType = res.headers.get('content-type');
      if (!res.ok) {
        // Try to get error message from response
        if (contentType && contentType.includes('application/json')) {
          const errorData = await res.json();
          throw new Error(errorData.error || `Server error: ${res.status}`);
        } else {
          throw new Error(`Server error: ${res.status} ${res.statusText}`);
        }
      }

      // Parse JSON response
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Invalid response from server (not JSON)');
      }

      const data = await res.json();

      if (data.success) {
        setMessage({
          type: 'success',
          text: `Bill ${selectedBill.voucherNumber} updated to ${data.newVoucherType} with payment! Rs ${totalPayment.toLocaleString()}`
        });
        // Reset form and reload bills
        clearSelection();
        loadPendingBills();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to complete payment' });
      }
    } catch (error) {
      console.error('Complete payment error:', error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  // Payment mode input component
  const PaymentInput = ({ icon: Icon, label, field, ledgerName }) => (
    <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
      <div className="p-2 bg-white rounded-lg shadow-sm">
        <Icon size={20} className="text-gray-600" />
      </div>
      <div className="flex-1">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {label}
          <span className="text-xs text-gray-400 ml-2">({ledgerName})</span>
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={paymentModes[field]}
          onChange={(e) => updatePaymentMode(field, e.target.value)}
          placeholder="0"
          className="w-full p-2 border rounded-lg text-right font-mono"
        />
      </div>
    </div>
  );

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Header with Tally Status */}
      <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ReceiptIcon size={28} />
          {t('completePayment', 'Complete Payment')}
        </h1>

        {/* Tally Status */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
          tallyStatus.checking
            ? 'bg-gray-100 text-gray-600'
            : tallyStatus.connected
              ? 'bg-green-100 text-green-700'
              : 'bg-red-100 text-red-700'
        }`}>
          {tallyStatus.checking ? (
            <>
              <RefreshCw size={16} className="animate-spin" />
              <span className="text-sm">Checking...</span>
            </>
          ) : tallyStatus.connected ? (
            <>
              <Wifi size={16} />
              <span className="text-sm font-medium">Tally Online</span>
            </>
          ) : (
            <>
              <WifiOff size={16} />
              <span className="text-sm font-medium">Tally Offline</span>
            </>
          )}
        </div>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          {message.text}
        </div>
      )}

      {/* Offline Warning */}
      {!tallyStatus.checking && !tallyStatus.connected && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
          <strong>Tally Offline:</strong> Payment completion requires Tally to be online.
        </div>
      )}

      {/* Receipt Form */}
      <div className="bg-white rounded-lg shadow-md p-6">
        {/* Bill Selection */}
        <div className="mb-6">
          <label className="block font-medium mb-2 flex items-center gap-2">
            <FileText size={18} />
            Select Pending Sales Bill
          </label>
          <div className="relative">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={billSearch}
                  onChange={(e) => {
                    setBillSearch(e.target.value);
                    setShowBillDropdown(true);
                    if (!e.target.value) setSelectedBill(null);
                  }}
                  onFocus={() => setShowBillDropdown(true)}
                  placeholder="Search by voucher number or party name..."
                  className="w-full pl-10 p-3 border rounded-lg"
                />
              </div>
              <button
                onClick={loadPendingBills}
                className="p-3 text-gray-500 hover:text-blue-500 hover:bg-blue-50 rounded-lg"
                title="Refresh Bills"
              >
                <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
              </button>
              {selectedBill && (
                <button
                  onClick={clearSelection}
                  className="p-3 text-gray-500 hover:text-red-500 hover:bg-red-50 rounded-lg"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Bill Dropdown */}
            {showBillDropdown && billSearch && !selectedBill && (
              <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {loading ? (
                  <div className="p-4 text-center text-gray-500">
                    <RefreshCw size={20} className="animate-spin mx-auto mb-2" />
                    Loading...
                  </div>
                ) : filteredBills.length === 0 ? (
                  <div className="p-4 text-center text-gray-500">
                    No pending bills found
                  </div>
                ) : (
                  filteredBills.slice(0, 20).map((bill, idx) => (
                    <div
                      key={idx}
                      onClick={() => selectBill(bill)}
                      className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-b-0"
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{bill.voucherNumber}</div>
                          <div className="text-sm text-gray-600">{bill.partyName}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-red-600">Rs {bill.amount?.toLocaleString()}</div>
                          <div className="text-xs text-gray-500">{bill.date}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Selected Bill Info */}
          {selectedBill && (
            <div className="mt-3 p-4 bg-blue-50 rounded-lg">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-bold text-blue-800">{selectedBill.voucherNumber}</div>
                  <div className="text-blue-700">{selectedBill.partyName}</div>
                  <div className="text-sm text-blue-600 mt-1">{selectedBill.date}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm text-gray-600">Bill Amount</div>
                  <div className="text-xl font-bold text-red-600">
                    Rs {selectedBill.amount?.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Payment Modes */}
        <div className="mb-6">
          <label className="block font-medium mb-3 flex items-center gap-2">
            <Banknote size={18} />
            Payment Breakdown
          </label>

          <div className="space-y-3">
            <PaymentInput
              icon={Banknote}
              label="Cash Teller 1"
              field="cashTeller1"
              ledgerName="Cash Teller 1"
            />
            <PaymentInput
              icon={Banknote}
              label="Cash Teller 2"
              field="cashTeller2"
              ledgerName="Cash Teller 2"
            />
            <PaymentInput
              icon={CreditCard}
              label="Cheque Receipt"
              field="chequeReceipt"
              ledgerName="Cheque receipt"
            />
            <PaymentInput
              icon={FileText}
              label="Q/R Code"
              field="qrCode"
              ledgerName="Q/R code"
            />
            <PaymentInput
              icon={Percent}
              label="Discount"
              field="discount"
              ledgerName="Discount"
            />
            <PaymentInput
              icon={Building2}
              label="Bank Deposit"
              field="bankDeposit"
              ledgerName="Bank Deposit(All)"
            />
            <PaymentInput
              icon={Smartphone}
              label="Esewa"
              field="esewa"
              ledgerName="Esewa"
            />
          </div>

          {/* Payment Summary */}
          <div className="mt-4 p-4 bg-gray-100 rounded-lg space-y-2">
            {selectedBill && (
              <>
                <div className="flex justify-between items-center text-gray-700">
                  <span>Bill Amount:</span>
                  <span className="font-medium">Rs {selectedBill.amount?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between items-center text-gray-700">
                  <span>Receipt Amount:</span>
                  <span className={`font-medium ${totalPayment > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                    Rs {totalPayment.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center border-t pt-2 mt-2">
                  <span className="font-medium">Balance After Receipt:</span>
                  <span className={`font-bold ${remainingAmount > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                    Rs {remainingAmount.toLocaleString()}
                  </span>
                </div>
              </>
            )}
            {!selectedBill && (
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-700">Total Payment:</span>
                <span className={`text-xl font-bold ${totalPayment > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  Rs {totalPayment.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Voucher Type Preview */}
        {selectedBill && totalPayment > 0 && (
          <div className={`mb-4 p-3 rounded-lg flex items-center gap-2 ${
            isFullPayment ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
          }`}>
            <CheckCircle size={18} />
            <span>
              Bill will be updated to: <strong>{newVoucherType}</strong>
              {isFullPayment ? ' (Full Payment)' : ' (Partial Payment)'}
            </span>
          </div>
        )}

        {/* Submit Button */}
        <button
          onClick={completePayment}
          disabled={submitting || totalPayment <= 0 || !selectedBill || !tallyStatus.connected}
          className={`w-full p-4 rounded-lg flex items-center justify-center gap-2 text-white font-medium ${
            submitting || totalPayment <= 0 || !selectedBill || !tallyStatus.connected
              ? 'bg-gray-400 cursor-not-allowed'
              : isFullPayment
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-orange-600 hover:bg-orange-700'
          }`}
        >
          <Send size={20} />
          {submitting
            ? 'Processing...'
            : selectedBill
              ? `Complete Payment → ${newVoucherType} (Rs ${totalPayment.toLocaleString()})`
              : 'Select a Bill First'}
        </button>

        <p className="text-xs text-gray-500 mt-3 text-center">
          Converts Pending Sales Bill to {newVoucherType || 'Sales/Credit Sales'} with UDF payment fields (SFL1-SFL7)
        </p>
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 p-4 rounded-lg text-sm">
        <strong>How it works:</strong>
        <div className="mt-2 space-y-1 text-gray-700">
          <div>• Select a Pending Sales Bill from the list above</div>
          <div>• Enter payment amounts in different modes</div>
          <div>• The bill is <strong>edited</strong> (not deleted) to update:</div>
          <div className="ml-4 text-green-700">◦ <strong>Sales</strong> - if payment covers full amount</div>
          <div className="ml-4 text-orange-700">◦ <strong>Credit Sales</strong> - if partial payment</div>
          <div>• Payment breakdown is saved in UDF fields on the same voucher</div>
        </div>
        <div className="mt-3">
          <strong>UDF Payment Fields (on the voucher):</strong>
          <div className="mt-1 grid grid-cols-2 gap-1 text-gray-600">
            <div>• SFL1: Cash Teller 1</div>
            <div>• SFL2: Cash Teller 2</div>
            <div>• SFL3: Cheque receipt</div>
            <div>• SFL4: Q/R code</div>
            <div>• SFL5: Discount</div>
            <div>• SFL6: Bank Deposit(All)</div>
            <div>• SFL7: Esewa</div>
            <div>• SFLTot: Total (auto)</div>
          </div>
        </div>
      </div>
    </div>
  );
}
