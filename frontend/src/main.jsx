import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './utils/i18n';
import './index.css';

// Auto-send browser errors to backend log file
const sendError = (message, stack, url) => {
  try {
    navigator.sendBeacon('/api/log/error', JSON.stringify({
      message, stack, url: url || window.location.href,
      timestamp: new Date().toISOString()
    }));
  } catch {}
};

window.onerror = (msg, source, line, col, error) => {
  sendError(`${msg} (${source}:${line}:${col})`, error?.stack || '', source);
};

window.onunhandledrejection = (event) => {
  const err = event.reason;
  sendError(
    err?.message || String(err),
    err?.stack || '',
    ''
  );
};

// Patch console.error to also log to file
const origError = console.error;
console.error = (...args) => {
  origError.apply(console, args);
  const msg = args.map(a => {
    if (a instanceof Error) return `${a.message}\n${a.stack}`;
    if (typeof a === 'object') try { return JSON.stringify(a); } catch { return String(a); }
    return String(a);
  }).join(' ');
  sendError(msg, '', '');
};

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
