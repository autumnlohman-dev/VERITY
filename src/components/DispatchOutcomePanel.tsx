'use client'

import React, { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  getAllOutcomes,
  hydrateOutcomes,
  outcomeRowToLabel,
  updateOutcome,
  type DisputeOutcomeLabel,
} from '@/lib/outcomes/store'
import { RESPONSE_RESULTS, validateResponseUpdate, type ResponseResult } from '@/lib/outcomes/respond'
import type { DeadlineUrgency, OutcomeDeadlineType } from '@/lib/deadlines/outcomeWindows'
import { formatCalendarDate } from '@/lib/dates'

// Letter dispatch tracking on the case page: one compact card per mailed
// letter (dispute_outcomes rows with a sent_at), newest first, with the
// record-a-response intake inline. Authenticated users read/write Supabase
// (server-validated via /api/outcomes/respond); guests round-trip the same
// fields through the localStorage store, so the login sync carries them over.
// Hidden entirely when the case has no dispatched letter.

const sans = (size: string, color = 'var(--ink-soft)', extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-public-sans), system-ui, sans-serif',
  fontSize: size,
  color,
  ...extra,
})
const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-lora), Georgia, serif',
  letterSpacing: '-0.015em',
  fontSize: size,
  color: 'var(--ink)',
  lineHeight: 1.15,
  fontWeight: 400,
  ...extra,
})

const STATUS_BADGES: Record<string, { label: string; color: string }> = {
  sent: { label: 'Awaiting response', color: 'var(--brand)' },
  response_received: { label: 'Response received', color: 'var(--brand)' },
  no_response: { label: 'No response yet', color: 'var(--ink-soft)' },
  resolved: { label: 'Resolved in full', color: '#7A9E87' },
  partial: { label: 'Partially resolved', color: 'var(--brand)' },
  denied: { label: 'Denied', color: '#C47C6A' },
}

// Statuses where recording a response is the primary action.
const OPEN_STATUSES = new Set(['sent', 'response_received', 'no_response'])
// Terminal results shown read-only with an Edit affordance.
const TERMINAL_STATUSES = new Set(['resolved', 'partial', 'denied'])

const RESULT_OPTIONS: Array<{ value: ResponseResult; label: string }> = [
  { value: 'resolved', label: 'Resolved in full' },
  { value: 'partial', label: 'Partially resolved' },
  { value: 'denied', label: 'Denied' },
  { value: 'no_response', label: 'Still no response' },
]

function todayISODate(): string {
  return new Date().toISOString().slice(0, 10)
}

interface ActiveDeadlineRow {
  outcomeId: string | null
  deadlineType: OutcomeDeadlineType
  dueDate: string
  urgency: DeadlineUrgency
}

const DEADLINE_LABELS: Record<string, string> = {
  response_window: 'Response expected by',
  escalation_window: 'Escalate by',
  custom: 'Due by',
}

// Urgency colors follow the semantic-color rule: red/amber only for a genuine
// deadline pressure, neutral otherwise.
const URGENCY_COLORS: Record<DeadlineUrgency, string> = {
  critical: 'var(--urgent-red)',
  high: 'var(--urgent-amber)',
  moderate: 'var(--ink-soft)',
  informational: 'var(--ink-soft)',
}

function daysLeft(dueDate: string): number {
  const due = new Date(`${dueDate}T00:00:00Z`).getTime()
  const now = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z').getTime()
  return Math.round((due - now) / 86_400_000)
}

interface PanelProps {
  caseId: string
  /** The case's disputed figure; bounds a partial recovery when present. */
  potentialSavings?: number | null
}

export function DispatchOutcomePanel({ caseId, potentialSavings }: PanelProps) {
  const [rows, setRows] = useState<DisputeOutcomeLabel[]>([])
  const [deadlines, setDeadlines] = useState<ActiveDeadlineRow[]>([])
  const [authed, setAuthed] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    setAuthed(!!session)
    if (session) {
      const [{ data }, { data: dlRows }] = await Promise.all([
        supabase
          .from('dispute_outcomes')
          .select('*')
          .eq('case_id', caseId)
          .not('sent_at', 'is', null)
          .order('created_at', { ascending: false }),
        supabase
          .from('deadlines')
          .select('outcome_id, deadline_type, due_date, urgency')
          .eq('case_id', caseId)
          .eq('status', 'active'),
      ])
      setRows((data ?? []).map((r) => outcomeRowToLabel(r as Record<string, unknown>)))
      setDeadlines(
        (dlRows ?? []).map((d) => ({
          outcomeId: (d.outcome_id as string) ?? null,
          deadlineType: d.deadline_type as OutcomeDeadlineType,
          dueDate: d.due_date as string,
          urgency: d.urgency as DeadlineUrgency,
        }))
      )
    } else {
      await hydrateOutcomes()
      setRows(
        getAllOutcomes()
          .filter((o) => o.caseId === caseId && o.sentAt)
          .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      )
      setDeadlines([])
    }
  }, [caseId])

  useEffect(() => {
    // load() is async and only calls setState after await points — not
    // synchronously in the effect body — so the rule fires a false positive
    // (same pattern as the letter page's load effect).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  // Nothing mailed yet → nothing to record.
  if (rows.length === 0) return null

  return (
    <div style={{ border: '1px solid var(--line)', backgroundColor: 'var(--surface-raised)', padding: '24px', marginTop: '24px' }}>
      <div style={{ ...sans('11px', 'var(--brand)'), letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '4px' }}>
        Letter tracking
      </div>
      <div style={{ ...sans('13px'), marginBottom: '8px' }}>
        What happened after each letter went out. Recording responses keeps your case history complete.
      </div>
      {rows.map((row) => (
        <OutcomeCard
          key={row.outcomeId}
          row={row}
          deadline={deadlines.find((d) => d.outcomeId === row.outcomeId) ?? null}
          authed={authed}
          potentialSavings={potentialSavings ?? null}
          editing={editingId === row.outcomeId}
          onEditToggle={(open) => setEditingId(open ? row.outcomeId : null)}
          onSaved={() => {
            setEditingId(null)
            void load()
          }}
        />
      ))}
    </div>
  )
}

function OutcomeCard({
  row,
  deadline,
  authed,
  potentialSavings,
  editing,
  onEditToggle,
  onSaved,
}: {
  row: DisputeOutcomeLabel
  deadline: ActiveDeadlineRow | null
  authed: boolean
  potentialSavings: number | null
  editing: boolean
  onEditToggle: (open: boolean) => void
  onSaved: () => void
}) {
  const badge = STATUS_BADGES[row.status] ?? { label: row.status, color: 'var(--ink-soft)' }
  const open = OPEN_STATUSES.has(row.status)
  const terminal = TERMINAL_STATUSES.has(row.status)

  return (
    <div style={{ borderTop: '1px solid var(--line)', padding: '16px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px' }}>
        <div>
          <div style={{ ...serif('18px') }}>{row.recipientName || 'Provider billing office'}</div>
          <div style={{ ...sans('12px'), marginTop: '4px' }}>
            Mailed {row.sentAt ? formatCalendarDate(row.sentAt) : ''}
            {row.letterVersion ? ` · letter v${row.letterVersion}` : ''}
          </div>
          {deadline && (
            <div style={{ ...sans('12px', URGENCY_COLORS[deadline.urgency]), marginTop: '4px' }}>
              {DEADLINE_LABELS[deadline.deadlineType] ?? 'Due by'} {formatCalendarDate(deadline.dueDate)}
              {daysLeft(deadline.dueDate) >= 0 ? ` · ${daysLeft(deadline.dueDate)} days left` : ' · past due'}
            </div>
          )}
        </div>
        <span style={{ ...sans('11px', badge.color), letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600 }}>
          {badge.label}
        </span>
      </div>

      {terminal && !editing && (
        <div style={{ marginTop: '10px', display: 'flex', alignItems: 'baseline', gap: '16px', flexWrap: 'wrap' }}>
          <span style={{ ...sans('13px', 'var(--ink)') }}>
            {row.responseReceivedAt ? `Response ${formatCalendarDate(row.responseReceivedAt)}.` : ''}
            {row.amountRecovered != null
              ? ` $${row.amountRecovered.toLocaleString('en-US', { minimumFractionDigits: 2 })} recovered.`
              : ''}
            {row.responseSummary ? ` ${row.responseSummary}` : ''}
          </span>
          <button
            onClick={() => onEditToggle(true)}
            style={{ ...sans('12px'), background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
          >
            Edit
          </button>
        </div>
      )}

      {open && !editing && (
        <button
          onClick={() => onEditToggle(true)}
          style={{
            ...sans('11px', 'var(--ink)'),
            backgroundColor: 'var(--brand-fill)',
            border: 'none',
            padding: '10px 20px',
            marginTop: '12px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Record a response
        </button>
      )}

      {editing && (
        <ResponseForm
          row={row}
          authed={authed}
          potentialSavings={potentialSavings}
          onCancel={() => onEditToggle(false)}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}

function ResponseForm({
  row,
  authed,
  potentialSavings,
  onCancel,
  onSaved,
}: {
  row: DisputeOutcomeLabel
  authed: boolean
  potentialSavings: number | null
  onCancel: () => void
  onSaved: () => void
}) {
  const [result, setResult] = useState<ResponseResult | null>(
    (RESPONSE_RESULTS as readonly string[]).includes(row.status) ? (row.status as ResponseResult) : null
  )
  const [responseAt, setResponseAt] = useState(
    row.responseReceivedAt ? row.responseReceivedAt.slice(0, 10) : todayISODate()
  )
  const [amount, setAmount] = useState(row.amountRecovered != null ? String(row.amountRecovered) : '')
  const [summary, setSummary] = useState(row.responseSummary ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const needsAmount = result === 'resolved' || result === 'partial'
  const minDate = row.sentAt ? row.sentAt.slice(0, 10) : undefined
  const disputedBound =
    row.dollarAmountDisputed > 0 ? row.dollarAmountDisputed : potentialSavings && potentialSavings > 0 ? potentialSavings : null

  async function handleSave() {
    if (saving) return
    setError(null)

    // Mirror the server rules for immediate feedback; the server re-validates.
    const validation = validateResponseUpdate(
      { result, responseAt, responseSummary: summary, amountRecovered: needsAmount ? amount : undefined },
      { sentAt: row.sentAt ?? null, disputedAmount: disputedBound }
    )
    if (!validation.ok) {
      setError(validation.error)
      return
    }

    setSaving(true)
    try {
      if (authed) {
        // Optional evidence upload through the existing signed-URL path.
        let responseDocumentPath: string | undefined
        if (file) {
          const supabase = createClient()
          const res = await fetch('/api/upload-url', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ slot: 'response', fileName: file.name }),
          })
          const json = await res.json().catch(() => ({}))
          if (!res.ok || !json.path || !json.token) {
            setError(json.error || 'Could not upload the response letter. Try again, or save without it.')
            return
          }
          const { error: upErr } = await supabase.storage.from('bills').uploadToSignedUrl(json.path, json.token, file)
          if (upErr) {
            setError('Could not upload the response letter. Try again, or save without it.')
            return
          }
          responseDocumentPath = json.path
        }

        const res = await fetch('/api/outcomes/respond', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            outcomeId: row.outcomeId,
            result,
            responseAt,
            responseSummary: summary || undefined,
            amountRecovered: needsAmount ? Number(amount) : undefined,
            responseDocumentPath,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok) {
          setError(json.error || 'Could not save the response. Please try again.')
          return
        }
      } else {
        // Guest: same fields, localStorage store (login sync carries them over).
        updateOutcome(row.outcomeId, {
          status: validation.update.status,
          responseReceivedAt: validation.update.response_received_at ?? undefined,
          responseSummary: validation.update.response_summary ?? undefined,
          amountRecovered: validation.update.amount_recovered ?? undefined,
          resolvedAt: validation.update.response_received_at ?? undefined,
        })
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ marginTop: '16px', borderLeft: '2px solid var(--brand-fill)', paddingLeft: '16px' }}>
      <div style={{ ...sans('12px', 'var(--ink)'), marginBottom: '8px' }}>What happened?</div>
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {RESULT_OPTIONS.map((opt) => (
          <label
            key={opt.value}
            style={{
              ...sans('12px', result === opt.value ? 'var(--ink)' : 'var(--ink-soft)'),
              border: `1px solid ${result === opt.value ? 'var(--brand-fill)' : 'var(--line)'}`,
              backgroundColor: result === opt.value ? 'var(--brand-fill)' : 'transparent',
              padding: '8px 14px',
              cursor: 'pointer',
            }}
          >
            <input
              type="radio"
              name={`result-${row.outcomeId}`}
              value={opt.value}
              checked={result === opt.value}
              onChange={() => setResult(opt.value)}
              style={{ display: 'none' }}
            />
            {opt.label}
          </label>
        ))}
      </div>

      {result && result !== 'no_response' && (
        <label style={{ ...sans('12px'), display: 'block', marginBottom: '12px' }}>
          Date the response arrived
          <input
            type="date"
            value={responseAt}
            min={minDate}
            max={todayISODate()}
            onChange={(e) => setResponseAt(e.target.value)}
            style={{
              ...sans('13px', 'var(--ink)'),
              display: 'block',
              marginTop: '4px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--line)',
              padding: '8px 10px',
            }}
          />
        </label>
      )}

      {needsAmount && (
        <label style={{ ...sans('12px'), display: 'block', marginBottom: '12px' }}>
          Amount recovered ($)
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            style={{
              ...sans('13px', 'var(--ink)'),
              display: 'block',
              marginTop: '4px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--line)',
              padding: '8px 10px',
              width: '160px',
            }}
          />
        </label>
      )}

      {result && result !== 'no_response' && (
        <label style={{ ...sans('12px'), display: 'block', marginBottom: '12px' }}>
          What did they say? (optional)
          <textarea
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="e.g. they removed the duplicate 80053 charge"
            style={{
              ...sans('13px', 'var(--ink)'),
              display: 'block',
              marginTop: '4px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--line)',
              padding: '8px 10px',
              width: '100%',
              maxWidth: '480px',
              resize: 'vertical',
            }}
          />
        </label>
      )}

      {authed && result && result !== 'no_response' && (
        <label style={{ ...sans('12px'), display: 'block', marginBottom: '16px' }}>
          Attach their response or denial letter (optional)
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.heic"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ ...sans('12px'), display: 'block', marginTop: '4px' }}
          />
        </label>
      )}

      {error && (
        <p role="alert" style={{ ...sans('12px', '#C47C6A'), marginBottom: '12px', lineHeight: 1.5 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: '12px' }}>
        <button
          onClick={() => void handleSave()}
          disabled={saving || !result}
          style={{
            ...sans('11px', 'var(--ink)'),
            backgroundColor: 'var(--brand-fill)',
            border: 'none',
            padding: '10px 20px',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            fontWeight: 500,
            cursor: saving || !result ? 'not-allowed' : 'pointer',
            opacity: saving || !result ? 0.6 : 1,
          }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          style={{ ...sans('12px'), background: 'none', border: '1px solid var(--line)', padding: '10px 20px', cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
