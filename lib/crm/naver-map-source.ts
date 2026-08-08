import { scoreCrmEntityMatch } from "@/lib/crm-source-linking"
import { deriveCustomerRegion, REGION_UNSPECIFIED } from "@/lib/crm/region-label"

export const NAVER_MAP_SOURCE_SYSTEM = "naver_shared_map"
export const NAVER_MAP_SOURCE_OBJECT = "saved_place"

export interface NaverMapPlaceInput {
  name: string
  category?: string | null
  address: string
}

export interface NaverMapRegionLabels {
  provinceRaw: string | null
  regionLabel: string
  localityLabel: string | null
  source: "address" | "unspecified"
}

export type NaverMapMatchTargetSource = "neo" | "customer" | "lead" | "partner" | "rev"

export interface NaverMapMatchTarget {
  source: NaverMapMatchTargetSource
  targetType: "external_account" | "customer" | "lead" | "partner_account" | "rev_deal"
  targetId: string
  label: string
  regionLabel?: string | null
}

export interface NaverMapMatchCandidate extends NaverMapMatchTarget {
  confidence: number
  strategy: "exact" | "contains" | "alias" | "owner_name" | "token_overlap" | "char_overlap"
  sameRegion: boolean
  evidence: string[]
}

export type NaverMapMatchStatus = "linked" | "prelinked" | "review" | "unmatched"

export interface NaverMapMatchAssessment {
  status: Exclude<NaverMapMatchStatus, "linked">
  candidate: NaverMapMatchCandidate | null
  revEvidence: NaverMapMatchCandidate | null
  confidenceGap: number | null
}

const GWANGJU_DISTRICTS_IN_COMBINED_LABEL = new Set(["광산구", "동구", "서구", "남구", "북구"])
const ADMINISTRATIVE_TOKEN_RE = /(?:특별자치시|특별자치도|광역시|특별시|도|시|군|구|읍|면)$/
const DETAIL_TOKEN_RE = /(?:동|리|가)$/

function cleanPlaceValue(value: unknown) {
  return typeof value === "string" ? value.trim() : ""
}

export function normalizeNaverMapPlace(input: NaverMapPlaceInput): NaverMapPlaceInput | null {
  const name = cleanPlaceValue(input.name)
  const address = cleanPlaceValue(input.address)
  if (!name || !address) return null

  return {
    name,
    category: cleanPlaceValue(input.category) || null,
    address,
  }
}

function deriveLocalityLabel(tokens: string[]) {
  const locality: string[] = []
  for (const token of tokens.slice(1)) {
    if (ADMINISTRATIVE_TOKEN_RE.test(token)) {
      locality.push(token)
      if (locality.length === 2) break
      continue
    }
    if (locality.length > 0) break
    if (DETAIL_TOKEN_RE.test(token)) {
      locality.push(token)
      break
    }
    break
  }
  return locality.join(" ") || null
}

export function deriveNaverMapRegion(address: string | null | undefined): NaverMapRegionLabels {
  const normalizedAddress = cleanPlaceValue(address)
  if (!normalizedAddress) {
    return {
      provinceRaw: null,
      regionLabel: REGION_UNSPECIFIED,
      localityLabel: null,
      source: "unspecified",
    }
  }

  const tokens = normalizedAddress.split(/\s+/).filter(Boolean)
  const provinceRaw = tokens[0] ?? null
  let regionLabel: string

  // 네이버가 전남·광주 통합 표기를 반환하는 주소는 두 번째 행정 토큰으로
  // 기존 17개 시도 SSOT에 보수적으로 되돌린다.
  if (provinceRaw?.includes("전남광주통합")) {
    regionLabel = GWANGJU_DISTRICTS_IN_COMBINED_LABEL.has(tokens[1] ?? "") ? "광주" : "전남"
  } else {
    regionLabel = deriveCustomerRegion([normalizedAddress]).label
  }

  return {
    provinceRaw,
    regionLabel,
    localityLabel: deriveLocalityLabel(tokens),
    source: regionLabel === REGION_UNSPECIFIED ? "unspecified" : "address",
  }
}

function parseJsonPlaces(raw: string): NaverMapPlaceInput[] | null {
  if (!raw.trimStart().startsWith("[")) return null
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) throw new Error("JSON 최상위 값은 배열이어야 합니다.")
  return parsed.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`${index + 1}번째 항목은 객체여야 합니다.`)
    }
    const row = item as Record<string, unknown>
    return {
      name: cleanPlaceValue(row.name ?? row.placeName ?? row.organizationName),
      category: cleanPlaceValue(row.category) || null,
      address: cleanPlaceValue(row.address ?? row.addressRaw),
    }
  })
}

export function parseNaverMapImportText(raw: string): NaverMapPlaceInput[] {
  const jsonPlaces = parseJsonPlaces(raw)
  const unvalidated =
    jsonPlaces ??
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [name = "", category = "", ...addressCells] = line.split("\t")
        return { name, category, address: addressCells.join(" ") }
      })

  const rows = unvalidated.filter((row, index) => {
    if (index !== 0) return true
    const name = cleanPlaceValue(row.name).toLowerCase()
    const address = cleanPlaceValue(row.address).toLowerCase()
    return !/(이름|장소|기관|name)/.test(name) || !/(주소|address)/.test(address)
  })

  return rows.map((row, index) => {
    const normalized = normalizeNaverMapPlace(row)
    if (!normalized) throw new Error(`${index + 1}번째 행에 이름 또는 주소가 없습니다.`)
    return normalized
  })
}

export function parseNaverMapFolderId(sourceUrl: string) {
  try {
    const url = new URL(sourceUrl)
    if (url.hostname !== "map.naver.com") return null
    const match = url.pathname.match(/\/favorite\/sharedPlace\/folder\/([a-zA-Z0-9_-]{8,80})/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

function rankCandidates(
  place: Pick<NaverMapPlaceInput, "name"> & { regionLabel: string },
  targets: NaverMapMatchTarget[]
) {
  return targets
    .map((target): NaverMapMatchCandidate => {
      const match = scoreCrmEntityMatch({ sourceName: place.name, targetName: target.label })
      const sameRegion = Boolean(
        place.regionLabel !== REGION_UNSPECIFIED &&
          target.regionLabel &&
          place.regionLabel === target.regionLabel
      )
      return {
        ...target,
        confidence: match.score,
        strategy: match.strategy,
        sameRegion,
        evidence: [...match.evidence, ...(sameRegion ? ["region:exact"] : [])],
      }
    })
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        Number(right.sameRegion) - Number(left.sameRegion) ||
        left.label.localeCompare(right.label, "ko")
    )
}

function isReviewCandidate(candidate: NaverMapMatchCandidate | null) {
  return candidate != null && candidate.confidence >= 0.72
}

export function assessNaverMapPlaceMatch(
  place: Pick<NaverMapPlaceInput, "name"> & { regionLabel: string },
  crmTargets: NaverMapMatchTarget[],
  revTargets: NaverMapMatchTarget[]
): NaverMapMatchAssessment {
  const crmRanked = rankCandidates(place, crmTargets)
  const revRanked = rankCandidates(place, revTargets)
  const candidate = crmRanked[0] ?? null
  const runnerUp = crmRanked[1] ?? null
  const revEvidence = revRanked[0] ?? null
  const confidenceGap = candidate
    ? Number((candidate.confidence - (runnerUp?.confidence ?? 0)).toFixed(4))
    : null

  const safeExact =
    candidate?.strategy === "exact" &&
    candidate.confidence >= 0.92 &&
    (confidenceGap ?? 0) >= 0.15
  const hasReviewEvidence = isReviewCandidate(candidate) || isReviewCandidate(revEvidence)

  return {
    status: safeExact ? "prelinked" : hasReviewEvidence ? "review" : "unmatched",
    candidate,
    revEvidence,
    confidenceGap,
  }
}
