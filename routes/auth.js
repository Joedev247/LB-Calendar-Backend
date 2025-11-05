const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../database/models/User');
const { validateUser } = require('../middleware/validation');
const config = require('../config');

const router = express.Router();

// Helper function to exchange authorization code for access token
async function exchangeCodeForToken(code) {
  try {
    const response = await fetch(config.lbOAuth.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: config.lbOAuth.clientId,
        client_secret: config.lbOAuth.clientSecret,
        code: code,
        redirect_uri: config.lbOAuth.redirectUri,
        grant_type: 'authorization_code'
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error exchanging code for token:', error);
    throw error;
  }
}

// Helper function to get user info from Looping Binary API
async function getLBUserInfo(accessToken) {
  try {
    const response = await fetch(`${config.lbOAuth.apiUrl}/auth/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get user info: ${response.status} - ${errorText}`);
    }

    const userData = await response.json();
    return userData;
  } catch (error) {
    console.error('Error fetching user info:', error);
    throw error;
  }
}

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

// Get OAuth authorization URL
router.get('/oauth/authorize', (req, res) => {
  if (!config.lbOAuth.clientId) {
    return res.status(500).json({ 
      error: 'OAuth not configured. Please set LB_CLIENT_ID and LB_CLIENT_SECRET environment variables.' 
    });
  }

  const authUrl = `${config.lbOAuth.authUrl}?` + new URLSearchParams({
    client_id: config.lbOAuth.clientId,
    redirect_uri: config.lbOAuth.redirectUri,
    response_type: 'code',
    scope: config.lbOAuth.scope
  }).toString();

  res.json({ authUrl });
});

// OAuth callback handler
router.get('/oauth/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).json({ 
      error: 'OAuth authorization failed', 
      details: error 
    });
  }

  if (!code) {
    return res.status(400).json({ error: 'Authorization code is required' });
  }

  if (!config.lbOAuth.clientId || !config.lbOAuth.clientSecret) {
    return res.status(500).json({ 
      error: 'OAuth not configured. Please set LB_CLIENT_ID and LB_CLIENT_SECRET environment variables.' 
    });
  }

  try {
    // Exchange authorization code for access token
    const tokenData = await exchangeCodeForToken(code);
    const { access_token, refresh_token, user: lbUser } = tokenData;

    // Get full user info from Looping Binary API
    const userInfo = await getLBUserInfo(access_token);
    
    // Use user info from API response or token response
    const lbUserData = userInfo || lbUser;
    
    if (!lbUserData || !lbUserData.email) {
      throw new Error('Failed to get user information from Looping Binary');
    }

    // Find or create user in our database
    let user = await User.findOne({ 
      $or: [
        { email: lbUserData.email.toLowerCase() },
        { oauthId: lbUserData.id?.toString(), oauthProvider: 'loopingbinary' }
      ]
    });

    if (user) {
      // Update existing user with OAuth info if needed
      if (!user.isOAuthUser) {
        user.isOAuthUser = true;
        user.oauthProvider = 'loopingbinary';
        user.oauthId = lbUserData.id?.toString();
        if (!user.password) {
          // Remove password requirement for OAuth users
          user.password = undefined;
        }
      }
      user.lastLogin = new Date();
      if (lbUserData.fullName && !user.name) {
        user.name = lbUserData.fullName;
      }
      await user.save();
    } else {
      // Create new OAuth user
      user = await User.create({
        email: lbUserData.email.toLowerCase(),
        name: lbUserData.fullName || lbUserData.email.split('@')[0],
        isOAuthUser: true,
        oauthProvider: 'loopingbinary',
        oauthId: lbUserData.id?.toString(),
        role: 'user',
        lastLogin: new Date()
      });
    }

    // Generate JWT token for our application
    const token = jwt.sign(
      { 
        id: user._id, 
        email: user.email, 
        name: user.name, 
        role: user.role 
      },
      config.jwtSecret,
      { expiresIn: '24h' }
    );

    // Redirect to frontend with token (adjust based on your frontend URL)
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const redirectUrl = `${frontendUrl}/auth/callback?token=${token}&email=${encodeURIComponent(user.email)}`;
    
    res.redirect(redirectUrl);

    // Alternative: Return JSON response (uncomment if you prefer API response over redirect)
    // res.json({
    //   message: 'OAuth login successful',
    //   token,
    //   user: {
    //     id: user._id,
    //     email: user.email,
    //     name: user.name,
    //     role: user.role
    //   },
    //   lbAccessToken: access_token, // Optional: if you need to store this
    //   refreshToken: refresh_token   // Optional: if you need to store this
    // });

  } catch (err) {
    console.error('OAuth callback error:', err);
    res.status(500).json({ 
      error: 'OAuth authentication failed', 
      details: err.message 
    });
  }
});

module.exports = router;
