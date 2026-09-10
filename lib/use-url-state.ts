"use client"

import { useCallback, useSyncExternalStore } from "react"

// UI 상태(검색·필터·정렬)를 URL 쿼리스트링에 보존한다.
// 새로고침·뒤로가기·링크 공유에도 유지되도록 window.history.replaceState로 동기화하며,
// useSearchParams와 달리 Suspense 경계가 필요 없어 깊은 클라이언트 컴포넌트에서 바로 쓸 수 있다.
//
// URL은 React 외부의 가변 소스이므로 useSyncExternalStore로 구독한다(SSR 안전, hydration 불일치 없음).
// 기본값과 같은 값은 URL에서 제거해 주소를 깔끔하게 유지한다.
// 한 페이지에 여러 패널이 있으면 key를 네임스페이스로 구분한다(예: "contract_q").

/**
 * pushState/replaceState가 URL을 바꿨음을 알리는 내부 이벤트.
 *
 * popstate는 뒤로/앞으로 가기에서만 발생하고, Next App Router의 소프트 내비게이션
 * (<Link>, router.push/replace)은 history.pushState/replaceState를 직접 부르므로
 * popstate 구독만으로는 감지되지 않는다. 그 탓에 같은 경로 안에서 쿼리만 바뀌는 딥링크
 * (CS 콘솔 가로 메뉴의 /admin/docs?tab=…, 캠페인 ?tab=…)가 본문을 못 바꾸는 결함이
 * 있었다(2026-08-18 실측). 두 메서드를 한 번 감싸 이 이벤트를 쏘고, 구독은 popstate와
 * 이 이벤트를 함께 듣는다.
 */
export const URL_STATE_CHANGE_EVENT = "classin:url-state-change"

// 패치는 history "객체 단위"로 1회 — 모듈 전역 플래그가 아니라 WeakSet 마킹이다.
// 같은 window가 다시 들어오면 중복 래핑을 막고(구독자당 정확히 1회 호출 계약),
// 테스트가 window 스텁을 갈아 끼워도 새 history가 독립적으로 패치된다.
const patchedHistories = new WeakSet<object>()

function ensureHistoryDispatchesUrlStateEvent() {
  if (typeof window === "undefined") return

  const history = window.history as unknown as Record<
    "pushState" | "replaceState",
    (...args: unknown[]) => unknown
  >
  if (patchedHistories.has(history)) return
  patchedHistories.add(history)

  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method].bind(history)
    history[method] = (...args: unknown[]) => {
      const result = original(...args)
      // 원본이 URL을 커밋한 "뒤"에 알린다 — 구독자의 getSnapshot이 새 location을 읽어야 한다.
      window.dispatchEvent(new Event(URL_STATE_CHANGE_EVENT))
      return result
    }
  }
}

/** popstate + pushState/replaceState 어느 경로로 URL이 바뀌어도 onChange를 부른다. */
export function subscribeToUrlState(onChange: () => void) {
  ensureHistoryDispatchesUrlStateEvent()
  window.addEventListener("popstate", onChange)
  window.addEventListener(URL_STATE_CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener("popstate", onChange)
    window.removeEventListener(URL_STATE_CHANGE_EVENT, onChange)
  }
}

export function useUrlState(
  key: string,
  defaultValue: string
): [string, (value: string) => void] {
  const subscribe = useCallback(
    (onStoreChange: () => void) => subscribeToUrlState(onStoreChange),
    []
  )

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
      // 패치된 replaceState가 URL_STATE_CHANGE_EVENT를 쏘므로 별도 알림이 필요 없다.
      window.history.replaceState(null, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname)
    },
    [key, defaultValue]
  )

  return [value, update]
}
