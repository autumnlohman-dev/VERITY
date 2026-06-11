'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { buildDigitalTwin, type DigitalTwin, type TwinCaseInput } from '@/lib/twin/digitalTwin'

const sans = (size: string, color = '#A89F96', extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontSize: size, color, ...extra,
})
const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: size, color: '#F5F0E8', lineHeight: 1.1, fontWeight: 400, ...extra,
})

export function DigitalTwinView({ cases }: { cases: TwinCaseInput[] }) {
  const [twin, setTwin] = useState<DigitalTwin | null>(null)

  useEffect(() => {
    // Build client-side: the twin folds in localStorage outcomes + workflows.
    setTwin(buildDigitalTwin(cases))
  }, [cases])

  if (!twin) return null

  return (
    <div style={{ border: '1px solid #2A2A2A', backgroundColor: '#111111', padding: '32px', marginBottom: '48px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '8px', marginBottom: '8px' }}>
        <div style={{ ...sans('11px', '#C8A97E'), letterSpacing: '0.25em', textTransform: 'uppercase' }}>
          Your Complete Billing Picture
        </div>
        <Link href="/copilot" style={{ ...sans('11px', '#C8A97E'), letterSpacing: '0.1em', textTransform: 'uppercase', textDecoration: 'none' }}>
          On a call? Open the Copilot →
        </Link>
      </div>
      <div style={{ ...serif('24px'), marginBottom: '24px' }}>{twin.headline}</div>

      {/* Top-line metrics */}
      <div className="r-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '28px' }}>
        {[
          { label: 'Encounters tracked', value: String(twin.totalEncounters) },
          { label: 'Errors identified', value: String(twin.totalErrorsIdentified) },
          { label: 'Recovered', value: `$${twin.totalRecovered.toLocaleString()}`, color: '#7A9E87' },
          { label: 'Open exposure', value: `$${twin.openExposure.toLocaleString()}`, color: twin.openExposure > 0 ? '#C47C6A' : '#7A9E87' },
        ].map(m => (
          <div key={m.label}>
            <div style={{ ...sans('10px', '#5F5648'), letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '6px' }}>{m.label}</div>
            <div style={{ ...serif('28px'), color: m.color ?? '#F5F0E8' }}>{m.value}</div>
          </div>
        ))}
      </div>

      {/* Provider relationships */}
      {twin.providers.length > 0 && (
        <div style={{ marginBottom: '24px' }}>
          <div style={{ ...sans('10px', '#5F5648'), letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px' }}>Providers</div>
          {twin.providers.slice(0, 5).map(p => (
            <div key={p.entityName} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #1C1C1C', padding: '10px 0', flexWrap: 'wrap', gap: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ ...sans('13px', '#F5F0E8') }}>{p.entityName}</span>
                {p.riskFlag && (
                  <span style={{ ...sans('9px', '#0D0D0D'), backgroundColor: '#C47C6A', padding: '2px 8px', letterSpacing: '0.1em', fontWeight: 700 }}>
                    PATTERN FLAG
                  </span>
                )}
              </div>
              <span style={{ ...sans('11px', '#5F5648') }}>
                {p.encounterCount} encounter(s) · {p.totalErrorsFound} error(s) · ${p.totalDisputed.toLocaleString()} disputed
                {p.disputeWinRate !== null ? ` · ${p.disputeWinRate}% win rate` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Projected events (Claim 41: predictive liability) */}
      {twin.projectedEvents.length > 0 && (
        <div>
          <div style={{ ...sans('10px', '#5F5648'), letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '10px' }}>
            Looking ahead
          </div>
          {twin.projectedEvents.slice(0, 3).map((e, i) => (
            <div key={i} style={{ borderLeft: '3px solid #C8A97E', backgroundColor: 'rgba(200,169,126,0.05)', padding: '12px 16px', marginBottom: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '6px' }}>
                <span style={{ ...sans('13px', '#F5F0E8') }}>{e.description}</span>
                <span style={{ ...sans('12px', '#C8A97E'), fontWeight: 600 }}>
                  {Math.round(e.probability * 100)}% likely{e.estimatedAmount ? ` · ~$${e.estimatedAmount.toLocaleString()}` : ''}
                </span>
              </div>
              <div style={{ ...sans('11px', '#5F5648'), marginTop: '4px' }}>{e.basis}</div>
            </div>
          ))}
        </div>
      )}

      {twin.activeWorkflows.length > 0 && (
        <div style={{ ...sans('12px', '#7A9E87'), marginTop: '16px' }}>
          ⚡ {twin.activeWorkflows.length} advocacy workflow(s) actively running
        </div>
      )}
    </div>
  )
}
