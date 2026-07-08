"use client";

import React, { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import type { BillingError } from "@/lib/errorDetection";
import { getEmFlaggedCodes, hasEmFlag, type EmReview } from "@/lib/emReview";
import EmReviewPanel from "./EmReviewPanel";
import { FinancialHarmScoreDisplay, FHSIntakeForm } from "@/components/FinancialHarmScore";
import { DeadlineTracker } from "@/components/DeadlineTracker";
import { FinancialTimeline } from "@/components/FinancialTimeline";
import { OutcomeFollowUp } from "@/components/OutcomeFollowUp";
import { calculateFinancialHarmScore, type FHSUserInputs } from "@/lib/scores/financialHarmScore";
import { calculateDeadlines } from "@/lib/deadlines/calculator";
import { isSelfPay } from "@/lib/insuranceMapping";
import { cbsSetForCase } from "@/lib/deadlines/forCase";
import type { NormalizedCBSSet } from "@/lib/cbs/schema";
import type { DeadlineResult } from "@/lib/deadlines/calculator";
import type { FinancialHarmScore } from "@/lib/scores/financialHarmScore";
import { saveOutcome, createPendingOutcome } from "@/lib/outcomes/store";
import { predictAll, type FinancialOutcomePrediction } from "@/lib/predictions/outcomePrediction";
import { generateWorkflow, getWorkflowForCase, saveWorkflow, recordActionUpdate, checkTermination, type AdvocacyWorkflow, type AdvocacyAction } from "@/lib/agent/advocacyAgent";
import { OutcomePredictionPanel, AdvocacyWorkflowPanel } from "@/components/AdvocacyPanels";
import { generateEvidentiaryPackage } from "@/lib/letterPdf";
import { applyLetterSubstitutions, evidentiaryPackageFilename, todayLongDate } from "@/lib/letterFields";
import { disputeUnlocked } from "@/lib/entitlements";
import { userFacingErrorCount } from "@/lib/audit/errorCount";
import { formatCalendarDate } from "@/lib/dates";
import { classifyAuditFreshness, staleBannerFor, type StaleBanner } from "@/lib/audit/version";
import { auditSnapshotFingerprint, isLetterStale } from "@/lib/letters/staleness";
import { BRAND_NAME } from "@/lib/brand";

// ─── Style helpers (exact copy from landing page) ─────────────────────────────
const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-fraunces), Georgia, serif",
  fontOpticalSizing: "auto",
  letterSpacing: "-0.015em",
  fontSize: size,
  color: "var(--ink)",
  lineHeight: 1,
  fontWeight: 400,
  ...extra,
});

const sans = (size: string, color = "var(--ink-soft)", extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-public-sans), system-ui, sans-serif",
  fontSize: size,
  color,
  ...extra,
});

const label = (color = "#C8A97E"): React.CSSProperties => ({
  fontFamily: "var(--font-public-sans), system-ui, sans-serif",
  fontSize: "11px",
  letterSpacing: "0.25em",
  textTransform: "uppercase" as const,
  color,
});

// ─── Nav ─────────────────────────────────────────────────────────────────────
function Nav() {
  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: "var(--surface)",
        borderBottom: "1px solid var(--line)",
        padding: "20px 64px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
        <span style={{ ...sans("12px", "var(--ink)"), letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 500, lineHeight: 1 }}>
          {BRAND_NAME}
        </span>
      </Link>
      <div className="hidden md:flex" style={{ gap: "40px" }}>
        {[
          { label: "How it works", href: "/how-it-works" },
          { label: "Pricing", href: "/pricing" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{ ...sans("11px", "var(--ink-soft)"), letterSpacing: "0.15em", textTransform: "uppercase", textDecoration: "none", transition: "color 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ink)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-soft)")}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <Link href="/upload" style={{ textDecoration: "none" }}>
        <span style={{ ...sans("11px", "var(--ink)"), backgroundColor: "#C8A97E", padding: "12px 24px", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 500, display: "inline-block" }}>
          Upload my bill free →
        </span>
      </Link>
    </nav>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type RawStatus = "auditing" | "error_found" | "no_errors" | "letter_ready" | string;

interface BillData {
  careType?: string;
  insuranceType?: string;
  gfe?: string;
  tier?: string;
  userNotes?: string;
  date_of_service?: string;
  em_review?: EmReview;
  lineItems?: Array<{ cpt_code?: string }>;
  // Set by runFullAudit: an EOB was uploaded and successfully cross-checked
  // (hasEob), or one was uploaded but couldn't be read so the audit completed
  // bill-only (eobError). The case page surfaces eobError as a notice rather
  // than silently degrading to a bill-only result.
  hasEob?: boolean;
  eobError?: boolean;
  // Honest-numbers inputs persisted by /api/extract: the bill's stated bottom
  // line (savings cap), the EOB's adjudicated obligation (the real "amount
  // expected"), and the partial-read warning flag.
  billPatientResponsibility?: number | null;
  eobPatientResponsibility?: number | null;
  suspectedPartialRead?: boolean;
  // Version stamp + stored document refs (drive the stale-audit recompute /
  // re-run flow).
  auditLogicVersion?: number;
  billPages?: string[];
  eobPages?: string[];
  billMergedPath?: string;
  eobMergedPath?: string;
  // Persisted questionnaire state so completed panels survive a refresh and
  // hydrate from the DB instead of re-prompting (see /api/case-state).
  fhs_inputs?: FHSUserInputs;
  fhs_score?: FinancialHarmScore;
  advocacy_workflow?: AdvocacyWorkflow;
  outcome_id?: string;
}

interface CaseRow {
  id: string;
  user_id: string;
  status: RawStatus;
  provider_name: string | null;
  insurance_type: string | null;
  amount_billed: number | null;
  amount_expected: number | null;
  amount_recovered: number | null;
  potential_savings: number | null;
  bill_data: BillData | null;
  errors_found: BillingError[] | null;
  created_at: string;
  lob_letter_id?: string | null;
  mail_status?: string | null;
  mail_test_mode?: boolean | null;
  mail_certified?: boolean | null;
  mail_expected_delivery?: string | null;
}

interface LetterRow {
  id: string;
  case_id: string;
  letter_content: string;
  generated_at: string | null;
  sent_at: string | null;
  // Audit-snapshot stamp — see lib/letters/staleness. A stale letter is
  // view-only: the evidentiary package must never ship outdated numbers.
  stale?: boolean | null;
  audit_fingerprint?: string | null;
  audit_logic_version?: number | null;
}

// ─── Status display ───────────────────────────────────────────────────────────
const STATUS_DISPLAY: Record<string, { label: string; dot: string; text: string; pulse?: boolean }> = {
  auditing: { label: "Auditing", dot: "var(--brand)", text: "var(--ink-soft)", pulse: true },
  error_found: { label: "Error Found", dot: "#C47C6A", text: "#C47C6A" },
  no_errors: { label: "No Errors Found", dot: "#7A9E87", text: "#7A9E87" },
  letter_ready: { label: "Letter Ready", dot: "#C8A97E", text: "#C8A97E" },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_DISPLAY[status] ?? { label: status, dot: "var(--ink-soft)", text: "var(--ink-soft)" };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span
        className={cfg.pulse ? "dot-pulse" : ""}
        style={{
          display: "inline-block",
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: cfg.dot,
          flexShrink: 0,
        }}
      />
      <span style={{ ...sans("12px", cfg.text) }}>{cfg.label}</span>
    </div>
  );
}

const CONFIDENCE_STYLE: Record<string, React.CSSProperties> = {
  HIGH: {
    color: "#C47C6A",
    borderColor: "rgba(196,124,106,0.4)",
    backgroundColor: "rgba(196,124,106,0.08)",
  },
  MEDIUM: {
    color: "#C8A97E",
    borderColor: "rgba(200,169,126,0.4)",
    backgroundColor: "rgba(200,169,126,0.08)",
  },
  LOW: {
    color: "var(--ink-soft)",
    borderColor: "var(--line)",
    backgroundColor: "var(--surface-raised)",
  },
};

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const style = CONFIDENCE_STYLE[confidence] ?? CONFIDENCE_STYLE.LOW;
  return (
    <span
      style={{
        fontFamily: "var(--font-public-sans), system-ui, sans-serif",
        fontSize: "10px",
        letterSpacing: "0.15em",
        textTransform: "uppercase",
        padding: "2px 8px",
        border: `1px solid ${style.borderColor}`,
        backgroundColor: style.backgroundColor,
        color: style.color,
      }}
    >
      {confidence}
    </span>
  );
}

function formatCurrency(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Timezone-safe: document dates are calendar dates ("2026-06-28") and must not
// render a day early for viewers west of Greenwich; full timestamps still
// parse natively.
function formatDate(iso: string): string {
  return formatCalendarDate(iso);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

function errorTypeLabel(type: string): string {
  switch (type) {
    case "overcharge": return "Overcharge";
    case "unbundling": return "Unbundling";
    case "duplicate": return "Duplicate";
    case "mue": return "MUE Violation";
    case "coverage": return "Coverage";
    case "patient_disputed": return "Patient Dispute";
    case "rate_unavailable": return "Manual Review: No CMS Rate";
    case "reference_data_missing": return "Audit Reference Data Unavailable";
    case "coding_observation": return "Coding Observation: Informational";
    default: return type;
  }
}

// ─── Loading / Empty states ───────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", minHeight: "100vh" }}>
      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .dot-pulse { animation: pulse-dot 1.5s ease-in-out infinite; }
      `}</style>
      <Nav />
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <Shell>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: "200px",
          textAlign: "center",
        }}
      >
        <div
          className="dot-pulse"
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            backgroundColor: "#C8A97E",
            marginBottom: "24px",
          }}
        />
        <div style={{ ...serif("32px", { fontStyle: "italic", color: "var(--ink-soft)" }) }}>
          Loading your case.
        </div>
      </div>
    </Shell>
  );
}

function NotFoundState({ message }: { message: string }) {
  return (
    <Shell>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "200px",
          textAlign: "center",
        }}
      >
        <div style={{ ...serif("40px", { lineHeight: 1.1 }) }}>
          Case not found.
        </div>
        <p style={{ ...sans("14px", "var(--ink-soft)"), marginTop: "16px", maxWidth: "360px" }}>
          {message}
        </p>
        <Link
          href="/dashboard"
          style={{ ...sans("12px", "#C8A97E"), textDecoration: "none", marginTop: "32px", letterSpacing: "0.1em" }}
        >
          Return to dashboard →
        </Link>
      </div>
    </Shell>
  );
}

// ─── E&M Outcome Callout ─────────────────────────────────────────────────────
function EmOutcomeCallout({ review }: { review: EmReview }) {
  const outcomeLabel =
    review.outcome === "cleared"
      ? "E&M flag cleared, no dispute recommended on this code"
      : review.outcome === "borderline"
      ? "Borderline, consider requesting an itemized statement"
      : "E&M flag confirmed, included in your dispute letter";

  const borderColor =
    review.outcome === "cleared"
      ? "#7A9E87"
      : review.outcome === "borderline"
      ? "#C8A97E"
      : "#C47C6A";

  const body =
    review.outcome === "cleared"
      ? "Based on your answers, the complexity of this visit is consistent with a lower-level code. We won't dispute this charge. Your answers remain on file."
      : review.outcome === "borderline"
      ? "Your answers place this visit between complexity levels. Before disputing, request a fully itemized statement with CPT justification from the provider, the exact wording is below. If the provider can't substantiate the higher level, the bill is disputable."
      : "Your answers indicate the visit complexity does not match the higher-level E&M code billed. Your dispute letter now cites CMS 2021 E&M guidelines and references your responses.";

  return (
    <div
      style={{
        backgroundColor: "var(--surface-raised)",
        border: "1px solid var(--line)",
        borderLeft: `3px solid ${borderColor}`,
        padding: "24px 28px",
        marginBottom: "48px",
      }}
    >
      <div style={{ ...label("var(--ink-soft)"), marginBottom: "8px" }}>E&amp;M visit review</div>
      <div
        style={{
          ...serif("22px", {
            lineHeight: 1.3,
            color: borderColor,
            fontStyle: "italic",
          }),
        }}
      >
        {outcomeLabel}
      </div>
      <p
        style={{
          ...sans("13px", "var(--ink-soft)"),
          marginTop: "12px",
          lineHeight: 1.65,
          maxWidth: "640px",
        }}
      >
        {body}
      </p>
      <div
        style={{
          ...sans("11px", "var(--ink-soft)"),
          marginTop: "16px",
          letterSpacing: "0.05em",
        }}
      >
        Complexity score: {review.score.toFixed(1)} / 8 ·{" "}
        {review.flagged_codes.join(", ")}
      </div>

      {review.outcome === "borderline" && (
        <div
          style={{
            backgroundColor: "var(--surface-raised)",
            border: "1px solid var(--line)",
            padding: "16px 20px",
            marginTop: "20px",
          }}
        >
          <div
            style={{
              ...sans("10px", "var(--ink-soft)"),
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            Suggested request to the provider
          </div>
          <p
            style={{
              ...sans("13px", "var(--ink-soft)"),
              lineHeight: 1.7,
              whiteSpace: "pre-wrap",
            }}
          >
            {`I am writing to request a fully itemized statement for account [ACCOUNT NUMBER], including documentation that justifies the evaluation & management (E&M) CPT code billed (${review.flagged_codes.join(", ")}). Specifically, please provide the problem(s) addressed, the medical decision-making level supporting this code under CMS 2021 E&M guidelines, and the total visit time if time-based billing was used. I will review against my records before paying the charge.`}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [letter, setLetter] = useState<LetterRow | null>(null);
  // Whether the dispute package is unlocked for this case (paid or membership) —
  // drives the letter CTA copy (buy vs generate).
  const [unlocked, setUnlocked] = useState(false);
  // Set when we arrived here because the uploaded/imported bill was already in
  // the dashboard (?dup=1) — the audit was collapsed onto this existing case.
  // Read once from the URL via a lazy initializer (no setState-in-effect).
  const [alreadyInDashboard] = useState(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("dup") === "1";
  });
  const [fetchError, setFetchError] = useState<string | null>(null);

  // H3: re-run control for a case stranded in 'auditing' (extraction failed or
  // never finished). The original file isn't persisted, so the user re-selects
  // it and we run /api/extract again on the existing case.
  const rerunInputRef = useRef<HTMLInputElement>(null);
  const [rerunning, setRerunning] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);

  // VERITY v2 — CBS, FHS, deadlines
  const [cbsSet, setCbsSet] = useState<NormalizedCBSSet | null>(null);
  const [deadlines, setDeadlines] = useState<DeadlineResult[]>([]);
  const [fhs, setFhs] = useState<FinancialHarmScore | null>(null);
  const [fhsInputs, setFhsInputs] = useState<FHSUserInputs | null>(null);
  // True while re-editing an already-answered FHS questionnaire (shows the form
  // prefilled instead of the saved score).
  const [editingFhs, setEditingFhs] = useState(false);
  const [outcomeId, setOutcomeId] = useState(() => (typeof window === 'undefined' ? 'pending' : crypto.randomUUID()));
  const [predictions, setPredictions] = useState<FinancialOutcomePrediction[]>([]);
  const [workflow, setWorkflow] = useState<AdvocacyWorkflow | null>(null);
  // Set when this case's stored audit predates the current logic version and
  // couldn't be (fully) brought current on load — drives the staleness banner.
  const [staleAudit, setStaleAudit] = useState<StaleBanner | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      // A case is visible only to its owner. Require a session and always
      // scope by user_id — an unauthenticated viewer (or one who doesn't own
      // this case) gets the not-found state, never another user's data.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setFetchError("Please sign in to view this case.");
        setLoading(false);
        return;
      }

      const { data: caseData, error: caseErr } = await supabase
        .from("cases")
        .select("*")
        .eq("id", id)
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (caseErr) {
        setFetchError(caseErr.message);
        setLoading(false);
        return;
      }
      if (!caseData) {
        setFetchError("This case does not exist or you don't have access to it.");
        setLoading(false);
        return;
      }

      // ── Audit-logic version handling ────────────────────────────────────
      // Persisted results are a cache of logic that changes. If this row was
      // computed under an older AUDIT_LOGIC_VERSION and the vision outputs
      // are persisted, bring it current server-side (deterministic layers
      // only — no vision tokens) before rendering. On failure, fall back to
      // the stored results behind a staleness banner — never a broken page.
      let activeCase = caseData as CaseRow;
      let recomputeOutcome: boolean | null = null;
      const freshness = classifyAuditFreshness(
        caseData.bill_data as Record<string, unknown> | null
      );
      if (freshness === "recomputable") {
        try {
          const res = await fetch("/api/recompute-audit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ caseId: id }),
          });
          const j = await res.json().catch(() => ({}));
          if (res.ok && (j.case || j.current)) {
            if (j.case) activeCase = j.case as CaseRow;
            if (j.recomputed === true) {
              recomputeOutcome = true;
              console.info(`Case ${id}: audit recomputed to the current logic version.`);
            }
          } else {
            throw new Error(
              typeof j.error === "string" ? j.error : `recompute failed (HTTP ${res.status})`
            );
          }
        } catch (err) {
          console.error(
            `Case ${id}: audit recompute FAILED, rendering stored (stale) results.`,
            err
          );
          recomputeOutcome = false;
        }
        if (cancelled) return;
      }

      setCaseRow(activeCase);
      setStaleAudit(
        staleBannerFor(activeCase.bill_data as Record<string, unknown> | null, recomputeOutcome)
      );

      // Build CBS from available case data and compute deadlines
      // (FHS computed separately after user answers intake questions)
      try {
        // Single source of truth (lib/deadlines/forCase): prefer the server-
        // persisted cross-document CBS, else rebuild from the stored line items.
        // The letter page derives its submission deadline from the same place.
        const set = cbsSetForCase(
          activeCase.bill_data as Record<string, unknown> | null,
          activeCase.provider_name,
          activeCase.id
        );
        const bd = activeCase.bill_data as BillData | null;
        const selfPay = isSelfPay(activeCase.insurance_type ?? bd?.insuranceType);
        const stakes = {
          amountBilled: Number(activeCase.amount_billed ?? 0),
          potentialSavings: Number(activeCase.potential_savings ?? 0),
          isSelfPay: selfPay,
        };
        if (set) {
          setCbsSet(set);
          const dls = calculateDeadlines(set, {
            selfPay,
            insuranceType: activeCase.insurance_type ?? bd?.insuranceType,
          });
          setDeadlines(dls);
          // Hydrate a previously-answered Financial Harm Score questionnaire so
          // the saved score renders instead of the blank form. We recompute from
          // the saved inputs (deterministic) so the score tracks the current CBS.
          if (bd?.fhs_inputs) {
            setFhsInputs(bd.fhs_inputs);
            setFhs(calculateFinancialHarmScore(set, dls, bd.fhs_inputs, stakes));
            setPredictions(
              predictAll(set, {
                hasActiveCollection: bd.fhs_inputs.hasActiveCollectionActivity,
                hasCreditReporting: bd.fhs_inputs.hasCreditReportingImpact,
              })
            );
          }
        } else if (bd?.fhs_inputs && bd?.fhs_score) {
          // CBS couldn't be rebuilt, but we have a saved snapshot — show it.
          setFhsInputs(bd.fhs_inputs);
          setFhs(bd.fhs_score);
        }
        // Reattach the persisted outcome id so the outcome follow-up tracker
        // reloads its recorded status, and hydrate the advocacy workflow.
        if (bd?.outcome_id) setOutcomeId(bd.outcome_id);
        const wf = bd?.advocacy_workflow ?? getWorkflowForCase(String(activeCase.id));
        if (wf) setWorkflow(wf);
      } catch {
        // CBS build / hydration is non-blocking — if it fails, page still works
      }

      // Letter query is scoped by case_id; ownership was just verified above.
      const { data: letterData } = await supabase
        .from("dispute_letters")
        .select("*")
        .eq("case_id", id)
        .order("generated_at", { ascending: false })
        .limit(1);

      if (cancelled) return;

      if (letterData && letterData.length > 0) {
        setLetter(letterData[0] as LetterRow);
      }

      // Entitlement drives the letter CTA copy (buy vs generate). Non-blocking:
      // a failure just defaults to the "get your dispute package" path.
      try {
        const entitled = await disputeUnlocked(supabase, user.id, id);
        if (!cancelled) setUnlocked(entitled);
      } catch {
        // leave unlocked = false
      }

      if (cancelled) return;
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <LoadingState />;
  if (fetchError || !caseRow) return <NotFoundState message={fetchError ?? "Unknown error"} />;

  const errors = caseRow.errors_found ?? [];

  // The E&M complexity review should be offered whenever an E&M visit code
  // (99201–99215 / 99281–99285) appears on the bill — even when it produced no
  // pricing error (E&M codes are routed to this review instead of a PFS
  // overcharge). So consider the extracted/mapped line-item codes, not just the
  // flagged errors. Both arrays expose `cpt_code`, which is all the helpers read.
  const emFlagSource = [
    ...errors,
    ...(caseRow.bill_data?.lineItems ?? []),
  ];

  // Durably persist per-case panel state onto the case (bill_data) so it
  // survives a refresh / dashboard round-trip. Optimistically updates the local
  // caseRow so the in-memory state matches, then writes server-side (ownership
  // checked, RLS-scoped). Best-effort: a network failure leaves local state set.
  const persistCaseState = (patch: Record<string, unknown>) => {
    setCaseRow((prev) =>
      prev ? { ...prev, bill_data: { ...(prev.bill_data ?? {}), ...patch } as BillData } : prev
    );
    void fetch("/api/case-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseId: id, patch }),
    }).catch((err) => console.error("Failed to persist case state:", err));
  };

  // FHS computation handler (called after intake form answers)
  const handleFHSIntake = (inputs: FHSUserInputs) => {
    setFhsInputs(inputs);
    setEditingFhs(false);
    if (cbsSet) {
      const computed = calculateFinancialHarmScore(cbsSet, deadlines, inputs, {
        amountBilled: Number(caseRow.amount_billed ?? 0),
        potentialSavings: Number(caseRow.potential_savings ?? 0),
        isSelfPay: isSelfPay(caseRow.insurance_type ?? caseRow.bill_data?.insuranceType),
      });
      setFhs(computed);
      // v8: Financial Outcome Prediction (Component O)
      const preds = predictAll(cbsSet, {
        hasActiveCollection: inputs.hasActiveCollectionActivity,
        hasCreditReporting: inputs.hasCreditReportingImpact,
      });
      setPredictions(preds);
      // v8: Advocacy Agent workflow (Component N) — existing or freshly planned
      let wfToPersist: AdvocacyWorkflow | undefined;
      const existing = getWorkflowForCase(String(caseRow.id));
      if (existing) {
        setWorkflow(existing);
        wfToPersist = existing;
      } else if (cbsSet.crossDocumentDiscrepancies.length > 0) {
        const wf = generateWorkflow(String(caseRow.id), cbsSet, deadlines, preds, false);
        saveWorkflow(wf);
        setWorkflow(wf);
        wfToPersist = wf;
      }
      // Create pending outcome record for this case
      const topDisc = cbsSet.crossDocumentDiscrepancies[0];
      const outcome = createPendingOutcome({
        outcomeId,
        caseId: String(caseRow.id),
        discrepancyType: topDisc?.type || errors[0]?.error_type || 'overcharge',
        discrepancySeverity: topDisc?.severity || 'medium',
        dollarAmountDisputed: computed.totalDollarAtRisk || Number(caseRow.potential_savings || 0),
        payerName: caseRow.insurance_type || undefined,
        providerName: caseRow.provider_name || undefined,
        regulationsCited: cbsSet.crossDocumentDiscrepancies.flatMap(d => d.applicableRegulations).slice(0, 3),
      });
      saveOutcome(outcome);
      // Durably save the answers, computed score, the outcome id (so the
      // follow-up tracker reattaches), and the workflow if one was planned.
      persistCaseState({
        fhs_inputs: inputs,
        fhs_score: computed,
        outcome_id: outcomeId,
        ...(wfToPersist ? { advocacy_workflow: wfToPersist } : {}),
      });
    }
  };

  const handleAuthorizeWorkflow = () => {
    if (!workflow) return;
    const authorized = { ...workflow, consumerAuthorized: true };
    saveWorkflow(authorized);
    setWorkflow(authorized);
    persistCaseState({ advocacy_workflow: authorized });
  };

  const handleActionUpdate = (actionId: string, status: AdvocacyAction["status"]) => {
    if (!workflow) return;
    let updated = recordActionUpdate(workflow, actionId, { status });
    updated = checkTermination(updated);
    saveWorkflow(updated);
    setWorkflow(updated);
    persistCaseState({ advocacy_workflow: updated });
  };

  // H3: re-run the audit on this case from a freshly re-selected bill file.
  // rerun:true so the extract route never treats this existing case as a fresh
  // shell (its dedup branch would DELETE it, destroying documents + history).
  const handleRerun = async (file: File) => {
    setRerunning(true);
    setRerunError(null);
    try {
      const billFileBase64 = await fileToBase64(file);
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: id, billFileBase64, billFileName: file.name, rerun: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRerunError(
          json.error || "We couldn't finish the audit. Try a clearer photo or the itemized bill."
        );
        setRerunning(false);
        return;
      }
      // Re-load the case with the freshly computed findings.
      if (typeof window !== "undefined") window.location.reload();
    } catch (err) {
      console.error("Re-run audit failed:", err);
      setRerunError("Something went wrong. Please try again.");
      setRerunning(false);
    }
  };

  // Stale-version re-run: goes through the normal extract flow using the
  // STORED documents (merged PDF preferred, else the original page files) so
  // the user never has to re-find their bill. Falls back to the file picker
  // when this case predates stored document paths (inline-base64 uploads).
  const handleStaleRerun = async () => {
    const bd = caseRow?.bill_data;
    const billPaths = bd?.billMergedPath
      ? [bd.billMergedPath]
      : Array.isArray(bd?.billPages) && bd.billPages.length > 0
      ? bd.billPages
      : null;
    if (!billPaths) {
      rerunInputRef.current?.click();
      return;
    }
    const eobPaths = bd?.eobMergedPath
      ? [bd.eobMergedPath]
      : Array.isArray(bd?.eobPages) && bd.eobPages.length > 0
      ? bd.eobPages
      : null;
    setRerunning(true);
    setRerunError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: id,
          rerun: true,
          billPaths,
          ...(eobPaths ? { eobPaths } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRerunError(
          json.error || "We couldn't finish the audit re-run. Please try again."
        );
        setRerunning(false);
        return;
      }
      if (typeof window !== "undefined") window.location.reload();
    } catch (err) {
      console.error("Stale-audit re-run failed:", err);
      setRerunError("Something went wrong. Please try again.");
      setRerunning(false);
    }
  };
  const tierLabel = caseRow.bill_data?.tier
    ? caseRow.bill_data.tier.charAt(0).toUpperCase() + caseRow.bill_data.tier.slice(1)
    : null;
  const providerName = caseRow.provider_name ?? "Pending provider identification";
  const insurer = caseRow.insurance_type ?? caseRow.bill_data?.insuranceType ?? "Insurance on file";

  const billed = Number(caseRow.amount_billed ?? 0);
  // Headline savings folds in the EOB-evidenced cross-document dollars at risk
  // (recomputed here, not just read from the row, so cases persisted under an
  // old formula display correctly too) — then HARD-CAPPED at the bill's stated
  // patient responsibility: "potential savings" can never exceed the amount
  // the patient is actually being asked to pay.
  const billPatientResp = Number(caseRow.bill_data?.billPatientResponsibility);
  const rawSavings = Math.max(
    Number(caseRow.potential_savings ?? 0),
    Math.min(billed, Number(cbsSet?.totalDollarAtRisk ?? 0))
  );
  const savings =
    Number.isFinite(billPatientResp) && billPatientResp >= 0
      ? Math.min(rawSavings, billPatientResp)
      : rawSavings;
  // "Amount expected" = what the patient should actually pay. With a readable
  // EOB that is the payer's adjudicated obligation — never a benchmark-derived
  // estimate off gross charges.
  const eobPatientResp = Number(caseRow.bill_data?.eobPatientResponsibility);
  const expected =
    caseRow.bill_data?.hasEob && Number.isFinite(eobPatientResp) && eobPatientResp >= 0
      ? eobPatientResp
      : Math.max(0, billed - savings);
  // The one shared counting rule (lib/audit/errorCount): the dashboard shows
  // the same number for the same data, so the counts cannot drift again.
  const findingsCount = userFacingErrorCount(errors, cbsSet?.crossDocumentDiscrepancies);
  const statusCfg = STATUS_DISPLAY[caseRow.status] ?? { label: caseRow.status };

  // Stale letter: the audit was recomputed/re-run after generation, so the
  // letter's numbers no longer match this page. The package generator refuses
  // it here (it renders client-side; the mail endpoint enforces the same
  // check server-side) — regenerate on the letter page to re-enable.
  const letterStale =
    !!letter &&
    isLetterStale(
      letter,
      auditSnapshotFingerprint({
        amount_billed: caseRow.amount_billed,
        amount_expected: caseRow.amount_expected,
        potential_savings: caseRow.potential_savings,
        errors_found: caseRow.errors_found,
        bill_data: caseRow.bill_data as Record<string, unknown> | null,
      })
    );

  // Generate the full Evidentiary Package PDF client-side from the data already
  // loaded on this page: the dispute letter, plus the CBS timeline, deadlines,
  // and itemized audit findings that the letter page does not have on hand.
  const handleDownloadPackage = () => {
    if (!letter || letterStale) return;
    const caseShortId = caseRow.id.slice(0, 8).toUpperCase();
    const finalLetter = applyLetterSubstitutions(letter.letter_content, {
      account_number: caseRow.id,
      provider_name: caseRow.provider_name,
      date_of_service: caseRow.bill_data?.date_of_service,
    });
    generateEvidentiaryPackage(
      {
        letterMarkdown: finalLetter,
        caseId: caseRow.id,
        providerName: caseRow.provider_name ?? undefined,
        payerName: caseRow.insurance_type ?? caseRow.bill_data?.insuranceType ?? undefined,
        accountNumber: caseRow.id.slice(0, 8).toUpperCase(),
        dateOfService: caseRow.bill_data?.date_of_service,
        preparedDate: todayLongDate(),
        errors,
        cbsSet,
        deadlines,
        potentialSavings: savings,
      },
      evidentiaryPackageFilename(caseShortId)
    );
  };

  return (
    <Shell>
      {/* Hidden re-run file input, mounted for every status so both the
          stranded-audit retry and the stale-audit fallback can open it. */}
      <input
        ref={rerunInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleRerun(f);
          e.target.value = "";
        }}
      />
      {/* Breadcrumb */}
      <div
        style={{
          paddingTop: "112px",
          paddingLeft: "64px",
          paddingRight: "64px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Link
          href="/dashboard"
          style={{ ...sans("12px", "var(--ink-soft)"), textDecoration: "none", transition: "color 0.2s" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ink-soft)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-soft)")}
        >
          ← Dashboard
        </Link>
        {/* Live Copilot: real-time call guidance grounded in this case's audit. */}
        <Link
          href={`/copilot?caseId=${caseRow.id}`}
          style={{
            ...sans("10px", "#C8A97E"),
            textDecoration: "none",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            border: "1px solid rgba(200,169,126,0.4)",
            padding: "8px 16px",
            transition: "all 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "rgba(200,169,126,0.08)";
            e.currentTarget.style.color = "var(--ink)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "#C8A97E";
          }}
        >
          Live Copilot →
        </Link>
      </div>

      {alreadyInDashboard && (
        <div style={{ paddingLeft: "64px", paddingRight: "64px", marginTop: "16px" }}>
          <div
            style={{
              backgroundColor: "rgba(200,169,126,0.1)",
              border: "1px solid rgba(200,169,126,0.4)",
              borderLeft: "3px solid #C8A97E",
              padding: "14px 20px",
              ...sans("13px", "#C8A97E"),
            }}
          >
            This bill is already in your dashboard, showing your existing audit
            rather than creating a duplicate.
          </div>
        </div>
      )}

      {/* Stale audit-logic version: either the results shown are stale (re-run
          needed / recompute failed), or they were recomputed but the newest
          bill-vs-EOB check needs a document re-read. Never silent. */}
      {staleAudit && (
        <div style={{ paddingLeft: "64px", paddingRight: "64px", marginTop: "16px" }}>
          <div
            style={{
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--line)",
              borderLeft: "3px solid var(--urgent-amber)",
              padding: "16px 20px",
            }}
          >
            <div style={{ ...label("var(--ink-soft)"), marginBottom: "6px" }}>Audit update available</div>
            <p style={{ ...sans("13px", "var(--ink-soft)"), lineHeight: 1.6 }}>{staleAudit.message}</p>
            {rerunError && (
              <p style={{ ...sans("13px", "var(--urgent-red)"), marginTop: "8px" }}>{rerunError}</p>
            )}
            <button
              onClick={() => void handleStaleRerun()}
              disabled={rerunning}
              style={{
                ...sans("10px", "var(--surface-raised)"),
                backgroundColor: "var(--brand)",
                border: "none",
                padding: "10px 20px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                fontWeight: 500,
                cursor: rerunning ? "wait" : "pointer",
                opacity: rerunning ? 0.6 : 1,
                marginTop: "12px",
              }}
            >
              {rerunning ? "Re-running audit…" : "Re-run audit →"}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          paddingLeft: "64px",
          paddingRight: "64px",
          paddingTop: "24px",
          paddingBottom: "40px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <h1 style={{ ...serif("48px", { lineHeight: 1.05 }) }}>{providerName}</h1>
        <div style={{ ...sans("14px", "var(--ink-soft)"), marginTop: "8px" }}>
          {insurer} · Filed {formatDate(caseRow.created_at)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "16px" }}>
          <StatusPill status={caseRow.status} />
          {tierLabel && (
            <div
              style={{
                ...sans("10px", "var(--ink-soft)"),
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                border: "1px solid var(--line)",
                padding: "2px 8px",
                display: "inline-block",
              }}
            >
              {tierLabel}
            </div>
          )}
        </div>

        {/* Stats */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1px 1fr 1px 1fr",
            marginTop: "32px",
            maxWidth: "720px",
          }}
        >
          {[
            { value: formatCurrency(billed), sublabel: "amount billed", color: "var(--ink)" },
            null,
            { value: formatCurrency(expected), sublabel: "amount expected", color: "var(--ink)" },
            null,
            {
              value: formatCurrency(savings),
              sublabel: "potential savings",
              color: savings > 0 ? "#7A9E87" : "var(--ink-soft)",
            },
          ].map((item, i) =>
            item === null ? (
              <div
                key={i}
                style={{ width: "1px", backgroundColor: "var(--line)", alignSelf: "stretch", margin: "0 24px" }}
              />
            ) : (
              <div key={i}>
                <div
                  style={{
                    fontFamily: "var(--font-fraunces), Georgia, serif",
  fontOpticalSizing: "auto",
  letterSpacing: "-0.015em",
                    fontSize: "36px",
                    color: item.color,
                    lineHeight: 1,
                    fontWeight: 400,
                  }}
                >
                  {item.value}
                </div>
                <div style={{ ...sans("11px", "var(--ink-soft)"), marginTop: "6px" }}>{item.sublabel}</div>
              </div>
            )
          )}
        </div>

        {/* Letter CTA */}
        {letter ? (
          <div
            style={{
              backgroundColor: "var(--surface-raised)",
              borderLeft: "4px solid #C8A97E",
              padding: "20px 24px",
              marginTop: "32px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div style={{ ...serif("22px", { lineHeight: 1.2 }) }}>
              {letterStale ? "Your letter is out of date." : "Your Evidentiary Package is ready."}
            </div>
            <p style={{ ...sans("13px", "var(--ink-soft)") }}>
              {letterStale
                ? "Your audit was updated after this letter was created, the numbers no longer match. Regenerate the letter to re-enable download and mailing."
                : "A complete, ready-to-send PDF: cover sheet, dispute letter, chronological timeline, financial calculation worksheet, regulatory citation appendix, and a deadline summary."}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
              {!letterStale && (
                <button
                  onClick={handleDownloadPackage}
                  style={{
                    ...sans("10px", "var(--ink)"),
                    backgroundColor: "#C8A97E",
                    padding: "10px 20px",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    display: "inline-block",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Download Evidentiary Package ↓
                </button>
              )}
              <Link href={`/cases/${caseRow.id}/letter`} style={{ textDecoration: "none" }}>
                <span
                  style={{
                    ...sans("10px", letterStale ? "var(--ink)" : "#C8A97E"),
                    backgroundColor: letterStale ? "#C8A97E" : "transparent",
                    border: letterStale ? "none" : "1px solid rgba(200,169,126,0.4)",
                    padding: "10px 20px",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    fontWeight: letterStale ? 500 : undefined,
                    display: "inline-block",
                  }}
                >
                  {letterStale ? "Regenerate letter →" : "View dispute letter →"}
                </span>
              </Link>
            </div>
            {caseRow.lob_letter_id && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "4px",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: caseRow.mail_test_mode ? "#C8A97E" : "#7A9E87",
                  }}
                />
                <span style={{ ...sans("12px", caseRow.mail_test_mode ? "#C8A97E" : "#7A9E87") }}>
                  {caseRow.mail_test_mode
                    ? "Mailed in TEST MODE, no physical letter sent"
                    : caseRow.mail_certified
                    ? "Letter mailed (certified)"
                    : "Letter mailed"}
                </span>
              </div>
            )}
          </div>
        ) : caseRow.status === "error_found" ? (
          <div
            style={{
              backgroundColor: "var(--surface-raised)",
              borderLeft: "4px solid #C8A97E",
              padding: "20px 24px",
              marginTop: "32px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div style={{ ...serif("22px", { lineHeight: 1.2 }) }}>
              {findingsCount} {findingsCount === 1 ? "error" : "errors"} found.
            </div>
            <p style={{ ...sans("13px", "var(--ink-soft)") }}>
              {unlocked
                ? "Your dispute package is unlocked. Generate your insurer-ready letter, regulatory citations, chronological timeline, and evidence included."
                : "Turn these findings into a ready-to-send dispute package: an insurer-specific letter, regulatory citations, and a step-by-step submission guide."}
            </p>
            <Link href={`/cases/${caseRow.id}/letter`} style={{ textDecoration: "none" }}>
              <span
                style={{
                  ...sans("10px", "var(--ink)"),
                  backgroundColor: "#C8A97E",
                  padding: "12px 24px",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  fontWeight: 500,
                  display: "inline-block",
                }}
              >
                {unlocked ? "Generate my dispute letter →" : "Get your dispute package →"}
              </span>
            </Link>
          </div>
        ) : caseRow.status === "no_errors" ? (
          <div
            style={{
              backgroundColor: "var(--surface-raised)",
              borderLeft: "4px solid #7A9E87",
              padding: "20px 24px",
              marginTop: "32px",
            }}
          >
            <div style={{ ...serif("22px", { lineHeight: 1.2 }) }}>
              No errors found.
            </div>
            <p style={{ ...sans("13px", "var(--ink-soft)"), marginTop: "8px" }}>
              We audited every charge against the Medicare Physician Fee Schedule,
              NCCI edits, and MUE limits. This bill is clean.
            </p>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: "var(--surface-raised)",
              borderLeft: "4px solid var(--brand)",
              padding: "20px 24px",
              marginTop: "32px",
            }}
          >
            <div style={{ ...serif("22px", { lineHeight: 1.2 }) }}>
              {statusCfg.label}.
            </div>
            <p style={{ ...sans("13px", "var(--ink-soft)"), marginTop: "8px" }}>
              We&apos;re reviewing your bill now. Check back shortly.
            </p>
          </div>
        )}
      </motion.div>

      {/* Body */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: "48px",
          paddingLeft: "64px",
          paddingRight: "64px",
          paddingTop: "48px",
          paddingBottom: "96px",
          alignItems: "start",
        }}
      >
        {/* Left: Errors */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
        >
          {/* ── VERITY v2: FHS intake → score, deadlines, timeline ── */}
          {(errors.length > 0 || (cbsSet && (cbsSet.totalDiscrepancies ?? 0) > 0)) && (
            <>
              {/* Financial Harm Score, saved score (with edit) or the form */}
              {fhs && !editingFhs ? (
                <>
                  <FinancialHarmScoreDisplay fhs={fhs} />
                  <button
                    onClick={() => setEditingFhs(true)}
                    style={{
                      ...sans("11px", "var(--ink-soft)"),
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      padding: 0,
                      marginTop: "-16px",
                      marginBottom: "32px",
                    }}
                  >
                    ✎ Edit answers
                  </button>
                </>
              ) : (
                <FHSIntakeForm initial={fhsInputs} onSubmit={handleFHSIntake} />
              )}

              {/* v8: Outcome Prediction (Component O) */}
              {fhs && predictions.length > 0 && (
                <OutcomePredictionPanel predictions={predictions} />
              )}

              {/* v8: Autonomous Advocacy Agent (Component N) */}
              {fhs && (
                <AdvocacyWorkflowPanel
                  workflow={workflow}
                  onAuthorize={handleAuthorizeWorkflow}
                  onActionUpdate={handleActionUpdate}
                />
              )}

              {/* Deadline Tracker */}
              {deadlines.length > 0 && (
                <DeadlineTracker deadlines={deadlines} />
              )}

              {/* Suspected partial read: extracted lines sum materially below the
                  bill's own printed total, findings may be incomplete. Loud, never
                  silent success. */}
              {caseRow.bill_data?.suspectedPartialRead && (
                <div
                  style={{
                    marginBottom: "48px",
                    backgroundColor: "rgba(196,124,106,0.08)",
                    border: "1px solid rgba(196,124,106,0.4)",
                    borderLeft: "3px solid #C47C6A",
                    padding: "16px 20px",
                  }}
                >
                  <div style={{ ...label("#C47C6A"), marginBottom: "6px" }}>
                    Possible incomplete read
                  </div>
                  <p style={{ ...sans("13px", "var(--ink-soft)"), lineHeight: 1.6 }}>
                    The charge lines we extracted add up to noticeably less than the total
                    printed on your bill, some pages or rows may not have been read. These
                    findings may be incomplete: re-upload all pages of the itemized bill
                    (clear photos or a PDF) and re-run the audit before relying on the numbers.
                  </p>
                </div>
              )}

              {/* EOB couldn't be read, say so instead of silently degrading to
                  a bill-only audit (the cross-document section just won't render). */}
              {caseRow.bill_data?.eobError && (
                <div
                  style={{
                    marginBottom: "48px",
                    backgroundColor: "#1A1206",
                    border: "1px solid #3A2E1A",
                    borderLeft: "3px solid #C8A97E",
                    padding: "16px 20px",
                  }}
                >
                  <div style={{ ...label("#C8A97E"), marginBottom: "6px" }}>EOB notice</div>
                  <p style={{ ...sans("13px", "var(--ink-soft)"), lineHeight: 1.6 }}>
                    We couldn&apos;t read your EOB, so this audit was completed using your bill
                    only. Re-upload a clearer EOB (PDF or photo) to add the bill-vs-EOB cross-check.
                  </p>
                </div>
              )}

              {/* Cross-document discrepancies (bill vs. EOB) */}
              {cbsSet && (cbsSet.crossDocumentDiscrepancies?.length ?? 0) > 0 && (
                <div style={{ marginBottom: "48px" }}>
                  <div style={{ ...label("var(--ink-soft)"), marginBottom: "16px" }}>
                    Cross-document findings · bill vs. EOB
                  </div>
                  {cbsSet.crossDocumentDiscrepancies.map((d) => {
                    const sev =
                      d.severity === "critical" || d.severity === "high" ? "#C47C6A" : "#C8A97E";
                    return (
                      <div
                        key={d.discrepancyId}
                        style={{
                          backgroundColor: "var(--surface-raised)",
                          border: "1px solid var(--line)",
                          borderLeft: `3px solid ${sev}`,
                          padding: "20px 24px",
                          marginBottom: "12px",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "16px", flexWrap: "wrap" }}>
                          <div style={{ ...serif("20px", { color: sev, lineHeight: 1.2 }), textTransform: "capitalize" }}>
                            {d.type.replace(/_/g, " ")}
                          </div>
                          {d.estimatedDollarImpact > 0 && (
                            <div style={{ ...serif("22px", { color: sev }) }}>
                              {formatCurrency(d.estimatedDollarImpact)}
                            </div>
                          )}
                        </div>
                        <div style={{ ...sans("10px", sev), letterSpacing: "0.15em", textTransform: "uppercase", marginTop: "4px" }}>
                          {d.severity} · {Math.round(d.confidenceScore * 100)}% confidence
                        </div>
                        <p style={{ ...sans("13px", "var(--ink-soft)"), marginTop: "10px", lineHeight: 1.65 }}>
                          {d.description}
                        </p>
                        {d.applicableRegulations.length > 0 && (
                          <div style={{ ...sans("11px", "var(--ink-soft)"), marginTop: "10px", lineHeight: 1.55 }}>
                            {d.applicableRegulations.map((reg, ri) => (
                              <div key={ri} style={{ marginTop: ri === 0 ? 0 : "4px" }}>· {reg}</div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Financial Timeline (only when we have dated events) */}
              {cbsSet && (cbsSet.timeline?.length ?? 0) > 0 && (
                <FinancialTimeline
                  events={cbsSet.timeline}
                  totalDocuments={cbsSet.documents?.length ?? 0}
                  totalInconsistencies={(cbsSet.documents ?? []).reduce(
                    (sum, d) => sum + (d.temporalInconsistencies?.length ?? 0), 0
                  )}
                />
              )}
            </>
          )}

          {/* E&M review: questionnaire if unanswered, outcome callout if answered */}
          {hasEmFlag(emFlagSource) &&
            (caseRow.bill_data?.em_review ? (
              <EmOutcomeCallout review={caseRow.bill_data.em_review} />
            ) : (
              <div style={{ marginBottom: "48px" }}>
                <EmReviewPanel
                  caseId={caseRow.id}
                  flaggedCodes={getEmFlaggedCodes(emFlagSource)}
                  errors={errors}
                  caseData={{
                    provider_name: caseRow.provider_name ?? "Provider on file",
                    insurance_type: caseRow.insurance_type ?? "",
                    amount_billed: Number(caseRow.amount_billed ?? 0),
                    amount_expected: Number(caseRow.amount_expected ?? 0),
                    date_of_service:
                      caseRow.bill_data?.date_of_service ?? undefined,
                    userNotes: caseRow.bill_data?.userNotes ?? undefined,
                  }}
                  onComplete={() => {
                    // Reload case state so the outcome callout renders and any
                    // newly-generated letter CTA appears.
                    if (typeof window !== "undefined") window.location.reload();
                  }}
                />
              </div>
            ))}

          <div style={{ ...label("var(--ink-soft)"), marginBottom: "24px" }}>Audit findings</div>

          {caseRow.status === "auditing" ? (
            <div style={{ textAlign: "center", paddingTop: "80px", paddingBottom: "80px" }}>
              <div style={{ ...serif("32px", { fontStyle: "italic", color: "var(--ink-soft)" }) }}>
                This audit didn&apos;t finish.
              </div>
              <p
                style={{
                  ...sans("14px", "var(--ink-soft)"),
                  marginTop: "16px",
                  maxWidth: "440px",
                  marginLeft: "auto",
                  marginRight: "auto",
                  lineHeight: 1.6,
                }}
              >
                We saved your case but the bill audit didn&apos;t complete. Re-run it
                with your bill to get your findings now.
              </p>
              {rerunError && (
                <p style={{ ...sans("13px", "#C47C6A"), marginTop: "12px" }}>{rerunError}</p>
              )}
              <button
                onClick={() => rerunInputRef.current?.click()}
                disabled={rerunning}
                style={{
                  ...sans("11px", "var(--ink)"),
                  backgroundColor: "#C8A97E",
                  border: "none",
                  padding: "14px 28px",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  fontWeight: 500,
                  cursor: rerunning ? "wait" : "pointer",
                  opacity: rerunning ? 0.6 : 1,
                  marginTop: "24px",
                }}
              >
                {rerunning ? "Re-running audit…" : "Re-run audit"}
              </button>
            </div>
          ) : errors.length === 0 ? (
            expected === 0 && !caseRow.bill_data?.hasEob ? (
              <div
                style={{
                  backgroundColor: "var(--surface-raised)",
                  border: "1px solid rgba(200,169,126,0.4)",
                  borderLeft: "4px solid #C8A97E",
                  padding: "32px",
                }}
              >
                <div style={{ ...serif("22px", { color: "#C8A97E", fontStyle: "italic" }) }}>
                  Reference data gap.
                </div>
                <p style={{ ...sans("13px", "var(--ink-soft)"), marginTop: "12px", lineHeight: 1.65 }}>
                  Fee schedule lookup returned no matches, the CPT codes on this
                  bill may not be in our reference data. This audit should not be
                  treated as exhaustive until the relevant codes are loaded.
                </p>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: "var(--surface-raised)",
                  border: "1px solid var(--line)",
                  padding: "32px",
                  textAlign: "center",
                }}
              >
                <div style={{ ...serif("26px", { color: "#7A9E87", fontStyle: "italic" }) }}>
                  Clean bill.
                </div>
                <p style={{ ...sans("13px", "var(--ink-soft)"), marginTop: "12px", lineHeight: 1.65 }}>
                  Every charge on this bill matched its expected rate, was not
                  duplicated, and did not trigger any NCCI or MUE edits.
                </p>
              </div>
            )
          ) : (
            <div>
              {/* Header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1fr 100px 100px 120px",
                  gap: "12px",
                  paddingBottom: "12px",
                  borderBottom: "1px solid var(--line)",
                }}
              >
                {["Code", "Issue", "Billed", "Expected", "Confidence"].map((h) => (
                  <span key={h} style={{ ...sans("11px", "var(--ink-soft)"), letterSpacing: "0.15em", textTransform: "uppercase" }}>
                    {h}
                  </span>
                ))}
              </div>

              {errors.map((err, i) => (
                <div key={`${err.cpt_code}-${i}`} style={{ borderBottom: "1px solid var(--line)" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "72px 1fr 100px 100px 120px",
                      gap: "12px",
                      paddingTop: "16px",
                      paddingBottom: "8px",
                      alignItems: "start",
                    }}
                  >
                    <span style={{ ...sans("12px", "var(--ink-soft)"), letterSpacing: "0.04em" }}>
                      {err.cpt_code}
                    </span>
                    <div>
                      <div style={{ ...sans("13px", "var(--ink)") }}>
                        {errorTypeLabel(err.error_type)}
                        {err.description ? `, ${err.description}` : ""}
                      </div>
                    </div>
                    <span style={{ ...sans("13px", "var(--ink-soft)") }}>
                      {formatCurrency(err.billed_amount)}
                    </span>
                    <span style={{ ...sans("13px", "var(--ink-soft)") }}>
                      {formatCurrency(err.expected_amount)}
                    </span>
                    <ConfidenceBadge confidence={err.confidence} />
                  </div>
                  <div
                    style={{
                      backgroundColor: "var(--surface-raised)",
                      padding: "16px 20px",
                      marginBottom: "0",
                    }}
                  >
                    <div
                      style={{
                        ...sans("10px", "var(--ink-soft)"),
                        letterSpacing: "0.2em",
                        textTransform: "uppercase",
                        marginBottom: "8px",
                      }}
                    >
                      Evidence
                    </div>
                    <p style={{ ...sans("13px", "var(--ink-soft)"), lineHeight: 1.65 }}>
                      {err.explanation}
                    </p>
                    <div style={{ ...sans("11px", "var(--ink-soft)"), marginTop: "8px", letterSpacing: "0.05em" }}>
                      Rule: {err.rule_violated}
                    </div>
                  </div>
                </div>
              ))}

              <div style={{ paddingTop: "24px", textAlign: "right" }}>
                <span style={{ ...sans("13px", "var(--ink-soft)") }}>Potential savings:</span>
                <span
                  style={{
                    fontFamily: "var(--font-fraunces), Georgia, serif",
  fontOpticalSizing: "auto",
  letterSpacing: "-0.015em",
                    fontSize: "28px",
                    color: "#7A9E87",
                    fontWeight: 400,
                    lineHeight: 1,
                    marginLeft: "16px",
                  }}
                >
                  {formatCurrency(savings)}
                </span>
              </div>
            </div>
          )}
        </motion.div>

        {/* Right: Side panels */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
          style={{ display: "flex", flexDirection: "column", gap: "40px" }}
        >
          {/* Case meta */}
          <div
            style={{
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--line)",
              padding: "24px",
            }}
          >
            <div style={{ ...label("var(--ink-soft)"), marginBottom: "16px" }}>Case summary</div>
            {[
              { k: "Status", v: statusCfg.label },
              { k: "Filed", v: formatDate(caseRow.created_at) },
              { k: "Insurance", v: insurer },
              { k: "Tier", v: tierLabel ?? "-" },
              { k: "Errors", v: String(findingsCount) },
            ].map((row, i, arr) => (
              <div
                key={row.k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: i < arr.length - 1 ? "1px solid var(--line)" : "none",
                }}
              >
                <span style={{ ...sans("12px", "var(--ink-soft)") }}>{row.k}</span>
                <span style={{ ...sans("13px", "var(--ink-soft)") }}>{row.v}</span>
              </div>
            ))}
          </div>

          {/* User notes */}
          {caseRow.bill_data?.userNotes && caseRow.bill_data.userNotes.trim() && (
            <div>
              <div style={{ ...label("var(--ink-soft)"), marginBottom: "12px" }}>Your notes</div>
              <div
                style={{
                  backgroundColor: "var(--surface-raised)",
                  border: "1px solid var(--line)",
                  padding: "16px 20px",
                }}
              >
                <p style={{ ...sans("13px", "var(--ink-soft)"), lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                  {caseRow.bill_data.userNotes}
                </p>
              </div>
            </div>
          )}

          {/* Potential savings highlight */}
          {savings > 0 && (
            <div
              style={{
                backgroundColor: "var(--surface-raised)",
                border: "1px solid var(--line)",
                padding: "24px",
              }}
            >
              <div style={{ ...label("var(--ink-soft)"), marginBottom: "12px" }}>Potential savings</div>
              <div
                style={{
                  fontFamily: "var(--font-fraunces), Georgia, serif",
  fontOpticalSizing: "auto",
  letterSpacing: "-0.015em",
                  fontSize: "44px",
                  color: "#7A9E87",
                  fontStyle: "italic",
                  fontWeight: 400,
                  lineHeight: 1,
                }}
              >
                {formatCurrency(savings)}
              </div>
              <div style={{ ...sans("12px", "var(--ink-soft)"), marginTop: "8px" }}>
                estimated from audit
              </div>
            </div>
          )}

          {/* Outcome follow-up (tracks dispute resolution for ML training) */}
          {fhsInputs && (
            <OutcomeFollowUp
              outcomeId={outcomeId}
              dollarAmountDisputed={fhs?.totalDollarAtRisk || savings}
            />
          )}
        </motion.div>
      </div>
    </Shell>
  );
}
