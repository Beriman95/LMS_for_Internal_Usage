
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { readDb, writeDb, uuid } = require('./utils/db');
const { generateExamPdf } = require('./utils/pdfGenerator');
const { sendResultEmail } = require('./utils/emailSender');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Large limit for exam result JSONs
app.use(express.static(path.join(__dirname, '../public')));

// Helpers
function getUserByToken(data, token) {
    const session = data.sessions.find(s => s.token === token);
    if (!session) return null;

    // Check expiry
    const now = new Date();
    const expiry = new Date(session.expires_at);
    if (expiry < now) return null;

    return data.users.find(u => u.id === session.user_id);
}

// --- ROUTES ---

// 1. REGISTER
app.post('/api/register', (req, res) => {
    const { email, name } = req.body;
    if (!email || !name) return res.json({ success: false, error: 'Missing fields' });

    const db = readDb();
    const existing = db.users.find(u => u.email === email);
    if (existing) return res.json({ success: false, error: 'Email already exists' });

    const userId = uuid();
    const newUser = {
        id: userId,
        email,
        name,
        role: 'trainee',
        created_at: new Date().toISOString()
    };
    db.users.push(newUser);

    // Create Session
    const token = uuid();
    const expires = new Date();
    expires.setHours(expires.getHours() + 8);

    db.sessions.push({
        token,
        user_id: userId,
        expires_at: expires.toISOString()
    });

    writeDb(db);
    res.json({ success: true, token, user: newUser });
});

// 2. LOGIN
app.post('/api/login', (req, res) => {
    const { email } = req.body;
    if (!email) return res.json({ success: false, error: 'Missing credentials' });

    const db = readDb();
    const user = db.users.find(u => u.email === email);
    if (!user) return res.json({ success: false, error: 'User not found' });

    const token = uuid();
    const expires = new Date();
    expires.setHours(expires.getHours() + 8);

    db.sessions.push({
        token,
        user_id: user.id,
        expires_at: expires.toISOString()
    });

    writeDb(db);
    res.json({ success: true, token, user });
});

// 3. GET ME
app.post('/api/getMe', (req, res) => {
    const { token } = req.body;
    const db = readDb();
    const user = getUserByToken(db, token);
    if (!user) return res.json({ success: false, error: 'Unauthorized' });
    res.json({ success: true, user });
});

// 4. SAVE PROGRESS
app.post('/api/saveProgress', (req, res) => {
    const { token, moduleId, track, completed, xp } = req.body;
    const db = readDb();
    const user = getUserByToken(db, token);
    if (!user) return res.json({ success: false, error: 'Unauthorized' });

    const trk = (track || 'L1').toUpperCase();
    const existingIdx = db.progress.findIndex(p => p.user_id === user.id && p.module_id === moduleId);

    const now = new Date().toISOString();

    if (existingIdx >= 0) {
        db.progress[existingIdx].track = trk;
        db.progress[existingIdx].completed = !!completed;
        db.progress[existingIdx].xp = Number(xp);
        db.progress[existingIdx].updated_at = now;
    } else {
        db.progress.push({
            user_id: user.id,
            track: trk,
            module_id: moduleId,
            completed: !!completed,
            xp: Number(xp),
            updated_at: now
        });
    }

    writeDb(db);
    res.json({ success: true });
});

// 5. GET PROGRESS
app.post('/api/getProgress', (req, res) => {
    const { token, track } = req.body;
    const db = readDb();
    const user = getUserByToken(db, token);
    if (!user) return res.json({ success: false, error: 'Unauthorized' });

    const trk = (track || '').toUpperCase();
    const items = db.progress
        .filter(p => p.user_id === user.id && (!trk || p.track === trk))
        .map(p => ({
            track: p.track,
            moduleId: p.module_id,
            completed: p.completed,
            xp: p.xp,
            updatedAt: p.updated_at
        }));

    res.json({ success: true, progress: items });
});

// 6. SAVE EXAM ATTEMPT
app.post('/api/saveExamAttempt', async (req, res) => {
    const { token, examType, score, passed, answers, startedAt, finishedAt } = req.body;
    const db = readDb();
    const user = getUserByToken(db, token);
    if (!user) return res.json({ success: false, error: 'Unauthorized' });

    // Calculate attempt No
    const userAttempts = db.examAttempts.filter(a => a.user_id === user.id && a.exam_type === examType);
    const attemptNo = userAttempts.length + 1;

    const start = startedAt ? new Date(startedAt) : new Date();
    const end = finishedAt ? new Date(finishedAt) : new Date();
    const duration = Math.round((end.getTime() - start.getTime()) / 1000);

    const newAttempt = {
        user_id: user.id,
        exam_type: examType,
        score: Number(score),
        passed: !!passed,
        answers_json: JSON.stringify(answers || {}), // keeping legacy format support just in case, but usually we'd store object
        answers: answers || {},
        started_at: start.toISOString(),
        finished_at: end.toISOString(),
        trainee_email: answers?.email || user.email,
        trainee_name: answers?.name || user.name,
        theory_percent: answers?.theoryPercent || 0,
        simulation_percent: answers?.simulationPercent || 0,
        final_passed: !!answers?.passed,
        attempt_no: attemptNo,
        duration_seconds: duration
    };

    db.examAttempts.push(newAttempt);
    writeDb(db);

    // --- PDF & EMAIL ---
    let emailPreviewUrl = null;
    try {
        console.log('Generating PDF...');
        const pdfBuffer = await generateExamPdf(newAttempt);

        if (pdfBuffer) {
            console.log('Sending Email...');
            const resultLabel = newAttempt.passed ? 'SIKERES' : 'SIKERTELEN';
            const emailResult = await sendResultEmail(newAttempt.trainee_email, newAttempt.trainee_name, resultLabel, pdfBuffer);
            if (emailResult && emailResult.preview) {
                emailPreviewUrl = emailResult.preview;
            }
        }
    } catch (err) {
        console.error('Async task (PDF/Email) failed:', err);
    }

    res.json({ success: true, emailPreview: emailPreviewUrl });
});

// 7. DASHBOARD SUMMARY
app.post('/api/getDashboardSummary', (req, res) => {
    const { token } = req.body;
    const db = readDb();
    const user = getUserByToken(db, token);

    // Auth check - allow admin/trainer
    if (!user || (user.role !== 'admin' && user.role !== 'trainer')) {
        return res.json({ success: false, error: 'Unauthorized' });
    }

    // Aggregate data
    const summary = db.users.map(u => {
        const uProg = db.progress.filter(p => p.user_id === u.id);
        const uExams = db.examAttempts.filter(a => a.user_id === u.id);

        // Simple aggregation logic matching GAS
        const completedMods = uProg.filter(p => p.completed).length;
        const totalXp = uProg.reduce((sum, p) => sum + (p.xp || 0), 0);

        // Get last exam info
        const sortedExams = uExams.sort((a, b) => new Date(b.finished_at) - new Date(a.finished_at));
        const lastExam = sortedExams[0];

        return {
            userId: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            totalXp,
            modulesCompleted: completedMods,
            lastProgressAt: uProg.length ? uProg[uProg.length - 1].updated_at : null,
            lastExamAt: lastExam ? lastExam.finished_at : null,
            lastExamScore: lastExam ? (lastExam.theory_percent) : 0, // Simplified
            attemptsCount: uExams.length
        };
    });

    res.json({ success: true, items: summary });
});

// 8. CONTENT API - MODULES
app.post('/api/getModules', (req, res) => {
    // Optional: Add auth check if needed, but trainees need modules too.
    const db = readDb();
    const modules = db.modules || [];
    // Sort logic if needed?
    // Users might want them sorted by ID or index.
    // For now return as is.
    res.json({ success: true, modules });
});

app.post('/api/saveModuleContent', (req, res) => {
    const { token, id, content } = req.body;
    const db = readDb();
    const user = getUserByToken(db, token);
    if (!user || (user.role !== 'admin' && user.role !== 'trainer')) {
        return res.json({ success: false, error: 'Unauthorized' });
    }

    const modIdx = (db.modules || []).findIndex(m => m.id === id);
    if (modIdx >= 0) {
        db.modules[modIdx].content = content;
        writeDb(db);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Module not found' });
    }
});

app.post('/api/createModule', (req, res) => {
    const { token, id, title, icon, readTime, content, quizzes } = req.body;
    const db = readDb();
    const user = getUserByToken(db, token);
    if (!user || (user.role !== 'admin' && user.role !== 'trainer')) {
        return res.json({ success: false, error: 'Unauthorized' });
    }

    if (!db.modules) db.modules = [];
    if (db.modules.find(m => m.id === id)) {
        return res.json({ success: false, error: 'Module ID already exists' });
    }

    db.modules.push({
        id,
        title,
        icon,
        readTime, // Storing as camelCase to match frontend
        content,
        quizzes: quizzes || [],
        track: (id && id.includes('L2')) ? 'L2' : 'L1' // Infer track
    });

    writeDb(db);
    res.json({ success: true });
});

app.post('/api/deleteModule', (req, res) => {
    const { token, id } = req.body;
    const db = readDb();
    const user = getUserByToken(db, token);
    if (!user || (user.role !== 'admin' && user.role !== 'trainer')) {
        return res.json({ success: false, error: 'Unauthorized' });
    }

    if (!db.modules) return res.json({ success: false, error: 'No modules' });

    const initialLen = db.modules.length;
    db.modules = db.modules.filter(m => m.id !== id);

    if (db.modules.length < initialLen) {
        writeDb(db);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Module not found' });
    }
});

app.post('/api/updateModuleMetadata', (req, res) => {
    const { token, id, title, icon, readTime } = req.body;
    const db = readDb();
    const user = getUserByToken(db, token);
    if (!user || (user.role !== 'admin' && user.role !== 'trainer')) {
        return res.json({ success: false, error: 'Unauthorized' });
    }

    const modIdx = (db.modules || []).findIndex(m => m.id === id);
    if (modIdx >= 0) {
        db.modules[modIdx].title = title;
        db.modules[modIdx].icon = icon;
        db.modules[modIdx].readTime = readTime;
        writeDb(db);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Module not found' });
    }
});

// 9. CONTENT API - QUESTIONS
app.post('/api/getQuestions', (req, res) => {
    const { token } = req.body;
    const db = readDb();
    const user = getUserByToken(db, token);
    // Trainees might not need full question bank, but logic.js loads it for Exam.
    // Ideally we should filter or secure this, but for now allow logged in users.
    if (!user) return res.json({ success: false, error: 'Unauthorized' });

    res.json({ success: true, questions: db.questions || [] });
});

app.post('/api/saveQuestion', (req, res) => {
    const { token, question } = req.body; // question is the object
    const db = readDb();
    const user = getUserByToken(db, token);
    if (!user || (user.role !== 'admin' && user.role !== 'trainer')) {
        return res.json({ success: false, error: 'Unauthorized' });
    }

    if (!db.questions) db.questions = [];

    // Check if new or edit
    const qIdx = db.questions.findIndex(q => q.id === question.id);
    if (qIdx >= 0) {
        db.questions[qIdx] = { ...db.questions[qIdx], ...question };
    } else {
        // Ensure ID
        if (!question.id) question.id = 'q_' + Date.now();
        db.questions.push(question);
    }

    writeDb(db);
    res.json({ success: true, id: question.id });
});

app.post('/api/deleteQuestion', (req, res) => {
    const { token, id } = req.body;
    const db = readDb();
    const user = getUserByToken(db, token);
    if (!user || (user.role !== 'admin' && user.role !== 'trainer')) {
        return res.json({ success: false, error: 'Unauthorized' });
    }

    if (!db.questions) return res.json({ success: false, error: 'No questions' });

    const initialLen = db.questions.length;
    db.questions = db.questions.filter(q => q.id !== id);

    if (db.questions.length < initialLen) {
        writeDb(db);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'Question not found' });
    }
});

// 10. ADMIN - USER MANAGEMENT
app.post('/api/getUsers', (req, res) => {
    const { token } = req.body;
    const db = readDb();
    const user = getUserByToken(db, token);
    if (!user || user.role !== 'admin') {
        return res.json({ success: false, error: 'Unauthorized' });
    }

    // Return users without sensitive data? Or minimal.
    // lowdb stores everything. Let's return safe fields.
    const cleanUsers = db.users.map(u => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        created_at: u.created_at
    }));

    res.json({ success: true, users: cleanUsers });
});

app.post('/api/updateUserRole', (req, res) => {
    const { token, targetUserId, newRole } = req.body;
    const db = readDb();
    const user = getUserByToken(db, token);
    if (!user || user.role !== 'admin') {
        return res.json({ success: false, error: 'Unauthorized' });
    }

    const targetUser = db.users.find(u => u.id === targetUserId);
    if (targetUser) {
        targetUser.role = newRole;
        writeDb(db);
        res.json({ success: true });
    } else {
        res.json({ success: false, error: 'User not found' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`- API available at /api/...`);
    console.log(`- Frontend available at /`);
});
