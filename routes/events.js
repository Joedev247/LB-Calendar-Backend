const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { validateEvent } = require('../middleware/validation');
const Event = require('../database/models/Event');
const mongoose = require('mongoose');
const User = require('../database/models/User');
const Project = require('../database/models/Project');
const { createNotificationsForUsers } = require('../utils/notifications');

const router = express.Router();

// Get all events
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { start_date, end_date, project_id } = req.query;
    
    const query = {};
    
    if (start_date) {
      query.start_date = { $gte: new Date(start_date) };
    }
    
    if (end_date) {
      query.end_date = { $lte: new Date(end_date) };
    }
    
    if (project_id) {
      query.project_id = new mongoose.Types.ObjectId(project_id);
    }
    
    const events = await Event.find(query)
      .sort({ start_date: 1 })
      .populate('project_id', 'name color')
      .populate('created_by', 'name email')
      .populate('hosts.user_id', 'name email');
    
    const formattedEvents = events.map(event => {
      const formattedHosts = event.hosts.map(host => {
        if (host.user_id && host.user_id._id) {
          // User host
          return {
            id: host.user_id._id,
            user_id: host.user_id._id,
            name: host.user_id.name,
            email: host.user_id.email,
            role: host.role || 'Host',
            is_external: false
          };
        } else {
          // External host
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
    
    res.json(formattedEvents);
  } catch (err) {
    console.error('Get events error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get event by ID
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const event = await Event.findById(id)
      .populate('project_id', 'name color')
      .populate('created_by', 'name email')
      .populate('hosts.user_id', 'name email');
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }

    const formattedHosts = event.hosts.map(host => {
      if (host.user_id && host.user_id._id) {
        // User host
        return {
          id: host.user_id._id,
          user_id: host.user_id._id,
          name: host.user_id.name,
          email: host.user_id.email,
          role: host.role || 'Host',
          is_external: false
        };
      } else {
        // External host
        return {
          id: host._id,
          name: host.name,
          email: host.email,
          role: host.role || 'Host',
          is_external: true
        };
      }
    });
    
    const formattedEvent = {
      ...event.toObject(),
      id: event._id,
      project_name: event.project_id?.name,
      project_color: event.project_id?.color,
      created_by_name: event.created_by?.name,
      created_by_email: event.created_by?.email,
      hosts: formattedHosts
    };
    
    res.json(formattedEvent);
  } catch (err) {
    console.error('Get event error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new event
router.post('/', authenticateToken, validateEvent, async (req, res) => {
  try {
    const { title, description, start_date, end_date, all_day, location, is_online, online_platform, project_id, hosts } = req.body;
    const created_by = req.user.id;

    // Format hosts array
    const formattedHosts = [];
    if (hosts && Array.isArray(hosts)) {
      hosts.forEach(host => {
        if (host.user_id) {
          // User host
          formattedHosts.push({
            user_id: new mongoose.Types.ObjectId(host.user_id),
            role: host.role || 'Host',
            is_external: false
          });
        } else if (host.name && host.email) {
          // External host
          formattedHosts.push({
            name: host.name,
            email: host.email,
            role: host.role || 'Host',
            is_external: true
          });
        }
      });
    }
    
    const event = await Event.create({
      title,
      description,
      start_date,
      end_date,
      all_day: all_day || false,
      location: is_online ? undefined : location,
      is_online: is_online || false,
      online_platform: is_online ? online_platform : undefined,
      project_id: project_id ? new mongoose.Types.ObjectId(project_id) : undefined,
      created_by: new mongoose.Types.ObjectId(created_by),
      hosts: formattedHosts
    });
    
    const populatedEvent = await Event.findById(event._id)
      .populate('project_id', 'name color')
      .populate('created_by', 'name email')
      .populate('hosts.user_id', 'name email');

    const formattedHostsResponse = populatedEvent.hosts.map(host => {
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
    
    const formattedEvent = {
      ...populatedEvent.toObject(),
      id: populatedEvent._id,
      project_name: populatedEvent.project_id?.name,
      project_color: populatedEvent.project_id?.color,
      created_by_name: populatedEvent.created_by?.name,
      created_by_email: populatedEvent.created_by?.email,
      hosts: formattedHostsResponse
    };

    // Notify all users about the new event (excluding creator)
    try {
      const allUsers = await User.find({}).select('_id');
      const creatorId = created_by.toString();
      const userIdsToNotify = allUsers
        .map(u => u._id.toString())
        .filter(id => id !== creatorId);
      
      if (userIdsToNotify.length > 0) {
        const creator = await User.findById(created_by);
        const projectName = project_id ? (await Project.findById(project_id))?.name : null;
        const eventTitle = title;
        const eventDate = new Date(start_date).toLocaleDateString();
        
        const titleText = projectName 
          ? `New event in ${projectName}`
          : 'New event created';
        const messageText = projectName
          ? `${creator?.name || 'Someone'} created event "${eventTitle}" in ${projectName} on ${eventDate}`
          : `${creator?.name || 'Someone'} created event "${eventTitle}" on ${eventDate}`;
        
        console.log(`Creating event notifications for ${userIdsToNotify.length} users`);
        const result = await createNotificationsForUsers(
          userIdsToNotify,
          titleText,
          messageText,
          'info',
          `/events/${event._id}`
        );
        console.log(`Event notifications created:`, result?.length || 0);
      }
    } catch (notifErr) {
      console.error('Error creating event notifications:', notifErr);
      // Don't fail event creation if notifications fail
    }
    
    res.status(201).json(formattedEvent);
  } catch (err) {
    console.error('Create event error:', err);
    res.status(500).json({ error: 'Failed to create event' });
  }
});

// Update event
router.put('/:id', authenticateToken, validateEvent, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, start_date, end_date, all_day, location, is_online, online_platform, project_id, hosts } = req.body;
    
    // Check if event exists and user has permission
    const event = await Event.findById(id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    if (event.created_by.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }

    // Format hosts array
    const formattedHosts = [];
    if (hosts && Array.isArray(hosts)) {
      hosts.forEach(host => {
        if (host.user_id) {
          // User host
          formattedHosts.push({
            user_id: new mongoose.Types.ObjectId(host.user_id),
            role: host.role || 'Host',
            is_external: false
          });
        } else if (host.name && host.email) {
          // External host
          formattedHosts.push({
            name: host.name,
            email: host.email,
            role: host.role || 'Host',
            is_external: true
          });
        }
      });
    }
    
    event.title = title;
    event.description = description;
    event.start_date = start_date;
    event.end_date = end_date;
    event.all_day = all_day || false;
    event.location = is_online ? undefined : location;
    event.is_online = is_online || false;
    event.online_platform = is_online ? online_platform : undefined;
    event.project_id = project_id ? new mongoose.Types.ObjectId(project_id) : undefined;
    event.hosts = formattedHosts;
    
    await event.save();
    
    const updatedEvent = await Event.findById(id)
      .populate('project_id', 'name color')
      .populate('created_by', 'name email')
      .populate('hosts.user_id', 'name email');

    const formattedHostsResponse = updatedEvent.hosts.map(host => {
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
    
    const formattedEvent = {
      ...updatedEvent.toObject(),
      id: updatedEvent._id,
      project_name: updatedEvent.project_id?.name,
      project_color: updatedEvent.project_id?.color,
      created_by_name: updatedEvent.created_by?.name,
      created_by_email: updatedEvent.created_by?.email,
      hosts: formattedHostsResponse
    };
    
    res.json(formattedEvent);
  } catch (err) {
    console.error('Update event error:', err);
    res.status(500).json({ error: 'Failed to update event' });
  }
});

// Delete event
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if event exists and user has permission
    const event = await Event.findById(id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    if (event.created_by.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    await Event.findByIdAndDelete(id);
    res.json({ message: 'Event deleted successfully' });
  } catch (err) {
    console.error('Delete event error:', err);
    res.status(500).json({ error: 'Failed to delete event' });
  }
});

module.exports = router;
