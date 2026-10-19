/**
 * POST·DELETE /api/admin/crm/home/today-contacts/outcome — 현황 "오늘 연락" 행 안 결과 기록·미루기·되돌리기.
 * 쓰는 곳은 Home 자기 테이블뿐(crm_customer_events·crm_tasks·lead_contact_logs·leads.follow_up_at) — 저장소 함수를 목으로 세워
 * 순서·멱등·fail-soft 계약을 고정한다.
 *
 * 교차 리뷰 2라운드(2026-09-26) 회귀:
 *  [7]  되돌리기는 이 요청이 만든 1차 기록만(요청 키 · 작성자 = 요청자 · 10분) — 아니면 409, 할 일도 건드리지 않는다.
 *  [9]  리드 되돌리기는 이 저장이 신규 → 연락중으로 바꿨을 때만 신규로(저장 전부터 연락중이던 리드는 그대로).
 *  [12] 리드 결과 멱등은 요청 키(결정 로그 id) — 같은 내용의 다른 저장을 삼키지 않고, 재전송도 팔로업·할 일 닫기를 끝까지.
 *  [18] 계정 결과 재전송은 첫 요청의 closedTaskIds·nextTask 를 그대로 돌려주고, 끊긴 단계는 마저 한다.
 * 3라운드(2026-09-26):
 *  [새 1] 재전송 내용이 저장된 기록과 다르면(실패 뒤 결과·메모·채널을 고침) 요청 본문 쓰기(할 일 닫기·팔로업)를 하지 않고
 *         첫 요청이 닫은 할 일만 되찾아 경고 — 채널을 바꿔도 두 번째 기록을 만들지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const NOW = new Date("2026-09-25T03:00:00.000Z") // 금 12:00 KST
const TOMORROW_9 = "2026-09-26T00:00:00.000Z"
const REQUEST_ID = "2f3c9a4e-8b7d-4c1a-9e2f-123456789abc"
/** 첫 요청 시각(재전송·되돌리기 시나리오) — NOW 보다 1분 전. */
const FIRST_AT = "2026-09-25T02:59:00.000Z"

const m = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  findAdminCrmOwner: vi.fn(),
  listAdminUserDirectoryCached: vi.fn(),
  getOrCreateCrmCustomerEventBySource: vi.fn(),
  deleteCrmCustomerEventsBySource: vi.fn(),
  cancelCrmTask: vi.fn(),
  completeCrmTask: vi.fn(),
  createCrmTask: vi.fn(),
  createTasksFromEventNextActions: vi.fn(),
  getCrmTaskById: vi.fn(),
  getCrmTaskBySourceEventId: vi.fn(),
  reopenCrmTask: vi.fn(),
  findRecentTodayContactTask: vi.fn(),
  getTodayContactLeadLog: vi.fn(),
  invalidateCrmTodayContacts: vi.fn(),
  listActiveTasksForTodayContactTarget: vi.fn(),
  listRecentTodayContactSnoozedTasks: vi.fn(),
  listTodayContactEventsBySource: vi.fn(),
  getLeadById: vi.fn(),
  updateLead: vi.fn(),
  recordLeadContact: vi.fn(),
  deleteLeadContactLogWithMirrors: vi.fn(),
  hasLeadContactEvidence: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["SUPER_ADMIN", "ADMIN", "BRANCH"],
  requireVerifiedAdminContext: m.requireVerifiedAdminContext,
}))
vi.mock("@/lib/repositories/admin-users", () => ({
  findAdminCrmOwner: m.findAdminCrmOwner,
  listAdminUserDirectoryCached: m.listAdminUserDirectoryCached,
}))
vi.mock("@/lib/repositories/crm-events", () => ({
  getOrCreateCrmCustomerEventBySource: m.getOrCreateCrmCustomerEventBySource,
  deleteCrmCustomerEventsBySource: m.deleteCrmCustomerEventsBySource,
}))
vi.mock("@/lib/repositories/crm-tasks", () => ({
  cancelCrmTask: m.cancelCrmTask,
  completeCrmTask: m.completeCrmTask,
  createCrmTask: m.createCrmTask,
  createTasksFromEventNextActions: m.createTasksFromEventNextActions,
  getCrmTaskById: m.getCrmTaskById,
  getCrmTaskBySourceEventId: m.getCrmTaskBySourceEventId,
  reopenCrmTask: m.reopenCrmTask,
  inferTaskTypeFromTitle: (title: string) => (/연장/.test(title) ? "renewal" : "other"),
  isCrmTasksNotReadyError: (error: unknown) => error instanceof Error && error.message.includes("CRM task DB 마이그레이션"),
}))
vi.mock("@/lib/repositories/crm-today-contacts", () => ({
  findRecentTodayContactTask: m.findRecentTodayContactTask,
  getTodayContactLeadLog: m.getTodayContactLeadLog,
  invalidateCrmTodayContacts: m.invalidateCrmTodayContacts,
  listActiveTasksForTodayContactTarget: m.listActiveTasksForTodayContactTarget,
  listRecentTodayContactSnoozedTasks: m.listRecentTodayContactSnoozedTasks,
  listTodayContactEventsBySource: m.listTodayContactEventsBySource,
}))
vi.mock("@/lib/repositories/leads", () => ({ getLeadById: m.getLeadById, updateLead: m.updateLead }))
vi.mock("@/lib/crm/contact-record", () => ({
  recordLeadContact: m.recordLeadContact,
  deleteLeadContactLogWithMirrors: m.deleteLeadContactLogWithMirrors,
  hasLeadContactEvidence: m.hasLeadContactEvidence,
}))

import { todayContactLeadLogId } from "@/lib/crm/account-contact-record"

const LEAD_LOG_ID = todayContactLeadLogId(REQUEST_ID, "L1")

function task(overrides: Record<string, unknown> & { id: string }) {
  return {
    targetType: "neo_account",
    targetId: "N1",
    targetLabel: "가 기관",
    ownerKey: "park",
    ownerNameSnapshot: "박담당",
    taskType: "renewal",
    title: "연장 안내",
    detail: null,
    dueAt: "2026-09-24T01:00:00.000Z",
    snoozedUntil: null,
    priority: "high",
    status: "open",
    sourceEventId: null,
    createdBy: null,
    assignedBy: null,
    completedAt: null,
    completedBy: null,
    outcome: null,
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
    ...overrides,
  }
}

function request(method: "POST" | "DELETE", body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/crm/home/today-contacts/outcome", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

async function post(body: unknown) {
  const { POST } = await import("@/app/api/admin/crm/home/today-contacts/outcome/route")
  return POST(request("POST", body))
}

async function del(body: unknown) {
  const { DELETE } = await import("@/app/api/admin/crm/home/today-contacts/outcome/route")
  return DELETE(request("DELETE", body))
}

const NEO_CONTACT = {
  requestId: REQUEST_ID,
  mode: "contact",
  target: { type: "neo_account", id: "N1", label: "가 기관" },
  channel: "call",
  result: "no_answer",
  memo: "  대표 부재  ",
  next: { preset: "tomorrow_9" },
  nextTitle: "연장 제안 후속",
  closeTaskIds: ["T1", "T2"],
}

/** 첫 요청(NEO_CONTACT)이 저장한 기록 — 재전송 시나리오의 getOrCreate 결과(created=false). */
function storedNeoRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: "E1",
    occurredAt: FIRST_AT,
    createdBy: "김운영",
    targetType: "neo_account",
    targetId: "N1",
    title: "전화 · 부재",
    body: "대표 부재",
    nextActions: [{ title: "연장 제안 후속", ownerName: "김운영", dueAt: TOMORROW_9, done: false }],
    ...overrides,
  }
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
  for (const fn of Object.values(m)) fn.mockReset()
  m.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", name: "김운영", userId: "u1", source: "supabase", capabilities: [] })
  m.listAdminUserDirectoryCached.mockResolvedValue({ crmOwners: [] })
  m.findAdminCrmOwner.mockReturnValue({ owner: { ownerKey: "kim", displayName: "김운영" }, ownerKeys: ["kim", "김운영"] })
  m.getOrCreateCrmCustomerEventBySource.mockImplementation(async (input: Record<string, unknown>) => ({
    record: {
      id: "E1",
      occurredAt: input.occurredAt,
      targetType: input.targetType,
      targetId: input.targetId,
      createdBy: input.createdBy,
      nextActions: input.nextActions,
    },
    created: true,
  }))
  m.createTasksFromEventNextActions.mockResolvedValue([task({ id: "NT1", dueAt: TOMORROW_9, sourceEventId: "E1" })])
  m.getCrmTaskById.mockImplementation(async (id: string) => {
    if (id === "T1") return task({ id: "T1" })
    if (id === "T2") return task({ id: "T2", targetId: "OTHER" })
    return null
  })
  m.completeCrmTask.mockImplementation(async (id: string) => task({ id, status: "done" }))
  m.cancelCrmTask.mockImplementation(async (id: string, options: { outcome?: string }) =>
    task({ id, status: "canceled", outcome: options?.outcome ?? null })
  )
  m.findRecentTodayContactTask.mockResolvedValue(null)
  m.listActiveTasksForTodayContactTarget.mockResolvedValue([])
  m.listRecentTodayContactSnoozedTasks.mockResolvedValue([])
  // 결과 저장 전 같은 요청 키 기록 조회 — 기본은 "아직 없음"(첫 저장). 되돌리기 쪽 기본은 그 describe 의 beforeEach.
  m.listTodayContactEventsBySource.mockResolvedValue([])
  m.createCrmTask.mockImplementation(async (input: Record<string, unknown>) => task({ id: "C1", ...input, status: "open", createdAt: NOW.toISOString() }))
  m.updateLead.mockImplementation(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch }))
})

afterEach(() => {
  vi.useRealTimers()
})

describe("POST outcome — 검증", () => {
  it.each([
    ["requestId 없음", { ...NEO_CONTACT, requestId: "x" }],
    ["채널 없음", { ...NEO_CONTACT, channel: undefined }],
    ["메모 500자 초과", { ...NEO_CONTACT, memo: "가".repeat(501) }],
    ["지난 다음 일정", { ...NEO_CONTACT, next: { dueAt: "2026-09-20T00:00:00.000Z" } }],
    ["할 일 11개", { ...NEO_CONTACT, closeTaskIds: Array.from({ length: 11 }, (_, i) => `T${i}`) }],
    ["미루기에 다음 일정 없음", { ...NEO_CONTACT, mode: "snooze", next: null }],
    ["알 수 없는 대상", { ...NEO_CONTACT, target: { type: "partner", id: "P1", label: "" } }],
  ])("%s → 400", async (_label, body) => {
    const response = await post(body)
    expect(response.status).toBe(400)
    expect(m.getOrCreateCrmCustomerEventBySource).not.toHaveBeenCalled()
  })

  it("인증 실패는 그대로 돌려준다", async () => {
    m.requireVerifiedAdminContext.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }))
    expect((await post(NEO_CONTACT)).status).toBe(403)
  })
})

describe("POST outcome — 계정·고객·딜(crm_customer_events + crm_tasks)", () => {
  it("기록(today-contact:<requestId>) → 다음 일정 할 일 → 대상이 같은 할 일만 닫기 → 캐시 즉시 만료", async () => {
    const response = await post(NEO_CONTACT)
    expect(response.status).toBe(201)
    const body = await response.json()

    expect(m.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "neo_account",
        targetId: "N1",
        targetLabel: "가 기관",
        sourceType: "call",
        sourceId: `today-contact:${REQUEST_ID}`,
        title: "전화 · 부재",
        body: "대표 부재",
        ownerName: "김운영",
        createdBy: "김운영",
        sentiment: "neutral",
        nextActions: [{ title: "연장 제안 후속", ownerName: "김운영", dueAt: TOMORROW_9, done: false }],
      })
    )
    expect(m.createTasksFromEventNextActions).toHaveBeenCalledWith(expect.objectContaining({ id: "E1" }), { createdBy: "김운영" })
    expect(m.completeCrmTask).toHaveBeenCalledTimes(1)
    expect(m.completeCrmTask).toHaveBeenCalledWith("T1", expect.objectContaining({ outcome: "전화 · 부재 → 다음 09-26", completedBy: "김운영" }))
    expect(m.invalidateCrmTodayContacts).toHaveBeenCalledWith("expire")
    expect(body).toMatchObject({
      duplicate: false,
      event: { id: "E1" },
      contactLogId: null,
      nextTask: { id: "NT1", dueAt: TOMORROW_9 },
      followUpAt: null,
      closedTaskIds: ["T1"],
    })
    expect(body.warnings.join(" ")).toContain("대상이 다른 할 일 1건")
  })

  it("[18] 같은 requestId 재전송은 새로 쓰지 않고 첫 요청의 다음 일정·닫은 할 일을 그대로 돌려준다(되돌리기가 T1 을 다시 열 수 있게)", async () => {
    m.getOrCreateCrmCustomerEventBySource.mockResolvedValue({ record: storedNeoRecord(), created: false })
    m.getCrmTaskBySourceEventId.mockResolvedValue(task({ id: "NT1", dueAt: TOMORROW_9 }))
    m.getCrmTaskById.mockImplementation(async (id: string) => {
      // 첫 요청이 같은 시각·같은 사람·같은 결과 문구로 닫은 할 일.
      if (id === "T1") {
        return task({ id: "T1", status: "done", completedAt: FIRST_AT, completedBy: "김운영", outcome: "전화 · 부재 → 다음 09-26" })
      }
      if (id === "T2") return task({ id: "T2", targetId: "OTHER" })
      return null
    })
    const response = await post(NEO_CONTACT)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.duplicate).toBe(true)
    expect(body.nextTask).toEqual({ id: "NT1", dueAt: TOMORROW_9 })
    expect(body.closedTaskIds).toEqual(["T1"])
    expect(m.createTasksFromEventNextActions).not.toHaveBeenCalled()
    expect(m.completeCrmTask).not.toHaveBeenCalled()
  })

  it("[18] 첫 요청이 기록만 남기고 끊겼으면 재전송이 남은 단계(다음 일정·할 일 닫기)를 마저 한다", async () => {
    m.getOrCreateCrmCustomerEventBySource.mockResolvedValue({ record: storedNeoRecord(), created: false })
    m.getCrmTaskBySourceEventId.mockResolvedValue(null)
    const body = await (await post(NEO_CONTACT)).json()
    expect(m.createTasksFromEventNextActions).toHaveBeenCalledWith(expect.objectContaining({ id: "E1" }), { createdBy: "김운영" })
    expect(m.completeCrmTask).toHaveBeenCalledWith("T1", expect.objectContaining({ completedBy: "김운영" }))
    expect(body).toMatchObject({ duplicate: true, nextTask: { id: "NT1", dueAt: TOMORROW_9 }, closedTaskIds: ["T1"] })
  })

  it("[18] 다른 시각·다른 사람이 닫은 할 일은 재전송이 되찾지 않는다", async () => {
    m.getOrCreateCrmCustomerEventBySource.mockResolvedValue({ record: storedNeoRecord({ nextActions: [] }), created: false })
    m.getCrmTaskById.mockImplementation(async (id: string) => {
      if (id === "T1") return task({ id: "T1", status: "done", completedAt: "2026-09-25T01:00:00.000Z", completedBy: "김운영", outcome: "전화 · 부재" })
      if (id === "T2") return task({ id: "T2", status: "done", completedAt: FIRST_AT, completedBy: "박담당", outcome: "전화 · 부재" })
      return null
    })
    const body = await (await post({ ...NEO_CONTACT, next: null, closeTaskIds: ["T1", "T2"] })).json()
    expect(body.closedTaskIds).toEqual([])
  })

  it("[18] 같은 요청 키로 다른 사람이 남긴 기록이면 이어서 처리하지 않는다", async () => {
    m.getOrCreateCrmCustomerEventBySource.mockResolvedValue({
      record: { id: "E1", occurredAt: FIRST_AT, createdBy: "박담당", targetType: "neo_account", targetId: "N1", nextActions: [] },
      created: false,
    })
    const body = await (await post(NEO_CONTACT)).json()
    expect(body).toMatchObject({ duplicate: true, nextTask: null, closedTaskIds: [] })
    expect(m.completeCrmTask).not.toHaveBeenCalled()
    expect(m.createTasksFromEventNextActions).not.toHaveBeenCalled()
  })

  it("[새 1] 실패 뒤 결과를 고쳐 같은 requestId 로 재전송 — 고친 내용으로 할 일을 닫지 않고, 첫 요청이 닫은 할 일만 되찾아 경고", async () => {
    m.getOrCreateCrmCustomerEventBySource.mockResolvedValue({ record: storedNeoRecord(), created: false })
    m.getCrmTaskBySourceEventId.mockResolvedValue(task({ id: "NT1", dueAt: TOMORROW_9 }))
    m.getCrmTaskById.mockImplementation(async (id: string) => {
      // T1 = 첫 요청('전화 · 부재')이 닫은 할 일, T3 = 아직 열린 이 행의 할 일.
      if (id === "T1") {
        return task({ id: "T1", status: "done", completedAt: FIRST_AT, completedBy: "김운영", outcome: "전화 · 부재 → 다음 09-26" })
      }
      if (id === "T3") return task({ id: "T3" })
      return null
    })
    const response = await post({ ...NEO_CONTACT, result: "answered", closeTaskIds: ["T1", "T3"] })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ duplicate: true, nextTask: { id: "NT1", dueAt: TOMORROW_9 }, closedTaskIds: ["T1"] })
    // 고친 내용('연결됨')으로 T3 을 닫지 않는다 — 기록은 '부재'인데 할 일 결과 문구가 '연결됨'인 어긋남 방지.
    expect(m.completeCrmTask).not.toHaveBeenCalled()
    expect(body.warnings.join(" ")).toContain("'전화 · 부재'")
    expect(body.warnings.join(" ")).toContain("고친 내용은 저장하지 않았습니다")
  })

  it("[새 1] 내용이 같은 재전송이 마저 닫는 할 일의 결과 문구는 저장된 기록을 따른다", async () => {
    m.getOrCreateCrmCustomerEventBySource.mockResolvedValue({ record: storedNeoRecord(), created: false })
    m.getCrmTaskBySourceEventId.mockResolvedValue(task({ id: "NT1", dueAt: TOMORROW_9 }))
    const body = await (await post(NEO_CONTACT)).json()
    expect(m.completeCrmTask).toHaveBeenCalledWith("T1", expect.objectContaining({ outcome: "전화 · 부재 → 다음 09-26" }))
    expect(body.warnings.join(" ")).not.toContain("고친 내용")
  })

  it("[새 1] 재전송에서 채널을 바꿔도(전화 → 문자) 두 번째 기록을 만들지 않고 첫 기록(전화)을 가리킨다", async () => {
    m.listTodayContactEventsBySource.mockResolvedValue([
      { id: "E1", sourceType: "call", createdAt: FIRST_AT, occurredAt: FIRST_AT, createdBy: "김운영" },
    ])
    m.getOrCreateCrmCustomerEventBySource.mockResolvedValue({ record: storedNeoRecord(), created: false })
    m.getCrmTaskBySourceEventId.mockResolvedValue(task({ id: "NT1", dueAt: TOMORROW_9 }))
    const body = await (await post({ ...NEO_CONTACT, channel: "sms", result: "answered" })).json()
    expect(m.listTodayContactEventsBySource).toHaveBeenCalledWith(`today-contact:${REQUEST_ID}`, "neo_account", "N1")
    expect(m.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "call" }))
    expect(body.duplicate).toBe(true)
    expect(m.completeCrmTask).not.toHaveBeenCalled()
    expect(body.warnings.join(" ")).toContain("고친 내용은 저장하지 않았습니다")
  })

  it("[새 1] 첫 기록 종류 조회가 실패해도 저장은 막지 않는다(요청 채널로 멱등 저장)", async () => {
    m.listTodayContactEventsBySource.mockRejectedValue(new Error("db down"))
    const response = await post({ ...NEO_CONTACT, channel: "sms" })
    expect(response.status).toBe(201)
    expect(m.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledWith(expect.objectContaining({ sourceType: "sms" }))
  })

  it("[새 1] 같은 요청 키가 다른 고객의 기록을 가리키면 이어서 처리하지 않는다", async () => {
    m.getOrCreateCrmCustomerEventBySource.mockResolvedValue({ record: storedNeoRecord({ targetId: "N9" }), created: false })
    const body = await (await post(NEO_CONTACT)).json()
    expect(body).toMatchObject({ duplicate: true, nextTask: null, closedTaskIds: [] })
    expect(m.completeCrmTask).not.toHaveBeenCalled()
    expect(m.getCrmTaskBySourceEventId).not.toHaveBeenCalled()
    expect(body.warnings.join(" ")).toContain("다른 고객의 기록")
  })

  it("카톡·이메일은 결과를 버린다 — 문자 모드(sms) 기록, 제목에 결과 없음", async () => {
    await post({ ...NEO_CONTACT, channel: "kakao", result: "answered", next: null, closeTaskIds: [] })
    expect(m.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "sms", title: "카카오", nextActions: [] })
    )
    expect(m.createTasksFromEventNextActions).not.toHaveBeenCalled()
  })

  it("1차 증거(기록) 저장 실패만 오류 — 마이그레이션 미적용은 503", async () => {
    m.getOrCreateCrmCustomerEventBySource.mockRejectedValue(new Error("CRM 기록 DB 마이그레이션이 아직 적용되지 않았습니다."))
    expect((await post(NEO_CONTACT)).status).toBe(503)
    m.getOrCreateCrmCustomerEventBySource.mockRejectedValue(new Error("network"))
    expect((await post(NEO_CONTACT)).status).toBe(500)
  })

  it("다음 일정 할 일 실패는 fail-soft — 201 + 경고", async () => {
    m.createTasksFromEventNextActions.mockRejectedValue(new Error("tasks down"))
    const response = await post(NEO_CONTACT)
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.nextTask).toBeNull()
    expect(body.warnings).toContain("연락은 저장됐지만 다음 일정을 만들지 못했습니다.")
  })
})

describe("POST outcome — 미루기(기록 없이 다음 일정만)", () => {
  const SNOOZE = {
    requestId: REQUEST_ID,
    mode: "snooze",
    target: { type: "neo_account", id: "N1", label: "가 기관" },
    next: { preset: "tomorrow_9" },
    nextTitle: "연장 제안 후속",
  }

  it("오늘 할 일이 없으면 저장한 사람 담당의 다음 일정 할 일 하나", async () => {
    const response = await post(SNOOZE)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(m.getOrCreateCrmCustomerEventBySource).not.toHaveBeenCalled()
    expect(m.createCrmTask).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "neo_account",
        targetId: "N1",
        title: "연장 제안 후속",
        taskType: "renewal",
        dueAt: TOMORROW_9,
        ownerKey: "kim",
        ownerNameSnapshot: "김운영",
      })
    )
    expect(body).toMatchObject({ duplicate: false, event: null, nextTask: { id: "C1", dueAt: TOMORROW_9 }, closedTaskIds: [] })
  })

  it("이 고객의 오늘 할 일은 취소 + '미룸 → 다음 MM-DD'로 닫고 이어받는 할 일 하나로 옮긴다(되돌리기로 복원 가능)", async () => {
    m.listActiveTasksForTodayContactTarget.mockResolvedValue([
      task({ id: "T1", title: "연장 안내", sourceEventId: "E0" }),
      task({ id: "T3", title: "재계약 서류", dueAt: "2026-09-25T05:00:00.000Z" }),
      task({ id: "T4", title: "다음 달 점검", dueAt: "2026-10-10T01:00:00.000Z" }),
    ])
    m.getCrmTaskById.mockImplementation(async (id: string) => task({ id, title: id === "T1" ? "연장 안내" : "재계약 서류", sourceEventId: id === "T1" ? "E0" : null }))
    const body = await (await post(SNOOZE)).json()
    // 완료(done)로 닫지 않는다 — 담당별 완료 집계(status=done)가 미룰 때마다 부풀지 않게.
    expect(m.completeCrmTask).not.toHaveBeenCalled()
    expect(m.cancelCrmTask.mock.calls.map((call) => call[0])).toEqual(["T1", "T3"])
    expect(m.cancelCrmTask.mock.calls[0][1]).toMatchObject({ outcome: "미룸 → 다음 09-26", completedBy: "김운영" })
    expect(m.createCrmTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "연장 안내",
        dueAt: TOMORROW_9,
        ownerKey: "park",
        detail: "함께 미룬 할 일: 재계약 서류",
      })
    )
    // 이어받는 할 일은 원천 기록을 물려받지 않는다 — 같은 기록에 할 일 두 건(기록 → 할 일 조회가 닫힌 쪽을 돌려줌) 방지.
    expect(m.createCrmTask.mock.calls[0][0].sourceEventId).toBeNull()
    expect(body.closedTaskIds).toEqual(["T1", "T3"])
    expect(body.nextTask).toEqual({ id: "C1", dueAt: TOMORROW_9 })
  })

  it("명시한 closeTaskIds 도 취소(미룸)로 닫고, 대상이 다른 할 일은 건드리지 않는다", async () => {
    const body = await (await post({ ...SNOOZE, closeTaskIds: ["T1", "T2"] })).json()
    expect(m.completeCrmTask).not.toHaveBeenCalled()
    expect(m.cancelCrmTask).toHaveBeenCalledTimes(1)
    expect(m.cancelCrmTask).toHaveBeenCalledWith("T1", expect.objectContaining({ outcome: "미룸 → 다음 09-26" }))
    expect(body.closedTaskIds).toEqual(["T1"])
    expect(body.warnings.join(" ")).toContain("대상이 다른 할 일 1건")
  })

  it("이어받는 할 일을 만들지 못하면 취소한 할 일을 다시 연다", async () => {
    m.createCrmTask.mockRejectedValue(new Error("insert failed"))
    const response = await post({ ...SNOOZE, closeTaskIds: ["T1"] })
    expect(response.status).toBe(500)
    expect(m.cancelCrmTask).toHaveBeenCalledWith("T1", expect.anything())
    expect(m.reopenCrmTask).toHaveBeenCalledWith("T1")
  })

  it("재전송(같은 기한 할 일이 방금 생김)은 새로 만들지 않는다", async () => {
    m.findRecentTodayContactTask.mockResolvedValue(task({ id: "C0", dueAt: TOMORROW_9 }))
    const body = await (await post(SNOOZE)).json()
    expect(m.createCrmTask).not.toHaveBeenCalled()
    expect(body.nextTask).toEqual({ id: "C0", dueAt: TOMORROW_9 })
  })

  it("[18] 미루기 재전송은 첫 요청이 미룬(취소한) 이 사람의 할 일을 되찾아 closedTaskIds 로 돌려준다", async () => {
    m.findRecentTodayContactTask.mockResolvedValue(task({ id: "C0", dueAt: TOMORROW_9, createdBy: "김운영" }))
    m.listRecentTodayContactSnoozedTasks.mockResolvedValue([task({ id: "T1", status: "canceled", outcome: "미룸 → 다음 09-26" })])
    const body = await (await post(SNOOZE)).json()
    expect(m.listRecentTodayContactSnoozedTasks).toHaveBeenCalledWith("neo_account", "N1", {
      outcome: "미룸 → 다음 09-26",
      completedBy: "김운영",
      sinceIso: "2026-09-25T02:58:00.000Z",
    })
    expect(body).toMatchObject({ nextTask: { id: "C0", dueAt: TOMORROW_9 }, closedTaskIds: ["T1"] })
    expect(m.cancelCrmTask).not.toHaveBeenCalled()
  })
})

describe("POST outcome — Compass 에 없는 Home 리드(recordLeadContact + follow_up_at)", () => {
  const LEAD_CONTACT = {
    requestId: REQUEST_ID,
    mode: "contact",
    target: { type: "lead", id: "L1", label: "가 학원" },
    channel: "call",
    result: "callback",
    next: { preset: "tomorrow_9" },
    closeTaskIds: [],
  }

  beforeEach(() => {
    m.getLeadById.mockResolvedValue({ id: "L1", status: "new", timestamp: "2026-09-24T00:00:00.000Z", follow_up_at: "2026-09-24T00:00:00.000Z" })
    m.recordLeadContact.mockResolvedValue({
      ok: true,
      log: { id: LEAD_LOG_ID, contacted_at: NOW.toISOString(), contacted_by: "김운영" },
      duplicate: false,
      statusSync: "updated",
      event: { id: "ME1", occurredAt: NOW.toISOString() },
      mirror: "created",
      tasksCreated: 1,
    })
  })

  it("리드 연락 경로 + 팔로업 이동 — 이전 팔로업을 돌려줘 되돌리기에 쓰게 한다", async () => {
    const response = await post(LEAD_CONTACT)
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(m.recordLeadContact).toHaveBeenCalledWith(
      expect.objectContaining({
        entry: expect.objectContaining({ type: "call", result: "callback", contacted_by: "김운영" }),
        taskCreatedBy: "김운영",
      })
    )
    expect(m.updateLead).toHaveBeenCalledWith("L1", { follow_up_at: TOMORROW_9 })
    expect(body).toMatchObject({
      duplicate: false,
      contactLogId: LEAD_LOG_ID,
      event: { id: "ME1" },
      followUpAt: TOMORROW_9,
      previousFollowUpAt: "2026-09-24T00:00:00.000Z",
    })
    expect(m.getOrCreateCrmCustomerEventBySource).not.toHaveBeenCalled()
  })

  it("[12] 로그 id 는 요청 키에서 정한다(재전송 = 같은 로그) · 연락 시각 = 저장 시각(연락중 전환 confirmed_at 과 같은 순간)", async () => {
    await post(LEAD_CONTACT)
    const entry = m.recordLeadContact.mock.calls[0][0].entry
    expect(entry.id).toBe(LEAD_LOG_ID)
    expect(entry.contacted_at).toBe(NOW.toISOString())
    // UUID 모양 · 결정적 · 리드마다 다르다.
    expect(LEAD_LOG_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(todayContactLeadLogId(REQUEST_ID, "L1")).toBe(LEAD_LOG_ID)
    expect(todayContactLeadLogId(REQUEST_ID, "L2")).not.toBe(LEAD_LOG_ID)
    expect(todayContactLeadLogId("another-request-id", "L1")).not.toBe(LEAD_LOG_ID)
  })

  it("[12] 재전송(같은 로그)도 팔로업·할 일 닫기를 끝까지 멱등하게 — 첫 요청이 닫은 할 일을 되찾고, 이미 옮긴 팔로업은 '저장 직전'으로 싣지 않는다", async () => {
    // 첫 요청이 이미 팔로업을 내일 09:00 으로 옮겼다.
    m.getLeadById.mockResolvedValue({ id: "L1", status: "contacted", timestamp: "2026-09-24T00:00:00.000Z", follow_up_at: TOMORROW_9 })
    m.recordLeadContact.mockResolvedValue({
      ok: true,
      log: { id: LEAD_LOG_ID, type: "call", result: "callback", notes: null, contacted_at: FIRST_AT, contacted_by: "김운영" },
      duplicate: true,
      statusSync: "unchanged",
      event: { id: "ME1", occurredAt: FIRST_AT },
      mirror: "existing",
      tasksCreated: 0,
    })
    m.getCrmTaskById.mockImplementation(async (id: string) => {
      if (id === "LT1") {
        return task({ id: "LT1", targetType: "lead", targetId: "L1", status: "done", completedAt: FIRST_AT, completedBy: "김운영", outcome: "전화 · 콜백 요청 → 다음 09-26" })
      }
      if (id === "LT2") return task({ id: "LT2", targetType: "lead", targetId: "L1" })
      return null
    })
    const response = await post({ ...LEAD_CONTACT, closeTaskIds: ["LT1", "LT2"] })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({ duplicate: true, contactLogId: LEAD_LOG_ID, followUpAt: TOMORROW_9, closedTaskIds: ["LT1", "LT2"] })
    expect(body).not.toHaveProperty("previousFollowUpAt")
    expect(m.updateLead).not.toHaveBeenCalled()
    // 첫 요청이 못 닫은 LT2 만 지금 닫는다.
    expect(m.completeCrmTask).toHaveBeenCalledTimes(1)
    expect(m.completeCrmTask).toHaveBeenCalledWith("LT2", expect.objectContaining({ outcome: "전화 · 콜백 요청 → 다음 09-26" }))
  })

  it("[12] 같은 요청 키로 다른 사람이 남긴 로그는 이어서 처리하지 않고 지울 로그도 돌려주지 않는다", async () => {
    m.recordLeadContact.mockResolvedValue({
      ok: true,
      log: { id: LEAD_LOG_ID, contacted_at: FIRST_AT, contacted_by: "박담당" },
      duplicate: true,
      statusSync: "unchanged",
      event: null,
      mirror: "existing",
      tasksCreated: 0,
    })
    const body = await (await post(LEAD_CONTACT)).json()
    expect(body).toMatchObject({ duplicate: true, contactLogId: null, closedTaskIds: [] })
    expect(m.updateLead).not.toHaveBeenCalled()
  })

  it("[새 1] 실패 뒤 결과를 고쳐 재전송(저장된 로그 '부재', 요청 '연결됨') — 팔로업·할 일 닫기를 하지 않고 첫 요청이 닫은 할 일만 되찾아 경고", async () => {
    // 첫 요청: '전화 · 부재' + 내일 09:00 — 로그 저장 뒤 팔로업·할 일 닫기까지 했고 응답만 유실됐다.
    m.getLeadById.mockResolvedValue({ id: "L1", status: "contacted", timestamp: "2026-09-24T00:00:00.000Z", follow_up_at: "2026-09-24T00:00:00.000Z" })
    m.recordLeadContact.mockResolvedValue({
      ok: true,
      log: { id: LEAD_LOG_ID, type: "call", result: "no_answer", notes: null, contacted_at: FIRST_AT, contacted_by: "김운영" },
      duplicate: true,
      statusSync: "unchanged",
      event: { id: "ME1", occurredAt: FIRST_AT },
      mirror: "existing",
      tasksCreated: 0,
    })
    m.getCrmTaskById.mockImplementation(async (id: string) => {
      if (id === "LT1") {
        return task({ id: "LT1", targetType: "lead", targetId: "L1", status: "done", completedAt: FIRST_AT, completedBy: "김운영", outcome: "전화 · 부재 → 다음 09-26" })
      }
      if (id === "LT2") return task({ id: "LT2", targetType: "lead", targetId: "L1" })
      return null
    })
    const response = await post({ ...LEAD_CONTACT, result: "answered", next: { preset: "in3_10" }, closeTaskIds: ["LT1", "LT2"] })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body).toMatchObject({
      duplicate: true,
      contactLogId: LEAD_LOG_ID,
      followUpAt: "2026-09-24T00:00:00.000Z",
      closedTaskIds: ["LT1"],
    })
    expect(body).not.toHaveProperty("previousFollowUpAt")
    expect(m.updateLead).not.toHaveBeenCalled()
    expect(m.completeCrmTask).not.toHaveBeenCalled()
    const warning = body.warnings.join(" ")
    expect(warning).toContain("'전화 · 부재'")
    expect(warning).toContain("팔로업 이동·할 일 닫기")
  })

  it("[새 1] 메모만 고친 재전송도 내용이 다르다(저장된 메모와 비교, 앞뒤 공백 무시)", async () => {
    m.recordLeadContact.mockResolvedValue({
      ok: true,
      log: { id: LEAD_LOG_ID, type: "call", result: "callback", notes: "내일 다시", contacted_at: FIRST_AT, contacted_by: "김운영" },
      duplicate: true,
      statusSync: "unchanged",
      event: null,
      mirror: "existing",
      tasksCreated: 0,
    })
    const same = await (await post({ ...LEAD_CONTACT, memo: "  내일 다시 " })).json()
    expect(same.warnings.join(" ")).not.toContain("고친 내용")
    expect(m.updateLead).toHaveBeenCalledWith("L1", { follow_up_at: TOMORROW_9 })

    m.updateLead.mockClear()
    const edited = await (await post({ ...LEAD_CONTACT, memo: "모레 다시" })).json()
    expect(edited.warnings.join(" ")).toContain("고친 내용은 저장하지 않았습니다")
    expect(m.updateLead).not.toHaveBeenCalled()
  })

  it("[새 1] 동시에 들어온 재전송(기본키 충돌 뒤 먼저 저장된 로그를 돌려받음)도 재전송으로 본다 — 연락 시각이 이 요청의 now 가 아니다", async () => {
    m.recordLeadContact.mockResolvedValue({
      ok: true,
      log: { id: LEAD_LOG_ID, type: "call", result: "callback", notes: null, contacted_at: FIRST_AT, contacted_by: "김운영" },
      duplicate: false,
      statusSync: "unchanged",
      event: { id: "ME1", occurredAt: FIRST_AT },
      mirror: "existing",
      tasksCreated: 0,
    })
    const response = await post(LEAD_CONTACT)
    expect(response.status).toBe(200)
    expect((await response.json()).duplicate).toBe(true)
  })

  it("다음 일정 없음 → 팔로업은 그대로 둔다", async () => {
    const body = await (await post({ ...LEAD_CONTACT, next: null })).json()
    expect(m.updateLead).not.toHaveBeenCalled()
    expect(body).not.toHaveProperty("previousFollowUpAt")
  })

  it("리드가 없으면 404", async () => {
    m.getLeadById.mockResolvedValue(null)
    expect((await post(LEAD_CONTACT)).status).toBe(404)
  })

  it("리드 미루기 = follow_up_at 이동(기록 없음)", async () => {
    const body = await (await post({ requestId: REQUEST_ID, mode: "snooze", target: LEAD_CONTACT.target, next: { preset: "tomorrow_9" } })).json()
    expect(m.recordLeadContact).not.toHaveBeenCalled()
    expect(m.updateLead).toHaveBeenCalledWith("L1", { follow_up_at: TOMORROW_9 })
    expect(body).toMatchObject({ followUpAt: TOMORROW_9, previousFollowUpAt: "2026-09-24T00:00:00.000Z", nextTask: null })
  })

  it("[12] 리드 미루기 재전송(이미 내일 09:00) — 다시 쓰지 않고, 옮긴 뒤 값을 '저장 직전'으로 싣지 않는다(되돌리기가 헛돌지 않게)", async () => {
    m.getLeadById.mockResolvedValue({ id: "L1", status: "contacted", timestamp: "2026-09-24T00:00:00.000Z", follow_up_at: TOMORROW_9 })
    const response = await post({ requestId: REQUEST_ID, mode: "snooze", target: LEAD_CONTACT.target, next: { preset: "tomorrow_9" } })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(m.updateLead).not.toHaveBeenCalled()
    expect(body.followUpAt).toBe(TOMORROW_9)
    expect(body).not.toHaveProperty("previousFollowUpAt")
  })

  it("리드 미루기의 오늘 할 일도 완료가 아니라 취소(미룸)로 닫는다", async () => {
    m.getCrmTaskById.mockImplementation(async (id: string) => task({ id, targetType: "lead", targetId: "L1", title: "견적 재안내" }))
    const body = await (
      await post({ requestId: REQUEST_ID, mode: "snooze", target: LEAD_CONTACT.target, next: { preset: "tomorrow_9" }, closeTaskIds: ["LT1"] })
    ).json()
    expect(m.completeCrmTask).not.toHaveBeenCalled()
    expect(m.cancelCrmTask).toHaveBeenCalledWith("LT1", expect.objectContaining({ outcome: "미룸 → 다음 09-26" }))
    expect(m.createCrmTask.mock.calls[0][0]).toMatchObject({ targetType: "lead", targetId: "L1", title: "견적 재안내", sourceEventId: null })
    expect(body.closedTaskIds).toEqual(["LT1"])
  })
})

describe("DELETE outcome — 되돌리기", () => {
  const RECENT = "2026-09-25T02:59:55.000Z"

  beforeEach(() => {
    // 되돌리기의 1차 기록 확인 — 기본은 "이 사람이 방금 만든 기록 1건".
    m.listTodayContactEventsBySource.mockResolvedValue([
      { id: "E1", sourceType: "call", createdAt: RECENT, occurredAt: RECENT, createdBy: "김운영" },
    ])
  })

  it("계정: 이 요청의 기록만 지우고, 방금 만든 다음 일정은 취소, 방금 닫은 할 일은 재개", async () => {
    m.getCrmTaskById.mockImplementation(async (id: string) => {
      if (id === "NT1") return task({ id: "NT1", createdAt: RECENT, createdBy: "김운영", dueAt: TOMORROW_9 })
      if (id === "T1") return task({ id: "T1", status: "done", completedAt: RECENT, completedBy: "김운영" })
      if (id === "OLD") return task({ id: "OLD", status: "done", completedAt: "2026-09-24T00:00:00.000Z", completedBy: "김운영" })
      return null
    })
    m.getCrmTaskBySourceEventId.mockResolvedValue(task({ id: "NT1", createdAt: RECENT, createdBy: "김운영" }))
    m.deleteCrmCustomerEventsBySource.mockResolvedValue(1)
    const response = await del({
      requestId: REQUEST_ID,
      target: { type: "neo_account", id: "N1" },
      eventId: "E1",
      contactLogId: null,
      nextTaskId: "NT1",
      closedTaskIds: ["T1", "OLD"],
    })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.ok).toBe(true)
    // 지우기 전에 이 요청의 기록(작성자·나이)을 확인한다.
    expect(m.listTodayContactEventsBySource).toHaveBeenCalledWith(`today-contact:${REQUEST_ID}`, "neo_account", "N1")
    // 기록 파생 할 일은 기록을 지우기 전에 찾아 취소한다(ON DELETE SET NULL 로 연결이 끊기기 전).
    expect(m.cancelCrmTask).toHaveBeenCalledTimes(1)
    expect(m.cancelCrmTask).toHaveBeenCalledWith("NT1", expect.objectContaining({ outcome: "되돌리기" }))
    expect(m.reopenCrmTask).toHaveBeenCalledWith("T1")
    expect(m.reopenCrmTask).not.toHaveBeenCalledWith("OLD")
    expect(body.warnings.join(" ")).toContain("이 저장이 닫은 할 일이 아니어서")
    expect(m.deleteCrmCustomerEventsBySource).toHaveBeenCalledWith({
      sourceTypes: ["call", "sms"],
      sourceId: `today-contact:${REQUEST_ID}`,
      targetType: "neo_account",
      targetId: "N1",
    })
    expect(m.invalidateCrmTodayContacts).toHaveBeenCalledWith("expire")
  })

  it("[7] 10분 넘은 기록은 요청 키를 알아도 지우지 않는다 — 409, 할 일도 건드리지 않는다(부분 되돌리기 방지)", async () => {
    m.listTodayContactEventsBySource.mockResolvedValue([
      { id: "E1", createdAt: "2026-09-20T02:00:00.000Z", occurredAt: "2026-09-20T02:00:00.000Z", createdBy: "김운영" },
    ])
    const response = await del({
      requestId: REQUEST_ID,
      target: { type: "neo_account", id: "N1" },
      eventId: "E1",
      nextTaskId: "NT1",
      closedTaskIds: ["T1"],
    })
    expect(response.status).toBe(409)
    expect((await response.json()).error).toContain("10분")
    expect(m.deleteCrmCustomerEventsBySource).not.toHaveBeenCalled()
    expect(m.cancelCrmTask).not.toHaveBeenCalled()
    expect(m.reopenCrmTask).not.toHaveBeenCalled()
  })

  it("[7] 다른 사람이 남긴 기록은 지우지 않는다 — 409", async () => {
    m.listTodayContactEventsBySource.mockResolvedValue([{ id: "E1", createdAt: RECENT, occurredAt: RECENT, createdBy: "박담당" }])
    const response = await del({ requestId: REQUEST_ID, target: { type: "neo_account", id: "N1" }, eventId: "E1" })
    expect(response.status).toBe(409)
    expect(m.deleteCrmCustomerEventsBySource).not.toHaveBeenCalled()
  })

  it("[7] 기록 확인이 실패하면 지우지 않고 다시 시도하게 한다(ok=false)", async () => {
    m.listTodayContactEventsBySource.mockRejectedValue(new Error("db down"))
    const body = await (await del({ requestId: REQUEST_ID, target: { type: "neo_account", id: "N1" }, eventId: "E1" })).json()
    expect(body.ok).toBe(false)
    expect(m.deleteCrmCustomerEventsBySource).not.toHaveBeenCalled()
  })

  it("[7] 남이 만든 다음 일정 할 일·남이 닫은 할 일은 id 를 알아도 건드리지 않는다", async () => {
    m.getCrmTaskById.mockImplementation(async (id: string) => {
      if (id === "NT9") return task({ id: "NT9", createdAt: RECENT, createdBy: "박담당" })
      if (id === "T9") return task({ id: "T9", status: "done", completedAt: RECENT, completedBy: "박담당" })
      return null
    })
    const body = await (
      await del({ requestId: REQUEST_ID, target: { type: "neo_account", id: "N1" }, nextTaskId: "NT9", closedTaskIds: ["T9"] })
    ).json()
    expect(m.cancelCrmTask).not.toHaveBeenCalled()
    expect(m.reopenCrmTask).not.toHaveBeenCalled()
    expect(body.warnings.length).toBeGreaterThan(0)
  })

  it("계정 미루기 되돌리기: 이어받은 할 일은 '되돌리기'로 취소, 미룸으로 취소한 할 일은 재개(기한은 그대로라 원상태)", async () => {
    // 미루기는 기록을 남기지 않는다 — 지울 기록 없음.
    m.listTodayContactEventsBySource.mockResolvedValue([])
    m.getCrmTaskById.mockImplementation(async (id: string) => {
      if (id === "C1") return task({ id: "C1", createdAt: "2026-09-25T02:59:58.000Z", createdBy: "김운영", dueAt: TOMORROW_9 })
      if (id === "T1") {
        return task({ id: "T1", status: "canceled", outcome: "미룸 → 다음 09-26", completedAt: "2026-09-25T02:59:58.000Z", completedBy: "김운영" })
      }
      return null
    })
    const body = await (
      await del({
        requestId: REQUEST_ID,
        target: { type: "neo_account", id: "N1" },
        eventId: null,
        contactLogId: null,
        nextTaskId: "C1",
        closedTaskIds: ["T1"],
      })
    ).json()
    expect(body).toEqual({ ok: true, warnings: [] })
    expect(m.cancelCrmTask).toHaveBeenCalledWith("C1", expect.objectContaining({ outcome: "되돌리기" }))
    expect(m.reopenCrmTask).toHaveBeenCalledWith("T1")
    expect(m.deleteCrmCustomerEventsBySource).not.toHaveBeenCalled()
  })

  it("[9] 리드: 이 저장이 신규 → 연락중으로 바꿨으면(confirmed_at = 로그 시각) 증거가 사라질 때 신규로 · 팔로업 복원(null 이면 비움)", async () => {
    m.getTodayContactLeadLog.mockResolvedValue({ id: LEAD_LOG_ID, contactedAt: "2026-09-25T02:59:50.000Z", contactedBy: "김운영" })
    m.deleteLeadContactLogWithMirrors.mockResolvedValue({ deleted: true, mirrorsRemoved: 1 })
    m.getLeadById.mockResolvedValue({ id: "L1", status: "contacted", confirmed_at: "2026-09-25T02:59:50+00:00" })
    m.hasLeadContactEvidence.mockResolvedValue(false)
    const body = await (
      await del({
        requestId: REQUEST_ID,
        target: { type: "lead", id: "L1" },
        eventId: "ME1",
        contactLogId: LEAD_LOG_ID,
        nextTaskId: null,
        closedTaskIds: [],
        previousFollowUpAt: null,
      })
    ).json()
    expect(body).toEqual({ ok: true, warnings: [] })
    expect(m.deleteLeadContactLogWithMirrors).toHaveBeenCalledWith("L1", LEAD_LOG_ID)
    expect(m.updateLead).toHaveBeenCalledWith("L1", { status: "new" })
    expect(m.updateLead).toHaveBeenCalledWith("L1", { follow_up_at: null })
    expect(m.deleteCrmCustomerEventsBySource).not.toHaveBeenCalled()
  })

  it("[9] 저장 전부터 연락중이던 리드(Compass 동기화·예전 수동 전환)는 되돌려도 신규로 바꾸지 않는다", async () => {
    m.getTodayContactLeadLog.mockResolvedValue({ id: LEAD_LOG_ID, contactedAt: "2026-09-25T02:59:50.000Z", contactedBy: "김운영" })
    m.deleteLeadContactLogWithMirrors.mockResolvedValue({ deleted: true, mirrorsRemoved: 1 })
    m.getLeadById.mockResolvedValue({ id: "L1", status: "contacted", confirmed_at: "2026-09-10T00:00:00.000Z" })
    m.hasLeadContactEvidence.mockResolvedValue(false)
    const body = await (await del({ requestId: REQUEST_ID, target: { type: "lead", id: "L1" }, contactLogId: LEAD_LOG_ID })).json()
    expect(body).toEqual({ ok: true, warnings: [] })
    expect(m.deleteLeadContactLogWithMirrors).toHaveBeenCalledWith("L1", LEAD_LOG_ID)
    expect(m.updateLead).not.toHaveBeenCalled()
    expect(m.hasLeadContactEvidence).not.toHaveBeenCalled()
  })

  it("[7·12] 리드: 요청 키로 정한 로그가 아닌 id(리드 보드 로그 등)는 지우지 않는다 — 409", async () => {
    const response = await del({ requestId: REQUEST_ID, target: { type: "lead", id: "L1" }, contactLogId: "board-log-id" })
    expect(response.status).toBe(409)
    expect(m.getTodayContactLeadLog).not.toHaveBeenCalled()
    expect(m.deleteLeadContactLogWithMirrors).not.toHaveBeenCalled()
  })

  it("[7] 리드: 다른 사람이 남긴 로그 · 10분 넘은 로그는 지우지 않는다 — 409", async () => {
    m.getTodayContactLeadLog.mockResolvedValue({ id: LEAD_LOG_ID, contactedAt: "2026-09-25T02:59:50.000Z", contactedBy: "박담당" })
    expect((await del({ requestId: REQUEST_ID, target: { type: "lead", id: "L1" }, contactLogId: LEAD_LOG_ID })).status).toBe(409)
    m.getTodayContactLeadLog.mockResolvedValue({ id: LEAD_LOG_ID, contactedAt: "2026-09-25T02:30:00.000Z", contactedBy: "김운영" })
    expect((await del({ requestId: REQUEST_ID, target: { type: "lead", id: "L1" }, contactLogId: LEAD_LOG_ID })).status).toBe(409)
    expect(m.deleteLeadContactLogWithMirrors).not.toHaveBeenCalled()
    expect(m.updateLead).not.toHaveBeenCalled()
  })

  it("previousFollowUpAt 키가 없으면 팔로업을 건드리지 않는다 · 로그 삭제 실패는 ok=false", async () => {
    m.getTodayContactLeadLog.mockResolvedValue({ id: LEAD_LOG_ID, contactedAt: "2026-09-25T02:59:50.000Z", contactedBy: "김운영" })
    m.deleteLeadContactLogWithMirrors.mockResolvedValue({ deleted: false, reason: "mirror_cleanup_failed" })
    const body = await (
      await del({ requestId: REQUEST_ID, target: { type: "lead", id: "L1" }, contactLogId: LEAD_LOG_ID })
    ).json()
    expect(body.ok).toBe(false)
    expect(m.updateLead).not.toHaveBeenCalled()
  })

  it("잘못된 본문은 400", async () => {
    expect((await del({ requestId: "bad", target: { type: "lead", id: "L1" } })).status).toBe(400)
    expect((await del({ requestId: REQUEST_ID, target: { type: "lead", id: "L1" }, previousFollowUpAt: "언젠가" })).status).toBe(400)
  })
})
