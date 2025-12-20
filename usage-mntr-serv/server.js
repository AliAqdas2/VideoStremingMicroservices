const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

// Load environment variables from .env file in service directory
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/videostream_usage';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Usage Schema
const usageSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  date: { type: String, required: true }, // YYYY-MM-DD format
  uploadVolume: { type: Number, default: 0 }, // in bytes
  deleteVolume: { type: Number, default: 0 }, // in bytes
  totalVolume: { type: Number, default: 0 }, // in bytes
  maxDailyBandwidth: { type: Number, default: 100 * 1024 * 1024 }, // 100MB in bytes
  alertSent: { type: Boolean, default: false },
  blocked: { type: Boolean, default: false }
}, {
  unique: true,
  index: { userId: 1, date: 1 }
});

const Usage = mongoose.model('Usage', usageSchema);

// Logging service URL
const LOGGING_SERVICE_URL = process.env.LOGGING_SERVICE_URL || 'http://localhost:3006';

// Helper function to log events
async function logEvent(level, service, message, userId = null) {
  try {
    await axios.post(`${LOGGING_SERVICE_URL}/api/logs`, {
      level,
      service: 'UsageMntrServ',
      message,
      userId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log event:', error.message);
  }
}

// Get today's date in YYYY-MM-DD format
function getTodayDate() {
  return new Date().toISOString().split('T')[0];
}

// Get or create usage record for today
async function getTodayUsage(userId) {
  const today = getTodayDate();
  let usage = await Usage.findOne({ userId, date: today });
  
  if (!usage) {
    usage = new Usage({ userId, date: today });
    await usage.save();
  }
  
  return usage;
}

// Check if user can upload (bandwidth check)
app.get('/api/usage/:userId/can-upload', async (req, res) => {
  try {
    const usage = await getTodayUsage(req.params.userId);
    
    const canUpload = !usage.blocked && usage.totalVolume < usage.maxDailyBandwidth;
    const usagePercent = (usage.totalVolume / usage.maxDailyBandwidth * 100);
    const shouldAlert = usage.totalVolume >= usage.maxDailyBandwidth && !usage.alertSent;

    if (shouldAlert && !usage.blocked) {
      usage.blocked = true;
      usage.alertSent = true;
      await usage.save();
      await logEvent('warn', 'UsageMntrServ', `Daily bandwidth exceeded for user ${req.params.userId}`, req.params.userId);
    }

    res.json({
      canUpload,
      usagePercent: usagePercent.toFixed(2),
      totalVolume: usage.totalVolume,
      maxDailyBandwidth: usage.maxDailyBandwidth,
      uploadVolume: usage.uploadVolume,
      deleteVolume: usage.deleteVolume,
      blocked: usage.blocked,
      alert: usage.blocked ? 'Daily bandwidth limit exceeded. Uploads blocked until tomorrow.' : 
             (usagePercent >= 80 ? `Warning: ${usagePercent.toFixed(2)}% of daily bandwidth used` : null)
    });
  } catch (error) {
    await logEvent('error', 'UsageMntrServ', `Check upload error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Record upload
app.post('/api/usage/:userId/upload', async (req, res) => {
  try {
    const { userId } = req.params;
    const { size } = req.body; // size in bytes

    const usage = await getTodayUsage(userId);

    // Check if blocked
    if (usage.blocked) {
      await logEvent('warn', 'UsageMntrServ', `Upload blocked: Daily bandwidth exceeded for user ${userId}`, userId);
      return res.status(403).json({ 
        error: 'Daily bandwidth limit exceeded. Uploads blocked until tomorrow.',
        blocked: true
      });
    }

    // Check if adding this upload would exceed limit
    if (usage.totalVolume + size > usage.maxDailyBandwidth) {
      usage.blocked = true;
      usage.alertSent = true;
      await usage.save();
      await logEvent('warn', 'UsageMntrServ', `Daily bandwidth exceeded for user ${userId}`, userId);
      return res.status(403).json({ 
        error: 'This upload would exceed daily bandwidth limit.',
        blocked: true
      });
    }

    usage.uploadVolume += size;
    usage.totalVolume += size;
    const usagePercent = (usage.totalVolume / usage.maxDailyBandwidth * 100);

    // Check if threshold reached
    if (usage.totalVolume >= usage.maxDailyBandwidth) {
      usage.blocked = true;
      usage.alertSent = true;
      await logEvent('warn', 'UsageMntrServ', `Daily bandwidth exceeded for user ${userId}`, userId);
    } else if (usagePercent >= 80 && !usage.alertSent) {
      usage.alertSent = true;
      await logEvent('warn', 'UsageMntrServ', `Bandwidth warning: ${usagePercent.toFixed(2)}% used for user ${userId}`, userId);
    }

    await usage.save();
    await logEvent('info', 'UsageMntrServ', `Upload recorded: ${size} bytes for user ${userId}`, userId);

    res.json({
      message: 'Upload recorded',
      totalVolume: usage.totalVolume,
      maxDailyBandwidth: usage.maxDailyBandwidth,
      usagePercent: usagePercent.toFixed(2),
      blocked: usage.blocked,
      alert: usage.blocked ? 'Daily bandwidth limit exceeded' : 
             (usagePercent >= 80 ? `Warning: ${usagePercent.toFixed(2)}% of daily bandwidth used` : null)
    });
  } catch (error) {
    await logEvent('error', 'UsageMntrServ', `Record upload error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Record deletion
app.post('/api/usage/:userId/delete', async (req, res) => {
  try {
    const { userId } = req.params;
    const { size } = req.body; // size in bytes

    const usage = await getTodayUsage(userId);
    usage.deleteVolume += size;
    // Note: totalVolume doesn't decrease on delete, it's cumulative for the day
    await usage.save();

    await logEvent('info', 'UsageMntrServ', `Delete recorded: ${size} bytes for user ${userId}`, userId);

    res.json({
      message: 'Delete recorded',
      totalVolume: usage.totalVolume,
      uploadVolume: usage.uploadVolume,
      deleteVolume: usage.deleteVolume
    });
  } catch (error) {
    await logEvent('error', 'UsageMntrServ', `Record delete error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get usage statistics
app.get('/api/usage/:userId', async (req, res) => {
  try {
    const usage = await getTodayUsage(req.params.userId);
    const usagePercent = (usage.totalVolume / usage.maxDailyBandwidth * 100);

    res.json({
      userId: usage.userId,
      date: usage.date,
      uploadVolume: usage.uploadVolume,
      deleteVolume: usage.deleteVolume,
      totalVolume: usage.totalVolume,
      maxDailyBandwidth: usage.maxDailyBandwidth,
      usagePercent: usagePercent.toFixed(2),
      blocked: usage.blocked,
      alertSent: usage.alertSent
    });
  } catch (error) {
    await logEvent('error', 'UsageMntrServ', `Get usage error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get usage history
app.get('/api/usage/:userId/history', async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const usages = await Usage.find({
      userId: req.params.userId,
      date: { $gte: startDate.toISOString().split('T')[0] }
    }).sort({ date: -1 });

    res.json(usages);
  } catch (error) {
    await logEvent('error', 'UsageMntrServ', `Get history error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'UsageMntrServ' });
});

const PORT =  3003;
app.listen(PORT, () => {
  console.log(`Usage Monitoring Service running on port ${PORT}`);
});

