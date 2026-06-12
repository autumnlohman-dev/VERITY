-- "Mail it for me" (Lob): persist the physical-mail state of a case's dispute
-- letter. These columns are written ONLY by trusted server code via the
-- service-role client (the /api/mail-letter route) — the status comes from Lob,
-- not the client. Because 20260612130000_lock_paid_unlock_columns.sql revoked the
-- table-level UPDATE/INSERT grants from the client roles and re-granted them
-- per-column, any NEW column (these) is automatically NOT writable by anon /
-- authenticated. We deliberately do NOT grant them — clients read these via the
-- existing SELECT grant (RLS still scopes rows to the owner) but cannot forge a
-- "mailed" state.

alter table public.cases
  add column if not exists lob_letter_id          text,
  add column if not exists mail_status            text,
  add column if not exists mail_expected_delivery date,
  add column if not exists mail_test_mode         boolean not null default false,
  add column if not exists mail_certified         boolean not null default false,
  add column if not exists mailed_at              timestamptz,
  add column if not exists mail_to                jsonb,
  add column if not exists mail_from              jsonb;

comment on column public.cases.lob_letter_id is
  'Lob letter object id (ltr_...) once the dispute letter has been sent to print/mail.';
comment on column public.cases.mail_status is
  'Mail lifecycle: submitted | test_mode | failed (plus any Lob status we sync later).';
comment on column public.cases.mail_test_mode is
  'True when created with a Lob TEST key — the letter is never physically mailed.';
