'use client'

import React, { useState } from 'react'
import type { FinancialOutcomePrediction } from '@/lib/predictions/outcomePrediction'
import type { AdvocacyWorkflow, AdvocacyAction } from '@/lib/agent/advocacyAgent'

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
  lineHeight: 1.1,
  fontWeight: 400,
  ...extra,
})

// ─── Outcome Prediction panel (Component O) ───────────────────────────────────

export function OutcomePredictionPanel({ predictions }: { predictions: FinancialOutcomePrediction[] }) {
  if (predictions.length === 0) return null
  const totalExpected = predictions.reduce((s, p) => s + p.expectedRecoveryAmount, 0)
  const totalLow = predictions.reduce((s, p) => s + p.expectedRecoveryLow, 0)
  const totalHigh = predictions.reduce((s, p) => s + p.expectedRecoveryHigh, 0)
  const longestDays = Math.max(...predictions.map(p => p.estimatedResolutionDays))
  const floor = predictions.reduce((s, p) => s + p.settlementFloor, 0)
  const ceiling = predictions.reduce((s, p) => s + p.settlementCeiling, 0)
  const realN = predictions.reduce((s, p) => s + p.basedOnRealOutcomes, 0)

  return (
    <div style={{ border: '1px solid var(--line)', backgroundColor: 'var(--surface-raised)', padding: '28px', marginBottom: '32px' }}>
      <div style={{ ...sans('11px', 'var(--brand)'), letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '16px' }}>
        Outcome Prediction
      </div>
      <div className="r-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '20px' }}>
        <div>
          <div style={{ ...sans('11px', 'var(--ink-soft)'), marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Expected recovery</div>
          <div style={{ ...serif('34px'), color: '#7A9E87' }}>${totalExpected.toLocaleString()}</div>
          <div style={{ ...sans('11px', 'var(--ink-soft)'), marginTop: '4px' }}>range ${totalLow.toLocaleString()}, ${totalHigh.toLocaleString()}</div>
        </div>
        <div>
          <div style={{ ...sans('11px', 'var(--ink-soft)'), marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Likely timeframe</div>
          <div style={{ ...serif('34px') }}>{longestDays} days</div>
          <div style={{ ...sans('11px', 'var(--ink-soft)'), marginTop: '4px' }}>typical resolution window</div>
        </div>
        <div>
          <div style={{ ...sans('11px', 'var(--ink-soft)'), marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Settlement range</div>
          <div style={{ ...serif('34px'), color: 'var(--brand)' }}>${floor.toLocaleString()}-${ceiling.toLocaleString()}</div>
          <div style={{ ...sans('11px', 'var(--ink-soft)'), marginTop: '4px' }}>statistically likely band</div>
        </div>
      </div>

      {/* Per-discrepancy detail */}
      {predictions.map(p => (
        <div key={p.discrepancyId} style={{ borderTop: '1px solid var(--line)', paddingTop: '14px', marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '6px' }}>
            <span style={{ ...sans('13px', 'var(--ink)'), textTransform: 'capitalize' }}>{p.discrepancyType.replace(/_/g, ' ')}</span>
            <span style={{ ...sans('13px', '#7A9E87'), fontWeight: 600 }}>${p.expectedRecoveryAmount.toLocaleString()} expected</span>
          </div>
          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            <span style={{ ...sans('11px', 'var(--ink-soft)') }}>Escalation: {Math.round(p.escalationProbability * 100)}%</span>
            <span style={{ ...sans('11px', 'var(--ink-soft)') }}>Collection risk if ignored: {Math.round(p.collectionProbability * 100)}%</span>
            <span style={{ ...sans('11px', 'var(--ink-soft)') }}>Credit-report risk: {Math.round(p.creditReportingProbability * 100)}%</span>
            <span style={{ ...sans('11px', 'var(--ink-soft)') }}>Walk-away floor: ${p.walkawayThreshold.toLocaleString()}</span>
          </div>
        </div>
      ))}

      <div style={{ ...sans('10.5px', 'var(--line)'), marginTop: '16px', fontStyle: 'italic' }}>
        {realN > 0
          ? `Predictions informed by ${realN} resolved VERITY dispute(s), blended with industry baselines.`
          : 'Predictions use industry baselines; they sharpen automatically as VERITY dispute outcomes accumulate.'}
      </div>
    </div>
  )
}

// ─── Advocacy Workflow panel (Component N) ────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  planned: 'var(--ink-soft)',
  ready: '#C8A97E',
  sent: 'var(--brand)',
  response_received: '#C8A97E',
  completed: '#7A9E87',
  skipped: 'var(--line)',
}

export function AdvocacyWorkflowPanel({
  workflow,
  onActionUpdate,
  onAuthorize,
}: {
  workflow: AdvocacyWorkflow | null
  onActionUpdate: (actionId: string, status: AdvocacyAction['status']) => void
  onAuthorize: () => void
}) {
  const [expanded, setExpanded] = useState(true)

  if (!workflow) return null

  if (!workflow.consumerAuthorized) {
    return (
      <div style={{ border: '1px solid #C8A97E', backgroundColor: 'rgba(200,169,126,0.06)', padding: '28px', marginBottom: '32px' }}>
        <div style={{ ...sans('11px', 'var(--brand)'), letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '10px' }}>
          Autonomous Advocacy, Ready
        </div>
        <div style={{ ...serif('22px'), marginBottom: '10px' }}>
          Verity has planned your complete dispute strategy.
        </div>
        <div style={{ ...sans('13px', 'var(--ink-soft)'), marginBottom: '8px' }}>
          {workflow.actions.length} action(s) sequenced · ${workflow.expectedRecovery.toLocaleString()} expected recovery · ${workflow.totalDollarAtStake.toLocaleString()} at stake
        </div>
        <div style={{ ...sans('12px', 'var(--ink-soft)'), marginBottom: '18px' }}>
          Authorize Verity to generate every letter, appeal, and escalation in sequence. You review and send each document; Verity tracks responses and adapts the plan. All communications are administrative actions under your express authorization.
        </div>
        <button
          onClick={onAuthorize}
          style={{ ...sans('12px', 'var(--ink)'), backgroundColor: 'var(--brand-fill)', border: 'none', padding: '14px 32px', cursor: 'pointer', letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600 }}
        >
          Authorize &amp; start my advocacy plan →
        </button>
      </div>
    )
  }

  const done = workflow.actions.filter(a => ['completed', 'skipped'].includes(a.status)).length

  return (
    <div style={{ border: '1px solid var(--line)', backgroundColor: 'var(--surface-raised)', padding: '28px', marginBottom: '32px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '8px' }}>
        <div style={{ ...sans('11px', 'var(--brand)'), letterSpacing: '0.25em', textTransform: 'uppercase' }}>
          Active Advocacy Workflow
        </div>
        <span style={{ ...sans('11px', workflow.status === 'active' ? '#7A9E87' : 'var(--ink-soft)'), letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}>
          {workflow.status} · step {workflow.currentStep} · {done}/{workflow.actions.length} done
        </span>
      </div>

      <button onClick={() => setExpanded(!expanded)} style={{ ...sans('11px', 'var(--ink-soft)'), background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginBottom: '12px' }}>
        {expanded ? '▲ collapse plan' : '▼ expand plan'}
      </button>

      {expanded && workflow.actions
        .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
        .map(a => {
          const isCurrent = a.sequenceOrder === workflow.currentStep
          return (
            <div key={a.actionId} style={{
              borderLeft: `3px solid ${isCurrent ? '#C8A97E' : 'var(--line)'}`,
              backgroundColor: isCurrent ? 'rgba(200,169,126,0.05)' : 'transparent',
              padding: '14px 16px',
              marginBottom: '10px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px', marginBottom: '4px' }}>
                <span style={{ ...sans('13px', 'var(--ink)'), fontWeight: 500 }}>
                  {a.sequenceOrder}. {a.title} {a.parallel ? '(parallel)' : ''}
                </span>
                <span style={{ ...sans('10px', STATUS_COLORS[a.status] || 'var(--ink-soft)'), letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}>
                  {a.status.replace(/_/g, ' ')}
                </span>
              </div>
              <div style={{ ...sans('12px', 'var(--ink-soft)'), marginBottom: '4px' }}>{a.description}</div>
              <div style={{ ...sans('11px', 'var(--ink-soft)') }}>
                To: {a.recipient} · response window {a.daysToWaitForResponse}d
                {a.regulatoryBasis ? ` · ${a.regulatoryBasis}` : ''}
              </div>
              {isCurrent && a.status === 'planned' && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                  <button onClick={() => onActionUpdate(a.actionId, 'sent')} style={{ ...sans('11px', 'var(--ink)'), backgroundColor: 'var(--brand-fill)', border: 'none', padding: '8px 16px', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
                    Mark sent
                  </button>
                  <button onClick={() => onActionUpdate(a.actionId, 'skipped')} style={{ ...sans('11px', 'var(--ink-soft)'), backgroundColor: 'transparent', border: '1px solid var(--line)', padding: '8px 16px', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Skip
                  </button>
                </div>
              )}
              {a.status === 'sent' && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                  <button onClick={() => onActionUpdate(a.actionId, 'response_received')} style={{ ...sans('11px', 'var(--ink)'), backgroundColor: '#7A9E87', border: 'none', padding: '8px 16px', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 600 }}>
                    Response received
                  </button>
                  <button onClick={() => onActionUpdate(a.actionId, 'completed')} style={{ ...sans('11px', 'var(--ink-soft)'), backgroundColor: 'transparent', border: '1px solid var(--line)', padding: '8px 16px', cursor: 'pointer', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Mark resolved
                  </button>
                </div>
              )}
            </div>
          )
        })}
    </div>
  )
}
