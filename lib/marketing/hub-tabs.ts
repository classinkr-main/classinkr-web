// lib/marketing/hub-tabs.ts
// 마케팅 허브(/admin/campaigns)의 탭·섹션 정의와 딥링크 해석 — 순수 모듈(테스트 대상).
//
// 2026-09-14 재구성: 탭 축을 "보기 방식(요약)·큐(신규 리드)·도메인(행사·광고)·도구(메시지)"의
// 혼합에서 정보 층위 셋(한눈에 → 상세 → 데이터) + 도구(메시지) 하나로 바꿨다.
// 기획: docs/active/marketing-tab-dashboard-restructure-2026-09-14.md §3.
//
// 옛 탭 id(leads/events/meta)는 삭제하지 않고 새 층의 섹션 앵커로 매핑한다 — 탭 재구성 P1
// "삭제하지 않는다, 접는다": 딥링크·⌘K·외부 문서의 링크가 계속 착지해야 한다.

export type CampaignTab = "summary" | "detail" | "data" | "email"

export interface CampaignTabDef {
  id: CampaignTab
  label: string
  /** 정보 층 번호(1~3). 메시지는 층이 아니라 도구라 없다. */
  tier: 1 | 2 | 3 | null
  /** 탭 버튼 title(호버 설명) — 띠를 2줄로 만들지 않기 위해 상시 노출하지 않는다. */
  title: string
}

export const CAMPAIGN_TABS: readonly CampaignTabDef[] = [
  { id: "summary", label: "한눈에", tier: 1, title: "판정 · 핵심 숫자 4 · 오늘 유입 · 추이 · 퍼널 · Top 3" },
  { id: "detail", label: "상세", tier: 2, title: "캠페인 · 소재 · 퍼널·채널 · 행사 · 메시지 성과" },
  { id: "data", label: "데이터", tier: 3, title: "신규 리드 · 광고 리드 · Meta 캠페인 · 예산·성과 입력 · 업데이트 로그 · 주간 보고서" },
  { id: "email", label: "메시지", tier: null, title: "구독자 · 발송(이메일 라이브 · 문자·카카오 준비 중) · 이력" },
]

export function isCampaignTab(value: string | null | undefined): value is CampaignTab {
  return value === "summary" || value === "detail" || value === "data" || value === "email"
}

export interface HubSectionDef {
  id: string
  label: string
}

/** 상세(2층) 섹션 — 렌더 순서 = 내비 순서. id 는 앵커(#id)이자 레거시 매핑의 착지점이다. */
export const DETAIL_SECTIONS: readonly HubSectionDef[] = [
  { id: "campaigns", label: "캠페인" },
  { id: "creatives", label: "소재" },
  { id: "funnel", label: "퍼널·채널" },
  { id: "events", label: "행사" },
  { id: "messages", label: "메시지 성과" },
]

/** 데이터(3층) 섹션 — 표·폼·내보내기. 쓰기 액션은 이 층에서만 일어난다. */
export const DATA_SECTIONS: readonly HubSectionDef[] = [
  { id: "new-leads", label: "신규 리드" },
  { id: "ad-leads", label: "광고 리드" },
  { id: "meta", label: "Meta 캠페인" },
  { id: "budgets", label: "예산·성과 입력" },
  { id: "updates", label: "업데이트 로그" },
  { id: "weekly", label: "주간 보고서" },
]

/**
 * 옛 탭 id → 새 층 + 섹션. 옛 "광고" 탭은 차트(상세)와 표·입력(데이터)을 함께 담고 있었다 —
 * 기본 착지는 상세 › 캠페인이고, 예산표를 뜻하던 링크는 코드에서 data#budgets 로 직접 바꿨다.
 */
const LEGACY_TAB_MAP: Record<string, { tab: CampaignTab; anchor: string }> = {
  leads: { tab: "data", anchor: "new-leads" },
  events: { tab: "detail", anchor: "events" },
  meta: { tab: "detail", anchor: "campaigns" },
}

export interface ResolvedCampaignTab {
  tab: CampaignTab
  /** 레거시 매핑이 지정한 섹션 앵커(id). 새 id 로 들어오면 null — 해시는 호출부가 URL 에서 읽는다. */
  anchor: string | null
  /** 옛 id 로 들어왔는가 — 호출부가 URL 을 새 id 로 정정할지 판단한다. */
  legacy: boolean
}

export function resolveCampaignTab(raw: string | null | undefined): ResolvedCampaignTab {
  if (isCampaignTab(raw)) return { tab: raw, anchor: null, legacy: false }
  const legacy = raw ? LEGACY_TAB_MAP[raw] : undefined
  if (legacy) return { tab: legacy.tab, anchor: legacy.anchor, legacy: true }
  return { tab: "summary", anchor: null, legacy: false }
}

/** 섹션 id 가 그 층의 것인지 — 임의 해시(#foo)로 스크롤 시도하지 않게 거른다. */
export function isHubSection(tab: CampaignTab, id: string | null | undefined): boolean {
  if (!id) return false
  const sections = tab === "detail" ? DETAIL_SECTIONS : tab === "data" ? DATA_SECTIONS : []
  return sections.some((section) => section.id === id)
}

/**
 * 허브 딥링크 조립 — 탭·섹션·기간을 한 규칙으로 만든다.
 * 기간(perf)은 기본값(30d)이면 싣지 않는다(useUrlState 의 기본값 생략 규약과 동일).
 * 해시는 쿼리 뒤에 붙는다(`?tab=data&perf=7d#budgets`).
 */
export function campaignHubHref(input: {
  tab?: CampaignTab
  section?: string | null
  perf?: string | null
}): string {
  const params = new URLSearchParams()
  const tab = input.tab ?? "summary"
  if (tab !== "summary") params.set("tab", tab)
  if (input.perf && input.perf !== "30d") params.set("perf", input.perf)
  const query = params.toString()
  const hash = input.section ? `#${input.section}` : ""
  return `/admin/campaigns${query ? `?${query}` : ""}${hash}`
}
