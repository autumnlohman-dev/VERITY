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
