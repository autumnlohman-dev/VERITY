'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { buildDigitalTwin, type DigitalTwin, type TwinCaseInput } from '@/lib/twin/digitalTwin'
import { hydrateOutcomes } from '@/lib/outcomes/store'
import { useClientMemo } from '@/lib/useClientMemo'

const sans = (size: string, color = 'var(--ink-soft)', extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-public-sans), system-ui, sans-serif', fontSize: size, color, ...extra,
})
const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-lora), Georgia, serif',
  letterSpacing: '-0.015em', fontSize: size, color: 'var(--ink)', lineHeight: 1.1, fontWeight: 400, ...extra,
})

export function DigitalTwinView({ cases }: { cases: TwinCaseInput[] }) {
  // Authenticated users' outcomes now live in Supabase; hydrate the outcome
  // store's read cache before folding outcomes into the twin, then rebuild.
  const [outcomesVersion, setOutcomesVersion] = useState(0)
  useEffect(() => {
    let cancelled = false
    void hydrateOutcomes().then(() => {
      if (!cancelled) setOutcomesVersion(v => v + 1)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Build client-side only: the twin folds in stored outcomes + workflows,
  // which don't exist during SSR. useClientMemo keeps the first render in sync
  // with the server HTML (null), then computes once hydrated.
  const twin = useClientMemo<DigitalTwin | null>(
    `${JSON.stringify(cases)}:${outcomesVersion}`,
    () => buildDigitalTwin(cases),
    null,
  )

  if (!twin) return null

  return (
    <div style={{ border: '1px solid var(--line)', backgroundColor: 'var(--surface-raised)', padding: '32px', marginBottom: '48px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
        <div style={{ ...sans('11px', 'var(--brand)'), letterSpacing: '0.25em', textTransform: 'uppercase' }}>
          Your Complete Billing Picture
        </div>
        <Link href="/copilot" style={{ ...sans('11px', 'var(--brand)'), letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none' }}>
          On a call? Open the Copilot →
        </Link>
      </div>
      <div style={{ ...serif('24px'), marginBottom: '24px' }}>{twin.headline}</div>

      {/* Top-line metrics — plain words (Part 6) */}
      <div className="r-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '28px' }}>
        {[
          { label: 'Visits tracked', value: String(twin.totalEncounters) },
          { label: 'Errors found', value: String(twin.totalErrorsIdentified) },
          { label: 'Money back', value: `$${twin.totalRecovered.toLocaleString()}` },
          { label: 'Still in dispute', value: `$${twin.openExposure.toLocaleString()}` },
        ].map(m => (
          <div key={m.label}>
            <div style={{ ...sans('10px', 'var(--ink-soft)'), letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '6px' }}>{m.label}</div>
            <div className="figure" style={{ fontSize: '22px', color: 'var(--ink)' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Provider relationships */}
      {twin.providers.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ ...sans('10px', 'var(--ink-soft)'), letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px' }}>Providers</div>
          {twin.providers.slice(0, 5).map(p => (
            <div key={p.entityName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--line)', padding: '10px 0', flexWrap: 'wrap', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ ...sans('13px', 'var(--ink)') }}>{p.entityName}</span>
                {p.riskFlag && (
                  <span style={{ ...sans('10px', 'var(--ink-soft)'), border: '1px solid var(--urgent-amber)', padding: '2px 8px', letterSpacing: '0.08em' }}>
                    repeat billing issues
                  </span>
                )}
              </div>
              <span style={{ ...sans('11px', 'var(--ink-soft)') }}>
                {p.encounterCount === 1 ? '1 visit' : `${p.encounterCount} visits`} ·{' '}
                {p.totalErrorsFound === 1 ? '1 error' : `${p.totalErrorsFound} errors`} · ${p.totalDisputed.toLocaleString()} disputed
                {p.disputeWinRate !== null ? ` · ${p.disputeWinRate}% of disputes won` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Projected events (Claim 41: predictive liability) */}
      {twin.projectedEvents.length > 0 && (
        <div>
          <div style={{ ...sans('10px', 'var(--ink-soft)'), letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px' }}>
            Looking ahead
          </div>
          {twin.projectedEvents.slice(0, 3).map((e, i) => (
            <div key={i} style={{ borderLeft: '3px solid #C8A97E', backgroundColor: 'rgba(200,169,126,0.05)', padding: '12px 16px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ ...sans('13px', 'var(--ink)') }}>{e.description}</span>
                <span style={{ ...sans('12px', 'var(--brand)'), fontWeight: 600 }}>
                  {Math.round(e.probability * 100)}% likely{e.estimatedAmount ? ` · ~$${e.estimatedAmount.toLocaleString()}` : ''}
                </span>
              </div>
              <div style={{ ...sans('11px', 'var(--ink-soft)'), marginTop: '4px' }}>{e.basis}</div>
            </div>
          ))}
        </div>
      )}

      {twin.activeWorkflows.length > 0 && (
        <div style={{ ...sans('12px', 'var(--ink-soft)'), marginTop: '16px' }}>
          {twin.activeWorkflows.length === 1
            ? '1 dispute in progress'
            : `${twin.activeWorkflows.length} disputes in progress`}
        </div>
      )}
    </div>
  )
}
