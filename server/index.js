const express = require('express');
const cors = require('cors');
const sequelize = require('./config/database');
const { Disk, Entry } = require('./models');
const logger = require('./utils/logger');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '150mb' }));

// Request logging middleware
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.url}`);
    next();
});

// Routes
const diskRoutes = require('./routes/diskRoutes');
const systemRoutes = require('./routes/systemRoutes');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
app.use('/api/disks', diskRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

const path = require('path');

// Serve static files from the React app
app.use(express.static(path.join(__dirname, '../client/dist')));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

// Database Sync & Server Start
const startServer = async () => {
    // Bind the port first so a slow/unreachable DB at boot can't leave the
    // process running without a listening socket.
    app.listen(PORT, () => {
        logger.info(`Server running on port ${PORT}`);
    });

    try {
        await sequelize.authenticate();
        logger.info('Database connected successfully');
        // await sequelize.sync({ alter: true }); // TEMPORARILY DISABLED due to hang
        logger.info('Skipping sync for debug');
    } catch (err) {
        logger.error('Unable to connect to the database', { error: err.message });
    }
};

startServer();
