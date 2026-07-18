// ============================================================
// income.js - view/set/update the current month's income
// ============================================================
//
// `monthly_incomes.month` must always be the FIRST DAY of the
// month (e.g. 2026-07-01). We build that date string in JS from
// the current date, ignoring the day-of-month entirely.
//
// There's a unique constraint on (user_id, month), so instead of
// manually checking "does a row exist? insert vs update", use
// Supabase's `.upsert()` with `onConflict: 'user_id,month'`. This
// tells Postgres: insert a new row, but if one already exists for
// this user+month, update it instead.
// ============================================================

// Returns the current month as "YYYY-MM-01".
function getCurrentMonthFirstDay() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function showIncomeAlert(message, type = "danger") {
  const alertBox = document.getElementById("incomeAlert");
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
}

function hideIncomeAlert() {
  const alertBox = document.getElementById("incomeAlert");
  if (!alertBox) return;
  alertBox.classList.add("d-none");
}

// Fetches the current month's income row (if any) and pre-fills
// the amount input.
async function loadIncome() {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) return;

  const currentMonth = getCurrentMonthFirstDay();

  const { data, error } = await supabaseClient
    .from("monthly_incomes")
    .select("amount")
    .eq("user_id", user.id)
    .eq("month", currentMonth)
    .maybeSingle(); // returns null instead of an error when no row exists

  if (error) {
    console.error("Failed to load income:", error.message);
    return;
  }

  const amountInput = document.getElementById("incomeAmount");
  if (data) {
    amountInput.value = data.amount;
  }
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

    const currentMonth = getCurrentMonthFirstDay();

    const { error } = await supabaseClient
      .from("monthly_incomes")
      .upsert(
        {
          user_id: user.id,
          month: currentMonth,
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

  loadIncome();
  setupIncomeForm();
});
