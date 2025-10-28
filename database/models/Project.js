const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  color: {
    type: String,
    default: '#3498db' // Default blue color
  },
  start_date: {
    type: Date
  },
  end_date: {
    type: Date
  },
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'completed', 'on_hold'],
    default: 'not_started'
  },
  created_by: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  team_members: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true // This will add createdAt and updatedAt fields
});

const Project = mongoose.model('Project', projectSchema);

module.exports = Project;