import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const board = readFileSync(
  join(process.cwd(), "components/admin/crm/leads/LeadsBoardClient.tsx"),
  "utf8"
)
const campaignLeads = readFileSync(
  join(process.cwd(), "components/admin/campaigns/tabs/NewLeadsTab.tsx"),
  "utf8"
)

describe("lead contact evidence action contract", () => {
  it("opens the canonical contact form from the campaign contact CTA", () => {
    expect(campaignLeads).toContain("&action=contact")
    expect(board).toContain('const deepLinkedContactAction = searchParams.get("action") === "contact"')
    expect(board).toContain("initialContactForm={contactDraft?.leadId === selected.id}")
    expect(board).toContain('url.searchParams.delete("action")')
  })

  it("tel and mail actions reveal a form but never write a log automatically", () => {
    expect(board).toContain('setContactLogInitialType("call")')
    expect(board).toContain('setContactLogInitialType("email")')
    expect(board).toContain("setShowLogForm(true)")
    expect(board).toContain("autoFocus")
    expect(board).not.toMatch(/href=\{`tel:[^\n]+[\s\S]{0,180}method:\s*"POST"/)
  })

  it("keeps contact evidence writes on the lead logs endpoint", () => {
    expect(board).toContain('adminFetch(`/api/admin/leads/${selected.id}/logs`')
  })
})
