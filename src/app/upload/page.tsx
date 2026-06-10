"use client";

import React, { useState, useRef, Suspense } from "react";
import type { DragEvent, ChangeEvent } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, CheckCircle, Camera } from "lucide-react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import * as Sentry from "@sentry/nextjs";
import { hasEmFlag } from "@/lib/emReview";

// ─── Style helpers (exact copy from landing page) ─────────────────────────────
const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: "var(--font-cormorant), Georgia, serif",
  fontSize: size,
  color: "#221C14",
  lineHeight: 1,
  fontWeight: 400,
  ...extra,
});

const sans = (size: string, color = "#5F5648", extra?: React.CSSProperties): React.CSSProperties => ({
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

// ─── Nav (copied from landing page) ──────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false);
  React.useEffect(() => {
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
        backgroundColor: scrolled ? "rgba(235,229,217,0.85)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        transition: "background-color 0.4s, backdrop-filter 0.4s",
        padding: "20px 64px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Link href="/" style={{ textDecoration: "none" }}>
        <span
          style={{
            ...sans("15px", "#221C14"),
            letterSpacing: "0.42em",
            textTransform: "uppercase",
            fontWeight: 300,
            paddingLeft: "0.42em",
          }}
        >
          Verity
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
            backgroundColor: "#C8A97E",
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

// ─── Trust strip (below nav on upload page) ───────────────────────────────────
function TrustStrip() {
  const items = [
    "Bank-level encryption in transit and at rest",
    "Documents never sold or shared",
    "No upfront payment for audit",
    "Administrative advocacy service — not a law firm",
  ];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", backgroundColor: "#EBE5D9", borderTop: "1px solid #D8CFBE", borderBottom: "1px solid #D8CFBE" }}>
      {items.map((text, i) => (
        <div key={i} style={{ display: "flex", gap: "10px", alignItems: "flex-start", padding: "18px 20px", borderLeft: i > 0 ? "1px solid #D8CFBE" : "none" }}>
          <span style={{ ...sans("12px", "#C8A97E"), lineHeight: 1.6, flexShrink: 0 }}>—</span>
          <span style={{ ...sans("11px", "#8A7F6E"), lineHeight: 1.55, letterSpacing: "0.02em" }}>{text}</span>
        </div>
      ))}
    </div>
  );
}

// ─── After-upload explainer ───────────────────────────────────────────────────
function AfterUploadExplainer() {
  const steps = [
    "We extract line items and CPT codes from your bill.",
    "Each charge is audited against CMS fee schedules and NCCI edits.",
    "You get a full error report — free, before you pay for anything.",
  ];
  return (
    <div style={{ backgroundColor: "#F5F0E6", border: "1px solid #D8CFBE", borderLeft: "3px solid #C8A97E", padding: "20px 24px", marginTop: "24px" }}>
      <div style={{ ...label("#8A7F6E"), marginBottom: "12px" }}>What happens after you upload</div>
      <ol style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
        {steps.map((s, i) => (
          <li key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start", padding: "6px 0" }}>
            <span style={{ ...sans("12px", "#C8A97E"), lineHeight: 1.6, flexShrink: 0, fontStyle: "italic", minWidth: "18px" }}>{i + 1}.</span>
            <span style={{ ...sans("13px", "#5F5648"), lineHeight: 1.65 }}>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

// ─── Support footer ────────────────────────────────────────────────────────────
function SupportFooter() {
  return (
    <div style={{ borderTop: "1px solid #D8CFBE", padding: "24px 0", marginTop: "48px", textAlign: "center" }}>
      <div style={{ ...sans("12px", "#8A7F6E"), lineHeight: 1.7 }}>
        Need help? Email{" "}
        <a href="mailto:support@verity.co" style={{ color: "#C8A97E", textDecoration: "none" }}>support@verity.co</a>
        {" "}— responses within 1 business day.
      </div>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type FileState = File;

type GuestError = {
  cpt_code: string;
  description: string;
  explanation: string;
  rule_violated: string;
  billed_amount: number;
  expected_amount: number;
  confidence: string;
};

type GuestAudit = {
  provider: string | null;
  errors: GuestError[];
  errorCount: number;
  totalBilled: number;
  potentialSavings: number;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
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

// ─── DropZone ─────────────────────────────────────────────────────────────────
function DropZone({
  zonelabel,
  sublabel,
  required,
  file,
  setFile,
}: {
  zonelabel: string;
  sublabel: string;
  required: boolean;
  file: FileState | null;
  setFile: (f: FileState | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const f = files[0];
    setFile(f);
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

  const borderColor = file
    ? "rgba(122,158,135,0.6)"
    : dragging
    ? "rgba(200,169,126,0.4)"
    : "#CFC6B4";

  const bgColor = file ? "rgba(122,158,135,0.05)" : dragging ? "rgba(200,169,126,0.03)" : "#221C14";

  return (
    <div
      onClick={() => !file && inputRef.current?.click()}
      onDrop={onDrop}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      style={{
        border: `1px dashed ${borderColor}`,
        backgroundColor: bgColor,
        padding: "32px",
        cursor: file ? "default" : "pointer",
        transition: "border-color 0.2s, background-color 0.2s",
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.heic,.HEIC,.heif,image/heic,image/heif"
        style={{ display: "none" }}
        onChange={(e: ChangeEvent<HTMLInputElement>) => handleFiles(e.target.files)}
      />
      {file ? (
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <CheckCircle size={20} color="#5E7E66" style={{ flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ ...sans("14px", "#221C14") }}>{file.name}</div>
            <div style={{ ...sans("12px", "#8A7F6E"), marginTop: "2px" }}>
              {formatSize(file.size)}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setFile(null);
            }}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              ...sans("18px", "#8A7F6E"),
              padding: "4px",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      ) : (
        <div style={{ textAlign: "center" }}>
          <Upload size={28} color="#CFC6B4" style={{ margin: "0 auto 12px", display: "block" }} />
          <div style={{ ...serif("20px", { color: "#8A7F6E", lineHeight: 1.2 }) }}>
            {zonelabel}
            {required && <span style={{ color: "#C8A97E", marginLeft: "4px" }}>*</span>}
          </div>
          <div style={{ ...sans("12px", "#8A7F6E"), marginTop: "4px" }}>
            {sublabel}
          </div>
          <div style={{ ...sans("12px", "#C9BFAC"), marginTop: "8px" }}>
            Drop here, or click to browse — PDF, JPG, PNG
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

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tier, setTier] = useState<"audit" | "dispute" | "membership" | null>(() => {
    const param = searchParams.get("tier");
    return param === "audit" || param === "dispute" || param === "membership" ? param : null;
  });
  const [billFile, setBillFile] = useState<FileState | null>(null);
  const [eobFile, setEobFile] = useState<FileState | null>(null);
  const [cardFile, setCardFile] = useState<FileState | null>(null);
  const [careType, setCareType] = useState<string | null>(null);
  const [insuranceType, setInsuranceType] = useState<string | null>(null);
  const [gfe, setGfe] = useState<string | null>(null);
  const [userNotes, setUserNotes] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState<string>("Submit for audit →");
  const [error, setError] = useState<string | null>(null);
  const [guestResults, setGuestResults] = useState<GuestAudit | null>(null);
  const router = useRouter();

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
    return (
      <div className="page-root" style={{ background: "#EBE5D9", minHeight: "100vh" }}>
        <Nav />
        <div style={{ maxWidth: "840px", margin: "0 auto", padding: "140px 64px 96px" }}>
          <div style={{ ...label(), marginBottom: "24px" }}>
            Your free audit{r.provider ? ` · ${r.provider}` : ""}
          </div>
          <h1 style={{ ...serif("clamp(40px, 5vw, 64px)", { lineHeight: 1.05, marginBottom: "16px" }) }}>
            {hasErrors ? `We found ${r.errorCount} ${r.errorCount === 1 ? "error" : "errors"}.` : "No errors found."}
          </h1>
          {hasErrors ? (
            <p style={{ ...sans("16px", "#5F5648") }}>
              <span style={{ ...serif("34px", { color: "#C8A97E", fontStyle: "italic" }) }}>
                ${Math.round(r.potentialSavings).toLocaleString()}
              </span>{" "}
              in potential overcharges on a ${Math.round(r.totalBilled).toLocaleString()} bill.
            </p>
          ) : (
            <p style={{ ...sans("15px", "#5F5648"), maxWidth: "460px", lineHeight: 1.7 }}>
              Every line matched your plan&apos;s expected rates. Keep this — and let Verity watch your future bills automatically.
            </p>
          )}

          {hasErrors && (
            <div style={{ marginTop: "48px", borderTop: "1px solid #D8CFBE" }}>
              {r.errors.map((e, i) => (
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
                    <div style={{ ...serif("22px", { color: "#C8A97E" }) }}>
                      ${Math.round(Math.max(0, e.billed_amount - e.expected_amount)).toLocaleString()}
                    </div>
                    <div style={{ ...sans("10px", "#8A7F6E"), letterSpacing: "0.1em", textTransform: "uppercase" }}>recoverable</div>
                  </div>
                </div>
              ))}
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
                <span style={{ ...sans("11px", "#221C14"), backgroundColor: "#C8A97E", padding: "16px 32px", letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 500, display: "inline-block" }}>
                  Create free account →
                </span>
              </Link>
              <span
                onClick={() => { setGuestResults(null); setStep(1); setBillFile(null); }}
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

  if (submitted) {
    return (
      <div
        style={{
          background: "#EBE5D9",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          paddingTop: "128px",
          paddingBottom: "96px",
          textAlign: "center",
        }}
      >
        <div style={{ ...serif("48px", { lineHeight: 1.1 }) }}>
          Your audit
          <br />
          is underway.
        </div>
        <div
          style={{
            width: "48px",
            height: "1px",
            backgroundColor: "#D8CFBE",
            margin: "32px auto",
          }}
        />
        <p
          style={{
            ...sans("15px", "#5F5648"),
            maxWidth: "340px",
            lineHeight: 1.7,
          }}
        >
          We&apos;ll email you within 24 hours with your full error report.
          Billing errors are more common than you think — we&apos;ll find them.
        </p>
        <Link
          href="/dashboard"
          style={{
            ...sans("12px", "#C8A97E"),
            textDecoration: "none",
            letterSpacing: "0.1em",
            marginTop: "40px",
            display: "inline-block",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#221C14")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#C8A97E")}
        >
          View your dashboard →
        </Link>
      </div>
    );
  }

  return (
    <div className="page-root" style={{ background: "#EBE5D9", minHeight: "100vh" }}>
      <TrustStrip />
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
                Your bill, EOB, and insurance card. Takes three minutes.
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
                  file={billFile}
                  setFile={setBillFile}
                />
                <DropZone
                  zonelabel="Explanation of Benefits (EOB)"
                  sublabel="From your insurer — optional but recommended"
                  required={false}
                  file={eobFile}
                  setFile={setEobFile}
                />
                <DropZone
                  zonelabel="Insurance card"
                  sublabel="Front side is sufficient"
                  required={false}
                  file={cardFile}
                  setFile={setCardFile}
                />
              </div>

              <p style={{ ...sans("12px", "#8A7F6E"), marginTop: "24px" }}>
                Don&apos;t have your EOB? You can still proceed — the audit will
                be less precise.
              </p>

              <AfterUploadExplainer />

              <button
                onClick={() => billFile && setStep(2)}
                disabled={!billFile}
                style={{
                  marginTop: "40px",
                  width: "100%",
                  backgroundColor: billFile ? "#C8A97E" : "#EFE9DD",
                  color: billFile ? "#221C14" : "#8A7F6E",
                  border: "none",
                  padding: "16px",
                  cursor: billFile ? "pointer" : "not-allowed",
                  ...sans("11px", billFile ? "#221C14" : "#8A7F6E"),
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
                      backgroundColor: "#EBE5D9",
                      border: "1px solid #CFC6B4",
                      color: "#221C14",
                      padding: "16px",
                      fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
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
                    Always free — see what&apos;s wrong before deciding
                  </div>
                  <div style={{ borderTop: "1px solid #D8CFBE", margin: "16px 0" }} />
                  {[
                    "Scan every charge against your plan",
                    "Error report within 24 hours",
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
                      backgroundColor: "#C8A97E",
                      color: "#221C14",
                      fontSize: "10px",
                      letterSpacing: "0.15em",
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      marginBottom: "8px",
                      fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
                    }}
                  >
                    Most popular
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline" }}>
                    <span style={{ ...serif("26px") }}>Membership</span>
                    <span style={{ ...serif("26px", { fontStyle: "italic" }), marginLeft: "auto" }}>$19/mo</span>
                  </div>
                  <div style={{ ...sans("12px", "#8A7F6E"), marginTop: "4px" }}>
                    or $149/yr — every bill, covered
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
                    backgroundColor: "#EBE5D9",
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
                    { f: billFile, lbl: "Medical Bill" },
                    { f: eobFile, lbl: "Explanation of Benefits" },
                    { f: cardFile, lbl: "Insurance Card" },
                  ]
                    .filter((x) => x.f)
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
                        <span style={{ ...sans("13px", "#5F5648") }}>{x.f!.name}</span>
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
  onClick={async () => {
    if (!tier || !billFile || !insuranceType) return
    setLoading(true)
    setError(null)
    setLoadingMessage("Creating your case...")

    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      // ── Guest path: anonymous audit, results shown inline ──────────────────
      if (!user) {
        if (!billFile) {
          setError("Please upload your bill to run the audit.")
          setLoading(false)
          return
        }
        const fileBase64 = await fileToBase64(billFile)
        const res = await fetch('/api/audit-guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileBase64, fileName: billFile.name, insuranceType }),
        })
        const result = await res.json()
        if (!res.ok) {
          setError(result.error || "We couldn't read that document. Try a clearer photo or the itemized bill.")
          setLoading(false)
          return
        }
        setGuestResults(result as GuestAudit)
        setLoading(false)
        return
      }

      // ── Signed-in path: full pipeline ──────────────────────────────────────
      const storagePrefix = user.id
      const uploadTargets: { file: File; category: string }[] = [
        billFile ? { file: billFile, category: 'bill' } : null,
        eobFile  ? { file: eobFile,  category: 'eob'  } : null,
        cardFile ? { file: cardFile, category: 'card' } : null,
      ].filter((x): x is { file: File; category: string } => x !== null)

      const uploadStamp = Date.now()
      await Promise.all(
        uploadTargets.map(async ({ file, category }) => {
          const filePath = `${storagePrefix}/${uploadStamp}-${category}-${file.name}`
          const { error: uploadError } = await supabase.storage.from('bills').upload(filePath, file)
          if (uploadError) {
            console.error(`Upload error (${category}):`, uploadError)
            Sentry.captureException(uploadError, { tags: { location: "upload-page", category } })
          }
        })
      )

      setLoadingMessage("Reading your bill...")

      const extractForm = new FormData()
      extractForm.append('file', billFile)
      const extractRes = await fetch('/api/extract-line-items', { method: 'POST', body: extractForm })
      const extractJson = await extractRes.json()
      if (!extractRes.ok) {
        setError(extractJson.error || "We couldn't read your bill. Please try a clearer scan.")
        setLoading(false)
        return
      }

      const lineItems = (extractJson.lineItems ?? []) as Array<{
        cpt_code: string; description: string; date_of_service: string
        units: number; billed_amount: number; modifiers: string[]
      }>
      const billMetadata = (extractJson.billMetadata ?? {}) as {
        provider_name?: string; provider_npi?: string; provider_address?: string
        bill_date?: string; patient_name?: string; patient_address_street?: string
        patient_address_city?: string; patient_address_state?: string
        patient_address_zip?: string; account_number?: string
      }
      const extractWarnings = (extractJson.warnings ?? []) as Array<{ code: string; reason: string }>

      if (lineItems.length === 0) {
        if (extractWarnings.length > 0) {
          setError(`We found ${extractWarnings.length} charge line${extractWarnings.length === 1 ? '' : 's'} but the CPT codes look misread (e.g., "${extractWarnings[0].code}"). Please upload a clearer scan.`)
        } else {
          setError("We couldn't find itemized charges on this bill. Please upload an itemized version (not a summary).")
        }
        setLoading(false)
        return
      }

      const providerName = typeof billMetadata.provider_name === 'string' && billMetadata.provider_name.trim()
        ? billMetadata.provider_name.trim() : null

      const street = billMetadata.patient_address_street?.trim() ?? ''
      const city = billMetadata.patient_address_city?.trim() ?? ''
      const state = billMetadata.patient_address_state?.trim() ?? ''
      const zip = billMetadata.patient_address_zip?.trim() ?? ''
      const cityStateZip = [[city, state].filter(Boolean).join(', '), zip].filter(Boolean).join(' ').trim()
      const combinedAddress = [street, cityStateZip].filter(Boolean).join('\n')

      const patientInfo: Record<string, string> = {}
      if (billMetadata.patient_name?.trim()) patientInfo.name = billMetadata.patient_name.trim()
      if (combinedAddress) patientInfo.address = combinedAddress
      if (billMetadata.account_number?.trim()) patientInfo.account_number = billMetadata.account_number.trim()

      const caseRes = await fetch('/api/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          careType, insuranceType, gfe, tier, userNotes, providerName,
          amountBilled: lineItems.reduce((s, li) => s + li.billed_amount, 0),
          patientInfo: Object.keys(patientInfo).length > 0 ? patientInfo : undefined,
        })
      })
      const caseJson = await caseRes.json()
      if (!caseRes.ok || !caseJson.caseId) {
        setError(caseJson.error || "Something went wrong. Please try again.")
        setLoading(false)
        return
      }
      const caseId: string = caseJson.caseId

      setLoadingMessage("Running audit...")

      const insuranceMap: Record<string, string> = {
        "Commercial (PPO/HMO)": "commercial",
        "Medicare Advantage": "medicare",
        "Original Medicare": "medicare",
        "Medicaid": "medicaid",
        "Self-pay / uninsured": "self-pay",
      }
      const apiInsurance = insuranceMap[insuranceType] ?? "other"

      const auditRes = await fetch('/api/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, insuranceType: apiInsurance, lineItems })
      })
      const auditJson = await auditRes.json()
      if (!auditRes.ok) {
        setError(auditJson.error || "Audit failed. Please try again.")
        setLoading(false)
        return
      }

      const auditErrors = (auditJson.errors ?? []) as Array<{ cpt_code?: string }>
      const emFlagPresent = hasEmFlag(auditErrors)
      let letterGenerationFailed = false

      if (auditJson.errorCount > 0 && !emFlagPresent) {
        setLoadingMessage("Generating your dispute letter...")

        const totalBilled = lineItems.reduce((s, li) => s + li.billed_amount, 0)
        const firstDate = lineItems[0]?.date_of_service ?? new Date().toISOString().split('T')[0]
        const totalExpected = (auditJson.errors as Array<{ expected_amount: number }>)
          .reduce((s, e) => s + Number(e.expected_amount || 0), 0)

        const letterRes = await fetch('/api/generate-letter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            caseId, errors: auditJson.errors,
            caseData: {
              provider_name: providerName ?? 'Provider on file',
              insurance_type: insuranceType,
              amount_billed: totalBilled,
              amount_expected: totalExpected,
              date_of_service: firstDate,
              userNotes,
            }
          })
        })
        if (!letterRes.ok) {
          const letterJson = await letterRes.json().catch(() => ({}))
          console.error('Letter generation failed:', letterJson)
          Sentry.captureMessage("Letter generation failed at upload flow", {
            level: "error",
            tags: { location: "upload-page" },
            extra: { status: letterRes.status, body: letterJson },
          })
          letterGenerationFailed = true
        }
      }

      if (letterGenerationFailed) {
        router.push(`/cases/${caseId}/letter?genFailed=1`)
      } else {
        router.push(`/cases/${caseId}`)
      }
      return

    } catch (err) {
      console.error(err)
      Sentry.captureException(err, { tags: { location: "upload-page", stage: "submit" } })
      setError("Something went wrong. Please try again.")
      setLoading(false)
    }
  }}
  disabled={!tier || loading}
  style={{
    marginTop: "24px",
    width: "100%",
    backgroundColor: tier && !loading ? "#C8A97E" : "#EFE9DD",
    color: tier && !loading ? "#221C14" : "#8A7F6E",
    border: "none",
    padding: "16px",
    cursor: tier && !loading ? "pointer" : "not-allowed",
    ...sans("11px", tier && !loading ? "#221C14" : "#8A7F6E"),
    letterSpacing: "0.2em",
    textTransform: "uppercase",
    transition: "background-color 0.2s",
  }}
>
  {loading ? loadingMessage : "Submit for audit →"}
</button>
            </motion.div>
          )}
        </AnimatePresence>
        <SupportFooter />
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
