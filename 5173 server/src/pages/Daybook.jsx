import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Calendar, Filter, Download } from 'lucide-react';
import { getDaybook, getPartySummary, getVoucherTypes } from '../utils/api';

function Daybook() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState([]);
  const [totals, setTotals] = useState({ debit: 0, credit: 0, balance: 0 });
  const [partySummary, setPartySummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(getTodayDate());
  const [voucherTypes, setVoucherTypes] = useState({ sales: [], receipt: [] });
  const [selectedTypes, setSelectedTypes] = useState([]);
  const [viewMode, setViewMode] = useState('daybook'); // 'daybook' or 'partySummary'

  function getTodayDate() {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatDateForInput(tallyDate) {
    if (tallyDate.length !== 8) return '';
    return `${tallyDate.slice(0, 4)}-${tallyDate.slice(4, 6)}-${tallyDate.slice(6, 8)}`;
  }

  function formatDateFromInput(inputDate) {
    return inputDate.replace(/-/g, '');
  }

  useEffect(() => {
    fetchVoucherTypes();
  }, []);

  useEffect(() => {
    fetchData();
  }, [date, selectedTypes, viewMode]);

  const fetchVoucherTypes = async () => {
    try {
      const { data } = await getVoucherTypes();
      setVoucherTypes(data);
    } catch (error) {
      console.error('Failed to fetch voucher types:', error);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      if (viewMode === 'daybook') {
        const params = { date };
        if (selectedTypes.length > 0) {
          params.voucherTypes = selectedTypes.join(',');
        }
        const { data } = await getDaybook(params);
        setEntries(data.entries || []);
        setTotals(data.totals || { debit: 0, credit: 0, balance: 0 });
      } else {
        const { data } = await getPartySummary({ fromDate: date, toDate: date });
        setPartySummary(data);
      }
    } catch (error) {
      console.error('Failed to fetch daybook:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return `₹${Math.abs(amount || 0).toLocaleString('en-IN')}`;
  };

  const handleTypeToggle = (type) => {
    setSelectedTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const allTypes = [...voucherTypes.sales, ...voucherTypes.receipt];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl font-bold">{t('daybook.title')}</h1>

        <div className="flex flex-wrap gap-3">
          {/* Date picker */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="date"
              value={formatDateForInput(date)}
              onChange={(e) => setDate(formatDateFromInput(e.target.value))}
              className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
            />
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden">
            <button
              onClick={() => setViewMode('daybook')}
              className={`px-4 py-2 text-sm ${viewMode === 'daybook' ? 'bg-blue-600 text-white' : 'bg-white'}`}
            >
              {t('daybook.title')}
            </button>
            <button
              onClick={() => setViewMode('partySummary')}
              className={`px-4 py-2 text-sm ${viewMode === 'partySummary' ? 'bg-blue-600 text-white' : 'bg-white'}`}
            >
              {t('daybook.partySummary')}
            </button>
          </div>
        </div>
      </div>

      {/* Voucher Type Filters */}
      {viewMode === 'daybook' && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-gray-500 mr-2">
              <Filter size={16} className="inline mr-1" />
              {t('daybook.filterByType')}:
            </span>
            {allTypes.map((type) => (
              <button
                key={type}
                onClick={() => handleTypeToggle(type)}
                className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                  selectedTypes.includes(type)
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white border-gray-300 hover:border-blue-400'
                }`}
              >
                {type}
              </button>
            ))}
            {selectedTypes.length > 0 && (
              <button
                onClick={() => setSelectedTypes([])}
                className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {/* Daybook Table */}
      {viewMode === 'daybook' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('bills.invoiceNo')}</th>
                  <th>{t('daybook.voucherType')}</th>
                  <th>{t('daybook.partyName')}</th>
                  <th className="text-right">{t('daybook.debit')}</th>
                  <th className="text-right">{t('daybook.credit')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="text-center py-8 text-gray-500">
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : entries.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-8 text-gray-500">
                      {t('common.noData')}
                    </td>
                  </tr>
                ) : (
                  entries.map((entry, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="text-gray-500">{idx + 1}</td>
                      <td className="font-medium">{entry.voucher_number}</td>
                      <td className="text-sm text-gray-500">{entry.voucher_type}</td>
                      <td>{entry.party_name}</td>
                      <td className="text-right font-medium text-red-600">
                        {entry.debit > 0 ? formatCurrency(entry.debit) : '-'}
                      </td>
                      <td className="text-right font-medium text-green-600">
                        {entry.credit > 0 ? formatCurrency(entry.credit) : '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {entries.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 font-bold">
                    <td colSpan="4" className="text-right">{t('daybook.total')}:</td>
                    <td className="text-right text-red-600">{formatCurrency(totals.debit)}</td>
                    <td className="text-right text-green-600">{formatCurrency(totals.credit)}</td>
                  </tr>
                  <tr className="bg-blue-50 font-bold">
                    <td colSpan="4" className="text-right">{t('daybook.balance')}:</td>
                    <td colSpan="2" className={`text-right ${totals.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(totals.balance)} {totals.balance > 0 ? 'Dr' : 'Cr'}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {/* Party Summary Table */}
      {viewMode === 'partySummary' && (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('daybook.partyName')}</th>
                  <th className="text-right">{t('daybook.debit')}</th>
                  <th className="text-right">{t('daybook.credit')}</th>
                  <th className="text-right">{t('daybook.balance')}</th>
                  <th>{t('bills.status')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" className="text-center py-8 text-gray-500">
                      {t('common.loading')}
                    </td>
                  </tr>
                ) : partySummary.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="text-center py-8 text-gray-500">
                      {t('common.noData')}
                    </td>
                  </tr>
                ) : (
                  partySummary.map((party, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="text-gray-500">{idx + 1}</td>
                      <td className="font-medium">{party.party_name}</td>
                      <td className="text-right font-medium text-red-600">
                        {formatCurrency(party.total_debit)}
                      </td>
                      <td className="text-right font-medium text-green-600">
                        {formatCurrency(party.total_credit)}
                      </td>
                      <td className={`text-right font-bold ${party.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(party.balance)} {party.balance > 0 ? 'Dr' : 'Cr'}
                      </td>
                      <td>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                          party.status === 'cleared'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {party.status === 'cleared' ? '✓ Cleared' : '⏳ Pending'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default Daybook;
