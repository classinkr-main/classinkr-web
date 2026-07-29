// 내부 CS 코파일럿 워크스페이스의 상수·표시 메타.
// 화면 로직은 담지 않는다 — 값 집합과 팔레트 매핑만 산다(DESIGN.md 팔레트).

import { Settings2 } from "lucide-react"

import type {
  ConversationPriority,
  ConversationStatus,
  ModelMode,
  ReviewChecks,
  ReviewState,
  WorkspaceTab,
} from "./types"

export const INITIAL_CHECKS: ReviewChecks = {
  customer: false,
  evidence: false,
  externalScope: false,
}

export const MAX_PENDING_ASSETS = 3
export const MAX_ASSET_BYTES = 8 * 1024 * 1024
export const ACCEPTED_ASSET_TYPES = new Set(["image/jpeg", "image/png", "image/webp"])

// 딥링크 ?conversation= 값은 URL을 통해 들어오는 유일한 미신뢰 id다.
// fetch 경로에 그대로 꽂히므로 UUID 형태가 아니면 요청조차 만들지 않는다.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// 내부 축 탭은 URL 표준 키 `tab`에 산다(docs/active/cs-admin-console-ia-2026-07-27.md §5).
// 가로 메뉴 자체는 CsConsoleNav가 그리므로 여기에는 값 집합만 남는다.
export const WORKSPACE_TAB_VALUES: readonly WorkspaceTab[] = ["chat", "queue", "hq", "tools"]

// 흡수된 레거시 값 — `아카이브` 탭은 대기열의 상태 칩(종료·보관)이 되었다.
// 옛 북마크가 그대로 살도록 queue + closed 칩으로 착지시킨다.
export const LEGACY_ARCHIVE_TAB = "archive"

// 콘솔 내비(max-w-[1240px])와 좌우 정렬을 맞추는 본문 컨테이너.
export const CONSOLE_CONTENT_CLASS = "mx-auto w-full max-w-[1240px] px-4 sm:px-6 lg:px-8"

// 대기열 상태 칩 — 5개 상태를 겹침 없이 3분할하고 `전체`가 그 합집합이다.
// 흡수 전 두 탭이 보여주던 행 집합(대기열=비아카이브, 아카이브=아카이브)이 모두 도달 가능하다.
export type QueueStatusFilter = "all" | "waiting" | "progress" | "closed"

export const QUEUE_STATUS_CHIPS: Array<{
  value: QueueStatusFilter
  label: string
  match: (status: ConversationStatus) => boolean
}> = [
  { value: "all", label: "전체", match: () => true },
  { value: "waiting", label: "대기", match: (status) => status === "queue" },
  { value: "progress", label: "진행", match: (status) => status === "active" || status === "waiting_review" },
  { value: "closed", label: "종료 · 보관", match: (status) => status === "resolved" || status === "archived" },
]

// 옛 `?tab=archive` 북마크의 착지 칩을 정한다.
// 호출부는 반드시 라우터가 준 tab 값을 넘긴다 — `typeof window` 분기로 읽으면
// /admin/cs-chatbot이 정적 프리렌더(○)라 SSR 경로에서 무조건 `all`이 나온다.
export function resolveInitialQueueFilter(rawTab: string | null | undefined): QueueStatusFilter {
  return rawTab === LEGACY_ARCHIVE_TAB ? "closed" : "all"
}

// 모델 모드 세그먼트 — 네이티브 select 대신 현재 모드가 항상 보이는 3분할 컨트롤.
export const MODEL_MODE_SEGMENTS: Array<{ value: ModelMode; label: string }> = [
  { value: "auto", label: "자동" },
  { value: "fast", label: "Flash" },
  { value: "deep", label: "Pro" },
]

// 운영 도구 화면 안쪽 하위탭(`sub`) — 콘솔 메뉴 층(`tab`) 아래의 2단째.
// 한 패널에 쌓여 있던 성격이 다른 다섯 덩어리를 서로 결합하지 않는 세 묶음으로 접는다.
//   regression : 회귀 검수 대기 — 이 화면의 유일한 "일감"이라 기본값이자 첫 자리
//   metrics    : 스탯 스트립(큐 요약) + 운영 지표 7일 (관측 · 판정하지 않는다)
//   bridge     : 내부 AI/MCP 분석 + 콘솔 밖 연동 설정 (설정 · 연동)
export const TOOLS_SUBTABS = [
  { value: "regression", label: "회귀 검수" },
  { value: "metrics", label: "지표" },
  { value: "bridge", label: "AI 브리지" },
] as const

export type ToolsSub = (typeof TOOLS_SUBTABS)[number]["value"]

export const DEFAULT_TOOLS_SUB: ToolsSub = "regression"

// 콘솔 밖 바로가기 — `sub=bridge` 탭 하단의 보조 유틸리티.
//
// 6개 → 1개. 나머지 5개(문서 보강 큐·추천 질문·채널톡·챗봇 대시보드·가이드 문서)는
// CS 콘솔 가로 메뉴(CsConsoleNav의 `미해결 큐`·`추천 질문`·`상담 Inbox`·`대시보드`·`가이드 문서`)와
// 목적지가 그대로 겹친다 — 같은 화면에 두 개의 경쟁하는 내비를 두지 않는다.
// 설정 연동만 콘솔 밖 표면이라 남는다(연동 성격이라 AI 브리지 탭이 제자리다).
export const OPERATING_TOOLS = [
  {
    href: "/admin/settings?tab=integrations",
    title: "연동 상태 확인",
    description: "Gemini · Channel Talk · WeCom 점검",
    icon: Settings2,
  },
] as const

export const STATUS_META: Record<ConversationStatus, { label: string; className: string }> = {
  queue: { label: "대기", className: "border-black/10 bg-[#F6F5F4] text-[#615D59]" },
  active: { label: "진행중", className: "border-[#084734]/15 bg-[#ECFDF5] text-[#084734]" },
  waiting_review: { label: "검토 필요", className: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]" },
  resolved: { label: "승인 완료", className: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]" },
  archived: { label: "아카이브", className: "border-black/10 bg-white text-[#615D59]" },
}

export const PRIORITY_META: Record<ConversationPriority, { label: string; dot: string }> = {
  low: { label: "낮음", dot: "bg-[#A39E98]" },
  normal: { label: "보통", dot: "bg-[#A8741A]" },
  high: { label: "높음", dot: "bg-[#B43E3E]" },
  urgent: { label: "긴급", dot: "bg-[#8F2C2C]" },
}

export const REVIEW_META: Record<ReviewState, { label: string; className: string }> = {
  not_required: { label: "기록", className: "bg-[#F6F5F4] text-[#615D59]" },
  pending: { label: "검토 전 초안", className: "bg-[#FBF1E0] text-[#7A520F]" },
  approved: { label: "승인됨", className: "bg-[#ECFDF5] text-[#084734]" },
  changes_requested: { label: "수정 요청", className: "bg-[#FCE9E9] text-[#8F2C2C]" },
  rejected: { label: "사용 안 함", className: "bg-[#F6F5F4] text-[#615D59]" },
}
