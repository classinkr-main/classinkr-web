"use client"

import { Loader2, RotateCcw, X } from "lucide-react"

import type { SourceLinkUndoState } from "@/components/admin/crm/matching/useSourceLinkActions"

// 확정·제외 직후 한 줄 — "되돌리기"는 재검수(stale)로 보낸다(서버에 직전 상태 복원 경로가 없다).
// 매칭 인박스와 매출시트가 같은 마크업을 쓴다.
export function SourceLinkUndoNotice({
  undo,
  busy = false,
  onUndo,
  onDismiss,
  className = "",
}: {
  undo: SourceLinkUndoState | null
  busy?: boolean
  onUndo: () => void
  onDismiss: () => void
  className?: string
}) {
  if (!undo) return null
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-wrap items-center gap-2 border-l-2 border-[#D7EBDD] bg-[#ECFDF5]/60 px-3 py-2 text-[13px] text-[#084734] ${className}`}
    >
      <span>{undo.message}</span>
      <button
        type="button"
        onClick={onUndo}
        disabled={busy}
        title="재검수로 되돌립니다 — 처리 필요 목록에 다시 올라옵니다"
        className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#ECD29C] bg-[#FBF1E0] px-2 text-[12px] font-semibold text-[#7A520F] transition-colors hover:bg-[#ECD29C] disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
        되돌리기
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="알림 닫기"
        className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg text-[#084734]/60 hover:bg-[#D7EBDD]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
