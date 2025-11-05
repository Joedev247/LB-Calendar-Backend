require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret_key_here',
  nodeEnv: process.env.NODE_ENV || 'development',
  // IMPORTANT: prefer setting MONGO_URI in environment for security.
  // Default set to the provided LB Calendar cluster URI.
  mongoUri: process.env.MONGO_URI || 'mongodb+srv://joedev237_db_user:fbWfHnblYGmrhI63@lb-calendar.1gvm21q.mongodb.net/?appName=LB-CALENDAR',
  // Looping Binary OAuth Configuration
  lbOAuth: {
    clientId: process.env.LB_CLIENT_ID,
    clientSecret: process.env.LB_CLIENT_SECRET,
    authUrl: 'https://auth.loopingbinary.com/oauth/authorize',
    tokenUrl: 'https://auth.loopingbinary.com/oauth/token',
    apiUrl: 'https://api.loopingbinary.com/api',
    redirectUri: process.env.LB_REDIRECT_URI || 'http://localhost:5000/api/auth/oauth/callback',
    scope: 'profile email'
  }
};
