const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config');
const User = require('./models/User');
const UserSettings = require('./models/UserSettings');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(config.mongoUri || 'mongodb://localhost:27017/lb-calendar');

    console.log(`MongoDB Connected: ${conn.connection.host}`);

    // Create default admin user if no users exist
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      // Create admin user
      const adminUser = await User.create({
        email: 'admin@lbcalendar.com',
        password: 'admin123', // Will be hashed by the pre-save middleware
        name: 'Admin User',
        role: 'admin'
      });

      // Create default settings for admin user
      await UserSettings.create({
        userId: adminUser._id,
        name: adminUser.name,
        email: adminUser.email
      });

      console.log('Default admin user created');
    }

    return conn;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    process.exit(1);
  }
};

module.exports = connectDB;
