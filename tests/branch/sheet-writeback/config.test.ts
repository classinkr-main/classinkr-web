import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import {
  currentSheetWriteMode,
  REV_WRITE_MAX_DRAFTS,
  REV_WRITE_READ_RANGE,
  REV_WRITE_TARGET,
  REV_WRITE_TIMEOUT_MS,
  resolveSheetWriteMode,
} from "@/lib/branch/sheet-writeback/config"

describe("resolveSheetWriteMode — 글자 그대로 '1' + 'production' 일 때만 켜짐", () => {
  it.each([
    [{ BRANCH_REV_SHEET_WRITE_ENABLED: "1", VERCEL_ENV: "production" }, "on"],
    [{ BRANCH_REV_SHEET_WRITE_ENABLED: "1", VERCEL_ENV: "preview" }, "off"],
    [{ BRANCH_REV_SHEET_WRITE_ENABLED: "1", VERCEL_ENV: "development" }, "off"],
    [{ BRANCH_REV_SHEET_WRITE_ENABLED: "1" }, "off"],
    [{ BRANCH_REV_SHEET_WRITE_ENABLED: " 1", VERCEL_ENV: "production" }, "off"],
    [{ BRANCH_REV_SHEET_WRITE_ENABLED: "true", VERCEL_ENV: "production" }, "off"],
    [{ BRANCH_REV_SHEET_WRITE_ENABLED: "01", VERCEL_ENV: "production" }, "off"],
    [{ BRANCH_REV_SHEET_WRITE_ENABLED: "", VERCEL_ENV: "production" }, "off"],
    [{ VERCEL_ENV: "production" }, "off"],
    [{ BRANCH_REV_SHEET_WRITE_ENABLED: "1", VERCEL_ENV: "Production" }, "off"],
    [{}, "off"],
  ] as const)("%j → %s", (env, expected) => {
    expect(resolveSheetWriteMode(env)).toBe(expected)
  })
})

describe("currentSheetWriteMode — process.env 를 읽는다", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("Production + '1' 이면 on, 하나라도 빠지면 off", () => {
    vi.stubEnv("BRANCH_REV_SHEET_WRITE_ENABLED", "1")
    vi.stubEnv("VERCEL_ENV", "production")
    expect(currentSheetWriteMode()).toBe("on")
    vi.stubEnv("VERCEL_ENV", "preview")
    expect(currentSheetWriteMode()).toBe("off")
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("BRANCH_REV_SHEET_WRITE_ENABLED", "")
    expect(currentSheetWriteMode()).toBe("off")
  })

  it("env 키를 리터럴로 읽는다(변수 키로 바꾸면 번들러가 못 찾아 조용히 꺼진다)", () => {
    const source = readFileSync(join(process.cwd(), "lib/branch/sheet-writeback/config.ts"), "utf8")
    const body = /export function currentSheetWriteMode\(\)[^{]*\{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ""
    expect(body).toMatch(/\bprocess\.env\.BRANCH_REV_SHEET_WRITE_ENABLED\b/)
    expect(body).toMatch(/\bprocess\.env\.VERCEL_ENV\b/)
    expect(body).not.toMatch(/process\.env\[/)
  })
})

describe("쓰기 대상 상수(실측)", () => {
  it("'2. REV' 한 탭만 가리킨다", () => {
    expect(REV_WRITE_TARGET).toEqual({
      spreadsheetId: "1vBYyKc_pd5Kb2xyhDWG8lWMAd7fGsRcBoF_wK1wUc7Q",
      tabTitle: "2. REV",
      sheetId: 957802439,
    })
    expect(REV_WRITE_READ_RANGE).toBe("'2. REV'!A1:CZ1000")
  })

  it("한 번 50건·호출당 8초 — 읽기+쓰기+되돌리기가 라우트 maxDuration 60 안에 든다", () => {
    expect(REV_WRITE_MAX_DRAFTS).toBe(50)
    expect(REV_WRITE_TIMEOUT_MS).toBe(8_000)
    expect(REV_WRITE_TIMEOUT_MS * 3).toBeLessThan(60_000)
  })
})
