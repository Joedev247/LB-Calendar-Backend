const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../database/models/User');
const { validateUser } = require('../middleware/validation');
const config = require('../config');

const router = express.Router();

// Register
router.post('/register', validateUser, async (req, res) => {
  const { email, password, name } = req.body;

  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Create user - the User model has a pre-save hook that hashes the password.
    const user = await User.create({
      email,
      password,
      name,
      role: 'user'
    });

    const token = jwt.sign(
      { id: user._id, email, name, role: 'user' },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: { id: user._id, email, name, role: 'user' }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    console.log('Missing email or password:', { email, password });
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const user = await User.findOne({ email });
    console.log('Login attempt:', { email, userFound: !!user });

    if (!user) {
      console.log('User not found');
      return res.status(401).json({ error: 'User not found' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    console.log('Password validation:', { 
      isValid: isPasswordValid,
      attemptedPassword: password,
      storedHash: user.password
    });

    if (!isPasswordValid) {
      console.log('Invalid password');
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name, role: user.role },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user._id, email: user.email, name: user.name, role: user.role }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get current user
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    const user = await User.findById(decoded.id).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ user: {
      id: user._id,
      email: user.email,
      name: user.name,
      role: user.role
    }});
  } catch (err) {
    console.error('Auth error:', err);
    res.status(403).json({ error: 'Invalid or expired token' });
  }
});

module.exports = router;
