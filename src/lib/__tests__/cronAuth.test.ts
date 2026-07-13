import { describe, it, expect } from 'vitest'
import { isAuthorizedCronRequest } from '../cronAuth'

describe('isAuthorizedCronRequest (shared cron gate → 401/200 decision)', () => {
  it('authorizes the exact Bearer token', () => {
    expect(isAuthorizedCronRequest('Bearer s3cret', 's3cret')).toBe(true)
  })
  it('rejects a missing or wrong header', () => {
    expect(isAuthorizedCronRequest(null, 's3cret')).toBe(false)
    expect(isAuthorizedCronRequest('Bearer wrong', 's3cret')).toBe(false)
    expect(isAuthorizedCronRequest('s3cret', 's3cret')).toBe(false) // no Bearer prefix
  })
  it('rejects everything when CRON_SECRET is unset — never an open cron', () => {
    expect(isAuthorizedCronRequest('Bearer anything', undefined)).toBe(false)
    expect(isAuthorizedCronRequest('Bearer ', '')).toBe(false)
  })
})
