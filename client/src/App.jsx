import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  FileText,
  BookOpen,
  Package,
  Settings,
  Bell,
  Wifi,
  WifiOff,
  RefreshCw,
  Menu,
  X,
  FilePlus,
  Receipt,
  CreditCard,
  Wallet
} from 'lucide-react';

import socket from './utils/socket';
import { getSyncStatus, getNotifications } from './utils/api';

// Import pages
import Dashboard from './pages/Dashboard';
import Bills from './pages/Bills';
import Daybook from './pages/Daybook';
import Sacks from './pages/Sacks';
import SettingsPage from './pages/Settings';
import Invoice from './pages/Invoice';
import ReceiptPage from './pages/Receipt';
import NewDashboard from './pages/NewDashboard';
import Fonepay from './pages/Fonepay';

function App() {
  const { t, i18n } = useTranslation();
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [isSimpleMode, setIsSimpleMode] = useState(true);
  const [syncStatus, setSyncStatus] = useState({ isRunning: false, sync_status: 'idle' });
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Fetch initial data
  useEffect(() => {
    fetchSyncStatus();
    fetchNotifications();

    // Socket listeners
    socket.on('sync:status', (status) => setSyncStatus(status));
    socket.on('sync:update', () => fetchSyncStatus());
    socket.on('bill:new', handleNewBill);
    socket.on('payment:created', handlePaymentCreated);

    return () => {
      socket.off('sync:status');
      socket.off('sync:update');
      socket.off('bill:new');
      socket.off('payment:created');
    };
  }, []);

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
      const { data } = await getNotifications(1); // TODO: Get from auth
      setNotifications(data);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  };

  const handleNewBill = (bill) => {
    // Show notification
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(t('notifications.newBill'), {
        body: `${bill.voucherNumber} - ${bill.partyName} - ₹${bill.amount.toLocaleString()}`
      });
    }
    fetchNotifications();
  };

  const handlePaymentCreated = (payment) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(t('notifications.paymentReceived'), {
        body: `₹${payment.amount.toLocaleString()} from ${payment.partyName}`
      });
    }
    fetchNotifications();
  };

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'ne' : 'en';
    i18n.changeLanguage(newLang);
    localStorage.setItem('language', newLang);
  };

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: t('nav.dashboard') },
    { id: 'newdashboard', icon: CreditCard, label: t('nav.newdashboard', 'Payment Board') },
    { id: 'fonepay', icon: Wallet, label: 'Fonepay' },
    { id: 'invoice', icon: FilePlus, label: t('nav.invoice', 'Create Invoice') },
    { id: 'receipt', icon: Receipt, label: t('nav.receipt', 'Receipt') },
    { id: 'bills', icon: FileText, label: t('nav.bills') },
    { id: 'daybook', icon: BookOpen, label: t('nav.daybook') },
    { id: 'sacks', icon: Package, label: t('nav.sacks') },
    { id: 'settings', icon: Settings, label: t('nav.settings') }
  ];

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard isSimpleMode={isSimpleMode} />;
      case 'newdashboard':
        return <NewDashboard />;
      case 'fonepay':
        return <Fonepay />;
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo & Title */}
            <div className="flex items-center">
              <button
                className="md:hidden mr-3 p-2 rounded-lg hover:bg-gray-100"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{t('app.title')}</h1>
                <p className="text-xs text-gray-500 hidden sm:block">{t('app.subtitle')}</p>
              </div>
            </div>

            {/* Right side controls */}
            <div className="flex items-center space-x-3">
              {/* Sync Status */}
              <div className={`flex items-center space-x-1 px-3 py-1 rounded-full text-sm ${
                isConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
              }`}>
                {isSyncing ? (
                  <RefreshCw size={16} className="animate-spin" />
                ) : isConnected ? (
                  <Wifi size={16} />
                ) : (
                  <WifiOff size={16} />
                )}
                <span className="hidden sm:inline">
                  {isSyncing ? t('sync.syncing') : isConnected ? t('sync.connected') : t('sync.disconnected')}
                </span>
              </div>

              {/* Mode Toggle */}
              <button
                onClick={() => setIsSimpleMode(!isSimpleMode)}
                className="px-3 py-1 rounded-full text-sm border border-gray-300 hover:bg-gray-50"
              >
                {isSimpleMode ? 'Simple' : 'Advanced'}
              </button>

              {/* Language Toggle */}
              <button
                onClick={toggleLanguage}
                className="px-3 py-1 rounded-full text-sm border border-gray-300 hover:bg-gray-50"
              >
                {i18n.language === 'en' ? 'ने' : 'EN'}
              </button>

              {/* Notifications */}
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="relative p-2 rounded-lg hover:bg-gray-100"
                >
                  <Bell size={20} />
                  {notifications.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                      {notifications.length}
                    </span>
                  )}
                </button>

                {/* Notifications dropdown */}
                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
                    <div className="p-3 border-b border-gray-200 font-medium">
                      Notifications
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {notifications.length === 0 ? (
                        <div className="p-4 text-center text-gray-500">
                          No new notifications
                        </div>
                      ) : (
                        notifications.map((notif) => (
                          <div key={notif.id} className="p-3 border-b border-gray-100 hover:bg-gray-50">
                            <div className="font-medium text-sm">{notif.title}</div>
                            <div className="text-sm text-gray-600">{notif.message}</div>
                            <div className="text-xs text-gray-400 mt-1">
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

      <div className="flex">
        {/* Sidebar - Desktop */}
        <nav className="hidden md:flex flex-col w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-4rem)]">
          <div className="flex-1 px-4 py-6 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`w-full flex items-center px-4 py-3 rounded-lg text-left transition-colors ${
                  currentPage === item.id
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <item.icon size={20} className="mr-3" />
                {item.label}
              </button>
            ))}
          </div>
        </nav>

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div className="fixed inset-0 bg-black bg-opacity-25" onClick={() => setMobileMenuOpen(false)} />
            <nav className="fixed top-16 left-0 bottom-0 w-64 bg-white shadow-lg z-50">
              <div className="px-4 py-6 space-y-1">
                {navItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setCurrentPage(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center px-4 py-3 rounded-lg text-left transition-colors ${
                      currentPage === item.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <item.icon size={20} className="mr-3" />
                    {item.label}
                  </button>
                ))}
              </div>
            </nav>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}

export default App;
