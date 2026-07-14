-- Schema conventions pass (July 2026 audit).
--
-- 1. Index the NCCI reference tables: ncci_ptp_edits (443k rows) is filtered
--    by code_1/code_2 on every audit and had only its uuid PK index, so each
--    lookup was a full sequential scan.
-- 2. Dedupe ncci_mue_edits and enforce uniqueness on cpt_code. Duplicate rows
--    (20 codes, 7 with conflicting max_units) made getMUELimit's maybeSingle()
--    error out, silently disabling the MUE check for common codes like 99213.
--    Where duplicates conflict we keep the HIGHER max_units: MUE is a
--    unit-count ceiling used to flag over-billing, so the higher limit is the
--    conservative choice (never flags a line the stricter row would allow).
-- 3. Index remaining FK / lookup columns used by RLS and app filters.
-- 4. Drop case_deadlines: superseded by the deadlines table (2026-07-13);
--    zero rows, zero code references.
-- 5. Add updated_at to cases and dispute_letters, maintained by trigger.
--    (dispute_outcomes/deadlines set updated_at in app code, sometimes to
--    deliberate custom stamps, so they keep their app-managed columns.)

-- ── 1. NCCI PTP indexes ──────────────────────────────────────
create index if not exists ncci_ptp_edits_code_1_idx
  on ncci_ptp_edits (code_1);
create index if not exists ncci_ptp_edits_code_2_idx
  on ncci_ptp_edits (code_2);

-- ── 2. MUE dedupe + unique cpt_code ──────────────────────────
delete from ncci_mue_edits a
  using ncci_mue_edits b
  where a.cpt_code = b.cpt_code
    and (a.max_units < b.max_units
      or (a.max_units = b.max_units and a.id > b.id));

create unique index if not exists ncci_mue_edits_cpt_code_key
  on ncci_mue_edits (cpt_code);

create index if not exists ncci_mue_edits_cpt_code_idx
  on ncci_mue_edits (cpt_code);

-- ── 3. FK / lookup indexes ───────────────────────────────────
create index if not exists cases_user_id_idx
  on cases (user_id);
create index if not exists dispute_letters_case_id_idx
  on dispute_letters (case_id);
create index if not exists deadlines_outcome_id_idx
  on deadlines (outcome_id);
create index if not exists dispute_outcomes_letter_id_idx
  on dispute_outcomes (letter_id);
create index if not exists dispute_outcomes_parent_outcome_id_idx
  on dispute_outcomes (parent_outcome_id);
create index if not exists dispute_outcomes_guest_claim_id_idx
  on dispute_outcomes (guest_claim_id)
  where guest_claim_id is not null;
create index if not exists households_owner_user_id_idx
  on households (owner_user_id);

-- ── 4. Drop superseded case_deadlines ────────────────────────
drop table if exists case_deadlines;

-- ── 5. updated_at on cases + dispute_letters ─────────────────
alter table cases
  add column if not exists updated_at timestamptz not null default now();
alter table dispute_letters
  add column if not exists updated_at timestamptz not null default now();

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_cases_updated_at on cases;
create trigger trg_cases_updated_at
  before update on cases
  for each row execute function set_updated_at();

drop trigger if exists trg_dispute_letters_updated_at on dispute_letters;
create trigger trg_dispute_letters_updated_at
  before update on dispute_letters
  for each row execute function set_updated_at();
