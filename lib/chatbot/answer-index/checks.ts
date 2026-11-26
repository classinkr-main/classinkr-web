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
import { isAskingSegment, normalizeText } from "./normalize"

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

/**
 * 공백 카드 낱말 덮임(R2 검토 품질-6 (3)): 질문의 내용 낱말(조사 뗀 꼴, 2자 이상) 가운데 공백 카드의 주제·anchors 에 들어 있거나, 카드가 설명하는
 * 개념에 맞은 낱말의 몫. 질문 전체 IDF 덮임(coverage)은 공백 카드 글이 짧아 낮게 나오므로("채팅 기록도 저장되나요" 0.48), 공백 카드 자체를 묻는
 * 질문인지는 이 몫으로도 본다.
 */
export function gapWordCoverage(index: CompiledAnswerIndex, query: Pick<IndexQuery, "contentWords" | "concepts">, card: number) {
  const words = query.contentWords.map((word) => compactForm(word)).filter((word) => word.length >= 2)
  if (words.length === 0) return 0
  const anchors = index.cards[card].anchorCompacts
  const conceptForms = query.concepts
    .filter((concept) => index.cards[card].conceptClosure.has(concept.id) || conceptExplained(index, concept.id, card))
    .map((concept) => compactForm(concept.form))
  let covered = 0
  for (const word of words) {
    if (anchors.some((anchor) => anchor.includes(word)) || conceptForms.some((form) => form.includes(word) || word.includes(form))) covered += 1
  }
  return covered / words.length
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

// ─── 없는 개념이 묻는 대상인지(R2 B2) ────────────────────────────────────

/** 형태 뒤에 바로 붙으면 비교·장소·제외 문맥(묻는 대상이 아님): "독서실에서", "로드맵처럼", "총판말고". */
const ATTACHED_CONTEXT_RE = /^(?:에서는|에서도|에서|에선|처럼|같은|같이|보다|대신|말고|빼고)/
/** 형태 다음 낱말이 이것이면 제외·비교 문맥: "총판 말고", "베타 같은". */
const NEXT_CONTEXT_RE = /^(?:말고|아니고|아니라|빼고|제외하고|같은|같이|처럼|대신)/
/**
 * 형태 다음 낱말이 이것으로 시작하면 그 형태가 묻는 대상이다(서술·의문·그 개념을 묻는 명사): "대기실 기능", "총판 모집", "베타 신청 돼요".
 * 그 밖의 한글 명사가 조사 없이 바로 오면 형태는 그 명사를 꾸미는 말이다("방과후 수업 녹화", "독서실 와이파이", "대기실 화면에서").
 */
const NEXT_TARGET_RE =
  /^(?:있|없|되|돼|됨|하|해|함|가능|어떻|어케|어디|언제|뭐|무엇|무슨|얼마|몇|왜|신청|모집|문의|가입|계약|등록|지원|채용|공고|이력|기능|테스트|프로그램|제도|혜택|할인|자격|조건|방법|절차|비용|가격|요금|기간|안내|서비스|사용|쓰|이용|도입|연동|관련|관해|대해|대한|정보|과정|문제|여부|알려|궁금|받|주|드|나|안)/

export interface AbsentTarget {
  target: boolean
  reason: "comparison" | "exclusion" | "modifier" | "adjunct" | "context" | null
}

/** 형태 + 다음 명사 뒤에 붙으면 때·곳을 꾸미는 부사어(휴원 기간에도, 방학 동안). */
const ADJUNCT_END_RE = /(?:에도|에는|동안|중에|중|때|때도|때는|에서도|에서)$/
/** 장소 부사어 끝. */
const LOCATIVE_END_RE = /(?:에서|에서는|에서도|에선)$/
/** 형태 바로 뒤에 붙으면 때·곳 부사어. */
const ATTACHED_ADJUNCT_RE = /^(?:에도|동안|중에)/

/** 한 문장 안의 상황 절 끝('…인데,'·'…한데'·'…지만'·'…앞두고'·'…관련해서'): 그 앞은 뒤 질문의 맥락이다. 쉼표만으로는 가르지 않는다. */
const SITUATION_CLAUSE_RE = /(?:는데|은데|인데|한데|던데|지만|니까|앞두고|관련해서|관련해)(?:요)?[,，]?\s+/
/** 관형형 동사로 끝나는 낱말(꾸미는 말): "받은", "쓰는", "만든", "보낸". 명사('권한·기한')와 섞이지 않게 는·은·던 끝과 몇 낱말만 본다. */
const ADNOMINAL_WORD_RE = /^[가-힣]+(?:는|은|던)$|^(?:만든|보낸|쓴|탄|된|온)$/
/** 관형형 뒤에 오면 앞 낱말이 그 사람·곳을 꾸미는 말이다("논문 쓰는 대학원생", "학원 하는 원장"). */
const PERSON_AFTER_RE = /^(?:대학원생|학생|학부모|선생님|선생|강사|원장|교사|사람|분|회사|학원|기관|직장인|사장|아이)/

/** 질문의 주절(상황 절 뒤 마지막 절)을 compact 로. 상황 절이 없거나 주절이 묻는 꼴이 아니면 null. */
function mainClauseCompact(raw: string): string | null {
  const parts = raw.split(new RegExp(SITUATION_CLAUSE_RE.source, "g")).map((part) => part.trim()).filter(Boolean)
  if (parts.length < 2) return null
  const main = parts[parts.length - 1]
  if (!isAskingSegment(main)) return null
  return compactWithBoundaries(normalizeText(main)).compact
}

/**
 * 없는 개념 맞춤이 질문이 묻는 대상인지(계획 §3 absent (1)). 묻는 대상이 아니면 공백·꼬리 판정에 쓰지 않는다(주의 표시만 남긴다).
 * - 바로 뒤에 '에서·처럼·같은·말고·대신…'이 붙거나 다음 낱말이 '말고·아니고·같은…'이면 아님(comparison·exclusion).
 * - 바로 뒤에 '에도·동안·중에'가 붙거나, 다음 낱말이 그 개념을 묻는 명사(기간 등)인데 '에도·동안·때…'로 끝나면 때·곳 부사어(adjunct).
 * - 조사 없이 다음 한글 낱말(2자 이상)이 오고 그 낱말이 NEXT_TARGET_RE 가 아니면 꾸미는 말(modifier): 뒤 명사구가 '…에서'면 대상이
 *   아니고(target false), 아니면 대상일 수 있다(target true, reason modifier — 남은 질문을 답하는 카드가 있으면 꼬리 없이 답한다).
 * - 다음 낱말이 영문·숫자면 꾸미는 말(target false). 다만 원문에서 형태 바로 뒤가 괄호면 풀이(외부 송출(RTMP 등))라 대상이다.
 * - 질문에 묻는 문장(묻는 꼴·증상 신고)이 따로 있고 형태가 그 문장들에 없으면 상황 설명 속 낱말(context). 한 문장 안이라도 상황 절('…인데,'·
 *   '…앞두고') 뒤 주절이 묻는 꼴이고 형태가 주절에 없으면 context.
 * - 형태 + 조사(로·으로·을·를) + 관형형 동사('팩스로 받은'), 형태 + 관형형 + 사람·곳('논문 쓰는 대학원생')은 꾸미는 말(modifier, 대상 아님).
 * 관형형 끝('수상한 결제')은 맞추기 단계(lexicon.ts matchAbsent)에서 이미 버린다.
 */
export function absentTargetOf(query: Pick<IndexQuery, "normalized" | "raw">, match: AbsentMatch, askingSentences: readonly string[] | null = null): AbsentTarget {
  const { compact, wordStart } = compactWithBoundaries(query.normalized)
  const form = compact.slice(match.start, match.end)
  if (askingSentences && askingSentences.length > 0 && !askingSentences.some((sentence) => compactWithBoundaries(normalizeText(sentence)).compact.includes(form))) {
    return { target: false, reason: "context" }
  }
  // 한 문장 안의 상황 절 속 낱말("논문 쓰는 대학원생인데, 화면 공유는 …", "재계약 앞두고 궁금한데 녹화본 …")도 상황 설명이다(품질-6).
  const main = mainClauseCompact(query.raw)
  if (main !== null && !main.includes(form)) return { target: false, reason: "context" }
  // 형태 + 조사(로·으로·을·를) + 관형형 동사("팩스로 받은 시간표")는 뒤 명사를 꾸미는 말이다.
  const particle = /^(?:으로|로|을|를)/.exec(compact.slice(match.end))
  if (!wordStart[match.end] && particle && wordStart[match.end + particle[0].length]) {
    let stop = match.end + particle[0].length + 1
    while (stop < compact.length && !wordStart[stop]) stop += 1
    if (ADNOMINAL_WORD_RE.test(compact.slice(match.end + particle[0].length, stop))) return { target: false, reason: "modifier" }
  }
  const attached = wordStart[match.end] ? "" : compact.slice(match.end, match.end + 3)
  if (attached && ATTACHED_CONTEXT_RE.test(attached)) return { target: false, reason: /말고|빼고/.test(attached) ? "exclusion" : "comparison" }
  if (attached && ATTACHED_ADJUNCT_RE.test(attached)) return { target: false, reason: "adjunct" }
  if (attached) return { target: true, reason: null }
  // 다음 낱말(공백 뒤).
  let stop = match.end + 1
  while (stop < compact.length && !wordStart[stop]) stop += 1
  const next = compact.slice(match.end, stop)
  if (!next) return { target: true, reason: null }
  if (NEXT_CONTEXT_RE.test(next)) return { target: false, reason: /말고|아니|빼고|제외/.test(next) ? "exclusion" : "comparison" }
  // 형태 + 관형형 + 사람·곳("논문 쓰는 대학원생"): 그 사람을 꾸미는 말이다.
  if (ADNOMINAL_WORD_RE.test(next)) {
    let after = stop + 1
    while (after < compact.length && !wordStart[after]) after += 1
    if (PERSON_AFTER_RE.test(compact.slice(stop, after))) return { target: false, reason: "modifier" }
  }
  if (/^[가-힣]{2,}/.test(next)) {
    if (!NEXT_TARGET_RE.test(next)) {
      // 꾸미는 말: 뒤 명사구가 장소 부사어(…에서)면 묻는 대상이 아니다("독서실 와이파이에서 끊겨요"). 아니면 묻는 대상일 수 있어
      // 공백 판정에는 쓰되(ISMS 인증 있나요), 남은 질문을 답하는 카드가 있으면 꼬리 없이 답한다(방과후 수업 녹화 영상 → 녹화 카드).
      let after = stop + 1
      while (after < compact.length && !wordStart[after]) after += 1
      const following = [next, compact.slice(stop, after)]
      if (following.some((word) => LOCATIVE_END_RE.test(word))) return { target: false, reason: "modifier" }
      return { target: true, reason: "modifier" }
    }
    if (/^[가-힣]{2,}/.test(next) && ADJUNCT_END_RE.test(next) && !/^(?:있|없|되|돼|하|해|가능)/.test(next)) return { target: false, reason: "adjunct" }
    return { target: true, reason: null }
  }
  if (/^[a-z0-9]/.test(next)) {
    const rawCompact = query.raw.replace(/\s+/g, "")
    const at = rawCompact.indexOf(match.form.replace(/\s+/g, ""))
    if (at >= 0 && /^[(（]/.test(rawCompact.slice(at + match.form.replace(/\s+/g, "").length))) return { target: true, reason: null }
    return { target: false, reason: "modifier" }
  }
  return { target: true, reason: null }
}
