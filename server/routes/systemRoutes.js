const express = require('express');
const router = express.Router();
const fs = require('fs/promises');
const path = require('path');
const os = require('os');

// GET /api/system/drives
// Returns common mount points
router.get('/drives', async (req, res) => {
    try {
        const platform = os.platform();
        let drives = [];

        if (platform === 'darwin') {
            drives.push({ path: '/', name: 'Macintosh HD' });
            // Add external volumes
            try {
                const volumes = await fs.readdir('/Volumes');
                for (const vol of volumes) {
                    if (!vol.startsWith('.')) {
                        drives.push({ path: `/Volumes/${vol}`, name: vol });
                    }
                }
            } catch (err) {
                console.error("Could not list /Volumes", err);
            }
        } else if (platform === 'win32') {
            // Basic implementation for windows if needed later
            drives.push({ path: 'C:\\', name: 'C: Drive' });
        } else {
            drives.push({ path: '/', name: 'Root' });
        }

        res.json(drives);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/system/list
// Query: ?path=/some/path
router.get('/list', async (req, res) => {
    const listPath = req.query.path;
    if (!listPath) return res.status(400).json({ error: 'Path required' });

    try {
        const entries = await fs.readdir(listPath, { withFileTypes: true });

        // Filter: only directories, ignore hidden
        const dirs = entries
            .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
            .map(dirent => ({
                name: dirent.name,
                path: path.join(listPath, dirent.name),
                type: 'directory'
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        res.json(dirs);
    } catch (err) {
        // Return clear error if access denied, etc.
        res.status(500).json({ error: 'Could not access directory. ' + err.message });
    }
});

module.exports = router;
