
// =========================
// GOOGLE APPS SCRIPT CONFIG
// =========================


// =========================
// LOADING INDICATOR SYSTEM
// =========================

const LoadingMessages = {
    'register': 'Regisztráció...',
    'login': 'Bejelentkezés...',
    'getMe': 'Felhasználó betöltése...',
    'getProgress': 'Haladás betöltése...',
    'saveProgress': 'Mentés...',
    'saveExamAttempt': 'Eredmények küldése...',
    'listExamResults': 'Eredmények betöltése...',
    'getDashboardSummary': 'Dashboard betöltése...',
    'getModules': 'Modulok betöltése...',
    'saveModuleContent': 'Modul mentése...',
    'createModule': 'Modul létrehozása...',
    'deleteModule': 'Modul törlése...',
    'updateModuleMetadata': 'Metaadatok mentése...',
    'getQuestions': 'Kérdések betöltése...',
    'createQuestion': 'Kérdés létrehozása...',
    'saveQuestion': 'Kérdés mentése...',
    'deleteQuestion': 'Kérdés törlése...',
    'getExamConfig': 'Vizsga konfiguráció...',
    'default': 'Betöltés...'
};

function showLoading(message, subtext = '') {
    const overlay = document.getElementById('loadingOverlay');
    const textEl = document.getElementById('loadingText');
    const subtextEl = document.getElementById('loadingSubtext');

    if (overlay) {
        if (textEl) textEl.textContent = message || 'BETÖLTÉS...';
        if (subtextEl) subtextEl.textContent = subtext;
        overlay.classList.add('active');
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

function setButtonLoading(button, loading) {
    if (!button) return;
    if (loading) {
        button.classList.add('btn-loading');
        button.disabled = true;
    } else {
        button.classList.remove('btn-loading');
        button.disabled = false;
    }
}

// Returns a loading card HTML for content areas
function getLoadingCardHTML(message = 'Betöltés...') {
    return `
        <div class="loading-card">
            <div class="loading-spinner"></div>
            <div class="loading-card-text">${message}</div>
        </div>
    `;
}

// Egységes API hívó with optional loading indicator
async function apiCall(action, body, options = {}) {
    const { showGlobalLoading = false, loadingMessage = null } = options;

    if (showGlobalLoading) {
        const msg = loadingMessage || LoadingMessages[action] || LoadingMessages['default'];
        showLoading(msg);
    }

    try {
        const res = await fetch('/api/' + action, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error('Nem sikerült JSON-ként értelmezni a választ:', text);
            return { success: false, error: 'Invalid JSON from server' };
        }
    } finally {
        if (showGlobalLoading) {
            hideLoading();
        }
    }
}



// Auth state
let authToken = null;
let currentUser = null;

function setAuth(token, user) {
    authToken = token;
    currentUser = user;
    localStorage.setItem('rh_token', token);
    localStorage.setItem('rh_user', JSON.stringify(user || {}));
    updateTrainerUIForRole(user);
}
function updateTrainerUIForRole(user) {
    const panel = document.getElementById('trainerPanel');
    if (!panel) return;

    const role = user && user.role;
    if (role === 'trainer' || role === 'admin') {
        panel.style.display = 'block';
    } else {
        panel.style.display = 'none';
    }
}



// Trainee data (UI)
let traineeName = "";
let traineeEmail = "";

// Answer tracking
let theoryAnswers = [];
let simulationAnswers = [];

// Track settings
let currentTrack = localStorage.getItem('rh_track') || 'L1';

// Dupla-kattintás védelem a vizsga küldésére
let isSendingResults = false;

// =========================
// DYNAMIC MODULE SYSTEM
// =========================

// This will hold the active modules (from server or fallback)
let dynamicModules = [];
let modulesLoadedFromServer = false;

/**
 * Load modules from Google Sheets, fallback to adatok.js
 */
async function loadDynamicModules() {
    console.log('Loading modules...');

    try {
        const res = await apiCall('getModules', { track: currentTrack });

        if (res && res.success && Array.isArray(res.modules) && res.modules.length > 0) {
            // Server modules loaded successfully
            dynamicModules = res.modules
                .filter(m => !m.track || m.track === currentTrack) // Filter by current track
                .map((m, idx) => ({
                    id: m.id || `module_${idx}`,
                    title: m.title || `Modul ${idx + 1}`,
                    icon: m.icon || 'fa-book',
                    readTime: m.readTime || m.read_time || '10 perc',
                    content: m.content || m.content_html || '<p>Tartalom betöltése sikertelen.</p>',
                    quizzes: parseQuizzes(m.quizzes || m.quizzes_json || '[]')
                }));
            modulesLoadedFromServer = true;
            console.log('Modules loaded from server:', dynamicModules.length);
            return true;
        }
    } catch (e) {
        console.warn('Server module load failed:', e);
    }

    // Fallback to adatok.js
    if (typeof trainingModules !== 'undefined' && trainingModules.length > 0) {
        dynamicModules = trainingModules.filter(m => m.track === currentTrack);
        modulesLoadedFromServer = false;
        console.log('Using fallback modules from adatok.js:', dynamicModules.length);
        return true;
    }

    console.error('No modules available!');
    return false;
}

/**
 * Parse quizzes from JSON string or return array as-is
 */
function parseQuizzes(quizzes) {
    if (Array.isArray(quizzes)) return quizzes;
    if (typeof quizzes === 'string') {
        try {
            return JSON.parse(quizzes);
        } catch (e) {
            return [];
        }
    }
    return [];
}

/**
 * Get the active modules array (use this instead of trainingModules directly)
 */
function getModules() {
    return dynamicModules.length > 0 ? dynamicModules : (typeof trainingModules !== 'undefined' ? trainingModules : []);
}

// =========================
// STORAGE MANAGER (MENTÉS)
// =========================

const STORAGE_KEY = 'rh_academy_save_v1';

// Lokális + szerveres mentés
async function saveProgress() {
    const modules = getModules();
    const state = {
        traineeName: traineeName,
        traineeEmail: traineeEmail,
        xp: xp,
        currentModuleIndex: currentModuleIndex,
        modulesCompleted: Array.from(modulesCompleted)
    };
    // Lokális cache
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    console.log("Állapot mentve (local).");

    // Szerver – ha van token
    const token = authToken || localStorage.getItem('rh_token');
    if (!token) return;

    try {
        const moduleId = modules[currentModuleIndex]?.id || String(currentModuleIndex);
        await apiCall('saveProgress', {
            token,
            track: 'L1',
            moduleId,
            completed: modulesCompleted.has(currentModuleIndex),
            xp
        });
        console.log("Állapot mentve (server).");
    } catch (err) {
        console.error("Szerver mentés hiba:", err);
    }
}

// Régi localStorage betöltés – _fallback_, ha még nincs szerveres acc
function loadProgress() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return false;

    try {
        const state = JSON.parse(saved);
        traineeName = state.traineeName || "";
        traineeEmail = state.traineeEmail || "";
        xp = state.xp || 0;
        currentModuleIndex = Math.min(
            state.currentModuleIndex || 0,
            trainingModules.length - 1
        );
        modulesCompleted = new Set(state.modulesCompleted || []);
        return true;
    } catch (e) {
        console.error("Hiba a mentés betöltésekor:", e);
        return false;
    }
}

function resetProgress() {
    if (confirm("Biztosan törlöd az eddigi haladást és elölről kezded?")) {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('rh_token');
        localStorage.removeItem('rh_user');
        location.reload();
    }
}


// Validation and start
async function loginOrRegister(name, email) {
    const fixedPassword = 'techops_academy';

    // 1) Próbáljunk regisztrálni
    let res = await apiCall('register', {
        name,
        email,
        password: fixedPassword
    });

    // Ha már létezik, akkor login
    if (!res.success && res.error === 'Email already exists') {
        res = await apiCall('login', {
            email,
            password: fixedPassword
        });
    }

    // Ha regisztráció sikeres, de nem adott vissza tokent, akkor login
    if (res.success && !res.token) {
        const loginRes = await apiCall('login', {
            email,
            password: fixedPassword
        });
        if (!loginRes.success) {
            throw new Error(loginRes.error || 'Login failed');
        }
        return loginRes;
    }

    if (!res.success) {
        throw new Error(res.error || 'Auth failed');
    }

    return res;
}


// Validation + auth + start
async function validateAndStart() {
    console.log("validateAndStart CALLED"); // DEBUG
    alert("Button clicked!"); // DEBUG: Immediate visual feedback
    const name = document.getElementById('traineeName').value.trim();
    const email = document.getElementById('traineeEmail').value.trim();
    const errorDiv = document.getElementById('registrationError');
    const startButton = document.querySelector('#startScreen .btn-primary');

    // Név ellenőrzés
    if (!name || name.length < 2) {
        errorDiv.textContent = "Kérjük, add meg a teljes neved!";
        errorDiv.style.display = "block";
        document.getElementById('traineeName').focus();
        return;
    }

    // E-mail ellenőrzés
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
        errorDiv.textContent = "Kérjük, adj meg egy érvényes e-mail címet!";
        errorDiv.style.display = "block";
        document.getElementById('traineeEmail').focus();
        return;
    }

    errorDiv.style.display = "none";
    showLoading('BEJELENTKEZÉS...', 'Felhasználó azonosítása');

    try {
        // Auth a backend felé
        const authRes = await loginOrRegister(name, email);
        setAuth(authRes.token, authRes.user);

        // Trainee adatok lokálisan is
        traineeName = name;
        traineeEmail = email;

        // Ha van korábbi szerveres progress, húzzuk le
        showLoading('HALADÁS BETÖLTÉSE...', 'Korábbi mentés keresése');
        try {
            const progRes = await apiCall('getProgress', { token: authRes.token, track: 'L1' });
            if (progRes.success && Array.isArray(progRes.progress)) {
                // Egyszerű logika: ha bármely modul completed, tedd completed-be,
                // XP-t vedd át a legutóbbi sorból (vagy max-ból).
                let maxXp = 0;
                let lastModuleIndex = 0;
                const completedSet = new Set();
                progRes.progress.forEach(p => {
                    const idx = trainingModules.findIndex(m => m.id === p.moduleId);
                    if (idx >= 0) {
                        if (p.completed) completedSet.add(idx);
                        if (typeof p.xp === 'number' && p.xp > maxXp) {
                            maxXp = p.xp;
                        }
                        if (p.completed && idx > lastModuleIndex) {
                            lastModuleIndex = idx;
                        }
                    }
                });
                xp = maxXp;
                modulesCompleted = completedSet;
                currentModuleIndex = lastModuleIndex;
            }
        } catch (e) {
            console.warn("Progress lekérés hiba (nem kritikus):", e);
        }

        hideLoading();
        startTraining();
    } catch (e) {
        hideLoading();
        console.error(e);
        errorDiv.textContent = e.message || "Hiba a bejelentkezésnél.";
        errorDiv.style.display = "block";
        alert("Hiba történt: " + (e.message || "Ismeretlen hiba"));
    }
}


// =========================
// 2. ÁLLAPOT
// =========================
let currentModuleIndex = 0;
let xp = 0;
let rank = "Cadet";
let modulesCompleted = new Set();

// =========================
// 3. INIT
// =========================

async function startTraining() {
    // Hide the start/registration screen
    document.getElementById('startScreen').style.display = 'none';

    showLoading('MODULOK BETÖLTÉSE...', 'Képzési anyagok előkészítése');

    // Load modules from server (with fallback to adatok.js)
    const modulesLoaded = await loadDynamicModules();

    if (!modulesLoaded || getModules().length === 0) {
        hideLoading();
        alert('Hiba: Nem sikerült betölteni a modulokat. Kérjük, frissítsd az oldalt.');
        return;
    }

    hideLoading();

    // Initialize the training interface
    init();
}

function init() {
    renderSidebar();
    loadModule(currentModuleIndex);
}

// Szerveres auto-resume, ha van token
async function autoResumeFromServer() {
    const token = localStorage.getItem('rh_token');
    if (!token) return false;

    showLoading('FOLYTATÁS...', 'Korábbi munkamenet visszaállítása');

    try {
        const meRes = await apiCall('getMe', { token });
        if (!meRes.success) {
            hideLoading();
            return false;
        }

        setAuth(token, meRes.user);
        traineeName = meRes.user.name || "";
        traineeEmail = meRes.user.email || "";

        // Load modules first
        showLoading('MODULOK BETÖLTÉSE...', traineeName);
        await loadDynamicModules();

        const modules = getModules();

        showLoading('HALADÁS BETÖLTÉSE...', traineeName);

        // Szerver progress
        const progRes = await apiCall('getProgress', { token, track: 'L1' });
        if (progRes.success && Array.isArray(progRes.progress)) {
            let maxXp = 0;
            let lastModuleIndex = 0;
            const completedSet = new Set();
            progRes.progress.forEach(p => {
                const idx = modules.findIndex(m => m.id === p.moduleId);
                if (idx >= 0) {
                    if (p.completed) completedSet.add(idx);
                    if (typeof p.xp === 'number' && p.xp > maxXp) {
                        maxXp = p.xp;
                    }
                    if (p.completed && idx > lastModuleIndex) {
                        lastModuleIndex = idx;
                    }
                }
            });
            xp = maxXp;
            modulesCompleted = completedSet;
            currentModuleIndex = lastModuleIndex;
        }

        // UI mezők kitöltése
        document.getElementById('traineeName').value = traineeName;
        document.getElementById('traineeEmail').value = traineeEmail;

        hideLoading();

        // Skip startTraining's module loading since we already loaded them
        document.getElementById('startScreen').style.display = 'none';
        init();

        return true;
    } catch (e) {
        hideLoading();
        console.warn("Auto-resume hiba:", e);
        return false;
    }
}

// Auto-load on startup
window.onload = async function () {
    // 1) Próbáljunk szerverről visszaállni
    const resumed = await autoResumeFromServer();
    if (resumed) return;

    // 2) Ha nincs szerveres state, próbáljuk a régi localStorage-ot
    if (loadProgress()) {
        document.getElementById('traineeName').value = traineeName;
        document.getElementById('traineeEmail').value = traineeEmail;
        startTraining();
    }
};

function renderSidebar() {
    const list = document.getElementById('moduleList');
    list.innerHTML = '';

    const modules = getModules();

    modules.forEach((mod, index) => {
        const li = document.createElement('li');

        let statusClass = '';
        if (index === currentModuleIndex) statusClass = 'active';
        else if (modulesCompleted.has(index)) statusClass = 'completed';
        else if (index > 0 && !modulesCompleted.has(index - 1)) statusClass = 'locked';

        li.className = `module-item ${statusClass}`;

        if (!statusClass.includes('locked')) {
            li.onclick = () => loadModule(index);
        }

        const iconHtml = mod.icon && mod.icon.includes('.')
            ? `<img src="${mod.icon}" style="width:22px; margin-right:10px;">`
            : `<i class="fas ${mod.icon || 'fa-book'}" style="margin-right:12px; width:20px; text-align:center;"></i>`;

        li.innerHTML = `
                <div style="display:flex; align-items:center;">
                    ${iconHtml}
                    <div>
                        <div style="font-weight:bold; font-size:0.9rem;">${mod.title}</div>
                        <div style="font-size:0.75rem; opacity:0.7;">${mod.readTime || ''}</div>
                    </div>
                </div>
                ${modulesCompleted.has(index) ? '<i class="fas fa-check-circle" style="color:var(--success)"></i>' :
                (statusClass.includes('locked') ? '<i class="fas fa-lock"></i>' : '')}
            `;

        list.appendChild(li);
    });

    const progress = Math.round((modulesCompleted.size / modules.length) * 100);
    document.getElementById('globalProgress').style.width = progress + '%';
    document.getElementById('xp-display').innerText = xp + ' XP';

    if (xp >= 1200) rank = "Officer";
    if (xp >= 2200) rank = "Commander";
    document.getElementById('rank-display').innerText = rank;

    // Reset button
    const userPanel = document.querySelector('.user-panel');

    // Megnézzük, van-e már ilyen ID-jú elem
    if (!document.getElementById('reset-container')) {
        const resetDiv = document.createElement('div');
        resetDiv.id = 'reset-container'; // EGYEDI AZONOSÍTÓT ADUNK NEKI
        resetDiv.style.marginTop = '15px';
        resetDiv.style.textAlign = 'center';
        resetDiv.innerHTML = `
               <button onclick="resetProgress()" style="background:none; border:none; color: rgba(255,255,255,0.5); cursor:pointer; font-size:0.8rem;">
                   <i class="fas fa-trash"></i> Progress törlése
               </button>
            `;
        userPanel.appendChild(resetDiv);
    }
}

// =========================
// 4. MODUL BETÖLTÉSE + QUIZ
// =========================
function loadModule(index) {
    const modules = getModules();
    currentModuleIndex = index;
    const mod = modules[index];

    if (!mod) {
        console.error('Module not found at index:', index);
        return;
    }

    const container = document.getElementById('mainContent');
    container.scrollTop = 0;

    // Handle quizzes - could be array or need parsing
    const quizzes = parseQuizzes(mod.quizzes || []);

    let quizHtml = '';
    quizzes.forEach((q, i) => {
        quizHtml += `
                <div class="question-card" id="qcard-${index}-${i}">
                    <div style="font-weight:bold; margin-bottom:15px;">Kérdés ${i + 1}/${quizzes.length}: ${q.q || q.question || ''}</div>
                    ${(q.options || []).map((opt, optIndex) => `
                        <div class="q-option" onclick="handleAnswer(${index}, ${i}, ${optIndex}, this)">
                            <div style="width:15px; height:15px; border-radius:50%; border:2px solid #cbd5e0;"></div>
                            ${opt}
                        </div>
                    `).join('')}
                    <div id="feedback-${index}-${i}" style="margin-top:15px; font-weight:bold;"></div>
                </div>
            `;
    });

    container.innerHTML = `
            <div class="content-card">
                ${mod.content || '<p>Nincs tartalom.</p>'}
                <div class="quiz-section">
                    <h2><i class="fas fa-clipboard-check"></i> Ellenőrzőpont: ${mod.title}</h2>
                    <p>Válaszolj helyesen az összes kérdésre a modul teljesítéséhez.</p>
                    ${quizHtml}
                    <button class="btn-primary" id="nextBtn-${index}" style="display:none;" onclick="nextModule()">
                        Modul teljesítve <i class="fas fa-arrow-right"></i>
                    </button>
                </div>
            </div>
        `;

    if (quizzes.length > 0) {
        document.getElementById(`qcard-${index}-0`).classList.add('active');
    } else {
        // No quizzes, show the complete button immediately
        document.getElementById(`nextBtn-${index}`).style.display = 'inline-block';
    }
}

function handleAnswer(modIndex, qIndex, optIndex, element) {
    const modules = getModules();
    const mod = modules[modIndex];
    const quizzes = parseQuizzes(mod.quizzes || []);
    const question = quizzes[qIndex];
    const feedback = document.getElementById(`feedback-${modIndex}-${qIndex}`);
    const parent = element.parentElement;
    const opts = parent.getElementsByClassName('q-option');

    for (let o of opts) o.style.pointerEvents = 'none';

    const correctIndex = question.correct ?? question.correctIndex ?? 0;

    if (optIndex === correctIndex) {
        element.classList.add('correct');
        feedback.innerHTML = `<span style="color:var(--success)">HELYES. ${question.expl || question.explanation || ''}</span>`;

        setTimeout(() => {
            if (qIndex < quizzes.length - 1) {
                document.getElementById(`qcard-${modIndex}-${qIndex}`).style.display = 'none';
                document.getElementById(`qcard-${modIndex}-${qIndex + 1}`).classList.add('active');
            } else {
                if (!modulesCompleted.has(modIndex)) {
                    xp += 250;
                    modulesCompleted.add(modIndex);
                    renderSidebar();
                    saveProgress();
                }
                document.getElementById(`nextBtn-${modIndex}`).style.display = 'inline-block';
            }
        }, 1500);
    } else {
        element.classList.add('wrong');
        feedback.innerHTML = `<span style="color:var(--error)">HIBÁS. Próbáld újra.</span>`;
        setTimeout(() => {
            for (let o of opts) {
                o.style.pointerEvents = 'auto';
                o.classList.remove('wrong');
            }
            feedback.innerHTML = '';
        }, 1700);
    }
}

async function nextModule() {
    const modules = getModules();
    if (currentModuleIndex < modules.length - 1) {
        loadModule(currentModuleIndex + 1);
        saveProgress();
    } else {
        await loadTheoryTest();
    }
}

// =========================
// 5. NAGY ELMÉLETI VIZSGA
// =========================
// Az adatok már az adatok.js fájlból jönnek (theoryQuestions)
// ===== ELMÉLETI VIZSGA - KÉRDÉSBANK RENDSZER =====

let currentTheoryIndex = 0;
let theoryScore = 0;
let activeExamQuestions = [];

// Fisher-Yates shuffle
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Kategória alapú kérdésválasztás
// Kategória alapú kérdésválasztás
function selectExamQuestions() {
    const selected = [];

    // Backendből betöltött config
    const config = window.EXAM_CONFIG || {
        totalQuestions: 18,
        freeTextCount: 3,
        categoryDistribution: {}
    };

    // Kérdésbank: ha van questionBank, azt használjuk, különben régi theoryQuestions
    let bank = [];
    if (typeof questionBank !== 'undefined' && Array.isArray(questionBank) && questionBank.length > 0) {
        bank = questionBank;
    } else if (typeof theoryQuestions !== 'undefined' && Array.isArray(theoryQuestions) && theoryQuestions.length > 0) {
        bank = theoryQuestions;
    } else if (typeof examQuestions !== 'undefined' && Array.isArray(examQuestions) && examQuestions.length > 0) {
        bank = examQuestions;
    } else {
        console.error('Nincs elérhető kérdésbank (questionBank vagy theoryQuestions vagy examQuestions)!');
        return [];
    }

    console.log('Kérdésbank betöltve, összesen:', bank.length, 'kérdés');

    // Kategóriánként csoportosítás (multiple / freetext)
    const byCategory = {};
    bank.forEach(q => {
        const cat = q.category || 'general';
        if (!byCategory[cat]) byCategory[cat] = { multiple: [], freetext: [] };
        // Infer type from ID if missing
        const type = q.type || (q.id && q.id.includes('_ft_') ? 'freetext' : 'multiple');
        if (byCategory[cat][type]) {
            byCategory[cat][type].push(q);
        } else {
            // Fallback if type is weird
            byCategory[cat]['multiple'].push(q);
        }
    });

    // Ha van categoryDistribution, abból dolgozunk
    if (config.categoryDistribution && Object.keys(config.categoryDistribution).length > 0) {
        let freeTextRemaining = config.freeTextCount || 0;

        for (const [category, count] of Object.entries(config.categoryDistribution)) {
            if (!byCategory[category]) continue;

            const catMultiple = shuffleArray(byCategory[category].multiple);
            const catFreetext = shuffleArray(byCategory[category].freetext);

            let added = 0;

            // Először freetext, ha még kell
            while (added < count && freeTextRemaining > 0 && catFreetext.length > 0) {
                selected.push(catFreetext.pop());
                freeTextRemaining--;
                added++;
            }

            // Maradék multiple choice
            while (added < count && catMultiple.length > 0) {
                selected.push(catMultiple.pop());
                added++;
            }
        }

        // Végső keverés
        console.log('Kiválasztott kérdések (kategória alapján):', selected.length);
        return shuffleArray(selected);
    } else {
        // Fallback: sima random válogatás
        const shuffled = shuffleArray(bank);
        const total = config.totalQuestions || 18;
        const result = shuffleArray(shuffled.slice(0, total));
        console.log('Kiválasztott kérdések (random):', result.length);
        return result;
    }
}

async function loadExamConfig() {
    try {
        const res = await apiCall('getExamConfig', {});
        if (res && res.success) {
            window.EXAM_CONFIG = res.config;
            return true;
        } else {
            console.warn('Exam config betöltés sikertelen, alapértelmezett beállítások használata:', res?.error);
            // Use default config if server fails
            window.EXAM_CONFIG = {
                totalQuestions: 18,
                freeTextCount: 3,
                categoryDistribution: {}
            };
            return true;
        }
    } catch (e) {
        console.warn('Exam config API hiba, alapértelmezett beállítások használata:', e);
        // Use default config if server fails
        window.EXAM_CONFIG = {
            totalQuestions: 18,
            freeTextCount: 3,
            categoryDistribution: {}
        };
        return true;
    }
}

async function loadTheoryTest() {
    showLoading('VIZSGA BETÖLTÉSE...', 'Kérdések előkészítése');

    try {
        // Vizsga előtt config betöltés a backendről (with fallback)
        await loadExamConfig();

        currentTheoryIndex = 0;
        theoryScore = 0;
        theoryAnswers = [];

        activeExamQuestions = selectExamQuestions();

        // Check if we have questions
        if (!activeExamQuestions || activeExamQuestions.length === 0) {
            hideLoading();
            const container = document.getElementById('mainContent');
            container.innerHTML = `
                <div class="content-card">
                    <h1><i class="fas fa-exclamation-triangle" style="color: var(--error);"></i> Hiba</h1>
                    <p>Nem sikerült betölteni a vizsgakérdéseket. Kérjük, próbáld újra később.</p>
                    <button class="btn-primary" onclick="loadModule(currentModuleIndex)">
                        <i class="fas fa-arrow-left"></i> Vissza a modulokhoz
                    </button>
                </div>
            `;
            return;
        }

        // Normalize question types (infer from ID if missing)
        activeExamQuestions = activeExamQuestions.map(q => {
            if (!q.type && q.id && q.id.includes('_ft_')) {
                return { ...q, type: 'freetext' };
            }
            return q;
        });

        const multipleCount = activeExamQuestions.filter(q => (q.type || 'multiple') === 'multiple').length;
        const freeTextCount = activeExamQuestions.filter(q => q.type === 'freetext').length;

        hideLoading();

        const container = document.getElementById('mainContent');
        container.scrollTop = 0;
        container.innerHTML = `
            <div class="content-card">
                <h1><i class="fas fa-file-alt"></i> Összefoglaló elméleti vizsga</h1>
                <p>Válaszolj a kérdésekre. A sikeres teljesítéshez legalább <b>80%</b> helyes válasz szükséges.</p>
                <div style="background: var(--rh-light); padding: 15px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0; font-size: 0.95rem;">
                        <i class="fas fa-random"></i> <b>${activeExamQuestions.length}</b> kérdés a kérdésbankból
                        &nbsp;|&nbsp;
                        <i class="fas fa-list"></i> ${multipleCount} feleletválasztós
                        &nbsp;|&nbsp;
                        <i class="fas fa-keyboard"></i> ${freeTextCount} szöveges
                    </p>
                </div>
                <div id="theoryQuestionArea"></div>
            </div>
        `;
        renderTheoryQuestion(0);
    } catch (e) {
        hideLoading();
        console.error('loadTheoryTest hiba:', e);
        const container = document.getElementById('mainContent');
        container.innerHTML = `
            <div class="content-card">
                <h1><i class="fas fa-exclamation-triangle" style="color: var(--error);"></i> Hiba</h1>
                <p>Hiba történt a vizsga betöltése közben: ${e.message || 'Ismeretlen hiba'}</p>
                <button class="btn-primary" onclick="loadModule(currentModuleIndex)">
                    <i class="fas fa-arrow-left"></i> Vissza a modulokhoz
                </button>
                <button class="btn-secondary" onclick="loadTheoryTest()" style="margin-left: 10px;">
                    <i class="fas fa-redo"></i> Újrapróbálás
                </button>
            </div>
        `;
    }
}

function renderTheoryQuestion(index) {
    const qObj = activeExamQuestions[index];
    console.log('Rendering Question:', index, qObj); // DEBUG
    if (!qObj) {
        console.error('Nincs kérdés az indexen:', index);
        return;
    }

    const total = activeExamQuestions.length;
    const area = document.getElementById('theoryQuestionArea');
    if (!area) {
        console.error('Nincs theoryQuestionArea elem!');
        return;
    }

    const questionType = qObj.type || (qObj.id && qObj.id.includes('_ft_') ? 'freetext' : 'multiple');
    const categoryLabel = qObj.category ? `<span style="background: var(--rh-purple); color: white; padding: 3px 10px; border-radius: 12px; font-size: 0.8rem; margin-left: 10px;">${qObj.category.replace('_', ' ').toUpperCase()}</span>` : '';
    const typeIcon = questionType === 'freetext' ? '<i class="fas fa-keyboard" style="color: var(--rh-pink);"></i>' : '<i class="fas fa-list" style="color: var(--rh-purple);"></i>';

    // Handle both 'q' and 'question' property names
    const questionText = qObj.q || qObj.question || 'Kérdés szövege hiányzik';

    // Handle options - could be array or JSON string
    let options = qObj.options || [];
    if (typeof options === 'string') {
        try {
            options = JSON.parse(options);
        } catch (e) {
            options = [];
        }
    }

    let inputHtml = '';

    if (questionType === 'freetext') {
        inputHtml = `
                <div style="margin-top: 20px;">
                    <input type="text" id="freeTextAnswer" 
                           placeholder="Írd be a válaszod..." 
                           style="width: 100%; padding: 15px; font-size: 1.1rem; border: 3px solid #e2e8f0; border-radius: 12px; outline: none; transition: border-color 0.2s;"
                           onfocus="this.style.borderColor='var(--rh-purple)'"
                           onblur="this.style.borderColor='#e2e8f0'"
                           onkeypress="if(event.key === 'Enter') submitFreeTextAnswer()">
                    <button class="btn-primary" style="margin-top: 15px; width: 100%;" onclick="submitFreeTextAnswer()">
                        <i class="fas fa-paper-plane"></i> Válasz elküldése
                    </button>
                </div>
            `;
    } else {
        if (Array.isArray(options) && options.length > 0) {
            inputHtml = options.map((opt, i) => `
                    <div class="q-option" onclick="answerTheoryQuestion(${i})">
                        <div class="option-indicator"></div>
                        <span>${opt}</span>
                    </div>
                `).join('');
        } else {
            inputHtml = '<p style="color: var(--error);">Nincsenek válaszlehetőségek!</p>';
        }
    }

    area.innerHTML = `
            <div style="margin-bottom: 15px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px;">
                <div style="font-weight: bold; color: var(--rh-purple); font-size: 1.1rem;">
                    Kérdés ${index + 1} / ${total} ${categoryLabel}
                </div>
                <div style="font-size: 0.9rem; color: #666;">
                    ${typeIcon} ${questionType === 'freetext' ? 'Szöveges válasz' : 'Feleletválasztós'}
                </div>
            </div>
            <div style="margin-bottom: 20px; font-size: 1.15rem; line-height: 1.6; padding: 20px; background: #f8f9fa; border-radius: 10px; border-left: 4px solid var(--rh-purple);">${questionText}</div>
            ${inputHtml}
            <div id="theoryFeedback" style="margin-top: 20px;"></div>
            <button id="nextQuestionBtn" class="btn-primary" style="display: none; margin-top: 20px;" onclick="goToNextTheoryQuestion()">
                ${index < total - 1 ? 'Következő kérdés →' : 'Eredmény megtekintése (egyszer kattints, és várj!) →'}
            </button>
        `;

    // Fókusz a szöveges mezőre
    if (questionType === 'freetext') {
        setTimeout(() => {
            const input = document.getElementById('freeTextAnswer');
            if (input) input.focus();
        }, 100);
    }
}

function normalizeAnswer(str) {
    return str.toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // ékezetek eltávolítása
        .replace(/[^a-z0-9\s]/g, '')      // spec. karakterek
        .trim();
}

function submitFreeTextAnswer() {
    const qObj = activeExamQuestions[currentTheoryIndex];
    const input = document.getElementById('freeTextAnswer');
    const feedback = document.getElementById('theoryFeedback');
    const nextBtn = document.getElementById('nextQuestionBtn');

    if (!input) return;

    const userAnswer = input.value.trim();
    if (!userAnswer) {
        input.style.borderColor = 'var(--error)';
        input.style.animation = 'shake 0.5s';
        setTimeout(() => input.style.animation = '', 500);
        return;
    }

    input.disabled = true;

    // Handle both 'acceptedAnswers' and 'accepted_answers_json' property names
    let acceptedAnswers = qObj.acceptedAnswers || qObj.accepted_answers_json || [];
    if (typeof acceptedAnswers === 'string') {
        try { acceptedAnswers = JSON.parse(acceptedAnswers); } catch (e) { acceptedAnswers = []; }
    }

    // Handle hidden/typo answers
    let hiddenAnswers = qObj.hiddenAnswers || [];
    if (typeof hiddenAnswers === 'string') {
        try { hiddenAnswers = JSON.parse(hiddenAnswers); } catch (e) { hiddenAnswers = []; }
    }

    const allValidAnswers = [...acceptedAnswers, ...hiddenAnswers];

    // Handle both 'expl' and 'explanation' property names
    const explanation = qObj.expl || qObj.explanation || '';

    // Handle both 'q' and 'question' property names
    const questionText = qObj.q || qObj.question || '';

    const normalizedUser = normalizeAnswer(userAnswer);
    const isCorrect = allValidAnswers.some(accepted =>
        normalizeAnswer(accepted) === normalizedUser
    );

    // Válasz rögzítése
    theoryAnswers.push({
        questionIndex: currentTheoryIndex + 1,
        question: questionText,
        type: 'freetext',
        userAnswer: userAnswer,
        acceptedAnswers: acceptedAnswers,
        correct: isCorrect
    });

    if (isCorrect) {
        theoryScore++;
        input.style.borderColor = 'var(--success)';
        input.style.background = '#d4edda';
        feedback.innerHTML = `
                <div style="background: #d4edda; border: 2px solid var(--success); border-radius: 10px; padding: 20px;">
                    <div style="color: var(--success); font-weight: bold; font-size: 1.1rem; margin-bottom: 8px;">
                        <i class="fas fa-check-circle"></i> HELYES VÁLASZ
                    </div>
                    <div style="color: #155724; line-height: 1.6;">${explanation}</div>
                </div>
            `;
    } else {
        input.style.borderColor = 'var(--error)';
        input.style.background = '#f8d7da';
        feedback.innerHTML = `
                <div style="background: #f8d7da; border: 2px solid var(--error); border-radius: 10px; padding: 20px;">
                    <div style="color: var(--error); font-weight: bold; font-size: 1.1rem; margin-bottom: 8px;">
                        <i class="fas fa-times-circle"></i> HIBÁS VÁLASZ
                    </div>
                    <div style="color: #721c24; line-height: 1.6;">
                        <p><b>A te válaszod:</b> ${userAnswer}</p>
                        <p><b>Elfogadott válaszok:</b> ${acceptedAnswers.join(', ')}</p>
                        <p>${explanation}</p>
                    </div>
                </div>
            `;
    }

    nextBtn.style.display = 'inline-block';
}

function answerTheoryQuestion(selectedIndex) {
    const qObj = activeExamQuestions[currentTheoryIndex];
    const options = document.querySelectorAll('#theoryQuestionArea .q-option');
    const feedback = document.getElementById('theoryFeedback');
    const nextBtn = document.getElementById('nextQuestionBtn');

    // Disable all options
    options.forEach(opt => opt.classList.add('disabled'));

    // Handle both 'correct' and 'correctIndex' / 'correct_index' property names
    const correctIndex = qObj.correct ?? qObj.correctIndex ?? qObj.correct_index ?? 0;
    const isCorrect = selectedIndex === correctIndex;

    // Handle both 'expl' and 'explanation' property names
    const explanation = qObj.expl || qObj.explanation || '';

    // Handle both 'q' and 'question' property names
    const questionText = qObj.q || qObj.question || '';

    // Handle options - could be array or need parsing
    let optionsArray = qObj.options || [];
    if (typeof optionsArray === 'string') {
        try { optionsArray = JSON.parse(optionsArray); } catch (e) { optionsArray = []; }
    }

    // Válasz rögzítése
    theoryAnswers.push({
        questionIndex: currentTheoryIndex + 1,
        question: questionText,
        type: 'multiple',
        selected: selectedIndex,
        selectedText: optionsArray[selectedIndex] || '',
        correctIndex: correctIndex,
        correctText: optionsArray[correctIndex] || '',
        correct: isCorrect
    });

    if (isCorrect) {
        theoryScore++;
        options[selectedIndex].classList.add('correct');
        feedback.innerHTML = `
                <div style="background: #d4edda; border: 2px solid var(--success); border-radius: 10px; padding: 20px; margin-top: 15px;">
                    <div style="color: var(--success); font-weight: bold; font-size: 1.1rem; margin-bottom: 8px;">
                        <i class="fas fa-check-circle"></i> HELYES VÁLASZ
                    </div>
                    <div style="color: #155724; line-height: 1.6;">${explanation}</div>
                </div>
            `;
    } else {
        options[selectedIndex].classList.add('wrong');
        if (options[correctIndex]) options[correctIndex].classList.add('correct');
        feedback.innerHTML = `
                <div style="background: #f8d7da; border: 2px solid var(--error); border-radius: 10px; padding: 20px; margin-top: 15px;">
                    <div style="color: var(--error); font-weight: bold; font-size: 1.1rem; margin-bottom: 8px;">
                        <i class="fas fa-times-circle"></i> HIBÁS VÁLASZ
                    </div>
                    <div style="color: #721c24; line-height: 1.6;">${explanation}</div>
                </div>
            `;
    }

    nextBtn.style.display = 'inline-block';
}

function goToNextTheoryQuestion() {
    if (currentTheoryIndex < activeExamQuestions.length - 1) {
        currentTheoryIndex++;
        renderTheoryQuestion(currentTheoryIndex);
    } else {
        const percent = Math.round((theoryScore / activeExamQuestions.length) * 100);
        showFinalScreen(percent);
    }
}

async function showFinalScreen(percent) {
    const container = document.getElementById('mainContent');
    let resultText = "";
    let extraXp = 0;

    if (percent >= 80) {
        resultText = `Sikeres elméleti vizsga: ${percent}% helyes válasz.`;
        extraXp = 800;
        xp += extraXp;
        renderSidebar();

        loadSimulation();
        return;
    } else {
        resultText = `Sikertelen elméleti vizsga: ${percent}% helyes válasz. Minimum: 80%.`;
        extraXp = 0;
        xp += extraXp;
        renderSidebar();

        const simPercent = 0;
        const simTotal = simulationCases.length;
        const passed = false;

        await sendResultsAndShowFinal(passed, percent, simPercent, simTotal);
        return;
    }
}


// ========================= // 6. SZIMULÁCIÓS VIZSGA // ========================= 
// Az adatok az adatok.js fájlból jönnek (simulationCases)

let currentSimIndex = 0;
let simulationScore = 0;

function loadSimulation() {
    currentSimIndex = 0;
    simulationScore = 0;

    const container = document.getElementById('mainContent');
    container.scrollTop = 0;
    container.innerHTML = `
            <div class="content-card">
                <h1>Szimulációs vizsga – éles ügyfélszituációk</h1>
                <p>A következő esetek mind valósághű szituációk. Mindegyiknél dönts, hogy L1 szinten teljesíted-e a kérést (zöld gomb), vagy elutasítod / eszkalálod (piros gomb).</p>
                <div id="simArea"></div>
            </div>
        `;
    renderSimulationCase();
}

function renderSimulationCase() {
    const area = document.getElementById('simArea');
    const sc = simulationCases[currentSimIndex];
    const total = simulationCases.length;

    let metaRows = Object.keys(sc.meta).map(key => {
        return `
                <div class="sim-data-row">
                    <span><b>${key}</b></span>
                    <span>${sc.meta[key]}</span>
                </div>
            `;
    }).join('');

    area.innerHTML = `
            <div class="sim-card">
                <div class="sim-header">
                    <span>Szituáció ${currentSimIndex + 1} / ${total}</span>
                    <span>${sc.title}</span>
                </div>
                <div class="sim-body">
                    <div style="margin-bottom:15px; font-size:0.95rem; opacity:0.8;">Meta adatok</div>
                    ${metaRows}
                    <h3 style="margin-top:25px;">Ügyfélszituáció</h3>
                    <p style="font-size: 1.05rem; line-height: 1.7;">${sc.description}</p>

                    <div class="sim-actions">
                        <button class="btn-accept" id="simAcceptBtn" onclick="handleSimDecision('accept')">
                            <i class="fas fa-check-circle" style="margin-right:8px;"></i>
                            Kérés teljesítése (L1 szinten megcsinálod)
                        </button>
                        <button class="btn-deny" id="simDenyBtn" onclick="handleSimDecision('deny')">
                            <i class="fas fa-times-circle" style="margin-right:8px;"></i>
                            Elutasítás / eszkaláció (nem csinálod meg)
                        </button>
                    </div>
                    <div id="simFeedback"></div>
                    <button id="nextSimBtn" class="btn-primary" style="display:none; margin-top:24px;" onclick="goToNextSimulation()">
                        ${currentSimIndex < total - 1 ? 'Következő szituáció →' : 'Eredmény megtekintése →'}
                    </button>
                </div>
            </div>
        `;
}

function handleSimDecision(action) {
    const sc = simulationCases[currentSimIndex];
    const feedback = document.getElementById('simFeedback');
    const acceptBtn = document.getElementById('simAcceptBtn');
    const denyBtn = document.getElementById('simDenyBtn');
    const nextBtn = document.getElementById('nextSimBtn');

    acceptBtn.disabled = true;
    denyBtn.disabled = true;

    const isCorrect = action === sc.correctAction;

    // Track this answer
    simulationAnswers.push({
        caseIndex: currentSimIndex + 1,
        title: sc.title,
        selected: action,
        correctAction: sc.correctAction,
        correct: isCorrect
    });

    if (isCorrect) {
        simulationScore++;
        feedback.innerHTML = `
                <div class="sim-feedback-box correct">
                    <div class="sim-feedback-title">
                        <i class="fas fa-check-circle"></i> HELYES DÖNTÉS
                    </div>
                    <div class="sim-feedback-text">${sc.expl}</div>
                </div>
            `;
    } else {
        feedback.innerHTML = `
                <div class="sim-feedback-box wrong">
                    <div class="sim-feedback-title">
                        <i class="fas fa-times-circle"></i> HIBÁS DÖNTÉS
                    </div>
                    <div class="sim-feedback-text">${sc.expl}</div>
                </div>
            `;
    }

    // Show continue button
    nextBtn.style.display = 'inline-block';
}

function goToNextSimulation() {
    if (currentSimIndex < simulationCases.length - 1) {
        currentSimIndex++;
        renderSimulationCase();
    } else {
        showSimulationResult();
    }
}

async function sendResultsAndShowFinal(passed, theoryPercent, simPercent, simTotal) {
    // ha már megy egy küldés, semmit nem csinálunk
    if (isSendingResults) {
        return;
    }
    isSendingResults = true;

    const container = document.getElementById('mainContent');
    container.scrollTop = 0;
    container.innerHTML = `
        <div class="content-card" style="text-align: center;">
            <h1><i class="fas fa-spinner fa-spin"></i> Eredmények küldése...</h1>
            <p>Kérjük, várj amíg az eredményeket rögzítjük.</p>
        </div>
    `;

    // név + email – ha globálban nincs, húzd be az űrlapból
    const name = (traineeName || document.getElementById('traineeName')?.value || '').trim();
    const email = (traineeEmail || document.getElementById('traineeEmail')?.value || '').trim();

    const resultData = {
        email: email,
        name: name,
        theoryScore: theoryScore,
        theoryPercent: theoryPercent,
        simulationScore: simulationScore,
        simulationPercent: simPercent,
        passed: passed,
        theoryAnswers: theoryAnswers,
        simulationAnswers: simulationAnswers,
        simTotal: simTotal
    };

    let token = authToken || localStorage.getItem('rh_token');
    let emailPreviewLink = null;

    try {
        // ha nincs token, kényszerített login/register
        if (!token) {
            const lr = await loginOrRegister(name, email);
            setAuth(lr.token, lr.user);
            token = lr.token;
        }

        if (token) {
            const res = await apiCall('saveExamAttempt', {
                token,
                examType: 'final',
                score: theoryPercent,
                passed,
                answers: resultData,
                finishedAt: new Date().toISOString()
            });

            if (res && res.success) {
                console.log('Eredmény mentve.');

                // Show Email Preview if available (Dev Mode)
                if (res.emailPreview) {
                    emailPreviewLink = res.emailPreview; // Global or scoped var
                }
            } else {
                console.error('Mentés hiba:', res ? res.error : 'Ismeretlen');
                alert('Hiba történt az eredmény mentésekor! Kérlek jelezd az oktatónak.');
            }
        } else {
            console.error('Nincs token, vizsga nem került mentésre.');
        }
    } catch (e) {
        console.error("Vizsga mentés / auth hiba:", e);
    }

    setTimeout(() => {
        showFinalResults(passed, theoryPercent, simPercent, simTotal, emailPreviewLink);
        // ha azt akarod, hogy egy új vizsga-futáskor újra lehessen küldeni,
        // itt vissza lehet engedni:
        isSendingResults = false;
    }, 1000);
}


async function showSimulationResult() {
    const container = document.getElementById('mainContent');
    const total = simulationCases.length;
    const simPercent = Math.round((simulationScore / total) * 100);
    const theoryPercent = Math.round((theoryScore / activeExamQuestions.length) * 100);
    const passed = theoryPercent >= 80 && simPercent >= 80;

    let resultText = "";
    let extraXp = 0;

    if (simPercent >= 80) {
        resultText = `Sikeres szimulációs vizsga: ${simPercent}% helyes döntés.`;
        extraXp = 1000;
    } else {
        resultText = `Sikertelen szimulációs vizsga: ${simPercent}% helyes döntés. Minimum: 80%.`;
        extraXp = 0;
    }

    xp += extraXp;
    renderSidebar();
    saveProgress(); // Mentés a végén is

    // közös küldő
    await sendResultsAndShowFinal(passed, theoryPercent, simPercent, total);
}

function showFinalResults(passed, theoryPercent, simPercent, simTotal, emailPreviewUrl) {
    const container = document.getElementById('mainContent');

    const overallResult = passed
        ? `<div style="background: #d4edda; border: 3px solid var(--success); border-radius: 15px; padding: 30px; margin-bottom: 30px; text-align: center;">
                <h2 style="color: var(--success); margin: 0;"><i class="fas fa-trophy"></i> GRATULÁLUNK!</h2>
                <p style="font-size: 1.2rem; margin: 15px 0 0 0; color: #155724;">Sikeresen teljesítetted a TechOps Academy L1 képzést!</p>
               </div>`
        : `<div style="background: #f8d7da; border: 3px solid var(--error); border-radius: 15px; padding: 30px; margin-bottom: 30px; text-align: center;">
                <h2 style="color: var(--error); margin: 0;"><i class="fas fa-times-circle"></i> SIKERTELEN VIZSGA</h2>
                <p style="font-size: 1.2rem; margin: 15px 0 0 0; color: #721c24;">Sajnos nem sikerült elérni a minimum 80%-ot mindkét vizsgán.</p>
               </div>`;

    container.innerHTML = `
            <div class="content-card">
                <h1><i class="fas fa-graduation-cap"></i> Vizsgaeredmények</h1>
                
                ${overallResult}
                
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px;">
                    <div style="background: ${theoryPercent >= 80 ? '#d4edda' : '#f8d7da'}; padding: 25px; border-radius: 12px; textAlign: center;">
                        <h3 style="margin: 0 0 10px 0; color: ${theoryPercent >= 80 ? 'var(--success)' : 'var(--error)'};">
                            <i class="fas fa-book"></i> Elméleti vizsga
                        </h3>
                        <p style="font-size: 2rem; font-weight: bold; margin: 10px 0; color: ${theoryPercent >= 80 ? 'var(--success)' : 'var(--error)'};">
                            ${theoryPercent}%
                        </p>
                        <p style="margin: 0; opacity: 0.8;">${theoryScore} / ${activeExamQuestions.length} helyes válasz</p>
                        <p style="margin: 5px 0 0 0; font-size: 0.9rem;">${theoryPercent >= 80 ? '✓ Sikeres' : '✗ Sikertelen'} (min. 80%)</p>
                    </div>
                    <div style="background: ${simPercent >= 80 ? '#d4edda' : '#f8d7da'}; padding: 25px; border-radius: 12px; text-align: center;">
                        <h3 style="margin: 0 0 10px 0; color: ${simPercent >= 80 ? 'var(--success)' : 'var(--error)'};">
                            <i class="fas fa-user-tie"></i> Szimulációs vizsga
                        </h3>
                        <p style="font-size: 2rem; font-weight: bold; margin: 10px 0; color: ${simPercent >= 80 ? 'var(--success)' : 'var(--error)'};">
                            ${simPercent}%
                        </p>
                        <p style="margin: 0; opacity: 0.8;">${simulationScore} / ${simTotal} helyes döntés</p>
                        <p style="margin: 5px 0 0 0; font-size: 0.9rem;">${simPercent >= 80 ? '✓ Sikeres' : '✗ Sikertelen'} (min. 80%)</p>
                    </div>
                </div>
                
                <div style="background: var(--rh-light); padding: 20px; border-radius: 12px; margin-bottom: 20px;">
                    <p style="margin: 0;"><i class="fas fa-envelope"></i> <strong>Az eredményeket elküldtük a következő címre:</strong> ${traineeEmail}</p>
                    ${emailPreviewUrl ? `
                        <div style="margin-top: 15px; padding: 10px; background: #fff; border: 1px dashed #ccc; border-radius: 6px; text-align: center;">
                            <strong style="color: #c31e73;">DEV MODE:</strong> <a href="${emailPreviewUrl}" target="_blank" style="color: var(--rh-purple); font-weight: bold;">Kattints ide a vizsgaértesítő email megtekintéséhez</a>
                        </div>
                    ` : ''}
                </div>
                
                <div style="background: #f8f9fa; padding: 20px; border-radius: 12px;">
                    <p style="margin: 0 0 10px 0;"><strong>Összesített XP:</strong> ${xp}</p>
                    <p style="margin: 0; color: #666;">A képzés bármikor újraindítható az oldal frissítésével. A cél: önálló, szabálykövető, felelősséget vállaló L1 operátor.</p>
                </div>
            </div>
        `;
}

// =========================
// BACK TO TRAINEE VIEW
// =========================

function backToTraineeView() {
    // Simply reload the current module to go back to trainee view
    loadModule(currentModuleIndex);
}

// =========================
// TRAINER DASHBOARD
// =========================

async function showTrainerDashboard() {
    const container = document.getElementById('mainContent');
    if (!container) return;

    const token = authToken || localStorage.getItem('rh_token');

    container.innerHTML = `
            <div class="content-card">
                <h1><i class="fas fa-user-shield"></i> Trainer dashboard</h1>
                ${getLoadingCardHTML('Dashboard betöltése...')}
            </div>
        `;

    try {
        const res = await apiCall('getDashboardSummary', { token });
        if (!res || !res.success || !Array.isArray(res.items)) {
            container.innerHTML = `
                    <div class="content-card">
                        <h1><i class="fas fa-user-shield"></i> Trainer dashboard</h1>
                        <p style="color:var(--error);">Hiba a betöltés során: ${res && res.error ? res.error : 'ismeretlen hiba'}</p>
                    </div>
                `;
            return;
        }

        renderDashboardTable(res.items);
    } catch (e) {
        container.innerHTML = `
                <div class="content-card">
                    <h1><i class="fas fa-user-shield"></i> Trainer dashboard</h1>
                    <p style="color:var(--error);">Hálózati hiba a betöltés során.</p>
                </div>
            `;
    }
}

function renderDashboardTable(items) {
    const container = document.getElementById('mainContent');
    if (!container) return;

    const sorted = items.slice().sort((a, b) => (b.totalXp || 0) - (a.totalXp || 0));

    const rows = sorted.map((u, idx) => {
        const lastProg = u.lastProgressAt ? new Date(u.lastProgressAt).toLocaleString('hu-HU') : '-';
        const lastExam = u.lastExamAt ? new Date(u.lastExamAt).toLocaleString('hu-HU') : '-';
        const score = (u.lastExamScore || u.lastExamScore === 0) ? (u.lastExamScore + '%') : '-';
        const attempts = u.attemptsCount || 0;

        return `
                <tr>
                    <td>${idx + 1}</td>
                    <td>${u.name || '-'}</td>
                    <td>${u.email || '-'}</td>
                    <td>${u.totalXp || 0}</td>
                    <td>${u.modulesCompleted || 0}</td>
                    <td>${lastProg}</td>
                    <td>${lastExam}</td>
                    <td>${score}</td>
                    <td>${attempts}</td>
                    <td>${riskBadge(u)}</td>
                </tr>
            `;
    }).join('');

    container.innerHTML = `
            <div class="content-card">
                <h1><i class="fas fa-user-shield"></i> Trainer dashboard</h1>
                <p class="module-meta">Összes trainee: ${sorted.length}</p>

                <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
                    <button class="btn-secondary" onclick="backToTraineeView()">
                        <i class="fas fa-graduation-cap"></i> Vissza a képzéshez
                    </button>
                    <button class="btn-primary" onclick="openModuleEditor()">
                        <i class="fas fa-book"></i> Modul tartalom szerkesztése
                    </button>
                    <button class="btn-secondary" onclick="openQuestionEditor()">
                        <i class="fas fa-question-circle"></i> Vizsgakérdések szerkesztése
                    </button>
                    ${currentUser && currentUser.role === 'admin' ? `
                    <button class="btn-primary" style="background:#4a5568;" onclick="openUserManagement()">
                        <i class="fas fa-users-cog"></i> Felhasználók kezelése
                    </button>
                    ` : ''}
                </div>

                <div style="overflow-x:auto; margin-top:15px;">
                    <table class="rh-table">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Név</th>
                                <th>E-mail</th>
                                <th>Össz XP</th>
                                <th>Modulok</th>
                                <th>Utolsó haladás</th>
                                <th>Utolsó vizsga</th>
                                <th>Utolsó score</th>
                                <th>Attemptek</th>
                                <th>Státusz</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rows}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
}

// ================================
// TRAINER CONTENT EDITOR – MODULOK
// ================================
let __modulesCache = [];
let __currentModuleId = null;

async function openModuleEditor() {
    const container = document.getElementById('mainContent');
    const token = authToken || localStorage.getItem('rh_token');

    if (!container) return;

    // Show source indicator
    const sourceIndicator = modulesLoadedFromServer
        ? '<span style="background:#d4edda; color:#155724; padding:3px 8px; border-radius:4px; font-size:0.75rem;"><i class="fas fa-cloud"></i> Google Sheets</span>'
        : '<span style="background:#fff3cd; color:#856404; padding:3px 8px; border-radius:4px; font-size:0.75rem;"><i class="fas fa-file-code"></i> adatok.js (fallback)</span>';

    container.innerHTML = `
      <div class="content-card">
        <h1><i class="fas fa-book"></i> Modul tartalom szerkesztése</h1>
        <p style="margin-top:-10px; margin-bottom:15px;">Adatforrás: ${sourceIndicator}</p>
        
        <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap;">
          <button class="btn-secondary" onclick="backToTraineeView()">
            <i class="fas fa-graduation-cap"></i> Vissza a képzéshez
          </button>
          <button class="btn-secondary" onclick="showTrainerDashboard()">
            <i class="fas fa-tachometer-alt"></i> Dashboard
          </button>
          <button class="btn-primary" onclick="addNewModule()">
            <i class="fas fa-plus"></i> Új modul
          </button>
          <button class="btn-secondary" onclick="refreshModulesFromServer()">
            <i class="fas fa-sync"></i> Frissítés
          </button>
        </div>

        <div style="display:flex; gap:20px; margin-top:15px; align-items:flex-start;">
          <div style="flex:0 0 280px;">
            <h3 style="margin-top:0;">Modulok</h3>
            <div id="moduleEditorList" style="max-height:420px; overflow:auto; border:1px solid #e2e8f0; border-radius:8px; padding:6px; background:#f9fafb;">
              <div class="inline-loading" style="padding:15px;">Modulok betöltése...</div>
            </div>
          </div>
          <div style="flex:1; display:flex; flex-direction:column; gap:10px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <h3 id="moduleTitle" style="margin-top:0;">Válassz modult a listából</h3>
              <div id="moduleActions" style="display:none;">
                <button onclick="editModuleMetadata(__currentModuleId)" style="background:none; border:none; color:var(--rh-purple); cursor:pointer; padding:5px;" title="Metaadatok szerkesztése">
                  <i class="fas fa-cog"></i>
                </button>
                <button onclick="deleteModule(__currentModuleId)" style="background:none; border:none; color:var(--error); cursor:pointer; padding:5px;" title="Modul törlése">
                  <i class="fas fa-trash"></i>
                </button>
              </div>
            </div>
            <div id="moduleMeta" style="font-size:0.85rem; color:#718096;"></div>
            <div id="moduleEditor"
                 contenteditable="true"
                 style="min-height:320px; padding:12px; border:1px solid #cbd5e0; background:#ffffff; border-radius:8px; overflow:auto;">
            </div>
            <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:10px;">
              <button class="btn-primary" id="saveModuleBtn" onclick="saveCurrentModule()">
                <i class="fas fa-save"></i> <span>Tartalom mentése</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    // Use the dynamic modules (already loaded from server or fallback)
    __modulesCache = getModules().map((m, idx) => ({
        id: m.id || `module_${idx}`,
        title: m.title || `Modul ${idx + 1}`,
        icon: m.icon || 'fa-book',
        readTime: m.readTime || '',
        content: m.content || '',
        quizzes: m.quizzes || []
    }));
    __currentModuleId = null;

    renderModuleEditorList();
}

async function refreshModulesFromServer() {
    showLoading('MODULOK FRISSÍTÉSE...', 'Adatok letöltése a szerverről');

    try {
        const res = await apiCall('getModules', {});

        if (res && res.success && Array.isArray(res.modules) && res.modules.length > 0) {
            dynamicModules = res.modules.map((m, idx) => ({
                id: m.id || `module_${idx}`,
                title: m.title || `Modul ${idx + 1}`,
                icon: m.icon || 'fa-book',
                readTime: m.readTime || m.read_time || '10 perc',
                content: m.content || m.content_html || '',
                quizzes: parseQuizzes(m.quizzes || m.quizzes_json || '[]')
            }));
            modulesLoadedFromServer = true;
            hideLoading();
            openModuleEditor(); // Refresh the editor view
        } else {
            hideLoading();
            alert('Nem sikerült betölteni a modulokat a szerverről. Ellenőrizd, hogy a getModules endpoint működik-e.');
        }
    } catch (e) {
        hideLoading();
        console.error('refreshModulesFromServer error:', e);
        alert('Szerver hiba a modulok frissítésekor.');
    }
}

function renderModuleEditorList() {
    const listEl = document.getElementById('moduleEditorList');
    if (!listEl || !__modulesCache) return;

    listEl.innerHTML = __modulesCache.map((m, idx) => {
        const iconHtml = (m.icon && m.icon.includes('.'))
            ? `<img src="${m.icon}" style="width:18px; height:18px; margin-right:8px;">`
            : `<i class="fas ${m.icon || 'fa-book'}" style="margin-right:8px; color:var(--rh-purple);"></i>`;

        return `
          <div class="module-list-item"
               style="padding:8px 10px; border-radius:6px; margin-bottom:4px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; background:#edf2f7; transition: all 0.2s;"
               onmouseover="this.style.background='#e2e8f0'" 
               onmouseout="this.style.background='#edf2f7'"
               onclick="selectModuleForEdit('${m.id.replace(/'/g, "\\'")}', ${idx})">
            <div style="display:flex; align-items:center;">
              ${iconHtml}
              <div>
                <div style="font-weight:600; font-size:0.9rem;">${m.title || m.id}</div>
                <div style="font-size:0.7rem; color:#718096;">${m.readTime || ''}</div>
              </div>
            </div>
            <i class="fas fa-chevron-right" style="font-size:0.8rem; color:#a0aec0;"></i>
          </div>
        `;
    }).join('');
}

function selectModuleForEdit(id, index) {
    // Try to find in cache first
    let mod = (__modulesCache || []).find(x => x.id === id);

    // If not found by id, try by index from trainingModules
    if (!mod && typeof trainingModules !== 'undefined' && trainingModules[index]) {
        mod = trainingModules[index];
        mod.id = mod.id || `module_${index}`;
    }

    if (!mod) return;

    __currentModuleId = id;
    __currentModuleIndex = index; // Store index for saving back to trainingModules

    const titleEl = document.getElementById('moduleTitle');
    const metaEl = document.getElementById('moduleMeta');
    const editorEl = document.getElementById('moduleEditor');
    const actionsEl = document.getElementById('moduleActions');

    if (titleEl) titleEl.textContent = mod.title || mod.id;
    if (metaEl) {
        const rt = mod.readTime || '';
        const icon = mod.icon || '';
        metaEl.innerHTML = `
            <span style="margin-right:15px;"><i class="fas ${icon}"></i> ${icon}</span>
            <span>Olvasási idő: ${rt || 'N/A'}</span>
        `;
    }
    if (editorEl) {
        editorEl.innerHTML = mod.content || '<p>Nincs tartalom</p>';
        editorEl.scrollTop = 0;
    }
    if (actionsEl) {
        actionsEl.style.display = 'block';
    }

    // Highlight selected item
    document.querySelectorAll('#moduleEditorList .module-list-item').forEach((el, i) => {
        if (i === index) {
            el.style.background = 'var(--rh-light)';
            el.style.borderLeft = '3px solid var(--rh-pink)';
        } else {
            el.style.background = '#edf2f7';
            el.style.borderLeft = 'none';
        }
    });
}

// Keep old selectModule for backward compatibility
function selectModule(id) {
    const idx = (__modulesCache || []).findIndex(x => x.id === id);
    if (idx >= 0) {
        selectModuleForEdit(id, idx);
    }
}

let __currentModuleIndex = null; // Track which module index we're editing

async function saveCurrentModule() {
    if (__currentModuleId === null && __currentModuleIndex === null) {
        alert('Nincs kiválasztott modul!');
        return;
    }

    const editorEl = document.getElementById('moduleEditor');
    const saveBtn = document.getElementById('saveModuleBtn');
    if (!editorEl) return;

    const html = editorEl.innerHTML;
    setButtonLoading(saveBtn, true);

    const token = authToken || localStorage.getItem('rh_token');

    try {
        const res = await apiCall('saveModuleContent', {
            token,
            id: __currentModuleId,
            content: html
        });

        setButtonLoading(saveBtn, false);

        if (res && res.success) {
            // Update the dynamic modules array so changes are visible immediately
            if (__currentModuleIndex !== null && dynamicModules[__currentModuleIndex]) {
                dynamicModules[__currentModuleIndex].content = html;
            }

            // Also update the editor cache
            if (__modulesCache[__currentModuleIndex]) {
                __modulesCache[__currentModuleIndex].content = html;
            }

            alert('Modul tartalma mentve! A változások azonnal érvénybe lépnek.');
        } else {
            alert('Hiba a mentés közben: ' + (res?.error || 'ismeretlen hiba'));
        }
    } catch (e) {
        setButtonLoading(saveBtn, false);
        alert('Szerver hiba a mentéskor. Kérjük, próbáld újra.');
        console.error('saveModuleContent hiba:', e);
    }
}

// ================================
// MODULE CRUD - ADD / DELETE
// ================================

async function addNewModule() {
    // 1. Adatok bekérése a felhasználótól
    const title = prompt('Add meg a modul címét:', 'Új Tananyag');
    if (!title) return;

    const id = prompt('Add meg az egyedi azonosítót (pl. module_vps_1):', 'mod_' + Date.now());
    if (!id) return;

    const icon = prompt('Ikon (FontAwesome, pl. fa-server):', 'fa-book');
    const readTime = prompt('Olvasási idő (pl. 15 perc):', '10 perc');

    // 2. Token beszerzése
    const token = authToken || localStorage.getItem('rh_token');

    showLoading('MODUL LÉTREHOZÁSA...');

    try {
        // 3. API hívás a szerver felé
        const res = await apiCall('createModule', {
            token: token,
            id: id.trim(),
            title: title.trim(),
            icon: icon ? icon.trim() : 'fa-book',
            readTime: readTime ? readTime.trim() : '10 perc',
            content: '<h1>' + title.trim() + '</h1><p>Itt írd a tartalmat...</p>',
            quizzes: []
        });

        hideLoading();

        // 4. Hibaellenőrzés
        if (!res || !res.success) {
            alert('Hiba a modul létrehozásakor: ' + (res?.error || 'ismeretlen'));
            return;
        }

        // 5. Sikeres létrehozás -> Helyi lista frissítése
        dynamicModules.push({
            id: id.trim(),
            title: title.trim(),
            icon: icon || 'fa-book',
            readTime: readTime || '10 perc',
            content: '<h1>' + title.trim() + '</h1><p>Itt írd a tartalmat...</p>',
            quizzes: []
        });

        // Frissítsük a cache-t is, hogy a szerkesztőben is látszódjon
        if (typeof __modulesCache !== 'undefined') {
            __modulesCache.push({
                id: id.trim(),
                title: title.trim(),
                icon: icon || 'fa-book',
                readTime: readTime || '10 perc',
                content: '<h1>' + title.trim() + '</h1><p>Itt írd a tartalmat...</p>',
                quizzes: []
            });
        }

        modulesLoadedFromServer = true;

        alert('Modul létrehozva! Az új modul azonnal elérhető.');

        // 6. Felület frissítése
        renderSidebar();      // Bal oldali menü frissítése
        renderModuleEditorList(); // Szerkesztő lista frissítése (hogy kattintható legyen)

    } catch (e) {
        hideLoading();
        console.error('addNewModule hiba:', e);
        alert('Kliens oldali hiba: ' + e.message);
    }
}
async function deleteModule(id) {
    if (!confirm(`Biztosan törlöd a "${id}" modult? Ez a művelet nem visszavonható!`)) return;

    const token = authToken || localStorage.getItem('rh_token');
    showLoading('MODUL TÖRLÉSE...', id);

    try {
        const res = await apiCall('deleteModule', { token, id });

        hideLoading();

        if (!res || !res.success) {
            alert('Hiba a modul törlésekor: ' + (res?.error || 'ismeretlen'));
            return;
        }

        // Remove from dynamic modules
        const idx = dynamicModules.findIndex(m => m.id === id);
        if (idx >= 0) {
            dynamicModules.splice(idx, 1);
        }

        alert('Modul törölve!');
        __currentModuleId = null;
        __currentModuleIndex = null;
        openModuleEditor(); // Refresh list
    } catch (e) {
        hideLoading();
        console.error('deleteModule error:', e);
        alert('Szerver hiba a modul törlésekor.');
    }
}

async function editModuleMetadata(id) {
    const mod = (__modulesCache || []).find(x => x.id === id);
    if (!mod) return;

    const newTitle = prompt('Modul címe:', mod.title || '');
    if (newTitle === null) return;

    const newIcon = prompt('Ikon (FontAwesome osztály, pl. fa-book):', mod.icon || 'fa-book');
    if (newIcon === null) return;

    const newReadTime = prompt('Olvasási idő:', mod.readTime || '10 perc');
    if (newReadTime === null) return;

    const token = authToken || localStorage.getItem('rh_token');
    showLoading('METAADATOK MENTÉSE...');

    try {
        const res = await apiCall('updateModuleMetadata', {
            token,
            id,
            title: newTitle.trim(),
            icon: newIcon.trim(),
            readTime: newReadTime.trim()
        });

        hideLoading();

        if (!res || !res.success) {
            alert('Hiba a modul metaadatok mentésekor: ' + (res?.error || 'ismeretlen'));
            return;
        }

        // Update dynamic modules
        const idx = dynamicModules.findIndex(m => m.id === id);
        if (idx >= 0) {
            dynamicModules[idx].title = newTitle.trim();
            dynamicModules[idx].icon = newIcon.trim();
            dynamicModules[idx].readTime = newReadTime.trim();
        }

        alert('Modul metaadatok mentve!');
        openModuleEditor(); // Refresh list
    } catch (e) {
        hideLoading();
        console.error('updateModuleMetadata error:', e);
        alert('Szerver hiba.');
    }
}

// ================================
// QUESTION EDITOR - FULL CRUD
// ================================

let __questionsCache = [];
let __currentQuestionId = null;
let __questionFilterCategory = 'all';

async function openQuestionEditor() {
    const container = document.getElementById('mainContent');
    const token = authToken || localStorage.getItem('rh_token');
    if (!container) return;

    container.innerHTML = `
      <div class="content-card">
        <h1><i class="fas fa-question-circle"></i> Vizsgakérdések szerkesztése</h1>
        
        <div style="display:flex; gap:10px; margin-bottom:15px; flex-wrap:wrap; align-items:center;">
          <button class="btn-secondary" onclick="backToTraineeView()">
            <i class="fas fa-graduation-cap"></i> Vissza a képzéshez
          </button>
          <button class="btn-secondary" onclick="showTrainerDashboard()">
            <i class="fas fa-tachometer-alt"></i> Dashboard
          </button>
          <button class="btn-primary" onclick="addNewQuestion()">
            <i class="fas fa-plus"></i> Új kérdés
          </button>
          <select id="questionCategoryFilter" onchange="filterQuestionsByCategory(this.value)" 
                  style="padding:10px; border-radius:8px; border:1px solid #ccc;">
            <option value="all">Minden kategória</option>
          </select>
          <span id="questionCount" style="color:#718096; font-size:0.9rem;"></span>
        </div>

        <div style="display:flex; gap:20px; align-items:flex-start;">
          <div style="flex:0 0 320px;">
            <div id="questionList" style="max-height:500px; overflow:auto; border:1px solid #e2e8f0; border-radius:8px; padding:6px; background:#f9fafb;">
              <div class="inline-loading" style="padding:15px;">Kérdések betöltése...</div>
            </div>
          </div>
          <div style="flex:1;" id="questionEditorPanel">
            <p style="color:#718096;">Válassz egy kérdést a listából, vagy hozz létre újat.</p>
          </div>
        </div>
      </div>
    `;

    try {
        const res = await apiCall('getQuestions', { token });
        if (!res || !res.success || !Array.isArray(res.questions)) {
            document.getElementById('questionList').innerHTML =
                '<p style="color:var(--error); padding:8px;">Hiba a kérdések betöltésekor.</p>';
            return;
        }

        __questionsCache = res.questions;
        __currentQuestionId = null;
        __questionFilterCategory = 'all';

        // Populate category filter
        const categories = [...new Set(res.questions.map(q => q.category || 'general'))];
        const filterEl = document.getElementById('questionCategoryFilter');
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            filterEl.appendChild(opt);
        });

        renderQuestionList();
    } catch (e) {
        console.error('getQuestions error:', e);
        document.getElementById('questionList').innerHTML =
            '<p style="color:var(--error); padding:8px;">Szerver hiba a kérdések betöltésekor.</p>';
    }
}

function filterQuestionsByCategory(category) {
    __questionFilterCategory = category;
    renderQuestionList();
}

function renderQuestionList() {
    const listEl = document.getElementById('questionList');
    if (!listEl) return;

    let filtered = __questionsCache;
    if (__questionFilterCategory !== 'all') {
        filtered = filtered.filter(q => (q.category || 'general') === __questionFilterCategory);
    }

    document.getElementById('questionCount').textContent = `${filtered.length} / ${__questionsCache.length} kérdés`;

    if (filtered.length === 0) {
        listEl.innerHTML = '<p style="padding:8px; color:#718096;">Nincs találat.</p>';
        return;
    }

    listEl.innerHTML = filtered.map((q, idx) => {
        const shortQ = (q.question || '').substring(0, 50) + ((q.question || '').length > 50 ? '...' : '');
        const typeIcon = q.type === 'freetext' ? 'fa-keyboard' : 'fa-list';
        const catColor = getCategoryColor(q.category);
        return `
          <div class="question-list-item" 
               style="padding:8px; border-radius:6px; margin-bottom:4px; cursor:pointer; background:#edf2f7; border-left:4px solid ${catColor};"
               onclick="selectQuestion('${q.id}')">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="flex:1; min-width:0;">
                <div style="font-weight:600; font-size:0.85rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  <i class="fas ${typeIcon}" style="color:${catColor}; margin-right:5px;"></i>${shortQ}
                </div>
                <div style="font-size:0.7rem; color:#718096;">${q.category || 'general'} | ${q.id}</div>
              </div>
              <button onclick="event.stopPropagation(); deleteQuestion('${q.id}')" 
                      style="background:none; border:none; color:var(--error); cursor:pointer; padding:4px;">
                <i class="fas fa-trash"></i>
              </button>
            </div>
          </div>
        `;
    }).join('');
}

function getCategoryColor(category) {
    const colors = {
        'security': '#e74c3c',
        'domain': '#3498db',
        'hu_domain': '#9b59b6',
        'intl_domain': '#1abc9c',
        'dns': '#f39c12',
        'email': '#e67e22',
        'hosting': '#27ae60',
        'billing': '#34495e',
        'general': '#95a5a6'
    };
    return colors[category] || colors['general'];
}

function selectQuestion(id) {
    const q = (__questionsCache || []).find(x => x.id === id);
    if (!q) return;

    __currentQuestionId = id;

    const panel = document.getElementById('questionEditorPanel');
    if (!panel) return;

    const isMultiple = (q.type || 'multiple') === 'multiple';
    let options = [];
    try {
        options = typeof q.options === 'string' ? JSON.parse(q.options) : (q.options || []);
    } catch (e) { options = []; }

    let acceptedAnswers = [];
    try {
        acceptedAnswers = typeof q.acceptedAnswers === 'string' ? JSON.parse(q.acceptedAnswers) : (q.acceptedAnswers || []);
    } catch (e) { acceptedAnswers = []; }

    panel.innerHTML = `
      <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:20px;">
        <h3 style="margin-top:0; color:var(--rh-purple);">Kérdés szerkesztése</h3>
        
        <div style="margin-bottom:15px;">
          <label style="font-weight:bold; display:block; margin-bottom:5px;">ID:</label>
          <input type="text" id="qEdit_id" value="${q.id || ''}" disabled
                 style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; background:#f5f5f5;">
        </div>

        <div style="margin-bottom:15px;">
          <label style="font-weight:bold; display:block; margin-bottom:5px;">Kategória:</label>
          <input type="text" id="qEdit_category" value="${q.category || ''}" 
                 style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;">
        </div>

        <div style="margin-bottom:15px;">
          <label style="font-weight:bold; display:block; margin-bottom:5px;">Típus:</label>
          <select id="qEdit_type" style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;">
            <option value="multiple" ${isMultiple ? 'selected' : ''}>Feleletválasztós</option>
            <option value="freetext" ${!isMultiple ? 'selected' : ''}>Szöveges</option>
          </select>
        </div>

        <div style="margin-bottom:15px;">
          <label style="font-weight:bold; display:block; margin-bottom:5px;">Kérdés:</label>
          <textarea id="qEdit_question" rows="3" 
                    style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;">${q.question || ''}</textarea>
        </div>

        <div id="multipleChoiceSection" style="margin-bottom:15px; ${isMultiple ? '' : 'display:none;'}">
          <label style="font-weight:bold; display:block; margin-bottom:5px;">Válaszlehetőségek (JSON tömb):</label>
          <textarea id="qEdit_options" rows="4" 
                    style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; font-family:monospace;">${JSON.stringify(options, null, 2)}</textarea>
          <label style="font-weight:bold; display:block; margin:10px 0 5px;">Helyes válasz indexe (0-tól):</label>
          <input type="number" id="qEdit_correct" value="${q.correctIndex ?? 0}" min="0"
                 style="width:100px; padding:8px; border:1px solid #ccc; border-radius:4px;">
        </div>

        <div id="freetextSection" style="margin-bottom:15px; ${!isMultiple ? '' : 'display:none;'}">
          <label style="font-weight:bold; display:block; margin-bottom:5px;">Elfogadott válaszok (JSON tömb):</label>
          <textarea id="qEdit_accepted" rows="3" 
                    style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; font-family:monospace;">${JSON.stringify(acceptedAnswers, null, 2)}</textarea>
        </div>

        <div style="margin-bottom:15px;">
          <label style="font-weight:bold; display:block; margin-bottom:5px;">Magyarázat:</label>
          <textarea id="qEdit_explanation" rows="2" 
                    style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px;">${q.explanation || ''}</textarea>
        </div>

        <div style="display:flex; gap:10px; justify-content:flex-end;">
          <button class="btn-secondary" onclick="openQuestionEditor()">Mégse</button>
          <button class="btn-primary" onclick="saveCurrentQuestion()">
            <i class="fas fa-save"></i> Mentés
          </button>
        </div>
      </div>
    `;

    // Toggle sections based on type
    document.getElementById('qEdit_type').addEventListener('change', function () {
        const isM = this.value === 'multiple';
        document.getElementById('multipleChoiceSection').style.display = isM ? '' : 'none';
        document.getElementById('freetextSection').style.display = isM ? 'none' : '';
    });
}

async function saveCurrentQuestion() {
    if (!__currentQuestionId) return;

    const token = authToken || localStorage.getItem('rh_token');

    const data = {
        token,
        id: __currentQuestionId,
        category: document.getElementById('qEdit_category').value.trim(),
        type: document.getElementById('qEdit_type').value,
        question: document.getElementById('qEdit_question').value.trim(),
        explanation: document.getElementById('qEdit_explanation').value.trim()
    };

    if (data.type === 'multiple') {
        try {
            data.options = JSON.parse(document.getElementById('qEdit_options').value);
        } catch (e) {
            alert('Hibás JSON a válaszlehetőségeknél!');
            return;
        }
        data.correctIndex = parseInt(document.getElementById('qEdit_correct').value) || 0;
        data.acceptedAnswers = [];
    } else {
        try {
            data.acceptedAnswers = JSON.parse(document.getElementById('qEdit_accepted').value);
        } catch (e) {
            alert('Hibás JSON az elfogadott válaszoknál!');
            return;
        }
        data.options = [];
        data.correctIndex = 0;
    }

    showLoading('KÉRDÉS MENTÉSE...');

    try {
        const res = await apiCall('saveQuestion', data);
        hideLoading();
        if (!res || !res.success) {
            alert('Hiba a mentéskor: ' + (res?.error || 'ismeretlen'));
            return;
        }
        alert('Kérdés mentve!');
        openQuestionEditor();
    } catch (e) {
        hideLoading();
        console.error('saveQuestion error:', e);
        alert('Szerver hiba a mentéskor.');
    }
}

async function addNewQuestion() {
    const id = prompt('Kérdés ID (egyedi, pl. "new_q_1"):', 'q_' + Date.now());
    if (!id || !id.trim()) return;

    const category = prompt('Kategória (pl. security, domain, hosting):', 'general');
    if (category === null) return;

    const token = authToken || localStorage.getItem('rh_token');
    showLoading('KÉRDÉS LÉTREHOZÁSA...', category);

    try {
        const res = await apiCall('createQuestion', {
            token,
            id: id.trim(),
            category: category.trim() || 'general',
            type: 'multiple',
            question: 'Új kérdés szövege...',
            options: ['Válasz A', 'Válasz B', 'Válasz C', 'Válasz D'],
            correctIndex: 0,
            acceptedAnswers: [],
            explanation: 'Magyarázat...'
        });

        hideLoading();

        if (!res || !res.success) {
            alert('Hiba a kérdés létrehozásakor: ' + (res?.error || 'ismeretlen'));
            return;
        }

        alert('Kérdés létrehozva!');
        openQuestionEditor();
    } catch (e) {
        hideLoading();
        console.error('createQuestion error:', e);
        alert('Szerver hiba.');
    }
}

async function deleteQuestion(id) {
    if (!confirm(`Biztosan törlöd a "${id}" kérdést?`)) return;

    const token = authToken || localStorage.getItem('rh_token');
    showLoading('KÉRDÉS TÖRLÉSE...', id);

    try {
        const res = await apiCall('deleteQuestion', { token, id });
        hideLoading();
        if (!res || !res.success) {
            alert('Hiba a törléskor: ' + (res?.error || 'ismeretlen'));
            return;
        }
        alert('Kérdés törölve!');
        __currentQuestionId = null;
        openQuestionEditor();
    } catch (e) {
        hideLoading();
        console.error('deleteQuestion error:', e);
        alert('Szerver hiba.');
    }
}

function riskBadge(u) {
    // Alap logika: nincs vizsga → piros, sikertelen utolsó → sárga, sikeres → zöld
    if (!u.lastExamAt) {
        return '<span class="badge badge-red">Nincs vizsga</span>';
    }
    if (u.lastExamPassed === true) {
        return '<span class="badge badge-green">OK</span>';
    }
    return '<span class="badge badge-amber">Sikertelen</span>';
}


// ================================
// USER MANAGEMENT (ADMIN)
// ================================

async function openUserManagement() {
    const container = document.getElementById('mainContent');
    const token = authToken || localStorage.getItem('rh_token');
    if (!container) return;

    container.innerHTML = `
      <div class="content-card">
        <h1><i class="fas fa-users-cog"></i> Felhasználók kezelése</h1>
        <div style="margin-bottom:15px;">
           <button class="btn-secondary" onclick="showTrainerDashboard()">
             <i class="fas fa-arrow-left"></i> Vissza a Dashboardra
           </button>
           <button class="btn-primary" onclick="loadUsersList()">
             <i class="fas fa-sync"></i> Lista frissítése
           </button>
        </div>
        <div id="usersTableContainer">
           ${getLoadingCardHTML('Felhasználók betöltése...')}
        </div>
      </div>
    `;

    loadUsersList();
}

async function loadUsersList() {
    const tableContainer = document.getElementById('usersTableContainer');
    const token = authToken || localStorage.getItem('rh_token');

    try {
        const res = await apiCall('getUsers', { token });
        if (!res || !res.success || !Array.isArray(res.users)) {
            tableContainer.innerHTML = `<p style="color:var(--error);">Hiba a felhasználók betöltésekor: ${res?.error || 'Ismeretlen hiba'}</p>`;
            return;
        }

        const rows = res.users.map(u => `
            <tr>
                <td>${u.name}</td>
                <td>${u.email}</td>
                <td>
                    <select onchange="updateUserRole('${u.id}', this.value)" style="padding:4px; border-radius:4px;">
                        <option value="trainee" ${u.role === 'trainee' ? 'selected' : ''}>Trainee</option>
                        <option value="trainer" ${u.role === 'trainer' ? 'selected' : ''}>Trainer</option>
                        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
                    </select>
                </td>
                <td>${u.created_at ? new Date(u.created_at).toLocaleDateString() : '-'}</td>
            </tr>
        `).join('');

        tableContainer.innerHTML = `
            <div style="overflow-x:auto;">
                <table class="rh-table">
                    <thead>
                        <tr>
                            <th>Név</th>
                            <th>Email</th>
                            <th>Jogosultság (Role)</th>
                            <th>Regisztrált</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
            <p style="margin-top:10px; font-size:0.9rem; color:#666;">A jogosultság módosítása azonnal érvénybe lép.</p>
        `;

    } catch (e) {
        console.error('getUsers error:', e);
        tableContainer.innerHTML = `<p style="color:var(--error);">Szerver hiba. Ellenőrizd a konzolt.</p>`;
    }
}

async function updateUserRole(userId, newRole) {
    const token = authToken || localStorage.getItem('rh_token');

    showLoading('JOGOSULTSÁG MENTÉSE...');
    try {
        const res = await apiCall('updateUserRole', { token, targetUserId: userId, newRole });
        hideLoading();

        if (res && res.success) {
            alert('Jogosultság frissítve!');
        } else {
            alert('Hiba: ' + (res?.error || 'Ismeretlen'));
            loadUsersList(); // Revert UI
        }
    } catch (e) {
        hideLoading();
        alert('Hiba történt a mentéskor.');
        loadUsersList();
    }
}
