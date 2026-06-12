-- clfs_fee_schedule had RLS enabled but NO policies, so every anon/authenticated
-- (and server guest-audit) read silently returned zero rows. Lab codes (CBC, CMP,
-- lipid panels, venipuncture, etc.) are priced under the Clinical Lab Fee Schedule,
-- not the PFS, so lab-dominated bills found nothing in PFS (locality '00'), nothing
-- in CLFS (blocked), and often nothing in PTP/MUE — tripping runAudit's
-- "empty PFS/CLFS, NCCI PTP, and NCCI MUE tables" reference_data_missing finding.
--
-- Fix: add a read-only public SELECT policy, consistent with the other CMS
-- reference tables (pfs_fee_schedule, ncci_ptp_edits, ncci_mue_edits). This is
-- public, read-only reference data.

ALTER TABLE public.clfs_fee_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read clfs fee schedule" ON public.clfs_fee_schedule;
CREATE POLICY "Anyone can read clfs fee schedule"
  ON public.clfs_fee_schedule
  FOR SELECT
  TO public
  USING (true);
