-- case_deadlines: persist what src/lib/deadlines/calculator.ts already computes
-- per render, so a nightly sweep can act on deadlines (urgency refresh,
-- reminders) and rows survive across devices. Per the 2026-07-12 outcome-
-- tracking investigation.
--
-- Write model mirrors the cases mail columns: rows are computed and written by
-- trusted server code only (service role bypasses RLS); clients get owner-
-- scoped read. audit_fingerprint reuses the letters/staleness pattern — when
-- the case's audit facts change, stale rows are recomputed rather than trusted.

create table public.case_deadlines (
  id            uuid primary key default gen_random_uuid(),
  case_id       uuid not null references public.cases(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  rule_key      text not null,            -- internal_appeal_commercial, fdcpa_validation, …
  trigger_date  date not null,
  deadline_date date not null,
  urgency       text not null,            -- recomputed by nightly sweep
  status        text not null default 'open',   -- open | met | missed | dismissed
  applicable_regulation text,
  audit_fingerprint     text,             -- staleness pattern: invalidate when audit facts change
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (case_id, rule_key, trigger_date)
);

alter table public.case_deadlines enable row level security;

-- Owner-scoped read only. No client insert/update/delete policies: deadline
-- rows are server-computed facts, written exclusively by service-role code.
create policy "Users can view own case deadlines"
  on public.case_deadlines for select
  to authenticated
  using (auth.uid() = user_id);
