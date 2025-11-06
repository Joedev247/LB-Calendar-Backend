const Task = require('../database/models/Task');
const Event = require('../database/models/Event');
const Project = require('../database/models/Project');
const User = require('../database/models/User');
const { createNotificationsForUsers, createNotification } = require('../utils/notifications');
const mongoose = require('mongoose');

/**
 * Check for overdue tasks and send notifications
 */
async function checkOverdueTasks() {
  try {
    const now = new Date();
    const overdueTasks = await Task.find({
      due_date: { $lt: now },
      status: { $in: ['pending', 'in_progress'] }
    })
      .populate('assigned_users', 'name')
      .populate('assigned_to', 'name')
      .populate('project_id', 'name');

    for (const task of overdueTasks) {
      const assignedUserIds = [];
      
      // Get all assigned users
      if (task.assigned_users && task.assigned_users.length > 0) {
        assignedUserIds.push(...task.assigned_users.map(u => u._id.toString()));
      }
      if (task.assigned_to) {
        const assignedToId = task.assigned_to._id.toString();
        if (!assignedUserIds.includes(assignedToId)) {
          assignedUserIds.push(assignedToId);
        }
      }

      if (assignedUserIds.length > 0) {
        const projectName = task.project_id?.name ? ` in ${task.project_id.name}` : '';
        const dueDate = new Date(task.due_date).toLocaleDateString();
        
        await createNotificationsForUsers(
          assignedUserIds,
          'Task Overdue',
          `The task "${task.title}"${projectName} was due on ${dueDate} and is still pending.`,
          'warning',
          `/tasks/${task._id}`
        );
      }
    }

    if (overdueTasks.length > 0) {
      console.log(`Checked ${overdueTasks.length} overdue tasks`);
    }
  } catch (error) {
    console.error('Error checking overdue tasks:', error);
  }
}

/**
 * Check for tasks due soon (within 24 hours) and send notifications
 */
async function checkTasksDueSoon() {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);

    const tasksDueSoon = await Task.find({
      due_date: { $gte: now, $lte: tomorrow },
      status: { $in: ['pending', 'in_progress'] }
    })
      .populate('assigned_users', 'name')
      .populate('assigned_to', 'name')
      .populate('project_id', 'name');

    for (const task of tasksDueSoon) {
      const assignedUserIds = [];
      
      if (task.assigned_users && task.assigned_users.length > 0) {
        assignedUserIds.push(...task.assigned_users.map(u => u._id.toString()));
      }
      if (task.assigned_to) {
        const assignedToId = task.assigned_to._id.toString();
        if (!assignedUserIds.includes(assignedToId)) {
          assignedUserIds.push(assignedToId);
        }
      }

      if (assignedUserIds.length > 0) {
        const projectName = task.project_id?.name ? ` in ${task.project_id.name}` : '';
        const dueDate = new Date(task.due_date).toLocaleDateString();
        const dueTime = new Date(task.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        await createNotificationsForUsers(
          assignedUserIds,
          'Task Due Soon',
          `The task "${task.title}"${projectName} is due on ${dueDate} at ${dueTime}.`,
          'info',
          `/tasks/${task._id}`
        );
      }
    }

    if (tasksDueSoon.length > 0) {
      console.log(`Checked ${tasksDueSoon.length} tasks due soon`);
    }
  } catch (error) {
    console.error('Error checking tasks due soon:', error);
  }
}

/**
 * Check for pending tasks and send daily reminders
 */
async function checkPendingTasks() {
  try {
    const pendingTasks = await Task.find({
      status: 'pending',
      due_date: { $exists: true, $gte: new Date() }
    })
      .populate('assigned_users', 'name')
      .populate('assigned_to', 'name')
      .populate('project_id', 'name');

    // Group tasks by user
    const userTasks = new Map();

    for (const task of pendingTasks) {
      const assignedUserIds = [];
      
      if (task.assigned_users && task.assigned_users.length > 0) {
        assignedUserIds.push(...task.assigned_users.map(u => u._id.toString()));
      }
      if (task.assigned_to) {
        const assignedToId = task.assigned_to._id.toString();
        if (!assignedUserIds.includes(assignedToId)) {
          assignedUserIds.push(assignedToId);
        }
      }

      assignedUserIds.forEach(userId => {
        if (!userTasks.has(userId)) {
          userTasks.set(userId, []);
        }
        userTasks.get(userId).push(task);
      });
    }

    // Send notifications to each user about their pending tasks
    for (const [userId, tasks] of userTasks.entries()) {
      if (tasks.length > 0) {
        const taskCount = tasks.length;
        const projectName = tasks[0].project_id?.name || '';
        
        await createNotification(
          userId,
          'Pending Tasks Reminder',
          `You have ${taskCount} pending task${taskCount > 1 ? 's' : ''}${projectName ? ` in ${projectName}` : ''}. Check your tasks to stay on track.`,
          'info',
          '/tasks'
        );
      }
    }

    if (pendingTasks.length > 0) {
      console.log(`Checked ${pendingTasks.length} pending tasks for ${userTasks.size} users`);
    }
  } catch (error) {
    console.error('Error checking pending tasks:', error);
  }
}

/**
 * Check for upcoming events and send notifications
 */
async function checkUpcomingEvents() {
  try {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setHours(24, 0, 0, 0);

    const upcomingEvents = await Event.find({
      start_date: { $gte: now, $lte: tomorrow }
    })
      .populate('created_by', 'name')
      .populate('project_id', 'name')
      .populate('hosts.user_id', 'name');

    // Get all users to notify about upcoming events
    const allUsers = await User.find({}).select('_id');
    const allUserIds = allUsers.map(u => u._id.toString());

    for (const event of upcomingEvents) {
      if (allUserIds.length > 0) {
        const projectName = event.project_id?.name ? ` in ${event.project_id.name}` : '';
        const eventDate = new Date(event.start_date).toLocaleDateString();
        const eventTime = new Date(event.start_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const location = event.is_online 
          ? `on ${event.online_platform || 'online platform'}`
          : event.location || 'location TBD';
        
        await createNotificationsForUsers(
          allUserIds,
          'Upcoming Event',
          `"${event.title}"${projectName} is happening on ${eventDate} at ${eventTime} ${location}.`,
          'info',
          `/events/${event._id}`
        );
      }
    }

    if (upcomingEvents.length > 0) {
      console.log(`Checked ${upcomingEvents.length} upcoming events`);
    }
  } catch (error) {
    console.error('Error checking upcoming events:', error);
  }
}

/**
 * Check for completed tasks and send notifications
 */
async function checkCompletedTasks() {
  try {
    // Get tasks completed in the last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const completedTasks = await Task.find({
      status: 'completed',
      updatedAt: { $gte: oneHourAgo }
    })
      .populate('created_by', 'name')
      .populate('project_id', 'name');

    for (const task of completedTasks) {
      // Notify the creator about the completed task
      if (task.created_by && task.created_by._id) {
        const creatorId = task.created_by._id.toString();
        const projectName = task.project_id?.name ? ` in ${task.project_id.name}` : '';
        
        await createNotification(
          creatorId,
          'Task Completed',
          `The task "${task.title}"${projectName} has been marked as completed.`,
          'success',
          `/tasks/${task._id}`
        );
      }
    }

    if (completedTasks.length > 0) {
      console.log(`Checked ${completedTasks.length} completed tasks`);
    }
  } catch (error) {
    console.error('Error checking completed tasks:', error);
  }
}

/**
 * Check for tasks assigned to users and send daily reminders
 */
async function checkAssignedTasks() {
  try {
    const tasks = await Task.find({
      status: { $in: ['pending', 'in_progress'] },
      $or: [
        { assigned_to: { $exists: true } },
        { assigned_users: { $exists: true, $ne: [] } }
      ]
    })
      .populate('assigned_users', 'name')
      .populate('assigned_to', 'name')
      .populate('project_id', 'name');

    // Group tasks by user
    const userTasks = new Map();

    for (const task of tasks) {
      const assignedUserIds = [];
      
      if (task.assigned_users && task.assigned_users.length > 0) {
        assignedUserIds.push(...task.assigned_users.map(u => u._id.toString()));
      }
      if (task.assigned_to) {
        const assignedToId = task.assigned_to._id.toString();
        if (!assignedUserIds.includes(assignedToId)) {
          assignedUserIds.push(assignedToId);
        }
      }

      assignedUserIds.forEach(userId => {
        if (!userTasks.has(userId)) {
          userTasks.set(userId, []);
        }
        userTasks.get(userId).push(task);
      });
    }

    // Send notifications to each user about their assigned tasks
    for (const [userId, tasks] of userTasks.entries()) {
      if (tasks.length > 0) {
        const taskCount = tasks.length;
        const overdueCount = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date()).length;
        const dueSoonCount = tasks.filter(t => {
          if (!t.due_date) return false;
          const dueDate = new Date(t.due_date);
          const tomorrow = new Date();
          tomorrow.setHours(24, 0, 0, 0);
          return dueDate >= new Date() && dueDate <= tomorrow;
        }).length;
        
        let message = `You have ${taskCount} assigned task${taskCount > 1 ? 's' : ''}`;
        if (overdueCount > 0) {
          message += ` (${overdueCount} overdue)`;
        } else if (dueSoonCount > 0) {
          message += ` (${dueSoonCount} due soon)`;
        }
        message += '. Check your tasks to stay on track.';
        
        await createNotification(
          userId,
          'Your Assigned Tasks',
          message,
          overdueCount > 0 ? 'warning' : 'info',
          '/tasks'
        );
      }
    }

    if (tasks.length > 0) {
      console.log(`Checked ${tasks.length} assigned tasks for ${userTasks.size} users`);
    }
  } catch (error) {
    console.error('Error checking assigned tasks:', error);
  }
}

/**
 * Run all reminder checks
 */
async function runReminderChecks() {
  console.log('Running reminder checks...');
  await checkOverdueTasks();
  await checkTasksDueSoon();
  await checkUpcomingEvents();
  await checkCompletedTasks();
  // checkPendingTasks and checkAssignedTasks - run less frequently (daily)
}

/**
 * Initialize reminder service
 */
function startReminderService() {
  // Run checks every 30 minutes for overdue, due soon, events, and completed tasks
  setInterval(runReminderChecks, 30 * 60 * 1000);
  
  // Run pending tasks and assigned tasks check once per day (at midnight)
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  const msUntilMidnight = tomorrow.getTime() - now.getTime();
  
  setTimeout(() => {
    checkPendingTasks();
    checkAssignedTasks();
    // Then run daily
    setInterval(() => {
      checkPendingTasks();
      checkAssignedTasks();
    }, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);

  // Run initial check after 1 minute
  setTimeout(runReminderChecks, 60 * 1000);
  
  // Run initial daily checks after 2 minutes
  setTimeout(() => {
    checkPendingTasks();
    checkAssignedTasks();
  }, 2 * 60 * 1000);
  
  console.log('Reminder service started - checks will run every 30 minutes');
}

module.exports = {
  startReminderService,
  checkOverdueTasks,
  checkTasksDueSoon,
  checkPendingTasks,
  checkUpcomingEvents,
  checkCompletedTasks,
  checkAssignedTasks
};

