// Global "Goal Progress" quick-view for the shared upper toolbar.
// Mirrors the progress formula used on the Financial Goals page and the
// dashboard goals widget: total contributions / target_amount * 100.
(function () {
  "use strict";

  const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  }[char]));

  function iconMarkup(icon) {
    if (!icon) return '<i class="bi bi-bullseye"></i>';
    if (/^bi-[a-z0-9-]+$/i.test(icon)) return `<i class="bi ${escapeHtml(icon)}"></i>`;
    return `<span aria-hidden="true">${escapeHtml(icon)}</span>`;
  }

  async function fetchActiveGoals(userId) {
    const [{ data: goals, error: goalsError }, { data: contributions, error: contributionsError }] =
      await Promise.all([
        supabaseClient
          .from("financial_goals")
          .select("id, goal_name, target_amount, icon, color")
          .eq("user_id", userId),
        supabaseClient
          .from("goal_contributions")
          .select("goal_id, amount")
          .eq("user_id", userId),
      ]);

    if (goalsError || contributionsError) throw goalsError || contributionsError;

    const savedByGoal = {};
    (contributions || []).forEach((item) => {
      savedByGoal[item.goal_id] = (savedByGoal[item.goal_id] || 0) + Number(item.amount);
    });

    return (goals || [])
      .map((goal) => {
        const saved = savedByGoal[goal.id] || 0;
        const target = Number(goal.target_amount);
        const progress = target > 0 ? (saved / target) * 100 : 0;
        return { ...goal, saved, target, progress };
      })
      .filter((goal) => goal.progress < 100)
      .sort((a, b) => b.progress - a.progress);
  }

  function panelMarkup() {
    return `
      <div class="goal-progress-layer" id="goalProgressLayer" hidden>
        <div class="goal-progress-backdrop" data-goal-progress-close aria-hidden="true"></div>
        <section class="goal-progress-panel" id="goalProgressPanel" role="dialog" aria-modal="true" aria-labelledby="goalProgressTitle" tabindex="-1">
          <div class="goal-progress-heading">
            <div class="goal-progress-title-wrap">
              <span class="goal-progress-title-icon" aria-hidden="true"><i class="bi bi-bullseye"></i></span>
              <div><h2 id="goalProgressTitle">Goal Progress</h2><p>Active goals, closest to complete first.</p></div>
            </div>
            <button class="goal-progress-close" type="button" data-goal-progress-close aria-label="Close goal progress" title="Close"><i class="bi bi-x-lg"></i></button>
          </div>

          <div class="goal-progress-loading" data-goal-progress-loading>
            <span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span>
            <span>Loading goal progress...</span>
          </div>

          <div class="goal-progress-error" data-goal-progress-error hidden>
            <i class="bi bi-exclamation-circle" aria-hidden="true"></i>
            <p>We couldn't load your goal progress.</p>
            <button type="button" class="btn btn-sm btn-outline-primary" data-goal-progress-retry>Try again</button>
          </div>

          <div class="goal-progress-empty" data-goal-progress-empty hidden>
            <i class="bi bi-bullseye" aria-hidden="true"></i>
            <p>No active goals</p>
          </div>

          <ul class="goal-progress-list" data-goal-progress-list hidden></ul>

          <a class="goal-progress-manage-link" href="financial-goals.html">Manage goals<i class="bi bi-chevron-right" aria-hidden="true"></i></a>
        </section>
      </div>`;
  }

  function goalItemMarkup(goal) {
    const clampedWidth = Math.min(goal.progress, 100);
    const clampedValueNow = Math.round(clampedWidth);
    const name = escapeHtml(goal.goal_name || "");
    return `
      <li class="goal-progress-item">
        <span class="goal-progress-icon" style="${goal.color ? `--goal-color:${escapeHtml(goal.color)}` : ""}">${iconMarkup(goal.icon)}</span>
        <div class="goal-progress-item-body">
          <div class="goal-progress-item-top">
            <span class="goal-progress-name text-truncate" title="${name}">${name}</span>
            <span class="goal-progress-pct">${goal.progress.toFixed(1)}%</span>
          </div>
          <div class="progress goal-progress-bar-track" role="progressbar" aria-label="${name} progress" aria-valuenow="${clampedValueNow}" aria-valuemin="0" aria-valuemax="100">
            <div class="progress-bar" style="width:${clampedWidth}%"></div>
          </div>
        </div>
      </li>`;
  }

  function setupGoalProgress() {
    const calculatorTrigger = document.getElementById("walletCalculatorToggle");
    const headerActions = document.querySelector(".top-header .app-shell");
    if (!calculatorTrigger || !headerActions || document.getElementById("goalProgressToggle")) return;

    const trigger = document.createElement("button");
    trigger.className = "header-action header-utility-action goal-progress-trigger";
    trigger.id = "goalProgressToggle";
    trigger.type = "button";
    trigger.title = "View active goal progress";
    trigger.setAttribute("aria-label", "View active goal progress");
    trigger.setAttribute("aria-haspopup", "dialog");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", "goalProgressPanel");
    trigger.innerHTML = '<i class="bi bi-bullseye" aria-hidden="true"></i>';
    headerActions.insertBefore(trigger, calculatorTrigger);

    document.body.insertAdjacentHTML("beforeend", panelMarkup());
    const layer = document.getElementById("goalProgressLayer");
    const panel = document.getElementById("goalProgressPanel");
    const loading = layer.querySelector("[data-goal-progress-loading]");
    const errorState = layer.querySelector("[data-goal-progress-error]");
    const emptyState = layer.querySelector("[data-goal-progress-empty]");
    const list = layer.querySelector("[data-goal-progress-list]");

    let previouslyFocused = null;
    let loadSequence = 0;
    let cache = { status: "idle", goals: [] };

    function showState(state) {
      loading.hidden = state !== "loading";
      errorState.hidden = state !== "error";
      emptyState.hidden = !(state === "content" && cache.goals.length === 0);
      list.hidden = !(state === "content" && cache.goals.length > 0);
    }

    function render() {
      list.innerHTML = cache.goals.map(goalItemMarkup).join("");
      showState("content");
    }

    async function loadGoalProgress() {
      const currentLoad = ++loadSequence;
      if (!layer.hidden) showState("loading");
      try {
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("No authenticated user");
        const goals = await fetchActiveGoals(user.id);
        if (currentLoad !== loadSequence) return;
        cache = { status: "ready", goals };
        if (!layer.hidden) render();
      } catch (error) {
        console.error("Failed to load goal progress:", error.message);
        if (currentLoad !== loadSequence) return;
        cache = { status: "error", goals: [] };
        if (!layer.hidden) showState("error");
      }
    }

    function openPanel() {
      previouslyFocused = document.activeElement;
      layer.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => {
        layer.classList.add("is-open");
        panel.focus();
      });
      if (cache.status === "ready") render();
      else loadGoalProgress();
    }

    function closePanel() {
      if (layer.hidden) return;
      loadSequence += 1;
      layer.classList.remove("is-open");
      layer.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      (previouslyFocused || trigger).focus();
    }

    trigger.addEventListener("click", () => (layer.hidden ? openPanel() : closePanel()));
    layer.addEventListener("click", (event) => {
      if (event.target.closest("[data-goal-progress-close]")) closePanel();
      if (event.target.closest("[data-goal-progress-retry]")) loadGoalProgress();
    });

    document.addEventListener("keydown", (event) => {
      if (layer.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        return closePanel();
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(panel.querySelectorAll("button:not([disabled]):not([hidden]), a[href]"));
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

    // Prefetch quietly so the panel already has data by the time it's opened.
    supabaseClient.auth.getUser().then(({ data: { user } }) => {
      if (user) loadGoalProgress();
    });

    window.WalletCheckGoalProgress = {
      refresh: loadGoalProgress,
    };
  }

  document.addEventListener("DOMContentLoaded", setupGoalProgress);
})();
