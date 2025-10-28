const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Account Settings
  name: String,
  email: String,
  profileImage: String,

  // Notification Settings
  notifications: {
    email: {
      eventReminders: { type: Boolean, default: true },
      taskDeadlines: { type: Boolean, default: true },
      teamUpdates: { type: Boolean, default: true },
      systemNotifications: { type: Boolean, default: true }
    },
    push: {
      enabled: { type: Boolean, default: true },
      eventReminders: { type: Boolean, default: true },
      taskDeadlines: { type: Boolean, default: true },
      teamUpdates: { type: Boolean, default: true }
    }
  },

  // Appearance Settings
  appearance: {
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    primaryColor: { type: String, default: '#5D4C8E' }
  },

  // Calendar Settings
  calendar: {
    weekStartsOn: { type: Number, enum: [0, 1], default: 0 }, // 0 for Sunday, 1 for Monday
    defaultView: { type: String, enum: ['month', 'week', 'day', 'agenda'], default: 'month' },
    timeFormat: { type: String, enum: ['12h', '24h'], default: '12h' },
    workingHours: {
      start: { type: String, default: '09:00' },
      end: { type: String, default: '17:00' }
    }
  },

  // Privacy Settings
  privacy: {
    calendarVisibility: { type: String, enum: ['public', 'team', 'private'], default: 'team' },
    eventDetailsVisibility: { type: String, enum: ['public', 'team', 'private'], default: 'team' },
    profileVisibility: { type: String, enum: ['public', 'team', 'private'], default: 'team' }
  },

  // Team Settings
  teamSettings: {
    allowMembersCreateEvents: { type: Boolean, default: true },
    allowMembersEditSettings: { type: Boolean, default: false },
    allowMembersInvite: { type: Boolean, default: false }
  },

  // Security
  security: {
    twoFactorEnabled: { type: Boolean, default: false },
    lastPasswordChange: Date
  }
}, {
  timestamps: true
});

// Ensure one settings document per user
userSettingsSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model('UserSettings', userSettingsSchema);