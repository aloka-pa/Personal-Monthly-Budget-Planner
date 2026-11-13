// ============================================================
// dashboard.js - full history dashboard with Spending / Savings
// tabs + a compact monthly summary tile grid.
// ============================================================
//
// Instead of only comparing this month vs last month, this fetches
// ALL of the user's incomes + expenses once, figures out the full
// month range (from their earliest recorded month through the
// current month), and builds:
//   1. Spending tab: a line chart with one line per category,
//      showing that category's total spend (expense_type 'expense'
//      rows only) for every month in the range.
//   2. Savings tab: the financial goals widget, plus monthly bars
//      stacked by category for expense_type 'saving' rows and a
//      cumulative "total saved to date" line.
//   3. Monthly Summary tab: one tile per month showing that month's
//      income/out/balance plus a pie of the expense vs. savings share
//      of money out. "Out" includes savings: savings always reduce Balance.
//
// Charts are created the first time their tab is shown, because
// Chart.js cannot size a canvas inside a hidden (display:none) tab.
//
// Both automatically "grow" over time: as soon as new months have
// data, they show up here without any code changes.
// ============================================================

const CATEGORY_LINE_COLORS = [
  "#7692e4", // blue
  "#ff6699", // red
  "#94dd4d", // green
  "#ff9f0a", // orange
  "#a099ff", // purple
  "#64d2ff", // cyan
  "#8c7676", // pink
  "#ddb6c6", // yellow
  "#5e5ce6", // indigo
  "#8e8e93", // gray
  "#4dd0c7", // teal
  "#ff8a80", // coral
  "#c792ea", // lavender
  "#ffd54f", // gold
  "#66bb6a", // emerald
  "#ff7597", // rose
  "#7986cb", // periwinkle
  "#f0a868", // amber
  "#4fc3f7", // sky
  "#b39ddb", // violet
];

// Chart.js text/gridline colors that read well on both the light
// and dark theme backgrounds.
if (typeof Chart !== "undefined") {
  Chart.defaults.color = "#8e8e93";
  Chart.defaults.borderColor = "rgba(142, 142, 147, 0.25)";
}


// Returns a "YYYY-MM" key for a given Date, in local time.
function getMonthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

// Builds an ordered array of month descriptors from `startDate` to
// `endDate` (inclusive), one entry per calendar month.
// Each entry: { key: "YYYY-MM", label: "Jul 2026", rangeStart, rangeEnd }
function buildMonthRange(startDate, endDate) {
  const months = [];
  let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
  const last = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

  while (cursor <= last) {
    const rangeStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const rangeEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    months.push({
      key: getMonthKey(cursor),
      label: cursor.toLocaleDateString(undefined, { month: "short", year: "numeric" }),
      rangeStart,
      rangeEnd,
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return months;
}

// Fetches every income row the user has ever entered.
async function fetchAllIncomes(userId) {
  const { data, error } = await supabaseClient
    .from("monthly_incomes")
    .select("month, amount")
    .eq("user_id", userId)
    .order("month", { ascending: true });

  if (error) throw error;
  return data || [];
}

// Fetches every expense the user has ever logged, with category name.
async function fetchAllExpenses(userId) {
  const { data, error } = await supabaseClient
    .from("expenses")
    .select("amount, expense_datetime, budget_month, expense_type, categories(name)")
    .eq("user_id", userId)
    .order("expense_datetime", { ascending: true });

  if (error) throw error;
  return data || [];
}

// Loads the financial goals widget on the dashboard: overall progress bar only.
async function loadFinancialGoalsWidget(userId) {
  const loading = document.getElementById("dashboardGoalsLoading");
  const content = document.getElementById("dashboardGoalsContent");
  if (!loading || !content) return;

  const [{ data: goals, error: goalsError }, { data: contributions, error: contributionsError }] =
    await Promise.all([
      supabaseClient
        .from("financial_goals")
        .select("id, target_amount")
        .eq("user_id", userId),
      supabaseClient
        .from("goal_contributions")
        .select("goal_id, amount")
        .eq("user_id", userId),
    ]);

  if (goalsError || contributionsError) throw goalsError || contributionsError;

  const savedByGoal = {};
  (contributions || []).forEach((item) => {
    savedByGoal[item.goal_id] = (savedByGoal[item.goal_id] || 0) + Number(item.amount);
  });

  const allGoals = (goals || []).map((goal) => {
    const saved = savedByGoal[goal.id] || 0;
    const target = Number(goal.target_amount);
    return { ...goal, saved, target, progress: target > 0 ? (saved / target) * 100 : 0 };
  });

  // Totals mirror the Financial Goals page (all goals, not just active ones).
  const totalTarget = allGoals.reduce((sum, goal) => sum + goal.target, 0);
  const totalSaved = allGoals.reduce((sum, goal) => sum + goal.saved, 0);
  const percentage = totalTarget > 0 ? (totalSaved / totalTarget) * 100 : 0;

  document.getElementById("dashboardGoalsPercent").textContent = `${percentage.toFixed(1)}%`;
  document.getElementById("dashboardGoalsBar").style.width = `${Math.min(percentage, 100)}%`;
  document.getElementById("dashboardGoalsSaved").textContent = window.formatCurrency(totalSaved);
  document.getElementById("dashboardGoalsTarget").textContent = window.formatCurrency(totalTarget);

  loading.classList.add("d-none");
  content.classList.remove("d-none");
}

//End of financial goals widget code

// Shows a temporary alert message at the top of the dashboard.
function showDashboardAlert(message, type = "danger") {
  const alertBox = document.getElementById("dashboardAlert");
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  window.autoHideAlert(alertBox);
}

// Same color-coding rule used everywhere else in the app:
// < 70% spent -> green, 70-90% -> yellow, > 90% or negative -> red.
function getBalanceColorClass(income, totalExpenses) {
  const percentSpent = income > 0 ? (totalExpenses / income) * 100 : totalExpenses > 0 ? 100 : 0;
  const balance = income - totalExpenses;

  if (balance < 0 || percentSpent > 90) return "bg-danger";
  if (percentSpent >= 70) return "bg-warning";
  return "bg-success";
}

// Reads a CSS custom property from the current theme (e.g. "--color-blue").
function getThemeColor(variableName, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
  return value || fallback;
}

// Returns the color at `alpha` opacity. Accepts "#rgb", "#rrggbb" or "#rrggbbaa".
function withAlpha(hexColor, alpha) {
  let hex = String(hexColor).replace("#", "");
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  if (!/^[0-9a-f]{6,8}$/i.test(hex)) return hexColor;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Soft palette built from the app's own theme colors (teal accent,
// green, gray) at stepped opacities, so stacked bars and pies sit
// comfortably on the card surface instead of clashing with it.
function getThemePalette() {
  const blue = getThemeColor("--color-blue", "#00b7c2");
  const green = getThemeColor("--color-green", "#a7d82e");
  const gray = getThemeColor("--color-gray", "#8e8e93");
  return [
    withAlpha(blue, 0.85),
    withAlpha(green, 0.7),
    withAlpha(gray, 0.75),
    withAlpha(blue, 0.5),
    withAlpha(green, 0.4),
    withAlpha(gray, 0.45),
    withAlpha(blue, 0.3),
    withAlpha(green, 0.25),
  ];
}

// Splits a month's money out into whole-number percentages that always
// add up to 100. Returns null when nothing went out that month.
function getOutflowSplit(spendingTotal, savingTotal) {
  const totalOut = spendingTotal + savingTotal;
  if (totalOut <= 0) return null;
  const savingPercent = Math.round((savingTotal / totalOut) * 100);
  return { expensePercent: 100 - savingPercent, savingPercent };
}

// Builds one tile <div> for a month's summary, with a pie chart canvas
// for the expense vs. savings split of that month's money out.
function buildMonthTile(monthInfo, income, spendingTotal, savingTotal) {
  const totalExpenses = spendingTotal + savingTotal;
  const balance = income - totalExpenses;
  const colorClass = getBalanceColorClass(income, totalExpenses);
  const split = getOutflowSplit(spendingTotal, savingTotal);
  const canvasId = `monthPie-${monthInfo.key}`;

  const col = document.createElement("div");
  col.className = "col-12 col-sm-6 col-lg-4 col-xl-3";

  const chartMarkup = split
    ? `<div class="dashboard-month-pie">
         <canvas id="${canvasId}" role="img"
           aria-label="${monthInfo.label}: expenses ${split.expensePercent}%, savings ${split.savingPercent}% of money out"></canvas>
       </div>
       <div class="dashboard-month-legend small">
         <span><span class="dashboard-legend-swatch dashboard-legend-expense" aria-hidden="true"></span>Expenses ${split.expensePercent}%</span>
         <span><span class="dashboard-legend-swatch dashboard-legend-saving" aria-hidden="true"></span>Savings ${split.savingPercent}%</span>
       </div>`
    : `<div class="dashboard-month-empty small text-muted">No expenses or savings this month.</div>`;

  col.innerHTML = `
    <div class="card h-100 shadow-sm dashboard-month-card">
      <div class="card-body p-3 text-center">
        <div class="small text-muted mb-1">${monthInfo.label}</div>
        <div class="small">In: ${window.formatCurrency(income)}</div>
        <div class="small mb-2">Out: ${window.formatCurrency(totalExpenses)}</div>
        ${chartMarkup}
        <div class="rounded p-1 small mt-2 ${colorClass} text-white">
          ${window.formatCurrency(balance)}
        </div>
      </div>
    </div>
  `;

  return { col, canvasId: split ? canvasId : null };
}

// Draws one month tile's pie: expense vs. savings share of money out.
function renderMonthPie(canvasId, spendingTotal, savingTotal) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;

  const expenseColor = withAlpha(getThemeColor("--color-gray", "#8e8e93"), 0.55);
  const savingColor = withAlpha(getThemeColor("--color-blue", "#00b7c2"), 0.85);
  const total = spendingTotal + savingTotal;

  new Chart(canvas, {
    type: "pie",
    data: {
      labels: ["Expenses", "Savings"],
      datasets: [
        {
          data: [spendingTotal, savingTotal],
          backgroundColor: [expenseColor, savingColor],
          borderColor: getThemeColor("--surface", "#2c2c2e"),
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) =>
              `${context.label}: ${window.formatCurrency(context.parsed)} (${Math.round((context.parsed / total) * 100)}%)`,
          },
        },
      },
    },
  });
}

// Splits expense rows into genuine spending and savings. Anything
// other than the literal 'saving' (incl. null/legacy rows) is spending,
// matching expenses.js's normalizeExpenseType().
function splitExpensesByType(expenses) {
  const spending = [];
  const saving = [];
  expenses.forEach((expense) => {
    if (expense.expense_type === "saving") saving.push(expense);
    else spending.push(expense);
  });
  return { spending, saving };
}

// Buckets expense rows by budget month and category name.
// Returns { totalsByMonth: { "YYYY-MM": { [category]: amount } }, categoryNames: sorted string[] }.
function buildCategoryTotalsByMonth(expenses) {
  const totalsByMonth = {};
  const categoryNamesSet = new Set();

  expenses.forEach((expense) => {
    const key = getMonthKey(new Date(`${expense.budget_month}T00:00:00`));
    const categoryName = expense.categories ? expense.categories.name : "Uncategorized";

    if (!totalsByMonth[key]) totalsByMonth[key] = {};
    totalsByMonth[key][categoryName] = (totalsByMonth[key][categoryName] || 0) + Number(expense.amount);
    categoryNamesSet.add(categoryName);
  });

  return { totalsByMonth, categoryNames: Array.from(categoryNamesSet).sort() };
}

// Running total of all categories across the month range, one value per month.
function buildCumulativeSeries(months, totalsByMonth) {
  let runningTotal = 0;
  return months.map((m) => {
    const monthTotals = totalsByMonth[m.key] || {};
    runningTotal += Object.values(monthTotals).reduce((sum, value) => sum + value, 0);
    return runningTotal;
  });
}

// Shows the empty-state message instead of the canvas when there's no data.
// Returns true when the chart should be drawn.
function toggleChartEmptyState(canvas, emptyMessageId, hasData) {
  const emptyMessage = document.getElementById(emptyMessageId);
  if (emptyMessage) emptyMessage.classList.toggle("d-none", hasData);
  canvas.classList.toggle("d-none", !hasData);
  return hasData;
}

// Renders the line chart: one line per category, x-axis = months.
function renderCategoryTrendChart(months, categoryTotalsByMonth, categoryNames) {
  const canvas = document.getElementById("categoryTrendChart");
  if (!canvas || typeof Chart === "undefined") return;
  if (!toggleChartEmptyState(canvas, "spendingChartEmpty", categoryNames.length > 0)) return;

  const labels = months.map((m) => m.label);

  const datasets = categoryNames.map((categoryName, index) => ({
    label: categoryName,
    data: months.map((m) => (categoryTotalsByMonth[m.key] || {})[categoryName] || 0),
    borderColor: CATEGORY_LINE_COLORS[index % CATEGORY_LINE_COLORS.length],
    backgroundColor: CATEGORY_LINE_COLORS[index % CATEGORY_LINE_COLORS.length],
    tension: 0.25,
    fill: false,
  }));

  new Chart(canvas, {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
        },
      },
    },
  });
}

// Renders the savings chart: monthly bars stacked by category, plus a
// cumulative "Total saved to date" line on its own right-hand axis.
function renderSavingsTrendChart(months, savingTotalsByMonth, categoryNames) {
  const canvas = document.getElementById("savingsTrendChart");
  if (!canvas || typeof Chart === "undefined") return;
  if (!toggleChartEmptyState(canvas, "savingsChartEmpty", categoryNames.length > 0)) return;

  const labels = months.map((m) => m.label);
  const palette = getThemePalette();
  const lineColor = getThemeColor("--text-muted", "#8e8e93");

  const barDatasets = categoryNames.map((categoryName, index) => ({
    type: "bar",
    label: categoryName,
    data: months.map((m) => (savingTotalsByMonth[m.key] || {})[categoryName] || 0),
    backgroundColor: palette[index % palette.length],
    borderRadius: 4,
    stack: "savings",
    yAxisID: "y",
    order: 2,
  }));

  const cumulativeDataset = {
    type: "line",
    label: "Total saved to date",
    data: buildCumulativeSeries(months, savingTotalsByMonth),
    borderColor: lineColor,
    backgroundColor: lineColor,
    borderDash: [6, 4],
    tension: 0.25,
    fill: false,
    yAxisID: "yCumulative",
    order: 1,
  };

  new Chart(canvas, {
    data: { labels, datasets: [...barDatasets, cumulativeDataset] },
    options: {
      responsive: true,
      interaction: { mode: "index", intersect: false },
      plugins: {
        tooltip: {
          callbacks: {
            label: (context) => `${context.dataset.label}: ${window.formatCurrency(context.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { stacked: true },
        y: {
          stacked: true,
          beginAtZero: true,
          title: { display: true, text: "Saved per month" },
        },
        yCumulative: {
          position: "right",
          beginAtZero: true,
          grid: { drawOnChartArea: false },
          title: { display: true, text: "Total saved" },
        },
      },
    },
  });
}

// Draws each tab's chart the first time that tab becomes visible, and
// keeps the URL hash (#spending / #savings / #summary) in sync for deep links.
const DASHBOARD_TAB_HASHES = {
  "spending-tab": "#spending",
  "savings-tab": "#savings",
  "summary-tab": "#summary",
};

function setupDashboardTabs(chartRenderers) {
  const rendered = {};
  const renderFor = (tabId) => {
    if (rendered[tabId] || !chartRenderers[tabId]) return;
    rendered[tabId] = true;
    chartRenderers[tabId]();
  };

  const tabButtons = document.querySelectorAll('#dashboardTabs [data-bs-toggle="tab"]');
  tabButtons.forEach((button) => {
    button.addEventListener("shown.bs.tab", () => {
      renderFor(button.id);
      const hash = DASHBOARD_TAB_HASHES[button.id];
      if (hash && window.location.hash !== hash) history.replaceState(null, "", hash);
    });
  });

  // Draw whichever tab is visible now (the user may have switched tabs
  // while data was still loading, before these listeners existed).
  const activeButton = document.querySelector("#dashboardTabs .nav-link.active");
  if (activeButton) renderFor(activeButton.id);
}

// Opens the tab named in the URL hash (#savings / #summary) as early as
// possible, before the data has loaded.
function openTabFromHash() {
  if (typeof bootstrap === "undefined") return;
  const tabId = Object.keys(DASHBOARD_TAB_HASHES).find(
    (id) => DASHBOARD_TAB_HASHES[id] === window.location.hash
  );
  if (!tabId || tabId === "spending-tab") return;
  const button = document.getElementById(tabId);
  if (button) bootstrap.Tab.getOrCreateInstance(button).show();
}

async function loadDashboard() {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) return;

  await window.getUserCurrency();

  try {
    const [incomes, expenses] = await Promise.all([
      fetchAllIncomes(user.id),
      fetchAllExpenses(user.id),
    ]);

    const now = new Date();

    // Figure out the earliest month we have any data for. If the
    // user has no data at all yet, just show the current month.
    const candidateDates = [];
    incomes.forEach((row) => candidateDates.push(new Date(`${row.month}T00:00:00`)));
    expenses.forEach((row) => candidateDates.push(new Date(`${row.budget_month}T00:00:00`)));

    const earliestDate =
      candidateDates.length > 0
        ? new Date(Math.min(...candidateDates.map((d) => d.getTime())))
        : now;

    const months = buildMonthRange(earliestDate, now);

    // Bucket incomes by month key (there's at most one row per month).
    const incomeByMonth = {};
    incomes.forEach((row) => {
      const key = getMonthKey(new Date(`${row.month}T00:00:00`));
      incomeByMonth[key] = Number(row.amount);
    });

    // Spending and savings are bucketed separately for the charts and
    // the summary tiles' pie charts.
    const { spending, saving } = splitExpensesByType(expenses);
    const spendingTotals = buildCategoryTotalsByMonth(spending);
    const savingTotals = buildCategoryTotalsByMonth(saving);
    const sumMonth = (totalsByMonth, key) =>
      Object.values(totalsByMonth[key] || {}).reduce((sum, value) => sum + value, 0);

    // Monthly Summary tab: tiles are built now (most recent month first);
    // their pies are drawn when the tab is first shown. Tile "Out" is
    // spending + savings, because savings always reduce Balance.
    const tileGrid = document.getElementById("monthTileGrid");
    tileGrid.innerHTML = "";
    const pendingPies = [];

    [...months].reverse().forEach((monthInfo) => {
      const income = incomeByMonth[monthInfo.key] || 0;
      const spendingTotal = sumMonth(spendingTotals.totalsByMonth, monthInfo.key);
      const savingTotal = sumMonth(savingTotals.totalsByMonth, monthInfo.key);
      const { col, canvasId } = buildMonthTile(monthInfo, income, spendingTotal, savingTotal);
      tileGrid.appendChild(col);
      if (canvasId) pendingPies.push(() => renderMonthPie(canvasId, spendingTotal, savingTotal));
    });

    setupDashboardTabs({
      "spending-tab": () =>
        renderCategoryTrendChart(months, spendingTotals.totalsByMonth, spendingTotals.categoryNames),
      "savings-tab": () =>
        renderSavingsTrendChart(months, savingTotals.totalsByMonth, savingTotals.categoryNames),
      "summary-tab": () => pendingPies.forEach((renderPie) => renderPie()),
    });
  } catch (err) {
    showDashboardAlert("Failed to load dashboard data.");
    console.error(err);
  }

  try {
    await loadFinancialGoalsWidget(user.id);
  } catch (err) {
    const loading = document.getElementById("dashboardGoalsLoading");
    if (loading) loading.textContent = "Financial goals could not be loaded.";
    console.error("Failed to load financial goals widget:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Only run on dashboard.html.
  if (!document.getElementById("categoryTrendChart")) return;

  openTabFromHash();
  loadDashboard();
});
