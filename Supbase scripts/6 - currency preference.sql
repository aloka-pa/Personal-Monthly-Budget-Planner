begin;

-- =========================================================
-- WALLET CHECK
-- PHASE 4.2 — PER-USER CURRENCY PREFERENCE (LKR / USD)
-- =========================================================
--
-- Currency is chosen once, on the user's first income entry (see
-- income.js), and stored on their profile row for the rest of the
-- app to read. Existing profiles are backfilled to LKR since that
-- is the only currency the app has supported so far; new profiles
-- are created with currency = NULL by the existing on_auth_user_created
-- trigger, which prompts the picker on their first income entry.
-- =========================================================


-- =========================================================
-- 1. ADD THE COLUMN
-- =========================================================

do $$
begin
    alter table public.profiles
    add column currency text null;
exception
    when duplicate_column then
        null;
end
$$;


do $$
begin
    alter table public.profiles
    add constraint profiles_currency_valid
    check (currency in ('LKR', 'USD'));
exception
    when duplicate_object then
        null;
end
$$;


comment on column public.profiles.currency is
'The user''s chosen currency (LKR or USD), picked once on their first income entry. NULL means not yet chosen.';


-- =========================================================
-- 2. BACKFILL EXISTING PROFILES TO LKR
--
-- Every profile that existed before this migration belongs to a
-- user who has only ever used the app in LKR.
-- =========================================================

update public.profiles
set currency = 'LKR'
where currency is null;

commit;
