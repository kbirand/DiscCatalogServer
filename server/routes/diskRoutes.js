const express = require('express');
const router = express.Router();
const { Disk, Entry } = require('../models');
const { scanDisk } = require('../utils/scanner');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const importHelper = require('../utils/importHelper'); // Restore Import Helper

// GET all disks
// GET all disks
router.get('/', async (req, res) => {
    try {
        const disks = await Disk.findAll({
            order: [['order', 'ASC'], ['name', 'ASC']]
        });
        res.json(disks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT reorder disks
router.put('/reorder', async (req, res) => {
    const { diskIds } = req.body;
    if (!diskIds || !Array.isArray(diskIds)) {
        return res.status(400).json({ error: 'diskIds array is required' });
    }

    try {
        const updates = diskIds.map((id, index) => {
            return Disk.update({ order: index }, { where: { id } });
        });

        await Promise.all(updates);
        res.json({ message: 'Disks reordered successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const scanManager = require('../utils/ScanManager');

// POST scan a new disk (Async)
router.post('/scan', async (req, res) => {
    const { path: diskPath, name } = req.body;

    if (!diskPath || !name) {
        return res.status(400).json({ error: 'Path and Name are required' });
    }

    const jobId = `${Date.now()} -${Math.random().toString(36).substr(2, 9)} `;

    // Start scan in background
    scanManager.startScan(jobId, { diskName: name, path: diskPath });

    scanDisk(diskPath, name, null, jobId)
        .then(disk => {
            scanManager.completeScan(jobId, disk);
        })
        .catch(err => {
            scanManager.failScan(jobId, err.message);
        });

    res.json({ message: 'Scan initiated', jobId });
});

// --- EXTERNAL SCANNER ENDPOINTS (Restored) ---

// 1. Start Session
router.post('/scan/start', async (req, res) => {
    try {
        const { name, serial, total_space, diskId } = req.body;
        // Pass diskId (Client ID) to helper to establish mapping
        const disk = await importHelper.startImportSession(name, serial, total_space, diskId);
        res.json({ jobId: diskId || disk.id, message: 'Session started' });
    } catch (err) {
        console.error('Start Session Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 2. Upload Batch
router.post('/scan/batch', async (req, res) => {
    try {
        // Detect payload type
        const { items, dirBatch, files } = req.body;

        // Fallback for ID key
        const jobId = req.body.jobId || req.body.diskId || req.body.id;

        if (!jobId) {
            return res.status(400).json({ error: "Missing jobId or diskId" });
        }

        if (dirBatch) {
            // Explicit 'dirBatch' wrapper
            await importHelper.processDirBatch(jobId, dirBatch);
        } else if (files && Array.isArray(files)) {
            // Flat object with 'files' property (Current Desktop Client behavior)
            await importHelper.processDirBatch(jobId, req.body);
        } else {
            // Legacy 'items' array
            await importHelper.processBatch(jobId, items || []);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Batch Error:', err.message);
        if (err.message.includes('Session not found')) {
            return res.status(404).json({ error: 'Session expired or not found. Please restart scan.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// 3. End Session
router.post('/scan/end', async (req, res) => {
    try {
        const jobId = req.body.jobId || req.body.diskId || req.body.id;
        if (jobId) await importHelper.endImportSession(jobId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Cancel Session (External)
router.post('/scan/cancel', async (req, res) => {
    try {
        const jobId = req.body.jobId || req.body.diskId || req.body.id;
        if (jobId) await importHelper.endImportSession(jobId); // equivalent to end for clean up
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST cancel scan
router.post('/scan/:jobId/cancel', (req, res) => {
    const { jobId } = req.params;
    scanManager.cancelScan(jobId);
    res.json({ message: 'Scan cancellation requested' });
});

// GET scan progress (SSE)
router.get('/scan/progress/:jobId', (req, res) => {
    const { jobId } = req.params;

    // SSE Headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)} \n\n`);
    };

    // Send current status immediately
    const current = scanManager.getScan(jobId);
    if (current) {
        sendEvent(current);
        if (current.status === 'completed' || current.status === 'failed') {
            res.end();
            return;
        }
    } else {
        sendEvent({ status: 'not_found' });
        res.end();
        return;
    }

    // Listen for updates
    const onProgress = (data) => {
        if (data.id === jobId) sendEvent(data);
    };

    const onComplete = (data) => {
        if (data.id === jobId) {
            sendEvent({ ...data, status: 'completed' });
            res.end();
        }
    };

    const onError = (data) => {
        if (data.id === jobId) {
            sendEvent({ ...data, status: 'failed' });
            res.end();
        }
    };

    scanManager.on('progress', onProgress);
    scanManager.on('complete', onComplete);
    scanManager.on('error', onError);

    // Cleanup on close
    req.on('close', () => {
        scanManager.off('progress', onProgress);
        scanManager.off('complete', onComplete);
        scanManager.off('error', onError);
    });
});

// GET entries (browse)
// Query params: disk_id, parent_id
router.get('/entries', async (req, res) => {
    const { disk_id, parent_id } = req.query;

    if (!disk_id) {
        return res.status(400).json({ error: 'disk_id is required' });
    }

    const whereClause = {
        disk_id,
        parent_id: parent_id || null
    };

    try {
        const entries = await Entry.findAll({
            where: whereClause,
            order: [['type', 'ASC'], ['name', 'ASC']] // Directories first
        });
        res.json(entries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST search with boolean logic
router.post('/search', async (req, res) => {
    const { conditions, logic = 'AND', type } = req.body;
    // conditions: arr of { field, operator, value }
    // logic: 'AND' | 'OR'
    // type: 'directory' | 'file' | 'all'

    if (!conditions || !Array.isArray(conditions)) {
        return res.status(400).json({ error: 'Invalid search conditions' });
    }

    const whereClause = {};
    const op = logic === 'OR' ? Op.or : Op.and;

    const mappedConditions = conditions.map(cond => {
        let { field, operator, value } = cond;
        let sequelizeOp;

        switch (operator) {
            case 'contains':
            case 'like':
                sequelizeOp = Op.like;
                value = `%${value}%`;
                break;
            case 'eq':
                sequelizeOp = Op.eq;
                break;
            case 'gt':
                sequelizeOp = Op.gt;
                break;
            case 'lt':
                sequelizeOp = Op.lt;
                break;
            case 'gte':
                sequelizeOp = Op.gte;
                break;
            case 'lte':
                sequelizeOp = Op.lte;
                break;
            default:
                sequelizeOp = Op.eq;
        }

        return { [field]: { [sequelizeOp]: value } };
    });

    whereClause[op] = mappedConditions;

    // Apply Type Filter
    if (type && type !== 'all') {
        whereClause.type = type;
    }

    try {
        const results = await Entry.findAll({
            where: whereClause,
            include: [{ model: Disk, attributes: ['name'] }],
            limit: 10000 // Safety Cap (prevent browser crash)
        });
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT rename disk
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!name) return res.status(400).json({ error: 'Name is required' });

    try {
        const disk = await Disk.findByPk(id);
        if (!disk) return res.status(404).json({ error: 'Disk not found' });

        disk.name = name;
        await disk.save();

        res.json(disk);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET lineage (breadcrumb path) for an entry
router.get('/lineage/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const lineage = [];
        let current = await Entry.findByPk(id);

        while (current) {
            lineage.unshift(current);
            if (current.parent_id) {
                current = await Entry.findByPk(current.parent_id);
            } else {
                current = null;
            }
        }

        res.json(lineage);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE disk
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const t = await sequelize.transaction();

    try {
        const disk = await Disk.findByPk(id);
        if (!disk) {
            await t.rollback();
            return res.status(404).json({ error: 'Disk not found' });
        }

        // Disable FK checks to avoid "max depth 15" recursion error on deep trees
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 0', { transaction: t });

        // Delete all entries for this disk
        // Since FK checks are off, we must manually delete entries first
        await Entry.destroy({ where: { disk_id: id }, transaction: t });

        // Delete the disk
        await disk.destroy({ transaction: t });

        // Re-enable FK checks
        await sequelize.query('SET FOREIGN_KEY_CHECKS = 1', { transaction: t });

        await t.commit();
        res.json({ message: 'Disk deleted' });
    } catch (err) {
        await t.rollback();
        // Attempt to re-enable checks if transaction failed in a weird state
        try { await sequelize.query('SET FOREIGN_KEY_CHECKS = 1'); } catch (e) { }
        console.error("Delete failed:", err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
