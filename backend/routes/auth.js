/**
 * AuditAI - Authentication & User Management Routes
 * Handles login, current user profile, and admin-only user creation.
 */

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { authenticate, authorizeRoles, logAuditEvent, JWT_SECRET } = require('../middleware/auth');

// Rate limiting for login attempts (Brute force protection)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 attempts per window
  message: {
    error: 'Too Many Requests',
    message: 'Too many login attempts from this IP. Please try again after 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * POST /api/auth/login
 * Authenticates user credentials and issues a signed JWT token.
 */
router.post('/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Both email and password are required.'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid credentials. Please verify your email and password.'
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid credentials. Please verify your email and password.'
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Append to AuditLog
    await logAuditEvent({
      req,
      action: 'LOGIN',
      entityType: 'Auth',
      entityId: String(user._id),
      userId: user._id,
      userName: user.name,
      role: user.role,
      details: { email: user.email, department: user.department }
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

/**
 * GET /api/auth/me
 * Retrieves current authenticated user profile.
 */
router.get('/auth/me', authenticate, async (req, res) => {
  res.json({
    user: req.user
  });
});

/**
 * POST /api/users
 * Admin-only user provisioning.
 */
router.post('/users', authenticate, authorizeRoles('admin'), async (req, res) => {
  try {
    const { name, email, password, role, department } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'Name, email, and password are required.'
      });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      return res.status(400).json({
        error: 'Validation Error',
        message: 'A user with this email already exists.'
      });
    }

    const newUser = new User({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: role || 'employee',
      department: department || 'Engineering'
    });

    await newUser.save();

    // Append to AuditLog
    await logAuditEvent({
      req,
      action: 'USER_CREATED',
      entityType: 'User',
      entityId: String(newUser._id),
      details: { email: newUser.email, role: newUser.role, department: newUser.department }
    });

    res.status(201).json(newUser);
  } catch (error) {
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

/**
 * GET /api/users
 * Auditor/Admin list of corporate users (for assignees, reporting)
 */
router.get('/users', authenticate, authorizeRoles('admin', 'auditor'), async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ name: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

module.exports = router;
