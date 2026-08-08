-- =========================================================
-- WALLET CHECK
-- PHASE 3 — FINANCIAL GOALS
-- =========================================================


-- =========================================================
-- 1. FINANCIAL GOALS TABLE
-- Stores the goal's metadata.
-- The current saved amount is NOT stored here.
-- It is calculated from goal_contributions.
-- =========================================================

create table if not exists public.financial_goals (
    id uuid primary key default gen_random_uuid(),

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    goal_name text not null,

    target_amount numeric(12, 2) not null,

    -- Nullable so users can create goals without a deadline.
    target_date date,

    priority text not null default 'medium',

    -- Optional emoji, icon name or icon class.
    icon text,

    -- Optional hexadecimal colour such as #0D6EFD.
    color text,

    notes text,

    is_completed boolean not null default false,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint financial_goal_name_not_empty
        check (length(trim(goal_name)) > 0),

    constraint financial_goal_name_length
        check (length(goal_name) <= 150),

    constraint financial_goal_target_positive
        check (target_amount > 0),

    constraint financial_goal_priority_valid
        check (
            priority in ('low', 'medium', 'high')
        ),

    constraint financial_goal_icon_length
        check (
            icon is null
            or length(icon) <= 100
        ),

    constraint financial_goal_color_valid
        check (
            color is null
            or color ~ '^#[0-9A-Fa-f]{6}$'
        ),

    constraint financial_goal_notes_length
        check (
            notes is null
            or length(notes) <= 2000
        ),

    -- Required for the composite foreign key from contributions.
    constraint financial_goals_id_user_unique
        unique (id, user_id)
);


-- =========================================================
-- 2. GOAL CONTRIBUTIONS TABLE
-- Stores every contribution made toward a financial goal.
-- =========================================================

create table if not exists public.goal_contributions (
    id uuid primary key default gen_random_uuid(),

    goal_id uuid not null,

    user_id uuid not null
        references auth.users(id)
        on delete cascade,

    amount numeric(12, 2) not null,

    contribution_date date not null default current_date,

    note text,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint goal_contribution_amount_positive
        check (amount > 0),

    constraint goal_contribution_note_length
        check (
            note is null
            or length(note) <= 1000
        ),

    -- Ensures the contribution's user_id matches the owner
    -- of the related financial goal.
    constraint goal_contributions_goal_owner_fk
        foreign key (goal_id, user_id)
        references public.financial_goals (id, user_id)
        on delete cascade
);


-- =========================================================
-- 3. INDEXES
-- =========================================================

-- Load all goals belonging to a user.
create index if not exists financial_goals_user_idx
on public.financial_goals (user_id);


-- Load goals by creation order.
create index if not exists financial_goals_user_created_idx
on public.financial_goals (user_id, created_at desc);


-- Supports sorting and filtering by deadline.
create index if not exists financial_goals_user_target_date_idx
on public.financial_goals (user_id, target_date);


-- Supports filtering by completion status.
create index if not exists financial_goals_user_completed_idx
on public.financial_goals (user_id, is_completed);


-- Load the contribution history for a goal.
create index if not exists goal_contributions_goal_date_idx
on public.goal_contributions (
    goal_id,
    contribution_date desc,
    created_at desc
);


-- Load all contributions belonging to a user.
create index if not exists goal_contributions_user_idx
on public.goal_contributions (user_id);


-- Supports contribution summaries by user and date.
create index if not exists goal_contributions_user_date_idx
on public.goal_contributions (
    user_id,
    contribution_date desc
);


-- =========================================================
-- 4. AUTOMATIC updated_at FUNCTION
-- One reusable function is used for both tables.
-- =========================================================

create or replace function public.set_updated_at()
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
-- 5. UPDATED_AT TRIGGERS
-- =========================================================

drop trigger if exists set_financial_goals_updated_at
on public.financial_goals;

create trigger set_financial_goals_updated_at
before update on public.financial_goals
for each row
execute function public.set_updated_at();


drop trigger if exists set_goal_contributions_updated_at
on public.goal_contributions;

create trigger set_goal_contributions_updated_at
before update on public.goal_contributions
for each row
execute function public.set_updated_at();


-- =========================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =========================================================

alter table public.financial_goals enable row level security;
alter table public.goal_contributions enable row level security;


-- =========================================================
-- 7. FINANCIAL GOALS RLS POLICIES
-- =========================================================

-- SELECT
drop policy if exists
    "Users can view their own financial goals"
on public.financial_goals;

create policy
    "Users can view their own financial goals"
on public.financial_goals
for select
to authenticated
using (
    user_id = (select auth.uid())
);


-- INSERT
drop policy if exists
    "Users can create their own financial goals"
on public.financial_goals;

create policy
    "Users can create their own financial goals"
on public.financial_goals
for insert
to authenticated
with check (
    user_id = (select auth.uid())
);


-- UPDATE
drop policy if exists
    "Users can update their own financial goals"
on public.financial_goals;

create policy
    "Users can update their own financial goals"
on public.financial_goals
for update
to authenticated
using (
    user_id = (select auth.uid())
)
with check (
    user_id = (select auth.uid())
);


-- DELETE
drop policy if exists
    "Users can delete their own financial goals"
on public.financial_goals;

create policy
    "Users can delete their own financial goals"
on public.financial_goals
for delete
to authenticated
using (
    user_id = (select auth.uid())
);


-- =========================================================
-- 8. GOAL CONTRIBUTIONS RLS POLICIES
-- =========================================================

-- SELECT
drop policy if exists
    "Users can view their own goal contributions"
on public.goal_contributions;

create policy
    "Users can view their own goal contributions"
on public.goal_contributions
for select
to authenticated
using (
    user_id = (select auth.uid())
);


-- INSERT
drop policy if exists
    "Users can create contributions for their own goals"
on public.goal_contributions;

create policy
    "Users can create contributions for their own goals"
on public.goal_contributions
for insert
to authenticated
with check (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.financial_goals
        where financial_goals.id =
              goal_contributions.goal_id
          and financial_goals.user_id =
              (select auth.uid())
    )
);


-- UPDATE
drop policy if exists
    "Users can update their own goal contributions"
on public.goal_contributions;

create policy
    "Users can update their own goal contributions"
on public.goal_contributions
for update
to authenticated
using (
    user_id = (select auth.uid())
)
with check (
    user_id = (select auth.uid())
    and exists (
        select 1
        from public.financial_goals
        where financial_goals.id =
              goal_contributions.goal_id
          and financial_goals.user_id =
              (select auth.uid())
    )
);


-- DELETE
drop policy if exists
    "Users can delete their own goal contributions"
on public.goal_contributions;

create policy
    "Users can delete their own goal contributions"
on public.goal_contributions
for delete
to authenticated
using (
    user_id = (select auth.uid())
);


-- =========================================================
-- 9. OPTIONAL VIEW FOR GOAL PROGRESS
-- Calculates saved, remaining and progress without storing
-- current_saved in financial_goals.
-- =========================================================

create or replace view public.financial_goal_progress
with (security_invoker = true)
as
select
    fg.id,
    fg.user_id,
    fg.goal_name,
    fg.target_amount,
    fg.target_date,
    fg.priority,
    fg.icon,
    fg.color,
    fg.notes,
    fg.is_completed,
    fg.created_at,
    fg.updated_at,

    coalesce(sum(gc.amount), 0)::numeric(12, 2)
        as saved_amount,

    (
        fg.target_amount -
        coalesce(sum(gc.amount), 0)
    )::numeric(12, 2)
        as remaining_amount,

    case
        when fg.target_amount <= 0 then 0
        else round(
            (
                coalesce(sum(gc.amount), 0)
                / fg.target_amount
            ) * 100,
            2
        )
    end as progress_percentage

from public.financial_goals fg

left join public.goal_contributions gc
    on gc.goal_id = fg.id
   and gc.user_id = fg.user_id

group by
    fg.id,
    fg.user_id,
    fg.goal_name,
    fg.target_amount,
    fg.target_date,
    fg.priority,
    fg.icon,
    fg.color,
    fg.notes,
    fg.is_completed,
    fg.created_at,
    fg.updated_at;