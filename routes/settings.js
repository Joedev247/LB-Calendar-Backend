const express = require('express');
const router = express.Router();
const { authenticateToken: auth } = require('../middleware/auth');
const UserSettings = require('../database/models/UserSettings');
const User = require('../database/models/User');
const { validateSettings } = require('../middleware/validation');

// Get user settings
router.get('/', auth, async (req, res) => {
  try {
    let settings = await UserSettings.findOne({ userId: req.user.id });
    
    if (!settings) {
      // Create default settings if none exist
      settings = new UserSettings({ userId: req.user.id });
      await settings.save();
    }

    res.json(settings);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update account settings
router.put('/account', auth, async (req, res) => {
  try {
    const { name, email, department } = req.body;

    // Check if email is already taken
    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: req.user.id } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already in use' });
      }
    }

    // Build update object
    const updateData = {};
    if (name) updateData.name = name;
    if (email) updateData.email = email;
    if (department) updateData.department = department;

    // Update user profile
    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update settings
    await UserSettings.findOneAndUpdate(
      { userId: req.user.id },
      { name: updatedUser.name, email: updatedUser.email, department: updatedUser.department },
      { upsert: true, new: true }
    );

    // Return updated user data
    const formattedUser = {
      ...updatedUser.toObject(),
      id: updatedUser._id
    };

    res.json({ 
      message: 'Account settings updated successfully',
      user: formattedUser
    });
  } catch (error) {
    console.error('Error updating account settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update notification settings
router.put('/notifications', auth, async (req, res) => {
  try {
    const { notifications } = req.body;

    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.user.id },
      { notifications },
      { upsert: true, new: true }
    );

    res.json(settings);
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update appearance settings
router.put('/appearance', auth, async (req, res) => {
  try {
    const { appearance } = req.body;

    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.user.id },
      { appearance },
      { upsert: true, new: true }
    );

    res.json(settings);
  } catch (error) {
    console.error('Error updating appearance settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update calendar settings
router.put('/calendar', auth, async (req, res) => {
  try {
    const { calendar } = req.body;

    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.user.id },
      { calendar },
      { upsert: true, new: true }
    );

    res.json(settings);
  } catch (error) {
    console.error('Error updating calendar settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update privacy settings
router.put('/privacy', auth, async (req, res) => {
  try {
    const { privacy } = req.body;

    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.user.id },
      { privacy },
      { upsert: true, new: true }
    );

    res.json(settings);
  } catch (error) {
    console.error('Error updating privacy settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update team settings
router.put('/team', auth, async (req, res) => {
  try {
    const { teamSettings } = req.body;

    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.user.id },
      { teamSettings },
      { upsert: true, new: true }
    );

    res.json(settings);
  } catch (error) {
    console.error('Error updating team settings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update security settings
router.put('/security/password', auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id);
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    // Update last password change timestamp
    await UserSettings.findOneAndUpdate(
      { userId: req.user.id },
      { 'security.lastPasswordChange': new Date() },
      { upsert: true }
    );

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error updating password:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle 2FA
router.put('/security/2fa', auth, async (req, res) => {
  try {
    const { enabled } = req.body;

    const settings = await UserSettings.findOneAndUpdate(
      { userId: req.user.id },
      { 'security.twoFactorEnabled': enabled },
      { upsert: true, new: true }
    );

    res.json(settings);
  } catch (error) {
    console.error('Error toggling 2FA:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;