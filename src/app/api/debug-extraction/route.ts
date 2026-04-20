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

    const { lineItems, billMetadata, warnings, rawToolInput } =
      await extractBillContent(file)

    return NextResponse.json({
      file: {
        name: file.name,
        mediaType: file.type,
        size: file.size
      },
      rawToolInput,
      lineItems,
      billMetadata,
      warnings,
      counts: {
        lineItems: lineItems.length,
        warnings: warnings.length,
        billedTotal: lineItems.reduce(
          (sum, li) => sum + Number(li.billed_amount || 0),
          0
        )
      }
    })
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('Debug extraction error:', error)
    return NextResponse.json(
      { error: 'Extraction failed', detail: msg },
      { status: 500 }
    )
  }
}
