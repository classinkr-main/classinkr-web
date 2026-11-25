// GET /api/admin/branch/kpi — 매출 딜 = 시트 행 + 장부 항목(D1), DSH 실적 장부 배선(D4 — lib/branch/dsh-ledger.ts 계약).
// 멤버 딜 수는 장부 신규 행까지 세고, 담당 일치는 branchManagerMatches(F-42). 저장소·리더는 전부 목이다(가명 데이터).
import { NextRequest } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { BranchRevDeal } from "@/lib/repositories/branch-deals"

const mocks = vi.hoisted(() => ({
  verifyAdmin: vi.fn(),
  readDsh: vi.fn(),
  readKpi: vi.fn(),
  readLedger: vi.fn(),
  applyLedgerStatusToDsh: vi.fn(),
  managerFromRequest: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({ verifyAdmin: mocks.verifyAdmin, BRANCH_READ_ADMIN_API_ROLES: ["ADMIN"] }))
vi.mock("@/lib/admin/personal-branch", () => ({ branchManagerFromRequest: mocks.managerFromRequest }))
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: vi.fn() }))
vi.mock("@/lib/branch/read-dsh-kpi", () => ({ readDshPreferDb: mocks.readDsh, readKpiBlocksPreferDb: mocks.readKpi }))
vi.mock("@/lib/branch/ledger-revenue", async () => ({
  ...(await vi.importActual<typeof import("@/lib/branch/ledger-revenue")>("@/lib/branch/ledger-revenue")),
  readLedgerRevenueDeals: mocks.readLedger,
}))
vi.mock("@/lib/branch/dsh-ledger", () => ({ applyLedgerStatusToDsh: mocks.applyLedgerStatusToDsh }))

function deal(overrides: Partial<BranchRevDeal>): BranchRevDeal {
  return {
    id: "line-x", sheet_row: 1, customer_name: "예시학원X", branch_contact: null, team: "BD", manager: "예시A",
    deal_type: "Direct", status: "Renew", first_payment: null, product_version: null, region: null, importance: null,
    note: null, contract_target: 0, monthly_payments: { "2026-11": 10 }, monthly_red: {}, monthly_confirmed: {},
    monthly_high_conf: {}, raw: {}, synced_at: "", ...overrides,
  }
}

const DEALS = [
  deal({ id: "line-a", manager: "예시A", status: "Renew", first_payment: "2025-05-01" }),
  // 장부 신규 행(D1) — 담당 이름 대소문자가 시트 멤버와 다르다.
  deal({ id: "ledger-e-1", manager: "예시a", status: "New", raw: { ledgerDeal: { origin: "entry" } } }),
  deal({ id: "line-c", manager: "예시C", team: "MKT", status: "New" }),
]

const DSH = {
  members: { 예시A: "BD", 예시C: "MKT" },
  breakdown: [],
  rows: [
    { level: "team", team: "BD", kind: "goal", annual: 100, quarters: [0, 0, 100, 0], months: { "2026-11": 100 } },
    { level: "member", team: "BD", member: "예시A", kind: "goal", annual: 100, quarters: [0, 0, 100, 0], months: { "2026-11": 100 } },
    { level: "member", team: "BD", member: "예시A", kind: "status", annual: 10, quarters: [0, 0, 10, 0], months: { "2026-11": 10 } },
    { level: "team", team: "MKT", kind: "goal", annual: 50, quarters: [0, 0, 50, 0], months: { "2026-11": 50 } },
    { level: "member", team: "MKT", member: "예시C", kind: "goal", annual: 50, quarters: [0, 0, 50, 0], months: { "2026-11": 50 } },
  ],
}

function req(query: string) {
  return new NextRequest(`https://classin.kr/api/admin/branch/kpi${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  mocks.verifyAdmin.mockResolvedValue(null)
  mocks.managerFromRequest.mockResolvedValue(null)
  mocks.readDsh.mockResolvedValue(DSH)
  mocks.readKpi.mockResolvedValue({ fy: [], months: {} })
  mocks.readLedger.mockResolvedValue({ deals: DEALS, sheetOnlyDeals: [], source: { kind: "import", asOf: null }, info: {} })
  mocks.applyLedgerStatusToDsh.mockImplementation(async ({ dsh }: { dsh: unknown }) => ({ dsh, info: null }))
})

describe("GET /api/admin/branch/kpi — 시트 행 + 장부 항목", () => {
  it("멤버 딜 수에 장부 신규 행이 들어가고, 담당 일치는 대소문자를 가리지 않는다", async () => {
    const { GET } = await import("@/app/api/admin/branch/kpi/route")
    const body = await (await GET(req("?team=BD&period=M&month=2026-11"))).json()
    const member = body.members.find((row: { member: string }) => row.member === "예시A")
    expect(member).toMatchObject({ deals_total: 2, deals_confirmed: 1, new_renew: { new: 1, renew: 1 } })
    // 팀 범위(BD) 밖 딜은 세지 않는다.
    expect(body.members.some((row: { member: string }) => row.member === "예시C")).toBe(false)
    expect(mocks.readLedger).toHaveBeenCalledWith({ fiscalYear: 2026 })
  })

  it("D4: 전 팀 D1 딜로 DSH 실적을 바꾸고, 멤버 confirmed 는 바뀐 DSH 실적을 쓴다", async () => {
    mocks.applyLedgerStatusToDsh.mockImplementation(async ({ dsh }: { dsh: typeof DSH }) => ({
      dsh: { ...dsh, rows: dsh.rows.map((row) => (row.kind === "status" ? { ...row, months: { "2026-11": 77 }, annual: 77, quarters: [0, 0, 77, 0] } : row)) },
      info: { lockedAt: "2026-12-01", lockMonth: "2026-12", ledgerMonths: ["2026-12"] },
    }))
    const { GET } = await import("@/app/api/admin/branch/kpi/route")
    const body = await (await GET(req("?team=BD&period=M&month=2026-11"))).json()

    const args = mocks.applyLedgerStatusToDsh.mock.calls[0][0] as { dsh: unknown; fiscalYear: number; now: Date; deals: BranchRevDeal[] }
    expect(args.dsh).toBe(DSH)
    expect(args.fiscalYear).toBe(2026)
    // 팀 필터와 무관하게 전 팀(MKT 포함) 딜을 넘긴다 — Team KR = 모든 행.
    expect(args.deals.map((d) => d.id)).toEqual(["line-a", "ledger-e-1", "line-c"])
    // now 는 캐시 키의 달 1일이 아니라 실제 지금이다(고정 상태·읽는 날 판정).
    expect(args.now.getTime()).toBeGreaterThan(Date.UTC(2026, 10, 1))
    const member = body.members.find((row: { member: string }) => row.member === "예시A")
    expect(member).toMatchObject({ status: 77, confirmed: 77 })
  })

  it("담당 범위는 전 팀 딜에서 그 담당만 센다", async () => {
    mocks.managerFromRequest.mockResolvedValue("예시A")
    const { GET } = await import("@/app/api/admin/branch/kpi/route")
    const body = await (await GET(req("?team=MKT&period=M&month=2026-11&manager=예시A"))).json()
    expect(body.members).toHaveLength(1)
    expect(body.members[0]).toMatchObject({ member: "예시A", deals_total: 2 })
    expect(body.scope).toEqual({ manager: "예시A" })
  })
})
