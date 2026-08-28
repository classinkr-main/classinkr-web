"use client"

// 리드 보드 화면 공유 상수·헬퍼·소형 아톰.
// LeadsBoardClient.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { Download, Flame, LogIn } from "lucide-react"
import type { LeadRecord } from "@/lib/repositories/leads"
import type { LeadActivityBadge } from "@/lib/repositories/lead-activity"
import type { LeadPriority } from "@/lib/crm/lead-ranking"
import type { LeadAssignmentPolicyPreview } from "@/lib/crm/lead-assignment-policy"
import { SOURCE_GROUP_LABEL, SOURCE_LABEL, getLeadSourceGroup } from "../shared"

// 리드 보드 목록 무한스크롤 대체 — 초기 50건, "더보기"로 50건씩 확장(계획 문서 Phase W1).
// 모바일 카드·데스크톱 테이블이 같은 filtered를 그리므로 visible 상한을 공유한다.
export const LEAD_BOARD_LIST_STEP = 50
// 담당자 패널에 그리는 행 상한. 넘치는 인원·건수는 각주로 드러낸다(조용히 자르지 않는다).
export const OWNER_ROW_CAP = 6

// 리드 목록 캐시 — CrmSubnav의 hover 예열(warmAdminRequestCache, ttl 60s)과 같은 캐시 키를
// 쓰므로 TTL을 0으로 두면 예열이 100% 헛돈다. persist는 계속 false: 리드 전량 페이로드가
// sessionStorage 쿼터를 위협하므로 메모리 캐시만 쓴다.
export const LEADS_CACHE_TTL_MS = 30_000
export const LEADS_CACHE_SWR_MS = 120_000

// now 틱 주기. 틱 한 번이 전 리드 우선순위 재계산 + 필터·정렬 + 보드 재렌더를 부르므로
// 1분은 비싸다. 우선순위 감쇠가 최대 5분 늦게 반영되는 건 감수한 트레이드오프.
export const NOW_TICK_MS = 300_000

export interface LeadAssignmentPreviewResponse extends LeadAssignmentPolicyPreview {
  snapshotToken: string
  rosterHealthy: boolean
  rosterMessage: string | null
}

// 유입 셀의 보조 세그먼트 — 그룹 라벨과 사실상 같은 말이면 생략해 "메타 · Meta 리드" 같은
// 중복 표기를 막는다(메타는 광고명 칩이 세부를 담당). 그룹 내 소스가 여럿인 경우(홈페이지의
// 데모/문의/CTA 등)에만 구분값으로 노출한다.
export function getLeadSourceSegment(lead: LeadRecord): string | null {
  if (lead.source === "meta_lead_ads") return null
  const label = SOURCE_LABEL[lead.source] ?? lead.source
  return label === SOURCE_GROUP_LABEL[getLeadSourceGroup(lead)] ? null : label
}

// ─── 모아보기 렌즈 ─────────────────────────────────────────────
// 리드를 담는 두 그릇. 렌즈는 목록의 모집단 자체를 바꾸고, 아래 상태·유입 필터와 AND로 겹친다.
//  - 전체: 모든 리드 + 단계별/담당자 운영 패널
//  - 마케팅: 마케팅 귀속 리드만 + 트래킹 롤업 패널(채널·캠페인·광고·마그넷·랜딩)
export type LeadLens = "all" | "marketing"

export const LENS_OPTIONS: Array<{ key: LeadLens; label: string; hint: string }> = [
  { key: "all", label: "전체 리드", hint: "모든 유입 · 단계와 담당자 중심" },
  { key: "marketing", label: "마케팅 리드", hint: "트래킹이 붙은 유입 · 채널 성과 중심" },
]

export function isLeadLens(value: string | null | undefined): value is LeadLens {
  return value === "all" || value === "marketing"
}

// 우선순위 점수 밴드 — 70+ 는 오늘 손대야 하는 리드, 45+ 는 살아있는 리드, 그 아래는 배경.
export function priorityToneClass(total: number) {
  if (total >= 70) return "bg-[#ECFDF5] text-[#084734]"
  if (total >= 45) return "bg-[#f0f0ec] text-[#1a1a1a]/60"
  return "bg-[#fafaf8] text-[#1a1a1a]/35"
}

export function priorityBreakdownTitle(priority: LeadPriority) {
  return `주요 ${priority.value} · 반응 ${priority.response} · 최근 ${priority.recency} · 자주 ${priority.frequency} · 긴급 ${priority.urgency}`
}

export function PriorityCell({ priority }: { priority: LeadPriority }) {
  return (
    <div className="flex max-w-[230px] flex-col items-start gap-1">
      <span
        title={priorityBreakdownTitle(priority)}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums ${priorityToneClass(priority.total)}`}
      >
        <Flame className="h-3 w-3" />
        {priority.total}
      </span>
      {priority.reasons.length > 0 ? (
        <span className="max-w-full truncate text-[11px] text-[#1a1a1a]/45">
          {priority.reasons.join(" · ")}
        </span>
      ) : null}
    </div>
  )
}

export type ConvertLeadResponse = {
  customer: {
    id?: string
    name: string
  }
  deal: {
    id?: string
    deal_code?: string | null
  }
  lead: LeadRecord
  reusedExisting?: { customer: boolean; deal: boolean }
  links?: { deal?: string; customer?: string }
}

export type ConvertResultState = {
  customerName: string
  dealCode: string | null
  reused: boolean
  dealUrl: string | null
  customerUrl: string
  quoteUrl: string | null
}

// ─── 활동 인텔리전스 헬퍼 ──────────────────────────────────────
const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  naver: "네이버",
  kakao: "카카오",
  email: "이메일",
}

export const ACTIVITY_EVENT_LABEL: Record<string, string> = {
  view_demo_video: "데모 영상 시청",
  click_cta: "CTA 클릭",
  begin_checkout: "결제 시작",
  page_view: "페이지 조회",
  submit_contact: "문의 제출",
  submit_demo: "데모 신청",
  newsletter_subscribe: "뉴스레터 구독",
}

export function providerLabel(provider: string | null) {
  if (!provider) return "로그인"
  return PROVIDER_LABEL[provider] ?? provider
}

export function formatActivityTime(iso: string) {
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const mins = Math.floor(diffMs / 60_000)
  if (mins < 1) return "방금"
  if (mins < 60) return `${mins}분 전`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}시간 전`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}일 전`
  return date.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })
}

// 리스트 행 한눈 배지 — 로그인 공급자 + 다운로드 수. 신호 없으면 렌더 안 함.
export function LeadActivityChip({ badge }: { badge?: LeadActivityBadge }) {
  if (!badge || (!badge.authenticated && badge.downloadCount === 0)) return null
  const providerText = badge.providers.map(providerLabel).join(", ") || "로그인"
  return (
    <span className="inline-flex items-center gap-1">
      {badge.authenticated && (
        <span
          title={`${providerText} 로그인`}
          className="inline-flex items-center rounded-full bg-[#ECFDF5] px-1.5 py-0.5 text-[10px] font-medium text-[#084734]"
        >
          <LogIn className="h-2.5 w-2.5" />
        </span>
      )}
      {badge.downloadCount > 0 && (
        <span
          title={`자료 ${badge.downloadCount}건 다운로드`}
          className="inline-flex items-center gap-0.5 rounded-full bg-[#f0f0ec] px-1.5 py-0.5 text-[10px] font-medium text-[#1a1a1a]/55"
        >
          <Download className="h-2.5 w-2.5" />
          {badge.downloadCount}
        </span>
      )}
    </span>
  )
}
