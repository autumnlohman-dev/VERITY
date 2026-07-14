"use client";

import React, { useState } from "react";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

// ─── Style helpers ────────────────────────────────────────────────────────────
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

// ─── FAQs ─────────────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: "What types of billing errors do you find?",
    a: "The most common: upcoding (billing a more expensive procedure than the one performed), duplicate billing, balance billing that conflicts with the No Surprises Act, charges above contracted rates, and unbundling (splitting one procedure into multiple charges).",
  },
  {
    q: "How long does it take?",
    a: "Audit reports are ready within 24 hours of upload, and your dispute package is generated right after. Members also see an estimated recovery amount and settlement range before filing. Once you send your dispute, most insurers and providers respond within 30 days; complex cases and appeals can take longer.",
  },
  {
    q: "How long do I have to submit a dispute?",
    a: "It depends. Deadlines vary by dispute type, insurer, and state; provider billing disputes, insurer appeals, and external reviews each run on different clocks, and some deadlines are set by your own plan documents. There is no single window that applies to everyone. Verity identifies the deadline that applies to your case and tracks it for you.",
  },
  {
    q: "What do I need to upload?",
    a: "Your itemized medical bill (not the summary, request the itemized version from your provider if you don't have it), your Explanation of Benefits from your insurer, and your insurance card. The EOB is optional but makes the audit more precise.",
  },
  {
    q: "What happens if my insurer denies the dispute?",
    a: "Your audit report includes the evidence and regulatory citations behind every flagged charge, so you can escalate to a second-level appeal or an external review.",
  },
  {
    q: "Is my medical data safe?",
    a: "All documents are encrypted at rest and in transit using AES-256, and built with privacy and security best practices. We never sell or share your information with any third party.",
  },
  {
    q: "Do you work with all insurance types?",
    a: "We handle PPO, HMO, EPO, and Medicare Advantage plans. We also review self-pay bills over $500. Medicare and Medicaid disputes follow different pathways, we'll flag this during your audit.",
  },
];

// ─── Nav ──────────────────────────────────────────────────────────────────────
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
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "12px" }}>
        <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true" style={{ display: "block" }}>
          <circle cx="32" cy="32" r="20" fill="none" stroke="#B8945C" strokeWidth="1.8" />
          <text x="32" y="45" textAnchor="middle" fontFamily="var(--font-lora), Georgia, serif" fontSize="36" fontWeight={500} fill="#B8945C">V</text>
        </svg>
        <span style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
          <span
            style={{
              ...sans("15px", "#221C14"),
              letterSpacing: "0.42em",
              textTransform: "uppercase",
              fontWeight: 300,
              paddingLeft: "0.42em",
              lineHeight: 1,
            }}
          >
            {BRAND_NAME}
          </span>
        </span>
      </Link>

      <div className="hidden md:flex" style={{ gap: "40px" }}>
        {[
          { label: "How it works", href: "/how-it-works" },
          { label: "Pricing", href: "/pricing" },
          { label: "FAQ", href: "#faq" },
          { label: "For Plans & Employers", href: "/for-plans" },
          { label: "Sign in", href: "/login" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              ...sans("11px", "#5F5648"),
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#221C14")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#5F5648")}
          >
            {link.label}
          </Link>
        ))}
      </div>

      <Link href="/upload" style={{ textDecoration: "none" }}>
        <span
          style={{
            ...sans("11px", "#221C14"),
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

// ─── Footer ───────────────────────────────────────────────────────────────────
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
        <div
          style={{
            ...sans("30px", "#221C14"),
            letterSpacing: "0.34em",
            textTransform: "uppercase",
            fontWeight: 300,
            paddingLeft: "0.34em",
            lineHeight: 1,
            marginBottom: "20px",
          }}
        >
          {BRAND_NAME}
        </div>
        <div style={{ ...sans("12px", "#5F5648"), marginBottom: "16px", lineHeight: 1.6 }}>
          Financial clarity. Human advocacy.
          <br />
          Smarter healthcare.
        </div>
        <div
          style={{
            ...sans("11px", "#8A7F6E"),
            maxWidth: "260px",
            lineHeight: 1.6,
          }}
        >
          Verity is an administrative advocacy service. We are not a law
          firm and do not provide legal advice.
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {[
          { lbl: "How it works", href: "/how-it-works" },
          { lbl: "Pricing", href: "/pricing" },
          { lbl: "Dashboard", href: "/dashboard" },
          { lbl: "Sign in", href: "/login" },
          { lbl: "FAQ", href: "#faq" },
          { lbl: "For Plans & Employers", href: "/for-plans" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              ...sans("11px", "#8A7F6E"),
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#5F5648")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#8A7F6E")}
          >
            {link.lbl}
          </Link>
        ))}
      </div>
      <div>
        <div style={{ ...sans("11px", "#8A7F6E"), marginBottom: "4px" }}>
          © 2026 Verity
        </div>
        <div style={{ ...sans("11px", "#8A7F6E"), marginBottom: "16px" }}>All rights reserved.</div>
        <div style={{ display: "flex", gap: "16px", marginBottom: "12px" }}>
          <Link href="/privacy" style={{ ...sans("11px", "#8A7F6E"), textDecoration: "none" }}>Privacy</Link>
          <Link href="/terms" style={{ ...sans("11px", "#8A7F6E"), textDecoration: "none" }}>Terms</Link>
        </div>
        <div style={{ ...sans("10.5px", "#8A7F6E"), lineHeight: 1.6, maxWidth: "240px" }}>
          The Verity™ audit method, scoring models, and datasets are proprietary
          and confidential. Patent Pending, 41 claims, 13 independent claim categories.
        </div>
      </div>
    </footer>
  );
}

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
            fontFamily: "var(--font-lora), Georgia, serif",
  
  letterSpacing: "-0.015em",
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
            <p
              style={{
                ...sans("14px", "#5F5648"),
                lineHeight: 1.75,
                paddingBottom: "24px",
              }}
            >
              {a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function SectionAccordion({
  eyebrow,
  title,
  teaser,
  bg,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  teaser: string;
  bg?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section style={{ borderTop: "1px solid #D8CFBE", backgroundColor: bg || "transparent" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="r-pad"
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          padding: "48px 64px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "32px",
        }}
        aria-expanded={open}
      >
        <div style={{ maxWidth: "760px" }}>
          <div style={{ ...label(), marginBottom: "14px" }}>{eyebrow}</div>
          <div style={{ ...serif("clamp(28px, 3.4vw, 44px)", { lineHeight: 1.06 }) }}>{title}</div>
          {!open && (
            <p style={{ ...sans("13px", "#8A7F6E"), marginTop: "12px", lineHeight: 1.6, maxWidth: "440px" }}>{teaser}</p>
          )}
        </div>
        <ChevronDown
          size={30}
          color="#8A7F6E"
          style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.35s ease" }}
        />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ overflow: "hidden" }}
          >
            <div className="r-pad" style={{ padding: "8px 64px 80px" }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {

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
      <section
        style={{
          minHeight: "100svh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "120px 24px 72px",
        }}
      >
        <h1 className="sr-only">
          Clarity over confusion. Verity™ finds overcharges on medical bills
          and prepares the dispute letters to fix them.
        </h1>
        <Image
          src="/hero-campaign.png"
          alt="Verity, Clarity over confusion. We investigate, analyze, and advocate so you keep more of what's yours."
          width={2048}
          height={1152}
          priority
          style={{
            width: "auto",
            height: "auto",
            maxHeight: "95vh",
            maxWidth: "min(1100px, 96vw)",
            boxShadow: "0 40px 90px rgba(60,46,32,0.16)",
          }}
        />
        <p style={{ ...serif("clamp(17px, 2vw, 24px)", { fontStyle: "italic", lineHeight: 1.35, color: "#5F5648" }), textAlign: "center", maxWidth: "560px", marginTop: "32px" }}>
          You Opened the Bill. We Open the Investigation.™
        </p>

        <div className="r-cta" style={{ display: "flex", gap: "16px", alignItems: "center", marginTop: "44px" }}>
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
              }}
            >
              Check my bill, free
            </span>
          </Link>
          <Link href="/how-it-works" style={{ textDecoration: "none" }}>
            <span
              style={{
                ...sans("11px", "#221C14"),
                border: "1px solid #C2B7A3",
                padding: "16px 32px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                display: "inline-block",
              }}
            >
              See how it works
            </span>
          </Link>
        </div>
        <p style={{ ...sans("11px", "#8A7F6E"), letterSpacing: "0.14em", textTransform: "uppercase", marginTop: "20px" }}>
          Free audit · no account needed
        </p>
      </section>

      {/* ── Problem Section ── */}
      <motion.section
        {...fadeUp}
        style={{ padding: "96px 64px" }}
      >
        <div className="r-grid-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "64px", alignItems: "start", maxWidth: "1100px" }}>
          <div style={{ maxWidth: "520px" }}>
            <div style={{ ...label(), marginBottom: "24px" }}>The problem</div>
            <h2
              style={{
                ...serif("52px", { lineHeight: 1.05, marginBottom: "24px" }),
              }}
            >
              Medical billing is a
              <br />
              system designed to
              <br />
              confuse you.
            </h2>
            <p
              style={{
                ...sans("14px", "#5F5648"),
                lineHeight: 1.75,
              }}
            >
              Providers upcode procedures. Insurers underpay. Duplicate charges
              slip through. Most patients never know, because the bills are
              designed to be unreadable.
            </p>
          </div>

          {/* Industry stat cards, exhibit styling. The 80% figure carries the
              "up to" qualifier per its reported 49-80% range. */}
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { kicker: "up to", numeral: "80%", caption: "of medical bills contain at least one error" },
                { kicker: null, numeral: "1 in 7", caption: "claims are denied by insurers; only 0.1% of denials are ever appealed" },
                { kicker: null, numeral: "$1,300", caption: "average overcharge on hospital bills above $10,000" },
              ].map((c) => (
                <div
                  key={c.numeral}
                  style={{
                    backgroundColor: "var(--surface-raised)",
                    border: "1px solid var(--line)",
                    padding: "18px 20px",
                  }}
                >
                  {c.kicker && (
                    <div style={{ ...sans("10px", "#8A7F6E"), letterSpacing: "0.2em", textTransform: "uppercase", marginBottom: "2px" }}>
                      {c.kicker}
                    </div>
                  )}
                  <div style={{ ...serif("42px", { color: "var(--brand)", lineHeight: 1, marginBottom: "6px" }) }}>
                    {c.numeral}
                  </div>
                  <p style={{ ...sans("13px", "#5F5648"), lineHeight: 1.6 }}>{c.caption}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* ── What We Look For ── */}
      <SectionAccordion
        eyebrow="What we look for"
        bg="#F1EBDF"
        teaser="Most overcharges hide in the EOB, the contract, and the network, not just the codes. The eight errors we catch."
        title={
          <>
            Most tools check coding.{" "}
            <em style={{ fontStyle: "italic", color: "#C8A97E" }}>We check everything.</em>
          </>
        }
      >
        <div style={{ maxWidth: "1100px" }}>
          <p style={{ ...sans("14px", "#5F5648"), lineHeight: 1.75, maxWidth: "520px", marginBottom: "56px" }}>
            Most overcharges aren’t coding mistakes, they hide in the EOB, the
            contract, and the network. Verity reads every layer. Eight of the
            errors we catch:
          </p>

          <div className="r-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1px", backgroundColor: "#DDD3C2" }}>
            {[
              { n: "01", name: "Duplicate charges", evidence: "Same CPT · same day · billed ×2", note: "Identical services billed more than once." },
              { n: "02", name: "Upcoding", evidence: "99215 billed → 99213 documented", note: "A higher-intensity code than the visit supports." },
              { n: "03", name: "Unbundling", evidence: "One panel split into 6 line items", note: "Bundled services broken apart to bill more." },
              { n: "04", name: "Balance billing", evidence: "Out-of-network charge · NSA claim", note: "Conflicts with the No Surprises Act." },
              { n: "05", name: "EOB mismatch", evidence: "Allowed $350 · billed $600", note: "Provider bills past the insurer-allowed rate." },
              { n: "06", name: "Excess units", evidence: "4 units billed · MUE max 1", note: "More units than medically possible per day." },
              { n: "07", name: "Deductible errors", evidence: "Deductible met · charged again", note: "Cost-sharing applied after it was satisfied." },
              { n: "08", name: "Network errors", evidence: "In-network facility · OON reading", note: "Hidden out-of-network charges inside one visit." },
            ].map((item) => (
              <div key={item.n} style={{ backgroundColor: "#F1EBDF", padding: "32px 28px 36px" }}>
                <div style={{ ...sans("11px", "#B3A28A"), letterSpacing: "0.2em", marginBottom: "20px" }}>{item.n}</div>
                <div style={{ ...serif("23px", { marginBottom: "16px", lineHeight: 1.1 }) }}>{item.name}</div>
                <div
                  style={{
                    fontFamily: "var(--font-public-sans), system-ui, sans-serif",
                    fontSize: "12px",
                    color: "#2A2520",
                    borderLeft: "2px solid #C8A97E",
                    paddingLeft: "12px",
                    lineHeight: 1.5,
                    marginBottom: "16px",
                    minHeight: "36px",
                  }}
                >
                  {item.evidence}
                </div>
                <div style={{ ...sans("12px", "#8A7F6E"), lineHeight: 1.6 }}>{item.note}</div>
              </div>
            ))}
          </div>

          <div className="r-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1px", backgroundColor: "#DDD3C2", marginTop: "1px" }}>
            <div style={{ backgroundColor: "#F1EBDF", padding: "32px 28px 36px" }}>
              <div style={{ ...sans("11px", "#B3A28A"), letterSpacing: "0.2em", marginBottom: "20px" }}>09</div>
              <div style={{ ...serif("23px", { marginBottom: "16px", lineHeight: 1.1 }) }}>Recovery Probability Score</div>
              <div style={{ ...sans("12.5px", "#5F5648"), lineHeight: 1.65 }}>For every error we find, Verity estimates your likelihood of winning that dispute. Estimates start from published industry baselines and sharpen as real dispute outcomes accumulate.</div>
            </div>
            <div style={{ backgroundColor: "#F1EBDF", padding: "32px 28px 36px" }}>
              <div style={{ ...sans("11px", "#B3A28A"), letterSpacing: "0.2em", marginBottom: "20px" }}>10</div>
              <div style={{ ...serif("23px", { marginBottom: "16px", lineHeight: 1.1 }) }}>Financial Harm Score</div>
              <div style={{ ...sans("12.5px", "#5F5648"), lineHeight: 1.65 }}>One composite number showing your total financial risk: dollar amount in dispute, collection activity, credit reporting exposure, deadline urgency, and recovery odds, all in one score.</div>
            </div>
          </div>

          <p style={{ ...sans("12px", "#8A7F6E"), letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "40px" }}>
            Every finding cites the specific federal rule or contract clause it conflicts with.
          </p>
        </div>
      </SectionAccordion>

      {/* ── The Verity Method ── */}
      <SectionAccordion
        eyebrow="The Verity method"
        teaser="The engine behind every audit. Four steps, one pass."
        title={
          <>
            Four steps. One pass.{" "}
            <em style={{ fontStyle: "italic", color: "#C8A97E" }}>A method no one else has.</em>
          </>
        }
      >
        <div style={{ maxWidth: "1100px" }}>
          <p style={{ ...sans("14px", "#5F5648"), lineHeight: 1.75, maxWidth: "560px", marginBottom: "56px" }}>
            The engine behind every audit. Most tools read a claim. Verity reads
            your documents the way an investigator would, then checks each charge
            against the specific rule that governs it.
          </p>

          <div className="r-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1px", backgroundColor: "#D8CFBE" }}>
            {[
              { r: "I", name: "Multimodal extraction", body: "We turn a phone photo of a bill or EOB into every CPT code, charge, date, and modifier, flagging anything the image left uncertain." },
              { r: "II", name: "Simultaneous audit", body: "NCCI, MUE, and Medicare fee-schedule rules are checked in a single pass, fewer false positives, and nothing slips between datasets." },
              { r: "III", name: "E&M integrity scoring", body: "A weighted model judges whether the visit level billed is actually supported, catching the upcoding that coding-only checkers miss." },
              { r: "IV", name: "Citation-linked disputes", body: "Every finding is mapped to the specific rule it conflicts with and written into a dispute package with the citation embedded." },
              { r: "V", name: "Outcome prediction", body: "Before you file, see your estimated recovery amount, likely resolution timeframe, escalation probability, and a specific settlement range, so you know what you're walking into." },
              { r: "VI", name: "A mapped escalation path", body: "Verity lays out each next step in your dispute, who to contact, and the deadline that applies. You approve everything before it goes out." },
            ].map((c) => (
              <div key={c.r} style={{ backgroundColor: "var(--surface)", padding: "36px 28px 40px" }}>
                <div style={{ ...serif("34px", { color: "#C8A97E", lineHeight: 1, marginBottom: "20px" }) }}>{c.r}</div>
                <div style={{ ...serif("23px", { marginBottom: "14px", lineHeight: 1.15 }) }}>{c.name}</div>
                <div style={{ ...sans("12.5px", "#5F5648"), lineHeight: 1.65 }}>{c.body}</div>
              </div>
            ))}
          </div>

          <p style={{ ...sans("11px", "#8A7F6E"), letterSpacing: "0.06em", lineHeight: 1.7, marginTop: "40px", maxWidth: "640px" }}>
            The Verity™ audit method, scoring models, and datasets are
            proprietary and confidential. Patent Pending, 41 claims, 13 independent claim categories.
          </p>
        </div>
      </SectionAccordion>

      {/* ── How It Works ── */}
      <SectionAccordion
        eyebrow="How it works"
        teaser="Upload your bill, we find every error, then you choose what happens next."
        title={
          <>
            Three steps.{" "}
            <em style={{ fontStyle: "italic", color: "#C8A97E" }}>One outcome.</em>
          </>
        }
      >
        <div style={{ maxWidth: "1100px" }}>
        {[
          {
            num: "01",
            title: "Upload your bill.",
            body: "Drop your itemized medical bill, EOB, and insurance card. Takes three minutes.",
            time: "3 min",
          },
          {
            num: "02",
            title: "We find every error.",
            body: "Every code and charge is checked against your EOB and CMS reference data: fee schedules, NCCI bundling edits, and MUE limits. Each discrepancy is flagged with its dollar impact.",
            time: "24 hours",
          },
          {
            num: "03",
            title: "You choose what happens next.",
            body: "See your audit free. Download a ready-to-send dispute package; nothing is sent without your approval.",
            time: "Your call",
          },
        ].map((step, i) => (
          <motion.div
            key={step.num}
            className="r-step"
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{
              duration: 0.7,
              ease: [0.25, 0.1, 0.25, 1],
              delay: i * 0.1,
            }}
            style={{
              borderTop: "1px solid #D8CFBE",
              padding: "40px 0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                ...serif("80px", {
                  fontStyle: "italic",
                  color: "#EFE9DD",
                  lineHeight: 1,
                  width: "120px",
                  flexShrink: 0,
                }),
              }}
            >
              {step.num}
            </div>
            <div style={{ flex: 1, padding: "0 40px" }}>
              <div
                style={{
                  ...serif("28px", { lineHeight: 1.1, marginBottom: "12px" }),
                }}
              >
                {step.title}
              </div>
              <p
                style={{
                  ...sans("14px", "#5F5648"),
                  lineHeight: 1.75,
                  maxWidth: "420px",
                }}
              >
                {step.body}
              </p>
            </div>
            <div style={{ ...label("#8A7F6E"), fontSize: "10px" }}>
              {step.time}
            </div>
          </motion.div>
        ))}
        <div style={{ borderTop: "1px solid #D8CFBE" }} />
        <Link href="/how-it-works" style={{ textDecoration: "none" }}>
          <span style={{ ...sans("12px", "#8A7F6E"), display: "inline-block", marginTop: "24px", textDecoration: "underline", textUnderlineOffset: "3px" }}>
            See the full process, step by step →
          </span>
        </Link>
        </div>
      </SectionAccordion>

      {/* ── Anatomy of a Recovery ── */}
      <SectionAccordion
        eyebrow="Anatomy of a recovery"
        teaser="A single ER bill, read line by line, every dollar tied to the rule behind it."
        title={
          <>
            One ER visit. Four errors.{" "}
            <em style={{ fontStyle: "italic", color: "#C8A97E" }}>$1,340 back.</em>
          </>
        }
      >
        <div style={{ maxWidth: "1100px" }}>
          <p style={{ ...sans("14px", "#5F5648"), lineHeight: 1.75, maxWidth: "560px", marginBottom: "48px" }}>
            A single emergency-room bill, read line by line. Here is exactly what
            Verity found, and the rule behind every dollar.
          </p>

          {/* ledger */}
          <div
            className="r-grid-2"
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              borderTop: "1px solid #D8CFBE",
              borderBottom: "1px solid #D8CFBE",
              marginBottom: "56px",
            }}
          >
            {[
              { k: "Original bill", v: "$4,827", gold: false },
              { k: "Errors found", v: "4", gold: false },
              { k: "Corrected balance", v: "$3,487", gold: false },
              { k: "Recovered", v: "$1,340", gold: true },
            ].map((m, i) => (
              <div key={m.k} style={{ padding: "32px 28px", borderLeft: i > 0 ? "1px solid #D8CFBE" : "none" }}>
                <div style={{ ...sans("11px", "#8A7F6E"), letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "12px" }}>{m.k}</div>
                <div style={{ ...serif("40px", { color: m.gold ? "#C8A97E" : "#221C14", lineHeight: 1 }) }}>{m.v}</div>
              </div>
            ))}
          </div>

          {/* findings */}
          {[
            { code: "99285", desc: "ED Visit, Level 5", err: "Upcoded · documentation supports Level 3", rule: "CMS E/M documentation guidelines", amt: "$820" },
            { code: "36415", desc: "Routine venipuncture", err: "Unbundled · included in the E&M code", rule: "NCCI procedure-to-procedure edit", amt: "$180" },
            { code: "93005", desc: "Electrocardiogram", err: "Billed above your plan’s contracted rate", rule: "Plan fee schedule · 42 CFR §414", amt: "$175" },
            { code: "85025", desc: "Complete blood count", err: "Billed above your plan’s contracted rate", rule: "Plan fee schedule", amt: "$165" },
          ].map((f) => (
            <div
              key={f.code}
              style={{
                display: "grid",
                gridTemplateColumns: "100px 1.4fr 1.6fr 120px",
                gap: "24px",
                alignItems: "baseline",
                borderTop: "1px solid #E2DACB",
                padding: "24px 0",
              }}
            >
              <div style={{ fontFamily: "var(--font-public-sans), system-ui, sans-serif", fontSize: "13px", color: "#8A7F6E", letterSpacing: "0.05em" }}>{f.code}</div>
              <div style={{ ...serif("22px", { color: "#221C14", lineHeight: 1.2 }) }}>{f.desc}</div>
              <div>
                <div style={{ ...sans("13px", "#2A2520"), lineHeight: 1.5 }}>{f.err}</div>
                <div style={{ ...sans("11px", "#B3A28A"), letterSpacing: "0.05em", marginTop: "4px" }}>{f.rule}</div>
              </div>
              <div style={{ ...serif("24px", { color: "#C8A97E" }), textAlign: "right" }}>{f.amt}</div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #D8CFBE" }} />

          <p style={{ ...sans("11px", "#8A7F6E"), letterSpacing: "0.06em", marginTop: "24px", fontStyle: "italic" }}>
            Representative audit based on a common ER billing pattern. Your results depend on your own bill.
          </p>
        </div>
      </SectionAccordion>

      {/* ── How Verity Compares ── */}
      <SectionAccordion
        eyebrow="How Verity compares"
        bg="#F1EBDF"
        teaser="Coding-only checkers stop after a few CPT errors. See the full comparison."
        title={
          <>
            Everyone else stops{" "}
            <em style={{ fontStyle: "italic", color: "#C8A97E" }}>where we begin.</em>
          </>
        }
      >
        <div style={{ maxWidth: "1100px" }}>
          <p style={{ ...sans("14px", "#5F5648"), lineHeight: 1.75, maxWidth: "520px", marginBottom: "48px" }}>
            Coding-only checkers read a claim and flag a few CPT errors. Verity
            reads your documents, every ruleset, and the specific rules behind
            each charge.
          </p>

          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: "680px" }}>
              {/* header */}
              <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 1fr 1.1fr", borderBottom: "1px solid #C9BFAC" }}>
                {["", "On your own", "Coding-only tools", "Verity"].map((h, i) => (
                  <div key={i} style={{ padding: "0 16px 16px" }}>
                    <span style={{ ...sans("11px", i === 3 ? "#C8A97E" : "#8A7F6E"), letterSpacing: "0.14em", textTransform: "uppercase", fontWeight: i === 3 ? 500 : 400 }}>{h}</span>
                  </div>
                ))}
              </div>
              {[
                { f: "Reads a photo or PDF of your bill", a: "you", b: "no", v: "yes" },
                { f: "CPT coding checks (NCCI, MUE)", a: "no", b: "yes", v: "yes" },
                { f: "Medicare fee-schedule overcharges", a: "no", b: "some", v: "yes" },
                { f: "EOB and insurance-contract errors", a: "no", b: "no", v: "yes" },
                { f: "Upcoding / E&M integrity", a: "no", b: "some", v: "yes" },
                { f: "Balance billing & out-of-network (NSA)", a: "no", b: "no", v: "yes" },
                { f: "Cites the exact federal rule", a: "no", b: "no", v: "yes" },
                { f: "Writes the dispute letter, ready to send", a: "no", b: "no", v: "yes" },
                { f: "Audits every new bill you upload", a: "no", b: "no", v: "yes" },
              ].map((row, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 1fr 1.1fr", borderBottom: "1px solid #E2DACB", alignItems: "center" }}>
                  <div style={{ padding: "18px 16px" }}><span style={{ ...sans("13px", "#2A2520") }}>{row.f}</span></div>
                  {[row.a, row.b, row.v].map((cell, ci) => {
                    const isVerity = ci === 2;
                    const mark = cell === "yes" ? "✓" : cell === "some" ? "partial" : cell === "you" ? "manual" : "-";
                    const color = cell === "yes" ? (isVerity ? "#C8A97E" : "#5E7E66") : cell === "no" ? "#C2B7A3" : "#8A7F6E";
                    return (
                      <div key={ci} style={{ padding: "18px 16px", backgroundColor: isVerity ? "rgba(200,169,126,0.08)" : "transparent" }}>
                        <span style={{ ...sans(mark.length > 1 ? "11px" : "16px", color), letterSpacing: mark.length > 1 ? "0.08em" : "0", textTransform: "uppercase", fontWeight: cell === "yes" && isVerity ? 600 : 400 }}>{mark}</span>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionAccordion>

      {/* ── Roadmap teaser ── */}
      <section style={{ borderTop: "1px dashed #CFC6B4", padding: "40px 64px" }}>
        <Link href="/how-it-works#whats-next" style={{ textDecoration: "none" }}>
          <span style={{ ...sans("12px", "#8A7F6E"), textDecoration: "underline", textUnderlineOffset: "3px" }}>
            See what we&apos;re building →
          </span>
        </Link>
      </section>

      {/* ── Pricing teaser ── */}
      <section style={{ padding: "96px 64px" }}>
        <motion.div {...fadeUp}>
          <div style={{ ...label(), marginBottom: "24px" }}>Pricing</div>
          <h2
            style={{
              ...serif("48px", { lineHeight: 1.05, marginBottom: "16px" }),
            }}
          >
            Start free.
            <br />
            Pay when you act.
          </h2>
          <p style={{ ...sans("14px", "#5F5648"), maxWidth: "460px", lineHeight: 1.75, marginBottom: "32px" }}>
            The audit is free. A single dispute package is $39. The membership is
            $149 a year (or $19 a month) for unlimited audits and dispute
            packages, for every bill in your house.
          </p>
          <Link href="/pricing" style={{ textDecoration: "none" }}>
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
              See full pricing →
            </span>
          </Link>
        </motion.div>
      </section>

      {/* ── Advocacy note ── */}
      <section style={{ backgroundColor: "#F4EFE6", padding: "64px" }}>
        <motion.div
          {...fadeUp}
          className="r-cta"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "32px" }}
        >
          <div style={{ ...serif("28px", { lineHeight: 1.2 }) }}>
            Verity is an administrative advocacy service, not a law firm.
          </div>
          <Link href="/how-it-works" style={{ textDecoration: "none", flexShrink: 0 }}>
            <span style={{ ...sans("12px", "#8A7F6E"), textDecoration: "underline", textUnderlineOffset: "3px" }}>
              How we&apos;re authorized to help →
            </span>
          </Link>
        </motion.div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ padding: "96px 64px" }}>
        <motion.div {...fadeUp}>
          <div style={{ ...label(), marginBottom: "24px" }}>Questions</div>
          <h2
            style={{
              ...serif("48px", { lineHeight: 1.05, marginBottom: "64px" }),
            }}
          >
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
