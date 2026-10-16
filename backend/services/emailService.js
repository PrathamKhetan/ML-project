/**
 * AuditAI - Email Alert Notification Service
 * Sends automated HTML notifications for high-risk flags and status decisions via Nodemailer.
 * Non-blocking design: email failures never interrupt API operations.
 */

const nodemailer = require('nodemailer');

function createTransporter() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null; // SMTP not configured
  }

  const port = parseInt(process.env.SMTP_PORT, 10) || 587;
  const secure = port === 465;

  return nodemailer.createTransporter({
    host,
    port,
    secure,
    auth: { user, pass }
  });
}

/**
 * Send High-Risk Fraud Alert to Compliance Auditors and Admins
 */
async function sendHighRiskAlert(expense, recipientEmails = []) {
  try {
    const transporter = createTransporter();
    const fromAddress = process.env.ALERT_FROM || 'alerts@auditai.corp';
    const fallbackTo = process.env.ALERT_TO_FALLBACK || 'compliance-team@auditai.corp';

    const recipients = recipientEmails.length > 0 ? recipientEmails.join(', ') : fallbackTo;

    if (!transporter) {
      console.log(`[Email skipped] High-risk alert for ${expense.id} ($${expense.amount}) - SMTP not configured.`);
      return false;
    }

    const reasonsListHtml = (expense.reasons || [])
      .map(r => `<li style="margin-bottom: 6px; color: #dc2626;"><strong>•</strong> ${r}</li>`)
      .join('');

    const dashboardUrl = process.env.CLIENT_URL || 'http://localhost:5500';

    const mailOptions = {
      from: `"AuditAI Security" <${fromAddress}>`,
      to: recipients,
      subject: `🚨 [HIGH RISK ALERT] Expense ${expense.id} Flagged (Score ${expense.riskScore}/100)`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; border-radius: 12px; padding: 24px; border: 1px solid #334155;">
          <h2 style="color: #f43f5e; margin-top: 0;">🚨 High-Risk Expense Detected</h2>
          <p style="color: #94a3b8;">The autonomous AuditAI risk engine has flagged a high-risk corporate transaction requiring immediate auditor intervention.</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #1e293b; border-radius: 8px;">
            <tr><td style="padding: 10px; color: #94a3b8;">Expense ID:</td><td style="padding: 10px; font-weight: bold;">${expense.id}</td></tr>
            <tr><td style="padding: 10px; color: #94a3b8;">Employee:</td><td style="padding: 10px; font-weight: bold;">${expense.employee} (${expense.department})</td></tr>
            <tr><td style="padding: 10px; color: #94a3b8;">Category:</td><td style="padding: 10px;">${expense.category}</td></tr>
            <tr><td style="padding: 10px; color: #94a3b8;">Amount:</td><td style="padding: 10px; font-size: 1.2rem; color: #f43f5e; font-weight: bold;">$${Number(expense.amount).toLocaleString()}</td></tr>
            <tr><td style="padding: 10px; color: #94a3b8;">Risk Score:</td><td style="padding: 10px; color: #f43f5e; font-weight: bold;">${expense.riskScore} / 100 (HIGH RISK)</td></tr>
          </table>

          <h4 style="color: #e2e8f0; margin-bottom: 8px;">Identified Policy Violations:</h4>
          <ul style="padding-left: 20px; font-size: 0.95rem;">
            ${reasonsListHtml}
          </ul>

          <div style="margin-top: 24px; text-align: center;">
            <a href="${dashboardUrl}/dashboard.html" style="background: #3b82f6; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;">
              Review in Auditor Dashboard &rarr;
            </a>
          </div>
          <p style="font-size: 0.8rem; color: #64748b; margin-top: 24px; text-align: center;">AuditAI Automated Compliance System</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ High-risk alert email dispatched to ${recipients} for expense ${expense.id}`);
    return true;
  } catch (error) {
    console.warn(`[Email send failed] Could not deliver alert for ${expense.id}:`, error.message);
    return false;
  }
}

/**
 * Send Status Decision Email to Employee (Approved or Rejected)
 */
async function sendStatusUpdateEmail(expense, employeeEmail, action, comment = '') {
  try {
    const transporter = createTransporter();
    const fromAddress = process.env.ALERT_FROM || 'alerts@auditai.corp';

    if (!transporter || !employeeEmail) {
      console.log(`[Email skipped] Status update for ${expense.id} to ${employeeEmail || 'unknown'} - SMTP not configured.`);
      return false;
    }

    const isApproved = action === 'Approved';
    const statusColor = isApproved ? '#10b981' : '#f43f5e';
    const title = isApproved ? 'Expense Claim Approved' : 'Expense Claim Rejected';

    const mailOptions = {
      from: `"AuditAI Notifications" <${fromAddress}>`,
      to: employeeEmail,
      subject: `${isApproved ? '✅' : '❌'} Your Expense Claim ${expense.id} has been ${action}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #f8fafc; border-radius: 12px; padding: 24px; border: 1px solid #334155;">
          <h2 style="color: ${statusColor}; margin-top: 0;">${title}</h2>
          <p style="color: #94a3b8;">Your expense report has been reviewed by the compliance approval chain.</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0; background: #1e293b; border-radius: 8px;">
            <tr><td style="padding: 10px; color: #94a3b8;">Expense ID:</td><td style="padding: 10px; font-weight: bold;">${expense.id}</td></tr>
            <tr><td style="padding: 10px; color: #94a3b8;">Category:</td><td style="padding: 10px;">${expense.category}</td></tr>
            <tr><td style="padding: 10px; color: #94a3b8;">Amount:</td><td style="padding: 10px; font-weight: bold;">$${Number(expense.amount).toLocaleString()}</td></tr>
            <tr><td style="padding: 10px; color: #94a3b8;">Final Decision:</td><td style="padding: 10px; font-weight: bold; color: ${statusColor};">${action.toUpperCase()}</td></tr>
            ${comment ? `<tr><td style="padding: 10px; color: #94a3b8;">Auditor Comments:</td><td style="padding: 10px; color: #fbbf24;">${comment}</td></tr>` : ''}
          </table>

          <p style="font-size: 0.85rem; color: #94a3b8;">For questions or appeals, please contact your department manager or corporate compliance.</p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Status notification email sent to ${employeeEmail} for expense ${expense.id}`);
    return true;
  } catch (error) {
    console.warn(`[Email send failed] Could not deliver status email to ${employeeEmail}:`, error.message);
    return false;
  }
}

module.exports = {
  sendHighRiskAlert,
  sendStatusUpdateEmail
};
