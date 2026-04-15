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
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="계정 수 감소"
        onClick={() => step(-1)}
        disabled={value <= ACCOUNT_COUNT_MIN}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(8,71,52,0.12)] bg-white text-[#084734] transition-colors hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-40"
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
        className="h-9 w-16 rounded-xl border border-[rgba(8,71,52,0.12)] bg-white text-center text-sm font-semibold text-[#111110] focus:border-[#084734] focus:outline-none"
      />

      <button
        type="button"
        aria-label="계정 수 증가"
        onClick={() => step(1)}
        disabled={value >= ACCOUNT_COUNT_MAX}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(8,71,52,0.12)] bg-white text-[#084734] transition-colors hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>

      <span className="text-xs text-[#7C8A83]">계정</span>
    </div>
  )
}
