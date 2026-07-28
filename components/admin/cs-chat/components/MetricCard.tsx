"use client"

import type { LucideIcon } from "lucide-react"

// 운영 데스크 지표 카드 행(계약 1)의 셀 — 값 정규화(null→"—")는 호출부(metricCards)에서 이미 끝낸다.
export default function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
}: {
  icon: LucideIcon
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-lg border border-black/[0.08] bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#F6F5F4] text-[#615D59]">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <p className="text-[11px] font-medium text-[#615D59]">{label}</p>
      </div>
      <p className="mt-2.5 text-[20px] font-semibold tracking-[-0.02em] text-[#31302E]">{value}</p>
      {sub ? <p className="mt-1 text-[10px] leading-4 text-[#A39E98]">{sub}</p> : null}
    </div>
  )
}
