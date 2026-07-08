-- Letter staleness tracking: a dispute letter is generated from a snapshot of
-- the case's audit results. When /api/recompute-audit or an audit re-run
-- changes the findings/totals afterwards, the stored letter silently disagrees
-- with the case page — and could be mailed with outdated numbers.
--
-- Each letter is stamped at generation with the AUDIT_LOGIC_VERSION and a
-- content fingerprint of the findings snapshot it was written from
-- (lib/letters/staleness.ts). Recompute/re-run marks letters whose fingerprint
-- no longer matches as stale (never deleted); stale letters are view-only
-- until regenerated (download/print/mail refuse them).
--
-- Legacy letters (NULL fingerprint) are treated as stale by readers — their
-- snapshot can't be verified against the current audit.

ALTER TABLE dispute_letters
  ADD COLUMN IF NOT EXISTS audit_logic_version integer,
  ADD COLUMN IF NOT EXISTS audit_fingerprint text,
  ADD COLUMN IF NOT EXISTS stale boolean NOT NULL DEFAULT false;

-- RLS: existing case-ownership policies on dispute_letters already cover
-- SELECT/INSERT/UPDATE/DELETE; no policy changes needed.
