// lib/marketing/ad-insights.ts
// 채널 중립 광고 집행 집계 — Meta·Google·네이버의 서로 다른 일자 스냅샷을 한 형태로 접는다.
// 순수 모듈(서버 의존 없음) — 조회는 perf-assemble 이 하고, 여기서는 접기·합치기만 한다.
//
// ── 왜 채널별 테이블 + 여기서 접기인가 ────────────────────────
// 채널마다 고유 지표가 다르다(Meta reach·actions[], Google 클릭귀속 conversions,
// 네이버 전환수). 한 테이블에 몰면 NULL 밭이 되고 CHECK 도 못 건다. 대신 화면이 보는
// 공통 축만 여기서 뽑아 쓴다 — 화면은 채널을 세 번 알 필요가 없다.
//
// ── 정직 규칙(위반 금지) ──────────────────────────────────────
//  - 통화가 다른 집행을 **절대 합산하지 않는다**. 채널마다 currency 를 들고 다니고,
//    합계는 통화가 같은 채널끼리만 낸다(mergeSameCurrency).
//  - 스냅샷 조회가 실패한 채널은 0 이 아니라 null(미측정). "집행 안 함"과 구분한다.
//  - leads 는 채널이 **자기 플랫폼 기준으로 센 수**다. 우리 leads 테이블의 리드 수와
//    정의가 다르므로 두 값을 한 칸에 섞지 않는다.

import type { AdChannel } from "@/lib/types/event-metrics"

/** 라이브 연동이 있는 채널 — 나머지 4종은 수기 입력만 있다. */
export type LiveAdChannel = Extract<AdChannel, "meta" | "google" | "naver">
export const LIVE_AD_CHANNELS: LiveAdChannel[] = ["meta", "google", "naver"]

const LIVE_CHANNEL_SET = new Set<string>(LIVE_AD_CHANNELS)
export const isLiveAdChannel = (channel: string): channel is LiveAdChannel =>
  LIVE_CHANNEL_SET.has(channel)

/**
 * 채널 중립 일자 행. 각 채널 스냅샷이 이 형태로 접힌다.
 * conversions 를 null 로 둘 수 있는 이유: 네이버는 전환추적 미연동 계정에서 0 이 오는데
 * 그건 "전환 0"이 아니라 "측정 없음"이다 — 접는 쪽에서 구분해 넘긴다.
 */
export interface AdInsightRow {
  channel: LiveAdChannel
  date: string
  campaignId: string
  campaignName: string | null
  /** 계정 통화 네이티브 — 환산 금지 */
  spend: number
  currency: string | null
  impressions: number
  clicks: number
  /** 플랫폼이 센 리드/전환 수. 채널마다 정의가 다르다. */
  leads: number
  conversions: number | null
}

/* ─── 채널별 원본 → 중립 행 ──────────────────────────────────── */

export interface MetaSnapshotRow {
  date: string
  campaignId: string
  campaignName: string | null
  spend: number
  impressions: number
  clicks: number
  leads: number
  currency: string | null
}

export interface GoogleSnapshotRow {
  date: string
  campaignId: string
  campaignName: string | null
  spend: number
  impressions: number
  clicks: number
  conversions: number
  currency: string | null
}

export interface NaverSnapshotRow {
  date: string
  campaignId: string
  campaignName: string | null
  spend: number
  impressions: number
  clicks: number
  conversions: number
  currency: string
}

export function fromMeta(rows: readonly MetaSnapshotRow[]): AdInsightRow[] {
  return rows.map((r) => ({
    channel: "meta",
    date: r.date,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    spend: r.spend,
    currency: r.currency,
    impressions: r.impressions,
    clicks: r.clicks,
    leads: r.leads,
    // Meta 의 actions[] 에서 뽑은 값은 leads 축으로 이미 들어왔다 — 전환을 따로 세지 않는다.
    conversions: null,
  }))
}

export function fromGoogle(rows: readonly GoogleSnapshotRow[]): AdInsightRow[] {
  return rows.map((r) => ({
    channel: "google",
    date: r.date,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    spend: r.spend,
    currency: r.currency,
    impressions: r.impressions,
    clicks: r.clicks,
    // Google 의 conversions 는 전환 액션 설정에 따라 리드가 아닐 수 있다(통화·구매 등).
    // leads 축으로 올리면 Meta 리드와 같은 것처럼 보이므로 conversions 로만 둔다.
    leads: 0,
    conversions: r.conversions,
  }))
}

export function fromNaver(rows: readonly NaverSnapshotRow[]): AdInsightRow[] {
  return rows.map((r) => ({
    channel: "naver",
    date: r.date,
    campaignId: r.campaignId,
    campaignName: r.campaignName,
    spend: r.spend,
    currency: r.currency,
    impressions: r.impressions,
    clicks: r.clicks,
    leads: 0,
    // 전환추적 미연동이면 API 가 0 을 준다 — 그건 측정 없음이므로 null 로 올린다.
    // (전 캠페인 합이 0 인지로 판정하는 것은 호출부 몫이라 여기서는 행 단위로만 본다.)
    conversions: r.conversions > 0 ? r.conversions : null,
  }))
}

/* ─── 채널 요약 ──────────────────────────────────────────────── */

export interface ChannelSpendSummary {
  channel: LiveAdChannel
  /** 스냅샷 조회 실패 = null(미측정). 조회 성공인데 행이 없으면 0(집행 없음). */
  spend: number | null
  currency: string | null
  impressions: number | null
  clicks: number | null
  /** 플랫폼 기준 리드/전환. 어느 축도 측정되지 않았으면 null. */
  conversions: number | null
  /** 집행 ÷ 전환 — 분모 0/미측정이면 null. 통화는 currency 를 따른다. */
  costPerConversion: number | null
  campaignCount: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * 한 채널의 기간 합계. rows 가 null 이면 **소스 실패**로 보고 전 필드를 미측정(null)으로 둔다 —
 * 빈 배열(조회는 됐는데 집행이 없음)과 구분하는 것이 이 함수의 핵심이다.
 *
 * 통화가 행마다 섞여 있으면(계정 통화가 기간 중 바뀐 극단) currency 를 null 로 두고 합계도
 * 내지 않는다 — 어떤 통화인지 말할 수 없는 숫자를 내놓지 않는다.
 */
export function summarizeChannel(
  channel: LiveAdChannel,
  rows: readonly AdInsightRow[] | null
): ChannelSpendSummary {
  const empty: ChannelSpendSummary = {
    channel,
    spend: null,
    currency: null,
    impressions: null,
    clicks: null,
    conversions: null,
    costPerConversion: null,
    campaignCount: 0,
  }
  if (rows == null) return empty

  const mine = rows.filter((r) => r.channel === channel)
  const currencies = new Set(mine.map((r) => r.currency).filter((c): c is string => Boolean(c)))
  if (currencies.size > 1) {
    // 통화 혼재 — 합계를 지어내지 않는다. 캠페인 수만 사실대로 보고한다.
    return { ...empty, campaignCount: new Set(mine.map((r) => r.campaignId)).size }
  }

  const spend = mine.reduce((total, r) => total + r.spend, 0)
  const impressions = mine.reduce((total, r) => total + r.impressions, 0)
  const clicks = mine.reduce((total, r) => total + r.clicks, 0)

  // 전환 축: leads(Meta)와 conversions(Google·네이버) 중 실제 측정된 것만 더한다.
  // 한 행도 측정되지 않았으면 null — 0 으로 떨어뜨리면 "전환 0건"으로 읽힌다.
  const measured = mine.filter((r) => r.leads > 0 || r.conversions != null)
  const conversions =
    measured.length > 0
      ? round2(measured.reduce((total, r) => total + r.leads + (r.conversions ?? 0), 0))
      : null

  return {
    channel,
    spend: round2(spend),
    currency: currencies.size === 1 ? [...currencies][0] : null,
    impressions,
    clicks,
    conversions,
    costPerConversion: conversions != null && conversions > 0 ? round2(spend / conversions) : null,
    campaignCount: new Set(mine.map((r) => r.campaignId)).size,
  }
}

/**
 * 같은 통화끼리만 합친다 — 화면이 "합계"를 낼 수 있는 유일한 축.
 * 통화가 하나도 없거나(전 채널 미측정) 둘 이상이면 null 을 돌려주고, 화면은 합계 칸을 비운다.
 */
export function mergeSameCurrency(
  summaries: readonly ChannelSpendSummary[]
): { currency: string; spend: number; channels: LiveAdChannel[] } | null {
  const measured = summaries.filter(
    (s): s is ChannelSpendSummary & { spend: number; currency: string } =>
      s.spend != null && s.currency != null
  )
  if (measured.length === 0) return null
  const currencies = new Set(measured.map((s) => s.currency))
  if (currencies.size !== 1) return null
  return {
    currency: [...currencies][0],
    spend: round2(measured.reduce((total, s) => total + s.spend, 0)),
    channels: measured.map((s) => s.channel),
  }
}

/**
 * 캠페인 ID → 채널 요약. 스코어보드가 링크된 채널 캠페인의 집행을 찾을 때 쓴다.
 * 같은 ID 가 채널을 가로질러 겹칠 일은 없다(Meta 는 숫자, 네이버는 cmp- 접두).
 */
export function indexByCampaign(rows: readonly AdInsightRow[]): Map<string, AdInsightRow[]> {
  const out = new Map<string, AdInsightRow[]>()
  for (const row of rows) {
    const list = out.get(row.campaignId)
    if (list) list.push(row)
    else out.set(row.campaignId, [row])
  }
  return out
}
