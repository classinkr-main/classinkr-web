/**
 * 캘린더 조회의 "최신 요청만 화면에 반영한다" 규칙.
 *
 * 인접 기간 프리페치가 들어온 뒤로 응답 속도 차이가 커졌다 — 나중에 띄운 B월이 캐시에서
 * 즉시 돌아오고 먼저 띄운 A월이 뒤늦게 끝나는 일이 흔하다. 그때 A가 setEvents를 하면
 * 사용자가 보고 있던 달이 아닌 데이터가 화면을 덮고, A가 loading을 내리면 아직 도는 요청이
 * 있는데도 새로고침 표시가 꺼져 거짓 빈 상태가 노출된다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

import { createRequestGeneration } from "@/lib/admin-calendar/request-generation"

const pageSource = readFileSync(join(process.cwd(), "app/admin/calendar/page.tsx"), "utf8")

describe("createRequestGeneration", () => {
  it("가장 마지막에 띄운 요청만 최신이다", () => {
    const generation = createRequestGeneration()

    const first = generation.next()
    expect(generation.isCurrent(first)).toBe(true)

    const second = generation.next()
    expect(generation.isCurrent(second)).toBe(true)
    expect(generation.isCurrent(first)).toBe(false)
  })

  it("늦게 끝난 이전 요청은 몇 번을 물어도 최신이 되지 않는다", () => {
    const generation = createRequestGeneration()
    const stale = generation.next()
    generation.next()
    generation.next()

    expect(generation.isCurrent(stale)).toBe(false)
  })

  it("인스턴스끼리 토큰을 공유하지 않는다(화면마다 독립)", () => {
    const a = createRequestGeneration()
    const b = createRequestGeneration()

    const tokenA = a.next()
    b.next()
    b.next()

    expect(a.isCurrent(tokenA)).toBe(true)
  })
})

describe("캘린더 페이지 — 늦은 응답 차단 배선", () => {
  it("조회 결과·에러·loading 전환을 전부 세대 토큰으로 문지킨다", () => {
    expect(pageSource).toContain("createRequestGeneration()")
    expect(pageSource).toContain("const token = generation.next()")
    // 성공 반영 / 에러 표시 / loading 해제 — 세 곳 모두 최신 확인 후에만 손댄다
    expect(pageSource.match(/generation\.isCurrent\(token\)/g)?.length).toBeGreaterThanOrEqual(4)
    expect(pageSource).toContain("if (!generation.isCurrent(token)) return\n      setEvents(data)")
  })

  it("프리페치는 최신 예약 하나만 유지하고 화면을 떠날 때 취소한다", () => {
    expect(pageSource).toContain("prefetchCancelRef.current?.()")
    expect(pageSource).toContain("prefetchCancelRef.current = scheduleIdlePrefetch(")
  })

  it("이벤트·health 모두 백그라운드 재검증 결과를 화면에 반영한다", () => {
    // 마운트 시 1회만 로드하는 화면은 onRevalidated 없이는 갱신 결과를 영영 못 받는다
    expect(pageSource).toContain("onRevalidated: ({ data: fresh }) => {")
    expect(pageSource).toContain("if (fresh && generation.isCurrent(token)) setEvents(fresh)")
    expect(pageSource).toContain("onRevalidated: ({ data }) => applyHealth(data)")
  })
})
