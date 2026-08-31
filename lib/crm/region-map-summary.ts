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

export type CrmRegionLayerKey = "deal" | "target" | "lead" | "customer"

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
}

// 지리적이지 않은 정당한 값. REV 시트가 실제로 쓰는 표기다.
const NON_GEO_TOKENS = new Set(["온라인", "해외", "online", "overseas"])

export interface RegionTally {
  total: number
  located: number
  unknown: number
  nonGeo: number
  regions: Record<string, number>
}

export function emptyRegionTally(): RegionTally {
  return { total: 0, located: 0, unknown: 0, nonGeo: 0, regions: {} }
}

export function tallyRegionValue(tally: RegionTally, raw: string | null | undefined) {
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
  }
}
