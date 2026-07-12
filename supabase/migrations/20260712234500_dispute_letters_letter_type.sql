-- letter_type on dispute_letters: when appeal/regulator/credit-bureau/collector
-- letters ship, they land in this same table (staleness stamping included)
-- rather than a parallel one. Vocabulary matches
-- dispute_outcomes.escalation_level exactly so outcomes join to the letter
-- rung that produced them. Existing rows are all first dispute letters, so the
-- default backfills correctly.

alter table public.dispute_letters
  add column if not exists letter_type text not null default 'first_dispute';

comment on column public.dispute_letters.letter_type is
  'Which escalation rung this letter is: first_dispute | appeal | regulator_complaint | credit_bureau_dispute | collector_dispute. Matches dispute_outcomes.escalation_level.';

alter table public.dispute_letters
  drop constraint if exists dispute_letters_letter_type_check;
alter table public.dispute_letters
  add constraint dispute_letters_letter_type_check
  check (letter_type in ('first_dispute', 'appeal', 'regulator_complaint', 'credit_bureau_dispute', 'collector_dispute'));
