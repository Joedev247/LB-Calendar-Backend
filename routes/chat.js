const express = require('express');
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const ChatMessage = require('../database/models/ChatMessage');
const Project = require('../database/models/Project');
const User = require('../database/models/User');
const { createNotificationsForUsers } = require('../utils/notifications');

const router = express.Router();

// Get general team chat messages (no project)
router.get('/team', authenticateToken, async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    
    // Get all general team chat messages (project_id is null)
    const messages = await ChatMessage.find({ project_id: null })
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .populate('sender', 'name email avatar_url department')
      .populate('reactions.user', 'name avatar_url')
      .populate('read_by', 'name');
    
    const formattedMessages = messages.reverse().map(message => ({
      ...message.toObject(),
      id: message._id,
      user_name: message.sender?.name,
      user_email: message.sender?.email,
      avatar_url: message.sender?.avatar_url,
      department: message.sender?.department,
      message_type: message.message_type || 'text',
      file_url: message.file_url,
      file_name: message.file_name,
      reactions: (message.reactions || []).map(reaction => {
        const reactionObj = reaction.toObject ? reaction.toObject() : reaction;
        return {
          ...reactionObj,
          user: reaction.user ? {
            _id: reaction.user._id || reaction.user,
            name: reaction.user.name,
            avatar_url: reaction.user.avatar_url
          } : reaction.user,
          user_name: reaction.user?.name,
          user_avatar: reaction.user?.avatar_url,
          emoji: reaction.emoji
        };
      })
    }));
    
    res.json(formattedMessages);
  } catch (err) {
    console.error('Get team chat messages error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get chat messages for a project
router.get('/:project_id', authenticateToken, async (req, res) => {
  try {
    const { project_id } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    // Check if user is a member of the project
    const project = await Project.findById(project_id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const isTeamMember = project.team_members.some(
      member => member.toString() === req.user.id
    );
    
    if (!isTeamMember && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied to project chat' });
    }
    
    const messages = await ChatMessage.find({ project_id })
      .sort({ createdAt: 1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit))
      .populate('sender', 'name avatar_url')
      .populate('reactions.user', 'name avatar_url')
      .populate('read_by', 'name');
    
    const formattedMessages = messages.map(message => ({
      ...message.toObject(),
      id: message._id,
      user_name: message.sender?.name,
      avatar_url: message.sender?.avatar_url,
      reactions: message.reactions.map(reaction => ({
        ...reaction,
        user_name: reaction.user?.name,
        user_avatar: reaction.user?.avatar_url
      }))
    }));
    
    res.json(formattedMessages);
  } catch (err) {
    console.error('Get chat messages error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Upload image for team chat
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads/chat');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'chat-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Upload image endpoint
router.post('/team/upload', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Return the file URL (you might want to use a CDN or cloud storage in production)
    const fileUrl = `/uploads/chat/${req.file.filename}`;
    
    res.json({
      file_url: fileUrl,
      file_name: req.file.originalname,
      file_size: req.file.size
    });
  } catch (err) {
    console.error('Upload image error:', err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Send a general team chat message
router.post('/team', authenticateToken, async (req, res) => {
  try {
    const { message = '', message_type = 'text', file_url, file_name } = req.body;
    
    // Allow empty message if there's a file
    if (!message.trim() && !file_url) {
      return res.status(400).json({ error: 'Message or image is required' });
    }
    
    const chatMessage = await ChatMessage.create({
      project_id: null, // General team chat
      sender: new mongoose.Types.ObjectId(req.user.id),
      message: message.trim() || (file_url ? '📷 Image' : ''),
      message_type: file_url ? 'image' : message_type,
      file_url,
      file_name,
      read_by: [new mongoose.Types.ObjectId(req.user.id)]
    });
    
    const populatedMessage = await ChatMessage.findById(chatMessage._id)
      .populate('sender', 'name email avatar_url department')
      .populate('read_by', 'name');
    
    const formattedMessage = {
      ...populatedMessage.toObject(),
      id: populatedMessage._id,
      user_name: populatedMessage.sender?.name,
      user_email: populatedMessage.sender?.email,
      avatar_url: populatedMessage.sender?.avatar_url,
      department: populatedMessage.sender?.department
    };

    // Notify all team members about the new message (excluding sender)
    try {
      const allUsers = await User.find({}).select('_id');
      const senderId = req.user.id.toString();
      const userIdsToNotify = allUsers
        .map(u => u._id.toString())
        .filter(id => id !== senderId);
      
      if (userIdsToNotify.length > 0) {
        const sender = await User.findById(req.user.id);
        const messagePreview = message.trim().substring(0, 50) + (message.trim().length > 50 ? '...' : '');
        
        console.log(`Creating chat notifications for ${userIdsToNotify.length} users`);
        const result = await createNotificationsForUsers(
          userIdsToNotify,
          'New team chat message',
          `${sender?.name || 'Someone'}: ${file_url ? '📷 Shared an image' : messagePreview || 'Sent a message'}`,
          'info',
          '/team-chat'
        );
        console.log(`Chat notifications created:`, result?.length || 0);
      }
    } catch (notifErr) {
      console.error('Error creating chat notifications:', notifErr);
      // Don't fail message creation if notifications fail
    }
    
    res.status(201).json(formattedMessage);
  } catch (err) {
    console.error('Send team chat message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Send a chat message
router.post('/:project_id', authenticateToken, async (req, res) => {
  try {
    const { project_id } = req.params;
    const { message, message_type = 'text', file_url, file_name } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    // Check if user is a member of the project
    const project = await Project.findById(project_id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const isTeamMember = project.team_members.some(
      member => member.toString() === req.user.id
    );
    
    if (!isTeamMember && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied to project chat' });
    }
    
    const chatMessage = await ChatMessage.create({
      project_id: new mongoose.Types.ObjectId(project_id),
      sender: new mongoose.Types.ObjectId(req.user.id),
      message: message.trim(),
      message_type,
      file_url,
      file_name,
      read_by: [new mongoose.Types.ObjectId(req.user.id)]
    });
    
    const populatedMessage = await ChatMessage.findById(chatMessage._id)
      .populate('sender', 'name avatar_url')
      .populate('read_by', 'name');
    
    const formattedMessage = {
      ...populatedMessage.toObject(),
      id: populatedMessage._id,
      user_name: populatedMessage.sender?.name,
      avatar_url: populatedMessage.sender?.avatar_url
    };
    
    res.status(201).json(formattedMessage);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Delete a chat message
router.delete('/:project_id/:message_id', authenticateToken, async (req, res) => {
  try {
    const { project_id, message_id } = req.params;
    
    // Check if user is a member of the project
    const project = await Project.findById(project_id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const isTeamMember = project.team_members.some(
      member => member.toString() === req.user.id
    );
    
    if (!isTeamMember && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied to project chat' });
    }
    
    // Get the message to check ownership
    const message = await ChatMessage.findOne({
      _id: message_id,
      project_id: project_id
    });
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Users can only delete their own messages unless they're admin
    if (message.sender.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    await ChatMessage.findByIdAndDelete(message_id);
    res.json({ message: 'Message deleted successfully' });
  } catch (err) {
    console.error('Delete message error:', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// Add reaction to team chat message
router.post('/team/:message_id/reactions', authenticateToken, async (req, res) => {
  try {
    const { message_id } = req.params;
    const { emoji } = req.body;
    
    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }
    
    // Check if message exists and is a team chat message (project_id is null)
    const message = await ChatMessage.findOne({
      _id: message_id,
      project_id: null
    });
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    // Initialize reactions array if it doesn't exist
    if (!message.reactions || !Array.isArray(message.reactions)) {
      message.reactions = [];
    }
    
    // Check if user already reacted with this emoji
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const existingReaction = (message.reactions || []).find(r => {
      if (!r || !r.emoji) return false;
      const reactionUserId = r.user ? (r.user._id || r.user).toString() : null;
      return reactionUserId === userId.toString() && r.emoji === emoji;
    });
    
    // Use a single update operation for better performance and atomicity
    if (existingReaction) {
      // Remove existing reaction if same emoji (toggle off)
      await ChatMessage.findByIdAndUpdate(
        message_id,
        {
          $pull: {
            reactions: { 
              user: userId,
              emoji: emoji
            }
          }
        }
      );
    } else {
      // Remove any existing reaction from this user first, then add new one
      // This ensures one reaction per user per message
      await ChatMessage.findByIdAndUpdate(
        message_id,
        {
          $pull: { 
            reactions: { user: userId }
          },
          $push: {
            reactions: {
              user: userId,
              emoji: emoji
            }
          }
        }
      );
    }
    
    // Get updated message with populated reactions
    const updatedMessage = await ChatMessage.findById(message_id)
      .populate('reactions.user', 'name avatar_url');
    
    if (!updatedMessage) {
      return res.status(404).json({ error: 'Message not found after update' });
    }
    
    const formattedMessage = {
      reactions: (updatedMessage.reactions || []).map(reaction => {
        const reactionObj = reaction.toObject ? reaction.toObject() : reaction;
        return {
          ...reactionObj,
          user: reaction.user ? {
            _id: reaction.user._id || reaction.user,
            name: reaction.user.name,
            avatar_url: reaction.user.avatar_url
          } : reaction.user,
          user_name: reaction.user?.name,
          user_avatar: reaction.user?.avatar_url,
          emoji: reaction.emoji
        };
      })
    };
    
    res.json(formattedMessage);
  } catch (err) {
    console.error('Add team chat reaction error:', err);
    res.status(500).json({ error: 'Failed to add reaction', details: err.message });
  }
});

// Remove reaction from team chat message
router.delete('/team/:message_id/reactions', authenticateToken, async (req, res) => {
  try {
    const { message_id } = req.params;
    const { emoji } = req.body;
    
    // Check if message exists and is a team chat message (project_id is null)
    const message = await ChatMessage.findOne({
      _id: message_id,
      project_id: null
    });
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    const userId = new mongoose.Types.ObjectId(req.user.id);
    
    // Remove reaction
    const updateQuery = emoji 
      ? { $pull: { reactions: { user: userId, emoji: emoji } } }
      : { $pull: { reactions: { user: userId } } };
    
    await ChatMessage.findByIdAndUpdate(
      message_id,
      updateQuery,
      { new: true }
    );
    
    // Get updated message with populated reactions
    const updatedMessage = await ChatMessage.findById(message_id)
      .populate('reactions.user', 'name avatar_url');
    
    if (!updatedMessage) {
      return res.status(404).json({ error: 'Message not found after update' });
    }
    
    const formattedMessage = {
      reactions: (updatedMessage.reactions || []).map(reaction => {
        const reactionObj = reaction.toObject ? reaction.toObject() : reaction;
        return {
          ...reactionObj,
          user: reaction.user ? {
            _id: reaction.user._id || reaction.user,
            name: reaction.user.name,
            avatar_url: reaction.user.avatar_url
          } : reaction.user,
          user_name: reaction.user?.name,
          user_avatar: reaction.user?.avatar_url,
          emoji: reaction.emoji
        };
      })
    };
    
    res.json(formattedMessage);
  } catch (err) {
    console.error('Remove team chat reaction error:', err);
    res.status(500).json({ error: 'Failed to remove reaction', details: err.message });
  }
});

// Add reaction to message
router.post('/:project_id/:message_id/reactions', authenticateToken, async (req, res) => {
  try {
    const { project_id, message_id } = req.params;
    const { emoji } = req.body;
    
    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }
    
    // Check if user is a member of the project
    const project = await Project.findById(project_id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const isTeamMember = project.team_members.some(
      member => member.toString() === req.user.id
    );
    
    if (!isTeamMember && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied to project chat' });
    }
    
    // Add or update reaction
    const message = await ChatMessage.findOneAndUpdate(
      {
        _id: message_id,
        project_id: project_id,
        'reactions.user': { $ne: req.user.id }
      },
      {
        $push: {
          reactions: {
            user: new mongoose.Types.ObjectId(req.user.id),
            emoji
          }
        }
      },
      { new: true }
    ).populate('reactions.user', 'name avatar_url');
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found or reaction already exists' });
    }
    
    const formattedMessage = {
      ...message.toObject(),
      id: message._id,
      reactions: message.reactions.map(reaction => ({
        ...reaction,
        user_name: reaction.user?.name,
        user_avatar: reaction.user?.avatar_url
      }))
    };
    
    res.json(formattedMessage);
  } catch (err) {
    console.error('Add reaction error:', err);
    res.status(500).json({ error: 'Failed to add reaction' });
  }
});

// Remove reaction from message
router.delete('/:project_id/:message_id/reactions', authenticateToken, async (req, res) => {
  try {
    const { project_id, message_id } = req.params;
    
    // Check if user is a member of the project
    const project = await Project.findById(project_id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const isTeamMember = project.team_members.some(
      member => member.toString() === req.user.id
    );
    
    if (!isTeamMember && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied to project chat' });
    }
    
    // Remove reaction
    const message = await ChatMessage.findOneAndUpdate(
      {
        _id: message_id,
        project_id: project_id
      },
      {
        $pull: {
          reactions: { user: req.user.id }
        }
      },
      { new: true }
    ).populate('reactions.user', 'name avatar_url');
    
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }
    
    const formattedMessage = {
      ...message.toObject(),
      id: message._id,
      reactions: message.reactions.map(reaction => ({
        ...reaction,
        user_name: reaction.user?.name,
        user_avatar: reaction.user?.avatar_url
      }))
    };
    
    res.json(formattedMessage);
  } catch (err) {
    console.error('Remove reaction error:', err);
    res.status(500).json({ error: 'Failed to remove reaction' });
  }
});

// Mark messages as read
router.post('/:project_id/read', authenticateToken, async (req, res) => {
  try {
    const { project_id } = req.params;
    const { message_ids } = req.body;
    
    if (!Array.isArray(message_ids) || message_ids.length === 0) {
      return res.status(400).json({ error: 'Message IDs array is required' });
    }
    
    // Check if user is a member of the project
    const project = await Project.findById(project_id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const isTeamMember = project.team_members.some(
      member => member.toString() === req.user.id
    );
    
    if (!isTeamMember && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied to project chat' });
    }
    
    // Add user to read_by for each message if not already there
    await ChatMessage.updateMany(
      {
        _id: { $in: message_ids },
        project_id: project_id,
        read_by: { $ne: req.user.id }
      },
      {
        $addToSet: { read_by: req.user.id }
      }
    );
    
    res.json({ message: 'Messages marked as read' });
  } catch (err) {
    console.error('Mark as read error:', err);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

module.exports = router;
