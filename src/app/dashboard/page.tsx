"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { createClient } from "@/lib/supabase/client";
import { claimPendingGuestAudit } from "@/lib/guestClaim";
import { getEntitlements } from "@/lib/entitlements";
import { DigitalTwinView } from "@/components/DigitalTwinView";

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
        backgroundColor: scrolled ? "rgba(13,13,13,0.92)" : "rgba(13,13,13,0.95)",
        backdropFilter: "blur(12px)",
        transition: "background-color 0.4s",
        padding: "20px 64px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "1px solid #1C1C1C",
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
          Upload my bill free →
        </span>
      </Link>
    </nav>
  );
}

type RawStatus = "auditing" | "error_found" | "no_errors" | "letter_ready" | string;

interface BillData {
  careType?: string;
  insuranceType?: string;
  gfe?: string;
  tier?: string;
  userNotes?: string;
  date_of_service?: string;
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
  created_at: string;
}

const STATUS_DISPLAY: Record<string, { label: string; dot: string; text: string; pulse?: boolean }> = {
  auditing: { label: "Auditing", dot: "#4A90D9", text: "#A89F96", pulse: true },
  error_found: { label: "Error Found", dot: "#C47C6A", text: "#C47C6A" },
  no_errors: { label: "No Errors Found", dot: "#7A9E87", text: "#7A9E87" },
  letter_ready: { label: "Letter Ready", dot: "#C8A97E", text: "#C8A97E" },
  resolved: { label: "Resolved", dot: "#7A9E87", text: "#7A9E87" },
};

// Resolved is derived from amount_recovered > 0, not the status column.
// Everything else buckets by whether a dispute is actively in flight.
type Bucket = "open" | "in_progress" | "resolved";
function bucketOf(c: CaseRow): Bucket {
  if ((c.amount_recovered ?? 0) > 0) return "resolved";
  if (c.status === "error_found" || c.status === "letter_ready") return "in_progress";
  return "open";
}

function displayStatus(c: CaseRow): { key: string; label: string; dot: string; text: string; pulse?: boolean } {
  if ((c.amount_recovered ?? 0) > 0) {
    return { key: "resolved", ...STATUS_DISPLAY.resolved };
  }
  const cfg = STATUS_DISPLAY[c.status] ?? { label: c.status, dot: "#A89F96", text: "#A89F96" };
  return { key: c.status, ...cfg };
}

function StatusPill({ c }: { c: CaseRow }) {
  const cfg = displayStatus(c);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
      <span
        className={cfg.pulse ? "dot-pulse" : ""}
        style={{
          display: "inline-block",
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: cfg.dot,
          flexShrink: 0,
        }}
      />
      <span style={{ ...sans("12px", cfg.text) }}>{cfg.label}</span>
    </div>
  );
}

function useCountUp(target: number, duration = 1500) {
  const [count, setCount] = useState(0);
  const lastTarget = useRef<number | null>(null);

  useEffect(() => {
    if (lastTarget.current === target) return;
    lastTarget.current = target;
    const startValue = 0;
    const startTime = performance.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      setCount(Math.round(startValue + easeOutCubic(progress) * (target - startValue)));
      if (progress < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return count;
}

function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function formatServiceDate(c: CaseRow): { value: string; labelText: string } {
  const dos = c.bill_data?.date_of_service?.trim();
  const iso = dos && dos.length > 0 ? dos : c.created_at;
  try {
    const d = new Date(iso);
    const value = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return { value, labelText: dos ? "Date of service" : "Filed" };
  } catch {
    return { value: iso, labelText: dos ? "Date of service" : "Filed" };
  }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: "#0D0D0D", minHeight: "100vh" }}>
      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .dot-pulse { animation: pulse-dot 1.5s ease-in-out infinite; }
      `}</style>
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
        <div
          className="dot-pulse"
          style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            backgroundColor: "#C8A97E",
            marginBottom: "24px",
          }}
        />
        <div style={{ ...serif("32px", { fontStyle: "italic", color: "#A89F96" }) }}>
          Loading your cases.
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
        <p style={{ ...sans("14px", "#A89F96"), marginTop: "16px", maxWidth: "420px" }}>{message}</p>
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
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <div style={{ ...label("#6B635C"), marginBottom: "16px" }}>No cases yet</div>
          <h1 style={{ ...serif("56px", { lineHeight: 1.05 }), margin: 0 }}>
            Start with your first bill.
          </h1>
          <p
            style={{
              ...sans("15px", "#A89F96"),
              marginTop: "20px",
              maxWidth: "480px",
              lineHeight: 1.6,
              marginLeft: "auto",
              marginRight: "auto",
            }}
          >
            Upload a medical bill and we&apos;ll audit every charge against the Medicare
            Physician Fee Schedule, NCCI edits, and MUE limits. Errors become a prefilled
            dispute letter.
          </p>
          <Link href="/upload" style={{ textDecoration: "none", marginTop: "40px", display: "inline-block" }}>
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
              Upload my first bill →
            </span>
          </Link>
        </motion.div>
      </div>
    </Shell>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
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
          "id, user_id, status, provider_name, insurance_type, amount_billed, amount_recovered, potential_savings, bill_data, errors_found, dispute_paid, created_at"
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

  const totals = cases.reduce(
    (acc, c) => {
      const billed = Number(c.amount_billed ?? 0);
      const potential = Number(c.potential_savings ?? 0);
      const recovered = Number(c.amount_recovered ?? 0);
      acc.totalBilled += billed;
      acc.totalPotentialSavings += potential;
      // M4: "total recovered" must sum what was actually recovered, not the
      // potential-savings estimate (which would overstate recoveries).
      if (recovered > 0) acc.totalSaved += recovered;
      const b = bucketOf(c);
      acc.counts[b] += 1;
      return acc;
    },
    {
      totalBilled: 0,
      totalPotentialSavings: 0,
      totalSaved: 0,
      counts: { open: 0, in_progress: 0, resolved: 0 } as Record<Bucket, number>,
    }
  );

  const savedAnimated = useCountUp(totals.totalSaved);

  if (loading) return <LoadingState />;
  if (fetchError) return <ErrorState message={fetchError} />;
  if (cases.length === 0) return <EmptyState />;

  return (
    <Shell>
      <div
        style={{
          paddingTop: "112px",
          paddingLeft: "64px",
          paddingRight: "64px",
          paddingBottom: "96px",
        }}
      >
        {/* v8: Healthcare Financial Digital Twin (Component P) */}
        <DigitalTwinView
          cases={cases.map((c) => ({
            caseId: String(c.id),
            providerName: c.provider_name ?? undefined,
            insuranceType: c.insurance_type ?? undefined,
            createdAt: c.created_at,
            totalBilled: Number(c.amount_billed ?? 0),
            potentialSavings: Number(c.potential_savings ?? 0),
            // L8: real per-case error count from errors_found, not a 0/1 proxy
            // derived from potential_savings (which undercounted multi-error bills).
            errorCount: Array.isArray(c.errors_found) ? c.errors_found.length : 0,
            status: c.status,
          }))}
        />

        {/* Header row */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-end",
            marginBottom: "48px",
          }}
        >
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
            style={{ ...serif("56px", { lineHeight: 0.95 }), margin: 0 }}
          >
            Your cases.
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
            style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}
          >
            <div style={{ ...label("#6B635C"), marginBottom: "4px" }}>total recovered</div>
            <div
              style={{
                fontFamily: "var(--font-cormorant), Georgia, serif",
                fontSize: "48px",
                color: totals.totalSaved > 0 ? "#7A9E87" : "#6B635C",
                lineHeight: 1,
                fontWeight: 400,
                fontStyle: "italic",
              }}
            >
              {formatCurrency(savedAnimated)}
            </div>
            <Link
              href="/upload"
              style={{
                ...sans("12px", "#C8A97E"),
                textDecoration: "none",
                letterSpacing: "0.1em",
                marginTop: "8px",
                transition: "color 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F0E8")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "#C8A97E")}
            >
              Upload new bill →
            </Link>
          </motion.div>
        </div>

        {/* Totals summary */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.15 }}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1px 1fr 1px 1fr",
            alignItems: "stretch",
            backgroundColor: "#111111",
            border: "1px solid #242424",
            padding: "28px 32px",
            marginBottom: "24px",
          }}
        >
          {[
            { labelText: "total billed", value: formatCurrency(totals.totalBilled), color: "#F5F0E8" },
            null,
            {
              labelText: "total potential savings",
              value: formatCurrency(totals.totalPotentialSavings),
              color: totals.totalPotentialSavings > 0 ? "#C8A97E" : "#6B635C",
            },
            null,
            {
              labelText: "total recovered",
              value: formatCurrency(totals.totalSaved),
              color: totals.totalSaved > 0 ? "#7A9E87" : "#6B635C",
            },
          ].map((item, i) =>
            item === null ? (
              <div
                key={i}
                style={{ width: "1px", backgroundColor: "#242424", alignSelf: "stretch", margin: "0 24px" }}
              />
            ) : (
              <div key={i}>
                <div style={{ ...label("#6B635C"), marginBottom: "8px" }}>{item.labelText}</div>
                <div
                  style={{
                    fontFamily: "var(--font-cormorant), Georgia, serif",
                    fontSize: "36px",
                    color: item.color,
                    lineHeight: 1,
                    fontWeight: 400,
                  }}
                >
                  {item.value}
                </div>
              </div>
            )
          )}
        </motion.div>

        {/* Status counts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.2 }}
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: "16px",
            marginBottom: "48px",
          }}
        >
          {([
            { key: "open", labelText: "Open", count: totals.counts.open, dot: "#4A90D9" },
            { key: "in_progress", labelText: "In progress", count: totals.counts.in_progress, dot: "#C8A97E" },
            { key: "resolved", labelText: "Resolved", count: totals.counts.resolved, dot: "#7A9E87" },
          ] as const).map((item) => (
            <div
              key={item.key}
              style={{
                backgroundColor: "#111111",
                border: "1px solid #242424",
                padding: "20px 24px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: item.dot,
                  }}
                />
                <span
                  style={{
                    ...sans("12px", "#A89F96"),
                    letterSpacing: "0.15em",
                    textTransform: "uppercase",
                  }}
                >
                  {item.labelText}
                </span>
              </div>
              <div
                style={{
                  fontFamily: "var(--font-cormorant), Georgia, serif",
                  fontSize: "32px",
                  color: "#F5F0E8",
                  lineHeight: 1,
                  fontWeight: 400,
                }}
              >
                {item.count}
              </div>
            </div>
          ))}
        </motion.div>

        {/* Cases list */}
        <div>
          <div style={{ ...label("#6B635C"), marginBottom: "24px" }}>All cases</div>

          {/* Column headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(220px, 2fr) 160px 140px 160px 160px 150px",
              gap: "16px",
              paddingBottom: "12px",
              borderBottom: "1px solid #242424",
            }}
          >
            {["Provider", "Date of service", "Amount billed", "Potential savings", "Status", ""].map((h, i) => (
              <span
                key={i}
                style={{
                  ...sans("11px", "#6B635C"),
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                }}
              >
                {h}
              </span>
            ))}
          </div>

          {cases.map((c, i) => {
            const providerName = c.provider_name?.trim() || "Pending provider";
            const dateInfo = formatServiceDate(c);
            const billed = Number(c.amount_billed ?? 0);
            const potential = Number(c.potential_savings ?? 0);

            // State-aware letter action, same logic as the case page. status
            // 'letter_ready' means a letter exists; 'error_found' means findings
            // but no letter yet (buy vs generate by entitlement). Clean/auditing
            // cases get no letter action.
            const entitled = isMember || c.dispute_paid === true;
            const letterCta =
              c.status === "letter_ready"
                ? { label: "View letter →" }
                : c.status === "error_found"
                ? { label: entitled ? "Generate letter →" : "Get package →" }
                : null;

            return (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.25, 0.1, 0.25, 1], delay: 0.25 + i * 0.05 }}
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(220px, 2fr) 160px 140px 160px 160px 150px",
                  gap: "16px",
                  alignItems: "center",
                  padding: "20px 0",
                  borderBottom: "1px solid #1C1C1C",
                }}
              >
                <div>
                  <div style={{ ...serif("20px", { lineHeight: 1.2 }) }}>{providerName}</div>
                  {c.insurance_type && (
                    <div style={{ ...sans("12px", "#6B635C"), marginTop: "4px" }}>{c.insurance_type}</div>
                  )}
                </div>
                <div>
                  <div style={{ ...sans("13px", "#A89F96") }}>{dateInfo.value}</div>
                  <div style={{ ...sans("11px", "#6B635C"), marginTop: "2px" }}>{dateInfo.labelText}</div>
                </div>
                <div style={{ ...sans("14px", "#F5F0E8") }}>{formatCurrency(billed)}</div>
                <div
                  style={{
                    ...sans("14px", potential > 0 ? "#7A9E87" : "#6B635C"),
                  }}
                >
                  {potential > 0 ? formatCurrency(potential) : "—"}
                </div>
                <StatusPill c={c} />
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", alignItems: "flex-end" }}>
                  <Link
                    href={`/cases/${c.id}`}
                    style={{
                      ...sans("12px", "#C8A97E"),
                      textDecoration: "none",
                      letterSpacing: "0.1em",
                      transition: "color 0.2s",
                      textAlign: "right",
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#F5F0E8")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#C8A97E")}
                  >
                    View →
                  </Link>
                  {letterCta && (
                    <Link
                      href={`/cases/${c.id}/letter`}
                      style={{
                        ...sans("11px", "#8A7F6E"),
                        textDecoration: "none",
                        letterSpacing: "0.05em",
                        transition: "color 0.2s",
                        textAlign: "right",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#C8A97E")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#8A7F6E")}
                    >
                      {letterCta.label}
                    </Link>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
