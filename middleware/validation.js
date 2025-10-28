const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

const validateEvent = [
  body('title').notEmpty().withMessage('Title is required'),
  body('start_date').isISO8601().withMessage('Valid start date is required'),
  body('end_date').isISO8601().withMessage('Valid end date is required'),
  body('project_id').optional().custom(value => {
    if (!value) return true;
    return mongoose.Types.ObjectId.isValid(value);
  }).withMessage('Invalid project ID format'),
  handleValidationErrors
];

const validateTask = [
  body('title').notEmpty().withMessage('Title is required'),
  body('due_date').optional().isISO8601().withMessage('Valid due date is required'),
  body('priority').optional().isIn(['low', 'medium', 'high']).withMessage('Priority must be low, medium, or high'),
  body('project_id').optional().custom(value => {
    if (!value) return true;
    return mongoose.Types.ObjectId.isValid(value);
  }).withMessage('Invalid project ID format'),
  body('assigned_to').optional().custom(value => {
    if (!value) return true;
    return mongoose.Types.ObjectId.isValid(value);
  }).withMessage('Invalid user ID format'),
  handleValidationErrors
];

const validateProject = [
  body('name').notEmpty().withMessage('Project name is required'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('color').optional().isHexColor().withMessage('Color must be a valid hex color'),
  handleValidationErrors
];

const validateUser = [
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('name').notEmpty().withMessage('Name is required'),
  handleValidationErrors
];

const validateSettings = [
  // Account settings validation
  body('name').optional().isString().withMessage('Name must be a string'),
  body('email').optional().isEmail().withMessage('Email must be valid'),

  // Notification settings validation
  body('notifications.emailNotifications').optional().isBoolean(),
  body('notifications.pushNotifications').optional().isBoolean(),
  body('notifications.taskReminders').optional().isBoolean(),
  body('notifications.eventReminders').optional().isBoolean(),
  body('notifications.chatNotifications').optional().isBoolean(),

  // Appearance settings validation
  body('appearance.theme').optional().isIn(['light', 'dark', 'system']),
  body('appearance.accentColor').optional().isHexColor(),
  body('appearance.fontSize').optional().isIn(['small', 'medium', 'large']),
  body('appearance.compactMode').optional().isBoolean(),

  // Calendar settings validation
  body('calendar.defaultView').optional().isIn(['month', 'week', 'day', 'agenda']),
  body('calendar.weekStartsOn').optional().isIn([0, 1, 6]),
  body('calendar.showWeekends').optional().isBoolean(),
  body('calendar.workingHours.start').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('calendar.workingHours.end').optional().matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
  body('calendar.timeZone').optional(),

  // Privacy settings validation
  body('privacy.profileVisibility').optional().isIn(['public', 'private', 'team']),
  body('privacy.calendarVisibility').optional().isIn(['public', 'private', 'team']),
  body('privacy.showEmail').optional().isBoolean(),

  // Team settings validation
  body('teamSettings.autoAcceptInvites').optional().isBoolean(),
  body('teamSettings.showTaskProgress').optional().isBoolean(),
  body('teamSettings.defaultProjectRole').optional().isIn(['viewer', 'member', 'editor']),

  // Security settings validation
  body('security.twoFactorEnabled').optional().isBoolean(),
  body('security.activeSessions.*.deviceName').optional().isString(),
  body('security.activeSessions.*.ipAddress').optional().isIP(),

  handleValidationErrors
];

module.exports = {
  validateEvent,
  validateTask,
  validateProject,
  validateUser,
  validateSettings,
  handleValidationErrors
};
