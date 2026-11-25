// 시트 고정 스위치(BRANCH_REV_SHEET_LOCKED_AT, D5) — 상태 판정·KST 경계·문구. 순수 모듈이라 목이 없다.
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  currentRevSheetLock,
  formatLockDayLabel,
  formatLockDayShort,
  isRevSheetLockActive,
  resolveRevSheetLock,
  REV_SHEET_LOCK_ENV,
  revLockedSyncNote,
  revSheetFrozenLabel,
  revSheetLockNotice,
  revSheetLockView,
  revSnapshotRereadDoneNote,
  revSnapshotRereadLabel,
  sheetWrittenReverseLockedMessage,
} from "@/lib/branch/rev-sheet-lock"

describe("resolveRevSheetLock — 상태 4가지", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
  })
  afterEach(() => vi.restoreAllMocks())

  it.each([undefined, null, "", "   "])("%j → unset(지금 동작)", (raw) => {
    expect(resolveRevSheetLock(raw, "2026-12-05")).toEqual({ state: "unset", lockedAt: null, lockMonth: null })
  })

  it("날짜 전이면 scheduled, 당일·이후면 active — 고정 달(lockMonth)도 싣는다", () => {
    expect(resolveRevSheetLock("2026-12-01", "2026-11-30")).toEqual({ state: "scheduled", lockedAt: "2026-12-01", lockMonth: "2026-12" })
    expect(resolveRevSheetLock("2026-12-01", "2026-12-01")).toEqual({ state: "active", lockedAt: "2026-12-01", lockMonth: "2026-12" })
    expect(resolveRevSheetLock("2026-12-01", "2026-12-02").state).toBe("active")
    expect(resolveRevSheetLock("2026-12-01", "2027-04-01").state).toBe("active")
  })

  it("앞뒤 공백은 지운다", () => {
    expect(resolveRevSheetLock(" 2026-12-01 ", "2026-12-01")).toMatchObject({ state: "active", lockedAt: "2026-12-01" })
  })

  it.each(["2026-12-1", "12/1", "2026-02-30", "2026-13-01", "20261201", "2026-12-01T00:00", "garbage"])(
    "%s → invalid(경고, 그다음은 unset 과 같다)",
    (raw) => {
      expect(resolveRevSheetLock(raw, "2026-12-05")).toEqual({ state: "invalid", lockedAt: null, lockMonth: null })
    },
  )

  it("형식이 틀린 값은 값마다 한 번만 경고한다", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    resolveRevSheetLock("2026/12/01-once", "2026-12-05")
    resolveRevSheetLock("2026/12/01-once", "2026-12-06")
    resolveRevSheetLock("2026/12/01-once", "2026-12-07")
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain(REV_SHEET_LOCK_ENV)
  })

  it("isRevSheetLockActive 는 active 만 참", () => {
    expect(isRevSheetLockActive(resolveRevSheetLock("2026-12-01", "2026-12-01"))).toBe(true)
    expect(isRevSheetLockActive(resolveRevSheetLock("2026-12-01", "2026-11-30"))).toBe(false)
    expect(isRevSheetLockActive(resolveRevSheetLock("", "2026-11-30"))).toBe(false)
    expect(isRevSheetLockActive(null)).toBe(false)
  })
})

describe("currentRevSheetLock — process.env 와 KST 날짜", () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it("12/1 0시 KST(= 11/30 15:00Z) 직전은 scheduled, 그 순간부터 active — UTC 날짜를 쓰지 않는다", () => {
    vi.stubEnv("BRANCH_REV_SHEET_LOCKED_AT", "2026-12-01")
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-30T14:59:59Z"))
    expect(currentRevSheetLock().state).toBe("scheduled")
    vi.setSystemTime(new Date("2026-11-30T15:00:00Z"))
    expect(currentRevSheetLock().state).toBe("active")
    // now 를 넘기면 그 시각으로 판정한다.
    expect(currentRevSheetLock(new Date("2026-11-30T14:00:00Z")).state).toBe("scheduled")
  })

  it("env 가 없으면 unset", () => {
    vi.stubEnv("BRANCH_REV_SHEET_LOCKED_AT", "")
    expect(currentRevSheetLock(new Date("2026-12-05T00:00:00Z")).state).toBe("unset")
  })

  it("env 키를 리터럴로 읽는다(변수 키로 바꾸면 번들러가 못 찾아 조용히 unset 이 된다)", () => {
    const source = readFileSync(join(process.cwd(), "lib/branch/rev-sheet-lock.ts"), "utf8")
    const body = /export function currentRevSheetLock\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ""
    expect(body).toMatch(/\bprocess\.env\.BRANCH_REV_SHEET_LOCKED_AT\b/)
    expect(body).not.toMatch(/process\.env\[/)
  })

  it("클라이언트 겸용이다(server-only 없음)", () => {
    const source = readFileSync(join(process.cwd(), "lib/branch/rev-sheet-lock.ts"), "utf8")
    expect(source).not.toMatch(/import ["']server-only["']/)
  })
})

describe("응답 모양·문구", () => {
  it("revSheetLockView — scheduled·active 만 {lockedAt, active}, 나머지는 null", () => {
    expect(revSheetLockView(resolveRevSheetLock("2026-12-01", "2026-11-30"))).toEqual({ lockedAt: "2026-12-01", active: false })
    expect(revSheetLockView(resolveRevSheetLock("2026-12-01", "2026-12-01"))).toEqual({ lockedAt: "2026-12-01", active: true })
    expect(revSheetLockView(resolveRevSheetLock("", "2026-12-01"))).toBeNull()
    expect(revSheetLockView({ state: "invalid", lockedAt: null, lockMonth: null })).toBeNull()
  })

  it("날짜 라벨은 고정 날짜에서 만든다", () => {
    expect(formatLockDayLabel("2026-12-01")).toBe("12월 1일")
    expect(formatLockDayShort("2026-12-01")).toBe("12/1")
    expect(formatLockDayLabel("2027-01-15")).toBe("1월 15일")
    expect(revSheetFrozenLabel("2026-12-01")).toBe("12/1 고정")
    expect(revSheetLockNotice("2026-12-01")).toBe("시트는 12월 1일 기준으로 고정 — 이후 원본은 장부")
    expect(revSnapshotRereadLabel("2026-12-01")).toBe("12/1 스냅샷 다시 읽기")
    expect(revSnapshotRereadDoneNote("2026-12-01")).toBe(
      "12/1 스냅샷을 다시 읽었습니다 — 장부 기준값을 방금 읽은 시트 값으로 바꿨습니다",
    )
  })

  it("고정 중 동기화 문구 — 실제로 읽은 것만 말한다", () => {
    expect(revLockedSyncNote("2026-12-01", ["dsh", "hw"])).toBe(
      "DSH·KPI·하드웨어만 읽었습니다(REV 시트는 12월 1일 기준으로 고정돼 다시 읽지 않음)",
    )
    expect(revLockedSyncNote("2026-12-01", ["dsh"])).toBe("DSH·KPI만 읽었습니다(REV 시트는 12월 1일 기준으로 고정돼 다시 읽지 않음)")
    expect(revLockedSyncNote("2026-12-01", ["hw"])).toBe("하드웨어만 읽었습니다(REV 시트는 12월 1일 기준으로 고정돼 다시 읽지 않음)")
  })

  it("F-22 — 고정 뒤 되돌리기 가드 문구(결정 문구 그대로)", () => {
    expect(sheetWrittenReverseLockedMessage("2026-12-01")).toBe(
      "시트는 12월 1일 기준으로 고정돼 되돌릴 수 없습니다 — 장부에서 원래 값으로 다시 입력하세요",
    )
  })
})
