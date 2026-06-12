-- C1: column-level lock on the paid-unlock columns of public.cases.
--
-- dispute_paid / dispute_unlock_source / promo_code decide whether a case's
-- dispute package is unlocked. They must ONLY ever be written by trusted server
-- code running as the service role (the Stripe webhook and the promo-redeem
-- route both use createAdminClient()). Without this, a signed-in user (or anyone
-- with the public anon key) could PATCH their own case row via PostgREST and set
-- dispute_paid = true, unlocking the paid product for free — RLS gates the ROW,
-- not individual COLUMNS.
--
-- Postgres has no "revoke one column from a table grant": a table-level
-- UPDATE/INSERT grant implicitly covers every column, and a column-level REVOKE
-- cannot subtract from it. So we revoke the table-level write grants from the
-- client roles and re-grant them per-column on every column EXCEPT the three
-- protected ones. service_role keeps full table access and is untouched.
--
-- Side benefit: any column added to cases in the future is locked to the client
-- roles by default until explicitly granted.

revoke update on public.cases from authenticated, anon;
revoke insert on public.cases from authenticated, anon;

grant update (
  id, user_id, status, provider_name, insurance_type, amount_billed,
  amount_expected, amount_recovered, bill_data, errors_found, created_at,
  potential_savings, patient_info
) on public.cases to authenticated, anon;

grant insert (
  id, user_id, status, provider_name, insurance_type, amount_billed,
  amount_expected, amount_recovered, bill_data, errors_found, created_at,
  potential_savings, patient_info
) on public.cases to authenticated, anon;
