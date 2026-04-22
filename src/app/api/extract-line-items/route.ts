import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  extractBillContent,
  isAllowedMediaType,
  MAX_FILE_BYTES
} from '@/lib/billExtractor'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user }
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: 'File exceeds 20 MB limit' },
        { status: 413 }
      )
    }

    if (!isAllowedMediaType(file.type)) {
      return NextResponse.json(
        {
          error: `Unsupported file type: ${file.type || 'unknown'}. Upload a PDF, JPG, or PNG.`
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
