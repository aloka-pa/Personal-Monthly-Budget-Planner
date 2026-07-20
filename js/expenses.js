// ============================================================
// expenses.js - categories loading, add/edit/delete expenses
// Stage 5: load categories (predefined + custom) and add expenses.
// Stage 6: expense list for the current month + edit/delete.
// ============================================================
//
// CATEGORIES: a category with `user_id = null` is a shared,
// predefined category (Food, Bills, etc.) visible to everyone.
// A category with `user_id` set to the logged-in user's id is a
// custom category only they can see. We fetch both with an
// `.or()` filter and merge them into one dropdown.
// ============================================================

// In-memory cache of the currently-loaded month's expenses,
// keyed by id, so the edit modal can be pre-filled instantly
// without an extra round trip to Supabase.
const expenseCache = new Map();

// Loads predefined + the user's custom categories into the given
// <select> element (used for both the add-expense form and the
// edit-expense modal), optionally selecting a given category id
// afterwards.
async function loadCategories(selectElementId = "expenseCategory", selectCategoryId = null) {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { data, error } = await supabaseClient
    .from("categories")
    .select("id, name, user_id")
    .or(`user_id.is.null,user_id.eq.${user.id}`)
    .order("name", { ascending: true });

  if (error) {
    console.error("Failed to load categories:", error.message);
    return;
  }

  const select = document.getElementById(selectElementId);
  if (!select) return;
  select.innerHTML = "";

  data.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    select.appendChild(option);
  });

  if (selectCategoryId) {
    select.value = selectCategoryId;
  }
}

function showExpenseAlert(message, type = "danger") {
  const alertBox = document.getElementById("expenseAlert");
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  window.autoHideAlert(alertBox);
}

function hideExpenseAlert() {
  const alertBox = document.getElementById("expenseAlert");
  if (!alertBox) return;
  alertBox.classList.add("d-none");
}

// Wires up the inline "add custom category" button.
function setupAddCategory() {
  const addBtn = document.getElementById("addCategoryBtn");
  if (!addBtn) return;

  addBtn.addEventListener("click", async () => {
    hideExpenseAlert();

    const input = document.getElementById("newCategoryName");
    const name = input.value.trim();
    if (!name) {
      showExpenseAlert("Enter a name for the new category.");
      return;
    }

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { data, error } = await supabaseClient
      .from("categories")
      .insert({ user_id: user.id, name })
      .select("id")
      .single();

    if (error) {
      showExpenseAlert(error.message);
      return;
    }

    input.value = "";
    await loadCategories("expenseCategory", data.id);
  });
}

// Prefills the datetime-local input with the current date/time,
// formatted as required by the input ("YYYY-MM-DDTHH:mm").
function setDefaultExpenseDatetime() {
  const input = document.getElementById("expenseDatetime");
  if (!input) return;

  const now = new Date();
  // Adjust for the local timezone offset so toISOString() gives
  // local time instead of UTC, then trim to minutes.
  const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  input.value = localTime.toISOString().slice(0, 16);
}

// Wires up the add expense form submission.
function setupExpenseForm() {
  const form = document.getElementById("expenseForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideExpenseAlert();

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) return;

    const amount = parseFloat(document.getElementById("expenseAmount").value);
    const categoryId = document.getElementById("expenseCategory").value;
    const datetimeValue = document.getElementById("expenseDatetime").value;
    const description = document.getElementById("expenseDescription").value.trim();
    const isRecurring = document.getElementById("expenseRecurring").checked;

    if (isNaN(amount) || amount <= 0) {
      showExpenseAlert("Amount must be greater than 0.");
      return;
    }
    if (!categoryId) {
      showExpenseAlert("Please choose a category.");
      return;
    }
    if (!datetimeValue) {
      showExpenseAlert("Please choose a date and time.");
      return;
    }

    const { error } = await supabaseClient.from("expenses").insert({
      user_id: user.id,
      category_id: categoryId,
      amount,
      expense_datetime: new Date(datetimeValue).toISOString(),
      budget_month: window.getViewedMonthFirstDay(),
      description: description || null,
      is_recurring: isRecurring,
    });

    if (error) {
      showExpenseAlert(error.message);
      return;
    }

    showExpenseAlert("Expense added!", "success");
    form.reset();
    setDefaultExpenseDatetime();
    await loadExpenses();
  });
}

// ============================================================
// EXPENSE LIST (Stage 6)
// ============================================================
// Uses the shared "viewed month" state (window.getViewedMonthRange,
// set up in income.js's month navigator) so Prev/Next can browse
// any month's expenses, not just the real current month.
// ============================================================

function showExpenseListAlert(message, type = "danger") {
  const alertBox = document.getElementById("expenseListAlert");
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  window.autoHideAlert(alertBox);
}

// Builds one <tr> for an expense row.
function buildExpenseRow(expense) {
  const tr = document.createElement("tr");

  const dateCell = document.createElement("td");
  dateCell.textContent = new Date(expense.expense_datetime).toLocaleString();

  const categoryCell = document.createElement("td");
  categoryCell.textContent = expense.categories ? expense.categories.name : "-";

  const amountCell = document.createElement("td");
  amountCell.textContent = Number(expense.amount).toFixed(2);

  const descriptionCell = document.createElement("td");
  descriptionCell.textContent = expense.description || "-";

  const recurringCell = document.createElement("td");
  if (expense.is_recurring) {
    const badge = document.createElement("span");
    badge.className = "badge bg-info text-dark";
    badge.textContent = "Recurring";
    recurringCell.appendChild(badge);
  }

  const actionsCell = document.createElement("td");
  actionsCell.className = "text-end";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn-sm btn-outline-secondary me-2";
  editBtn.textContent = "Edit";
  editBtn.addEventListener("click", () => openEditExpenseModal(expense.id));

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn-sm btn-outline-danger";
  deleteBtn.textContent = "Delete";
  deleteBtn.addEventListener("click", () => deleteExpense(expense.id));

  actionsCell.appendChild(editBtn);
  actionsCell.appendChild(deleteBtn);

  tr.appendChild(dateCell);
  tr.appendChild(categoryCell);
  tr.appendChild(amountCell);
  tr.appendChild(descriptionCell);
  tr.appendChild(recurringCell);
  tr.appendChild(actionsCell);

  return tr;
}

// Fetches the viewed month's expenses for the logged-in user
// (joining the category name) and renders them into the table.
// Exposed on `window` so income.js's month navigator can trigger
// a reload when Prev/Next is clicked.
window.loadExpenses = async function loadExpenses() {
  const tbody = document.getElementById("expenseListBody");
  if (!tbody) return;

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) return;

  const viewedMonth = window.getViewedMonthFirstDay();

  const { data, error } = await supabaseClient
    .from("expenses")
    .select("id, amount, expense_datetime, description, is_recurring, category_id, categories(name)")
    .eq("user_id", user.id)
    .eq("budget_month", viewedMonth)
    .order("expense_datetime", { ascending: false });

  if (error) {
    showExpenseListAlert(error.message);
    return;
  }

  expenseCache.clear();
  data.forEach((expense) => expenseCache.set(expense.id, expense));

  tbody.innerHTML = "";

  if (data.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML =
      '<td colspan="6" class="text-center text-muted">No expenses recorded this month yet.</td>';
    tbody.appendChild(emptyRow);
    await window.refreshBalance();
    return;
  }

  data.forEach((expense) => tbody.appendChild(buildExpenseRow(expense)));
  await window.refreshBalance();
}

// ============================================================
// CURRENT BALANCE (Stage 7)
// ============================================================
//
// Balance = this month's income (from monthly_incomes) minus the
// sum of this month's expenses (already cached in `expenseCache`
// by loadExpenses(), so we don't need a second query for that
// part - just re-sum whatever is currently cached).
//
// Color coding is based on the % of income already spent:
//   < 70%            -> bg-success (green)
//   70% - 90%         -> bg-warning (yellow)
//   > 90% or negative -> bg-danger  (red)
// ============================================================

// Exposed on `window` so income.js can trigger a recalculation
// after the user saves/updates their income for the month.
window.refreshBalance = async function refreshBalance() {
  const balanceCard = document.getElementById("balanceCard");
  if (!balanceCard) return;

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) return;

  const viewedMonth = window.getViewedMonthFirstDay();

  const { data: incomeRow, error: incomeError } = await supabaseClient
    .from("monthly_incomes")
    .select("amount")
    .eq("user_id", user.id)
    .eq("month", viewedMonth)
    .maybeSingle();

  if (incomeError) {
    console.error("Failed to load income for balance:", incomeError.message);
    return;
  }

  const income = incomeRow ? Number(incomeRow.amount) : 0;
  const totalExpenses = Array.from(expenseCache.values()).reduce(
    (sum, expense) => sum + Number(expense.amount),
    0
  );
  const balance = income - totalExpenses;
  const percentSpent = income > 0 ? (totalExpenses / income) * 100 : totalExpenses > 0 ? 100 : 0;

  document.getElementById("incomeTileAmount").textContent = `LKR ${income.toFixed(2)}`;
  document.getElementById("spentTileAmount").textContent = `LKR ${totalExpenses.toFixed(2)}`;
  document.getElementById("balanceAmount").textContent = `LKR ${balance.toFixed(2)}`;

  balanceCard.classList.remove("bg-success", "bg-warning", "bg-danger", "text-white");

  let colorClass;
  if (balance < 0 || percentSpent > 90) {
    colorClass = "bg-danger";
  } else if (percentSpent >= 70) {
    colorClass = "bg-warning";
  } else {
    colorClass = "bg-success";
  }

  balanceCard.classList.add(colorClass, "text-white");
};

// Formats a Date as "YYYY-MM-DDTHH:mm" for a datetime-local input.
function toDatetimeLocalValue(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function showEditExpenseAlert(message, type = "danger") {
  const alertBox = document.getElementById("editExpenseAlert");
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  window.autoHideAlert(alertBox);
}

function hideEditExpenseAlert() {
  const alertBox = document.getElementById("editExpenseAlert");
  if (!alertBox) return;
  alertBox.classList.add("d-none");
}

// Opens the edit modal pre-filled with the given expense's data.
async function openEditExpenseModal(expenseId) {
  const expense = expenseCache.get(expenseId);
  if (!expense) return;

  hideEditExpenseAlert();

  document.getElementById("editExpenseId").value = expense.id;
  document.getElementById("editExpenseAmount").value = expense.amount;
  document.getElementById("editExpenseDatetime").value = toDatetimeLocalValue(
    new Date(expense.expense_datetime)
  );
  document.getElementById("editExpenseDescription").value = expense.description || "";
  document.getElementById("editExpenseRecurring").checked = expense.is_recurring;

  await loadCategories("editExpenseCategory", expense.category_id);

  const modal = new bootstrap.Modal(document.getElementById("editExpenseModal"));
  modal.show();
}

// Wires up the edit expense form submission.
function setupEditExpenseForm() {
  const form = document.getElementById("editExpenseForm");
  if (!form) return;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideEditExpenseAlert();

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) return;

    const id = document.getElementById("editExpenseId").value;
    const amount = parseFloat(document.getElementById("editExpenseAmount").value);
    const categoryId = document.getElementById("editExpenseCategory").value;
    const datetimeValue = document.getElementById("editExpenseDatetime").value;
    const description = document.getElementById("editExpenseDescription").value.trim();
    const isRecurring = document.getElementById("editExpenseRecurring").checked;

    if (isNaN(amount) || amount <= 0) {
      showEditExpenseAlert("Amount must be greater than 0.");
      return;
    }

    const { error } = await supabaseClient
      .from("expenses")
      .update({
        category_id: categoryId,
        amount,
        expense_datetime: new Date(datetimeValue).toISOString(),
        description: description || null,
        is_recurring: isRecurring,
      })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      showEditExpenseAlert(error.message);
      return;
    }

    const modalEl = document.getElementById("editExpenseModal");
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();

    await loadExpenses();
  });
}

// Deletes an expense after a confirmation prompt.
async function deleteExpense(expenseId) {
  const confirmed = window.confirm("Delete this expense? This cannot be undone.");
  if (!confirmed) return;

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) return;

  const { error } = await supabaseClient
    .from("expenses")
    .delete()
    .eq("id", expenseId)
    .eq("user_id", user.id);

  if (error) {
    showExpenseListAlert(error.message);
    return;
  }

  await loadExpenses();
}

document.addEventListener("DOMContentLoaded", () => {
  // Only run on app.html, where the expense form exists.
  if (!document.getElementById("expenseForm")) return;

  loadCategories("expenseCategory");
  setupAddCategory();
  setupExpenseForm();
  setDefaultExpenseDatetime();

  loadExpenses();
  setupEditExpenseForm();
});
