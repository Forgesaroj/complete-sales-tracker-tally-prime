/**
 * Receipt Page - Two modes:
 * 1. Complete Payment - Edit Pending Sales Bill with payment breakdown
 * 2. Create Receipt - Standalone receipt voucher for any company
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

import { useState, useEffect, useRef } from 'react';
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
  IndianRupee,
  Plus
} from 'lucide-react';

import { autoMatchFonepay, createReceipt, searchReceiptParties, sendWhatsAppReceipt } from '../utils/api';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Receipt() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('complete'); // 'complete' or 'create'
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [lastReceipt, setLastReceipt] = useState(null); // { partyName, amount, voucherNumber }

  // Pending bills (complete tab)
  const [pendingBills, setPendingBills] = useState([]);
  const [billSearch, setBillSearch] = useState('');
  const [selectedBill, setSelectedBill] = useState(null);
  const [showBillDropdown, setShowBillDropdown] = useState(false);

  // Create Receipt state
  const [crCompany, setCrCompany] = useState('billing');
  const [crPartySearch, setCrPartySearch] = useState('');
  const [crPartySuggestions, setCrPartySuggestions] = useState([]);
  const [crShowSuggestions, setCrShowSuggestions] = useState(false);
  const [crSelectedParty, setCrSelectedParty] = useState('');
  const [crNarration, setCrNarration] = useState('');
  const crSearchTimer = useRef(null);
  const crPartyRef = useRef(null);

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

  // Close suggestions on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (crPartyRef.current && !crPartyRef.current.contains(e.target)) {
        setCrShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
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
  const clearForm = () => {
    setSelectedBill(null);
    setBillSearch('');
    setCrPartySearch('');
    setCrSelectedParty('');
    setCrNarration('');
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

  // Party search for Create Receipt tab
  const handleCrPartySearch = (val) => {
    setCrPartySearch(val);
    setCrSelectedParty('');
    if (crSearchTimer.current) clearTimeout(crSearchTimer.current);
    if (val.length < 2) {
      setCrPartySuggestions([]);
      setCrShowSuggestions(false);
      return;
    }
    crSearchTimer.current = setTimeout(async () => {
      try {
        const res = await searchReceiptParties(val, crCompany);
        setCrPartySuggestions(res.data?.parties || []);
        setCrShowSuggestions(true);
      } catch (e) {
        console.error('Party search error:', e);
      }
    }, 300);
  };

  const selectCrParty = (name) => {
    setCrSelectedParty(name);
    setCrPartySearch(name);
    setCrShowSuggestions(false);
  };

  // Complete Payment on Pending Sales Bill
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
      const res = await fetch(`${API_BASE}/api/pending-sales-bills/${selectedBill.masterId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyName: selectedBill.partyName,
          amount: selectedBill.amount,
          date: selectedBill.date ? selectedBill.date.split('/').reverse().join('') : null,
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

      const contentType = res.headers.get('content-type');
      if (!res.ok) {
        if (contentType && contentType.includes('application/json')) {
          const errorData = await res.json();
          throw new Error(errorData.error || `Server error: ${res.status}`);
        } else {
          throw new Error(`Server error: ${res.status} ${res.statusText}`);
        }
      }

      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Invalid response from server (not JSON)');
      }

      const data = await res.json();

      if (data.success) {
        const qrAmount = parseFloat(paymentModes.qrCode) || 0;
        if (qrAmount > 0) {
          try {
            await autoMatchFonepay({
              amount: qrAmount,
              date: new Date().toISOString().split('T')[0],
              voucherNumber: selectedBill.voucherNumber,
              partyName: selectedBill.partyName,
              companyName: 'FOR DB'
            });
          } catch (e) {
            console.log('Fonepay auto-match suggestion skipped:', e.message);
          }
        }
        setLastReceipt({ partyName: selectedBill.partyName, amount: totalPayment, voucherNumber: selectedBill.voucherNumber });
        setMessage({
          type: 'success',
          text: `Bill ${selectedBill.voucherNumber} updated to ${data.newVoucherType} with payment! Rs ${totalPayment.toLocaleString()}`
        });
        clearForm();
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

  // Create standalone Receipt
  const submitCreateReceipt = async () => {
    const partyName = crSelectedParty || crPartySearch.trim();
    if (!partyName) {
      setMessage({ type: 'error', text: 'Please select or enter a party name' });
      return;
    }

    if (totalPayment <= 0) {
      setMessage({ type: 'error', text: 'At least one payment mode must have a value' });
      return;
    }

    if (!tallyStatus.connected) {
      setMessage({ type: 'error', text: 'Tally is offline. Cannot create receipt.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const companies = { billing: 'FOR DB', odbc: 'ODBC CHq Mgmt' };
      const res = await createReceipt({
        partyName,
        company: companies[crCompany],
        narration: crNarration || `Receipt via Dashboard - ${crCompany === 'billing' ? 'Billing' : 'ODBC'}`,
        paymentModes: {
          cashTeller1: parseFloat(paymentModes.cashTeller1) || 0,
          cashTeller2: parseFloat(paymentModes.cashTeller2) || 0,
          chequeReceipt: parseFloat(paymentModes.chequeReceipt) || 0,
          qrCode: parseFloat(paymentModes.qrCode) || 0,
          discount: parseFloat(paymentModes.discount) || 0,
          bankDeposit: parseFloat(paymentModes.bankDeposit) || 0,
          esewa: parseFloat(paymentModes.esewa) || 0
        }
      });

      if (res.data?.success) {
        setLastReceipt({ partyName, amount: totalPayment, voucherNumber: res.data.voucherNumber || '' });
        setMessage({
          type: 'success',
          text: `Receipt created in ${crCompany === 'billing' ? 'Billing' : 'ODBC'} for ${partyName} — Rs ${totalPayment.toLocaleString()}`
        });
        clearForm();
      } else {
        setMessage({ type: 'error', text: res.data?.error || 'Failed to create receipt' });
      }
    } catch (error) {
      console.error('Create receipt error:', error);
      setMessage({ type: 'error', text: error.response?.data?.error || error.message });
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
          {t('receipt', 'Receipt')}
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

      {/* Tab Switcher */}
      <div className="flex mb-4 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => { setActiveTab('complete'); clearForm(); }}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'complete'
              ? 'bg-white text-blue-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText size={16} />
          Complete Bill
        </button>
        <button
          onClick={() => { setActiveTab('create'); clearForm(); }}
          className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
            activeTab === 'create'
              ? 'bg-white text-green-700 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Plus size={16} />
          Create Receipt
        </button>
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg flex items-center gap-2 ${
          message.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
        }`}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <span className="flex-1">{message.text}</span>
          {message.type === 'success' && lastReceipt && (
            <button
              title={`Send WhatsApp to ${lastReceipt.partyName}`}
              className="ml-2 px-3 py-1 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
              onClick={async (e) => {
                const btn = e.currentTarget;
                btn.disabled = true;
                btn.textContent = '...';
                try {
                  await sendWhatsAppReceipt({ partyName: lastReceipt.partyName, receiptData: { voucherNumber: lastReceipt.voucherNumber, amount: lastReceipt.amount, date: new Date().toISOString().slice(0, 10) } });
                  btn.textContent = 'Sent!';
                } catch (err) {
                  btn.textContent = 'Send';
                  alert('WhatsApp failed: ' + (err.response?.data?.error || err.message));
                }
                btn.disabled = false;
              }}
            >Send</button>
          )}
        </div>
      )}

      {/* Offline Warning */}
      {!tallyStatus.checking && !tallyStatus.connected && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
          <strong>Tally Offline:</strong> Receipt operations require Tally to be online.
        </div>
      )}

      {/* Receipt Form */}
      <div className="bg-white rounded-lg shadow-md p-6">

        {/* ============= COMPLETE BILL TAB ============= */}
        {activeTab === 'complete' && (
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
                    onClick={clearForm}
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
        )}

        {/* ============= CREATE RECEIPT TAB ============= */}
        {activeTab === 'create' && (
          <div className="mb-6">
            {/* Company Selector */}
            <label className="block font-medium mb-2 flex items-center gap-2">
              <Building2 size={18} />
              Company
            </label>
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => { setCrCompany('billing'); setCrPartySearch(''); setCrSelectedParty(''); setCrPartySuggestions([]); }}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold border transition-all ${
                  crCompany === 'billing'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}
              >
                Billing (FOR DB)
              </button>
              <button
                onClick={() => { setCrCompany('odbc'); setCrPartySearch(''); setCrSelectedParty(''); setCrPartySuggestions([]); }}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-semibold border transition-all ${
                  crCompany === 'odbc'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-purple-400'
                }`}
              >
                ODBC (Cheque)
              </button>
            </div>

            {/* Party Search */}
            <label className="block font-medium mb-2 flex items-center gap-2">
              <User size={18} />
              Party Name
            </label>
            <div className="relative mb-4" ref={crPartyRef}>
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={crPartySearch}
                onChange={(e) => handleCrPartySearch(e.target.value)}
                onFocus={() => crPartySuggestions.length > 0 && setCrShowSuggestions(true)}
                placeholder="Search party name..."
                className="w-full pl-10 p-3 border rounded-lg"
              />
              {crShowSuggestions && crPartySuggestions.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {crPartySuggestions.map((p, i) => (
                    <div
                      key={i}
                      onClick={() => selectCrParty(p.name)}
                      className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-b-0"
                    >
                      <div className="font-medium">{p.name}</div>
                      {p.parent && <div className="text-xs text-gray-500">{p.parent}</div>}
                    </div>
                  ))}
                </div>
              )}
              {crSelectedParty && (
                <div className="mt-2 p-3 bg-green-50 rounded-lg flex items-center justify-between">
                  <span className="font-medium text-green-800">{crSelectedParty}</span>
                  <button onClick={() => { setCrSelectedParty(''); setCrPartySearch(''); }} className="text-gray-400 hover:text-red-500">
                    <X size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Narration */}
            <label className="block font-medium mb-2 flex items-center gap-2">
              <FileText size={18} />
              Narration (optional)
            </label>
            <input
              type="text"
              value={crNarration}
              onChange={(e) => setCrNarration(e.target.value)}
              placeholder="e.g. Cheque payment at counter"
              className="w-full p-3 border rounded-lg mb-2"
            />
          </div>
        )}

        {/* Payment Modes (shared between both tabs) */}
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
            {activeTab === 'complete' && selectedBill && (
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
            {(activeTab === 'create' || (activeTab === 'complete' && !selectedBill)) && (
              <div className="flex justify-between items-center">
                <span className="font-medium text-gray-700">Total Payment:</span>
                <span className={`text-xl font-bold ${totalPayment > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                  Rs {totalPayment.toLocaleString()}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Voucher Type Preview (complete tab only) */}
        {activeTab === 'complete' && selectedBill && totalPayment > 0 && (
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
        {activeTab === 'complete' ? (
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
        ) : (
          <button
            onClick={submitCreateReceipt}
            disabled={submitting || totalPayment <= 0 || (!crSelectedParty && !crPartySearch.trim()) || !tallyStatus.connected}
            className={`w-full p-4 rounded-lg flex items-center justify-center gap-2 text-white font-medium ${
              submitting || totalPayment <= 0 || (!crSelectedParty && !crPartySearch.trim()) || !tallyStatus.connected
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            }`}
          >
            <Send size={20} />
            {submitting
              ? 'Creating Receipt...'
              : `Create Receipt in ${crCompany === 'billing' ? 'Billing' : 'ODBC'} (Rs ${totalPayment.toLocaleString()})`}
          </button>
        )}

        <p className="text-xs text-gray-500 mt-3 text-center">
          {activeTab === 'complete'
            ? `Converts Pending Sales Bill to ${newVoucherType || 'Sales/Credit Sales'} with UDF payment fields (SFL1-SFL7)`
            : `Creates a Receipt voucher in ${crCompany === 'billing' ? 'FOR DB' : 'ODBC CHq Mgmt'} with payment breakdown`
          }
        </p>
      </div>
    </div>
  );
}
