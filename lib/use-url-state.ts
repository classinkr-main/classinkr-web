"use client"

import { useCallback, useSyncExternalStore } from "react"

// UI 상태(검색·필터·정렬)를 URL 쿼리스트링에 보존한다.
// 새로고침·뒤로가기·링크 공유에도 유지되도록 window.history.replaceState로 동기화하며,
// useSearchParams와 달리 Suspense 경계가 필요 없어 깊은 클라이언트 컴포넌트에서 바로 쓸 수 있다.
//
// URL은 React 외부의 가변 소스이므로 useSyncExternalStore로 구독한다(SSR 안전, hydration 불일치 없음).
// 기본값과 같은 값은 URL에서 제거해 주소를 깔끔하게 유지한다.
// 한 페이지에 여러 패널이 있으면 key를 네임스페이스로 구분한다(예: "contract_q").
export function useUrlState(
  key: string,
  defaultValue: string
): [string, (value: string) => void] {
  const subscribe = useCallback((onStoreChange: () => void) => {
    window.addEventListener("popstate", onStoreChange)
    return () => window.removeEventListener("popstate", onStoreChange)
  }, [])

  const getSnapshot = useCallback(
    () => new URLSearchParams(window.location.search).get(key) ?? defaultValue,
    [key, defaultValue]
  )

  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue])

  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const update = useCallback(
    (next: string) => {
      if (typeof window === "undefined") return
      const params = new URLSearchParams(window.location.search)
      if (!next || next === defaultValue) params.delete(key)
      else params.set(key, next)
      const qs = params.toString()
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
      // replaceState는 popstate를 발생시키지 않으므로 구독자가 다시 읽도록 직접 디스패치한다.
      window.dispatchEvent(new PopStateEvent("popstate"))
    },
    [key, defaultValue]
  )

  return [value, update]
}
