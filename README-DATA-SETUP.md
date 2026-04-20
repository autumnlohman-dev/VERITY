# Data setup — CMS reference files

ClearClaim's audit engine compares bills to three CMS-published datasets:

| Table              | Source                                         | Refresh cadence |
| ------------------ | ---------------------------------------------- | --------------- |
| `pfs_fee_schedule` | Medicare Physician Fee Schedule (PFS)          | Annual (Jan 1)  |
| `ncci_ptp_edits`   | NCCI Procedure-to-Procedure edits              | Quarterly       |
| `ncci_mue_edits`   | NCCI Medically Unlikely Edits (MUE)            | Quarterly       |

None of these are shipped with the repo. You need to ingest them once, then refresh on CMS's schedule.

## Prerequisites

### 1. Environment

`.env.local` must contain:

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>
```

The service-role key is **only** used by this script. Never ship it to the browser.

### 2. Schema

The script upserts into these columns. If they don't exist in your Supabase project yet, run the SQL below once (in the Supabase SQL editor):

```sql
create table if not exists pfs_fee_schedule (
  cpt_code            text not null,
  description         text,
  work_rvu            numeric,
  facility_amount     numeric,
  non_facility_amount numeric,
  allowed_amount      numeric,
  locality            text not null default '00',
  primary key (cpt_code, locality)
);

create table if not exists ncci_ptp_edits (
  code_1    text not null,
  code_2    text not null,
  edit_type integer not null default 1,
  primary key (code_1, code_2)
);

create table if not exists ncci_mue_edits (
  cpt_code  text primary key,
  max_units integer not null
);
```

`edit_type` on `ncci_ptp_edits` follows the CMS modifier indicator:

- `0` → codes can never be billed together
- `1` → a modifier (`59`, `XE`, `XS`, `XP`, `XU`) may justify separate billing
- `9` → edit deleted / not applicable

## Where to get the CMS source files

CMS publishes download URLs that rotate each cycle. **Before you run the script, get the current URL from these index pages:**

- **PFS (annual):** https://www.cms.gov/medicare/payment/fee-schedules/physician
  Look for the "PFS Relative Value Files" section. The yearly ZIP contains `PPRRVU<YY>_<quarter>.csv` — the file you want.

- **NCCI PTP (quarterly):** https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits
  Two file sets: "Practitioner PTP Edits" and "Hospital OP PTP Edits." Practitioner is what to use for professional-service bills.

- **NCCI MUE (quarterly):** same index page. Look for "Practitioner Services MUE Table" (and Hospital OP / DME variants).

CMS distributes most of these as `.xlsx` inside `.zip`. Export the relevant sheet to `.csv` before feeding it to the ingestion script — the parser is CSV-only to avoid an `xlsx` dependency.

## Running the ingestion

Run once after downloading/exporting the three CSVs:

```bash
npx tsx scripts/import-cms-data.ts \
  --pfs=./cms-data/PPRRVU24.csv \
  --ncci-ptp=./cms-data/PPRRVU24-ptp.csv \
  --ncci-mue=./cms-data/PPRRVU24-mue.csv
```

> `npx ts-node scripts/import-cms-data.ts` also works, but `tsx` handles the project's ESM config without extra flags. If `ts-node` errors on module resolution, switch to `tsx`.

You can also pass URLs (the script will `fetch` them):

```bash
PFS_SOURCE=https://example.com/pfs2024.csv \
NCCI_PTP_SOURCE=https://example.com/ptp.csv \
NCCI_MUE_SOURCE=https://example.com/mue.csv \
  npx tsx scripts/import-cms-data.ts
```

### What the script does

1. Loads each source (URL or local path) as text.
2. Auto-detects JSON vs. CSV (first non-whitespace char `[`/`{` → JSON).
3. Maps the source columns into the Supabase schema. The mapper is tolerant of common CMS column naming variants (`HCPCS` / `HCPCS_Cd`, `Column 1` / `Column_1`, etc.).
4. If a PFS row has RVUs but no explicit dollar amounts, the script derives them using the CMS conversion factor (default `32.7442` for 2024 — override via `PFS_CONVERSION_FACTOR`).
5. Upserts into Supabase in batches of 500, keyed on the primary-key columns.
6. Prints a final summary with row counts per table.

### Expected row counts (rough)

| Table              | Rows (2024)           |
| ------------------ | --------------------- |
| `pfs_fee_schedule` | ~9,500 CPT/HCPCS codes|
| `ncci_ptp_edits`   | ~1.3M pairs           |
| `ncci_mue_edits`   | ~9,000 codes          |

PTP is by far the largest table — the first ingestion takes a few minutes.

## Refreshing

- **Every January:** re-run with the new PFS RVU file. Update `PFS_CONVERSION_FACTOR` if CMS changes it in the final rule.
- **Every quarter** (Jan/Apr/Jul/Oct): re-run NCCI PTP and NCCI MUE with the new quarterly files. Upsert handles version churn — no need to wipe the tables first.

If CMS retires a code, the upsert leaves the old row in place. To clean out codes that disappeared from a refresh, truncate before ingest:

```sql
truncate pfs_fee_schedule;
truncate ncci_ptp_edits;
truncate ncci_mue_edits;
```

## Troubleshooting

**"HTTP 200 fetching …" but 0 rows parsed.**
The default source URLs point at CMS index pages (HTML), not the CSV. Find the actual download link on the index page and pass it via `--pfs=` / env var.

**"One or more tables received 0 rows."**
At least one source was unreachable or unparseable. Re-run with `--pfs=`/`--ncci-ptp=`/`--ncci-mue=` pointing at the local CSVs you downloaded.

**Column mapping failures.**
The script expects common CMS header variants. If CMS renames a column, edit `mapPfsRow` / `mapPtpRow` / `mapMueRow` in `scripts/import-cms-data.ts` to recognize the new header.
