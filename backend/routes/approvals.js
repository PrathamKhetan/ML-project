/**
 * AuditAI - Multi-Level Approval Workflow Routes
 * Manages hierarchical approval chains: Manager -> Auditor -> Admin.
 */

const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const User = require('../models/User');
const { authenticate, authorizeRoles, logAuditEvent } = require('../middleware/auth');
const { sendStatusUpdateEmail } = require('../services/emailService');

/**
 * GET /api/approvals/pending
 * Retrieves items pending approval for the logged-in user's role.
 */
router.get('/approvals/pending', authenticate, authorizeRoles('manager', 'auditor', 'admin'), async (req, res) => {
  try {
    const userRole = req.user.role;
    const userDept = req.user.department;
    const userId = req.user._id;

    const query = { status: 'Pending' };

    if (userRole === 'manager') {
      query.currentLevel = 'Manager';
      // If manager has a specific department, filter to team; otherwise allow department or general
      if (userDept && userDept !== 'General') {
        query.department = userDept;
      }
    } else if (userRole === 'auditor') {
      query.currentLevel = 'Auditor';
    } else if (userRole === 'admin') {
      query.currentLevel = 'Admin';
    }

    // Exclude own expenses from approval queue (cannot approve own expense)
    query.userId = { $ne: userId };

    const pendingExpenses = await Expense.find(query).sort({ riskScore: -1, date: -1 });

    res.json(pendingExpenses);
  } catch (error) {
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

/**
 * POST /api/expenses/:id/approve
 * Approves an expense at the current level and advances the workflow.
 */
router.post('/expenses/:id/approve', authenticate, authorizeRoles('manager', 'auditor', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { comment = '' } = req.body;
    const user = req.user;

    const expense = await Expense.findOne({
      $or: [{ id: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }]
    });

    if (!expense) {
      return res.status(404).json({ error: 'Not Found', message: `Expense ${id} was not found.` });
    }

    if (expense.status !== 'Pending') {
      return res.status(400).json({
        error: 'Invalid Action',
        message: `Expense is already in '${expense.status}' state.`
      });
    }

    // Rule: Users cannot approve their own expense
    if (expense.userId && expense.userId.toString() === user._id.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Conflict of interest: You cannot approve your own expense claim.'
      });
    }

    // Validate role against current approval level
    const roleLevelMap = {
      manager: 'Manager',
      auditor: 'Auditor',
      admin: 'Admin'
    };
    const expectedLevel = roleLevelMap[user.role];

    if (expense.currentLevel !== expectedLevel && user.role !== 'admin') {
      return res.status(403).json({
        error: 'Forbidden',
        message: `This expense requires review by a ${expense.currentLevel}. Current role: ${user.role}.`
      });
    }

    // Add approval record
    const approvalRecord = {
      level: expense.currentLevel,
      role: user.role,
      userId: user._id,
      userName: user.name,
      action: 'Approved',
      comment: comment.trim(),
      date: new Date()
    };
    expense.approvals.push(approvalRecord);

    // Determine next step in workflow chain
    const levels = expense.requiredLevels && expense.requiredLevels.length > 0
      ? expense.requiredLevels
      : ['Manager'];

    const currentIndex = levels.indexOf(expense.currentLevel);

    if (currentIndex >= 0 && currentIndex < levels.length - 1) {
      // Advance to next level
      expense.currentLevel = levels[currentIndex + 1];
      expense.status = 'Pending';
    } else {
      // Final approval complete!
      expense.currentLevel = 'Completed';
      expense.status = 'Approved';

      // Send non-blocking approval email to employee
      if (expense.userId) {
        User.findById(expense.userId).then(empUser => {
          if (empUser && empUser.email) {
            sendStatusUpdateEmail(expense, empUser.email, 'Approved', comment);
          }
        }).catch(err => console.warn('Could not fetch employee email for notification:', err.message));
      }
    }

    await expense.save();

    // Append to AuditLog
    await logAuditEvent({
      req,
      action: 'APPROVE_EXPENSE',
      entityType: 'Expense',
      entityId: expense.id,
      details: {
        amount: expense.amount,
        approvedLevel: approvalRecord.level,
        nextLevel: expense.currentLevel,
        finalStatus: expense.status,
        comment
      }
    });

    res.json(expense);
  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

/**
 * POST /api/expenses/:id/reject
 * Rejects an expense with mandatory comment.
 */
router.post('/expenses/:id/reject', authenticate, authorizeRoles('manager', 'auditor', 'admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { comment } = req.body;
    const user = req.user;

    // Rejection comment is strictly mandatory
    if (!comment || typeof comment !== 'string' || comment.trim() === '') {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'A mandatory comment explaining the reason for rejection is required.'
      });
    }

    const expense = await Expense.findOne({
      $or: [{ id: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }]
    });

    if (!expense) {
      return res.status(404).json({ error: 'Not Found', message: `Expense ${id} was not found.` });
    }

    // Rule: Users cannot reject their own expense
    if (expense.userId && expense.userId.toString() === user._id.toString()) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Conflict of interest: You cannot review your own expense claim.'
      });
    }

    // Add rejection record
    const rejectionRecord = {
      level: expense.currentLevel,
      role: user.role,
      userId: user._id,
      userName: user.name,
      action: 'Rejected',
      comment: comment.trim(),
      date: new Date()
    };
    expense.approvals.push(rejectionRecord);

    expense.status = 'Rejected';
    expense.currentLevel = 'Rejected';

    await expense.save();

    // Send non-blocking rejection email to employee
    if (expense.userId) {
      User.findById(expense.userId).then(empUser => {
        if (empUser && empUser.email) {
          sendStatusUpdateEmail(expense, empUser.email, 'Rejected', comment.trim());
        }
      }).catch(err => console.warn('Could not fetch employee email for rejection notification:', err.message));
    }

    // Append to AuditLog
    await logAuditEvent({
      req,
      action: 'REJECT_EXPENSE',
      entityType: 'Expense',
      entityId: expense.id,
      details: {
        amount: expense.amount,
        rejectedAtLevel: rejectionRecord.level,
        comment: comment.trim()
      }
    });

    res.json(expense);
  } catch (error) {
    console.error('Rejection error:', error);
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

module.exports = router;
