import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

// POST /api/admin/crm/tasks/bulk(SG7) — 역할 가드, 입력 검증(상한 200·title 1~120자·dueAt·note),
// invalid 키 집계, 저장소 결과(created/skipped/failed) 전달, 전부 실패 500, 마이그레이션 미적용 503 을 고정한다.
// 키 해석(lib/crm/unified-customer-key.ts)과 dueAt 해석(lib/crm/task-due-at.ts)은 실제 모듈을 쓴다.

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  createCrmTasksForTargets: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH", "EDITOR"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/crm-tasks", () => ({
  isCrmTasksNotReadyError: (error: unknown) =>
    error instanceof Error && error.message.includes("CRM task DB 마이그레이션"),
}))

vi.mock("@/lib/repositories/crm-tasks-bulk", () => ({
  CRM_TASK_BULK_MAX_TARGETS: 200,
  CRM_TASK_BULK_TITLE_MAX: 120,
  CRM_TASK_BULK_NOTE_MAX: 2000,
  createCrmTasksForTargets: mocks.createCrmTasksForTargets,
}))

const LEAD_A = "11111111-1111-4111-8111-111111111111"

function postRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/crm/tasks/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

async function loadRoute() {
  return import("@/app/api/admin/crm/tasks/bulk/route")
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "EDITOR", name: " 이매니저 ", userId: "admin-2" })
  mocks.createCrmTasksForTargets.mockResolvedValue({ created: 0, skipped: 0, failed: [] })
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})

describe("POST /api/admin/crm/tasks/bulk — 가드", () => {
  it("CRM_STAFF_ADMIN_API_ROLES 로 가드를 부른다", async () => {
    const { POST } = await loadRoute()
    await POST(postRequest({ keys: ["neo:acc-1"], title: "전화" }))
    expect(mocks.requireVerifiedAdminContext).toHaveBeenCalledWith(expect.anything(), [
      "SUPER_ADMIN",
      "ADMIN",
      "BRANCH",
      "EDITOR",
    ])
  })

  it.each([401, 403])("가드가 %i 을 돌려주면 저장소를 부르지 않고 그대로 응답한다", async (status) => {
    mocks.requireVerifiedAdminContext.mockResolvedValue(NextResponse.json({ error: "denied" }, { status }))
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ keys: ["neo:acc-1"], title: "전화" }))
    expect(response.status).toBe(status)
    expect(mocks.createCrmTasksForTargets).not.toHaveBeenCalled()
  })
})

describe("POST /api/admin/crm/tasks/bulk — 입력 검증(400)", () => {
  it("JSON 객체가 아니면 400", async () => {
    const { POST } = await loadRoute()
    expect((await POST(postRequest("nope"))).status).toBe(400)
    expect((await POST(postRequest([]))).status).toBe(400)
  })

  it("keys 가 배열이 아니거나 비어 있으면 400", async () => {
    const { POST } = await loadRoute()
    expect((await POST(postRequest({ keys: "neo:acc-1", title: "전화" }))).status).toBe(400)
    expect((await POST(postRequest({ keys: [], title: "전화" }))).status).toBe(400)
  })

  it("중복 제거 후 200개를 넘으면 400(limit 포함)", async () => {
    const { POST } = await loadRoute()
    const over = Array.from({ length: 201 }, (_, i) => `neo:acc-${i}`)
    const response = await POST(postRequest({ keys: over, title: "전화" }))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ limit: 200 })
    expect(mocks.createCrmTasksForTargets).not.toHaveBeenCalled()

    const dupes = [...Array.from({ length: 200 }, (_, i) => `neo:acc-${i}`), "neo:acc-5"]
    expect((await POST(postRequest({ keys: dupes, title: "전화" }))).status).toBe(200)
  })

  it("title 이 없거나 공백뿐이거나 120자를 넘으면 400", async () => {
    const { POST } = await loadRoute()
    for (const title of [undefined, 5, "", "   ", "가".repeat(121)]) {
      const response = await POST(postRequest({ keys: ["neo:acc-1"], title }))
      expect(response.status, String(title)).toBe(400)
    }
    expect((await POST(postRequest({ keys: ["neo:acc-1"], title: ` ${"가".repeat(120)} ` }))).status).toBe(200)
  })

  it("dueAt 을 해석하지 못하면 400(할 일 PATCH 와 같은 규칙)", async () => {
    const { POST } = await loadRoute()
    for (const dueAt of ["내일쯤", 1727222400000, { at: "2026-09-30" }]) {
      const response = await POST(postRequest({ keys: ["neo:acc-1"], title: "전화", dueAt }))
      expect(response.status, JSON.stringify(dueAt)).toBe(400)
    }
    expect(mocks.createCrmTasksForTargets).not.toHaveBeenCalled()
  })

  it("note 가 문자열이 아니거나 2,000자를 넘으면 400", async () => {
    const { POST } = await loadRoute()
    expect((await POST(postRequest({ keys: ["neo:acc-1"], title: "전화", note: 3 }))).status).toBe(400)
    expect((await POST(postRequest({ keys: ["neo:acc-1"], title: "전화", note: "a".repeat(2001) }))).status).toBe(400)
  })
})

describe("POST /api/admin/crm/tasks/bulk — 처리", () => {
  it("해석된 대상·제목·기한(ISO)·메모·작성자를 저장소에 넘기고 결과를 그대로 돌려준다", async () => {
    mocks.createCrmTasksForTargets.mockResolvedValue({ created: 1, skipped: 1, failed: [] })
    const { POST } = await loadRoute()
    const response = await POST(
      postRequest({
        keys: [`lead:${LEAD_A}`, "neo:acc-1", "bogus"],
        title: "  갱신 안내 ",
        dueAt: "2026-09-30T09:00:00+09:00",
        note: " 메모 ",
      })
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ created: 1, skipped: 1, invalid: ["bogus"], failed: [] })
    expect(mocks.createCrmTasksForTargets).toHaveBeenCalledWith({
      targets: [
        { key: `lead:${LEAD_A}`, targetType: "lead", targetId: LEAD_A },
        { key: "neo:acc-1", targetType: "neo_account", targetId: "acc-1" },
      ],
      title: "갱신 안내",
      dueAt: "2026-09-30T00:00:00.000Z",
      note: "메모",
      createdBy: "이매니저",
    })
  })

  it("dueAt 이 없거나 null·빈 문자열이면 기한 없음(null), 빈 메모는 null", async () => {
    const { POST } = await loadRoute()
    for (const dueAt of [undefined, null, ""]) {
      mocks.createCrmTasksForTargets.mockClear()
      await POST(postRequest({ keys: ["neo:acc-1"], title: "전화", dueAt, note: "  " }))
      expect(mocks.createCrmTasksForTargets).toHaveBeenCalledWith(expect.objectContaining({ dueAt: null, note: null }))
    }
  })

  it("키가 전부 invalid 면 저장소를 부르지 않고 0건으로 응답한다", async () => {
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ keys: ["bogus", "customer:1"], title: "전화" }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ created: 0, skipped: 0, invalid: ["bogus", "customer:1"], failed: [] })
    expect(mocks.createCrmTasksForTargets).not.toHaveBeenCalled()
  })

  it("중복(같은 제목의 열린 할 일)은 skipped 로 전달된다 — 전부 중복이어도 200", async () => {
    mocks.createCrmTasksForTargets.mockResolvedValue({ created: 0, skipped: 2, failed: [] })
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ keys: ["neo:acc-1", "neo:acc-2"], title: "전화" }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ created: 0, skipped: 2 })
  })

  it("부분 실패는 200 + failed 키로 집계한다", async () => {
    mocks.createCrmTasksForTargets.mockResolvedValue({ created: 1, skipped: 0, failed: ["neo:acc-2"] })
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ keys: ["neo:acc-1", "neo:acc-2"], title: "전화" }))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ created: 1, failed: ["neo:acc-2"] })
  })

  it("생성을 시도한 대상이 전부 실패하면 500(건수는 함께 싣는다)", async () => {
    mocks.createCrmTasksForTargets.mockResolvedValue({ created: 0, skipped: 1, failed: ["neo:acc-2"] })
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ keys: ["neo:acc-1", "neo:acc-2"], title: "전화" }))
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ created: 0, skipped: 1, failed: ["neo:acc-2"] })
  })

  it("할 일 테이블 마이그레이션 미적용이면 503", async () => {
    mocks.createCrmTasksForTargets.mockRejectedValue(new Error("CRM task DB 마이그레이션이 아직 적용되지 않았습니다."))
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ keys: ["neo:acc-1"], title: "전화" }))
    expect(response.status).toBe(503)
  })

  it("저장소가 던지면 500", async () => {
    mocks.createCrmTasksForTargets.mockRejectedValue(new Error("boom"))
    const { POST } = await loadRoute()
    const response = await POST(postRequest({ keys: ["neo:acc-1"], title: "전화" }))
    expect(response.status).toBe(500)
  })
})
