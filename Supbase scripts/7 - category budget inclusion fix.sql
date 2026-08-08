begin;

-- =========================================================
-- WALLET CHECK
-- PHASE 4.4 — CATEGORY BUDGET INCLUSION
-- =========================================================


-- =========================================================
-- 1. ADD COLUMN
-- =========================================================

alter table public.categories
add column if not exists include_in_budget boolean default true;


-- =========================================================
-- 2. BACKFILL EXISTING DATA
-- =========================================================
-- Ensure all existing rows explicitly have TRUE (in case NULLs exist)

update public.categories
set include_in_budget = true
where include_in_budget is null;


-- =========================================================
-- 3. ENFORCE NOT NULL (after safe backfill)
-- =========================================================

alter table public.categories
alter column include_in_budget set not null;


-- =========================================================
-- 4. COLUMN DOCUMENTATION
-- =========================================================

comment on column public.categories.include_in_budget is
'Determines whether expenses in this category are included in budget calculations (TRUE = included, FALSE = ignored).';


commit;