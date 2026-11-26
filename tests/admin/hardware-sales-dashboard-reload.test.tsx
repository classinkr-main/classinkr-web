// 판매대시보드 재조회 계약 — reloadKey 가 원시 값이면 "같은 값으로 다시 그리기"는 재조회가 아니고,
// 값이 바뀔 때만(최초·새로고침·저장 직후) 다시 받는다.
// 이 저장소엔 DOM 렌더러(jsdom/testing-library)가 없어서, react 훅(useState/useMemo/useEffect)을
// deps 비교까지 흉내 내는 최소 런타임으로 컴포넌트 함수를 직접 여러 번 호출해 확인한다.
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  adminFetchJson: vi.fn(),
  runtime: {
    states: [] as unknown[],
    deps: [] as Array<unknown[] | undefined>,
    cleanups: [] as Array<(() => void) | void>,
    pendingEffects: [] as Array<() => void>,
    cursor: 0,
  },
}))

vi.mock("@/lib/admin-client", () => ({ adminFetchJson: mocks.adminFetchJson }))

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react")
  const rt = mocks.runtime
  const depsChanged = (prev: unknown[] | undefined, next: unknown[] | undefined) =>
    !prev || !next || prev.length !== next.length || next.some((value, i) => !Object.is(value, prev[i]))
  return {
    ...actual,
    memo: (component: unknown) => component,
    useState: (initial: unknown) => {
      const slot = rt.cursor++
      if (!(slot in rt.states)) rt.states[slot] = typeof initial === "function" ? (initial as () => unknown)() : initial
      const set = (value: unknown) => {
        rt.states[slot] = typeof value === "function" ? (value as (v: unknown) => unknown)(rt.states[slot]) : value
      }
      return [rt.states[slot], set]
    },
    useMemo: (factory: () => unknown) => factory(),
    useEffect: (effect: () => (() => void) | void, deps?: unknown[]) => {
      const slot = rt.cursor++
      if (depsChanged(rt.deps[slot], deps)) {
        rt.deps[slot] = deps
        rt.pendingEffects.push(() => {
          if (typeof rt.cleanups[slot] === "function") (rt.cleanups[slot] as () => void)()
          rt.cleanups[slot] = effect()
        })
      }
    },
  }
})

import SalesDashboardSection from "@/components/admin/hardware/inventory/SalesDashboardSection"

function render(props: { reloadKey?: string | number }) {
  const rt = mocks.runtime
  rt.cursor = 0
  ;(SalesDashboardSection as unknown as (p: typeof props) => unknown)(props)
  const effects = rt.pendingEffects.splice(0)
  effects.forEach((run) => run())
}

describe("SalesDashboardSection 재조회 신호", () => {
  beforeEach(() => {
    const rt = mocks.runtime
    rt.states = []
    rt.deps = []
    rt.cleanups = []
    rt.pendingEffects = []
    rt.cursor = 0
    mocks.adminFetchJson.mockReset()
    mocks.adminFetchJson.mockResolvedValue({ fy: 2026, months: [], availableFys: [2026], currentFy: 2026 })
  })

  it("같은 reloadKey 로 다시 그려도(부모가 data 를 새 객체로 교체해도) 재조회하지 않는다", () => {
    render({ reloadKey: 1 })
    render({ reloadKey: 1 })
    render({ reloadKey: 1 })
    expect(mocks.adminFetchJson).toHaveBeenCalledTimes(1)
    expect(mocks.adminFetchJson).toHaveBeenCalledWith("/api/admin/hardware/sales-dashboard")
  })

  it("reloadKey 가 올라가면(새로고침·저장 직후) 다시 받는다", () => {
    render({ reloadKey: 1 })
    render({ reloadKey: 2 })
    expect(mocks.adminFetchJson).toHaveBeenCalledTimes(2)
  })
})
