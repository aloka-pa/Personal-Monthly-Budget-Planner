// Phase 5 Financial Planner: isolated planned-expense CRUD, filters, and monthly table.
(function () {
  const statusOrder = ["confirmed", "tentative", "completed", "cancelled"];
  const statusLabels = { confirmed: "Confirmed", tentative: "Tentative", completed: "Completed", cancelled: "Cancelled" };
  const state = {
    user: null,
    viewedMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    categories: [],
    items: [],
    loadRequestId: 0,
  };

  const byId = (id) => document.getElementById(id);

  function monthFirstDay() {
    const year = state.viewedMonth.getFullYear();
    const month = String(state.viewedMonth.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}-01`;
  }

  function formatMonth() {
    return state.viewedMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }

  function showAlert(elementId, message, type = "danger") {
    const alert = byId(elementId);
    if (!alert) return;
    alert.textContent = message;
    alert.className = `alert alert-${type}`;
    window.autoHideAlert?.(alert, 3500);
  }

  function hideAlert(elementId) {
    byId(elementId)?.classList.add("d-none");
  }

  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) button.dataset.originalText = button.innerHTML;
    button.disabled = busy;
    button.innerHTML = busy ? busyText : button.dataset.originalText;
  }

  function populateCategorySelect(selectId, selectedId = "") {
    const select = byId(selectId);
    if (!select) return;
    select.innerHTML = "";
    const empty = document.createElement("option");
    empty.value = "";
    empty.textContent = "Select a category";
    empty.disabled = true;
    select.appendChild(empty);
    state.categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = String(category.id);
      option.textContent = category.name;
      select.appendChild(option);
    });
    select.value = selectedId ? String(selectedId) : "";
  }

  async function loadCategories() {
    const { data, error } = await supabaseClient
      .from("categories")
      .select("id, name, user_id")
      .or(`user_id.is.null,user_id.eq.${state.user.id}`)
      .order("name", { ascending: true });
    if (error) throw error;
    state.categories = data || [];
    populateCategorySelect("plannedCategory");
    populateCategorySelect("editPlannedCategory");
    populateCategoryFilter();
  }

  function populateCategoryFilter() {
    const select = byId("plannerCategoryFilter");
    const selectedValue = select.value || "all";
    select.innerHTML = '<option value="all">All Categories</option>';
    state.categories.forEach((category) => {
      const option = document.createElement("option");
      option.value = String(category.id);
      option.textContent = category.name;
      select.appendChild(option);
    });
    select.value = Array.from(select.options).some((option) => option.value === selectedValue)
      ? selectedValue
      : "all";
  }

  function visibleItems() {
    const status = byId("plannerStatusFilter").value;
    const category = byId("plannerCategoryFilter").value;
    return state.items.filter((item) => {
      const matchesStatus = status === "all" || item.status === status;
      const matchesCategory = category === "all" || String(item.category_id) === category;
      return matchesStatus && matchesCategory;
    });
  }

  function renderStatusTotals() {
    const totalFor = (status) => state.items
      .filter((item) => item.status === status)
      .reduce((sum, item) => sum + Number(item.planned_amount), 0);
    byId("plannerConfirmedTotal").textContent = window.formatCurrency(totalFor("confirmed"));
    byId("plannerTentativeTotal").textContent = window.formatCurrency(totalFor("tentative"));
    byId("plannerCompletedTotal").textContent = window.formatCurrency(totalFor("completed"));
    byId("plannerCancelledTotal").textContent = window.formatCurrency(totalFor("cancelled"));
  }

  function buildTableRow(item) {
    const categoryName = item.categories?.name;
    const row = document.createElement("tr");
    row.dataset.plannedId = item.id;

    const descriptionCell = document.createElement("td");
    descriptionCell.dataset.label = "Description";
    descriptionCell.className = "planner-description";
    descriptionCell.textContent = item.title;

    const categoryCell = document.createElement("td");
    categoryCell.dataset.label = "Category";
    categoryCell.textContent = categoryName || "Uncategorized";

    const plannedAmountCell = document.createElement("td");
    plannedAmountCell.dataset.label = "Planned Amount";
    plannedAmountCell.textContent = window.formatCurrency(item.planned_amount);

    const actualAmountCell = document.createElement("td");
    actualAmountCell.dataset.label = "Actual Amount";
    actualAmountCell.textContent = item.actual_amount == null
      ? "—"
      : window.formatCurrency(item.actual_amount);

    const statusCell = document.createElement("td");
    statusCell.dataset.label = "Status";
    const statusChip = document.createElement("span");
    statusChip.className = `planner-status planner-status-${item.status}`;
    statusChip.textContent = statusLabels[item.status] || item.status;
    statusCell.appendChild(statusChip);

    const actionsCell = document.createElement("td");
    actionsCell.className = "planner-actions";
    actionsCell.dataset.label = "Actions";
    actionsCell.innerHTML = '<button class="btn btn-sm btn-outline-secondary me-2" type="button" data-action="edit">Edit</button><button class="btn btn-sm btn-outline-danger" type="button" data-action="delete">Delete</button>';

    row.append(descriptionCell, categoryCell, plannedAmountCell, actualAmountCell, statusCell, actionsCell);
    return row;
  }

  function renderItems() {
    const visible = visibleItems();
    const body = byId("plannerTableBody");
    body.innerHTML = "";
    visible.forEach((item) => body.appendChild(buildTableRow(item)));
    const plannedTotal = visible.reduce((sum, item) => sum + Number(item.planned_amount), 0);
    const actualTotal = visible.reduce((sum, item) => (
      item.actual_amount == null ? sum : sum + Number(item.actual_amount)
    ), 0);
    byId("plannerFilteredPlannedTotal").textContent = window.formatCurrency(plannedTotal);
    byId("plannerFilteredActualTotal").textContent = window.formatCurrency(actualTotal);
    renderStatusTotals();
    byId("plannerLoading").classList.add("d-none");
    const empty = visible.length === 0;
    byId("plannerTableWrap").classList.toggle("d-none", empty);
    byId("plannerEmpty").classList.toggle("d-none", !empty);
    byId("plannerEmpty").classList.toggle("d-flex", empty);
    const filtered = state.items.length > 0 && (
      byId("plannerStatusFilter").value !== "all" || byId("plannerCategoryFilter").value !== "all"
    );
    byId("plannerEmptyTitle").textContent = filtered ? "No matching planned expenses" : "No planned expenses this month";
    byId("plannerEmptyText").textContent = filtered
      ? "Try changing the status or category filters."
      : "Add an expected expense above or browse another month.";
  }

  async function loadPlannedExpenses() {
    const requestId = ++state.loadRequestId;
    const requestedMonth = monthFirstDay();
    state.items = [];
    renderStatusTotals();
    byId("plannerLoading").classList.remove("d-none");
    byId("plannerTableWrap").classList.add("d-none");
    byId("plannerEmpty").classList.add("d-none");
    byId("plannerEmpty").classList.remove("d-flex");
    const { data, error } = await supabaseClient
      .from("planned_expenses")
      .select("id, month, title, planned_amount, actual_amount, category_id, status, notes, created_at, categories(name)")
      .eq("user_id", state.user.id)
      .eq("month", requestedMonth)
      .order("created_at", { ascending: false });
    if (requestId !== state.loadRequestId || requestedMonth !== monthFirstDay()) return;
    if (error) {
      byId("plannerLoading").classList.add("d-none");
      showAlert("plannerAlert", `Unable to load planned expenses: ${error.message}`);
      return;
    }
    state.items = data || [];
    renderItems();
  }

  function readForm(prefix = "") {
    const field = (name) => byId(prefix
      ? `${prefix}${name.charAt(0).toUpperCase()}${name.slice(1)}`
      : name);
    const description = field("plannedDescription").value.trim();
    const plannedAmountValue = field("plannedAmount").value;
    const plannedAmount = Number(plannedAmountValue);
    const actualAmountValue = field("plannedActualAmount").value.trim();
    const categoryId = field("plannedCategory").value;
    const status = field("plannedStatus").value;
    if (!description) return { error: "Description is required." };
    if (plannedAmountValue === "" || !Number.isFinite(plannedAmount) || plannedAmount < 0.01) {
      return { error: "Planned amount must be greater than zero." };
    }
    if (!statusOrder.includes(status)) return { error: "Choose a valid status." };
    if (!categoryId || !state.categories.some((category) => String(category.id) === categoryId)) return { error: "Choose a valid category." };

    let actualAmount = null;
    if (actualAmountValue !== "") {
      actualAmount = Number(actualAmountValue);
      if (!Number.isFinite(actualAmount) || actualAmount < 0.01) {
        return { error: "Actual amount must be greater than zero." };
      }
    }
    if (status === "completed" && actualAmount === null) {
      return { error: "Actual amount is required when status is Completed." };
    }

    return {
      payload: {
        title: description,
        planned_amount: plannedAmount,
        actual_amount: actualAmount,
        category_id: categoryId,
        status,
      },
    };
  }

  async function createPlannedExpense(event) {
    event.preventDefault();
    hideAlert("plannerFormAlert");
    const result = readForm();
    if (result.error) return showAlert("plannerFormAlert", result.error);
    const button = byId("addPlannedExpenseBtn");
    setBusy(button, true, '<span class="spinner-border spinner-border-sm me-2"></span>Adding...');
    const { error } = await supabaseClient.from("planned_expenses").insert({
      ...result.payload, user_id: state.user.id, month: monthFirstDay(),
    });
    setBusy(button, false);
    if (error) return showAlert("plannerFormAlert", error.message);
    byId("plannedExpenseForm").reset();
    byId("plannedStatus").value = "tentative";
    await loadPlannedExpenses();
    showAlert("plannerAlert", "Planned expense added successfully.", "success");
  }

  function openEditModal(item) {
    hideAlert("editPlannerAlert");
    byId("editPlannedId").value = item.id;
    byId("editPlannedAmount").value = item.planned_amount;
    byId("editPlannedActualAmount").value = item.actual_amount == null ? "" : item.actual_amount;
    populateCategorySelect("editPlannedCategory", item.category_id);
    byId("editPlannedStatus").value = item.status;
    byId("editPlannedDescription").value = item.title;
    bootstrap.Modal.getOrCreateInstance(byId("editPlannedExpenseModal")).show();
  }

  async function updatePlannedExpense(event) {
    event.preventDefault();
    hideAlert("editPlannerAlert");
    const result = readForm("edit");
    if (result.error) return showAlert("editPlannerAlert", result.error);
    const { error } = await supabaseClient
      .from("planned_expenses")
      .update(result.payload)
      .eq("id", byId("editPlannedId").value)
      .eq("user_id", state.user.id)
      .eq("month", monthFirstDay());
    if (error) return showAlert("editPlannerAlert", error.message);
    bootstrap.Modal.getInstance(byId("editPlannedExpenseModal"))?.hide();
    await loadPlannedExpenses();
    showAlert("plannerAlert", "Planned expense updated successfully.", "success");
  }

  async function deletePlannedExpense(item) {
    if (!window.confirm(`Delete "${item.title}"? This cannot be undone.`)) return;
    const { error } = await supabaseClient
      .from("planned_expenses")
      .delete()
      .eq("id", item.id)
      .eq("user_id", state.user.id)
      .eq("month", monthFirstDay());
    if (error) return showAlert("plannerAlert", error.message);
    await loadPlannedExpenses();
    showAlert("plannerAlert", "Planned expense deleted successfully.", "success");
  }

  function wireEvents() {
    byId("plannedExpenseForm").addEventListener("submit", createPlannedExpense);
    byId("editPlannedExpenseForm").addEventListener("submit", updatePlannedExpense);
    byId("plannerStatusFilter").addEventListener("change", renderItems);
    byId("plannerCategoryFilter").addEventListener("change", renderItems);
    byId("prevMonthBtn").addEventListener("click", async () => {
      state.viewedMonth = new Date(state.viewedMonth.getFullYear(), state.viewedMonth.getMonth() - 1, 1);
      byId("viewedMonthLabel").textContent = formatMonth();
      await loadPlannedExpenses();
    });
    byId("nextMonthBtn").addEventListener("click", async () => {
      state.viewedMonth = new Date(state.viewedMonth.getFullYear(), state.viewedMonth.getMonth() + 1, 1);
      byId("viewedMonthLabel").textContent = formatMonth();
      await loadPlannedExpenses();
    });
    byId("plannerTableBody").addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const item = state.items.find((entry) => entry.id === button.closest("[data-planned-id]").dataset.plannedId);
      if (!item) return;
      if (button.dataset.action === "edit") openEditModal(item);
      if (button.dataset.action === "delete") deletePlannedExpense(item);
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (!byId("plannedExpenseForm")) return;
    byId("viewedMonthLabel").textContent = formatMonth();
    wireEvents();
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    state.user = user;
    await window.getUserCurrency();
    try {
      await loadCategories();
    } catch (error) {
      populateCategorySelect("plannedCategory");
      populateCategorySelect("editPlannedCategory");
      showAlert("plannerAlert", `Categories could not be loaded: ${error.message}`);
    }
    await loadPlannedExpenses();
  });
})();
