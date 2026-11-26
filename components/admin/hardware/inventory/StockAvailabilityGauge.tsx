import { formatNumber } from "./shared"
import type { ReactNode } from "react"

interface Props {
  warehouse: number
  available: number
  planned: number
  caption?: boolean
  annotation?: ReactNode
  // lg = 홈 카드용 굵은 막대 + 아래 범례(가용·예정 %). 기본(sm)은 기존 렌더 그대로.
  size?: "sm" | "lg"
}

/** 가용/창고 비율. 채워진 녹색은 가용, 나머지 황색은 예정 출고다. */
export default function StockAvailabilityGauge({ warehouse, available, planned, caption = true, annotation, size = "sm" }: Props) {
  const invalid = ![warehouse, available, planned].every(Number.isFinite) || warehouse < 0 || planned < 0 || available > warehouse
  const overbooked = !invalid && available < 0
  const ratio = !invalid && warehouse > 0 ? Math.max(0, Math.min(100, available / warehouse * 100)) : 0
  const label = invalid ? "원본 점검 필요" : overbooked ? `예정 초과 ${formatNumber(-available)}대` : warehouse === 0 ? "창고 재고 없음" : `가용률 ${Math.round(ratio)}%`
  const description = `창고 ${formatNumber(warehouse)}대 · 가용 ${formatNumber(available)}대 · 예정 ${formatNumber(planned)}대. ${label}`
  const segments = !invalid && warehouse > 0 ? <>
    <span aria-hidden className="h-full bg-[#084734]" style={{ width: `${ratio}%` }} />
    <span aria-hidden className={`h-full ${overbooked ? "bg-[#B43E3E]" : "bg-[#A8741A]"}`} style={{ width: `${100 - ratio}%` }} />
  </> : null

  if (size === "lg") {
    const availablePct = Math.round(ratio)
    return (
      <div className="space-y-2">
        {/* 원본 이상은 분홍 채움 대신 Danger 외곽선으로 — 채움 강조 지양 */}
        <div role="img" aria-label={description} title={description} className={`flex h-4 w-full overflow-hidden rounded-[5px] bg-[#EFEDEA] ${invalid ? "ring-1 ring-inset ring-[#B43E3E]" : ""}`}>
          {segments}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          {!invalid && !overbooked && warehouse > 0 ? (
            <p className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] tabular-nums text-[#31302E]">
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-[#084734]" />가용 {availablePct}%</span>
              <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-[2px] bg-[#A8741A]" />예정 {100 - availablePct}%</span>
            </p>
          ) : (
            <p className={`text-[12px] font-semibold tabular-nums ${invalid || overbooked ? "text-[#B43E3E]" : "text-[#615D59]"}`}>{label}</p>
          )}
          {annotation}
        </div>
      </div>
    )
  }

  return (
    <div className={caption ? "space-y-2" : "mt-2"}>
      {caption ? <div className="flex flex-wrap items-center justify-between gap-1"><p className={`text-[11px] font-semibold tabular-nums ${invalid || overbooked ? "text-[#B43E3E]" : "text-[#615D59]"}`}>{label}</p>{annotation}</div> : null}
      <div
        role="img"
        aria-label={description}
        title={description}
        className={`flex h-2 w-full overflow-hidden rounded-full ${invalid ? "bg-[#FCE9E9]" : "bg-[#E8E8E4]"}`}
      >
        {segments}
      </div>
    </div>
  )
}
