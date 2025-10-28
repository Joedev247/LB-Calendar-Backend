const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  project_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Project'
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  message_type: {
    type: String,
    enum: ['text', 'image', 'file'],
    default: 'text'
  },
  file_url: String,
  file_name: String,
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: String
  }],
  read_by: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }]
}, {
  timestamps: true
});

// Add indexes for better query performance
chatMessageSchema.index({ project_id: 1, createdAt: -1 });
chatMessageSchema.index({ sender: 1 });

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = ChatMessage;