import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { FaUsers, FaDatabase, FaList, FaChartBar, FaUserShield, FaUser, FaFilter, FaHome, FaSpinner } from 'react-icons/fa';
import './AdminPanel.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || window.API_BASE_URL || 'http://localhost:3005';
const USER_SERVICE_URL = import.meta.env.VITE_USER_SERVICE_URL || 'http://localhost:3001';
const STORAGE_SERVICE_URL = import.meta.env.VITE_STORAGE_SERVICE_URL || 'http://localhost:3002';
const LOGGING_SERVICE_URL = import.meta.env.VITE_LOGGING_SERVICE_URL || 'http://localhost:3006';

function AdminPanel({ currentUser, onBack }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [storageStats, setStorageStats] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logFilters, setLogFilters] = useState({ service: '', level: '', limit: 500 });
  const [loading, setLoading] = useState(true);
  const [loadingUsers, setLoadingUsers] = useState(new Set()); // Track which users are being updated

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      await Promise.all([
        loadStorageStats(),
        loadUsers(),
        loadLogs()
      ]);
    } catch (error) {
      console.error('Error loading admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStorageStats = async () => {
    try {
      const response = await axios.get(`${STORAGE_SERVICE_URL}/api/storage/admin/stats`);
      setStorageStats(response.data);
    } catch (error) {
      console.error('Error loading storage stats:', error);
    }
  };

  const loadUsers = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const response = await axios.get(`${USER_SERVICE_URL}/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAllUsers(response.data.users || []);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  const loadLogs = async () => {
    try {
      const params = new URLSearchParams();
      if (logFilters.service) params.append('service', logFilters.service);
      if (logFilters.level) params.append('level', logFilters.level);
      params.append('limit', logFilters.limit || 500);

      const response = await axios.get(`${LOGGING_SERVICE_URL}/api/logs?${params.toString()}`);
      setLogs(response.data.logs || []);
    } catch (error) {
      console.error('Error loading logs:', error);
    }
  };

  const makeAdmin = async (userId, email) => {
    if (!window.confirm(`Are you sure you want to make ${email} an admin?`)) {
      return;
    }

    // Add userId to loading set
    setLoadingUsers(prev => new Set(prev).add(userId));

    try {
      const token = localStorage.getItem('authToken');
      await axios.put(
        `${USER_SERVICE_URL}/api/users/${userId}/role`,
        { role: 'admin' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update local state
      setAllUsers(users => 
        users.map(user => 
          user._id === userId ? { ...user, role: 'admin' } : user
        )
      );
      
      alert('User role updated successfully!');
      await loadUsers(); // Refresh users list
    } catch (error) {
      console.error('Error updating user role:', error);
      alert(error.response?.data?.error || 'Failed to update user role');
    } finally {
      // Remove userId from loading set
      setLoadingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  const removeAdmin = async (userId, email) => {
    if (!window.confirm(`Are you sure you want to remove admin privileges from ${email}?`)) {
      return;
    }

    // Add userId to loading set
    setLoadingUsers(prev => new Set(prev).add(userId));

    try {
      const token = localStorage.getItem('authToken');
      await axios.put(
        `${USER_SERVICE_URL}/api/users/${userId}/role`,
        { role: 'user' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update local state
      setAllUsers(users => 
        users.map(user => 
          user._id === userId ? { ...user, role: 'user' } : user
        )
      );
      
      alert('User role updated successfully!');
      await loadUsers(); // Refresh users list
    } catch (error) {
      console.error('Error updating user role:', error);
      alert(error.response?.data?.error || 'Failed to update user role');
    } finally {
      // Remove userId from loading set
      setLoadingUsers(prev => {
        const newSet = new Set(prev);
        newSet.delete(userId);
        return newSet;
      });
    }
  };

  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs();
    }
  }, [activeTab, logFilters]);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading && !storageStats && allUsers.length === 0) {
    return (
      <div className="admin-panel">
        <div className="admin-header">
          <h1>Admin Panel</h1>
          <button className="back-button" onClick={onBack}>
            <FaHome /> Back to Videos
          </button>
        </div>
        <div className="loading">Loading...</div>
      </div>
    );
  }

  return (
    <div className="admin-panel">
      <div className="admin-header">
        <h1><FaUserShield /> Admin Panel</h1>
        <button className="back-button" onClick={onBack}>
          <FaHome /> Back to Videos
        </button>
      </div>

      <div className="admin-tabs">
        <button
          className={activeTab === 'overview' ? 'active' : ''}
          onClick={() => setActiveTab('overview')}
        >
          <FaChartBar /> Overview
        </button>
        <button
          className={activeTab === 'users' ? 'active' : ''}
          onClick={() => setActiveTab('users')}
        >
          <FaUsers /> Users ({allUsers.length})
        </button>
        <button
          className={activeTab === 'storage' ? 'active' : ''}
          onClick={() => setActiveTab('storage')}
        >
          <FaDatabase /> Storage
        </button>
        <button
          className={activeTab === 'logs' ? 'active' : ''}
          onClick={() => setActiveTab('logs')}
        >
          <FaList /> Logs ({logs.length})
        </button>
      </div>

      <div className="admin-content">
        {activeTab === 'overview' && (
          <div className="overview-section">
            <h2>System Overview</h2>
            <div className="stats-grid">
              <div className="stat-card">
                <h3>Total Users</h3>
                <div className="stat-value">{allUsers.length}</div>
                <div className="stat-detail">
                  {allUsers.filter(u => u.role === 'admin').length} Admin(s)
                </div>
              </div>
              <div className="stat-card">
                <h3>Total Storage Used</h3>
                <div className="stat-value">
                  {storageStats ? formatBytes(storageStats.totalUsedStorage) : '0 Bytes'}
                </div>
                <div className="stat-detail">
                  of {storageStats ? formatBytes(storageStats.totalMaxStorage) : '0 Bytes'}
                </div>
                {storageStats && (
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${Math.min(storageStats.usagePercent, 100)}%`,
                        background: storageStats.usagePercent >= 100
                          ? '#dc3545'
                          : storageStats.usagePercent >= 80
                          ? '#ffc107'
                          : '#667eea'
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="stat-card">
                <h3>Total Files</h3>
                <div className="stat-value">{storageStats?.totalFiles || 0}</div>
                <div className="stat-detail">Videos uploaded</div>
              </div>
              <div className="stat-card">
                <h3>Storage Alerts</h3>
                <div className="stat-value">{storageStats?.usersOver80Percent || 0}</div>
                <div className="stat-detail">
                  {storageStats?.usersAtLimit || 0} at limit
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="users-section">
            <h2>All Users</h2>
            <div className="users-table-container">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allUsers.map((user) => (
                    <tr key={user._id}>
                      <td>{user.username}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className={`role-badge role-${user.role}`}>
                          {user.role}
                        </span>
                      </td>
                      <td>{new Date(user.createdAt).toLocaleDateString()}</td>
                      <td>
                        {user.role === 'user' ? (
                          <button
                            className="action-button make-admin"
                            onClick={() => makeAdmin(user._id, user.email)}
                            disabled={loadingUsers.has(user._id)}
                            title={loadingUsers.has(user._id) ? "Updating..." : "Make user an admin"}
                          >
                            {loadingUsers.has(user._id) ? (
                              <>
                                <FaSpinner className="spinner" /> Updating...
                              </>
                            ) : (
                              <>
                                <FaUserShield /> Make Admin
                              </>
                            )}
                          </button>
                        ) : (
                          <button
                            className="action-button remove-admin"
                            onClick={() => removeAdmin(user._id, user.email)}
                            disabled={user._id === currentUser?.userId || loadingUsers.has(user._id)}
                            title={user._id === currentUser?.userId ? "Cannot remove your own admin privileges" : loadingUsers.has(user._id) ? "Updating..." : "Remove admin privileges"}
                          >
                            {loadingUsers.has(user._id) ? (
                              <>
                                <FaSpinner className="spinner" /> Updating...
                              </>
                            ) : (
                              <>
                                <FaUser /> Remove Admin
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'storage' && (
          <div className="storage-section">
            <h2>Storage Statistics</h2>
            {storageStats && (
              <div className="storage-stats">
                <div className="stat-card-large">
                  <h3>Total System Storage</h3>
                  <div className="storage-details">
                    <div className="storage-item">
                      <span>Used:</span>
                      <strong>{formatBytes(storageStats.totalUsedStorage)}</strong>
                    </div>
                    <div className="storage-item">
                      <span>Available:</span>
                      <strong>{formatBytes(storageStats.totalAvailableStorage)}</strong>
                    </div>
                    <div className="storage-item">
                      <span>Total:</span>
                      <strong>{formatBytes(storageStats.totalMaxStorage)}</strong>
                    </div>
                    <div className="progress-bar-large">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(storageStats.usagePercent, 100)}%`,
                          background: storageStats.usagePercent >= 100
                            ? '#dc3545'
                            : storageStats.usagePercent >= 80
                            ? '#ffc107'
                            : '#667eea'
                        }}
                      />
                    </div>
                    <div className="usage-percent">
                      {storageStats.usagePercent}% Used
                    </div>
                  </div>
                </div>
                <div className="storage-metrics">
                  <div className="metric-item">
                    <span className="metric-label">Total Users:</span>
                    <span className="metric-value">{storageStats.totalUsers}</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Total Files:</span>
                    <span className="metric-value">{storageStats.totalFiles}</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Average per User:</span>
                    <span className="metric-value">{formatBytes(storageStats.averageUsagePerUser)}</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Users Over 80%:</span>
                    <span className="metric-value warning">{storageStats.usersOver80Percent}</span>
                  </div>
                  <div className="metric-item">
                    <span className="metric-label">Users At Limit:</span>
                    <span className="metric-value error">{storageStats.usersAtLimit}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'logs' && (
          <div className="logs-section">
            <h2>System Logs</h2>
            <div className="logs-filters">
              <select
                value={logFilters.service}
                onChange={(e) => setLogFilters({ ...logFilters, service: e.target.value })}
              >
                <option value="">All Services</option>
                <option value="UserAccMgmtServ">User Service</option>
                <option value="StorageMgmtServ">Storage Service</option>
                <option value="UsageMntrServ">Usage Service</option>
                <option value="ModelServ">Model Service</option>
                <option value="ControllerServ">Controller Service</option>
                <option value="LoggingServ">Logging Service</option>
              </select>
              <select
                value={logFilters.level}
                onChange={(e) => setLogFilters({ ...logFilters, level: e.target.value })}
              >
                <option value="">All Levels</option>
                <option value="info">Info</option>
                <option value="warn">Warning</option>
                <option value="error">Error</option>
              </select>
              <input
                type="number"
                placeholder="Limit"
                value={logFilters.limit}
                onChange={(e) => setLogFilters({ ...logFilters, limit: parseInt(e.target.value) || 500 })}
              />
              <button onClick={loadLogs} className="filter-button">
                <FaFilter /> Apply Filters
              </button>
            </div>
            <div className="logs-container">
              {logs.length === 0 ? (
                <p>No logs found</p>
              ) : (
                <table className="admin-table logs-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Level</th>
                      <th>Service</th>
                      <th>Message</th>
                      <th>User ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, index) => (
                      <tr key={index} className={`log-row log-${log.level}`}>
                        <td>{new Date(log.timestamp).toLocaleString()}</td>
                        <td>
                          <span className={`log-badge log-badge-${log.level}`}>{log.level}</span>
                        </td>
                        <td>{log.service}</td>
                        <td>{log.message}</td>
                        <td>{log.userId || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminPanel;

