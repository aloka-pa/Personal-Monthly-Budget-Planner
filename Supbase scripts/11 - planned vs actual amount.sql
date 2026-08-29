begin;

-- =========================================================
-- WALLET CHECK
-- PHASE 5 — FINANCIAL PLANNER: PLANNED VS ACTUAL AMOUNT
-- =========================================================
--
-- Splits the single planned-expense amount into two values:
--   - planned_amount (renamed from estimated_amount): the
--     original estimate entered when the plan was created.
--   - actual_amount: what was actually spent. Filled in by the
--     user, typically once a plan is marked "completed".
--
-- Existing rows keep their estimated_amount value as
-- planned_amount via the rename below - no data is lost.
--
-- actual_amount is left NULL for every existing row, including
-- rows already marked "completed". We deliberately do not
-- fabricate or backfill a historical actual amount - there is no
-- reliable source for what those past expenses really cost. The
-- app treats a NULL actual_amount on a "completed" row as
-- "not yet recorded" and prompts the user to fill it in the next
-- time they edit that row.
-- =========================================================

alter table public.planned_expenses
    rename column estimated_amount to planned_amount;

alter table public.planned_expenses
    rename constraint planned_expenses_amount_non_negative
    to planned_expenses_planned_amount_non_negative;

alter table public.planned_expenses
    add column actual_amount numeric(12, 2);

alter table public.planned_expenses
    add constraint planned_expenses_actual_amount_non_negative
    check (
        actual_amount is null or actual_amount >= 0
    );

commit;
