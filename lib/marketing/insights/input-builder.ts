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

import { getCompassAdsDaily } from "@/lib/compass/bridge"
import { detectAnomalies, ANOMALY_KIND_LABEL, type AnomalyFlag } from "@/lib/marketing/anomaly"
// 창 산술(7일/직전7일/30일)은 스코어보드 조립과 공유하는 순수 모듈에서 온다 —
// 두 화면의 "이상"이 다른 수치를 근거로 갈라지지 않게 하는 단일 정의.
import {
  anomalyLoadSince,
  buildAnomalyCampaignInputs,
} from "@/lib/marketing/anomaly-input"
import { aggregateCompassCreatives } from "@/lib/marketing/compass-creative"
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

/** 소재(광고) 단위 실측 — Compass 브리지(compass_ads_v). 두 리드 축이 다르다는 사실도 함께 싣는다. */
export interface MarketingInsightCreative {
  ad_name: string
  /** Meta 리포트 리드(Compass 수집분) — perf 의 리드(우리 leads 테이블)와 모집단이 다르다. */
  leads: number
  spend_usd: number
  /** spend_usd ÷ leads(둘 다 Compass 축). 분모 0 이면 null. */
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

  // 기간 KPI — perf 응답의 봉투를 평탄화.
  // deltaPct 도 넣는다: 브리핑은 본래 "얼마나 달라졌나"를 말하는 글이라 증감률을 반드시 인용하는데,
  // 입력에 없으면 모델이 직접 계산하고(예: 156/21 → 642.86%) 그 값이 sanity check 에 "입력에 없는 숫자"로
  // 걸린다. 더 나쁜 건 화면 KPI 카드가 쓰는 반올림값(+638%)과 브리핑 문구가 갈린다는 점이다 —
  // 같은 화면에서 두 숫자가 다르면 그게 곧 신뢰 손상이다. 우리가 계산한 값을 그대로 인용하게 한다.
  kpis: {
    spend_usd: number | null
    spend_usd_prev: number | null
    spend_usd_delta_pct: number | null
    leads: number | null
    leads_prev: number | null
    leads_delta_pct: number | null
    cpl_usd: number | null
    cpl_usd_prev: number | null
    cpl_usd_delta_pct: number | null
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
  /**
   * 소재별 실측(Compass 수집분) — 리드 상위와 CPL 최악을 각각 소수만.
   * measured=false 면 브리지가 죽었거나 기간 내 소재 행이 없다는 뜻이고, 그때 배열은 비어 있다
   * ("소재 성과 없음"이 아니라 "미집계" — data_caveats 가 같은 사실을 문장으로도 말한다).
   */
  creatives: {
    measured: boolean
    top: MarketingInsightCreative[]
    worst_cpl: MarketingInsightCreative[]
  }
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

/* ─── 산술 ────────────────────────────────────────────────────── */

const round2 = (n: number) => Math.round(n * 100) / 100
const round1 = (n: number) => Math.round(n * 10) / 10

/* ─── 프롬프트 입력 위생 ──────────────────────────────────────────
 * 업데이트 로그 body 와 캠페인명(우리 것 + Meta 것)은 사람이 자유 입력한 텍스트라 그대로
 * 프롬프트에 실린다. 내부 어드민 입력이라 위험도는 낮지만 방어 비용이 싸다 — 제어문자를
 * 공백으로 접고 길이를 캡한다(캡은 digest·sanity-check 이전 단계에서 적용되므로 LLM 이 보는
 * 텍스트와 검증이 대조하는 텍스트가 어긋나지 않는다).
 */
const UPDATE_BODY_MAX = 300
const NAME_MAX = 120

/* ─── 소재 입력 규모 ──────────────────────────────────────────
 * 브리핑은 문장 몇 줄이라 전체 소재를 실을 이유가 없다. 리드 상위 소수 + CPL 최악 소수만 —
 * 다 실으면 프롬프트가 커지는 만큼 sanity-check 의 "인용 가능한 숫자" 집합도 넓어져
 * 환각을 잡아내는 힘이 떨어진다(대조 후보가 많을수록 우연히 맞을 확률이 오른다). */
const CREATIVE_TOP_N = 5
const CREATIVE_WORST_N = 3
const CREATIVE_WORST_MIN_LEADS = 3

function sanitizeFreeText(value: string, max: number): string {
  // 제어문자(개행·탭·NUL 포함)를 공백으로 — 프롬프트 구조를 흉내 내는 입력을 평탄화한다.
  // 정규식 대신 코드포인트 검사(제어문자 리터럴을 소스에 남기지 않는다).
  let cleaned = ""
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0
    cleaned += code < 0x20 || code === 0x7f ? " " : ch
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim()
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned
}

/* ─── 조립 ────────────────────────────────────────────────────── */

const ANOMALY_LABEL_FALLBACK = "이상"

/**
 * 조립 결과 봉투 — 입력(LLM 에 보낼 평탄 수치)과 감지 플래그(구조화 원본)를 함께 돌려준다.
 * 입력의 `anomalies` 는 sanity-check 대조를 위해 평탄화된 형태라 campaignId·metric 이 없다.
 * 브리핑 조회 API 는 "브리핑이 stale 이어도 배지는 최신"이어야 해서 원본 플래그가 필요하다.
 */
export interface MarketingInsightBuild {
  input: MarketingInsightInput
  flags: AnomalyFlag[]
}

/* ─── 조립 메모(45초) ─────────────────────────────────────────────
 * 브리핑 조회 API 는 "최신 브리핑"과 "현재 이상 배지"를 함께 돌려주는데, force 경로에서는
 * runner 도 같은 입력을 만든다 — 메모가 없으면 한 요청이 같은 조립(perf 집계 + Meta 스냅샷 +
 * 캠페인 목록)을 두 번 한다. perf 라우트의 perfMemo 와 같은 규약: 실패한 promise 는 즉시
 * 비운다(남기면 45초 동안 모든 소비처가 같은 에러를 재생한다).
 */
const BUILD_MEMO_TTL_MS = 45_000
let buildMemo: { at: number; promise: Promise<MarketingInsightBuild> } | null = null

export function buildMarketingInsight(): Promise<MarketingInsightBuild> {
  const hit = buildMemo
  if (hit && Date.now() - hit.at < BUILD_MEMO_TTL_MS) return hit.promise
  const promise = assembleMarketingInsightBuild()
  buildMemo = { at: Date.now(), promise }
  promise.catch(() => {
    if (buildMemo?.promise === promise) buildMemo = null
  })
  return promise
}

/** runner·sanity-check 가 쓰는 기존 진입점 — 봉투에서 입력만 꺼낸다. */
export async function buildMarketingInsightInput(): Promise<MarketingInsightInput> {
  return (await buildMarketingInsight()).input
}

async function assembleMarketingInsightBuild(): Promise<MarketingInsightBuild> {
  const today = kstToday()
  // 이상 감지 창(30일 + 직전 7일)을 모두 덮는 로드 범위 — 스코어보드 조립과 같은 상수를 쓴다.
  const loadSince = anomalyLoadSince(today)

  const [perf, dailyRows, campaigns] = await Promise.all([
    assembleMarketingPerf("30d"),
    // 소스 실패는 섹션 강등(caveat)으로 흡수 — 이상 감지 창이 통째로 사라져도 브리핑은 만든다.
    getMetaInsightsDailyRange(loadSince, today).catch((): MetaInsightsDailyRecord[] | null => null),
    listCampaigns().catch((): CampaignWithLinks[] => []),
  ])

  // ── 소재별 실측(Compass 브리지) ─────────────────────────────
  // perf 기간과 같은 창을 쓴다 — 브리핑 문장이 KPI 와 다른 기간을 근거로 들지 않게.
  // 브리지 다운은 caveat 으로 흡수한다(브리핑 자체를 막지 않는다).
  const compassAds = await getCompassAdsDaily(perf.period.since, perf.period.until)
  const creativeRows = compassAds.down
    ? []
    : aggregateCompassCreatives(compassAds.rows, {
        since: perf.period.since,
        until: perf.period.until,
      }).rows
  const toCreative = (row: (typeof creativeRows)[number]): MarketingInsightCreative => ({
    ad_name: sanitizeFreeText(row.adName ?? row.adId, NAME_MAX),
    leads: row.leads,
    spend_usd: row.spendUsd,
    cpl_usd: row.cplUsd,
  })
  // 최악 CPL 은 리드 표본이 너무 작으면 잡음이라(1건짜리 소재가 항상 1등) 최소 표본을 건다.
  const worstCpl = creativeRows
    .filter((row) => row.cplUsd != null && row.leads >= CREATIVE_WORST_MIN_LEADS)
    .sort((a, b) => (b.cplUsd ?? 0) - (a.cplUsd ?? 0))
    .slice(0, CREATIVE_WORST_N)
    .map(toCreative)

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

  // ── 이상 감지 입력: 캠페인별 7일/직전7일/30일 창(공용 순수 모듈) ──
  // 브리핑은 우리 캠페인 개체에 연결되지 않은 Meta 캠페인도 포함한다 — 실제로 돈을 쓰는 축이다.
  const flags = detectAnomalies({
    campaigns: buildAnomalyCampaignInputs({
      today,
      dailyRows,
      campaigns,
      pacingByCampaignId: new Map(perf.scoreboard.map((r) => [r.campaignId, r.pacing])),
      includeUnlinkedMeta: true,
    }),
  })

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
  if (compassAds.down)
    data_caveats.push("Compass 소재 뷰 조회 실패 — 소재별 지출·CPL 미집계(0 아님)")
  else if (creativeRows.length === 0)
    data_caveats.push("기간 내 Compass 소재 행 없음 — 소재 단위 판단 근거 없음")
  if (perf.updatesFeed.length === 0) data_caveats.push("최근 팀 업데이트 로그 없음")
  if (flags.length === 0) data_caveats.push("규칙 기반 이상 감지에서 걸린 항목 없음")

  const input: MarketingInsightInput = {
    scope: "weekly",
    generated_for: today,
    period: { key: perf.period.key, since: perf.period.since, until: perf.period.until },
    snapshot_at: perf.snapshotAt,
    currency_note:
      "Meta 광고비·CPL 은 USD 네이티브다. 원화로 환산하지 말 것. KRW 예산 집행률은 별개 축이며 USD 와 합산 불가. " +
      "creatives 의 leads 는 Meta 리포트 축(Compass 수집분)이고 kpis.leads 는 우리 리드 DB 축이라 모집단이 다르다 — 두 숫자를 같은 것으로 말하지 말 것.",
    kpis: {
      spend_usd: perf.kpis.spendUsd.value,
      spend_usd_prev: perf.kpis.spendUsd.previous,
      spend_usd_delta_pct: perf.kpis.spendUsd.deltaPct,
      leads: perf.kpis.leads.value,
      leads_prev: perf.kpis.leads.previous,
      leads_delta_pct: perf.kpis.leads.deltaPct,
      cpl_usd: perf.kpis.cplUsd.value,
      cpl_usd_prev: perf.kpis.cplUsd.previous,
      cpl_usd_delta_pct: perf.kpis.cplUsd.deltaPct,
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
      name: sanitizeFreeText(row.name, NAME_MAX),
      status: row.status,
      elapsed_pct: row.pacing.elapsedPct,
      execution_pct: row.pacing.executionPct,
      pacing_currency: row.pacingCurrency,
      leads: row.leads,
      cpl_usd: row.cpl,
    })),
    creatives: {
      measured: !compassAds.down && creativeRows.length > 0,
      // creativeRows 는 이미 리드 내림차순(aggregateCompassCreatives 정렬 계약).
      top: creativeRows.slice(0, CREATIVE_TOP_N).map(toCreative),
      worst_cpl: worstCpl,
    },
    anomalies: flags.map(toInputAnomaly),
    updates: perf.updatesFeed.slice(0, 10).map((u) => ({
      kind: u.kind,
      body: sanitizeFreeText(u.body, UPDATE_BODY_MAX),
      created_at: u.createdAt,
      created_by: u.createdBy == null ? null : sanitizeFreeText(u.createdBy, NAME_MAX),
    })),
    data_caveats,
  }
  return { input, flags }
}

function toInputAnomaly(flag: AnomalyFlag): MarketingInsightAnomaly {
  return {
    kind: flag.kind,
    label: ANOMALY_KIND_LABEL[flag.kind] ?? ANOMALY_LABEL_FALLBACK,
    // detail 은 코드가 만든 문장이라 그대로 두고, 캠페인명(자유 텍스트)만 위생 처리한다.
    campaign_name: flag.campaignName == null ? null : sanitizeFreeText(flag.campaignName, NAME_MAX),
    severity: flag.severity,
    detail: flag.detail,
    current: flag.metric.current,
    baseline: flag.metric.baseline,
  }
}
