/**
 * 결정 규칙(사양 §3.5)과 흔적(§3.7). 네트워크·모델 호출 없음. 같은 색인·같은 질문·같은 환경변수면 같은 판정.
 *
 * 조각 하나의 판정(decideSegment)
 *   θ = calibration.thresholds[kind], CHATBOT_COMPILED_MIN_CONFIDENCE 가 있으면 max(θ, 그 값)
 *   1. 없는 개념이 질문에 있고 1위 카드가 그 자리를 덮지 않으면:
 *        1위가 답할 만하고(conf ≥ θ, 공백 카드 아님) 그 자리를 뺀 질문 덮임이 ABSENT_TAIL_MIN_COVERAGE 이상 → 답 + 없는 부분 꼬리
 *        아니면 → gap(absent.gapCard). 그 공백 카드가 색인에 없으면(꺼짐·낡음) 못 찾음.
 *   2. 1위가 반례 'none' 행선 자리(탈락한 카드의 몫) → 아래 못 찾음 갈래
 *   3. 1위가 공백 카드이고 conf ≥ θ.gap → gap(1위)
 *   4. conf ≥ θ[1위 종류] → answer(1위)
 *   5. 내용 낱말이 없음(지시어·"안 돼요"·"에러나요" 단독) → clarify(기존 증상 일반 되묻기). 카드가 0장인 색인은 되묻지 않고 abstain
 *   6. 증상 신고 → abstain(symptom: SYMPTOM_AFTER_GATE_ANSWER)
 *   7. 그 밖 → abstain(nodoc: NO_SOURCE_FACT_ANSWER)
 *
 * 질문 전체(decide)
 *   질문을 최대 세 조각으로 나눠(normalize.ts splitQuestion v2, R2 B2) 조각마다 정하고, 원문 전체로도 정한다.
 *   - 둘째·셋째 조각에 제 주제가 없으면 앞 조각 주제 개념을 붙여 점수를 낸다(주제 이어 붙이기, 점수용).
 *   - 조각의 답·공백은 그 종류 θ + SEGMENT_CONF_MARGIN(0.1) 이상일 때만 낸다(진단 R15). 못 정한 조각은 그 조각 글로 센 옛 정규식 표로
 *     승격할 수 있다(조각 승격).
 *   - 모든 조각의 1위 카드가 같고 원문도 그 카드로 정했을 때만 원문 판정을 쓴다. 서로 다른 주제 조각이면 원문이 조각 판정을 덮지 않는다
 *     (못 정한 조각의 1위가 원문 카드일 때만 원문 판정으로 채운다).
 *   - 답 순서 = 질문 순서. 조각 기록(segments)은 나눈 질문이면 늘 싣는다(못 정한 조각 = 알림 줄 대상, 넘친 조각 = overflow).
 *
 * 없는 개념(R2 B2): 질문의 없는 개념 맞춤마다 묻는 대상인지 본다(checks.ts absentTargetOf). 대상이 아닌 맞춤(비교·제외·장소·때 부사어·
 * 상황 문장)은 공백·꼬리·승격 판정에 쓰지 않고 주의 표시(cautions)만 남긴다. 1위가 그 자리를 덮지 못하면 상위 ABSENT_RECHECK_TOP 안에서
 * 그 자리를 뺀 질문을 덮는 답할 만한 카드를 찾는다.
 * 공백 카드 답(R2 B2): 1위 공백 카드는 gapEligible(묻는 대상 없는 개념의 공백 카드이거나, 묻는 꼴이 어긋나지 않고 덮임 ≥
 * GAP_MIN_COVERAGE)일 때만 공백 답이고, 아니면 주제명 없는 일반 못 찾음이다.
 *
 * 정해 둔 답 승격(진단 R07, applyVoteRescue, CHATBOT_COMPILED_VOTE_RESCUE: 기본 켬 · off · override)
 *   옛 정규식 표(votes) 카드가 원문 순위 상위 VOTE_RESCUE_TOP(3) 안에 있고 아래 검사를 모두 통과하면, 문턱에 못 미쳐 답하지 않던
 *   질문을 그 카드로 답한다. override 면 1위가 다른 카드로 답했어도 표 카드로 바꾼다(혼합 P3 그대로). 기본이 override 가 아닌 까닭:
 *   보정 묶음에서 '답을 바꾼' 줄은 손해, '못 찾음을 살린' 줄은 이득이었다. 흔적 decidedBy 는 index:vote-rescue.
 *   legacy 문서 초안 경로는 쓰지 않는다.
 *   - 카드: active 이고 끄지 않았고(순위에 있음) 종류가 doc·howto·fixed·policy(공백·상담 연결 카드는 승격하지 않는다).
 *   - 범위: isCompiledScope.
 *   - 없는 개념: 질문의 없는 개념을 그 카드가 모두 덮는다.
 *   - 공백: 결정이 gap 이 아니다(없는 개념·공백 카드 판정은 그대로 둔다). 되묻기·두 조각을 이은 답도 그대로 둔다.
 *   - NODOC: 반례 'none' 자리가 1위가 아니고, 우주 이웃의 'none' 몫이 VOTE_RESCUE_MAX_KNN_NONE(0.5) 미만이다.
 *   - 가드(R2 B2, voteGuardAllows): 증상 판별에서만 나온 표는 주절이 다른 대상의 방법·위치를 물으면 쓰지 않는다.
 * 반례: 상위 5 후보마다 negMargin > 0 이면 탈락, 반례 행선 카드에 NEG_ROUTE_BONUS × 반례 코사인 가산, 행선이 none 이면
 * 탈락한 카드 점수로 'none' 자리를 만든다(1위가 되면 못 찾음).
 * 끈 카드(CHATBOT_COMPILED_DISABLED_CARDS)는 후보·이웃 라벨·표·반례 행선·없는 개념 공백 카드에서 빠지고 다음 순위가 경쟁한다.
 */
import { prepareQuery, type CompiledAnswerIndex, type IndexQuery } from "./compile"
import {
  absentCoveredBy,
  absentTargetOf,
  checkCandidate,
  conceptExplained,
  coverageWithoutSpan,
  gapWordCoverage,
  NEG_ROUTE_BONUS,
  scoreNegatives,
  type CandidateCheck,
} from "./checks"
import { legacyVoteSources } from "./legacy-votes"
import type { AbsentMatch } from "./lexicon"
import { askingSentencesOf, detectAskType, hasOwnTopicWords, INDEX_SYMPTOM_RE, isAskingSegment, normalizeText, segmentHasContent, splitQuestion } from "./normalize"
import { isCompiledScope } from "./scope"
import { compositeScore, confidenceOf, knnCountFeature, scoreCandidates, sortCandidates, type KnnSummary, type ScoreComponents } from "./score"
import type {
  AnswerCardKind,
  AnswerIndexCandidate,
  AnswerIndexCaution,
  AnswerIndexDecision,
  AnswerIndexDecisionKind,
  AnswerIndexFeatures,
  AnswerIndexRouter,
  AnswerIndexSegmentDecision,
  AnswerIndexTrace,
  AnswerIndexTraceSegment,
} from "./types"

export const CHECK_TOP = 5
export const TRACE_TOP = 5
/** 없는 개념 자리를 뺀 질문을 1위 카드가 이만큼 덮으면 '답 + 없는 부분 꼬리', 아니면 공백 카드. */
export const ABSENT_TAIL_MIN_COVERAGE = 0.6
/** 규칙으로 정한 공백(없는 개념)의 확신도. */
export const ABSENT_GAP_CONF = 1
/** 조각 판정의 문턱 여유(진단 R15): 조각 답·공백은 θ + 이 값 이상이어야 한다. */
export const SEGMENT_CONF_MARGIN = 0.1
/** 정해 둔 답 승격(진단 R07): 옛 정규식 표 카드가 원문 순위 이 안에 있어야 한다. */
export const VOTE_RESCUE_TOP = 3
/** 정해 둔 답 승격의 NODOC 검사: 우주 이웃 가운데 'none'(문서에 없음) 몫이 이 값 이상이면 승격하지 않는다. */
export const VOTE_RESCUE_MAX_KNN_NONE = 0.5
const VOTE_RESCUE_KINDS: ReadonlySet<AnswerCardKind> = new Set(["doc", "howto", "fixed", "policy"])
/** 없는 개념 자리를 뺀 질문을 다시 볼 상위 후보 수(1위가 그 자리를 덮지 못할 때 2·3위도 본다). */
export const ABSENT_RECHECK_TOP = 3
/**
 * 공백 카드로 답하는 조건(R2 B2, 결정 11): 1위 공백 카드가 질문 내용(IDF 상위 절반)을 이만큼 덮고 묻는 꼴이 어긋나지 않아야 한다.
 * 아니면 공백 카드의 주제명을 말하지 않고 일반 못 찾음으로 간다(낱말 하나로 엉뚱한 주제명을 말하지 않게).
 */
export const GAP_MIN_COVERAGE = 0.5
const NONE_ID = "none"

type Env = Record<string, string | undefined>

export interface DecideContext {
  /** collectLegacyVotes 가 카드 id 로 바꾼 옛 정규식 표. */
  votes?: readonly string[]
  /**
   * 표 카드마다 그 표를 낸 옛 판별식 이름(field:·basics:·self:·symptom:·guide:…). 없으면 legacyVoteSources 로 다시 센다.
   * 정해 둔 답 승격의 증상 판별 가드가 쓴다.
   */
  voteSources?: ReadonlyMap<string, readonly string[]>
  /** 증상 신고 판별. 없으면 normalize.ts INDEX_SYMPTOM_RE(service.ts SYMPTOM_REPORT_RE 와 같은 뜻). */
  isSymptomReport?: (text: string) => boolean
  /** 환경변수(시험용). 없으면 process.env. */
  env?: Env
}

// ─── 환경변수 스위치(§3.8) ──────────────────────────────────────────────

const disabledCache = { raw: undefined as string | undefined, set: new Set<string>() }

/** CHATBOT_COMPILED_DISABLED_CARDS: 쉼표로 나눈 카드 id. 배포 없이 그 카드만 끈다. */
export function disabledCardIds(env: Env = process.env): ReadonlySet<string> {
  const raw = env.CHATBOT_COMPILED_DISABLED_CARDS ?? ""
  if (raw !== disabledCache.raw) {
    disabledCache.raw = raw
    disabledCache.set = new Set(raw.split(",").map((id) => id.trim()).filter(Boolean))
  }
  return disabledCache.set
}

/** 정해 둔 답 승격 방식: off(끔) · below(기본: 답하지 않던 질문만) · override(다른 카드로 답한 질문도 표 카드로). */
export type VoteRescueMode = "off" | "below" | "override"

/** CHATBOT_COMPILED_VOTE_RESCUE: off·0·false 면 끔, override 면 덮어쓰기까지, 그 밖(없음·on)은 below. */
export function voteRescueMode(env: Env = process.env): VoteRescueMode {
  const raw = env.CHATBOT_COMPILED_VOTE_RESCUE?.trim().toLowerCase()
  if (raw === "off" || raw === "0" || raw === "false") return "off"
  return raw === "override" ? "override" : "below"
}

/** CHATBOT_COMPILED_MIN_CONFIDENCE: 모든 문턱의 하한(0~1). 없거나 잘못되면 null. */
export function minConfidence(env: Env = process.env) {
  const raw = env.CHATBOT_COMPILED_MIN_CONFIDENCE
  if (raw === undefined || raw.trim() === "") return null
  const value = Number(raw)
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : null
}

export function thresholdFor(index: CompiledAnswerIndex, kind: AnswerCardKind, env: Env = process.env) {
  const base = index.calibration.thresholds[kind]
  const floor = minConfidence(env)
  return floor === null ? base : Math.max(base, floor)
}

// ─── 조각 판정 ───────────────────────────────────────────────────────────

export interface RankedCandidate {
  card: number
  id: string
  kind: AnswerCardKind | "none"
  s: number
  components: ScoreComponents | null
  check: CandidateCheck | null
}

export interface SegmentResult {
  text: string
  query: IndexQuery
  kind: AnswerIndexDecision["kind"]
  card: string | null
  conf: number
  top: AnswerIndexCandidate[]
  unexplained: string[]
  absentHit: string | null
  absentTail: string | null
  abstainReason: AnswerIndexDecision["abstainReason"]
  features: AnswerIndexFeatures | undefined
  /** 정해 둔 답 승격으로 정한 조각 판정(조각 글로 센 표). */
  rescued?: boolean
}

function askTypeMatch(index: CompiledAnswerIndex, query: IndexQuery, card: number) {
  const asks = index.cards[card].asks
  if (!query.askType || asks.length === 0) return 0.5
  return asks.includes(query.askType) ? 1 : 0
}

function featuresOf(
  index: CompiledAnswerIndex,
  query: IndexQuery,
  ranked: RankedCandidate[],
  at: number,
  absentHit: boolean,
  knnCountOf: (card: number) => number
): AnswerIndexFeatures {
  const candidate = ranked[at]
  const others = ranked.filter((_, position) => position !== at)
  const s2 = others.length > 0 ? others[0].s : 0
  const components = candidate.components
  const check = candidate.check
  return {
    s1: candidate.s,
    s1MinusS2: candidate.s - s2,
    maxcos1: components?.maxcos ?? 0,
    centroid1: components?.centroid ?? 0,
    knnShare1: components?.knnShare ?? 0,
    vote1: components?.vote ?? 0,
    coverage1: check?.coverage ?? 0,
    unexplainedCount: check?.unexplained.length ?? 0,
    unknownHighIdf: query.unknownHighIdf,
    negMargin1: check?.negMargin ?? 0,
    absentHit: absentHit ? 1 : 0,
    questionLength: Math.min(query.compact.length, 80) / 80,
    askTypeMatch: candidate.card >= 0 ? askTypeMatch(index, query, candidate.card) : 0.5,
    knnCount1: candidate.card >= 0 ? knnCountFeature(knnCountOf(candidate.card)) : 0,
  }
}

/** 상위 후보 검사·반례 탈락·행선 가산을 마친 순위. */
function rankWithChecks(index: CompiledAnswerIndex, query: IndexQuery, votes: readonly string[], disabled: ReadonlySet<string>) {
  const scored = scoreCandidates(index, query, votes, { disabled })
  const negatives = scoreNegatives(index, query)
  const inputs = { negatives, maxVariantCos: scored.maxVariantCos, centroidCos: scored.centroidCos }
  const live = (card: number) => card >= 0 && card < index.cards.length && !disabled.has(index.cards[card].id)

  let ranked: RankedCandidate[] = scored.candidates.map((candidate) => ({ ...candidate, check: null }))
  const rejected = new Set<number>()
  const bonus = new Map<number, number>()
  let noneScore = -Infinity

  for (let round = 0; round < 3; round += 1) {
    let changed = false
    for (const candidate of ranked.slice(0, CHECK_TOP)) {
      if (candidate.card < 0 || candidate.check) continue
      candidate.check = checkCandidate(index, query, candidate.card, inputs)
      if (!candidate.check.rejected) continue
      changed = true
      rejected.add(candidate.card)
      const route = candidate.check.negRoute
      if (route >= 0 && live(route) && !rejected.has(route)) bonus.set(route, (bonus.get(route) ?? 0) + NEG_ROUTE_BONUS * candidate.check.maxNegCos)
      else noneScore = Math.max(noneScore, candidate.s)
    }
    if (!changed) break
    const byCard = new Map(ranked.filter((candidate) => candidate.card >= 0).map((candidate) => [candidate.card, candidate]))
    for (const [card, extra] of bonus) {
      if (rejected.has(card)) continue
      const existing = byCard.get(card)
      const components = existing?.components ?? scored.componentsOf(card)
      const base = compositeScore(components, index.calibration.weights)
      const next: RankedCandidate = existing
        ? { ...existing, s: base + extra }
        : { card, id: index.cards[card].id, kind: index.cards[card].kind, s: base + extra, components, check: null }
      byCard.set(card, next)
    }
    ranked = Array.from(byCard.values()).filter((candidate) => !rejected.has(candidate.card))
    if (noneScore > -Infinity) ranked.push({ card: -1, id: NONE_ID, kind: "none", s: noneScore, components: null, check: null })
    sortCandidates(ranked)
  }
  // 아직 검사하지 않은 상위 후보(마지막 라운드에 올라온 것)도 특징용으로 검사한다.
  for (const candidate of ranked.slice(0, CHECK_TOP)) if (candidate.card >= 0 && !candidate.check) candidate.check = checkCandidate(index, query, candidate.card, inputs)
  return { ranked, knn: scored.knn, knnCountOf: scored.knnCountOf }
}

function fallbackKind(index: CompiledAnswerIndex, query: IndexQuery, text: string, isSymptomReport: (text: string) => boolean) {
  // 카드가 한 장도 없는 색인(자료를 만들기 전)은 무엇을 묻든 정하지 않는다: 되묻기도 하지 않고 언제나 abstain.
  if (query.contentLight && index.cards.length > 0) return { kind: "clarify" as const, abstainReason: null }
  if (query.askType === "symptom" || isSymptomReport(text)) return { kind: "abstain" as const, abstainReason: "symptom" as const }
  return { kind: "abstain" as const, abstainReason: "nodoc" as const }
}

/**
 * 조각 하나의 분석: 점수·검사·확신도까지(문턱과 무관한 부분). resolveSegment 가 문턱으로 결정을 내린다.
 * 보정(scripts/answer-index/calibrate.ts)은 분석을 한 번 하고 문턱만 바꿔 가며 resolveSegment 를 다시 부른다.
 */
export interface SegmentAnalysis {
  /** 조각 글(답·흔적에 쓰는 원문 조각). */
  text: string
  /** 점수를 낸 글(주제를 이어 붙였으면 그 글, 아니면 text). */
  scoringText: string
  query: IndexQuery
  ranked: RankedCandidate[]
  confs: number[]
  top: AnswerIndexCandidate[]
  /** 1위 실제 카드(none 자리 제외)의 특징. */
  features: AnswerIndexFeatures | undefined
  /** ranked 앞 VOTE_RESCUE_TOP 자리의 특징(none 자리는 undefined). 정해 둔 답 승격이 고른 카드의 특징으로 쓴다. */
  topFeatures: (AnswerIndexFeatures | undefined)[]
  /** 우주 이웃 요약(이웃 수·none·clarify·쓸 수 없음 몫). */
  knn: KnnSummary
  /** ranked 안 첫 실제 카드 위치(-1 이면 없음). */
  topReal: number
  /** 1위 카드가 덮지 않은 없는 개념(첫째, 묻는 대상인 것만). */
  absentMatch: AbsentMatch | null
  /** 질문의 없는 개념 맞춤마다 묻는 대상인지(absentTargetOf). 묻는 대상이 아닌 맞춤은 공백·꼬리·승격 판정에 쓰지 않는다. */
  absentTargets: { match: AbsentMatch; target: boolean; reason: string | null }[]
  /** 상위 ABSENT_RECHECK_TOP 자리마다 없는 개념 자리를 뺀 질문 덮임(실제 카드이고 absentMatch 가 있을 때만, 아니면 null). */
  absentCoverages: (number | null)[]
  /** 없는 개념 자리를 뺀 질문을 1위 카드가 덮는 비율(1위가 실제 카드이고 absentMatch 가 있을 때만). */
  absentCoverage: number | null
  /** absentMatch 의 공백 카드 번호(색인에 있고 꺼지지 않았을 때). */
  absentGapCard: number | null
  /** 못 찾음 갈래(문턱과 무관). */
  fallback: { kind: "clarify" | "abstain"; abstainReason: AnswerIndexDecision["abstainReason"] }
}

export function analyzeSegment(index: CompiledAnswerIndex, text: string, context: DecideContext = {}, display?: string): SegmentAnalysis {
  const env = context.env ?? process.env
  const disabled = disabledCardIds(env)
  const isSymptomReport = context.isSymptomReport ?? ((value: string) => INDEX_SYMPTOM_RE.test(value.toLowerCase()))
  const query = prepareQuery(index, text)
  const { ranked, knn, knnCountOf } = rankWithChecks(index, query, context.votes ?? [], disabled)

  const asking = query.absent.length > 0 ? askingSentencesOf(text) : null
  const absentTargets = query.absent.map((match) => {
    const target = absentTargetOf(query, match, asking)
    return { match, target: target.target, reason: target.reason }
  })
  const asked = absentTargets.filter((item) => item.target).map((item) => item.match)
  const topReal = ranked.findIndex((candidate) => candidate.card >= 0)
  const uncovered = topReal >= 0 ? asked.filter((match) => !absentCoveredBy(index, query, match, ranked[topReal].card)) : asked
  const absentMatch = uncovered[0] ?? null

  const featureAt = (at: number) => featuresOf(index, query, ranked, at, Boolean(absentMatch), knnCountOf)
  const confs = ranked.map((candidate, at) =>
    candidate.card >= 0 ? confidenceOf(featureAt(at), candidate.kind as AnswerCardKind, index.calibration) : 0
  )
  const top: AnswerIndexCandidate[] = ranked.slice(0, TRACE_TOP).map((candidate, at) => ({ id: candidate.id, s: candidate.s, conf: confs[at] }))
  const features = topReal >= 0 ? featureAt(topReal) : undefined
  const topFeatures = ranked.slice(0, VOTE_RESCUE_TOP).map((candidate, at) => (candidate.card >= 0 ? featureAt(at) : undefined))
  let absentCoverage: number | null = null
  let absentGapCard: number | null = null
  const absentCoverages: (number | null)[] = []
  if (absentMatch) {
    for (let at = 0; at < Math.min(ABSENT_RECHECK_TOP, ranked.length); at += 1) {
      const candidate = ranked[at]
      absentCoverages.push(candidate.card >= 0 ? coverageWithoutSpan(index, query, absentMatch, candidate.card) : null)
    }
    if (topReal === 0) absentCoverage = absentCoverages[0] ?? null
    const absent = index.absent.byId.get(absentMatch.id)
    const gapCard = absent ? index.cardById.get(absent.gapCard) : undefined
    if (gapCard !== undefined && !disabled.has(index.cards[gapCard].id)) absentGapCard = gapCard
  }
  return {
    text: display ?? text,
    scoringText: text,
    query,
    ranked,
    confs,
    top,
    features,
    topFeatures,
    knn,
    topReal,
    absentMatch,
    absentTargets,
    absentCoverages,
    absentCoverage,
    absentGapCard,
    fallback: fallbackKind(index, query, text, isSymptomReport),
  }
}

/** 카드 종류별 문턱. */
export type ThresholdFn = (kind: AnswerCardKind) => number

/**
 * 공백 카드 자리 at 이 공백 답을 낼 만한지: 묻는 대상인 없는 개념의 공백 카드이거나, 묻는 꼴이 어긋나지 않고(카드 asks 에 질문 묻는 꼴이 있거나, 둘 중 하나가
 * 비었거나, 질문이 예/아니오 꼴) 질문 내용 덮임(IDF) 또는 내용 낱말 덮임(gapWordCoverage)이 GAP_MIN_COVERAGE 이상.
 */
export function gapEligible(index: CompiledAnswerIndex, analysis: Pick<SegmentAnalysis, "ranked" | "query" | "absentTargets">, at: number) {
  const candidate = analysis.ranked[at]
  if (!candidate || candidate.card < 0) return false
  // 질문이 묻는 대상인 없는 개념의 공백 카드면 그대로 공백 답이다(그 주제를 물었다). 꾸미는 자리(modifier)는 아래 덮임 규칙으로 본다.
  for (const item of analysis.absentTargets) {
    if (item.target && item.reason !== "modifier" && index.absent.byId.get(item.match.id)?.gapCard === candidate.id) return true
  }
  // 묻는 꼴: 예/아니오 꼴(되나요·있나요)은 무엇이든 물을 수 있어 어긋남으로 보지 않는다.
  if (analysis.query.askType !== "yesno" && askTypeMatch(index, analysis.query, candidate.card) === 0) return false
  // 덮임: 질문 전체 IDF 덮임, 또는 질문 내용 낱말이 공백 카드 주제·anchors·개념으로 덮이는 몫(공백 카드 자체를 묻는 짧은 질문 — "채팅 기록도
  // 저장되나요"는 IDF 덮임 0.48·낱말 덮임 1.0, 품질-6). 묻는 꼴이 어긋나면 낱말 덮임이 높아도 공백 답을 내지 않는다(방법을 묻는 질문에 맞는 카드가 있을 수 있다).
  return (candidate.check?.coverage ?? 0) >= GAP_MIN_COVERAGE || gapWordCoverage(index, analysis.query, candidate.card) >= GAP_MIN_COVERAGE
}

/** 분석 + 문턱 → 조각 판정(§3.5). */
export function resolveSegment(index: CompiledAnswerIndex, analysis: SegmentAnalysis, threshold: ThresholdFn): SegmentResult {
  const { ranked, confs, topReal, absentMatch } = analysis
  const top1 = ranked[0]
  const realConf = topReal >= 0 ? confs[topReal] : 0
  const base = { text: analysis.text, query: analysis.query, top: analysis.top, features: analysis.features }
  const unexplainedOf = (at: number) => (at >= 0 ? ranked[at].check?.unexplained ?? [] : [])

  const answerable = (at: number) => {
    if (at < 0) return false
    const candidate = ranked[at]
    if (candidate.kind === "none" || candidate.kind === "gap") return false
    return confs[at] >= threshold(candidate.kind)
  }

  // 1. 없는 개념(묻는 대상인 것만): 상위 ABSENT_RECHECK_TOP 안에서 답할 만하고 그 자리를 뺀 질문을 덮는 첫 카드 → 답 + 없는 부분 꼬리.
  if (absentMatch) {
    // 꾸미는 자리(reason modifier)의 없는 개념은 머리 명사가 아니므로 답할 때 꼬리·적중 표시를 하지 않는다.
    const modifier = analysis.absentTargets.some((item) => item.match === absentMatch && item.reason === "modifier")
    for (let at = 0; at < analysis.absentCoverages.length; at += 1) {
      if (!answerable(at) || (analysis.absentCoverages[at] ?? 0) < ABSENT_TAIL_MIN_COVERAGE) continue
      return {
        ...base,
        kind: "answer",
        card: ranked[at].id,
        conf: confs[at],
        unexplained: unexplainedOf(at),
        absentHit: modifier ? null : absentMatch.id,
        absentTail: modifier ? null : absentMatch.id,
        abstainReason: null,
      }
    }
    if (analysis.absentGapCard !== null) {
      return { ...base, kind: "gap", card: index.cards[analysis.absentGapCard].id, conf: ABSENT_GAP_CONF, unexplained: unexplainedOf(topReal), absentHit: absentMatch.id, absentTail: null, abstainReason: null }
    }
    return { ...base, ...analysis.fallback, card: null, conf: realConf, unexplained: unexplainedOf(topReal), absentHit: absentMatch.id, absentTail: null }
  }

  if (top1 && top1.card >= 0) {
    // 3. 공백 카드: 문턱에 더해 묻는 꼴이 어긋나지 않고 질문 내용을 GAP_MIN_COVERAGE 이상 덮을 때만(gapEligible). 아니면 일반 못 찾음.
    if (top1.kind === "gap" && confs[0] >= threshold("gap")) {
      if (!gapEligible(index, analysis, 0)) {
        return { ...base, ...analysis.fallback, card: null, conf: realConf, unexplained: unexplainedOf(topReal), absentHit: null, absentTail: null }
      }
      return { ...base, kind: "gap", card: top1.id, conf: confs[0], unexplained: unexplainedOf(0), absentHit: null, absentTail: null, abstainReason: null }
    }
    // 4. 답
    if (answerable(0)) {
      return { ...base, kind: "answer", card: top1.id, conf: confs[0], unexplained: unexplainedOf(0), absentHit: null, absentTail: null, abstainReason: null }
    }
  }
  // 2·5·6·7. 못 찾음 갈래
  return { ...base, ...analysis.fallback, card: null, conf: realConf, unexplained: unexplainedOf(topReal), absentHit: null, absentTail: null }
}

export function decideSegment(index: CompiledAnswerIndex, text: string, context: DecideContext = {}): SegmentResult {
  const env = context.env ?? process.env
  return resolveSegment(index, analyzeSegment(index, text, context), (kind) => thresholdFor(index, kind, env))
}

// ─── 질문 전체 ───────────────────────────────────────────────────────────

function isDecided(result: Pick<SegmentResult, "kind">) {
  return result.kind === "answer" || result.kind === "gap"
}

/** 결정에 싣는 주의 표시: 원문의 없는 개념 맞춤마다(묻는 대상인지와 그 까닭). */
function cautionsOf(analysis: SegmentAnalysis | undefined): AnswerIndexCaution[] {
  if (!analysis) return []
  return analysis.absentTargets.map((item) => ({
    kind: "absent" as const,
    id: item.match.id,
    form: item.match.form,
    target: item.target,
    reason: item.reason,
  }))
}

function toDecision(result: SegmentResult, segments: AnswerIndexSegmentDecision[] | null, cautions: AnswerIndexCaution[] = []): AnswerIndexDecision {
  const partial = Boolean(result.absentTail) || Boolean(segments && segments.some((segment) => segment.kind !== "answer"))
  return {
    kind: result.kind,
    card: result.card,
    conf: result.conf,
    askType: result.query.askType,
    top: result.top,
    unexplained: result.unexplained,
    absentHit: result.absentHit,
    absentTail: result.absentTail,
    segments,
    features: result.features,
    abstainReason: result.abstainReason ?? null,
    partial: result.kind === "answer" ? partial : false,
    rescue: null,
    ...(cautions.length > 0 ? { cautions } : {}),
  }
}

/** 질문 하나의 분석(원문 + 나눴으면 조각마다). 문턱을 바꿔 가며 resolveDecision 으로 다시 정할 수 있다. */
export interface QuestionAnalysis {
  whole: SegmentAnalysis
  /** 나눈 조각의 분석(질문 순서, 최대 SEGMENT_V2_MAX). 나누지 않았으면 null. */
  parts: SegmentAnalysis[] | null
  /** 최대 조각 수를 넘어 답하지 않는 조각 글(알림 줄 대상). */
  overflow: string[]
  /** 넘겨받은 옛 정규식 표(카드 id). 정해 둔 답 승격이 쓴다. */
  votes: readonly string[]
  /** 표 카드 가운데 증상 판별(symptom:)에서만 나온 카드. 정해 둔 답 승격의 주절 가드가 쓴다. */
  symptomOnlyVotes: ReadonlySet<string>
  /** 조각마다의 옛 정규식 표(조각 글로 센 것, parts 와 같은 순서). 나누지 않았으면 빈 배열. */
  partVotes: readonly (readonly string[])[]
  /** 조각마다 증상 판별에서만 나온 표 카드. */
  partSymptomOnlyVotes: readonly ReadonlySet<string>[]
  /** 정해 둔 답 승격 방식(CHATBOT_COMPILED_VOTE_RESCUE, 분석할 때의 환경변수). */
  voteRescue: VoteRescueMode
  /** 범위 관문(isCompiledScope, 분석할 때의 환경변수). */
  inScope: boolean
}

/** 조각 분석의 비일반 개념(사전 개념 가운데 generic 이 아닌 것). */
function topicConcepts(index: CompiledAnswerIndex, analysis: SegmentAnalysis) {
  return analysis.query.concepts.filter((concept) => {
    const known = index.lexicon.concepts.get(concept.id)
    return Boolean(known) && !known!.generic
  })
}

/**
 * 주제 이어 붙이기(계획 §2.1): 둘째·셋째 조각에 제 주제 개념도 제 내용 낱말(hasOwnTopicWords)도 없으면("되면 어디서 봐요?",
 * "안 오면 어떻게 해요?" — "요금은요?"·"휴대폰으로도 되나요"는 제 주제가 있다) 바로 앞(없으면 그 앞) 조각의 주제 개념 형태를 앞에 붙여
 * 다시 점수를 낸다. 붙인 글은 점수용이며 조각 글(text)은 원문 그대로다.
 */
function withTopicCarry(index: CompiledAnswerIndex, pieces: string[], contexts: DecideContext[]): SegmentAnalysis[] {
  const analyses: SegmentAnalysis[] = []
  for (let at = 0; at < pieces.length; at += 1) {
    const context = contexts[at]
    const own = analyzeSegment(index, pieces[at], context)
    if (at === 0 || topicConcepts(index, own).length > 0 || hasOwnTopicWords(pieces[at])) {
      analyses.push(own)
      continue
    }
    let carried: string[] = []
    for (let back = at - 1; back >= 0 && carried.length === 0; back -= 1) {
      const concepts = topicConcepts(index, analyses[back])
      // 앞 조각의 주절(상황 절 뒤) 개념을 먼저 쓴다("비밀번호 바꾸려는데 인증코드가 어디로 와요?" → 인증코드).
      const main = normalizeText(mainClauseOf(analyses[back].text)).replace(/\s+/g, "")
      const inMain = concepts.filter((concept) => main.includes(concept.form.replace(/\s+/g, "").toLowerCase()))
      carried = Array.from(new Set((inMain.length > 0 ? inMain : concepts).map((concept) => concept.form)))
    }
    analyses.push(carried.length > 0 ? analyzeSegment(index, `${carried.join(" ")} ${pieces[at]}`, context, pieces[at]) : own)
  }
  return analyses
}

/** 표 카드 가운데 증상 판별(symptom:)에서만 나온 카드. */
function symptomOnlyVoteCards(index: CompiledAnswerIndex, question: string, votes: readonly string[], given?: ReadonlyMap<string, readonly string[]>): Set<string> {
  if (votes.length === 0) return new Set()
  const sources = given ?? legacyVoteSources(question, null, index.legacyAlias)
  const out = new Set<string>()
  for (const card of votes) {
    const from = sources.get(card) ?? []
    if (from.length > 0 && from.every((source) => source.startsWith("symptom:"))) out.add(card)
  }
  return out
}

/**
 * 조각마다의 옛 정규식 표: 부르는 쪽이 표를 넘겼으면(votes 가 있으면, 빈 배열 포함) 조각 글로 다시 센다(옛 판별식은 짧은 질문에 맞춰져
 * 있고, 원문 표는 다른 조각의 카드일 수 있다). 표를 넘기지 않았으면 조각도 표 없이 본다.
 */
function partVoteSources(index: CompiledAnswerIndex, pieces: string[], context: DecideContext) {
  if (context.votes === undefined) return pieces.map(() => new Map<string, string[]>())
  return pieces.map((piece) => legacyVoteSources(piece, null, index.legacyAlias))
}

export function analyzeQuestion(index: CompiledAnswerIndex, question: string, context: DecideContext = {}): QuestionAnalysis {
  const env = context.env ?? process.env
  const whole = analyzeSegment(index, question, context)
  const split = splitQuestion(question)
  const pieces = split.segments.length < 2 ? [] : split.segments
  const sources = partVoteSources(index, pieces, context)
  const partVotes = sources.map((map) => Array.from(map.keys()))
  const votes = [...(context.votes ?? [])]
  return {
    whole,
    parts: pieces.length < 2 ? null : withTopicCarry(index, pieces, partVotes.map((list) => ({ ...context, votes: list }))),
    overflow: pieces.length < 2 ? [] : split.overflow,
    votes,
    symptomOnlyVotes: symptomOnlyVoteCards(index, question, votes, context.voteSources),
    partVotes,
    partSymptomOnlyVotes: pieces.map((piece, at) => symptomOnlyVoteCards(index, piece, partVotes[at], sources[at])),
    voteRescue: voteRescueMode(env),
    inScope: isCompiledScope(question, env),
  }
}

/** 조각 판정용 문턱: 그 종류 θ + SEGMENT_CONF_MARGIN. */
export function segmentThreshold(threshold: ThresholdFn): ThresholdFn {
  return (kind) => threshold(kind) + SEGMENT_CONF_MARGIN
}

/** 분석 + 문턱 → 질문 판정(조각은 θ + SEGMENT_CONF_MARGIN, 그다음 정해 둔 답 승격). */
export function resolveDecision(index: CompiledAnswerIndex, analysis: QuestionAnalysis, threshold: ThresholdFn): AnswerIndexDecision {
  const partThreshold = segmentThreshold(threshold)
  const rescueOn = analysis.voteRescue !== "off" && analysis.inScope
  const parts = analysis.parts
    ? analysis.parts.map((part, at) => {
        const result = headConceptGuard(index, part, resolveSegment(index, part, partThreshold))
        if (!rescueOn || result.kind !== "abstain") return result
        // 조각 승격: 그 조각 글로 센 표 카드가 조각 순위 상위 VOTE_RESCUE_TOP 안에 있고 검사를 통과하면 그 카드로 답한다.
        const pick = rescueCandidate(index, part, analysis.partVotes[at] ?? [], analysis.partSymptomOnlyVotes[at] ?? new Set())
        if (pick < 0) return result
        const candidate = part.ranked[pick]
        return {
          ...result,
          kind: "answer" as const,
          card: candidate.id,
          conf: part.confs[pick],
          unexplained: candidate.check?.unexplained ?? [],
          absentHit: null,
          absentTail: null,
          abstainReason: null,
          features: part.topFeatures[pick],
          rescued: true,
        }
      })
    : null
  const base = combineSegments(resolveSegment(index, analysis.whole, threshold), parts, analysis.parts, analysis.overflow, cautionsOf(analysis.whole))
  const rescued = applyVoteRescue(index, analysis, base)
  return annotateSegments(index, analysis, mainClauseRescue(index, analysis, rescued, threshold), threshold)
}

/**
 * 조각의 머리 개념(주절에서 마지막으로 맞은 비일반 개념 — 한국어는 묻는 대상이 술어 바로 앞에 온다): "강사 계정 탈퇴는 어디서 해요"의 '탈퇴'.
 * 주절에 비일반 개념이 없으면 null.
 */
function headConcept(index: CompiledAnswerIndex, analysis: SegmentAnalysis): string | null {
  const main = normalizeText(mainClauseOf(analysis.text)).replace(/\s+/g, "")
  const inMain = topicConcepts(index, analysis).filter((concept) => main.includes(concept.form.replace(/\s+/g, "").toLowerCase()))
  return inMain.length > 0 ? inMain[inMain.length - 1].id : null
}

/**
 * 조각 답의 머리 개념 가드(R2 검토 품질-7): 조각을 답한 카드가 그 조각의 머리 개념을 설명하지 못하면 답하지 않는다(알림 줄로). 낱말이 겹쳐
 * 문턱을 넘은 엉뚱한 카드("강사 계정 탈퇴는 어디서 해요" → 아이디 형식 안내)를 막는다. 공백 카드·없는 개념 판정은 그대로 둔다.
 */
function headConceptGuard(index: CompiledAnswerIndex, analysis: SegmentAnalysis, result: SegmentResult): SegmentResult {
  if (result.kind !== "answer" || !result.card) return result
  const head = headConcept(index, analysis)
  const card = index.cardById.get(result.card)
  // 상위 개념만 겹치는 카드(계정 일반 카드가 '탈퇴'를 묻는 조각)는 설명으로 보지 않는다: 카드 개념(과 그 상위)에 머리 개념 자체가 있어야 한다.
  if (!head || card === undefined || index.cards[card].conceptClosure.has(head)) return result
  return { ...result, ...analysis.fallback, card: null, absentTail: null }
}

/** 한 문장 안의 상황 절 끝('…인데,'·'…한데'·'…지만'·'…앞두고'). 쉼표·마침표로는 가르지 않는다. */
const SITUATION_CLAUSE_END_RE = /(?:는데|은데|인데|한데|던데|지만|니까|앞두고)(?:요)?[,，]?\s+/g

/** 상황 절 뒤 주절(묻는 꼴일 때만). 상황 절이 없으면 null. */
export function situationMainClause(question: string): string | null {
  const parts = question.split(SITUATION_CLAUSE_END_RE).map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const main = parts[parts.length - 1]
  return isAskingSegment(main) && segmentHasContent(main) ? main : null
}

/**
 * 주절 다시 보기(R2 검토 품질-6): 나뉘지 않은 질문을 원문으로 정하지 못했고(못 찾음, 증상 제외) 상황 절('논문 쓰는 대학원생인데,') 뒤 주절이
 * 묻는 꼴이면, 주절만으로 다시 정해 답이 나오면 그 카드로 답한다(상황 설명 낱말이 덮임·확신도를 깎아 맞는 카드가 문턱 밑으로 내려간 경우).
 * 증상 못 찾음·되묻기·답한 판정은 그대로 둔다.
 */
function mainClauseRescue(index: CompiledAnswerIndex, analysis: QuestionAnalysis, decision: AnswerIndexDecision, threshold: ThresholdFn): AnswerIndexDecision {
  if (decision.kind !== "abstain" || decision.abstainReason === "symptom" || decision.segments || analysis.parts) return decision
  const main = situationMainClause(analysis.whole.text)
  if (!main) return decision
  const result = resolveSegment(index, analyzeSegment(index, main, { votes: analysis.votes }), threshold)
  if (result.kind !== "answer" || !result.card) return decision
  return toDecision({ ...result, text: analysis.whole.text }, null, cautionsOf(analysis.whole))
}

const SEGMENT_LABEL_MAX = 14

/**
 * 머리 줄 이름(손님 글이 아닌 사전 형태): 조각 주절의 비일반 개념 형태(없으면 일반 개념) 앞 두 개를 '·'로 잇는다. 14자를 넘으면 앞 하나만.
 */
function segmentLabel(index: CompiledAnswerIndex, analysis: SegmentAnalysis): string | null {
  const main = normalizeText(mainClauseOf(analysis.text)).replace(/\s+/g, "")
  const inMain = (concept: { form: string }) => main.includes(concept.form.replace(/\s+/g, "").toLowerCase())
  const own = analysis.query.concepts.filter((concept) => index.lexicon.concepts.has(concept.id))
  const specific = topicConcepts(index, analysis)
  const pool = [specific.filter(inMain), specific, own.filter(inMain), own].find((list) => list.length > 0) ?? []
  // 동사 꼴 형태("바꿔요"·"채점해요"·"안 켜져요")는 이름으로 쓰지 않고, 띄어쓰기만 다른 형태는 하나로 본다.
  const seen = new Set<string>()
  const forms = pool
    .map((concept) => concept.form.trim())
    .filter((form) => form.length >= 2 && !/(?:요|다|해|돼|되|하|죠)$/.test(form))
    .filter((form) => {
      const key = form.replace(/\s+/g, "")
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  if (forms.length === 0) return null
  const two = forms.slice(0, 2).join("·")
  if (two.length <= SEGMENT_LABEL_MAX) return two
  return forms[0].length <= SEGMENT_LABEL_MAX ? forms[0] : null
}

/**
 * 조각 판정에 답 꼴이 쓰는 표시를 붙인다(R2 검토 품질-3·품질-10·품질-12): 머리 줄 이름(label), 증상 조각(symptom), 못 정한 조각을
 * 그 글만 따로 물었을 때의 판정(alone, 단일 질문 문턱 θ — 주제를 이어 붙여 점수를 냈으면 원문 조각으로 다시 본다). 판정 자체는 바꾸지 않는다.
 */
function annotateSegments(index: CompiledAnswerIndex, analysis: QuestionAnalysis, decision: AnswerIndexDecision, threshold: ThresholdFn): AnswerIndexDecision {
  if (!decision.segments || !analysis.parts) return decision
  const parts = analysis.parts
  const segments = decision.segments.map((segment, at) => {
    const part = at < parts.length ? parts[at] : null
    const alone = () => {
      if (part && part.scoringText === part.text) return part
      return analyzeSegment(index, segment.text, { votes: analysis.partVotes[at] ?? [] })
    }
    const own = part ?? alone()
    const extra: Partial<AnswerIndexSegmentDecision> = {}
    const label = segmentLabel(index, own)
    if (label) extra.label = label
    if (own.fallback.abstainReason === "symptom") extra.symptom = true
    // 따로 물었을 때도 머리 개념 가드를 건다(가드에 걸린 카드로 '따로 물어봐 주세요'를 약속하지 않게).
    if (!isDecided(segment)) {
      const solo = alone()
      extra.alone = headConceptGuard(index, solo, resolveSegment(index, solo, threshold)).kind
    }
    return { ...segment, ...extra }
  })
  return { ...decision, segments }
}

/**
 * NODOC 신호: 반례 'none' 행선 자리가 1위이거나(순위가 비었거나) 우주 이웃의 'none'(문서에 없음) 몫이 VOTE_RESCUE_MAX_KNN_NONE 이상.
 * 결정형이 답하지 않은 판정을 문턱 밖에서 카드 답으로 바꾸는 장치(정해 둔 답 승격, 모델 선택 층 assist.ts)는 이 신호가 있으면 바꾸지 않는다.
 */
export function hasNoDocSignal(analysis: Pick<SegmentAnalysis, "ranked" | "knn">) {
  return analysis.ranked.length === 0 || analysis.ranked[0].card < 0 || analysis.knn.none >= VOTE_RESCUE_MAX_KNN_NONE
}

/** 주절(마지막 절): 상황 절(…는데·…지만·…고·쉼표·문장 끝) 뒤 마지막 조각. */
export function mainClauseOf(question: string) {
  const pieces = question
    .split(/[,，.。!?？\n]|(?:는데|은데|인데|던데|지만|니까)(?:요)?\s/)
    .map((piece) => piece.trim())
    .filter(Boolean)
  return pieces[pieces.length - 1] ?? question
}

/**
 * 정해 둔 답 승격의 표 카드 가드(계획 §3 vote rescue).
 * 증상 판별(symptom:)에서만 나온 표이고, 증상은 앞 절의 상황이고 주절은 방법·위치 질문이며 그 대상(주절의 비일반 개념)을 표 카드가
 * 설명하지 못하면 승격하지 않는다("화면 공유가 안 되는데 지난 코스를 정리하는 방법" → 화면 공유 실패 카드 아님).
 * 정책 카드 승격을 좁히는 일(좁힌 정책 주제가 참일 때만)은 정책 주제 정규식이 있는 service.ts 묶음(B5)이 한다. 개념 겹침으로 막아 보니
 * 사전에 없는 낱말(학원 이름·수량)로 묻는 정책 질문의 맞는 승격 7건이 막혀(input371 good 164→157) 넣지 않았다.
 */
function voteGuardAllows(index: CompiledAnswerIndex, segment: SegmentAnalysis, symptomOnly: ReadonlySet<string>, candidate: RankedCandidate) {
  if (symptomOnly.has(candidate.id)) {
    // 주절이 방법·위치를 묻고 그 대상(주절의 비일반 개념)을 표 카드가 설명하지 못하면 증상 표로 답하지 않는다
    // ("화면 공유가 안 되는데 지난 코스를 정리하는 방법" → 화면 공유 실패 카드 아님). "원인과 조치 방법"처럼 대상이 없으면 그대로 둔다.
    const main = mainClauseOf(segment.text)
    const ask = detectAskType(main)
    const rest = segment.text.slice(0, Math.max(0, segment.text.lastIndexOf(main)))
    if ((ask === "howto" || ask === "where") && INDEX_SYMPTOM_RE.test(rest.toLowerCase())) {
      const query = prepareQuery(index, main)
      const foreign = query.conceptIds.some((id) => {
        const concept = index.lexicon.concepts.get(id)
        return Boolean(concept) && !concept!.generic && !conceptExplained(index, id, candidate.card)
      })
      if (foreign) return false
    }
  }
  return true
}

/** 정해 둔 답 승격으로 고를 순위 자리(없으면 -1). 원문·조각 모두 같은 검사를 쓴다. */
function rescueCandidate(index: CompiledAnswerIndex, segment: SegmentAnalysis, votes: readonly string[], symptomOnly: ReadonlySet<string>) {
  if (votes.length === 0) return -1
  const { ranked } = segment
  // NODOC: 반례 none 자리가 1위이거나 우주 이웃 대부분이 '문서에 없음'이면 승격하지 않는다.
  if (hasNoDocSignal(segment)) return -1
  const voted = new Set(votes)
  const askedAbsent = segment.absentTargets.filter((item) => item.target).map((item) => item.match)
  for (let at = 0; at < Math.min(VOTE_RESCUE_TOP, ranked.length); at += 1) {
    const candidate = ranked[at]
    if (candidate.card < 0 || !voted.has(candidate.id)) continue
    if (!VOTE_RESCUE_KINDS.has(candidate.kind as AnswerCardKind)) continue
    if (index.cards[candidate.card].card.status !== "active") continue
    if (askedAbsent.some((match) => !absentCoveredBy(index, segment.query, match, candidate.card))) continue
    if (!voteGuardAllows(index, segment, symptomOnly, candidate)) continue
    return at
  }
  return -1
}

/**
 * 정해 둔 답 승격(진단 R07, 혼합 P3 꼴). 머리말의 검사를 모두 통과한 옛 정규식 표 카드가 원문 상위 VOTE_RESCUE_TOP 안에 있으면
 * 그 카드로 답한다(표 카드가 여럿이면 순위가 높은 쪽). 기본(below)은 답하지 않던(abstain) 판정만 바꾸고, override 는 다른 카드로
 * 답한 판정도 바꾼다. 이미 그 카드로 답했거나 검사에 걸리면 원래 판정을 그대로 돌려준다.
 */
export function applyVoteRescue(index: CompiledAnswerIndex, analysis: QuestionAnalysis, base: AnswerIndexDecision): AnswerIndexDecision {
  if (analysis.voteRescue === "off" || analysis.votes.length === 0 || !analysis.inScope) return base
  // 공백(없는 개념·공백 카드)·되묻기는 그대로 둔다. 답은 override 일 때만, 조각을 이은 답은 언제나 그대로 둔다.
  if (base.kind === "gap" || base.kind === "clarify") return base
  if (base.kind === "answer" && (analysis.voteRescue !== "override" || base.segments)) return base
  const whole = analysis.whole
  const at = rescueCandidate(index, whole, analysis.votes, analysis.symptomOnlyVotes)
  if (at < 0) return base
  const candidate = whole.ranked[at]
  if (base.kind === "answer" && base.card === candidate.id) return base
  // 나눈 질문(조각이 모두 못 정함)이면 승격 카드를 그 카드 순위가 가장 높은 조각에 붙인다(어느 조각 상위에도 없으면 모든 조각).
  let segments: AnswerIndexSegmentDecision[] | null = null
  if (base.segments && analysis.parts) {
    const parts = analysis.parts
    const ranks = parts.map((part) => rankIn(part, candidate.id))
    const best = Math.min(...ranks)
    segments = base.segments.map((segment, position) =>
      position < parts.length && (best === Infinity || ranks[position] === best)
        ? { ...segment, kind: "answer" as const, card: candidate.id, conf: whole.confs[at], by: "index" as const, source: "whole" as const, rescue: "vote" as const }
        : segment
    )
  }
  return {
    kind: "answer",
    card: candidate.id,
    conf: whole.confs[at],
    askType: whole.query.askType,
    top: whole.top,
    unexplained: candidate.check?.unexplained ?? [],
    absentHit: null,
    absentTail: null,
    segments,
    features: whole.topFeatures[at],
    abstainReason: null,
    partial: Boolean(segments && segments.some((segment) => segment.kind !== "answer")),
    rescue: "vote",
    ...(base.cautions && base.cautions.length > 0 ? { cautions: base.cautions } : {}),
  }
}

/**
 * decide 와 같은 판정에 그 분석(원문·조각의 순위·확신도)을 같이 돌려준다. 라벨용 상위 카드 덤프(scripts/answer-index/topk.ts)가
 * 런타임 판정을 따로 다시 짜지 않고 이 함수로 결정과 순위를 함께 얻는다.
 */
export function decideWithAnalysis(
  index: CompiledAnswerIndex,
  question: string,
  context: DecideContext = {}
): { decision: AnswerIndexDecision; analysis: QuestionAnalysis } {
  const env = context.env ?? process.env
  const analysis = analyzeQuestion(index, question, context)
  return { decision: resolveDecision(index, analysis, (kind) => thresholdFor(index, kind, env)), analysis }
}

/** 질문 하나의 판정(§3.3 ②~⑦, §3.5). question 은 가린 글(question.redacted)을 받는다. */
export function decide(index: CompiledAnswerIndex, question: string, context: DecideContext = {}): AnswerIndexDecision {
  return decideWithAnalysis(index, question, context).decision
}

interface SegmentSlot {
  text: string
  kind: AnswerIndexDecisionKind
  card: string | null
  conf: number
  source: NonNullable<AnswerIndexSegmentDecision["source"]> | null
  scoringText: string | null
  absentHit: string | null
  /** 이 조각만 물었을 때 1위 실제 카드와 확신도(알림 줄이 '있을 법한 카드'를 가리는 데 쓴다). */
  topCard: string | null
  topConf: number | null
  /** 이 자리를 정한 판정(답·공백일 때). */
  result: SegmentResult | null
}

function slotRescued(slot: SegmentSlot) {
  return Boolean(slot.result?.rescued)
}

function slotDecision(slot: SegmentSlot): AnswerIndexSegmentDecision {
  return {
    text: slot.text,
    kind: slot.kind,
    card: slot.card,
    conf: slot.conf,
    by: slot.card && isDecided(slot) ? "index" : "none",
    ...(slot.source ? { source: slot.source } : {}),
    ...(slot.scoringText ? { scoringText: slot.scoringText } : {}),
    ...(slot.absentHit ? { absentHit: slot.absentHit } : {}),
    ...(slot.topCard ? { topCard: slot.topCard, topConf: slot.topConf ?? 0 } : {}),
    ...(slotRescued(slot) ? { rescue: "vote" as const } : {}),
  }
}

/** 조각 분석 안에서 카드의 순위(상위 CHECK_TOP 밖이면 Infinity). */
function rankIn(analysis: SegmentAnalysis, card: string | null) {
  if (!card) return Infinity
  const at = analysis.ranked.slice(0, CHECK_TOP).findIndex((candidate) => candidate.id === card)
  return at < 0 ? Infinity : at
}

/**
 * 조각 판정 잇기(계획 §2.1). 조각은 질문 순서대로 둔다(답한 것 먼저가 아니다).
 * 1. 모든 조각의 1위 카드가 같고 원문도 그 카드로 정했으면 한 카드 답(확신도가 높은 쪽 판정, 조각은 모두 그 카드).
 * 2. 조각마다 제 판정. 못 정한 조각은 (a) 그 조각 1위가 다른 조각이 답한 카드면 그 카드(shared), (b) 원문이 정한 카드가 그 조각 1위면
 *    원문 판정(whole)으로 채운다. 원문 판정이 조각 판정을 덮지는 않는다(서로 다른 주제 조각).
 * 3. 어느 조각도 정하지 못했으면: 원문이 정했으면 원문 카드를 그 카드 순위가 가장 높은 조각에 붙이고(어느 조각 상위에도 없으면 모든 조각),
 *    원문도 못 정했으면 원문 판정(못 찾음·되묻기)에 조각 기록만 싣는다.
 * 4. 최대 조각 수를 넘은 조각은 abstain(overflow)으로 뒤에 붙인다(알림 줄 대상).
 * 결정 카드는 질문 순서로 처음 정한 조각의 카드, 결정 종류는 답한 조각이 있으면 answer 아니면 gap 이다.
 */
function combineSegments(
  whole: SegmentResult,
  parts: SegmentResult[] | null,
  analyses: SegmentAnalysis[] | null,
  overflow: readonly string[],
  cautions: AnswerIndexCaution[]
): AnswerIndexDecision {
  if (!parts || !analyses || parts.length < 2) return toDecision(whole, null, cautions)
  const tops = analyses.map((analysis) => (analysis.topReal >= 0 ? analysis.ranked[analysis.topReal].id : null))
  const wholeDecided = isDecided(whole)
  const slots: SegmentSlot[] = parts.map((part, at) => ({
    text: analyses[at].text,
    kind: part.kind,
    card: isDecided(part) ? part.card : null,
    conf: part.conf,
    source: isDecided(part) ? "segment" : null,
    scoringText: analyses[at].scoringText !== analyses[at].text ? analyses[at].scoringText : null,
    absentHit: part.absentHit,
    topCard: analyses[at].topReal >= 0 ? analyses[at].ranked[analyses[at].topReal].id : null,
    topConf: analyses[at].topReal >= 0 ? (analyses[at].confs[analyses[at].topReal] ?? null) : null,
    result: isDecided(part) ? part : null,
  }))
  const overflowSlots: AnswerIndexSegmentDecision[] = overflow.map((text) => ({ text, kind: "abstain", card: null, conf: 0, by: "none", source: "overflow" }))
  const listed = () => [...slots.map(slotDecision), ...overflowSlots]
  const fill = (slot: SegmentSlot, from: SegmentResult, source: SegmentSlot["source"]) => {
    slot.kind = from.kind
    slot.card = from.card
    slot.conf = from.conf
    slot.source = source
    slot.result = from
  }

  // 1. 같은 주제.
  const sameTopic = tops.every((top) => top !== null && top === tops[0])
  if (sameTopic && wholeDecided && whole.card === tops[0]) {
    const best = parts.filter((part) => isDecided(part) && part.card === whole.card).reduce<SegmentResult | null>((a, b) => (!a || b.conf > a.conf ? b : a), null)
    const chosen = best && best.conf > whole.conf ? best : whole
    for (const slot of slots) fill(slot, chosen, slot.source === "segment" ? "segment" : "whole")
    const decision = toDecision(chosen, listed(), cautions)
    return {
      ...decision,
      rescue: chosen.rescued ? "vote" : null,
      partial: chosen.kind === "answer" ? Boolean(chosen.absentTail) || overflowSlots.length > 0 : false,
    }
  }

  // 2. 조각마다.
  const answeredBy = new Map<string, SegmentResult>()
  for (const slot of slots) if (slot.result && slot.card) answeredBy.set(slot.card, slot.result)
  slots.forEach((slot, at) => {
    if (slot.result) return
    const top = tops[at]
    if (top && answeredBy.has(top)) {
      const from = answeredBy.get(top)!
      fill(slot, { ...from, conf: parts[at].conf }, "shared")
    } else if (wholeDecided && whole.card && whole.card === top && !answeredBy.has(whole.card)) {
      fill(slot, whole, "whole")
      answeredBy.set(whole.card, whole)
    }
  })

  // 3. 어느 조각도 못 정함.
  if (!slots.some((slot) => slot.result)) {
    if (!wholeDecided) return toDecision(whole, listed(), cautions)
    const ranks = analyses.map((analysis) => rankIn(analysis, whole.card))
    const best = Math.min(...ranks)
    slots.forEach((slot, at) => {
      if (best === Infinity || ranks[at] === best) fill(slot, whole, "whole")
    })
  }

  // 4. 질문 순서로 잇는다.
  const decided = slots.filter((slot) => slot.result)
  const primary = decided[0].result!
  const anyAnswer = decided.some((slot) => slot.kind === "answer")
  const absentTail = primary.absentTail ?? decided.map((slot) => slot.result!.absentTail).find(Boolean) ?? null
  const combined: SegmentResult = {
    ...primary,
    kind: anyAnswer ? "answer" : "gap",
    conf: Math.min(...decided.map((slot) => slot.conf)),
    unexplained: Array.from(new Set(parts.flatMap((part) => part.unexplained))),
    absentHit: parts.find((part) => part.absentHit)?.absentHit ?? primary.absentHit ?? null,
    absentTail,
  }
  const segments = listed()
  const distinct = new Set(decided.map((slot) => slot.card))
  const decision = toDecision(combined, segments, cautions)
  const rescue = slotRescued(decided[0]) ? ("vote" as const) : null
  // 모든 조각이 같은 카드 하나로 답했으면 조각 기록은 두되 꼬리는 없다.
  if (distinct.size === 1 && decided.length === slots.length && overflowSlots.length === 0) {
    return { ...decision, rescue, partial: decision.kind === "answer" ? Boolean(absentTail) : false }
  }
  return { ...decision, rescue }
}

// ─── 흔적(§3.7) ──────────────────────────────────────────────────────────

export interface TraceMeta {
  version: string
  router: AnswerIndexRouter
}

/**
 * ChatbotCore.answerIndex 흔적. card 는 고른 카드(answer 의 답 카드, gap 의 공백 카드 — 없는 개념으로 간 gap 이면 absent.gapCard),
 * absentHit 은 없는 개념 id, partial 은 꼬리(없는 부분 한 줄·못 찾은 조각 한 줄)를 붙였는지다.
 * decidedBy 는 정해 둔 답 승격으로 답했으면 index:vote-rescue(아니면 null)다.
 * 측정 스크립트(scripts/lib/chatbot-live-eval-checks.ts decidedByFromAnswerIndex)가 이 칸으로 decidedBy 를 만든다.
 */
export function toAnswerIndexTrace(decision: AnswerIndexDecision, meta: TraceMeta): AnswerIndexTrace {
  return {
    version: meta.version,
    router: meta.router,
    scope: "in",
    decision: decision.kind,
    top: decision.top.slice(0, 3),
    conf: decision.conf,
    unexplained: decision.unexplained,
    absentHit: decision.absentHit,
    segments: decision.segments ? decision.segments.length : 1,
    ...(decision.segments ? { parts: decision.segments.map(traceSegmentOf) } : {}),
    card: decision.kind === "answer" || decision.kind === "gap" ? decision.card : null,
    partial: Boolean(decision.partial),
    absentTail: decision.absentTail,
    decidedBy: decision.rescue === "vote" ? "index:vote-rescue" : null,
  }
}

function traceSegmentOf(segment: AnswerIndexSegmentDecision): AnswerIndexTraceSegment {
  const decided = segment.kind === "answer" || segment.kind === "gap"
  return {
    text: segment.text,
    kind: segment.kind,
    card: segment.card,
    by: segment.by ?? (segment.card && decided ? "index" : "none"),
    ...(segment.source ? { source: segment.source } : {}),
    ...(segment.topCard ? { topCard: segment.topCard, topConf: segment.topConf ?? 0 } : {}),
    notice: !decided,
    ...(segment.alone ? { alone: segment.alone } : {}),
  }
}

/** 범위 밖 질문의 흔적(legacy 흐름으로 감). */
export function outOfScopeTrace(meta: TraceMeta): AnswerIndexTrace {
  return { version: meta.version, router: meta.router, scope: "out", decision: null, top: [], conf: null, unexplained: [], absentHit: null, segments: 0, card: null, partial: false, absentTail: null }
}
