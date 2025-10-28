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
  project_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true // This will add createdAt and updatedAt fields
});

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;