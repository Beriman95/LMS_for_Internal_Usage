# Enterprise Training & Certification Platform
**LMS for Internal Technical Support Organizations**

## 1. Executive Summary
This is a full-cycle internal Learning Management System (LMS) designed to standardize, automate, and audit technical training for L1/L2 support engineers. It replaces ad-hoc onboarding, manual exams, and uncertified knowledge transfer.

**Primary Business Objective:** Training cost reduction, faster productivity, and audit-ready certification.

## 2. Business Problem
Organizations face:
*   **Long onboarding cycles**: New hires take too long to become productive.
*   **Inconsistent training quality**: Knowledge transfer depends on who is available to teach.
*   **No measurable skill validation**: Managers cannot quantify team readiness.
*   **Manual exam handling**: Grading and administering tests consumes senior staff time.
*   **Zero audit traceability**: No proof of competency for compliance or disputes.

**These generate:**
*   High turnover costs
*   SLA deviations
*   Compliance risk

## 3. Product Objectives
*   **Automated training delivery**: Self-paced modules reduce dependency on senior staff.
*   **Controlled knowledge release**: Content access is governed by access level (L1 vs L2).
*   **Online examination & automated scoring**: Instant feedback and zero grading time.
*   **Certification with audit trail**: Immutable records of who passed what and when.
*   **Management-level reporting**: Dashboards for real-time workforce readiness visibility.

## 4. Measurable Business Impact

| Metric | Before | After |
| :--- | :--- | :--- |
| **Time-to-productivity** | 7 days | **4 hours** |
| **Training admin cost** | High (Senior staff time) | **Near-zero** (Automated) |
| **Certification traceability** | None | **100%** |
| **Knowledge leakage risk** | High | **Low** |

## 5. Functional Capabilities
*   **Role-Based Access Control (RBAC)**: Admin, Trainer, and Trainee roles with strict permission scopes.
*   **Modular Learning Tracks**: Support for multiple curricula (e.g., L1 Support, L2 Linux).
*   **Online Exams**: Interactive testing with Multiple Choice and Free Text questions (including typo-tolerance).
*   **Automated Certificate Issuance**: PDF diplomas generated and emailed automatically upon passing.
*   **Progress Analytics**: Real-time tracking of module completion and exam attempts.
*   **Admin Content Management**: WYSIWYG editor for instant course updates without code changes.
*   **Secure Content Handling**: Protected routes ensure training assets are only accessible to authorized personnel.

## 6. Compliance & Governance
*   **Full training audit trail**: Every click, module completion, and exam attempt is logged.
*   **Exam attempt history**: Retains detailed records of every answer submitted.
*   **Immutable certification records**: Certificates serve as proof of competency at a specific point in time.
*   **GDPR-conform functionality**: Data separation and user management features.

## 7. Strategic Value
*   **Scales support operations**: Add 50 new agents without needing 50 new trainers.
*   **Managed Intellectual Property**: Converts "tribal knowledge" into a documented, managed asset.
*   **Compliance Readiness**: Enables ISO-style compliance by proving staff competency.
*   **Continuous Upskilling**: Facilitates internal promotion (L1 -> L2) at low marginal cost.

## 8. Stakeholder Value Map

| Stakeholder | Benefit |
| :--- | :--- |
| **Management** | Transparent workforce readiness and reduced churn costs. |
| **HR** | Measurable training efficiency and automated certification. |
| **Technical Leads** | Standardized skill baseline across the team. |
| **Agents** | Clear, self-paced promotion and certification path. |

## 9. Product Governance
*   **Requirements**: Derived directly from operational bottlenecks (e.g., high ticket escalation rates).
*   **KPIs**: Business success defined by reduction in onboarding time and admin overhead.
*   **Logic**: Training designed as a strict, controlled pipeline (Module -> Quiz -> Exam -> Cert).
*   **Auditability**: System architecture supports external audit requirements.

## 10. Positioning Statement
This platform is not a demo LMS. It is an **operational training infrastructure** designed for real support organizations where certification, compliance, and speed determine business outcome.

---

# Technical Appendix
*(For Technical Recruiters & Engineering Leads)*

## 🛠 Tech Stack
*   **Backend**: Node.js, Express.js (REST-like API)
*   **Frontend**: Vanilla JavaScript (ES6+), HTML5, CSS3
*   **Database**: File-based LowDB-style JSON storage (Optimized for zero-maintenance deployment)
*   **Services**:
    *   **Puppeteer**: High-fidelity PDF generation for certificates.
    *   **Nodemailer**: Transactional email service for results.

## 📦 Installation & Setup

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/lms-internal-platform.git
    cd lms-internal-platform
    ```

2.  **Install Dependencies**:
    ```bash
    npm install
    ```

3.  **Seed Demo Data**:
    Initialize the database with generic "TechOps" sample content.
    ```bash
    node seed_generic_content.js
    ```

4.  **Start the Server**:
    ```bash
    node server/server.js
    ```

5.  **Access the Platform**:
    *   URL: `http://localhost:3000`
    *   **Demo Login**: No login required for initial demo registration.
    *   **Admin Access**: See `db.json` after seeding for admin credentials.

## 🔒 Security Implementation
*   **Session Management**: Custom token-based header authentication.
*   **Middleware**: Rigid `minRole()` middleware protects all Admin/API routes.
*   **Sanitization**: Input validation preventing basic injection attacks.

---
*This repository contains a sanitized, portfolio-safe version of the production system used by Rackhost Kft.*
