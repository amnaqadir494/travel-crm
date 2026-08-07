const { DataTypes } = require('sequelize');

// Department Model for PostgreSQL using Sequelize
module.exports = (sequelize) => {
    return sequelize.define('Department', {
        name: { 
            type: DataTypes.STRING, 
            allowNull: false, 
            unique: true 
        }
    }, { 
        timestamps: true 
    });
};