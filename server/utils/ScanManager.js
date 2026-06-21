const EventEmitter = require('events');

class ScanManager extends EventEmitter {
    constructor() {
        super();
        this.activeScans = new Map();
    }

    startScan(id, metadata = {}) {
        this.activeScans.set(id, {
            id,
            status: 'running',
            filesProcessed: 0,
            currentPath: '',
            startTime: Date.now(),
            ...metadata
        });
        this.emit('start', id);
    }

    updateProgress(id, data) {
        const scan = this.activeScans.get(id);
        if (scan) {
            Object.assign(scan, data);
            this.emit('progress', { id, ...scan });
        }
    }

    completeScan(id, result) {
        const scan = this.activeScans.get(id);
        if (scan) {
            scan.status = 'completed';
            scan.endTime = Date.now();
            scan.result = result;
            this.activeScans.set(id, scan); // Keep it briefly or delete?
            this.emit('complete', { id, result });

            // Cleanup after a delay?
            setTimeout(() => this.activeScans.delete(id), 60000); // 1 min retention
        }
    }

    failScan(id, error) {
        const scan = this.activeScans.get(id);
        if (scan) {
            scan.status = 'failed';
            scan.error = error;
            this.emit('error', { id, error });
        }
    }

    cancelScan(id) {
        const scan = this.activeScans.get(id);
        if (scan) {
            scan.status = 'cancelled';
            this.emit('cancelled', { id });
            // Let the scanner loop handle the actual stop
        }
    }

    getScan(id) {
        return this.activeScans.get(id);
    }
}

module.exports = new ScanManager();
