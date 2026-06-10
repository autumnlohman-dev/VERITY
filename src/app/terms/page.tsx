"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";

// ─── Style helpers (shared with landing page) ────────────────────────────────
const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-cormorant), Georgia, serif",
  fontSize: size,
  color: "#221C14",
  lineHeight: 1.1,
  fontWeight: 400,
  ...extra,
});

const sans = (size: string, color = "#5F5648", extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
  fontSize: size,
  color,
  ...extra,
});

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
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        backgroundColor: scrolled ? "rgba(235,229,217,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        transition: "background-color 0.4s, backdrop-filter 0.4s",
        padding: "20px 64px", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}
    >
      <Link href="/" style={{ textDecoration: "none" }}>
        <span style={{ ...sans("15px", "#221C14"), letterSpacing: "0.42em", textTransform: "uppercase", fontWeight: 300, paddingLeft: "0.42em" }}>Verity</span>
      </Link>
      <Link href="/upload" style={{ textDecoration: "none" }}>
        <span style={{ ...sans("11px", "#221C14"), backgroundColor: "#C8A97E", padding: "12px 24px", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 500, display: "inline-block" }}>Check my bill →</span>
      </Link>
    </nav>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: "44px" }}>
      <h2 style={{ ...serif("26px", { marginBottom: "16px" }) }}>{heading}</h2>
      <div style={{ ...sans("14px", "#5F5648"), lineHeight: 1.75, display: "flex", flexDirection: "column", gap: "14px" }}>
        {children}
      </div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <main className="page-root" style={{ backgroundColor: "#EBE5D9", minHeight: "100vh" }}>
      <Nav />
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "160px 32px 96px" }}>
        <div style={{ ...sans("11px", "#C8A97E"), letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: "20px" }}>Terms</div>
        <h1 style={{ ...serif("52px", { lineHeight: 1.05, marginBottom: "20px" }) }}>Terms of Service</h1>
        <p style={{ ...sans("13px", "#8A7F6E"), marginBottom: "48px" }}>Last updated: June 10, 2026</p>

        <Section heading="Agreement to these terms">
          <p>These Terms of Service govern your use of Verity. By creating an account, running an audit, or otherwise using the service, you agree to these terms. If you do not agree, please do not use Verity.</p>
        </Section>

        <Section heading="What Verity is — and is not">
          <p>Verity is an administrative medical-bill advocacy tool. We review your medical bills and EOBs, identify likely billing and coding errors, and can help you generate dispute letters.</p>
          <p><strong>Verity is not a law firm and does not provide legal advice. It is not an insurer and does not provide insurance. It does not provide medical, tax, or financial advice.</strong> Our audit results and letters are informational tools to help you advocate for yourself. For legal, medical, or financial decisions, consult a qualified professional.</p>
        </Section>

        <Section heading="Eligibility">
          <p>You must be at least 18 years old and located in the United States to use Verity. You may only upload bills that belong to you or that you are authorized to act on behalf of.</p>
        </Section>

        <Section heading="Your account">
          <p>You are responsible for keeping your login credentials secure and for activity under your account. Let us know promptly if you believe your account has been accessed without your permission.</p>
        </Section>

        <Section heading="Acceptable use">
          <p>You agree not to misuse the service: no uploading documents you have no right to, no attempts to break, overload, reverse-engineer, or scrape the service, and no use of Verity for any unlawful purpose.</p>
        </Section>

        <Section heading="Audit results — no guarantee">
          <p>Verity uses AI and published billing rules to find likely errors. We work hard to be accurate, but we do not guarantee that every error will be found, that flagged items are definitively wrong, or that you will recover any particular amount — or any amount at all. Billing and coverage determinations ultimately rest with your provider and insurer. You are responsible for reviewing results before acting on them.</p>
        </Section>

        <Section heading="Payments and subscriptions">
          <p>The free audit is available without payment. Paid options include a one-time fee for an individual dispute and a monthly membership. Prices are shown at checkout and billed through Stripe. Subscriptions renew automatically until you cancel; you can cancel at any time and your membership remains active through the end of the current billing period. Except where required by law, fees already paid are non-refundable.</p>
        </Section>

        <Section heading="Intellectual property">
          <p>The Verity audit method, scoring models, datasets, software, and brand are proprietary and confidential, and remain our property. You keep ownership of the documents you upload and the content you create. By using the service, you grant us permission to process your documents solely to provide Verity to you.</p>
        </Section>

        <Section heading="Disclaimers">
          <p>The service is provided "as is" and "as available," without warranties of any kind, whether express or implied, including fitness for a particular purpose and non-infringement, to the fullest extent permitted by law.</p>
        </Section>

        <Section heading="Limitation of liability">
          <p>To the fullest extent permitted by law, Verity and its operators will not be liable for any indirect, incidental, or consequential damages, or for any lost savings or recovery, arising from your use of the service. Our total liability for any claim relating to the service will not exceed the amount you paid us in the twelve months before the claim.</p>
        </Section>

        <Section heading="Termination">
          <p>You may stop using Verity and close your account at any time. We may suspend or end access if you violate these terms or to protect the service and its users.</p>
        </Section>

        <Section heading="Governing law">
          <p>These terms are governed by the laws of the United States and the state in which Verity is organized, without regard to conflict-of-law rules. <strong>[Specify your governing state.]</strong></p>
        </Section>

        <Section heading="Changes to these terms">
          <p>We may update these terms as the service evolves. If we make a material change, we will update the date above and, where appropriate, notify you. Continued use after a change means you accept the updated terms.</p>
        </Section>

        <Section heading="Contact">
          <p>Questions about these terms? Email us at <strong>[support@yourdomain.com]</strong>.</p>
        </Section>

        <div style={{ borderTop: "1px solid #D8CFBE", marginTop: "32px", paddingTop: "24px", display: "flex", gap: "20px" }}>
          <Link href="/privacy" style={{ ...sans("12px", "#8A7F6E"), textDecoration: "none" }}>Privacy Policy →</Link>
          <Link href="/" style={{ ...sans("12px", "#8A7F6E"), textDecoration: "none" }}>Back to home →</Link>
        </div>
      </div>
    </main>
  );
}
