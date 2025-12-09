const fs = require('fs');
const path = require('path');
const { writeDb } = require('./server/utils/db');

// Generic Seed Data for Portfolio
const modules = [
    {
        id: "module_01",
        title: "1. Intro to TechOps",
        icon: "fa-server",
        readTime: "15 min",
        track: "L1",
        content: `
            <h1>Welcome to TechOps Academy</h1>
            <p>This is a demonstration platform for an internal Learning Management System (LMS).</p>
            <h2>What is L1 Support?</h2>
            <p>L1 Support is the first line of defense in IT operations. You handle tickets, basic troubleshooting, and user communication.</p>
            <div class="sci-box">
                <span class="tooltip-title">GOLDEN RULE</span>
                <p><b>"Verify before you trust."</b> Always authenticate the user before making changes to their account.</p>
            </div>
            <h3>Key Responsibilities:</h3>
            <ul>
                <li>User Authentication</li>
                <li>Password Resets</li>
                <li>Basic DNS Management</li>
            </ul>
        `,
        quizzes: [
            {
                question: "What is the first step in handling a user request?",
                options: ["Do what they ask immediately", "Verify their identity", "Escalate to L2", "Ignore the ticket"],
                correctIndex: 1,
                explanation: "Security first! Always verify who you are talking to."
            }
        ]
    },
    {
        id: "module_linux_01",
        title: "1. Linux Fundamentals",
        icon: "fab fa-linux",
        readTime: "20 min",
        track: "L2",
        content: `
            <h1>Linux Basics</h1>
            <p>Welcome to the L2 Linux track. Here we dive deeper into the OS layer.</p>
            <h2>The Terminal</h2>
            <p>Linux is often managed via the CLI (Command Line Interface). The most common shell is Bash.</p>
            <pre><code>ls -la
pwd
whoami</code></pre>
            <p>These are your bread and butter commands.</p>
        `,
        quizzes: [
            {
                question: "Which command lists files in a directory?",
                options: ["cd", "ls", "pwd", "rm"],
                correctIndex: 1,
                explanation: "'ls' stands for list."
            }
        ]
    }
];

const questions = [
    {
        id: "q_gen_1",
        category: "general",
        type: "multiple",
        question: "What does DNS stand for?",
        options: ["Domain Name System", "Dynamic Network Service", "Digital Name Server", "Direct Network Socket"],
        correctIndex: 0,
        track: "L1"
    },
    {
        id: "q_linux_1",
        category: "linux",
        type: "multiple",
        question: "What is the root directory in Linux?",
        options: ["C:\\", "/root", "/", "/home"],
        correctIndex: 2,
        track: "L2"
    }
];

const users = [
    {
        id: "admin_user",
        email: "admin@example.com",
        name: "Demo Admin",
        role: "admin",
        created_at: new Date().toISOString()
    }
];

const db = {
    users,
    sessions: [],
    progress: [],
    examAttempts: [],
    modules,
    questions
};

// Write to clean DB
const dataDir = path.join(__dirname, 'server/data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

writeDb(db);
console.log('Generic portfolio content seeded successfully!');
