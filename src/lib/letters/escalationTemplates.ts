// Escalation letter templates (step 4). DETERMINISTIC: plain template
// functions over case/outcome facts — no LLM — so each has a golden-output
// test and the text never varies between generations. All letters stay behind
// the human-review gate: the user reads, signs, and sends everything.
//
// Conventions shared with the first-letter pipeline:
//  - Placeholder tokens ([PATIENT NAME], [ADDRESS], [PHONE], [EMAIL], [DATE],
//    [ACCOUNT NUMBER]) are filled by lib/letterFields at download time.
//  - No em or en dashes anywhere in letter bodies (letter-credibility ban).
//  - CMS fee-schedule figures are reasonableness BENCHMARKS, never amounts a
//    provider is legally required to charge or accept.
//    Framing pending sister/counsel review wherever legal characterization
//    is involved (statute citations, "inaccurate" tradeline language).

import { doiAgencyFor, type DoiAgency } from './stateDoi'
import { CREDIT_BUREAUS } from './bureaus'

export interface EscalationFinding {
  cptCode: string
  description: string
  errorType: string
  correctionAmount: number
  ruleViolated: string
}

export interface EscalationFacts {
  providerName: string
  dateOfService: string
  amountInDispute: number
  patientState?: string | null
  /** First dispute letter facts */
  firstLetterDate: string // ISO date the letter was mailed/sent
  lobLetterId?: string | null
  /** Response facts (null when no response arrived) */
  responseReceivedAt?: string | null
  responseSummary?: string | null
  /** Unresolved findings, post quality rules (deduped, disputable only). */
  findings: EscalationFinding[]
  /** Collection agency name when known (FDCPA letter addressee). */
  collectorName?: string | null
}

const money = (n: number): string => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const calDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })

const SENDER_BLOCK = `[PATIENT NAME]
[ADDRESS]
[PHONE]
[EMAIL]

[DATE]`

function findingsSection(findings: EscalationFinding[]): string {
  if (findings.length === 0) return ''
  const rows = findings
    .map(
      (f, i) =>
        `${i + 1}. CPT ${f.cptCode}, ${f.description}: ${f.errorType.replace(/_/g, ' ')}. ` +
        `Requested correction: ${money(f.correctionAmount)}. Applicable authority: ${f.ruleViolated}`
    )
    .join('\n')
  const total = findings.reduce((s, f) => s + f.correctionAmount, 0)
  return `The following findings from the original audit remain unresolved:

${rows}

TOTAL CORRECTION REQUESTED: ${money(total)}`
}

function referenceLine(f: EscalationFacts): string {
  return `This letter concerns the account for services on ${f.dateOfService || 'the date of service shown on the attached bill'} (account [ACCOUNT NUMBER]) and follows my formal dispute dated ${calDate(f.firstLetterDate)}${f.lobLetterId ? ` (mailed via certified carrier, reference ${f.lobLetterId})` : ''}.`
}

function responseLine(f: EscalationFacts): string {
  if (f.responseReceivedAt) {
    return `Your office responded on ${calDate(f.responseReceivedAt)}${f.responseSummary ? `, stating: ${f.responseSummary}` : ''}. That response does not resolve the findings below.`
  }
  return `As of the date of this letter, my dispute has received no substantive response. Silence does not resolve a documented billing dispute, and I am escalating accordingly.`
}

// ── C1: Second-level appeal (provider) ───────────────────────────────────────
export function buildSecondLevelAppeal(f: EscalationFacts): string {
  return `${SENDER_BLOCK}

${f.providerName}
Attn: Patient Billing / Accounts Receivable, Second-Level Review

RE: SECOND-LEVEL DISPUTE, account [ACCOUNT NUMBER]

To the Billing Review Department:

${referenceLine(f)}

${responseLine(f)}

${findingsSection(f.findings)}

I request in writing, within 30 days:
1. A corrected, itemized statement reflecting each correction above, or
2. Written justification for each disputed charge, addressing the specific authority cited for that finding.

Where a Medicare fee schedule figure is cited above, it is presented as a reasonableness benchmark for the charge in question, not as an amount your office is required to charge; I ask that any charge materially above the benchmark be justified or repriced.

If this second request is not resolved, I am prepared to submit this documented dispute to the applicable state insurance regulator and other consumer protection channels.

Sincerely,

[PATIENT NAME]`
}

// ── C2: State DOI complaint ──────────────────────────────────────────────────
export function buildDoiComplaint(f: EscalationFacts): { letter: string; agency: DoiAgency } | { error: string } {
  const agency = doiAgencyFor(f.patientState)
  if (!agency) {
    return { error: `State regulator complaints are not yet supported for your state. Montana is supported today; more states are coming.` }
  }
  return {
    agency,
    letter: `${SENDER_BLOCK}

${agency.agencyName}
${agency.mailingAddress.join('\n')}

RE: CONSUMER COMPLAINT, medical billing dispute with ${f.providerName}

To the Office of the Commissioner:

I am a ${agency.state} resident filing a complaint regarding an unresolved medical billing dispute involving ${f.providerName}, for services on ${f.dateOfService || 'the date shown on the enclosed bill'}.

${referenceLine(f)}

${responseLine(f)}

${findingsSection(f.findings)}

The total amount in dispute is ${money(f.amountInDispute)}. Enclosed are my dispute letter, the provider's response (if any), and the audit findings with the authority cited for each.

I respectfully request that your office review this matter, contact the provider regarding the disputed charges, and advise me of any additional consumer protections available under ${agency.state} law.

Sincerely,

[PATIENT NAME]`,
  }
}

// ── C3: Credit bureau disputes (FCRA § 611), one letter per bureau ───────────
export function buildCreditBureauDisputes(f: EscalationFacts): Array<{ bureau: string; letter: string }> {
  return CREDIT_BUREAUS.map((b) => ({
    bureau: b.name,
    letter: `${SENDER_BLOCK}

${b.mailingAddress.join('\n')}

RE: DISPUTE OF TRADELINE, ${f.providerName}${f.collectorName ? ` / ${f.collectorName}` : ''}, account [ACCOUNT NUMBER]

To ${b.name} Dispute Department:

Under section 611 of the Fair Credit Reporting Act (15 U.S.C. 1681i), I dispute the tradeline reported for the account referenced above and request a reasonable reinvestigation.

The underlying medical bill is the subject of an active, documented billing dispute with the provider. ${referenceLine(f)} The amount reported is disputed in the amount of ${money(f.amountInDispute)} based on audit findings, and reporting it as an undisputed debt is inaccurate.

I request that you:
1. Investigate this tradeline with the furnisher,
2. Mark the account as disputed while the investigation is pending, and
3. Provide me the written results of your reinvestigation, including the furnisher's verification.

Enclosed: my dispute letter to the provider and the audit findings.

Sincerely,

[PATIENT NAME]`,
  }))
}

// ── C4: Collection agency validation/dispute (FDCPA § 809) ───────────────────
export function buildCollectorValidation(f: EscalationFacts): string {
  return `${SENDER_BLOCK}

${f.collectorName || '[COLLECTION AGENCY NAME]'}
[COLLECTION AGENCY ADDRESS]

RE: DEBT VALIDATION REQUEST AND DISPUTE, account [ACCOUNT NUMBER]

To Whom It May Concern:

Under section 809 of the Fair Debt Collection Practices Act (15 U.S.C. 1692g), I dispute the debt referenced above and request validation.

The underlying medical bill from ${f.providerName} is the subject of an active, documented billing dispute. ${referenceLine(f)} The audit supporting that dispute identifies ${money(f.amountInDispute)} in disputed charges; a debt whose amount is actively disputed with the original provider is not an amount I accept as owed.

I request that you:
1. Provide written validation of the debt, including an itemization and the identity of the original creditor,
2. Cease collection activity until validation is provided, as the statute requires, and
3. Note the account as disputed in any reporting you make while this dispute is open.

Enclosed: my dispute letter to the provider and the audit findings.

Sincerely,

[PATIENT NAME]`
}

// ── CFPB evidence package (NOT portal automation) ────────────────────────────
// A downloadable summary the user files themselves at the CFPB portal.
export function buildCfpbEvidencePackage(
  f: EscalationFacts,
  letterHistory: Array<{ letterType: string; date: string }>,
  outcomeTimeline: Array<{ date: string; event: string }>
): string {
  const letters = letterHistory.map((l) => `- ${calDate(l.date)}: ${l.letterType.replace(/_/g, ' ')}`).join('\n')
  const timeline = outcomeTimeline.map((t) => `- ${calDate(t.date)}: ${t.event}`).join('\n')
  return `CFPB COMPLAINT EVIDENCE PACKAGE
Prepared for [PATIENT NAME], [DATE]

This package supports a complaint you file yourself at consumerfinance.gov/complaint. It is documentation, not a filed complaint.

PROVIDER: ${f.providerName}
DATE OF SERVICE: ${f.dateOfService || 'see attached bill'}
AMOUNT IN DISPUTE: ${money(f.amountInDispute)}

AUDIT SUMMARY
${findingsSection(f.findings) || 'See attached audit report.'}

LETTER HISTORY
${letters || '- (no letters recorded)'}

OUTCOME TIMELINE
${timeline || '- (no events recorded)'}`
}
