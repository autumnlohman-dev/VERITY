"use client";

import React, { useState, useRef, Suspense } from "react";
import type { DragEvent, ChangeEvent } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, CheckCircle, Camera } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { saveGuestClaim } from "@/lib/guestClaim";
import { AuditProgress } from "@/components/AuditProgress";
import type { CBSDiscrepancy } from "@/lib/cbs/schema";
import { MAX_PAGES_PER_DOC, MAX_TOTAL_DOC_BYTES, isMergeableExt } from "@/lib/documents/limits";
import { MANUAL_REVIEW_ERROR_TYPES } from "@/lib/audit/manualReview";
import { BRAND_NAME } from "@/lib/brand";

// ─── Style helpers (exact copy from landing page) ─────────────────────────────
const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-lora), Georgia, serif",
  
  letterSpacing: "-0.015em",
  fontSize: size,
  color: "#221C14",
  lineHeight: 1,
  fontWeight: 400,
  ...extra,
});

const sans = (size: string, color = "#5F5648", extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-public-sans), system-ui, sans-serif",
  fontSize: size,
  color,
  ...extra,
});

const label = (color = "var(--brand)"): React.CSSProperties => ({
  fontFamily: "var(--font-public-sans), system-ui, sans-serif",
  fontSize: "11px",
  letterSpacing: "0.25em",
  textTransform: "uppercase" as const,
  color,
});

// ─── Nav (copied from landing page) ──────────────────────────────────────────
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
        padding: "20px 64px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Link href="/" style={{ textDecoration: "none", display: "flex", alignItems: "center" }}>
        <span
          style={{
            ...sans("15px", "#221C14"),
            letterSpacing: "0.42em",
            textTransform: "uppercase",
            fontWeight: 300,
            paddingLeft: "0.42em",
            lineHeight: 1,
          }}
        >
          {BRAND_NAME}
        </span>
      </Link>
      <div className="hidden md:flex" style={{ gap: "40px" }}>
        {[
          { label: "How it works", href: "/how-it-works" },
          { label: "Pricing", href: "/pricing" },
          { label: "FAQ", href: "#faq" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            style={{
              ...sans("11px", "#5F5648"),
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              textDecoration: "none",
              transition: "color 0.2s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#221C14")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#5F5648")}
          >
            {link.label}
          </Link>
        ))}
      </div>
      <Link href="/upload" style={{ textDecoration: "none" }}>
        <span
          style={{
            ...sans("11px", "#221C14"),
            backgroundColor: "var(--brand-fill)",
            padding: "12px 24px",
            letterSpacing: "0.2em",
            textTransform: "uppercase",
            fontWeight: 500,
            display: "inline-block",
          }}
        >
          Check my bill →
        </span>
      </Link>
    </nav>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
// Each bill/EOB slot holds an ORDERED list of page files: multiple files on one
// slot are pages of a single document, merged server-side in this order before
// extraction. We hold the actual File objects so they survive across steps and
// reach the backend. (The DropZones for step 1 unmount on later steps, so we
// cannot recover files from a DOM <input> at submit time.)
type PageFile = {
  id: string;
  file: File;
  // Eager per-file upload to storage: 'uploading' → 'done' (path set) or
  // 'error' (retry button). Files stuck without a path fall back to inline
  // base64 at submit when small enough.
  status: "uploading" | "done" | "error";
  path: string | null;
};

const MAX_PAGE_BYTES = 20 * 1024 * 1024;

function newPageId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

// Per-file validation + batch caps. Returns the entries to add and the first
// rejection message (if any) so the zone can show why something was dropped.
function validateAdd(existing: PageFile[], incoming: File[]): { accepted: File[]; rejection: string | null } {
  const accepted: File[] = [];
  let rejection: string | null = null;
  let count = existing.length;
  let totalBytes = existing.reduce((s, e) => s + e.file.size, 0);
  for (const f of incoming) {
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!isMergeableExt(ext)) {
      rejection = rejection ?? `"${f.name}" isn't a supported type. Use PDF, JPG, PNG, or HEIC.`;
      continue;
    }
    if (f.size > MAX_PAGE_BYTES) {
      rejection = rejection ?? `"${f.name}" is too large (20 MB max per file).`;
      continue;
    }
    if (count >= MAX_PAGES_PER_DOC) {
      rejection = rejection ?? `A document can have at most ${MAX_PAGES_PER_DOC} files.`;
      break;
    }
    if (totalBytes + f.size > MAX_TOTAL_DOC_BYTES) {
      rejection = rejection ?? "Those files together exceed the 20 MB document limit.";
      continue;
    }
    accepted.push(f);
    count += 1;
    totalBytes += f.size;
  }
  return { accepted, rejection };
}

type GuestError = {
  cpt_code: string;
  description: string;
  explanation: string;
  rule_violated: string;
  billed_amount: number;
  expected_amount: number;
  confidence: string;
  error_type?: string;
};

type GuestAudit = {
  provider: string | null;
  errors: GuestError[];
  errorCount: number;
  needsReviewCount?: number;
  totalBilled: number;
  potentialSavings: number;
  hasEob?: boolean;
  eobError?: boolean;
  crossDocumentDiscrepancies?: CBSDiscrepancy[];
};

// Findings the audit couldn't price (e.g. proprietary facility codes) and
// informational coding observations aren't overcharges — never summed into
// recoverable. Shared definition with the server pipeline (imported above).

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

// Stable per-browser id for guests (who have no account). Scopes a guest's
// storage uploads to their own folder so files stay isolated, and survives the
// audit round trip in localStorage.
function getGuestSessionId(): string {
  const KEY = "guestSessionId";
  try {
    const existing = localStorage.getItem(KEY);
    if (existing && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(existing)) {
      return existing;
    }
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

// Upload a bill/EOB straight to Supabase Storage via a server-minted signed URL.
// The bytes go browser → Supabase directly, bypassing Vercel's ~4.5 MB request
// body limit, so large scanned PDFs and phone photos work. Returns the storage
// path the audit route downloads from, or null if the upload couldn't be set up
// (the caller then falls back to inline base64, which still works for small files).
async function uploadToBills(
  supabase: ReturnType<typeof createClient>,
  file: File,
  slot: "bill" | "eob",
  guestSessionId: string | null,
): Promise<string | null> {
  try {
    const res = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot, fileName: file.name, guestSessionId }),
    });
    if (!res.ok) return null;
    const { path, token } = await res.json();
    if (typeof path !== "string" || typeof token !== "string") return null;
    const { error } = await supabase.storage.from("bills").uploadToSignedUrl(path, token, file);
    if (error) {
      console.error("Storage upload error:", error);
      return null;
    }
    return path;
  } catch (e) {
    console.error("Storage upload error:", e);
    return null;
  }
}

// ─── Step Indicator ───────────────────────────────────────────────────────────
function StepIndicator({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1 as const, lbl: "Upload documents" },
    { n: 2 as const, lbl: "Your situation" },
    { n: 3 as const, lbl: "Choose your path" },
  ];

  return (
    <div style={{ marginBottom: "48px" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        {steps.map((s, i) => {
          const isDone = s.n < step;
          const isActive = s.n === step;
          return (
            <React.Fragment key={s.n}>
              <div
                style={{
                  width: "28px",
                  height: "28px",
                  borderRadius: "50%",
                  border: `1px solid ${isActive ? "#C8A97E" : isDone ? "#5E7E66" : "#CFC6B4"}`,
                  backgroundColor: isActive ? "#C8A97E" : isDone ? "#5E7E66" : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <span
                  style={{
                    ...sans("11px", isActive || isDone ? "#221C14" : "#8A7F6E"),
                    fontWeight: 600,
                  }}
                >
                  {isDone ? "✓" : s.n}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div
                  style={{
                    flex: 1,
                    height: "1px",
                    backgroundColor: "#CFC6B4",
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "8px",
        }}
      >
        {steps.map((s) => {
          const isDone = s.n < step;
          const isActive = s.n === step;
          return (
            <div
              key={s.n}
              style={{
                ...sans("11px", isActive ? "#221C14" : isDone ? "#5E7E66" : "#8A7F6E"),
                textAlign: s.n === 1 ? "left" : s.n === 3 ? "right" : "center",
                width: "33%",
              }}
            >
              {s.lbl}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── DropZone (multi-file: N files = N pages of one document) ──────────────────
function DropZone({
  zonelabel,
  sublabel,
  required,
  files,
  zoneError,
  onAdd,
  onRemove,
  onMove,
  onRetry,
}: {
  zonelabel: string;
  sublabel: string;
  required: boolean;
  files: PageFile[];
  zoneError: string | null;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onRetry: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const hasFiles = files.length > 0;

  const handleFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    onAdd(Array.from(list));
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(true);
  };

  const onDragLeave = () => setDragging(false);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  };

  const borderColor = hasFiles
    ? "rgba(122,158,135,0.6)"
    : dragging
    ? "rgba(200,169,126,0.4)"
    : "#CFC6B4";

  const bgColor = hasFiles ? "rgba(122,158,135,0.05)" : dragging ? "rgba(200,169,126,0.03)" : "#221C14";

  const iconBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "2px 4px",
    lineHeight: 1,
  };

  return (
    <div
      onClick={() => !hasFiles && inputRef.current?.click()}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      style={{
        border: `1px dashed ${borderColor}`,
        backgroundColor: bgColor,
        padding: "32px",
        cursor: hasFiles ? "default" : "pointer",
        transition: "border-color 0.2s, background-color 0.2s",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.heic,.heif"
        style={{ display: "none" }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          handleFiles(e.target.files);
          // Allow re-selecting the same file after a remove.
          e.target.value = "";
        }}
      />
      {hasFiles ? (
        <div>
          {files.map((pf, i) => (
            <div
              key={pf.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "6px 0",
                borderBottom: i < files.length - 1 ? "1px solid rgba(122,158,135,0.2)" : "none",
              }}
            >
              {files.length > 1 && (
                <span style={{ ...sans("11px", "#8A7F6E"), width: "16px", flexShrink: 0 }}>{i + 1}</span>
              )}
              {pf.status === "done" ? (
                <CheckCircle size={18} color="#5E7E66" style={{ flexShrink: 0 }} />
              ) : pf.status === "uploading" ? (
                <span
                  style={{
                    width: "14px",
                    height: "14px",
                    flexShrink: 0,
                    border: "2px solid #C8A97E",
                    borderTopColor: "transparent",
                    borderRadius: "50%",
                    display: "inline-block",
                    animation: "spin 0.8s linear infinite",
                  }}
                />
              ) : (
                <span style={{ ...sans("14px", "#B0604C"), flexShrink: 0, lineHeight: 1 }}>!</span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...sans("13px", "#221C14"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {pf.file.name}
                </div>
                <div style={{ ...sans("11px", pf.status === "error" ? "#B0604C" : "#8A7F6E"), marginTop: "1px" }}>
                  {pf.status === "error" ? "Upload failed" : formatSize(pf.file.size)}
                </div>
              </div>
              {pf.status === "error" && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRetry(pf.id); }}
                  style={{ ...iconBtn, ...sans("11px", "var(--brand)"), letterSpacing: "0.08em", textTransform: "uppercase" }}
                >
                  Retry
                </button>
              )}
              {files.length > 1 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); onMove(pf.id, -1); }}
                    disabled={i === 0}
                    aria-label="Move page up"
                    style={{ ...iconBtn, ...sans("13px", i === 0 ? "#CFC6B4" : "#8A7F6E"), cursor: i === 0 ? "default" : "pointer" }}
                  >
                    ↑
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onMove(pf.id, 1); }}
                    disabled={i === files.length - 1}
                    aria-label="Move page down"
                    style={{ ...iconBtn, ...sans("13px", i === files.length - 1 ? "#CFC6B4" : "#8A7F6E"), cursor: i === files.length - 1 ? "default" : "pointer" }}
                  >
                    ↓
                  </button>
                </>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); onRemove(pf.id); }}
                aria-label="Remove file"
                style={{ ...iconBtn, ...sans("16px", "#8A7F6E") }}
              >
                ×
              </button>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "12px" }}>
            <button
              onClick={(e) => { e.stopPropagation(); inputRef.current?.click(); }}
              style={{ ...iconBtn, ...sans("11px", "var(--brand)"), letterSpacing: "0.12em", textTransform: "uppercase", padding: 0 }}
            >
              + Add pages
            </button>
            {files.length > 1 && (
              <span style={{ ...sans("11px", "#8A7F6E") }}>
                Combined as one document, in this order
              </span>
            )}
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center" }}>
          <Upload size={28} color="#CFC6B4" style={{ margin: "0 auto 12px", display: "block" }} />
          <div style={{ ...serif("20px", { color: "#8A7F6E", lineHeight: 1.2 }) }}>
            {zonelabel}
            {required && <span style={{ color: "var(--brand)", marginLeft: "4px" }}>*</span>}
          </div>
          <div style={{ ...sans("12px", "#8A7F6E"), marginTop: "4px" }}>
            {sublabel}
          </div>
          <div style={{ ...sans("12px", "#C9BFAC"), marginTop: "8px" }}>
            Drop here, or click to browse, PDF, JPG, PNG, HEIC · multiple pages OK
          </div>
          <div
            style={{
              ...sans("11px", "#C9BFAC"),
              marginTop: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
            }}
          >
            <Camera size={12} color="#C9BFAC" />
            or take a photo
          </div>
        </div>
      )}
      {zoneError && (
        <p style={{ ...sans("12px", "#B0604C"), marginTop: "10px", marginBottom: 0 }}>{zoneError}</p>
      )}
    </div>
  );
}

// ─── Radio Card ───────────────────────────────────────────────────────────────
function RadioCard({
  option,
  selected,
  onSelect,
}: {
  option: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      style={{
        padding: "10px 16px",
        border: `1px solid ${selected ? "#C8A97E" : "#D8CFBE"}`,
        backgroundColor: selected ? "rgba(200,169,126,0.08)" : "#F4EFE6",
        cursor: "pointer",
        ...sans("13px", selected ? "#221C14" : "#5F5648"),
        transition: "border-color 0.2s, background-color 0.2s",
      }}
      onMouseEnter={(e) => {
        if (!selected)
          (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(200,169,126,0.4)";
      }}
      onMouseLeave={(e) => {
        if (!selected)
          (e.currentTarget as HTMLDivElement).style.borderColor = "#D8CFBE";
      }}
    >
      {option}
    </div>
  );
}

// ─── Inner component (uses useSearchParams) ───────────────────────────────────
function UploadPageInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tier, setTier] = useState<"audit" | "dispute" | "membership" | null>(() => {
    const param = searchParams.get("tier");
    return param === "audit" || param === "dispute" || param === "membership" ? param : null;
  });
  const [billFiles, setBillFiles] = useState<PageFile[]>([]);
  const [eobFiles, setEobFiles] = useState<PageFile[]>([]);
  const [billZoneError, setBillZoneError] = useState<string | null>(null);
  const [eobZoneError, setEobZoneError] = useState<string | null>(null);
  const [careType, setCareType] = useState<string | null>(null);
  const [insuranceType, setInsuranceType] = useState<string | null>(null);
  const [gfe, setGfe] = useState<string | null>(null);
  const [userNotes, setUserNotes] = useState<string>("");
  // 'form' = collecting inputs; 'running' = audit in flight (staged progress UI);
  // 'error' = audit failed (progress UI resolves to a retry, never a dead spinner).
  const [phase, setPhase] = useState<"form" | "running" | "error">("form");
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [guestResults, setGuestResults] = useState<GuestAudit | null>(null);
  const loading = phase === "running";

  // ── Per-slot multi-file handlers ─────────────────────────────────────────
  // Files upload to storage EAGERLY on add (per-file status + retry), so by
  // submit time most pages already have a storage path and never touch the
  // request body. Order in the array is the page order of the merged document.
  const startUpload = async (
    slot: "bill" | "eob",
    setFiles: React.Dispatch<React.SetStateAction<PageFile[]>>,
    entry: PageFile,
  ) => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const path = await uploadToBills(supabase, entry.file, slot, user ? null : getGuestSessionId());
    setFiles((prev) =>
      prev.map((p) =>
        p.id === entry.id ? { ...p, status: path ? "done" : "error", path } : p
      )
    );
  };

  const makeSlotHandlers = (
    slot: "bill" | "eob",
    files: PageFile[],
    setFiles: React.Dispatch<React.SetStateAction<PageFile[]>>,
    setZoneError: (e: string | null) => void,
  ) => ({
    onAdd: (incoming: File[]) => {
      const { accepted, rejection } = validateAdd(files, incoming);
      setZoneError(rejection);
      if (slot === "bill" && accepted.length > 0) setError(null);
      const entries: PageFile[] = accepted.map((file) => ({
        id: newPageId(),
        file,
        status: "uploading",
        path: null,
      }));
      if (entries.length === 0) return;
      setFiles((prev) => [...prev, ...entries]);
      for (const entry of entries) void startUpload(slot, setFiles, entry);
    },
    onRemove: (id: string) => {
      setZoneError(null);
      setFiles((prev) => prev.filter((p) => p.id !== id));
    },
    onMove: (id: string, dir: -1 | 1) => {
      setFiles((prev) => {
        const i = prev.findIndex((p) => p.id === id);
        const j = i + dir;
        if (i === -1 || j < 0 || j >= prev.length) return prev;
        const next = [...prev];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      });
    },
    onRetry: (id: string) => {
      const entry = files.find((p) => p.id === id);
      if (!entry) return;
      setFiles((prev) => prev.map((p) => (p.id === id ? { ...p, status: "uploading" } : p)));
      void startUpload(slot, setFiles, { ...entry, status: "uploading" });
    },
  });

  const billHandlers = makeSlotHandlers("bill", billFiles, setBillFiles, setBillZoneError);
  const eobHandlers = makeSlotHandlers("eob", eobFiles, setEobFiles, setEobZoneError);

  // Resolve one slot's files for submission: reuse eager-upload paths, retry
  // any file that still lacks one, and fall back to inline base64 for the
  // whole slot only if a path is still missing (mixed path/base64 within one
  // slot isn't part of the API contract).
  async function resolveSlotForSubmit(
    slot: "bill" | "eob",
    files: PageFile[],
    setFiles: React.Dispatch<React.SetStateAction<PageFile[]>>,
    supabase: ReturnType<typeof createClient>,
    guestSessionId: string | null,
  ): Promise<{ paths: string[] | null; base64s: string[] | null; names: string[] }> {
    const names = files.map((p) => p.file.name);
    const paths: (string | null)[] = [];
    for (const pf of files) {
      let path = pf.path;
      if (!path) {
        path = await uploadToBills(supabase, pf.file, slot, guestSessionId);
        if (path) {
          setFiles((prev) => prev.map((p) => (p.id === pf.id ? { ...p, status: "done", path } : p)));
        }
      }
      paths.push(path);
    }
    if (paths.every((p): p is string => p !== null)) {
      return { paths, base64s: null, names };
    }
    const base64s = await Promise.all(files.map((p) => fileToBase64(p.file)));
    return { paths: null, base64s, names };
  }

  // Runs the audit (guest or signed-in). Extracted so the progress screen's
  // "Try again" can re-invoke it. Drives `phase`: success either shows the guest
  // results inline or navigates to the case page; failure flips to 'error'.
  async function runAudit() {
    if (!tier) return;
    // Validate the bill against React state — the single source of truth that
    // survives the step-1 DropZones unmounting on later steps.
    if (billFiles.length === 0) {
      setError("Please upload your bill to run the audit.");
      return;
    }

    setError(null);
    setAttempt((a) => a + 1);
    setPhase("running");

    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // ── Guest path: run a free, anonymous audit and show results inline ──
      if (!user) {
        // Primary path: files are already in Storage from the eager per-file
        // upload (no body-size limit) — send just the storage paths, in page
        // order. Fall back to inline base64 only when a direct upload couldn't
        // be completed — fine for small files.
        const guestSessionId = getGuestSessionId();
        const billSlot = await resolveSlotForSubmit("bill", billFiles, setBillFiles, supabase, guestSessionId);
        const eobSlot = eobFiles.length > 0
          ? await resolveSlotForSubmit("eob", eobFiles, setEobFiles, supabase, guestSessionId)
          : null;

        const body: Record<string, unknown> = { insuranceType, guestSessionId };
        // Single file → legacy single-file fields (byte-identical server path);
        // multiple files → ordered arrays merged server-side into one document.
        if (billFiles.length === 1) {
          body.fileName = billSlot.names[0];
          if (billSlot.paths) body.billPath = billSlot.paths[0];
          else body.fileBase64 = billSlot.base64s![0];
        } else {
          body.billFileNames = billSlot.names;
          if (billSlot.paths) body.billPaths = billSlot.paths;
          else body.billFilesBase64 = billSlot.base64s;
        }
        if (eobSlot) {
          if (eobFiles.length === 1) {
            body.eobFileName = eobSlot.names[0];
            if (eobSlot.paths) body.eobPath = eobSlot.paths[0];
            else body.eobFileBase64 = eobSlot.base64s![0];
          } else {
            body.eobFileNames = eobSlot.names;
            if (eobSlot.paths) body.eobPaths = eobSlot.paths;
            else body.eobFilesBase64 = eobSlot.base64s;
          }
        }

        const res = await fetch("/api/audit-guest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(
            result.error ||
              "We couldn't read that document. Try a clearer photo or the itemized bill."
          );
          setPhase("error");
          return;
        }
        // Persist the full audit under a claim ID so it survives the signup
        // round trip and can be imported as a real case once they have an
        // account — no re-upload. (Guests have no DB rows under RLS.)
        saveGuestClaim(result, { careType, insuranceType, gfe, tier, userNotes });
        setGuestResults(result as GuestAudit);
        return;
      }

      // ── Signed-in path: save the case so it persists + generates letters ──
      // Files are already in Storage from the eager per-file upload; the audit
      // downloads them server-side from these paths, so large files never hit
      // the body limit. A failed upload doesn't block case creation — extract
      // falls back to base64.
      const billSlot = await resolveSlotForSubmit("bill", billFiles, setBillFiles, supabase, null);
      const eobSlot = eobFiles.length > 0
        ? await resolveSlotForSubmit("eob", eobFiles, setEobFiles, supabase, null)
        : null;

      const response = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          careType,
          insuranceType,
          gfe,
          tier,
          userNotes,
          amountBilled: 0,
          billPath: billSlot.paths?.[0] ?? null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        setPhase("error");
        return;
      }

      // Run the extraction + audit pipeline and await it so the case page already
      // has findings when we land on it. A failure here still has a saved case —
      // surface it as a retryable error rather than dropping the user silently.
      //
      // /api/extract is AUTHORITATIVE for where we land. On bill-level dedup it
      // DELETES this freshly-created shell case and returns the surviving original
      // case id (+ duplicate:true). So always use the extract response's caseId —
      // never the shell id from /api/cases, which may have just been deleted.
      let landingCaseId: string = data.caseId;
      let isDuplicate = false;
      if (data.caseId) {
        const extractBody: Record<string, unknown> = { caseId: data.caseId };
        // Single file → legacy single-file fields (byte-identical server path);
        // multiple files → ordered arrays merged server-side into one document.
        // Storage paths preferred; inline base64 (small files only) as fallback.
        if (billFiles.length === 1) {
          extractBody.billFileName = billSlot.names[0];
          if (billSlot.paths) extractBody.billPath = billSlot.paths[0];
          else extractBody.billFileBase64 = billSlot.base64s![0];
        } else {
          extractBody.billFileNames = billSlot.names;
          if (billSlot.paths) extractBody.billPaths = billSlot.paths;
          else extractBody.billFilesBase64 = billSlot.base64s;
        }
        if (eobSlot) {
          if (eobFiles.length === 1) {
            extractBody.eobFileName = eobSlot.names[0];
            if (eobSlot.paths) extractBody.eobPath = eobSlot.paths[0];
            else extractBody.eobFileBase64 = eobSlot.base64s![0];
          } else {
            extractBody.eobFileNames = eobSlot.names;
            if (eobSlot.paths) extractBody.eobPaths = eobSlot.paths;
            else extractBody.eobFilesBase64 = eobSlot.base64s;
          }
        }

        const extractRes = await fetch("/api/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(extractBody),
        });
        const extractJson = await extractRes.json().catch(() => ({}));
        if (!extractRes.ok) {
          setError(
            extractJson.error ||
              "We saved your bill but couldn't finish the audit. Try again."
          );
          setPhase("error");
          return;
        }
        if (typeof extractJson.caseId === "string" && extractJson.caseId) {
          landingCaseId = extractJson.caseId;
        }
        isDuplicate = extractJson.duplicate === true;
      }

      // Land on the surviving case with the full audit results + letter CTA.
      // ?dup=1 surfaces the "already in your dashboard" banner for a re-upload.
      router.push(isDuplicate ? `/cases/${landingCaseId}?dup=1` : `/cases/${landingCaseId}`);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
      setPhase("error");
    }
  }

  const tierLabel =
    tier === "audit"
      ? "Audit · Free"
      : tier === "dispute"
      ? "Dispute · $39"
      : tier === "membership"
      ? "Membership · $19/mo"
      : null;

  if (guestResults) {
    const r = guestResults;
    const hasErrors = r.errorCount > 0;
    const needsReview = r.needsReviewCount ?? 0;
    const reviewNote =
      needsReview > 0
        ? `${needsReview} line${needsReview === 1 ? "" : "s"} couldn't be priced automatically and ${needsReview === 1 ? "needs" : "need"} manual review.`
        : null;
    return (
      <div className="page-root" style={{ background: "var(--surface)", minHeight: "100vh" }}>
        <Nav />
        <div style={{ maxWidth: "840px", margin: "0 auto", padding: "140px 64px 96px" }}>
          <div style={{ ...label(), marginBottom: "24px" }}>
            Your free audit{r.provider ? ` · ${r.provider}` : ""}
          </div>
          <h1 style={{ ...serif("clamp(40px, 5vw, 64px)", { lineHeight: 1.05, marginBottom: "16px" }) }}>
            {hasErrors
              ? `We found ${r.errorCount} ${r.errorCount === 1 ? "error" : "errors"}.`
              : needsReview > 0
              ? "No clear overcharges, a few lines need review."
              : "No errors found."}
          </h1>
          {hasErrors ? (
            <p style={{ ...sans("16px", "#5F5648") }}>
              <span style={{ ...serif("34px", { color: "var(--brand)", fontStyle: "italic" }) }}>
                ${Math.round(r.potentialSavings).toLocaleString()}
              </span>{" "}
              in potential overcharges on a ${Math.round(r.totalBilled).toLocaleString()} bill.
              {reviewNote && (
                <span style={{ ...sans("14px", "#8A7F6E") }}> {reviewNote}</span>
              )}
            </p>
          ) : needsReview > 0 ? (
            <p style={{ ...sans("15px", "#5F5648"), maxWidth: "460px", lineHeight: 1.7 }}>
              No charges exceeded your plan&apos;s expected rates. {reviewNote} These are
              usually facility or proprietary charge codes we price by hand.
            </p>
          ) : (
            <p style={{ ...sans("15px", "#5F5648"), maxWidth: "460px", lineHeight: 1.7 }}>
              Every line matched your plan&apos;s expected rates. Keep this, and let Verity watch your future bills automatically.
            </p>
          )}

          {r.errors.length > 0 && (
            <div style={{ marginTop: "48px", borderTop: "1px solid #D8CFBE" }}>
              {r.errors.map((e, i) => {
                const isManualReview = MANUAL_REVIEW_ERROR_TYPES.has(e.error_type ?? "");
                return (
                  <div
                    key={i}
                    className="r-grid-1"
                    style={{ borderBottom: "1px solid #E2DACB", padding: "24px 0", display: "grid", gridTemplateColumns: "90px 1fr 130px", gap: "20px", alignItems: "baseline" }}
                  >
                    <div style={{ ...sans("13px", "#8A7F6E") }}>{e.cpt_code}</div>
                    <div>
                      <div style={{ ...serif("20px", { lineHeight: 1.2 }) }}>{e.description}</div>
                      <div style={{ ...sans("13px", "#2A2520"), marginTop: "6px", lineHeight: 1.5 }}>{e.explanation}</div>
                      <div style={{ ...sans("11px", "#B3A28A"), marginTop: "4px" }}>{e.rule_violated}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      {isManualReview ? (
                        <div style={{ ...sans("10px", "#8A7F6E"), letterSpacing: "0.1em", textTransform: "uppercase" }}>
                          {e.error_type === "coding_observation" ? "informational" : "needs review"}
                        </div>
                      ) : (
                        <>
                          <div style={{ ...serif("22px", { color: "var(--brand)" }) }}>
                            ${Math.round(Math.max(0, e.billed_amount - e.expected_amount)).toLocaleString()}
                          </div>
                          <div style={{ ...sans("10px", "#8A7F6E"), letterSpacing: "0.1em", textTransform: "uppercase" }}>recoverable</div>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {r.eobError && (
            <div style={{ marginTop: "32px", backgroundColor: "#F4EFE6", border: "1px solid #D8CFBE", borderLeft: "3px solid #C8A97E", padding: "16px 20px" }}>
              <div style={{ ...label("#8A7F6E"), marginBottom: "6px" }}>EOB notice</div>
              <p style={{ ...sans("13px", "#5F5648"), lineHeight: 1.6 }}>
                We couldn&apos;t read your EOB, so this audit was completed using your bill only. Re-upload a clearer EOB (PDF or photo) to add the bill-vs-EOB cross-check.
              </p>
            </div>
          )}

          {r.crossDocumentDiscrepancies && r.crossDocumentDiscrepancies.length > 0 && (
            <div style={{ marginTop: "48px" }}>
              <div style={{ ...label(), marginBottom: "16px" }}>
                Bill vs. EOB · {r.crossDocumentDiscrepancies.length} cross-document{" "}
                {r.crossDocumentDiscrepancies.length === 1 ? "discrepancy" : "discrepancies"}
              </div>
              <div style={{ borderTop: "1px solid #D8CFBE" }}>
                {r.crossDocumentDiscrepancies.map((d) => {
                  const sevColor =
                    d.severity === "critical" || d.severity === "high" ? "#B0604C" : "#C8A97E";
                  return (
                    <div
                      key={d.discrepancyId}
                      style={{ borderBottom: "1px solid #E2DACB", padding: "24px 0" }}
                    >
                      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "16px" }}>
                        <div style={{ ...serif("20px", { lineHeight: 1.2 }), textTransform: "capitalize" }}>
                          {d.type.replace(/_/g, " ")}
                        </div>
                        {d.estimatedDollarImpact > 0 && (
                          <div style={{ ...serif("22px", { color: sevColor }) }}>
                            ${Math.round(d.estimatedDollarImpact).toLocaleString()}
                          </div>
                        )}
                      </div>
                      <div style={{ ...sans("11px", sevColor), textTransform: "uppercase", letterSpacing: "0.1em", marginTop: "4px" }}>
                        {d.severity} · {Math.round(d.confidenceScore * 100)}% confidence
                      </div>
                      <p style={{ ...sans("13px", "#2A2520"), marginTop: "8px", lineHeight: 1.6 }}>{d.description}</p>
                      {d.applicableRegulations?.length > 0 && (
                        <div style={{ ...sans("11px", "#B3A28A"), marginTop: "6px", lineHeight: 1.5 }}>
                          {d.applicableRegulations[0]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: "48px", backgroundColor: "#F4EFE6", border: "1px solid #D8CFBE", padding: "32px" }}>
            <div style={{ ...serif("26px", { lineHeight: 1.2, marginBottom: "8px" }) }}>
              {hasErrors ? "Get your money back." : "Stay protected."}
            </div>
            <p style={{ ...sans("14px", "#5F5648"), lineHeight: 1.7, maxWidth: "480px", marginBottom: "24px" }}>
              Create a free account to save this audit{hasErrors ? ", generate a ready-to-send dispute letter, " : " "}and have every future bill checked automatically.
            </p>
            <div className="r-cta" style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
              <Link href="/login" style={{ textDecoration: "none" }}>
                <span style={{ ...sans("11px", "#221C14"), backgroundColor: "var(--brand-fill)", padding: "16px 32px", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 500, display: "inline-block" }}>
                  Create free account →
                </span>
              </Link>
              <span
                onClick={() => {
                  // Reset ALL inputs, not just the bill — otherwise the next audit
                  // silently reuses the previous EOB / care type / insurance / notes.
                  setGuestResults(null);
                  setBillFiles([]);
                  setEobFiles([]);
                  setBillZoneError(null);
                  setEobZoneError(null);
                  setCareType(null);
                  setInsuranceType(null);
                  setGfe(null);
                  setUserNotes("");
                  setError(null);
                  // The guest success path leaves phase === "running" (results
                  // render on guestResults), so reset it too or clearing the
                  // results would drop the user onto the progress screen.
                  setPhase("form");
                  setStep(1);
                }}
                style={{ ...sans("11px", "#221C14"), border: "1px solid #C2B7A3", padding: "16px 32px", letterSpacing: "0.2em", textTransform: "uppercase", display: "inline-block", cursor: "pointer" }}
              >
                Audit another bill
              </span>
            </div>
          </div>

          <p style={{ ...sans("11px", "#8A7F6E"), fontStyle: "italic", marginTop: "24px", lineHeight: 1.6 }}>
            Verity flags potential billing errors and the rule behind each. This is not legal or medical advice.
          </p>
        </div>
      </div>
    );
  }

  // ── Audit in flight (or failed): staged progress, never a frozen spinner ──
  if (phase === "running" || phase === "error") {
    return (
      <div className="page-root" style={{ background: "var(--surface)", minHeight: "100vh" }}>
        <Nav />
        <div style={{ maxWidth: "672px", margin: "0 auto", padding: "200px 24px 96px" }}>
          <AuditProgress
            key={attempt}
            phase={phase}
            error={error}
            onRetry={runAudit}
            onBack={() => {
              setPhase("form");
              setError(null);
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="page-root" style={{ background: "var(--surface)", minHeight: "100vh" }}>
      {/* Top bar */}
      <div
        style={{
          padding: "24px 32px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Link
          href="/"
          style={{
            ...sans("12px", "#8A7F6E"),
            textDecoration: "none",
            transition: "color 0.2s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#5F5648")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#8A7F6E")}
        >
          ← Verity
        </Link>
        {tierLabel && (
          <div
            style={{
              backgroundColor: "#EFE9DD",
              border: "1px solid #D8CFBE",
              padding: "4px 12px",
              borderRadius: "4px",
              ...sans("11px", "#5F5648"),
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            {tierLabel}
          </div>
        )}
      </div>

      {/* Main content */}
      <div
        style={{
          maxWidth: "672px",
          margin: "0 auto",
          padding: "48px 24px 96px",
        }}
      >
        <StepIndicator step={step} />

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key={1}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div style={{ ...serif("40px", { lineHeight: 1.1 }) }}>
                Upload your documents.
              </div>
              <p style={{ ...sans("14px", "#5F5648"), marginTop: "12px" }}>
                Your bill and EOB. Takes three minutes.
              </p>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  marginTop: "40px",
                }}
              >
                <DropZone
                  zonelabel="Medical bill"
                  sublabel="Itemized bill, not the summary"
                  required={true}
                  files={billFiles}
                  zoneError={billZoneError}
                  {...billHandlers}
                />
                <DropZone
                  zonelabel="Explanation of Benefits (EOB)"
                  sublabel="From your insurer, optional but recommended"
                  required={false}
                  files={eobFiles}
                  zoneError={eobZoneError}
                  {...eobHandlers}
                />
              </div>

              <p style={{ ...sans("12px", "#8A7F6E"), marginTop: "24px" }}>
                Don&apos;t have your EOB? You can still proceed, the audit will
                be less precise.
              </p>

              <button
                onClick={() => billFiles.length > 0 && setStep(2)}
                disabled={billFiles.length === 0}
                style={{
                  marginTop: "40px",
                  width: "100%",
                  backgroundColor: billFiles.length > 0 ? "#C8A97E" : "#EFE9DD",
                  color: billFiles.length > 0 ? "#221C14" : "#8A7F6E",
                  border: "none",
                  padding: "16px",
                  cursor: billFiles.length > 0 ? "pointer" : "not-allowed",
                  ...sans("11px", billFiles.length > 0 ? "#221C14" : "#8A7F6E"),
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  transition: "background-color 0.2s",
                }}
              >
                Continue to step 2 →
              </button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key={2}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div style={{ ...serif("40px", { lineHeight: 1.1 }) }}>
                Tell us about your care.
              </div>
              <p style={{ ...sans("14px", "#5F5648"), marginTop: "12px" }}>
                This helps us find errors faster.
              </p>

              <div style={{ marginTop: "40px" }}>
                {/* Question 1 */}
                <div style={{ marginBottom: "32px" }}>
                  <div style={{ ...label("#8A7F6E"), marginBottom: "12px" }}>
                    Type of care
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {[
                      "Emergency visit",
                      "Planned surgery",
                      "Specialist visit",
                      "Routine / preventive",
                      "Lab or imaging",
                      "Other",
                    ].map((opt) => (
                      <RadioCard
                        key={opt}
                        option={opt}
                        selected={careType === opt}
                        onSelect={() => setCareType(opt)}
                      />
                    ))}
                  </div>
                </div>

                {/* Question 2 */}
                <div style={{ marginBottom: "32px" }}>
                  <div style={{ ...label("#8A7F6E"), marginBottom: "12px" }}>
                    Insurance type
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {[
                      "Commercial (PPO/HMO)",
                      "Medicare Advantage",
                      "Original Medicare",
                      "Medicaid",
                      "Self-pay / uninsured",
                    ].map((opt) => (
                      <RadioCard
                        key={opt}
                        option={opt}
                        selected={insuranceType === opt}
                        onSelect={() => setInsuranceType(opt)}
                      />
                    ))}
                  </div>
                </div>

                {/* Question 3 */}
                <div style={{ marginBottom: "32px" }}>
                  <div style={{ ...label("#8A7F6E"), marginBottom: "12px" }}>
                    Did you receive a Good Faith Estimate?
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {["Yes", "No", "I'm not sure what that is"].map((opt) => (
                      <RadioCard
                        key={opt}
                        option={opt}
                        selected={gfe === opt}
                        onSelect={() => setGfe(opt)}
                      />
                    ))}
                  </div>
                  {gfe === "I'm not sure what that is" && (
                    <div
                      style={{
                        marginTop: "12px",
                        backgroundColor: "#F4EFE6",
                        border: "1px solid #D8CFBE",
                        padding: "16px 20px",
                      }}
                    >
                      <p style={{ ...sans("12px", "#5F5648"), lineHeight: 1.65 }}>
                        A Good Faith Estimate is a document providers are required
                        to give patients before non-emergency care under the No
                        Surprises Act (2022). If you didn&apos;t receive one and
                        were balance-billed, you may have additional dispute rights.
                      </p>
                    </div>
                  )}
                </div>

                {/* Question 4 */}
                <div style={{ marginBottom: "32px" }}>
                  <div style={{ ...label("#8A7F6E"), marginBottom: "8px" }}>
                    Anything else we should know?
                  </div>
                  <div
                    style={{
                      ...sans("12px", "#8A7F6E"),
                      marginBottom: "12px",
                      lineHeight: 1.65,
                    }}
                  >
                    For example: a test that wasn&apos;t completed, a procedure
                    that was cancelled, a provider you never saw, or a charge
                    that looks wrong to you.
                  </div>
                  <textarea
                    value={userNotes}
                    onChange={(e) => setUserNotes(e.target.value)}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "#C8A97E";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = "#CFC6B4";
                    }}
                    placeholder="e.g. They charged for a lab test but never completed it because the sample was insufficient..."
                    style={{
                      width: "100%",
                      minHeight: "120px",
                      backgroundColor: "var(--surface)",
                      border: "1px solid #CFC6B4",
                      color: "#221C14",
                      padding: "16px",
                      fontFamily: "var(--font-public-sans), system-ui, sans-serif",
                      fontSize: "14px",
                      lineHeight: 1.6,
                      resize: "vertical",
                      outline: "none",
                      boxSizing: "border-box",
                      transition: "border-color 0.2s",
                    }}
                  />
                </div>
              </div>

              <button
                onClick={() => careType && insuranceType && gfe && setStep(3)}
                disabled={!careType || !insuranceType || !gfe}
                style={{
                  marginTop: "40px",
                  width: "100%",
                  backgroundColor: careType && insuranceType && gfe ? "#C8A97E" : "#EFE9DD",
                  color: careType && insuranceType && gfe ? "#221C14" : "#8A7F6E",
                  border: "none",
                  padding: "16px",
                  cursor: careType && insuranceType && gfe ? "pointer" : "not-allowed",
                  ...sans("11px", careType && insuranceType && gfe ? "#221C14" : "#8A7F6E"),
                  letterSpacing: "0.2em",
                  textTransform: "uppercase",
                  transition: "background-color 0.2s",
                }}
              >
                Continue to step 3 →
              </button>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key={3}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div style={{ ...serif("40px", { lineHeight: 1.1 }) }}>
                Choose your path.
              </div>
              <p style={{ ...sans("14px", "#5F5648"), marginTop: "12px" }}>
                You can upgrade anytime.
              </p>

              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                  marginTop: "40px",
                }}
              >
                {/* Audit card */}
                <div
                  onClick={() => setTier("audit")}
                  style={{
                    backgroundColor: "#F4EFE6",
                    border: `1px solid ${tier === "audit" ? "#C8A97E" : "#D8CFBE"}`,
                    padding: "24px",
                    cursor: "pointer",
                    transition: "border-color 0.2s",
                  }}
                  onMouseEnter={(e) => {
                    if (tier !== "audit")
                      (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(200,169,126,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    if (tier !== "audit")
                      (e.currentTarget as HTMLDivElement).style.borderColor = "#D8CFBE";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline" }}>
                    <span style={{ ...serif("26px") }}>Audit</span>
                    <span style={{ ...serif("26px", { fontStyle: "italic" }), marginLeft: "auto" }}>Free</span>
                  </div>
                  <div style={{ ...sans("12px", "#8A7F6E"), marginTop: "4px" }}>
                    Always free, see what&apos;s wrong before deciding
                  </div>
                  <div style={{ borderTop: "1px solid #D8CFBE", margin: "16px 0" }} />
                  {[
                    "Scan every charge against your plan",
                    "Full error report in minutes",
                    "No dispute filed",
                  ].map((f) => (
                    <div
                      key={f}
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "flex-start",
                        marginBottom: "6px",
                      }}
                    >
                      <span style={{ ...sans("13px", "#8A7F6E") }}>›</span>
                      <span style={{ ...sans("13px", "#5F5648") }}>{f}</span>
                    </div>
                  ))}
                </div>

                {/* Dispute card */}
                <div
                  onClick={() => setTier("dispute")}
                  style={{
                    backgroundColor: "#F4EFE6",
                    border: `1px solid ${tier === "dispute" ? "#C8A97E" : "#D8CFBE"}`,
                    padding: "24px",
                    cursor: "pointer",
                    transition: "border-color 0.2s",
                    position: "relative",
                  }}
                  onMouseEnter={(e) => {
                    if (tier !== "dispute")
                      (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(200,169,126,0.3)";
                  }}
                  onMouseLeave={(e) => {
                    if (tier !== "dispute")
                      (e.currentTarget as HTMLDivElement).style.borderColor = "#D8CFBE";
                  }}
                >
                  <div style={{ display: "flex", alignItems: "baseline" }}>
                    <span style={{ ...serif("26px") }}>Single Dispute</span>
                    <span style={{ ...serif("26px", { fontStyle: "italic" }), marginLeft: "auto" }}>$39</span>
                  </div>
                  <div style={{ ...sans("12px", "#8A7F6E"), marginTop: "4px" }}>
                    one-time, for one bill
                  </div>
                  <div style={{ ...sans("12px", "#8A7F6E"), marginTop: "2px" }}>
                    One bill. Ready to send.
                  </div>
                  <div style={{ borderTop: "1px solid #D8CFBE", margin: "16px 0" }} />
                  {["+Prefilled dispute letter", "+Appeal letter if denied", "+Submission guide", "+Deadline tracker"].map((f) => (
                    <div
                      key={f}
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "flex-start",
                        marginBottom: "6px",
                      }}
                    >
                      <span style={{ ...sans("13px", "#8A7F6E") }}>›</span>
                      <span style={{ ...sans("13px", "#5F5648") }}>{f}</span>
                    </div>
                  ))}
                </div>

                {/* Membership card */}
                <div
                  onClick={() => setTier("membership")}
                  style={{
                    backgroundColor: "#F4EFE6",
                    border: `1.5px solid ${tier === "membership" ? "#C8A97E" : "rgba(200,169,126,0.5)"}`,
                    padding: "24px",
                    cursor: "pointer",
                    transition: "border-color 0.2s",
                    position: "relative",
                  }}
                >
                  <div
                    style={{
                      display: "inline-block",
                      backgroundColor: "var(--brand-fill)",
                      color: "#221C14",
                      fontSize: "10px",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      marginBottom: "8px",
                      fontFamily: "var(--font-public-sans), system-ui, sans-serif",
                    }}
                  >
                    Most popular
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline" }}>
                    <span style={{ ...serif("26px") }}>Membership</span>
                    <span style={{ ...serif("26px", { fontStyle: "italic" }), marginLeft: "auto" }}>$19/mo</span>
                  </div>
                  <div style={{ ...sans("12px", "#8A7F6E"), marginTop: "4px" }}>
                    or $149/yr, every bill, covered
                  </div>
                  <div style={{ ...sans("12px", "#8A7F6E"), marginTop: "2px" }}>
                    Your ongoing bill watchdog.
                  </div>
                  <div style={{ borderTop: "1px solid #D8CFBE", margin: "16px 0" }} />
                  {["+Unlimited audits & dispute letters", "+Every new bill audited automatically", "+Appeal & regulator letters", "+Alerts + priority support"].map((f) => (
                    <div
                      key={f}
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "flex-start",
                        marginBottom: "6px",
                      }}
                    >
                      <span style={{ ...sans("13px", "#8A7F6E") }}>›</span>
                      <span style={{ ...sans("13px", "#5F5648") }}>{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* File summary */}
              {tier && (
                <div
                  style={{
                    backgroundColor: "var(--surface)",
                    border: "1px solid #E2DACB",
                    padding: "16px 20px",
                    marginTop: "24px",
                  }}
                >
                  <div
                    style={{
                      ...sans("11px", "#8A7F6E"),
                      textTransform: "uppercase",
                      letterSpacing: "0.2em",
                      marginBottom: "12px",
                    }}
                  >
                    Documents uploaded
                  </div>
                  {[
                    { files: billFiles, lbl: "Medical Bill" },
                    { files: eobFiles, lbl: "Explanation of Benefits" },
                  ]
                    .filter((x) => x.files.length > 0)
                    .map((x) => (
                      <div
                        key={x.lbl}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          marginBottom: "6px",
                        }}
                      >
                        <CheckCircle size={14} color="#5E7E66" />
                        <span style={{ ...sans("13px", "#5F5648") }}>
                          {x.files.length === 1
                            ? x.files[0].file.name
                            : `${x.lbl}, ${x.files.length} pages`}
                        </span>
                      </div>
                    ))}
                </div>
              )}

              {/* Legal consent */}
              <p
                style={{
                  ...sans("12px", "#8A7F6E"),
                  lineHeight: 1.65,
                  marginTop: "24px",
                }}
              >
                By submitting, you authorize Verity to access your uploaded
                documents for medical billing audit purposes. Your information is
                handled with strong security and privacy safeguards and never
                shared with third parties.
              </p>

              {/* Submit button */}
             {error && (
  <p style={{ ...sans("13px", "#B0604C"), marginTop: "16px" }}>
    {error}
  </p>
)}
<button
  onClick={runAudit}
  disabled={!tier || billFiles.length === 0 || loading}
  style={{
    marginTop: "24px",
    width: "100%",
    backgroundColor: tier && billFiles.length > 0 && !loading ? "#C8A97E" : "#EFE9DD",
    color: tier && billFiles.length > 0 && !loading ? "#221C14" : "#8A7F6E",
    border: "none",
    padding: "16px",
    cursor: tier && billFiles.length > 0 && !loading ? "pointer" : "not-allowed",
    ...sans("11px", tier && billFiles.length > 0 && !loading ? "#221C14" : "#8A7F6E"),
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    transition: "background-color 0.2s",
  }}
>
  {loading ? "Submitting..." : "Submit for audit →"}
</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ─── Default export: wrapper with Suspense ────────────────────────────────────
export default function UploadPage() {
  return (
    <Suspense fallback={null}>
      <UploadPageInner />
    </Suspense>
  );
}
