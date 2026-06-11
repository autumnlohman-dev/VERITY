'use client'

import React from 'react'
import type { DeadlineResult } from '@/lib/deadlines/calculator'

const sans = (size: string, color = '#A89F96', extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
  fontSize: size,
  color,
  ...extra,
})

const URGENCY_STYLES = {
  missed: { bg: 'rgba(200,60,60,0.12)', border: '#C83C3C', badge: '#C83C3C', badgeText: '#0D0D0D', label: 'MISSED' },
  critical: { bg: 'rgba(196,124,106,0.12)', border: '#C47C6A', badge: '#C47C6A', badgeText: '#0D0D0D', label: 'CRITICAL' },
  high: { bg: 'rgba(200,169,126,0.10)', border: '#C8A97E', badge: '#C8A97E', badgeText: '#0D0D0D', label: 'HIGH' },
  moderate: { bg: 'rgba(200,169,126,0.06)', border: '#2A2A2A', badge: '#5F5648', badgeText: '#F5F0E8', label: 'MODERATE' },
  informational: { bg: 'transparent', border: '#1C1C1C', badge: '#2A2A2A', badgeText: '#A89F96', label: 'INFO' },
}

interface DeadlineTrackerProps {
  deadlines: DeadlineResult[]
}

export function DeadlineTracker({ deadlines }: DeadlineTrackerProps) {
  if (deadlines.length === 0) {
    return (
      <div style={{ border: '1px solid #1C1C1C', padding: '20px', marginBottom: '24px', backgroundColor: '#0D0D0D' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ color: '#7A9E87', fontSize: '16px' }}>✓</span>
          <span style={{ ...sans('14px', '#7A9E87') }}>No urgent deadlines detected</span>
          <span style={{ ...sans('13px', '#5F5648') }}>— Always act within 30 days of any billing event to preserve your rights</span>
        </div>
      </div>
    )
  }

  const hasCritical = deadlines.some(d => d.urgencyLevel === 'critical' || d.urgencyLevel === 'missed')
  const hasMissed = deadlines.some(d => d.urgencyLevel === 'missed')

  return (
    <div style={{ marginBottom: '32px' }}>
      {/* Banner */}
      {hasCritical && (
        <div style={{
          backgroundColor: hasMissed ? 'rgba(200,60,60,0.15)' : 'rgba(196,124,106,0.15)',
          border: `1px solid ${hasMissed ? '#C83C3C' : '#C47C6A'}`,
          padding: '14px 20px',
          marginBottom: '16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <span style={{ ...sans('13px', '#F5F0E8'), fontWeight: 600 }}>
            {hasMissed
              ? `${deadlines.filter(d => d.urgencyLevel === 'missed').length} deadline(s) have already passed — contact a patient advocate immediately`
              : `You have ${deadlines.filter(d => d.urgencyLevel === 'critical').length} critical deadline(s) — act now`
            }
          </span>
        </div>
      )}

      <div style={{ ...sans('11px', '#A89F96'), letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '12px' }}>
        Appeal & Dispute Deadlines ({deadlines.length})
      </div>

      {deadlines.map(dl => {
        const styles = URGENCY_STYLES[dl.urgencyLevel]
        const daysLabel = dl.daysRemaining < 0
          ? `${Math.abs(dl.daysRemaining)} days ago`
          : dl.daysRemaining === 0
          ? 'TODAY'
          : `${dl.daysRemaining} days remaining`

        return (
          <div
            key={dl.deadlineId}
            style={{
              border: `1px solid ${styles.border}`,
              backgroundColor: styles.bg,
              padding: '20px',
              marginBottom: '12px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                {/* Urgency badge */}
                <span style={{
                  ...sans('10px', styles.badgeText),
                  backgroundColor: styles.badge,
                  padding: '3px 8px',
                  letterSpacing: '0.15em',
                  fontWeight: 600,
                }}>
                  {styles.label}
                </span>
                <span style={{ ...sans('14px', '#F5F0E8'), fontWeight: 500 }}>{dl.deadlineType}</span>
              </div>
              <span style={{
                ...sans('14px', dl.daysRemaining < 0 ? '#C83C3C' : dl.daysRemaining <= 7 ? '#C47C6A' : '#C8A97E'),
                fontWeight: 700,
                whiteSpace: 'nowrap',
              }}>
                {daysLabel}
              </span>
            </div>

            <div style={{ ...sans('13px', '#A89F96'), marginBottom: '10px' }}>{dl.description}</div>

            <div style={{ ...sans('13px', '#F5F0E8'), marginBottom: '8px' }}>
              <span style={{ ...sans('10px', '#C8A97E'), letterSpacing: '0.15em', textTransform: 'uppercase', marginRight: '8px' }}>Action:</span>
              {dl.actionRequired}
            </div>

            <div style={{ ...sans('12px', '#5F5648'), marginBottom: '8px' }}>
              <span style={{ marginRight: '6px' }}>↳</span>
              {dl.escalationPath}
            </div>

            <div style={{ ...sans('11px', '#3A3A3A'), fontStyle: 'italic' }}>
              {dl.applicableRegulation}
            </div>

            {dl.estimatedRecovery && dl.estimatedRecovery > 0 && (
              <div style={{ marginTop: '10px', ...sans('12px', '#A89F96') }}>
                Amount at stake: <span style={{ color: '#F5F0E8', fontWeight: 600 }}>${dl.estimatedRecovery.toLocaleString('en-US', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
