const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env file in service directory
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(express.json());
app.use(cors());

// Storage configuration
const STORAGE_DIR = process.env.STORAGE_DIR || './uploads';
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/videostream_storage';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Storage Schema
const storageSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  usedStorage: { type: Number, default: 0 }, // in bytes
  maxStorage: { type: Number, default: 50 * 1024 * 1024 }, // 50MB in bytes
  files: [{
    filename: String,
    originalName: String,
    size: Number,
    uploadedAt: Date,
    filePath: String, // Legacy field, now stores GCS path
    gcsPath: String, // GCS path in bucket (e.g., userId/filename)
    gcsUrl: String   // Public GCS URL
  }],
  alertSent: { type: Boolean, default: false }
});

const Storage = mongoose.model('Storage', storageSchema);

// Logging service URL
const LOGGING_SERVICE_URL = process.env.LOGGING_SERVICE_URL || 'http://localhost:3006';

// Helper function to log events
async function logEvent(level, service, message, userId = null) {
  try {
    await axios.post(`${LOGGING_SERVICE_URL}/api/logs`, {
      level,
      service: 'StorageMgmtServ',
      message,
      userId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log event:', error.message);
  }
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.body.userId || req.user?.userId;
    const userDir = path.join(STORAGE_DIR, userId);
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

// Initialize storage for user
app.post('/api/storage/initialize', async (req, res) => {
  try {
    const { userId } = req.body;
    
    let storage = await Storage.findOne({ userId });
    if (!storage) {
      storage = new Storage({ userId });
      await storage.save();
      await logEvent('info', 'StorageMgmtServ', `Storage initialized for user: ${userId}`, userId);
    }
    
    res.json({
      userId: storage.userId,
      usedStorage: storage.usedStorage,
      maxStorage: storage.maxStorage,
      usagePercent: (storage.usedStorage / storage.maxStorage * 100).toFixed(2)
    });
  } catch (error) {
    await logEvent('error', 'StorageMgmtServ', `Initialize storage error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get storage info
app.get('/api/storage/:userId', async (req, res) => {
  try {
    const storage = await Storage.findOne({ userId: req.params.userId });
    if (!storage) {
      return res.status(404).json({ error: 'Storage not found' });
    }

    const usagePercent = (storage.usedStorage / storage.maxStorage * 100);
    const alertThreshold = 80;
    const isFull = storage.usedStorage >= storage.maxStorage;

    res.json({
      userId: storage.userId,
      usedStorage: storage.usedStorage,
      maxStorage: storage.maxStorage,
      usagePercent: usagePercent.toFixed(2),
      alertThreshold: alertThreshold,
      alertSent: storage.alertSent,
      canUpload: !isFull,
      files: storage.files
    });
  } catch (error) {
    await logEvent('error', 'StorageMgmtServ', `Get storage error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Check if user can upload
app.get('/api/storage/:userId/can-upload', async (req, res) => {
  try {
    const storage = await Storage.findOne({ userId: req.params.userId });
    if (!storage) {
      return res.status(404).json({ error: 'Storage not found' });
    }

    const usagePercent = (storage.usedStorage / storage.maxStorage * 100);
    const canUpload = storage.usedStorage < storage.maxStorage;
    const shouldAlert = usagePercent >= 80 && !storage.alertSent;

    if (shouldAlert) {
      storage.alertSent = true;
      await storage.save();
      await logEvent('warn', 'StorageMgmtServ', `Storage alert: ${usagePercent.toFixed(2)}% used for user ${req.params.userId}`, req.params.userId);
    }

    res.json({
      canUpload,
      usagePercent: usagePercent.toFixed(2),
      usedStorage: storage.usedStorage,
      maxStorage: storage.maxStorage,
      alert: shouldAlert ? `Warning: ${usagePercent.toFixed(2)}% of storage used` : null
    });
  } catch (error) {
    await logEvent('error', 'StorageMgmtServ', `Check upload error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Add file to storage
app.post('/api/storage/:userId/add-file', async (req, res) => {
  try {
    const { userId } = req.params;
    const { filename, originalName, size, filePath, gcsPath, gcsUrl } = req.body;

    let storage = await Storage.findOne({ userId });
    if (!storage) {
      storage = new Storage({ userId });
    }

    // Check if storage is full
    if (storage.usedStorage >= storage.maxStorage) {
      await logEvent('warn', 'StorageMgmtServ', `Upload blocked: Storage full for user ${userId}`, userId);
      return res.status(403).json({ error: 'Storage limit reached. Please delete files to free space.' });
    }

    // Check if adding this file would exceed limit
    if (storage.usedStorage + size > storage.maxStorage) {
      await logEvent('warn', 'StorageMgmtServ', `Upload blocked: File too large for user ${userId}`, userId);
      return res.status(403).json({ error: 'File size exceeds available storage' });
    }

    storage.files.push({
      filename,
      originalName,
      size,
      uploadedAt: new Date(),
      filePath: filePath || gcsPath, // Legacy compatibility
      gcsPath: gcsPath || filePath,
      gcsUrl: gcsUrl
    });

    storage.usedStorage += size;
    const usagePercent = (storage.usedStorage / storage.maxStorage * 100);

    // Check if alert threshold reached
    if (usagePercent >= 80 && !storage.alertSent) {
      storage.alertSent = true;
      await logEvent('warn', 'StorageMgmtServ', `Storage alert: ${usagePercent.toFixed(2)}% used for user ${userId}`, userId);
    }

    await storage.save();
    await logEvent('info', 'StorageMgmtServ', `File added: ${originalName} (${size} bytes) for user ${userId}`, userId);

    res.json({
      message: 'File added successfully',
      usedStorage: storage.usedStorage,
      maxStorage: storage.maxStorage,
      usagePercent: usagePercent.toFixed(2),
      alert: usagePercent >= 80 ? `Warning: ${usagePercent.toFixed(2)}% of storage used` : null
    });
  } catch (error) {
    await logEvent('error', 'StorageMgmtServ', `Add file error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get all videos from all users (public feed)
app.get('/api/storage/public/videos', async (req, res) => {
  try {
    const allStorage = await Storage.find({});
    const allVideos = [];

    allStorage.forEach(storage => {
      storage.files.forEach(file => {
        allVideos.push({
          ...file.toObject(),
          userId: storage.userId // Include userId for each video
        });
      });
    });

    // Sort by upload date (newest first)
    allVideos.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));

    res.json({ videos: allVideos });
  } catch (error) {
    await logEvent('error', 'StorageMgmtServ', `Get public videos error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Delete file from storage (metadata only - physical file deleted by controller)
app.delete('/api/storage/:userId/files/:filename', async (req, res) => {
  try {
    const { userId, filename } = req.params;

    const storage = await Storage.findOne({ userId });
    if (!storage) {
      return res.status(404).json({ error: 'Storage not found' });
    }

    const fileIndex = storage.files.findIndex(f => f.filename === filename);
    if (fileIndex === -1) {
      return res.status(404).json({ error: 'File not found' });
    }

    const file = storage.files[fileIndex];

    // Update storage
    storage.usedStorage -= file.size;
    storage.files.splice(fileIndex, 1);

    // Reset alert if usage drops below 80%
    const usagePercent = (storage.usedStorage / storage.maxStorage * 100);
    if (usagePercent < 80) {
      storage.alertSent = false;
    }

    await storage.save();
    await logEvent('info', 'StorageMgmtServ', `File deleted: ${filename} for user ${userId}`, userId);

    res.json({
      message: 'File deleted successfully',
      usedStorage: storage.usedStorage,
      maxStorage: storage.maxStorage,
      usagePercent: usagePercent.toFixed(2)
    });
  } catch (error) {
    await logEvent('error', 'StorageMgmtServ', `Delete file error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Bulk delete files (metadata only - physical files deleted by controller)
app.post('/api/storage/:userId/bulk-delete', async (req, res) => {
  try {
    const { userId } = req.params;
    const { filenames } = req.body;

    const storage = await Storage.findOne({ userId });
    if (!storage) {
      return res.status(404).json({ error: 'Storage not found' });
    }

    let freedSpace = 0;
    const filesToDelete = storage.files.filter(f => filenames.includes(f.filename));

    for (const file of filesToDelete) {
      freedSpace += file.size;
      storage.files = storage.files.filter(f => f.filename !== file.filename);
    }

    storage.usedStorage -= freedSpace;
    const usagePercent = (storage.usedStorage / storage.maxStorage * 100);
    
    if (usagePercent < 80) {
      storage.alertSent = false;
    }

    await storage.save();
    await logEvent('info', 'StorageMgmtServ', `Bulk delete: ${filesToDelete.length} files for user ${userId}`, userId);

    res.json({
      message: `${filesToDelete.length} files deleted successfully`,
      freedSpace,
      usedStorage: storage.usedStorage,
      maxStorage: storage.maxStorage,
      usagePercent: usagePercent.toFixed(2)
    });
  } catch (error) {
    await logEvent('error', 'StorageMgmtServ', `Bulk delete error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'StorageMgmtServ' });
});

const PORT =  3002;
app.listen(PORT, () => {
  console.log(`Storage Management Service running on port ${PORT}`);
});

