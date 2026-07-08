/**
 * Design-token regression guard (DESIGN-BIBLE: "no component may contain a
 * hex literal"; backdrop-filter banned codebase-wide; the old fonts are dead).
 *
 * Full migration of legacy hex literals happens screen-by-screen in later
 * phases, so this guard enforces MONOTONIC PROGRESS: the count may only go
 * DOWN. Any new hex literal in a page or component fails this test; when a
 * phase converts a screen, lower the baseline to the new count.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Count as of the Phase 1 token commit (2026-07-08). ONLY lower this number.
const HEX_LITERAL_BASELINE = 999;

const UI_ROOTS = [join(process.cwd(), 'src', 'app'), join(process.cwd(), 'src', 'components')];

function uiFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...uiFiles(p));
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function allUiSource(): Array<{ path: string; content: string }> {
  return UI_ROOTS.flatMap(uiFiles).map((p) => ({ path: p, content: readFileSync(p, 'utf8') }));
}

describe('design token guards', () => {
  it('hex-literal count in pages/components only goes down (no NEW hex literals)', () => {
    const count = allUiSource().reduce(
      (sum, f) => sum + (f.content.match(/#[0-9A-Fa-f]{3,8}\b/g)?.length ?? 0),
      0
    );
    expect(count).toBeLessThanOrEqual(HEX_LITERAL_BASELINE);
  });

  it('backdrop-filter is banned codebase-wide', () => {
    const offenders = allUiSource()
      .filter((f) => /backdropFilter|backdrop-filter/.test(f.content))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('the previous fonts are fully removed', () => {
    const offenders = allUiSource()
      .filter((f) => /font-cormorant|font-dm-sans|Cormorant|DM_Sans/.test(f.content))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('ClearClaim and "Med Claim" never appear in user-facing surfaces', () => {
    const offenders = allUiSource()
      .filter((f) => /ClearClaim|Med Claim/.test(f.content))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
