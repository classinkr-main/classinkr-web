/**
 * POST /api/admin/crm/events — 기록 컴포저의 리드 대상 콜·문자가 연락 로그 경로를 지나는지(CT1).
 *
 * 이전엔 컴포저 콜·문자가 crm_customer_events에만 남아 리드 드로어·연락중 전환·우선순위 큐가 몰랐다.
 * 이제 "로그 저장 → 연락중 전환 → 로그 id로 묶인 기록 미러 1건"으로 저장되고, 일반 기록 저장
 * (createCrmCustomerEvent)은 부르지 않는다 — 이벤트 POST → 로그 → 다시 이벤트로 중복·루프가 없다.
 * 저장소는 목, 조립(lib/crm/contact-record.ts·lead-contact-event.ts·contact-log.ts)은 실제 모듈이다.
 */
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  requireVerifiedAdminContext: vi.fn(),
  addContactLog: vi.fn(),
  findDuplicateContactLog: vi.fn(),
  getLeadById: vi.fn(),
  updateLead: vi.fn(),
  createCrmCustomerEvent: vi.fn(),
  getOrCreateCrmCustomerEventBySource: vi.fn(),
  createTasksFromEventNextActions: vi.fn(),
  uploadCrmRecording: vi.fn(),
}))

vi.mock("@/lib/admin-auth", () => ({
  CRM_STAFF_ADMIN_API_ROLES: ["crm-staff"],
  requireVerifiedAdminContext: mocks.requireVerifiedAdminContext,
}))
vi.mock("@/lib/repositories/contact-logs", () => ({
  addContactLog: mocks.addContactLog,
  findDuplicateContactLog: mocks.findDuplicateContactLog,
  deleteContactLog: vi.fn(),
  hasContactLog: vi.fn(),
}))
vi.mock("@/lib/repositories/leads", () => ({ getLeadById: mocks.getLeadById, updateLead: mocks.updateLead }))
vi.mock("@/lib/repositories/crm-events", async () => {
  const actual = await vi.importActual<typeof import("@/lib/repositories/crm-events")>("@/lib/repositories/crm-events")
  return {
    ...actual,
    createCrmCustomerEvent: mocks.createCrmCustomerEvent,
    getOrCreateCrmCustomerEventBySource: mocks.getOrCreateCrmCustomerEventBySource,
  }
})
vi.mock("@/lib/repositories/crm-tasks", () => ({
  createTasksFromEventNextActions: mocks.createTasksFromEventNextActions,
}))
vi.mock("@/lib/storage/crm-recordings", () => ({
  uploadCrmRecording: mocks.uploadCrmRecording,
  createCrmRecordingSignedUrls: vi.fn().mockResolvedValue(new Map()),
}))

import { POST } from "@/app/api/admin/crm/events/route"

const LEAD = {
  id: "lead-1",
  source: "contact_page",
  status: "new",
  timestamp: "2026-09-20T00:00:00.000Z",
  org: "클래스인 학원",
  name: "홍길동",
}

function recentIso(minutesAgo = 1) {
  return new Date(Date.now() - minutesAgo * 60_000).toISOString()
}

function jsonRequest(body: unknown) {
  return new NextRequest("https://classin.kr/api/admin/crm/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

function formRequest(fields: Record<string, string>) {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) formData.append(key, value)
  return new NextRequest("https://classin.kr/api/admin/crm/events", { method: "POST", body: formData })
}

beforeEach(() => {
  mocks.requireVerifiedAdminContext.mockResolvedValue({ role: "ADMIN", userId: "admin-1", name: "운영 관리자" })
  mocks.getLeadById.mockResolvedValue(LEAD)
  mocks.findDuplicateContactLog.mockResolvedValue(null)
  mocks.addContactLog.mockImplementation(async (leadId: string, entry: Record<string, unknown>) => ({
    id: "log-9",
    lead_id: leadId,
    type: entry.type,
    result: entry.result ?? null,
    notes: entry.notes ?? null,
    contacted_at: entry.contacted_at ?? new Date().toISOString(),
    contacted_by: entry.contacted_by ?? null,
  }))
  mocks.updateLead.mockResolvedValue({ ...LEAD, status: "contacted" })
  mocks.getOrCreateCrmCustomerEventBySource.mockImplementation(async (input: Record<string, unknown>) => ({
    created: true,
    record: { id: "event-9", ...input, nextActions: input.nextActions ?? [] },
  }))
  mocks.createCrmCustomerEvent.mockImplementation(async (input: Record<string, unknown>) => ({
    id: "event-plain",
    ...input,
    nextActions: input.nextActions ?? [],
  }))
  mocks.createTasksFromEventNextActions.mockResolvedValue([])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("POST /api/admin/crm/events — 리드 대상 콜·문자 = 연락 로그 경로", () => {
  it("컴포저(multipart) 콜을 연락 로그 1건 + 로그 id로 묶인 call 기록 1건으로 저장하고 신규 리드를 연락중으로 바꾼다", async () => {
    const occurredAt = recentIso(2)
    const response = await POST(
      formRequest({
        sourceType: "call",
        targetType: "lead",
        targetId: "lead-1",
        targetLabel: "클래스인 학원",
        occurredAt,
        body: "도입 일정 통화",
        sentiment: "neutral",
      })
    )
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(mocks.addContactLog).toHaveBeenCalledTimes(1)
    expect(mocks.addContactLog).toHaveBeenCalledWith("lead-1", {
      type: "call",
      result: undefined,
      notes: "도입 일정 통화",
      contacted_by: "운영 관리자",
      contacted_at: occurredAt,
    })
    expect(mocks.updateLead).toHaveBeenCalledWith("lead-1", expect.objectContaining({ status: "contacted" }))
    // 루프·이중 기록 없음: 미러는 getOrCreate(원천 = 로그 id) 한 번, 일반 기록 저장은 0번.
    expect(mocks.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledTimes(1)
    expect(mocks.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: "lead",
        targetId: "lead-1",
        sourceType: "call",
        sourceId: "log-9",
        occurredAt,
        body: "도입 일정 통화",
      })
    )
    expect(mocks.createCrmCustomerEvent).not.toHaveBeenCalled()
    expect(json).toMatchObject({
      event: { id: "event-9" },
      contact: { recorded: true, logId: "log-9", channel: "call", statusSync: "updated", mirror: "created" },
    })
    expect(json).not.toHaveProperty("taskQueueWarning")
  })

  it("연락 경로에서도 다음 액션 → 할 일 승격 실패는 일반 기록과 같은 taskQueueWarning 으로 알린다(조용히 삼키지 않음)", async () => {
    mocks.createTasksFromEventNextActions.mockRejectedValueOnce(new Error("tasks down"))
    vi.spyOn(console, "error").mockImplementationOnce(() => {})

    const response = await POST(
      jsonRequest({ sourceType: "call", targetType: "lead", targetId: "lead-1", contactResult: "callback" })
    )
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.contact).toMatchObject({ recorded: true, logId: "log-9" })
    expect(json.tasksCreated).toBe(0)
    expect(json.taskQueueWarning).toBe(
      "기록은 저장됐지만 다음 액션을 할 일에 추가하지 못했습니다. 전체 로그에서 다음 액션을 확인해 주세요."
    )
    // 연락은 한 번만 저장된다 — 경고 때문에 일반 기록을 따로 만들지 않는다.
    expect(mocks.addContactLog).toHaveBeenCalledTimes(1)
    expect(mocks.createCrmCustomerEvent).not.toHaveBeenCalled()
  })

  it("연락중 전환이 실패하면 201 + warning 으로 알린다 — 기록 입력 폼(activitySaveWarnings)이 이 칸을 role=alert 로 보인다", async () => {
    mocks.updateLead.mockRejectedValueOnce(new Error("status down"))
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    const response = await POST(jsonRequest({ sourceType: "call", targetType: "lead", targetId: "lead-1", body: "통화" }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(json.contact).toMatchObject({ recorded: true, statusSync: "failed", mirror: "created" })
    expect(json.warning).toBe("연락 기록은 저장됐지만 리드 상태를 연락중으로 맞추지 못했습니다.")
    expect(json).not.toHaveProperty("taskQueueWarning")
    consoleError.mockRestore()
  })

  it("녹음 첨부 콜의 연락 시각이 미래면 업로드 전에 400 — 녹음 파일이 스토리지에 고아로 남지 않는다", async () => {
    const formData = new FormData()
    formData.append("sourceType", "call")
    formData.append("targetType", "lead")
    formData.append("targetId", "lead-1")
    formData.append("occurredAt", new Date(Date.now() + 24 * 60 * 60_000).toISOString())
    formData.append("body", "내일 통화 예정을 잘못 적음")
    formData.append("recording", new File(["x"], "call.mp3", { type: "audio/mpeg" }))
    const response = await POST(
      new NextRequest("https://classin.kr/api/admin/crm/events", { method: "POST", body: formData })
    )

    expect(response.status).toBe(400)
    expect(mocks.uploadCrmRecording).not.toHaveBeenCalled()
    expect(mocks.addContactLog).not.toHaveBeenCalled()
  })

  it("JSON 문자 모드 + contactChannel=kakao는 카카오 로그로 남고 결과는 떨어뜨린다(카톡은 통화 결과가 없다)", async () => {
    const response = await POST(
      jsonRequest({
        sourceType: "sms",
        targetType: "lead",
        targetId: "lead-1",
        body: "자료 보냄",
        contactChannel: "kakao",
        contactResult: "answered",
      })
    )

    expect(response.status).toBe(201)
    expect(mocks.addContactLog).toHaveBeenCalledWith(
      "lead-1",
      expect.objectContaining({ type: "kakao", result: undefined, notes: "자료 보냄" })
    )
    expect(mocks.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "sms", sourceId: "log-9" })
    )
    expect(mocks.createCrmCustomerEvent).not.toHaveBeenCalled()
  })

  it("통화 결과만 고른 콜(본문 없음)도 연락으로 저장한다 — 콜백 결과는 다음 액션 할 일을 한 번 만든다", async () => {
    mocks.createTasksFromEventNextActions.mockResolvedValueOnce([{ id: "task-1" }])

    const response = await POST(
      jsonRequest({ sourceType: "call", targetType: "lead", targetId: "lead-1", contactResult: "callback" })
    )
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(mocks.addContactLog).toHaveBeenCalledWith("lead-1", expect.objectContaining({ type: "call", result: "callback" }))
    expect(mocks.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledWith(
      expect.objectContaining({ title: "전화 · 콜백 요청", nextActions: [expect.objectContaining({ title: "콜백 약속 이행" })] })
    )
    expect(mocks.createTasksFromEventNextActions).toHaveBeenCalledTimes(1)
    expect(mocks.createTasksFromEventNextActions).toHaveBeenCalledWith(expect.objectContaining({ id: "event-9" }), {
      createdBy: "운영 관리자",
    })
    expect(json.tasksCreated).toBe(1)
  })

  it("미래 시각의 연락은 400 — 로그·기록 모두 저장하지 않는다", async () => {
    const response = await POST(
      jsonRequest({
        sourceType: "call",
        targetType: "lead",
        targetId: "lead-1",
        body: "통화",
        occurredAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      })
    )

    expect(response.status).toBe(400)
    expect(mocks.addContactLog).not.toHaveBeenCalled()
    expect(mocks.getOrCreateCrmCustomerEventBySource).not.toHaveBeenCalled()
    expect(mocks.createCrmCustomerEvent).not.toHaveBeenCalled()
  })

  it("리드를 못 찾으면 이전처럼 기록만 남긴다(로그 없음)", async () => {
    mocks.getLeadById.mockResolvedValueOnce(null)

    const response = await POST(jsonRequest({ sourceType: "call", targetType: "lead", targetId: "lead-x", body: "통화" }))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(mocks.addContactLog).not.toHaveBeenCalled()
    expect(mocks.createCrmCustomerEvent).toHaveBeenCalledTimes(1)
    expect(json.contact).toEqual({ recorded: false, reason: "lead_not_found" })
  })

  it("리드 대상 메모·회의록, 리드가 아닌 대상의 콜은 기존 기록 저장 그대로다", async () => {
    await POST(jsonRequest({ sourceType: "manual_note", targetType: "lead", targetId: "lead-1", body: "메모" }))
    await POST(jsonRequest({ sourceType: "meeting_minutes", targetType: "lead", targetId: "lead-1", body: "회의" }))
    await POST(jsonRequest({ sourceType: "call", targetType: "neo_account", targetId: "neo-1", body: "통화" }))

    expect(mocks.addContactLog).not.toHaveBeenCalled()
    expect(mocks.getOrCreateCrmCustomerEventBySource).not.toHaveBeenCalled()
    expect(mocks.createCrmCustomerEvent).toHaveBeenCalledTimes(3)
  })

  it("본문도 결과도 없는 콜은 여전히 400", async () => {
    const response = await POST(jsonRequest({ sourceType: "call", targetType: "lead", targetId: "lead-1" }))
    expect(response.status).toBe(400)
    expect(mocks.addContactLog).not.toHaveBeenCalled()
  })
})

// 병합 검토 후속(37c02226 지적 6) — 10월 f989a812 의 findRecentDuplicateEvent 규칙("같은 메모라도 다음 액션이 다르면
// 별개 기록")이 컴포저 리드 콜·문자(recordLeadContact) 경로에서도 지켜지는지. 로그 중복 판정(findDuplicateContactLog)은
// 채널·결과·메모·담당자·시각만 보므로, 같은 분·같은 메모로 다음 액션만 바꿔 연속 입력하면 두 번째 다음 액션·할 일이 사라졌다.
describe("POST /api/admin/crm/events — 컴포저 리드 연락의 중복 판정은 다음 액션까지 본다", () => {
  const OCCURRED_AT = "2026-10-19T01:00:00.000Z"
  const EXISTING_LOG = {
    id: "log-1",
    lead_id: "lead-1",
    type: "call",
    result: null,
    notes: "부재",
    contacted_at: OCCURRED_AT,
    contacted_by: "운영 관리자",
  }
  const CONTACTED_LEAD = { ...LEAD, status: "contacted" }

  function existingMirror(nextActions: Array<Record<string, unknown>>) {
    mocks.getOrCreateCrmCustomerEventBySource.mockImplementation(async (input: Record<string, unknown>) =>
      input.sourceId === "log-1"
        ? { created: false, record: { id: "event-1", sourceType: "call", sourceId: "log-1", nextActions } }
        : { created: true, record: { id: "event-9", ...input, nextActions: input.nextActions ?? [] } }
    )
  }

  function composerCall(nextActionTitle: string, nextActionDueAt?: string) {
    return formRequest({
      sourceType: "call",
      targetType: "lead",
      targetId: "lead-1",
      occurredAt: OCCURRED_AT,
      body: "부재",
      nextActionTitle,
      ...(nextActionDueAt ? { nextActionDueAt } : {}),
      sentiment: "neutral",
    })
  }

  beforeEach(() => {
    vi.useFakeTimers({ now: new Date("2026-10-19T01:00:30.000Z"), toFake: ["Date"] })
    mocks.getLeadById.mockResolvedValue(CONTACTED_LEAD)
    mocks.findDuplicateContactLog.mockResolvedValue(EXISTING_LOG)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("같은 분·같은 메모라도 다음 액션이 다르면 새 로그·새 미러(created)·새 할 일로 저장한다", async () => {
    existingMirror([{ title: "견적 발송", ownerName: null, dueAt: null, done: false }])
    mocks.createTasksFromEventNextActions.mockResolvedValueOnce([{ id: "task-9" }])

    const response = await POST(composerCall("설치 일정 확인"))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(mocks.addContactLog).toHaveBeenCalledTimes(1)
    expect(mocks.addContactLog).toHaveBeenCalledWith("lead-1", expect.objectContaining({ type: "call", notes: "부재", contacted_at: OCCURRED_AT }))
    expect(mocks.getOrCreateCrmCustomerEventBySource).toHaveBeenLastCalledWith(
      expect.objectContaining({ sourceId: "log-9", nextActions: [expect.objectContaining({ title: "설치 일정 확인" })] })
    )
    expect(mocks.createTasksFromEventNextActions).toHaveBeenCalledTimes(1)
    expect(mocks.createTasksFromEventNextActions).toHaveBeenCalledWith(expect.objectContaining({ id: "event-9" }), {
      createdBy: "운영 관리자",
    })
    expect(json).toMatchObject({
      event: { id: "event-9" },
      tasksCreated: 1,
      contact: { recorded: true, logId: "log-9", duplicate: false, mirror: "created" },
    })
  })

  it("다음 액션까지 같으면(재전송) 새로 쓰지 않고 미러도 한 번만 찾는다 — 예정일 표기 차이는 같은 값", async () => {
    existingMirror([{ title: "견적 발송", ownerName: null, dueAt: "2026-10-20T05:00:00Z", done: false }])

    const response = await POST(composerCall("견적 발송", "2026-10-20T05:00:00.000Z"))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(mocks.addContactLog).not.toHaveBeenCalled()
    expect(mocks.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledTimes(1)
    expect(mocks.createTasksFromEventNextActions).not.toHaveBeenCalled()
    expect(json).toMatchObject({
      event: { id: "event-1" },
      tasksCreated: 0,
      contact: { recorded: true, logId: "log-1", duplicate: true, mirror: "existing" },
    })
  })

  it("미러 조회가 실패해 판정할 수 없으면 로그 중복 판정을 따른다(같은 연락을 두 번 쌓지 않는다) — 실패는 경고로 싣는다", async () => {
    mocks.getOrCreateCrmCustomerEventBySource.mockRejectedValue(new Error("events down"))
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    const response = await POST(composerCall("설치 일정 확인"))
    const json = await response.json()

    expect(response.status).toBe(201)
    expect(mocks.addContactLog).not.toHaveBeenCalled()
    expect(json.contact).toMatchObject({ logId: "log-1", duplicate: true, mirror: "failed" })
    expect(json.warning).toBe("연락 기록은 저장됐지만 CRM 기록 타임라인에 올리지 못했습니다.")
    consoleError.mockRestore()
  })
})
