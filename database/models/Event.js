const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  start_date: {
    type: Date,
    required: true
  },
  end_date: {
    type: Date,
    required: true
  },
  all_day: {
    type: Boolean,
    default: false
  },
  location: {
    type: String,
    trim: true
  },
  is_online: {
    type: Boolean,
    default: false
  },
  online_platform: {
    type: String,
    trim: true,
    enum: ['zoom', 'google_meet', 'microsoft_teams', 'whatsapp', 'telegram', 'skype', 'webex', 'other']
  },
  project_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  hosts: [{
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    name: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true
    },
    role: {
      type: String,
      trim: true
    },
    is_external: {
      type: Boolean,
      default: false
    }
  }]
}, {
  timestamps: true // This will add createdAt and updatedAt fields
});

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;