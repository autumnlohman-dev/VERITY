import convert from 'heic-convert'

// iPhone photos default to HEIC/HEIF, which the Anthropic vision API CANNOT
// read. Every HEIC must be transcoded to JPEG before any extraction call —
// for the bill and the EOB, on every upload path (guest, signed-in, claim).
//
// We use heic-convert (libheif compiled to WASM, zero native deps) rather than
// sharp's HEIC decode: sharp only decodes HEIC when its platform binary was
// built with libheif, which is frequently MISSING from Vercel's prebuilt sharp,
// so `sharp(buf).jpeg()` throws at runtime in production. heic-convert ships its
// own WASM decoder and behaves identically everywhere.
//
// SERVER-ONLY: import this from API routes / server-only lib code only.

// HEIC/HEIF is ISO-BMFF: bytes 0..4 are the box size, bytes 4..8 are the box
// type 'ftyp', and bytes 8..12 are the major brand. So at byte offset 4 the
// file reads 'ftyp' + one of these brands. We match on CONTENT because iPhone
// uploads frequently arrive with no extension or an image/heic mimetype — the
// extension is only a hint, never the source of truth.
const HEIC_FTYP_BRANDS = ['ftypheic', 'ftypheix', 'ftypmif1', 'ftypmsf1']

export function isHeicBuffer(buf: Buffer): boolean {
  if (buf.length < 12) return false
  return HEIC_FTYP_BRANDS.includes(buf.toString('latin1', 4, 12))
}

export function isHeicExt(ext: string): boolean {
  return ext === 'heic' || ext === 'heif'
}

async function heicToJpegBuffer(input: Buffer): Promise<Buffer> {
  const out = await convert({ buffer: input, format: 'JPEG', quality: 0.9 })
  return Buffer.from(out)
}

// The single HEIC normalization boundary. Every extraction path funnels its
// (base64, ext) through here before the vision call. If the bytes are HEIC — by
// CONTENT or by extension — they are transcoded to a JPEG buffer and the caller
// is told to treat the file as jpeg downstream. Anything else passes untouched.
// This NEVER rejects a HEIC; it converts it.
export async function normalizeForExtraction(
  base64: string,
  ext: string
): Promise<{ base64: string; ext: string }> {
  const buf = Buffer.from(base64, 'base64')
  if (isHeicExt(ext) || isHeicBuffer(buf)) {
    const jpeg = await heicToJpegBuffer(buf)
    return { base64: jpeg.toString('base64'), ext: 'jpg' }
  }
  return { base64, ext }
}
