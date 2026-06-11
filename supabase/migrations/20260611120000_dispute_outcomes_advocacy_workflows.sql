-- Dispute outcomes + advocacy workflows: move these two stores off of
-- localStorage-only persistence and into Postgres so they survive across
-- devices and become a queryable training corpus.
--
-- Scope: new tables public.dispute_outcomes and public.advocacy_workflows.
-- Both carry a case_id linkage to public.cases and a nullable user_id,
-- mirroring the beta anon-access pattern already applied to cases /
-- dispute_letters (see 20260508155252_beta_open_anon_access.sql).
--
-- WARNING: like the rest of the beta schema, RLS here is wide open to the
-- anon role — any client with the project anon key can read/write every
-- row. Re-tighten to auth.uid()-scoped policies before any non-beta deploy.

begin;

-- ---------------------------------------------------------------------------
-- 1. dispute_outcomes — one labeled record per tracked dispute. Feeds the
--    future Recovery Probability Score model. user_id nullable (guests),
--    case_id set null on case delete so labels outlive the originating case.
-- ---------------------------------------------------------------------------
create table if not exists public.dispute_outcomes (
  id                        uuid primary key default gen_random_uuid(),
  case_id                   uuid references public.cases(id) on delete set null,
  user_id                   uuid references auth.users(id) on delete set null,
  created_at                timestamptz not null default now(),
  resolved_at               timestamptz,
  discrepancy_type          text,
  discrepancy_severity      text,
  dollar_amount_disputed    numeric default 0,
  payer_name                text,
  payer_type                text,
  provider_name             text,
  state_of_service          text,
  regulations_cited         jsonb default '[]'::jsonb,
  documentation_completeness text,
  resolution_pathway_used   text,
  status                    text not null default 'pending',
  amount_recovered          numeric,
  days_to_resolution        integer,
  notes                     text
);

create index if not exists dispute_outcomes_case_id_idx on public.dispute_outcomes(case_id);
create index if not exists dispute_outcomes_user_id_idx on public.dispute_outcomes(user_id);

alter table public.dispute_outcomes enable row level security;

drop policy if exists "beta anon all access dispute_outcomes" on public.dispute_outcomes;
create policy "beta anon all access dispute_outcomes"
  on public.dispute_outcomes
  as permissive
  for all
  to anon, authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- 2. advocacy_workflows — autonomous Advocacy Agent state (Component N). One
--    workflow per case; triggers/actions stored as jsonb so the agent's
--    evolving shape needs no further migrations. case_id cascades on delete
--    (a workflow is meaningless without its case).
-- ---------------------------------------------------------------------------
create table if not exists public.advocacy_workflows (
  id                    uuid primary key default gen_random_uuid(),
  case_id               uuid references public.cases(id) on delete cascade,
  user_id               uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  status                text not null default 'active',
  current_step          integer not null default 1,
  total_dollar_at_stake numeric default 0,
  expected_recovery     numeric default 0,
  termination_reason    text,
  consumer_authorized   boolean not null default false,
  triggers              jsonb not null default '[]'::jsonb,
  actions               jsonb not null default '[]'::jsonb
);

create index if not exists advocacy_workflows_case_id_idx on public.advocacy_workflows(case_id);
create index if not exists advocacy_workflows_user_id_idx on public.advocacy_workflows(user_id);

alter table public.advocacy_workflows enable row level security;

drop policy if exists "beta anon all access advocacy_workflows" on public.advocacy_workflows;
create policy "beta anon all access advocacy_workflows"
  on public.advocacy_workflows
  as permissive
  for all
  to anon, authenticated
  using (true)
  with check (true);

commit;
