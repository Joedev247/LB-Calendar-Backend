const express = require('express');
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const Notification = require('../database/models/Notification');

const router = express.Router();

// Get current user's notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { read, limit = 50 } = req.query;
    const userId = new mongoose.Types.ObjectId(req.user.id);
    
    const query = {
      user_id: userId
    };
    
    if (read !== undefined) {
      query.read = read === 'true';
    }
    
    console.log(`Fetching notifications for user ${req.user.id} with query:`, query);
    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));
    
    console.log(`Found ${notifications.length} notifications for user ${req.user.id}`);
    
    const formattedNotifications = notifications.map(notification => ({
      ...notification.toObject(),
      id: notification._id
    }));
    
    res.json(formattedNotifications);
  } catch (err) {
    console.error('Get notifications error:', err);
    console.error('Error details:', err.message, err.stack);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// Get unread notifications count
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const count = await Notification.countDocuments({
      user_id: userId,
      read: false
    });
    
    console.log(`Unread count for user ${req.user.id}: ${count}`);
    res.json({ count });
  } catch (err) {
    console.error('Get unread count error:', err);
    console.error('Error details:', err.message, err.stack);
    res.status(500).json({ error: 'Database error', details: err.message });
  }
});

// Mark notification as read
router.patch('/:id/read', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findOneAndUpdate(
      { 
        _id: id,
        user_id: new mongoose.Types.ObjectId(req.user.id)
      },
      { read: true },
      { new: true }
    );
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ message: 'Notification marked as read', notification });
  } catch (err) {
    console.error('Update notification error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Mark all notifications as read
router.patch('/read-all', authenticateToken, async (req, res) => {
  try {
    await Notification.updateMany(
      { 
        user_id: new mongoose.Types.ObjectId(req.user.id),
        read: false
      },
      { read: true }
    );
    
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Delete notification
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const notification = await Notification.findOneAndDelete({
      _id: id,
      user_id: new mongoose.Types.ObjectId(req.user.id)
    });
    
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    console.error('Delete notification error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;

