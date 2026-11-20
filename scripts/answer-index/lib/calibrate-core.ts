/**
 * 보정(답 색인 사양 §8.2, I9): 보정 묶음(eval/calibration-set.json, D10)으로 점수 가중치·카드 종류별 확신도 계수·문턱을 정한다.
 *
 * 1. 맞춤 자료: 라벨이 정해진 문항(final, 또는 두 라벨이 같음, 또는 라벨 하나만 있음)만 쓴다. missing:* 라벨과
 *    색인에 없는 카드 라벨은 뺀다(셈만 남긴다). id 의 sha256 순으로 늘어놓아 앞 2/3 은 맞춤용, 뒤 1/3 은 확인용이다.
 * 2. 확신도: 카드 종류별로 '1위 카드가 라벨과 같은가'를 맞히는 로지스틱 회귀. 특징은 ANSWER_INDEX_FEATURES 순서(§3.3 ⑥ 13개 +
 *    우주 이웃 수 knnCount1, 진단 R02)이고 featureVector 로 만든다. L2 λ=1(절편 제외),
 *    IRLS 25회, 고정 순서 → 같은 입력이면 같은 계수. 문항이 20개 미만이거나 한쪽 답만 있는 종류는 기본 계수를 둔다.
 * 3. 가중치: 확인용에서 작은 격자(maxcos 비 {0.2,0.3,0.4}·centroid = 1 − 그 비, knn {0.3,0.5,0.7}, vote {0,0.15,0.3},
 *    bm25f {0,0.1,0.2})를 훑는다. 격자 점마다 맞춤용으로 계수를 다시 맞추고 확인용 대리 점수(기본 문턱)로 고른다.
 *    고른 점에서 vote 를 0 으로 해도 0.5점 넘게 떨어지지 않으면 vote 는 0 이다(§3.4).
 * 4. 문턱: 종류별 θ ∈ {0.30, 0.325, …, 0.90}을 확인용에서 종류마다 차례로(두 번 돌림) 고른다. 목적은 '문서에 없음' 비율을
 *    20·25·30%로 다시 가중한 세 대리 점수의 평균이고, 부트스트랩(1,000회, 고정 시드) 10번째 백분위수가 가장 높은 θ 를 쓴다.
 *    세 비율 사이 점수 차가 1점을 넘는 θ 는 버린다(모두 넘으면 차가 가장 작은 θ 들 가운데서 고른다). 점수가 같으면 지금 θ 를 둔다.
 *
 * 대리 채점(문항 하나의 기대 점수):
 *   라벨이 카드: 그 카드로 답함 → 1 − 0.5 × 일부만 답함 비율(카드 종류별, 처음에는 doc 0.15·fixed 0.05), 꼬리 붙은 답 → 0.5,
 *               다른 카드·못 찾음·공백·되묻기 → 0
 *   라벨이 none·gap:* (문서에 없음): 못 찾음·공백 → 1, 답·되묻기 → 0
 *   라벨이 clarify: 되묻기·못 찾음 → 1, 답·공백 → 0
 *
 * 보정 묶음이 없거나 쓸 문항이 없으면 기본값(compile.ts DEFAULT_*)으로 calibration.json 을 만든다.
 * 런타임 calibration.json 을 읽지 않고 기본값에서 시작한다(같은 자료 → 같은 결과). assist 칸은 지금 파일 값을 그대로 둔다.
 */
import { createHash } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import {
  compileAnswerIndex,
  DEFAULT_CONFIDENCE,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  resolveCalibration,
  type CompiledAnswerIndex,
  type ResolvedCalibration,
} from "@/lib/chatbot/answer-index/compile"
import { curatedTextHash } from "@/lib/chatbot/answer-index/curated"
import { analyzeQuestion, resolveDecision, type QuestionAnalysis } from "@/lib/chatbot/answer-index/decide"
import { loadAnswerIndexData, type AnswerIndexLoadOptions } from "@/lib/chatbot/answer-index/load"
import { featureVector } from "@/lib/chatbot/answer-index/score"
import {
  ANSWER_CARD_KINDS,
  type AnswerCardKind,
  type AnswerIndexDecision,
  type CalibrationFile,
  type CalibrationSetFile,
  type CalibrationSetItem,
  type ScoreComponent,
} from "@/lib/chatbot/answer-index/types"
import { createRng } from "../score"
import { calibrationBasisVersion } from "./manifest"

export const CALIBRATION_SET_FILE = "eval/calibration-set.json"
export const NODOC_RATES = [0.2, 0.25, 0.3] as const
export const THRESHOLD_GRID = Array.from({ length: 25 }, (_, step) => Math.round((0.3 + step * 0.025) * 1000) / 1000)
export const LOGISTIC_LAMBDA = 1
export const IRLS_ITERATIONS = 25
export const MIN_KIND_EXAMPLES = 20
export const BOOTSTRAP_RESAMPLES = 1000
export const CALIBRATION_SEED = 20261125
export const VOTE_KEEP_MIN_GAIN = 0.5
export const SPREAD_MAX_POINTS = 1
export const DEFAULT_PARTIAL_RATES: Record<AnswerCardKind, number> = { doc: 0.15, howto: 0.15, fixed: 0.05, policy: 0.05, gap: 0, handoff: 0.05 }
export const DEFAULT_ASSIST: CalibrationFile["assist"] = { enabled: false, band: [0.45, 0.62], checkedOn: [] }

/** §8.2 3 의 가중치 격자(81점). 순서가 곧 같은 점수일 때의 우선순위다. */
export function weightGrid(): Record<ScoreComponent, number>[] {
  const grid: Record<ScoreComponent, number>[] = []
  for (const ratio of [0.2, 0.3, 0.4])
    for (const knnShare of [0.3, 0.5, 0.7])
      for (const vote of [0, 0.15, 0.3])
        for (const bm25f of [0, 0.1, 0.2]) grid.push({ maxcos: ratio, centroid: Math.round((1 - ratio) * 1000) / 1000, knnShare, vote, bm25f, linear: 0 })
  return grid
}

// ─── 문항 ────────────────────────────────────────────────────────────────

export interface CalibrationExample {
  id: string
  q: string
  label: string
  /** none·gap:* (문서에 없음). */
  nodoc: boolean
}

export interface ExampleSplit {
  fit: CalibrationExample[]
  check: CalibrationExample[]
  skipped: { unresolved: number; missing: number; unknownCard: number }
}

/** 문항의 최종 라벨: final → 두 라벨이 같음 → 라벨 하나만 있음. 엇갈리고 final 이 없으면 null. */
export function finalLabel(item: Pick<CalibrationSetItem, "label" | "label2" | "final">): string | null {
  if (typeof item.final === "string" && item.final) return item.final
  if (item.label && item.label2) return item.label === item.label2 ? item.label : null
  return item.label || item.label2 || null
}

function sha256(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

/** 쓸 문항을 골라 id 의 sha256 순으로 늘어놓고 앞 2/3 은 맞춤용, 뒤 1/3 은 확인용으로 나눈다. */
export function splitExamples(items: readonly CalibrationSetItem[], index: CompiledAnswerIndex): ExampleSplit {
  const skipped = { unresolved: 0, missing: 0, unknownCard: 0 }
  const usable: CalibrationExample[] = []
  for (const item of items) {
    if (!item || typeof item.id !== "string" || typeof item.q !== "string" || !item.q.trim()) continue
    const label = finalLabel(item)
    if (!label) {
      skipped.unresolved += 1
      continue
    }
    if (label.startsWith("missing:")) {
      skipped.missing += 1
      continue
    }
    const nodoc = label === "none" || label.startsWith("gap:")
    if (!nodoc && label !== "clarify" && !index.cardById.has(label)) {
      skipped.unknownCard += 1
      continue
    }
    usable.push({ id: item.id, q: item.q, label, nodoc })
  }
  const ordered = usable
    .map((example) => ({ example, key: sha256(example.id) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.example.id.localeCompare(b.example.id)))
    .map((entry) => entry.example)
  const fitCount = Math.ceil((ordered.length * 2) / 3)
  return { fit: ordered.slice(0, fitCount), check: ordered.slice(fitCount), skipped }
}

// ─── 대리 채점 ───────────────────────────────────────────────────────────

export function examplePoints(
  example: CalibrationExample,
  decision: AnswerIndexDecision,
  index: CompiledAnswerIndex,
  partialRates: Record<AnswerCardKind, number> = DEFAULT_PARTIAL_RATES
): number {
  const notFound = decision.kind === "abstain" || decision.kind === "gap"
  if (example.nodoc) return notFound ? 1 : 0
  if (example.label === "clarify") return decision.kind === "clarify" || decision.kind === "abstain" ? 1 : 0
  if (decision.kind !== "answer" || decision.card !== example.label) return 0
  if (decision.partial) return 0.5
  const at = index.cardById.get(example.label)
  const kind = at === undefined ? "doc" : index.cards[at].kind
  return 1 - 0.5 * (partialRates[kind] ?? 0)
}

/** '문서에 없음' 비율을 rate 로 다시 가중한 점수(0~100). 한쪽이 없으면 단순 평균. */
export function weightedScore(points: ArrayLike<number>, nodoc: ArrayLike<boolean>, rate: number, pick?: ArrayLike<number>) {
  let nodocSum = 0
  let nodocCount = 0
  let docSum = 0
  let docCount = 0
  const n = pick ? pick.length : points.length
  for (let k = 0; k < n; k += 1) {
    const i = pick ? pick[k] : k
    if (nodoc[i]) {
      nodocSum += points[i]
      nodocCount += 1
    } else {
      docSum += points[i]
      docCount += 1
    }
  }
  if (nodocCount === 0 && docCount === 0) return 0
  if (nodocCount === 0) return (docSum / docCount) * 100
  if (docCount === 0) return (nodocSum / nodocCount) * 100
  return (rate * (nodocSum / nodocCount) + (1 - rate) * (docSum / docCount)) * 100
}

export function meanRateScore(points: ArrayLike<number>, nodoc: ArrayLike<boolean>, pick?: ArrayLike<number>) {
  let sum = 0
  for (const rate of NODOC_RATES) sum += weightedScore(points, nodoc, rate, pick)
  return sum / NODOC_RATES.length
}

export function rateSpread(points: ArrayLike<number>, nodoc: ArrayLike<boolean>) {
  const scores = NODOC_RATES.map((rate) => weightedScore(points, nodoc, rate))
  return Math.max(...scores) - Math.min(...scores)
}

/** 같은 재표본을 모든 후보에 쓴다(공통 난수). */
export function bootstrapSamples(n: number, resamples = BOOTSTRAP_RESAMPLES, seed = CALIBRATION_SEED) {
  const rng = createRng(seed)
  const samples: Int32Array[] = []
  for (let b = 0; b < resamples; b += 1) {
    const pick = new Int32Array(n)
    for (let k = 0; k < n; k += 1) pick[k] = Math.floor(rng() * n)
    samples.push(pick)
  }
  return samples
}

/** 부트스트랩 10번째 백분위수(세 비율 평균 점수). */
export function bootstrapP10(points: ArrayLike<number>, nodoc: ArrayLike<boolean>, samples: readonly Int32Array[]) {
  if (samples.length === 0 || points.length === 0) return 0
  const scores = samples.map((pick) => meanRateScore(points, nodoc, pick)).sort((a, b) => a - b)
  return scores[Math.floor(samples.length * 0.1)]
}

// ─── 로지스틱 회귀(IRLS) ─────────────────────────────────────────────────

function solve(matrix: number[][], vector: number[]): number[] | null {
  const n = vector.length
  const a = matrix.map((row, i) => [...row, vector[i]])
  for (let col = 0; col < n; col += 1) {
    let pivot = col
    for (let row = col + 1; row < n; row += 1) if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row
    if (Math.abs(a[pivot][col]) < 1e-12) return null
    ;[a[col], a[pivot]] = [a[pivot], a[col]]
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue
      const factor = a[row][col] / a[col][col]
      if (factor === 0) continue
      for (let k = col; k <= n; k += 1) a[row][k] -= factor * a[col][k]
    }
  }
  return a.map((row, i) => row[n] / row[i])
}

/** L2(절편 제외) 로지스틱 회귀. 특징 x(행마다 같은 길이), y ∈ {0,1}. */
export function fitLogistic(x: readonly number[][], y: readonly number[], lambda = LOGISTIC_LAMBDA, iterations = IRLS_ITERATIONS) {
  const d = x[0]?.length ?? 0
  const w = new Array(d).fill(0)
  let b = 0
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const size = d + 1
    const hessian = Array.from({ length: size }, () => new Array(size).fill(0))
    const gradient = new Array(size).fill(0)
    for (let i = 0; i < x.length; i += 1) {
      const row = [...x[i], 1]
      let z = b
      for (let j = 0; j < d; j += 1) z += w[j] * x[i][j]
      const p = 1 / (1 + Math.exp(-z))
      const weight = Math.max(p * (1 - p), 1e-6)
      for (let j = 0; j < size; j += 1) {
        gradient[j] += (y[i] - p) * row[j]
        for (let k = j; k < size; k += 1) hessian[j][k] += weight * row[j] * row[k]
      }
    }
    for (let j = 0; j < size; j += 1) for (let k = 0; k < j; k += 1) hessian[j][k] = hessian[k][j]
    for (let j = 0; j < d; j += 1) {
      hessian[j][j] += lambda
      gradient[j] -= lambda * w[j]
    }
    const step = solve(hessian, gradient)
    if (!step) break
    for (let j = 0; j < d; j += 1) w[j] += step[j]
    b += step[d]
  }
  const round = (value: number) => Math.round(value * 1e6) / 1e6
  return { w: w.map(round), b: round(b) }
}

// ─── 분석·판정 ───────────────────────────────────────────────────────────

export function withCalibration(index: CompiledAnswerIndex, calibration: ResolvedCalibration): CompiledAnswerIndex {
  return { ...index, calibration }
}

export function analyzeExamples(index: CompiledAnswerIndex, examples: readonly CalibrationExample[]): QuestionAnalysis[] {
  return examples.map((example) => analyzeQuestion(index, example.q, { env: {} }))
}

export function thresholdFn(thresholds: Record<AnswerCardKind, number>) {
  return (kind: AnswerCardKind) => thresholds[kind]
}

/** 종류별 계수 맞춤. 문항이 모자라거나 한쪽 답만 있는 종류는 fallback 계수. */
export function fitConfidence(
  index: CompiledAnswerIndex,
  examples: readonly CalibrationExample[],
  analyses: readonly QuestionAnalysis[],
  fallback: ResolvedCalibration["confidence"]
) {
  const rows = new Map<AnswerCardKind, { x: number[][]; y: number[] }>()
  for (const [i, analysis] of analyses.entries()) {
    const whole = analysis.whole
    if (whole.topReal < 0 || !whole.features) continue
    const candidate = whole.ranked[whole.topReal]
    const kind = candidate.kind as AnswerCardKind
    const bucket = rows.get(kind) ?? { x: [], y: [] }
    bucket.x.push(featureVector(whole.features))
    bucket.y.push(candidate.id === examples[i].label ? 1 : 0)
    rows.set(kind, bucket)
  }
  const confidence = {} as ResolvedCalibration["confidence"]
  const fitted: AnswerCardKind[] = []
  for (const kind of ANSWER_CARD_KINDS) {
    const bucket = rows.get(kind)
    const positives = bucket ? bucket.y.filter((value) => value === 1).length : 0
    if (!bucket || bucket.y.length < MIN_KIND_EXAMPLES || positives === 0 || positives === bucket.y.length) {
      confidence[kind] = { w: [...fallback[kind].w], b: fallback[kind].b }
      continue
    }
    confidence[kind] = fitLogistic(bucket.x, bucket.y)
    fitted.push(kind)
  }
  return { confidence, fitted, counts: Object.fromEntries(ANSWER_CARD_KINDS.map((kind) => [kind, rows.get(kind)?.y.length ?? 0])) as Record<AnswerCardKind, number> }
}

export function pointsFor(
  index: CompiledAnswerIndex,
  examples: readonly CalibrationExample[],
  analyses: readonly QuestionAnalysis[],
  thresholds: Record<AnswerCardKind, number>,
  partialRates?: Record<AnswerCardKind, number>
) {
  const threshold = thresholdFn(thresholds)
  return Float64Array.from(analyses.map((analysis, i) => examplePoints(examples[i], resolveDecision(index, analysis, threshold), index, partialRates)))
}

// ─── 전체 ────────────────────────────────────────────────────────────────

export interface CalibrateOptions {
  dir: string
  /** 보정 묶음 경로(없으면 <dir>/eval/calibration-set.json). */
  setPath?: string
  /** false 면 가중치 격자를 훑지 않고 기본 가중치를 쓴다. */
  grid?: boolean
  partialRates?: Record<AnswerCardKind, number>
  load?: Omit<AnswerIndexLoadOptions, "dir">
  /** 진행 상황 알림. */
  log?: (line: string) => void
}

export interface CalibrateReport {
  set: string
  counts: { items: number; fit: number; check: number; skipped: ExampleSplit["skipped"] }
  fittedKinds: AnswerCardKind[]
  kindCounts: Record<AnswerCardKind, number>
  grid: { weights: Record<ScoreComponent, number>; score: number }[]
  voteDropped: boolean
  checkScore: number
  checkSpread: number
  spreadRuleRelaxed: boolean
  defaults: boolean
}

function readCalibrationSet(path: string): CalibrationSetFile | null {
  if (!existsSync(path)) return null
  const value = JSON.parse(readFileSync(path, "utf8")) as CalibrationSetFile
  return value && Array.isArray(value.items) ? value : null
}

function readAssist(dir: string): CalibrationFile["assist"] {
  const path = join(dir, "calibration.json")
  if (!existsSync(path)) return DEFAULT_ASSIST
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<CalibrationFile>
    const assist = value.assist
    if (assist && typeof assist.enabled === "boolean" && Array.isArray(assist.band) && assist.band.length === 2 && Array.isArray(assist.checkedOn)) {
      return { enabled: assist.enabled, band: [Number(assist.band[0]), Number(assist.band[1])], checkedOn: assist.checkedOn.map(String) }
    }
  } catch {
    // 깨진 파일이면 기본값.
  }
  return DEFAULT_ASSIST
}

function finalize(body: Omit<CalibrationFile, "version">): CalibrationFile {
  const version = `cal-${sha256(JSON.stringify(body)).slice(0, 12)}`
  return { version, ...body }
}

function defaultsFile(dataVersion: string, assist: CalibrationFile["assist"], set: string): CalibrationFile {
  const confidence = Object.fromEntries(ANSWER_CARD_KINDS.map((kind) => [kind, { w: [...DEFAULT_CONFIDENCE.w], b: DEFAULT_CONFIDENCE.b }])) as CalibrationFile["confidence"]
  return finalize({
    dataVersion,
    weights: { ...DEFAULT_WEIGHTS },
    confidence,
    thresholds: { ...DEFAULT_THRESHOLDS },
    nodocRatesChecked: [...NODOC_RATES],
    fit: { set, n: 0, check: 0, bootstrapP10: 0 },
    assist,
  })
}

/** 보정 실행. 결과 파일 내용(쓰지는 않는다)과 보고. */
export function runCalibration(options: CalibrateOptions): { calibration: CalibrationFile; report: CalibrateReport } {
  const log = options.log ?? (() => {})
  const dataVersion = calibrationBasisVersion(options.dir)
  const assist = readAssist(options.dir)
  const setPath = options.setPath ?? join(options.dir, CALIBRATION_SET_FILE)
  const setFile = readCalibrationSet(setPath)
  const setName = setFile ? `calibration-set@${sha256(readFileSync(setPath, "utf8")).slice(0, 12)}` : "none"

  const data = loadAnswerIndexData({ curatedTextHash, ...options.load, dir: options.dir })
  // 지금 calibration.json 은 쓰지 않는다: 기본값에서 시작해야 같은 자료가 같은 결과를 낸다.
  const base = compileAnswerIndex({ ...data, calibration: null })
  const defaultCal = resolveCalibration(null)
  const emptyReport = (split?: ExampleSplit): CalibrateReport => ({
    set: setName,
    counts: { items: setFile?.items.length ?? 0, fit: split?.fit.length ?? 0, check: split?.check.length ?? 0, skipped: split?.skipped ?? { unresolved: 0, missing: 0, unknownCard: 0 } },
    fittedKinds: [],
    kindCounts: Object.fromEntries(ANSWER_CARD_KINDS.map((kind) => [kind, 0])) as Record<AnswerCardKind, number>,
    grid: [],
    voteDropped: false,
    checkScore: 0,
    checkSpread: 0,
    spreadRuleRelaxed: false,
    defaults: true,
  })
  if (!setFile) {
    log("보정 묶음이 없어 기본값으로 만든다.")
    return { calibration: defaultsFile(dataVersion, assist, setName), report: emptyReport() }
  }
  const split = splitExamples(setFile.items, base)
  if (split.fit.length === 0 || split.check.length === 0 || base.cards.length === 0) {
    log(`쓸 문항이 모자라(맞춤 ${split.fit.length}·확인 ${split.check.length}, 카드 ${base.cards.length}) 기본값으로 만든다.`)
    return { calibration: defaultsFile(dataVersion, assist, setName), report: emptyReport(split) }
  }

  const checkNodoc = split.check.map((example) => example.nodoc)

  // 가중치 격자: 점마다 맞춤용으로 계수를 맞추고 확인용 점수(기본 문턱)로 고른다.
  const evaluateWeights = (weights: Record<ScoreComponent, number>) => {
    const withWeights = withCalibration(base, { ...defaultCal, weights })
    const fitted = fitConfidence(withWeights, split.fit, analyzeExamples(withWeights, split.fit), defaultCal.confidence)
    const calibrated = withCalibration(base, { ...defaultCal, weights, confidence: fitted.confidence, fitted: true })
    const checkAnalyses = analyzeExamples(calibrated, split.check)
    const points = pointsFor(calibrated, split.check, checkAnalyses, defaultCal.thresholds, options.partialRates)
    return { weights, fitted, calibrated, checkAnalyses, score: meanRateScore(points, checkNodoc) }
  }
  const candidates = options.grid === false ? [{ ...defaultCal.weights }] : weightGrid()
  let best: ReturnType<typeof evaluateWeights> | null = null
  const gridScores: CalibrateReport["grid"] = []
  for (const [position, weights] of candidates.entries()) {
    const result = evaluateWeights(weights)
    gridScores.push({ weights, score: Math.round(result.score * 100) / 100 })
    if (!best || result.score > best.score) best = result
    if ((position + 1) % 9 === 0 || position + 1 === candidates.length) log(`  가중치 격자 ${position + 1}/${candidates.length}`)
  }
  let chosen = best!
  let voteDropped = false
  if (chosen.weights.vote !== 0) {
    const noVote = evaluateWeights({ ...chosen.weights, vote: 0 })
    if (chosen.score - noVote.score <= VOTE_KEEP_MIN_GAIN) {
      chosen = noVote
      voteDropped = true
    }
  }

  // 문턱: 종류마다 차례로(두 번), 부트스트랩 10번째 백분위수가 가장 높은 θ.
  const index = chosen.calibrated
  const samples = bootstrapSamples(split.check.length)
  const thresholds = { ...defaultCal.thresholds }
  let relaxed = false
  for (let pass = 0; pass < 2; pass += 1) {
    for (const kind of ANSWER_CARD_KINDS) {
      const scored = THRESHOLD_GRID.map((theta) => {
        const trial = { ...thresholds, [kind]: theta }
        const points = pointsFor(index, split.check, chosen.checkAnalyses, trial, options.partialRates)
        return { theta, p10: bootstrapP10(points, checkNodoc, samples), spread: rateSpread(points, checkNodoc) }
      })
      let pool = scored.filter((entry) => entry.spread <= SPREAD_MAX_POINTS)
      if (pool.length === 0) {
        relaxed = true
        const minSpread = Math.min(...scored.map((entry) => entry.spread))
        pool = scored.filter((entry) => entry.spread <= minSpread + 1e-9)
      }
      // 같은 점수면 지금 θ(처음에는 기본 문턱)를 둔다: 근거 문항이 없는 종류가 가장 느슨한 θ 로 내려가지 않게.
      const incumbent = pool.find((entry) => entry.theta === thresholds[kind]) ?? pool[0]
      const pick = pool.reduce((best, entry) => (entry.p10 > best.p10 + 1e-9 ? entry : best), incumbent)
      thresholds[kind] = pick.theta
    }
  }
  const finalPoints = pointsFor(index, split.check, chosen.checkAnalyses, thresholds, options.partialRates)
  const p10 = bootstrapP10(finalPoints, checkNodoc, samples)
  const confidence = Object.fromEntries(ANSWER_CARD_KINDS.map((kind) => [kind, chosen.fitted.confidence[kind]])) as CalibrationFile["confidence"]
  const calibration = finalize({
    dataVersion,
    weights: { ...chosen.weights },
    confidence,
    thresholds,
    nodocRatesChecked: [...NODOC_RATES],
    fit: { set: setName, n: split.fit.length, check: split.check.length, bootstrapP10: Math.round(p10 * 1000) / 1000 },
    assist,
  })
  return {
    calibration,
    report: {
      set: setName,
      counts: { items: setFile.items.length, fit: split.fit.length, check: split.check.length, skipped: split.skipped },
      fittedKinds: chosen.fitted.fitted,
      kindCounts: chosen.fitted.counts,
      grid: gridScores,
      voteDropped,
      checkScore: Math.round(meanRateScore(finalPoints, checkNodoc) * 100) / 100,
      checkSpread: Math.round(rateSpread(finalPoints, checkNodoc) * 100) / 100,
      spreadRuleRelaxed: relaxed,
      defaults: false,
    },
  }
}
