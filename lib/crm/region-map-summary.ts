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
  /** 원천 행이 조회 상한을 넘어 일부만 셌다(C9). 구 응답에는 없다. */
  truncated?: boolean
  /** 원천 조회가 실패했다 — total 0은 "0건"이 아니라 "모름"이다. 구 응답에는 없다. */
  failed?: boolean
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

/**
 * 이미 시도 라벨로 해석된 값을 센다(C9 — 리드층). 리드의 지역은 통합 고객 목록·360·리드 드로어가
 * 쓰는 deriveLeadRegionLabel(branch + 메타 폼 답변 + 영문 도시명)로 정한다. 지도가 leads.branch만
 * 자유 텍스트로 접으면 같은 리드가 목록에선 "서울", 지도에선 "미상"으로 갈렸다.
 * 해석 실패(null)일 때만 원문으로 온라인·해외(nonGeo)와 미상(unknown)을 가른다.
 */
export function tallyDerivedRegion(
  tally: RegionTally,
  derivedLabel: string | null | undefined,
  raw: string | null | undefined
) {
  tally.total += 1
  if (derivedLabel) {
    tally.located += 1
    tally.regions[derivedLabel] = (tally.regions[derivedLabel] ?? 0) + 1
    return
  }
  const trimmed = raw?.trim() ?? ""
  if (trimmed && NON_GEO_TOKENS.has(trimmed.toLowerCase())) {
    tally.nonGeo += 1
    return
  }
  tally.unknown += 1
}

export interface RegionLayerSourceState {
  /** 원천 행이 조회 상한을 넘었다 — 일부만 셌다. */
  truncated?: boolean
  /** 원천 조회 실패 — 세지 못했다. */
  failed?: boolean
  /** truncated일 때 문구에 쓸 상한(행). */
  rowLimit?: number
}

export function toRegionLayer(
  key: CrmRegionLayerKey,
  label: string,
  unit: string,
  tally: RegionTally,
  notes: string[] = [],
  state: RegionLayerSourceState = {}
): CrmRegionLayer {
  const stateNotes: string[] = []
  if (state.failed) {
    stateNotes.push("이 레이어의 원천을 읽지 못했다 — 표시된 0건은 실제 0건이 아니라 '모름'이다.")
  } else if (state.truncated) {
    stateNotes.push(
      `원천 행이 조회 상한${state.rowLimit ? `(${state.rowLimit.toLocaleString("ko-KR")}행)` : ""}을 넘어 일부만 셌다 — 분포·커버리지는 부분값이다.`
    )
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
    // 상태 경고가 먼저 — 화면이 notes를 위에서부터 읽으므로 "부분값/모름"을 원천 설명보다 앞에 둔다.
    notes: [...stateNotes, ...notes],
    ...(state.truncated ? { truncated: true } : {}),
    ...(state.failed ? { failed: true } : {}),
  }
}
