import { renderToStaticMarkup } from "react-dom/server"

import { describe, expect, it } from "vitest"

import ProductPicker, { filterHardwareItems } from "@/components/admin/hardware/inventory/ProductPicker"
import type { HardwareItem } from "@/components/admin/hardware/inventory/shared"

// 입력 가속 P1-3 — 주요 4종 밖(OPS·케이블·브라켓) 품목을 전 품목 select 에서 훑던 것을 검색으로 바꿨다.
function item(id: string, name: string): HardwareItem {
  return {
    id,
    name,
    sku: null,
    category: null,
    reorderPoint: 2,
    leadTimeDays: 14,
    active: true,
    sourceAliases: [name],
  } as unknown as HardwareItem
}

const items = [
  item("item-1", '86" IFP'),
  item("item-2", "OPS 케이블"),
  item("item-3", "STD1"),
  item("item-4", "DT1"),
  item("item-5", "T1"),
]

describe("filterHardwareItems", () => {
  it("검색어가 없으면 전부 그대로 둔다", () => {
    expect(filterHardwareItems(items, "").map((entry) => entry.name)).toEqual(items.map((entry) => entry.name))
  })

  it("공백·대소문자를 무시하고 부분 일치로 찾는다", () => {
    expect(filterHardwareItems(items, "ops케이블").map((entry) => entry.id)).toEqual(["item-2"])
    expect(filterHardwareItems(items, " ifp ").map((entry) => entry.id)).toEqual(["item-1"])
  })

  it("부분 문자열이라 T1 검색에는 DT1 도 함께 걸린다(선택은 사람이 한다)", () => {
    expect(filterHardwareItems(items, "t1").map((entry) => entry.id)).toEqual(["item-4", "item-5"])
  })

  it("맞는 품목이 없으면 빈 목록", () => {
    expect(filterHardwareItems(items, "없는품목")).toEqual([])
  })
})

describe("ProductPicker", () => {
  it("닫힌 상태에서는 선택된 품목만 보이고 목록은 그리지 않는다", () => {
    const html = renderToStaticMarkup(
      <ProductPicker items={items} value="item-2" onChange={() => undefined} ariaLabel="전체 품목에서 선택" />
    )
    expect(html).toContain("OPS 케이블")
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain('role="listbox"')
    // select 를 대체했으므로 option 태그가 남아 있으면 안 된다.
    expect(html).not.toContain("<select")
  })

  it("고른 품목이 없으면 안내 라벨을 보여준다", () => {
    const html = renderToStaticMarkup(
      <ProductPicker items={items} value="" onChange={() => undefined} ariaLabel="전체 품목에서 선택" />
    )
    expect(html).toContain("품목 선택")
  })
})
