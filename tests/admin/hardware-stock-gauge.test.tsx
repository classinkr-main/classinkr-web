import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import StockAvailabilityGauge from "@/components/admin/hardware/inventory/StockAvailabilityGauge"

describe("재고 게이지의 수량 의미", () => {
  it("가용률과 원래 수량을 함께 제공한다", () => {
    const html = renderToStaticMarkup(<StockAvailabilityGauge warehouse={20} available={16} planned={4} />)
    expect(html).toContain("창고 20대 · 가용 16대 · 예정 4대. 가용률 80%")
    expect(html).toContain('width:80%')
  })

  it("예정 초과를 정상 가용률로 숨기지 않는다", () => {
    const html = renderToStaticMarkup(<StockAvailabilityGauge warehouse={3} available={-2} planned={5} />)
    expect(html).toContain("가용 -2대")
    expect(html).toContain("예정 초과 2대")
    expect(html).not.toContain("가용률 0%")
    expect(html).not.toContain('width:-')
  })

  it("재고가 없는 경우 비율을 만들어 내지 않는다", () => {
    const html = renderToStaticMarkup(<StockAvailabilityGauge warehouse={0} available={0} planned={0} />)
    expect(html).toContain("창고 재고 없음")
    expect(html).not.toContain("NaN")
    expect(html).not.toContain("가용률")
  })

  it("음수 창고와 과다 가용 값은 원장 점검으로 표시한다", () => {
    for (const [warehouse, available, planned] of [[-3, -5, 2], [3, 5, 0]]) {
      const html = renderToStaticMarkup(<StockAvailabilityGauge warehouse={warehouse} available={available} planned={planned} />)
      expect(html).toContain("원장 점검 필요")
      expect(html).not.toContain("가용률")
    }
  })
})
