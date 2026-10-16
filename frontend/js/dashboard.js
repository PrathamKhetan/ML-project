/**
 * AuditAI - Enterprise Dashboard Logic
 * Integrates RBAC role view permissions, multi-level approval queues,
 * append-only audit trail logs with CSV export, Chart.js visualizations,
 * and the "Ask AuditAI" natural language assistant.
 */

// Global Chart Instances
let monthlyChart = null;
let categoryChart = null;
let riskBarChart = null;

// Dashboard State
const dashboardState = {
  currentUser: null,
  currentCategory: 'all',
  currentRisk: 'all',
  searchQuery: '',
  auditLogAction: 'all',
  auditLogUser: '',
  auditLogPage: 1
};

/**
 * Initialize Dashboard
 */
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Verify Authentication
  const token = localStorage.getItem('auditai_token');
  if (!token) {
    window.location.href = 'login.html';
    return;
  }

  dashboardState.currentUser = API.getCurrentUser();
  if (!dashboardState.currentUser) {
    try {
      const meRes = await API.getMe();
      dashboardState.currentUser = meRes.user;
      localStorage.setItem('auditai_user', JSON.stringify(meRes.user));
    } catch {
      API.logout();
      return;
    }
  }

  // 2. Setup Role-Based UI
  applyRoleVisibility(dashboardState.currentUser);
  setupSidebar();
  setupFilterListeners();
  setupApprovalsWorkflow();
  setupAuditTrailExport();
  setupAssistantChat();

  // 3. Load Data
  await loadDashboardData();
  await checkSystemHealth();
});

/**
 * Enforce Role-Based Visibility on Sidebar, Tabs, and Panels
 */
function applyRoleVisibility(user) {
  if (!user) return;

  // Update Topbar User Menu
  const nameEl = document.getElementById('user-profile-name');
  const roleEl = document.getElementById('user-profile-role');
  const avatarEl = document.getElementById('user-profile-avatar');

  if (nameEl) nameEl.textContent = user.name;
  if (roleEl) roleEl.textContent = `${user.role.toUpperCase()} · ${user.department}`;
  if (avatarEl) {
    const initials = user.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    avatarEl.textContent = initials || 'AI';
  }

  // Logout button handler
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => API.logout());
  }

  // Role Permissions
  const role = user.role;

  // Approvals Queue: Manager, Auditor, Admin
  const navApprovals = document.getElementById('nav-approvals');
  const sectionApprovals = document.getElementById('approvals-section');
  if (navApprovals) navApprovals.style.display = (role === 'employee') ? 'none' : 'flex';
  if (sectionApprovals) sectionApprovals.style.display = (role === 'employee') ? 'none' : 'block';

  // Audit Trail: Auditor, Admin only
  const navAuditTrail = document.getElementById('nav-audit-trail');
  const sectionAuditTrail = document.getElementById('audit-trail-section');
  if (navAuditTrail) navAuditTrail.style.display = (role === 'auditor' || role === 'admin') ? 'flex' : 'none';
  if (sectionAuditTrail) sectionAuditTrail.style.display = (role === 'auditor' || role === 'admin') ? 'block' : 'none';

  // Fraud Alerts: Auditor, Admin only (or general overview)
  const navAlerts = document.getElementById('nav-alerts');
  const sectionAlerts = document.getElementById('alerts-section');
  if (navAlerts) navAlerts.style.display = (role === 'employee') ? 'none' : 'flex';
  if (sectionAlerts) sectionAlerts.style.display = (role === 'employee') ? 'none' : 'block';

  // Floating Assistant Widget: Auditor, Admin, Manager
  const assistantWidget = document.getElementById('assistant-widget-container');
  if (assistantWidget) {
    assistantWidget.style.display = (role === 'employee') ? 'none' : 'block';
  }

  // Adjust table section title for employee
  const tableTitle = document.getElementById('transactions-table-title');
  if (tableTitle && role === 'employee') {
    tableTitle.textContent = 'My Submitted Expense Claims';
  }
}

/**
 * Check Backend Health
 */
async function checkSystemHealth() {
  const statusPill = document.getElementById('backend-status');
  if (!statusPill) return;

  try {
    const health = await API.getHealth();
    statusPill.innerHTML = `<span class="status-dot online"></span> ${health.database === 'connected' ? 'DB Connected' : 'API Online'}`;
    statusPill.title = `Connected to ${CONFIG.API_BASE_URL} (${health.timestamp})`;
  } catch {
    statusPill.innerHTML = '<span class="status-dot offline"></span> API Offline';
    statusPill.title = 'Backend unavailable. Please ensure server is running.';
  }
}

/**
 * Setup Sidebar collapsible behavior
 */
function setupSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle');
  const overlay = document.getElementById('sidebar-overlay');

  if (toggleBtn && sidebar) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      sidebar.classList.toggle('mobile-open');
      if (overlay) overlay.classList.toggle('active');
    });
  }

  if (overlay) {
    overlay.addEventListener('click', () => {
      if (sidebar) sidebar.classList.remove('mobile-open');
      overlay.classList.remove('active');
    });
  }
}

/**
 * Setup Filter and Search Input Event Handlers
 */
function setupFilterListeners() {
  const categoryFilter = document.getElementById('filter-category');
  const riskFilter = document.getElementById('filter-risk');
  const searchInput = document.getElementById('table-search');
  const topSearchInput = document.getElementById('topbar-search');

  if (categoryFilter) {
    categoryFilter.addEventListener('change', (e) => {
      dashboardState.currentCategory = e.target.value;
      fetchAndRenderExpenses();
    });
  }

  if (riskFilter) {
    riskFilter.addEventListener('change', (e) => {
      dashboardState.currentRisk = e.target.value;
      fetchAndRenderExpenses();
    });
  }

  let debounceTimer;
  function handleSearch(val) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      dashboardState.searchQuery = val;
      fetchAndRenderExpenses();
    }, 250);
  }

  if (searchInput) searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
  if (topSearchInput) {
    topSearchInput.addEventListener('input', (e) => {
      if (searchInput) searchInput.value = e.target.value;
      handleSearch(e.target.value);
    });
  }

  const refreshBtn = document.getElementById('btn-refresh-data');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.classList.add('rotating');
      await loadDashboardData();
      showToast('Dashboard data refreshed', 'info');
      setTimeout(() => refreshBtn.classList.remove('rotating'), 600);
    });
  }
}

/**
 * Load all Dashboard Sections
 */
async function loadDashboardData() {
  try {
    const promises = [
      loadStats(),
      fetchAndRenderExpenses(),
      loadMonthlyChart(),
      loadCategoryChart()
    ];

    const role = dashboardState.currentUser ? dashboardState.currentUser.role : 'employee';

    if (role !== 'employee') {
      promises.push(loadPendingApprovals());
      promises.push(loadAlerts());
    }

    if (role === 'auditor' || role === 'admin') {
      promises.push(loadAuditTrailLogs());
    }

    await Promise.all(promises);
  } catch (error) {
    console.error('Error loading dashboard data:', error);
  }
}

/**
 * Load and Animate KPI Stat Cards
 */
async function loadStats() {
  try {
    const stats = await API.getStats();

    const elTotalCount = document.getElementById('stat-total-count');
    const elTotalAmount = document.getElementById('stat-total-amount');
    const elFlaggedCount = document.getElementById('stat-flagged-count');
    const elMoneySaved = document.getElementById('stat-money-saved');
    const elAvgRisk = document.getElementById('stat-avg-risk');
    const elRiskBar = document.getElementById('stat-risk-progress');

    if (elTotalCount) animateCountUp(elTotalCount, stats.totalExpenses, 1000);
    if (elTotalAmount) animateCountUp(elTotalAmount, stats.totalAmount, 1200, '$');
    if (elFlaggedCount) animateCountUp(elFlaggedCount, stats.flaggedCount, 1000);
    if (elMoneySaved) animateCountUp(elMoneySaved, stats.moneySaved, 1200, '$');
    if (elAvgRisk) animateCountUp(elAvgRisk, stats.avgRiskScore, 1000, '', '/100');

    if (elRiskBar) {
      elRiskBar.style.width = `${Math.min(100, stats.avgRiskScore)}%`;
      elRiskBar.style.background = stats.avgRiskScore > 50 ? '#f43f5e' : stats.avgRiskScore > 25 ? '#f59e0b' : '#10b981';
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

/**
 * Fetch and Render Expenses in Table
 */
async function fetchAndRenderExpenses() {
  const tbody = document.getElementById('expenses-tbody');
  const countBadge = document.getElementById('table-count-badge');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="8" class="text-center py-6 text-muted">
        <i class="fa-solid fa-spinner fa-spin text-primary"></i> Loading audited records...
      </td>
    </tr>
  `;

  try {
    const expenses = await API.getExpenses({
      category: dashboardState.currentCategory,
      risk: dashboardState.currentRisk,
      search: dashboardState.searchQuery
    });

    if (countBadge) countBadge.textContent = `${expenses.length} records`;

    if (expenses.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-8 text-muted">
            <i class="fa-solid fa-folder-open text-2xl mb-2 block"></i>
            No matching expenses found.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = expenses.map(item => {
      const riskClass = item.riskLevel === 'High' ? 'badge-high' :
                        item.riskLevel === 'Medium' ? 'badge-medium' : 'badge-low';

      const statusClass = item.status === 'Approved' ? 'status-approved' :
                          item.status === 'Rejected' ? 'status-rejected' : 'status-pending';

      const reasonsTooltip = (item.reasons || []).join(' • ');

      // Stepper chain badges
      const chainHtml = (item.requiredLevels || ['Manager']).map(lvl => {
        const isApproved = item.approvals && item.approvals.some(a => a.level === lvl && a.action === 'Approved');
        const isCurrent = item.currentLevel === lvl && item.status === 'Pending';
        const color = isApproved ? 'text-success' : isCurrent ? 'text-warning font-bold' : 'text-dim';
        return `<span class="${color}">${lvl}</span>`;
      }).join(' &rarr; ');

      return `
        <tr id="row-${item.id}" class="expense-row">
          <td><span class="id-tag">${item.id}</span></td>
          <td>
            <div class="employee-cell">
              <strong>${item.employee}</strong>
              <small class="text-muted block">${item.department || 'General'}</small>
            </div>
          </td>
          <td><span class="category-pill">${item.category}</span></td>
          <td>
            <div>${item.date}</div>
            <small class="text-muted">${item.time || '12:00'}</small>
          </td>
          <td class="text-right font-mono font-semibold">$${Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
          <td>
            <div class="risk-cell" title="${reasonsTooltip}">
              <div class="risk-bar-mini">
                <div class="risk-bar-fill ${riskClass}" style="width: ${item.riskScore}%"></div>
              </div>
              <span class="risk-badge ${riskClass}">
                <i class="fa-solid ${item.riskLevel === 'High' ? 'fa-shield-halved' : item.riskLevel === 'Medium' ? 'fa-triangle-exclamation' : 'fa-circle-check'}"></i>
                ${item.riskScore} · ${item.riskLevel}
              </span>
            </div>
          </td>
          <td>
            <div>
              <span class="status-badge ${statusClass}">${item.status}</span>
              <div class="text-xs text-muted mt-1" style="font-size: 0.72rem;">${chainHtml}</div>
            </div>
          </td>
          <td class="text-center">
            <button class="btn btn-secondary btn-sm" onclick="openExpenseDetailsModal('${item.id}')" title="View Audit Details">
              <i class="fa-solid fa-eye"></i> Details
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Store in window for modal lookups
    window._lastExpenses = expenses;

  } catch (error) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-6 text-danger">
          <i class="fa-solid fa-triangle-exclamation"></i> Error loading transactions. ${error.message}
        </td>
      </tr>
    `;
  }
}

/**
 * Load Multi-Level Pending Approvals Queue
 */
async function loadPendingApprovals() {
  const container = document.getElementById('pending-approvals-container');
  const countBadge = document.getElementById('approvals-count-badge');
  if (!container) return;

  try {
    const pending = await API.getPendingApprovals();
    if (countBadge) countBadge.textContent = `${pending.length} pending`;

    if (pending.length === 0) {
      container.innerHTML = `
        <div class="empty-alerts">
          <i class="fa-solid fa-clipboard-check text-success text-2xl mb-2"></i>
          <p class="text-muted text-sm">No claims currently pending approval for your role. You are all caught up!</p>
        </div>
      `;
      return;
    }

    container.innerHTML = pending.map(item => {
      const stepper = (item.requiredLevels || ['Manager']).map(lvl => {
        const isCurrent = item.currentLevel === lvl;
        return `<span class="step-pill ${isCurrent ? 'step-current' : 'step-pending'}">${lvl}</span>`;
      }).join(' &rarr; ');

      return `
        <div class="approval-card glass-panel" style="padding: 16px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 8px;">
            <div>
              <span class="id-tag">${item.id}</span>
              <strong style="margin-left: 8px;">${item.employee}</strong>
              <span class="text-muted text-sm">(${item.department}) — ${item.category}</span>
            </div>
            <div class="font-mono font-bold" style="font-size: 1.15rem; color: #fff;">
              $${Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>

          <p class="text-sm text-muted mt-2" style="margin: 8px 0;">"${item.description}"</p>

          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 10px; margin-top: 12px; border-top: 1px solid var(--border-color); padding-top: 10px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="text-xs text-muted">Approval Chain:</span>
              <div class="approval-stepper">${stepper}</div>
            </div>

            <div style="display: flex; gap: 8px; align-items: center;">
              ${item.isOwnClaim && dashboardState.currentUser.role !== 'admin' ? `
                <span class="badge-medium" style="padding: 6px 12px; font-size: 0.76rem; border-radius: var(--radius-sm); border: 1px dashed rgba(245, 158, 11, 0.4);">
                  <i class="fa-solid fa-lock"></i> Your Claim · Peer Review Required
                </span>
              ` : `
                <button class="btn btn-outline-danger btn-sm" onclick="promptRejectionModal('${item.id}')">
                  <i class="fa-solid fa-ban"></i> Reject
                </button>
                <button class="btn btn-primary btn-sm" onclick="promptApprovalModal('${item.id}')">
                  <i class="fa-solid fa-check"></i> Approve as ${dashboardState.currentUser.role.toUpperCase()}
                </button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    container.innerHTML = `<p class="text-danger text-sm">Failed to load approvals queue: ${err.message}</p>`;
  }
}

/**
 * Setup Approvals Action Modals
 */
function setupApprovalsWorkflow() {
  window.promptApprovalModal = async function(id) {
    const comment = prompt('Optional approval comment for this level:');
    if (comment === null) return; // Cancelled
    try {
      await API.approveExpense(id, comment);
      showToast(`Expense ${id} approved successfully!`, 'success');
      loadDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  window.promptRejectionModal = async function(id) {
    const comment = prompt('MANDATORY: Please enter the specific reason for rejecting this claim:');
    if (!comment || comment.trim() === '') {
      showToast('Rejection cancelled: Mandatory comment is required.', 'warning');
      return;
    }
    try {
      await API.rejectExpense(id, comment.trim());
      showToast(`Expense ${id} has been rejected.`, 'warning');
      loadDashboardData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };
}

/**
 * View Expense Details Modal (Shows full risk breakdown, reasons, OCR data, and audit history)
 */
window.openExpenseDetailsModal = function(id) {
  const item = (window._lastExpenses || []).find(e => e.id === id);
  if (!item) return;

  const modal = document.getElementById('expense-details-modal');
  const body = document.getElementById('expense-modal-body');
  if (!modal || !body) return;

  const reasonsHtml = (item.reasons || []).map(r => `<li>${r}</li>`).join('');
  const approvalsHtml = (item.approvals || []).map(a => `
    <div style="font-size: 0.82rem; padding: 6px 10px; background: rgba(255,255,255,0.03); border-radius: 6px; margin-bottom: 4px;">
      <strong>${a.level} (${a.role})</strong> — <span class="${a.action === 'Approved' ? 'text-success' : 'text-danger'}">${a.action}</span> by ${a.userName} on ${new Date(a.date).toLocaleDateString()}
      ${a.comment ? `<div class="text-muted mt-1">"${a.comment}"</div>` : ''}
    </div>
  `).join('') || '<div class="text-muted text-xs">No approval actions recorded yet.</div>';

  body.innerHTML = `
    <div style="margin-bottom: 16px;">
      <h3>${item.id} — $${Number(item.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</h3>
      <div class="text-muted text-sm">${item.employee} (${item.department}) · ${item.category}</div>
      <div class="mt-2 text-sm">${item.description}</div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px;">
      <div class="glass-panel p-3" style="padding: 12px;">
        <span class="text-xs text-muted uppercase font-semibold">Fraud Risk Score</span>
        <div class="font-bold text-xl mt-1" style="color: ${item.riskLevel === 'High' ? '#f43f5e' : item.riskLevel === 'Medium' ? '#fbbf24' : '#10b981'};">
          ${item.riskScore}/100 (${item.riskLevel})
        </div>
      </div>
      <div class="glass-panel p-3" style="padding: 12px;">
        <span class="text-xs text-muted uppercase font-semibold">Current Workflow Status</span>
        <div class="font-bold text-xl mt-1 text-primary">
          ${item.status} (${item.currentLevel})
        </div>
      </div>
    </div>

    <div style="margin-bottom: 16px;">
      <h5 class="text-xs text-muted uppercase font-semibold" style="margin-bottom: 6px;">Heuristic Policy Violations & Reasons:</h5>
      <ul style="padding-left: 20px; font-size: 0.85rem;" class="text-danger">
        ${reasonsHtml || '<li>No violations detected.</li>'}
      </ul>
    </div>

    ${item.receipt && item.receipt.hash ? `
      <div style="margin-bottom: 16px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 8px; padding: 12px;">
        <h5 class="text-xs text-primary uppercase font-semibold" style="margin-bottom: 4px;"><i class="fa-solid fa-receipt"></i> Scanned Receipt Metadata</h5>
        <div class="text-xs font-mono text-muted">Hash: ${item.receipt.hash.slice(0, 24)}...</div>
        ${item.receipt.ocrAmount ? `<div class="text-xs">OCR Detected Amount: <strong>$${item.receipt.ocrAmount.toFixed(2)}</strong></div>` : ''}
        ${item.receipt.vendor ? `<div class="text-xs">OCR Vendor: <strong>${item.receipt.vendor}</strong></div>` : ''}
      </div>
    ` : ''}

    <div>
      <h5 class="text-xs text-muted uppercase font-semibold" style="margin-bottom: 6px;">Audit & Approval History:</h5>
      ${approvalsHtml}
    </div>
  `;

  modal.style.display = 'flex';
};

window.closeExpenseDetailsModal = function() {
  const modal = document.getElementById('expense-details-modal');
  if (modal) modal.style.display = 'none';
};

// Setup backdrop click and escape key listener for expense modal
document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('expense-details-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeExpenseDetailsModal();
      }
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeExpenseDetailsModal();
    }
  });
});

/**
 * Load Append-Only Audit Trail Logs
 */
async function loadAuditTrailLogs() {
  const tbody = document.getElementById('audit-logs-tbody');
  if (!tbody) return;

  try {
    const res = await API.getAuditLogs({
      action: dashboardState.auditLogAction,
      user: dashboardState.auditLogUser,
      page: dashboardState.auditLogPage
    });

    if (res.logs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-muted">No audit log entries found.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.logs.map(log => {
      const actionClass = log.action.includes('REJECT') ? 'badge-high' :
                          log.action.includes('APPROVE') ? 'badge-low' :
                          log.action.includes('ALERT') ? 'badge-medium' : 'status-pending';

      const detailsStr = JSON.stringify(log.details || {});

      return `
        <tr>
          <td><span class="text-muted text-xs font-mono">${new Date(log.timestamp).toLocaleString()}</span></td>
          <td>
            <strong>${log.userName}</strong>
            <small class="text-muted block text-xs">${log.role}</small>
          </td>
          <td><span class="status-badge ${actionClass}">${log.action}</span></td>
          <td><span class="category-pill">${log.entityType} ${log.entityId ? `#${log.entityId}` : ''}</span></td>
          <td><div class="text-xs text-muted font-mono" style="max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${detailsStr}">${detailsStr}</div></td>
          <td><span class="text-xs text-dim font-mono">${log.ipAddress}</span></td>
        </tr>
      `;
    }).join('');

    // Store for CSV export
    window._lastAuditLogs = res.logs;

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center py-6 text-danger">Error loading audit trail: ${err.message}</td></tr>`;
  }
}

/**
 * Audit Trail CSV Export
 */
function setupAuditTrailExport() {
  const exportBtn = document.getElementById('btn-export-audit-csv');
  if (!exportBtn) return;

  exportBtn.addEventListener('click', () => {
    const logs = window._lastAuditLogs || [];
    if (logs.length === 0) {
      showToast('No audit logs available to export.', 'warning');
      return;
    }

    const headers = ['Timestamp', 'User', 'Role', 'Action', 'Entity', 'EntityId', 'Details', 'IP'];
    const rows = logs.map(l => [
      `"${new Date(l.timestamp).toISOString()}"`,
      `"${l.userName}"`,
      `"${l.role}"`,
      `"${l.action}"`,
      `"${l.entityType}"`,
      `"${l.entityId || ''}"`,
      `"${JSON.stringify(l.details).replace(/"/g, '""')}"`,
      `"${l.ipAddress}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `AuditAI_AuditTrail_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Audit trail CSV exported successfully!', 'success');
  });

  // Action Filter change
  const actionFilter = document.getElementById('filter-audit-action');
  if (actionFilter) {
    actionFilter.addEventListener('change', (e) => {
      dashboardState.auditLogAction = e.target.value;
      loadAuditTrailLogs();
    });
  }
}

/**
 * Setup "Ask AuditAI" Assistant Chat Widget
 */
function setupAssistantChat() {
  const toggleBtn = document.getElementById('btn-assistant-toggle');
  const panel = document.getElementById('assistant-panel');
  const closeBtn = document.getElementById('btn-assistant-close');
  const sendBtn = document.getElementById('btn-assistant-send');
  const input = document.getElementById('assistant-input');
  const messagesBox = document.getElementById('assistant-messages');
  const chips = document.querySelectorAll('.assistant-chip');

  if (!toggleBtn || !panel) return;

  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('active');
    if (panel.classList.contains('active') && input) input.focus();
  });

  if (closeBtn) closeBtn.addEventListener('click', () => panel.classList.remove('active'));

  async function handleSend(questionText) {
    const q = (questionText || (input ? input.value : '')).trim();
    if (!q) return;

    if (input) input.value = '';

    // Append User Message
    appendAssistantMessage('user', q);

    // Show Typing Indicator
    const typingId = 'typing-' + Date.now();
    const typingEl = document.createElement('div');
    typingEl.id = typingId;
    typingEl.className = 'chat-message bot typing';
    typingEl.innerHTML = `<i class="fa-solid fa-brain-circuit fa-spin"></i> AuditAI querying compliance records...`;
    messagesBox.appendChild(typingEl);
    messagesBox.scrollTop = messagesBox.scrollHeight;

    try {
      const res = await API.askAssistant(q);
      const indicator = document.getElementById(typingId);
      if (indicator) indicator.remove();

      appendAssistantMessage('bot', res.answer);
    } catch (err) {
      const indicator = document.getElementById(typingId);
      if (indicator) indicator.remove();
      appendAssistantMessage('bot', `⚠️ Query could not be completed: ${err.message}`);
    }
  }

  function appendAssistantMessage(sender, text) {
    const msg = document.createElement('div');
    msg.className = `chat-message ${sender}`;
    msg.innerHTML = sender === 'bot'
      ? `<div class="msg-avatar"><i class="fa-solid fa-shield-halved"></i></div><div class="msg-bubble">${text}</div>`
      : `<div class="msg-bubble user-bubble">${text}</div>`;
    messagesBox.appendChild(msg);
    messagesBox.scrollTop = messagesBox.scrollHeight;
  }

  if (sendBtn) sendBtn.addEventListener('click', () => handleSend());
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSend();
    });
  }

  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      handleSend(chip.textContent.replace(/"/g, '').trim());
    });
  });
}

/**
 * Load Monthly Line Chart
 */
async function loadMonthlyChart() {
  const ctx = document.getElementById('monthlyExpensesChart');
  if (!ctx) return;

  try {
    const data = await API.getMonthlyStats();
    if (monthlyChart) monthlyChart.destroy();

    monthlyChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.labels,
        datasets: [
          {
            label: 'Total Expenses ($)',
            data: data.totals,
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5
          },
          {
            label: 'Flagged High-Risk ($)',
            data: data.flagged,
            borderColor: '#f43f5e',
            backgroundColor: 'rgba(244, 63, 94, 0.08)',
            fill: true,
            tension: 0.35,
            borderWidth: 2,
            borderDash: [5, 5]
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { color: '#94a3b8' } }
        },
        scales: {
          x: { grid: { color: 'rgba(255, 255, 255, 0.04)' }, ticks: { color: '#94a3b8' } },
          y: { grid: { color: 'rgba(255, 255, 255, 0.04)' }, ticks: { color: '#94a3b8' } }
        }
      }
    });
  } catch (error) {
    console.error('Failed to load monthly chart:', error);
  }
}

/**
 * Load Category Doughnut Chart & Risk Bar Chart
 */
async function loadCategoryChart() {
  const ctxDoughnut = document.getElementById('categoryDoughnutChart');
  const ctxBar = document.getElementById('categoryRiskBarChart');
  if (!ctxDoughnut) return;

  try {
    const data = await API.getCategoryStats();
    const bgColors = ['#6366f1', '#3b82f6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];

    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(ctxDoughnut, {
      type: 'doughnut',
      data: {
        labels: data.labels,
        datasets: [{
          data: data.totals,
          backgroundColor: bgColors.slice(0, data.labels.length),
          borderWidth: 2,
          borderColor: '#0f172a'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 } } }
        }
      }
    });

    if (ctxBar) {
      if (riskBarChart) riskBarChart.destroy();
      riskBarChart = new Chart(ctxBar, {
        type: 'bar',
        data: {
          labels: data.labels,
          datasets: [
            { label: 'Total Submitted', data: data.counts, backgroundColor: '#3b82f6', borderRadius: 6 },
            { label: 'Flagged by AI', data: data.flaggedCounts, backgroundColor: '#f43f5e', borderRadius: 6 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'top', labels: { color: '#94a3b8', font: { size: 11 } } }
          },
          scales: {
            x: { grid: { display: false }, ticks: { color: '#94a3b8', font: { size: 10 } } },
            y: { grid: { color: 'rgba(255, 255, 255, 0.04)' }, ticks: { color: '#94a3b8', stepSize: 1 } }
          }
        }
      });
    }
  } catch (error) {
    console.error('Failed to load category charts:', error);
  }
}

/**
 * Load Real-Time Fraud Alerts Panel
 */
async function loadAlerts() {
  const alertsList = document.getElementById('alerts-container');
  const alertCountBadge = document.getElementById('alerts-count-badge');
  const alertDot = document.getElementById('alerts-pulse-dot');
  if (!alertsList) return;

  try {
    const alerts = await API.getAlerts();
    if (alertCountBadge) alertCountBadge.textContent = alerts.length;
    if (alertDot) alertDot.style.display = alerts.length > 0 ? 'inline-block' : 'none';

    if (alerts.length === 0) {
      alertsList.innerHTML = `
        <div class="empty-alerts">
          <i class="fa-solid fa-shield-check text-success text-2xl mb-2"></i>
          <p class="text-muted text-sm">No high-risk flags pending review. All systems secure!</p>
        </div>
      `;
      return;
    }

    alertsList.innerHTML = alerts.map(alert => {
      const topReason = (alert.reasons && alert.reasons[0]) || 'Irregular expense profile detected';
      return `
        <div class="alert-item">
          <div class="alert-header">
            <span class="risk-badge badge-high">
              <i class="fa-solid fa-triangle-exclamation"></i> Risk ${alert.riskScore}/100
            </span>
            <span class="alert-amount font-mono">$${Number(alert.amount).toLocaleString()}</span>
          </div>
          <div class="alert-body">
            <strong>${alert.employee}</strong> · <span class="text-muted">${alert.category}</span>
            <p class="alert-reason">${topReason}</p>
          </div>
          <div class="alert-actions">
            <button class="btn-sm btn-outline-danger" onclick="promptRejectionModal('${alert.id}')">
              <i class="fa-solid fa-ban"></i> Reject
            </button>
            <button class="btn-sm btn-outline-success" onclick="promptApprovalModal('${alert.id}')">
              <i class="fa-solid fa-check"></i> Review
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (error) {
    console.error('Failed to load alerts:', error);
  }
}
