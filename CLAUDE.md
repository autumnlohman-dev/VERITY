## Design rules — MANDATORY for any UI task
Before any change that touches UI, styling, copy, or layout, read
docs/DESIGN-BIBLE.md in full and comply with it. Its bans are hard
bans. Its plain-language rules apply to all user-facing copy,
including copy inside generated letters' UI chrome.

## Database
has_household_access() lives in the internal schema, not public. Any
migration touching it must reference internal.has_household_access.
Never create or replace it in public — that recreates the exposed copy
the July 2026 hardening removed.
