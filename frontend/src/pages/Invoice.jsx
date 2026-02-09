/**
 * Invoice Creation Page
 * Create Sales invoices and post to Tally
 * Supports offline mode with daily invoice numbering
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2, Send, Package, User, FileText, Wifi, WifiOff, RefreshCw, Clock } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function Invoice() {
  const { t } = useTranslation();
  const [parties, setParties] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [searchParty, setSearchParty] = useState('');
  const [searchStock, setSearchStock] = useState('');
  const [activeSearchRow, setActiveSearchRow] = useState(-1);

  // Tally connection status
  const [tallyStatus, setTallyStatus] = useState({ connected: false, checking: true });
  const [pendingCount, setPendingCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  // Invoice form state
  const [invoice, setInvoice] = useState({
    partyName: '',
    voucherType: 'Sales',
    narration: '',
    items: [{ stockItem: '', quantity: 1, rate: 0, unit: 'Pcs', amount: 0 }]
  });

  // Load parties and stock items on mount
  useEffect(() => {
    loadParties();
    loadStockItems();
    checkTallyStatus();
    loadPendingCount();

    // Check Tally status periodically
    const interval = setInterval(() => {
      checkTallyStatus();
      loadPendingCount();
    }, 30000);

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

  const loadPendingCount = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/pending-invoices/count`);
      const data = await res.json();
      if (data.success) {
        setPendingCount(data.pendingCount);
        setTodayCount(data.todayInvoiceCount);
      }
    } catch (error) {
      console.error('Error loading pending count:', error);
    }
  };

  const syncPendingInvoices = async () => {
    if (!tallyStatus.connected) {
      setMessage({ type: 'error', text: 'Tally is offline. Cannot sync pending invoices.' });
      return;
    }

    setSyncing(true);
    try {
      const res = await fetch(`${API_BASE}/api/pending-invoices/sync`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setMessage({
          type: 'success',
          text: `Sync complete: ${data.synced} synced, ${data.failed} failed`
        });
        loadPendingCount();
      } else {
        setMessage({ type: 'error', text: data.error || 'Sync failed' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSyncing(false);
    }
  };

  const loadParties = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ledgers/debtors`);
      const data = await res.json();
      if (data.success) {
        setParties(data.ledgers);
      }
    } catch (error) {
      console.error('Error loading parties:', error);
    }
  };

  const loadStockItems = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/api/stock`);
      const data = await res.json();
      if (data.success) {
        setStockItems(data.items);
      }
    } catch (error) {
      console.error('Error loading stock items:', error);
    } finally {
      setLoading(false);
    }
  };

  // Filter parties by search
  const filteredParties = parties.filter(p =>
    p.name.toLowerCase().includes(searchParty.toLowerCase())
  );

  // Filter stock items by search - returns filtered list for a given search term
  const getFilteredStockItems = (searchTerm) => {
    if (!searchTerm) return [];
    return stockItems.filter(s =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  // Add new line item
  const addItem = () => {
    setInvoice(prev => ({
      ...prev,
      items: [...prev.items, { stockItem: '', quantity: 1, rate: 0, unit: 'Pcs', amount: 0 }]
    }));
  };

  // Remove line item
  const removeItem = (index) => {
    if (invoice.items.length > 1) {
      setInvoice(prev => ({
        ...prev,
        items: prev.items.filter((_, i) => i !== index)
      }));
    }
  };

  // Update line item
  const updateItem = (index, field, value) => {
    setInvoice(prev => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };

      // Auto-calculate amount
      if (field === 'quantity' || field === 'rate') {
        const qty = field === 'quantity' ? parseFloat(value) || 0 : parseFloat(newItems[index].quantity) || 0;
        const rate = field === 'rate' ? parseFloat(value) || 0 : parseFloat(newItems[index].rate) || 0;
        newItems[index].amount = qty * rate;
      }

      return { ...prev, items: newItems };
    });
  };

  // Select stock item from dropdown
  const selectStockItem = (index, stockItem) => {
    setInvoice(prev => {
      const newItems = [...prev.items];
      newItems[index] = {
        ...newItems[index],
        stockItem: stockItem.name,
        unit: stockItem.base_units || stockItem.baseUnits || 'Pcs',
        rate: stockItem.selling_price || stockItem.closing_rate || stockItem.closingRate || 0
      };
      // Recalculate amount
      newItems[index].amount = newItems[index].quantity * newItems[index].rate;
      return { ...prev, items: newItems };
    });
    setSearchStock('');
    setActiveSearchRow(-1);
  };

  // Calculate total
  const totalAmount = invoice.items.reduce((sum, item) => sum + (item.amount || 0), 0);

  // Submit invoice to Tally
  const submitInvoice = async () => {
    if (!invoice.partyName) {
      setMessage({ type: 'error', text: 'Please select a party' });
      return;
    }

    const validItems = invoice.items.filter(item => item.stockItem && item.quantity > 0 && item.rate > 0);
    if (validItems.length === 0) {
      setMessage({ type: 'error', text: 'Please add at least one valid item' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/api/invoice`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partyName: invoice.partyName,
          voucherType: invoice.voucherType,
          narration: invoice.narration,
          items: validItems
        })
      });

      const data = await res.json();

      if (data.success) {
        // Different message based on online/offline mode
        if (data.mode === 'online') {
          setMessage({
            type: 'success',
            text: 'Invoice created successfully in Tally!'
          });
        } else {
          setMessage({
            type: 'warning',
            text: `Invoice saved locally as ${data.invoiceNumber}. Will sync when Tally is online.`,
            invoiceNumber: data.invoiceNumber
          });
          loadPendingCount();
        }
        // Reset form
        setInvoice({
          partyName: '',
          voucherType: 'Sales',
          narration: '',
          items: [{ stockItem: '', quantity: 1, rate: 0, unit: 'Pcs', amount: 0 }]
        });
        setSearchParty('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to create invoice' });
      }
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Header with Tally Status */}
      <div className="flex flex-wrap items-center justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText size={28} />
          {t('createInvoice', 'Create Invoice')}
        </h1>

        {/* Tally Connection Status */}
        <div className="flex items-center gap-4">
          {/* Today's Invoice Count */}
          {todayCount > 0 && (
            <div className="text-sm text-gray-600">
              Today: <strong>{todayCount}</strong> invoices
            </div>
          )}

          {/* Pending Invoices Badge */}
          {pendingCount > 0 && (
            <div className="flex items-center gap-2">
              <span className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm flex items-center gap-1">
                <Clock size={14} />
                {pendingCount} pending
              </span>
              <button
                onClick={syncPendingInvoices}
                disabled={syncing || !tallyStatus.connected}
                className={`p-2 rounded-lg ${
                  syncing || !tallyStatus.connected
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                }`}
                title={tallyStatus.connected ? 'Sync pending invoices' : 'Tally offline'}
              >
                <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
              </button>
            </div>
          )}

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
      </div>

      {/* Message */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg ${
          message.type === 'success' ? 'bg-green-100 text-green-800' :
          message.type === 'warning' ? 'bg-orange-100 text-orange-800' :
          'bg-red-100 text-red-800'
        }`}>
          {message.text}
          {message.invoiceNumber && (
            <div className="mt-1 font-mono text-sm">
              Invoice #: <strong>{message.invoiceNumber}</strong>
            </div>
          )}
        </div>
      )}

      {/* Offline Mode Banner */}
      {!tallyStatus.checking && !tallyStatus.connected && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-sm">
          <strong>Offline Mode:</strong> Invoices will be saved locally with number format DB-YYYYMMDD-NNN and will sync automatically when Tally is back online.
        </div>
      )}

      {/* Invoice Form */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">

        {/* Party Selection */}
        <div className="mb-6">
          <label className="block font-medium mb-2 flex items-center gap-2">
            <User size={18} />
            {t('party', 'Party / Customer')}
          </label>
          <div className="relative">
            <input
              type="text"
              value={invoice.partyName || searchParty}
              onChange={(e) => {
                setSearchParty(e.target.value);
                setInvoice(prev => ({ ...prev, partyName: '' }));
              }}
              placeholder="Search party..."
              className="w-full p-3 border rounded-lg"
            />
            {searchParty && !invoice.partyName && (
              <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {filteredParties.slice(0, 20).map((party, idx) => (
                  <div
                    key={idx}
                    onClick={() => {
                      setInvoice(prev => ({ ...prev, partyName: party.name }));
                      setSearchParty('');
                    }}
                    className="p-3 hover:bg-blue-50 cursor-pointer border-b"
                  >
                    <div className="font-medium">{party.name}</div>
                    <div className="text-sm text-gray-500">
                      Balance: Rs {party.balance?.toLocaleString() || 0}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {invoice.partyName && (
            <div className="mt-2 p-2 bg-blue-50 rounded text-blue-800">
              Selected: <strong>{invoice.partyName}</strong>
            </div>
          )}
        </div>

        {/* Voucher Type */}
        <div className="mb-6">
          <label className="block font-medium mb-2">{t('voucherType', 'Voucher Type')}</label>
          <select
            value={invoice.voucherType}
            onChange={(e) => setInvoice(prev => ({ ...prev, voucherType: e.target.value }))}
            className="w-full p-3 border rounded-lg"
          >
            <option value="Sales">Sales</option>
            <option value="Credit Sales">Credit Sales</option>
            <option value="Pending Sales Bill">Pending Sales Bill</option>
          </select>
        </div>

        {/* Line Items */}
        <div className="mb-6">
          <label className="block font-medium mb-2 flex items-center gap-2">
            <Package size={18} />
            {t('items', 'Items')}
          </label>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 text-left border">Item</th>
                  <th className="p-2 text-center border w-24">Qty</th>
                  <th className="p-2 text-center border w-24">Rate</th>
                  <th className="p-2 text-center border w-24">Unit</th>
                  <th className="p-2 text-right border w-32">Amount</th>
                  <th className="p-2 border w-16"></th>
                </tr>
              </thead>
              <tbody>
                {invoice.items.map((item, index) => (
                  <tr key={index} className="border-b">
                    <td className="p-2 border">
                      <div className="relative">
                        <input
                          type="text"
                          value={item.stockItem || ''}
                          onChange={(e) => {
                            updateItem(index, 'stockItem', e.target.value);
                            setSearchStock(e.target.value);
                            setActiveSearchRow(index);
                          }}
                          onFocus={() => setActiveSearchRow(index)}
                          onBlur={() => setTimeout(() => setActiveSearchRow(-1), 200)}
                          placeholder="Search item..."
                          className="w-full p-2 border rounded"
                        />
                        {activeSearchRow === index && item.stockItem && getFilteredStockItems(item.stockItem).length > 0 && (
                          <div className="absolute z-10 w-full bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                            {getFilteredStockItems(item.stockItem).slice(0, 15).map((stock, idx) => (
                              <div
                                key={idx}
                                onClick={() => selectStockItem(index, stock)}
                                className="p-2 hover:bg-blue-50 cursor-pointer border-b text-sm"
                              >
                                <div className="font-medium">{stock.name}</div>
                                <div className="text-gray-500">
                                  Stock: {stock.closing_balance || stock.closingBalance || 0} {stock.base_units || stock.baseUnits || 'Pcs'} | Rate: {stock.selling_price || stock.closing_rate || stock.closingRate || 0}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-2 border">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(index, 'quantity', e.target.value)}
                        min="1"
                        className="w-full p-2 border rounded text-center"
                      />
                    </td>
                    <td className="p-2 border">
                      <input
                        type="number"
                        value={item.rate}
                        onChange={(e) => updateItem(index, 'rate', e.target.value)}
                        min="0"
                        className="w-full p-2 border rounded text-center"
                      />
                    </td>
                    <td className="p-2 border">
                      <input
                        type="text"
                        value={item.unit}
                        onChange={(e) => updateItem(index, 'unit', e.target.value)}
                        className="w-full p-2 border rounded text-center"
                      />
                    </td>
                    <td className="p-2 border text-right font-medium">
                      Rs {item.amount?.toLocaleString() || 0}
                    </td>
                    <td className="p-2 border text-center">
                      <button
                        onClick={() => removeItem(index)}
                        className="text-red-500 hover:text-red-700"
                        disabled={invoice.items.length === 1}
                      >
                        <Trash2 size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold">
                  <td colSpan="4" className="p-3 text-right border">Total:</td>
                  <td className="p-3 text-right border">Rs {totalAmount.toLocaleString()}</td>
                  <td className="border"></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <button
            onClick={addItem}
            className="mt-3 flex items-center gap-2 text-blue-600 hover:text-blue-800"
          >
            <Plus size={18} />
            Add Item
          </button>
        </div>

        {/* Narration */}
        <div className="mb-6">
          <label className="block font-medium mb-2">{t('narration', 'Narration')}</label>
          <textarea
            value={invoice.narration}
            onChange={(e) => setInvoice(prev => ({ ...prev, narration: e.target.value }))}
            placeholder="Optional notes..."
            rows={2}
            className="w-full p-3 border rounded-lg"
          />
        </div>

        {/* Submit Button */}
        <button
          onClick={submitInvoice}
          disabled={submitting || !invoice.partyName}
          className={`w-full p-4 rounded-lg flex items-center justify-center gap-2 text-white font-medium ${
            submitting || !invoice.partyName
              ? 'bg-gray-400 cursor-not-allowed'
              : tallyStatus.connected
                ? 'bg-green-600 hover:bg-green-700'
                : 'bg-orange-500 hover:bg-orange-600'
          }`}
        >
          <Send size={20} />
          {submitting
            ? 'Creating Invoice...'
            : tallyStatus.connected
              ? 'Create Invoice in Tally'
              : 'Save Invoice (Offline Mode)'}
        </button>
      </div>

      {/* Quick Info */}
      <div className="bg-yellow-50 p-4 rounded-lg text-sm text-yellow-800">
        <strong>Note:</strong> {tallyStatus.connected
          ? 'Invoice will be created directly in Tally.'
          : 'Invoice will be saved locally and synced when Tally is online.'
        } Make sure:
        <ul className="list-disc ml-5 mt-2">
          <li>Party exists in Tally as Sundry Debtor</li>
          <li>Stock items exist in Tally inventory</li>
          <li>Sales Account ledger exists</li>
        </ul>
      </div>
    </div>
  );
}
