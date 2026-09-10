import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const requireVerifiedAdminContext = vi.fn()
const getContactLogs = vi.fn()
const addContactLog = vi.fn()
const deleteContactLog = vi.fn()
const getLeadById = vi.fn()
const updateLead = vi.fn()
const getOrCreateCrmCustomerEventBySource = vi.fn()
const createTasksFromEventNextActions = vi.fn()

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext,
}))
vi.mock("@/lib/repositories/contact-logs", () => ({
  getContactLogs,
  addContactLog,
  deleteContactLog,
}))
vi.mock("@/lib/repositories/leads", () => ({ getLeadById, updateLead }))
vi.mock("@/lib/repositories/crm-events", () => ({ getOrCreateCrmCustomerEventBySource }))
vi.mock("@/lib/repositories/crm-tasks", () => ({ createTasksFromEventNextActions }))

const LEAD = {
  id: "lead-1",
  name: "홍길동",
  org: "ClassIn 학원",
  status: "new",
  timestamp: "2026-08-27T01:00:00.000Z",
}
const LOG = {
  id: "log-1",
  lead_id: "lead-1",
  type: "call",
  result: "answered",
  notes: "상담 완료",
  contacted_at: "2026-08-27T02:00:00.000Z",
  contacted_by: "운영 관리자",
}

function postRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/leads/lead-1/logs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function deleteRequest(logId = "log-1") {
  return new NextRequest(`https://classin.kr/api/admin/leads/lead-1/logs?logId=${logId}`, {
    method: "DELETE",
  })
}

async function callPost(body: unknown) {
  const { POST } = await import("@/app/api/admin/leads/[id]/logs/route")
  return POST(postRequest(body), { params: Promise.resolve({ id: "lead-1" }) })
}

async function callDelete(logId = "log-1") {
  const { DELETE } = await import("@/app/api/admin/leads/[id]/logs/route")
  return DELETE(deleteRequest(logId), { params: Promise.resolve({ id: "lead-1" }) })
}

describe("POST /api/admin/leads/[id]/logs", () => {
  beforeEach(() => {
    requireVerifiedAdminContext.mockResolvedValue({
      source: "supabase",
      role: "ADMIN",
      userId: "admin-1",
      name: "운영 관리자",
    })
    getLeadById.mockResolvedValue(LEAD)
    getContactLogs.mockResolvedValue([LOG])
    addContactLog.mockResolvedValue(LOG)
    updateLead.mockResolvedValue({ ...LEAD, status: "contacted" })
    getOrCreateCrmCustomerEventBySource.mockResolvedValue({
      created: false,
      record: { id: "event-1", nextActions: [] },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it("stores evidence before promoting a new lead and derives the actor from auth", async () => {
    const response = await callPost({ type: "call", result: "answered", notes: "상담 완료" })

    expect(response.status).toBe(200)
    expect(addContactLog).toHaveBeenCalledWith("lead-1", {
      type: "call",
      result: "answered",
      notes: "상담 완료",
      contacted_by: "운영 관리자",
      contacted_at: undefined,
    })
    expect(addContactLog.mock.invocationCallOrder[0]).toBeLessThan(updateLead.mock.invocationCallOrder[0])
    expect(updateLead).toHaveBeenCalledWith(
      "lead-1",
      expect.objectContaining({ status: "contacted", confirmed_at: expect.any(String) })
    )
    await expect(response.json()).resolves.toMatchObject({ statusSync: "updated", log: LOG })
  })

  it("returns the saved log with a warning when only status synchronization fails", async () => {
    updateLead.mockRejectedValueOnce(new Error("status write failed"))

    const response = await callPost({ type: "sms", notes: "문자 발송" })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      log: LOG,
      statusSync: "failed",
      warning: "연락 기록은 저장됐지만 리드 상태를 연락중으로 맞추지 못했습니다.",
    })
  })

  it("does not promote a lead when evidence storage fails", async () => {
    addContactLog.mockRejectedValueOnce(new Error("write failed"))

    const response = await callPost({ type: "call", result: "no_answer" })

    expect(response.status).toBe(500)
    expect(updateLead).not.toHaveBeenCalled()
    expect(getOrCreateCrmCustomerEventBySource).not.toHaveBeenCalled()
  })

  it("rejects timestamps before the lead and more than five minutes in the future", async () => {
    const beforeLead = await callPost({
      type: "call",
      contacted_at: "2026-08-26T20:00:00.000Z",
    })
    expect(beforeLead.status).toBe(400)

    const future = await callPost({
      type: "call",
      contacted_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
    expect(future.status).toBe(400)
    expect(addContactLog).not.toHaveBeenCalled()
  })

  it("creates follow-up tasks only when the mirrored CRM event is newly created", async () => {
    getOrCreateCrmCustomerEventBySource.mockResolvedValueOnce({
      created: true,
      record: { id: "event-1", nextActions: [{ title: "콜백" }] },
    })

    const response = await callPost({ type: "call", result: "callback" })

    expect(response.status).toBe(200)
    expect(createTasksFromEventNextActions).toHaveBeenCalledTimes(1)
    expect(createTasksFromEventNextActions).toHaveBeenCalledWith(
      expect.objectContaining({ id: "event-1" }),
      { createdBy: LOG.contacted_by }
    )
  })

  it("does not delete the only evidence while the lead is contacted", async () => {
    getLeadById.mockResolvedValueOnce({ ...LEAD, status: "contacted" })

    const response = await callDelete()

    expect(response.status).toBe(409)
    expect(deleteContactLog).not.toHaveBeenCalled()
  })

  it("only deletes a log that belongs to the lead in the URL", async () => {
    const response = await callDelete("other-log")

    expect(response.status).toBe(404)
    expect(deleteContactLog).not.toHaveBeenCalled()
  })

  it("allows deleting one of multiple evidence records", async () => {
    getLeadById.mockResolvedValueOnce({ ...LEAD, status: "contacted" })
    getContactLogs.mockResolvedValueOnce([LOG, { ...LOG, id: "log-2" }])
    deleteContactLog.mockResolvedValueOnce(true)

    const response = await callDelete()

    expect(response.status).toBe(200)
    expect(deleteContactLog).toHaveBeenCalledWith("log-1")
  })
})
