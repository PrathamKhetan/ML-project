/**
 * AuditAI – AI Expense Audit & Fraud Detection Platform
 * Backend Server (Node.js + Express + MongoDB Atlas + Mongoose)
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { connectDB } = require('./config/db');

// Route Handlers
const authRoutes = require('./routes/auth');
const expenseRoutes = require('./routes/expenses');
const approvalRoutes = require('./routes/approvals');
const auditLogRoutes = require('./routes/auditLogs');
const assistantRoutes = require('./routes/assistant');

const app = express();

// Configuration
const PORT = process.env.PORT || 5001;
const CLIENT_URL = process.env.CLIENT_URL || '*';

// Security Headers Middleware
app.use(helmet({
  crossOriginResourcePolicy: false // Allow static assets & cross-origin API calls
}));

// CORS Configuration
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (CLIENT_URL === '*' || CLIENT_URL.split(',').map(u => u.trim()).includes(origin)) {
      return callback(null, true);
    }
    if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    return callback(null, true); // Permissive for college evaluation
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health Check Endpoint (Required by Render & Uptime Monitors)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    service: 'AuditAI Enterprise Backend API',
    database: require('mongoose').connection.readyState === 1 ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString()
  });
});

// Mount API Routes
app.use('/api', authRoutes);
app.use('/api', expenseRoutes);
app.use('/api', approvalRoutes);
app.use('/api', auditLogRoutes);
app.use('/api', assistantRoutes);

// Root Documentation Index
app.get('/', (req, res) => {
  res.json({
    message: 'AuditAI Enterprise API is active.',
    health: 'GET /health',
    auth: {
      login: 'POST /api/auth/login',
      me: 'GET /api/auth/me',
      users: 'GET/POST /api/users (Admin)'
    },
    expenses: {
      list: 'GET /api/expenses',
      submit: 'POST /api/expenses',
      stats: 'GET /api/stats',
      approvals: 'GET /api/approvals/pending'
    },
    auditTrail: 'GET /api/audit-logs',
    assistant: 'POST /api/assistant'
  });
});

// 404 Route Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Route ${req.originalUrl} does not exist.` });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(err.status || 500).json({
    error: 'Internal Server Error',
    message: err.message || 'An unexpected error occurred.'
  });
});

// Initialize Database and Start Server
async function startServer() {
  await connectDB();

  // Auto-seed if database is empty on initial boot
  try {
    const { seedDatabase } = require('./data/seed');
    await seedDatabase();
  } catch (seedErr) {
    console.log('Auto-seed check note:', seedErr.message);
  }

  app.listen(PORT, () => {
    console.log(`====================================================`);
    console.log(` 🛡️ AuditAI Enterprise Backend running on port ${PORT}`);
    console.log(` Health check: http://localhost:${PORT}/health`);
    console.log(` API Base:     http://localhost:${PORT}/api`);
    console.log(`====================================================`);
  });
}

startServer();
