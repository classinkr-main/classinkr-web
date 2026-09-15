import type { DraftConfidence } from "./shared"

// 매트릭스 셀 확도 단축키 — 순수 판정(useMatrixEditor가 편집·선택 keydown에서 쓴다).
// 시트는 글자색 한 번이면 끝나는 확도 변경이 장부에선 팝오버 마우스 클릭이었다(2026-09-14).
// 한글 자판에서도 되도록 물리 키(event.code)로 판정한다. Ctrl/Cmd/Alt 조합(Ctrl+C 복사 등)과
// IME 조합 중 입력은 가로채지 않는다. 금액 입력 버퍼는 숫자만 받으므로 문자 키와 겹치지 않는다.

const SHORTCUTS: Record<string, DraftConfidence> = {
  KeyE: "expected",
  KeyH: "high-confidence",
  KeyC: "confirmed",
}

export const CONFIDENCE_SHORTCUT_HINT = "E 예정 · H 고확도 · C 확정"

export function confidenceFromShortcut(event: {
  code: string
  ctrlKey: boolean
  metaKey: boolean
  altKey: boolean
  isComposing?: boolean
}): DraftConfidence | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return null
  return SHORTCUTS[event.code] ?? null
}
