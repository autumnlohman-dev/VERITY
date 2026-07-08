import { createClient } from '@/lib/supabase/server'
import { BILLS_BUCKET, isUuid, pathHasPrefix } from '@/lib/storage/bills'
import { NextResponse } from 'next/server'

// DELETE /api/cases/[id] — remove a case and every storage object it owns
// (original bill/EOB page files plus merged PDFs), so deleted cases don't
// accumulate orphaned files in the bills bucket.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isUuid(id)) {
      return NextResponse.json({ error: 'Invalid case id' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: caseRow, error: caseErr } = await supabase
      .from('cases')
      .select('id, bill_data')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (caseErr) {
      console.error(`delete-case[${id}]: lookup failed:`, caseErr)
      return NextResponse.json({ error: 'Failed to load case' }, { status: 500 })
    }
    if (!caseRow) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 })
    }

    // The case's storage objects, as recorded by /api/extract. bill_data is
    // server-written, but re-verify the owner prefix anyway so a tampered row
    // can never point the delete at another user's files.
    const billData =
      caseRow.bill_data && typeof caseRow.bill_data === 'object' && !Array.isArray(caseRow.bill_data)
        ? (caseRow.bill_data as Record<string, unknown>)
        : {}
    const candidates: unknown[] = [
      ...(Array.isArray(billData.billPages) ? billData.billPages : []),
      ...(Array.isArray(billData.eobPages) ? billData.eobPages : []),
      billData.billMergedPath,
      billData.eobMergedPath,
    ]
    const paths = [...new Set(candidates.filter((p): p is string => pathHasPrefix(p, user.id)))]

    // Storage first, then the row. A storage failure aborts with the row (and
    // its path list) intact, so a retry re-runs the whole cleanup — remove()
    // ignores already-deleted objects. The user-scoped client keeps the
    // bucket's delete-own-files RLS policy in the loop.
    if (paths.length > 0) {
      const { error: rmErr } = await supabase.storage.from(BILLS_BUCKET).remove(paths)
      if (rmErr) {
        console.error(`delete-case[${id}]: storage cleanup failed for ${paths.length} object(s):`, rmErr)
        return NextResponse.json({ error: 'Failed to delete case files. Please try again.' }, { status: 500 })
      }
    }

    // dispute_letters and advocacy_workflows cascade with the case;
    // dispute_outcomes.case_id is set null by its FK (outcome labels outlive it).
    const { error: delErr } = await supabase
      .from('cases')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (delErr) {
      console.error(`delete-case[${id}]: row delete failed:`, delErr)
      return NextResponse.json({ error: 'Failed to delete case' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Delete case error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
