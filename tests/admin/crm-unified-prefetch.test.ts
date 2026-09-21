/**
 * 통합 고객(ClassIn 고객 DB) 목록 서버 프리페치(RSC)의 보안·스트리밍·시드 정합 계약(P1b).
 *
 * home-prefetch.ts(tests/admin/crm-home-prefetch.test.ts)와 같은 3가지 축을 검증한다:
 *  1) 보안 게이트 — 미검증·역할 부족이면 조회 자체를 부르지 않고 null.
 *  2) 스트리밍 계약 — openPrefetchLane이 settle을 기다리지 않고 {promise, generatedAt}을
 *     즉시 돌려준다(getCrmUnifiedCustomers가 영원히 안 끝나도 prefetch() 자체는 끝난다).
 *  3) 시드 정합 — buildUnifiedPrefetchUrl()(서버)과 buildUnifiedListDefaultUrl()(클라이언트,
 *     CrmUnifiedCustomersClient.tsx가 소유)이 같은 입력에 항상 같은 문자열을 낸다. 이 동등성이
 *     깨지면 서버가 심은 캐시를 클라이언트의 첫 loadPage(0)이 적중하지 못한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const getVerifiedAdminContextForPage = vi.fn()
const getCrmUnifiedCustomers = vi.fn()

vi.mock("@/lib/admin/page-auth", () => ({ getVerifiedAdminContextForPage }))
vi.mock("@/lib/repositories/crm-unified-customers", () => ({ getCrmUnifiedCustomers }))

const NOW = new Date("2026-09-21T00:00:00.000Z")

const CUSTOMERS_STUB = {
  generatedAt: "2026-09-21T00:00:00.000Z",
  sources: { leadsOk: true, neoAccountsOk: true, portalCustomersOk: true, warnings: [], statuses: [] },
  summary: { total: 3, leadCount: 1, accountCount: 2, highPriorityCount: 0, ownerCount: 1 },
  pagination: { limit: 50, offset: 0, returned: 3, total: 3, hasMore: false, nextOffset: null },
  owners: [],
  rows: [],
}

async function loadPrefetchModule() {
  const mod = await import("@/lib/admin/crm/unified-prefetch")
  return mod
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  getCrmUnifiedCustomers.mockResolvedValue(CUSTOMERS_STUB)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("prefetchCrmUnifiedInitialData 보안 게이트", () => {
  it("검증 컨텍스트가 없으면 조회를 부르지 않고 null(레인 없음)을 돌려준다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue(null)

    const { prefetchCrmUnifiedInitialData } = await loadPrefetchModule()
    expect(await prefetchCrmUnifiedInitialData()).toBeNull()
    expect(getCrmUnifiedCustomers).not.toHaveBeenCalled()
  })

  it("CRM 허용 역할이 아니면(PARTNER) 조회를 부르지 않는다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "PARTNER", userId: "u1" })

    const { prefetchCrmUnifiedInitialData } = await loadPrefetchModule()
    expect(await prefetchCrmUnifiedInitialData()).toBeNull()
    expect(getCrmUnifiedCustomers).not.toHaveBeenCalled()
  })

  it("검증 자체가 던져도 페이지를 500으로 만들지 않고 null로 떨어진다", async () => {
    getVerifiedAdminContextForPage.mockRejectedValue(new Error("supabase env missing"))
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const { prefetchCrmUnifiedInitialData } = await loadPrefetchModule()
    expect(await prefetchCrmUnifiedInitialData()).toBeNull()

    errorSpy.mockRestore()
  })
})

describe("prefetchCrmUnifiedInitialData 스트리밍 계약(레인 반환)", () => {
  it("허용 역할이면 조회가 settle되지 않아도 즉시 레인({promise, generatedAt})을 돌려준다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "EDITOR", userId: "u1" })
    getCrmUnifiedCustomers.mockImplementation(() => new Promise(() => {}))

    const { prefetchCrmUnifiedInitialData } = await loadPrefetchModule()
    const initialData = await prefetchCrmUnifiedInitialData()

    expect(initialData).not.toBeNull()
    expect(initialData?.customers.promise).toBeInstanceOf(Promise)
    expect(typeof initialData?.customers.generatedAt).toBe("number")
    expect(typeof initialData?.generatedAt).toBe("string")
  })

  it("최상위 generatedAt은 레인의 generatedAt(ms epoch)을 그대로 ISO 문자열로 옮긴 값이다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "EDITOR", userId: "u1" })

    const { prefetchCrmUnifiedInitialData } = await loadPrefetchModule()
    const initialData = await prefetchCrmUnifiedInitialData()
    await vi.advanceTimersByTimeAsync(0)

    if (!initialData) throw new Error("허용 역할인데 레인이 null이다")
    expect(initialData.generatedAt).toBe(new Date(initialData.customers.generatedAt).toISOString())
    expect(initialData.generatedAt).toBe(NOW.toISOString())
  })

  it("settle된 값은 라우트와 같은 저장소 함수 결과 그대로다", async () => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "SUPER_ADMIN", userId: "u1" })

    const { prefetchCrmUnifiedInitialData } = await loadPrefetchModule()
    const initialData = await prefetchCrmUnifiedInitialData()
    await vi.advanceTimersByTimeAsync(0)

    if (!initialData) throw new Error("허용 역할인데 레인이 null이다")
    await expect(initialData.customers.promise).resolves.toEqual(CUSTOMERS_STUB)
  })
})

describe("prefetchCrmUnifiedInitialData 옵션 매핑 — 클라이언트 기본 첫 조회와 동일해야 한다", () => {
  beforeEach(() => {
    getVerifiedAdminContextForPage.mockResolvedValue({ role: "EDITOR", userId: "u1" })
  })

  it("searchParams 없이 부르면 CrmUnifiedCustomersClient의 마운트 기본값과 같은 옵션으로 조회한다", async () => {
    const { prefetchCrmUnifiedInitialData } = await loadPrefetchModule()
    await prefetchCrmUnifiedInitialData()

    expect(getCrmUnifiedCustomers).toHaveBeenCalledWith({
      q: undefined,
      source: "all",
      lifecycle: "all",
      view: "all",
      owner: undefined,
      tag: undefined,
      includeUnconfirmed: false,
      limit: 50,
      offset: 0,
    })
  })

  it("?q= 를 반영하고 앞뒤 공백은 다듬는다", async () => {
    const { prefetchCrmUnifiedInitialData } = await loadPrefetchModule()
    await prefetchCrmUnifiedInitialData({ q: "  김철수  " })

    expect(getCrmUnifiedCustomers).toHaveBeenCalledWith(expect.objectContaining({ q: "김철수" }))
  })

  it("빈 문자열 q는 undefined로 접는다(listUrl의 트림-후-존재 검사와 동일)", async () => {
    const { prefetchCrmUnifiedInitialData } = await loadPrefetchModule()
    await prefetchCrmUnifiedInitialData({ q: "   " })

    expect(getCrmUnifiedCustomers).toHaveBeenCalledWith(expect.objectContaining({ q: undefined }))
  })

  it("알려진 ?view= 를 반영한다", async () => {
    const { prefetchCrmUnifiedInitialData } = await loadPrefetchModule()
    await prefetchCrmUnifiedInitialData({ view: "priority" })

    expect(getCrmUnifiedCustomers).toHaveBeenCalledWith(expect.objectContaining({ view: "priority" }))
  })

  it("모르는 ?view= 값은 all로 접는다", async () => {
    const { prefetchCrmUnifiedInitialData } = await loadPrefetchModule()
    await prefetchCrmUnifiedInitialData({ view: "nope" })

    expect(getCrmUnifiedCustomers).toHaveBeenCalledWith(expect.objectContaining({ view: "all" }))
  })

  it("my_owner는 문서화된 한계대로 all로 접는다(서버가 로그인 담당자 키를 풀지 않음)", async () => {
    const { prefetchCrmUnifiedInitialData } = await loadPrefetchModule()
    await prefetchCrmUnifiedInitialData({ view: "my_owner" })

    expect(getCrmUnifiedCustomers).toHaveBeenCalledWith(expect.objectContaining({ view: "all", owner: undefined }))
  })

  it("account 파라미터는 목록 조회 옵션에 영향을 주지 않는다(드로어 전용)", async () => {
    const { prefetchCrmUnifiedInitialData } = await loadPrefetchModule()
    await prefetchCrmUnifiedInitialData({ account: "lead:123" })

    expect(getCrmUnifiedCustomers).toHaveBeenCalledWith(expect.objectContaining({ view: "all", q: undefined }))
  })
})

describe("프리페치 URL == 클라이언트 기본 URL (시드 정합 고정)", () => {
  it("아무 searchParams 없이도 같은 URL 문자열을 만든다", async () => {
    const { buildUnifiedPrefetchUrl } = await loadPrefetchModule()
    const { buildUnifiedListDefaultUrl } = await import("@/components/admin/crm/CrmUnifiedCustomersClient")

    expect(buildUnifiedPrefetchUrl()).toBe(buildUnifiedListDefaultUrl())
    expect(buildUnifiedPrefetchUrl()).toBe("/api/admin/crm/customers/unified?limit=50&offset=0")
  })

  it("q·view가 있으면 두 함수 모두 같은 값을 반영한 같은 URL을 만든다", async () => {
    const { buildUnifiedPrefetchUrl } = await loadPrefetchModule()
    const { buildUnifiedListDefaultUrl } = await import("@/components/admin/crm/CrmUnifiedCustomersClient")

    const serverUrl = buildUnifiedPrefetchUrl({ q: "acme", view: "priority" })
    const clientUrl = buildUnifiedListDefaultUrl({ query: "acme", view: "priority" })
    expect(serverUrl).toBe(clientUrl)
    expect(serverUrl).toContain("q=acme")
    expect(serverUrl).toContain("view=priority")
  })

  it("모르는 view·my_owner도 두 함수가 같은 방식(all)으로 접는다", async () => {
    const { buildUnifiedPrefetchUrl } = await loadPrefetchModule()
    const { buildUnifiedListDefaultUrl } = await import("@/components/admin/crm/CrmUnifiedCustomersClient")

    expect(buildUnifiedPrefetchUrl({ view: "nope" })).toBe(buildUnifiedListDefaultUrl({ view: "nope" }))
    expect(buildUnifiedPrefetchUrl({ view: "my_owner" })).toBe(buildUnifiedListDefaultUrl({ view: "my_owner" }))
    expect(buildUnifiedPrefetchUrl({ view: "my_owner" })).toBe("/api/admin/crm/customers/unified?limit=50&offset=0")
  })
})
