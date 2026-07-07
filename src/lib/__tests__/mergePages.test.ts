/**
 * mergePages unit test — no network, no storage.
 *
 * Builds tiny in-memory PDFs/PNGs with pdf-lib, runs them through the
 * multi-file merge boundary, and asserts page counts, order-preservation,
 * passthrough behavior, and the batch caps.
 */
import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { mergePagesToPdf, resolveDocument, validatePageSet, MergeError } from '../documents/mergePages';
import { MAX_PAGES_PER_DOC } from '../documents/limits';

async function makePdf(pageCount: number, width: number): Promise<string> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage([width, 100]);
  return Buffer.from(await doc.save()).toString('base64');
}

// Smallest valid 1×1 PNG.
const TINY_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

describe('mergePagesToPdf', () => {
  it('concatenates PDF pages in the given order', async () => {
    const a = await makePdf(2, 200); // pages of width 200
    const b = await makePdf(1, 300); // page of width 300
    const merged = await mergePagesToPdf([
      { base64: a, ext: 'pdf' },
      { base64: b, ext: 'pdf' },
    ]);
    const doc = await PDFDocument.load(Buffer.from(merged, 'base64'));
    expect(doc.getPageCount()).toBe(3);
    // Order preserved: the width-300 page is LAST.
    expect(Math.round(doc.getPage(0).getWidth())).toBe(200);
    expect(Math.round(doc.getPage(2).getWidth())).toBe(300);
  });

  it('embeds images as full-bleed pages', async () => {
    const pdf = await makePdf(1, 200);
    const merged = await mergePagesToPdf([
      { base64: TINY_PNG, ext: 'png' },
      { base64: pdf, ext: 'pdf' },
    ]);
    const doc = await PDFDocument.load(Buffer.from(merged, 'base64'));
    expect(doc.getPageCount()).toBe(2);
    expect(Math.round(doc.getPage(0).getWidth())).toBe(1); // 1×1 png page first
  });

  it('rejects non-mergeable page types', async () => {
    await expect(
      mergePagesToPdf([{ base64: TINY_PNG, ext: 'webp' }])
    ).rejects.toThrow(MergeError);
  });
});

describe('resolveDocument', () => {
  it('passes a single file through untouched', async () => {
    const doc = await resolveDocument([{ base64: TINY_PNG, ext: 'png' }]);
    expect(doc).toEqual({ base64: TINY_PNG, ext: 'png' });
  });

  it('merges multiple files into one pdf', async () => {
    const pdf = await makePdf(1, 200);
    const doc = await resolveDocument([
      { base64: pdf, ext: 'pdf' },
      { base64: TINY_PNG, ext: 'png' },
    ]);
    expect(doc.ext).toBe('pdf');
    const parsed = await PDFDocument.load(Buffer.from(doc.base64, 'base64'));
    expect(parsed.getPageCount()).toBe(2);
  });
});

describe('validatePageSet caps', () => {
  it('rejects more than MAX_PAGES_PER_DOC files', () => {
    const pages = Array.from({ length: MAX_PAGES_PER_DOC + 1 }, () => ({
      base64: TINY_PNG,
      ext: 'png',
    }));
    expect(() => validatePageSet(pages)).toThrow(MergeError);
  });

  it('rejects a page set whose total exceeds the document byte cap', () => {
    // Two fake pages of ~15 MB decoded each (no need for real content).
    const big = 'A'.repeat(20 * 1024 * 1024); // ~15 MB decoded
    expect(() =>
      validatePageSet([
        { base64: big, ext: 'jpg' },
        { base64: big, ext: 'jpg' },
      ])
    ).toThrow(MergeError);
  });
});
