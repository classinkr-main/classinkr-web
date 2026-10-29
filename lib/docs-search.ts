import type { DocArticle, DocArticleDocType } from "@/lib/docs"
import { getDocListKind, type DocListKind } from "@/lib/docs-list-meta"

/**
 * 가이드 검색 — 질의 정규화·동의어·점수.
 *
 * 고객이 실제로 치는 말("로그인 안돼요", "비밀번호변경", "녹화본 어디서 봐요")로도 맞는 문서가 위에 오게 한다.
 * - 띄어쓰기는 무시하고 비교한다(공백을 뺀 문자열끼리 포함 여부를 본다).
 * - 조사·어미를 떼고, 근거가 있는 동의어만 작은 표로 둔다.
 * - 점수는 제목 > 섹션 제목 > 키워드·태그 > 설명 > 본문 순으로 준다.
 * - 증상형 질의("~가 안 돼요", "끊겨요")면 문제 해결 문서를 위로 올린다.
 *
 * 모든 값은 DocArticle 필드에서 계산한다 — 정적 문서와 운영 DB 문서가 같은 결과를 내야 한다.
 */

// ---------------------------------------------------------------------------
// 색인

export interface DocsSearchIndexSection {
  /** 문서 페이지의 앵커 id(`section-N`) — toArticleSections 와 같은 규칙. */
  id: string
  heading: string
  text: string
}

export interface DocsSearchIndex {
  docType?: DocArticleDocType
  kind: DocListKind
  /** tags + keywords */
  keywords: string[]
  sections: DocsSearchIndexSection[]
  /** 대상 독자, 챗봇 요약, 첨부 자료 이름 */
  extra: string
}

/** 검색 대상의 최소 모양 — DocsArticleSummary 가 그대로 들어온다. */
export interface DocsSearchable {
  title: string
  description: string
  category?: string
  tags?: string[]
  searchText?: string
  searchIndex?: DocsSearchIndex
}

export function buildDocsSearchIndex(doc: DocArticle): DocsSearchIndex {
  return {
    docType: doc.docType,
    kind: getDocListKind(doc),
    keywords: [...doc.tags, ...doc.keywords],
    sections: doc.sections.map((section, index) => ({
      id: `section-${index + 1}`,
      heading: section.heading,
      text: [
        section.body,
        ...(section.steps ?? []),
        ...(section.media?.flatMap((media) => [media.alt, media.caption ?? ""]) ?? []),
      ].join(" "),
    })),
    extra: [
      doc.audience,
      doc.chatbotSummary,
      ...(doc.resources?.flatMap((resource) => [resource.label, resource.description ?? ""]) ?? []),
    ].join(" "),
  }
}

// ---------------------------------------------------------------------------
// 정규화

/** 소문자·NFC, 글자·숫자·`+`(국가번호 +82) 밖은 공백 하나로. */
export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}+]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function compact(value: string) {
  return value.replace(/\s+/g, "")
}

const HANGUL_SYLLABLE = /[가-힣]/
const ASCII_WORD = /^[a-z0-9+]+$/

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * 동의어 묶음. 근거:
 * - 비번·로긴·인증번호·튕김·이디비: 실제 문서 keywords(lib/docs.ts·문제 해결 문서)에 고객 표현으로 들어 있다.
 * - 녹화본/다시보기/리플레이: 채널톡 원인 분류(lib/channel-talk-root-causes.ts)의 증상 패턴.
 * - 숙제/과제, 전자칠판/보드/IFP, 캠/카메라, 마이크/소리/음성: 상담과 문서에서 같은 뜻으로 섞어 쓴다.
 * - 학생 초대/추가/등록: 같은 일을 교사 문서는 "구성원 초대", 관리자 문서는 "학생 추가·일괄 등록"이라 부른다.
 * 묶음 안의 다른 말로 맞으면 원래 말보다 낮게(ALT_WEIGHT) 친다.
 */
const SYNONYM_GROUPS: readonly (readonly string[])[] = [
  ["로그인", "로긴", "login"],
  ["비밀번호", "비번", "패스워드", "password"],
  ["녹화본", "녹화 영상", "녹화 파일", "녹화된 영상"],
  ["다시보기", "다시 보기", "재생", "리플레이", "replay", "플레이백", "playback"],
  ["숙제", "과제", "homework"],
  ["전자칠판", "보드", "board", "ifp"],
  ["카메라", "캠", "웹캠", "camera"],
  ["마이크", "소리", "음성", "목소리", "mic"],
  ["인증코드", "인증번호", "인증 문자"],
  ["휴대폰", "핸드폰", "스마트폰"],
  ["끊김", "끊겨", "끊기", "끊길", "튕김", "튕겨", "튕기", "튕길"],
  ["선생님", "강사", "교사"],
  ["초대", "추가", "등록"],
  ["입장", "들어가"],
  ["edb", "이디비"],
  ["맥", "mac", "macos", "맥북"],
  ["윈도우", "윈도", "windows"],
]

/** 짧아서 다른 낱말 속에 잘 숨는 말 — 낱말 첫머리에서만 맞춘다(대시보드·키보드의 "보드" 제외). */
const WORD_START_FORMS = new Set(["보드", "캠", "맥"])

/** 증상 표지 — 질의에 있으면 문제 해결 문서를 올리고, 문서 쪽 "안 될 때" 같은 표현과 맞춘다. */
const SYMPTOM_FORMS = ["안됨", "안돼", "안되", "안될", "안됐", "오류", "에러", "실패"]
const SYMPTOM_TOKEN = /^(?:안(?:돼|되|됨|될|됐|됩)|오류|에러|error|실패)/
const NOT_TOKEN = /^않/
/**
 * 증상형 질의 판별. 채널톡 원인 분류의 일반 증상 패턴(lib/channel-talk-root-causes.ts general_issue)을 따른다.
 */
const SYMPTOM_HINT =
  /안\s?(?:돼|되|됨|될|됐|됩|보|떠|뜨|뜬|나|와|들|켜|열|올|잡|움|넘|눌|써)|못\s?(?:봐|보|해|하|받|들|찾|가|열)|않|오류|에러|error|실패|끊|튕|멈춰|멈춤|멈추|느려|버벅|(?:^|\s)렉|깨져|깨짐|이상해|이상하|이상한|없어|없대|없음|사라졌|꺼져|꺼짐|먹통/

/** 부정어(안·못)로 시작하지만 증상이 아닌 낱말. */
const NEGATION_NOUN = /^(?:안드로이드|안내|안전|안정|안녕|안경|안쪽|안심|안부|안건|못자리)/

/** 뜻이 없는 말 — 필수 검색어에서 뺀다(질의가 이것뿐이면 그대로 쓴다). */
const STOPWORDS = new Set([
  "어떻게", "어떡해", "어떡하나요", "어떻게해요", "어떻게하나요", "어떻게하면", "방법", "방법은", "법",
  "왜", "좀", "뭐", "뭐예요", "뭔가요", "어디", "어디서", "어디에", "어디있나요", "어딨어요",
  "하는", "하는법", "하기", "해요", "하나요", "해주세요", "알려줘", "알려주세요", "궁금해요", "궁금합니다",
  "문의", "질문", "가능", "가능한가요", "가능해요", "있나요", "있어요", "있는", "때", "할때", "될때", "경우",
  "관련", "그리고", "및", "또는", "제가", "저는", "내가", "저", "우리", "그냥", "계속", "자꾸", "갑자기",
  "너무", "수", "안", "못", "요", "클래스인", "classin",
])

const PARTICLES = [
  "에서는", "에서", "에게", "한테", "으로", "이랑", "까지", "부터", "처럼", "보다", "이나", "하고",
  "은", "는", "이", "가", "을", "를", "에", "의", "도", "만", "로", "와", "과", "랑", "요",
]
const VERB_ENDINGS = [
  "하려면", "하는데", "했는데", "했어요", "하나요", "할까요", "합니다", "하려고", "되나요", "됐어요",
  "하는", "하기", "하고", "해요", "해야", "하면", "하게", "되는", "되면", "돼요", "되요",
  "어요", "아요", "나요", "까요", "네요", "려면", "는데", "세요", "된", "됨",
]
/** "~요"를 떼었을 때 이 글자로 끝나면 동사(보여요·들려요·켜져요)로 보고 선택 검색어로 둔다. */
const VERBISH_LAST = new Set([..."어아여해돼와워져려봐나까네세죠떠"])

function stripSuffix(token: string, suffixes: readonly string[]) {
  for (const suffix of suffixes) {
    if (token.endsWith(suffix) && token.length - suffix.length >= 2) {
      return token.slice(0, -suffix.length)
    }
  }
  return token
}

// ---------------------------------------------------------------------------
// 질의 분석

interface Form {
  /** 공백 없는 비교용 문자열 */
  text: string
  /** 낱말 경계가 필요한 말(영문·짧은 말)만 정규식으로 본다. */
  re?: RegExp
}

interface QueryTerm {
  surface: string
  /** 조사·어미를 뗀 기본형 — 구절 보너스 계산용 */
  base: string
  primary: Form[]
  alt: Form[]
  soft: boolean
}

export interface DocsQueryAnalysis {
  normalized: string
  terms: QueryTerm[]
  requiredCount: number
  /** 필수 검색어 기본형을 이어 붙인 구절("비밀번호변경") */
  phrase: string
  /** "녹화 안 돼요" → 제목의 "녹화가 안 될 때"처럼 낱말 바로 뒤에 증상이 붙은 꼴 */
  symptomPhrases: RegExp[]
  symptom: boolean
}

function makeForm(value: string): Form | null {
  const text = compact(normalizeSearchText(value))
  if (!text) return null

  if (ASCII_WORD.test(text)) {
    // 영문·숫자: 3글자 이하는 낱말 전체, 그보다 길면 낱말 첫머리부터 맞춘다(mic ≠ microsoft).
    const body = [...text].map(escapeRegExp).join("\\s*")
    const tail = text.length <= 3 ? "(?![a-z0-9])" : ""
    return { text, re: new RegExp(`(?:^|[^a-z0-9])${body}${tail}`) }
  }
  if (WORD_START_FORMS.has(text)) {
    return { text, re: new RegExp(`(?:^|[^가-힣])${escapeRegExp(text)}`) }
  }
  return { text }
}

function uniqueForms(values: Iterable<string>, exclude = new Set<string>()): Form[] {
  const seen = new Set(exclude)
  const forms: Form[] = []
  for (const value of values) {
    const form = makeForm(value)
    if (!form || seen.has(form.text)) continue
    seen.add(form.text)
    forms.push(form)
  }
  return forms
}

const SYNONYM_LOOKUP = new Map<string, readonly string[]>()
for (const group of SYNONYM_GROUPS) {
  for (const word of group) SYNONYM_LOOKUP.set(compact(normalizeSearchText(word)), group)
}

function findSynonymGroup(variants: readonly string[]) {
  for (const variant of variants) {
    const group = SYNONYM_LOOKUP.get(variant)
    if (group) return group
  }
  return undefined
}

function tokenVariants(token: string) {
  const particle = stripSuffix(token, PARTICLES)
  const verb = stripSuffix(token, VERB_ENDINGS)
  const both = stripSuffix(particle, VERB_ENDINGS)
  return [...new Set([token, particle, verb, both])]
}

function isStopword(token: string) {
  return STOPWORDS.has(token) || STOPWORDS.has(stripSuffix(token, PARTICLES))
}

/**
 * 낱말 하나를 검색어로 만든다. 뜻 없는 말이면 null.
 * `nextToken` 은 "보이지 않아요"처럼 뒤 낱말이 부정이면 앞 낱말을 선택 검색어로 돌리는 데 쓴다.
 */
function buildTerm(token: string, nextToken?: string): QueryTerm | null {
  if (!token || isStopword(token)) return null

  // 증상 표지(안 돼요·오류): 문서의 "안 될 때"와 맞추되 필수는 아니다.
  if (SYMPTOM_TOKEN.test(token)) {
    return { surface: token, base: token, primary: uniqueForms(SYMPTOM_FORMS), alt: [], soft: true }
  }
  if (NOT_TOKEN.test(token)) {
    return { surface: token, base: token, primary: uniqueForms(["않"]), alt: [], soft: true }
  }

  // 안 보여요 → "안보여요": 문서의 "안 보이거나·안 보일 때"와 앞 두 글자("안보")로,
  // 못 들어가요 → "들어가지지 않을 때"·"입장이 안 될 때"와 부정어를 뗀 말·동의어로 맞춘다.
  if (/^[안못][가-힣]/.test(token) && !NEGATION_NOUN.test(token)) {
    const stem = stripSuffix(token, VERB_ENDINGS)
    const verbVariants = tokenVariants(token.slice(1)).filter((variant) => variant.length >= 2)
    const primary = uniqueForms([token, stem, token.slice(0, 2), ...verbVariants])
    const group = findSynonymGroup(verbVariants)
    return {
      surface: token,
      base: stem,
      primary,
      alt: group ? uniqueForms(group, new Set(primary.map((form) => form.text))) : [],
      soft: true,
    }
  }

  const variants = tokenVariants(token).filter(
    (variant) => variant.length >= 2 || SYNONYM_LOOKUP.has(variant)
  )
  if (variants.length === 0) return null

  const base = variants[variants.length - 1]
  const group = findSynonymGroup(variants)
  const primary = uniqueForms(variants)
  const alt = group ? uniqueForms(group, new Set(primary.map((form) => form.text))) : []

  const withoutYo = token.endsWith("요") && token.length >= 2 ? token.slice(0, -1) : ""
  const verbish = Boolean(withoutYo) && VERBISH_LAST.has(withoutYo.slice(-1))
  const beforeNot = Boolean(nextToken && NOT_TOKEN.test(nextToken) && token.endsWith("지"))
  const soft = !group && (verbish || beforeNot)

  return { surface: token, base, primary, alt, soft }
}

const GLUED_NEGATION =
  /([가-힣]{2,})(?=[안못](?:돼|되|됨|될|됐|보|떠|뜨|나|와|들|켜|열|올|잡|써|해|하|받|찾|가)[가-힣]*(?:\s|$))/g
const MAX_QUERY_LENGTH = 120
const MAX_TERMS = 12

export function analyzeDocsQuery(query: string): DocsQueryAnalysis {
  const normalized = normalizeSearchText(query.slice(0, MAX_QUERY_LENGTH))
  // "로그인안돼요" → "로그인 안돼요": 붙여 쓴 증상 표현을 앞 낱말과 떼어 낸다.
  const separated = normalized.replace(GLUED_NEGATION, "$1 ")
  // "안 돼요"·"못 들어가요" → 부정어를 뒤 낱말에 붙여 한 덩어리로 본다.
  const joined = separated.replace(/(^|\s)([안못])\s+(?=[가-힣])/g, "$1$2")
  const tokens = joined.split(" ").filter(Boolean).slice(0, MAX_TERMS)

  let terms = tokens
    .map((token, index) => buildTerm(token, tokens[index + 1]))
    .filter((term): term is QueryTerm => term !== null)

  // 뜻 없는 말만 친 경우("클래스인") — 그대로 검색한다.
  if (terms.length === 0 && tokens.length > 0) {
    terms = tokens.map((token) => ({
      surface: token,
      base: token,
      primary: uniqueForms([token]),
      alt: [],
      soft: false,
    }))
  }

  // 선택 검색어뿐이면("안돼요", "오류") 모두 필수로 올린다.
  if (terms.length > 0 && terms.every((term) => term.soft)) {
    terms = terms.map((term) => ({ ...term, soft: false }))
  }

  const required = terms.filter((term) => !term.soft)

  return {
    normalized,
    terms,
    requiredCount: required.length,
    phrase: compact(required.map((term) => term.base).join("")),
    symptomPhrases: buildSymptomPhrases(terms),
    symptom: SYMPTOM_HINT.test(normalized),
  }
}

const PHRASE_PARTICLE = "(?:이|가|은|는|을|를|도|에서|이랑)?"

/** 필수 낱말 바로 뒤에 증상(선택 검색어)이 오는 쌍을 정규식으로 만든다. */
function buildSymptomPhrases(terms: readonly QueryTerm[]) {
  const phrases: RegExp[] = []
  for (let index = 0; index < terms.length - 1; index += 1) {
    const subject = terms[index]
    const predicate = terms[index + 1]
    if (subject.soft || !predicate.soft) continue

    const subjectForms = [...subject.primary, ...subject.alt].map((form) => escapeRegExp(form.text))
    const predicateForms = predicate.primary
      .map((form) => form.text)
      .filter((text) => /^[안못않]/.test(text))
      .map(escapeRegExp)
    if (subjectForms.length === 0 || predicateForms.length === 0) continue

    phrases.push(
      new RegExp(`(?:${subjectForms.join("|")})${PHRASE_PARTICLE}(?:${predicateForms.join("|")})`)
    )
  }
  return phrases
}

const analysisCache = new Map<string, DocsQueryAnalysis>()

function getAnalysis(query: string) {
  const cached = analysisCache.get(query)
  if (cached) return cached

  const analysis = analyzeDocsQuery(query)
  if (analysisCache.size >= 64) {
    const oldest = analysisCache.keys().next().value
    if (oldest !== undefined) analysisCache.delete(oldest)
  }
  analysisCache.set(query, analysis)
  return analysis
}

// ---------------------------------------------------------------------------
// 문서 준비

interface Field {
  norm: string
  compact: string
}

interface PreparedSection {
  id: string
  title: string
  heading: Field
  text: Field
}

interface PreparedDoc {
  title: Field
  description: Field
  category: Field
  keywords: Field[]
  sections: PreparedSection[]
  body: Field
  kind?: DocListKind
}

function toField(value: string): Field {
  const norm = normalizeSearchText(value)
  return { norm, compact: compact(norm) }
}

const preparedCache = new WeakMap<DocsSearchable, PreparedDoc>()

function prepare(doc: DocsSearchable): PreparedDoc {
  const cached = preparedCache.get(doc)
  if (cached) return cached

  const index = doc.searchIndex
  const prepared: PreparedDoc = index
    ? {
        title: toField(doc.title),
        description: toField(doc.description),
        category: toField(doc.category ?? ""),
        keywords: index.keywords.map(toField),
        sections: index.sections.map((section) => ({
          id: section.id,
          title: section.heading,
          heading: toField(section.heading),
          text: toField(section.text),
        })),
        body: toField([...index.sections.map((section) => section.text), index.extra].join(" ")),
        kind: index.kind,
      }
    : {
        // 색인이 없는 요약(외부에서 만든 목록)은 예전처럼 searchText 전체를 본문으로 본다.
        title: toField(doc.title),
        description: toField(doc.description),
        category: toField(doc.category ?? ""),
        keywords: (doc.tags ?? []).map(toField),
        sections: [],
        body: toField(doc.searchText ?? ""),
      }

  preparedCache.set(doc, prepared)
  return prepared
}

// ---------------------------------------------------------------------------
// 점수

const WEIGHT = {
  title: 100,
  heading: 60,
  keyword: 40,
  description: 25,
  category: 10,
  body: 8,
} as const
const ALT_WEIGHT = 0.7
const SOFT_WEIGHT = 0.35
/** 여러 낱말이 다 맞으면 더한다 — 본문에만 스친 문서가 덕 보지 않게 그 문서 점수만큼까지만. */
const ALL_TERMS_BONUS = 300
const PHRASE_BONUS = { exactTitle: 150, title: 150, heading: 80, keyword: 60 } as const
const SYMPTOM_PHRASE_BONUS = { title: 120, heading: 60 } as const
/** 증상형 질의에서 문제 해결 문서에 곱한다. 맞은 정도에 비례해야 약하게 걸린 문서가 튀지 않는다. */
const SYMPTOM_BOOST = 1.6
/** 결과 화면에서는 1위 점수의 이 비율보다 낮은(본문에만 스친) 문서를 뺀다. */
const MIN_RELATIVE_SCORE = 0.08

function formMatches(field: Field, form: Form) {
  return form.re ? form.re.test(field.norm) : field.compact.includes(form.text)
}

/** 1 = 원래 말, ALT_WEIGHT = 동의어, 0 = 없음 */
function matchLevel(field: Field, term: QueryTerm) {
  if (!field.compact) return 0
  if (term.primary.some((form) => formMatches(field, form))) return 1
  if (term.alt.some((form) => formMatches(field, form))) return ALT_WEIGHT
  return 0
}

function bestLevel(fields: readonly Field[], term: QueryTerm) {
  let best = 0
  for (const field of fields) {
    const level = matchLevel(field, term)
    if (level > best) best = level
    if (best === 1) break
  }
  return best
}

function scoreTerm(doc: PreparedDoc, term: QueryTerm) {
  const score =
    WEIGHT.title * matchLevel(doc.title, term) +
    WEIGHT.heading * bestLevel(doc.sections.map((section) => section.heading), term) +
    WEIGHT.keyword * bestLevel(doc.keywords, term) +
    WEIGHT.description * matchLevel(doc.description, term) +
    WEIGHT.category * matchLevel(doc.category, term) +
    WEIGHT.body * matchLevel(doc.body, term)
  return score
}

interface TermResult {
  score: number
  /** 이 문서에서 실제로 맞은 검색어(붙여 쓴 말을 나눠 맞췄으면 나눈 조각들) */
  matchedTerms: QueryTerm[]
}

/**
 * 붙여 쓴 말("비밀번호변경", "학생초대")이 통째로는 없을 때 두 조각으로 나눠 둘 다 있는지 본다.
 * 조각마다 다시 조사·동의어를 적용하고, 한 번 더 나눌 수 있다(세 조각까지).
 */
function scoreSplit(doc: PreparedDoc, surface: string, depth: number): TermResult | null {
  if (depth > 2 || surface.length < 4 || surface.length > 16 || !HANGUL_SYLLABLE.test(surface)) {
    return null
  }

  let best: TermResult | null = null
  for (let cut = 2; cut <= surface.length - 2; cut += 1) {
    const parts = [surface.slice(0, cut), surface.slice(cut)]
    let total = 0
    const matched: QueryTerm[] = []
    let ok = true

    for (const part of parts) {
      const term = buildTerm(part)
      if (!term) continue
      const direct = scoreTerm(doc, term)
      if (direct > 0) {
        total += direct
        matched.push(term)
        continue
      }
      const nested = scoreSplit(doc, part, depth + 1)
      if (!nested) {
        ok = false
        break
      }
      total += nested.score
      matched.push(...nested.matchedTerms)
    }

    if (!ok || matched.length === 0) continue
    const score = (total / parts.length) * 0.9
    if (!best || score > best.score) best = { score, matchedTerms: matched }
  }
  return best
}

export interface DocsSearchSectionMatch {
  id: string
  title: string
}

export interface DocsSearchEvaluation {
  score: number
  sections: DocsSearchSectionMatch[]
  /** SearchHighlight 에 그대로 넘기는 강조어(공백 구분) */
  highlight: string
}

const EMPTY_EVALUATION: DocsSearchEvaluation = { score: 0, sections: [], highlight: "" }

function evaluate(
  doc: DocsSearchable,
  analysis: DocsQueryAnalysis,
  withDetails: boolean,
  sectionLimit = 2
): DocsSearchEvaluation {
  if (analysis.terms.length === 0) return EMPTY_EVALUATION

  const prepared = prepare(doc)
  let requiredScore = 0
  let softScore = 0
  let matchedRequired = 0
  const effective: QueryTerm[] = []

  for (const term of analysis.terms) {
    let result: TermResult | null = null
    const direct = scoreTerm(prepared, term)
    if (direct > 0) {
      result = { score: direct, matchedTerms: [term] }
    } else if (!term.soft && term.alt.length === 0) {
      result = scoreSplit(prepared, term.surface, 1)
    }

    if (!result) continue
    if (term.soft) {
      softScore += result.score * SOFT_WEIGHT
    } else {
      requiredScore += result.score
      matchedRequired += 1
    }
    effective.push(...result.matchedTerms.map((matched) => ({ ...matched, soft: term.soft })))
  }

  const required = analysis.requiredCount
  if (matchedRequired === 0) return EMPTY_EVALUATION

  // 여러 낱말 중 절반도 안 맞으면 뺀다. 다 맞으면 확실히 위로 올린다.
  const coverage = matchedRequired / required
  if (coverage < 0.5) return EMPTY_EVALUATION
  // "안 돼요" 같은 선택 검색어는 필수 검색어가 맞은 만큼까지만 보탠다.
  let total = (requiredScore + Math.min(softScore, requiredScore)) * coverage
  if (required > 1 && coverage === 1) total += Math.min(ALL_TERMS_BONUS, total)

  const phrase = analysis.phrase
  if (phrase.length >= 2) {
    if (prepared.title.compact === phrase) total += PHRASE_BONUS.exactTitle
    if (prepared.title.compact.includes(phrase)) total += PHRASE_BONUS.title
    if (prepared.sections.some((section) => section.heading.compact.includes(phrase))) {
      total += PHRASE_BONUS.heading
    }
    if (prepared.keywords.some((keyword) => keyword.compact.includes(phrase))) {
      total += PHRASE_BONUS.keyword
    }
  }

  for (const pattern of analysis.symptomPhrases) {
    if (pattern.test(prepared.title.compact)) {
      total += SYMPTOM_PHRASE_BONUS.title
    } else if (prepared.sections.some((section) => pattern.test(section.heading.compact))) {
      total += SYMPTOM_PHRASE_BONUS.heading
    }
  }

  if (analysis.symptom && prepared.kind === "troubleshooting") total *= SYMPTOM_BOOST

  const score = Math.round(total)
  if (!withDetails) return { score, sections: [], highlight: "" }

  return {
    score,
    sections: matchSections(prepared, effective, sectionLimit),
    highlight: buildHighlight([doc.title, doc.description], effective),
  }
}

/** 결과 아래 "이 부분에 있어요"로 보여 줄 섹션 — 섹션 제목에 맞은 것을 먼저, 본문만 맞은 것은 모든 필수어가 있을 때만. */
function matchSections(doc: PreparedDoc, terms: readonly QueryTerm[], limit: number) {
  const required = terms.filter((term) => !term.soft)
  if (required.length === 0 || limit <= 0) return []

  const scored: Array<{ section: PreparedSection; score: number; index: number }> = []
  doc.sections.forEach((section, index) => {
    let headingScore = 0
    let textScore = 0
    let requiredInHeading = false
    let requiredEverywhere = true

    for (const term of terms) {
      const weight = term.soft ? SOFT_WEIGHT : 1
      const inHeading = matchLevel(section.heading, term)
      const inText = matchLevel(section.text, term)
      headingScore += inHeading * weight
      textScore += inText * weight
      if (!term.soft) {
        if (inHeading > 0) requiredInHeading = true
        if (inHeading === 0 && inText === 0) requiredEverywhere = false
      }
    }

    if (!requiredInHeading && !requiredEverywhere) return
    scored.push({ section, score: headingScore * 3 + textScore, index })
  })

  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ section }) => ({ id: section.id, title: section.title }))
}

/** 제목·설명에서 실제로 맞은 글자를 찾아 강조어로 돌려준다. 붙여 쓴 질의도 원문 띄어쓰기대로 강조된다. */
function buildHighlight(texts: readonly string[], terms: readonly QueryTerm[]) {
  const pieces = new Set<string>()

  for (const term of terms) {
    for (const form of [...term.primary, ...term.alt]) {
      const chars = [...form.text].map(escapeRegExp).join("\\s*")
      const head = form.re ? (ASCII_WORD.test(form.text) ? "(?<![a-z0-9])" : "(?<![가-힣])") : ""
      const pattern = new RegExp(`${head}${chars}`, "giu")
      for (const text of texts) {
        for (const match of text.normalize("NFC").matchAll(pattern)) {
          // 한 글자 조각("안 될"의 "안")은 엉뚱한 곳까지 칠해서 뺀다. 한 글자 동의어(맥·캠)만 예외.
          const whole = match[0]
          if (form.re && whole === form.text) pieces.add(whole.toLowerCase())
          for (const piece of whole.split(/\s+/)) {
            if (piece.length >= 2) pieces.add(piece.toLowerCase())
          }
        }
      }
    }
  }

  return [...pieces].join(" ")
}

// ---------------------------------------------------------------------------
// 공개 함수

/** 문서 하나의 점수(0이면 결과에서 뺀다). 홈·주제 페이지가 scoreDocsArticle 로 부른다. */
export function scoreDocsSearch(doc: DocsSearchable, query: string): number {
  return evaluate(doc, getAnalysis(query), false).score
}

export interface DocsSearchResult<T extends DocsSearchable> extends DocsSearchEvaluation {
  doc: T
}

/**
 * 점수순 결과 — 같은 점수면 원래 목록 순서를 지킨다.
 * 1위보다 훨씬 약한(본문에만 스친) 문서는 뺀다. 홈·주제 페이지도 이 함수를 쓰면 같은 결과가 나온다.
 */
export function searchDocs<T extends DocsSearchable>(
  docs: readonly T[],
  query: string,
  options: { sectionLimit?: number } = {}
): DocsSearchResult<T>[] {
  const analysis = getAnalysis(query)
  if (analysis.terms.length === 0) return []

  const scored = docs
    .map((doc, index) => ({ doc, index, ...evaluate(doc, analysis, true, options.sectionLimit) }))
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
  const minScore = (scored[0]?.score ?? 0) * MIN_RELATIVE_SCORE

  return scored
    .filter((result) => result.score >= minScore)
    .map(({ doc, score, sections, highlight }) => ({ doc, score, sections, highlight }))
}

/** 결과가 없을 때와 빈 검색 화면에 보여 줄 자주 찾는 주제(상담 상위 주제 순). */
export const DOCS_POPULAR_SEARCHES = [
  "로그인이 안 될 때",
  "비밀번호 변경",
  "PC 설치",
  "수업 녹화",
  "다시보기",
  "EDB",
  "학생 추가",
  "숙제 제출",
] as const

// ---------------------------------------------------------------------------
// 비슷한 검색어 제안

const CHOSEONG = [..."ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"]
const JUNGSEONG = [..."ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ"]
const JONGSEONG = ["", ..."ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"]

function toJamo(value: string) {
  let out = ""
  for (const char of value) {
    const code = char.charCodeAt(0) - 0xac00
    if (code < 0 || code > 11171) {
      out += char
      continue
    }
    out += CHOSEONG[Math.floor(code / 588)] + JUNGSEONG[Math.floor((code % 588) / 28)] + JONGSEONG[code % 28]
  }
  return out
}

function bigrams(value: string) {
  const chars = [...value]
  if (chars.length < 2) return chars
  const grams: string[] = []
  for (let index = 0; index < chars.length - 1; index += 1) grams.push(chars[index] + chars[index + 1])
  return grams
}

/** 자모 단위 2-gram 다이스 계수 — "녹회"와 "녹화"처럼 한 글자 오타도 가깝게 본다. */
function jamoSimilarity(a: string, b: string) {
  const left = bigrams(toJamo(a))
  const right = bigrams(toJamo(b))
  if (left.length === 0 || right.length === 0) return 0

  const counts = new Map<string, number>()
  for (const gram of left) counts.set(gram, (counts.get(gram) ?? 0) + 1)
  let shared = 0
  for (const gram of right) {
    const count = counts.get(gram) ?? 0
    if (count > 0) {
      shared += 1
      counts.set(gram, count - 1)
    }
  }
  return (2 * shared) / (left.length + right.length)
}

// 두벌식 자판: 한/영 전환을 잊고 친 "fhrmdls" → "로그인"
const QWERTY_JAMO: Record<string, string> = {
  q: "ㅂ", w: "ㅈ", e: "ㄷ", r: "ㄱ", t: "ㅅ", y: "ㅛ", u: "ㅕ", i: "ㅑ", o: "ㅐ", p: "ㅔ",
  a: "ㅁ", s: "ㄴ", d: "ㅇ", f: "ㄹ", g: "ㅎ", h: "ㅗ", j: "ㅓ", k: "ㅏ", l: "ㅣ",
  z: "ㅋ", x: "ㅌ", c: "ㅊ", v: "ㅍ", b: "ㅠ", n: "ㅜ", m: "ㅡ",
  Q: "ㅃ", W: "ㅉ", E: "ㄸ", R: "ㄲ", T: "ㅆ", O: "ㅒ", P: "ㅖ",
}
const COMPOUND_VOWEL: Record<string, string> = {
  ㅗㅏ: "ㅘ", ㅗㅐ: "ㅙ", ㅗㅣ: "ㅚ", ㅜㅓ: "ㅝ", ㅜㅔ: "ㅞ", ㅜㅣ: "ㅟ", ㅡㅣ: "ㅢ",
}
const COMPOUND_FINAL: Record<string, string> = {
  ㄱㅅ: "ㄳ", ㄴㅈ: "ㄵ", ㄴㅎ: "ㄶ", ㄹㄱ: "ㄺ", ㄹㅁ: "ㄻ", ㄹㅂ: "ㄼ", ㄹㅅ: "ㄽ", ㄹㅌ: "ㄾ",
  ㄹㅍ: "ㄿ", ㄹㅎ: "ㅀ", ㅂㅅ: "ㅄ",
}
const SPLIT_FINAL = Object.fromEntries(
  Object.entries(COMPOUND_FINAL).map(([pair, final]) => [final, [...pair] as [string, string]])
)

/** 영문 자판으로 친 한글을 되살린다. 영문이 아니거나 한글이 안 나오면 "". */
export function convertQwertyToHangul(value: string): string {
  if (!/^[A-Za-z\s]+$/.test(value) || !value.trim()) return ""

  let out = ""
  let cho = ""
  let jung = ""
  let jong = ""

  const flush = () => {
    if (cho && jung) {
      out += String.fromCharCode(
        0xac00 + CHOSEONG.indexOf(cho) * 588 + JUNGSEONG.indexOf(jung) * 28 + JONGSEONG.indexOf(jong)
      )
    } else {
      out += cho + jung
    }
    cho = ""
    jung = ""
    jong = ""
  }

  for (const char of value) {
    const jamo = QWERTY_JAMO[char] ?? QWERTY_JAMO[char.toLowerCase()]
    if (!jamo) {
      flush()
      out += char
      continue
    }

    if (JUNGSEONG.includes(jamo)) {
      if (cho && jung && jong) {
        // 받침이 다음 글자의 첫소리로 넘어간다(닭이 → 달기 처럼 겹받침은 뒤 자음만).
        const split = SPLIT_FINAL[jong]
        const nextCho = split ? split[1] : jong
        jong = split ? split[0] : ""
        flush()
        cho = nextCho
        jung = jamo
      } else if (jung && !jong && COMPOUND_VOWEL[jung + jamo]) {
        jung = COMPOUND_VOWEL[jung + jamo]
      } else if (cho && !jung) {
        jung = jamo
      } else {
        flush()
        jung = jamo
      }
      continue
    }

    // 자음
    if (cho && jung && !jong && JONGSEONG.includes(jamo)) {
      jong = jamo
    } else if (cho && jung && jong && COMPOUND_FINAL[jong + jamo]) {
      jong = COMPOUND_FINAL[jong + jamo]
    } else {
      flush()
      cho = jamo
    }
  }
  flush()

  return HANGUL_SYLLABLE.test(out) ? out.replace(/\s+/g, " ").trim() : ""
}

/**
 * 결과가 0건일 때 보여 줄 비슷한 검색어. 결과가 실제로 나오는 말만 돌려준다.
 * 1) 한/영 전환을 잊고 친 말 2) 문서 키워드·태그 중 자모가 가장 비슷한 말.
 */
export function suggestDocsQueries(
  query: string,
  docs: readonly DocsSearchable[],
  limit = 4
): string[] {
  const suggestions: string[] = []
  const seen = new Set<string>([compact(normalizeSearchText(query))])
  const push = (candidate: string) => {
    const key = compact(normalizeSearchText(candidate))
    if (!key || seen.has(key) || suggestions.length >= limit) return
    if (searchDocs(docs, candidate, { sectionLimit: 0 }).length === 0) return
    seen.add(key)
    suggestions.push(candidate)
  }

  const converted = convertQwertyToHangul(query.trim())
  if (converted) push(converted)

  const target = compact(normalizeSearchText(query))
  if (!target) return suggestions

  const candidates = new Map<string, string>()
  for (const doc of docs) {
    for (const keyword of doc.searchIndex?.keywords ?? doc.tags ?? []) {
      const label = keyword.trim()
      const key = compact(normalizeSearchText(label))
      if (key.length < 2 || key.length > 14 || candidates.has(key)) continue
      if (!HANGUL_SYLLABLE.test(key) && !/^[a-z]{3,}$/.test(key)) continue
      candidates.set(key, label)
    }
  }

  const ranked = [...candidates.entries()]
    .map(([key, label]) => ({ label, key, similarity: jamoSimilarity(target, key) }))
    .filter((item) => item.similarity >= 0.45)
    .sort((a, b) => b.similarity - a.similarity || a.key.length - b.key.length)

  for (const item of ranked) {
    if (suggestions.length >= limit) break
    push(item.label)
  }
  return suggestions
}
