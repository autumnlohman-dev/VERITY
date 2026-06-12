import type { InsuranceType } from './errorDetection'

const VALID: Set<InsuranceType> = new Set([
  'commercial',
  'medicare',
  'medicaid',
  'self-pay',
  'tricare',
  'other'
])

const DISPLAY_TO_ENUM: Record<string, InsuranceType> = {
  'commercial': 'commercial',
  'commercial (ppo/hmo)': 'commercial',
  'ppo': 'commercial',
  'hmo': 'commercial',
  'medicare': 'medicare',
  'medicare advantage': 'medicare',
  'original medicare': 'medicare',
  'medicare part b': 'medicare',
  'medicaid': 'medicaid',
  'self-pay': 'self-pay',
  'self pay': 'self-pay',
  'self-pay / uninsured': 'self-pay',
  'self-pay/uninsured': 'self-pay',
  'uninsured': 'self-pay',
  'tricare': 'tricare',
  'other': 'other'
}

export function normalizeInsuranceType(input: unknown): InsuranceType {
  if (typeof input !== 'string') return 'other'
  const key = input.trim().toLowerCase()
  if (!key) return 'other'
  if (VALID.has(key as InsuranceType)) return key as InsuranceType
  return DISPLAY_TO_ENUM[key] ?? 'other'
}

// Shared self-pay / uninsured detector. A self-pay patient has no insurer, so
// guidance that says "submit to your insurer / request in-network cost-sharing"
// is wrong for them — they get the Good Faith Estimate + Patient-Provider
// Dispute Resolution path instead. Used by the deadline calculator and the
// letter-page submission guide so both branch the same way.
export function isSelfPay(input: unknown): boolean {
  return normalizeInsuranceType(input) === 'self-pay'
}
