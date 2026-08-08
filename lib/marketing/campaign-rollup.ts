// lib/marketing/campaign-rollup.ts
// 크로스채널 캠페인 롤업 — 순수 함수(입력 → 출력, DB 접근·부수효과 없음).
// 링크된 채널 실행(email/sms/event/meta)의 지표를 읽기시점에 CampaignRollup 으로 집계한다.
//
// 정직 규칙(D2 채널 예산표와 동일):
//  - Meta 집행은 계정 통화 네이티브(USD 등) — 절대 KRW 로 환산·합산하지 않는다.
//    링크된 Meta 캠페인의 통화가 하나로 일치할 때만 spend 를 합산하고, 섞이면 합산 불가(null).
//  - 행사 매출은 "입력 기준"(KRW) — 매출 입력이 하나도 없으면 0 이 아니라 null.
//    "데이터 없음"과 "0원"을 구분해 거짓 지표를 만들지 않는다.
//  - 채널·통화를 가로지르는 종합 ROAS/ROI 는 만들지 않는다(CampaignRollup 타입에 필드 없음).

import type { CampaignLink, CampaignRollup } from "@/lib/types/marketing-campaign"
import type { EventMetrics } from "@/lib/types/event-metrics"

// 링크 대상 실행의 조회 데이터. 각 맵은 실행 id(= campaign_links.ref_id)로 키잉된다.
// 어떤 링크의 ref_id 가 해당 맵에 없으면(미조회/미존재) 그 링크는 지표에 0 을 기여한다.
export interface CampaignRollupSources {
  emailCampaigns: Record<string, { recipientCount: number; openCount: number }>
  smsCampaigns: Record<string, { recipientCount: number }>
  // 행사 리드는 리드↔행사 attribution 산출값이라 EventMetrics 에 저장되지 않는다.
  // 따라서 호출자가 행사 id 별 leads 를 명시적으로 주입한다(딜 수·딜 매출은 EventMetrics 원본).
  eventMetrics: Record<
    string,
    Pick<EventMetrics, "dealsCount" | "dealsRevenue"> & { leads: number }
  >
  metaCampaigns: Record<string, { spend: number; leads: number; currency: string }>
}

export function computeCampaignRollup(
  links: CampaignLink[],
  sources: CampaignRollupSources,
): CampaignRollup {
  let emailRecipients = 0
  let emailOpens = 0
  let smsRecipients = 0
  let eventLeads = 0
  let eventDeals = 0

  // 행사 매출: non-null 값만 합산하되, 하나라도 입력이 있어야 숫자를 낸다(없으면 null).
  let eventRevenueSum = 0
  let hasEventRevenue = false

  // Meta: sources 에 해석된 링크만 통화를 판정한다. 단일 통화일 때만 spend 를 합산.
  let metaSpendSum = 0
  let metaLeads = 0
  let firstMetaCurrency: string | null = null
  let metaCurrencyMixed = false

  const linkedCounts = { email: 0, sms: 0, event: 0, meta: 0 }

  for (const link of links) {
    switch (link.refType) {
      case "email_campaign": {
        linkedCounts.email += 1
        const row = sources.emailCampaigns[link.refId]
        if (row) {
          emailRecipients += row.recipientCount
          emailOpens += row.openCount
        }
        break
      }
      case "sms_campaign": {
        linkedCounts.sms += 1
        const row = sources.smsCampaigns[link.refId]
        if (row) {
          smsRecipients += row.recipientCount
        }
        break
      }
      case "event": {
        linkedCounts.event += 1
        const row = sources.eventMetrics[link.refId]
        if (row) {
          eventLeads += row.leads
          eventDeals += row.dealsCount ?? 0
          if (row.dealsRevenue != null) {
            eventRevenueSum += row.dealsRevenue
            hasEventRevenue = true
          }
        }
        break
      }
      case "meta_campaign": {
        linkedCounts.meta += 1
        const row = sources.metaCampaigns[link.refId]
        if (row) {
          metaLeads += row.leads // 리드는 무단위이므로 통화와 무관하게 항상 합산.
          metaSpendSum += row.spend
          if (firstMetaCurrency === null) {
            firstMetaCurrency = row.currency
          } else if (firstMetaCurrency !== row.currency) {
            metaCurrencyMixed = true
          }
        }
        break
      }
      // refType 은 CampaignRefType 로 좁혀져 있어 그 외 값은 도달 불가(방어적으로 무시).
    }
  }

  // 해석된 Meta 링크가 하나라도 있고(firstMetaCurrency != null) 통화가 일치할 때만 정직하게 합산.
  const metaCurrencyKnown = firstMetaCurrency !== null && !metaCurrencyMixed

  return {
    emailRecipients,
    emailOpens,
    smsRecipients,
    eventLeads,
    eventDeals,
    eventRevenue: hasEventRevenue ? eventRevenueSum : null,
    metaSpend: metaCurrencyKnown ? metaSpendSum : null,
    metaCurrency: metaCurrencyKnown ? firstMetaCurrency : null,
    metaLeads,
    linkedCounts,
  }
}
