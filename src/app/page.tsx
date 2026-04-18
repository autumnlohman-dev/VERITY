"use client";

import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useTransform, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

// ─── Style helpers ────────────────────────────────────────────────────────────
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

// ─── FAQs ─────────────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: "What types of billing errors do you find?",
    a: "The most common: upcoding (charging for a more expensive procedure than performed), duplicate billing, balance billing violations, charges above contracted rates, and unbundling (splitting one procedure into multiple charges). Most patients have at least two.",
  },
  {
    q: "How long does it take?",
    a: "Audit reports are ready within 24 hours of upload. Dispute letters are generated instantly. If you're on the Resolve tier, most disputes close in 14–21 days. Complex cases or second-level appeals may take 45–60 days.",
  },
  {
    q: "What do I need to upload?",
    a: "Your itemized medical bill (not the summary — request the itemized version from your provider if you don't have it), your Explanation of Benefits from your insurer, and your insurance card. The EOB is optional but makes the audit more precise.",
  },
  {
    q: "What happens if my insurer denies the dispute?",
    a: "On the Dispute tier, you can upgrade to Resolve and we take over. On the Resolve tier, we escalate to a second-level appeal, then external review if needed. We track every deadline and handle every follow-up.",
  },
  {
    q: "Is my medical data safe?",
    a: "All documents are encrypted at rest and in transit using AES-256. We operate under HIPAA-compliant data handling protocols. We never sell or share your information with any third party.",
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
          { label: "FAQ", href: "#faq" },
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

// ─── Footer ───────────────────────────────────────────────────────────────────
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
        <div
          style={{
            ...sans("12px", "#F5F0E8"),
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            marginBottom: "8px",
          }}
        >
          ClearClaim
        </div>
        <div style={{ ...sans("11px", "#6B635C"), marginBottom: "16px" }}>
          Medical bill advocacy.
        </div>
        <div
          style={{
            ...sans("11px", "#6B635C"),
            maxWidth: "260px",
            lineHeight: 1.6,
          }}
        >
          ClearClaim is an administrative advocacy service. We are not a law
          firm and do not provide legal advice.
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
            style={{
              ...sans("11px", "#6B635C"),
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#A89F96")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#6B635C")}
          >
            {link.lbl}
          </Link>
        ))}
      </div>
      <div>
        <div style={{ ...sans("11px", "#6B635C"), marginBottom: "4px" }}>
          © 2026 ClearClaim
        </div>
        <div style={{ ...sans("11px", "#6B635C") }}>All rights reserved.</div>
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
      <div style={{ ...label("#6B635C"), marginTop: "12px" }}>{statLabel}</div>
    </div>
  );
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────────
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
        <span
          style={{
            fontFamily: "var(--font-cormorant), Georgia, serif",
            fontSize: "20px",
            color: "#F5F0E8",
            fontWeight: 400,
          }}
        >
          {q}
        </span>
        <ChevronDown
          size={18}
          color="#6B635C"
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
                ...sans("14px", "#A89F96"),
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 600], ["0%", "18%"]);

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
      <section style={{ height: "100svh", position: "relative", overflow: "hidden" }}>
        <motion.div style={{ position: "absolute", inset: 0, y: heroY }}>
          <Image
            src="https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=1920&q=80"
            alt=""
            fill
            style={{ objectFit: "cover", objectPosition: "center" }}
            priority
          />
        </motion.div>

        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(to bottom, rgba(13,13,13,0.25) 0%, rgba(13,13,13,0.55) 40%, rgba(13,13,13,1) 100%)",
          }}
        />

        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            paddingBottom: "80px",
            padding: "0 64px 80px",
          }}
        >
          <div style={{ ...label(), marginBottom: "32px" }}>
            Medical billing advocacy
          </div>

          <h1
            style={{
              ...serif("clamp(72px, 8vw, 108px)", {
                lineHeight: 0.9,
                maxWidth: "900px",
              }),
            }}
          >
            Your medical bill
            <br />
            is probably wrong.
            <br />
            <em style={{ fontStyle: "italic" }}>We&apos;ll prove it.</em>
          </h1>

          <div
            style={{
              borderTop: "1px solid rgba(245,240,232,0.15)",
              width: "48px",
              margin: "32px 0",
            }}
          />

          <p
            style={{
              ...sans("15px", "#A89F96"),
              maxWidth: "360px",
              lineHeight: 1.75,
            }}
          >
            Start free. See every error on your bill. Then decide if you want
            us to fight it.
          </p>

          <div
            style={{
              display: "flex",
              gap: "16px",
              alignItems: "center",
              marginTop: "40px",
            }}
          >
            <Link href="/upload" style={{ textDecoration: "none" }}>
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
                Check my bill — free
              </span>
            </Link>
            <Link href="/how-it-works" style={{ textDecoration: "none" }}>
              <span
                style={{
                  ...sans("11px", "#F5F0E8"),
                  border: "1px solid rgba(245,240,232,0.25)",
                  padding: "16px 32px",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  display: "inline-block",
                  transition: "border-color 0.2s",
                }}
                onMouseEnter={(e) =>
                  ((e.currentTarget as HTMLSpanElement).style.borderColor =
                    "rgba(245,240,232,0.5)")
                }
                onMouseLeave={(e) =>
                  ((e.currentTarget as HTMLSpanElement).style.borderColor =
                    "rgba(245,240,232,0.25)")
                }
              >
                See how it works
              </span>
            </Link>
          </div>
        </div>

        <div style={{ position: "absolute", bottom: "32px", right: "32px" }}>
          <span
            style={{
              ...sans("10px", "#6B635C"),
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              display: "block",
              transform: "rotate(90deg)",
              transformOrigin: "center",
            }}
          >
            scroll
          </span>
        </div>
      </section>

      {/* ── Stats Bar ── */}
      <motion.section
        {...fadeUp}
        style={{
          borderTop: "1px solid #242424",
          borderBottom: "1px solid #242424",
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
                    backgroundColor: "#242424",
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
              ...sans("14px", "#A89F96"),
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
              borderTop: "1px solid #242424",
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
                <div style={{ ...sans("12px", "#6B635C"), marginTop: "4px" }}>
                  {item.stat}
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.section>

      {/* ── How It Works ── */}
      <section id="how-it-works" style={{ padding: "112px 64px" }}>
        <motion.div {...fadeUp}>
          <div style={{ ...label(), marginBottom: "24px" }}>How it works</div>
          <h2
            style={{
              ...serif("48px", { lineHeight: 1.05, marginBottom: "64px" }),
            }}
          >
            Three steps.
            <br />
            One outcome.
          </h2>
        </motion.div>

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
            body: "Our system cross-references every CPT code and charge against your insurer's contracted rates. Every error gets flagged with evidence.",
            time: "24 hours",
          },
          {
            num: "03",
            title: "You choose what happens next.",
            body: "See the audit free. Get a prefilled dispute letter. Or let us file and close the dispute entirely.",
            time: "Your call",
          },
        ].map((step, i) => (
          <motion.div
            key={step.num}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{
              duration: 0.7,
              ease: [0.25, 0.1, 0.25, 1],
              delay: i * 0.1,
            }}
            style={{
              borderTop: "1px solid #242424",
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
                  color: "#1E1E1E",
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
                  ...sans("14px", "#A89F96"),
                  lineHeight: 1.75,
                  maxWidth: "420px",
                }}
              >
                {step.body}
              </p>
            </div>
            <div style={{ ...label("#6B635C"), fontSize: "10px" }}>
              {step.time}
            </div>
          </motion.div>
        ))}
        <div style={{ borderTop: "1px solid #242424" }} />
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
            Pay only if it works.
          </h2>
          <p style={{ ...sans("14px", "#6B635C"), marginBottom: "64px" }}>
            Three tiers. Each one goes further.
          </p>
        </motion.div>

        <div
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
              backgroundColor: "#111111",
              border: "1px solid #242424",
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
            <div style={{ ...sans("12px", "#6B635C") }}>always</div>
            <div style={{ borderTop: "1px solid #242424", margin: "24px 0" }} />
            <div
              style={{
                ...serif("18px", {
                  fontStyle: "italic",
                  color: "#A89F96",
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
                  <span style={{ ...sans("13px", "#6B635C") }}>›</span>
                  <span style={{ ...sans("13px", "#A89F96") }}>{f}</span>
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

          {/* Dispute */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
            style={{
              backgroundColor: "#111111",
              border: "1px solid rgba(200,169,126,0.4)",
              padding: "32px",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                ...sans("9px", "#C8A97E"),
                backgroundColor: "rgba(200,169,126,0.15)",
                border: "1px solid rgba(200,169,126,0.3)",
                padding: "4px 8px",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              Most popular
            </div>
            <div style={{ ...serif("32px", { marginBottom: "4px" }) }}>
              Dispute
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
            <div style={{ ...sans("12px", "#6B635C") }}>
              per letter, or $19/mo
            </div>
            <div style={{ borderTop: "1px solid #242424", margin: "24px 0" }} />
            <div
              style={{
                ...serif("18px", {
                  fontStyle: "italic",
                  color: "#A89F96",
                  lineHeight: 1.4,
                  marginBottom: "24px",
                }),
              }}
            >
              your weapon. ready to send.
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
                "Insurer-specific prefilled dispute letter",
                "Step-by-step submission guide",
                "Deadline tracker",
                "Email reminders",
              ].map((f) => (
                <div
                  key={f}
                  style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}
                >
                  <span style={{ ...sans("13px", "#6B635C") }}>›</span>
                  <span style={{ ...sans("13px", "#A89F96") }}>{f}</span>
                </div>
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

          {/* Resolve */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
            style={{
              backgroundColor: "#111111",
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
                ...sans("9px", "#0D0D0D"),
                backgroundColor: "#C8A97E",
                padding: "4px 8px",
                letterSpacing: "0.15em",
                textTransform: "uppercase",
              }}
            >
              Full service
            </div>
            <div style={{ ...serif("32px", { marginBottom: "4px" }) }}>
              Resolve
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
              25%
            </div>
            <div style={{ ...sans("12px", "#6B635C") }}>
              of savings recovered
            </div>
            <div style={{ ...sans("11px", "#7A9E87"), marginTop: "4px" }}>
              $0 upfront
            </div>
            <div style={{ borderTop: "1px solid #242424", margin: "24px 0" }} />
            <div
              style={{
                ...serif("18px", {
                  fontStyle: "italic",
                  color: "#A89F96",
                  lineHeight: 1.4,
                  marginBottom: "24px",
                }),
              }}
            >
              we handle everything. you cash the difference.
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
                "Everything in Dispute, plus:",
                "We file the dispute on your behalf",
                "All insurer communication",
                "Second-level appeal if denied",
                "External review if needed",
                "Pay nothing unless we recover",
              ].map((f) => (
                <div
                  key={f}
                  style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}
                >
                  <span style={{ ...sans("13px", "#6B635C") }}>›</span>
                  <span style={{ ...sans("13px", "#A89F96") }}>{f}</span>
                </div>
              ))}
            </div>
            <Link href="/upload?tier=resolve" style={{ textDecoration: "none" }}>
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
                Let us handle it
              </div>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ── Trust & Legal ── */}
      <section style={{ backgroundColor: "#111111", padding: "96px 64px" }}>
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
                ...sans("14px", "#A89F96"),
                lineHeight: 1.75,
              }}
            >
              ClearClaim is an administrative advocacy service — not a law firm.
              Medical billing advocates are a recognized professional category
              authorized to review bills, identify errors, and file disputes on
              patients&apos; behalf with signed authorization.
            </p>
            <p
              style={{
                ...sans("14px", "#A89F96"),
                lineHeight: 1.75,
                marginTop: "16px",
              }}
            >
              Disputing a medical bill is your federally protected right under
              the No Surprises Act and applicable state patient protection laws.
              We handle the administrative process so you don&apos;t have to
              navigate it alone.
            </p>
            <p style={{ ...sans("12px", "#6B635C"), marginTop: "32px" }}>
              ClearClaim is not a law firm and does not provide legal advice. If
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
              { icon: "lock", text: "HIPAA-compliant document handling" },
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
                <span style={{ ...sans("13px", "#A89F96") }}>{badge.text}</span>
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
          <div style={{ borderTop: "1px solid #242424" }} />
        </div>
      </section>

      <Footer />
    </div>
  );
}
