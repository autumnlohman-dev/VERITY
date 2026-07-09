import { jsPDF } from "jspdf";
import type { NormalizedCBSSet, TimelineEvent, CBSDiscrepancy } from "./cbs/schema";
import type { DeadlineResult, UrgencyLevel } from "./deadlines/calculator";
import type { BillingError } from "./errorDetection";
import { MANUAL_REVIEW_ERROR_TYPES } from "./audit/manualReview";
import { formatCalendarDate } from "./dates";
import { BRAND_NAME } from "./brand";

type Block =
  | { kind: "h1" | "h2" | "h3"; text: string }
  | { kind: "p"; text: string }
  | { kind: "ul" | "ol"; items: string[] }
  | { kind: "hr" }
  | { kind: "table"; headers: string[]; rows: string[][] };

const PLACEHOLDER_RE = /\[[^\[\]\n]{2,40}\]/;
const PLACEHOLDER_RE_GLOBAL = /\[[^\[\]\n]{2,40}\]/g;

// Drops any [Bracket] placeholders left after the substitution pass.
// Lines that become structurally empty (only punctuation/whitespace remains)
// are removed so the PDF doesn't ship with stray "Re:" or "Subject:" stubs.
function stripUnfilledPlaceholders(content: string): string {
  const lines = content.split("\n");
  const out: string[] = [];

  for (const line of lines) {
    if (!PLACEHOLDER_RE.test(line)) {
      out.push(line);
      continue;
    }

    const stripped = line.replace(PLACEHOLDER_RE_GLOBAL, "");
    const meaningful = stripped.replace(/[\s.,:;\-—–]/g, "");
    if (meaningful === "") continue;

    out.push(stripped.replace(/[ \t]+/g, " ").trimEnd());
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

function parseTableRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

function isTableSeparator(line: string): boolean {
  const t = line.trim();
  return t.includes("|") && t.includes("-") && /^[\s|:\-]+$/.test(t);
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

    if (
      trimmed.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = parseTableRow(trimmed);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        rows.push(parseTableRow(lines[i]));
        i++;
      }
      blocks.push({ kind: "table", headers, rows });
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
        isHr(t) ||
        (t.includes("|") &&
          i + 1 < lines.length &&
          isTableSeparator(lines[i + 1]))
      )
        break;
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ kind: "p", text: paraLines.join(" ") });
    }
  }

  return blocks;
}

function stripInline(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1");
}

export function generateLetterPdf(
  markdown: string,
  filename: string
): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 72;
  const marginTop = 72;
  const marginBottom = 72;
  const contentWidth = pageWidth - marginX * 2;

  let y = marginTop;

  const ensureSpace = (need: number) => {
    if (y + need > pageHeight - marginBottom) {
      doc.addPage();
      y = marginTop;
    }
  };

  const drawLines = (lines: string[], lineHeight: number, indentX = 0) => {
    for (const line of lines) {
      ensureSpace(lineHeight);
      doc.text(line, marginX + indentX, y);
      y += lineHeight;
    }
  };

  doc.setFont("helvetica", "normal");
  doc.setTextColor(20, 20, 20);

  const blocks = parseMarkdown(stripUnfilledPlaceholders(markdown));

  for (const b of blocks) {
    switch (b.kind) {
      case "h1": {
        if (y > marginTop) y += 8;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(16);
        const lines = doc.splitTextToSize(stripInline(b.text), contentWidth);
        drawLines(lines, 22);
        y += 6;
        break;
      }
      case "h2": {
        if (y > marginTop) y += 6;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        const lines = doc.splitTextToSize(stripInline(b.text), contentWidth);
        drawLines(lines, 18);
        y += 4;
        break;
      }
      case "h3": {
        if (y > marginTop) y += 4;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        const lines = doc.splitTextToSize(stripInline(b.text).toUpperCase(), contentWidth);
        drawLines(lines, 16);
        y += 2;
        break;
      }
      case "p": {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const segments = b.text.split("\n");
        for (const seg of segments) {
          const lines = doc.splitTextToSize(stripInline(seg), contentWidth);
          drawLines(lines, 16);
        }
        y += 8;
        break;
      }
      case "ul":
      case "ol": {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        const indent = 18;
        for (let i = 0; i < b.items.length; i++) {
          const marker = b.kind === "ul" ? "•" : `${i + 1}.`;
          const lines = doc.splitTextToSize(stripInline(b.items[i]), contentWidth - indent);
          ensureSpace(16);
          doc.text(marker, marginX, y);
          for (let j = 0; j < lines.length; j++) {
            if (j > 0) ensureSpace(16);
            doc.text(lines[j], marginX + indent, y);
            y += 16;
          }
          y += 2;
        }
        y += 6;
        break;
      }
      case "hr": {
        ensureSpace(20);
        y += 6;
        doc.setDrawColor(180);
        doc.setLineWidth(0.5);
        doc.line(marginX, y, pageWidth - marginX, y);
        y += 14;
        break;
      }
      case "table": {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);

        const labels = b.headers.map((h) => `${h}:`);
        const labelTextWidth = Math.max(
          0,
          ...labels.map((l) => doc.getTextWidth(l))
        );
        const labelGap = 16;
        const valueX = marginX + labelTextWidth + labelGap;
        const valueWidth = Math.max(120, contentWidth - (labelTextWidth + labelGap));
        const lineHeight = 16;
        const rowGap = 10;

        for (let r = 0; r < b.rows.length; r++) {
          const row = b.rows[r];
          for (let c = 0; c < b.headers.length; c++) {
            const label = labels[c];
            const value = stripInline((row[c] ?? "").trim());
            const valueLines: string[] =
              value.length > 0
                ? doc.splitTextToSize(value, valueWidth)
                : [""];

            ensureSpace(lineHeight);
            doc.text(label, marginX, y);
            doc.text(valueLines[0], valueX, y);
            y += lineHeight;

            for (let li = 1; li < valueLines.length; li++) {
              ensureSpace(lineHeight);
              doc.text(valueLines[li], valueX, y);
              y += lineHeight;
            }
          }
          if (r < b.rows.length - 1) y += rowGap;
        }
        y += 8;
        break;
      }
    }
  }

  doc.save(filename);
}

// ─── Evidentiary Package ──────────────────────────────────────────────────────
// Upgrades the single dispute letter into the full evidentiary package the site
// copy promises: cover page → dispute letter → chronological timeline →
// financial calculation worksheet → regulatory citation appendix → deadline
// summary. Shared low-level renderer keeps formatting and page numbers uniform.

export interface EvidentiaryPackageInput {
  letterMarkdown: string;
  caseId: string;
  patientName?: string;
  providerName?: string;
  payerName?: string;
  accountNumber?: string;
  memberId?: string;
  dateOfService?: string;
  preparedDate: string; // human-readable, e.g. "March 15, 2024"
  errors: BillingError[];
  cbsSet?: NormalizedCBSSet | null;
  deadlines?: DeadlineResult[];
  potentialSavings?: number;
}

// Print-friendly palette (mostly ink-on-white with a single restrained accent).
const INK: [number, number, number] = [26, 26, 26];
const MUTE: [number, number, number] = [96, 96, 96];
const FAINT: [number, number, number] = [150, 150, 150];
const RULE: [number, number, number] = [210, 210, 210];
const ACCENT: [number, number, number] = [160, 130, 90];
const HEAD_FILL: [number, number, number] = [240, 237, 231];

const URGENCY_COLOR: Record<UrgencyLevel, [number, number, number]> = {
  missed: [150, 60, 52],
  critical: [180, 70, 60],
  high: [186, 138, 70],
  moderate: [120, 140, 110],
  informational: [120, 120, 120],
};

interface Env {
  doc: jsPDF;
  pageWidth: number;
  pageHeight: number;
  marginX: number;
  marginTop: number;
  marginBottom: number;
  contentWidth: number;
  y: number;
}

function fmtMoney(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  const abs = Math.abs(v).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return (v < 0 ? "-$" : "$") + abs;
}

// Timezone-safe: document dates are calendar dates and must not render a day
// early for viewers west of Greenwich (Jun 28 EOB date showing "Jun 27").
function fmtDateISO(s: string | null | undefined): string {
  return formatCalendarDate(s, { year: "numeric", month: "short", day: "numeric" });
}

function errorTypeLabel(type: string): string {
  switch (type) {
    case "overcharge": return "Overcharge";
    case "unbundling": return "Unbundling";
    case "duplicate": return "Duplicate charge";
    case "mue": return "MUE violation";
    case "coverage": return "Coverage issue";
    case "patient_disputed": return "Patient-disputed charge";
    case "rate_unavailable": return "Manual review: no CMS rate";
    case "reference_data_missing": return "Reference data unavailable";
    case "coding_observation": return "Coding observation: informational";
    default: return type.replace(/_/g, " ");
  }
}

function discrepancyTypeLabel(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Low-level layout primitives (operate on a mutable Env) ───────────────────
function newPage(env: Env): void {
  env.doc.addPage();
  env.y = env.marginTop;
}

function ensure(env: Env, need: number): void {
  if (env.y + need > env.pageHeight - env.marginBottom) newPage(env);
}

function divider(env: Env): void {
  ensure(env, 16);
  env.y += 4;
  env.doc.setDrawColor(...RULE);
  env.doc.setLineWidth(0.5);
  env.doc.line(env.marginX, env.y, env.marginX + env.contentWidth, env.y);
  env.y += 12;
}

function para(
  env: Env,
  text: string,
  opts?: { size?: number; color?: [number, number, number]; italic?: boolean; gap?: number; lh?: number }
): void {
  const size = opts?.size ?? 10.5;
  const lh = opts?.lh ?? 15;
  env.doc.setFont("helvetica", opts?.italic ? "italic" : "normal");
  env.doc.setFontSize(size);
  env.doc.setTextColor(...(opts?.color ?? INK));
  for (const seg of stripInline(text).split("\n")) {
    const lines = env.doc.splitTextToSize(seg, env.contentWidth);
    for (const line of lines) {
      ensure(env, lh);
      env.doc.text(line, env.marginX, env.y);
      env.y += lh;
    }
  }
  env.y += opts?.gap ?? 8;
}

function heading(env: Env, text: string, size: number, gapBefore = 10, gapAfter = 6): void {
  if (env.y > env.marginTop) env.y += gapBefore;
  ensure(env, size + 6);
  env.doc.setFont("helvetica", "bold");
  env.doc.setFontSize(size);
  env.doc.setTextColor(...INK);
  const lines = env.doc.splitTextToSize(stripInline(text), env.contentWidth);
  for (const line of lines) {
    ensure(env, size + 4);
    env.doc.text(line, env.marginX, env.y);
    env.y += size + 4;
  }
  env.y += gapAfter;
}

function bullets(env: Env, items: string[], opts?: { size?: number; color?: [number, number, number] }): void {
  const size = opts?.size ?? 10.5;
  const lh = 15;
  const indent = 16;
  env.doc.setFont("helvetica", "normal");
  env.doc.setFontSize(size);
  env.doc.setTextColor(...(opts?.color ?? INK));
  for (const item of items) {
    const lines = env.doc.splitTextToSize(stripInline(item), env.contentWidth - indent);
    ensure(env, lh);
    env.doc.text("•", env.marginX, env.y);
    lines.forEach((ln: string, j: number) => {
      if (j > 0) ensure(env, lh);
      env.doc.text(ln, env.marginX + indent, env.y);
      env.y += lh;
    });
    env.y += 2;
  }
  env.y += 6;
}

// Section divider page: large kicker + title that opens each major section.
function sectionTitle(env: Env, kicker: string, title: string, subtitle?: string): void {
  newPage(env);
  env.y += 8;
  env.doc.setFont("helvetica", "bold");
  env.doc.setFontSize(10);
  // Gold as TEXT fails contrast in the printed artifact; kickers are ink with
  // letterspacing. Gold survives only in the drawn rule lines below.
  env.doc.setTextColor(...INK);
  env.doc.text(kicker.toUpperCase(), env.marginX, env.y, { charSpace: 1.5 });
  env.y += 10;
  env.doc.setDrawColor(...ACCENT);
  env.doc.setLineWidth(1);
  env.doc.line(env.marginX, env.y, env.marginX + 44, env.y);
  env.y += 22;
  env.doc.setFont("helvetica", "bold");
  env.doc.setFontSize(22);
  env.doc.setTextColor(...INK);
  for (const line of env.doc.splitTextToSize(title, env.contentWidth)) {
    env.doc.text(line, env.marginX, env.y);
    env.y += 26;
  }
  env.y += 6;
  if (subtitle) para(env, subtitle, { size: 11, color: MUTE, italic: true, gap: 14 });
}

interface ColDef {
  header: string;
  weight: number;
  align?: "left" | "right";
}

function renderTable(env: Env, cols: ColDef[], rows: string[][]): void {
  const totalWeight = cols.reduce((s, c) => s + c.weight, 0);
  const colW = cols.map((c) => (c.weight / totalWeight) * env.contentWidth);
  const padX = 6;
  const padY = 6;
  const fs = 9;
  const lh = 12;

  const drawHeader = () => {
    const rowH = lh + padY * 2;
    ensure(env, rowH + lh);
    env.doc.setFillColor(...HEAD_FILL);
    env.doc.rect(env.marginX, env.y, env.contentWidth, rowH, "F");
    env.doc.setFont("helvetica", "bold");
    env.doc.setFontSize(fs);
    env.doc.setTextColor(...INK);
    let x = env.marginX;
    cols.forEach((c, i) => {
      const right = c.align === "right";
      const tx = right ? x + colW[i] - padX : x + padX;
      env.doc.text(c.header, tx, env.y + padY + lh - 3, { align: right ? "right" : "left" });
      x += colW[i];
    });
    env.y += rowH;
  };

  drawHeader();
  for (const row of rows) {
    const cellLines = row.map((cell, i) =>
      env.doc.splitTextToSize(String(cell ?? ""), colW[i] - padX * 2)
    );
    const lineCount = Math.max(1, ...cellLines.map((l) => l.length));
    const rowH = lineCount * lh + padY * 2;
    if (env.y + rowH > env.pageHeight - env.marginBottom) {
      newPage(env);
      drawHeader();
    }
    env.doc.setFont("helvetica", "normal");
    env.doc.setFontSize(fs);
    env.doc.setTextColor(...INK);
    let x = env.marginX;
    cols.forEach((c, i) => {
      const right = c.align === "right";
      const tx = right ? x + colW[i] - padX : x + padX;
      cellLines[i].forEach((ln: string, li: number) => {
        env.doc.text(ln, tx, env.y + padY + lh - 3 + li * lh, { align: right ? "right" : "left" });
      });
      x += colW[i];
    });
    env.doc.setDrawColor(...RULE);
    env.doc.setLineWidth(0.5);
    env.doc.line(env.marginX, env.y + rowH, env.marginX + env.contentWidth, env.y + rowH);
    env.y += rowH;
  }
  env.y += 8;
}

// ── Cover page ────────────────────────────────────────────────────────────────
function renderCover(env: Env, input: EvidentiaryPackageInput, sections: string[]): void {
  const { doc } = env;
  env.y = env.marginTop + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text(`${BRAND_NAME.toUpperCase()} · MEDICAL BILL ADVOCACY`, env.marginX, env.y, { charSpace: 1.5 });
  env.y += 40;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(34);
  doc.setTextColor(...INK);
  doc.text("Evidentiary Package", env.marginX, env.y);
  env.y += 30;

  doc.setFont("helvetica", "italic");
  doc.setFontSize(13);
  doc.setTextColor(...MUTE);
  for (const line of doc.splitTextToSize(
    "Dispute documentation prepared for submission to your insurer and provider.",
    env.contentWidth
  )) {
    doc.text(line, env.marginX, env.y);
    env.y += 18;
  }

  env.y += 16;
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(1.5);
  doc.line(env.marginX, env.y, env.marginX + 60, env.y);
  env.y += 28;

  // Identity block — only rows that have a value.
  const idRows: [string, string | undefined][] = [
    ["Patient", input.patientName],
    ["Provider", input.providerName],
    ["Insurer / Payer", input.payerName],
    ["Account number", input.accountNumber],
    ["Member ID", input.memberId],
    ["Date of service", input.dateOfService],
    ["Case reference", `#${input.caseId.slice(0, 8).toUpperCase()}`],
    ["Date prepared", input.preparedDate],
  ];
  doc.setFontSize(10.5);
  for (const [k, v] of idRows) {
    if (!v || !String(v).trim()) continue;
    ensure(env, 18);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTE);
    doc.text(k, env.marginX, env.y);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(String(v), env.marginX + 150, env.y);
    env.y += 18;
  }

  // Summary band.
  env.y += 14;
  const discCount =
    input.errors.length + (input.cbsSet?.crossDocumentDiscrepancies.length ?? 0);
  const totalImpact = computeTotalImpact(input);
  const deadlineCount = input.deadlines?.length ?? 0;
  const bandH = 64;
  ensure(env, bandH);
  doc.setFillColor(...HEAD_FILL);
  doc.rect(env.marginX, env.y, env.contentWidth, bandH, "F");
  const stats: [string, string][] = [
    [String(discCount), discCount === 1 ? "discrepancy" : "discrepancies"],
    [fmtMoney(totalImpact), "identified impact"],
    [String(deadlineCount), deadlineCount === 1 ? "active deadline" : "active deadlines"],
  ];
  const cellW = env.contentWidth / stats.length;
  stats.forEach(([big, small], i) => {
    const cx = env.marginX + cellW * i + cellW / 2;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...INK);
    doc.text(big, cx, env.y + 28, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...MUTE);
    doc.text(small.toUpperCase(), cx, env.y + 46, { align: "center", charSpace: 0.8 });
  });
  env.y += bandH + 28;

  // Contents.
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("CONTENTS", env.marginX, env.y, { charSpace: 1.5 });
  env.y += 16;
  doc.setFontSize(11);
  sections.forEach((s, i) => {
    ensure(env, 18);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...INK);
    doc.text(`${i + 1}.`, env.marginX, env.y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...INK);
    doc.text(s, env.marginX + 22, env.y);
    env.y += 18;
  });

  // Disclaimer pinned near the bottom.
  const discY = env.pageHeight - env.marginBottom - 40;
  if (env.y < discY) env.y = discY;
  doc.setDrawColor(...RULE);
  doc.setLineWidth(0.5);
  doc.line(env.marginX, env.y, env.marginX + env.contentWidth, env.y);
  env.y += 12;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(8.5);
  doc.setTextColor(...FAINT);
  for (const line of doc.splitTextToSize(
    "This package is generated to help you assert your rights and is not legal advice. Figures are estimates based on the documents you provided. Verify all amounts against your own records before submitting.",
    env.contentWidth
  )) {
    doc.text(line, env.marginX, env.y);
    env.y += 11;
  }
}

// ── Section 1: Dispute letter (reuses the existing markdown rendering) ────────
function renderLetterBlocks(env: Env, markdown: string): void {
  const blocks = parseMarkdown(stripUnfilledPlaceholders(markdown));
  for (const b of blocks) {
    switch (b.kind) {
      case "h1":
        heading(env, b.text, 16, 8, 6);
        break;
      case "h2":
        heading(env, b.text, 13, 6, 4);
        break;
      case "h3":
        heading(env, b.text.toUpperCase(), 11, 4, 2);
        break;
      case "p":
        para(env, b.text, { size: 11, lh: 16 });
        break;
      case "ul":
        bullets(env, b.items, { size: 11 });
        break;
      case "ol": {
        env.doc.setFont("helvetica", "normal");
        env.doc.setFontSize(11);
        env.doc.setTextColor(...INK);
        b.items.forEach((item, i) => {
          const lines = env.doc.splitTextToSize(stripInline(item), env.contentWidth - 18);
          ensure(env, 16);
          env.doc.text(`${i + 1}.`, env.marginX, env.y);
          lines.forEach((ln: string, j: number) => {
            if (j > 0) ensure(env, 16);
            env.doc.text(ln, env.marginX + 18, env.y);
            env.y += 16;
          });
          env.y += 2;
        });
        env.y += 6;
        break;
      }
      case "hr":
        divider(env);
        break;
      case "table": {
        const cols: ColDef[] = b.headers.map((h) => ({ header: h, weight: 1 }));
        if (cols.length > 0) renderTable(env, cols, b.rows);
        break;
      }
    }
  }
}

// ── Section 2: Chronological timeline ─────────────────────────────────────────
function renderTimeline(env: Env, input: EvidentiaryPackageInput): void {
  const events: TimelineEvent[] = (input.cbsSet?.timeline ?? [])
    .slice()
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const inconsistencies = events.filter((e) => e.hasInconsistency).length;

  if (events.length === 0) {
    para(
      env,
      "No multi-document timeline could be reconstructed from the records on file. A chronological timeline is assembled automatically once additional documents, such as an Explanation of Benefits, denial letter, or collection notice, are added to this case.",
      { color: MUTE }
    );
    return;
  }

  para(
    env,
    `The events below are reconstructed in chronological order from the documents on file (${events.length} events${
      inconsistencies > 0
        ? `, ${inconsistencies} flagged as inconsistent`
        : ""
    }). Inconsistent events are marked with a caret (^).`,
    { color: MUTE }
  );

  const rows = events.map((e) => [
    fmtDateISO(e.date),
    (e.hasInconsistency ? "^ " : "") + e.title,
    e.description + (e.inconsistencyDescription ? `  (${e.inconsistencyDescription})` : ""),
    typeof e.financialAmount === "number" ? fmtMoney(e.financialAmount) : "-",
  ]);
  renderTable(
    env,
    [
      { header: "Date", weight: 1.1 },
      { header: "Event", weight: 1.6 },
      { header: "Detail", weight: 3.2 },
      { header: "Amount", weight: 1.1, align: "right" },
    ],
    rows
  );
}

// ── Section 3: Financial calculation worksheet ───────────────────────────────
// Manual-review findings (rate_unavailable / reference_data_missing) carry
// expected_amount 0 because we could NOT price them — counting them at 100% of
// billed would assert dollars the audit never established. They are excluded
// from ALL impact math and listed without dollars.
function pricedErrors(errors: BillingError[]): BillingError[] {
  return errors.filter((e) => !MANUAL_REVIEW_ERROR_TYPES.has(e.error_type));
}

function manualReviewErrors(errors: BillingError[]): BillingError[] {
  return errors.filter((e) => MANUAL_REVIEW_ERROR_TYPES.has(e.error_type));
}

// Same formula as runFullAudit's potentialSavings: audit recoverable and
// cross-document at-risk overlap (an EOB-benchmarked overcharge appears in
// both), so the honest headline is the max, never the sum. The caller's
// potentialSavings (the case's stored headline) wins when provided so the PDF
// can never disagree with the case page.
function computeTotalImpact(input: EvidentiaryPackageInput): number {
  if (typeof input.potentialSavings === "number" && Number.isFinite(input.potentialSavings)) {
    return input.potentialSavings;
  }
  const auditImpact = pricedErrors(input.errors).reduce(
    (s, e) => s + Math.max(0, Number(e.billed_amount ?? 0) - Number(e.expected_amount ?? 0)),
    0
  );
  const crossImpact = (input.cbsSet?.crossDocumentDiscrepancies ?? []).reduce(
    (s, d) => s + Number(d.estimatedDollarImpact ?? 0),
    0
  );
  return Math.max(auditImpact, crossImpact);
}

function renderWorksheet(env: Env, input: EvidentiaryPackageInput): void {
  const cross: CBSDiscrepancy[] = input.cbsSet?.crossDocumentDiscrepancies ?? [];
  const priced = pricedErrors(input.errors);
  const manualReview = manualReviewErrors(input.errors);

  if (input.errors.length === 0 && cross.length === 0) {
    para(env, "No itemized discrepancies were identified in the documents on file.", {
      color: MUTE,
    });
    return;
  }

  para(
    env,
    "Each discrepancy is itemized below with its individual dollar impact. The overcharge column is the difference between the amount billed and the benchmark amount (the Medicare-allowed rate for audit findings, or the corrected amount for cross-document discrepancies).",
    { color: MUTE }
  );

  let auditTotal = 0;
  if (priced.length > 0) {
    heading(env, "Audit findings", 12, 6, 6);
    const rows = priced.map((e) => {
      const impact = Math.max(0, Number(e.billed_amount ?? 0) - Number(e.expected_amount ?? 0));
      auditTotal += impact;
      return [
        e.cpt_code || "-",
        `${errorTypeLabel(e.error_type)}${e.description ? `, ${e.description}` : ""}`,
        fmtMoney(e.billed_amount),
        fmtMoney(e.expected_amount),
        fmtMoney(impact),
      ];
    });
    rows.push(["", "Subtotal: audit findings", "", "", fmtMoney(auditTotal)]);
    renderTable(
      env,
      [
        { header: "Code", weight: 1 },
        { header: "Finding", weight: 3.4 },
        { header: "Billed", weight: 1.1, align: "right" },
        { header: "Expected", weight: 1.1, align: "right" },
        { header: "Overcharge", weight: 1.2, align: "right" },
      ],
      rows
    );
  }

  // Unpriceable findings: listed for completeness, but NEVER with a dollar
  // figure — expected_amount 0 means "couldn't price", not "worth $billed".
  if (manualReview.length > 0) {
    heading(env, "Flagged for manual review (no dollar amount asserted)", 12, 6, 6);
    para(
      env,
      "These lines could not be priced against a published benchmark (proprietary facility or chargemaster codes, or missing reference data). They are flagged for human review and are NOT included in any dollar total in this package.",
      { color: MUTE }
    );
    renderTable(
      env,
      [
        { header: "Code", weight: 1 },
        { header: "Finding", weight: 4.6 },
        { header: "Billed", weight: 1.1, align: "right" },
      ],
      manualReview.map((e) => [
        e.cpt_code || "-",
        `${errorTypeLabel(e.error_type)}${e.description ? `, ${e.description}` : ""}`,
        fmtMoney(e.billed_amount),
      ])
    );
  }

  let crossTotal = 0;
  if (cross.length > 0) {
    heading(env, "Cross-document discrepancies", 12, 6, 6);
    const rows = cross.map((d) => {
      crossTotal += Number(d.estimatedDollarImpact ?? 0);
      return [
        discrepancyTypeLabel(d.type),
        d.severity.toUpperCase(),
        d.description,
        fmtMoney(d.estimatedDollarImpact),
      ];
    });
    rows.push(["", "", "Subtotal: cross-document", fmtMoney(crossTotal)]);
    renderTable(
      env,
      [
        { header: "Type", weight: 1.8 },
        { header: "Severity", weight: 1 },
        { header: "Description", weight: 3.4 },
        { header: "Impact", weight: 1.2, align: "right" },
      ],
      rows
    );
  }

  // Grand total band — same formula as runFullAudit's potentialSavings (the
  // audit and cross-document views overlap, so max, never sum), and the case's
  // stored headline wins when provided so the PDF matches the case page.
  const grand =
    typeof input.potentialSavings === "number" && Number.isFinite(input.potentialSavings)
      ? input.potentialSavings
      : Math.max(auditTotal, crossTotal);
  ensure(env, 40);
  env.y += 4;
  env.doc.setFillColor(...HEAD_FILL);
  env.doc.rect(env.marginX, env.y, env.contentWidth, 34, "F");
  env.doc.setFont("helvetica", "bold");
  env.doc.setFontSize(11);
  env.doc.setTextColor(...INK);
  env.doc.text("Total identified financial impact", env.marginX + 10, env.y + 22);
  env.doc.setFontSize(15);
  env.doc.text(fmtMoney(grand), env.marginX + env.contentWidth - 10, env.y + 23, { align: "right" });
  env.y += 34 + 10;
}

// ── Section 4: Regulatory citation appendix (grouped by statute) ──────────────
interface Statute {
  match: string[];
  name: string;
  summary: string;
}

const STATUTE_MAP: Statute[] = [
  { match: ["no surprises", "300gg-111"], name: "No Surprises Act", summary: "42 U.S.C. § 300gg-111. Protects against surprise balance billing for out-of-network emergency care and certain non-emergency care at in-network facilities; patients owe only in-network cost-sharing." },
  { match: ["1692", "fdcpa", "fair debt"], name: "Fair Debt Collection Practices Act (FDCPA)", summary: "15 U.S.C. § 1692 et seq. Governs third-party debt collectors. You may demand written validation of any medical debt, and collection activity must pause until validation is provided." },
  { match: ["1681", "fcra", "fair credit reporting"], name: "Fair Credit Reporting Act (FCRA)", summary: "15 U.S.C. § 1681 et seq. Grants the right to dispute inaccurate medical debt on your credit report; bureaus must investigate within 30 days." },
  { match: ["2719", "300gg-19", "affordable care", "aca"], name: "Affordable Care Act § 2719", summary: "42 U.S.C. § 300gg-19. Guarantees the right to an internal appeal and an external independent review of denied health insurance claims." },
  { match: ["erisa"], name: "ERISA", summary: "Employee Retirement Income Security Act. Governs claims and appeals for employer-sponsored health plans, including full-and-fair-review rights." },
  { match: ["100-04", "medicare claims processing", "redetermination", "medicare"], name: "Medicare Appeals (Pub. 100-04)", summary: "Medicare Claims Processing Manual. Establishes the multi-level Medicare appeal process beginning with redetermination by the Medicare Administrative Contractor." },
  { match: ["ncci", "ptp"], name: "NCCI Procedure-to-Procedure Edits", summary: "CMS National Correct Coding Initiative edits identify code pairs that should not be billed together (unbundling)." },
  { match: ["mue", "medically unlikely"], name: "Medically Unlikely Edits (MUE)", summary: "CMS per-line unit limits that identify quantities exceeding the clinically supportable maximum for a code." },
  { match: ["clinical laboratory fee schedule", "clfs", "1395l(h)", "1833(h)", "subpart g"], name: "Medicare Clinical Laboratory Fee Schedule", summary: "Social Security Act § 1833(h) (42 U.S.C. § 1395l(h)); 42 CFR Part 414, Subpart G. CMS benchmark allowable amounts for clinical laboratory tests, used to identify lab charges priced above the Medicare-allowed rate." },
  { match: ["physician fee schedule", "pfs", "cms rate", "allowed amount", "fee schedule"], name: "Medicare Physician Fee Schedule", summary: "CMS benchmark allowable amounts used to identify charges priced above the Medicare-allowed rate." },
  { match: ["transparency in coverage"], name: "Transparency in Coverage Rule", summary: "Requires payers to disclose negotiated in-network rates, supporting comparison of billed charges to contracted rates." },
];

function classifyStatute(citation: string): Statute {
  const lc = (citation || "").toLowerCase();
  for (const s of STATUTE_MAP) {
    if (s.match.some((m) => lc.includes(m))) return s;
  }
  return {
    match: [],
    name: citation || "Other authority",
    summary: "Authority cited in support of one or more findings in this package.",
  };
}

function renderCitations(env: Env, input: EvidentiaryPackageInput): void {
  // groupName -> { summary, items[] }
  const groups = new Map<string, { summary: string; items: string[] }>();
  const add = (citation: string, supportingFinding: string) => {
    if (!citation || !citation.trim()) return;
    const st = classifyStatute(citation);
    const g = groups.get(st.name) ?? { summary: st.summary, items: [] };
    if (!g.items.includes(supportingFinding)) g.items.push(supportingFinding);
    groups.set(st.name, g);
  };

  for (const e of input.errors) {
    if (e.rule_violated) add(e.rule_violated, `${e.cpt_code || "Charge"}, ${errorTypeLabel(e.error_type)} (${fmtMoney(Math.max(0, Number(e.billed_amount ?? 0) - Number(e.expected_amount ?? 0)))})`);
  }
  for (const d of input.cbsSet?.crossDocumentDiscrepancies ?? []) {
    for (const reg of d.applicableRegulations ?? []) {
      add(reg, `${discrepancyTypeLabel(d.type)} (${fmtMoney(d.estimatedDollarImpact)})`);
    }
  }
  for (const dl of input.deadlines ?? []) {
    if (dl.applicableRegulation) add(dl.applicableRegulation, `${dl.deadlineType}, deadline ${fmtDateISO(dl.deadlineDate)}`);
  }

  if (groups.size === 0) {
    para(env, "No regulatory citations were attached to the findings on file.", { color: MUTE });
    return;
  }

  para(
    env,
    "Every flagged charge, discrepancy, and deadline in this package is grounded in a specific federal authority. Citations are grouped by statute below, with the findings that rely on each.",
    { color: MUTE }
  );

  for (const [name, g] of groups) {
    heading(env, name, 12, 8, 4);
    para(env, g.summary, { size: 10, color: MUTE, gap: 6 });
    bullets(env, g.items, { size: 10 });
  }
}

// ── Section 5: Deadline summary (urgency tiers) ───────────────────────────────
const TIER_ORDER: UrgencyLevel[] = ["missed", "critical", "high", "moderate", "informational"];
const TIER_LABEL: Record<UrgencyLevel, string> = {
  missed: "Missed: act immediately to preserve your rights",
  critical: "Critical: 7 days or less",
  high: "High: within 30 days",
  moderate: "Moderate: within 90 days",
  informational: "Informational: long lead time",
};

function renderDeadlines(env: Env, input: EvidentiaryPackageInput): void {
  const deadlines = input.deadlines ?? [];
  if (deadlines.length === 0) {
    para(
      env,
      "No statutory deadlines were triggered by the documents on file. Deadlines populate automatically once a dated denial, EOB, bill, or collection notice is added to this case.",
      { color: MUTE }
    );
    return;
  }

  para(
    env,
    "Deadlines are grouped by urgency. Act on the most urgent tier first, missing a deadline can forfeit your right to appeal or dispute.",
    { color: MUTE }
  );

  for (const tier of TIER_ORDER) {
    const inTier = deadlines.filter((d) => d.urgencyLevel === tier);
    if (inTier.length === 0) continue;

    // Tier header with a colored marker.
    ensure(env, 24);
    env.y += 6;
    const [r, g, b] = URGENCY_COLOR[tier];
    env.doc.setFillColor(r, g, b);
    env.doc.circle(env.marginX + 4, env.y - 3, 4, "F");
    env.doc.setFont("helvetica", "bold");
    env.doc.setFontSize(12);
    env.doc.setTextColor(...INK);
    env.doc.text(TIER_LABEL[tier], env.marginX + 16, env.y);
    env.y += 16;

    for (const d of inTier) {
      const daysNote =
        d.daysRemaining < 0
          ? `${Math.abs(d.daysRemaining)} days overdue`
          : `${d.daysRemaining} days remaining`;
      heading(env, d.deadlineType, 11, 6, 2);
      para(env, `Due ${fmtDateISO(d.deadlineDate)} · ${daysNote}`, { size: 10, color: MUTE, gap: 4 });
      para(env, `Action: ${d.actionRequired}`, { size: 10, gap: 4 });
      para(env, `Escalation: ${d.escalationPath}`, { size: 10, color: MUTE, gap: 4 });
      para(env, `Authority: ${d.applicableRegulation}`, { size: 9, color: FAINT, gap: 8 });
    }
  }
}

// ── Footers / page numbers across the whole package ──────────────────────────
function addFooters(env: Env, caseShortId: string): void {
  const { doc } = env;
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    const fy = ph - 36;
    doc.setDrawColor(...RULE);
    doc.setLineWidth(0.5);
    doc.line(env.marginX, fy - 10, pw - env.marginX, fy - 10);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...FAINT);
    doc.text(`${BRAND_NAME} · Medical Bill Advocacy`, env.marginX, fy);
    doc.text(`Evidentiary Package · Case #${caseShortId}`, pw / 2, fy, { align: "center" });
    doc.text(`Page ${i} of ${total}`, pw - env.marginX, fy, { align: "right" });
  }
}

export function generateEvidentiaryPackage(
  input: EvidentiaryPackageInput,
  filename: string
): void {
  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 64;
  const env: Env = {
    doc,
    pageWidth,
    pageHeight,
    marginX,
    marginTop: 72,
    marginBottom: 64,
    contentWidth: pageWidth - marginX * 2,
    y: 72,
  };

  const sections = [
    "Dispute Letter",
    "Chronological Timeline",
    "Financial Calculation Worksheet",
    "Regulatory Citation Appendix",
    "Deadline Summary",
  ];

  renderCover(env, input, sections);

  sectionTitle(env, "Section 1", "Dispute Letter", "The formal letter to send to your insurer and provider.");
  renderLetterBlocks(env, input.letterMarkdown);

  sectionTitle(env, "Section 2", "Chronological Timeline", "Every dated event across your documents, in order.");
  renderTimeline(env, input);

  sectionTitle(env, "Section 3", "Financial Calculation Worksheet", "Each discrepancy itemized with its dollar impact.");
  renderWorksheet(env, input);

  sectionTitle(env, "Section 4", "Regulatory Citation Appendix", "The federal authority behind each finding, grouped by statute.");
  renderCitations(env, input);

  sectionTitle(env, "Section 5", "Deadline Summary", "Filing windows ranked by urgency.");
  renderDeadlines(env, input);

  addFooters(env, input.caseId.slice(0, 8).toUpperCase());

  doc.save(filename);
}
