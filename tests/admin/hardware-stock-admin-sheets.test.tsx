import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import AdjustmentSheet from "@/components/admin/hardware/inventory/AdjustmentSheet"
import ItemSettingsSheet from "@/components/admin/hardware/inventory/ItemSettingsSheet"
import type { HardwareItem, HardwareStockRow } from "@/components/admin/hardware/inventory/shared"

// 재고 조정·품목 설정 시트의 첫 화면 — 서버 렌더로 칸·라벨이 그려지는지만 본다(입력 동작은 모델 테스트).

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
const PEN: HardwareItem = { ...BOARD, id: "item-pen", name: "A1", lot_tracked: false, report_group: "pen" }

const STOCK: HardwareStockRow = {
  itemId: BOARD.id,
  product: BOARD.name,
  category: "전자칠판",
  reorderPoint: 5,
  leadTimeDays: 30,
  warehouseStock: 16,
  plannedOut: 2,
  availableStock: 14,
  outbound30d: 3,
  weeklyOutboundAvg: 0.7,
  trendOrderPoint: 8,
  daysUntilStockout: null,
  low: false,
  orderRecommended: false,
  locationBalances: [],
  lotBalances: [
    { lot: "C2", quantity: 10 },
    { lot: "C1", quantity: 4 },
  ],
}

const noop = () => {}

describe("재고 조정 시트", () => {
  it("물류번호 관리 품목은 잔여와 함께 물류번호를 고르게 하고, 사유를 필수로 표시한다", () => {
    const html = renderToStaticMarkup(
      <AdjustmentSheet initialItemId={BOARD.id} items={[BOARD, PEN]} stock={[STOCK]} owner="이왕찬" onClose={noop} onSaved={noop} />
    )
    expect(html).toContain("재고 조정")
    expect(html).toContain("사유 (필수)")
    expect(html).toContain("늘림 (+)")
    expect(html).toContain("줄임 (−)")
    expect(html).toContain("지금 창고 16대 · 가용 14대")
    expect(html).toContain("C2 · 잔여 10대")
    expect(html).toContain("물류번호 없이 조정")
  })

  it("수량만 관리하는 품목은 물류번호 칸을 숨긴다", () => {
    const html = renderToStaticMarkup(<AdjustmentSheet initialItemId={PEN.id} items={[BOARD, PEN]} stock={[]} onClose={noop} onSaved={noop} />)
    expect(html).toContain("물류번호를 관리하지 않아 수량만 조정합니다")
    expect(html).not.toContain("물류번호 (선택)")
  })
})

describe("품목 설정 시트", () => {
  it("최소재고·리드타임·물류번호 관리·보고 묶음·정렬을 현재 값으로 채운다", () => {
    const html = renderToStaticMarkup(<ItemSettingsSheet item={BOARD} onClose={noop} onSaved={noop} />)
    expect(html).toContain("품목 설정")
    expect(html).toContain("최소재고 (대)")
    expect(html).toContain('value="5"')
    expect(html).toContain('value="30"')
    expect(html).toContain("물류번호 관리")
    expect(html).toContain("전자칠판")
    expect(html).toContain('value="10"')
  })
})
