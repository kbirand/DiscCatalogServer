const { Disk, Entry } = require('../models');
const sequelize = require('../config/database');

// In-memory cache for active import sessions
const activeSessions = new Map();

async function startImportSession(name, serial, total_space, clientDiskId) {
    // Try to find existing disk by name first
    let disk = await Disk.findOne({ where: { name: name } });

    if (disk) {
        // Update existing disk
        await disk.update({
            scanned_at: new Date(),
            // Only update serial/space if provided and different? 
            // For now, trust the scan.
            serial_number: serial || disk.serial_number,
            total_space: total_space || disk.total_space
        });
        console.log(`[DEBUG] Found Existing Disk: ${disk.id} for name "${name}"`);
    } else {
        // Create new disk
        disk = await Disk.create({
            name: name,
            serial_number: serial || `DEBUG-BATCH-${Date.now()}`,
            total_space: total_space || 0,
            free_space: 0,
            scanned_at: new Date()
        });
        console.log(`[DEBUG] Created New Disk: ${disk.id} for name "${name}"`);
    }

    // MAP Client ID to Real DB ID
    // If clientDiskId is provided, use it as the Map Key. Otherwise use DB ID.
    const sessionKey = clientDiskId ? parseInt(clientDiskId) : disk.id;

    activeSessions.set(sessionKey, {
        realDiskId: disk.id, // The ID to use in DB writes
        pathCache: new Map()
    });

    // Also populate pathCache from existing DB entries? 
    // This is expensive but necessary if appending to existing disk.
    // OPTIMIZATION: We won't pre-populate for now, we'll let ensureDirectoryPath handle hits/misses via DB if needed.
    // Actually, ensureDirectoryPath checks 'session.pathCache'. If empty, it creates duplicates?
    // We should probably clear entries for this disk if it's a fresh scan?
    // The previous 'flawless' logic probably wiped the disk or was smart.
    // Let's assume we WIPE the disk entries to avoid stale data, OR we update.
    // The log "Purged pending batch files" suggests it does some cleanup.

    // DECISION: For now, just getting the ID to match is the priority.

    console.log(`[DEBUG] Session Started. mapped ClientID ${sessionKey} -> DB_ID ${disk.id}`);
    return disk;
}

async function processBatch(clientDiskId, items) {
    // console.log(`[DEBUG] processBatch ID: ${diskId} (Type: ${typeof diskId})`);
    let session = activeSessions.get(parseInt(clientDiskId));

    // LAZY RECOVERY (Modified to handle mapping?)
    // If we receive a clientDiskId but no session, we can't easily guess the Real DB ID 
    // UNLESS the clientDiskId IS the Real DB ID (legacy behavior) 
    // OR we lookup the disk by name? But we don't have name here.
    // We'll fall back to assuming clientDiskId == realDiskId for recovery if mapping missing.

    if (!session) {
        // Try exact match recovery
        const disk = await Disk.findByPk(clientDiskId);
        if (disk) {
            console.log(`[DEBUG] Lazily Recovering Session for Disk: ${clientDiskId}`);
            activeSessions.set(disk.id, { realDiskId: disk.id, pathCache: new Map() });
            session = activeSessions.get(disk.id);
        } else {
            // We can't recover if we don't know the mapping. 
            // But usually startImportSession establishes it.
            console.warn(`[WARN] Dropping orphan batch for ID ${clientDiskId}.`);
            return true;
        }
    }

    const dbDiskId = session.realDiskId; // USE THIS for DB operations

    const t = await sequelize.transaction();

    try {
        const entriesToCreate = [];

        // 1. Prepare Directory Structure (Must be sequential to ensure parents exist)
        // We can optimize this, but "ensureDirectoryPath" is already cached.
        // We'll run directory checks first, then bulk insert files.

        // Local cache for this specific batch execution to avoid race conditions
        let localLastDirPath = null;
        let localLastDirId = null;

        for (const item of items) {
            // COMPACT MODE: item is [path, size, mtime]
            // We strictly expect arrays now for performance
            const path = item[0];
            const size = item[1];
            const mtime = item[2];

            // Debug first item of batch to ensure protocol alignment
            if (item === items[0]) {
                // console.log("Processing Batch Item:", path); 
            }

            const lastSlashIndex = path.lastIndexOf('/');
            const dirPath = lastSlashIndex === -1 ? '' : path.substring(0, lastSlashIndex);
            const fileName = path.substring(lastSlashIndex + 1);

            // Optimization: Reuse ID if in same directory as previous file IN THIS BATCH
            if (dirPath === localLastDirPath) {
                // Reuse localLastDirId
            } else {
                // Resolve new path
                const parts = dirPath.split('/').filter(p => p);
                localLastDirId = await ensureDirectoryPath(dbDiskId, parts, session, t);
                localLastDirPath = dirPath;
            }

            entriesToCreate.push({
                disk_id: dbDiskId, // Use Real ID
                parent_id: localLastDirId,
                name: fileName,
                type: 'file',
                size: size,
                path: path,
                file_created_at: mtime ? new Date(mtime) : new Date()
            });
        }

        // 2. Bulk Insert Files
        if (entriesToCreate.length > 0) {
            await Entry.bulkCreate(entriesToCreate, { transaction: t });
        }

        await t.commit();
        return true;
    } catch (err) {
        await t.rollback();
        console.error("Batch Failed", err);
        throw err;
    }
}

async function ensureDirectoryPath(diskId, parts, session, transaction) {
    let currentPath = "";
    let parentId = null;

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;

        if (session.pathCache.has(currentPath)) {
            parentId = session.pathCache.get(currentPath);
            continue;
        }

        // AUTO-RECOVERY CHECK: Does it exist in DB?
        // Check DB before creating (Idempotency)
        const existingDir = await Entry.findOne({
            where: {
                disk_id: diskId,
                path: currentPath,
                type: 'directory' // Just in case
            },
            transaction // Include transaction to see uncommitted writes if any (though we usually cache them)
        });

        if (existingDir) {
            parentId = existingDir.id;
            session.pathCache.set(currentPath, parentId);
            continue;
        }

        // Use findOrCreate to be safe against race conditions if we were parallel, 
        // but here we are sequential per batch.
        // Simple create is faster.
        const dirEntry = await Entry.create({
            disk_id: diskId,
            parent_id: parentId,
            name: part,
            type: 'directory',
            size: 0,
            path: currentPath,
            file_created_at: new Date()
        }, { transaction });

        parentId = dirEntry.id;
        session.pathCache.set(currentPath, parentId);
    }

    return parentId;
}

// Helper to calculate folder sizes recursively
async function calculateFolderSizes(diskId) {
    console.log(`[DEBUG] Calculating Folder Sizes for Disk ${diskId}...`);
    try {
        const allEntries = await Entry.findAll({
            where: { disk_id: diskId },
            attributes: ['id', 'parent_id', 'size', 'type'],
            raw: true
        });

        const childrenMap = new Map();
        const roots = [];

        // Build Tree
        for (const e of allEntries) {
            if (e.parent_id) {
                if (!childrenMap.has(e.parent_id)) childrenMap.set(e.parent_id, []);
                childrenMap.get(e.parent_id).push(e);
            } else {
                roots.push(e); // Can be files or folders at root
            }
        }

        const dirUpdates = [];

        function getSize(entry) {
            if (entry.type === 'file') return parseInt(entry.size) || 0;

            let total = 0;
            const kids = childrenMap.get(entry.id) || [];
            for (const kid of kids) {
                total += getSize(kid);
            }

            // Only update if it's a directory
            if (entry.type === 'directory') {
                dirUpdates.push({ id: entry.id, size: total });
            }
            return total;
        }

        for (const root of roots) {
            getSize(root);
        }

        console.log(`[DEBUG] Updating sizes for ${dirUpdates.length} directories...`);

        // Batch Update logic (Parallel chunks)
        const CHUNK_SIZE = 100; // Moderate chunk size
        for (let i = 0; i < dirUpdates.length; i += CHUNK_SIZE) {
            const chunk = dirUpdates.slice(i, i + CHUNK_SIZE);
            const promises = chunk.map(u =>
                Entry.update({ size: u.size }, { where: { id: u.id }, silent: true })
            );
            await Promise.all(promises);
        }

        // --- NEW: Calculate Total Disk Usage ---
        // Sum of all ROOT entries (both files and folders)
        let totalUsed = 0;
        for (const root of roots) {
            // Roots are already calculated by getSize()
            // If it's a file, it has size. If folder, getSize() populated 'size' property (or we can read it)
            // Wait, getSize() returns the size but modifies the entry object? No, it returns int. 
            // We need to re-sum roots.
            if (root.type === 'file') {
                totalUsed += parseInt(root.size) || 0;
            } else {
                // For folders, we need the calculated size.
                // The dirUpdates array has it, OR we can just rely on the return value of getSize
                // But getSize was called in header loop. Let's re-calculate or just sum dirUpdates that are roots?
                // Simpler: Just re-run a quick sum loop since we have the tree in memory
                // Actually, getSize is recursive.
                // Let's just track it during the initial root loop.
            }
        }

        // Re-calculate total from roots efficiently
        let diskTotal = 0;
        const rootSizes = roots.map(r => getSize(r)); // Recalculating is cheap (memory lookup)
        diskTotal = rootSizes.reduce((a, b) => a + b, 0);

        console.log(`[DEBUG] Total Disk Usage: ${diskTotal} bytes. Updating Disk record...`);
        await Disk.update({ used_space: diskTotal }, { where: { id: diskId } });

        console.log(`[DEBUG] Folder Sizes & Disk Usage Updated Successfully.`);
    } catch (err) {
        console.error("Failed to calculate folder sizes:", err);
    }
}

async function endImportSession(clientDiskId) {
    const session = activeSessions.get(parseInt(clientDiskId));
    if (session) {
        // Calculate sizes before closing
        await calculateFolderSizes(session.realDiskId);
        activeSessions.delete(parseInt(clientDiskId));
    }
}

async function processDirBatch(diskId, payload) {
    let session = activeSessions.get(parseInt(diskId));

    // LAZY RECOVERY: If session missing, try to restore if disk exists
    if (!session) {
        const disk = await Disk.findByPk(diskId);
        if (disk) {
            console.log(`[DEBUG] Lazily Recovering Session for Disk: ${diskId}`);
            activeSessions.set(disk.id, { pathCache: new Map() });
            session = activeSessions.get(disk.id);
        } else {
            console.warn(`[WARN] Dropping orphan batch for non-existent DiskID ${diskId} to stop client retries.`);
            return true; // Pretend success to drain client queue
        }
    }

    const dbDiskId = session.realDiskId; // USE THIS for DB operations

    const t = await sequelize.transaction();

    try {
        const { dirPath, files } = payload;

        let parentId = null;
        if (dirPath && dirPath !== '.' && dirPath !== '/') {
            const parts = dirPath.split('/').filter(p => p);
            parentId = await ensureDirectoryPath(dbDiskId, parts, session, t);
        }

        if (files && files.length > 0) {
            const entries = files.map(f => ({
                disk_id: dbDiskId, // USE Real DB ID
                parent_id: parentId,
                name: f[0],
                type: 'file',
                size: f[1],
                path: dirPath ? `${dirPath}/${f[0]}` : f[0],
                file_created_at: f[2] ? new Date(f[2]) : new Date()
            }));

            await Entry.bulkCreate(entries, { transaction: t });
        }

        await t.commit();
        return true;
    } catch (err) {
        await t.rollback();
        console.error("DirBatch Failed", err);
        throw err;
    }
}

module.exports = { startImportSession, processBatch, processDirBatch, endImportSession, calculateFolderSizes };
