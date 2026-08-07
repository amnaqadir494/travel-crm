const { DataTypes } = require('sequelize');

// User Model for PostgreSQL using Sequelize
module.exports = (sequelize) => {
    return sequelize.define('User', {
        name: { 
            type: DataTypes.STRING, 
            allowNull: false 
        },
        email: { 
            type: DataTypes.STRING, 
            allowNull: false, 
            unique: true 
        },
        password: { 
            type: DataTypes.STRING, 
            allowNull: false 
        },
        department: { 
            type: DataTypes.STRING, 
            allowNull: false 
        }
    }, { 
        timestamps: true 
    });
};