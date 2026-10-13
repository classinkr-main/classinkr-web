import { formatNumber } from "./shared"

interface Props {
  warehouse: number
  available: number
  planned: number
  caption?: boolean
}

/** 가용/창고 비율. 채워진 녹색은 가용, 나머지 황색은 예정 출고다. */
export default function StockAvailabilityGauge({ warehouse, available, planned, caption = true }: Props) {
  const invalid = ![warehouse, available, planned].every(Number.isFinite) || warehouse < 0 || planned < 0 || available > warehouse
  const overbooked = !invalid && available < 0
  const ratio = !invalid && warehouse > 0 ? Math.max(0, Math.min(100, available / warehouse * 100)) : 0
  const label = invalid ? "원장 점검 필요" : overbooked ? `예정 초과 ${formatNumber(-available)}대` : warehouse === 0 ? "창고 재고 없음" : `가용률 ${Math.round(ratio)}%`
  const description = `창고 ${formatNumber(warehouse)}대 · 가용 ${formatNumber(available)}대 · 예정 ${formatNumber(planned)}대. ${label}`

  return (
    <div className={caption ? "space-y-2" : "mt-2"}>
      {caption ? <p className={`text-[11px] font-semibold tabular-nums ${invalid || overbooked ? "text-[#B43E3E]" : "text-[#615D59]"}`}>{label}</p> : null}
      <div
        role="img"
        aria-label={description}
        title={description}
        className={`flex h-2 w-full overflow-hidden rounded-full ${invalid ? "bg-[#FCE9E9]" : "bg-[#E8E8E4]"}`}
      >
        {!invalid && warehouse > 0 ? <>
          <span aria-hidden className="h-full bg-[#084734]" style={{ width: `${ratio}%` }} />
          <span aria-hidden className={`h-full ${overbooked ? "bg-[#B43E3E]" : "bg-[#A8741A]"}`} style={{ width: `${100 - ratio}%` }} />
        </> : null}
      </div>
    </div>
  )
}
