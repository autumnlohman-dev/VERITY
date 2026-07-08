# Design Audit vs. DESIGN-BIBLE — 2026-07-08

Audit only; no UI changes made. Every user-facing surface was walked in code
against `docs/DESIGN-BIBLE.md`. Line numbers reference the tree at commit
`dfc00cc`. Severity tags follow the bible: **P0** (screams AI on sight),
**P1** (obvious AI smell), **P2** (cosmetic drift), plus **HR** for Part 3
hard-requirement breaches and **L** for Part 6 language violations.

---

## 1. Executive summary

### Counts

| Bucket | Count | Notes |
|---|---|---|
| P0 tells | 2 systemic + 1 screen | Centered-hero template (landing); backdrop-blur chrome on 8 navs + 2 modal overlays; untouched-default shadcn primitives (orphaned, unused — delete) |
| P1 tells | ~32 instances | Emoji at ~10 sites; "unlock" copy ×4; fake authority metrics ×6; default blue `#4A90D9` ×5; naked-score branding (Financial Harm Score / Outcome Prediction) ×6; feature-card grids ×2; brand-name split ×3 |
| P2 tells | ~15 systemic | Animation sprawl (landing ~24 motion instances, how-it-works ~22, pricing ~18, dashboard 11); infinite pulse keyframes ×5 definitions; count-up animations ×2; red/amber-at-rest ×6 components; neon `#C83C3C`; equal-volume boxing |
| Hard-requirement (Part 3) | 5 systemic | No mono face loaded (every dollar/code in serif/sans); ~1,100 inline hex literals with the defined CSS vars unused; one-primary-element fails on 4 screens; progressive disclosure absent on 5 surfaces; motion budget ignored |
| Language (Part 6) | ~45 instances | "discrepancy" ×4 screens; raw finding-type names as headings; NCCI/MUE/CPT/EOB unexpanded on marketing + app; "Evidentiary Package"; "advocacy workflow"; "Financial Harm Score N/1000" as a headline; acronym walls on how-it-works |
| Hierarchy failures | 4 screens | Case page (worst), dashboard, landing, copilot response feed |

### The 3 worst screens
1. **Case page** — the literal "surgery room": 10–14 expanded sections, no
   verdict sentence, three equal stat numbers as de facto primary, byhook
   test fails outright.
2. **Dashboard** — 5 competing panel groups + ~11 numeric stats before any
   scroll; DigitalTwinView pops in after hydration (major CLS); infinite
   pulse + count-up + per-row stagger.
3. **Landing** — P0 hero template, fake authority metrics with count-up,
   ~24 motion instances, decorative poster as primary while the golden-case
   demo (the bible's prescribed primary) sits in a collapsed accordion.
   *(Copilot is a close 4th — worst jargon density per square inch.)*

### The 3 quickest wins
1. **Kill every emoji** (~10 sites, one small diff; `lucide-react` is
   already a dependency for drawn icons). Clears a P1 class entirely.
2. **Retire `#4A90D9` and `#C83C3C`** (5 + 1 sites) — replace with neutral
   / reserved-semantic tokens. Clears the default-blue P1 and the neon P2.
3. **Delete the unused shadcn `components/ui/*` primitives** (default skin,
   imported nowhere) and the letter page's "unlock" copy family (4 strings).

---

## 2. Global inventories

### Font inventory
- **Loaded** (`src/app/layout.tsx:2-16`): Cormorant Garamond (display serif,
  weights 300/400/600 + italic) and DM Sans (body, 300/400/500).
- **Ban-list check:** neither is banned. DM Sans is a borderline "safe
  Google humanist sans" — worth conscious ratification, not a violation.
- **Fallbacks** `system-ui` / `Georgia` (`globals.css:55-56, 66, 74`) brush
  the no-system-default ban only if the webfont fails — acceptable.
- **HR VIOLATION — no mono face exists.** Part 3: "one mono for numbers,
  amounts, CPT codes, and tables. All dollar amounts and codes render in the
  mono face." Every dollar figure, CPT code, and table in the app renders in
  Cormorant or DM Sans today. Systemic; needs a font pick (OPEN DECISION).

### Color inventory
- `globals.css:3-57` defines a complete variable palette (cream `#F5F0E8`,
  dark `#111111`, amber `#C8A97E`, rose `#C47C6A`, muted tones, full shadcn
  compat block, `--radius: 0`). **Only the two font variables are ever
  consumed.** Zero color variables are referenced by any component.
- **~1,100 inline hex literals across 23 UI files** (counts: landing 157,
  upload 161, case page 148, letter page 130 w/ 20 unique, dashboard 83,
  pricing 79, how-it-works 56, copilot 45 w/ 15 unique, AdvocacyPanels 53,
  FinancialHarmScore 42, DeadlineTracker 36, FinancialTimeline 28,
  MailItPanel 27, EmReviewPanel 26, OutcomeFollowUp 24, DigitalTwinView 23,
  login 19, AuditProgress 15, terms 13, privacy 12, gate 10, error pages 14).
- **Three creams and two darks in circulation, none tokenized:** marketing
  bg `#EBE5D9`, globals body `#F5F0E8`, surface `#EDE5DC`; app-dark
  `#0D0D0D` vs globals `--bg-dark #111111`. Cross-palette split: marketing =
  cream, app + login/gate = dark. A stressed user crossing site → login hits
  a full palette inversion. AuditProgress renders LIGHT palette inside the
  otherwise-dark flow (`#221C14`, `#5E7E66`, `#B0604C`, `#CFC6B4`).
- Off-token colors in active use: `#4A90D9` (default blue — status dots,
  copilot DOCUMENT card, AdvocacyPanels/OutcomeFollowUp status),
  `#C83C3C` (neon red, copilot CAUTION), `#7A9E87` (green, no token),
  `#5E7E66`, `#B0604C`, `#221C14`, `#5F5648`, `#8A7F6E`, `#C9BFAC`, etc.

### Brand-name inventory (found during chrome audit)
- "Verity" (marketing wordmark), "Verity™ / Med Claim" (upload, case,
  copilot navs), **"ClearClaim"** (`login/page.tsx:117` "Sign in to your
  ClearClaim account", `gate/page.tsx:6,42` title + wordmark,
  `dashboard/page.tsx:73` nav wordmark). Package name is `clearclaim`;
  legal pages say "Verity, operated by Clear Claim Advocacy". Three visible
  brand treatments ship simultaneously. OPEN DECISION on the string; the
  fix itself lands with the shared Nav.

### Component duplication (candidates for one shared component)
1. **`function Nav()` ×8** (landing:64, upload:42, pricing:36,
   how-it-works:34, dashboard:38, case:59, terms:23, privacy:23) + the
   letter page's sticky bar as a 9th de facto nav. Two palettes, three brand
   strings, two CTA labels ("Check my bill →" vs "Upload my bill free →").
2. **`function Footer()` ×3** (landing:166, pricing:98, how-it-works:96);
   app screens have none.
3. **`serif()`/`sans()`/`label()` style-helper trios** copy-pasted into ~18
   files with drifting defaults (`serif` lineHeight 1 / 1.1 / 1.15 / 1.2;
   label letterSpacing 0.15–0.25em).
4. **Primary gold button** rebuilt 6+ ways (FinancialHarmScore:232,
   AdvocacyPanels:121/174/184, OutcomeFollowUp:132, MailItPanel:317,
   EmReviewPanel:340, plus every page CTA) with drifting padding
   (`14px 32px` / `12px 28px` / `14px 28px`) and tracking.
5. **Badge/chip** built 5 ways: DeadlineTracker urgency badge:89,
   AdvocacyPanels status badge:163, DigitalTwin "PATTERN FLAG":63,
   MailItPanel "Test mode":186, FHS tier label:53.
6. **Panel/card wrapper** with drift: bg `#0D0D0D`/`#111111`; border
   `#1C1C1C`/`#242424`/`#2A2A2A`; left-accent bar **4px** in MailItPanel:347
   vs **3px** in EmReviewPanel:188 and AdvocacyPanels:154.
7. **Selectable pill/toggle** ×3 implementations (FHS `BtnPair`:164,
   OutcomeFollowUp `StatusButton`:25, EmReviewPanel inline options:268 —
   the only one with JS hover handlers).
8. **Collapse chevron** (`▲`/`▼` text glyphs) duplicated FHS:109 and
   AdvocacyPanels:144.
9. **`pulse-dot` keyframes ×5+ definitions** (case page:299, letter page
   ×3:1067/1462/1542, dashboard:249).
10. **STATUS_DISPLAY map** duplicated dashboard:144 vs case:193 (dashboard
    adds `resolved`); **errorTypeLabel** duplicated case:259 vs
    letterPdf.ts:382 with diverging label text.
11. **Unused shadcn primitives** `components/ui/{badge,button,card,progress,
    separator,tabs}.tsx` — untouched default skin (`rounded-md`,
    `rounded-full`, `shadow-sm`, ring-offset defaults), imported nowhere.
    Orphaned dead code (a code-level tell) and a P0 if ever used as-is.

### Layout-shift check (Part 5 pretext standard: zero CLS on dashboard, case, letter)
- **Dashboard — worst:** client fetch swaps LoadingState → full layout;
  `useCountUp` (dashboard:589) changes digit width as it ramps;
  **DigitalTwinView returns `null` pre-hydration then pops in a 300px+
  panel** (DigitalTwinView:25), shoving the page down; per-row framer
  stagger (dashboard:838) fades rows in post-mount.
- **Landing:** hero `Image` with `width:"auto", height:"auto"` +
  `maxHeight:95vh` (page.tsx:482-488) — auto dimensions risk CLS on the
  largest element of the site.
- **Case page:** clean — full-screen loading state holds until case +
  recompute resolve, then renders once. Minor late text swap when the
  entitlement check resolves and flips CTA copy (case:664-671).
- **Copilot:** static guidance cards get replaced by live model cards of
  different length (copilot:208-212) — contained inside a scroll region.
- **Letter page:** banners render with the page; no material shift.
- **Pricing:** no pending state on the checkout buttons — async
  `getSession()` on click with zero feedback (pricing:242-253), then a hard
  redirect. Not CLS, but the same "reads as cheap" family.

---

## 3. Per-screen audits

### 3.1 Landing page — `src/app/page.tsx` (logged out)

**A. TELLS**
- **P0 — the centered-hero template:** hero section centered
  (page.tsx:466-467), italic subhead tagline (:490-492), exactly two
  buttons "Check my bill — free" + "See how it works" (:494-524). Three
  pricing cards appear later (:1063-1343). Sharp corners and an image
  headline mitigate, but the signature layout is present.
- **P0-adjacent — backdrop-blur nav** `blur(12px)` on scroll (:81-82);
  repeats on all marketing pages.
- **P1 — fake authority metrics:** stats bar **"12,400+ bills audited",
  "$1,840 average savings", "91% success rate"** (:546-549) with animated
  count-up (:261-291); "84% win probability" (:1008); "Patent Pending — 41
  claims, 13 independent claim categories" (:254, :740). The bible bans
  these "until the numbers are real."
- **P1 — feature-card grids at equal volume:** 8-card "What we look for"
  grid (:651-682) + 2 more (:684-695); 6-card "Verity method" grid
  (:721-736).
- **P2 — animation sprawl:** ~24 `motion.` instances, 5 `AnimatePresence`,
  3 count-up RAF animations; 12+ independent scroll reveals incl. staggered
  steps (:777) and staggered pricing cards (:1072/1160/1244). Bible: one
  reveal per page.
- 157 hex literals; zero color vars. Banned copy words: none (clean).

**B. HIERARCHY**
- De facto primary: the decorative poster `/hero-campaign.png` (:476-489,
  with the site's one earned mega-shadow :487). The bible's prescribed
  primary (amo.co translation) — the golden-case demo "1 error found ·
  $300.00 overcharge · letter ready" — exists as "Anatomy of a recovery"
  but is buried in a collapsed accordion (:837-910) below the fold.
- **byhook test: FAIL.** Cover all but the hero image → a brand poster with
  no value proposition, no verdict, no proof.
- ~8 serif headlines at 40–64px compete down the scroll (stats :307,
  problem :576, monitoring :975, pricing :1047, trust :1358, FAQ :1476…).

**C. LANGUAGE**
- Naked score names as feature headlines: **"Recovery Probability Score"**
  (:687), **"Financial Harm Score"** (:692, "One composite number showing
  your total financial risk") — the exact anti-pattern Part 6 bans.
- Jargon before first-use expansion: "hide in the EOB" (:636, :648); "Same
  CPT · same day" (:653); "MUE max 1" (:658); "NCCI, MUE, and Medicare
  fee-schedule" (:724); "NCCI procedure-to-procedure edit" (:880); "E&M
  integrity scoring" (:725); "42 CFR §414" in marketing body (:881);
  "Discrepancies across documents are found automatically" (:767).
- Unsourced stats as headlines: "80% / $1,300 / 1 in 3" (:607-609).
- Monitoring feed "New bill detected · $3,600" gold-flagged with no action
  (:1007) — illustrative, borderline Rule 6.

**D. DISCLOSURE**
- Best-in-app use of accordions (6 collapsed sections + FAQ) — but 13
  top-level sections total, including the entire pricing page inlined and
  fully expanded (:1046-1344) instead of linked.

**E. STATES**
- Hero image auto-dimensions → CLS risk (see global). Count-up dramatizes
  unverified numbers — inverts "numbers honest by construction."

---

### 3.2 Pricing page — `src/app/pricing/page.tsx`

**A. TELLS**
- **P0 (partial):** classic 3-tier card row (:328-535), middle card
  emphasized with `1.5px #C8A97E` + **"Most popular"** badge (:460-473) —
  an authority claim with no data behind it (also on upload step 3).
- Backdrop-blur nav (:52-53).
- **P2:** ~18 motion instances, ~8 independent reveals.
- `✓`/`—` as comparison-table cells (:232-233) — typographic, borderline.
- 79 hex literals. Banned copy: none. "watchdog" (:480) is a self-evident
  metaphor — allowed.

**B. HIERARCHY**
- Primary correct: 96px hero "Free to find. / Cheap to fix. / Watched for
  good." (:274-288). **byhook: PASS.** Three 52px prices compete with each
  other by design; disciplined otherwise.

**C. LANGUAGE**
- "checked against CMS data" (:363, :211); acronym string "Escalation &
  regulator letters (DOI, CMS, CFPB, credit bureaus, collectors)"
  (:225, :487); "Outcome prediction before you file" (:226, :489).

**D. DISCLOSURE**
- 10-row comparison table fully expanded (:578-606); FAQ collapsed. OK-ish.

**E. STATES**
- **Missing pending state on the conversion buttons** — async
  `getSession()` on click with no feedback, no error state (:242-253,
  :497/:516).

---

### 3.3 How it works — `src/app/how-it-works/page.tsx`

**A. TELLS**
- Backdrop-blur nav (:50-51). **P2:** ~22 motion instances, ~14 reveals
  incl. 6 staggered step rows (:334). 56 hex literals. No fake metrics.

**B. HIERARCHY**
- Primary correct: "We fix medical bills. / You keep the money."
  (:302-315). **byhook: PASS.** Inverted emphasis inside step rows: 72px
  decorative step numbers outshout the 28px step titles (:350-366).

**C. LANGUAGE — worst marketing offender**
- **Acronym wall:** "Grounded in federal rules — NCCI, MUE, PFS, No
  Surprises Act, Transparency in Coverage Rule, FDCPA, FCRA, and ERISA,
  with state-specific overlays" (:499); repeated at :558 inside a **90-word
  single sentence**. Part 6 allows these only in expandable detail with a
  plain sentence first.
- "Discrepancies across documents are found automatically" (:243);
  "escalation probability", "settlement floor and ceiling" (:255); "single
  unified schema" (:243) — engineering term on screen.
- EOB expanded on first use (:237) — compliant, good.

**D. DISCLOSURE**
- Everything expanded; the federal-rights acronym paragraph (:557-563)
  most needs collapsing. ~6 top-level sections.

**E. STATES** — static; clean.

---

### 3.4 Login — `src/app/login/page.tsx`

**A. TELLS** — clean on gradients/blur/metrics/animations (zero motion).
Dark palette `#0D0D0D`/`#1A1A1A` off-token (globals dark is `#111111`).
19 hex literals.

**B. HIERARCHY** — correct: "Welcome back." + one form. **byhook: PASS.**

**C. LANGUAGE**
- **P1 brand error:** "Sign in to your **ClearClaim** account." (:117) —
  the user arrived from Verity.

**D. DISCLOSURE** — single form, in-place mode toggle. Fine.

**E. STATES** — best of the marketing set: designed loading ("Please
wait…" :191-196), designed error (:165-169), `role="status"` success
notice (:171-178). Off-token green `#7A9E87` for success.

---

### 3.5 Gate — `src/app/gate/page.tsx`

- Clean on tells; zero animation; server-rendered. 10 hex literals.
- **P1 brand error:** wordmark and `metadata.title` = "ClearClaim" (:6, :42).
- Hierarchy: single "Private preview." + password field. **byhook: PASS.**
- Error state designed (rose border + `role="alert"` :75, :84-91).

---

### 3.6 Upload page — `src/app/upload/page.tsx` (bill + EOB dropzones)

**A. TELLS**
- P1 emoji: `✓` step-done marker (:315).
- P1 "Most popular" badge on the Membership card in step 3 (~:1541).
- Backdrop-blur nav (:59). P2: per-step framer x-slides + spinner —
  moderate. 161 hex literals (highest count in app), zero vars.

**B. HIERARCHY**
- Step flow is close to right: one step, one primary action. Guest RESULTS
  headline **"We found N errors."** is the bible's model sentence — the
  best headline in the app. Below it, the full error list + cross-document
  section + EOB notice + CTA + disclaimers all sit expanded at equal
  volume. byhook: headline PASSES; the body fails disclosure.
- Step 3: three pricing cards compete with the submit action.

**C. LANGUAGE**
- "cross-document discrepancy/discrepancies" (:1010-1011) — banned word.
- CPT codes as the first column of guest result rows (:971) — codes outside
  a detail view.
- Finding heading = raw type via `type.replace(/_/g," ")` → "patient
  responsibility mismatch" (:1022-1024); bible translation: "You're being
  charged $X more than your insurance says you owe."
- "{severity} · {N}% confidence" (:1032) — score fragment.
- EOB dropzone spells out "Explanation of Benefits (EOB)" (:1199) —
  compliant first use. "needs review"/"recoverable"/"informational" — plain.

**D. DISCLOSURE**
- Guest results: every error's explanation + rule text expanded for all
  rows. Should be verdict + one-line rows, expand on tap.

**E. STATES**
- Strong: per-file upload states (spinner/done/error+retry), zone
  rejection messages, AuditProgress running/error (the bible's named
  reference pattern). No gaps.

---

### 3.7 Dashboard — `src/app/dashboard/page.tsx`

**A. TELLS**
- **P0-adjacent:** nav blur (:55) + DeleteConfirmModal overlay `blur(6px)`
  (:393).
- **P1 default blue `#4A90D9`:** "Auditing" status dot (:145) and "Open"
  status-count dot (:741) — decorative, not semantic.
- **P1 emoji:** DigitalTwinView `⚡ N advocacy workflow(s) actively
  running` (DigitalTwinView.tsx:99).
- **P2:** infinite `pulse-dot` (:249-250 — bible: nothing pulses);
  `useCountUp` on "total recovered" (:589) — micro-animation + width-shift;
  **9 motion elements** incl. per-row stagger `delay: 0.25 + i*0.05`
  (:838). 83 hex literals.

**B. HIERARCHY**
- 5 competing panel groups + ~11 numeric stats before any scroll:
  DigitalTwinView (4 metric tiles + providers + projections + workflow
  line), "Your cases." h1 + animated total, 3-column totals bar, 3-column
  status counts, the case table. **byhook: FAIL** — no verdict exists; the
  closest primary is the bare label "Your cases." Everything sits in
  identical `#111111`/`#242424` boxes — hierarchy from borders, not type.

**C. LANGUAGE**
- DigitalTwin: "advocacy workflow(s)" (banned term), "Open exposure",
  "Encounters tracked" (:44-45), headline "$X at risk across N
  encounter(s) · M active workflow(s)" / "no open financial exposure
  detected" (lib digitalTwin.ts:171-174), "PATTERN FLAG" red badge with no
  legend and no next step (:63-65), "{p}% likely · ~$Y" projections (:88).
- "update pending" chip (:203) — warning-ish with no visible next step
  (action lives only in the hover tooltip).

**D. DISCLOSURE**
- Nothing is collapsed; 8–10 distinct sections at once. DigitalTwinView
  should be a collapsed one-line summary above the case list, not a
  permanently-expanded analytics panel.

**E. STATES**
- Loading/empty/error all present and designed (good). Layout shift is the
  worst in the app (see global inventory).

---

### 3.8 Case page — `src/app/cases/[id]/page.tsx` (worst screen)

**A. TELLS**
- P1 emoji: `✎ Edit answers` (:1342); timeline emoji arrive via
  FinancialTimeline (below).
- P1 default blue `#4A90D9`: auditing status (:194) + auditing CTA border.
- P1 red-at-rest: "Error Found" status pill renders rose `#C47C6A`
  permanently; severity rose on high/critical findings is arguably earned.
- P2: infinite `pulse-dot` (:299-300); 3 framer section reveals; nav blur
  (:76). 148 hex literals, zero vars.

**B. HIERARCHY — the surgery room, verbatim**
- First viewport: breadcrumb + Live Copilot button + (dup banner) +
  (staleness banner) + provider h1 + status pill + tier chip + THREE equal
  stat numbers (billed/expected/savings) + a CTA box. Then: FHS intake form
  or score panel, OutcomePredictionPanel, AdvocacyWorkflowPanel,
  DeadlineTracker, partial-read banner, EOB notice, cross-document findings
  (all expanded), FinancialTimeline (every event card expanded), E&M panel,
  "Audit findings" table with per-row Evidence blocks all expanded; right
  rail: case summary card, notes card, savings highlight card,
  OutcomeFollowUp. **10–14 expanded sections on a populated case.**
- The bible's prescribed primary — the verdict sentence "We found N errors
  worth $X." — **does not exist on this page.** (It exists on the guest
  results screen.) The de facto primary is a stats grid with no sentence.
- **byhook test: FAIL.** No single element carries the screen.

**C. LANGUAGE**
- "Cross-document findings · bill vs. EOB" (:1416); finding headings = raw
  type names ("patient responsibility mismatch", :1434); "{severity} · {N}%
  confidence" (:1443); "MUE Violation" / "Manual Review — No CMS Rate" /
  "Coding Observation — Informational" labels (:283-285); "We audited every
  charge against the Medicare Physician Fee Schedule, NCCI edits, and MUE
  limits." (:1279); "...did not trigger any NCCI or MUE edits" (:1578);
  **"Your Evidentiary Package is ready."** (:1159) and "Download
  Evidentiary Package ↓" (:1181) — bible: "your dispute letter and proof";
  CPT codes as the findings table's first column; statute strings rendered
  at rest under every finding.
- Compliant: partial-read, staleness, and EOB banners each carry exactly
  one next step.

**D. DISCLOSURE**
- The bible names findings, timeline, E&M questionnaire, deadlines as
  collapse-required — none are collapsed. FHS intake (a multi-question
  form) renders expanded before any user intent.

**E. STATES**
- Loading designed; stranded-audit designed with re-run; error boundary
  exists; "Clean bill." / "Reference data gap." empty states designed.
  Layout: renders once after load — clean, aside from the late entitlement
  CTA copy swap (:664-671).

---

### 3.9 Dispute letter page — `src/app/cases/[id]/letter/page.tsx`

**A. TELLS**
- **P1 banned copy "unlock" ×4:** "Unlock this dispute — $39" (:1125),
  "unlocks with a Single Dispute purchase" (:1108), "will unlock
  automatically" (:1081), "the 'Mail it for me' option will unlock" (:1990).
- P2: `pulse-dot` keyframes duplicated **three times in one file**
  (:1067, :1462, :1542) + spin-ring (:592) + 6 motion reveals; blur sticky
  bar (:1697) and modal blur (:878). 130 hex literals, 20 unique (most
  distinct colors of any file).
- Letter sheet `boxShadow: 0 32px 80px rgba(0,0,0,0.7)` (:1873) — heavy,
  but spent on the primary element; this is the earned-elevation pattern.

**B. HIERARCHY**
- The white letter document is a clear primary — **byhook: PASS** on the
  letter-ready state. Deadline banner + patient-info panel + staleness
  banner can stack above it and push the primary below the fold.

**C. LANGUAGE**
- "The full evidentiary package — insurer-specific dispute letter,
  regulatory citations, submission guide…" (:1107); "billing above the
  adjudicated patient responsibility on your EOB" (:535) — "adjudicated" on
  screen; bible: "what your insurance decided."

**D. DISCLOSURE**
- Patient-info panel auto-expands only when unfilled (intent-justified).
  Submission instructions fully expanded — could collapse; secondary.

**E. STATES**
- Best in app: generating state with rotating status lines (the bible's
  named reference), paywall, failed+retry, stale banner with regenerate,
  loading. No gaps.

---

### 3.10 Live Copilot — `src/app/copilot/page.tsx`

**A. TELLS**
- **P1 default blue `#4A90D9`** — DOCUMENT card color (:138).
- **P1 emoji `⚠`** — "⚠ Contradicts your case findings — escalate" (:320).
- **P2 neon:** `#C83C3C` near-full-saturation red as a standing CAUTION
  category color (:139); five semantic colors compete at full saturation in
  `KIND_STYLE` (:135-139). Red as category = red decoration.
- Zero animations — calmest screen on motion. 45 hex literals.

**B. HIERARCHY**
- Each model turn emits up to **4 equal-weight cards at once** (:128-131) —
  no single primary per response; byhook fails within each turn. The empty
  state header "On the phone with them right now?" (:248) is a correct
  primary.

**C. LANGUAGE — worst jargon density**
- Case banner (:271-273): "N documented error(s)", "N cross-document
  discrepancy/discrepancies" (banned word), and **"Financial Harm
  {score}/1000 ({tier})"** — a naked score with tier, the exact "78 — HIGH
  PRIORITY" pattern Part 6 Rule 2 bans. Triple violation on one line.
- "…fully itemized statement with CPT codes" in a default-visible card
  (:70); raw statute cites inline by default (:71-95); "peer-to-peer
  review", "denial reason code" (:86-88).
- The `⚠ Contradicts…— escalate` line scares without one concrete next
  step (Rule 6 borderline).
- Nav says "Verity™ / Med Claim" while the dashboard nav says "ClearClaim."

**D. DISCLOSURE**
- 4 expanded cards per turn + inline citations + fully-expanded case
  banner. Citations should be tap-to-reveal.

**E. STATES**
- Designed empty state ("Try: …" :304) and pending state ("Tailoring this
  to your case…" :333-337). No hard error UI — silent fallback to static
  cards; acceptable. Feed reflows as static cards are replaced by live ones
  (contained).

---

### 3.11 Guest audit flow

Visually the same surfaces as the upload page (§3.6) — step flow, progress,
results screen. Its distinct traits: the results headline is the app's best
sentence; its body (expanded errors, "cross-document discrepancy" heading,
CPT column, % confidence) is audited in §3.6C/D. The signed-in path lands on
the case page instead — a stressed user who converts goes from the app's
best screen (guest verdict) to its worst (case page).

---

### 3.12 Shared chrome & components

**Nav / Footer / modals**
- 8 Nav + 3 Footer copies, brand split, CTA-label split (global inventory).
- DeleteConfirmModal (dashboard:392-464): designed confirm with explicit
  copy ("Delete this case? This can't be undone.") — compliant with Rule 6;
  uses overlay blur (P0-adjacent).

**FinancialTimeline.tsx**
- **P1 emoji as the entire icon system** (:15-26): 🔐 🏥 📄 ⚖️ 🧾 💳 ✗ 📨 ⚠️ 📊
  📋 ⏰ — the bible names this exact violation. Plus "⚠ INCONSISTENCY:"
  (:142) and the data layer emitting "⚠️ Appeal Deadline PASSED" into
  timeline titles (lib/cbs/normalizer.ts:527).
- Every event is a full expanded card; "Adjudication:" appears in event
  descriptions (jargon); inconsistency banners are red-bordered at rest.

**DeadlineTracker.tsx**
- P1 emoji `✓` (:30), `⚠️` (:54). Red/amber-at-rest: `URGENCY_STYLES`
  (:13-18) tint every card including moderate/informational; days-remaining
  figure colored unconditionally (:100-106). Severity badges
  MISSED/CRITICAL/HIGH/MODERATE/INFO as headlines — naked-score pattern.
  Legalese at rest: raw `applicableRegulation` italic (:122); "contact a
  patient advocate immediately" (:57) is a vague next step. Fully expanded;
  bible explicitly requires deadlines collapsed.

**FinancialHarmScore.tsx — most severe single component**
- Headline = eyebrow "Financial Harm Score" + a **72px naked score**
  (:49-52): the textbook banned pattern, and the term itself is on the
  Part 6 translation table (internal name, never the screen). Tier tints
  the whole panel red/terracotta at rest (:6-11, :40-44). Gauge legend
  "0 — Low / 1000 — Severe" (:77-78) — metaphor needing a legend. Gauge
  animates `width 0.8s` (:73) — over the 250ms motion ceiling. "{weight}%
  weight → {n}/100" model internals (:133). "Calculate my risk score"
  (:244). No loading/empty/error states.

**AdvocacyPanels.tsx**
- "Outcome Prediction" heading (:37) + three 34px naked metrics + rows of
  "Escalation: X% / Collection risk if ignored: X% / Credit-report risk:
  X%" (:65-67) — probability percentages as primary UI. "Active Advocacy
  Workflow" / "Autonomous Advocacy" (:137, :110) — banned term.
  `expanded` defaults to `true` (:102). `#4A90D9` in STATUS_COLORS (:87).
  Legalese: "All communications are administrative actions under your
  express authorization" (:119). Raw enum badges (:164).

**DigitalTwinView.tsx** — audited under dashboard (§3.7); add: returns
`null` until hydration then pops in (CLS), four equal metric tiles (flat
uniform volume), "win rate" (:70).

**OutcomeFollowUp.tsx** — good citizen: plain language ("How did your
dispute go?"), collapses after submission, small. `#4A90D9` for
"In Progress" (:66). Silent failure on the localStorage write (:82-91).

**AuditProgress.tsx**
- The endorsed states pattern, with defects: `✓` emoji (:151), **two
  concurrent infinite animations** (ap-pulse :118 + spinner :154 — bible:
  nothing pulses), "Checking NCCI bundling rules…" as a headline-level
  stage (:17), and a divergent LIGHT palette inside the dark flow.

**MailItPanel.tsx** — exemplary language and best-in-class states
(already-mailed, submitting, undeliverable-with-suggestion, test-mode,
concurrent-mail conflict). Nits: 4px accent bar vs 3px elsewhere; bespoke
badge.

**EmReviewPanel.tsx** — good headline ("We flagged a visit charge — answer
a few questions to confirm.") and designed error/pending states. Whole
questionnaire expanded by default (bible names it collapse-required);
"Block {n} —" internal structure as UI labels (:226); JS hover
micro-interactions (:288-299).

**Error boundaries** (`cases/[id]/error.tsx`, `global-error.tsx`) — the
most bible-compliant screens in the app: single primary, reassuring
conclusion-first copy, exactly one-plus-one next step, zero tells.

---

## 4. Proposed fix sequence (each phase = one commit)

**Phase 1 — Global tokens & shared chrome** *(kills P0/P1 at the token level)*
1. Move every color to CSS variables in `globals.css`; components reference
   vars only (~1,100 hex literals across 23 files). Resolve the
   three-creams/two-darks drift into tokens.
2. Add the mono face; route all dollar amounts, codes, and tables through
   it (Part 3 hard requirement).
3. Retire `#4A90D9` (5 sites) and `#C83C3C` (1 site); define reserved
   semantic tokens so red/amber can only be urgency.
4. One shared `<Nav/>` + `<Footer/>` (replaces 8+3 copies; fixes the brand
   split in one stroke) and one typography/style-helper module (replaces
   ~18 copy-pasted trios).
5. Remove all emoji at the source: FinancialTimeline icon map → drawn icons
   (lucide-react is already a dependency), normalizer deadline title,
   DigitalTwin ⚡, copilot ⚠, DeadlineTracker ⚠️/✓, AuditProgress ✓, case ✎,
   upload/pricing ✓ glyph decisions.
6. Motion policy: delete infinite pulse keyframes (5+ defs), cap each page
   at one orchestrated reveal, remove count-ups.
7. Delete unused shadcn `components/ui/*` primitives (orphaned default
   skin).

**Phase 2 — Case page** *(the worst screen)*
1. Introduce THE verdict sentence as the sole primary: "We found N errors
   worth $X." / "Your bill looks right." above everything.
2. Collapse by default: findings (one-line verdict rows → expand for
   evidence), cross-document findings, timeline, deadlines, E&M panel; FHS
   intake behind an invite; right rail folded into one quiet summary.
3. Language pass via the Part 6 translation table: finding headings
   ("You're being charged $300 more than your insurance says you owe"),
   CPT/statute text into tap-to-expand detail, drop "% confidence"
   fragments, "Evidentiary Package" → "your dispute letter and proof."
4. Demote red-at-rest status; reserve rose for genuine urgency.

**Phase 3 — Dashboard**
1. One conclusion line as primary ("Nothing needs your attention." / "One
   case needs action.").
2. DigitalTwinView → collapsed one-line summary (and reserve its space to
   kill the hydration pop-in); remove count-up and per-row stagger.
3. "update pending" chip gets a visible next step; status boxes flatten
   into type hierarchy.

**Phase 4 — Copilot**
1. One primary card per turn, rest collapsed; citations tap-to-reveal.
2. Kill the "Financial Harm N/1000" banner line — translation-table words
   instead; "discrepancy" → "billing error"; ⚠ line gets one concrete next
   step.

**Phase 5 — Upload + guest results**
1. Below the (already correct) verdict headline, collapse result rows;
   translate "cross-document discrepancy"; CPT column into detail
   expansion.

**Phase 6 — Letter page + marketing**
1. "Unlock" copy family → plain wording; "evidentiary package" translation;
   cap banner stacking above the letter.
2. Landing: replace the poster-as-primary with the golden-case demo
   artifact (amo.co translation); remove fake metrics until real; cut
   reveals to one; un-inline the pricing section.
3. How-it-works: collapse the acronym wall behind a plain-English summary.
4. Pricing: pending states on checkout buttons.

**Per bible process rules:** every phase ends with screenshots compared
against the before state; zero P0 and zero P1 on any screen marked done.

---

## 5. OPEN DECISIONS (for Autumn — flagged, not chosen)

1. **Display + mono font picks.** The bible locks typography only after a
   choice made with Autumn. Cormorant/DM Sans may be ratified or replaced;
   the mono face is net-new and required.
2. **Brand string.** "Verity", "Verity™ / Med Claim", and "ClearClaim" all
   ship today (login, gate, dashboard nav vs marketing). One must win.
3. **Palette architecture.** Keep the deliberate light-marketing/dark-app
   split (tokenized properly), or unify on one system.
4. **Backdrop-blur nav.** Functional sticky-nav blur on 8 pages — keep as a
   deliberate exception or replace with solid surfaces (the bible bans blur
   as decoration; a case can be made either way).
5. **Paywall CTA wording** to replace "Unlock this dispute — $39."
6. **"Most popular" badge** (pricing + upload step 3) — authority claim
   without data; keep only if backed by real numbers.
7. **Marketing stats bar** ("12,400+ bills audited", "91% success rate",
   patent-claim counts) — remove or substantiate; the bible bans fake
   authority metrics outright.
8. **Storm-Index-style surfaces** (Financial Harm Score, Outcome
   Prediction, Digital Twin metrics): the bible's translation table
   prescribes plain-words forecasts with the number demoted to secondary
   detail — confirm the product intent before the Phase 2/3 rewrites.
