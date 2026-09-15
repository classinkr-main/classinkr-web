"use client"

import type { ReactNode } from "react"
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react"

import {
  STATUS_TONE_BORDER_CLASS,
  STATUS_TONE_CLASS,
  STATUS_TONE_TEXT_STRONG_CLASS,
  type StatusTone,
} from "@/lib/crm/status-tone"

/**
 * CRM 인라인/고정 알림 배너.
 *
 *  - `danger` 는 role="alert"(즉시 통지), 그 외는 role="status" + aria-live="polite".
 *  - 자동으로 사라지지 않는다. 소비처가 `onDismiss` 로 닫기 버튼을 달거나 상태를 비운다.
 *    (실패는 사용자가 읽고 닫을 때까지 남긴다 — UX 규약 3.)
 *  - `action` 은 재시도·되돌리기 같은 한 개의 주 액션. `pending` 이면 disabled + aria-busy 로 연타를 막는다.
 *  - 색은 lib/crm/status-tone.ts 토큰만 쓴다. `info` 와 `success` 는 DESIGN.md 의 Success·Info 행(ok)을 공유하고
 *    아이콘으로만 구분한다.
 *  - 고정 배너(드로어 하단·목록 상단)는 `className` 으로 `sticky bottom-0` 등을 넘긴다.
 *
 * 사용:
 *   <CrmNoticeBanner
 *     tone="danger"
 *     title="일부 리드를 저장하지 못했습니다"
 *     message="3건 중 1건 실패 · 네트워크 오류"
 *     action={{ label: "다시 시도", onClick: retry, pending: retrying }}
 *     onDismiss={() => setNotice(null)}
 *   />
 */
export type CrmNoticeTone = "danger" | "warning" | "info" | "success"

export interface CrmNoticeBannerProps {
  tone: CrmNoticeTone
  message: ReactNode
  title?: ReactNode
  action?: { label: string; onClick: () => void; pending?: boolean }
  onDismiss?: () => void
  className?: string
  /** aria-describedby 연결 등에 쓸 id. */
  id?: string
}

const TONE_TO_STATUS: Record<CrmNoticeTone, StatusTone> = {
  danger: "danger",
  warning: "warning",
  info: "ok",
  success: "ok",
}

function ToneIcon({ tone }: { tone: CrmNoticeTone }) {
  const cls = "mt-0.5 h-4 w-4 shrink-0"
  if (tone === "danger") return <AlertCircle className={cls} aria-hidden />
  if (tone === "warning") return <AlertTriangle className={cls} aria-hidden />
  if (tone === "success") return <CheckCircle2 className={cls} aria-hidden />
  return <Info className={cls} aria-hidden />
}

export default function CrmNoticeBanner({ tone, message, title, action, onDismiss, className = "", id }: CrmNoticeBannerProps) {
  const statusTone = TONE_TO_STATUS[tone]
  const live = tone === "danger" ? { role: "alert" as const } : { role: "status" as const, "aria-live": "polite" as const }
  return (
    <div
      {...live}
      id={id}
      data-tone={tone}
      className={`flex items-start gap-2.5 rounded-xl border px-3 py-2.5 text-[12px] leading-relaxed ${STATUS_TONE_CLASS[statusTone]} ${className}`}
    >
      <ToneIcon tone={tone} />
      <div className="min-w-0 flex-1">
        {title ? <p className={`font-semibold ${STATUS_TONE_TEXT_STRONG_CLASS[statusTone]}`}>{title}</p> : null}
        <div>{message}</div>
      </div>
      {action || onDismiss ? (
        <div className="flex shrink-0 items-center gap-3 self-center">
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              disabled={Boolean(action.pending)}
              aria-busy={action.pending ? true : undefined}
              className={`inline-flex min-h-11 items-center rounded-lg border bg-white px-2.5 text-[12px] font-semibold transition-colors hover:bg-white/70 disabled:cursor-not-allowed disabled:opacity-50 sm:h-7 sm:min-h-0 ${STATUS_TONE_TEXT_STRONG_CLASS[statusTone]} ${STATUS_TONE_BORDER_CLASS[statusTone]}`}
            >
              {action.label}
            </button>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="알림 닫기"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors hover:bg-white/60 sm:min-h-0 sm:min-w-0 sm:h-7 sm:w-7"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
