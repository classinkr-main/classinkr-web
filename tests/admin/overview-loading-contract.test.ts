import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// page.tsx는 서버 프리페치 래퍼만 남았고 화면 로직은 전부 OverviewClient로 옮겨졌다.
const source = readFileSync(join(process.cwd(), "app/admin/overview/OverviewClient.tsx"), "utf8")

describe("admin overview loading and failure contract", () => {
  it("bounds admin requests and keeps a stale cache path for fast revisits", () => {
    expect(source).toContain("const OVERVIEW_FETCH_TIMEOUT_MS = 12_000")
    expect(source).toContain("adminTimeoutMs: OVERVIEW_FETCH_TIMEOUT_MS")
    expect(source).toContain("staleWhileRevalidateMs: 10 * 60_000")
  })

  it("uses the server-projected Overview lead contract instead of sending every lead row", () => {
    expect(source).toContain('fetchJson<AdminLeadsOverviewResponse>("/api/admin/leads?scope=overview"')
    expect(source).not.toContain('scope=dashboard')
    expect(source).not.toContain('useState<LeadRecord[]>')
  })

  it("uses the server-projected Blog summary instead of sending every post row", () => {
    expect(source).toContain('"/api/admin/blog?scope=overview"')
    expect(source).not.toContain('fetchJson<{ posts: BlogPost[] }>("/api/admin/blog"')
    expect(source).not.toContain('useState<BlogPost[]>')
  })

  it("separates the source-health OS contract from legacy client caches", () => {
    expect(source).toContain('"/api/admin/os-summary?contract=v3"')
  })

  it("tracks critical sources independently instead of collapsing failures to zero", () => {
    expect(source).toContain('type OverviewSourceState = "loading" | "ready" | "error"')
    expect(source).toContain("0이 아니라 조회 실패입니다.")
    expect(source).toContain("실패를 0으로 표시하지 않습니다.")
    expect(source).toContain("sourceStates.leads === \"error\"")
    expect(source.match(/sourceStates\.branch === \"error\"/g)?.length).toBeGreaterThanOrEqual(2)
    expect(source.match(/sourceStates\.visitor === \"error\"/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it("isolates every OS sub-source failure and keeps successful KPI values visible", () => {
    expect(source).toContain('type OsSummarySourceKey = "renewal" | "matching" | "hw" | "content" | "events"')
    for (const key of ["renewal", "matching", "hw", "content", "events"]) {
      expect(source).toContain(`osSourceState("${key}")`)
      expect(source).toContain(`osSourceError("${key}")`)
    }
    expect(source).toContain("OsDetailUnavailable")
    expect(source).toContain('role="alert"')
    expect(source).toContain('aria-label={`${label} 지표 다시 시도`}')
  })

  it("offers a force-refresh recovery action", () => {
    expect(source).toContain("const retryOverview = () => setRefreshKey")
    expect(source).toContain("전체 다시 시도")
    expect(source).toContain("force: fresh")
  })

  it("uses responsive grids and Next links without clipped mobile KPI rails", () => {
    expect(source).toContain('"grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5"')
    expect(source).not.toMatch(/<a(?:\s|>)/)
  })
})
