const express = require("express");
const cors = require("cors");
const axios = require("axios");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const { Storage } = require("@google-cloud/storage");

// Load environment variables from .env file in service directory
require("dotenv").config({ path: path.join(__dirname, ".env") });

const app = express();
app.use(express.json());

// CORS configuration to allow credentials and Authorization header
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl, etc) or from frontend
      const allowedOrigins = [
        process.env.FRONTEND_URL || "http://localhost:3000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
      ];
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(null, true); // Allow all for now, restrict in production
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["Authorization"],
  })
);

// Handle preflight requests
app.options("*", cors());

// Service URLs
const USER_SERVICE_URL =
  process.env.USER_SERVICE_URL || "http://localhost:3001";
const MODEL_SERVICE_URL =
  process.env.MODEL_SERVICE_URL || "http://localhost:3004";
const STORAGE_SERVICE_URL =
  process.env.STORAGE_SERVICE_URL || "http://localhost:3002";
const LOGGING_SERVICE_URL =
  process.env.LOGGING_SERVICE_URL || "http://localhost:3006";

// JWT Secret (must match user service)
const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";

// Google Cloud Storage configuration
const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME || "videostream-videos";
const GCS_PROJECT_ID =
  process.env.GCS_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;

// Initialize GCS
let storage;
let bucket;

try {
  if (GCS_PROJECT_ID) {
    // Check for service account key file in same directory as server.js
    const keyFileName = "deductive-state-481809-c4-d7a56c8c2804.json";
    const keyFilePath = path.join(__dirname, keyFileName);
    const credentialsPath =
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      (fs.existsSync(keyFilePath) ? keyFilePath : null);

    const storageConfig = {
      projectId: GCS_PROJECT_ID,
    };

    // If key file exists, use it explicitly
    if (credentialsPath && fs.existsSync(credentialsPath)) {
      storageConfig.keyFilename = credentialsPath;
      console.log(`Using GCS credentials from: ${credentialsPath}`);
    } else {
      // In GCP (GKE), credentials are automatically provided via service account
      // For local dev without key file, the client library will try to use
      // default credentials or GOOGLE_APPLICATION_CREDENTIALS env var
      console.log("Using default GCS credentials (service account or env var)");
    }

    storage = new Storage(storageConfig);
    bucket = storage.bucket(GCS_BUCKET_NAME);
    console.log(`GCS initialized with bucket: ${GCS_BUCKET_NAME}`);
  } else {
    console.warn(
      "GCS_PROJECT_ID not set, using local file storage as fallback"
    );
  }
} catch (error) {
  console.error("GCS initialization error:", error.message);
  console.warn("Falling back to local file storage");
}

// Temporary upload directory (for local fallback or temp processing)
const TEMP_UPLOAD_DIR = process.env.TEMP_UPLOAD_DIR || "./temp_uploads";
if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
  fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
}

// Multer configuration - store in memory for GCS upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// Helper function to upload file to GCS
async function uploadToGCS(fileBuffer, fileName, userId, originalName) {
  if (!bucket) {
    throw new Error("GCS bucket not initialized");
  }

  const gcsFileName = `${userId}/${fileName}`;
  const file = bucket.file(gcsFileName);

  // Set metadata
  const metadata = {
    contentType: "video/mp4",
    metadata: {
      originalName: originalName,
      userId: userId,
      uploadedAt: new Date().toISOString(),
    },
  };

  // Upload file using a promise wrapper for better error handling
  return new Promise((resolve, reject) => {
    const stream = file.createWriteStream({
      metadata: metadata,
      resumable: false,
    });

    stream.on("error", (err) => {
      console.error("GCS upload stream error:", err.message);
      reject(err);
    });

    stream.on("finish", () => {
      resolve({
        gcsFileName,
        gcsPath: gcsFileName,
        // No publicUrl - files are private and accessed via signed URLs
      });
    });

    // Write buffer to stream
    stream.end(fileBuffer);
  });
}

// Helper function to delete file from GCS
async function deleteFromGCS(gcsPath) {
  if (!bucket) {
    return false;
  }

  try {
    const file = bucket.file(gcsPath);
    await file.delete();
    return true;
  } catch (error) {
    console.error("Error deleting file from GCS:", error.message);
    return false;
  }
}

// Helper function to get signed URL for private streaming
async function getSignedUrl(gcsPath, expiresInMinutes = 60) {
  if (!bucket) {
    return null;
  }

  try {
    const file = bucket.file(gcsPath);
    const [signedUrl] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + expiresInMinutes * 60 * 1000,
    });
    return signedUrl;
  } catch (error) {
    console.error("Error generating signed URL:", error.message);
    return null;
  }
}

// Helper function to verify token
async function verifyToken(token) {
  const DEBUG_AUTH = process.env.DEBUG_AUTH === "true";
  try {
    if (DEBUG_AUTH) {
      console.log(
        "Verifying token with JWT_SECRET:",
        JWT_SECRET ? "SET" : "NOT SET"
      );
      console.log(
        "JWT_SECRET value (first 10 chars):",
        JWT_SECRET ? JWT_SECRET.substring(0, 10) + "..." : "NOT SET"
      );
      console.log("JWT_SECRET type:", typeof JWT_SECRET);
    }

    // Validate JWT_SECRET before using it
    if (
      !JWT_SECRET ||
      typeof JWT_SECRET !== "string" ||
      JWT_SECRET.trim() === ""
    ) {
      console.error("CRITICAL: JWT_SECRET is not properly configured:", {
        exists: !!JWT_SECRET,
        type: typeof JWT_SECRET,
        isEmpty: JWT_SECRET ? JWT_SECRET.trim() === "" : true,
      });
      throw new Error(
        "Server configuration error: JWT_SECRET not properly set"
      );
    }

    // First try to verify JWT token locally
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
      if (DEBUG_AUTH)
        console.log("JWT token decoded successfully:", {
          userId: decoded.userId,
          email: decoded.email,
        });

      // If JWT verified, optionally fetch fresh user data from user service
      try {
        const response = await axios.get(
          `${USER_SERVICE_URL}/api/users/${decoded.userId}`,
          {
            timeout: 5000, // 5 second timeout
          }
        );
        if (DEBUG_AUTH)
          console.log("Fresh user data fetched from user service");
        return {
          userId: response.data._id || response.data.userId || decoded.userId,
          email: response.data.email || decoded.email,
          username: response.data.username || decoded.username,
          role: response.data.role || decoded.role || "user",
          tenantId: response.data.tenantId || decoded.tenantId,
        };
      } catch (serviceError) {
        // If user service is unavailable, use decoded token data (for resilience)
        if (DEBUG_AUTH)
          console.warn(
            "User service unavailable, using token data:",
            serviceError.message
          );
        return {
          userId: decoded.userId,
          email: decoded.email,
          username: decoded.username,
          role: decoded.role || "user",
          tenantId: decoded.tenantId,
        };
      }
    } catch (jwtError) {
      if (DEBUG_AUTH)
        console.error("JWT verification failed:", jwtError.message);
      // If JWT verification fails (likely due to secret mismatch), try calling user service as fallback
      try {
        const response = await axios.get(`${USER_SERVICE_URL}/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
        });
        if (DEBUG_AUTH)
          console.log(
            "Token verified via user service (JWT_SECRET mismatch - using service verification)"
          );
        return {
          userId: response.data._id || response.data.userId,
          email: response.data.email,
          username: response.data.username,
          role: response.data.role || "user",
          tenantId: response.data.tenantId,
        };
      } catch (serviceError) {
        console.error(
          "User service verification failed:",
          serviceError.response?.status,
          serviceError.response?.data?.error || serviceError.message
        );
        return null;
      }
    }
  } catch (error) {
    console.error(
      "Token verification failed with unexpected error:",
      error.message
    );
    return null;
  }
}

// Helper function to log events
async function logEvent(level, service, message, userId = null) {
  try {
    await axios.post(`${LOGGING_SERVICE_URL}/api/logs`, {
      level,
      service: "ControllerServ",
      message,
      userId,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to log event:", error.message);
  }
}

// Authentication middleware (supports header or query parameter for video streaming)
const authenticate = async (req, res, next) => {
  const DEBUG_AUTH = process.env.DEBUG_AUTH === "true";
  try {
    if (DEBUG_AUTH) {
      console.log("=== Authentication Request ===");
      console.log("Authorization header:", req.headers.authorization);
      console.log("Query token:", req.query.token ? "present" : "not present");
      console.log("JWT_SECRET available:", JWT_SECRET ? "YES" : "NO");
    }

    // Log JWT_SECRET status at runtime
    if (!JWT_SECRET) {
      console.error("CRITICAL: JWT_SECRET is undefined or empty!");
      return res
        .status(500)
        .json({ error: "Server configuration error: JWT_SECRET not set" });
    }

    // Try to get token from Authorization header first, then from query parameter
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader) {
      // Extract token from header - handle both "Bearer token" and just "token" formats
      token = authHeader.startsWith("Bearer ")
        ? authHeader.substring(7)
        : authHeader;
    } else if (req.query.token) {
      // Fallback: get token from query parameter (useful for video streaming with HTML5 video tags)
      token = req.query.token;
    }

    if (!token || token.trim() === "") {
      if (DEBUG_AUTH) console.error("No token found in header or query");
      return res.status(401).json({ error: "No token provided" });
    }

    if (DEBUG_AUTH)
      console.log(
        "Token extracted (first 20 chars):",
        token.substring(0, 20) + "..."
      );

    const user = await verifyToken(token);
    if (!user) {
      if (DEBUG_AUTH) console.error("Token verification returned null");
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    if (DEBUG_AUTH)
      console.log(
        "Token verified successfully for user:",
        user.userId || user.email
      );
    req.user = user;
    next();
  } catch (error) {
    console.error(
      "Authentication middleware error:",
      error.message,
      error.stack
    );
    res.status(500).json({ error: error.message });
  }
};

// Register user
app.post("/api/auth/register", async (req, res) => {
  try {
    const response = await axios.post(
      `${USER_SERVICE_URL}/api/users/register`,
      req.body
    );

    // Initialize storage for new user
    await axios
      .post(`${STORAGE_SERVICE_URL}/api/storage/initialize`, {
        userId: response.data.userId,
      })
      .catch((err) =>
        console.error("Storage initialization failed:", err.message)
      );

    await logEvent(
      "info",
      "ControllerServ",
      `User registered: ${req.body.username}`
    );
    res.status(201).json(response.data);
  } catch (error) {
    await logEvent(
      "error",
      "ControllerServ",
      `Registration error: ${error.message}`
    );
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const response = await axios.post(
      `${USER_SERVICE_URL}/api/users/login`,
      req.body
    );
    await logEvent(
      "info",
      "ControllerServ",
      `User logged in: ${req.body.email}`,
      response.data.user.userId
    );
    res.json(response.data);
  } catch (error) {
    await logEvent("error", "ControllerServ", `Login error: ${error.message}`);
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Upload video
app.post(
  "/api/videos/upload",
  authenticate,
  upload.single("video"),
  async (req, res) => {
    try {
      console.log("=== Upload Request Started ===");

      if (!req.file) {
        console.log("No file in request");
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { userId } = req.user;
      const fileSize = req.file.size;
      const originalName = req.file.originalname;
      const fileBuffer = req.file.buffer;

      console.log(
        `Upload: userId=${userId}, file=${originalName}, size=${fileSize}`
      );

      // Generate unique filename
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const filename = uniqueSuffix + path.extname(originalName);

      // Validate upload using model service
      console.log("Validating upload with model service...");
      const validation = await axios.post(
        `${MODEL_SERVICE_URL}/api/videos/validate-upload`,
        {
          userId,
          fileSize,
        }
      );

      console.log("Validation result:", validation.data);

      if (!validation.data.valid) {
        console.log("Validation failed:", validation.data);
        return res.status(403).json(validation.data);
      }

      // Upload to GCS
      console.log("Uploading to GCS...");
      let gcsResult;
      try {
        gcsResult = await uploadToGCS(
          fileBuffer,
          filename,
          userId,
          originalName
        );
        console.log("GCS upload successful:", gcsResult);
      } catch (gcsError) {
        console.error("GCS upload error:", gcsError.message, gcsError.stack);
        await logEvent(
          "error",
          "ControllerServ",
          `GCS upload error: ${gcsError.message}`,
          userId
        );

        // Fallback to local storage if GCS fails
        if (!bucket) {
          const userStorageDir = path.join(TEMP_UPLOAD_DIR, userId);
          if (!fs.existsSync(userStorageDir)) {
            fs.mkdirSync(userStorageDir, { recursive: true });
          }
          const localPath = path.join(userStorageDir, filename);
          fs.writeFileSync(localPath, fileBuffer);
          // For local fallback, use streaming endpoint URL
          gcsResult = {
            gcsFileName: filename,
            gcsPath: `${userId}/${filename}`,
            // Use streaming endpoint URL for local files
            gcsUrl: `${req.protocol}://${req.get(
              "host"
            )}/api/videos/stream/${userId}/${filename}`,
          };
        } else {
          throw gcsError;
        }
      }

      // Process upload through model service (with GCS path)
      // gcsUrl will be null/undefined for GCS files (they use signed URLs for streaming)
      // or the streaming endpoint URL for local fallback files
      const result = await axios.post(
        `${MODEL_SERVICE_URL}/api/videos/process-upload`,
        {
          userId,
          filename,
          originalName,
          size: fileSize,
          filePath: gcsResult.gcsPath,
          gcsUrl: gcsResult.gcsUrl || null, // Only set for local files, GCS uses signed URLs
        }
      );

      await logEvent(
        "info",
        "ControllerServ",
        `Video uploaded to GCS: ${originalName}`,
        userId
      );
      res.json(result.data);
    } catch (error) {
      await logEvent(
        "error",
        "ControllerServ",
        `Upload error: ${error.message}`,
        req.user?.userId
      );
      if (error.response) {
        return res.status(error.response.status).json(error.response.data);
      }
      res.status(500).json({ error: error.message });
    }
  }
);

// Stream video (redirects to GCS or serves from local)
app.get(
  "/api/videos/stream/:userId/:filename",
  authenticate,
  async (req, res) => {
    try {
      const { userId, filename } = req.params;

      // Allow access to all videos in public feed (no ownership check)
      // Users can view videos from any user

      // Get file info from storage service
      const storageInfo = await axios.get(
        `${STORAGE_SERVICE_URL}/api/storage/${userId}`
      );
      const file = storageInfo.data.files.find((f) => f.filename === filename);

      if (!file) {
        return res.status(404).json({ error: "Video not found" });
      }

      // If file has GCS path, generate signed URL (preferred for GCS files)
      // Signed URLs work with uniform bucket-level access enabled
      if (file.gcsPath && bucket) {
        const signedUrl = await getSignedUrl(file.gcsPath, 60); // 60 minutes
        if (signedUrl) {
          return res.redirect(signedUrl);
        }
      }

      // Fallback: If file has gcsUrl (for local files only), redirect to it
      if (file.gcsUrl) {
        return res.redirect(file.gcsUrl);
      }

      // Fallback to local file
      const filePath = path.join(TEMP_UPLOAD_DIR, userId, filename);
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        if (range) {
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
          const chunksize = end - start + 1;
          const fileStream = fs.createReadStream(filePath, { start, end });
          const head = {
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Accept-Ranges": "bytes",
            "Content-Length": chunksize,
            "Content-Type": "video/mp4",
          };
          res.writeHead(206, head);
          fileStream.pipe(res);
        } else {
          const head = {
            "Content-Length": fileSize,
            "Content-Type": "video/mp4",
          };
          res.writeHead(200, head);
          fs.createReadStream(filePath).pipe(res);
        }
      } else {
        return res.status(404).json({ error: "Video file not found" });
      }
    } catch (error) {
      await logEvent(
        "error",
        "ControllerServ",
        `Stream error: ${error.message}`,
        req.user?.userId
      );
      res.status(500).json({ error: error.message });
    }
  }
);

// Get user videos
app.get("/api/videos", authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const response = await axios.get(
      `${STORAGE_SERVICE_URL}/api/storage/${userId}`
    );
    res.json({
      videos: response.data.files || [],
      storage: {
        used: response.data.usedStorage,
        max: response.data.maxStorage,
        usagePercent: response.data.usagePercent,
      },
    });
  } catch (error) {
    await logEvent(
      "error",
      "ControllerServ",
      `Get videos error: ${error.message}`,
      req.user?.userId
    );
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Get public videos feed (all users' videos)
app.get("/api/videos/public", authenticate, async (req, res) => {
  try {
    const response = await axios.get(
      `${STORAGE_SERVICE_URL}/api/storage/public/videos`
    );
    res.json({
      videos: response.data.videos || [],
    });
  } catch (error) {
    await logEvent(
      "error",
      "ControllerServ",
      `Get public videos error: ${error.message}`,
      req.user?.userId
    );
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete video
app.delete("/api/videos/:filename", authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { filename } = req.params;

    // Get file info first
    const storageInfo = await axios.get(
      `${STORAGE_SERVICE_URL}/api/storage/${userId}`
    );
    const file = storageInfo.data.files.find((f) => f.filename === filename);

    if (!file) {
      return res.status(404).json({ error: "File not found" });
    }

    // Delete from GCS if gcsPath exists
    if (file.gcsPath) {
      await deleteFromGCS(file.gcsPath);
    }

    // Delete from local storage if exists (fallback)
    const filePath = path.join(TEMP_UPLOAD_DIR, userId, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Process deletion through model service
    const result = await axios.post(
      `${MODEL_SERVICE_URL}/api/videos/process-delete`,
      {
        userId,
        filename,
        size: file.size,
      }
    );

    await logEvent(
      "info",
      "ControllerServ",
      `Video deleted: ${filename}`,
      userId
    );
    res.json(result.data);
  } catch (error) {
    await logEvent(
      "error",
      "ControllerServ",
      `Delete video error: ${error.message}`,
      req.user?.userId
    );
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete videos
app.post("/api/videos/bulk-delete", authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const { filenames } = req.body;

    if (!Array.isArray(filenames) || filenames.length === 0) {
      return res.status(400).json({ error: "Invalid filenames array" });
    }

    // Get storage info to find file info
    const storageInfo = await axios.get(
      `${STORAGE_SERVICE_URL}/api/storage/${userId}`
    );
    const filesToDelete = storageInfo.data.files.filter((f) =>
      filenames.includes(f.filename)
    );

    // Delete files from GCS
    for (const file of filesToDelete) {
      if (file.gcsPath) {
        await deleteFromGCS(file.gcsPath);
      }
      // Delete from local storage if exists (fallback)
      const filePath = path.join(TEMP_UPLOAD_DIR, userId, file.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    const response = await axios.post(
      `${STORAGE_SERVICE_URL}/api/storage/${userId}/bulk-delete`,
      { filenames }
    );

    await logEvent(
      "info",
      "ControllerServ",
      `Bulk delete: ${filenames.length} videos`,
      userId
    );
    res.json(response.data);
  } catch (error) {
    await logEvent(
      "error",
      "ControllerServ",
      `Bulk delete error: ${error.message}`,
      req.user?.userId
    );
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Get dashboard
app.get("/api/dashboard", authenticate, async (req, res) => {
  try {
    const { userId } = req.user;
    const response = await axios.get(
      `${MODEL_SERVICE_URL}/api/dashboard/${userId}`
    );
    res.json(response.data);
  } catch (error) {
    await logEvent(
      "error",
      "ControllerServ",
      `Get dashboard error: ${error.message}`,
      req.user?.userId
    );
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// ==================== ADMIN ENDPOINTS ====================

// Admin middleware - check if user is admin
const adminAuth = async (req, res, next) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: "Admin authorization failed" });
  }
};

// Get all users (admin only)
app.get("/api/admin/users", authenticate, adminAuth, async (req, res) => {
  try {
    const token = req.headers.authorization;
    const response = await axios.get(`${USER_SERVICE_URL}/api/users`, {
      headers: { Authorization: token },
    });
    res.json(response.data);
  } catch (error) {
    await logEvent(
      "error",
      "ControllerServ",
      `Admin get users error: ${error.message}`
    );
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Update user role (admin only)
app.put(
  "/api/admin/users/:userId/role",
  authenticate,
  adminAuth,
  async (req, res) => {
    try {
      const token = req.headers.authorization;
      const { userId } = req.params;
      const response = await axios.put(
        `${USER_SERVICE_URL}/api/users/${userId}/role`,
        req.body,
        { headers: { Authorization: token } }
      );
      await logEvent(
        "info",
        "ControllerServ",
        `Admin updated user role: ${userId}`
      );
      res.json(response.data);
    } catch (error) {
      await logEvent(
        "error",
        "ControllerServ",
        `Admin update role error: ${error.message}`
      );
      if (error.response) {
        return res.status(error.response.status).json(error.response.data);
      }
      res.status(500).json({ error: error.message });
    }
  }
);

// Get storage stats (admin only)
app.get(
  "/api/admin/storage/stats",
  authenticate,
  adminAuth,
  async (req, res) => {
    try {
      const response = await axios.get(
        `${STORAGE_SERVICE_URL}/api/storage/admin/stats`
      );
      res.json(response.data);
    } catch (error) {
      await logEvent(
        "error",
        "ControllerServ",
        `Admin get storage stats error: ${error.message}`
      );
      if (error.response) {
        return res.status(error.response.status).json(error.response.data);
      }
      res.status(500).json({ error: error.message });
    }
  }
);

// Get logs (admin only)
app.get("/api/admin/logs", authenticate, adminAuth, async (req, res) => {
  try {
    const queryString = new URLSearchParams(req.query).toString();
    const response = await axios.get(
      `${LOGGING_SERVICE_URL}/api/logs?${queryString}`
    );
    res.json(response.data);
  } catch (error) {
    await logEvent(
      "error",
      "ControllerServ",
      `Admin get logs error: ${error.message}`
    );
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    service: "ControllerServ",
    gcsEnabled: !!bucket,
    bucket: bucket ? GCS_BUCKET_NAME : null,
  });
});

const PORT = process.env.PORT || 3005;
const server = app.listen(PORT, () => {
  console.log(`Controller Service running on port ${PORT}`);
  console.log(
    `GCS Bucket: ${
      bucket ? GCS_BUCKET_NAME : "Not configured (using local storage)"
    }`
  );
  console.log(
    `JWT_SECRET: ${JWT_SECRET ? "SET" : "NOT SET"} (${
      JWT_SECRET === "your-secret-key"
        ? "using default - change in production!"
        : "configured"
    })`
  );
  console.log(`USER_SERVICE_URL: ${USER_SERVICE_URL}`);
  console.log(
    `FRONTEND_URL: ${process.env.FRONTEND_URL || "http://localhost:3000"}`
  );
});

// Set server timeouts for large file uploads
server.timeout = 300000; // 5 minutes
server.keepAliveTimeout = 120000; // 2 minutes
server.headersTimeout = 120000; // 2 minutes
