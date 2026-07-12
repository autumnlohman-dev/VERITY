'use client'

import React, { useState, useEffect } from 'react'
import { updateOutcome, getOutcome, hydrateOutcomes } from '@/lib/outcomes/store'
import type { DisputeOutcomeLabel } from '@/lib/outcomes/store'
import { useClientMemo } from '@/lib/useClientMemo'

const sans = (size: string, color = 'var(--ink-soft)', extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-public-sans), system-ui, sans-serif',
  fontSize: size,
  color,
  ...extra,
})

interface OutcomeFollowUpProps {
  outcomeId: string
  dollarAmountDisputed: number
}

type OutcomeStatus = 'won' | 'partial' | 'lost' | 'abandoned' | 'in_progress'

// Declared at module scope (not inside the component) so it isn't recreated on
// every render — recreating a component type resets its state and trips the
// react-hooks lint.
function StatusButton({ label, active, onSelect }: { label: string; active: boolean; onSelect: () => void }) {
  return (
    <button
      onClick={onSelect}
      style={{
        ...sans('12px', active ? 'var(--ink)' : 'var(--ink-soft)'),
        backgroundColor: active ? '#C8A97E' : 'transparent',
        border: `1px solid ${active ? '#C8A97E' : 'var(--line)'}`,
        padding: '8px 16px',
        cursor: 'pointer',
        letterSpacing: '0.08em',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

export function OutcomeFollowUp({ outcomeId, dollarAmountDisputed }: OutcomeFollowUpProps) {
  const [status, setStatus] = useState<OutcomeStatus | null>(null)
  const [amountRecovered, setAmountRecovered] = useState('')
  // Bumped after a write (or hydration) so the stored-outcome snapshot below
  // re-reads the store.
  const [version, setVersion] = useState(0)

  // Authenticated users read outcomes from Supabase: hydration fills the
  // store's read cache (running the one-time legacy localStorage migration),
  // then the version bump re-renders with the durable copy. Guests hydrate
  // from localStorage, same behavior as before.
  useEffect(() => {
    let cancelled = false
    void hydrateOutcomes().then(() => {
      if (!cancelled) setVersion(v => v + 1)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Read the persisted outcome from the store client-side (hydration-safe).
  const outcome = useClientMemo<DisputeOutcomeLabel | null>(
    `${outcomeId}:${version}`,
    () => getOutcome(outcomeId),
    null,
  )
  // A recorded outcome (any non-pending status) means the form was submitted.
  const submitted = !!outcome && outcome.status !== 'pending'

  if (submitted && outcome) {
    const statusLabels: Record<string, { label: string; color: string }> = {
      won: { label: 'Won, Full Amount', color: '#7A9E87' },
      partial: { label: 'Partial Win', color: 'var(--brand)' },
      lost: { label: 'Dispute Lost', color: '#C47C6A' },
      abandoned: { label: 'Abandoned', color: 'var(--ink-soft)' },
      in_progress: { label: 'In Progress', color: 'var(--brand)' },
    }
    const cfg = statusLabels[outcome.status] || statusLabels.in_progress
    return (
      <div style={{ border: '1px solid var(--line)', padding: '16px', marginTop: '16px' }}>
        <div style={{ ...sans('11px', 'var(--ink-soft)'), letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '6px' }}>Dispute outcome recorded</div>
        <span style={{ ...sans('13px', cfg.color), fontWeight: 600 }}>{cfg.label}</span>
        {outcome.amountRecovered ? (
          <span style={{ ...sans('13px', 'var(--ink-soft)'), marginLeft: '12px' }}>
            ${outcome.amountRecovered.toLocaleString('en-US', { minimumFractionDigits: 2 })} recovered
          </span>
        ) : null}
      </div>
    )
  }

  const handleSubmit = () => {
    if (!status) return
    updateOutcome(outcomeId, {
      status,
      resolvedAt: new Date().toISOString(),
      amountRecovered: amountRecovered ? parseFloat(amountRecovered) : undefined,
    })
    // Re-read the now-updated outcome and switch to the recorded view.
    setVersion(v => v + 1)
  }

  return (
    <div style={{ border: '1px solid var(--line)', padding: '20px', marginTop: '24px', backgroundColor: 'var(--surface-raised)' }}>
      <div style={{ ...sans('11px', 'var(--brand)'), letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '8px' }}>
        How did your dispute go?
      </div>
      <div style={{ ...sans('13px', 'var(--ink-soft)'), marginBottom: '16px' }}>
        Tracking outcomes helps improve recovery predictions for every VERITY user.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <StatusButton label="Still waiting" active={status === 'in_progress'} onSelect={() => setStatus('in_progress')} />
        <StatusButton label="Won, full amount" active={status === 'won'} onSelect={() => setStatus('won')} />
        <StatusButton label="Won, partial" active={status === 'partial'} onSelect={() => setStatus('partial')} />
        <StatusButton label="Lost" active={status === 'lost'} onSelect={() => setStatus('lost')} />
        <StatusButton label="Gave up" active={status === 'abandoned'} onSelect={() => setStatus('abandoned')} />
      </div>

      {(status === 'won' || status === 'partial') && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ ...sans('13px', 'var(--ink)'), marginBottom: '8px' }}>
            How much did you recover? (originally disputed: ${dollarAmountDisputed.toFixed(2)})
          </div>
          <input
            type="number"
            value={amountRecovered}
            onChange={e => setAmountRecovered(e.target.value)}
            placeholder="0.00"
            style={{
              ...sans('14px', 'var(--ink)'),
              backgroundColor: 'var(--surface-raised)',
              border: '1px solid var(--line)',
              padding: '10px 14px',
              width: '160px',
              outline: 'none',
            }}
          />
        </div>
      )}

      {status && (
        <button
          onClick={handleSubmit}
          style={{
            ...sans('12px', 'var(--ink)'),
            backgroundColor: 'var(--brand-fill)',
            border: 'none',
            padding: '12px 28px',
            cursor: 'pointer',
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            fontWeight: 600,
          }}
        >
          Save outcome
        </button>
      )}
    </div>
  )
}
