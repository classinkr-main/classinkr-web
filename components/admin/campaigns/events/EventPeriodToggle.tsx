"use client"

import type { Period } from "@/components/admin/campaigns/tabs/types"

// 행사 기간 필터(진행중·예정 / 30일 / 90일 / 전체) — 허브 탭 띠에 떠 있던 것을 2026-09-14 행사 섹션
// 안으로 내렸다. perf 기간(?perf=)과는 별개 축이다: 행사 수기 집계는 "행사 종료일" 기준으로 자른다.

const OPTIONS: ReadonlyArray<{ id: Period; label: string }> = [
  { id: "active", label: "진행중·예정" },
  { id: "30d", label: "30일" },
  { id: "90d", label: "90일" },
  { id: "all", label: "전체" },
]

export function EventPeriodToggle({
  value,
  onChange,
}: {
  value: Period
  onChange: (next: Period) => void
}) {
  return (
    <div className="inline-flex shrink-0 rounded-lg border border-[rgba(0,0,0,0.08)] p-[3px]" role="group" aria-label="행사 기간 필터">
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
            value === option.id ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
