import "server-only"

import { NAVER_MAP_SOURCE_OBJECT, NAVER_MAP_SOURCE_SYSTEM } from "@/lib/crm/naver-map-source"
import {
  emptyRegionTally,
  tallyRegionValue,
  toRegionLayer,
  type CrmRegionLayer,
} from "@/lib/crm/region-map-summary"
import { KOREA_PROVINCE_LABELS } from "@/lib/regions/korea-regions"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"

/**
 * CRM 지역 지도 — 시도(17개) 단위 분포의 단일 집계 경로.
 *
 * 레이어를 넷으로 나눈 이유는 지역 커버리지가 원천마다 완전히 다르기 때문이다(2026-08-28 실측).
 *  - 거래(REV 딜)    386건 중 지역 확보 86% — 지도로 그릴 만하다
 *  - 타깃(공유지도)  199곳 중 100%          — 지도로 그릴 만하다
 *  - 리드            231건 중 35%           — 절반 이상이 지역 미기재
 *  - 고객(NEO)       884건 중 13%           — **구조적으로 채울 수 없다.**
 *      xiaoshouyi account payload에 주소·지역 필드 자체가 없고(키: id/phone/ownerId/
 *      createdAt/updatedAt/entityType/accountName), 지금 채워진 값은 REV 시트 이름 매칭
 *      힌트뿐이다. 전화 지역번호로 보강해도 천장이 19%다(전화의 85%가 휴대폰).
 *
 * 그래서 이 집계는 레이어마다 `located / unknown / coverage`를 **항상 함께** 돌려준다.
 * 지도를 색칠할 때 분모를 숨기면 "우리 고객은 서울에 몰려 있다"가 아니라
 * "우리는 고객 위치를 모른다"인 상황을 정반대로 읽게 된다.
 *
 * 금액은 싣지 않는다. REV 금액 축은 회계연도·통화·중복계상 규칙(dsh-derive)이 따로 있어
 * 여기서 다시 유도하면 장부와 어긋난 두 번째 진실을 만든다. 이 화면은 건수 분포만 본다.
 */

export type { CrmRegionLayer, CrmRegionLayerKey } from "@/lib/crm/region-map-summary"

export interface CrmRegionMap {
  generatedAt: string
  provinces: string[]
  layers: CrmRegionLayer[]
}

const CACHE_TTL_MS = 60_000
const ROW_LIMIT = 5_000

let cache: { savedAt: number; value: CrmRegionMap } | null = null
let inFlight: Promise<CrmRegionMap> | null = null

async function buildCrmRegionMap(): Promise<CrmRegionMap> {
  const sb = createSupabaseAdminClient()

  const [deals, targets, leads, customers] = await Promise.all([
    sb.from("branch_rev_deals").select("region").limit(ROW_LIMIT),
    sb
      .from("external_crm_records")
      .select("payload")
      .eq("source_system", NAVER_MAP_SOURCE_SYSTEM)
      .eq("object_api_key", NAVER_MAP_SOURCE_OBJECT)
      .eq("is_stale", false)
      .limit(ROW_LIMIT),
    sb.from("leads").select("branch").limit(ROW_LIMIT),
    sb.from("crm_neo_customer_snapshots").select("region_label").eq("is_stale", false).limit(ROW_LIMIT),
  ])

  const dealAcc = emptyRegionTally()
  for (const row of deals.data ?? []) tallyRegionValue(dealAcc, row.region)

  const targetAcc = emptyRegionTally()
  for (const row of targets.data ?? []) {
    const payload = (row.payload ?? {}) as Record<string, unknown>
    const region = typeof payload.region_label === "string" ? payload.region_label : null
    tallyRegionValue(targetAcc, region)
  }

  const leadAcc = emptyRegionTally()
  for (const row of leads.data ?? []) tallyRegionValue(leadAcc, row.branch)

  const customerAcc = emptyRegionTally()
  for (const row of customers.data ?? []) tallyRegionValue(customerAcc, row.region_label)

  const errors = [deals.error, targets.error, leads.error, customers.error].filter(Boolean)
  if (errors.length > 0) {
    console.error("[crm region map] partial source failure", errors.map((e) => e?.message))
  }

  return {
    generatedAt: new Date().toISOString(),
    provinces: KOREA_PROVINCE_LABELS,
    layers: [
      toRegionLayer("deal", "거래", "REV 딜 건수", dealAcc, [
        "회계연도 전체 딜. 금액이 아니라 건수이며, 온라인·해외는 지역에서 제외한다.",
      ]),
      toRegionLayer("target", "타깃", "공유지도 저장 장소", targetAcc, [
        "팀이 직접 담은 영업 후보다. 계약 여부와 무관하다.",
      ]),
      toRegionLayer("lead", "리드", "유입 리드 건수", leadAcc, [
        "지역은 리드가 직접 적은 자유 텍스트다. 미기재가 절반을 넘는다.",
      ]),
      toRegionLayer("customer", "고객", "NEO 고객 계정", customerAcc, [
        "외부 CRM 계정에는 주소·지역 필드가 없다. 여기 찍힌 지역은 매출시트 이름 매칭으로 얻은 일부뿐이라, 이 레이어의 분포를 '고객 분포'로 읽으면 안 된다.",
      ]),
    ],
  }
}

export async function getCrmRegionMap(options: { force?: boolean } = {}): Promise<CrmRegionMap> {
  if (options.force) {
    cache = null
    inFlight = null
  }
  if (cache && Date.now() - cache.savedAt < CACHE_TTL_MS) return cache.value
  if (inFlight) return inFlight

  const request = buildCrmRegionMap()
  inFlight = request
  try {
    const value = await request
    cache = { savedAt: Date.now(), value }
    return value
  } finally {
    if (inFlight === request) inFlight = null
  }
}
