/**
 * AuditAI - Live Expense Audit, Receipt OCR & Risk Engine Integration
 * Supports client-side Tesseract.js OCR, SHA-256 receipt hashing via Web Crypto,
 * automated field extraction, and instant dashboard synchronization.
 */

let receiptState = {
  hash: null,
  ocrAmount: null,
  ocrText: null,
  ocrVendor: null
};

document.addEventListener('DOMContentLoaded', () => {
  setupAuditForm();
  setupQuickPresets();
  setupReceiptUpload();
  setDefaultDateTime();
});

/**
 * Set default date to today and time to now
 */
function setDefaultDateTime() {
  const dateInput = document.getElementById('audit-date');
  const timeInput = document.getElementById('audit-time');
  const empInput = document.getElementById('audit-employee');
  const deptInput = document.getElementById('audit-department');
  const now = new Date();

  if (dateInput && !dateInput.value) {
    dateInput.value = now.toISOString().split('T')[0];
  }

  if (timeInput && !timeInput.value) {
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    timeInput.value = `${hours}:${minutes}`;
  }

  const currentUser = typeof API !== 'undefined' ? API.getCurrentUser() : null;
  if (currentUser) {
    if (empInput && !empInput.value && currentUser.name) {
      empInput.value = currentUser.name;
    }
    if (deptInput && (!deptInput.value || deptInput.value === 'Engineering') && currentUser.department) {
      deptInput.value = currentUser.department;
    }
  }
}

/**
 * Compute SHA-256 Hash of File in Browser using Web Crypto API
 */
async function computeFileHash(file) {
  const arrayBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Setup Receipt Image Upload, Preview, and In-Browser Tesseract OCR
 */
function setupReceiptUpload() {
  const fileInput = document.getElementById('audit-receipt-file');
  const previewContainer = document.getElementById('receipt-preview-container');
  const previewImg = document.getElementById('receipt-preview-img');
  const ocrProgressBox = document.getElementById('ocr-progress-box');
  const ocrProgressBar = document.getElementById('ocr-progress-bar');
  const ocrStatusText = document.getElementById('ocr-status-text');
  const removeBtn = document.getElementById('btn-remove-receipt');

  if (!fileInput) return;

  fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Max 5 MB validation
    if (file.size > 5 * 1024 * 1024) {
      showToast('Receipt file size exceeds 5 MB limit.', 'error');
      fileInput.value = '';
      return;
    }

    // Show Image Preview
    const reader = new FileReader();
    reader.onload = (event) => {
      if (previewImg) previewImg.src = event.target.result;
      if (previewContainer) previewContainer.style.display = 'block';
    };
    reader.readAsDataURL(file);

    // Compute SHA-256 Hash
    try {
      receiptState.hash = await computeFileHash(file);
      console.log('Receipt SHA-256 Hash:', receiptState.hash);
    } catch (hashErr) {
      console.warn('Could not compute file hash:', hashErr);
    }

    // Run In-Browser OCR with Tesseract.js (if available via CDN)
    if (typeof Tesseract !== 'undefined') {
      if (ocrProgressBox) ocrProgressBox.style.display = 'block';
      if (ocrStatusText) ocrStatusText.textContent = 'Initializing OCR engine...';

      try {
        const result = await Tesseract.recognize(file, 'eng', {
          logger: (m) => {
            if (m.status === 'recognizing text' && ocrProgressBar) {
              const pct = Math.round(m.progress * 100);
              ocrProgressBar.style.width = `${pct}%`;
              if (ocrStatusText) ocrStatusText.textContent = `Scanning receipt text (${pct}%)...`;
            }
          }
        });

        const text = result.data.text || '';
        receiptState.ocrText = text.slice(0, 500);

        // Parse OCR text using regex
        parseAndAutofillReceipt(text);

        if (ocrStatusText) ocrStatusText.textContent = 'Receipt scanned! Fields auto-filled below.';
        showToast('Receipt scanned via Tesseract OCR! Form fields updated.', 'success');
      } catch (ocrErr) {
        console.warn('Tesseract OCR error:', ocrErr);
        if (ocrStatusText) ocrStatusText.textContent = 'OCR completed with manual review.';
      } finally {
        setTimeout(() => {
          if (ocrProgressBox) ocrProgressBox.style.display = 'none';
        }, 2500);
      }
    }
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      if (fileInput) fileInput.value = '';
      if (previewContainer) previewContainer.style.display = 'none';
      if (previewImg) previewImg.src = '';
      receiptState = { hash: null, ocrAmount: null, ocrText: null, ocrVendor: null };
      showToast('Receipt cleared', 'info');
    });
  }
}

/**
 * Regex parser for receipt text: Total amount, Date, and Vendor
 */
function parseAndAutofillReceipt(text) {
  if (!text) return;

  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 2);

  // 1. Vendor: First plausible non-empty line
  if (lines.length > 0) {
    const rawVendor = lines[0].replace(/[^a-zA-Z0-9\s&.,-]/g, '').slice(0, 50);
    if (rawVendor.length > 2) {
      receiptState.ocrVendor = rawVendor;
      const descInput = document.getElementById('audit-description');
      if (descInput && !descInput.value) {
        descInput.value = `Purchase at ${rawVendor}`;
      }
    }
  }

  // 2. Amount: Look for "total", "amount", "due", "balance", or currency figures
  const amountRegex = /(?:total|amount|due|balance|net|sum|usd|\$)\s*[:\$€£]?\s*([0-9]+[.,][0-9]{2})/i;
  const matchAmount = text.match(amountRegex);

  if (matchAmount && matchAmount[1]) {
    const parsed = parseFloat(matchAmount[1].replace(',', '.'));
    if (!isNaN(parsed) && parsed > 0) {
      receiptState.ocrAmount = parsed;
      const amountInput = document.getElementById('audit-amount');
      if (amountInput) amountInput.value = parsed.toFixed(2);
    }
  } else {
    // Fallback: look for general price pattern on last few lines
    const generalPriceRegex = /\$?\s*([0-9]+\.[0-9]{2})\b/g;
    let match;
    let highestAmount = 0;
    while ((match = generalPriceRegex.exec(text)) !== null) {
      const val = parseFloat(match[1]);
      if (val > highestAmount && val < 100000) highestAmount = val;
    }
    if (highestAmount > 0) {
      receiptState.ocrAmount = highestAmount;
      const amountInput = document.getElementById('audit-amount');
      if (amountInput) amountInput.value = highestAmount.toFixed(2);
    }
  }

  // 3. Date: Match YYYY-MM-DD or MM/DD/YYYY or DD-MM-YYYY
  const dateRegex = /\b(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/;
  const matchDate = text.match(dateRegex);
  if (matchDate && matchDate[1]) {
    try {
      const parsedDate = new Date(matchDate[1]);
      if (!isNaN(parsedDate.getTime())) {
        const dateInput = document.getElementById('audit-date');
        if (dateInput) dateInput.value = parsedDate.toISOString().split('T')[0];
      }
    } catch {
      // Ignore invalid date
    }
  }
}

/**
 * Setup Quick-Fill Presets for Live Testing & Presentations
 */
function setupQuickPresets() {
  const presetButtons = document.querySelectorAll('.btn-preset');
  if (!presetButtons.length) return;

  const presets = {
    clean: {
      employee: 'Sarah Jenkins',
      department: 'Engineering',
      category: 'Meals & Entertainment',
      amount: 145.50,
      description: 'Team sprint retrospective lunch with verified receipt',
      date: '2026-10-14',
      time: '12:30'
    },
    duplicate: {
      employee: 'Alex Rivera',
      department: 'Sales',
      category: 'Meals & Entertainment',
      amount: 3200,
      description: 'VIP Client Dinner & Lounge reservation',
      date: '2026-10-15',
      time: '14:00'
    },
    highval: {
      employee: 'Marcus Vance',
      department: 'Executive',
      category: 'Equipment',
      amount: 16500,
      description: 'Executive portable workstation setup & audio monitors',
      date: '2026-10-18',
      time: '23:45'
    },
    oddtime: {
      employee: 'David Chen',
      department: 'Engineering',
      category: 'Consulting',
      amount: 5000,
      description: 'Emergency offshore architectural consulting advisory',
      date: '2026-10-17',
      time: '02:15'
    }
  };

  presetButtons.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const presetKey = btn.dataset.preset;
      const data = presets[presetKey];
      if (!data) return;

      document.getElementById('audit-employee').value = data.employee;
      document.getElementById('audit-department').value = data.department;
      document.getElementById('audit-category').value = data.category;
      document.getElementById('audit-amount').value = data.amount;
      document.getElementById('audit-description').value = data.description;
      document.getElementById('audit-date').value = data.date;
      document.getElementById('audit-time').value = data.time;

      showToast(`Loaded ${presetKey.toUpperCase()} scenario`, 'info', 2000);
    });
  });
}

/**
 * Setup Audit Form submission
 */
function setupAuditForm() {
  const form = document.getElementById('expense-audit-form');
  const resultCard = document.getElementById('audit-result-card');
  const emptyState = document.getElementById('audit-empty-state');
  const submitBtn = document.getElementById('btn-submit-audit');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const employee = document.getElementById('audit-employee').value.trim();
    const department = document.getElementById('audit-department').value;
    const category = document.getElementById('audit-category').value;
    const amount = parseFloat(document.getElementById('audit-amount').value);
    const date = document.getElementById('audit-date').value;
    const time = document.getElementById('audit-time').value;
    const description = document.getElementById('audit-description').value.trim();

    if (!employee || isNaN(amount) || amount <= 0 || !category || !description) {
      showToast('Please fill out all required fields with a valid amount.', 'error');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = `
        <i class="fa-solid fa-brain fa-spin"></i>
        <span>AI Risk Engine Analyzing...</span>
      `;
    }

    if (resultCard) resultCard.classList.add('analyzing');

    try {
      const payload = {
        employee,
        department,
        category,
        amount,
        date,
        time,
        description,
        receiptHash: receiptState.hash,
        ocrAmount: receiptState.ocrAmount,
        ocrText: receiptState.ocrText,
        ocrVendor: receiptState.ocrVendor
      };

      const evaluatedExpense = await API.createExpense(payload);

      if (emptyState) emptyState.style.display = 'none';
      if (resultCard) {
        resultCard.style.display = 'block';
        resultCard.classList.remove('analyzing');
      }

      renderAuditResult(evaluatedExpense);

      const toastType = evaluatedExpense.riskLevel === 'High' ? 'error' : evaluatedExpense.riskLevel === 'Medium' ? 'warning' : 'success';
      showToast(`Expense audited: Risk Score ${evaluatedExpense.riskScore}/100 (${evaluatedExpense.riskLevel})`, toastType);

      // Clear any active search or category filters so the new claim is immediately visible in the table
      if (typeof dashboardState !== 'undefined') {
        dashboardState.currentCategory = 'all';
        dashboardState.currentRisk = 'all';
        dashboardState.searchQuery = '';
        const catFilter = document.getElementById('filter-category');
        const riskFilter = document.getElementById('filter-risk');
        const searchInput = document.getElementById('table-search');
        if (catFilter) catFilter.value = 'all';
        if (riskFilter) riskFilter.value = 'all';
        if (searchInput) searchInput.value = '';
      }

      // Refresh dashboard tables, KPI stats, charts, and approvals queue
      if (typeof loadDashboardData === 'function') {
        await loadDashboardData();
      }

      // Reset receipt state
      receiptState = { hash: null, ocrAmount: null, ocrText: null, ocrVendor: null };
      const previewContainer = document.getElementById('receipt-preview-container');
      if (previewContainer) previewContainer.style.display = 'none';
      const fileInput = document.getElementById('audit-receipt-file');
      if (fileInput) fileInput.value = '';

    } catch (error) {
      showToast(`Audit failed: ${error.message}`, 'error');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <i class="fa-solid fa-wand-magic-sparkles"></i>
          <span>Run AI Fraud Audit</span>
        `;
      }
    }
  });
}

/**
 * Render Evaluated Result with Animated SVG Gauge & Reasons List
 */
function renderAuditResult(expense) {
  if (typeof animateGauge === 'function') {
    animateGauge(expense.riskScore, expense.riskLevel);
  }

  const summaryEl = document.getElementById('result-summary-text');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <strong>${expense.id}</strong> · <span class="font-mono">$${expense.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
      <div class="text-xs text-muted mt-1">${expense.employee} (${expense.department}) — ${expense.category}</div>
    `;
  }

  const statusEl = document.getElementById('result-status-pill');
  if (statusEl) {
    statusEl.className = `status-badge status-${expense.status.toLowerCase()}`;
    statusEl.textContent = `Status: ${expense.status.toUpperCase()} (${expense.currentLevel})`;
  }

  const reasonsList = document.getElementById('result-reasons-list');
  if (reasonsList) {
    if (!expense.reasons || expense.reasons.length === 0) {
      reasonsList.innerHTML = `<li class="reason-item text-success"><i class="fa-solid fa-circle-check"></i> Standard verified corporate expenditure.</li>`;
    } else {
      reasonsList.innerHTML = expense.reasons.map(reason => {
        const isWarning = reason.includes('+50') || reason.includes('+40') || reason.includes('+35') || reason.includes('+30') || reason.includes('+25');
        const iconClass = isWarning ? 'fa-solid fa-triangle-exclamation text-danger' : 'fa-solid fa-info-circle text-warning';
        return `
          <li class="reason-item">
            <i class="${iconClass}"></i>
            <span>${reason}</span>
          </li>
        `;
      }).join('');
    }
  }

  // Stepper preview inside result card
  const stepperContainer = document.getElementById('result-stepper-container');
  if (stepperContainer && expense.requiredLevels) {
    stepperContainer.innerHTML = `
      <div class="approval-stepper" style="margin-top: 14px;">
        ${expense.requiredLevels.map(lvl => {
          const isDone = expense.approvals && expense.approvals.some(a => a.level === lvl && a.action === 'Approved');
          const isCurrent = expense.currentLevel === lvl;
          const cls = isDone ? 'step-done' : isCurrent ? 'step-current' : 'step-pending';
          return `<div class="step-pill ${cls}"><i class="fa-solid ${isDone ? 'fa-check' : 'fa-circle-dot'}"></i> ${lvl}</div>`;
        }).join('<span class="step-arrow">&rarr;</span>')}
      </div>
    `;
  }
}
