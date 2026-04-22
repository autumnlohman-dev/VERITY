"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Plus } from "lucide-react";

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
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const links = [
    { label: "How it works", href: "/how-it-works" },
    { label: "Pricing", href: "/pricing" },
    { label: "FAQ", href: "#faq" },
  ];

  return (
    <>
      <nav
        className="fixed top-0 left-0 right-0 z-50 transition-colors duration-300"
        style={{
          backgroundColor: scrolled ? "rgba(245,240,232,0.92)" : "transparent",
          backdropFilter: scrolled ? "blur(12px)" : "none",
          borderBottom: scrolled ? "1px solid var(--border)" : "1px solid transparent",
        }}
      >
        {/* Mobile: logo + hamburger */}
        <div className="md:hidden flex items-center justify-between px-6 py-5">
          <Link href="/" className="no-underline">
            <span
              className="font-[family-name:var(--font-dm-sans)] uppercase"
              style={{
                fontSize: "12px",
                letterSpacing: "0.25em",
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              ClearClaim
            </span>
          </Link>
          <button
            aria-label="Menu"
            onClick={() => setMobileOpen(true)}
            style={{ color: "var(--text-primary)", background: "none", border: "none" }}
          >
            <Menu size={22} />
          </button>
        </div>

        {/* Tablet (md only): hero is stacked, single-row layout is readable */}
        <div className="hidden md:flex lg:hidden items-center justify-between px-12 py-5">
          <Link href="/" className="no-underline">
            <span
              className="font-[family-name:var(--font-dm-sans)] uppercase"
              style={{
                fontSize: "12px",
                letterSpacing: "0.25em",
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              ClearClaim
            </span>
          </Link>
          <div className="flex items-center gap-10">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="no-underline transition-colors font-[family-name:var(--font-dm-sans)]"
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  fontWeight: 400,
                  color: "var(--text-muted)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
              >
                {link.label}
              </Link>
            ))}
          </div>
          <Link href="/upload" className="no-underline">
            <span
              className="inline-block font-[family-name:var(--font-dm-sans)] uppercase"
              style={{
                fontSize: "11px",
                letterSpacing: "0.2em",
                fontWeight: 500,
                color: "var(--bg)",
                backgroundColor: "var(--text-primary)",
                padding: "12px 24px",
              }}
            >
              Check my bill →
            </span>
          </Link>
        </div>

        {/* Desktop (lg+): 3-col grid mirroring the hero split — logo + links live in the cream column, CTA floats over the image */}
        <div
          className="hidden lg:grid items-center py-5"
          style={{ gridTemplateColumns: "48px 1fr 1fr" }}
        >
          <div />
          <div className="flex items-center justify-between pl-16">
            <Link href="/" className="no-underline">
              <span
                className="font-[family-name:var(--font-dm-sans)] uppercase"
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.25em",
                  fontWeight: 500,
                  color: "var(--text-primary)",
                }}
              >
                ClearClaim
              </span>
            </Link>
            <div className="flex items-center gap-10">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="no-underline transition-colors font-[family-name:var(--font-dm-sans)]"
                  style={{
                    fontSize: "11px",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    fontWeight: 400,
                    color: "var(--text-muted)",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-end px-16">
            <Link href="/upload" className="no-underline">
              <span
                className="inline-block font-[family-name:var(--font-dm-sans)] uppercase"
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.2em",
                  fontWeight: 500,
                  color: "var(--bg)",
                  backgroundColor: "var(--text-primary)",
                  padding: "12px 24px",
                }}
              >
                Check my bill →
              </span>
            </Link>
          </div>
        </div>
      </nav>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="md:hidden fixed inset-0 z-[60] flex flex-col px-6 py-5"
            style={{ backgroundColor: "var(--bg)" }}
          >
            <div className="flex items-center justify-between mb-20">
              <span
                className="font-[family-name:var(--font-dm-sans)] uppercase"
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.25em",
                  fontWeight: 500,
                  color: "var(--text-primary)",
                }}
              >
                ClearClaim
              </span>
              <button
                aria-label="Close menu"
                onClick={() => setMobileOpen(false)}
                style={{ color: "var(--text-primary)", background: "none", border: "none" }}
              >
                <X size={22} />
              </button>
            </div>
            <div className="flex flex-col gap-8">
              {links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="font-[family-name:var(--font-cormorant)] no-underline"
                  style={{
                    fontSize: "36px",
                    fontWeight: 300,
                    color: "var(--text-primary)",
                    lineHeight: 1.1,
                  }}
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <Link
              href="/upload"
              onClick={() => setMobileOpen(false)}
              className="mt-auto no-underline"
            >
              <div
                className="w-full text-center font-[family-name:var(--font-dm-sans)] uppercase"
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.2em",
                  fontWeight: 500,
                  color: "var(--bg)",
                  backgroundColor: "var(--text-primary)",
                  padding: "18px",
                }}
              >
                Check my bill →
              </div>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Shared motion ────────────────────────────────────────────────────────────
const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-80px" },
  transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number] },
};

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section
      className="relative grid"
      style={{
        gridTemplateColumns: "48px 1fr",
        minHeight: "100svh",
        backgroundColor: "var(--bg)",
      }}
    >
      {/* Dark sidebar with rotated text */}
      <aside
        className="hidden md:flex relative"
        style={{ backgroundColor: "var(--bg-dark)" }}
      >
        <div
          className="absolute font-[family-name:var(--font-dm-sans)] uppercase whitespace-nowrap"
          style={{
            fontSize: "10px",
            letterSpacing: "0.3em",
            color: "var(--text-faint)",
            fontWeight: 400,
            bottom: "40px",
            left: "50%",
            transform: "translateX(-50%) rotate(-90deg)",
            transformOrigin: "center",
          }}
        >
          Medical Bill Advocacy — Est. 2024
        </div>
      </aside>

      {/* Right side content: 2-col (text | image) */}
      <div
        className="grid grid-cols-1 lg:grid-cols-[1fr_1fr]"
        style={{ minHeight: "100svh" }}
      >
        {/* Left column: text */}
        <div className="relative flex flex-col justify-center px-6 md:px-12 lg:px-16 py-32 lg:py-0">
          {/* amber eyebrow line */}
          <div className="flex items-center gap-4 mb-10 lg:mb-14">
            <div style={{ width: "40px", height: "1px", backgroundColor: "var(--amber)" }} />
            <span
              className="font-[family-name:var(--font-dm-sans)] uppercase"
              style={{
                fontSize: "10px",
                letterSpacing: "0.3em",
                color: "var(--amber)",
                fontWeight: 400,
              }}
            >
              Medical Billing Advocacy
            </span>
          </div>

          <h1
            className="font-[family-name:var(--font-cormorant)]"
            style={{
              fontSize: "clamp(54px, 8vw, 104px)",
              fontWeight: 300,
              lineHeight: 0.95,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              marginBottom: "40px",
            }}
          >
            Your bill
            <br />
            is probably
            <br />
            <em
              style={{
                fontStyle: "italic",
                color: "var(--amber)",
                fontWeight: 300,
              }}
            >
              wrong.
            </em>
          </h1>

          {/* subtext with amber left border */}
          <div
            className="mb-10 pl-5"
            style={{ borderLeft: "1px solid var(--amber)", maxWidth: "420px" }}
          >
            <p
              className="font-[family-name:var(--font-dm-sans)]"
              style={{
                fontSize: "15px",
                lineHeight: 1.7,
                color: "var(--text-muted)",
                fontWeight: 300,
              }}
            >
              Start free. See every error on your bill. Then decide if you want
              us to fight it.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <Link href="/upload" className="no-underline">
              <span
                className="inline-block font-[family-name:var(--font-dm-sans)] uppercase transition-opacity hover:opacity-90"
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.25em",
                  fontWeight: 500,
                  color: "var(--bg)",
                  backgroundColor: "var(--text-primary)",
                  padding: "18px 32px",
                }}
              >
                Check my bill — free
              </span>
            </Link>
            <Link href="/how-it-works" className="no-underline">
              <span
                className="inline-block font-[family-name:var(--font-dm-sans)] uppercase transition-colors"
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.25em",
                  fontWeight: 400,
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                  padding: "18px 32px",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--text-primary)")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              >
                See how it works
              </span>
            </Link>
          </div>
        </div>

        {/* Right column: image with stats bar */}
        <div className="relative min-h-[420px] lg:min-h-full">
          <Image
            src="/images/hero-main.jpg"
            alt=""
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            style={{ objectFit: "cover", objectPosition: "center" }}
          />

          {/* dark stats bar anchored to bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 grid grid-cols-3"
            style={{ backgroundColor: "var(--bg-dark)" }}
          >
            {[
              { value: "$4.2M", label: "Recovered for clients" },
              { value: "73%", label: "Avg. bill reduction" },
              { value: "34d", label: "Avg. resolution" },
            ].map((s, i) => (
              <div
                key={s.label}
                className="flex flex-col items-start justify-center px-4 py-5 md:px-6 md:py-7"
                style={{
                  borderLeft: i === 0 ? "none" : "1px solid var(--border-dark)",
                }}
              >
                <div
                  className="font-[family-name:var(--font-cormorant)]"
                  style={{
                    fontSize: "clamp(28px, 3vw, 40px)",
                    fontWeight: 300,
                    color: "var(--amber)",
                    lineHeight: 1,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {s.value}
                </div>
                <div
                  className="font-[family-name:var(--font-dm-sans)] uppercase mt-2"
                  style={{
                    fontSize: "9px",
                    letterSpacing: "0.25em",
                    color: "var(--text-faint)",
                    fontWeight: 400,
                  }}
                >
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Stats Strip ──────────────────────────────────────────────────────────────
function StatsStrip() {
  const stats = [
    { value: "80", suffix: "%", label: "of bills contain errors" },
    { value: "$1,300", suffix: "", label: "average overcharge" },
    { value: "1", suffix: "/3", label: "patients balance billed" },
    { value: "<3", suffix: "%", label: "ever dispute them" },
  ];

  return (
    <motion.section
      {...fadeUp}
      className="grid grid-cols-2 md:grid-cols-4"
      style={{
        backgroundColor: "var(--bg)",
        borderTop: "1px solid var(--border)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {stats.map((s, i) => (
        <div
          key={s.label}
          className="flex flex-col items-start justify-center px-6 md:px-10 py-12 md:py-16"
          style={{
            borderLeft: i === 0 ? "none" : "1px solid var(--border)",
            borderTop: i >= 2 ? "1px solid var(--border)" : "none",
          }}
        >
          <div
            className="font-[family-name:var(--font-cormorant)]"
            style={{
              fontSize: "clamp(52px, 6vw, 88px)",
              fontWeight: 300,
              lineHeight: 1,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
            }}
          >
            {s.value}
            {s.suffix && (
              <em
                style={{
                  fontStyle: "italic",
                  color: "var(--amber)",
                  fontWeight: 300,
                }}
              >
                {s.suffix}
              </em>
            )}
          </div>
          <div
            className="font-[family-name:var(--font-dm-sans)] uppercase mt-4"
            style={{
              fontSize: "10px",
              letterSpacing: "0.25em",
              color: "var(--text-muted)",
              fontWeight: 400,
              maxWidth: "180px",
            }}
          >
            {s.label}
          </div>
        </div>
      ))}
    </motion.section>
  );
}

// ─── Problem Section ──────────────────────────────────────────────────────────
function ProblemSection() {
  const items = [
    { num: "80%", stat: "of all medical bills contain at least one error" },
    { num: "1 in 3", stat: "patients are balance billed illegally" },
    { num: "<3%", stat: "of patients ever dispute their bill" },
  ];

  return (
    <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr]">
      {/* Left cream */}
      <motion.div
        {...fadeUp}
        className="px-6 md:px-12 lg:px-16 py-24 lg:py-32"
        style={{ backgroundColor: "var(--bg)" }}
      >
        <div
          className="font-[family-name:var(--font-dm-sans)] uppercase mb-8"
          style={{
            fontSize: "10px",
            letterSpacing: "0.3em",
            color: "var(--text-muted)",
            fontWeight: 400,
          }}
        >
          — The Problem
        </div>
        <h2
          className="font-[family-name:var(--font-cormorant)] mb-10"
          style={{
            fontSize: "clamp(44px, 5.5vw, 72px)",
            fontWeight: 300,
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            maxWidth: "640px",
          }}
        >
          80% of bills
          <br />
          contain{" "}
          <em
            style={{
              fontStyle: "italic",
              color: "var(--amber)",
              fontWeight: 300,
            }}
          >
            errors.
          </em>
        </h2>
        <p
          className="font-[family-name:var(--font-dm-sans)]"
          style={{
            fontSize: "15px",
            lineHeight: 1.75,
            color: "var(--text-muted)",
            fontWeight: 300,
            maxWidth: "480px",
          }}
        >
          Providers upcode procedures. Insurers underpay. Duplicate charges
          slip through. Most patients never know — because the bills are
          designed to be unreadable. We read them for you, line by line,
          against your insurer&apos;s contracted rates.
        </p>
      </motion.div>

      {/* Right mid */}
      <motion.div
        {...fadeUp}
        className="flex flex-col justify-center px-6 md:px-12 lg:px-16 py-16 lg:py-32"
        style={{ backgroundColor: "var(--bg-mid)" }}
      >
        {items.map((item, i) => (
          <div
            key={item.num}
            className="py-8"
            style={{
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
            }}
          >
            <div
              className="font-[family-name:var(--font-cormorant)]"
              style={{
                fontSize: "clamp(64px, 7vw, 96px)",
                fontWeight: 300,
                lineHeight: 1,
                letterSpacing: "-0.02em",
                color: "var(--rose)",
              }}
            >
              {item.num}
            </div>
            <div
              className="font-[family-name:var(--font-dm-sans)] mt-3"
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                fontWeight: 300,
                lineHeight: 1.6,
                maxWidth: "340px",
              }}
            >
              {item.stat}
            </div>
          </div>
        ))}
      </motion.div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Upload your bill",
      body: "Drop your itemized medical bill, EOB, and insurance card. Takes three minutes.",
      time: "3 min",
    },
    {
      num: "02",
      title: "We find every error",
      body: "Our system cross-references every CPT code and charge against your insurer's contracted rates. Every error gets flagged with evidence.",
      time: "24 hours",
    },
    {
      num: "03",
      title: "You choose what happens next",
      body: "See the audit free. Get a prefilled dispute letter. Or let us file and close the dispute entirely.",
      time: "Your call",
    },
  ];

  return (
    <section
      id="how-it-works"
      className="px-6 md:px-12 lg:px-16 py-24 lg:py-32"
      style={{
        backgroundColor: "var(--bg)",
        borderTop: "1px solid var(--border)",
      }}
    >
      {/* Top 2-col split */}
      <motion.div
        {...fadeUp}
        className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-10 lg:gap-20 mb-20 lg:mb-28"
      >
        <div>
          <div
            className="font-[family-name:var(--font-dm-sans)] uppercase mb-8"
            style={{
              fontSize: "10px",
              letterSpacing: "0.3em",
              color: "var(--text-muted)",
              fontWeight: 400,
            }}
          >
            — How it works
          </div>
          <h2
            className="font-[family-name:var(--font-cormorant)]"
            style={{
              fontSize: "clamp(40px, 5vw, 68px)",
              fontWeight: 300,
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
            }}
          >
            Three steps.
            <br />
            One{" "}
            <em
              style={{
                fontStyle: "italic",
                color: "var(--amber)",
                fontWeight: 300,
              }}
            >
              outcome.
            </em>
          </h2>
        </div>
        <div
          className="lg:pl-12 flex items-end"
          style={{ borderLeft: "none" }}
        >
          <div
            className="lg:pl-10"
            style={{ borderLeft: "none" }}
          >
            <div
              className="hidden lg:block"
              style={{
                borderLeft: "1px solid var(--border)",
                paddingLeft: "40px",
              }}
            >
              <p
                className="font-[family-name:var(--font-dm-sans)]"
                style={{
                  fontSize: "15px",
                  lineHeight: 1.8,
                  color: "var(--text-muted)",
                  fontWeight: 300,
                }}
              >
                Most advocacy services are a black box. We show you the
                evidence first — you decide how far to take it. Every error we
                flag comes with a citation, a confidence score, and the
                dollar amount at stake.
              </p>
            </div>
            <div
              className="lg:hidden"
              style={{
                borderTop: "1px solid var(--border)",
                paddingTop: "24px",
              }}
            >
              <p
                className="font-[family-name:var(--font-dm-sans)]"
                style={{
                  fontSize: "15px",
                  lineHeight: 1.8,
                  color: "var(--text-muted)",
                  fontWeight: 300,
                }}
              >
                Most advocacy services are a black box. We show you the
                evidence first — you decide how far to take it. Every error we
                flag comes with a citation, a confidence score, and the
                dollar amount at stake.
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 3-col steps */}
      <div
        className="grid grid-cols-1 md:grid-cols-3"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {steps.map((step, i) => (
          <motion.div
            key={step.num}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{
              duration: 0.7,
              ease: [0.25, 0.1, 0.25, 1],
              delay: i * 0.1,
            }}
            className="relative px-6 md:px-8 py-12"
            style={{
              borderLeft: i === 0 ? "none" : "1px solid var(--border)",
              borderTop: "none",
            }}
          >
            <div
              className="font-[family-name:var(--font-cormorant)] mb-8"
              style={{
                fontSize: "clamp(88px, 10vw, 140px)",
                fontWeight: 300,
                lineHeight: 1,
                color: "#E5DDD5",
                letterSpacing: "-0.02em",
              }}
            >
              {step.num}
            </div>
            <div
              className="font-[family-name:var(--font-dm-sans)] uppercase mb-4"
              style={{
                fontSize: "12px",
                letterSpacing: "0.25em",
                color: "var(--text-primary)",
                fontWeight: 500,
              }}
            >
              {step.title}
            </div>
            <p
              className="font-[family-name:var(--font-dm-sans)] mb-8"
              style={{
                fontSize: "14px",
                lineHeight: 1.75,
                color: "var(--text-muted)",
                fontWeight: 300,
                maxWidth: "320px",
              }}
            >
              {step.body}
            </p>
            <div
              className="inline-block font-[family-name:var(--font-dm-sans)] uppercase"
              style={{
                fontSize: "10px",
                letterSpacing: "0.25em",
                color: "var(--amber)",
                fontWeight: 400,
                fontStyle: "italic",
                borderTop: "1px solid var(--amber)",
                paddingTop: "8px",
              }}
            >
              {step.time}
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ─── Pricing Preview ──────────────────────────────────────────────────────────
function PricingPreview() {
  const tiers = [
    {
      name: "Audit",
      price: "Free",
      priceSuffix: "always",
      tag: "see exactly what they got wrong",
      features: [
        "Upload your bill",
        "AI scans every charge",
        "Error report with confidence scores",
        "No dispute filed",
      ],
      cta: "See what's wrong — free",
      href: "/upload?tier=audit",
      accent: false,
    },
    {
      name: "Dispute",
      price: "$39",
      priceSuffix: "per letter, or $19/mo",
      tag: "your weapon. ready to send",
      features: [
        "Everything in Audit, plus:",
        "Insurer-specific dispute letter",
        "Step-by-step submission guide",
        "Deadline tracker",
        "Email reminders",
      ],
      cta: "Get my dispute letter",
      href: "/upload?tier=dispute",
      accent: false,
    },
    {
      name: "Resolve",
      price: "25%",
      priceSuffix: "of savings recovered",
      tag: "we handle everything. you cash the difference",
      features: [
        "Everything in Dispute, plus:",
        "We file the dispute on your behalf",
        "All insurer communication",
        "Second-level appeal if denied",
        "External review if needed",
        "$0 upfront — pay only if we recover",
      ],
      cta: "Let us handle it",
      href: "/upload?tier=resolve",
      accent: true,
    },
  ];

  return (
    <section
      className="px-6 md:px-12 lg:px-16 py-24 lg:py-32"
      style={{
        backgroundColor: "var(--bg)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <motion.div {...fadeUp} className="mb-16 lg:mb-24 max-w-3xl">
        <div
          className="font-[family-name:var(--font-dm-sans)] uppercase mb-8"
          style={{
            fontSize: "10px",
            letterSpacing: "0.3em",
            color: "var(--text-muted)",
            fontWeight: 400,
          }}
        >
          — Pricing
        </div>
        <h2
          className="font-[family-name:var(--font-cormorant)]"
          style={{
            fontSize: "clamp(40px, 5vw, 68px)",
            fontWeight: 300,
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
          }}
        >
          Start free. Pay{" "}
          <em
            style={{
              fontStyle: "italic",
              color: "var(--amber)",
              fontWeight: 300,
            }}
          >
            only if it works.
          </em>
        </h2>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
        {tiers.map((tier, i) => (
          <motion.div
            key={tier.name}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{
              duration: 0.7,
              ease: [0.25, 0.1, 0.25, 1],
              delay: i * 0.1,
            }}
            className="relative flex flex-col p-8 lg:p-10"
            style={{
              backgroundColor: "var(--bg)",
              border: tier.accent
                ? "1px solid var(--amber)"
                : "1px solid var(--border)",
              marginLeft: i > 0 ? "-1px" : 0,
              marginTop: 0,
            }}
          >
            {tier.accent && (
              <div
                className="absolute font-[family-name:var(--font-dm-sans)] uppercase"
                style={{
                  top: "-10px",
                  left: "32px",
                  fontSize: "9px",
                  letterSpacing: "0.3em",
                  color: "var(--bg)",
                  backgroundColor: "var(--amber)",
                  padding: "4px 10px",
                  fontWeight: 500,
                }}
              >
                Full service
              </div>
            )}

            <div
              className="font-[family-name:var(--font-dm-sans)] uppercase mb-6"
              style={{
                fontSize: "11px",
                letterSpacing: "0.3em",
                color: "var(--text-primary)",
                fontWeight: 500,
              }}
            >
              {tier.name}
            </div>

            <div className="mb-8">
              <div
                className="font-[family-name:var(--font-cormorant)]"
                style={{
                  fontSize: "clamp(56px, 6vw, 80px)",
                  fontWeight: 300,
                  lineHeight: 1,
                  letterSpacing: "-0.02em",
                  fontStyle: "italic",
                  color: tier.accent ? "var(--amber)" : "var(--text-primary)",
                }}
              >
                {tier.price}
              </div>
              <div
                className="font-[family-name:var(--font-dm-sans)] mt-3"
                style={{
                  fontSize: "12px",
                  color: "var(--text-muted)",
                  fontWeight: 300,
                }}
              >
                {tier.priceSuffix}
              </div>
            </div>

            <div
              style={{
                borderTop: "1px solid var(--border)",
                paddingTop: "24px",
                marginBottom: "24px",
              }}
            >
              <p
                className="font-[family-name:var(--font-cormorant)]"
                style={{
                  fontSize: "20px",
                  fontStyle: "italic",
                  fontWeight: 300,
                  color: "var(--text-primary)",
                  lineHeight: 1.4,
                }}
              >
                {tier.tag}.
              </p>
            </div>

            <div className="flex flex-col gap-3 mb-10 flex-1">
              {tier.features.map((f) => (
                <div key={f} className="flex gap-3 items-start">
                  <span
                    className="font-[family-name:var(--font-dm-sans)]"
                    style={{
                      fontSize: "13px",
                      color: "var(--amber)",
                      fontWeight: 400,
                      lineHeight: 1.6,
                    }}
                  >
                    —
                  </span>
                  <span
                    className="font-[family-name:var(--font-dm-sans)]"
                    style={{
                      fontSize: "13px",
                      color: "var(--text-muted)",
                      fontWeight: 300,
                      lineHeight: 1.6,
                    }}
                  >
                    {f}
                  </span>
                </div>
              ))}
            </div>

            <Link href={tier.href} className="no-underline mt-auto">
              <div
                className="w-full text-center font-[family-name:var(--font-dm-sans)] uppercase transition-opacity hover:opacity-90"
                style={{
                  fontSize: "11px",
                  letterSpacing: "0.25em",
                  fontWeight: 500,
                  padding: "16px",
                  color: tier.accent ? "var(--bg)" : "var(--text-primary)",
                  backgroundColor: tier.accent ? "var(--amber)" : "transparent",
                  border: tier.accent
                    ? "1px solid var(--amber)"
                    : "1px solid var(--text-primary)",
                }}
              >
                {tier.cta}
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

// ─── Trust Section ────────────────────────────────────────────────────────────
function TrustSection() {
  const points = [
    "Disputes filed under your signed patient authorization",
    "Federally protected under the No Surprises Act",
    "HIPAA-compliant document handling, AES-256 encryption at rest",
  ];

  return (
    <section
      className="px-6 md:px-12 lg:px-16 py-24 lg:py-32"
      style={{ backgroundColor: "var(--bg-dark)" }}
    >
      <motion.div
        {...fadeUp}
        className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 lg:gap-24"
      >
        <div>
          <div
            className="font-[family-name:var(--font-dm-sans)] uppercase mb-8"
            style={{
              fontSize: "10px",
              letterSpacing: "0.3em",
              color: "var(--text-faint)",
              fontWeight: 400,
            }}
          >
            — Trust
          </div>
          <h2
            className="font-[family-name:var(--font-cormorant)] mb-10"
            style={{
              fontSize: "clamp(44px, 5vw, 68px)",
              fontWeight: 300,
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              color: "var(--bg)",
            }}
          >
            Is this{" "}
            <em
              style={{
                fontStyle: "italic",
                color: "var(--amber)",
                fontWeight: 300,
              }}
            >
              legit?
            </em>
          </h2>
          <p
            className="font-[family-name:var(--font-dm-sans)] mb-6"
            style={{
              fontSize: "15px",
              lineHeight: 1.8,
              color: "var(--text-faint)",
              fontWeight: 300,
              maxWidth: "560px",
            }}
          >
            ClearClaim is an administrative advocacy service — not a law firm.
            Medical billing advocates are a recognized professional category
            authorized to review bills, identify errors, and file disputes on
            patients&apos; behalf with signed authorization.
          </p>
          <p
            className="font-[family-name:var(--font-dm-sans)]"
            style={{
              fontSize: "13px",
              lineHeight: 1.75,
              color: "var(--text-faint)",
              fontWeight: 300,
              maxWidth: "560px",
              opacity: 0.7,
            }}
          >
            Disputing a medical bill is your federally protected right under
            the No Surprises Act and applicable state patient protection laws.
            If your case requires legal action, we refer to appropriate counsel.
          </p>
        </div>

        <div className="flex flex-col justify-center gap-8">
          {points.map((point) => (
            <div key={point} className="flex gap-5 items-start">
              <span
                className="font-[family-name:var(--font-dm-sans)]"
                style={{
                  color: "var(--amber)",
                  fontSize: "15px",
                  fontWeight: 400,
                  lineHeight: 1.6,
                  flexShrink: 0,
                }}
              >
                —
              </span>
              <span
                className="font-[family-name:var(--font-dm-sans)]"
                style={{
                  fontSize: "14px",
                  color: "var(--bg)",
                  fontWeight: 300,
                  lineHeight: 1.7,
                }}
              >
                {point}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </section>
  );
}

// ─── FAQ Item ─────────────────────────────────────────────────────────────────
function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ borderTop: "1px solid var(--border-dark)" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-6 text-left"
        style={{
          padding: "28px 0",
          background: "none",
          border: "none",
          cursor: "pointer",
        }}
      >
        <span
          className="font-[family-name:var(--font-cormorant)]"
          style={{
            fontSize: "clamp(20px, 2.2vw, 26px)",
            color: "var(--bg)",
            fontWeight: 300,
            letterSpacing: "-0.01em",
            lineHeight: 1.3,
          }}
        >
          {q}
        </span>
        <span
          className="flex-shrink-0 transition-transform"
          style={{
            color: "var(--amber)",
            transform: open ? "rotate(45deg)" : "rotate(0deg)",
          }}
        >
          <Plus size={20} strokeWidth={1} />
        </span>
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
              className="font-[family-name:var(--font-dm-sans)]"
              style={{
                fontSize: "14px",
                color: "var(--text-faint)",
                fontWeight: 300,
                lineHeight: 1.8,
                paddingBottom: "28px",
                maxWidth: "680px",
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

// ─── FAQ Section ──────────────────────────────────────────────────────────────
function FaqSection() {
  return (
    <section
      id="faq"
      className="px-6 md:px-12 lg:px-16 py-24 lg:py-32"
      style={{ backgroundColor: "var(--bg-dark)" }}
    >
      <motion.div
        {...fadeUp}
        className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-12 lg:gap-20"
      >
        <div>
          <div
            className="font-[family-name:var(--font-dm-sans)] uppercase mb-8"
            style={{
              fontSize: "10px",
              letterSpacing: "0.3em",
              color: "var(--text-faint)",
              fontWeight: 400,
            }}
          >
            — Questions
          </div>
          <h2
            className="font-[family-name:var(--font-cormorant)]"
            style={{
              fontSize: "clamp(40px, 5vw, 64px)",
              fontWeight: 300,
              lineHeight: 1.02,
              letterSpacing: "-0.02em",
              color: "var(--bg)",
            }}
          >
            Everything
            <br />
            you need
            <br />
            to{" "}
            <em
              style={{
                fontStyle: "italic",
                color: "var(--amber)",
                fontWeight: 300,
              }}
            >
              know.
            </em>
          </h2>
        </div>
        <div>
          {FAQS.map((faq) => (
            <FaqItem key={faq.q} q={faq.q} a={faq.a} />
          ))}
          <div style={{ borderTop: "1px solid var(--border-dark)" }} />
        </div>
      </motion.div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  const links = [
    { lbl: "How it works", href: "/how-it-works" },
    { lbl: "Pricing", href: "/pricing" },
    { lbl: "Dashboard", href: "/dashboard" },
    { lbl: "FAQ", href: "#faq" },
  ];

  return (
    <footer
      className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr] gap-12 px-6 md:px-12 lg:px-16 py-16 lg:py-20"
      style={{
        backgroundColor: "var(--bg-dark)",
        borderTop: "1px solid var(--border-dark)",
      }}
    >
      <div>
        <div
          className="font-[family-name:var(--font-dm-sans)] uppercase mb-3"
          style={{
            fontSize: "12px",
            letterSpacing: "0.25em",
            color: "var(--bg)",
            fontWeight: 500,
          }}
        >
          ClearClaim
        </div>
        <div
          className="font-[family-name:var(--font-cormorant)]"
          style={{
            fontSize: "18px",
            fontStyle: "italic",
            color: "var(--amber)",
            fontWeight: 300,
            marginBottom: "16px",
          }}
        >
          Medical bill advocacy.
        </div>
        <div
          className="font-[family-name:var(--font-dm-sans)]"
          style={{
            fontSize: "11px",
            color: "var(--text-faint)",
            fontWeight: 300,
            lineHeight: 1.7,
            maxWidth: "280px",
            opacity: 0.7,
          }}
        >
          ClearClaim is an administrative advocacy service. We are not a law
          firm and do not provide legal advice.
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="no-underline transition-colors font-[family-name:var(--font-dm-sans)]"
            style={{
              fontSize: "11px",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "var(--text-faint)",
              fontWeight: 400,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--bg)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-faint)")}
          >
            {link.lbl}
          </Link>
        ))}
      </div>

      <div className="flex flex-col gap-1 md:items-end">
        <div
          className="font-[family-name:var(--font-dm-sans)]"
          style={{
            fontSize: "11px",
            color: "var(--text-faint)",
            fontWeight: 300,
            opacity: 0.7,
          }}
        >
          © 2026 ClearClaim
        </div>
        <div
          className="font-[family-name:var(--font-dm-sans)]"
          style={{
            fontSize: "11px",
            color: "var(--text-faint)",
            fontWeight: 300,
            opacity: 0.7,
          }}
        >
          All rights reserved.
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div style={{ backgroundColor: "var(--bg)", minHeight: "100vh" }}>
      <Nav />
      <Hero />
      <StatsStrip />
      <ProblemSection />
      <HowItWorks />
      <PricingPreview />
      <TrustSection />
      <FaqSection />
      <Footer />
    </div>
  );
}
