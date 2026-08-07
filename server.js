require('dotenv').config();
const express = require('express');
const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const { body, validationResult } = require('express-validator');

const app = express();
const PORT = process.env.PORT || 3000;

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error("❌ FATAL ERROR: JWT_SECRET is not defined.");
    process.exit(1);
}

app.use(helmet());

const corsOptions = {
    origin: ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 📁 Uploads folder — HAMESHA public/uploads mein hi save hoga
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
        cb(null, uniqueName);
    }
});
const upload = multer({ storage });

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/activate.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'activate.html')));
app.get('/test', (req, res) => res.send("Server is working perfectly!"));

// 🐘 PostgreSQL Connection via Sequelize
const sequelize = new Sequelize(process.env.DATABASE_URL || 'postgres://postgres:root@localhost:5432/deluxe_crm', {
    dialect: 'postgres',
    logging: false
});

const UserPSQL = sequelize.define('User', {
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: true },
    department: { type: DataTypes.STRING, allowNull: false }
}, {
    tableName: 'users',
    timestamps: false
});

const LeadPSQL = sequelize.define('Lead', {
    name: { type: DataTypes.STRING, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING },
    destination: { type: DataTypes.STRING },
    source: { type: DataTypes.STRING, defaultValue: 'Direct' },
    status: { type: DataTypes.STRING, defaultValue: 'Pending' },
    numberOfPersons: { type: DataTypes.INTEGER, defaultValue: 1 },
    passengers: { type: DataTypes.JSON },
    assignedVisa: { type: DataTypes.STRING },
    assignedTicketing: { type: DataTypes.STRING },
    assignedFinance: { type: DataTypes.STRING },
    assignedTour: { type: DataTypes.STRING }
}, {
    tableName: 'Leads',
    timestamps: false
});

sequelize.authenticate()
    .then(() => {
        console.log("✅ Connected to PostgreSQL Successfully");
        return sequelize.sync({ alter: true });
    })
    .then(() => console.log("✅ Tables verified/synced"))
    .catch((err) => {
        console.error("❌ PostgreSQL Connection Failed:", err);
    });

function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Access Denied: No token provided" });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(403).json({ error: "Invalid or expired token" });
    }
}

function requireAdmin(req, res, next) {
    if (req.user.department !== 'Admin') {
        return res.status(403).json({ error: "Access Denied: Admin privileges required." });
    }
    next();
}

function isStrongPassword(password) {
    const strongRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
    return strongRegex.test(password);
}

// 🆔 Employee ID hamesha user ke DB id se banaya jata hai
function buildEmployeeId(id) {
    return `DLX-${String(id).padStart(4, '0')}`;
}

function parseEmployeeId(employeeId) {
    if (!employeeId) return null;
    const match = employeeId.trim().match(/(\d+)$/);
    if (!match) return null;
    return parseInt(match[1], 10);
}

// ==========================================
// AUTH — LOGIN (Employee ID + Password)
// ==========================================
app.post('/api/auth/login', async (req, res) => {
    try {
        const { employeeId, password } = req.body;
        if (!employeeId || !password) {
            return res.status(400).json({ error: 'Employee ID and password are required' });
        }

        const numericId = parseEmployeeId(employeeId);
        if (numericId === null) {
            return res.status(401).json({ error: "Invalid Employee ID or password!" });
        }

        const foundUser = await UserPSQL.findOne({ where: { id: numericId } });
        if (!foundUser) return res.status(401).json({ error: "Invalid Employee ID or password!" });

        if (!foundUser.password) {
            return res.status(401).json({ error: "Account not activated yet. Please use 'Activate Account' with your Employee ID first." });
        }

        const isMatch = await bcrypt.compare(password, foundUser.password);
        if (!isMatch) return res.status(401).json({ error: "Invalid Employee ID or password!" });

        const token = jwt.sign(
            { id: foundUser.id, name: foundUser.name, email: foundUser.email, department: foundUser.department },
            JWT_SECRET,
            { expiresIn: '12h' }
        );

        res.json({
            token,
            user: {
                id: foundUser.id,
                employeeId: buildEmployeeId(foundUser.id),
                name: foundUser.name,
                email: foundUser.email,
                department: foundUser.department
            }
        });
    } catch (err) {
        console.error("❌ Login Error:", err);
        res.status(500).json({ error: "Login failed: " + err.message });
    }
});

// ==========================================
// ACCOUNT ACTIVATION — employee apna password khud set karta hai
// ==========================================
app.post('/api/auth/activate', [
    body('employeeId').trim().notEmpty().withMessage('Employee ID is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 chars long')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array().map(e => e.msg).join(', ') });
        }

        const { employeeId, email, newPassword } = req.body;
        const numericId = parseEmployeeId(employeeId);
        if (numericId === null) {
            return res.status(400).json({ error: "Invalid Employee ID format." });
        }

        const foundUser = await UserPSQL.findOne({ where: { id: numericId } });
        if (!foundUser) {
            return res.status(404).json({ error: "No account found with this Employee ID." });
        }

        if (foundUser.email.toLowerCase() !== email.toLowerCase().trim()) {
            return res.status(400).json({ error: "Employee ID and Email do not match our records." });
        }

        if (foundUser.password) {
            return res.status(400).json({ error: "This account is already activated. Please login normally." });
        }

        if (!isStrongPassword(newPassword)) {
            return res.status(400).json({ error: "Password must include uppercase, lowercase, number, and special character." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await foundUser.update({ password: hashedPassword });

        res.json({ message: "Account activated successfully! You can now login." });
    } catch (err) {
        console.error("❌ Activation Error:", err);
        res.status(500).json({ error: "Activation failed: " + err.message });
    }
});

// ==========================================
// EMPLOYEES — read access for everyone (assign dropdowns ke liye)
// ==========================================
app.get('/api/employees', authenticateToken, async (req, res) => {
    try {
        const users = await UserPSQL.findAll({ attributes: ['id', 'name', 'email', 'department', 'password'] });
        const formatted = users.map(u => ({
            id: u.id,
            employeeId: buildEmployeeId(u.id),
            name: u.name,
            email: u.email,
            department: u.department,
            activated: !!u.password
        }));
        res.json(formatted);
    } catch (err) {
        console.error("❌ Error fetching employees:", err);
        res.status(500).json({ error: "Failed to fetch employees" });
    }
});

// ==========================================
// ADMIN — Employee Management (Add / Edit / Delete) — Admin only
// ==========================================
app.post('/api/admin/users', authenticateToken, requireAdmin, [
    body('name').trim().isLength({ min: 3, max: 50 }).withMessage('Name must be between 3 and 50 characters'),
    body('email').isEmail().withMessage('Invalid email format'),
    body('department').notEmpty().withMessage('Department is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array().map(e => e.msg).join(', ') });
        }

        const { name, email, department } = req.body;
        const lowerEmail = email.toLowerCase().trim();

        const userExists = await UserPSQL.findOne({ where: { email: lowerEmail } });
        if (userExists) return res.status(400).json({ error: "An employee with this email already exists!" });

        const newUser = await UserPSQL.create({ name: name.trim(), email: lowerEmail, password: null, department });

        res.status(201).json({
            id: newUser.id,
            employeeId: buildEmployeeId(newUser.id),
            name: newUser.name,
            email: newUser.email,
            department: newUser.department
        });
    } catch (err) {
        console.error("❌ Add Employee Error:", err);
        res.status(500).json({ error: "Failed to add employee" });
    }
});

app.put('/api/admin/users/:id', authenticateToken, requireAdmin, [
    body('name').trim().isLength({ min: 3, max: 50 }).withMessage('Name must be between 3 and 50 characters'),
    body('email').isEmail().withMessage('Invalid email format'),
    body('department').notEmpty().withMessage('Department is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array().map(e => e.msg).join(', ') });
        }

        const foundUser = await UserPSQL.findByPk(req.params.id);
        if (!foundUser) return res.status(404).json({ error: "Employee not found!" });

        const { name, email, department } = req.body;
        const lowerEmail = email.toLowerCase().trim();

        const emailTaken = await UserPSQL.findOne({ where: { email: lowerEmail } });
        if (emailTaken && emailTaken.id !== foundUser.id) {
            return res.status(400).json({ error: "This email is already used by another employee!" });
        }

        await foundUser.update({ name: name.trim(), email: lowerEmail, department });

        res.json({
            id: foundUser.id,
            employeeId: buildEmployeeId(foundUser.id),
            name: foundUser.name,
            email: foundUser.email,
            department: foundUser.department
        });
    } catch (err) {
        console.error("❌ Edit Employee Error:", err);
        res.status(500).json({ error: "Failed to update employee" });
    }
});

app.delete('/api/admin/users/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const deleted = await UserPSQL.destroy({ where: { id: req.params.id } });
        if (!deleted) return res.status(404).json({ error: "Employee not found!" });
        res.json({ message: "Employee removed successfully" });
    } catch (err) {
        console.error("❌ Delete Employee Error:", err);
        res.status(500).json({ error: "Failed to delete employee" });
    }
});

// ==========================================
// LEADS
// ==========================================
app.get('/api/leads', authenticateToken, async (req, res) => {
    try {
        const leads = await LeadPSQL.findAll({ order: [['id', 'DESC']] });
        res.json(leads);
    } catch (err) {
        console.error("❌ Fetch Leads Error:", err);
        res.status(500).json({ error: "Failed to fetch leads" });
    }
});

app.post('/api/leads', authenticateToken, upload.any(), [
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('email').isEmail().withMessage('Valid email is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array().map(e => e.msg).join(', ') });
        }

        const { name, email, phone, destination, status } = req.body;
        const numberOfPersons = parseInt(req.body.numberOfPersons) || 1;

        let passengersMeta = [];
        if (req.body.passengers) {
            try { passengersMeta = JSON.parse(req.body.passengers); } catch (e) { passengersMeta = []; }
        }

        const files = req.files || [];
        passengersMeta = passengersMeta.map((p, pIdx) => {
            const documents = (p.documents || [])
                .map((doc, dIdx) => {
                    const matchedFile = files.find(f => f.fieldname === `passengerDoc_${pIdx}_${dIdx}`);
                    return {
                        name: doc.name || 'Document',
                        url: matchedFile ? `/uploads/${matchedFile.filename}` : (doc.url || '')
                    };
                })
                .filter(d => d.url);

            return {
                name: p.name || '',
                cnic: p.cnic || '',
                passport: p.passport || '',
                phone: p.phone || '',
                documents
            };
        });

        const newLead = await LeadPSQL.create({
            name, email,
            phone: phone || '',
            destination: destination || '',
            status: status || 'Pending',
            numberOfPersons,
            passengers: passengersMeta
        });

        res.status(201).json(newLead);
    } catch (err) {
        console.error("❌ Add Lead Error:", err);
        res.status(500).json({ error: "Failed to add lead" });
    }
});

app.put('/api/leads/:id', authenticateToken, upload.any(), async (req, res) => {
    try {
        const { id } = req.params;
        const leadToUpdate = await LeadPSQL.findByPk(id);
        if (!leadToUpdate) return res.status(404).json({ error: "Lead not found!" });

        let numberOfPersons = leadToUpdate.numberOfPersons;
        let passengers = leadToUpdate.passengers;

        if (req.body.numberOfPersons !== undefined) {
            numberOfPersons = parseInt(req.body.numberOfPersons) || numberOfPersons;
        }

        if (req.body.passengers !== undefined) {
            let passengersMeta = [];
            try { passengersMeta = JSON.parse(req.body.passengers); } catch (e) { passengersMeta = []; }

            const files = req.files || [];
            const existingPassengers = leadToUpdate.passengers || [];

            passengers = passengersMeta.map((p, pIdx) => {
                const existingDocs = (existingPassengers[pIdx] && existingPassengers[pIdx].documents) || [];
                const documents = (p.documents || [])
                    .map((doc, dIdx) => {
                        const matchedFile = files.find(f => f.fieldname === `passengerDoc_${pIdx}_${dIdx}`);
                        const fallbackUrl = existingDocs[dIdx] ? existingDocs[dIdx].url : '';
                        return {
                            name: doc.name || 'Document',
                            url: matchedFile ? `/uploads/${matchedFile.filename}` : fallbackUrl
                        };
                    })
                    .filter(d => d.url);

                return {
                    name: p.name || '',
                    cnic: p.cnic || '',
                    passport: p.passport || '',
                    phone: p.phone || '',
                    documents
                };
            });
        }

        await leadToUpdate.update({ numberOfPersons, passengers });
        res.json(leadToUpdate);
    } catch (err) {
        console.error("❌ Update Lead Error:", err);
        res.status(500).json({ error: "Failed to update lead" });
    }
});

// ✏️ Assign field — koi bhi kabhi bhi badal sakta hai, koi lock nahi
app.patch('/api/leads/:id/assign', authenticateToken, async (req, res) => {
    try {
        const { field, value } = req.body;
        const allowedFields = ['assignedVisa', 'assignedTicketing', 'assignedFinance', 'assignedTour'];

        if (!allowedFields.includes(field)) {
            return res.status(400).json({ error: 'Invalid assignment field' });
        }

        const leadToUpdate = await LeadPSQL.findByPk(req.params.id);
        if (!leadToUpdate) return res.status(404).json({ error: "Lead not found!" });

        await leadToUpdate.update({ [field]: value });
        res.json(leadToUpdate);
    } catch (err) {
        console.error("❌ Assignment Error:", err);
        res.status(500).json({ error: "Failed to update assignment" });
    }
});

// 🔄 Status update — dropdown se turant save
app.patch('/api/leads/:id/status', authenticateToken, [
    body('status').isIn(['Pending', 'In Progress', 'Confirmed', 'Cancelled']).withMessage('Invalid status')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array().map(e => e.msg).join(', ') });
        }

        const leadToUpdate = await LeadPSQL.findByPk(req.params.id);
        if (!leadToUpdate) return res.status(404).json({ error: "Lead not found!" });

        await leadToUpdate.update({ status: req.body.status });
        res.json(leadToUpdate);
    } catch (err) {
        console.error("❌ Status Update Error:", err);
        res.status(500).json({ error: "Failed to update status" });
    }
});

app.delete('/api/leads/:id', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const deleted = await LeadPSQL.destroy({ where: { id: req.params.id } });
        if (!deleted) return res.status(404).json({ error: "Lead not found!" });
        res.json({ message: "Lead deleted successfully" });
    } catch (err) {
        console.error("❌ Delete Lead Error:", err);
        res.status(500).json({ error: "Failed to delete lead" });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));