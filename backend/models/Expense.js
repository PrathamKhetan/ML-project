/**
 * AuditAI - Expense Model
 * Supports multi-level approval workflow, risk analysis scoring, and receipt OCR metadata.
 */

const mongoose = require('mongoose');

const approvalStepSchema = new mongoose.Schema({
  level: {
    type: String,
    enum: ['Manager', 'Auditor', 'Admin'],
    required: true
  },
  role: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  userName: {
    type: String,
    required: true
  },
  action: {
    type: String,
    enum: ['Approved', 'Rejected'],
    required: true
  },
  comment: {
    type: String,
    default: ''
  },
  date: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const expenseSchema = new mongoose.Schema({
  id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  employee: {
    type: String,
    required: true,
    trim: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  submittedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  department: {
    type: String,
    required: true,
    index: true
  },
  category: {
    type: String,
    required: true,
    index: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: String,
    required: true
  },
  time: {
    type: String,
    default: '12:00'
  },
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected'],
    default: 'Pending',
    index: true
  },
  currentLevel: {
    type: String,
    enum: ['Manager', 'Auditor', 'Admin', 'Completed', 'Rejected'],
    default: 'Manager',
    index: true
  },
  requiredLevels: {
    type: [String],
    default: ['Manager']
  },
  approvals: [approvalStepSchema],
  riskScore: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  riskLevel: {
    type: String,
    enum: ['Low', 'Medium', 'High'],
    default: 'Low',
    index: true
  },
  reasons: {
    type: [String],
    default: []
  },
  receipt: {
    hash: { type: String, default: null, index: true },
    ocrAmount: { type: Number, default: null },
    ocrText: { type: String, default: null },
    vendor: { type: String, default: null }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Expense', expenseSchema);
