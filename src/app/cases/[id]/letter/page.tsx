"use client";

import React, { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import * as Sentry from "@sentry/nextjs";
import { createClient } from "@/lib/supabase/client";
import {
  buildSubstitutionMap,
  getMissingFields,
  todayLongDate,
  type MissingField,
  type MissingFieldKey,
} from "@/lib/letterFields";
import { generateLetterPdf } from "@/lib/letterPdf";

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
  bill_data: { userNotes?: string } | null;
  created_at: string;
  patient_info: PatientInfo | null;
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
  | { kind: "hr" };

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
        isHr(t)
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

function deadlineFrom(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + 30);
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

const SUBMISSION_OPTIONS = [
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

// ─── Patient info panel ──────────────────────────────────────────────────────
function PatientInfoPanel({
  caseId,
  initial,
  defaultOpen,
  onSaved,
}: {
  caseId: string;
  initial: PatientInfo;
  defaultOpen: boolean;
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
    {
      key: "member_id",
      label: "Insurance member ID",
      placeholder: "XYZ123456789",
    },
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
      setSaveError("You need to be signed in to save patient info.");
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
    // Defensive user_id filter in addition to RLS.
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
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [genFailed, setGenFailed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return new URLSearchParams(window.location.search).get("genFailed") === "1";
  });
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);
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

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setFetchError("You need to be signed in to view this case.");
      setLoading(false);
      return;
    }

    // Defensive user_id filter in addition to RLS.
    const { data: caseData, error: caseErr } = await supabase
      .from("cases")
      .select(
        "id, status, provider_name, insurance_type, amount_billed, amount_expected, errors_found, bill_data, created_at, patient_info"
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

  const handleRetry = useCallback(async () => {
    if (!caseRow) return;
    setRetrying(true);
    setRetryError(null);
    try {
      const errors = Array.isArray(caseRow.errors_found) ? caseRow.errors_found : [];
      const userNotes = caseRow.bill_data?.userNotes ?? "";
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
            date_of_service: "",
            userNotes,
          },
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setRetryError(
          json.error ?? "Letter generation is temporarily unavailable. Please try again in a few minutes."
        );
        return;
      }
      setGenFailed(false);
      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        url.searchParams.delete("genFailed");
        window.history.replaceState({}, "", url.toString());
      }
      await load();
    } catch (err) {
      console.error("Letter retry failed:", err);
      Sentry.captureException(err, {
        tags: { location: "letter-page", stage: "retry" },
      });
      setRetryError("Letter generation is temporarily unavailable. Please try again in a few minutes.");
    } finally {
      setRetrying(false);
    }
  }, [caseRow, load]);

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

  // ─── Letter still generating / generation failed ───────────────────────────
  if (!letter) {
    const showFailureState = genFailed || retryError !== null;
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
        {showFailureState ? (
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
          {showFailureState
            ? "Letter generation is temporarily unavailable."
            : "Your letter is being generated."}
        </div>
        <p
          role={showFailureState ? "alert" : undefined}
          style={{ ...sans("14px", "#A89F96"), marginTop: "16px", maxWidth: "420px", lineHeight: 1.65 }}
        >
          {showFailureState
            ? (retryError ?? "Please try again in a few minutes.")
            : "Check back in a moment."}
        </p>
        <div style={{ display: "flex", gap: "12px", marginTop: "32px" }}>
          {showFailureState ? (
            <button
              onClick={handleRetry}
              disabled={retrying || !caseRow}
              style={{
                ...sans("11px", "#0D0D0D"),
                backgroundColor: "#C8A97E",
                padding: "12px 24px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                fontWeight: 500,
                border: "none",
                cursor: retrying ? "wait" : "pointer",
                opacity: retrying ? 0.6 : 1,
              }}
            >
              {retrying ? "Retrying..." : "Retry"}
            </button>
          ) : (
            <button
              onClick={load}
              style={{
                ...sans("11px", "#0D0D0D"),
                backgroundColor: "#C8A97E",
                padding: "12px 24px",
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                fontWeight: 500,
                border: "none",
                cursor: "pointer",
              }}
            >
              Refresh
            </button>
          )}
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
  const deadline = deadlineFrom(letter.generated_at ?? caseRow.created_at);
  const patientInfo = caseRow.patient_info ?? {};
  const patientInfoFilled = Boolean(patientInfo.name?.trim());
  const displayContent = substitutePlaceholders(letter.letter_content, patientInfo, {
    provider_name: caseRow.provider_name,
  });

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
            onClick={() => window.print()}
            style={{
              ...sans("11px", "#A89F96"),
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              border: "1px solid #242424",
              backgroundColor: "transparent",
              padding: "8px 16px",
              cursor: "pointer",
              transition: "color 0.2s, border-color 0.2s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "#F5F0E8";
              e.currentTarget.style.borderColor = "#3A3530";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "#A89F96";
              e.currentTarget.style.borderColor = "#242424";
            }}
          >
            Print
          </button>
          <button
            onClick={() => {
              const missing = getMissingFields(letter.letter_content, {
                name: patientInfo.name,
                address: patientInfo.address,
                account_number: patientInfo.account_number,
                member_id: patientInfo.member_id,
                provider_name: caseRow.provider_name,
              });
              if (missing.length === 0) {
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

      {/* Deadline banner */}
      {deadline && (
        <div
          style={{
            backgroundColor: "#1A1A1A",
            border: "1px solid rgba(200,169,126,0.3)",
            padding: "16px 32px",
            textAlign: "center",
          }}
        >
          <span style={{ ...sans("13px", "#A89F96") }}>
            Submission deadline:{" "}
            <span style={{ color: "#C8A97E", fontWeight: 600 }}>{deadline}</span>
            {" · "}30 days from letter date. File before this date to preserve your dispute rights.
          </span>
        </div>
      )}

      {/* Patient info form */}
      <PatientInfoPanel
        caseId={caseRow.id}
        initial={patientInfo}
        defaultOpen={!patientInfoFilled}
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
          {SUBMISSION_OPTIONS.map((opt, i) => (
            <div
              key={opt.method}
              style={{
                borderBottom: i < SUBMISSION_OPTIONS.length - 1 ? "1px solid #1C1C1C" : "none",
                paddingBottom: i < SUBMISSION_OPTIONS.length - 1 ? "24px" : "0",
                marginBottom: i < SUBMISSION_OPTIONS.length - 1 ? "24px" : "0",
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
          Keep copies of everything you send and note the date submitted. Your insurer is required by law to acknowledge
          receipt within 10 business days and respond within 30.
        </p>
      </motion.div>

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
        <h3 style={{ ...serif("28px", { lineHeight: 1.2 }) }}>Rather not handle this yourself?</h3>
        <p style={{ ...sans("14px", "#A89F96"), lineHeight: 1.75, marginTop: "12px" }}>
          Upgrade to Resolve — we file this letter, handle all insurer communication, and escalate to second-level
          appeal if denied. You pay 25% of what we recover. Nothing if we don&apos;t.
        </p>
        <Link href="/upload?tier=resolve" style={{ textDecoration: "none" }}>
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
            Let ClearClaim handle it →
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
