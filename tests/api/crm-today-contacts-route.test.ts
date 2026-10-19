/**
 * GET /api/admin/crm/home/today-contacts — 담당(생략·'__me' = 로그인 사용자 · '' = 전체 · 이름) 해석, limit·includeHandled·
 * force 파싱, 캐시 헤더. 담당 해석은 실제 lib/admin/data-owner(dataOwnerFromRequest — 10월 줄기 3f5f0a21, 우선순위 큐
 * 라우트와 같은 규칙)를 그대로 태우고 디렉터리만 목으로 둔다.
 * 원천 조립은 목(getCrmTodayContacts) — 조립 규칙은 tests/repositories/crm-today-contacts.test.ts·
 * tests/crm/today-contact-queue.test.ts 가 고정한다.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

import { isTodayContactsCacheable, TODAY_CONTACTS_LIMIT, todayContactsUrl } from "@/lib/crm/today-contacts-request"

const OK_SOURCES = { leadsOk: true, neoAccountsOk: true, tasksOk: true, homeContactsOk: true, compass: "ok", warnings: [] }

const m = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  listAdminUserDirectoryCached: vi.fn(),
  findAdminCrmOwner: vi.fn(),
  getCrmTodayContacts: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: m.requireVerifiedAdminContext,
}))
vi.mock("@/lib/repositories/admin-users", () => ({
  CURRENT_ADMIN_OWNER_TOKEN: "__me",
  listAdminUserDirectoryCached: m.listAdminUserDirectoryCached,
  findAdminCrmOwner: m.findAdminCrmOwner,
}))
vi.mock("@/lib/repositories/crm-today-contacts", () => ({ getCrmTodayContacts: m.getCrmTodayContacts }))

async function get(path: string) {
  const { GET } = await import("@/app/api/admin/crm/home/today-contacts/route")
  return GET(new NextRequest(`https://classin.kr${path}`))
}

beforeEach(() => {
  for (const fn of Object.values(m)) fn.mockReset()
  m.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "김운영", userId: "u1" })
  m.listAdminUserDirectoryCached.mockResolvedValue({ users: [], crmOwners: [] })
  m.findAdminCrmOwner.mockReturnValue({ owner: { ownerKey: "kim", displayName: "김운영" }, ownerKeys: ["kim", "김운영"] })
  m.getCrmTodayContacts.mockResolvedValue({ rows: [], progress: { total: 0 }, sources: OK_SOURCES })
})

describe("GET today-contacts", () => {
  it("기본 URL(todayContactsUrl()) — 내 담당(로그인 사용자 키) · 기본 상한 · 처리된 행 포함 · 사설 캐시 헤더", async () => {
    const response = await get(todayContactsUrl())
    expect(response.status).toBe(200)
    expect(m.getCrmTodayContacts).toHaveBeenCalledWith({
      limit: TODAY_CONTACTS_LIMIT,
      owner: null,
      ownerKeys: expect.arrayContaining(["kim", "김운영", "u1"]),
      includeHandled: true,
      force: false,
    })
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=30, stale-while-revalidate=120")
  })

  it("owner 를 생략해도 내 담당이다 — 담당 전체는 빈 owner 를 명시할 때만(디렉터리도 읽지 않는다)", async () => {
    await get("/api/admin/crm/home/today-contacts?limit=60&v=1")
    const personal = m.getCrmTodayContacts.mock.lastCall?.[0]
    expect(personal.ownerKeys).toEqual(expect.arrayContaining(["kim", "김운영"]))

    m.listAdminUserDirectoryCached.mockClear()
    await get(todayContactsUrl(""))
    expect(m.getCrmTodayContacts).toHaveBeenLastCalledWith({
      limit: TODAY_CONTACTS_LIMIT,
      owner: null,
      ownerKeys: null,
      includeHandled: true,
      force: false,
    })
    expect(m.listAdminUserDirectoryCached).not.toHaveBeenCalled()
  })

  it("'__me' 는 요청자 담당 키로 푼다 — 매핑·계정 id 가 모두 없으면 아무 행과도 겹치지 않는 키(담당 전체로 새지 않게)", async () => {
    await get(todayContactsUrl("__me"))
    expect(m.getCrmTodayContacts).toHaveBeenLastCalledWith(
      expect.objectContaining({ owner: null, ownerKeys: expect.arrayContaining(["kim", "김운영"]) })
    )

    m.requireVerifiedAdminContext.mockResolvedValueOnce({ role: "ADMIN", name: "미연결" })
    m.findAdminCrmOwner.mockReturnValue({ owner: null, ownerKeys: [] })
    await get(todayContactsUrl("__me"))
    expect(m.getCrmTodayContacts).toHaveBeenLastCalledWith(
      expect.objectContaining({ ownerKeys: ["__no_current_admin_owner__"] })
    )
  })

  it("이름 담당·상한 절단·처리된 행 제외·새로고침(no-store)", async () => {
    const response = await get("/api/admin/crm/home/today-contacts?owner=%EB%B0%95%EB%8B%B4%EB%8B%B9&limit=999&includeHandled=0&force=1")
    expect(m.getCrmTodayContacts).toHaveBeenCalledWith({
      limit: 150,
      owner: null,
      // 이름 담당은 별칭까지 키로 푼다(branchMemberOwnerAliases) — 큐 라우트와 같은 해석.
      ownerKeys: expect.arrayContaining(["박담당"]),
      includeHandled: false,
      force: true,
    })
    expect(m.getCrmTodayContacts.mock.lastCall?.[0].ownerKeys).not.toContain("kim")
    expect(response.headers.get("Cache-Control")).toBe("no-store")
  })

  it("권한 실패는 그대로 · 조립 실패는 500", async () => {
    m.requireVerifiedAdminContext.mockResolvedValueOnce(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
    expect((await get(todayContactsUrl(""))).status).toBe(403)
    m.getCrmTodayContacts.mockRejectedValueOnce(new Error("boom"))
    expect((await get(todayContactsUrl(""))).status).toBe(500)
  })

  it("URL 빌더는 v=1 로 캐시 키를 분리하고 담당을 늘 싣는다(기본 내 담당 · 전체는 빈 owner 명시)", () => {
    expect(todayContactsUrl()).toBe("/api/admin/crm/home/today-contacts?limit=60&v=1&owner=__me")
    expect(todayContactsUrl("")).toBe("/api/admin/crm/home/today-contacts?limit=60&v=1&owner=")
    expect(todayContactsUrl(" 박담당 ", 20)).toBe(
      `/api/admin/crm/home/today-contacts?limit=20&v=1&owner=${encodeURIComponent("박담당")}`
    )
  })

  it("[22] 강등 응답(필수 원천 하나라도 못 읽음)은 no-store — Compass 끊김만은 강등이 아니다", async () => {
    for (const broken of ["leadsOk", "neoAccountsOk", "tasksOk", "homeContactsOk"] as const) {
      m.getCrmTodayContacts.mockResolvedValueOnce({ rows: [], progress: { total: 0 }, sources: { ...OK_SOURCES, [broken]: false } })
      const response = await get(todayContactsUrl(""))
      expect(response.status).toBe(200)
      expect(response.headers.get("Cache-Control")).toBe("no-store")
    }
    m.getCrmTodayContacts.mockResolvedValueOnce({ rows: [], progress: { total: 0 }, sources: { ...OK_SOURCES, compass: "down" } })
    const compassDown = await get(todayContactsUrl(""))
    expect(compassDown.headers.get("Cache-Control")).toBe("private, max-age=30, stale-while-revalidate=120")
  })

  it("[22] isTodayContactsCacheable — 네 필수 원천이 모두 true 일 때만(모양이 다르면 캐시하지 않는다)", () => {
    expect(isTodayContactsCacheable({ sources: OK_SOURCES as never })).toBe(true)
    expect(isTodayContactsCacheable({ sources: { ...OK_SOURCES, tasksOk: false } as never })).toBe(false)
    expect(isTodayContactsCacheable({})).toBe(false)
    expect(isTodayContactsCacheable(null)).toBe(false)
  })
})
