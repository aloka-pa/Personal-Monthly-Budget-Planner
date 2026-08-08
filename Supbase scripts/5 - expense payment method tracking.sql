begin;

-- =========================================================
-- WALLET CHECK
-- PHASE 4.1 — EXPENSE PAYMENT METHOD TRACKING
-- =========================================================


-- =========================================================
-- 1. PAYMENT METHOD ENUM
-- =========================================================

do $$
begin
    create type public.expense_payment_method as enum (
        'Cash',
        'Debit Card',
        'Credit Card',
        'Bank Transfer',
        'Koko',
        'MintPay',
        'Other'
    );
exception
    when duplicate_object then
        null;
end
$$;


-- =========================================================
-- 2. ADD OR NORMALISE expenses.payment_method
--
-- Existing records remain NULL.
-- If the column already exists as TEXT or another ENUM,
-- supported existing values are converted safely.
-- =========================================================

do $$
declare
    v_column_exists boolean;
    v_current_type text;
    v_invalid_count bigint;
begin
    select exists (
        select 1
        from information_schema.columns
        where table_schema = 'public'
          and table_name = 'expenses'
          and column_name = 'payment_method'
    )
    into v_column_exists;


    -- Add the nullable column when it does not yet exist.
    if not v_column_exists then
        alter table public.expenses
        add column payment_method public.expense_payment_method null;

        return;
    end if;


    -- Identify the existing column type.
    select
        case
            when data_type = 'USER-DEFINED'
                then udt_schema || '.' || udt_name
            else data_type
        end
    into v_current_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'expenses'
      and column_name = 'payment_method';


    -- Do nothing if it already uses the required enum.
    if v_current_type = 'public.expense_payment_method' then
        return;
    end if;


    -- Check whether the existing column contains unsupported
    -- non-NULL values before changing its type.
    execute $sql$
        select count(*)
        from public.expenses
        where payment_method is not null
          and lower(trim(payment_method::text)) not in (
              'cash',
              'debit card',
              'credit card',
              'bank transfer',
              'koko',
              'mintpay',
              'other'
          )
    $sql$
    into v_invalid_count;


    if v_invalid_count > 0 then
        raise exception
            'Cannot convert expenses.payment_method: % unsupported value(s) exist.',
            v_invalid_count;
    end if;


    -- Convert supported TEXT or existing ENUM values into the
    -- new Phase 4.1 enum while preserving NULL values.
    alter table public.expenses
    alter column payment_method drop default;

    alter table public.expenses
    alter column payment_method
    type public.expense_payment_method
    using (
        case
            when payment_method is null then null

            when lower(trim(payment_method::text)) = 'cash'
                then 'Cash'::public.expense_payment_method

            when lower(trim(payment_method::text)) = 'debit card'
                then 'Debit Card'::public.expense_payment_method

            when lower(trim(payment_method::text)) = 'credit card'
                then 'Credit Card'::public.expense_payment_method

            when lower(trim(payment_method::text)) = 'bank transfer'
                then 'Bank Transfer'::public.expense_payment_method

            when lower(trim(payment_method::text)) = 'koko'
                then 'Koko'::public.expense_payment_method

            when lower(trim(payment_method::text)) = 'mintpay'
                then 'MintPay'::public.expense_payment_method

            when lower(trim(payment_method::text)) = 'other'
                then 'Other'::public.expense_payment_method

            else null
        end
    );
end
$$;


-- =========================================================
-- 3. COLUMN DOCUMENTATION
-- =========================================================

comment on column public.expenses.payment_method is
'Optional payment method used for the expense. Existing expenses may remain NULL.';


commit;