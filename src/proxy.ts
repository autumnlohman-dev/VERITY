import { NextResponse, type NextRequest } from 'next/server'

// Beta: no auth gating. All previous Supabase session/redirect logic is
// disabled. To re-enable, restore the implementation in git history and
// repopulate the matcher below.
export async function proxy(_request: NextRequest) {
  return NextResponse.next()
}

export const config = {
  matcher: [],
}
