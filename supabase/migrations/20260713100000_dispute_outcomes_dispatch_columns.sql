-- Step 1 of outcome persistence (build spec 2026-07-13): dispatch-time letter
-- tracking on dispute_outcomes. The table already existed (with the
-- investigation-report shape + escalation columns), so this reconciles the
-- build spec's proposed CREATE TABLE into a delta:
--   - letter_id uuid -> dispute_letters already exists (report shape kept);
--     the spec's text Lob id lands as lob_letter_id, matching cases.lob_letter_id.
--   - response_at exists as response_received_at (report shape kept).
--   - case_id stays nullable ON DELETE SET NULL (outcomes outlive cases).
--   - status keeps the six user-label values already in data/UI and ADDS the
--     spec's dispatch-lifecycle values; the CHECK is the union of both.

alter table public.dispute_outcomes
  add column if not exists lob_letter_id text,
  add column if not exists letter_version text,
  add column if not exists sent_at timestamptz,
  add column if not exists recipient_type text,
  add column if not exists recipient_name text,
  add column if not exists response_document_id uuid,
  add column if not exists updated_at timestamptz not null default now();

comment on column public.dispute_outcomes.lob_letter_id is
  'Lob letter id when the dispatch was mailed through Verity (mirrors cases.lob_letter_id).';
comment on column public.dispute_outcomes.letter_version is
  'Version stamp of the letter mailed: the dispute_letters audit_logic_version at dispatch.';
comment on column public.dispute_outcomes.sent_at is
  'Mail/dispatch timestamp (equals cases.mailed_at for Lob sends).';
comment on column public.dispute_outcomes.response_document_id is
  'Reserved: uploaded response document reference. No documents table exists yet (documents live in cases.bill_data), so this is a plain uuid until one does.';

alter table public.dispute_outcomes
  drop constraint if exists dispute_outcomes_recipient_type_check;
alter table public.dispute_outcomes
  add constraint dispute_outcomes_recipient_type_check
  check (recipient_type is null or recipient_type in ('provider', 'payer', 'regulator', 'credit_bureau', 'collector'));

-- Status union: user-label vocabulary (pending/in_progress/won/partial/lost/
-- abandoned — used by OutcomeFollowUp and all 7 existing rows) plus the
-- dispatch lifecycle (draft/sent/response_received/resolved/denied/
-- no_response/escalated). 'partial' is shared.
alter table public.dispute_outcomes
  drop constraint if exists dispute_outcomes_status_check;
alter table public.dispute_outcomes
  add constraint dispute_outcomes_status_check
  check (status in (
    'pending', 'in_progress', 'won', 'partial', 'lost', 'abandoned',
    'draft', 'sent', 'response_received', 'resolved', 'denied', 'no_response', 'escalated'
  ));
