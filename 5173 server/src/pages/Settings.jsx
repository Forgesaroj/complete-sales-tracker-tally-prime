import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  User,
  Bell,
  Wifi,
  RefreshCw,
  Check,
  X,
  Plus,
  Globe,
  Calendar
} from 'lucide-react';
import { getUsers, createUser, updateUserNotifications, getTallyStatus, triggerSync, getCompanies, setActiveCompany, syncDateRange } from '../utils/api';

function SettingsPage() {
  const { t, i18n } = useTranslation();
  const [activeTab, setActiveTab] = useState('tally');
  const [tallyStatus, setTallyStatus] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [tallyRes, usersRes] = await Promise.all([
        getTallyStatus(),
        getUsers()
      ]);
      setTallyStatus(tallyRes.data);
      setUsers(usersRes.data);
    } catch (error) {
      console.error('Failed to fetch settings data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    try {
      await triggerSync();
      fetchData();
    } catch (error) {
      console.error('Sync failed:', error);
    }
  };

  const tabs = [
    { id: 'tally', label: 'Tally Connection', icon: Wifi },
    { id: 'users', label: 'Users', icon: User },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'language', label: 'Language', icon: Globe }
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('nav.settings')}</h1>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Tabs */}
        <div className="md:w-64 space-y-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center px-4 py-3 rounded-lg text-left transition-colors ${
                activeTab === tab.id
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <tab.icon size={20} className="mr-3" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1">
          {activeTab === 'tally' && (
            <TallySettings
              status={tallyStatus}
              onRefresh={fetchData}
              onSync={handleManualSync}
            />
          )}

          {activeTab === 'users' && (
            <UserSettings
              users={users}
              showAddUser={showAddUser}
              setShowAddUser={setShowAddUser}
              onRefresh={fetchData}
            />
          )}

          {activeTab === 'notifications' && (
            <NotificationSettings users={users} onUpdate={fetchData} />
          )}

          {activeTab === 'language' && (
            <LanguageSettings />
          )}
        </div>
      </div>
    </div>
  );
}

// Tally Settings Component
function TallySettings({ status, onRefresh, onSync }) {
  const isConnected = status?.connected;
  const [companies, setCompanies] = useState([]);
  const [activeCompany, setActiveCompanyState] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (isConnected) {
      fetchCompanies();
    }
  }, [isConnected]);

  const fetchCompanies = async () => {
    try {
      const { data } = await getCompanies();
      setCompanies(data.companies || []);
      setActiveCompanyState(data.activeCompany || '');
    } catch (error) {
      console.error('Failed to fetch companies:', error);
    }
  };

  const handleCompanyChange = async (companyName) => {
    setLoading(true);
    setMessage('');
    try {
      await setActiveCompany(companyName);
      setActiveCompanyState(companyName);
      setMessage(`Switched to "${companyName}". Syncing data...`);

      // Trigger sync after company change
      await onSync();
      setMessage(`Successfully switched to "${companyName}"`);
    } catch (error) {
      setMessage('Failed to switch company: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">Tally Prime Connection</div>
      <div className="card-body space-y-4">
        {/* Connection Status */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-3 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <div>
              <div className="font-medium">
                {isConnected ? 'Connected to Tally Prime' : 'Disconnected'}
              </div>
              {!isConnected && status?.error && (
                <div className="text-sm text-red-600">{status.error}</div>
              )}
            </div>
          </div>
          <button onClick={onRefresh} className="btn btn-outline">
            <RefreshCw size={18} />
          </button>
        </div>

        {/* Company Selection */}
        {isConnected && companies.length > 0 && (
          <div>
            <h4 className="font-medium mb-2">Select Company:</h4>
            <div className="space-y-2">
              {companies.map((company, idx) => {
                const companyName = typeof company === 'string' ? company : company.NAME || String(company);
                const isActive = companyName === activeCompany;

                return (
                  <button
                    key={idx}
                    onClick={() => !isActive && handleCompanyChange(companyName)}
                    disabled={loading}
                    className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-colors ${
                      isActive
                        ? 'border-green-500 bg-green-50'
                        : 'border-gray-200 hover:border-blue-400 cursor-pointer'
                    }`}
                  >
                    <span className="font-medium">{companyName}</span>
                    {isActive && (
                      <span className="flex items-center text-green-600">
                        <Check size={18} className="mr-1" />
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            {message && (
              <div className={`mt-3 p-3 rounded-lg text-sm ${
                message.includes('Failed') ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
              }`}>
                {message}
              </div>
            )}
          </div>
        )}

        {isConnected && companies.length === 0 && (
          <div className="p-4 bg-yellow-50 text-yellow-700 rounded-lg">
            No companies found. Make sure a company is open in Tally.
          </div>
        )}

        {/* Incremental Sync */}
        <div className="pt-4 border-t">
          <h4 className="font-medium mb-2">Sync New Vouchers:</h4>
          <button onClick={onSync} disabled={loading} className="btn btn-primary w-full">
            <RefreshCw size={18} className={`mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Syncing...' : 'Sync New Vouchers'}
          </button>
          <p className="text-xs text-gray-500 mt-1">Incremental sync (ALTERID) - only fetches new/modified vouchers. Auto-syncs every 30s.</p>
        </div>

        {/* Date Range Sync */}
        <DateRangeSync />

        {/* Configuration Help */}
        <div className="text-sm text-gray-500 p-4 bg-yellow-50 rounded-lg">
          <strong>To enable Tally connection:</strong>
          <ol className="list-decimal ml-4 mt-2 space-y-1">
            <li>Open Tally Prime</li>
            <li>Press F1 → Settings → Advanced Configuration</li>
            <li>Enable "Allow External Applications to Access Tally"</li>
            <li>Set HTTP Server Port (default: 9000)</li>
            <li>Restart Tally Prime</li>
          </ol>
        </div>
      </div>
    </div>
  );
}

// Date Range Sync Component
function DateRangeSync() {
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  // Convert date input to YYYYMMDD format
  const formatDate = (dateString) => {
    if (!dateString) return '';
    return dateString.replace(/-/g, '');
  };

  // Convert YYYYMMDD to date input format
  const toInputDate = (yyyymmdd) => {
    if (!yyyymmdd || yyyymmdd.length !== 8) return '';
    return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
  };

  const handleSync = async () => {
    if (!fromDate || !toDate) {
      setResult({ error: 'Please select both dates' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data } = await syncDateRange(formatDate(fromDate), formatDate(toDate));
      setResult({
        success: true,
        message: `Synced ${data.total} vouchers (${data.new} new, ${data.updated} updated)`
      });
    } catch (error) {
      setResult({ error: error.response?.data?.error || 'Sync failed' });
    } finally {
      setLoading(false);
    }
  };

  // Quick date presets
  const setPreset = (days) => {
    const today = new Date();
    const from = new Date();
    from.setDate(today.getDate() - days);

    setFromDate(from.toISOString().split('T')[0]);
    setToDate(today.toISOString().split('T')[0]);
  };

  return (
    <div className="pt-4 border-t">
      <h4 className="font-medium mb-2">Sync Historical Data:</h4>

      {/* Quick Presets */}
      <div className="flex flex-wrap gap-2 mb-3">
        <button onClick={() => setPreset(7)} className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-50">
          Last 7 days
        </button>
        <button onClick={() => setPreset(30)} className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-50">
          Last 30 days
        </button>
        <button onClick={() => setPreset(90)} className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-50">
          Last 90 days
        </button>
        <button onClick={() => setPreset(365)} className="px-3 py-1 text-sm border rounded-lg hover:bg-gray-50">
          Last 1 year
        </button>
      </div>

      {/* Date Inputs */}
      <div className="flex gap-3 mb-3">
        <div className="flex-1">
          <label className="text-xs text-gray-500">From Date</label>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
        <div className="flex-1">
          <label className="text-xs text-gray-500">To Date</label>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>

      <button
        onClick={handleSync}
        disabled={loading || !fromDate || !toDate}
        className="btn btn-outline w-full"
      >
        <Calendar size={18} className="mr-2" />
        {loading ? 'Syncing...' : 'Sync Date Range'}
      </button>

      {result && (
        <div className={`mt-3 p-3 rounded-lg text-sm ${
          result.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
        }`}>
          {result.error || result.message}
        </div>
      )}
    </div>
  );
}

// User Settings Component
function UserSettings({ users, showAddUser, setShowAddUser, onRefresh }) {
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    displayName: '',
    role: 'cashier'
  });

  const handleAddUser = async () => {
    try {
      await createUser(newUser);
      setShowAddUser(false);
      setNewUser({ username: '', password: '', displayName: '', role: 'cashier' });
      onRefresh();
    } catch (error) {
      console.error('Failed to add user:', error);
    }
  };

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <span>Users</span>
        <button
          onClick={() => setShowAddUser(true)}
          className="btn btn-primary text-sm py-1"
        >
          <Plus size={16} className="mr-1" />
          Add User
        </button>
      </div>
      <div className="card-body">
        {/* User List */}
        <table className="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Display Name</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id}>
                <td className="font-medium">{user.username}</td>
                <td>{user.display_name}</td>
                <td>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    user.role === 'admin' ? 'bg-purple-100 text-purple-800' :
                    user.role === 'manager' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td>
                  {user.active ? (
                    <Check size={18} className="text-green-500" />
                  ) : (
                    <X size={18} className="text-red-500" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Add User Form */}
        {showAddUser && (
          <div className="mt-4 p-4 border border-gray-200 rounded-lg">
            <h4 className="font-medium mb-4">Add New User</h4>
            <div className="grid grid-cols-2 gap-4">
              <input
                type="text"
                placeholder="Username"
                value={newUser.username}
                onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                className="px-3 py-2 border rounded-lg"
              />
              <input
                type="password"
                placeholder="Password"
                value={newUser.password}
                onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                className="px-3 py-2 border rounded-lg"
              />
              <input
                type="text"
                placeholder="Display Name"
                value={newUser.displayName}
                onChange={(e) => setNewUser({ ...newUser, displayName: e.target.value })}
                className="px-3 py-2 border rounded-lg"
              />
              <select
                value={newUser.role}
                onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                className="px-3 py-2 border rounded-lg"
              >
                <option value="cashier">Cashier</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={handleAddUser} className="btn btn-primary">
                Save
              </button>
              <button onClick={() => setShowAddUser(false)} className="btn btn-outline">
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Notification Settings Component
function NotificationSettings({ users, onUpdate }) {
  const [selectedUser, setSelectedUser] = useState(users[0]?.id || 1);
  const [prefs, setPrefs] = useState({
    notifyNewBill: true,
    notifyPayment: true,
    notifyLargeBill: true,
    notifyDispatch: true,
    largeBillThreshold: 50000
  });

  const handleSave = async () => {
    try {
      await updateUserNotifications(selectedUser, prefs);
      onUpdate();
    } catch (error) {
      console.error('Failed to update notifications:', error);
    }
  };

  return (
    <div className="card">
      <div className="card-header">Notification Preferences</div>
      <div className="card-body space-y-4">
        {/* User Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Select User
          </label>
          <select
            value={selectedUser}
            onChange={(e) => setSelectedUser(parseInt(e.target.value))}
            className="w-full px-3 py-2 border rounded-lg"
          >
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.display_name || user.username}
              </option>
            ))}
          </select>
        </div>

        {/* Notification Options */}
        <div className="space-y-3">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={prefs.notifyNewBill}
              onChange={(e) => setPrefs({ ...prefs, notifyNewBill: e.target.checked })}
              className="w-4 h-4 mr-3"
            />
            <span>Notify on new bill created</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={prefs.notifyPayment}
              onChange={(e) => setPrefs({ ...prefs, notifyPayment: e.target.checked })}
              className="w-4 h-4 mr-3"
            />
            <span>Notify on payment received</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={prefs.notifyLargeBill}
              onChange={(e) => setPrefs({ ...prefs, notifyLargeBill: e.target.checked })}
              className="w-4 h-4 mr-3"
            />
            <span>Alert for large bills</span>
          </label>

          {prefs.notifyLargeBill && (
            <div className="ml-7">
              <label className="text-sm text-gray-600">Threshold amount:</label>
              <input
                type="number"
                value={prefs.largeBillThreshold}
                onChange={(e) => setPrefs({ ...prefs, largeBillThreshold: parseInt(e.target.value) })}
                className="ml-2 w-32 px-3 py-1 border rounded"
              />
            </div>
          )}

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={prefs.notifyDispatch}
              onChange={(e) => setPrefs({ ...prefs, notifyDispatch: e.target.checked })}
              className="w-4 h-4 mr-3"
            />
            <span>Notify on dispatch status changes</span>
          </label>
        </div>

        <button onClick={handleSave} className="btn btn-primary">
          Save Preferences
        </button>
      </div>
    </div>
  );
}

// Language Settings Component
function LanguageSettings() {
  const { i18n } = useTranslation();

  const languages = [
    { code: 'en', name: 'English', native: 'English' },
    { code: 'ne', name: 'Nepali', native: 'नेपाली' }
  ];

  const handleLanguageChange = (lang) => {
    i18n.changeLanguage(lang);
    localStorage.setItem('language', lang);
  };

  return (
    <div className="card">
      <div className="card-header">Language / भाषा</div>
      <div className="card-body">
        <div className="space-y-2">
          {languages.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={`w-full flex items-center justify-between p-4 rounded-lg border-2 transition-colors ${
                i18n.language === lang.code
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div>
                <div className="font-medium">{lang.name}</div>
                <div className="text-sm text-gray-500">{lang.native}</div>
              </div>
              {i18n.language === lang.code && (
                <Check className="text-blue-600" size={24} />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
