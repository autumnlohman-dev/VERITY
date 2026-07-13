-- Step 3 (deadline engine): outcome-driven deadlines. Distinct from
-- case_deadlines (20260712233000), which is reserved groundwork for persisting
-- the CBS regulatory-deadline calculator; THIS table tracks response and
-- escalation windows derived from dispute_outcomes dispatch/response events.
--
-- Write model matches case_deadlines: rows are server-computed (mail dispatch,
-- response intake, nightly sweep — all service-role); clients get owner-scoped
-- read via the parent case (this table has no user_id of its own).

create table public.deadlines (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references public.cases(id) on delete cascade,
  outcome_id    uuid references public.dispute_outcomes(id) on delete cascade,
  deadline_type text not null check (deadline_type in ('response_window', 'escalation_window', 'custom')),
  due_date      date not null,
  source        text not null,
  urgency       text not null default 'informational' check (urgency in ('critical', 'high', 'moderate', 'informational')),
  status        text not null default 'active' check (status in ('active', 'satisfied', 'expired', 'dismissed')),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

comment on column public.deadlines.source is
  'Human-readable basis, e.g. "30 days from mail date 2026-07-14".';

create index deadlines_case_id_idx on public.deadlines (case_id);
create index deadlines_active_due_idx on public.deadlines (due_date) where status = 'active';

alter table public.deadlines enable row level security;

-- Owner-scoped read through the parent case. No client write policies:
-- deadlines are server-computed facts (dispatch, response intake, sweep).
create policy "Users can view own case deadlines rows"
  on public.deadlines for select
  to authenticated
  using (exists (
    select 1 from public.cases c
    where c.id = deadlines.case_id and c.user_id = auth.uid()
  ));
