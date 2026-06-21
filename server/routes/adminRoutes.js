const express = require('express');
const router = express.Router();
const { User } = require('../models');
const { verifyToken, isAdmin } = require('../middleware/auth');
const logger = require('../utils/logger');

// Protect all admin routes
router.use(verifyToken, isAdmin);

// GET /api/admin/users - List all users
router.get('/users', async (req, res) => {
    try {
        const users = await User.findAll({
            attributes: ['id', 'email', 'full_name', 'role', 'status', 'avatar_url', 'last_login', 'show_in_gallery', 'created_at'],
            order: [['created_at', 'DESC']]
        });

        // Transform for frontend
        const safeUsers = users.map(u => ({
            id: u.id,
            name: u.full_name,
            email: u.email,
            role: u.role,
            status: u.status,
            avatar: u.avatar_url,
            lastLogin: u.last_login,
            show_in_gallery: u.show_in_gallery,
            itemsCount: 0 // Placeholder until we link items to users
        }));

        res.json(safeUsers);
    } catch (err) {
        logger.error('Admin Fetch Users Error', { error: err.message });
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// PUT /api/admin/users/:id/role - Update Role
router.put('/users/:id/role', async (req, res) => {
    try {
        const { role } = req.body;
        if (!['user', 'admin'].includes(role)) {
            return res.status(400).json({ error: 'Invalid role' });
        }

        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        // Prevent self-demotion if you are the only admin (optional safety, skipping for now)
        if (user.id === req.user.userId && role !== 'admin') {
            // mild warning logic can go here
        }

        user.role = role;
        await user.save();

        logger.info(`Admin ${req.user.userId} updated role of user ${user.id} to ${role}`);
        res.json({ message: 'Role updated', user });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// PUT /api/admin/users/:id/status - Update Status (Approve/Ban)
router.put('/users/:id/status', async (req, res) => {
    try {
        const { status } = req.body;
        if (!['pending', 'approved', 'banned'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.status = status;
        await user.save();

        logger.info(`Admin ${req.user.userId} updated status of user ${user.id} to ${status}`);
        res.json({ message: 'Status updated', user });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// PUT /api/admin/users/:id/gallery - Toggle Show in Gallery
router.put('/users/:id/gallery', async (req, res) => {
    try {
        const { show_in_gallery } = req.body;
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        user.show_in_gallery = show_in_gallery;
        await user.save();

        res.json({ message: 'Gallery setting updated', user });
    } catch (err) {
        res.status(500).json({ error: 'Update failed' });
    }
});

// DELETE /api/admin/users/:id - Delete User
router.delete('/users/:id', async (req, res) => {
    try {
        if (parseInt(req.params.id) === req.user.userId) {
            return res.status(400).json({ error: 'You cannot delete your own account' });
        }

        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });

        await user.destroy();
        logger.info(`Admin ${req.user.userId} deleted user ${req.params.id}`);

        res.json({ message: 'User deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed' });
    }
});

module.exports = router;
