import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  FaVideo,
  FaUpload,
  FaTrash,
  FaSignOutAlt,
  FaTimes,
  FaUserShield,
  FaSpinner,
  FaPlay,
  FaVolumeUp,
  FaVolumeMute,
  FaHeart,
  FaShare,
  FaChartBar,
  FaCloud,
  FaBolt,
  FaShieldAlt,
  FaRocket,
  FaClock,
  FaArrowRight,
  FaPause,
} from "react-icons/fa";
import AdminPanel from "./AdminPanel";
import "./App.css";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  window.API_BASE_URL ||
  "http://104.154.135.248:3005";

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [showRegister, setShowRegister] = useState(false);
  const [videos, setVideos] = useState([]);
  const [storage, setStorage] = useState(null);
  const [usage, setUsage] = useState(null);
  const [alert, setAlert] = useState(null);
  const [showDashboard, setShowDashboard] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [playingVideo, setPlayingVideo] = useState(null);
  const [userPausedVideos, setUserPausedVideos] = useState(new Set()); // Track videos manually paused by user
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState({
    login: false,
    register: false,
    upload: false,
    deletingVideos: new Set(),
  });
  const videoRefs = useRef({});
  const containerRef = useRef(null);
  const observerRef = useRef(null);

  // Check if user is already logged in
  useEffect(() => {
    const token = localStorage.getItem("authToken");
    const user = localStorage.getItem("currentUser");
    if (token && user) {
      setIsAuthenticated(true);
      setCurrentUser(JSON.parse(user));
      loadDashboard(token);
    }
  }, []);

  // Intersection Observer for video playback - Fixed version
  useEffect(() => {
    if (!isAuthenticated || videos.length === 0) return;

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    const options = {
      root: containerRef.current,
      rootMargin: "0px",
      threshold: 0.5,
    };

    observerRef.current = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const video = entry.target;
        const videoKey = video.dataset.videokey;

        if (entry.isIntersecting) {
          // Don't auto-play if user manually paused this video
          if (userPausedVideos.has(videoKey)) {
            return;
          }

          // Ensure video is ready before playing
          if (video.readyState >= 2) {
            const playPromise = video.play();
            if (playPromise !== undefined) {
              playPromise
                .then(() => setPlayingVideo(videoKey))
                .catch((err) =>
                  console.log("Autoplay prevented:", err.message)
                );
            }
          } else {
            // Wait for video to be ready
            video.addEventListener("canplay", function handleCanPlay() {
              video.removeEventListener("canplay", handleCanPlay);
              // Check again if user paused while loading
              if (userPausedVideos.has(videoKey)) {
                return;
              }
              const playPromise = video.play();
              if (playPromise !== undefined) {
                playPromise
                  .then(() => setPlayingVideo(videoKey))
                  .catch((err) =>
                    console.log("Autoplay prevented:", err.message)
                  );
              }
            });
            video.load(); // Trigger loading
          }
        } else {
          // Video scrolled out of view - pause it and clear user pause state
          if (!video.paused) {
            video.pause();
          }
          if (playingVideo === videoKey) {
            setPlayingVideo(null);
          }
          // Clear user paused state when scrolling away (so it auto-plays when scrolling back)
          setUserPausedVideos((prev) => {
            const newSet = new Set(prev);
            newSet.delete(videoKey);
            return newSet;
          });
        }
      });
    }, options);

    // Delay to ensure refs are populated and DOM is ready
    const timer = setTimeout(() => {
      Object.entries(videoRefs.current).forEach(([key, video]) => {
        if (video && observerRef.current) {
          video.dataset.videokey = key;
          observerRef.current.observe(video);
        }
      });
    }, 200);

    return () => {
      clearTimeout(timer);
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [videos, isAuthenticated]);

  const showAlertMessage = (message, type = "info") => {
    setAlert({ message, type });
    setTimeout(() => setAlert(null), 5000);
  };

  const login = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    setLoading((prev) => ({ ...prev, login: true }));

    try {
      const response = await axios.post(`${API_BASE_URL}/api/auth/login`, {
        email,
        password,
      });

      const { token, user } = response.data;
      localStorage.setItem("authToken", token);
      localStorage.setItem("currentUser", JSON.stringify(user));
      setIsAuthenticated(true);
      setCurrentUser(user);
      showAlertMessage("Welcome back! 🎉", "success");
      loadDashboard(token);
    } catch (error) {
      showAlertMessage(error.response?.data?.error || "Login failed", "error");
    } finally {
      setLoading((prev) => ({ ...prev, login: false }));
    }
  };

  const register = async (e) => {
    e.preventDefault();
    const username = e.target.username.value;
    const email = e.target.email.value;
    const password = e.target.password.value;

    setLoading((prev) => ({ ...prev, register: true }));

    try {
      await axios.post(`${API_BASE_URL}/api/auth/register`, {
        username,
        email,
        password,
      });

      showAlertMessage(
        "Account created successfully! Please login.",
        "success"
      );
      setShowRegister(false);
    } catch (error) {
      showAlertMessage(
        error.response?.data?.error || "Registration failed",
        "error"
      );
    } finally {
      setLoading((prev) => ({ ...prev, register: false }));
    }
  };

  const logout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("currentUser");
    setIsAuthenticated(false);
    setCurrentUser(null);
    setVideos([]);
  };

  const loadDashboard = async (token = localStorage.getItem("authToken")) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      setStorage(response.data.storage);
      setUsage(response.data.usage);
      loadVideos(token);
    } catch (error) {
      if (error.response?.status === 401) {
        showAlertMessage("Session expired. Please login again.", "error");
        logout();
      } else {
        showAlertMessage("Failed to load dashboard", "error");
      }
    }
  };

  const loadVideos = async (token = localStorage.getItem("authToken")) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/videos/public`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const videosData = response.data.videos || [];
      console.log("Loaded videos:", videosData.length);
      setVideos(videosData);
    } catch (error) {
      if (error.response?.status === 401) {
        showAlertMessage("Session expired. Please login again.", "error");
        logout();
      } else {
        showAlertMessage("Failed to load videos", "error");
      }
    }
  };

  const uploadVideo = async (e) => {
    e.preventDefault();
    const fileInput = e.target.video;
    const file = fileInput.files[0];

    if (!file) {
      showAlertMessage("Please select a video file", "warning");
      return;
    }

    setLoading((prev) => ({ ...prev, upload: true }));
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("video", file);

    try {
      const token = localStorage.getItem("authToken");
      await axios.post(`${API_BASE_URL}/api/videos/upload`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(progress);
        },
      });

      showAlertMessage("Video uploaded successfully! 🎬", "success");
      fileInput.value = "";
      setShowUpload(false);
      setUploadProgress(0);
      loadDashboard(token);
    } catch (error) {
      showAlertMessage(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Upload failed",
        "error"
      );
    } finally {
      setLoading((prev) => ({ ...prev, upload: false }));
      setUploadProgress(0);
    }
  };

  const deleteVideo = async (filename) => {
    if (!window.confirm("Are you sure you want to delete this video?")) {
      return;
    }

    setLoading((prev) => ({
      ...prev,
      deletingVideos: new Set(prev.deletingVideos).add(filename),
    }));

    try {
      const token = localStorage.getItem("authToken");
      await axios.delete(`${API_BASE_URL}/api/videos/${filename}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      showAlertMessage("Video deleted successfully", "success");
      loadDashboard(token);
    } catch (error) {
      if (error.response?.status === 401) {
        showAlertMessage("Session expired. Please login again.", "error");
        logout();
      } else {
        showAlertMessage("Failed to delete video", "error");
      }
    } finally {
      setLoading((prev) => {
        const newSet = new Set(prev.deletingVideos);
        newSet.delete(filename);
        return { ...prev, deletingVideos: newSet };
      });
    }
  };

  const toggleMute = (e) => {
    e.stopPropagation();
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    Object.values(videoRefs.current).forEach((video) => {
      if (video) video.muted = newMuted;
    });
  };

  const togglePlay = (videoKey) => {
    const video = videoRefs.current[videoKey];
    if (video) {
      if (video.paused) {
        // User wants to play - remove from paused set
        setUserPausedVideos((prev) => {
          const newSet = new Set(prev);
          newSet.delete(videoKey);
          return newSet;
        });
        video
          .play()
          .then(() => setPlayingVideo(videoKey))
          .catch(console.error);
      } else {
        // User wants to pause - add to paused set so observer doesn't auto-play
        setUserPausedVideos((prev) => new Set(prev).add(videoKey));
        video.pause();
        setPlayingVideo(null);
      }
    }
  };

  const isAdmin = currentUser?.role === "admin";
  const storagePercent = storage ? parseFloat(storage.usagePercent) : 0;
  const bandwidthPercent = usage ? parseFloat(usage.usagePercent) : 0;

  // Landing Page
  if (!isAuthenticated) {
    return (
      <div className="landing-page">
        <div className="landing-bg">
          <div className="gradient-orb orb-1"></div>
          <div className="gradient-orb orb-2"></div>
          <div className="gradient-orb orb-3"></div>
          <div className="grid-overlay"></div>
        </div>

        <nav className="landing-nav">
          <div className="nav-brand">
            <div className="brand-icon">
              <FaVideo />
            </div>
            <span className="brand-name">StreamVault</span>
          </div>
          <div className="nav-actions">
            <button
              className="nav-btn nav-btn-ghost"
              onClick={() => setShowRegister(false)}
            >
              Sign In
            </button>
            <button
              className="nav-btn nav-btn-primary"
              onClick={() => setShowRegister(true)}
            >
              Get Started
            </button>
          </div>
        </nav>

        <section className="hero-section">
          <div className="hero-content">
            <div className="hero-badge">
              <FaRocket className="badge-icon" />
              <span>Next-Gen Video Platform</span>
            </div>
            <h1 className="hero-title">
              Share Your Story
              <span className="gradient-text"> With The World</span>
            </h1>
            <p className="hero-description">
              StreamVault is the ultimate platform for creators. Upload, share,
              and discover short-form videos with lightning-fast streaming and
              enterprise-grade security.
            </p>
            <div className="hero-cta">
              <button
                className="cta-primary"
                onClick={() => setShowRegister(true)}
              >
                Start Creating
                <FaArrowRight className="cta-icon" />
              </button>
              <button
                className="cta-secondary"
                onClick={() =>
                  document
                    .getElementById("features")
                    .scrollIntoView({ behavior: "smooth" })
                }
              >
                <FaArrowRight className="cta-icon" />
                Explore Features
              </button>
            </div>
            <div className="hero-stats">
              <div className="stat-item">
                <span className="stat-number">50MB</span>
                <span className="stat-label">Free Storage</span>
              </div>
              <div className="stat-divider"></div>
              <div className="stat-item">
                <span className="stat-number">100MB</span>
                <span className="stat-label">Daily Bandwidth</span>
              </div>
              <div className="stat-divider"></div>
              <div className="stat-item">
                <span className="stat-number">4K</span>
                <span className="stat-label">Max Quality</span>
              </div>
            </div>
          </div>

          <div className="hero-auth">
            <div className="auth-card-modern">
              <div className="auth-card-header">
                <h2>{showRegister ? "Create Account" : "Welcome Back"}</h2>
                <p>
                  {showRegister
                    ? "Join thousands of creators"
                    : "Sign in to continue"}
                </p>
              </div>

              {!showRegister ? (
                <form className="auth-form-modern" onSubmit={login}>
                  <div className="input-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      name="email"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  <div className="input-group">
                    <label>Password</label>
                    <input
                      type="password"
                      name="password"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="auth-submit-modern"
                    disabled={loading.login}
                  >
                    {loading.login ? (
                      <>
                        <FaSpinner className="spinner" />
                        <span>Signing in...</span>
                      </>
                    ) : (
                      <span>Sign In</span>
                    )}
                  </button>
                  <p className="auth-switch">
                    Don't have an account?{" "}
                    <button type="button" onClick={() => setShowRegister(true)}>
                      Create one
                    </button>
                  </p>
                </form>
              ) : (
                <form className="auth-form-modern" onSubmit={register}>
                  <div className="input-group">
                    <label>Username</label>
                    <input
                      type="text"
                      name="username"
                      placeholder="johndoe"
                      required
                    />
                  </div>
                  <div className="input-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      name="email"
                      placeholder="you@example.com"
                      required
                    />
                  </div>
                  <div className="input-group">
                    <label>Password</label>
                    <input
                      type="password"
                      name="password"
                      placeholder="••••••••"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    className="auth-submit-modern"
                    disabled={loading.register}
                  >
                    {loading.register ? (
                      <>
                        <FaSpinner className="spinner" />
                        <span>Creating account...</span>
                      </>
                    ) : (
                      <span>Create Account</span>
                    )}
                  </button>
                  <p className="auth-switch">
                    Already have an account?{" "}
                    <button
                      type="button"
                      onClick={() => setShowRegister(false)}
                    >
                      Sign in
                    </button>
                  </p>
                </form>
              )}
            </div>
          </div>
        </section>

        <section id="features" className="features-section">
          <div className="features-header">
            <span className="features-badge">Features</span>
            <h2>Everything you need to create and share</h2>
            <p>Powerful tools for modern content creators</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <FaCloud />
              </div>
              <h3>Cloud Storage</h3>
              <p>
                Your videos are securely stored in the cloud with automatic
                backups and global CDN delivery.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <FaBolt />
              </div>
              <h3>Lightning Fast</h3>
              <p>
                Experience instant uploads and smooth playback with our
                optimized streaming infrastructure.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <FaShieldAlt />
              </div>
              <h3>Secure & Private</h3>
              <p>
                Enterprise-grade security with encrypted storage and granular
                access controls.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <FaChartBar />
              </div>
              <h3>Analytics</h3>
              <p>
                Track your video performance with detailed analytics and
                engagement metrics.
              </p>
            </div>
          </div>
        </section>

        {alert && (
          <div className="alert-container">
            <div className={`alert-modern alert-${alert.type}`}>
              <span>{alert.message}</span>
              <button onClick={() => setAlert(null)}>
                <FaTimes />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (showAdminPanel) {
    return (
      <AdminPanel
        currentUser={currentUser}
        onBack={() => setShowAdminPanel(false)}
      />
    );
  }

  // Main App
  return (
    <div className="app-main">
      <header className="app-header-modern">
        <div className="header-left">
          <div className="brand-icon-small">
            <FaVideo />
          </div>
          <span className="brand-name-small">StreamVault</span>
        </div>

        <div className="header-right">
          <button
            className="header-btn"
            onClick={() => setShowUpload(true)}
            title="Upload"
          >
            <FaUpload />
            <span>Upload</span>
          </button>
          <button
            className="header-btn-icon"
            onClick={() => setShowDashboard(true)}
            title="Dashboard"
          >
            <FaChartBar />
          </button>
          {isAdmin && (
            <button
              className="header-btn-icon"
              onClick={() => setShowAdminPanel(true)}
              title="Admin"
            >
              <FaUserShield />
            </button>
          )}
          <div className="user-menu">
            <div className="user-avatar">
              {currentUser?.username?.charAt(0).toUpperCase() || "U"}
            </div>
            <div className="user-dropdown">
              <div className="user-info-dropdown">
                <span className="user-name">{currentUser?.username}</span>
                <span className="user-email">{currentUser?.email}</span>
              </div>
              <div className="dropdown-divider"></div>
              <button onClick={logout} className="dropdown-item logout-item">
                <FaSignOutAlt />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="video-feed" ref={containerRef}>
        {videos.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">
              <FaVideo />
            </div>
            <h2>No videos yet</h2>
            <p>Be the first to share something amazing!</p>
            <button onClick={() => setShowUpload(true)} className="empty-cta">
              <FaUpload />
              <span>Upload Your First Video</span>
            </button>
          </div>
        ) : (
          videos.map((video) => {
            const videoUserId = video.userId || currentUser.userId;
            const videoKey = `${videoUserId}-${video.filename}`;
            // Always use the stream endpoint - it handles both GCS (via signed URL redirect) and local files
            const videoUrl = `${API_BASE_URL}/api/videos/stream/${videoUserId}/${
              video.filename
            }?token=${localStorage.getItem("authToken")}`;
            const isCurrentlyPlaying = playingVideo === videoKey;

            return (
              <div key={videoKey} className="video-card">
                <div
                  className="video-wrapper"
                  onClick={() => togglePlay(videoKey)}
                >
                  <video
                    ref={(el) => {
                      if (el) videoRefs.current[videoKey] = el;
                    }}
                    className="video-player-modern"
                    loop
                    playsInline
                    muted={isMuted}
                    preload="auto"
                    src={videoUrl}
                    data-videokey={videoKey}
                    controls
                    onLoadedData={() =>
                      console.log(`Video loaded: ${videoKey}`)
                    }
                    onError={(e) =>
                      console.error(
                        `Video error for ${videoKey}:`,
                        e.target.error
                      )
                    }
                  />

                  {/* Play/Pause indicator - shows on hover */}
                  <div
                    className="play-indicator"
                    onClick={() => togglePlay(videoKey)}
                  >
                    {isCurrentlyPlaying ? <FaPause /> : <FaPlay />}
                  </div>

                  <div className="video-controls-overlay">
                    <button
                      className="control-btn mute-btn"
                      onClick={toggleMute}
                    >
                      {isMuted ? <FaVolumeMute /> : <FaVolumeUp />}
                    </button>
                  </div>

                  <div className="video-info-overlay">
                    <div className="video-meta">
                      <div className="video-author">
                        <div className="author-avatar">
                          {video.username?.charAt(0).toUpperCase() || "U"}
                        </div>
                        <div className="author-info">
                          <span className="author-name">
                            @{video.username || "user"}
                          </span>
                          <span className="video-date">
                            <FaClock />{" "}
                            {new Date(video.uploadedAt).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      <h3 className="video-title">{video.originalName}</h3>
                    </div>
                  </div>

                  <div className="video-actions">
                    <button className="action-btn">
                      <FaHeart />
                      <span>0</span>
                    </button>
                    <button className="action-btn">
                      <FaShare />
                    </button>
                    {videoUserId === currentUser.userId && (
                      <button
                        className="action-btn delete-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteVideo(video.filename);
                        }}
                        disabled={loading.deletingVideos.has(video.filename)}
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
              </div>
            );
          })
        )}
      </main>

      {showDashboard && (
        <div className="modal-overlay" onClick={() => setShowDashboard(false)}>
          <div className="modal-modern" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-modern">
              <h2>Dashboard</h2>
              <button
                className="modal-close"
                onClick={() => setShowDashboard(false)}
              >
                <FaTimes />
              </button>
            </div>
            <div className="dashboard-content">
              <div className="dashboard-card">
                <div className="dashboard-card-header">
                  <FaCloud className="dashboard-icon" />
                  <h3>Storage Usage</h3>
                </div>
                <div className="progress-modern">
                  <div
                    className="progress-fill-modern"
                    style={{
                      width: `${Math.min(storagePercent, 100)}%`,
                      background:
                        storagePercent >= 90
                          ? "linear-gradient(90deg, #ef4444, #dc2626)"
                          : storagePercent >= 70
                          ? "linear-gradient(90deg, #f59e0b, #d97706)"
                          : "linear-gradient(90deg, #667eea, #764ba2)",
                    }}
                  ></div>
                </div>
                <div className="dashboard-stats">
                  <span>
                    {storage
                      ? `${(storage.usedStorage / (1024 * 1024)).toFixed(2)} MB`
                      : "0 MB"}
                  </span>
                  <span>
                    {storage
                      ? `${(storage.maxStorage / (1024 * 1024)).toFixed(2)} MB`
                      : "50 MB"}
                  </span>
                </div>
              </div>

              <div className="dashboard-card">
                <div className="dashboard-card-header">
                  <FaBolt className="dashboard-icon" />
                  <h3>Daily Bandwidth</h3>
                </div>
                <div className="progress-modern">
                  <div
                    className="progress-fill-modern"
                    style={{
                      width: `${Math.min(bandwidthPercent, 100)}%`,
                      background:
                        bandwidthPercent >= 90
                          ? "linear-gradient(90deg, #ef4444, #dc2626)"
                          : bandwidthPercent >= 70
                          ? "linear-gradient(90deg, #f59e0b, #d97706)"
                          : "linear-gradient(90deg, #667eea, #764ba2)",
                    }}
                  ></div>
                </div>
                <div className="dashboard-stats">
                  <span>
                    {usage
                      ? `${(usage.totalVolume / (1024 * 1024)).toFixed(2)} MB`
                      : "0 MB"}
                  </span>
                  <span>
                    {usage
                      ? `${(usage.maxDailyBandwidth / (1024 * 1024)).toFixed(
                          2
                        )} MB`
                      : "100 MB"}
                  </span>
                </div>
              </div>

              <div className="dashboard-card full-width">
                <div className="dashboard-card-header">
                  <FaVideo className="dashboard-icon" />
                  <h3>Your Videos</h3>
                </div>
                <div className="dashboard-video-count">
                  <span className="count">
                    {
                      videos.filter((v) => v.userId === currentUser.userId)
                        .length
                    }
                  </span>
                  <span className="label">Videos Uploaded</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showUpload && (
        <div className="modal-overlay" onClick={() => setShowUpload(false)}>
          <div
            className="modal-modern upload-modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header-modern">
              <h2>Upload Video</h2>
              <button
                className="modal-close"
                onClick={() => setShowUpload(false)}
              >
                <FaTimes />
              </button>
            </div>
            <form className="upload-form-modern" onSubmit={uploadVideo}>
              <div className="upload-dropzone">
                <input
                  type="file"
                  name="video"
                  id="video-input"
                  accept="video/*"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (file) {
                      document.getElementById("file-info").textContent = `${
                        file.name
                      } (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
                      document.getElementById("upload-btn").disabled = false;
                    }
                  }}
                />
                <label htmlFor="video-input" className="dropzone-content">
                  <FaUpload className="dropzone-icon" />
                  <span className="dropzone-text">Click to select a video</span>
                  <span className="dropzone-hint">
                    MP4, WebM, MOV up to 50MB
                  </span>
                </label>
              </div>
              <p id="file-info" className="file-info"></p>
              {loading.upload && (
                <div className="upload-progress">
                  <div className="progress-modern">
                    <div
                      className="progress-fill-modern"
                      style={{ width: `${uploadProgress}%` }}
                    ></div>
                  </div>
                  <span>{uploadProgress}%</span>
                </div>
              )}
              <button
                type="submit"
                id="upload-btn"
                className="upload-submit"
                disabled={loading.upload}
              >
                {loading.upload ? (
                  <>
                    <FaSpinner className="spinner" />
                    <span>Uploading...</span>
                  </>
                ) : (
                  <>
                    <FaUpload />
                    <span>Upload Video</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {alert && (
        <div className="alert-container">
          <div className={`alert-modern alert-${alert.type}`}>
            <span>{alert.message}</span>
            <button onClick={() => setAlert(null)}>
              <FaTimes />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
