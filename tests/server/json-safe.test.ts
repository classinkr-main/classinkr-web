import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { assertJsonSafeInDev, findNonJsonValue } from "@/lib/server/json-safe"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("findNonJsonValue", () => {
  it("순수 JSON 값은 통과한다", () => {
    expect(findNonJsonValue({ a: 1, b: "x", c: [1, { d: null }], e: true })).toBeNull()
  })

  it("Map·Set·Date·함수·클래스 인스턴스를 경로와 함께 찾는다", () => {
    expect(findNonJsonValue({ demo: { keys: new Map() } })).toEqual({ path: "$.demo.keys", kind: "Map" })
    expect(findNonJsonValue({ rows: [{ tags: new Set() }] })).toEqual({ path: "$.rows[0].tags", kind: "Set" })
    expect(findNonJsonValue({ at: new Date() })).toEqual({ path: "$.at", kind: "Date" })
    expect(findNonJsonValue({ fn: () => 1 })?.kind).toBe("function")
    class Row {}
    expect(findNonJsonValue({ row: new Row() })?.kind).toBe("class instance(Row)")
  })

  it("순환 참조에서 멈춘다", () => {
    const value: Record<string, unknown> = { a: 1 }
    value.self = value
    expect(findNonJsonValue(value)).toBeNull()
  })
})

describe("assertJsonSafeInDev", () => {
  it("dev/test 에서는 위반 시 label 과 경로를 담아 던진다", () => {
    expect(() => assertJsonSafeInDev("snapshot", { m: new Map() })).toThrow(/snapshot: Map at \$\.m/)
    expect(assertJsonSafeInDev("ok", { a: 1 })).toEqual({ a: 1 })
  })

  it("프로덕션에서는 검사하지 않고 그대로 돌려준다", () => {
    vi.stubEnv("NODE_ENV", "production")
    const value = { m: new Map() }
    expect(assertJsonSafeInDev("snapshot", value)).toBe(value)
  })
})
