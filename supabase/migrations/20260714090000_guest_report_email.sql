-- Email capture on guest audit reports: /api/email-report sends the report
-- link and records where it went, so lifecycle email (deadline reminders,
-- follow-ups) has an address to reach. Table remains service-role only (RLS
-- enabled, no policies), so the address is never client-readable.

alter table public.guest_audit_reports
  add column email text,
  add column email_sent_at timestamptz;

-- Lifecycle sends will filter on "captured an address, not yet expired".
create index guest_audit_reports_email_idx
  on public.guest_audit_reports (email)
  where email is not null;
