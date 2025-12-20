const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

// Load environment variables from .env file in service directory
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(express.json());
app.use(cors());

// Service URLs
const USER_SERVICE_URL = process.env.USER_SERVICE_URL || 'http://localhost:3001';
const STORAGE_SERVICE_URL = process.env.STORAGE_SERVICE_URL || 'http://localhost:3002';
const USAGE_SERVICE_URL = process.env.USAGE_SERVICE_URL || 'http://localhost:3003';
const LOGGING_SERVICE_URL = process.env.LOGGING_SERVICE_URL || 'http://localhost:3006';

// Helper function to log events
async function logEvent(level, service, message, userId = null) {
  try {
    await axios.post(`${LOGGING_SERVICE_URL}/api/logs`, {
      level,
      service: 'ModelServ',
      message,
      userId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log event:', error.message);
  }
}

// Business logic: Validate video upload
app.post('/api/videos/validate-upload', async (req, res) => {
  try {
    const { userId, fileSize } = req.body;

    // Check storage availability
    const storageCheck = await axios.get(`${STORAGE_SERVICE_URL}/api/storage/${userId}/can-upload`);
    if (!storageCheck.data.canUpload) {
      await logEvent('warn', 'ModelServ', `Upload validation failed: Storage limit for user ${userId}`);
      return res.status(403).json({
        valid: false,
        reason: 'storage',
        message: storageCheck.data.alert || 'Storage limit reached'
      });
    }

    // Check bandwidth availability
    const bandwidthCheck = await axios.get(`${USAGE_SERVICE_URL}/api/usage/${userId}/can-upload`);
    if (!bandwidthCheck.data.canUpload) {
      await logEvent('warn', 'ModelServ', `Upload validation failed: Bandwidth limit for user ${userId}`);
      return res.status(403).json({
        valid: false,
        reason: 'bandwidth',
        message: bandwidthCheck.data.alert || 'Daily bandwidth limit exceeded'
      });
    }

    // Check if file size fits in remaining storage
    const storageInfo = await axios.get(`${STORAGE_SERVICE_URL}/api/storage/${userId}`);
    const availableStorage = storageInfo.data.maxStorage - storageInfo.data.usedStorage;
    
    if (fileSize > availableStorage) {
      await logEvent('warn', 'ModelServ', `Upload validation failed: File too large for user ${userId}`);
      return res.status(403).json({
        valid: false,
        reason: 'file_size',
        message: 'File size exceeds available storage'
      });
    }

    await logEvent('info', 'ModelServ', `Upload validated for user ${userId}`);
    res.json({
      valid: true,
      storage: {
        used: storageInfo.data.usedStorage,
        max: storageInfo.data.maxStorage,
        available: availableStorage
      },
      bandwidth: {
        used: bandwidthCheck.data.totalVolume,
        max: bandwidthCheck.data.maxDailyBandwidth,
        available: bandwidthCheck.data.maxDailyBandwidth - bandwidthCheck.data.totalVolume
      }
    });
  } catch (error) {
    await logEvent('error', 'ModelServ', `Validate upload error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Business logic: Process video upload
app.post('/api/videos/process-upload', async (req, res) => {
  try {
    const { userId, filename, originalName, size, filePath, gcsPath, gcsUrl } = req.body;

    // Record in storage service
    const storageResponse = await axios.post(
      `${STORAGE_SERVICE_URL}/api/storage/${userId}/add-file`,
      { filename, originalName, size, filePath, gcsPath, gcsUrl }
    );

    // Record in usage service
    const usageResponse = await axios.post(
      `${USAGE_SERVICE_URL}/api/usage/${userId}/upload`,
      { size }
    );

    await logEvent('info', 'ModelServ', `Video upload processed: ${originalName} for user ${userId}`, userId);

    res.json({
      message: 'Video upload processed successfully',
      storage: storageResponse.data,
      usage: usageResponse.data
    });
  } catch (error) {
    await logEvent('error', 'ModelServ', `Process upload error: ${error.message}`);
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Business logic: Process video deletion
app.post('/api/videos/process-delete', async (req, res) => {
  try {
    const { userId, filename, size } = req.body;

    // Delete from storage service
    const storageResponse = await axios.delete(
      `${STORAGE_SERVICE_URL}/api/storage/${userId}/files/${filename}`
    );

    // Record deletion in usage service
    await axios.post(
      `${USAGE_SERVICE_URL}/api/usage/${userId}/delete`,
      { size }
    );

    await logEvent('info', 'ModelServ', `Video deletion processed: ${filename} for user ${userId}`, userId);

    res.json({
      message: 'Video deletion processed successfully',
      storage: storageResponse.data
    });
  } catch (error) {
    await logEvent('error', 'ModelServ', `Process delete error: ${error.message}`);
    if (error.response) {
      return res.status(error.response.status).json(error.response.data);
    }
    res.status(500).json({ error: error.message });
  }
});

// Business logic: Get user dashboard data
app.get('/api/dashboard/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Fetch data from all services
    const [userInfo, storageInfo, usageInfo] = await Promise.all([
      axios.get(`${USER_SERVICE_URL}/api/users/${userId}`).catch(() => null),
      axios.get(`${STORAGE_SERVICE_URL}/api/storage/${userId}`).catch(() => null),
      axios.get(`${USAGE_SERVICE_URL}/api/usage/${userId}`).catch(() => null)
    ]);

    const dashboard = {
      user: userInfo?.data || null,
      storage: storageInfo?.data || null,
      usage: usageInfo?.data || null
    };

    await logEvent('info', 'ModelServ', `Dashboard data fetched for user ${userId}`, userId);
    res.json(dashboard);
  } catch (error) {
    await logEvent('error', 'ModelServ', `Get dashboard error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'ModelServ' });
});

const PORT = 3004;
app.listen(PORT, () => {
  console.log(`Model Service running on port ${PORT}`);
});

