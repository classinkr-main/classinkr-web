import { afterEach, describe, expect, it, vi } from "vitest"

import { aggregateDshTotals } from "@/components/admin/branch/ledger/dsh-derive"
import { applyLedgerStatusToDsh, DSH_LEDGER_STATUS_FAILED } from "@/lib/branch/dsh-ledger"
import { resolveRevSheetLock } from "@/lib/branch/rev-sheet-lock"
import { dshFixture, FY, mergedDeals } from "./helpers/dsh-ledger-fixture"

// DSH 실적 장부 교체의 서버 진입점(D4) — 고정이 적용 중일 때만 일하고, 실패해도 summary 를 깨지 않는다.

const DEC20 = new Date("2026-12-20T03:00:00Z")

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe("applyLedgerStatusToDsh", () => {
  it("고정 없음·예정이면 입력을 같은 참조로 돌려주고 info 는 null · 딜 로더를 부르지 않는다", async () => {
    const dsh = dshFixture()
    const loader = vi.fn(async () => mergedDeals())
    for (const lock of [resolveRevSheetLock(undefined, "2026-12-20"), resolveRevSheetLock("2027-01-01", "2026-12-20")]) {
      const result = await applyLedgerStatusToDsh({ dsh, fiscalYear: FY, now: DEC20, deals: loader, lock })
      expect(result.dsh).toBe(dsh)
      expect(result.info).toBeNull()
    }
    expect(loader).not.toHaveBeenCalled()
  })

  it("env 가 형식이 틀리면(invalid) 지금 동작 그대로", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.stubEnv("BRANCH_REV_SHEET_LOCKED_AT", "2026-12")
    const dsh = dshFixture()
    const result = await applyLedgerStatusToDsh({ dsh, fiscalYear: FY, now: DEC20, deals: mergedDeals() })
    expect(result).toEqual({ dsh, info: null })
  })

  it("env 고정 날짜는 KST 로 본다 — 11/30 23:59 KST 는 그대로, 12/1 00:05 KST 부터 장부 실적", async () => {
    vi.stubEnv("BRANCH_REV_SHEET_LOCKED_AT", "2026-12-01")
    const dsh = dshFixture()
    const before = await applyLedgerStatusToDsh({ dsh, fiscalYear: FY, now: new Date("2026-11-30T14:59:00Z"), deals: mergedDeals() })
    expect(before.info).toBeNull()
    const after = await applyLedgerStatusToDsh({ dsh, fiscalYear: FY, now: new Date("2026-11-30T15:05:00Z"), deals: mergedDeals() })
    expect(after.info).toMatchObject({ lockedAt: "2026-12-01", lockMonth: "2026-12" })
    // 12/1 은 고정 달이라 비교값을 싣는다.
    expect(after.info?.sheetCompare?.month).toBe("2026-12")
  })

  it("적용 중이면 장부 실적으로 바꿔 끼운다 — 딜은 배열이든 로더든 같다", async () => {
    const lock = resolveRevSheetLock("2026-12-01", "2026-12-20")
    const fromArray = await applyLedgerStatusToDsh({ dsh: dshFixture(), fiscalYear: FY, now: DEC20, deals: mergedDeals(), lock })
    const fromLoader = await applyLedgerStatusToDsh({ dsh: dshFixture(), fiscalYear: FY, now: DEC20, deals: async () => mergedDeals(), lock })
    expect(aggregateDshTotals(fromArray.dsh.breakdown ?? []).status.months["2026-12"]).toBe(57_000)
    expect(fromLoader).toEqual(fromArray)
    expect(fromArray.info?.error).toBeUndefined()
  })

  it("today 를 넘기면 그날로 판정한다(KPI 라우트처럼 now 를 달 1일로 낮춘 호출부) · 1월이면 비교값 없음", async () => {
    const lock = resolveRevSheetLock("2026-12-01", "2027-01-05")
    const result = await applyLedgerStatusToDsh({
      dsh: dshFixture(),
      fiscalYear: FY,
      now: new Date("2027-01-01T00:00:00Z"),
      today: "2027-01-05",
      deals: mergedDeals(),
      lock,
    })
    expect(result.info?.sheetCompare).toBeUndefined()
    expect(result.info?.ledgerMonths).toEqual(["2026-12", "2027-01", "2027-02", "2027-03"])
  })

  it("딜 읽기·계산이 던지면 시트 실적 그대로 + info.error — summary 를 깨지 않는다", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const lock = resolveRevSheetLock("2026-12-01", "2026-12-20")
    const dsh = dshFixture()
    const result = await applyLedgerStatusToDsh({
      dsh,
      fiscalYear: FY,
      now: DEC20,
      deals: async () => {
        throw new Error("entries read failed")
      },
      lock,
    })
    expect(result.dsh).toBe(dsh)
    expect(result.info).toEqual({ lockedAt: "2026-12-01", lockMonth: "2026-12", ledgerMonths: [], error: DSH_LEDGER_STATUS_FAILED })
    expect(error).toHaveBeenCalledOnce()
  })
})
