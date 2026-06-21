const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');
const { Disk, Entry } = require('../models');
const logger = require('./logger');

const scanManager = require('./ScanManager');

const countTotalItems = (dirPath, jobId) => {
    return new Promise((resolve, reject) => {
        let count = 0;
        let lastReport = 0;

        // Use spawn to stream output from 'find'
        const find = spawn('find', [dirPath]);

        find.stdout.on('data', (data) => {
            // Count newlines
            let s = data.toString();
            for (let i = 0; i < s.length; i++) {
                if (s[i] === '\n') count++;
            }

            // Report every 500 items or so to avoid spamming SSE
            if (count - lastReport > 500) {
                if (scanManager.getScan(jobId)) {
                    // Update progress with status 'counting' so UI knows
                    // We use filesProcessed field to carry the interim count
                    scanManager.updateProgress(jobId, {
                        status: 'counting',
                        filesProcessed: count,
                        currentPath: 'Calculating total...'
                    });
                }
                lastReport = count;
            }
        });

        find.stderr.on('data', (err) => {
            // ignore permission errors usually
        });

        find.on('close', (code) => {
            // Final update
            if (scanManager.getScan(jobId)) {
                scanManager.updateProgress(jobId, {
                    status: 'counting',
                    filesProcessed: count
                });
            }
            resolve(count);
        });

        find.on('error', (err) => {
            logger.warn(`Failed to count files in ${dirPath}`, { error: err.message });
            resolve(0);
        });
    });
};

async function scanDirectory(dirPath, diskId, parentId = null, jobId, throttleState = { lastReport: 0, count: 0 }) {
    try {
        const items = await fs.readdir(dirPath, { withFileTypes: true });

        // System directories to ignore
        const IGNORED_DIRS = new Set([
            '.Trashes',
            '.DocumentRevisions-V100',
            '.Spotlight-V100',
            '.fseventsd',
            '.TemporaryItems',
            '$RECYCLE.BIN',
            'System Volume Information'
        ]);

        for (const item of items) {
            if (IGNORED_DIRS.has(item.name)) {
                continue;
            }

            // Check cancellation
            const checkScan = scanManager.getScan(jobId);
            if (!checkScan || checkScan.status === 'cancelled') {
                throw new Error('Scan cancelled by user');
            }

            try {
                const fullPath = path.join(dirPath, item.name);
                let stats;
                try {
                    stats = await fs.stat(fullPath);
                } catch (statErr) {
                    if (statErr.code === 'ENOENT') {
                        // File disappeared or disk ejected
                        logger.warn(`File not found (possibly ejected): ${fullPath}`);
                        continue;
                    }
                    logger.warn(`Could not stat file: ${fullPath}`, { error: statErr.message });
                    continue;
                }

                const entry = await Entry.create({
                    disk_id: diskId,
                    parent_id: parentId,
                    name: item.name,
                    type: item.isDirectory() ? 'directory' : 'file',
                    size: stats.size,
                    path: fullPath,
                    file_created_at: stats.birthtime
                });

                // Report Progress (Throttled)
                throttleState.count++;
                const now = Date.now();
                if (now - throttleState.lastReport > 200) { // Report max every 200ms
                    const currentScan = scanManager.getScan(jobId);
                    if (currentScan) {
                        scanManager.updateProgress(jobId, {
                            filesProcessed: throttleState.count,
                            currentPath: item.name
                        });
                        throttleState.lastReport = now;
                    }
                }

                if (item.isDirectory()) {
                    await scanDirectory(fullPath, diskId, entry.id, jobId, throttleState);
                }
            } catch (innerErr) {
                if (innerErr.message === 'Scan cancelled by user') throw innerErr;
                logger.error(`Error processing item ${item.name} in ${dirPath}`, { error: innerErr.message });
            }
        }
    } catch (error) {
        if (error.message === 'Scan cancelled by user') throw error;
        logger.error(`Error scanning directory ${dirPath}`, { error: error.message });
    }
}

async function scanDisk(diskPath, diskName, serialNumber = null, jobId) {
    logger.info(`Initiating scan for disk: ${diskName} at ${diskPath} (Job: ${jobId})`);

    try {
        await fs.access(diskPath);
    } catch (e) {
        logger.error(`Disk path not accessible: ${diskPath}`);
        throw new Error('Disk path not accessible');
    }

    let disk = null;

    try {
        // Pre-scan: Count files
        logger.info(`Counting files in ${diskPath}...`);

        // Notify start of counting
        if (scanManager.getScan(jobId)) {
            scanManager.updateProgress(jobId, { status: 'counting', filesProcessed: 0, currentPath: 'Starting count...' });
        }

        // Pass jobId to allow streaming updates
        const totalItems = await countTotalItems(diskPath, jobId);
        logger.info(`Total items to scan: ${totalItems}`);

        // Update total and switch back to 'running' for the actual scan
        // We reset filesProcessed to 0 for the actual scan phase
        if (scanManager.getScan(jobId)) {
            scanManager.updateProgress(jobId, {
                status: 'running',
                totalItems: totalItems,
                filesProcessed: 0,
                currentPath: 'Starting scan...'
            });
        }

        disk = await Disk.create({
            name: diskName,
            serial_number: serialNumber || `SN-${Date.now()}`,
            total_space: 0,
            free_space: 0
        });

        logger.info(`Disk record created`, { diskId: disk.id });

        // Start recursive scan
        const throttleState = { lastReport: 0, count: 0 };
        await scanDirectory(diskPath, disk.id, null, jobId, throttleState);

        logger.info(`Scan completed successfully for disk: ${diskName}`);
        return disk;
    } catch (err) {
        if (err.message === 'Scan cancelled by user') {
            logger.info(`Scan cancelled for disk: ${diskName}`);
            if (disk) {
                await disk.destroy();
                logger.info(`Cleaned up partial disk record`);
            }
        } else {
            logger.error(`Fatal error during disk scan`, { error: err.message });
        }
        throw err;
    }
}

module.exports = {
    scanDisk
};
