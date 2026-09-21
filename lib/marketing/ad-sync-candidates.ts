// lib/marketing/ad-sync-candidates.ts
// 광고 일자 스냅샷(google_ads_daily / naver_ads_daily) → 자동 링크 후보.
// 순수 함수(DB·서버 의존 없음). 플랜 계산은 ad-campaign-sync.ts, 적용은 ad-sync 라우트.
//
// 스냅샷은 "캠페인 목록"이 아니라 **일자 원장**이다. 한 캠페인이 수십 행으로 흩어져 있어
// 접는 규칙이 필요한데, 그 규칙 하나하나가 플래너의 판정(stale·unnamed·no-activity)을
// 좌우한다. 그래서 라우트 안에 두지 않고 여기서 따로 검증한다.

import type { AdCampaignCandidate } from "@/lib/marketing/ad-campaign-sync"

/** 두 채널 레코드에서 접기에 실제로 쓰는 필드만 추린 모양. */
export interface AdDailySnapshotRow {
  date: string
  campaignId: string
  campaignName: string | null
  spend: number
  impressions: number
  clicks: number
  currency: string | null
}

/**
 * 그 일자에 **집행이 있었는가**. 전부 0 인 행은 집행일로 세지 않는다.
 *
 * 행이 있다는 것만으로 마지막 집행일을 잡으면, 노출조차 없던 날이 "어제 돌았다"가 되어
 * 끝난 캠페인이 stale 판정을 통째로 피해 간다. 전부 0 인 행만 있는 캠페인은
 * lastActiveDate: null 로 넘겨 플래너가 no-activity 로 보고하게 둔다.
 */
export function hasAdActivity(row: AdDailySnapshotRow): boolean {
  return row.impressions > 0 || row.clicks > 0 || row.spend > 0
}

/**
 * 일자 행 → 캠페인 후보. **입력 순서에 의존하지 않는다** — 날짜를 직접 비교한다.
 * (두 저장소의 range 조회는 date asc 로 주지만, 그 규약이 흔들려도 결과가 바뀌지 않아야 한다.
 *  ISO 날짜는 사전순 비교 = 시간순 비교라 따로 파싱할 필요가 없다.)
 *
 * 접는 규칙 셋:
 *  - 이름: **이름이 있던 행 중 가장 최근** 것. 최신 행의 이름이 비었다고 아는 이름을 지우면
 *    플래너가 unnamed 로 건너뛴다(이름은 있는데 못 붙는 상태).
 *  - 마지막 집행일: hasAdActivity 인 행 중 가장 최근 날짜.
 *  - 집행 합: 통화가 하나일 때만. 섞여 있으면 금액이 아니라 **더할 수 없다**(null)가 사실이다.
 *    (계정 통화가 중간에 바뀐 계정에서만 생긴다. 합치면 두 통화가 한 숫자로 뭉개진다.)
 *
 * campaignId 는 스냅샷 값 **그대로** 내보낸다 — 롤업·perf 가 link.refId 를 스냅샷
 * campaign_id 와 문자열 대조하므로, 여기서 다듬으면 링크는 생겼는데 집행이 영영 안 잡힌다.
 */
export function foldAdSyncCandidates(
  rows: readonly AdDailySnapshotRow[],
  channel: AdCampaignCandidate["channel"],
): AdCampaignCandidate[] {
  const byId = new Map<
    string,
    {
      name: string | null
      /** name 을 가져온 행의 날짜 — 더 최근 이름만 덮어쓰기 위한 기준. */
      nameDate: string | null
      last: string | null
      spend: number
      currencies: Set<string>
    }
  >()

  for (const row of rows) {
    let entry = byId.get(row.campaignId)
    if (!entry) {
      entry = { name: null, nameDate: null, last: null, spend: 0, currencies: new Set() }
      byId.set(row.campaignId, entry)
    }
    if (row.campaignName?.trim() && (entry.nameDate === null || row.date >= entry.nameDate)) {
      entry.name = row.campaignName
      entry.nameDate = row.date
    }
    if (row.currency) entry.currencies.add(row.currency)
    entry.spend += row.spend
    if (hasAdActivity(row) && (entry.last === null || row.date > entry.last)) {
      entry.last = row.date
    }
  }

  return Array.from(byId, ([campaignId, entry]) => {
    const currency = entry.currencies.size === 1 ? [...entry.currencies][0] : null
    return {
      channel,
      campaignId,
      campaignName: entry.name,
      lastActiveDate: entry.last,
      spend: currency === null ? null : entry.spend,
      currency,
    }
  })
}
