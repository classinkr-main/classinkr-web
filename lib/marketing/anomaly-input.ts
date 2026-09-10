// lib/marketing/anomaly-input.ts
// 이상 감지 "입력"의 순수 계산 — Meta 일자 스냅샷에서 캠페인별 7일/직전7일/30일 창을 파생한다.
// 판정(임계·발화 규칙)은 lib/marketing/anomaly.ts, 이 모듈은 판정에 먹일 창 산술만 담당한다.
//
// 이 모듈이 따로 있는 이유: 같은 창 산술을 주간 브리핑 입력(insights/input-builder)과
// 스코어보드 조립(perf-assemble)이 각각 구현하면, 카드의 "이상"과 행의 "이상 배지"가 서로
// 다른 수치를 근거로 갈라진다. 감지 입력은 한 곳에서만 만든다.
//
// 순수 모듈 — 서버 전용 import 금지. DB 조회는 호출부가 끝내고 행만 넘긴다(테스트 가능).
//
// ── 정직 규칙 ─────────────────────────────────────────────────
// 분모 0/미측정은 0 이 아니라 null. 소스 실패(dailyRows === null)·Meta 링크 없음은 "이상 없음"이
// 아니라 "판단 불가"이므로 빈 창을 넘겨 규칙이 침묵하게 한다(없는 신호를 지어내지 않는다).

import type { AnomalyCampaignInput } from "@/lib/marketing/anomaly"
import { shiftDays } from "@/lib/marketing/perf"

/**
 * 감지 창을 모두 덮는 로드 일수 — today-36 ~ today.
 * 30일 창(today-29~today)과 직전 7일 창(today-13~today-7)을 함께 덮고, 스냅샷이 하루 늦게
 * 적재되는 경우까지 여유를 둔 값이다. 조회 범위를 지어내지 않기 위해 이 상수를 두 조립부가
 * 공유한다 — 로드하지 않은 날짜를 0 으로 채우는 것은 조작이다.
 */
export const ANOMALY_LOAD_DAYS = 36

/** 이상 감지에 필요한 Meta 일자 행 로드 시작일(KST 일자 문자열). */
export function anomalyLoadSince(today: string): string {
  return shiftDays(today, -ANOMALY_LOAD_DAYS)
}

/** 창 하나의 경계(양끝 포함, KST 일자 문자열 비교 — off-by-one 없음). */
export interface AnomalyWindowRange {
  since: string
  until: string
}

export interface AnomalyWindows {
  /** 최근 7일(오늘 포함). */
  cur7: AnomalyWindowRange
  /** 직전 7일(최근 7일 바로 앞). */
  prev7: AnomalyWindowRange
  /** 최근 30일(오늘 포함) — CPL·CTR 의 자기 비교 기준선. */
  cur30: AnomalyWindowRange
}

export function resolveAnomalyWindows(today: string): AnomalyWindows {
  return {
    cur7: { since: shiftDays(today, -6), until: today },
    prev7: { since: shiftDays(today, -13), until: shiftDays(today, -7) },
    cur30: { since: shiftDays(today, -29), until: today },
  }
}

/** 창 산술에 필요한 필드만 — MetaInsightsDailyRecord 가 구조적으로 만족한다. */
export interface AnomalyDailyRow {
  date: string
  campaignId: string
  campaignName?: string | null
  spend: number
  leads: number
  impressions: number
  clicks: number
}

export interface MetricWindow {
  spend: number
  leads: number
  impressions: number
  clicks: number
}

const EMPTY_WINDOW: MetricWindow = { spend: 0, leads: 0, impressions: 0, clicks: 0 }

const round2 = (n: number) => Math.round(n * 100) / 100
const round1 = (n: number) => Math.round(n * 10) / 10

/** 경계 양끝 포함으로 합산. 범위 밖 행은 무시한다(호출부가 넓게 로드해도 창은 정확하다). */
export function sumWindow(
  rows: readonly AnomalyDailyRow[],
  since: string,
  until: string
): MetricWindow {
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
export const cplOf = (w: MetricWindow): number | null =>
  w.leads > 0 ? round2(w.spend / w.leads) : null

/** CTR(%) = clicks ÷ impressions × 100. 노출 0 이면 미산정(null) — 0% 는 거짓이다. */
export const ctrOf = (w: MetricWindow): number | null =>
  w.impressions > 0 ? round1((w.clicks / w.impressions) * 100) : null

/** 페이싱 축 — perf.ts 의 Pacing 과 같은 형태(순환 import 를 피해 구조로만 받는다). */
export interface AnomalyPacing {
  elapsedPct: number | null
  executionPct: number | null
}

/** 우산 캠페인 — 감지에 필요한 건 id·이름·채널 링크뿐이다. */
export interface AnomalyCampaignSource {
  id: string
  name: string
  links: ReadonlyArray<{ refType: string; refId: string }>
}

export interface BuildAnomalyInputsOptions {
  /** KST 오늘 — 모든 창의 끝점. */
  today: string
  /** Meta 일자 스냅샷. null = 소스 실패(창을 지어내지 않는다). */
  dailyRows: readonly AnomalyDailyRow[] | null
  campaigns: readonly AnomalyCampaignSource[]
  /** 캠페인 id → 페이싱(집행률·경과율). 없으면 페이싱 규칙이 침묵한다. */
  pacingByCampaignId: ReadonlyMap<string, AnomalyPacing>
  /**
   * 우리 캠페인 개체에 연결되지 않은 Meta 캠페인도 감지 축에 넣을지.
   * 브리핑(true): 실제로 돈을 쓰는 축이라 빼지 않는다. 스코어보드(false): 표시할 행이 없다.
   */
  includeUnlinkedMeta: boolean
  /** 연결되지 않은 Meta 캠페인의 표시 이름 폴백(id 를 받아 라벨을 만든다). */
  unlinkedNameFallback?: (metaCampaignId: string) => string
}

/** campaignId → 그 캠페인의 일자 행 목록. */
function groupByMetaCampaign(
  rows: readonly AnomalyDailyRow[]
): Map<string, AnomalyDailyRow[]> {
  const out = new Map<string, AnomalyDailyRow[]>()
  for (const row of rows) {
    const list = out.get(row.campaignId)
    if (list) list.push(row)
    else out.set(row.campaignId, [row])
  }
  return out
}

function toInput(
  id: string,
  name: string,
  rows: readonly AnomalyDailyRow[],
  windows: AnomalyWindows,
  pacing: AnomalyPacing | null
): AnomalyCampaignInput {
  // 빈 창(소스 실패·링크 없음)은 자연히 cpl/ctr null + leads 0 이 된다 — 별도 분기가 필요 없다.
  const cur7 = sumWindow(rows, windows.cur7.since, windows.cur7.until)
  const prev7 = sumWindow(rows, windows.prev7.since, windows.prev7.until)
  const cur30 = sumWindow(rows, windows.cur30.since, windows.cur30.until)
  return {
    id,
    name,
    cpl7d: cplOf(cur7),
    cpl30d: cplOf(cur30),
    leads7d: cur7.leads,
    leadsPrev7d: prev7.leads,
    ctr7d: ctrOf(cur7),
    ctr30d: ctrOf(cur30),
    executionPct: pacing?.executionPct ?? null,
    elapsedPct: pacing?.elapsedPct ?? null,
  }
}

/**
 * 캠페인별 감지 입력을 만든다 — 우리 캠페인 개체 전부 + (옵션) 미연결 Meta 캠페인.
 * 반환 순서는 campaigns 입력 순서 → 미연결 Meta(스냅샷 등장 순서)다.
 */
export function buildAnomalyCampaignInputs(
  options: BuildAnomalyInputsOptions
): AnomalyCampaignInput[] {
  const windows = resolveAnomalyWindows(options.today)
  const rowsByMetaCampaign = groupByMetaCampaign(options.dailyRows ?? [])
  const metaNameById = new Map<string, string | null>()
  for (const row of options.dailyRows ?? []) {
    if (row.campaignName) metaNameById.set(row.campaignId, row.campaignName)
  }

  const inputs: AnomalyCampaignInput[] = []
  const linkedMetaIds = new Set<string>()

  for (const campaign of options.campaigns) {
    const metaRefIds = campaign.links
      .filter((l) => l.refType === "meta_campaign")
      .map((l) => l.refId)
    for (const id of metaRefIds) linkedMetaIds.add(id)
    const rows = metaRefIds.flatMap((id) => rowsByMetaCampaign.get(id) ?? [])
    inputs.push(
      toInput(
        campaign.id,
        campaign.name,
        rows,
        windows,
        options.pacingByCampaignId.get(campaign.id) ?? null
      )
    )
  }

  if (options.includeUnlinkedMeta) {
    // 캠페인 개체에 연결되지 않은 Meta 캠페인 — 실제로 돈을 쓰는 축이므로 감지에서 빼지 않는다.
    // (페이싱은 우리 예산 개체가 없어 미산정 null — 없는 예산을 지어내지 않는다.)
    const fallback = options.unlinkedNameFallback ?? ((id: string) => `Meta 캠페인 ${id}`)
    for (const [metaId, rows] of rowsByMetaCampaign) {
      if (linkedMetaIds.has(metaId)) continue
      inputs.push(toInput(metaId, metaNameById.get(metaId) ?? fallback(metaId), rows, windows, null))
    }
  }

  return inputs
}
