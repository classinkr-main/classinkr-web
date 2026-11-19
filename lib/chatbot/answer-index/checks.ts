/**
 * 후보 검사(사양 §3.3 ⑤). 상위 후보마다 반례·덮임·설명 안 된 개념을, 질문마다 말뭉치 밖 낱말·없는 개념을 본다.
 *
 * - negMargin = (질문과 그 카드 반례의 최대 코사인) − (질문과 그 카드 양성 변형의 최대 코사인).
 *   변형이 없는 카드는 양성 쪽을 중심 벡터 코사인으로 본다. 0보다 크면 그 카드는 탈락하고 반례의 행선(route)이 가산점을 받는다.
 * - coverage = 질문 내용 n-gram·낱말 가운데 IDF 상위 절반이 카드 글·변형·anchors·개념 형태에 있는 비율(IDF 가중).
 *   색인이 모르는 n-gram 은 가장 높은 IDF 로 분모에 들어간다.
 * - unexplained = 질문 개념 가운데 일반 개념이 아니고 카드 개념(과 상위·하위 관계)이 설명하지 못하는 것.
 *   두 방향 덮기를 거부 규칙이 아니라 확신도 특징으로 쓴다(§1.3).
 * - 없는 개념: 질문에 absent.json 형태가 있고, 그 자리에 걸린 사전 개념이나 형태를 카드가 갖고 있지 않으면 '덮이지 않음'.
 */
import { LABEL_NONE, prepareQuery, TF_WEIGHT, type CompiledAnswerIndex, type IndexQuery } from "./compile"
import { compactForm, compactWithBoundaries, type AbsentMatch } from "./lexicon"

export const NEG_ROUTE_BONUS = 0.25

export interface NegativeScores {
  /** 반례 번호 → 코사인(닿지 않은 반례는 0). */
  acc: Float32Array
  touched: number[]
}

/** 질문과 모든 반례의 코사인(질문마다 한 번). */
export function scoreNegatives(index: CompiledAnswerIndex, query: IndexQuery): NegativeScores {
  const postings = index.negatives
  const acc = new Float32Array(postings.size)
  const touched: number[] = []
  const { ids, weights } = query.vector
  for (let k = 0; k < ids.length; k += 1) {
    const f = ids[k]
    if (f + 1 >= postings.offsets.length) continue
    const qw = weights[k] * index.featureWeight[f]
    for (let p = postings.offsets[f]; p < postings.offsets[f + 1]; p += 1) {
      const d = postings.docs[p]
      if (acc[d] === 0) touched.push(d)
      acc[d] += qw * TF_WEIGHT[postings.tf[p]]
    }
  }
  for (const d of touched) acc[d] *= postings.invNorm[d]
  touched.sort((a, b) => a - b)
  return { acc, touched }
}

export interface CandidateCheck {
  card: number
  maxNegCos: number
  /** 가장 가까운 반례의 행선(카드 번호, 없으면 LABEL_NONE)과 원래 행선 글. */
  negRoute: number
  negRouteId: string | null
  /** 양성 기준(변형 최고 코사인, 변형이 없으면 중심 벡터 코사인). */
  posRef: number
  negMargin: number
  rejected: boolean
  coverage: number
  unexplained: string[]
}

export interface CheckInputs {
  negatives: NegativeScores
  maxVariantCos: (card: number) => number
  centroidCos: (card: number) => number
}

function hasSorted(list: Int32Array, from: number, to: number, value: number) {
  let lo = from
  let hi = to - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const at = list[mid]
    if (at === value) return true
    if (at < value) lo = mid + 1
    else hi = mid - 1
  }
  return false
}

/** 특징이 카드 변형 가운데 하나에 있는지: 변형 역색인(문서 번호 오름차순)에서 카드 변형 구간을 이분 탐색한다. */
function inCardVariants(index: CompiledAnswerIndex, feature: number, card: number) {
  const { variantStart, variantEnd } = index.cards[card]
  if (variantEnd <= variantStart || feature + 1 >= index.variants.offsets.length) return false
  const docs = index.variants.docs
  let lo = index.variants.offsets[feature]
  let hi = index.variants.offsets[feature + 1]
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (docs[mid] < variantStart) lo = mid + 1
    else hi = mid
  }
  return lo < index.variants.offsets[feature + 1] && docs[lo] < variantEnd
}

/** 카드 덮임(§3.3 ⑤ coverage): 카드 글·변형·anchors·개념 형태에 있는 질문 내용 특징(IDF 상위 절반)의 IDF 가중 비율. */
export function coverageOf(index: CompiledAnswerIndex, query: Pick<IndexQuery, "terms">, card: number) {
  const terms = query.terms
  if (terms.length === 0) return 0
  const top = terms.slice(0, Math.ceil(terms.length / 2))
  const from = index.coverageOffsets[card]
  const to = index.coverageOffsets[card + 1]
  let covered = 0
  let total = 0
  for (const term of top) {
    total += term.idf
    if (term.feature >= 0 && (hasSorted(index.coverageIds, from, to, term.feature) || inCardVariants(index, term.feature, card))) covered += term.idf
  }
  return total > 0 ? covered / total : 0
}

/** 질문 개념 q 를 카드가 설명하는지(같은 개념, 카드 개념의 상위 개념, 또는 q 의 상위 개념이 카드 개념). */
export function conceptExplained(index: CompiledAnswerIndex, conceptId: string, card: number) {
  const compiled = index.cards[card]
  if (compiled.conceptClosure.has(conceptId)) return true
  for (const ancestor of index.lexicon.concepts.get(conceptId)?.ancestors ?? []) if (compiled.ownConcepts.includes(ancestor)) return true
  return false
}

/** 설명 안 된 비일반 개념(사전에 있는 개념만). */
export function unexplainedConcepts(index: CompiledAnswerIndex, query: Pick<IndexQuery, "conceptIds">, card: number) {
  return query.conceptIds.filter((id) => {
    const concept = index.lexicon.concepts.get(id)
    return Boolean(concept) && !concept!.generic && !conceptExplained(index, id, card)
  })
}

/** 상위 후보 하나 검사. */
export function checkCandidate(index: CompiledAnswerIndex, query: IndexQuery, card: number, inputs: CheckInputs): CandidateCheck {
  let maxNegCos = 0
  let best = -1
  for (const negative of inputs.negatives.touched) {
    if (index.negatives.owner[negative] !== card) continue
    const cos = inputs.negatives.acc[negative]
    if (cos > maxNegCos) {
      maxNegCos = cos
      best = negative
    }
  }
  const compiled = index.cards[card]
  const posRef = compiled.variantEnd > compiled.variantStart ? inputs.maxVariantCos(card) : inputs.centroidCos(card)
  const negMargin = maxNegCos - posRef
  return {
    card,
    maxNegCos,
    negRoute: best >= 0 ? index.negatives.route[best] : LABEL_NONE,
    negRouteId: best >= 0 ? index.negatives.routeId[best] : null,
    posRef,
    negMargin,
    rejected: best >= 0 && negMargin > 0,
    coverage: coverageOf(index, query, card),
    unexplained: unexplainedConcepts(index, query, card),
  }
}

// ─── 없는 개념 ───────────────────────────────────────────────────────────

/** 없는 개념 맞춤을 카드가 덮는지: 그 자리에 걸린 사전 개념을 카드가 설명하거나, 카드 topic·anchors 에 그 형태가 있다. */
export function absentCoveredBy(index: CompiledAnswerIndex, query: IndexQuery, match: AbsentMatch, card: number) {
  for (const concept of query.concepts) {
    if (concept.end <= match.start || concept.start >= match.end) continue
    if (conceptExplained(index, concept.id, card)) return true
  }
  const form = compactForm(match.form)
  return index.cards[card].anchorCompacts.some((anchor) => anchor.includes(form))
}

/** 정규화한 글에서 compact 자리 [start, end) 의 글자를 지운다(공백은 남김). */
export function removeCompactSpan(normalized: string, start: number, end: number) {
  let position = 0
  let out = ""
  for (const char of normalized) {
    if (char === " ") {
      out += char
      continue
    }
    if (position < start || position >= end) out += char
    position += char.length
  }
  return out.replace(/\s+/g, " ").trim()
}

/** 없는 개념 자리를 뺀 질문의 덮임(없는 부분 꼬리를 붙일지 정할 때). */
export function coverageWithoutSpan(index: CompiledAnswerIndex, query: IndexQuery, match: AbsentMatch, card: number) {
  const rest = removeCompactSpan(query.normalized, match.start, match.end)
  if (compactWithBoundaries(rest).compact.length < 2) return 0
  return coverageOf(index, prepareQuery(index, rest), card)
}
