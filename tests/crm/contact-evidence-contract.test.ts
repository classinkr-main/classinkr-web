import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const eventsRepository = readFileSync(join(process.cwd(), "lib/repositories/crm-events.ts"), "utf8")
const logsRoute = readFileSync(join(process.cwd(), "app/api/admin/leads/[id]/logs/route.ts"), "utf8")

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
    expect(logsRoute).toContain("getOrCreateCrmCustomerEventBySource")
    expect(logsRoute).toContain("if (event.created)")
    expect(logsRoute.indexOf("const log = await addContactLog")).toBeLessThan(
      logsRoute.indexOf('status: "contacted"')
    )
    expect(logsRoute).toContain('statusSync === "failed"')
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
