"use client";

import React, { useState, useEffect, useRef } from "react";
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
      <Link href="/" style={{ textDecoration: "none" }}>
        <span
          style={{
            ...sans("12px", "#F5F0E8"),
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
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
            style={{
              ...sans("11px", "#A89F96"),
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F0E8")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#A89F96")}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <Link href="/upload" style={{ textDecoration: "none" }}>
        <span
          style={{
            ...sans("11px", "#0D0D0D"),
            backgroundColor: "#C8A97E",
            padding: "12px 24px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight: 500,
            display: "inline-block",
          }}
        >
          Check my bill →
        </span>
      </Link>
    </nav>
  );
}

// ─── Mock data ────────────────────────────────────────────────────────────────
const CASES = [
  { id: "1", provider: "St. Mary's Hospital", insurer: "BlueCross BlueShield", bill: 8400, status: "Resolved", tier: "Resolve", savings: 2840, filed: "Mar 12, 2026", errors: 4 },
  { id: "2", provider: "Westside Radiology", insurer: "Aetna", bill: 1200, status: "Error Found", tier: "Audit", savings: null, filed: "Apr 2, 2026", errors: 3 },
  { id: "3", provider: "City Medical Center", insurer: "UnitedHealth", bill: 3600, status: "Auditing", tier: "Resolve", savings: null, filed: "Apr 14, 2026", errors: null },
  { id: "4", provider: "North Shore Orthopedics", insurer: "Cigna", bill: 5200, status: "Under Review", tier: "Dispute", savings: null, filed: "Mar 28, 2026", errors: 2 },
  { id: "5", provider: "Summit Labs", insurer: "BlueCross BlueShield", bill: 640, status: "Letter Ready", tier: "Dispute", savings: null, filed: "Apr 10, 2026", errors: 1 },
];

const NOTIFICATIONS = [
  { id: "n1", type: "success", title: "St. Mary's — Resolved", body: "$2,840 credit applied to your account. Case closed.", date: "Apr 1", caseId: "1", cta: null },
  { id: "n2", type: "alert", title: "Westside Radiology — Action needed", body: "3 errors found totaling $855. Upgrade to Dispute to get your letter.", date: "Apr 3", caseId: "2", cta: "Get letter →" },
  { id: "n3", type: "info", title: "North Shore — Response received", body: "Insurer acknowledged your dispute. Internal review underway. Expected response by May 12.", date: "Apr 10", caseId: "4", cta: null },
  { id: "n4", type: "warning", title: "Summit Labs — Letter ready", body: "Your dispute letter is ready to download and send. Deadline: May 10, 2026.", date: "Apr 10", caseId: "5", cta: "View letter →" },
];

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

// ─── StatusPill ───────────────────────────────────────────────────────────────
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

// ─── Savings countUp ──────────────────────────────────────────────────────────
function useSavingsCountUp(target: number) {
  const [count, setCount] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const duration = 1500;
    const startTime = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setCount(Math.round(easeOutCubic(progress) * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target]);

  return count;
}

// ─── Notification border color ────────────────────────────────────────────────
function notifBorderColor(type: string) {
  if (type === "success") return "#7A9E87";
  if (type === "alert") return "#C47C6A";
  if (type === "warning") return "#C8A97E";
  return "#4A90D9";
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const savings = useSavingsCountUp(2840);

  return (
    <div style={{ background: "#0D0D0D", minHeight: "100vh" }}>
      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .dot-pulse { animation: pulse-dot 1.5s ease-in-out infinite; }
      `}</style>
      <Nav />

      <div
        style={{
          paddingTop: "112px",
          paddingLeft: "64px",
          paddingRight: "64px",
          paddingBottom: "96px",
        }}
      >
        {/* Header row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: "64px",
          }}
        >
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ ...serif("56px", { lineHeight: 0.95 }), margin: 0 }}
          >
            Your cases.
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
            style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}
          >
            <div style={{ ...label("#6B635C"), marginBottom: "4px" }}>total recovered</div>
            <div
              style={{
                fontFamily: "var(--font-cormorant), Georgia, serif",
                fontSize: "48px",
                color: "#7A9E87",
                lineHeight: 1,
                fontWeight: 400,
                fontStyle: "italic",
              }}
            >
              ${savings.toLocaleString()}
            </div>
            <Link
              href="/upload"
              style={{
                ...sans("12px", "#C8A97E"),
                textDecoration: "none",
                letterSpacing: "0.1em",
                marginTop: "8px",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F0E8")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#C8A97E")}
            >
              Upload new bill →
            </Link>
          </motion.div>
        </div>

        {/* Upgrade banner (case 2) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.15 }}
          style={{
            backgroundColor: "#1A1A1A",
            borderLeft: "4px solid #C8A97E",
            padding: "20px 24px",
            marginBottom: "48px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "24px",
          }}
        >
          <div>
            <div style={{ ...serif("22px", { lineHeight: 1.2 }) }}>
              We found 3 errors on your Westside Radiology bill.
            </div>
            <p style={{ ...sans("13px", "#A89F96"), marginTop: "4px" }}>
              Potential savings: $855. Get your prefilled dispute letter for $39.
            </p>
          </div>
          <Link href="/cases/2" style={{ textDecoration: "none", flexShrink: 0 }}>
            <span
              style={{
                ...sans("10px", "#0D0D0D"),
                backgroundColor: "#C8A97E",
                padding: "12px 20px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                display: "inline-block",
              }}
            >
              Get my letter →
            </span>
          </Link>
        </motion.div>

        {/* Two-column body */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "2fr 1fr",
            gap: "48px",
            alignItems: "start",
          }}
        >
          {/* Left: cases */}
          <div>
            <div style={{ ...label("#6B635C"), marginBottom: "24px" }}>Active cases</div>
            {CASES.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 + i * 0.07 }}
                style={{
                  borderBottom: "1px solid #1C1C1C",
                  padding: "24px 0",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: "16px",
                }}
              >
                {/* Left block */}
                <div style={{ minWidth: "180px" }}>
                  <div style={{ ...serif("22px", { lineHeight: 1.2 }) }}>{c.provider}</div>
                  <div style={{ ...sans("12px", "#6B635C"), marginTop: "4px" }}>
                    {c.insurer} · ${c.bill.toLocaleString()}
                  </div>
                  <div style={{ ...sans("12px", "#6B635C"), marginTop: "2px" }}>
                    Filed {c.filed}
                  </div>
                </div>

                {/* Center block */}
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
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

                {/* Right block */}
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  {c.savings != null ? (
                    <>
                      <div style={{ ...serif("24px", { color: "#7A9E87" }) }}>
                        ${c.savings.toLocaleString()}
                      </div>
                      <div style={{ ...sans("11px", "#6B635C") }}>recovered</div>
                    </>
                  ) : c.errors && c.status === "Error Found" ? (
                    <>
                      <div style={{ ...sans("13px", "#C47C6A") }}>{c.errors} errors found</div>
                      <div style={{ ...sans("11px", "#6B635C") }}>potential recovery</div>
                    </>
                  ) : null}
                  <Link
                    href={`/cases/${c.id}`}
                    style={{
                      ...sans("12px", "#C8A97E"),
                      textDecoration: "none",
                      letterSpacing: "0.1em",
                      display: "block",
                      marginTop: "8px",
                      transition: "color 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F0E8")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#C8A97E")}
                  >
                    View details →
                  </Link>
                  {c.tier === "Dispute" && c.status === "Letter Ready" && (
                    <Link
                      href={`/cases/${c.id}/letter`}
                      style={{
                        ...sans("12px", "#C8A97E"),
                        textDecoration: "none",
                        letterSpacing: "0.1em",
                        display: "block",
                        marginTop: "4px",
                        transition: "color 0.2s",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F0E8")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#C8A97E")}
                    >
                      View letter →
                    </Link>
                  )}
                </div>
              </motion.div>
            ))}
          </div>

          {/* Right: notifications */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.35 }}
          >
            <div style={{ ...label("#6B635C"), marginBottom: "24px" }}>Notifications</div>
            {NOTIFICATIONS.map((n) => (
              <div
                key={n.id}
                style={{
                  borderBottom: "1px solid #1C1C1C",
                  paddingTop: "20px",
                  paddingBottom: "20px",
                  paddingLeft: "16px",
                  borderLeft: `3px solid ${notifBorderColor(n.type)}`,
                }}
              >
                <div style={{ ...sans("10px", "#6B635C"), marginBottom: "4px" }}>{n.date}</div>
                <div
                  style={{
                    ...sans("13px", "#F5F0E8"),
                    fontWeight: 500,
                    marginBottom: "4px",
                  }}
                >
                  {n.title}
                </div>
                <div style={{ ...sans("12px", "#A89F96"), lineHeight: 1.65 }}>{n.body}</div>
                {n.cta && (
                  <Link
                    href={n.cta === "View letter →" ? `/cases/${n.caseId}/letter` : `/cases/${n.caseId}`}
                    style={{
                      ...sans("12px", "#C8A97E"),
                      display: "block",
                      marginTop: "8px",
                      textDecoration: "none",
                      transition: "color 0.2s",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F0E8")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#C8A97E")}
                  >
                    {n.cta}
                  </Link>
                )}
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
