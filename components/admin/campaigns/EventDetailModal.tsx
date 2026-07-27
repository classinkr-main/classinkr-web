import Link from "next/link"
import { ExternalLink, X } from "lucide-react"
import { EventCardHeader } from "./EventCardHeader"
import { EventDetailContent } from "./EventDetailContent"
import type { EventMetrics } from "@/lib/types/event-metrics"
import type { PublicEvent } from "@/lib/types/public-events"

export function EventDetailModal({
  event,
  metrics,
  attributedLeadCount,
  duringLeadCount,
  onClose,
  onEdit,
}: {
  event: PublicEvent
  metrics: EventMetrics
  attributedLeadCount: number
  duringLeadCount: number
  onClose: () => void
  onEdit: () => void
}) {
  const publicHref = event.slug ? `/events/${event.slug}` : null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <EventCardHeader event={event} />
          </div>
          <button onClick={onClose} aria-label="닫기" className="shrink-0 text-[#1a1a1a]/40 hover:text-[#111110]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {publicHref && (
          <div className="shrink-0 border-b border-[#e8e8e4] px-4 py-3 sm:px-6">
            <Link
              href={publicHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#063d2a]"
            >
              홈페이지에서 보기
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <EventDetailContent
            event={event}
            metrics={metrics}
            attributedLeadCount={attributedLeadCount}
            duringLeadCount={duringLeadCount}
          />
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-[#e8e8e4] px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:gap-3 sm:px-6">
          <button onClick={onClose} className="px-4 py-2 text-[13px] text-[#1a1a1a]/55 hover:text-[#111110]">
            닫기
          </button>
          <button
            onClick={onEdit}
            className="rounded-lg bg-[#111110] px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#084734]"
          >
            성과 입력
          </button>
        </div>
      </div>
    </div>
  )
}
