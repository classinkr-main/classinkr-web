// GET /api/admin/branch/deals/[id] — 행 상세 id 사다리 회귀 가드(2026-10-28 읽기 전용 감사).
// 장부 행은 원천에 따라 두 id 공간을 쓴다: 시트 미러(branch_rev_deals.id) 또는 액티브 임포트
// 라인(branch_rev_lines.id — pipeline-rows가 readRevDealsFromActiveImport ?? listBranchRevDeals로
// 내려보낸 그대로). 상세가 미러만 조회하던 동안 임포트 모드에서는 모든 행 상세가 404였고
// (활성 run 451라인 중 미러 id 일치 0), 워크벤치의 "재동기화로 원천이 바뀌었을 수 있어요"
// 안내가 상시 상태를 일시 경합으로 오인하게 했다. 라우트는 lib/branch/read-rev-deals의
// readRevDealById(미러 → 활성 임포트 라인 순)를 거쳐야 한다.
import { NextRequest, NextResponse } from "next/server"
import { afterEach, describe, expect, it, vi } from "vitest"

const verifyAdmin = vi.fn()
const getBranchRevDeal = vi.fn()
const readRevDealFromActiveImportById = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  verifyAdmin,
  BRANCH_READ_ADMIN_API_ROLES: ["ADMIN"],
}))

vi.mock("@/lib/repositories/branch-deals", () => ({
  getBranchRevDeal,
  listBranchRevDeals: vi.fn(),
  BRANCH_REV_DEALS_CACHE_TAG: "branch-rev-deals",
}))

vi.mock("@/lib/repositories/sales-ledger-imports", () => ({
  readRevDealFromActiveImportById,
  readRevDealsFromActiveImport: vi.fn(),
  getActiveImportRunInfo: vi.fn(),
  SALES_LEDGER_IMPORTS_CACHE_TAG: "sales-ledger-imports",
}))

const MIRROR_ID = "11111111-1111-4111-8111-111111111111"
const LINE_ID = "22222222-2222-4222-8222-222222222222"

const baseDeal = {
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
  monthly_payments: { "2026-11": 500 },
  monthly_red: {},
  monthly_confirmed: { "2026-11": 0 },
  monthly_high_conf: {},
  raw: {},
  synced_at: "2026-10-15T00:00:00.000Z",
}
const MIRROR_DEAL = { ...baseDeal, id: MIRROR_ID }
const IMPORT_DEAL = { ...baseDeal, id: LINE_ID }

function request(id: string) {
  return new NextRequest(`https://classin.kr/api/admin/branch/deals/${id}`)
}
function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function loadRoute() {
  return import("@/app/api/admin/branch/deals/[id]/route")
}

describe("GET /api/admin/branch/deals/[id] — mirror id → active import line id", () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it("returns the auth guard response without touching either source", async () => {
    verifyAdmin.mockResolvedValue(NextResponse.json({ error: "unauthorized" }, { status: 401 }))
    const { GET } = await loadRoute()

    const res = await GET(request(MIRROR_ID), params(MIRROR_ID))

    expect(res.status).toBe(401)
    expect(getBranchRevDeal).not.toHaveBeenCalled()
    expect(readRevDealFromActiveImportById).not.toHaveBeenCalled()
  })

  it("serves a sheet-mirror row from branch_rev_deals without consulting the active import", async () => {
    verifyAdmin.mockResolvedValue(null)
    getBranchRevDeal.mockResolvedValue(MIRROR_DEAL)
    const { GET } = await loadRoute()

    const res = await GET(request(MIRROR_ID), params(MIRROR_ID))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.deal).toEqual(MIRROR_DEAL)
    expect(getBranchRevDeal).toHaveBeenCalledWith(MIRROR_ID)
    expect(readRevDealFromActiveImportById).not.toHaveBeenCalled()
  })

  it("falls back to the active import line when the id is not a mirror id (import mode rows)", async () => {
    verifyAdmin.mockResolvedValue(null)
    getBranchRevDeal.mockResolvedValue(null)
    readRevDealFromActiveImportById.mockResolvedValue(IMPORT_DEAL)
    const { GET } = await loadRoute()

    const res = await GET(request(LINE_ID), params(LINE_ID))
    const body = await res.json()

    expect(res.status).toBe(200)
    // 응답 shape는 미러 상세와 같은 BranchRevDeal — 워크벤치(DealDetailResponse)·대시보드가
    // 원천을 구분하지 않고 같은 필드를 읽는다.
    expect(body.deal).toEqual(IMPORT_DEAL)
    expect(Object.keys(body.deal).sort()).toEqual(Object.keys(MIRROR_DEAL).sort())
    expect(getBranchRevDeal).toHaveBeenCalledWith(LINE_ID)
    expect(readRevDealFromActiveImportById).toHaveBeenCalledWith(LINE_ID)
  })

  it("answers not_found only when neither the mirror nor the active import run knows the id", async () => {
    verifyAdmin.mockResolvedValue(null)
    getBranchRevDeal.mockResolvedValue(null)
    readRevDealFromActiveImportById.mockResolvedValue(null)
    const { GET } = await loadRoute()

    const res = await GET(request(LINE_ID), params(LINE_ID))
    const body = await res.json()

    expect(res.status).toBe(404)
    expect(body).toEqual({ error: "not_found" })
    expect(getBranchRevDeal).toHaveBeenCalledWith(LINE_ID)
    expect(readRevDealFromActiveImportById).toHaveBeenCalledWith(LINE_ID)
  })
})
