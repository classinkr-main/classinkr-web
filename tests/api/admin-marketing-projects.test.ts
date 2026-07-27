import { describe, expect, it } from "vitest"
import { sanitizeProjectInput } from "@/app/api/admin/marketing-projects/route"
import { sanitizeProjectPatch } from "@/app/api/admin/marketing-projects/[id]/route"

/*
 * D3-2 프로젝트 sanitizer 계약. 라우트 HTTP 모킹 없이 순수 함수만 검증한다.
 * 하드 게이트(→ null 로 입력 전체 거부): name 빈값 · status 미허용 enum · budget 음수/비정수.
 * 강제 정규화: 파싱 불가한 날짜 → null · 문자열 트림. status 기본값은 "active"(캠페인의 planned 와 다름).
 */

describe("sanitizeProjectInput (프로젝트 생성 입력)", () => {
  it("유효한 전체 입력을 정규화해 통과시킨다", () => {
    const out = sanitizeProjectInput({
      name: "  2026 하반기 그로스 프로젝트  ",
      objective: " 신규 학원 확보 ",
      status: "active",
      startsAt: "2026-08-01",
      endsAt: "2026-12-31",
      budget: 20_000_000,
      owner: " Moon ",
    })
    expect(out).toEqual({
      name: "2026 하반기 그로스 프로젝트",
      objective: "신규 학원 확보",
      status: "active",
      startsAt: "2026-08-01",
      endsAt: "2026-12-31",
      budget: 20_000_000,
      owner: "Moon",
    })
  })

  it("name 이 없거나 공백뿐/비문자면 null (하드 게이트)", () => {
    expect(sanitizeProjectInput({})).toBeNull()
    expect(sanitizeProjectInput({ name: "" })).toBeNull()
    expect(sanitizeProjectInput({ name: "   " })).toBeNull()
    expect(sanitizeProjectInput({ name: 123 })).toBeNull()
    expect(sanitizeProjectInput(null)).toBeNull()
  })

  it("name 만 주면 status 는 active 기본값·나머지는 안전한 기본값(채널/projectId 필드 없음)", () => {
    const out = sanitizeProjectInput({ name: "미니멀 프로젝트" })
    expect(out).toEqual({
      name: "미니멀 프로젝트",
      objective: null,
      status: "active",
      startsAt: null,
      endsAt: null,
      budget: null,
      owner: null,
    })
  })

  it("허용되지 않은 status 는 조용히 기본값으로 삼키지 않고 거부(null)", () => {
    expect(sanitizeProjectInput({ name: "x", status: "running" })).toBeNull()
    expect(sanitizeProjectInput({ name: "x", status: 42 })).toBeNull()
  })

  it("음수·비정수 budget 은 거부(null), budget 0 은 유효", () => {
    expect(sanitizeProjectInput({ name: "x", budget: -1 })).toBeNull()
    expect(sanitizeProjectInput({ name: "x", budget: 100.5 })).toBeNull()
    expect(sanitizeProjectInput({ name: "x", budget: Number.NaN })).toBeNull()
    expect(sanitizeProjectInput({ name: "x", budget: "3000" })).toBeNull()
    expect(sanitizeProjectInput({ name: "x", budget: 0 })?.budget).toBe(0)
  })

  it("파싱 불가한 날짜는 null 로 코어싱(입력 전체를 죽이지 않음)", () => {
    const out = sanitizeProjectInput({ name: "x", startsAt: "not-a-date", endsAt: "2026-09-01" })
    expect(out?.startsAt).toBeNull()
    expect(out?.endsAt).toBe("2026-09-01")
  })
})

describe("sanitizeProjectPatch (프로젝트 부분 수정 입력)", () => {
  it("제공된 키만 포함한다", () => {
    expect(sanitizeProjectPatch({ status: "paused" })).toEqual({ status: "paused" })
  })

  it("빈 객체는 빈 패치({}) — 라우트가 무변경을 별도 처리한다", () => {
    expect(sanitizeProjectPatch({})).toEqual({})
  })

  it("제공된 status 가 잘못되면 거부(null), name 빈값도 거부", () => {
    expect(sanitizeProjectPatch({ status: "bogus" })).toBeNull()
    expect(sanitizeProjectPatch({ name: "   " })).toBeNull()
  })

  it("budget:null 을 명시하면 예산을 비운다({budget:null}), 음수 budget 은 거부", () => {
    expect(sanitizeProjectPatch({ budget: null })).toEqual({ budget: null })
    expect(sanitizeProjectPatch({ budget: -5 })).toBeNull()
  })

  it("객체가 아니면 null", () => {
    expect(sanitizeProjectPatch(null)).toBeNull()
    expect(sanitizeProjectPatch("nope")).toBeNull()
  })
})
