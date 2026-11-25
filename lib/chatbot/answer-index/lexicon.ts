/**
 * 개념 사전 맞추기(사양 §3.3 ①, §4.2 lexicon.json·absent.json).
 *
 * 규칙
 * - 띄어쓰기는 무시한다: 형태와 글 모두 공백을 지운 꼴(compact)로 맞춘다.
 * - 형태는 낱말 첫머리에서만 맞춘다("편집에서"가 "집에서"로 잡히지 않음). 앞 형태가 낱말 안에서 끝난 자리도 첫머리로 본다
 *   ("학생채팅금지" → 학생 + 채팅금지).
 * - 공백 뺀 길이 3글자 이하 형태(또는 boundary:"both")는 끝 경계도 요구한다: 글 끝·낱말 끝·조사·어미 첫 글자,
 *   또는 그 자리에서 다른 형태가 온전히 시작함("학생 수업"이 "학생 수"로 잡히지 않음, "학생 수가"는 잡힘).
 * - 한 맞춤이 다른 맞춤을 완전히 품으면 품긴 것을 버린다(가장 긴 맞춤).
 * - 모호 규칙(ambiguous: requiresAny·notWith)은 그 맞춤과 겹치지 않는 다른 맞춤의 개념(과 상위 개념)으로 푼다.
 *
 * 같은 맞추기 장치로 문서에 없는 개념(absent.json forms)도 찾는다.
 */
import type { AbsentConcept, ConceptKind, LexiconAmbiguityRule, LexiconConcept, LexiconForm } from "./types"
import { normalizeText } from "./normalize"
import { NumberMap } from "./number-map"

/** 조사·어미 첫 글자: 짧은 형태 바로 뒤에 오면 낱말 끝으로 본다. */
const END_BOUNDARY_CHARS = new Set(
  Array.from("은는이가을를의에와과도만로으랑께서부까처보마야아여요나니고며면지기게겠던데든라란인일했해하한할함합되된될됨돼됐있없같좀들씩쯤뿐및등엔에선")
)

export const SHORT_FORM_MAX = 3

interface FormEntry {
  owner: string
  form: string
  compact: string
  /** 끝 경계 필요. */
  bothBoundary: boolean
  rule: LexiconAmbiguityRule | null
}

/** 형태 트라이(자식은 (노드 번호 × 65537 + 글자 코드 + 1) → 노드 번호 한 장으로 둔다). */
const childKey = (node: number, code: number) => node * 65537 + code + 1

export class FormMatcher {
  private readonly child = new NumberMap(1 << 12)
  private readonly terminal: (FormEntry[] | undefined)[] = [undefined]
  private nodes = 1
  readonly size: number

  constructor(entries: FormEntry[]) {
    for (const entry of entries) this.add(entry)
    this.size = entries.length
  }

  private add(entry: FormEntry) {
    if (!entry.compact) return
    let node = 0
    for (let i = 0; i < entry.compact.length; i += 1) {
      const key = childKey(node, entry.compact.charCodeAt(i))
      let next = this.child.get(key)
      if (next === undefined) {
        next = this.nodes
        this.nodes += 1
        this.child.set(key, next)
        this.terminal.push(undefined)
      }
      node = next
    }
    const list = this.terminal[node] ?? []
    if (!list.some((existing) => existing.owner === entry.owner && existing.bothBoundary === entry.bothBoundary)) list.push(entry)
    this.terminal[node] = list
  }

  /** start 에서 시작하는 모든 형태 맞춤: [끝 위치, 항목들]. */
  prefixMatches(compact: string, start: number): [number, FormEntry[]][] {
    const out: [number, FormEntry[]][] = []
    let node = 0
    for (let i = start; i < compact.length; i += 1) {
      const next = this.child.get(childKey(node, compact.charCodeAt(i)))
      if (next === undefined) break
      node = next
      const entries = this.terminal[node]
      if (entries) out.push([i + 1, entries])
    }
    return out
  }
}

export interface FormMatch {
  owner: string
  form: string
  /** compact 글 기준 [start, end). */
  start: number
  end: number
  rule: LexiconAmbiguityRule | null
}

/** 정규화한 글(공백 포함) → compact 글과 낱말 첫머리 표시. */
export function compactWithBoundaries(normalized: string) {
  let compact = ""
  const wordStart: boolean[] = []
  let previousSpace = true
  for (const char of normalized) {
    if (char === " ") {
      previousSpace = true
      continue
    }
    for (let k = 0; k < char.length; k += 1) {
      wordStart.push(previousSpace && k === 0)
    }
    compact += char
    previousSpace = false
  }
  wordStart.push(true)
  return { compact, wordStart }
}

function endBoundaryOk(compact: string, wordStart: boolean[], end: number) {
  if (end >= compact.length || wordStart[end]) return true
  return END_BOUNDARY_CHARS.has(compact[end])
}

/** 형태 맞추기(경계 규칙·사슬 첫머리·품긴 맞춤 버리기). 모호 규칙은 부르는 쪽이 푼다. */
export function findForms(matcher: FormMatcher, normalized: string): FormMatch[] {
  const { compact, wordStart } = compactWithBoundaries(normalized)
  const allowedStart = new Uint8Array(compact.length + 1)
  for (let i = 0; i < compact.length; i += 1) if (wordStart[i]) allowedStart[i] = 1

  // 그 자리에서 다른 형태(2글자 이상)가 온전히 시작하는지(끝 경계 판단용, 한 단계만 본다).
  const startsFullForm = (position: number) => {
    for (const [end, entries] of matcher.prefixMatches(compact, position)) {
      if (end - position < 2) continue
      if (entries.some((entry) => !entry.bothBoundary) || endBoundaryOk(compact, wordStart, end)) return true
    }
    return false
  }

  const raw: FormMatch[] = []
  for (let start = 0; start < compact.length; start += 1) {
    if (!allowedStart[start]) continue
    for (const [end, entries] of matcher.prefixMatches(compact, start)) {
      for (const entry of entries) {
        if (entry.bothBoundary && !endBoundaryOk(compact, wordStart, end) && !startsFullForm(end)) continue
        raw.push({ owner: entry.owner, form: entry.form, start, end, rule: entry.rule })
        allowedStart[end] = 1
      }
    }
  }
  return dropContained(raw)
}

/**
 * 품긴 맞춤 버리기: 다른 맞춤이 더 길게 완전히 품으면 버린다(같은 자리 맞춤끼리는 둘 다 남긴다).
 * 시작 오름차순·끝 내림차순으로 훑으며 앞 맞춤들의 가장 먼 끝을 들고 간다(O(m log m)).
 */
function dropContained(matches: FormMatch[]) {
  const order = matches
    .map((match, position) => ({ match, position }))
    .sort((a, b) => a.match.start - b.match.start || b.match.end - a.match.end || a.position - b.position)
  const keep = new Uint8Array(matches.length)
  let maxEnd = -1
  let startAtMaxEnd = -1
  for (const { match, position } of order) {
    const contained = maxEnd > match.end || (maxEnd === match.end && startAtMaxEnd < match.start)
    if (!contained) keep[position] = 1
    if (match.end > maxEnd) {
      maxEnd = match.end
      startAtMaxEnd = match.start
    }
  }
  return matches.filter((_, position) => keep[position] === 1)
}

// ─── 개념 사전 ───────────────────────────────────────────────────────────

export interface CompiledConcept {
  id: string
  kind: ConceptKind
  generic: boolean
  parents: string[]
  /** 상위 개념 전부(자기 자신 제외). */
  ancestors: string[]
}

export interface CompiledLexicon {
  concepts: Map<string, CompiledConcept>
  matcher: FormMatcher
}

function formText(form: LexiconForm) {
  return typeof form === "string" ? form : form.form
}

/** 형태 → 맞추기 글(정규화 + 공백 지움). */
export function compactForm(form: string) {
  return normalizeText(form).replace(/\s+/g, "")
}

function isBothBoundary(form: LexiconForm, compact: string) {
  // V-6: 3글자 이하 형태는 boundary:"both" 로 적어야 한다. 빠뜨렸어도 런타임은 끝 경계를 요구한다.
  return compact.length <= SHORT_FORM_MAX || (typeof form !== "string" && form.boundary === "both")
}

function ancestorsOf(id: string, parentsById: Map<string, string[]>) {
  const out: string[] = []
  const seen = new Set<string>([id])
  const queue = [...(parentsById.get(id) ?? [])]
  while (queue.length > 0) {
    const next = queue.shift()!
    if (seen.has(next)) continue
    seen.add(next)
    out.push(next)
    queue.push(...(parentsById.get(next) ?? []))
  }
  return out
}

export function compileLexicon(concepts: readonly LexiconConcept[]): CompiledLexicon {
  const parentsById = new Map(concepts.map((concept) => [concept.id, concept.parents ?? []]))
  const compiled = new Map<string, CompiledConcept>()
  const entries: FormEntry[] = []
  for (const concept of concepts) {
    if (!concept || typeof concept.id !== "string" || compiled.has(concept.id)) continue
    compiled.set(concept.id, {
      id: concept.id,
      kind: concept.kind,
      generic: Boolean(concept.generic),
      parents: concept.parents ?? [],
      ancestors: ancestorsOf(concept.id, parentsById),
    })
    const rules = new Map((concept.ambiguous ?? []).map((rule) => [compactForm(rule.form), rule]))
    for (const form of [...(concept.doc ?? []), ...(concept.visitor ?? [])]) {
      const text = formText(form)
      if (typeof text !== "string") continue
      const compact = compactForm(text)
      if (!compact) continue
      entries.push({ owner: concept.id, form: text, compact, bothBoundary: isBothBoundary(form, compact), rule: rules.get(compact) ?? null })
    }
    // 모호 규칙에만 있고 형태 목록에 없는 형태도 맞춘다(규칙을 지켜야만 붙는다).
    for (const [compact, rule] of rules) {
      if (entries.some((entry) => entry.owner === concept.id && entry.compact === compact)) continue
      entries.push({ owner: concept.id, form: rule.form, compact, bothBoundary: compact.length <= SHORT_FORM_MAX, rule })
    }
  }
  return { concepts: compiled, matcher: new FormMatcher(entries) }
}

export interface ConceptMatch {
  id: string
  form: string
  start: number
  end: number
  /** 모호 규칙으로 붙은 맞춤. */
  ambiguous: boolean
}

/**
 * 정규화한 글(normalizeText 결과, 꼬리 포함)에서 개념을 찾는다. 위치 순, 같은 위치면 id 순.
 * 모호 규칙: 그 맞춤과 겹치지 않는 '규칙 없는 맞춤'의 개념과 그 상위 개념을 문맥으로 본다.
 */
export function matchConcepts(normalized: string, lexicon: CompiledLexicon): ConceptMatch[] {
  if (lexicon.matcher.size === 0 || !normalized) return []
  const forms = findForms(lexicon.matcher, normalized)
  const plain = forms.filter((match) => !match.rule)
  const out: ConceptMatch[] = plain.map((match) => ({ id: match.owner, form: match.form, start: match.start, end: match.end, ambiguous: false }))
  for (const match of forms) {
    if (!match.rule) continue
    const context = new Set<string>()
    for (const other of plain) {
      if (other.end <= match.start || other.start >= match.end) {
        context.add(other.owner)
        for (const ancestor of lexicon.concepts.get(other.owner)?.ancestors ?? []) context.add(ancestor)
      }
    }
    const { requiresAny, notWith } = match.rule
    if (requiresAny && requiresAny.length > 0 && !requiresAny.some((id) => context.has(id))) continue
    if (notWith && notWith.some((id) => context.has(id))) continue
    out.push({ id: match.owner, form: match.form, start: match.start, end: match.end, ambiguous: true })
  }
  out.sort((a, b) => a.start - b.start || a.end - b.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  return out.filter((match, index) => index === 0 || match.id !== out[index - 1].id || match.start !== out[index - 1].start)
}

/** 맞춤의 개념 id(중복 없이, 처음 나온 순서). */
export function conceptIdsOf(matches: readonly ConceptMatch[]) {
  return Array.from(new Set(matches.map((match) => match.id)))
}

// ─── 문서에 없는 개념 ────────────────────────────────────────────────────

export interface CompiledAbsent {
  byId: Map<string, AbsentConcept>
  matcher: FormMatcher
}

export interface AbsentMatch {
  id: string
  form: string
  start: number
  end: number
}

export function compileAbsent(items: readonly AbsentConcept[]): CompiledAbsent {
  const byId = new Map<string, AbsentConcept>()
  const entries: FormEntry[] = []
  for (const item of items) {
    if (!item || typeof item.id !== "string" || byId.has(item.id)) continue
    byId.set(item.id, item)
    for (const form of item.forms ?? []) {
      if (typeof form !== "string") continue
      const compact = compactForm(form)
      if (!compact) continue
      entries.push({ owner: item.id, form, compact, bothBoundary: compact.length <= SHORT_FORM_MAX, rule: null })
    }
  }
  return { byId, matcher: new FormMatcher(entries) }
}

/**
 * 관형형 끝(R2 B2): 형태 바로 뒤에 붙어 그 낱말을 끝내는 '한·인·된·할·하는·되는·적인·스러운'(수상한 결제·채용한 강사·베타인 기능).
 * 끝 경계 글자 표(END_BOUNDARY_CHARS)는 '한'을 조사·어미 첫 글자로 보아 짧은 형태를 맞추지만, 낱말이 거기서 끝나면 그 형태는 뒤 명사를
 * 꾸미는 말이지 묻는 대상이 아니다. 없는 개념(absent) 맞춤에만 쓴다(개념 사전은 '확인한 결과'의 '확인'처럼 붙어야 한다).
 */
const ADJECTIVAL_ENDINGS = ["스러운", "적인", "하는", "되는", "한", "인", "된", "할"]

export function adjectivalEndingAt(compact: string, wordStart: readonly boolean[], end: number): string | null {
  if (end >= compact.length || wordStart[end]) return null
  for (const ending of ADJECTIVAL_ENDINGS) {
    const stop = end + ending.length
    if (compact.startsWith(ending, end) && (stop >= compact.length || wordStart[stop])) return ending
  }
  return null
}

/** 없는 개념 맞춤(위치 순). 관형형 끝이 붙은 맞춤(adjectivalEndingAt)은 버린다. */
export function matchAbsent(normalized: string, absent: CompiledAbsent): AbsentMatch[] {
  if (absent.matcher.size === 0 || !normalized) return []
  const { compact, wordStart } = compactWithBoundaries(normalized)
  return findForms(absent.matcher, normalized)
    .filter((match) => adjectivalEndingAt(compact, wordStart, match.end) === null)
    .map((match) => ({ id: match.owner, form: match.form, start: match.start, end: match.end }))
    .sort((a, b) => a.start - b.start || b.end - a.end || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}
