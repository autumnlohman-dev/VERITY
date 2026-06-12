'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { syncOutcomes } from '@/lib/outcomes/store'
import { syncWorkflows } from '@/lib/agent/advocacyAgent'
import { resumePendingCheckout } from '@/lib/checkout'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message)
      } else {
        // Push any records this person accumulated as a guest up to Supabase.
        await Promise.all([syncOutcomes(), syncWorkflows()])
        // If they came here to buy a paid tier, resume that checkout instead of
        // dropping them on the dashboard — the redirect to Stripe takes over.
        if (resumePendingCheckout()) return
        router.push('/dashboard')
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
      } else {
        await Promise.all([syncOutcomes(), syncWorkflows()])
        if (resumePendingCheckout()) return
        router.push('/dashboard')
      }
    }
    setLoading(false)
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0D0D0D',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'var(--font-dm-sans, sans-serif)'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        padding: '48px',
        background: '#1A1A1A',
        border: '1px solid #2A2A2A',
      }}>
        <h1 style={{
          fontFamily: 'var(--font-cormorant, serif)',
          fontSize: '36px',
          color: '#F5F0E8',
          marginBottom: '8px',
          fontWeight: 400
        }}>
          {isSignUp ? 'Create account.' : 'Welcome back.'}
        </h1>
        <p style={{ color: '#A89F96', fontSize: '14px', marginBottom: '32px' }}>
          {isSignUp ? 'Start your free bill audit.' : 'Sign in to your ClearClaim account.'}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{ display: 'block', color: '#A89F96', fontSize: '12px', marginBottom: '8px', letterSpacing: '0.05em' }}>
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
                background: '#0D0D0D',
                border: '1px solid #2A2A2A',
                color: '#F5F0E8',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', color: '#A89F96', fontSize: '12px', marginBottom: '8px', letterSpacing: '0.05em' }}>
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
                background: '#0D0D0D',
                border: '1px solid #2A2A2A',
                color: '#F5F0E8',
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

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: '#C8A97E',
              color: '#0D0D0D',
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

          <p style={{ color: '#A89F96', fontSize: '14px', textAlign: 'center' }}>
            {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
            <span
              onClick={() => setIsSignUp(!isSignUp)}
              style={{ color: '#C8A97E', cursor: 'pointer' }}
            >
              {isSignUp ? 'Sign in' : 'Sign up free'}
            </span>
          </p>
        </form>
      </div>
    </div>
  )
}