/* syncRev 가 '2. REV' 를 CZ 까지 읽고, Row ID 상태를 경고로만 싣는지(동기화 실패로 치지 않음) — ADR-011.
 * 시트·DB 는 목이다(원본 시트에 붙지 않는다). */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { FormattedCell } from "@/lib/branch/google-sheets"
import { fyOf } from "@/lib/branch/fiscal"

const readRangeWithFormat = vi.fn<(sheetId: string, range: string) => Promise<FormattedCell[][]>>()
const replaceBranchRevDeals = vi.fn(async (rows: unknown[]) => rows.length)
const replaceBranchDshMirror = vi.fn(async () => undefined)
const replaceBranchKpiMirror = vi.fn(async () => undefined)

vi.mock("@/lib/branch/google-sheets", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/branch/google-sheets")>()),
  readRangeWithFormat,
  envSheetId: () => "dashboard-sheet",
}))
vi.mock("@/lib/repositories/branch-deals", () => ({ replaceBranchRevDeals }))
vi.mock("@/lib/repositories/branch-dsh-kpi-mirror", () => ({ replaceBranchDshMirror, replaceBranchKpiMirror }))
vi.mock("@/lib/branch/parsers/dsh", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/branch/parsers/dsh")>()),
  parseDsh: () => [],
}))
vi.mock("@/lib/branch/parsers/kpi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/branch/parsers/kpi")>()),
  parseKpiBlocks: () => [],
}))

const plain = (value: string | number | null): FormattedCell => ({ value, bg: null, fg: null })
const HEADER = ["Account", "Branch", "Location", "Scale", "Importance", "Team", "Manager", "Status", "Type", "Product", "First Payment", "Remark", "Sum", "4", "w1"].map(plain)

function revGrid(opts: { rowIdHeader: boolean; ids: Array<string | null>; extraRows?: number }): FormattedCell[][] {
  const header = opts.rowIdHeader ? [...HEADER, plain("Row ID")] : HEADER
  const rows = opts.ids.map((id, i) => [plain(`학원${i}`), ...Array.from({ length: 13 }, () => plain(null)), plain(100), plain(id)])
  const filler = Array.from({ length: opts.extraRows ?? 0 }, () => [plain(null)])
  return [[plain("REV")], header, ...rows, ...filler]
}

function serve(rev: FormattedCell[][]) {
  readRangeWithFormat.mockImplementation(async (_sheetId, range) => (range.startsWith("'2. REV'") ? rev : []))
}

describe("syncRev — Row ID 경고", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("'2. REV' 는 A1:CZ1000 으로 읽는다(Row ID 열 CG 포함)", async () => {
    serve(revGrid({ rowIdHeader: true, ids: ["r_0123456789ab"] }))
    const { syncRev } = await import("@/lib/branch/sync/sync-rev")
    await syncRev()
    expect(readRangeWithFormat).toHaveBeenCalledWith("dashboard-sheet", "'2. REV'!A1:CZ1000")
  })

  it("Row ID 열이 없어도 동기화는 성공 — 경고 문구만 싣는다", async () => {
    serve(revGrid({ rowIdHeader: false, ids: [null, null] }))
    const { syncRev } = await import("@/lib/branch/sync/sync-rev")
    const result = await syncRev()
    expect(result).toEqual({ rows: 2, warning: "Row ID 열 없음 — 시트 쓰기 불가(행 ID 스크립트 필요)" })
    expect(replaceBranchRevDeals).toHaveBeenCalledTimes(1)
  })

  it("없음·중복·형식 오류 건수를 싣고, 미러 행 raw 에 rowId·rowIdIssue 가 들어간다", async () => {
    serve(revGrid({ rowIdHeader: true, ids: ["r_0123456789ab", "r_abcdefghjkmn", "r_abcdefghjkmn", "nope", null] }))
    const { syncRev } = await import("@/lib/branch/sync/sync-rev")
    const result = await syncRev()
    expect(result.warning).toBe("Row ID 없음 1 · 중복 2 · 형식 오류 1")
    const rows = replaceBranchRevDeals.mock.calls[0][0] as Array<{ raw: { rowId: string | null; rowIdIssue: string | null; weeklyColors: Record<string, string> } }>
    expect(rows.map((r) => [r.raw.rowId, r.raw.rowIdIssue])).toEqual([
      ["r_0123456789ab", null],
      [null, "duplicate"],
      [null, "duplicate"],
      [null, "invalid"],
      [null, null],
    ])
    // syncRev 는 refFy = fyOf(오늘) 로 월 머리 "4" 를 그 회계연도 4월로 읽는다.
    expect(rows[0].raw.weeklyColors).toEqual({ [`${fyOf(new Date())}-04`]: "k" })
  })

  it("모든 행에 고유 ID 가 있으면 경고 없음", async () => {
    serve(revGrid({ rowIdHeader: true, ids: ["r_0123456789ab", "r_abcdefghjkmn"] }))
    const { syncRev } = await import("@/lib/branch/sync/sync-rev")
    expect(await syncRev()).toEqual({ rows: 2, warning: undefined })
  })

  it("범위 상한 경고와 함께면 상한 경고가 앞(화면은 첫 경고만 보인다)", async () => {
    serve(revGrid({ rowIdHeader: false, ids: ["r_0123456789ab"], extraRows: 997 }))
    const { syncRev } = await import("@/lib/branch/sync/sync-rev")
    const { warning } = await syncRev()
    const parts = warning?.split(" / ") ?? []
    expect(parts).toHaveLength(2)
    expect(parts[0]).toMatch(/^REV 범위\('2\. REV'!A1:CZ1000\)가 상한에 도달했습니다/)
    expect(parts[1]).toBe("Row ID 열 없음 — 시트 쓰기 불가(행 ID 스크립트 필요)")
  })
})
