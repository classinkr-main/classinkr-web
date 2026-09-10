// components/admin/number-input-guards.ts
// type="number" 인풋 공용 가드 — 어드민 입력 화면 전역에서 같은 방식을 쓰게 한 곳에 둔다.

import type { WheelEvent } from "react"

/**
 * 포커스된 number 인풋 위에서 스크롤하면 값이 조용히 바뀌는 브라우저 기본 동작을 차단한다.
 * (스크롤로 지표·예산이 바뀌어도 화면상 표시가 같아 보여 사용자가 알아채기 어렵다.)
 */
export function blurOnWheel(e: WheelEvent<HTMLInputElement>) {
  e.currentTarget.blur()
}
