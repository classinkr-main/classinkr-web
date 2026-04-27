import { readFileSync } from "node:fs"
import { join } from "node:path"

const envText = readFileSync(join(process.cwd(), ".env.local"), "utf-8")
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (!m) continue
  let v = m[2]
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[m[1]]) process.env[m[1]] = v
}

async function main() {
  const { sheets } = await import("../lib/google.ts" as string)
  const dash = process.env.GOOGLE_BRANCH_DASHBOARD_SHEET_ID!

  async function probe(label: string, id: string, range: string, maxRow = 8) {
    try {
      const res = await sheets.spreadsheets.values.get({ spreadsheetId: id, range, valueRenderOption: "FORMATTED_VALUE" })
      const rows = res.data.values ?? []
      console.log(`\n=== ${label} :: ${range} (rows=${rows.length}) ===`)
      for (let i = 0; i < Math.min(maxRow, rows.length); i++) {
        const row = (rows[i] ?? []).slice(0, 30)
        console.log(`  [${String(i).padStart(2,'0')}]:`, row.map((c: unknown) => String(c).slice(0, 18)).join(" | "))
      }
    } catch (e) {
      console.error(`FAIL ${label}`, e instanceof Error ? e.message : e)
    }
  }

  await probe("DSH", dash, "'1. DSH'!A1:W30", 30)
  await probe("REV-header", dash, "'2. REV'!A1:CF3", 3)
  await probe("REV-monthcols", dash, "'2. REV'!N2:CF2", 1)  // header row 2 (1-indexed)
  await probe("KPI", dash, "'3. KPI'!A1:AL12", 12)
  await probe("SEG", dash, "'4. 지역 매출'!A1:AM10", 10)
}

main().catch((e) => { console.error(e); process.exit(1) })
