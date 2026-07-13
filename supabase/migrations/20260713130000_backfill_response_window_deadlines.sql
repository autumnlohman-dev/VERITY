-- One-time backfill: response_window deadlines for dispute_outcomes rows that
-- were dispatched (status='sent') before the deadline engine existed.
-- The 30-day interval mirrors RESPONSE_WINDOW_DAYS in
-- src/lib/deadlines/outcomeWindows.ts (defaults pending counsel review); this
-- is a point-in-time backfill, not a second source of truth going forward.
insert into public.deadlines (case_id, outcome_id, deadline_type, due_date, source, urgency, status)
select
  o.case_id,
  o.id,
  'response_window',
  (o.sent_at + interval '30 days')::date,
  '30 days from mail date ' || to_char(o.sent_at, 'YYYY-MM-DD'),
  case
    when (o.sent_at + interval '30 days')::date - current_date <= 7 then 'critical'
    when (o.sent_at + interval '30 days')::date - current_date <= 30 then 'high'
    when (o.sent_at + interval '30 days')::date - current_date <= 90 then 'moderate'
    else 'informational'
  end,
  'active'
from public.dispute_outcomes o
where o.status = 'sent'
  and o.sent_at is not null
  and o.case_id is not null
  and not exists (
    select 1 from public.deadlines d
    where d.outcome_id = o.id and d.deadline_type = 'response_window'
  );
