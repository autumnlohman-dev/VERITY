"use client";

import React, { use, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/client";
import { disputeUnlocked } from "@/lib/entitlements";
import { startSingleDisputeCheckout, startMembershipCheckout } from "@/lib/checkout";
import {
  buildSubstitutionMap,
  getMissingFields,
  hasUnfilledPlaceholders,
  REDUNDANT_ADDRESS_PLACEHOLDERS,
  todayLongDate,
  type MissingField,
  type MissingFieldKey,
} from "@/lib/letterFields";
import { generateLetterPdf } from "@/lib/letterPdf";
import { deadlinesForCase } from "@/lib/deadlines/forCase";
import { isSelfPay } from "@/lib/insuranceMapping";
import { filterOutEmErrors, type EmReview } from "@/lib/emReview";
import type { BillingError } from "@/lib/errorDetection";
import { MailItPanel, type MailState, type MailAddress } from "@/components/MailItPanel";

// ─── Style helpers (exact copy from landing page) ─────────────────────────────
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

// ─── Types ────────────────────────────────────────────────────────────────────
interface PatientInfo {
  name?: string;
  address?: string;
  phone?: string;
  email?: string;
  member_id?: string;
  account_number?: string;
}

interface CaseRow {
  id: string;
  status: string;
  provider_name: string | null;
  insurance_type: string | null;
  amount_billed: number | null;
  amount_expected: number | null;
  errors_found: unknown[] | null;
  bill_data: { userNotes?: string; date_of_service?: string; em_review?: EmReview } | null;
  created_at: string;
  patient_info: PatientInfo | null;
  lob_letter_id: string | null;
  mail_status: string | null;
  mail_test_mode: boolean | null;
  mail_certified: boolean | null;
  mail_expected_delivery: string | null;
  mail_to: Partial<MailAddress> | null;
}

interface LetterRow {
  id: string;
  case_id: string;
  letter_content: string;
  generated_at: string | null;
  sent_at: string | null;
}

// ─── Placeholder substitution ────────────────────────────────────────────────
function substitutePlaceholders(
  content: string,
  info: PatientInfo,
  extras?: { provider_name?: string | null; date_of_service?: string }
): string {
  const map = buildSubstitutionMap({
    name: info.name,
    address: info.address,
    phone: info.phone,
    email: info.email,
    member_id: info.member_id,
    account_number: info.account_number,
    provider_name: extras?.provider_name ?? null,
    date_of_service: extras?.date_of_service,
    today: todayLongDate(),
  });

  // Phone, email, and member ID aren't on the bill and may be left blank.
  // When they are, drop the entire line rather than printing "[Phone Number]"
  // or "[Member ID]" in the final letter.
  const dropLineWhenEmpty = new Set([
    "phone",
    "phone number",
    "telephone",
    "contact phone",
    "email",
    "email address",
    "e-mail",
    "member id",
    "member number",
    "id number",
    "insurance id",
    "subscriber id",
  ]);

  const filteredLines = content.split("\n").filter((line) => {
    const matches = line.matchAll(/\[([^\[\]\n]{2,40})\]/g);
    for (const m of matches) {
      const normalized = m[1].trim().toLowerCase();
      if (dropLineWhenEmpty.has(normalized) && !map[normalized]) {
        return false;
      }
      // Redundant address component line — the full address renders via [ADDRESS].
      if (REDUNDANT_ADDRESS_PLACEHOLDERS.has(normalized)) {
        return false;
      }
    }
    return true;
  });

  let result = filteredLines
    .join("\n")
    .replace(/\[([^\[\]\n]{2,40})\]/g, (match, key: string) => {
      const normalized = key.trim().toLowerCase();
      const replacement = map[normalized];
      if (replacement === undefined) return match;
      return replacement || match;
    });

  // The generate-letter API substitutes "Provider on file" when the case row
  // has no provider_name. Swap that fallback out when the caller supplies an
  // override so the PDF doesn't ship with the placeholder text inlined.
  const providerOverride = extras?.provider_name?.trim();
  if (providerOverride && providerOverride !== "Provider on file") {
    result = result.replace(/Provider on file/g, providerOverride);
  }

  return result;
}

// ─── Markdown renderer (minimal subset: headings, paragraphs, lists, bold, italic) ─
function renderInline(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|__[^_]+__|_[^_]+_)/g;
  let lastIdx = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > lastIdx) parts.push(text.slice(lastIdx, m.index));
    const token = m[0];
    if (token.startsWith("**") || token.startsWith("__")) {
      parts.push(
        <strong key={`${keyPrefix}-b-${key++}`} style={{ color: "#1A1A1A", fontWeight: 600 }}>
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      parts.push(
        <em key={`${keyPrefix}-i-${key++}`}>{token.slice(1, -1)}</em>
      );
    }
    lastIdx = m.index + token.length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts;
}

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "table"; headers: string[]; rows: string[][] }
  | { kind: "hr" };

// A markdown table separator row, e.g. `|---|---|` or `| :-- | --: |`.
function isTableSeparator(line: string): boolean {
  const s = line.trim();
  return /\|/.test(s) && /^[\s|:-]+$/.test(s) && (s.match(/-/g)?.length ?? 0) >= 2;
}

function splitTableRow(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
}

function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];

  const isBullet = (l: string) => /^[-*+]\s+/.test(l);
  const isNumbered = (l: string) => /^\d+\.\s+/.test(l);
  const isHr = (l: string) => /^(-{3,}|_{3,}|\*{3,})$/.test(l);

  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    const trimmed = raw.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    if (isHr(trimmed)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push({ kind: "h3", text: trimmed.slice(4) });
      i++;
      continue;
    }
    if (trimmed.startsWith("## ")) {
      blocks.push({ kind: "h2", text: trimmed.slice(3) });
      i++;
      continue;
    }
    if (trimmed.startsWith("# ")) {
      blocks.push({ kind: "h1", text: trimmed.slice(2) });
      i++;
      continue;
    }

    if (isBullet(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && isBullet(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ul", items });
      continue;
    }

    if (isNumbered(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && isNumbered(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ kind: "ol", items });
      continue;
    }

    // Table: a header row followed by a |---|---| separator, then data rows.
    if (trimmed.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableRow(trimmed);
      i += 2; // consume header + separator
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }

    const paraLines: string[] = [];
    while (i < lines.length) {
      const t = lines[i].trim();
      if (!t) break;
      if (
        t.startsWith("# ") ||
        t.startsWith("## ") ||
        t.startsWith("### ") ||
        isBullet(t) ||
        isNumbered(t) ||
        isHr(t) ||
        (t.includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
      )
        break;
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ kind: "p", text: paraLines.join("\n") });
    }
  }

  return blocks;
}

function MarkdownLetter({ content }: { content: string }) {
  const blocks = parseMarkdown(content);

  const paraText = (text: string, idx: number): React.ReactNode => {
    const segments = text.split("\n");
    return segments.map((seg, j) => (
      <React.Fragment key={`p-${idx}-l-${j}`}>
        {renderInline(seg, `p-${idx}-l-${j}`)}
        {j < segments.length - 1 && <br />}
      </React.Fragment>
    ));
  };

  return (
    <div
      style={{
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
        fontSize: "14px",
        color: "#2A2520",
        lineHeight: 1.8,
      }}
    >
      {blocks.map((b, idx) => {
        switch (b.kind) {
          case "h1":
            return (
              <h1
                key={idx}
                style={{
                  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                  fontSize: "20px",
                  color: "#1A1A1A",
                  fontWeight: 600,
                  margin: "24px 0 12px",
                  lineHeight: 1.3,
                }}
              >
                {renderInline(b.text, `h1-${idx}`)}
              </h1>
            );
          case "h2":
            return (
              <h2
                key={idx}
                style={{
                  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                  fontSize: "17px",
                  color: "#1A1A1A",
                  fontWeight: 600,
                  margin: "20px 0 10px",
                  lineHeight: 1.3,
                }}
              >
                {renderInline(b.text, `h2-${idx}`)}
              </h2>
            );
          case "h3":
            return (
              <h3
                key={idx}
                style={{
                  fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                  fontSize: "14px",
                  color: "#1A1A1A",
                  fontWeight: 600,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: "18px 0 8px",
                  lineHeight: 1.3,
                }}
              >
                {renderInline(b.text, `h3-${idx}`)}
              </h3>
            );
          case "p":
            return (
              <p key={idx} style={{ marginBottom: "16px" }}>
                {paraText(b.text, idx)}
              </p>
            );
          case "ul":
            return (
              <ul
                key={idx}
                style={{
                  margin: "0 0 16px",
                  paddingLeft: "22px",
                  listStyle: "disc",
                }}
              >
                {b.items.map((it, j) => (
                  <li key={j} style={{ marginBottom: "6px" }}>
                    {renderInline(it, `ul-${idx}-${j}`)}
                  </li>
                ))}
              </ul>
            );
          case "ol":
            return (
              <ol
                key={idx}
                style={{
                  margin: "0 0 16px",
                  paddingLeft: "22px",
                  listStyle: "decimal",
                }}
              >
                {b.items.map((it, j) => (
                  <li key={j} style={{ marginBottom: "6px" }}>
                    {renderInline(it, `ol-${idx}-${j}`)}
                  </li>
                ))}
              </ol>
            );
          case "table":
            return (
              <table
                key={idx}
                style={{
                  borderCollapse: "collapse",
                  width: "100%",
                  margin: "0 0 16px",
                  fontSize: "13px",
                }}
              >
                <thead>
                  <tr>
                    {b.headers.map((h, hi) => (
                      <th
                        key={hi}
                        style={{
                          textAlign: "left",
                          borderBottom: "2px solid #D8D2C8",
                          padding: "6px 10px",
                          color: "#1A1A1A",
                          fontWeight: 600,
                        }}
                      >
                        {renderInline(h, `th-${idx}-${hi}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td
                          key={ci}
                          style={{
                            borderBottom: "1px solid #ECE8E1",
                            padding: "6px 10px",
                            verticalAlign: "top",
                            color: "#2A2520",
                          }}
                        >
                          {renderInline(cell, `td-${idx}-${ri}-${ci}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            );
          case "hr":
            return (
              <hr
                key={idx}
                style={{
                  border: "none",
                  borderTop: "1px solid #E5E0DA",
                  margin: "24px 0",
                }}
              />
            );
        }
      })}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatLongDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const INSURED_SUBMISSION_OPTIONS = [
  {
    method: "Submit online",
    color: "#4A90D9",
    detail:
      "Log in to your insurer's member portal, navigate to Claims → Dispute a Charge, and upload this letter with all enclosures as a single PDF. Save the confirmation number.",
  },
  {
    method: "Send by fax",
    color: "#C8A97E",
    detail:
      "Fax this letter to your insurer's claims review line (printed on your insurance card). Include a cover sheet referencing your member ID and claim number. Keep the fax confirmation as proof of delivery.",
  },
  {
    method: "Send by mail",
    color: "#7A9E87",
    detail:
      "Mail to the claims review address on the back of your insurance card. Use certified mail with return receipt so you have dated proof of delivery.",
  },
];

const SELF_PAY_SUBMISSION_OPTIONS = [
  {
    method: "Send to the provider's billing office",
    color: "#7A9E87",
    detail:
      "Mail this letter to the patient billing / accounts-receivable department shown on your itemized statement. Use certified mail with return receipt for dated proof of delivery — or use “Mail it for me” below to have us print and send it.",
  },
  {
    method: "Dispute under the No Surprises Act",
    color: "#4A90D9",
    detail:
      "If your final charges exceed your Good Faith Estimate by $400 or more, you can use the federal Patient-Provider Dispute Resolution process at cms.gov/nosurprises or 1-800-985-3059 — generally within 120 days of the bill.",
  },
  {
    method: "Request itemization and a self-pay discount",
    color: "#C8A97E",
    detail:
      "Ask the billing office in writing for a fully itemized statement and their self-pay / prompt-pay discount and financial-assistance policy before paying any disputed amount.",
  },
];

// ─── Patient info panel ──────────────────────────────────────────────────────
function PatientInfoPanel({
  caseId,
  initial,
  defaultOpen,
  isSelfPay,
  onSaved,
}: {
  caseId: string;
  initial: PatientInfo;
  defaultOpen: boolean;
  isSelfPay: boolean;
  onSaved: (next: PatientInfo) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [form, setForm] = useState<PatientInfo>(initial);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fields: Array<{
    key: keyof PatientInfo;
    label: string;
    placeholder: string;
    multiline?: boolean;
    type?: string;
  }> = [
    { key: "name", label: "Full name", placeholder: "Jane Smith" },
    {
      key: "address",
      label: "Mailing address",
      placeholder: "123 Main St\nApt 4B\nCity, ST 12345",
      multiline: true,
    },
    { key: "phone", label: "Phone", placeholder: "(555) 123-4567", type: "tel" },
    {
      key: "email",
      label: "Email",
      placeholder: "jane@example.com",
      type: "email",
    },
    // Insurance member ID is meaningless for self-pay/uninsured patients — omit it.
    ...(isSelfPay
      ? []
      : [
          {
            key: "member_id" as keyof PatientInfo,
            label: "Insurance member ID",
            placeholder: "From your insurance card",
          },
        ]),
    {
      key: "account_number",
      label: "Provider account number",
      placeholder: "From the bill",
    },
  ];

  async function save() {
    setSaving(true);
    setSaveError(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setSaving(false);
      setSaveError("Your session expired. Please sign in again.");
      return;
    }
    const payload: PatientInfo = {
      name: form.name?.trim() || undefined,
      address: form.address?.trim() || undefined,
      phone: form.phone?.trim() || undefined,
      email: form.email?.trim() || undefined,
      member_id: form.member_id?.trim() || undefined,
      account_number: form.account_number?.trim() || undefined,
    };
    const { error } = await supabase
      .from("cases")
      .update({ patient_info: payload })
      .eq("id", caseId)
      .eq("user_id", user.id);
    setSaving(false);
    if (error) {
      setSaveError(error.message);
      return;
    }
    onSaved(payload);
    setOpen(false);
  }

  const summary = initial.name?.trim()
    ? `${initial.name.trim()}${initial.member_id ? ` · Member #${initial.member_id}` : ""}`
    : "Not yet provided";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      style={{
        maxWidth: "720px",
        margin: "32px auto 0",
        backgroundColor: "#111111",
        border: `1px solid ${defaultOpen ? "rgba(196,124,106,0.4)" : "#242424"}`,
        borderLeft: `4px solid ${defaultOpen ? "#C47C6A" : "#C8A97E"}`,
        padding: "24px 32px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ ...label(defaultOpen ? "#C47C6A" : "#6B635C") }}>
            Your information
          </div>
          <div style={{ ...sans("13px", "#A89F96"), marginTop: "6px" }}>
            {open ? "Fill in to replace the placeholders in the letter." : summary}
          </div>
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            style={{
              ...sans("11px", "#C8A97E"),
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              background: "transparent",
              border: "1px solid #C8A97E",
              padding: "8px 16px",
              cursor: "pointer",
            }}
          >
            Edit
          </button>
        )}
      </div>

      {open && (
        <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          {fields.map((f) => (
            <div key={f.key}>
              <div style={{ ...label("#6B635C"), marginBottom: "6px" }}>{f.label}</div>
              {f.multiline ? (
                <textarea
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  rows={3}
                  style={{
                    width: "100%",
                    backgroundColor: "#0D0D0D",
                    border: "1px solid #2A2A2A",
                    color: "#F5F0E8",
                    padding: "10px 12px",
                    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                    fontSize: "13px",
                    lineHeight: 1.5,
                    resize: "vertical",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              ) : (
                <input
                  type={f.type ?? "text"}
                  value={form[f.key] ?? ""}
                  onChange={(e) => setForm((s) => ({ ...s, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  style={{
                    width: "100%",
                    backgroundColor: "#0D0D0D",
                    border: "1px solid #2A2A2A",
                    color: "#F5F0E8",
                    padding: "10px 12px",
                    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                    fontSize: "13px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              )}
            </div>
          ))}

          {saveError && (
            <p style={{ ...sans("12px", "#C47C6A") }}>{saveError}</p>
          )}

          <div style={{ display: "flex", gap: "12px", marginTop: "4px" }}>
            <button
              onClick={save}
              disabled={saving}
              style={{
                ...sans("11px", "#0D0D0D"),
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                backgroundColor: "#C8A97E",
                border: "none",
                padding: "10px 20px",
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.6 : 1,
                fontWeight: 500,
              }}
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {!defaultOpen && (
              <button
                onClick={() => {
                  setForm(initial);
                  setOpen(false);
                  setSaveError(null);
                }}
                disabled={saving}
                style={{
                  ...sans("11px", "#A89F96"),
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  background: "transparent",
                  border: "1px solid #242424",
                  padding: "10px 20px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Missing-fields modal ────────────────────────────────────────────────────
function MissingFieldsModal({
  fields,
  values,
  onChange,
  onConfirm,
  onCancel,
}: {
  fields: MissingField[];
  values: Record<MissingFieldKey, string>;
  onChange: (key: MissingFieldKey, value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const allFilled = fields.every((f) => values[f.key]?.trim());

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="missing-fields-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        backgroundColor: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 16px",
        overflowY: "auto",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: "100%",
          maxWidth: "520px",
          backgroundColor: "#111111",
          border: "1px solid #242424",
          borderLeft: "4px solid #C8A97E",
          padding: "32px",
          maxHeight: "calc(100vh - 64px)",
          overflowY: "auto",
        }}
      >
        <h2
          id="missing-fields-title"
          style={{
            ...serif("28px", { lineHeight: 1.2 }),
            margin: 0,
          }}
        >
          Complete your letter before downloading.
        </h2>
        <p style={{ ...sans("13px", "#A89F96"), marginTop: "12px", lineHeight: 1.6 }}>
          A few details still need to be filled in. We&rsquo;ll inject them
          into the letter, then generate your PDF.
        </p>

        <div style={{ marginTop: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {fields.map((f) => (
            <div key={f.key}>
              <label htmlFor={`missing-${f.key}`} style={{ ...label("#6B635C"), display: "block", marginBottom: "6px" }}>
                {f.label}
              </label>
              {f.multiline ? (
                <textarea
                  id={`missing-${f.key}`}
                  value={values[f.key] ?? ""}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  rows={3}
                  style={{
                    width: "100%",
                    backgroundColor: "#0D0D0D",
                    border: "1px solid #2A2A2A",
                    color: "#F5F0E8",
                    padding: "10px 12px",
                    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                    fontSize: "13px",
                    lineHeight: 1.5,
                    resize: "vertical",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              ) : (
                <input
                  id={`missing-${f.key}`}
                  type="text"
                  value={values[f.key] ?? ""}
                  onChange={(e) => onChange(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  style={{
                    width: "100%",
                    backgroundColor: "#0D0D0D",
                    border: "1px solid #2A2A2A",
                    color: "#F5F0E8",
                    padding: "10px 12px",
                    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                    fontSize: "13px",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              )}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", gap: "12px", marginTop: "28px", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              ...sans("11px", "#A89F96"),
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              background: "transparent",
              border: "1px solid #242424",
              padding: "10px 20px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!allFilled}
            style={{
              ...sans("11px", "#0D0D0D"),
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              backgroundColor: "#C8A97E",
              border: "none",
              padding: "10px 20px",
              cursor: allFilled ? "pointer" : "not-allowed",
              opacity: allFilled ? 1 : 0.5,
              fontWeight: 500,
            }}
          >
            Confirm and download
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Paywall (dispute package requires purchase or membership) ───────────────
function LetterPaywall({
  caseId,
  confirming,
  onRefresh,
  onUnlocked,
  autoOpenPromo = false,
}: {
  caseId: string;
  confirming: boolean;
  onRefresh: () => void;
  onUnlocked: () => void;
  autoOpenPromo?: boolean;
}) {
  const [promoOpen, setPromoOpen] = useState(autoOpenPromo);
  const [promoCode, setPromoCode] = useState("");
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoSubmitting, setPromoSubmitting] = useState(false);

  async function applyPromo() {
    const code = promoCode.trim();
    if (!code || promoSubmitting) return;
    setPromoSubmitting(true);
    setPromoError(null);
    try {
      const res = await fetch("/api/redeem-promo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, code }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPromoError(
          json.error ?? "That code isn't valid. Double-check it and try again."
        );
        return;
      }
      onUnlocked();
    } catch {
      setPromoError("Something went wrong. Please try again.");
    } finally {
      setPromoSubmitting(false);
    }
  }

  return (
    <div
      style={{
        background: "#0D0D0D",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: "160px",
        paddingLeft: "24px",
        paddingRight: "24px",
        textAlign: "center",
      }}
    >
      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .dot-pulse { animation: pulse-dot 1.5s ease-in-out infinite; }
      `}</style>

      {confirming ? (
        <>
          <div
            className="dot-pulse"
            style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: "#C8A97E", marginBottom: "24px" }}
          />
          <div style={{ ...serif("40px", { lineHeight: 1.1, maxWidth: "460px" }) }}>
            Confirming your payment.
          </div>
          <p style={{ ...sans("14px", "#A89F96"), marginTop: "16px", maxWidth: "420px", lineHeight: 1.65 }}>
            This takes a few seconds. Your dispute package will unlock automatically.
          </p>
          <button
            onClick={onRefresh}
            style={{
              ...sans("11px", "#0D0D0D"),
              backgroundColor: "#C8A97E",
              padding: "12px 24px",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              fontWeight: 500,
              border: "none",
              cursor: "pointer",
              marginTop: "32px",
            }}
          >
            Refresh now
          </button>
        </>
      ) : (
        <>
          <div style={{ ...label("#C8A97E"), marginBottom: "20px" }}>Dispute package locked</div>
          <div style={{ ...serif("44px", { lineHeight: 1.08, maxWidth: "560px" }) }}>
            Your audit is free. The dispute package is the paid part.
          </div>
          <p style={{ ...sans("14px", "#A89F96"), marginTop: "20px", maxWidth: "480px", lineHeight: 1.7 }}>
            The full evidentiary package — insurer-specific dispute letter, regulatory citations,
            submission guide, and deadline tracking — unlocks with a Single Dispute purchase for this
            bill, or with a membership that covers every bill.
          </p>
          <div style={{ display: "flex", gap: "12px", marginTop: "36px", flexWrap: "wrap", justifyContent: "center" }}>
            <button
              onClick={() => startSingleDisputeCheckout(caseId)}
              style={{
                ...sans("11px", "#0D0D0D"),
                backgroundColor: "#C8A97E",
                padding: "16px 32px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
              }}
            >
              Unlock this dispute — $39
            </button>
            <button
              onClick={() => startMembershipCheckout("monthly")}
              style={{
                ...sans("11px", "#C8A97E"),
                background: "transparent",
                border: "1px solid #C8A97E",
                padding: "16px 32px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              Or join membership — $19/mo
            </button>
          </div>

          {/* Promo code */}
          <div style={{ marginTop: "28px", width: "100%", maxWidth: "380px" }}>
            {!promoOpen ? (
              <button
                onClick={() => setPromoOpen(true)}
                style={{
                  ...sans("12px", "#8A7F6E"),
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  textDecoration: "underline",
                  letterSpacing: "0.05em",
                }}
              >
                Have a promo code?
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={promoCode}
                    autoFocus
                    onChange={(e) => {
                      setPromoCode(e.target.value);
                      if (promoError) setPromoError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void applyPromo();
                    }}
                    placeholder="Enter promo code"
                    aria-label="Promo code"
                    style={{
                      flex: 1,
                      backgroundColor: "#0D0D0D",
                      border: `1px solid ${promoError ? "#C47C6A" : "#2A2A2A"}`,
                      color: "#F5F0E8",
                      padding: "12px 14px",
                      fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                      fontSize: "13px",
                      letterSpacing: "0.05em",
                      outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    onClick={() => void applyPromo()}
                    disabled={promoSubmitting || !promoCode.trim()}
                    style={{
                      ...sans("11px", "#0D0D0D"),
                      backgroundColor: "#C8A97E",
                      border: "none",
                      padding: "12px 20px",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      fontWeight: 500,
                      cursor: promoSubmitting || !promoCode.trim() ? "not-allowed" : "pointer",
                      opacity: promoSubmitting || !promoCode.trim() ? 0.5 : 1,
                    }}
                  >
                    {promoSubmitting ? "Applying…" : "Apply"}
                  </button>
                </div>
                {promoError && (
                  <p role="alert" style={{ ...sans("12px", "#C47C6A"), textAlign: "left", margin: 0 }}>
                    {promoError}
                  </p>
                )}
              </div>
            )}
          </div>

          <Link
            href={`/cases/${caseId}`}
            style={{ ...sans("12px", "#6B635C"), textDecoration: "none", marginTop: "32px", letterSpacing: "0.1em" }}
          >
            ← Back to case
          </Link>
        </>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LetterPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  const [loading, setLoading] = useState(true);
  const [caseRow, setCaseRow] = useState<CaseRow | null>(null);
  const [letter, setLetter] = useState<LetterRow | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [paidPending, setPaidPending] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("paid") === "1";
  });
  const [promoHint] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("promo") === "1";
  });
  const [fetchError, setFetchError] = useState<string | null>(null);
  // Letter generation is a synchronous call. `generating` is true while the
  // request is in flight; `genError` holds a failure message. autoTriedRef
  // ensures we auto-kick generation at most once per mount (failures surface a
  // manual Retry rather than auto-looping the Anthropic call).
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("genFailed") === "1"
      ? "Letter generation didn't finish. Try again."
      : null;
  });
  const autoTriedRef = useRef(false);
  const [pendingMissing, setPendingMissing] = useState<MissingField[] | null>(null);
  const [fieldOverrides, setFieldOverrides] = useState<Record<MissingFieldKey, string>>({
    name: "",
    address: "",
    account_number: "",
    member_id: "",
    date_of_service: "",
    provider_name: "",
  });

  const load = useCallback(async () => {
    const supabase = createClient();

    // The dispute package belongs to the case owner. Require a session and
    // always scope by user_id so no one can load another user's case/letter.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setFetchError("Please sign in to view this case.");
      setLoading(false);
      return;
    }

    const { data: caseData, error: caseErr } = await supabase
      .from("cases")
      .select(
        "id, status, provider_name, insurance_type, amount_billed, amount_expected, errors_found, bill_data, created_at, patient_info, lob_letter_id, mail_status, mail_test_mode, mail_certified, mail_expected_delivery, mail_to"
      )
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (caseErr) {
      setFetchError(caseErr.message);
      setLoading(false);
      return;
    }
    if (!caseData) {
      setFetchError("This case does not exist or you don't have access to it.");
      setLoading(false);
      return;
    }
    setCaseRow(caseData as CaseRow);

    // Entitlement: viewing and downloading the dispute package requires an
    // active membership or a paid Single Dispute for this case. The audit
    // (error report) itself is free and lives elsewhere.
    let entitled = false;
    try {
      entitled = await disputeUnlocked(supabase, user.id, id);
    } catch {
      entitled = false;
    }
    setUnlocked(entitled);

    // Letter query is scoped by case_id; ownership was just verified above.
    const { data: letterData, error: letterErr } = await supabase
      .from("dispute_letters")
      .select("*")
      .eq("case_id", id)
      .order("generated_at", { ascending: false })
      .limit(1);

    if (letterErr) {
      setFetchError(letterErr.message);
      setLoading(false);
      return;
    }

    setLetter(letterData && letterData.length > 0 ? (letterData[0] as LetterRow) : null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // load() is async and only calls setState after await points — not
    // synchronously in the effect body — so the rule fires a false positive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // After returning from Stripe Checkout (?paid=1), the webhook that flips the
  // entitlement may lag a second or two. Re-check a few times before giving up
  // and showing the paywall, and clean the query param once we're unlocked.
  useEffect(() => {
    if (unlocked) {
      // Clearing the post-payment flag once unlocked is a one-shot transition,
      // not a render loop — the guard above stops it from re-firing.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (paidPending) setPaidPending(false);
      if (typeof window !== "undefined" && window.location.search.includes("paid=1")) {
        const url = new URL(window.location.href);
        url.searchParams.delete("paid");
        window.history.replaceState({}, "", url.toString());
      }
      return;
    }
    if (!paidPending) return;
    let tries = 0;
    const iv = setInterval(() => {
      tries += 1;
      void load();
      if (tries >= 5) {
        clearInterval(iv);
        setPaidPending(false);
      }
    }, 2000);
    return () => clearInterval(iv);
  }, [paidPending, unlocked, load]);

  // Generate (or regenerate) the dispute letter for this case. This is the
  // single, authoritative trigger: a paying customer who lands here without a
  // letter — whether they paid at the paywall after the E&M flow hit a 402, or
  // simply have no E&M step — gets their letter generated on the spot instead of
  // staring at a "check back" screen that never calls the API.
  const generate = useCallback(async () => {
    if (!caseRow || generating) return;
    setGenerating(true);
    setGenError(null);
    try {
      const allErrors = (Array.isArray(caseRow.errors_found) ? caseRow.errors_found : []) as BillingError[];
      const emReview = caseRow.bill_data?.em_review;
      // Mirror EmReviewPanel: a 'cleared' E&M flag drops the E&M codes from the
      // letter; otherwise every finding is included and a confirmed/borderline
      // review feeds the E&M argument.
      const errors = emReview?.outcome === "cleared" ? filterOutEmErrors(allErrors) : allErrors;
      const res = await fetch("/api/generate-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId: caseRow.id,
          errors,
          caseData: {
            provider_name: caseRow.provider_name ?? "Provider on file",
            insurance_type: caseRow.insurance_type ?? "",
            amount_billed: caseRow.amount_billed ?? 0,
            amount_expected: caseRow.amount_expected ?? 0,
            date_of_service: caseRow.bill_data?.date_of_service ?? "",
            userNotes: caseRow.bill_data?.userNotes ?? "",
          },
          emReview: emReview && emReview.outcome !== "cleared" ? emReview : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          json.error ?? "Letter generation is temporarily unavailable. Please try again in a few minutes.";
        setGenError(msg);
        Sentry.captureMessage("generate-letter failed on letter page", {
          level: "error",
          tags: { location: "letter-page", stage: "generate" },
          extra: { caseId: caseRow.id, status: res.status, body: json },
        });
        return;
      }
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("genFailed");
        window.history.replaceState({}, "", url.toString());
      }
      await load();
    } catch (err) {
      console.error("Letter generation failed:", err);
      Sentry.captureException(err, {
        tags: { location: "letter-page", stage: "generate" },
      });
      setGenError("Letter generation is temporarily unavailable. Please try again in a few minutes.");
    } finally {
      setGenerating(false);
    }
  }, [caseRow, generating, load]);

  // Auto-kick generation once when an entitled user has no letter yet. This is
  // what un-sticks a paid case whose letter was never generated (e.g. the E&M
  // flow hit the paywall, the user paid, and nothing re-triggered generation).
  // On failure genError is set, which blocks the auto-retry and surfaces a
  // manual "Retry generation" button — so we never loop the Anthropic call.
  useEffect(() => {
    if (loading || !unlocked || letter || generating || genError || autoTriedRef.current) return;
    if (!caseRow) return;
    autoTriedRef.current = true;
    void generate();
  }, [loading, unlocked, letter, generating, genError, caseRow, generate]);

  // ─── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          background: "#0D0D0D",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <style>{`
          @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
          .dot-pulse { animation: pulse-dot 1.5s ease-in-out infinite; }
        `}</style>
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
          Loading your letter.
        </div>
      </div>
    );
  }

  // ─── Error / not found ─────────────────────────────────────────────────────
  if (fetchError || !caseRow) {
    return (
      <div
        style={{
          background: "#0D0D0D",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "200px",
          textAlign: "center",
        }}
      >
        <div style={{ ...serif("40px", { lineHeight: 1.1 }) }}>Letter unavailable.</div>
        <p style={{ ...sans("14px", "#A89F96"), marginTop: "16px", maxWidth: "360px" }}>
          {fetchError ?? "We couldn't find this case."}
        </p>
        <Link
          href={`/cases/${id}`}
          style={{ ...sans("12px", "#C8A97E"), textDecoration: "none", marginTop: "32px", letterSpacing: "0.1em" }}
        >
          ← Back to case
        </Link>
      </div>
    );
  }

  // ─── Locked: the dispute package requires a purchase or membership ──────────
  if (!unlocked) {
    return (
      <LetterPaywall
        caseId={caseRow.id}
        confirming={paidPending}
        onRefresh={() => void load()}
        onUnlocked={() => {
          setUnlocked(true);
          void load();
        }}
        autoOpenPromo={promoHint}
      />
    );
  }

  // ─── No letter yet: generating, or generation failed ───────────────────────
  if (!letter) {
    const failed = genError !== null;
    return (
      <div
        style={{
          background: "#0D0D0D",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "200px",
          textAlign: "center",
        }}
      >
        <style>{`
          @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
          .dot-pulse { animation: pulse-dot 1.5s ease-in-out infinite; }
        `}</style>
        {failed ? (
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: "#C47C6A",
              marginBottom: "24px",
            }}
          />
        ) : (
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
        )}
        <div style={{ ...serif("40px", { lineHeight: 1.1 }), maxWidth: "460px" }}>
          {failed ? "We couldn't generate your letter." : "Building your dispute package."}
        </div>
        <p
          role={failed ? "alert" : undefined}
          style={{ ...sans("14px", "#A89F96"), marginTop: "16px", maxWidth: "440px", lineHeight: 1.65 }}
        >
          {failed
            ? `${genError} Your purchase is safe — you can retry as many times as you need.`
            : "This takes up to a minute — drafting your insurer-specific letter, regulatory citations, and evidence. This page updates automatically when it's ready."}
        </p>
        <div style={{ display: "flex", gap: "12px", marginTop: "32px" }}>
          <button
            onClick={() => void generate()}
            disabled={generating}
            style={{
              ...sans("11px", "#0D0D0D"),
              backgroundColor: "#C8A97E",
              padding: "12px 24px",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              fontWeight: 500,
              border: "none",
              cursor: generating ? "wait" : "pointer",
              opacity: generating ? 0.6 : 1,
            }}
          >
            {generating ? "Generating…" : failed ? "Retry generation" : "Generate now"}
          </button>
          <Link href={`/cases/${id}`} style={{ textDecoration: "none" }}>
            <span
              style={{
                ...sans("11px", "#C8A97E"),
                border: "1px solid #C8A97E",
                padding: "12px 24px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                display: "inline-block",
              }}
            >
              Back to case
            </span>
          </Link>
        </div>
      </div>
    );
  }

  // ─── Letter ready ──────────────────────────────────────────────────────────
  const caseShortId = caseRow.id.slice(0, 8).toUpperCase();
  const providerLabel = caseRow.provider_name ?? "Provider on file";
  const generatedDate = formatLongDate(letter.generated_at);
  // L2: derive the submission deadline from the same per-rule calculator the
  // case page's DeadlineTracker uses, instead of a hardcoded letter-date + 30.
  // Show the most pressing one (soonest still-open, else the most overdue).
  // Shared self-pay detection (lib/insuranceMapping) drives BOTH the submission
  // guide and the deadline content, so a self-pay patient gets the GFE/PPDR path
  // in both places instead of insurer cost-sharing guidance.
  const selfPay = isSelfPay(caseRow.insurance_type);
  const caseDeadlines = deadlinesForCase(
    caseRow.bill_data as Record<string, unknown> | null,
    caseRow.provider_name,
    caseRow.id,
    { selfPay }
  );
  const topDeadline =
    caseDeadlines.find((d) => d.daysRemaining >= 0) ?? caseDeadlines[0] ?? null;
  const patientInfo = caseRow.patient_info ?? {};
  const patientInfoFilled = Boolean(patientInfo.name?.trim());
  const submissionOptions = selfPay ? SELF_PAY_SUBMISSION_OPTIONS : INSURED_SUBMISSION_OPTIONS;
  const displayContent = substitutePlaceholders(letter.letter_content, patientInfo, {
    provider_name: caseRow.provider_name,
  });
  // Gate download / print / mail: never ship a letter that still has an unfilled
  // [BRACKET] placeholder. true → safe to download/print/mail.
  const letterReady = !hasUnfilledPlaceholders(displayContent);

  return (
    <div style={{ background: "#0D0D0D", minHeight: "100vh" }}>
      {/* Sticky top bar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          backgroundColor: "rgba(13,13,13,0.95)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid #1C1C1C",
          padding: "16px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Link
          href={`/cases/${id}`}
          style={{ ...sans("12px", "#6B635C"), textDecoration: "none", transition: "color 0.2s" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#A89F96")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#6B635C")}
        >
          ← Case #{caseShortId}
        </Link>
        <span
          className="hidden md:block"
          style={{ ...sans("11px", "#A89F96"), letterSpacing: "0.1em", textTransform: "uppercase" }}
        >
          Dispute Letter · {providerLabel}
        </span>
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <button
            onClick={() => { if (letterReady) window.print(); }}
            disabled={!letterReady}
            title={letterReady ? "" : "Fill in the highlighted details below before printing"}
            style={{
              ...sans("11px", "#A89F96"),
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              border: "1px solid #242424",
              backgroundColor: "transparent",
              padding: "8px 16px",
              cursor: letterReady ? "pointer" : "not-allowed",
              opacity: letterReady ? 1 : 0.45,
              transition: "color 0.2s, border-color 0.2s",
            }}
          >
            Print
          </button>
          <button
            onClick={() => {
              const missing = getMissingFields(
                letter.letter_content,
                {
                  name: patientInfo.name,
                  address: patientInfo.address,
                  account_number: patientInfo.account_number,
                  member_id: patientInfo.member_id,
                  provider_name: caseRow.provider_name,
                },
                { isSelfPay: selfPay }
              );
              if (missing.length === 0 && letterReady) {
                generateLetterPdf(displayContent, `dispute-letter-${caseShortId}.pdf`);
                return;
              }
              setFieldOverrides((prev) => {
                const next = { ...prev };
                for (const f of missing) next[f.key] = "";
                return next;
              });
              setPendingMissing(missing);
            }}
            style={{
              ...sans("11px", "#0D0D0D"),
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              backgroundColor: "#C8A97E",
              border: "none",
              padding: "8px 16px",
              cursor: "pointer",
              fontWeight: 500,
            }}
          >
            Download
          </button>
        </div>
      </div>

      {/* Deadline banner — single source of truth (lib/deadlines/forCase) */}
      {topDeadline && (
        <div
          style={{
            backgroundColor: "#1A1A1A",
            border: "1px solid rgba(200,169,126,0.3)",
            padding: "16px 32px",
            textAlign: "center",
          }}
        >
          <span style={{ ...sans("13px", "#A89F96") }}>
            {topDeadline.deadlineType}:{" "}
            <span style={{ color: "#C8A97E", fontWeight: 600 }}>
              {formatLongDate(topDeadline.deadlineDate)}
            </span>
            {" · "}
            {topDeadline.daysRemaining < 0
              ? "This deadline has passed — act immediately to preserve your dispute rights."
              : "File before this date to preserve your dispute rights."}
          </span>
        </div>
      )}

      {/* Patient info form */}
      <PatientInfoPanel
        caseId={caseRow.id}
        initial={patientInfo}
        defaultOpen={!patientInfoFilled}
        isSelfPay={selfPay}
        onSaved={(next) =>
          setCaseRow((prev) => (prev ? { ...prev, patient_info: next } : prev))
        }
      />

      {/* Document container */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1] }}
        style={{
          maxWidth: "720px",
          margin: "32px auto 0",
          backgroundColor: "#ffffff",
          paddingTop: "64px",
          paddingBottom: "48px",
          paddingLeft: "64px",
          paddingRight: "64px",
          boxShadow: "0 32px 80px rgba(0,0,0,0.7)",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: "11px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            color: "#8A8077",
            marginBottom: "24px",
          }}
        >
          Generated {generatedDate} · Case #{caseShortId}
        </div>

        <MarkdownLetter content={displayContent} />
      </motion.div>

      {/* Submission instructions */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.15 }}
        style={{
          maxWidth: "720px",
          margin: "32px auto 0",
          backgroundColor: "#111111",
          border: "1px solid #242424",
          padding: "32px",
        }}
      >
        <div style={{ ...label("#6B635C"), marginBottom: "32px" }}>How to submit this letter</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {submissionOptions.map((opt, i) => (
            <div
              key={opt.method}
              style={{
                borderBottom: i < submissionOptions.length - 1 ? "1px solid #1C1C1C" : "none",
                paddingBottom: i < submissionOptions.length - 1 ? "24px" : "0",
                marginBottom: i < submissionOptions.length - 1 ? "24px" : "0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
                <div
                  style={{
                    width: "10px",
                    height: "10px",
                    backgroundColor: opt.color,
                    flexShrink: 0,
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                    fontSize: "14px",
                    color: "#F5F0E8",
                    fontWeight: 500,
                  }}
                >
                  {opt.method}
                </span>
              </div>
              <p style={{ ...sans("13px", "#A89F96"), lineHeight: 1.65 }}>{opt.detail}</p>
            </div>
          ))}
        </div>
        <p style={{ ...sans("12px", "#6B635C"), fontStyle: "italic", marginTop: "24px", lineHeight: 1.65 }}>
          {selfPay
            ? "Keep copies of everything you send and note the date submitted. Request a written response and an itemized, corrected statement before paying any disputed amount."
            : "Keep copies of everything you send and note the date submitted. Your insurer is required by law to acknowledge receipt within 10 business days and respond within 30."}
        </p>
      </motion.div>

      {/* Mail it for me (Lob) — blocked until the letter has no [placeholders] */}
      {caseRow.lob_letter_id || letterReady ? (
        <MailItPanel
          caseId={caseRow.id}
          providerName={caseRow.provider_name}
          patientInfo={{ name: patientInfo.name, address: patientInfo.address }}
          initial={{
            lobLetterId: caseRow.lob_letter_id,
            status: caseRow.mail_status,
            testMode: !!caseRow.mail_test_mode,
            certified: !!caseRow.mail_certified,
            expectedDelivery: caseRow.mail_expected_delivery,
            to: caseRow.mail_to,
          }}
          onMailed={(next: MailState) =>
            setCaseRow((prev) =>
              prev
                ? {
                    ...prev,
                    lob_letter_id: next.lobLetterId,
                    mail_status: next.status,
                    mail_test_mode: next.testMode,
                    mail_certified: next.certified,
                    mail_expected_delivery: next.expectedDelivery,
                  }
                : prev
            )
          }
        />
      ) : (
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
          <div style={{ ...serif("22px") }}>Complete your letter to mail it.</div>
          <p style={{ ...sans("13px", "#A89F96"), marginTop: "10px", lineHeight: 1.65, maxWidth: "560px" }}>
            Your letter still has details to fill in. Add your information above (look for the
            highlighted fields), and the “Mail it for me” option will unlock — so we never mail a
            letter with blank placeholders.
          </p>
        </div>
      )}

      {/* Upsell card */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.25, 0.1, 0.25, 1], delay: 0.25 }}
        style={{
          maxWidth: "720px",
          margin: "16px auto 96px",
          backgroundColor: "#111111",
          border: "1px solid rgba(200,169,126,0.4)",
          padding: "32px",
        }}
      >
        <h3 style={{ ...serif("28px", { lineHeight: 1.2 }) }}>Watch every future bill?</h3>
        <p style={{ ...sans("14px", "#A89F96"), lineHeight: 1.75, marginTop: "12px" }}>
          With a membership, every new bill or EOB you upload is audited automatically, you get unlimited
          dispute and escalation letters, and we track deadlines so nothing slips. $19/mo or $149/yr.
        </p>
        <Link href="/pricing" style={{ textDecoration: "none" }}>
          <span
            style={{
              ...sans("11px", "#0D0D0D"),
              backgroundColor: "#C8A97E",
              padding: "16px 32px",
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              fontWeight: 500,
              display: "inline-block",
              marginTop: "24px",
              transition: "opacity 0.2s",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLSpanElement).style.opacity = "0.85")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLSpanElement).style.opacity = "1")}
          >
            See membership →
          </span>
        </Link>
      </motion.div>

      {pendingMissing && (
        <MissingFieldsModal
          fields={pendingMissing}
          values={fieldOverrides}
          onChange={(key, value) =>
            setFieldOverrides((prev) => ({ ...prev, [key]: value }))
          }
          onCancel={() => setPendingMissing(null)}
          onConfirm={() => {
            const mergedInfo: PatientInfo = {
              ...patientInfo,
              name: fieldOverrides.name?.trim() || patientInfo.name,
              address: fieldOverrides.address?.trim() || patientInfo.address,
              account_number:
                fieldOverrides.account_number?.trim() || patientInfo.account_number,
              member_id: fieldOverrides.member_id?.trim() || patientInfo.member_id,
            };
            const finalContent = substitutePlaceholders(letter.letter_content, mergedInfo, {
              provider_name:
                fieldOverrides.provider_name?.trim() || caseRow.provider_name,
              date_of_service: fieldOverrides.date_of_service?.trim() || undefined,
            });
            generateLetterPdf(finalContent, `dispute-letter-${caseShortId}.pdf`);
            setPendingMissing(null);
          }}
        />
      )}
    </div>
  );
}
