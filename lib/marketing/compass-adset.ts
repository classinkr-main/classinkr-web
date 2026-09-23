// lib/marketing/compass-adset.ts
// Compass 광고세트(adset) 단위 성과 집계 — 순수 모듈(서버 의존 없음). 조회는 lib/compass/bridge.ts.
// 소재(ad) 축 집계(lib/marketing/compass-creative.ts)와 같은 패턴 — 한 단 위 해상도(세트)라
// 스파크라인·크리에이티브 메타(썸네일·문구)는 없다.
//
// ── 정직 규칙(compass-creative.ts 와 동일, 그대로 적용) ─────────
//  - 광고세트별 매출·ROAS: 매출을 광고세트 단위로 귀속할 경로가 없다. 계산도 표기도 금지.
//  - 원화 환산 없음: spend 는 USD 네이티브다(perf 대시보드 통화 분리 규칙과 동일).
//  - 두 리드 축의 혼용 금지: 여기의 leads 는 Compass 가 받은 Meta 리포트 리드다.
//    우리 leads 테이블의 광고 리드(source=meta_lead_ads)와 모집단이 달라, 한쪽의 spend 를
//    다른 쪽의 건수로 나눈 CPL 은 만들지 않는다. CPL 은 항상 같은 축끼리만 나눈다.
//  - 0 대신 null: 분모가 0 이면(leads=0 → cpl, impressions=0 → ctr, 총 spend=0 → spendShare)
//    0 으로 포장하지 않고 null 로 밝힌다.

/**
 * 집계 입력 — compass_adsets_v 한 행(CompassAdsetDailyRow)의 구조적 최소 형태.
 * 브리지 모듈은 server-only 라 값 import 를 하지 않는다(compass-creative.ts 와 같은 방식).
 */
export interface CompassAdsetDailyInput {
  day: string
  adset_id: string
  adset_name: string | null
  campaign_name?: string | null
  spend_usd: number | null
  leads: number | null
  clicks?: number | null
  impressions?: number | null
}

export interface CompassAdsetRow {
  adsetId: string
  adsetName: string | null
  campaignName: string | null
  spendUsd: number
  /** Meta 리포트 리드(Compass 수집분) — 우리 leads 테이블 건수와 정의가 다르다. */
  leads: number
  clicks: number
  impressions: number
  /** spendUsd ÷ leads. 분모 0 이면 null(0 으로 포장 금지). */
  cplUsd: number | null
  /** clicks ÷ impressions — 0~1 비율(표시 쪽에서 ×100 후 % 포맷). 분모 0 이면 null. */
  ctr: number | null
  /** 이 세트의 spendUsd ÷ 전체 세트 spendUsd 합 — 0~1 비율. 총 spend 가 0 이면 null. */
  spendShare: number | null
}

export interface CompassAdsetTotals {
  adsetCount: number
  leads: number
  spendUsd: number
  cplUsd: number | null
}

export interface CompassAdsetAggregate {
  rows: CompassAdsetRow[]
  totals: CompassAdsetTotals
}

export interface AggregateCompassAdsetsOptions {
  /** 집계 구간(양끝 포함). 이 밖의 일자는 제외한다. */
  since: string
  until: string
}

const round2 = (n: number) => Math.round(n * 100) / 100
// ctr·spendShare 는 0~1 비율로 반환한다 — 소수 4자리(=% 기준 0.01%)면 표시 반올림에 충분하다.
const round4 = (n: number) => Math.round(n * 10000) / 10000

/** 수치 위생 — 뷰가 null/NaN 을 줄 수 있다. 측정 안 된 값은 합산에서 0 으로만 흡수한다. */
function num(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function text(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

interface Accumulator {
  adsetId: string
  adsetName: string | null
  campaignName: string | null
  spendUsd: number
  leads: number
  clicks: number
  impressions: number
  /** 이름·캠페인명을 어느 날짜에서 가져왔는지 — 가장 최근 비어 있지 않은 값이 이긴다. */
  metaDay: string
}

/**
 * 일별 광고세트 행을 adset_id 단위로 접는다.
 *
 * 집계 축은 [since, until] 안의 행만이다(스파크라인 창 개념이 없어 compass-creative 보다
 * 단순하다). 기간 안에 측정된 게 하나도 없는(spend·leads·clicks·impressions 전부 0) 세트는
 * "0 0 0 —" 잡음 행이 되므로 목록에서 뺀다 — compass-creative 의 같은 규칙과 동일.
 *
 * 정렬: 지출 내림차순 → 세트명 → adset_id(전순서 고정).
 */
export function aggregateCompassAdsets(
  daily: readonly CompassAdsetDailyInput[],
  { since, until }: AggregateCompassAdsetsOptions
): CompassAdsetAggregate {
  const byAdset = new Map<string, Accumulator>()

  for (const row of daily) {
    if (!row?.adset_id || typeof row.day !== "string") continue
    if (row.day < since || row.day > until) continue // 기간 밖 일자는 제외

    let acc = byAdset.get(row.adset_id)
    if (!acc) {
      acc = {
        adsetId: row.adset_id,
        adsetName: null,
        campaignName: null,
        spendUsd: 0,
        leads: 0,
        clicks: 0,
        impressions: 0,
        metaDay: "",
      }
      byAdset.set(row.adset_id, acc)
    }

    acc.spendUsd += num(row.spend_usd)
    acc.leads += num(row.leads)
    acc.clicks += num(row.clicks)
    acc.impressions += num(row.impressions)

    // 세트명·캠페인명은 가장 최근 날짜의 값이 이긴다 — 개명 후 옛 이름이 남지 않게.
    if (row.day >= acc.metaDay) {
      acc.metaDay = row.day
      acc.adsetName = text(row.adset_name) ?? acc.adsetName
      acc.campaignName = text(row.campaign_name) ?? acc.campaignName
    }
  }

  // 전부 0 인 세트는 잡음이므로 뺀다(compass-creative aggregateCompassCreatives 와 동일 규칙).
  const kept = [...byAdset.values()].filter(
    (acc) => acc.leads !== 0 || acc.spendUsd !== 0 || acc.clicks !== 0 || acc.impressions !== 0
  )

  // spendShare 분모 — 행별로 반올림하기 전에 먼저 총합을 확정해 totals.spendUsd 와
  // 정확히 같은 값을 참조하게 한다(반올림 순서가 갈리면 두 수가 미세하게 어긋난다).
  const totalSpend = round2(kept.reduce((sum, acc) => sum + acc.spendUsd, 0))

  const rows: CompassAdsetRow[] = kept
    .map((acc) => {
      const spendUsd = round2(acc.spendUsd)
      return {
        adsetId: acc.adsetId,
        adsetName: acc.adsetName,
        campaignName: acc.campaignName,
        spendUsd,
        leads: acc.leads,
        clicks: acc.clicks,
        impressions: acc.impressions,
        cplUsd: acc.leads > 0 ? round2(spendUsd / acc.leads) : null,
        ctr: acc.impressions > 0 ? round4(acc.clicks / acc.impressions) : null,
        spendShare: totalSpend > 0 ? round4(spendUsd / totalSpend) : null,
      }
    })
    .sort(
      (a, b) =>
        b.spendUsd - a.spendUsd ||
        (a.adsetName ?? "").localeCompare(b.adsetName ?? "", "ko") ||
        a.adsetId.localeCompare(b.adsetId)
    )

  const leads = rows.reduce((sum, row) => sum + row.leads, 0)

  return {
    rows,
    totals: {
      adsetCount: rows.length,
      leads,
      spendUsd: totalSpend,
      cplUsd: leads > 0 ? round2(totalSpend / leads) : null,
    },
  }
}
