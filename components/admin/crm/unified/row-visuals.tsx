"use client"

// 통합 고객 목록 행 시각 요소 — 라벨 칩·소스 배지·돈흐름 셀·리드 배지(공용 분 시계).
// CrmUnifiedCustomersClient.tsx 분해(2026-08-28)로 이동 — 로직 무변경.

import { memo, useSyncExternalStore } from "react"
import { Building2, PhoneCall, UserRound } from "lucide-react"
import type { CrmUnifiedCustomerRow } from "@/lib/repositories/crm-unified-customers"
import { LEAD_BADGE_TONE_CLASSES, leadBadges } from "@/lib/crm/lead-badges"

// 돈흐름 3상태 표기 — moneyState(lib/crm/unified-view-rules)가 "-"의 사유를 구분한다.
// value=금액 그대로 · zero=0원(중립) · unsynced=동기화 대기(주의 톤) · none=리드(돈흐름 개념 없음).
export function moneyCell(row: CrmUnifiedCustomerRow) {
  if (row.moneyState === "value") {
    return <span className="text-[12px] font-medium text-[#1a1a1a]/55">{row.moneyLabel ?? "-"}</span>
  }
  if (row.moneyState === "zero") {
    return <span className="text-[12px] font-medium text-[#1a1a1a]/40">0원</span>
  }
  if (row.moneyState === "unsynced") {
    return (
      <span
        className="text-[11px] font-semibold text-[#A8741A]"
        title="외부 CRM 잔액·만료 동기화가 아직 안 된 고객입니다"
      >
        동기화 대기
      </span>
    )
  }
  return <span className="text-[12px] font-medium text-[#1a1a1a]/30">—</span>
}

export function TagChips({ tags }: { tags: string[] }) {
  if (!tags.length) return null
  return (
    <span className="mt-1 flex flex-wrap gap-1">
      {tags.slice(0, 3).map((tag) => (
        <span
          key={tag}
          className="rounded border border-[#e8e8e4] bg-[#fafaf8] px-1.5 py-0.5 text-[10px] font-medium text-[#1a1a1a]/55"
        >
          {tag}
        </span>
      ))}
      {tags.length > 3 ? <span className="self-center text-[10px] text-[#1a1a1a]/35">+{tags.length - 3}</span> : null}
    </span>
  )
}

export function sourceBadge(row: CrmUnifiedCustomerRow) {
  if (row.source === "lead") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#e8e8e4] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#1a1a1a]/60">
        <PhoneCall className="h-3 w-3" />
        리드
      </span>
    )
  }
  if (row.source === "customer") {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full border border-[#D7EBDD] bg-white px-2 py-0.5 text-[11px] font-semibold text-[#084734]"
        title="리드 전환으로 생성된 앱 고객"
      >
        <UserRound className="h-3 w-3" />
        전환 고객
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-[#D7EBDD] bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-semibold text-[#084734]"
      title="본사 CRM 동기화 원천"
    >
      <Building2 className="h-3 w-3" />
      고객
    </span>
  )
}

// 공용 분(分) 시계 — 상대시간 배지 전용(감사 #8). 구독자가 있을 때만 interval을 1개 돌리고
// (배지 인스턴스 수와 무관), 탭이 숨겨지면 정지·복귀 시 즉시 갱신 후 재개한다.
// 부모 리스트 상태가 아니므로 분 틱마다 전 행이 아니라 구독한 배지 소컴포넌트만 리렌더된다.
const MINUTE_TICK_MS = 60_000
let minuteClockNowMs = Date.now()
let minuteClockTimer: number | null = null
const minuteClockListeners = new Set<() => void>()

function emitMinuteClock() {
  minuteClockNowMs = Date.now()
  for (const listener of minuteClockListeners) listener()
}

function stopMinuteClockTimer() {
  if (minuteClockTimer == null) return
  window.clearInterval(minuteClockTimer)
  minuteClockTimer = null
}

function startMinuteClockTimer() {
  if (minuteClockTimer != null || minuteClockListeners.size === 0) return
  minuteClockTimer = window.setInterval(emitMinuteClock, MINUTE_TICK_MS)
}

function onMinuteClockVisibility() {
  if (document.hidden) {
    stopMinuteClockTimer()
  } else {
    emitMinuteClock()
    startMinuteClockTimer()
  }
}

function subscribeMinuteClock(listener: () => void) {
  if (minuteClockListeners.size === 0) {
    // 첫 구독(리스트 재진입 포함) — 마지막 emit이 오래됐을 수 있어 기준 시각부터 갱신한다.
    // useSyncExternalStore가 구독 직후 스냅샷을 재확인하므로 별도 통지는 필요 없다.
    minuteClockNowMs = Date.now()
    document.addEventListener("visibilitychange", onMinuteClockVisibility)
  }
  minuteClockListeners.add(listener)
  if (!document.hidden) startMinuteClockTimer()
  return () => {
    minuteClockListeners.delete(listener)
    if (minuteClockListeners.size === 0) {
      document.removeEventListener("visibilitychange", onMinuteClockVisibility)
      stopMinuteClockTimer()
    }
  }
}

function getMinuteClockSnapshot() {
  return minuteClockNowMs
}

function useMinuteNow() {
  return useSyncExternalStore(subscribeMinuteClock, getMinuteClockSnapshot, getMinuteClockSnapshot)
}

// 리드 행 배지 — 파생 규칙은 lib/crm/lead-badges.ts(순수 모듈, 단위 테스트 대상) 소유.
// nowMs는 부모 상태가 아니라 배지 내부의 공용 분 시계 구독으로 받는다(감사 #8).
function LeadRowBadgeList({ row }: { row: CrmUnifiedCustomerRow }) {
  const nowMs = useMinuteNow()
  const badges = leadBadges(row, nowMs)
  if (!badges) return null
  return (
    <>
      {badges.map((badge) => (
        <span
          key={badge.label}
          className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${LEAD_BADGE_TONE_CLASSES[badge.tone]}`}
        >
          {badge.label}
        </span>
      ))}
    </>
  )
}

// memo 소컴포넌트로 격리 — 부모가 다른 이유로 리렌더돼도 row가 같으면 건너뛰고,
// 리드가 아닌 행(배지 없음 확정)은 시계 구독 자체를 생략한다.
export const LeadRowBadges = memo(function LeadRowBadges({ row }: { row: CrmUnifiedCustomerRow }) {
  if (row.source !== "lead") return null
  return <LeadRowBadgeList row={row} />
})
