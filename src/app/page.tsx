"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import { startMembershipCheckout } from "@/lib/checkout";
import { ChevronDown } from "lucide-react";

// ─── Style helpers ────────────────────────────────────────────────────────────
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

// ─── FAQs ─────────────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: "What types of billing errors do you find?",
    a: "The most common: upcoding (charging for a more expensive procedure than performed), duplicate billing, balance billing violations, charges above contracted rates, and unbundling (splitting one procedure into multiple charges). Most patients have at least two.",
  },
  {
    q: "How long does it take?",
    a: "Audit reports are ready within 24 hours of upload, and your dispute package is generated instantly. Before you file, you'll see an estimated recovery amount, likely timeframe, and settlement range. Once you send it — or authorize Verity to file on your behalf — most insurers and providers respond within 30 days. Complex cases and appeals can take longer, and Verity generates every follow-up letter you need at each step.",
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

// ─── Nav ──────────────────────────────────────────────────────────────────────
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
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: "12px" }}>
        <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true" style={{ display: "block" }}>
          <circle cx="32" cy="32" r="20" fill="none" stroke="#B8945C" strokeWidth="1.8" />
          <text x="32" y="45" textAnchor="middle" fontFamily="var(--font-cormorant), Georgia, serif" fontSize="36" fontWeight={500} fill="#B8945C">V</text>
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
            Verity™
          </span>
          <span
            style={{
              ...sans("8px", "#8A7F6E"),
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              paddingLeft: "0.42em",
              lineHeight: 1,
            }}
          >
            Med Claim
          </span>
        </span>
      </Link>

      <div className="hidden md:flex" style={{ gap: "40px" }}>
        {[
          { label: "How it works", href: "/how-it-works" },
          { label: "Pricing", href: "/pricing" },
          { label: "FAQ", href: "#faq" },
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
          }}
        >
          Verity™
        </div>
        <div
          style={{
            ...sans("9px", "#8A7F6E"),
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            paddingLeft: "0.34em",
            marginTop: "6px",
            marginBottom: "20px",
          }}
        >
          Med Claim
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
          and confidential. Patent Pending — 41 claims, 13 independent claim categories.
        </div>
      </div>
    </footer>
  );
}

// ─── CountUp ──────────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1800) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !started.current) {
          started.current = true;
          const startTime = performance.now();
          const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
          const tick = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            setCount(Math.round(easeOutCubic(progress) * target));
            if (progress < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration]);

  return { count, ref };
}

function StatItem({
  value,
  prefix,
  suffix,
  statLabel,
}: {
  value: number;
  prefix: string;
  suffix: string;
  statLabel: string;
}) {
  const { count, ref } = useCountUp(value);
  return (
    <div ref={ref} style={{ textAlign: "center", padding: "0 32px" }}>
      <div style={{ ...serif("64px"), lineHeight: 1 }}>
        {prefix}
        {count.toLocaleString()}
        {suffix}
      </div>
      <div style={{ ...label("#8A7F6E"), marginTop: "12px" }}>{statLabel}</div>
    </div>
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
    <div className="page-root" style={{ background: "#EBE5D9", minHeight: "100vh" }}>
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
          Clarity over confusion. Verity™ uses AI and expert advocacy to uncover
          overcharges, decode complex billing, and restore financial clarity.
        </h1>
        <Image
          src="/hero-campaign.png"
          alt="Verity — Clarity over confusion. We investigate, analyze, and advocate so you keep more of what's yours."
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
              Check my bill — free
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

      {/* ── Stats Bar ── */}
      <motion.section
        {...fadeUp}
        style={{
          borderTop: "1px solid #D8CFBE",
          borderBottom: "1px solid #D8CFBE",
          padding: "56px 64px",
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1px 1fr 1px 1fr",
            alignItems: "center",
          }}
        >
          {[
            { value: 12400, prefix: "", suffix: "+", statLabel: "bills audited" },
            { value: 1840, prefix: "$", suffix: "", statLabel: "average savings" },
            { value: 91, prefix: "", suffix: "%", statLabel: "success rate" },
          ].map((stat, i) => (
            <React.Fragment key={stat.statLabel}>
              {i > 0 && (
                <div
                  style={{
                    width: "1px",
                    height: "80px",
                    backgroundColor: "#D8CFBE",
                    margin: "0 auto",
                  }}
                />
              )}
              <StatItem {...stat} />
            </React.Fragment>
          ))}
        </div>
      </motion.section>

      {/* ── Problem Section ── */}
      <motion.section
        {...fadeUp}
        style={{ padding: "112px 64px" }}
      >
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
              marginBottom: "32px",
            }}
          >
            Providers upcode procedures. Insurers underpay. Duplicate charges
            slip through. Most patients never know — because the bills are
            designed to be unreadable.
          </p>
          <div
            style={{
              borderTop: "1px solid #D8CFBE",
              paddingTop: "32px",
              display: "flex",
              flexDirection: "column",
              gap: "24px",
            }}
          >
            {[
              { num: "80%", stat: "of all medical bills contain at least one error" },
              { num: "$1,300", stat: "average overcharge on a hospital bill" },
              { num: "1 in 3", stat: "patients are balance billed illegally" },
            ].map((item) => (
              <div key={item.num}>
                <div
                  style={{
                    ...serif("48px", {
                      fontStyle: "italic",
                      color: "#C8A97E",
                      lineHeight: 1,
                    }),
                  }}
                >
                  {item.num}
                </div>
                <div style={{ ...sans("12px", "#8A7F6E"), marginTop: "4px" }}>
                  {item.stat}
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ── What We Look For ── */}
      <SectionAccordion
        eyebrow="What we look for"
        bg="#F1EBDF"
        teaser="Most overcharges hide in the EOB, the contract, and the network — not just the codes. The eight errors we catch."
        title={
          <>
            Most tools check coding.{" "}
            <em style={{ fontStyle: "italic", color: "#C8A97E" }}>We check everything.</em>
          </>
        }
      >
        <div style={{ maxWidth: "1100px" }}>
          <p style={{ ...sans("14px", "#5F5648"), lineHeight: 1.75, maxWidth: "520px", marginBottom: "56px" }}>
            Most overcharges aren’t coding mistakes — they hide in the EOB, the
            contract, and the network. Verity reads every layer. Eight of the
            errors we catch:
          </p>

          <div className="r-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1px", backgroundColor: "#DDD3C2" }}>
            {[
              { n: "01", name: "Duplicate charges", evidence: "Same CPT · same day · billed ×2", note: "Identical services billed more than once." },
              { n: "02", name: "Upcoding", evidence: "99215 billed → 99213 documented", note: "A higher-intensity code than the visit supports." },
              { n: "03", name: "Unbundling", evidence: "One panel split into 6 line items", note: "Bundled services broken apart to bill more." },
              { n: "04", name: "Balance billing", evidence: "Out-of-network charge · NSA claim", note: "Illegal under the No Surprises Act." },
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
                    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
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
              <div style={{ ...sans("12.5px", "#5F5648"), lineHeight: 1.65 }}>For every error we find, our AI estimates your likelihood of winning that dispute. Estimates start from published industry baselines and sharpen as real VERITY dispute outcomes accumulate — and each prediction shows how many real outcomes it&apos;s based on.</div>
            </div>
            <div style={{ backgroundColor: "#F1EBDF", padding: "32px 28px 36px" }}>
              <div style={{ ...sans("11px", "#B3A28A"), letterSpacing: "0.2em", marginBottom: "20px" }}>10</div>
              <div style={{ ...serif("23px", { marginBottom: "16px", lineHeight: 1.1 }) }}>Financial Harm Score</div>
              <div style={{ ...sans("12.5px", "#5F5648"), lineHeight: 1.65 }}>One composite number showing your total financial risk: dollar amount in dispute, collection activity, credit reporting exposure, deadline urgency, and recovery odds — all in one score.</div>
            </div>
          </div>

          <p style={{ ...sans("12px", "#8A7F6E"), letterSpacing: "0.08em", textTransform: "uppercase", marginTop: "40px" }}>
            Every finding is backed by the exact federal rule or contract clause it violates.
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
            your documents the way an investigator would, then proves it against
            the law.
          </p>

          <div className="r-grid-2" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1px", backgroundColor: "#D8CFBE" }}>
            {[
              { r: "I", name: "Multimodal extraction", body: "We turn a phone photo of a bill or EOB into every CPT code, charge, date, and modifier — flagging anything the image left uncertain." },
              { r: "II", name: "Simultaneous audit", body: "NCCI, MUE, and Medicare fee-schedule rules are checked in a single pass — fewer false positives, and nothing slips between datasets." },
              { r: "III", name: "E&M integrity scoring", body: "A weighted model judges whether the visit level billed is actually supported — catching the upcoding that coding-only checkers miss." },
              { r: "IV", name: "Citation-linked disputes", body: "Every violation is mapped to the exact regulation it breaks and written into a dispute package, citation embedded, ready to send." },
              { r: "V", name: "Outcome prediction", body: "Before you file, see your estimated recovery amount, likely resolution timeframe, escalation probability, and a specific settlement range — so you know what you're walking into." },
              { r: "VI", name: "Autonomous advocacy", body: "Once you authorize it, Verity can run your dispute for you — generating correspondence, filing appeals, and adapting to every response until the case is closed." },
            ].map((c) => (
              <div key={c.r} style={{ backgroundColor: "#EBE5D9", padding: "36px 28px 40px" }}>
                <div style={{ ...serif("34px", { color: "#C8A97E", lineHeight: 1, marginBottom: "20px" }) }}>{c.r}</div>
                <div style={{ ...serif("23px", { marginBottom: "14px", lineHeight: 1.15 }) }}>{c.name}</div>
                <div style={{ ...sans("12.5px", "#5F5648"), lineHeight: 1.65 }}>{c.body}</div>
              </div>
            ))}
          </div>

          <p style={{ ...sans("11px", "#8A7F6E"), letterSpacing: "0.06em", lineHeight: 1.7, marginTop: "40px", maxWidth: "640px" }}>
            The Verity™ audit method, scoring models, and datasets are
            proprietary and confidential. Patent Pending — 41 claims, 13 independent claim categories.
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
            body: "We normalize every document you upload — your itemized bill, your EOB, your denial letter, your authorization — into a single unified schema, then compare them against each other and against federal billing rules in one pass. Discrepancies across documents are found automatically, no manual review required.",
            time: "24 hours",
          },
          {
            num: "03",
            title: "You choose what happens next.",
            body: "See your audit free. Get your estimated recovery amount and settlement range before you file. Download a ready-to-send dispute package — or authorize Verity to run the dispute entirely, filing correspondence and appeals on your behalf until it's resolved.",
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
        </div>
      </SectionAccordion>

      {/* ── Anatomy of a Recovery ── */}
      <SectionAccordion
        eyebrow="Anatomy of a recovery"
        teaser="A single ER bill, read line by line — every dollar tied to the rule behind it."
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
            Verity found — and the rule behind every dollar.
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
              { k: "What you actually owed", v: "$3,487", gold: false },
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
            { code: "99285", desc: "ED Visit — Level 5", err: "Upcoded · documentation supports Level 3", rule: "CMS E/M documentation guidelines", amt: "$820" },
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
              <div style={{ fontFamily: "var(--font-dm-sans), system-ui, sans-serif", fontSize: "13px", color: "#8A7F6E", letterSpacing: "0.05em" }}>{f.code}</div>
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
            reads your documents, every ruleset, and the law behind each charge.
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
                { f: "Writes the dispute & appeal letters", a: "no", b: "no", v: "yes" },
                { f: "Watches every future bill", a: "no", b: "no", v: "yes" },
              ].map((row, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 1fr 1.1fr", borderBottom: "1px solid #E2DACB", alignItems: "center" }}>
                  <div style={{ padding: "18px 16px" }}><span style={{ ...sans("13px", "#2A2520") }}>{row.f}</span></div>
                  {[row.a, row.b, row.v].map((cell, ci) => {
                    const isVerity = ci === 2;
                    const mark = cell === "yes" ? "✓" : cell === "some" ? "partial" : cell === "you" ? "manual" : "—";
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

      {/* ── Continuous Monitoring ── */}
      <motion.section {...fadeUp} style={{ borderTop: "1px solid #D8CFBE", padding: "112px 64px" }}>
        <div style={{ maxWidth: "1100px", margin: "0 auto", display: "grid", gridTemplateColumns: "1.1fr 0.9fr", gap: "64px", alignItems: "center" }} className="r-grid-1">
          <div>
            <div style={{ ...label(), marginBottom: "24px" }}>Always on</div>
            <h2 style={{ ...serif("52px", { lineHeight: 1.05, marginBottom: "20px" }) }}>
              One bill, fixed.
              <br />
              <em style={{ fontStyle: "italic", color: "#C8A97E" }}>Then we keep watching.</em>
            </h2>
            <p style={{ ...sans("14px", "#5F5648"), lineHeight: 1.8, maxWidth: "440px", marginBottom: "32px" }}>
              Most overcharges arrive after you&apos;ve stopped looking. With a
              Verity membership, every new bill and EOB you receive is audited the
              moment it lands — and you&apos;re alerted the instant something looks
              wrong. Every encounter, every insurer, every dispute outcome is tracked
              in one place across your complete billing history. You never have to catch it yourself again.
            </p>
            <Link href="/upload?tier=membership" style={{ textDecoration: "none" }}>
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
                Start membership — $19/mo
              </span>
            </Link>
            <Image
              src="/verity-portrait.png"
              alt="Verity — clarity, authority, advocacy."
              width={1632}
              height={2048}
              style={{
                width: "100%",
                maxWidth: "360px",
                height: "auto",
                display: "block",
                marginTop: "48px",
              }}
            />
          </div>

          {/* monitoring feed */}
          <div style={{ borderLeft: "1px solid #D8CFBE", paddingLeft: "40px" }}>
            {[
              { d: "Apr 14", t: "New bill detected", s: "City Medical Center · $3,600", flag: true },
              { d: "Apr 10", t: "Audit complete", s: "1 error · $165 recoverable · 84% win probability", flag: true },
              { d: "Apr 10", t: "Dispute filed automatically", s: "Appeal letter sent to Aetna on your behalf", flag: true },
              { d: "Mar 28", t: "EOB reconciled", s: "Matches your plan — no action", flag: false },
              { d: "Mar 12", t: "Recovered", s: "$2,840 credited to your account", flag: false },
            ].map((row, i) => (
              <div key={i} style={{ display: "flex", gap: "16px", alignItems: "flex-start", paddingBottom: i < 3 ? "28px" : 0 }}>
                <div style={{ ...sans("11px", "#B3A28A"), letterSpacing: "0.08em", width: "48px", flexShrink: 0, paddingTop: "3px" }}>{row.d}</div>
                <div style={{ width: "7px", height: "7px", borderRadius: "50%", backgroundColor: row.flag ? "#C8A97E" : "#5E7E66", marginTop: "6px", flexShrink: 0 }} />
                <div>
                  <div style={{ ...serif("19px", { lineHeight: 1.2 }) }}>{row.t}</div>
                  <div style={{ ...sans("12px", "#8A7F6E"), marginTop: "2px" }}>{row.s}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ── Brand band ── */}
      <section
        style={{
          position: "relative",
          height: "84vh",
          minHeight: "520px",
          overflow: "hidden",
          borderTop: "1px solid #D8CFBE",
        }}
      >
        <Image
          src="/verity-portrait.png"
          alt="Verity"
          fill
          sizes="100vw"
          style={{ objectFit: "cover", objectPosition: "center 42%" }}
        />
      </section>

      {/* ── Pricing ── */}
      <section style={{ padding: "112px 64px" }}>
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
          <p style={{ ...sans("14px", "#8A7F6E"), marginBottom: "64px" }}>
            Three tiers. Each one goes further.
          </p>
        </motion.div>

        <div
          className="r-grid-1"
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "16px",
          }}
        >
          {/* Audit */}
          <motion.div
            {...fadeUp}
            style={{
              backgroundColor: "#F4EFE6",
              border: "1px solid #D8CFBE",
              padding: "32px",
            }}
          >
            <div style={{ ...serif("32px", { marginBottom: "4px" }) }}>
              Audit
            </div>
            <div
              style={{
                ...serif("52px", {
                  fontStyle: "italic",
                  lineHeight: 1,
                  marginBottom: "4px",
                }),
              }}
            >
              Free
            </div>
            <div style={{ ...sans("12px", "#8A7F6E") }}>always</div>
            <div style={{ borderTop: "1px solid #D8CFBE", margin: "24px 0" }} />
            <div
              style={{
                ...serif("18px", {
                  fontStyle: "italic",
                  color: "#5F5648",
                  lineHeight: 1.4,
                  marginBottom: "24px",
                }),
              }}
            >
              see exactly what they got wrong.
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginBottom: "32px",
              }}
            >
              {[
                "Upload your bill",
                "AI scans every charge",
                "Error report with confidence scores",
                "No dispute filed",
              ].map((f) => (
                <div
                  key={f}
                  style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}
                >
                  <span style={{ ...sans("13px", "#8A7F6E") }}>›</span>
                  <span style={{ ...sans("13px", "#5F5648") }}>{f}</span>
                </div>
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

          {/* Single Dispute */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
            style={{
              backgroundColor: "#F4EFE6",
              border: "1px solid #D8CFBE",
              padding: "32px",
              position: "relative",
            }}
          >
            <div style={{ ...serif("32px", { marginBottom: "4px" }) }}>
              Single Dispute
            </div>
            <div
              style={{
                ...serif("52px", {
                  fontStyle: "italic",
                  lineHeight: 1,
                  marginBottom: "4px",
                }),
              }}
            >
              $39
            </div>
            <div style={{ ...sans("12px", "#8A7F6E") }}>
              one-time, for one bill
            </div>
            <div style={{ borderTop: "1px solid #D8CFBE", margin: "24px 0" }} />
            <div
              style={{
                ...serif("18px", {
                  fontStyle: "italic",
                  color: "#5F5648",
                  lineHeight: 1.4,
                  marginBottom: "24px",
                }),
              }}
            >
              one bill. ready to send.
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginBottom: "32px",
              }}
            >
              {[
                "Everything in Audit, plus:",
                "Insurer-specific dispute package including the dispute letter, regulatory citations, financial calculations, and timeline summary.",
                "Appeal letter if denied",
                "Step-by-step submission guide",
                "Appeal deadline tracker with urgency alerts — Critical (under 7 days), High (under 30 days), Moderate (under 90 days).",
              ].map((f) => (
                <div
                  key={f}
                  style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}
                >
                  <span style={{ ...sans("13px", "#8A7F6E") }}>›</span>
                  <span style={{ ...sans("13px", "#5F5648") }}>{f}</span>
                </div>
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

          {/* Membership */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
            style={{
              backgroundColor: "#F4EFE6",
              border: "1.5px solid #C8A97E",
              padding: "32px",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                ...sans("9px", "#221C14"),
                backgroundColor: "#C8A97E",
                padding: "4px 8px",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              Most popular
            </div>
            <div style={{ ...serif("32px", { marginBottom: "4px" }) }}>
              Membership
            </div>
            <div
              style={{
                ...serif("52px", {
                  fontStyle: "italic",
                  lineHeight: 1,
                  marginBottom: "4px",
                }),
              }}
            >
              $19<span style={{ fontSize: "22px" }}>/mo</span>
            </div>
            <div style={{ ...sans("12px", "#8A7F6E") }}>
              or $149/yr — two months free
            </div>
            <div style={{ borderTop: "1px solid #D8CFBE", margin: "24px 0" }} />
            <div
              style={{
                ...serif("18px", {
                  fontStyle: "italic",
                  color: "#5F5648",
                  lineHeight: 1.4,
                  marginBottom: "24px",
                }),
              }}
            >
              your ongoing bill watchdog.
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "10px",
                marginBottom: "32px",
              }}
            >
              {[
                "Unlimited audits and dispute packages",
                "Every new bill audited automatically",
                "Alerts on new and suspicious charges",
                "Outcome prediction before you file — recovery amount, timeframe, and settlement range",
                "Autonomous dispute filing — authorize Verity to run the dispute for you",
                "Complete billing history tracked across all providers and insurers",
                "Escalation & regulator letters (appeal, DOI, CMS, CFPB) plus FCRA credit bureau and FDCPA collection dispute letters",
                "Priority support",
                "Real-time call guidance — coming soon",
              ].map((f) => (
                <div
                  key={f}
                  style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}
                >
                  <span style={{ ...sans("13px", "#8A7F6E") }}>›</span>
                  <span style={{ ...sans("13px", "#5F5648") }}>{f}</span>
                </div>
              ))}
            </div>
            <div
              onClick={() => startMembershipCheckout("monthly")}
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
          </motion.div>
        </div>
      </section>

      {/* ── Trust & Legal ── */}
      <section style={{ backgroundColor: "#F4EFE6", padding: "96px 64px" }}>
        <motion.div
          {...fadeUp}
          style={{ display: "grid", gridTemplateColumns: "3fr 2fr", gap: "80px" }}
        >
          <div>
            <div style={{ ...label(), marginBottom: "24px" }}>
              How we&apos;re authorized to help
            </div>
            <h2
              style={{
                ...serif("40px", { lineHeight: 1.1, marginBottom: "32px" }),
              }}
            >
              Medical bill advocacy
              <br />
              is a recognized profession.
            </h2>
            <p
              style={{
                ...sans("14px", "#5F5648"),
                lineHeight: 1.75,
              }}
            >
              Verity is an administrative advocacy service — not a law firm.
              Medical billing advocates are a recognized professional category
              authorized to review bills, identify errors, and file disputes on
              patients&apos; behalf with signed authorization.
            </p>
            <p
              style={{
                ...sans("14px", "#5F5648"),
                lineHeight: 1.75,
                marginTop: "16px",
              }}
            >
              Disputing a medical bill is your federally protected right under
              the No Surprises Act and applicable state patient protection laws.
              Verity arms you with the evidence, citations, and ready-to-send
              letters to exercise that right — so you&apos;re not navigating it alone.
            </p>
            <p style={{ ...sans("12px", "#8A7F6E"), marginTop: "32px" }}>
              Verity is not a law firm and does not provide legal advice. If
              your case requires legal action, we refer to appropriate counsel.
            </p>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "28px",
              justifyContent: "center",
            }}
          >
            {[
              {
                icon: "shield",
                text: "Disputes filed under your signed patient authorization",
              },
              {
                icon: "filecheck",
                text: "Federally protected under the No Surprises Act",
              },
              { icon: "lock", text: "Privacy-first document handling" },
            ].map((badge) => (
              <div
                key={badge.icon}
                style={{ display: "flex", gap: "16px", alignItems: "flex-start" }}
              >
                <div
                  style={{
                    color: "#C8A97E",
                    flexShrink: 0,
                    marginTop: "2px",
                  }}
                >
                  {badge.icon === "shield" && (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  )}
                  {badge.icon === "filecheck" && (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <polyline points="9 15 11 17 15 13" />
                    </svg>
                  )}
                  {badge.icon === "lock" && (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  )}
                </div>
                <span style={{ ...sans("13px", "#5F5648") }}>{badge.text}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* ── FAQ ── */}
      <section id="faq" style={{ padding: "112px 64px" }}>
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
