import "server-only"

import { unstable_cache, revalidateTag } from "next/cache"

import { ADMIN_CRM_REGION_MAP_CACHE_TAG } from "@/lib/admin/crm/cache-tags"
import { getCompassRegionRows } from "@/lib/compass/bridge"
import { deriveLeadRegionLabel } from "@/lib/crm/lead-message"
import { NAVER_MAP_SOURCE_OBJECT, NAVER_MAP_SOURCE_SYSTEM } from "@/lib/crm/naver-map-source"
import {
  emptyRegionTally,
  isIncompleteRegionMap,
  tallyDerivedRegion,
  tallyRegionValue,
  toRegionLayer,
  type CrmRegionCustomerItem,
  type CrmRegionLayer,
} from "@/lib/crm/region-map-summary"
import { KOREA_PROVINCE_LABELS, normalizeRegionLabel } from "@/lib/regions/korea-regions"
import { assertJsonSafeInDev } from "@/lib/server/json-safe"
import { shareInFlight } from "@/lib/server/share-in-flight"
import { createSupabaseAdminClient } from "@/lib/supabase/admin"
import {
  fetchSupabasePages,
  type SupabasePagedResult,
  type SupabasePageResult,
} from "@/lib/supabase/pagination"

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

/**
 * 원천별 전량 조회 상한(C9). 예전 단일 `.limit(5000)`은 PostgREST max-rows(1,000)에 조용히 잘려
 * 원천이 1,000행을 넘으면 앞 1,000행만 세고도 "전체"처럼 보였다. 이제 1,000행 range 페이지네이션
 * (lib/supabase/pagination — 실제 받은 행 수만큼 전진, 첫 페이지 count:"exact")으로 읽고, 이 상한을
 * 넘으면 레이어에 truncated 표시와 경고 문구를 싣는다. 상한은 Compass 지역 조회(getCompassRegionRows)와 같은 50,000행.
 */
export const REGION_MAP_SOURCE_ROW_LIMIT = 50_000
const REGION_MAP_PAGE_SIZE = 1_000

/** 새로고침(force)에서 원천이 하나라도 실패·절단되면 던지는 문구 — 화면은 최근 확인한 분포를 유지한다. */
const INCOMPLETE_REGION_MAP_MESSAGE = "지역 원천 조회가 제한되어 전체 분포를 확인하지 못했습니다."

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
  /** 메타 폼 답변(지역 칸) — deriveLeadRegionLabel 이 branch 다음으로 읽는다. */
  message: string | null
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

type RegionSourceRows<T> = SupabasePagedResult<T>

/**
 * 한 원천을 range 페이지네이션으로 읽는다. makeQuery는 유일 정렬 키(id 등 tie-breaker)까지 건
 * 쿼리를 새로 만들어야 한다 — 페이지 경계에서 순서가 흔들리면 행이 빠지거나 겹친다.
 */
function readRegionSource<T>(
  makeQuery: (withCount: boolean) => {
    range: (from: number, to: number) => PromiseLike<SupabasePageResult>
  }
): Promise<RegionSourceRows<T>> {
  return fetchSupabasePages<T>({
    fetchPage: (from, to) => makeQuery(from === 0).range(from, to),
    maxRows: REGION_MAP_SOURCE_ROW_LIMIT,
    pageSize: REGION_MAP_PAGE_SIZE,
  })
}

function sourceState<T>(result: RegionSourceRows<T>) {
  return {
    failed: Boolean(result.error),
    truncated: !result.error && result.truncated,
    rowLimit: REGION_MAP_SOURCE_ROW_LIMIT,
  }
}

async function buildCrmRegionMap(): Promise<CrmRegionMap> {
  const sb = createSupabaseAdminClient()
  const countOption = (withCount: boolean) => (withCount ? { count: "exact" as const } : undefined)

  const [deals, targets, leads, customers, compass] = await Promise.all([
    readRegionSource<DealRow>((withCount) =>
      sb
        .from("branch_rev_deals")
        .select("id,region,customer_name,manager,status,deal_type", countOption(withCount))
        .order("id", { ascending: true })
    ),
    readRegionSource<{ id: number; payload: unknown }>((withCount) =>
      sb
        .from("external_crm_records")
        .select("id,payload", countOption(withCount))
        .eq("source_system", NAVER_MAP_SOURCE_SYSTEM)
        .eq("object_api_key", NAVER_MAP_SOURCE_OBJECT)
        .eq("is_stale", false)
        .order("id", { ascending: true })
    ),
    // 리드층 지역은 통합 목록과 같은 deriveLeadRegionLabel(branch + message의 메타 폼 답변)로 정한다.
    readRegionSource<LeadRow>((withCount) =>
      sb
        .from("leads")
        .select("id,branch,message,name,org,assigned_to,status", countOption(withCount))
        .order("id", { ascending: true })
    ),
    // PK(source_system, account_id) 순으로 정렬해 페이지 경계를 고정한다.
    readRegionSource<CustomerRow>((withCount) =>
      sb
        .from("crm_neo_customer_snapshots")
        .select("source_system,account_id,region_label,account_name,owner_name", countOption(withCount))
        .eq("is_stale", false)
        .order("source_system", { ascending: true })
        .order("account_id", { ascending: true })
    ),
    getCompassRegionRows(),
  ])

  // 실패한 원천은 반쪽 행으로 세지 않는다(fetchSupabasePages는 오류 전까지 받은 행을 돌려준다).
  const rowsOf = <T>(result: RegionSourceRows<T>): T[] => (result.error ? [] : result.data)

  const ownerMap = new Map<string, { totalCount: number; regions: Record<string, number> }>()
  /** regionLabel 은 이미 시도로 해석된 값(없으면 null) — 레이어 집계와 같은 산식을 쓴다. */
  const recordOwner = (ownerName: string, regionLabel: string | null) => {
    const trimmed = ownerName.trim()
    if (!trimmed) return
    let stat = ownerMap.get(trimmed)
    if (!stat) {
      stat = { totalCount: 0, regions: {} }
      ownerMap.set(trimmed, stat)
    }
    stat.totalCount += 1
    if (regionLabel) {
      stat.regions[regionLabel] = (stat.regions[regionLabel] ?? 0) + 1
    }
  }
  const rawRegionLabel = (raw: string | null | undefined) => normalizeRegionLabel(raw?.trim())

  const dealAcc = emptyRegionTally()
  for (const row of rowsOf(deals)) {
    tallyRegionValue(dealAcc, row.region, {
      id: String(row.id),
      name: row.customer_name,
      manager: row.manager,
      status: row.status,
      detail: row.deal_type,
    })
    if (row.manager) recordOwner(row.manager, rawRegionLabel(row.region))
  }

  const targetAcc = emptyRegionTally()
  for (const row of rowsOf(targets)) {
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
  for (const row of rowsOf(leads)) {
    const leadName = row.org?.trim() || row.name?.trim() || null
    const derivedRegion = deriveLeadRegionLabel(row)
    tallyDerivedRegion(leadAcc, derivedRegion, row.branch, {
      id: String(row.id),
      name: leadName,
      manager: row.assigned_to,
      status: row.status,
    })
    if (row.assigned_to) recordOwner(row.assigned_to, derivedRegion)
  }

  const customerAcc = emptyRegionTally()
  for (const row of rowsOf(customers)) {
    tallyRegionValue(customerAcc, row.region_label, {
      id: row.account_id,
      name: row.account_name,
      manager: row.owner_name,
    })
    if (row.owner_name) recordOwner(row.owner_name, rawRegionLabel(row.region_label))
  }

  const compassAcc = emptyRegionTally()
  for (const row of compass.down ? [] : compass.rows) {
    const compName = row.academy?.trim() || row.name?.trim() || null
    tallyRegionValue(compassAcc, row.region, {
      id: String(row.id),
      name: compName,
      manager: row.owner,
    })
    if (row.owner) recordOwner(row.owner, rawRegionLabel(row.region))
  }

  const failedSources = [
    ...(
      [
        ["branch_rev_deals", deals],
        ["external_crm_records", targets],
        ["leads", leads],
        ["crm_neo_customer_snapshots", customers],
      ] as const
    )
      .filter(([, result]) => result.error)
      .map(([table, result]) => `${table}:${result.error?.code ?? "unknown"}`),
    ...(compass.down ? ["compass_leads_v:down"] : []),
  ]
  if (failedSources.length > 0) {
    // 원문 DB 오류는 싣지 않는다 — 표 이름과 코드만.
    console.error("[crm region map] partial source failure", failedSources)
  }

  const compassLayer = toRegionLayer(
    "compass",
    "Compass",
    "마케팅 리드 건수",
    compassAcc,
    ["Compass에 입력된 지역 기준. 자체 리드와 겹칠 수 있어 원천별 건수를 합산하지 않는다."],
    {
      failed: compass.down,
      truncated: !compass.down && Boolean(compass.truncated),
      rowLimit: REGION_MAP_SOURCE_ROW_LIMIT,
    }
  )
  const dealLayer = toRegionLayer(
    "deal",
    "거래",
    "REV 딜 건수",
    dealAcc,
    ["회계연도 전체 딜. 금액이 아니라 건수이며, 온라인·해외는 지역에서 제외한다."],
    sourceState(deals)
  )
  const targetLayer = toRegionLayer(
    "target",
    "타깃",
    "공유지도 저장 장소",
    targetAcc,
    ["팀이 직접 담은 영업 후보다. 계약 여부와 무관하다."],
    sourceState(targets)
  )
  const leadLayer = toRegionLayer(
    "lead",
    "리드",
    "유입 리드 건수",
    leadAcc,
    [
      "지역은 리드가 적은 지역 칸과 광고 폼 답변에서 읽는다(통합 고객 목록과 같은 규칙). 미기재가 절반을 넘는다.",
    ],
    sourceState(leads)
  )
  const customerLayer = toRegionLayer(
    "customer",
    "고객",
    "NEO 고객 계정",
    customerAcc,
    [
      "외부 CRM 계정에는 주소·지역 필드가 없다. 여기 찍힌 지역은 매출시트 이름 매칭으로 얻은 일부뿐이라, 이 레이어의 분포를 '고객 분포'로 읽으면 안 된다.",
    ],
    sourceState(customers)
  )

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

/** 원천 조회가 실패·절단된 지도는 정상 캐시에 넣지 않는다 — 이 오류로 감싸 unstable_cache 밖으로 꺼낸다. */
class DegradedCrmRegionMapError extends Error {
  readonly degradedRegionMap: CrmRegionMap
  constructor(value: CrmRegionMap) {
    super("crm region map: partial source failure (not cached)")
    this.name = "DegradedCrmRegionMapError"
    this.degradedRegionMap = value
  }
}

function degradedRegionMapOf(error: unknown): CrmRegionMap | null {
  if (error && typeof error === "object" && "degradedRegionMap" in error) {
    return (error as { degradedRegionMap: CrmRegionMap }).degradedRegionMap
  }
  return null
}

// 2026-09-10 3라운드(§3.3) — 이전엔 module-level `let cache`+`inFlight`로 손으로 구현한
// 60초 캐시+동시요청 합치기였다. 뜻은 같지만 process-local이라 Vercel Fluid 인스턴스마다
// 따로 논다 — unstable_cache(Data Cache)로 옮겨 인스턴스 간 공유되게 하고, 동시요청 합치기는
// shareInFlight로 대체한다(태그 상수를 그대로 in-flight 키로 쓴다 — 인자가 없는 계산이라
// crm-unified-customers.ts와 같은 관례).
const getCachedCrmRegionMap = unstable_cache(
  async () => {
    const value = await shareInFlight(ADMIN_CRM_REGION_MAP_CACHE_TAG, buildCrmRegionMap)
    // 일부 조회 실패·상한 도달을 정상 값으로 저장하지 않는다(던지면 unstable_cache가 저장하지 않는다) —
    // 이번 응답은 getCrmRegionMap이 꺼내 "모름"·"부분값" 표시와 함께 그대로 돌려주고, 다음 요청이 다시 읽는다.
    if (isIncompleteRegionMap(value)) throw new DegradedCrmRegionMapError(value)
    // unstable_cache는 JSON 직렬화 경계다 — 이 값은 문자열/숫자/배열뿐이라 통과해야 정상이고,
    // dev·test에서 위반 시 즉시 던져 잡는다(2026-09-04 우선순위 큐 500 사고 재발 방지).
    return assertJsonSafeInDev("admin-crm-region-map", value)
  },
  ["admin-crm-region-map-v3"],
  // 무효화는 부분적이다(§3.4 보고서 참고 — naver-map 재수집·NEO 동기화만 이 태그를 건드린다) —
  // REV 시트·리드 쓰기가 못 건드리는 동안은 TTL을 이전과 같은 60초로 유지한다.
  { revalidate: 60, tags: [ADMIN_CRM_REGION_MAP_CACHE_TAG] }
)

/**
 * 원천이 실패·절단됐을 때(isIncompleteRegionMap)의 두 경로:
 *  - force(?force=1): 던진다. 라우트가 500을 내고 화면은 "최근 확인한 분포를 유지"한다 — 부분 합계로 확인값을
 *    덮지 않는다. 패널(CrmRegionMapPanel regionMapRefreshUrl)은 화면에 완전한 분포가 떠 있을 때만 force를
 *    붙인다(새로고침·60초 갱신).
 *  - 캐시 경로: 첫 읽기, 그리고 지킬 확인값이 없을 때의 갱신(오류 화면의 '다시 시도'·60초 갱신, 부분 지도가 떠
 *    있을 때의 새로고침). 캐시에 넣지 않고, 실패 레이어는 "모름"·절단 레이어는 "부분값" 표시(failed·truncated·
 *    notes)를 단 지도를 그대로 돌려준다 — 라우트는 no-store로 내보내고 화면은 요청 캐시에 남기지 않는다.
 *    여기서도 던지면 원천 하나가 복구될 때까지 '다시 시도'가 오류 화면에 갇힌다.
 */
export async function getCrmRegionMap(options: { force?: boolean } = {}): Promise<CrmRegionMap> {
  if (options.force) {
    // 강제 새로고침 — 이번 응답은 캐시를 우회해 즉시 최신값을 만들고, 태그도 같이 무효화해
    // 다른 인스턴스의 다음 조회도 새로 계산하게 한다(우회만 하면 이번 응답 이후에도 다른
    // 인스턴스는 옛 Data Cache를 계속 본다).
    revalidateTag(ADMIN_CRM_REGION_MAP_CACHE_TAG, "max")
    const value = await buildCrmRegionMap()
    if (isIncompleteRegionMap(value)) throw new Error(INCOMPLETE_REGION_MAP_MESSAGE)
    return value
  }
  try {
    return await getCachedCrmRegionMap()
  } catch (error) {
    const degraded = degradedRegionMapOf(error)
    if (degraded) return degraded
    throw error
  }
}

// 지역 분포에 영향을 주는 원천이 바뀌면 호출한다. 현재 실제로 거는 곳은
// lib/repositories/crm-naver-map.ts의 importCrmNaverMapSource(지도 장소 재수집 —
// region_label을 다시 채운다)와 app/api/admin/crm/external-sync/route.ts(NEO 고객
// region_label 재계산)다. 리드 쓰기는 lib/repositories/leads.ts invalidateLeadReadCaches가
// 같은 태그를 직접 무효화한다(이 모듈을 import하면 순환이라 태그 상수만 쓴다).
// branch_rev_deals.region(REV 시트 동기화)·Compass 리드는 아직 배선하지 못했다 — 그 경로는
// TTL(60초)만으로 신선도를 맞춘다.
export function invalidateCrmRegionMapCache() {
  revalidateTag(ADMIN_CRM_REGION_MAP_CACHE_TAG, "max")
}
