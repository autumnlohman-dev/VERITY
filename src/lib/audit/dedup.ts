import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Bill-level deduplication ─────────────────────────────────────────────────
// A single physical bill is identified by (provider + date of service + amount
// billed). Re-auditing the same bill — whether by re-uploading signed in or by
// importing a guest claim — must not spawn a second case row (which would double
// the dashboard's "potential savings"). Callers look up an existing match and
// point the user at it instead of inserting a duplicate.

export interface DedupKey {
  userId: string
  providerName: string | null
  dateOfService: string
  amountBilled: number
  /** Exclude this case id from the match (e.g. the shell row just created). */
  excludeCaseId?: string
}

function normProvider(p: string | null | undefined): string {
  return String(p ?? '').trim().toLowerCase()
}

function sameAmount(a: number, b: number): boolean {
  // Compare to the cent; OCR/rounding noise below a cent shouldn't split a bill.
  return Math.round(Number(a || 0) * 100) === Math.round(Number(b || 0) * 100)
}

// Returns the existing matching case ({ id }) or null. Only matches rows that
// have actually been audited (a real provider + date of service), so an empty
// "auditing" shell never counts as a duplicate of itself or anything else.
export async function findDuplicateCase(
  supabase: SupabaseClient,
  key: DedupKey
): Promise<{ id: string } | null> {
  const provider = normProvider(key.providerName)
  const dos = String(key.dateOfService ?? '').trim()
  // Without a provider AND a date of service we can't confidently call it the
  // same bill — skip dedup rather than risk collapsing distinct cases.
  if (!provider || !dos) return null

  const { data, error } = await supabase
    .from('cases')
    .select('id, provider_name, amount_billed, bill_data, created_at')
    .eq('user_id', key.userId)
    .order('created_at', { ascending: true })

  if (error || !Array.isArray(data)) return null

  for (const row of data) {
    if (key.excludeCaseId && row.id === key.excludeCaseId) continue
    if (normProvider(row.provider_name) !== provider) continue
    const rowDos = String(
      (row.bill_data as Record<string, unknown> | null)?.date_of_service ?? ''
    ).trim()
    if (rowDos !== dos) continue
    if (!sameAmount(Number(row.amount_billed ?? 0), key.amountBilled)) continue
    return { id: row.id as string }
  }
  return null
}
