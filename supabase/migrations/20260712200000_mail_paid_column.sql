-- mail_paid: the case's Certified Mail fulfillment entitlement, set by the
-- Stripe webhook when the "$59 Dispute Package + Certified Mail" product is
-- purchased. Like dispute_paid it must only ever be written by service-role
-- code: the C1 column-lock migration (20260612130000) revoked table-level
-- writes from authenticated/anon and re-granted per-column, so this new
-- column is client-unwritable by default — no extra grant work needed.
alter table public.cases
  add column if not exists mail_paid boolean not null default false;

comment on column public.cases.mail_paid is
  'Certified Mail fulfillment purchased for this case ($59 tier). Written only by the Stripe webhook (service role).';
