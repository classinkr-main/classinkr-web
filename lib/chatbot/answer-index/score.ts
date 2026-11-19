/**
 * 후보 점수(사양 §3.4)와 확신도(§3.3 ⑥). 결정적이다(같은 색인·같은 질의 → 같은 점수·같은 순서).
 *
 * 성분
 * - maxcos: 변형 역색인으로 코사인 상위 200 변형을 뽑아 후보 카드를 정하고, 후보마다 그 카드 변형 가운데 가장 높은 코사인.
 * - centroid: 카드 중심 벡터 코사인. 중심 벡터 상위 50 카드도 후보에 넣는다.
 * - knnShare: 우주 상위 10 이웃(코사인 0.35 이상)의 라벨을 코사인 가중으로 나눈 몫. label2 가 다르면 반씩.
 * - vote: 옛 정규식 표(collectLegacyVotes 가 카드 id 로 바꾼 것)에 있으면 1.
 * - bm25f: 지금 문서 단위 BM25F 점수를 질의 최고점으로 나눈 값 가운데 카드 근거 단위의 최댓값.
 * - linear: 0(선택 특징, I9 ablation 전까지 쓰지 않음).
 * 합성 s = Σ 가중 × 성분(가중은 calibration.json, 없으면 §3.4 기본값). 같은 점수면 카드 id 순.
 */
import {
  BM25_B,
  BM25_K1,
  LABEL_ABSENT,
  LABEL_CLARIFY,
  LABEL_NONE,
  LABEL_UNAVAILABLE,
  queryBm25Tokens,
  TF_WEIGHT,
  type CompiledAnswerIndex,
  type IndexQuery,
  type Postings,
  type ResolvedCalibration,
} from "./compile"
import { ANSWER_INDEX_FEATURES, type AnswerCardKind, type AnswerIndexFeatures, type ScoreComponent } from "./types"

export const TOP_VARIANTS = 200
export const TOP_CENTROIDS = 50
export const KNN_K = 10
export const KNN_MIN_COS = 0.35
/** BM25 상위 단위의 카드도 후보에 넣는다(정규화 점수가 이 값 이상인 상위 단위). */
export const BM25_CANDIDATE_UNITS = 3
export const BM25_CANDIDATE_MIN = 0.5

export type ScoreComponents = Record<ScoreComponent, number>

export interface ScoredCandidate {
  /** 카드 번호(index.cards). */
  card: number
  id: string
  kind: AnswerCardKind
  s: number
  components: ScoreComponents
}

export interface KnnSummary {
  /** 이웃 수(코사인 0.35 이상, 최대 10). */
  neighbors: number
  /** 라벨별 몫: none·clarify·unavailable. 카드 몫은 후보 components.knnShare. */
  none: number
  clarify: number
  unavailable: number
}

export interface ScoreResult {
  candidates: ScoredCandidate[]
  knn: KnnSummary
  /** 카드 번호 → 그 카드 변형 최고 코사인(후보 아닌 카드도 반례 비교에 쓴다). */
  maxVariantCos: (card: number) => number
  /** 카드 번호 → 중심 벡터 코사인. */
  centroidCos: (card: number) => number
  /** 카드 번호 → 성분(후보 밖 카드를 뒤늦게 더할 때). */
  componentsOf: (card: number) => ScoreComponents
}

export interface ScoreOptions {
  /** 끈 카드(CHATBOT_COMPILED_DISABLED_CARDS). 후보·표·이웃 라벨에서 뺀다. */
  disabled?: ReadonlySet<string>
}

// ─── 역색인 누적 ─────────────────────────────────────────────────────────

/** 코사인 = acc[d] × invNorm[d]. touched 는 0 이 아닌 문서. */
function accumulate(postings: Postings, query: IndexQuery, featureWeight: Float32Array) {
  const acc = new Float32Array(postings.size)
  const touched: number[] = []
  const { ids, weights } = query.vector
  for (let k = 0; k < ids.length; k += 1) {
    const f = ids[k]
    if (f + 1 >= postings.offsets.length) continue
    const qw = weights[k] * featureWeight[f]
    for (let p = postings.offsets[f]; p < postings.offsets[f + 1]; p += 1) {
      const d = postings.docs[p]
      if (acc[d] === 0) touched.push(d)
      acc[d] += qw * TF_WEIGHT[postings.tf[p]]
    }
  }
  for (const d of touched) acc[d] *= postings.invNorm[d]
  return { acc, touched }
}

/** 점수 내림차순 상위 k(같으면 번호 오름차순). 크기 k 최소 힙으로 고른다(O(n log k)). */
function topK(touched: number[], score: (d: number) => number, k: number): [number, number][] {
  // a 가 b 보다 '나쁜가'(점수가 낮거나, 같으면 번호가 큼).
  const worse = (a: [number, number], b: [number, number]) => a[1] < b[1] || (a[1] === b[1] && a[0] > b[0])
  const heap: [number, number][] = []
  const siftUp = (at: number) => {
    while (at > 0) {
      const parent = (at - 1) >> 1
      if (!worse(heap[at], heap[parent])) break
      ;[heap[at], heap[parent]] = [heap[parent], heap[at]]
      at = parent
    }
  }
  const siftDown = (at: number) => {
    for (;;) {
      const left = at * 2 + 1
      const right = left + 1
      let worst = at
      if (left < heap.length && worse(heap[left], heap[worst])) worst = left
      if (right < heap.length && worse(heap[right], heap[worst])) worst = right
      if (worst === at) break
      ;[heap[at], heap[worst]] = [heap[worst], heap[at]]
      at = worst
    }
  }
  for (const d of touched) {
    const item: [number, number] = [d, score(d)]
    if (heap.length < k) {
      heap.push(item)
      siftUp(heap.length - 1)
    } else if (k > 0 && worse(heap[0], item)) {
      heap[0] = item
      siftDown(0)
    }
  }
  return heap.sort((a, b) => b[1] - a[1] || a[0] - b[0])
}

function bm25Scores(index: CompiledAnswerIndex, query: IndexQuery) {
  const { bm25 } = index
  const scores = new Float64Array(bm25.unitIds.length)
  if (bm25.unitIds.length === 0) return scores
  for (const [token, qtf] of queryBm25Tokens(query, index.lexicon)) {
    const postings = bm25.postings.get(token)
    if (!postings) continue
    const idf = bm25.idf.get(token) ?? 0
    for (let k = 0; k < postings.units.length; k += 1) {
      const unit = postings.units[k]
      const tf = postings.tf[k]
      const norm = BM25_K1 * (1 - BM25_B + (BM25_B * bm25.lengths[unit]) / (bm25.avgLength || 1))
      scores[unit] += qtf * idf * ((tf * (BM25_K1 + 1)) / (tf + norm))
    }
  }
  let max = 0
  for (const value of scores) if (value > max) max = value
  if (max > 0) for (let i = 0; i < scores.length; i += 1) scores[i] /= max
  return scores
}

// ─── 점수 ────────────────────────────────────────────────────────────────

export function compositeScore(components: ScoreComponents, weights: Record<ScoreComponent, number>) {
  let s = 0
  for (const key of Object.keys(weights) as ScoreComponent[]) s += weights[key] * (components[key] ?? 0)
  return s
}

/** §3.4 후보 점수. votes 는 카드 id 목록(옛 정규식 표). */
export function scoreCandidates(index: CompiledAnswerIndex, query: IndexQuery, votes: readonly string[] = [], options: ScoreOptions = {}): ScoreResult {
  const disabled = options.disabled ?? new Set<string>()
  const isLive = (card: number) => card >= 0 && card < index.cards.length && !disabled.has(index.cards[card].id)
  const weights = index.calibration.weights

  // 변형
  const variant = accumulate(index.variants, query, index.featureWeight)
  const maxVariantCos = (card: number) => {
    const { variantStart, variantEnd } = index.cards[card]
    let best = 0
    for (let v = variantStart; v < variantEnd; v += 1) if (variant.acc[v] > best) best = variant.acc[v]
    return best
  }

  // 중심 벡터
  const centroid = new Float32Array(index.cards.length)
  const centroidTouched: number[] = []
  {
    const { ids, weights: qws } = query.vector
    const { offsets, docs, weights: cws } = index.centroids
    for (let k = 0; k < ids.length; k += 1) {
      const f = ids[k]
      if (f + 1 >= offsets.length) continue
      for (let p = offsets[f]; p < offsets[f + 1]; p += 1) {
        const card = docs[p]
        if (centroid[card] === 0) centroidTouched.push(card)
        centroid[card] += qws[k] * cws[p]
      }
    }
  }
  const centroidCos = (card: number) => centroid[card]

  // 우주 이웃
  const universe = accumulate(index.universe, query, index.featureWeight)
  const neighbors = topK(universe.touched, (d) => universe.acc[d], KNN_K).filter(([, cos]) => cos >= KNN_MIN_COS)
  const knnShare = new Map<number, number>()
  const knn: KnnSummary = { neighbors: neighbors.length, none: 0, clarify: 0, unavailable: 0 }
  let knnTotal = 0
  const addLabel = (label: number, weight: number) => {
    knnTotal += weight
    if (label === LABEL_NONE) knn.none += weight
    else if (label === LABEL_CLARIFY) knn.clarify += weight
    else if (label === LABEL_UNAVAILABLE || (label >= 0 && !isLive(label))) knn.unavailable += weight
    else if (label >= 0) knnShare.set(label, (knnShare.get(label) ?? 0) + weight)
  }
  for (const [item, cos] of neighbors) {
    const label = index.universe.label[item]
    const label2 = index.universe.label2[item]
    if (label2 !== LABEL_ABSENT) {
      addLabel(label, cos / 2)
      addLabel(label2, cos / 2)
    } else addLabel(label, cos)
  }
  if (knnTotal > 0) {
    for (const [card, weight] of knnShare) knnShare.set(card, weight / knnTotal)
    knn.none /= knnTotal
    knn.clarify /= knnTotal
    knn.unavailable /= knnTotal
  }

  // BM25F
  const unitScores = bm25Scores(index, query)
  const bm25Of = (card: number) => {
    let best = 0
    for (const unit of index.cards[card].evidenceUnits) if (unitScores[unit] > best) best = unitScores[unit]
    return best
  }

  const voteSet = new Set(votes)
  const componentsOf = (card: number): ScoreComponents => ({
    maxcos: maxVariantCos(card),
    centroid: centroid[card],
    knnShare: knnShare.get(card) ?? 0,
    vote: voteSet.has(index.cards[card].id) ? 1 : 0,
    bm25f: bm25Of(card),
    linear: 0,
  })

  // 후보 모으기
  const pool = new Set<number>()
  for (const [v] of topK(variant.touched, (d) => variant.acc[d], TOP_VARIANTS)) pool.add(index.variants.owner[v])
  for (const [card] of topK(centroidTouched, (card) => centroid[card], TOP_CENTROIDS)) pool.add(card)
  for (const card of knnShare.keys()) pool.add(card)
  for (const id of voteSet) {
    const card = index.cardById.get(id)
    if (card !== undefined) pool.add(card)
  }
  const topUnits = Array.from(unitScores.keys())
    .filter((unit) => unitScores[unit] >= BM25_CANDIDATE_MIN)
    .sort((a, b) => unitScores[b] - unitScores[a] || a - b)
    .slice(0, BM25_CANDIDATE_UNITS)
  for (const unit of topUnits) for (const card of index.cardsByUnit[unit]) pool.add(card)

  const candidates: ScoredCandidate[] = []
  for (const card of pool) {
    if (!isLive(card)) continue
    const components = componentsOf(card)
    candidates.push({ card, id: index.cards[card].id, kind: index.cards[card].kind, s: compositeScore(components, weights), components })
  }
  sortCandidates(candidates)
  return { candidates, knn, maxVariantCos, centroidCos, componentsOf }
}

export function sortCandidates<T extends { s: number; id: string }>(list: T[]) {
  return list.sort((a, b) => b.s - a.s || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

// ─── 확신도 ──────────────────────────────────────────────────────────────

/** 특징 벡터(ANSWER_INDEX_FEATURES 순서). */
export function featureVector(features: AnswerIndexFeatures) {
  return ANSWER_INDEX_FEATURES.map((name) => features[name])
}

/** conf = σ(w·x + b), 카드 종류별 계수. */
export function confidenceOf(features: AnswerIndexFeatures, kind: AnswerCardKind, calibration: ResolvedCalibration) {
  const { w, b } = calibration.confidence[kind]
  const x = featureVector(features)
  let z = b
  for (let i = 0; i < x.length; i += 1) z += (w[i] ?? 0) * x[i]
  return 1 / (1 + Math.exp(-z))
}
