-- Step 5 (cleanup): explicit escalation lineage.
--   dispute_outcomes.parent_outcome_id — the dispatch this one escalates from;
--     null for first letters. Replaces the "open denied/no_response dispatches
--     on the case" heuristic, which would mis-mark when a case holds two
--     escalatable dispatches.
--   dispute_letters.source_outcome_id — the outcome the draft was generated
--     FROM, recorded at draft creation so dispatch never has to infer it.
-- No backfill: nothing has ever been production-mailed.

alter table public.dispute_outcomes
  add column if not exists parent_outcome_id uuid references public.dispute_outcomes(id) on delete set null;

comment on column public.dispute_outcomes.parent_outcome_id is
  'The dispatch outcome this row escalates from; null for first letters.';

alter table public.dispute_letters
  add column if not exists source_outcome_id uuid references public.dispute_outcomes(id) on delete set null;

comment on column public.dispute_letters.source_outcome_id is
  'The outcome row that triggered this escalation draft; carried to parent_outcome_id at dispatch. Null for first letters.';
