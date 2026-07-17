"use client"

import { cny, cnyExact } from "@/lib/branch/money-format"

// 축약 금액(억/만) + 호버 시 원값 전체 자릿수. 2026-07-17 사용성 디벨롭 항목 1 —
// 표시 레이어 전용, 집계·계산 로직은 건드리지 않는다. 시안:
// docs/active/mockups/branch-usability-accuracy-2026-07-17.html (.money/.tip)
export default function MoneyValue({
  value,
  prefix = "¥",
}: {
  value: number | null | undefined
  prefix?: string
}) {
  const exact = `${prefix}${cnyExact(value)}`
  return (
    <span
      className="group/money relative cursor-help border-b border-dashed border-black/25"
      title={exact}
    >
      {prefix}
      {cny(value)}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-[calc(100%+8px)] z-20 whitespace-nowrap rounded-lg bg-[#111110] px-3 py-2 text-[12px] font-semibold text-white opacity-0 shadow-[0_8px_24px_rgba(0,0,0,0.25)] transition-opacity duration-150 group-hover/money:opacity-100"
      >
        {exact}
        <small className="mt-0.5 block text-[10.5px] font-medium text-[#B9B5AF]">
          시트 원값 · 반올림 없음
        </small>
      </span>
    </span>
  )
}
