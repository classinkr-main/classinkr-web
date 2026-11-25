import "server-only"

import type { ExternalCrmSyncChainResult } from "@/lib/external-crm/sync-chain"
import { hasFreshExternalCrmSyncData } from "@/lib/external-crm/sync-result"
import { expireSyncCacheTags, type SyncCacheTagBundle } from "@/lib/server/sync-cache-tags"

// NEO(외부 CRM) 동기화 체인이 끝난 뒤 다음 조회가 새 값을 받게 하는 캐시 즉시 만료 — 수동 버튼(app/api/admin/crm/external-sync)과
// 크론(app/api/cron/sync-external-crm)이 같은 규칙을 쓴다 (2026-11-23).
//
// 왜: 예전엔 두 경로가 따로 놀았다.
//  * 크론은 매출 태그만 "max"(오래됨 표시)로 걸고 NEO 고객·지역 지도 캐시는 아예 건드리지 않았다 — 아침 10시 크론이 돌아도
//    고객 목록·재연락 숫자는 다음 TTL(60초~300초) + 한 번 더(SWR) 옛 값이었다.
//  * 수동 버튼도 "max"라 버튼을 누른 직후 다시 불러온 화면(load({ force: true }))이 옛 값을 받았다("동기화가 안 된다").
//  * NEO 값을 품은 바깥 캐시(통합 고객·우선순위 큐·os-summary·CRM 개요)는 둘 다 만료하지 않았다.
// 이제 { expire: 0 } 으로 묶음 단위(lib/server/sync-cache-tags.ts neoSync·crmSourceLinks)로 만료한다.

/** 이번 체인 결과로 만료할 묶음. 새 데이터가 없으면(잠김·최근 결과 재사용·건너뜀·전부 실패) 아무것도 만료하지 않는다. */
export function externalCrmSyncCacheBundles(chain: ExternalCrmSyncChainResult): SyncCacheTagBundle[] {
  const bundles: SyncCacheTagBundle[] = []
  if (chain.neoCustomerSnapshots || hasFreshExternalCrmSyncData(chain.sync)) bundles.push("neoSync")
  const candidates = chain.candidates
  if (candidates && (candidates.insertedCandidates > 0 || candidates.autoConfirmed > 0)) bundles.push("crmSourceLinks")
  return bundles
}

/** 묶음을 즉시 만료하고 만료한 태그를 돌려준다(로그·테스트용). 만료 실패가 동기화 응답을 지우지 않게 삼킨다. */
export function expireExternalCrmSyncCaches(chain: ExternalCrmSyncChainResult): string[] {
  const bundles = externalCrmSyncCacheBundles(chain)
  if (bundles.length === 0) return []
  try {
    return expireSyncCacheTags(...bundles)
  } catch (error) {
    console.error("[external-crm sync-cache] cache expiry failed", error)
    return []
  }
}
