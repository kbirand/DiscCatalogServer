# Google Login System Documentation

This document explicitly details how the authentication system works in this project. It is intended to be used as a reference for applying this same working method to other projects (e.g., by Gemini Pro).

## 1. Overview

The system uses **Google OAuth 2.0** for identity verification but manages its own **JWT (JSON Web Token)** for session persistence. This "Hybrid" approach allows us to trust Google for the initial login while maintaining full control over user roles, session duration, and database records on our own backend.

**Core Workflow:**
1. **Client (React)**: User clicks "Sign in with Google".
2. **Google**: Authenticates user and returns a **Google ID Token**.
3. **Client**: Sends this ID Token to our Backend API.
4. **Backend (Node/Express)**: 
   - Verifies the ID Token with Google.
   - Upserts the user in the local MySQL database.
   - Generates a custom **Session JWT** (signed with our secret).
   - Returns the User object + Session JWT.
5. **Client**: Stores the Session JWT and attaches it to all future API requests.

---

## 2. Dependencies

### Frontend (`package.json`)
- `@react-oauth/google`: React components for the Google Sign-In button and hooks.
- `jwt-decode`: (Optional) Useful for decoding tokens on the client side if needed.
- `axios`: Used for HTTP requests and interceptors.

### Backend (`package.json`)
- `google-auth-library`: Official Node.js client to verify Google ID Tokens.
- `jsonwebtoken`: To sign and verify our own session tokens.
- `express`: Web server.

---

## 3. Configuration & Environment Variables

### .env (Frontend & Backend)
| Variable | Description | Location |
|----------|-------------|----------|
| `VITE_GOOGLE_CLIENT_ID` | The OAuth 2.0 Client ID obtained from Google Cloud Console. | Frontend (`.env`, `.env.local`) |
| `JWT_SECRET` | A strong secret string used to sign the session tokens. **Must be kept secret.** | Backend (`.env`) |

**Google Cloud Console Setup:**
1. Create a Project.
2. Go to **APIs & Services > Credentials**.
3. Create **OAuth 2.0 Client ID** (Web application).
4. **Authorized JavaScript origins**: `http://localhost:5173`, `https://your-domain.com`.
5. **Authorized redirect URIs**: (Not strictly needed for the popup flow, but good practice to match origins).

---

## 4. Implementation Details

### A. Frontend Implementation

#### 1. Setup Provider (`main.tsx` or `index.tsx`)
Wrap your application in `GoogleOAuthProvider`:
```tsx
import { GoogleOAuthProvider } from '@react-oauth/google';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <GoogleOAuthProvider clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID}>
    <App />
  </GoogleOAuthProvider>
);
```

#### 2. Login Component (`src/components/LoginScreen.tsx`)
Use the `<GoogleLogin />` component to handle the popup flow.
```tsx
import { GoogleLogin } from '@react-oauth/google';

// ... inside component
<GoogleLogin
  onSuccess={async (credentialResponse) => {
    // credentialResponse.credential contains the Google ID Token
    handleLoginSuccess(credentialResponse.credential);
  }}
  onError={() => {
    console.log('Login Failed');
  }}
/>
```

#### 3. Authentication Service (`src/services/authService.ts`)
Handles the exchange of the Google Token for your Backend Token.
```typescript
import api from './api';

export const loginWithGoogle = async (credential: string) => {
  // Post the Google ID Token to your backend
  const response = await api.post('/auth/google', { credential });
  
  const { user, token } = response.data;

  // Store YOUR backend token, not the Google token
  localStorage.setItem('google_id_token', token); 
  localStorage.setItem('user_data', JSON.stringify(user));

  return user;
};
```

#### 4. API Interceptor (`src/services/api.ts`)
Automatically attaches the token to every request.
```typescript
import axios from 'axios';

const api = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('google_id_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle Token Expiry
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('google_id_token');
      window.location.reload(); // Force re-login
    }
    return Promise.reject(error);
  }
);
```

---

### B. Backend Implementation (`server/index.js`)

#### 1. Auth Route (`POST /api/auth/google`)
```javascript
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';

const client = new OAuth2Client(process.env.VITE_GOOGLE_CLIENT_ID);

app.post('/api/auth/google', async (req, res) => {
  const { credential } = req.body; // The Google ID Token

  try {
    // 1. Verify Google Token
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.VITE_GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;

    // 2. Find or Create User in DB
    // (Pseudocode for DB operation)
    let user = await db.findUserByGoogleId(googleId);
    if (!user) {
      user = await db.createUser({ googleId, email, role: 'user' });
    }

    // 3. Create Session JWT
    // This is the token the frontend will actually use
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email, 
        role: user.role 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' } // Long-lived session
    );

    res.json({ user, token });

  } catch (error) {
    res.status(400).json({ error: 'Authentication failed' });
  }
});
```

#### 2. Auth Middleware (`verifyToken`)
Protects your API routes.
```javascript
const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).send('No token');

  const token = authHeader.split(' ')[1]; // Bearer <token>

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // Attach user info to request
    next();
  } catch (err) {
    return res.status(401).send('Invalid Token');
  }
};

// Usage
app.get('/api/protected-route', verifyToken, (req, res) => {
  res.send(`Hello user ${req.user.email}`);
});
```

---

## 5. Database Schema (MySQL)

A simple `users` table is sufficient to link the Google ID to your local user data.

```sql
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    google_id VARCHAR(255) NOT NULL UNIQUE, -- The stable ID from Google
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    avatar_url TEXT,
    role ENUM('user', 'admin') DEFAULT 'user',
    status ENUM('pending', 'approved', 'banned') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_login TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

## 6. Security Considerations

1.  **Verify on Backend**: Never Instagram just the frontend saying "I'm logged in". Always send the ID token to the backend for verification.
2.  **JWT Secret**: Keep `JWT_SECRET` safe and unique per environment.
3.  **HTTPS**: Always use HTTPS in production to protect the transmission of tokens.
4.  **Token Storage**: `localStorage` is vulnerable to XSS. For critical applications, consider `httpOnly` cookies, though `localStorage` is often acceptable for non-banking apps if XSS is mitigated. (This project uses `localStorage` for simplicity).
