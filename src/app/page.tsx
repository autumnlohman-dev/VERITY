"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Plus, Lock, Shield, DollarSign, Scale } from "lucide-react";

// ─── FAQs ─────────────────────────────────────────────────────────────────────
const FAQS = [
  {
    q: "Can you help if I already paid the bill?",
    a: "Often, yes. Providers and insurers are required to correct billing errors even after payment, and most states give you at least a year to request a refund on an overbilled claim (federal timely filing windows vary by payer). Upload the bill and your payment record — we'll tell you whether the timing still works for a refund request.",
  },
  {
    q: "Can you review out of network emergency bills?",
    a: "Yes — these are often the strongest cases. Emergency services are protected by the No Surprises Act, which requires in-network cost sharing regardless of provider network status. If you were balance-billed above in-network rates for an ER visit, the audit will flag it and the dispute letter will cite the applicable federal protection.",
  },
  {
    q: "Do you need my insurance portal login?",
    a: "No. We never ask for portal or account credentials. Everything we need comes from documents you already have: the itemized bill, your Explanation of Benefits PDF from your insurer, and your insurance card. Uploads are encrypted in transit and at rest.",
  },
  {
    q: "What happens if you find nothing wrong?",
    a: "On the free Audit, you pay nothing either way. We'll tell you the bill checks out and explain what we reviewed (fee-schedule comparisons, NCCI edits, MUE limits, No Surprises Act coverage). On Resolve, our fee is contingent on recovery — if we don't recover savings, you don't owe anything.",
  },
  {
    q: "What states do you support?",
    a: "All 50 states for the audit and the self-serve dispute letter — federal protections like the No Surprises Act apply nationwide. On Resolve (full-service filing), state-specific dispute timelines and external review processes vary; we'll flag any state-specific step during your case and handle the filing under the correct framework.",
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
              Upload my bill free →
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
                Upload my bill free →
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
                Upload my bill free →
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
      className="relative"
      style={{
        backgroundColor: "var(--bg)",
      }}
    >
      {/* 2-col (text | image) */}
      <div
        className="grid grid-cols-1 lg:grid-cols-[1fr_1fr]"
        style={{ minHeight: "82vh" }}
      >
        {/* Left column: text */}
        <div className="relative flex flex-col justify-center px-6 md:px-12 lg:px-16 py-16 lg:py-0">
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
            className="mb-5 pl-5"
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
              Upload your itemized bill. We audit every charge, flag likely
              billing errors, and show you exactly what you may be owed — before
              you pay us anything.
            </p>
          </div>

          <p
            className="font-[family-name:var(--font-dm-sans)] mb-6"
            style={{
              fontSize: "12px",
              lineHeight: 1.5,
              color: "var(--text-faint)",
              fontWeight: 400,
              letterSpacing: "0.02em",
            }}
          >
            Results in 24 hours. Takes 3 minutes to upload.
          </p>

          <div>
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
                Upload my bill free
              </span>
            </Link>
          </div>
        </div>

        {/* Right column: image */}
        <div className="relative min-h-[420px] lg:min-h-full">
          <Image
            src="https://images.unsplash.com/photo-1758523418820-a492bf647c63?w=1200&q=80"
            alt="Couple reviewing bills and paperwork at a kitchen table, looking concerned"
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            style={{ objectFit: "cover", objectPosition: "center" }}
          />
        </div>
      </div>
    </section>
  );
}

// ─── Trust Bar ────────────────────────────────────────────────────────────────
function TrustBar() {
  const items: Array<{ icon: React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>; text: string }> = [
    { icon: Lock, text: "Bank-level encryption" },
    { icon: Shield, text: "Your documents stay private" },
    { icon: DollarSign, text: "Free to audit" },
    { icon: Scale, text: "Advocacy service, not a law firm" },
  ];

  return (
    <motion.section
      {...fadeUp}
      className="grid grid-cols-1 md:grid-cols-4"
      style={{
        backgroundColor: "var(--bg-dark)",
        borderTop: "1px solid var(--border-dark)",
      }}
    >
      {items.map(({ icon: Icon, text }, i) => (
        <div
          key={i}
          className={[
            "flex gap-3 items-center justify-center px-8 md:px-12 py-7 md:py-8",
            i > 0 ? "border-t md:border-t-0 md:border-l" : "",
          ].filter(Boolean).join(" ")}
          style={{ borderColor: "var(--border-dark)" }}
        >
          <Icon size={16} strokeWidth={1.6} color="#F5F0E8" />
          <span
            className="font-[family-name:var(--font-dm-sans)]"
            style={{
              fontSize: "13px",
              color: "#F5F0E8",
              fontWeight: 400,
              lineHeight: 1.4,
              letterSpacing: "0.01em",
              whiteSpace: "nowrap",
            }}
          >
            {text}
          </span>
        </div>
      ))}
    </motion.section>
  );
}

// ─── Mock Audit Card ──────────────────────────────────────────────────────────
function MockAuditCard() {
  const findings = [
    {
      title: "Duplicate charge detected — CPT 99213 billed twice",
      confidence: "HIGH",
      savings: "$180",
    },
    {
      title: "CPT code likely upcoded — 99285 vs expected 99283",
      confidence: "MEDIUM",
      savings: "$340",
    },
    {
      title: "Balance bill may violate No Surprises Act",
      confidence: "HIGH",
      savings: "$1,200",
    },
  ];

  const confidenceStyle = (c: string) => {
    if (c === "HIGH") {
      return {
        color: "#C47C6A",
        border: "1px solid rgba(196,124,106,0.4)",
        backgroundColor: "rgba(196,124,106,0.08)",
      };
    }
    return {
      color: "var(--amber)",
      border: "1px solid rgba(200,169,126,0.4)",
      backgroundColor: "rgba(200,169,126,0.08)",
    };
  };

  return (
    <section
      className="px-6 md:px-12 lg:px-16 py-20 lg:py-28"
      style={{
        backgroundColor: "var(--bg)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <motion.div {...fadeUp} className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-10 lg:gap-20 items-start">
        <div>
          <div
            className="font-[family-name:var(--font-dm-sans)] uppercase mb-6"
            style={{
              fontSize: "10px",
              letterSpacing: "0.3em",
              color: "var(--text-muted)",
              fontWeight: 400,
            }}
          >
            — Sample audit
          </div>
          <h2
            className="font-[family-name:var(--font-cormorant)]"
            style={{
              fontSize: "clamp(36px, 4.5vw, 56px)",
              fontWeight: 300,
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              color: "var(--text-primary)",
              maxWidth: "420px",
            }}
          >
            Here&apos;s what{" "}
            <em
              style={{
                fontStyle: "italic",
                color: "var(--amber)",
                fontWeight: 300,
              }}
            >
              your audit
            </em>{" "}
            looks like.
          </h2>
          <p
            className="font-[family-name:var(--font-dm-sans)] mt-6"
            style={{
              fontSize: "13px",
              lineHeight: 1.7,
              color: "var(--text-muted)",
              fontWeight: 300,
              maxWidth: "360px",
            }}
          >
            Every finding comes with a confidence score, regulatory citation,
            and dollar impact — so you know exactly what you&apos;re disputing
            and why.
          </p>
        </div>

        <div
          style={{
            backgroundColor: "var(--bg-dark)",
            border: "1px solid var(--border-dark)",
          }}
        >
          <div
            className="flex items-center justify-between px-6 md:px-8 py-5"
            style={{ borderBottom: "1px solid var(--border-dark)" }}
          >
            <div
              className="font-[family-name:var(--font-dm-sans)] uppercase"
              style={{
                fontSize: "10px",
                letterSpacing: "0.25em",
                color: "var(--text-faint)",
                fontWeight: 400,
              }}
            >
              Audit findings
            </div>
            <div
              className="font-[family-name:var(--font-dm-sans)] uppercase"
              style={{
                fontSize: "9px",
                letterSpacing: "0.2em",
                color: "var(--amber)",
                fontWeight: 400,
                fontStyle: "italic",
              }}
            >
              Illustrative example
            </div>
          </div>

          {findings.map((f, i) => (
            <div
              key={i}
              className="px-6 md:px-8 py-6"
              style={{
                borderTop: i === 0 ? "none" : "1px solid var(--border-dark)",
              }}
            >
              <div className="flex items-start justify-between gap-4 md:gap-6 flex-wrap">
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div
                    className="font-[family-name:var(--font-cormorant)]"
                    style={{
                      fontSize: "18px",
                      fontWeight: 300,
                      lineHeight: 1.3,
                      color: "var(--bg)",
                    }}
                  >
                    {f.title}
                  </div>
                  <div className="mt-3">
                    <span
                      className="font-[family-name:var(--font-dm-sans)] uppercase"
                      style={{
                        fontSize: "9px",
                        letterSpacing: "0.2em",
                        fontWeight: 400,
                        padding: "2px 8px",
                        ...confidenceStyle(f.confidence),
                      }}
                    >
                      {f.confidence} confidence
                    </span>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div
                    className="font-[family-name:var(--font-cormorant)]"
                    style={{
                      fontSize: "28px",
                      fontWeight: 300,
                      fontStyle: "italic",
                      color: "#7A9E87",
                      lineHeight: 1,
                    }}
                  >
                    {f.savings}
                  </div>
                  <div
                    className="font-[family-name:var(--font-dm-sans)] uppercase mt-2"
                    style={{
                      fontSize: "9px",
                      letterSpacing: "0.2em",
                      color: "var(--text-faint)",
                      fontWeight: 400,
                    }}
                  >
                    Potential savings
                  </div>
                </div>
              </div>
            </div>
          ))}

          <div
            className="px-6 md:px-8 py-4"
            style={{
              borderTop: "1px solid var(--border-dark)",
              backgroundColor: "rgba(0,0,0,0.15)",
            }}
          >
            <div
              className="font-[family-name:var(--font-dm-sans)]"
              style={{
                fontSize: "11px",
                color: "var(--text-faint)",
                fontWeight: 300,
                lineHeight: 1.6,
                fontStyle: "italic",
                opacity: 0.85,
              }}
            >
              Illustrative examples based on common billing dispute outcomes.
              Your audit will reflect your specific bill.
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────
function HowItWorks() {
  const steps = [
    {
      num: "01",
      title: "Upload",
      body: "Upload your itemized bill or EOB. Takes about three minutes — photo or PDF both work.",
    },
    {
      num: "02",
      title: "We audit",
      body: "Every charge checked against CMS rates and federal billing rules. Confidence scores on every finding. Results within 24 hours.",
    },
    {
      num: "03",
      title: "You decide",
      body: "Get a prefilled dispute letter ready to send, or let us manage the full process — filing, follow-up, and appeals.",
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
      <motion.div {...fadeUp} className="max-w-2xl mb-16 lg:mb-24">
        <div
          className="font-[family-name:var(--font-dm-sans)] uppercase mb-6"
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
      </motion.div>

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
            className={`relative px-6 md:px-10 py-12 md:py-16 ${
              i > 0 ? "border-t md:border-t-0 md:border-l" : ""
            }`}
            style={{ borderColor: "var(--border)" }}
          >
            <div
              className="font-[family-name:var(--font-cormorant)] mb-8"
              style={{
                fontSize: "clamp(72px, 8vw, 112px)",
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
              className="font-[family-name:var(--font-dm-sans)]"
              style={{
                fontSize: "15px",
                lineHeight: 1.75,
                color: "var(--text-muted)",
                fontWeight: 300,
                maxWidth: "300px",
              }}
            >
              {step.body}
            </p>
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
      tag: "Complete review of your bill with flagged errors, regulatory citations, and estimated dollar impact",
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
      tag: "Prefilled dispute letter tailored to your bill, ready to send by certified mail",
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
      tag: "We manage the full dispute for you — filing, follow-up, and appeals. You pay only if we recover savings",
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

// ─── Testimonials ─────────────────────────────────────────────────────────────
function Testimonials() {
  const items = [
    "ER bill reduced by over 70% after dispute. Found two procedures billed that were never performed. Resolved in under 30 days.",
    "Insurance denied my claim. ClearClaim found a No Surprises Act violation. Recovered thousands in under a month.",
  ];

  return (
    <section
      className="px-6 md:px-12 lg:px-16 py-24 lg:py-32"
      style={{
        backgroundColor: "var(--bg)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <motion.div {...fadeUp} className="mb-12 lg:mb-16 max-w-2xl">
        <div
          className="font-[family-name:var(--font-dm-sans)] uppercase mb-6"
          style={{
            fontSize: "10px",
            letterSpacing: "0.3em",
            color: "var(--text-muted)",
            fontWeight: 400,
          }}
        >
          — Sample outcomes
        </div>
        <h2
          className="font-[family-name:var(--font-cormorant)]"
          style={{
            fontSize: "clamp(36px, 4.5vw, 56px)",
            fontWeight: 300,
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
          }}
        >
          What a typical{" "}
          <em
            style={{
              fontStyle: "italic",
              color: "var(--amber)",
              fontWeight: 300,
            }}
          >
            dispute looks like.
          </em>
        </h2>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
        {items.map((text, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{
              duration: 0.7,
              ease: [0.25, 0.1, 0.25, 1],
              delay: i * 0.1,
            }}
            className="p-8 lg:p-10 flex flex-col"
            style={{
              border: "1px solid var(--border)",
              marginLeft: i > 0 ? "-1px" : 0,
              marginTop: 0,
              backgroundColor: "var(--bg)",
            }}
          >
            <div
              className="font-[family-name:var(--font-cormorant)] mb-6"
              style={{
                fontSize: "36px",
                color: "var(--amber)",
                fontWeight: 300,
                lineHeight: 1,
                fontStyle: "italic",
              }}
            >
              &ldquo;
            </div>
            <p
              className="font-[family-name:var(--font-cormorant)] flex-1"
              style={{
                fontSize: "clamp(18px, 1.8vw, 22px)",
                fontWeight: 300,
                color: "var(--text-primary)",
                lineHeight: 1.5,
                letterSpacing: "-0.005em",
              }}
            >
              {text}
            </p>
            <div
              className="font-[family-name:var(--font-dm-sans)] uppercase mt-8"
              style={{
                fontSize: "10px",
                letterSpacing: "0.2em",
                color: "var(--text-muted)",
                fontWeight: 400,
                fontStyle: "italic",
                borderTop: "1px solid var(--border)",
                paddingTop: "12px",
              }}
            >
              Illustrative example
            </div>
          </motion.div>
        ))}
      </div>

      <div
        className="mt-8 max-w-3xl font-[family-name:var(--font-dm-sans)]"
        style={{
          fontSize: "11px",
          color: "var(--text-muted)",
          fontWeight: 300,
          lineHeight: 1.7,
          fontStyle: "italic",
          opacity: 0.85,
        }}
      >
        Illustrative examples based on common billing dispute outcomes. Individual
        results vary depending on bill specifics, payer, and applicable state and
        federal protections.
      </div>
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
  const productLinks = [
    { lbl: "How it works", href: "/how-it-works" },
    { lbl: "Pricing", href: "/pricing" },
    { lbl: "Dashboard", href: "/dashboard" },
    { lbl: "FAQ", href: "#faq" },
  ];
  const legalLinks = [
    { lbl: "Privacy policy", href: "/privacy" },
    { lbl: "Terms of service", href: "/terms" },
  ];

  return (
    <footer
      className="grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr_1fr] gap-12 px-6 md:px-12 lg:px-16 py-16 lg:py-20"
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
            maxWidth: "300px",
            opacity: 0.8,
          }}
        >
          ClearClaim is an administrative advocacy service. We are not a law
          firm and do not provide legal advice.
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <div
          className="font-[family-name:var(--font-dm-sans)] uppercase mb-1"
          style={{
            fontSize: "10px",
            letterSpacing: "0.25em",
            color: "var(--bg)",
            fontWeight: 500,
            opacity: 0.85,
          }}
        >
          Product
        </div>
        {productLinks.map((link) => (
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

      <div className="flex flex-col gap-3">
        <div
          className="font-[family-name:var(--font-dm-sans)] uppercase mb-1"
          style={{
            fontSize: "10px",
            letterSpacing: "0.25em",
            color: "var(--bg)",
            fontWeight: 500,
            opacity: 0.85,
          }}
        >
          Support
        </div>
        <a
          href="mailto:support@clearclaim.co"
          className="no-underline transition-colors font-[family-name:var(--font-dm-sans)]"
          style={{
            fontSize: "13px",
            color: "var(--amber)",
            fontWeight: 300,
          }}
        >
          support@clearclaim.co
        </a>
        <div
          className="font-[family-name:var(--font-dm-sans)]"
          style={{
            fontSize: "11px",
            color: "var(--text-faint)",
            fontWeight: 300,
            lineHeight: 1.6,
            fontStyle: "italic",
            opacity: 0.85,
          }}
        >
          Support responses within 1 business day.
        </div>
      </div>

      <div className="flex flex-col gap-3 md:items-end">
        <div
          className="font-[family-name:var(--font-dm-sans)] uppercase mb-1"
          style={{
            fontSize: "10px",
            letterSpacing: "0.25em",
            color: "var(--bg)",
            fontWeight: 500,
            opacity: 0.85,
          }}
        >
          Legal
        </div>
        {legalLinks.map((link) => (
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
        <div
          className="font-[family-name:var(--font-dm-sans)] md:text-right mt-4"
          style={{
            fontSize: "11px",
            color: "var(--text-faint)",
            fontWeight: 300,
            opacity: 0.7,
          }}
        >
          © 2026 ClearClaim
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
      <TrustBar />
      <MockAuditCard />
      <HowItWorks />
      <PricingPreview />
      <Testimonials />
      <FaqSection />
      <Footer />
    </div>
  );
}
