'use client'

// ─── Real-Time Advocacy Copilot (Component Q) — text-mode v1 ─────────────────
// Live guidance during calls with providers, insurers, and collectors.
// v1: the consumer types (or pastes) what the rep says; the copilot parses the
// statement into structured assertions, checks them against regulatory rules,
// and returns suggested responses + citations. Voice mode is a planned upgrade.

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { BRAND_NAME } from '@/lib/brand'

const sans = (size: string, color = '#A89F96', extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-public-sans), system-ui, sans-serif', fontSize: size, color, ...extra,
})
const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-fraunces), Georgia, serif',
  fontOpticalSizing: 'auto',
  letterSpacing: '-0.015em', fontSize: size, color: 'var(--surface)', lineHeight: 1.15, fontWeight: 400, ...extra,
})

interface GuidanceCard {
  id: string
  kind: 'response' | 'citation' | 'escalation' | 'documentation' | 'warning'
  title: string
  body: string
  citation?: string
}

interface ExchangeEntry {
  id: string
  speaker: 'them' | 'guidance'
  text: string
  cards?: GuidanceCard[]
  // While true, these are the instant static-rule cards and a live model
  // response is still in flight (replaces them on arrival).
  pending?: boolean
  // Set by the model when the rep's statement contradicts a case finding.
  escalation?: boolean
}

// Lightweight case context for the "advising on your case" banner. Fetched from
// GET /api/copilot?caseId=… (owner-verified, server Supabase client) — the same
// case the POST grounds guidance in. The heavy lifting (CBS rebuild, deadlines,
// FHS) happens server-side; here we only surface a short summary.
interface CaseContext {
  providerName: string
  insurer: string
  discrepancyCount: number
  errorCount: number
  fhs: { score: number; tier: string } | null
}

// ─── Assertion → guidance rules (regulatory knowledge base) ──────────────────

interface Rule {
  match: RegExp
  cards: Omit<GuidanceCard, 'id'>[]
}

const RULES: Rule[] = [
  {
    match: /can'?t|cannot|won'?t|unable to|not able to|no such thing|not negotiable|policy (is|says)|that'?s our policy/i,
    cards: [
      { kind: 'response', title: 'Say this', body: '"I understand that may be your standard policy, but I\'m asserting my rights under federal law. I\'d like this escalated to a supervisor or your compliance department."' },
      { kind: 'escalation', title: 'Escalate', body: 'A first-line rep saying "policy" is not a legal determination. Ask for the appeals or compliance department by name and note the rep\'s name and time of call.' },
      { kind: 'documentation', title: 'Document', body: 'Write down: rep name, department, exact words used, date and time. This becomes evidence in your written dispute.' },
    ],
  },
  {
    match: /balance|you owe|amount due|pay (the|this)|outstanding/i,
    cards: [
      { kind: 'response', title: 'Say this', body: '"I\'m disputing that balance in writing. Please note the account is in active dispute, and send me a fully itemized statement with CPT codes for every charge."' },
      { kind: 'citation', title: 'Your right', body: 'You are entitled to a fully itemized bill. Do not agree to pay a disputed balance on the phone.', citation: 'No Surprises Act, 42 U.S.C. § 300gg-111; state itemization requirements' },
      { kind: 'warning', title: 'Do not say', body: 'Do not say "I\'ll pay" or agree to a payment plan on a disputed amount, it can be treated as acknowledging the debt.' },
    ],
  },
  {
    match: /collection|collector|collect|past due|credit (bureau|report)|report (you|this)/i,
    cards: [
      { kind: 'response', title: 'Say this', body: '"This debt is disputed. Under the FDCPA I\'m requesting written validation of this debt. Until you validate it, collection activity must pause."' },
      { kind: 'citation', title: 'Your right', body: 'Within 30 days of first contact you may demand validation; the collector must stop until they provide it. Disputed medical debt has additional credit-reporting limits.', citation: 'FDCPA 15 U.S.C. § 1692g; FCRA 15 U.S.C. § 1681i' },
      { kind: 'documentation', title: 'Document', body: 'Ask for: collector\'s company name, mailing address, account number, and the original creditor. You need these for the validation letter.' },
    ],
  },
  {
    match: /denied|denial|not covered|won'?t cover|excluded|not medically necessary/i,
    cards: [
      { kind: 'response', title: 'Say this', body: '"Please send me the specific denial reason code, the plan provision you\'re relying on, and your internal appeals process in writing. I\'m initiating an appeal."' },
      { kind: 'citation', title: 'Your right', body: 'You have a federally protected right to an internal appeal and then an external independent review. "Not medically necessary" can be challenged with a peer-to-peer review.', citation: 'ACA § 2719 (42 U.S.C. § 300gg-19); ERISA § 502(a)' },
      { kind: 'escalation', title: 'Escalate', body: 'Request a peer-to-peer: your physician speaks directly with the insurer\'s medical reviewer. Denials frequently reverse at this step.' },
    ],
  },
  {
    match: /out.of.network|not in network|non.?participating/i,
    cards: [
      { kind: 'response', title: 'Say this', body: '"This was emergency care / care at an in-network facility, so the No Surprises Act applies. I\'m only responsible for in-network cost-sharing. Please reprocess the claim accordingly."' },
      { kind: 'citation', title: 'Your right', body: 'For emergency services and most out-of-network care delivered at in-network facilities, balance billing above in-network cost-sharing is prohibited.', citation: 'No Surprises Act, 42 U.S.C. § 300gg-111 (effective Jan 1, 2022)' },
    ],
  },
  {
    match: /settle|settlement|offer|discount|reduce|knock off|write off/i,
    cards: [
      { kind: 'response', title: 'Negotiation guidance', body: 'Do not accept the first offer. Counter with your documented errors: "Given the billing errors I\'ve identified in writing, I\'ll resolve this account today at [your number]." Get any agreement in writing before paying.' },
      { kind: 'documentation', title: 'Document', body: 'Any settlement must state: final amount, that it resolves the account in full, no credit reporting, and written confirmation before payment.' },
    ],
  },
  {
    match: /supervisor|manager|escalate|transfer/i,
    cards: [
      { kind: 'documentation', title: 'Before the transfer', body: 'Get the current rep\'s name and a reference number for this call. Ask the supervisor to confirm what the first rep told you, inconsistencies are evidence.' },
    ],
  },
]

const DEFAULT_CARDS: Omit<GuidanceCard, 'id'>[] = [
  { kind: 'response', title: 'Stay on track', body: 'Ask a specific question: "What is the exact reason code?", "What is the appeals deadline?", or "Please send that to me in writing." Reps commit to less when you demand specifics in writing.' },
  { kind: 'documentation', title: 'Always document', body: 'Note the rep\'s name, time, and exact wording. Every call becomes evidence for the written dispute.' },
]

function uid() {
  return typeof window === 'undefined' ? `g_${Math.random()}` : crypto.randomUUID()
}

function generateGuidance(statement: string): GuidanceCard[] {
  const cards: GuidanceCard[] = []
  for (const rule of RULES) {
    if (rule.match.test(statement)) {
      for (const c of rule.cards) cards.push({ ...c, id: uid() })
    }
    if (cards.length >= 4) break
  }
  if (cards.length === 0) for (const c of DEFAULT_CARDS) cards.push({ ...c, id: uid() })
  return cards.slice(0, 4)
}

const KIND_STYLE: Record<GuidanceCard['kind'], { border: string; label: string; color: string }> = {
  response: { border: '#7A9E87', label: 'SAY THIS', color: '#7A9E87' },
  citation: { border: '#C8A97E', label: 'YOUR RIGHT', color: '#C8A97E' },
  escalation: { border: '#C47C6A', label: 'ESCALATE', color: '#C47C6A' },
  documentation: { border: 'var(--brand)', label: 'DOCUMENT', color: 'var(--brand)' },
  warning: { border: '#C83C3C', label: 'CAUTION', color: '#C83C3C' },
}

export default function CopilotPage() {
  const [exchanges, setExchanges] = useState<ExchangeEntry[]>([])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  // ?caseId arrives via the case page's "Live Copilot" button. Read it once
  // from the URL (no useSearchParams → no Suspense boundary needed) the same way
  // the case page reads ?dup.
  const [caseId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null
    return new URLSearchParams(window.location.search).get('caseId')
  })
  const [caseContext, setCaseContext] = useState<CaseContext | null>(null)
  // True when ?caseId is present but the owner-verified summary couldn't be
  // loaded (not signed in, not the owner, or the case is missing). Drives the
  // inline "open from your case page" hint instead of silently going generic.
  const [caseLoadFailed, setCaseLoadFailed] = useState(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [exchanges])

  // Load a short summary of the case so the copilot can show whose case it's
  // advising on. Owner-verified server-side (GET /api/copilot) — the browser
  // client used to do this directly and failed on RLS/session timing even for
  // the owner, which is the bug this fixes.
  useEffect(() => {
    if (!caseId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/copilot?caseId=${encodeURIComponent(caseId)}`)
        if (cancelled) return
        if (!res.ok) {
          setCaseLoadFailed(true)
          return
        }
        const summary = (await res.json()) as CaseContext
        if (cancelled) return
        setCaseContext(summary)
        setCaseLoadFailed(false)
      } catch {
        if (!cancelled) setCaseLoadFailed(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [caseId])

  // Replace the instant static cards for a given guidance entry with the live,
  // case-grounded model response (or leave the fallback in place on failure).
  const requestLiveGuidance = async (guidanceId: string, statement: string) => {
    try {
      const res = await fetch('/api/copilot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ statement, caseId }),
      })
      if (!res.ok) throw new Error(`copilot ${res.status}`)
      const json = (await res.json()) as {
        escalation?: boolean
        cards?: Array<Omit<GuidanceCard, 'id'>>
      }
      if (!Array.isArray(json.cards) || json.cards.length === 0) throw new Error('no cards')
      const cards = json.cards.map(c => ({ ...c, id: uid() }))
      setExchanges(prev =>
        prev.map(e =>
          e.id === guidanceId ? { ...e, cards, pending: false, escalation: json.escalation === true } : e
        )
      )
    } catch {
      // Keep the static fallback cards; just clear the pending state.
      setExchanges(prev => prev.map(e => (e.id === guidanceId ? { ...e, pending: false } : e)))
    }
  }

  const submit = () => {
    const text = input.trim()
    if (!text) return
    const cards = generateGuidance(text)
    const guidanceId = uid()
    setExchanges(prev => [
      ...prev,
      { id: uid(), speaker: 'them', text },
      { id: guidanceId, speaker: 'guidance', text: '', cards, pending: true },
    ])
    setInput('')
    void requestLiveGuidance(guidanceId, text)
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--ink)', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav style={{ padding: '20px 32px', backgroundColor: 'var(--surface)', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ ...sans('12px', 'var(--ink)'), letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 500, lineHeight: 1 }}>{BRAND_NAME}</span>
        </Link>
        <span style={{ ...sans('10px', 'var(--ink-soft)'), letterSpacing: '0.2em', textTransform: 'uppercase' }}>Call Copilot · Beta</span>
      </nav>

      {/* Header */}
      <div style={{ padding: '32px', borderBottom: '1px solid #1C1C1C' }}>
        <div style={{ ...serif('30px'), marginBottom: '8px' }}>On the phone with them right now?</div>
        <div style={{ ...sans('13px', '#A89F96'), maxWidth: '560px' }}>
          Type what the representative just said. Verity instantly tells you what to say back, which law protects you, and what to document. Voice mode is coming soon.
        </div>

        {/* Case-aware banner, guidance is grounded in this case's audit findings */}
        {caseContext && (
          <div
            style={{
              marginTop: '16px',
              backgroundColor: 'var(--ink)',
              border: '1px solid #242424',
              borderLeft: '3px solid #C8A97E',
              padding: '14px 18px',
              maxWidth: '560px',
            }}
          >
            <div style={{ ...sans('10px', '#C8A97E'), letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: '6px' }}>
              Advising on your case
            </div>
            <div style={{ ...sans('14px', 'var(--surface)') }}>{caseContext.providerName}</div>
            <div style={{ ...sans('12px', '#6B635C'), marginTop: '4px' }}>
              {caseContext.insurer}
              {caseContext.errorCount > 0 && ` · ${caseContext.errorCount} documented ${caseContext.errorCount === 1 ? 'error' : 'errors'}`}
              {caseContext.discrepancyCount > 0 && ` · ${caseContext.discrepancyCount} cross-document ${caseContext.discrepancyCount === 1 ? 'discrepancy' : 'discrepancies'}`}
              {caseContext.fhs && ` · Financial Harm ${caseContext.fhs.score}/1000 (${caseContext.fhs.tier})`}
            </div>
          </div>
        )}

        {/* ?caseId was passed but we couldn't load it for this viewer, say so
            explicitly instead of silently dropping to generic guidance. */}
        {caseId && !caseContext && caseLoadFailed && (
          <div
            style={{
              marginTop: '16px',
              backgroundColor: 'var(--ink)',
              border: '1px solid #242424',
              borderLeft: '3px solid #6B635C',
              padding: '14px 18px',
              maxWidth: '560px',
              ...sans('12px', '#A89F96'),
            }}
          >
            Open this from your case page while signed in for case-specific guidance.
          </div>
        )}

        <div style={{ ...sans('11px', '#5F5648'), marginTop: '10px', maxWidth: '560px' }}>
          Guidance-only mode: nothing you type here is stored after you close this page. Verity provides administrative guidance, not legal advice.
        </div>
      </div>

      {/* Exchange feed */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
        {exchanges.length === 0 && (
          <div style={{ ...sans('13px', '#3A3A3A'), textAlign: 'center', marginTop: '40px' }}>
            Try: &quot;They said the balance is $2,400 and it&apos;s going to collections next week&quot;
          </div>
        )}
        {exchanges.map(e =>
          e.speaker === 'them' ? (
            <div key={e.id} style={{ marginBottom: '14px', display: 'flex', justifyContent: 'flex-end' }}>
              <div style={{ maxWidth: '70%', backgroundColor: '#1C1C1C', padding: '12px 16px', borderRadius: '2px' }}>
                <div style={{ ...sans('10px', '#5F5648'), letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '4px' }}>They said</div>
                <div style={{ ...sans('14px', 'var(--surface)') }}>{e.text}</div>
              </div>
            </div>
          ) : (
            <div key={e.id} style={{ marginBottom: '22px', display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '85%' }}>
              {e.escalation && (
                <div style={{ ...sans('10px', '#C47C6A'), letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>
                  ⚠ Contradicts your case findings, escalate
                </div>
              )}
              {e.cards?.map(c => {
                const ks = KIND_STYLE[c.kind]
                return (
                  <div key={c.id} style={{ borderLeft: `3px solid ${ks.border}`, backgroundColor: 'var(--ink)', padding: '12px 16px' }}>
                    <div style={{ ...sans('10px', ks.color), letterSpacing: '0.2em', fontWeight: 700, marginBottom: '4px' }}>{ks.label}</div>
                    <div style={{ ...sans('13px', 'var(--surface)'), marginBottom: c.citation ? '6px' : 0 }}>{c.body}</div>
                    {c.citation && <div style={{ ...sans('11px', '#5F5648'), fontStyle: 'italic' }}>{c.citation}</div>}
                  </div>
                )
              })}
              {e.pending && (
                <div style={{ ...sans('11px', '#5F5648'), letterSpacing: '0.1em', fontStyle: 'italic' }}>
                  {caseContext ? 'Tailoring this to your case…' : 'Refining guidance…'}
                </div>
              )}
            </div>
          )
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div style={{ padding: '20px 32px', borderTop: '1px solid #1C1C1C', display: 'flex', gap: '12px' }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="Type what they just said…"
          style={{ ...sans('14px', 'var(--surface)'), flex: 1, backgroundColor: 'var(--ink)', border: '1px solid #2A2A2A', padding: '14px 16px', outline: 'none' }}
        />
        <button
          onClick={submit}
          style={{ ...sans('12px', 'var(--ink)'), backgroundColor: '#C8A97E', border: 'none', padding: '14px 28px', cursor: 'pointer', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}
        >
          Guide me
        </button>
      </div>
    </div>
  )
}
