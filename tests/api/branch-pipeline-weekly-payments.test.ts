// GET /api/admin/branch/pipeline — 주차 프로젝션(weeklyPayments) 회귀 가드.
// listRevRevenue(lib/branch/computations/pipeline.ts)는 deal.raw?.weeklyPayments로 주차
// 프로젝션을 계산한다. branch-deals.ts가 raw 컬럼을 기본 SELECT에서 빼도록 바뀐 뒤
// (withRaw opt-in), 이 라우트가 미러 폴백 시 withRaw:true를 넘기는 걸 깜빡하면
// weeklyPayments가 값은 있는데 조용히 텅 비어버린다 — 여기서 그 회귀를 잡는다.
import { NextRequest } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const verifyAdmin = vi.fn()
const readRevDealsFromActiveImport = vi.fn()
const listBranchRevDeals = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  verifyAdmin,
  BRANCH_READ_ADMIN_API_ROLES: ["ADMIN"],
}))

vi.mock("@/lib/repositories/sales-ledger-imports", () => ({
  readRevDealsFromActiveImport,
}))

vi.mock("@/lib/repositories/branch-deals", () => ({
  listBranchRevDeals,
}))

const MIRROR_DEAL = {
  id: "d1",
  sheet_row: 12,
  customer_name: "고객A",
  branch_contact: null,
  team: "BD",
  manager: "Han",
  deal_type: "Direct",
  status: "New",
  first_payment: null,
  product_version: null,
  region: "서울",
  importance: "A",
  note: null,
  contract_target: 1000,
  monthly_payments: { "2026-04": 100 },
  monthly_red: {},
  monthly_confirmed: {},
  monthly_high_conf: {},
  // DB-normalized weekly cells — 정석 경로(주차 프로젝션의 1차 소스).
  raw: { weeklyPayments: { "2026-04": [10, 20, 0, 0, 70] } },
  synced_at: "2026-07-01T00:00:00.000Z",
}

function pipelineRequest(query = "") {
  return new NextRequest(`https://classin.kr/api/admin/branch/pipeline${query}`)
}

describe("GET /api/admin/branch/pipeline — weeklyPayments regression guard", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("requests raw (withRaw:true) from the mirror fallback and keeps weeklyPayments populated", async () => {
    verifyAdmin.mockResolvedValue(null)
    readRevDealsFromActiveImport.mockResolvedValue(null)
    listBranchRevDeals.mockResolvedValue([MIRROR_DEAL])

    const { GET } = await import("@/app/api/admin/branch/pipeline/route")
    const res = await GET(pipelineRequest())
    const body = await res.json()

    // 미러 폴백 경로는 raw를 명시적으로 opt-in해야 한다 — 이 인자가 빠지면
    // branch-deals.ts 기본값(raw 제외)이 적용돼 weeklyPayments가 조용히 비게 된다.
    expect(listBranchRevDeals).toHaveBeenCalledWith(
      expect.objectContaining({ team: undefined }),
      { withRaw: true },
    )

    expect(res.status).toBe(200)
    expect(body.rows).toHaveLength(1)
    expect(body.rows[0].weeklyPayments["2026-04"]).toEqual([10, 20, 0, 0, 70])
  })
})
