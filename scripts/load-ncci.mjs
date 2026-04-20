import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from 'dotenv'

const __dirname = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(__dirname, '../.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function batchUpsert(table, records, batchSize = 500) {
  let inserted = 0
  const total = records.length
  for (let i = 0; i < total; i += batchSize) {
    const batch = records.slice(i, i + batchSize)
    const { error } = await supabase.from(table).upsert(batch)
    if (error) {
      console.error(`Error at batch ${i}:`, error.message)
      process.exit(1)
    }
    inserted += batch.length
    process.stdout.write(`\r  ${table}: ${inserted.toLocaleString()} / ${total.toLocaleString()}`)
  }
  console.log(`\r  ${table}: ${inserted.toLocaleString()} rows loaded ✓`)
}

async function main() {
  const dataDir = resolve(__dirname, 'data')

  console.log('\nLoading NCCI PTP edits...')
  const ptp = JSON.parse(readFileSync(resolve(dataDir, 'ptp_records.json'), 'utf8'))
  await batchUpsert('ncci_ptp_edits', ptp)

  console.log('\nLoading NCCI MUE edits...')
  const mue = JSON.parse(readFileSync(resolve(dataDir, 'mue_records.json'), 'utf8'))
  await batchUpsert('ncci_mue_edits', mue)

  console.log('\nAll NCCI data loaded successfully.')
}

main().catch(err => { console.error('Fatal:', err); process.exit(1) })
