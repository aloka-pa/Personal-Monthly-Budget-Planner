# Dashboard Spending/Savings Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the dashboard into Spending/Savings tabs and remove the Financial Health Score.

**Architecture:** `dashboard.html` gets Bootstrap nav-tabs; `js/dashboard.js` fetches incomes + expenses once (now including `expense_type`), partitions expenses with a pure `splitExpensesByType()`, and lazily builds each tab's Chart.js chart on first `shown.bs.tab`. Monthly tiles render once below the tab panes.

**Tech Stack:** Static HTML, vanilla JS (bare top-level script), Bootstrap 5.3.3, Chart.js 4, Supabase JS 2.

**Spec:** `docs/superpowers/specs/2026-11-13-dashboard-tabs-design.md`

## Global Constraints

- No build step, no new dependencies, script load order preserved (minus `financial-health-score.js`).
- Saving = `normalize(expense_type) === "saving"`; anything else (incl. null/legacy) = expense.
- Monthly tile "Out" = all expenses (spending + saving); unchanged arithmetic.
- Colors only via CSS variables in new CSS; currency only via `window.formatCurrency`.

## Review Focus

- User with no saving rows → Savings tab shows empty state, no blank canvas.
- User with no expenses at all → both tabs show empty states; tiles still render current month.
- Hidden-tab chart sizing → savings chart must render correctly when opened after load / via `#savings`.
- Legacy rows with `expense_type` null → treated as spending.
- Expense with no category → "Uncategorized" in both charts.

---

### Task 1: Data split + charts in `js/dashboard.js`

**Files:** Modify `js/dashboard.js`, `dashboard.html`; Test: scratch Node script.

**Interfaces:**
- Produces: `splitExpensesByType(expenses) -> { spending: Expense[], saving: Expense[] }`,
  `buildCategoryTotalsByMonth(expenses) -> { totalsByMonth: {key:{cat:amount}}, categoryNames: string[] }`,
  `buildCumulativeSeries(months, totalsByMonth) -> number[]`.

- [ ] Node check: split of `[{expense_type:"saving"},{expense_type:"expense"},{expense_type:null}]` → 1 saving, 2 spending; cumulative of monthly totals `[100, 0, 50]` → `[100, 100, 150]`.
- [ ] Implement functions; select `expense_type` in `fetchAllExpenses`.
- [ ] `dashboard.html`: remove health-score card/CSS/script; add tabs (`#spending-tab`, `#savings-tab`), Savings pane holds goals widget + `#savingsTrendChart`; Spending pane holds `#categoryTrendChart`; tiles below panes; empty-state elements per chart.
- [ ] Lazy render on `shown.bs.tab`; hash deep-link `#spending` / `#savings`.
- [ ] Run Node check → pass.

### Task 2: Remove Financial Health Score

- [ ] Delete `js/financial-health-score.js`, `css/pages/financial-health-score.css`, `financial-health-guide.html`, `css/pages/financialHealthGuide.css`, `docs/Financial-Health-Score-Logic.md`.
- [ ] `grep -ri "health"` across repo → only README history rows / CLAUDE.md notes remain.
- [ ] Reword 4 "Saving Score" tooltips in `app.html`.

### Task 3: Docs, browser verification, commit + push

- [ ] README intro + Day 18–20 rows marked removed; new Day row for dashboard tabs. CLAUDE.md updated (left untracked).
- [ ] Serve locally, load `dashboard.html`, confirm no console errors from missing files (auth redirect expected without a session).
- [ ] Commit as Aloka Pathiraja <w2052008@westminster.ac.uk>, push `main` to origin.
