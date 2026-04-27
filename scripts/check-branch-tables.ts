import { readFileSync } from "node:fs"
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SECRET_KEY!
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const tables = [
    "branch_rev_deals",
    "branch_hw_inbound",
    "branch_hw_outbound",
    "branch_hw_stock",
    "branch_hw_sales_monthly",
    "branch_dashboard_insights",
    "branch_sync_runs",
  ]
  for (const t of tables) {
    const { count, error } = await sb.from(t).select("*", { count: "exact", head: true })
    if (error) console.log(`  ❌ ${t}: ${error.message}`)
    else console.log(`  ✓ ${t}: rows=${count ?? 0}`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
