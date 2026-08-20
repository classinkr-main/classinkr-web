"use client"

// 공용 기간 토글 — 캠페인 허브 4곳에 복제된 role="group"+aria-pressed 패턴의 공용화.
// 옵션 id 는 딥링크(useUrlState)와 결합되므로 호출부가 안정적 문자열을 넘긴다.
// 클래스는 app/admin/campaigns/page.tsx 기간 필터 버튼(2026-08-18) 그대로 이식 — 시각 회귀 방지가
// 목적이라 새 클래스를 짓지 않는다. page.tsx 자체는 이번 라운드에 교체하지 않는다(신규 요약 탭 전용).

export interface PeriodOption<K extends string = string> {
  id: K
  label: string
}

export function PeriodToggle<K extends string>({
  options,
  value,
  onChange,
  ariaLabel = "기간 선택",
}: {
  options: PeriodOption<K>[]
  value: K
  onChange: (next: K) => void
  ariaLabel?: string
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex shrink-0 rounded-lg border border-[rgba(0,0,0,0.08)] p-[3px] max-sm:mb-2"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={value === option.id}
          onClick={() => onChange(option.id)}
          className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
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
