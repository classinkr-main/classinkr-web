import { beforeEach, describe, expect, it, vi } from "vitest"
import type { VerifiedAdminContext } from "@/lib/admin-auth"

const directory = vi.hoisted(() => vi.fn())
vi.mock("@/lib/repositories/admin-users", async (original) => ({
  ...await original<typeof import("@/lib/repositories/admin-users")>(),
  listAdminUserDirectoryCached: directory,
}))
import { currentDataOwner, dataOwnerFromRequest, UNMAPPED_OWNER } from "@/lib/admin/data-owner"
import { resolvePersonalBranchManager } from "@/lib/admin/personal-branch"

const admin = (userId: string, name?: string): VerifiedAdminContext => ({ source: "supabase", role: "admin", userId, name, capabilities: [] })
const owner = (userId: string, displayName: string, ownerKey: string) => ({ userId, displayName, ownerKey, ownerAliases: [displayName], neoOwnerId: null })
beforeEach(() => {
  directory.mockReset()
  directory.mockResolvedValue({ users: [owner("a", "문준혁", "custom-owner-a"), owner("b", "진소망", "Somang")], crmOwners: [] })
})

describe("검증한 접속자의 개인 기본값", () => {
  it("배정 가능한 담당자 목록에서 제외된 관리자도 UUID로 자기 프로필을 찾는다", async () => {
    const first = await currentDataOwner(admin("a", "다른 표시 이름"))
    const second = await currentDataOwner(admin("b"))
    expect(first.keys).toEqual(expect.arrayContaining(["a", "문준혁", "Junhyuk"]))
    expect(first.keys).not.toContain("Somang")
    expect(second.keys).toEqual(expect.arrayContaining(["b", "진소망", "Somang"]))
    expect(second.keys).not.toContain("Junhyuk")
    expect(await resolvePersonalBranchManager(admin("a"))).toBe("Junhyuk")
  })
  it("기본 요청과 __me는 인증 계정으로 해석하고, 명시적 전체만 범위를 해제한다", async () => {
    const base = "https://example.test/api"
    expect(await dataOwnerFromRequest(new URL(base), admin("b"))).toContain("Somang")
    expect(await dataOwnerFromRequest(new URL(base + "?owner=__me"), admin("a"))).toContain("Junhyuk")
    directory.mockClear()
    expect(await dataOwnerFromRequest(new URL(base + "?owner="), admin("a"))).toBeUndefined()
    expect(directory).not.toHaveBeenCalled()
    expect(await dataOwnerFromRequest(new URL(base + "?owner=진소망"), admin("a"))).toContain("Somang")
  })
  it("미매핑이나 디렉터리 장애를 전사 조회로 넓히지 않는다", async () => {
    expect((await currentDataOwner({ source: "legacy", role: "admin", name: "미연결", capabilities: [] })).keys).toEqual([UNMAPPED_OWNER])
    directory.mockRejectedValueOnce(new Error("directory unavailable"))
    await expect(currentDataOwner(admin("a"))).rejects.toThrow("directory unavailable")
  })
})
