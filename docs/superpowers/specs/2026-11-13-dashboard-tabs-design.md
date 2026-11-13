# Dashboard Spending/Savings tabs + Financial Health Score removal

Date: 2026-11-13

## Intent

The dashboard's "Spending by Category Over Time" chart mixes genuine spending with money
set aside as savings, so savings show up as spending lines. Split the dashboard into two
tabs so spending and savings are each charted on their own. At the same time, remove the
Financial Health Score feature entirely.

"Savings" = expense rows with `expenses.expense_type = 'saving'` (the Expense/Saving toggle
on the add/edit expense form, migration 10). Categories have no savings flag and none is
added.

## Goals

- `dashboard.html` stays one page with two Bootstrap tabs: **Spending** (default) and **Savings**.
- Spending tab: per-category monthly line chart, `expense_type = 'expense'` rows only.
- Savings tab: Financial Goals widget (moved here, only shown on this tab) + monthly bars
  stacked by category for `expense_type = 'saving'` rows, with a "Total saved to date"
  cumulative line.
- Monthly Summary tiles appear on both tabs (rendered below the tab panes, shared). Tile
  "Out" keeps including savings — savings always reduce Balance (existing business rule).
- `dashboard.html#savings` / `#spending` deep-links to a tab; switching tabs updates the hash.
- Empty states per chart when there is no matching data.
- Remove the Financial Health Score: dashboard card, `js/financial-health-score.js`,
  `css/pages/financial-health-score.css`, `financial-health-guide.html`,
  `css/pages/financialHealthGuide.css`, `docs/Financial-Health-Score-Logic.md`.
- Reword the four "Saving Score" tooltips in `app.html`.
- README: keep Day 18–20 rows as history, marked removed; update intro sentence.

## Non-goals

- No database change. No change to Budgets, Planner, Streaks, sidebar.
- No change to monthly tile arithmetic.

## Approaches

1. **One page, Bootstrap tabs (chosen by user).** Single fetch, both charts from the same data.
2. Separate sub-pages with a sidebar group — rejected by user in favour of tabs.

## Builder notes (calls made)

- Charts in a hidden tab render at 0 width in Chart.js, so each chart is created the first
  time its tab is shown (`shown.bs.tab`).
- Savings chart design (stacked bars + cumulative line) was Claude's call.
