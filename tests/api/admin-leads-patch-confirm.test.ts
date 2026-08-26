import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// 캠페인 허브 "신규 리드" 탭의 연락함 체크는 PATCH 한 번에 전부를 건다 —
// {status:"contacted"} 만 보내고, "확인 도장"(confirmed_at)은 라우트가 서버 시각으로 찍는다.
// 이 계약이 조용히 깨지면 화면은 멀쩡한데 CRM 확인 신호만 사라지므로 여기서 고정한다.
const requireVerifiedAdminContext = vi.fn()
const updateLead = vi.fn()
const deleteLead = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext,
}))

vi.mock("@/lib/repositories/leads", () => ({
  updateLead,
  deleteLead,
}))

function patchRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/leads/lead-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function callPatch(body: unknown) {
  const { PATCH } = await import("@/app/api/admin/leads/[id]/route")
  return PATCH(patchRequest(body), { params: Promise.resolve({ id: "lead-1" }) })
}

/** 라우트가 실제로 저장소에 넘긴 patch */
function sentPatch() {
  return updateLead.mock.calls.at(-1)?.[1] as Record<string, unknown>
}

describe("PATCH /api/admin/leads/[id] — 연락 체크와 확인 도장", () => {
  beforeEach(() => {
    requireVerifiedAdminContext.mockResolvedValue({ source: "supabase", role: "ADMIN", userId: "admin-1" })
    updateLead.mockImplementation(async (id: string, patch: Record<string, unknown>) => ({
      id,
      source: "meta_lead_ads",
      timestamp: "2026-08-26T00:00:00.000Z",
      status: "new",
      ...patch,
    }))
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("status를 contacted로 바꾸면 confirmed_at을 서버 시각으로 함께 찍는다", async () => {
    const before = Date.now()
    const res = await callPatch({ status: "contacted" })
    const after = Date.now()

    expect(res.status).toBe(200)
    const patch = sentPatch()
    expect(patch.status).toBe("contacted")
    expect(typeof patch.confirmed_at).toBe("string")

    // 서버 시각이어야 한다 — 클라이언트가 보낸 값이 아니라.
    const stamped = new Date(patch.confirmed_at as string).getTime()
    expect(stamped).toBeGreaterThanOrEqual(before)
    expect(stamped).toBeLessThanOrEqual(after)

    // 응답은 갱신된 리드를 그대로 돌려준다 — 탭이 이 값으로 낙관적 갱신을 갈아끼운다.
    const body = (await res.json()) as { lead: Record<string, unknown> }
    expect(body.lead.status).toBe("contacted")
    expect(body.lead.confirmed_at).toBe(patch.confirmed_at)
  })

  it("converted·closed로 바뀔 때도 확인 도장을 찍는다", async () => {
    for (const status of ["converted", "closed"] as const) {
      await callPatch({ status })
      expect(sentPatch().confirmed_at, `${status} 에서 확인 도장 누락`).toBeTruthy()
    }
  })

  it("status를 new로 되돌릴 때는 확인 도장을 찍지 않는다", async () => {
    await callPatch({ status: "new" })
    const patch = sentPatch()
    expect(patch.status).toBe("new")
    expect(patch.confirmed_at).toBeUndefined()
  })

  it("클라이언트가 confirmed_at을 직접 지정할 수 없다 — 임의 시각 주입 차단", async () => {
    await callPatch({ status: "contacted", confirmed_at: "1999-01-01T00:00:00.000Z" })
    expect(sentPatch().confirmed_at).not.toBe("1999-01-01T00:00:00.000Z")
  })

  it("confirmed:true 단독으로도 확인 도장만 찍는다(상태는 건드리지 않음)", async () => {
    await callPatch({ confirmed: true })
    const patch = sentPatch()
    expect(patch.confirmed_at).toBeTruthy()
    expect(patch.status).toBeUndefined()
  })

  it("유효하지 않은 상태는 400 — 저장소를 부르지 않는다", async () => {
    const res = await callPatch({ status: "연락함" })
    expect(res.status).toBe(400)
    expect(updateLead).not.toHaveBeenCalled()
  })

  it("바꿀 필드가 없으면 400", async () => {
    const res = await callPatch({})
    expect(res.status).toBe(400)
    expect(updateLead).not.toHaveBeenCalled()
  })

  it("없는 리드는 404 — 탭이 낙관적 갱신을 되돌릴 수 있어야 한다", async () => {
    updateLead.mockResolvedValueOnce(null)
    const res = await callPatch({ status: "contacted" })
    expect(res.status).toBe(404)
  })
})
