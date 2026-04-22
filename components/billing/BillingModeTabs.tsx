"use client"

export type BillingMode = "subscription" | "business"

interface Props {
  mode: BillingMode
  onChange: (mode: BillingMode) => void
}

const TAB_META: Record<BillingMode, { title: string; caption: string }> = {
  subscription: {
    title: "구독형",
    caption: "Learning Space · USD",
  },
  business: {
    title: "충전형",
    caption: "Business · CNY",
  },
}

export function BillingModeTabs({ mode, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="결제 방식"
      className="inline-flex gap-2"
    >
      {(Object.keys(TAB_META) as BillingMode[]).map((key) => {
        const active = key === mode
        const meta = TAB_META[key]

        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-left transition-colors ${
              active
                ? "border-[#084734] bg-white text-[#084734]"
                : "border-[rgba(0,0,0,0.08)] bg-white text-[#66726B] hover:border-[#084734]/30"
            }`}
          >
            <span className="text-sm font-semibold">{meta.title}</span>
            <span className={`text-[11px] ${active ? "text-[#084734]/60" : "text-[#7C8A83]"}`}>
              {meta.caption}
            </span>
          </button>
        )
      })}
    </div>
  )
}
