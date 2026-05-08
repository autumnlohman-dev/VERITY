"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

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
        backgroundColor: scrolled ? "rgba(13,13,13,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        transition: "background-color 0.4s, backdrop-filter 0.4s",
        padding: "20px 64px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Link href="/" style={{ textDecoration: "none" }}>
        <span style={{ ...sans("12px", "#F5F0E8"), letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 500 }}>
          ClearClaim
        </span>
      </Link>
      <div className="hidden md:flex" style={{ gap: "40px" }}>
        {[
          { lbl: "How it works", href: "/how-it-works" },
          { lbl: "Pricing", href: "/pricing" },
          { lbl: "FAQ", href: "/#faq" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{ ...sans("11px", "#A89F96"), letterSpacing: "0.15em", textTransform: "uppercase", textDecoration: "none", transition: "color 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F0E8")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#A89F96")}
          >
            {link.lbl}
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

// ─── Footer (copied from landing page) ───────────────────────────────────────
function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid #242424",
        padding: "64px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: "48px",
      }}
    >
      <div>
        <div style={{ ...sans("12px", "#F5F0E8"), letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "8px" }}>ClearClaim</div>
        <div style={{ ...sans("11px", "#6B635C"), marginBottom: "16px" }}>Medical bill advocacy.</div>
        <div style={{ ...sans("11px", "#6B635C"), maxWidth: "260px", lineHeight: 1.6 }}>
          ClearClaim is an administrative advocacy service. We are not a law firm and do not provide legal advice.
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {[
          { lbl: "How it works", href: "/how-it-works" },
          { lbl: "Pricing", href: "/pricing" },
          { lbl: "Dashboard", href: "/dashboard" },
          { lbl: "FAQ", href: "/#faq" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{ ...sans("11px", "#6B635C"), textDecoration: "none", transition: "color 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#A89F96")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#6B635C")}
          >
            {link.lbl}
          </Link>
        ))}
      </div>
      <div>
        <div style={{ ...sans("11px", "#6B635C"), marginBottom: "4px" }}>© 2026 ClearClaim</div>
        <div style={{ ...sans("11px", "#6B635C") }}>All rights reserved.</div>
      </div>
    </footer>
  );
}

// ─── FAQ Item (copied from landing page) ─────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid #242424" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "24px 0",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          gap: "24px",
        }}
      >
        <span style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: "20px", color: "#F5F0E8", fontWeight: 400 }}>
          {q}
        </span>
        <ChevronDown
          size={18}
          color="#6B635C"
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s" }}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ overflow: "hidden" }}
          >
            <p style={{ ...sans("14px", "#A89F96"), lineHeight: 1.75, paddingBottom: "24px" }}>{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Pricing FAQs ─────────────────────────────────────────────────────────────
const PRICING_FAQS = [
  {
    q: "Why should I start with the free audit?",
    a: "Because you should know what's wrong before deciding how to fight it. The free Audit tier scans your bill and shows you every error — no credit card, no commitment. If we find nothing, you owe nothing and lose nothing.",
  },
  {
    q: "Is the membership worth it?",
    a: "If you see doctors more than 3–4 times a year, almost certainly. Every new bill you receive gets automatically audited. Most members catch at least one error every few months — usually worth far more than the subscription.",
  },
];

// ─── Comparison table data ────────────────────────────────────────────────────
type CellVal = "check" | "dash" | string;

const TABLE_ROWS: { feature: string; audit: CellVal; dispute: CellVal }[] = [
  { feature: "Upload and scan bill", audit: "check", dispute: "check" },
  { feature: "Error report with confidence scores", audit: "check", dispute: "check" },
  { feature: "Evidence for each flagged item", audit: "check", dispute: "check" },
  { feature: "CPT code cross-reference", audit: "check", dispute: "check" },
  { feature: "Insurer-specific dispute letter", audit: "dash", dispute: "check" },
  { feature: "Portal, fax & mail instructions", audit: "dash", dispute: "check" },
  { feature: "Deadline tracker", audit: "dash", dispute: "check" },
  { feature: "Email reminders", audit: "dash", dispute: "check" },
  { feature: "Auto-audit on new bills (membership)", audit: "dash", dispute: "✓ membership" },
  { feature: "Upfront cost", audit: "$0", dispute: "[PRICE] or [PRICE]/mo" },
];

function TableCell({ val }: { val: CellVal }) {
  if (val === "check") return <span style={{ color: "#7A9E87", fontSize: "15px" }}>✓</span>;
  if (val === "dash") return <span style={{ color: "#2A2A2A", fontSize: "15px" }}>—</span>;
  return <span style={{ ...sans("12px", "#F5F0E8") }}>{val}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PricingPage() {
  const fadeUp = {
    initial: { opacity: 0, y: 30 },
    whileInView: { opacity: 1, y: 0 } as { opacity: number; y: number },
    viewport: { once: true },
    transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  };

  return (
    <div style={{ background: "#0D0D0D", minHeight: "100vh" }}>
      <Nav />

      {/* ── Hero ── */}
      <section style={{ paddingTop: "160px", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div style={{ ...label(), marginBottom: "32px" }}>Pricing</div>
          <h1
            style={{
              fontFamily: "var(--font-cormorant), Georgia, serif",
              fontSize: "clamp(64px, 8vw, 96px)",
              color: "#F5F0E8",
              lineHeight: 0.92,
              fontWeight: 400,
            }}
          >
            Pay for the letter.
            <br />
            <em style={{ fontStyle: "italic" }}>Or audit free,</em>
            <br />
            forever.
          </h1>
          <p style={{ ...sans("15px", "#A89F96"), marginTop: "32px", maxWidth: "520px", lineHeight: 1.75 }}>
            Two tiers. Start free. Most people start with the free audit — no credit card, no commitment.
          </p>
        </motion.div>
      </section>

      {/* ── "Most people start free" callout ── */}
      <section style={{ paddingTop: "64px", paddingBottom: "64px", paddingLeft: "64px", paddingRight: "64px", backgroundColor: "#111111" }}>
        <motion.div
          {...fadeUp}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "32px",
          }}
        >
          <div style={{ ...serif("32px", { lineHeight: 1.15 }) }}>
            No card. No commitment. Just the truth about your bill.
          </div>
          <Link href="/upload?tier=audit" style={{ textDecoration: "none", flexShrink: 0 }}>
            <span
              style={{
                ...sans("11px", "#0D0D0D"),
                backgroundColor: "#C8A97E",
                padding: "16px 32px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                fontWeight: 500,
                display: "inline-block",
              }}
            >
              Start free →
            </span>
          </Link>
        </motion.div>
      </section>

      {/* ── Tier cards ── */}
      <section style={{ paddingTop: "96px", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "stretch",
            gap: "16px",
            maxWidth: "880px",
            margin: "0 auto",
            flexWrap: "wrap",
          }}
        >
          {/* AUDIT */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
            style={{
              backgroundColor: "#111111",
              border: "1px solid #242424",
              padding: "32px",
              display: "flex",
              flexDirection: "column",
              flex: "1 1 360px",
              maxWidth: "420px",
            }}
          >
            <div style={{ ...serif("32px", { marginBottom: "4px" }) }}>Audit</div>
            <div style={{ ...serif("52px", { fontStyle: "italic", lineHeight: 1, marginBottom: "4px" }) }}>Free</div>
            <div style={{ ...sans("12px", "#6B635C") }}>always</div>
            <div style={{ borderTop: "1px solid #242424", margin: "24px 0" }} />
            <div style={{ ...serif("18px", { fontStyle: "italic", color: "#A89F96", lineHeight: 1.4, marginBottom: "24px" }) }}>
              see exactly what they got wrong.
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px", marginBottom: "32px" }}>
              {[
                "› Upload your bill and documents",
                "› AI scans every CPT code and charge",
                "› Error report with confidence scores",
                "› Evidence behind each flagged item",
                "› No dispute filed — see it all first",
              ].map((f) => (
                <div key={f} style={{ ...sans("13px", "#A89F96") }}>{f}</div>
              ))}
            </div>
            <Link href="/upload?tier=audit" style={{ textDecoration: "none" }}>
              <div
                style={{
                  ...sans("11px", "#C8A97E"),
                  border: "1px solid #C8A97E",
                  padding: "14px",
                  textAlign: "center",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "background-color 0.2s, color 0.2s",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.backgroundColor = "#C8A97E";
                  el.style.color = "#0D0D0D";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLDivElement;
                  el.style.backgroundColor = "transparent";
                  el.style.color = "#C8A97E";
                }}
              >
                See what&apos;s wrong — free
              </div>
            </Link>
          </motion.div>

          {/* DISPUTE */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
            style={{
              backgroundColor: "#111111",
              border: "1px solid rgba(200,169,126,0.4)",
              padding: "32px",
              position: "relative",
              display: "flex",
              flexDirection: "column",
              flex: "1 1 360px",
              maxWidth: "420px",
            }}
          >
            <div
              style={{
                display: "inline-block",
                backgroundColor: "rgba(200,169,126,0.15)",
                color: "#C8A97E",
                border: "1px solid rgba(200,169,126,0.3)",
                fontSize: "9px",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
                padding: "4px 8px",
                marginBottom: "12px",
                fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
              }}
            >
              Most popular
            </div>
            <div style={{ ...serif("32px", { marginBottom: "4px" }) }}>Dispute</div>
            <div style={{ ...serif("52px", { fontStyle: "italic", lineHeight: 1, marginBottom: "4px" }) }}>[PRICE]</div>
            <div style={{ ...sans("12px", "#6B635C") }}>per letter, or [PRICE]/mo</div>
            <div style={{ borderTop: "1px solid #242424", margin: "24px 0" }} />
            <div style={{ ...serif("18px", { fontStyle: "italic", color: "#A89F96", lineHeight: 1.4, marginBottom: "24px" }) }}>
              your weapon. ready to send.
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px", marginBottom: "32px" }}>
              {[
                "› Everything in Audit, plus:",
                "› Insurer-specific prefilled dispute letter",
                "› Step-by-step submission guide",
                "› Portal link, fax number, and mailing address",
                "› Deadline tracker",
                "› Email reminders",
                "› Membership: every new bill audited automatically",
              ].map((f) => (
                <div key={f} style={{ ...sans("13px", "#A89F96") }}>{f}</div>
              ))}
            </div>
            <Link href="/upload?tier=dispute" style={{ textDecoration: "none" }}>
              <div
                style={{
                  ...sans("11px", "#0D0D0D"),
                  backgroundColor: "#C8A97E",
                  padding: "14px",
                  textAlign: "center",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                }}
              >
                Get my dispute letter
              </div>
            </Link>
          </motion.div>

        </div>
      </section>

      {/* ── Comparison table ── */}
      <section style={{ paddingTop: "0", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <motion.div {...fadeUp}>
          <div style={{ ...label(), marginBottom: "32px" }}>Full comparison</div>
        </motion.div>
        <motion.div
          {...fadeUp}
          style={{
            backgroundColor: "#111111",
            border: "1px solid #242424",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr",
              borderBottom: "1px solid #242424",
              backgroundColor: "#1A1A1A",
            }}
          >
            {[
              { h: "Feature", col: "#6B635C" },
              { h: "Audit — Free", col: "#A89F96" },
              { h: "Dispute — [PRICE]/letter", col: "#C8A97E" },
            ].map(({ h, col }, i) => (
              <div
                key={h}
                style={{
                  padding: "16px 20px",
                  borderLeft: i > 0 ? "1px solid #242424" : "none",
                }}
              >
                <span style={{ ...sans("11px", col), letterSpacing: "0.15em", textTransform: "uppercase" }}>{h}</span>
              </div>
            ))}
          </div>

          {/* Rows */}
          {TABLE_ROWS.map((row, i) => (
            <div
              key={row.feature}
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr 1fr",
                borderBottom: i < TABLE_ROWS.length - 1 ? "1px solid #1C1C1C" : "none",
                backgroundColor: i % 2 === 1 ? "#0D0D0D" : "transparent",
              }}
            >
              <div style={{ padding: "14px 20px" }}>
                <span style={{ ...sans("13px", "#A89F96") }}>{row.feature}</span>
              </div>
              {[row.audit, row.dispute].map((val, j) => (
                <div
                  key={j}
                  style={{
                    padding: "14px 20px",
                    borderLeft: "1px solid #1C1C1C",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <TableCell val={val} />
                </div>
              ))}
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── FAQ ── */}
      <section style={{ paddingTop: "0", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <motion.div {...fadeUp}>
          <div style={{ ...label(), marginBottom: "24px" }}>Pricing questions</div>
          <h2 style={{ ...serif("48px", { lineHeight: 1.05, marginBottom: "64px" }) }}>
            Everything you need to know.
          </h2>
        </motion.div>
        <div style={{ maxWidth: "720px" }}>
          {PRICING_FAQS.map((faq) => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
          <div style={{ borderTop: "1px solid #242424" }} />
        </div>
      </section>

      <Footer />
    </div>
  );
}
