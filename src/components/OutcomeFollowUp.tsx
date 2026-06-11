'use client'

import React, { useState, useEffect } from 'react'
import { updateOutcome, getOutcome } from '@/lib/outcomes/store'
import type { DisputeOutcomeLabel } from '@/lib/outcomes/store'

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

export function OutcomeFollowUp({ outcomeId, dollarAmountDisputed }: OutcomeFollowUpProps) {
  const [outcome, setOutcome] = useState<DisputeOutcomeLabel | null>(null)
  const [status, setStatus] = useState<OutcomeStatus | null>(null)
  const [amountRecovered, setAmountRecovered] = useState('')
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    const stored = getOutcome(outcomeId)
    if (stored) {
      setOutcome(stored)
      if (stored.status !== 'pending') setSubmitted(true)
    }
  }, [outcomeId])

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
    const stored = getOutcome(outcomeId)
    if (stored) setOutcome(stored)
    setSubmitted(true)
  }

  const StatusBtn = ({ s, label }: { s: OutcomeStatus; label: string }) => (
    <button
      onClick={() => setStatus(s)}
      style={{
        ...sans('12px', status === s ? '#0D0D0D' : '#A89F96'),
        backgroundColor: status === s ? '#C8A97E' : 'transparent',
        border: `1px solid ${status === s ? '#C8A97E' : '#2A2A2A'}`,
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

  return (
    <div style={{ border: '1px solid #1C1C1C', padding: '20px', marginTop: '24px', backgroundColor: '#0D0D0D' }}>
      <div style={{ ...sans('11px', '#C8A97E'), letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '8px' }}>
        How did your dispute go?
      </div>
      <div style={{ ...sans('13px', '#5F5648'), marginBottom: '16px' }}>
        Tracking outcomes helps improve recovery predictions for every VERITY user.
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
        <StatusBtn s="in_progress" label="Still waiting" />
        <StatusBtn s="won" label="Won — full amount" />
        <StatusBtn s="partial" label="Won — partial" />
        <StatusBtn s="lost" label="Lost" />
        <StatusBtn s="abandoned" label="Gave up" />
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
