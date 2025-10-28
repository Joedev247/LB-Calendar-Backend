const express = require('express');
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const ChatMessage = require('../database/models/ChatMessage');
const Project = require('../database/models/Project');

const router = express.Router();

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
