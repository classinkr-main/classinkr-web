import { readFileSync } from "node:fs"
import { join } from "node:path"

const envText = readFileSync(join(process.cwd(), ".env.local"), "utf-8")
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (!m) continue
  let value = m[2]
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  if (!process.env[m[1]]) process.env[m[1]] = value
}

async function main() {
  const dash = process.env.GOOGLE_BRANCH_DASHBOARD_SHEET_ID
  const hw = process.env.GOOGLE_BRANCH_HARDWARE_SHEET_ID
  if (!dash || !hw) throw new Error("env not loaded")

  const { sheets } = await import("../lib/google.ts" as string)

  for (const [label, id] of [["Sales Branding", dash], ["Hardware", hw]] as const) {
    const res = await sheets.spreadsheets.get({ spreadsheetId: id, fields: "sheets.properties(title,sheetId,gridProperties)" })
    console.log(`\n=== ${label} ===`)
    for (const s of res.data.sheets ?? []) {
      const p = s.properties
      console.log(`  • "${p?.title}"  rows=${p?.gridProperties?.rowCount} cols=${p?.gridProperties?.columnCount}`)
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
