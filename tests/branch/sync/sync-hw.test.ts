/* syncHw 가 빈/이상 파싱 결과로 HW 미러를 비우지 않는지 — 시트·DB 는 목이다. */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { FormattedCell } from "@/lib/branch/google-sheets"
import { HW_RANGES } from "@/lib/branch/parsers/hw"

const readRangeWithFormat = vi.fn<(sheetId: string, range: string) => Promise<FormattedCell[][]>>()
const replaceHwInbound = vi.fn(async (rows: unknown[]) => rows.length)
const replaceHwOutbound = vi.fn(async (rows: unknown[]) => rows.length)
const replaceHwStock = vi.fn(async (rows: unknown[]) => rows.length)
const replaceHwSalesMonthly = vi.fn(async (rows: unknown[]) => rows.length)

vi.mock("@/lib/branch/google-sheets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/branch/google-sheets")>()),
  readRangeWithFormat,
  envSheetId: () => "hw-sheet",
}))
vi.mock("@/lib/repositories/branch-hw", () => ({ replaceHwInbound, replaceHwOutbound, replaceHwStock, replaceHwSalesMonthly }))

const c = (value: string | number | null): FormattedCell => ({ value, bg: null, fg: null })
const header = [c("h")]
const inboundRows = [header, [c("L1"), c("2026-01-02"), c("Pen"), c(3)]]
const outboundRows = [header, [c("L1"), c("2026-01-03"), c("o"), c("Pen"), c(1)]]

function serve(grids: { inbound: FormattedCell[][]; outbound: FormattedCell[][]; sales?: FormattedCell[][] }) {
  readRangeWithFormat.mockImplementation(async (_id, range) => {
    if (range === HW_RANGES.inbound) return grids.inbound
    if (range === HW_RANGES.outbound) return grids.outbound
    if (range === HW_RANGES.sales) return grids.sales ?? []
    return []
  })
}

describe("syncHw — 빈 파싱 가드", () => {
  beforeEach(() => vi.clearAllMocks())

  it("입고 0행이면 reject, 어떤 replace 도 호출 안 함", async () => {
    serve({ inbound: [header], outbound: outboundRows })
    const { syncHw } = await import("@/lib/branch/sync/sync-hw")
    await expect(syncHw()).rejects.toThrow(/입고 0행/)
    expect(replaceHwInbound).not.toHaveBeenCalled()
    expect(replaceHwOutbound).not.toHaveBeenCalled()
    expect(replaceHwStock).not.toHaveBeenCalled()
    expect(replaceHwSalesMonthly).not.toHaveBeenCalled()
  })

  it("출고 0행이면 reject", async () => {
    serve({ inbound: inboundRows, outbound: [] })
    const { syncHw } = await import("@/lib/branch/sync/sync-hw")
    await expect(syncHw()).rejects.toThrow(/출고 0행/)
    expect(replaceHwInbound).not.toHaveBeenCalled()
  })

  it("정상 입력은 모두 교체한다", async () => {
    serve({ inbound: inboundRows, outbound: outboundRows })
    const { syncHw } = await import("@/lib/branch/sync/sync-hw")
    const r = await syncHw()
    expect(r.inbound).toBe(1)
    expect(replaceHwInbound).toHaveBeenCalledTimes(1)
  })
})
