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
 * 견고성: `branch_rev_deals`는 전 행 raw.row가 있으므로 이를 sheet_row 기준 SSOT로 삼고,
 * `branch_rev_lines` 중 raw.row가 없는 행(예: weekly-close 스냅샷 런)도 source_row로 매칭해
 * deals의 raw.row에서 파생값을 채운다. → 어떤 런이 활성이어도 교정된다.
 *
 * 사용:
 *   node scripts/backfill-rev-columns-from-raw.mjs            # 드라이런(변경 미리보기만)
 *   node scripts/backfill-rev-columns-from-raw.mjs --apply    # 실제 반영
 */
import { readFileSync } from "node:fs"
import { createClient } from "@supabase/supabase-js"

const APPLY = process.argv.includes("--apply")

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
const normalizeTeam = (raw) => { const s = raw == null ? "" : String(raw).trim(); return s ? (TEAM_ALIASES[s] ?? "기타") : null }
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
const dist = (vals, n = 12) => {
  const m = new Map()
  for (const v of vals) { const k = v ?? "(null)"; m.set(k, (m.get(k) ?? 0) + 1) }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v}×${k}`).join("  |  ")
}
async function fetchAll(table, columns) {
  const out = []; const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase.from(table).select(columns).order("id", { ascending: true }).range(from, from + size - 1)
    if (error) throw new Error(`${table} 조회 실패: ${error.message}`)
    out.push(...(data ?? [])); if (!data || data.length < size) break
  }
  return out
}
async function updateEach(table, items) {
  let ok = 0, fail = 0
  for (const { id, patch } of items) {
    const { error } = await supabase.from(table).update(patch).eq("id", id)
    if (error) { fail += 1; if (fail <= 5) console.error(`  UPDATE 실패 ${table} id=${id}: ${error.message}`) } else ok += 1
  }
  return { ok, fail }
}

// ── 1) branch_rev_deals (전 행 raw.row 보유 → SSOT) ────────────────────────
const deals = await fetchAll("branch_rev_deals", "id, sheet_row, raw")
const derivedBySheetRow = new Map()
const dealPatches = []
for (const d of deals) {
  const rr = rowOf(d.raw); if (!rr) continue
  const der = derive(rr)
  derivedBySheetRow.set(d.sheet_row, der)
  dealPatches.push({ id: d.id, patch: {
    team: der.team, manager: der.manager, status: der.status, deal_type: der.deal_type,
    product_version: der.product, region: der.region, importance: der.importance, note: der.note, first_payment: der.first_payment,
  } })
}
console.log(`=== branch_rev_deals: ${deals.length}행 (raw.row 있음 ${dealPatches.length}) ===`)
console.log("  AFTER product:", dist(dealPatches.map((p) => p.patch.product_version)))
console.log("  AFTER team   :", dist(dealPatches.map((p) => p.patch.team)))
console.log("  AFTER manager:", dist(dealPatches.map((p) => p.patch.manager)))

// ── 2) branch_rev_lines (앱이 읽는 표) — 자체 raw.row 우선, 없으면 source_row로 deals 파생 폴백 ──
const lines = await fetchAll("branch_rev_lines", "id, source_row, import_run_id, raw")
let ownRaw = 0, viaFallback = 0, unresolved = 0
const linePatches = []
for (const l of lines) {
  let der = null
  const rr = rowOf(l.raw)
  if (rr) { der = derive(rr); ownRaw += 1 }
  else if (derivedBySheetRow.has(l.source_row)) { der = derivedBySheetRow.get(l.source_row); viaFallback += 1 }
  else { unresolved += 1; continue }
  linePatches.push({ id: l.id, patch: {
    team: der.team, manager: der.manager, status: der.status, deal_type: der.deal_type,
    product: der.product, location: der.region, importance: der.importance, remark: der.note, first_payment: der.first_payment,
  } })
}
console.log(`\n=== branch_rev_lines: ${lines.length}행 (자체 raw ${ownRaw} · deals폴백 ${viaFallback} · 미해결 ${unresolved}) ===`)
console.log("  AFTER product:", dist(linePatches.map((p) => p.patch.product)))
console.log("  AFTER team   :", dist(linePatches.map((p) => p.patch.team)))

if (!APPLY) { console.log("\nℹ️ 드라이런 완료 — 반영하려면 --apply"); process.exit(0) }

const r1 = await updateEach("branch_rev_deals", dealPatches)
const r2 = await updateEach("branch_rev_lines", linePatches)
console.log(`\nbranch_rev_deals: ${r1.ok} 성공 / ${r1.fail} 실패`)
console.log(`branch_rev_lines: ${r2.ok} 성공 / ${r2.fail} 실패`)
console.log(`✅ 백필 완료 — 앱 캐시(60s) 만료 후 반영. 즉시 보려면 하드 리로드(Ctrl+Shift+R) 또는 재동기화.`)
