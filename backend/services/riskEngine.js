/**
 * AuditAI - Enhanced Risk Engine (Rule-based Fraud & Anomaly Detection)
 * Evaluates expense submissions against corporate fraud, policy, and behavioral rules.
 * 
 * Rules & Point Weights:
 * 1. Amount > 10,000                                -> +50 points
 * 2. Duplicate submission (same employee/cat/amount) -> +30 points
 * 3. Submitted on weekend / 11pm - 5am              -> +20 points
 * 4. Suspicious round-number amount                 -> +10 points
 * 5. Amount > 3x category average                   -> +25 points
 * 6. Duplicate receipt hash                         -> +40 points
 * 7. Claimed amount differs from OCR amount by >5%  -> +30 points
 * 8. Split transaction (within 48 hrs > 10,000)     -> +35 points
 * 9. Behavioral deviation (>2 std dev above mean)   -> +25 points
 * 10. Frequency spike (>5 expenses in one day)      -> +15 points
 * 11. New category claim with high value            -> +10 points
 * 
 * Score Range: 0 - 100
 * Risk Levels: Low (0-29), Medium (30-59), High (60+)
 */

function evaluateRisk(expense, existingExpenses = []) {
  const reasons = [];
  let score = 0;

  const amount = parseFloat(expense.amount) || 0;
  const employee = (expense.employee || '').trim();
  const category = (expense.category || '').trim();
  const vendor = (expense.receipt && expense.receipt.vendor ? expense.receipt.vendor : '').trim().toLowerCase();
  const receiptHash = expense.receipt && expense.receipt.hash ? expense.receipt.hash : (expense.receiptHash || null);
  const ocrAmount = expense.receipt && expense.receipt.ocrAmount ? parseFloat(expense.receipt.ocrAmount) : (parseFloat(expense.ocrAmount) || null);

  // Parse submission timestamp
  let submissionDate;
  try {
    if (expense.date && expense.time) {
      submissionDate = new Date(`${expense.date}T${expense.time}:00`);
    } else if (expense.date) {
      submissionDate = new Date(expense.date);
    } else {
      submissionDate = new Date();
    }
  } catch (err) {
    submissionDate = new Date();
  }
  const submissionTimeMs = isNaN(submissionDate.getTime()) ? Date.now() : submissionDate.getTime();

  // -------------------------------------------------------------
  // Rule 1: High Amount Ceiling (> 10,000)
  // -------------------------------------------------------------
  if (amount > 10000) {
    score += 50;
    reasons.push(`High transaction amount ($${amount.toLocaleString()}) exceeds the $10,000 corporate review threshold (+50)`);
  }

  // -------------------------------------------------------------
  // Rule 2: Duplicate Detection (same employee, category, amount)
  // -------------------------------------------------------------
  const isDuplicate = existingExpenses.some(prev => {
    if (expense.id && prev.id === expense.id) return false;
    if (expense._id && prev._id && prev._id.toString() === expense._id.toString()) return false;

    const sameEmp = (prev.employee || '').trim().toLowerCase() === employee.toLowerCase();
    const sameCat = (prev.category || '').trim().toLowerCase() === category.toLowerCase();
    const sameAmt = Math.abs((parseFloat(prev.amount) || 0) - amount) < 0.01;

    return sameEmp && sameCat && sameAmt;
  });

  if (isDuplicate) {
    score += 30;
    reasons.push(`Duplicate expense detected: exact match on employee, category, and amount ($${amount.toLocaleString()}) (+30)`);
  }

  // -------------------------------------------------------------
  // Rule 3: Timing Anomaly (Weekend or 11 PM - 5 AM)
  // -------------------------------------------------------------
  let isWeekend = false;
  let isLateNight = false;

  if (!isNaN(submissionDate.getTime())) {
    const day = submissionDate.getDay(); // 0 = Sunday, 6 = Saturday
    isWeekend = (day === 0 || day === 6);

    if (expense.time) {
      const hour = parseInt(expense.time.split(':')[0], 10);
      isLateNight = (hour >= 23 || hour < 5);
    }
  }

  if (isWeekend || isLateNight) {
    score += 20;
    const detail = isWeekend && isLateNight
      ? 'weekend during late-night hours (11 PM - 5 AM)'
      : isWeekend
      ? 'weekend submission'
      : 'late-night submission (11 PM - 5 AM)';
    reasons.push(`Irregular submission timing: filed on a ${detail} (+20)`);
  }

  // -------------------------------------------------------------
  // Rule 4: Round-Number Anomaly (e.g. 5000, 2500 flat with no cents)
  // -------------------------------------------------------------
  const isRoundNumber = Number.isInteger(amount) && amount >= 500 && (amount % 100 === 0);
  if (isRoundNumber) {
    score += 10;
    reasons.push(`Suspicious round-number amount ($${amount.toLocaleString()}) without itemized cents (+10)`);
  }

  // -------------------------------------------------------------
  // Rule 5: Category Outlier (> 3x category average)
  // -------------------------------------------------------------
  const categoryExpenses = existingExpenses.filter(
    e => (e.category || '').trim().toLowerCase() === category.toLowerCase() && (parseFloat(e.amount) || 0) > 0
  );

  let categoryAvg = 0;
  if (categoryExpenses.length > 0) {
    const totalCat = categoryExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    categoryAvg = totalCat / categoryExpenses.length;

    if (amount > 3 * categoryAvg) {
      score += 25;
      reasons.push(
        `Amount ($${amount.toLocaleString()}) is more than 3x the ${category} historical average ($${Math.round(categoryAvg).toLocaleString()}) (+25)`
      );
    }
  }

  // -------------------------------------------------------------
  // Rule 6: Duplicate Receipt Hash Detection
  // -------------------------------------------------------------
  if (receiptHash) {
    const duplicateReceipt = existingExpenses.some(prev => {
      if (expense.id && prev.id === expense.id) return false;
      const prevHash = prev.receipt && prev.receipt.hash;
      return prevHash && prevHash === receiptHash;
    });

    if (duplicateReceipt) {
      score += 40;
      reasons.push('Receipt already submitted: duplicate digital receipt hash detected (+40)');
    }
  }

  // -------------------------------------------------------------
  // Rule 7: Claimed Amount differs from OCR Amount (> 5%)
  // -------------------------------------------------------------
  if (ocrAmount && ocrAmount > 0) {
    const diff = Math.abs(amount - ocrAmount);
    const percentDiff = diff / ocrAmount;

    if (percentDiff > 0.05) {
      score += 30;
      reasons.push(
        `Claimed amount ($${amount.toFixed(2)}) does not match receipt OCR amount ($${ocrAmount.toFixed(2)}, ${(percentDiff * 100).toFixed(1)}% variance) (+30)`
      );
    }
  }

  // -------------------------------------------------------------
  // Rule 8: Split Transaction Detection
  // (Same employee & category/vendor within 48h totaling > 10,000 while each is < 10,000)
  // -------------------------------------------------------------
  if (amount < 10000) {
    const fortyEightHoursMs = 48 * 60 * 60 * 1000;
    const recentRelatedExpenses = existingExpenses.filter(prev => {
      if (expense.id && prev.id === expense.id) return false;

      const sameEmp = (prev.employee || '').trim().toLowerCase() === employee.toLowerCase();
      const sameCatOrVendor = (prev.category || '').trim().toLowerCase() === category.toLowerCase() ||
        (vendor && prev.receipt && prev.receipt.vendor && prev.receipt.vendor.toLowerCase() === vendor);

      if (!sameEmp || !sameCatOrVendor) return false;

      const prevTime = new Date(`${prev.date}T${prev.time || '12:00'}:00`).getTime();
      if (isNaN(prevTime)) return false;

      const timeDiff = Math.abs(submissionTimeMs - prevTime);
      return timeDiff <= fortyEightHoursMs && (parseFloat(prev.amount) || 0) < 10000;
    });

    if (recentRelatedExpenses.length >= 1) {
      const combinedTotal = recentRelatedExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), amount);
      if (combinedTotal > 10000) {
        score += 35;
        reasons.push(
          `Possible split transaction: ${recentRelatedExpenses.length + 1} submissions in ${category} within 48 hours totaling $${Math.round(combinedTotal).toLocaleString()} under approval threshold (+35)`
        );
      }
    }
  }

  // -------------------------------------------------------------
  // Rule 9: Behavioral Deviation (> 2 Std Deviations above employee history)
  // -------------------------------------------------------------
  const employeeHistory = existingExpenses.filter(
    prev => (prev.employee || '').trim().toLowerCase() === employee.toLowerCase() &&
            (parseFloat(prev.amount) || 0) > 0 &&
            (!expense.id || prev.id !== expense.id)
  );

  if (employeeHistory.length >= 5) {
    const pastAmounts = employeeHistory.map(e => parseFloat(e.amount) || 0);
    const mean = pastAmounts.reduce((a, b) => a + b, 0) / pastAmounts.length;
    const variance = pastAmounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / pastAmounts.length;
    const stdDev = Math.sqrt(variance);

    if (stdDev > 0 && amount > (mean + 2 * stdDev)) {
      score += 25;
      reasons.push(
        `Unusual compared to this employee's normal spending: amount ($${amount.toLocaleString()}) exceeds 2 standard deviations above historical mean ($${Math.round(mean).toLocaleString()} ± $${Math.round(stdDev).toLocaleString()}) (+25)`
      );
    }
  }

  // -------------------------------------------------------------
  // Rule 10: Frequency Spike (> 5 submissions in one calendar day)
  // -------------------------------------------------------------
  const sameDaySubmissions = existingExpenses.filter(prev => {
    if (expense.id && prev.id === expense.id) return false;
    const sameEmp = (prev.employee || '').trim().toLowerCase() === employee.toLowerCase();
    const sameDate = prev.date === expense.date;
    return sameEmp && sameDate;
  });

  if (sameDaySubmissions.length >= 5) {
    score += 15;
    reasons.push(
      `Unusually high submission frequency: employee has filed ${sameDaySubmissions.length + 1} expenses on this single day (+15)`
    );
  }

  // -------------------------------------------------------------
  // Rule 11: New Category for Employee with High Amount
  // -------------------------------------------------------------
  const employeePreviousCategories = new Set(
    employeeHistory.map(e => (e.category || '').trim().toLowerCase())
  );

  if (!employeePreviousCategories.has(category.toLowerCase()) && (amount >= 2000 || (categoryAvg > 0 && amount > categoryAvg * 1.5))) {
    score += 10;
    reasons.push(
      `First-time category claim (${category}) for this employee with a high monetary value ($${amount.toLocaleString()}) (+10)`
    );
  }

  // -------------------------------------------------------------
  // Final Score & Risk Level Calculation
  // -------------------------------------------------------------
  const finalScore = Math.min(100, Math.max(0, score));

  let level = 'Low';
  if (finalScore >= 60) {
    level = 'High';
  } else if (finalScore >= 30) {
    level = 'Medium';
  }

  if (reasons.length === 0) {
    reasons.push('Verified: Transaction is within standard corporate policy and behavioral baselines.');
  }

  return {
    score: finalScore,
    level,
    reasons
  };
}

/**
 * Multi-Level Approval Chain Determinant
 * Chain depends on amount and risk level:
 * - Amount < 10,000 and risk Low/Medium -> Manager only
 * - Amount 10,000 to 50,000 or risk High -> Manager, then Auditor
 * - Amount > 50,000 -> Manager, then Auditor, then Admin
 */
function getRequiredApprovalLevels(amount, riskLevel) {
  const amt = parseFloat(amount) || 0;

  if (amt > 50000) {
    return ['Manager', 'Auditor', 'Admin'];
  }

  if (amt >= 10000 || riskLevel === 'High') {
    return ['Manager', 'Auditor'];
  }

  return ['Manager'];
}

module.exports = {
  evaluateRisk,
  getRequiredApprovalLevels
};
