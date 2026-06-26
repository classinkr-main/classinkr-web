"use client"

import { useState } from "react"
import { Check, Loader2, Printer, Send } from "lucide-react"

import { adminFetch } from "@/lib/admin-client"

type QuoteViewerActionsProps = {
  reviewEndpoint: string
  acceptEndpoint?: string
  authMode?: "public" | "admin"
  initialConfirmedAt?: string | null
  initialAcceptedAt?: string | null
}

function formatActionAt(value: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export default function QuoteViewerActions({
  reviewEndpoint,
  acceptEndpoint,
  authMode = "public",
  initialConfirmedAt = null,
  initialAcceptedAt = null,
}: QuoteViewerActionsProps) {
  const [confirmedAt, setConfirmedAt] = useState<string | null>(initialConfirmedAt)
  const [acceptedAt, setAcceptedAt] = useState<string | null>(initialAcceptedAt)
  const [submittingAction, setSubmittingAction] = useState<"review" | "accept" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const confirmedLabel = formatActionAt(confirmedAt)
  const acceptedLabel = formatActionAt(acceptedAt)

  async function handleConfirm() {
    if (submittingAction || confirmedAt) return

    setSubmittingAction("review")
    setError(null)

    try {
      const fetcher = authMode === "admin" ? adminFetch : fetch
      const response = await fetcher(reviewEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const payload = (await response.json().catch(() => null)) as
        | { confirmedAt?: string; error?: string }
        | null

      if (!response.ok || !payload?.confirmedAt) {
        throw new Error(payload?.error ?? "확인 기록을 저장하지 못했습니다.")
      }

      setConfirmedAt(payload.confirmedAt)
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "확인 기록을 저장하지 못했습니다.")
    } finally {
      setSubmittingAction(null)
    }
  }

  async function handleAccept() {
    if (!acceptEndpoint || submittingAction || acceptedAt) return

    setSubmittingAction("accept")
    setError(null)

    try {
      const fetcher = authMode === "admin" ? adminFetch : fetch
      const response = await fetcher(acceptEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const payload = (await response.json().catch(() => null)) as
        | { acceptedAt?: string; error?: string }
        | null

      if (!response.ok || !payload?.acceptedAt) {
        throw new Error(payload?.error ?? "진행 요청을 저장하지 못했습니다.")
      }

      setAcceptedAt(payload.acceptedAt)
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : "진행 요청을 저장하지 못했습니다.")
    } finally {
      setSubmittingAction(null)
    }
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="print:hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={Boolean(submittingAction) || Boolean(confirmedAt)}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#084734] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#065c41] disabled:cursor-not-allowed disabled:bg-[#D1FAE5] disabled:text-[#084734]"
        >
          {submittingAction === "review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          {confirmedAt ? "확인 완료" : "확인"}
        </button>
        {acceptEndpoint ? (
          <button
            type="button"
            onClick={handleAccept}
            disabled={Boolean(submittingAction) || Boolean(acceptedAt)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#084734] bg-white px-4 py-2 text-sm font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5] disabled:cursor-not-allowed disabled:border-[#D1FAE5] disabled:bg-[#ECFDF5] disabled:text-[#084734]"
          >
            {submittingAction === "accept" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {acceptedAt ? "진행 요청 완료" : "이 견적으로 진행 요청"}
          </button>
        ) : null}
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-[#d8d6cf] bg-white px-4 py-2 text-sm font-semibold text-[#1a1a1a]/70 transition-colors hover:border-[#084734] hover:text-[#084734]"
        >
          <Printer className="h-4 w-4" />
          출력(PDF)
        </button>
      </div>
      {confirmedLabel ? (
        <p className="mt-2 text-right text-xs text-[#084734]">{confirmedLabel} 확인됨</p>
      ) : null}
      {acceptedLabel ? (
        <p className="mt-1 text-right text-xs text-[#084734]">{acceptedLabel} 진행 요청됨</p>
      ) : null}
      {error ? <p className="mt-2 text-right text-xs text-[#B85C33]">{error}</p> : null}
    </div>
  )
}
