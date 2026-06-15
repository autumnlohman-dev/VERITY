-- ============================================================
-- VERITY Family Profile persistence layer
-- Claim 15 / §7 (HIPAA PHI isolation gate)
-- All tables use household-scoped RLS.
-- PHI read-logging is handled app-side in route handlers /
-- Edge Functions; Postgres triggers only capture writes,
-- which is the correct scope for server-side audit trails.
-- Safe to re-run: IF NOT EXISTS / drop-create-policy throughout.
-- ============================================================

-- ── Access model ────────────────────────────────────────────

create table if not exists households (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users(id) on delete cascade,
  plan_year       int  not null,
  created_at      timestamptz not null default now()
);

create table if not exists household_access (
  household_id uuid not null references households(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member',
  primary key (household_id, user_id)
);

create table if not exists members (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  display_name  text,
  dob           date,
  relationship  text,
  is_subscriber boolean default false
);

create table if not exists plans (
  id                    uuid primary key default gen_random_uuid(),
  household_id          uuid not null references households(id) on delete cascade,
  plan_year             int  not null,
  payer_name            text,
  external_plan_id      text,
  individual_deductible numeric,
  family_deductible     numeric,
  individual_oop_max    numeric,
  family_oop_max        numeric,
  coinsurance_rate      numeric,
  deductible_embedded   boolean not null default false
);

do $$ begin
  create type accumulator_scope as enum ('individual','family');
exception when duplicate_object then null; end $$;

create table if not exists accumulator_state (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references households(id) on delete cascade,
  plan_id        uuid references plans(id) on delete cascade,
  scope          accumulator_scope not null,
  member_id      uuid references members(id) on delete cascade,
  deductible_met numeric not null default 0,
  oop_met        numeric not null default 0,
  as_of_date     date not null default current_date
);

-- ── verity-sim outputs ───────────────────────────────────────

create table if not exists simulations (
  id                         uuid primary key default gen_random_uuid(),
  household_id               uuid not null references households(id) on delete cascade,
  member_id                  uuid references members(id) on delete set null,
  scenario                   jsonb,
  projected_member_cost      numeric,
  family_oop_exhaustion_date date,
  breakdown                  jsonb,
  created_at                 timestamptz not null default now()
);

create table if not exists storm_index (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  score        int  not null check (score between 0 and 100),
  horizon_days int,
  features     jsonb,
  computed_at  timestamptz not null default now()
);

-- ── Append-only audit log (§7 / claim 15) ───────────────────
-- No UPDATE or DELETE policies are granted on this table.

create table if not exists audit_log (
  id           bigint generated always as identity primary key,
  household_id uuid,
  table_name   text,
  action       text,
  actor        uuid,
  row_id       uuid,
  occurred_at  timestamptz not null default now()
);

-- ── Access helper ────────────────────────────────────────────
-- SECURITY DEFINER bypasses RLS inside the function so we
-- avoid infinite recursion in child-table policies.

create or replace function public.has_household_access(hid uuid)
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from households h
    where h.id = hid and h.owner_user_id = auth.uid()
  )
  or exists (
    select 1 from household_access ha
    where ha.household_id = hid and ha.user_id = auth.uid()
  );
$$;

-- ── Indexes ──────────────────────────────────────────────────

create index if not exists idx_members_hh on members(household_id);
create index if not exists idx_plans_hh   on plans(household_id);
create index if not exists idx_accum_hh   on accumulator_state(household_id);
create index if not exists idx_sim_hh     on simulations(household_id, created_at desc);
create index if not exists idx_storm_hh   on storm_index(household_id, computed_at desc);
create index if not exists idx_audit_hh   on audit_log(household_id, occurred_at desc);

-- ── Enable RLS ───────────────────────────────────────────────

alter table households        enable row level security;
alter table household_access  enable row level security;
alter table members           enable row level security;
alter table plans             enable row level security;
alter table accumulator_state enable row level security;
alter table simulations       enable row level security;
alter table storm_index       enable row level security;
alter table audit_log         enable row level security;

-- ── households policy ────────────────────────────────────────

drop policy if exists p_households on households;
create policy p_households on households
  using  (owner_user_id = auth.uid() or has_household_access(id))
  with check (owner_user_id = auth.uid());

-- ── household_access policies ────────────────────────────────

drop policy if exists p_access_sel on household_access;
create policy p_access_sel on household_access for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from households h
      where h.id = household_id and h.owner_user_id = auth.uid()
    )
  );

drop policy if exists p_access_mod on household_access;
create policy p_access_mod on household_access for all
  using (
    exists (
      select 1 from households h
      where h.id = household_id and h.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from households h
      where h.id = household_id and h.owner_user_id = auth.uid()
    )
  );

-- ── Child-table policies (members / plans / accumulator_state
--    / simulations / storm_index) ──────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'members','plans','accumulator_state','simulations','storm_index'
  ] loop
    execute format('drop policy if exists p_%1$s on %1$s', t);
    execute format(
      'create policy p_%1$s on %1$s
         using      (has_household_access(household_id))
         with check (has_household_access(household_id))',
      t
    );
  end loop;
end $$;

-- ── audit_log: append-only ───────────────────────────────────

drop policy if exists p_audit_ins on audit_log;
create policy p_audit_ins on audit_log for insert
  with check (has_household_access(household_id));

drop policy if exists p_audit_sel on audit_log;
create policy p_audit_sel on audit_log for select
  using (has_household_access(household_id));

revoke update, delete on audit_log from anon, authenticated;

-- ── Write-audit trigger ──────────────────────────────────────

create or replace function public.fn_audit()
returns trigger language plpgsql security definer
set search_path = public as $$
declare hid uuid;
begin
  hid := coalesce(new.household_id, old.household_id);
  insert into audit_log(household_id, table_name, action, actor, row_id)
  values (hid, tg_table_name, tg_op, auth.uid(),
          coalesce(new.id, old.id));
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'members','plans','accumulator_state','simulations','storm_index'
  ] loop
    execute format(
      'drop trigger if exists trg_audit_%1$s on %1$s', t);
    execute format(
      'create trigger trg_audit_%1$s
         after insert or update or delete on %1$s
         for each row execute function fn_audit()',
      t
    );
  end loop;
end $$;
