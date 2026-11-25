// 시트 고정(BRANCH_REV_SHEET_LOCKED_AT) 날짜가 되면 쓰기 플래그와 상관없이 시트 쓰기가 꺼진다(F-07). 고정 전·없음·형식 틀림은 지금 그대로.
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { currentSheetWriteMode, resolveSheetWriteMode } from "@/lib/branch/sheet-writeback/config"

const ON = { BRANCH_REV_SHEET_WRITE_ENABLED: "1", VERCEL_ENV: "production" }

describe("resolveSheetWriteMode — 고정 날짜(오늘은 직접 넘긴다)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([
    ["고정 날짜가 지났다", { ...ON, BRANCH_REV_SHEET_LOCKED_AT: "2026-11-01" }, "2026-11-25", "off"],
    ["고정 당일", { ...ON, BRANCH_REV_SHEET_LOCKED_AT: "2026-12-01" }, "2026-12-01", "off"],
    ["고정 예정(날짜 전)", { ...ON, BRANCH_REV_SHEET_LOCKED_AT: "2026-12-01" }, "2026-11-30", "on"],
    ["형식이 틀림(무시)", { ...ON, BRANCH_REV_SHEET_LOCKED_AT: "garbage" }, "2026-12-05", "on"],
    ["비어 있음", { ...ON, BRANCH_REV_SHEET_LOCKED_AT: "" }, "2026-12-05", "on"],
    ["플래그 꺼짐 + 고정", { VERCEL_ENV: "production", BRANCH_REV_SHEET_LOCKED_AT: "2026-12-01" }, "2026-12-05", "off"],
  ] as const)("%s → %s", (_label, env, today, expected) => {
    expect(resolveSheetWriteMode(env, today)).toBe(expected)
  })
})

describe("currentSheetWriteMode — 고정 판정은 KST 날짜", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it("11/30 15:00Z(= 12/1 0시 KST)부터 꺼진다", () => {
    vi.stubEnv("BRANCH_REV_SHEET_WRITE_ENABLED", "1")
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("BRANCH_REV_SHEET_LOCKED_AT", "2026-12-01")
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-30T14:59:59Z"))
    expect(currentSheetWriteMode()).toBe("on")
    vi.setSystemTime(new Date("2026-11-30T15:00:00Z"))
    expect(currentSheetWriteMode()).toBe("off")
  })

  it("고정 env 도 리터럴로 읽는다", () => {
    const source = readFileSync(join(process.cwd(), "lib/branch/sheet-writeback/config.ts"), "utf8")
    const body = /export function currentSheetWriteMode\(\)[^{]*\{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ""
    expect(body).toMatch(/\bprocess\.env\.BRANCH_REV_SHEET_LOCKED_AT\b/)
    expect(body).not.toMatch(/process\.env\[/)
  })
})
