-- RLS initplan pass (advisor: auth_rls_initplan, multiple_permissive_policies).
--
-- Every bare auth.uid() in a policy is re-evaluated per row; wrapping it as
-- (select auth.uid()) lets the planner evaluate it once per query. Expressions
-- are otherwise copied verbatim from pg_policies. Policies whose predicate is
-- has_household_access(...) only are untouched (nothing to initplan there).
--
-- Also drops household_access.p_access_mod (FOR ALL) in favor of separate
-- insert/update/delete policies: its SELECT arm duplicated p_access_sel
-- (whose owner-check disjunct already grants the same rows), so SELECT
-- semantics are unchanged and the double policy evaluation goes away.

-- ── advocacy_workflows ───────────────────────────────────────
alter policy "Users can view own workflows" on advocacy_workflows
  using ((select auth.uid()) = user_id);
alter policy "Users can insert own workflows" on advocacy_workflows
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own workflows" on advocacy_workflows
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own workflows" on advocacy_workflows
  using ((select auth.uid()) = user_id);

-- ── cases ────────────────────────────────────────────────────
alter policy "Users can view own cases" on cases
  using ((select auth.uid()) = user_id);
alter policy "Users can insert own cases" on cases
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own cases" on cases
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own cases" on cases
  using ((select auth.uid()) = user_id);

-- ── deadlines ────────────────────────────────────────────────
alter policy "Users can view own case deadlines rows" on deadlines
  using (exists (
    select 1 from cases c
    where c.id = deadlines.case_id and c.user_id = (select auth.uid())
  ));

-- ── dispute_letters ──────────────────────────────────────────
alter policy "Users can view own letters" on dispute_letters
  using (exists (
    select 1 from cases c
    where c.id = dispute_letters.case_id and c.user_id = (select auth.uid())
  ));
alter policy "Users can insert own letters" on dispute_letters
  with check (exists (
    select 1 from cases c
    where c.id = dispute_letters.case_id and c.user_id = (select auth.uid())
  ));
alter policy "Users can update own letters" on dispute_letters
  using (exists (
    select 1 from cases c
    where c.id = dispute_letters.case_id and c.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from cases c
    where c.id = dispute_letters.case_id and c.user_id = (select auth.uid())
  ));
alter policy "Users can delete own letters" on dispute_letters
  using (exists (
    select 1 from cases c
    where c.id = dispute_letters.case_id and c.user_id = (select auth.uid())
  ));

-- ── dispute_outcomes ─────────────────────────────────────────
alter policy "Users can view own outcomes" on dispute_outcomes
  using ((select auth.uid()) = user_id);
alter policy "Users can insert own outcomes" on dispute_outcomes
  with check ((select auth.uid()) = user_id);
alter policy "Users can update own outcomes" on dispute_outcomes
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
alter policy "Users can delete own outcomes" on dispute_outcomes
  using ((select auth.uid()) = user_id);

-- ── households ───────────────────────────────────────────────
alter policy p_households on households
  using ((owner_user_id = (select auth.uid())) or has_household_access(id))
  with check (owner_user_id = (select auth.uid()));

-- ── household_access ─────────────────────────────────────────
alter policy p_access_sel on household_access
  using (
    (user_id = (select auth.uid()))
    or exists (
      select 1 from households h
      where h.id = household_access.household_id
        and h.owner_user_id = (select auth.uid())
    )
  );

drop policy p_access_mod on household_access;
create policy p_access_ins on household_access for insert
  with check (exists (
    select 1 from households h
    where h.id = household_access.household_id
      and h.owner_user_id = (select auth.uid())
  ));
create policy p_access_upd on household_access for update
  using (exists (
    select 1 from households h
    where h.id = household_access.household_id
      and h.owner_user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from households h
    where h.id = household_access.household_id
      and h.owner_user_id = (select auth.uid())
  ));
create policy p_access_del on household_access for delete
  using (exists (
    select 1 from households h
    where h.id = household_access.household_id
      and h.owner_user_id = (select auth.uid())
  ));

-- ── payments / profiles / subscriptions ──────────────────────
alter policy payments_select_own on payments
  using ((select auth.uid()) = user_id);
alter policy profiles_select_own on profiles
  using ((select auth.uid()) = user_id);
alter policy subscriptions_select_own on subscriptions
  using ((select auth.uid()) = user_id);
