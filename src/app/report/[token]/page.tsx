import type { Metadata } from "next";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { BRAND_NAME } from "@/lib/brand";

// Token-addressed guest audit report (read-only). The token is the only
// credential: rows live in guest_audit_reports (RLS-locked, service-role
// only) and expire server-side. Report links must never be indexed, even
// after the site-wide preview noindex is lifted at launch.
export const metadata: Metadata = {
  title: "Your audit report",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ReportError {
  description?: string;
  explanation?: string;
  billed_amount?: number;
  expected_amount?: number;
  justification_only?: boolean;
}

interface ReportCrossDoc {
  description?: string;
  estimatedDollarImpact?: number;
}

interface ReportAudit {
  provider?: string | null;
  errorCount?: number;
  totalBilled?: number;
  potentialSavings?: number;
  hasEob?: boolean;
  errors?: ReportError[];
  crossDocumentDiscrepancies?: ReportCrossDoc[];
}

const dollars = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-lora), Georgia, serif",
  letterSpacing: "-0.015em",
  fontSize: size,
  color: "var(--ink)",
  fontWeight: 400,
  ...extra,
});

const sans = (size: string, color = "var(--ink-soft)", extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-public-sans), system-ui, sans-serif",
  fontSize: size,
  color,
  ...extra,
});

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", minHeight: "100vh" }}>
      <nav
        style={{
          borderBottom: "1px solid var(--line)",
          padding: "20px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Link href="/" style={{ textDecoration: "none" }}>
          <span style={{ ...sans("14px", "var(--ink)"), letterSpacing: "0.42em", textTransform: "uppercase", fontWeight: 300 }}>
            {BRAND_NAME}
          </span>
        </Link>
        <span style={{ ...sans("11px"), letterSpacing: "0.2em", textTransform: "uppercase" }}>
          Audit report
        </span>
      </nav>
      <main style={{ maxWidth: "720px", margin: "0 auto", padding: "64px 24px 96px" }}>{children}</main>
    </div>
  );
}

function Unavailable() {
  return (
    <Frame>
      <h1 style={{ ...serif("36px", { lineHeight: 1.15, marginBottom: "16px" }) }}>
        This report link has expired or doesn&apos;t exist.
      </h1>
      <p style={{ ...sans("15px", "var(--ink-soft)", { lineHeight: 1.75, marginBottom: "32px" }) }}>
        Report links stop working after 30 days. Your bill hasn&apos;t changed, so a fresh
        audit takes about a minute and is free.
      </p>
      <Link href="/upload" style={{ textDecoration: "none" }}>
        <span
          style={{
            ...sans("11px", "var(--ink)"),
            backgroundColor: "var(--brand-fill)",
            padding: "14px 28px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight: 500,
            display: "inline-block",
          }}
        >
          Run a free audit
        </span>
      </Link>
    </Frame>
  );
}

async function loadReport(token: string) {
  // createAdminClient throws when the service-role key isn't configured;
  // a report link must degrade to the unavailable state, never crash.
  try {
    const { data: row, error } = await createAdminClient()
      .from("guest_audit_reports")
      .select("audit, expires_at, created_at")
      .eq("token", token)
      .maybeSingle();
    if (error || !row) return null;
    if (new Date(row.expires_at).getTime() < Date.now()) return null;
    return row;
  } catch {
    return null;
  }
}

export default async function ReportPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!UUID_RE.test(token)) return <Unavailable />;

  const row = await loadReport(token);
  if (!row) return <Unavailable />;

  const audit = (row.audit ?? {}) as ReportAudit;
  const errorCount = Number(audit.errorCount ?? 0);
  const totalBilled = Number(audit.totalBilled ?? 0);
  const savings = Number(audit.potentialSavings ?? 0);
  const errors = Array.isArray(audit.errors) ? audit.errors : [];
  const crossDocs = Array.isArray(audit.crossDocumentDiscrepancies)
    ? audit.crossDocumentDiscrepancies.filter((d) => Number(d.estimatedDollarImpact ?? 0) > 0)
    : [];
  const clean = errorCount === 0 && savings <= 0;
  const expires = new Date(row.expires_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const ran = new Date(row.created_at).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Frame>
      <div style={{ ...sans("11px", "var(--brand)", { letterSpacing: "0.25em", textTransform: "uppercase", marginBottom: "24px" }) }}>
        {audit.provider ? `${audit.provider} · audited ${ran}` : `Audited ${ran}`}
      </div>

      {clean ? (
        <>
          <h1 style={{ ...serif("40px", { lineHeight: 1.12, marginBottom: "16px" }) }}>
            We checked every charge and found nothing to dispute.
          </h1>
          <p style={{ ...sans("15px", "var(--ink-soft)", { lineHeight: 1.75, maxWidth: "560px" }) }}>
            {audit.hasEob
              ? "This bill matches what your insurance says you owe."
              : "Nothing on this bill broke the billing rules we check. If you upload the statement from your insurance (called an EOB), we can also verify the amount you're being asked to pay."}
          </p>
        </>
      ) : (
        <>
          <h1 style={{ ...serif("40px", { lineHeight: 1.12, marginBottom: "16px" }) }}>
            We found {errorCount === 1 ? "1 billing error" : `${errorCount} billing errors`}.
          </h1>
          <p style={{ ...sans("15px", "var(--ink-soft)", { lineHeight: 1.75 }) }}>
            <span className="figure" style={{ color: "var(--ink)" }}>{dollars(savings)}</span>
            {" in potential overcharges on a "}
            <span className="figure" style={{ color: "var(--ink)" }}>{dollars(totalBilled)}</span>
            {" bill."}
          </p>
        </>
      )}

      {(errors.length > 0 || crossDocs.length > 0) && (
        <div style={{ marginTop: "48px", borderTop: "1px solid var(--line)" }}>
          {errors.map((e, i) => {
            const recoverable = Math.max(0, Number(e.billed_amount ?? 0) - Number(e.expected_amount ?? 0));
            return (
              <div key={i} style={{ borderBottom: "1px solid var(--line)", padding: "20px 0" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "baseline" }}>
                  <span style={{ ...sans("14px", "var(--ink)") }}>{e.description || "Billing error"}</span>
                  <span className="figure" style={{ ...sans("14px", "var(--brand)"), whiteSpace: "nowrap" }}>
                    {e.justification_only || recoverable <= 0 ? "justification requested" : `${dollars(recoverable)} recoverable`}
                  </span>
                </div>
                {e.explanation ? (
                  <p style={{ ...sans("13px", "var(--ink-soft)", { lineHeight: 1.6, marginTop: "6px", maxWidth: "560px" }) }}>
                    {e.explanation}
                  </p>
                ) : null}
              </div>
            );
          })}
          {crossDocs.map((d, i) => (
            <div key={`x${i}`} style={{ borderBottom: "1px solid var(--line)", padding: "20px 0" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "24px", alignItems: "baseline" }}>
                <span style={{ ...sans("14px", "var(--ink)") }}>
                  {d.description || "Your bill and your insurance's statement disagree"}
                </span>
                <span className="figure" style={{ ...sans("14px", "var(--brand)"), whiteSpace: "nowrap" }}>
                  {dollars(Number(d.estimatedDollarImpact ?? 0))} at stake
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: "56px", background: "var(--surface-raised)", border: "1px solid var(--line)", padding: "28px" }}>
        <p style={{ ...sans("14px", "var(--ink)", { lineHeight: 1.7, marginBottom: "20px", maxWidth: "520px" }) }}>
          {clean
            ? "Create a free account and every future bill you upload gets checked the same way."
            : "Create a free account to save this audit and get your dispute letter and proof."}
        </p>
        <Link href="/login" style={{ textDecoration: "none" }}>
          <span
            style={{
              ...sans("11px", "var(--ink)"),
              backgroundColor: "var(--brand-fill)",
              padding: "14px 28px",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              fontWeight: 500,
              display: "inline-block",
            }}
          >
            Save this audit
          </span>
        </Link>
      </div>

      <p style={{ ...sans("12px", "var(--ink-soft)", { marginTop: "32px", lineHeight: 1.6 }) }}>
        This link works until {expires}. Verity is an administrative advocacy service, not a law firm.
      </p>
    </Frame>
  );
}
