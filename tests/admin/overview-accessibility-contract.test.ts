import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// page.tsx는 서버 프리페치 래퍼만 남았고 화면 로직은 전부 OverviewClient로 옮겨졌다.
const overviewSource = readFileSync(join(process.cwd(), "app/admin/overview/OverviewClient.tsx"), "utf8")
const statCardSource = readFileSync(join(process.cwd(), "components/admin/StatCard.tsx"), "utf8")

describe("admin overview accessibility contract", () => {
  it("keeps links and buttons keyboard-visible with 44px minimum targets", () => {
    expect(overviewSource).toContain("[&_a]:min-h-11")
    expect(overviewSource).toContain("[&_button]:min-h-11")
    expect(overviewSource).toContain("[&_a]:focus-visible:ring-2")
    expect(overviewSource).toContain("[&_button]:focus-visible:ring-2")
  })

  it("exposes toggle state and controlled content to assistive technology", () => {
    expect(overviewSource).toContain("aria-pressed={chartRange === range}")
    expect(overviewSource).toContain("aria-expanded={alertsExpanded}")
    expect(overviewSource).toContain('aria-controls="overview-operational-alerts"')
    expect(overviewSource).toContain('role="group"')
    expect(overviewSource).toContain('aria-label="문의 유입 추이 기간"')
  })

  it("announces asynchronous section state without removing semantic links", () => {
    expect(overviewSource).toContain('aria-live="polite"')
    expect(overviewSource.match(/aria-busy=/g)?.length).toBeGreaterThanOrEqual(4)
    expect(statCardSource).toContain("href={href}")
    expect(statCardSource).toContain("<StatTile")
  })
})
