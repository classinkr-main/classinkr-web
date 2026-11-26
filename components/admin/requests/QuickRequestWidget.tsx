"use client"

import { MessageSquarePlus, X } from "lucide-react"
import Link from "next/link"
import { useEffect, useId, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { Button } from "@/components/ui/button"
import { ADMIN_REQUESTS_HREF } from "@/lib/admin/requests"
import { RequestForm } from "./RequestForm"

export default function QuickRequestWidget({ screen, screenLabel, onClose }: {
  screen: string
  screenLabel: string
  onClose: () => void
}) {
  const [submitted, setSubmitted] = useState(false)
  const titleId = useId()
  const panel = useRef<HTMLElement>(null)

  useEffect(() => {
    const target = submitted ? panel.current : panel.current?.querySelector("form")
    target?.focus()
  }, [submitted])

  return createPortal(
    <section
      id="admin-quick-request"
      ref={panel}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[65] flex max-h-[min(34rem,calc(100dvh-9rem))] w-[calc(100vw-1.5rem)] max-w-xs flex-col overflow-hidden rounded-xl border border-line-control bg-surface-sheet shadow-lg outline-none sm:right-5 lg:bottom-5 lg:max-h-[min(34rem,calc(100dvh-3rem))]"
      onKeyDown={(event) => {
        if (submitted && event.key === "Escape") onClose()
      }}
    >
      {submitted ? (
        <div className="grid gap-3 px-4 pb-4 pt-2">
          <div className="flex items-center justify-between gap-2">
            <h2 id={titleId} className="flex items-center gap-2 text-base font-bold text-fg-ink">
              <MessageSquarePlus className="size-5" aria-hidden="true" />
              빠른 요청
            </h2>
            <Button type="button" size="icon-md" variant="ghost" aria-label="빠른 요청 닫기" onClick={onClose}>
              <X aria-hidden="true" />
            </Button>
          </div>
          <p role="status" className="text-sm font-semibold text-fg-ink">요청이 접수되었습니다.</p>
          <Button asChild size="md" className="w-fit">
            <Link href={ADMIN_REQUESTS_HREF} onNavigate={onClose}>내 요청 보기</Link>
          </Button>
        </div>
      ) : (
        <RequestForm
          context={{ screen, testVersion: null, errorCode: null }}
          widget={{ screenLabel, titleId, onClose }}
          onSubmit={() => setSubmitted(true)}
        />
      )}
    </section>,
    document.body,
  )
}
