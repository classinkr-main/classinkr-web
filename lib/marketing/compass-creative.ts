// lib/marketing/compass-creative.ts
// Compass 소재(광고) 단위 성과 집계 — 순수 모듈(서버 의존 없음). 조회는 lib/compass/bridge.ts.
//
// ── 전제 정정(2026-08-28) ─────────────────────────────────────
// 이 저장소의 Meta 수집(lib/meta/marketing · meta_insights_daily)은 캠페인 레벨 insights 만
// 가져오고, 그래서 "소재별 spend·CPL 은 저장소 어디에도 없다"가 오랫동안 참이었다.
// 마케팅팀 앱 Compass 가 같은 광고 계정에서 ad 레벨 insights 를 수집하고 있고, 그 결과가
// 읽기 전용 뷰(compass_ads_v)로 연결되면서 이 전제는 깨졌다 — 소재별 spend/leads/clicks/
// impressions 와 크리에이티브 텍스트·썸네일이 실측으로 존재한다.
//
// ── 여전히 없는 것(지어내지 말 것) ────────────────────────────
//  - 소재별 매출·ROAS: 매출을 소재 단위로 귀속할 경로가 없다. 계산도 표기도 금지.
//  - 원화 환산: spend 는 USD 네이티브다(perf 대시보드 통화 분리 규칙과 동일).
//  - 두 리드 축의 혼용: 여기의 leads 는 Compass 가 받은 Meta 리포트 리드다.
//    우리 leads 테이블의 광고 리드(source=meta_lead_ads)와 모집단이 달라, 한쪽의 spend 를
//    다른 쪽의 건수로 나눈 CPL 은 만들지 않는다. CPL 은 항상 같은 축끼리만 나눈다.

import type { AdCreativePerf } from "@/lib/marketing/creative-input"

/**
 * 집계 입력 — compass_ads_v 한 행(CompassAdDailyRow)의 구조적 최소 형태.
 * 브리지 모듈은 server-only 라 값 import 를 하지 않는다(이 모듈은 클라이언트에서도 안전).
 */
export interface CompassAdDailyInput {
  day: string
  ad_id: string
  ad_name: string | null
  adset_name?: string | null
  campaign_name?: string | null
  category?: string | null
  creative_thumb?: string | null
  creative_title?: string | null
  creative_body?: string | null
  spend_usd: number | null
  leads: number | null
  clicks?: number | null
  impressions?: number | null
}

export interface CompassCreativeRow {
  adId: string
  adName: string | null
  adsetName: string | null
  campaignName: string | null
  category: string | null
  thumbUrl: string | null
  title: string | null
  body: string | null
  /** Meta 리포트 리드(Compass 수집분) — 우리 leads 테이블 건수와 정의가 다르다. */
  leads: number
  spendUsd: number
  /** spendUsd ÷ leads. 분모 0 이면 null(0 으로 포장 금지). */
  cplUsd: number | null
  clicks: number
  impressions: number
  /** 최근 sparklineDays 일 리드(0 채움, 과거→현재 순). 창을 덮는 행을 못 받았으면 빈 배열. */
  sparkline: number[]
}

export interface CompassCreativeTotals {
  adCount: number
  leads: number
  spendUsd: number
  cplUsd: number | null
}

export interface CompassCreativeAggregate {
  rows: CompassCreativeRow[]
  totals: CompassCreativeTotals
  /** 스파크라인 창 — 화면 캡션이 "최근 N일"을 지어내지 않도록 그대로 돌려준다. */
  sparkline: { days: number; since: string; until: string }
}

const DAY_MS = 86_400_000
const round2 = (n: number) => Math.round(n * 100) / 100

function toDay(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}
function shift(iso: string, days: number): string {
  return new Date(toDay(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10)
}

/** 수치 위생 — 뷰가 null/NaN 을 줄 수 있다. 측정 안 된 값은 합산에서 0 으로만 흡수한다. */
function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

interface Accumulator extends CompassCreativeRow {
  /** 크리에이티브 메타를 어느 날짜에서 가져왔는지 — 가장 최근 비어 있지 않은 값이 이긴다. */
  metaDay: string
  leadsByDay: Map<string, number>
}

export interface AggregateCompassCreativesOptions {
  /** 집계 구간(양끝 포함). 이 밖의 행은 스파크라인에만 쓰인다. */
  since: string
  until: string
  /** 스파크라인 창 길이(일). 기본 14 — 캠페인 스코어보드와 같은 창. */
  sparklineDays?: number
  /**
   * 호출부가 실제로 조회한 시작일. 기본은 since.
   * 이 값이 스파크라인 창 시작보다 늦으면 창 앞부분을 읽지 않았다는 뜻이라 스파크라인을
   * 통째로 강등한다 — 안 읽은 날을 0 으로 채우면 "무집행"을 지어내게 된다.
   */
  loadedSince?: string
}

/**
 * 일별 소재 행을 광고(ad_id) 단위로 접는다.
 *
 * 집계 축은 [since, until] 안의 행만이다. 스파크라인은 until 로 끝나는 sparklineDays 창이라
 * since 보다 앞을 볼 수 있으므로, 호출부는 두 범위의 합집합을 실제로 조회해야 한다
 * (perf-assemble 의 sparklineSince 와 같은 규약 — 안 읽은 날을 0 으로 채우는 것은 조작이다).
 * 창 전체를 덮는 행이 하나도 없으면 스파크라인은 빈 배열로 강등한다.
 *
 * 정렬: 리드 내림차순 → 지출 내림차순 → 광고명 → ad_id(전순서 고정).
 */
export function aggregateCompassCreatives(
  daily: readonly CompassAdDailyInput[],
  { since, until, sparklineDays = 14, loadedSince }: AggregateCompassCreativesOptions
): CompassCreativeAggregate {
  const sparklineSince = shift(until, -(sparklineDays - 1))
  const sparklineDates: string[] = []
  for (let i = sparklineDays - 1; i >= 0; i -= 1) sparklineDates.push(shift(until, -i))
  // 조회 범위가 창을 덮을 때만 0 채움을 허용한다(옵션 주석 참조).
  const sparklineCovered = (loadedSince ?? since) <= sparklineSince

  const byAd = new Map<string, Accumulator>()

  for (const row of daily) {
    if (!row?.ad_id || typeof row.day !== "string") continue
    const inPeriod = row.day >= since && row.day <= until
    const inSparkline = row.day >= sparklineSince && row.day <= until
    if (!inPeriod && !inSparkline) continue

    let acc = byAd.get(row.ad_id)
    if (!acc) {
      acc = {
        adId: row.ad_id,
        adName: null,
        adsetName: null,
        campaignName: null,
        category: null,
        thumbUrl: null,
        title: null,
        body: null,
        leads: 0,
        spendUsd: 0,
        cplUsd: null,
        clicks: 0,
        impressions: 0,
        sparkline: [],
        metaDay: "",
        leadsByDay: new Map(),
      }
      byAd.set(row.ad_id, acc)
    }

    if (inPeriod) {
      acc.leads += num(row.leads)
      acc.spendUsd += num(row.spend_usd)
      acc.clicks += num(row.clicks)
      acc.impressions += num(row.impressions)
    }
    if (inSparkline) {
      acc.leadsByDay.set(row.day, (acc.leadsByDay.get(row.day) ?? 0) + num(row.leads))
    }

    // 크리에이티브 메타는 가장 최근 날짜의 값이 이긴다 — 소재 교체 후 옛 문구가 남지 않게.
    if (row.day >= acc.metaDay) {
      acc.metaDay = row.day
      acc.adName = text(row.ad_name) ?? acc.adName
      acc.adsetName = text(row.adset_name) ?? acc.adsetName
      acc.campaignName = text(row.campaign_name) ?? acc.campaignName
      acc.category = text(row.category) ?? acc.category
      acc.thumbUrl = text(row.creative_thumb) ?? acc.thumbUrl
      acc.title = text(row.creative_title) ?? acc.title
      acc.body = text(row.creative_body) ?? acc.body
    }
  }

  const rows: CompassCreativeRow[] = []
  for (const acc of byAd.values()) {
    // 기간 안에 측정된 게 하나도 없는 광고는 목록에서 뺀다 — 스파크라인 창에서만 잡힌 과거
    // 소재(기간 밖 집행)와, 기간 안에 행은 있으나 노출·클릭·리드·지출이 전부 0 인 껍데기 행이
    // 여기 해당한다. 둘 다 표에 올려 봐야 "0 0 0 —" 줄만 늘려 실제 소재를 파묻는다.
    if (acc.leads === 0 && acc.spendUsd === 0 && acc.clicks === 0 && acc.impressions === 0) continue
    const spendUsd = round2(acc.spendUsd)
    rows.push({
      adId: acc.adId,
      adName: acc.adName,
      adsetName: acc.adsetName,
      campaignName: acc.campaignName,
      category: acc.category,
      thumbUrl: acc.thumbUrl,
      title: acc.title,
      body: acc.body,
      leads: acc.leads,
      spendUsd,
      cplUsd: acc.leads > 0 ? round2(spendUsd / acc.leads) : null,
      clicks: acc.clicks,
      impressions: acc.impressions,
      sparkline: sparklineCovered
        ? sparklineDates.map((date) => acc.leadsByDay.get(date) ?? 0)
        : [],
    })
  }

  rows.sort(
    (a, b) =>
      b.leads - a.leads ||
      b.spendUsd - a.spendUsd ||
      (a.adName ?? "").localeCompare(b.adName ?? "", "ko") ||
      a.adId.localeCompare(b.adId)
  )

  const leads = rows.reduce((sum, row) => sum + row.leads, 0)
  const spendUsd = round2(rows.reduce((sum, row) => sum + row.spendUsd, 0))
  return {
    rows,
    totals: {
      adCount: rows.length,
      leads,
      spendUsd,
      cplUsd: leads > 0 ? round2(spendUsd / leads) : null,
    },
    sparkline: { days: sparklineDays, since: sparklineSince, until },
  }
}

/* ─── 소재명 조인(AI 소재 제안 입력용) ───────────────────────── */

/** 조인 키 정규화 — 공백 접기 + 소문자. 양쪽 원천의 표기 흔들림만 흡수하고 의미는 안 바꾼다. */
export function normalizeCreativeName(raw: string | null | undefined): string | null {
  const cleaned = raw?.replace(/\s+/g, " ").trim().toLowerCase()
  return cleaned ? cleaned : null
}

export interface CompassCreativeNameStat {
  name: string
  /** 같은 광고명을 쓰는 ad_id 들 — 2개 이상이면 합산된 값이라는 뜻. */
  adIds: string[]
  leads: number
  spendUsd: number
  cplUsd: number | null
}

/**
 * 광고명 기준 인덱스. 같은 이름의 ad_id 가 여럿이면 합산한다 — 이름으로만 join 하는 이상
 * 하나를 골라 쓰면 나머지 지출이 사라지므로, 합치는 쪽이 덜 틀린다.
 */
export function indexCompassCreativesByAdName(
  rows: readonly CompassCreativeRow[]
): Map<string, CompassCreativeNameStat> {
  const index = new Map<string, CompassCreativeNameStat>()
  for (const row of rows) {
    const key = normalizeCreativeName(row.adName)
    if (!key) continue
    const stat = index.get(key)
    if (stat) {
      stat.adIds.push(row.adId)
      stat.leads += row.leads
      stat.spendUsd = round2(stat.spendUsd + row.spendUsd)
    } else {
      index.set(key, {
        name: row.adName ?? key,
        adIds: [row.adId],
        leads: row.leads,
        spendUsd: row.spendUsd,
        cplUsd: null,
      })
    }
  }
  for (const stat of index.values()) {
    stat.cplUsd = stat.leads > 0 ? round2(stat.spendUsd / stat.leads) : null
  }
  return index
}

/**
 * UTM 기준 소재 랭킹(AdCreativePerf)에 Compass 실측 지출을 붙인 형태.
 *
 * `leads`(우리 leads 테이블)와 `compass_leads`(Meta 리포트)는 모집단이 다른 별개 축이라
 * 둘 다 남긴다. `cpl_usd` 는 **Compass 축끼리** 나눈 값이다 — spend ÷ 우리 리드 수 같은
 * 축 혼합 CPL 은 만들지 않는다(모듈 헤더 정직 규칙).
 */
export interface RankedCreativeWithSpend extends AdCreativePerf {
  spend_usd: number | null
  compass_leads: number | null
  cpl_usd: number | null
  /** Compass 소재 행과 광고명이 매칭됐는지 — false 면 지출은 "미집계"이지 0 이 아니다. */
  spend_matched: boolean
}

/** 랭킹 행에 Compass 지출·CPL 을 붙인다. 매칭 실패는 null(0 으로 포장 금지). */
export function attachCompassSpend(
  ranked: readonly AdCreativePerf[],
  index: ReadonlyMap<string, CompassCreativeNameStat>
): RankedCreativeWithSpend[] {
  return ranked.map((row) => {
    const stat = index.get(normalizeCreativeName(row.ad) ?? "")
    return {
      ...row,
      spend_usd: stat ? stat.spendUsd : null,
      compass_leads: stat ? stat.leads : null,
      cpl_usd: stat ? stat.cplUsd : null,
      spend_matched: Boolean(stat),
    }
  })
}
