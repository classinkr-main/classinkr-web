/* 동기화가 파싱 진단(F-28 금액으로 못 읽은 칸 · F-15 월 칸 ≠ 주차 합)을 경고로 싣는다 — 동기화 실패로 치지 않는다.
 * 시트·DB 는 목이다(원본 시트에 붙지 않는다). */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { FormattedCell } from "@/lib/branch/google-sheets"
import type { DshParseStats } from "@/lib/branch/parsers/dsh"

const readRangeWithFormat = vi.fn<(sheetId: string, range: string) => Promise<FormattedCell[][]>>()
const replaceBranchRevDeals = vi.fn(async (rows: unknown[]) => rows.length)
const replaceBranchDshMirror = vi.fn(async () => 3)
const replaceBranchKpiMirror = vi.fn(async () => 2)
const dshStats: { current: DshParseStats } = { current: { unparsedAmountCells: 0, unparsedSamples: [] } }

vi.mock("server-only", () => ({}))
vi.mock("@/lib/branch/google-sheets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/branch/google-sheets")>()),
  readRangeWithFormat,
  envSheetId: () => "dashboard-sheet",
}))
vi.mock("@/lib/repositories/branch-deals", () => ({ replaceBranchRevDeals }))
vi.mock("@/lib/repositories/branch-dsh-kpi-mirror", () => ({ replaceBranchDshMirror, replaceBranchKpiMirror }))
vi.mock("@/lib/branch/parsers/dsh", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/branch/parsers/dsh")>()),
  parseDshWithStats: () => ({ output: { rows: [], members: {} }, stats: dshStats.current }),
}))
vi.mock("@/lib/branch/parsers/kpi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/branch/parsers/kpi")>()),
  parseKpiBlocks: () => [],
}))

const plain = (value: string | number | null): FormattedCell => ({ value, bg: null, fg: null })
const HEADER = ["Account", "Branch", "Location", "Scale", "Importance", "Team", "Manager", "Status", "Type", "Product", "First Payment", "Remark", "Sum", "4", "w1", "Row ID"].map(plain)

// 4월 월 칸에 금액이 아닌 글자 — 파서가 못 읽은 칸으로 센다.
function revGrid(monthCell: string | number): FormattedCell[][] {
  const row = [plain("학원0"), ...Array.from({ length: 12 }, () => plain(null)), plain(monthCell), plain(null), plain("r_0123456789ab")]
  return [[plain("REV")], HEADER, row]
}

function serve(rev: FormattedCell[][]) {
  readRangeWithFormat.mockImplementation(async (_sheetId, range) => (range.startsWith("'2. REV'") ? rev : []))
}

describe("syncRev·syncDshKpi — 파싱 진단 경고", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    dshStats.current = { unparsedAmountCells: 0, unparsedSamples: [] }
  })

  it("문제가 없으면 경고 없음", async () => {
    serve(revGrid(100))
    const { syncRev } = await import("@/lib/branch/sync/sync-rev")
    expect(await syncRev({ refFy: 2026 })).toEqual({ rows: 1, warning: undefined })
  })

  it("REV 금액으로 못 읽은 칸을 견본과 함께 싣는다", async () => {
    serve(revGrid("확인 필요"))
    const { syncRev } = await import("@/lib/branch/sync/sync-rev")
    const result = await syncRev({ refFy: 2026 })
    expect(result.rows).toBe(1)
    expect(result.warning).toMatch(/^REV 금액으로 못 읽은 칸 1개\(\d+행 '확인 필요'\)$/)
  })

  it("DSH 금액으로 못 읽은 칸도 syncRev·syncDshKpi 둘 다 싣는다", async () => {
    dshStats.current = { unparsedAmountCells: 2, unparsedSamples: [{ row: 9, col: 4, text: "n/a" }] }
    serve(revGrid(100))
    const { syncRev, syncDshKpi } = await import("@/lib/branch/sync/sync-rev")
    expect((await syncRev({ refFy: 2026 })).warning).toBe("DSH 금액으로 못 읽은 칸 2개(9행 'n/a')")
    expect(await syncDshKpi({ refFy: 2026 })).toEqual({ rows: 5, warning: "DSH 금액으로 못 읽은 칸 2개(9행 'n/a')" })
  })

  it("syncDshKpi 는 경고가 없으면 키를 싣지 않는다", async () => {
    serve(revGrid(100))
    const { syncDshKpi } = await import("@/lib/branch/sync/sync-rev")
    expect(await syncDshKpi({ refFy: 2026 })).toEqual({ rows: 5 })
  })
})
