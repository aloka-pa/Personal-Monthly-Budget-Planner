// Global, read-only spending streak utility for Wallet Check.
(function () {
  "use strict";

  const MAX_DAILY_LOOKBACK = 3660;
  const MAX_MONTHLY_LOOKBACK = 1200;

  function toLocalDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function toMonthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  }

  function monthKeyFromValue(value) {
    return String(value || "").slice(0, 7);
  }

  function daysInMonth(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    return new Date(year, month, 0).getDate();
  }

  function addToTotal(totals, key, amount) {
    totals[key] = (totals[key] || 0) + Number(amount || 0);
  }

  function calculateSpendingStreaks({ categories, budgets, expenses, today = new Date() }) {
    const includedCategoryIds = new Set(
      categories
        .filter((category) => category.include_in_budget !== false)
        .map((category) => String(category.id))
    );

    const budgetByMonth = {};
    budgets.forEach((budget) => {
      if (!includedCategoryIds.has(String(budget.category_id))) return;
      addToTotal(budgetByMonth, monthKeyFromValue(budget.month), budget.amount);
    });

    const spendingByDay = {};
    const spendingByMonth = {};
    expenses.forEach((expense) => {
      if (!includedCategoryIds.has(String(expense.category_id))) return;
      if (expense.expense_type === "saving") return;
      const expenseDate = new Date(expense.expense_datetime);
      if (!Number.isNaN(expenseDate.getTime())) {
        addToTotal(spendingByDay, toLocalDateKey(expenseDate), expense.amount);
      }
      const budgetMonth = monthKeyFromValue(expense.budget_month) || toMonthKey(expenseDate);
      addToTotal(spendingByMonth, budgetMonth, expense.amount);
    });

    const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const yesterday = new Date(localToday);
    yesterday.setDate(yesterday.getDate() - 1);

    let dailyStreak = 0;
    const dayCursor = new Date(yesterday);
    for (let checked = 0; checked < MAX_DAILY_LOOKBACK; checked += 1) {
      const dayKey = toLocalDateKey(dayCursor);
      const monthKey = toMonthKey(dayCursor);
      const monthlyBudget = budgetByMonth[monthKey] || 0;
      if (monthlyBudget <= 0) break;

      const dailyTarget = monthlyBudget / daysInMonth(monthKey);
      if ((spendingByDay[dayKey] || 0) > dailyTarget) break;

      dailyStreak += 1;
      dayCursor.setDate(dayCursor.getDate() - 1);
    }

    let monthlyStreak = 0;
    const monthCursor = new Date(localToday.getFullYear(), localToday.getMonth() - 1, 1);
    for (let checked = 0; checked < MAX_MONTHLY_LOOKBACK; checked += 1) {
      const monthKey = toMonthKey(monthCursor);
      const monthlyBudget = budgetByMonth[monthKey] || 0;
      if (monthlyBudget <= 0 || (spendingByMonth[monthKey] || 0) > monthlyBudget) break;

      monthlyStreak += 1;
      monthCursor.setMonth(monthCursor.getMonth() - 1);
    }

    const todayKey = toLocalDateKey(localToday);
    const currentMonthKey = toMonthKey(localToday);
    const currentMonthlyBudget = budgetByMonth[currentMonthKey] || 0;
    const todayTarget = currentMonthlyBudget > 0
      ? currentMonthlyBudget / daysInMonth(currentMonthKey)
      : null;
    const todaySpent = spendingByDay[todayKey] || 0;

    return {
      dailyStreak,
      monthlyStreak,
      todaySpent,
      todayTarget,
      todayOnTrack: todayTarget === null ? null : todaySpent <= todayTarget,
    };
  }

  async function fetchBudgetRows(userId) {
    const primary = await supabaseClient
      .from("category_budgets")
      .select("category_id, month, amount")
      .eq("user_id", userId)
      .order("month", { ascending: true });

    if (!primary.error) return primary.data || [];

    const fallback = await supabaseClient
      .from("category_budgets")
      .select("category_id, month, budget_amount")
      .eq("user_id", userId)
      .order("month", { ascending: true });

    if (fallback.error) throw fallback.error;
    return (fallback.data || []).map((row) => ({ ...row, amount: row.budget_amount }));
  }

  async function fetchStreakData(userId) {
    const [categoriesResult, expensesResult, budgets] = await Promise.all([
      supabaseClient
        .from("categories")
        .select("id, include_in_budget")
        .or(`user_id.is.null,user_id.eq.${userId}`),
      supabaseClient
        .from("expenses")
        .select("category_id, amount, expense_datetime, budget_month, expense_type")
        .eq("user_id", userId),
      fetchBudgetRows(userId),
    ]);

    if (categoriesResult.error) throw categoriesResult.error;
    if (expensesResult.error) throw expensesResult.error;

    return {
      categories: categoriesResult.data || [],
      expenses: expensesResult.data || [],
      budgets,
    };
  }

  function streakMarkup() {
    return `
      <div class="streak-layer" id="spendingStreakLayer" hidden>
        <div class="streak-backdrop" data-streak-close aria-hidden="true"></div>
        <section class="streak-panel" id="spendingStreakPanel" role="dialog" aria-modal="true" aria-labelledby="spendingStreakTitle" tabindex="-1">
          <div class="streak-heading">
            <div class="streak-title-wrap">
              <span class="streak-title-icon" aria-hidden="true"><i class="bi bi-trophy"></i></span>
              <div><h2 id="spendingStreakTitle">Spending Streaks</h2><p>Keep your spending momentum going.</p></div>
            </div>
            <button class="streak-close" type="button" data-streak-close aria-label="Close spending streaks" title="Close"><i class="bi bi-x-lg"></i></button>
          </div>

          <div class="streak-loading" data-streak-loading>
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            <span>Calculating your streaks...</span>
          </div>

          <div class="streak-error" data-streak-error hidden>
            <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
            <p>We couldn't load your spending streaks.</p>
            <button type="button" class="btn btn-sm btn-outline-primary" data-streak-retry>Try again</button>
          </div>

          <div data-streak-content hidden>
            <div class="streak-stats">
              <article class="streak-stat streak-stat--daily">
                <span class="streak-stat-icon" aria-hidden="true"><i class="bi bi-fire"></i></span>
                <strong data-daily-streak>0 days</strong>
                <span data-daily-copy>within your daily spending target</span>
              </article>
              <article class="streak-stat streak-stat--monthly">
                <span class="streak-stat-icon" aria-hidden="true"><i class="bi bi-check-circle"></i></span>
                <strong data-monthly-streak>0 months</strong>
                <span>consecutively under budget</span>
              </article>
            </div>

            <div class="streak-today" data-today-progress>
              <div class="streak-today-heading"><span>Today</span><strong data-today-status>On track</strong></div>
              <div class="streak-today-values"><span data-today-spent></span><span data-today-target></span></div>
              <div class="progress streak-progress" role="progressbar" aria-label="Today's spending target progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
                <div class="progress-bar" data-today-bar></div>
              </div>
            </div>

            <div class="streak-no-budget" data-streak-no-budget hidden>
              <i class="bi bi-wallet2" aria-hidden="true"></i>
              <div><strong>No budget for this month</strong><span>Set category budgets to start tracking a daily streak.</span></div>
            </div>
            <p class="streak-note">Daily streaks use your monthly budget divided across the days in each month. Today remains live and joins the streak after the day is complete.</p>
          </div>
        </section>
      </div>`;
  }

  function setupSpendingStreaks() {
    const calculatorTrigger = document.getElementById("walletCalculatorToggle");
    const headerActions = document.querySelector(".top-header .app-shell");
    if (!calculatorTrigger || !headerActions || document.getElementById("spendingStreakToggle")) return;

    const trigger = document.createElement("button");
    trigger.className = "header-action header-utility-action streak-trigger";
    trigger.id = "spendingStreakToggle";
    trigger.type = "button";
    trigger.title = "Open spending streaks";
    trigger.setAttribute("aria-label", "Open spending streaks");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "spendingStreakPanel");
    trigger.innerHTML = '<i class="bi bi-trophy" aria-hidden="true"></i>';
    headerActions.insertBefore(trigger, calculatorTrigger);

    document.body.insertAdjacentHTML("beforeend", streakMarkup());
    const layer = document.getElementById("spendingStreakLayer");
    const panel = document.getElementById("spendingStreakPanel");
    const loading = layer.querySelector("[data-streak-loading]");
    const content = layer.querySelector("[data-streak-content]");
    const errorState = layer.querySelector("[data-streak-error]");
    let previouslyFocused = null;
    let loadSequence = 0;

    function showState(state) {
      loading.hidden = state !== "loading";
      content.hidden = state !== "content";
      errorState.hidden = state !== "error";
    }

    function render(result) {
      layer.querySelector("[data-daily-streak]").textContent =
        `${result.dailyStreak} ${result.dailyStreak === 1 ? "day" : "days"}`;
      layer.querySelector("[data-monthly-streak]").textContent =
        `${result.monthlyStreak} ${result.monthlyStreak === 1 ? "month" : "months"}`;

      const todayProgress = layer.querySelector("[data-today-progress]");
      const noBudget = layer.querySelector("[data-streak-no-budget]");
      const todayBar = layer.querySelector("[data-today-bar]");

      if (result.todayTarget === null) {
        todayProgress.hidden = true;
        noBudget.hidden = false;
      } else {
        todayProgress.hidden = false;
        noBudget.hidden = true;
        const percentage = (result.todaySpent / result.todayTarget) * 100;
        const status = layer.querySelector("[data-today-status]");
        status.textContent = result.todayOnTrack ? "On track" : "Over target";
        status.classList.toggle("is-over", !result.todayOnTrack);
        layer.querySelector("[data-today-spent]").textContent =
          `${window.formatCurrency(result.todaySpent)} spent`;
        layer.querySelector("[data-today-target]").textContent =
          `${window.formatCurrency(result.todayTarget)} target`;
        todayBar.style.width = `${Math.min(percentage, 100)}%`;
        todayBar.classList.toggle("is-over", !result.todayOnTrack);
        todayBar.closest("[role='progressbar']").setAttribute(
          "aria-valuenow",
          String(Math.round(Math.min(percentage, 100)))
        );
      }
      showState("content");
    }

    async function loadStreaks() {
      const currentLoad = ++loadSequence;
      showState("loading");
      try {
        const {
          data: { user },
        } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("No authenticated user");

        await window.getUserCurrency();
        const data = await fetchStreakData(user.id);
        if (currentLoad !== loadSequence || layer.hidden) return;
        render(calculateSpendingStreaks(data));
      } catch (error) {
        console.error("Failed to load spending streaks:", error.message);
        if (currentLoad === loadSequence && !layer.hidden) showState("error");
      }
    }

    function openStreaks() {
      previouslyFocused = document.activeElement;
      layer.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => {
        layer.classList.add("is-open");
        panel.focus();
      });
      loadStreaks();
    }

    function closeStreaks() {
      if (layer.hidden) return;
      loadSequence += 1;
      layer.classList.remove("is-open");
      layer.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      (previouslyFocused || trigger).focus();
    }

    trigger.addEventListener("click", () => (layer.hidden ? openStreaks() : closeStreaks()));
    layer.addEventListener("click", (event) => {
      if (event.target.closest("[data-streak-close]")) closeStreaks();
      if (event.target.closest("[data-streak-retry]")) loadStreaks();
    });

    document.addEventListener("keydown", (event) => {
      if (layer.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        return closeStreaks();
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(panel.querySelectorAll("button:not([disabled]):not([hidden])"));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  window.WalletCheckSpendingStreaks = { calculateSpendingStreaks };
  document.addEventListener("DOMContentLoaded", setupSpendingStreaks);
})();
