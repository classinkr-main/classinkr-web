import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(
  join(process.cwd(), "components/admin/crm/matching/MatchingInboxClient.tsx"),
  "utf8"
)

describe("CRM matching loading contract", () => {
  it("bounds the initial inbox request instead of leaving the workspace pending for 45 seconds", () => {
    expect(source).toContain("const MATCHING_FETCH_TIMEOUT_MS = 15_000")
    expect(source).toContain("adminTimeoutMs: MATCHING_FETCH_TIMEOUT_MS")
  })

  it("requests a server-filtered 25-row page instead of downloading and rendering 50 mobile cards", () => {
    expect(source).toContain("const MATCHING_PAGE_SIZE = 25")
    expect(source).toContain("source: sourceFilter")
    expect(source).toContain("status: statusFilter")
    expect(source).toContain("offset: String(normalizedNameFilter ? 0 : pageOffset)")
    expect(source).toContain('params.set("fresh", "1")')
    expect(source).not.toContain("MAX_VISIBLE_ROWS")
    expect(source).not.toContain("filteredRows.slice")
  })

  it("does not double-count REV candidates in the actionable KPI", () => {
    expect(source).toContain('sourceFilter === "branch_rev_sheet"')
    expect(source).toContain("data.summary.branch_rev_sheet.unmatchedCount")
    expect(source).toContain("data.summary.xiaoshouyi.reviewCount")
    expect(source).toContain("data.summary.lead.reviewCount")
    expect(source).not.toContain("(totals?.reviewCount ?? 0) + (totals?.unmatchedCount ?? 0)")
  })

  it("reloads on filter/page changes and exposes accessible page navigation", () => {
    expect(source).toContain("[normalizedNameFilter, pageOffset, sourceFilter, statusFilter]")
    expect(source).toContain('aria-label="매칭 인박스 페이지"')
    expect(source).toContain("data.page.hasPrevious")
    expect(source).toContain("data.page.hasMore")
  })

  it("does not collapse a failed inbox to zero or an all-clear empty state", () => {
    expect(source.match(/error && !data/g)?.length).toBeGreaterThanOrEqual(6)
    expect(source).toContain("0건이 아니라 확인할 수 없는 상태")
    expect(source).toContain("0건이 아니며, 잠시 후 다시 시도해 주세요.")
    expect(source).toContain('role="alert"')
  })

  it("offers an accessible force-refresh recovery action on mobile and desktop", () => {
    expect(source.match(/onClick=\{\(\) => void load\(\{ force: true \}\)\}/g)?.length).toBeGreaterThanOrEqual(3)
    expect(source.match(/min-h-11/g)?.length).toBeGreaterThanOrEqual(2)
    expect(source).toContain("focus-visible:ring-2")
  })

  it("keeps filters, row actions, links and checkboxes at 44px with busy/focus semantics", () => {
    expect(source).toContain("aria-busy={loading || generating || bulkPending}")
    expect(source).toContain("[&_button]:min-h-11")
    expect(source).toContain("[&_button]:min-w-11")
    expect(source).toContain("[&_a]:min-h-11")
    expect(source.match(/focus-within:ring-2/g)?.length).toBeGreaterThanOrEqual(3)
    expect(source).toContain('className="h-11 min-w-0 flex-1')
  })
})
