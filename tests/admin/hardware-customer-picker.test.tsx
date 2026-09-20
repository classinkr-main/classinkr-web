import { renderToStaticMarkup } from "react-dom/server"

import { describe, expect, it } from "vitest"

import CustomerPicker, { buildCustomerPickerRows } from "@/components/admin/hardware/inventory/CustomerPicker"

// 출고 기록에서 고객사는 매번 손으로 치는 유일한 칸이었다(입력 가속 P1-1).
// 목록은 제안일 뿐이고 새 고객사는 그대로 저장돼야 한다 — 그 규칙을 여기에 고정한다.
describe("buildCustomerPickerRows", () => {
  const recent = ["남명학원", "대치수리학원", "갈무리국어", "A1 아카데미"]

  it("빈 입력이면 최근 출고 순 그대로 제안하고 새 고객사 줄은 없다", () => {
    const rows = buildCustomerPickerRows(recent, "")
    expect(rows.map((row) => row.label)).toEqual(recent)
    expect(rows.every((row) => !row.isNew)).toBe(true)
  })

  it("공백·대소문자·구두점을 무시하고 찾는다", () => {
    expect(buildCustomerPickerRows(recent, "a1아카데미").map((row) => row.label)).toEqual(["A1 아카데미"])
    // 앞뒤 공백은 무시하고 찾는다. 부분 입력이라 "새 고객사" 줄은 그대로 뒤에 붙는다.
    expect(buildCustomerPickerRows(recent, " 남명 ").filter((row) => !row.isNew).map((row) => row.label)).toEqual([
      "남명학원",
    ])
  })

  it("부분 입력이면 후보와 함께 새 고객사 줄을 마지막에 둔다", () => {
    const rows = buildCustomerPickerRows(recent, "남명")
    expect(rows.map((row) => [row.label, row.isNew])).toEqual([
      ["남명학원", false],
      ["남명", true],
    ])
  })

  it("정확히 일치하면 새 고객사 줄을 만들지 않는다", () => {
    const rows = buildCustomerPickerRows(recent, "남명학원")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ label: "남명학원", isNew: false })
  })

  it("목록에 없는 이름도 그대로 기록할 수 있다", () => {
    const rows = buildCustomerPickerRows(recent, "새로연학원")
    expect(rows).toEqual([{ key: "__new__새로연학원", label: "새로연학원", isNew: true }])
  })

  it("제안은 8곳까지만 — 그 뒤에도 새 고객사 줄은 남는다", () => {
    const many = Array.from({ length: 20 }, (_, index) => `학원${index + 1}`)
    const rows = buildCustomerPickerRows(many, "학원")
    expect(rows.filter((row) => !row.isNew)).toHaveLength(8)
    expect(rows.at(-1)).toMatchObject({ label: "학원", isNew: true })
  })
})

describe("CustomerPicker", () => {
  it("datalist 가 아니라 combobox 로 그린다 (모바일에서 제안이 뜨지 않던 원인)", () => {
    const html = renderToStaticMarkup(
      <CustomerPicker
        value=""
        onChange={() => undefined}
        options={["남명학원"]}
        ariaLabel="도착 고객사"
        placeholder="고객사명 — 예: 남명학원"
      />
    )
    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-autocomplete="list"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).not.toContain("<datalist")
    // 닫힌 상태에서는 목록을 그리지 않는다(포커스·입력으로 연다).
    expect(html).not.toContain('role="listbox"')
  })
})
