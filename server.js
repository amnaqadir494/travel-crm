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

// 🛠️ Maintenance Mode
const MAINTENANCE_FLAG = path.join(__dirname, 'maintenance.flag');
app.use((req, res, next) => {
    if (fs.existsSync(MAINTENANCE_FLAG)) {
        if (req.path.startsWith('/api/')) {
            return res.status(503).json({ error: 'System is under maintenance. Please try again later.' });
        }
        return res.sendFile(path.join(__dirname, 'public', 'maintenance.html'));
    }
    next();
});
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
    email: { type: DataTypes.STRING, allowNull: true, unique: true }, // 👈 Ab optional hai
    phone: { type: DataTypes.STRING, allowNull: true },
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
    followUpNotes: { type: DataTypes.JSON },
    documents: { type: DataTypes.JSON },
    assignedVisa: { type: DataTypes.STRING },
    assignedTicketing: { type: DataTypes.STRING },
    assignedFinance: { type: DataTypes.STRING },
    assignedTour: { type: DataTypes.STRING },
    // 🏷️ Tagging / Handover chain ke liye
    tagHistory: { type: DataTypes.JSON, defaultValue: [] },
    currentTagDepartment: { type: DataTypes.STRING },
    currentTagEmail: { type: DataTypes.STRING },
    currentTagName: { type: DataTypes.STRING },
    // 📌 NAYE FIELDS — Detail modal ke liye
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    addedByName: { type: DataTypes.STRING },
    addedByEmail: { type: DataTypes.STRING },
    travelDate: { type: DataTypes.STRING },
    duration: { type: DataTypes.STRING },
    leadStatus: { type: DataTypes.STRING, defaultValue: 'New Lead' }
}, {
    tableName: 'Leads',
    timestamps: false
});

const LEAD_STATUSES = ['New Lead', 'Contacted', 'Quoted', 'Confirmed', 'Complete', 'Cancelled/Refund'];

// 🔔 NAYA MODEL — Notifications (jab kisi employee ko tag kiya jaye)
const NotificationPSQL = sequelize.define('Notification', {
    recipientEmail: { type: DataTypes.STRING, allowNull: false },
    leadId: { type: DataTypes.INTEGER },
    leadName: { type: DataTypes.STRING },
    message: { type: DataTypes.STRING },
    department: { type: DataTypes.STRING },
    taggedByName: { type: DataTypes.STRING },
    isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
    createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
    tableName: 'Notifications',
    timestamps: false
});

sequelize.authenticate()
    .then(async () => {
        console.log("✅ Connected to PostgreSQL Successfully");

        try {
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "followUpNotes" JSON;');
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "documents" JSON;');
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "tagHistory" JSON;');
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "currentTagDepartment" VARCHAR(255);');
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "currentTagEmail" VARCHAR(255);');
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "currentTagName" VARCHAR(255);');
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP DEFAULT NOW();');
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "addedByName" VARCHAR(255);');
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "addedByEmail" VARCHAR(255);');
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "travelDate" VARCHAR(255);');
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "duration" VARCHAR(255);');
            await sequelize.query(`ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "leadStatus" VARCHAR(255) DEFAULT 'New Lead';`);
            await sequelize.query(`UPDATE "Leads" SET "leadStatus" = 'New Lead' WHERE "leadStatus" IS NULL;`);
            await sequelize.query('ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" VARCHAR(255);');
            await sequelize.query('ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;');
            console.log("✅ All columns/constraints verified/added successfully via code");
        } catch (migrationErr) {
            console.error("⚠️ Migration check note:", migrationErr.message);
        }

        await sequelize.sync({ alter: true });
        console.log("✅ Tables verified/synced");
    })
    .catch((err) => {
        console.error("❌ PostgreSQL Connection/Sync Failed:", err);
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
// ACCOUNT ACTIVATION
// ==========================================
app.post('/api/auth/activate', [
    body('employeeId').trim().notEmpty().withMessage('Employee ID is required'),
    body('name').trim().notEmpty().withMessage('Name is required'),
    body('newPassword').isLength({ min: 8 }).withMessage('Password must be at least 8 chars long')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array().map(e => e.msg).join(', ') });
        }

        const { employeeId, name, newPassword } = req.body;
        const numericId = parseEmployeeId(employeeId);
        if (numericId === null) {
            return res.status(400).json({ error: "Invalid Employee ID format." });
        }

        const foundUser = await UserPSQL.findOne({ where: { id: numericId } });
        if (!foundUser) {
            return res.status(404).json({ error: "No account found with this Employee ID." });
        }

        if (foundUser.name.trim().toLowerCase() !== name.trim().toLowerCase()) {
            return res.status(400).json({ error: "Employee ID and Name do not match our records." });
        }

        if (foundUser.password) {
            return res.status(400).json({ error: "This account is already activated. Please login normally, or ask your Admin to reset your password." });
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
// EMPLOYEES
// ==========================================
app.get('/api/employees', authenticateToken, async (req, res) => {
    try {
        const users = await UserPSQL.findAll({ attributes: ['id', 'name', 'email', 'phone', 'department', 'password'] });
        const formatted = users.map(u => ({
            id: u.id,
            employeeId: buildEmployeeId(u.id),
            name: u.name,
            email: u.email,
            phone: u.phone,
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
// ADMIN — Employee Management
// ==========================================
app.post('/api/admin/users', authenticateToken, requireAdmin, [
    body('name').trim().isLength({ min: 3, max: 50 }).withMessage('Name must be between 3 and 50 characters'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format'),
    body('department').notEmpty().withMessage('Department is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array().map(e => e.msg).join(', ') });
        }

        const { name, email, phone, department } = req.body;
        const lowerEmail = email && email.trim() ? email.toLowerCase().trim() : null;

        if (lowerEmail) {
            const userExists = await UserPSQL.findOne({ where: { email: lowerEmail } });
            if (userExists) return res.status(400).json({ error: "An employee with this email already exists!" });
        }

        const newUser = await UserPSQL.create({
            name: name.trim(),
            email: lowerEmail,
            phone: phone ? phone.trim() : null,
            password: null,
            department
        });

        res.status(201).json({
            id: newUser.id,
            employeeId: buildEmployeeId(newUser.id),
            name: newUser.name,
            email: newUser.email,
            phone: newUser.phone,
            department: newUser.department
        });
    } catch (err) {
        console.error("❌ Add Employee Error:", err);
        res.status(500).json({ error: "Failed to add employee" });
    }
});

app.put('/api/admin/users/:id', authenticateToken, requireAdmin, [
    body('name').trim().isLength({ min: 3, max: 50 }).withMessage('Name must be between 3 and 50 characters'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Invalid email format'),
    body('department').notEmpty().withMessage('Department is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array().map(e => e.msg).join(', ') });
        }

        const foundUser = await UserPSQL.findByPk(req.params.id);
        if (!foundUser) return res.status(404).json({ error: "Employee not found!" });

        const { name, email, phone, department } = req.body;
        const lowerEmail = email && email.trim() ? email.toLowerCase().trim() : null;

        if (lowerEmail) {
            const emailTaken = await UserPSQL.findOne({ where: { email: lowerEmail } });
            if (emailTaken && emailTaken.id !== foundUser.id) {
                return res.status(400).json({ error: "This email is already used by another employee!" });
            }
        }

        await foundUser.update({
            name: name.trim(),
            email: lowerEmail,
            phone: phone ? phone.trim() : null,
            department
        });

        res.json({
            id: foundUser.id,
            employeeId: buildEmployeeId(foundUser.id),
            name: foundUser.name,
            email: foundUser.email,
            phone: foundUser.phone,
            department: foundUser.department
        });
    } catch (err) {
        console.error("❌ Edit Employee Error:", err);
        res.status(500).json({ error: "Failed to update employee" });
    }
});

app.post('/api/admin/users/:id/reset-password', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const foundUser = await UserPSQL.findByPk(req.params.id);
        if (!foundUser) return res.status(404).json({ error: "Employee not found!" });

        await foundUser.update({ password: null });
        res.json({
            message: 'Password reset successfully! ${foundUser.name} (${buildEmployeeId(foundUser.id)}) can now set a new password via "Activate Account" — please share their Employee ID and name with them.'
        });
    } catch (err) {
        console.error("❌ Reset Password Error:", err);
        res.status(500).json({ error: "Failed to reset password" });
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

        const { name, email, phone, destination, source, travelDate, duration } = req.body;
        const numberOfPersons = parseInt(req.body.numberOfPersons) || 1;

        let passengersMeta = [];
        if (req.body.passengers) {
            try { passengersMeta = JSON.parse(req.body.passengers); } catch (e) { passengersMeta = []; }
        }

        const newLead = await LeadPSQL.create({
            name, email,
            phone: phone || '',
            destination: destination || '',
            source: source || 'Direct',
            travelDate: travelDate || '',
            duration: duration || '',
            numberOfPersons,
            passengers: passengersMeta,
            followUpNotes: [],
            documents: [],
            createdAt: new Date(),
            addedByName: req.user.name,
            addedByEmail: req.user.email,
            leadStatus: 'New Lead',
            tagHistory: [{
                fromName: req.user.name,
                fromEmail: req.user.email,
                toName: req.user.name,
                toEmail: req.user.email,
                department: req.user.department,
                note: 'Lead created',
                timestamp: new Date().toISOString()
            }],
            currentTagDepartment: req.user.department,
            currentTagEmail: req.user.email,
            currentTagName: req.user.name
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
        let followUpNotes = leadToUpdate.followUpNotes || [];
        let documents = leadToUpdate.documents || [];

        if (req.body.numberOfPersons !== undefined) {
            numberOfPersons = parseInt(req.body.numberOfPersons) || numberOfPersons;
        }

        if (req.body.followUpNotes !== undefined) {
            try {
                const parsed = JSON.parse(req.body.followUpNotes);
                followUpNotes = Array.isArray(parsed) ? parsed : followUpNotes;
            } catch (e) {
                console.error("⚠️ followUpNotes parse error:", e.message);
            }
        }

        if (req.body.passengers !== undefined) {
            try {
                const parsed = JSON.parse(req.body.passengers);
                passengers = Array.isArray(parsed) ? parsed.map(p => ({
                    name: p.name || '',
                    cnic: p.cnic || '',
                    passport: p.passport || '',
                    phone: p.phone || '',
                    ageCategory: p.ageCategory || ''
                })) : passengers;
            } catch (e) {
                console.error("⚠️ passengers parse error:", e.message);
            }
        }

        if (req.body.documents !== undefined) {
            try {
                const documentsMeta = JSON.parse(req.body.documents);
                const files = req.files || [];
                documents = documentsMeta
                    .map((d, idx) => {
                        const matchedFile = files.find(f => f.fieldname === `leadDoc_${idx}`);
                        return {
                            name: d.name || 'Document',
                            url: matchedFile ? `/uploads/${matchedFile.filename}` : (d.url || '')
                        };
                    })
                    .filter(d => d.url);
            } catch (e) {
                console.error("⚠️ documents parse error:", e.message);
            }
        }

        await leadToUpdate.update({ numberOfPersons, passengers, followUpNotes, documents });
        res.json(leadToUpdate);
    } catch (err) {
        console.error("❌ Update Lead Error:", err);
        res.status(500).json({ error: "Failed to update lead" });
    }
});

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

app.patch('/api/leads/:id/source', authenticateToken, [
    body('source').isIn(['Direct', 'Facebook', 'Referral', 'Walk-in', 'Website', 'Other']).withMessage('Invalid source')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array().map(e => e.msg).join(', ') });
        }

        const leadToUpdate = await LeadPSQL.findByPk(req.params.id);
        if (!leadToUpdate) return res.status(404).json({ error: "Lead not found!" });

        await leadToUpdate.update({ source: req.body.source });
        res.json(leadToUpdate);
    } catch (err) {
        console.error("❌ Source Update Error:", err);
        res.status(500).json({ error: "Failed to update source" });
    }
});

// ==========================================
// 📌 BASIC INFO UPDATE — Name/Email/Phone/Destination/Travel Date/Duration
// ==========================================
app.patch('/api/leads/:id/basic-info', authenticateToken, [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('email').optional().isEmail().withMessage('Invalid email format')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array().map(e => e.msg).join(', ') });
        }

        const lead = await LeadPSQL.findByPk(req.params.id);
        if (!lead) return res.status(404).json({ error: "Lead not found!" });

        const { name, email, phone, destination, source, travelDate, duration, numberOfPersons } = req.body;
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (email !== undefined) updateData.email = email;
        if (phone !== undefined) updateData.phone = phone;
        if (destination !== undefined) updateData.destination = destination;
        if (source !== undefined) updateData.source = source;
        if (travelDate !== undefined) updateData.travelDate = travelDate;
        if (duration !== undefined) updateData.duration = duration;
        if (numberOfPersons !== undefined) updateData.numberOfPersons = parseInt(numberOfPersons) || lead.numberOfPersons;

        await lead.update(updateData);
        res.json(lead);
    } catch (err) {
        console.error("❌ Basic Info Update Error:", err);
        res.status(500).json({ error: "Failed to update lead info" });
    }
});

// ==========================================
// 📌 STATUS UPDATE — New Lead / Contacted / Quoted / Confirmed / Complete / Cancelled/Refund
// ==========================================
app.patch('/api/leads/:id/status', authenticateToken, [
    body('status').isIn(LEAD_STATUSES).withMessage('Invalid status value')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array().map(e => e.msg).join(', ') });
        }

        const lead = await LeadPSQL.findByPk(req.params.id);
        if (!lead) return res.status(404).json({ error: "Lead not found!" });

        await lead.update({ leadStatus: req.body.status });
        res.json(lead);
    } catch (err) {
        console.error("❌ Status Update Error:", err);
        res.status(500).json({ error: "Failed to update status" });
    }
});

// ==========================================
// 🏷️ TAG / HANDOVER — Lead ko kisi employee/department ko tag karna
// Chain: Sales ne Finance ko tag kia -> Finance ne Visa ko tag kia -> waghera
// ==========================================
app.post('/api/leads/:id/tag', authenticateToken, [
    body('toEmail').isEmail().withMessage('Valid employee email required (employee ka email set hona zaroori hai)'),
    body('department').notEmpty().withMessage('Department is required')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: errors.array().map(e => e.msg).join(', ') });
        }

        const lead = await LeadPSQL.findByPk(req.params.id);
        if (!lead) return res.status(404).json({ error: "Lead not found!" });

        const { toEmail, department, note } = req.body;
        const toUser = await UserPSQL.findOne({ where: { email: toEmail.toLowerCase().trim() } });
        if (!toUser) return res.status(404).json({ error: "Target employee not found (unka email system mein set hona chahiye)." });

        const historyEntry = {
            fromName: req.user.name,
            fromEmail: req.user.email,
            toName: toUser.name,
            toEmail: toUser.email,
            department,
            note: note || '',
            timestamp: new Date().toISOString()
        };

        const existingHistory = Array.isArray(lead.tagHistory) ? lead.tagHistory : [];
        existingHistory.push(historyEntry);

        await lead.update({
            tagHistory: existingHistory,
            currentTagDepartment: department,
            currentTagEmail: toUser.email,
            currentTagName: toUser.name
        });

        // 🔔 Notification banao target employee ke liye
        await NotificationPSQL.create({
            recipientEmail: toUser.email,
            leadId: lead.id,
            leadName: lead.name,
            message: `${req.user.name} has tagged you on lead "${lead.name}" (${department}).`,
            department,
            taggedByName: req.user.name
        });

        res.json(lead);
    } catch (err) {
        console.error("❌ Tag Lead Error:", err);
        res.status(500).json({ error: "Failed to tag lead" });
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

// ==========================================
// 🔔 NOTIFICATIONS — Tagged employee ke liye popup/bell
// ==========================================
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        if (!req.user.email) return res.json([]); // employee ka email set nahi
        const notifications = await NotificationPSQL.findAll({
            where: { recipientEmail: req.user.email },
            order: [['id', 'DESC']],
            limit: 50
        });
        res.json(notifications);
    } catch (err) {
        console.error("❌ Fetch Notifications Error:", err);
        res.status(500).json({ error: "Failed to fetch notifications" });
    }
});

app.patch('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        const notif = await NotificationPSQL.findByPk(req.params.id);
        if (!notif || notif.recipientEmail !== req.user.email) {
            return res.status(404).json({ error: "Notification not found" });
        }
        await notif.update({ isRead: true });
        res.json(notif);
    } catch (err) {
        console.error("❌ Mark Read Error:", err);
        res.status(500).json({ error: "Failed to update notification" });
    }
});

app.patch('/api/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        await NotificationPSQL.update(
            { isRead: true },
            { where: { recipientEmail: req.user.email, isRead: false } }
        );
        res.json({ message: "All marked as read" });
    } catch (err) {
        console.error("❌ Mark All Read Error:", err);
        res.status(500).json({ error: "Failed to update notifications" });
    }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));