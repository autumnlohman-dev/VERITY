-- CHECK constraints for the older free-text status columns, matching the
-- style already used by deadlines.status / dispute_outcomes.status.
--
-- Constrained here:
--   cases.status              — values written by the audit pipeline
--   advocacy_workflows.status — the WorkflowStatus union in advocacyAgent.ts
--
-- Deliberately NOT constrained:
--   subscriptions.status / payments.status — these mirror Stripe's own status
--   enums, written verbatim by the webhook. A CHECK here would make webhook
--   processing fail if Stripe introduces or sends a status we didn't list.

alter table cases
  drop constraint if exists cases_status_check;
alter table cases
  add constraint cases_status_check check (
    status is null or status = any (array[
      'auditing'::text,
      'error_found'::text,
      'no_errors'::text,
      'letter_ready'::text
    ])
  );

alter table advocacy_workflows
  drop constraint if exists advocacy_workflows_status_check;
alter table advocacy_workflows
  add constraint advocacy_workflows_status_check check (
    status = any (array[
      'active'::text,
      'resolved'::text,
      'settled'::text,
      'escalated'::text,
      'abandoned'::text,
      'deadline_expired'::text
    ])
  );
