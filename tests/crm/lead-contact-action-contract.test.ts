import { readFileSync, readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// 리드 보드 본체는 components/admin/crm/leads/board/* 로 분해됐다(2026-08-28) —
// 계약은 화면 단위로 유지해야 하므로 본체 + 분해 모듈 전체를 합쳐 검사한다.
const boardDir = join(process.cwd(), "components/admin/crm/leads/board")
const board = [
  readFileSync(join(process.cwd(), "components/admin/crm/leads/LeadsBoardClient.tsx"), "utf8"),
  ...readdirSync(boardDir)
    .sort()
    .map((name) => readFileSync(join(boardDir, name), "utf8")),
].join("\n")
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
