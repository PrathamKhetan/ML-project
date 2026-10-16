/**
 * AuditAI - Audit Log Query Routes
 * Allows compliance auditors and admins to inspect the append-only audit trail.
 * NOTE: Strictly READ-ONLY routes. No POST, PUT, PATCH, or DELETE exist.
 */

const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { authenticate, authorizeRoles } = require('../middleware/auth');

/**
 * GET /api/audit-logs
 * Query Parameters:
 *  - user: filter by userName or email
 *  - action: filter by action name (e.g. LOGIN, SUBMIT_EXPENSE, APPROVE_EXPENSE)
 *  - from: start ISO date
 *  - to: end ISO date
 *  - page: page number (default 1)
 *  - limit: items per page (default 25)
 */
router.get('/audit-logs', authenticate, authorizeRoles('auditor', 'admin'), async (req, res) => {
  try {
    const { user, action, from, to, page = 1, limit = 25 } = req.query;

    const query = {};

    if (user && user.trim() !== '') {
      query.userName = { $regex: user.trim(), $options: 'i' };
    }

    if (action && action.trim() !== '' && action !== 'all') {
      query.action = action.trim();
    }

    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        query.timestamp.$lte = toDate;
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    const [logs, total] = await Promise.all([
      AuditLog.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      AuditLog.countDocuments(query)
    ]);

    res.json({
      logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

module.exports = router;
