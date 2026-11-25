/**
 * 답 조립(사양 §3.6): 결정(decide.ts)을 공개 챗봇 답(ChatbotCore 조각)으로 바꾼다.
 *
 * - doc: [리드] + 고른 문장 그대로. 문장은 (단위 id, 문장 번호)로 지금 문서(index.currentUnits)에서 다시 꺼내고 해시를 대조한다.
 *   문단은 근거 선별 답과 같은 규칙(paragraphs.ts)으로 묶는다. 출처는 문장이 나온 단위(최대 2개).
 * - howto: 증상 주제는 기존 증상 안내(buildSymptomTopicAnswer → host.symptom), 가이드는 기존 가이드 답(host.guide).
 * - fixed(KEEP, curatedRef): 옛 답 자료를 id 로 찾아 그대로 쓴다(curated.ts). 상담 버튼·추천 질문·englishSummary·
 *   suppressSalesFollowUp 은 옛 답 값. 글 해시가 카드 textHash 와 다르면 쓰지 않는다.
 * - fixed(FIX)·policy: 카드 text(textHash 일치). policy·policyGoverned 카드에는 리드·꼬리를 붙이지 않는다.
 * - gap: GAP 틀 문장 + (검증된 관련 문장) + NO_SOURCE_FACT_ANSWER 둘째 문단. 카드 handoff 가 있으면 상담 버튼.
 * - handoff: 기존 상담 연결 응답(host.handoff).
 * - abstain: nodoc → NO_SOURCE_FACT_ANSWER, symptom → SYMPTOM_AFTER_GATE_ANSWER(상담 버튼). clarify: 기존 증상 일반 되묻기.
 *
 * CHATBOT_COMPILED_FRAMING=full(기본)이면 허용 목록 리드와 꼬리 문장(없는 부분·못 찾은 조각)을 붙이고,
 * verbatim 이면 문서 문장·점검 통과본만 낸다(§3.8, §14 결정 과제 1).
 * 리드는 묻는 꼴에 맞을 때만 붙인다: yes_can·not_supported 는 예/아니오 질문(yesno)에서 근거 문장(leadBasis)이 지금 문서와 맞을 때,
 * how_to 는 방법·가능 여부 질문(howto·yesno)이거나 묻는 꼴을 모를 때.
 *
 * 고른 카드를 답으로 만들 수 없으면(문장 해시가 어긋남, 옛 답·증상 주제·가이드가 사라짐) 못 찾음으로 바꾸고 흔적에 이유를 남긴다.
 * service.ts 를 import 하지 않는다: 기존 답을 만드는 함수와 고정 문구는 host 로 받는다(순환 import 를 피하고 시험에서 바꿔 끼운다).
 * 네트워크·모델 호출 없음.
 */
import { classifyChatbotQuestion, type ChatbotIntent, type HandoffIntent } from "@/lib/chatbot/classification"
import type { CsFigmaGuide } from "@/lib/cs-figma-guides"
import type { ChatbotSelfKnowledgeEntry } from "@/lib/chatbot/self-knowledge"
import { buildSymptomTopicAnswer, buildVagueErrorAnswer, type SymptomTriageResult } from "@/lib/chatbot/symptom-triage"
import { detectConversationTone, glossForRouting } from "@/lib/chatbot/tone"
import type { CompiledAnswerIndex } from "./compile"
import { findCuratedEntry, findPublicGuide, symptomTopicById, VAGUE_ERROR_TOPIC_ID } from "./curated"
import { toAnswerIndexTrace } from "./decide"
import { answerTextHash } from "./hash"
import { detectAskType, normalizeText } from "./normalize"
import { groupSentenceParagraphs, type ParagraphSentence } from "./paragraphs"
import type {
  AnswerCard,
  AnswerIndexDecision,
  AnswerIndexRouter,
  AnswerIndexTrace,
  AnswerIndexUnit,
  AnswerLead,
  AskType,
  DocCardAnswer,
  GapAnswerCard,
  SingleSentenceRef,
} from "./types"

type Env = Record<string, string | undefined>

// ─── 응답 꼴(service.ts ChatbotQueryResponse 의 부분) ─────────────────────

export type AnswerIndexAnswerMode = "direct_answer" | "doc_suggestion" | "clarifying_question" | "handoff" | "fallback"

export interface AnswerIndexSource {
  title: string
  heading?: string
  urlPath: string
  category: string
  excerpt: string
  score: number
}

export interface AnswerIndexResponse {
  answer: string
  answerMode: AnswerIndexAnswerMode
  confidence: number
  needsHandoff: boolean
  sources: AnswerIndexSource[]
  suggestedQuestions: string[]
  unresolved: boolean
}

/** ChatbotCore 에서 question·latencyMs·answerIndex 를 뺀 조각. */
export interface AnswerIndexCoreParts {
  response: AnswerIndexResponse
  category: string
  intent: ChatbotIntent
  handoffIntent: HandoffIntent
  englishSummary?: string
  howtoAnswer?: boolean
  topicFollowUp?: string
  topicId?: string
  suppressSalesFollowUp?: boolean
}

export interface AnswerIndexCore extends AnswerIndexCoreParts {
  latencyMs: number
  answerIndex: AnswerIndexTrace
}

/** service.ts 가 넘기는 기존 답 만드는 함수와 고정 문구. */
export interface AnswerIndexHost {
  /** NO_SOURCE_FACT_ANSWER(두 문단). */
  noSourceAnswer: string
  /** SYMPTOM_AFTER_GATE_ANSWER. */
  symptomAbstainAnswer: string
  /** 분류별 추천 질문(buildSuggestedQuestions). */
  suggestedQuestions(category: string): string[]
  /** 문서 분류(docs category) → 출처 분류(getSourceCategoryFromDocCategory). */
  sourceCategory(docCategory: string): string
  /** 기본 사실 답의 근거 문서 출처(buildBasicsDocSource). */
  basicsSource(docPath: string, heading?: string): AnswerIndexSource | null
  /** 기존 상담 연결 응답(buildImmediateHandoffResponse). */
  handoff(questionText: string, handoffIntent: HandoffIntent): AnswerIndexCoreParts
  /** 기존 증상 안내 응답(buildSymptomTriageResponse + 증상 코어 값). */
  symptom(triage: SymptomTriageResult): AnswerIndexCoreParts
  /** 기존 공개 화면 가이드 답. */
  guide(guide: CsFigmaGuide, questionText: string): AnswerIndexCoreParts
  /** 기존 자기소개 답(buildPolicyGuardResponse 의 자기소개 갈래). */
  selfKnowledge(entry: ChatbotSelfKnowledgeEntry): AnswerIndexCoreParts
  /** 모델이 다시 쓰지 않을 결정형 최종 답으로 표시(deterministicFinalResponses). */
  markFinal(response: object): void
}

export interface RespondContext {
  index: CompiledAnswerIndex
  host: AnswerIndexHost
  router: AnswerIndexRouter
  /** 흔적에 적을 색인 판. */
  version: string
  env?: Env
}

export interface AnswerIndexQuestion {
  /** 가린 질문 글(question.redacted). */
  redacted: string
}

// ─── 고정 문구 ───────────────────────────────────────────────────────────

export type CompiledFraming = "full" | "verbatim"

/** CHATBOT_COMPILED_FRAMING: full(기본) · verbatim. */
export function compiledFraming(env: Env = process.env): CompiledFraming {
  return env.CHATBOT_COMPILED_FRAMING?.trim().toLowerCase() === "verbatim" ? "verbatim" : "full"
}

export const LEAD_TEXT: Record<Exclude<AnswerLead, "none">, string> = {
  yes_can: "네, 할 수 있어요.",
  how_to: "이렇게 하면 돼요.",
  not_supported: "공개 안내 기준으로는 지원하지 않아요.",
}

/** 공백 카드 답 틀 첫 문장(§3.6, §14 결정 과제 10). {topic} 은 카드 topic(조사 없음). */
export function gapLeadLine(topic: string) {
  return `${topic}에 대한 내용은 공개 안내에서 찾지 못했어요. 확인되지 않은 내용을 추측해 말씀드리지 않을게요.`
}

export const GAP_RELATED_INTRO = "공개 안내에는 이런 내용이 있어요:"
export const UNANSWERED_SEGMENT_LINE = "함께 물어보신 다른 내용은 공개 안내에서 찾지 못했어요."

const HANGUL_START = 0xac00
const HANGUL_END = 0xd7a3

/** 받침에 맞는 조사(은/는). 한글로 끝나지 않으면 "은(는)". */
export function topicParticle(word: string) {
  const last = word.trim().slice(-1)
  const code = last.charCodeAt(0)
  if (!(code >= HANGUL_START && code <= HANGUL_END)) return "은(는)"
  return (code - HANGUL_START) % 28 === 0 ? "는" : "은"
}

/** 없는 부분 꼬리(§3.6). label 은 absent.json 의 검증된 이름. */
export function absentTailLine(label: string) {
  return `질문하신 ${label}${topicParticle(label)} 공개 안내에 나와 있지 않아요.`
}

const SOURCE_SCORE = 300
const MAX_SOURCES = 2
const EXCERPT_MAX = 220

function compactExcerpt(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim()
  return normalized.length > EXCERPT_MAX ? `${normalized.slice(0, EXCERPT_MAX - 1).trim()}…` : normalized
}

// ─── 카드 조각 ───────────────────────────────────────────────────────────

interface RenderInput {
  ctx: RespondContext
  question: AnswerIndexQuestion
  askType: AskType | null
  framing: CompiledFraming
  conf: number
}

interface Rendered {
  parts: AnswerIndexCoreParts
  /** 다른 조각 답 뒤에 이어 붙일 때 쓸 본문(공백 카드는 첫 문장만). */
  continuation: string
}

type RenderResult = { ok: true; value: Rendered } | { ok: false; reason: string }

function classified(question: AnswerIndexQuestion, sourceCategories: string[] = []) {
  return classifyChatbotQuestion(question.redacted, sourceCategories)
}

function sentenceAt(units: ReadonlyMap<string, AnswerIndexUnit>, unitId: string, i: number, hash: string | undefined) {
  const sentence = units.get(unitId)?.sentences[i]
  if (!sentence) return null
  if (hash !== undefined && sentence.hash !== hash) return null
  return sentence
}

function leadFor(answer: DocCardAnswer, input: RenderInput): string | null {
  if (input.framing !== "full") return null
  const lead = answer.lead
  if (!lead || lead === "none") return null
  if (lead === "yes_can" || lead === "not_supported") {
    if (input.askType !== "yesno") return null
    const basis = answer.leadBasis
    if (!basis || !sentenceAt(input.ctx.index.currentUnits, basis.unit, basis.i, basis.hash)) return null
    return LEAD_TEXT[lead]
  }
  if (lead === "how_to") return input.askType === null || input.askType === "howto" || input.askType === "yesno" ? LEAD_TEXT.how_to : null
  return null
}

function unitSource(ctx: RespondContext, unit: AnswerIndexUnit, texts: string[]): AnswerIndexSource {
  return {
    title: unit.docTitle,
    heading: unit.heading,
    urlPath: unit.path,
    category: ctx.host.sourceCategory(unit.docCategory),
    excerpt: compactExcerpt(texts.join(" ")),
    score: SOURCE_SCORE,
  }
}

/** 단위 문장들의 출처(단위마다 하나, 나온 순서, 최대 2개). */
function sourcesOf(ctx: RespondContext, items: ParagraphSentence[]) {
  const byUnit = new Map<string, string[]>()
  for (const item of items) {
    const key = String(item.group)
    byUnit.set(key, [...(byUnit.get(key) ?? []), item.text])
  }
  const sources: AnswerIndexSource[] = []
  for (const [unitId, texts] of byUnit) {
    const unit = ctx.index.currentUnits.get(unitId)
    if (unit) sources.push(unitSource(ctx, unit, texts))
    if (sources.length >= MAX_SOURCES) break
  }
  return sources
}

function suggestionsFor(card: AnswerCard, category: string, host: AnswerIndexHost) {
  return card.suggestedQuestions && card.suggestedQuestions.length > 0 ? card.suggestedQuestions.slice(0, 3) : host.suggestedQuestions(category)
}

/** 카드 값(category·intent)이 있으면 그것을 쓴다(지금 분류 체계 그대로). */
function withCardClassification(parts: AnswerIndexCoreParts, card: AnswerCard): AnswerIndexCoreParts {
  return { ...parts, category: card.category ?? parts.category, intent: card.intent ?? parts.intent }
}

function renderDoc(card: Extract<AnswerCard, { kind: "doc" }>, input: RenderInput): RenderResult {
  const units = input.ctx.index.currentUnits
  const items: ParagraphSentence[] = []
  for (const ref of card.answer.sentences ?? []) {
    for (let k = 0; k < ref.ids.length; k += 1) {
      const sentence = sentenceAt(units, ref.unit, ref.ids[k], ref.hashes[k])
      if (!sentence) return { ok: false, reason: `stale_sentence:${ref.unit}#${ref.ids[k]}` }
      items.push({ group: ref.unit, id: sentence.i, text: sentence.text })
    }
  }
  if (items.length === 0) return { ok: false, reason: "no_sentence" }
  const paragraphs = groupSentenceParagraphs(items)
  const lead = leadFor(card.answer, input)
  if (lead) paragraphs[0] = `${lead} ${paragraphs[0]}`
  const sources = sourcesOf(input.ctx, items)
  const { category, intent, handoffIntent } = classified(input.question, sources.map((source) => source.category))
  const resolvedCategory = card.category ?? category
  const response: AnswerIndexResponse = {
    answer: paragraphs.join("\n\n"),
    answerMode: "direct_answer",
    confidence: input.conf,
    needsHandoff: Boolean(card.handoff),
    sources,
    suggestedQuestions: suggestionsFor(card, resolvedCategory, input.ctx.host),
    unresolved: false,
  }
  const body = groupSentenceParagraphs(items).join("\n\n")
  return {
    ok: true,
    value: {
      parts: { response, category: resolvedCategory, intent: card.intent ?? intent, handoffIntent: card.handoff ?? handoffIntent },
      continuation: body,
    },
  }
}

function triageFor(topicId: string, question: AnswerIndexQuestion): SymptomTriageResult | null {
  const routingText = glossForRouting(question.redacted)
  const tone = detectConversationTone(routingText)
  const compact = (tone.terse || tone.angry || tone.repeated) && !tone.anxious
  const upset = tone.angry || tone.repeated
  if (topicId === VAGUE_ERROR_TOPIC_ID) return buildVagueErrorAnswer({ compact: upset })
  const topic = symptomTopicById(topicId)
  return topic ? buildSymptomTopicAnswer(topic, { compact, upset, question: routingText }) : null
}

function rendered(parts: AnswerIndexCoreParts): RenderResult {
  return { ok: true, value: { parts, continuation: parts.response.answer } }
}

function renderHowto(card: Extract<AnswerCard, { kind: "howto" }>, input: RenderInput): RenderResult {
  const { host } = input.ctx
  if (card.answer.symptomTopic) {
    const triage = triageFor(card.answer.symptomTopic, input.question)
    if (!triage) return { ok: false, reason: `missing_symptom:${card.answer.symptomTopic}` }
    return rendered(withCardClassification(host.symptom(triage), card))
  }
  if (card.answer.guide) {
    const guide = findPublicGuide(card.answer.guide)
    if (!guide) return { ok: false, reason: `missing_guide:${card.answer.guide}` }
    return rendered(withCardClassification(host.guide(guide, input.question.redacted), card))
  }
  return { ok: false, reason: "howto_without_target" }
}

function renderText(card: AnswerCard, text: string, input: RenderInput): RenderResult {
  const { category, intent, handoffIntent } = classified(input.question)
  const resolvedCategory = card.category ?? category
  const response: AnswerIndexResponse = {
    answer: text,
    answerMode: "direct_answer",
    confidence: input.conf,
    needsHandoff: Boolean(card.handoff),
    sources: [],
    suggestedQuestions: suggestionsFor(card, resolvedCategory, input.ctx.host),
    unresolved: false,
  }
  return rendered({ response, category: resolvedCategory, intent: card.intent ?? intent, handoffIntent: card.handoff ?? handoffIntent })
}

function renderFixed(card: Extract<AnswerCard, { kind: "fixed" }>, input: RenderInput): RenderResult {
  const { host } = input.ctx
  if ("text" in card.answer) {
    if (answerTextHash(card.answer.text) !== card.answer.textHash) return { ok: false, reason: "text_hash" }
    return renderText(card, card.answer.text, input)
  }
  const ref = card.answer.curatedRef
  const found = findCuratedEntry(ref)
  if (!found) return { ok: false, reason: `missing_curated:${ref.module}:${ref.id}` }
  switch (found.module) {
    case "field":
    case "basics": {
      const entry = found.entry
      const text = entry.answer.join("\n\n")
      if (answerTextHash(text) !== ref.textHash) return { ok: false, reason: `curated_hash:${ref.module}:${ref.id}` }
      const source = found.module === "basics" && found.entry.docPath ? host.basicsSource(found.entry.docPath, found.entry.docHeading) : null
      const response: AnswerIndexResponse = {
        answer: text,
        answerMode: "direct_answer",
        confidence: input.conf,
        needsHandoff: Boolean(entry.handoff),
        sources: source ? [source] : [],
        suggestedQuestions: entry.suggestedQuestions,
        unresolved: false,
      }
      return rendered(
        withCardClassification(
          {
            response,
            category: entry.category,
            intent: entry.handoff === "demo" ? "sales_consulting" : entry.handoff ? "troubleshooting" : "docs_lookup",
            handoffIntent: entry.handoff ?? "support",
            englishSummary: entry.en,
            suppressSalesFollowUp: !entry.salesFollowUp,
            topicId: entry.id,
          },
          card
        )
      )
    }
    case "self": {
      if (answerTextHash(found.entry.answer.join("\n\n")) !== ref.textHash) return { ok: false, reason: `curated_hash:self:${ref.id}` }
      return rendered(withCardClassification(host.selfKnowledge(found.entry), card))
    }
    case "symptom": {
      const triage = triageFor(found.topic?.id ?? VAGUE_ERROR_TOPIC_ID, input.question)
      if (!triage) return { ok: false, reason: `missing_symptom:${ref.id}` }
      return rendered(withCardClassification(host.symptom(triage), card))
    }
    case "guide":
      return rendered(withCardClassification(host.guide(found.guide, input.question.redacted), card))
  }
}

function relatedSentences(ctx: RespondContext, refs: readonly SingleSentenceRef[]) {
  const items: ParagraphSentence[] = []
  for (const ref of refs.slice(0, 2)) {
    const sentence = sentenceAt(ctx.index.currentUnits, ref.unit, ref.i, ref.hash)
    if (sentence) items.push({ group: ref.unit, id: sentence.i, text: sentence.text })
  }
  return items
}

function renderGap(card: GapAnswerCard, input: RenderInput): RenderResult {
  const { ctx, question } = input
  const related = relatedSentences(ctx, card.answer?.related ?? [])
  const second = ctx.host.noSourceAnswer.split("\n\n").slice(1).join("\n\n")
  const lines = [
    gapLeadLine(card.topic),
    related.length > 0 ? `${GAP_RELATED_INTRO}\n${groupSentenceParagraphs(related).join("\n")}` : null,
    second || null,
  ].filter((line): line is string => Boolean(line))
  const sources = sourcesOf(ctx, related)
  const handoff = card.answer?.handoff ?? card.handoff ?? null
  const { category, intent, handoffIntent } = classified(question, sources.map((source) => source.category))
  const resolvedCategory = card.category ?? category
  const response: AnswerIndexResponse = {
    answer: lines.join("\n\n"),
    answerMode: "fallback",
    confidence: input.conf,
    needsHandoff: Boolean(handoff),
    sources,
    suggestedQuestions: suggestionsFor(card, resolvedCategory, ctx.host),
    unresolved: true,
  }
  return {
    ok: true,
    value: {
      parts: { response, category: resolvedCategory, intent: card.intent ?? intent, handoffIntent: handoff ?? handoffIntent },
      continuation: gapLeadLine(card.topic),
    },
  }
}

function renderCard(card: AnswerCard, input: RenderInput): RenderResult {
  switch (card.kind) {
    case "doc":
      return renderDoc(card, input)
    case "howto":
      return renderHowto(card, input)
    case "fixed":
      return renderFixed(card, input)
    case "policy":
      if (answerTextHash(card.answer.text) !== card.answer.textHash) return { ok: false, reason: "text_hash" }
      return renderText(card, card.answer.text, input)
    case "gap":
      return renderGap(card, input)
    case "handoff":
      return rendered(withCardClassification(input.ctx.host.handoff(input.question.redacted, card.answer.handoffKind), card))
    default:
      return { ok: false, reason: "unknown_kind" }
  }
}

/** 리드·꼬리를 붙이지 않는 카드(사람이 정한 글). */
function isPolicyGoverned(card: AnswerCard) {
  return card.kind === "policy" || (card.kind === "fixed" && card.policyGoverned === true)
}

// ─── 못 찾음·되묻기 ──────────────────────────────────────────────────────

function abstainParts(reason: "nodoc" | "symptom", question: AnswerIndexQuestion, host: AnswerIndexHost, conf: number): AnswerIndexCoreParts {
  const { category, intent, handoffIntent } = classified(question)
  const symptom = reason === "symptom"
  return {
    response: {
      answer: symptom ? host.symptomAbstainAnswer : host.noSourceAnswer,
      answerMode: "fallback",
      confidence: Math.min(conf, symptom ? 0.3 : 0.2),
      needsHandoff: symptom,
      sources: [],
      suggestedQuestions: host.suggestedQuestions(category),
      unresolved: true,
    },
    category,
    intent,
    handoffIntent: symptom ? "support" : handoffIntent,
  }
}

function clarifyParts(question: AnswerIndexQuestion, host: AnswerIndexHost): AnswerIndexCoreParts {
  return host.symptom(triageFor(VAGUE_ERROR_TOPIC_ID, question) ?? buildVagueErrorAnswer())
}

// ─── 합치기 ──────────────────────────────────────────────────────────────

function mergeSources(a: AnswerIndexSource[], b: AnswerIndexSource[]) {
  const seen = new Set<string>()
  const merged: AnswerIndexSource[] = []
  for (const source of [...a, ...b]) {
    const key = `${source.urlPath}#${source.heading ?? ""}`
    if (seen.has(key)) continue
    seen.add(key)
    merged.push(source)
  }
  return merged.slice(0, MAX_SOURCES)
}

function roundConf(value: number) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0
}

/**
 * 결정 → 코어 조각(+흔적). question 은 가린 글이 든 질문, startedAt 은 요청 시작 시각(ms).
 * 응답 객체는 host.markFinal 로 결정형 최종 답 표시를 한다(스트림 경로가 모델로 다시 쓰지 않게).
 */
export function buildAnswerIndexCore(
  decision: AnswerIndexDecision,
  question: AnswerIndexQuestion,
  startedAt: number,
  ctx: RespondContext
): AnswerIndexCore {
  const env = ctx.env ?? process.env
  const framing = compiledFraming(env)
  const trace = toAnswerIndexTrace(decision, { version: ctx.version, router: ctx.router })
  const conf = roundConf(decision.conf)
  const input: RenderInput = { ctx, question, askType: decision.askType, framing, conf }

  const finish = (parts: AnswerIndexCoreParts, overrides: Partial<AnswerIndexTrace> = {}): AnswerIndexCore => {
    ctx.host.markFinal(parts.response)
    return { ...parts, latencyMs: Math.max(0, Date.now() - startedAt), answerIndex: { ...trace, ...overrides } }
  }
  const unavailable = (reason: string) =>
    finish(abstainParts("nodoc", question, ctx.host, conf), { decision: "abstain", card: null, partial: false, absentTail: null, decidedBy: null, unavailable: reason })

  if (decision.kind === "clarify") return finish(clarifyParts(question, ctx.host), { partial: false })
  if (decision.kind === "abstain") return finish(abstainParts(decision.abstainReason === "symptom" ? "symptom" : "nodoc", question, ctx.host, conf), { partial: false })

  const cardAt = decision.card ? ctx.index.cardById.get(decision.card) : undefined
  if (cardAt === undefined) return unavailable(`missing_card:${decision.card ?? ""}`)
  const card = ctx.index.cards[cardAt].card
  const primary = renderCard(card, input)
  if (!primary.ok) return unavailable(`${decision.card}:${primary.reason}`)

  const parts: AnswerIndexCoreParts = { ...primary.value.parts, response: { ...primary.value.parts.response } }
  const response = parts.response
  const extra: string[] = []
  let tailed = false
  let unanswered = false

  // 두 조각: 다른 카드로 답한 조각을 잇고, 못 찾은 조각은 한 줄(full 일 때만). 같은 카드는 한 번만 잇는다(조각 둘이 같은 카드를 가리킬 수 있다).
  const rendered = new Set<string>(decision.card ? [decision.card] : [])
  for (const segment of decision.segments ?? []) {
    if (segment.card && rendered.has(segment.card) && (segment.kind === "answer" || segment.kind === "gap")) continue
    if (segment.card) rendered.add(segment.card)
    const segmentAt = segment.card ? ctx.index.cardById.get(segment.card) : undefined
    const segmentResult =
      (segment.kind === "answer" || segment.kind === "gap") && segmentAt !== undefined
        ? renderCard(ctx.index.cards[segmentAt].card, { ...input, askType: detectAskType(normalizeText(segment.text)), conf: roundConf(segment.conf) })
        : null
    if (!segmentResult || !segmentResult.ok) {
      unanswered = true
      continue
    }
    const other = segmentResult.value
    extra.push(other.continuation)
    response.sources = mergeSources(response.sources, other.parts.response.sources)
    response.suggestedQuestions = Array.from(new Set([...response.suggestedQuestions, ...other.parts.response.suggestedQuestions])).slice(0, 3)
    if (!response.needsHandoff && other.parts.response.needsHandoff) {
      response.needsHandoff = true
      parts.handoffIntent = other.parts.handoffIntent
    }
  }
  if (unanswered && framing === "full" && !isPolicyGoverned(card)) {
    extra.push(UNANSWERED_SEGMENT_LINE)
    tailed = true
  }

  // 없는 부분 꼬리(full 일 때만, 검증된 이름만).
  let absentTail: string | null = null
  if (decision.kind === "answer" && decision.absentTail && framing === "full" && !isPolicyGoverned(card)) {
    const label = ctx.index.absent.byId.get(decision.absentTail)?.label
    if (label) {
      extra.push(absentTailLine(label))
      absentTail = decision.absentTail
      tailed = true
    }
  }
  if (extra.length > 0) response.answer = [response.answer, ...extra].join("\n\n")

  return finish(parts, { partial: decision.kind === "answer" && tailed, absentTail })
}
