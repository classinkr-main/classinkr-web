// 화면별 추천 — 정적 목록이다. 갈매봇이 우선순위를 추천하지 않는다(기획 §2·§3.1).
import type { DemoScenarioKey } from "./demo-scenarios"
import type { OrderRisk } from "./types"

export interface AdminAiSuggestion {
  label: string
  risk: OrderRisk
  scenario: DemoScenarioKey
}

interface SuggestionSet {
  prefix: string
  items: AdminAiSuggestion[]
}

const SETS: readonly SuggestionSet[] = [
  {
    prefix: "/admin/crm",
    items: [
      { label: "후속 전화 할 일 잡기", risk: "R1", scenario: "task" },
      { label: "고객 최근 기록 요약", risk: "R0", scenario: "summary" },
      { label: "오늘 연락할 곳", risk: "R0", scenario: "today" },
    ],
  },
  {
    prefix: "/admin/hardware",
    items: [
      { label: "86형 재고 확인", risk: "R0", scenario: "stock" },
      { label: "출고 예정 건 확정", risk: "R2", scenario: "ship" },
      { label: "오늘 연락할 곳", risk: "R0", scenario: "today" },
    ],
  },
  {
    prefix: "/admin/quotes",
    items: [
      { label: "견적 금액 변경", risk: "R2", scenario: "amount" },
      { label: "결제 확정", risk: "R2", scenario: "pay" },
      { label: "86형 재고 확인", risk: "R0", scenario: "stock" },
    ],
  },
]

const DEFAULT_ITEMS: AdminAiSuggestion[] = [
  { label: "오늘 연락할 곳", risk: "R0", scenario: "today" },
  { label: "86형 재고 확인", risk: "R0", scenario: "stock" },
  { label: "컨택 기록 남기기", risk: "R1", scenario: "contact" },
]

/** 가장 길게 맞는 경로의 추천을 돌려준다. 맞는 것이 없으면 공통 추천. */
export function resolveAdminAiSuggestions(pathname: string): AdminAiSuggestion[] {
  let best: SuggestionSet | null = null
  for (const set of SETS) {
    const matches = pathname === set.prefix || pathname.startsWith(`${set.prefix}/`)
    if (matches && (!best || set.prefix.length > best.prefix.length)) best = set
  }
  return best?.items ?? DEFAULT_ITEMS
}

/**
 * 어느 화면에서나 같은 "묻기" 추천 — 화면별 3개 아래에 붙는다(새 대화 설계 N8, 점검 R28).
 * 담당자·링크·정책 질문은 매니저가 가장 자주 하는 질문이고, 오더가 아니라 조회(R0)다.
 * 실제 답 카드는 다음 묶음이 붙이고, 지금은 시안 글 답이 나온다.
 */
export const COMMON_ASK_ITEMS: readonly AdminAiSuggestion[] = [
  { label: "담당자 찾기", risk: "R0", scenario: "who" },
  { label: "링크 찾기", risk: "R0", scenario: "link" },
  { label: "정책 묻기", risk: "R0", scenario: "knowledge" },
]
