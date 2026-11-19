/**
 * 답 색인 자료 검사 V-1~V-12(사양 §6). CLI 는 scripts/answer-index/verify.ts.
 *
 * - 오류(error)가 하나라도 있으면 실패다. 경고(warning)·알림(info)은 실패가 아니다.
 * - 자료가 아직 없는 영역(카드·nav 표시가 하나도 없는 영역)은 덮기 검사(V-9)·옛 id 대응 검사(V-10)를 알림으로만 낸다.
 *   --strict 면 모든 영역에 적용한다(전체 자료 단계의 완료 기준).
 * - 평가 질문 겹침(V-7·V-8)은 겹친 자료 쪽 글만 찍고 평가 질문 글은 찍지 않는다. 확정용 묶음(--with-holdout)은 개수만 찍는다.
 */
import { join } from "node:path"
import { answerTextHash, normalizeForHash } from "@/lib/chatbot/answer-index/hash"
import {
  ANSWER_CARD_KINDS,
  ANSWER_INDEX_AREAS,
  ANSWER_LEADS,
  ASK_TYPES,
  AUDIT_DISPOSITIONS,
  isAnswerIndexArea,
  type AnswerCard,
  type AnswerIndexArea,
  type AnswerIndexUnit,
  type AuditEvidence,
  type LexiconForm,
  type SentenceRef,
  type SingleSentenceRef,
  type SiteFact,
} from "@/lib/chatbot/answer-index/types"
import { dataDir, fileSha16, type QuestionSet } from "./common"
import { loadAnswerIndexData, type AnswerIndexData, type Located } from "./data"
import { calibrationBasisVersion, isNonRuntimeDataPath } from "./manifest"
import { normalizeForOverlap, OverlapIndex, type OverlapReason } from "./similarity"
import { findSafetyViolations } from "./text-rules"

export const VERIFY_RULES = [
  { rule: "V-1", title: "doc·howto 카드 문장 참조(단위·번호·해시)가 지금 units.json·지금 문서와 같다. units.json 이 지금 문서와 같다" },
  { rule: "V-2", title: "FIX·policy 답 글 해시 = 점검 통과본, KEEP 해시 = 지금 옛 답 글, 점검 인용이 문장·페이지 줄에 글자 그대로 있다" },
  { rule: "V-3", title: "리드 허용 목록·리드 근거, 답 글에 식별 정보 요구·금액·할인/환불 약속 없음, 캡션·메타·nav 문장 안 씀" },
  { rule: "V-4", title: "변형: 두 카드에 같은 변형 없음, 길이 2~60자, 카드 등급별 최소 개수" },
  { rule: "V-5", title: "공백 카드·없는 개념이 문서와 겹치는지(경고)" },
  { rule: "V-6", title: "사전: 모호 규칙 없는 형태 충돌, 4어절 이상 형태, 짧은 형태 경계 표시" },
  { rule: "V-7", title: "변형·우주·사전·반례·보정 묶음이 평가·개발용 질문과 겹치지 않음(확정용은 개수만)" },
  { rule: "V-8", title: "보정 묶음 문항이 변형·우주와 겹치지 않음" },
  { rule: "V-9", title: "공개 단위가 카드 하나 이상에 덮이거나 nav 표시" },
  { rule: "V-10", title: "옛 정해 둔 답 id 가 legacy-alias.json 에 있음(카드 또는 null)" },
  { rule: "V-11", title: "active policy 카드의 policyRef 가 사람 결정 대기열에 있음, site 근거 카드는 결정 전 review" },
  { rule: "V-12", title: "자료 합계 25MB 이하, 카드 id 형식, 스키마" },
] as const

export type VerifyRule = (typeof VERIFY_RULES)[number]["rule"] | "load"
export type VerifyLevel = "error" | "warning" | "info"

export interface VerifyFinding {
  rule: VerifyRule
  level: VerifyLevel
  /** data/answer-index 기준 파일. 파일에 묶이지 않는 전체 검사는 null. */
  file: string | null
  message: string
}

export interface CurrentSources {
  /** 지금 문서로 다시 만든 단위. */
  units: AnswerIndexUnit[]
  /** 지금 공개 페이지로 다시 만든 사실 문장. */
  siteFacts: SiteFact[]
  /** 지금 코드의 옛 답 id → 답 글 해시·답 글. */
  inventory: Map<string, { textHash: string; text: string }>
  /** howto 카드가 가리킬 수 있는 증상 주제 id 와 가이드 slug. */
  symptomTopics: Set<string>
  guides: Set<string>
}

export interface VerifyOptions {
  dir?: string
  data?: AnswerIndexData
  /** 미리 만든 지금 원천(시험용). 없으면 저장소 코드로 만든다. */
  current?: Partial<CurrentSources>
  /** 개발용 질문 묶음(저장소 평가셋 + 저장소 밖 dev 묶음). */
  devSets?: QuestionSet[]
  /** 확정용 묶음(개수만 찍는다). */
  holdoutSets?: QuestionSet[]
  strict?: boolean
  requireBlind?: boolean
  /** 자료 합계 상한(바이트). 기본 25MB. */
  maxBytes?: number
}

export interface VerifyResult {
  findings: VerifyFinding[]
  errors: number
  warnings: number
  infos: number
  stats: Record<string, number>
}

export const MAX_DATA_BYTES = 25 * 1024 * 1024

/** 카드 등급별 최소 변형 수(§4.3·§5.2·§5.8). */
export const MIN_VARIANTS = {
  A: { head: 60, standard: 25, gap: 15 },
  B: { head: 15, standard: 10, gap: 5 },
} as const

const CARD_ID_RE: Record<string, RegExp> = {
  // doc:<단위 id 에서 'doc:' 를 뗀 것>/<짧은 이름>. 가이드 단위면 doc:guide:<slug>/<짧은 이름>.
  doc: /^doc:(?:\/docs\/[a-z0-9-]+\/[a-z0-9-]+#(?:summary|\d+)|guide:[a-z0-9-]+)\/[a-z0-9][a-z0-9-]*$/,
  howto: /^howto:[a-z0-9][a-z0-9:-]*$/,
  fixed: /^fixed:[a-z0-9][a-z0-9-]*$/,
  policy: /^policy:[a-z0-9][a-z0-9-]*$/,
  gap: /^gap:[a-z]+\/[a-z0-9][a-z0-9-]*$/,
  handoff: /^handoff:[a-z0-9][a-z0-9-]*$/,
}
const GAP_ID_RE = /^gap:([a-z]+)\/[a-z0-9][a-z0-9-]*$/
const LEGACY_ID_RE = /^(?:field|basics|symptom|svc|template|self|guide):.+$/

/** doc 카드 id 가 가리키는 단위 id(doc:/docs/a/b#3/x → doc:/docs/a/b#3, doc:guide:s/x → guide:s). */
export function docCardUnitId(cardId: string) {
  const inner = cardId.slice("doc:".length, cardId.lastIndexOf("/"))
  return inner.startsWith("guide:") ? inner : `doc:${inner}`
}

export function isCardIdShape(id: string) {
  const kind = id.split(":")[0]
  return Boolean(CARD_ID_RE[kind]?.test(id))
}

// ─── 지금 원천 만들기 ───────────────────────────────────────────────────

export async function loadCurrentSources(partial: Partial<CurrentSources> = {}, needInventory = true): Promise<CurrentSources> {
  const units = partial.units ?? (await (async () => {
    const { buildUnits, loadUnitSources } = await import("./units")
    return buildUnits(await loadUnitSources())
  })())
  const siteFacts = partial.siteFacts ?? (await (async () => {
    const { buildSiteFacts } = await import("./site-facts")
    return buildSiteFacts()
  })())
  let inventory = partial.inventory
  if (!inventory) {
    inventory = new Map()
    if (needInventory) {
      const { buildInventory } = await import("./inventory")
      const built = await buildInventory({ computeHits: false })
      for (const entry of built.entries) inventory.set(entry.id, { textHash: entry.textHash, text: entry.text })
    }
  }
  let symptomTopics = partial.symptomTopics
  let guides = partial.guides
  if (!symptomTopics || !guides) {
    const [{ SYMPTOM_TOPICS }, { CS_FIGMA_GUIDES }] = await Promise.all([
      import("@/lib/chatbot/symptom-triage"),
      import("@/lib/cs-figma-guides"),
    ])
    symptomTopics = symptomTopics ?? new Set([...SYMPTOM_TOPICS.map((topic) => topic.id), "vague-error"])
    guides = guides ?? new Set(CS_FIGMA_GUIDES.map((guide) => guide.slug))
  }
  return { units, siteFacts, inventory, symptomTopics, guides }
}

// ─── 도우미 ─────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function short(text: string, max = 60) {
  const collapsed = text.replace(/\s+/g, " ").trim()
  return collapsed.length > max ? `${collapsed.slice(0, max)}…` : collapsed
}

function formOf(form: LexiconForm) {
  return typeof form === "string" ? form : form.form
}

function quoteFound(quote: string, text: string) {
  return normalizeForHash(text).includes(normalizeForHash(quote))
}

const REASON_LABEL: Record<OverlapReason, string> = {
  same: "정규화 동일",
  edit: "편집거리 2 이하",
  jaccard: "2-gram 자카드 0.8 이상",
  substring: "8자 이상 연속 일치",
}

// ─── 본체 ───────────────────────────────────────────────────────────────

export async function runVerify(options: VerifyOptions = {}): Promise<VerifyResult> {
  const dir = options.dir ?? dataDir()
  const data = options.data ?? loadAnswerIndexData(dir)
  const findings: VerifyFinding[] = []
  const add = (rule: VerifyRule, level: VerifyLevel, file: string | null, message: string) =>
    findings.push({ rule, level, file, message })

  for (const problem of data.parseProblems) add("load", "error", problem.file, problem.message)
  for (const file of data.unknownFiles) add("V-12", "warning", file, "알 수 없는 자료 파일(이름 규칙 밖) — 검사하지 않음")
  if (!data.units) add("load", "error", "units.json", "units.json 이 없습니다(npm run answer-index:extract)")
  if (!data.siteFacts) add("load", "error", "site-facts.json", "site-facts.json 이 없습니다(npm run answer-index:extract)")
  if (!data.inventory) add("load", "warning", "inventory.json", "inventory.json 이 없습니다(npm run answer-index:extract)")

  const needInventory =
    data.cards.some((card) => card.value?.kind === "fixed" && isObject(card.value.answer) && "curatedRef" in card.value.answer) ||
    data.audits.length > 0 ||
    Boolean(data.inventory)
  const current = await loadCurrentSources(options.current ?? {}, needInventory)

  const fileUnits = new Map((data.units?.units ?? []).map((unit) => [unit.unitId, unit]))
  const currentUnits = new Map(current.units.map((unit) => [unit.unitId, unit]))
  const fileSite = new Map((data.siteFacts ?? []).map((fact) => [fact.id, fact]))
  const currentSite = new Map(current.siteFacts.map((fact) => [fact.id, fact]))
  const cards = data.cards.filter((card) => isObject(card.value))
  const cardById = new Map<string, Located<AnswerCard>>()
  for (const card of cards) if (typeof card.value.id === "string" && !cardById.has(card.value.id)) cardById.set(card.value.id, card)
  const humanQueueIds = new Set(data.humanQueue.map((item) => item.value?.id).filter((id): id is string => typeof id === "string"))
  const auditByRef = new Map<string, Located<(typeof data.audits)[number]["value"]>>()
  for (const audit of data.audits) {
    if (!isObject(audit.value) || typeof audit.value.answerId !== "string") continue
    // auditRef 는 audit/<묶음>.jsonl#<옛 답 id> 또는 접두를 뺀 #<모듈 안 id> 둘 다 받는다.
    auditByRef.set(`${audit.file}#${audit.value.answerId}`, audit)
    auditByRef.set(`${audit.file}#${audit.value.answerId.replace(/^[a-z]+:/, "")}`, audit)
  }

  // ── V-12 스키마(먼저: 뒤 검사가 형을 믿을 수 있게) ──
  checkSchemas(data, add)

  // ── V-1 ──
  if (data.units) {
    const changed: string[] = []
    for (const [unitId, unit] of currentUnits) {
      const stored = fileUnits.get(unitId)
      if (!stored) changed.push(`${unitId}(새 단위)`)
      else if (
        stored.sentences.length !== unit.sentences.length ||
        stored.sentences.some((sentence, index) => sentence.hash !== unit.sentences[index]?.hash) ||
        stored.area !== unit.area ||
        stored.heading !== unit.heading
      ) {
        changed.push(unitId)
      }
    }
    for (const unitId of fileUnits.keys()) if (!currentUnits.has(unitId)) changed.push(`${unitId}(사라진 단위)`)
    for (const unitId of changed.slice(0, 50)) add("V-1", "error", "units.json", `units.json 이 지금 문서와 다름: ${unitId} — npm run answer-index:extract 로 다시 만들고 낡은 카드를 고친다`)
    if (changed.length > 50) add("V-1", "error", "units.json", `그 밖에 지금 문서와 다른 단위 ${changed.length - 50}개`)
  }
  const checkRef = (file: string, cardId: string, ref: SingleSentenceRef | { unit: string; i: number; hash?: string }, label: string, level: VerifyLevel) => {
    const stored = fileUnits.get(ref.unit)
    const now = currentUnits.get(ref.unit)
    if (!stored || !now) {
      add("V-1", level, file, `${cardId}: ${label} 단위가 없음(${ref.unit})`)
      return
    }
    const storedSentence = stored.sentences[ref.i]
    const nowSentence = now.sentences[ref.i]
    if (!storedSentence || !nowSentence) {
      add("V-1", level, file, `${cardId}: ${label} 문장 번호가 없음(${ref.unit} #${ref.i})`)
      return
    }
    if (ref.hash !== undefined && (ref.hash !== storedSentence.hash || ref.hash !== nowSentence.hash)) {
      add("V-1", level, file, `${cardId}: ${label} 낡음(${ref.unit} #${ref.i} 해시가 지금 문장과 다름)`)
    }
  }
  for (const card of cards) {
    const value = card.value
    const level: VerifyLevel = value.status === "disabled" ? "warning" : "error"
    if (value.kind === "doc" && isObject(value.answer)) {
      for (const ref of (value.answer.sentences ?? []) as SentenceRef[]) {
        if (!isObject(ref) || !Array.isArray(ref.ids) || !Array.isArray(ref.hashes)) continue
        if (ref.ids.length !== ref.hashes.length) add("V-1", "error", card.file, `${value.id}: sentences 의 ids 와 hashes 길이가 다름(${ref.unit})`)
        ref.ids.forEach((i, index) => checkRef(card.file, value.id, { unit: ref.unit, i, hash: ref.hashes[index] }, "답 문장", level))
      }
      if (value.answer.leadBasis) checkRef(card.file, value.id, value.answer.leadBasis, "리드 근거", level)
    }
    if (value.kind === "gap" && isObject(value.answer)) {
      for (const ref of value.answer.related ?? []) if (isObject(ref)) checkRef(card.file, value.id, ref, "관련 문장", level)
    }
    if (value.kind === "howto" && isObject(value.answer)) {
      const symptomTopic = typeof value.answer.symptomTopic === "string" ? value.answer.symptomTopic : null
      const guide = typeof value.answer.guide === "string" ? value.answer.guide : null
      if (!symptomTopic && !guide) add("V-1", "error", card.file, `${value.id}: howto 카드에 symptomTopic·guide 가 없음`)
      if (symptomTopic && !current.symptomTopics.has(symptomTopic)) add("V-1", level, card.file, `${value.id}: 증상 주제가 없음(${symptomTopic})`)
      if (guide && !current.guides.has(guide)) add("V-1", level, card.file, `${value.id}: 가이드가 없음(${guide})`)
    }
  }

  // ── V-2 ──
  if (data.siteFacts) {
    const staleSite = new Set<string>()
    for (const [id, fact] of currentSite) {
      const stored = fileSite.get(id)
      if (!stored || stored.hash !== fact.hash) staleSite.add(id)
    }
    for (const id of fileSite.keys()) if (!currentSite.has(id)) staleSite.add(id)
    if (staleSite.size > 0) {
      add("V-2", "warning", "site-facts.json", `site-facts.json 이 지금 공개 페이지와 다름(${staleSite.size}줄) — npm run answer-index:extract`)
    }
  }
  if (data.inventory && current.inventory.size > 0) {
    const stale = data.inventory.entries.filter((entry) => current.inventory.get(entry.id)?.textHash !== entry.textHash).length
    const missing = Array.from(current.inventory.keys()).filter((id) => !data.inventory?.entries.some((entry) => entry.id === id)).length
    if (stale + missing > 0) add("V-2", "warning", "inventory.json", `inventory.json 이 지금 코드와 다름(답 글 바뀜·사라짐 ${stale}, 새 답 ${missing}) — npm run answer-index:extract`)
  }
  const checkEvidence = (file: string, owner: string, evidence: AuditEvidence) => {
    if (!isObject(evidence)) return
    if ("unit" in evidence) {
      const unit = fileUnits.get(evidence.unit)
      const sentence = unit?.sentences[evidence.i]
      if (!sentence) add("V-2", "error", file, `${owner}: 근거 문장이 없음(${evidence.unit} #${evidence.i})`)
      else if (typeof evidence.quote !== "string" || !quoteFound(evidence.quote, sentence.text)) {
        add("V-2", "error", file, `${owner}: 인용이 그 문장에 글자 그대로 없음(${evidence.unit} #${evidence.i}: "${short(String(evidence.quote))}")`)
      } else {
        const now = currentUnits.get(evidence.unit)?.sentences[evidence.i]
        if (!now || now.hash !== sentence.hash) add("V-2", "error", file, `${owner}: 근거 문장이 지금 문서와 다름(${evidence.unit} #${evidence.i})`)
      }
    } else if ("site" in evidence) {
      const fact = fileSite.get(evidence.site)
      if (!fact) add("V-2", "error", file, `${owner}: 근거 페이지 줄이 없음(${evidence.site})`)
      else if (typeof evidence.quote !== "string" || !quoteFound(evidence.quote, fact.text)) {
        add("V-2", "error", file, `${owner}: 인용이 그 페이지 줄에 글자 그대로 없음(${evidence.site}: "${short(String(evidence.quote))}")`)
      } else if (currentSite.get(evidence.site)?.hash !== fact.hash) {
        add("V-2", "error", file, `${owner}: 근거 페이지 줄이 지금 페이지와 다름(${evidence.site})`)
      }
    }
  }
  for (const audit of data.audits) {
    const record = audit.value
    if (!isObject(record)) continue
    const owner = `${record.answerId}(${audit.at}번째 줄)`
    for (const claim of Array.isArray(record.claims) ? record.claims : []) {
      for (const evidence of Array.isArray(claim?.evidence) ? claim.evidence : []) checkEvidence(audit.file, `${owner} 주장 ${claim.n}`, evidence)
    }
    for (const aspect of Array.isArray(record.incompleteAspects) ? record.incompleteAspects : []) {
      if (aspect?.evidence) checkEvidence(audit.file, `${owner} 빠진 측면`, aspect.evidence)
    }
    if (record.fix && typeof record.fix.text === "string" && record.fix.textHash && record.fix.textHash !== answerTextHash(record.fix.text)) {
      add("V-2", "error", audit.file, `${owner}: fix.textHash 가 fix.text 해시와 다름`)
    }
    const now = current.inventory.get(record.answerId)
    if (current.inventory.size > 0 && !now) add("V-2", "warning", audit.file, `${owner}: 지금 코드에 없는 옛 답 id`)
    else if (now && record.textHash !== now.textHash) add("V-2", "warning", audit.file, `${owner}: 점검 뒤 옛 답 글이 바뀜(다시 점검)`)
  }
  for (const card of cards) {
    const value = card.value
    if (!isObject(value.answer)) continue
    if (value.kind === "fixed" && "curatedRef" in value.answer && isObject(value.answer.curatedRef)) {
      const ref = value.answer.curatedRef
      const now = current.inventory.get(`${ref.module}:${ref.id}`)
      if (!now) add("V-2", "error", card.file, `${value.id}: curatedRef 옛 답이 지금 코드에 없음(${ref.module}:${ref.id})`)
      else if (now.textHash !== ref.textHash) add("V-2", "error", card.file, `${value.id}: curatedRef.textHash 가 지금 옛 답 글 해시와 다름(${ref.module}:${ref.id}) — 다시 점검`)
    }
    const textAnswer =
      (value.kind === "fixed" && "text" in value.answer) || value.kind === "policy"
        ? (value.answer as { text?: unknown; textHash?: unknown })
        : null
    if (textAnswer) {
      if (typeof textAnswer.text !== "string" || typeof textAnswer.textHash !== "string") continue
      if (answerTextHash(textAnswer.text) !== textAnswer.textHash) add("V-2", "error", card.file, `${value.id}: textHash 가 answer.text 해시와 다름`)
      const auditRef = value.auditRef
      if (!auditRef) {
        add("V-2", "error", card.file, `${value.id}: auditRef 가 없음(점검 통과본만 카드 글이 된다)`)
        continue
      }
      const audit = auditByRef.get(auditRef)
      if (!audit) {
        add("V-2", "error", card.file, `${value.id}: auditRef 가 가리키는 점검 기록이 없음(${auditRef})`)
        continue
      }
      const passed = [audit.value.fix?.text ? answerTextHash(audit.value.fix.text) : null, value.kind === "policy" ? audit.value.textHash : null]
      if (!passed.includes(textAnswer.textHash)) add("V-2", "error", card.file, `${value.id}: 답 글이 점검 통과본과 다름(${auditRef})`)
    }
  }

  // ── V-3 ──
  for (const card of cards) {
    const value = card.value
    if (!isObject(value.answer)) continue
    if (value.kind === "doc") {
      const answer = value.answer
      if (answer.lead !== undefined && !ANSWER_LEADS.includes(answer.lead)) add("V-3", "error", card.file, `${value.id}: 허용 목록 밖 리드(${answer.lead})`)
      if ((answer.lead === "yes_can" || answer.lead === "not_supported") && !answer.leadBasis) {
        add("V-3", "error", card.file, `${value.id}: ${answer.lead} 리드에 leadBasis 가 없음`)
      }
      const texts: string[] = []
      let picked = 0
      for (const ref of answer.sentences ?? []) {
        if (!isObject(ref) || !Array.isArray(ref.ids)) continue
        const unit = fileUnits.get(ref.unit)
        for (const i of ref.ids) {
          const sentence = unit?.sentences[i]
          if (!sentence) continue
          picked += 1
          texts.push(sentence.text)
          const banned = sentence.flags.filter((flag) => flag === "caption" || flag === "meta" || flag === "nav")
          if (banned.length > 0) add("V-3", "error", card.file, `${value.id}: 답으로 쓰지 않는 문장(${banned.join(",")}) ${ref.unit} #${i}`)
          if (sentence.flags.includes("connective") && !ref.ids.includes(i - 1)) {
            add("V-3", "error", card.file, `${value.id}: 접속어 문장을 앞 문장 없이 씀(${ref.unit} #${i})`)
          }
        }
      }
      if (picked === 1 && texts[0] && texts[0].length <= 50) add("V-3", "warning", card.file, `${value.id}: 50자 이하 단편 하나만 고름`)
      for (const rule of findSafetyViolations(texts.join("\n"))) add("V-3", "error", card.file, `${value.id}: 답 문장에 ${rule.label}`)
    }
    // 공백 카드의 관련 문장도 답에 그대로 나간다("공개 안내에는 이런 내용이 있어요:" 아래). doc 답 문장과 같은 규칙으로 본다.
    if (value.kind === "gap" && Array.isArray(value.answer.related)) {
      const related = value.answer.related.filter((ref): ref is SingleSentenceRef => isObject(ref) && typeof ref.unit === "string")
      const texts: string[] = []
      for (const ref of related) {
        const sentence = fileUnits.get(ref.unit)?.sentences[ref.i]
        if (!sentence) continue
        texts.push(sentence.text)
        const banned = sentence.flags.filter((flag) => flag === "caption" || flag === "meta" || flag === "nav")
        if (banned.length > 0) add("V-3", "error", card.file, `${value.id}: 관련 문장으로 쓰지 않는 문장(${banned.join(",")}) ${ref.unit} #${ref.i}`)
        if (sentence.flags.includes("connective") && !related.some((other) => other.unit === ref.unit && other.i === ref.i - 1)) {
          add("V-3", "error", card.file, `${value.id}: 접속어 문장을 앞 문장 없이 관련 문장으로 씀(${ref.unit} #${ref.i})`)
        }
      }
      for (const rule of findSafetyViolations(texts.join("\n"))) add("V-3", "error", card.file, `${value.id}: 관련 문장에 ${rule.label}`)
    }
    const directText =
      value.kind === "policy" || (value.kind === "fixed" && "text" in value.answer)
        ? String((value.answer as { text?: unknown }).text ?? "")
        : value.kind === "fixed" && "curatedRef" in value.answer && isObject(value.answer.curatedRef)
          ? current.inventory.get(`${value.answer.curatedRef.module}:${value.answer.curatedRef.id}`)?.text ?? ""
          : ""
    if (directText) for (const rule of findSafetyViolations(directText)) add("V-3", "error", card.file, `${value.id}: 답 글에 ${rule.label}`)
  }

  // ── V-4 ──
  const variantOwner = new Map<string, { cardId: string; file: string }>()
  const counts = new Map<string, { A: number; B: number }>()
  for (const key of data.variantKeys) {
    if (!cardById.has(key.value)) add("V-4", "error", key.file, `변형의 카드 id 가 카드에 없음(${key.value})`)
  }
  for (const item of data.variants) {
    const { cardId, variant } = item.value
    if (!isObject(variant) || typeof variant.q !== "string") continue
    const length = variant.q.trim().length
    if (length < 2 || length > 60) add("V-4", "error", item.file, `${cardId}: 변형 길이 ${length}자(2~60): "${short(variant.q)}"`)
    const key = normalizeForOverlap(variant.q)
    const owner = variantOwner.get(key)
    if (owner && owner.cardId !== cardId) {
      add("V-4", "error", item.file, `${cardId}: 같은 변형이 다른 카드(${owner.cardId})에도 있음: "${short(variant.q)}" — 나중 것을 지운다`)
    } else if (owner) {
      add("V-4", "warning", item.file, `${cardId}: 같은 카드 안 중복 변형: "${short(variant.q)}"`)
    } else variantOwner.set(key, { cardId, file: item.file })
    const count = counts.get(cardId) ?? { A: 0, B: 0 }
    if (variant.g === "A" || variant.g === "B") count[variant.g] += 1
    counts.set(cardId, count)
  }
  for (const card of cards) {
    const value = card.value
    if (value.status === "disabled" || typeof value.id !== "string") continue
    const grade = value.kind === "gap" ? "gap" : value.tier === "head" ? "head" : "standard"
    const count = counts.get(value.id) ?? { A: 0, B: 0 }
    if (count.A < MIN_VARIANTS.A[grade]) add("V-4", "error", card.file, `${value.id}: 작성 변형(g=A) ${count.A}개 < ${MIN_VARIANTS.A[grade]}(${grade})`)
    if (options.requireBlind && count.B < MIN_VARIANTS.B[grade]) {
      add("V-4", "error", card.file, `${value.id}: 블라인드 변형(g=B) ${count.B}개 < ${MIN_VARIANTS.B[grade]}(${grade})`)
    }
  }

  // ── V-5(경고) ──
  const unitTexts = Array.from(fileUnits.values()).flatMap((unit) => unit.sentences.map((sentence) => normalizeForOverlap(sentence.text)))
  const siteTexts = (data.siteFacts ?? []).map((fact) => normalizeForOverlap(fact.text))
  for (const item of data.absent) {
    const absent = item.value
    if (!isObject(absent) || !isStringArray(absent.forms)) continue
    let unitHits = 0
    let siteHits = 0
    for (const form of absent.forms) {
      const needle = normalizeForOverlap(form)
      if (!needle) continue
      unitHits += unitTexts.filter((text) => text.includes(needle)).length
      siteHits += siteTexts.filter((text) => text.includes(needle)).length
    }
    const verified = isObject(absent.verified) ? absent.verified : null
    if ((unitHits > 0 || siteHits > 0) && !verified?.sameMeaningNote) {
      add("V-5", "warning", item.file, `${absent.id}: 형태가 문서 ${unitHits}·페이지 ${siteHits}문장에 나옴 — 같은 뜻이 아니면 verified.sameMeaningNote 를 적는다`)
    }
    if (verified && (verified.unitHits !== unitHits || verified.siteHits !== siteHits)) {
      add("V-5", "warning", item.file, `${absent.id}: verified.unitHits·siteHits(${verified.unitHits}·${verified.siteHits})가 다시 센 값(${unitHits}·${siteHits})과 다름`)
    }
    if (typeof absent.gapCard === "string" && !cardById.has(absent.gapCard)) add("V-5", "warning", item.file, `${absent.id}: gapCard 가 카드에 없음(${absent.gapCard})`)
  }
  {
    const docVariants: string[] = []
    const docVariantOwner: string[] = []
    for (const item of data.variants) {
      const card = cardById.get(item.value.cardId)
      if (!card || card.value.kind === "gap" || typeof item.value.variant?.q !== "string") continue
      docVariants.push(item.value.variant.q)
      docVariantOwner.push(item.value.cardId)
    }
    if (docVariants.length > 0) {
      const index = new OverlapIndex(docVariants)
      for (const item of data.variants) {
        const card = cardById.get(item.value.cardId)
        if (!card || card.value.kind !== "gap" || typeof item.value.variant?.q !== "string") continue
        const hit = index.find(item.value.variant.q)
        if (hit) add("V-5", "warning", item.file, `${item.value.cardId}: 공백 카드 변형이 문서 카드(${docVariantOwner[hit.index]}) 변형과 겹침(${REASON_LABEL[hit.reason]}): "${short(item.value.variant.q)}"`)
      }
    }
  }

  // ── V-6 ──
  const conceptIds = new Set<string>()
  const formOwners = new Map<string, { concept: string; file: string }[]>()
  const ambiguityForms = new Map<string, Set<string>>()
  for (const item of data.lexicon) {
    const concept = item.value
    if (!isObject(concept) || typeof concept.id !== "string") continue
    if (conceptIds.has(concept.id)) add("V-6", "error", item.file, `개념 id 중복: ${concept.id}`)
    conceptIds.add(concept.id)
    ambiguityForms.set(concept.id, new Set((concept.ambiguous ?? []).map((rule) => normalizeForOverlap(rule.form))))
    for (const form of [...(concept.doc ?? []), ...(concept.visitor ?? [])]) {
      const text = formOf(form)
      if (typeof text !== "string" || !text.trim()) continue
      const words = text.trim().split(/\s+/)
      if (words.length >= 4) add("V-6", "error", item.file, `${concept.id}: 4어절 이상 형태 "${text}"`)
      const compact = text.replace(/\s+/g, "")
      if (compact.length <= 3 && (typeof form === "string" || form.boundary !== "both")) {
        add("V-6", "error", item.file, `${concept.id}: 3글자 이하 형태 "${text}"는 { form, boundary: "both" } 로 적는다(끝 경계 규칙 대상)`)
      }
      const key = normalizeForOverlap(text)
      const owners = formOwners.get(key) ?? []
      if (!owners.some((owner) => owner.concept === concept.id)) owners.push({ concept: concept.id, file: item.file })
      formOwners.set(key, owners)
    }
  }
  for (const [form, owners] of formOwners) {
    if (owners.length < 2) continue
    const resolved = owners.some((owner) => ambiguityForms.get(owner.concept)?.has(form))
    if (!resolved) {
      add("V-6", "error", owners[owners.length - 1].file, `형태 "${form}"가 모호 규칙 없이 두 개념에 걸림(${owners.map((owner) => owner.concept).join(", ")})`)
    }
  }
  for (const item of data.lexicon) {
    const concept = item.value
    if (!isObject(concept)) continue
    for (const parent of concept.parents ?? []) if (!conceptIds.has(parent)) add("V-6", "error", item.file, `${concept.id}: 상위 개념이 없음(${parent})`)
    for (const rule of concept.ambiguous ?? []) {
      for (const ref of [...(rule.requiresAny ?? []), ...(rule.notWith ?? [])]) {
        if (!conceptIds.has(ref)) add("V-6", "error", item.file, `${concept.id}: 모호 규칙이 없는 개념을 가리킴(${ref})`)
      }
    }
  }
  {
    const generic = new Set<string>()
    for (const item of data.genericWords) {
      const value = item.value
      if (!isObject(value)) continue
      for (const list of Object.values(value)) if (isStringArray(list)) for (const word of list) generic.add(normalizeForOverlap(word))
    }
    for (const item of data.lexicon) {
      const concept = item.value
      if (!isObject(concept) || concept.generic) continue
      for (const form of [...(concept.doc ?? []), ...(concept.visitor ?? [])]) {
        if (generic.has(normalizeForOverlap(formOf(form)))) add("V-6", "warning", item.file, `${concept.id}: 일반 낱말(generic-words)이 비일반 개념 형태로 쓰임("${formOf(form)}")`)
      }
    }
  }

  // ── V-7·V-8 ──
  const devSets = options.devSets ?? []
  const devTexts: string[] = []
  const devOwner: string[] = []
  for (const set of devSets) for (const question of set.questions) {
    devTexts.push(question)
    devOwner.push(set.name)
  }
  const checked: { file: string; label: string; text: string; substring: boolean }[] = []
  for (const item of data.variants) if (typeof item.value.variant?.q === "string") checked.push({ file: item.file, label: `${item.value.cardId} 변형`, text: item.value.variant.q, substring: false })
  for (const item of data.universe) if (isObject(item.value) && typeof item.value.q === "string") checked.push({ file: item.file, label: `우주 ${item.value.id}`, text: item.value.q, substring: false })
  for (const card of cards) for (const negative of card.value.negatives ?? []) {
    if (isObject(negative) && typeof negative.q === "string") checked.push({ file: card.file, label: `${card.value.id} 반례`, text: negative.q, substring: false })
  }
  for (const item of data.lexicon) {
    const concept = item.value
    if (!isObject(concept)) continue
    const forms = [...(concept.doc ?? []), ...(concept.visitor ?? []), ...(concept.ambiguous ?? []).map((rule) => rule.form)]
    for (const form of forms) if (typeof formOf(form) === "string") checked.push({ file: item.file, label: `${concept.id} 형태`, text: formOf(form), substring: true })
  }
  for (const item of data.absent) {
    if (!isObject(item.value) || !isStringArray(item.value.forms)) continue
    for (const form of item.value.forms) checked.push({ file: item.file, label: `${item.value.id} 형태`, text: form, substring: true })
  }
  const calibrationItems = data.calibrationSet && isObject(data.calibrationSet.value) && Array.isArray(data.calibrationSet.value.items) ? data.calibrationSet.value.items : []
  for (const item of calibrationItems) if (isObject(item) && typeof item.q === "string") checked.push({ file: data.calibrationSet!.file, label: `보정 ${item.id}`, text: item.q, substring: false })

  if (devTexts.length > 0) {
    const devIndex = new OverlapIndex(devTexts, { substrings: true })
    for (const item of checked) {
      const hit = devIndex.find(item.text, { substring: item.substring })
      if (!hit) continue
      add("V-7", "error", item.file, `${item.label} "${short(item.text)}"이(가) 개발용 질문과 겹침(${REASON_LABEL[hit.reason]}, 묶음 ${devOwner[hit.index]}) — 지우거나 다시 쓴다`)
    }
  }
  const holdoutSets = options.holdoutSets ?? []
  if (holdoutSets.length > 0) {
    const holdoutIndex = new OverlapIndex(holdoutSets.flatMap((set) => set.questions), { substrings: true })
    const byFile = new Map<string, number>()
    for (const item of checked) {
      if (holdoutIndex.find(item.text, { substring: item.substring })) byFile.set(item.file, (byFile.get(item.file) ?? 0) + 1)
    }
    const total = Array.from(byFile.values()).reduce((sum, count) => sum + count, 0)
    for (const [file, count] of byFile) add("V-7", "error", file, `확정용 묶음과 겹치는 항목 ${count}개(내용은 찍지 않음)`)
    add("V-7", total > 0 ? "error" : "info", null, `확정용 묶음 ${holdoutSets.length}개(${holdoutSets.reduce((sum, set) => sum + set.questions.length, 0)}문항)와 겹침 ${total}건`)
  }
  if (calibrationItems.length > 0) {
    const calibrationIndex = new OverlapIndex(calibrationItems.map((item) => (isObject(item) && typeof item.q === "string" ? item.q : "")))
    for (const item of data.variants) {
      if (typeof item.value.variant?.q !== "string") continue
      const hit = calibrationIndex.find(item.value.variant.q)
      if (hit) add("V-8", "error", item.file, `${item.value.cardId} 변형 "${short(item.value.variant.q)}"이(가) 보정 묶음 문항과 겹침(${REASON_LABEL[hit.reason]})`)
    }
    for (const item of data.universe) {
      if (!isObject(item.value) || typeof item.value.q !== "string") continue
      const hit = calibrationIndex.find(item.value.q)
      if (hit) add("V-8", "error", item.file, `우주 ${item.value.id} "${short(item.value.q)}"이(가) 보정 묶음 문항과 겹침(${REASON_LABEL[hit.reason]})`)
    }
  }

  // ── V-9 ──
  const startedAreas = new Set<AnswerIndexArea>()
  for (const card of cards) if (isAnswerIndexArea(card.value.area)) startedAreas.add(card.value.area)
  for (const nav of data.navs) {
    const unit = fileUnits.get(nav.value.unitId)
    if (unit) startedAreas.add(unit.area)
    else add("V-9", "error", nav.file, `nav 표시의 단위가 없음(${nav.value.unitId})`)
  }
  const covered = new Set<string>(data.navs.map((nav) => nav.value.unitId))
  const unitsByPathHeading = new Map<string, string>()
  for (const unit of fileUnits.values()) unitsByPathHeading.set(`${unit.path}#${unit.heading}`, unit.unitId)
  for (const card of cards) {
    const value = card.value
    if (value.status === "disabled" || !isObject(value.answer)) continue
    if (value.kind === "doc") for (const ref of value.answer.sentences ?? []) if (isObject(ref)) covered.add(ref.unit)
    if (value.kind === "howto") {
      if (value.answer.guide) covered.add(`guide:${value.answer.guide}`)
    }
    for (const legacy of value.provenance?.legacyIds ?? []) if (legacy.startsWith("guide:")) covered.add(legacy)
  }
  const uncoveredByArea = new Map<AnswerIndexArea, string[]>()
  for (const unit of fileUnits.values()) {
    if (covered.has(unit.unitId)) continue
    const list = uncoveredByArea.get(unit.area) ?? []
    list.push(unit.unitId)
    uncoveredByArea.set(unit.area, list)
  }
  for (const area of ANSWER_INDEX_AREAS) {
    const list = uncoveredByArea.get(area) ?? []
    if (list.length === 0) continue
    if (options.strict || startedAreas.has(area)) {
      for (const unitId of list.slice(0, 30)) add("V-9", "error", null, `덮이지 않은 단위(${area}): ${unitId}`)
      if (list.length > 30) add("V-9", "error", null, `그 밖에 덮이지 않은 단위(${area}) ${list.length - 30}개`)
    } else {
      add("V-9", "info", null, `영역 ${area}: 아직 카드 없음(덮이지 않은 단위 ${list.length}개)`)
    }
  }

  // ── V-10 ──
  const inventoryEntries = data.inventory?.entries ?? []
  const inventoryIds = new Set(inventoryEntries.map((entry) => entry.id))
  const aliasKeys = new Map<string, string>()
  for (const item of data.legacyAlias) {
    const { key, target } = item.value
    if (aliasKeys.has(key)) add("V-10", "error", item.file, `legacy-alias 키 중복: ${key}`)
    aliasKeys.set(key, item.file)
    if (!LEGACY_ID_RE.test(key)) add("V-10", "error", item.file, `옛 id 형식이 아님: ${key}`)
    else if (inventoryIds.size > 0 && !inventoryIds.has(key)) add("V-10", "error", item.file, `inventory 에 없는 옛 id: ${key}`)
    if (target !== null && !cardById.has(target)) add("V-10", "error", item.file, `${key} → 없는 카드 ${target}`)
  }
  {
    const aliasAreas = new Set<AnswerIndexArea>()
    for (const entry of inventoryEntries) if (aliasKeys.has(entry.id)) aliasAreas.add(entry.area)
    for (const area of ANSWER_INDEX_AREAS) {
      const missing = inventoryEntries.filter((entry) => entry.area === area && !aliasKeys.has(entry.id)).map((entry) => entry.id)
      if (missing.length === 0) continue
      if (options.strict || aliasAreas.has(area)) {
        add("V-10", "error", null, `영역 ${area}: legacy-alias 에 없는 옛 id ${missing.length}개(${missing.slice(0, 10).join(", ")}${missing.length > 10 ? " …" : ""})`)
      } else {
        add("V-10", "info", null, `영역 ${area}: 아직 legacy-alias 없음(옛 답 ${missing.length}개)`)
      }
    }
  }

  // ── V-11 ──
  const decidedForCard = new Set<string>()
  for (const item of data.humanQueue) {
    const value = item.value
    if (!isObject(value)) continue
    if (value.decision) for (const cardId of value.affectedCards ?? []) decidedForCard.add(cardId)
  }
  for (const card of cards) {
    const value = card.value
    if (value.kind === "policy" && value.status === "active") {
      const ref = isObject(value.answer) ? value.answer.policyRef : undefined
      if (!ref || !humanQueueIds.has(ref)) add("V-11", "error", card.file, `${value.id}: active policy 카드의 policyRef 가 사람 결정 대기열에 없음(${ref ?? "없음"})`)
    }
    if (value.evidenceScope === "site" && value.status === "active" && !decidedForCard.has(value.id)) {
      add("V-11", "error", card.file, `${value.id}: 공개 페이지 근거 카드는 사람 결정 전까지 status:review(§14 결정 과제 3)`)
    }
  }
  {
    const inactive = new Set(cards.filter((card) => card.value.status !== "active").map((card) => card.value.id))
    for (const item of data.universe) {
      const label = isObject(item.value) ? item.value.label : null
      if (typeof label === "string" && inactive.has(label)) add("V-11", "warning", item.file, `우주 ${item.value.id}: 색인에서 빠지는 카드(review·disabled)를 라벨로 씀(${label})`)
    }
  }

  // ── V-12 크기·id·참조 ──
  {
    let bytes = 0
    const { statSync } = await import("node:fs")
    for (const rel of data.files) if (!isNonRuntimeDataPath(rel)) bytes += statSync(join(dir, rel)).size
    const max = options.maxBytes ?? MAX_DATA_BYTES
    if (bytes > max) add("V-12", "error", null, `런타임 자료 합계 ${(bytes / 1024 / 1024).toFixed(1)}MB > ${(max / 1024 / 1024).toFixed(0)}MB`)
    else add("V-12", "info", null, `런타임 자료 합계 ${(bytes / 1024 / 1024).toFixed(2)}MB`)
  }
  {
    const seen = new Map<string, string>()
    for (const card of cards) {
      const value = card.value
      if (typeof value.id !== "string") continue
      const previous = seen.get(value.id)
      if (previous) add("V-12", "error", card.file, `카드 id 중복: ${value.id}(${previous}에도 있음)`)
      else seen.set(value.id, card.file)
      if (!ANSWER_CARD_KINDS.includes(value.kind)) continue
      if (!isCardIdShape(value.id) || value.id.split(":")[0] !== value.kind) add("V-12", "error", card.file, `카드 id 형식이 종류(${value.kind})와 맞지 않음: ${value.id}`)
      const gap = value.id.match(GAP_ID_RE)
      if (gap && gap[1] !== value.area) add("V-12", "error", card.file, `${value.id}: 공백 카드 id 의 영역과 area(${value.area})가 다름`)
      if (value.kind === "doc" && isObject(value.answer)) {
        const unitFromId = docCardUnitId(value.id)
        const refs = (value.answer.sentences ?? []).filter(isObject).map((ref) => ref.unit)
        if (refs.length > 0 && !refs.includes(unitFromId)) add("V-12", "warning", card.file, `${value.id}: id 의 단위(${unitFromId})가 답 문장 단위에 없음`)
      }
    }
    const isRoute = (route: string) => route === "none" || GAP_ID_RE.test(route) || isCardIdShape(route)
    for (const card of cards) {
      for (const negative of card.value.negatives ?? []) {
        if (!isObject(negative) || typeof negative.route !== "string") continue
        if (!isRoute(negative.route)) add("V-12", "error", card.file, `${card.value.id}: 반례 행선 형식이 아님(${negative.route})`)
        else if (negative.route !== "none" && !cardById.has(negative.route)) {
          add("V-12", options.strict ? "error" : "warning", card.file, `${card.value.id}: 반례 행선 카드가 아직 없음(${negative.route})`)
        }
      }
    }
    const universeIds = new Set<string>()
    for (const item of data.universe) {
      const value = item.value
      if (!isObject(value)) continue
      if (universeIds.has(value.id)) add("V-12", "error", item.file, `우주 id 중복: ${value.id}`)
      universeIds.add(value.id)
      for (const label of [value.label, value.label2]) {
        if (label === null || label === undefined) continue
        if (typeof label !== "string") {
          add("V-12", "error", item.file, `우주 ${value.id}: 라벨이 문자열이 아님`)
          continue
        }
        if (label === "none" || label === "clarify") continue
        if (label.startsWith("missing:")) {
          if (!fileUnits.has(label.slice("missing:".length))) add("V-12", "error", item.file, `우주 ${value.id}: missing 라벨의 단위가 없음(${label})`)
          continue
        }
        if (!isRoute(label)) add("V-12", "error", item.file, `우주 ${value.id}: 라벨 형식이 아님(${label})`)
        else if (!cardById.has(label)) add("V-12", "error", item.file, `우주 ${value.id}: 없는 카드 라벨(${label})`)
      }
    }
  }
  if (data.calibration) {
    // 보정이 가리키는 자료 판은 calibration.json 을 뺀 런타임 자료 해시다(manifest.ts calibrationBasisVersion).
    const basis = calibrationBasisVersion(dir)
    if (data.calibration.value?.dataVersion !== basis) {
      add("V-12", "warning", data.calibration.file, `calibration.json dataVersion(${data.calibration.value?.dataVersion})이 지금 자료(${basis})와 다름 — 자료가 바뀌었으면 다시 보정한다(npm run answer-index:calibrate)`)
    }
  }
  if (data.manifest && isObject(data.manifest.outputs)) {
    const stale = data.files.filter((rel) => rel !== "manifest.json" && data.manifest?.outputs[rel]?.sha !== fileSha16(join(dir, rel)))
    if (stale.length > 0) add("V-12", "warning", "manifest.json", `manifest.json 이 자료 파일과 다름(${stale.length}개: ${stale.slice(0, 5).join(", ")}) — merge.ts 또는 answer-index:extract 로 다시 쓴다`)
  }

  const errors = findings.filter((finding) => finding.level === "error").length
  const warnings = findings.filter((finding) => finding.level === "warning").length
  return {
    findings,
    errors,
    warnings,
    infos: findings.length - errors - warnings,
    stats: {
      units: fileUnits.size,
      sentences: Array.from(fileUnits.values()).reduce((sum, unit) => sum + unit.sentences.length, 0),
      siteFacts: data.siteFacts?.length ?? 0,
      inventory: inventoryEntries.length,
      cards: cards.length,
      navs: data.navs.length,
      variants: data.variants.length,
      universe: data.universe.length,
      lexicon: data.lexicon.length,
      absent: data.absent.length,
      legacyAlias: data.legacyAlias.length,
      audits: data.audits.length,
      devQuestions: devTexts.length,
    },
  }
}

// ─── V-12 스키마 ────────────────────────────────────────────────────────

type Add = (rule: VerifyRule, level: VerifyLevel, file: string | null, message: string) => void

function checkSchemas(data: AnswerIndexData, add: Add) {
  const err = (file: string, message: string) => add("V-12", "error", file, message)
  for (const card of data.cards) {
    const value = card.value as unknown
    const where = `카드 ${card.at}`
    if (!isObject(value)) {
      err(card.file, `${where}: 객체가 아님`)
      continue
    }
    const id = typeof value.id === "string" ? value.id : where
    if (typeof value.id !== "string") err(card.file, `${where}: id 가 없음`)
    if (!ANSWER_CARD_KINDS.includes(value.kind as AnswerCard["kind"])) err(card.file, `${id}: kind 가 허용 값이 아님(${String(value.kind)})`)
    if (value.tier !== "head" && value.tier !== "standard") err(card.file, `${id}: tier 는 head·standard`)
    if (!isAnswerIndexArea(value.area)) err(card.file, `${id}: area 가 영역 12개 밖(${String(value.area)})`)
    if (typeof value.topic !== "string" || !value.topic.trim()) err(card.file, `${id}: topic 이 없음`)
    if (!["active", "review", "disabled"].includes(String(value.status))) err(card.file, `${id}: status 는 active·review·disabled`)
    if (!isObject(value.answer)) err(card.file, `${id}: answer 가 없음`)
    if (value.asks !== undefined && (!isStringArray(value.asks) || value.asks.some((ask) => !ASK_TYPES.includes(ask as never)))) err(card.file, `${id}: asks 에 허용 밖 값`)
    for (const key of ["concepts", "anchors", "notCovers", "suggestedQuestions"] as const) {
      if (value[key] !== undefined && !isStringArray(value[key])) err(card.file, `${id}: ${key} 는 문자열 배열`)
    }
    if (value.negatives !== undefined && (!Array.isArray(value.negatives) || value.negatives.some((n) => !isObject(n) || typeof n.q !== "string" || typeof n.route !== "string"))) {
      err(card.file, `${id}: negatives 는 { q, route } 배열`)
    }
    if (value.handoff !== undefined && value.handoff !== null && value.handoff !== "support" && value.handoff !== "demo") err(card.file, `${id}: handoff 는 support·demo·null`)
    if (value.evidenceScope !== undefined && value.evidenceScope !== "docs" && value.evidenceScope !== "site") err(card.file, `${id}: evidenceScope 는 docs·site`)
    if (value.provenance !== undefined) {
      const provenance = value.provenance
      if (!isObject(provenance) || typeof provenance.unit !== "string" || typeof provenance.writer !== "string" || !isStringArray(provenance.legacyIds)) {
        err(card.file, `${id}: provenance 는 { unit, writer, at, legacyIds[] }`)
      }
    }
    const answer = value.answer
    if (!isObject(answer)) continue
    switch (value.kind) {
      case "doc":
        if (!Array.isArray(answer.sentences) || answer.sentences.length === 0) err(card.file, `${id}: doc 카드 answer.sentences 가 비었음`)
        else if (answer.sentences.some((ref) => !isObject(ref) || typeof ref.unit !== "string" || !Array.isArray(ref.ids) || !isStringArray(ref.hashes))) {
          err(card.file, `${id}: answer.sentences 는 { unit, ids[], hashes[] } 배열`)
        }
        if (answer.leadBasis !== undefined && (!isObject(answer.leadBasis) || typeof answer.leadBasis.unit !== "string" || typeof answer.leadBasis.i !== "number")) {
          err(card.file, `${id}: leadBasis 는 { unit, i }`)
        }
        break
      case "howto":
        if (answer.symptomTopic !== undefined && typeof answer.symptomTopic !== "string") err(card.file, `${id}: symptomTopic 은 문자열`)
        if (answer.guide !== undefined && typeof answer.guide !== "string") err(card.file, `${id}: guide 는 문자열`)
        break
      case "fixed":
        if (isObject(answer.curatedRef)) {
          const ref = answer.curatedRef
          if (typeof ref.module !== "string" || typeof ref.id !== "string" || typeof ref.textHash !== "string") err(card.file, `${id}: curatedRef 는 { module, id, textHash }`)
        } else if (typeof answer.text !== "string" || typeof answer.textHash !== "string") {
          err(card.file, `${id}: fixed 카드 answer 는 { curatedRef } 또는 { text, textHash }`)
        }
        break
      case "policy":
        if (typeof answer.text !== "string" || typeof answer.textHash !== "string" || typeof answer.policyRef !== "string") {
          err(card.file, `${id}: policy 카드 answer 는 { text, textHash, policyRef }`)
        }
        break
      case "gap":
        if (answer.template !== "gap_default") err(card.file, `${id}: gap 카드 answer.template 은 gap_default`)
        if (!Array.isArray(answer.related)) err(card.file, `${id}: gap 카드 answer.related 는 배열`)
        if (answer.handoff !== null && answer.handoff !== "support" && answer.handoff !== "demo") err(card.file, `${id}: gap 카드 answer.handoff 는 support·demo·null`)
        break
      case "handoff":
        if (answer.handoffKind !== "support" && answer.handoffKind !== "demo") err(card.file, `${id}: handoff 카드 answer.handoffKind 는 support·demo`)
        break
      default:
        break
    }
  }
  for (const nav of data.navs) if (typeof nav.value.unitId !== "string") err(nav.file, `nav 표시 ${nav.at}: unitId 가 없음`)
  for (const item of data.variants) {
    const variant = item.value.variant as unknown
    if (!isObject(variant) || typeof variant.q !== "string" || typeof variant.p !== "string" || (variant.g !== "A" && variant.g !== "B") || typeof variant.m !== "string") {
      err(item.file, `변형 ${item.at}: { q, p, g: "A"|"B", m } 가 아님`)
    }
  }
  for (const [rel, raw] of data.raw) {
    if (/^variants\//.test(rel) && (!isObject(raw) || Object.values(raw).some((list) => !Array.isArray(list)))) err(rel, "변형 파일은 { 카드 id: 변형[] }")
    if (/^(?:cards|universe)\//.test(rel) && !Array.isArray(raw)) err(rel, "배열이어야 함")
  }
  for (const item of data.universe) {
    const value = item.value as unknown
    if (!isObject(value) || typeof value.id !== "string" || typeof value.q !== "string" || typeof value.p !== "string") {
      err(item.file, `우주 ${item.at}: { id, q, p, m, label, conf, labeler, label2 } 가 아님`)
    }
  }
  for (const item of data.lexicon) {
    const value = item.value as unknown
    if (!isObject(value) || typeof value.id !== "string") {
      err(item.file, `사전 ${item.at}: id 가 없음`)
      continue
    }
    if (!["object", "action", "attribute", "ask", "modifier"].includes(String(value.kind))) err(item.file, `${value.id}: kind 는 object·action·attribute·ask·modifier`)
    if (typeof value.generic !== "boolean") err(item.file, `${value.id}: generic 은 true·false`)
    if (!isStringArray(value.parents)) err(item.file, `${value.id}: parents 는 문자열 배열`)
    for (const key of ["doc", "visitor"] as const) {
      const forms = value[key]
      if (!Array.isArray(forms) || forms.some((form) => typeof form !== "string" && !(isObject(form) && typeof form.form === "string" && (form.boundary === "both" || form.boundary === "start")))) {
        err(item.file, `${value.id}: ${key} 는 형태(문자열 또는 { form, boundary }) 배열`)
      }
    }
    if (!Array.isArray(value.ambiguous) || value.ambiguous.some((rule) => !isObject(rule) || typeof rule.form !== "string")) err(item.file, `${value.id}: ambiguous 는 { form, requiresAny?, notWith? } 배열`)
  }
  for (const item of data.genericWords) {
    const value = item.value as unknown
    if (!isObject(value) || !["function", "predicate", "quantity", "demonstrative"].every((key) => value[key] === undefined || isStringArray(value[key]))) {
      err(item.file, "generic-words 는 { function, predicate, quantity, demonstrative } 문자열 배열")
    }
  }
  for (const item of data.absent) {
    const value = item.value as unknown
    if (!isObject(value) || typeof value.id !== "string" || typeof value.label !== "string" || !isStringArray(value.forms) || !isAnswerIndexArea(value.area) || typeof value.gapCard !== "string" || !isObject(value.verified)) {
      err(item.file, `없는 개념 ${item.at}: { id, label, forms[], area, gapCard, verified } 가 아님`)
    }
  }
  for (const item of data.legacyAlias) {
    if (item.value.target !== null && typeof item.value.target !== "string") err(item.file, `${item.value.key}: 값은 카드 id 또는 null`)
  }
  for (const audit of data.audits) {
    const value = audit.value as unknown
    const where = `${audit.at}번째 줄`
    if (!isObject(value) || typeof value.answerId !== "string") {
      err(audit.file, `${where}: answerId 가 없음`)
      continue
    }
    if (!AUDIT_DISPOSITIONS.includes(value.disposition as never)) err(audit.file, `${where}: disposition 이 허용 값이 아님(${String(value.disposition)})`)
    if (!Array.isArray(value.claims)) err(audit.file, `${where}: claims 는 배열`)
    if (!Array.isArray(value.incompleteAspects)) err(audit.file, `${where}: incompleteAspects 는 배열`)
    if (value.disposition === "FIX" && (!isObject(value.fix) || typeof value.fix.text !== "string")) err(audit.file, `${where}: FIX 는 fix.text 가 있어야 함`)
    if (value.disposition === "MERGE" && typeof value.mergeInto !== "string") err(audit.file, `${where}: MERGE 는 mergeInto 가 있어야 함`)
  }
  for (const item of data.humanQueue) {
    const value = item.value as unknown
    if (!isObject(value) || typeof value.id !== "string" || !/^HQ-\d+$/.test(value.id) || typeof value.topic !== "string") {
      err(item.file, `대기열 ${item.at}: { id: "HQ-<번호>", topic, … } 가 아님`)
    }
  }
  for (const item of data.answerKeys) {
    const value = item.value as unknown
    if (!isObject(value) || typeof value.set !== "string" || !Array.isArray(value.keys)) {
      err(item.file, "정답 키 파일은 { set, keys[] }")
      continue
    }
    value.keys.forEach((key, index) => {
      if (!isObject(key) || typeof key.id !== "string" || !isStringArray(key.accept)) err(item.file, `키 ${index}: { id, accept[] } 가 아님`)
      else if (["q", "question", "text"].some((field) => field in key)) err(item.file, `키 ${key.id}: 질문 글을 담지 않는다(q·question·text 칸 금지)`)
    })
  }
  if (data.calibrationSet) {
    const value = data.calibrationSet.value as unknown
    if (!isObject(value) || !Array.isArray(value.items)) err(data.calibrationSet.file, "보정 묶음은 { version, items[] }")
  }
  if (data.calibration) {
    const value = data.calibration.value as unknown
    if (!isObject(value) || !isObject(value.weights) || !isObject(value.thresholds)) err(data.calibration.file, "calibration.json 은 { version, dataVersion, weights, confidence, thresholds, … }")
  }
  if (data.units && (!Array.isArray(data.units.units) || typeof data.units.version !== "string")) err("units.json", "units.json 은 { version, counts, units[] }")
  if (data.siteFacts && !Array.isArray(data.siteFacts)) err("site-facts.json", "site-facts.json 은 배열")
}

/** --only: 그 파일에 묶인 결과만 남긴다. */
export function filterFindingsForFile(findings: VerifyFinding[], file: string) {
  return findings.filter((finding) => finding.file === file)
}
