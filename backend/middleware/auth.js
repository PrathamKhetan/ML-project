/**
 * AuditAI - Authentication & Authorization Middleware
 * Verifies JWT tokens, enforces Role-Based Access Control (RBAC),
 * and provides append-only audit logging utility.
 */

const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');

const JWT_SECRET = process.env.JWT_SECRET || 'auditai_dev_jwt_secret_key_2026!';

/**
 * JWT Authentication Middleware
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication token missing or invalid. Please log in.'
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    // Find user from database
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'The account associated with this token no longer exists.'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Unauthorized', message: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Unauthorized', message: 'Invalid authentication token.' });
  }
}

/**
 * Role-Based Access Control Middleware
 * Usage: authorizeRoles('admin', 'auditor')
 */
function authorizeRoles(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: `Access denied. Requires one of the following roles: ${allowedRoles.join(', ')}.`
      });
    }
    next();
  };
}

/**
 * Append-Only Audit Logging Helper
 */
async function logAuditEvent({ req, action, entityType, entityId, details = {}, userId, userName, role }) {
  try {
    const ipAddress = (req && (req.headers['x-forwarded-for'] || req.socket.remoteAddress)) || '127.0.0.1';

    const uId = userId || (req && req.user && req.user._id) || null;
    const uName = userName || (req && req.user && req.user.name) || 'System';
    const uRole = role || (req && req.user && req.user.role) || 'system';

    await AuditLog.create({
      userId: uId,
      userName: uName,
      role: uRole,
      action,
      entityType,
      entityId: entityId ? String(entityId) : null,
      details,
      ipAddress: String(ipAddress),
      timestamp: new Date()
    });
  } catch (err) {
    console.error('Failed to append audit log:', err.message);
  }
}

module.exports = {
  authenticate,
  authorizeRoles,
  logAuditEvent,
  JWT_SECRET
};
