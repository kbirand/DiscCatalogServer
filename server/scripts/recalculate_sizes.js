const { Disk } = require('../models');
const sequelize = require('../config/database');
const { calculateFolderSizes } = require('../utils/importHelper');

async function runCallback() {
    try {
        await sequelize.authenticate();
        console.log("Database connected.");

        const disks = await Disk.findAll({ attributes: ['id', 'name'] });
        console.log(`Found ${disks.length} disks. Starting recalculation...`);

        for (const [index, disk] of disks.entries()) {
            console.log(`[${index + 1}/${disks.length}] Processing Disk: ${disk.name} (ID: ${disk.id})`);
            await calculateFolderSizes(disk.id);
            // Optional: minimal delay to let GC breathe if needed
            // await new Promise(r => setTimeout(r, 100));
        }

        console.log("All disks updated successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Recalculation Failed:", err);
        process.exit(1);
    }
}

runCallback();
