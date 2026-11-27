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
 * 질문이 둘 이상으로 나뉘면(decision.segments) 조각마다 【주제】 머리 줄 + 카드 본문(길이 상한 안에서)을 질문 순서로 잇고, 답하지 못한 조각은 같은 자리에 사실대로 한 줄을
 * 둔다: 그 조각만 물으면 답이 나옴 → "따로 한 번 더 물어봐 주세요", 공백 카드·없는 개념 → "공개 안내에는 없는 내용…", 증상 → 증상 안내, 그 밖 →
 * "공개 안내에서 바로 찾지 못했어요"(상담 버튼). 어느 조각도 못 정했으면 예전처럼 못 찾음 한 덩이다. 끝맺음은 필요할 때만 답 끝에 한 줄. 길이 상한은
 * 2조각 700자·3조각 900자에서 서비스 후속 줄 몫을 뺀 값이고, 넘으면 가장 긴 조각부터 하나씩 줄인다(정책 글은 줄이지 않고 알림으로). 소리 없이 조각을 버리지 않는다.
 * compiled 답은 마지막에 shape.ts 로 줄바꿈·목록·표기를 가지런히 한다(CHATBOT_COMPILED_SHAPE, 기본 on).
 *
 * R3 a1 스위치(모두 compiled 경로 안에서만 돈다. legacy 경로에는 닿지 않는다. 끄면 R2 와 바이트가 같다):
 * - CHATBOT_COMPILED_TONE=yo(기본)|off: 카드 글의 니다체 문장 끝을 요체로(yo-tone.ts). 정책 글(policy·policyGoverned)과 toneLocked 카드는 바꾸지 않는다.
 * - CHATBOT_COMPILED_ARROW=arrow(기본)|gt: 경로 기호 →, 「」는 문서 제목만, 옛 메뉴 이름 → 현행명, 줄 앞 ※ 뗌(shape.ts unifyNotation).
 * - CHATBOT_COMPOUND_HEAD=number(기본)|bracket: 복합 답 머리를 "1. 주제" + 바로 아래 결론 줄로, 조각 안 단계는 "-" 점 목록 3개까지, 머리만 있는 덩이는
 *   만들지 않는다. 넘친 조각(overflow)도 번호째 '따로 물어봐 주세요' 알림으로 두고 추천 질문에 넣는다. 모든 조각을 못 정했어도 번호째 알림을 둔다
 *   (번호 수 + 묶인 조각 수 = 조각 수). 4조각 이상 길이 상한 1,000자. bracket 이면 R2 의 【주제】 꼴.
 * - CHATBOT_COMPILED_FORM=r3(기본)|r2: 공백 답 첫 줄을 한 문장으로(규격 S11), doc·howto 답의 6단계 넘는 번호 목록을 5단계 + 「문서 제목」 한 줄로(S2),
 *   두 문장 마무리 줄('그래도 안 되면 … 남겨 주세요. … 알려 주시면 …')을 한 줄로 둔다(S6).
 * - CHATBOT_COMPILED_SKIP_TRIED=on|off(기본): 질문에 '이미 해 본 동작'(RespondContext.tried)이 있으면 그 동작 단계를 빼고 둘째 줄에 밝힌다(S14).
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
import { detectAskType, isQuestionSentence, normalizeForIndex, normalizeText, wordsOf } from "./normalize"
import { groupSentenceParagraphs, type ParagraphSentence } from "./paragraphs"
import {
  blockKind,
  compiledForm,
  compiledShapeEnabled,
  fromBlocks,
  isClosingLine,
  isClosingTemplate,
  shapeAnswer,
  singleItemLines,
  shapeOptionsFor,
  toBlocks,
  type CompiledForm,
  type ShapeOptions,
} from "./shape"
import type {
  AnswerCard,
  AnswerIndexDecision,
  AnswerIndexNoticeKind,
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
  /**
   * 질문에서 뽑은 '이미 해 본 동작'(DecideContext.tried 와 같은 값, 규격 S14: reinstall·restart·update·relogin). CHATBOT_COMPILED_SKIP_TRIED=on 일 때만
   * 그 동작 단계를 뺀다. 없으면 빼지 않는다.
   */
  tried?: readonly string[]
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

/**
 * CHATBOT_COMPILED_HEADLINE=on 일 때만 doc 카드의 결론 한 줄(headline, 새로 쓴 글)을 그린다. 기본은 꺼짐(결정 10: 100장 시험 단계 —
 * compiled 측정에서만 켠다). 켜도 근거 문장이 첫 문단에 있으면 같은 말을 두 번 하게 되어 그리지 않는다(R2 검토 품질-5).
 */
export function compiledHeadlineEnabled(env: Env = process.env): boolean {
  return env.CHATBOT_COMPILED_HEADLINE?.trim().toLowerCase() === "on"
}

/** 복합 답 머리 꼴(R3 D2): number = "1. 주제"(기본), bracket = R2 의 【주제】. */
export type CompoundHeadMode = "number" | "bracket"

/** CHATBOT_COMPOUND_HEAD: number(기본, numbered 도 받음) · bracket. */
export function compoundHeadMode(env: Env = process.env): CompoundHeadMode {
  return env.CHATBOT_COMPOUND_HEAD?.trim().toLowerCase() === "bracket" ? "bracket" : "number"
}

export { compiledForm, type CompiledForm }

/** CHATBOT_COMPILED_SKIP_TRIED: on 일 때만(기본 off, 측정 뒤 켠다). */
export function compiledSkipTried(env: Env = process.env): boolean {
  return env.CHATBOT_COMPILED_SKIP_TRIED?.trim().toLowerCase() === "on"
}

export const LEAD_TEXT: Record<Exclude<AnswerLead, "none">, string> = {
  yes_can: "네, 할 수 있어요.",
  how_to: "이렇게 하면 돼요.",
  not_supported: "공개 안내 기준으로는 지원하지 않아요.",
}

/**
 * 공백 카드 답 틀 첫 줄(§3.6, §14 결정 과제 10). {topic} 은 카드 topic(조사 없음).
 * r3(기본, 규격 S11): 한 문장 "…공개 안내에서 확인되지 않았어요." — 결론도 행동도 아닌 '추측해 말씀드리지 않을게요'는 뺀다.
 * r2: 두 줄(주제 길이와 상관없이 늘 두 줄, 품질-14).
 */
export function gapLeadLine(topic: string, form: CompiledForm = compiledForm()) {
  if (form === "r3") return `${topic}에 대한 내용은 공개 안내에서 확인되지 않았어요.`
  return `${topic}에 대한 내용은 공개 안내에서 찾지 못했어요.\n확인되지 않은 내용을 추측해 말씀드리지 않을게요.`
}

export const GAP_RELATED_INTRO = "공개 안내에는 이런 내용이 있어요:"

/** 복합 질문 답 길이 상한(결정 1): 2조각 700자, 3조각 이상 900자. number 머리(R3)는 4조각 이상 1,000자(규격 S10-8). */
export function compoundLengthCap(pieces: number, head: CompoundHeadMode = "bracket") {
  if (head === "number" && pieces >= 4) return 1000
  return pieces >= 3 ? 900 : 700
}

/**
 * 못 답한 조각 알림(R2 검토 품질-3). retry 는 그 조각만 물으면 답이 나올 때만 쓴다(막다른 길이 되지 않게). 공개 안내에 없음은 공백 카드·없는
 * 개념으로 확인됐을 때만, 그 밖은 '바로 찾지 못했어요' + 상담 버튼. 지금까지의 고정 줄("함께 물어보신 다른 내용은 …")은 거짓인 경우가 많아 없앴다.
 */
export const SEGMENT_RETRY_LINE = "이 내용은 따로 한 번 더 물어봐 주세요."
export const SEGMENT_ABSENT_LINE = "공개 안내에는 없는 내용이에요."
export const SEGMENT_NOTFOUND_LINE = "이 부분은 공개 안내에서 바로 찾지 못했어요."
export const SEGMENT_SYMPTOM_LINE = "이 증상에 딱 맞는 해결 안내는 아직 찾지 못했어요."
/**
 * 상담이 필요한 알림이 있을 때 답 맨 끝에 한 줄(필요할 때만, shape.ts CLOSING_TEMPLATE_LINES 와 같은 글). 알림 줄 자체에는 상담 안내를 넣지 않아
 * 답 끝의 상담 안내가 한 줄이 되게 한다(결정 2, 품질-4).
 */
export const COMPOUND_CLOSING_LINE = "더 궁금한 점은 \"상담원 연결\"이라고 말씀해 주시면 이어서 도와드릴게요."

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
  /** 결론 한 줄(headline)을 그리는지(CHATBOT_COMPILED_HEADLINE). */
  headline: boolean
  /** 답 꼴 판(CHATBOT_COMPILED_FORM). */
  form: CompiledForm
  /** 복합 답 머리 꼴(CHATBOT_COMPOUND_HEAD). */
  head: CompoundHeadMode
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

/**
 * 새로 쓴 결론 한 줄(headline). 스위치를 켰고(CHATBOT_COMPILED_HEADLINE) 근거 문장이 지금 문서와 맞으며, 근거 문장이 첫 문단에 없을 때만 쓴다
 * (첫 문단에 있으면 바로 아래에서 같은 말을 되풀이하게 된다, 품질-5). 아니면 null(지금과 같다).
 */
function headlineFor(answer: DocCardAnswer, input: RenderInput, firstParagraph: string): string | null {
  if (!input.headline || input.framing !== "full" || answer.first || !answer.headline) return null
  const { text, basis } = answer.headline
  if (!text.trim() || basis.length === 0) return null
  for (const ref of basis) {
    const sentence = sentenceAt(input.ctx.index.currentUnits, ref.unit, ref.i, ref.hash)
    if (!sentence || firstParagraph.includes(sentence.text)) return null
  }
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
  const headline = headlineFor(card.answer, input, paragraphs[0] ?? "")
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
    gapLeadLine(card.topic, input.form),
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

/** 머리 줄 이름 끝에 오면 안 되는 낱말 끝(조사·관형형·잇는 말·의존 명사): 낱말 경계에서 자를 때 하나 더 뺀다. */
const LABEL_DANGLING_END_RE = /(?:을|를|이|가|은|는|에|에서|에게|한테|께|으로|로|와|과|의|도|만|하는|되는|있는|없는|한|할|된|고|며|및|또는|위한|대한|수|것|때)$/
/** 묶음 경계가 없는 주제는 이 길이까지 자르지 않고 그대로 쓴다(낱말 중간에서 끊긴 이름보다 낫다). */
const TOPIC_WHOLE_MAX = 26

/**
 * 머리 줄 이름: 카드 주제(고정 문구)에서 괄호 설명을 빼고, 길면 첫 묶음("…와 …"·"A 및 B"의 앞쪽)에서 자른다. 묶음 경계가 없으면
 * TOPIC_WHOLE_MAX 까지는 그대로, 그보다 길면 fallback(조각 주절 개념 이름, decide.ts)을 쓰고, 그것도 없으면 낱말 경계에서 자른다.
 * 자를 때는 '…'를 붙이지 않고, 끝 낱말이 조사·관형형으로 끝나면 그 낱말도 뺀다(R2 검토 품질-12). 손님 글은 쓰지 않는다.
 */
export function shortTopic(topic: string, max = 22, fallback?: string | null) {
  const plain = topic.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim()
  if (plain.length <= max) return plain
  // 묶음 경계("A와 B", "A·B", "A, B", "A 및 B", "A 또는 B")에서 max 안쪽으로 가장 긴 앞부분.
  let best = ""
  for (const match of plain.matchAll(/(?<=[가-힣A-Za-z0-9])(?:와|과)(?= )|,| 및 | 또는 | 등 /g)) {
    const head = plain.slice(0, match.index).trim()
    if (head.length >= 7 && head.length <= max) best = head
  }
  if (best) return best
  if (plain.length <= TOPIC_WHOLE_MAX) return plain
  if (fallback) return fallback
  const words = plain.split(" ")
  let head = ""
  for (const word of words) {
    const next = head ? `${head} ${word}` : word
    if (next.length > max) break
    head = next
  }
  while (head.includes(" ") && LABEL_DANGLING_END_RE.test(head.slice(head.lastIndexOf(" ") + 1))) head = head.slice(0, head.lastIndexOf(" "))
  head = head.replace(/[·,\s]+$/, "")
  return head.length >= 4 ? head : plain.slice(0, max).replace(/[·,\s]+$/, "")
}

const headerLine = (label: string) => `【${label}】`

/** number 머리 줄(규격 S10-1): "{n}. {이름}". 머리 줄만 있는 덩이는 만들지 않는다(위젯이 단독 "2."를 "1."로 다시 그린다). */
const numberHeadLine = (n: number, label: string) => `${n}. ${label}`

/** 조각 안 단계 상한(규격 S10-3)과 넘칠 때 끝 줄. 알림 줄(따로 한 번 더 물어봐 주세요)과 다른 글이라 번호째 알림으로 세지 않는다. */
export const PIECE_STEP_MAX = 3
export const PIECE_MORE_STEPS_LINE = "이어지는 순서는 이 질문만 따로 물어봐 주세요."
/** bracket(R2) 조각을 결론만 남길 때 목록 뒤 줄. */
const BRACKET_MORE_LINE = "이어지는 내용은 이 질문만 따로 한 번 더 물어봐 주세요."

const itemTextOf = (line: string) => line.replace(/^(?:\d+[.)]|[-•·*–])\s+/, "").trim()
const toBullets = (lines: readonly string[]) => lines.map((line) => `- ${itemTextOf(line)}`)

/**
 * number 머리 조각 본문(규격 S10-3): 첫 문장 덩이를 결론 줄로 머리 줄 바로 아래 두고, 바로 이어지는 단계 목록은 "-" 점 목록(stepMax 개까지)으로 같은 덩이에
 * 붙인다(위젯이 "리드 + 목록"으로 그린다). 본문이 목록으로 시작하면 첫 단계를 결론 줄로 올린다. 그 뒤 덩이는 따로 두되 번호 목록은 점 목록으로 바꾼다
 * (머리 줄 "n."·번호 세기와 헷갈리지 않게). 단계가 넘치면 그 목록 바로 뒤 덩이에 PIECE_MORE_STEPS_LINE 을 둔다. 글자는 목록 표시만 바뀐다.
 */
export function numberedPieceBlocks(blocks: readonly (readonly string[])[], stepMax = PIECE_STEP_MAX): { lead: string[]; rest: string[][] } {
  const queue = blocks.map((lines) => [...lines]).filter((lines) => lines.length > 0)
  const first = queue.shift()
  if (!first) return { lead: [], rest: [] }
  let lead: string[]
  let steps: string[] = []
  if (blockKind(first) === "plain") {
    lead = first
    if (queue[0] && blockKind(queue[0]) !== "plain") steps = queue.shift()!.map(itemTextOf)
  } else {
    // 목록 첫 단계를 결론 줄로 올릴 때는 목록 항목이 아니므로 한 문장 한 줄로 나눈다(shape.ts 단일 항목과 같은 규칙).
    const items = first.map(itemTextOf)
    lead = singleItemLines(items[0])
    steps = items.slice(1)
  }
  const shown = steps.slice(0, stepMax).map((step) => `- ${step}`)
  const rest: string[][] = []
  for (const lines of queue) rest.push(blockKind(lines) === "ordered" ? toBullets(lines) : lines)
  // 넘친 단계 안내는 조각 끝에 둔다(R3 반박 검토: '이어지는 순서는 … 따로 물어봐 주세요.' 뒤에 내용이 더 이어져 어색했다).
  if (steps.length > stepMax) rest.push([PIECE_MORE_STEPS_LINE])
  return { lead: [...lead, ...shown], rest }
}

/** 손님 조각 글을 머리 이름으로 쓸 때(규격 S10-2): 따옴표, 24자 이하, 숫자 4자리 이상·@·주소가 없을 때만. 아니면 null. */
export function segmentTextLabel(text: string): string | null {
  const plain = text.replace(/\s+/g, " ").trim().replace(/[\s?？!.。~…]+$/, "")
  if (!plain || plain.length > 24) return null
  if (/\d{4,}|@|https?:\/\/|www\./i.test(plain)) return null
  return `"${plain}"`
}

export interface PieceAnswer {
  kind: "answer"
  label: string
  /** 다듬은 본문 덩이(머리 줄 제외, 끝맺음 틀 줄 제외). */
  blocks: string[][]
  /** 본문 끝에서 거둔 끝맺음 틀 줄(CLOSING_TEMPLATE_LINES). */
  closing: string | null
  card: AnswerCard
  parts: AnswerIndexCoreParts
}

export interface PieceNotice {
  kind: AnswerIndexNoticeKind
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

/** 본문 덩이 끝에서 끝맺음 틀 줄만 거둔다(조각 고유의 안내·사실 줄은 끝맺음처럼 보여도 그 조각 안에 둔다, R2 검토 품질-4). */
/** 끝맺음 틀 줄 바로 뒤에 붙는 남길 정보 줄("상담할 때 이 정보를 함께 알려 주시면 …: …"): 틀 줄과 한 끝맺음이다. */
const CLOSING_INFO_LINE_RE = /^상담할 때 이 정보를 함께 알려 주시면/

function takeClosing(blocks: string[][]) {
  const out = blocks.map((lines) => [...lines])
  const taken: string[] = []
  while (out.length > 0) {
    const lines = out[out.length - 1]
    if (blockKind(lines) !== "plain") break
    // 틀 줄 + 남길 정보 줄은 함께 거둔다(복합 답 가운데에 상담 안내가 남지 않게, R3 반박 검토).
    if (lines.length >= 2 && CLOSING_INFO_LINE_RE.test(lines[lines.length - 1]) && isClosingTemplate(lines[lines.length - 2])) lines.pop()
    while (lines.length > 0 && isClosingTemplate(lines[lines.length - 1])) taken.unshift(lines.pop()!)
    if (lines.length === 0) out.pop()
    else break
  }
  return { blocks: out, closing: taken.length > 0 ? taken[taken.length - 1] : null }
}

/** 공감·예고만 하는 줄("확인된 것만 말씀드릴게요.", "두 가지 방법이 있어요."): 결론만 남길 때 건너뛴다(회귀-4). */
const PREVIEW_LINE_RE =
  /(?:말씀|안내|답|정리|설명|나눠)(?:해)?\s*드릴게요[.!]?$|드리겠습니다[.!]?$|^(?:정말\s*)?죄송해하지|(?:두|세|네|몇)\s*가지\s*(?:방법|경우|길|선택지)?이?\s*(?:있어요|있습니다)[.:]?$|^(?:불편을 드려|걱정되시)/

function isPreviewLine(line: string) {
  return PREVIEW_LINE_RE.test(line.trim())
}

/**
 * 조각 본문을 결론만 남긴다(맨 앞 공감·예고 줄은 건너뛴다): 첫 내용 덩이가 문장이면 그 덩이(deeper 면 첫 줄 하나), 목록이면 첫 항목 하나와
 * 이어 묻기 한 줄. 남길 내용이 없으면 null.
 */
function conclusionOnly(blocks: string[][], deeper = false, head: CompoundHeadMode = "bracket"): string[][] | null {
  for (let at = 0; at < blocks.length; at += 1) {
    const block = blocks[at]
    if (blockKind(block) === "plain") {
      const from = block.findIndex((line) => !isPreviewLine(line))
      if (from < 0) continue
      const rest = block.slice(from)
      return [deeper ? [rest[0]] : rest]
    }
    const text = block[0].replace(/^(?:\d+[.)]|[-•·*–])\s+/, "")
    return [[text], [head === "number" ? PIECE_MORE_STEPS_LINE : BRACKET_MORE_LINE]]
  }
  return null
}

function noticeLine(kind: AnswerIndexNoticeKind) {
  switch (kind) {
    case "absent":
      return SEGMENT_ABSENT_LINE
    case "notfound":
      return SEGMENT_NOTFOUND_LINE
    case "symptom":
      return SEGMENT_SYMPTOM_LINE
    default:
      return SEGMENT_RETRY_LINE
  }
}

function pieceText(piece: Piece, blocksOverride?: string[][], head: CompoundHeadMode = "bracket", n = 1) {
  if (head === "number") return numberedPieceText(piece, n, blocksOverride)
  const header = headerLine(piece.label)
  if (isAnswerPiece(piece)) {
    const blocks = blocksOverride ?? piece.blocks
    if (blocks.length === 0) return header
    // 머리 줄은 문장 덩이에 붙이고, 목록이 바로 이어지면 빈 줄을 둔다(위젯이 목록을 그리려면 덩이가 목록 줄뿐이어야 한다).
    if (blockKind(blocks[0]) === "plain") return fromBlocks([[header, ...blocks[0]], ...blocks.slice(1)])
    return fromBlocks([[header], ...blocks])
  }
  const blocks: string[][] = [[header, noticeLine(piece.kind)]]
  // 관련 문장이 있을 때만 '공개 안내에는 이런 내용이 있어요:' 줄을 둔다(빈 머리 줄을 남기지 않는다).
  if (piece.kind === "absent" && piece.related.length > 0) blocks.push([GAP_RELATED_INTRO, ...piece.related])
  return fromBlocks(blocks)
}

/**
 * number 머리 조각 글: "{n}. 이름" 줄 + 결론 줄(+ 점 단계)이 한 덩이, 그 뒤 덩이들. 알림 조각은 "{n}. 이름" + 알림 한 줄.
 * 사람이 쓴 글(정책)은 단계 수를 자르지 않는다(목록 표시만 점으로). 남길 본문이 없으면 머리 줄만 두지 않고 '따로 물어봐 주세요' 알림으로 둔다.
 */
function numberedPieceText(piece: Piece, n: number, blocksOverride?: string[][]) {
  const head = numberHeadLine(n, piece.label)
  if (isAnswerPiece(piece)) {
    const { lead, rest } = numberedPieceBlocks(blocksOverride ?? piece.blocks, isFixedText(piece) ? Infinity : PIECE_STEP_MAX)
    if (lead.length === 0) return fromBlocks([[head, SEGMENT_RETRY_LINE]])
    return fromBlocks([[head, ...lead], ...rest])
  }
  const blocks: string[][] = [[head, noticeLine(piece.kind)]]
  if (piece.kind === "absent" && piece.related.length > 0) blocks.push([GAP_RELATED_INTRO, ...piece.related])
  return fromBlocks(blocks)
}

/** 사람이 쓴 글(policy·policyGoverned fixed): 줄이면 단서가 빠질 수 있어 결론만 남기지 않고 통째로 알림으로 바꾼다. */
function isFixedText(piece: PieceAnswer) {
  return isPolicyGoverned(piece.card)
}

/**
 * 복합 답 합치기(조각 목록 → 본문 글). 상한을 넘으면 가장 긴 조각 하나씩 줄인다(전문 → 결론 문단 → 결론 한 줄, R2 검토 회귀-4).
 * 정책·사람 글 조각은 줄이지 않고, 다른 조각을 다 줄여도 넘을 때만 그 조각을 '따로 물어봐 주세요' 알림으로 바꾼다.
 * 결론만 남길 때 맨 앞 공감·예고 줄은 건너뛰고, 남길 내용이 없으면 알림으로 바꾼다. 답한 조각은 하나는 남긴다.
 */
export function assemblePieces(pieces: Piece[], tail: string[], closing: string | null, cap: number, head: CompoundHeadMode = compoundHeadMode()) {
  type Mode = "full" | "conclusion" | "line" | "dropped"
  const modes: Mode[] = pieces.map(() => "full")
  const work: Piece[] = [...pieces]
  const textOf = (at: number): string => {
    const piece = work[at]
    if (!isAnswerPiece(piece)) return pieceText(piece, undefined, head, at + 1)
    const mode = modes[at]
    if (mode === "full") return pieceText(piece, undefined, head, at + 1)
    return pieceText(piece, conclusionOnly(piece.blocks, mode === "line", head) ?? [], head, at + 1)
  }
  const render = () => [...work.map((_piece, at) => textOf(at)), ...tail, ...(closing ? [closing] : [])].join("\n\n")
  const drop = (at: number) => {
    const source = work[at] as PieceAnswer
    work[at] = { kind: "retry", label: source.label, related: [], card: source.card, parts: source.parts }
    modes[at] = "dropped"
  }
  let text = render()
  while (text.length > cap) {
    const answered = work.map((piece, at) => ({ piece, at })).filter((item): item is { piece: PieceAnswer; at: number } => isAnswerPiece(item.piece))
    const reducible = answered.filter((item) => !isFixedText(item.piece) && modes[item.at] !== "line")
    if (reducible.length > 0) {
      const longest = reducible.reduce((a, b) => (textOf(b.at).length > textOf(a.at).length ? b : a))
      modes[longest.at] = modes[longest.at] === "full" ? "conclusion" : "line"
      // 결론으로 줄였더니 남길 내용이 없으면(공감·예고뿐) 그 조각은 알림으로 바꾼다.
      if (conclusionOnly(longest.piece.blocks, modes[longest.at] === "line", head) === null && answered.length > 1) drop(longest.at)
      text = render()
      continue
    }
    if (answered.length <= 1) break
    const longest = answered.reduce((a, b) => (textOf(b.at).length > textOf(a.at).length ? b : a))
    drop(longest.at)
    text = render()
  }
  return { text, modes, pieces: work }
}

// ─── 이미 해 본 동작(규격 S14) ───────────────────────────────────────────

/** 이미 해 본 동작 id → 단계 줄에서 찾는 꼴·이름(style-audit-core TRIED_ACTIONS 의 step 과 같은 꼴). */
const TRIED_STEPS: Readonly<Record<string, { step: RegExp; name: string }>> = {
  reinstall: { step: /재설치|다시\s?설치|삭제한?\s?(?:뒤|후)|지우고|삭제해/, name: "재설치" },
  restart: { step: /재시작|재부팅|다시\s?(?:시작|실행|켜)|껐다\s?(?:가\s?)?켜/, name: "다시 시작" },
  update: { step: /업데이트/, name: "업데이트" },
  relogin: { step: /로그아웃|다시\s?로그인/, name: "다시 로그인" },
}

/**
 * 이미 해 봤다는 동작 단계를 목록에서 빼고 첫 줄 바로 아래에 "이미 해 보신 {동작}은 빼고 안내할게요."를 둔다. 빼고 남는 단계가 1개 이하면,
 * 또는 첫 덩이가 문장 덩이가 아니면 빼지 않는다(첫 줄은 실제 물음의 결론이어야 한다).
 */
export function skipTriedSteps(text: string, tried: readonly string[]): string {
  const rules = tried.map((id) => ({ id, ...TRIED_STEPS[id] })).filter((rule) => rule.step)
  if (rules.length === 0) return text
  const blocks = toBlocks(text)
  if (blocks.length === 0 || blockKind(blocks[0]) !== "plain") return text
  const removed = new Set<string>()
  const out = blocks.map((lines) => {
    const kind = blockKind(lines)
    if (kind === "plain") return lines
    const hits = lines.map((line) => rules.filter((rule) => rule.step.test(itemTextOf(line))))
    const kept = lines.filter((_line, at) => hits[at].length === 0)
    if (kept.length === lines.length || kept.length <= 1) return lines
    for (const list of hits) for (const rule of list) removed.add(rule.name)
    return kind === "ordered" ? kept.map((line, at) => `${at + 1}. ${itemTextOf(line)}`) : kept
  })
  if (removed.size === 0) return text
  const label = [...removed].join("·")
  const note = `이미 해 보신 ${label}${topicParticle(label)} 빼고 안내할게요.`
  out[0] = [out[0][0], note, ...out[0].slice(1)]
  return fromBlocks(out)
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

/** 문장 덩이가 아닌 줄 단위 본문을 shape 로 다듬어 덩이로 돌려준다(빈 리드를 걷고 끝맺음은 지우지 않는다 — 틀 줄은 takeClosing 이 거둔다). */
function shapedBlocks(text: string, shape: boolean, options: ShapeOptions = {}) {
  const shaped = shape ? shapeAnswer(text, { ...options, keepClosings: true }).text : text
  return toBlocks(shaped)
}

/**
 * 복합 답 '없음' 알림 아래 관련 문장(공백 카드, 문서 문장 그대로)도 R3 말투·표기를 맞춘다(단일 공백 답은 답 전체를 다듬어 이미 맞는다).
 * R3 말투·표기 스위치가 모두 꺼져 있으면 R2 처럼 손대지 않는다(바이트가 같다).
 */
function shapedRelated(related: readonly string[], card: AnswerCard, input: RenderInput, shape: boolean): string[] {
  const options = cardShapeOptions(card, input.ctx.env ?? process.env)
  if (!shape || (options.tone !== "yo" && options.arrow !== "arrow")) return [...related]
  return related.map((sentence) => shapeAnswer(sentence, { ...options, keepClosings: true }).text)
}

// ─── 답 다듬기 보강(R3 반박 검토) ─────────────────────────────────────────

/** 조각 낱말에서 빼는 말: 묻는 말·꼬리·지시어·잇는 말(조각과 본문 문단이 '같은 이야기'인지 볼 때 쓰지 않는다). */
const PIECE_STOP_WORDS = new Set([
  "어떻게", "어디서", "어디", "어디에", "어디로", "언제", "무엇", "뭐", "얼마나", "얼마", "몇", "왜", "혹시", "이거", "그거", "저거", "그럼", "그러면",
  "그리고", "근데", "또", "좀", "다", "다시", "같이", "있나요", "되나요", "해요", "돼요", "되요", "하나요", "방법", "문의", "궁금", "알려", "주세요",
  "있어요", "있을까요", "하는", "하면", "되면", "안", "못", "수", "수도", "것", "거", "때",
])
/** 거의 모든 문단에 나오는 말(문단이 조각 이야기인지 가르는 데 쓰지 않는다). */
const PIECE_GENERIC_WORDS = new Set(["수업", "학생", "선생님", "강사", "클래스인", "classin", "기능", "사용", "이용", "화면", "학원", "앱", "pc"])

/** 조각 글의 내용 낱말(정규화·꼬리 떼기·조사 떼기, 2자 이상, 묻는 말·흔한 말 뺌). */
/** 용언·관형형·상황 절로 끝나는 낱말('사는'·'있는데'·'하면'): 문단 주제를 가르지 못한다. */
const PIECE_VERBAL_END_RE = /(?:는데|은데|인데|던데|하는|되는|있는|없는|사는|하고|하면|되면|려면|으면|해서|어서|아서|했는데|는|은|고|면|서)$/

export function pieceContentWords(text: string): string[] {
  const words = wordsOf(normalizeForIndex(text)).map((word) => word.replace(/[^\p{L}\p{N}]+/gu, ""))
  return Array.from(
    new Set(words.filter((word) => word.length >= 2 && !PIECE_STOP_WORDS.has(word) && !PIECE_GENERIC_WORDS.has(word) && !PIECE_VERBAL_END_RE.test(word)))
  )
}

/** 문단이 낱말 하나라도 담는지(공백·대소문자 무시). */
function blockMentions(lines: readonly string[], words: readonly string[]) {
  const compact = lines.join(" ").toLowerCase().replace(/\s+/g, "")
  return words.some((word) => compact.includes(word.toLowerCase()))
}

/** 위젯 점검표 덩이("함께 확인할 것" + 체크 항목): 복합 답 평문에서는 체크 항목이 답변자가 한 일처럼 읽혀 넣지 않는다(R3 반박 검토). */
const CHECKLIST_HEAD_RE = /^함께 확인할 것$/

/** 되돌릴 수 없는 일·안전 주의 문단(조각 이야기가 아니어도 지우지 않는다). */
const SAFETY_BLOCK_RE = /되돌릴 수 없|복구되지 않|복구할 수 없|지워지|전원을 끄|플러그를 뽑|분해하|주의/

/**
 * 복합 답 조각 본문을 그 조각 물음의 이야기로 줄인다(R3 반박 검토: 카드의 관련 없는 문단이 다른 물음 머리 아래로 새어 들어갔다). 첫 문단(결론)과 바로 이은
 * 단계 목록은 늘 두고, 그 뒤 문단은 조각 낱말을 담거나 안전·되돌릴 수 없는 일 주의일 때만 둔다. 낱말이 없으면 그대로다.
 */
export function trimPieceBlocks(blocks: readonly (readonly string[])[], words: readonly string[]): string[][] {
  const out = blocks.map((lines) => [...lines]).filter((lines, at) => at === 0 || !CHECKLIST_HEAD_RE.test(lines[0] ?? ""))
  if (words.length === 0 || out.length <= 1) return out
  const keepHead = blockKind(out[0]) === "plain" && out[1] && blockKind(out[1]) !== "plain" ? 2 : 1
  return out.filter(
    (lines, at) => at < keepHead || (!CHECKLIST_HEAD_RE.test(lines[0] ?? "") && (blockMentions(lines, words) || SAFETY_BLOCK_RE.test(lines.join(" "))))
  )
}

/** 머리 줄 이름으로 쓰기엔 넓은 개념 이름(알림 조각을 앞 조각 본문 줄로 채울 때 열쇠로 쓰지 않는다). */
const BROAD_LABEL_WORDS = new Set(["수업", "학생", "선생님", "강사", "계정", "기능", "설정", "클래스인", "학원", "앱", "화면", "방법", "설치"])

/**
 * 못 정한 조각의 물음을 앞뒤 답한 조각 본문이 이미 담고 있으면 그 줄을 찾는다(R3 반박 검토: 1번 답에 비밀번호 바꾸는 곳이 있는데 2번 '비밀번호'는
 * 찾지 못했다고 했다). 열쇠는 조각 머리 이름(개념 이름)의 낱말 모두이고, 넓은 이름은 쓰지 않는다. 결론 줄·상담 안내 줄은 고르지 않는다.
 */
export function findCoveringLine(
  pieces: readonly Piece[],
  at: number,
  label: string,
  segmentText = ""
): { piece: number; block: number; line: number } | null {
  const keys = label
    .split(/[·\s]+/)
    .map((word) => word.replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase())
    .filter((word) => word.length >= 2 && !BROAD_LABEL_WORDS.has(word))
  if (keys.length === 0) return null
  // 조각이 '안 열리면·안 와요'처럼 무엇이 안 되는 경우를 물으면 그 동작(2자 어간)이 줄에 있어야 한다(같은 주제의 다른 안내를 답으로 옮기지 않게).
  const failing = Array.from(normalizeText(segmentText).matchAll(/(?:안|못)\s*([가-힣]{1,2})/g), (match) => match[1])
  // 조각의 명사 낱말(용언 꼴 뺌)은 모두 그 줄에 있어야 한다("전자칠판 사이즈와 사양" → 사이즈·사양까지).
  const nouns = pieceContentWords(segmentText)
    .filter((word) => !/(?:요|다|할|해|돼|되|하|죠|까|나)$/.test(word))
    .map((word) => word.toLowerCase())
  const yesNo = detectAskType(normalizeText(segmentText)) === "yesno"
  let best: { piece: number; block: number; line: number; list: boolean } | null = null
  for (let other = 0; other < pieces.length; other += 1) {
    const piece = pieces[other]
    if (other === at || !isAnswerPiece(piece) || isFixedText(piece)) continue
    for (let block = 0; block < piece.blocks.length; block += 1) {
      for (let line = 0; line < piece.blocks[block].length; line += 1) {
        if (block === 0 && line === 0) continue
        const raw = piece.blocks[block][line]
        const text = itemTextOf(raw)
        const compact = text.toLowerCase().replace(/\s+/g, "")
        // 앞 단계를 받는 줄("그래도 안 되면 …")·짧은 줄·상담 안내 줄은 혼자 답이 되지 않는다.
        if (text.length < 12 || /^(?:그래도|그러면|그럼|이때|그다음)/.test(text) || isClosingLine(text) || CONSULT_GUIDE_RE.test(text)) continue
        if (!keys.every((key) => compact.includes(key))) continue
        // 그 줄이 그 이름에 관한 줄이어야 한다: 줄이 이름으로 시작하거나 이름이 버튼 이름([…]) 안에 있다(지나가며 나온 낱말은 고르지 않는다).
        const buttons = Array.from(text.matchAll(/\[([^\]\n]+)\]/g), (match) => match[1].toLowerCase().replace(/\s+/g, ""))
        const about = keys.some((key) => compact.startsWith(key) || buttons.some((name) => name.includes(key)))
        if (!about || nouns.some((noun) => !compact.includes(noun))) continue
        // 되나요·있나요 물음은 그 줄이 된다·안 된다를 말해야 답이다("녹화 되나요?"에 녹화 화면 고르는 줄을 옮기지 않는다).
        if (yesNo && !/수\s*있|수\s*없|돼요|되요|가능|없어요|않|못|켜요|켤\s*수/.test(text)) continue
        // 안 되는 경우를 묻는 조각은 그 줄도 안 되는 경우를 말해야 한다(부정어 + 그 동작 첫 글자).
        if (failing.length > 0 && (!/안|않|못|없/.test(text) || failing.some((stem) => !compact.includes(stem.slice(0, stem.length >= 2 ? 2 : 1))))) continue
        const list = /^(?:\d+[.)]|[-•·*–])\s/.test(raw.trim())
        // 문장 줄을 목록 항목보다 먼저 고른다(목록 항목은 앞뒤 단계에 기대는 일이 많다).
        if (!best || (best.list && !list)) best = { piece: other, block, line, list }
        if (!list) return { piece: other, block, line }
      }
    }
  }
  return best ? { piece: best.piece, block: best.block, line: best.line } : null
}

/** 조각 글의 묻는 갈래를 짧은 명사구로(머리 이름이 없거나 겹칠 때). 손님 글을 따옴표째 머리로 쓰지 않게 한다. 못 정하면 null. */
const ASPECT_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/몇\s*명|\d+\s*명|인원|정원/, "수업 인원"],
  [/\bgb\b|\bmb\b|용량|저장\s*공간/i, "용량"],
  [/얼마|가격|비용|요금|돈|유료|무료|결제/, "비용"],
  [/안\s*(?:오|와|옴)/, "안 올 때"],
  [/안\s*(?:보이|보여|보임)/, "안 보일 때"],
  [/안\s*(?:열리|열려|열림|켜|실행)/, "안 열릴 때"],
  [/안\s*(?:되|돼|됨)/, "안 될 때"],
  [/깔|설치|다운로드|다운\s?받/, "설치 방법"],
  [/다시\s*(?:보|볼)|다시보기|복습/, "다시 보기"],
  [/중국|해외|외국|미국|베트남|일본/, "해외 접속"],
  [/느리|느려|속도|끊기|끊겨|버벅|렉/, "속도·끊김"],
  [/어디서?\s*(?:설정|바꾸|바꿔|켜)/, "설정 위치"],
  [/어디/, "위치"],
  [/언제|기간|까지/, "기간"],
]

/** 맞는 갈래 둘까지 잇는다("다시 보기 기간"). '안 … 때' 갈래는 혼자 쓴다. */
export function aspectLabel(text: string, exclude = ""): string | null {
  const normalized = normalizeText(text)
  const found = ASPECT_LABELS.filter(([pattern, label]) => pattern.test(normalized) && !exclude.includes(label)).map(([, label]) => label)
  if (found.length === 0) return null
  if (found[0].startsWith("안 ") || found.length === 1) return found[0]
  const second = found.find((label, at) => at > 0 && !label.startsWith("안 ") && !found[0].includes(label))
  return second && `${found[0]} ${second}`.length <= 16 ? `${found[0]} ${second}` : found[0]
}

/** 같은 머리 이름이 겹치면 뒤 조각에 그 조각의 갈래를 붙인다("인증코드" → "인증코드 안 올 때"). 그래도 겹치면 그대로 둔다(번호로 가린다). */
function distinctLabels(labels: readonly string[], texts: readonly string[]): string[] {
  const out: string[] = []
  labels.forEach((label, at) => {
    if (!out.includes(label)) {
      out.push(label)
      return
    }
    const base = label.split("·")[0]
    const aspect = aspectLabel(texts[at] ?? "", label)
    const next = aspect ? `${base} ${aspect}` : null
    out.push(next && !out.includes(next) ? next : label)
  })
  return out
}

/** 예/아니오 꼴 물음에 쓰는 꼬리(되나요·있나요·필요한가요…). */
const YES_NO_ASK_RE = /(?:되나요|돼요\?|되요\?|되나\b|있나요|있어요\?|있나\b|있음\??$|없나요|가능한가요|가능해요\?|가능할까요|필요한가요|필요해요\?|해야\s*(?:하나요|돼요)|할\s*수\s*있나요|수\s*있나요|수\s*있어요\?|않나|맞나요)/

/**
 * 예/아니오 리드의 극성 점검(R3 반박 검토: 'VPN 필요한가요?'에 카드의 '네, … VPN 없이 돼요'가 그대로 나가 필요하다는 뜻으로 읽혔다). 첫 줄이
 * '네,·아니요,'로 시작하는데 물음과 카드 물음의 방향이 다르면(필요 ↔ 없이, '만으로 되나요' ↔ '필수가 아니에요') 또는 첫 줄이 물음의 내용 낱말을
 * 하나도 담지 않으면 '네,·아니요,'만 뗀다(나머지 문장은 사실 그대로라 바로 읽힌다). 바꿀 것이 없으면 글 그대로다.
 */
export function fixYesNoLead(text: string, question: string): string {
  const lines = text.split("\n")
  const first = lines[0] ?? ""
  const match = /^(네|아니요)[,.]\s+/.exec(first)
  if (!match || !YES_NO_ASK_RE.test(question.trim())) return text
  const rest = first.slice(match[0].length)
  const q = normalizeText(question)
  const line = normalizeText(rest)
  const needInverted = /필요|있어야|해야|꼭/.test(q) && /없이|필요\s*없|필요하지\s*않|안\s*해도|없어도/.test(line)
  const sufficiencyInverted = /만으로|만\s*있으면|만\s*있어도|만\s*가지고/.test(q) && /필수가\s*아니|필수는\s*아니|없어도|없이|필요\s*없/.test(line)
  const words = pieceContentWords(question)
  const compact = line.replace(/\s+/g, "")
  const focusMissing = words.length > 0 && !words.some((word) => compact.includes(word))
  if (!needInverted && !sufficiencyInverted && !focusMissing) return text
  return [rest, ...lines.slice(1)].join("\n")
}

/** 제목 같은 첫 줄(문장 끝이 없는 짧은 줄 "수업 녹화를 켜는 방법"): 복합 조각에서는 머리 줄과 겹쳐 결론 자리를 막는다. */
function isHeadingLikeLine(line: string) {
  const text = line.trim()
  return text.length > 0 && text.length <= 30 && !/[.?!。…]$/.test(text) && !/(?:요|다|죠|음|함)$/.test(text) && !/^(?:\d+[.)]|[-•·*])\s/.test(text)
}

/** 조각 첫 덩이의 첫 줄이 제목 같으면 뺀다(뒤에 내용이 있을 때만). */
function dropHeadingLead(blocks: string[][]): string[][] {
  if (blocks.length === 0 || blockKind(blocks[0]) !== "plain") return blocks
  const [first, ...rest] = blocks
  if (!isHeadingLikeLine(first[0] ?? "")) return blocks
  if (first.length > 1) return [first.slice(1), ...rest]
  return rest.length > 0 ? rest : blocks
}

/**
 * 같은 안내가 두 번 나오는 줄을 뒤쪽에서 뺀다(R3 반박 검토: 증상 안내의 단계와 갈래 문단이 같은 블루투스 안내를 되풀이했다). 앞 18자(공백·문장 부호 뺀
 * 글)가 같은 줄만 겹친 줄로 본다. 목록 항목은 빼지 않는다(번호가 흐트러진다).
 */
export function dropRepeatedLines(text: string): string {
  const seen = new Set<string>()
  const keyOf = (line: string) => itemTextOf(line).replace(/[^\p{L}\p{N}]+/gu, "").slice(0, 18)
  const blocks = toBlocks(text).map((lines) =>
    lines.filter((line) => {
      const key = keyOf(line)
      if (key.length < 12) return true
      const listItem = /^(?:\d+[.)]|[-•·*–])\s/.test(line.trim())
      if (seen.has(key) && !listItem) return false
      seen.add(key)
      return true
    })
  )
  return fromBlocks(blocks.filter((lines) => lines.length > 0))
}

/** 카드 글 다듬기 선택(R3): 정책 글·toneLocked 는 말투를 바꾸지 않는다. 표기·말투 스위치는 ctx.env 를 읽는다. */
function cardShapeOptions(card: AnswerCard, env: Env): ShapeOptions {
  return { ...shapeOptionsFor(isPolicyGoverned(card) ? "policy" : card.kind, { toneLocked: card.toneLocked === true, env }), env }
}

/** 못 정한 조각의 알림 종류와 이름(R2 검토 품질-3·품질-10). 'retry'는 그 조각만 물으면 답이 나올 때만이다. */
function noticeFor(segment: AnswerIndexSegmentDecision, at: number, ctx: RespondContext, head: CompoundHeadMode = "bracket"): { kind: AnswerIndexNoticeKind; label: string } {
  const absentLabel = segment.absentHit ? ctx.index.absent.byId.get(segment.absentHit)?.label : undefined
  const label = absentLabel ?? noticeLabel(segment, at, head)
  if (absentLabel) return { kind: "absent", label }
  // 넘친 조각(최대 조각 수 밖)은 판정하지 않았으므로 '찾지 못했어요'가 아니라 따로 물어봐 달라고 한다(number 머리, 규격 S10-9).
  if (head === "number" && segment.source === "overflow") return { kind: "retry", label }
  if (segment.alone === "answer") return { kind: "retry", label }
  if (segment.alone === "gap") return { kind: "absent", label }
  if (segment.symptom) return { kind: "symptom", label }
  return { kind: "notfound", label }
}

/** 카드 없는 조각의 머리 이름: 조각 주절 개념 이름 → (number 머리면) 따옴표 친 조각 글(segmentTextLabel) → "n번째 질문". */
function noticeLabel(segment: AnswerIndexSegmentDecision, at: number, head: CompoundHeadMode) {
  if (head !== "number") return segment.label ?? ordinalLabel(at)
  // number 머리: 개념 이름(+ '안 될 때' 같은 갈래) → 묻는 갈래 명사구 → (짧으면) 조각 글 → 차례 이름. 손님 구어체 글보다 명사구를 먼저 쓴다(R3 반박 검토).
  if (segment.label) {
    const aspect = aspectLabel(segment.text, segment.label)
    // '안 될 때' 같은 갈래, 또는 넓은 개념 이름('계정')이면 묻는 갈래를 붙인다("계정 용량").
    const broad = BROAD_LABEL_WORDS.has(segment.label.replace(/\s+/g, ""))
    return aspect && (aspect.startsWith("안 ") || broad) ? `${segment.label.split("·")[0]} ${aspect}` : segment.label
  }
  return aspectLabel(segment.text) ?? segmentTextLabel(segment.text) ?? ordinalLabel(at)
}

/**
 * 추천 질문 칩에 넣을 조각 글: 묻는 꼴이 온전하고(꼬리를 나눠 붙인 글·'-고'로 끝나는 글은 아님) 그 글만 물으면 답이 나오는 조각만(품질-11).
 * overflow 가 true 면(number 머리) 판정하지 않은 넘친 조각도 넣는다(규격 S10-9: 남은 조각은 추천 질문으로).
 */
function chipText(segment: AnswerIndexSegmentDecision, original: string, overflow = false): string | null {
  if (segment.alone !== "answer" && !(overflow && segment.source === "overflow")) return null
  const text = segment.text.trim()
  if (!text || text.length > 80 || !original.includes(text)) return null
  if (!isQuestionSentence(text) || /고[,.]?$/.test(text)) return null
  return text
}

/** 상담 안내 줄(상담·담당자에게 남기거나 연결해 달라는 줄). */
const CONSULT_GUIDE_RE = /(?:상담|담당자)[^.\n]*(?:남겨|연결|문의|요청|알려)/

/**
 * 서비스가 복합 답 뒤에 붙일 수 있는 줄(말투·기기 되묻기)의 몫: 본문 상한에서 미리 뺀다(회귀-5). 끝맺음 줄은 '…말씀해 주시면'으로 끝나 서비스가
 * 되묻기를 더 붙이지 않는다(follow-up.ts ALREADY_ASKS_RE).
 */
export const COMPOUND_FOLLOW_UP_RESERVE = 60

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
  const form = compiledForm(env)
  const head = compoundHeadMode(env)
  const input: RenderInput = { ctx, question, askType: decision.askType, framing, conf, headline: compiledHeadlineEnabled(env), form, head }

  const finish = (parts: AnswerIndexCoreParts, overrides: Partial<AnswerIndexTrace> = {}): AnswerIndexCore => {
    ctx.host.markFinal(parts.response)
    return { ...parts, latencyMs: Math.max(0, Date.now() - startedAt), answerIndex: { ...trace, ...overrides } }
  }
  const unavailable = (reason: string) =>
    finish(abstainParts("nodoc", question, ctx.host, conf), { decision: "abstain", card: null, partial: false, absentTail: null, decidedBy: null, unavailable: reason })

  if (decision.kind === "clarify") {
    // 되묻기 답(증상 메뉴)도 다듬기를 거친다: 메뉴 줄이 니다체로 남아 요체 문장과 섞이지 않게(R3 반박 검토). 사람이 쓴 끝맺음은 지우지 않는다.
    const parts = clarifyParts(question, ctx.host)
    if (shape) parts.response.answer = shapeAnswer(parts.response.answer, { ...shapeOptionsFor("howto", { env }), keepClosings: true, env }).text
    return finish(parts, { partial: false })
  }
  if (decision.kind === "abstain") {
    const pieces = decision.segments
    if (framing === "full" && pieces && pieces.length >= 2) {
      // bracket(R2): 어느 조각도 못 정했으면 예전처럼 못 찾음 한 덩이다(조각마다 '따로 물어봐 주세요'만 늘어놓지 않는다, 품질-3). 다만 원문이 증상
      // 못 찾음인데 증상이 아닌 조각이 있으면 그 조각이 소리 없이 빠지지 않게 조각마다 알림 줄을 낸다(품질-10).
      // number(R3, 규격 S10-5·4.3): 못 답한 조각도 번호째 그 자리에 사실대로 한 줄(번호 수 = 조각 수). 알림 종류는 조각마다 가린다(noticeFor).
      const nonSymptom = pieces.some((segment) => !segment.symptom)
      if (head === "number" || (decision.abstainReason === "symptom" && nonSymptom)) {
        const reason = decision.abstainReason === "symptom" ? "symptom" : "nodoc"
        const compound = buildCompound(decision, pieces, input, shape, abstainParts(reason, question, ctx.host, conf))
        if (compound?.ok) return finish(compound.parts, { ...compound.overrides, partial: false, absentTail: null })
      }
      // 한 덩이 못 찾음. 그 조각만 물으면 답이 나오는 조각은 추천 질문 맨 앞에 둔다(막다른 길이 되지 않게).
      const parts = abstainParts(decision.abstainReason === "symptom" ? "symptom" : "nodoc", question, ctx.host, conf)
      const chips = pieces.map((segment) => chipText(segment, question.redacted)).filter((text): text is string => Boolean(text))
      if (chips.length > 0) parts.response.suggestedQuestions = Array.from(new Set([...chips, ...parts.response.suggestedQuestions])).slice(0, 3)
      return finish(parts, { partial: false })
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
  // 사람이 쓴 글·공백 답은 끝맺음을 지우지 않는다(shapeOptionsFor, 회귀-3). 정책 글·toneLocked 는 말투를 바꾸지 않는다(R3).
  if (shape) {
    const options = cardShapeOptions(card, env)
    // 6단계 넘는 번호 목록은 앞 5단계 + 「문서 제목」 한 줄(규격 S2). 문서 제목을 아는 doc·howto 답만(사람이 쓴 fixed·policy 글은 자르지 않는다).
    const title = response.sources[0]?.title?.trim()
    if (form === "r3" && (card.kind === "doc" || card.kind === "howto") && title) options.steps = { max: 5, title }
    if (form === "r3" && card.kind === "howto") response.answer = dropRepeatedLines(response.answer)
    response.answer = shapeAnswer(response.answer, options).text
    // R3 반박 검토: 예/아니오 극성이 물음과 어긋나면 '네,·아니요,'를 뗀다(사람이 쓴 정책 글은 그대로).
    if (form === "r3" && !isPolicyGoverned(card)) response.answer = fixYesNoLead(response.answer, question.redacted)
  }
  // 이미 해 본 동작 단계 빼기(규격 S14, 스위치 기본 off).
  if (shape && compiledSkipTried(env) && ctx.tried && ctx.tried.length > 0 && !isPolicyGoverned(card)) response.answer = skipTriedSteps(response.answer, ctx.tried)

  return finish(parts, { partial: decision.kind === "answer" && tailed, absentTail })
}

type CompoundResult =
  | { ok: true; parts: AnswerIndexCoreParts; overrides: Partial<AnswerIndexTrace> }
  | { ok: false; reason: string }

/**
 * 복합 질문 답(계획 §2.3). 조각을 질문 순서로 잇는다. 같은 카드로 답한 조각이 여럿이면 처음 한 번만 싣는다.
 * 모든 조각이 한 카드로 답했고 못 답한 조각이 없으면 null(한 카드 답으로 만든다).
 * base 가 있으면(원문 못 찾음인데 조각마다 알림을 내는 경우) 그 못 찾음 값을 바탕으로 쓴다.
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
      const notice = noticeFor(segment, at, ctx, input.head)
      pieceAt.push(pieces.length)
      pieces.push({ kind: notice.kind, label: notice.label, related: [], card: null, parts: null })
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
      pieces.push({ kind: "retry", label: noticeLabel(segment, at, input.head), related: [], card, parts: null })
      noticeOf.push(true)
      return
    }
    if (segment.card) renderedCards.set(segment.card, pieces.length)
    pieceAt.push(pieces.length)
    noticeOf.push(false)
    // 카드 주제가 길 때 대신 쓰는 조각 개념 이름은 그 카드 주제에 들어 있을 때만 쓴다(조각의 상황 낱말 '해외'가 소리 안내 카드 머리가 되지 않게).
    const topicCompact = card.topic.replace(/\s+/g, "")
    const fallback = segment.label && segment.label.split("·").some((form) => topicCompact.includes(form.replace(/\s+/g, ""))) ? segment.label : null
    const label = shortTopic(card.topic, 22, fallback) || segment.label || ordinalLabel(at)
    if (card.kind === "gap") {
      pieces.push({ kind: "absent", label, related: shapedRelated(result.value.related ?? [], card, input, shape), card, parts: result.value.parts })
      return
    }
    const body = card.kind === "howto" && input.form === "r3" ? dropRepeatedLines(result.value.parts.response.answer) : result.value.parts.response.answer
    const closed = takeClosing(shapedBlocks(body, shape, cardShapeOptions(card, input.ctx.env ?? process.env)))
    let blocks = closed.blocks
    // number 머리(R3 반박 검토): 사람이 쓴 정책 글이 아니면 제목 같은 첫 줄을 빼고, 조각 물음과 상관없는 뒤 문단을 덜고, 예/아니오 극성을 맞춘다.
    if (input.head === "number" && !isPolicyGoverned(card)) {
      blocks = trimPieceBlocks(dropHeadingLead(blocks), [...pieceContentWords(segment.text), ...pieceContentWords(segment.label ?? "")])
      if (blocks[0] && blockKind(blocks[0]) === "plain") blocks[0] = fixYesNoLead(blocks[0].join("\n"), segment.text).split("\n")
    }
    pieces.push({ kind: "answer", label, blocks, closing: closed.closing, card, parts: result.value.parts })
  })

  if (input.head === "number" && framing === "full") {
    // 앞뒤 답한 조각 본문이 이미 담은 물음을 '찾지 못했어요'라고 하지 않는다: 그 줄을 이 조각 몫으로 옮긴다(R3 반박 검토).
    segments.forEach((segment, at) => {
      const position = pieceAt[at]
      const piece = pieces[position]
      if (!noticeOf[at] || !piece || isAnswerPiece(piece) || piece.kind === "absent" || pieceAt.indexOf(position) !== at) return
      const found = findCoveringLine(pieces, position, segment.label ?? "", segment.text)
      if (!found) return
      const source = pieces[found.piece] as PieceAnswer
      const line = itemTextOf(source.blocks[found.block][found.line])
      const blocks = source.blocks.map((lines, block) => (block === found.block ? lines.filter((_line, index) => index !== found.line) : [...lines])).filter((lines) => lines.length > 0)
      pieces[found.piece] = { ...source, blocks }
      pieces[position] = { kind: "answer", label: piece.label, blocks: [[line]], closing: null, card: source.card, parts: source.parts }
      noticeOf[at] = false
    })
    // 같은 머리 이름이 겹치면 뒤 조각에 묻는 갈래를 붙인다("인증코드" · "인증코드 안 올 때").
    const firstSegmentOf = pieces.map((_piece, position) => segments[pieceAt.indexOf(position)]?.text ?? "")
    const labels = distinctLabels(pieces.map((piece) => piece.label), firstSegmentOf)
    labels.forEach((label, position) => {
      pieces[position] = { ...pieces[position], label }
    })
  }

  const answered = pieces.filter(isAnswerPiece)
  const notices = pieces.filter((piece): piece is PieceNotice => !isAnswerPiece(piece))
  if (answered.length === 0 && pieces.every((piece) => piece.kind === "retry") && failures.length > 0) return { ok: false, reason: failures[0] }
  // 한 카드 답으로 충분한 경우(조각이 모두 같은 카드, 알림 없음)는 단일 답 경로가 처리한다.
  if (!base) {
    if (notices.length === 0 && answered.length <= 1) return null
    if (!undecided && failures.length === 0 && renderedCards.size <= 1) return null
    if (answered.length === 0 && notices.every((piece) => !piece.card)) return null
  }

  const first = answered[0] ?? notices.find((piece) => piece.card !== null && piece.parts !== null)
  const source = first?.parts ?? base
  if (!source) return null
  const parts: AnswerIndexCoreParts = { ...source, response: { ...source.response } }
  const response = parts.response

  // 합친 출처·추천 질문·상담 필요.
  response.sources = []
  response.suggestedQuestions = base ? [...base.response.suggestedQuestions] : []
  response.needsHandoff = Boolean(base?.response.needsHandoff)
  for (const piece of pieces) {
    if (!piece.parts) continue
    response.sources = mergeSources(response.sources, piece.parts.response.sources)
    response.suggestedQuestions = Array.from(new Set([...response.suggestedQuestions, ...piece.parts.response.suggestedQuestions]))
    if (piece.parts.response.needsHandoff && !response.needsHandoff) {
      response.needsHandoff = true
      parts.handoffIntent = piece.parts.handoffIntent
    }
  }
  // 그 조각만 물으면 답이 나오는 못 답한 조각을 추천 질문 맨 앞에(손님이 그대로 눌러 따로 물을 수 있게). 온전한 질문 글만 쓴다.
  const chips = segments
    .filter((_segment, at) => noticeOf[at])
    .map((segment) => chipText(segment, input.question.redacted, input.head === "number"))
    .filter((text): text is string => Boolean(text))
  response.suggestedQuestions = Array.from(new Set([...chips, ...response.suggestedQuestions])).slice(0, 3)
  response.confidence = Math.min(response.confidence, ...pieces.map((piece) => (piece.parts ? piece.parts.response.confidence : 1)))
  const anyAnswered = answered.length > 0
  response.unresolved = !anyAnswered
  response.answerMode = anyAnswered ? "direct_answer" : "fallback"
  // 복합 답에는 주제 되묻기·영업 되묻기를 붙이지 않는다(끝맺음·후속 줄이 겹쳐 길어진다, 품질-4·품질-13).
  parts.topicFollowUp = undefined
  parts.suppressSalesFollowUp = true

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
  // 상담이 필요한 알림(공개 안내에 없음·바로 찾지 못함·증상)이 있으면 상담 버튼을 띄운다.
  if (notices.some((piece) => piece.kind !== "retry") && !response.needsHandoff) {
    response.needsHandoff = true
    parts.handoffIntent = "support"
  }
  // 끝맺음은 필요할 때만 한 줄(결정 2): 상담이 필요한 알림이 있거나 조각 끝맺음 틀을 거뒀고, 어느 조각 본문에도 상담 안내 줄이 없을 때.
  const needClosing = notices.some((piece) => piece.kind !== "retry") || answered.some((piece) => piece.closing !== null)
  // 조각 본문에 이미 상담 안내 줄('[도입 상담 남기기]에 … 남겨 주세요' 같은 사람 글 포함)이 있으면 끝맺음을 더하지 않는다.
  const bodyHasClosing = answered.some((piece) => piece.blocks.flat().some((line) => isClosingLine(line) || CONSULT_GUIDE_RE.test(line)))
  const closing = needClosing && !bodyHasClosing ? COMPOUND_CLOSING_LINE : null
  const cap = compoundLengthCap(segments.length, input.head)
  const budget = cap - COMPOUND_FOLLOW_UP_RESERVE
  const assembled = assemblePieces(pieces, tail, closing, budget, input.head)
  response.answer = assembled.text
  const dropped = assembled.pieces.filter((_piece, at) => assembled.modes[at] === "dropped").length
  const compacted = assembled.modes.filter((mode) => mode === "conclusion" || mode === "line").length
  const traceParts: AnswerIndexTraceSegment[] = segments.map((segment, at) => {
    const decided = segment.kind === "answer" || segment.kind === "gap"
    const piece = assembled.pieces[pieceAt[at]]
    const noticeKind: AnswerIndexNoticeKind | null = piece && !isAnswerPiece(piece) ? piece.kind : null
    return {
      text: segment.text,
      kind: segment.kind,
      card: segment.card,
      by: segment.by ?? (segment.card && decided ? "index" : "none"),
      ...(segment.source ? { source: segment.source } : {}),
      ...(segment.topCard ? { topCard: segment.topCard, topConf: segment.topConf ?? 0 } : {}),
      notice: noticeKind !== null,
      ...(noticeKind ? { noticeKind } : {}),
      ...(segment.alone ? { alone: segment.alone } : {}),
      ...(segment.coverage ? { coverage: segment.coverage } : {}),
    }
  })
  return {
    ok: true,
    parts,
    overrides: {
      partial: notices.length > 0 || dropped > 0 || Boolean(absentTail),
      absentTail,
      parts: traceParts,
      compound: { chars: assembled.text.length, cap, budget, compacted, dropped },
    },
  }
}
