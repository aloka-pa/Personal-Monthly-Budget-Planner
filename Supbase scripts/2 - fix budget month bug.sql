alter table public.expenses
add column if not exists budget_month date;

update public.expenses
set budget_month = date_trunc('month', expense_datetime)::date
where budget_month is null;
