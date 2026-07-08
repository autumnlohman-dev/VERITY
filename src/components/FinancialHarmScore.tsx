'use client'

import React, { useState } from 'react'
import type { FinancialHarmScore } from '@/lib/scores/financialHarmScore'

const TIER_COLORS = {
  low: { bg: 'rgba(122,158,135,0.12)', border: '#7A9E87', text: '#7A9E87', gauge: '#7A9E87' },
  moderate: { bg: 'rgba(200,169,126,0.12)', border: '#C8A97E', text: '#C8A97E', gauge: '#C8A97E' },
  high: { bg: 'rgba(196,124,106,0.12)', border: '#C47C6A', text: '#C47C6A', gauge: '#C47C6A' },
  severe: { bg: 'rgba(200,60,60,0.12)', border: '#C83C3C', text: '#C83C3C', gauge: '#C83C3C' },
}

const sans = (size: string, color = 'var(--ink-soft)', extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-public-sans), system-ui, sans-serif',
  fontSize: size,
  color,
  ...extra,
})

const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-fraunces), Georgia, serif',
  fontOpticalSizing: 'auto',
  letterSpacing: '-0.015em',
  fontSize: size,
  color: 'var(--ink)',
  lineHeight: 1,
  fontWeight: 400,
  ...extra,
})

interface FHSDisplayProps {
  fhs: FinancialHarmScore
}

export function FinancialHarmScoreDisplay({ fhs }: FHSDisplayProps) {
  const [showBreakdown, setShowBreakdown] = useState(false)
  const colors = TIER_COLORS[fhs.tier]
  const pct = Math.min(100, (fhs.score / 1000) * 100)

  return (
    <div style={{
      border: `1px solid ${colors.border}`,
      backgroundColor: colors.bg,
      padding: '32px',
      marginBottom: '32px',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ ...sans('11px', 'var(--ink-soft)'), letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '8px' }}>
            Financial Harm Score
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
            <span style={{ ...serif('72px'), color: colors.text }}>{fhs.score}</span>
            <span style={{ ...sans('12px', colors.text), letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 600 }}>
              {fhs.tierLabel}
            </span>
          </div>
          <div style={{ ...sans('14px', 'var(--ink-soft)'), marginTop: '4px' }}>{fhs.tierDescription}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ ...sans('11px', 'var(--ink-soft)'), letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '4px' }}>Total at Risk</div>
          <div style={{ ...serif('32px'), color: colors.text }}>${fhs.totalDollarAtRisk.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* Gauge bar */}
      <div style={{ marginBottom: '28px' }}>
        <div style={{ height: '6px', backgroundColor: 'var(--line)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            height: '100%',
            width: `${pct}%`,
            backgroundColor: colors.gauge,
            borderRadius: '3px',
            transition: 'width 0.8s ease',
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
          <span style={{ ...sans('10px', 'var(--ink-soft)') }}>0 (Low)</span>
          <span style={{ ...sans('10px', 'var(--ink-soft)') }}>1000 (Severe)</span>
        </div>
      </div>

      {/* Top risks */}
      {fhs.topRisks.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ ...sans('11px', 'var(--ink-soft)'), letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>Top Risks</div>
          {fhs.topRisks.map((risk, i) => (
            <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '8px', alignItems: 'flex-start' }}>
              <span style={{ color: colors.text, flexShrink: 0, marginTop: '2px' }}>•</span>
              <span style={{ ...sans('14px', 'var(--ink)') }}>{risk}</span>
            </div>
          ))}
        </div>
      )}

      {/* Recommended actions */}
      {fhs.recommendedActions.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ ...sans('11px', 'var(--ink-soft)'), letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '12px' }}>Recommended Actions</div>
          {fhs.recommendedActions.map((action, i) => (
            <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '8px', alignItems: 'flex-start' }}>
              <span style={{ ...sans('12px', colors.text), fontWeight: 600, flexShrink: 0, minWidth: '20px' }}>{i + 1}.</span>
              <span style={{ ...sans('14px', 'var(--ink)') }}>{action}</span>
            </div>
          ))}
        </div>
      )}

      {/* Score breakdown toggle */}
      <button
        onClick={() => setShowBreakdown(!showBreakdown)}
        style={{
          ...sans('11px', 'var(--ink-soft)'),
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          letterSpacing: '0.15em',
          textTransform: 'uppercase',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        {showBreakdown ? '▲' : '▼'} Score breakdown
      </button>

      {showBreakdown && (
        <div style={{ marginTop: '16px', borderTop: '1px solid var(--line)', paddingTop: '16px' }}>
          {fhs.components.map((comp, i) => (
            <div key={i} style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ ...sans('12px', 'var(--ink)') }}>{comp.name}</span>
                <span style={{ ...sans('12px', 'var(--ink-soft)') }}>{comp.weight}% weight → {comp.normalizedScore}/100</span>
              </div>
              <div style={{ height: '3px', backgroundColor: 'var(--line)', borderRadius: '2px', marginBottom: '4px' }}>
                <div style={{ height: '100%', width: `${comp.normalizedScore}%`, backgroundColor: colors.gauge, borderRadius: '2px' }} />
              </div>
              <div style={{ ...sans('11px', 'var(--ink-soft)') }}>{comp.description}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Quick intake form for FHS inputs ─────────────────────────────────────────

interface FHSInputs {
  hasActiveCollectionActivity: boolean
  hasCreditReportingImpact: boolean
  hasInsuranceDenial: boolean
}

interface IntakeFormProps {
  onSubmit: (inputs: FHSInputs) => void
  // When re-editing a previously answered questionnaire, prefill the answers.
  initial?: FHSInputs | null
}

// Declared at module scope (not inside FHSIntakeForm) so it isn't recreated on
// every render — recreating a component type resets its state and trips the
// react-hooks lint.
function BtnPair({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <div style={{ ...sans('14px', 'var(--ink)'), marginBottom: '10px' }}>{label}</div>
      <div style={{ display: 'flex', gap: '12px' }}>
        {[{ label: 'Yes', val: true }, { label: 'No', val: false }].map(opt => (
          <button
            key={String(opt.val)}
            onClick={() => onChange(opt.val)}
            style={{
              ...sans('13px', value === opt.val ? 'var(--ink)' : 'var(--ink-soft)'),
              backgroundColor: value === opt.val ? '#C8A97E' : 'transparent',
              border: `1px solid ${value === opt.val ? '#C8A97E' : 'var(--line)'}`,
              padding: '10px 28px',
              cursor: 'pointer',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: value === opt.val ? 600 : 400,
              transition: 'all 0.15s',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

export function FHSIntakeForm({ onSubmit, initial }: IntakeFormProps) {
  const [collection, setCollection] = useState<boolean | null>(initial?.hasActiveCollectionActivity ?? null)
  const [credit, setCredit] = useState<boolean | null>(initial?.hasCreditReportingImpact ?? null)
  const [denial, setDenial] = useState<boolean | null>(initial?.hasInsuranceDenial ?? null)

  const allAnswered = collection !== null && credit !== null && denial !== null

  return (
    <div style={{ border: '1px solid var(--line)', padding: '28px', marginBottom: '32px', backgroundColor: 'var(--surface-raised)' }}>
      <div style={{ ...sans('11px', '#C8A97E'), letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '6px' }}>
        3 quick questions
      </div>
      <div style={{ ...sans('16px', 'var(--ink)'), marginBottom: '24px' }}>
        Help us calculate your full financial risk score
      </div>

      <BtnPair
        label="Are you receiving collection calls or letters about this bill?"
        value={collection}
        onChange={setCollection}
      />
      <BtnPair
        label="Has this bill appeared on your credit report?"
        value={credit}
        onChange={setCredit}
      />
      <BtnPair
        label="Has your insurance company denied this claim?"
        value={denial}
        onChange={setDenial}
      />

      {allAnswered && (
        <button
          onClick={() => onSubmit({
            hasActiveCollectionActivity: collection!,
            hasCreditReportingImpact: credit!,
            hasInsuranceDenial: denial!,
          })}
          style={{
            ...sans('12px', 'var(--ink)'),
            backgroundColor: '#C8A97E',
            border: 'none',
            padding: '14px 32px',
            cursor: 'pointer',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            fontWeight: 600,
            marginTop: '8px',
          }}
        >
          Calculate my risk score →
        </button>
      )}
    </div>
  )
}
