import { afterEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

import { sanitizeBugReportInput } from "@/lib/admin/dev-workflow"

// 사내 버그 리포트(/admin/dev) — 입력 검증·삭제 실패·수정 장애가 성공이나 "없음"으로 가려지지 않는다(2026-10-12).

describe("sanitizeBugReportInput", () => {
  it("필요한 칸만 남기고 다듬는다 — 세션 이름이 신고자다", () => {
    expect(
      sanitizeBugReportInput(
        { title: "  CRM 저장 실패  ", description: "재현 단계", severity: "high", reporter: "위조", tags: ["crm", " crm ", "", 3], id: "x", status: "closed" },
        "김운영"
      )
    ).toEqual({ title: "CRM 저장 실패", description: "재현 단계", severity: "high", reporter: "김운영", tags: ["crm"], assignee: undefined, environment: undefined })
  })

  it("세션 이름이 없으면 본문의 신고자, 둘 다 없으면 거절", () => {
    expect(sanitizeBugReportInput({ title: "t", reporter: "이름" }, undefined)).toMatchObject({ reporter: "이름", severity: "medium" })
    expect(sanitizeBugReportInput({ title: "t" }, null)).toEqual({ error: "reporter is required" })
  })

  it("제목이 없거나 등급이 어휘 밖이면 거절 — DB check 위반 500 대신 400", () => {
    expect(sanitizeBugReportInput({ title: "   " }, "a")).toEqual({ error: "title is required" })
    expect(sanitizeBugReportInput({ title: "t", severity: "urgent" }, "a")).toEqual({ error: "Invalid bug severity" })
    expect(sanitizeBugReportInput(null, "a")).toEqual({ error: "Invalid JSON body" })
    expect(sanitizeBugReportInput([], "a")).toEqual({ error: "Invalid JSON body" })
  })

  it("긴 값은 상한에서 자른다", () => {
    const result = sanitizeBugReportInput({ title: "가".repeat(500), description: "d".repeat(20_000) }, "a")
    expect("error" in result).toBe(false)
    if (!("error" in result)) {
      expect(result.title).toHaveLength(200)
      expect(result.description).toHaveLength(10_000)
    }
  })
})

async function loadRoutes(repo: { update?: unknown; deleted?: boolean; createError?: Error }) {
  vi.resetModules()
  const createBugReport = vi.fn(async (input: Record<string, unknown>) => {
    if (repo.createError) throw repo.createError
    return { id: "bug-1", status: "open", createdAt: "", updatedAt: "", ...input }
  })
  vi.doMock("@/lib/admin-auth", () => ({
    STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN"],
    verifyAdmin: vi.fn(async () => null),
    requireVerifiedAdminContext: vi.fn(async () => ({ source: "supabase", role: "ADMIN", name: "김운영", capabilities: [] })),
  }))
  vi.doMock("@/lib/admin-api-response", () => ({ adminCachedJson: (data: unknown) => NextResponse.json(data) }))
  vi.doMock("@/lib/notifications/emit-event", () => ({ emitNotificationEvent: vi.fn(async () => ({})) }))
  vi.doMock("@/lib/repositories/bugs", () => ({
    createBugReport,
    getBugReports: vi.fn(async () => []),
    updateBugReport: vi.fn(async () => {
      if (repo.update instanceof Error) throw repo.update
      return repo.update ?? null
    }),
    deleteBugReport: vi.fn(async () => repo.deleted ?? true),
  }))
  const list = await import("@/app/api/admin/bugs/route")
  const byId = await import("@/app/api/admin/bugs/[id]/route")
  return { list, byId, createBugReport }
}

const params = { params: Promise.resolve({ id: "bug-1" }) }
const req = (method: string, body?: unknown) =>
  new NextRequest("https://classin.co.kr/api/admin/bugs/bug-1", {
    method,
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  })

describe("/api/admin/bugs 라우트", () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it("POST 는 검증한 칸만 저장하고 신고자를 세션 이름으로 둔다", async () => {
    const { list, createBugReport } = await loadRoutes({})
    const res = await list.POST(req("POST", { title: "t", severity: "low", reporter: "위조", status: "closed" }))
    expect(res.status).toBe(201)
    expect(createBugReport).toHaveBeenCalledWith(expect.objectContaining({ title: "t", severity: "low", reporter: "김운영" }))
    expect(createBugReport.mock.calls[0][0]).not.toHaveProperty("status")
  })

  it("POST 의 깨진 JSON·잘못된 등급은 400, 저장 실패는 고정 문구 500", async () => {
    const bad = await loadRoutes({})
    expect((await bad.list.POST(req("POST", "{not json"))).status).toBe(400)
    expect((await bad.list.POST(req("POST", { title: "t", severity: "urgent" }))).status).toBe(400)
    const broken = await loadRoutes({ createError: new Error("permission denied for table bug_reports") })
    const res = await broken.list.POST(req("POST", { title: "t" }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: "버그 리포트를 저장하지 못했습니다." })
  })

  it("DELETE 가 실패하면 성공으로 응답하지 않는다", async () => {
    const { byId } = await loadRoutes({ deleted: false })
    const res = await byId.DELETE(req("DELETE"), params)
    expect(res.status).toBe(500)
  })

  it("DELETE 가 성공하면 ok", async () => {
    const { byId } = await loadRoutes({ deleted: true })
    const res = await byId.DELETE(req("DELETE"), params)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it("PATCH 저장 장애는 404 가 아니라 500, 행이 없을 때만 404", async () => {
    const broken = await loadRoutes({ update: new Error("[bugs] 수정 실패: timeout") })
    expect((await broken.byId.PATCH(req("PATCH", { status: "resolved" }), params)).status).toBe(500)
    const missing = await loadRoutes({ update: null })
    expect((await missing.byId.PATCH(req("PATCH", { status: "resolved" }), params)).status).toBe(404)
  })
})
