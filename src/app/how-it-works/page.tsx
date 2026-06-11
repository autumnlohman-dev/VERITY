"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

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
      <Link href="/" style={{ textDecoration: "none" }}>
        <span style={{ ...sans("15px", "#221C14"), letterSpacing: "0.42em", textTransform: "uppercase", fontWeight: 300, paddingLeft: "0.42em" }}>
          Verity
        </span>
      </Link>
      <div className="hidden md:flex" style={{ gap: "40px" }}>
        {[
          { lbl: "How it works", href: "/how-it-works" },
          { lbl: "Pricing", href: "/pricing" },
          { lbl: "FAQ", href: "#faq" },
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
        <div style={{ ...sans("12px", "#221C14"), letterSpacing: "0.34em", textTransform: "uppercase", fontWeight: 300, paddingLeft: "0.34em", marginBottom: "8px" }}>Verity™</div>
        <div style={{ ...sans("11px", "#8A7F6E"), marginBottom: "16px" }}>Medical bill advocacy.</div>
        <div style={{ ...sans("11px", "#8A7F6E"), maxWidth: "260px", lineHeight: 1.6 }}>
          Verity is an administrative advocacy service. We are not a law firm and do not provide legal advice.
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {[
          { lbl: "How it works", href: "/how-it-works" },
          { lbl: "Pricing", href: "/pricing" },
          { lbl: "Dashboard", href: "/dashboard" },
          { lbl: "FAQ", href: "#faq" },
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

// ─── FAQs (same as landing page) ─────────────────────────────────────────────
const FAQS = [
  {
    q: "What types of billing errors do you find?",
    a: "The most common: upcoding (charging for a more expensive procedure than performed), duplicate billing, balance billing violations, charges above contracted rates, and unbundling (splitting one procedure into multiple charges). Most patients have at least two.",
  },
  {
    q: "How long does it take?",
    a: "Audit reports are ready within 24 hours of upload, and your dispute package is generated instantly. Once you send it, most insurers and providers respond within 30 days, though complex cases or appeals can take longer.",
  },
  {
    q: "What do I need to upload?",
    a: "Your itemized medical bill (not the summary — request the itemized version from your provider if you don't have it), your Explanation of Benefits from your insurer, and your insurance card. The EOB is optional but makes the audit more precise.",
  },
  {
    q: "What happens if my insurer denies the dispute?",
    a: "Your audit report includes the evidence and regulatory citations behind every flagged charge, so you can escalate to a second-level appeal or an external review. Verity generates the follow-up letters you need at each step.",
  },
  {
    q: "Is my medical data safe?",
    a: "All documents are encrypted at rest and in transit using AES-256, and built with privacy and security best practices. We never sell or share your information with any third party.",
  },
  {
    q: "Do you work with all insurance types?",
    a: "We handle PPO, HMO, EPO, and Medicare Advantage plans. We also review self-pay bills over $500. Medicare and Medicaid disputes follow different pathways — we'll flag this during your audit.",
  },
];

// ─── FAQ Item ─────────────────────────────────────────────────────────────────
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
        <span
          style={{
            fontFamily: "var(--font-cormorant), Georgia, serif",
            fontSize: "20px",
            color: "#221C14",
            fontWeight: 400,
          }}
        >
          {q}
        </span>
        <ChevronDown
          size={18}
          color="#8A7F6E"
          style={{
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.3s",
          }}
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

// ─── Process steps ────────────────────────────────────────────────────────────
const STEPS = [
  {
    n: 1,
    title: "Upload your documents.",
    body: "Your itemized medical bill, Explanation of Benefits, and insurance card. We accept PDFs, photos, and scans. Takes about three minutes.",
    time: "3 min",
  },
  {
    n: 2,
    title: "We audit every charge.",
    body: "We normalize every document you upload — your itemized bill, your EOB, your denial letter, your authorization — into a single unified schema, then compare them against each other and against federal billing rules in one pass. Discrepancies across documents are found automatically, no manual review required.",
    time: "24 hours",
  },
  {
    n: 3,
    title: "You receive your error report.",
    body: "Every error, the evidence behind it, and a dollar value attached to each. The report is yours free — no commitment, no obligation to proceed.",
    time: "Same day",
  },
  {
    n: 4,
    title: "See your outcome prediction.",
    body: "Before you file anything, membership users see an estimated recovery amount, likely resolution timeframe, escalation probability, and a specific settlement floor and ceiling — so you know exactly what you're walking into.",
    time: "Instant",
  },
  {
    n: 5,
    title: "You choose what happens next.",
    body: "Stay on the free audit, pay $39 for a single dispute package on one bill, or join the membership and authorize Verity to file and close the dispute entirely — generating every letter, appeal, and follow-up automatically until the case is resolved.",
    time: "Your call",
  },
  {
    n: 6,
    title: "You recover what you're owed.",
    body: "The provider or insurer corrects the charge and issues a refund or adjusts your balance. Most respond within 30 days, and Verity generates every appeal or regulator letter needed at each escalation step.",
    time: "~30 days",
  },
];

// ─── Timeline milestones ──────────────────────────────────────────────────────
const MILESTONES = [
  { date: "Mar 12", label: "Documents uploaded", day: 0, done: true, active: false },
  { date: "Mar 13", label: "Audit complete — 4 errors found", day: 1, done: true, active: false },
  { date: "Mar 15", label: "Dispute filed with provider", day: 3, done: true, active: false },
  { date: "Mar 22", label: "Internal review opened", day: 10, done: true, active: false },
  { date: "Apr 1", label: "$2,840 recovered", day: 20, done: false, active: true },
];

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function HowItWorksPage() {
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
          <div style={{ ...label(), marginBottom: "32px" }}>How it works</div>
          <h1
            style={{
              fontFamily: "var(--font-cormorant), Georgia, serif",
              fontSize: "clamp(72px, 8vw, 96px)",
              color: "#221C14",
              lineHeight: 0.92,
              fontWeight: 400,
              marginBottom: 0,
            }}
          >
            We fix medical bills.
            <br />
            <em style={{ fontStyle: "italic" }}>You keep the money.</em>
          </h1>
          <p style={{ ...sans("15px", "#5F5648"), marginTop: "32px", maxWidth: "520px", lineHeight: 1.75 }}>
            Verity is a medical bill advocacy tool. We review your bill, find the errors, predict your recovery odds, and — if you choose —
            run the dispute entirely on your behalf.
          </p>
        </motion.div>
      </section>

      {/* ── The process — 6 steps ── */}
      <section style={{ paddingTop: "96px", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <motion.div {...fadeUp}>
          <div style={{ ...label(), marginBottom: "24px" }}>The process</div>
          <h2 style={{ ...serif("48px", { lineHeight: 1, marginBottom: "64px" }) }}>
            Every dispute,
            <br />
            start to finish.
          </h2>
        </motion.div>

        {STEPS.map((step, i) => (
          <motion.div
            key={step.n}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: i * 0.05 }}
            style={{
              borderTop: "1px solid #D8CFBE",
              padding: "48px 0",
              display: "flex",
              gap: "48px",
              alignItems: "flex-start",
            }}
          >
            {/* Step number — decorative */}
            <div
              style={{
                fontFamily: "var(--font-cormorant), Georgia, serif",
                fontSize: "72px",
                color: "#E2DACB",
                fontStyle: "italic",
                fontWeight: 400,
                lineHeight: 1,
                minWidth: "80px",
                flexShrink: 0,
              }}
            >
              {step.n}
            </div>
            {/* Content */}
            <div style={{ flex: 1 }}>
              <div style={{ ...serif("28px", { lineHeight: 1.1, marginBottom: "16px" }) }}>{step.title}</div>
              <p style={{ ...sans("14px", "#5F5648"), lineHeight: 1.75, maxWidth: "560px" }}>{step.body}</p>
            </div>
            {/* Time tag */}
            <div
              style={{
                ...sans("10px", "#8A7F6E"),
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                minWidth: "80px",
                textAlign: "right",
                flexShrink: 0,
              }}
            >
              {step.time}
            </div>
          </motion.div>
        ))}
        <div style={{ borderTop: "1px solid #D8CFBE" }} />
      </section>

      {/* ── Timeline graphic ── */}
      <section
        style={{
          backgroundColor: "#F4EFE6",
          paddingTop: "96px",
          paddingBottom: "96px",
          paddingLeft: "64px",
          paddingRight: "64px",
        }}
      >
        <motion.div {...fadeUp}>
          <div style={{ ...label(), marginBottom: "32px" }}>A real case timeline</div>
          <h2 style={{ ...serif("40px", { lineHeight: 1.1, marginBottom: "64px" }) }}>
            From upload to resolution.
          </h2>
        </motion.div>

        <motion.div {...fadeUp} style={{ overflowX: "auto" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              minWidth: "600px",
            }}
          >
            {MILESTONES.map((m, i) => (
              <React.Fragment key={m.date}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
                  {/* Date */}
                  <div
                    style={{
                      ...sans("10px", "#8A7F6E"),
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      marginBottom: "16px",
                    }}
                  >
                    {m.date}
                  </div>
                  {/* Circle */}
                  <div
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      backgroundColor: "#F4EFE6",
                      border: `1px solid ${m.active ? "#C8A97E" : m.done ? "#5E7E66" : "#CFC6B4"}`,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: "8px",
                        height: "8px",
                        borderRadius: "50%",
                        backgroundColor: m.active ? "#C8A97E" : m.done ? "#5E7E66" : "#CFC6B4",
                      }}
                    />
                  </div>
                  {/* Label */}
                  <div
                    style={{
                      ...sans("12px", "#5F5648"),
                      lineHeight: 1.5,
                      textAlign: "center",
                      maxWidth: "120px",
                      marginTop: "12px",
                    }}
                  >
                    {m.label}
                  </div>
                </div>
                {/* Connector */}
                {i < MILESTONES.length - 1 && (
                  <div
                    style={{
                      flex: 1,
                      height: "1px",
                      borderTop: "1px dashed #CFC6B4",
                      marginTop: "56px",
                      flexShrink: 0,
                    }}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── What we are — two columns ── */}
      <section style={{ paddingTop: "96px", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <motion.div {...fadeUp}>
          <div style={{ ...label(), marginBottom: "32px" }}>Our authorization</div>
          <h2 style={{ ...serif("40px", { lineHeight: 1.1, marginBottom: "48px" }) }}>
            Medical bill advocacy
            <br />
            is a recognized profession.
          </h2>
        </motion.div>

        <div className="r-grid-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "64px" }}>
          {/* What we are */}
          <motion.div {...fadeUp}>
            <div style={{ ...serif("22px", { lineHeight: 1.2, marginBottom: "24px" }) }}>What we are.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {[
                "A medical bill advocacy platform for patients",
                "Software that finds billing errors and writes your dispute and appeal letters",
                "Grounded in federal rules — NCCI, MUE, PFS, No Surprises Act, Transparency in Coverage Rule, FDCPA, FCRA, and ERISA, with state-specific overlays",
                "Built on CPT codes, insurance contracts, and dispute procedures",
                "Covered under your patient rights to dispute charges",
              ].map((item) => (
                <div key={item} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <span style={{ ...sans("14px", "#C8A97E"), marginTop: "2px", flexShrink: 0 }}>›</span>
                  <span style={{ ...sans("14px", "#5F5648"), lineHeight: 1.7 }}>{item}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* What we are not */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
          >
            <div style={{ ...serif("22px", { lineHeight: 1.2, marginBottom: "24px" }) }}>What we are not.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {[
                "A law firm or legal service",
                "A medical provider or health plan",
                "A debt settlement or negotiation company",
                "Affiliated with any insurer or hospital",
              ].map((item) => (
                <div key={item} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <span style={{ ...sans("14px", "#C9BFAC"), marginTop: "2px", flexShrink: 0 }}>›</span>
                  <span style={{ ...sans("14px", "#5F5648"), lineHeight: 1.7 }}>{item}</span>
                </div>
              ))}
            </div>
            <p style={{ ...sans("12px", "#8A7F6E"), fontStyle: "italic", marginTop: "32px", lineHeight: 1.65 }}>
              If your case involves fraud, malpractice, or requires legal action, we&apos;ll tell you — and refer you
              to appropriate legal counsel. We don&apos;t handle cases beyond our scope.
            </p>
          </motion.div>
        </div>
      </section>

      {/* ── Federal rights ── */}
      <section
        style={{
          backgroundColor: "#F4EFE6",
          paddingTop: "96px",
          paddingBottom: "96px",
          paddingLeft: "64px",
          paddingRight: "64px",
        }}
      >
        <motion.div {...fadeUp}>
          <div style={{ ...label(), marginBottom: "32px" }}>Your legal rights</div>
          <h2 style={{ ...serif("40px", { lineHeight: 1.1, marginBottom: "32px" }) }}>
            Disputing a medical bill
            <br />
            is your legal right.
          </h2>
          <p style={{ ...sans("14px", "#5F5648"), maxWidth: "640px", lineHeight: 1.75 }}>
            Under the No Surprises Act, Transparency in Coverage Rule, FDCPA, FCRA, ERISA, and applicable state balance billing and insurance protection laws — with state-specific overlays based on your state of residence and state of treatment — patients have federally and state-protected rights to dispute medical bills. You have the right to request an itemized bill from any provider, the right to dispute charges above the contracted rate, and the right to an independent external review if your insurer denies your claim.
          </p>
          <p style={{ ...sans("14px", "#5F5648"), maxWidth: "640px", lineHeight: 1.75, marginTop: "16px" }}>
            Verity makes this process simple: we find the errors, cite the exact rules, and generate the letters —
            with the deadlines and escalation pathways built in. You don&apos;t have to navigate it alone.
          </p>
          <Link href="/upload" style={{ textDecoration: "none" }}>
            <span
              style={{
                ...sans("11px", "#221C14"),
                backgroundColor: "#C8A97E",
                padding: "16px 32px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                fontWeight: 500,
                display: "inline-block",
                marginTop: "40px",
              }}
            >
              Check my bill — free
            </span>
          </Link>
        </motion.div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ paddingTop: "96px", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <motion.div {...fadeUp}>
          <div style={{ ...label(), marginBottom: "24px" }}>Questions</div>
          <h2 style={{ ...serif("48px", { lineHeight: 1.05, marginBottom: "64px" }) }}>
            Everything you need to know.
          </h2>
        </motion.div>
        <div style={{ maxWidth: "720px" }}>
          {FAQS.map((faq) => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
          <div style={{ borderTop: "1px solid #D8CFBE" }} />
        </div>
      </section>

      <Footer />
    </div>
  );
}
