const mongoose = require('mongoose');
const User = require('./database/models/User');

async function listUsers() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/lb-calendar');
    console.log('Connected to MongoDB');
    
    const users = await User.find({}, '-password');
    console.log('\nUsers in database:', users.length);
    console.log('\nUser details:');
    users.forEach(user => {
      console.log('\n-------------------');
      console.log('Email:', user.email);
      console.log('Name:', user.name);
      console.log('Role:', user.role);
      console.log('ID:', user._id);
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

listUsers();