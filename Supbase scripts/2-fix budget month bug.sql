update expenses
set budget_month = date_trunc('month', expense_datetime)::date
where budget_month is null;