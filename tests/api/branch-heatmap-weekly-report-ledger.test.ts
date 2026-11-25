// 히트맵·주간 보고 라우트도 시트 행 + 장부 항목(D1, lib/branch/ledger-revenue.ts)으로 REV 딜을 읽는다.
// 리더·조립 함수는 목이다(가명 데이터). REV 매출 장부 화면(rev-sheet)의 장부 입력 배지 문구도 여기서 본다.
import { readFileSync } from "fs"
import { join } from "path"
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  managerFromRequest: vi.fn(),
  readLedger: vi.fn(),
  computeHeatmap: vi.fn(),
  weeklyReport: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin, BRANCH_READ_ADMIN_API_ROLES: ["ADMIN"] }))
vi.mock("@/lib/admin/personal-branch", () => ({ branchManagerFromRequest: mocks.managerFromRequest }))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
vi.mock("@/lib/branch/ledger-revenue", async () => ({
  ...(await vi.importActual<typeof import("@/lib/branch/ledger-revenue")>("@/lib/branch/ledger-revenue")),
  readLedgerRevenueDeals: mocks.readLedger,
}))
vi.mock("@/lib/branch/computations/heatmap", () => ({ computeHeatmap: mocks.computeHeatmap }))
vi.mock("@/lib/branch/weekly-report", () => ({ buildBranchWeeklyCompassReport: mocks.weeklyReport }))

function deal(id: string, team: string, manager: string): BranchRevDeal {
  return {
    id, sheet_row: 1, customer_name: id, branch_contact: null, team, manager, deal_type: null, status: null,
    first_payment: null, product_version: null, region: null, importance: null, note: null, contract_target: 0,
    monthly_payments: {}, monthly_red: {}, monthly_confirmed: {}, monthly_high_conf: {}, raw: {}, synced_at: "",
  }
}

const DEALS = [deal("line-a", "BD", "예시A"), deal("ledger-e-1", "BD", "예시a"), deal("line-c", "MKT", "예시C")]

beforeEach(() => {
  vi.clearAllMocks()
  mocks.verifyAdmin.mockResolvedValue(null)
  mocks.managerFromRequest.mockResolvedValue(null)
  mocks.readLedger.mockResolvedValue({ deals: DEALS, sheetOnlyDeals: [], source: { kind: "import", asOf: null }, info: {} })
  mocks.computeHeatmap.mockReturnValue([])
  mocks.weeklyReport.mockResolvedValue({ ok: true })
})

describe("GET /api/admin/branch/heatmap — 시트 행 + 장부 항목", () => {
  it("팀 범위로 좁힌 D1 딜을 넘긴다", async () => {
    const { GET } = await import("@/app/api/admin/branch/heatmap/route")
    const response = await GET(new NextRequest("https://classin.kr/api/admin/branch/heatmap?team=BD&period=M&month=2026-11"))
    expect(response.status).toBe(200)
    expect(mocks.readLedger).toHaveBeenCalledWith({ fiscalYear: 2026 })
    const [deals, period, , team] = mocks.computeHeatmap.mock.calls[0]
    expect((deals as BranchRevDeal[]).map((d) => d.id)).toEqual(["line-a", "ledger-e-1"])
    expect(period).toBe("M")
    expect(team).toBe("BD")
  })

  it("담당 범위는 전 팀에서 그 담당(대소문자 무시)만", async () => {
    mocks.managerFromRequest.mockResolvedValue("예시A")
    const { GET } = await import("@/app/api/admin/branch/heatmap/route")
    await GET(new NextRequest("https://classin.kr/api/admin/branch/heatmap?team=MKT&period=M&month=2026-11"))
    const [deals, , , team] = mocks.computeHeatmap.mock.calls[0]
    expect((deals as BranchRevDeal[]).map((d) => d.id)).toEqual(["line-a", "ledger-e-1"])
    expect(team).toBe("ALL")
  })
})

describe("GET /api/admin/branch/weekly-report — 시트 행 + 장부 항목", () => {
  it("KA 구획 조립에 D1 딜(KST 영업 회계연도)을 넘긴다", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-11-25T03:00:00.000Z"))
    const { GET } = await import("@/app/api/admin/branch/weekly-report/route")
    const response = await GET(new NextRequest("https://classin.kr/api/admin/branch/weekly-report?team=ALL"))
    expect(response.status).toBe(200)
    expect(mocks.readLedger).toHaveBeenCalledWith({ fiscalYear: 2026 })
    expect(mocks.weeklyReport).toHaveBeenCalledWith({ team: "ALL", manager: null, deals: DEALS })
    vi.useRealTimers()
  })
})

describe("REV 매출 장부(rev-sheet) — 장부 입력 배지(D1)", () => {
  it("'미반영' 경고 대신 '장부 입력 N건 포함' 안내를 보이고, 링크는 열 필터 없이 연다", () => {
    const page = readFileSync(join(process.cwd(), "app/admin/crm/deals/rev-sheet/page.tsx"), "utf8")
    const banner = page.slice(page.indexOf("function ManualLedgerGapBanner"), page.indexOf("function BreakdownTable"))
    expect(banner).toContain("장부 입력 {formatNumber(gap.count)}건 포함")
    expect(banner).not.toContain("반영되지 않았습니다")
    expect(banner).not.toContain("AlertCircle")
    expect(banner).toContain('role="status"')
    expect(banner).not.toContain("amber")
    expect(banner).toContain("LEDGER_MANUAL_ENTRIES_HREF")
    // 장부에서 온 행은 시트 행 번호 대신 '장부 입력'으로 보인다.
    expect(page).toContain('row.ledgerEntry ? "장부 입력" : `#${row.sheetRow}`')
  })
})

describe("AI 인사이트 입력 — 시트 행 + 장부 항목", () => {
  it("runner 는 REV 딜을 readLedgerRevenueDeals(KST 회계연도)로 읽는다", () => {
    const runner = readFileSync(join(process.cwd(), "lib/branch/insights/runner.ts"), "utf8")
    expect(runner).toContain("readLedgerRevenueDeals({ fiscalYear: fyOf(now), now })")
    expect(runner).not.toContain("listBranchRevDeals()")
  })

  it("runner 는 DSH 를 같은 D1 딜로 applyLedgerStatusToDsh 에 통과시킨 뒤 입력을 만든다(D4)", () => {
    const runner = readFileSync(join(process.cwd(), "lib/branch/insights/runner.ts"), "utf8")
    const applied = runner.indexOf("applyLedgerStatusToDsh({ dsh: sheetDsh, fiscalYear: fyOf(now), now, deals })")
    expect(applied).toBeGreaterThan(-1)
    expect(applied).toBeLessThan(runner.indexOf("buildInsightInput({"))
  })
})
