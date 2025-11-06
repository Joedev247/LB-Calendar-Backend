const express = require('express');
const mongoose = require('mongoose');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validateProject } = require('../middleware/validation');
const Project = require('../database/models/Project');
const Task = require('../database/models/Task');
const Event = require('../database/models/Event');
const User = require('../database/models/User');
const { createNotificationsForUsers } = require('../utils/notifications');

const router = express.Router();

// Get all projects
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { status } = req.query;
    
    const query = {};
    if (status) {
      query.status = status;
    }
    
    const projects = await Project.find(query)
      .sort({ createdAt: -1 })
      .populate('created_by', 'name')
      .populate('team_members', 'name');
    
    // Get counts for each project in parallel
    const projectsWithCounts = await Promise.all(projects.map(async project => {
      const [memberCount, taskCount, eventCount] = await Promise.all([
        project.team_members.length,
        Task.countDocuments({ project_id: project._id }),
        Event.countDocuments({ project_id: project._id })
      ]);
      
      return {
        ...project.toObject(),
        id: project._id,
        created_by_name: project.created_by?.name,
        created_at: project.createdAt,
        updated_at: project.updatedAt,
        member_count: memberCount,
        task_count: taskCount,
        event_count: eventCount
      };
    }));
    
    res.json(projectsWithCounts);
  } catch (err) {
    console.error('Get projects error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get project by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const project = await Project.findById(id)
      .populate('created_by', 'name email')
      .populate('team_members', 'name email');
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Get all tasks for this project
    const tasks = await Task.find({ project_id: id })
      .populate('project_id', 'name color')
      .populate('assigned_to', 'name email')
      .populate('assigned_users', 'name email')
      .populate('created_by', 'name email')
      .sort({ createdAt: -1 });

    // Get all events for this project
    const events = await Event.find({ project_id: id })
      .populate('project_id', 'name color')
      .populate('created_by', 'name email')
      .populate('hosts.user_id', 'name email')
      .sort({ start_date: 1 });

    // Aggregate all unique team members from tasks
    const taskTeamMembers = new Set();
    tasks.forEach(task => {
      if (task.assigned_users && task.assigned_users.length > 0) {
        task.assigned_users.forEach(user => {
          if (user && user._id) {
            taskTeamMembers.add(user._id.toString());
          }
        });
      }
      if (task.assigned_to && task.assigned_to._id) {
        taskTeamMembers.add(task.assigned_to._id.toString());
      }
    });

    // Combine project team_members with task team members
    const allTeamMemberIds = new Set();
    project.team_members.forEach(member => {
      if (member && member._id) {
        allTeamMemberIds.add(member._id.toString());
      }
    });
    taskTeamMembers.forEach(memberId => {
      allTeamMemberIds.add(memberId);
    });

    // Get all unique team members with details
    const User = require('../database/models/User');
    const uniqueMemberIds = Array.from(allTeamMemberIds);
    const allMembers = await User.find({ _id: { $in: uniqueMemberIds } })
      .select('name email');

    // Format tasks
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

    // Format events
    const formattedEvents = events.map(event => {
      const formattedHosts = event.hosts.map(host => {
        if (host.user_id && host.user_id._id) {
          return {
            id: host.user_id._id,
            user_id: host.user_id._id,
            name: host.user_id.name,
            email: host.user_id.email,
            role: host.role || 'Host',
            is_external: false
          };
        } else {
          return {
            id: host._id,
            name: host.name,
            email: host.email,
            role: host.role || 'Host',
            is_external: true
          };
        }
      });
      
      return {
        ...event.toObject(),
        id: event._id,
        project_name: event.project_id?.name,
        project_color: event.project_id?.color,
        created_by_name: event.created_by?.name,
        created_by_email: event.created_by?.email,
        hosts: formattedHosts
      };
    });
    
    const formattedProject = {
      ...project.toObject(),
      id: project._id,
      created_by_name: project.created_by?.name,
      created_by_email: project.created_by?.email,
      tasks: formattedTasks,
      events: formattedEvents,
      members: allMembers.map(member => ({
        id: member._id,
        name: member.name,
        email: member.email
      })),
      member_count: allMembers.length,
      task_count: tasks.length,
      event_count: events.length
    };
    
    res.json(formattedProject);
  } catch (err) {
    console.error('Get project error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get project members
router.get('/:id/members', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const project = await Project.findById(id)
      .populate('team_members', 'name email avatar_url');
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    const members = project.team_members.map(member => ({
      id: member._id,
      name: member.name,
      email: member.email,
      avatar_url: member.avatar_url,
      joined_at: member.createdAt
    }));
    
    res.json(members);
  } catch (err) {
    console.error('Get members error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new project
router.post('/', authenticateToken, validateProject, async (req, res) => {
  try {
    const { name, description, color } = req.body;
    const created_by = req.user.id;
    
    // Create project with creator as first team member
    const project = await Project.create({
      name,
      description,
      color: color || '#5D4C8E',
      created_by: new mongoose.Types.ObjectId(created_by),
      team_members: [new mongoose.Types.ObjectId(created_by)]
    });
    
    const populatedProject = await Project.findById(project._id)
      .populate('created_by', 'name')
      .populate('team_members', 'name');
    
    const formattedProject = {
      ...populatedProject.toObject(),
      id: populatedProject._id,
      created_by_name: populatedProject.created_by?.name
    };

    // Notify all users about the new project (excluding creator)
    try {
      const allUsers = await User.find({}).select('_id');
      const creatorId = created_by.toString();
      const userIdsToNotify = allUsers
        .map(u => u._id.toString())
        .filter(id => id !== creatorId);
      
      if (userIdsToNotify.length > 0) {
        const creator = await User.findById(created_by);
        console.log(`Creating project notifications for ${userIdsToNotify.length} users`);
        const result = await createNotificationsForUsers(
          userIdsToNotify,
          'New project created',
          `${creator?.name || 'Someone'} created a new project: "${name}"`,
          'success',
          `/projects/${project._id}`
        );
        console.log(`Project notifications created:`, result?.length || 0);
      }
    } catch (notifErr) {
      console.error('Error creating project notifications:', notifErr);
      // Don't fail project creation if notifications fail
    }
    
    res.status(201).json(formattedProject);
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project' });
  }
});

// Update project
router.put('/:id', authenticateToken, validateProject, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, status } = req.body;
    
    // Check if project exists
    const project = await Project.findById(id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check if user is a team member or system admin
    const isTeamMember = project.team_members.some(
      member => member.toString() === req.user.id
    );
    const isProjectCreator = project.created_by.toString() === req.user.id;
    
    if (!isTeamMember && !isProjectCreator && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    project.name = name;
    project.description = description;
    project.color = color;
    project.status = status || project.status;
    
    await project.save();
    
    const updatedProject = await Project.findById(id)
      .populate('created_by', 'name')
      .populate('team_members', 'name');
    
    const formattedProject = {
      ...updatedProject.toObject(),
      id: updatedProject._id,
      created_by_name: updatedProject.created_by?.name
    };
    
    res.json(formattedProject);
  } catch (err) {
    console.error('Update project error:', err);
    res.status(500).json({ error: 'Failed to update project' });
  }
});

// Add team member
router.post('/:id/members', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body;
    
    // Check if project exists
    const project = await Project.findById(id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check if user is project creator or admin
    const isProjectCreator = project.created_by.toString() === req.user.id;
    
    if (!isProjectCreator && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Check if user is already a member
    const isAlreadyMember = project.team_members.some(
      member => member.toString() === user_id
    );
    
    if (!isAlreadyMember) {
      project.team_members.push(new mongoose.Types.ObjectId(user_id));
      await project.save();
    }
    
    res.status(201).json({ message: 'Team member added successfully' });
  } catch (err) {
    console.error('Add team member error:', err);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

// Remove team member
router.delete('/:id/members/:user_id', authenticateToken, async (req, res) => {
  try {
    const { id, user_id } = req.params;
    
    // Check if project exists
    const project = await Project.findById(id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Check if user is project creator or admin
    const isProjectCreator = project.created_by.toString() === req.user.id;
    
    if (!isProjectCreator && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    // Cannot remove the project creator
    if (project.created_by.toString() === user_id) {
      return res.status(400).json({ error: 'Cannot remove project creator' });
    }
    
    project.team_members = project.team_members.filter(
      member => member.toString() !== user_id
    );
    
    await project.save();
    res.json({ message: 'Team member removed successfully' });
  } catch (err) {
    console.error('Remove team member error:', err);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

// Delete project
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if project exists
    const project = await Project.findById(id);
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Only project creator or admin can delete
    const isProjectCreator = project.created_by.toString() === req.user.id;
    
    if (!isProjectCreator && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    await Project.findByIdAndDelete(id);
    
    // Cleanup related tasks and events
    await Promise.all([
      Task.deleteMany({ project_id: id }),
      Event.deleteMany({ project_id: id })
    ]);
    
    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    console.error('Delete project error:', err);
    res.status(500).json({ error: 'Failed to delete project' });
  }
});

module.exports = router;
