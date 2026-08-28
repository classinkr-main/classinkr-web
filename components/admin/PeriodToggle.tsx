"use client"

// 공용 기간 토글 — 캠페인 허브 4곳에 복제된 role="group"+aria-pressed 패턴의 공용화.
// 옵션 id 는 딥링크(useUrlState)와 결합되므로 호출부가 안정적 문자열을 넘긴다.
// 클래스는 app/admin/campaigns/page.tsx 기간 필터 버튼(2026-08-18) 그대로 이식 — 시각 회귀 방지가
// 목적이라 새 클래스를 짓지 않는다. page.tsx 자체는 이번 라운드에 교체하지 않는다(신규 요약 탭 전용).

import { cn } from "@/lib/utils"

export interface PeriodOption<K extends string = string> {
  id: K
  label: string
}

export function PeriodToggle<K extends string>({
  options,
  value,
  onChange,
  ariaLabel = "기간 선택",
  className,
}: {
  options: readonly PeriodOption<K>[]
  value: K
  onChange: (next: K) => void
  ariaLabel?: string
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      // max-sm:mb-2 는 page.tsx 원본이 놓인 배치 문맥(필터 줄바꿈)의 마진이라 공용 기본값에서 뺐다 —
      // 필요한 호출부가 className 으로 얹는다(cn 이 뒤에 병합, 없으면 기본 클래스 그대로).
      className={cn("inline-flex shrink-0 rounded-lg border border-[rgba(0,0,0,0.08)] p-[3px]", className)}
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`min-h-11 rounded-md px-3 py-1.5 text-[12px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 sm:min-h-0 ${
            value === option.id
              ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]"
              : "text-[#615D59]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
