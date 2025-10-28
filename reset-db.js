const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./database/models/User');
const UserSettings = require('./database/models/UserSettings');

async function resetAndCreateAdmin() {
  try {
    // Connect to MongoDB
    await mongoose.connect('mongodb://127.0.0.1:27017/lb-calendar');
    console.log('Connected to MongoDB');

    // Drop existing collections
    await mongoose.connection.dropDatabase();
    console.log('Dropped existing database');

    // Create admin user with plain password (will be hashed by the model)
    const adminUser = await User.create({
      email: 'admin@lbcalendar.com',
      password: 'admin123', // Will be hashed by the pre-save middleware
      name: 'Admin User',
      role: 'admin'
    });
    console.log('Admin user created:', {
      id: adminUser._id,
      email: adminUser.email,
      name: adminUser.name,
      role: adminUser.role
    });

    // Create admin settings
    await UserSettings.create({
      userId: adminUser._id,
      name: adminUser.name,
      email: adminUser.email
    });
    console.log('Admin settings created');

    // Verify password
    const user = await User.findOne({ email: 'admin@lbcalendar.com' });
    const isValid = await bcrypt.compare('admin123', user.password);
    console.log('Password verification test:', { isValid });

    console.log('\nAdmin credentials:');
    console.log('Email: admin@lbcalendar.com');
    console.log('Password: admin123');

    await mongoose.connection.close();
    console.log('\nDatabase connection closed');
  } catch (error) {
    console.error('Error:', error);
  }
}

resetAndCreateAdmin();