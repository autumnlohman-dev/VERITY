'use client'

import React, { useState } from 'react'
import { updateOutcome, getOutcome } from '@/lib/outcomes/store'
import type { DisputeOutcomeLabel } from '@/lib/outcomes/store'
import { useClientMemo } from '@/lib/useClientMemo'

const sans = (size: string, color = '#A89F96', extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
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
        ...sans('12px', active ? '#0D0D0D' : '#A89F96'),
        backgroundColor: active ? '#C8A97E' : 'transparent',
        border: `1px solid ${active ? '#C8A97E' : '#2A2A2A'}`,
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
  // Bumped after a write so the stored-outcome snapshot below re-reads localStorage.
  const [version, setVersion] = useState(0)

  // Read the persisted outcome from localStorage client-side (hydration-safe).
  const outcome = useClientMemo<DisputeOutcomeLabel | null>(
    `${outcomeId}:${version}`,
    () => getOutcome(outcomeId),
    null,
  )
  // A recorded outcome (any non-pending status) means the form was submitted.
  const submitted = !!outcome && outcome.status !== 'pending'

  if (submitted && outcome) {
    const statusLabels: Record<string, { label: string; color: string }> = {
      won: { label: 'Won — Full Amount', color: '#7A9E87' },
      partial: { label: 'Partial Win', color: '#C8A97E' },
      lost: { label: 'Dispute Lost', color: '#C47C6A' },
      abandoned: { label: 'Abandoned', color: '#5F5648' },
      in_progress: { label: 'In Progress', color: '#4A90D9' },
    }
    const cfg = statusLabels[outcome.status] || statusLabels.in_progress
    return (
      <div style={{ border: '1px solid #1C1C1C', padding: '16px', marginTop: '16px' }}>
        <div style={{ ...sans('11px', '#A89F96'), letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '6px' }}>Dispute outcome recorded</div>
        <span style={{ ...sans('13px', cfg.color), fontWeight: 600 }}>{cfg.label}</span>
        {outcome.amountRecovered ? (
          <span style={{ ...sans('13px', '#A89F96'), marginLeft: '12px' }}>
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
    <div style={{ border: '1px solid #1C1C1C', padding: '20px', marginTop: '24px', backgroundColor: '#0D0D0D' }}>
      <div style={{ ...sans('11px', '#C8A97E'), letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '8px' }}>
        How did your dispute go?
      </div>
      <div style={{ ...sans('13px', '#5F5648'), marginBottom: '16px' }}>
        Tracking outcomes helps improve recovery predictions for every VERITY user.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <StatusButton label="Still waiting" active={status === 'in_progress'} onSelect={() => setStatus('in_progress')} />
        <StatusButton label="Won — full amount" active={status === 'won'} onSelect={() => setStatus('won')} />
        <StatusButton label="Won — partial" active={status === 'partial'} onSelect={() => setStatus('partial')} />
        <StatusButton label="Lost" active={status === 'lost'} onSelect={() => setStatus('lost')} />
        <StatusButton label="Gave up" active={status === 'abandoned'} onSelect={() => setStatus('abandoned')} />
      </div>

      {(status === 'won' || status === 'partial') && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ ...sans('13px', '#F5F0E8'), marginBottom: '8px' }}>
            How much did you recover? (originally disputed: ${dollarAmountDisputed.toFixed(2)})
          </div>
          <input
            type="number"
            value={amountRecovered}
            onChange={e => setAmountRecovered(e.target.value)}
            placeholder="0.00"
            style={{
              ...sans('14px', '#F5F0E8'),
              backgroundColor: '#111111',
              border: '1px solid #2A2A2A',
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
            ...sans('12px', '#0D0D0D'),
            backgroundColor: '#C8A97E',
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
