# VERITY Design Bible

This file is mandatory reading before any UI, styling, copy, or layout task.
Rules are written as hard bans and hard requirements, not aspirations — the
model follows "never X" and ignores "try to be tasteful."

---

## Part 1 — The design brief (why, in one paragraph)

VERITY's user arrives stressed: a scary bill, a fight with a hospital, money
on the line. The front-of-site currently feels like a calm waiting room; the
dashboard feels like being wheeled into surgery — everything beeping at once.
The product's aesthetic job is to CONTINUE THE WAITING ROOM: calm, reassuring,
assistive. One thing to look at first on every screen. Progressive disclosure
everywhere. If a screen makes a stressed person's eyes bounce, it failed,
no matter how much information it technically shows.

---

## Part 2 — AI tells: HARD BANS

These are the statistically-proven signatures of AI-built sites. Never ship any
of them. If one exists in the codebase already, removing it is in scope of any
UI task touching that screen.

### P0 — screams AI on sight
- **NO purple-to-blue / indigo gradients**, anywhere, on any background.
  No gradient hero text (bg-clip-text). No #7C3AED-family accents.
- **NO Inter, Roboto, Open Sans, Lato, or system-default fonts.**
  (Space Grotesk is also banned — it's the overused "safe escape" pick.)
- **NO centered hero + subhead + two buttons + three rounded feature cards.**
  That exact layout is the single most recognized AI template.
- **NO untouched shadcn/Tailwind defaults** — default zinc/slate palette,
  default radius, default shadows. Primitives are fine; the skin must be ours.
- **NO glassmorphism / backdrop-blur as decoration.** No aurora / mesh /
  ambient-glow backgrounds. No exceptions. Navs and modal chrome use solid
  `--surface` with a `--line` hairline. `backdrop-filter` is banned
  codebase-wide.

### P1 — obvious AI smell
- **NO rounded-2xl + shadow-lg on every surface.** Elevation is earned by the
  most important element on the screen, not sprayed on all of them.
- **NO emoji as icons or in headings/buttons/nav.** Ever. (The timeline's
  hospital/receipt/scales emoji icons violate this today — replace with a
  drawn icon set.)
- **NO icon-in-a-rounded-square feature rows.**
- **NO default blue buttons.**
- **NO "Elevate your workflow" copy.** Ban list: elevate, empower, seamless,
  unlock, supercharge, revolutionize, "built for the modern ___". VERITY copy
  is specific and calm: "We found one error worth $300. Here's the letter."
- **NO em dashes (—) or en dashes (–) in any user-facing copy, UI strings,
  marketing text, OR generated dispute letters.** Use a comma, colon,
  period, or parentheses instead. This is a recognized AI-writing tell and
  undermines letter credibility. (Regular hyphens are untouched — they are
  required in code ranges, account numbers, dates, and compound words.)
- **NO fake authority metrics** ("10,000+ users") until the numbers are real.

### P2 — cosmetic drift
- No flat, uniform spacing where everything sits at equal visual volume.
- No scattered micro-animations. One well-orchestrated reveal per page max.
- No neon accent colors competing at full saturation.

### Code-level tells (agents: self-check before committing)
- No comments that narrate WHAT the code does ("// check if user is
  authenticated"); comment WHY or not at all.
- No "Step 1 / Step 2 / Step 3" section comments in functions.
- No orphaned dead code left behind after iterative prompting.
- No new dependency when stdlib or an existing dep covers it.
- No pattern drift: match the file's existing conventions before inventing new
  ones. If Module A does auth one way, Module B does it the same way.
- No emoji in code, comments, commit messages, or console logs.

---

## Part 3 — The VERITY system: HARD REQUIREMENTS

### Voice & feel
- Direction, in three words: **calm, credible, assistive.** Closer to a good
  credit-union statement or a well-designed medical chart than to a SaaS
  landing page. Editorial and quiet, not "startup energetic."

### Brand (LOCKED 2026-07-08)
- **The product name is Verity**, rendered from the `BRAND_NAME` constant
  (`src/lib/brand.ts`). ClearClaim never appears in user-facing surfaces.
  "Med Claim" is not part of the product name.

### Paywall pattern (LOCKED 2026-07-08)
- The paywall names the exact contents, names the price, makes the
  follow-up promise, and offers membership as a quiet secondary line.
  **Never the word "unlock."** Shape: "Your dispute letter and proof:
  a ready-to-send letter, the regulatory citations behind each finding,
  and a submission guide. $39 for this bill. If the provider pushes back,
  the appeal letter is included." + one quiet line for membership.

### Other locked decisions (2026-07-08)
- The "Most popular" badge is replaced by descriptive guidance ("Best if
  you have more than one bill").
- The marketing stats bar (fabricated metrics) is deleted in favor of the
  live golden-case demo plus one real credential (medical billing
  specialist, 30+ successful disputes — pending her sign-off).
- Score surfaces (Financial Harm Score, Outcome Prediction, Digital Twin
  metrics) get the Part 6 translation treatment: plain-words forecast as
  the headline, the number demoted to secondary detail.

### Typography (LOCKED 2026-07-08)
- **Display: Fraunces** (Google Fonts, optical sizing on). Display sizes
  (20px and up) carry `letter-spacing: -0.015em`; headings below 20px use
  `-0.01em`. Body text never gets negative tracking.
- **Body: Public Sans.**
- **Mono: IBM Plex Mono, weight 500**, for every dollar amount, CPT/HCPCS
  code, account number, and table figure. **All dollar amounts and codes
  render in the mono face** — it reads as precision, which is the brand.
- Contrast through weight extremes (300 vs 700+) and size jumps of 2.5–3x,
  not 400-vs-600 timidity.

### Color (LOCKED 2026-07-08 — Option C, charcoal + green accent)
- The palette, as CSS variables in `globals.css` (semantic names only; **no
  component may contain a hex literal**):
  - `--surface: #F6F3EC` (the ONE cream; the other two die)
  - `--surface-raised: #FCFAF5`
  - `--ink: #33312B` (primary text)
  - `--ink-soft: #5C594F` (secondary text)
  - `--line: #E2DACB` (hairline borders)
  - `--brand: #2E7D5B` (actions and links ONLY; the UI is neutral at rest,
    green appears when something is tappable)
  - `--brand-deep: #1E5940` (hover/active)
  - `--urgent-amber: #B7791F` and `--urgent-red: #A32D2D` (reserved for
    genuine deadlines/critical findings per the rule below)
- **One dominant brand color + one accent + warm neutrals.** Everything else
  is noise.
- Semantic colors are reserved: red/amber ONLY for genuine urgency (a real
  deadline, a real critical finding). A stressed user must never see red
  decoration. Most of the dashboard should be neutral at rest.
- Text contrast ≥ 4.5:1 always (WCAG AA). No light-grey-on-white.

### Layout & hierarchy (the surgery-room fix)
- **Every screen has ONE primary element** — the thing a first-time,
  stressed user should look at. On the case page that is the verdict:
  "We found N errors worth $X." Everything else is secondary or collapsed.
- **Progressive disclosure is the default.** Findings, timeline, E&M
  questionnaire, deadlines: collapsed summaries that expand on intent.
  Never all expanded at once.
- 8px spacing rhythm. Hierarchy from type scale and whitespace, not from
  borders and boxes around everything.
- Asymmetry is allowed and encouraged; centered-everything is not.

### States & honesty
- Every async surface ships loading, empty, and error states — designed, not
  default. (The letter-generation progress state is the pattern to match.)
- Numbers on screen are honest by construction: nothing renders a dollar
  figure the reconciliation logic hasn't blessed.

### Motion
- Calm motion only: fades and gentle slides, 150–250ms, ease-out.
  One orchestrated page-load reveal max. Nothing bounces, pulses, or glows.

### Process rules for agents
- Any UI task: read this file first; screenshot the result and compare
  against the reference/before state before calling it done.
- Never introduce a new visual pattern when an existing screen already
  solves the same problem — reuse it.
- Copy in UI follows the voice rules above and gets the same review as code.

---

## Part 4 — Enforcement note

When auditing existing screens, severity order: fix P0 tells first, then P1,
then P2. The target for any screen marked "done" is zero P0 and zero P1 tells.

---

## Part 5 — Reference sites (studied, with VERITY translations)

These are the anchors. When an agent needs a visual reference for a screen,
start here — never from "make it modern."

### byhook.com — the decluttering north star
An agency whose portfolio work includes literally selling calm ("Zen Moments"
— quiet 15-second spots that outperformed loud ones). Their site: confident
type, generous air, ONE thing speaking at a time, restraint that still feels
expensive.
**Translation:** every VERITY screen gets the byhook test — cover everything
but the primary element; does the screen still make sense? If the primary
element can't carry the screen alone, the hierarchy is wrong. Whitespace is
not empty; it is the reassurance.

### shadergradient.co — "alive" without adding elements
One soft, slow, animated gradient can replace an entire hero's worth of
images, badges, and decoration.
**Translation + rule reconciliation:** the Part 2 gradient ban targets the
DEFAULT AI purple-to-blue gradient used as reflexive decoration. A single,
deliberate, slow-moving ambient gradient in VERITY's own brand palette is
permitted — with hard limits: at most ONE per page, marketing surfaces only
(landing/pricing), never behind text that must be read, never on the
dashboard or case pages (data screens stay still and quiet), motion slow
enough that a screenshot looks static. Purple/indigo hues remain banned
regardless.

### amo.co — show the thing working
Their philosophy: demo the product live instead of describing it in
paragraphs. Decluttering is mostly deleting explanatory copy.
**Translation:** VERITY's homepage should SHOW an audit — the golden case is
the demo asset: a bill, an EOB, and the verdict "1 error found · $300.00
overcharge · letter ready." That artifact replaces paragraphs of "how it
works" copy. Rule of thumb for any explanatory paragraph: can this be
replaced by showing the product state it describes? If yes, delete it.

### chenglou/pretext — precision, adopt-if-needed
A 15KB zero-dependency text measurement/layout library (by an ex-React-core
engineer; notably built by iterating Claude Code against browser benchmarks).
Its relevance: layout shift and janky text reflow read as cheap and raise
stress.
**Translation:** the STANDARD it represents is mandatory — zero cumulative
layout shift on dashboard, case page, and letter preview; text never jumps
as content loads (skeletons reserve exact space). The LIBRARY itself is
adopt-only-if-a-real-problem-warrants-it (e.g., letter-preview reflow or
virtualized finding lists); don't add the dependency speculatively.

### Considered and set aside (so agents don't re-litigate)
- tooooools.app dither/halftone textures — anti-slop but anti-clarity; wrong
  for a trust-forward claims product.
- warhol-arts / oddlymade playful-Webflow energy — wrong register.
- public.work / benditomockup — asset sources only, pull on demand.
- humanebydesign.com — behavioral ethics reference, worth reading; shapes
  interaction policy (no dark patterns, no anxiety-driven engagement), not
  the visual system.

---

## Part 6 — Plain language: HARD REQUIREMENTS

The user is a stressed adult skimming on a phone. Healthcare-communication
standards call for a 6th-grade reading level or below; VERITY aims below.
Internal names are for code and the patent — never the screen.

### The translation table (backend name → what the screen says)
- Storm Index / "vortex" / VSI → a plain forecast in words, three states max:
  "Looks calm" / "Worth watching" / "Act now" + one-sentence reason
  ("A large bill from your June hospital visit is still being processed").
  The 0–100 number may appear only as secondary detail, never as the
  headline.
- Discrepancy → "billing error" or "mistake on your bill"
- Patient responsibility mismatch → "You're being charged $300 more than
  your insurance says you owe"
- Adjudication → "what your insurance decided"
- Accumulator / deductible state → "how much of your deductible you've used"
- EOB → spell it out on first use: "the statement from your insurance
  (called an EOB)"
- Evidentiary package → "your dispute letter and proof"
- Remittance/CPT/HCPCS/NCCI/MUE → allowed in expandable detail views only,
  always with a plain-English sentence first.

### Rules
1. **Conclusion first, mechanism second.** Every screen leads with what it
   means for the user ("You likely owe $3,341, not $3,641"), with the how
   available on tap, never forced on them.
2. **Sentences, not scores.** No naked numbers as primary elements (no
   "78 — HIGH PRIORITY"). Numbers earn a headline only when they're dollars
   the user cares about.
3. **The read-aloud test.** If a screen's primary element read aloud to a
   10-year-old wouldn't be understood, rewrite it. (Detail layers may be
   adult-level; headlines may not.)
4. **One new concept per screen.** If a screen must teach (what an EOB is,
   what a deductible does), it teaches exactly one thing.
5. **Metaphors must be self-evident.** Weather works (calm/stormy needs no
   manual). Anything that needs a legend or a tooltip to be understood at
   all ("vortex") is banned from primary UI.
6. **Never scare without a next step.** Any warning state must come with
   exactly one clear action ("Review this bill" / "Send the letter"), or it
   doesn't ship.
