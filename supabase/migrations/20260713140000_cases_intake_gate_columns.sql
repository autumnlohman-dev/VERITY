-- Step 4 intake gates: the three facts that unlock escalation pathways.
-- On cases (not patient_info jsonb, which is client-writable, and not the
-- dormant household tables): these gate letter generation server-side, so they
-- follow the locked-column pattern — the C1 column-lock migration leaves new
-- cases columns client-unwritable by default; only the response-intake route
-- (service role) writes them.
alter table public.cases
  add column if not exists patient_state text,
  add column if not exists in_collections boolean,
  add column if not exists on_credit_report boolean;

comment on column public.cases.patient_state is
  'Patient state of residence (2-letter code); gates the state DOI complaint pathway. Null = not yet asked/skipped.';
comment on column public.cases.in_collections is
  'This bill has been sent to a collection agency; gates the FDCPA validation pathway. Null = not asked.';
comment on column public.cases.on_credit_report is
  'This debt appears on the patient''s credit report; gates the FCRA bureau-dispute pathway. Null = not asked.';
