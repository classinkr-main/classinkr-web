// AI 운영 액션 → 본사 주간 보고서 구획 매핑(순수 함수). 왼쪽 "이번 주 할 일" 목록과 보고서 ② 자세히 보기가 같은 규칙을 쓴다.
//   module KA → 三(ka) · market → 四(market) · partner·other → 五(other)
//   단, 제목·근거에 회수/수금/입금/결제 예정/回款/收款이 있으면 모듈과 무관하게 二(collect)
//   module이 없는 옛 캐시는 텍스트로 module을 추정한다(classifyReportModule).
import type { ReportModule } from "./weekly-report-contract"

export type SectionKey = "perf" | "collect" | "ka" | "market" | "other"
export const SECTION_KEYS: readonly SectionKey[] = ["perf", "collect", "ka", "market", "other"]

/** 목록 그룹 — 모듈 + 회수 예외. */
export type ActionGroupKey = "KA" | "market" | "collect" | "partner" | "other"
export const ACTION_GROUP_ORDER: readonly ActionGroupKey[] = ["KA", "market", "collect", "partner", "other"]

export interface SectionAction { title: string; why?: string; module?: ReportModule }

const COLLECT_PATTERN = /회수|수금|입금|결제 예정|回款|收款/

/** 모듈이 없는 옛 캐시용 텍스트 분류. */
export function classifyReportModule(text: string): ReportModule {
  if (/KA|핵심 고객|대형|계약|追加|추가 구매/i.test(text)) return "KA"
  if (/설명회|세미나|행사|캠페인|광고|박람회|沙龙|说明会|活动|Meta/i.test(text)) return "market"
  if (/파트너|공립|공교육|교육청|총판|채널|合作|公立/i.test(text)) return "partner"
  return "other"
}

export function actionGroup(action: SectionAction): ActionGroupKey {
  const text = `${action.title} ${action.why ?? ""}`
  if (COLLECT_PATTERN.test(text)) return "collect"
  return action.module ?? classifyReportModule(text)
}

export function groupSection(group: ActionGroupKey): SectionKey {
  switch (group) {
    case "collect": return "collect"
    case "KA": return "ka"
    case "market": return "market"
    default: return "other"
  }
}

export function actionSection(action: SectionAction): SectionKey {
  return groupSection(actionGroup(action))
}

/** 왼쪽 목록 그룹 머리 — 모듈 라벨 + 연결 구획 번호. */
export const GROUP_LABEL: Record<ActionGroupKey, string> = {
  KA: "KA · 三",
  market: "마케팅 활동 · 四",
  collect: "회수 · 二",
  partner: "파트너·공교육 · 五",
  other: "기타 · 五",
}
