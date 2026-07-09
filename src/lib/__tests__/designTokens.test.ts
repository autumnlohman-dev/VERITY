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

  it('the previous fonts are fully removed (Cormorant, DM Sans, Fraunces)', () => {
    const offenders = allUiSource()
      .filter((f) => /font-cormorant|font-dm-sans|Cormorant|DM_Sans|font-fraunces|Fraunces/.test(f.content))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('the display face is Lora, loaded and referenced', () => {
    const layout = readFileSync(join(process.cwd(), 'src', 'app', 'layout.tsx'), 'utf8');
    expect(layout).toContain('Lora');
    expect(layout).toContain('--font-lora');
    const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');
    expect(css).toContain('var(--font-lora)');
  });

  it('ClearClaim and "Med Claim" never appear in user-facing surfaces', () => {
    const offenders = allUiSource()
      .filter((f) => /ClearClaim|Med Claim/.test(f.content))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});

// ── WCAG AA contrast floor for the token pairs the app uses as text ──────────
// The paper scheme (--surface page, --ink text) must hold 4.5:1 for every
// body-text pairing actually in use. Computed from the real values in
// globals.css so a token tweak that breaks contrast fails here.
function tokenValues(): Record<string, string> {
  const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');
  const out: Record<string, string> = {};
  for (const m of css.matchAll(/--([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g)) out[m[1]] = m[2];
  return out;
}

function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function contrast(fg: string, bg: string): number {
  const [l1, l2] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

describe('contrast floor (WCAG AA 4.5:1) for token text pairs in use', () => {
  const t = tokenValues();
  // [foreground token, background token] — every body-text pairing the paper
  // scheme uses. urgent-amber is NOT here: it fails 4.5:1 on cream and is
  // reserved for borders/accents, never small text.
  const pairs: Array<[string, string]> = [
    ['ink', 'surface'],
    ['ink', 'surface-raised'],
    ['ink-soft', 'surface'],
    ['ink-soft', 'surface-raised'],
    ['brand', 'surface'], // bronze links / emphasized figures on cream
    ['urgent-red', 'surface'],
    ['urgent-red', 'surface-raised'],
    ['ink', 'brand-fill'], // the ONLY allowed text on camel CTA fills
    ['surface-raised', 'urgent-red'], // destructive button text
  ];

  it.each(pairs)('%s on %s meets 4.5:1', (fg, bg) => {
    expect(t[fg], `token --${fg} missing from globals.css`).toBeTruthy();
    expect(t[bg], `token --${bg} missing from globals.css`).toBeTruthy();
    expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
  });

  // The white letter sheet is a surface too (the rendered dispute letter and
  // the printed PDF): every text color permitted inside it must pass on white.
  const WHITE = '#FFFFFF';
  const letterSheetTextTokens: string[] = ['ink', 'ink-soft', 'brand'];
  it.each(letterSheetTextTokens)('%s on the white letter sheet meets 4.5:1', (fg) => {
    expect(t[fg], `token --${fg} missing from globals.css`).toBeTruthy();
    expect(contrast(t[fg], WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it('brand-fill never appears as a text color anywhere', () => {
    // Fill color only. As text it is unreadable on every light surface.
    expect(contrast(t['brand-fill'], t['surface'])).toBeLessThan(4.5);
    expect(contrast(t['brand-fill'], WHITE)).toBeLessThan(4.5);
    const offenders = allUiSource()
      .filter((f) =>
        /(?<!background)(?<!\w)color:\s*["']var\(--brand-fill\)|,\s*["']var\(--brand-fill\)["']\s*\)|style\.color\s*=\s*["']var\(--brand-fill\)/.test(
          f.content
        )
      )
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('urgent-amber is never used as small text on surface (fails AA); border/accent only', () => {
    expect(contrast(t['urgent-amber'], t['surface'])).toBeLessThan(4.5); // documents WHY the rule exists
    const offenders = allUiSource()
      .filter((f) => /color:\s*["']var\(--urgent-amber\)|label\(["']var\(--urgent-amber\)/.test(f.content))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('cream text on brand-fill is forbidden (fails AA); camel fills always carry ink text', () => {
    // Documents WHY: cream on camel measurably fails.
    expect(contrast(t['surface-raised'], t['brand-fill'])).toBeLessThan(4.5);
    expect(contrast(t['surface'], t['brand-fill'])).toBeLessThan(4.5);
    // Guard: no style block that fills with brand-fill may set cream text
    // nearby (style objects are small; a 300-char window covers them).
    const offenders: string[] = [];
    for (const f of allUiSource()) {
      let idx = f.content.indexOf('var(--brand-fill)');
      while (idx !== -1) {
        const windowText = f.content.slice(Math.max(0, idx - 300), idx + 300);
        if (/color:\s*["']var\(--surface|sans\(["'][^"']+["'],\s*["']var\(--surface/.test(windowText)) {
          offenders.push(f.path);
          break;
        }
        idx = f.content.indexOf('var(--brand-fill)', idx + 1);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the green brand family is retired', () => {
    const offenders = allUiSource()
      .filter((f) => /#2E7D5B|#1E5940/i.test(f.content))
      .map((f) => f.path);
    expect(offenders).toEqual([]);
  });
});
