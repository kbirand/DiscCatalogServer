const Disk = require('./Disk');
const Entry = require('./Entry');

// Associations
Disk.hasMany(Entry, { foreignKey: 'disk_id', onDelete: 'CASCADE' });
Entry.belongsTo(Disk, { foreignKey: 'disk_id' });

Entry.hasMany(Entry, { as: 'children', foreignKey: 'parent_id', onDelete: 'CASCADE' });
Entry.belongsTo(Entry, { as: 'parent', foreignKey: 'parent_id' });

const User = require('./User'); // Import User

// ... (existing associations) ...

module.exports = {
    Disk,
    Entry,
    User // Export User
};
