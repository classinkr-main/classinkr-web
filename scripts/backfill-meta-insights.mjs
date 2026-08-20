#!/usr/bin/env node
/**
 * scripts/backfill-meta-insights.mjs
 * Meta 캠페인 일자별 insights 과거 N개월 백필 → meta_insights_daily upsert.
 *
 * lib/ 는 server-only 라 import 불가 — Graph 호출·매핑·upsert 를 자체 포함한다
 * (lib/meta/marketing.ts fetchMetaDailyInsights, lib/repositories/meta-insights-daily.ts
 * upsertMetaInsightsDaily 와 동일 로직의 standalone 복제).
 *
 * 실행:
 *   node --env-file=.env.local scripts/backfill-meta-insights.mjs [--months 12]
 */
import { createClient } from "@supabase/supabase-js"
import { createHmac } from "node:crypto"

const monthsArg = process.argv.find((a, i) => process.argv[i - 1] === "--months")
const MONTHS = Number(monthsArg ?? 12)
if (!Number.isInteger(MONTHS) || MONTHS <= 0) {
  throw new Error(`--months 값이 올바르지 않습니다: "${monthsArg}"`)
}

const VERSION = process.env.META_GRAPH_API_VERSION?.trim() || "v25.0"
const TOKEN = process.env.META_ACCESS_TOKEN?.trim() || process.env.META_CAPI_ACCESS_TOKEN?.trim()
const RAW_ACCOUNT = process.env.META_AD_ACCOUNT_ID?.trim()
const APP_SECRET = process.env.META_APP_SECRET?.trim()
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
// 레포 관례: SECRET_KEY 우선, SERVICE_ROLE_KEY 폴백 (lib/supabase/server-env.ts 와 동일 순서).
const SERVICE_KEY = process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

if (!TOKEN || !RAW_ACCOUNT) throw new Error("META_ACCESS_TOKEN / META_AD_ACCOUNT_ID 필요")
if (!SUPABASE_URL || !SERVICE_KEY) throw new Error("Supabase URL / service key 필요")

const ACCOUNT = RAW_ACCOUNT.startsWith("act_") ? RAW_ACCOUNT : `act_${RAW_ACCOUNT}`
const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })

function graphUrl(path, params = {}) {
  const url = new URL(`https://graph.facebook.com/${VERSION}/${path}`)
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") url.searchParams.set(k, String(v))
  if (APP_SECRET) {
    url.searchParams.set("appsecret_proof", createHmac("sha256", APP_SECRET).update(TOKEN).digest("hex"))
  }
  return url
}

async function graphGet(path, params) {
  const res = await fetch(graphUrl(path, params), { headers: { Authorization: `Bearer ${TOKEN}` } })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Graph ${res.status}: ${body.error?.message ?? "unknown"}`)
  return body
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const nnum = (v) => (num(v) > 0 ? num(v) : null)
function extractLeads(actions = []) {
  const rows = actions.map((a) => ({ type: (a.action_type ?? "").toLowerCase(), value: num(a.value) }))
  const primary = rows.find((r) => r.type === "lead")
  if (primary) return primary.value
  const grouped = rows.find((r) => r.type === "onsite_conversion.lead_grouped")
  if (grouped) return grouped.value
  return rows.filter((r) => r.type.includes("lead")).reduce((m, r) => Math.max(m, r.value), 0)
}

const INSIGHT_FIELDS = "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions"

function mapRow(row) {
  if (!row.campaign_id || !row.date_start) return null
  return {
    date: row.date_start,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name ?? null,
    spend: num(row.spend),
    impressions: num(row.impressions),
    reach: num(row.reach),
    clicks: num(row.clicks),
    ctr: nnum(row.ctr),
    cpc: nnum(row.cpc),
    cpm: nnum(row.cpm),
    leads: extractLeads(row.actions),
  }
}

// lib/meta/marketing.ts fetchMetaDailyInsights 와 동일한 안전 상한 — 근거도 동일(무음 절단 방지).
const PAGE_CAP = 20

/** [since, until] 월 윈도우 하나의 일자별 insights 를 커서 페이징으로 수집한다. */
async function fetchMonthRows(since, until) {
  const rows = []
  let after
  let truncated = false

  for (let page = 0; page < PAGE_CAP; page += 1) {
    const res = await graphGet(`${ACCOUNT}/insights`, {
      level: "campaign",
      fields: INSIGHT_FIELDS,
      time_increment: 1,
      time_range: JSON.stringify({ since, until }),
      limit: 500,
      after,
    })
    for (const raw of res.data ?? []) {
      const mapped = mapRow(raw)
      if (mapped) rows.push(mapped)
    }

    if (!res.paging?.next) break
    if (!res.paging?.cursors?.after) {
      truncated = true
      break
    }
    after = res.paging.cursors.after
    if (page === PAGE_CAP - 1) truncated = true
  }

  // (a) 월 윈도우별 페이징 캡 도달 = 무음 유실 신호 — 반드시 경고로 노출한다.
  if (truncated) {
    console.warn(`⚠️  [meta-backfill] ${since} ~ ${until}: 페이징 상한(${PAGE_CAP}페이지) 도달 — 결과가 절단되었을 수 있습니다.`)
  }

  return { rows, truncated }
}

/**
 * (date, campaign_id) 기준 last-wins 디듑 — 커서 페이징이 페이지 경계에서 같은 행을
 * 중복 반환하면 Postgres upsert 는 한 문에서 같은 키를 두 번 건드릴 수 없어 청크 전체가
 * 죽는다(lib/repositories/meta-insights-daily.ts upsertMetaInsightsDaily 와 동일 이유).
 */
function dedupe(rows) {
  const map = new Map(rows.map((r) => [`${r.date}:${r.campaign_id}`, r]))
  return Array.from(map.values())
}

async function upsertChunked(rows, currency, syncedAt) {
  if (rows.length === 0) return 0
  const payload = rows.map((r) => ({ ...r, currency, synced_at: syncedAt }))
  for (let i = 0; i < payload.length; i += 500) {
    const { error } = await sb
      .from("meta_insights_daily")
      .upsert(payload.slice(i, i + 500), { onConflict: "date,campaign_id" })
    if (error) throw new Error(`upsert 실패 (rows ${i}~${i + payload.slice(i, i + 500).length}): ${error.message}`)
  }
  return payload.length
}

// 로컬(실행 환경) 캘린더 날짜를 YYYY-MM-DD 로 — toISOString() 은 UTC 변환이라 KST 새벽
// 실행 시 월 첫/마지막 날짜가 전월로 밀릴 수 있다. 월 경계 자체가 하루 밀리는 건 업서트가
// 멱등이라 무해하지만(다음 달 윈도우가 그 하루를 다시 덮어씀), date_start 값 자체가 실제
// 캘린더와 어긋나 보이는 걸 막기 위해 로컬 컴포넌트로 직접 조립한다.
function toLocalDateString(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

async function main() {
  const account = await graphGet(ACCOUNT, { fields: "currency" })
  const currency = account.currency ?? null
  const syncedAt = new Date().toISOString() // 이 백필 실행 전체가 공유하는 단일 타임스탬프.
  const today = new Date()

  console.log(`[meta-backfill] 시작 — 최근 ${MONTHS}개월, 계정 ${ACCOUNT}, 통화 ${currency ?? "(알 수 없음)"}`)

  let total = 0
  let truncatedMonths = 0

  for (let m = MONTHS - 1; m >= 0; m -= 1) {
    const start = new Date(today.getFullYear(), today.getMonth() - m, 1)
    const end = new Date(today.getFullYear(), today.getMonth() - m + 1, 0)
    const since = toLocalDateString(start)
    const until = toLocalDateString(end > today ? today : end)

    const { rows, truncated } = await fetchMonthRows(since, until)
    if (truncated) truncatedMonths += 1

    const deduped = dedupe(rows) // (b) upsert 전 last-wins 디듑.
    const upserted = await upsertChunked(deduped, currency, syncedAt)
    total += upserted

    console.log(`  ${since} ~ ${until}: ${upserted}행${truncated ? " (절단 — 위 경고 참고)" : ""}`)
  }

  console.log(`백필 완료 — 총 ${total}행`)
  if (truncatedMonths > 0) {
    console.warn(`⚠️  ${truncatedMonths}개월 구간이 페이징 상한으로 절단되었습니다. 필요 시 해당 구간만 좁혀서 재실행하세요.`)
    process.exitCode = 1
  }
}

main().catch((error) => {
  console.error("❌ 백필 실패:", error instanceof Error ? error.message : error)
  process.exit(1)
})
