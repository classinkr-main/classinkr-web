import { normalizeRegionLabel } from "@/lib/regions/korea-regions"

/**
 * CRM 지역 지도의 집계 규칙(순수 함수).
 *
 * 저장소(lib/repositories/crm-region-map.ts)에서 분리해 둔 이유는, 이 화면의 정직성이
 * 전적으로 여기 세 갈래 분류에 달려 있기 때문이다.
 *
 *  - located : 17개 시도 중 하나로 접힌 건
 *  - nonGeo  : 지리적이지 않은 **정당한** 값(온라인·해외). 미상이 아니다.
 *  - unknown : 지역을 알 수 없는 건
 *
 * nonGeo를 unknown에 섞으면 "온라인 거래 52건"이 "지역 미상 52건"으로 둔갑해 커버리지가
 * 실제보다 나빠 보이고, 반대로 located에 섞으면 지도에 찍을 수 없는 건을 분포에 넣게 된다.
 */

export type CrmRegionLayerKey = "deal" | "target" | "lead" | "customer" | "compass"

export interface CrmRegionCustomerItem {
  id: string
  name: string
  region: string
  source: CrmRegionLayerKey
  count: number
  manager: string | null
  status: string | null
  detail?: string | null
}

export interface CrmRegionLayer {
  key: CrmRegionLayerKey
  label: string
  /** 화면에서 이 레이어가 무엇을 세는지 한 줄로 밝힌다. */
  unit: string
  total: number
  located: number
  unknown: number
  nonGeo: number
  /** located / total. total이 0이면 0. */
  coverage: number
  /** 시도 라벨 → 건수. 값이 0인 시도는 담지 않는다. */
  regions: Record<string, number>
  /** 이 레이어에 대해 화면이 반드시 함께 보여줘야 하는 경고(없으면 빈 배열). */
  notes: string[]
  /** 시도별 상위 고객 목록 */
  topCustomersByRegion?: Record<string, CrmRegionCustomerItem[]>
  /** 담당자 범위도 같은 원천의 전체 행에서 집계한다. */
  ownerLayers?: Record<string, CrmRegionLayer>
}

export interface RegionCustomerRecord {
  id?: string
  name?: string | null
  manager?: string | null
  status?: string | null
  detail?: string | null
}

// 지리적이지 않은 정당한 값. REV 시트가 실제로 쓰는 표기다.
const NON_GEO_TOKENS = new Set(["온라인", "해외", "online", "overseas"])

export interface RegionTally {
  total: number
  located: number
  unknown: number
  nonGeo: number
  regions: Record<string, number>
  customersByRegion?: Record<string, Map<string, { count: number; record: RegionCustomerRecord }>>
  ownerTallies?: Record<string, RegionTally>
}

export function emptyRegionTally(): RegionTally {
  return {
    total: 0,
    located: 0,
    unknown: 0,
    nonGeo: 0,
    regions: {},
    customersByRegion: {},
  }
}

export function tallyRegionValue(
  tally: RegionTally,
  raw: string | null | undefined,
  customer?: RegionCustomerRecord
) {
  addRegionValue(tally, raw, customer)
  const ownerKey = customer?.manager?.trim().toLowerCase()
  if (ownerKey) {
    tally.ownerTallies ??= Object.create(null) as Record<string, RegionTally>
    const ownerTally = tally.ownerTallies[ownerKey] ??= emptyRegionTally()
    addRegionValue(ownerTally, raw, customer)
  }
}

function addRegionValue(tally: RegionTally, raw: string | null | undefined, customer?: RegionCustomerRecord) {
  tally.total += 1
  const trimmed = raw?.trim() ?? ""
  if (trimmed && NON_GEO_TOKENS.has(trimmed.toLowerCase())) {
    tally.nonGeo += 1
    return
  }
  const label = normalizeRegionLabel(trimmed)
  if (!label) {
    tally.unknown += 1
    return
  }
  tally.located += 1
  tally.regions[label] = (tally.regions[label] ?? 0) + 1

  if (customer && customer.name && customer.name.trim()) {
    const custName = customer.name.trim()
    if (!tally.customersByRegion) {
      tally.customersByRegion = {}
    }
    if (!tally.customersByRegion[label]) {
      tally.customersByRegion[label] = new Map()
    }
    const map = tally.customersByRegion[label]
    const existing = map.get(custName)
    if (existing) {
      existing.count += 1
      if (!existing.record.manager && customer.manager) existing.record.manager = customer.manager
      if (!existing.record.status && customer.status) existing.record.status = customer.status
      if (!existing.record.detail && customer.detail) existing.record.detail = customer.detail
    } else {
      map.set(custName, {
        count: 1,
        record: {
          id: customer.id ?? custName,
          name: custName,
          manager: customer.manager ?? null,
          status: customer.status ?? null,
          detail: customer.detail ?? null,
        },
      })
    }
  }
}

/** 자유 텍스트 지역값 목록을 한 번에 접는다. */
export function tallyRegionValues(values: ReadonlyArray<string | null | undefined>): RegionTally {
  const tally = emptyRegionTally()
  for (const value of values) tallyRegionValue(tally, value)
  return tally
}

export function toRegionLayer(
  key: CrmRegionLayerKey,
  label: string,
  unit: string,
  tally: RegionTally,
  notes: string[] = []
): CrmRegionLayer {
  const topCustomersByRegion: Record<string, CrmRegionCustomerItem[]> = {}
  if (tally.customersByRegion) {
    for (const [region, map] of Object.entries(tally.customersByRegion)) {
      const sorted = Array.from(map.values())
        .sort((a, b) => b.count - a.count || a.record.name!.localeCompare(b.record.name!, "ko"))
        .slice(0, 15)
        .map(({ count, record }) => ({
          id: record.id || record.name!,
          name: record.name!,
          region,
          source: key,
          count,
          manager: record.manager ?? null,
          status: record.status ?? null,
          detail: record.detail ?? null,
        }))
      if (sorted.length > 0) {
        topCustomersByRegion[region] = sorted
      }
    }
  }

  return {
    key,
    label,
    unit,
    total: tally.total,
    located: tally.located,
    unknown: tally.unknown,
    nonGeo: tally.nonGeo,
    coverage: tally.total === 0 ? 0 : tally.located / tally.total,
    regions: tally.regions,
    notes,
    topCustomersByRegion,
    ...(tally.ownerTallies ? { ownerLayers: Object.fromEntries(Object.entries(tally.ownerTallies)
      .map(([owner, ownerTally]) => [owner, toRegionLayer(key, label, unit, ownerTally, notes)])) } : {}),
  }
}

/** 필터에 맞는 행이 없으면 빈 범위다. 다른 담당자·원천으로 폴백하지 않는다. */
export function scopeRegionLayer(layer: CrmRegionLayer, ownerNames: readonly string[] | null): CrmRegionLayer {
  if (ownerNames === null) return layer
  const keys = new Set(ownerNames.map(name => name.trim().toLowerCase()).filter(Boolean))
  const scoped = toRegionLayer(layer.key, layer.label, layer.unit, emptyRegionTally(), layer.notes)
  const customers = new Map<string, CrmRegionCustomerItem>()
  for (const key of keys) {
    const owner = Object.hasOwn(layer.ownerLayers ?? {}, key) ? layer.ownerLayers?.[key] : undefined
    if (!owner) continue
    scoped.total += owner.total
    scoped.located += owner.located
    scoped.unknown += owner.unknown
    scoped.nonGeo += owner.nonGeo
    for (const [region, count] of Object.entries(owner.regions)) scoped.regions[region] = (scoped.regions[region] ?? 0) + count
    for (const rows of Object.values(owner.topCustomersByRegion ?? {})) for (const row of rows) {
      const customerKey = `${row.region}:${row.name}`
      const previous = customers.get(customerKey)
      customers.set(customerKey, previous ? { ...previous, count: previous.count + row.count } : { ...row })
    }
  }
  scoped.coverage = scoped.total ? scoped.located / scoped.total : 0
  for (const row of [...customers.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ko"))) {
    const rows = scoped.topCustomersByRegion![row.region] ??= []
    if (rows.length < 15) rows.push(row)
  }
  return scoped
}
