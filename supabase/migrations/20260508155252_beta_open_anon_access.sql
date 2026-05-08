-- Beta: drop NOT NULL on any public.* user_id columns and open RLS to
-- anonymous users on the tables and storage buckets the app touches.
--
-- Scope: cases, dispute_letters, storage.objects (bills bucket).
-- Reversal: restore the original auth.uid()-scoped policies and re-add
-- NOT NULL where appropriate. Original policy definitions are in git
-- history prior to this migration.
--
-- WARNING: after this migration, any anonymous client with the project's
-- anon key can SELECT/INSERT/UPDATE/DELETE every row in the touched
-- tables and every object under the bills/ storage prefix. Existing
-- rows become world-readable. Re-tighten before any non-beta deploy.

begin;

-- ---------------------------------------------------------------------------
-- 1. Drop NOT NULL on any user_id columns in the public schema.
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.table_schema, c.table_name
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.column_name = 'user_id'
      and c.is_nullable = 'NO'
  loop
    execute format(
      'alter table %I.%I alter column user_id drop not null',
      r.table_schema, r.table_name
    );
  end loop;
end$$;

-- ---------------------------------------------------------------------------
-- 2. Replace existing user-scoped policies on public.cases with permissive
--    policies that allow anon and authenticated to do anything.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can view own cases"   on public.cases;
drop policy if exists "Users can insert own cases" on public.cases;
drop policy if exists "Users can update own cases" on public.cases;
drop policy if exists "Users can delete own cases" on public.cases;
drop policy if exists "beta anon all access cases" on public.cases;

create policy "beta anon all access cases"
  on public.cases
  as permissive
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 3. Replace existing user-scoped policies on public.dispute_letters.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can view own letters"   on public.dispute_letters;
drop policy if exists "Users can insert own letters" on public.dispute_letters;
drop policy if exists "Users can update own letters" on public.dispute_letters;
drop policy if exists "Users can delete own letters" on public.dispute_letters;
drop policy if exists "beta anon all access dispute_letters" on public.dispute_letters;

create policy "beta anon all access dispute_letters"
  on public.dispute_letters
  as permissive
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 4. Storage: replace authenticated-only policies on the bills bucket
--    with anon + authenticated full-access policies scoped to bucket_id.
-- ---------------------------------------------------------------------------
drop policy if exists "Users can view their own bills 1jt6j0_0"   on storage.objects;
drop policy if exists "Users can upload their own bills 1jt6j0_0" on storage.objects;
drop policy if exists "Users can delete their own bills 1jt6j0_0" on storage.objects;
drop policy if exists "Users can delete their own bills 1jt6j0_1" on storage.objects;
drop policy if exists "beta anon all access bills bucket"         on storage.objects;

create policy "beta anon all access bills bucket"
  on storage.objects
  as permissive
  for all
  to anon, authenticated
  using (bucket_id = 'bills')
  with check (bucket_id = 'bills');

commit;
