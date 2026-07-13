// State insurance regulator routing table for DOI complaint letters.
// Populated fully for Montana; every other state is a TODO stub — the UI says
// "not yet supported for your state" rather than guessing an address.
// Framing pending sister/counsel review: complaint pathways and addresses
// must be verified per state before enabling.

export interface DoiAgency {
  state: string
  agencyName: string
  mailingAddress: string[]
}

const DOI_TABLE: Record<string, DoiAgency> = {
  MT: {
    state: 'MT',
    agencyName: 'Montana Commissioner of Securities and Insurance (CSI)',
    mailingAddress: ['Office of the Montana State Auditor', '840 Helena Ave', 'Helena, MT 59601'],
  },
  // TODO stubs — add verified entries as counsel signs off, one per state:
  // XX: { state: 'XX', agencyName: '…', mailingAddress: ['…'] },
}

export function doiAgencyFor(state: string | null | undefined): DoiAgency | null {
  if (!state) return null
  return DOI_TABLE[state.trim().toUpperCase()] ?? null
}

export const DOI_SUPPORTED_STATES = Object.keys(DOI_TABLE)
