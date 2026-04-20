import { createClient } from '@supabase/supabase-js'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const tables = ['pfs_fee_schedule', 'ncci_ptp_edits', 'ncci_mue_edits']

const results = []
for (const table of tables) {
  const { count, error } = await supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
  if (error) {
    results.push({ table_name: table, rows: `ERROR: ${error.message}` })
  } else {
    results.push({ table_name: table, rows: count })
  }
}

console.log('\ntable_name          | rows')
console.log('--------------------+----------')
for (const r of results) {
  const name = r.table_name.padEnd(19)
  const rows =
    typeof r.rows === 'number' ? r.rows.toLocaleString() : String(r.rows)
  console.log(`${name} | ${rows}`)
}
console.log()
