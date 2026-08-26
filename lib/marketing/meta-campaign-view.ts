// lib/marketing/meta-campaign-view.ts
// 광고 탭 Meta 캠페인 표의 표시 규칙 — "지금 돌고 있는 것"과 "멈춘 것"을 가른다.
//
// 왜: 계정에 캠페인이 쌓이면 표가 과거 유물로 덮인다. 2026-08-26 실측으로 18개 중
// 실제 ACTIVE 는 1개뿐이었다 — 기본 화면에서 17줄이 노이즈였다.
//
// 정직 규칙(중요): 멈춘 캠페인도 **조회 기간 안에는 돈을 썼을 수 있다**. 같은 실측에서
// 중지된 3개가 $506.38 을 썼고, 이는 기간 총액 $1,054.14 의 48% 다. 그래서 접힘은
// 숨기기가 아니라 **접기**이고, 접힘 머리말에 숨긴 광고비·리드를 반드시 표기한다.
// 그러지 않으면 위쪽 KPI(총 광고비)와 아래 표의 합이 말없이 어긋난다.
//
// 타입: 저장소에 MetaCampaignRow 가 둘이다(lib/meta/marketing 의 전체 행, components/admin/
// campaigns/tabs/types 의 화면용 축소 행). 어느 한쪽에 묶지 않으려고 필요한 필드만 구조적으로
// 받는다 — 둘 다 이 모양을 만족한다.

export interface MetaRunnableCampaign {
  status?: string
  effectiveStatus?: string
  insights?: {
    spend?: number
    leads?: number
  }
}

/** Meta 가 "지금 집행 중"으로 보는 상태. effectiveStatus 가 있으면 그게 정본이다. */
const RUNNING_STATUSES = new Set(["ACTIVE"])

export function metaRunState(campaign: MetaRunnableCampaign): string {
  return (campaign.effectiveStatus ?? campaign.status ?? "UNKNOWN").toUpperCase()
}

export function isRunningMetaCampaign(campaign: MetaRunnableCampaign): boolean {
  return RUNNING_STATUSES.has(metaRunState(campaign))
}

export interface MetaCampaignSplitTotals {
  count: number
  spend: number
  leads: number
  /** 멈췄는데도 이 기간에 광고비가 잡힌 캠페인 수 — 접힘 안내에 쓴다. */
  withSpend: number
}

export interface MetaCampaignSplit<T> {
  running: T[]
  stopped: T[]
  stoppedTotals: MetaCampaignSplitTotals
  /**
   * 돌고 있는 게 하나도 없으면 접을 게 아니라 전부 펴서 보여준다 —
   * 빈 표를 띄우고 "17개 접힘"이라고 하는 건 화면만 비우는 짓이다.
   */
  allStopped: boolean
}

function totalsOf(rows: readonly MetaRunnableCampaign[]): MetaCampaignSplitTotals {
  let spend = 0
  let leads = 0
  let withSpend = 0
  for (const row of rows) {
    const rowSpend = Number(row.insights?.spend ?? 0)
    if (Number.isFinite(rowSpend) && rowSpend > 0) {
      spend += rowSpend
      withSpend += 1
    }
    const rowLeads = Number(row.insights?.leads ?? 0)
    if (Number.isFinite(rowLeads)) leads += rowLeads
  }
  return { count: rows.length, spend, leads, withSpend }
}

/**
 * 집행 중 / 멈춤 2그룹. 각 그룹 안의 순서는 입력 순서를 그대로 둔다
 * (서버가 이미 광고비순으로 준다 — 여기서 다시 정렬하면 그 의도를 덮어쓴다).
 */
export function splitMetaCampaignsByRun<T extends MetaRunnableCampaign>(
  campaigns: readonly T[]
): MetaCampaignSplit<T> {
  const running: T[] = []
  const stopped: T[] = []
  for (const campaign of campaigns) {
    ;(isRunningMetaCampaign(campaign) ? running : stopped).push(campaign)
  }
  return {
    running,
    stopped,
    stoppedTotals: totalsOf(stopped),
    allStopped: running.length === 0 && stopped.length > 0,
  }
}
