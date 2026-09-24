import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

// PATCH /api/admin/me/nav — 본인 사이드바 편집(상시·기타·숨김) 저장 계약.
//
// 고정하는 것:
//  1. 가드는 전 관리자 역할을 명시한다(unsafe 기본값 STAFF_ADMIN 이면 EDITOR·VIEWER 가 못 쓴다).
//  2. 대상은 세션의 본인 행뿐이다 — body 의 userId 는 무시한다.
//  3. admin_profiles 가 없는 세션(레거시·바이패스)은 409, DB 를 부르지 않는다.
//  4. 정규화(모르는 href·Overview 숨김 제거, deny→folded)를 거친 값만 쓰고 nav_preset 은 건드리지 않는다.
//  5. 성공 시에만 감사·캐시 무효화(디렉터리 태그 + 셸 세션)를 한다.
const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  invalidateAdminShellSessionCache: vi.fn(),
  logAdminAudit: vi.fn(),
  revalidateTag: vi.fn(),
  createSupabaseAdminClient: vi.fn(),
}))

vi.mock("next/cache", () => ({ revalidateTag: mocks.revalidateTag }))
vi.mock("@/lib/admin-auth", () => ({
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
  invalidateAdminShellSessionCache: mocks.invalidateAdminShellSessionCache,
}))
vi.mock("@/lib/auth/audit", () => ({ logAdminAudit: mocks.logAdminAudit }))
vi.mock("@/lib/repositories/admin-users", () => ({
  ADMIN_USER_DIRECTORY_CACHE_TAG: "admin-user-directory",
}))
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mocks.createSupabaseAdminClient,
}))

const { PATCH } = await import("@/app/api/admin/me/nav/route")

function supabaseUpdateClient(result: { data: unknown; error: unknown }) {
  const single = vi.fn().mockResolvedValue(result)
  const select = vi.fn(() => ({ single }))
  const eqCalls: Array<[string, unknown]> = []
  const chain = {
    eq: vi.fn((column: string, value: unknown) => {
      eqCalls.push([column, value])
      return chain
    }),
    select,
  }
  const update = vi.fn(() => chain)
  const from = vi.fn(() => ({ update }))
  return { from, update, select, single, eqCalls }
}

function patchRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/me/nav", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

const EDITOR = { source: "supabase", role: "EDITOR", userId: "u-editor", name: "에디터", capabilities: [] }

let client = supabaseUpdateClient({ data: null, error: null })

beforeEach(() => {
  vi.clearAllMocks()
  client = supabaseUpdateClient({
    data: { user_id: "u-editor", nav_overrides: { "/admin/quotes": "hidden" } },
    error: null,
  })
  mocks.createSupabaseAdminClient.mockImplementation(() => client)
  mocks.requireVerifiedAdminContext.mockResolvedValue(EDITOR)
  mocks.logAdminAudit.mockResolvedValue(undefined)
})

describe("PATCH /api/admin/me/nav", () => {
  it("가드가 돌려준 401 을 그대로 내보내고 DB 를 부르지 않는다", async () => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    )

    const response = await PATCH(patchRequest({ navOverrides: {} }))

    expect(response.status).toBe(401)
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it("전 관리자 역할을 명시해 가드를 부른다", async () => {
    await PATCH(patchRequest({ navOverrides: {} }))

    expect(mocks.requireVerifiedAdminContext).toHaveBeenCalledWith(expect.any(NextRequest), [
      "SUPER_ADMIN",
      "ADMIN",
      "BRANCH",
      "EDITOR",
      "VIEWER",
    ])
  })

  it("EDITOR 도 자기 사이드바를 저장한다", async () => {
    const response = await PATCH(patchRequest({ navOverrides: { "/admin/quotes": "hidden" } }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ navOverrides: { "/admin/quotes": "hidden" } })
    expect(client.from).toHaveBeenCalledWith("admin_profiles")
  })

  it("body 의 userId 는 무시하고 본인 행만 갱신한다", async () => {
    await PATCH(patchRequest({ userId: "someone-else", navOverrides: {} }))

    expect(client.eqCalls).toContainEqual(["user_id", "u-editor"])
    expect(client.eqCalls).toContainEqual(["status", "ACTIVE"])
    expect(client.eqCalls.some(([, value]) => value === "someone-else")).toBe(false)
  })

  it.each([
    ["legacy", { source: "legacy", role: "admin", name: "Admin", capabilities: [] }],
    ["bypass", { source: "bypass", role: "SUPER_ADMIN", name: "Dev", capabilities: [] }],
    ["userId 없음", { source: "supabase", role: "ADMIN", name: "X", capabilities: [] }],
  ])("프로필 없는 세션(%s)은 409 이고 DB 를 부르지 않는다", async (_label, context) => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(context)

    const response = await PATCH(patchRequest({ navOverrides: {} }))

    expect(response.status).toBe(409)
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.invalidateAdminShellSessionCache).not.toHaveBeenCalled()
  })

  it("정규화한 값만 쓰고 nav_preset 은 payload 에 넣지 않는다", async () => {
    await PATCH(
      patchRequest({
        navOverrides: {
          "/admin/ops": "folded",
          "/admin/overview": "hidden",
          "/admin/없는탭": "hidden",
          "/admin/settings": "deny",
          "/admin/quotes": "hidden",
          "/admin/crm": "이상한값",
        },
      })
    )

    expect(client.update).toHaveBeenCalledTimes(1)
    const payload = (client.update.mock.calls[0] as unknown[])[0] as Record<string, unknown>
    expect(payload).toEqual({
      nav_overrides: { "/admin/ops": "folded", "/admin/settings": "folded", "/admin/quotes": "hidden" },
    })
    expect(payload).not.toHaveProperty("nav_preset")
  })

  it("navOverrides 가 없으면 400 이다", async () => {
    const response = await PATCH(patchRequest({ userId: "u-editor" }))

    expect(response.status).toBe(400)
    expect(mocks.createSupabaseAdminClient).not.toHaveBeenCalled()
  })

  it("성공하면 본인 대상 감사 로그와 두 캐시 무효화를 남긴다", async () => {
    await PATCH(patchRequest({ navOverrides: { "/admin/quotes": "hidden" } }))

    expect(mocks.logAdminAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        admin: EDITOR,
        action: "admin.nav_access.self_update",
        targetType: "admin_profile",
        targetId: "u-editor",
        payload: { navOverrides: { "/admin/quotes": "hidden" } },
      })
    )
    expect(mocks.revalidateTag).toHaveBeenCalledWith("admin-user-directory", "max")
    expect(mocks.invalidateAdminShellSessionCache).toHaveBeenCalledTimes(1)
  })

  it("DB 오류면 500 이고 감사·무효화를 하지 않는다", async () => {
    client = supabaseUpdateClient({ data: null, error: { message: "db down" } })
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})

    const response = await PATCH(patchRequest({ navOverrides: {} }))

    expect(response.status).toBe(500)
    expect(mocks.logAdminAudit).not.toHaveBeenCalled()
    expect(mocks.revalidateTag).not.toHaveBeenCalled()
    expect(mocks.invalidateAdminShellSessionCache).not.toHaveBeenCalled()
    errorLog.mockRestore()
  })
})
