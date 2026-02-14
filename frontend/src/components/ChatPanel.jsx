/**
 * ChatPanel — Right-side slide panel for Smart Commands + AI Chat
 * Queries Tally data via smart commands (free) and AI chat (optional API key)
 */

import React, { useState, useEffect, useRef } from 'react';
import { getChatStatus, chatQuery, chatMessage } from '../utils/api';

const QUICK_ACTIONS = [
  { command: 'sales-today', label: 'Today Sales', icon: '💰' },
  { command: 'daybook', label: 'Daybook', icon: '📒' },
  { command: 'stock-summary', label: 'Stock', icon: '📦' },
  { command: 'outstanding', label: 'Outstanding', icon: '💳' },
  { command: 'pending-bills', label: 'Pending', icon: '⏳' },
  { command: 'cheques', label: 'Cheques', icon: '🏦' },
  { command: 'dashboard', label: 'Summary', icon: '📊' },
  { command: 'lock-vouchers', label: 'Lock', icon: '🔒', write: true },
  { command: 'unlock-vouchers', label: 'Unlock', icon: '🔓', write: true }
];

/**
 * Format a number in Indian numbering system (1,23,456)
 */
function fmtNum(n) {
  if (n == null || isNaN(n)) return '0';
  const num = Number(n);
  const neg = num < 0;
  const abs = Math.abs(num).toFixed(2);
  const [intPart, dec] = abs.split('.');
  // Indian grouping: last 3, then groups of 2
  let result = '';
  const len = intPart.length;
  if (len <= 3) {
    result = intPart;
  } else {
    result = intPart.slice(-3);
    let rest = intPart.slice(0, -3);
    while (rest.length > 2) {
      result = rest.slice(-2) + ',' + result;
      rest = rest.slice(0, -2);
    }
    if (rest) result = rest + ',' + result;
  }
  return (neg ? '-' : '') + result + (dec && dec !== '00' ? '.' + dec : '');
}

/**
 * Format a command result into display-friendly content
 */
function formatResult(command, data) {
  if (!data) return 'No data available';

  // Dashboard summary
  if (command === 'dashboard' && typeof data === 'object' && !Array.isArray(data)) {
    const lines = [];
    if (data.todaySales != null) lines.push(`Today's Sales: Rs ${fmtNum(data.todaySales)} (${data.todaySalesCount || 0} bills)`);
    if (data.totalBills != null) lines.push(`Total Bills: ${data.totalBills}`);
    if (data.pendingBills != null) lines.push(`Pending: ${data.pendingBills}`);
    if (data.totalParties != null) lines.push(`Parties: ${data.totalParties}`);
    if (data.totalStockItems != null) lines.push(`Stock Items: ${data.totalStockItems}`);
    return lines.join('\n') || JSON.stringify(data, null, 2);
  }

  // Array results (daybook, sales, pending, stock, etc.)
  if (Array.isArray(data)) {
    if (data.length === 0) return 'No records found';

    // Sales / daybook vouchers
    if (data[0]?.party_name && data[0]?.amount != null) {
      const total = data.reduce((s, v) => s + (Number(v.amount) || 0), 0);
      const lines = data.slice(0, 30).map((v, i) =>
        `${i + 1}. ${v.party_name} — Rs ${fmtNum(v.amount)}${v.voucher_number ? ` (${v.voucher_number})` : ''}${v.voucher_type ? ` [${v.voucher_type}]` : ''}`
      );
      let result = lines.join('\n');
      result += `\n\nTotal: Rs ${fmtNum(total)} (${data.length} entries)`;
      if (data.length > 30) result += `\n... showing first 30 of ${data.length}`;
      return result;
    }

    // Stock items
    if (data[0]?.item_name || data[0]?.name) {
      const nameKey = data[0].item_name ? 'item_name' : 'name';
      const lines = data.slice(0, 30).map((item, i) => {
        const qty = item.closing_balance || item.balance || item.quantity || '';
        const val = item.closing_value || item.value || '';
        return `${i + 1}. ${item[nameKey]}${qty ? ` — ${qty}${item.unit ? ' ' + item.unit : ''}` : ''}${val ? ` (Rs ${fmtNum(val)})` : ''}`;
      });
      let result = lines.join('\n');
      if (data.length > 30) result += `\n... showing first 30 of ${data.length}`;
      return result;
    }

    // Cheques
    if (data[0]?.cheque_number != null || data[0]?.cheque_date != null) {
      const lines = data.slice(0, 20).map((c, i) =>
        `${i + 1}. ${c.party_name || 'Unknown'} — Rs ${fmtNum(c.amount)} ${c.cheque_number ? `#${c.cheque_number}` : ''} [${c.status || '?'}]`
      );
      let result = lines.join('\n');
      if (data.length > 20) result += `\n... showing first 20 of ${data.length}`;
      return result;
    }

    // Generic array
    return data.slice(0, 20).map((item, i) => `${i + 1}. ${JSON.stringify(item)}`).join('\n');
  }

  // Lock/unlock result
  if (data.locked != null || data.unlocked != null) {
    const action = data.locked != null ? 'locked' : 'unlocked';
    const count = data.locked || data.unlocked || 0;
    return `${count} vouchers ${action}${data.failed ? `, ${data.failed} failed` : ''} (total: ${data.total})`;
  }

  // Object fallback
  if (typeof data === 'object') {
    return JSON.stringify(data, null, 2);
  }

  return String(data);
}

export default function ChatPanel({ open, onClose }) {
  const [messages, setMessages] = useState([
    { role: 'system', content: 'Welcome! Use the quick buttons above or type a question below.' }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Check AI status on mount
  useEffect(() => {
    getChatStatus().then(r => setAiEnabled(r.data.aiEnabled)).catch(() => {});
  }, []);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input when panel opens
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  /**
   * Execute a smart command
   */
  const runCommand = async (command, params) => {
    const action = QUICK_ACTIONS.find(a => a.command === command);
    setMessages(prev => [...prev, { role: 'user', content: `${action?.icon || '>'} ${action?.label || command}` }]);
    setLoading(true);

    try {
      const res = await chatQuery(command, params);
      const formatted = formatResult(command, res.data.data);
      setMessages(prev => [...prev, { role: 'assistant', content: formatted, label: res.data.label }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', content: `Error: ${err.response?.data?.error || err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Send AI chat message
   */
  const sendMessage = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: msg }]);
    setLoading(true);

    try {
      // Build conversation history for AI
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role, content: m.content }));

      const res = await chatMessage(msg, history);

      if (!res.data.aiEnabled) {
        setMessages(prev => [...prev, { role: 'system', content: res.data.message }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'error', content: `Error: ${err.response?.data?.error || err.message}` }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className={`chat-panel ${open ? 'open' : ''}`}>
      {/* Header */}
      <div className="cp-head">
        <div className="cp-title">
          <span>🤖</span>
          <h3>Tally Assistant</h3>
          {aiEnabled && <span className="cp-ai-badge">AI</span>}
        </div>
        <button className="m-close" onClick={onClose}>✕</button>
      </div>

      {/* Quick Actions */}
      <div className="cp-actions">
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.command}
            className={`cp-action-btn ${action.write ? 'write' : ''}`}
            onClick={() => runCommand(action.command)}
            disabled={loading}
            title={action.label}
          >
            <span>{action.icon}</span>
            <span>{action.label}</span>
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="cp-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`cp-msg cp-msg-${msg.role}`}>
            {msg.label && <div className="cp-msg-label">{msg.label}</div>}
            <pre className="cp-msg-text">{msg.content}</pre>
          </div>
        ))}
        {loading && (
          <div className="cp-msg cp-msg-loading">
            <div className="cp-typing">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="cp-input-area">
        <input
          ref={inputRef}
          className="cp-input"
          placeholder={aiEnabled ? 'Ask anything about your business...' : 'AI not configured — use quick buttons above'}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          className="cp-send"
          onClick={sendMessage}
          disabled={!input.trim() || loading}
        >
          ➤
        </button>
      </div>
    </div>
  );
}
