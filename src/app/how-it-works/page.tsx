"use client";

import React from "react";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import { motion } from "framer-motion";

// ─── Style helpers (exact copy from landing page) ─────────────────────────────
const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-lora), Georgia, serif",
  
  letterSpacing: "-0.015em",
  fontSize: size,
  color: "#221C14",
  lineHeight: 1,
  fontWeight: 400,
  ...extra,
});

const sans = (size: string, color = "#5F5648", extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-public-sans), system-ui, sans-serif",
  fontSize: size,
  color,
  ...extra,
});

const label = (color = "#C8A97E"): React.CSSProperties => ({
  fontFamily: "var(--font-public-sans), system-ui, sans-serif",
  fontSize: "11px",
  letterSpacing: "0.25em",
  textTransform: "uppercase" as const,
  color,
});

// ─── Nav (copied from landing page) ──────────────────────────────────────────
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
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "8px" }}>
        <span style={{ ...sans("15px", "#221C14"), letterSpacing: "0.42em", textTransform: "uppercase", fontWeight: 300, paddingLeft: "0.42em", lineHeight: 1 }}>
          {BRAND_NAME}
        </span>
      </Link>
      <div className="hidden md:flex" style={{ gap: "40px" }}>
        {[
          { lbl: "How it works", href: "/how-it-works" },
          { lbl: "Pricing", href: "/pricing" },
          { lbl: "FAQ", href: "/#faq" },
          { lbl: "For Plans & Employers", href: "/for-plans" },
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
        <div style={{ ...sans("12px", "#221C14"), letterSpacing: "0.34em", textTransform: "uppercase", fontWeight: 300, paddingLeft: "0.34em", lineHeight: 1, marginBottom: "16px" }}>{BRAND_NAME}</div>
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
          { lbl: "For Plans & Employers", href: "/for-plans" },
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
        <div style={{ ...sans("10.5px", "#8A7F6E"), lineHeight: 1.6, maxWidth: "240px" }}>The Verity™ audit method, scoring models, and datasets are proprietary and confidential. Patent Pending, 41 claims, 13 independent claim categories.</div>
      </div>
    </footer>
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
    body: "Your documents are checked against each other and against CMS reference data, fee schedules, NCCI bundling edits, and MUE limits, in a single pass. Every discrepancy is flagged with its dollar impact.",
    time: "24 hours",
  },
  {
    n: 3,
    title: "You receive your error report.",
    body: "Every error, the evidence behind it, and the dollar value attached. The report is free.",
    time: "Same day",
  },
  {
    n: 4,
    title: "See your outcome estimate.",
    body: "Members see an estimated recovery amount, expected timeframe, and settlement range before filing anything.",
    time: "Instant",
  },
  {
    n: 5,
    title: "You choose what happens next.",
    body: "Stay on the free audit, buy a $39 dispute package for one bill, or join the membership for unlimited audits and dispute packages. Nothing is sent without your approval.",
    time: "Your call",
  },
  {
    n: 6,
    title: "The charge gets corrected.",
    body: "If the dispute succeeds, the provider or insurer corrects the charge or issues a refund. Most respond within 30 days.",
    time: "~30 days",
  },
];

// ─── Timeline milestones ──────────────────────────────────────────────────────
const MILESTONES = [
  { date: "Mar 12", label: "Documents uploaded", day: 0, done: true, active: false },
  { date: "Mar 13", label: "Audit complete, 4 errors found", day: 1, done: true, active: false },
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
    <div className="page-root" style={{ background: "var(--surface)", minHeight: "100vh" }}>
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
              fontFamily: "var(--font-lora), Georgia, serif",
  
  letterSpacing: "-0.015em",
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
            Verity reviews your bill, finds the errors, and prepares a ready-to-send dispute package; nothing is sent without your approval.
          </p>
        </motion.div>
      </section>

      {/* ── The process, 6 steps ── */}
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
            {/* Step number, decorative */}
            <div
              style={{
                fontFamily: "var(--font-lora), Georgia, serif",
  
  letterSpacing: "-0.015em",
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
          <div style={{ ...label(), marginBottom: "32px" }}>A representative case timeline</div>
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
        <p style={{ ...sans("11px", "#8A7F6E"), letterSpacing: "0.06em", marginTop: "32px", fontStyle: "italic" }}>
          Representative case. Timelines vary by insurer and dispute type.
        </p>
      </section>

      {/* ── What's in a dispute package ── */}
      <section style={{ paddingTop: "96px", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <motion.div {...fadeUp}>
          <div style={{ ...label(), marginBottom: "24px" }}>The deliverable</div>
          <h2 style={{ ...serif("40px", { lineHeight: 1.1, marginBottom: "24px" }) }}>
            What&apos;s in a dispute package.
          </h2>
          <p style={{ ...sans("14px", "#5F5648"), maxWidth: "560px", lineHeight: 1.75, marginBottom: "48px" }}>
            One PDF, ready to send. Every section is built from your own documents and the audit findings.
          </p>
        </motion.div>
        <div style={{ maxWidth: "760px" }}>
          {[
            {
              name: "Formal dispute letter",
              desc: "States each disputed charge and cites the specific rule it conflicts with.",
            },
            {
              name: "Financial calculation worksheet",
              desc: "Billed versus expected amount for every flagged charge, with subtotals and the total in dispute.",
            },
            {
              name: "Regulatory citation appendix",
              desc: "The full text of each citation, grouped by statute, so the recipient can verify every reference.",
            },
            {
              name: "Case timeline",
              desc: "A chronological record of your documents and findings, included when you upload more than one document.",
            },
            {
              name: "Deadline summary",
              desc: "Every deadline that applies to your dispute, grouped by urgency.",
            },
          ].map((item, i) => (
            <motion.div
              key={item.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: i * 0.05 }}
              style={{ borderTop: "1px solid #D8CFBE", padding: "28px 0", display: "flex", gap: "32px", alignItems: "baseline" }}
            >
              <div style={{ ...serif("22px", { lineHeight: 1.2, minWidth: "300px", flexShrink: 0 }) }}>{item.name}</div>
              <p style={{ ...sans("13px", "#5F5648"), lineHeight: 1.7 }}>{item.desc}</p>
            </motion.div>
          ))}
          <div style={{ borderTop: "1px solid #D8CFBE" }} />
          <p style={{ ...sans("12px", "#8A7F6E"), marginTop: "24px", lineHeight: 1.65 }}>
            A step-by-step submission guide for your dispute type appears alongside the letter.
          </p>
        </div>
      </section>

      {/* ── What's next (roadmap — future tense, nothing here is live) ── */}
      <section id="whats-next" style={{ borderTop: "1px dashed #CFC6B4", paddingTop: "96px", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <motion.div {...fadeUp}>
          <div style={{ ...label("#8A7F6E"), marginBottom: "24px" }}>On the roadmap · Coming soon</div>
          <p style={{ ...sans("15px", "#5F5648"), maxWidth: "560px", lineHeight: 1.75, marginBottom: "56px" }}>
            Today, Verity audits your bill and writes your dispute letter. That&apos;s the foundation. Here&apos;s what comes next.
          </p>
        </motion.div>
        <div className="r-grid-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "48px", maxWidth: "1100px" }}>
          {[
            {
              title: "Disputes that escalate themselves.",
              body: "When a provider denies your dispute, Verity will generate the appeal. When an appeal stalls, it will prepare the next step: complaints to state regulators, credit bureau disputes, collection agency challenges. Each one drafted, cited, and queued for your signature. You approve every action. Verity does everything else.",
            },
            {
              title: "Your bills, watched.",
              body: "Connect your insurance portal and Verity will monitor new claims as they post, auditing each one automatically. Errors get flagged before the bill even reaches your mailbox.",
            },
            {
              title: "A copilot for the phone call.",
              body: "Billing departments count on you not knowing the codes. Verity's live guidance will listen alongside you during billing calls, flag statements that contradict your documents, and suggest what to say next, with the citation to back it up.",
            },
            {
              title: "Your household's financial weather report.",
              body: "Verity's Family Profile will track your family's deductibles and out-of-pocket maximums across every member, simulate what a planned procedure will actually cost you, and warn you when heavy financial weather is coming.",
            },
          ].map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: i * 0.05 }}
              style={{ borderTop: "1px dashed #CFC6B4", paddingTop: "28px" }}
            >
              <div style={{ ...serif("23px", { color: "#5F5648", lineHeight: 1.15, marginBottom: "14px" }) }}>{item.title}</div>
              <p style={{ ...sans("13px", "#8A7F6E"), lineHeight: 1.75 }}>{item.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── What we are, two columns ── */}
      <section style={{ paddingTop: "96px", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <motion.div {...fadeUp}>
          <div style={{ ...label(), marginBottom: "32px" }}>What Verity is · and isn&apos;t</div>
          <h2 style={{ ...serif("40px", { lineHeight: 1.1, marginBottom: "48px" }) }}>
            Clear about what we do.
            <br />
            Just as clear about what we don&apos;t.
          </h2>
        </motion.div>

        <div className="r-grid-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "64px" }}>
          {/* What we are */}
          <motion.div {...fadeUp}>
            <div style={{ ...serif("22px", { lineHeight: 1.2, marginBottom: "24px" }) }}>What we are.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {[
                "A medical bill advocacy platform for patients",
                "Software that finds billing errors and writes your dispute letter",
                "Checks bills against CMS reference data: the Physician Fee Schedule, the Clinical Lab Fee Schedule, NCCI bundling edits, and MUE limits",
                "Built on CPT codes, insurance contracts, and dispute procedures",
                "Prepares disputes that you review, sign, and submit in your own name.",
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
              If your case involves fraud, malpractice, or a legal claim, we&apos;ll tell you and point you toward
              appropriate legal counsel.
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
          <div style={{ ...label(), marginBottom: "32px" }}>The rules we cite</div>
          <h2 style={{ ...serif("40px", { lineHeight: 1.1, marginBottom: "32px" }) }}>
            Specific rules,
            <br />
            cited in every letter.
          </h2>
          <p style={{ ...sans("14px", "#5F5648"), maxWidth: "640px", lineHeight: 1.75 }}>
            Every dispute letter Verity generates cites the specific rule it relies on. Bills are checked against CMS reference data, the Physician Fee Schedule and the Clinical Lab Fee Schedule as pricing benchmarks, NCCI bundling edits, and MUE unit limits, plus No Surprises Act and ACA preventive-care protections where they apply.
          </p>
          <p style={{ ...sans("14px", "#5F5648"), maxWidth: "640px", lineHeight: 1.75, marginTop: "16px" }}>
            Each letter references the rule behind every flagged charge, and Verity identifies the deadline and escalation path that apply to your dispute.
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
              Check my bill, free
            </span>
          </Link>
        </motion.div>
      </section>

      {/* ── FAQ link ── */}
      <section style={{ paddingTop: "64px", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <p style={{ ...sans("14px", "#5F5648") }}>
          More questions?{" "}
          <Link href="/#faq" style={{ color: "#8A6A35", textDecoration: "underline", textUnderlineOffset: "3px" }}>
            Read the FAQ
          </Link>
        </p>
      </section>

      <Footer />
    </div>
  );
}
