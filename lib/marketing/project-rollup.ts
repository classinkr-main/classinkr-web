// lib/marketing/project-rollup.ts
// 마케팅 프로젝트(D3) 롤업 — 순수 함수(입력 → 출력, DB 접근·부수효과 없음).
// 프로젝트에 소속된 멤버 캠페인들의 지표를 읽기시점에 ProjectRollup 으로 집계한다.
//
// 정직 규칙(D1/D2 캠페인 롤업과 동일):
//  - 예산 소진(budgetSpent)은 KRW 배정 예산 대비 KRW 집행만 센다. 소진 원천은 링크된
//    행사의 광고비(event-metrics adSpendEntries[].amount — 전부 KRW)뿐이다.
//  - Meta 라이브 대시보드 집행(계정 통화 USD 등)은 프로젝트 롤업 입력에 아예 넣지 않는다 —
//    통화가 달라 KRW 소진에 합산할 수 없다(채널·통화 가로지르는 조작 지표 금지, ROAS 없음).
//  - 이메일·문자는 집행비 개념이 없어 budgetSpent 에 기여하지 않는다.
//  - 광고비는 "행사 단위" 속성이라 동일 행사가 여러 멤버 캠페인에 링크돼도 KRW 를
//    1회만 계상한다(이중계상 금지). eventCount 는 별개로 링크 수를 센다.

import type { CampaignWithLinks, ProjectRollup } from "@/lib/types/marketing-campaign"
import type { EventMetrics } from "@/lib/types/event-metrics"

// 롤업 입력. eventAdSpend 는 행사 id(= event 링크의 ref_id)별 KRW 광고비 합.
// budget 은 프로젝트 배정 예산(project.budget) — 소진%를 내기 위해 함께 주입한다.
export interface ProjectRollupSources {
  // eventId → KRW 광고비 합(해당 행사 adSpendEntries[].amount 총합). Meta 라이브(USD)는 미포함.
  eventAdSpend: Record<string, number>
  // project.budget — KRW 배정 예산(nullable). 없으면 spentPct 는 null.
  budget: number | null
}

/**
 * 멤버 캠페인 배열 + 소스로 프로젝트 롤업을 계산한다(순수 함수).
 *  - campaignCount = 멤버 캠페인 수
 *  - channelCount  = 멤버 캠페인을 가로지르는 distinct 채널 수(합집합)
 *  - eventCount    = 멤버 캠페인의 event 링크 수(링크 기준 — 동일 행사 중복 링크도 각각 계수)
 *  - budgetSpent   = 링크된 distinct 행사의 KRW 광고비 합(이중계상 방지). email/sms/meta 링크 기여 없음.
 *  - spentPct      = 예산>0 일 때만 round(소진/배정*100), 아니면 null(0 나눗셈·거짓 0% 방지)
 */
export function computeProjectRollup(
  campaigns: CampaignWithLinks[],
  sources: ProjectRollupSources,
): ProjectRollup {
  const channels = new Set<string>()
  let eventCount = 0
  // 광고비는 행사 단위 속성 — 동일 행사가 여러 멤버 캠페인에 링크돼도 KRW 를
  // 이중계상하지 않도록 distinct eventId 로 모아 1회만 합산한다.
  const spentEventIds = new Set<string>()

  for (const c of campaigns) {
    for (const ch of c.channels) channels.add(ch)
    for (const link of c.links) {
      if (link.refType === "event") {
        eventCount += 1
        spentEventIds.add(link.refId)
      }
    }
  }

  let budgetSpent = 0
  for (const eventId of spentEventIds) {
    const spend = sources.eventAdSpend[eventId]
    if (typeof spend === "number" && Number.isFinite(spend)) budgetSpent += spend
  }

  const budgetAllocated = sources.budget
  const spentPct =
    budgetAllocated != null && budgetAllocated > 0
      ? Math.round((budgetSpent / budgetAllocated) * 100)
      : null

  return {
    campaignCount: campaigns.length,
    channelCount: channels.size,
    eventCount,
    budgetAllocated,
    budgetSpent,
    spentPct,
  }
}

/**
 * event-metrics 맵(getAllEventMetrics 결과)을 eventId별 KRW 광고비 합으로 변환한다(순수 헬퍼).
 * adSpendEntries[].amount 는 전부 KRW 이므로 'meta' 채널로 입력된 항목도 그대로 합산한다
 * (이는 라이브 Meta USD 집행이 아니라, 행사 단위로 수기 입력된 KRW 광고비다).
 * API 는 getAllEventMetrics() 를 요청당 1회만 호출해 이 헬퍼로 변환한 뒤 모든 프로젝트 롤업에 재사용한다(N+1 회피).
 */
export function eventAdSpendFromMetrics(
  all: Record<string, EventMetrics>,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [eventId, m] of Object.entries(all)) {
    out[eventId] = (m.adSpendEntries ?? []).reduce(
      (sum, e) =>
        sum + (typeof e.amount === "number" && Number.isFinite(e.amount) ? e.amount : 0),
      0,
    )
  }
  return out
}
