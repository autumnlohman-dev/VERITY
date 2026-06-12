"use client";

import { useEffect, useState } from "react";

// Staged progress for the bill audit (guest + signed-in). The audit is a single
// long request (vision extraction → pricing → NCCI checks) with no streaming, so
// the scan used to look frozen. We narrate plausible stages on a gently slowing
// timer and HOLD on the final stage — it only resolves when the real response
// arrives and the parent unmounts this (success) or flips to the error phase.
// The UI must never become an infinite spinner: the `error` phase always offers
// a retry and a start-over.

const STAGES = [
  "Reading your bill…",
  "Extracting line items…",
  "Pricing against Medicare fee schedules…",
  "Checking NCCI bundling rules…",
  "Compiling your findings…",
];

const sans = (size: string, color: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
  fontSize: size,
  color,
  ...extra,
});

const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-cormorant), Georgia, serif",
  fontSize: size,
  color: "#221C14",
  lineHeight: 1.1,
  fontWeight: 400,
  ...extra,
});

export function AuditProgress({
  phase,
  error,
  onRetry,
  onBack,
}: {
  phase: "running" | "error";
  error?: string | null;
  onRetry: () => void;
  onBack: () => void;
}) {
  // The parent remounts this via `key={attempt}` on every (re)run, so `active`
  // naturally starts at 0 for each fresh audit — no reset effect needed.
  const [active, setActive] = useState(0);

  // Advance one stage at a time, slowing as we go, and stop at the last stage.
  // We deliberately never mark the final stage "done" here — completion is owned
  // by the real response.
  useEffect(() => {
    if (phase !== "running") return;
    if (active >= STAGES.length - 1) return;
    const delay = 2000 + active * 700;
    const t = setTimeout(() => setActive((a) => Math.min(a + 1, STAGES.length - 1)), delay);
    return () => clearTimeout(t);
  }, [phase, active]);

  if (phase === "error") {
    return (
      <div style={{ maxWidth: "440px", margin: "0 auto", textAlign: "center" }}>
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            backgroundColor: "#B0604C",
            margin: "0 auto 24px",
          }}
        />
        <h1 style={{ ...serif("36px") }}>We couldn&apos;t finish the audit.</h1>
        <p role="alert" style={{ ...sans("14px", "#5F5648"), marginTop: 16, lineHeight: 1.65 }}>
          {error || "Something went wrong while reading your bill. Please try again."}
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 32 }}>
          <button
            onClick={onRetry}
            style={{
              ...sans("11px", "#221C14", {
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                fontWeight: 500,
              }),
              backgroundColor: "#C8A97E",
              border: "none",
              padding: "14px 28px",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            onClick={onBack}
            style={{
              ...sans("11px", "#221C14", { letterSpacing: "0.2em", textTransform: "uppercase" }),
              background: "transparent",
              border: "1px solid #C2B7A3",
              padding: "14px 28px",
              cursor: "pointer",
            }}
          >
            Start over
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "460px", margin: "0 auto" }}>
      <style>{`
        @keyframes ap-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes ap-spin { to { transform: rotate(360deg) } }
        .ap-pulse { animation: ap-pulse 1.4s ease-in-out infinite; }
        .ap-spin { animation: ap-spin 0.9s linear infinite; }
      `}</style>
      <div
        style={{
          ...sans("11px", "#C8A97E", { letterSpacing: "0.25em", textTransform: "uppercase" }),
          marginBottom: 16,
        }}
      >
        Auditing your bill
      </div>
      <h1 style={{ ...serif("40px"), marginBottom: 10 }}>Scanning every charge.</h1>
      <p style={{ ...sans("14px", "#5F5648"), marginBottom: 36, lineHeight: 1.6 }}>
        This usually takes under a minute. Keep this tab open — we&apos;ll show your
        results the moment they&apos;re ready.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {STAGES.map((stage, i) => {
          const done = i < active;
          const current = i === active;
          return (
            <div key={stage} style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span
                style={{
                  width: 18,
                  height: 18,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {done ? (
                  <span style={{ color: "#5E7E66", fontSize: 14 }}>✓</span>
                ) : current ? (
                  <span
                    className="ap-spin"
                    style={{
                      display: "inline-block",
                      width: 13,
                      height: 13,
                      borderRadius: "50%",
                      border: "2px solid rgba(200,169,126,0.35)",
                      borderTopColor: "#C8A97E",
                    }}
                  />
                ) : (
                  <span
                    style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#CFC6B4" }}
                  />
                )}
              </span>
              <span
                className={current ? "ap-pulse" : ""}
                style={{
                  ...sans("14px", done ? "#5E7E66" : current ? "#221C14" : "#A99F8C"),
                  fontWeight: current ? 500 : 400,
                }}
              >
                {stage}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
