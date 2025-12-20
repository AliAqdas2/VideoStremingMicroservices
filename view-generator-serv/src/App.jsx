import React, { useState, useEffect, useRef, Fragment } from 'react';
import axios from 'axios';
import { FaVideo, FaUpload, FaTrash, FaUser, FaSignOutAlt, FaTimes, FaUserShield, FaSpinner } from 'react-icons/fa';
import AdminPanel from './AdminPanel';
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
  const [showDashboard, setShowDashboard] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [loading, setLoading] = useState({
    login: false,
    register: false,
    upload: false,
    deletingVideos: new Set() // Track which videos are being deleted
  });
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

    setLoading(prev => ({ ...prev, login: true }));

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
    } finally {
      setLoading(prev => ({ ...prev, login: false }));
    }
  };

  const register = async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const email = e.target.email.value;
    const password = e.target.password.value;

    setLoading(prev => ({ ...prev, register: true }));

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
    } finally {
      setLoading(prev => ({ ...prev, register: false }));
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


  const uploadVideo = async (e) => {
    e.preventDefault();
    const fileInput = e.target.video;
    const file = fileInput.files[0];

    if (!file) {
      showAlertMessage('Please select a video file', 'warning');
      return;
    }

    setLoading(prev => ({ ...prev, upload: true }));

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
    } finally {
      setLoading(prev => ({ ...prev, upload: false }));
    }
  };

  const deleteVideo = async (filename) => {
    if (!window.confirm('Are you sure you want to delete this video?')) {
      return;
    }

    // Add filename to deleting set
    setLoading(prev => ({
      ...prev,
      deletingVideos: new Set(prev.deletingVideos).add(filename)
    }));

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
    } finally {
      // Remove filename from deleting set
      setLoading(prev => {
        const newSet = new Set(prev.deletingVideos);
        newSet.delete(filename);
        return { ...prev, deletingVideos: newSet };
      });
    }
  };

  const isAdmin = currentUser?.role === 'admin';

  const storagePercent = storage ? parseFloat(storage.usagePercent) : 0;
  const bandwidthPercent = usage ? parseFloat(usage.usagePercent) : 0;

  return (
    <div className="app-container">
      {!isAuthenticated ? (
        <div className="auth-page">
          <div className="auth-container">
            <div className="auth-header">
              <div className="logo-section">
                <FaVideo className="logo-icon" />
                <h1>Short Video Platform</h1>
                <p className="tagline">Share your moments, discover amazing content</p>
              </div>
            </div>

            <div className="auth-card">
              <div className="auth-tabs">
                <button
                  className={`auth-tab ${!showRegister ? 'active' : ''}`}
                  onClick={() => setShowRegister(false)}
                >
                  Login
                </button>
                <button
                  className={`auth-tab ${showRegister ? 'active' : ''}`}
                  onClick={() => setShowRegister(true)}
                >
                  Sign Up
                </button>
              </div>

              {!showRegister ? (
                <form className="auth-form-content" onSubmit={login}>
                  <div className="form-group">
                    <label htmlFor="login-email">Email Address</label>
                    <input
                      type="email"
                      id="login-email"
                      name="email"
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="login-password">Password</label>
                    <input
                      type="password"
                      id="login-password"
                      name="password"
                      placeholder="Enter your password"
                      required
                    />
                  </div>
                  <button type="submit" className="auth-submit-button" disabled={loading.login}>
                    {loading.login ? (
                      <>
                        <FaSpinner className="spinner" /> Logging in...
                      </>
                    ) : (
                      <span>Login</span>
                    )}
                  </button>
                  <div className="auth-divider">
                    <span>New to the platform?</span>
                  </div>
                  <button
                    type="button"
                    className="auth-switch-button"
                    onClick={() => setShowRegister(true)}
                  >
                    Create an account
                  </button>
                </form>
              ) : (
                <form className="auth-form-content" onSubmit={register}>
                  <div className="form-group">
                    <label htmlFor="register-username">Username</label>
                    <input
                      type="text"
                      id="register-username"
                      name="username"
                      placeholder="Choose a username"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="register-email">Email Address</label>
                    <input
                      type="email"
                      id="register-email"
                      name="email"
                      placeholder="Enter your email"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="register-password">Password</label>
                    <input
                      type="password"
                      id="register-password"
                      name="password"
                      placeholder="Create a password"
                      required
                    />
                  </div>
                  <button type="submit" className="auth-submit-button" disabled={loading.register}>
                    {loading.register ? (
                      <>
                        <FaSpinner className="spinner" /> Creating Account...
                      </>
                    ) : (
                      <span>Create Account</span>
                    )}
                  </button>
                  <div className="auth-divider">
                    <span>Already have an account?</span>
                  </div>
                  <button
                    type="button"
                    className="auth-switch-button"
                    onClick={() => setShowRegister(false)}
                  >
                    Sign in instead
                  </button>
                </form>
              )}

              <div className="auth-features">
                <div className="feature-item">
                  <FaVideo className="feature-icon" />
                  <div>
                    <h4>Upload & Share</h4>
                    <p>Share your short videos with the community</p>
                  </div>
                </div>
                <div className="feature-item">
                  <FaUser className="feature-icon" />
                  <div>
                    <h4>50MB Storage</h4>
                    <p>Get 50MB of free storage for your videos</p>
                  </div>
                </div>
                <div className="feature-item">
                  <FaUpload className="feature-icon" />
                  <div>
                    <h4>100MB Daily</h4>
                    <p>100MB daily bandwidth for uploads</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : showAdminPanel ? (
        <AdminPanel currentUser={currentUser} onBack={() => setShowAdminPanel(false)} />
      ) : (
        <Fragment>
          <header className="app-header">
            <div className="header-content">
              <h1>
                <FaVideo /> Short Video Platform
              </h1>
              <div className="user-info">
                <span>Welcome, {currentUser?.username}</span>
                <div className="header-actions">
                  {isAdmin && (
                    <button className="icon-button" onClick={() => setShowAdminPanel(true)} title="Admin Panel">
                      <FaUserShield />
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
            </div>
          </header>
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
                  <button type="submit" id="upload-btn" className="upload-button" disabled={loading.upload}>
                    {loading.upload ? (
                      <>
                        <FaSpinner className="spinner" /> Uploading...
                      </>
                    ) : (
                      'Upload'
                    )}
                  </button>
                </form>
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
                          disabled={loading.deletingVideos.has(video.filename)}
                          title={loading.deletingVideos.has(video.filename) ? "Deleting..." : "Delete Video"}
                        >
                          {loading.deletingVideos.has(video.filename) ? (
                            <FaSpinner className="spinner" />
                          ) : (
                            <FaTrash />
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </main>
        </Fragment>
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
