# TechOps Academy (LMS Platform)

A full-stack **Learning Management System (LMS)** built with **Node.js** and **Vanilla JavaScript**, designed for internal corporate training.

This project was developed as a robust, self-hosted solution to replace a legacy Google App Script ecosystem. It features role-based access control, dual training tracks, interactive exams, and automated certification.

## 🚀 Key Features

-   **Dual Training Tracks**: Support for multiple curricula (e.g., L1 Support & L2 Linux Admin).
-   **Interactive Exams**:
    -   Includes both multiple-choice and free-text questions.
    -   Smart typo-tolerance for free-text answers.
    -   Simulated "Real World" scenarios.
-   **Admin Dashboard**:
    -   **Role Management**: Promote users to Trainers or Admins.
    -   **Content Editor**: WYSIWYG editor for Modules and Question Bank.
    -   **Analytics**: Track trainee progress and exam attempts.
-   **Automated Certification**:
    -   Generates PDF certificates upon passing.
    -   Sends automated email notifications with results.
-   **Zero-Dependency Setup**: Uses a local JSON-based database (LowDB style) for easy deployment without external SQL requirements.

## 🛠 Tech Stack

-   **Backend**: Node.js, Express.js
-   **Frontend**: Vanilla JS, HTML5, CSS3 (No framework overhead)
-   **Database**: File-based JSON storage (custom implementation)
-   **Utilities**:
    -   `Puppeteer`: For high-fidelity PDF generation.
    -   `Nodemailer`: For transactional emails.

## 📦 Installation

To run this project locally:

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/techops-academy.git
    cd techops-academy
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Seed Demo Data**:
    Populate the database with generic training modules.
    ```bash
    node seed_generic_content.js
    ```

4.  **Start the Server**:
    ```bash
    node server/server.js
    ```

5.  **Open Browser**:
    Visit `http://localhost:3000`

## 🔒 Security Features

-   **Token-Based Auth**: Custom session management system.
-   **RBAC (Role-Based Access Control)**: Middleware checks for `admin` / `trainer` privileges on sensitive routes.
-   **Input Validation**: Strict validation on exam submissions and content edits.

## 📸 Screenshots

*(Add screenshots of the Dashboard and Exam interface here)*

---
*This project is a sanitized export for portfolio purposes and does not contain proprietary company data.*
