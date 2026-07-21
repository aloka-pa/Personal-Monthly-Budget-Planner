// ============================================================
// budgets.js - monthly category budgets page
// ============================================================

let viewedMonthDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let budgetAmountColumn = "amount";

const budgetState = {
  rows: [],
  sortKey: "category",
  sortDirection: "asc",
  searchTerm: "",
};

function getViewedMonthFirstDay() {
  const year = viewedMonthDate.getFullYear();
  const month = String(viewedMonthDate.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

function isViewingRealCurrentMonth() {
  const now = new Date();
  return (
    viewedMonthDate.getFullYear() === now.getFullYear() &&
    viewedMonthDate.getMonth() === now.getMonth()
  );
}

function formatCurrency(amount) {
  return `LKR ${Number(amount).toFixed(2)}`;
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

  const usagePercent = (spentAmount / budgetAmount) * 100;
  const overBudget = usagePercent > 100;
  const widthPercent = Math.min(Math.max(usagePercent, 0), 100);

  let barClass = "bg-success";
  if (usagePercent >= 90) {
    barClass = "bg-danger";
  } else if (usagePercent >= 70) {
    barClass = "bg-warning";
  }

  return {
    usagePercent,
    widthPercent,
    label: overBudget ? "Over Budget" : `${Math.round(usagePercent)}%`,
    barClass,
    overBudget,
  };
}

function renderMonthNavigator() {
  const label = viewedMonthDate.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const labelEl = document.getElementById("viewedMonthLabel");
  if (labelEl) labelEl.textContent = label;

  const nextBtn = document.getElementById("nextMonthBtn");
  if (nextBtn) nextBtn.disabled = isViewingRealCurrentMonth();
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
    if (isViewingRealCurrentMonth()) return;
    viewedMonthDate = new Date(viewedMonthDate.getFullYear(), viewedMonthDate.getMonth() + 1, 1);
    renderMonthNavigator();
    await loadBudgetPageData();
  });
}

async function fetchCategories(userId) {
  const { data, error } = await supabaseClient
    .from("categories")
    .select("id, name, user_id")
    .or(`user_id.is.null,user_id.eq.${userId}`)
    .order("name", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function fetchExpensesForMonth(userId, monthFirstDay) {
  const { data, error } = await supabaseClient
    .from("expenses")
    .select("category_id, amount")
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
    const remainingAmount = budgetAmount === null ? null : budgetAmount - spentAmount;
    const usageMeta = getUsageMeta(budgetAmount, spentAmount);

    return {
      categoryId: category.id,
      categoryName: category.name,
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
  const rowsWithBudget = rows.filter((row) => row.budgetAmount !== null);
  const overallBudget = rowsWithBudget.reduce((sum, row) => sum + row.budgetAmount, 0);
  const totalSpent = rows.reduce((sum, row) => sum + row.spentAmount, 0);
  const remainingBudget = overallBudget - totalSpent;
  const usagePercent = overallBudget > 0 ? (totalSpent / overallBudget) * 100 : 0;

  document.getElementById("overallBudgetAmount").textContent = formatCurrency(overallBudget);
  document.getElementById("totalSpentAmount").textContent = formatCurrency(totalSpent);
  document.getElementById("remainingBudgetAmount").textContent = formatCurrency(remainingBudget);
  document.getElementById("budgetUsagePercent").textContent =
    overallBudget > 0 ? `${Math.round(usagePercent)}%` : "\u2014";

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

  const monthFirstDay = getViewedMonthFirstDay();

  try {
    const [categories, expenses, budgetRows] = await Promise.all([
      fetchCategories(user.id),
      fetchExpensesForMonth(user.id, monthFirstDay),
      fetchCategoryBudgetsForMonth(user.id, monthFirstDay),
    ]);

    budgetState.rows = buildBudgetRows(categories, expenses, budgetRows);

    renderOverviewCards(budgetState.rows);
    renderTable();
  } catch (error) {
    showBudgetsAlert(error.message || "Failed to load budget data.");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!document.getElementById("budgetTableBody")) return;

  setupMonthNavigator();
  setupSearch();
  setupSorting();
  setupEditBudgetForm();

  await loadBudgetPageData();
});
