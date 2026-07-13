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
import { DispatchOutcomePanel, CriticalOutcomeDeadlineBanner } from "@/components/DispatchOutcomePanel";
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
import { MANUAL_REVIEW_ERROR_TYPES } from "@/lib/audit/manualReview";
import { EM_QUESTIONS } from "@/lib/emReview";
import { formatCalendarDate } from "@/lib/dates";
import { classifyAuditFreshness, staleBannerFor, type StaleBanner } from "@/lib/audit/version";
import { auditSnapshotFingerprint, isLetterStale } from "@/lib/letters/staleness";
import { BRAND_NAME } from "@/lib/brand";

// ─── Style helpers (exact copy from landing page) ─────────────────────────────
const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-lora), Georgia, serif",
  
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

const label = (color = "var(--brand)"): React.CSSProperties => ({
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
        <span style={{ ...sans("11px", "var(--ink)"), backgroundColor: "var(--brand-fill)", padding: "12px 24px", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 500, display: "inline-block" }}>
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
  mailed_at?: string | null;
}

// Cross-document discrepancy card, shared by accordions a and c.
function CrossDocCard({ d }: { d: NormalizedCBSSet["crossDocumentDiscrepancies"][number] }) {
  const sevHigh = d.severity === "critical" || d.severity === "high";
  const sev = sevHigh ? "#C47C6A" : "var(--ink-soft)";
  return (
    <div
      style={{
        backgroundColor: "var(--surface)",
        border: "1px solid var(--line)",
        borderLeft: `3px solid ${sevHigh ? "#C47C6A" : "var(--line)"}`,
        padding: "20px 24px",
        marginBottom: "12px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "16px", flexWrap: "wrap" }}>
        <div style={{ ...serif("20px", { color: "var(--ink)", lineHeight: 1.2 }), textTransform: "capitalize" }}>
          {d.type.replace(/_/g, " ")}
        </div>
        {d.estimatedDollarImpact > 0 && (
          <div className="figure" style={{ ...sans("18px", "var(--ink)") }}>
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
}

// ─── Accordion (B2): native <details>, collapsed by default. The summary is
// always a plain-language sentence stating the section's conclusion, derived
// from case data. `urgent` renders the amber BORDER (never amber text) and is
// paired with defaultOpen so progressive disclosure never hides urgency.
function Accordion({
  summary,
  defaultOpen,
  urgent,
  children,
}: {
  summary: string;
  defaultOpen?: boolean;
  urgent?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      style={{
        backgroundColor: "var(--surface-raised)",
        border: "1px solid var(--line)",
        borderLeft: urgent ? "3px solid var(--urgent-amber)" : "1px solid var(--line)",
        marginBottom: "12px",
      }}
    >
      <summary
        style={{
          ...sans("14px", "var(--ink)"),
          padding: "16px 20px",
          cursor: "pointer",
          lineHeight: 1.5,
        }}
      >
        {summary}
      </summary>
      <div style={{ padding: "4px 20px 20px" }}>{children}</div>
    </details>
  );
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
    color: "var(--brand)",
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
        @media (max-width: 520px) {
          .evidence-strip { flex-direction: column; }
          .evidence-divider { width: 100% !important; height: 1px !important; }
        }
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
            backgroundColor: "var(--brand-fill)",
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
          style={{ ...sans("12px", "var(--brand)"), textDecoration: "none", marginTop: "32px", letterSpacing: "0.1em" }}
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
  // Delete flow (inside the Case details accordion): inline confirm, then
  // DELETE via the same API the dashboard uses.
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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

  // ── Accordion groupings (B2): each summary sentence derives from these ──
  const crossDocs = cbsSet?.crossDocumentDiscrepancies ?? [];
  const significantCrossDocs = crossDocs.filter(
    (d) =>
      Number(d.estimatedDollarImpact || 0) > 0 ||
      d.severity === "critical" ||
      d.severity === "high"
  );
  const lowConfCrossDocs = crossDocs.filter((d) => !significantCrossDocs.includes(d));
  const observations = errors.filter((e) => e.error_type === "coding_observation");
  const manualFlags = errors.filter(
    (e) => MANUAL_REVIEW_ERROR_TYPES.has(e.error_type) && e.error_type !== "coding_observation"
  );
  const disputableErrors = errors.filter((e) => !MANUAL_REVIEW_ERROR_TYPES.has(e.error_type));
  const soonestDeadline =
    deadlines.length > 0
      ? [...deadlines].sort((a, b) => a.daysRemaining - b.daysRemaining)[0]
      : null;
  const deadlineUrgent = !!soonestDeadline && soonestDeadline.daysRemaining <= 14;

  const cents = (n: number) =>
    `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // Evidence strip figures (B1): persisted totals only; the strip is omitted
  // entirely when either is missing — never blanks.
  const evidence =
    Number.isFinite(billPatientResp) &&
    billPatientResp > 0 &&
    Number.isFinite(eobPatientResp) &&
    eobPatientResp >= 0
      ? { billAsks: billPatientResp, insuranceSays: eobPatientResp }
      : null;

  // ── Verdict (B1): one sentence answering "what's going on with my bill" ──
  const hasEob = !!caseRow.bill_data?.hasEob;
  const cleanBill =
    caseRow.status !== "auditing" && findingsCount === 0 && savings <= 0;
  const verdictSentence: React.ReactNode =
    caseRow.status === "auditing" ? (
      <>This audit didn&apos;t finish. Re-run it to get your findings.</>
    ) : cleanBill ? (
      hasEob ? (
        <>We checked this bill against your insurance&apos;s numbers and found nothing to dispute.</>
      ) : (
        <>We checked this bill against published billing rules and found nothing to dispute.</>
      )
    ) : savings > 0 && hasEob ? (
      <>
        {providerName} is charging you <span className="figure">{formatCurrency(savings)}</span>{" "}
        more than your insurance says you owe.
      </>
    ) : savings > 0 ? (
      <>
        We found <span className="figure">{formatCurrency(savings)}</span> in likely errors on
        your {providerName} bill.
      </>
    ) : (
      <>
        We flagged {findingsCount === 1 ? "one item" : `${findingsCount} items`} to review on
        your {providerName} bill.
      </>
    );

  // The ONE action, from case state. Mail status wins over everything.
  const letterHref = `/cases/${caseRow.id}/letter`;
  const mailedFlag = !!caseRow.lob_letter_id;
  const replyDue = (() => {
    const base = caseRow.mailed_at ?? caseRow.mail_expected_delivery;
    if (!base) return null;
    const d = new Date(base);
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + 30); // the letter requests correction within 30 days
    return formatCalendarDate(d.toISOString().slice(0, 10));
  })();

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
  const handleDeleteCase = async () => {
    if (deleting || !caseRow) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/cases/${caseRow.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(json.error ?? "Couldn't delete this case. Please try again.");
        return;
      }
      window.location.href = "/dashboard";
    } catch {
      setDeleteError("Couldn't delete this case. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

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
            ...sans("10px", "var(--brand)"),
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
            e.currentTarget.style.color = "var(--brand)";
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
              ...sans("13px", "var(--brand)"),
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
                ...sans("10px", "var(--ink)"),
                backgroundColor: "var(--brand-fill)",
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

      {/* Verdict header (B1): the dashboard's centered composition. Status
          chips, tier, and the stat row live in the Case details accordion. */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        style={{
          paddingLeft: "clamp(20px, 6vw, 64px)",
          paddingRight: "clamp(20px, 6vw, 64px)",
          paddingTop: "32px",
          paddingBottom: "48px",
          borderBottom: "1px solid var(--line)",
        }}
      >
        <div style={{ maxWidth: "640px", margin: "0 auto", textAlign: "center" }}>
          <div style={{ ...label("var(--ink-soft)"), marginBottom: "20px" }}>Your case</div>
          <h1 style={{ ...serif("clamp(22px, 3vw, 30px)", { lineHeight: 1.35 }) }}>
            {verdictSentence}
          </h1>

          {/* Evidence strip: the two figures, side by side. */}
          {evidence && (
            <div
              className="evidence-strip"
              style={{
                margin: "32px auto 0",
                maxWidth: "460px",
                border: "1px solid var(--line)",
                display: "flex",
                backgroundColor: "var(--surface-raised)",
              }}
            >
              <div style={{ flex: 1, padding: "18px 16px" }}>
                <div style={{ ...label("var(--ink-soft)"), fontSize: "10px", marginBottom: "8px" }}>
                  The bill asks
                </div>
                <div className="figure" style={{ ...sans("19px", "var(--ink)") }}>
                  {cents(evidence.billAsks)}
                </div>
              </div>
              <div
                className="evidence-divider"
                style={{ width: "1px", backgroundColor: "var(--line)", alignSelf: "stretch" }}
              />
              <div style={{ flex: 1, padding: "18px 16px" }}>
                <div style={{ ...label("var(--ink-soft)"), fontSize: "10px", marginBottom: "8px" }}>
                  Your insurance says
                </div>
                <div className="figure" style={{ ...sans("19px", "var(--brand)") }}>
                  {cents(evidence.insuranceSays)}
                </div>
              </div>
            </div>
          )}

          {/* The ONE action, from case state (B1/B5). */}
          <div
            style={{
              marginTop: "32px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            {caseRow.status === "auditing" ? (
              <button
                onClick={() => rerunInputRef.current?.click()}
                disabled={rerunning}
                style={{
                  ...sans("11px", "var(--ink)"),
                  backgroundColor: "var(--brand-fill)",
                  border: "none",
                  padding: "14px 28px",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  fontWeight: 500,
                  cursor: rerunning ? "wait" : "pointer",
                  opacity: rerunning ? 0.6 : 1,
                }}
              >
                {rerunning ? "Re-running audit…" : "Re-run audit"}
              </button>
            ) : mailedFlag ? (
              <Link href={letterHref} style={{ ...sans("14px", "var(--ink)"), textDecoration: "none" }}>
                {replyDue ? `Waiting for the reply, due ${replyDue}` : "Waiting for the reply"} →
              </Link>
            ) : letter && letterStale ? (
              <Link href={letterHref} style={{ textDecoration: "none" }}>
                <span
                  style={{
                    ...sans("11px", "var(--ink)"),
                    backgroundColor: "var(--brand-fill)",
                    padding: "14px 28px",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    fontWeight: 500,
                    display: "inline-block",
                  }}
                >
                  Regenerate letter
                </span>
              </Link>
            ) : letter ? (
              <Link href={letterHref} style={{ textDecoration: "none" }}>
                <span
                  style={{
                    ...sans("11px", "var(--ink)"),
                    backgroundColor: "var(--brand-fill)",
                    padding: "14px 28px",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    fontWeight: 500,
                    display: "inline-block",
                  }}
                >
                  Send your letter
                </span>
              </Link>
            ) : caseRow.status === "error_found" ? (
              <Link href={letterHref} style={{ textDecoration: "none" }}>
                <span
                  style={{
                    ...sans("11px", "var(--ink)"),
                    backgroundColor: "var(--brand-fill)",
                    padding: "14px 28px",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    fontWeight: 500,
                    display: "inline-block",
                  }}
                >
                  {unlocked ? "Review your letter" : "Get your dispute package"}
                </span>
              </Link>
            ) : null}
          </div>
          {caseRow.status === "auditing" && rerunError && (
            <p style={{ ...sans("13px", "var(--urgent-red)"), marginTop: "12px" }}>{rerunError}</p>
          )}

          {/* B5: the evidentiary package lives under the action, quietly. */}
          {letter && !letterStale && (
            <p style={{ ...sans("13px", "var(--ink-soft)"), marginTop: "16px" }}>
              Your letter asks them to correct it.{" "}
              <Link href={letterHref} style={{ color: "var(--brand)", textDecoration: "none" }}>
                Read it first
              </Link>
              {" · "}
              <button
                onClick={handleDownloadPackage}
                style={{
                  ...sans("13px", "var(--brand)"),
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                }}
              >
                Download the full package
              </button>
            </p>
          )}
          {mailedFlag && (
            <p style={{ ...sans("12px", "var(--ink-soft)"), marginTop: "12px" }}>
              {caseRow.mail_test_mode
                ? "Mailed in TEST MODE, no physical letter sent"
                : caseRow.mail_certified
                ? "Letter mailed (certified)"
                : "Letter mailed"}
            </p>
          )}
        </div>

      </motion.div>

      {/* Body (B2): one centered column of descriptive accordions, fixed
          order. Every summary is a data-derived sentence, never a category
          name. Everything demoted from the old header/sidebar lives in h. */}
      <div
        style={{
          maxWidth: "760px",
          margin: "0 auto",
          paddingLeft: "clamp(20px, 6vw, 64px)",
          paddingRight: "clamp(20px, 6vw, 64px)",
          paddingTop: "40px",
          paddingBottom: "96px",
        }}
      >
        {/* Loud notices stay above the fold — never inside a disclosure. */}
        <CriticalOutcomeDeadlineBanner caseId={id} />
        {caseRow.bill_data?.suspectedPartialRead && (
          <div
            style={{
              marginBottom: "24px",
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
        {caseRow.bill_data?.eobError && (
          <div
            style={{
              marginBottom: "24px",
              backgroundColor: "var(--surface-raised)",
              border: "1px solid var(--line)",
              borderLeft: "3px solid var(--urgent-amber)",
              padding: "16px 20px",
            }}
          >
            <div style={{ ...label("var(--ink-soft)"), marginBottom: "6px" }}>EOB notice</div>
            <p style={{ ...sans("13px", "var(--ink-soft)"), lineHeight: 1.6 }}>
              We couldn&apos;t read your EOB, so this audit was completed using your bill
              only. Re-upload a clearer EOB (PDF or photo) to add the bill-vs-EOB cross-check.
            </p>
          </div>
        )}
        {caseRow.status !== "auditing" &&
          errors.length === 0 &&
          expected === 0 &&
          !caseRow.bill_data?.hasEob && (
            <div
              style={{
                marginBottom: "24px",
                backgroundColor: "var(--surface-raised)",
                border: "1px solid var(--line)",
                borderLeft: "3px solid var(--urgent-amber)",
                padding: "16px 20px",
              }}
            >
              <div style={{ ...label("var(--ink-soft)"), marginBottom: "6px" }}>
                Reference data gap
              </div>
              <p style={{ ...sans("13px", "var(--ink-soft)"), lineHeight: 1.6 }}>
                Fee schedule lookup returned no matches, the CPT codes on this bill may
                not be in our reference data. This audit should not be treated as
                exhaustive until the relevant codes are loaded.
              </p>
            </div>
          )}

        {/* a. Why you owe the EOB number, not the bill number. */}
        {significantCrossDocs.length > 0 && (
          <Accordion
            summary={
              evidence
                ? `Why you owe ${cents(evidence.insuranceSays)}, not ${cents(evidence.billAsks)}.`
                : significantCrossDocs.length === 1
                ? "1 difference between your bill and your insurance's numbers."
                : `${significantCrossDocs.length} differences between your bill and your insurance's numbers.`
            }
          >
            {significantCrossDocs.map((d) => (
              <CrossDocCard key={d.discrepancyId} d={d} />
            ))}
          </Accordion>
        )}

        {/* b. Charges that look high, with the justification ask. */}
        {(disputableErrors.length > 0 || manualFlags.length > 0) && (
          <Accordion
            summary={
              disputableErrors.length === 0
                ? manualFlags.length === 1
                  ? "1 charge needs a manual rate check."
                  : `${manualFlags.length} charges need a manual rate check.`
                : `${
                    disputableErrors.length === 1
                      ? "1 charge looks"
                      : `${disputableErrors.length} charges look`
                  } high compared to Medicare rates. ${
                    letter
                      ? `Your letter asks the hospital to justify ${disputableErrors.length === 1 ? "it" : "them"}.`
                      : `Your letter will ask the hospital to justify ${disputableErrors.length === 1 ? "it" : "them"}.`
                  }`
            }
          >
            {disputableErrors.length > 0 && (
              /* The table scrolls inside its own container on narrow screens;
                 the page never scrolls horizontally. */
              <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: "460px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "72px 1fr 90px 90px 100px",
                    gap: "12px",
                    paddingBottom: "12px",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  {["Code", "Issue", "Billed", "Expected", "Confidence"].map((h) => (
                    <span
                      key={h}
                      style={{ ...sans("11px", "var(--ink-soft)"), letterSpacing: "0.15em", textTransform: "uppercase" }}
                    >
                      {h}
                    </span>
                  ))}
                </div>
                {disputableErrors.map((err, i) => (
                  <div key={`${err.cpt_code}-${i}`} style={{ borderBottom: "1px solid var(--line)" }}>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "72px 1fr 90px 90px 100px",
                        gap: "12px",
                        paddingTop: "16px",
                        paddingBottom: "8px",
                        alignItems: "start",
                      }}
                    >
                      <span className="figure" style={{ ...sans("12px", "var(--ink-soft)") }}>
                        {err.cpt_code}
                      </span>
                      <div style={{ ...sans("13px", "var(--ink)") }}>
                        {errorTypeLabel(err.error_type)}
                        {err.description ? `, ${err.description}` : ""}
                      </div>
                      <span className="figure" style={{ ...sans("13px", "var(--ink-soft)") }}>
                        {formatCurrency(err.billed_amount)}
                      </span>
                      <span className="figure" style={{ ...sans("13px", "var(--ink-soft)") }}>
                        {formatCurrency(err.expected_amount)}
                      </span>
                      <ConfidenceBadge confidence={err.confidence} />
                    </div>
                    <div style={{ backgroundColor: "var(--surface)", padding: "16px 20px" }}>
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
                {savings > 0 && (
                  <div style={{ paddingTop: "20px", textAlign: "right" }}>
                    <span style={{ ...sans("13px", "var(--ink-soft)") }}>Potential savings:</span>
                    <span className="figure" style={{ ...sans("18px", "var(--brand)"), marginLeft: "12px" }}>
                      {formatCurrency(savings)}
                    </span>
                  </div>
                )}
              </div>
              </div>
            )}
            {manualFlags.length > 0 && (
              <div style={{ marginTop: disputableErrors.length > 0 ? "20px" : 0 }}>
                <div style={{ ...sans("11px", "var(--ink-soft)"), letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "8px" }}>
                  Also flagged for our manual review
                </div>
                {manualFlags.map((err, i) => (
                  <p key={i} style={{ ...sans("13px", "var(--ink-soft)"), lineHeight: 1.6, marginBottom: "8px" }}>
                    {err.cpt_code ? <span className="figure">{err.cpt_code}</span> : null}
                    {err.cpt_code ? ": " : ""}
                    {err.explanation || err.description || errorTypeLabel(err.error_type)}
                  </p>
                ))}
              </div>
            )}
          </Accordion>
        )}

        {/* c. Low-confidence line mismatches. */}
        {lowConfCrossDocs.length > 0 && (
          <Accordion
            summary={`${
              lowConfCrossDocs.length === 1 ? "1 charge" : `${lowConfCrossDocs.length} charges`
            } we couldn't match line-by-line. Probably formatting, worth a glance.`}
          >
            {lowConfCrossDocs.map((d) => (
              <CrossDocCard key={d.discrepancyId} d={d} />
            ))}
          </Accordion>
        )}

        {/* d. Coding observations that don't change what you owe. */}
        {observations.length > 0 && (
          <Accordion
            summary={`${observations.length} coding observation${
              observations.length === 1 ? "" : "s"
            } that ${observations.length === 1 ? "doesn't" : "don't"} change what you owe.`}
          >
            {observations.map((err, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid var(--line)" }}>
                <div style={{ ...sans("13px", "var(--ink)") }}>
                  {err.cpt_code ? <span className="figure">{err.cpt_code}</span> : null}
                  {err.cpt_code ? ": " : ""}
                  {err.description || errorTypeLabel(err.error_type)}
                </div>
                {err.explanation && (
                  <p style={{ ...sans("12px", "var(--ink-soft)"), marginTop: "6px", lineHeight: 1.6 }}>
                    {err.explanation}
                  </p>
                )}
              </div>
            ))}
          </Accordion>
        )}

        {/* e. The E&M questionnaire (unchanged inside). */}
        {hasEmFlag(emFlagSource) && (
          <Accordion
            summary={
              caseRow.bill_data?.em_review
                ? "Your visit review is done. Here's what it means for your case."
                : `Answer ${EM_QUESTIONS.length} quick questions about your visit (2 minutes). It could strengthen your case.`
            }
          >
            {caseRow.bill_data?.em_review ? (
              <EmOutcomeCallout review={caseRow.bill_data.em_review} />
            ) : (
              <EmReviewPanel
                caseId={caseRow.id}
                flaggedCodes={getEmFlaggedCodes(emFlagSource)}
                errors={errors}
                caseData={{
                  provider_name: caseRow.provider_name ?? "Provider on file",
                  insurance_type: caseRow.insurance_type ?? "",
                  amount_billed: Number(caseRow.amount_billed ?? 0),
                  amount_expected: Number(caseRow.amount_expected ?? 0),
                  date_of_service: caseRow.bill_data?.date_of_service ?? undefined,
                  userNotes: caseRow.bill_data?.userNotes ?? undefined,
                }}
                onComplete={() => {
                  // Reload case state so the outcome callout renders and any
                  // newly-generated letter CTA appears.
                  if (typeof window !== "undefined") window.location.reload();
                }}
              />
            )}
          </Accordion>
        )}

        {/* f. Deadlines. Urgency is never hidden: within 14 days this renders
            OPEN with the amber border. */}
        {soonestDeadline && (
          <Accordion
            defaultOpen={deadlineUrgent}
            urgent={deadlineUrgent}
            summary={
              soonestDeadline.daysRemaining < 0
                ? `A deadline passed ${Math.abs(soonestDeadline.daysRemaining)} days ago. Read this.`
                : `Your deadline: dispute by ${formatCalendarDate(soonestDeadline.deadlineDate)} (${
                    soonestDeadline.daysRemaining
                  } ${soonestDeadline.daysRemaining === 1 ? "day" : "days"} away).`
            }
          >
            <DeadlineTracker deadlines={deadlines} />
          </Accordion>
        )}

        {/* g. The timeline. */}
        {cbsSet && (cbsSet.timeline?.length ?? 0) > 0 && (
          <Accordion summary="What happened and when.">
            <FinancialTimeline
              events={cbsSet.timeline}
              totalDocuments={cbsSet.documents?.length ?? 0}
              totalInconsistencies={(cbsSet.documents ?? []).reduce(
                (sum, d) => sum + (d.temporalInconsistencies?.length ?? 0),
                0
              )}
            />
          </Accordion>
        )}

        {/* h. Case details: everything demoted from the old header/sidebar. */}
        <Accordion summary="Case details.">
          <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "20px", flexWrap: "wrap" }}>
            <StatusPill status={caseRow.status} />
            {tierLabel && (
              <span
                style={{
                  ...sans("10px", "var(--ink-soft)"),
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  border: "1px solid var(--line)",
                  padding: "2px 8px",
                }}
              >
                {tierLabel}
              </span>
            )}
          </div>

          {/* The stat row, demoted from the old header. */}
          <div style={{ display: "flex", gap: "32px", flexWrap: "wrap", marginBottom: "20px" }}>
            {[
              { value: formatCurrency(billed), sublabel: "amount billed" },
              { value: formatCurrency(expected), sublabel: "amount expected" },
              { value: formatCurrency(savings), sublabel: "potential savings" },
            ].map((item) => (
              <div key={item.sublabel}>
                <div className="figure" style={{ ...sans("20px", "var(--ink)") }}>{item.value}</div>
                <div style={{ ...sans("11px", "var(--ink-soft)"), marginTop: "4px" }}>{item.sublabel}</div>
              </div>
            ))}
          </div>

          {[
            { k: "Status", v: statusCfg.label },
            { k: "Filed", v: formatDate(caseRow.created_at) },
            { k: "Insurance", v: insurer },
            { k: "Tier", v: tierLabel ?? "-" },
            { k: "Errors", v: String(findingsCount) },
            {
              k: "Audit version",
              v: staleAudit ? "Update available (see banner above)" : "Current",
            },
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
              <span style={{ ...sans("13px", "var(--ink)") }}>{row.v}</span>
            </div>
          ))}

          {caseRow.bill_data?.userNotes && caseRow.bill_data.userNotes.trim() && (
            <div style={{ marginTop: "24px" }}>
              <div style={{ ...sans("11px", "var(--ink-soft)"), letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "8px" }}>
                Your notes
              </div>
              <p style={{ ...sans("13px", "var(--ink-soft)"), lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                {caseRow.bill_data.userNotes}
              </p>
            </div>
          )}

          {/* Advocacy tools (demote-never-destroy: previously top-of-page). */}
          {(errors.length > 0 || (cbsSet && (cbsSet.totalDiscrepancies ?? 0) > 0)) && (
            <div style={{ marginTop: "32px" }}>
              <div style={{ ...sans("11px", "var(--ink-soft)"), letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
                More tools
              </div>
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
                    Edit answers
                  </button>
                </>
              ) : (
                <FHSIntakeForm initial={fhsInputs} onSubmit={handleFHSIntake} />
              )}
              {fhs && predictions.length > 0 && <OutcomePredictionPanel predictions={predictions} />}
              {fhs && (
                <AdvocacyWorkflowPanel
                  workflow={workflow}
                  onAuthorize={handleAuthorizeWorkflow}
                  onActionUpdate={handleActionUpdate}
                />
              )}
              {fhsInputs && (
                <OutcomeFollowUp
                  outcomeId={outcomeId}
                  dollarAmountDisputed={fhs?.totalDollarAtRisk || savings}
                  caseId={id}
                />
              )}
            </div>
          )}

          {/* Letter dispatch tracking: one card per mailed letter, with the
              record-a-response intake. Renders nothing until a letter has
              actually been dispatched. */}
          <DispatchOutcomePanel
            caseId={id}
            potentialSavings={savings}
            intake={{
              patientState:
                ((caseRow as unknown as Record<string, unknown>).patient_state as string | null) ?? null,
              inCollections:
                ((caseRow as unknown as Record<string, unknown>).in_collections as boolean | null) ?? null,
              onCreditReport:
                ((caseRow as unknown as Record<string, unknown>).on_credit_report as boolean | null) ?? null,
            }}
          />

          {/* Delete this case. */}
          <div style={{ marginTop: "32px", borderTop: "1px solid var(--line)", paddingTop: "20px" }}>
            {confirmingDelete ? (
              <div>
                <p style={{ ...sans("13px", "var(--ink)"), lineHeight: 1.6 }}>
                  Delete this case? This can&apos;t be undone. The audit findings, any
                  dispute letters, and the uploaded documents will be permanently removed.
                </p>
                {deleteError && (
                  <p role="alert" style={{ ...sans("12px", "var(--urgent-red)"), marginTop: "8px" }}>
                    {deleteError}
                  </p>
                )}
                <div style={{ display: "flex", gap: "12px", marginTop: "12px" }}>
                  <button
                    onClick={() => void handleDeleteCase()}
                    disabled={deleting}
                    style={{
                      ...sans("11px", "var(--surface-raised)"),
                      backgroundColor: "var(--urgent-red)",
                      border: "none",
                      padding: "10px 20px",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      fontWeight: 500,
                      cursor: deleting ? "wait" : "pointer",
                      opacity: deleting ? 0.6 : 1,
                    }}
                  >
                    {deleting ? "Deleting…" : "Delete case"}
                  </button>
                  <button
                    onClick={() => {
                      setConfirmingDelete(false);
                      setDeleteError(null);
                    }}
                    disabled={deleting}
                    style={{
                      ...sans("11px", "var(--ink-soft)"),
                      background: "transparent",
                      border: "1px solid var(--line)",
                      padding: "10px 20px",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                style={{
                  ...sans("12px", "var(--ink-soft)"),
                  background: "none",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  transition: "color 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--urgent-red)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-soft)")}
              >
                Delete this case
              </button>
            )}
          </div>
        </Accordion>
      </div>
    </Shell>
  );
}
