import { readFileSync } from "fs"
import { join } from "path"
import { describe, expect, it } from "vitest"

import {
  assessNaverMapPlaceMatch,
  assessNaverMapPlaceMatchWithIndex,
  buildNaverMapMatchIndex,
  type NaverMapMatchAssessment,
  type NaverMapMatchCandidate,
  type NaverMapMatchTarget,
} from "@/lib/crm/naver-map-source"
import { scoreCrmEntityMatch } from "@/lib/crm-source-linking"
import { REGION_UNSPECIFIED } from "@/lib/crm/region-label"

interface MatchPlace {
  name: string
  regionLabel: string
}

// ---------------------------------------------------------------------------
// 참조 구현 = 색인 도입 전 전수 스코어링 로직(lib/crm/naver-map-source.ts 원본).
// 점수는 SSOT인 scoreCrmEntityMatch를 그대로 부르므로, SSOT 임계값이 바뀌면
// 색인 구현과 즉시 어긋나 아래 대조 테스트가 깨진다.
// ---------------------------------------------------------------------------
function referenceRank(place: MatchPlace, targets: NaverMapMatchTarget[]): NaverMapMatchCandidate[] {
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

function referenceAssess(
  place: MatchPlace,
  crmTargets: NaverMapMatchTarget[],
  revTargets: NaverMapMatchTarget[]
): NaverMapMatchAssessment {
  const crmRanked = referenceRank(place, crmTargets)
  const revRanked = referenceRank(place, revTargets)
  const candidate = crmRanked[0] ?? null
  const runnerUp = crmRanked[1] ?? null
  const revEvidence = revRanked[0] ?? null
  const confidenceGap = candidate
    ? Number((candidate.confidence - (runnerUp?.confidence ?? 0)).toFixed(4))
    : null

  const safeExact =
    candidate?.strategy === "exact" && candidate.confidence >= 0.92 && (confidenceGap ?? 0) >= 0.15
  const isReview = (item: NaverMapMatchCandidate | null) => item != null && item.confidence >= 0.72

  return {
    status: safeExact ? "prelinked" : isReview(candidate) || isReview(revEvidence) ? "review" : "unmatched",
    candidate,
    revEvidence,
    confidenceGap,
  }
}

// ---------------------------------------------------------------------------
// 합성 픽스처
// ---------------------------------------------------------------------------
function createRandom(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SYLLABLES = [
  "알", "파", "베", "타", "감", "마", "델", "에", "이", "비",
  "수", "학", "영", "어", "스", "쿨", "센", "터", "플", "러",
  "우", "진", "한", "빛", "새", "봄", "해", "솔", "다", "온",
]
const SUFFIXES = ["학원", "어학원", "교육", "캠퍼스", "센터", "스쿨", "아카데미", ""]
const LATIN_TOKENS = ["Class In", "Math", "English", "Edu", "Academy", "School", "Campus", "Center", "Plus", "Junior", "MKT", "HW", "SW", "Castle", "Metius"]
const REGIONS: Array<string | null> = ["서울", "경기", "부산", "대구", "광주", "전남", null]
const SOURCES: NaverMapMatchTarget["source"][] = ["neo", "customer", "lead", "partner"]

function targetType(source: NaverMapMatchTarget["source"]): NaverMapMatchTarget["targetType"] {
  if (source === "customer") return "customer"
  if (source === "lead") return "lead"
  if (source === "partner") return "partner_account"
  if (source === "rev") return "rev_deal"
  return "external_account"
}

function makeTarget(
  targetId: string,
  label: string,
  source: NaverMapMatchTarget["source"] = "neo",
  regionLabel: string | null = null
): NaverMapMatchTarget {
  return { source, targetType: targetType(source), targetId, label, regionLabel }
}

function generateTargets(count: number, seed: number, prefix: string): NaverMapMatchTarget[] {
  const random = createRandom(seed)
  const pick = <T>(pool: T[]) => pool[Math.floor(random() * pool.length)]
  const targets: NaverMapMatchTarget[] = []

  for (let index = 0; index < count; index += 1) {
    const length = 2 + Math.floor(random() * 3)
    let label = ""
    for (let step = 0; step < length; step += 1) label += pick(SYLLABLES)
    // 후보 일부는 라틴 토큰을 섞어 번역 변형(math→수학 등) 경로를 태운다.
    if (random() < 0.22) label = `${pick(LATIN_TOKENS)} ${label}`
    if (random() < 0.7) label += pick(SUFFIXES)
    targets.push(makeTarget(`${prefix}-${index}`, label, pick(SOURCES), pick(REGIONS)))
  }
  return targets
}

// 경계 케이스를 후보 쪽에도 심어 색인 쇼트리스트가 놓치면 바로 어긋나게 한다.
const EDGE_TARGETS: NaverMapMatchTarget[] = [
  makeTarget("dup-seoul", "알파수학", "neo", "서울"),
  makeTarget("dup-gyeonggi", "알파수학", "customer", "경기"),
  makeTarget("dup-busan", "알파수학", "lead", "부산"),
  makeTarget("prefix-short", "알파수학전", "neo", "서울"),
  makeTarget("prefix-long", "알파수학전문학원플러스캠퍼스", "neo", "서울"),
  makeTarget("anagram", "비에이", "partner", "서울"),
  makeTarget("anagram-exact", "에이비", "neo", "경기"),
  makeTarget("translated", "클래스인알파", "customer", "서울"),
  makeTarget("empty-normalized", "학원", "neo", "서울"),
  makeTarget("empty-normalized-2", "센터", "lead", "경기"),
  makeTarget("region-only", "머루포도참외", "neo", "서울"),
  makeTarget("region-only-2", "머루포도참외", "neo", "경기"),
]

const CRM_TARGETS = [...generateTargets(420, 20260827, "crm"), ...EDGE_TARGETS]
const REV_TARGETS = generateTargets(90, 987654, "rev").map((target) => ({
  ...target,
  source: "rev" as const,
  targetType: "rev_deal" as const,
}))

const EDGE_PLACES: MatchPlace[] = [
  { name: "알파수학", regionLabel: "경기" }, // 동명 다지역 — 지역 동률이 순서를 가른다
  { name: "알파수학전문학원", regionLabel: "서울" }, // 접두 일치(양방향 contains)
  { name: "에이비", regionLabel: "서울" }, // 토큰 순서 뒤집힘 — 자카드 1.0 > exact 0.96
  { name: "Class In 알파", regionLabel: "서울" }, // 라틴 토큰 번역 변형
  { name: "뀽뾰쭉", regionLabel: "서울" }, // 완전 불일치 — 전 후보 0점
  { name: "학원", regionLabel: "서울" }, // 정규화 후 빈 문자열
  { name: "머루포도참외", regionLabel: "제주" }, // 이름만 겹치고 지역은 어긋남
  { name: "알파수학학원", regionLabel: "서울" },
  { name: "감마에듀", regionLabel: REGION_UNSPECIFIED },
  { name: "Math 베타", regionLabel: "부산" },
]

function generatePlaces(count: number, seed: number): MatchPlace[] {
  const random = createRandom(seed)
  const pick = <T>(pool: T[]) => pool[Math.floor(random() * pool.length)]
  return Array.from({ length: count }, () => {
    const length = 2 + Math.floor(random() * 3)
    let name = ""
    for (let step = 0; step < length; step += 1) name += pick(SYLLABLES)
    if (random() < 0.2) name = `${pick(LATIN_TOKENS)} ${name}`
    if (random() < 0.7) name += pick(SUFFIXES)
    return { name, regionLabel: pick(REGIONS) ?? REGION_UNSPECIFIED }
  })
}

const PLACES = [...EDGE_PLACES, ...generatePlaces(12, 555)]

describe("네이버 지도 매칭 색인 ↔ 전수 스코어링 동치", () => {
  it("합성 후보 432건 × 장소 22건에서 선정 후보·순서·점수가 모두 같다", () => {
    const index = buildNaverMapMatchIndex(CRM_TARGETS, REV_TARGETS)
    for (const place of PLACES) {
      expect(assessNaverMapPlaceMatchWithIndex(place, index)).toEqual(
        referenceAssess(place, CRM_TARGETS, REV_TARGETS)
      )
    }
  })

  it("같은 색인을 순서를 바꿔 재사용해도 결과가 변하지 않는다", () => {
    const index = buildNaverMapMatchIndex(CRM_TARGETS, REV_TARGETS)
    const forward = PLACES.map((place) => assessNaverMapPlaceMatchWithIndex(place, index))
    const backward = [...PLACES].reverse().map((place) => assessNaverMapPlaceMatchWithIndex(place, index))
    expect(backward.reverse()).toEqual(forward)
  })

  it("색인을 만들지 않는 단건 진입점도 같은 결과를 낸다", () => {
    for (const place of EDGE_PLACES) {
      expect(assessNaverMapPlaceMatch(place, CRM_TARGETS, REV_TARGETS)).toEqual(
        referenceAssess(place, CRM_TARGETS, REV_TARGETS)
      )
    }
  })

  it("후보가 비었거나 한 건뿐일 때도 전수 로직과 같다", () => {
    for (const place of EDGE_PLACES.slice(0, 5)) {
      expect(assessNaverMapPlaceMatch(place, [], [])).toEqual(referenceAssess(place, [], []))
      expect(assessNaverMapPlaceMatch(place, [EDGE_TARGETS[0]], [])).toEqual(
        referenceAssess(place, [EDGE_TARGETS[0]], [])
      )
    }
  })
})

describe("경계 케이스가 실제로 그 경로를 태우는지", () => {
  const index = buildNaverMapMatchIndex(CRM_TARGETS, REV_TARGETS)

  it("토큰 순서가 뒤집힌 이름은 exact(0.96)보다 높은 자카드 1.0으로 이긴다", () => {
    const result = assessNaverMapPlaceMatchWithIndex({ name: "에이비", regionLabel: "서울" }, index)
    expect(result.candidate).toMatchObject({ targetId: "anagram", strategy: "char_overlap", confidence: 1 })
    expect(result.candidate?.confidence).toBeGreaterThan(0.96)
  })

  it("접두 일치는 방향에 따라 0.9/0.86으로 갈린다", () => {
    const ranked = referenceRank({ name: "알파수학전문학원", regionLabel: "서울" }, CRM_TARGETS)
    expect(ranked.find((item) => item.targetId === "prefix-long")?.confidence).toBe(0.9)
    expect(ranked.find((item) => item.targetId === "prefix-short")?.confidence).toBe(0.86)
    expect(assessNaverMapPlaceMatchWithIndex({ name: "알파수학전문학원", regionLabel: "서울" }, index)).toEqual(
      referenceAssess({ name: "알파수학전문학원", regionLabel: "서울" }, CRM_TARGETS, REV_TARGETS)
    )
  })

  it("동명 다지역은 같은 지역 후보가 앞서고 확신 간격이 0이 된다", () => {
    const result = assessNaverMapPlaceMatchWithIndex({ name: "알파수학", regionLabel: "경기" }, index)
    expect(result.candidate).toMatchObject({ targetId: "dup-gyeonggi", sameRegion: true, confidence: 0.96 })
    expect(result.confidenceGap).toBe(0)
    expect(result.status).toBe("review")
  })

  it("완전 불일치는 0점 후보 풀에서 순서 규칙대로 채운다", () => {
    const place = { name: "뀽뾰쭉", regionLabel: "서울" }
    const result = assessNaverMapPlaceMatchWithIndex(place, index)
    expect(result.candidate?.confidence).toBe(0)
    expect(result.status).toBe("unmatched")
    expect(result).toEqual(referenceAssess(place, CRM_TARGETS, REV_TARGETS))
  })

  it("이름 외 신호(지역)만 겹치는 후보는 점수를 얻지 못한다", () => {
    // 현행 매칭에는 전화번호 신호가 없다. 지역은 순서 타이브레이크일 뿐 confidence를 올리지 않는다.
    const inRegion = scoreCrmEntityMatch({ sourceName: "머루포도참외", targetName: "머루포도참외" })
    const different = scoreCrmEntityMatch({ sourceName: "머루포도참외", targetName: "뀽뾰쭉" })
    expect(inRegion.score).toBe(0.96)
    expect(different.score).toBe(0)

    const place = { name: "머루포도참외", regionLabel: "제주" }
    const result = assessNaverMapPlaceMatchWithIndex(place, index)
    expect(result.candidate?.sameRegion).toBe(false)
    expect(result).toEqual(referenceAssess(place, CRM_TARGETS, REV_TARGETS))
  })
})

describe("쇼트리스트 전제와 정규화 미러", () => {
  it("글자를 하나도 공유하지 않는 이름은 SSOT 점수가 0이다", () => {
    const disjoint: Array<[string, string]> = [
      ["뀽뾰쭉", "알파수학"],
      ["알파학원", "베타센터"],
      ["수학전문", "영어캠퍼스"],
      ["abc", "델타"],
    ]
    for (const [source, target] of disjoint) {
      expect(scoreCrmEntityMatch({ sourceName: source, targetName: target }).score).toBe(0)
    }
  })

  it("이름 토큰 번역표 미러가 SSOT와 같다", () => {
    const readTable = (file: string, name: string) => {
      const text = readFileSync(join(process.cwd(), file), "utf8")
      const block = text.match(new RegExp(`${name}: Array<\\[RegExp, string\\]> = \\[([\\s\\S]*?)\\n\\]`))
      expect(block, `${name} 배열 리터럴을 ${file}에서 찾지 못했습니다.`).not.toBeNull()
      return (block?.[1] ?? "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
    }

    expect(readTable("lib/crm/naver-map-source.ts", "NAME_TOKEN_TRANSLATIONS")).toEqual(
      readTable("lib/crm-source-linking.ts", "CRM_NAME_TOKEN_TRANSLATIONS")
    )
  })
})

describe("넓은 후보 집합", () => {
  // 프로덕션은 후보 2만여 건 × 장소 199건이라 전수 대조가 20초를 넘는다.
  // 여기서는 같은 경로를 태우는 축소 규모로 무작위 조합을 훑는다.
  it("후보 2,000건 × 장소 30건에서도 전수 로직과 완전히 같다", () => {
    const crmTargets = generateTargets(2_000, 424242, "wide")
    const revTargets = generateTargets(300, 313131, "widerev").map((target) => ({
      ...target,
      source: "rev" as const,
      targetType: "rev_deal" as const,
    }))
    const places = generatePlaces(30, 777)
    const index = buildNaverMapMatchIndex(crmTargets, revTargets)

    expect(places.map((place) => assessNaverMapPlaceMatchWithIndex(place, index))).toEqual(
      places.map((place) => referenceAssess(place, crmTargets, revTargets))
    )
  })
})
