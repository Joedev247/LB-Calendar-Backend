const express = require('express');
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const { validateTask } = require('../middleware/validation');
const Task = require('../database/models/Task');
const Project = require('../database/models/Project');
const { createNotificationsForUsers } = require('../utils/notifications');
const User = require('../database/models/User');

const router = express.Router();

// Get all tasks
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { project_id, assigned_to, status, due_date } = req.query;
    
    const query = {};
    
    if (project_id) {
      query.project_id = new mongoose.Types.ObjectId(project_id);
    }
    
    if (assigned_to) {
      query.assigned_to = new mongoose.Types.ObjectId(assigned_to);
    }
    
    if (status) {
      query.status = status;
    }
    
    if (due_date) {
      // Match tasks on the specific date
      const startDate = new Date(due_date);
      const endDate = new Date(due_date);
      endDate.setDate(endDate.getDate() + 1);
      query.due_date = { $gte: startDate, $lt: endDate };
    }
    
    const tasks = await Task.find(query)
      .sort({ due_date: 1, priority: -1 })
      .populate('project_id', 'name color')
      .populate('assigned_to', 'name email')
      .populate('assigned_users', 'name email')
      .populate('created_by', 'name email');
    
    const formattedTasks = tasks.map(task => ({
      ...task.toObject(),
      id: task._id,
      project_name: task.project_id?.name,
      project_color: task.project_id?.color,
      assigned_to_name: task.assigned_to?.name,
      assigned_users_names: task.assigned_users?.map(u => ({ id: u._id, name: u.name, email: u.email })) || [],
      created_by_name: task.created_by?.name,
      created_by_email: task.created_by?.email
    }));
    
    res.json(formattedTasks);
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get task by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const task = await Task.findById(id)
      .populate('project_id', 'name color')
      .populate('assigned_to', 'name email')
      .populate('assigned_users', 'name email')
      .populate('created_by', 'name email');
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const formattedTask = {
      ...task.toObject(),
      id: task._id,
      project_name: task.project_id?.name,
      project_color: task.project_id?.color,
      assigned_to_name: task.assigned_to?.name,
      assigned_users_names: task.assigned_users?.map(u => ({ id: u._id, name: u.name, email: u.email })) || [],
      created_by_name: task.created_by?.name,
      created_by_email: task.created_by?.email
    };
    
    res.json(formattedTask);
  } catch (err) {
    console.error('Get task error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new task
router.post('/', authenticateToken, validateTask, async (req, res) => {
  try {
    const { title, description, due_date, priority, project_id, assigned_to, assigned_users } = req.body;
    const created_by = req.user.id;

    // Convert assigned_users to array of ObjectIds
    let assignedUsersArray = [];
    if (assigned_users && Array.isArray(assigned_users)) {
      assignedUsersArray = assigned_users.map(id => new mongoose.Types.ObjectId(id));
    } else if (assigned_to) {
      // Backward compatibility: if assigned_to is provided, add to array
      assignedUsersArray = [new mongoose.Types.ObjectId(assigned_to)];
    }

    console.log('Creating task:', {
      title,
      description,
      due_date,
      priority,
      project_id,
      assigned_users: assignedUsersArray,
      created_by
    });
    
    const task = await Task.create({
      title,
      description,
      due_date,
      priority: priority || 'medium',
      project_id: project_id ? new mongoose.Types.ObjectId(project_id) : undefined,
      assigned_to: assigned_to ? new mongoose.Types.ObjectId(assigned_to) : (assignedUsersArray.length > 0 ? assignedUsersArray[0] : undefined),
      assigned_users: assignedUsersArray,
      created_by: new mongoose.Types.ObjectId(created_by),
      status: 'pending'
    });

    // If task has project_id and assigned_users, add them to project team_members
    if (project_id && assignedUsersArray.length > 0) {
      try {
        const project = await Project.findById(project_id);
        if (project) {
          const uniqueUserIds = new Set([
            ...project.team_members.map(id => id.toString()),
            ...assignedUsersArray.map(id => id.toString())
          ]);
          project.team_members = Array.from(uniqueUserIds).map(id => new mongoose.Types.ObjectId(id));
          await project.save();
        }
      } catch (projectErr) {
        console.error('Error updating project team members:', projectErr);
        // Don't fail the task creation if project update fails
      }
    }

    // Create notifications for assigned users (excluding the creator)
    if (assignedUsersArray.length > 0) {
      try {
        const creatorId = created_by.toString();
        const userIdsToNotify = assignedUsersArray
          .filter(userId => userId.toString() !== creatorId)
          .map(userId => userId.toString());
        
        if (userIdsToNotify.length > 0) {
          const creator = await User.findById(created_by);
          const projectName = project_id ? (await Project.findById(project_id))?.name : null;
          const taskTitle = title;
          
          const titleText = projectName 
            ? `New task assigned in ${projectName}`
            : 'New task assigned';
          const messageText = projectName
            ? `${creator?.name || 'Someone'} assigned you to "${taskTitle}" in ${projectName}`
            : `${creator?.name || 'Someone'} assigned you to "${taskTitle}"`;
          
          console.log(`Creating task notifications for ${userIdsToNotify.length} users`);
          const result = await createNotificationsForUsers(
            userIdsToNotify,
            titleText,
            messageText,
            'info',
            `/tasks/${task._id}`
          );
          console.log(`Task notifications created:`, result?.length || 0);
        }
      } catch (notifErr) {
        console.error('Error creating task notifications:', notifErr);
        // Don't fail the task creation if notification creation fails
      }
    }
    
    const populatedTask = await Task.findById(task._id)
      .populate('project_id', 'name color')
      .populate('assigned_to', 'name email')
      .populate('assigned_users', 'name email')
      .populate('created_by', 'name email');
    
    const formattedTask = {
      ...populatedTask.toObject(),
      id: populatedTask._id,
      project_name: populatedTask.project_id?.name,
      project_color: populatedTask.project_id?.color,
      assigned_to_name: populatedTask.assigned_to?.name,
      assigned_users_names: populatedTask.assigned_users?.map(u => ({ id: u._id, name: u.name, email: u.email })) || [],
      created_by_name: populatedTask.created_by?.name,
      created_by_email: populatedTask.created_by?.email
    };
    
    res.status(201).json(formattedTask);
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// Update task
router.put('/:id', authenticateToken, validateTask, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, due_date, status, priority, project_id, assigned_to, assigned_users } = req.body;
    
    // Check if task exists and user has permission
    const task = await Task.findById(id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (task.created_by.toString() !== req.user.id && 
        task.assigned_to?.toString() !== req.user.id && 
        req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Get current assigned users before update
    const currentAssignedUsers = task.assigned_users?.map(id => id.toString()) || [];
    
    // Convert assigned_users to array of ObjectIds
    let assignedUsersArray = [];
    if (assigned_users && Array.isArray(assigned_users)) {
      assignedUsersArray = assigned_users.map(userId => new mongoose.Types.ObjectId(userId));
    } else if (assigned_to) {
      assignedUsersArray = [new mongoose.Types.ObjectId(assigned_to)];
    }
    
    // Find newly assigned users (users in new array but not in old array)
    const newAssignedUsers = assignedUsersArray
      .map(id => id.toString())
      .filter(id => !currentAssignedUsers.includes(id));
    
    const oldProjectId = task.project_id?.toString();
    const newProjectId = project_id ? project_id.toString() : null;
    
    task.title = title;
    task.description = description;
    task.due_date = due_date;
    task.status = status || task.status;
    task.priority = priority || task.priority;
    task.project_id = project_id ? new mongoose.Types.ObjectId(project_id) : undefined;
    task.assigned_to = assignedUsersArray.length > 0 ? assignedUsersArray[0] : (assigned_to ? new mongoose.Types.ObjectId(assigned_to) : undefined);
    task.assigned_users = assignedUsersArray;
    
    await task.save();

    // If task has project_id and assigned_users, add them to project team_members
    if (newProjectId && assignedUsersArray.length > 0) {
      try {
        const project = await Project.findById(newProjectId);
        if (project) {
          const uniqueUserIds = new Set([
            ...project.team_members.map(id => id.toString()),
            ...assignedUsersArray.map(id => id.toString())
          ]);
          project.team_members = Array.from(uniqueUserIds).map(id => new mongoose.Types.ObjectId(id));
          await project.save();
        }
      } catch (projectErr) {
        console.error('Error updating project team members:', projectErr);
      }
    }

    // Create notifications for newly assigned users (excluding the updater)
    if (newAssignedUsers.length > 0) {
      try {
        const updaterId = req.user.id.toString();
        const userIdsToNotify = newAssignedUsers.filter(userId => userId !== updaterId);
        
        if (userIdsToNotify.length > 0) {
          const updater = await User.findById(req.user.id);
          const projectName = newProjectId ? (await Project.findById(newProjectId))?.name : null;
          const taskTitle = title || task.title;
          
          const titleText = projectName 
            ? `Task assigned in ${projectName}`
            : 'Task assigned';
          const messageText = projectName
            ? `${updater?.name || 'Someone'} assigned you to "${taskTitle}" in ${projectName}`
            : `${updater?.name || 'Someone'} assigned you to "${taskTitle}"`;
          
          console.log(`Creating task update notifications for ${userIdsToNotify.length} users`);
          const result = await createNotificationsForUsers(
            userIdsToNotify,
            titleText,
            messageText,
            'info',
            `/tasks/${task._id}`
          );
          console.log(`Task update notifications created:`, result?.length || 0);
        }
      } catch (notifErr) {
        console.error('Error creating task update notifications:', notifErr);
      }
    }
    
    const updatedTask = await Task.findById(id)
      .populate('project_id', 'name color')
      .populate('assigned_to', 'name email')
      .populate('assigned_users', 'name email')
      .populate('created_by', 'name email');
    
    const formattedTask = {
      ...updatedTask.toObject(),
      id: updatedTask._id,
      project_name: updatedTask.project_id?.name,
      project_color: updatedTask.project_id?.color,
      assigned_to_name: updatedTask.assigned_to?.name,
      assigned_users_names: updatedTask.assigned_users?.map(u => ({ id: u._id, name: u.name, email: u.email })) || [],
      created_by_name: updatedTask.created_by?.name,
      created_by_email: updatedTask.created_by?.email
    };
    
    res.json(formattedTask);
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Toggle task status
router.patch('/:id/toggle', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const task = await Task.findById(id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (task.assigned_to?.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Toggle between pending, in_progress, and completed
    const statusTransition = {
      'pending': 'in_progress',
      'in_progress': 'completed',
      'completed': 'pending'
    };
    
    task.status = statusTransition[task.status];
    await task.save();
    
    res.json({ message: 'Task updated successfully', status: task.status });
  } catch (err) {
    console.error('Toggle task error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// Delete task
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if task exists and user has permission
    const task = await Task.findById(id);
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (task.created_by.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    await Task.findByIdAndDelete(id);
    res.json({ message: 'Task deleted successfully' });
  } catch (err) {
    console.error('Delete task error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

module.exports = router;
