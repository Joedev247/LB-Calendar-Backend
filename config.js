require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3001,
  jwtSecret: process.env.JWT_SECRET || 'your_jwt_secret_key_here',
  nodeEnv: process.env.NODE_ENV || 'development',
  // IMPORTANT: prefer setting MONGO_URI in environment for security.
  // Default set to the provided LB Calendar cluster URI.
  mongoUri: process.env.MONGO_URI || 'mongodb+srv://joedev237_db_user:fbWfHnblYGmrhI63@lb-calendar.1gvm21q.mongodb.net/?appName=LB-CALENDAR'
};
