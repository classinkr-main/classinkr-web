"use client"

import { Check, Loader2 } from "lucide-react"

import { STATUS_TONE_TEXT_CLASS } from "@/lib/crm/status-tone"

/**
 * 필드 단위 인라인 저장 상태 캡션 — 상태 버튼·담당자 select·딜 행처럼 "바꾸면 바로 저장" 되는 컨트롤 옆에 둔다.
 *
 *  - 항상 마운트된 aria-live="polite" 영역이라 상태 전이(저장 중 → 저장됨/실패)가 SR 에 통지된다.
 *    필드 옆 캡션이므로 polite 로 고정한다. 화면 수준 실패(role="alert")는 CrmNoticeBanner 가 맡는다.
 *  - `failed` 는 danger 토큰 텍스트 + "다시 시도" 버튼(`onRetry` 가 있을 때). 자동 소멸하지 않는다.
 *  - `saved` 는 소비처가 타이머로 `idle` 로 돌리거나 그대로 둔다 — 여기서는 시간을 다루지 않는다.
 *  - 컨트롤에는 `aria-describedby={id}` 로 연결한다.
 *
 * 사용:
 *   <select aria-describedby="lead-owner-save" … />
 *   <SaveStateCaption id="lead-owner-save" state={ownerSave} onRetry={() => void saveOwner(pendingOwner)} />
 */
export type SaveState = "idle" | "saving" | "saved" | "failed"

export interface SaveStateCaptionProps {
  state: SaveState
  /** idle 일 때 보일 안내. 없으면 idle 은 빈 캡션(영역은 유지). */
  idleText?: string
  /** 실패 문구. 기본: "저장되지 않았습니다". onRetry 가 있으면 뒤에 재시도 버튼이 붙는다. */
  failedText?: string
  onRetry?: () => void
  id?: string
  className?: string
}

export default function SaveStateCaption({
  state,
  idleText,
  failedText = "저장되지 않았습니다",
  onRetry,
  id,
  className = "",
}: SaveStateCaptionProps) {
  return (
    <p
      id={id}
      role="status"
      aria-live="polite"
      data-state={state}
      className={`inline-flex min-h-[16px] flex-wrap items-center gap-1.5 text-[11px] ${className}`}
    >
      {state === "saving" ? (
        <span className="inline-flex items-center gap-1 text-[#615D59]">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          저장 중...
        </span>
      ) : state === "saved" ? (
        <span className={`inline-flex items-center gap-1 ${STATUS_TONE_TEXT_CLASS.ok}`}>
          <Check className="h-3 w-3" aria-hidden />
          저장됨
        </span>
      ) : state === "failed" ? (
        <>
          <span className={STATUS_TONE_TEXT_CLASS.danger}>{failedText}</span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className={`inline-flex min-h-11 items-center rounded px-1 font-semibold underline underline-offset-2 sm:min-h-0 ${STATUS_TONE_TEXT_CLASS.danger}`}
            >
              다시 시도
            </button>
          ) : null}
        </>
      ) : idleText ? (
        <span className="text-[#615D59]">{idleText}</span>
      ) : null}
    </p>
  )
}
