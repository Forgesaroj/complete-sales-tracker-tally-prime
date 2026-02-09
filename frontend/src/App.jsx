import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import socket from './utils/socket';
import { getSyncStatus, getNotifications } from './utils/api';

// Import Rush Dashboard (new dark theme)
import RushDashboard from './pages/RushDashboard';

// Import archived/legacy pages (accessible via settings or direct navigation)
import Dashboard from './pages/Dashboard';
import Bills from './pages/Bills';
import Daybook from './pages/Daybook';
import Sacks from './pages/Sacks';
import SettingsPage from './pages/Settings';
import Invoice from './pages/Invoice';
import ReceiptPage from './pages/Receipt';
import NewDashboard from './pages/NewDashboard';
import Fonepay from './pages/Fonepay';
import RBBBanking from './pages/RBBBanking';

function App() {
  const { i18n, t } = useTranslation();

  // Check for legacy mode from localStorage
  const [useLegacyUI, setUseLegacyUI] = useState(() => {
    return localStorage.getItem('useLegacyUI') === 'true';
  });

  // Legacy UI state
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isSimpleMode, setIsSimpleMode] = useState(true);
  const [syncStatus, setSyncStatus] = useState({ isRunning: false, sync_status: 'idle' });
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Load language preference
  useEffect(() => {
    const savedLang = localStorage.getItem('language');
    if (savedLang) {
      i18n.changeLanguage(savedLang);
    }
  }, []);

  // Fetch initial data for legacy mode
  useEffect(() => {
    if (!useLegacyUI) return;

    fetchSyncStatus();
    fetchNotifications();

    socket.on('sync:status', (status) => setSyncStatus(status));
    socket.on('sync:update', () => fetchSyncStatus());

    return () => {
      socket.off('sync:status');
      socket.off('sync:update');
    };
  }, [useLegacyUI]);

  const fetchSyncStatus = async () => {
    try {
      const { data } = await getSyncStatus();
      setSyncStatus(data);
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const { data } = await getNotifications(1);
      setNotifications(data);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  // Toggle between Rush (dark) and Legacy (light) UI
  const toggleUIMode = () => {
    const newValue = !useLegacyUI;
    setUseLegacyUI(newValue);
    localStorage.setItem('useLegacyUI', newValue.toString());
  };

  // Use new Rush Dashboard by default
  if (!useLegacyUI) {
    return <RushDashboard onSwitchToLegacy={toggleUIMode} />;
  }

  // Legacy UI (original light theme)
  const navItems = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'newdashboard', label: 'Payment Board' },
    { id: 'fonepay', label: 'Fonepay' },
    { id: 'rbb', label: 'RBB Banking' },
    { id: 'invoice', label: 'Create Invoice' },
    { id: 'receipt', label: 'Receipt' },
    { id: 'bills', label: 'Bills' },
    { id: 'daybook', label: 'Daybook' },
    { id: 'sacks', label: 'Sacks' },
    { id: 'settings', label: 'Settings' }
  ];

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard isSimpleMode={isSimpleMode} />;
      case 'newdashboard':
        return <NewDashboard />;
      case 'fonepay':
        return <Fonepay />;
      case 'rbb':
        return <RBBBanking />;
      case 'invoice':
        return <Invoice />;
      case 'receipt':
        return <ReceiptPage />;
      case 'bills':
        return <Bills isSimpleMode={isSimpleMode} />;
      case 'daybook':
        return <Daybook />;
      case 'sacks':
        return <Sacks />;
      case 'settings':
        return <SettingsPage />;
      default:
        return <Dashboard isSimpleMode={isSimpleMode} />;
    }
  };

  const isSyncing = syncStatus.sync_status === 'syncing';
  const isConnected = syncStatus.isRunning && syncStatus.sync_status !== 'error';

  return (
    <div className="min-h-screen" style={{ background: '#f5f5f5' }}>
      {/* Header */}
      <header style={{
        background: '#fff',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '0 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: '64px' }}>
            {/* Logo & Title */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <button
                style={{
                  display: 'none',
                  marginRight: '12px',
                  padding: '8px',
                  borderRadius: '8px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer'
                }}
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                ☰
              </button>
              <div>
                <h1 style={{ fontSize: '20px', fontWeight: 'bold', color: '#111' }}>Tally Dashboard</h1>
                <p style={{ fontSize: '12px', color: '#666' }}>Legacy UI</p>
              </div>
            </div>

            {/* Right side controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {/* Switch to Rush UI */}
              <button
                onClick={toggleUIMode}
                style={{
                  padding: '6px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  border: '1px solid #3b82f6',
                  background: '#eff6ff',
                  color: '#3b82f6',
                  cursor: 'pointer'
                }}
              >
                Switch to Dark Theme
              </button>

              {/* Sync Status */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 12px',
                borderRadius: '20px',
                fontSize: '14px',
                background: isConnected ? '#dcfce7' : '#fee2e2',
                color: isConnected ? '#16a34a' : '#dc2626'
              }}>
                <span>{isSyncing ? '⟳' : isConnected ? '●' : '○'}</span>
                <span>{isSyncing ? 'Syncing' : isConnected ? 'Connected' : 'Disconnected'}</span>
              </div>

              {/* Mode Toggle */}
              <button
                onClick={() => setIsSimpleMode(!isSimpleMode)}
                style={{
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '14px',
                  border: '1px solid #d1d5db',
                  background: '#fff',
                  cursor: 'pointer'
                }}
              >
                {isSimpleMode ? 'Simple' : 'Advanced'}
              </button>

              {/* Notifications */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  style={{
                    position: 'relative',
                    padding: '8px',
                    borderRadius: '8px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: '18px'
                  }}
                >
                  🔔
                  {notifications.length > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      background: '#ef4444',
                      color: '#fff',
                      fontSize: '10px',
                      borderRadius: '50%',
                      width: '18px',
                      height: '18px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {notifications.length}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div style={{
                    position: 'absolute',
                    right: 0,
                    marginTop: '8px',
                    width: '320px',
                    background: '#fff',
                    borderRadius: '8px',
                    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
                    border: '1px solid #e5e7eb',
                    zIndex: 50
                  }}>
                    <div style={{ padding: '12px', borderBottom: '1px solid #e5e7eb', fontWeight: '500' }}>
                      Notifications
                    </div>
                    <div style={{ maxHeight: '256px', overflowY: 'auto' }}>
                      {notifications.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#666' }}>
                          No new notifications
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <div key={notif.id} style={{
                            padding: '12px',
                            borderBottom: '1px solid #f3f4f6',
                            cursor: 'pointer'
                          }}>
                            <div style={{ fontWeight: '500', fontSize: '14px' }}>{notif.title}</div>
                            <div style={{ fontSize: '14px', color: '#666' }}>{notif.message}</div>
                            <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                              {new Date(notif.created_at).toLocaleTimeString()}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      <div style={{ display: 'flex' }}>
        {/* Sidebar - Desktop */}
        <nav style={{
          display: 'flex',
          flexDirection: 'column',
          width: '256px',
          background: '#fff',
          borderRight: '1px solid #e5e7eb',
          minHeight: 'calc(100vh - 64px)'
        }}>
          <div style={{ flex: 1, padding: '24px 16px' }}>
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  padding: '12px 16px',
                  borderRadius: '8px',
                  textAlign: 'left',
                  border: 'none',
                  cursor: 'pointer',
                  marginBottom: '4px',
                  background: currentPage === item.id ? '#eff6ff' : 'transparent',
                  color: currentPage === item.id ? '#3b82f6' : '#374151'
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Main Content */}
        <main style={{ flex: 1, padding: '24px' }}>
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default App;
