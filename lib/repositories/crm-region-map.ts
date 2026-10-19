import "server-only"

import { unstable_cache, revalidateTag } from "next/cache"

import { ADMIN_CRM_REGION_MAP_CACHE_TAG } from "@/lib/admin/crm/cache-tags"
import { getCompassRegionRows } from "@/lib/compass/bridge"
import { fetchSupabasePages } from "@/lib/supabase/pagination"
import { NAVER_MAP_SOURCE_OBJECT, NAVER_MAP_SOURCE_SYSTEM } from "@/lib/crm/naver-map-source"
import {
  emptyRegionTally,
  tallyRegionValue,
  toRegionLayer,
  type CrmRegionCustomerItem,
  type CrmRegionLayer,
} from "@/lib/crm/region-map-summary"
import { KOREA_PROVINCE_LABELS } from "@/lib/regions/korea-regions"
import { normalizeRegionLabel } from "@/lib/regions/korea-regions"
import { assertJsonSafeInDev } from "@/lib/server/json-safe"
import { shareInFlight } from "@/lib/server/share-in-flight"
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

export type { CrmRegionCustomerItem, CrmRegionLayer, CrmRegionLayerKey } from "@/lib/crm/region-map-summary"

export interface CrmRegionOwnerStats {
  ownerName: string
  totalCount: number
  regions: Record<string, number>
}

export interface CrmRegionMap {
  generatedAt: string
  provinces: string[]
  layers: CrmRegionLayer[]
  topCustomersByRegion: Record<string, CrmRegionCustomerItem[]>
  ownerStats: Record<string, CrmRegionOwnerStats>
}

const ROW_LIMIT = 50_000

interface DealRow {
  id: number
  region: string | null
  customer_name?: string | null
  manager?: string | null
  status?: string | null
  deal_type?: string | null
}

interface LeadRow {
  id: number
  branch: string | null
  name?: string | null
  org?: string | null
  assigned_to?: string | null
  status?: string | null
}

interface CustomerRow {
  source_system: string
  account_id: string
  region_label: string | null
  account_name?: string | null
  owner_name?: string | null
}

async function buildCrmRegionMap(): Promise<CrmRegionMap> {
  const sb = createSupabaseAdminClient()

  const [deals, targets, leads, customers, compass] = await Promise.all([
    fetchSupabasePages<DealRow>({ maxRows: ROW_LIMIT, fetchPage: (from, to) =>
      sb.from("branch_rev_deals").select("id,region,customer_name,manager,status,deal_type", from === 0 ? { count: "exact" } : undefined).order("id").range(from, to) }),
    fetchSupabasePages<{ id: number; payload: unknown }>({ maxRows: ROW_LIMIT, fetchPage: (from, to) =>
      sb.from("external_crm_records").select("id,payload", from === 0 ? { count: "exact" } : undefined)
        .eq("source_system", NAVER_MAP_SOURCE_SYSTEM).eq("object_api_key", NAVER_MAP_SOURCE_OBJECT).eq("is_stale", false).order("id").range(from, to) }),
    fetchSupabasePages<LeadRow>({ maxRows: ROW_LIMIT, fetchPage: (from, to) =>
      sb.from("leads").select("id,branch,name,org,assigned_to,status", from === 0 ? { count: "exact" } : undefined).order("id").range(from, to) }),
    fetchSupabasePages<CustomerRow>({ maxRows: ROW_LIMIT, fetchPage: (from, to) =>
      sb.from("crm_neo_customer_snapshots").select("source_system,account_id,region_label,account_name,owner_name", from === 0 ? { count: "exact" } : undefined)
        .eq("is_stale", false).order("source_system").order("account_id").range(from, to) }),
    getCompassRegionRows(),
  ])
  // 일부 조회 실패·상한 도달을 정상 0으로 저장하지 않는다. UI는 최근 확인한 값을 유지한다.
  if ([deals, targets, leads, customers].some(result => result.error || result.truncated)
    || compass.down || compass.truncated) throw new Error("지역 원천 조회가 제한되어 전체 분포를 확인하지 못했습니다.")

  const ownerMap = new Map<string, { totalCount: number; regions: Record<string, number> }>()
  const recordOwner = (ownerName: string, rawRegion: string | null | undefined) => {
    const trimmed = ownerName.trim()
    if (!trimmed) return
    const norm = normalizeRegionLabel(rawRegion?.trim())
    let stat = ownerMap.get(trimmed)
    if (!stat) {
      stat = { totalCount: 0, regions: {} }
      ownerMap.set(trimmed, stat)
    }
    stat.totalCount += 1
    if (norm) {
      stat.regions[norm] = (stat.regions[norm] ?? 0) + 1
    }
  }

  const dealAcc = emptyRegionTally()
  for (const row of deals.data) {
    tallyRegionValue(dealAcc, row.region, {
      id: String(row.id),
      name: row.customer_name,
      manager: row.manager,
      status: row.status,
      detail: row.deal_type,
    })
    if (row.manager) recordOwner(row.manager, row.region)
  }

  const targetAcc = emptyRegionTally()
  for (const row of targets.data) {
    const payload = (row.payload ?? {}) as Record<string, unknown>
    const region = typeof payload.region_label === "string" ? payload.region_label : null
    const name = (typeof payload.title === "string" ? payload.title : null) ||
                 (typeof payload.name === "string" ? payload.name : null) ||
                 (typeof payload.place_name === "string" ? payload.place_name : null)
    tallyRegionValue(targetAcc, region, {
      id: String(row.id),
      name,
    })
  }

  const leadAcc = emptyRegionTally()
  for (const row of leads.data) {
    const leadName = row.org?.trim() || row.name?.trim() || null
    tallyRegionValue(leadAcc, row.branch, {
      id: String(row.id),
      name: leadName,
      manager: row.assigned_to,
      status: row.status,
    })
    if (row.assigned_to) recordOwner(row.assigned_to, row.branch)
  }

  const customerAcc = emptyRegionTally()
  for (const row of customers.data) {
    tallyRegionValue(customerAcc, row.region_label, {
      id: row.account_id,
      name: row.account_name,
      manager: row.owner_name,
    })
    if (row.owner_name) recordOwner(row.owner_name, row.region_label)
  }

  const compassAcc = emptyRegionTally()
  for (const row of compass.rows) {
    const compName = row.academy?.trim() || row.name?.trim() || null
    tallyRegionValue(compassAcc, row.region, {
      id: String(row.id),
      name: compName,
      manager: row.owner,
    })
    if (row.owner) recordOwner(row.owner, row.region)
  }

  const compassLayer = toRegionLayer("compass", "Compass", "마케팅 리드 건수", compassAcc, [
    "Compass에 입력된 지역 기준. 자체 리드와 겹칠 수 있어 원천별 건수를 합산하지 않는다.",
  ])
  const dealLayer = toRegionLayer("deal", "거래", "REV 딜 건수", dealAcc, [
    "회계연도 전체 딜. 금액이 아니라 건수이며, 온라인·해외는 지역에서 제외한다.",
  ])
  const targetLayer = toRegionLayer("target", "타깃", "공유지도 저장 장소", targetAcc, [
    "팀이 직접 담은 영업 후보다. 계약 여부와 무관하다.",
  ])
  const leadLayer = toRegionLayer("lead", "리드", "유입 리드 건수", leadAcc, [
    "지역은 리드가 직접 적은 자유 텍스트다. 미기재가 절반을 넘는다.",
  ])
  const customerLayer = toRegionLayer("customer", "고객", "NEO 고객 계정", customerAcc, [
    "외부 CRM 계정에는 주소·지역 필드가 없다. 여기 찍힌 지역은 매출시트 이름 매칭으로 얻은 일부뿐이라, 이 레이어의 분포를 '고객 분포'로 읽으면 안 된다.",
  ])

  // 시도별 종합 상위 고객 순위 (거래 실적 고객 우선, 리드/고객 보강)
  const topCustomersByRegion: Record<string, CrmRegionCustomerItem[]> = {}
  for (const province of KOREA_PROVINCE_LABELS) {
    const dealItems = dealLayer.topCustomersByRegion?.[province] ?? []
    const leadItems = leadLayer.topCustomersByRegion?.[province] ?? []
    const customerItems = customerLayer.topCustomersByRegion?.[province] ?? []

    const merged = new Map<string, CrmRegionCustomerItem>()
    for (const item of dealItems) merged.set(item.name, item)
    for (const item of leadItems) {
      if (!merged.has(item.name)) merged.set(item.name, item)
    }
    for (const item of customerItems) {
      if (!merged.has(item.name)) merged.set(item.name, item)
    }
    const sorted = Array.from(merged.values()).slice(0, 15)
    if (sorted.length > 0) {
      topCustomersByRegion[province] = sorted
    }
  }

  const ownerStats: Record<string, CrmRegionOwnerStats> = {}
  for (const [ownerName, stat] of ownerMap.entries()) {
    ownerStats[ownerName] = {
      ownerName,
      totalCount: stat.totalCount,
      regions: stat.regions,
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    provinces: KOREA_PROVINCE_LABELS,
    layers: [compassLayer, dealLayer, targetLayer, leadLayer, customerLayer],
    topCustomersByRegion,
    ownerStats,
  }
}

// 2026-09-10 3라운드(§3.3) — unstable_cache(Data Cache)로 옮겨 인스턴스 간 공유되게 하고,
// 동시요청 합치기는 shareInFlight로 대체한다.
const getCachedCrmRegionMap = unstable_cache(
  async () => {
    const value = await shareInFlight(ADMIN_CRM_REGION_MAP_CACHE_TAG, buildCrmRegionMap)
    return assertJsonSafeInDev("admin-crm-region-map", value)
  },
  ["admin-crm-region-map-v3"],
  { revalidate: 60, tags: [ADMIN_CRM_REGION_MAP_CACHE_TAG] }
)

export async function getCrmRegionMap(options: { force?: boolean } = {}): Promise<CrmRegionMap> {
  if (options.force) {
    revalidateTag(ADMIN_CRM_REGION_MAP_CACHE_TAG, "max")
    return buildCrmRegionMap()
  }
  return getCachedCrmRegionMap()
}

export function invalidateCrmRegionMapCache() {
  revalidateTag(ADMIN_CRM_REGION_MAP_CACHE_TAG, "max")
}
