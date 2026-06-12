-- M5: every case must have an owner; restore the NOT NULL on cases.user_id.
--
-- The beta open-access window (20260508155252_beta_open_anon_access) dropped the
-- constraint and left a couple of ownerless guest demo rows. Those rows are
-- invisible to every signed-in user anyway (RLS scopes by user_id), so purge
-- them, then re-assert the constraint. dispute_letters and advocacy_workflows
-- cascade-delete with the case; dispute_outcomes.case_id is set null by its FK.

delete from public.cases where user_id is null;

alter table public.cases alter column user_id set not null;
