import { jsPDF } from "jspdf";

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

  const blocks = parseMarkdown(markdown);

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
    }
  }

  doc.save(filename);
}
