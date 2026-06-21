const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Disk = require('./Disk');

const Entry = sequelize.define('Entry', {
    id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true
    },
    disk_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Disk,
            key: 'id'
        }
    },
    parent_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'entries', // referencing table name directly to avoid circular dependency issues at define time
            key: 'id'
        }
    },
    name: {
        type: DataTypes.STRING,
        allowNull: false
    },
    type: {
        type: DataTypes.ENUM('file', 'directory'),
        allowNull: false
    },
    size: {
        type: DataTypes.BIGINT,
        allowNull: true
    },
    path: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    file_created_at: {
        type: DataTypes.DATE,
        allowNull: true
    }
}, {
    tableName: 'entries',
    timestamps: true,
    indexes: [
        {
            fields: ['parent_id']
        },
        {
            fields: ['disk_id']
        },
        {
            fields: ['name']
        }
    ]
});

module.exports = Entry;
