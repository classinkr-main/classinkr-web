"use client"

import { useSyncExternalStore } from "react"
import { Loader2, RefreshCw } from "lucide-react"

import { SECONDARY_TEXT_CLASS } from "./home/shared"

/**
 * CRM 목록 상단의 신선도 캡션 — "기준 HH:MM · 갱신 N초 전" (2026-09-17 우선순위 P2).
 *
 * 모든 CRM 목록이 같은 문구·같은 위치로 "이 숫자가 언제 것인지"를 말하게 하는 공용 조각이다.
 *  - `generatedAt`: 서버가 데이터를 만든 시각(응답 payload의 generatedAt). 없으면 "기준" 부분을 생략한다.
 *  - `receivedAt`: 클라이언트가 이 응답을 받은 시각. 없으면 generatedAt 으로 대신한다.
 *  - `refreshing`: 백그라운드 갱신 중이면 스피너와 "갱신 중"을 보인다(성공 문구로 오독 방지).
 *  - `staleReason === "error"`: 마지막 갱신이 실패해 이전 값을 보여주는 중이라는 뜻 — warning 톤으로 표시.
 *  - `onRefresh`: 있으면 "새로고침" 인라인 버튼을 붙인다(force 재조회 계약은 호출부가 정한다).
 *
 * 상대 시간은 30초마다 다시 계산한다. 항상 마운트된 role=status 영역이라 SR 사용자도 갱신 사실을 듣는다.
 */

export type FreshnessCaptionProps = {
  generatedAt?: string | null
  receivedAt?: string | number | null
  refreshing?: boolean
  staleReason?: "error" | null
  onRefresh?: () => void
  className?: string
  /** 테스트·고정 시각용. 생략하면 Date.now() */
  nowMs?: number
}

const KST_TIME = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
})

/** "HH:MM" (KST). 파싱 실패면 null. */
export function formatBasisTime(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  return KST_TIME.format(new Date(ms))
}

/** "방금" · "N초 전" · "N분 전" · "N시간 전". 미래·파싱 실패는 null. */
export function formatAgo(at: string | number | null | undefined, nowMs: number): string | null {
  if (at === null || at === undefined) return null
  const ms = typeof at === "number" ? at : Date.parse(at)
  if (!Number.isFinite(ms)) return null
  const diff = Math.max(0, nowMs - ms)
  const sec = Math.round(diff / 1000)
  if (sec < 5) return "방금"
  if (sec < 60) return `${sec}초 전`
  const min = Math.round(sec / 60)
  if (min < 60) return `${min}분 전`
  const hr = Math.round(min / 60)
  return `${hr}시간 전`
}

/** 30초 간격 틱 스토어 — 구독자가 있을 때만 interval 이 돈다. */
let clockNow = 0
let clockTimer: number | null = null
const clockListeners = new Set<() => void>()
function subscribeClock(listener: () => void) {
  clockListeners.add(listener)
  if (clockTimer === null && typeof window !== "undefined") {
    clockNow = Date.now()
    clockTimer = window.setInterval(() => {
      clockNow = Date.now()
      clockListeners.forEach((l) => l())
    }, 30_000)
  }
  return () => {
    clockListeners.delete(listener)
    if (clockListeners.size === 0 && clockTimer !== null) {
      window.clearInterval(clockTimer)
      clockTimer = null
    }
  }
}
function getClockSnapshot(): number | null {
  if (clockNow === 0) clockNow = Date.now()
  return clockNow
}
function getClockServerSnapshot(): number | null {
  return null
}

export default function FreshnessCaption({
  generatedAt,
  receivedAt,
  refreshing = false,
  staleReason = null,
  onRefresh,
  className,
  nowMs,
}: FreshnessCaptionProps) {
  // 렌더 중 Date.now() 를 직접 부르지 않도록 30초 틱 스토어를 구독한다(SSR 에서는 null → 상대 시간 생략).
  const clockMs = useSyncExternalStore(subscribeClock, getClockSnapshot, getClockServerSnapshot)
  const now = nowMs ?? clockMs
  const basis = formatBasisTime(generatedAt)
  const ago = now === null ? null : formatAgo(receivedAt ?? generatedAt, now)
  const tone = staleReason === "error" ? "text-[#7A520F]" : SECONDARY_TEXT_CLASS

  return (
    <p
      role="status"
      aria-live="polite"
      className={`flex flex-wrap items-center gap-x-1.5 text-[11px] ${tone} ${className ?? ""}`}
      data-freshness={staleReason ?? (refreshing ? "refreshing" : "fresh")}
    >
      {basis ? <span>기준 {basis}</span> : null}
      {basis && (ago || refreshing) ? <span aria-hidden="true" className="text-[#D8D5CF]">·</span> : null}
      {refreshing ? (
        <span className="inline-flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          갱신 중
        </span>
      ) : ago ? (
        <span>{staleReason === "error" ? `갱신 실패 · 이전 값 ${ago}` : `갱신 ${ago}`}</span>
      ) : null}
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="inline-flex min-h-11 items-center gap-1 rounded px-1 font-semibold text-[#31302E] underline-offset-2 hover:underline disabled:opacity-50 sm:min-h-0"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          새로고침
        </button>
      ) : null}
    </p>
  )
}
