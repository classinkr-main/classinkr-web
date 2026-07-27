import type { ReactNode } from "react"
import type { PublicEvent } from "@/lib/types/public-events"
import { formatRange, statusTone } from "./event-format"

export function EventCardHeader({
  event,
  actions,
}: {
  event: PublicEvent
  actions?: ReactNode
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${statusTone(event.status)}`}
          >
            {event.status}
          </span>
          <span className="rounded-full bg-[#f0f0ec] px-2 py-0.5 text-[11px] font-medium text-[#1a1a1a]/55">
            {event.category}
          </span>
          {event.tag && (
            <span className="rounded-full bg-[#FEF3EE] px-2 py-0.5 text-[11px] font-medium text-[#B85C33]">
              {event.tag}
            </span>
          )}
        </div>
        <h3 className="truncate text-[15px] font-bold tracking-[-0.01em] text-[#111110]">
          {event.title}
        </h3>
        <p className="mt-0.5 text-[11px] text-[#1a1a1a]/45">
          {formatRange(event.startsAt, event.endsAt)}
          {event.location ? ` · ${event.location}` : ""}
        </p>
      </div>
      {actions && <div className="shrink-0">{actions}</div>}
    </div>
  )
}
