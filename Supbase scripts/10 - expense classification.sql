begin;

-- =========================================================
-- WALLET CHECK
-- PHASE 4.5 - EXPENSE CLASSIFICATION (EXPENSE VS SAVING)
-- =========================================================

-- =========================================================
-- 1. ADD COLUMN
-- =========================================================
-- Existing rows automatically backfill to 'expense' via the
-- column default (Postgres applies this without a table
-- rewrite/backfill step for ADD COLUMN ... NOT NULL DEFAULT).

alter table public.expenses
    add column if not exists expense_type text not null default 'expense';

-- =========================================================
-- 2. VALIDATION
-- =========================================================

alter table public.expenses
    drop constraint if exists expense_type_valid;

alter table public.expenses
    add constraint expense_type_valid
        check (expense_type in ('expense', 'saving'));

-- =========================================================
-- 3. COLUMN DOCUMENTATION
-- =========================================================

comment on column public.expenses.expense_type is
'Classifies an expense row as ordinary spending (''expense'') or money set aside as savings (''saving''). Both reduce Balance/Spent identically; only the Financial Health Score''s Budgeting, Saving, and Spending Consistency components (plus the Budgets page and spending streaks) treat them differently. Defaults to ''expense'' for all legacy rows.';

commit;
