import { NextRequest, NextResponse } from "next/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  capture: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  review: vi.fn(),
  bugs: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  requireVerifiedAdminContext: mocks.auth,
  STAFF_ADMIN_API_ROLES: ["ADMIN", "SUPER_ADMIN"],
  CRM_STAFF_ADMIN_API_ROLES: ["ADMIN", "SUPER_ADMIN", "BRANCH", "EDITOR"],
}))
vi.mock("@/lib/repositories/admin-requests", () => ({
  listAdminRequests: mocks.list,
  findAdminRequest: mocks.detail,
  findRequestCapture: mocks.capture,
  insertAdminRequest: mocks.insert,
  updateAdminRequest: mocks.update,
  reviewAdminRequest: mocks.review,
}))
vi.mock("@/lib/repositories/bugs", () => ({ getBugReports: mocks.bugs }))

import { GET, PATCH, POST } from "@/app/api/admin/requests/route"

const ID = "10000000-0000-4000-8000-000000000001"
const OWNER = "10000000-0000-4000-8000-000000000002"
const URL = "https://classin.co.kr/api/admin/requests"

beforeEach(() => {
  vi.resetAllMocks()
  mocks.auth.mockResolvedValue({ role: "EDITOR", userId: OWNER, name: "팀원" })
  mocks.list.mockResolvedValue({ requests: [], hasMore: false })
})

describe("homepage admin requests", () => {
  it("limits an editor's requests and screenshot lookups to their verified ID", async () => {
    await GET(new NextRequest(URL))
    expect(mocks.list).toHaveBeenCalledWith(OWNER, 0, null)

    const manage = await GET(new NextRequest(URL + "?view=manage"))
    expect(manage.status).toBe(403)
    expect(mocks.bugs).not.toHaveBeenCalled()

    const capture = await GET(new NextRequest(URL + "?capture=" + ID))
    expect(capture.status).toBe(404)
    expect(mocks.capture).toHaveBeenCalledWith(ID, OWNER)

    const detail = await GET(new NextRequest(URL + "?id=" + ID))
    expect(detail.status).toBe(404)
    expect(mocks.detail).toHaveBeenCalledWith(ID, OWNER)
  })

  it("returns existing reports only in the staff management list", async () => {
    mocks.auth.mockResolvedValue({ role: "ADMIN", userId: OWNER })
    mocks.bugs.mockResolvedValue([{ id: "BUG-1", status: "open" }])

    const response = await GET(new NextRequest(URL + "?view=manage&status=open"))
    expect(response.headers.get("cache-control")).toBe("private, no-store")
    expect(await response.json()).toMatchObject({ canManage: true, bugs: [{ id: "BUG-1" }] })
    expect(mocks.list).toHaveBeenCalledWith(null, 0, "open")
  })

  it("registers a screenshot and log with validated context and the verified reporter", async () => {
    mocks.insert.mockResolvedValue({ request: { id: ID }, replayed: false })
    const body = new FormData()
    body.set("submissionId", ID)
    body.set("kind", "bug")
    body.set("title", "저장 오류")
    body.set("description", "저장이 안 됩니다.")
    body.set("logs", "12:00 오류")
    body.set("screen", "/admin/quotes?private=value")
    body.set("testVersion", "requests-v1")
    body.set("capture", new File([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], "capture.png", { type: "image/png" }))
    const response = await POST(new NextRequest(URL, { method: "POST", body }))

    expect(response.status).toBe(201)
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      id: ID,
      reporter_id: OWNER,
      logs: "12:00 오류",
      screen: "/admin/quotes",
      test_version: "requests-v1",
      capture_mime: "image/png",
      capture_data: "iVBORw0KGgo=",
    }))
  })

  it("rejects oversized submissions before decoding the form", async () => {
    const response = await POST(new NextRequest(URL, { method: "POST", body: "bad form", headers: { "content-length": "3000000" } }))
    expect(response.status).toBe(413)
    expect(mocks.insert).not.toHaveBeenCalled()
  })

  it("distinguishes a replay of an accepted submission from a new write and a conflict", async () => {
    function submission() {
      const body = new FormData()
      body.set("submissionId", ID)
      body.set("kind", "bug")
      body.set("title", "제목")
      body.set("description", "재현 방법")
      return new NextRequest(URL, { method: "POST", body })
    }
    mocks.insert.mockResolvedValueOnce({ request: { id: ID }, replayed: true }).mockResolvedValueOnce("submission_conflict")
    const replay = await POST(submission())
    expect(replay.status).toBe(200)
    expect(await replay.json()).toEqual({ id: ID })
    expect((await POST(submission())).status).toBe(409)
  })

  it("leaves acknowledgement to authorized staff", async () => {
    const body = JSON.stringify({ id: ID, revision: 0, status: "open", reply: "", acknowledge: true })
    mocks.auth.mockResolvedValueOnce(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
    expect((await PATCH(new NextRequest(URL, { method: "PATCH", body }))).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()

    mocks.auth.mockResolvedValue({ role: "ADMIN", userId: OWNER, name: "담당자" })
    mocks.update.mockResolvedValue({ id: ID, revision: 1 })
    expect((await PATCH(new NextRequest(URL, { method: "PATCH", body }))).status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith({ id: ID, revision: 0, status: "open", reply: "", acknowledge: true, author: "담당자" })
  })

  it("rejects a staff mutation made with a reporter-only role", async () => {
    const body = JSON.stringify({ id: ID, revision: 0, status: "resolved", reply: "", acknowledge: false })
    expect((await PATCH(new NextRequest(URL, { method: "PATCH", body }))).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it("uses the verified owner for a resolution review and returns the updated state", async () => {
    mocks.review.mockResolvedValue({ id: ID, revision: 3, status: "in-progress", requester_review: "reopened" })
    const body = JSON.stringify({ id: ID, revision: 2, action: "review", review: "reopened", reply: "  저장 오류가 남아요. ", ownerId: ID, mutationId: ID })
    const response = await PATCH(new NextRequest(URL, { method: "PATCH", body }))
    expect(response.status).toBe(200)
    expect(mocks.review).toHaveBeenCalledWith({
      id: ID, revision: 2, ownerId: OWNER, review: "reopened", author: "팀원", reply: "저장 오류가 남아요.", operation: { id: ID, actorId: OWNER },
    })
    expect(await response.json()).toMatchObject({ revision: 3, status: "in-progress", requester_review: "reopened" })
  })

  it("reports conflicts for stale confirmation and requests that are no longer awaiting a review", async () => {
    const body = JSON.stringify({ id: ID, revision: 0, action: "review", review: "confirmed", reply: "" })
    mocks.review.mockResolvedValueOnce("conflict").mockResolvedValueOnce("not_awaiting_review")
    expect((await PATCH(new NextRequest(URL, { method: "PATCH", body }))).status).toBe(409)
    expect((await PATCH(new NextRequest(URL, { method: "PATCH", body }))).status).toBe(409)
  })
})
