"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

const CONTACT_HREF = "mailto:support@clearclaim.co?subject=Verity%20for%20Health%20Plans%20%26%20Employers";

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
        <div style={{ ...sans("10.5px", "#8A7F6E"), lineHeight: 1.6, maxWidth: "240px" }}>The Verity™ audit method, scoring models, and datasets are proprietary and confidential. Patent Pending — 41 claims, 13 independent claim categories.</div>
      </div>
    </footer>
  );
}

// ─── Outcome blocks ───────────────────────────────────────────────────────────
const OUTCOMES = [
  {
    title: "Audit",
    body: "Cross-checks itemized bills against EOBs and CMS reference data to surface discrepancies with dollar impact.",
  },
  {
    title: "Resolve",
    body: "Generates documented dispute packages, and every action is reviewed by a human before anything is sent.",
  },
  {
    title: "Protect forward",
    body: "Household-level cost simulation and exposure forecasting, so members see costs coming.",
  },
];

// ─── CTA button ───────────────────────────────────────────────────────────────
function TalkButton({ padding = "16px 32px" }: { padding?: string }) {
  return (
    <a href={CONTACT_HREF} style={{ textDecoration: "none" }}>
      <span
        style={{
          ...sans("11px", "#221C14"),
          backgroundColor: "#C8A97E",
          padding,
          letterSpacing: "0.2em",
          textTransform: "uppercase",
          fontWeight: 500,
          display: "inline-block",
        }}
      >
        Let&apos;s talk →
      </span>
    </a>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ForPlansClient() {
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
          <div style={{ ...label(), marginBottom: "32px" }}>For Health Plans &amp; Employers</div>
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
            Member advocacy
            <br />
            <em style={{ fontStyle: "italic" }}>that pays for itself.</em>
          </h1>
          <p style={{ ...sans("15px", "#5F5648"), marginTop: "32px", maxWidth: "520px", lineHeight: 1.75 }}>
            Verity finds billing errors, resolves disputes, and protects members from improper charges,
            reducing plan spend and member complaints at the same time.
          </p>
          <div style={{ marginTop: "40px" }}>
            <TalkButton />
          </div>
        </motion.div>
      </section>

      {/* ── The problem ── */}
      <section style={{ backgroundColor: "#F4EFE6", paddingTop: "96px", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <motion.div {...fadeUp}>
          <div style={{ ...label(), marginBottom: "24px" }}>The problem</div>
          <h2 style={{ ...serif("48px", { lineHeight: 1, marginBottom: "48px" }) }}>
            Billing errors become
            <br />
            plan spend.
          </h2>
          <div style={{ maxWidth: "620px", display: "flex", flexDirection: "column", gap: "24px" }}>
            <p style={{ ...sans("15px", "#5F5648"), lineHeight: 1.75 }}>
              Billing errors rarely stop at the member&apos;s statement. When charges are wrong, duplicated,
              or misapplied, the plan absorbs cost for care that was never delivered as billed, and that
              overspend repeats quietly across every claim cycle.
            </p>
            <p style={{ ...sans("15px", "#5F5648"), lineHeight: 1.75 }}>
              Members feel it too. Balance bills, surprise charges, and unresolved disputes turn into
              complaint calls and escalations, and eventually into frustration with the plan itself.
              Advocacy that catches errors early protects the member relationship before it becomes a
              service problem.
            </p>
          </div>
        </motion.div>
      </section>

      {/* ── Outcomes ── */}
      <section style={{ paddingTop: "96px", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <motion.div {...fadeUp}>
          <div style={{ ...label(), marginBottom: "24px" }}>What Verity does</div>
          <h2 style={{ ...serif("48px", { lineHeight: 1, marginBottom: "64px" }) }}>
            Three outcomes,
            <br />
            one service.
          </h2>
        </motion.div>
        <div
          className="r-grid-1"
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "48px" }}
        >
          {OUTCOMES.map((o, i) => (
            <motion.div
              key={o.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: i * 0.08 }}
              style={{ borderTop: "1px solid #D8CFBE", paddingTop: "32px" }}
            >
              <div style={{ ...serif("28px", { lineHeight: 1.1, marginBottom: "16px" }) }}>{o.title}</div>
              <p style={{ ...sans("14px", "#5F5648"), lineHeight: 1.75 }}>{o.body}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── Bridge ── */}
      <section style={{ backgroundColor: "#F4EFE6", paddingTop: "96px", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <motion.div {...fadeUp} style={{ maxWidth: "760px", margin: "0 auto", textAlign: "center" }}>
          <div style={{ width: "48px", height: "1px", backgroundColor: "#C8A97E", margin: "0 auto 40px" }} />
          <blockquote
            style={{
              fontFamily: "var(--font-cormorant), Georgia, serif",
              fontSize: "clamp(28px, 3.5vw, 40px)",
              color: "#221C14",
              lineHeight: 1.25,
              fontWeight: 400,
              fontStyle: "italic",
              margin: 0,
            }}
          >
            We built Verity by advocating for patients first. That&apos;s why we understand members,
            and their bills, better than anyone.
          </blockquote>
          <div style={{ width: "48px", height: "1px", backgroundColor: "#C8A97E", margin: "40px auto 0" }} />
        </motion.div>
      </section>

      {/* ── Engagement model ── */}
      <section style={{ paddingTop: "96px", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <motion.div {...fadeUp}>
          <div style={{ ...label(), marginBottom: "24px" }}>Engagement model</div>
          <p style={{ ...sans("15px", "#5F5648"), maxWidth: "620px", lineHeight: 1.75 }}>
            We partner with health plans, TPAs, and self-funded employers; engagement models include
            per-member-per-month and shared-savings arrangements.
          </p>
        </motion.div>
      </section>

      {/* ── Closing CTA ── */}
      <section style={{ backgroundColor: "#F4EFE6", paddingTop: "96px", paddingBottom: "96px", paddingLeft: "64px", paddingRight: "64px" }}>
        <motion.div {...fadeUp} style={{ textAlign: "center" }}>
          <h2 style={{ ...serif("48px", { lineHeight: 1.1, marginBottom: "40px" }) }}>
            Exploring member advocacy
            <br />
            for your population?
          </h2>
          <TalkButton />
        </motion.div>
      </section>

      <Footer />
    </div>
  );
}
