/**
 * NEO 고객 스냅샷을 재계산하는 두 분기(refreshSnapshotsOnly 단독 실행, 전체 동기화 체인)가
 * 전부 admin-crm-customers-neo.ts/crm-region-map.ts의 Data Cache를 무효화하는지 고정하는
 * 정적 계약 (2026-09-10 3라운드 §3.2).
 *
 * lib/admin-crm-customers-neo.ts의 getNeoCrmCustomers를 unstable_cache로 승격하면서 무효화
 * 짝을 이 라우트에 걸었다 — crm_neo_customer_snapshots를 실제로 쓰는 유일한 두 지점이 여기다
 * (refreshCrmNeoCustomerSnapshotsFromExternalRecords 직접 호출 / runExternalCrmSyncChain 내부
 * 호출). 라우트 본문이 verifyAdmin·다단계 JSON 파싱까지 포함해 무거우므로, 기존
 * tests/api/admin-crm-source-links-unified-snapshot-invalidation.test.ts와 같은 소스 텍스트
 * 계약 방식을 쓴다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const ROUTE_PATH = "app/api/admin/crm/external-sync/route.ts"

describe("external-sync 라우트 → NEO 고객 캐시 무효화", () => {
  const source = readFileSync(join(process.cwd(), ROUTE_PATH), "utf8")

  it("invalidateNeoCrmCustomersCache/invalidateCrmRegionMapCache를 올바른 모듈에서 import한다", () => {
    expect(source).toContain('import { invalidateNeoCrmCustomersCache } from "@/lib/admin-crm-customers-neo"')
    expect(source).toContain(
      'import { invalidateCrmRegionMapCache } from "@/lib/repositories/crm-region-map"'
    )
  })

  it("crm_neo_customer_snapshots를 재계산하는 두 분기 모두에서 두 캐시를 무효화한다", () => {
    // refreshSnapshotsOnly 분기(무조건 호출) + 전체 체인 분기(chain.neoCustomerSnapshots 확인 후)
    // = 최소 2회씩.
    const neoCalls = source.match(/invalidateNeoCrmCustomersCache\(\)/g) ?? []
    const regionCalls = source.match(/invalidateCrmRegionMapCache\(\)/g) ?? []

    expect(neoCalls.length).toBeGreaterThanOrEqual(2)
    expect(regionCalls.length).toBe(neoCalls.length)
  })

  it("전체 체인 분기는 neoCustomerSnapshots가 실제로 채워졌을 때만 무효화한다", () => {
    expect(source).toContain("if (chain.neoCustomerSnapshots) {")
  })
})
