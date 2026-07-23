import { KRW } from "./event-format"

export function FunnelStage({
  label,
  value,
  prevValue,
  tone = "neutral",
}: {
  label: string
  value: number
  prevValue?: number | null
  tone?: "neutral" | "primary"
}) {
  const rate =
    prevValue != null && prevValue > 0 && value > 0 ? Math.round((value / prevValue) * 100) : null
  const bar =
    prevValue != null && prevValue > 0
      ? Math.max(8, Math.min(100, Math.round((value / prevValue) * 100)))
      : value > 0
        ? 100
        : 8
  const accent = tone === "primary" ? "bg-[#084734]" : "bg-[#111110]"
  return (
    <div className="rounded-xl border border-[#e8e8e4] bg-white px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-medium text-[#1a1a1a]/50">{label}</p>
        {rate != null && (
          <span className="text-[10px] font-medium text-[#1a1a1a]/35">{rate}%</span>
        )}
      </div>
      <p className="mt-1 text-[18px] font-bold leading-none tracking-[-0.02em] text-[#111110]">
        {KRW.format(value)}
      </p>
      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[#f0f0ec]">
        <div className={`h-full ${accent}`} style={{ width: `${bar}%` }} />
      </div>
    </div>
  )
}
