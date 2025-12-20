const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// Load environment variables from .env file in service directory
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/videostream_logs';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// Log Schema
const logSchema = new mongoose.Schema({
  level: { type: String, enum: ['info', 'warn', 'error', 'debug'], required: true },
  service: { type: String, required: true },
  message: { type: String, required: true },
  userId: { type: String },
  timestamp: { type: Date, default: Date.now },
  metadata: { type: mongoose.Schema.Types.Mixed }
}, {
  timestamps: true
});

// Index for efficient querying
logSchema.index({ timestamp: -1 });
logSchema.index({ service: 1, timestamp: -1 });
logSchema.index({ userId: 1, timestamp: -1 });
logSchema.index({ level: 1, timestamp: -1 });

const Log = mongoose.model('Log', logSchema);

// Create log entry
app.post('/api/logs', async (req, res) => {
  try {
    const { level, service, message, userId, timestamp, metadata } = req.body;

    const log = new Log({
      level: level || 'info',
      service,
      message,
      userId,
      timestamp: timestamp ? new Date(timestamp) : new Date(),
      metadata
    });

    await log.save();

    // Also log to console for development
    console.log(`[${log.level.toUpperCase()}] [${log.service}] ${log.message}`);

    res.status(201).json({
      message: 'Log created successfully',
      logId: log._id
    });
  } catch (error) {
    console.error('Error creating log:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get logs with filters
app.get('/api/logs', async (req, res) => {
  try {
    const { 
      service, 
      level, 
      userId, 
      startDate, 
      endDate, 
      limit = 100,
      page = 1 
    } = req.query;

    const query = {};
    
    if (service) query.service = service;
    if (level) query.level = level;
    if (userId) query.userId = userId;
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const logs = await Log.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .skip(skip);

    const total = await Log.countDocuments(query);

    res.json({
      logs,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Error fetching logs:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get logs by service
app.get('/api/logs/service/:service', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const logs = await Log.find({ service: req.params.service })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get logs by user
app.get('/api/logs/user/:userId', async (req, res) => {
  try {
    const { limit = 100 } = req.query;
    const logs = await Log.find({ userId: req.params.userId })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get error logs
app.get('/api/logs/errors', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    const logs = await Log.find({ level: 'error' })
      .sort({ timestamp: -1 })
      .limit(parseInt(limit));

    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get log statistics
app.get('/api/logs/stats', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = {};
    
    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) query.timestamp.$gte = new Date(startDate);
      if (endDate) query.timestamp.$lte = new Date(endDate);
    }

    const stats = await Log.aggregate([
      { $match: query },
      {
        $group: {
          _id: { level: '$level', service: '$service' },
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: '$_id.level',
          services: {
            $push: {
              service: '$_id.service',
              count: '$count'
            }
          },
          total: { $sum: '$count' }
        }
      }
    ]);

    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'LoggingServ' });
});

const PORT = 3006;
app.listen(PORT, () => {
  console.log(`Logging Service running on port ${PORT}`);
});

