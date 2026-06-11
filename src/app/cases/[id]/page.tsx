"use client";

import React, { use, useEffect, useState } from "react";
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
import { normalizeCBSSet } from "@/lib/cbs/normalizer";
import { billExtractionToCBS } from "@/lib/cbs/extractor";
import type { NormalizedCBSSet } from "@/lib/cbs/schema";
import type { DeadlineResult } from "@/lib/deadlines/calculator";
import type { FinancialHarmScore } from "@/lib/scores/financialHarmScore";
import { saveOutcome, createPendingOutcome } from "@/lib/outcomes/store";
import { predictAll, type FinancialOutcomePrediction } from "@/lib/predictions/outcomePrediction";
import { generateWorkflow, getWorkflowForCase, saveWorkflow, recordActionUpdate, checkTermination, type AdvocacyWorkflow, type AdvocacyAction } from "@/lib/agent/advocacyAgent";
import { OutcomePredictionPanel, AdvocacyWorkflowPanel } from "@/components/AdvocacyPanels";

// ─── Style helpers (exact copy from landing page) ─────────────────────────────
const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-cormorant), Georgia, serif",
  fontSize: size,
  color: "#F5F0E8",
  lineHeight: 1,
  fontWeight: 400,
  ...extra,
});

const sans = (size: string, color = "#A89F96", extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
  fontSize: size,
  color,
  ...extra,
});

const label = (color = "#C8A97E"): React.CSSProperties => ({
  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
  fontSize: "11px",
  letterSpacing: "0.25em",
  textTransform: "uppercase" as const,
  color,
});

// ─── Nav ─────────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: scrolled ? "rgba(13,13,13,0.92)" : "rgba(13,13,13,0.95)",
        backdropFilter: "blur(12px)",
        transition: "background-color 0.4s",
        padding: "20px 64px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "1px solid #1C1C1C",
      }}
    >
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
        <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ ...sans("12px", "#F5F0E8"), letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 500, lineHeight: 1 }}>
            Verity™
          </span>
          <span style={{ ...sans("8px", "#A89F96"), letterSpacing: "0.18em", textTransform: "uppercase", lineHeight: 1 }}>
            Med Claim
          </span>
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
            style={{ ...sans("11px", "#A89F96"), letterSpacing: "0.15em", textTransform: "uppercase", textDecoration: "none", transition: "color 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F0E8")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#A89F96")}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <Link href="/upload" style={{ textDecoration: "none" }}>
        <span style={{ ...sans("11px", "#0D0D0D"), backgroundColor: "#C8A97E", padding: "12px 24px", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 500, display: "inline-block" }}>
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
}

interface LetterRow {
  id: string;
  case_id: string;
  letter_content: string;
  generated_at: string | null;
  sent_at: string | null;
}

// ─── Status display ───────────────────────────────────────────────────────────
const STATUS_DISPLAY: Record<string, { label: string; dot: string; text: string; pulse?: boolean }> = {
  auditing: { label: "Auditing", dot: "#4A90D9", text: "#A89F96", pulse: true },
  error_found: { label: "Error Found", dot: "#C47C6A", text: "#C47C6A" },
  no_errors: { label: "No Errors Found", dot: "#7A9E87", text: "#7A9E87" },
  letter_ready: { label: "Letter Ready", dot: "#C8A97E", text: "#C8A97E" },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_DISPLAY[status] ?? { label: status, dot: "#A89F96", text: "#A89F96" };
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
    color: "#A89F96",
    borderColor: "#2A2A2A",
    backgroundColor: "#111111",
  },
};

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const style = CONFIDENCE_STYLE[confidence] ?? CONFIDENCE_STYLE.LOW;
  return (
    <span
      style={{
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
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

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
}

function errorTypeLabel(type: string): string {
  switch (type) {
    case "overcharge": return "Overcharge";
    case "unbundling": return "Unbundling";
    case "duplicate": return "Duplicate";
    case "mue": return "MUE Violation";
    case "coverage": return "Coverage";
    case "patient_disputed": return "Patient Dispute";
    case "rate_unavailable": return "Manual Review — No CMS Rate";
    case "reference_data_missing": return "Audit Reference Data Unavailable";
    default: return type;
  }
}

// ─── Loading / Empty states ───────────────────────────────────────────────────
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#0D0D0D", minHeight: "100vh" }}>
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
        <div style={{ ...serif("32px", { fontStyle: "italic", color: "#A89F96" }) }}>
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
        <p style={{ ...sans("14px", "#A89F96"), marginTop: "16px", maxWidth: "360px" }}>
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
      ? "E&M flag cleared — no dispute recommended on this code"
      : review.outcome === "borderline"
      ? "Borderline — consider requesting an itemized statement"
      : "E&M flag confirmed — included in your dispute letter";

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
      ? "Your answers place this visit between complexity levels. Before disputing, request a fully itemized statement with CPT justification from the provider — the exact wording is below. If the provider can't substantiate the higher level, the bill is disputable."
      : "Your answers indicate the visit complexity does not match the higher-level E&M code billed. Your dispute letter now cites CMS 2021 E&M guidelines and references your responses.";

  return (
    <div
      style={{
        backgroundColor: "#111111",
        border: "1px solid #242424",
        borderLeft: `3px solid ${borderColor}`,
        padding: "24px 28px",
        marginBottom: "48px",
      }}
    >
      <div style={{ ...label("#6B635C"), marginBottom: "8px" }}>E&amp;M visit review</div>
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
          ...sans("13px", "#A89F96"),
          marginTop: "12px",
          lineHeight: 1.65,
          maxWidth: "640px",
        }}
      >
        {body}
      </p>
      <div
        style={{
          ...sans("11px", "#6B635C"),
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
            backgroundColor: "#0D0D0D",
            border: "1px solid #242424",
            padding: "16px 20px",
            marginTop: "20px",
          }}
        >
          <div
            style={{
              ...sans("10px", "#6B635C"),
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              marginBottom: "8px",
            }}
          >
            Suggested request to the provider
          </div>
          <p
            style={{
              ...sans("13px", "#A89F96"),
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
  const [fetchError, setFetchError] = useState<string | null>(null);

  // VERITY v2 — CBS, FHS, deadlines
  const [cbsSet, setCbsSet] = useState<NormalizedCBSSet | null>(null);
  const [deadlines, setDeadlines] = useState<DeadlineResult[]>([]);
  const [fhs, setFhs] = useState<FinancialHarmScore | null>(null);
  const [fhsInputs, setFhsInputs] = useState<FHSUserInputs | null>(null);
  const [outcomeId] = useState(() => (typeof window === 'undefined' ? 'pending' : crypto.randomUUID()));
  const [predictions, setPredictions] = useState<FinancialOutcomePrediction[]>([]);
  const [workflow, setWorkflow] = useState<AdvocacyWorkflow | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      // Beta: auth gate removed. `user` may be null; user_id filter is
      // applied only when authenticated.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      let caseQuery = supabase
        .from("cases")
        .select("*")
        .eq("id", id);
      if (user) caseQuery = caseQuery.eq("user_id", user.id);
      const { data: caseData, error: caseErr } = await caseQuery.maybeSingle();

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

      setCaseRow(caseData as CaseRow);

      // Build CBS from available case data and compute deadlines
      // (FHS computed separately after user answers intake questions)
      try {
        const billData = caseData.bill_data as Record<string, unknown> | null;
        // Prefer the cross-document set computed server-side (bill + EOB) by the
        // audit pipeline; fall back to building a single-document set from the
        // stored bill line items.
        const persisted = billData?.normalizedCbs as NormalizedCBSSet | undefined;
        const lineItems = (billData?.lineItems as Array<Record<string, unknown>>) || [];
        if (persisted && Array.isArray(persisted.documents) && persisted.documents.length > 0) {
          setCbsSet(persisted);
          setDeadlines(calculateDeadlines(persisted));
        } else if (lineItems.length > 0) {
          const docId = `bill_${caseData.id}`;
          const cbsDoc = billExtractionToCBS(
            {
              lineItems: lineItems.map(li => ({
                cpt_code: String(li.cpt_code || ''),
                description: String(li.description || ''),
                date_of_service: String(li.date_of_service || ''),
                units: Number(li.units) || 1,
                billed_amount: Number(li.billed_amount) || 0,
                modifiers: Array.isArray(li.modifiers) ? li.modifiers.map(String) : [],
              })),
              billMetadata: {
                provider_name: String(caseData.provider_name || ''),
                provider_npi: '',
                bill_date: String(billData?.date_of_service || ''),
                patient_name: '',
                account_number: String(caseData.id || ''),
              },
            },
            docId
          );
          const normalized = normalizeCBSSet([cbsDoc]);
          setCbsSet(normalized);
          setDeadlines(calculateDeadlines(normalized));
        }
      } catch {
        // CBS build is non-blocking — if it fails, page still works
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
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) return <LoadingState />;
  if (fetchError || !caseRow) return <NotFoundState message={fetchError ?? "Unknown error"} />;

  const errors = caseRow.errors_found ?? [];

  // FHS computation handler (called after intake form answers)
  const handleFHSIntake = (inputs: FHSUserInputs) => {
    setFhsInputs(inputs);
    if (cbsSet) {
      const computed = calculateFinancialHarmScore(cbsSet, deadlines, inputs);
      setFhs(computed);
      // v8: Financial Outcome Prediction (Component O)
      const preds = predictAll(cbsSet, {
        hasActiveCollection: inputs.hasActiveCollectionActivity,
        hasCreditReporting: inputs.hasCreditReportingImpact,
      });
      setPredictions(preds);
      // v8: Advocacy Agent workflow (Component N) — existing or freshly planned
      const existing = getWorkflowForCase(String(caseRow.id));
      if (existing) {
        setWorkflow(existing);
      } else if (cbsSet.crossDocumentDiscrepancies.length > 0) {
        const wf = generateWorkflow(String(caseRow.id), cbsSet, deadlines, preds, false);
        saveWorkflow(wf);
        setWorkflow(wf);
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
    }
  };

  const handleAuthorizeWorkflow = () => {
    if (!workflow) return;
    const authorized = { ...workflow, consumerAuthorized: true };
    saveWorkflow(authorized);
    setWorkflow(authorized);
  };

  const handleActionUpdate = (actionId: string, status: AdvocacyAction["status"]) => {
    if (!workflow) return;
    let updated = recordActionUpdate(workflow, actionId, { status });
    updated = checkTermination(updated);
    saveWorkflow(updated);
    setWorkflow(updated);
  };
  const tierLabel = caseRow.bill_data?.tier
    ? caseRow.bill_data.tier.charAt(0).toUpperCase() + caseRow.bill_data.tier.slice(1)
    : null;
  const providerName = caseRow.provider_name ?? "Pending provider identification";
  const insurer = caseRow.insurance_type ?? caseRow.bill_data?.insuranceType ?? "Insurance on file";

  const billed = Number(caseRow.amount_billed ?? 0);
  const expected = Number(caseRow.amount_expected ?? 0);
  const savings = Number(caseRow.potential_savings ?? 0);
  const statusCfg = STATUS_DISPLAY[caseRow.status] ?? { label: caseRow.status };

  return (
    <Shell>
      {/* Breadcrumb */}
      <div style={{ paddingTop: "112px", paddingLeft: "64px", paddingRight: "64px" }}>
        <Link
          href="/dashboard"
          style={{ ...sans("12px", "#6B635C"), textDecoration: "none", transition: "color 0.2s" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#A89F96")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#6B635C")}
        >
          ← Dashboard
        </Link>
      </div>

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
          borderBottom: "1px solid #242424",
        }}
      >
        <h1 style={{ ...serif("48px", { lineHeight: 1.05 }) }}>{providerName}</h1>
        <div style={{ ...sans("14px", "#6B635C"), marginTop: "8px" }}>
          {insurer} · Filed {formatDate(caseRow.created_at)}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "16px" }}>
          <StatusPill status={caseRow.status} />
          {tierLabel && (
            <div
              style={{
                ...sans("10px", "#6B635C"),
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                border: "1px solid #242424",
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
            { value: formatCurrency(billed), sublabel: "amount billed", color: "#F5F0E8" },
            null,
            { value: formatCurrency(expected), sublabel: "amount expected", color: "#F5F0E8" },
            null,
            {
              value: formatCurrency(savings),
              sublabel: "potential savings",
              color: savings > 0 ? "#7A9E87" : "#6B635C",
            },
          ].map((item, i) =>
            item === null ? (
              <div
                key={i}
                style={{ width: "1px", backgroundColor: "#242424", alignSelf: "stretch", margin: "0 24px" }}
              />
            ) : (
              <div key={i}>
                <div
                  style={{
                    fontFamily: "var(--font-cormorant), Georgia, serif",
                    fontSize: "36px",
                    color: item.color,
                    lineHeight: 1,
                    fontWeight: 400,
                  }}
                >
                  {item.value}
                </div>
                <div style={{ ...sans("11px", "#6B635C"), marginTop: "6px" }}>{item.sublabel}</div>
              </div>
            )
          )}
        </div>

        {/* Letter CTA */}
        {letter ? (
          <div
            style={{
              backgroundColor: "#1A1A1A",
              borderLeft: "4px solid #C8A97E",
              padding: "20px 24px",
              marginTop: "32px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div style={{ ...serif("22px", { lineHeight: 1.2 }) }}>
              Your dispute package is ready.
            </div>
            <p style={{ ...sans("13px", "#A89F96") }}>
              Dispute letter, regulatory citations, and financial calculations — prefilled and ready to send.
            </p>
            <Link href={`/cases/${caseRow.id}/letter`} style={{ textDecoration: "none" }}>
              <span
                style={{
                  ...sans("10px", "#0D0D0D"),
                  backgroundColor: "#C8A97E",
                  padding: "10px 20px",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  display: "inline-block",
                }}
              >
                View your dispute package →
              </span>
            </Link>
          </div>
        ) : caseRow.status === "error_found" ? (
          <div
            style={{
              backgroundColor: "#1A1A1A",
              borderLeft: "4px solid #C47C6A",
              padding: "20px 24px",
              marginTop: "32px",
            }}
          >
            <div style={{ ...serif("22px", { lineHeight: 1.2 }) }}>
              {errors.length} {errors.length === 1 ? "error" : "errors"} found.
            </div>
            <p style={{ ...sans("13px", "#A89F96"), marginTop: "8px" }}>
              Your dispute letter is being prepared.
            </p>
          </div>
        ) : caseRow.status === "no_errors" ? (
          <div
            style={{
              backgroundColor: "#1A1A1A",
              borderLeft: "4px solid #7A9E87",
              padding: "20px 24px",
              marginTop: "32px",
            }}
          >
            <div style={{ ...serif("22px", { lineHeight: 1.2 }) }}>
              No errors found.
            </div>
            <p style={{ ...sans("13px", "#A89F96"), marginTop: "8px" }}>
              We audited every charge against the Medicare Physician Fee Schedule,
              NCCI edits, and MUE limits. This bill is clean.
            </p>
          </div>
        ) : (
          <div
            style={{
              backgroundColor: "#1A1A1A",
              borderLeft: "4px solid #4A90D9",
              padding: "20px 24px",
              marginTop: "32px",
            }}
          >
            <div style={{ ...serif("22px", { lineHeight: 1.2 }) }}>
              {statusCfg.label}.
            </div>
            <p style={{ ...sans("13px", "#A89F96"), marginTop: "8px" }}>
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
          {(errors.length > 0 || (cbsSet && cbsSet.totalDiscrepancies > 0)) && (
            <>
              {/* Financial Harm Score */}
              {fhs ? (
                <FinancialHarmScoreDisplay fhs={fhs} />
              ) : (
                <FHSIntakeForm onSubmit={handleFHSIntake} />
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

              {/* Cross-document discrepancies (bill vs. EOB) */}
              {cbsSet && cbsSet.crossDocumentDiscrepancies.length > 0 && (
                <div style={{ marginBottom: "48px" }}>
                  <div style={{ ...label("#6B635C"), marginBottom: "16px" }}>
                    Cross-document findings · bill vs. EOB
                  </div>
                  {cbsSet.crossDocumentDiscrepancies.map((d) => {
                    const sev =
                      d.severity === "critical" || d.severity === "high" ? "#C47C6A" : "#C8A97E";
                    return (
                      <div
                        key={d.discrepancyId}
                        style={{
                          backgroundColor: "#111111",
                          border: "1px solid #242424",
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
                        <p style={{ ...sans("13px", "#A89F96"), marginTop: "10px", lineHeight: 1.65 }}>
                          {d.description}
                        </p>
                        {d.applicableRegulations.length > 0 && (
                          <div style={{ ...sans("11px", "#6B635C"), marginTop: "10px", lineHeight: 1.55 }}>
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
              {cbsSet && cbsSet.timeline.length > 0 && (
                <FinancialTimeline
                  events={cbsSet.timeline}
                  totalDocuments={cbsSet.documents.length}
                  totalInconsistencies={cbsSet.documents.reduce(
                    (sum, d) => sum + d.temporalInconsistencies.length, 0
                  )}
                />
              )}
            </>
          )}

          {/* E&M review: questionnaire if unanswered, outcome callout if answered */}
          {hasEmFlag(errors) &&
            (caseRow.bill_data?.em_review ? (
              <EmOutcomeCallout review={caseRow.bill_data.em_review} />
            ) : (
              <div style={{ marginBottom: "48px" }}>
                <EmReviewPanel
                  caseId={caseRow.id}
                  flaggedCodes={getEmFlaggedCodes(errors)}
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

          <div style={{ ...label("#6B635C"), marginBottom: "24px" }}>Audit findings</div>

          {caseRow.status === "auditing" ? (
            <div style={{ textAlign: "center", paddingTop: "80px", paddingBottom: "80px" }}>
              <div style={{ ...serif("32px", { fontStyle: "italic", color: "#A89F96" }) }}>
                Audit in progress.
              </div>
              <p style={{ ...sans("14px", "#6B635C"), marginTop: "16px" }}>
                Your error report will populate here as soon as it&apos;s ready.
              </p>
              <div
                className="dot-pulse"
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "50%",
                  backgroundColor: "#4A90D9",
                  margin: "24px auto 0",
                }}
              />
            </div>
          ) : errors.length === 0 ? (
            expected === 0 ? (
              <div
                style={{
                  backgroundColor: "#111111",
                  border: "1px solid rgba(200,169,126,0.4)",
                  borderLeft: "4px solid #C8A97E",
                  padding: "32px",
                }}
              >
                <div style={{ ...serif("22px", { color: "#C8A97E", fontStyle: "italic" }) }}>
                  Reference data gap.
                </div>
                <p style={{ ...sans("13px", "#A89F96"), marginTop: "12px", lineHeight: 1.65 }}>
                  Fee schedule lookup returned no matches — the CPT codes on this
                  bill may not be in our reference data. This audit should not be
                  treated as exhaustive until the relevant codes are loaded.
                </p>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: "#111111",
                  border: "1px solid #242424",
                  padding: "32px",
                  textAlign: "center",
                }}
              >
                <div style={{ ...serif("26px", { color: "#7A9E87", fontStyle: "italic" }) }}>
                  Clean bill.
                </div>
                <p style={{ ...sans("13px", "#A89F96"), marginTop: "12px", lineHeight: 1.65 }}>
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
                  borderBottom: "1px solid #242424",
                }}
              >
                {["Code", "Issue", "Billed", "Expected", "Confidence"].map((h) => (
                  <span key={h} style={{ ...sans("11px", "#6B635C"), letterSpacing: "0.15em", textTransform: "uppercase" }}>
                    {h}
                  </span>
                ))}
              </div>

              {errors.map((err, i) => (
                <div key={`${err.cpt_code}-${i}`} style={{ borderBottom: "1px solid #1C1C1C" }}>
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
                    <span style={{ ...sans("12px", "#6B635C"), letterSpacing: "0.04em" }}>
                      {err.cpt_code}
                    </span>
                    <div>
                      <div style={{ ...sans("13px", "#F5F0E8") }}>
                        {errorTypeLabel(err.error_type)}
                        {err.description ? ` — ${err.description}` : ""}
                      </div>
                    </div>
                    <span style={{ ...sans("13px", "#A89F96") }}>
                      {formatCurrency(err.billed_amount)}
                    </span>
                    <span style={{ ...sans("13px", "#A89F96") }}>
                      {formatCurrency(err.expected_amount)}
                    </span>
                    <ConfidenceBadge confidence={err.confidence} />
                  </div>
                  <div
                    style={{
                      backgroundColor: "#111111",
                      padding: "16px 20px",
                      marginBottom: "0",
                    }}
                  >
                    <div
                      style={{
                        ...sans("10px", "#6B635C"),
                        letterSpacing: "0.2em",
                        textTransform: "uppercase",
                        marginBottom: "8px",
                      }}
                    >
                      Evidence
                    </div>
                    <p style={{ ...sans("13px", "#A89F96"), lineHeight: 1.65 }}>
                      {err.explanation}
                    </p>
                    <div style={{ ...sans("11px", "#6B635C"), marginTop: "8px", letterSpacing: "0.05em" }}>
                      Rule: {err.rule_violated}
                    </div>
                  </div>
                </div>
              ))}

              <div style={{ paddingTop: "24px", textAlign: "right" }}>
                <span style={{ ...sans("13px", "#6B635C") }}>Potential savings:</span>
                <span
                  style={{
                    fontFamily: "var(--font-cormorant), Georgia, serif",
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
              backgroundColor: "#111111",
              border: "1px solid #242424",
              padding: "24px",
            }}
          >
            <div style={{ ...label("#6B635C"), marginBottom: "16px" }}>Case summary</div>
            {[
              { k: "Status", v: statusCfg.label },
              { k: "Filed", v: formatDate(caseRow.created_at) },
              { k: "Insurance", v: insurer },
              { k: "Tier", v: tierLabel ?? "—" },
              { k: "Errors", v: String(errors.length) },
            ].map((row, i, arr) => (
              <div
                key={row.k}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderBottom: i < arr.length - 1 ? "1px solid #1C1C1C" : "none",
                }}
              >
                <span style={{ ...sans("12px", "#6B635C") }}>{row.k}</span>
                <span style={{ ...sans("13px", "#A89F96") }}>{row.v}</span>
              </div>
            ))}
          </div>

          {/* User notes */}
          {caseRow.bill_data?.userNotes && caseRow.bill_data.userNotes.trim() && (
            <div>
              <div style={{ ...label("#6B635C"), marginBottom: "12px" }}>Your notes</div>
              <div
                style={{
                  backgroundColor: "#111111",
                  border: "1px solid #242424",
                  padding: "16px 20px",
                }}
              >
                <p style={{ ...sans("13px", "#A89F96"), lineHeight: 1.65, whiteSpace: "pre-wrap" }}>
                  {caseRow.bill_data.userNotes}
                </p>
              </div>
            </div>
          )}

          {/* Potential savings highlight */}
          {savings > 0 && (
            <div
              style={{
                backgroundColor: "#111111",
                border: "1px solid #242424",
                padding: "24px",
              }}
            >
              <div style={{ ...label("#6B635C"), marginBottom: "12px" }}>Potential savings</div>
              <div
                style={{
                  fontFamily: "var(--font-cormorant), Georgia, serif",
                  fontSize: "44px",
                  color: "#7A9E87",
                  fontStyle: "italic",
                  fontWeight: 400,
                  lineHeight: 1,
                }}
              >
                {formatCurrency(savings)}
              </div>
              <div style={{ ...sans("12px", "#6B635C"), marginTop: "8px" }}>
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
