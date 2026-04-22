"use client"

export type BillingMode = "subscription" | "business"

interface Props {
  mode: BillingMode
  onChange: (mode: BillingMode) => void
}

const TABS: Array<{ id: BillingMode; title: string; caption: string }> = [
  { id: "subscription", title: "구독형", caption: "USD 월/연 정기" },
  { id: "business", title: "충전형", caption: "CNY 선충전" },
]

export function BillingModeTabs({ mode, onChange }: Props) {
  return (
    <div role="tablist" aria-label="결제 방식" className="flex gap-6 border-b border-black/10">
      {TABS.map((tab) => {
        const active = tab.id === mode
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`relative flex flex-col items-start gap-0.5 pb-3 pt-1 text-left transition-colors ${
              active ? "text-[#111110]" : "text-[#7C8A83] hover:text-[#44514A]"
            }`}
          >
            <span className="text-[15px] font-semibold">{tab.title}</span>
            <span className="text-[12px] text-[#7C8A83]">{tab.caption}</span>
            {active ? (
              <span className="absolute inset-x-0 -bottom-px h-px bg-[#084734]" />
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
