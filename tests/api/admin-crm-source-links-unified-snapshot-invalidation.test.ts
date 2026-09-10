/**
 * 소스 링크 확정/해제/생성 라우트가 crm-unified-customers.ts 소스 스냅샷 태그도 SWR로
 * 무효화하는지 고정하는 정적 계약. 이 네 라우트는 이미 coverage/os-summary/revenue 태그를
 * revalidateTag(tag, "max")로 걸고 있었다(admin-performance-plan-2026-09-02.md §4.4) — 소스
 * 링크 확정/해제/생성이 lib/repositories/crm-unified-customers.ts가 읽는
 * listConfirmedLeadCustomerLinks/listConfirmedLeadNeoLinkLeadIds의 입력이므로 같은 자리에
 * ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG를 추가로 건다.
 *
 * 라우트 본문은 requireVerifiedAdminContext·복잡한 소스 링크 알고리즘까지 포함해 무겁다 —
 * 이 변경은 기존 revalidateTag 호출부에 한 줄을 더하는 것뿐이라, 전체 핸들러를 다시
 * 목킹하는 대신 소스 텍스트 계약으로 고정한다(tests/crm/matching-page-performance-contract.test.ts
 * 와 같은 패턴).
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROUTES = [
  "app/api/admin/crm/source-links/bulk/route.ts",
  "app/api/admin/crm/source-links/manual/route.ts",
  "app/api/admin/crm/source-links/generate/route.ts",
  "app/api/admin/crm/source-links/[id]/route.ts",
]

describe("소스 링크 뮤테이션 라우트 → admin-crm-unified-snapshot 무효화", () => {
  it.each(ROUTES)("%s가 태그를 import하고 코버리지 무효화와 같은 횟수로 건다", (relativePath) => {
    const source = readFileSync(join(process.cwd(), relativePath), "utf8")

    expect(source).toContain("ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG")
    expect(source).toContain('from "@/lib/admin/crm/cache-tags"')

    const coverageCalls = source.match(/revalidateTag\(ADMIN_CRM_COVERAGE_CACHE_TAG, "max"\)/g) ?? []
    const unifiedCalls = source.match(/revalidateTag\(ADMIN_CRM_UNIFIED_SNAPSHOT_CACHE_TAG, "max"\)/g) ?? []

    expect(coverageCalls.length).toBeGreaterThan(0)
    expect(unifiedCalls.length).toBe(coverageCalls.length)
  })
})
