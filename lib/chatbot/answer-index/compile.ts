/**
 * 답 색인 컴파일(사양 §3.3 ③, §3.4, §3.10). 같은 자료면 같은 색인(같은 answerIndexHash)이 나온다.
 *
 * 특징(§3.3 ③): 공백을 지운 색인 글의 글자 2~4-gram(1글자 글은 1-gram), 낱말 1-gram(가벼운 조사 떼기),
 * 개념 표지 c:<id>(맞은 개념 + 상위 개념, 가중 2.0). TF 는 1+ln(tf), IDF 는 ln((N+1)/(df+1))+1, L2 정규화.
 * IDF 말뭉치(N) = 변형 + 우주 + 카드 글(topic·anchors·covers·답 문장).
 *
 * 만드는 것
 * - 변형·우주·반례 역색인(특징 → 문서 번호·tf). 가중치는 질의 때 idf×tf가중×(1/문서 노름)으로 다시 계산해 메모리를 줄인다.
 * - 카드 중심 벡터(변형 평균 + topic·anchors 벡터) 역색인, 카드 덮임 낱말 목록(변형·카드 글·카드 개념 형태의 특징).
 * - 절 본문 전체(지금 문서 단위)의 BM25F 색인: 글자 2-gram + 개념 표지(×2), 본문 1.0·절 제목/문서 제목 0.35.
 * - 개념 사전·없는 개념 맞추기, 뜻 없는 낱말 목록, 보정 값(없으면 기본값).
 *
 * 글자 n-gram 은 문자열 대신 숫자 열쇠로 둔다: 글자마다 1~8191 번호를 주고 n 글자를 13비트씩 이어 붙인다(4-gram 도 2^53 안).
 * 문서·사전에만 나오는 n-gram 은 특징이 아니라 '아는 글자열'(값 -1)로만 둔다(말뭉치 밖 낱말 세기용).
 */
import { createHash } from "node:crypto"
import { NumberMap } from "./number-map"
import type { LoadedAnswerIndexData } from "./load"
import {
  compactWithBoundaries,
  compileAbsent,
  compileLexicon,
  compactForm,
  matchAbsent,
  matchConcepts,
  type AbsentMatch,
  type CompiledAbsent,
  type CompiledLexicon,
  type ConceptMatch,
} from "./lexicon"
import {
  compactOf,
  glossForIndex,
  INDEX_SYMPTOM_RE,
  isTailOnly,
  normalizeText,
  prepareText,
  stripBrand,
  stripQuestionTail,
  wordsOf,
  type PreparedText,
} from "./normalize"
import {
  ANSWER_INDEX_FEATURES,
  type AnswerCard,
  type AnswerCardKind,
  type AnswerIndexUnit,
  type AskType,
  type CalibrationFile,
  type GenericWordsFile,
  type LegacyAliasFile,
  type ScoreComponent,
} from "./types"

/**
 * 계산 규칙을 바꾸면 올린다(답 캐시 열쇠 ANSWER_INDEX_VERSION 에 들어간다).
 * 2: 확신도 특징 knnCount1, 조각 답 문턱 여유(SEGMENT_CONF_MARGIN), 정해 둔 답 승격(진단 R02·R15·R07).
 * 3: 허브·공백 양보(score.ts), 조각 덮임 점검과 다시 고르기(decide.ts), 렌더 표기·요체·복합 머리(respond.ts·shape.ts)(R3).
 */
export const ANSWER_INDEX_COMPILER_VERSION = 3

/** 카드 중심 벡터는 가중치가 큰 특징만 남기고 다시 정규화한다(메모리 §3.10). */
export const CENTROID_MAX_FEATURES = 256

// ─── 보정 기본값(calibration.json 이 없을 때) ───────────────────────────

/** §3.4 초기 가중. */
export const DEFAULT_WEIGHTS: Record<ScoreComponent, number> = { maxcos: 0.3, centroid: 0.7, knnShare: 0.5, vote: 0.15, bm25f: 0.1, linear: 0 }
/** §4.2 calibration.json 예시 문턱. */
export const DEFAULT_THRESHOLDS: Record<AnswerCardKind, number> = { doc: 0.55, howto: 0.55, fixed: 0.55, policy: 0.6, gap: 0.5, handoff: 0.6 }
/**
 * 보정 전 확신도 계수(ANSWER_INDEX_FEATURES 순서). I9 calibrate.ts 가 보정 묶음으로 맞추기 전까지 쓰는 보수적인 값이다:
 * 1위 합성 점수·1위와 2위 차이·최고 변형 코사인·덮임이 높을수록, 설명 안 된 개념·말뭉치 밖 낱말·반례 근접·없는 개념이 있을수록 낮다.
 */
export const DEFAULT_CONFIDENCE = {
  // 마지막 knnCount1 은 0: 보정 전 기본값의 판정을 바꾸지 않는다(보정이 맞춘다).
  w: [4, 3, 2, 0, 0, 0, 1.5, -0.6, -0.5, -2, -1.5, 0, 0.5, 0],
  b: -6.5,
}

export interface ResolvedCalibration {
  version: string
  dataVersion: string | null
  weights: Record<ScoreComponent, number>
  confidence: Record<AnswerCardKind, { w: number[]; b: number }>
  thresholds: Record<AnswerCardKind, number>
  /** calibration.json 이 있었는지. */
  fitted: boolean
}

const KINDS: AnswerCardKind[] = ["doc", "howto", "fixed", "policy", "gap", "handoff"]

/**
 * calibration.json → 쓸 보정 값. 빠지거나 잘못된 칸은 기본값이다.
 * 확신도 계수 w 의 길이가 특징 수(ANSWER_INDEX_FEATURES)와 다르면(특징을 더하기 전 파일 등) 그 종류는 기본 계수로 돌아가고
 * 한 번 경고한다(warn, 기본 console.warn). 계수를 자리만 맞춰 옮기지 않는다: 특징 뜻이 바뀌었을 수 있다. calibrate.ts 로 다시 맞춘다.
 */
export function resolveCalibration(file: CalibrationFile | null, warn: (message: string) => void = console.warn): ResolvedCalibration {
  const weights = { ...DEFAULT_WEIGHTS }
  for (const key of Object.keys(weights) as ScoreComponent[]) {
    const value = file?.weights?.[key]
    if (typeof value === "number" && Number.isFinite(value)) weights[key] = value
  }
  const confidence = {} as ResolvedCalibration["confidence"]
  const thresholds = { ...DEFAULT_THRESHOLDS }
  const lengthMismatch: string[] = []
  for (const kind of KINDS) {
    const fitted = file?.confidence?.[kind]
    if (fitted && Array.isArray(fitted.w) && fitted.w.length !== ANSWER_INDEX_FEATURES.length) lengthMismatch.push(`${kind}:${fitted.w.length}`)
    confidence[kind] =
      fitted && Array.isArray(fitted.w) && fitted.w.length === ANSWER_INDEX_FEATURES.length && fitted.w.every(Number.isFinite) && Number.isFinite(fitted.b)
        ? { w: [...fitted.w], b: fitted.b }
        : { w: [...DEFAULT_CONFIDENCE.w], b: DEFAULT_CONFIDENCE.b }
    const threshold = file?.thresholds?.[kind]
    if (typeof threshold === "number" && Number.isFinite(threshold)) thresholds[kind] = threshold
  }
  if (lengthMismatch.length > 0) {
    warn(
      `[chatbot] answer-index calibration feature count mismatch ${JSON.stringify({
        version: file?.version ?? null,
        expected: ANSWER_INDEX_FEATURES.length,
        kinds: lengthMismatch,
        fallback: "DEFAULT_CONFIDENCE",
      })}`
    )
  }
  return { version: file?.version ?? "default", dataVersion: file?.dataVersion ?? null, weights, confidence, thresholds, fitted: Boolean(file) }
}

// ─── 모델 선택 층 설정(calibration.json assist, 사양 §10) ─────────────────

/** calibration.json assist 의 기본 대역(scripts/answer-index/lib/calibrate-core.ts DEFAULT_ASSIST 와 같다). */
export const DEFAULT_ASSIST_BAND: readonly [number, number] = [0.45, 0.62]

export interface ResolvedAssistCalibration {
  /** 대역(band) 모드를 켜도 되는지. assist-check 로 순이득을 확인한 뒤에만 true 로 둔다(§10). */
  enabled: boolean
  /** [θ_lo, θ_hi]: 결정형 확신도가 θ_lo 이상 θ_hi 미만이면 band 모드가 모델에 묻는다. */
  band: [number, number]
}

/**
 * calibration.json assist → 쓸 값. 파일·칸이 없으면 꺼짐. 대역이 0 ≤ θ_lo ≤ θ_hi ≤ 1 이 아니면 꺼짐으로 본다(잘못된 대역으로 모델을
 * 부르지 않는다). 확신도 계산과 무관해 색인 해시(answerIndexHash)에는 넣지 않는다(판은 calibration.json 내용이 든 dataVersion 이 가른다).
 */
export function resolveAssistCalibration(file: CalibrationFile | null): ResolvedAssistCalibration {
  const raw = file?.assist
  const band = Array.isArray(raw?.band) && raw.band.length === 2 ? [Number(raw.band[0]), Number(raw.band[1])] : null
  const validBand = band !== null && band.every(Number.isFinite) && 0 <= band[0] && band[0] <= band[1] && band[1] <= 1
  return {
    enabled: raw?.enabled === true && validBand,
    band: validBand ? [band[0], band[1]] : [DEFAULT_ASSIST_BAND[0], DEFAULT_ASSIST_BAND[1]],
  }
}

// ─── 뜻 없는 낱말 ────────────────────────────────────────────────────────

/** generic-words.json 이 없어도 쓰는 기본 낱말(지시어·묻는 말·증상 일반어·부사). */
export const BUILTIN_GENERIC_WORDS = [
  "그거", "이거", "저거", "그게", "이게", "저게", "그건", "이건", "저건", "그것", "이것", "저것", "거기", "여기", "저기", "그럼", "그러면",
  "뭐", "무엇", "어떻게", "어디", "어디서", "언제", "누구", "누가", "왜", "몇", "얼마", "어떤", "무슨",
  "안", "못", "에러", "오류", "문제", "이상", "이상해", "고장", "자꾸", "계속", "갑자기", "지금", "또", "다시", "좀", "너무", "진짜", "정말",
  "혹시", "그냥", "제발", "빨리", "급해", "급해요", "도와", "도와주세요", "안녕", "안녕하세요", "감사", "감사합니다",
  "하다", "되다", "있다", "없다", "보다", "쓰다", "받다", "하는", "되는", "해", "돼", "되", "하", "있", "없", "나", "저", "제", "우리",
]

function buildGenericSet(file: GenericWordsFile | null) {
  const out = new Set<string>()
  const add = (word: string) => {
    const key = compactForm(word)
    if (key) out.add(key)
  }
  for (const word of BUILTIN_GENERIC_WORDS) add(word)
  if (file) for (const list of [file.function, file.predicate, file.quantity, file.demonstrative]) for (const word of list ?? []) if (typeof word === "string") add(word)
  return out
}

// ─── 글자 n-gram 열쇠 ───────────────────────────────────────────────────

const CHAR_BITS = 13
const CHAR_BASE = 2 ** CHAR_BITS
const MAX_CHAR_ID = CHAR_BASE - 1

class Alphabet {
  readonly ids = new Map<number, number>()
  private next = 1

  /** 글자 번호. add 가 아니면 모르는 글자는 0. 번호가 다 차면 마지막 번호를 같이 쓴다. */
  id(code: number, add: boolean) {
    const known = this.ids.get(code)
    if (known !== undefined) return known
    if (!add) return 0
    const id = this.next <= MAX_CHAR_ID ? this.next++ : MAX_CHAR_ID
    this.ids.set(code, id)
    return id
  }
}

/** compact 글의 2~4-gram 열쇠(모르는 글자가 든 n-gram 은 -1). 1글자 글은 1-gram. */
function gramKeys(compact: string, alphabet: Alphabet, add: boolean, out: number[]) {
  const n = compact.length
  if (n === 0) return out
  const ids = new Array<number>(n)
  for (let i = 0; i < n; i += 1) ids[i] = alphabet.id(compact.charCodeAt(i), add)
  if (n === 1) {
    out.push(ids[0] > 0 ? ids[0] : -1)
    return out
  }
  for (let i = 0; i < n; i += 1) {
    let key = 0
    let unknown = false
    for (let len = 1; len <= 4 && i + len <= n; len += 1) {
      const id = ids[i + len - 1]
      if (id === 0) unknown = true
      key = key * CHAR_BASE + id
      if (len >= 2) out.push(unknown ? -1 : key)
    }
  }
  return out
}

// ─── 특징 사전 ───────────────────────────────────────────────────────────

const FEATURE_GRAM = 0
const FEATURE_WORD = 1
const FEATURE_CONCEPT = 2
const CONCEPT_SCALE = 2
const KNOWN_ONLY = -1

class Vocabulary {
  readonly alphabet = new Alphabet()
  readonly grams = new NumberMap(1 << 16)
  readonly words = new Map<string, number>()
  readonly concepts = new Map<string, number>()
  readonly kinds: number[] = []

  private addFeature(kind: number) {
    this.kinds.push(kind)
    return this.kinds.length - 1
  }

  gram(key: number, add: boolean) {
    const id = this.grams.get(key)
    if (id !== undefined && id !== KNOWN_ONLY) return id
    if (!add) return id === KNOWN_ONLY ? KNOWN_ONLY : undefined
    const created = this.addFeature(FEATURE_GRAM)
    this.grams.set(key, created)
    return created
  }

  word(word: string, add: boolean) {
    const id = this.words.get(word)
    if (id !== undefined || !add) return id
    const created = this.addFeature(FEATURE_WORD)
    this.words.set(word, created)
    return created
  }

  concept(id: string, add: boolean) {
    const known = this.concepts.get(id)
    if (known !== undefined || !add) return known
    const created = this.addFeature(FEATURE_CONCEPT)
    this.concepts.set(id, created)
    return created
  }

  /** 특징이 아닌 '아는 글자열'로만 남긴다(문서·사전 글). */
  markKnown(compact: string) {
    const keys = gramKeys(compact, this.alphabet, true, [])
    for (const key of keys) if (key >= 0 && !this.grams.has(key)) this.grams.set(key, KNOWN_ONLY)
  }

  get size() {
    return this.kinds.length
  }
}

/** 문서들의 특징 번호(반복 포함)를 한 배열에 이어 둔다. 문서 d 는 offsets[d]..offsets[d+1]. */
class FeatureBuffer {
  ids = new Int32Array(1 << 16)
  length = 0
  readonly offsets: number[] = [0]

  push(id: number) {
    if (this.length === this.ids.length) {
      const next = new Int32Array(this.ids.length * 2)
      next.set(this.ids)
      this.ids = next
    }
    this.ids[this.length] = id
    this.length += 1
  }

  endDoc() {
    this.offsets.push(this.length)
  }

  get docCount() {
    return this.offsets.length - 1
  }
}

function conceptFeatureIds(concepts: ConceptMatch[], lexicon: CompiledLexicon) {
  const ids = new Set<string>()
  for (const match of concepts) {
    ids.add(match.id)
    for (const ancestor of lexicon.concepts.get(match.id)?.ancestors ?? []) ids.add(ancestor)
  }
  return Array.from(ids)
}

/** 말뭉치 글 하나의 특징을 버퍼에 넣고 문서를 닫는다(사전에 없는 특징은 새로 만든다). */
function collect(text: Pick<PreparedText, "normalized" | "stripped" | "compact">, vocab: Vocabulary, lexicon: CompiledLexicon, buffer: FeatureBuffer) {
  for (const key of gramKeys(text.compact, vocab.alphabet, true, [])) if (key >= 0) buffer.push(vocab.gram(key, true)!)
  for (const word of wordsOf(text.stripped)) buffer.push(vocab.word(word, true)!)
  const concepts = matchConcepts(text.normalized, lexicon)
  if (concepts.length > 0) for (const conceptId of conceptFeatureIds(concepts, lexicon)) buffer.push(vocab.concept(conceptId, true)!)
  buffer.endDoc()
}

/** 말뭉치 글 준비(묻는 꼴은 세지 않는다 — 변형 10만 줄을 빨리 돌리려고). */
function prepareCorpusText(raw: string): Pick<PreparedText, "normalized" | "stripped" | "compact"> {
  const normalized = normalizeText(glossForIndex(stripBrand(raw)))
  const stripped = stripQuestionTail(normalized)
  return { normalized, stripped, compact: compactOf(stripped) }
}

/** 문장·카드 글 준비(꼬리를 떼지 않는다). */
function prepareProse(raw: string): Pick<PreparedText, "normalized" | "stripped" | "compact"> {
  const normalized = normalizeText(raw)
  return { normalized, stripped: normalized, compact: compactOf(normalized) }
}

// ─── 문서 모음(평평한 배열) ─────────────────────────────────────────────

/** 문서별 (특징, tf) 목록. offsets[d]..offsets[d+1]. */
interface DocTerms {
  offsets: Uint32Array
  ids: Int32Array
  tf: Uint8Array
}

/** 버퍼의 문서마다 특징을 정렬해 (특징, tf) 로 접는다(버퍼 안에서 정렬한다). */
function buildDocTerms(buffer: FeatureBuffer): DocTerms {
  const docCount = buffer.docCount
  let total = 0
  for (let d = 0; d < docCount; d += 1) {
    const slice = buffer.ids.subarray(buffer.offsets[d], buffer.offsets[d + 1]).sort()
    for (let i = 0; i < slice.length; i += 1) if (i === 0 || slice[i] !== slice[i - 1]) total += 1
  }
  const offsets = new Uint32Array(docCount + 1)
  const ids = new Int32Array(total)
  const tf = new Uint8Array(total)
  let cursor = 0
  for (let d = 0; d < docCount; d += 1) {
    offsets[d] = cursor
    for (let p = buffer.offsets[d]; p < buffer.offsets[d + 1]; p += 1) {
      const id = buffer.ids[p]
      if (p > buffer.offsets[d] && id === buffer.ids[p - 1]) {
        if (tf[cursor - 1] < 255) tf[cursor - 1] += 1
        continue
      }
      ids[cursor] = id
      tf[cursor] = 1
      cursor += 1
    }
  }
  offsets[docCount] = cursor
  return { offsets, ids, tf }
}

export const TF_WEIGHT = Float32Array.from({ length: 256 }, (_, tf) => (tf === 0 ? 0 : 1 + Math.log(tf)))

/** 역색인: 특징 f 의 문서 docs[offsets[f]..offsets[f+1]] 와 tf. invNorm[d] = 1/‖d‖. */
export interface Postings {
  offsets: Uint32Array
  docs: Int32Array
  tf: Uint8Array
  invNorm: Float32Array
  size: number
}

function buildPostings(terms: DocTerms, featureCount: number, featureWeight: Float32Array): Postings {
  const docCount = terms.offsets.length - 1
  const counts = new Uint32Array(featureCount + 1)
  for (let p = 0; p < terms.ids.length; p += 1) counts[terms.ids[p] + 1] += 1
  for (let f = 0; f < featureCount; f += 1) counts[f + 1] += counts[f]
  const offsets = counts
  const cursor = offsets.slice(0, featureCount)
  const docs = new Int32Array(terms.ids.length)
  const tf = new Uint8Array(terms.ids.length)
  const invNorm = new Float32Array(docCount)
  for (let d = 0; d < docCount; d += 1) {
    let norm = 0
    for (let p = terms.offsets[d]; p < terms.offsets[d + 1]; p += 1) {
      const f = terms.ids[p]
      const w = TF_WEIGHT[terms.tf[p]] * featureWeight[f]
      norm += w * w
      const at = cursor[f]++
      docs[at] = d
      tf[at] = terms.tf[p]
    }
    invNorm[d] = norm > 0 ? 1 / Math.sqrt(norm) : 0
  }
  return { offsets, docs, tf, invNorm, size: docCount }
}

/** 실수 가중 역색인(카드 중심 벡터). */
export interface WeightedPostings {
  offsets: Uint32Array
  docs: Int32Array
  weights: Float32Array
}

// ─── BM25F(지금 문서 단위) ──────────────────────────────────────────────

export const BM25_K1 = 1.2
export const BM25_B = 0.75
export const BM25_TITLE_WEIGHT = 0.35
export const BM25_CONCEPT_WEIGHT = 2

export interface Bm25Index {
  unitIds: string[]
  unitIndex: Map<string, number>
  /** 토큰 → [단위 번호, 가중 tf] 평평한 배열. */
  postings: Map<string, { units: Int32Array; tf: Float32Array }>
  idf: Map<string, number>
  lengths: Float32Array
  avgLength: number
}

function bm25Tokens(text: Pick<PreparedText, "normalized" | "compact">, lexicon: CompiledLexicon, weight: number, out: Map<string, number>) {
  const compact = text.compact
  if (compact.length === 1) out.set(`g:${compact}`, (out.get(`g:${compact}`) ?? 0) + weight)
  for (let i = 0; i + 2 <= compact.length; i += 1) {
    const token = `g:${compact.slice(i, i + 2)}`
    out.set(token, (out.get(token) ?? 0) + weight)
  }
  for (const id of conceptFeatureIds(matchConcepts(text.normalized, lexicon), lexicon)) {
    const token = `c:${id}`
    out.set(token, (out.get(token) ?? 0) + weight * BM25_CONCEPT_WEIGHT)
  }
  return out
}

/** 질의 BM25 토큰(가중 1). */
export function queryBm25Tokens(text: Pick<PreparedText, "normalized" | "compact">, lexicon: CompiledLexicon) {
  return bm25Tokens(text, lexicon, 1, new Map())
}

function buildBm25(units: AnswerIndexUnit[], lexicon: CompiledLexicon): Bm25Index {
  const perUnit: Map<string, number>[] = []
  const lengths = new Float32Array(units.length)
  units.forEach((unit, index) => {
    const tokens = new Map<string, number>()
    const body = unit.sentences.filter((sentence) => !sentence.flags.includes("caption")).map((sentence) => sentence.text).join(" ")
    bm25Tokens(prepareProse(body), lexicon, 1, tokens)
    bm25Tokens(prepareProse(`${unit.heading} ${unit.docTitle}`), lexicon, BM25_TITLE_WEIGHT, tokens)
    let length = 0
    for (const value of tokens.values()) length += value
    lengths[index] = length
    perUnit.push(tokens)
  })
  const lists = new Map<string, { units: number[]; tf: number[] }>()
  perUnit.forEach((tokens, unit) => {
    for (const [token, tf] of tokens) {
      const list = lists.get(token) ?? { units: [], tf: [] }
      list.units.push(unit)
      list.tf.push(tf)
      lists.set(token, list)
    }
  })
  const postings = new Map<string, { units: Int32Array; tf: Float32Array }>()
  const idf = new Map<string, number>()
  const n = units.length
  for (const [token, list] of lists) {
    postings.set(token, { units: Int32Array.from(list.units), tf: Float32Array.from(list.tf) })
    const df = list.units.length
    idf.set(token, Math.log(1 + (n - df + 0.5) / (df + 0.5)))
  }
  let total = 0
  for (const length of lengths) total += length
  return {
    unitIds: units.map((unit) => unit.unitId),
    unitIndex: new Map(units.map((unit, index) => [unit.unitId, index])),
    postings,
    idf,
    lengths,
    avgLength: n > 0 ? total / n : 0,
  }
}

// ─── 컴파일한 색인 ───────────────────────────────────────────────────────

/** 우주 라벨 번호: 0 이상은 카드 번호. */
export const LABEL_NONE = -1
export const LABEL_CLARIFY = -2
/** 색인에 없는 카드(review·disabled·낡음)를 가리키는 라벨. */
export const LABEL_UNAVAILABLE = -3
/** label2 가 없음. */
export const LABEL_ABSENT = -9

export interface CompiledCard {
  index: number
  id: string
  kind: AnswerCardKind
  area: string
  topic: string
  asks: AskType[]
  /** 카드 concepts + topic·anchors·covers 에서 찾은 개념(NEW: 후보 제외). */
  ownConcepts: string[]
  /** ownConcepts 와 그 상위 개념. */
  conceptClosure: Set<string>
  /** 공백 뺀 anchors·topic(없는 개념 덮임 확인용). */
  anchorCompacts: string[]
  variantStart: number
  variantEnd: number
  /** BM25 근거 단위 번호. */
  evidenceUnits: number[]
  card: AnswerCard
}

export interface CompiledAnswerIndex {
  dataVersion: string
  calibration: ResolvedCalibration
  /** 모델 선택 층 설정(calibration.json assist). 색인 해시에 넣지 않는다. 없으면(옛 색인 객체) 꺼짐. */
  assist?: ResolvedAssistCalibration
  cards: CompiledCard[]
  cardById: Map<string, number>
  lexicon: CompiledLexicon
  absent: CompiledAbsent
  generic: Set<string>
  legacyAlias: LegacyAliasFile
  vocab: Vocabulary
  /** idf × (개념이면 2). */
  featureWeight: Float32Array
  featureIdf: Float32Array
  maxIdf: number
  /** IDF 문서 수. */
  idfDocs: number
  variants: Postings & { owner: Int32Array }
  universe: Postings & { label: Int32Array; label2: Int32Array }
  negatives: Postings & { owner: Int32Array; route: Int32Array; routeId: string[] }
  centroids: WeightedPostings
  /** 카드 덮임 특징(카드 글·topic·anchors·개념 형태, 정렬). coverageOffsets[c]..[c+1]. 변형 특징은 variants 역색인으로 본다. */
  coverageOffsets: Uint32Array
  coverageIds: Int32Array
  bm25: Bm25Index
  /** 단위 번호 → 그 단위를 근거로 쓰는 카드 번호. */
  cardsByUnit: number[][]
  currentUnits: ReadonlyMap<string, AnswerIndexUnit>
  stats: {
    cards: number
    variants: number
    universe: number
    negatives: number
    features: number
    knownOnlyGrams: number
    units: number
    compileMs: number
    /** 단계별 걸린 시간(ms). 색인 해시에는 들어가지 않는다. */
    phaseMs: Record<string, number>
  }
}

function cardTextParts(card: AnswerCard, units: ReadonlyMap<string, AnswerIndexUnit>) {
  const parts = [card.topic, ...(card.anchors ?? []), card.covers ?? ""]
  if (card.kind === "doc") {
    for (const ref of card.answer.sentences ?? []) {
      const unit = units.get(ref.unit)
      for (const i of ref.ids ?? []) {
        const text = unit?.sentences[i]?.text
        if (text) parts.push(text)
      }
    }
  }
  return parts.filter((part) => typeof part === "string" && part.trim())
}

function evidenceUnitIds(card: AnswerCard): string[] {
  if (card.kind === "doc") {
    const ids = (card.answer.sentences ?? []).map((ref) => ref.unit)
    if (card.answer.leadBasis?.unit) ids.push(card.answer.leadBasis.unit)
    return Array.from(new Set(ids))
  }
  if (card.kind === "howto" && card.answer.guide) return [`guide:${card.answer.guide}`]
  return []
}

function resolveLabel(label: string | null, cardById: Map<string, number>) {
  if (label === null || label === undefined) return null
  if (label === "none") return LABEL_NONE
  if (label === "clarify") return LABEL_CLARIFY
  if (label.startsWith("missing:")) return null
  const card = cardById.get(label)
  return card !== undefined ? card : LABEL_UNAVAILABLE
}

/** 반례 행선: 카드 번호, 없으면(none·색인에 없는 카드) -1. */
function resolveRoute(route: string, cardById: Map<string, number>) {
  return cardById.get(route) ?? LABEL_NONE
}

export function compileAnswerIndex(data: LoadedAnswerIndexData): CompiledAnswerIndex {
  const started = performance.now()
  const phaseMs: Record<string, number> = {}
  let phaseStart = started
  const phase = (name: string) => {
    const now = performance.now()
    phaseMs[name] = Math.round(now - phaseStart)
    phaseStart = now
  }
  const lexicon = compileLexicon(data.lexicon)
  const absent = compileAbsent(data.absent)
  const generic = buildGenericSet(data.genericWords)
  const calibration = resolveCalibration(data.calibration)
  const units = data.currentUnits

  // 카드: id 순.
  const sortedCards = [...data.cards].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const cardById = new Map(sortedCards.map((card, index) => [card.id, index]))
  const vocab = new Vocabulary()

  phase("setup")
  // 1) IDF 문서: 변형(카드 순) → 우주(id 순) → 카드 글(카드 순).
  const variantBuffer = new FeatureBuffer()
  const variantOwner: number[] = []
  const cards: CompiledCard[] = sortedCards.map((card, index) => {
    const variantStart = variantBuffer.docCount
    const seenVariant = new Set<string>()
    for (const variant of data.variants.get(card.id) ?? []) {
      const prepared = prepareCorpusText(variant.q)
      if (!prepared.compact || seenVariant.has(prepared.compact)) continue
      seenVariant.add(prepared.compact)
      collect(prepared, vocab, lexicon, variantBuffer)
      variantOwner.push(index)
    }
    const own = new Set((card.concepts ?? []).filter((id) => typeof id === "string" && !id.startsWith("NEW:")))
    for (const text of [card.topic, ...(card.anchors ?? []), card.covers ?? ""]) {
      if (typeof text !== "string" || !text.trim()) continue
      for (const match of matchConcepts(normalizeText(text), lexicon)) own.add(match.id)
    }
    const ownConcepts = Array.from(own).sort()
    const closure = new Set<string>(ownConcepts)
    for (const id of ownConcepts) for (const ancestor of lexicon.concepts.get(id)?.ancestors ?? []) closure.add(ancestor)
    return {
      index,
      id: card.id,
      kind: card.kind,
      area: card.area,
      topic: card.topic,
      asks: Array.isArray(card.asks) ? card.asks : [],
      ownConcepts,
      conceptClosure: closure,
      anchorCompacts: [card.topic, ...(card.anchors ?? [])].map((text) => compactForm(text ?? "")).filter(Boolean),
      variantStart,
      variantEnd: variantBuffer.docCount,
      evidenceUnits: [],
      card,
    }
  })
  const variantCount = variantBuffer.docCount

  const universeBuffer = new FeatureBuffer()
  const universeItems = [...data.universe].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const universeLabel: number[] = []
  const universeLabel2: number[] = []
  for (const item of universeItems) {
    const label = resolveLabel(item.label, cardById)
    if (label === null) continue
    const prepared = prepareCorpusText(item.q)
    if (!prepared.compact) continue
    const second = item.label2 && item.label2 !== item.label ? resolveLabel(item.label2, cardById) : null
    collect(prepared, vocab, lexicon, universeBuffer)
    universeLabel.push(label)
    universeLabel2.push(second ?? LABEL_ABSENT)
  }
  const universeCount = universeBuffer.docCount

  const cardTextBuffer = new FeatureBuffer()
  for (const card of sortedCards) collect(prepareProse(cardTextParts(card, units).join(" ")), vocab, lexicon, cardTextBuffer)

  phase("idfDocs")
  // 2) IDF 문서가 아닌 글: 반례, 카드 topic·anchors 벡터, 카드 개념 형태(덮임용).
  const negativeBuffer = new FeatureBuffer()
  const negativeOwner: number[] = []
  const negativeRoute: number[] = []
  const routeId: string[] = []
  sortedCards.forEach((card, index) => {
    for (const negative of card.negatives ?? []) {
      if (!negative || typeof negative.q !== "string" || !negative.q.trim()) continue
      const prepared = prepareCorpusText(negative.q)
      if (!prepared.compact) continue
      collect(prepared, vocab, lexicon, negativeBuffer)
      negativeOwner.push(index)
      negativeRoute.push(resolveRoute(typeof negative.route === "string" ? negative.route : "none", cardById))
      routeId.push(typeof negative.route === "string" ? negative.route : "none")
    }
  })
  const anchorBuffer = new FeatureBuffer()
  for (const card of sortedCards) collect(prepareProse([card.topic, ...(card.anchors ?? [])].join(" ")), vocab, lexicon, anchorBuffer)
  const lexiconById = new Map(data.lexicon.map((concept) => [concept.id, concept]))
  // 개념 형태의 특징은 개념마다 한 번만 뽑는다(카드는 anchors 에서 개념을 많이 얻어서 카드마다 뽑으면 느리다).
  const conceptFormFeatures = new Map<string, number[]>()
  const formFeaturesOf = (conceptId: string) => {
    const cached = conceptFormFeatures.get(conceptId)
    if (cached) return cached
    const ids: number[] = []
    const concept = lexiconById.get(conceptId)
    for (const form of concept ? [...(concept.doc ?? []), ...(concept.visitor ?? [])] : []) {
      const text = typeof form === "string" ? form : form.form
      if (typeof text !== "string" || !text.trim()) continue
      const prepared = prepareProse(text)
      for (const key of gramKeys(prepared.compact, vocab.alphabet, true, [])) if (key >= 0) ids.push(vocab.gram(key, true)!)
      for (const word of wordsOf(prepared.stripped)) ids.push(vocab.word(word, true)!)
    }
    const conceptFeature = vocab.concept(conceptId, true)
    if (conceptFeature !== undefined) ids.push(conceptFeature)
    conceptFormFeatures.set(conceptId, ids)
    return ids
  }
  const conceptFormDocs = cards.map((card) => card.ownConcepts.flatMap(formFeaturesOf))

  phase("otherTexts")
  // 3) 아는 글자열: 지금 문서 단위·사전 형태·없는 개념 형태(말뭉치 밖 낱말 세기용).
  for (const unit of units.values()) for (const sentence of unit.sentences) vocab.markKnown(compactOf(normalizeText(sentence.text)))
  for (const concept of data.lexicon) for (const form of [...(concept.doc ?? []), ...(concept.visitor ?? [])]) vocab.markKnown(compactForm(typeof form === "string" ? form : form.form))
  for (const item of data.absent) for (const form of item.forms ?? []) if (typeof form === "string") vocab.markKnown(compactForm(form))

  phase("known")
  // 4) IDF(문서 안 중복 없는 특징으로 센다).
  const featureCount = vocab.size
  const variantTerms = buildDocTerms(variantBuffer)
  const universeTerms = buildDocTerms(universeBuffer)
  const cardTextTerms = buildDocTerms(cardTextBuffer)
  const df = new Uint32Array(featureCount)
  for (const terms of [variantTerms, universeTerms, cardTextTerms]) for (let p = 0; p < terms.ids.length; p += 1) df[terms.ids[p]] += 1
  const n = variantCount + universeCount + cardTextBuffer.docCount
  const featureIdf = new Float32Array(featureCount)
  const featureWeight = new Float32Array(featureCount)
  const maxIdf = Math.log(n + 1) + 1
  for (let f = 0; f < featureCount; f += 1) {
    featureIdf[f] = Math.log((n + 1) / (df[f] + 1)) + 1
    featureWeight[f] = featureIdf[f] * (vocab.kinds[f] === FEATURE_CONCEPT ? CONCEPT_SCALE : 1)
  }

  phase("idf")
  // 5) 역색인.
  const variants = { ...buildPostings(variantTerms, featureCount, featureWeight), owner: Int32Array.from(variantOwner) }
  const universe = {
    ...buildPostings(universeTerms, featureCount, featureWeight),
    label: Int32Array.from(universeLabel),
    label2: Int32Array.from(universeLabel2),
  }
  const negativeTerms = buildDocTerms(negativeBuffer)
  const negatives = {
    ...buildPostings(negativeTerms, featureCount, featureWeight),
    owner: Int32Array.from(negativeOwner),
    route: Int32Array.from(negativeRoute),
    routeId,
  }
  const anchorTerms = buildDocTerms(anchorBuffer)

  phase("postings")
  // 6) 중심 벡터(변형 평균 + topic·anchors 벡터)와 덮임 특징. 카드마다 같은 밀집 배열을 쓰고 닿은 칸만 지운다.
  const sum = new Float64Array(featureCount)
  const stamp = new Int32Array(featureCount)
  const centroidLists: { ids: Int32Array; weights: Float32Array }[] = []
  const coverageLists: Int32Array[] = []
  for (const card of cards) {
    const touched: number[] = []
    const addVector = (terms: DocTerms, doc: number, scale: number) => {
      let norm = 0
      for (let p = terms.offsets[doc]; p < terms.offsets[doc + 1]; p += 1) {
        const w = TF_WEIGHT[terms.tf[p]] * featureWeight[terms.ids[p]]
        norm += w * w
      }
      if (norm === 0) return
      const inv = scale / Math.sqrt(norm)
      for (let p = terms.offsets[doc]; p < terms.offsets[doc + 1]; p += 1) {
        const f = terms.ids[p]
        if (sum[f] === 0) touched.push(f)
        sum[f] += TF_WEIGHT[terms.tf[p]] * featureWeight[f] * inv
      }
    }
    const variantN = card.variantEnd - card.variantStart
    for (let v = card.variantStart; v < card.variantEnd; v += 1) addVector(variantTerms, v, 1 / variantN)
    addVector(anchorTerms, card.index, 1)
    // 가중치가 큰 CENTROID_MAX_FEATURES 개만 남긴다(같은 가중치면 특징 번호가 작은 것). 문턱 값을 숫자 정렬로 찾는다.
    const ordered = Int32Array.from(touched).sort()
    let ids = ordered
    if (ordered.length > CENTROID_MAX_FEATURES) {
      const values = Float64Array.from(ordered, (f) => sum[f]).sort()
      const cut = values[values.length - CENTROID_MAX_FEATURES]
      let above = 0
      for (const f of ordered) if (sum[f] > cut) above += 1
      let ties = CENTROID_MAX_FEATURES - above
      ids = ordered.filter((f) => sum[f] > cut || (sum[f] === cut && ties-- > 0))
    }
    let norm = 0
    for (const f of ids) norm += sum[f] * sum[f]
    const inv = norm > 0 ? 1 / Math.sqrt(norm) : 0
    const weights = new Float32Array(ids.length)
    ids.forEach((f, k) => {
      weights[k] = sum[f] * inv
    })
    for (const f of touched) sum[f] = 0
    centroidLists.push({ ids, weights })

    // 덮임 특징: 카드 글·topic·anchors·카드 개념 형태(변형 특징은 질의 때 변형 역색인으로 본다).
    const mark = card.index + 1
    const coverage: number[] = []
    const cover = (f: number) => {
      if (stamp[f] === mark) return
      stamp[f] = mark
      coverage.push(f)
    }
    for (let p = cardTextTerms.offsets[card.index]; p < cardTextTerms.offsets[card.index + 1]; p += 1) cover(cardTextTerms.ids[p])
    for (let p = anchorTerms.offsets[card.index]; p < anchorTerms.offsets[card.index + 1]; p += 1) cover(anchorTerms.ids[p])
    for (const f of conceptFormDocs[card.index]) cover(f)
    coverageLists.push(Int32Array.from(coverage).sort())
  }
  const centroids = transposeWeighted(centroidLists, featureCount)
  const coverageOffsets = new Uint32Array(cards.length + 1)
  let coverageTotal = 0
  coverageLists.forEach((list, index) => {
    coverageOffsets[index] = coverageTotal
    coverageTotal += list.length
  })
  coverageOffsets[cards.length] = coverageTotal
  const coverageIds = new Int32Array(coverageTotal)
  coverageLists.forEach((list, index) => coverageIds.set(list, coverageOffsets[index]))

  phase("centroids")
  // 7) BM25F(지금 문서 단위 전부).
  const unitList = Array.from(units.values())
  const bm25 = buildBm25(unitList, lexicon)
  const cardsByUnit: number[][] = unitList.map(() => [])
  for (const card of cards) {
    for (const unitId of evidenceUnitIds(card.card)) {
      const unit = bm25.unitIndex.get(unitId)
      if (unit === undefined) continue
      card.evidenceUnits.push(unit)
      cardsByUnit[unit].push(card.index)
    }
  }

  phase("bm25")
  const knownOnly = vocab.grams.count(KNOWN_ONLY)
  return {
    dataVersion: data.dataVersion,
    calibration,
    assist: resolveAssistCalibration(data.calibration),
    cards,
    cardById,
    lexicon,
    absent,
    generic,
    legacyAlias: data.legacyAlias,
    vocab,
    featureWeight,
    featureIdf,
    maxIdf,
    idfDocs: n,
    variants,
    universe,
    negatives,
    centroids,
    coverageOffsets,
    coverageIds,
    bm25,
    cardsByUnit,
    currentUnits: units,
    stats: {
      cards: cards.length,
      variants: variantCount,
      universe: universeCount,
      negatives: negativeBuffer.docCount,
      features: featureCount,
      knownOnlyGrams: knownOnly,
      units: unitList.length,
      compileMs: Math.round(performance.now() - started),
      phaseMs,
    },
  }
}

function transposeWeighted(lists: { ids: Int32Array; weights: Float32Array }[], featureCount: number): WeightedPostings {
  const offsets = new Uint32Array(featureCount + 1)
  let total = 0
  for (const list of lists) for (const id of list.ids) {
    offsets[id + 1] += 1
    total += 1
  }
  for (let f = 0; f < featureCount; f += 1) offsets[f + 1] += offsets[f]
  const cursor = offsets.slice(0, featureCount)
  const docs = new Int32Array(total)
  const weights = new Float32Array(total)
  lists.forEach((list, doc) => {
    list.ids.forEach((id, k) => {
      const at = cursor[id]++
      docs[at] = doc
      weights[at] = list.weights[k]
    })
  })
  return { offsets, docs, weights }
}

// ─── 질의 ────────────────────────────────────────────────────────────────

export interface QueryTerm {
  /** 특징 번호. 모르는 특징은 -1. */
  feature: number
  idf: number
}

export interface IndexQuery extends PreparedText {
  concepts: ConceptMatch[]
  /** 맞은 개념 id(상위 개념 없이, 처음 나온 순서). */
  conceptIds: string[]
  absent: AbsentMatch[]
  /** 질의 벡터(아는 특징만, 모르는 특징까지 넣은 노름으로 나눔). */
  vector: { ids: Int32Array; weights: Float32Array }
  /** 내용 n-gram·낱말(개념 제외), idf 내림차순. 덮임 계산용. */
  terms: QueryTerm[]
  /** 뜻 없는 낱말을 뺀 내용 낱말(조사 뗀 꼴). */
  contentWords: string[]
  /** 내용 낱말 가운데 말뭉치(문서·변형·우주·사전)에 없는 2글자 이상 낱말 수. */
  unknownHighIdf: number
  /** 내용 낱말이 없음(지시어·묻는 꼬리·증상 말만 있음: "그거 안 돼요", "에러나요"). */
  contentLight: boolean
}

/** 2~4 글자 글 전체의 n-gram 열쇠. 모르는 글자가 있으면 -1. */
function wholeGramKey(text: string, alphabet: Alphabet) {
  let key = 0
  for (let i = 0; i < text.length; i += 1) {
    const id = alphabet.id(text.charCodeAt(i), false)
    if (id === 0) return -1
    key = key * CHAR_BASE + id
  }
  return key
}

/** 낱말이 말뭉치(문서·변형·우주·카드 글·사전)에 나온 글자열인지. 2~4 글자는 낱말 전체, 긴 낱말은 이어지는 4-gram 전부로 본다. */
function isKnownWord(word: string, index: CompiledAnswerIndex) {
  const grams = index.vocab.grams
  if (word.length <= 4) {
    const key = wholeGramKey(word, index.vocab.alphabet)
    return key >= 0 && grams.has(key)
  }
  for (let i = 0; i + 4 <= word.length; i += 1) {
    const key = wholeGramKey(word.slice(i, i + 4), index.vocab.alphabet)
    if (key < 0 || !grams.has(key)) return false
  }
  return true
}

/** 질문 하나(또는 조각 하나)를 질의로 준비한다. */
export function prepareQuery(index: CompiledAnswerIndex, question: string): IndexQuery {
  const prepared = prepareText(question)
  const { vocab } = index
  const counts = new Map<number, number>()
  const terms: QueryTerm[] = []
  let unknown = 0

  // 글자 n-gram. 색인이 모르는 n-gram 가운데 낱말 경계를 넘는 것("요금 얼마"의 '금얼')은 띄어쓰기 우연이라 버린다.
  // 아는 n-gram 은 경계를 넘어도 쓴다(띄어쓰기만 다른 "채팅금지"·"채팅 금지"가 맞게).
  const { compact, wordStart } = compactWithBoundaries(prepared.stripped)
  const charIds = Array.from(compact, (char) => vocab.alphabet.id(char.charCodeAt(0), false))
  const addGram = (start: number, length: number) => {
    let key = 0
    let crosses = false
    for (let k = 0; k < length; k += 1) {
      const id = charIds[start + k]
      key = id === 0 || key < 0 ? -1 : key * CHAR_BASE + id
      if (k > 0 && wordStart[start + k]) crosses = true
    }
    const feature = key >= 0 ? vocab.grams.get(key) : undefined
    if (feature !== undefined && feature >= 0) {
      counts.set(feature, (counts.get(feature) ?? 0) + 1)
      terms.push({ feature, idf: index.featureIdf[feature] })
    } else if (!crosses) {
      unknown += 1
      terms.push({ feature: -1, idf: index.maxIdf })
    }
  }
  if (compact.length === 1) addGram(0, 1)
  else for (let i = 0; i < compact.length; i += 1) for (let length = 2; length <= 4 && i + length <= compact.length; length += 1) addGram(i, length)

  for (const word of wordsOf(prepared.stripped)) {
    const feature = vocab.words.get(word)
    if (feature !== undefined) {
      counts.set(feature, (counts.get(feature) ?? 0) + 1)
      terms.push({ feature, idf: index.featureIdf[feature] })
    } else {
      unknown += 1
      terms.push({ feature: -1, idf: index.maxIdf })
    }
  }
  const concepts = matchConcepts(prepared.normalized, index.lexicon)
  for (const conceptId of conceptFeatureIds(concepts, index.lexicon)) {
    const feature = vocab.concepts.get(conceptId)
    if (feature !== undefined) counts.set(feature, (counts.get(feature) ?? 0) + 1)
  }
  terms.sort((a, b) => b.idf - a.idf || a.feature - b.feature)

  const ids = Array.from(counts.keys()).sort((a, b) => a - b)
  const raw = ids.map((id) => TF_WEIGHT[Math.min(255, counts.get(id)!)] * index.featureWeight[id])
  let norm = 0
  for (const w of raw) norm += w * w
  // 모르는 특징도 노름에 넣는다(가장 높은 idf): 질문에서 색인이 설명하지 못하는 부분이 많을수록 코사인이 낮아진다.
  norm += unknown * index.maxIdf * index.maxIdf
  const inv = norm > 0 ? 1 / Math.sqrt(norm) : 0

  const contentWords = wordsOf(prepared.stripped).filter(
    (word) => !index.generic.has(word) && !/^\d+$/.test(word) && !isTailOnly(word) && !INDEX_SYMPTOM_RE.test(word)
  )
  const unknownHighIdf = contentWords.filter((word) => word.length >= 2 && !isKnownWord(word, index)).length

  return {
    ...prepared,
    concepts,
    conceptIds: Array.from(new Set(concepts.map((match) => match.id))),
    absent: matchAbsent(prepared.normalized, index.absent),
    vector: { ids: Int32Array.from(ids), weights: Float32Array.from(raw.map((w) => w * inv)) },
    terms,
    contentWords,
    unknownHighIdf,
    contentLight: contentWords.length === 0,
  }
}

// ─── 색인 해시 ───────────────────────────────────────────────────────────

const hashCache = new WeakMap<CompiledAnswerIndex, string>()

/** 컴파일한 색인 내용의 해시(sha256 앞 16자). 같은 자료면 같은 값. 처음 부를 때 계산한다. */
export function answerIndexHash(index: CompiledAnswerIndex) {
  const cached = hashCache.get(index)
  if (cached) return cached
  const hash = createHash("sha256")
  const update = (value: ArrayBufferView | string) => {
    if (typeof value === "string") hash.update(value, "utf8")
    else hash.update(new Uint8Array(value.buffer, value.byteOffset, value.byteLength))
  }
  update(`v${ANSWER_INDEX_COMPILER_VERSION}|${index.dataVersion}|${JSON.stringify(index.calibration)}\n`)
  update(JSON.stringify(index.cards.map((card) => [card.id, card.kind, card.ownConcepts, card.variantStart, card.variantEnd, card.evidenceUnits])))
  update(JSON.stringify(Array.from(index.vocab.alphabet.ids.entries())))
  update(index.vocab.grams.buffers().keys)
  update(index.vocab.grams.buffers().values)
  update(JSON.stringify(Array.from(index.vocab.words.entries())))
  update(JSON.stringify(Array.from(index.vocab.concepts.entries())))
  update(index.featureWeight)
  for (const postings of [index.variants, index.universe, index.negatives]) {
    update(postings.offsets)
    update(postings.docs)
    update(postings.tf)
    update(postings.invNorm)
  }
  update(index.universe.label)
  update(index.universe.label2)
  update(index.negatives.route)
  update(index.centroids.offsets)
  update(index.centroids.docs)
  update(index.centroids.weights)
  update(index.coverageIds)
  update(JSON.stringify(index.bm25.unitIds))
  update(index.bm25.lengths)
  const value = hash.digest("hex").slice(0, 16)
  hashCache.set(index, value)
  return value
}
