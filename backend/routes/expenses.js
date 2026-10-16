/**
 * AuditAI - Expenses REST API Routes
 * Fully backed by MongoDB using Mongoose with role-based scoping and real-time fraud scoring.
 */

const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const User = require('../models/User');
const { evaluateRisk, getRequiredApprovalLevels } = require('../services/riskEngine');
const { authenticate, logAuditEvent } = require('../middleware/auth');
const { sendHighRiskAlert } = require('../services/emailService');

/**
 * GET /api/expenses
 * Query Parameters:
 *  - category: Filter by category (e.g. Travel)
 *  - risk: Filter by risk level (Low, Medium, High)
 *  - search: Search text
 */
router.get('/expenses', authenticate, async (req, res) => {
  try {
    const { category, risk, search } = req.query;
    const user = req.user;

    const query = {};

    // Role-based visibility scoping:
    // - Employee: only view their own expenses
    // - Manager: view their department/team expenses
    // - Auditor & Admin: view all expenses
    if (user.role === 'employee') {
      query.$or = [{ userId: user._id }, { employee: user.name }];
    } else if (user.role === 'manager') {
      if (user.department && user.department !== 'General') {
        query.department = user.department;
      }
    }

    // Filter by Category
    if (category && category !== 'all') {
      query.category = new RegExp(`^${category}$`, 'i');
    }

    // Filter by Risk Level
    if (risk && risk !== 'all') {
      query.riskLevel = new RegExp(`^${risk}$`, 'i');
    }

    // Search query
    if (search && search.trim() !== '') {
      const q = search.trim();
      const searchRegex = new RegExp(q, 'i');
      const searchConditions = [
        { employee: searchRegex },
        { description: searchRegex },
        { department: searchRegex },
        { category: searchRegex },
        { id: searchRegex }
      ];

      if (query.$or) {
        query.$and = [{ $or: query.$or }, { $or: searchConditions }];
        delete query.$or;
      } else {
        query.$or = searchConditions;
      }
    }

    const expenses = await Expense.find(query).sort({ date: -1, id: -1 }).lean();

    res.json(expenses);
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

/**
 * POST /api/expenses
 * Submits a new expense, executes the 11-rule AI risk engine, assigns approval chain,
 * and saves to MongoDB.
 */
router.post('/expenses', authenticate, async (req, res) => {
  try {
    const {
      employee,
      department,
      category,
      amount,
      description,
      date,
      time,
      receiptHash,
      ocrAmount,
      ocrText,
      ocrVendor
    } = req.body;

    const user = req.user;

    // Validation
    const empName = employee ? employee.trim() : user.name;
    const empDept = department ? department.trim() : user.department;

    if (amount === undefined || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Validation Error', message: 'A valid positive expense amount is required.' });
    }
    if (!category || typeof category !== 'string' || category.trim() === '') {
      return res.status(400).json({ error: 'Validation Error', message: 'Category is required.' });
    }
    if (!description || typeof description !== 'string' || description.trim() === '') {
      return res.status(400).json({ error: 'Validation Error', message: 'Expense description is required.' });
    }

    // Fetch existing expenses for risk evaluation (duplicates, split transactions, category averages, behavioral history)
    const existingExpenses = await Expense.find().sort({ createdAt: -1 }).limit(200).lean();

    // Generate unique ID
    const totalCount = await Expense.countDocuments();
    const newId = `EXP-${1001 + totalCount}`;

    const now = new Date();
    const formattedDate = date || now.toISOString().split('T')[0];
    const formattedTime = time || now.toTimeString().split(' ')[0].substring(0, 5);

    const expenseCandidate = {
      id: newId,
      employee: empName,
      userId: user._id,
      department: empDept,
      category: category.trim(),
      amount: parseFloat(amount),
      description: description.trim(),
      date: formattedDate,
      time: formattedTime,
      receipt: {
        hash: receiptHash || null,
        ocrAmount: ocrAmount ? parseFloat(ocrAmount) : null,
        ocrText: ocrText ? ocrText.slice(0, 500) : null,
        vendor: ocrVendor ? ocrVendor.slice(0, 100) : null
      }
    };

    // Run AI Risk Engine
    const riskAnalysis = evaluateRisk(expenseCandidate, existingExpenses);

    // Calculate dynamic approval chain
    const requiredLevels = getRequiredApprovalLevels(expenseCandidate.amount, riskAnalysis.level);

    const newExpense = new Expense({
      ...expenseCandidate,
      status: 'Pending',
      currentLevel: requiredLevels[0],
      requiredLevels,
      riskScore: riskAnalysis.score,
      riskLevel: riskAnalysis.level,
      reasons: riskAnalysis.reasons,
      approvals: []
    });

    await newExpense.save();

    // Append to AuditLog
    await logAuditEvent({
      req,
      action: 'SUBMIT_EXPENSE',
      entityType: 'Expense',
      entityId: newExpense.id,
      details: {
        amount: newExpense.amount,
        category: newExpense.category,
        riskScore: newExpense.riskScore,
        riskLevel: newExpense.riskLevel,
        hasReceipt: Boolean(receiptHash)
      }
    });

    // If receipt was submitted, also log receipt event
    if (receiptHash) {
      await logAuditEvent({
        req,
        action: 'RECEIPT_UPLOAD',
        entityType: 'Receipt',
        entityId: newExpense.id,
        details: { receiptHash, ocrAmount, ocrVendor }
      });
    }

    // If High Risk, trigger non-blocking email alerts to Auditors & Admins
    if (riskAnalysis.level === 'High') {
      User.find({ role: { $in: ['auditor', 'admin'] } }).select('email').then(async (staff) => {
        const emails = staff.map(s => s.email).filter(Boolean);
        const sent = await sendHighRiskAlert(newExpense, emails);
        if (sent) {
          await logAuditEvent({
            req,
            action: 'EMAIL_NOTIFICATION',
            entityType: 'Notification',
            entityId: newExpense.id,
            details: { type: 'HIGH_RISK_ALERT', recipients: emails }
          });
        }
      }).catch(err => console.warn('Could not query compliance staff for alerts:', err.message));
    }

    res.status(201).json(newExpense);
  } catch (error) {
    console.error('Error submitting expense:', error);
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

/**
 * GET /api/stats
 * Dashboard aggregated metrics
 */
router.get('/stats', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const query = {};

    if (user.role === 'employee') {
      query.$or = [{ userId: user._id }, { employee: user.name }];
    } else if (user.role === 'manager' && user.department && user.department !== 'General') {
      query.department = user.department;
    }

    const expenses = await Expense.find(query).lean();

    const totalExpenses = expenses.length;
    const totalAmount = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    const flaggedExpenses = expenses.filter(
      e => e.riskLevel === 'High' || e.status === 'Pending' && e.riskScore >= 60
    );
    const flaggedCount = flaggedExpenses.length;

    const totalScore = expenses.reduce((sum, e) => sum + (e.riskScore || 0), 0);
    const avgRiskScore = totalExpenses > 0 ? parseFloat((totalScore / totalExpenses).toFixed(1)) : 0;

    const rejectedAmount = expenses
      .filter(e => e.status === 'Rejected')
      .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    const flaggedHighRiskAmount = expenses
      .filter(e => e.riskLevel === 'High')
      .reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);

    const moneySaved = rejectedAmount + flaggedHighRiskAmount;

    res.json({
      totalExpenses,
      totalAmount: Math.round(totalAmount),
      flaggedCount,
      avgRiskScore,
      moneySaved: Math.round(moneySaved)
    });
  } catch (error) {
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

/**
 * GET /api/stats/monthly
 * Monthly time-series data for Line Chart
 */
router.get('/stats/monthly', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const query = {};

    if (user.role === 'employee') {
      query.$or = [{ userId: user._id }, { employee: user.name }];
    } else if (user.role === 'manager' && user.department && user.department !== 'General') {
      query.department = user.department;
    }

    const expenses = await Expense.find(query).lean();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthlyMap = {};

    expenses.forEach(e => {
      if (!e.date) return;
      const d = new Date(e.date);
      if (isNaN(d.getTime())) return;

      const key = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().slice(-2)}`;
      const sortKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

      if (!monthlyMap[key]) {
        monthlyMap[key] = { month: key, sortKey, total: 0, flagged: 0, count: 0 };
      }

      const amt = parseFloat(e.amount) || 0;
      monthlyMap[key].total += amt;
      monthlyMap[key].count += 1;
      if (e.riskLevel === 'High' || e.status === 'Rejected') {
        monthlyMap[key].flagged += amt;
      }
    });

    const sortedData = Object.values(monthlyMap).sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    res.json({
      labels: sortedData.map(d => d.month),
      totals: sortedData.map(d => Math.round(d.total)),
      flagged: sortedData.map(d => Math.round(d.flagged)),
      counts: sortedData.map(d => d.count),
      items: sortedData
    });
  } catch (error) {
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

/**
 * GET /api/stats/categories
 * Category breakdown for Doughnut and Bar charts
 */
router.get('/stats/categories', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const query = {};

    if (user.role === 'employee') {
      query.$or = [{ userId: user._id }, { employee: user.name }];
    } else if (user.role === 'manager' && user.department && user.department !== 'General') {
      query.department = user.department;
    }

    const expenses = await Expense.find(query).lean();
    const categoryMap = {};

    expenses.forEach(e => {
      const cat = e.category || 'Other';
      if (!categoryMap[cat]) {
        categoryMap[cat] = { total: 0, count: 0, flaggedCount: 0 };
      }
      categoryMap[cat].total += parseFloat(e.amount) || 0;
      categoryMap[cat].count += 1;
      if (e.riskLevel === 'High') {
        categoryMap[cat].flaggedCount += 1;
      }
    });

    const labels = Object.keys(categoryMap);
    const totals = labels.map(l => Math.round(categoryMap[l].total));
    const counts = labels.map(l => categoryMap[l].count);
    const flaggedCounts = labels.map(l => categoryMap[l].flaggedCount);

    res.json({ labels, totals, counts, flaggedCounts });
  } catch (error) {
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

/**
 * GET /api/alerts
 * High-risk / suspicious transactions requiring auditor attention
 */
router.get('/alerts', authenticate, async (req, res) => {
  try {
    const user = req.user;
    const query = {
      $or: [{ riskLevel: 'High' }, { riskScore: { $gte: 60 } }]
    };

    if (user.role === 'employee') {
      query.userId = user._id;
    } else if (user.role === 'manager' && user.department && user.department !== 'General') {
      query.department = user.department;
    }

    const alerts = await Expense.find(query).sort({ riskScore: -1, date: -1 }).limit(20).lean();
    res.json(alerts);
  } catch (error) {
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

/**
 * PATCH /api/expenses/:id/status
 * Backwards-compatible status update (for quick actions)
 */
router.patch('/expenses/:id/status', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ['Approved', 'Rejected', 'Pending'];
    const normalizedStatus = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

    if (!allowed.includes(normalizedStatus)) {
      return res.status(400).json({ error: 'Validation Error', message: 'Status must be Approved, Rejected, or Pending.' });
    }

    const expense = await Expense.findOne({
      $or: [{ id: id }, { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null }]
    });

    if (!expense) {
      return res.status(404).json({ error: 'Not Found', message: `Expense ${id} was not found.` });
    }

    // Role check: Only manager, auditor, admin can change status
    if (req.user.role === 'employee') {
      return res.status(403).json({ error: 'Forbidden', message: 'Employees cannot change expense status.' });
    }

    expense.status = normalizedStatus;
    if (normalizedStatus === 'Approved') expense.currentLevel = 'Completed';
    if (normalizedStatus === 'Rejected') expense.currentLevel = 'Rejected';

    await expense.save();

    await logAuditEvent({
      req,
      action: 'STATUS_CHANGE',
      entityType: 'Expense',
      entityId: expense.id,
      details: { newStatus: normalizedStatus }
    });

    res.json(expense);
  } catch (error) {
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

module.exports = router;
