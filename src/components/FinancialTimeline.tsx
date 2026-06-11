'use client'

import React from 'react'
import type { TimelineEvent } from '@/lib/cbs/schema'

const sans = (size: string, color = '#A89F96', extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-dm-sans), system-ui, sans-serif',
  fontSize: size,
  color,
  ...extra,
})

const EVENT_TYPE_ICONS: Record<string, string> = {
  authorization: '🔐',
  service: '🏥',
  claim_submission: '📄',
  adjudication: '⚖️',
  billing: '🧾',
  payment: '💳',
  denial: '✗',
  appeal: '📨',
  collection: '⚠️',
  credit_reporting: '📊',
  good_faith_estimate: '📋',
  deadline: '⏰',
}

interface FinancialTimelineProps {
  events: TimelineEvent[]
  totalDocuments: number
  totalInconsistencies: number
}

export function FinancialTimeline({ events, totalDocuments, totalInconsistencies }: FinancialTimelineProps) {
  if (events.length === 0) {
    return (
      <div style={{ border: '1px solid #1C1C1C', padding: '24px', marginBottom: '24px', textAlign: 'center' }}>
        <div style={{ ...sans('14px', '#5F5648') }}>No timeline data available</div>
        <div style={{ ...sans('13px', '#3A3A3A'), marginTop: '8px' }}>
          Upload your EOB, denial letter, or prior authorization to see your complete financial timeline
        </div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '32px' }}>
      {/* Summary header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ ...sans('11px', '#A89F96'), letterSpacing: '0.25em', textTransform: 'uppercase', marginBottom: '6px' }}>
          Healthcare Financial Timeline
        </div>
        <div style={{ ...sans('13px', '#5F5648') }}>
          {events.length} events across {totalDocuments} document{totalDocuments !== 1 ? 's' : ''}
          {totalInconsistencies > 0 && (
            <span style={{ color: '#C47C6A', marginLeft: '8px' }}>
              — {totalInconsistencies} inconsistenc{totalInconsistencies !== 1 ? 'ies' : 'y'} detected
            </span>
          )}
        </div>
      </div>

      {/* Timeline */}
      <div style={{ position: 'relative', paddingLeft: '28px' }}>
        {/* Vertical line */}
        <div style={{
          position: 'absolute',
          left: '10px',
          top: '8px',
          bottom: '8px',
          width: '1px',
          backgroundColor: '#2A2A2A',
        }} />

        {events.map((event, idx) => {
          const isLast = idx === events.length - 1
          const hasFlag = event.hasInconsistency
          const isFuture = event.isFutureDeadline
          const icon = EVENT_TYPE_ICONS[event.eventType] || '•'

          return (
            <div
              key={event.eventId}
              style={{
                position: 'relative',
                marginBottom: isLast ? 0 : '16px',
                paddingLeft: '20px',
              }}
            >
              {/* Dot on timeline */}
              <div style={{
                position: 'absolute',
                left: '-22px',
                top: '6px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                backgroundColor: hasFlag ? '#C47C6A' : isFuture ? '#C8A97E' : '#2A2A2A',
                border: `1px solid ${hasFlag ? '#C47C6A' : isFuture ? '#C8A97E' : '#3A3A3A'}`,
                zIndex: 1,
              }} />

              {/* Event card */}
              <div style={{
                border: `1px solid ${hasFlag ? 'rgba(196,124,106,0.4)' : isFuture ? 'rgba(200,169,126,0.3)' : '#1C1C1C'}`,
                backgroundColor: hasFlag ? 'rgba(196,124,106,0.06)' : isFuture ? 'rgba(200,169,126,0.06)' : '#0D0D0D',
                padding: '14px 16px',
                borderLeft: hasFlag ? '3px solid #C47C6A' : isFuture ? `3px solid ${event.urgencyLevel === 'critical' ? '#C47C6A' : '#C8A97E'}` : '3px solid #1C1C1C',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '14px' }}>{icon}</span>
                    <span style={{ ...sans('14px', hasFlag ? '#C47C6A' : isFuture ? '#C8A97E' : '#F5F0E8'), fontWeight: 500 }}>
                      {event.title}
                    </span>
                  </div>
                  <span style={{ ...sans('11px', '#5F5648'), whiteSpace: 'nowrap' }}>
                    {event.isFutureDeadline && event.daysUntil !== undefined
                      ? event.daysUntil < 0
                        ? `${Math.abs(event.daysUntil)}d overdue`
                        : event.daysUntil === 0
                        ? 'TODAY'
                        : `in ${event.daysUntil}d`
                      : new Date(event.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    }
                  </span>
                </div>

                <div style={{ ...sans('12px', '#A89F96'), marginBottom: event.hasInconsistency ? '8px' : 0 }}>
                  {event.description}
                  {event.financialAmount ? ` — $${event.financialAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : ''}
                </div>

                {event.hasInconsistency && event.inconsistencyDescription && (
                  <div style={{
                    backgroundColor: 'rgba(196,124,106,0.1)',
                    border: '1px solid rgba(196,124,106,0.3)',
                    padding: '8px 12px',
                    marginTop: '8px',
                  }}>
                    <span style={{ ...sans('11px', '#C47C6A'), letterSpacing: '0.1em', fontWeight: 600, marginRight: '8px' }}>⚠ INCONSISTENCY:</span>
                    <span style={{ ...sans('12px', '#C47C6A') }}>{event.inconsistencyDescription}</span>
                  </div>
                )}

                {event.sourceDocumentType && (
                  <div style={{ ...sans('11px', '#3A3A3A'), marginTop: '6px', textTransform: 'capitalize' }}>
                    Source: {event.sourceDocumentType.replace(/_/g, ' ')}
                    {event.entityName ? ` · ${event.entityName}` : ''}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
