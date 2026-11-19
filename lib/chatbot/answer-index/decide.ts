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
 *   짧은 질문은 최대 두 조각으로 나눠(segmentQuestion) 조각마다 정하고, 원문 전체로도 정한다.
 *   - 두 조각이 서로 다른 카드로 답(또는 공백)하면 두 조각 판정을 잇는다(각 조각이 제 문턱을 넘었다).
 *   - 한 조각만 답하면, 원문 판정의 확신도가 그 조각보다 높을 때 원문을 쓰고 아니면 '그 답 + 나머지 조각 못 찾음 한 줄'.
 *   - 두 조각이 같은 카드면 하나로 본다.
 * 반례: 상위 5 후보마다 negMargin > 0 이면 탈락, 반례 행선 카드에 NEG_ROUTE_BONUS × 반례 코사인 가산, 행선이 none 이면
 * 탈락한 카드 점수로 'none' 자리를 만든다(1위가 되면 못 찾음).
 * 끈 카드(CHATBOT_COMPILED_DISABLED_CARDS)는 후보·이웃 라벨·표·반례 행선·없는 개념 공백 카드에서 빠지고 다음 순위가 경쟁한다.
 */
import { prepareQuery, type CompiledAnswerIndex, type IndexQuery } from "./compile"
import { absentCoveredBy, checkCandidate, coverageWithoutSpan, NEG_ROUTE_BONUS, scoreNegatives, type CandidateCheck } from "./checks"
import type { AbsentMatch } from "./lexicon"
import { INDEX_SYMPTOM_RE, segmentQuestion } from "./normalize"
import { compositeScore, confidenceOf, scoreCandidates, sortCandidates, type ScoreComponents } from "./score"
import type {
  AnswerCardKind,
  AnswerIndexCandidate,
  AnswerIndexDecision,
  AnswerIndexFeatures,
  AnswerIndexRouter,
  AnswerIndexSegmentDecision,
  AnswerIndexTrace,
} from "./types"

export const CHECK_TOP = 5
export const TRACE_TOP = 5
/** 없는 개념 자리를 뺀 질문을 1위 카드가 이만큼 덮으면 '답 + 없는 부분 꼬리', 아니면 공백 카드. */
export const ABSENT_TAIL_MIN_COVERAGE = 0.6
/** 규칙으로 정한 공백(없는 개념)의 확신도. */
export const ABSENT_GAP_CONF = 1
const NONE_ID = "none"

type Env = Record<string, string | undefined>

export interface DecideContext {
  /** collectLegacyVotes 가 카드 id 로 바꾼 옛 정규식 표. */
  votes?: readonly string[]
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
}

function askTypeMatch(index: CompiledAnswerIndex, query: IndexQuery, card: number) {
  const asks = index.cards[card].asks
  if (!query.askType || asks.length === 0) return 0.5
  return asks.includes(query.askType) ? 1 : 0
}

function featuresOf(index: CompiledAnswerIndex, query: IndexQuery, ranked: RankedCandidate[], at: number, absentHit: boolean): AnswerIndexFeatures {
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
  return { ranked, knn: scored.knn }
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
  text: string
  query: IndexQuery
  ranked: RankedCandidate[]
  confs: number[]
  top: AnswerIndexCandidate[]
  /** 1위 실제 카드(none 자리 제외)의 특징. */
  features: AnswerIndexFeatures | undefined
  /** ranked 안 첫 실제 카드 위치(-1 이면 없음). */
  topReal: number
  /** 1위 카드가 덮지 않은 없는 개념(첫째). */
  absentMatch: AbsentMatch | null
  /** 없는 개념 자리를 뺀 질문을 1위 카드가 덮는 비율(1위가 실제 카드이고 absentMatch 가 있을 때만). */
  absentCoverage: number | null
  /** absentMatch 의 공백 카드 번호(색인에 있고 꺼지지 않았을 때). */
  absentGapCard: number | null
  /** 못 찾음 갈래(문턱과 무관). */
  fallback: { kind: "clarify" | "abstain"; abstainReason: AnswerIndexDecision["abstainReason"] }
}

export function analyzeSegment(index: CompiledAnswerIndex, text: string, context: DecideContext = {}): SegmentAnalysis {
  const env = context.env ?? process.env
  const disabled = disabledCardIds(env)
  const isSymptomReport = context.isSymptomReport ?? ((value: string) => INDEX_SYMPTOM_RE.test(value.toLowerCase()))
  const query = prepareQuery(index, text)
  const { ranked } = rankWithChecks(index, query, context.votes ?? [], disabled)

  const topReal = ranked.findIndex((candidate) => candidate.card >= 0)
  const uncovered = topReal >= 0 ? query.absent.filter((match) => !absentCoveredBy(index, query, match, ranked[topReal].card)) : query.absent
  const absentMatch = uncovered[0] ?? null

  const confs = ranked.map((candidate, at) =>
    candidate.card >= 0 ? confidenceOf(featuresOf(index, query, ranked, at, Boolean(absentMatch)), candidate.kind as AnswerCardKind, index.calibration) : 0
  )
  const top: AnswerIndexCandidate[] = ranked.slice(0, TRACE_TOP).map((candidate, at) => ({ id: candidate.id, s: candidate.s, conf: confs[at] }))
  const features = topReal >= 0 ? featuresOf(index, query, ranked, topReal, Boolean(absentMatch)) : undefined
  let absentCoverage: number | null = null
  let absentGapCard: number | null = null
  if (absentMatch) {
    if (topReal === 0) absentCoverage = coverageWithoutSpan(index, query, absentMatch, ranked[0].card)
    const absent = index.absent.byId.get(absentMatch.id)
    const gapCard = absent ? index.cardById.get(absent.gapCard) : undefined
    if (gapCard !== undefined && !disabled.has(index.cards[gapCard].id)) absentGapCard = gapCard
  }
  return { text, query, ranked, confs, top, features, topReal, absentMatch, absentCoverage, absentGapCard, fallback: fallbackKind(index, query, text, isSymptomReport) }
}

/** 카드 종류별 문턱. */
export type ThresholdFn = (kind: AnswerCardKind) => number

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

  // 1. 없는 개념
  if (absentMatch) {
    if (topReal === 0 && answerable(0) && (analysis.absentCoverage ?? 0) >= ABSENT_TAIL_MIN_COVERAGE) {
      return {
        ...base,
        kind: "answer",
        card: ranked[0].id,
        conf: confs[0],
        unexplained: unexplainedOf(0),
        absentHit: absentMatch.id,
        absentTail: absentMatch.id,
        abstainReason: null,
      }
    }
    if (analysis.absentGapCard !== null) {
      return { ...base, kind: "gap", card: index.cards[analysis.absentGapCard].id, conf: ABSENT_GAP_CONF, unexplained: unexplainedOf(topReal), absentHit: absentMatch.id, absentTail: null, abstainReason: null }
    }
    return { ...base, ...analysis.fallback, card: null, conf: realConf, unexplained: unexplainedOf(topReal), absentHit: absentMatch.id, absentTail: null }
  }

  if (top1 && top1.card >= 0) {
    // 3. 공백 카드
    if (top1.kind === "gap" && confs[0] >= threshold("gap")) {
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

function isDecided(result: SegmentResult) {
  return result.kind === "answer" || result.kind === "gap"
}

function toDecision(result: SegmentResult, segments: SegmentResult[] | null): AnswerIndexDecision {
  const segmentDecisions: AnswerIndexSegmentDecision[] | null = segments
    ? segments.map((segment) => ({ text: segment.text, kind: segment.kind, card: segment.card, conf: segment.conf }))
    : null
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
    segments: segmentDecisions,
    features: result.features,
    abstainReason: result.abstainReason ?? null,
    partial: result.kind === "answer" ? partial : false,
  }
}

/** 질문 하나의 분석(원문 + 두 조각이면 조각마다). 문턱을 바꿔 가며 resolveDecision 으로 다시 정할 수 있다. */
export interface QuestionAnalysis {
  whole: SegmentAnalysis
  parts: SegmentAnalysis[] | null
}

export function analyzeQuestion(index: CompiledAnswerIndex, question: string, context: DecideContext = {}): QuestionAnalysis {
  const whole = analyzeSegment(index, question, context)
  const pieces = segmentQuestion(question)
  return { whole, parts: pieces.length < 2 ? null : pieces.map((piece) => analyzeSegment(index, piece, context)) }
}

/** 분석 + 문턱 → 질문 판정. */
export function resolveDecision(index: CompiledAnswerIndex, analysis: QuestionAnalysis, threshold: ThresholdFn): AnswerIndexDecision {
  return combineSegments(
    resolveSegment(index, analysis.whole, threshold),
    analysis.parts ? analysis.parts.map((part) => resolveSegment(index, part, threshold)) : null
  )
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

function combineSegments(whole: SegmentResult, parts: SegmentResult[] | null): AnswerIndexDecision {
  if (!parts) return toDecision(whole, null)
  const decided = parts.filter(isDecided)
  if (decided.length === 0) return toDecision(whole, null)

  const cards = new Set(decided.map((part) => part.card))
  if (cards.size === 1) {
    // 두 조각이 같은 카드(또는 한 조각만 답함)
    const best = decided.reduce((a, b) => (b.conf > a.conf ? b : a))
    if (decided.length === 2) return toDecision(isDecided(whole) && whole.card === best.card && whole.conf >= best.conf ? whole : best, null)
    if (isDecided(whole) && whole.conf > best.conf) return toDecision(whole, null)
  }
  // 두 조각을 잇는다: 답한 조각이 먼저, 공백 조각이 다음.
  const primary = decided.find((part) => part.kind === "answer") ?? decided[0]
  const combined: SegmentResult = {
    ...primary,
    kind: primary.kind,
    conf: Math.min(...decided.map((part) => part.conf)),
    unexplained: Array.from(new Set(parts.flatMap((part) => part.unexplained))),
    absentHit: parts.find((part) => part.absentHit)?.absentHit ?? null,
  }
  return toDecision(combined, parts)
}

// ─── 흔적(§3.7) ──────────────────────────────────────────────────────────

export interface TraceMeta {
  version: string
  router: AnswerIndexRouter
}

/**
 * ChatbotCore.answerIndex 흔적. card 는 고른 카드(answer 의 답 카드, gap 의 공백 카드 — 없는 개념으로 간 gap 이면 absent.gapCard),
 * absentHit 은 없는 개념 id, partial 은 꼬리(없는 부분 한 줄·못 찾은 조각 한 줄)를 붙였는지다.
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
    card: decision.kind === "answer" || decision.kind === "gap" ? decision.card : null,
    partial: Boolean(decision.partial),
    absentTail: decision.absentTail,
  }
}

/** 범위 밖 질문의 흔적(legacy 흐름으로 감). */
export function outOfScopeTrace(meta: TraceMeta): AnswerIndexTrace {
  return { version: meta.version, router: meta.router, scope: "out", decision: null, top: [], conf: null, unexplained: [], absentHit: null, segments: 0, card: null, partial: false, absentTail: null }
}
