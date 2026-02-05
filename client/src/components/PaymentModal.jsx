/**
 * Payment Modal - Complete Payment for Pending Sales Bills
 *
 * Updated to support 7 payment modes (UDF fields):
 *   - SFL1: Cash Teller 1
 *   - SFL2: Cash Teller 2
 *   - SFL3: Cheque receipt
 *   - SFL4: Q/R code
 *   - SFL5: Discount
 *   - SFL6: Bank Deposit(All)
 *   - SFL7: Esewa
 */
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  X,
  Banknote,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Building2,
  Smartphone,
  Percent,
  FileText
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function PaymentModal({ bill, onClose, onSuccess }) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Payment modes state - maps to UDF fields SFL1-SFL7
  const [paymentModes, setPaymentModes] = useState({
    cashTeller1: '',      // SFL1: Cash Teller 1
    cashTeller2: '',      // SFL2: Cash Teller 2
    chequeReceipt: '',    // SFL3: Cheque receipt
    qrCode: '',           // SFL4: Q/R code
    discount: '',         // SFL5: Discount
    bankDeposit: '',      // SFL6: Bank Deposit(All)
    esewa: ''             // SFL7: Esewa
  });

  const remainingAmount = bill.amount - (bill.amount_received || 0);

  // Calculate total from all payment modes
  const totalPayment =
    (parseFloat(paymentModes.cashTeller1) || 0) +
    (parseFloat(paymentModes.cashTeller2) || 0) +
    (parseFloat(paymentModes.chequeReceipt) || 0) +
    (parseFloat(paymentModes.qrCode) || 0) +
    (parseFloat(paymentModes.discount) || 0) +
    (parseFloat(paymentModes.bankDeposit) || 0) +
    (parseFloat(paymentModes.esewa) || 0);

  const isFullPayment = totalPayment >= remainingAmount;
  const newVoucherType = isFullPayment ? 'Sales' : 'Credit Sales';
  const balanceAfter = Math.max(0, remainingAmount - totalPayment);

  // Update payment mode
  const updatePaymentMode = (field, value) => {
    setPaymentModes(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Set full payment in cash teller 1
  const setFullPayment = () => {
    setPaymentModes({
      cashTeller1: String(remainingAmount),
      cashTeller2: '',
      chequeReceipt: '',
      qrCode: '',
      discount: '',
      bankDeposit: '',
      esewa: ''
    });
  };

  // Clear all payment modes
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (totalPayment <= 0) {
      setError('Enter at least one payment amount');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use the masterId from the bill (for Tally pending sales bills)
      const masterId = bill.masterId || bill.master_id || bill.id;

      const response = await fetch(`${API_BASE}/api/pending-sales-bills/${masterId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyName: bill.party_name || bill.partyName,
          amount: bill.amount,
          date: bill.date || bill.voucher_date,
          voucherNumber: bill.voucher_number || bill.voucherNumber,
          guid: bill.guid,
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

      const data = await response.json();

      if (response.ok && data.success) {
        setSuccess(true);
        setTimeout(() => {
          onSuccess();
        }, 1500);
      } else {
        setError(data.error || 'Failed to complete payment');
      }
    } catch (err) {
      setError(err.message || t('payment.error'));
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return `Rs ${Math.abs(value).toLocaleString('en-IN')}`;
  };

  // Payment input component
  const PaymentInput = ({ icon: Icon, label, field, ledgerName }) => (
    <div className="flex items-center gap-2 p-2 bg-gray-50 rounded-lg">
      <div className="p-1.5 bg-white rounded shadow-sm">
        <Icon size={16} className="text-gray-600" />
      </div>
      <div className="flex-1">
        <label className="block text-xs text-gray-600">
          {label} <span className="text-gray-400">({ledgerName})</span>
        </label>
        <input
          type="number"
          inputMode="decimal"
          value={paymentModes[field]}
          onChange={(e) => updatePaymentMode(field, e.target.value)}
          placeholder="0"
          className="w-full p-1.5 border rounded text-right font-mono text-sm"
        />
      </div>
    </div>
  );

  if (success) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-md w-full mx-4 text-center">
          <CheckCircle className="mx-auto text-green-500 mb-4" size={64} />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Payment Completed!</h2>
          <p className="text-gray-600">
            {formatCurrency(totalPayment)} received from {bill.party_name || bill.partyName}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Bill updated to: <strong>{newVoucherType}</strong>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 sticky top-0 bg-white">
          <h2 className="text-lg font-bold">Complete Payment</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
            <X size={20} />
          </button>
        </div>

        {/* Bill Info */}
        <div className="px-4 py-3 bg-blue-50 border-b">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-gray-500">Invoice:</span>
              <span className="ml-1 font-medium">{bill.voucher_number || bill.voucherNumber}</span>
            </div>
            <div>
              <span className="text-gray-500">Party:</span>
              <span className="ml-1 font-medium">{bill.party_name || bill.partyName}</span>
            </div>
            <div>
              <span className="text-gray-500">Amount:</span>
              <span className="ml-1 font-bold text-red-600">{formatCurrency(bill.amount)}</span>
            </div>
            <div>
              <span className="text-gray-500">Remaining:</span>
              <span className="ml-1 font-bold text-orange-600">{formatCurrency(remainingAmount)}</span>
            </div>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4">
          {error && (
            <div className="flex items-center p-3 mb-4 bg-red-50 text-red-700 rounded-lg">
              <AlertCircle size={18} className="mr-2 flex-shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex gap-2 mb-4">
            <button
              type="button"
              onClick={setFullPayment}
              className="flex-1 py-2 text-sm border border-green-500 text-green-700 rounded-lg hover:bg-green-50"
            >
              Full Payment
            </button>
            <button
              type="button"
              onClick={clearPayments}
              className="flex-1 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Clear All
            </button>
          </div>

          {/* Payment Modes - 7 fields */}
          <div className="space-y-2 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Payment Breakdown (UDF Fields)
            </label>

            <PaymentInput
              icon={Banknote}
              label="Cash Teller 1"
              field="cashTeller1"
              ledgerName="SFL1"
            />
            <PaymentInput
              icon={Banknote}
              label="Cash Teller 2"
              field="cashTeller2"
              ledgerName="SFL2"
            />
            <PaymentInput
              icon={CreditCard}
              label="Cheque Receipt"
              field="chequeReceipt"
              ledgerName="SFL3"
            />
            <PaymentInput
              icon={FileText}
              label="Q/R Code"
              field="qrCode"
              ledgerName="SFL4"
            />
            <PaymentInput
              icon={Percent}
              label="Discount"
              field="discount"
              ledgerName="SFL5"
            />
            <PaymentInput
              icon={Building2}
              label="Bank Deposit"
              field="bankDeposit"
              ledgerName="SFL6"
            />
            <PaymentInput
              icon={Smartphone}
              label="Esewa"
              field="esewa"
              ledgerName="SFL7"
            />
          </div>

          {/* Summary */}
          <div className="p-3 bg-gray-100 rounded-lg mb-4 space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Bill Amount:</span>
              <span className="font-medium">{formatCurrency(bill.amount)}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Payment:</span>
              <span className={`font-medium ${totalPayment > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                {formatCurrency(totalPayment)}
              </span>
            </div>
            <div className="flex justify-between border-t pt-1 mt-1">
              <span className="font-medium">Balance After:</span>
              <span className={`font-bold ${balanceAfter > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                {formatCurrency(balanceAfter)}
              </span>
            </div>
          </div>

          {/* Voucher Type Preview */}
          {totalPayment > 0 && (
            <div className={`p-3 mb-4 rounded-lg flex items-center gap-2 text-sm ${
              isFullPayment ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
            }`}>
              <CheckCircle size={16} />
              <span>
                Will update to: <strong>{newVoucherType}</strong>
                {isFullPayment ? ' (Full Payment)' : ' (Partial Payment)'}
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`flex-1 py-3 text-white rounded-lg font-medium disabled:opacity-50 ${
                isFullPayment
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-orange-600 hover:bg-orange-700'
              }`}
              disabled={loading || totalPayment <= 0}
            >
              {loading ? 'Processing...' : `Complete (${formatCurrency(totalPayment)})`}
            </button>
          </div>
        </form>

        {/* Info */}
        <div className="px-4 py-3 bg-gray-50 border-t text-xs text-gray-500">
          Payment breakdown saved in UDF fields (SFL1-SFL7) on the voucher.
          Bill type changes to Sales (full) or Credit Sales (partial).
        </div>
      </div>
    </div>
  );
}

export default PaymentModal;
