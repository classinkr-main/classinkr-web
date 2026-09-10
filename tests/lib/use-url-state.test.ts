import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { subscribeToUrlState, URL_STATE_CHANGE_EVENT } from "@/lib/use-url-state"

// useUrlState의 구독이 popstate만 듣던 시절, Next 클라이언트 내비게이션(Link → history.pushState)
// 의 쿼리 변화를 감지하지 못해 CS 콘솔 가로 메뉴(/admin/docs?tab=…)와 캠페인 4탭의 같은 경로
// 딥링크가 조용히 무시됐다(2026-08-18 실측). 여기서는 구독 계약 자체를 지킨다:
// pushState/replaceState/popstate 어느 경로로 URL이 바뀌어도 구독자가 호출돼야 한다.
//
// vitest 기본 환경(node)에는 window가 없으므로 EventTarget 기반 스텁을 만든다.
// EventTarget/Event는 Node 전역에 있어 jsdom 없이 실제 이벤트 전파를 검증할 수 있다.

type HistoryStub = {
  pushState: (data: unknown, unused: string, url?: string | null) => void
  replaceState: (data: unknown, unused: string, url?: string | null) => void
}

function installWindowStub() {
  const target = new EventTarget()
  const calls: string[] = []
  const history: HistoryStub = {
    pushState: () => calls.push("pushState"),
    replaceState: () => calls.push("replaceState"),
  }
  const windowStub = Object.assign(target, { history })
  vi.stubGlobal("window", windowStub)
  return { windowStub, history, calls }
}

describe("subscribeToUrlState", () => {
  beforeEach(() => {
    // 히스토리 패치는 history 객체 단위로 1회 적용된다(모듈 전역 플래그가 아니다) —
    // 테스트마다 새 window 스텁을 깔아도 각 스텁의 history가 독립적으로 패치된다.
    installWindowStub()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("popstate로 URL이 바뀌면 구독자가 호출된다 (기존 계약 유지)", () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeToUrlState(onChange)

    window.dispatchEvent(new Event("popstate"))

    expect(onChange).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it("history.pushState(Next Link 소프트 내비게이션)로 바뀌어도 구독자가 호출된다", () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeToUrlState(onChange)

    window.history.pushState(null, "", "/admin/docs?tab=quality")

    expect(onChange).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it("history.replaceState로 바뀌어도 구독자가 호출된다", () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeToUrlState(onChange)

    window.history.replaceState(null, "", "/admin/docs?tab=gaps")

    expect(onChange).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it("패치 후에도 원본 history 메서드가 그대로 실행된다", () => {
    const { calls } = installWindowStub()
    const unsubscribe = subscribeToUrlState(() => {})

    window.history.pushState(null, "", "/a")
    window.history.replaceState(null, "", "/b")

    expect(calls).toEqual(["pushState", "replaceState"])
    unsubscribe()
  })

  it("구독 해제 후에는 어떤 경로로도 호출되지 않는다", () => {
    const onChange = vi.fn()
    const unsubscribe = subscribeToUrlState(onChange)
    unsubscribe()

    window.dispatchEvent(new Event("popstate"))
    window.history.pushState(null, "", "/admin/campaigns?tab=events")
    window.dispatchEvent(new Event(URL_STATE_CHANGE_EVENT))

    expect(onChange).not.toHaveBeenCalled()
  })

  it("구독자가 여럿이어도 각자 정확히 1회씩 호출된다 (패치 중복 적용 금지)", () => {
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribeFirst = subscribeToUrlState(first)
    const unsubscribeSecond = subscribeToUrlState(second)

    window.history.pushState(null, "", "/admin/docs?tab=documents")

    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    unsubscribeFirst()
    unsubscribeSecond()
  })
})
