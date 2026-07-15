import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sources",
  description: "Citations for the industry figures referenced on the Verity site.",
};

// Citations for the marketing-site stat cards. These are industry-reported
// figures, not Verity findings, and the cards never present them as ours.
// TODO(sister-review): sanity-check framing and confirm preferred citation
// wording before launch.

const SOURCES = [
  {
    claim: "Up to 80% of medical bills contain at least one error",
    citation:
      "Reported range across industry billing-audit reviews; commonly cited estimates run from 49% to 80% depending on the review and bill type, which is why the site states the figure as “up to.”",
  },
  {
    claim: "1 in 7 claims are denied by insurers; only 0.1% of denials are ever appealed",
    citation:
      "KFF (Kaiser Family Foundation) analyses of ACA marketplace (HealthCare.gov) claims data on in-network claim denial rates and consumer appeal rates.",
  },
  {
    claim: "$1,300 average overcharge on hospital bills above $10,000",
    citation:
      "Industry claim-review reporting on audited hospital bills over $10,000, as cited by consumer billing-advocacy organizations.",
  },
];

const serif: React.CSSProperties = {
  fontFamily: "var(--font-lora), Georgia, serif",
  letterSpacing: "-0.015em",
  color: "var(--ink)",
  fontWeight: 400,
};
const sans: React.CSSProperties = {
  fontFamily: "var(--font-public-sans), system-ui, sans-serif",
  color: "var(--ink-soft)",
};

export default function SourcesPage() {
  return (
    <div style={{ background: "var(--surface)", minHeight: "100vh" }}>
      <div style={{ maxWidth: "720px", margin: "0 auto", padding: "96px 24px" }}>
        <Link
          href="/"
          style={{ ...sans, fontSize: "12px", textDecoration: "none", letterSpacing: "0.1em" }}
        >
          ← Verity
        </Link>
        <h1 style={{ ...serif, fontSize: "44px", lineHeight: 1.1, marginTop: "24px", marginBottom: "16px" }}>
          Sources
        </h1>
        <p style={{ ...sans, fontSize: "14px", lineHeight: 1.75, marginBottom: "40px" }}>
          The figures referenced on this site are industry-reported statistics, not
          Verity findings. Each claim and its basis:
        </p>
        {SOURCES.map((s) => (
          <div key={s.claim} style={{ borderTop: "1px solid var(--line)", padding: "24px 0" }}>
            <h2 style={{ ...serif, fontSize: "20px", lineHeight: 1.3, marginBottom: "8px" }}>
              &ldquo;{s.claim}&rdquo;
            </h2>
            <p style={{ ...sans, fontSize: "13px", lineHeight: 1.7 }}>{s.citation}</p>
          </div>
        ))}
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: "24px" }}>
          <p style={{ ...sans, fontSize: "12px", lineHeight: 1.7 }}>
            Figures describe industry-wide patterns and do not predict the outcome of
            any individual bill or dispute. Verity&apos;s own results are reported only
            when they are real.
          </p>
        </div>
      </div>
    </div>
  );
}
