import AdmZip from 'adm-zip'
import { writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const dataDir = resolve(__dirname, 'data')

const CUTOFF_DATE_YYYYMMDD = 20260401

function parseCsvLine(line) {
  const out = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') {
        inQuotes = false
      } else {
        field += c
      }
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { out.push(field); field = '' }
      else field += c
    }
  }
  out.push(field)
  return out
}

function looksLikeCode(s) {
  return /^[A-Z]?\d{4,5}[A-Z]?$/i.test(s.trim())
}

// ─── PTP ──────────────────────────────────────────────────────────────────────

console.log('Extracting NCCI PTP edits...')
const ptpZipPath = resolve(dataDir, 'ccipra-v321r0-f1.zip')
const ptpZip = new AdmZip(ptpZipPath)
const ptpEntries = ptpZip.getEntries()
const ptpEntry = ptpEntries.find(e => e.entryName.toLowerCase().endsWith('.txt'))
if (!ptpEntry) {
  console.error('No .txt file found in', ptpZipPath)
  console.error('Entries:', ptpEntries.map(e => e.entryName))
  process.exit(1)
}
console.log(`  reading ${ptpEntry.entryName} (${ptpEntry.header.size} bytes uncompressed)`)
const ptpText = ptpZip.readAsText(ptpEntry)

const ptpRecords = []
let ptpDeleted = 0
let ptpSkipped = 0
let ptpHeaderRows = 0
const ptpLines = ptpText.split(/\r?\n/)
for (const line of ptpLines) {
  if (!line.trim()) continue
  const cols = line.split('\t')
  if (cols.length < 6) { ptpSkipped++; continue }
  const code1 = (cols[0] ?? '').trim()
  const code2 = (cols[1] ?? '').trim()
  const delDate = (cols[4] ?? '').trim()
  const modInd = (cols[5] ?? '').trim()

  if (!looksLikeCode(code1) || !looksLikeCode(code2)) {
    ptpHeaderRows++
    continue
  }

  if (delDate) {
    const digits = delDate.replace(/\D/g, '')
    const n = digits.length >= 8 ? Number(digits.slice(0, 8)) : NaN
    if (Number.isFinite(n) && n <= CUTOFF_DATE_YYYYMMDD) {
      ptpDeleted++
      continue
    }
  }

  const editType = modInd === '0' ? 0 : modInd === '1' ? 1 : 1
  ptpRecords.push({
    code_1: code1.toUpperCase(),
    code_2: code2.toUpperCase(),
    edit_type: editType
  })
}

writeFileSync(resolve(dataDir, 'ptp_records.json'), JSON.stringify(ptpRecords))
console.log(`  PTP header rows skipped: ${ptpHeaderRows}`)
console.log(`  PTP deleted rows skipped: ${ptpDeleted}`)
console.log(`  PTP malformed rows skipped: ${ptpSkipped}`)
console.log(`  PTP records written: ${ptpRecords.length}`)

// ─── MUE ──────────────────────────────────────────────────────────────────────

console.log('\nExtracting NCCI MUE edits...')
const mueZipPath = resolve(
  dataDir,
  'practitionerservicesmuetable-effective-04-01-2026.zip'
)
const mueZip = new AdmZip(mueZipPath)
const mueEntries = mueZip.getEntries()
const mueEntry = mueEntries.find(e => e.entryName.toLowerCase().endsWith('.csv'))
if (!mueEntry) {
  console.error('No .csv file found in', mueZipPath)
  console.error('Entries:', mueEntries.map(e => e.entryName))
  process.exit(1)
}
console.log(`  reading ${mueEntry.entryName} (${mueEntry.header.size} bytes uncompressed)`)
const mueText = mueZip.readAsText(mueEntry)

const mueLines = mueText.split(/\r?\n/)
const mueRecords = []
let mueSkipped = 0
for (let i = 8; i < mueLines.length; i++) {
  const line = mueLines[i]
  if (!line.trim()) continue
  const cols = parseCsvLine(line)
  if (cols.length < 2) { mueSkipped++; continue }
  const code = cols[0].trim().toUpperCase()
  const limit = Number(cols[1].trim())
  if (!code || !Number.isFinite(limit)) { mueSkipped++; continue }
  mueRecords.push({ cpt_code: code, max_units: limit })
}

writeFileSync(resolve(dataDir, 'mue_records.json'), JSON.stringify(mueRecords))
console.log(`  MUE skipped rows: ${mueSkipped}`)
console.log(`  MUE records written: ${mueRecords.length}`)

console.log('\nDone.')
