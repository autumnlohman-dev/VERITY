// Validation for recording a response on a dispatched letter outcome.
// Pure and shared: the /api/outcomes/respond route enforces these rules
// server-side (the UI mirrors them client-side for immediate feedback, but the
// server is the enforcement point).

export const RESPONSE_RESULTS = ['resolved', 'partial', 'denied', 'no_response'] as const
export type ResponseResult = (typeof RESPONSE_RESULTS)[number]

export interface ResponseInput {
  result: unknown
  /** ISO date/timestamp the response arrived; ignored for no_response. */
  responseAt: unknown
  responseSummary?: unknown
  amountRecovered?: unknown
}

export interface ResponseRowFacts {
  /** dispute_outcomes.sent_at — required; a row without it is not a dispatch. */
  sentAt: string | null
  /** Bound for a partial recovery: the row's disputed amount, else the case's
   *  potential savings, else null (bound check skipped). */
  disputedAmount: number | null
}

export type ResponseValidation =
  | { ok: true; update: {
      status: ResponseResult
      response_received_at: string | null
      response_summary: string | null
      amount_recovered: number | null
    } }
  | { ok: false; error: string }

export function validateResponseUpdate(input: ResponseInput, row: ResponseRowFacts): ResponseValidation {
  if (!row.sentAt) {
    return { ok: false, error: 'This outcome has no dispatch date; only mailed letters can record a response.' }
  }
  const result = typeof input.result === 'string' ? input.result : ''
  if (!(RESPONSE_RESULTS as readonly string[]).includes(result)) {
    return { ok: false, error: 'Pick a result: resolved, partial, denied, or no response.' }
  }

  const summary =
    typeof input.responseSummary === 'string' && input.responseSummary.trim()
      ? input.responseSummary.trim().slice(0, 2000)
      : null

  if (result === 'no_response') {
    // Nothing arrived: there is no response date or amount to record.
    return {
      ok: true,
      update: { status: 'no_response', response_received_at: null, response_summary: summary, amount_recovered: null },
    }
  }

  const responseAtMs = typeof input.responseAt === 'string' ? Date.parse(input.responseAt) : NaN
  if (Number.isNaN(responseAtMs)) {
    return { ok: false, error: 'Enter the date the response was received.' }
  }
  // Compare at day granularity: a response recorded the same day it was mailed
  // is legitimate; one dated before the mailing is not.
  const sentDay = new Date(row.sentAt).setUTCHours(0, 0, 0, 0)
  const responseDay = new Date(responseAtMs).setUTCHours(0, 0, 0, 0)
  if (responseDay < sentDay) {
    return {
      ok: false,
      error: `The response date can't be before the letter was mailed (${new Date(row.sentAt).toISOString().slice(0, 10)}).`,
    }
  }

  let amount: number | null = null
  if (result === 'resolved' || result === 'partial') {
    const n = Number(input.amountRecovered)
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: 'Enter the amount recovered (0 or more).' }
    }
    if (result === 'partial' && row.disputedAmount != null && row.disputedAmount > 0 && n >= row.disputedAmount) {
      return {
        ok: false,
        error: `A partial recovery must be less than the disputed amount ($${Math.round(row.disputedAmount).toLocaleString()}). If you recovered it all, pick "Resolved in full".`,
      }
    }
    amount = Math.round(n * 100) / 100
  }

  return {
    ok: true,
    update: {
      status: result as ResponseResult,
      response_received_at: new Date(responseAtMs).toISOString(),
      response_summary: summary,
      amount_recovered: amount,
    },
  }
}
