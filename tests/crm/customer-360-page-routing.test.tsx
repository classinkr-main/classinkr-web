import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ReactElement } from "react"

const mocks = vi.hoisted(() => ({ load: vi.fn(), notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND") }) }))
vi.mock("server-only", () => ({}))
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }))
vi.mock("@/components/admin/crm/Customer360DetailClient", () => ({ default: () => null }))
vi.mock("@/lib/repositories/crm-customer-360", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/repositories/crm-customer-360")>(),
  getCrmCustomer360: mocks.load,
}))
import Page, { generateMetadata } from "@/app/admin/crm/customers/[key]/page"

beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue({ key: "lead:lead-1", found: true, header: { name: "테스트 학원" } }) })

describe("고객 자세히 보기의 페이지 키 정규화", () => {
  it.each(["lead:lead-1", "lead%3Alead-1"])("%s 주소의 메타데이터와 본문은 같은 고객을 조회한다", async key => {
    const props = { params: Promise.resolve({ key }) }
    expect((await generateMetadata(props)).title).toContain("테스트 학원")
    const page = await Page(props) as ReactElement<{ children: ReactElement<{ customerKey: string }> }>
    expect(page.props.children.props.customerKey).toBe("lead:lead-1")
    expect(mocks.notFound).not.toHaveBeenCalled()
    for (const [parsed, options] of mocks.load.mock.calls) {
      expect(parsed).toEqual({ source: "lead", entityId: "lead-1", targetType: "lead" })
      expect(options).toEqual({ eventsLimit: 50, tasksLimit: 50, dealsLimit: 200 })
    }
  })
  it("여러 콜론이 들어간 NEO 키도 인코딩 전후 같은 계정으로 조회한다", async () => {
    mocks.load.mockResolvedValue({ key: "neo:account:one", found: true, header: { name: "학원" } })
    const page = await Page({ params: Promise.resolve({ key: "neo%3Aaccount%3Aone" }) }) as ReactElement<{ children: ReactElement<{ customerKey: string }> }>
    expect(page.props.children.props.customerKey).toBe("neo:account:one")
    expect(mocks.load).toHaveBeenCalledWith({ source: "neo", entityId: "account:one", targetType: "neo_account" }, expect.anything())
  })
  it("잘못된 키에만 404를 반환하고 고객 조회를 실행하지 않는다", async () => {
    await expect(Page({ params: Promise.resolve({ key: "%invalid" }) })).rejects.toThrow("NEXT_NOT_FOUND")
    expect(mocks.load).not.toHaveBeenCalled()
  })
  it("실제로 없는 고객은 404를 유지한다", async () => {
    mocks.load.mockResolvedValue({ key: "lead:missing", found: false })
    await expect(Page({ params: Promise.resolve({ key: "lead%3Amissing" }) })).rejects.toThrow("NEXT_NOT_FOUND")
  })
})
