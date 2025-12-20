// Script to make a user an admin
// Usage: node make-admin.js <user-email> [mongodb-uri]

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

// Get MongoDB URI from environment or command line argument
const MONGODB_URI = process.argv[3] || process.env.MONGODB_URI || 'mongodb://localhost:27017/videostream_users';

const userSchema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  role: String,
  tenantId: String
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

async function makeAdmin(email) {
  try {
    console.log(`Connecting to MongoDB: ${MONGODB_URI.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')}`);
    await mongoose.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('Connected to MongoDB');

    const user = await User.findOne({ email });
    
    if (!user) {
      console.error(`❌ User with email "${email}" not found`);
      console.log('\nAvailable users in database:');
      const allUsers = await User.find({}, 'username email role');
      if (allUsers.length === 0) {
        console.log('  (No users found)');
      } else {
        allUsers.forEach(u => {
          console.log(`  - ${u.email} (${u.username}) - Role: ${u.role || 'user'}`);
        });
      }
      await mongoose.connection.close();
      process.exit(1);
    }

    if (user.role === 'admin') {
      console.log(`ℹ️  User ${user.username} (${email}) is already an admin`);
      await mongoose.connection.close();
      process.exit(0);
    }

    user.role = 'admin';
    await user.save();

    console.log(`✅ Successfully made ${user.username} (${email}) an admin`);
    console.log('\n⚠️  IMPORTANT: The user must log out and log back in for the change to take effect!');
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('authentication failed')) {
      console.error('\n💡 Tip: Make sure your MongoDB connection string includes the correct username and password');
    }
    await mongoose.connection.close();
    process.exit(1);
  }
}

const email = process.argv[2];

if (!email) {
  console.error('Usage: node make-admin.js <user-email> [mongodb-uri]');
  console.error('Example: node make-admin.js user@example.com');
  console.error('Example with custom URI: node make-admin.js user@example.com "mongodb+srv://user:pass@cluster.mongodb.net/videostream_users"');
  console.error('\nThe MongoDB URI can also be set in user-acc-mgmt-serv/.env as MONGODB_URI');
  process.exit(1);
}

makeAdmin(email);

