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

const label = (color = "#C8A97E"): React.CSSProperties => ({
  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
  fontSize: "11px",
  letterSpacing: "0.25em",
  textTransform: "uppercase" as const,
  color,
});

// ─── Nav (copied from landing page) ──────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
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
      <Link href="/" style={{ textDecoration: "none" }}>
        <span style={{ ...sans("12px", "#F5F0E8"), letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 500 }}>
          ClearClaim
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
          Check my bill →
        </span>
      </Link>
    </nav>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type LineItem = {
  code: string;
  desc: string;
  billed: number;
  contracted: number;
  status: "High Confidence Error" | "Likely Overcharge" | "Valid";
  evidence: string;
  recovery: number;
};

type CaseData = {
  id: string;
  provider: string;
  insurer: string;
  bill: number;
  status: string;
  tier: "Audit" | "Dispute" | "Resolve";
  date: string;
  savings: number | null;
  lineItems: LineItem[];
  timeline: string[];
  totalBilled: number;
  totalContracted: number;
  totalRecovery: number;
};

// ─── Mock data ────────────────────────────────────────────────────────────────
const CASE_DATA: Record<string, CaseData> = {
  "1": {
    id: "1",
    provider: "St. Mary's Hospital",
    insurer: "BlueCross BlueShield",
    bill: 8400,
    status: "Resolved",
    tier: "Resolve",
    date: "Mar 12, 2026",
    savings: 2840,
    totalBilled: 2255,
    totalContracted: 915,
    totalRecovery: 1340,
    lineItems: [
      { code: "99285", desc: "ED Visit — Level 5", billed: 1200, contracted: 380, status: "High Confidence Error", evidence: "Your EOB authorizes Level 3 care. Level 5 billing requires documented critical care criteria. No supporting documentation was provided by the facility.", recovery: 820 },
      { code: "36415", desc: "Routine Venipuncture", billed: 180, contracted: 0, status: "High Confidence Error", evidence: "Under CPT bundling rules and your plan contract, venipuncture (36415) is included in the E&M visit code and cannot be billed as a separate line item.", recovery: 180 },
      { code: "93005", desc: "Electrocardiogram", billed: 320, contracted: 145, status: "Likely Overcharge", evidence: "Your plan's contracted rate for CPT 93005 is $145. The facility billed $320 — a $175 excess above the negotiated rate.", recovery: 175 },
      { code: "85025", desc: "Complete Blood Count", billed: 210, contracted: 45, status: "Likely Overcharge", evidence: "Contracted rate: $45. Billed: $210. Overcharge of $165.", recovery: 165 },
      { code: "82947", desc: "Glucose Test", billed: 95, contracted: 95, status: "Valid", evidence: "Charge matches your plan's contracted rate. No action needed.", recovery: 0 },
      { code: "99213", desc: "Follow-up Office Visit", billed: 250, contracted: 250, status: "Valid", evidence: "Charge matches contracted rate.", recovery: 0 },
    ],
    timeline: [
      "Mar 12 — Documents uploaded and case opened",
      "Mar 13 — Audit complete. 4 errors, $1,340 in recoverable overcharges.",
      "Mar 15 — Dispute letter filed with St. Mary's Billing Dept.",
      "Mar 22 — Hospital opened internal review.",
      "Apr 1 — $2,840 credit applied to account. Case closed.",
    ],
  },
  "2": {
    id: "2",
    provider: "Westside Radiology",
    insurer: "Aetna",
    bill: 1200,
    status: "Error Found",
    tier: "Audit",
    date: "Apr 2, 2026",
    savings: null,
    totalBilled: 1200,
    totalContracted: 345,
    totalRecovery: 855,
    lineItems: [
      { code: "71046", desc: "Chest X-Ray, 2 views", billed: 420, contracted: 95, status: "High Confidence Error", evidence: "Your plan's contracted rate for CPT 71046 is $95. You were billed $420 — $325 above the negotiated rate with no documented medical necessity for the excess.", recovery: 325 },
      { code: "93005", desc: "ECG Interpretation", billed: 380, contracted: 0, status: "High Confidence Error", evidence: "ECG interpretation is bundled within your primary office visit (CPT 99213) under your plan's bundling rules. It cannot be billed as a separate procedure.", recovery: 380 },
      { code: "99213", desc: "Office Visit", billed: 400, contracted: 250, status: "Likely Overcharge", evidence: "Contracted rate for CPT 99213 is $250. Overcharge of $150.", recovery: 150 },
    ],
    timeline: [
      "Apr 2 — Documents uploaded.",
      "Apr 3 — Audit complete. 3 errors, $855 in potential recovery.",
      "Apr 4 — Waiting for tier upgrade to file dispute.",
    ],
  },
  "3": {
    id: "3",
    provider: "City Medical Center",
    insurer: "UnitedHealth",
    bill: 3600,
    status: "Auditing",
    tier: "Resolve",
    date: "Apr 14, 2026",
    savings: null,
    totalBilled: 3600,
    totalContracted: 0,
    totalRecovery: 0,
    lineItems: [],
    timeline: ["Apr 14 — Documents uploaded. Audit underway."],
  },
  "4": {
    id: "4",
    provider: "North Shore Orthopedics",
    insurer: "Cigna",
    bill: 5200,
    status: "Under Review",
    tier: "Dispute",
    date: "Mar 28, 2026",
    savings: null,
    totalBilled: 4430,
    totalContracted: 2340,
    totalRecovery: 2090,
    lineItems: [
      { code: "27447", desc: "Total Knee Replacement", billed: 3200, contracted: 2100, status: "Likely Overcharge", evidence: "Contracted rate for CPT 27447 is $2,100. Billed amount of $3,200 exceeds the negotiated rate by $1,100.", recovery: 1100 },
      { code: "99232", desc: "Subsequent Hospital Care", billed: 890, contracted: 0, status: "High Confidence Error", evidence: "Post-surgical inpatient care (99232) is included in the global surgical period for CPT 27447 and cannot be separately billed within 90 days of the procedure.", recovery: 890 },
      { code: "J1030", desc: "Methylprednisolone Injection", billed: 340, contracted: 240, status: "Likely Overcharge", evidence: "Drug rate exceeds AWP contracted basis. Expected: $240.", recovery: 100 },
    ],
    timeline: [
      "Mar 28 — Documents uploaded.",
      "Mar 29 — Audit complete. 2 errors, $2,090 recoverable.",
      "Mar 31 — Dispute letter sent to Cigna.",
      "Apr 8 — Cigna acknowledged receipt. Review period: 30 days.",
    ],
  },
  "5": {
    id: "5",
    provider: "Summit Labs",
    insurer: "BlueCross BlueShield",
    bill: 640,
    status: "Letter Ready",
    tier: "Dispute",
    date: "Apr 10, 2026",
    savings: null,
    totalBilled: 640,
    totalContracted: 18,
    totalRecovery: 622,
    lineItems: [
      { code: "80053", desc: "Comprehensive Metabolic Panel", billed: 640, contracted: 18, status: "High Confidence Error", evidence: "Contracted rate for CPT 80053 is $18. Billed amount of $640 is $622 above the negotiated rate — a 3,500% overcharge.", recovery: 622 },
    ],
    timeline: [
      "Apr 10 — Documents uploaded.",
      "Apr 10 — Audit complete. 1 error, $622 recoverable.",
      "Apr 11 — Dispute letter generated and ready.",
    ],
  },
};

// ─── Status config ────────────────────────────────────────────────────────────
type StatusKey = "Auditing" | "Error Found" | "Letter Ready" | "Dispute Filed" | "Under Review" | "Resolved" | "Escalated";

const STATUS_CONFIG: Record<StatusKey, { dot: string; text: string; pulse?: boolean }> = {
  Auditing: { dot: "#4A90D9", text: "#A89F96", pulse: true },
  "Error Found": { dot: "#C47C6A", text: "#C47C6A" },
  "Letter Ready": { dot: "#C8A97E", text: "#C8A97E" },
  "Dispute Filed": { dot: "#C8A97E", text: "#C8A97E" },
  "Under Review": { dot: "#A89F96", text: "#A89F96" },
  Resolved: { dot: "#7A9E87", text: "#7A9E87" },
  Escalated: { dot: "#C47C6A", text: "#C47C6A", pulse: true },
};

function StatusPill({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status as StatusKey] ?? { dot: "#A89F96", text: "#A89F96" };
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
      <span style={{ ...sans("12px", cfg.text) }}>{status}</span>
    </div>
  );
}

// ─── Line status colors ───────────────────────────────────────────────────────
const LINE_STATUS_STYLE: Record<string, React.CSSProperties> = {
  "High Confidence Error": { color: "#C47C6A", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--font-dm-sans), system-ui, sans-serif" },
  "Likely Overcharge": { color: "#C8A97E", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--font-dm-sans), system-ui, sans-serif" },
  Valid: { color: "#3A3530", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--font-dm-sans), system-ui, sans-serif" },
  "Under Review": { color: "#A89F96", fontSize: "11px", letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: "var(--font-dm-sans), system-ui, sans-serif" },
};

// ─── Recovery card value ──────────────────────────────────────────────────────
function recoveryDisplay(c: CaseData): { value: string; color: string } {
  if (c.id === "1") return { value: "$2,840", color: "#7A9E87" };
  if (c.id === "2") return { value: "$855", color: "#C8A97E" };
  if (c.id === "3") return { value: "—", color: "#6B635C" };
  if (c.id === "4") return { value: "$2,090", color: "#C8A97E" };
  if (c.id === "5") return { value: "$622", color: "#C8A97E" };
  return { value: "—", color: "#6B635C" };
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function CaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const c = CASE_DATA[id] ?? CASE_DATA["1"];
  const isAuditWithErrors = c.tier === "Audit" && c.status === "Error Found";
  const isAuditing = c.status === "Auditing";
  const recovery = recoveryDisplay(c);

  return (
    <div style={{ background: "#0D0D0D", minHeight: "100vh" }}>
      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .dot-pulse { animation: pulse-dot 1.5s ease-in-out infinite; }
      `}</style>
      <Nav />

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

      {/* Bill Summary Header */}
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
        <h1 style={{ ...serif("48px", { lineHeight: 1.05 }) }}>{c.provider}</h1>
        <div style={{ ...sans("14px", "#6B635C"), marginTop: "8px" }}>
          {c.insurer} · Filed {c.date}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "16px" }}>
          <StatusPill status={c.status} />
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
            {c.tier}
          </div>
        </div>

        {/* Stats row */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1px 1fr 1px 1fr",
            marginTop: "32px",
            maxWidth: "600px",
          }}
        >
          {[
            { value: `$${c.totalBilled.toLocaleString()}`, sublabel: "total billed", color: "#F5F0E8" },
            null,
            { value: `$${c.totalContracted.toLocaleString()}`, sublabel: "expected (contracted)", color: "#F5F0E8" },
            null,
            {
              value: isAuditing ? "—" : `$${c.totalRecovery.toLocaleString()}`,
              sublabel: "potential overcharge",
              color: isAuditing ? "#6B635C" : "#C47C6A",
            },
          ].map((item, i) =>
            item === null ? (
              <div key={i} style={{ width: "1px", backgroundColor: "#242424", alignSelf: "stretch", margin: "0 24px" }} />
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

        {/* Audit upgrade banner for case 2 */}
        {isAuditWithErrors && (
          <div
            style={{
              backgroundColor: "#1A1A1A",
              borderLeft: "4px solid #C8A97E",
              padding: "20px 24px",
              marginTop: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
            }}
          >
            <div style={{ ...serif("22px", { lineHeight: 1.2 }) }}>
              3 errors found. $855 in potential recovery.
            </div>
            <p style={{ ...sans("13px", "#A89F96") }}>
              Get a prefilled dispute letter and submission guide for $39. Or let us handle everything.
            </p>
            <div style={{ display: "flex", gap: "12px" }}>
              <Link href="/upload?tier=dispute" style={{ textDecoration: "none" }}>
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
                  Get my letter — $39
                </span>
              </Link>
              <Link href="/upload?tier=resolve" style={{ textDecoration: "none" }}>
                <span
                  style={{
                    ...sans("10px", "#C8A97E"),
                    border: "1px solid #C8A97E",
                    padding: "10px 20px",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    display: "inline-block",
                  }}
                >
                  Let us handle it →
                </span>
              </Link>
            </div>
          </div>
        )}
      </motion.div>

      {/* Two-column body */}
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
        {/* Left: Audit findings */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
        >
          <div style={{ ...label("#6B635C"), marginBottom: "24px" }}>Audit findings</div>

          {isAuditing ? (
            <div style={{ textAlign: "center", paddingTop: "80px", paddingBottom: "80px" }}>
              <div
                style={{
                  fontFamily: "var(--font-cormorant), Georgia, serif",
                  fontSize: "32px",
                  color: "#A89F96",
                  fontStyle: "italic",
                  fontWeight: 400,
                }}
              >
                Audit in progress.
              </div>
              <p style={{ ...sans("14px", "#6B635C"), marginTop: "16px" }}>
                Your error report will be ready within 24 hours.
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
          ) : c.lineItems.length === 0 ? (
            <div style={{ textAlign: "center", paddingTop: "48px" }}>
              <p style={{ ...sans("14px", "#6B635C") }}>No findings yet.</p>
            </div>
          ) : (
            <div>
              {/* Table header */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "72px 1fr 80px 100px 180px",
                  gap: "12px",
                  paddingBottom: "12px",
                  borderBottom: "1px solid #242424",
                }}
              >
                {["Code", "Charge", "Billed", "Contracted", "Status"].map((h) => (
                  <span key={h} style={{ ...sans("11px", "#6B635C"), letterSpacing: "0.15em", textTransform: "uppercase" }}>
                    {h}
                  </span>
                ))}
              </div>

              {c.lineItems.map((item) => (
                <div key={item.code} style={{ borderBottom: "1px solid #1C1C1C" }}>
                  {/* Main row */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "72px 1fr 80px 100px 180px",
                      gap: "12px",
                      paddingTop: "16px",
                      paddingBottom: item.status !== "Valid" ? "8px" : "16px",
                      alignItems: "start",
                    }}
                  >
                    <span style={{ ...sans("12px", "#6B635C"), letterSpacing: "0.04em" }}>{item.code}</span>
                    <span style={{ ...sans("13px", "#F5F0E8") }}>{item.desc}</span>
                    <span style={{ ...sans("13px", "#A89F96") }}>${item.billed.toLocaleString()}</span>
                    <span style={{ ...sans("13px", "#A89F96") }}>${item.contracted.toLocaleString()}</span>
                    <span style={LINE_STATUS_STYLE[item.status] ?? { ...sans("11px", "#A89F96") }}>
                      {item.status}
                    </span>
                  </div>
                  {/* Evidence row */}
                  {item.status !== "Valid" && (
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
                      <p style={{ ...sans("13px", "#A89F96"), lineHeight: 1.65 }}>{item.evidence}</p>
                      <div style={{ ...sans("12px", "#7A9E87"), marginTop: "8px" }}>
                        Potential recovery: ${item.recovery.toLocaleString()}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Total recovery row */}
              <div style={{ paddingTop: "24px", textAlign: "right" }}>
                <span style={{ ...sans("13px", "#6B635C") }}>Total potential recovery:</span>
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
                  ${c.totalRecovery.toLocaleString()}
                </span>
              </div>

              {/* CTA for Dispute tier */}
              {c.tier === "Dispute" && c.status !== "Resolved" && (
                <div
                  style={{
                    backgroundColor: "#1A1A1A",
                    border: "1px solid rgba(200,169,126,0.4)",
                    padding: "24px",
                    marginTop: "48px",
                  }}
                >
                  <div style={{ ...serif("24px", { lineHeight: 1.2 }) }}>Ready to escalate?</div>
                  <p style={{ ...sans("13px", "#A89F96"), marginTop: "8px" }}>
                    If your Dispute-tier letter is denied, upgrade to Resolve — we take over from here.
                  </p>
                  <div style={{ display: "flex", gap: "12px", marginTop: "16px" }}>
                    <Link href="/upload?tier=resolve" style={{ textDecoration: "none" }}>
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
                        Upgrade to Resolve
                      </span>
                    </Link>
                    <Link href={`/cases/${c.id}/letter`} style={{ textDecoration: "none" }}>
                      <span
                        style={{
                          ...sans("10px", "#C8A97E"),
                          border: "1px solid #C8A97E",
                          padding: "10px 20px",
                          letterSpacing: "0.2em",
                          textTransform: "uppercase",
                          display: "inline-block",
                        }}
                      >
                        View my letter →
                      </span>
                    </Link>
                  </div>
                </div>
              )}

              {/* Resolve tier managing card */}
              {c.tier === "Resolve" && (c.status === "Letter Ready" || c.status === "Dispute Filed") && (
                <div
                  style={{
                    backgroundColor: "#111111",
                    border: "1px solid rgba(122,158,135,0.4)",
                    padding: "24px",
                    marginTop: "48px",
                  }}
                >
                  <p style={{ ...sans("13px", "#7A9E87") }}>
                    ClearClaim is managing your dispute.
                  </p>
                </div>
              )}
            </div>
          )}
        </motion.div>

        {/* Right: Timeline, docs, recovery */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
          style={{ display: "flex", flexDirection: "column", gap: "40px" }}
        >
          {/* Dispute timeline */}
          <div>
            <div style={{ ...label("#6B635C"), marginBottom: "24px" }}>Dispute timeline</div>
            <div style={{ position: "relative", paddingLeft: "24px" }}>
              <div
                style={{
                  position: "absolute",
                  left: "4px",
                  top: "8px",
                  bottom: "8px",
                  width: "1px",
                  backgroundColor: "#242424",
                }}
              />
              {c.timeline.map((event, i) => (
                <div
                  key={i}
                  style={{
                    position: "relative",
                    paddingBottom: i < c.timeline.length - 1 ? "32px" : 0,
                  }}
                >
                  <div
                    style={{
                      position: "absolute",
                      left: "-22px",
                      top: "5px",
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: i === c.timeline.length - 1 ? "#C8A97E" : "#2A2A2A",
                    }}
                  />
                  <div style={{ ...sans("10px", "#6B635C"), marginBottom: "2px" }}>
                    {event.split(" — ")[0]}
                  </div>
                  <div style={{ ...sans("13px", "#A89F96"), lineHeight: 1.5 }}>
                    {event.split(" — ").slice(1).join(" — ")}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Documents */}
          <div>
            <div style={{ ...label("#6B635C"), marginBottom: "16px" }}>Documents</div>
            {["Medical Bill (PDF)", "Explanation of Benefits", "Insurance Card"].map((doc, i, arr) => (
              <div
                key={doc}
                style={{
                  borderBottom: i < arr.length - 1 ? "1px solid #1C1C1C" : "none",
                  padding: "12px 0",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                }}
              >
                <div style={{ ...sans("13px", "#A89F96") }}>{doc}</div>
              </div>
            ))}
          </div>

          {/* Recovery card */}
          <div
            style={{
              backgroundColor: "#111111",
              border: "1px solid #242424",
              padding: "24px",
            }}
          >
            <div style={{ ...label("#6B635C"), marginBottom: "12px" }}>Potential recovery</div>
            <div
              style={{
                fontFamily: "var(--font-cormorant), Georgia, serif",
                fontSize: "44px",
                color: recovery.color,
                fontStyle: "italic",
                fontWeight: 400,
                lineHeight: 1,
              }}
            >
              {recovery.value}
            </div>
            <div style={{ ...sans("12px", "#6B635C"), marginTop: "8px" }}>
              {c.status === "Resolved" ? "recovered" : "estimated from audit"}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
