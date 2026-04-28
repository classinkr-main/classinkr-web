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
  const { google } = await import("googleapis")
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  const sheets = google.sheets({ version: "v4", auth })
  const dash = process.env.GOOGLE_BRANCH_DASHBOARD_SHEET_ID!
  const hw = process.env.GOOGLE_BRANCH_HARDWARE_SHEET_ID!

  // Probe a row with formatting info — first 3 data rows of REV, focus on cols 6, 12-15 (firstPay + sum + months + red)
  console.log("=== REV formatted (rows 3-7, cols 0-25) ===")
  const rev = await sheets.spreadsheets.get({
    spreadsheetId: dash, ranges: ["'2. REV'!A3:Z7"], includeGridData: true,
    fields: "sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor,userEnteredValue)",
  })
  const revRows = rev.data.sheets?.[0]?.data?.[0]?.rowData ?? []
  for (let r = 0; r < revRows.length; r++) {
    const cells = revRows[r].values ?? []
    console.log(`  row ${r + 3}:`)
    for (const colIdx of [0, 6, 12, 13, 14, 15, 16, 17, 18, 19, 25]) {
      const c = cells[colIdx]
      if (!c) continue
      const fv = c.formattedValue
      const uev = c.userEnteredValue
      const bg = c.effectiveFormat?.backgroundColor
      const bgStr = bg ? `bg=(${bg.red ?? 0},${bg.green ?? 0},${bg.blue ?? 0})` : ""
      console.log(`    col${colIdx}: fv="${fv}" uev=${JSON.stringify(uev)} ${bgStr}`)
    }
  }

  // Probe HW stock first 10 rows
  console.log("\n=== HW stock first 12 rows ===")
  const stock = await sheets.spreadsheets.values.get({ spreadsheetId: hw, range: "재고현황!A1:E15", valueRenderOption: "FORMATTED_VALUE" })
  for (let i = 0; i < (stock.data.values ?? []).length; i++) {
    console.log(`  [${i}]:`, ((stock.data.values ?? [])[i] ?? []).slice(0, 5).join(" | "))
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
