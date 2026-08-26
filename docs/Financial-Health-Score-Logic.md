# Financial Health Score Logic

## Document status

This document is the canonical developer specification for the agreed Financial Health Score logic. At the time this document was written, Wallet Check did not contain a Financial Health Score calculation module or UI implementation. Therefore, the rules below describe the final agreed scope rather than claiming that named health-score functions already exist.

Existing Wallet Check source files and database fields that establish the relevant financial semantics are listed in [Relevant existing sources](#relevant-existing-sources).

## Purpose

The Financial Health Score summarizes a user's performance for the latest fully completed calendar month. It combines four independently calculated components:

| Component | Original weight |
|---|---:|
| Budgeting | 30% |
| Saving | 30% |
| Spending Consistency | 20% |
| Goals | 20% |

When all four components are available:

```text
Overall Score =
    Budgeting × 0.30
  + Saving × 0.30
  + Spending Consistency × 0.20
  + Goals × 0.20
```

Each component and the final score are clamped to the inclusive range `0–100`. Calculations should retain their unrounded values internally. Values are rounded only for display.

## Score month selection

The score is based on the latest fully completed calendar month, not the current partial month.

For example, if today is August 23, 2026:

```text
Score month:       July 1–31, 2026
Comparison month:  June 1–30, 2026
```

The immediately preceding calendar month is selected even when it has incomplete data. The calculation must not silently skip backward to a different month with more data. Missing data is handled through component availability and weight rebalancing.

All historical calculations use the score month's inclusive final date as their cutoff. A contribution or goal created after that cutoff must not affect that month's score.

## Expense scopes at a glance

The components deliberately do not all use the same expense scope:

| Calculation | Included expenses | Excluded expenses |
|---|---|---|
| Budgeting adherence | Expenses in categories where `include_in_budget = true` and a category budget is configured, and `expense_type != 'saving'` | Categories where `include_in_budget = false`; unbudgeted categories are handled by Coverage instead; `expense_type = 'saving'` rows |
| Budget Coverage | All expenses in categories where `include_in_budget = true` and `expense_type != 'saving'` | Categories where `include_in_budget = false`; `expense_type = 'saving'` rows |
| Saving | All expenses classified `expense_type = 'expense'` (or legacy/null, which defaults to `'expense'`) in the scored month | `expense_type = 'saving'` rows; none excluded based on `include_in_budget` |
| Spending Consistency | Daily expenses in categories where `include_in_budget = true` and `expense_type != 'saving'` | Categories where `include_in_budget = false`; `expense_type = 'saving'` rows |

The `include_in_budget` flag affects only budget-related measurements. It must never remove an expense from Saving.

`expense_type` is a separate, per-expense classification (`'expense'` | `'saving'`, defaulting to `'expense'`) recording whether the user marked the entry as genuine spending or money intentionally set aside. Unlike `include_in_budget`, an `expense_type = 'saving'` row is excluded consistently everywhere real spending is measured — Budgeting, Budget Coverage, Spending Consistency, *and* the Saving component's own expense subtraction — because the classification is a statement about what the money is (reserved/transferred, not consumed), not something scoped to a single component. Both classifications still reduce Balance/Spent identically; `expense_type` never affects cash-flow tracking, only which score components treat the money as spent.

## Budgeting score

Budgeting measures two related behaviors:

1. How closely spending followed configured category budgets.
2. How much budget-relevant spending was covered by configured budgets.

```text
Budgeting Score =
    Weighted Category Adherence × 0.80
  + Budget Coverage × 0.20
```

### Eligible categories

Filter categories by `include_in_budget = true` before calculating the monthly budget, category adherence, or Budget Coverage.

Expenses in categories where `include_in_budget = false` have no effect on the Budgeting score.

### Category adherence

For each budget-enabled category with a configured budget:

```text
Category Adherence = 100                         when spending <= budget
Category Adherence = 100 × budget / spending    when spending > budget
```

Examples:

```text
Budget 1,000; spending 800   → 100
Budget 1,000; spending 1,000 → 100
Budget 1,000; spending 1,100 → 90.91
Budget 1,000; spending 2,000 → 50
```

A configured zero budget with positive spending produces an adherence score of `0`, provided the overall Budgeting component is otherwise available.

### Spending-weighted adherence

Category adherence must not be averaged equally. Equal averaging allows unused or financially insignificant categories to influence the result as much as categories containing most of the user's spending.

Weight each category by its actual spending:

```text
Weighted Category Adherence =
    Σ(Category Adherence × Category Spending)
    ───────────────────────────────────────────
              Σ(Category Spending)
```

Only spending in budget-enabled categories with configured budgets enters this weighted adherence calculation.

If configured budgets exist but total spending across those categories is zero, Weighted Category Adherence is `100`: there was no overspending to penalize.

#### Example

```text
Food:  budget 1,000; spending 1,200; adherence 83.33
Bills: budget 3,000; spending 3,000; adherence 100

Weighted Adherence =
    (83.33 × 1,200 + 100 × 3,000) / 4,200
  = 95.24
```

### Budget Coverage

Coverage measures whether budget-relevant spending occurred in categories that had configured budgets:

```text
Budget Coverage =
    Spending in budget-enabled categories with configured budgets
    ────────────────────────────────────────────────────────────── × 100
             All spending in budget-enabled categories
```

An expense in a category where `include_in_budget = true` but no category budget exists:

- Is excluded from Weighted Category Adherence.
- Remains in the Budget Coverage denominator.
- Therefore lowers Budget Coverage.

An expense in a category where `include_in_budget = false` appears in neither the numerator nor denominator.

If there is no budget-enabled spending and positive configured budgets exist, Coverage is `100`: no spending escaped the configured budgets.

### Budgeting availability

Budgeting is available only when the score month has a positive aggregate monthly budget across categories where `include_in_budget = true`.

If the aggregate budget is missing or not positive, Budgeting is unavailable (`—`), not zero.

## Saving score

Saving measures the percentage of monthly income retained after genuine spending:

```text
Savings Rate = (Income − Expense-classified Spending) / Income

Saving Score = clamp(Savings Rate / 0.20 × 100, 0, 100)
```

The `20%` savings rate is the benchmark for a perfect Saving score.

| Savings rate | Saving score |
|---:|---:|
| 0% or less | 0 |
| 5% | 25 |
| 10% | 50 |
| 15% | 75 |
| 20% or more | 100 |

### Saving expense scope

Saving uses all expenses classified `expense_type = 'expense'` (or legacy/null, which defaults to `'expense'`) in the scored month, regardless of `include_in_budget` — an expense in a category where `include_in_budget = false` still reduces the Saving score, since excluding it from budget tracking does not mean the money was not spent.

Expenses classified `expense_type = 'saving'` are excluded from this subtraction: they represent money the user intentionally set aside rather than spent, so any resulting leftover Balance is implicitly counted as retained, exactly as it already is for genuinely-unspent income. `include_in_budget` itself still has no effect on Saving; `expense_type` is the only classification that does.

### Saving availability

Saving is unavailable when monthly income is missing, zero, negative, or non-finite. It must not be assigned an artificial score of zero in those cases.

## Spending Consistency score

Spending Consistency measures how frequently daily budget-enabled spending remained within an evenly distributed daily target.

It uses the daily-target model, not cumulative spending pace.

### Daily target

```text
Budget-enabled Monthly Budget =
    Sum of category budgets where include_in_budget = true

Daily Target =
    Budget-enabled Monthly Budget / Days In Score Month
```

### Daily spending

For each calendar day in the score month:

```text
Daily Spend =
    Sum of expenses on that day whose categories have include_in_budget = true
```

Expenses from categories where `include_in_budget = false` must not consume the daily target or cause a failed day.

A day is successful when:

```text
Daily Spend <= Daily Target
```

No-spending days are successful.

### Component formula

```text
Spending Consistency =
    Successful Days / Days In Score Month × 100
```

Example:

```text
Monthly budget: 60,000
Days in month:  30
Daily target:   2,000
Successful days: 27

Spending Consistency = 27 / 30 × 100 = 90
```

Large one-off payments can fail an individual day. This is accepted in the agreed model because one such payment reduces the component by only one day, while cumulative pacing could penalize several subsequent days based solely on when the payment occurred.

The daily streak and this component use the same definition of a successful day but answer different questions:

- The streak measures uninterrupted consecutive behavior.
- Spending Consistency measures successful days across the full month.

### Spending Consistency availability

Spending Consistency is available only when the score month has a positive aggregate budget across budget-enabled categories. Otherwise it is unavailable (`—`).

## Goals score

Goals measures progress as it actually stood at the end of the score month. Future contributions and goals created later must not alter historical scores.

### Historically eligible goals

A goal may enter the score-month calculation only when:

- It was created on or before the score month's final date.
- Its target amount is positive and finite.
- It passes the applicable dated or undated goal safeguards below.

Contributions are included only when:

```text
contribution_date <= score month end
```

Contributions dated after the month-end cutoff must not affect the historical Actual Progress.

### Dated goals

For a goal with a target date:

```text
Total Duration = Target Date − Goal Start

Elapsed Duration =
    min(Score Month End, Target Date) − Goal Start

Expected Progress = Elapsed Duration / Total Duration

Actual Progress =
    Contributions through Score Month End / Target Amount

Goal Score =
    clamp(Actual Progress / Expected Progress × 100, 0, 100)
```

Using `min(Score Month End, Target Date)` makes Expected Progress equal `100%` after the target date has passed.

#### Example

If a goal was expected to be 50% complete by the score month end but was actually 40% complete:

```text
Goal Score = 40% / 50% × 100 = 80
```

### Dated-goal safeguards

Exclude a dated goal from that month's Goals component when any of the following is true:

- Target amount is zero, negative, or non-finite.
- The goal was created after the score month.
- Total Duration is zero, negative, or non-finite.
- Elapsed Duration is zero or negative.
- Expected Progress is zero, negative, or non-finite.
- Actual Progress or the resulting Goal Score is non-finite.

Exclusion is preferable to assigning an artificial zero. In particular, a goal created on the final day of the score month may not yet have enough elapsed duration for a meaningful schedule comparison.

### Goals without target dates

An eligible goal without a target date uses raw completion percentage:

```text
Goal Score =
    clamp(Contributions through Score Month End / Target Amount × 100, 0, 100)
```

No Expected Progress division is required.

### Combining goals

Average all historically eligible, mathematically valid goal scores equally:

```text
Goals Score = Σ(Eligible Goal Scores) / Eligible Goal Count
```

Goals are not weighted by target amount. Each goal represents one user commitment regardless of its monetary size.

If no goal remains eligible after applying the historical cutoff and safeguards, Goals is unavailable (`—`).

### Historical completion limitation

The existing goal model has a current `is_completed` flag but no reliable completion timestamp or status history. A current flag cannot establish whether a goal was already completed during a historical score month.

Therefore, this scope must not:

- Infer a completion date from the current `is_completed` value.
- Reconstruct or persist completion history.
- Exclude a goal from a historical month merely because it is currently completed.

Historical contributions reaching or exceeding the target naturally produce a score of `100` after clamping. Without reliable completion history, a previously completed goal may remain part of later historical calculations. This is an accepted limitation of the agreed scope.

## Missing data and weight rebalancing

Unavailable components do not become zero. Their original weights are removed and the remaining weights are normalized:

```text
Overall Score =
    Σ(Available Component Score × Original Weight)
    ─────────────────────────────────────────────────
              Σ(Available Original Weights)
```

Example:

```text
Budgeting: 80, weight 30
Saving:    70, weight 30
Spending:  unavailable
Goals:     90, weight 20

Overall = (80×30 + 70×30 + 90×20) / (30+30+20)
        = 6,300 / 80
        = 78.75
        = 79 when displayed as a whole number
```

### Component availability summary

| Component | Available when |
|---|---|
| Budgeting | A positive aggregate budget exists across budget-enabled categories |
| Saving | Monthly income is positive and finite |
| Spending Consistency | A positive aggregate budget exists across budget-enabled categories |
| Goals | At least one historically eligible and mathematically valid goal exists |

## Minimum data required for an overall score

Display an overall score only when both conditions are true:

1. At least one core component—Budgeting or Saving—is available.
2. At least one additional component is available.

Valid examples include:

```text
Budgeting + Saving
Budgeting + Spending Consistency
Budgeting + Goals
Saving + Spending Consistency
Saving + Goals
```

Goals alone, Spending Consistency alone, or Goals plus Spending Consistency without Budgeting or Saving are insufficient.

When the minimum is not met, the UI should show the individual available components but not manufacture an overall score.

## Previous-month comparison

The displayed point change compares the score month with the immediately preceding calendar month.

A comparison is valid only when:

- Both months satisfy the minimum-data rule.
- Both months have exactly the same set of available components.

Valid:

```text
July: Budgeting, Saving, Spending Consistency, Goals
June: Budgeting, Saving, Spending Consistency, Goals
```

Invalid:

```text
July: Budgeting, Saving, Spending Consistency, Goals
June: Saving, Goals
```

Do not compare differently composed scores. Do not create an intersection-only comparison score, because that delta would not correspond to the headline scores shown for the two months.

When the comparison is invalid, suppress the point delta. The UI may explain that comparison is unavailable because data coverage changed.

When valid:

```text
Point Change = Current Unrounded Overall − Previous Unrounded Overall
```

Round only the displayed point change. A positive result is an increase, a negative result is a decrease, and a rounded zero is unchanged.

## Explanation and deduction messages

Explanation wording must reflect what the available evidence proves.

### Valid decrease

Use wording such as:

```text
Your score decreased because…
```

only when:

- A valid previous-month comparison exists.
- The overall score decreased.
- The listed components or factors demonstrably worsened.

Only cite declining components. For example, do not claim Saving caused the decrease when its component score improved.

### Valid increase

When a valid comparison proves improvement, use:

```text
Your score improved because…
```

Only cite components that improved.

### No valid comparison

Without a valid comparison, use neutral current-state wording:

```text
What affected your score
```

Possible current-state explanations include:

- Savings rate was below the 20% benchmark.
- One or more categories exceeded their configured budgets.
- Some budget-enabled spending occurred in categories without budgets.
- A number of days exceeded the daily spending target.
- One or more goals were behind their expected progress.

These messages describe the score without falsely implying a month-to-month decline.

## Score labels

| Score | Label |
|---:|---|
| 90–100 | Excellent |
| 75–89 | Good |
| 60–74 | Fair |
| 40–59 | Needs attention |
| 0–39 | At risk |

Labels are based on the displayed overall score. Component scores may use the same bands where a textual component status is useful.

## Important safeguards and edge cases

- Clamp every component and the overall score to `0–100`.
- Reject or exclude non-finite inputs and outputs; `NaN` and `Infinity` must never enter the score.
- Preserve unrounded values until display.
- Do not treat unavailable data as a zero score.
- Do not skip backward to a more convenient score month when the latest completed month lacks data.
- Apply `include_in_budget` consistently to both sides of Budgeting and Spending Consistency calculations.
- Never apply `include_in_budget` to Saving.
- Exclude `expense_type = 'saving'` rows from Budgeting, Budget Coverage, Spending Consistency, and the Saving component's expense subtraction — this exclusion applies regardless of each category's `include_in_budget` flag, and regardless of any other component's inclusion rules.
- Treat spending exactly equal to a category budget or daily target as successful.
- Treat no-spending days as successful when Spending Consistency is available.
- Account for the actual number of days in the score month, including leap-year February.
- Count goal contributions only through the historical month-end cutoff.
- Exclude dated goals whose schedule cannot produce meaningful positive Expected Progress.
- Do not infer historical goal completion from a current boolean flag.
- Suppress previous-month comparisons when component availability differs.
- Use causal increase/decrease language only when a valid comparison supports it.

## Relevant existing sources

No Financial Health Score calculation source file or function existed when this specification was recorded. The following existing sources define the data and behavior that the score specification references:

### Budget and category semantics

- [`js/budgets.js`](../js/budgets.js)
  - `fetchCategories(userId)` reads categories and `include_in_budget`.
  - `fetchExpensesForMonth(userId, monthFirstDay)` reads monthly category spending.
  - `fetchCategoryBudgetsForMonth(userId, monthFirstDay)` reads configured category budgets.
  - `buildBudgetRows(categories, expenses, budgetRows)` associates category budgets and spending.
  - `getUsageMeta(budgetAmount, spentAmount)` defines existing per-category budget-status behavior.
  - `renderOverviewCards(rows)` calculates the existing overall monthly budget and spending totals.
- [`Supbase scripts/3-monthly budget categories.sql`](../Supbase%20scripts/3-monthly%20budget%20categories.sql) defines `category_budgets` and its monthly uniqueness rules.
- [`Supbase scripts/7 - category budget inclusion fix.sql`](../Supbase%20scripts/7%20-%20category%20budget%20inclusion%20fix.sql) defines and documents `categories.include_in_budget`.

### Daily spending and streak semantics

- [`js/spending-streaks.js`](../js/spending-streaks.js)
  - `calculateSpendingStreaks(...)` contains the existing daily-target and category-inclusion semantics used by the streak utility.
  - `fetchBudgetRows(userId)` and `fetchStreakData(userId)` read the budgets, categories, and expenses used by streak calculations.
- [`js/expenses.js`](../js/expenses.js)
  - `fetchMonthlyBudgetTotal(userId, monthFirstDay)` calculates the existing budget-enabled monthly budget total.
  - `toDateKey(date)` and `buildExpensesByDay()` provide existing local-day grouping behavior.

### Income, expenses, and month semantics

- [`js/income.js`](../js/income.js)
  - `getViewedMonthFirstDay()` and `getViewedMonthRange()` define the existing month-selection shape used on the Home page.
- [`js/dashboard.js`](../js/dashboard.js)
  - `fetchAllIncomes(userId)` and `fetchAllExpenses(userId)` read historical monthly finance data.
  - `getMonthKey(date)` and `buildMonthRange(startDate, endDate)` provide existing historical month grouping behavior.
- [`Supbase scripts/1-setup.sql`](../Supbase%20scripts/1-setup.sql) defines `monthly_incomes`, `expenses`, their monetary constraints, and expense timestamps.
- [`Supbase scripts/10 - expense classification.sql`](../Supbase%20scripts/10%20-%20expense%20classification.sql) defines `expenses.expense_type` (`'expense'` | `'saving'`, default `'expense'`).

### Goal semantics

- [`js/financial-goals.js`](../js/financial-goals.js) contains the existing goal and contribution UI/data behavior.
- [`Supbase scripts/4 - financial goals.sql`](../Supbase%20scripts/4%20-%20financial%20goals.sql) defines:
  - `financial_goals.created_at`, `target_amount`, `target_date`, and the current `is_completed` flag.
  - `goal_contributions.amount` and `contribution_date`.
  - Positive target and contribution constraints.
  - The absence of a historical goal-completion timestamp.

### Currency display

- [`js/currency.js`](../js/currency.js)
  - `getUserCurrency()` reads the user's currency preference.
  - `formatCurrency(amount)` provides the existing amount-display convention.

These sources establish the surrounding Wallet Check rules. They must not be interpreted as an existing Financial Health Score implementation.
