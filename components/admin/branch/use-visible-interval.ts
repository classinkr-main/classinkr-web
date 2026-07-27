"use client"

import { useEffect, useRef } from "react"

// 1분 상대시간 tick처럼 "화면에 보일 때만 돌면 되는" 반복 작업용 공용 interval 훅
// (코덱스 감사 #15 — SalesLedgerWorkbench 원천 스트립 tick과 SyncStatusBar tick이 공유).
// 탭이 백그라운드(document hidden)로 가면 interval을 해제해 헛돌지 않게 하고, 복귀(visible)
// 시 콜백을 즉시 1회 실행해 숨김 동안 밀린 표기를 그 자리에서 따라잡은 뒤 interval을 다시 건다.
// 콜백은 ref로 최신본을 유지한다 — 소비처가 인라인 화살표를 넘겨도 재구독이 일어나지 않는다.
export function useVisibleInterval(callback: () => void, intervalMs: number) {
  const callbackRef = useRef(callback)
  useEffect(() => {
    callbackRef.current = callback
  })

  useEffect(() => {
    let id: number | null = null
    const start = () => {
      if (id === null) id = window.setInterval(() => callbackRef.current(), intervalMs)
    }
    const stop = () => {
      if (id !== null) {
        window.clearInterval(id)
        id = null
      }
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stop()
        return
      }
      // 복귀 즉시 1회 갱신 — interval 재개만 하면 최대 intervalMs만큼 스테일 표기가 남는다.
      callbackRef.current()
      start()
    }
    if (document.visibilityState !== "hidden") start()
    document.addEventListener("visibilitychange", onVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      stop()
    }
  }, [intervalMs])
}
