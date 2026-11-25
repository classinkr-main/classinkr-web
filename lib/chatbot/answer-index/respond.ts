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
 * 질문이 둘 이상으로 나뉘면(decision.segments) 조각마다 【주제】 머리 줄 + 결론 문단을 질문 순서로 잇고, 답하지 못한 조각은 같은 자리에 사실대로 한 줄
 * (카드가 있을 법한데 못 고름 → "따로 한 번 더 물어봐 주세요", 공개 안내에 없음 → "상담으로 확인해 드릴게요")을 둔다. 끝맺음은 답 끝에 한 줄. 길이 상한은
 * 2조각 700자·3조각 900자(넘으면 조각마다 결론 문단만, 그래도 넘으면 가장 긴 조각을 '따로 물어봐 주세요'로 바꾼다). 소리 없이 조각을 버리지 않는다.
 * compiled 답은 마지막에 shape.ts 로 줄바꿈·목록·표기를 가지런히 한다(CHATBOT_COMPILED_SHAPE, 기본 on).
 *
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
import { blockKind, compiledShapeEnabled, fromBlocks, isClosingLine, shapeAnswer, toBlocks } from "./shape"
import type {
  AnswerCard,
  AnswerIndexDecision,
  AnswerIndexSegmentDecision,
  AnswerIndexRouter,
  AnswerIndexTrace,
  AnswerIndexTraceSegment,
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

/** 복합 질문 답 길이 상한(결정 1): 2조각 700자, 3조각 이상 900자. */
export function compoundLengthCap(pieces: number) {
  return pieces >= 3 ? 900 : 700
}

/** 못 답한 조각 알림 두 가지(카드가 있을 법한데 이번에 못 고름 / 공개 안내에 없음). 지금까지의 고정 줄("함께 물어보신 다른 내용은 …")은 거짓인 경우가 많아 없앴다. */
export const SEGMENT_RETRY_LINE = "이 내용은 따로 한 번 더 물어봐 주세요."
export const SEGMENT_ABSENT_LINE = "공개 안내에는 없는 내용이라 상담으로 확인해 드릴게요."
/** 알림 줄이 있을 때 답 맨 끝에 한 줄(필요할 때만). */
export const COMPOUND_CLOSING_LINE = "더 궁금한 점은 \"상담원 연결\"이라고 남겨 주세요."
/** 못 답한 조각 알림을 '없음'으로 말해도 되는 기준: 그 조각만 물었을 때 1위 카드 확신도가 이보다 낮으면 있을 법한 카드가 없다고 본다. */
export const SEGMENT_PLAUSIBLE_CONF = 0.08

const ORDINALS = ["첫 번째", "두 번째", "세 번째", "네 번째", "다섯 번째"]

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
  /** 공백 카드의 관련 문장(복합 질문의 '없음' 알림 아래에 붙인다). */
  related?: string[]
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

/** 문단 안의 문장 모음. 결론 문장(first)은 문장 하나만 앞 문단으로 옮긴다(문장 집합은 같고 순서만 바뀐다). */
function docParagraphs(answer: DocCardAnswer, items: ParagraphSentence[], input: RenderInput): string[] {
  const first = answer.first
  if (input.framing === "full" && first) {
    const at = items.findIndex((item) => String(item.group) === first.unit && item.id === first.i)
    const moved = at >= 0 && sentenceAt(input.ctx.index.currentUnits, first.unit, first.i, first.hash) ? items[at] : null
    if (moved && at > 0) {
      // 원래 문단 구성은 그대로 두고, 결론 문장만 빼서 맨 앞 문단으로 올린다.
      const groups: ParagraphSentence[][] = []
      let current: ParagraphSentence[] = []
      for (const item of items) {
        const previous = current.at(-1)
        if (previous && (previous.group !== item.group || item.id !== previous.id + 1)) {
          groups.push(current)
          current = []
        }
        current.push(item)
      }
      if (current.length > 0) groups.push(current)
      const rest = groups.map((group) => group.filter((item) => item !== moved).map((item) => item.text).join(" ")).filter(Boolean)
      return [moved.text, ...rest]
    }
  }
  return groupSentenceParagraphs(items)
}

/** 새로 쓴 결론 한 줄(headline). 근거 문장이 지금 문서와 맞을 때만 쓴다(없으면 지금과 같다). */
function headlineFor(answer: DocCardAnswer, input: RenderInput): string | null {
  if (input.framing !== "full" || answer.first || !answer.headline) return null
  const { text, basis } = answer.headline
  if (!text.trim() || basis.length === 0) return null
  for (const ref of basis) if (!sentenceAt(input.ctx.index.currentUnits, ref.unit, ref.i, ref.hash)) return null
  return text.trim()
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
  const paragraphs = docParagraphs(card.answer, items, input)
  const headline = headlineFor(card.answer, input)
  // 결론 한 줄이 있으면 그것이 리드다(예/아니오 리드와 겹치지 않게 리드는 붙이지 않는다).
  const lead = headline ? null : leadFor(card.answer, input)
  if (headline) paragraphs.unshift(headline)
  else if (lead) paragraphs[0] = `${lead} ${paragraphs[0]}`
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
  return {
    ok: true,
    value: {
      parts: { response, category: resolvedCategory, intent: card.intent ?? intent, handoffIntent: card.handoff ?? handoffIntent },
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
  return { ok: true, value: { parts } }
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
      related: related.map((item) => item.text),
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

// ─── 복합 질문 조각 ──────────────────────────────────────────────────────

/**
 * 머리 줄 이름: 카드 주제(고정 문구)에서 괄호 설명을 빼고, 길면 첫 묶음("…와 …"·"…·…"의 앞쪽)이나 낱말 경계에서 자른다. 손님 글은 쓰지 않는다.
 * 길이 안쪽(max 이하)이면 그대로, 자르면 끝에 …을 붙인다.
 */
export function shortTopic(topic: string, max = 22) {
  const plain = topic.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim()
  if (plain.length <= max) return plain
  // 묶음 경계("A와 B", "A·B", "A, B", "A 및 B", "A 또는 B")에서 max 안쪽으로 가장 긴 앞부분.
  let best = ""
  for (const match of plain.matchAll(/(?<=[가-힣A-Za-z0-9])(?:와|과)(?= )|,| 및 | 또는 | 등 /g)) {
    const head = plain.slice(0, match.index).trim()
    if (head.length >= 7 && head.length <= max) best = head
  }
  if (best) return best
  const cut = plain.slice(0, max + 1)
  const at = cut.lastIndexOf(" ")
  const head = (at >= 7 ? cut.slice(0, at) : plain.slice(0, max)).trim().replace(/[·,\s]+$/, "")
  return `${head}…`
}

const headerLine = (label: string) => `【${label}】`

export interface PieceAnswer {
  kind: "answer"
  label: string
  /** 다듬은 본문 덩이(머리 줄 제외, 끝맺음 줄 제외). */
  blocks: string[][]
  closing: string | null
  card: AnswerCard
  parts: AnswerIndexCoreParts
}

export interface PieceNotice {
  kind: "retry" | "absent"
  label: string
  /** 공백 카드의 관련 문장. */
  related: string[]
  card: AnswerCard | null
  parts: AnswerIndexCoreParts | null
}

export type Piece = PieceAnswer | PieceNotice

const isAnswerPiece = (piece: Piece): piece is PieceAnswer => piece.kind === "answer"

function ordinalLabel(at: number) {
  return `${ORDINALS[at] ?? `${at + 1}번째`} 질문`
}

/** 본문 덩이에서 끝맺음 줄(맨 끝 덩이의 끝 줄들)을 거둔다. */
function takeClosing(blocks: string[][]) {
  const out = blocks.map((lines) => [...lines])
  const taken: string[] = []
  while (out.length > 0) {
    const lines = out[out.length - 1]
    if (blockKind(lines) !== "plain") break
    let moved = false
    while (lines.length > 0 && isClosingLine(lines[lines.length - 1])) {
      taken.unshift(lines.pop()!)
      moved = true
    }
    if (lines.length === 0) out.pop()
    else if (!moved) break
    else break
  }
  return { blocks: out, closing: taken.length > 0 ? taken[taken.length - 1] : null }
}

/** 조각 본문: 평문 덩이는 앞에서 둘까지(목록은 그대로). */
function limitBlocks(blocks: string[][], plainMax = 2) {
  const out: string[][] = []
  let plain = 0
  for (const lines of blocks) {
    if (blockKind(lines) === "plain") {
      plain += 1
      if (plain > plainMax) break
    }
    out.push(lines)
  }
  return out
}

/** 조각 본문을 결론만 남긴다: 첫 덩이가 문장이면 그 덩이의 첫 줄들(문장 하나), 목록이면 첫 항목 하나와 이어 묻기 한 줄. */
function conclusionOnly(blocks: string[][], deeper = false): string[][] {
  const first = blocks[0]
  if (!first) return blocks
  if (blockKind(first) === "plain") return [deeper ? [first[0]] : first]
  const text = first[0].replace(/^(?:\d+[.)]|[-•·*–])\s+/, "")
  return [[text], ["이어지는 내용은 이 질문만 따로 한 번 더 물어봐 주세요."]]
}

function pieceText(piece: Piece, blocksOverride?: string[][]) {
  const header = headerLine(piece.label)
  if (isAnswerPiece(piece)) {
    const blocks = blocksOverride ?? piece.blocks
    if (blocks.length === 0) return header
    // 머리 줄은 문장 덩이에 붙이고, 목록이 바로 이어지면 빈 줄을 둔다(위젯이 목록을 그리려면 덩이가 목록 줄뿐이어야 한다).
    if (blockKind(blocks[0]) === "plain") return fromBlocks([[header, ...blocks[0]], ...blocks.slice(1)])
    return fromBlocks([[header], ...blocks])
  }
  const lines = [piece.kind === "absent" ? SEGMENT_ABSENT_LINE : SEGMENT_RETRY_LINE]
  const blocks: string[][] = [[header, ...lines]]
  if (piece.kind === "absent" && piece.related.length > 0) blocks.push([GAP_RELATED_INTRO, ...piece.related])
  return fromBlocks(blocks)
}

/** 복합 답 합치기(조각 목록 → 본문 글). 길이 상한을 넘으면 조각마다 결론 문단만, 그래도 넘으면 가장 긴 조각부터 '따로 물어봐 주세요'로 바꾼다. */
export function assemblePieces(pieces: Piece[], tail: string[], closing: string | null, cap: number) {
  type Mode = "full" | "conclusion" | "line" | "dropped"
  const modes: Mode[] = pieces.map(() => "full")
  const work: Piece[] = [...pieces]
  const render = () =>
    [
      ...work.map((piece, at) => {
        if (!isAnswerPiece(piece)) return pieceText(piece)
        const mode = modes[at]
        if (mode === "full") return pieceText(piece)
        return pieceText(piece, conclusionOnly(piece.blocks, mode === "line"))
      }),
      ...tail,
      ...(closing ? [closing] : []),
    ].join("\n\n")
  let text = render()
  const steps: Mode[] = ["conclusion", "line"]
  for (const step of steps) {
    if (text.length <= cap) break
    work.forEach((piece, at) => {
      if (isAnswerPiece(piece)) modes[at] = step
    })
    text = render()
  }
  // 그래도 넘으면 가장 긴 답한 조각부터 알림으로 바꾼다(답한 조각이 하나는 남게).
  while (text.length > cap) {
    const answered = work.map((piece, at) => ({ piece, at })).filter((item) => isAnswerPiece(item.piece))
    if (answered.length <= 1) break
    const longest = answered.reduce((a, b) => (pieceText(b.piece, conclusionOnly((b.piece as PieceAnswer).blocks, true)).length > pieceText(a.piece, conclusionOnly((a.piece as PieceAnswer).blocks, true)).length ? b : a))
    const source = longest.piece as PieceAnswer
    work[longest.at] = { kind: "retry", label: source.label, related: [], card: source.card, parts: source.parts }
    modes[longest.at] = "dropped"
    text = render()
  }
  return { text, modes, pieces: work }
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

/** 문장 덩이가 아닌 줄 단위 본문을 shape 로 다듬어 덩이로 돌려준다(빈 리드를 걷고 끝맺음은 거두지 않는다). */
function shapedBlocks(text: string, shape: boolean) {
  const shaped = shape ? shapeAnswer(text, { keepClosings: true }).text : text
  return toBlocks(shaped)
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
  const shape = compiledShapeEnabled(env)
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
  if (decision.kind === "abstain") {
    // 나뉜 질문의 어느 조각도 못 정했으면 고정 못 찾음 문구 하나(카드가 있을 법한 조각도 '없다'고 말하게 된다) 대신 조각마다 사실대로 한 줄씩 낸다.
    const pieces = decision.segments
    if (framing === "full" && decision.abstainReason !== "symptom" && pieces && pieces.length >= 2) {
      const compound = buildCompound(decision, pieces, input, shape, abstainParts("nodoc", question, ctx.host, conf))
      if (compound?.ok) return finish(compound.parts, { ...compound.overrides, partial: false, absentTail: null })
    }
    return finish(abstainParts(decision.abstainReason === "symptom" ? "symptom" : "nodoc", question, ctx.host, conf), { partial: false })
  }

  const cardAt = decision.card ? ctx.index.cardById.get(decision.card) : undefined
  if (cardAt === undefined) return unavailable(`missing_card:${decision.card ?? ""}`)
  const card = ctx.index.cards[cardAt].card

  const segments = decision.segments && decision.segments.length >= 2 ? decision.segments : null
  if (segments) {
    const compound = buildCompound(decision, segments, input, shape)
    if (compound) {
      if (!compound.ok) return unavailable(compound.reason)
      return finish(compound.parts, compound.overrides)
    }
  }

  const primary = renderCard(card, input)
  if (!primary.ok) return unavailable(`${decision.card}:${primary.reason}`)

  const parts: AnswerIndexCoreParts = { ...primary.value.parts, response: { ...primary.value.parts.response } }
  const response = parts.response
  const extra: string[] = []
  let tailed = false

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
  if (shape) response.answer = shapeAnswer(response.answer).text

  return finish(parts, { partial: decision.kind === "answer" && tailed, absentTail })
}

type CompoundResult =
  | { ok: true; parts: AnswerIndexCoreParts; overrides: Partial<AnswerIndexTrace> }
  | { ok: false; reason: string }

/**
 * 복합 질문 답(계획 §2.3). 조각을 질문 순서로 잇는다. 같은 카드로 답한 조각이 여럿이면 처음 한 번만 싣는다.
 * 모든 조각이 한 카드로 답했고 못 답한 조각이 없으면 null(한 카드 답으로 만든다).
 */
function buildCompound(decision: AnswerIndexDecision, segments: AnswerIndexSegmentDecision[], input: RenderInput, shape: boolean, base: AnswerIndexCoreParts | null = null): CompoundResult | null {
  const { ctx } = input
  const { framing } = input
  const pieces: Piece[] = []
  const noticeOf: boolean[] = []
  /** 조각 → pieces 안 자리(같은 카드로 이미 답한 조각은 그 카드의 자리). */
  const pieceAt: number[] = []
  const renderedCards = new Map<string, number>()
  const failures: string[] = []
  let undecided = false
  segments.forEach((segment, at) => {
    const decided = segment.kind === "answer" || segment.kind === "gap"
    const cardIndex = decided && segment.card ? ctx.index.cardById.get(segment.card) : undefined
    if (cardIndex === undefined) {
      undecided = true
      const absentLabel = segment.absentHit ? ctx.index.absent.byId.get(segment.absentHit)?.label : undefined
      const plausible = (segment.topConf ?? 0) >= SEGMENT_PLAUSIBLE_CONF
      const absent = Boolean(absentLabel) || (segment.source !== "overflow" && Boolean(segment.topCard) && !plausible) || (!segment.topCard && segment.source !== "overflow")
      pieceAt.push(pieces.length)
      pieces.push({ kind: absent ? "absent" : "retry", label: absentLabel ?? ordinalLabel(at), related: [], card: null, parts: null })
      noticeOf.push(true)
      return
    }
    if (segment.card && renderedCards.has(segment.card)) {
      pieceAt.push(renderedCards.get(segment.card)!)
      noticeOf.push(false)
      return
    }
    const card = ctx.index.cards[cardIndex].card
    const result = renderCard(card, { ...input, askType: detectAskType(normalizeText(segment.text)), conf: roundConf(segment.conf) })
    if (!result.ok) {
      failures.push(`${segment.card}:${result.reason}`)
      pieceAt.push(pieces.length)
      pieces.push({ kind: "retry", label: ordinalLabel(at), related: [], card, parts: null })
      noticeOf.push(true)
      return
    }
    if (segment.card) renderedCards.set(segment.card, pieces.length)
    pieceAt.push(pieces.length)
    noticeOf.push(false)
    const label = shortTopic(card.topic) || ordinalLabel(at)
    if (card.kind === "gap") {
      pieces.push({ kind: "absent", label, related: result.value.related ?? [], card, parts: result.value.parts })
      return
    }
    const closed = takeClosing(shapedBlocks(result.value.parts.response.answer, shape))
    pieces.push({ kind: "answer", label, blocks: limitBlocks(closed.blocks), closing: closed.closing, card, parts: result.value.parts })
  })

  const answered = pieces.filter(isAnswerPiece)
  const notices = pieces.filter((piece) => !isAnswerPiece(piece))
  if (answered.length === 0 && pieces.every((piece) => piece.kind === "retry") && failures.length > 0) return { ok: false, reason: failures[0] }
  // 한 카드 답으로 충분한 경우(조각이 모두 같은 카드, 알림 없음)는 단일 답 경로가 처리한다.
  if (!base) {
    if (notices.length === 0 && answered.length <= 1) return null
    if (!undecided && failures.length === 0 && renderedCards.size <= 1) return null
    if (answered.length === 0 && notices.every((piece) => piece.kind === "absent" && !piece.card)) return null
  }

  const first = answered[0] ?? pieces.find((piece): piece is PieceNotice => piece.card !== null && piece.parts !== null)
  const source = first?.parts ?? base
  if (!source) return null
  const parts: AnswerIndexCoreParts = { ...source, response: { ...source.response } }
  const response = parts.response

  // 합친 출처·추천 질문·상담 필요.
  response.sources = []
  response.suggestedQuestions = base ? [...base.response.suggestedQuestions] : []
  response.needsHandoff = false
  for (const piece of pieces) {
    if (!piece.parts) continue
    response.sources = mergeSources(response.sources, piece.parts.response.sources)
    response.suggestedQuestions = Array.from(new Set([...response.suggestedQuestions, ...piece.parts.response.suggestedQuestions]))
    if (piece.parts.response.needsHandoff && !response.needsHandoff) {
      response.needsHandoff = true
      parts.handoffIntent = piece.parts.handoffIntent
    }
  }
  // 못 답한 조각을 추천 질문 맨 앞에(손님이 그대로 눌러 따로 물을 수 있게).
  const unanswered = segments.filter((_segment, at) => noticeOf[at]).map((segment) => (segment.scoringText ?? segment.text).trim()).filter((text) => text.length > 0 && text.length <= 80)
  response.suggestedQuestions = Array.from(new Set([...unanswered, ...response.suggestedQuestions])).slice(0, 3)
  response.confidence = Math.min(response.confidence, ...pieces.map((piece) => (piece.parts ? piece.parts.response.confidence : 1)))
  const anyAnswered = answered.length > 0
  response.unresolved = !anyAnswered
  response.answerMode = anyAnswered ? "direct_answer" : "fallback"

  const verbatim = framing !== "full"
  if (verbatim) {
    // 문서 문장·점검 통과본만: 머리 줄·알림·끝맺음 없이 답한 조각 본문만 질문 순서로 잇는다.
    response.answer = answered.map((piece) => fromBlocks(piece.blocks)).join("\n\n")
    return { ok: true, parts, overrides: { partial: false, absentTail: null } }
  }

  // 없는 부분 꼬리(검증된 이름만, 정책 카드가 있으면 붙이지 않는다).
  const tail: string[] = []
  let absentTail: string | null = null
  if (decision.kind === "answer" && decision.absentTail && !answered.some((piece) => isPolicyGoverned(piece.card))) {
    const label = ctx.index.absent.byId.get(decision.absentTail)?.label
    if (label) {
      tail.push(absentTailLine(label))
      absentTail = decision.absentTail
    }
  }
  const hasAbsentNotice = notices.some((piece) => piece.kind === "absent")
  const closings = answered.map((piece) => piece.closing).filter((line): line is string => Boolean(line))
  const closing = closings.length > 0 ? closings[closings.length - 1] : notices.length > 0 ? COMPOUND_CLOSING_LINE : null
  if (hasAbsentNotice && !response.needsHandoff) {
    response.needsHandoff = true
    parts.handoffIntent = "support"
  }
  const assembled = assemblePieces(pieces, tail, closing, compoundLengthCap(segments.length))
  response.answer = assembled.text
  const dropped = assembled.pieces.filter((_piece, at) => assembled.modes[at] === "dropped").length
  const compacted = assembled.modes.filter((mode) => mode === "conclusion" || mode === "line").length
  const traceParts: AnswerIndexTraceSegment[] = segments.map((segment, at) => {
    const decided = segment.kind === "answer" || segment.kind === "gap"
    const piece = assembled.pieces[pieceAt[at]]
    const noticeKind = piece && !isAnswerPiece(piece) ? piece.kind : piece && assembled.modes[pieceAt[at]] === "dropped" ? "retry" : null
    return {
      text: segment.text,
      kind: segment.kind,
      card: segment.card,
      by: segment.by ?? (segment.card && decided ? "index" : "none"),
      ...(segment.source ? { source: segment.source } : {}),
      ...(segment.topCard ? { topCard: segment.topCard, topConf: segment.topConf ?? 0 } : {}),
      notice: noticeKind !== null,
      ...(noticeKind ? { noticeKind } : {}),
    }
  })
  return {
    ok: true,
    parts,
    overrides: {
      partial: notices.length > 0 || dropped > 0 || Boolean(absentTail),
      absentTail,
      parts: traceParts,
      compound: { chars: assembled.text.length, cap: compoundLengthCap(segments.length), compacted, dropped },
    },
  }
}
