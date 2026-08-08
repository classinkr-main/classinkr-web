"use client"

import { useRef } from "react"
import Link from "next/link"
import { ExternalLink, X } from "lucide-react"
import { useDialogFocus } from "@/components/admin/use-dialog-focus"
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

  // 접근성 — 열릴 때 닫기 버튼으로 포커스 이동, Escape 닫기 + Tab 트랩, 닫히면 이전 포커스 복귀.
  // (AdLeadImportDialog와 동일 패턴. openKey에 event.id — 다른 행사로 바뀌면 포커스 재캡처.)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  useDialogFocus(event.id, onClose, closeButtonRef)

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`행사 상세: ${event.title}`}
        className="flex max-h-[calc(100dvh-1rem)] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90vh] sm:rounded-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[#e8e8e4] px-4 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <EventCardHeader event={event} />
          </div>
          <button
            ref={closeButtonRef}
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 text-[#1a1a1a]/40 hover:text-[#111110]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {publicHref && (
          <div className="shrink-0 border-b border-[#e8e8e4] px-4 py-3 sm:px-6">
            <Link
              href={publicHref}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41]"
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
            className="rounded-lg bg-[#084734] px-5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#065c41]"
          >
            성과 입력
          </button>
        </div>
      </div>
    </div>
  )
}
