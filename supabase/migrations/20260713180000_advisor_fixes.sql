-- Fixes from the Supabase advisor run after the July 2026 conventions pass.
--
-- 1. Pin search_path on set_updated_at (advisor: function_search_path_mutable).
--    The function body touches no schema objects, so an empty search_path is
--    safe and closes the search-path-hijack lint.
-- 2. Revoke RPC execute on fn_audit (advisor: SECURITY DEFINER executable by
--    anon/authenticated). It is a trigger function; nothing should call it
--    via /rest/v1/rpc. Trigger firing does not require EXECUTE at call time.
--    has_household_access is NOT touched: it is evaluated inside RLS policies
--    by the querying role, so revoking EXECUTE there would break those
--    policies.
-- 3. Remaining unindexed FKs the advisor flagged (missed in the first pass).

-- ── 1. Pin search_path ───────────────────────────────────────
alter function set_updated_at() set search_path = '';

-- ── 2. Lock down fn_audit RPC surface ────────────────────────
revoke execute on function fn_audit() from public, anon, authenticated;

-- ── 3. Remaining FK indexes ──────────────────────────────────
create index if not exists accumulator_state_member_id_idx
  on accumulator_state (member_id);
create index if not exists accumulator_state_plan_id_idx
  on accumulator_state (plan_id);
create index if not exists dispute_letters_source_outcome_id_idx
  on dispute_letters (source_outcome_id);
create index if not exists household_access_user_id_idx
  on household_access (user_id);
create index if not exists simulations_member_id_idx
  on simulations (member_id);
