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
