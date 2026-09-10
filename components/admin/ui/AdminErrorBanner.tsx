"use client"

// 어드민 공용 오류 배너 — 갈라진 4종(red 채움·role 없음 / 이색 팔레트 / 흰 배경+빨간 점 /
// 좌측 보더)을 하나로 통일한다(2026-08-28 구조 감사 [2]).
// 규격: 지배적 관례(border-[#F6D5C5]·bg-[#FEF3EE]·text-[#B85C33]) + role="alert" 필수.
// 재시도가 가능한 실패에는 onRetry를 넘겨 배너 안에서 바로 복구 동선을 제공한다.

import type { ReactNode } from "react"
import { AlertTriangle } from "lucide-react"

export default function AdminErrorBanner({
  message,
  title,
  onRetry,
  retryLabel = "다시 시도",
  retryDisabled = false,
  className = "",
}: {
  message: ReactNode
  /** 짧은 맥락 라벨(예: "캘린더 오류"). 메시지 앞에 굵게 붙는다. */
  title?: string
  onRetry?: () => void
  retryLabel?: string
  retryDisabled?: boolean
  /** 배치 여백(mb-4 등)은 호출부가 소유한다. */
  className?: string
}) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-[12px] font-medium text-[#B85C33] ${className}`}
    >
      <span className="flex min-w-0 items-start gap-2">
        <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0">
          {title ? <strong className="mr-1.5 font-bold">{title}</strong> : null}
          {message}
        </span>
      </span>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={retryDisabled}
          className="shrink-0 rounded-lg border border-[#F6D5C5] bg-white px-3 py-1.5 text-[12px] font-bold text-[#B85C33] transition-colors hover:bg-[#FEF8F5] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  )
}
