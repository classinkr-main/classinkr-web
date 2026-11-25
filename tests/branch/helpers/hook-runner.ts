// 테스트 전용 미니 훅 런타임 — 이 저장소의 vitest 는 node 환경(DOM·testing-library 없음)이라 훅·컴포넌트 함수를 직접
// 돌려 볼 길이 없다. vi.mock("react") 로 이 파일의 hookImpls 를 끼우면 useState·useRef·useMemo·useCallback·useEffect·useId 가
// 이 런타임 위에서 돈다. 렌더 = 함수를 한 번 부르는 것, setState 는 마이크로태스크로 다시 렌더한다, effect 는 렌더 직후
// (deps 가 바뀌었을 때) 돈다. React 의 스케줄링·동시성은 흉내 내지 않는다 — 상태 전이·비동기 흐름만 본다.
//
// 쓰는 법:
//   vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), ...(await import("./helpers/hook-runner")).hookImpls }))
//   const view = renderHook(() => useSomething())
//   await view.settle()            // 대기 중인 비동기·재렌더를 다 흘린다
//   view.current                   // 가장 최근 렌더 결과(콜백은 늘 여기서 새로 꺼낸다 — 클로저가 렌더마다 바뀐다)

type Deps = readonly unknown[] | undefined

interface StateSlot<T> {
  kind: "state"
  value: T
  setter: (next: T | ((current: T) => T)) => void
}

interface MemoSlot<T> {
  kind: "memo"
  value: T
  deps: Deps
}

interface RefSlot<T> {
  kind: "ref"
  ref: { current: T }
}

interface EffectSlot {
  kind: "effect"
  deps: Deps
  cleanup: void | (() => void)
}

interface IdSlot {
  kind: "id"
  id: string
}

type Slot = { kind: string }

interface Instance {
  slots: Slot[]
  cursor: number
  pendingEffects: Array<() => void>
  scheduled: boolean
  unmounted: boolean
  renders: number
  render: () => void
  schedule: () => void
}

let current: Instance | null = null
let idCounter = 0

function active(): Instance {
  if (!current) throw new Error("hook-runner: 훅이 renderHook 밖에서 불렸습니다")
  return current
}

function depsChanged(previous: Deps, next: Deps): boolean {
  if (!previous || !next) return true
  if (previous.length !== next.length) return true
  return previous.some((value, index) => !Object.is(value, next[index]))
}

function slotAt<T extends Slot>(instance: Instance, create: () => T): T {
  const index = instance.cursor++
  if (!(index in instance.slots)) instance.slots[index] = create()
  return instance.slots[index] as unknown as T
}

function useState<T>(initial: T | (() => T)): [T, StateSlot<T>["setter"]] {
  const instance = active()
  const slot = slotAt<StateSlot<T>>(instance as Instance, () => {
    const created: StateSlot<T> = {
      kind: "state",
      value: typeof initial === "function" ? (initial as () => T)() : initial,
      setter: (next) => {
        const value = typeof next === "function" ? (next as (current: T) => T)(created.value) : next
        if (Object.is(value, created.value)) return
        created.value = value
        instance.schedule()
      },
    }
    return created as unknown as StateSlot<T>
  })
  return [slot.value, slot.setter]
}

function useRef<T>(initial: T): { current: T } {
  return slotAt<RefSlot<T>>(active(), () => ({ kind: "ref", ref: { current: initial } }) as RefSlot<T>).ref
}

// 훅 이름이 아닌 함수로 둔다 — useCallback 구현이 이것을 부르게(린트의 훅 규칙은 진짜 훅 호출부만 본다).
function memoSlot<T>(factory: () => T, deps: Deps): T {
  const instance = active()
  const index = instance.cursor
  const existing = instance.slots[index] as MemoSlot<T> | undefined
  instance.cursor += 1
  if (!existing || depsChanged(existing.deps, deps)) {
    instance.slots[index] = { kind: "memo", value: factory(), deps } as MemoSlot<unknown>
  }
  return (instance.slots[index] as MemoSlot<T>).value
}

function useMemo<T>(factory: () => T, deps: Deps): T {
  return memoSlot(factory, deps)
}

function useCallback<T>(fn: T, deps: Deps): T {
  return memoSlot(() => fn, deps)
}

function useEffect(effect: () => void | (() => void), deps?: Deps): void {
  const instance = active()
  const index = instance.cursor
  const existing = instance.slots[index] as EffectSlot | undefined
  instance.cursor += 1
  if (existing && !depsChanged(existing.deps, deps)) return
  const slot: EffectSlot = existing ?? { kind: "effect", deps, cleanup: undefined }
  slot.deps = deps
  instance.slots[index] = slot as Slot
  instance.pendingEffects.push(() => {
    if (typeof slot.cleanup === "function") slot.cleanup()
    slot.cleanup = effect()
  })
}

function useId(): string {
  return slotAt<IdSlot>(active(), () => ({ kind: "id", id: `:t${(idCounter += 1)}:` })).id
}

/** vi.mock("react") 에 펼쳐 넣을 훅 구현(renderHook 안에서만 쓸 때). */
export const hookImpls = {
  useState,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect: useEffect,
  useId,
}

/**
 * renderHook 안에서는 이 런타임, 밖(renderToStaticMarkup 등 진짜 React 렌더)에서는 원래 React 훅을 쓰는 구현 —
 * 한 테스트 파일에서 둘 다 쓸 때 vi.mock("react") 에 펼쳐 넣는다.
 */
export function hookImplsWithFallback(actual: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, impl] of Object.entries(hookImpls)) {
    const original = actual[name] as (...args: unknown[]) => unknown
    out[name] = (...args: unknown[]) => (current ? (impl as (...inner: unknown[]) => unknown)(...args) : original(...args))
  }
  return out
}

export interface HookView<T> {
  /** 가장 최근 렌더 결과. */
  readonly current: T
  /** 렌더 횟수. */
  readonly renders: number
  /** 지금 바로 다시 렌더한다(props 를 바꾼 뒤 등). */
  rerender: () => void
  /** 마이크로태스크·타이머 0 을 여러 번 흘려 대기 중인 비동기 작업과 재렌더를 끝낸다. */
  settle: (rounds?: number) => Promise<void>
  unmount: () => void
}

export function renderHook<T>(hook: () => T): HookView<T> {
  let result: T | undefined
  const instance: Instance = {
    slots: [],
    cursor: 0,
    pendingEffects: [],
    scheduled: false,
    unmounted: false,
    renders: 0,
    render: () => {
      if (instance.unmounted) return
      const previous = current
      current = instance
      instance.cursor = 0
      instance.pendingEffects = []
      try {
        result = hook()
        instance.renders += 1
      } finally {
        current = previous
      }
      const effects = instance.pendingEffects
      instance.pendingEffects = []
      for (const run of effects) run()
    },
    schedule: () => {
      if (instance.scheduled || instance.unmounted) return
      instance.scheduled = true
      queueMicrotask(() => {
        instance.scheduled = false
        instance.render()
      })
    },
  }
  instance.render()
  return {
    get current() {
      return result as T
    },
    get renders() {
      return instance.renders
    },
    rerender: () => instance.render(),
    settle: async (rounds = 25) => {
      for (let index = 0; index < rounds; index += 1) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    },
    unmount: () => {
      instance.unmounted = true
      for (const slot of instance.slots) {
        const effect = slot as EffectSlot | undefined
        if (effect?.kind === "effect" && typeof effect.cleanup === "function") effect.cleanup()
      }
    },
  }
}

// ── 렌더 결과(React 요소 트리) 찾기 ────────────────────────────────────────────

interface ElementLike {
  type: unknown
  key: string | null
  props: Record<string, unknown> & { children?: unknown }
}

function isElement(node: unknown): node is ElementLike {
  return Boolean(node) && typeof node === "object" && "props" in (node as object) && "type" in (node as object)
}

/** 요소 트리를 깊이 우선으로 훑어 조건에 맞는 요소를 모두 돌려준다(함수 컴포넌트는 펼치지 않는다). */
export function findElements(node: unknown, predicate: (element: ElementLike) => boolean): ElementLike[] {
  const out: ElementLike[] = []
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      for (const item of value) visit(item)
      return
    }
    if (!isElement(value)) return
    if (predicate(value)) out.push(value)
    visit(value.props.children)
  }
  visit(node)
  return out
}

export function findByProp(node: unknown, prop: string, value: unknown): ElementLike | null {
  return findElements(node, (element) => element.props[prop] === value)[0] ?? null
}

/** 요소 안의 글자(문자열·숫자 자식)를 이어 붙인다. */
export function textOf(node: unknown): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(textOf).join("")
  if (isElement(node)) return textOf(node.props.children)
  return ""
}
