const { DataTypes } = require('sequelize');

// Lead Model for PostgreSQL using Sequelize
module.exports = (sequelize) => {
    return sequelize.define('Lead', {
        name: { 
            type: DataTypes.STRING, 
            allowNull: false 
        },
        email: { 
            type: DataTypes.STRING, 
            defaultValue: 'N/A' 
        },
        phone: { 
            type: DataTypes.STRING, 
            allowNull: false 
        },
        destination: { 
            type: DataTypes.STRING, 
            defaultValue: 'Not Specified' 
        },
        source: { 
            type: DataTypes.STRING, 
            defaultValue: 'Manual Entry' 
        },
        status: { 
            type: DataTypes.STRING, 
            defaultValue: 'Pending' 
        },

        // Multi-Department Assignees
        assignedVisa: { 
            type: DataTypes.STRING, 
            defaultValue: '' 
        }, 
        assignedTicketing: { 
            type: DataTypes.STRING, 
            defaultValue: '' 
        }, 
        assignedFinance: { 
            type: DataTypes.STRING, 
            defaultValue: '' 
        }
    }, { 
        timestamps: true 
    });
};