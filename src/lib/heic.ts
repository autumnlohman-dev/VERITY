import sharp from 'sharp'

// iPhone photos default to HEIC/HEIF, which the Anthropic vision API does not
// accept. We transcode them to JPEG server-side before any extraction call.
// sharp is already a dependency (used for image handling elsewhere).
//
// SERVER-ONLY: sharp is a native module and must never be bundled for the
// browser. Import this from API routes / server-only lib code only.

export function isHeicExt(ext: string): boolean {
  return ext === 'heic' || ext === 'heif'
}

export async function heicToJpegBase64(base64: string): Promise<string> {
  const input = Buffer.from(base64, 'base64')
  const jpeg = await sharp(input).jpeg({ quality: 90 }).toBuffer()
  return jpeg.toString('base64')
}
