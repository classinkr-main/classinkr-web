/**
 * 프리페치 시드 정합 — 담당(?owner=, F6)·세그먼트 조건(SG4) 딥링크도 서버 프리페치 URL 과 클라이언트 기본
 * URL 이 같은 문자열이어야 첫 loadPage(0)이 시드를 적중한다. 기본값(담당 없음·빈 조건)은 URL 에 싣지 않는다.
 * (기본 계약은 tests/admin/crm-unified-prefetch.test.ts — 여기서는 새 파라미터만 본다.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const getVerifiedAdminContextForPage = vi.fn()
const getCrmUnifiedCustomers = vi.fn()

vi.mock("@/lib/admin/page-auth", () => ({ getVerifiedAdminContextForPage }))
vi.mock("@/lib/repositories/crm-unified-customers", () => ({ getCrmUnifiedCustomers }))

beforeEach(() => {
  vi.clearAllMocks()
  getVerifiedAdminContextForPage.mockResolvedValue({ role: "EDITOR", userId: "u1" })
  getCrmUnifiedCustomers.mockResolvedValue({ rows: [] })
})

describe("프리페치 URL == 클라이언트 기본 URL — 담당·조건 딥링크", () => {
  it("담당·조건이 있으면 두 함수가 같은 정규형 URL 을 만든다", async () => {
    const { buildUnifiedPrefetchUrl } = await import("@/lib/admin/crm/unified-prefetch")
    const { buildUnifiedListDefaultUrl } = await import("@/components/admin/crm/CrmUnifiedCustomersClient")
    const input = { owner: " 김담당 ", segment: { risk: ["soon" as const, "urgent" as const], expDays: 30 }, view: "priority" }

    const serverUrl = buildUnifiedPrefetchUrl(input)
    expect(serverUrl).toBe(buildUnifiedListDefaultUrl(input))
    const params = new URL(serverUrl, "https://x").searchParams
    expect(params.get("owner")).toBe("김담당")
    expect(params.get("expDays")).toBe("30")
    expect(params.getAll("risk")).toEqual(["urgent", "soon"])
  })

  it("빈 조건·담당 없음·내 담당(__me)은 기본 URL 그대로", async () => {
    const { buildUnifiedPrefetchUrl } = await import("@/lib/admin/crm/unified-prefetch")
    const { buildUnifiedListDefaultUrl } = await import("@/components/admin/crm/CrmUnifiedCustomersClient")
    const DEFAULT = "/api/admin/crm/customers/unified?limit=50&offset=0"
    expect(buildUnifiedPrefetchUrl({ owner: "", segment: {} })).toBe(DEFAULT)
    expect(buildUnifiedPrefetchUrl({ owner: "__me" })).toBe(DEFAULT)
    expect(buildUnifiedListDefaultUrl({ owner: "__me", segment: { kinds: [] } })).toBe(DEFAULT)
  })

  it("프리페치 조회 옵션에 담당·조건을 싣고, 빈 조건은 옵션 모양을 바꾸지 않는다", async () => {
    const { prefetchCrmUnifiedInitialData } = await import("@/lib/admin/crm/unified-prefetch")
    await prefetchCrmUnifiedInitialData({ owner: "김담당", segment: { noContactDays: 30 } })
    expect(getCrmUnifiedCustomers).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "김담당", segment: { noContactDays: 30 } })
    )

    getCrmUnifiedCustomers.mockClear()
    await prefetchCrmUnifiedInitialData({ segment: {} })
    expect(getCrmUnifiedCustomers.mock.calls[0][0]).not.toHaveProperty("segment")
    expect(getCrmUnifiedCustomers.mock.calls[0][0]).toMatchObject({ owner: undefined })
  })
})
