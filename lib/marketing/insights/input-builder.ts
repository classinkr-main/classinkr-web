// lib/marketing/insights/input-builder.ts
// 주간 AI 브리핑 입력 조립 — lib/branch/insights/input-builder.ts 패턴 미러.
//
// 원칙(branch 와 동일): LLM 에게 원시 로그를 던지지 않는다. 코드가 계산을 끝낸
// "인용 가능한 수치"만 평탄하게 담아 보내고, LLM 은 해석·우선순위만 붙인다.
// 숫자 필드를 평탄·명시적으로 두는 이유는 sanity-check 가 출력의 모든 숫자를 이 입력
// 집합과 대조해야 하기 때문이다(중첩·파생 수치는 검증 사각지대가 된다).
//
// ── 정직 규칙(위반 금지) ──────────────────────────────────────
//  - Meta 광고비는 USD 네이티브 — KRW 환산·통화 폴딩 금지.
//  - 종합 ROAS·채널 ROI 는 계산하지도, 입력에 담지도 않는다(귀속·통화 불가).
//  - 분모 0/미측정은 0 이 아니라 null. 미측정을 0 으로 포장하면 LLM 이 "집행 없음"으로 읽는다.

import "server-only"
import { createHash } from "crypto"

import {
  detectAnomalies,
  ANOMALY_KIND_LABEL,
  type AnomalyCampaignInput,
  type AnomalyFlag,
} from "@/lib/marketing/anomaly"
import { assembleMarketingPerf, kstToday } from "@/lib/marketing/perf-assemble"
import { shiftDays } from "@/lib/marketing/perf"
import { listCampaigns } from "@/lib/repositories/marketing-campaigns"
import {
  getMetaInsightsDailyRange,
  type MetaInsightsDailyRecord,
} from "@/lib/repositories/meta-insights-daily"
import type { CampaignWithLinks } from "@/lib/types/marketing-campaign"

/* ─── 입력 계약 ───────────────────────────────────────────────── */

export interface MarketingInsightWeek {
  week_start: string
  week_end: string
  spend_usd: number
  leads: number
  cpl_usd: number | null
}

export interface MarketingInsightScoreboardRow {
  name: string
  status: string
  elapsed_pct: number | null
  execution_pct: number | null
  pacing_currency: "USD" | "KRW" | null
  leads: number
  cpl_usd: number | null
}

export interface MarketingInsightAnomaly {
  kind: string
  label: string
  campaign_name: string | null
  severity: "warn" | "high"
  detail: string
  current: number
  baseline: number
}

export interface MarketingInsightInput {
  scope: "weekly"
  generated_for: string
  period: { key: string; since: string; until: string }
  snapshot_at: string | null
  currency_note: string

  // 기간 KPI — perf 응답의 봉투를 평탄화(값/직전값만, deltaPct 는 파생이라 제외).
  kpis: {
    spend_usd: number | null
    spend_usd_prev: number | null
    leads: number | null
    leads_prev: number | null
    cpl_usd: number | null
    cpl_usd_prev: number | null
    lead_conversion_rate_pct: number | null
    budget_execution_pct_krw: number | null
  }

  weekly: MarketingInsightWeek[]
  funnel: {
    impressions: number
    clicks: number
    ctr_pct: number | null
    ad_leads: number
    contacted: number
    converted_leads: number
  }
  scoreboard: MarketingInsightScoreboardRow[]
  anomalies: MarketingInsightAnomaly[]
  updates: Array<{ kind: string; body: string; created_at: string; created_by: string | null }>
  data_caveats: string[]
}

/* ─── digest ─────────────────────────────────────────────────── */

/** 키 정렬 정규화 stringify — 객체 키 순서가 바뀌어도 같은 입력이면 같은 해시가 나온다. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null"
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`
}

/**
 * 입력 해시 — branch 의 digestInput 과 같은 기법(정규화 stringify → sha256).
 * 단 snapshot_at 은 제외한다: 크론이 같은 수치를 다시 동기화하면 이 값만 바뀌는데,
 * 그때마다 digest 가 깨지면 "같은 데이터면 재호출 안 함"이라는 캐시 계약이 무의미해진다.
 */
export function digestInput(input: MarketingInsightInput): string {
  const stable: Record<string, unknown> = { ...input }
  delete stable.snapshot_at
  return createHash("sha256").update(stableStringify(stable)).digest("hex")
}

/* ─── 창(window) 산술 ─────────────────────────────────────────── */

const round2 = (n: number) => Math.round(n * 100) / 100
const round1 = (n: number) => Math.round(n * 10) / 10

interface MetricWindow {
  spend: number
  leads: number
  impressions: number
  clicks: number
}

const EMPTY_WINDOW: MetricWindow = { spend: 0, leads: 0, impressions: 0, clicks: 0 }

function sumWindow(rows: readonly MetaInsightsDailyRecord[], since: string, until: string): MetricWindow {
  const acc = { ...EMPTY_WINDOW }
  for (const r of rows) {
    if (r.date < since || r.date > until) continue
    acc.spend += r.spend
    acc.leads += r.leads
    acc.impressions += r.impressions
    acc.clicks += r.clicks
  }
  return acc
}

/** CPL = 기간 spend ÷ 기간 leads. 리드 0 이면 "무한대"가 아니라 미산정(null). */
const cplOf = (w: MetricWindow): number | null => (w.leads > 0 ? round2(w.spend / w.leads) : null)
/** CTR(%) = clicks ÷ impressions × 100. 노출 0 이면 미산정(null) — 0% 는 거짓이다. */
const ctrOf = (w: MetricWindow): number | null =>
  w.impressions > 0 ? round1((w.clicks / w.impressions) * 100) : null

/* ─── 조립 ────────────────────────────────────────────────────── */

const ANOMALY_LABEL_FALLBACK = "이상"

export async function buildMarketingInsightInput(): Promise<MarketingInsightInput> {
  const today = kstToday()
  // 최근 37일 = 30일 창 + 직전 7일 창을 모두 덮는 최소 로드 범위.
  const loadSince = shiftDays(today, -36)

  const [perf, dailyRows, campaigns] = await Promise.all([
    assembleMarketingPerf("30d"),
    // 소스 실패는 섹션 강등(caveat)으로 흡수 — 이상 감지 창이 통째로 사라져도 브리핑은 만든다.
    getMetaInsightsDailyRange(loadSince, today).catch((): MetaInsightsDailyRecord[] | null => null),
    listCampaigns().catch((): CampaignWithLinks[] => []),
  ])

  // ── 주간 집계(최근 4주) — perf.daily 에서 파생. 행이 없는 날은 실측 무집행이다
  //    (로드 범위가 기간 전체를 덮으므로 결측이 아니다 — perf-assemble 스파크라인과 같은 규약).
  const weekly: MarketingInsightWeek[] = []
  for (let i = 3; i >= 0; i -= 1) {
    const weekEnd = shiftDays(today, -7 * i)
    const weekStart = shiftDays(weekEnd, -6)
    let spend = 0
    let leads = 0
    for (const point of perf.daily) {
      if (point.date < weekStart || point.date > weekEnd) continue
      spend += point.spend
      leads += point.leads
    }
    weekly.push({
      week_start: weekStart,
      week_end: weekEnd,
      spend_usd: round2(spend),
      leads,
      cpl_usd: leads > 0 ? round2(spend / leads) : null,
    })
  }

  // ── 이상 감지 입력: Meta 일자 스냅샷으로 캠페인별 7일/직전7일/30일 창을 독립 계산 ──
  // (perf-assemble 은 기간 1개만 계산한다 — 그 모듈을 고치지 않고 여기서 창을 직접 만든다.)
  const w7 = { since: shiftDays(today, -6), until: today }
  const wPrev7 = { since: shiftDays(today, -13), until: shiftDays(today, -7) }
  const w30 = { since: shiftDays(today, -29), until: today }

  const rowsByMetaCampaign = new Map<string, MetaInsightsDailyRecord[]>()
  const metaNameById = new Map<string, string | null>()
  for (const row of dailyRows ?? []) {
    const list = rowsByMetaCampaign.get(row.campaignId)
    if (list) list.push(row)
    else rowsByMetaCampaign.set(row.campaignId, [row])
    if (row.campaignName) metaNameById.set(row.campaignId, row.campaignName)
  }

  const pacingByCampaignId = new Map(perf.scoreboard.map((r) => [r.campaignId, r.pacing]))
  const anomalyInputs: AnomalyCampaignInput[] = []
  const linkedMetaIds = new Set<string>()

  for (const campaign of campaigns) {
    const metaRefIds = campaign.links.filter((l) => l.refType === "meta_campaign").map((l) => l.refId)
    for (const id of metaRefIds) linkedMetaIds.add(id)
    // 소스 실패(dailyRows null)면 창을 지어내지 않는다 — 빈 창으로 두어 CPL/CTR 규칙이 침묵한다.
    const rows = dailyRows ? metaRefIds.flatMap((id) => rowsByMetaCampaign.get(id) ?? []) : []
    const has = dailyRows != null && metaRefIds.length > 0
    const cur7 = sumWindow(rows, w7.since, w7.until)
    const prev7 = sumWindow(rows, wPrev7.since, wPrev7.until)
    const cur30 = sumWindow(rows, w30.since, w30.until)
    const pacing = pacingByCampaignId.get(campaign.id) ?? null
    anomalyInputs.push({
      id: campaign.id,
      name: campaign.name,
      cpl7d: has ? cplOf(cur7) : null,
      cpl30d: has ? cplOf(cur30) : null,
      leads7d: has ? cur7.leads : 0,
      leadsPrev7d: has ? prev7.leads : 0,
      ctr7d: has ? ctrOf(cur7) : null,
      ctr30d: has ? ctrOf(cur30) : null,
      executionPct: pacing?.executionPct ?? null,
      elapsedPct: pacing?.elapsedPct ?? null,
    })
  }

  // 캠페인 개체에 연결되지 않은 Meta 캠페인 — 실제로 돈을 쓰는 축이므로 감지에서 빼지 않는다.
  // (페이싱은 우리 예산 개체가 없어 미산정 null — 없는 예산을 지어내지 않는다.)
  for (const [metaId, rows] of rowsByMetaCampaign) {
    if (linkedMetaIds.has(metaId)) continue
    const cur7 = sumWindow(rows, w7.since, w7.until)
    const prev7 = sumWindow(rows, wPrev7.since, wPrev7.until)
    const cur30 = sumWindow(rows, w30.since, w30.until)
    anomalyInputs.push({
      id: metaId,
      name: metaNameById.get(metaId) ?? `Meta 캠페인 ${metaId}`,
      cpl7d: cplOf(cur7),
      cpl30d: cplOf(cur30),
      leads7d: cur7.leads,
      leadsPrev7d: prev7.leads,
      ctr7d: ctrOf(cur7),
      ctr30d: ctrOf(cur30),
      executionPct: null,
      elapsedPct: null,
    })
  }

  const flags = detectAnomalies({ campaigns: anomalyInputs })

  // ── 퍼널 CTR — 노출 0 이면 미산정(null) ──
  const ctrPct =
    perf.funnel.impressions > 0 ? round1((perf.funnel.clicks / perf.funnel.impressions) * 100) : null

  // ── 데이터 한계 — LLM 이 "없는 것"을 "0" 으로 읽지 않도록 명시 ──
  const data_caveats: string[] = []
  if (dailyRows == null) data_caveats.push("Meta 일자 스냅샷 조회 실패 — 이상 감지의 CPL·CTR 축 미산정")
  if (perf.snapshotAt == null) data_caveats.push("Meta 스냅샷 동기화 시각 미상 — 수치가 최신이 아닐 수 있음")
  if (perf.kpis.spendUsd.value == null) data_caveats.push("기간 Meta 광고비 미측정(소스 실패)")
  if (perf.kpis.budgetExecutionPct.value == null)
    data_caveats.push("KRW 채널 예산 집행률 미측정 — 집행 기록이 없거나 배정 예산 미입력")
  if (campaigns.length === 0) data_caveats.push("등록된 캠페인 개체가 없음")
  if (perf.updatesFeed.length === 0) data_caveats.push("최근 팀 업데이트 로그 없음")
  if (flags.length === 0) data_caveats.push("규칙 기반 이상 감지에서 걸린 항목 없음")

  return {
    scope: "weekly",
    generated_for: today,
    period: { key: perf.period.key, since: perf.period.since, until: perf.period.until },
    snapshot_at: perf.snapshotAt,
    currency_note:
      "Meta 광고비·CPL 은 USD 네이티브다. 원화로 환산하지 말 것. KRW 예산 집행률은 별개 축이며 USD 와 합산 불가.",
    kpis: {
      spend_usd: perf.kpis.spendUsd.value,
      spend_usd_prev: perf.kpis.spendUsd.previous,
      leads: perf.kpis.leads.value,
      leads_prev: perf.kpis.leads.previous,
      cpl_usd: perf.kpis.cplUsd.value,
      cpl_usd_prev: perf.kpis.cplUsd.previous,
      lead_conversion_rate_pct: perf.kpis.leadConversionRate.value,
      budget_execution_pct_krw: perf.kpis.budgetExecutionPct.value,
    },
    weekly,
    funnel: {
      impressions: perf.funnel.impressions,
      clicks: perf.funnel.clicks,
      ctr_pct: ctrPct,
      ad_leads: perf.funnel.adLeads,
      contacted: perf.funnel.contacted,
      converted_leads: perf.funnel.convertedLeads,
    },
    scoreboard: perf.scoreboard.map((row) => ({
      name: row.name,
      status: row.status,
      elapsed_pct: row.pacing.elapsedPct,
      execution_pct: row.pacing.executionPct,
      pacing_currency: row.pacingCurrency,
      leads: row.leads,
      cpl_usd: row.cpl,
    })),
    anomalies: flags.map(toInputAnomaly),
    updates: perf.updatesFeed.slice(0, 10).map((u) => ({
      kind: u.kind,
      body: u.body,
      created_at: u.createdAt,
      created_by: u.createdBy,
    })),
    data_caveats,
  }
}

function toInputAnomaly(flag: AnomalyFlag): MarketingInsightAnomaly {
  return {
    kind: flag.kind,
    label: ANOMALY_KIND_LABEL[flag.kind] ?? ANOMALY_LABEL_FALLBACK,
    campaign_name: flag.campaignName,
    severity: flag.severity,
    detail: flag.detail,
    current: flag.metric.current,
    baseline: flag.metric.baseline,
  }
}
