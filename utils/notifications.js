const Notification = require('../database/models/Notification');
const mongoose = require('mongoose');

/**
 * Create a notification for a user
 */
async function createNotification(userId, title, message, type = 'info', link = null) {
  try {
    const notification = new Notification({
      user_id: new mongoose.Types.ObjectId(userId),
      title,
      message,
      type,
      link
    });
    await notification.save();
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
}

/**
 * Create notifications for multiple users
 */
async function createNotificationsForUsers(userIds, title, message, type = 'info', link = null) {
  try {
    if (!userIds || userIds.length === 0) {
      console.log('No users to notify');
      return [];
    }

    const notifications = userIds.map(userId => ({
      user_id: new mongoose.Types.ObjectId(userId),
      title,
      message,
      type,
      link,
      read: false
    }));
    
    if (notifications.length > 0) {
      const result = await Notification.insertMany(notifications);
      console.log(`Created ${result.length} notifications for users:`, userIds);
      return result;
    }
    return [];
  } catch (error) {
    console.error('Error creating notifications:', error);
    console.error('Error details:', error.message, error.stack);
    // Don't throw - just log the error so it doesn't break the main operation
    return [];
  }
}

module.exports = {
  createNotification,
  createNotificationsForUsers
};

