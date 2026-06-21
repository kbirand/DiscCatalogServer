const express = require('express');
const cors = require('cors');
const { startImportSession, processBatch, processDirBatch, endImportSession } = require('./utils/debug_importHelper');

const app = express();
const PORT = 3001;

app.use(express.json({ limit: '50mb' })); // Smaller limit needed per batch
app.use(cors());

// SECURITY: API Key Middleware
const checkScannerKey = (req, res, next) => {
    // Alow CORS Preflight
    if (req.method === 'OPTIONS') return next();

    const key = req.headers['x-api-key'];
    // In production, use process.env.SCANNER_SECRET_KEY
    // Fallback for debug if .env not loaded or empty
    const VALID_KEY = process.env.SCANNER_SECRET_KEY || 'change_me_scanner_key';

    if (key !== VALID_KEY) {
        return res.status(403).json({ error: "Access Denied: Invalid Scanner Key" });
    }
    next();
};

// Apply Security
app.use('/api/debug', checkScannerKey);

// 1. Start Session
app.post('/api/debug/start', async (req, res) => {
    try {
        const { name, total_space } = req.body;
        const disk = await startImportSession(name, null, total_space);
        res.json({ success: true, diskId: disk.id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

// 2. Process Batch
app.post('/api/debug/batch', async (req, res) => {
    try {
        const { diskId, items, dirPath, files } = req.body;

        // Dispatch to Tree Mode if 'files' is present
        if (files) {
            await processDirBatch(diskId, { dirPath, files });
        } else if (items) {
            await processBatch(diskId, items);
        } else {
            throw new Error("Invalid Batch Payload: missing 'items' or 'files'");
        }

        res.json({ success: true });
    } catch (error) {
        console.error("Batch Error:", error.message); // Clean logging
        res.status(500).json({ error: error.message });
    }
});

// 3. End Session
app.post('/api/debug/end', async (req, res) => {
    try {
        const { diskId } = req.body;
        endImportSession(diskId);
        res.json({ success: true });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`\n---------------------------------------------------`);
    console.log(` DEBUG SERVER (BATCH MODE) STARTED`);
    console.log(` URL: http://localhost:${PORT}`);
    console.log(`---------------------------------------------------\n`);
});
