begin;

-- =========================================================
-- WALLET CHECK
-- REMOVE LEGACY RECURRING EXPENSE FIELD
-- =========================================================

-- 1. Drop any index that might depend on is_recurring
drop index if exists idx_expenses_is_recurring;

-- 2. Drop any CHECK constraint that might reference is_recurring
alter table public.expenses
drop constraint if exists expenses_is_recurring_check;

-- 3. Drop the column safely
alter table public.expenses
drop column if exists is_recurring;

commit;