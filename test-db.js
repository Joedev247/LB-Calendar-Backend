const mongoose = require('mongoose');
const User = require('./database/models/User');

async function testConnection() {
  try {
    await mongoose.connect('mongodb://localhost:27017/lb-calendar');
    console.log('Successfully connected to MongoDB');
    
    const users = await User.find();
    console.log('Users in database:', users.length);
    console.log('User emails:', users.map(u => u.email));
    
    await mongoose.connection.close();
  } catch (error) {
    console.error('MongoDB connection test failed:', error);
  }
}

testConnection();