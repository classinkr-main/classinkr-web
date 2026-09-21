"use client"

// 확인 게이트 우회 토글 — 리드 보드(LeadsBoardClient)의 "미확인 포함" 버튼과 같은 이름·모양·UX.
// 기본은 규칙대로 숨기되, 서버가 센 숨긴 건수(summary.hiddenUnconfirmedCount)를 옆에 붙여
// 사용자가 한 번에 명시적으로 포함할 수 있게 한다(플레이북 04-growth-crm §3).

import { Check } from "lucide-react"

export default function UnconfirmedToggle({
  includeUnconfirmed,
  hiddenUnconfirmedCount,
  onToggle,
  className = "",
}: {
  includeUnconfirmed: boolean
  hiddenUnconfirmedCount: number
  onToggle: () => void
  className?: string
}) {
  // 숨긴 것도 없고 토글도 꺼져 있으면 보여줄 이유가 없다 — 켜져 있을 땐 끌 수 있게 항상 노출.
  if (!includeUnconfirmed && hiddenUnconfirmedCount <= 0) return null
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={includeUnconfirmed}
      title="공개 폼에서 들어와 아직 확인하지 않은 리드를 목록에 함께 표시합니다."
      className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium transition-colors ${
        includeUnconfirmed
          ? "bg-[#7A520F] text-white"
          : "border border-[#e8e8e4] bg-white text-[#1a1a1a]/60 hover:border-[#c8c8c4]"
      } ${className}`}
    >
      <Check className="h-3 w-3" />
      미확인 포함
      {hiddenUnconfirmedCount > 0 ? (
        <span className={`tabular-nums ${includeUnconfirmed ? "text-white/70" : "text-[#1a1a1a]/40"}`}>
          {hiddenUnconfirmedCount.toLocaleString("ko-KR")}
        </span>
      ) : null}
      {!includeUnconfirmed ? <span className="sr-only">건 숨김</span> : null}
    </button>
  )
}
