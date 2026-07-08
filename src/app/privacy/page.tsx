"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { BRAND_NAME } from "@/lib/brand";

// ─── Style helpers (shared with landing page) ────────────────────────────────
const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-lora), Georgia, serif",
  
  letterSpacing: "-0.015em",
  fontSize: size,
  color: "#221C14",
  lineHeight: 1.1,
  fontWeight: 400,
  ...extra,
});

const sans = (size: string, color = "#5F5648", extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-public-sans), system-ui, sans-serif",
  fontSize: size,
  color,
  ...extra,
});

function Nav() {
  return (
    <nav
      style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 50,
        backgroundColor: "var(--surface)",
        borderBottom: "1px solid var(--line)",
        padding: "20px 64px", display: "flex", justifyContent: "space-between", alignItems: "center",
      }}
    >
      <Link href="/" style={{ textDecoration: "none" }}>
        <span style={{ ...sans("15px", "#221C14"), letterSpacing: "0.42em", textTransform: "uppercase", fontWeight: 300, paddingLeft: "0.42em" }}>{BRAND_NAME}</span>
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

export default function PrivacyPage() {
  return (
    <main className="page-root" style={{ backgroundColor: "var(--surface)", minHeight: "100vh" }}>
      <Nav />
      <div style={{ maxWidth: "760px", margin: "0 auto", padding: "160px 32px 96px" }}>
        <div style={{ ...sans("11px", "#C8A97E"), letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: "20px" }}>Privacy</div>
        <h1 style={{ ...serif("52px", { lineHeight: 1.05, marginBottom: "20px" }) }}>Privacy Policy</h1>
        <p style={{ ...sans("13px", "#8A7F6E"), marginBottom: "48px" }}>Last updated: June 11, 2026</p>

        <Section heading="Who we are">
          <p>Verity, operated by Clear Claim Advocacy, is a consumer medical-bill audit service. We help you review your medical bills and Explanation of Benefits (EOB) statements, identify likely billing and coding errors, and, if you choose, generate dispute letters. This policy explains what information we handle, why, and the choices you have.</p>
          <p>Verity is operated from the United States. We are not a law firm, an insurer, or a healthcare provider, and we do not provide legal, medical, or financial advice.</p>
        </Section>

        <Section heading="Beta service, please read">
          <p><strong>Verity is currently offered as a beta service.</strong> That means the product is still under active development, and the way we handle data during the beta period is described here so you can make an informed choice before you upload anything.</p>
          <p>During beta, we may use the documents you upload and the results we generate, in de-identified or aggregated form where practical, to test, debug, evaluate, and improve our audit logic, detection rules, scoring models, and outcome predictions. We do <strong>not</strong> sell this data, and we do <strong>not</strong> use your medical documents to advertise to you. Where we use information to improve the service, we work to minimize and de-identify it.</p>
          <p>Because the service is in beta, features, retention practices, and this policy may change as the product matures. Automated audit results may be incomplete or contain errors (see below), and you should review them before acting. If you would prefer your data not be used to improve the service, contact us at the address below and we will honor that request.</p>
        </Section>

        <Section heading="Automated and AI-generated analysis">
          <p>Verity&apos;s audits are produced by automated systems and AI models, not by a human reviewer checking every line. <strong>AI-generated analysis can be incomplete or wrong</strong>, it may miss errors, flag items that are actually correct, or misread a document. Any recovery estimates, win-probability figures, settlement ranges, and risk scores we show are <strong>estimates, not guarantees</strong> of any outcome. You are responsible for reviewing results before relying on or acting on them.</p>
        </Section>

        <Section heading="Information we handle">
          <p><strong>Documents you upload.</strong> When you run an audit, you may upload medical bills, itemized statements, and EOBs. These often contain health and billing details, provider names, dates of service, procedure (CPT) codes, charges, and amounts. We treat these as sensitive and handle them only to perform the audit you requested.</p>
          <p><strong>Account information.</strong> If you create an account, we store your email address and authentication details through our identity provider.</p>
          <p><strong>Audit results.</strong> For signed-in users, we save your cases, the extracted line items, the errors we found, and any dispute letters, so you can return to them.</p>
          <p><strong>Payment information.</strong> If you subscribe or pay for a dispute, payment is processed by Stripe. We do not store your full card number; Stripe handles card data directly.</p>
          <p><strong>Guest audits.</strong> You can run a free audit without an account. We process the document to produce your results in that session and do not save the document or results to an account.</p>
        </Section>

        <Section heading="How we use your information">
          <p>We use the information you provide to: read your documents and extract the billable line items; check those items against published billing and coding rules; show you the results; generate dispute letters when you ask; maintain your account and cases; process payments; and communicate with you about your account.</p>
          <p>We do not sell your information. We do not use your medical documents to advertise to you.</p>
        </Section>

        <Section heading="Service providers we rely on">
          <p>We use a small number of vendors to run Verity. They process data only to provide their service to us:</p>
          <p><strong>Supabase</strong>, secure database, authentication, and file storage for your account and uploaded documents.</p>
          <p><strong>Anthropic</strong>, AI models that read your uploaded documents to extract the line items and help draft dispute letters. Documents are sent to Anthropic only to perform your audit.</p>
          <p><strong>Stripe</strong>, payment processing for subscriptions and one-time dispute fees.</p>
          <p>We do not share your medical documents with anyone other than the providers above, and only as needed to deliver the service, unless you direct us to (for example, a dispute letter you choose to send) or we are required to by law.</p>
        </Section>

        <Section heading="Security">
          <p>Documents are encrypted in transit and at rest, and access is restricted to the systems that perform your audit. Verity is built with privacy and security best practices. No method of transmission or storage is perfectly secure, and we cannot guarantee absolute security, but we work to protect your information using reasonable safeguards.</p>
        </Section>

        <Section heading="Data retention and deletion">
          <p>For signed-in users, we keep your cases and documents until you delete them or close your account. Guest-audit documents are not retained after your session. You can ask us to delete your account and associated data at any time by contacting us at the address below; we will delete it except where we must keep limited records (for example, payment records) to meet legal obligations.</p>
        </Section>

        <Section heading="Your choices and rights">
          <p>You can access, correct, export, or delete your information by contacting us. Depending on where you live, you may have additional rights under laws such as the California Consumer Privacy Act, including the right to know what we collect and the right to deletion. We honor these requests and will never charge you or deny you service for exercising them.</p>
        </Section>

        <Section heading="Children">
          <p>Verity is intended for adults. We do not knowingly collect information from anyone under 18. If you believe a minor has provided us information, contact us and we will delete it.</p>
        </Section>

        <Section heading="Changes to this policy">
          <p>We may update this policy as the service evolves. If we make a material change, we will update the date above and, where appropriate, notify you.</p>
        </Section>

        <Section heading="Contact">
          <p>Questions about your privacy or this policy? Email us at <strong>privacy@clearclaim.co</strong>.</p>
        </Section>

        <div style={{ borderTop: "1px solid #D8CFBE", marginTop: "32px", paddingTop: "24px", display: "flex", gap: "20px" }}>
          <Link href="/terms" style={{ ...sans("12px", "#8A7F6E"), textDecoration: "none" }}>Terms of Service →</Link>
          <Link href="/" style={{ ...sans("12px", "#8A7F6E"), textDecoration: "none" }}>Back to home →</Link>
        </div>
      </div>
    </main>
  );
}
