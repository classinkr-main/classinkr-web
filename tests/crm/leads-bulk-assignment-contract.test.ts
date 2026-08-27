import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "components/admin/crm/leads/LeadsBoardClient.tsx"),
  "utf8"
)

describe("CRM lead bulk assignment UX contract", () => {
  it("uses the verified CRM owner directory instead of free-text prompt assignment", () => {
    expect(source).toContain('import { useCrmOwners, type CrmOwnerOption } from "@/components/admin/crm/useCrmOwners"')
    expect(source).toContain("const { owners: crmOwners, health: crmOwnerHealth } = useCrmOwners()")
    expect(source).toContain('id="bulk-lead-assignment"')
    expect(source).toContain("담당자를 선택하세요")
    expect(source).toContain('aria-label="리드 담당자"')
    expect(source).not.toContain('placeholder="담당자 이름 입력"')
    expect(source).not.toContain("window.prompt(")
  })

  it("sends one server-side bulk request and merges returned rows", () => {
    expect(source).toContain('adminFetch("/api/admin/leads/bulk-assign"')
    expect(source).toContain('adminFetch("/api/admin/leads/assignment-preview"')
    expect(source).toContain("adminReadOnly: true")
    expect(source).toContain('mode: "manual_reviewed"')
    expect(source).toContain("snapshotToken: preview?.snapshotToken")
    expect(source).toContain("const updated = new Map(data.leads.map((lead) => [lead.id, lead]))")
    expect(source).toContain("setSelectedLeadIds(new Set())")
  })

  it("keeps assignment controls keyboard-visible and touch sized", () => {
    expect(source).toContain('aria-controls="bulk-lead-assignment"')
    expect(source).toContain('aria-expanded={bulkAssignOpen}')
    expect(source).toContain("활성 CRM 담당자")
    expect(source).toContain("min-h-11")
    expect(source).toContain("focus-visible:ring-2")
  })

  it("fails closed on unhealthy roster and exposes server-safe selection counts", () => {
    expect(source).toContain("crmOwnerHealth?.ok !== true")
    expect(source).toContain("자동 근거 있음")
    expect(source).toContain("검토 후 지정 가능")
    expect(source).toContain("안전 대상")
    expect(source).toContain("assignmentPreview.blockedLeadIds.length === 0")
  })
})
