/**
 * AuditAI - Database Seeder
 * Can be executed via: npm run seed
 * Inserts demo role accounts and ~40 realistic corporate expenses (only if DB is empty).
 */

require('dotenv').config();
const mongoose = require('mongoose');
const { connectDB } = require('../config/db');
const User = require('../models/User');
const Expense = require('../models/Expense');
const Budget = require('../models/Budget');
const AuditLog = require('../models/AuditLog');
const { evaluateRisk, getRequiredApprovalLevels } = require('../services/riskEngine');

// Demo Accounts across all 4 roles (Password: Demo@123)
const demoUsers = [
  {
    name: 'Sarah Jenkins',
    email: 'employee@auditai.com',
    password: 'Demo@123',
    role: 'employee',
    department: 'Engineering'
  },
  {
    name: 'David Chen',
    email: 'manager@auditai.com',
    password: 'Demo@123',
    role: 'manager',
    department: 'Engineering'
  },
  {
    name: 'Alex Rivera',
    email: 'auditor@auditai.com',
    password: 'Demo@123',
    role: 'auditor',
    department: 'Finance'
  },
  {
    name: 'Marcus Vance',
    email: 'admin@auditai.com',
    password: 'Demo@123',
    role: 'admin',
    department: 'Executive'
  }
];

// ~40 Realistic Corporate Expenses
const rawExpenses = [
  // High Risk / Anomaly Cases
  { employee: "Marcus Vance", department: "Executive", category: "Equipment", amount: 14500, description: "Executive high-end workstation & dual OLED monitors", date: "2026-10-12", time: "23:45", status: "Pending" },
  { employee: "Alex Rivera", department: "Sales", category: "Meals & Entertainment", amount: 3200, description: "VIP Client Dinner & Lounge reservation", date: "2026-10-10", time: "01:30", status: "Pending" },
  { employee: "Alex Rivera", department: "Sales", category: "Meals & Entertainment", amount: 3200, description: "Duplicate VIP Client Dinner & Lounge booking", date: "2026-10-11", time: "14:15", status: "Rejected" },
  { employee: "David Chen", department: "Engineering", category: "Consulting", amount: 12000, description: "Quarterly architectural security audit retainer", date: "2026-10-04", time: "02:10", status: "Pending" },
  { employee: "Sophia Martinez", department: "Marketing", category: "Travel", amount: 11200, description: "First class transatlantic flights to Global Summit", date: "2026-09-28", time: "16:20", status: "Pending" },
  { employee: "Jordan Reed", department: "Sales", category: "Meals & Entertainment", amount: 5000, description: "Unitemized enterprise client banquet", date: "2026-09-27", time: "23:15", status: "Pending" },
  { employee: "Liam Davis", department: "Finance", category: "Software & IT", amount: 10500, description: "Annual Enterprise Analytics Platform license renewal", date: "2026-09-15", time: "11:00", status: "Approved" },
  { employee: "Emily Watson", department: "Operations", category: "Equipment", amount: 4000, description: "Unitemized warehouse barcode scanners bulk order", date: "2026-09-06", time: "00:40", status: "Rejected" },

  // Medium Risk Cases
  { employee: "Nathan Drake", department: "Marketing", category: "Meals & Entertainment", amount: 2500, description: "Product launch celebration dinner for 12 partners", date: "2026-09-19", time: "22:15", status: "Pending" },
  { employee: "Sarah Jenkins", department: "Engineering", category: "Software & IT", amount: 3000, description: "Team JetBrains & GitHub Copilot Enterprise seats", date: "2026-08-25", time: "15:40", status: "Approved" },
  { employee: "Chloe Bennet", department: "Human Resources", category: "Consulting", amount: 4500, description: "Executive recruiting firm candidate search retainer", date: "2026-08-20", time: "11:25", status: "Approved" },
  { employee: "Alex Rivera", department: "Sales", category: "Travel", amount: 2000, description: "Regional sales roadshow hotel suite accommodation", date: "2026-08-16", time: "13:00", status: "Approved" },
  { employee: "Michael Scott", department: "Sales", category: "Office Supplies", amount: 1800, description: "Bulk specialty paper & ergonomic executive chairs", date: "2026-08-08", time: "10:30", status: "Rejected" },
  { employee: "Robert Taylor", department: "Finance", category: "Consulting", amount: 5000, description: "Mid-year tax advisory & compliance consulting", date: "2026-07-29", time: "14:00", status: "Approved" },
  { employee: "Jessica Taylor", department: "Marketing", category: "Meals & Entertainment", amount: 1500, description: "Media influencer dinner & sponsorship kickoff", date: "2026-07-18", time: "21:30", status: "Pending" },
  { employee: "David Chen", department: "Engineering", category: "Equipment", amount: 3500, description: "Specialized lab test server rack components", date: "2026-07-12", time: "16:45", status: "Approved" },

  // Low Risk / Standard Cases
  { employee: "Sarah Jenkins", department: "Engineering", category: "Software & IT", amount: 180, description: "Monthly AWS cloud sandbox test environments", date: "2026-10-14", time: "10:15", status: "Approved" },
  { employee: "Emily Watson", department: "Operations", category: "Office Supplies", amount: 85, description: "Shipping labels, printer cartridges & packaging tape", date: "2026-10-13", time: "14:20", status: "Approved" },
  { employee: "Alex Rivera", department: "Sales", category: "Travel", amount: 450, description: "Domestic flight - SFO to SEA for quarterly client pitch", date: "2026-10-09", time: "09:30", status: "Approved" },
  { employee: "Sophia Martinez", department: "Marketing", category: "Meals & Entertainment", amount: 125, description: "Coffee and breakfast meeting with creative agency", date: "2026-10-07", time: "08:45", status: "Approved" },
  { employee: "David Chen", department: "Engineering", category: "Software & IT", amount: 340, description: "Datadog monitoring & APM developer seat subscription", date: "2026-10-02", time: "11:10", status: "Approved" },
  { employee: "Chloe Bennet", department: "Human Resources", category: "Meals & Entertainment", amount: 220, description: "New hire welcome team lunch", date: "2026-09-24", time: "12:30", status: "Approved" },
  { employee: "Liam Davis", department: "Finance", category: "Office Supplies", amount: 65, description: "Desk organizers & ergonomic mouse pads", date: "2026-09-22", time: "15:10", status: "Approved" },
  { employee: "Nathan Drake", department: "Marketing", category: "Travel", amount: 380, description: "High-speed rail ticket to Regional Expo", date: "2026-09-18", time: "08:20", status: "Approved" },
  { employee: "Jessica Taylor", department: "Marketing", category: "Equipment", amount: 650, description: "Podcast microphone & portable lighting kit for PR", date: "2026-09-11", time: "13:40", status: "Approved" },
  { employee: "Sarah Jenkins", department: "Engineering", category: "Meals & Entertainment", amount: 95, description: "Engineering sprint retrospective pizza and snacks", date: "2026-09-04", time: "17:30", status: "Approved" },
  { employee: "Michael Scott", department: "Sales", category: "Travel", amount: 285, description: "Rental car and fuel for regional distributor visits", date: "2026-08-27", time: "16:00", status: "Approved" },
  { employee: "Robert Taylor", department: "Finance", category: "Software & IT", amount: 150, description: "QuickBooks Online extra seat & payroll addon", date: "2026-08-22", time: "10:00", status: "Approved" },
  { employee: "Emily Watson", department: "Operations", category: "Travel", amount: 520, description: "Hotel stay (2 nights) for annual supply chain workshop", date: "2026-08-14", time: "19:15", status: "Approved" },
  { employee: "Chloe Bennet", department: "Human Resources", category: "Equipment", amount: 310, description: "Ergonomic standing desk converter for onboarding pod", date: "2026-08-04", time: "11:45", status: "Approved" },
  { employee: "David Chen", department: "Engineering", category: "Office Supplies", amount: 45, description: "Whiteboard markers, sticky notes & team supplies", date: "2026-07-25", time: "14:15", status: "Approved" },
  { employee: "Alex Rivera", department: "Sales", category: "Meals & Entertainment", amount: 140, description: "Client business lunch at bistrot", date: "2026-07-21", time: "13:00", status: "Approved" },
  { employee: "Sophia Martinez", department: "Marketing", category: "Software & IT", amount: 420, description: "Figma Organization seat and Canva Pro team licenses", date: "2026-07-15", time: "09:50", status: "Approved" },
  { employee: "Jordan Reed", department: "Sales", category: "Travel", amount: 320, description: "Interstate airport parking and toll reimbursement", date: "2026-07-08", time: "18:20", status: "Approved" },
  { employee: "Marcus Vance", department: "Executive", category: "Meals & Entertainment", amount: 350, description: "Board meeting catering & refreshments", date: "2026-06-29", time: "12:15", status: "Approved" },
  { employee: "Jessica Taylor", department: "Marketing", category: "Office Supplies", amount: 90, description: "Conference badge lanyards & printed flyers", date: "2026-06-22", time: "16:10", status: "Approved" },
  { employee: "Nathan Drake", department: "Marketing", category: "Software & IT", amount: 290, description: "Mailchimp transactional email credits", date: "2026-06-15", time: "10:30", status: "Approved" },
  { employee: "Sarah Jenkins", department: "Engineering", category: "Equipment", amount: 850, description: "Ultra-wide 4K monitor for code reviews", date: "2026-06-08", time: "14:00", status: "Approved" },
  { employee: "Liam Davis", department: "Finance", category: "Consulting", amount: 1200, description: "Statutory balance sheet review & auditing assist", date: "2026-05-28", time: "15:20", status: "Approved" },
  { employee: "Emily Watson", department: "Operations", category: "Office Supplies", amount: 110, description: "First aid restocking and pantry sanitation kits", date: "2026-05-18", time: "11:00", status: "Approved" },
  { employee: "Robert Taylor", department: "Finance", category: "Travel", amount: 640, description: "Roundtrip flights to annual FinOps convention", date: "2026-05-10", time: "08:15", status: "Approved" }
];

const sampleBudgets = [
  { department: 'Engineering', allocated: 150000, spent: 42000 },
  { department: 'Sales', allocated: 120000, spent: 38000 },
  { department: 'Marketing', allocated: 90000, spent: 29000 },
  { department: 'Finance', allocated: 60000, spent: 18000 },
  { department: 'Executive', allocated: 80000, spent: 31000 },
  { department: 'Operations', allocated: 50000, spent: 12500 },
  { department: 'Human Resources', allocated: 40000, spent: 9800 }
];

async function seedDatabase() {
  console.log('🌱 Starting AuditAI Database Seeding...');

  await connectDB();

  // 1. Seed Users (if empty)
  const userCount = await User.countDocuments();
  const createdUsers = {};

  if (userCount === 0) {
    console.log('Creating demo role accounts (Password: Demo@123)...');
    for (const u of demoUsers) {
      const user = new User(u);
      await user.save();
      createdUsers[user.role] = user;
      console.log(`  ✓ Created ${user.role}: ${user.email}`);
    }
  } else {
    console.log(`Users already exist (${userCount} found). Skipping user creation.`);
    const existing = await User.find();
    existing.forEach(u => { createdUsers[u.role] = u; });
  }

  // 2. Seed Budgets (if empty)
  const budgetCount = await Budget.countDocuments();
  if (budgetCount === 0) {
    console.log('Seeding departmental budgets...');
    await Budget.insertMany(sampleBudgets);
    console.log(`  ✓ Inserted ${sampleBudgets.length} departmental budgets.`);
  }

  // 3. Seed Expenses (if empty)
  const expenseCount = await Expense.countDocuments();
  if (expenseCount === 0) {
    console.log(`Seeding ~${rawExpenses.length} realistic corporate expenses...`);
    const seededExpenses = [];

    for (let i = 0; i < rawExpenses.length; i++) {
      const item = rawExpenses[i];
      const id = `EXP-${1001 + i}`;

      // Evaluate risk against previous seeded items
      const risk = evaluateRisk({ ...item, id }, seededExpenses);
      const requiredLevels = getRequiredApprovalLevels(item.amount, risk.level);

      // Determine level and approvals based on seeded status
      let currentLevel = requiredLevels[0];
      const approvals = [];

      if (item.status === 'Approved') {
        currentLevel = 'Completed';
        approvals.push({
          level: requiredLevels[0],
          role: 'manager',
          userName: 'David Chen',
          action: 'Approved',
          comment: 'Approved during departmental reconciliation',
          date: new Date(item.date)
        });
      } else if (item.status === 'Rejected') {
        currentLevel = 'Rejected';
        approvals.push({
          level: requiredLevels[0],
          role: 'manager',
          userName: 'David Chen',
          action: 'Rejected',
          comment: 'Policy violation: unitemized or duplicate claim',
          date: new Date(item.date)
        });
      }

      // Map to demo user if matches name
      const matchedUser = Object.values(createdUsers).find(u => u && u.name === item.employee);

      const exp = new Expense({
        id,
        employee: item.employee,
        userId: matchedUser ? matchedUser._id : (createdUsers.employee ? createdUsers.employee._id : null),
        department: item.department,
        category: item.category,
        amount: item.amount,
        description: item.description,
        date: item.date,
        time: item.time,
        status: item.status || 'Pending',
        currentLevel,
        requiredLevels,
        approvals,
        riskScore: risk.score,
        riskLevel: risk.level,
        reasons: risk.reasons,
        receipt: {
          hash: null,
          ocrAmount: null,
          ocrText: null,
          vendor: null
        }
      });

      await exp.save();
      seededExpenses.push(exp);
    }

    console.log(`  ✓ Inserted ${seededExpenses.length} evaluated expenses.`);

    // 4. Seed Initial Audit Log entry
    await AuditLog.create({
      userName: 'System Initializer',
      role: 'admin',
      action: 'SYSTEM_SEED',
      entityType: 'Expense',
      details: { seededCount: seededExpenses.length },
      ipAddress: '127.0.0.1',
      timestamp: new Date()
    });
    console.log('  ✓ Initialized audit log trail.');

  } else {
    console.log(`Expenses already exist (${expenseCount} found). Skipping expense seeding.`);
  }

  console.log('✅ Seeding completed successfully!');
}

// Allow standalone CLI execution: node data/seed.js
if (require.main === module) {
  seedDatabase()
    .then(() => mongoose.connection.close())
    .catch(err => {
      console.error('Seeding error:', err);
      process.exit(1);
    });
}

module.exports = {
  seedDatabase,
  demoUsers
};
