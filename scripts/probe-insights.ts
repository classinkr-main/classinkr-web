import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"

const envText = readFileSync(join(process.cwd(), ".env.local"), "utf-8")
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
  if (!m) continue
  let v = m[2]
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
  if (!process.env[m[1]]) process.env[m[1]] = v
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })

  const { google } = await import("googleapis")
  const auth = new google.auth.GoogleAuth({
    credentials: { client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n") },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  const sheets = google.sheets({ version: "v4", auth })

  const { parseDsh, DSH_RANGE } = await import("../lib/branch/parsers/dsh.ts" as string)
  const { parseKpi, KPI_RANGE } = await import("../lib/branch/parsers/kpi.ts" as string)
  const { fyOf } = await import("../lib/branch/fiscal.ts" as string)
  const { buildInsightInput } = await import("../lib/branch/insights/input-builder.ts" as string)

  async function readWithFormat(spreadsheetId: string, range: string) {
    const res = await sheets.spreadsheets.get({
      spreadsheetId, ranges: [range], includeGridData: true,
      fields: "sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor,userEnteredValue)",
    })
    const data = res.data.sheets?.[0]?.data?.[0]?.rowData ?? []
    return data.map((row) =>
      (row.values ?? []).map((cell) => ({
        value: cell.formattedValue != null && cell.formattedValue !== "" ? cell.formattedValue : (cell.userEnteredValue?.stringValue ?? cell.userEnteredValue?.numberValue ?? null),
        bg: cell.effectiveFormat?.backgroundColor ?? null,
      }))
    )
  }

  const dashId = process.env.GOOGLE_BRANCH_DASHBOARD_SHEET_ID!
  const refFy = fyOf(new Date())
  const dsh = parseDsh(await readWithFormat(dashId, DSH_RANGE), refFy)
  const kpi = parseKpi(await readWithFormat(dashId, KPI_RANGE))
  const { data: deals } = await sb.from("branch_rev_deals").select("*")
  const { data: events } = await sb.from("public_events").select("*")
  const eventsTransformed = (events ?? []).map((e) => ({ title: e.title, startsAt: e.starts_at, location: e.location }))

  const input = buildInsightInput({
    team: "ALL", scope: "Q", now: new Date(),
    dsh, kpi, deals: deals ?? [],
    events: eventsTransformed,
    campaigns: [],
    hwAlerts: [],
  })

  writeFileSync("scripts/_insight-input.json", JSON.stringify(input, null, 2))
  console.log("Input written to scripts/_insight-input.json")
  console.log("\n=== Input summary ===")
  console.log("fiscalPeriod:", input.fiscalPeriod, "team:", input.team, "scope:", input.scope)
  console.log("team_pacing:", input.team_pacing)
  console.log("managers count:", input.managers.length)
  console.log("first manager sample:", JSON.stringify(input.managers[0], null, 2))
  console.log("regions count:", input.regions.length)
  console.log("regions top 3:", input.regions.slice(0, 3))
  console.log("bottleneck_kpi:", input.bottleneck_kpi)
  console.log("closing_deals count:", input.closing_deals.length)
  console.log("closing_deals top 3:", input.closing_deals.slice(0, 3))
  console.log("events_30d:", input.events_30d.length)
  console.log("campaigns_30d:", input.campaigns_30d.length)

  // Now call Gemini
  console.log("\n=== Calling Gemini ===")
  const { callGemini } = await import("../lib/branch/insights/gemini-runner.ts" as string)
  const t0 = Date.now()
  try {
    const { result, raw } = await callGemini(input)
    const dt = Date.now() - t0
    writeFileSync("scripts/_insight-output.json", JSON.stringify({ result, raw }, null, 2))
    console.log(`response in ${dt}ms`)
    console.log("\n--- one_liner ---")
    console.log(result.one_liner)
    console.log("\n--- next_actions ---")
    for (const [i, a] of result.next_actions.entries()) {
      console.log(`${i + 1}. ${a.title}`)
      console.log(`   why: ${a.why}`)
      console.log(`   owner: ${a.owner}, due: ${a.due ?? "—"}`)
    }
  } catch (e) {
    console.error("Gemini failed:", e instanceof Error ? e.message : String(e))
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
