// Evaluation & Management (E&M) CPT codes that trigger the complexity review
// questionnaire. Covers office/outpatient visits (99201–99215) and ED visits
// (99281–99285). CMS E&M guidelines were revised in 2021 (office/outpatient)
// and 2023 (ED) — the level billed should reflect medical decision-making
// complexity or total time, not a fixed per-visit rate.
export const EM_CPT_CODES = new Set([
  '99201', '99202', '99203', '99204', '99205',
  '99211', '99212', '99213', '99214', '99215',
  '99281', '99282', '99283', '99284', '99285',
])

export interface EmOption {
  label: string
  weight: number
}

export interface EmQuestion {
  id: string
  block: string
  prompt: string
  help?: string
  options: EmOption[]
}

export const EM_BLOCKS = [
  'The visit',
  'Medical decision making',
  'Severity & coordination',
] as const

export const EM_QUESTIONS: EmQuestion[] = [
  {
    id: 'q1',
    block: 'The visit',
    prompt: 'Was this your first time seeing this provider for this problem?',
    help: 'A new patient or new problem generally means higher complexity.',
    options: [
      { label: 'Yes, new patient or new problem', weight: 1 },
      { label: 'No, established patient and known problem', weight: 0 },
    ],
  },
  {
    id: 'q2',
    block: 'The visit',
    prompt: 'How many separate problems did the provider address?',
    options: [
      { label: '1 problem', weight: 0 },
      { label: '2 problems', weight: 0.5 },
      { label: '3 or more problems', weight: 1 },
    ],
  },
  {
    id: 'q3',
    block: 'The visit',
    prompt: 'How long were you actually with the provider, not counting wait time?',
    options: [
      { label: 'Under 10 minutes', weight: 0 },
      { label: '10-20 minutes', weight: 0.5 },
      { label: 'Over 20 minutes', weight: 1 },
    ],
  },
  {
    id: 'q4',
    block: 'Medical decision making',
    prompt: 'Did the provider order any tests, imaging, or labs?',
    options: [
      { label: 'No', weight: 0 },
      { label: 'One', weight: 0.5 },
      { label: 'Multiple', weight: 1 },
    ],
  },
  {
    id: 'q5',
    block: 'Medical decision making',
    prompt: 'Was a new prescription written, or an existing one changed?',
    options: [
      { label: 'Yes', weight: 1 },
      { label: 'No', weight: 0 },
    ],
  },
  {
    id: 'q6',
    block: 'Medical decision making',
    prompt: 'Did the provider discuss risks, complications, or alternative treatments?',
    options: [
      { label: 'No', weight: 0 },
      { label: 'Briefly', weight: 0.5 },
      { label: 'In detail', weight: 1 },
    ],
  },
  {
    id: 'q7',
    block: 'Severity & coordination',
    prompt:
      'Did this problem affect your ability to work or function, or require urgent attention?',
    options: [
      { label: 'No', weight: 0 },
      { label: 'Somewhat', weight: 0.5 },
      { label: 'Yes, significantly', weight: 1 },
    ],
  },
  {
    id: 'q8',
    block: 'Severity & coordination',
    prompt: 'Were you referred to another provider, or was a follow-up plan discussed?',
    options: [
      { label: 'No', weight: 0 },
      { label: 'Follow-up mentioned', weight: 0.5 },
      { label: 'Referred out', weight: 1 },
    ],
  },
]

export type EmOutcome = 'cleared' | 'borderline' | 'confirmed'

export interface EmAnswer {
  questionId: string
  optionIndex: number
  weight: number
}

export interface EmReview {
  answers: EmAnswer[]
  score: number
  outcome: EmOutcome
  submitted_at: string
  flagged_codes: string[]
}

export interface EmReviewInput {
  questionId: string
  optionIndex: number
}

// Boundary interpretation (user-confirmed shared endpoints):
//   score < 3         → cleared
//   3 ≤ score < 5     → borderline
//   score ≥ 5         → confirmed
export function scoreEmReview(
  inputs: EmReviewInput[]
): Pick<EmReview, 'answers' | 'score' | 'outcome'> {
  const answers: EmAnswer[] = inputs.map((input) => {
    const question = EM_QUESTIONS.find((q) => q.id === input.questionId)
    const option = question?.options[input.optionIndex]
    return {
      questionId: input.questionId,
      optionIndex: input.optionIndex,
      weight: option?.weight ?? 0,
    }
  })
  const score = answers.reduce((sum, a) => sum + a.weight, 0)
  const outcome: EmOutcome =
    score < 3 ? 'cleared' : score < 5 ? 'borderline' : 'confirmed'
  return { answers, score, outcome }
}

export function hasEmFlag(errors: Array<{ cpt_code?: string }> | null | undefined): boolean {
  if (!errors) return false
  return errors.some((e) => EM_CPT_CODES.has(String(e.cpt_code ?? '').toUpperCase()))
}

export function getEmFlaggedCodes(
  errors: Array<{ cpt_code?: string }> | null | undefined
): string[] {
  if (!errors) return []
  const seen = new Set<string>()
  for (const e of errors) {
    const code = String(e.cpt_code ?? '').toUpperCase()
    if (EM_CPT_CODES.has(code)) seen.add(code)
  }
  return Array.from(seen)
}

export function filterOutEmErrors<T extends { cpt_code?: string }>(errors: T[]): T[] {
  return errors.filter((e) => !EM_CPT_CODES.has(String(e.cpt_code ?? '').toUpperCase()))
}

// Returns a narrative paragraph summarizing the patient's answers — intended
// to be embedded in the dispute letter prompt when outcome is 'confirmed'.
export function renderEmReviewForPrompt(review: EmReview): string {
  const lines: string[] = []
  lines.push(
    `PATIENT E&M VISIT COMPLEXITY REVIEW (score: ${review.score.toFixed(1)}/8, outcome: ${review.outcome})`
  )
  lines.push(
    `Flagged visit code(s): ${review.flagged_codes.join(', ') || 'none'}`
  )
  lines.push('Patient responses:')
  for (const answer of review.answers) {
    const question = EM_QUESTIONS.find((q) => q.id === answer.questionId)
    const option = question?.options[answer.optionIndex]
    if (!question || !option) continue
    lines.push(
      `- [${question.block}] ${question.prompt} Answer: "${option.label}" (complexity weight ${option.weight})`
    )
  }
  return lines.join('\n')
}
