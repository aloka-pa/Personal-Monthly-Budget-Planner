// ============================================================
// financial-health-score.js - Financial Health Score widget
// (Dashboard page)
// ============================================================
//
// Implements docs/Financial-Health-Score-Logic.md. The score
// summarizes the latest fully completed calendar month across four
// independently-weighted components: Budgeting, Saving, Spending
// Consistency, and Goals. See that document for the full rules -
// this file is the calculation + rendering implementation of it.
//
// Data access mirrors the existing per-page fetch conventions in
// budgets.js / expenses.js / income.js / financial-goals.js (own
// Supabase queries per file, including the amount/budget_amount
// column fallback used for category_budgets).
// ============================================================

(function () {
  "use strict";

  const ORIGINAL_WEIGHTS = { budgeting: 30, saving: 30, spending: 20, goals: 20 };
  const SAVINGS_BENCHMARK = 0.20;
  const COMPONENT_KEYS = ["budgeting", "saving", "spending", "goals"];
  const COMPONENT_LABELS = {
    budgeting: "Budgeting",
    saving: "Saving",
    spending: "Spending Consistency",
    goals: "Goals",
  };

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function toLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function monthFirstDayString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}-01`;
  }

  // ------------------------------------------------------------
  // Score month selection
  // ------------------------------------------------------------
  // Returns the calendar month immediately before `referenceDate`'s
  // month - i.e. the latest fully completed month when referenceDate
  // is "today". Passing a month's own `start` back in recursively
  // walks one month further back (used to get the comparison month).
  // ------------------------------------------------------------
  function getScoreMonthInfo(referenceDate) {
    const start = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);
    const end = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 0);
    return {
      firstDay: monthFirstDayString(start),
      start,
      end,
      daysInMonth: end.getDate(),
    };
  }

  // ------------------------------------------------------------
  // Data access
  // ------------------------------------------------------------

  async function fetchCategories(userId) {
    const { data, error } = await supabaseClient
      .from("categories")
      .select("id, include_in_budget")
      .or(`user_id.is.null,user_id.eq.${userId}`);

    if (error) throw error;
    return data || [];
  }

  async function fetchCategoryBudgetsForMonth(userId, monthFirstDay) {
    const primary = await supabaseClient
      .from("category_budgets")
      .select("category_id, amount")
      .eq("user_id", userId)
      .eq("month", monthFirstDay);

    if (!primary.error) return primary.data || [];

    const fallback = await supabaseClient
      .from("category_budgets")
      .select("category_id, budget_amount")
      .eq("user_id", userId)
      .eq("month", monthFirstDay);

    if (fallback.error) throw primary.error;

    return (fallback.data || []).map((row) => ({
      category_id: row.category_id,
      amount: Number(row.budget_amount),
    }));
  }

  async function fetchExpensesForMonth(userId, monthFirstDay) {
    const { data, error } = await supabaseClient
      .from("expenses")
      .select("category_id, amount, expense_datetime")
      .eq("user_id", userId)
      .eq("budget_month", monthFirstDay);

    if (error) throw error;
    return data || [];
  }

  async function fetchIncomeForMonth(userId, monthFirstDay) {
    const { data, error } = await supabaseClient
      .from("monthly_incomes")
      .select("amount")
      .eq("user_id", userId)
      .eq("month", monthFirstDay)
      .maybeSingle();

    if (error) throw error;
    return data ? Number(data.amount) : null;
  }

  async function fetchGoalsData(userId) {
    const [goalsResult, contributionsResult] = await Promise.all([
      supabaseClient
        .from("financial_goals")
        .select("id, target_amount, target_date, created_at")
        .eq("user_id", userId),
      supabaseClient
        .from("goal_contributions")
        .select("goal_id, amount, contribution_date")
        .eq("user_id", userId),
    ]);

    if (goalsResult.error) throw goalsResult.error;
    if (contributionsResult.error) throw contributionsResult.error;

    return { goals: goalsResult.data || [], contributions: contributionsResult.data || [] };
  }

  // ------------------------------------------------------------
  // Budgeting component
  // ------------------------------------------------------------
  // Only categories with include_in_budget = true are eligible.
  // Weighted Category Adherence (80%) + Budget Coverage (20%).
  // ------------------------------------------------------------
  function computeBudgetingComponent({ categories, categoryBudgets, expenses }) {
    const eligibleIds = new Set(
      categories.filter((category) => category.include_in_budget !== false).map((category) => String(category.id))
    );

    const budgetByCategory = new Map();
    categoryBudgets.forEach((row) => {
      const id = String(row.category_id);
      if (!eligibleIds.has(id)) return;
      budgetByCategory.set(id, Number(row.amount));
    });

    const spendingByCategory = new Map();
    expenses.forEach((expense) => {
      const id = String(expense.category_id);
      if (!eligibleIds.has(id)) return;
      spendingByCategory.set(id, (spendingByCategory.get(id) || 0) + Number(expense.amount));
    });

    const aggregateBudget = Array.from(budgetByCategory.values()).reduce((sum, amount) => sum + amount, 0);

    if (!(aggregateBudget > 0)) {
      return { available: false, score: null };
    }

    let weightedNumerator = 0;
    let weightedDenominator = 0;
    let budgetedSpending = 0;

    budgetByCategory.forEach((budgetAmount, categoryId) => {
      const spending = spendingByCategory.get(categoryId) || 0;
      const adherence = spending <= budgetAmount ? 100 : (100 * budgetAmount) / spending;
      weightedNumerator += adherence * spending;
      weightedDenominator += spending;
      budgetedSpending += spending;
    });

    const weightedAdherence = weightedDenominator > 0 ? weightedNumerator / weightedDenominator : 100;

    const allEligibleSpending = Array.from(spendingByCategory.values()).reduce((sum, amount) => sum + amount, 0);
    const coverage = allEligibleSpending > 0 ? (budgetedSpending / allEligibleSpending) * 100 : 100;

    const score = clamp(weightedAdherence * 0.8 + coverage * 0.2, 0, 100);

    return { available: true, score, weightedAdherence, coverage };
  }

  // ------------------------------------------------------------
  // Saving component
  // ------------------------------------------------------------
  // Uses ALL of the month's expenses - never filtered by
  // include_in_budget. Unavailable (not zero) without positive income.
  // ------------------------------------------------------------
  function computeSavingComponent({ income, allExpensesTotal }) {
    if (!isFiniteNumber(income) || income <= 0) {
      return { available: false, score: null };
    }

    const savingsRate = (income - allExpensesTotal) / income;
    const score = clamp((savingsRate / SAVINGS_BENCHMARK) * 100, 0, 100);
    return { available: true, score, savingsRate };
  }

  // ------------------------------------------------------------
  // Spending Consistency component
  // ------------------------------------------------------------
  // Daily-target model: a day succeeds when that day's
  // budget-enabled spending does not exceed the monthly
  // budget-enabled budget divided across the days in the month.
  // ------------------------------------------------------------
  function computeSpendingConsistencyComponent({ categories, categoryBudgets, expenses, daysInMonth, monthStart }) {
    const eligibleIds = new Set(
      categories.filter((category) => category.include_in_budget !== false).map((category) => String(category.id))
    );

    const aggregateBudget = categoryBudgets
      .filter((row) => eligibleIds.has(String(row.category_id)))
      .reduce((sum, row) => sum + Number(row.amount), 0);

    if (!(aggregateBudget > 0)) {
      return { available: false, score: null };
    }

    const dailyTarget = aggregateBudget / daysInMonth;

    const spendingByDay = new Map();
    expenses.forEach((expense) => {
      if (!eligibleIds.has(String(expense.category_id))) return;
      const expenseDate = new Date(expense.expense_datetime);
      if (Number.isNaN(expenseDate.getTime())) return;
      const key = toLocalDateKey(expenseDate);
      spendingByDay.set(key, (spendingByDay.get(key) || 0) + Number(expense.amount));
    });

    let successfulDays = 0;
    for (let day = 1; day <= daysInMonth; day += 1) {
      const cursor = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
      const daySpend = spendingByDay.get(toLocalDateKey(cursor)) || 0;
      if (daySpend <= dailyTarget) successfulDays += 1;
    }

    const score = clamp((successfulDays / daysInMonth) * 100, 0, 100);
    return { available: true, score, successfulDays };
  }

  // ------------------------------------------------------------
  // Goals component
  // ------------------------------------------------------------
  // "Goal Start" is the goal's created_at date - the only creation
  // reference the existing schema provides (financial_goals has no
  // separate start-date field). Historical completion is never
  // inferred from the current is_completed flag.
  // ------------------------------------------------------------
  function computeGoalScore(goal, contributionsTotal, scoreMonthEnd) {
    const targetAmount = Number(goal.target_amount);
    if (!isFiniteNumber(targetAmount) || targetAmount <= 0) return null;

    const createdAt = goal.created_at ? new Date(goal.created_at) : null;
    if (!createdAt || Number.isNaN(createdAt.getTime())) return null;

    const goalStart = new Date(createdAt.getFullYear(), createdAt.getMonth(), createdAt.getDate());
    if (goalStart > scoreMonthEnd) return null;

    const actualProgress = contributionsTotal / targetAmount;
    if (!isFiniteNumber(actualProgress)) return null;

    if (!goal.target_date) {
      const score = clamp(actualProgress * 100, 0, 100);
      return isFiniteNumber(score) ? score : null;
    }

    const targetDate = new Date(`${goal.target_date}T00:00:00`);
    if (Number.isNaN(targetDate.getTime())) return null;

    const totalDurationMs = targetDate.getTime() - goalStart.getTime();
    if (!isFiniteNumber(totalDurationMs) || totalDurationMs <= 0) return null;

    const cutoffMs = Math.min(scoreMonthEnd.getTime(), targetDate.getTime());
    const elapsedDurationMs = cutoffMs - goalStart.getTime();
    if (!isFiniteNumber(elapsedDurationMs) || elapsedDurationMs <= 0) return null;

    const expectedProgress = elapsedDurationMs / totalDurationMs;
    if (!isFiniteNumber(expectedProgress) || expectedProgress <= 0) return null;

    const rawScore = (actualProgress / expectedProgress) * 100;
    if (!isFiniteNumber(rawScore)) return null;

    return clamp(rawScore, 0, 100);
  }

  function computeGoalsComponent({ goals, contributions, scoreMonthEnd }) {
    const contributionsByGoal = new Map();
    contributions.forEach((row) => {
      const contributionDate = new Date(`${row.contribution_date}T00:00:00`);
      if (Number.isNaN(contributionDate.getTime())) return;
      if (contributionDate > scoreMonthEnd) return;
      contributionsByGoal.set(row.goal_id, (contributionsByGoal.get(row.goal_id) || 0) + Number(row.amount));
    });

    const scores = [];
    goals.forEach((goal) => {
      const contributionsTotal = contributionsByGoal.get(goal.id) || 0;
      const score = computeGoalScore(goal, contributionsTotal, scoreMonthEnd);
      if (score !== null) scores.push(score);
    });

    if (scores.length === 0) return { available: false, score: null };

    const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
    return { available: true, score: clamp(average, 0, 100), eligibleCount: scores.length };
  }

  // ------------------------------------------------------------
  // Combining components + weight rebalancing
  // ------------------------------------------------------------
  function availabilitySignature(components) {
    return COMPONENT_KEYS.map((key) => (components[key].available ? "1" : "0")).join("");
  }

  function combineComponents(components) {
    const availableKeys = COMPONENT_KEYS.filter((key) => components[key].available);
    const coreAvailable = components.budgeting.available || components.saving.available;
    const minimumMet = coreAvailable && availableKeys.length >= 2;

    if (!minimumMet) {
      return { minimumMet: false, overall: null, availabilitySignature: availabilitySignature(components) };
    }

    const weightSum = availableKeys.reduce((sum, key) => sum + ORIGINAL_WEIGHTS[key], 0);
    const weightedSum = availableKeys.reduce(
      (sum, key) => sum + components[key].score * ORIGINAL_WEIGHTS[key],
      0
    );

    return {
      minimumMet: true,
      overall: clamp(weightedSum / weightSum, 0, 100),
      availabilitySignature: availabilitySignature(components),
    };
  }

  function getScoreLabel(roundedScore) {
    if (roundedScore >= 90) return "Excellent";
    if (roundedScore >= 75) return "Good";
    if (roundedScore >= 60) return "Fair";
    if (roundedScore >= 40) return "Needs attention";
    return "At risk";
  }

  function getScoreColorClass(roundedScore) {
    if (roundedScore >= 75) return "text-success";
    if (roundedScore >= 40) return "text-warning";
    return "text-danger";
  }

  // ------------------------------------------------------------
  // Month orchestration
  // ------------------------------------------------------------
  async function calculateMonthScore(userId, monthInfo, categories, goalsData) {
    const [categoryBudgets, expenses, income] = await Promise.all([
      fetchCategoryBudgetsForMonth(userId, monthInfo.firstDay),
      fetchExpensesForMonth(userId, monthInfo.firstDay),
      fetchIncomeForMonth(userId, monthInfo.firstDay),
    ]);

    const allExpensesTotal = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

    const components = {
      budgeting: computeBudgetingComponent({ categories, categoryBudgets, expenses }),
      saving: computeSavingComponent({ income, allExpensesTotal }),
      spending: computeSpendingConsistencyComponent({
        categories,
        categoryBudgets,
        expenses,
        daysInMonth: monthInfo.daysInMonth,
        monthStart: monthInfo.start,
      }),
      goals: computeGoalsComponent({
        goals: goalsData.goals,
        contributions: goalsData.contributions,
        scoreMonthEnd: monthInfo.end,
      }),
    };

    return { monthInfo, components, combined: combineComponents(components) };
  }

  function getComparison(current, previous) {
    if (!current.combined.minimumMet || !previous.combined.minimumMet) {
      return { valid: false };
    }
    if (current.combined.availabilitySignature !== previous.combined.availabilitySignature) {
      return { valid: false };
    }

    const rawDelta = current.combined.overall - previous.combined.overall;
    return { valid: true, rawDelta, roundedDelta: Math.round(rawDelta) };
  }

  function buildExplanation(current, previous, comparison) {
    if (comparison.valid && comparison.roundedDelta !== 0) {
      const improved = comparison.roundedDelta > 0;
      const movers = [];

      COMPONENT_KEYS.forEach((key) => {
        const curr = current.components[key];
        const prev = previous.components[key];
        if (!curr.available || !prev.available) return;
        const diff = curr.score - prev.score;
        if (improved && diff > 0) movers.push(`${COMPONENT_LABELS[key]} improved.`);
        if (!improved && diff < 0) movers.push(`${COMPONENT_LABELS[key]} declined.`);
      });

      return {
        heading: improved ? "Your score improved because…" : "Your score decreased because…",
        bullets: movers.length
          ? movers
          : [improved ? "Your overall score improved this month." : "Your overall score decreased this month."],
      };
    }

    const bullets = [];
    const { budgeting, saving, spending, goals } = current.components;

    if (saving.available && saving.savingsRate < SAVINGS_BENCHMARK) {
      bullets.push("Savings rate was below the 20% benchmark.");
    }
    if (budgeting.available && budgeting.weightedAdherence < 100) {
      bullets.push("One or more categories exceeded their configured budgets.");
    }
    if (budgeting.available && budgeting.coverage < 100) {
      bullets.push("Some budget-enabled spending occurred in categories without budgets.");
    }
    if (spending.available && spending.successfulDays < current.monthInfo.daysInMonth) {
      bullets.push("A number of days exceeded the daily spending target.");
    }
    if (goals.available && goals.score < 100) {
      bullets.push("One or more goals were behind their expected progress.");
    }

    return {
      heading: "What affected your score",
      bullets: bullets.length ? bullets : ["Your finances were on track this month."],
    };
  }

  // ------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------
  function componentChip(label, component) {
    const col = document.createElement("div");
    col.className = "col-6";

    if (!component.available) {
      col.innerHTML = `
        <div class="health-component-chip is-unavailable">
          <span class="health-component-label">${label}</span>
          <span class="health-component-value text-muted">—</span>
        </div>`;
      return col;
    }

    const rounded = Math.round(component.score);
    col.innerHTML = `
      <div class="health-component-chip">
        <span class="health-component-label">${label}</span>
        <span class="health-component-value ${getScoreColorClass(rounded)}">${rounded}</span>
      </div>`;
    return col;
  }

  function renderHealthScore({ current, comparison, explanation }) {
    document.getElementById("healthScoreLoading").classList.add("d-none");
    document.getElementById("healthScoreContent").classList.remove("d-none");

    const overallValueEl = document.getElementById("healthScoreOverallValue");
    const overallLabelEl = document.getElementById("healthScoreOverallLabel");
    const deltaEl = document.getElementById("healthScoreDelta");
    const noteEl = document.getElementById("healthScoreInsufficientNote");
    const componentsEl = document.getElementById("healthScoreComponents");
    const explanationEl = document.getElementById("healthScoreExplanation");

    if (current.combined.minimumMet) {
      const rounded = Math.round(current.combined.overall);
      overallValueEl.textContent = String(rounded);
      overallValueEl.className = `h2 mb-0 ${getScoreColorClass(rounded)}`;
      overallLabelEl.textContent = getScoreLabel(rounded);
      noteEl.classList.add("d-none");

      if (comparison.valid) {
        if (comparison.roundedDelta > 0) {
          deltaEl.innerHTML = `<i class="bi bi-arrow-up-short"></i> ${comparison.roundedDelta} pts vs last month`;
          deltaEl.className = "health-score-delta text-success";
        } else if (comparison.roundedDelta < 0) {
          deltaEl.innerHTML = `<i class="bi bi-arrow-down-short"></i> ${Math.abs(comparison.roundedDelta)} pts vs last month`;
          deltaEl.className = "health-score-delta text-danger";
        } else {
          deltaEl.textContent = "No change vs last month";
          deltaEl.className = "health-score-delta text-muted";
        }
      } else {
        deltaEl.textContent = "Comparison unavailable — data coverage changed.";
        deltaEl.className = "health-score-delta text-muted";
      }
    } else {
      overallValueEl.textContent = "—";
      overallValueEl.className = "h2 mb-0 text-muted";
      overallLabelEl.textContent = "";
      deltaEl.textContent = "";
      deltaEl.className = "health-score-delta";
      noteEl.classList.remove("d-none");
    }

    componentsEl.innerHTML = "";
    COMPONENT_KEYS.forEach((key) => {
      componentsEl.appendChild(componentChip(COMPONENT_LABELS[key], current.components[key]));
    });

    explanationEl.innerHTML = `
      <h3 class="h6 mb-2">${explanation.heading}</h3>
      <ul class="mb-0 small">
        ${explanation.bullets.map((bullet) => `<li>${bullet}</li>`).join("")}
      </ul>`;
  }

  async function loadHealthScoreWidget(userId) {
    const scoreMonth = getScoreMonthInfo(new Date());
    const comparisonMonth = getScoreMonthInfo(scoreMonth.start);

    const monthLabelEl = document.getElementById("healthScoreMonthLabel");
    if (monthLabelEl) {
      monthLabelEl.textContent = scoreMonth.start.toLocaleDateString(undefined, {
        month: "long",
        year: "numeric",
      });
    }

    const [categories, goalsData] = await Promise.all([fetchCategories(userId), fetchGoalsData(userId)]);

    const [current, previous] = await Promise.all([
      calculateMonthScore(userId, scoreMonth, categories, goalsData),
      calculateMonthScore(userId, comparisonMonth, categories, goalsData),
    ]);

    const comparison = getComparison(current, previous);
    const explanation = buildExplanation(current, previous, comparison);

    renderHealthScore({ current, previous, comparison, explanation });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    const contentEl = document.getElementById("healthScoreContent");
    if (!contentEl) return;

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) return;

    await window.getUserCurrency();

    try {
      await loadHealthScoreWidget(user.id);
    } catch (error) {
      console.error("Failed to calculate financial health score:", error.message);
      document.getElementById("healthScoreLoading").classList.add("d-none");
      const errorEl = document.getElementById("healthScoreError");
      if (errorEl) {
        errorEl.textContent = "We couldn't calculate your financial health score.";
        errorEl.classList.remove("d-none");
      }
    }
  });

  // Exposed for testing, mirroring window.WalletCheckSpendingStreaks.
  window.WalletCheckHealthScore = {
    getScoreMonthInfo,
    computeBudgetingComponent,
    computeSavingComponent,
    computeSpendingConsistencyComponent,
    computeGoalsComponent,
    combineComponents,
    getComparison,
    buildExplanation,
    getScoreLabel,
  };
})();
