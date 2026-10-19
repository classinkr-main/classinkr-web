/**
 * lib/crm/contact-record.ts recordLeadContact — 호출자가 정한 로그 id(요청 키 멱등, 교차 리뷰 [12] 2026-09-26).
 * entry.id 가 로그 조회·저장에 그대로 흘러, 같은 id 의 로그가 있으면 새로 쓰지 않고(duplicate) 미러도 같은 source_id 로
 * 한 번만 생긴다. 기존 호출부(id 없음)는 바뀌지 않는다 — tests/crm/contact-record.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  addContactLog: vi.fn(),
  deleteContactLog: vi.fn(),
  findDuplicateContactLog: vi.fn(),
  hasContactLog: vi.fn(),
  getOrCreateCrmCustomerEventBySource: vi.fn(),
  deleteCrmCustomerEventsBySource: vi.fn(),
  hasLeadContactEvent: vi.fn(),
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
  LEAD_CONTACT_MIRROR_SOURCE_TYPES: ["lead_contact_log", "call", "sms"],
}))
vi.mock("@/lib/repositories/crm-tasks", () => ({ createTasksFromEventNextActions: mocks.createTasksFromEventNextActions }))
vi.mock("@/lib/repositories/leads", () => ({ updateLead: mocks.updateLead }))

import { recordLeadContact } from "@/lib/crm/contact-record"

const NOW = new Date("2026-09-25T03:00:00.000Z")
const LOG_ID = "7d9a0c1e-2b3f-5a4d-8e6f-0123456789ab"
const LOG = {
  id: LOG_ID,
  lead_id: "L1",
  type: "call" as const,
  result: "no_answer" as const,
  notes: null,
  contacted_at: "2026-09-25T02:59:00.000Z",
  contacted_by: "김운영",
}

beforeEach(() => {
  for (const fn of Object.values(mocks)) fn.mockReset()
  mocks.updateLead.mockResolvedValue({ id: "L1", status: "contacted" })
  mocks.getOrCreateCrmCustomerEventBySource.mockResolvedValue({ created: false, record: { id: "ME1", nextActions: [] } })
})

describe("recordLeadContact — 요청 키 로그 id", () => {
  it("entry.id 가 중복 조회·저장에 그대로 간다", async () => {
    mocks.findDuplicateContactLog.mockResolvedValue(null)
    mocks.addContactLog.mockResolvedValue(LOG)
    const entry = { id: LOG_ID, type: "call" as const, result: "no_answer" as const, contacted_by: "김운영", contacted_at: NOW.toISOString() }
    const result = await recordLeadContact({ lead: { id: "L1", status: "new", timestamp: "2026-09-24T00:00:00.000Z", org: "가", name: "김원장" }, entry, now: NOW })
    expect(mocks.findDuplicateContactLog).toHaveBeenCalledWith("L1", expect.objectContaining({ id: LOG_ID }))
    expect(mocks.addContactLog).toHaveBeenCalledWith("L1", expect.objectContaining({ id: LOG_ID, contacted_at: NOW.toISOString() }))
    expect(result).toMatchObject({ ok: true, duplicate: false, statusSync: "updated" })
    // 연락중 전환은 저장 시각(now)을 confirmed_at 으로 — 로그 연락 시각과 같은 순간(되돌리기 판정 근거).
    expect(mocks.updateLead).toHaveBeenCalledWith("L1", { status: "contacted", confirmed_at: NOW.toISOString() })
  })

  it("같은 id 의 로그가 있으면(재전송) 새로 쓰지 않고 같은 로그로 미러를 찾는다 — 할 일도 다시 만들지 않는다", async () => {
    mocks.findDuplicateContactLog.mockResolvedValue(LOG)
    const result = await recordLeadContact({
      lead: { id: "L1", status: "contacted", timestamp: "2026-09-24T00:00:00.000Z", org: "가", name: "김원장" },
      entry: { id: LOG_ID, type: "call", result: "no_answer", contacted_by: "김운영", contacted_at: NOW.toISOString() },
      now: NOW,
    })
    expect(mocks.addContactLog).not.toHaveBeenCalled()
    expect(mocks.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledWith(expect.objectContaining({ sourceId: LOG_ID }))
    expect(mocks.createTasksFromEventNextActions).not.toHaveBeenCalled()
    expect(mocks.updateLead).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ok: true, duplicate: true, statusSync: "unchanged", log: { id: LOG_ID } })
  })

  it("요청 키가 있으면 컴포저 다음 액션이 미러와 달라도 재전송이다 — 다음 액션 비교(f989a812 규칙)는 내용 기반 중복에만 건다", async () => {
    mocks.findDuplicateContactLog.mockResolvedValue(LOG)
    mocks.getOrCreateCrmCustomerEventBySource.mockResolvedValue({
      created: false,
      record: { id: "ME1", nextActions: [{ title: "견적 발송", ownerName: null, dueAt: null, done: false }] },
    })
    const result = await recordLeadContact({
      lead: { id: "L1", status: "contacted", timestamp: "2026-09-24T00:00:00.000Z", org: "가", name: "김원장" },
      entry: { id: LOG_ID, type: "call", result: "no_answer", contacted_by: "김운영", contacted_at: NOW.toISOString() },
      composer: { sourceType: "call", nextActions: [{ title: "설치 일정 확인", ownerName: null, dueAt: null, done: false }] },
      now: NOW,
    })
    expect(mocks.addContactLog).not.toHaveBeenCalled()
    expect(mocks.getOrCreateCrmCustomerEventBySource).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ ok: true, duplicate: true, log: { id: LOG_ID }, mirror: "existing", tasksCreated: 0 })
  })
})
