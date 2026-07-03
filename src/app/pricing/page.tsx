"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { startMembershipCheckout, rememberCheckoutIntent } from "@/lib/checkout";
import { createClient } from "@/lib/supabase/client";

// ─── Style helpers (exact copy from landing page) ─────────────────────────────
const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-cormorant), Georgia, serif",
  fontSize: size,
  color: "#221C14",
  lineHeight: 1,
  fontWeight: 400,
  ...extra,
});

const sans = (size: string, color = "#5F5648", extra?: React.CSSProperties): React.CSSProperties => ({
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
        backgroundColor: scrolled ? "rgba(235,229,217,0.85)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        transition: "background-color 0.4s, backdrop-filter 0.4s",
        padding: "20px 64px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span style={{ ...sans("15px", "#221C14"), letterSpacing: "0.42em", textTransform: "uppercase", fontWeight: 300, paddingLeft: "0.42em", lineHeight: 1 }}>
            Verity™
          </span>
          <span style={{ ...sans("8px", "#8A7F6E"), letterSpacing: "0.18em", textTransform: "uppercase", paddingLeft: "0.42em", lineHeight: 1 }}>
            Med Claim
          </span>
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
            style={{ ...sans("11px", "#5F5648"), letterSpacing: "0.15em", textTransform: "uppercase", textDecoration: "none", transition: "color 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#221C14")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#5F5648")}
          >
            {link.lbl}
          </Link>
        ))}
      </div>
      <Link href="/upload" style={{ textDecoration: "none" }}>
        <span style={{ ...sans("11px", "#221C14"), backgroundColor: "#C8A97E", padding: "12px 24px", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 500, display: "inline-block" }}>
          Check my bill →
        </span>
      </Link>
    </nav>
  );
}

// ─── Footer (copied from landing page) ───────────────────────────────────────
function Footer() {
  return (
    <footer
      className="r-grid-1"
      style={{
        borderTop: "1px solid #D8CFBE",
        padding: "64px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        gap: "48px",
      }}
    >
      <div>
        <div style={{ ...sans("12px", "#221C14"), letterSpacing: "0.34em", textTransform: "uppercase", fontWeight: 300, paddingLeft: "0.34em", lineHeight: 1 }}>Verity™</div>
        <div style={{ ...sans("8px", "#8A7F6E"), letterSpacing: "0.2em", textTransform: "uppercase", paddingLeft: "0.34em", marginTop: "5px", marginBottom: "16px" }}>Med Claim</div>
        <div style={{ ...sans("11px", "#8A7F6E"), maxWidth: "260px", lineHeight: 1.6 }}>
          Verity is an administrative advocacy service. We are not a law firm and do not provide legal advice.
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
            style={{ ...sans("11px", "#8A7F6E"), textDecoration: "none", transition: "color 0.2s" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#5F5648")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#8A7F6E")}
          >
            {link.lbl}
          </Link>
        ))}
      </div>
      <div>
        <div style={{ ...sans("11px", "#8A7F6E"), marginBottom: "4px" }}>© 2026 Verity</div>
        <div style={{ ...sans("11px", "#8A7F6E"), marginBottom: "16px" }}>All rights reserved.</div>
        <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
          <Link href="/privacy" style={{ ...sans("11px", "#8A7F6E"), textDecoration: "none" }}>Privacy</Link>
          <Link href="/terms" style={{ ...sans("11px", "#8A7F6E"), textDecoration: "none" }}>Terms</Link>
        </div>
        <div style={{ ...sans("10.5px", "#8A7F6E"), lineHeight: 1.6, maxWidth: "240px" }}>The Verity™ audit method, scoring models, and datasets are proprietary and confidential. Patent Pending — 41 claims, 13 independent claim categories.</div>
      </div>
    </footer>
  );
}

// ─── FAQ Item (copied from landing page) ─────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid #D8CFBE" }}>
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
        <span style={{ fontFamily: "var(--font-cormorant), Georgia, serif", fontSize: "20px", color: "#221C14", fontWeight: 400 }}>
          {q}
        </span>
        <ChevronDown
          size={18}
          color="#8A7F6E"
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
            <p style={{ ...sans("14px", "#5F5648"), lineHeight: 1.75, paddingBottom: "24px" }}>{a}</p>
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
    q: "Should I pay per bill or join the membership?",
    a: "If you have a single bill to fight, the $39 Single Dispute covers it — letter, appeal, and submission guide for that one bill. If you see doctors more than a few times a year, or you're managing care for a family or a parent, the $19/mo membership almost always pays for itself: every new bill gets audited automatically and you get unlimited dispute and escalation letters.",
  },
  {
    q: "Can I upgrade mid-case?",
    a: "Yes, at any time. Start free on Audit, move to a Single Dispute for one bill, or join the membership whenever you want ongoing coverage — you never have to re-upload or start over.",
  },
  {
    q: "What does the membership actually do between bills?",
    a: "Every new bill or EOB you upload is audited automatically and cross-checked against CMS reference data, and when something is wrong you get the full dispute package without paying again. If a dispute is denied or ignored, escalation letters to regulators, credit bureaus, and collectors are included.",
  },
];

// ─── Comparison table data ────────────────────────────────────────────────────
type CellVal = "check" | "dash" | string;

const TABLE_ROWS: { feature: string; audit: CellVal; dispute: CellVal; member: CellVal }[] = [
  { feature: "Full bill audit — every code and charge checked, with evidence and citations", audit: "check", dispute: "check", member: "check" },
  { feature: "Bills covered", audit: "Report only", dispute: "1 bill", member: "Unlimited" },
  { feature: "Ready-to-send dispute package (letter, citations, submission guide)", audit: "dash", dispute: "check", member: "check" },
  { feature: "Appeal letter if denied", audit: "dash", dispute: "check", member: "check" },
  { feature: "Deadline tracker with urgency alerts", audit: "dash", dispute: "check", member: "check" },
  { feature: "Every new bill audited automatically", audit: "dash", dispute: "dash", member: "check" },
  { feature: "Escalation & regulator letters (DOI, CMS, CFPB, credit bureaus, collectors)", audit: "dash", dispute: "dash", member: "check" },
  { feature: "Outcome prediction before you file", audit: "dash", dispute: "dash", member: "check" },
  { feature: "Priority support", audit: "dash", dispute: "dash", member: "check" },
  { feature: "Price", audit: "$0", dispute: "$39 one-time", member: "$19/mo · $149/yr" },
];

function TableCell({ val }: { val: CellVal }) {
  if (val === "check") return <span style={{ color: "#5E7E66", fontSize: "15px" }}>✓</span>;
  if (val === "dash") return <span style={{ color: "#CFC6B4", fontSize: "15px" }}>—</span>;
  return <span style={{ ...sans("12px", "#221C14") }}>{val}</span>;
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PricingPage() {
  // Membership CTA: logged-in users go straight to Stripe Checkout; guests keep
  // routing into the signup funnel, but we remember the chosen plan so they land
  // in checkout immediately after authenticating (see resumePendingCheckout).
  const handleStartMembership = async (plan: "monthly" | "annual") => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) {
      void startMembershipCheckout(plan);
      return;
    }
    rememberCheckoutIntent({ type: "membership", plan });
    window.location.href = "/login";
  };

  const fadeUp = {
    initial: { opacity: 0, y: 30 },
    whileInView: { opacity: 1, y: 0 } as { opacity: number; y: number },
    viewport: { once: true },
    transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
  };

  return (
    <div className="page-root" style={{ background: "#EBE5D9", minHeight: "100vh" }}>
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
              color: "#221C14",
              lineHeight: 0.92,
              fontWeight: 400,
            }}
          >
            Free to find.
            <br />
            <em style={{ fontStyle: "italic" }}>Cheap to fix.</em>
            <br />
            Watched for good.
          </h1>
          <p style={{ ...sans("15px", "#5F5648"), marginTop: "32px", maxWidth: "520px", lineHeight: 1.75 }}>
            The audit is always free. Pay $39 for the letter on one bill, or join the membership and we watch every bill
            you get. No credit card to start.
          </p>
        </motion.div>
      </section>

      {/* ── "Most people start free" callout ── */}
      <section style={{ paddingTop: "64px", paddingBottom: "64px", paddingLeft: "64px", paddingRight: "64px", backgroundColor: "#F4EFE6" }}>
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
                ...sans("11px", "#221C14"),
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

      {/* ── 3 tier cards ── */}
      <section style={{ paddingTop: "96px", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <div
          className="r-grid-1"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "16px",
            alignItems: "stretch",
          }}
        >
          {/* AUDIT */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
            style={{
              backgroundColor: "#F4EFE6",
              border: "1px solid #D8CFBE",
              padding: "32px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ ...serif("32px", { marginBottom: "4px" }) }}>Audit</div>
            <div style={{ ...serif("52px", { fontStyle: "italic", lineHeight: 1, marginBottom: "4px" }) }}>Free</div>
            <div style={{ ...sans("12px", "#8A7F6E") }}>always</div>
            <div style={{ borderTop: "1px solid #D8CFBE", margin: "24px 0" }} />
            <div style={{ ...serif("18px", { fontStyle: "italic", color: "#5F5648", lineHeight: 1.4, marginBottom: "24px" }) }}>
              see exactly what they got wrong.
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px", marginBottom: "32px" }}>
              {[
                "› Upload your bill and EOB",
                "› Every code and charge checked against CMS data",
                "› Full error report with evidence",
                "› No card, no commitment",
              ].map((f) => (
                <div key={f} style={{ ...sans("13px", "#5F5648") }}>{f}</div>
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
                  el.style.color = "#221C14";
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
              backgroundColor: "#F4EFE6",
              border: "1px solid #D8CFBE",
              padding: "32px",
              position: "relative",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ ...serif("32px", { marginBottom: "4px" }) }}>Single Dispute</div>
            <div style={{ ...serif("52px", { fontStyle: "italic", lineHeight: 1, marginBottom: "4px" }) }}>$39</div>
            <div style={{ ...sans("12px", "#8A7F6E") }}>one-time, for one bill</div>
            <div style={{ borderTop: "1px solid #D8CFBE", margin: "24px 0" }} />
            <div style={{ ...serif("18px", { fontStyle: "italic", color: "#5F5648", lineHeight: 1.4, marginBottom: "24px" }) }}>
              one bill. ready to send.
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px", marginBottom: "32px" }}>
              {[
                "› Everything in Audit, plus:",
                "› Ready-to-send dispute letter with citations",
                "› Appeal letter if your dispute is denied",
                "› Step-by-step submission guide",
                "› Deadline tracker with urgency alerts",
              ].map((f) => (
                <div key={f} style={{ ...sans("13px", "#5F5648") }}>{f}</div>
              ))}
            </div>
            <Link href="/upload?tier=dispute" style={{ textDecoration: "none" }}>
              <div
                style={{
                  ...sans("11px", "#C8A97E"),
                  border: "1px solid #C8A97E",
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

          {/* MEMBERSHIP */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.3 }}
            style={{
              backgroundColor: "#F4EFE6",
              border: "1.5px solid #C8A97E",
              padding: "32px",
              position: "relative",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                display: "inline-block",
                backgroundColor: "#C8A97E",
                color: "#221C14",
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
            <div style={{ ...serif("32px", { marginBottom: "4px" }) }}>Membership</div>
            <div style={{ ...serif("52px", { fontStyle: "italic", lineHeight: 1, marginBottom: "4px" }) }}>$19<span style={{ fontSize: "22px" }}>/mo</span></div>
            <div style={{ ...sans("12px", "#8A7F6E") }}>or $149/yr — two months free</div>
            <div style={{ borderTop: "1px solid #D8CFBE", margin: "24px 0" }} />
            <div style={{ ...serif("18px", { fontStyle: "italic", color: "#5F5648", lineHeight: 1.4, marginBottom: "24px" }) }}>
              your ongoing bill watchdog.
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "10px", marginBottom: "32px" }}>
              {[
                "› Everything in Single Dispute, unlimited:",
                "› Unlimited audits and dispute packages",
                "› Every new bill you upload audited automatically",
                "› Escalation & regulator letters (DOI, CMS, CFPB, credit bureaus, collectors)",
                "› Outcome prediction before you file",
                "› Priority support",
              ].map((f) => (
                <div key={f} style={{ ...sans("13px", "#5F5648") }}>{f}</div>
              ))}
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleStartMembership("monthly")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleStartMembership("monthly");
              }}
              style={{
                ...sans("11px", "#221C14"),
                backgroundColor: "#C8A97E",
                padding: "14px",
                textAlign: "center",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Start membership
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleStartMembership("annual")}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleStartMembership("annual");
              }}
              style={{
                ...sans("11px", "#8A7F6E"),
                textAlign: "center",
                marginTop: "12px",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
                textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}
            >
              or $149/yr — two months free
            </div>
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
            backgroundColor: "#F4EFE6",
            border: "1px solid #D8CFBE",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr 1fr 1fr",
              borderBottom: "1px solid #D8CFBE",
              backgroundColor: "#EFE9DD",
            }}
          >
            {[
              { h: "Feature", col: "#8A7F6E" },
              { h: "Audit — Free", col: "#5F5648" },
              { h: "Single Dispute — $39", col: "#5F5648" },
              { h: "Membership — $19/mo", col: "#C8A97E" },
            ].map(({ h, col }, i) => (
              <div
                key={h}
                style={{
                  padding: "16px 20px",
                  borderLeft: i > 0 ? "1px solid #D8CFBE" : "none",
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
                gridTemplateColumns: "2fr 1fr 1fr 1fr",
                borderBottom: i < TABLE_ROWS.length - 1 ? "1px solid #E2DACB" : "none",
                backgroundColor: i % 2 === 1 ? "#EFE9DD" : "transparent",
              }}
            >
              <div style={{ padding: "14px 20px" }}>
                <span style={{ ...sans("13px", "#5F5648") }}>{row.feature}</span>
              </div>
              {[row.audit, row.dispute, row.member].map((val, j) => (
                <div
                  key={j}
                  style={{
                    padding: "14px 20px",
                    borderLeft: "1px solid #E2DACB",
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
          <div style={{ borderTop: "1px solid #D8CFBE" }} />
        </div>
      </section>

      <Footer />
    </div>
  );
}
