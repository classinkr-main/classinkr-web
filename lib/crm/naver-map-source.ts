import { normalizeCrmName } from "@/lib/crm-source-linking"
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

type NaverMapMatchPlace = Pick<NaverMapPlaceInput, "name"> & { regionLabel: string }

// lib/crm-source-linking.ts의 CRM_NAME_TOKEN_TRANSLATIONS 미러.
// 색인이 후보를 정확히 재현하려면 정규화 변형이 같아야 하고, 원본은 export되지 않는다.
// tests/crm/naver-map-matching.test.ts가 원본 파일 텍스트와 이 목록을 대조해 드리프트를 잡는다.
const NAME_TOKEN_TRANSLATIONS: Array<[RegExp, string]> = [
  [/\bclass\s*in\b/gi, "클래스인"],
  [/\bclassin\b/gi, "클래스인"],
  [/\bcastle\b/gi, "캐슬"],
  [/\bmetius\b/gi, "메티우스"],
  [/\bmath\b/gi, "수학"],
  [/\benglish\b/gi, "영어"],
  [/\bedu(?:cation)?\b/gi, "에듀"],
  [/\bacademy\b/gi, "학원"],
  [/\binstitute\b/gi, "학원"],
  [/\bschool\b/gi, "스쿨"],
  [/\bcampus\b/gi, "캠퍼스"],
  [/\bcenter\b/gi, "센터"],
  [/\bcentre\b/gi, "센터"],
  [/\bplus\b/gi, "플러스"],
  [/\bjunior\b/gi, "주니어"],
  [/\bmkt\b/gi, "마케팅"],
  [/\bhw\b/gi, "하드웨어"],
  [/\bsw\b/gi, "소프트웨어"],
]

function nameVariants(value: string | null | undefined) {
  const raw = value ?? ""
  const translated = NAME_TOKEN_TRANSLATIONS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    raw
  )
  const variants: string[] = []
  for (const item of [raw, translated]) {
    const normalized = normalizeCrmName(item)
    if (normalized && !variants.includes(normalized)) variants.push(normalized)
  }
  return variants
}

// scoreCrmEntityMatch가 별칭·담당자 없이 이름만 받았을 때의 규칙.
// overlap은 색인이 이미 센 교집합 글자 수라 후보마다 문자 집합을 다시 만들지 않는다.
function scoreNamePair(
  source: string,
  sourceCharCount: number,
  target: string,
  targetCharCount: number,
  overlap: number
): { score: number; strategy: NaverMapMatchCandidate["strategy"] } {
  if (source === target) return { score: 0.96, strategy: "exact" }
  if (source.length >= 3 && target.includes(source)) return { score: 0.9, strategy: "contains" }
  if (target.length >= 3 && source.includes(target)) return { score: 0.86, strategy: "contains" }
  const union = sourceCharCount + targetCharCount - overlap
  return { score: union === 0 ? 0 : overlap / union, strategy: "char_overlap" }
}

export interface NaverMapTargetIndex {
  targets: NaverMapMatchTarget[]
  slots: Array<{ targetIndex: number; value: string; charCount: number }>
  slotStart: Int32Array
  slotLength: Int32Array
  postings: Map<string, number[]>
  lanes: Int32Array[]
  seen: Uint8Array
}

export interface NaverMapMatchIndex {
  crm: NaverMapTargetIndex
  rev: NaverMapTargetIndex
}

interface RankedEntry {
  targetIndex: number
  score: number
  confidence: number
  strategy: NaverMapMatchCandidate["strategy"]
  sameRegion: boolean
}

function buildTargetIndex(targets: NaverMapMatchTarget[]): NaverMapTargetIndex {
  const slots: NaverMapTargetIndex["slots"] = []
  const slotStart = new Int32Array(targets.length)
  const slotLength = new Int32Array(targets.length)
  const postings = new Map<string, number[]>()

  targets.forEach((target, targetIndex) => {
    slotStart[targetIndex] = slots.length
    for (const value of nameVariants(target.label)) {
      const chars = new Set(value)
      const slotId = slots.length
      slots.push({ targetIndex, value, charCount: chars.size })
      for (const char of chars) {
        const bucket = postings.get(char)
        if (bucket) bucket.push(slotId)
        else postings.set(char, [slotId])
      }
    }
    slotLength[targetIndex] = slots.length - slotStart[targetIndex]
  })

  return { targets, slots, slotStart, slotLength, postings, lanes: [], seen: new Uint8Array(targets.length) }
}

// 후보 목록당 1회만 만들고 모든 장소가 공유한다.
// lanes·seen은 채점마다 되돌리는 작업 버퍼라, 한 색인을 동시에 도는 두 흐름이 나눠 쓰면 안 된다.
// (호출부는 목록 하나를 동기 루프로 훑으므로 교차하지 않는다.)
export function buildNaverMapMatchIndex(
  crmTargets: NaverMapMatchTarget[],
  revTargets: NaverMapMatchTarget[]
): NaverMapMatchIndex {
  return { crm: buildTargetIndex(crmTargets), rev: buildTargetIndex(revTargets) }
}

function compareRanked(left: RankedEntry, right: RankedEntry, targets: NaverMapMatchTarget[]) {
  if (left.confidence !== right.confidence) return right.confidence - left.confidence
  if (left.sameRegion !== right.sameRegion) return Number(right.sameRegion) - Number(left.sameRegion)
  const byLabel = targets[left.targetIndex].label.localeCompare(targets[right.targetIndex].label, "ko")
  // 전수 정렬은 안정 정렬이라 완전 동률이면 후보 배열 순서가 남는다.
  return byLabel !== 0 ? byLabel : left.targetIndex - right.targetIndex
}

function insertRanked(top: RankedEntry[], entry: RankedEntry, limit: number, targets: NaverMapMatchTarget[]) {
  if (top.length >= limit && compareRanked(entry, top[top.length - 1], targets) >= 0) return
  let position = top.length
  while (position > 0 && compareRanked(entry, top[position - 1], targets) < 0) position -= 1
  top.splice(position, 0, entry)
  if (top.length > limit) top.length = limit
}

function buildEntry(
  targetIndex: number,
  score: number,
  strategy: NaverMapMatchCandidate["strategy"],
  place: NaverMapMatchPlace,
  targets: NaverMapMatchTarget[]
): RankedEntry {
  const target = targets[targetIndex]
  const sameRegion = Boolean(
    place.regionLabel !== REGION_UNSPECIFIED && target.regionLabel && place.regionLabel === target.regionLabel
  )
  return { targetIndex, score, confidence: Number(score.toFixed(4)), strategy, sameRegion }
}

function toCandidate(entry: RankedEntry, target: NaverMapMatchTarget): NaverMapMatchCandidate {
  const evidence = entry.score > 0 ? [`name:${entry.strategy}:${entry.score.toFixed(2)}`] : []
  if (entry.sameRegion) evidence.push("region:exact")
  return {
    ...target,
    confidence: entry.confidence,
    strategy: entry.strategy,
    sameRegion: entry.sameRegion,
    evidence,
  }
}

// 글자를 하나도 공유하지 않는 후보는 exact·contains가 불가능하고 자카드도 0이라
// 전수 스코어링을 해도 점수가 0이다. 그래서 글자 역색인에 걸린 후보만 채점하면
// 전수 정렬과 결과가 같고, 0점 후보는 상위가 모자랄 때만 순서 규칙대로 채운다.
function rankTopCandidates(
  place: NaverMapMatchPlace,
  index: NaverMapTargetIndex,
  limit: number
): NaverMapMatchCandidate[] {
  const { targets, slots, slotStart, slotLength, postings, seen } = index
  if (targets.length === 0 || limit <= 0) return []

  const placeVariants = nameVariants(place.name)
  const placeCharCounts = placeVariants.map((value) => new Set(value).size)
  while (index.lanes.length < placeVariants.length) index.lanes.push(new Int32Array(slots.length))

  const touched: number[] = []
  placeVariants.forEach((value, lane) => {
    const counts = index.lanes[lane]
    for (const char of new Set(value)) {
      const bucket = postings.get(char)
      if (!bucket) continue
      for (const slotId of bucket) {
        counts[slotId] += 1
        const targetIndex = slots[slotId].targetIndex
        if (seen[targetIndex] === 0) {
          seen[targetIndex] = 1
          touched.push(targetIndex)
        }
      }
    }
  })

  const top: RankedEntry[] = []
  for (const targetIndex of touched) {
    let score = 0
    let strategy: NaverMapMatchCandidate["strategy"] = "char_overlap"
    const start = slotStart[targetIndex]
    const end = start + slotLength[targetIndex]
    for (let lane = 0; lane < placeVariants.length; lane += 1) {
      const counts = index.lanes[lane]
      for (let slotId = start; slotId < end; slotId += 1) {
        const overlap = counts[slotId]
        if (overlap === 0) continue
        const slot = slots[slotId]
        const scored = scoreNamePair(
          placeVariants[lane],
          placeCharCounts[lane],
          slot.value,
          slot.charCount,
          overlap
        )
        if (scored.score > score) {
          score = scored.score
          strategy = scored.strategy
        }
      }
    }
    insertRanked(top, buildEntry(targetIndex, score, strategy, place, targets), limit, targets)
  }

  if (top.length < limit) {
    for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
      if (seen[targetIndex] === 1) continue
      insertRanked(top, buildEntry(targetIndex, 0, "char_overlap", place, targets), limit, targets)
    }
  }

  for (const targetIndex of touched) {
    seen[targetIndex] = 0
    const start = slotStart[targetIndex]
    const end = start + slotLength[targetIndex]
    for (let lane = 0; lane < placeVariants.length; lane += 1) {
      const counts = index.lanes[lane]
      for (let slotId = start; slotId < end; slotId += 1) counts[slotId] = 0
    }
  }

  return top.map((entry) => toCandidate(entry, targets[entry.targetIndex]))
}

function isReviewCandidate(candidate: NaverMapMatchCandidate | null) {
  return candidate != null && candidate.confidence >= 0.72
}

export function assessNaverMapPlaceMatchWithIndex(
  place: NaverMapMatchPlace,
  index: NaverMapMatchIndex
): NaverMapMatchAssessment {
  const crmRanked = rankTopCandidates(place, index.crm, 2)
  const candidate = crmRanked[0] ?? null
  const runnerUp = crmRanked[1] ?? null
  const revEvidence = rankTopCandidates(place, index.rev, 1)[0] ?? null
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

/** 장소 한 건만 볼 때의 진입점. 목록 전체는 색인을 한 번 만들어 재사용한다. */
export function assessNaverMapPlaceMatch(
  place: NaverMapMatchPlace,
  crmTargets: NaverMapMatchTarget[],
  revTargets: NaverMapMatchTarget[]
): NaverMapMatchAssessment {
  return assessNaverMapPlaceMatchWithIndex(place, buildNaverMapMatchIndex(crmTargets, revTargets))
}
