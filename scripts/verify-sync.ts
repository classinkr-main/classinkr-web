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
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })

  // 1. Sample 3 deals
  const { data: deals } = await sb.from("branch_rev_deals")
    .select("customer_name, team, manager, region, importance, contract_target, first_payment, monthly_payments, monthly_red")
    .limit(3)
  console.log("\n=== branch_rev_deals (3 sample) ===")
  for (const d of deals ?? []) {
    console.log(`  ${d.customer_name} | team=${d.team} | manager=${d.manager} | region=${d.region} | target=${d.contract_target} | first=${d.first_payment}`)
    console.log(`    months: ${Object.keys(d.monthly_payments ?? {}).length} payment cells, ${Object.keys(d.monthly_red ?? {}).length} red cells`)
    if (Object.keys(d.monthly_payments ?? {}).length > 0) {
      const sample = Object.entries(d.monthly_payments).slice(0, 3)
      console.log(`    sample payments:`, sample)
    }
  }

  // 2. Counts
  const tables = ["branch_rev_deals", "branch_hw_inbound", "branch_hw_outbound", "branch_hw_stock", "branch_hw_sales_monthly"]
  console.log("\n=== row counts ===")
  for (const t of tables) {
    const { count } = await sb.from(t).select("*", { count: "exact", head: true })
    console.log(`  ${t}: ${count ?? 0}`)
  }

  // 3. Team distribution
  const { data: teamRows } = await sb.from("branch_rev_deals").select("team")
  const teamCount: Record<string, number> = {}
  for (const r of teamRows ?? []) teamCount[r.team ?? "(null)"] = (teamCount[r.team ?? "(null)"] ?? 0) + 1
  console.log("\n=== team distribution ===")
  for (const [t, c] of Object.entries(teamCount).sort(([, a], [, b]) => b - a)) console.log(`  ${t}: ${c}`)

  // 4. Manager distribution (top 10)
  const { data: mgrRows } = await sb.from("branch_rev_deals").select("manager")
  const mgrCount: Record<string, number> = {}
  for (const r of mgrRows ?? []) mgrCount[r.manager ?? "(null)"] = (mgrCount[r.manager ?? "(null)"] ?? 0) + 1
  console.log("\n=== top managers ===")
  for (const [t, c] of Object.entries(mgrCount).sort(([, a], [, b]) => b - a).slice(0, 10)) console.log(`  ${t}: ${c}`)

  // 5. Red-cell coverage
  const { data: redCheck } = await sb.from("branch_rev_deals").select("monthly_red, first_payment").not("first_payment", "is", null)
  const totalWithFirstPay = redCheck?.length ?? 0
  const withRed = redCheck?.filter((d) => Object.keys(d.monthly_red ?? {}).length > 0).length ?? 0
  console.log(`\n=== red cell coverage ===`)
  console.log(`  deals with first_payment: ${totalWithFirstPay}`)
  console.log(`  among them, with monthly_red entries: ${withRed} (${totalWithFirstPay > 0 ? ((withRed/totalWithFirstPay)*100).toFixed(0) : 0}%)`)

  // 6. Region distribution
  const { data: regionRows } = await sb.from("branch_rev_deals").select("region")
  const regionCount: Record<string, number> = {}
  for (const r of regionRows ?? []) regionCount[r.region ?? "(null)"] = (regionCount[r.region ?? "(null)"] ?? 0) + 1
  console.log("\n=== region distribution ===")
  for (const [t, c] of Object.entries(regionCount).sort(([, a], [, b]) => b - a)) console.log(`  ${t}: ${c}`)
}

main().catch((e) => { console.error(e); process.exit(1) })
