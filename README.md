# LB Calendar Backend API

A comprehensive backend API for the LB Calendar application built with Node.js, Express, and SQLite.

## Features

- **Authentication & Authorization**: JWT-based authentication with role-based access control
- **Calendar Management**: Full CRUD operations for events with project association
- **Task Management**: Task creation, assignment, and completion tracking
- **Project Management**: Project creation, team member management, and collaboration
- **Team Chat**: Real-time messaging within project contexts
- **User Management**: User profiles, notifications, and role management
- **Database**: SQLite database with comprehensive schema

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user info

### Events
- `GET /api/events` - Get all events (with filters)
- `GET /api/events/:id` - Get event by ID
- `POST /api/events` - Create new event
- `PUT /api/events/:id` - Update event
- `DELETE /api/events/:id` - Delete event

### Tasks
- `GET /api/tasks` - Get all tasks (with filters)
- `GET /api/tasks/:id` - Get task by ID
- `POST /api/tasks` - Create new task
- `PUT /api/tasks/:id` - Update task
- `PATCH /api/tasks/:id/toggle` - Toggle task completion
- `DELETE /api/tasks/:id` - Delete task

### Projects
- `GET /api/projects` - Get all projects
- `GET /api/projects/:id` - Get project by ID
- `GET /api/projects/:id/members` - Get project members
- `POST /api/projects` - Create new project
- `PUT /api/projects/:id` - Update project
- `POST /api/projects/:id/members` - Add team member
- `DELETE /api/projects/:id/members/:user_id` - Remove team member
- `DELETE /api/projects/:id` - Delete project (admin only)

### Users
- `GET /api/users` - Get all users (admin only)
- `GET /api/users/:id` - Get user by ID
- `GET /api/users/:id/notifications` - Get user notifications
- `PATCH /api/users/:id/notifications/:notification_id` - Mark notification as read
- `GET /api/users/:id/projects` - Get user's projects
- `GET /api/users/:id/tasks` - Get user's tasks
- `PUT /api/users/:id` - Update user profile
- `DELETE /api/users/:id` - Delete user (admin only)

### Chat
- `GET /api/chat/:project_id` - Get project chat messages
- `POST /api/chat/:project_id` - Send chat message
- `DELETE /api/chat/:project_id/:message_id` - Delete chat message

## Installation

1. Install dependencies:
```bash
npm install
```

2. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

3. Initialize the database:
```bash
node database/init.js
```

4. Start the server:
```bash
# Development
npm run dev

# Production
npm start
```

## Database Schema

The application uses SQLite with the following main tables:
- `users` - User accounts and profiles
- `projects` - Project information and settings
- `events` - Calendar events
- `tasks` - Task management
- `team_members` - Project team membership
- `notifications` - User notifications
- `chat_messages` - Project chat messages

## Authentication

The API uses JWT tokens for authentication. Include the token in the Authorization header:
```
Authorization: Bearer <your_jwt_token>
```

## Sample Data

The database initialization includes sample data:
- 3 users (admin, john, jane)
- 3 projects (Asia Project, Team Collaboration, Research & Development)
- Sample events, tasks, and chat messages

Default login credentials:
- Email: `admin@lbcalendar.com`, Password: `password123`
- Email: `john@lbcalendar.com`, Password: `password123`
- Email: `jane@lbcalendar.com`, Password: `password123`

## Environment Variables

- `PORT` - Server port (default: 5000)
- `JWT_SECRET` - JWT signing secret
- `NODE_ENV` - Environment (development/production)
- `DATABASE_PATH` - SQLite database file path

## Error Handling

The API returns consistent error responses:
```json
{
  "error": "Error message",
  "details": "Additional details (development only)"
}
```

## Security Features

- Helmet.js for security headers
- CORS configuration
- Input validation with express-validator
- Password hashing with bcrypt
- JWT token authentication
- Role-based access control
