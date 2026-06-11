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
        <p style={{ ...sans("13px", "#8A7F6E"), marginBottom: "48px" }}>Last updated: June 11, 2026</p>

        <Section heading="Agreement to these terms">
          <p>These Terms of Service are a binding agreement between you and Clear Claim Advocacy ("Verity," "we," "us"), and govern your use of the Verity service. By creating an account, running an audit, or otherwise using the service, you agree to these terms, including the binding arbitration and class-action waiver in the "Dispute resolution and arbitration" section below. If you do not agree, please do not use Verity.</p>
        </Section>

        <Section heading="What Verity is — and is not">
          <p>Verity, operated by Clear Claim Advocacy, is a consumer medical-bill audit tool. We review your medical bills and EOBs, identify likely billing and coding errors, and can help you generate dispute letters.</p>
          <p><strong>Verity is not a law firm and does not provide legal advice. It is not an insurer and does not provide insurance. It does not provide medical, tax, or financial advice.</strong> Our audit results and letters are informational tools to help you advocate for yourself. Using Verity does not create an attorney–client relationship. For legal, medical, or financial decisions, consult a qualified professional.</p>
        </Section>

        <Section heading="Beta service">
          <p><strong>Verity is currently provided as a beta service</strong> — it is under active development and may contain bugs, incomplete features, or interruptions. We may add, change, or remove features at any time during the beta period. As described in our <Link href="/privacy" style={{ color: "#221C14", fontWeight: 600 }}>Privacy Policy</Link>, during beta we may use uploaded documents and results, in de-identified or aggregated form where practical, to improve the service. Because the service is in beta, it is provided with no service-level commitment and "as is" (see "Disclaimers" below).</p>
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

        <Section heading="Audit results, predictions, and scores — no guarantee">
          <p>Verity uses AI and published billing rules to find likely errors. <strong>AI-generated analysis may contain errors</strong> — it can miss problems, flag items that are actually correct, or misread a document. We do not guarantee that every error will be found, that flagged items are definitively wrong, or that you will recover any particular amount — or any amount at all.</p>
          <p><strong>Recovery predictions, win-probability figures, settlement ranges, financial-harm scores, and similar outputs are estimates, not guarantees.</strong> They are generated from published industry baselines and refine over time as real dispute outcomes accumulate; they describe likelihoods, not promised results. Actual outcomes vary, and any specific dollar figures, percentages, or timelines shown anywhere on the site are illustrative. Billing and coverage determinations ultimately rest with your provider and insurer. You are responsible for reviewing results before acting on them.</p>
        </Section>

        <Section heading="Payments and subscriptions">
          <p>The free audit is available without payment. Paid options include a one-time fee for an individual dispute and a monthly membership. Prices are shown at checkout and billed through Stripe. Subscriptions renew automatically until you cancel; you can cancel at any time, effective at the end of the current billing period, and your membership remains active through that date.</p>
        </Section>

        <Section heading="Refund policy">
          <p>We want you to be satisfied with Verity. Our refund policy is as follows:</p>
          <p><strong>One-time dispute package ($39).</strong> If you are not satisfied, contact us within 14 days of purchase for a full refund — provided we have not yet generated and delivered the dispute letter and package for that bill. Once the dispute package has been delivered, the fee is non-refundable, because the work product has been produced.</p>
          <p><strong>Monthly membership.</strong> You may cancel at any time and will not be charged for the next billing period. Membership fees already charged for the current period are non-refundable, except that if you cancel within 7 days of your first membership charge and have not generated a dispute package during that period, we will refund that first charge on request.</p>
          <p><strong>How to request a refund.</strong> Email <strong>support@clearclaim.co</strong> with your account email and the charge in question. We process approved refunds to your original payment method through Stripe. Nothing in this policy limits any non-waivable refund or cancellation right you have under applicable law.</p>
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
          <p>These terms, and any dispute arising out of or relating to them or to the service, are governed by the laws of the <strong>State of Montana</strong> and applicable U.S. federal law, without regard to conflict-of-law rules. Subject to the arbitration provision below, you and Verity agree that the exclusive venue for any dispute that proceeds in court will be the state or federal courts located in Montana, and each party consents to personal jurisdiction there.</p>
        </Section>

        <Section heading="Dispute resolution and arbitration">
          <p><strong>Please read this section carefully — it affects your legal rights.</strong> You and Verity agree to first try to resolve any dispute informally by contacting us at support@clearclaim.co; most concerns can be resolved that way. If we cannot resolve a dispute within 30 days, either party may proceed as set out below.</p>
          <p><strong>Binding arbitration.</strong> Except for the carve-outs below, any dispute, claim, or controversy arising out of or relating to these terms or the service will be resolved by <strong>binding individual arbitration</strong> administered by a recognized arbitration provider under its consumer arbitration rules, rather than in court. The arbitration will be governed by the Federal Arbitration Act. It may be conducted by phone, video, or written submissions, or in person in Montana if required. The arbitrator's award may be entered in any court of competent jurisdiction.</p>
          <p><strong>Class-action waiver.</strong> You and Verity agree that each may bring claims against the other only in an individual capacity, and not as a plaintiff or class member in any purported class, consolidated, or representative proceeding. The arbitrator may not consolidate more than one person's claims or preside over any class or representative proceeding.</p>
          <p><strong>Exceptions.</strong> Either party may bring an individual claim in small-claims court if it qualifies, and either party may seek injunctive or equitable relief in court to protect intellectual property or stop misuse of the service. Nothing here waives any right you cannot waive under applicable law.</p>
          <p><strong>Opt-out.</strong> You may opt out of this arbitration agreement within 30 days of first accepting these terms by emailing <strong>support@clearclaim.co</strong> with your account email and a clear statement that you opt out of arbitration. Opting out does not affect any other part of these terms.</p>
        </Section>

        <Section heading="Changes to these terms">
          <p>We may update these terms as the service evolves. If we make a material change, we will update the date above and, where appropriate, notify you. Continued use after a change means you accept the updated terms.</p>
        </Section>

        <Section heading="Contact">
          <p>Questions about these terms? Email us at <strong>support@clearclaim.co</strong>.</p>
        </Section>

        <div style={{ borderTop: "1px solid #D8CFBE", marginTop: "32px", paddingTop: "24px", display: "flex", gap: "20px" }}>
          <Link href="/privacy" style={{ ...sans("12px", "#8A7F6E"), textDecoration: "none" }}>Privacy Policy →</Link>
          <Link href="/" style={{ ...sans("12px", "#8A7F6E"), textDecoration: "none" }}>Back to home →</Link>
        </div>
      </div>
    </main>
  );
}
