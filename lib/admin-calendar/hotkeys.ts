/**
 * hotkeys.ts — 캘린더 단축키 해석
 *
 * 키보드 이벤트를 액션으로 바꾸는 순수 함수만 둔다. `keydown`을 구독해 이 함수의
 * 결과로 분기하는 훅은 page.tsx(오케스트레이터)가 얇게 감싼다 — 여기서 훅으로
 * 만들면 jsdom 없이는 테스트를 못 돌린다. `target`은 실제 DOM 요소가 아니라 평이한
 * 객체({ tagName: "INPUT" } 등)로도 판정할 수 있어야 하므로 `unknown`으로 받는다.
 */
import type { CalendarViewId } from "./range"

export type CalendarHotkeyAction =
  | { kind: "step"; direction: 1 | -1 }
  | { kind: "today" }
  | { kind: "view"; view: CalendarViewId }
  | { kind: "create" }
  | { kind: "search" }

/** 단축키 한 글자 → 전환할 뷰. m=월 w=주 a=담당자 l=목록(agenda) d=타임라인. */
const VIEW_HOTKEYS = new Map<string, CalendarViewId>([
  ["m", "month"],
  ["w", "week"],
  ["a", "assignee"],
  ["l", "agenda"],
  ["d", "timeline"],
])

/** 이 태그 위에서는 단축키를 죽인다 — 폼 입력 중에 뷰가 바뀌면 안 된다. */
const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"])

/** target을 안전하게 좁혀 "편집 가능한 요소" 여부만 판정한다. DOM이 아니어도 죽지 않는다. */
function isEditableTarget(target: unknown): boolean {
  if (typeof target !== "object" || target === null) return false
  const el = target as { tagName?: unknown; isContentEditable?: unknown }
  if (el.isContentEditable === true) return true
  return typeof el.tagName === "string" && EDITABLE_TAGS.has(el.tagName.toUpperCase())
}

/**
 * 키 이벤트 → 액션. 처리 대상이 아니면 null.
 *
 * meta/ctrl/alt 조합은 항상 무시한다(브라우저·OS 단축키를 가로채지 않는다).
 * shift는 별도로 막지 않는다 — "T"(today)처럼 `event.key` 자체가 이미 대문자로
 * 올라오는 경우가 있어, 대문자 형태를 매핑에서 직접 받는다.
 */
export function resolveHotkey(event: {
  key: string
  metaKey?: boolean
  ctrlKey?: boolean
  altKey?: boolean
  shiftKey?: boolean
  target?: unknown
}): CalendarHotkeyAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null
  if (isEditableTarget(event.target)) return null

  if (event.key === "ArrowLeft") return { kind: "step", direction: -1 }
  if (event.key === "ArrowRight") return { kind: "step", direction: 1 }
  if (event.key === "t" || event.key === "T") return { kind: "today" }
  if (event.key === "n") return { kind: "create" }
  if (event.key === "/") return { kind: "search" }

  const view = VIEW_HOTKEYS.get(event.key)
  if (view) return { kind: "view", view }

  return null
}
