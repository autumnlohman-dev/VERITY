"use client";

import React, { use } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

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

// suppress TS warning — label is part of the design system but not used inline here
const label = (color = "#C8A97E"): React.CSSProperties => ({
  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
  fontSize: "11px",
  letterSpacing: "0.25em",
  textTransform: "uppercase" as const,
  color,
});

// ─── Letter line items ────────────────────────────────────────────────────────
const LETTER_ITEMS = [
  { desc: "Chest X-Ray, 2 views", code: "71046", billed: "$420", contracted: "$95", discrepancy: "$325 excess" },
  { desc: "ECG Interpretation", code: "93005", billed: "$380", contracted: "$0", discrepancy: "Bundled — improperly billed" },
  { desc: "Office Visit", code: "99213", billed: "$400", contracted: "$250", discrepancy: "$150 excess" },
];

// ─── Submission options ───────────────────────────────────────────────────────
const SUBMISSION_OPTIONS = [
  {
    method: "Submit online",
    color: "#4A90D9",
    detail: "Log in to your Aetna member portal at aetna.com/member → Claims → Dispute a Charge. Upload this letter and all enclosures as a single PDF.",
  },
  {
    method: "Send by fax",
    color: "#C8A97E",
    detail: "Fax to Aetna Claims Review: 1-860-975-3777. Include a cover sheet referencing Claim #WR-2024-8821. Keep your fax confirmation as proof.",
  },
  {
    method: "Send by mail",
    color: "#7A9E87",
    detail: "Aetna Insurance, Attn: Claims Review, P.O. Box 14079, Lexington, KY 40512. Use certified mail with return receipt so you have a dated proof of delivery.",
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div style={{ background: "#0D0D0D", minHeight: "100vh" }}>
      {/* Sticky top bar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          backgroundColor: "rgba(13,13,13,0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1C1C1C",
          padding: "16px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Link
          href={`/cases/${id}`}
          style={{ ...sans("12px", "#6B635C"), textDecoration: "none", transition: "color 0.2s" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#A89F96")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#6B635C")}
        >
          ← Case #WR-2024-8821
        </Link>
        <span
          className="hidden md:block"
          style={{ ...sans("11px", "#A89F96"), letterSpacing: "0.1em", textTransform: "uppercase" }}
        >
          Dispute Letter · Westside Radiology
        </span>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button
            onClick={() => window.print()}
            style={{
              ...sans("11px", "#A89F96"),
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              border: "1px solid #242424",
              backgroundColor: "transparent",
              padding: "8px 16px",
              cursor: "pointer",
              transition: "color 0.2s, border-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#F5F0E8";
              e.currentTarget.style.borderColor = "#3A3530";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#A89F96";
              e.currentTarget.style.borderColor = "#242424";
            }}
          >
            Print
          </button>
          <button
            onClick={() => console.log("download PDF")}
            style={{
              ...sans("11px", "#0D0D0D"),
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              backgroundColor: "#C8A97E",
              border: "none",
              padding: "8px 16px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Download PDF
          </button>
        </div>
      </div>

      {/* Deadline banner */}
      <div
        style={{
          backgroundColor: "#1A1A1A",
          border: "1px solid rgba(200,169,126,0.3)",
          padding: "16px 32px",
          textAlign: "center",
        }}
      >
        <span style={{ ...sans("13px", "#A89F96") }}>
          Submission deadline:{" "}
          <span style={{ color: "#C8A97E", fontWeight: 600 }}>May 18, 2026</span>
          {" · "}30 days from bill date. File before this date to preserve your dispute rights.
        </span>
      </div>

      {/* Document container */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          maxWidth: "720px",
          margin: "32px auto 0",
          backgroundColor: "#ffffff",
          paddingTop: "64px",
          paddingBottom: "48px",
          paddingLeft: "64px",
          paddingRight: "64px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
        }}
      >
        {/* Sender */}
        <div
          style={{
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: "13px",
            color: "#4A4540",
            lineHeight: 1.7,
            marginBottom: "32px",
          }}
        >
          <div>[Your Full Name]</div>
          <div>[Street Address]</div>
          <div>[City, State ZIP]</div>
          <div>[Email Address]</div>
          <div style={{ marginTop: "16px" }}>April 18, 2026</div>
        </div>

        {/* Recipient */}
        <div
          style={{
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: "13px",
            color: "#4A4540",
            lineHeight: 1.7,
            marginBottom: "24px",
          }}
        >
          <div>Aetna Insurance</div>
          <div>Attn: Claims Review Department</div>
          <div>P.O. Box 14079</div>
          <div>Lexington, KY 40512</div>
        </div>

        <div style={{ borderTop: "1px solid #E5E0DA" }} />

        {/* Re: */}
        <div style={{ marginTop: "24px", marginBottom: "8px" }}>
          <span
            style={{
              fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
              fontSize: "14px",
              color: "#1A1A1A",
              fontWeight: 600,
            }}
          >
            Re: Formal Billing Dispute — Member ID: [Your ID] | Claim #: WR-2024-8821
          </span>
        </div>
        <div
          style={{
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: "13px",
            color: "#4A4540",
            marginBottom: "8px",
          }}
        >
          Provider: Westside Radiology | Bill Date: March 28, 2026 | Total Billed: $1,200.00
        </div>

        <div style={{ borderTop: "1px solid #E5E0DA", margin: "24px 0" }} />

        {/* Body */}
        <div
          style={{
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: "14px",
            color: "#2A2520",
            lineHeight: 1.8,
          }}
        >
          <p style={{ marginBottom: "20px" }}>Dear Claims Review Department,</p>

          <p style={{ marginBottom: "20px" }}>
            I am writing to formally dispute the charges on the bill and claim referenced above. Upon careful review of
            my Explanation of Benefits and the terms of my insurance contract with Aetna, I have identified the
            following billing discrepancies:
          </p>

          {/* Table */}
          <table
            style={{
              border: "1px solid #E0DAD4",
              width: "100%",
              borderCollapse: "collapse",
              margin: "24px 0",
              fontSize: "13px",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#F7F4F0" }}>
                {["Description", "CPT Code", "Billed", "Contracted Rate", "Discrepancy"].map((h) => (
                  <th
                    key={h}
                    style={{
                      fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                      fontSize: "11px",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: "#6B635C",
                      padding: "10px 14px",
                      textAlign: "left",
                      borderBottom: "1px solid #E0DAD4",
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LETTER_ITEMS.map((item, i) => (
                <tr
                  key={item.code}
                  style={{ borderBottom: i < LETTER_ITEMS.length - 1 ? "1px solid #E0DAD4" : "none" }}
                >
                  {[item.desc, item.code, item.billed, item.contracted, item.discrepancy].map((cell, j) => (
                    <td
                      key={j}
                      style={{
                        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                        fontSize: "13px",
                        color: "#2A2520",
                        padding: "10px 14px",
                      }}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
              {/* Footer row */}
              <tr style={{ backgroundColor: "#F7F4F0" }}>
                <td
                  colSpan={2}
                  style={{
                    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                    fontSize: "13px",
                    color: "#2A2520",
                    padding: "10px 14px",
                    fontWeight: 600,
                  }}
                >
                  Total disputed
                </td>
                <td style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: "13px", color: "#2A2520", padding: "10px 14px", fontWeight: 600 }}>$1,200</td>
                <td style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: "13px", color: "#2A2520", padding: "10px 14px", fontWeight: 600 }}>$345</td>
                <td style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: "13px", color: "#2A2520", padding: "10px 14px", fontWeight: 600 }}>$855 in overcharges</td>
              </tr>
            </tbody>
          </table>

          <p style={{ marginBottom: "20px" }}>
            Under my insurance contract and applicable state regulations, charges that exceed the negotiated contracted
            rate are the provider&apos;s responsibility and cannot be transferred to the patient. Furthermore, the ECG
            Interpretation (CPT 93005) is a bundled service included within the primary office visit (CPT 99213) under
            your standard bundling rules and cannot be separately itemized.
          </p>

          <p style={{ marginBottom: "20px" }}>
            I request that Aetna investigate these charges and require Westside Radiology to issue a corrected
            Explanation of Benefits reflecting the accurate contracted rates. I request written confirmation of receipt
            of this dispute within 10 business days and a resolution within 30 days, as required by applicable state
            insurance regulations.
          </p>

          <p style={{ marginBottom: "48px" }}>
            If I do not receive a satisfactory response within 30 days of this letter, I will escalate this dispute to
            the [State] Department of Insurance and request an independent external review under the No Surprises Act.
          </p>

          <p style={{ marginBottom: "48px" }}>Sincerely,</p>

          <div>
            <div
              style={{
                borderBottom: "1px solid #1A1A1A",
                width: "120px",
                marginBottom: "8px",
              }}
            />
            <span
              style={{
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                fontSize: "13px",
                color: "#1A1A1A",
              }}
            >
              [Your Name]
            </span>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #E5E0DA", margin: "32px 0 0" }} />
        <p
          style={{
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: "12px",
            color: "#6B635C",
            fontStyle: "italic",
            marginTop: "20px",
          }}
        >
          Enclosures: Itemized Medical Bill (Westside Radiology, March 28, 2026), Explanation of Benefits (Aetna),
          Insurance Card
        </p>
      </motion.div>

      {/* Submission instructions */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.15 }}
        style={{
          maxWidth: "720px",
          margin: "0 auto",
          backgroundColor: "#111111",
          border: "1px solid #242424",
          padding: "32px",
        }}
      >
        <div style={{ ...label("#6B635C"), marginBottom: "32px" }}>How to submit this letter</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {SUBMISSION_OPTIONS.map((opt, i) => (
            <div
              key={opt.method}
              style={{
                borderBottom: i < SUBMISSION_OPTIONS.length - 1 ? "1px solid #1C1C1C" : "none",
                paddingBottom: i < SUBMISSION_OPTIONS.length - 1 ? "24px" : "0",
                marginBottom: i < SUBMISSION_OPTIONS.length - 1 ? "24px" : "0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    backgroundColor: opt.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                    fontSize: "14px",
                    color: "#F5F0E8",
                    fontWeight: 500,
                  }}
                >
                  {opt.method}
                </span>
              </div>
              <p style={{ ...sans("13px", "#A89F96"), lineHeight: 1.65 }}>{opt.detail}</p>
            </div>
          ))}
        </div>
        <p style={{ ...sans("12px", "#6B635C"), fontStyle: "italic", marginTop: "24px", lineHeight: 1.65 }}>
          Keep copies of everything you send and note the date submitted. Your insurer is required by law to acknowledge
          receipt within 10 business days and respond within 30.
        </p>
      </motion.div>

      {/* Upsell card */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.25 }}
        style={{
          maxWidth: "720px",
          margin: "16px auto 96px",
          backgroundColor: "#111111",
          border: "1px solid rgba(200,169,126,0.4)",
          padding: "32px",
        }}
      >
        <h3 style={{ ...serif("28px", { lineHeight: 1.2 }) }}>Rather not handle this yourself?</h3>
        <p style={{ ...sans("14px", "#A89F96"), lineHeight: 1.75, marginTop: "12px" }}>
          Upgrade to Resolve — we file this letter, handle all insurer communication, and escalate to second-level
          appeal if denied. You pay 25% of what we recover. Nothing if we don&apos;t.
        </p>
        <Link href="/upload?tier=resolve" style={{ textDecoration: "none" }}>
          <span
            style={{
              ...sans("11px", "#0D0D0D"),
              backgroundColor: "#C8A97E",
              padding: "16px 32px",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              fontWeight: 500,
              display: "inline-block",
              marginTop: "24px",
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLSpanElement).style.opacity = "0.85")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLSpanElement).style.opacity = "1")}
          >
            Let ClearClaim handle it →
          </span>
        </Link>
      </motion.div>
    </div>
  );
}
