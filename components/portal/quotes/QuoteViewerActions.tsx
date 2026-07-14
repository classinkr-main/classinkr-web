"use client"

import { useState } from "react"
import { Check, Loader2, Printer, Send } from "lucide-react"

import { adminFetch } from "@/lib/admin-client"

type QuoteViewerActionsProps = {
  reviewEndpoint: string
  acceptEndpoint?: string
  authMode?: "public" | "admin"
  /**
   * 공개 공유 링크에서 true. 링크만 가진 제3자가 고객 명의로 상태를 변경하지 못하도록,
   * 수신자가 등록된 고객 이메일을 직접 입력해 신원을 증명하게 한다(서버에서 대조).
   * 이메일을 서버가 미리 채워 보내면 바인딩이 무력화되므로 반드시 사용자 입력을 받는다.
   */
  requireRecipientEmail?: boolean
  initialConfirmedAt?: string | null
  initialAcceptedAt?: string | null
  /**
   * false면 검토 확인·진행 요청 액션을 숨기고 출력(PDF)만 노출한다.
   * 열람 전용(access_mode "view") 공유 링크에서 사용한다.
   */
  showReviewActions?: boolean
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
  requireRecipientEmail = false,
  initialConfirmedAt = null,
  initialAcceptedAt = null,
  showReviewActions = true,
}: QuoteViewerActionsProps) {
  const [confirmedAt, setConfirmedAt] = useState<string | null>(initialConfirmedAt)
  const [acceptedAt, setAcceptedAt] = useState<string | null>(initialAcceptedAt)
  const [submittingAction, setSubmittingAction] = useState<"review" | "accept" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [recipientEmail, setRecipientEmail] = useState("")

  const confirmedLabel = formatActionAt(confirmedAt)
  const acceptedLabel = formatActionAt(acceptedAt)

  // 공유 링크에서는 수신자 이메일 입력을 요청 본문에 함께 보낸다(서버 대조용).
  function buildRequestInit(): RequestInit {
    const init: RequestInit = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }
    if (requireRecipientEmail) {
      init.body = JSON.stringify({ recipientEmail: recipientEmail.trim() })
    }
    return init
  }

  function ensureRecipientEmail(): boolean {
    if (!requireRecipientEmail) return true
    if (!recipientEmail.trim()) {
      setError("견적서를 받으신 이메일 주소를 입력해 주세요.")
      return false
    }
    return true
  }

  async function handleConfirm() {
    if (submittingAction || confirmedAt) return

    if (!ensureRecipientEmail()) return

    setSubmittingAction("review")
    setError(null)

    try {
      const fetcher = authMode === "admin" ? adminFetch : fetch
      const response = await fetcher(reviewEndpoint, buildRequestInit())
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
    if (!ensureRecipientEmail()) return

    setSubmittingAction("accept")
    setError(null)

    try {
      const fetcher = authMode === "admin" ? adminFetch : fetch
      const response = await fetcher(acceptEndpoint, buildRequestInit())
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

  const actionsDisabled =
    Boolean(submittingAction) || (requireRecipientEmail && !recipientEmail.trim())

  return (
    <div className="print:hidden">
      {showReviewActions && requireRecipientEmail && !(confirmedAt && acceptedAt) ? (
        <div className="mb-3 flex flex-col gap-1 sm:items-end">
          <label htmlFor="recipient-email" className="text-xs text-[#1a1a1a]/55">
            확인을 위해 견적서를 받으신 이메일을 입력해 주세요
          </label>
          <input
            id="recipient-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
            placeholder="name@company.com"
            className="min-h-10 w-full rounded-md border border-black/8 bg-white px-3 py-2 text-sm text-[#1a1a1a] outline-none transition-colors focus:border-[#084734] sm:w-72"
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {showReviewActions ? (
          <button
            type="button"
            onClick={handleConfirm}
            disabled={actionsDisabled || Boolean(confirmedAt)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-[#084734] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#065c41] disabled:cursor-not-allowed disabled:bg-[#D1FAE5] disabled:text-[#084734]"
          >
            {submittingAction === "review" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {confirmedAt ? "확인 완료" : "확인"}
          </button>
        ) : null}
        {showReviewActions && acceptEndpoint ? (
          <button
            type="button"
            onClick={handleAccept}
            disabled={actionsDisabled || Boolean(acceptedAt)}
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
      {showReviewActions && confirmedLabel ? (
        <p className="mt-2 text-right text-xs text-[#084734]">{confirmedLabel} 확인됨</p>
      ) : null}
      {showReviewActions && acceptedLabel ? (
        <p className="mt-1 text-right text-xs text-[#084734]">{acceptedLabel} 진행 요청됨</p>
      ) : null}
      {showReviewActions && error ? <p className="mt-2 text-right text-xs text-[#B85C33]">{error}</p> : null}
    </div>
  )
}
