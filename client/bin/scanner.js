#!/usr/bin/env node

/**
 * DiskKatalog CLI Scanner
 * Usage: node scanner.js <folder-path> <server-url> [disk-name]
 * Example: node scanner.js /Volumes/Photos http://localhost:3001 "My Photos"
 */

import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

const args = process.argv.slice(2);
if (args.length < 2) {
    console.log("Usage: node scanner.js <folder-path> <server-url> [disk-name]");
    process.exit(1);
}

const ROOT_PATH = path.resolve(args[0]);
const SERVER_URL = args[1].replace(/\/$/, ''); // Remove trailing slash
const DISK_NAME = args[2] || path.basename(ROOT_PATH);
const API_KEY = process.env.SCANNER_KEY || 'change_me_scanner_key';

const BATCH_SIZE = 10000;
const CONCURRENCY = 3;

let scanCount = 0;
let uploadCount = 0;
let startTime = performance.now();
let batch = [];
let pendingUploads = 0;
const queue = [];

// Helper for Fetch (Node 18 has global fetch)
async function postJSON(endpoint, data) {
    const res = await fetch(`${SERVER_URL}${endpoint}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY
        },
        body: JSON.stringify(data)
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Server Error (${res.status}): ${txt}`);
    }
    return res.json();
}

async function processQueue() {
    if (pendingUploads >= CONCURRENCY || queue.length === 0) return;

    pendingUploads++;
    const task = queue.shift();

    try {
        await task();
    } catch (err) {
        console.error("\nUpload Error:", err.message);
        // Retry logic could go here
    } finally {
        pendingUploads--;
        processQueue();
    }
}

function queueUpload(diskId, items) {
    return new Promise((resolve) => {
        const task = async () => {
            const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
            process.stdout.write(`\rScanned: ${scanCount} | Uploaded: ${uploadCount} | Time: ${elapsed}s ...`);
            resolve();
        };
        queue.push(task);
        processQueue();
    });
}

async function walk(dir, diskId, relativePath = '') {
    let entries;
    try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (e) {
        console.error(`\nError reading ${dir}: ${e.message}`);
        return;
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
            await walk(fullPath, diskId, relPath);
        } else if (entry.isFile()) {
            const stats = await fs.promises.stat(fullPath);

            // COMPACT ARRAY FORMAT: [path, size, mtime]
            batch.push([
                relPath,
                stats.size,
                stats.mtime
            ]);
            scanCount++;

            if (batch.length >= BATCH_SIZE) {
                queueUpload(diskId, [...batch]);
                batch = [];
            }
        }
    }
}

async function main() {
    console.log(`\n--- DiskKatalog Scanner ---`);
    console.log(`Target: ${ROOT_PATH}`);
    console.log(`Server: ${SERVER_URL}`);
    console.log(`Name:   ${DISK_NAME}\n`);

    try {
        // 1. Start Session
        console.log("Initializing scan session...");
        const startData = await postJSON('/api/debug/start', {
            name: DISK_NAME,
            total_space: 0
        });
        const diskId = startData.diskId;
        console.log(`Session Started (Disk ID: ${diskId})`);

        // 2. Scan
        await walk(ROOT_PATH, diskId);

        // 3. Flush Request
        if (batch.length > 0) {
            queueUpload(diskId, batch);
        }

        // 4. Wait for Uploads
        while (pendingUploads > 0 || queue.length > 0) {
            await new Promise(r => setTimeout(r, 100));
        }

        // 5. End Session
        await postJSON('/api/debug/end', { diskId });

        const duration = ((performance.now() - startTime) / 1000).toFixed(2);
        console.log(`\n\nDone! Scanned ${scanCount} files in ${duration}s.`);

    } catch (err) {
        console.error("\nFATAL ERROR:", err.message);
        if (err.cause) console.error(err.cause);
    }
}

main();
