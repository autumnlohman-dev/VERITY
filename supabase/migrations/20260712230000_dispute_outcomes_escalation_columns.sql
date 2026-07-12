-- Escalation groundwork on dispute_outcomes (per 2026-07-12 investigation):
-- link each outcome to the letter it answers, record which escalation level
-- produced it, capture the response event, and let guest outcomes be adopted
-- on login. Also closes the status vocabulary with a CHECK (all existing rows
-- are 'pending', verified before applying).

alter table public.dispute_outcomes
  add column if not exists letter_id uuid references public.dispute_letters(id) on delete set null,
  add column if not exists escalation_level text not null default 'first_dispute',
  add column if not exists response_received_at timestamptz,
  add column if not exists response_summary text,
  add column if not exists guest_claim_id text;

comment on column public.dispute_outcomes.letter_id is
  'The dispute_letters row this outcome answers; null for legacy/self-tracked outcomes.';
comment on column public.dispute_outcomes.escalation_level is
  'Which rung produced this outcome: first_dispute | appeal | regulator_complaint | credit_bureau_dispute | collector_dispute.';
comment on column public.dispute_outcomes.response_received_at is
  'When the provider/insurer/regulator response arrived (event timestamp, distinct from resolved_at).';
comment on column public.dispute_outcomes.guest_claim_id is
  'Originating guest claim id, so a pre-signup outcome can be adopted on login (mirrors bill_data.guest_claim_id).';

alter table public.dispute_outcomes
  drop constraint if exists dispute_outcomes_status_check;
alter table public.dispute_outcomes
  add constraint dispute_outcomes_status_check
  check (status in ('pending', 'in_progress', 'won', 'partial', 'lost', 'abandoned'));
