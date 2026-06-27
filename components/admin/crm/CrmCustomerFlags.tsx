import { FLAG_META, type CustomerFlag } from "@/lib/crm/customer-flags"

// 고객 플래그 pill 묶음 — 리스트·큐·360에서 동일 어휘로 재사용.
export default function CrmCustomerFlags({
  flags,
  max,
  className,
}: {
  flags: CustomerFlag[]
  max?: number
  className?: string
}) {
  if (flags.length === 0) return null
  const shown = max != null ? flags.slice(0, max) : flags
  const hidden = flags.length - shown.length

  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className ?? ""}`}>
      {shown.map((flag) => {
        const meta = FLAG_META[flag]
        return (
          <span
            key={flag}
            className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold leading-none"
            style={{ backgroundColor: meta.bg, color: meta.color, borderColor: meta.border }}
          >
            {meta.label}
          </span>
        )
      })}
      {hidden > 0 ? <span className="text-[10px] font-semibold text-[#1a1a1a]/35">+{hidden}</span> : null}
    </span>
  )
}
