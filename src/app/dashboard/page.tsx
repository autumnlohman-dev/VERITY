"use client";

// ─── Dashboard: one question ──────────────────────────────────────────────────
// DESIGN-BIBLE Part 1: "What does the stressed person with the bill care
// about? Only show that." The screen is one verdict sentence per case with one
// action; everything else lives behind a single collapsed Details disclosure.
// Paper scheme throughout: --surface page, --ink text, --surface-raised cards.

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { claimPendingGuestAudit } from "@/lib/guestClaim";
import { classifyAuditFreshness } from "@/lib/audit/version";
import { userFacingErrorCount } from "@/lib/audit/errorCount";
import { formatCalendarDate } from "@/lib/dates";
import { BRAND_NAME } from "@/lib/brand";
import { getEntitlements } from "@/lib/entitlements";

const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-fraunces), Georgia, serif",
  fontOpticalSizing: "auto",
  letterSpacing: "-0.015em",
  fontSize: size,
  color: "var(--ink)",
  lineHeight: 1.15,
  fontWeight: 400,
  ...extra,
});

const sans = (size: string, color = "var(--ink-soft)", extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-public-sans), system-ui, sans-serif",
  fontSize: size,
  color,
  ...extra,
});

const label = (color = "var(--ink-soft)"): React.CSSProperties => ({
  fontFamily: "var(--font-public-sans), system-ui, sans-serif",
  fontSize: "11px",
  letterSpacing: "0.25em",
  textTransform: "uppercase" as const,
  color,
});

// Dollar amounts render in the mono face (DESIGN-BIBLE Part 3).
function Money({ n }: { n: number }) {
  return <span className="figure">{`$${Math.round(n).toLocaleString("en-US")}`}</span>;
}

function Nav() {
  return (
    <nav
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: "var(--surface)",
        borderBottom: "1px solid var(--line)",
        padding: "20px clamp(24px, 6vw, 64px)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Link href="/" style={{ textDecoration: "none" }}>
        <span
          style={{
            ...sans("12px", "var(--ink)"),
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          {BRAND_NAME}
        </span>
      </Link>
      <div className="hidden md:flex" style={{ gap: "40px" }}>
        {[
          { label: "Call Copilot", href: "/copilot" },
          { label: "How it works", href: "/how-it-works" },
          { label: "Pricing", href: "/pricing" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              ...sans("11px", "var(--ink-soft)"),
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--ink)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-soft)")}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <Link href="/upload" style={{ textDecoration: "none" }}>
        <span
          style={{
            ...sans("11px", "var(--surface-raised)"),
            backgroundColor: "var(--brand)",
            padding: "12px 24px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight: 500,
            display: "inline-block",
          }}
        >
          Upload a bill
        </span>
      </Link>
    </nav>
  );
}

type RawStatus = "auditing" | "error_found" | "no_errors" | "letter_ready" | string;

interface BillData {
  careType?: string;
  insuranceType?: string;
  tier?: string;
  date_of_service?: string;
  hasEob?: boolean;
  normalizedCbs?: { crossDocumentDiscrepancies?: unknown[] };
}

interface CaseRow {
  id: string;
  user_id: string;
  status: RawStatus;
  provider_name: string | null;
  insurance_type: string | null;
  amount_billed: number | null;
  amount_recovered: number | null;
  potential_savings: number | null;
  bill_data: BillData | null;
  errors_found: unknown[] | null;
  dispute_paid: boolean | null;
  lob_letter_id: string | null;
  mail_status: string | null;
  mailed_at: string | null;
  created_at: string;
}

// ─── The verdict: one sentence + one action per case ─────────────────────────
// Plain words only (Part 6): no "encounters", no "workflows", no "(s)".
type Verdict = {
  sentence: React.ReactNode;
  action:
    | { kind: "button"; label: string; href: string }
    | { kind: "waiting"; text: string; href: string };
  // Ranking for which case leads the page: lower = more urgent.
  rank: number;
};

function mailed(c: CaseRow): boolean {
  return !!c.lob_letter_id && c.mail_status !== "failed";
}

function replyDueDate(c: CaseRow): string | null {
  // The letter requests a corrected statement within 30 days of mailing.
  if (!c.mailed_at) return null;
  const d = new Date(c.mailed_at);
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 30);
  return formatCalendarDate(d.toISOString().slice(0, 10));
}

function verdictFor(c: CaseRow): Verdict {
  const provider = c.provider_name?.trim() || "your provider";
  const recovered = Number(c.amount_recovered ?? 0);
  const savings = Number(c.potential_savings ?? 0);
  const errorCount = userFacingErrorCount(
    c.errors_found,
    c.bill_data?.normalizedCbs?.crossDocumentDiscrepancies
  );
  const caseHref = `/cases/${c.id}`;
  const letterHref = `/cases/${c.id}/letter`;

  if (recovered > 0) {
    return {
      sentence: (
        <>
          You got <Money n={recovered} /> back from {provider}.
        </>
      ),
      action: { kind: "waiting", text: "Resolved", href: caseHref },
      rank: 4,
    };
  }

  if (c.status === "auditing") {
    return {
      sentence: <>We&apos;re still checking your {provider} bill.</>,
      action: { kind: "button", label: "See progress", href: caseHref },
      rank: 2,
    };
  }

  if (c.status === "error_found" || c.status === "letter_ready") {
    const sentence =
      savings > 0 && c.bill_data?.hasEob ? (
        <>
          {provider} is charging you <Money n={savings} /> more than your insurance says you owe.
        </>
      ) : savings > 0 ? (
        <>
          We found <Money n={savings} /> in likely errors on your {provider} bill.
        </>
      ) : (
        <>
          We flagged {errorCount === 1 ? "one item" : `${errorCount} items`} to review on your{" "}
          {provider} bill.
        </>
      );

    if (mailed(c)) {
      const due = replyDueDate(c);
      return {
        sentence,
        action: {
          kind: "waiting",
          text: due ? `Waiting for the reply, due ${due}` : "Waiting for the reply",
          href: caseHref,
        },
        rank: 1,
      };
    }
    if (c.status === "letter_ready") {
      return { sentence, action: { kind: "button", label: "Send your letter", href: letterHref }, rank: 0 };
    }
    return { sentence, action: { kind: "button", label: "Review your letter", href: letterHref }, rank: 0 };
  }

  return {
    sentence: <>Your {provider} bill looks right.</>,
    action: { kind: "waiting", text: "Nothing to do", href: caseHref },
    rank: 3,
  };
}

// The stale-version chip: results predate the current audit logic and update
// on the next case view. Kept in the new layout, with its next step visible.
function UpdatePendingChip({ c }: { c: CaseRow }) {
  const stale =
    classifyAuditFreshness(c.bill_data as Record<string, unknown> | null) !== "current";
  if (!stale || c.status === "auditing") return null;
  return (
    <Link
      href={`/cases/${c.id}`}
      title="These numbers were computed under an older version of our analysis. Open the case to update them."
      style={{
        ...sans("9px", "var(--ink-soft)"),
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        border: "1px solid var(--line)",
        padding: "2px 6px",
        whiteSpace: "nowrap",
        textDecoration: "none",
      }}
    >
      update pending
    </Link>
  );
}

const STATUS_DISPLAY: Record<string, { label: string; dot: string }> = {
  auditing: { label: "Checking", dot: "var(--ink-soft)" },
  error_found: { label: "Needs action", dot: "var(--urgent-amber)" },
  no_errors: { label: "Looks right", dot: "var(--brand)" },
  letter_ready: { label: "Letter ready", dot: "var(--brand)" },
  resolved: { label: "Resolved", dot: "var(--brand)" },
};

function StatusPill({ c }: { c: CaseRow }) {
  const cfg =
    (Number(c.amount_recovered ?? 0) > 0 ? STATUS_DISPLAY.resolved : STATUS_DISPLAY[c.status]) ?? {
      label: c.status,
      dot: "var(--ink-soft)",
    };
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
      <span
        style={{
          display: "inline-block",
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: cfg.dot,
          flexShrink: 0,
        }}
      />
      <span style={{ ...sans("12px", "var(--ink)") }}>{cfg.label}</span>
      <UpdatePendingChip c={c} />
    </div>
  );
}

function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

// Timezone-safe: a date-only date_of_service must not render a day early for
// viewers west of Greenwich (full created_at timestamps parse natively).
function formatServiceDate(c: CaseRow): { value: string; labelText: string } {
  const dos = c.bill_data?.date_of_service?.trim();
  const iso = dos && dos.length > 0 ? dos : c.created_at;
  return { value: formatCalendarDate(iso), labelText: dos ? "Date of service" : "Filed" };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--surface)", minHeight: "100vh" }}>
      <Nav />
      {children}
    </div>
  );
}

function LoadingState() {
  return (
    <Shell>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          paddingTop: "200px",
          textAlign: "center",
        }}
      >
        <div style={{ ...serif("32px", { fontStyle: "italic", color: "var(--ink-soft)" }) }}>
          Loading your bills.
        </div>
      </div>
    </Shell>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <Shell>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "200px",
          textAlign: "center",
          paddingLeft: "24px",
          paddingRight: "24px",
        }}
      >
        <div style={{ ...serif("40px", { lineHeight: 1.1 }) }}>Something went wrong.</div>
        <p style={{ ...sans("14px"), marginTop: "16px", maxWidth: "420px" }}>{message}</p>
      </div>
    </Shell>
  );
}

function EmptyState() {
  return (
    <Shell>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "200px",
          textAlign: "center",
          paddingLeft: "24px",
          paddingRight: "24px",
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <h1 style={{ ...serif("clamp(36px, 7vw, 56px)", { lineHeight: 1.05 }), margin: 0 }}>
            Start with your first bill.
          </h1>
          <p
            style={{
              ...sans("15px"),
              marginTop: "20px",
              maxWidth: "480px",
              lineHeight: 1.6,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Upload a medical bill and we&apos;ll check every charge against published billing
            rules. Anything wrong becomes a ready-to-send dispute letter.
          </p>
          <Link href="/upload" style={{ textDecoration: "none", marginTop: "40px", display: "inline-block" }}>
            <span
              style={{
                ...sans("11px", "var(--surface-raised)"),
                backgroundColor: "var(--brand)",
                padding: "16px 32px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                fontWeight: 500,
                display: "inline-block",
              }}
            >
              Upload my first bill
            </span>
          </Link>
        </motion.div>
      </div>
    </Shell>
  );
}

function DeleteConfirmModal({
  caseRow,
  deleting,
  error,
  onConfirm,
  onCancel,
}: {
  caseRow: CaseRow;
  deleting: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const providerName = caseRow.provider_name?.trim() || "Pending provider";
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-case-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        backgroundColor: "rgba(51,49,43,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !deleting) onCancel();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        style={{
          width: "100%",
          maxWidth: "440px",
          backgroundColor: "var(--surface-raised)",
          border: "1px solid var(--line)",
          borderLeft: "4px solid var(--urgent-red)",
          padding: "32px",
        }}
      >
        <h2 id="delete-case-title" style={{ ...serif("28px", { lineHeight: 1.2 }), margin: 0 }}>
          Delete this case?
        </h2>
        <p style={{ ...sans("13px"), marginTop: "12px", lineHeight: 1.6 }}>
          This can&rsquo;t be undone. The case for{" "}
          <span style={{ color: "var(--ink)" }}>{providerName}</span>, its audit findings, any
          dispute letters, and the uploaded documents will be permanently removed.
        </p>
        {error && (
          <p role="alert" style={{ ...sans("12px", "var(--urgent-red)"), marginTop: "12px" }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: "12px", marginTop: "28px", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            disabled={deleting}
            style={{
              ...sans("11px"),
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              background: "transparent",
              border: "1px solid var(--line)",
              padding: "10px 20px",
              cursor: deleting ? "not-allowed" : "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            style={{
              ...sans("11px", "var(--surface-raised)"),
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              backgroundColor: "var(--urgent-red)",
              border: "none",
              padding: "10px 20px",
              cursor: deleting ? "wait" : "pointer",
              opacity: deleting ? 0.6 : 1,
              fontWeight: 500,
            }}
          >
            {deleting ? "Deleting…" : "Delete case"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  // Delete flow: which case the confirm modal is open for, whether the DELETE
  // request is in flight, and the last failure (shown inside the modal).
  const [confirmDelete, setConfirmDelete] = useState<CaseRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Membership entitles every case to letter generation; non-members are
  // entitled per case via dispute_paid. Fetched once to keep row CTAs cheap.
  const [isMember, setIsMember] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    (async () => {
      // The dashboard shows a user's own cases and nothing else. Require a
      // session and always scope the query to auth.uid(); if there's no user
      // (e.g. an unconfirmed signup with no session), send them to sign in
      // rather than running an unscoped query.
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        router.replace("/login");
        return;
      }

      // Fallback for the carry-through-signup flow: if a guest audit claim is
      // still pending (e.g. the email-confirmation path landed here, or the user
      // was already signed in), import it into a real case and jump to it. The
      // import is idempotent and clears the claim on success.
      const claimedCaseId = await claimPendingGuestAudit();
      if (cancelled) return;
      if (claimedCaseId) {
        router.replace(`/cases/${claimedCaseId}`);
        return;
      }

      const { data, error } = await supabase
        .from("cases")
        .select(
          "id, user_id, status, provider_name, insurance_type, amount_billed, amount_recovered, potential_savings, bill_data, errors_found, dispute_paid, lob_letter_id, mail_status, mailed_at, created_at"
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        setFetchError(error.message);
        setLoading(false);
        return;
      }

      setCases((data ?? []) as CaseRow[]);

      // One membership check for the whole dashboard (drives the row letter CTAs).
      try {
        const { isMember: member } = await getEntitlements(supabase, user.id);
        if (!cancelled) setIsMember(member);
      } catch {
        // leave isMember = false; per-case dispute_paid still drives CTAs
      }

      if (cancelled) return;
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function deleteCase(c: CaseRow) {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/cases/${c.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(json.error ?? "Couldn't delete this case. Please try again.");
        return;
      }
      setCases((prev) => prev.filter((x) => x.id !== c.id));
      setConfirmDelete(null);
    } catch {
      setDeleteError("Couldn't delete this case. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  if (loading) return <LoadingState />;
  if (fetchError) return <ErrorState message={fetchError} />;
  if (cases.length === 0) return <EmptyState />;

  // One verdict per case; the most urgent case leads the page.
  const withVerdicts = cases
    .map((c) => ({ c, v: verdictFor(c) }))
    .sort((a, b) => a.v.rank - b.v.rank);
  const primary = withVerdicts[0];
  const rest = withVerdicts.slice(1);

  const totalRecovered = cases.reduce((s, c) => s + Math.max(0, Number(c.amount_recovered ?? 0)), 0);
  const totalBilled = cases.reduce((s, c) => s + Number(c.amount_billed ?? 0), 0);
  const totalPotential = cases.reduce((s, c) => s + Number(c.potential_savings ?? 0), 0);

  const actionButtonStyle: React.CSSProperties = {
    ...sans("11px", "var(--surface-raised)"),
    backgroundColor: "var(--brand)",
    padding: "14px 28px",
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    fontWeight: 500,
    display: "inline-block",
    textDecoration: "none",
  };

  return (
    <Shell>
      <div
        style={{
          paddingTop: "128px",
          paddingLeft: "clamp(24px, 6vw, 64px)",
          paddingRight: "clamp(24px, 6vw, 64px)",
          paddingBottom: "96px",
          maxWidth: "880px",
        }}
      >
        {/* a. THE verdict: one sentence, one action. The entire above-the-fold. */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
        >
          <h1 style={{ ...serif("clamp(30px, 5vw, 46px)", { lineHeight: 1.2 }), margin: 0, maxWidth: "760px" }}>
            {primary.v.sentence}
          </h1>
          <div style={{ marginTop: "28px", display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            {primary.v.action.kind === "button" ? (
              <Link href={primary.v.action.href} style={actionButtonStyle}>
                {primary.v.action.label}
              </Link>
            ) : (
              <Link
                href={primary.v.action.href}
                style={{ ...sans("14px", "var(--ink)"), textDecoration: "none" }}
              >
                {primary.v.action.text} →
              </Link>
            )}
            <UpdatePendingChip c={primary.c} />
          </div>
        </motion.div>

        {/* b. A quiet one-line summary per other case. */}
        {rest.length > 0 && (
          <div style={{ marginTop: "64px", borderTop: "1px solid var(--line)" }}>
            {rest.map(({ c, v }) => (
              <div
                key={c.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: "16px",
                  padding: "20px 0",
                  borderBottom: "1px solid var(--line)",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ ...sans("15px", "var(--ink)"), lineHeight: 1.5, flex: "1 1 320px" }}>
                  {v.sentence} <UpdatePendingChip c={c} />
                </div>
                <Link
                  href={v.action.href}
                  style={{ ...sans("13px", "var(--brand)"), textDecoration: "none", whiteSpace: "nowrap" }}
                >
                  {v.action.kind === "button" ? v.action.label : v.action.text} →
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* c. Upload a new bill: calm secondary action. */}
        <div style={{ marginTop: "40px" }}>
          <Link
            href="/upload"
            style={{
              ...sans("13px", "var(--brand)"),
              textDecoration: "none",
              border: "1px solid var(--line)",
              padding: "12px 20px",
              display: "inline-block",
            }}
          >
            Upload a new bill
          </Link>
        </div>

        {/* Recovered money is something the person cares about; one small line,
            only once it exists. */}
        {totalRecovered > 0 && (
          <p style={{ ...sans("14px"), marginTop: "32px" }}>
            You&apos;ve gotten <Money n={totalRecovered} /> back so far.
          </p>
        )}

        {/* d. Everything else, behind one collapsed disclosure. */}
        <details style={{ marginTop: "64px" }}>
          <summary
            style={{
              ...sans("12px", "var(--ink-soft)"),
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              cursor: "pointer",
              listStyle: "none",
            }}
          >
            Details
          </summary>
          <div style={{ marginTop: "24px" }}>
            <div
              style={{
                display: "flex",
                gap: "32px",
                flexWrap: "wrap",
                padding: "20px 24px",
                backgroundColor: "var(--surface-raised)",
                border: "1px solid var(--line)",
                marginBottom: "32px",
              }}
            >
              <div>
                <div style={{ ...label(), marginBottom: "4px" }}>billed across your cases</div>
                <div style={{ ...sans("18px", "var(--ink)") }} className="figure">
                  {formatCurrency(totalBilled)}
                </div>
              </div>
              <div>
                <div style={{ ...label(), marginBottom: "4px" }}>possible savings found</div>
                <div style={{ ...sans("18px", "var(--ink)") }} className="figure">
                  {formatCurrency(totalPotential)}
                </div>
              </div>
              <div>
                <div style={{ ...label(), marginBottom: "4px" }}>recovered</div>
                <div style={{ ...sans("18px", "var(--ink)") }} className="figure">
                  {formatCurrency(totalRecovered)}
                </div>
              </div>
            </div>

            {/* Full case table (the working surface: view, letter, delete). */}
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: "720px" }}>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(180px, 2fr) 140px 120px 130px 150px 130px",
                    gap: "16px",
                    paddingBottom: "12px",
                    borderBottom: "1px solid var(--line)",
                  }}
                >
                  {["Provider", "Date", "Billed", "Savings", "Status", ""].map((h, i) => (
                    <span
                      key={i}
                      style={{ ...sans("11px"), letterSpacing: "0.15em", textTransform: "uppercase" }}
                    >
                      {h}
                    </span>
                  ))}
                </div>

                {cases.map((c) => {
                  const providerName = c.provider_name?.trim() || "Pending provider";
                  const dateInfo = formatServiceDate(c);
                  const billed = Number(c.amount_billed ?? 0);
                  const potential = Number(c.potential_savings ?? 0);
                  const entitled = isMember || c.dispute_paid === true;
                  const letterCta =
                    c.status === "letter_ready"
                      ? "View letter"
                      : c.status === "error_found"
                      ? entitled
                        ? "Get letter"
                        : "Get letter"
                      : null;

                  return (
                    <div
                      key={c.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(180px, 2fr) 140px 120px 130px 150px 130px",
                        gap: "16px",
                        alignItems: "center",
                        padding: "16px 0",
                        borderBottom: "1px solid var(--line)",
                      }}
                    >
                      <div>
                        <div style={{ ...serif("18px", { lineHeight: 1.2 }) }}>{providerName}</div>
                        {c.insurance_type && (
                          <div style={{ ...sans("12px"), marginTop: "4px" }}>{c.insurance_type}</div>
                        )}
                      </div>
                      <div>
                        <div style={{ ...sans("13px", "var(--ink)") }}>{dateInfo.value}</div>
                        <div style={{ ...sans("11px"), marginTop: "2px" }}>{dateInfo.labelText}</div>
                      </div>
                      <div style={{ ...sans("14px", "var(--ink)") }} className="figure">
                        {formatCurrency(billed)}
                      </div>
                      <div style={{ ...sans("14px", potential > 0 ? "var(--ink)" : "var(--ink-soft)") }} className="figure">
                        {potential > 0 ? formatCurrency(potential) : "-"}
                      </div>
                      <StatusPill c={c} />
                      <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
                        <Link
                          href={`/cases/${c.id}`}
                          style={{ ...sans("12px", "var(--brand)"), textDecoration: "none", textAlign: "right" }}
                        >
                          View
                        </Link>
                        {letterCta && (
                          <Link
                            href={`/cases/${c.id}/letter`}
                            style={{ ...sans("11px"), textDecoration: "none", textAlign: "right" }}
                          >
                            {letterCta}
                          </Link>
                        )}
                        <button
                          onClick={() => {
                            setDeleteError(null);
                            setConfirmDelete(c);
                          }}
                          aria-label={`Delete case for ${providerName}`}
                          style={{
                            ...sans("11px"),
                            letterSpacing: "0.05em",
                            background: "none",
                            border: "none",
                            padding: 0,
                            cursor: "pointer",
                            transition: "color 0.2s",
                            textAlign: "right",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--urgent-red)")}
                          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--ink-soft)")}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </details>
      </div>

      {confirmDelete && (
        <DeleteConfirmModal
          caseRow={confirmDelete}
          deleting={deleting}
          error={deleteError}
          onConfirm={() => void deleteCase(confirmDelete)}
          onCancel={() => {
            setConfirmDelete(null);
            setDeleteError(null);
          }}
        />
      )}
    </Shell>
  );
}
