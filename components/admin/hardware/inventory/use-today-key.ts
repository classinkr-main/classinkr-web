"use client"

// 로컬 오늘 YYYY-MM-DD — 자정을 넘기면 스스로 바뀐다(하드웨어 라운드 3 H-9). 탭을 열어 둔 채 날이 바뀌면
// 확정일 기본값과 "오늘 아님" 표시가 어제에 머물렀다. 다음 자정 1초 뒤에 한 번 다시 계산한다.

import { useEffect, useState } from "react"

import { todayKey } from "./shared"

export function useTodayKey(): string {
  const [today, setToday] = useState(() => todayKey())
  useEffect(() => {
    const now = new Date()
    const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
    const timer = window.setTimeout(() => setToday(todayKey()), Math.max(1000, nextMidnight.getTime() - now.getTime()))
    return () => window.clearTimeout(timer)
  }, [today])
  return today
}
