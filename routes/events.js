const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { validateEvent } = require('../middleware/validation');
const Event = require('../database/models/Event');
const mongoose = require('mongoose');

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
      .populate('created_by', 'name');
    
    const formattedEvents = events.map(event => ({
      ...event.toObject(),
      id: event._id,
      project_name: event.project_id?.name,
      project_color: event.project_id?.color,
      created_by_name: event.created_by?.name
    }));
    
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
      .populate('created_by', 'name');
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    const formattedEvent = {
      ...event.toObject(),
      id: event._id,
      project_name: event.project_id?.name,
      project_color: event.project_id?.color,
      created_by_name: event.created_by?.name
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
    const { title, description, start_date, end_date, all_day, location, project_id } = req.body;
    const created_by = req.user.id;
    
    const event = await Event.create({
      title,
      description,
      start_date,
      end_date,
      all_day: all_day || false,
      location,
      project_id: project_id ? new mongoose.Types.ObjectId(project_id) : undefined,
      created_by: new mongoose.Types.ObjectId(created_by)
    });
    
    const populatedEvent = await Event.findById(event._id)
      .populate('project_id', 'name color')
      .populate('created_by', 'name');
    
    const formattedEvent = {
      ...populatedEvent.toObject(),
      id: populatedEvent._id,
      project_name: populatedEvent.project_id?.name,
      project_color: populatedEvent.project_id?.color,
      created_by_name: populatedEvent.created_by?.name
    };
    
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
    const { title, description, start_date, end_date, all_day, location, project_id } = req.body;
    
    // Check if event exists and user has permission
    const event = await Event.findById(id);
    
    if (!event) {
      return res.status(404).json({ error: 'Event not found' });
    }
    
    if (event.created_by.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Permission denied' });
    }
    
    event.title = title;
    event.description = description;
    event.start_date = start_date;
    event.end_date = end_date;
    event.all_day = all_day || false;
    event.location = location;
    event.project_id = project_id ? new mongoose.Types.ObjectId(project_id) : undefined;
    
    await event.save();
    
    const updatedEvent = await Event.findById(id)
      .populate('project_id', 'name color')
      .populate('created_by', 'name');
    
    const formattedEvent = {
      ...updatedEvent.toObject(),
      id: updatedEvent._id,
      project_name: updatedEvent.project_id?.name,
      project_color: updatedEvent.project_id?.color,
      created_by_name: updatedEvent.created_by?.name
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
