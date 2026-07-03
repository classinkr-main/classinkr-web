#!/usr/bin/env node
/**
 * REV 좌측 메타 열 교정 백필 (재동기화 없이).
 *
 * 배경: `'2. REV'` 시트에 City/Scale/Porta 열이 왼쪽에 끼면서, 예전 파서(rev.ts)의 고정
 * 열 매핑이 우측으로 밀려 team=City, manager=Scale, product_version=Status 로 잘못 읽고
 * Product(HW/SW 신호, J열)은 아예 안 읽었다. 파서는 이미 헤더 기반으로 교정됨(REV_COLS 실측 확정).
 *
 * 이 스크립트는 시트를 다시 안 당기고, 이미 DB에 보존된 원본 `raw.row`(84칸)에서 올바른
 * 스칼라 메타(team/manager/status/deal_type/product/region/importance/note/first_payment)를
 * 재추출해 `branch_rev_deals`(시트 미러)와 `branch_rev_lines`(DB-native, 앱이 실제로 읽는 표)를
 * 교정한다. 월/주차 금액(색 기반 확도 포함)은 손대지 않는다 — raw.row엔 색이 없어 재계산하면
 * 오히려 확도가 소실되므로, 스칼라 열만 UPDATE 한다.
 *
 * 사용:
 *   node scripts/backfill-rev-columns-from-raw.mjs            # 드라이런(변경 미리보기만)
 *   node scripts/backfill-rev-columns-from-raw.mjs --apply    # 실제 반영
 */
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const APPLY = process.argv.includes("--apply")

// ── env (.env.local) 로드 ────────────────────────────────────────────────
function loadEnv(url) {
  try {
    for (const line of readFileSync(url, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      let v = m[2]
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
      if (!(m[1] in process.env)) process.env[m[1]] = v
    }
  } catch { /* optional */ }
}
loadEnv(new URL("../.env.local", import.meta.url))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error("MISSING ENV: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SECRET_KEY/SERVICE_ROLE_KEY"); process.exit(1) }
const supabase = createClient(url, key, { auth: { persistSession: false } })

// ── 파서와 동일한 정규화 (rev.ts SSOT를 스크립트에서 최소 복제) ─────────────
const TEAM_ALIASES = {
  BD: "BD", "Business Development": "BD", 사업개발: "BD",
  MK: "MKT", MKT: "MKT", Marketing: "MKT", 마케팅: "MKT",
  CS: "CSM", CSM: "CSM", "Customer Success": "CSM", 고객지원: "CSM",
}
const normalizeTeam = (raw) => {
  const s = raw == null ? "" : String(raw).trim()
  if (!s) return null
  return TEAM_ALIASES[s] ?? "기타"
}
const asString = (v) => { if (v == null) return null; const s = String(v).trim(); return s.length ? s : null }
const asDate = (v) => {
  const s = asString(v); if (!s) return null
  const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null
}
// 실측 확정 열 위치(rev.ts REV_COLS와 동일)
const COL = { region: 2, importance: 3, team: 5, manager: 6, status: 7, dealType: 8, product: 9, firstPayment: 10, note: 11 }

function derive(rawRow) {
  return {
    region: asString(rawRow[COL.region]),
    importance: asString(rawRow[COL.importance]),
    team: normalizeTeam(rawRow[COL.team]),
    manager: asString(rawRow[COL.manager]),
    status: asString(rawRow[COL.status]),
    deal_type: asString(rawRow[COL.dealType]),
    product: asString(rawRow[COL.product]),
    first_payment: asDate(rawRow[COL.firstPayment]),
    note: asString(rawRow[COL.note]),
  }
}

const rowOf = (raw) => (raw && Array.isArray(raw.row) ? raw.row : null)
const dist = (rows, pick) => {
  const m = new Map()
  for (const r of rows) { const k = pick(r) ?? "(null)"; m.set(k, (m.get(k) ?? 0) + 1) }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${v}×${k}`).join("  |  ")
}

async function fetchAll(table, columns) {
  const out = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase.from(table).select(columns).order("id", { ascending: true }).range(from, from + size - 1)
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < size) break
  }
  return out
}

async function backfillTable(table, mapFields) {
  const rows = await fetchAll(table, `id, raw`)
  const withRaw = rows.filter((r) => rowOf(r.raw))
  const skipped = rows.length - withRaw.length
  console.log(`\n=== ${table}: ${rows.length}행 (raw.row 있음 ${withRaw.length}, 없음 ${skipped}) ===`)
  console.log(`  BEFORE product 분포: ${dist(withRaw, (r) => mapFields.readCurrentProduct(r))}`)
  console.log(`  AFTER  product 분포: ${dist(withRaw, (r) => derive(rowOf(r.raw)).product)}`)
  console.log(`  AFTER  team 분포:    ${dist(withRaw, (r) => derive(rowOf(r.raw)).team)}`)
  console.log(`  AFTER  manager 분포: ${dist(withRaw, (r) => derive(rowOf(r.raw)).manager)}`)

  if (!APPLY) { console.log("  (드라이런 — 변경 안 함. --apply 로 반영)"); return }

  let updated = 0, failed = 0
  for (const r of withRaw) {
    const d = derive(rowOf(r.raw))
    const patch = mapFields.toPatch(d)
    const { error } = await supabase.from(table).update(patch).eq("id", r.id)
    if (error) { failed += 1; if (failed <= 5) console.error(`  UPDATE 실패 id=${r.id}: ${error.message}`) }
    else updated += 1
  }
  console.log(`  반영: ${updated} 성공, ${failed} 실패`)
}

// branch_rev_deals: product_version/team/manager/status/deal_type/region/importance/note/first_payment
await backfillTable("branch_rev_deals", {
  readCurrentProduct: (r) => r.product_version,
  toPatch: (d) => ({
    team: d.team, manager: d.manager, status: d.status, deal_type: d.deal_type,
    product_version: d.product, region: d.region, importance: d.importance,
    note: d.note, first_payment: d.first_payment,
  }),
})

// branch_rev_lines(앱이 실제 읽는 DB-native): product/team/manager/status/deal_type/location/importance/remark/first_payment
await backfillTable("branch_rev_lines", {
  readCurrentProduct: (r) => r.product,
  toPatch: (d) => ({
    team: d.team, manager: d.manager, status: d.status, deal_type: d.deal_type,
    product: d.product, location: d.region, importance: d.importance,
    remark: d.note, first_payment: d.first_payment,
  }),
})

console.log(`\n${APPLY ? "✅ 백필 완료" : "ℹ️ 드라이런 완료 — 반영하려면 --apply"}`)
