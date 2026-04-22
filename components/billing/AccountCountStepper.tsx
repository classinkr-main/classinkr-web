"use client"

import { Minus, Plus } from "lucide-react"

import { ACCOUNT_COUNT_MAX, ACCOUNT_COUNT_MIN, clampAccountCount } from "@/lib/billing/plans"

interface Props {
  value: number
  onChange: (next: number) => void
}

export function AccountCountStepper({ value, onChange }: Props) {
  function step(delta: number) {
    onChange(clampAccountCount(value + delta))
  }

  return (
    <div className="inline-flex items-center rounded-lg border border-black/10 bg-white">
      <button
        type="button"
        aria-label="계정 수 감소"
        onClick={() => step(-1)}
        disabled={value <= ACCOUNT_COUNT_MIN}
        className="flex h-8 w-8 items-center justify-center text-[#44514A] transition-colors hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Minus className="h-3.5 w-3.5" />
      </button>

      <input
        type="number"
        inputMode="numeric"
        min={ACCOUNT_COUNT_MIN}
        max={ACCOUNT_COUNT_MAX}
        value={value}
        onChange={(event) => {
          const raw = Number.parseInt(event.target.value, 10)
          onChange(clampAccountCount(Number.isFinite(raw) ? raw : ACCOUNT_COUNT_MIN))
        }}
        className="h-8 w-12 border-x border-black/10 bg-white text-center text-[13px] font-semibold text-[#111110] focus:outline-none focus:ring-1 focus:ring-[#084734]"
      />

      <button
        type="button"
        aria-label="계정 수 증가"
        onClick={() => step(1)}
        disabled={value >= ACCOUNT_COUNT_MAX}
        className="flex h-8 w-8 items-center justify-center text-[#44514A] transition-colors hover:bg-[#F6F5F4] disabled:cursor-not-allowed disabled:opacity-30"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
