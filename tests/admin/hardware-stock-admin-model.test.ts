import { readFileSync } from "node:fs"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

import { adminFetchJson } from "@/lib/admin-client"
import {
  adjustmentDraftIsValid,
  buildAdjustmentPayload,
  fetchHardwareLots,
  itemSettingsDraftFrom,
  parseHardwareCustomersResponse,
  parseHardwareLotsResponse,
  saveItemSettings,
  searchHardwareCustomers,
  submitAdjustment,
  validateAdjustmentDraft,
  validateItemSettings,
  type AdjustmentDraft,
  type HardwareLotsSnapshot,
} from "@/components/admin/hardware/inventory/stock-admin-model"
import type { HardwareItem } from "@/components/admin/hardware/inventory/shared"

// 재고 조정·품목 설정·물류번호/고객 조회 모델. 네트워크는 실제 adminFetchJson 에 전역 fetch 목을 깐다 —
// 화면이 쓰는 경로·메서드·본문이 그대로 검증된다. 계약: 갭 문서 §7-3.

const BOARD: HardwareItem = {
  id: "item-86",
  name: '86" IFP',
  category: "전자칠판",
  reorder_point: 5,
  lead_time_days: 30,
  source_aliases: [],
  lot_tracked: true,
  report_group: "board",
  sort_order: 10,
}

const PEN: HardwareItem = { ...BOARD, id: "item-pen", name: "A1", lot_tracked: false, report_group: "pen", sort_order: null }

const LOTS: HardwareLotsSnapshot = {
  itemId: BOARD.id,
  product: BOARD.name,
  lotTracked: true,
  lots: [
    { lotNo: "C1", remaining: 4 },
    { lotNo: "C2", remaining: 12 },
  ],
  nextLotNo: "C3",
}

function adjustment(overrides: Partial<AdjustmentDraft> = {}): AdjustmentDraft {
  return {
    itemId: BOARD.id,
    direction: "decrease",
    quantity: "2",
    lotNo: "",
    reason: "10/28 실사 — 2대 부족",
    occurredAt: "2026-10-28",
    owner: "이왕찬",
    ...overrides,
  }
}

function mockFetch(body: unknown, init: { status?: number } = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "Content-Type": "application/json" } }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

function lastCall(fetchMock: ReturnType<typeof mockFetch>) {
  const [url, init] = fetchMock.mock.calls.at(-1) as unknown as [string, RequestInit]
  return { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : undefined }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("재고 조정 폼 검증", () => {
  it("품목·방향·수량(1 이상 정수)·사유·날짜가 필수다", () => {
    const result = validateAdjustmentDraft(adjustment({ itemId: "", direction: null, quantity: "0", reason: "  ", occurredAt: "10/28" }), { item: null })
    expect(result.errors).toEqual({
      item: "조정할 품목을 고르세요.",
      direction: "늘림·줄임을 고르세요.",
      quantity: "수량은 1 이상 정수로 입력하세요.",
      reason: "조정 사유를 적으세요(실사 차이·파손·분실 등).",
      date: "조정일을 YYYY-MM-DD 형식으로 입력하세요.",
    })
    expect(adjustmentDraftIsValid(result)).toBe(false)
    expect(adjustmentDraftIsValid(validateAdjustmentDraft(adjustment(), { item: BOARD }))).toBe(true)
  })

  it("물류번호는 선택 — 줄임은 잔여 있는 번호만, 잔여를 넘으면 경고만 한다", () => {
    expect(validateAdjustmentDraft(adjustment({ lotNo: "H4" }), { item: BOARD, lots: LOTS }).errors).toEqual({
      lot: "H4은(는) 잔여가 없는 물류번호입니다.",
    })
    const over = validateAdjustmentDraft(adjustment({ lotNo: "C1", quantity: "6" }), { item: BOARD, lots: LOTS })
    expect(over.errors).toEqual({})
    expect(over.warnings).toEqual(["C1 잔여는 4대입니다 — 6대를 줄이면 다른 물류번호에서 빠진 것으로 해석됩니다."])
    // 늘림은 잔여 0 인 번호에도 할 수 있다(실사로 찾은 물량).
    expect(validateAdjustmentDraft(adjustment({ direction: "increase", lotNo: "H4" }), { item: BOARD, lots: LOTS }).errors).toEqual({})
  })

  it("물류번호를 관리하지 않는 품목에는 물류번호를 붙이지 않는다", () => {
    expect(validateAdjustmentDraft(adjustment({ itemId: PEN.id, lotNo: "C1" }), { item: PEN }).errors).toEqual({
      lot: "물류번호를 관리하지 않는 품목입니다 — 물류번호 없이 조정하세요.",
    })
    expect(buildAdjustmentPayload(adjustment({ itemId: PEN.id, lotNo: "C1" }), PEN)).not.toHaveProperty("lotNo")
  })

  it("전송 형식: movementType adjust + adjustDirection, 사유는 memo, 위치 칸은 보내지 않는다(서버가 창고로 정한다)", () => {
    expect(buildAdjustmentPayload(adjustment({ lotNo: " C2 ", reason: " 파손 폐기 " }), BOARD)).toEqual({
      itemId: BOARD.id,
      productName: BOARD.name,
      movementType: "adjust",
      adjustDirection: "decrease",
      quantity: 2,
      occurredAt: "2026-10-28",
      owner: "이왕찬",
      status: "재고 조정",
      memo: "파손 폐기",
      lotNo: "C2",
    })
    expect(buildAdjustmentPayload(adjustment({ direction: null }), BOARD)).toBeNull()
    expect(buildAdjustmentPayload(adjustment({ reason: "" }), BOARD)).toBeNull()
  })

  it("movements API 에 POST 한다", async () => {
    const fetchMock = mockFetch({ movement: { id: "mv-1" } }, { status: 201 })
    const payload = buildAdjustmentPayload(adjustment(), BOARD)!
    await expect(submitAdjustment(adminFetchJson, payload)).resolves.toEqual({ movement: { id: "mv-1" } })
    expect(lastCall(fetchMock)).toEqual({ url: "/api/admin/hardware/movements", method: "POST", body: payload })
  })

  it("권한 없음(403)·사유 누락(422) 같은 서버 거절은 오류로 올린다(성공으로 숨기지 않는다)", async () => {
    mockFetch({ error: "입고관리 권한자만 재고를 조정할 수 있습니다." }, { status: 403 })
    await expect(submitAdjustment(adminFetchJson, buildAdjustmentPayload(adjustment(), BOARD)!)).rejects.toThrow("입고관리 권한자만")
  })
})

describe("품목 설정 폼", () => {
  it("품목 값으로 폼을 채운다 — 칸 없는 구응답은 물류번호 관리·미지정으로 본다", () => {
    expect(itemSettingsDraftFrom(BOARD)).toEqual({ reorderPoint: "5", leadTimeDays: "30", lotTracked: true, reportGroup: "board", sortOrder: "10" })
    expect(itemSettingsDraftFrom({ reorder_point: 0, lead_time_days: 14 } as HardwareItem)).toEqual({
      reorderPoint: "0",
      leadTimeDays: "14",
      lotTracked: true,
      reportGroup: "",
      sortOrder: "",
    })
  })

  it("바뀐 칸만 patch 에 싣는다", () => {
    const unchanged = validateItemSettings(itemSettingsDraftFrom(BOARD), BOARD)
    expect(unchanged).toEqual({ errors: {}, patch: {} })
    const changed = validateItemSettings(
      { reorderPoint: "8", leadTimeDays: "30", lotTracked: false, reportGroup: "accessory", sortOrder: "" },
      BOARD
    )
    expect(changed.errors).toEqual({})
    expect(changed.patch).toEqual({ reorderPoint: 8, lotTracked: false, reportGroup: "accessory", sortOrder: null })
    expect(validateItemSettings({ ...itemSettingsDraftFrom(BOARD), reportGroup: "" }, BOARD).patch).toEqual({ reportGroup: null })
  })

  it("최소재고·리드타임은 0 이상 정수, 정렬은 정수", () => {
    const result = validateItemSettings({ reorderPoint: "-1", leadTimeDays: "2.5", lotTracked: true, reportGroup: "board", sortOrder: "앞" }, BOARD)
    expect(result.errors).toEqual({
      reorderPoint: "최소재고는 0 이상 정수로 입력하세요.",
      leadTimeDays: "리드타임은 0 이상 정수(일)로 입력하세요.",
      sortOrder: "정렬은 정수로 입력하세요(작을수록 앞).",
    })
    expect(validateItemSettings({ ...itemSettingsDraftFrom(BOARD), sortOrder: "-3" }, BOARD).patch).toEqual({ sortOrder: -3 })
  })

  it("items/[id] 에 PATCH 한다", async () => {
    const fetchMock = mockFetch({ item: { id: BOARD.id, reorder_point: 8 } })
    await saveItemSettings(adminFetchJson, BOARD.id, { reorderPoint: 8, lotTracked: false })
    expect(lastCall(fetchMock)).toEqual({
      url: "/api/admin/hardware/items/item-86",
      method: "PATCH",
      body: { reorderPoint: 8, lotTracked: false },
    })
  })

  it("items 라우트는 최소재고(reorderPoint)를 이미 받는다", () => {
    const route = readFileSync(join(process.cwd(), "app/api/admin/hardware/items/[id]/route.ts"), "utf8")
    expect(route).toContain('body, "reorderPoint"')
  })
})

describe("물류번호·고객 조회", () => {
  it("lots 응답을 지킨다 — 이상한 줄은 버리고 lotTracked 가 없으면 관리 품목으로 본다", () => {
    expect(
      parseHardwareLotsResponse({
        itemId: "item-86",
        product: '86" IFP',
        lots: [{ lotNo: " C2 ", remaining: 12 }, { lotNo: "", remaining: 1 }, { remaining: 3 }, { lotNo: "C1", remaining: "x" }],
        nextLotNo: "C3",
      })
    ).toEqual({ itemId: "item-86", product: '86" IFP', lotTracked: true, lots: [{ lotNo: "C2", remaining: 12 }], nextLotNo: "C3" })
    expect(parseHardwareLotsResponse(null)).toEqual({ itemId: null, product: null, lotTracked: true, lots: [], nextLotNo: null })
    expect(parseHardwareLotsResponse({ lotTracked: false, lots: [] }).lotTracked).toBe(false)
  })

  it("품목별 lots 를 GET 한다", async () => {
    const fetchMock = mockFetch({ itemId: "item 86", product: "x", lotTracked: true, lots: [{ lotNo: "C1", remaining: 2 }], nextLotNo: "C3" })
    const snapshot = await fetchHardwareLots(adminFetchJson, "item 86")
    expect(lastCall(fetchMock)).toMatchObject({ url: "/api/admin/hardware/lots?itemId=item%2086", method: "GET" })
    expect(snapshot.nextLotNo).toBe("C3")
  })

  it("CRM 고객 검색 응답을 지키고 q 로 GET 한다", async () => {
    expect(
      parseHardwareCustomersResponse({
        customers: [
          { id: "c1", name: " 수학의정석 ", campusName: "대치", regionLabel: "서울" },
          { id: "", name: "이름만" },
          { id: "c2", name: "영어나라", campusName: "", regionLabel: null },
        ],
      })
    ).toEqual([
      { id: "c1", name: "수학의정석", campusName: "대치", regionLabel: "서울" },
      { id: "c2", name: "영어나라", campusName: null, regionLabel: null },
    ])
    const fetchMock = mockFetch({ customers: [{ id: "c1", name: "수학의정석" }] })
    const customers = await searchHardwareCustomers(adminFetchJson, " 수학 ")
    expect(lastCall(fetchMock).url).toBe(`/api/admin/hardware/customers?q=${encodeURIComponent("수학")}`)
    expect(customers).toHaveLength(1)
  })
})

describe("화면 소스 계약", () => {
  const read = (file: string) => readFileSync(join(process.cwd(), "components/admin/hardware/inventory", file), "utf8")

  it("재고 조정·품목 설정은 입고관리 권한자에게만 보인다", () => {
    const stock = read("StockLevelsSection.tsx")
    expect(stock).toContain("canManageInventory === true")
    expect(stock).toContain("AdjustmentSheet")
    expect(stock).toContain("ItemSettingsSheet")
  })

  it("입고표는 입고관리 권한이 없으면(false) 입력 화면을 닫는다", () => {
    const sheet = read("InboundSheet.tsx")
    expect(sheet).toContain("canManageInventory === false")
    expect(sheet).not.toContain('kind: "new"')
  })

  it("물류번호 칩은 서버 lotBalances 를 그대로 쓴다(화면에서 다시 해석하지 않는다)", () => {
    const stock = read("StockLevelsSection.tsx")
    expect(stock).toContain("row.lotBalances")
    expect(stock).not.toMatch(/import[^\n]*(resolveHardwareLotBalances|previewFifoLots)/)
  })
})
