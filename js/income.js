// ============================================================
// income.js - view/set/update the current month's income
// ============================================================
//
// `monthly_incomes.month` must always be the FIRST DAY of the
// month (e.g. 2026-07-01). We build that date string in JS from
// the current date, ignoring the day-of-month entirely.
//
// There's a unique constraint on (user_id, month), so instead of
// manually checking "does a row exist? insert vs update", we use
// Supabase's `.upsert()` with `onConflict: 'user_id,month'`. This
// tells Postgres: insert a new row, but if one already exists for
// this user+month, update it instead. It's the same insert-or-
// update behavior the spec describes, just done as one atomic
// database call instead of two separate ones.
// ============================================================

// Returns the current REAL calendar month (based on today's actual
// date) as "YYYY-MM-01". Used as the upper bound for navigation -
// you can't view/set income for a month that hasn't started yet.
function getCurrentMonthFirstDay() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

// ------------------------------------------------------------
// MONTH NAVIGATION (shared with expenses.js)
// ------------------------------------------------------------
// `viewedMonthDate` is the month currently shown on screen for
// both the Income card and the Expense list/balance. It starts
// on today's real month and can be moved backward/forward with
// the Prev/Next buttons, but never forward past today's real
// month - that's what answers "when can I enter August's income"
// - the app always follows your device's actual date, so August
// unlocks automatically the moment the calendar flips to August 1.
// ------------------------------------------------------------
let viewedMonthDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

// Exposed on `window` so expenses.js (loaded after this file) can
// use the same viewed month for the expense list + balance.
window.getViewedMonthFirstDay = function getViewedMonthFirstDay() {
  const year = viewedMonthDate.getFullYear();
  const month = String(viewedMonthDate.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
};

window.getViewedMonthRange = function getViewedMonthRange() {
  const start = new Date(viewedMonthDate.getFullYear(), viewedMonthDate.getMonth(), 1);
  const end = new Date(viewedMonthDate.getFullYear(), viewedMonthDate.getMonth() + 1, 1);
  return { start, end };
};

function isViewingRealCurrentMonth() {
  const now = new Date();
  return (
    viewedMonthDate.getFullYear() === now.getFullYear() &&
    viewedMonthDate.getMonth() === now.getMonth()
  );
}

// Updates the on-screen month label + card titles, and enables/
// disables the Next button (can't go past today's real month).
function renderMonthNavigator() {
  const label = viewedMonthDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const labelEl = document.getElementById("viewedMonthLabel");
  if (labelEl) labelEl.textContent = label;

  const incomeTitleEl = document.getElementById("incomeCardTitle");
  if (incomeTitleEl) incomeTitleEl.textContent = `Income - ${label}`;

  const expenseTitleEl = document.getElementById("expenseListTitle");
  if (expenseTitleEl) expenseTitleEl.textContent = `Expenses - ${label}`;

  const nextBtn = document.getElementById("nextMonthBtn");
  if (nextBtn) nextBtn.disabled = isViewingRealCurrentMonth();
}

// Wires up the Prev/Next buttons. Moving months reloads both the
// income section and the expense list (which also refreshes the
// balance tiles).
function setupMonthNavigator() {
  const prevBtn = document.getElementById("prevMonthBtn");
  const nextBtn = document.getElementById("nextMonthBtn");
  if (!prevBtn || !nextBtn) return;

  renderMonthNavigator();

  prevBtn.addEventListener("click", async () => {
    viewedMonthDate = new Date(viewedMonthDate.getFullYear(), viewedMonthDate.getMonth() - 1, 1);
    renderMonthNavigator();
    await loadIncome();
    if (window.loadExpenses) await window.loadExpenses();
  });

  nextBtn.addEventListener("click", async () => {
    if (isViewingRealCurrentMonth()) return; // guard, button is disabled anyway
    viewedMonthDate = new Date(viewedMonthDate.getFullYear(), viewedMonthDate.getMonth() + 1, 1);
    renderMonthNavigator();
    await loadIncome();
    if (window.loadExpenses) await window.loadExpenses();
  });
}

function showIncomeAlert(message, type = "danger") {
  const alertBox = document.getElementById("incomeAlert");
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  window.autoHideAlert(alertBox);
}

function hideIncomeAlert() {
  const alertBox = document.getElementById("incomeAlert");
  if (!alertBox) return;
  alertBox.classList.add("d-none");
}

// Fetches the viewed month's income row (if any) and pre-fills
// the amount input.
async function loadIncome() {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) return;

  const viewedMonth = window.getViewedMonthFirstDay();

  const { data, error } = await supabaseClient
    .from("monthly_incomes")
    .select("amount")
    .eq("user_id", user.id)
    .eq("month", viewedMonth)
    .maybeSingle(); // returns null instead of an error when no row exists

  if (error) {
    console.error("Failed to load income:", error.message);
    return;
  }

  const amountInput = document.getElementById("incomeAmount");
  amountInput.value = data ? data.amount : "";
}

// Wires up the income form submission.
function setupIncomeForm() {
  const form = document.getElementById("incomeForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideIncomeAlert();

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) return;

    const amount = parseFloat(document.getElementById("incomeAmount").value);
    if (isNaN(amount) || amount < 0) {
      showIncomeAlert("Please enter a valid, non-negative amount.");
      return;
    }

    const viewedMonth = window.getViewedMonthFirstDay();

    const { error } = await supabaseClient
      .from("monthly_incomes")
      .upsert(
        {
          user_id: user.id,
          month: viewedMonth,
          amount,
        },
        { onConflict: "user_id,month" }
      );

    if (error) {
      showIncomeAlert(error.message);
      return;
    }

    showIncomeAlert("Income saved!", "success");
    if (window.refreshBalance) await window.refreshBalance();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // Only run on app.html, where the income form exists.
  if (!document.getElementById("incomeForm")) return;

  setupMonthNavigator();
  loadIncome();
  setupIncomeForm();
});
