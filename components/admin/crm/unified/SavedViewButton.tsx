"use client"

// 저장 보기 칩 버튼. CrmUnifiedCustomersClient.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { SAVED_VIEW_FILTERS, type SavedViewFilter } from "./shared"

export default function SavedViewButton({
  filter,
  active,
  disabled,
  count,
  currentOwnerCount,
  onSelect,
}: {
  filter: (typeof SAVED_VIEW_FILTERS)[number]
  active: boolean
  disabled: boolean
  count: number | undefined
  currentOwnerCount: number
  onSelect: (view: SavedViewFilter) => void
}) {
  const label =
    filter.key === "my_owner"
      ? `${filter.label}${currentOwnerCount ? ` ${currentOwnerCount}` : ""}`
      : count != null
        ? `${filter.label} ${count}`
        : filter.label

  return (
    <button
      type="button"
      onClick={() => onSelect(filter.key)}
      disabled={disabled}
      aria-pressed={active}
      title={disabled ? "현재 Admin 계정에 CRM 담당자 매핑이 없습니다." : filter.description}
      className={`h-8 shrink-0 border-b-2 px-2 text-[12px] font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#084734] ${
        active
          ? "border-[#084734] text-[#084734]"
          : disabled
            ? "border-transparent text-[#A39E98]"
            : "border-transparent text-[#615D59] hover:border-[#084734]/25 hover:text-[#084734]"
      }`}
    >
      {label}
    </button>
  )
}
