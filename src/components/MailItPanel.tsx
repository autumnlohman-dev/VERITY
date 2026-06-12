"use client";

import { useState } from "react";

// "Mail it for me" — collects the recipient (provider billing) and return
// (patient) addresses, an optional certified-mail flag, and an explicit confirm,
// then calls /api/mail-letter (which verifies ownership + entitlement, runs Lob
// address verification, and creates the physical letter). After sending, shows
// the mail status. In Lob test mode the status is clearly labelled TEST MODE so
// no one believes real mail went out.

const sans = (size: string, color: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
  fontSize: size,
  color,
  ...extra,
});
const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-cormorant), Georgia, serif",
  fontSize: size,
  color: "#F5F0E8",
  lineHeight: 1.2,
  fontWeight: 400,
  ...extra,
});
const labelStyle = (color = "#6B635C"): React.CSSProperties => ({
  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
  fontSize: "11px",
  letterSpacing: "0.25em",
  textTransform: "uppercase" as const,
  color,
});

export interface MailAddress {
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  zip: string;
}

export interface MailState {
  lobLetterId: string | null;
  status: string | null;
  testMode: boolean;
  certified: boolean;
  expectedDelivery: string | null;
  to: Partial<MailAddress> | null;
}

const EMPTY: MailAddress = { name: "", line1: "", line2: "", city: "", state: "", zip: "" };

// Best-effort parse of a free-text multi-line address into structured fields.
// Always editable afterward, so a wrong guess is harmless.
function parseAddress(raw: string | undefined, name: string): MailAddress {
  const a: MailAddress = { ...EMPTY, name };
  if (!raw) return a;
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length) a.line1 = lines[0];
  const last = lines[lines.length - 1] ?? "";
  const m = last.match(/^(.*?),?\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/);
  if (m && lines.length > 1) {
    a.city = m[1].trim();
    a.state = m[2].toUpperCase();
    a.zip = m[3];
    if (lines.length > 2) a.line2 = lines[1];
  }
  return a;
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function AddressFields({
  title,
  value,
  onChange,
}: {
  title: string;
  value: MailAddress;
  onChange: (next: MailAddress) => void;
}) {
  const set = (k: keyof MailAddress) => (e: React.ChangeEvent<HTMLInputElement>) =>
    onChange({ ...value, [k]: e.target.value });
  const inputStyle: React.CSSProperties = {
    width: "100%",
    backgroundColor: "#0D0D0D",
    border: "1px solid #2A2A2A",
    color: "#F5F0E8",
    padding: "10px 12px",
    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
  };
  return (
    <div style={{ flex: 1, minWidth: "240px" }}>
      <div style={{ ...labelStyle("#C8A97E"), marginBottom: "12px" }}>{title}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <input style={inputStyle} placeholder="Name" value={value.name} onChange={set("name")} aria-label={`${title} name`} />
        <input style={inputStyle} placeholder="Street address" value={value.line1} onChange={set("line1")} aria-label={`${title} street`} />
        <input style={inputStyle} placeholder="Suite / unit (optional)" value={value.line2} onChange={set("line2")} aria-label={`${title} unit`} />
        <div style={{ display: "flex", gap: "8px" }}>
          <input style={{ ...inputStyle, flex: 2 }} placeholder="City" value={value.city} onChange={set("city")} aria-label={`${title} city`} />
          <input style={{ ...inputStyle, flex: 1 }} placeholder="ST" maxLength={2} value={value.state} onChange={set("state")} aria-label={`${title} state`} />
          <input style={{ ...inputStyle, flex: 1 }} placeholder="ZIP" value={value.zip} onChange={set("zip")} aria-label={`${title} ZIP`} />
        </div>
      </div>
    </div>
  );
}

export function MailItPanel({
  caseId,
  providerName,
  patientInfo,
  initial,
  onMailed,
}: {
  caseId: string;
  providerName: string | null;
  patientInfo: { name?: string; address?: string };
  initial: MailState;
  onMailed: (next: MailState) => void;
}) {
  const [to, setTo] = useState<MailAddress>(() => ({ ...EMPTY, name: providerName ?? "" }));
  const [from, setFrom] = useState<MailAddress>(() => parseAddress(patientInfo.address, patientInfo.name ?? ""));
  const [certified, setCertified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<MailAddress | null>(null);

  // Already mailed → status card.
  if (initial.lobLetterId) {
    const delivery = fmtDate(initial.expectedDelivery);
    return (
      <Wrapper>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ ...serif("22px") }}>Letter sent to mail.</div>
          {initial.testMode && (
            <span
              style={{
                ...sans("10px", "#0D0D0D", { letterSpacing: "0.15em", textTransform: "uppercase", fontWeight: 600 }),
                backgroundColor: "#C8A97E",
                padding: "3px 10px",
              }}
            >
              Test mode
            </span>
          )}
        </div>
        <p style={{ ...sans("13px", "#A89F96"), marginTop: "10px", lineHeight: 1.65 }}>
          {initial.testMode
            ? "This was created in test mode — no physical letter was actually printed or mailed. Connect a live mail key to send for real."
            : `Your dispute letter has been handed off for printing and first-class${initial.certified ? ", certified" : ""} mail.`}
        </p>
        <div style={{ ...sans("12px", "#6B635C"), marginTop: "12px", lineHeight: 1.8 }}>
          {delivery && !initial.testMode && <div>Estimated delivery: {delivery}</div>}
          {initial.certified && <div>Certified mail — tracking and proof of delivery included.</div>}
          <div>Reference: {initial.lobLetterId}</div>
        </div>
      </Wrapper>
    );
  }

  async function send() {
    setSubmitting(true);
    setError(null);
    setSuggestion(null);
    try {
      const res = await fetch("/api/mail-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, to, from, certified }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 422 && json.code === "undeliverable") {
          setError(json.error || "The provider's address couldn't be verified as deliverable.");
          if (json.suggestion) {
            setSuggestion({
              name: to.name,
              line1: json.suggestion.line1 ?? to.line1,
              line2: json.suggestion.line2 ?? "",
              city: json.suggestion.city ?? to.city,
              state: json.suggestion.state ?? to.state,
              zip: json.suggestion.zip ?? to.zip,
            });
          }
          return;
        }
        if (res.status === 409 && json.alreadyMailed) {
          // Someone already mailed it (e.g. another tab) — reflect that.
          onMailed({ ...initial, lobLetterId: "sent", status: "submitted" });
          return;
        }
        setError(json.error || "We couldn't send this letter. Please try again.");
        return;
      }
      onMailed({
        lobLetterId: json.lobLetterId,
        status: json.status,
        testMode: !!json.testMode,
        certified: !!json.certified,
        expectedDelivery: json.expectedDeliveryDate ?? null,
        to,
      });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  const canSend = to.name && to.line1 && to.city && to.state && to.zip && from.name && from.line1 && from.city && from.state && from.zip;

  return (
    <Wrapper>
      <div style={{ ...labelStyle("#6B635C"), marginBottom: "8px" }}>Mail it for me</div>
      <div style={{ ...serif("26px") }}>Let us print and mail it for you.</div>
      <p style={{ ...sans("13px", "#A89F96"), marginTop: "10px", lineHeight: 1.7, maxWidth: "560px" }}>
        We&apos;ll print your dispute letter and send a <strong style={{ color: "#F5F0E8" }}>physical letter</strong> to
        the provider&apos;s billing office by first-class mail. Confirm both addresses below — we verify the
        recipient address before anything is mailed.
      </p>

      <div style={{ display: "flex", gap: "24px", flexWrap: "wrap", marginTop: "24px" }}>
        <AddressFields title="To — provider billing" value={to} onChange={setTo} />
        <AddressFields title="From — your return address" value={from} onChange={setFrom} />
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "20px", cursor: "pointer" }}>
        <input type="checkbox" checked={certified} onChange={(e) => setCertified(e.target.checked)} />
        <span style={{ ...sans("13px", "#A89F96") }}>
          Send as <strong style={{ color: "#F5F0E8" }}>certified mail</strong> (tracking + proof of delivery)
        </span>
      </label>

      {error && (
        <div style={{ marginTop: "16px" }}>
          <p role="alert" style={{ ...sans("13px", "#C47C6A"), lineHeight: 1.6 }}>{error}</p>
          {suggestion && (
            <button
              onClick={() => {
                setTo(suggestion);
                setSuggestion(null);
                setError(null);
              }}
              style={{
                ...sans("11px", "#C8A97E", { letterSpacing: "0.1em" }),
                background: "transparent",
                border: "1px solid #C8A97E",
                padding: "8px 14px",
                marginTop: "8px",
                cursor: "pointer",
              }}
            >
              Use suggested: {suggestion.line1}, {suggestion.city} {suggestion.state} {suggestion.zip}
            </button>
          )}
        </div>
      )}

      <button
        onClick={send}
        disabled={!canSend || submitting}
        style={{
          ...sans("11px", "#0D0D0D", { letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 500 }),
          backgroundColor: canSend && !submitting ? "#C8A97E" : "#2A2A2A",
          color: canSend && !submitting ? "#0D0D0D" : "#6B635C",
          border: "none",
          padding: "14px 28px",
          marginTop: "24px",
          cursor: canSend && !submitting ? "pointer" : "not-allowed",
        }}
      >
        {submitting ? "Sending…" : "Confirm and mail this letter"}
      </button>
      <p style={{ ...sans("11px", "#6B635C"), fontStyle: "italic", marginTop: "12px" }}>
        A physical letter will be printed and mailed. This action can&apos;t be undone once submitted.
      </p>
    </Wrapper>
  );
}

function Wrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        maxWidth: "720px",
        margin: "32px auto 0",
        backgroundColor: "#111111",
        border: "1px solid #242424",
        borderLeft: "4px solid #C8A97E",
        padding: "32px",
      }}
    >
      {children}
    </div>
  );
}
