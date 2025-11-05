# Frontend OAuth Implementation Prompt for Cursor

Copy and paste this entire prompt to Cursor to implement the Looping Binary OAuth login on your frontend:

---

## Implement "Sign in with Looping Binary" OAuth Integration

I need to implement OAuth login with Looping Binary on my frontend. The backend is already set up with the following endpoints:

### Backend API Endpoints Available:
1. **GET `/api/auth/oauth/authorize`** - Returns `{ authUrl: string }` with the authorization URL
2. **GET `/api/auth/oauth/callback`** - Backend handles the OAuth callback and redirects to frontend
3. After successful OAuth, backend redirects to: `{FRONTEND_URL}/auth/callback?token=JWT_TOKEN&email=user@example.com`

### OAuth Flow:
1. User clicks "Sign in with Looping Binary" button
2. Frontend calls `/api/auth/oauth/authorize` to get the authorization URL
3. User is redirected to Looping Binary's authorization page
4. After authorization, backend processes the callback and redirects back to frontend
5. Frontend receives the JWT token in the callback URL query params
6. Frontend stores the token and redirects user to the main app

### Requirements:

1. **Create an OAuth Login Button Component:**
   - Add a "Sign in with Looping Binary" button to your login page
   - Include the Looping Binary logo/icon (SVG provided below)
   - Style it to match your design system
   - On click, fetch the auth URL from `/api/auth/oauth/authorize` and redirect

2. **Create OAuth Callback Handler:**
   - Create a route/component at `/auth/callback` (or handle it in your routing)
   - Extract the `token` and `email` from URL query parameters
   - Store the token (localStorage, sessionStorage, or your auth context/state)
   - Handle any errors (check for error query param)
   - Redirect user to the main dashboard/app after successful login

3. **Update Authentication Context/State:**
   - Store the JWT token from OAuth callback
   - Include the token in API requests (Bearer token in Authorization header)
   - Handle token expiration/logout

4. **Error Handling:**
   - Handle cases where OAuth authorization is denied
   - Handle network errors when fetching auth URL
   - Display user-friendly error messages

### Looping Binary OAuth Button SVG Icon:
```svg
<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="currentColor"/>
  <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2"/>
  <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2"/>
</svg>
```

### Example Implementation Structure:

```javascript
// OAuth Login Button Component
const handleLoopingBinaryLogin = async () => {
  try {
    const response = await fetch('http://localhost:5000/api/auth/oauth/authorize');
    const { authUrl } = await response.json();
    window.location.href = authUrl;
  } catch (error) {
    console.error('OAuth login failed:', error);
    // Show error to user
  }
};

// OAuth Callback Handler (in your routing or callback component)
const handleOAuthCallback = () => {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const email = urlParams.get('email');
  const error = urlParams.get('error');

  if (error) {
    // Handle OAuth error
    return;
  }

  if (token) {
    // Store token in your auth system
    localStorage.setItem('authToken', token);
    // Update auth context/state
    // Redirect to dashboard
    window.location.href = '/dashboard';
  }
};
```

### Additional Notes:
- The backend API base URL should be configurable (environment variable)
- Use the same token storage mechanism as your existing login system
- The OAuth button should be placed alongside your regular login/register options
- Make sure CORS is properly configured if your frontend is on a different domain

Please implement this OAuth integration following the existing patterns in my codebase. If you're using React, integrate it with my existing auth context/provider. If using Next.js, create appropriate pages/routes. Adapt to my current tech stack (React, Vue, Angular, etc.).

---


