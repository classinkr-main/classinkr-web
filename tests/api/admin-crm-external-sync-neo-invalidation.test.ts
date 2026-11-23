/**
 * NEO 동기화 두 경로(수동 버튼 app/api/admin/crm/external-sync, 크론 app/api/cron/sync-external-crm)가
 * 같은 즉시 만료 규칙(lib/external-crm/sync-cache.ts → lib/server/sync-cache-tags.ts neoSync·crmSourceLinks)을 쓰는지
 * 고정하는 정적 계약.
 *
 * 2026-09-10 3라운드 §3.2 에서 수동 경로에만 NEO 고객·지역 지도 무효화("max")를 걸었고 크론은 빠져 있었다.
 * 2026-11-23: 두 경로 모두 { expire: 0 } 묶음으로 바꾸고, NEO 값을 품은 바깥 캐시까지 만료한다.
 * 행동(어떤 결과에 어떤 묶음을 만료하나)은 tests/external-crm/sync-cache.test.ts 가 본다.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const MANUAL = "app/api/admin/crm/external-sync/route.ts"
const CRON = "app/api/cron/sync-external-crm/route.ts"

describe("NEO 동기화 라우트 → 캐시 즉시 만료", () => {
  it.each([MANUAL, CRON])("%s 는 체인 뒤 expireExternalCrmSyncCaches 를 부르고 \"max\" 무효화를 쓰지 않는다", (path) => {
    const source = readFileSync(join(process.cwd(), path), "utf8")
    expect(source).toContain('import { expireExternalCrmSyncCaches } from "@/lib/external-crm/sync-cache"')
    expect(source).toContain("expireExternalCrmSyncCaches(chain)")
    expect(source).not.toMatch(/revalidateTag\([^)]*"max"\)/)
  })

  it.each([MANUAL, CRON])("%s 는 maxDuration 300 을 명시한다(체인 시간 예산이 이 안에서 끝낸다)", (path) => {
    const source = readFileSync(join(process.cwd(), path), "utf8")
    expect(source).toContain("export const maxDuration = 300")
  })

  it("refreshSnapshotsOnly 분기는 neoSync 묶음을 즉시 만료한다", () => {
    const source = readFileSync(join(process.cwd(), MANUAL), "utf8")
    expect(source).toContain('expireSyncCacheTags("neoSync")')
  })
})
