import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  const { data: { user } } = await supabase.auth.getUser()
  
  return NextResponse.json({ 
    hasSession: !!session,
    hasUser: !!user,
    userId: user?.id || null
  })
}