/**
 * AuditAI - "Ask AuditAI" Natural-Language Assistant
 * Uses Claude (Anthropic API) via a secure, two-step query architecture.
 * Raw database queries are never run from the LLM; instead, the model outputs
 * structured JSON filters that are strictly validated and executed through Mongoose.
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { Anthropic } = require('@anthropic-ai/sdk');
const Expense = require('../models/Expense');
const { authenticate, authorizeRoles, logAuditEvent } = require('../middleware/auth');

// Rate limiting: 10 requests per minute per user
const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  keyGenerator: (req) => (req.user ? String(req.user._id) : req.ip),
  message: {
    error: 'Too Many Requests',
    message: 'Assistant query rate limit reached (10 requests/min). Please wait a moment.'
  }
});

// Initialize Anthropic Client
let anthropicClient = null;
function getAnthropicClient() {
  if (!anthropicClient && process.env.ANTHROPIC_API_KEY) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }
  return anthropicClient;
}

/**
 * POST /api/assistant
 * Allowed for auditor, admin, and managers.
 */
router.post('/assistant', authenticate, authorizeRoles('auditor', 'admin', 'manager'), assistantLimiter, async (req, res) => {
  const { question } = req.body;

  if (!question || typeof question !== 'string' || question.trim() === '') {
    return res.status(400).json({ error: 'Validation Error', message: 'A natural language question is required.' });
  }

  const user = req.user;
  const userRole = user.role;
  const userDept = user.department;

  try {
    const client = getAnthropicClient();
    const model = process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022';

    // Step 1: Fallback or Claude Filter Generation
    let filters = { metric: 'list' };

    if (client) {
      const filterPrompt = `You are the query planner for AuditAI corporate expense audit platform.
Convert this user question into a JSON filter object.
Output ONLY valid JSON and nothing else. No markdown, no backticks, no comments.
Schema:
{
  "category": string or null (e.g. "Travel", "Meals & Entertainment", "Equipment", "Software & IT", "Office Supplies", "Consulting"),
  "riskLevel": string or null ("Low", "Medium", "High"),
  "status": string or null ("Pending", "Approved", "Rejected"),
  "employee": string or null,
  "fromDate": string or null (YYYY-MM-DD),
  "toDate": string or null (YYYY-MM-DD),
  "minAmount": number or null,
  "maxAmount": number or null,
  "metric": "list" | "count" | "sum" | "average"
}

User question: "${question.trim()}"`;

      try {
        const response = await client.messages.create({
          model,
          max_tokens: 300,
          temperature: 0,
          messages: [{ role: 'user', content: filterPrompt }]
        });

        const rawText = response.content[0].text.trim().replace(/^```json\s*/, '').replace(/\s*```$/, '');
        filters = JSON.parse(rawText);
      } catch (err) {
        console.warn('Claude Step 1 failed, using rule-based parsing:', err.message);
        filters = parseFallbackFilters(question);
      }
    } else {
      // Rule-based fallback if Anthropic API key is not configured
      filters = parseFallbackFilters(question);
    }

    // Step 2: Build Safe Mongoose Query
    const query = {};

    // Role-based scoping: Managers only see their department
    if (userRole === 'manager') {
      query.department = userDept;
    }

    if (filters.category) query.category = new RegExp(`^${filters.category}$`, 'i');
    if (filters.riskLevel) query.riskLevel = new RegExp(`^${filters.riskLevel}$`, 'i');
    if (filters.status) query.status = new RegExp(`^${filters.status}$`, 'i');
    if (filters.employee) query.employee = new RegExp(filters.employee, 'i');

    if (filters.minAmount || filters.maxAmount) {
      query.amount = {};
      if (filters.minAmount) query.amount.$gte = Number(filters.minAmount);
      if (filters.maxAmount) query.amount.$lte = Number(filters.maxAmount);
    }

    if (filters.fromDate || filters.toDate) {
      query.date = {};
      if (filters.fromDate) query.date.$gte = filters.fromDate;
      if (filters.toDate) query.date.$lte = filters.toDate;
    }

    // Execute query
    const matchingExpenses = await Expense.find(query).sort({ date: -1, amount: -1 }).limit(15).lean();
    const totalCount = await Expense.countDocuments(query);
    const totalAmount = matchingExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

    const dataSummary = {
      totalFound: totalCount,
      sampleSize: matchingExpenses.length,
      sampleSum: Math.round(totalAmount),
      metric: filters.metric || 'list',
      records: matchingExpenses.map(e => ({
        id: e.id,
        employee: e.employee,
        department: e.department,
        category: e.category,
        amount: e.amount,
        riskScore: e.riskScore,
        riskLevel: e.riskLevel,
        status: e.status,
        date: e.date,
        reasons: e.reasons
      }))
    };

    // Step 3: Generate friendly response with Claude or smart template
    let answer = '';
    if (client) {
      try {
        const answerPrompt = `You are AuditAI, an expert AI compliance auditor.
Question: "${question}"
Data retrieved from database:
${JSON.stringify(dataSummary, null, 2)}

Provide a concise, professional, friendly response (2-4 sentences). Mention specific numbers, names, or amounts if present. If no records were found, explain clearly.`;

        const finalResponse = await client.messages.create({
          model,
          max_tokens: 400,
          temperature: 0.2,
          messages: [{ role: 'user', content: answerPrompt }]
        });
        answer = finalResponse.content[0].text;
      } catch (err) {
        answer = formatFallbackAnswer(question, dataSummary);
      }
    } else {
      answer = formatFallbackAnswer(question, dataSummary);
    }

    // Append to AuditLog
    await logAuditEvent({
      req,
      action: 'AI_ASSISTANT_QUERY',
      entityType: 'Assistant',
      details: { question, filters, resultsCount: totalCount }
    });

    res.json({
      answer,
      filters,
      summary: {
        totalRecords: totalCount,
        sampleCount: matchingExpenses.length
      }
    });

  } catch (error) {
    console.error('Assistant route error:', error);
    res.status(500).json({ error: 'Server Error', message: error.message });
  }
});

// Helper: Rule-based filter extractor when LLM key is absent
function parseFallbackFilters(q) {
  const lower = q.toLowerCase();
  const filters = { metric: 'list' };

  if (lower.includes('high') || lower.includes('flagged') || lower.includes('fraud')) filters.riskLevel = 'High';
  else if (lower.includes('medium')) filters.riskLevel = 'Medium';
  else if (lower.includes('low')) filters.riskLevel = 'Low';

  if (lower.includes('rejected')) filters.status = 'Rejected';
  else if (lower.includes('approved')) filters.status = 'Approved';
  else if (lower.includes('pending')) filters.status = 'Pending';

  if (lower.includes('travel')) filters.category = 'Travel';
  else if (lower.includes('meal') || lower.includes('food') || lower.includes('entertainment')) filters.category = 'Meals & Entertainment';
  else if (lower.includes('software') || lower.includes('it')) filters.category = 'Software & IT';
  else if (lower.includes('equipment')) filters.category = 'Equipment';
  else if (lower.includes('supplies')) filters.category = 'Office Supplies';
  else if (lower.includes('consulting')) filters.category = 'Consulting';

  if (lower.includes('how much') || lower.includes('sum') || lower.includes('total')) filters.metric = 'sum';
  if (lower.includes('how many') || lower.includes('count')) filters.metric = 'count';

  return filters;
}

// Helper: Human-readable answer template generator
function formatFallbackAnswer(q, summary) {
  if (summary.totalFound === 0) {
    return `No matching expense records were found for your query ("${q}"). All audited transactions in this scope appear compliant.`;
  }

  const topSample = summary.records.slice(0, 3).map(r => `${r.id} (${r.employee}, $${r.amount.toLocaleString()} - ${r.riskLevel} Risk)`).join(', ');
  return `Found ${summary.totalFound} matching transaction(s). The total volume for the top matching records is $${summary.sampleSum.toLocaleString()}. Recent claims include: ${topSample}.`;
}

module.exports = router;
