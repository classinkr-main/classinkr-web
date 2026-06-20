/**
 * 고객사 통합 전 현황 진단.
 *
 * 5개 소스(customers / partner_accounts / branch_rev_deals / leads /
 * external_crm_records)의 원시 건수 vs 정규화 고유 고객사 수, crm_source_links
 * 매칭 현황, 지역 정규화 커버리지(미매칭 상위값 포함)를 리포트한다.
 *
 * 사용:
 *   npx tsx scripts/diagnose-company-dedup.ts
 *
 * 읽기 전용 — 어떤 데이터도 수정하지 않는다. NEXT_PUBLIC_SUPABASE_URL 과
 * SUPABASE_SERVICE_ROLE_KEY(또는 SUPABASE_SECRET_KEY) 가 필요하다.
 */
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"

import { isPlaceholderCrmName, normalizeCrmName } from "../lib/crm-source-linking"
import { normalizeRegionLabel } from "../lib/regions/korea-regions"

function loadEnvLocal(): void {
  const envPath = join(process.cwd(), ".env.local")
  if (!existsSync(envPath)) return
  const envText = readFileSync(envPath, "utf8")
  for (const line of envText.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!match) continue
    let value = match[2].trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[match[1]]) process.env[match[1]] = value
  }
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

/** 1000행 단위 페이지네이션으로 컬럼 전체를 가져온다(읽기 전용). */
async function fetchAll<T>(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  filters?: Record<string, string | number | boolean>,
): Promise<T[]> {
  const pageSize = 1000
  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(columns)
    if (filters) {
      for (const [column, value] of Object.entries(filters)) query = query.eq(column, value)
    }
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) {
      console.warn(`  ! ${table} 조회 실패: ${error.message}`)
      break
    }
    const batch = (data ?? []) as unknown as T[]
    rows.push(...batch)
    if (batch.length < pageSize) break
  }
  return rows
}

async function countRows(supabase: SupabaseClient, table: string): Promise<number | null> {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true })
  if (error) {
    console.warn(`  ! ${table} 카운트 실패: ${error.message}`)
    return null
  }
  return count ?? 0
}

function distinctNormalizedNames(names: (string | null | undefined)[]): Set<string> {
  const set = new Set<string>()
  for (const n of names) {
    const norm = normalizeCrmName(n)
    if (norm) set.add(norm)
  }
  return set
}

interface RegionCoverage {
  nonEmpty: number
  matched: number
  rate: number
  unmatched: Map<string, number>
}

function regionCoverage(values: (string | null | undefined)[]): RegionCoverage {
  let nonEmpty = 0
  let matched = 0
  const unmatched = new Map<string, number>()
  for (const v of values) {
    const s = (v ?? "").trim()
    if (!s) continue
    nonEmpty++
    if (normalizeRegionLabel(s)) matched++
    else unmatched.set(s, (unmatched.get(s) ?? 0) + 1)
  }
  return { nonEmpty, matched, rate: nonEmpty ? matched / nonEmpty : 0, unmatched }
}

function printCoverage(label: string, cov: RegionCoverage): void {
  const pct = (cov.rate * 100).toFixed(1)
  console.log(`  ${label}: 값 있음 ${cov.nonEmpty} · 매칭 ${cov.matched} (${pct}%) · 미매칭 ${cov.unmatched.size}종`)
  const top = [...cov.unmatched.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)
  for (const [value, n] of top) console.log(`      미매칭  ${value}  ×${n}`)
}

interface CustomerRow {
  id: string
  name: string | null
  region_label: string | null
}
interface SheetRow {
  customer_name: string | null
  region: string | null
  product_version: string | null
}
interface LeadRow {
  name: string | null
  org: string | null
  branch: string | null
}
interface ExternalRow {
  display_name: string | null
  normalized_name: string | null
}
interface LinkRow {
  source_system: string
  target_type: string
  status: string
}

async function main(): Promise<void> {
  loadEnvLocal()
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL")
  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || requireEnv("SUPABASE_SECRET_KEY")
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  console.log("════════ 고객사 통합 진단 ════════\n")

  // 1) 원시 건수
  console.log("── 1) 소스별 원시 건수 ──")
  const tables = ["customers", "partner_accounts", "branch_rev_deals", "leads", "external_crm_records"]
  for (const t of tables) {
    const c = await countRows(supabase, t)
    console.log(`  ${t}: ${c ?? "?"}`)
  }
  console.log()

  // 2) 데이터 적재
  const customers = await fetchAll<CustomerRow>(supabase, "customers", "id, name, region_label")
  const sheet = await fetchAll<SheetRow>(supabase, "branch_rev_deals", "customer_name, region, product_version")
  const leads = await fetchAll<LeadRow>(supabase, "leads", "name, org, branch")
  const externalAccounts = await fetchAll<ExternalRow>(
    supabase,
    "external_crm_records",
    "display_name, normalized_name",
    { object_api_key: "account", is_stale: false },
  )

  // 3) 정규화 고유 고객사 수 vs 원시 건수
  console.log("── 2) 정규화 고유 고객사 수 (중복 압축) ──")
  const crmNames = distinctNormalizedNames(customers.map((c) => c.name))
  const sheetNonPlaceholder = sheet.filter((d) => !isPlaceholderCrmName(d.customer_name))
  const sheetNames = distinctNormalizedNames(sheetNonPlaceholder.map((d) => d.customer_name))
  const extNames = new Set<string>()
  for (const r of externalAccounts) {
    const norm = r.normalized_name?.trim() || normalizeCrmName(r.display_name)
    if (norm) extNames.add(norm)
  }
  console.log(`  CRM customers:        원시 ${customers.length} → 고유 ${crmNames.size}`)
  console.log(
    `  시트 branch_rev_deals: 원시 ${sheet.length} (플레이스홀더 제외 ${sheetNonPlaceholder.length}) → 고유 ${sheetNames.size}`,
  )
  console.log(`  외부 CRM account:      원시 ${externalAccounts.length} → 고유 ${extNames.size}`)

  const union = new Set<string>([...crmNames, ...sheetNames, ...extNames])
  const sheetInCrm = [...sheetNames].filter((n) => crmNames.has(n)).length
  const extInCrm = [...extNames].filter((n) => crmNames.has(n)).length
  console.log(`  → 추정 전체 고유 고객사(이름 기준 합집합): ${union.size}`)
  console.log(`     시트∩CRM 이름일치: ${sheetInCrm} · 외부∩CRM 이름일치: ${extInCrm}`)
  console.log(`     ⓘ 이름 단순일치 추정치 — 실제 통합은 crm_source_links 확정 기준\n`)

  // 4) crm_source_links 현황
  console.log("── 3) crm_source_links 매칭 현황 ──")
  const links = await fetchAll<LinkRow>(supabase, "crm_source_links", "source_system, target_type, status")
  const bySystemStatus = new Map<string, number>()
  for (const l of links) {
    const key = `${l.source_system} · ${l.status}`
    bySystemStatus.set(key, (bySystemStatus.get(key) ?? 0) + 1)
  }
  for (const [key, n] of [...bySystemStatus.entries()].sort()) console.log(`  ${key}: ${n}`)
  const confirmedToCustomer = links.filter((l) => l.status === "confirmed" && l.target_type === "customer").length
  console.log(`  → 고객사(customer)로 확정 링크된 소스: ${confirmedToCustomer}\n`)

  // 5) 지역 정규화 커버리지
  console.log("── 4) 지역 정규화 커버리지 (lib/regions 기준) ──")
  printCoverage("customers.region_label", regionCoverage(customers.map((c) => c.region_label)))
  printCoverage("branch_rev_deals.region", regionCoverage(sheet.map((d) => d.region)))
  printCoverage("leads.branch", regionCoverage(leads.map((l) => l.branch)))
  console.log()

  // 6) 시트 product_version(HW/SW 참고) 분포 상위
  console.log("── 5) 시트 product_version 분포(HW/SW 참고) 상위 ──")
  const pv = new Map<string, number>()
  for (const d of sheet) {
    const v = (d.product_version ?? "").trim() || "(없음)"
    pv.set(v, (pv.get(v) ?? 0) + 1)
  }
  for (const [v, n] of [...pv.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) {
    console.log(`  ${v}: ${n}`)
  }

  console.log("\n════════ 진단 끝 ════════")
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
