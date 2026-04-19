import { createClient } from '@supabase/supabase-js'

interface FeeScheduleSeed {
  cpt_code: string
  allowed_amount: number
  locality: string
}

interface PtpEditSeed {
  code_1: string
  code_2: string
  edit_type: string
}

interface MueEditSeed {
  cpt_code: string
  max_units: number
}

const LOCALITY = 'National'

const FEE_SCHEDULE: FeeScheduleSeed[] = [
  { cpt_code: '99213', allowed_amount: 92.86, locality: LOCALITY },
  { cpt_code: '99214', allowed_amount: 131.20, locality: LOCALITY },
  { cpt_code: '99215', allowed_amount: 184.42, locality: LOCALITY },
  { cpt_code: '99232', allowed_amount: 110.30, locality: LOCALITY },
  { cpt_code: '99283', allowed_amount: 154.48, locality: LOCALITY },
  { cpt_code: '99284', allowed_amount: 282.36, locality: LOCALITY },
  { cpt_code: '99285', allowed_amount: 418.70, locality: LOCALITY },
  { cpt_code: '71046', allowed_amount: 39.85, locality: LOCALITY },
  { cpt_code: '93000', allowed_amount: 16.91, locality: LOCALITY },
  { cpt_code: '85025', allowed_amount: 10.66, locality: LOCALITY },
  { cpt_code: '80053', allowed_amount: 14.39, locality: LOCALITY },
  { cpt_code: '36415', allowed_amount: 3.00, locality: LOCALITY },
  { cpt_code: '99203', allowed_amount: 115.88, locality: LOCALITY },
  { cpt_code: '99204', allowed_amount: 175.99, locality: LOCALITY },
  { cpt_code: '99205', allowed_amount: 232.15, locality: LOCALITY },
  { cpt_code: '27447', allowed_amount: 1422.50, locality: LOCALITY },
  { cpt_code: '43239', allowed_amount: 212.77, locality: LOCALITY },
  { cpt_code: '45378', allowed_amount: 367.04, locality: LOCALITY },
  { cpt_code: '70553', allowed_amount: 339.18, locality: LOCALITY },
  { cpt_code: '93306', allowed_amount: 218.45, locality: LOCALITY }
]

const PTP_EDITS: PtpEditSeed[] = [
  { code_1: '99213', code_2: '36415', edit_type: 'PTP' },
  { code_1: '99214', code_2: '36415', edit_type: 'PTP' },
  { code_1: '99215', code_2: '36415', edit_type: 'PTP' },
  { code_1: '99283', code_2: '36415', edit_type: 'PTP' },
  { code_1: '99284', code_2: '36415', edit_type: 'PTP' },
  { code_1: '99285', code_2: '93000', edit_type: 'PTP' },
  { code_1: '99284', code_2: '93000', edit_type: 'PTP' },
  { code_1: '45378', code_2: '43239', edit_type: 'PTP' },
  { code_1: '80053', code_2: '85025', edit_type: 'PTP' },
  { code_1: '27447', code_2: '71046', edit_type: 'PTP' },
  { code_1: '93306', code_2: '93000', edit_type: 'PTP' },
  { code_1: '99205', code_2: '36415', edit_type: 'PTP' },
  { code_1: '99204', code_2: '36415', edit_type: 'PTP' },
  { code_1: '99203', code_2: '36415', edit_type: 'PTP' },
  { code_1: '99232', code_2: '93000', edit_type: 'PTP' }
]

const MUE_EDITS: MueEditSeed[] = [
  { cpt_code: '99213', max_units: 1 },
  { cpt_code: '99214', max_units: 1 },
  { cpt_code: '99215', max_units: 1 },
  { cpt_code: '99232', max_units: 1 },
  { cpt_code: '99283', max_units: 1 },
  { cpt_code: '99284', max_units: 1 },
  { cpt_code: '99285', max_units: 1 },
  { cpt_code: '99203', max_units: 1 },
  { cpt_code: '99204', max_units: 1 },
  { cpt_code: '99205', max_units: 1 },
  { cpt_code: '71046', max_units: 1 },
  { cpt_code: '93000', max_units: 1 },
  { cpt_code: '85025', max_units: 1 },
  { cpt_code: '80053', max_units: 1 },
  { cpt_code: '36415', max_units: 2 },
  { cpt_code: '27447', max_units: 2 },
  { cpt_code: '43239', max_units: 1 },
  { cpt_code: '45378', max_units: 1 },
  { cpt_code: '70553', max_units: 1 },
  { cpt_code: '93306', max_units: 1 }
]

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

async function seed(): Promise<void> {
  const supabaseUrl = requireEnv('NEXT_PUBLIC_SUPABASE_URL')
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const feeCodes = FEE_SCHEDULE.map((r) => r.cpt_code)
  const mueCodes = MUE_EDITS.map((r) => r.cpt_code)
  const ptpCodes = Array.from(
    new Set(PTP_EDITS.flatMap((r) => [r.code_1, r.code_2]))
  )

  console.log('Clearing existing seeded rows...')
  const { error: delFeeErr } = await supabase
    .from('pfs_fee_schedule')
    .delete()
    .in('cpt_code', feeCodes)
  if (delFeeErr) throw new Error(`pfs_fee_schedule delete failed: ${delFeeErr.message}`)

  const { error: delMueErr } = await supabase
    .from('ncci_mue_edits')
    .delete()
    .in('cpt_code', mueCodes)
  if (delMueErr) throw new Error(`ncci_mue_edits delete failed: ${delMueErr.message}`)

  const { error: delPtpErr } = await supabase
    .from('ncci_ptp_edits')
    .delete()
    .in('code_1', ptpCodes)
  if (delPtpErr) throw new Error(`ncci_ptp_edits delete failed: ${delPtpErr.message}`)

  console.log(`Inserting ${FEE_SCHEDULE.length} pfs_fee_schedule rows...`)
  const { error: feeError } = await supabase
    .from('pfs_fee_schedule')
    .insert(FEE_SCHEDULE)
  if (feeError) throw new Error(`pfs_fee_schedule insert failed: ${feeError.message}`)

  console.log(`Inserting ${PTP_EDITS.length} ncci_ptp_edits rows...`)
  const { error: ptpError } = await supabase
    .from('ncci_ptp_edits')
    .insert(PTP_EDITS)
  if (ptpError) throw new Error(`ncci_ptp_edits insert failed: ${ptpError.message}`)

  console.log(`Inserting ${MUE_EDITS.length} ncci_mue_edits rows...`)
  const { error: mueError } = await supabase
    .from('ncci_mue_edits')
    .insert(MUE_EDITS)
  if (mueError) throw new Error(`ncci_mue_edits insert failed: ${mueError.message}`)

  console.log('Seed complete.')
}

seed().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
