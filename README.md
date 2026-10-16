# AuditAI – Enterprise AI Expense Audit & Fraud Detection Platform

> **College Capstone & Enterprise Audit Project**  
> An autonomous, full-stack corporate expense auditing, compliance, and fraud detection platform featuring Role-Based Access Control (RBAC), multi-level approval workflows, in-browser Tesseract.js OCR receipt scanning, append-only audit trail logs, an 11-tier heuristic AI risk engine, and an intelligent "Ask AuditAI" natural-language assistant powered by Claude.

---

## 📋 Table of Contents
1. [Project Overview & Key Upgrades](#-project-overview--key-upgrades)
2. [Roles & Permissions Matrix](#-roles--permissions-matrix)
3. [Demo Login Accounts](#-demo-login-accounts)
4. [Architecture & Folder Structure](#-architecture--folder-structure)
5. [The 11-Tier AI Fraud Detection Engine](#-the-11-tier-ai-fraud-detection-engine)
6. [Multi-Level Approval Chain Workflow](#-multi-level-approval-chain-workflow)
7. [Client-Side Receipt Upload & OCR Architecture](#-client-side-receipt-upload--ocr-architecture)
8. ["Ask AuditAI" Natural-Language Assistant (Claude)](#-ask-auditai-natural-language-assistant)
9. [MongoDB Atlas Setup Guide](#-mongodb-atlas-setup-guide)
10. [Local Development Quick Start](#-local-development-quick-start)
11. [Deployment Guide (Vercel & Render)](#-deployment-guide-vercel--render)
12. [Future Scope](#-future-scope)

---

## 🌟 Project Overview & Key Upgrades

Corporate expense fraud and compliance leaks cost enterprises millions of dollars annually. While legacy accounting relies on retroactive manual sampling, **AuditAI** implements proactive, real-time forensic auditing backed by MongoDB Atlas and a transparent, explainable heuristic AI risk engine.

### 🚀 What's New in this Upgrade:
1. **MongoDB Atlas + Mongoose**: Replaced in-memory storage with production-grade collections: `users`, `expenses`, `auditlogs`, `budgets`, and `cases`.
2. **Role-Based Access Control (RBAC)**: JWT authentication with `bcryptjs` password hashing, brute-force rate limiting (`express-rate-limit`), and `helmet` security headers.
3. **Multi-Level Approval Chains**: Dynamic routing based on claim amount and risk level (`Manager -> Auditor -> Admin`). Conflict-of-interest enforcement prevents users from approving their own expenses.
4. **Append-Only Forensic Audit Trail**: Immutable compliance event logging for logins, submissions, approvals, rejections, budget changes, and AI queries with CSV export.
5. **In-Browser Tesseract.js OCR**: Zero-server-load receipt scanning via CDN, Web Crypto SHA-256 image hashing, and regex extraction for vendor, date, and totals.
6. **Enhanced Behavioral & Split-Transaction Engine**: 11 deterministic heuristics detecting split transactions under $10k, behavioral standard deviation spikes, and high-frequency filings.
7. **Automated Non-Blocking Email Alerts**: Nodemailer SMTP integration dispatching alerts on high-risk flags and employee decision notifications.
8. **"Ask AuditAI" Claude Assistant**: Safe two-step query architecture (LLM generates validated JSON filters -> Mongoose executes -> LLM formats friendly response).

---

## 👥 Roles & Permissions Matrix

| Capability / Resource | Employee | Manager | Auditor | Admin |
|---|:---:|:---:|:---:|:---:|
| Submit Expense Claims & Upload Receipts | ✅ | ✅ | ✅ | ✅ |
| View Own Expenses | ✅ | ✅ | ✅ | ✅ |
| View Department / Team Expenses | ❌ | ✅ | ✅ | ✅ |
| View Entire Corporate Expense Registry | ❌ | ❌ | ✅ | ✅ |
| First-Level Approval / Rejection (<$10k) | ❌ | ✅ | ✅ | ✅ |
| Second-Level Approval / Rejection ($10k–$50k / High-Risk) | ❌ | ❌ | ✅ | ✅ |
| Third-Level Approval / Rejection (>$50k) | ❌ | ❌ | ❌ | ✅ |
| View Live Fraud Alerts & Risk Analytics | ❌ | ❌ | ✅ | ✅ |
| View Append-Only Audit Trail Logs & Export CSV | ❌ | ❌ | ✅ | ✅ |
| Query "Ask AuditAI" Natural-Language Assistant | ❌ | ✅ (Dept only) | ✅ | ✅ |
| Provision New Corporate Users (`POST /api/users`) | ❌ | ❌ | ❌ | ✅ |
| Manage Departmental Budgets | ❌ | ❌ | ❌ | ✅ |

---

## 🔑 Demo Login Accounts

All demo accounts are pre-seeded in the database and accessible via 1-click buttons on **`login.html`**:

| Role | Email Address | Password | Name & Department |
|---|---|---|---|
| **Employee** | `employee@auditai.com` | `Demo@123` | Sarah Jenkins *(Engineering)* |
| **Manager** | `manager@auditai.com` | `Demo@123` | David Chen *(Engineering)* |
| **Auditor** | `auditor@auditai.com` | `Demo@123` | Alex Rivera *(Finance)* |
| **Admin** | `admin@auditai.com` | `Demo@123` | Marcus Vance *(Executive)* |

---

## 📂 Architecture & Folder Structure

```
aiml project/
├── .gitignore
├── README.md
├── backend/
│   ├── .env.example              # Template with MongoDB, JWT, SMTP & Anthropic keys
│   ├── .gitignore
│   ├── package.json              # Express, Mongoose, Bcryptjs, JWT, Helmet, Nodemailer, Anthropic
│   ├── server.js                 # Server entry point with Helmet & security headers
│   ├── config/
│   │   └── db.js                 # MongoDB Atlas connection manager
│   ├── models/
│   │   ├── User.js               # RBAC user schema with bcrypt hashing
│   │   ├── Expense.js            # Multi-level approval schema & OCR metadata
│   │   ├── AuditLog.js           # Append-only forensic event log schema
│   │   ├── Budget.js             # Departmental budget tracking schema
│   │   └── Case.js               # Fraud investigation cases schema
│   ├── middleware/
│   │   └── auth.js               # JWT verification, authorizeRoles(), and audit logger
│   ├── routes/
│   │   ├── auth.js               # Login with rate limiter, profile & user provisioning
│   │   ├── expenses.js           # Scoped CRUD, stats aggregations, risk evaluation
│   │   ├── approvals.js          # Pending queue, approve/reject workflow logic
│   │   ├── auditLogs.js          # Read-only audit trail query endpoint
│   │   └── assistant.js          # Two-step Claude NLP assistant endpoint
│   ├── services/
│   │   ├── riskEngine.js         # 11-rule deterministic AI fraud detection engine
│   │   └── emailService.js       # Non-blocking Nodemailer alert dispatching
│   └── data/
│       └── seed.js               # CLI seeder: inserts demo users, budgets, ~40 expenses
└── frontend/
    ├── index.html                # Landing page with hero, capabilities & workflow
    ├── login.html                # Modern login portal with 1-click demo fillers
    ├── dashboard.html            # Main auditor dashboard, approvals queue, audit trail, chat
    ├── vercel.json               # Clean URLs configuration for Vercel
    ├── css/
    │   └── style.css             # Glassmorphism dark theme, steppers, chat widgets
    └── js/
        ├── config.js             # API_BASE_URL (Localhost vs Render toggle)
        ├── api.js                # Centralized fetch client with JWT Bearer injection
        ├── animations.js         # Count-up, circular SVG gauge, scroll reveal
        ├── dashboard.js          # RBAC visibility, Chart.js, approvals, audit logs, chat
        └── audit.js              # Expense form, Tesseract.js OCR & Web Crypto hashing
```

---

## 🧠 The 11-Tier AI Fraud Detection Engine

Every claim is assessed by the rule-based AI engine in `backend/services/riskEngine.js`, producing a deterministic score from **0 to 100**:

| # | Heuristic Rule | Condition | Penalty |
|---|---|---|:---:|
| 1 | **High Amount Ceiling** | Claim exceeds $10,000 corporate threshold | **+50** |
| 2 | **Duplicate Submission** | Exact match on employee, category, and monetary amount | **+30** |
| 3 | **Off-Hours Filing** | Submitted on weekend or between 11:00 PM and 5:00 AM | **+20** |
| 4 | **Unitemized Round Number** | Flat integer amount (e.g. $5,000 flat) lacking itemized cents | **+10** |
| 5 | **Category Statistical Outlier** | Claim exceeds 300% (3x) of the historical category average | **+25** |
| 6 | **Duplicate Receipt Hash** | Matching SHA-256 digital hash of previously uploaded receipt | **+40** |
| 7 | **Claimed vs OCR Discrepancy**| Claimed amount differs from OCR scanned receipt by >5% | **+30** |
| 8 | **Split Transaction** | Same employee/category has 2+ claims within 48h totaling >$10k while each <$10k | **+35** |
| 9 | **Behavioral Deviation** | Amount exceeds 2 standard deviations above employee's historical mean | **+25** |
| 10| **Frequency Spike** | Employee files more than 5 expenses in a single calendar day | **+15** |
| 11| **New Category Outlier** | First-time category submission for employee with high monetary value | **+10** |

- **Score Range**: 0 – 100 (Capped at 100 max)
- **Risk Tiers**: Low Risk (0–29), Medium Risk (30–59), High Risk (60+)

---

## 🔄 Multi-Level Approval Chain Workflow

AuditAI dynamically calculates the required approval hierarchy based on monetary value and calculated risk:

```
[ New Expense Submitted ]
          │
          ├── Amount < $10k & Risk Low/Medium ──────────> [ Manager Only ]
          │
          ├── $10k – $50k OR High-Risk (Score 60+) ────> [ Manager ] ──> [ Auditor ]
          │
          └── Amount > $50k ────────────────────────────> [ Manager ] ──> [ Auditor ] ──> [ Admin ]
```

### Governance Rules:
1. **Conflict of Interest Protection**: An employee or manager **cannot approve their own claims** (returns HTTP 403).
2. **Sequential Escalation**: A claim only progresses to the next authority level once the previous level approves.
3. **Mandatory Rejection Comment**: Any rejection at any stage immediately sets status to `Rejected` and requires an auditor rationale, which is permanently logged in the audit trail.

---

## 📸 Client-Side Receipt Upload & OCR Architecture

To prevent server bottlenecks and expensive backend processing:
1. **Client-Side File Processing**: User selects a receipt image (PNG/JPG up to 5 MB).
2. **Cryptographic SHA-256 Hashing**: Web Crypto API (`crypto.subtle.digest`) computes a digital fingerprint directly in the browser.
3. **In-Browser Tesseract.js OCR**: Tesseract.js executes optical character recognition client-side using WebAssembly/Web Workers via CDN, displaying a live scanning progress bar.
4. **Intelligent Regex Extraction**: Automatically parses vendor name, date, and total dollar amounts, pre-populating form fields while allowing manual user adjustments.
5. **Zero Raw Storage**: The backend never stores heavy image files—only the digital SHA-256 hash, OCR total, vendor string, and text excerpt.

---

## 🤖 "Ask AuditAI" Natural-Language Assistant

The floating AI assistant allows auditors and executives to ask unstructured questions in natural language:
- *"Show high-risk travel claims last month"*
- *"Which employee has the most flagged expenses?"*
- *"How much was rejected this week?"*

### Safe Two-Step Query Architecture:
1. **Step 1 (Structured Filter Generation)**: Claude converts the prompt into a strictly validated JSON filter:
   ```json
   {
     "category": "Travel",
     "riskLevel": "High",
     "metric": "list",
     "fromDate": "2026-09-01"
   }
   ```
2. **Step 2 (Safe Database Query & Friendly Synthesis)**: The backend validates the parameters, executes a safe, scoped Mongoose query, and feeds the resulting summary back to Claude to craft a concise, professional answer.

---

## 🍃 MongoDB Atlas Setup Guide

1. Sign up for a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas).
2. Create a free **M0 Sandbox Cluster**.
3. Under **Security ➜ Database Access**, create a user (e.g. `auditai_user`) with read/write permissions.
4. Under **Security ➜ Network Access**, click **Add IP Address** and choose **Allow Access from Anywhere (`0.0.0.0/0`)** *(Required so Render instances can connect dynamically)*.
5. In your cluster dashboard, click **Connect ➜ Drivers ➜ Node.js** and copy your connection string:
   ```env
   MONGODB_URI=mongodb+srv://auditai_user:<password>@cluster0.abcde.mongodb.net/auditai?retryWrites=true&w=majority
   ```
6. Add this `MONGODB_URI` to `backend/.env` locally and in Render's environment settings.

---

## 💻 Local Development Quick Start

### 1. Backend Setup
```bash
cd backend
npm install

# Configure your environment
cp .env.example .env
# Edit .env with your MONGODB_URI and JWT_SECRET

# Seed demo role accounts, budgets & ~40 expenses
npm run seed

# Start server
npm start
```
*Backend runs on `http://localhost:5001` (Health check: `http://localhost:5001/health`).*

### 2. Frontend Launch
```bash
cd frontend
python3 -m http.server 5500
```
Open **`http://localhost:5500/login.html`** in your browser and click any demo account to sign in!

---

## 🚀 Deployment Guide (Vercel & Render)

### Backend on Render:
1. Push to GitHub: `https://github.com/PrathamKhetan/ML-project.git`.
2. In [Render](https://render.com), create a new **Web Service**.
3. Set **Root Directory**: `backend`
4. Set **Build Command**: `npm install` and **Start Command**: `node server.js`
5. Configure Environment Variables:
   - `MONGODB_URI`: *Your MongoDB Atlas connection string*
   - `JWT_SECRET`: *Strong random secret*
   - `CLIENT_URL`: `https://your-frontend.vercel.app`
   - `ANTHROPIC_API_KEY`: *(Optional) Your Claude API key*
   - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`: *(Optional) For live emails*

### Frontend on Vercel:
1. In [Vercel](https://vercel.com), import your repository.
2. Set **Root Directory**: `frontend`
3. Framework Preset: `Other` (no build step needed)
4. Update `RENDER_BACKEND_URL` in `frontend/js/config.js` with your live Render URL.

---

## 🔮 Future Scope
- **Enterprise SSO & SAML 2.0**: Integration with Okta, Microsoft Azure AD, and Google Workspace.
- **Unsupervised ML Anomaly Detection**: Isolation Forests & One-Class SVM models running via Python microservices.
- **ERP Integration**: Native bidirectional connectors for SAP S/4HANA, NetSuite, and Tally ERP.
- **Two-Factor Authentication (2FA)**: Mandatory TOTP authenticator app verification for financial disbursements.
