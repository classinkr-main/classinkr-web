import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { buildHardwareStockCsv, filterHomeStock, previewHomeRecord } from "@/components/admin/hardware/inventory/home-record-model"
import ImportFreshnessStrip from "@/components/admin/hardware/inventory/ImportFreshnessStrip"
import type { HardwareStockRow } from "@/components/admin/hardware/inventory/shared"

const row = (patch: Partial<HardwareStockRow> = {}): HardwareStockRow => ({
  itemId: "75", product: '75" IFP', category: "전자칠판", warehouseStock: 24, plannedOut: 4, availableStock: 20,
  reorderPoint: 2, leadTimeDays: 14, outbound30d: 0, weeklyOutboundAvg: 0, trendOrderPoint: 2,
  daysUntilStockout: null, low: false, orderRecommended: false, locationBalances: [], lotBalances: [], ...patch,
})

describe("홈 입출고 미리보기", () => {
  it("실제 출고는 창고·가용만 차감하고 기존 예정 수량을 유지한다", () => {
    expect(previewHomeRecord(row(), "sale", 1)).toEqual({ warehouse: 23, available: 19, planned: 4 })
  })
  it("배송 예정은 창고를 차감하지 않고 가용·예정에만 반영한다", () => {
    expect(previewHomeRecord(row(), "planned", 3)).toEqual({ warehouse: 24, available: 17, planned: 7 })
  })
  it("입고는 창고·가용을 늘리고 음수 재고도 그대로 예상한다", () => {
    expect(previewHomeRecord(row({ availableStock: -2 }), "inbound", 3)).toEqual({ warehouse: 27, available: 1, planned: 4 })
    expect(previewHomeRecord(row(), "sale", 21)?.available).toBe(-1)
  })
  it("0·음수·소수·무한대·안전하지 않은 정수에 예상을 만들지 않는다", () => {
    for (const quantity of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) expect(previewHomeRecord(row(), "sale", quantity)).toBeNull()
  })
})

describe("전체 재고 검색과 내보내기", () => {
  it("페이지 밖 품목도 검색하고 두 필터를 함께 적용한다", () => {
    const rows = Array.from({ length: 12 }, (_, i) => row({ itemId: String(i), product: `제품 ${i}`, low: i === 11, plannedOut: i === 11 ? 2 : 0 }))
    expect(filterHomeStock(rows, "제품 11", true, true).map(row => row.itemId)).toEqual(["11"])
    expect(filterHomeStock(rows, "제품 0", true, false)).toEqual([])
  })
  it("CSV는 한글 BOM·따옴표를 보존하고 품목 문자열의 수식 실행을 막는다", () => {
    const csv = buildHardwareStockCsv([row({ product: '=HYPERLINK("x")', availableStock: -2 })])
    expect(csv.startsWith("\uFEFF")).toBe(true)
    expect(csv).toContain('"\'=HYPERLINK(""x"")"')
    expect(csv).toContain(",24,4,-2,2")
  })
})

it("경고는 접힌 상세에 보존하고 동기화 성공을 만들어 내지 않는다", () => {
  const html = renderToStaticMarkup(<ImportFreshnessStrip importRun={{ id: "run", status: "failed", started_at: "2026-10-13T00:00:00Z", finished_at: null, rows_imported: null, rows_skipped: null, error: "가져오기 실패" }} importCosting={{ recoveredFromRawCount: 319 }} />)
  expect(html).toContain("시트 이관 실패")
  expect(html).toContain("확인 2건")
  expect(html).toContain("319건은 백업 금액을 사용 중")
  expect(html).toContain("<details")
  expect(html).not.toContain("<details open")
  expect(html).not.toContain("정상 범위")
})
