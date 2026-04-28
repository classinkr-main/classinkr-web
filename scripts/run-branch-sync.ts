import { readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient } from "@supabase/supabase-js"
import type { CellFormat, FormattedCell } from "../lib/branch/google-sheets"

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
    credentials: {
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  })
  const sheets = google.sheets({ version: "v4", auth })
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })

  // Lazy-import parsers (they don't depend on server-only)
  const { parseRev, REV_RANGE } = await import("../lib/branch/parsers/rev.ts" as string)
  const { parseInbound, parseOutbound, parseStock, parseSalesMonthly, HW_RANGES } = await import("../lib/branch/parsers/hw.ts" as string)
  const { fyOf } = await import("../lib/branch/fiscal.ts" as string)

  const dashId = process.env.GOOGLE_BRANCH_DASHBOARD_SHEET_ID!
  const hwId = process.env.GOOGLE_BRANCH_HARDWARE_SHEET_ID!
  const refFy = fyOf(new Date())

  async function readWithFormat(spreadsheetId: string, range: string) {
    const res = await sheets.spreadsheets.get({
      spreadsheetId, ranges: [range], includeGridData: true,
      fields: "sheets.data.rowData.values(formattedValue,effectiveFormat.backgroundColor,userEnteredValue)",
    })
    const data = res.data.sheets?.[0]?.data?.[0]?.rowData ?? []
    return data.map((row) =>
      (row.values ?? []).map((cell): FormattedCell => ({
        value:
          cell.formattedValue != null && cell.formattedValue !== ""
            ? cell.formattedValue
            : cell.userEnteredValue?.stringValue ??
              cell.userEnteredValue?.numberValue ??
              null,
        bg: (cell.effectiveFormat?.backgroundColor as CellFormat | null | undefined) ?? null,
      }))
    )
  }

  // Start sync_run
  const { data: runRow, error: runErr } = await sb.from("branch_sync_runs")
    .insert({ source: "all", trigger: "manual", status: "running" }).select("id").single()
  if (runErr) throw runErr
  const runId = runRow!.id
  console.log(`▶ sync_run id=${runId}`)

  try {
    // REV
    console.log(`\n→ Reading REV ${REV_RANGE}…`)
    const revGrid = await readWithFormat(dashId, REV_RANGE)
    console.log(`  rows=${revGrid.length}`)
    const revRows = parseRev(revGrid, { refFy }).map((p: Record<string, unknown>) => ({
      sheet_row: p.sheet_row, customer_name: p.customer_name, branch_contact: p.branch_contact,
      team: p.team, manager: p.manager, deal_type: p.deal_type, status: p.status,
      first_payment: p.first_payment, product_version: p.product_version, region: p.region,
      importance: p.importance, note: p.note,
      contract_target: p.contract_target == null ? "" : String(p.contract_target),
      monthly_payments: p.monthly_payments, monthly_red: p.monthly_red, raw: p.raw,
    }))
    console.log(`  parsed deals=${revRows.length}`)
    const { error: revErr } = await sb.rpc("replace_branch_rev_deals", { rows: revRows })
    if (revErr) throw revErr
    console.log(`  ✓ REV inserted ${revRows.length}`)

    // HW
    console.log(`\n→ Reading HW…`)
    const [inboundGrid, outboundGrid, stockGrid, salesGrid] = await Promise.all([
      readWithFormat(hwId, HW_RANGES.inbound),
      readWithFormat(hwId, HW_RANGES.outbound),
      readWithFormat(hwId, HW_RANGES.stock),
      readWithFormat(hwId, HW_RANGES.sales),
    ])
    const inbound = parseInbound(inboundGrid).map((p: Record<string, unknown>) => ({
      ...p, quantity: String(p.quantity), unit_price: p.unit_price == null ? "" : String(p.unit_price), amount: p.amount == null ? "" : String(p.amount),
    }))
    const outbound = parseOutbound(outboundGrid).map((p: Record<string, unknown>) => ({
      ...p, quantity: String(p.quantity), revenue: p.revenue == null ? "" : String(p.revenue),
    }))
    const stock = parseStock(stockGrid).map((p: Record<string, unknown>) => ({ ...p, quantity: String(p.quantity) }))
    const sales = parseSalesMonthly(salesGrid, refFy).map((p: Record<string, unknown>) => ({ ...p, quantity: String(p.quantity), fiscal_year: String(p.fiscal_year), fiscal_month: String(p.fiscal_month) }))
    console.log(`  parsed in=${inbound.length} out=${outbound.length} stock=${stock.length} sales=${sales.length}`)

    for (const [fn, rows, label] of [
      ["replace_branch_hw_inbound", inbound, "inbound"],
      ["replace_branch_hw_outbound", outbound, "outbound"],
      ["replace_branch_hw_stock", stock, "stock"],
      ["replace_branch_hw_sales_monthly", sales, "sales_monthly"],
    ] as const) {
      const { error } = await sb.rpc(fn, { rows })
      if (error) throw new Error(`${label} RPC: ${error.message}`)
      console.log(`  ✓ ${label} inserted ${rows.length}`)
    }

    const total = revRows.length + inbound.length + outbound.length + stock.length + sales.length
    await sb.from("branch_sync_runs").update({ status: "success", rows_affected: total, finished_at: new Date().toISOString() }).eq("id", runId)
    console.log(`\n✅ DONE total_rows=${total}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await sb.from("branch_sync_runs").update({ status: "failed", error: msg, finished_at: new Date().toISOString() }).eq("id", runId)
    console.error(`\n❌ FAILED: ${msg}`)
    if (e instanceof Error) console.error(e.stack)
    process.exit(1)
  }
}

main().catch((e) => { console.error("UNCAUGHT:", e); process.exit(1) })
