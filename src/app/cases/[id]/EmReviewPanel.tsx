"use client";

import React, { useMemo, useState } from "react";
import * as Sentry from "@sentry/nextjs";
import {
  EM_BLOCKS,
  EM_QUESTIONS,
  filterOutEmErrors,
  type EmOutcome,
  type EmReview,
} from "@/lib/emReview";
import type { BillingError } from "@/lib/errorDetection";

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

interface CaseDataForLetter {
  provider_name: string;
  insurance_type: string;
  amount_billed: number;
  amount_expected: number;
  date_of_service?: string;
  userNotes?: string;
}

interface Props {
  caseId: string;
  flaggedCodes: string[];
  errors: BillingError[];
  caseData: CaseDataForLetter;
  onComplete: (review: EmReview, letterGenerated: boolean) => void;
}

export default function EmReviewPanel({
  caseId,
  flaggedCodes,
  errors,
  caseData,
  onComplete,
}: Props) {
  const [selections, setSelections] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitStage, setSubmitStage] = useState<
    "idle" | "saving" | "generating_letter"
  >("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const allAnswered = EM_QUESTIONS.every(
    (q) => selections[q.id] !== undefined
  );

  const questionsByBlock = useMemo(() => {
    const map = new Map<string, typeof EM_QUESTIONS>();
    for (const q of EM_QUESTIONS) {
      const existing = map.get(q.block) ?? [];
      existing.push(q);
      map.set(q.block, existing);
    }
    return map;
  }, []);

  const setSelection = (questionId: string, optionIndex: number) => {
    setSelections((prev) => ({ ...prev, [questionId]: optionIndex }));
  };

  const handleSubmit = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setSubmitStage("saving");

    const answers = EM_QUESTIONS.map((q) => ({
      questionId: q.id,
      optionIndex: selections[q.id],
    }));

    try {
      const res = await fetch("/api/em-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, answers }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(
          json.error ?? "Couldn't save your answers. Please try again."
        );
        setSubmitting(false);
        setSubmitStage("idle");
        return;
      }

      const review = json.review as EmReview;
      const outcome = review.outcome as EmOutcome;

      // Decide which errors (if any) the letter should be generated from.
      const errorsForLetter =
        outcome === "cleared" ? filterOutEmErrors(errors) : errors;

      if (errorsForLetter.length === 0) {
        // All issues resolved by clearing the E&M flag — no letter needed.
        onComplete(review, false);
        return;
      }

      setSubmitStage("generating_letter");

      const letterRes = await fetch("/api/generate-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          errors: errorsForLetter,
          caseData,
          emReview: outcome === "cleared" ? undefined : review,
        }),
      });

      if (letterRes.status === 402) {
        // The dispute package is gated behind a purchase, membership, or promo
        // code. Send the user to the letter-page paywall; ?promo=1 opens the
        // promo-code field so logged-in beta users can redeem in this path too.
        window.location.href = `/cases/${caseId}/letter?promo=1`;
        return;
      }

      if (!letterRes.ok) {
        const letterJson = await letterRes.json().catch(() => ({}));
        const errMsg =
          letterJson.error ??
          "Letter generation is temporarily unavailable. Please try again in a few minutes.";
        Sentry.captureMessage("Letter generation failed after E&M review", {
          level: "error",
          tags: { location: "em-review-panel" },
          extra: { status: letterRes.status, body: letterJson },
        });
        setSubmitError(errMsg);
        setSubmitting(false);
        setSubmitStage("idle");
        return;
      }

      onComplete(review, true);
    } catch (err) {
      console.error("E&M review submit failed:", err);
      Sentry.captureException(err, {
        tags: { location: "em-review-panel", stage: submitStage },
      });
      setSubmitError("Couldn't save your answers. Please try again.");
      setSubmitting(false);
      setSubmitStage("idle");
    }
  };

  const buttonLabel =
    submitStage === "saving"
      ? "Saving answers…"
      : submitStage === "generating_letter"
      ? "Generating letter…"
      : "Submit answers";

  return (
    <div
      style={{
        backgroundColor: "#111111",
        border: "1px solid #242424",
        borderLeft: "3px solid #C8A97E",
        padding: "32px",
      }}
    >
      <div style={{ ...label("#C8A97E"), marginBottom: "12px" }}>
        E&amp;M visit review
      </div>
      <h2 style={{ ...serif("32px", { lineHeight: 1.15 }) }}>
        We flagged a visit charge — answer a few questions to confirm.
      </h2>
      <p
        style={{
          ...sans("14px", "#A89F96"),
          marginTop: "16px",
          maxWidth: "640px",
          lineHeight: 1.65,
        }}
      >
        Your bill includes an evaluation &amp; management charge
        {flaggedCodes.length > 1 ? "s" : ""}{" "}
        ({flaggedCodes.join(", ")}). Under CMS 2021 E&amp;M guidelines, these
        are priced by complexity or total time — not a fixed per-visit rate. A
        few quick questions help us decide whether the billed level matches
        what actually happened during your visit.
      </p>

      <div
        style={{
          marginTop: "40px",
          display: "flex",
          flexDirection: "column",
          gap: "40px",
        }}
      >
        {EM_BLOCKS.map((blockName, bi) => {
          const questions = questionsByBlock.get(blockName) ?? [];
          return (
            <div key={blockName}>
              <div style={{ ...label("#6B635C"), marginBottom: "16px" }}>
                Block {bi + 1} — {blockName}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
                {questions.map((q) => {
                  const selected = selections[q.id];
                  return (
                    <div key={q.id}>
                      <div
                        style={{
                          ...sans("15px", "#F5F0E8", {
                            lineHeight: 1.5,
                            fontWeight: 400,
                          }),
                        }}
                      >
                        {q.prompt}
                      </div>
                      {q.help && (
                        <div
                          style={{
                            ...sans("12px", "#6B635C", {
                              marginTop: "4px",
                              fontStyle: "italic",
                              lineHeight: 1.5,
                            }),
                          }}
                        >
                          {q.help}
                        </div>
                      )}
                      <div
                        style={{
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "8px",
                          marginTop: "12px",
                        }}
                      >
                        {q.options.map((opt, oi) => {
                          const active = selected === oi;
                          return (
                            <button
                              key={oi}
                              type="button"
                              onClick={() => setSelection(q.id, oi)}
                              style={{
                                ...sans(
                                  "13px",
                                  active ? "#0D0D0D" : "#A89F96"
                                ),
                                backgroundColor: active
                                  ? "#C8A97E"
                                  : "transparent",
                                border: `1px solid ${active ? "#C8A97E" : "#2A2A2A"}`,
                                padding: "10px 16px",
                                cursor: "pointer",
                                transition:
                                  "background-color 0.2s, color 0.2s, border-color 0.2s",
                                textAlign: "left",
                                fontWeight: active ? 500 : 400,
                              }}
                              onMouseEnter={(e) => {
                                if (!active) {
                                  e.currentTarget.style.borderColor = "#4A4A4A";
                                  e.currentTarget.style.color = "#F5F0E8";
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (!active) {
                                  e.currentTarget.style.borderColor = "#2A2A2A";
                                  e.currentTarget.style.color = "#A89F96";
                                }
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {submitError && (
        <div
          role="alert"
          style={{
            ...sans("13px", "#C47C6A"),
            marginTop: "28px",
            padding: "12px 16px",
            border: "1px solid rgba(196,124,106,0.4)",
            backgroundColor: "rgba(196,124,106,0.08)",
            lineHeight: 1.6,
          }}
        >
          {submitError}
        </div>
      )}

      <div
        style={{
          marginTop: "32px",
          display: "flex",
          gap: "16px",
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!allAnswered || submitting}
          style={{
            ...sans(
              "11px",
              allAnswered && !submitting ? "#0D0D0D" : "#6B635C"
            ),
            backgroundColor:
              allAnswered && !submitting ? "#C8A97E" : "#1A1A1A",
            padding: "14px 28px",
            border: "none",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight: 500,
            cursor: allAnswered && !submitting ? "pointer" : "not-allowed",
            transition: "background-color 0.2s, color 0.2s",
          }}
        >
          {buttonLabel}
        </button>
        {!allAnswered && (
          <span style={{ ...sans("12px", "#6B635C") }}>
            Answer all {EM_QUESTIONS.length} questions to continue.
          </span>
        )}
      </div>
    </div>
  );
}
