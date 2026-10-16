/**
 * AuditAI - AuditLog Model (Append-Only)
 * Provides tamper-evident compliance history for all critical system activities.
 * NOTE: This collection is strictly append-only. No update or delete operations are permitted.
 */

const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
    index: true
  },
  userName: {
    type: String,
    required: true,
    default: 'System'
  },
  role: {
    type: String,
    required: true,
    default: 'system'
  },
  action: {
    type: String,
    required: true,
    index: true
  },
  entityType: {
    type: String,
    required: true,
    enum: ['User', 'Expense', 'Budget', 'Assistant', 'Auth', 'Receipt', 'Notification'],
    index: true
  },
  entityId: {
    type: String,
    default: null
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  ipAddress: {
    type: String,
    default: '127.0.0.1'
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true
  }
});

// Guard: Prevent any update or delete hooks at Mongoose schema level
auditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'], function() {
  throw new Error('AuditLog is append-only. Modification and deletion are strictly forbidden.');
});

module.exports = mongoose.model('AuditLog', auditLogSchema);
