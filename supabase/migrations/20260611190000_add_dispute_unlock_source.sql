-- Record HOW a case's dispute package was unlocked so paid and comped cases
-- stay distinguishable in the data. `dispute_paid` remains the single source of
-- truth for "is it unlocked"; these columns only capture provenance.
alter table public.cases
  add column if not exists dispute_unlock_source text,
  add column if not exists promo_code text;

comment on column public.cases.dispute_unlock_source is
  'How the dispute package was unlocked: payment | promo_code. NULL = legacy/unknown.';
comment on column public.cases.promo_code is
  'The beta promo code redeemed to comp this case, when dispute_unlock_source = promo_code.';
