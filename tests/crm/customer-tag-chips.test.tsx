import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

// CustomerTagChips는 클릭 시에만 adminFetchJson을 호출한다(렌더 중 호출 없음) — renderToStaticMarkup은
// 이벤트 핸들러를 실행하지 않으므로 실제로는 불필요하지만, 이 스위트의 다른 컴포넌트 테스트
// (priority-queue-optimistic 등)와 같은 관례로 실제 네트워크 호출 가능성을 원천 차단한다.
vi.mock("@/lib/admin-client", () => ({
  adminFetchJson: vi.fn(async () => ({ tags: [] })),
}))

import CustomerTagChips from "@/components/admin/crm/CustomerTagChips"
import { SUGGESTED_TAGS } from "@/lib/crm/tag-suggestions"

// §13 Q3 — 태그 UI 최초 도입. 정적 마크업만 고정한다(클릭 상호작용은 jsdom이 없어 tag-suggestions.test.ts의
// 순수 함수 계약 + 여기서의 소스 계약으로 대신 고정한다 — UX 라운드 1 관례와 동일).

describe("CustomerTagChips 정적 마크업", () => {
  it("붙은 태그는 pill + '태그 {name} 제거' aria-label 버튼을 갖는다", () => {
    const html = renderToStaticMarkup(
      <CustomerTagChips customerKey="lead:lead-1" initialTags={["VIP", "재계약"]} />
    )
    expect(html).toContain(">VIP<")
    expect(html).toContain(">재계약<")
    expect(html).toContain('aria-label="태그 VIP 제거"')
    expect(html).toContain('aria-label="태그 재계약 제거"')
  })

  it("이미 붙은 태그는 제안 칩 목록에서 빠진다", () => {
    const html = renderToStaticMarkup(<CustomerTagChips customerKey="lead:lead-1" initialTags={["VIP"]} />)
    // 제거 버튼 aria-label로 붙은 태그가 있음을 확인한 뒤, 제안 칩 aria-label에는 VIP가 없어야 한다.
    expect(html).toContain('aria-label="태그 VIP 제거"')
    expect(html).not.toContain('aria-label="제안 태그 VIP 추가"')
    // 나머지 제안 태그는 그대로 남는다.
    expect(html).toContain('aria-label="제안 태그 재계약 추가"')
    expect(html).toContain('aria-label="제안 태그 하드웨어 추가"')
  })

  it("태그가 하나도 없으면 제안 6종이 모두 노출된다", () => {
    const html = renderToStaticMarkup(<CustomerTagChips customerKey="lead:lead-1" initialTags={[]} />)
    for (const tag of SUGGESTED_TAGS) {
      expect(html).toContain(`aria-label="제안 태그 ${tag} 추가"`)
    }
  })

  it("'직접 입력' 라벨과 인라인 input(40자 제한)을 갖는다", () => {
    const html = renderToStaticMarkup(<CustomerTagChips customerKey="lead:lead-1" initialTags={[]} />)
    expect(html).toContain("직접 입력")
    expect(html).toContain('placeholder="태그 입력 후 Enter"')
    expect(html).toContain('maxLength="40"')
  })

  it("role=group aria-label='고객 태그'로 칩 묶음을 알린다", () => {
    const html = renderToStaticMarkup(<CustomerTagChips customerKey="lead:lead-1" initialTags={[]} />)
    expect(html).toContain('role="group"')
    expect(html).toContain('aria-label="고객 태그"')
  })

  it("붙은 태그 pill은 진한 채움 대신 연한 배경(#F6F5F4)·텍스트(#31302E)를 쓴다", () => {
    const html = renderToStaticMarkup(<CustomerTagChips customerKey="lead:lead-1" initialTags={["VIP"]} />)
    expect(html).toContain("bg-[#F6F5F4]")
    expect(html).toContain("text-[#31302E]")
  })

  it("제안 칩은 점선 보더를 쓴다", () => {
    const html = renderToStaticMarkup(<CustomerTagChips customerKey="lead:lead-1" initialTags={[]} />)
    expect(html).toContain("border-dashed")
  })
})
