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

// Sum of this month's category budgets (see fetchMonthlyBudgetTotal),
// used by the Calendar View to color each day by % of budget spent.
let viewedMonthlyBudgetTotal = 0;

// expenseCache grouped by local "YYYY-MM-DD", rebuilt each time
// loadExpenses() runs (see renderExpenseCalendar). Shared by the
// calendar grid and the day-details modal so neither recomputes it.
let expensesByDayCache = new Map();

const EXPENSE_PAYMENT_METHODS = new Set([
  "Cash",
  "Debit Card",
  "Credit Card",
  "Bank Transfer",
  "Koko",
  "MintPay",
  "Other",
]);

function isValidPaymentMethod(paymentMethod) {
  return EXPENSE_PAYMENT_METHODS.has(paymentMethod);
}

// Appends a disabled, selected placeholder option to a <select>,
// e.g. "Select a category" or "Select a payment method". Since the
// field is `required`, the placeholder's empty value can never be
// submitted - the user has to pick a real option.
function addSelectPlaceholder(select, placeholderText) {
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.disabled = true;
  placeholder.selected = true;
  placeholder.textContent = placeholderText;
  select.appendChild(placeholder);
}

// Populates the payment method <select> with the fixed set of
// supported methods, replacing the "Loading payment methods..."
// text shown while the page was first rendering.
function loadPaymentMethods(selectElementId = "expensePaymentMethod") {
  const select = document.getElementById(selectElementId);
  if (!select) return;
  select.innerHTML = "";

  addSelectPlaceholder(select, "Select a payment method");

  EXPENSE_PAYMENT_METHODS.forEach((method) => {
    const option = document.createElement("option");
    option.value = method;
    option.textContent = method;
    select.appendChild(option);
  });
}

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

  addSelectPlaceholder(select, "Select a category");

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

    const includeInBudgetCheckbox = document.getElementById("newCategoryIncludeInBudget");
    const includeInBudget = includeInBudgetCheckbox ? includeInBudgetCheckbox.checked : true;

    const {
      data: { user },
    } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { data, error } = await supabaseClient
      .from("categories")
      .insert({ user_id: user.id, name, include_in_budget: includeInBudget })
      .select("id")
      .single();

    if (error) {
      showExpenseAlert(error.message);
      return;
    }

    input.value = "";
    if (includeInBudgetCheckbox) includeInBudgetCheckbox.checked = true;
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
    const paymentMethod = document.getElementById("expensePaymentMethod").value;
    const categoryId = document.getElementById("expenseCategory").value;
    const datetimeValue = document.getElementById("expenseDatetime").value;
    const description = document.getElementById("expenseDescription").value.trim();
    const isRecurring = document.getElementById("expenseRecurring").checked;

    if (isNaN(amount) || amount <= 0) {
      showExpenseAlert("Amount must be greater than 0.");
      return;
    }
    if (!isValidPaymentMethod(paymentMethod)) {
      showExpenseAlert("Please choose a valid payment method.");
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
      payment_method: paymentMethod,
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
    document.getElementById("expensePaymentMethod").value = "Cash";
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
  const categoryName = document.createElement("div");
  categoryName.textContent = expense.categories ? expense.categories.name : "-";

  const paymentMethod = document.createElement("div");
  paymentMethod.className = "expense-payment-method";
  paymentMethod.textContent = expense.payment_method || "Not specified";

  categoryCell.appendChild(categoryName);
  categoryCell.appendChild(paymentMethod);

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

  const [expensesResult, monthlyBudgetTotal] = await Promise.all([
    supabaseClient
      .from("expenses")
      .select(
        "id, amount, payment_method, expense_datetime, description, is_recurring, category_id, categories(name)"
      )
      .eq("user_id", user.id)
      .eq("budget_month", viewedMonth)
      .order("expense_datetime", { ascending: false }),
    fetchMonthlyBudgetTotal(user.id, viewedMonth),
  ]);

  const { data, error } = expensesResult;

  if (error) {
    showExpenseListAlert(error.message);
    return;
  }

  viewedMonthlyBudgetTotal = monthlyBudgetTotal;

  expenseCache.clear();
  data.forEach((expense) => expenseCache.set(expense.id, expense));

  tbody.innerHTML = "";

  if (data.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML =
      '<td colspan="6" class="text-center text-muted">No expenses recorded this month yet.</td>';
    tbody.appendChild(emptyRow);
    await window.refreshBalance();
    renderExpenseCalendar();
    refreshDayModalIfOpen();
    return;
  }

  data.forEach((expense) => tbody.appendChild(buildExpenseRow(expense)));
  await window.refreshBalance();
  renderExpenseCalendar();
  refreshDayModalIfOpen();
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

  await window.getUserCurrency();

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

  document.getElementById("incomeTileAmount").textContent = window.formatCurrency(income);
  document.getElementById("spentTileAmount").textContent = window.formatCurrency(totalExpenses);
  document.getElementById("balanceAmount").textContent = window.formatCurrency(balance);

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

// ============================================================
// CALENDAR VIEW
// ============================================================
//
// A second presentation of the same expense data loaded by
// loadExpenses() - no separate fetching, editing, or deleting
// logic. Day cells are colored by % of the monthly budget spent
// (sum of this month's category_budgets, mirroring the "Overall
// Budget" figure on the Budgets page), not by fixed currency
// thresholds.
// ============================================================

const EXPENSE_VIEW_STORAGE_KEY = "expenseViewPreference";
const SPENDING_LEVELS = { LOW: 2, MODERATE: 5 };

function getStoredExpenseView() {
  return localStorage.getItem(EXPENSE_VIEW_STORAGE_KEY) === "calendar" ? "calendar" : "table";
}

function applyExpenseView(view) {
  const tableWrap = document.getElementById("expenseTableViewWrap");
  const calendarWrap = document.getElementById("expenseCalendarViewWrap");
  const tableBtn = document.getElementById("expenseViewTableBtn");
  const calendarBtn = document.getElementById("expenseViewCalendarBtn");
  if (!tableWrap || !calendarWrap) return;

  const isCalendar = view === "calendar";
  tableWrap.classList.toggle("d-none", isCalendar);
  calendarWrap.classList.toggle("d-none", !isCalendar);
  if (tableBtn) tableBtn.classList.toggle("active", !isCalendar);
  if (calendarBtn) calendarBtn.classList.toggle("active", isCalendar);
}

function setupExpenseViewToggle() {
  const tableBtn = document.getElementById("expenseViewTableBtn");
  const calendarBtn = document.getElementById("expenseViewCalendarBtn");
  if (!tableBtn || !calendarBtn) return;

  tableBtn.addEventListener("click", () => {
    localStorage.setItem(EXPENSE_VIEW_STORAGE_KEY, "table");
    applyExpenseView("table");
  });
  calendarBtn.addEventListener("click", () => {
    localStorage.setItem(EXPENSE_VIEW_STORAGE_KEY, "calendar");
    applyExpenseView("calendar");
  });

  applyExpenseView(getStoredExpenseView());
}

// Sums this month's category budgets, counting only categories
// with budget tracking enabled - the same "Overall Budget" figure
// shown on the Budgets page. Mirrors budgets.js's fallback between
// the `amount`/`budget_amount` column names.
async function fetchMonthlyBudgetTotal(userId, monthFirstDay) {
  const { data: categories, error: categoriesError } = await supabaseClient
    .from("categories")
    .select("id, include_in_budget")
    .or(`user_id.is.null,user_id.eq.${userId}`);

  if (categoriesError) {
    console.error("Failed to load categories for budget total:", categoriesError.message);
    return 0;
  }

  const includedCategoryIds = new Set(
    categories.filter((category) => category.include_in_budget !== false).map((category) => String(category.id))
  );

  let budgetRows;
  const primary = await supabaseClient
    .from("category_budgets")
    .select("category_id, amount")
    .eq("user_id", userId)
    .eq("month", monthFirstDay);

  if (!primary.error) {
    budgetRows = primary.data || [];
  } else {
    const fallback = await supabaseClient
      .from("category_budgets")
      .select("category_id, budget_amount")
      .eq("user_id", userId)
      .eq("month", monthFirstDay);

    if (fallback.error) {
      console.error("Failed to load category budgets for budget total:", fallback.error.message);
      return 0;
    }

    budgetRows = (fallback.data || []).map((row) => ({
      category_id: row.category_id,
      amount: Number(row.budget_amount),
    }));
  }

  return budgetRows
    .filter((row) => includedCategoryIds.has(String(row.category_id)))
    .reduce((sum, row) => sum + Number(row.amount), 0);
}

// Formats a Date as a local "YYYY-MM-DD" key (not UTC), used to
// group expenses by calendar day.
function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildExpensesByDay() {
  const map = new Map();
  expenseCache.forEach((expense) => {
    const key = toDateKey(new Date(expense.expense_datetime));
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(expense);
  });
  return map;
}

// Returns the calendar-day color class for a day's spending, or
// null when there's no budget to compare against (or nothing was
// spent) - callers fall back to the default cell styling.
function getSpendingColorClass(dailyTotal, monthlyBudget) {
  if (!monthlyBudget || monthlyBudget <= 0 || dailyTotal <= 0) return null;

  const percent = (dailyTotal / monthlyBudget) * 100;
  if (percent <= SPENDING_LEVELS.LOW) return "calendar-day-green";
  if (percent <= SPENDING_LEVELS.MODERATE) return "calendar-day-yellow";
  return "calendar-day-red";
}

function buildCalendarDayCell(cellDate, inCurrentMonth, today) {
  const cell = document.createElement("div");
  cell.className = "calendar-day";

  const dateKey = toDateKey(cellDate);
  const dayExpenses = expensesByDayCache.get(dateKey) || [];

  // Prev/next month cells are dimmed either way, but if this
  // viewed month's expenses include one dated in the adjacent
  // month (expense_datetime can fall outside its budget_month),
  // that data is already in expensesByDayCache - show it instead
  // of leaving the cell blank.
  const hasData = inCurrentMonth || dayExpenses.length > 0;

  if (!inCurrentMonth) {
    cell.classList.add("calendar-day-outside");
    if (hasData) cell.classList.add("calendar-day-outside-active");
  }

  const dayNumber = document.createElement("div");
  dayNumber.className = "calendar-day-number";
  dayNumber.textContent = cellDate.getDate();
  cell.appendChild(dayNumber);

  if (!hasData) {
    return cell;
  }

  const dailyTotal = dayExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  const colorClass = getSpendingColorClass(dailyTotal, viewedMonthlyBudgetTotal);
  if (colorClass) cell.classList.add(colorClass);

  if (
    cellDate.getFullYear() === today.getFullYear() &&
    cellDate.getMonth() === today.getMonth() &&
    cellDate.getDate() === today.getDate()
  ) {
    cell.classList.add("calendar-day-today");
  }

  const dayAmount = document.createElement("div");
  dayAmount.className = "calendar-day-amount";
  dayAmount.textContent = window.formatCurrency(dailyTotal);
  cell.appendChild(dayAmount);

  cell.setAttribute("role", "button");
  cell.setAttribute("tabindex", "0");
  cell.addEventListener("click", () => openDayExpenseModal(dateKey));
  cell.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDayExpenseModal(dateKey);
    }
  });

  return cell;
}

// Rebuilds the calendar grid for the currently viewed month from
// whatever loadExpenses() just cached - no extra fetch.
function renderExpenseCalendar() {
  const grid = document.getElementById("expenseCalendarGrid");
  if (!grid) return;

  expensesByDayCache = buildExpensesByDay();

  const { start } = window.getViewedMonthRange();
  const year = start.getFullYear();
  const month = start.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const leadingBlanks = (start.getDay() + 6) % 7; // Monday-first offset
  const totalCells = Math.ceil((leadingBlanks + daysInMonth) / 7) * 7;
  const today = new Date();

  grid.innerHTML = "";

  for (let i = 0; i < totalCells; i++) {
    const cellDate = new Date(year, month, i - leadingBlanks + 1);
    const inCurrentMonth = cellDate.getMonth() === month;
    grid.appendChild(buildCalendarDayCell(cellDate, inCurrentMonth, today));
  }
}

// ============================================================
// DAY EXPENSE MODAL (Calendar View)
// ============================================================
//
// Reuses openEditExpenseModal() / deleteExpense() unchanged for
// CRUD - this section only renders the day's expenses and wires
// those existing actions to it.
// ============================================================

// "YYYY-MM-DD" of the day currently shown in the day modal, or
// null when it's closed. Lets loadExpenses() refresh the modal in
// place after an edit/delete instead of requiring a page reload.
let dayModalOpenDate = null;
// True while we're hiding the day modal specifically to open the
// edit modal on top of it, so it should reopen once editing ends.
let reopenDayModalAfterEdit = false;

function formatDayModalDateLabel(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function buildDayExpenseItem(expense) {
  const item = document.createElement("div");
  item.className = "day-expense-item";

  const info = document.createElement("div");
  info.className = "day-expense-item-info";

  const categoryEl = document.createElement("div");
  categoryEl.className = "fw-semibold";
  categoryEl.textContent = expense.categories ? expense.categories.name : "-";

  const descriptionEl = document.createElement("div");
  descriptionEl.className = "text-muted small";
  descriptionEl.textContent = expense.description || expense.payment_method || "-";

  info.appendChild(categoryEl);
  info.appendChild(descriptionEl);

  const actions = document.createElement("div");
  actions.className = "day-expense-item-actions";

  const amountEl = document.createElement("div");
  amountEl.className = "fw-semibold mb-1";
  amountEl.textContent = window.formatCurrency(expense.amount);

  const buttonsRow = document.createElement("div");
  buttonsRow.className = "day-expense-item-buttons";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn-sm btn-outline-secondary";
  editBtn.setAttribute("aria-label", "Edit expense");
  editBtn.innerHTML = '<i class="bi bi-pencil"></i>';
  editBtn.addEventListener("click", () => openEditFromDayModal(expense.id));

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn-sm btn-outline-danger";
  deleteBtn.setAttribute("aria-label", "Delete expense");
  deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
  deleteBtn.addEventListener("click", () => deleteExpense(expense.id));

  buttonsRow.appendChild(editBtn);
  buttonsRow.appendChild(deleteBtn);

  actions.appendChild(amountEl);
  actions.appendChild(buttonsRow);

  item.appendChild(info);
  item.appendChild(actions);
  return item;
}

function renderDayModalContent(dateKey) {
  const dateLabelEl = document.getElementById("dayExpenseModalDate");
  const totalEl = document.getElementById("dayExpenseModalTotal");
  const listEl = document.getElementById("dayExpenseModalList");
  const countEl = document.getElementById("dayExpenseModalCount");
  if (!dateLabelEl || !totalEl || !listEl || !countEl) return;

  const dayExpenses = expensesByDayCache.get(dateKey) || [];
  const total = dayExpenses.reduce((sum, expense) => sum + Number(expense.amount), 0);

  dateLabelEl.textContent = formatDayModalDateLabel(dateKey);
  totalEl.textContent = window.formatCurrency(total);
  listEl.innerHTML = "";

  if (dayExpenses.length === 0) {
    const empty = document.createElement("p");
    empty.className = "text-muted text-center mb-0";
    empty.textContent = "No expenses recorded for this day.";
    listEl.appendChild(empty);
    countEl.textContent = "";
    return;
  }

  dayExpenses.forEach((expense) => listEl.appendChild(buildDayExpenseItem(expense)));
  countEl.textContent = `${dayExpenses.length} Transaction${dayExpenses.length === 1 ? "" : "s"}`;
}

function openDayExpenseModal(dateKey) {
  dayModalOpenDate = dateKey;
  renderDayModalContent(dateKey);
  const modal = new bootstrap.Modal(document.getElementById("dayExpenseModal"));
  modal.show();
}

// Hides the day modal, then opens the existing edit-expense modal
// on top of it (never both showing at once - avoids Bootstrap's
// stacked-modal backdrop quirks).
function openEditFromDayModal(expenseId) {
  reopenDayModalAfterEdit = true;
  const dayModalEl = document.getElementById("dayExpenseModal");
  const instance = bootstrap.Modal.getInstance(dayModalEl);
  const openEdit = () => openEditExpenseModal(expenseId);

  if (instance) {
    dayModalEl.addEventListener("hidden.bs.modal", openEdit, { once: true });
    instance.hide();
  } else {
    openEdit();
  }
}

// Called at the end of loadExpenses() so a delete triggered from
// the day modal (which stays open through the native confirm())
// re-renders in place instead of showing stale data.
function refreshDayModalIfOpen() {
  if (!dayModalOpenDate) return;
  const dayModalEl = document.getElementById("dayExpenseModal");
  if (dayModalEl && dayModalEl.classList.contains("show")) {
    renderDayModalContent(dayModalOpenDate);
  }
}

function setupDayExpenseModal() {
  const dayModalEl = document.getElementById("dayExpenseModal");
  const editModalEl = document.getElementById("editExpenseModal");
  if (!dayModalEl) return;

  // Closed normally (not on the way to the edit modal) - forget it.
  dayModalEl.addEventListener("hidden.bs.modal", () => {
    if (!reopenDayModalAfterEdit) {
      dayModalOpenDate = null;
    }
  });

  // Edit modal closed (Cancel or after a successful save, which
  // already refreshed expensesByDayCache via loadExpenses) - bring
  // the day modal back with current data.
  if (editModalEl) {
    editModalEl.addEventListener("hidden.bs.modal", () => {
      if (reopenDayModalAfterEdit && dayModalOpenDate) {
        reopenDayModalAfterEdit = false;
        renderDayModalContent(dayModalOpenDate);
        new bootstrap.Modal(dayModalEl).show();
      } else {
        reopenDayModalAfterEdit = false;
      }
    });
  }
}

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
  const paymentMethodSelect = document.getElementById("editExpensePaymentMethod");
  const legacyOption = paymentMethodSelect.querySelector('[data-legacy-null="true"]');
  if (legacyOption) legacyOption.remove();

  if (isValidPaymentMethod(expense.payment_method)) {
    paymentMethodSelect.value = expense.payment_method;
  } else {
    const notSpecifiedOption = document.createElement("option");
    notSpecifiedOption.value = "";
    notSpecifiedOption.textContent = "Not specified";
    notSpecifiedOption.dataset.legacyNull = "true";
    paymentMethodSelect.prepend(notSpecifiedOption);
    paymentMethodSelect.value = "";
  }
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
    const paymentMethod = document.getElementById("editExpensePaymentMethod").value;
    const categoryId = document.getElementById("editExpenseCategory").value;
    const datetimeValue = document.getElementById("editExpenseDatetime").value;
    const description = document.getElementById("editExpenseDescription").value.trim();
    const isRecurring = document.getElementById("editExpenseRecurring").checked;

    if (isNaN(amount) || amount <= 0) {
      showEditExpenseAlert("Amount must be greater than 0.");
      return;
    }
    if (paymentMethod && !isValidPaymentMethod(paymentMethod)) {
      showEditExpenseAlert("Please choose a valid payment method.");
      return;
    }

    const { error } = await supabaseClient
      .from("expenses")
      .update({
        category_id: categoryId,
        amount,
        payment_method: paymentMethod || null,
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
  loadPaymentMethods("expensePaymentMethod");
  setupAddCategory();
  setupExpenseForm();
  setDefaultExpenseDatetime();
  setupExpenseViewToggle();
  setupDayExpenseModal();

  loadExpenses();
  setupEditExpenseForm();
});
