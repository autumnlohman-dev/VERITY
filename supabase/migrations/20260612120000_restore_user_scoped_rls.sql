-- SECURITY FIX: restore per-user data isolation.
--
-- The beta migrations (20260508155252_beta_open_anon_access and
-- 20260611120000_dispute_outcomes_advocacy_workflows) replaced the original
-- auth.uid()-scoped policies with fully permissive `using (true)` policies for
-- BOTH the anon and authenticated roles on cases, dispute_letters,
-- dispute_outcomes, advocacy_workflows, and the bills storage bucket.
--
-- Effect of that posture: any client with the project anon key — including a
-- brand-new, unconfirmed signup whose session is null — could SELECT every
-- row in those tables. That is the cross-tenant data leak this migration
-- closes. After this runs, a row is visible/writable only to the authenticated
-- user who owns it (auth.uid() = user_id), or — for dispute_letters, which has
-- no user_id column — only to the owner of the linked case.
--
-- Guest (anonymous) usage is unaffected by design: the guest audit path
-- (/api/audit-guest) persists nothing and relies on localStorage, so anon no
-- longer needs any table access. Authenticated case creation, auditing, letter
-- generation, outcomes, and workflows all run with a user session and continue
-- to work under these policies.

begin;

-- ---------------------------------------------------------------------------
-- 1. cases — owner-only on every verb.
-- ---------------------------------------------------------------------------
drop policy if exists "beta anon all access cases" on public.cases;
drop policy if exists "Users can view own cases"   on public.cases;
drop policy if exists "Users can insert own cases" on public.cases;
drop policy if exists "Users can update own cases" on public.cases;
drop policy if exists "Users can delete own cases" on public.cases;

create policy "Users can view own cases"
  on public.cases for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own cases"
  on public.cases for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own cases"
  on public.cases for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own cases"
  on public.cases for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. dispute_letters — no user_id column; scope through the parent case so a
--    letter is reachable only by the owner of its case. Covers the INSERT done
--    by /api/generate-letter (which sets case_id only).
-- ---------------------------------------------------------------------------
drop policy if exists "beta anon all access dispute_letters" on public.dispute_letters;
drop policy if exists "Users can view own letters"   on public.dispute_letters;
drop policy if exists "Users can insert own letters" on public.dispute_letters;
drop policy if exists "Users can update own letters" on public.dispute_letters;
drop policy if exists "Users can delete own letters" on public.dispute_letters;

create policy "Users can view own letters"
  on public.dispute_letters for select
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = dispute_letters.case_id
        and c.user_id = auth.uid()
    )
  );

create policy "Users can insert own letters"
  on public.dispute_letters for insert
  to authenticated
  with check (
    exists (
      select 1 from public.cases c
      where c.id = dispute_letters.case_id
        and c.user_id = auth.uid()
    )
  );

create policy "Users can update own letters"
  on public.dispute_letters for update
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = dispute_letters.case_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cases c
      where c.id = dispute_letters.case_id
        and c.user_id = auth.uid()
    )
  );

create policy "Users can delete own letters"
  on public.dispute_letters for delete
  to authenticated
  using (
    exists (
      select 1 from public.cases c
      where c.id = dispute_letters.case_id
        and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. dispute_outcomes — owner-only. Guest outcomes (user_id null) live in
--    localStorage and are claimed under the user on login; anon no longer
--    writes here directly.
-- ---------------------------------------------------------------------------
drop policy if exists "beta anon all access dispute_outcomes" on public.dispute_outcomes;
drop policy if exists "Users can view own outcomes"   on public.dispute_outcomes;
drop policy if exists "Users can insert own outcomes" on public.dispute_outcomes;
drop policy if exists "Users can update own outcomes" on public.dispute_outcomes;
drop policy if exists "Users can delete own outcomes" on public.dispute_outcomes;

create policy "Users can view own outcomes"
  on public.dispute_outcomes for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own outcomes"
  on public.dispute_outcomes for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own outcomes"
  on public.dispute_outcomes for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own outcomes"
  on public.dispute_outcomes for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 4. advocacy_workflows — owner-only.
-- ---------------------------------------------------------------------------
drop policy if exists "beta anon all access advocacy_workflows" on public.advocacy_workflows;
drop policy if exists "Users can view own workflows"   on public.advocacy_workflows;
drop policy if exists "Users can insert own workflows" on public.advocacy_workflows;
drop policy if exists "Users can update own workflows" on public.advocacy_workflows;
drop policy if exists "Users can delete own workflows" on public.advocacy_workflows;

create policy "Users can view own workflows"
  on public.advocacy_workflows for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own workflows"
  on public.advocacy_workflows for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own workflows"
  on public.advocacy_workflows for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own workflows"
  on public.advocacy_workflows for delete
  to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. Storage: bills bucket — each user's files live under a folder named for
--    their uid (`${user.id}/...`, see the upload flow). Restrict to the owner.
-- ---------------------------------------------------------------------------
drop policy if exists "beta anon all access bills bucket" on storage.objects;
drop policy if exists "Users can view their own bills 1jt6j0_0"   on storage.objects;
drop policy if exists "Users can upload their own bills 1jt6j0_0" on storage.objects;
drop policy if exists "Users can delete their own bills 1jt6j0_0" on storage.objects;
drop policy if exists "Users can delete their own bills 1jt6j0_1" on storage.objects;

create policy "Users can view their own bills"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'bills'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can upload their own bills"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'bills'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update their own bills"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'bills'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'bills'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete their own bills"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'bills'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

commit;
