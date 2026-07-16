"use client"

import type { Dispatch, SetStateAction } from "react"

import {
  formatNumber,
  MOVEMENT_LABEL,
  type HardwareMovement,
} from "./shared"

interface VoidConfirmModalProps {
  voidTarget: HardwareMovement
  voidingId: string | null
  setVoidTarget: Dispatch<SetStateAction<HardwareMovement | null>>
  voidReason: string
  setVoidReason: Dispatch<SetStateAction<string>>
  confirmVoid: () => Promise<void>
}

export default function VoidConfirmModal({
  voidTarget,
  voidingId,
  setVoidTarget,
  voidReason,
  setVoidReason,
  confirmVoid,
}: VoidConfirmModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/35 px-3 py-4 backdrop-blur-[2px] sm:items-center"
      onClick={() => voidingId == null && setVoidTarget(null)}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="기록 취소"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_12px_32px_rgba(0,0,0,0.12)]"
      >
        <div className="border-b border-[rgba(0,0,0,0.08)] px-5 py-4">
          <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">기록 취소</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-[#615D59]">
            {voidTarget.product_name} · {MOVEMENT_LABEL[voidTarget.movement_type]} {formatNumber(voidTarget.quantity)}대를 취소합니다. 되돌릴 수 없습니다.
          </p>
        </div>
        <div className="px-5 py-4">
          <label className="block">
            <span className="text-[11px] font-bold text-[#615D59]">취소 사유 (선택)</span>
            <input
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              autoFocus
              placeholder="예: 중복 입력"
              className="mt-1 h-10 w-full rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[13px] text-[#111110] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/15"
            />
          </label>
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={() => setVoidTarget(null)}
            disabled={voidingId != null}
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-4 text-[13px] font-bold text-[#31302E] transition hover:bg-[#F6F5F4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={() => void confirmVoid()}
            disabled={voidingId != null}
            className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-[#B43E3E] px-4 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#9A3434] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B43E3E]/40 active:scale-[0.98] motion-reduce:active:scale-100 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {voidingId != null ? "취소 중" : "기록 취소"}
          </button>
        </div>
      </section>
    </div>
  )
}
