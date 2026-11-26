// 화면별 추천 — 정적 목록이다. 갈매봇이 우선순위를 추천하지 않는다(기획 §2·§3.1).
import { demoScenarioPrompt, type DemoScenarioKey } from "./demo-scenarios"
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
 * 시안에서는 담당자·정책 답·링크 카드가 샘플 자료로 나온다(실제 표·문서를 읽지 않는다).
 */
export const COMMON_ASK_ITEMS: readonly AdminAiSuggestion[] = [
  { label: "담당자 찾기", risk: "R0", scenario: "who" },
  { label: "링크 찾기", risk: "R0", scenario: "link" },
  { label: "정책 묻기", risk: "R0", scenario: "knowledge" },
]

// ── 실제 모드 추천(서버 1단계, 검토 동작-5·안전-4) ─────────────────────────────────────────────
// 시안 추천은 시나리오 문장(가짜 기관 이름이 든 문장)을 보낸다. 실제 모드에서 그 문장을 서버로 보내면 같은 이름의 실제 고객을
// 찾거나 "아직 준비 중" 거절 카드로 간다. 실제 모드는 서버가 실제로 하는 일만, 기관 이름 없는 문장으로 추천한다
// (대상은 열린 화면 맥락으로 잡힌다). 시험: tests/admin-ai/live-suggestions.test.ts — 문장마다 거절 카드로 가지 않는지 본다.

export interface AdminAiLiveSuggestion {
  label: string
  risk: OrderRisk
  /** 서버로 보내는 질문 — 기관·사람 이름을 넣지 않는다. */
  prompt: string
}

const LIVE_SETS: ReadonlyArray<{ prefix: string; items: AdminAiLiveSuggestion[] }> = [
  {
    prefix: "/admin/crm",
    items: [
      { label: "딜 목록 보기", risk: "R0", prompt: "딜 목록 보여 줘" },
      { label: "이 고객 담당자 찾기", risk: "R0", prompt: "이 고객 담당자 누구야?" },
      { label: "견적 초안 만들기", risk: "R1", prompt: "견적 초안 만들어 줘" },
    ],
  },
  {
    prefix: "/admin/hardware",
    items: [
      { label: "86형 재고 확인", risk: "R0", prompt: "86형 재고 몇 대야?" },
      { label: "이번 달 입출고", risk: "R0", prompt: "이번 달 입출고 내역 보여 줘" },
      { label: "주문 권장 품목", risk: "R0", prompt: "주문 권장 뜬 품목 있어?" },
    ],
  },
  {
    prefix: "/admin/quotes",
    items: [
      { label: "견적 목록 보기", risk: "R0", prompt: "견적 목록 보여 줘" },
      { label: "견적 초안 만드는 방법", risk: "R0", prompt: "견적 초안 만드는 방법 알려 줘" },
      { label: "86형 재고 확인", risk: "R0", prompt: "86형 재고 몇 대야?" },
    ],
  },
]

const LIVE_DEFAULT_ITEMS: AdminAiLiveSuggestion[] = [
  { label: "86형 재고 확인", risk: "R0", prompt: "86형 재고 몇 대야?" },
  { label: "지난 7일 방문자", risk: "R0", prompt: "지난 7일 방문자 몇 명이야?" },
  { label: "딜 목록 보기", risk: "R0", prompt: "딜 목록 보여 줘" },
]

export const LIVE_COMMON_ASK_ITEMS: readonly AdminAiLiveSuggestion[] = [
  { label: "담당자 찾기", risk: "R0", prompt: "결제 오류는 누구한테 물어봐?" },
  { label: "링크 찾기", risk: "R0", prompt: "견적 화면 링크 알려 줘" },
  { label: "정책 묻기", risk: "R0", prompt: "환불 규정 알려 줘" },
  { label: "상담 내역 찾기", risk: "R0", prompt: "환불 문의 최근에 들어온 거 있어?" },
]

export function resolveLiveSuggestions(pathname: string): AdminAiLiveSuggestion[] {
  let best: { prefix: string; items: AdminAiLiveSuggestion[] } | null = null
  for (const set of LIVE_SETS) {
    const matches = pathname === set.prefix || pathname.startsWith(`${set.prefix}/`)
    if (matches && (!best || set.prefix.length > best.prefix.length)) best = set
  }
  return best?.items ?? LIVE_DEFAULT_ITEMS
}

/** 첫 화면 추천 한 줄 — 누르면 보낼 질문(시안은 시나리오 키도 함께). */
export interface HomeSuggestion {
  label: string
  risk: OrderRisk
  text: string
  scenario?: DemoScenarioKey
}

/** 첫 화면 추천 — 모드에 따라 시안 시나리오 또는 실제 모드 표에서 고른다. */
export function homeSuggestions(pathname: string, mode: "demo" | "live"): { screen: HomeSuggestion[]; ask: HomeSuggestion[] } {
  if (mode === "live") {
    const toItem = (item: AdminAiLiveSuggestion): HomeSuggestion => ({ label: item.label, risk: item.risk, text: item.prompt })
    return { screen: resolveLiveSuggestions(pathname).map(toItem), ask: LIVE_COMMON_ASK_ITEMS.map(toItem) }
  }
  const toItem = (item: AdminAiSuggestion): HomeSuggestion => ({ label: item.label, risk: item.risk, text: demoScenarioPrompt(item.scenario), scenario: item.scenario })
  return { screen: resolveAdminAiSuggestions(pathname).map(toItem), ask: COMMON_ASK_ITEMS.map(toItem) }
}
