/**
 * lib/crm/contact-record.ts — 리드 연락 기록의 단일 쓰기 경로(2026-09-25 W2: CT1·CT3).
 *
 * "로그 저장 → (신규면) 연락중 전환 → 로그 id로 묶인 CRM 기록 미러 1건 → 새 미러의 다음 액션만 할 일"을
 * 저장소 목으로 고정한다. 순수 헬퍼(채널 판정·시각 검증·컴포저 미러 병합)도 여기서 함께 본다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  addContactLog: vi.fn(),
  deleteContactLog: vi.fn(),
  findDuplicateContactLog: vi.fn(),
  hasContactLog: vi.fn(),
  getOrCreateCrmCustomerEventBySource: vi.fn(),
  deleteCrmCustomerEventsBySource: vi.fn(),
  hasLeadContactEvent: vi.fn(),
  createCrmCustomerEvent: vi.fn(),
  createTasksFromEventNextActions: vi.fn(),
  updateLead: vi.fn(),
}))

vi.mock("@/lib/repositories/contact-logs", () => ({
  addContactLog: mocks.addContactLog,
  deleteContactLog: mocks.deleteContactLog,
  findDuplicateContactLog: mocks.findDuplicateContactLog,
  hasContactLog: mocks.hasContactLog,
}))
vi.mock("@/lib/repositories/crm-events", () => ({
  getOrCreateCrmCustomerEventBySource: mocks.getOrCreateCrmCustomerEventBySource,
  deleteCrmCustomerEventsBySource: mocks.deleteCrmCustomerEventsBySource,
  hasLeadContactEvent: mocks.hasLeadContactEvent,
  createCrmCustomerEvent: mocks.createCrmCustomerEvent,
  LEAD_CONTACT_MIRROR_SOURCE_TYPES: ["lead_contact_log", "call", "sms"],
}))
vi.mock("@/lib/repositories/crm-tasks", () => ({
  createTasksFromEventNextActions: mocks.createTasksFromEventNextActions,
}))
vi.mock("@/lib/repositories/leads", () => ({ updateLead: mocks.updateLead }))

import {
  deleteLeadContactLogWithMirrors,
  hasLeadContactEvidence,
  leadContactTimeError,
  recordLeadContact,
} from "@/lib/crm/contact-record"
import { resolveComposerContactChannel } from "@/lib/crm/contact-log"
import { buildLeadContactMirrorInput } from "@/lib/crm/lead-contact-event"
import type { ContactLogRecord } from "@/lib/repositories/contact-logs"

const NOW = new Date("2026-09-25T03:00:00.000Z")
const LEAD = {
  id: "lead-1",
  status: "new" as const,
  timestamp: "2026-09-24T00:00:00.000Z",
  org: "클래스인 학원",
  name: "홍길동",
}
const LOG: ContactLogRecord = {
  id: "log-1",
  lead_id: "lead-1",
  type: "call",
  result: "callback",
  notes: "내일 다시",
  contacted_at: "2026-09-25T02:50:00.000Z",
  contacted_by: "김매니저",
}

beforeEach(() => {
  mocks.findDuplicateContactLog.mockResolvedValue(null)
  mocks.addContactLog.mockResolvedValue(LOG)
  mocks.updateLead.mockResolvedValue({ ...LEAD, status: "contacted" })
  mocks.getOrCreateCrmCustomerEventBySource.mockImplementation(async (input: Record<string, unknown>) => ({
    created: true,
    record: { id: "event-1", ...input, nextActions: input.nextActions ?? [] },
  }))
  mocks.createTasksFromEventNextActions.mockResolvedValue([{ id: "task-1" }])
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("resolveComposerContactChannel — 기록 컴포저의 어떤 저장이 연락인가", () => {
  it("콜 모드는 전화, 문자 모드는 문자(카톡·이메일 명시 시 그 채널)", () => {
    expect(resolveComposerContactChannel("call")).toBe("call")
    expect(resolveComposerContactChannel("call", "kakao")).toBe("call")
    expect(resolveComposerContactChannel("sms")).toBe("sms")
    expect(resolveComposerContactChannel("sms", "kakao")).toBe("kakao")
    expect(resolveComposerContactChannel("sms", "email")).toBe("email")
    expect(resolveComposerContactChannel("sms", "call")).toBe("sms")
  })

  it("메모·회의록·녹음 등은 연락 로그 채널이 아니다", () => {
    for (const mode of ["manual_note", "meeting_minutes", "recording", "calendar_event", undefined, null]) {
      expect(resolveComposerContactChannel(mode, "call")).toBeNull()
    }
  })
})

describe("leadContactTimeError", () => {
  const now = NOW.getTime()
  it("미래 5분 초과·리드 생성 5분 전 초과만 거절한다", () => {
    expect(leadContactTimeError(LEAD.timestamp, undefined, now)).toBeNull()
    expect(leadContactTimeError(LEAD.timestamp, "2026-09-25T03:04:00.000Z", now)).toBeNull()
    expect(leadContactTimeError(LEAD.timestamp, "2026-09-25T03:06:00.000Z", now)).toBe("future")
    expect(leadContactTimeError(LEAD.timestamp, "2026-09-23T23:56:00.000Z", now)).toBeNull()
    expect(leadContactTimeError(LEAD.timestamp, "2026-09-23T23:54:00.000Z", now)).toBe("before_lead")
    expect(leadContactTimeError(undefined, "2020-01-01T00:00:00.000Z", now)).toBeNull()
  })
})

describe("buildLeadContactMirrorInput — 컴포저 내용을 살린 미러", () => {
  it("컴포저가 없으면 로그 기본 미러(lead_contact_log)", () => {
    const input = buildLeadContactMirrorInput(LOG, "클래스인 학원")
    expect(input).toMatchObject({ sourceType: "lead_contact_log", sourceId: "log-1", title: "전화 · 콜백 요청" })
  })

  it("컴포저 모드·내용을 살리되 대상·원천 id·발생 시각은 로그로 고정하고 빈 칸만 로그 값으로 채운다", () => {
    const input = buildLeadContactMirrorInput(LOG, "클래스인 학원", {
      sourceType: "call",
      title: "  ",
      summary: "도입 검토 중",
      body: "내일 다시",
      tags: ["도입"],
      sentiment: "neutral",
      nextActions: [],
      createdBy: "관리자",
    })
    expect(input).toMatchObject({
      targetType: "lead",
      targetId: "lead-1",
      targetLabel: "클래스인 학원",
      sourceType: "call",
      sourceId: "log-1",
      occurredAt: LOG.contacted_at,
      title: "전화 · 콜백 요청",
      summary: "도입 검토 중",
      tags: ["도입"],
      ownerName: "김매니저",
      createdBy: "관리자",
    })
    // 컴포저가 다음 액션을 적지 않았으면 콜백 결과의 기본 다음 액션을 쓴다.
    expect(input.nextActions?.[0]?.title).toBe("콜백 약속 이행")
  })

  it("컴포저가 적은 다음 액션이 있으면 그것만 쓴다(중복 할 일 방지)", () => {
    const input = buildLeadContactMirrorInput(LOG, null, {
      sourceType: "sms",
      nextActions: [{ title: "견적서 보내기", ownerName: null, dueAt: null, done: false }],
    })
    expect(input.nextActions).toEqual([{ title: "견적서 보내기", ownerName: null, dueAt: null, done: false }])
  })
})

describe("recordLeadContact", () => {
  it("로그를 먼저 저장하고, 신규 리드를 연락중으로 바꾸고, 로그 id로 미러를 한 번 만든다", async () => {
    const result = await recordLeadContact({
      lead: LEAD,
      entry: { type: "call", result: "callback", notes: "내일 다시", contacted_by: "김매니저" },
      now: NOW,
    })

    expect(result).toMatchObject({ ok: true, duplicate: false, statusSync: "updated", mirror: "created", tasksCreated: 1 })
    expect(mocks.addContactLog).toHaveBeenCalledTimes(1)
    expect(mocks.addContactLog.mock.invocationCallOrder[0]).toBeLessThan(mocks.updateLead.mock.invocationCallOrder[0])
    expect(mocks.updateLead).toHaveBeenCalledWith("lead-1", {
      status: "contacted",
      confirmed_at: NOW.toISOString(),
    })
    expect(mocks.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledTimes(1)
    expect(mocks.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "lead_contact_log", sourceId: "log-1", targetId: "lead-1" })
    )
    expect(mocks.createCrmCustomerEvent).not.toHaveBeenCalled()
    expect(mocks.createTasksFromEventNextActions).toHaveBeenCalledTimes(1)
    expect(mocks.createTasksFromEventNextActions).toHaveBeenCalledWith(expect.objectContaining({ id: "event-1" }), {
      createdBy: "김매니저",
    })
  })

  it("컴포저 내용이 있으면 그 모드(call)로 미러를 만들고 할 일 작성자는 호출부 값을 쓴다", async () => {
    await recordLeadContact({
      lead: LEAD,
      entry: { type: "call", notes: "통화" },
      composer: { sourceType: "call", body: "통화", tags: ["콜"] },
      taskCreatedBy: "운영 관리자",
      now: NOW,
    })

    expect(mocks.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: "call", sourceId: "log-1", tags: ["콜"] })
    )
    expect(mocks.createTasksFromEventNextActions).toHaveBeenCalledWith(expect.anything(), { createdBy: "운영 관리자" })
  })

  it("이미 연락중·전환된 리드는 상태를 건드리지 않는다", async () => {
    const result = await recordLeadContact({
      lead: { ...LEAD, status: "contacted" },
      entry: { type: "sms" },
      now: NOW,
    })
    expect(result).toMatchObject({ ok: true, statusSync: "unchanged" })
    expect(mocks.updateLead).not.toHaveBeenCalled()
  })

  it("기존 미러를 돌려받으면(created: false) 할 일을 다시 만들지 않는다", async () => {
    mocks.getOrCreateCrmCustomerEventBySource.mockResolvedValueOnce({ created: false, record: { id: "event-1", nextActions: [] } })
    const result = await recordLeadContact({ lead: LEAD, entry: { type: "call" }, now: NOW })
    expect(result).toMatchObject({ ok: true, mirror: "existing", tasksCreated: 0 })
    expect(mocks.createTasksFromEventNextActions).not.toHaveBeenCalled()
  })

  it("같은 내용·같은 시각의 로그가 있으면 재사용한다(새 로그 없음)", async () => {
    mocks.findDuplicateContactLog.mockResolvedValueOnce(LOG)
    mocks.getOrCreateCrmCustomerEventBySource.mockResolvedValueOnce({ created: false, record: { id: "event-1", nextActions: [] } })

    const result = await recordLeadContact({
      lead: { ...LEAD, status: "contacted" },
      entry: { type: "call", result: "callback", notes: "내일 다시", contacted_by: "김매니저", contacted_at: LOG.contacted_at },
      now: NOW,
    })

    expect(result).toMatchObject({ ok: true, duplicate: true, log: LOG })
    expect(mocks.addContactLog).not.toHaveBeenCalled()
  })

  it("시각이 말이 안 되면 아무것도 저장하지 않는다", async () => {
    const result = await recordLeadContact({
      lead: LEAD,
      entry: { type: "call", contacted_at: "2026-09-26T00:00:00.000Z" },
      now: NOW,
    })
    expect(result).toEqual({ ok: false, reason: "future" })
    expect(mocks.addContactLog).not.toHaveBeenCalled()
    expect(mocks.updateLead).not.toHaveBeenCalled()
    expect(mocks.getOrCreateCrmCustomerEventBySource).not.toHaveBeenCalled()
  })

  it("로그 저장이 실패하면 던지고 전환·미러는 일어나지 않는다", async () => {
    mocks.addContactLog.mockRejectedValueOnce(new Error("write failed"))
    await expect(recordLeadContact({ lead: LEAD, entry: { type: "call" }, now: NOW })).rejects.toThrow("write failed")
    expect(mocks.updateLead).not.toHaveBeenCalled()
    expect(mocks.getOrCreateCrmCustomerEventBySource).not.toHaveBeenCalled()
  })

  it("상태 전환·미러 실패는 fail-soft — 로그는 저장된 채로 결과에 상태만 싣는다", async () => {
    mocks.updateLead.mockRejectedValueOnce(new Error("status down"))
    mocks.getOrCreateCrmCustomerEventBySource.mockRejectedValueOnce(new Error("events down"))

    const result = await recordLeadContact({ lead: LEAD, entry: { type: "call" }, now: NOW })

    expect(result).toMatchObject({ ok: true, statusSync: "failed", mirror: "failed", event: null, tasksCreated: 0 })
  })
})

describe("deleteLeadContactLogWithMirrors (CT3)", () => {
  it("순수 미러(lead_contact_log)를 먼저 같은 리드 범위에서 지우고 로그를 지운다 — 컴포저 원본(call·sms)은 남긴다", async () => {
    mocks.deleteCrmCustomerEventsBySource.mockResolvedValueOnce(1)
    mocks.deleteContactLog.mockResolvedValueOnce(true)

    await expect(deleteLeadContactLogWithMirrors("lead-1", "log-1")).resolves.toEqual({ deleted: true, mirrorsRemoved: 1 })
    expect(mocks.deleteCrmCustomerEventsBySource).toHaveBeenCalledWith({
      sourceTypes: ["lead_contact_log"],
      sourceId: "log-1",
      targetType: "lead",
      targetId: "lead-1",
    })
    expect(mocks.deleteCrmCustomerEventsBySource.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.deleteContactLog.mock.invocationCallOrder[0]
    )
  })

  it("미러 정리가 실패하면 로그를 지우지 않는다(재시도 가능)", async () => {
    mocks.deleteCrmCustomerEventsBySource.mockRejectedValueOnce(new Error("events down"))
    await expect(deleteLeadContactLogWithMirrors("lead-1", "log-1")).resolves.toEqual({
      deleted: false,
      reason: "mirror_cleanup_failed",
    })
    expect(mocks.deleteContactLog).not.toHaveBeenCalled()
  })

  it("로그 삭제가 실패하면 실패를 돌려준다", async () => {
    mocks.deleteCrmCustomerEventsBySource.mockResolvedValueOnce(0)
    mocks.deleteContactLog.mockResolvedValueOnce(false)
    await expect(deleteLeadContactLogWithMirrors("lead-1", "log-1")).resolves.toEqual({
      deleted: false,
      reason: "log_delete_failed",
    })
  })
})

describe("hasLeadContactEvidence", () => {
  it("연락 로그가 1차 — 있으면 기록을 보지 않는다", async () => {
    mocks.hasContactLog.mockResolvedValueOnce(true)
    await expect(hasLeadContactEvidence("lead-1")).resolves.toBe(true)
    expect(mocks.hasLeadContactEvent).not.toHaveBeenCalled()
  })

  it("로그가 없으면 사람 접촉 기록을 인정한다", async () => {
    mocks.hasContactLog.mockResolvedValueOnce(false)
    mocks.hasLeadContactEvent.mockResolvedValueOnce(true)
    await expect(hasLeadContactEvidence("lead-1")).resolves.toBe(true)

    mocks.hasContactLog.mockResolvedValueOnce(false)
    mocks.hasLeadContactEvent.mockResolvedValueOnce(false)
    await expect(hasLeadContactEvidence("lead-1")).resolves.toBe(false)
  })
})
