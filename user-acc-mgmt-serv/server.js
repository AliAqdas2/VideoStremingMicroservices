const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Load environment variables from .env file in service directory
const envPath = path.join(__dirname, '.env');
let envFromFile = {};

if (fs.existsSync(envPath)) {
  const result = require('dotenv').config({ path: envPath });
  
  if (result.error) {
    console.error(`ERROR: Failed to load .env file from ${envPath}`);
    console.error(`Error: ${result.error.message}`);
  } else {
    if (result.parsed) {
      envFromFile = result.parsed;
      const envKeys = Object.keys(envFromFile);
      console.log(`✓ Environment variables loaded from: ${envPath}`);
      console.log(`  Variables from .env file (${envKeys.length}):`);
      envKeys.forEach(key => {
        const value = envFromFile[key];
        const displayValue = (key.includes('SECRET') || key.includes('PASSWORD') || key.includes('KEY')) 
          ? '***HIDDEN***' 
          : value;
        const currentValue = process.env[key];
        const isOverridden = currentValue !== value;
        console.log(`    - ${key} = ${displayValue}${isOverridden ? ' ⚠ (OVERRIDDEN by shell)' : ''}`);
      });
    } else {
      console.warn(`  ⚠ .env file exists but no variables were parsed (check file format)`);
    }
  }
} else {
  console.warn(`WARNING: .env file not found at ${envPath}`);
  console.warn(`Using default values or system environment variables`);
}

const app = express();
app.use(express.json());
app.use(cors());

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/videostream_users';
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  createdAt: { type: Date, default: Date.now },
  tenantId: { type: String, required: true }
});

const User = mongoose.model('User', userSchema);

// Logging service URL
const LOGGING_SERVICE_URL = process.env.LOGGING_SERVICE_URL || 'http://localhost:3006';

// Helper function to log events
async function logEvent(level, service, message, userId = null) {
  try {
    await axios.post(`${LOGGING_SERVICE_URL}/api/logs`, {
      level,
      service: 'UserAccMgmtServ',
      message,
      userId,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Failed to log event:', error.message);
  }
}

// Register new user
app.post('/api/users/register', async (req, res) => {
  try {
    const { username, email, password, tenantId } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      await logEvent('warn', 'UserAccMgmtServ', `Registration attempt with existing credentials: ${email}`);
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = new User({
      username,
      email,
      password: hashedPassword,
      tenantId: tenantId || `tenant_${Date.now()}`
    });

    await user.save();
    await logEvent('info', 'UserAccMgmtServ', `User registered: ${username}`, user._id);

    res.status(201).json({
      message: 'User created successfully',
      userId: user._id,
      username: user.username,
      email: user.email,
      tenantId: user.tenantId
    });
  } catch (error) {
    await logEvent('error', 'UserAccMgmtServ', `Registration error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      await logEvent('warn', 'UserAccMgmtServ', `Login attempt with invalid email: ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      await logEvent('warn', 'UserAccMgmtServ', `Login attempt with invalid password for: ${email}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id, email: user.email, role: user.role, tenantId: user.tenantId },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '24h' }
    );

    await logEvent('info', 'UserAccMgmtServ', `User logged in: ${user.username}`, user._id);

    res.json({
      token,
      user: {
        userId: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        tenantId: user.tenantId
      }
    });
  } catch (error) {
    await logEvent('error', 'UserAccMgmtServ', `Login error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Verify token middleware
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Get current user (MUST come before /api/users/:userId to avoid route conflict)
app.get('/api/users/me', verifyToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    await logEvent('error', 'UserAccMgmtServ', `Get current user error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Get user by ID (MUST come after /api/users/me)
app.get('/api/users/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    await logEvent('error', 'UserAccMgmtServ', `Get user error: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'UserAccMgmtServ' });
});

const PORT = process.env.PORT || 3001;

console.log(`\n=== Service Configuration ===`);
console.log(`PORT: ${PORT}`);
if (process.env.PORT) {
  console.log(`  → PORT loaded from environment (may override .env file)`);
} else {
  console.log(`  → PORT using default value (3001) - .env not loaded or PORT not set`);
}
console.log(`MONGODB_URI: ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')} (${process.env.MONGODB_URI ? 'from ENV' : 'default'})`);
console.log(`JWT_SECRET: ${process.env.JWT_SECRET ? 'SET' : 'NOT SET (using default)'}`);
console.log(`\nNOTE: Shell environment variables override .env file values`);
console.log(`      If PORT is set in shell, it will override .env file`);
console.log(`      Check with: echo $PORT`);
console.log(`=============================\n`);

app.listen(PORT, () => {
  console.log(`✓ User Account Management Service running on port ${PORT}`);
});

