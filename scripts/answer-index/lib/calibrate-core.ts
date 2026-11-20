/**
 * 보정(답 색인 사양 §8.2, I9 — 진단 R1 단계 1·3: R02·R05·R06·R12·R13): 질문 우주(universe/, D8·D9 라벨)를 관점 단위로 나눈
 * 교차 맞춤으로 점수 가중치·카드 종류별 확신도 계수·문턱을 정한다. 보정 묶음(eval/calibration-set.json, D10)은 외부 확인에만 쓴다.
 * 사양과 다른 점은 scripts/answer-index/README.md '보정이 사양 §8.2 와 다른 점'.
 *
 * 1. 맞춤 자료(우주 OOF): 라벨(label)이 색인에 있는 카드·none·gap:*·clarify 인 우주 문항. 라벨 없음·missing:*·색인에 없는 카드·
 *    범위 관문(isCompiledScope) 밖 문항은 뺀다(셈만 남긴다). 관점(p)을 정렬해 차례로 K = min(5, 관점 수) 겹에 나누고, 겹마다
 *    그 겹 우주를 뺀 자료로 색인을 다시 컴파일해 그 겹 문항을 분석한다(자기 자신·같은 관점 문항이 kNN 이웃·IDF 에 들어가는 누설 차단).
 *    옛 정규식 표는 런타임처럼 collectLegacyVotes(질문, null, legacy-alias)로 넘긴다(후보 풀·vote 성분·vote1 특징·정해 둔 답 승격).
 * 2. 확신도: '1위 실제 카드(topReal)가 라벨과 같은가'를 맞히는 로지스틱 회귀(특징 ANSWER_INDEX_FEATURES). 맞춤 행으로 특징을
 *    표준화하고 L2 λ=1(절편 제외)·IRLS 25회로 맞춘 뒤 원 척도 계수로 되돌린다(같은 입력 → 같은 계수). 맞춤 행이 20개 미만이거나
 *    한쪽 답만 있는 종류는 모든 행에 종류 one-hot 을 더한 공용 모델 계수를 쓴다. θ 를 고를 때의 확신도는 교차 맞춤이다
 *    (겹 f 문항은 겹 f 를 뺀 행으로 맞춘 모델).
 * 3. 문턱(selectThresholds): 종류별 θ ∈ THRESHOLD_GRID(0.10~0.95, 0.025 간격). 목적은 '문서에 없음' 비율을 20·25·30%로 다시
 *    가중한 대리 점수 평균의 최대, 제약은 진짜 NODOC(라벨 none·gap:* 이고 label2 도 카드가 아님) 답함 비율 ≤ 8%.
 *    벌점 목적(점수 − λ × 진짜 NODOC 답함 %)을 종류별 좌표 탐색(최대 3회 돌림)으로 풀고, 제약을 지키는 가장 작은 λ 를 이분 탐색한
 *    뒤 제약 안에서 좌표 탐색으로 다듬는다. 같은 목적값이면 세 비율 점수 차(퍼짐)가 작은 θ, 그다음 지금 θ(처음은 기본 문턱)를 둔다.
 *    퍼짐 하드 필터·'퍼짐 최소 θ' 대체는 없다(진단 R06).
 * 4. 가중치: 격자(maxcos 비 {0.2,0.3,0.4}·centroid = 1 − 그 비, knn {0,0.3,0.5,0.7}, vote {0,0.15,0.3}, bm25f {0,0.1,0.2}, 108점)를
 *    3과 같은 절차로 중첩 교차 검증해 고른다: 바깥 겹 g 마다 g 를 뺀 겹들 안에서(안쪽 교차 맞춤 확신도) θ 를 고르고, g 를 뺀 행으로
 *    맞춘 모델과 그 θ 로 g 를 채점한다(θ 를 고른 자료로 가중치를 채점하지 않는다). 격자 점수는 바깥 겹을 모은 세 비율 평균이다.
 *    고른 점에서 vote 만 0 으로 바꾼 점이 0.5점 넘게 낮지 않으면 vote 는 0 이다(§3.4).
 * 5. 마무리: 고른 가중치로 교차 맞춤 확신도 → 3의 절차로 θ. 계수는 쓸 수 있는 행 전부로 다시 맞춘다.
 *    보고: 우주 OOF 점수(고른 θ), 중첩 바깥 점수와 관점 군집 부트스트랩(1,000회, 고정 시드) 10번째 백분위, 점수 대 NODOC 곡선
 *    (λ 경로·네 답 종류 공통 θ), 보정 묶음 외부 확인(런타임과 같은 분석·결정: 1위 정답·결정 정답·진짜 NODOC 답함·세 비율 대리).
 *
 * 대리 채점(문항 하나의 기대 점수):
 *   라벨이 카드: 그 카드로 답함 → 1 − 0.5 × 일부만 답함 비율(카드 종류별, 처음에는 doc 0.15·fixed 0.05), 꼬리 붙은 답 → 0.5,
 *               다른 카드·못 찾음·공백·되묻기 → 0
 *   라벨이 none·gap:* (문서에 없음): 못 찾음·공백 → 1, 답·되묻기 → 0
 *   라벨이 clarify: 되묻기·못 찾음 → 1, 답·공백 → 0
 *
 * 쓸 우주 문항이 없거나 관점이 2개 미만이면 기본값(compile.ts DEFAULT_*)으로 calibration.json 을 만든다.
 * 런타임 calibration.json 을 읽지 않고 기본값에서 시작한다(같은 자료 → 같은 결과). assist 칸은 지금 파일 값을 그대로 둔다.
 * 격자 점 결과는 cacheDir 에 둘 수 있다(열쇠: 방법 판·자료 판·컴파일 색인 해시·우주 겹·표 해시·표본 분석 해시). 캐시는 격자 훑기만
 * 빠르게 하고, 고른 가중치의 계수·문턱은 언제나 다시 계산하므로 결과 파일은 캐시와 무관하게 같다.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import {
  answerIndexHash,
  compileAnswerIndex,
  DEFAULT_CONFIDENCE,
  DEFAULT_THRESHOLDS,
  DEFAULT_WEIGHTS,
  resolveCalibration,
  type CompiledAnswerIndex,
  type ResolvedCalibration,
} from "@/lib/chatbot/answer-index/compile"
import { curatedTextHash } from "@/lib/chatbot/answer-index/curated"
import { analyzeQuestion, resolveDecision, SEGMENT_CONF_MARGIN, type QuestionAnalysis, type SegmentAnalysis } from "@/lib/chatbot/answer-index/decide"
import { collectLegacyVotes } from "@/lib/chatbot/answer-index/legacy-votes"
import { loadAnswerIndexData, type AnswerIndexLoadOptions } from "@/lib/chatbot/answer-index/load"
import { featureVector } from "@/lib/chatbot/answer-index/score"
import { isCompiledScope } from "@/lib/chatbot/answer-index/scope"
import {
  ANSWER_CARD_KINDS,
  ANSWER_INDEX_FEATURES,
  type AnswerCardKind,
  type AnswerIndexDecision,
  type CalibrationFile,
  type CalibrationSetFile,
  type CalibrationSetItem,
  type ScoreComponent,
  type UniverseItem,
} from "@/lib/chatbot/answer-index/types"
import { createRng } from "../score"
import { calibrationBasisVersion } from "./manifest"

export const CALIBRATION_SET_FILE = "eval/calibration-set.json"
export const NODOC_RATES = [0.2, 0.25, 0.3] as const
/** 종류별 θ 후보(0.10~0.95). 사양 §8.2 4 의 0.30~0.90 보다 넓다(README 참고). 기본 문턱(0.5·0.55·0.6)이 들어 있다. */
export const THRESHOLD_GRID = Array.from({ length: 35 }, (_, step) => Math.round((0.1 + step * 0.025) * 1000) / 1000)
export const LOGISTIC_LAMBDA = 1
export const IRLS_ITERATIONS = 25
export const MIN_KIND_EXAMPLES = 20
export const BOOTSTRAP_RESAMPLES = 1000
export const CALIBRATION_SEED = 20261125
export const VOTE_KEEP_MIN_GAIN = 0.5
/** 우주 관점 겹 수(관점이 이보다 적으면 관점 수). */
export const UNIVERSE_FOLDS = 5
/** θ 제약: 우주 OOF 진짜 NODOC 답함 비율 상한(사양 §9.3 파일럿 관문 8%). */
export const MAX_TRUE_NODOC_ANSWERED = 0.08
/** 좌표 탐색 최대 돌림 수. */
export const COORDINATE_PASSES = 3
/** 벌점 λ(진짜 NODOC 답함 1%p 당 점수) 탐색: 처음 상한·최대 상한·이분 횟수. */
export const LAMBDA_START = 0.25
export const LAMBDA_MAX = 64
export const LAMBDA_BISECTIONS = 12
/** 곡선 보고의 λ 경로. */
export const CURVE_LAMBDAS = [0, 0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3, 5, 8, 13, 21, 34, 64] as const
/** 보정 방법 판(캐시 열쇠). 방법을 바꾸면 올린다. */
export const CALIBRATE_METHOD_VERSION = 2
/** 캐시 열쇠에 넣는 표본 분석 문항 수. */
const CACHE_PROBE_ITEMS = 40
export const DEFAULT_PARTIAL_RATES: Record<AnswerCardKind, number> = { doc: 0.15, howto: 0.15, fixed: 0.05, policy: 0.05, gap: 0, handoff: 0.05 }
export const DEFAULT_ASSIST: CalibrationFile["assist"] = { enabled: false, band: [0.45, 0.62], checkedOn: [] }
/** 공통 θ 곡선에서 함께 움직이는 답 종류. */
const ANSWER_KINDS: readonly AnswerCardKind[] = ["doc", "howto", "fixed", "policy"]

/** 가중치 격자(108점). 순서가 곧 같은 점수일 때의 우선순위다. knn 0 은 보정이 거르게 넣는다(진단 R18). */
export function weightGrid(): Record<ScoreComponent, number>[] {
  const grid: Record<ScoreComponent, number>[] = []
  for (const ratio of [0.2, 0.3, 0.4])
    for (const knnShare of [0, 0.3, 0.5, 0.7])
      for (const vote of [0, 0.15, 0.3])
        for (const bm25f of [0, 0.1, 0.2]) grid.push({ maxcos: ratio, centroid: Math.round((1 - ratio) * 1000) / 1000, knnShare, vote, bm25f, linear: 0 })
  return grid
}

function weightsKey(weights: Record<ScoreComponent, number>) {
  return [weights.maxcos, weights.centroid, weights.knnShare, weights.vote, weights.bm25f, weights.linear].join("|")
}

// ─── 문항 ────────────────────────────────────────────────────────────────

export interface CalibrationExample {
  id: string
  q: string
  label: string
  /** none·gap:* (문서에 없음). */
  nodoc: boolean
  /** 문서에 없음이고 다른 라벨(우주 label2, 보정 묶음 label·label2)도 카드가 아님(진단 R03 '진짜 NODOC'). 없으면 nodoc 과 같다. */
  trueNodoc?: boolean
  /** 우주 관점(p). */
  group?: string
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

export function isNodocLabel(label: string) {
  return label === "none" || label.startsWith("gap:")
}

/** 카드 id 라벨인지(none·clarify·gap:*·missing:*·빈 값이 아님). */
export function isCardLabel(label: string | null | undefined) {
  return typeof label === "string" && label !== "" && label !== "none" && label !== "clarify" && !label.startsWith("gap:") && !label.startsWith("missing:")
}

function bySha(examples: CalibrationExample[]) {
  return examples
    .map((example) => ({ example, key: sha256(example.id) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.example.id.localeCompare(b.example.id)))
    .map((entry) => entry.example)
}

/** 보정 묶음의 쓸 문항(외부 확인용). id 의 sha256 순. */
export function calibrationSetExamples(items: readonly CalibrationSetItem[], index: CompiledAnswerIndex) {
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
    const nodoc = isNodocLabel(label)
    if (!nodoc && label !== "clarify" && !index.cardById.has(label)) {
      skipped.unknownCard += 1
      continue
    }
    usable.push({ id: item.id, q: item.q, label, nodoc, trueNodoc: nodoc && !isCardLabel(item.label) && !isCardLabel(item.label2) })
  }
  return { examples: bySha(usable), skipped }
}

/** 보정 묶음을 id 의 sha256 순으로 늘어놓고 앞 2/3·뒤 1/3 으로 나눈다(옛 방법, 진단 대조용으로 남긴다). */
export function splitExamples(items: readonly CalibrationSetItem[], index: CompiledAnswerIndex): ExampleSplit {
  const { examples, skipped } = calibrationSetExamples(items, index)
  const fitCount = Math.ceil((examples.length * 2) / 3)
  return { fit: examples.slice(0, fitCount), check: examples.slice(fitCount), skipped }
}

export interface UniverseSkipped {
  unlabeled: number
  missing: number
  unknownCard: number
  outOfScope: number
}

/** 우주의 쓸 문항(맞춤용). id 순. 라벨은 label(두 라벨러가 엇갈리면 세 번째가 정한 값), group 은 관점. */
export function universeExamples(items: readonly UniverseItem[], index: CompiledAnswerIndex) {
  const skipped: UniverseSkipped = { unlabeled: 0, missing: 0, unknownCard: 0, outOfScope: 0 }
  const usable: CalibrationExample[] = []
  const sorted = [...items].filter((item) => item && typeof item.id === "string" && typeof item.q === "string").sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const item of sorted) {
    const label = typeof item.label === "string" ? item.label : ""
    if (!label || !item.q.trim()) {
      skipped.unlabeled += 1
      continue
    }
    if (label.startsWith("missing:")) {
      skipped.missing += 1
      continue
    }
    const nodoc = isNodocLabel(label)
    if (!nodoc && label !== "clarify" && !index.cardById.has(label)) {
      skipped.unknownCard += 1
      continue
    }
    if (!isCompiledScope(item.q, {})) {
      skipped.outOfScope += 1
      continue
    }
    usable.push({ id: item.id, q: item.q, label, nodoc, trueNodoc: nodoc && !isCardLabel(item.label2), group: typeof item.p === "string" ? item.p : "" })
  }
  return { examples: usable, skipped }
}

/** 관점 → 겹: 관점을 정렬해 차례로 나눈다. 겹 수는 min(UNIVERSE_FOLDS, 관점 수). */
export function groupFolds(examples: readonly CalibrationExample[], folds = UNIVERSE_FOLDS) {
  const groups = Array.from(new Set(examples.map((example) => example.group ?? ""))).sort()
  const k = Math.min(folds, groups.length)
  const foldOfGroup = new Map(groups.map((group, position) => [group, k > 0 ? position % k : 0]))
  return { folds: k, groups, foldOfGroup, foldOf: examples.map((example) => foldOfGroup.get(example.group ?? "") ?? 0) }
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

function mixScore(nodocSum: number, nodocCount: number, docSum: number, docCount: number, rate: number) {
  if (nodocCount === 0 && docCount === 0) return 0
  if (nodocCount === 0) return (docSum / docCount) * 100
  if (docCount === 0) return (nodocSum / nodocCount) * 100
  return (rate * (nodocSum / nodocCount) + (1 - rate) * (docSum / docCount)) * 100
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
  return mixScore(nodocSum, nodocCount, docSum, docCount, rate)
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

/** 관점 군집 부트스트랩: 관점을 복원 추출해 그 문항을 모은 세 비율 평균 점수의 5·10·50·95번째 백분위수. */
export function clusterBootstrap(points: ArrayLike<number>, nodoc: ArrayLike<boolean>, groups: readonly string[], resamples = BOOTSTRAP_RESAMPLES, seed = CALIBRATION_SEED) {
  const byGroup = new Map<string, number[]>()
  for (let i = 0; i < groups.length; i += 1) {
    const list = byGroup.get(groups[i]) ?? []
    list.push(i)
    byGroup.set(groups[i], list)
  }
  const names = Array.from(byGroup.keys()).sort()
  if (names.length === 0 || points.length === 0) return { p5: 0, p10: 0, p50: 0, p95: 0 }
  const rng = createRng(seed)
  const scores: number[] = []
  for (let b = 0; b < resamples; b += 1) {
    const pick: number[] = []
    for (let k = 0; k < names.length; k += 1) for (const i of byGroup.get(names[Math.floor(rng() * names.length)])!) pick.push(i)
    scores.push(meanRateScore(points, nodoc, pick))
  }
  scores.sort((a, b) => a - b)
  const at = (q: number) => scores[Math.min(scores.length - 1, Math.floor(scores.length * q))]
  return { p5: at(0.05), p10: at(0.1), p50: at(0.5), p95: at(0.95) }
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

/** L2(절편 제외) 로지스틱 회귀, 반올림하지 않은 계수. */
function fitLogisticRaw(x: readonly number[][], y: readonly number[], lambda = LOGISTIC_LAMBDA, iterations = IRLS_ITERATIONS) {
  const d = x[0]?.length ?? 0
  const w = new Array(d).fill(0)
  let b = 0
  const size = d + 1
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const hessian = Array.from({ length: size }, () => new Array(size).fill(0))
    const gradient = new Array(size).fill(0)
    for (let i = 0; i < x.length; i += 1) {
      const row = x[i]
      let z = b
      for (let j = 0; j < d; j += 1) z += w[j] * row[j]
      const p = 1 / (1 + Math.exp(-z))
      const weight = Math.max(p * (1 - p), 1e-6)
      const residual = y[i] - p
      for (let j = 0; j < size; j += 1) {
        const rj = j < d ? row[j] : 1
        gradient[j] += residual * rj
        const hj = hessian[j]
        for (let k = j; k < size; k += 1) hj[k] += weight * rj * (k < d ? row[k] : 1)
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
  return { w, b }
}

const round6 = (value: number) => Math.round(value * 1e6) / 1e6

/** L2(절편 제외) 로지스틱 회귀. 특징 x(행마다 같은 길이), y ∈ {0,1}. 계수는 소수 6자리. */
export function fitLogistic(x: readonly number[][], y: readonly number[], lambda = LOGISTIC_LAMBDA, iterations = IRLS_ITERATIONS) {
  const { w, b } = fitLogisticRaw(x, y, lambda, iterations)
  return { w: w.map(round6), b: round6(b) }
}

export interface ConfidenceRow {
  kind: AnswerCardKind
  x: number[]
  y: number
}

export type ConfidenceModel = Record<AnswerCardKind, { w: number[]; b: number }>

function standardizer(rows: readonly ConfidenceRow[]) {
  const d = ANSWER_INDEX_FEATURES.length
  const mean = new Array(d).fill(0)
  const scale = new Array(d).fill(0)
  for (const row of rows) for (let j = 0; j < d; j += 1) mean[j] += row.x[j]
  for (let j = 0; j < d; j += 1) mean[j] /= rows.length || 1
  for (const row of rows) for (let j = 0; j < d; j += 1) scale[j] += (row.x[j] - mean[j]) ** 2
  for (let j = 0; j < d; j += 1) {
    const sd = Math.sqrt(scale[j] / (rows.length || 1))
    scale[j] = sd > 1e-9 ? sd : 0
  }
  const z = (x: readonly number[]) => x.map((value, j) => (scale[j] ? (value - mean[j]) / scale[j] : 0))
  // 표준화 계수 β → 원 척도: w = β/σ, b = b' − Σ β μ/σ.
  const back = (beta: readonly number[], intercept: number) => {
    let b = intercept
    const w = new Array(d).fill(0)
    for (let j = 0; j < d; j += 1) {
      if (!scale[j]) continue
      w[j] = beta[j] / scale[j]
      b -= (beta[j] * mean[j]) / scale[j]
    }
    return { w: w.map(round6), b: round6(b) }
  }
  return { z, back }
}

const hasBothClasses = (y: readonly number[]) => y.some((value) => value === 1) && y.some((value) => value === 0)

/** 한 종류 모델: 표준화 특징 + L2. */
export function fitKindModel(rows: readonly ConfidenceRow[]) {
  const { z, back } = standardizer(rows)
  const fit = fitLogisticRaw(
    rows.map((row) => z(row.x)),
    rows.map((row) => row.y)
  )
  return back(fit.w, fit.b)
}

/** 공용 모델: 표준화 특징 + 종류 one-hot(6칸) + L2. 종류마다 같은 w, 절편만 종류 칸만큼 다르다. */
export function fitPooledModel(rows: readonly ConfidenceRow[]): ConfidenceModel {
  const { z, back } = standardizer(rows)
  const d = ANSWER_INDEX_FEATURES.length
  const fit = fitLogisticRaw(
    rows.map((row) => [...z(row.x), ...ANSWER_CARD_KINDS.map((kind) => (kind === row.kind ? 1 : 0))]),
    rows.map((row) => row.y)
  )
  const beta = fit.w.slice(0, d)
  return Object.fromEntries(ANSWER_CARD_KINDS.map((kind, k) => [kind, back(beta, fit.b + fit.w[d + k])])) as ConfidenceModel
}

function defaultModel(): ConfidenceModel {
  return Object.fromEntries(ANSWER_CARD_KINDS.map((kind) => [kind, { w: [...DEFAULT_CONFIDENCE.w], b: DEFAULT_CONFIDENCE.b }])) as ConfidenceModel
}

/**
 * 종류별 계수. 맞춤 행 MIN_KIND_EXAMPLES 이상이고 두 답이 다 있는 종류는 제 모델, 아니면 공용 모델(종류 one-hot).
 * 공용 모델도 맞출 수 없으면(행이 없거나 한쪽 답만 있음) 기본 계수.
 */
export function fitConfidenceModels(rows: readonly ConfidenceRow[]) {
  const byKind = new Map<AnswerCardKind, ConfidenceRow[]>()
  for (const row of rows) {
    const list = byKind.get(row.kind) ?? []
    list.push(row)
    byKind.set(row.kind, list)
  }
  const own: AnswerCardKind[] = []
  const pooled: AnswerCardKind[] = []
  const confidence = {} as ConfidenceModel
  const needsPooled = ANSWER_CARD_KINDS.some((kind) => {
    const list = byKind.get(kind) ?? []
    return list.length < MIN_KIND_EXAMPLES || !hasBothClasses(list.map((row) => row.y))
  })
  const pooledModel = needsPooled && rows.length > 0 && hasBothClasses(rows.map((row) => row.y)) ? fitPooledModel(rows) : null
  const fallback = defaultModel()
  for (const kind of ANSWER_CARD_KINDS) {
    const list = byKind.get(kind) ?? []
    if (list.length >= MIN_KIND_EXAMPLES && hasBothClasses(list.map((row) => row.y))) {
      confidence[kind] = fitKindModel(list)
      own.push(kind)
    } else if (pooledModel) {
      confidence[kind] = pooledModel[kind]
      pooled.push(kind)
    } else confidence[kind] = fallback[kind]
  }
  const counts = Object.fromEntries(ANSWER_CARD_KINDS.map((kind) => [kind, byKind.get(kind)?.length ?? 0])) as Record<AnswerCardKind, number>
  return { confidence, own, pooled, counts }
}

/** 런타임 confidenceOf 와 같은 계산(같은 순서의 합, 같은 시그모이드). */
export function confidenceFromVector(x: readonly number[], model: { w: readonly number[]; b: number }) {
  let z = model.b
  for (let i = 0; i < x.length; i += 1) z += (model.w[i] ?? 0) * x[i]
  return 1 / (1 + Math.exp(-z))
}

// ─── 분석 ────────────────────────────────────────────────────────────────

export function withCalibration(index: CompiledAnswerIndex, calibration: ResolvedCalibration): CompiledAnswerIndex {
  return { ...index, calibration }
}

/** 옛 정규식 표(런타임 collectLegacyVotes 와 같은 함수, 서비스가 더하는 정해 둔 답 출처 이름은 없음). */
export function legacyVotesFor(index: CompiledAnswerIndex, examples: readonly Pick<CalibrationExample, "q">[]) {
  return examples.map((example) => collectLegacyVotes(example.q, null, index.legacyAlias))
}

export function analyzeExamples(index: CompiledAnswerIndex, examples: readonly CalibrationExample[], votes?: readonly (readonly string[])[]): QuestionAnalysis[] {
  return examples.map((example, i) => analyzeQuestion(index, example.q, { env: {}, votes: votes?.[i] ?? [] }))
}

export function thresholdFn(thresholds: Record<AnswerCardKind, number>) {
  return (kind: AnswerCardKind) => thresholds[kind]
}

/**
 * 분석 하나의 문턱 관련 요약. 결정이 문턱에 기대는 곳은 조각(원문·두 조각)마다 '순위 1위 실제 카드의 확신도 ≥ 그 종류 θ
 * (조각이면 θ + SEGMENT_CONF_MARGIN)' 하나뿐이다(decide.ts resolveSegment). 그래서 이 비교들의 참·거짓 묶음(마스크)이 같으면
 * 결정도 같다 — ThresholdEvaluator 가 이것으로 결정을 마스크별로 한 번만 계산한다.
 */
export interface AnalyzedExample {
  index: CompiledAnswerIndex
  analysis: QuestionAnalysis
  /** 조각(원문, 그다음 조각 순)마다: 1위가 실제 카드일 때만. */
  segKinds: AnswerCardKind[]
  segX: number[][]
  segPart: boolean[]
  /** 확신도 맞춤 행(원문 1위 실제 카드). */
  row: ConfidenceRow | null
  /** 원문 1위 실제 카드 id. */
  top1: string | null
}

export function digestAnalysis(index: CompiledAnswerIndex, example: CalibrationExample, analysis: QuestionAnalysis): AnalyzedExample {
  const segKinds: AnswerCardKind[] = []
  const segX: number[][] = []
  const segPart: boolean[] = []
  const add = (segment: SegmentAnalysis, part: boolean) => {
    const first = segment.ranked[0]
    const features = segment.topFeatures[0]
    if (!first || first.card < 0 || !features) return
    segKinds.push(first.kind as AnswerCardKind)
    segX.push(featureVector(features))
    segPart.push(part)
  }
  add(analysis.whole, false)
  for (const part of analysis.parts ?? []) add(part, true)
  const whole = analysis.whole
  const top = whole.topReal >= 0 ? whole.ranked[whole.topReal] : null
  const row = top && whole.features ? { kind: top.kind as AnswerCardKind, x: featureVector(whole.features), y: top.id === example.label ? 1 : 0 } : null
  return { index, analysis, segKinds, segX, segPart, row, top1: top ? top.id : null }
}

/** 조각 1위의 확신도만 바꾼 분석(결정은 이 값들만 본다). confs 는 digest 의 조각 순서. */
export function withSegmentConfs(analysis: QuestionAnalysis, confs: readonly number[]): QuestionAnalysis {
  let k = 0
  const replace = (segment: SegmentAnalysis): SegmentAnalysis => {
    const first = segment.ranked[0]
    if (!first || first.card < 0 || !segment.topFeatures[0]) return segment
    const next = segment.confs.slice()
    next[0] = confs[k]
    k += 1
    return { ...segment, confs: next }
  }
  const whole = replace(analysis.whole)
  const parts = analysis.parts ? analysis.parts.map(replace) : null
  return { ...analysis, whole, parts }
}

export function segmentConfs(item: AnalyzedExample, model: ConfidenceModel) {
  return item.segX.map((x, s) => confidenceFromVector(x, model[item.segKinds[s]]))
}

// ─── 문턱 평가 ───────────────────────────────────────────────────────────

export interface ThresholdResult {
  score: number
  spread: number
  n: number
  nodocCount: number
  nodocAnswered: number
  trueNodocCount: number
  trueNodocAnswered: number
  /** 진짜 NODOC 답함 비율(0~1, 진짜 NODOC 이 없으면 0). */
  trueNodocRate: number
  nodocRate: number
}

const KIND_INDEX = new Map(ANSWER_CARD_KINDS.map((kind, position) => [kind, position]))

/** 문턱 묶음 → 점수. 문항마다 마스크별 결정을 기억해 같은 마스크면 다시 정하지 않는다. */
export class ThresholdEvaluator {
  private readonly items: AnalyzedExample[]
  private readonly examples: CalibrationExample[]
  private readonly analyses: QuestionAnalysis[]
  private readonly segStart: Int32Array
  private readonly segKind: Int8Array
  private readonly segConf: Float64Array
  private readonly segPart: Uint8Array
  private readonly memoStart: Int32Array
  private readonly memoPoints: Float64Array
  private readonly memoAnswered: Int8Array
  private readonly nodoc: Uint8Array
  private readonly trueNodoc: Uint8Array
  private readonly partialRates: Record<AnswerCardKind, number>
  readonly n: number
  readonly nodocCount: number
  readonly trueNodocCount: number

  constructor(items: readonly AnalyzedExample[], examples: readonly CalibrationExample[], confs: readonly (readonly number[])[], partialRates = DEFAULT_PARTIAL_RATES) {
    this.items = [...items]
    this.examples = [...examples]
    this.partialRates = partialRates
    this.n = items.length
    this.analyses = items.map((item, i) => withSegmentConfs(item.analysis, confs[i]))
    this.segStart = new Int32Array(this.n + 1)
    this.memoStart = new Int32Array(this.n + 1)
    for (let i = 0; i < this.n; i += 1) {
      this.segStart[i + 1] = this.segStart[i] + items[i].segKinds.length
      this.memoStart[i + 1] = this.memoStart[i] + (1 << items[i].segKinds.length)
    }
    const total = this.segStart[this.n]
    this.segKind = new Int8Array(total)
    this.segConf = new Float64Array(total)
    this.segPart = new Uint8Array(total)
    for (let i = 0; i < this.n; i += 1) {
      for (let s = 0; s < items[i].segKinds.length; s += 1) {
        const at = this.segStart[i] + s
        this.segKind[at] = KIND_INDEX.get(items[i].segKinds[s]) ?? 0
        this.segConf[at] = confs[i][s]
        this.segPart[at] = items[i].segPart[s] ? 1 : 0
      }
    }
    this.memoPoints = new Float64Array(this.memoStart[this.n]).fill(Number.NaN)
    this.memoAnswered = new Int8Array(this.memoStart[this.n]).fill(-1)
    this.nodoc = Uint8Array.from(examples, (example) => (example.nodoc ? 1 : 0))
    this.trueNodoc = Uint8Array.from(examples, (example) => ((example.trueNodoc ?? example.nodoc) ? 1 : 0))
    this.nodocCount = this.nodoc.reduce((sum, value) => sum + value, 0)
    this.trueNodocCount = this.trueNodoc.reduce((sum, value) => sum + value, 0)
  }

  private maskOf(i: number, whole: Float64Array, part: Float64Array) {
    let mask = 0
    for (let at = this.segStart[i], bit = 1; at < this.segStart[i + 1]; at += 1, bit <<= 1) {
      const kind = this.segKind[at]
      if (this.segConf[at] >= (this.segPart[at] ? part[kind] : whole[kind])) mask |= bit
    }
    return mask
  }

  private resolve(i: number, thresholds: Record<AnswerCardKind, number>) {
    return resolveDecision(this.items[i].index, this.analyses[i], thresholdFn(thresholds))
  }

  /** 문항 i 의 결정(마스크 기억 없이, 보고용). */
  decision(i: number, thresholds: Record<AnswerCardKind, number>) {
    return this.resolve(i, thresholds)
  }

  /** 문항별 점수와 답함 여부. */
  points(thresholds: Record<AnswerCardKind, number>) {
    const points = new Float64Array(this.n)
    const answered = new Uint8Array(this.n)
    const whole = Float64Array.from(ANSWER_CARD_KINDS, (kind) => thresholds[kind])
    const part = Float64Array.from(ANSWER_CARD_KINDS, (kind) => thresholds[kind] + SEGMENT_CONF_MARGIN)
    for (let i = 0; i < this.n; i += 1) {
      const slot = this.memoStart[i] + this.maskOf(i, whole, part)
      if (this.memoAnswered[slot] < 0) {
        const decision = this.resolve(i, thresholds)
        this.memoPoints[slot] = examplePoints(this.examples[i], decision, this.items[i].index, this.partialRates)
        this.memoAnswered[slot] = decision.kind === "answer" ? 1 : 0
      }
      points[i] = this.memoPoints[slot]
      answered[i] = this.memoAnswered[slot]
    }
    return { points, answered }
  }

  evaluate(thresholds: Record<AnswerCardKind, number>): ThresholdResult {
    const { points, answered } = this.points(thresholds)
    let nodocSum = 0
    let docSum = 0
    let nodocAnswered = 0
    let trueNodocAnswered = 0
    for (let i = 0; i < this.n; i += 1) {
      if (this.nodoc[i]) {
        nodocSum += points[i]
        nodocAnswered += answered[i]
        if (this.trueNodoc[i]) trueNodocAnswered += answered[i]
      } else docSum += points[i]
    }
    const docCount = this.n - this.nodocCount
    const scores = NODOC_RATES.map((rate) => mixScore(nodocSum, this.nodocCount, docSum, docCount, rate))
    return {
      score: scores.reduce((sum, value) => sum + value, 0) / scores.length,
      spread: Math.max(...scores) - Math.min(...scores),
      n: this.n,
      nodocCount: this.nodocCount,
      nodocAnswered,
      trueNodocCount: this.trueNodocCount,
      trueNodocAnswered,
      trueNodocRate: this.trueNodocCount === 0 ? 0 : trueNodocAnswered / this.trueNodocCount,
      nodocRate: this.nodocCount === 0 ? 0 : nodocAnswered / this.nodocCount,
    }
  }
}

// ─── 문턱 고르기 ─────────────────────────────────────────────────────────

type Thresholds = Record<AnswerCardKind, number>

/** 종류별 좌표 탐색. 같은 목적값이면 퍼짐이 작은 θ, 그다음 지금 θ. feasible 이 있으면 그 안에서만 옮긴다. */
export function coordinateAscent(
  evaluator: ThresholdEvaluator,
  start: Thresholds,
  objective: (result: ThresholdResult) => number,
  feasible?: (result: ThresholdResult) => boolean,
  passes = COORDINATE_PASSES
) {
  const thresholds = { ...start }
  let current = evaluator.evaluate(thresholds)
  for (let pass = 0; pass < passes; pass += 1) {
    let changed = false
    for (const kind of ANSWER_CARD_KINDS) {
      let best = { theta: thresholds[kind], result: current, value: objective(current) }
      for (const theta of THRESHOLD_GRID) {
        if (theta === thresholds[kind]) continue
        const result = evaluator.evaluate({ ...thresholds, [kind]: theta })
        if (feasible && !feasible(result)) continue
        const value = objective(result)
        if (value > best.value + 1e-9 || (Math.abs(value - best.value) <= 1e-9 && result.spread < best.result.spread - 1e-9)) best = { theta, result, value }
      }
      if (best.theta !== thresholds[kind]) {
        thresholds[kind] = best.theta
        current = best.result
        changed = true
      }
    }
    if (!changed) break
  }
  return { thresholds, result: current }
}

export interface ThresholdSelection {
  thresholds: Thresholds
  result: ThresholdResult
  /** 제약을 지키게 한 벌점(0 이면 제약이 걸리지 않음). */
  lambda: number
  /** 진짜 NODOC 답함 ≤ 상한을 지켰는지. */
  met: boolean
}

/** θ 고르기: 세 비율 평균 점수 최대, 단 진짜 NODOC 답함 ≤ maxTrueNodoc(벌점 이분 탐색 + 제약 안 다듬기). */
export function selectThresholds(evaluator: ThresholdEvaluator, start: Thresholds = { ...DEFAULT_THRESHOLDS }, maxTrueNodoc = MAX_TRUE_NODOC_ANSWERED): ThresholdSelection {
  const feasible = (result: ThresholdResult) => result.trueNodocRate <= maxTrueNodoc + 1e-12
  const solveAt = (lambda: number) => coordinateAscent(evaluator, start, (result) => result.score - lambda * 100 * result.trueNodocRate)
  let solution = solveAt(0)
  let lambda = 0
  if (!feasible(solution.result)) {
    let lo = 0
    let hi = LAMBDA_START
    let hiSolution = solveAt(hi)
    while (!feasible(hiSolution.result) && hi < LAMBDA_MAX) {
      lo = hi
      hi = Math.min(LAMBDA_MAX, hi * 2)
      hiSolution = solveAt(hi)
    }
    if (feasible(hiSolution.result)) {
      for (let step = 0; step < LAMBDA_BISECTIONS; step += 1) {
        const mid = (lo + hi) / 2
        const midSolution = solveAt(mid)
        if (feasible(midSolution.result)) {
          hi = mid
          hiSolution = midSolution
        } else lo = mid
      }
    }
    solution = hiSolution
    lambda = hi
  }
  if (feasible(solution.result)) solution = coordinateAscent(evaluator, solution.thresholds, (result) => result.score, feasible)
  return { thresholds: solution.thresholds, result: solution.result, lambda, met: feasible(solution.result) }
}

// ─── 우주 교차 맞춤 ──────────────────────────────────────────────────────

interface UniverseContext {
  examples: CalibrationExample[]
  votes: string[][]
  foldOf: number[]
  folds: number
  /** 겹 f 를 뺀 우주로 컴파일한 색인. */
  foldIndex: CompiledAnswerIndex[]
  partialRates: Record<AnswerCardKind, number>
}

function analyzeUniverse(context: UniverseContext, weights: Record<ScoreComponent, number>, defaultCal: ResolvedCalibration) {
  const indexes = context.foldIndex.map((index) => withCalibration(index, { ...defaultCal, weights }))
  return context.examples.map((example, i) => {
    const index = indexes[context.foldOf[i]]
    return digestAnalysis(index, example, analyzeQuestion(index, example.q, { env: {}, votes: context.votes[i] }))
  })
}

/** 맞춤 행 고르기(겹 제외) → 모델. 같은 제외 묶음은 한 번만 맞춘다. */
function modelCache(analyzed: readonly AnalyzedExample[], foldOf: readonly number[]) {
  const cache = new Map<string, ReturnType<typeof fitConfidenceModels>>()
  return (excluded: readonly number[]) => {
    const key = [...excluded].sort((a, b) => a - b).join(",")
    const hit = cache.get(key)
    if (hit) return hit
    const skip = new Set(excluded)
    const rows: ConfidenceRow[] = []
    for (let i = 0; i < analyzed.length; i += 1) if (!skip.has(foldOf[i]) && analyzed[i].row) rows.push(analyzed[i].row!)
    const fitted = fitConfidenceModels(rows)
    cache.set(key, fitted)
    return fitted
  }
}

export interface NestedResult {
  score: number
  spread: number
  trueNodocRate: number
  nodocRate: number
  /** 바깥 겹마다 안쪽에서 고른 θ 가 제약을 지켰는지. */
  met: boolean[]
  thresholds: Thresholds[]
  points: Float64Array
  answered: Uint8Array
}

/** 가중치 하나의 중첩 교차 검증 점수(바깥 겹 g: 안쪽에서 θ, g 를 뺀 모델로 g 채점). */
function nestedScore(context: UniverseContext, analyzed: readonly AnalyzedExample[]): NestedResult {
  const models = modelCache(analyzed, context.foldOf)
  const n = analyzed.length
  const points = new Float64Array(n)
  const answered = new Uint8Array(n)
  const met: boolean[] = []
  const chosen: Thresholds[] = []
  for (let g = 0; g < context.folds; g += 1) {
    const inner: number[] = []
    const outer: number[] = []
    for (let i = 0; i < n; i += 1) (context.foldOf[i] === g ? outer : inner).push(i)
    const innerConfs = inner.map((i) => segmentConfs(analyzed[i], models([g, context.foldOf[i]]).confidence))
    const evaluator = new ThresholdEvaluator(
      inner.map((i) => analyzed[i]),
      inner.map((i) => context.examples[i]),
      innerConfs,
      context.partialRates
    )
    const selection = selectThresholds(evaluator)
    met.push(selection.met)
    chosen.push(selection.thresholds)
    const outerModel = models([g]).confidence
    const outerEvaluator = new ThresholdEvaluator(
      outer.map((i) => analyzed[i]),
      outer.map((i) => context.examples[i]),
      outer.map((i) => segmentConfs(analyzed[i], outerModel)),
      context.partialRates
    )
    const scored = outerEvaluator.points(selection.thresholds)
    outer.forEach((i, k) => {
      points[i] = scored.points[k]
      answered[i] = scored.answered[k]
    })
  }
  const nodoc = context.examples.map((example) => example.nodoc)
  let nodocCount = 0
  let nodocAnswered = 0
  let trueCount = 0
  let trueAnswered = 0
  context.examples.forEach((example, i) => {
    if (!example.nodoc) return
    nodocCount += 1
    nodocAnswered += answered[i]
    if (example.trueNodoc ?? example.nodoc) {
      trueCount += 1
      trueAnswered += answered[i]
    }
  })
  return {
    score: meanRateScore(points, nodoc),
    spread: rateSpread(points, nodoc),
    trueNodocRate: trueCount === 0 ? 0 : trueAnswered / trueCount,
    nodocRate: nodocCount === 0 ? 0 : nodocAnswered / nodocCount,
    met,
    thresholds: chosen,
    points,
    answered,
  }
}

// ─── 캐시 ────────────────────────────────────────────────────────────────

export interface GridEntry {
  weights: Record<ScoreComponent, number>
  /** 중첩 교차 검증 세 비율 평균(바깥 겹). */
  score: number
  spread: number
  trueNodocRate: number
  nodocRate: number
  /** 바깥 겹 가운데 안쪽 θ 가 제약을 지킨 수. */
  met: number
}

interface GridCache {
  key: string
  entries: Record<string, GridEntry>
}

function readGridCache(path: string, key: string): GridCache {
  try {
    if (existsSync(path)) {
      const value = JSON.parse(readFileSync(path, "utf8")) as GridCache
      if (value && value.key === key && value.entries && typeof value.entries === "object") return value
    }
  } catch {
    // 깨진 캐시는 버린다.
  }
  return { key, entries: {} }
}

function writeGridCache(path: string, cache: GridCache) {
  const temp = `${path}.tmp`
  writeFileSync(temp, `${JSON.stringify(cache)}\n`)
  renameSync(temp, path)
}

// ─── 외부 확인(보정 묶음) ────────────────────────────────────────────────

export interface RateCount {
  hit: number
  n: number
  /** 백분율(소수 1자리). */
  pct: number
}

export interface ExternalCheck {
  set: string
  n: number
  skipped: ExampleSplit["skipped"]
  score: number
  spread: number
  /** 카드 라벨 문항 중 원문 1위 실제 카드가 라벨인 비율. */
  top1: RateCount
  /** 카드 라벨 문항 중 그 카드로 답한 비율. */
  decided: RateCount
  /** 문서 문항(카드·clarify) 평균 점수 %(진단 docAcc 와 같은 셈). */
  docAcc: number
  nodocAnswered: RateCount
  trueNodocAnswered: RateCount
  /** 정해 둔 답 승격으로 답한 수. */
  rescued: number
}

const rateCount = (hit: number, n: number): RateCount => ({ hit, n, pct: n === 0 ? 0 : Math.round((hit / n) * 1000) / 10 })
const round2 = (value: number) => Math.round(value * 100) / 100

/** 보정 묶음 외부 확인: 런타임과 같은 분석(전체 색인·표)과 결정(주어진 보정 값). */
export function externalCheck(
  index: CompiledAnswerIndex,
  examples: readonly CalibrationExample[],
  votes: readonly (readonly string[])[],
  partialRates = DEFAULT_PARTIAL_RATES,
  set = "",
  skipped: ExampleSplit["skipped"] = { unresolved: 0, missing: 0, unknownCard: 0 }
): ExternalCheck {
  const threshold = thresholdFn(index.calibration.thresholds)
  const points = new Float64Array(examples.length)
  let top1 = 0
  let decided = 0
  let cardN = 0
  let nodocN = 0
  let nodocAnswered = 0
  let trueN = 0
  let trueAnswered = 0
  let docSum = 0
  let docN = 0
  let rescued = 0
  examples.forEach((example, i) => {
    const analysis = analyzeQuestion(index, example.q, { env: {}, votes: votes[i] ?? [] })
    const decision = resolveDecision(index, analysis, threshold)
    points[i] = examplePoints(example, decision, index, partialRates)
    if (decision.rescue === "vote") rescued += 1
    const answered = decision.kind === "answer" ? 1 : 0
    if (example.nodoc) {
      nodocN += 1
      nodocAnswered += answered
      if (example.trueNodoc ?? example.nodoc) {
        trueN += 1
        trueAnswered += answered
      }
      return
    }
    docN += 1
    docSum += points[i]
    if (example.label === "clarify") return
    cardN += 1
    const whole = analysis.whole
    if (whole.topReal >= 0 && whole.ranked[whole.topReal].id === example.label) top1 += 1
    if (decision.kind === "answer" && decision.card === example.label) decided += 1
  })
  const nodoc = examples.map((example) => example.nodoc)
  return {
    set,
    n: examples.length,
    skipped,
    score: round2(meanRateScore(points, nodoc)),
    spread: round2(rateSpread(points, nodoc)),
    top1: rateCount(top1, cardN),
    decided: rateCount(decided, cardN),
    docAcc: docN === 0 ? 0 : Math.round((docSum / docN) * 1000) / 10,
    nodocAnswered: rateCount(nodocAnswered, nodocN),
    trueNodocAnswered: rateCount(trueAnswered, trueN),
    rescued,
  }
}

// ─── 전체 ────────────────────────────────────────────────────────────────

export interface CalibrateOptions {
  dir: string
  /** 보정 묶음 경로(외부 확인, 없으면 <dir>/eval/calibration-set.json). */
  setPath?: string
  /** false 면 가중치 격자를 훑지 않고 기본 가중치를 쓴다. 배열이면 그 점들만 훑는다(시험·실험용). */
  grid?: boolean | readonly Record<ScoreComponent, number>[]
  partialRates?: Record<AnswerCardKind, number>
  load?: Omit<AnswerIndexLoadOptions, "dir">
  /** 격자 점 결과 캐시 폴더(없으면 캐시 없음). */
  cacheDir?: string
  /** 진행 상황 알림. */
  log?: (line: string) => void
}

export interface CurvePoint {
  /** λ 경로면 λ, 공통 θ 면 θ. */
  at: number
  score: number
  spread: number
  /** 진짜 NODOC 답함 %. */
  trueNodoc: number
  /** 문서에 없음(전체) 답함 %. */
  nodoc: number
  thresholds?: Thresholds
}

export interface OofSummary {
  n: number
  score: number
  spread: number
  top1: RateCount
  decided: RateCount
  docAcc: number
  nodocAnswered: RateCount
  trueNodocAnswered: RateCount
}

export interface CalibrateReport {
  set: string
  counts: {
    universe: number
    usable: number
    skipped: UniverseSkipped
    personas: number
    folds: number
    labels: { card: number; none: number; gap: number; clarify: number; trueNodoc: number }
  }
  fittedKinds: AnswerCardKind[]
  pooledKinds: AnswerCardKind[]
  kindCounts: Record<AnswerCardKind, number>
  grid: GridEntry[]
  gridCached: number
  voteDropped: boolean
  /** 고른 가중치의 중첩 교차 검증(정직한 추정). */
  nested: { score: number; spread: number; trueNodoc: number; nodoc: number; met: number; bootstrap: { p5: number; p10: number; p50: number; p95: number } } | null
  /** 고른 θ 의 우주 OOF(교차 맞춤 확신도, θ 는 같은 자료로 고름). */
  oof: OofSummary | null
  selection: { lambda: number; met: boolean } | null
  curve: { lambda: CurvePoint[]; common: CurvePoint[]; externalCommon: CurvePoint[] }
  external: ExternalCheck | null
  defaults: boolean
  seconds: number
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
  return finalize({
    dataVersion,
    weights: { ...DEFAULT_WEIGHTS },
    confidence: defaultModel(),
    thresholds: { ...DEFAULT_THRESHOLDS },
    nodocRatesChecked: [...NODOC_RATES],
    fit: { set, n: 0, check: 0, bootstrapP10: 0 },
    assist,
  })
}

const pct1 = (value: number) => Math.round(value * 1000) / 10

function curvePoint(at: number, result: ThresholdResult, thresholds?: Thresholds): CurvePoint {
  return { at, score: round2(result.score), spread: round2(result.spread), trueNodoc: pct1(result.trueNodocRate), nodoc: pct1(result.nodocRate), ...(thresholds ? { thresholds } : {}) }
}

function oofSummary(evaluator: ThresholdEvaluator, analyzed: readonly AnalyzedExample[], examples: readonly CalibrationExample[], thresholds: Thresholds): OofSummary {
  const result = evaluator.evaluate(thresholds)
  const { points, answered } = evaluator.points(thresholds)
  let top1 = 0
  let decided = 0
  let cardN = 0
  let docSum = 0
  let docN = 0
  examples.forEach((example, i) => {
    if (example.nodoc) return
    docN += 1
    docSum += points[i]
    if (example.label === "clarify") return
    cardN += 1
    if (analyzed[i].top1 === example.label) top1 += 1
    if (answered[i] && points[i] > 0) decided += 1
  })
  return {
    n: examples.length,
    score: round2(result.score),
    spread: round2(result.spread),
    top1: rateCount(top1, cardN),
    decided: rateCount(decided, cardN),
    docAcc: docN === 0 ? 0 : Math.round((docSum / docN) * 1000) / 10,
    nodocAnswered: rateCount(result.nodocAnswered, result.nodocCount),
    trueNodocAnswered: rateCount(result.trueNodocAnswered, result.trueNodocCount),
  }
}

function universeSetName(examples: readonly CalibrationExample[], foldOf: readonly number[]) {
  const body = examples.map((example, i) => `${example.id}\t${example.group ?? ""}\t${example.label}\t${example.trueNodoc ? 1 : 0}\t${foldOf[i]}\t${sha256(example.q).slice(0, 12)}`).join("\n")
  return `universe-oof@${sha256(body).slice(0, 12)}`
}

/** 보정 실행. 결과 파일 내용(쓰지는 않는다)과 보고. */
export function runCalibration(options: CalibrateOptions): { calibration: CalibrationFile; report: CalibrateReport } {
  const started = performance.now()
  const log = options.log ?? (() => {})
  const partialRates = options.partialRates ?? DEFAULT_PARTIAL_RATES
  const dataVersion = calibrationBasisVersion(options.dir)
  const assist = readAssist(options.dir)

  const data = loadAnswerIndexData({ curatedTextHash, ...options.load, dir: options.dir })
  // 지금 calibration.json 은 쓰지 않는다: 기본값에서 시작해야 같은 자료가 같은 결과를 낸다.
  const base = compileAnswerIndex({ ...data, calibration: null })
  const defaultCal = resolveCalibration(null)

  const { examples, skipped } = universeExamples(data.universe, base)
  const { folds, groups, foldOf } = groupFolds(examples)
  const setName = examples.length > 0 ? universeSetName(examples, foldOf) : "none"
  const labels = {
    card: examples.filter((example) => !example.nodoc && example.label !== "clarify").length,
    none: examples.filter((example) => example.label === "none").length,
    gap: examples.filter((example) => example.label.startsWith("gap:")).length,
    clarify: examples.filter((example) => example.label === "clarify").length,
    trueNodoc: examples.filter((example) => example.trueNodoc).length,
  }
  const report: CalibrateReport = {
    set: setName,
    counts: { universe: data.universe.length, usable: examples.length, skipped, personas: groups.length, folds, labels },
    fittedKinds: [],
    pooledKinds: [],
    kindCounts: Object.fromEntries(ANSWER_CARD_KINDS.map((kind) => [kind, 0])) as Record<AnswerCardKind, number>,
    grid: [],
    gridCached: 0,
    voteDropped: false,
    nested: null,
    oof: null,
    selection: null,
    curve: { lambda: [], common: [], externalCommon: [] },
    external: null,
    defaults: true,
    seconds: 0,
  }
  const done = (calibration: CalibrationFile) => {
    report.seconds = Math.round((performance.now() - started) / 100) / 10
    return { calibration, report }
  }
  if (examples.length === 0 || folds < 2 || base.cards.length === 0) {
    log(`쓸 우주 문항·관점이 모자라(문항 ${examples.length}·관점 ${groups.length}, 카드 ${base.cards.length}) 기본값으로 만든다.`)
    return done(defaultsFile(dataVersion, assist, setName))
  }

  // 겹마다 그 겹 우주를 뺀 색인.
  log(`우주 ${examples.length}문항 · 관점 ${groups.length} → ${folds}겹, 겹 색인 컴파일`)
  const foldIndex: CompiledAnswerIndex[] = []
  for (let f = 0; f < folds; f += 1) {
    const dropped = new Set(groups.filter((_, position) => position % folds === f))
    foldIndex.push(compileAnswerIndex({ ...data, universe: data.universe.filter((item) => !dropped.has(typeof item.p === "string" ? item.p : "")), calibration: null }))
  }
  const votes = legacyVotesFor(base, examples)
  const context: UniverseContext = { examples, votes, foldOf, folds, foldIndex, partialRates }

  // 격자.
  const candidates = Array.isArray(options.grid) ? options.grid.map((weights) => ({ ...weights })) : options.grid === false ? [{ ...defaultCal.weights }] : weightGrid()
  let cachePath: string | null = null
  let cache: GridCache | null = null
  if (options.cacheDir) {
    const probe = examples.slice(0, CACHE_PROBE_ITEMS).map((example, i) => {
      const index = withCalibration(foldIndex[foldOf[i]], defaultCal)
      const analysis = analyzeQuestion(index, example.q, { env: {}, votes: votes[i] })
      return [analysis.whole.ranked.slice(0, 5).map((candidate) => [candidate.id, candidate.s]), analysis.whole.features ? featureVector(analysis.whole.features) : null, analysis.parts?.length ?? 0]
    })
    const key = sha256(
      JSON.stringify({
        method: CALIBRATE_METHOD_VERSION,
        // 이 파일 내용(판을 올리지 않고 방법을 고쳐도 캐시가 낡지 않게). 읽을 수 없으면 판만 쓴다.
        source: typeof __filename === "string" && existsSync(__filename) ? sha256(readFileSync(__filename, "utf8")) : null,
        grid: THRESHOLD_GRID,
        maxTrueNodoc: MAX_TRUE_NODOC_ANSWERED,
        partialRates,
        dataVersion,
        index: answerIndexHash(base),
        set: setName,
        votes: sha256(JSON.stringify(votes)),
        probe: sha256(JSON.stringify(probe)),
      })
    ).slice(0, 16)
    mkdirSync(options.cacheDir, { recursive: true })
    cachePath = join(options.cacheDir, "grid.json")
    cache = readGridCache(cachePath, key)
  }
  const evaluateGrid = (weights: Record<ScoreComponent, number>): GridEntry => {
    const cached = cache?.entries[weightsKey(weights)]
    if (cached) {
      report.gridCached += 1
      return cached
    }
    const nested = nestedScore(context, analyzeUniverse(context, weights, defaultCal))
    const entry: GridEntry = {
      weights,
      score: round2(nested.score),
      spread: round2(nested.spread),
      trueNodocRate: Math.round(nested.trueNodocRate * 10000) / 10000,
      nodocRate: Math.round(nested.nodocRate * 10000) / 10000,
      met: nested.met.filter(Boolean).length,
    }
    if (cache && cachePath) {
      cache.entries[weightsKey(weights)] = entry
      writeGridCache(cachePath, cache)
    }
    return entry
  }
  const gridStarted = performance.now()
  let best: GridEntry | null = null
  for (const [position, weights] of candidates.entries()) {
    const entry = evaluateGrid(weights)
    report.grid.push(entry)
    if (!best || entry.score > best.score) best = entry
    const elapsed = (performance.now() - gridStarted) / 1000
    const left = (elapsed / (position + 1)) * (candidates.length - position - 1)
    log(`  가중치 격자 ${position + 1}/${candidates.length} 점수 ${entry.score} (최고 ${best.score}) · ${Math.round(elapsed)}초, 남은 약 ${Math.round(left)}초`)
  }
  let chosen = best!
  if (chosen.weights.vote !== 0) {
    const noVoteWeights = { ...chosen.weights, vote: 0 }
    const noVote = report.grid.find((entry) => weightsKey(entry.weights) === weightsKey(noVoteWeights)) ?? evaluateGrid(noVoteWeights)
    if (chosen.score - noVote.score <= VOTE_KEEP_MIN_GAIN) {
      chosen = noVote
      report.voteDropped = true
    }
  }
  const weights = { ...chosen.weights }
  log(`  고른 가중치 ${JSON.stringify(weights)} · 중첩 점수 ${chosen.score}`)

  // 마무리: 교차 맞춤 OOF 확신도로 θ, 계수는 행 전부로.
  const analyzed = analyzeUniverse(context, weights, defaultCal)
  const nested = nestedScore(context, analyzed)
  const models = modelCache(analyzed, foldOf)
  const oofConfs = analyzed.map((item, i) => segmentConfs(item, models([foldOf[i]]).confidence))
  const evaluator = new ThresholdEvaluator(analyzed, examples, oofConfs, partialRates)
  const selection = selectThresholds(evaluator)
  const finalModel = fitConfidenceModels(analyzed.flatMap((item) => (item.row ? [item.row] : [])))
  const thresholds = selection.thresholds
  report.fittedKinds = finalModel.own
  report.pooledKinds = finalModel.pooled
  report.kindCounts = finalModel.counts
  report.selection = { lambda: Math.round(selection.lambda * 10000) / 10000, met: selection.met }
  report.oof = oofSummary(evaluator, analyzed, examples, thresholds)
  const boot = clusterBootstrap(
    nested.points,
    examples.map((example) => example.nodoc),
    examples.map((example) => example.group ?? "")
  )
  report.nested = {
    score: round2(nested.score),
    spread: round2(nested.spread),
    trueNodoc: pct1(nested.trueNodocRate),
    nodoc: pct1(nested.nodocRate),
    met: nested.met.filter(Boolean).length,
    bootstrap: { p5: round2(boot.p5), p10: round2(boot.p10), p50: round2(boot.p50), p95: round2(boot.p95) },
  }
  // 곡선: λ 경로(다듬기 없음)와 네 답 종류 공통 θ.
  for (const lambda of CURVE_LAMBDAS) {
    const solution = coordinateAscent(evaluator, DEFAULT_THRESHOLDS, (result) => result.score - lambda * 100 * result.trueNodocRate)
    report.curve.lambda.push(curvePoint(lambda, solution.result, solution.thresholds))
  }
  const commonAt = (theta: number): Thresholds => ({ ...thresholds, ...Object.fromEntries(ANSWER_KINDS.map((kind) => [kind, theta])) })
  for (const theta of THRESHOLD_GRID) report.curve.common.push(curvePoint(theta, evaluator.evaluate(commonAt(theta))))

  // 외부 확인(보정 묶음): 맞춤에 쓰지 않는다. 결과 파일에는 쓴 문항 수(fit.check)만 남긴다.
  const setPath = options.setPath ?? join(options.dir, CALIBRATION_SET_FILE)
  const setFile = readCalibrationSet(setPath)
  const external = setFile ? calibrationSetExamples(setFile.items, base) : null
  const calibration = finalize({
    dataVersion,
    weights,
    confidence: finalModel.confidence,
    thresholds,
    nodocRatesChecked: [...NODOC_RATES],
    fit: { set: setName, n: examples.length, check: external?.examples.length ?? 0, bootstrapP10: Math.round(boot.p10 * 1000) / 1000 },
    assist,
  })
  if (external) {
    log(`  보정 묶음 외부 확인 ${external.examples.length}문항`)
    const runtime = withCalibration(base, resolveCalibration(calibration))
    const externalVotes = legacyVotesFor(base, external.examples)
    const externalName = `calibration-set@${sha256(readFileSync(setPath, "utf8")).slice(0, 12)}`
    report.external = externalCheck(runtime, external.examples, externalVotes, partialRates, externalName, external.skipped)
    const externalAnalyzed = external.examples.map((example, i) =>
      digestAnalysis(runtime, example, analyzeQuestion(runtime, example.q, { env: {}, votes: externalVotes[i] }))
    )
    const externalEvaluator = new ThresholdEvaluator(
      externalAnalyzed,
      external.examples,
      externalAnalyzed.map((item) => segmentConfs(item, finalModel.confidence)),
      partialRates
    )
    for (const theta of THRESHOLD_GRID) report.curve.externalCommon.push(curvePoint(theta, externalEvaluator.evaluate(commonAt(theta))))
  }
  report.defaults = false
  return done(calibration)
}

// ─── 보고 파일(질문 글 없음) ─────────────────────────────────────────────

const fmtThresholds = (thresholds: Thresholds) => ANSWER_CARD_KINDS.map((kind) => `${kind} ${thresholds[kind]}`).join(" · ")

/** 보정 보고(마크다운): 고른 값·중첩 점수·OOF·외부 확인·점수 대 NODOC 곡선·격자 상위. 질문 글은 넣지 않는다. */
export function renderCalibrationReport(calibration: CalibrationFile, report: CalibrateReport) {
  const lines: string[] = []
  lines.push(`# 답 색인 보정 보고 (${calibration.version})`, "")
  lines.push(`- 자료 판 ${calibration.dataVersion} · 맞춤 자료 ${report.set} · 걸린 시간 ${report.seconds}초`)
  if (report.defaults) {
    lines.push("- 쓸 우주 문항이 없어 기본값으로 만들었다.")
    return `${lines.join("\n")}\n`
  }
  const c = report.counts
  lines.push(
    `- 우주 ${c.universe}문항 → 쓸 문항 ${c.usable}(카드 ${c.labels.card}·none ${c.labels.none}·gap ${c.labels.gap}·clarify ${c.labels.clarify}, 진짜 NODOC ${c.labels.trueNodoc}), 뺀 문항 ${JSON.stringify(c.skipped)}`,
    `- 관점 ${c.personas} → ${c.folds}겹(관점 단위), 겹마다 그 겹 우주를 뺀 색인으로 분석`,
    `- 확신도: 제 모델 ${report.fittedKinds.join(", ") || "없음"} · 공용 모델(종류 one-hot) ${report.pooledKinds.join(", ") || "없음"} · 종류별 맞춤 행 ${JSON.stringify(report.kindCounts)}`,
    ""
  )
  lines.push("## 고른 값", "")
  lines.push(`- 가중치 ${JSON.stringify(calibration.weights)}${report.voteDropped ? " (vote 는 이득 0.5점 이하라 0)" : ""}`)
  lines.push(`- 문턱 ${fmtThresholds(calibration.thresholds)}`)
  if (report.selection) lines.push(`- 문턱 제약(진짜 NODOC 답함 ≤ ${MAX_TRUE_NODOC_ANSWERED * 100}%): ${report.selection.met ? "지킴" : "못 지킴"} · 벌점 λ ${report.selection.lambda}`)
  lines.push("")
  if (report.nested) {
    const n = report.nested
    lines.push("## 우주 중첩 교차 검증(고른 가중치, 정직한 추정)", "")
    lines.push(`- 세 비율 대리 ${n.score} (관점 군집 부트스트랩 5·10·50·95% ${n.bootstrap.p5} · ${n.bootstrap.p10} · ${n.bootstrap.p50} · ${n.bootstrap.p95}) · 퍼짐 ${n.spread}`)
    lines.push(`- 진짜 NODOC 답함 ${n.trueNodoc}% · 문서에 없음 전체 답함 ${n.nodoc}% · 안쪽 θ 제약 지킨 바깥 겹 ${n.met}/${report.counts.folds}`, "")
  }
  if (report.oof) {
    const o = report.oof
    lines.push("## 우주 OOF(교차 맞춤 확신도, 고른 θ — θ 는 같은 자료로 골랐다)", "")
    lines.push(`- 세 비율 대리 ${o.score} · 퍼짐 ${o.spread}`)
    lines.push(`- 1위 정답 ${o.top1.hit}/${o.top1.n} (${o.top1.pct}%) · 결정 정답 ${o.decided.hit}/${o.decided.n} (${o.decided.pct}%) · 문서 문항 점수 ${o.docAcc}%`)
    lines.push(`- 진짜 NODOC 답함 ${o.trueNodocAnswered.hit}/${o.trueNodocAnswered.n} (${o.trueNodocAnswered.pct}%) · 문서에 없음 전체 답함 ${o.nodocAnswered.hit}/${o.nodocAnswered.n} (${o.nodocAnswered.pct}%)`, "")
  }
  if (report.external) {
    const e = report.external
    lines.push(`## 보정 묶음 외부 확인(${e.set}, 맞춤에 쓰지 않음, 런타임과 같은 분석·결정)`, "")
    lines.push(`- 쓸 문항 ${e.n} · 뺀 문항 ${JSON.stringify(e.skipped)}`)
    lines.push(`- 세 비율 대리 ${e.score} · 퍼짐 ${e.spread}`)
    lines.push(`- 1위 정답 ${e.top1.hit}/${e.top1.n} (${e.top1.pct}%) · 결정 정답 ${e.decided.hit}/${e.decided.n} (${e.decided.pct}%) · 문서 문항 점수 ${e.docAcc}%`)
    lines.push(`- 진짜 NODOC 답함 ${e.trueNodocAnswered.hit}/${e.trueNodocAnswered.n} (${e.trueNodocAnswered.pct}%) · 문서에 없음 전체 답함 ${e.nodocAnswered.hit}/${e.nodocAnswered.n} (${e.nodocAnswered.pct}%) · 정해 둔 답 승격 ${e.rescued}`, "")
  }
  lines.push("## 점수 대 NODOC 곡선", "")
  lines.push("### 벌점 λ 경로(우주 OOF, 종류별 좌표 탐색)", "")
  lines.push("| λ | 대리 | 퍼짐 | 진짜 NODOC 답함 % | NODOC 전체 답함 % | 문턱 |", "|---|---|---|---|---|---|")
  for (const point of report.curve.lambda) lines.push(`| ${point.at} | ${point.score} | ${point.spread} | ${point.trueNodoc} | ${point.nodoc} | ${point.thresholds ? fmtThresholds(point.thresholds) : ""} |`)
  lines.push("", "### 네 답 종류(doc·howto·fixed·policy) 공통 θ(gap·handoff 는 고른 값)", "")
  lines.push("| θ | 우주 OOF 대리 | 진짜 NODOC 답함 % | NODOC 전체 % | 보정 묶음 대리 | 보정 묶음 진짜 NODOC % |", "|---|---|---|---|---|---|")
  report.curve.common.forEach((point, k) => {
    const external = report.curve.externalCommon[k]
    lines.push(`| ${point.at} | ${point.score} | ${point.trueNodoc} | ${point.nodoc} | ${external ? external.score : ""} | ${external ? external.trueNodoc : ""} |`)
  })
  lines.push("", `## 가중치 격자(중첩 점수 상위 15, 전체 ${report.grid.length}점${report.gridCached ? `, 캐시 ${report.gridCached}` : ""})`, "")
  lines.push("| maxcos | centroid | knn | vote | bm25f | 중첩 대리 | 진짜 NODOC % | 제약 지킨 겹 |", "|---|---|---|---|---|---|---|---|")
  const top = [...report.grid].map((entry, position) => ({ entry, position })).sort((a, b) => b.entry.score - a.entry.score || a.position - b.position).slice(0, 15)
  for (const { entry } of top) {
    const w = entry.weights
    lines.push(`| ${w.maxcos} | ${w.centroid} | ${w.knnShare} | ${w.vote} | ${w.bm25f} | ${entry.score} | ${pct1(entry.trueNodocRate)} | ${entry.met} |`)
  }
  return `${lines.join("\n")}\n`
}
