/**
 * D1(crm-tab-develop-plan-2026-09-12 §4.4) — lib/admin-crm-revenue-sheet.ts의 60초 unstable_cache
 * (ADMIN_CRM_REVENUE_SHEET_CACHE_TAG)는 정의만 있고 어디서도 revalidateTag되지 않았다
 * (admin-performance-round3-2026-09-10.md §3.4). rev-sheet 조립의 입력이 바뀌는 원천 — REV 링크를
 * 만들거나 상태를 바꾸는 소스 링크 4라우트 — 가 매출 대시보드 태그(ADMIN_CRM_REVENUE_CACHE_TAG)를
 * 거는 자리에 시트 태그도 함께 걸도록 소스 텍스트 계약으로 고정한다
 * (tests/api/admin-crm-source-links-unified-snapshot-invalidation.test.ts와 같은 패턴).
 * branch/sync 라우트는 tests/api/branch-sync-partial-failure-cache.test.ts에서 핸들러 실행으로 검증한다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const REVENUE_CALL = /revalidateTag\(ADMIN_CRM_REVENUE_CACHE_TAG, "max"\)/g
const SHEET_CALL = /revalidateTag\(ADMIN_CRM_REVENUE_SHEET_CACHE_TAG, "max"\)/g

function readRoute(relativePath: string) {
  return readFileSync(join(process.cwd(), relativePath), "utf8")
}

describe("REV 링크 확정/생성 라우트 → admin-crm-revenue-sheet 무효화 (D1)", () => {
  it.each([
    "app/api/admin/crm/source-links/bulk/route.ts",
    "app/api/admin/crm/source-links/manual/route.ts",
    "app/api/admin/crm/source-links/[id]/route.ts",
  ])("%s가 시트 태그를 import하고 매출 대시보드 태그와 같은 횟수로 건다", (relativePath) => {
    const source = readRoute(relativePath)

    expect(source).toContain('import { ADMIN_CRM_REVENUE_SHEET_CACHE_TAG } from "@/lib/admin-crm-revenue-sheet"')

    const revenueCalls = source.match(REVENUE_CALL) ?? []
    const sheetCalls = source.match(SHEET_CALL) ?? []
    expect(revenueCalls.length).toBeGreaterThan(0)
    expect(sheetCalls.length).toBe(revenueCalls.length)
  })

  it("generate 라우트는 REV 링크를 만드는 분기(all·branch_rev_sheet)에서만 시트 태그를 건다", () => {
    const source = readRoute("app/api/admin/crm/source-links/generate/route.ts")

    expect(source).toContain('import { ADMIN_CRM_REVENUE_SHEET_CACHE_TAG } from "@/lib/admin-crm-revenue-sheet"')
    // 분기 4개(all / xiaoshouyi_snapshot / lead / branch_rev_sheet) 모두 매출 대시보드 태그를 걸지만,
    // lead·xiaoshouyi_snapshot 후보는 branch_rev_sheet 링크가 아니라 rev-sheet 입력이 아니다.
    expect((source.match(REVENUE_CALL) ?? []).length).toBe(4)
    expect((source.match(SHEET_CALL) ?? []).length).toBe(2)

    const allBranch = source.slice(source.indexOf('if (source === "all")'), source.indexOf('if (source === "xiaoshouyi_snapshot")'))
    expect(allBranch).toMatch(SHEET_CALL)
    const revBranch = source.slice(source.indexOf("generateBranchRevLinkCandidates()"))
    expect(revBranch).toMatch(SHEET_CALL)
  })

  it("시트 태그 정의는 캐시 옵션의 tags와 같은 상수를 쓴다(태그 문자열 드리프트 방지)", () => {
    const source = readRoute("lib/admin-crm-revenue-sheet.ts")
    expect(source).toContain('export const ADMIN_CRM_REVENUE_SHEET_CACHE_TAG = "admin-crm-revenue-sheet"')
    expect(source).toContain("tags: [ADMIN_CRM_REVENUE_SHEET_CACHE_TAG]")
  })
})
