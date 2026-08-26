// ============================================================
// budgets.js - monthly category budgets page
// ============================================================

let viewedMonthDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let budgetAmountColumn = "amount";

const budgetState = {
  rows: [],
  previousMonthBudgetRows: [],
  sortKey: "category",
  sortDirection: "asc",
  searchTerm: "",
};

function getMonthFirstDay(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function getViewedMonthFirstDay() {
  return getMonthFirstDay(viewedMonthDate);
}

function getPreviousMonthDate() {
  return new Date(viewedMonthDate.getFullYear(), viewedMonthDate.getMonth() - 1, 1);
}

function formatMonthYear(date) {
  return date.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

function showBudgetsAlert(message, type = "danger") {
  const alertBox = document.getElementById("budgetsAlert");
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  window.autoHideAlert(alertBox);
}

function showEditBudgetAlert(message, type = "danger") {
  const alertBox = document.getElementById("editBudgetAlert");
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  window.autoHideAlert(alertBox);
}

function hideEditBudgetAlert() {
  const alertBox = document.getElementById("editBudgetAlert");
  if (!alertBox) return;
  alertBox.classList.add("d-none");
}

// Rounds a monetary value to the nearest cent, correcting the
// floating-point drift that accumulates when several expense
// amounts are summed in JS (e.g. 799.99 + 797.99 can land as
// 1597.9800000000002 instead of exactly 1597.98).
function roundToCents(value) {
  return Math.round(value * 100) / 100;
}

function getUsageMeta(budgetAmount, spentAmount) {
  if (budgetAmount === null) {
    return {
      usagePercent: null,
      widthPercent: 0,
      label: "\u2014",
      barClass: "bg-secondary",
      overBudget: false,
    };
  }

  if (budgetAmount === 0) {
    if (spentAmount > 0) {
      return {
        usagePercent: 100,
        widthPercent: 100,
        label: "Over Budget",
        barClass: "bg-danger",
        overBudget: true,
      };
    }

    return {
      usagePercent: 0,
      widthPercent: 0,
      label: "0%",
      barClass: "bg-success",
      overBudget: false,
    };
  }

  // overBudget is decided from the rounded remaining amount (a
  // subtraction), not from usagePercent (a division) - the two can
  // disagree by a hair of floating-point drift right at the
  // boundary, which previously showed "Over Budget" even when the
  // Remaining column still displayed a positive amount.
  const remaining = roundToCents(budgetAmount - spentAmount);
  const overBudget = remaining < 0;

  const usagePercent = (spentAmount / budgetAmount) * 100;
  const widthPercent = Math.min(Math.max(usagePercent, 0), 100);

  let barClass = "bg-success";
  if (usagePercent >= 90) {
    barClass = "bg-danger";
  } else if (usagePercent >= 70) {
    barClass = "bg-warning";
  }

  // While money still remains (even LKR 0.01), the label must never
  // round up to "100%" - that would read as fully/over spent. Only
  // show 100% once remaining has actually reached exactly 0.
  let label;
  if (overBudget) {
    label = "Over Budget";
  } else if (remaining === 0) {
    label = "100%";
  } else {
    label = `${Math.min(99, Math.floor(usagePercent))}%`;
  }

  return {
    usagePercent,
    widthPercent,
    label,
    barClass,
    overBudget,
  };
}

function renderMonthNavigator() {
  const labelEl = document.getElementById("viewedMonthLabel");
  if (labelEl) labelEl.textContent = formatMonthYear(viewedMonthDate);

  const copyBtn = document.getElementById("copyPreviousBudgetBtn");
  if (copyBtn) {
    const previousMonthName = getPreviousMonthDate().toLocaleDateString(undefined, {
      month: "long",
    });
    copyBtn.textContent = `Copy ${previousMonthName} Budget`;
  }
}

function updateCopyPreviousBudgetButton(isLoading = false) {
  const copyBtn = document.getElementById("copyPreviousBudgetBtn");
  if (!copyBtn) return;

  copyBtn.disabled = isLoading || budgetState.previousMonthBudgetRows.length === 0;
  copyBtn.title = budgetState.previousMonthBudgetRows.length === 0 && !isLoading
    ? `${formatMonthYear(getPreviousMonthDate())} has no category budgets to copy.`
    : "";
}

function setupMonthNavigator() {
  const prevBtn = document.getElementById("prevMonthBtn");
  const nextBtn = document.getElementById("nextMonthBtn");
  if (!prevBtn || !nextBtn) return;

  renderMonthNavigator();

  prevBtn.addEventListener("click", async () => {
    viewedMonthDate = new Date(viewedMonthDate.getFullYear(), viewedMonthDate.getMonth() - 1, 1);
    renderMonthNavigator();
    await loadBudgetPageData();
  });

  nextBtn.addEventListener("click", async () => {
    viewedMonthDate = new Date(viewedMonthDate.getFullYear(), viewedMonthDate.getMonth() + 1, 1);
    renderMonthNavigator();
    await loadBudgetPageData();
  });
}

async function fetchCategories(userId) {
  const { data, error } = await supabaseClient
    .from("categories")
    .select("id, name, user_id, include_in_budget")
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function fetchExpensesForMonth(userId, monthFirstDay) {
  const { data, error } = await supabaseClient
    .from("expenses")
    .select("category_id, amount, expense_type")
    .eq("user_id", userId)
    .eq("budget_month", monthFirstDay);

  if (error) throw error;
  return data || [];
}

async function fetchCategoryBudgetsForMonth(userId, monthFirstDay) {
  let { data, error } = await supabaseClient
    .from("category_budgets")
    .select("category_id, amount")
    .eq("user_id", userId)
    .eq("month", monthFirstDay);

  if (!error) {
    budgetAmountColumn = "amount";
    return data || [];
  }

  const fallback = await supabaseClient
    .from("category_budgets")
    .select("category_id, budget_amount")
    .eq("user_id", userId)
    .eq("month", monthFirstDay);

  if (fallback.error) throw error;

  budgetAmountColumn = "budget_amount";
  return (fallback.data || []).map((row) => ({
    category_id: row.category_id,
    amount: Number(row.budget_amount),
  }));
}

function buildBudgetRows(categories, expenses, budgetRows) {
  const spentByCategory = {};
  expenses.forEach((expense) => {
    if (expense.expense_type === "saving") return;
    const key = String(expense.category_id);
    spentByCategory[key] = (spentByCategory[key] || 0) + Number(expense.amount);
  });

  const budgetByCategory = {};
  budgetRows.forEach((row) => {
    budgetByCategory[String(row.category_id)] = Number(row.amount);
  });

  return categories.map((category) => {
    const categoryId = String(category.id);
    const budgetAmount = Object.prototype.hasOwnProperty.call(budgetByCategory, categoryId)
      ? budgetByCategory[categoryId]
      : null;
    const spentAmount = spentByCategory[categoryId] || 0;
    const remainingAmount = budgetAmount === null ? null : roundToCents(budgetAmount - spentAmount);
    const usageMeta = getUsageMeta(budgetAmount, spentAmount);

    return {
      categoryId: category.id,
      categoryName: category.name,
      includeInBudget: category.include_in_budget !== false,
      budgetAmount,
      spentAmount,
      remainingAmount,
      usagePercent: usageMeta.usagePercent,
      usageWidthPercent: usageMeta.widthPercent,
      usageLabel: usageMeta.label,
      usageBarClass: usageMeta.barClass,
      isOverBudget: usageMeta.overBudget,
    };
  });
}

function sortRows(rows) {
  const directionFactor = budgetState.sortDirection === "asc" ? 1 : -1;
  const sorted = [...rows].sort((a, b) => {
    if (budgetState.sortKey === "category") {
      return directionFactor * a.categoryName.localeCompare(b.categoryName);
    }

    const numberA = a[`${budgetState.sortKey}Amount`] ?? a.usagePercent;
    const numberB = b[`${budgetState.sortKey}Amount`] ?? b.usagePercent;

    const isMissingA = numberA === null || numberA === undefined;
    const isMissingB = numberB === null || numberB === undefined;
    if (isMissingA && !isMissingB) return 1;
    if (!isMissingA && isMissingB) return -1;

    const safeA = Number(numberA);
    const safeB = Number(numberB);

    if (safeA === safeB) {
      return a.categoryName.localeCompare(b.categoryName);
    }

    return (safeA - safeB) * directionFactor;
  });

  return sorted;
}

function getVisibleRows() {
  const searchLower = budgetState.searchTerm.toLowerCase();
  const filtered = budgetState.rows.filter((row) =>
    row.categoryName.toLowerCase().includes(searchLower)
  );

  return sortRows(filtered);
}

function renderOverviewCards(rows) {
  const budgetEligibleRows = rows.filter((row) => row.includeInBudget);
  const rowsWithBudget = budgetEligibleRows.filter((row) => row.budgetAmount !== null);
  const overallBudget = rowsWithBudget.reduce((sum, row) => sum + row.budgetAmount, 0);
  const totalSpent = budgetEligibleRows.reduce((sum, row) => sum + row.spentAmount, 0);
  const remainingBudget = roundToCents(overallBudget - totalSpent);
  const usagePercent = overallBudget > 0 ? (totalSpent / overallBudget) * 100 : 0;

  document.getElementById("overallBudgetAmount").textContent = formatCurrency(overallBudget);
  document.getElementById("totalSpentAmount").textContent = formatCurrency(totalSpent);
  document.getElementById("remainingBudgetAmount").textContent = formatCurrency(remainingBudget);

  // Same rule as the per-category rows: never round the displayed
  // percentage up to "100%" while money still remains. A genuine
  // overspend (remainingBudget < 0) still shows its real percentage
  // (e.g. "107%"), unchanged from before.
  let usagePercentLabel = "\u2014";
  if (overallBudget > 0) {
    if (remainingBudget < 0) {
      usagePercentLabel = `${Math.round(usagePercent)}%`;
    } else if (remainingBudget === 0) {
      usagePercentLabel = "100%";
    } else {
      usagePercentLabel = `${Math.min(99, Math.floor(usagePercent))}%`;
    }
  }
  document.getElementById("budgetUsagePercent").textContent = usagePercentLabel;

  const remainingCard = document.getElementById("remainingBudgetCard");
  remainingCard.classList.remove("bg-success", "bg-warning", "bg-danger", "text-white");

  if (overallBudget === 0) return;

  if (remainingBudget < 0 || usagePercent >= 90) {
    remainingCard.classList.add("bg-danger", "text-white");
  } else if (usagePercent >= 70) {
    remainingCard.classList.add("bg-warning", "text-white");
  } else {
    remainingCard.classList.add("bg-success", "text-white");
  }
}

function renderSortIndicators() {
  document.querySelectorAll("[data-sort]").forEach((button) => {
    const indicator = button.querySelector(".sort-indicator");
    if (!indicator) return;

    const key = button.getAttribute("data-sort");
    if (key !== budgetState.sortKey) {
      indicator.textContent = "↕";
      return;
    }

    indicator.textContent = budgetState.sortDirection === "asc" ? "↑" : "↓";
  });
}

function renderTable() {
  const tbody = document.getElementById("budgetTableBody");
  const tableWrapper = document.getElementById("budgetTableWrapper");
  const emptyState = document.getElementById("budgetEmptyState");
  if (!tbody || !tableWrapper || !emptyState) return;

  const visibleRows = getVisibleRows();

  if (budgetState.rows.length === 0) {
    tableWrapper.classList.add("d-none");
    emptyState.classList.remove("d-none");
    emptyState.classList.add("d-flex");
    emptyState.querySelector("h3").textContent = "No categories found.";
    emptyState.querySelector("p").textContent = "Add categories from Home, then come back to set monthly budgets.";
    return;
  }

  if (visibleRows.length === 0) {
    tableWrapper.classList.add("d-none");
    emptyState.classList.remove("d-none");
    emptyState.classList.add("d-flex");
    emptyState.querySelector("h3").textContent = "No categories found.";
    emptyState.querySelector("p").textContent = "Try a different search term.";
    return;
  }

  tableWrapper.classList.remove("d-none");
  emptyState.classList.add("d-none");
  emptyState.classList.remove("d-flex");

  tbody.innerHTML = "";

  visibleRows.forEach((row) => {
    const tr = document.createElement("tr");

    const categoryCell = document.createElement("td");
    categoryCell.textContent = row.categoryName;

    const budgetCell = document.createElement("td");
    budgetCell.textContent = row.budgetAmount === null ? "\u2014" : formatCurrency(row.budgetAmount);

    const spentCell = document.createElement("td");
    spentCell.textContent = formatCurrency(row.spentAmount);

    const remainingCell = document.createElement("td");
    if (row.remainingAmount === null) {
      remainingCell.textContent = "\u2014";
    } else {
      remainingCell.textContent = formatCurrency(row.remainingAmount);
      if (row.remainingAmount < 0) {
        remainingCell.classList.add("text-danger", "fw-semibold");
      }
    }

    const progressCell = document.createElement("td");
    if (row.budgetAmount === null) {
      progressCell.innerHTML = '<span class="text-muted">&#8212;</span>';
    } else {
      progressCell.innerHTML = `
        <div class="progress budget-progress">
          <div class="progress-bar ${row.usageBarClass}" role="progressbar" style="width: ${row.usageWidthPercent}%" aria-valuemin="0" aria-valuemax="100"></div>
          <span class="budget-progress-label">${row.usageLabel}</span>
        </div>
      `;
    }

    const actionCell = document.createElement("td");
    actionCell.className = "text-end";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn-sm btn-outline-secondary";
    editBtn.textContent = "Edit";
    editBtn.addEventListener("click", () => openEditBudgetModal(row));
    actionCell.appendChild(editBtn);

    tr.appendChild(categoryCell);
    tr.appendChild(budgetCell);
    tr.appendChild(spentCell);
    tr.appendChild(remainingCell);
    tr.appendChild(progressCell);
    tr.appendChild(actionCell);

    tbody.appendChild(tr);
  });

  renderSortIndicators();
}

function openEditBudgetModal(row) {
  hideEditBudgetAlert();

  document.getElementById("editBudgetCategoryId").value = row.categoryId;
  document.getElementById("editBudgetCategoryName").value = row.categoryName;
  document.getElementById("editBudgetAmount").value = row.budgetAmount === null ? "" : row.budgetAmount;

  const modal = new bootstrap.Modal(document.getElementById("editBudgetModal"));
  modal.show();
}

async function saveBudgetAmount(categoryId, amount) {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) return;

  const payload = {
    user_id: user.id,
    category_id: categoryId,
    month: getViewedMonthFirstDay(),
    [budgetAmountColumn]: amount,
  };

  let result = await supabaseClient
    .from("category_budgets")
    .upsert(payload, { onConflict: "user_id,month,category_id" });

  if (!result.error) return;

  result = await supabaseClient
    .from("category_budgets")
    .upsert(payload, { onConflict: "user_id,category_id,month" });

  if (!result.error) return;

  const updateResult = await supabaseClient
    .from("category_budgets")
    .update({ [budgetAmountColumn]: amount })
    .eq("user_id", user.id)
    .eq("category_id", categoryId)
    .eq("month", getViewedMonthFirstDay())
    .select("category_id");

  if (updateResult.error) throw updateResult.error;

  if ((updateResult.data || []).length > 0) return;

  const insertResult = await supabaseClient.from("category_budgets").insert(payload);
  if (insertResult.error) throw insertResult.error;
}

async function copyPreviousMonthBudgets() {
  const copyBtn = document.getElementById("copyPreviousBudgetBtn");
  if (!copyBtn || budgetState.previousMonthBudgetRows.length === 0) return;

  const previousMonthLabel = formatMonthYear(getPreviousMonthDate());
  const currentMonthLabel = formatMonthYear(viewedMonthDate);
  const confirmed = window.confirm(
    `Copy ${previousMonthLabel} budgets into ${currentMonthLabel}?\n\n` +
    "Existing categories will be updated.\n" +
    "New categories will be created.\n" +
    "Other categories will remain unchanged."
  );
  if (!confirmed) return;

  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) return;

  copyBtn.disabled = true;
  const originalText = copyBtn.textContent;
  copyBtn.textContent = "Copying...";

  try {
    const targetMonth = getViewedMonthFirstDay();
    const payload = budgetState.previousMonthBudgetRows.map((row) => ({
      user_id: user.id,
      category_id: row.category_id,
      month: targetMonth,
      [budgetAmountColumn]: Number(row.amount),
    }));

    let result = await supabaseClient
      .from("category_budgets")
      .upsert(payload, { onConflict: "user_id,category_id,month" });

    if (result.error) {
      result = await supabaseClient
        .from("category_budgets")
        .upsert(payload, { onConflict: "user_id,month,category_id" });
    }

    if (result.error) throw result.error;

    await loadBudgetPageData();
    showBudgetsAlert(`${previousMonthLabel} budgets copied into ${currentMonthLabel}.`, "success");
  } catch (error) {
    showBudgetsAlert(error.message || "Failed to copy the previous month's budgets.");
  } finally {
    copyBtn.textContent = originalText;
    updateCopyPreviousBudgetButton();
  }
}

function setupCopyPreviousBudget() {
  const copyBtn = document.getElementById("copyPreviousBudgetBtn");
  if (!copyBtn) return;
  copyBtn.addEventListener("click", copyPreviousMonthBudgets);
}

function setupEditBudgetForm() {
  const form = document.getElementById("editBudgetForm");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideEditBudgetAlert();

    const categoryId = document.getElementById("editBudgetCategoryId").value;
    const amountValue = document.getElementById("editBudgetAmount").value;
    const amount = Number(amountValue);

    if (Number.isNaN(amount) || amount < 0) {
      showEditBudgetAlert("Please enter a valid, non-negative budget amount.");
      return;
    }

    try {
      await saveBudgetAmount(categoryId, amount);

      const modalEl = document.getElementById("editBudgetModal");
      const modalInstance = bootstrap.Modal.getInstance(modalEl);
      if (modalInstance) modalInstance.hide();

      await loadBudgetPageData();
      showBudgetsAlert("Budget saved.", "success");
    } catch (error) {
      showEditBudgetAlert(error.message || "Failed to save budget.");
    }
  });
}

function setupSearch() {
  const searchInput = document.getElementById("budgetSearchInput");
  if (!searchInput) return;

  searchInput.addEventListener("input", () => {
    budgetState.searchTerm = searchInput.value.trim();
    renderTable();
  });
}

function setupSorting() {
  document.querySelectorAll("[data-sort]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-sort");
      if (!key) return;

      if (budgetState.sortKey === key) {
        budgetState.sortDirection = budgetState.sortDirection === "asc" ? "desc" : "asc";
      } else {
        budgetState.sortKey = key;
        budgetState.sortDirection = "asc";
      }

      renderTable();
    });
  });
}

async function loadBudgetPageData() {
  const {
    data: { user },
  } = await supabaseClient.auth.getUser();
  if (!user) return;

  await window.getUserCurrency();

  const monthFirstDay = getViewedMonthFirstDay();
  const previousMonthFirstDay = getMonthFirstDay(getPreviousMonthDate());
  updateCopyPreviousBudgetButton(true);

  try {
    const [categories, expenses, budgetRows, previousMonthBudgetRows] = await Promise.all([
      fetchCategories(user.id),
      fetchExpensesForMonth(user.id, monthFirstDay),
      fetchCategoryBudgetsForMonth(user.id, monthFirstDay),
      fetchCategoryBudgetsForMonth(user.id, previousMonthFirstDay),
    ]);

    budgetState.rows = buildBudgetRows(categories, expenses, budgetRows);
    budgetState.previousMonthBudgetRows = previousMonthBudgetRows;

    renderOverviewCards(budgetState.rows);
    renderTable();
    updateCopyPreviousBudgetButton();
  } catch (error) {
    budgetState.previousMonthBudgetRows = [];
    updateCopyPreviousBudgetButton();
    showBudgetsAlert(error.message || "Failed to load budget data.");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("budgetTableBody")) return;

  setupMonthNavigator();
  setupSearch();
  setupSorting();
  setupEditBudgetForm();
  setupCopyPreviousBudget();

  await loadBudgetPageData();
});
