import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// PATCH /api/admin/users — admin_profiles(role/owner 매핑에 쓰이는 nav·capabilities)를 바꾸면
// lib/repositories/admin-users.ts의 120초 사용자 디렉터리 캐시(admin-user-directory, deals-lite
// "assignToMe" 등 owner-lookup 소비처가 읽는다)를 revalidateTag(tag, "max")로 무효화해야 한다
// (2026-09-02). 이 테스트는 (1) capabilities 갱신, (2) nav 갱신 각각의 성공 경로에서 무효화가
// 실제로 일어나는지, (3) DB 갱신 실패 시에는 무효화하지 않는지를 고정한다.
const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  logAdminAudit: vi.fn(),
  revalidateTag: vi.fn(),
  invalidateAdminShellSessionCache: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }))
vi.mock("@/lib/admin-auth", () => ({
  STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
  invalidateAdminShellSessionCache: mocks.invalidateAdminShellSessionCache,
}))
vi.mock("@/lib/auth/audit", () => ({ logAdminAudit: mocks.logAdminAudit }))
vi.mock("@/lib/repositories/admin-users", () => ({
  ADMIN_USER_DIRECTORY_CACHE_TAG: "admin-user-directory",
  listAdminUserDirectory: vi.fn(),
}))

function supabaseUpdateClient(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result)
  const select = vi.fn(() => ({ single }))
  const eq = vi.fn(() => ({ select }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  return { from, update, eq, select, single }
}

let currentClient = supabaseUpdateClient({ data: null, error: null })

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(() => currentClient),
}))

function patchRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/users", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("PATCH /api/admin/users", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireVerifiedAdminContext.mockResolvedValue({ userId: "admin-1", role: "SUPER_ADMIN" })
    mocks.logAdminAudit.mockResolvedValue(undefined)
  })

  it("capabilities 갱신 성공 시 admin-user-directory 캐시를 즉시 무효화한다", async () => {
    currentClient = supabaseUpdateClient({
      data: { user_id: "u1", display_name: "Kim", role: "ADMIN", status: "ACTIVE", capabilities: ["hardware.finalize"] },
      error: null,
    })

    const { PATCH } = await import("@/app/api/admin/users/route")
    const response = await PATCH(patchRequest({ userId: "u1", capabilities: ["hardware.finalize"] }))

    expect(response.status).toBe(200)
    expect(mocks.revalidateTag).toHaveBeenCalledWith("admin-user-directory", "max")
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1)
  })

  it("nav 배치(navPreset/navOverrides) 갱신 성공 시에도 같은 캐시를 무효화한다", async () => {
    currentClient = supabaseUpdateClient({
      data: {
        user_id: "u1",
        display_name: "Kim",
        role: "ADMIN",
        status: "ACTIVE",
        nav_preset: null,
        nav_overrides: {},
      },
      error: null,
    })

    const { PATCH } = await import("@/app/api/admin/users/route")
    const response = await PATCH(patchRequest({ userId: "u1", navPreset: null, navOverrides: {} }))

    expect(response.status).toBe(200)
    expect(mocks.revalidateTag).toHaveBeenCalledWith("admin-user-directory", "max")
    expect(mocks.revalidateTag).toHaveBeenCalledTimes(1)
    // 대상자의 사이드바는 60초 셸 세션 캐시를 읽는다 — nav 를 바꿨으면 그것도 비운다(2026-09-25).
    expect(mocks.invalidateAdminShellSessionCache).toHaveBeenCalledTimes(1)
  })

  it("nav 갱신은 개인 숨김(hidden)을 보존하고 Overview 숨김은 지운다", async () => {
    currentClient = supabaseUpdateClient({
      data: { user_id: "u1", display_name: "Kim", role: "ADMIN", status: "ACTIVE", nav_preset: null, nav_overrides: {} },
      error: null,
    })

    const { PATCH } = await import("@/app/api/admin/users/route")
    const response = await PATCH(
      patchRequest({
        userId: "u1",
        navPreset: null,
        navOverrides: { "/admin/quotes": "hidden", "/admin/overview": "hidden", "/admin/settings": "deny" },
      })
    )

    expect(response.status).toBe(200)
    expect(currentClient.update).toHaveBeenCalledWith({
      nav_preset: null,
      nav_overrides: { "/admin/quotes": "hidden", "/admin/settings": "folded" },
    })
  })

  it("capabilities 갱신은 셸 세션 캐시를 건드리지 않는다(사이드바와 무관)", async () => {
    currentClient = supabaseUpdateClient({
      data: { user_id: "u1", display_name: "Kim", role: "ADMIN", status: "ACTIVE", capabilities: [] },
      error: null,
    })

    const { PATCH } = await import("@/app/api/admin/users/route")
    await PATCH(patchRequest({ userId: "u1", capabilities: [] }))

    expect(mocks.invalidateAdminShellSessionCache).not.toHaveBeenCalled()
  })

  it("DB 갱신이 실패하면 캐시를 무효화하지 않는다", async () => {
    currentClient = supabaseUpdateClient({ data: null, error: { message: "db down" } })

    const { PATCH } = await import("@/app/api/admin/users/route")
    const response = await PATCH(patchRequest({ userId: "u1", capabilities: ["hardware.finalize"] }))

    expect(response.status).toBe(500)
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.invalidateAdminShellSessionCache).not.toHaveBeenCalled()
  })

  it("userId가 없으면 400을 반환하고 무효화하지 않는다", async () => {
    const { PATCH } = await import("@/app/api/admin/users/route")
    const response = await PATCH(patchRequest({ capabilities: ["hardware.finalize"] }))

    expect(response.status).toBe(400)
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
  })
})
