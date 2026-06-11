'use client'

// ─── Real-Time Advocacy Copilot (Component Q) — text-mode v1 ─────────────────
// Live guidance during calls with providers, insurers, and collectors.
// v1: the consumer types (or pastes) what the rep says; the copilot parses the
// statement into structured assertions, checks them against regulatory rules,
// and returns suggested responses + citations. Voice mode is a planned upgrade.

import React, { useState, useRef, useEffect } from 'react'
import Link from 'next/link'

const sans = (size: string, color = '#A89F96', extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-dm-sans), system-ui, sans-serif', fontSize: size, color, ...extra,
})
const serif = (size: string, extra?: React.CSSProperties): React.CSSProperties => ({
  fontFamily: 'var(--font-cormorant), Georgia, serif', fontSize: size, color: '#F5F0E8', lineHeight: 1.15, fontWeight: 400, ...extra,
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
      { kind: 'warning', title: 'Do not say', body: 'Do not say "I\'ll pay" or agree to a payment plan on a disputed amount — it can be treated as acknowledging the debt.' },
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
      { kind: 'documentation', title: 'Before the transfer', body: 'Get the current rep\'s name and a reference number for this call. Ask the supervisor to confirm what the first rep told you — inconsistencies are evidence.' },
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
  documentation: { border: '#4A90D9', label: 'DOCUMENT', color: '#4A90D9' },
  warning: { border: '#C83C3C', label: 'CAUTION', color: '#C83C3C' },
}

export default function CopilotPage() {
  const [exchanges, setExchanges] = useState<ExchangeEntry[]>([])
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [exchanges])

  const submit = () => {
    const text = input.trim()
    if (!text) return
    const cards = generateGuidance(text)
    setExchanges(prev => [
      ...prev,
      { id: uid(), speaker: 'them', text },
      { id: uid(), speaker: 'guidance', text: '', cards },
    ])
    setInput('')
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0D0D0D', display: 'flex', flexDirection: 'column' }}>
      {/* Nav */}
      <nav style={{ padding: '20px 32px', borderBottom: '1px solid #1C1C1C', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span style={{ ...sans('12px', '#F5F0E8'), letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 500, lineHeight: 1 }}>Verity™</span>
            <span style={{ ...sans('8px', '#A89F96'), letterSpacing: '0.18em', textTransform: 'uppercase', lineHeight: 1 }}>Med Claim</span>
          </span>
        </Link>
        <span style={{ ...sans('10px', '#C8A97E'), letterSpacing: '0.2em', textTransform: 'uppercase' }}>Call Copilot · Beta</span>
      </nav>

      {/* Header */}
      <div style={{ padding: '32px', borderBottom: '1px solid #1C1C1C' }}>
        <div style={{ ...serif('30px'), marginBottom: '8px' }}>On the phone with them right now?</div>
        <div style={{ ...sans('13px', '#A89F96'), maxWidth: '560px' }}>
          Type what the representative just said. Verity instantly tells you what to say back, which law protects you, and what to document. Voice mode is coming soon.
        </div>
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
                <div style={{ ...sans('14px', '#F5F0E8') }}>{e.text}</div>
              </div>
            </div>
          ) : (
            <div key={e.id} style={{ marginBottom: '22px', display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '85%' }}>
              {e.cards?.map(c => {
                const ks = KIND_STYLE[c.kind]
                return (
                  <div key={c.id} style={{ borderLeft: `3px solid ${ks.border}`, backgroundColor: '#111111', padding: '12px 16px' }}>
                    <div style={{ ...sans('10px', ks.color), letterSpacing: '0.2em', fontWeight: 700, marginBottom: '4px' }}>{ks.label}</div>
                    <div style={{ ...sans('13px', '#F5F0E8'), marginBottom: c.citation ? '6px' : 0 }}>{c.body}</div>
                    {c.citation && <div style={{ ...sans('11px', '#5F5648'), fontStyle: 'italic' }}>{c.citation}</div>}
                  </div>
                )
              })}
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
          style={{ ...sans('14px', '#F5F0E8'), flex: 1, backgroundColor: '#111111', border: '1px solid #2A2A2A', padding: '14px 16px', outline: 'none' }}
        />
        <button
          onClick={submit}
          style={{ ...sans('12px', '#0D0D0D'), backgroundColor: '#C8A97E', border: 'none', padding: '14px 28px', cursor: 'pointer', letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600 }}
        >
          Guide me
        </button>
      </div>
    </div>
  )
}
