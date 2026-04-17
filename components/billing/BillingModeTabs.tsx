"use client"

export type BillingMode = "subscription" | "business"

interface Props {
  mode: BillingMode
  onChange: (mode: BillingMode) => void
}

const TAB_META: Record<BillingMode, { title: string; caption: string }> = {
  subscription: {
    title: "구독형",
    caption: "Learning Space · USD 월/연 정기",
  },
  business: {
    title: "충전형",
    caption: "Business · CNY 선충전 후 사용",
  },
}

export function BillingModeTabs({ mode, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="결제 방식"
      className="grid grid-cols-2 overflow-hidden rounded-2xl border border-[rgba(8,71,52,0.1)] bg-white/90 shadow-sm backdrop-blur"
    >
      {(Object.keys(TAB_META) as BillingMode[]).map((key, idx) => {
        const active = key === mode
        const meta = TAB_META[key]

        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={`flex flex-col items-start gap-0.5 px-4 py-3 text-left transition-colors ${
              idx === 0 ? "border-r border-[rgba(8,71,52,0.1)]" : ""
            } ${
              active
                ? "bg-[#084734] text-white"
                : "bg-white text-[#44514A] hover:bg-[#F1F5F2]"
            }`}
          >
            <span className="text-sm font-semibold leading-tight">{meta.title}</span>
            <span
              className={`text-[11px] leading-tight ${
                active ? "text-white/70" : "text-[#7C8A83]"
              }`}
            >
              {meta.caption}
            </span>
          </button>
        )
      })}
    </div>
  )
}
