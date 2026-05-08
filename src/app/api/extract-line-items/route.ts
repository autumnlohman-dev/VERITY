import Anthropic from '@anthropic-ai/sdk'
import sharp from 'sharp'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  extractBillContent,
  isAllowedMediaType,
  MAX_FILE_BYTES
} from '@/lib/billExtractor'

// Anthropic generation runs longer than Vercel's 10s Hobby / 15s Pro default.
export const maxDuration = 60

function isHeic(file: File): boolean {
  const mt = (file.type || '').toLowerCase()
  if (mt === 'image/heic' || mt === 'image/heif') return true
  // iOS Safari sometimes sends HEIC with an empty or generic MIME type; fall
  // back to the filename extension.
  const name = (file.name || '').toLowerCase()
  return name.endsWith('.heic') || name.endsWith('.heif')
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const input = Buffer.from(await file.arrayBuffer())
  const jpegBuffer = await sharp(input).jpeg({ quality: 90 }).toBuffer()
  const baseName = (file.name || 'bill').replace(/\.(heic|heif)$/i, '') || 'bill'
  return new File([new Uint8Array(jpegBuffer)], `${baseName}.jpg`, {
    type: 'image/jpeg'
  })
}

export async function POST(request: Request) {
  try {
    // Beta: auth gate removed. This route doesn't read or write per-user
    // data, so no further changes are needed.
    await createClient()

    const formData = await request.formData()
    const rawFile = formData.get('file')

    if (!(rawFile instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }

    if (rawFile.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: 'File exceeds 20 MB limit' },
        { status: 413 }
      )
    }

    let file = rawFile
    if (isHeic(rawFile)) {
      try {
        file = await convertHeicToJpeg(rawFile)
      } catch (err) {
        console.error('HEIC conversion failed:', err)
        return NextResponse.json(
          { error: "We couldn't convert this HEIC image. Try exporting it as JPG from your photo app and uploading again." },
          { status: 400 }
        )
      }
    }

    if (!isAllowedMediaType(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type || 'unknown'}. Upload a PDF, JPG, PNG, or HEIC.`
        },
        { status: 400 }
      )
    }

    const { lineItems, billMetadata, warnings } = await extractBillContent(file)
    return NextResponse.json({ lineItems, billMetadata, warnings })
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error('Extract line items (Anthropic) error:', error.status, error.message)
      return NextResponse.json(
        { error: "We couldn't read your bill right now. Please try again in a moment." },
        { status: 503 }
      )
    }
    console.error('Extract line items error:', error)
    return NextResponse.json(
      { error: 'Failed to extract line items' },
      { status: 500 }
    )
  }
}
