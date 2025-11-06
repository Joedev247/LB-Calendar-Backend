const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true
  },
  password: {
    type: String,
    required: function() {
      // Password is only required if user is not using OAuth
      return !this.isOAuthUser;
    }
  },
  isOAuthUser: {
    type: Boolean,
    default: false
  },
  oauthProvider: {
    type: String,
    enum: ['loopingbinary'],
    default: null
  },
  oauthId: {
    type: String,
    default: null
  },
  name: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user'
  },
  department: {
    type: String,
    enum: [
      'Frontend Developer',
      'Backend Developer',
      'Fullstack Developer',
      'Mobile Developer',
      'DevOps Developer',
      'Cloud Engineer',
      'Figma Designer',
      'Tester',
      'Penetration Tester',
      'AI Engineer',
      'Data Analyst',
      'Design',
      'Product',
      'Marketing',
      'Sales',
      'HR',
      'Finance',
      'Operations',
      'Support',
      'Other'
    ],
    default: 'Other'
  },
  profileImage: String,
  lastLogin: Date
}, {
  timestamps: true
});

// Hash password before saving (only for non-OAuth users)
userSchema.pre('save', async function(next) {
  if (this.isOAuthUser || !this.isModified('password')) return next();
  
  try {
    console.log('Hashing password for user:', this.email);
    const hashedPassword = await bcrypt.hash(this.password, 10);
    console.log('Password hashed successfully');
    this.password = hashedPassword;
    next();
  } catch (error) {
    console.error('Error hashing password:', error);
    next(error);
  }
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    throw error;
  }
};

module.exports = mongoose.model('User', userSchema);