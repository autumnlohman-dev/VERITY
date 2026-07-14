'use client'

import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { syncOutcomes } from '@/lib/outcomes/store'
import { syncWorkflows } from '@/lib/agent/advocacyAgent'
import { resumePendingCheckout } from '@/lib/checkout'
import { claimPendingGuestAudit } from '@/lib/guestClaim'
import { BRAND_NAME } from '@/lib/brand'
import { track, identifyUser } from '@/lib/analytics'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Once a session exists, claim any guest-accumulated records, resume a pending
  // checkout if the user came here to buy, import a pending guest audit into a
  // real case (landing them on it), otherwise land on the dashboard.
  async function completeSignedIn(authEvent: 'account_created' | 'signed_in') {
    // Auth has already succeeded by the time we get here. Importing the guest
    // claim and syncing local records are best-effort niceties — if any of them
    // throw, we log to Sentry and still land the user somewhere useful. A
    // post-login error page on a successful sign-in is never acceptable.
    let target = '/dashboard'
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) identifyUser(user.id)
      track(authEvent)
      await Promise.all([syncOutcomes(), syncWorkflows()])
      if (resumePendingCheckout()) return
      // Carry a guest audit through signup: turn it into a saved case and go
      // straight there, so the user sees the exact audit they ran — now saved.
      const claimedCaseId = await claimPendingGuestAudit()
      if (claimedCaseId) target = `/cases/${claimedCaseId}`
    } catch (err) {
      Sentry.captureException(err)
    }
    router.push(target)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    setNotice('')

    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      // Supabase returns a user with an EMPTY `identities` array (and no error,
      // to avoid leaking which emails exist) when the address is already
      // registered. Treat that as "use a different email or sign in".
      const identities = data.user?.identities
      if (identities && identities.length === 0) {
        setError('An account with this email already exists. Try signing in instead.')
        setLoading(false)
        return
      }
      // No session means email confirmation is on: the account isn't usable yet
      // and there is nothing to redirect to. Tell them to confirm — do NOT push
      // them onto /dashboard, where an unauthenticated session would otherwise
      // render with no data.
      if (!data.session) {
        setNotice(
          `Check your email, we sent a confirmation link to ${email}. Click it to activate your account, then sign in.`
        )
        setLoading(false)
        return
      }
      // Confirmation disabled: we have a live session, proceed.
      await completeSignedIn('account_created')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      await completeSignedIn('signed_in')
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--surface)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-public-sans, sans-serif)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        padding: '48px',
        background: 'var(--surface-raised)',
        border: '1px solid var(--line)',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-lora, serif)',
          
          letterSpacing: '-0.015em',
          fontSize: '36px',
          color: 'var(--ink)',
          marginBottom: '8px',
          fontWeight: 400
        }}>
          {isSignUp ? 'Create account.' : 'Welcome back.'}
        </h1>
        <p style={{ color: 'var(--ink-soft)', fontSize: '14px', marginBottom: '32px' }}>
          {isSignUp ? 'Start your free bill audit.' : `Sign in to your ${BRAND_NAME} account.`}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: 'var(--ink-soft)', fontSize: '12px', marginBottom: '8px', letterSpacing: '0.05em' }}>
              EMAIL
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                color: 'var(--ink)',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', color: 'var(--ink-soft)', fontSize: '12px', marginBottom: '8px', letterSpacing: '0.05em' }}>
              PASSWORD
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                width: '100%',
                padding: '12px',
                background: 'var(--surface)',
                border: '1px solid var(--line)',
                color: 'var(--ink)',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          {error && (
            <p style={{ color: '#C47C6A', fontSize: '14px', marginBottom: '16px' }}>
              {error}
            </p>
          )}

          {notice && (
            <p
              role="status"
              style={{ color: '#7A9E87', fontSize: '14px', marginBottom: '16px', lineHeight: 1.6 }}
            >
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: '#C8A97E',
              color: 'var(--ink)',
              border: 'none',
              fontSize: '14px',
              fontWeight: 500,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              marginBottom: '16px'
            }}
          >
            {loading ? 'Please wait...' : isSignUp ? 'Create account' : 'Sign in'}
          </button>

          <p style={{ color: 'var(--ink-soft)', fontSize: '14px', textAlign: 'center' }}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <span
              onClick={() => {
                setIsSignUp(!isSignUp)
                setError('')
                setNotice('')
              }}
              style={{ color: 'var(--brand)', cursor: 'pointer' }}
            >
              {isSignUp ? 'Sign in' : 'Sign up free'}
            </span>
          </p>
        </form>
      </div>
    </div>
  )
}
