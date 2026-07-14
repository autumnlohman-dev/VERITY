-- Guest audit persistence: the audit a guest ran, saved server-side at audit
-- time and addressed by an unguessable token. Powers the read-only
-- /report/[token] page and, later, "email me this report". Until now guest
-- audits lived only in the guest's localStorage (lost on clear/other device).
--
-- Access model: service-role only. RLS is enabled with NO policies, so anon
-- and authenticated roles cannot touch the table; the API reads and writes
-- through the admin client and enforces expiry in code.

create table public.guest_audit_reports (
  id uuid primary key default gen_random_uuid(),
  token uuid not null default gen_random_uuid(),
  guest_session_id uuid,
  audit jsonb not null,
  audit_logic_version integer not null default 1,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint guest_audit_reports_token_key unique (token)
);

comment on table public.guest_audit_reports is
  'Guest audit results, token-addressed, service-role only; rows expire via expires_at.';

create index guest_audit_reports_guest_session_id_idx
  on public.guest_audit_reports (guest_session_id);
create index guest_audit_reports_expires_at_idx
  on public.guest_audit_reports (expires_at);

alter table public.guest_audit_reports enable row level security;

create trigger set_guest_audit_reports_updated_at
  before update on public.guest_audit_reports
  for each row execute function public.set_updated_at();
