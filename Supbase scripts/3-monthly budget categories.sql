-- =========================================================
-- MONTHLY CATEGORY BUDGETS
-- =========================================================

create table if not exists public.category_budgets (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    -- Existing categories.id uses BIGINT
    category_id bigint not null
        references public.categories(id)
        on delete cascade,

    -- Store the first day of the selected month
    month date not null,

    budget_amount numeric(12, 2) not null,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint category_budget_amount_non_negative
        check (budget_amount >= 0),

    constraint category_budget_month_first_day
        check (month = date_trunc('month', month)::date),

    constraint unique_category_budget_per_month
        unique (user_id, category_id, month)
);


-- =========================================================
-- HELPFUL INDEXES
-- =========================================================

-- Supports loading all budgets for a user and selected month
create index if not exists category_budgets_user_month_idx
on public.category_budgets (user_id, month);

-- Supports category-based budget lookups
create index if not exists category_budgets_category_idx
on public.category_budgets (category_id);


-- =========================================================
-- AUTOMATIC updated_at HANDLING
-- =========================================================

create or replace function public.update_category_budget_updated_at()
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


drop trigger if exists set_category_budget_updated_at
on public.category_budgets;

create trigger set_category_budget_updated_at
before update on public.category_budgets
for each row
execute function public.update_category_budget_updated_at();


-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================

alter table public.category_budgets enable row level security;


-- Users can view only their own category budgets
drop policy if exists "Users can view their own category budgets"
on public.category_budgets;

create policy "Users can view their own category budgets"
on public.category_budgets
for select
to authenticated
using (
    user_id = (select auth.uid())
);


-- Users can insert budgets only for themselves and for
-- either a default category or one of their own categories
drop policy if exists "Users can create their own category budgets"
on public.category_budgets;

create policy "Users can create their own category budgets"
on public.category_budgets
for insert
to authenticated
with check (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.categories
        where categories.id = category_budgets.category_id
          and (
              categories.user_id is null
              or categories.user_id = (select auth.uid())
          )
    )
);


-- Users can update only their own budgets
drop policy if exists "Users can update their own category budgets"
on public.category_budgets;

create policy "Users can update their own category budgets"
on public.category_budgets
for update
to authenticated
using (
    user_id = (select auth.uid())
)
with check (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.categories
        where categories.id = category_budgets.category_id
          and (
              categories.user_id is null
              or categories.user_id = (select auth.uid())
          )
    )
);


-- Users can delete only their own budgets
drop policy if exists "Users can delete their own category budgets"
on public.category_budgets;

create policy "Users can delete their own category budgets"
on public.category_budgets
for delete
to authenticated
using (
    user_id = (select auth.uid())
);