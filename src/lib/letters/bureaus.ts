// Credit bureau dispute mailing addresses (FCRA § 611 disputes are mailed to
// each bureau individually). Verified against the bureaus' published dispute
// addresses; framing pending sister/counsel review.

export interface CreditBureau {
  name: string
  mailingAddress: string[]
}

export const CREDIT_BUREAUS: CreditBureau[] = [
  { name: 'Equifax', mailingAddress: ['Equifax Information Services LLC', 'P.O. Box 740256', 'Atlanta, GA 30374-0256'] },
  { name: 'Experian', mailingAddress: ['Experian', 'P.O. Box 4500', 'Allen, TX 75013'] },
  { name: 'TransUnion', mailingAddress: ['TransUnion Consumer Solutions', 'P.O. Box 2000', 'Chester, PA 19016-2000'] },
]
