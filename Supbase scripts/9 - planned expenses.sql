begin;

-- =========================================================
-- WALLET CHECK
-- PHASE 5 — FINANCIAL PLANNER
-- =========================================================


-- =========================================================
-- 1. PLANNED EXPENSES
-- =========================================================

create table if not exists public.planned_expenses (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    month date not null,

    title text not null,

    estimated_amount numeric(12, 2) not null,

    category_id bigint
        references public.categories(id)
        on delete set null,

    status text not null
        default 'tentative',

    notes text,

    created_at timestamptz not null
        default now(),

    updated_at timestamptz not null
        default now(),

    -- Month represents a planning month rather than
    -- an arbitrary calendar date.
    constraint planned_expenses_month_first_day
        check (
            month = date_trunc('month', month)::date
        ),

    constraint planned_expenses_title_not_empty
        check (
            length(trim(title)) > 0
        ),

    constraint planned_expenses_title_length
        check (
            length(title) <= 200
        ),

    constraint planned_expenses_amount_non_negative
        check (
            estimated_amount >= 0
        ),

    constraint planned_expenses_status_valid
        check (
            status in (
                'tentative',
                'confirmed',
                'completed',
                'cancelled'
            )
        )
);


-- =========================================================
-- 2. INDEXES
-- =========================================================

-- Main month-navigator query:
-- user's planner entries for a selected month.
create index if not exists
    planned_expenses_user_month_idx
on public.planned_expenses (
    user_id,
    month
);


-- User-specific status filtering.
create index if not exists
    planned_expenses_user_status_idx
on public.planned_expenses (
    user_id,
    status
);


-- Category filtering / future planner analytics.
create index if not exists
    planned_expenses_category_idx
on public.planned_expenses (
    category_id
)
where category_id is not null;


-- =========================================================
-- 3. DEDICATED UPDATED_AT FUNCTION
-- =========================================================

create or replace function
    public.set_planned_expense_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;


-- =========================================================
-- 4. UPDATED_AT TRIGGER
-- =========================================================

drop trigger if exists
    set_planned_expenses_updated_at
on public.planned_expenses;

create trigger
    set_planned_expenses_updated_at
before update
on public.planned_expenses
for each row
execute function
    public.set_planned_expense_updated_at();


-- =========================================================
-- 5. ROW LEVEL SECURITY
-- =========================================================

alter table public.planned_expenses
enable row level security;


-- =========================================================
-- 6. SELECT
-- =========================================================

drop policy if exists
    "Users can view their own planned expenses"
on public.planned_expenses;

create policy
    "Users can view their own planned expenses"
on public.planned_expenses
for select
to authenticated
using (
    (select auth.uid()) = user_id
);


-- =========================================================
-- 7. INSERT
-- =========================================================

drop policy if exists
    "Users can create their own planned expenses"
on public.planned_expenses;

create policy
    "Users can create their own planned expenses"
on public.planned_expenses
for insert
to authenticated
with check (
    (select auth.uid()) = user_id

    and (
        category_id is null

        or exists (
            select 1
            from public.categories c
            where c.id = planned_expenses.category_id
              and (
                  c.user_id is null
                  or c.user_id = (select auth.uid())
              )
        )
    )
);


-- =========================================================
-- 8. UPDATE
-- =========================================================

drop policy if exists
    "Users can update their own planned expenses"
on public.planned_expenses;

create policy
    "Users can update their own planned expenses"
on public.planned_expenses
for update
to authenticated
using (
    (select auth.uid()) = user_id
)
with check (
    (select auth.uid()) = user_id

    and (
        category_id is null

        or exists (
            select 1
            from public.categories c
            where c.id = planned_expenses.category_id
              and (
                  c.user_id is null
                  or c.user_id = (select auth.uid())
              )
        )
    )
);


-- =========================================================
-- 9. DELETE
-- =========================================================

drop policy if exists
    "Users can delete their own planned expenses"
on public.planned_expenses;

create policy
    "Users can delete their own planned expenses"
on public.planned_expenses
for delete
to authenticated
using (
    (select auth.uid()) = user_id
);


commit;