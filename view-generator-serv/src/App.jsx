import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { FaVideo, FaUpload, FaTrash, FaUser, FaSignOutAlt, FaList, FaTimes, FaFilter } from 'react-icons/fa';
import './App.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || window.API_BASE_URL || 'http://localhost:3005';
const LOGGING_SERVICE_URL = import.meta.env.VITE_LOGGING_SERVICE_URL || 'http://localhost:3006';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showRegister, setShowRegister] = useState(false);
  const [videos, setVideos] = useState([]);
  const [storage, setStorage] = useState(null);
  const [usage, setUsage] = useState(null);
  const [selectedVideos, setSelectedVideos] = useState(new Set());
  const [alert, setAlert] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logFilters, setLogFilters] = useState({ service: '', level: '', limit: 100 });
  const [showDashboard, setShowDashboard] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const videoRefs = useRef({});
  const containerRef = useRef(null);

  // Check if user is already logged in
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    const user = localStorage.getItem('currentUser');
    if (token && user) {
      setIsAuthenticated(true);
      setCurrentUser(JSON.parse(user));
      loadDashboard(token);
    }
  }, []);

  // Handle scroll for video playback
  useEffect(() => {
    if (!containerRef.current) return;

    const handleScroll = () => {
      const container = containerRef.current;
      if (!container) return;

      const containerTop = container.scrollTop;
      const containerHeight = container.clientHeight;
      const centerPoint = containerTop + containerHeight / 2;
      const buffer = 200; // Buffer zone to pause videos slightly outside viewport

      Object.entries(videoRefs.current).forEach(([key, videoElement]) => {
        if (!videoElement) return;

        const rect = videoElement.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const videoTop = rect.top - containerRect.top + containerTop;
        const videoBottom = videoTop + rect.height;
        const videoCenter = videoTop + (videoBottom - videoTop) / 2;

        // Check if video center is near viewport center (within buffer)
        const distanceFromCenter = Math.abs(videoCenter - centerPoint);
        const isInCenterView = distanceFromCenter < containerHeight / 2 + buffer;

        if (isInCenterView) {
          // Video is in center viewport - play it
          if (videoElement.paused && videoElement.readyState >= 2) {
            videoElement.play().catch(() => {
              // Autoplay was prevented
            });
          }
        } else {
          // Video is out of center viewport - pause it
          if (!videoElement.paused) {
            videoElement.pause();
          }
          // Stop loading by setting currentTime to 0 and pausing
          // With preload="none", browser won't load until play() is called
          if (videoElement.readyState < 2) {
            // If video hasn't loaded yet, cancel loading by removing the source
            const source = videoElement.querySelector('source');
            if (source && !source.dataset.originalSrc) {
              source.dataset.originalSrc = source.src;
              source.src = '';
              videoElement.load();
            }
          } else {
            // Video is loaded, just pause and reset currentTime to stop buffering
            videoElement.currentTime = 0;
          }
        }

        // Restore source if video comes back into view
        if (isInCenterView) {
          const source = videoElement.querySelector('source');
          if (source && source.dataset.originalSrc && !source.src) {
            source.src = source.dataset.originalSrc;
            delete source.dataset.originalSrc;
            videoElement.load();
          }
        }
      });
    };

    const container = containerRef.current;
    container.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial check

    return () => {
      if (container) {
        container.removeEventListener('scroll', handleScroll);
      }
    };
  }, [videos]);

  const showAlertMessage = (message, type = 'info') => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 5000);
  };

  const login = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        email,
        password
      });

      const { token, user } = response.data;
      localStorage.setItem('authToken', token);
      localStorage.setItem('currentUser', JSON.stringify(user));
      setIsAuthenticated(true);
      setCurrentUser(user);
      showAlertMessage('Login successful!', 'success');
      loadDashboard(token);
    } catch (error) {
      showAlertMessage(error.response?.data?.error || 'Login failed', 'error');
    }
  };

  const register = async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const email = e.target.email.value;
    const password = e.target.password.value;

    try {
      await axios.post(`${API_BASE_URL}/api/auth/register`, {
        username,
        email,
        password
      });

      showAlertMessage('Registration successful! Please login.', 'success');
      setShowRegister(false);
    } catch (error) {
      showAlertMessage(error.response?.data?.error || 'Registration failed', 'error');
    }
  };

  const logout = () => {
    localStorage.removeItem('authToken');
    localStorage.removeItem('currentUser');
    setIsAuthenticated(false);
    setCurrentUser(null);
    setVideos([]);
    setSelectedVideos(new Set());
    setShowLogs(false);
    setLogs([]);
  };

  const loadDashboard = async (token = localStorage.getItem('authToken')) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/dashboard`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setStorage(response.data.storage);
      setUsage(response.data.usage);
      loadVideos(token);
    } catch (error) {
      if (error.response?.status === 401) {
        showAlertMessage('Session expired. Please login again.', 'error');
        logout();
      } else {
        showAlertMessage('Failed to load dashboard', 'error');
      }
    }
  };

  const loadVideos = async (token = localStorage.getItem('authToken')) => {
    try {
      // Load public feed (all users' videos)
      const response = await axios.get(`${API_BASE_URL}/api/videos/public`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setVideos(response.data.videos || []);
    } catch (error) {
      if (error.response?.status === 401) {
        showAlertMessage('Session expired. Please login again.', 'error');
        logout();
      } else {
        showAlertMessage('Failed to load videos', 'error');
      }
    }
  };

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('authToken');
      const params = new URLSearchParams();
      if (logFilters.service) params.append('service', logFilters.service);
      if (logFilters.level) params.append('level', logFilters.level);
      params.append('limit', logFilters.limit);

      // Logging service doesn't require auth, but we can pass token for tracking
      const response = await axios.get(`${LOGGING_SERVICE_URL}/api/logs?${params.toString()}`);

      setLogs(response.data.logs || []);
    } catch (error) {
      showAlertMessage('Failed to fetch logs', 'error');
      console.error('Logs fetch error:', error);
    }
  };

  const uploadVideo = async (e) => {
    e.preventDefault();
    const fileInput = e.target.video;
    const file = fileInput.files[0];

    if (!file) {
      showAlertMessage('Please select a video file', 'warning');
      return;
    }

    const formData = new FormData();
    formData.append('video', file);

    try {
      const token = localStorage.getItem('authToken');
      await axios.post(`${API_BASE_URL}/api/videos/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });

      showAlertMessage('Video uploaded successfully!', 'success');
      fileInput.value = '';
      setShowUpload(false);
      loadDashboard(token);
    } catch (error) {
      showAlertMessage(error.response?.data?.error || error.response?.data?.message || 'Upload failed', 'error');
    }
  };

  const deleteVideo = async (filename) => {
    if (!window.confirm('Are you sure you want to delete this video?')) {
      return;
    }

    try {
      const token = localStorage.getItem('authToken');
      await axios.delete(`${API_BASE_URL}/api/videos/${filename}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      showAlertMessage('Video deleted successfully', 'success');
      loadDashboard(token);
    } catch (error) {
      if (error.response?.status === 401) {
        showAlertMessage('Session expired. Please login again.', 'error');
        logout();
      } else {
        showAlertMessage('Failed to delete video', 'error');
      }
    }
  };

  const isAdmin = currentUser?.role === 'admin';

  const storagePercent = storage ? parseFloat(storage.usagePercent) : 0;
  const bandwidthPercent = usage ? parseFloat(usage.usagePercent) : 0;

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="header-content">
          <h1>
            <FaVideo /> Short Video Platform
          </h1>
          {!isAuthenticated ? (
            <div className="auth-section">
              {!showRegister ? (
                <form className="auth-form" onSubmit={login}>
                  <h2>Login</h2>
                  <input type="email" name="email" placeholder="Email" required />
                  <input type="password" name="password" placeholder="Password" required />
                  <button type="submit">Login</button>
                  <p>
                    Don't have an account?{' '}
                    <a href="#" onClick={(e) => { e.preventDefault(); setShowRegister(true); }}>
                      Register
                    </a>
                  </p>
                </form>
              ) : (
                <form className="auth-form" onSubmit={register}>
                  <h2>Register</h2>
                  <input type="text" name="username" placeholder="Username" required />
                  <input type="email" name="email" placeholder="Email" required />
                  <input type="password" name="password" placeholder="Password" required />
                  <button type="submit">Register</button>
                  <p>
                    Already have an account?{' '}
                    <a href="#" onClick={(e) => { e.preventDefault(); setShowRegister(false); }}>
                      Login
                    </a>
                  </p>
                </form>
              )}
            </div>
          ) : (
            <div className="user-info">
              <span>Welcome, {currentUser?.username}</span>
              <div className="header-actions">
                {isAdmin && (
                  <button className="icon-button" onClick={() => { setShowLogs(!showLogs); if (!showLogs) fetchLogs(); }} title="View Logs">
                    <FaList />
                  </button>
                )}
                <button className="icon-button" onClick={() => setShowDashboard(!showDashboard)} title="Dashboard">
                  <FaUser />
                </button>
                <button className="icon-button" onClick={() => setShowUpload(!showUpload)} title="Upload">
                  <FaUpload />
                </button>
                <button className="icon-button" onClick={logout} title="Logout">
                  <FaSignOutAlt />
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      {isAuthenticated && (
        <>
          {/* Dashboard Modal */}
          {showDashboard && (
            <div className="modal-overlay" onClick={() => setShowDashboard(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Dashboard</h2>
                  <button className="close-button" onClick={() => setShowDashboard(false)}>
                    <FaTimes />
                  </button>
                </div>
                <div className="stats-grid">
                  <div className="stat-card">
                    <h3>Storage Usage</h3>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(storagePercent, 100)}%`,
                          background:
                            storagePercent >= 100
                              ? '#dc3545'
                              : storagePercent >= 80
                              ? '#ffc107'
                              : '#667eea'
                        }}
                      ></div>
                    </div>
                    <p>
                      {storage
                        ? `${(storage.usedStorage / (1024 * 1024)).toFixed(2)} MB / ${(storage.maxStorage / (1024 * 1024)).toFixed(2)} MB`
                        : '0 MB / 50 MB'}
                    </p>
                  </div>
                  <div className="stat-card">
                    <h3>Daily Bandwidth</h3>
                    <div className="progress-bar">
                      <div
                        className="progress-fill"
                        style={{
                          width: `${Math.min(bandwidthPercent, 100)}%`,
                          background:
                            bandwidthPercent >= 100 || usage?.blocked
                              ? '#dc3545'
                              : bandwidthPercent >= 80
                              ? '#ffc107'
                              : '#667eea'
                        }}
                      ></div>
                    </div>
                    <p>
                      {usage
                        ? `${(usage.totalVolume / (1024 * 1024)).toFixed(2)} MB / ${(usage.maxDailyBandwidth / (1024 * 1024)).toFixed(2)} MB`
                        : '0 MB / 100 MB'}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Upload Modal */}
          {showUpload && (
            <div className="modal-overlay" onClick={() => setShowUpload(false)}>
              <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>Upload Video</h2>
                  <button className="close-button" onClick={() => setShowUpload(false)}>
                    <FaTimes />
                  </button>
                </div>
                <form className="upload-form" onSubmit={uploadVideo}>
                  <input
                    type="file"
                    name="video"
                    id="video-input"
                    accept="video/*"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      const file = e.target.files[0];
                      if (file) {
                        document.getElementById('selected-file').textContent = `Selected: ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
                        document.getElementById('upload-btn').disabled = false;
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="choose-file-button"
                    onClick={() => document.getElementById('video-input').click()}
                  >
                    <FaUpload /> Choose Video
                  </button>
                  <span id="selected-file" className="selected-file"></span>
                  <button type="submit" id="upload-btn" className="upload-button" disabled>
                    Upload
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* Admin Logs Modal */}
          {showLogs && isAdmin && (
            <div className="modal-overlay" onClick={() => setShowLogs(false)}>
              <div className="modal-content logs-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                  <h2>System Logs</h2>
                  <button className="close-button" onClick={() => setShowLogs(false)}>
                    <FaTimes />
                  </button>
                </div>
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
                  <button onClick={fetchLogs} className="filter-button">
                    <FaFilter /> Apply Filters
                  </button>
                </div>
                <div className="logs-container">
                  {logs.length === 0 ? (
                    <p>No logs found</p>
                  ) : (
                    <table className="logs-table">
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
            </div>
          )}

          {/* TikTok-Style Video Feed */}
          <main className="video-feed-container" ref={containerRef}>
            {videos.length === 0 ? (
              <div className="no-videos">
                <FaVideo size={64} />
                <p>No videos uploaded yet.</p>
                <button onClick={() => setShowUpload(true)} className="upload-first-button">
                  <FaUpload /> Upload Your First Video
                </button>
              </div>
            ) : (
              videos.map((video, index) => {
                const videoUserId = video.userId || currentUser.userId;
                const videoKey = `${videoUserId}-${video.filename}`;
                return (
                  <div key={videoKey} className="video-item">
                    <video
                      ref={(el) => {
                        if (el) videoRefs.current[videoKey] = el;
                      }}
                      className="video-player"
                      controls
                      playsInline
                      preload="none"
                      muted
                    >
                      <source
                        src={video.gcsUrl || `${API_BASE_URL}/api/videos/stream/${videoUserId}/${video.filename}?token=${localStorage.getItem('authToken')}`}
                        type="video/mp4"
                      />
                      Your browser does not support the video tag.
                    </video>
                    <div className="video-overlay">
                      <div className="video-info">
                        <h3>{video.originalName}</h3>
                        <p>{new Date(video.uploadedAt).toLocaleString()}</p>
                        <p className="video-size">{(video.size / (1024 * 1024)).toFixed(2)} MB</p>
                      </div>
                      {videoUserId === currentUser.userId && (
                        <button
                          className="video-delete-button"
                          onClick={() => deleteVideo(video.filename)}
                          title="Delete Video"
                        >
                          <FaTrash />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </main>
        </>
      )}

      {alert && (
        <div className="alert-container">
          <div className={`alert alert-${alert.type}`}>{alert.message}</div>
        </div>
      )}
    </div>
  );
}

export default App;
