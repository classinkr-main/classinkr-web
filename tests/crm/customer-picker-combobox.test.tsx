import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import CrmCustomerPicker, {
  movePickerActiveIndex,
  shouldCloseOnFocusOut,
} from "@/components/admin/crm/CrmCustomerPicker"

// home-08 — 고객 찾기 픽커의 콤보박스 의미론·키보드 이동·focusout 닫힘 규칙.

const noop = () => undefined

describe("CrmCustomerPicker 콤보박스", () => {
  it("입력은 role=combobox 이며 listbox 와 aria-controls 로 연결되고 접근 가능한 이름을 가진다", () => {
    const html = renderToStaticMarkup(
      <CrmCustomerPicker label="" linkedId="" onPick={noop} onFreeText={noop} onClear={noop} labelledBy="crm-home-customer-search-heading" />
    )
    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-expanded="false"')
    expect(html).toContain('aria-autocomplete="list"')
    expect(html).toContain('aria-label="고객/리드 검색"')
    expect(html).toContain('aria-labelledby="crm-home-customer-search-heading"')
    const controls = html.match(/aria-controls="([^"]+)"/)?.[1]
    expect(controls).toBeTruthy()
    expect(html).toContain(`id="${controls}"`)
    expect(html).toContain('role="listbox"')
    // 닫힌 상태에서도 listbox 는 DOM 에 있고(hidden) SR 상태 영역은 항상 마운트돼 있다.
    expect(html).toMatch(/<ul[^>]*hidden=""/)
    expect(html).toContain('aria-live="polite"')
    // 활성 항목이 없으면 aria-activedescendant 를 내지 않는다.
    expect(html).not.toContain("aria-activedescendant")
    // 폐기된 색 리터럴 없음.
    expect(html).not.toContain("#B85C33")
  })

  it("연결됨 배지와 지우기 버튼은 그대로 유지된다", () => {
    const linked = renderToStaticMarkup(
      <CrmCustomerPicker label="프리셋 학원" linkedId="lead-1" onPick={noop} onFreeText={noop} onClear={noop} />
    )
    expect(linked).toContain("연결됨")
    expect(linked).not.toContain('aria-label="지우기"')

    const free = renderToStaticMarkup(
      <CrmCustomerPicker label="프리셋" linkedId="" onPick={noop} onFreeText={noop} onClear={noop} />
    )
    expect(free).toContain('aria-label="지우기"')
  })

  it("movePickerActiveIndex 는 팔레트와 같은 순환 규칙(끝↔처음)이며 빈 목록은 0", () => {
    expect(movePickerActiveIndex(0, 1, 3)).toBe(1)
    expect(movePickerActiveIndex(2, 1, 3)).toBe(0)
    expect(movePickerActiveIndex(0, -1, 3)).toBe(2)
    // 목록이 줄어 prev 가 범위를 넘어도 클램프 후 이동한다.
    expect(movePickerActiveIndex(7, 1, 3)).toBe(0)
    expect(movePickerActiveIndex(7, -1, 3)).toBe(1)
    expect(movePickerActiveIndex(5, 1, 0)).toBe(0)
  })

  it("shouldCloseOnFocusOut 은 래퍼 안으로 옮기는 포커스에는 닫지 않고, 밖·null 이면 닫는다", () => {
    // Node 인터페이스 최소 구현 — vitest 환경은 node 라 DOM 이 없다.
    class FakeNode {
      children: FakeNode[] = []
      contains(other: unknown): boolean {
        if (other === this) return true
        return this.children.some((child) => child.contains(other))
      }
    }
    const wrapper = new FakeNode()
    const inside = new FakeNode()
    wrapper.children.push(inside)
    const outside = new FakeNode()
    const nodeCtor = globalThis.Node
    // instanceof Node 검사를 통과시키기 위해 FakeNode 를 Node 로 등록한다.
    ;(globalThis as { Node?: unknown }).Node = FakeNode
    try {
      expect(shouldCloseOnFocusOut(wrapper as unknown as Node, inside as unknown as Node)).toBe(false)
      expect(shouldCloseOnFocusOut(wrapper as unknown as Node, outside as unknown as Node)).toBe(true)
      expect(shouldCloseOnFocusOut(wrapper as unknown as Node, null)).toBe(true)
      expect(shouldCloseOnFocusOut(null, inside as unknown as Node)).toBe(true)
    } finally {
      ;(globalThis as { Node?: unknown }).Node = nodeCtor
    }
  })
})
