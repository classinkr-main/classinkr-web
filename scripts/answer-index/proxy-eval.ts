/**
 * 빠른 대리 점수(답 색인 사양 §2.4 끝, §4.2 eval/answer-keys). 공식 판단에는 쓰지 않는다.
 *
 * 실행:
 *   npx tsx scripts/answer-index/proxy-eval.ts --results <측정.jsonl> --keys <answer-keys.json>
 *     [--units data/answer-index/units.json] [--inventory data/answer-index/inventory.json] [--cards data/answer-index/cards]
 *     [--area <영역,…>] [--top1] [--out <줄별 판정.json>] [--json]
 *
 * 측정 결과(scripts/chatbot-live-eval.ts 의 JSONL) 한 줄마다 '이 답이 무엇으로 답했는가'를 id 목록으로 바꾸고,
 * 정답 키(accept·partialAccept·nodoc·clarifyOk)와 대조해 §2.1 분류 하나를 결정적으로 붙인다. 점수 식·구간은 score.ts 와 같다.
 *
 * id 는 §4.2 형식 그대로다: 옛 답 id(basics:·field:·svc:·symptom:·guide:, inventory 가 정함)와 문서 단위 id(unit:<unitId>).
 * - legacy 줄(답 색인이 정하지 않은 줄): decidedBy 를 아래 LEGACY_DECIDED_BY_RULES 로 바꾼다. 규칙이 id 를 못 내면
 *   inventory 의 답 글 첫 문단이 답 글에 들어 있는지로 찾는다(svc:* 처럼 decidedBy 에 id 가 없는 답).
 *   출처(경로·절 제목)는 units.json 으로 unit:<unitId> 로 바꾼다: 근거 선별 답(evidence_select·generate·gate_evidence_select·
 *   second_chance)은 출처 전부, 첫 출처로 만든 답(draft·template:*)은 첫 출처만. 정해 둔 답에 붙은 출처는 쓰지 않는다.
 * - compiled 줄(decidedBy index:*): 고른 카드(answerIndex.cardId 또는 top[0].id, 일부만 답한 조각의 카드 포함)의
 *   provenance.legacyIds, answer.sentences[].unit(→ unit:<unit>), 그리고 보조로 answer.curatedRef(module:id),
 *   answer.symptomTopic(symptom:<id>), answer.guide(guide:<slug>·unit:guide:<slug>)를 쓴다. index-gap·index-abstain 은 못 찾음,
 *   index-clarify 는 되묻기다.
 *
 * 판정(키가 있는 줄만):
 * - 못 찾음: nodoc 이면 nf_ok, 아니면 nf_doc_has
 * - 되묻기: clarifyOk 면 good, 아니면 needless_clarify
 * - 답: id 가 reject 에 있으면 accept 보다 앞서 wrong, accept 에 있으면 good, partialAccept 에 있으면 partial, 아니면 wrong
 *   (id 를 하나도 못 만들었으면 unmapped 표시). siteAccept(공개 페이지 근거로만 맞는 답)는 이 계산에 쓰지 않는다.
 *
 * --area <영역,…>: 키의 area 가 그 영역인 줄만 센다(키가 없거나 area 가 없는 줄은 뺀다).
 * --top1: compiled 줄(색인이 정한 줄)에서 결정과 무관하게 흔적 1위 카드(top 의 첫 카드, 'none' 자리는 건너뜀)가 accept 에 드는 비율
 *   (accept 가 있는 키만, reject 에 걸리면 넣지 않음)과, nodoc 키인데 답해 버린 비율(못 찾음·공백이 아닌 답)을 더 찍는다.
 */

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"

import { ANSWER_INDEX_AREAS, isAnswerIndexArea, type AnswerIndexArea, type AnswerKey as IndexAnswerKey } from "@/lib/chatbot/answer-index/types"
import { decidedByFromAnswerIndex, segmentCard, segmentDecision } from "../lib/chatbot-live-eval-checks"
import { round2, summarizeVerdicts, type ScoreSummary, type Verdict } from "./score"

// ── 입력 꼴 ─────────────────────────────────────────────────────────────────────────────────────

/** 정답 키(lib/chatbot/answer-index/types.ts AnswerKey). 대리 점수는 accept 가 없어도 받는다. */
export type AnswerKey = Omit<IndexAnswerKey, "accept"> & { accept?: string[] }

export interface EvalRowSource {
  path?: string | null
  heading?: string | null
  title?: string | null
}

/** scripts/chatbot-live-eval.ts 결과 줄 가운데 대리 점수가 읽는 필드. */
export interface ProxyEvalRow {
  id: string
  router?: string
  answer: string | null
  answerMode?: string | null
  unresolved?: boolean | null
  sources?: EvalRowSource[]
  decidedBy: string
  gateOriginal?: string | null
  answerIndex?: unknown
}

export interface UnitRecord {
  unitId: string
  kind?: string
  path?: string | null
  heading?: string | null
}

export interface InventoryRecord {
  /** 옛 답 id(basics:·field:·svc:·symptom:·guide: …). */
  id: string
  /** 답 글. 첫 문단으로 측정 답 글과 맞춘다. */
  text: string
  /** 질문에 따라 바뀌는 문단·갈래 글(inventory 의 textAlternatives). 각 첫 문단도 대조한다. */
  alternatives?: string[]
  /** 지금 관문에 넘기는 출처 이름(측정 결과 줄의 decidedBy·gateOriginal 과 같은 문자열). */
  gateOriginal?: string | null
}

export interface CardRecord {
  id: string
  kind?: string
  answer?: {
    sentences?: Array<{ unit?: string }>
    curatedRef?: { module?: string; id?: string }
    symptomTopic?: string
    guide?: string
  }
  provenance?: { legacyIds?: string[] }
}

// ── legacy decidedBy → inventory id 규칙(README 에 같은 표가 있다) ──────────────────────────────────

/** 못 찾음으로 보는 legacy decidedBy. */
export const LEGACY_NOT_FOUND_DECIDED_BY: ReadonlySet<string> = new Set(["not_found", "gate_not_found", "model_unavailable"])

/** 근거 선별이 고른 문서 문장으로 답한 legacy decidedBy. 출처(쓴 근거) 전부를 unit:<unitId> 로 바꿔 대조한다. */
export const LEGACY_SELECTED_EVIDENCE_DECIDED_BY: ReadonlySet<string> = new Set([
  "evidence_select",
  "generate",
  "gate_evidence_select",
  "second_chance",
])

/** 첫 출처 한 곳으로 만든 legacy 답(검색 조각 초안). 첫 출처만 unit:<unitId> 로 바꾼다. */
export const LEGACY_TOP_SOURCE_DECIDED_BY: ReadonlySet<string> = new Set(["draft"])

export interface LegacyIdRule {
  /** decidedBy 에 맞추는 정규식. */
  pattern: RegExp
  /** 맞으면 낼 inventory id. null 이면 이 규칙으로는 id 를 정하지 않는다(inventory 답 글 대조로 넘김). */
  toId: (match: RegExpMatchArray, row: ProxyEvalRow) => string | null
  /** 첫 출처의 unit:<unitId> 도 더하는지(첫 출처 절로 만든 틀 답). */
  withTopSource?: boolean
  note: string
}

const symptomFromGateOriginal = (row: ProxyEvalRow) => {
  const original = row.gateOriginal ?? ""
  return /^symptom:(.+)$/.test(original) && original !== "symptom:triage" ? original : null
}

export const LEGACY_DECIDED_BY_RULES: readonly LegacyIdRule[] = [
  { pattern: /^(field|basics):(.+)$/, toId: (m) => `${m[1]}:${m[2]}`, note: "field:<id>·basics:<id> 그대로" },
  {
    pattern: /^guide:(.+)$/,
    toId: (m) => `guide:${m[1]}`,
    withTopSource: true,
    note: "CS 화면 가이드 답: guide:<slug> 그대로 + 첫 출처(가이드 단위 unit:guide:<slug>)",
  },
  { pattern: /^self:(.+)$/, toId: (m) => `self:${m[1]}`, note: "챗봇 자기소개 답: self:<key> 그대로" },
  {
    pattern: /^template:(.+)$/,
    toId: (m) => `template:${m[1]}`,
    withTopSource: true,
    note: "분류별·제목 틀 답: template:<이름> 그대로 + 첫 출처(틀을 고른 절)의 unit",
  },
  {
    pattern: /^symptom(?::(.+))?$/,
    toId: (m, row) => (m[1] && m[1] !== "triage" ? `symptom:${m[1]}` : symptomFromGateOriginal(row)),
    note: "증상 안내: decidedBy 는 symptom 뿐이라 gateOriginal 의 symptom:<topicId> 를 쓴다(symptom:triage 는 id 없음)",
  },
  {
    pattern: /^(?:service|policy(?::.+)?|handoff(?::.+)?|unknown)$/,
    toId: () => null,
    note: "service.ts 정해 둔 답·정책 답·상담 연결: decidedBy 에 id 가 없어 inventory 답 글 첫 문단으로 찾는다(svc:* 등)",
  },
]

// ── 정규화·색인 ─────────────────────────────────────────────────────────────────────────────────

const collapse = (text: string) => text.normalize("NFC").replace(/\s+/g, " ").trim()

/** 절 제목 비교용: 공백 접기, 앞 번호(1. 1) ①) 떼기. */
export function normalizeHeading(heading: string | null | undefined): string {
  return collapse(heading ?? "")
    .replace(/^(?:\d+\s*[.)]|[①-⑳])\s*/, "")
    .toLowerCase()
}

export function normalizeDocPath(path: string | null | undefined): string {
  return (path ?? "").split(/[?#]/)[0].replace(/\/+$/, "")
}

const SUMMARY_HEADING = "요약"

export interface UnitIndex {
  lookup(source: EvalRowSource): string | null
  size: number
}

/** 출처(경로 + 절 제목) → unitId. 요약 단위(kind=summary 또는 제목 없음)는 '요약' 출처와 맞춘다. */
export function buildUnitIndex(units: readonly UnitRecord[]): UnitIndex {
  const map = new Map<string, string>()
  const put = (key: string, unitId: string) => {
    if (!map.has(key)) map.set(key, unitId)
  }
  for (const unit of units) {
    const path = normalizeDocPath(unit.path)
    if (!path || !unit.unitId) continue
    const isSummary = unit.kind === "summary" || !unit.heading
    if (unit.heading) put(`${path}#${normalizeHeading(unit.heading)}`, unit.unitId)
    if (isSummary) put(`${path}#${normalizeHeading(SUMMARY_HEADING)}`, unit.unitId)
  }
  return {
    size: map.size,
    lookup(source) {
      const path = normalizeDocPath(source.path)
      if (!path) return null
      return map.get(`${path}#${normalizeHeading(source.heading || SUMMARY_HEADING)}`) ?? null
    },
  }
}

const MIN_INVENTORY_HEAD_CHARS = 12

const firstParagraph = (text: string) =>
  collapse(
    text
      .split(/\n\s*\n/)
      .map((part) => part.trim())
      .find(Boolean) ?? ""
  )

export interface InventoryIndex {
  /** 답 글에 첫 문단이 들어 있는 inventory id(가장 긴 첫 문단과 같은 길이의 것 모두). */
  match(answer: string): string[]
  /** 그 id 가 inventory 에 있는지. */
  has(id: string): boolean
  /** 관문 출처 이름이 이것인 inventory id(여럿일 수 있다. service 는 31개가 같은 이름을 쓴다). */
  byGateOriginal(name: string): string[]
  size: number
}

// inventory 답 글의 자리표시({SHOWROOM_MIN_LEAD_BUSINESS_DAYS} 등). 실제 답에는 값이 들어가므로 자리표시 사이 글만 순서대로 맞춘다.
const PLACEHOLDER_RE = /\{[A-Za-z0-9_]+\}/

/** 첫 문단을 자리표시로 나눈 글 조각들이 답 글에 순서대로 모두 있는지. */
function containsInOrder(text: string, pieces: readonly string[]) {
  let from = 0
  for (const piece of pieces) {
    const at = text.indexOf(piece, from)
    if (at === -1) return false
    from = at + piece.length
  }
  return true
}

export function buildInventoryIndex(records: readonly InventoryRecord[]): InventoryIndex {
  const heads = records
    .flatMap((record) => [record.text, ...(record.alternatives ?? [])].map((text) => ({ id: record.id, head: firstParagraph(text) })))
    .map((entry) => {
      const pieces = entry.head
        .split(PLACEHOLDER_RE)
        .map((piece) => piece.trim())
        .filter(Boolean)
      return { ...entry, pieces, literal: pieces.reduce((sum, piece) => sum + piece.length, 0) }
    })
    .filter((entry) => entry.id && entry.literal >= MIN_INVENTORY_HEAD_CHARS)
  const ids = new Set(records.map((record) => record.id))
  const byGate = new Map<string, string[]>()
  for (const record of records) {
    if (!record.gateOriginal) continue
    byGate.set(record.gateOriginal, [...(byGate.get(record.gateOriginal) ?? []), record.id])
  }
  return {
    size: ids.size,
    has: (id) => ids.has(id),
    byGateOriginal: (name) => byGate.get(name) ?? [],
    match(answer) {
      const text = collapse(answer)
      let best = 0
      let ids: string[] = []
      for (const entry of heads) {
        if (entry.literal < best || !containsInOrder(text, entry.pieces)) continue
        if (entry.literal > best) {
          best = entry.literal
          ids = []
        }
        if (!ids.includes(entry.id)) ids.push(entry.id)
      }
      return ids
    },
  }
}

// ── 줄 분류 ───────────────────────────────────────────────────────────────────────────────────

export type ProxyAnswerKind = "answer" | "not_found" | "clarify" | "error"

export interface ProxyRowResult {
  id: string
  router: string
  /** legacy: 기존 판별, compiled: 답 색인이 정한 줄. */
  route: "legacy" | "compiled"
  decidedBy: string
  kind: ProxyAnswerKind
  /** 이 답을 나타내는 id(옛 답 id·unit:). */
  ids: string[]
  /** 정답 키와 겹친 id(reject 로 wrong 이면 reject 와 겹친 id). */
  matched: string[]
  /** reject 와 겹쳐 wrong 으로 센 id(없으면 빈 배열). */
  rejected?: string[]
  /** id 를 하나도 못 만든 답(대리 점수의 사각지대). */
  unmapped: boolean
  /** 키가 없으면 null(점수에서 뺌). */
  verdict: Verdict | null
  reason: string
}

export interface ProxyContext {
  units?: UnitIndex
  inventory?: InventoryIndex
  cards?: ReadonlyMap<string, CardRecord>
}

const MODULE_PREFIX: Readonly<Record<string, string>> = {
  basics: "basics",
  field: "field",
  service: "svc",
  svc: "svc",
  self: "self",
  symptom: "symptom",
  guide: "guide",
  template: "template",
}

/** compiled 카드 하나 → id 목록. */
export function idsFromCard(card: CardRecord): string[] {
  const ids: string[] = [...(card.provenance?.legacyIds ?? [])]
  for (const sentence of card.answer?.sentences ?? []) {
    if (sentence.unit) ids.push(`unit:${sentence.unit}`)
  }
  const ref = card.answer?.curatedRef
  if (ref?.module && ref.id) {
    const prefix = MODULE_PREFIX[ref.module] ?? ref.module
    ids.push(ref.id.startsWith(`${prefix}:`) ? ref.id : `${prefix}:${ref.id}`)
  }
  if (card.answer?.symptomTopic) ids.push(`symptom:${card.answer.symptomTopic}`)
  if (card.answer?.guide) ids.push(`guide:${card.answer.guide}`, `unit:guide:${card.answer.guide}`)
  return Array.from(new Set(ids))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** compiled 답에 쓰인 카드 id: 고른 카드와, 조각이 둘 이상이면 답한 조각의 카드. */
export function answeredCardIds(row: ProxyEvalRow, decidedBy: string): string[] {
  const ids: string[] = []
  const head = decidedBy.match(/^index(?:-partial)?:(.+)$/)?.[1]
  if (head && head !== "unknown") ids.push(head)
  const trace = isRecord(row.answerIndex) ? row.answerIndex : null
  const segments = trace && Array.isArray(trace.segments) ? trace.segments.filter(isRecord) : []
  for (const segment of segments) {
    if (segmentDecision(segment) !== "answer") continue
    const id = segmentCard(segment)
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/** legacy 줄 → id 목록. */
function sourceUnitIds(sources: readonly EvalRowSource[], context: ProxyContext): string[] {
  if (!context.units) return []
  const ids = sources.map((source) => context.units?.lookup(source)).filter((id): id is string => Boolean(id))
  return Array.from(new Set(ids.map((id) => `unit:${id}`)))
}

export function legacyIds(row: ProxyEvalRow, context: ProxyContext): string[] {
  const decidedBy = row.decidedBy ?? ""
  const sources = row.sources ?? []
  if (LEGACY_SELECTED_EVIDENCE_DECIDED_BY.has(decidedBy)) return sourceUnitIds(sources, context)
  if (LEGACY_TOP_SOURCE_DECIDED_BY.has(decidedBy)) return sourceUnitIds(sources.slice(0, 1), context)
  const inventory = context.inventory
  const textMatch = () => (inventory && row.answer ? inventory.match(row.answer) : [])
  for (const rule of LEGACY_DECIDED_BY_RULES) {
    const match = decidedBy.match(rule.pattern)
    if (!match) continue
    const id = rule.toId(match, row)
    if (!id) break
    const ids = [id, ...(rule.withTopSource ? sourceUnitIds(sources.slice(0, 1), context) : [])]
    // inventory 가 다른 이름으로 적은 답(함수로 만드는 틀 답 template:<경로>#<함수> 등)은 답 글로도 찾는다.
    if (inventory && !inventory.has(id)) ids.push(...textMatch())
    return Array.from(new Set(ids))
  }
  // id 가 없는 decidedBy: 관문 출처 이름이 한 답에만 쓰이면 그 답(policy:academy-payment → svc:…), 아니면 답 글 대조.
  const byGate = inventory?.byGateOriginal(decidedBy) ?? []
  return byGate.length === 1 ? byGate : textMatch()
}

/**
 * legacy 줄이 못 찾음 답인지. router 필드가 없는 예전 결과 파일은 출처 없는 못 찾음(NO_SOURCE_FACT_ANSWER)을 policy·unknown 으로
 * 적었으므로, 그 두 값이면서 answerMode 가 doc_suggestion·fallback 이고 unresolved 이고 출처가 없으면 못 찾음으로 본다.
 */
export function isLegacyNotFound(row: ProxyEvalRow): boolean {
  if (LEGACY_NOT_FOUND_DECIDED_BY.has(row.decidedBy)) return true
  return (
    row.router === undefined &&
    (row.decidedBy === "policy" || row.decidedBy === "unknown") &&
    (row.answerMode === "doc_suggestion" || row.answerMode === "fallback") &&
    row.unresolved === true &&
    (row.sources ?? []).length === 0
  )
}

export function classifyRow(row: ProxyEvalRow, key: AnswerKey | undefined, context: ProxyContext = {}): ProxyRowResult {
  const indexDecision = row.answerIndex !== undefined ? decidedByFromAnswerIndex(row.answerIndex) : null
  const decidedBy = indexDecision ?? row.decidedBy ?? "unknown"
  const route: ProxyRowResult["route"] = decidedBy.startsWith("index") ? "compiled" : "legacy"
  let kind: ProxyAnswerKind
  let ids: string[] = []
  let reason: string

  if (row.answer === null || row.answer === undefined) {
    kind = "error"
    reason = "측정 오류(답 없음)"
  } else if (route === "compiled") {
    if (decidedBy.startsWith("index-gap") || decidedBy === "index-abstain") {
      kind = "not_found"
      reason = decidedBy
    } else if (decidedBy === "index-clarify") {
      kind = "clarify"
      reason = decidedBy
    } else {
      kind = "answer"
      const cardIds = answeredCardIds(row, decidedBy)
      const found = cardIds.map((id) => context.cards?.get(id)).filter((card): card is CardRecord => Boolean(card))
      const missing = cardIds.filter((id) => !context.cards?.has(id))
      ids = Array.from(new Set(found.flatMap(idsFromCard)))
      reason = missing.length > 0 ? `카드 자료에 없는 id: ${missing.join(", ")}` : `카드 ${cardIds.join(", ")}`
    }
  } else if (isLegacyNotFound(row)) {
    kind = "not_found"
    reason = row.decidedBy
  } else if (row.answerMode === "clarifying_question") {
    kind = "clarify"
    reason = row.decidedBy
  } else {
    kind = "answer"
    ids = legacyIds(row, context)
    reason = row.decidedBy
  }

  const base = {
    id: row.id,
    router: row.router ?? "legacy",
    route,
    decidedBy,
    kind,
    ids,
    unmapped: kind === "answer" && ids.length === 0,
  }
  if (!key) return { ...base, matched: [], verdict: null, reason: `${reason} / 정답 키 없음` }

  const accept = new Set(key.accept ?? [])
  const partialAccept = new Set(key.partialAccept ?? [])
  const reject = new Set(key.reject ?? [])
  if (kind === "error") return { ...base, matched: [], verdict: "wrong", reason }
  if (kind === "not_found") return { ...base, matched: [], verdict: key.nodoc ? "nf_ok" : "nf_doc_has", reason }
  if (kind === "clarify") return { ...base, matched: [], verdict: key.clarifyOk ? "good" : "needless_clarify", reason }
  // reject 는 accept 보다 앞선다: 같은 답이 accept 대상 문장도 쓰지만 심사 범위 밖 사실을 단정하는 경우 등.
  const rejected = ids.filter((id) => reject.has(id))
  if (rejected.length > 0) return { ...base, matched: rejected, rejected, verdict: "wrong", reason: `${reason} / reject: ${rejected.join(", ")}` }
  const matched = ids.filter((id) => accept.has(id))
  if (matched.length > 0) return { ...base, matched, verdict: "good", reason }
  const partial = ids.filter((id) => partialAccept.has(id))
  if (partial.length > 0) return { ...base, matched: partial, verdict: "partial", reason }
  return { ...base, matched: [], verdict: "wrong", reason: base.unmapped ? `${reason} / id 를 못 만듦` : reason }
}

export interface ProxySummary extends ScoreSummary {
  rows: number
  missingKey: number
  keysWithoutRow: number
  unmapped: number
  byRoute: Partial<Record<ProxyRowResult["route"], ScoreSummary>>
}

export function summarizeProxy(results: readonly ProxyRowResult[], keyCount: number): ProxySummary {
  const keyed = results.filter((result): result is ProxyRowResult & { verdict: Verdict } => result.verdict !== null)
  const byRoute: ProxySummary["byRoute"] = {}
  for (const route of ["legacy", "compiled"] as const) {
    const verdicts = keyed.filter((result) => result.route === route).map((result) => result.verdict)
    if (verdicts.length > 0) byRoute[route] = summarizeVerdicts(verdicts)
  }
  return {
    ...summarizeVerdicts(keyed.map((result) => result.verdict)),
    rows: results.length,
    missingKey: results.length - keyed.length,
    keysWithoutRow: Math.max(0, keyCount - keyed.length),
    unmapped: keyed.filter((result) => result.unmapped).length,
    byRoute,
  }
}

// ── 파일 읽기 ─────────────────────────────────────────────────────────────────────────────────

export function readAnswerKeys(raw: unknown): { set: string | null; keys: AnswerKey[] } {
  const container = raw as { set?: unknown; keys?: unknown } | null
  const list = Array.isArray(raw) ? raw : container?.keys
  if (!Array.isArray(list)) throw new Error("정답 키 파일에 keys 배열이 없습니다.")
  const keys = list.map((item, index) => {
    const key = (isRecord(item) ? item : {}) as Record<string, unknown>
    if (typeof key.id !== "string" || !key.id) throw new Error(`정답 키 ${index + 1}번째에 id 가 없습니다.`)
    const strings = (value: unknown) => (Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [])
    const out: AnswerKey = {
      id: key.id,
      accept: strings(key.accept),
      partialAccept: strings(key.partialAccept),
      nodoc: key.nodoc === true,
      clarifyOk: key.clarifyOk === true,
    }
    // 선택 칸은 있을 때만 싣는다.
    if (Array.isArray(key.reject)) out.reject = strings(key.reject)
    if (Array.isArray(key.siteAccept)) out.siteAccept = strings(key.siteAccept)
    if (Array.isArray(key.searched)) out.searched = strings(key.searched)
    if (isAnswerIndexArea(key.area)) out.area = key.area
    if (typeof key.areaFrom === "string") out.areaFrom = key.areaFrom
    if (key.evidenceScope === "docs" || key.evidenceScope === "site") out.evidenceScope = key.evidenceScope
    if (typeof key.note === "string") out.note = key.note
    if (typeof key.keyGroup === "string") out.keyGroup = key.keyGroup
    return out
  })
  return { set: typeof container?.set === "string" ? container.set : null, keys }
}

// ── 영역 거름(--area) ──────────────────────────────────────────────────────────────────────────

/** "pricing,company" → 영역 목록. 모르는 영역이 있으면 예외. */
export function parseAreaFilter(value: string): AnswerIndexArea[] {
  const areas = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
  const unknown = areas.filter((area) => !isAnswerIndexArea(area))
  if (areas.length === 0 || unknown.length > 0) {
    throw new Error(`--area 는 영역(${ANSWER_INDEX_AREAS.join("·")})을 쉼표로 잇습니다: ${unknown.join(", ") || value}`)
  }
  return areas as AnswerIndexArea[]
}

/** 키의 area 가 그 영역인 줄만 남긴다(키가 없거나 area 가 없는 줄은 뺀다). 키도 같은 기준으로 거른다. */
export function filterByArea<T extends { id: string }>(items: readonly T[], keyById: ReadonlyMap<string, AnswerKey>, areas: readonly AnswerIndexArea[]) {
  const wanted = new Set<string>(areas)
  return items.filter((item) => {
    const area = keyById.get(item.id)?.area
    return area !== undefined && wanted.has(area)
  })
}

// ── 흔적 1위 카드(--top1) ──────────────────────────────────────────────────────────────────────

export interface Top1Summary {
  /** 키가 있는 compiled 줄(색인이 정한 줄). */
  compiledRows: number
  /** 그 가운데 accept 가 있는 키의 줄(1위 정답률 분모). */
  acceptRows: number
  /** 흔적 1위 카드의 id 가 accept 에 드는 줄(reject 에 걸리면 넣지 않음). */
  top1Accept: number
  /** accept 는 아니고 partialAccept 에 드는 줄. */
  top1Partial: number
  /** 1위 카드가 reject 에 걸린 줄. */
  top1Rejected: number
  /** 1위 카드가 없거나 카드 자료에 없어 id 를 못 만든 줄(accept 키 줄 가운데). */
  top1Unmapped: number
  /** nodoc 키 compiled 줄. */
  nodocRows: number
  /** nodoc 키인데 답한 줄(못 찾음·공백·되묻기가 아님). */
  nodocAnswered: number
}

/** 흔적 top 에서 첫 카드 id('none' 자리는 건너뜀). */
export function traceTop1CardId(answerIndex: unknown): string | null {
  if (!isRecord(answerIndex) || !Array.isArray(answerIndex.top)) return null
  for (const candidate of answerIndex.top) {
    const id = isRecord(candidate) && typeof candidate.id === "string" ? candidate.id : null
    if (id && id !== "none") return id
  }
  return null
}

export function summarizeTop1(
  rows: readonly ProxyEvalRow[],
  results: readonly ProxyRowResult[],
  keyById: ReadonlyMap<string, AnswerKey>,
  context: ProxyContext = {}
): Top1Summary {
  const summary: Top1Summary = { compiledRows: 0, acceptRows: 0, top1Accept: 0, top1Partial: 0, top1Rejected: 0, top1Unmapped: 0, nodocRows: 0, nodocAnswered: 0 }
  const rowById = new Map(rows.map((row) => [row.id, row]))
  for (const result of results) {
    const key = keyById.get(result.id)
    if (!key || result.route !== "compiled") continue
    summary.compiledRows += 1
    if (key.nodoc) {
      summary.nodocRows += 1
      if (result.kind === "answer") summary.nodocAnswered += 1
    }
    const accept = new Set(key.accept ?? [])
    if (accept.size === 0) continue
    summary.acceptRows += 1
    const cardId = traceTop1CardId(rowById.get(result.id)?.answerIndex)
    const card = cardId ? context.cards?.get(cardId) : undefined
    const ids = card ? idsFromCard(card) : []
    if (ids.length === 0) {
      summary.top1Unmapped += 1
      continue
    }
    if (ids.some((id) => (key.reject ?? []).includes(id))) summary.top1Rejected += 1
    else if (ids.some((id) => accept.has(id))) summary.top1Accept += 1
    else if (ids.some((id) => (key.partialAccept ?? []).includes(id))) summary.top1Partial += 1
  }
  return summary
}

export function readEvalRows(jsonl: string): ProxyEvalRow[] {
  return jsonl
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      const row = JSON.parse(line) as Partial<ProxyEvalRow>
      if (typeof row.id !== "string") throw new Error(`측정 결과 ${index + 1}번째 줄에 id 가 없습니다.`)
      return { ...row, id: row.id, answer: row.answer ?? null, decidedBy: row.decidedBy ?? "unknown" } as ProxyEvalRow
    })
}

/** units.json({ units: [...] } 또는 배열). */
export function readUnits(raw: unknown): UnitRecord[] {
  const list = Array.isArray(raw) ? raw : (raw as { units?: unknown } | null)?.units
  if (!Array.isArray(list)) throw new Error("units 파일에 units 배열이 없습니다.")
  return list.filter(isRecord).flatMap((unit) =>
    typeof unit.unitId === "string"
      ? [
          {
            unitId: unit.unitId,
            kind: typeof unit.kind === "string" ? unit.kind : undefined,
            path: typeof unit.path === "string" ? unit.path : null,
            heading: typeof unit.heading === "string" ? unit.heading : null,
          },
        ]
      : []
  )
}

/**
 * inventory.json 을 너그럽게 읽는다(I2 가 정하는 꼴): 배열 또는 { answers | items | entries | inventory: [...] },
 * 항목마다 answerId 또는 id, 답 글은 text·answer·answerText(문자열 또는 문단 배열), 있으면 textAlternatives·gateOriginal.
 */
export function readInventory(raw: unknown): InventoryRecord[] {
  const container = isRecord(raw) ? raw : null
  const list = Array.isArray(raw)
    ? raw
    : [container?.answers, container?.items, container?.entries, container?.inventory].find(Array.isArray)
  if (!Array.isArray(list)) throw new Error("inventory 파일에서 답 목록 배열을 찾지 못했습니다.")
  return list.filter(isRecord).flatMap((item) => {
    const id = typeof item.answerId === "string" ? item.answerId : typeof item.id === "string" ? item.id : null
    const value = item.text ?? item.answer ?? item.answerText
    const text = Array.isArray(value) ? value.filter((part) => typeof part === "string").join("\n\n") : value
    if (!id || typeof text !== "string" || !text.trim()) return []
    const alternatives = Array.isArray(item.textAlternatives)
      ? item.textAlternatives.filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      : []
    const gateOriginal = typeof item.gateOriginal === "string" ? item.gateOriginal : null
    return [{ id, text, ...(alternatives.length > 0 ? { alternatives } : {}), ...(gateOriginal ? { gateOriginal } : {}) }]
  })
}

/** cards 폴더의 *.json(카드 배열)을 모두 읽는다. 파일 하나를 줘도 된다. */
export function readCards(path: string): Map<string, CardRecord> {
  const files = statSync(path).isDirectory()
    ? readdirSync(path)
        .filter((name) => name.endsWith(".json"))
        .sort()
        .map((name) => join(path, name))
    : [path]
  const cards = new Map<string, CardRecord>()
  for (const file of files) {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown
    const list = Array.isArray(raw) ? raw : (raw as { cards?: unknown } | null)?.cards
    if (!Array.isArray(list)) continue
    for (const card of list.filter(isRecord)) {
      if (typeof card.id === "string" && !cards.has(card.id)) cards.set(card.id, card as unknown as CardRecord)
    }
  }
  return cards
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────

function argValue(argv: string[], name: string): string | undefined {
  const index = argv.indexOf(name)
  return index !== -1 ? argv[index + 1] : undefined
}

function formatLine(title: string, summary: ScoreSummary) {
  const counts = Object.entries(summary.counts)
    .map(([verdict, count]) => `${verdict} ${count}`)
    .join(" · ")
  return `${title}: ${summary.score.toFixed(1)}점 (90% 구간 ${summary.ci90.low.toFixed(1)}~${summary.ci90.high.toFixed(1)}, ${summary.n}줄) — ${counts}`
}

function main(argv: string[]) {
  const resultsPath = argValue(argv, "--results")
  const keysPath = argValue(argv, "--keys")
  if (!resultsPath || !keysPath) {
    console.error(
      "사용법: npx tsx scripts/answer-index/proxy-eval.ts --results <측정.jsonl> --keys <answer-keys.json> " +
        "[--units data/answer-index/units.json] [--inventory data/answer-index/inventory.json] [--cards data/answer-index/cards] " +
        "[--area <영역,…>] [--top1] [--out <줄별.json>] [--json]"
    )
    process.exit(2)
  }
  const unitsPath = resolve(argValue(argv, "--units") ?? "data/answer-index/units.json")
  const inventoryPath = resolve(argValue(argv, "--inventory") ?? "data/answer-index/inventory.json")
  const cardsPath = resolve(argValue(argv, "--cards") ?? "data/answer-index/cards")

  const allRows = readEvalRows(readFileSync(resolve(resultsPath), "utf8"))
  const { set, keys: allKeys } = readAnswerKeys(JSON.parse(readFileSync(resolve(keysPath), "utf8")))
  const keyById = new Map(allKeys.map((key) => [key.id, key]))
  const areaArg = argValue(argv, "--area")
  const areas = areaArg === undefined ? null : parseAreaFilter(areaArg)
  const rows = areas ? filterByArea(allRows, keyById, areas) : allRows
  const keys = areas ? filterByArea(allKeys, keyById, areas) : allKeys

  const context: ProxyContext = {}
  const notes: string[] = []
  if (existsSync(unitsPath)) context.units = buildUnitIndex(readUnits(JSON.parse(readFileSync(unitsPath, "utf8"))))
  else notes.push(`units 없음(${unitsPath}): 문서 문장 답을 unit id 로 바꾸지 못합니다.`)
  if (existsSync(inventoryPath)) context.inventory = buildInventoryIndex(readInventory(JSON.parse(readFileSync(inventoryPath, "utf8"))))
  else notes.push(`inventory 없음(${inventoryPath}): id 없는 정해 둔 답(svc:* 등)을 찾지 못합니다.`)
  if (existsSync(cardsPath)) context.cards = readCards(cardsPath)
  else if (rows.some((row) => (row.decidedBy ?? "").startsWith("index"))) notes.push(`카드 자료 없음(${cardsPath}): compiled 줄을 대조하지 못합니다.`)
  const withoutRouter = rows.filter((row) => row.router === undefined).length
  if (withoutRouter > 0) notes.push(`router 필드가 없는 예전 결과 줄 ${withoutRouter}개는 legacy 로 봅니다.`)

  if (areas) notes.push(`영역 거름 ${areas.join(",")}: 줄 ${rows.length}/${allRows.length}, 키 ${keys.length}/${allKeys.length}(키에 area 가 없는 줄은 뺌)`)
  const withoutArea = areas ? allKeys.filter((key) => key.area === undefined).length : 0
  if (withoutArea > 0) notes.push(`area 가 없는 키 ${withoutArea}개는 영역 거름에서 빠집니다.`)

  const results = rows.map((row) => classifyRow(row, keyById.get(row.id), context))
  const summary = summarizeProxy(results, keys.length)
  const showTop1 = argv.includes("--top1")
  if (showTop1 && !context.cards) notes.push("카드 자료가 없어 --top1 의 1위 카드를 id 로 바꾸지 못합니다.")
  const top1 = showTop1 ? summarizeTop1(rows, results, keyById, context) : null

  if (argValue(argv, "--out")) {
    writeFileSync(resolve(argValue(argv, "--out") as string), `${JSON.stringify({ set, results: resultsPath, areas, rows: results }, null, 2)}\n`)
  }
  if (argv.includes("--json")) {
    console.log(JSON.stringify({ set, results: resultsPath, keys: keysPath, areas, notes, ...summary, ...(top1 ? { top1 } : {}) }, null, 2))
    return
  }
  for (const note of notes) console.error(`참고: ${note}`)
  console.log(formatLine(`대리 점수${set ? `(${set})` : ""}${areas ? ` [${areas.join(",")}]` : ""}`, summary))
  for (const [route, routeSummary] of Object.entries(summary.byRoute)) {
    if (routeSummary) console.log(formatLine(`  ${route}`, routeSummary))
  }
  console.log(
    `줄 ${summary.rows} · 키 없는 줄 ${summary.missingKey} · 줄 없는 키 ${summary.keysWithoutRow} · id 를 못 만든 답 ${summary.unmapped}` +
      ` (${round2(summary.n > 0 ? (summary.unmapped / summary.n) * 100 : 0)}%)`
  )
  if (top1) {
    const pct = (part: number, whole: number) => `${round2(whole > 0 ? (part / whole) * 100 : 0)}%`
    console.log(
      `흔적 1위 카드(compiled ${top1.compiledRows}줄): accept 키 ${top1.acceptRows}줄 중 1위가 accept ${top1.top1Accept} (${pct(top1.top1Accept, top1.acceptRows)})` +
        ` · partial ${top1.top1Partial} · reject ${top1.top1Rejected} · id 못 만듦 ${top1.top1Unmapped}`
    )
    console.log(`nodoc 키 ${top1.nodocRows}줄 중 답해 버림 ${top1.nodocAnswered} (${pct(top1.nodocAnswered, top1.nodocRows)})`)
  }
}

if (process.argv[1] && resolve(process.argv[1]).replace(/\\/g, "/").endsWith("scripts/answer-index/proxy-eval.ts")) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(`대리 점수 실패: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}
