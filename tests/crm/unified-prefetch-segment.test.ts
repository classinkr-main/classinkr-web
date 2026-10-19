/**
 * 프리페치 시드 정합 — 담당(?owner=, F6)·세그먼트 조건(SG4) 딥링크도 서버 프리페치 URL 과 클라이언트 기본
 * URL 이 같은 문자열이어야 첫 loadPage(0)이 시드를 적중한다. 빈 조건은 URL 에 싣지 않는다. 담당은 2026-10-16
 * 기본 담당 계약(생략=로그인 담당 `__me`, 빈 값=전체)이라 늘 싣는다 — 기본 URL 도 `owner=__me` 를 담는다.
 * (기본 계약은 tests/admin/crm-unified-prefetch.test.ts — 여기서는 새 파라미터만 본다.)
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const getVerifiedAdminContextForPage = vi.fn()
const getCrmUnifiedCustomers = vi.fn()

vi.mock("@/lib/admin/page-auth", () => ({ getVerifiedAdminContextForPage }))
vi.mock("@/lib/repositories/crm-unified-customers", () => ({ getCrmUnifiedCustomers }))
// 로그인 담당 키 해석(라우트 dataOwnerFromRequest 와 같은 currentDataOwner) — 디렉터리 조회 없이 고정 키.
vi.mock("@/lib/admin/data-owner", () => ({ currentDataOwner: async () => ({ keys: ["Somang"], owner: null }) }))

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

  it("빈 조건·담당 생략·내 담당(__me)은 기본 URL 그대로, 전체(빈 값)는 owner= 를 밝힌다", async () => {
    const { buildUnifiedPrefetchUrl } = await import("@/lib/admin/crm/unified-prefetch")
    const { buildUnifiedListDefaultUrl } = await import("@/components/admin/crm/CrmUnifiedCustomersClient")
    const DEFAULT = "/api/admin/crm/customers/unified?limit=50&offset=0&owner=__me"
    expect(buildUnifiedPrefetchUrl()).toBe(DEFAULT)
    expect(buildUnifiedPrefetchUrl({ owner: "__me" })).toBe(DEFAULT)
    expect(buildUnifiedListDefaultUrl()).toBe(DEFAULT)
    expect(buildUnifiedListDefaultUrl({ owner: "__me", segment: { kinds: [] } })).toBe(DEFAULT)
    const ALL = "/api/admin/crm/customers/unified?limit=50&offset=0&owner="
    expect(buildUnifiedPrefetchUrl({ owner: "", segment: {} })).toBe(ALL)
    expect(buildUnifiedListDefaultUrl({ owner: "", segment: {} })).toBe(ALL)
  })

  it("프리페치 조회 옵션에 담당·조건을 싣고, 빈 조건은 옵션 모양을 바꾸지 않는다", async () => {
    const { prefetchCrmUnifiedInitialData } = await import("@/lib/admin/crm/unified-prefetch")
    // 담당 이름은 라우트(dataOwnerFromRequest)와 같은 별칭 키(branchMemberOwnerAliases)로 — owner 문자열로 새지 않는다.
    await prefetchCrmUnifiedInitialData({ owner: "김담당", segment: { noContactDays: 30 } })
    expect(getCrmUnifiedCustomers).toHaveBeenCalledWith(
      expect.objectContaining({ ownerKeys: expect.arrayContaining(["김담당"]), segment: { noContactDays: 30 } })
    )
    expect(getCrmUnifiedCustomers.mock.calls[0][0]).not.toHaveProperty("owner")

    // 기본(담당 생략 = 내 담당) — 로그인 담당 키로 좁힌다. 빈 조건은 segment 키 자체를 싣지 않는다.
    getCrmUnifiedCustomers.mockClear()
    await prefetchCrmUnifiedInitialData({ segment: {} })
    expect(getCrmUnifiedCustomers.mock.calls[0][0]).not.toHaveProperty("segment")
    expect(getCrmUnifiedCustomers.mock.calls[0][0]).not.toHaveProperty("owner")
    expect(getCrmUnifiedCustomers.mock.calls[0][0]).toMatchObject({ ownerKeys: ["Somang"] })

    // 전체(owner=) — 담당 키 없이 조회한다.
    getCrmUnifiedCustomers.mockClear()
    await prefetchCrmUnifiedInitialData({ owner: "" })
    expect(getCrmUnifiedCustomers.mock.calls[0][0].ownerKeys).toBeUndefined()
  })
})
