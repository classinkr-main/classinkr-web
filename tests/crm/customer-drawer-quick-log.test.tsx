import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import Customer360Drawer from "@/components/admin/crm/Customer360Drawer"
import Customer360DrawerSkeleton from "@/components/admin/crm/Customer360DrawerSkeleton"
import CrmContactValue from "@/components/admin/crm/CrmContactValue"

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

describe("Customer360Drawer quick log", () => {
  it("keeps the customer-scoped quick log visible before customer data finishes loading", () => {
    const html = renderToStaticMarkup(
      <Customer360Drawer customerKey="lead:lead-9" name="프리셋 학원" onClose={() => undefined} />
    )

    expect(html).toContain('data-testid="customer-quick-log"')
    expect(html).toContain('aria-label="프리셋 학원 간단 로그"')
    expect(html).toContain("프리셋 학원 기록 남기기")
    expect(html).toContain("고객 360 타임라인에 연결됩니다.")
    expect(html).not.toContain("고객/리드 검색 또는 직접 입력")
  })

  it("reserves the same quick-log region while the drawer chunk loads", () => {
    const html = renderToStaticMarkup(<Customer360DrawerSkeleton />)

    expect(html).toContain('data-testid="customer-quick-log-skeleton"')
    expect(html).toContain('aria-label="간단 로그 불러오는 중"')
  })
})

describe("CrmContactValue", () => {
  it("renders the formatted phone number as an explicit copy control", () => {
    const html = renderToStaticMarkup(<CrmContactValue value="01012345678" />)

    expect(html).toContain("010-1234-5678")
    expect(html).toContain('aria-label="연락처 010-1234-5678 복사"')
    expect(html).toContain("클릭하여 복사")
    expect(html).toContain("opacity-45")
  })
})
