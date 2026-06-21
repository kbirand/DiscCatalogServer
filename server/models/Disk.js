const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Disk = sequelize.define('Disk', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    serial_number: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true
    },
    total_space: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
    free_space: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
    used_space: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
    scanned_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    order: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    }
}, {
    tableName: 'disks',
    timestamps: true
});

module.exports = Disk;
