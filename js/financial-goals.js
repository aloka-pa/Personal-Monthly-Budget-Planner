// Phase 3 Financial Goals: goal CRUD, contribution CRUD, progress, status, search and sorting.
(function () {
  const state = { user: null, goals: [], contributions: new Map(), activeGoalId: null };
  const priorityRank = { high: 0, medium: 1, low: 2 };

  const byId = (id) => document.getElementById(id);
  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));
  const formatMoney = (value) => window.formatCurrency(value);
  const localDate = () => {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const formatDate = (value) => value
    ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "No target date";

  function showAlert(elementId, message, type = "danger") {
    const alert = byId(elementId);
    if (!alert) return;
    alert.textContent = message;
    alert.className = `alert alert-${type}`;
    window.autoHideAlert?.(alert, 3500);
  }

  function contributionTotal(goalId) {
    return (state.contributions.get(goalId) || []).reduce((sum, item) => sum + Number(item.amount), 0);
  }

  function enrichGoal(goal) {
    const saved = contributionTotal(goal.id);
    const target = Number(goal.target_amount);
    const progress = target > 0 ? (saved / target) * 100 : 0;
    let status = "Not Started";
    if (saved >= target) status = "Completed";
    else if (goal.target_date && goal.target_date < localDate()) status = "Overdue";
    else if (saved > 0) status = "In Progress";
    return { ...goal, saved, remaining: Math.max(target - saved, 0), progress, status };
  }

  function iconMarkup(icon) {
    if (!icon) return '<i class="bi bi-bullseye"></i>';
    if (/^bi-[a-z0-9-]+$/i.test(icon)) return `<i class="bi ${escapeHtml(icon)}"></i>`;
    return `<span aria-hidden="true">${escapeHtml(icon)}</span>`;
  }

  function renderSummary(goals) {
    const totalTarget = goals.reduce((sum, goal) => sum + Number(goal.target_amount), 0);
    const totalSaved = goals.reduce((sum, goal) => sum + goal.saved, 0);
    byId("totalGoals").textContent = goals.length;
    byId("totalTarget").textContent = formatMoney(totalTarget);
    byId("totalSaved").textContent = formatMoney(totalSaved);
    byId("completedGoals").textContent = goals.filter((goal) => goal.status === "Completed").length;
  }

  function sortedFilteredGoals(goals) {
  const query = byId("goalSearch").value.trim().toLocaleLowerCase();
  const sort = byId("goalSort").value;
  const filtered = goals.filter((goal) => goal.goal_name.toLocaleLowerCase().includes(query));
  return filtered.sort((a, b) => {
    const aDone = a.status === "Completed" ? 1 : 0;
    const bDone = b.status === "Completed" ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone; // completed goals sink to the end

    if (sort === "progress") return b.progress - a.progress;
    if (sort === "priority") return priorityRank[a.priority] - priorityRank[b.priority];
    if (sort === "target_amount") return Number(b.target_amount) - Number(a.target_amount);
    if (sort === "newest") return new Date(b.created_at) - new Date(a.created_at);
    if (sort === "oldest") return new Date(a.created_at) - new Date(b.created_at);
    return (a.target_date || "9999-12-31").localeCompare(b.target_date || "9999-12-31");
  });
  }

  function goalCard(goal) {
    const progressWidth = Math.min(goal.progress, 100);
    const statusClass = goal.status.toLowerCase().replace(" ", "-");
    const col = document.createElement("div");
    col.className = "col-12 col-md-6 col-xxl-4";
    col.innerHTML = `
      <article class="card goal-card h-100" data-goal-id="${goal.id}">
        <div class="card-body d-flex flex-column">
          <div class="d-flex align-items-start gap-3 mb-3">
            <div class="goal-icon" style="${goal.color ? `--goal-color:${escapeHtml(goal.color)}` : ""}">${iconMarkup(goal.icon)}</div>
            <div class="min-w-0 flex-grow-1"><h2 class="h5 mb-1 text-truncate">${escapeHtml(goal.goal_name)}</h2><div class="d-flex flex-wrap gap-2"><span class="goal-badge priority-${goal.priority}">${escapeHtml(goal.priority)} priority</span><span class="goal-badge status-${statusClass}">${goal.status}</span></div></div>
            <div class="dropdown"><button class="btn btn-sm btn-outline-secondary goal-menu" type="button" data-bs-toggle="dropdown" aria-label="Goal actions"><i class="bi bi-three-dots"></i></button><ul class="dropdown-menu dropdown-menu-end"><li><button class="dropdown-item" data-action="edit"><i class="bi bi-pencil me-2"></i>Edit goal</button></li><li><button class="dropdown-item text-danger" data-action="delete"><i class="bi bi-trash me-2"></i>Delete goal</button></li></ul></div>
          </div>
          <div class="d-flex justify-content-between small mb-2"><span class="text-muted">Saved</span><strong>${formatMoney(goal.saved)} <span class="text-muted fw-normal">of ${formatMoney(goal.target_amount)}</span></strong></div>
          <div class="progress goal-progress mb-2" role="progressbar" aria-label="${escapeHtml(goal.goal_name)} progress" aria-valuenow="${Math.min(Math.round(goal.progress), 100)}" aria-valuemin="0" aria-valuemax="100"><div class="progress-bar" style="width:${progressWidth}%"></div></div>
          <div class="d-flex justify-content-between small mb-3"><strong>${goal.progress.toFixed(1)}%</strong><span class="text-muted">${formatMoney(goal.remaining)} remaining</span></div>
          ${goal.notes ? `<p class="goal-notes small text-muted">${escapeHtml(goal.notes)}</p>` : ""}
          <div class="d-flex align-items-center justify-content-between mt-auto pt-3 border-top"><span class="small text-muted"><i class="bi bi-calendar3 me-1"></i>${formatDate(goal.target_date)}</span><button class="btn btn-sm btn-primary" data-action="contribute"><i class="bi bi-plus-lg me-1"></i>Contribution</button></div>
        </div>
      </article>`;
    return col;
  }

  function render() {
    const enriched = state.goals.map(enrichGoal);
    renderSummary(enriched);
    const visible = sortedFilteredGoals(enriched);
    const grid = byId("goalGrid");
    grid.innerHTML = "";
    visible.forEach((goal) => grid.appendChild(goalCard(goal)));
    byId("goalsLoading").classList.add("d-none");
    grid.classList.toggle("d-none", visible.length === 0);
    byId("goalsEmpty").classList.toggle("d-none", state.goals.length !== 0);
    byId("goalsEmpty").classList.toggle("d-flex", state.goals.length === 0);
    const noResults = state.goals.length > 0 && visible.length === 0;
    byId("goalsNoResults").classList.toggle("d-none", !noResults);
    byId("goalsNoResults").classList.toggle("d-flex", noResults);
  }

  async function loadGoals() {
    const [{ data: goals, error: goalsError }, { data: contributions, error: contributionsError }] = await Promise.all([
      supabaseClient.from("financial_goals").select("*").eq("user_id", state.user.id),
      supabaseClient.from("goal_contributions").select("*").eq("user_id", state.user.id).order("contribution_date", { ascending: false }).order("created_at", { ascending: false }),
    ]);
    if (goalsError || contributionsError) throw goalsError || contributionsError;
    state.goals = goals || [];
    state.contributions.clear();
    (contributions || []).forEach((item) => {
      const group = state.contributions.get(item.goal_id) || [];
      group.push(item);
      state.contributions.set(item.goal_id, group);
    });
    render();
  }

  function openGoalModal(goal = null) {
    byId("goalForm").reset();
    byId("goalFormAlert").classList.add("d-none");
    byId("goalId").value = goal?.id || "";
    byId("goalName").value = goal?.goal_name || "";
    byId("goalTarget").value = goal?.target_amount || "";
    byId("goalDate").value = goal?.target_date || "";
    byId("goalPriority").value = goal?.priority || "medium";
    byId("goalIcon").value = goal?.icon || "";
    byId("goalNotes").value = goal?.notes || "";
    byId("goalModalTitle").textContent = goal ? "Edit Goal" : "Create Goal";
    bootstrap.Modal.getOrCreateInstance(byId("goalModal")).show();
  }

  async function saveGoal(event) {
    event.preventDefault();
    const id = byId("goalId").value;
    const target = Number(byId("goalTarget").value);
    if (!byId("goalName").value.trim() || target <= 0) return showAlert("goalFormAlert", "Enter a goal name and a target greater than zero.");
    const payload = {
      user_id: state.user.id, goal_name: byId("goalName").value.trim(), target_amount: target,
      target_date: byId("goalDate").value || null, priority: byId("goalPriority").value,
      icon: byId("goalIcon").value.trim() || null, notes: byId("goalNotes").value.trim() || null,
    };
    const query = id
      ? supabaseClient.from("financial_goals").update(payload).eq("id", id).eq("user_id", state.user.id)
      : supabaseClient.from("financial_goals").insert(payload);
    const { error } = await query;
    if (error) return showAlert("goalFormAlert", error.message);
    bootstrap.Modal.getInstance(byId("goalModal"))?.hide();
    await loadGoals();
    showAlert("goalsAlert", id ? "Goal updated." : "Goal created.", "success");
  }

  async function deleteGoal(goal) {
    if (!window.confirm(`Delete "${goal.goal_name}" and all of its contributions? This cannot be undone.`)) return;
    const { error } = await supabaseClient.from("financial_goals").delete().eq("id", goal.id).eq("user_id", state.user.id);
    if (error) return showAlert("goalsAlert", error.message);
    await loadGoals();
    showAlert("goalsAlert", "Goal deleted.", "success");
  }

  function resetContributionForm() {
    byId("contributionForm").reset();
    byId("contributionId").value = "";
    byId("contributionGoalId").value = state.activeGoalId || "";
    byId("contributionDate").value = localDate();
    byId("saveContributionBtn").textContent = "Add";
  }

  function renderContributions() {
    const list = byId("contributionList");
    const items = state.contributions.get(state.activeGoalId) || [];
    list.innerHTML = items.length ? "" : '<tr><td colspan="4" class="text-center text-muted py-4">No contributions yet.</td></tr>';
    items.forEach((item) => {
      const row = document.createElement("tr");
      row.dataset.contributionId = item.id;
      row.innerHTML = `<td>${formatDate(item.contribution_date)}</td><td>${escapeHtml(item.note || "—")}</td><td class="text-end fw-semibold">${formatMoney(item.amount)}</td><td class="text-end text-nowrap"><button class="btn btn-sm btn-outline-secondary me-1" data-contribution-action="edit" aria-label="Edit contribution"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger" data-contribution-action="delete" aria-label="Delete contribution"><i class="bi bi-trash"></i></button></td>`;
      list.appendChild(row);
    });
  }

  function openContributions(goal) {
    state.activeGoalId = goal.id;
    byId("contributionGoalName").textContent = goal.goal_name;
    byId("contributionAlert").classList.add("d-none");
    resetContributionForm();
    renderContributions();
    bootstrap.Modal.getOrCreateInstance(byId("contributionModal")).show();
  }

  async function saveContribution(event) {
    event.preventDefault();
    const id = byId("contributionId").value;
    const amount = Number(byId("contributionAmount").value);
    if (amount <= 0 || !byId("contributionDate").value) return showAlert("contributionAlert", "Enter an amount greater than zero and a date.");
    const payload = { goal_id: state.activeGoalId, user_id: state.user.id, amount, contribution_date: byId("contributionDate").value, note: byId("contributionNote").value.trim() || null };
    const query = id
      ? supabaseClient.from("goal_contributions").update(payload).eq("id", id).eq("user_id", state.user.id)
      : supabaseClient.from("goal_contributions").insert(payload);
    const { error } = await query;
    if (error) return showAlert("contributionAlert", error.message);
    await loadGoals();
    resetContributionForm();
    renderContributions();
    showAlert("contributionAlert", id ? "Contribution updated." : "Contribution added.", "success");
  }

  async function handleContributionAction(event) {
    const button = event.target.closest("[data-contribution-action]");
    if (!button) return;
    const id = button.closest("tr").dataset.contributionId;
    const item = (state.contributions.get(state.activeGoalId) || []).find((entry) => entry.id === id);
    if (!item) return;
    if (button.dataset.contributionAction === "edit") {
      byId("contributionId").value = item.id; byId("contributionAmount").value = item.amount;
      byId("contributionDate").value = item.contribution_date; byId("contributionNote").value = item.note || "";
      byId("saveContributionBtn").textContent = "Update";
      byId("contributionAmount").focus();
      return;
    }
    if (!window.confirm("Delete this contribution?")) return;
    const { error } = await supabaseClient.from("goal_contributions").delete().eq("id", id).eq("user_id", state.user.id);
    if (error) return showAlert("contributionAlert", error.message);
    await loadGoals();
    resetContributionForm();
    renderContributions();
    showAlert("contributionAlert", "Contribution deleted.", "success");
  }

  function wireEvents() {
    byId("createGoalBtn").addEventListener("click", () => openGoalModal());
    document.querySelector("[data-create-goal]").addEventListener("click", () => openGoalModal());
    byId("goalForm").addEventListener("submit", saveGoal);
    byId("contributionForm").addEventListener("submit", saveContribution);
    byId("contributionList").addEventListener("click", handleContributionAction);
    byId("goalSearch").addEventListener("input", render);
    byId("goalSort").addEventListener("change", render);
    byId("goalGrid").addEventListener("click", (event) => {
      const button = event.target.closest("[data-action]");
      if (!button) return;
      const goal = state.goals.find((item) => item.id === button.closest("[data-goal-id]").dataset.goalId);
      if (!goal) return;
      if (button.dataset.action === "edit") openGoalModal(goal);
      if (button.dataset.action === "delete") deleteGoal(goal);
      if (button.dataset.action === "contribute") openContributions(goal);
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    if (!byId("goalGrid")) return;
    wireEvents();
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;
    state.user = user;
    await window.getUserCurrency();
    try { await loadGoals(); } catch (error) {
      byId("goalsLoading").classList.add("d-none");
      showAlert("goalsAlert", `Unable to load financial goals: ${error.message}`);
    }
  });
})();
