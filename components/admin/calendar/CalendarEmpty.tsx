"use client"

import { CalendarDays } from "lucide-react"

/**
 * 캘린더 도메인 공용 빈 상태 — 문구 4종("일정 없음"/"예정된 일정 없음"/
 * "이 기간에 …"/무문구)이 화면마다 달랐던 것을 한 컴포넌트로 통일한다(2026-08-19).
 * "왜 비었는지"는 이 컴포넌트의 몫이 아니다 — 연결이 끊긴 경우는 수리 패널이 말한다.
 */
export function CalendarEmpty({
  message,
  hint,
  compact = false,
}: {
  message: string
  hint?: string
  /** 우측 레일처럼 좁은 자리는 아이콘 없이 낮게 */
  compact?: boolean
}) {
  return (
    <div className={`text-center ${compact ? "py-8" : "py-16"}`}>
      {!compact && <CalendarDays className="mx-auto mb-2 h-8 w-8 text-[#1a1a1a]/15" />}
      <p className="text-[13px] text-[#1a1a1a]/30">{message}</p>
      {hint && <p className="mt-1 text-[11px] text-[#1a1a1a]/25">{hint}</p>}
    </div>
  )
}
