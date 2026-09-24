import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const eventsRepository = readFileSync(join(process.cwd(), "lib/repositories/crm-events.ts"), "utf8")
const logsRoute = readFileSync(join(process.cwd(), "app/api/admin/leads/[id]/logs/route.ts"), "utf8")
const contactRecord = readFileSync(join(process.cwd(), "lib/crm/contact-record.ts"), "utf8")
const contactLogsRepository = readFileSync(join(process.cwd(), "lib/repositories/contact-logs.ts"), "utf8")
const eventsRoute = readFileSync(join(process.cwd(), "app/api/admin/crm/events/route.ts"), "utf8")

describe("lead contact evidence contract", () => {
  it("uses primary contact logs in first-response and latest-contact maps", () => {
    expect(eventsRepository).toContain('.from("lead_contact_logs")')
    expect(eventsRepository).toContain('crmContactTargetKey("lead", leadId)')
    expect(eventsRepository).toContain("earlierContact(firstResponseByLead.get(leadId), contactedAt)")
  })

  it("does not count an internal manual note as customer response evidence", () => {
    expect(eventsRepository).toContain(
      'const RESPONSE_SOURCE_TYPES = ["call", "sms", "meeting_minutes", "recording", "lead_contact_log"]'
    )
  })

  it("makes CRM mirroring idempotent and promotes a new lead only after log storage", () => {
    // 저장·전환·미러는 lib/crm/contact-record.ts 한 곳 — 로그 라우트와 기록 컴포저가 같이 쓴다(CT1).
    expect(logsRoute).toContain("recordLeadContact")
    expect(contactRecord).toContain("getOrCreateCrmCustomerEventBySource")
    expect(contactRecord).toContain("if (event && eventCreated)")
    expect(contactRecord.indexOf("await addContactLog(")).toBeGreaterThan(-1)
    expect(contactRecord.indexOf("await addContactLog(")).toBeLessThan(contactRecord.indexOf('status: "contacted"'))
    expect(logsRoute).toContain('statusSync === "failed"')
  })

  it("keeps the log → mirror direction one-way so an event write can never loop back into a log", () => {
    // 연락 로그 저장소는 기록을 만들지 않는다(미러는 contact-record가 명시적으로 한 번 만든다).
    expect(contactLogsRepository).not.toContain("@/lib/repositories/crm-events")
    expect(contactLogsRepository).not.toContain("@/lib/crm/contact-record")
    // 기록 저장소는 로그를 만들지 않는다.
    expect(eventsRepository).not.toContain("@/lib/repositories/contact-logs")
    expect(eventsRepository).not.toContain("@/lib/crm/contact-record")
    // contact-record는 라우트를 다시 타지 않는다(HTTP 재진입 금지).
    expect(contactRecord).not.toContain("@/app/")
    expect(contactRecord).not.toContain("createCrmCustomerEvent(")
    // 기록 컴포저는 연락 분기를 먼저 태우고, 연락이면 일반 기록 저장으로 내려가지 않는다.
    const contactBranch = eventsRoute.indexOf("const contactResponse = await saveLeadContactFromComposer(")
    expect(contactBranch).toBeGreaterThan(-1)
    expect(eventsRoute.indexOf("if (contactResponse) return contactResponse", contactBranch)).toBeGreaterThan(contactBranch)
  })

  it("deletes the mirrored CRM events together with a deleted contact log (CT3)", () => {
    expect(logsRoute).toContain("deleteLeadContactLogWithMirrors")
    expect(contactRecord).toContain("deleteCrmCustomerEventsBySource")
    expect(contactRecord).toContain("LEAD_CONTACT_MIRROR_SOURCE_TYPES")
  })

  it("rejects impossible contact timestamps and defaults the actor from the verified admin", () => {
    expect(logsRoute).toContain("contacted_at cannot be in the future")
    expect(logsRoute).toContain("contacted_at cannot be before the lead was created")
    expect(logsRoute).toContain("contactedBy ?? admin.name ?? admin.userId ?? admin.role")
  })

  it("protects the final contact record that supports a contacted lead", () => {
    expect(logsRoute).toContain('lead.status === "contacted" && logs.length <= 1')
    expect(logsRoute).toContain("마지막 연락 기록은 삭제할 수 없습니다")
  })
})
