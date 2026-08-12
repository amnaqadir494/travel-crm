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
    followUpNotes: { type: DataTypes.JSON },
    documents: { type: DataTypes.JSON },
    createdBy: { type: DataTypes.STRING },
    updatedBy: { type: DataTypes.STRING },
    createdAtTime: { type: DataTypes.STRING },
    updatedAtTime: { type: DataTypes.STRING },
    assignedVisa: { type: DataTypes.STRING },
    assignedTicketing: { type: DataTypes.STRING },
    assignedFinance: { type: DataTypes.STRING },
    assignedTour: { type: DataTypes.STRING }
}, {
    tableName: 'Leads',
    timestamps: false
});

sequelize.authenticate()
    .then(async () => {
        console.log("✅ Connected to PostgreSQL Successfully");
        try {
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "followUpNotes" JSON;');
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "documents" JSON;');
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "createdBy" VARCHAR(255);');
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "updatedBy" VARCHAR(255);');
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "createdAtTime" VARCHAR(255);');
            await sequelize.query('ALTER TABLE "Leads" ADD COLUMN IF NOT EXISTS "updatedAtTime" VARCHAR(255);');
            console.log("✅ Lead tracking columns verified/added successfully via code");
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

// 🔧 NEW HELPER: har jagah se yehi function use hoga taake createdBy/updatedBy
// KABHI bhi "System"/null na bane jab tak user actually logged in hai.
// Agar req.user.name na mile to email se fallback karega, department na ho to bhi chalega.
function buildActorLabel(req) {
    if (!req.user) {
        console.log("⚠️ buildActorLabel: req.user is MISSING! Token decode ya middleware order check karein.");
        return 'Unknown';
    }
    const namePart = req.user.name || req.user.email || `User#${req.user.id}`;
    const deptPart = req.user.department ? ` (${req.user.department})` : '';
    const label = `${namePart}${deptPart}`;
    console.log("🕵️ buildActorLabel -> req.user:", req.user, "=> label:", label);
    return label;
}

// 🔧 NEW HELPER: server ke OS timezone/locale pe depend nahi karta —
// hamesha Pakistan (Asia/Karachi) time deta hai. AM/PM khud manually
// calculate karte hain (24-hour value se) taake Node.js ke Intl/ICU
// wale "hour12: true" bug se bacha ja sake (jo kabhi kabhi PM ko
// galat tarah AM dikha deta hai).
function getFormattedDateTime() {
    const now = new Date();

    // Pakistan timezone mein 24-hour (h23) values nikalte hain — yeh
    // hamesha sahi hoti hain, koi AM/PM ambiguity nahi hoti isme.
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Karachi',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23'
    }).formatToParts(now);

    const map = {};
    parts.forEach(p => { map[p.type] = p.value; });

    const hour24 = parseInt(map.hour, 10);
    const ampm = hour24 >= 12 ? 'PM' : 'AM';
    let hour12 = hour24 % 12;
    if (hour12 === 0) hour12 = 12;
    const hour12Str = String(hour12).padStart(2, '0');

    return `${map.month}/${map.day}/${map.year}, ${hour12Str}:${map.minute}:${map.second} ${ampm}`;
}

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
            return res.status(401).json({ error: "Account not activated yet." });
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
            return res.status(400).json({ error: "This account is already activated." });
        }

        if (!isStrongPassword(newPassword)) {
            return res.status(400).json({ error: "Password must include uppercase, lowercase, number, and special character." });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await foundUser.update({ password: hashedPassword });

        res.json({ message: "Account activated successfully!" });
    } catch (err) {
        console.error("❌ Activation Error:", err);
        res.status(500).json({ error: "Activation failed: " + err.message });
    }
});

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

        const { name, email, phone, destination, source } = req.body;
        const numberOfPersons = parseInt(req.body.numberOfPersons) || 1;
        const creatorName = buildActorLabel(req);
        const currentDateTime = getFormattedDateTime();

        let passengersMeta = [];
        if (req.body.passengers) {
            try { passengersMeta = JSON.parse(req.body.passengers); } catch (e) { passengersMeta = []; }
        }

        const newLead = await LeadPSQL.create({
            name, email,
            phone: phone || '',
            destination: destination || '',
            source: source || 'Direct',
            numberOfPersons,
            passengers: passengersMeta,
            followUpNotes: [],
            documents: [],
            createdBy: creatorName,
            updatedBy: creatorName,
            createdAtTime: currentDateTime,
            updatedAtTime: currentDateTime
        });

        console.log("✅ Lead created with createdBy =", newLead.createdBy, "| createdAtTime =", newLead.createdAtTime);

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
        const modifierName = buildActorLabel(req);
        const currentDateTime = getFormattedDateTime();

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

        await leadToUpdate.update({ 
            numberOfPersons, 
            passengers, 
            followUpNotes, 
            documents,
            createdBy: leadToUpdate.createdBy || modifierName,
            updatedBy: modifierName,
            createdAtTime: leadToUpdate.createdAtTime || currentDateTime,
            updatedAtTime: currentDateTime 
        });

        console.log("✅ Lead updated with updatedBy =", leadToUpdate.updatedBy, "| updatedAtTime =", leadToUpdate.updatedAtTime);

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

        const modifierName = buildActorLabel(req);
        const currentDateTime = getFormattedDateTime();
        
        await leadToUpdate.update({ 
            [field]: value, 
            updatedBy: modifierName, 
            updatedAtTime: currentDateTime 
        });
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

        const modifierName = buildActorLabel(req);
        const currentDateTime = getFormattedDateTime();

        await leadToUpdate.update({ 
            source: req.body.source, 
            updatedBy: modifierName, 
            updatedAtTime: currentDateTime 
        });
        res.json(leadToUpdate);
    } catch (err) {
        console.error("❌ Source Update Error:", err);
        res.status(500).json({ error: "Failed to update source" });
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