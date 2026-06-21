const express = require('express');
const router = express.Router();
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const { User } = require('../models');

// Initialize Google Client
// NOTE: We don't strictly need the client ID here for `verifyIdToken` if we pass audience, 
// but it's good practice. It will fail if env var is missing, so ensure .env is set.
const client = new OAuth2Client(process.env.VITE_GOOGLE_CLIENT_ID);
// Note: Backend doesn't usually read VITE_ vars unless configured. 
// We should probably duplicated it as `GOOGLE_CLIENT_ID` or just use the VITE one if loaded.
// Since dotenv loads everything, VITE_GOOGLE_CLIENT_ID will be available in process.env.

// POST /api/auth/google
router.post('/google', async (req, res) => {
    console.log('[AUTH] Entering /google endpoint');
    const { credential } = req.body; // The ID Token from frontend

    if (!credential) {
        return res.status(400).json({ error: 'Google credential is required' });
    }

    try {
        // 1. Verify Google Token
        const ticket = await client.verifyIdToken({
            idToken: credential,
            // If the frontend used a specific client ID, we should verify it matches.
            // audience: process.env.VITE_GOOGLE_CLIENT_ID, 
        });

        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        // 2. Find or Create User
        // Upsert logic
        let user = await User.findOne({ where: { google_id: googleId } });

        if (!user) {
            // Check if email already exists (legacy account?)
            // If not, create new
            user = await User.create({
                google_id: googleId,
                email: email,
                full_name: name,
                avatar_url: picture,
                role: 'user', // Default role
                status: 'pending' // Default status
            });
        } else {
            // Update latest info
            user.full_name = name;
            user.avatar_url = picture;
            user.last_login = new Date();
            await user.save();
        }

        // 3. Generate Session JWT
        const token = jwt.sign(
            {
                userId: user.id,
                email: user.email,
                role: user.role
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' } // 7 days session
        );

        // 4. Return Data
        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.full_name,
                avatar: user.avatar_url,
                role: user.role,
                status: user.status
            },
            token
        });

    } catch (err) {
        console.error('Auth Error:', err);
        res.status(400).json({ error: 'Authentication failed: ' + err.message });
    }
});

// GET /api/auth/me (Verify session on page load)
router.get('/me', async (req, res) => {
    console.log('[AUTH] Entering /me endpoint');
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'No token' });

    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findByPk(decoded.userId);

        if (!user) return res.status(404).json({ error: 'User not found' });

        res.json({
            user: {
                id: user.id,
                email: user.email,
                name: user.full_name,
                avatar: user.avatar_url,
                role: user.role,
                status: user.status
            }
        });
    } catch (err) {
        res.status(401).json({ error: 'Invalid token' });
    }
});

module.exports = router;
