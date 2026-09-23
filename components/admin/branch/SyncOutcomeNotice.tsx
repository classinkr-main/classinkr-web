"use client"

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react"

import type { SyncOutcomeNotice as SyncOutcomeNoticeValue } from "@/lib/admin/sync-outcome"

// 동기화 버튼의 결과 한 줄(라운드 5 S-1·S-3) — lib/admin/sync-outcome의 describeSyncOutcome 결과를 그린다.
// 오류 톤은 화면마다 이미 있는 빨간 오류 배너가 맡으므로 여기서는 성공·안내·경고만 그린다.
// 색은 DESIGN.md 운영 상태 스케일(Success·Warning)과 웜 뉴트럴만 쓴다 — 새 색 없음.
const TONE_CLASS: Record<Exclude<SyncOutcomeNoticeValue["tone"], "error">, string> = {
  success: "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]",
  info: "border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] text-[#31302E]",
  warning: "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]",
}

export function SyncOutcomeNotice({
  notice,
  onDismiss,
  className = "",
}: {
  notice: SyncOutcomeNoticeValue | null
  onDismiss?: () => void
  className?: string
}) {
  if (!notice || notice.tone === "error") return null
  const Icon = notice.tone === "success" ? CheckCircle2 : notice.tone === "warning" ? AlertTriangle : Info
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[12px] font-semibold ${TONE_CLASS[notice.tone]} ${className}`}
    >
      <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 leading-relaxed">{notice.message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="알림 닫기"
          className="-my-1 -mr-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md opacity-70 transition hover:bg-black/5 hover:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#084734]"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  )
}
