/**
 * AuditAI - API Service Layer
 * Centralizes all fetch calls with JWT authorization, error handling,
 * and cold-start detection for Render free-tier hosting.
 */

const API = {
  /**
   * Core HTTP request handler with automatic JWT Bearer token injection
   */
  async request(endpoint, options = {}) {
    const url = `${CONFIG.API_BASE_URL}${endpoint}`;
    
    // Retrieve stored JWT token
    const token = localStorage.getItem('auditai_token');

    // Default headers
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    // Show loading spinner
    const spinner = document.getElementById('global-loader');
    if (spinner) spinner.classList.add('active');

    try {
      const response = await fetch(url, {
        ...options,
        headers
      });

      const contentType = response.headers.get('content-type');
      let data = null;
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        data = await response.text();
      }

      // Handle 401 Unauthorized (Expired or invalid token)
      if (response.status === 401 && !endpoint.includes('/auth/login')) {
        localStorage.removeItem('auditai_token');
        localStorage.removeItem('auditai_user');
        if (!window.location.pathname.endsWith('login.html')) {
          window.location.href = 'login.html';
        }
        throw new Error((data && data.message) || 'Session expired. Please log in again.');
      }

      if (!response.ok) {
        const errorMsg = (data && data.message) || (data && data.error) || `Request failed (${response.status})`;
        throw new Error(errorMsg);
      }

      return data;
    } catch (error) {
      console.error(`API Error on ${endpoint}:`, error);

      if (typeof showToast === 'function') {
        const isColdStart = error.message.includes('Failed to fetch') || error.message.includes('NetworkError') || error.message.includes('Load failed');
        const userNotice = isColdStart
          ? 'Backend is waking up (Render free tier takes ~30s on cold start). Please wait a moment and retry.'
          : error.message;
        showToast(userNotice, 'error');
      }

      throw error;
    } finally {
      if (spinner) spinner.classList.remove('active');
    }
  },

  /* ==========================================================================
     AUTHENTICATION & USER METHODS
     ========================================================================== */

  async login(email, password) {
    const res = await this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });

    if (res.token) {
      localStorage.setItem('auditai_token', res.token);
      localStorage.setItem('auditai_user', JSON.stringify(res.user));
    }
    return res;
  },

  async getMe() {
    return this.request('/api/auth/me');
  },

  logout() {
    localStorage.removeItem('auditai_token');
    localStorage.removeItem('auditai_user');
    window.location.href = 'login.html';
  },

  getCurrentUser() {
    try {
      return JSON.parse(localStorage.getItem('auditai_user') || 'null');
    } catch {
      return null;
    }
  },

  async createUser(userData) {
    return this.request('/api/users', {
      method: 'POST',
      body: JSON.stringify(userData)
    });
  },

  /* ==========================================================================
     EXPENSE & ANALYTICS METHODS
     ========================================================================== */

  async getHealth() {
    return this.request('/health');
  },

  async getExpenses({ category = 'all', risk = 'all', search = '' } = {}) {
    const params = new URLSearchParams();
    if (category && category !== 'all') params.append('category', category);
    if (risk && risk !== 'all') params.append('risk', risk);
    if (search && search.trim() !== '') params.append('search', search.trim());

    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request(`/api/expenses${qs}`);
  },

  async getStats() {
    return this.request('/api/stats');
  },

  async getMonthlyStats() {
    return this.request('/api/stats/monthly');
  },

  async getCategoryStats() {
    return this.request('/api/stats/categories');
  },

  async getAlerts() {
    return this.request('/api/alerts');
  },

  async createExpense(expenseData) {
    return this.request('/api/expenses', {
      method: 'POST',
      body: JSON.stringify(expenseData)
    });
  },

  /* ==========================================================================
     MULTI-LEVEL APPROVAL WORKFLOW METHODS
     ========================================================================== */

  async getPendingApprovals() {
    return this.request('/api/approvals/pending');
  },

  async approveExpense(id, comment = '') {
    return this.request(`/api/expenses/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ comment })
    });
  },

  async rejectExpense(id, comment) {
    return this.request(`/api/expenses/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ comment })
    });
  },

  async updateExpenseStatus(id, status) {
    return this.request(`/api/expenses/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
  },

  /* ==========================================================================
     AUDIT TRAIL LOGS
     ========================================================================== */

  async getAuditLogs({ user = '', action = 'all', from = '', to = '', page = 1, limit = 25 } = {}) {
    const params = new URLSearchParams();
    if (user) params.append('user', user);
    if (action && action !== 'all') params.append('action', action);
    if (from) params.append('from', from);
    if (to) params.append('to', to);
    params.append('page', page);
    params.append('limit', limit);

    return this.request(`/api/audit-logs?${params.toString()}`);
  },

  /* ==========================================================================
     NATURAL LANGUAGE ASSISTANT ("ASK AUDITAI")
     ========================================================================== */

  async askAssistant(question) {
    return this.request('/api/assistant', {
      method: 'POST',
      body: JSON.stringify({ question })
    });
  }
};
