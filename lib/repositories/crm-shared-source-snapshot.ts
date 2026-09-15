import "server-only"

import { shareInFlight } from "@/lib/server/share-in-flight"
import { getNeoCrmCustomers, type NeoCrmCustomerRow } from "@/lib/admin-crm-customers-neo"
import { getLeads, type LeadRecord } from "@/lib/repositories/leads"
import { getLeadsActivitySummary, type LeadActivityBadge } from "@/lib/repositories/lead-activity"
import {
  EMPTY_COMPASS_DEMO_SOURCE,
  serializeCompassDemoSource,
  type CompassDemoSourceJson,
} from "@/lib/crm/compass-demo-signal"
import { loadCompassDemoSource } from "@/lib/crm/compass-demo-source"

/**
 * CRM 홈의 두 소비자(통합 고객DB·우선순위 큐)가 공유하는 "원본 소스" 수집 —
 * leads·NEO 고객·참여 신호(getLeadsActivitySummary)·Compass 데모.
 *
 * 2026-09-07 감사 #7: crm-unified-customers.ts와 crm-priority-queue.ts가 각자 독립
 * unstable_cache(60초)로 이 넷을 따로 Promise.allSettled 수집해, 콜드 인스턴스에서 같은
 * 원본을 두 번 모았다 — 특히 loadCompassDemoSource는 스스로 캐시하지 않는다(그 파일 상단
 * 주석: "호출부는 이미 소스 스냅샷을 60초 캐시한다 — 여기서 또 캐시하지 않는다"는 전제가
 * "호출부가 하나"일 때만 성립했다). getLeads()/getNeoCrmCustomers()/getLeadsActivitySummary()는
 * 이미 각자 자체 인스턴스 메모(leads.ts 30초·admin-crm-customers-neo.ts 60초·
 * lead-activity.ts 45초 — 세 번째는 바로 이 "두 소비자가 따로 부른다" 문제를 이미 한 번
 * 겪고 고친 선례다)가 있어 그 세 개는 이 계층이 없어도 대개 중복이 흡수되지만, Compass
 * 브리지 호출은 그런 보호가 전혀 없었다.
 *
 * 이 모듈은 스스로 unstable_cache를 걸지 않는다. 두 소비자 각각의 기존 unstable_cache
 * 배선(캐시 키·태그·완전성 판정)은 캐시 배선 계약 테스트로 고정돼 있어
 * (tests/crm/crm-unified-customers-snapshot-cache.test.ts,
 * tests/repositories/crm-priority-queue-snapshot-cache.test.ts — 후자는 growth-crm 소유라
 * 이 작업에서 손댈 수 없다) 그대로 두고, "그 캐시 콜백 안에서" 이 함수를 불러 쓰게 만드는
 * 합성 방식을 택했다. 대신 shareInFlight로 "같은 인스턴스에서 두 소비자가 동시에 모두
 * 미스"하는 드문 경합만 한 번으로 합친다.
 *
 * unstable_cache(JSON 직렬화) 경계를 통과할 값이라 Map을 그대로 들고 있으면 안 된다
 * (2026-09-04 우선순위 큐 500 사고 — demoSource를 Map째 캐시에 넣었다가 적중 뒤 깨졌다).
 * demoSource는 여기서도 serializeCompassDemoSource로 미리 배열 형태로 접어 반환하고,
 * shareInFlight 자체도 결과를 assertJsonSafeInDev로 한 번 더 검사한다.
 */
export interface CrmCoreSourceSnapshot {
  leads: LeadRecord[]
  leadsOk: boolean
  neoRows: NeoCrmCustomerRow[]
  neoAccountsOk: boolean
  neoLatestSyncedAt: string | null
  neoIsShroffAccountStale: boolean
  engagements: Record<string, LeadActivityBadge> | null
  /** Data Cache(JSON) 경계용 배열 형태 — 읽는 쪽이 hydrateCompassDemoSource로 되돌린다. */
  demoSource: CompassDemoSourceJson
  /** leads·NEO 둘 다 성공했는지 — 소비자마다 자기 소스까지 더해 완전성을 다시 판정한다. */
  complete: boolean
}

const CRM_CORE_SNAPSHOT_INFLIGHT_KEY = "crm-core-source-snapshot"

async function collectCrmCoreSourceSnapshot(): Promise<CrmCoreSourceSnapshot> {
  let leadsOk = true
  let neoAccountsOk = true

  const [leadResult, neoResult, engagementResult] = await Promise.allSettled([
    getLeads(),
    getNeoCrmCustomers(),
    getLeadsActivitySummary(),
  ])

  let leads: LeadRecord[] = []
  if (leadResult.status === "fulfilled") {
    leads = leadResult.value
  } else {
    leadsOk = false
  }

  let neoRows: NeoCrmCustomerRow[] = []
  let neoLatestSyncedAt: string | null = null
  let neoIsShroffAccountStale = true
  if (neoResult.status === "fulfilled" && neoResult.value.ok) {
    neoRows = neoResult.value.rows
    // syncHealth/latestSyncedAt는 옵셔널 체이닝으로 방어한다 — 우선순위 큐 쪽 테스트 목이
    // { ok, rows } 최소 형태만 준다(tests/repositories/crm-priority-queue-snapshot-cache.test.ts,
    // 이 작업 범위 밖 파일이라 목을 못 넓힌다). 값이 없으면 "신선도 미확인"으로 보수적으로 다룬다.
    neoLatestSyncedAt = neoResult.value.latestSyncedAt ?? null
    neoIsShroffAccountStale = neoResult.value.syncHealth?.isShroffAccountStale ?? true
  } else {
    neoAccountsOk = false
  }

  // 보조 지표(참여 신호)는 실패해도 조용히 빈 값으로 빠진다 — 두 소비자 모두 이 규약을 쓴다.
  const engagements = engagementResult.status === "fulfilled" ? engagementResult.value : null

  // Compass 데모 — 우리 쪽 전화 목록을 입력으로 받으므로 위 수집 뒤 한 번만 간다
  // (통합 고객DB·우선순위 큐가 독립적으로 두 번 부르던 걸 여기서 합친다).
  const demoSource = await loadCompassDemoSource([
    ...leads.map((lead) => lead.phone),
    ...neoRows.map((row) => row.phone),
  ]).catch(() => ({ ...EMPTY_COMPASS_DEMO_SOURCE, down: true }))

  return {
    leads,
    leadsOk,
    neoRows,
    neoAccountsOk,
    neoLatestSyncedAt,
    neoIsShroffAccountStale,
    engagements,
    demoSource: serializeCompassDemoSource(demoSource),
    complete: leadsOk && neoAccountsOk,
  }
}

/**
 * 공유 원본 스냅샷 — 호출부(crm-unified-customers.ts·crm-priority-queue.ts)의 기존
 * unstable_cache 콜백 "안에서" 부른다(스스로 캐시하지 않음, 위 설명 참고).
 */
export async function getCrmCoreSourceSnapshot(): Promise<CrmCoreSourceSnapshot> {
  return shareInFlight(CRM_CORE_SNAPSHOT_INFLIGHT_KEY, collectCrmCoreSourceSnapshot)
}
