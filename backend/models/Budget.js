/**
 * AuditAI - Budget Model
 * Tracks allocated vs spent budgets by department.
 */

const mongoose = require('mongoose');

const budgetSchema = new mongoose.Schema({
  department: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  allocated: {
    type: Number,
    required: true,
    min: 0
  },
  spent: {
    type: Number,
    default: 0,
    min: 0
  },
  period: {
    type: String,
    default: '2026-Annual'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Budget', budgetSchema);
