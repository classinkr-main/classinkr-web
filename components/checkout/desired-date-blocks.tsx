"use client"

/**
 * 희망일 달력에서 고를 수 없는 날짜.
 *
 * 두 갈래를 합친다.
 *   ① 주말 — 순수 계산이라 클라이언트가 직접 만든다.
 *   ② 공휴일 — 구글 공개 캘린더가 원천이라 서버(`app/checkout/page.tsx`)가 읽어 내려준다.
 *
 * 신청 폼은 하드웨어 패널과 소프트웨어 패널 두 갈래 아래에 달려 있어, prop 으로 내리면
 * 중간 컴포넌트 네 개가 값을 나르기만 하게 된다. 컨텍스트로 두면 폼이 직접 읽는다.
 * 프로바이더 없이 쓰이면 빈 목록이라 기존 동작(차단 없음)으로 떨어진다.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react"

import { addDays, compareIsoDate, getWeekday } from "@/components/checkout/request-date"

const HolidayDatesContext = createContext<readonly string[]>([])

export function DesiredDateBlocksProvider({
  holidayIsoDates,
  children,
}: {
  holidayIsoDates: readonly string[]
  children: ReactNode
}) {
  return (
    <HolidayDatesContext.Provider value={holidayIsoDates}>{children}</HolidayDatesContext.Provider>
  )
}

/** 루프 상한. 희망일 범위(+180일)보다 넉넉하되 잘못된 입력으로 멈추지 않게 둔다. */
const MAX_RANGE_DAYS = 400

/** 기간 안의 토·일 날짜. */
export function buildWeekendIsoDates(minIso: string, maxIso: string): string[] {
  if (!minIso || !maxIso || compareIsoDate(minIso, maxIso) > 0) return []

  const weekends: string[] = []
  let cursor = minIso

  for (let guard = 0; guard < MAX_RANGE_DAYS; guard += 1) {
    const weekday = getWeekday(cursor)
    if (weekday === 0 || weekday === 6) weekends.push(cursor)
    if (compareIsoDate(cursor, maxIso) >= 0) break
    cursor = addDays(cursor, 1)
  }

  return weekends
}

/**
 * 달력에 넘길 비활성 날짜 집합.
 *
 * 범위 밖 날짜는 달력이 이미 native disabled 로 막으므로 여기서는 범위 **안**의
 * 주말·공휴일만 담는다.
 */
export function useBlockedDesiredDates(range: {
  minIso: string
  maxIso: string
}): ReadonlySet<string> {
  const holidayIsoDates = useContext(HolidayDatesContext)

  return useMemo(() => {
    const blocked = new Set<string>(buildWeekendIsoDates(range.minIso, range.maxIso))

    for (const iso of holidayIsoDates) {
      if (compareIsoDate(iso, range.minIso) < 0) continue
      if (compareIsoDate(iso, range.maxIso) > 0) continue
      blocked.add(iso)
    }

    return blocked
  }, [holidayIsoDates, range.minIso, range.maxIso])
}
