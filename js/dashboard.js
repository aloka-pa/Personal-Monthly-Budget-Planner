// ============================================================
// dashboard.js - full history dashboard: category spending line
// chart + a compact monthly summary tile grid.
// ============================================================
//
// Instead of only comparing this month vs last month, this fetches
// ALL of the user's incomes + expenses once, figures out the full
// month range (from their earliest recorded month through the
// current month), and builds:
//   1. A line chart with one line per category, showing that
//      category's total spend for every month in the range.
//   2. A grid of small tiles - one per month - each showing that
//      month's income/expenses/balance (color-coded same as the
//      main app page).
// ============================================================

// A palette of distinct colors to cycle through for each category
// line on the chart.
const CATEGORY_LINE_COLORS = [
  "#0d6efd", "#dc3545", "#198754", "#fd7e14", "#6f42c1",
  "#20c997", "#d63384", "#0dcaf0", "#ffc107", "#6c757d",
];

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
    .select("amount, expense_datetime, categories(name)")
    .eq("user_id", userId)
    .order("expense_datetime", { ascending: true });

  if (error) throw error;
  return data || [];
}

function showDashboardAlert(message, type = "danger") {
  const alertBox = document.getElementById("dashboardAlert");
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
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

// Builds one small tile <div> for a month's summary.
function buildMonthTile(monthInfo, income, totalExpenses) {
  const balance = income - totalExpenses;
  const colorClass = getBalanceColorClass(income, totalExpenses);

  const col = document.createElement("div");
  col.className = "col-6 col-sm-4 col-md-3 col-lg-2";

  col.innerHTML = `
    <div class="card h-100 shadow-sm">
      <div class="card-body p-2 text-center">
        <div class="small text-muted mb-1">${monthInfo.label}</div>
        <div class="small">In: LKR ${income.toFixed(2)}</div>
        <div class="small mb-1">Out: LKR ${totalExpenses.toFixed(2)}</div>
        <div class="rounded p-1 small ${colorClass} text-white">
          LKR ${balance.toFixed(2)}
        </div>
      </div>
    </div>
  `;

  return col;
}

// Renders the line chart: one line per category, x-axis = months.
function renderCategoryTrendChart(months, categoryTotalsByMonth, categoryNames) {
  const canvas = document.getElementById("categoryTrendChart");
  if (!canvas || typeof Chart === "undefined") return;

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

async function loadDashboard() {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) return;

  try {
    const [incomes, expenses] = await Promise.all([
      fetchAllIncomes(user.id),
      fetchAllExpenses(user.id),
    ]);

    const now = new Date();

    // Figure out the earliest month has any data for. If the
    // user has no data at all yet, just show the current month.
    const candidateDates = [];
    incomes.forEach((row) => candidateDates.push(new Date(`${row.month}T00:00:00`)));
    expenses.forEach((row) => candidateDates.push(new Date(row.expense_datetime)));

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

    // Bucket expenses by month key, both totals and per-category.
    const totalExpensesByMonth = {};
    const categoryTotalsByMonth = {};
    const categoryNamesSet = new Set();

    expenses.forEach((expense) => {
      const key = getMonthKey(new Date(expense.expense_datetime));
      const amount = Number(expense.amount);
      const categoryName = expense.categories ? expense.categories.name : "Uncategorized";

      totalExpensesByMonth[key] = (totalExpensesByMonth[key] || 0) + amount;

      if (!categoryTotalsByMonth[key]) categoryTotalsByMonth[key] = {};
      categoryTotalsByMonth[key][categoryName] =
        (categoryTotalsByMonth[key][categoryName] || 0) + amount;

      categoryNamesSet.add(categoryName);
    });

    const categoryNames = Array.from(categoryNamesSet).sort();

    renderCategoryTrendChart(months, categoryTotalsByMonth, categoryNames);

    const tileGrid = document.getElementById("monthTileGrid");
    tileGrid.innerHTML = "";

    // Render most recent month first so it's visible at a glance.
    [...months].reverse().forEach((monthInfo) => {
      const income = incomeByMonth[monthInfo.key] || 0;
      const totalExpenses = totalExpensesByMonth[monthInfo.key] || 0;
      tileGrid.appendChild(buildMonthTile(monthInfo, income, totalExpenses));
    });
  } catch (err) {
    showDashboardAlert("Failed to load dashboard data.");
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  // Only run on dashboard.html.
  if (!document.getElementById("categoryTrendChart")) return;

  loadDashboard();
});
