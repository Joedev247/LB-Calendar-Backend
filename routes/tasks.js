const express = require('express');
const mongoose = require('mongoose');
const { authenticateToken } = require('../middleware/auth');
const { validateTask } = require('../middleware/validation');
const Task = require('../database/models/Task');

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
      .populate('assigned_to', 'name')
      .populate('created_by', 'name');
    
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    const formattedTask = {
      ...task.toObject(),
      id: task._id,
      project_name: task.project_id?.name,
      project_color: task.project_id?.color,
      assigned_to_name: task.assigned_to?.name,
      created_by_name: task.created_by?.name
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
    const { title, description, due_date, priority, project_id, assigned_to } = req.body;
    const created_by = req.user.id;

    console.log('Creating task:', {
      title,
      description,
      due_date,
      priority,
      project_id,
      assigned_to,
      created_by
    });
    
    const task = await Task.create({
      title,
      description,
      due_date,
      priority: priority || 'medium',
      project_id: project_id ? project_id : undefined,
      assigned_to: assigned_to ? assigned_to : undefined,
      created_by,
      status: 'pending'
    });
    
    const populatedTask = await Task.findById(task._id)
      .populate('project_id', 'name color')
      .populate('assigned_to', 'name')
      .populate('created_by', 'name');
    
    const formattedTask = {
      ...populatedTask.toObject(),
      id: populatedTask._id,
      project_name: populatedTask.project_id?.name,
      project_color: populatedTask.project_id?.color,
      assigned_to_name: populatedTask.assigned_to?.name,
      created_by_name: populatedTask.created_by?.name
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
    const { title, description, due_date, status, priority, project_id, assigned_to } = req.body;
    
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
    
    task.title = title;
    task.description = description;
    task.due_date = due_date;
    task.status = status || task.status;
    task.priority = priority || task.priority;
    task.project_id = project_id ? new mongoose.Types.ObjectId(project_id) : undefined;
    task.assigned_to = assigned_to ? new mongoose.Types.ObjectId(assigned_to) : undefined;
    
    await task.save();
    
    const updatedTask = await Task.findById(id)
      .populate('project_id', 'name color')
      .populate('assigned_to', 'name')
      .populate('created_by', 'name');
    
    const formattedTask = {
      ...updatedTask.toObject(),
      id: updatedTask._id,
      project_name: updatedTask.project_id?.name,
      project_color: updatedTask.project_id?.color,
      assigned_to_name: updatedTask.assigned_to?.name,
      created_by_name: updatedTask.created_by?.name
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
