/**
 * AuditAI - Case Model (Fraud Investigation Cases)
 */

const mongoose = require('mongoose');

const caseSchema = new mongoose.Schema({
  caseId: {
    type: String,
    required: true,
    unique: true
  },
  expenseId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Expense',
    required: true
  },
  title: {
    type: String,
    required: true
  },
  status: {
    type: String,
    enum: ['Open', 'Under Review', 'Closed', 'Escalated'],
    default: 'Open'
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  findings: {
    type: String,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Case', caseSchema);
