const express = require('express');
const mongoose = require('mongoose');
const { authenticateToken, requireRole } = require('../middleware/auth');
const User = require('../database/models/User');
const Project = require('../database/models/Project');
const Task = require('../database/models/Task');
const Notification = require('../database/models/Notification');

const router = express.Router();

// Get all users (accessible to all authenticated users for task assignment)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password')
      .sort({ name: 1 });
    
    const formattedUsers = users.map(user => ({
      ...user.toObject(),
      id: user._id
    }));
    
    res.json(formattedUsers);
  } catch (err) {
    console.error('Get users error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get user by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Users can only view their own profile unless they're admin
    if (id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const user = await User.findById(id).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const formattedUser = {
      ...user.toObject(),
      id: user._id
    };
    
    res.json(formattedUser);
  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get user's notifications
router.get('/:id/notifications', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Users can only view their own notifications
    if (id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const { read, limit = 50 } = req.query;
    
    const query = {
      user_id: new mongoose.Types.ObjectId(id)
    };
    
    if (read !== undefined) {
      query.read = read === 'true';
    }
    
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    const formattedNotifications = notifications.map(notification => ({
      ...notification.toObject(),
      id: notification._id
    }));
    
    res.json(formattedNotifications);
  } catch (err) {
    console.error('Get notifications error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Mark notification as read
router.patch('/:id/notifications/:notification_id', authenticateToken, async (req, res) => {
  try {
    const { id, notification_id } = req.params;
    
    // Users can only update their own notifications
    if (id !== req.user.id) {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const notification = await Notification.findOneAndUpdate(
      { 
        _id: notification_id,
        user_id: new mongoose.Types.ObjectId(id)
      },
      { read: true },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Update notification error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get user's projects
router.get('/:id/projects', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Users can only view their own projects
    if (id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const projects = await Project.find({
      $or: [
        { created_by: id },
        { team_members: id }
      ]
    })
      .sort({ createdAt: -1 })
      .populate('created_by', 'name');
    
    const formattedProjects = projects.map(project => ({
      ...project.toObject(),
      id: project._id,
      created_by_name: project.created_by?.name,
      user_role: project.created_by.toString() === id ? 'admin' : 'member'
    }));
    
    res.json(formattedProjects);
  } catch (err) {
    console.error('Get user projects error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get user's tasks
router.get('/:id/tasks', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Users can only view their own tasks
    if (id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    const { status, project_id } = req.query;
    
    const query = {
      $or: [
        { assigned_to: new mongoose.Types.ObjectId(id) },
        { created_by: new mongoose.Types.ObjectId(id) }
      ]
    };
    
    if (status) {
      query.status = status;
    }
    
    if (project_id) {
      query.project_id = new mongoose.Types.ObjectId(project_id);
    }
    
    const tasks = await Task.find(query)
      .sort({ due_date: 1, priority: -1 })
      .populate('project_id', 'name color')
      .populate('assigned_to', 'name')
      .populate('created_by', 'name');
    
    const formattedTasks = tasks.map(task => ({
      ...task.toObject(),
      id: task._id,
      project_name: task.project_id?.name,
      project_color: task.project_id?.color,
      assigned_to_name: task.assigned_to?.name,
      created_by_name: task.created_by?.name
    }));
    
    res.json(formattedTasks);
  } catch (err) {
    console.error('Get user tasks error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update user profile
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, department, avatar_url } = req.body;
    
    // Users can only update their own profile
    if (id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Check if email is already taken (if email is being updated)
    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: id } });
      if (existingUser) {
        return res.status(400).json({ error: 'Email already in use' });
      }
    }
    
    // Build update object
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (department) updateData.department = department;
    if (avatar_url) updateData.avatar_url = avatar_url;
    
    const user = await User.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).select('-password');
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const formattedUser = {
      ...user.toObject(),
      id: user._id
    };
    
    res.json(formattedUser);
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (admin only)
router.delete('/:id', authenticateToken, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Prevent admin from deleting themselves
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    const user = await User.findById(id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Delete user and all their data
    await Promise.all([
      User.findByIdAndDelete(id),
      Task.deleteMany({ $or: [{ created_by: id }, { assigned_to: id }] }),
      Project.updateMany(
        { team_members: id },
        { $pull: { team_members: id } }
      ),
      Notification.deleteMany({ user_id: id })
    ]);
    
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    console.error('Delete user error:', err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

module.exports = router;
