// 동기화 부분 매핑(시트 고정 D5)·실행 기록 값·KST 회계연도(F-26)·크론 일정 문구(F-47) — 순수 함수.
import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { resolveRevSheetLock } from "@/lib/branch/rev-sheet-lock"
import { businessFy, fiscalYearOfYm } from "@/lib/branch/fiscal"
import {
  BRANCH_SYNC_CRON_PATH,
  BRANCH_SYNC_CRON_SCHEDULE_UTC,
  BRANCH_SYNC_KST_HOURS,
  BRANCH_SYNC_KST_MINUTE,
  formatBranchSyncSchedule,
  kstTimesOfDailyCron,
} from "@/lib/branch/sync/schedule"
import { planSyncParts, syncRunSourceFor } from "@/lib/branch/sync/sync-parts"

const ACTIVE = resolveRevSheetLock("2026-12-01", "2026-12-05")
const SCHEDULED = resolveRevSheetLock("2026-12-01", "2026-11-25")
const UNSET = resolveRevSheetLock(undefined, "2026-12-05")

describe("planSyncParts — 고정 전에는 요청 그대로", () => {
  it.each([
    ["크론(요청 없음)", undefined, ["rev", "hw"]],
    ["빈 요청", [], ["rev", "hw"]],
    ["장부·KR Team", ["rev", "hw"], ["rev", "hw"]],
    ["CRM 딜·매출시트", ["rev"], ["rev"]],
    ["하드웨어만", ["hw"], ["hw"]],
  ] as const)("%s", (_label, requested, parts) => {
    expect(planSyncParts(requested as never, UNSET)).toEqual({ parts })
    expect(planSyncParts(requested as never, SCHEDULED)).toEqual({ parts })
  })

  it("고정 전이면 스냅샷 다시 읽기 표시는 아무것도 바꾸지 않는다", () => {
    expect(planSyncParts(["rev"], SCHEDULED, { allowLockedRevRead: true })).toEqual({ parts: ["rev"] })
  })
})

describe("planSyncParts — 고정 중이면 rev → dsh", () => {
  it.each([
    ["크론(요청 없음)", undefined, ["dsh", "hw"]],
    ["장부·KR Team ['rev','hw']", ["rev", "hw"], ["dsh", "hw"]],
    ["CRM 딜·매출시트 ['rev']", ["rev"], ["dsh"]],
    ["하드웨어만", ["hw"], ["hw"]],
  ] as const)("%s", (_label, requested, parts) => {
    expect(planSyncParts(requested as never, ACTIVE)).toEqual({ parts, revSheetLock: { lockedAt: "2026-12-01", reread: false } })
  })

  it("관리자 스냅샷 다시 읽기(allowLockedRevRead)만 REV 를 읽는다", () => {
    expect(planSyncParts(["rev"], ACTIVE, { allowLockedRevRead: true })).toEqual({
      parts: ["rev"],
      revSheetLock: { lockedAt: "2026-12-01", reread: true },
    })
    // rev 를 요청하지 않았으면 다시 읽기가 아니다.
    expect(planSyncParts(["hw"], ACTIVE, { allowLockedRevRead: true })).toEqual({
      parts: ["hw"],
      revSheetLock: { lockedAt: "2026-12-01", reread: false },
    })
  })

  it("형식이 틀린 env(invalid)는 고정 전과 같다", () => {
    const invalid = { state: "invalid" as const, lockedAt: null, lockMonth: null }
    expect(planSyncParts(["rev", "hw"], invalid)).toEqual({ parts: ["rev", "hw"] })
  })
})

describe("syncRunSourceFor — REV 를 읽지 않은 런에 all·rev 를 남기지 않는다", () => {
  it.each([
    [["rev", "hw"], "all"],
    [["hw", "rev"], "all"],
    [["rev"], "rev"],
    [["hw"], "hw"],
    [["dsh", "hw"], "dsh+hw"],
    [["dsh"], "dsh"],
    [[], "all"],
  ] as const)("%j → %s", (parts, source) => {
    expect(syncRunSourceFor(parts)).toBe(source)
  })
})

describe("KST 업무일 회계연도(F-26)", () => {
  it("fiscalYearOfYm — 4월 시작(YYYY-MM-DD·YYYY-MM 모두)", () => {
    expect(fiscalYearOfYm("2026-12-01")).toBe(2026)
    expect(fiscalYearOfYm("2027-03-31")).toBe(2026)
    expect(fiscalYearOfYm("2027-04-01")).toBe(2027)
    expect(fiscalYearOfYm("2026-12")).toBe(2026)
  })

  it("businessFy — 2027-04-01 0시 KST(= 03-31 15:00Z)에 넘어간다(UTC 처럼 9시간 늦지 않다)", () => {
    expect(businessFy(new Date("2027-03-31T14:59:00Z"))).toBe(2026)
    expect(businessFy(new Date("2027-03-31T15:05:00Z"))).toBe(2027)
    expect(businessFy(new Date("2026-11-30T15:05:00Z"))).toBe(2026)
  })
})

describe("크론 일정 문구(F-47)", () => {
  it("vercel.json 의 sync-branch 일정이 상수와 같다 — 09·13·17시(KST)", () => {
    const vercel = JSON.parse(readFileSync(join(process.cwd(), "vercel.json"), "utf8")) as {
      crons: Array<{ path: string; schedule: string }>
    }
    const entry = vercel.crons.find((cron) => cron.path === BRANCH_SYNC_CRON_PATH)
    expect(entry?.schedule).toBe(BRANCH_SYNC_CRON_SCHEDULE_UTC)
    expect(kstTimesOfDailyCron(entry!.schedule)).toEqual({ minute: BRANCH_SYNC_KST_MINUTE, hours: [...BRANCH_SYNC_KST_HOURS] })
    expect(BRANCH_SYNC_KST_HOURS).toEqual([9, 13, 17])
  })

  it("화면 문구", () => {
    expect(formatBranchSyncSchedule()).toBe("매일 09·13·17시(KST)")
    expect(formatBranchSyncSchedule([9, 13], 30)).toBe("매일 09:30·13:30(KST)")
  })

  it("매일이 아닌 크론은 다루지 않는다", () => {
    expect(kstTimesOfDailyCron("0 0 * * 1-5")).toBeNull()
    expect(kstTimesOfDailyCron("*/5 * * * *")).toBeNull()
    expect(kstTimesOfDailyCron("0 15,23 * * *")).toEqual({ minute: 0, hours: [0, 8] })
  })
})
