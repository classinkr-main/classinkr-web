/**
 * 모델 선택 층(답 색인 사양 §10, I11). compiled 라우터가 결정형으로 정한 판정을 모델 한 번으로 다시 고른다. 기본 꺼짐.
 *
 * 켜는 범위(CHATBOT_ANSWER_ASSIST, answerAssistMode):
 * - off(기본): 아무것도 하지 않는다. 흔적에 assist 칸도 없다(답·흔적이 이 층이 없을 때와 같다).
 * - band: calibration.json assist.enabled 가 true 이고 결정형 확신도가 assist.band [θ_lo, θ_hi) 안일 때만 묻는다.
 *   공백(gap)·없는 개념(absentHit) 판정, 두 조각을 이은 판정, 정책 카드(policy·policyGoverned) 답, conf ≥ θ_hi 는 손대지 않는다.
 *   enabled 가 false 면 묻지 않고 한 번 경고한다(흔적 rejectReason calibration_disabled).
 * - always: compiled 가 범위 안 질문을 판정할 때마다 묻는다(측정용). 받아들이는 조건은 band 와 같다.
 *
 * 모델에 주는 것: 아래 ANSWER_CARD_PICK_INSTRUCTION(지시문, 대역 추정과 같은 글 그대로)과, 가린 질문 + 질문 전체 순위 상위 10 카드
 * (review·disabled·nav 는 색인에 없고, 끈 카드·상담 연결 카드·none 자리는 뺀다)를 번호와 함께 적은 입력(buildAnswerCardPickInput).
 * 후보 줄: "[번호] (종류) 주제 | 다루는 것: … | 다루지 않음: …(앞 3개, '→ 행선' 그대로) | 답 앞부분: …(200자)".
 * 후보 줄은 대역 추정 묶음(topk 덤프의 칸을 그대로 이은 줄)과 글자까지 같다(시험 assist.test.ts 가 추정 묶음 줄과 맞댄다).
 * 모델은 {"pick": n} 만 낸다: 1..후보 수 카드 번호, 0 못 찾음, -1 되묻기.
 *
 * 받아들이는 조건(resolveAssistPick, 사양 §3.5·§10):
 * - 번호가 -1..후보 수 밖이면 결정형 그대로(out_of_range).
 * - 결정형과 같은 카드면 결정형 판정 그대로(조각·꼬리 포함).
 * - 결정형이 정책 카드 답이면 바꾸지 않는다(policy_card). 범위 관문 밖이면 바꾸지 않는다(scope).
 * - 카드: 사람이 공개 범위를 정한 주제(service.ts isPolicyGovernedTopic)면 정책 카드·공백 카드만(policy_topic), 반례(negMargin > 0)에
 *   걸리면 거절(negative), 질문의 없는 개념을 덮지 않으면 거절(absent, 그 개념의 공백 카드는 받아들인다).
 * - NODOC(정해 둔 답 승격과 같은 신호, decide.ts hasNoDocSignal): 반례 'none' 자리가 1위이거나 우주 이웃의 'none' 몫이
 *   VOTE_RESCUE_MAX_KNN_NONE(0.5) 이상이면, 결정형이 답하지 않은 판정(못 찾음·되묻기·공백)을 다른 카드(공백 카드 포함)로 바꾸지 않는다
 *   (nodoc). 정해 둔 답 승격처럼 문턱 밖에서 답을 만드는 장치는 이 신호를 넘지 않는다. 0·-1 은 그대로 받는다.
 * - 0: 결정형이 이미 못 찾음·되묻기·공백이면 그대로, 질문에 없는 개념이 있고 그 공백 카드가 색인에 있으면 그 공백 카드,
 *   아니면 결정형 못 찾음 갈래(analysis.fallback: 증상 신고·문서에 없음·내용 없는 말 되묻기).
 * - -1: 결정형 되묻기 문구(clarify). 질문에 없는 개념이 있으면 받아들이지 않는다(absent).
 * 모델 호출이 실패하면(연결 없음·차단기·402 등 접근 거절·토큰 실패·시간 초과·HTTP 오류·파싱 실패) 결정형 판정 그대로다.
 * compiled 경로는 MODEL_UNAVAILABLE_ANSWER 를 쓰지 않는다.
 *
 * 이 파일은 모델을 직접 부르지 않는다: 호출 함수(AnswerCardPickRequest)를 받는다. 서비스는 lib/chatbot/claude/card-pick.ts
 * createAssistPickRequests 로 만든 고르기(②)·올림(③) 함수를 넘긴다. 기본 env 에서 고르기는 llm.ts 와 같은 basic 1순위 Gemini 모델 하나에
 * HTTP 요청 한 번이다(실패해도 다음 모델로 넘어가지 않는다). 업체(CHATBOT_ASSIST_PICK_PROVIDER)·업체 간 대체(CHATBOT_ASSIST_CROSS_FALLBACK)는
 * 고르기 함수 안에서 정한다.
 * 고르기 시간 예산은 CHATBOT_ASSIST_TIMEOUT_MS(기본 2,500ms)이고, 호출 함수가 예산을 넘겨도 여기서 끊는다.
 *
 * 올림(③, 기본 꺼짐, escalate 함수를 넘길 때만): 고르기가 성공했고 escalationTrigger((a) 고른 답 카드 ≠ 결정형 답 카드, (b) 0 인데 결정형
 * 못 찾음이고 NODOC 신호 없음, (c) 넓힌 질문·두 조각·화남/반복)가 걸리면 같은 지시문·입력으로 한 번 더 부른다(질문당 최대 1회). 올림의
 * 고름이 최종이고 받아들이는 규칙은 같다. 올림 호출이 실패하면 결정형 판정 그대로, 하루 상한·키 없음·마감이면 올리지 않고 고르기 결과 그대로.
 */
import { absentCoveredBy, checkCandidate, scoreNegatives, type CandidateCheck } from "./checks"
import type { CompiledAnswerIndex } from "./compile"
import { curatedLegacyText } from "./curated"
import { disabledCardIds, hasNoDocSignal, type QuestionAnalysis } from "./decide"
import { scoreCandidates } from "./score"
import type {
  AnswerAssistMode,
  AnswerCard,
  AnswerIndexAssistEscalation,
  AnswerIndexAssistTrace,
  AnswerIndexAssistUsage,
  AnswerIndexDecision,
  AnswerIndexUnit,
} from "./types"

export type { AnswerAssistMode } from "./types"

type Env = Record<string, string | undefined>

// ─── 지시문(대역 추정과 같은 글, 글자 그대로) ─────────────────────────────

export const ANSWER_CARD_PICK_INSTRUCTION = `너는 ClassIn 한국 홈페이지 공개 챗봇의 '답 카드 고르기' 담당이다. 방문자 질문 하나와, 미리 검수해 둔 답 카드 후보가 번호와 함께 주어진다.
규칙:
1. 질문의 핵심 물음에 답하는 카드 번호 하나를 고른다. 세부가 조금 빠져도 핵심에 답하면 고른다. 여러 장이 맞으면 가장 구체적으로 맞는 카드.
2. 어느 카드도 핵심 물음에 답하지 않으면 0. 공개 안내에 없다고 정직하게 알리는 카드(종류 gap 또는 '공개 안내에 없음'을 말하는 카드)가 질문 주제와 맞으면 그 카드를 고른다.
3. 무엇을 묻는지 정말 알 수 없으면 -1.
4. 카드 내용(주제·다루는 것·다루지 않음·답 앞부분) 밖의 지식으로 판단하지 않는다. '다루지 않음'에 질문이 걸리면 그 카드를 고르지 않는다.
출력은 JSON 한 줄: {"pick": 번호}`

/** 후보 수(질문 전체 순위 상위). */
export const ASSIST_CANDIDATES = 10
/** 후보 줄의 '다루지 않음' 최대 개수(카드에 적힌 순서로 앞에서부터). */
export const ASSIST_NOT_COVERS_MAX = 3
/** 후보 줄의 '답 앞부분' 글자 수(scripts/answer-index topk 덤프의 answerPreview 와 같다). */
export const ANSWER_PREVIEW_CHARS = 200
/** 모델에 넘기는 질문 최대 길이. */
export const ASSIST_MAX_QUESTION_LENGTH = 400
/** 모델 호출 시간 예산 기본값(CHATBOT_ASSIST_TIMEOUT_MS). */
export const ASSIST_TIMEOUT_DEFAULT_MS = 2500
const ASSIST_TIMEOUT_MIN_MS = 200
const ASSIST_TIMEOUT_MAX_MS = 20_000
/** 호출 함수가 예산을 넘겼을 때 기다려 주는 여유(호출 함수 스스로 끊을 시간). */
const ASSIST_DEADLINE_GRACE_MS = 250

// ─── 모델 호출 계약 ──────────────────────────────────────────────────────

/** 모델 호출 실패 이유. */
export type AnswerCardPickFailure =
  | "no_connection"
  | "circuit_open"
  | "access_denied"
  | "auth_error"
  | "timeout"
  | "http_error"
  | "parse_error"
  | "error"
  /** Claude 안전 분류기 거절(stop_reason refusal). */
  | "refusal"
  /** Claude 하루 상한(CHATBOT_CLAUDE_DAILY_BUDGET_USD)에 걸려 부르지 않음. 실패로 보지 않는다(올림·대체를 끈 것과 같다). */
  | "budget"

/** 고르기 업체. */
export type AnswerCardPickProvider = "gemini" | "claude"

/** Claude 호출 한 번의 토큰·추정 비용(lib/chatbot/claude/pricing.ts). Gemini 호출은 남기지 않는다. */
export interface AnswerCardPickCallUsage {
  stage: "pick" | "cross" | "escalate"
  model: string
  inputTokens: number
  outputTokens: number
  cacheReadInputTokens: number
  cacheCreationInputTokens: number
  usd: number
}

/**
 * 호출 함수가 덧붙일 수 있는 칸(업체 고르기·대체 층, lib/chatbot/claude/card-pick.ts). llm.ts requestAnswerCardPick 은 붙이지 않는다.
 * crossFallback: 1순위 Gemini 가 실패해 Claude 로 다시 골랐으면 그 실패(from 모델·이유).
 */
interface AnswerCardPickOutcomeExtras {
  provider?: AnswerCardPickProvider
  usage?: AnswerCardPickCallUsage[]
  crossFallback?: { from: string | null; reason: AnswerCardPickFailure; status: number | null }
  /** 하루 상한 때문에 Claude(고르기·대체)를 건너뛰었는지. */
  budgetBlocked?: boolean
}

export type AnswerCardPickOutcome =
  | ({ ok: true; pick: number; model: string } & AnswerCardPickOutcomeExtras)
  | ({ ok: false; reason: AnswerCardPickFailure; model: string | null } & AnswerCardPickOutcomeExtras)

/** 모델 호출 함수(lib/chatbot/llm.ts requestAnswerCardPick). instruction 은 지시문, input 은 질문·후보 글. */
export type AnswerCardPickRequest = (args: { instruction: string; input: string; timeoutMs: number }) => Promise<AnswerCardPickOutcome>

// ─── 환경변수 ────────────────────────────────────────────────────────────

/** CHATBOT_ANSWER_ASSIST: off(기본) · band · always. 모르는 값은 off. */
export function answerAssistMode(env: Env = process.env): AnswerAssistMode {
  const value = env.CHATBOT_ANSWER_ASSIST?.trim().toLowerCase()
  return value === "band" || value === "always" ? value : "off"
}

/** CHATBOT_ASSIST_TIMEOUT_MS: 모델 호출 시간 예산(ms, 기본 2,500, 200~20,000 으로 자름). */
export function assistTimeoutMs(env: Env = process.env) {
  const raw = env.CHATBOT_ASSIST_TIMEOUT_MS?.trim()
  const value = raw ? Number(raw) : NaN
  if (!Number.isFinite(value) || value <= 0) return ASSIST_TIMEOUT_DEFAULT_MS
  return Math.min(ASSIST_TIMEOUT_MAX_MS, Math.max(ASSIST_TIMEOUT_MIN_MS, Math.round(value)))
}

// ─── 후보 줄 ─────────────────────────────────────────────────────────────

const collapse = (text: string) => text.replace(/\s+/g, " ").trim()

function preview(text: string) {
  const collapsed = collapse(text)
  return collapsed.length > ANSWER_PREVIEW_CHARS ? collapsed.slice(0, ANSWER_PREVIEW_CHARS) : collapsed
}

/**
 * 카드 답 글 미리보기(앞 200자). doc 는 고른 문장 글, curatedRef 는 옛 답 글, text 는 그대로, howto 는 증상 주제·가이드 답 글,
 * gap 은 "공개 안내에 없는 주제: <topic>". 글을 만들 수 없으면(옛 답·주제 없음) 빈 글. 라벨용 상위 카드 덤프(topk)도 이 함수를 쓴다.
 */
export function cardAnswerPreview(card: AnswerCard, units: ReadonlyMap<string, AnswerIndexUnit>): string {
  switch (card.kind) {
    case "doc": {
      const texts: string[] = []
      for (const ref of card.answer.sentences ?? []) {
        const unit = units.get(ref.unit)
        for (const i of ref.ids ?? []) {
          const text = unit?.sentences[i]?.text
          if (text) texts.push(text)
        }
      }
      return preview(texts.join(" "))
    }
    case "fixed":
      return preview("curatedRef" in card.answer ? (curatedLegacyText(card.answer.curatedRef) ?? "") : card.answer.text)
    case "policy":
      return preview(card.answer.text)
    case "howto": {
      const topic = card.answer.symptomTopic ? curatedLegacyText({ module: "symptom", id: card.answer.symptomTopic }) : null
      const guide = card.answer.guide ? curatedLegacyText({ module: "guide", id: card.answer.guide }) : null
      return preview([topic, guide].filter((part): part is string => Boolean(part)).join(" "))
    }
    case "gap":
      return `공개 안내에 없는 주제: ${card.topic}`
    case "handoff":
      return `상담 연결(${card.answer.handoffKind})`
    default:
      return ""
  }
}

/**
 * 후보 줄 칸 글. 대역 추정 묶음은 topk 덤프의 칸(주제·다루는 것·다루지 않음·답 앞부분)을 손대지 않고 이었으므로 여기서도 공백을
 * 접거나 다듬지 않는다(답 앞부분은 200자에서 잘려 끝에 공백이 남을 수 있다). 줄을 깨는 줄바꿈만 띄어쓰기로, 칸 구분자(|)는 '/'로
 * 바꾼다(지금 자료에는 둘 다 없어 추정 묶음과 같은 글이 된다). 비면 "-".
 */
function field(text: string | null | undefined) {
  const value = String(text ?? "").replace(/[\r\n]+/g, " ").replace(/\|/g, "/")
  return value.trim() ? value : "-"
}

/** 후보 줄 본문을 만드는 카드 칸(topk 덤프의 TopKCard 칸과 같은 뜻). */
export interface AssistCandidateFields {
  kind: string
  topic: string | null | undefined
  covers: string | null | undefined
  /** 카드의 notCovers 그대로("… → 행선"). 앞 ASSIST_NOT_COVERS_MAX 개를 행선까지 그대로 싣는다. */
  notCovers: readonly unknown[] | null | undefined
  /** cardAnswerPreview 글. */
  answerPreview: string
}

/** 번호를 뺀 후보 줄 본문: "(종류) 주제 | 다루는 것: … | 다루지 않음: … | 답 앞부분: …". */
export function formatAssistCandidateBody(fields: AssistCandidateFields) {
  const notCovers = (Array.isArray(fields.notCovers) ? fields.notCovers : [])
    .slice(0, ASSIST_NOT_COVERS_MAX)
    .map((item) => field(String(item ?? "")))
  return [
    `(${fields.kind}) ${field(fields.topic)}`,
    `다루는 것: ${field(fields.covers)}`,
    `다루지 않음: ${notCovers.length > 0 ? notCovers.join(" / ") : "-"}`,
    `답 앞부분: ${field(fields.answerPreview)}`,
  ].join(" | ")
}

/** 카드 하나의 후보 줄 본문(번호 뺌). */
export function assistCandidateBody(card: AnswerCard, units: ReadonlyMap<string, AnswerIndexUnit>) {
  return formatAssistCandidateBody({
    kind: card.kind,
    topic: card.topic,
    covers: card.covers,
    notCovers: card.notCovers,
    answerPreview: cardAnswerPreview(card, units),
  })
}

const bodyCache = new WeakMap<CompiledAnswerIndex, Map<number, string>>()

function cachedBody(index: CompiledAnswerIndex, card: number) {
  let byCard = bodyCache.get(index)
  if (!byCard) {
    byCard = new Map()
    bodyCache.set(index, byCard)
  }
  let body = byCard.get(card)
  if (body === undefined) {
    body = assistCandidateBody(index.cards[card].card, index.currentUnits)
    byCard.set(card, body)
  }
  return body
}

export interface AssistCandidate {
  /** 모델에 보이는 번호(1부터). */
  n: number
  /** 색인 카드 번호. */
  card: number
  id: string
  /** 질문 전체 순위(analysis.whole.ranked) 안 위치. */
  at: number
  /** 후보 줄 "[n] …". */
  line: string
}

/**
 * 질문 전체 순위 상위 ASSIST_CANDIDATES 카드. none 자리(반례 'none'), 상담 연결 카드, active 가 아니거나 끈
 * (CHATBOT_COMPILED_DISABLED_CARDS) 카드는 뺀다. review·disabled 카드와 nav 표시는 처음부터 색인에 없다.
 */
export function assistCandidates(index: CompiledAnswerIndex, analysis: QuestionAnalysis, env: Env = process.env): AssistCandidate[] {
  const disabled = disabledCardIds(env)
  const candidates: AssistCandidate[] = []
  const { ranked } = analysis.whole
  for (let at = 0; at < ranked.length && candidates.length < ASSIST_CANDIDATES; at += 1) {
    const candidate = ranked[at]
    if (candidate.card < 0 || candidate.card >= index.cards.length) continue
    const compiled = index.cards[candidate.card]
    if (compiled.kind === "handoff" || compiled.card.status !== "active" || disabled.has(compiled.id)) continue
    const n = candidates.length + 1
    candidates.push({ n, card: candidate.card, id: compiled.id, at, line: `[${n}] ${cachedBody(index, candidate.card)}` })
  }
  return candidates
}

/** 모델 입력: 방문자 질문(가린 글) + 번호 붙은 후보 줄. */
export function buildAnswerCardPickInput(question: string, candidates: readonly Pick<AssistCandidate, "line">[]) {
  const text = collapse(question).slice(0, ASSIST_MAX_QUESTION_LENGTH)
  return `방문자 질문: ${text}\n\n답 카드 후보:\n${candidates.map((candidate) => candidate.line).join("\n")}`
}

// ─── 묻는지 정하기 ───────────────────────────────────────────────────────

function isPolicyGovernedCard(card: AnswerCard) {
  return card.kind === "policy" || (card.kind === "fixed" && card.policyGoverned === true)
}

/** 결정형 판정이 정책 카드(policy·policyGoverned)로 답했는지. */
function answeredWithPolicyCard(index: CompiledAnswerIndex, decision: AnswerIndexDecision) {
  if (decision.kind !== "answer" || !decision.card) return false
  const at = index.cardById.get(decision.card)
  return at !== undefined && isPolicyGovernedCard(index.cards[at].card)
}

/** 모델에 묻지 않는 이유(null 이면 묻는다). */
export function assistSkipReason(mode: Exclude<AnswerAssistMode, "off">, index: CompiledAnswerIndex, decision: AnswerIndexDecision): string | null {
  if (mode === "always") return null
  const settings = index.assist
  if (!settings?.enabled) return "calibration_disabled"
  if (decision.kind === "gap") return "gap"
  if (decision.absentHit) return "absent"
  if (answeredWithPolicyCard(index, decision)) return "policy_card"
  if (decision.segments) return "segments"
  const [lo, hi] = settings.band
  if (!(decision.conf >= lo && decision.conf < hi)) return "out_of_band"
  return null
}

// ─── 받아들이기 ──────────────────────────────────────────────────────────

export interface AssistPickResolution {
  decision: AnswerIndexDecision
  accepted: boolean
  rejectReason: string | null
  pickCard: string | null
}

export interface ResolveAssistOptions {
  /** 질문이 사람이 공개 범위를 정한 주제인지(service.ts isPolicyGovernedTopic). 다른 카드로 바꿀 때만 부른다. */
  isPolicyTopic?: () => boolean
  env?: Env
}

/** 고른 카드의 반례·덮임 검사. 상위 5 밖이라 결정형이 검사하지 않은 카드는 decide 와 같은 입력으로 다시 검사한다. */
function checkPicked(index: CompiledAnswerIndex, analysis: QuestionAnalysis, at: number, env: Env): CandidateCheck {
  const ranked = analysis.whole.ranked[at]
  if (ranked.check) return ranked.check
  const query = analysis.whole.query
  const scored = scoreCandidates(index, query, analysis.votes, { disabled: disabledCardIds(env) })
  return checkCandidate(index, query, ranked.card, {
    negatives: scoreNegatives(index, query),
    maxVariantCos: scored.maxVariantCos,
    centroidCos: scored.centroidCos,
  })
}

function baseDecision(analysis: QuestionAnalysis): Pick<AnswerIndexDecision, "askType" | "top" | "segments" | "absentTail" | "partial" | "rescue"> {
  return { askType: analysis.whole.query.askType, top: analysis.whole.top, segments: null, absentTail: null, partial: false, rescue: null }
}

/**
 * 모델이 고른 번호 → 최종 판정. 받아들이지 않으면 결정형 판정 그대로(accepted=false, rejectReason).
 * candidates 는 모델에 보인 후보(assistCandidates)다.
 */
export function resolveAssistPick(
  index: CompiledAnswerIndex,
  analysis: QuestionAnalysis,
  decision: AnswerIndexDecision,
  candidates: readonly Pick<AssistCandidate, "card" | "id" | "at">[],
  pick: number,
  options: ResolveAssistOptions = {}
): AssistPickResolution {
  const env = options.env ?? process.env
  const keep = (rejectReason: string, pickCard: string | null = null): AssistPickResolution => ({ decision, accepted: false, rejectReason, pickCard })
  const follow = (next: AnswerIndexDecision, pickCard: string | null = null): AssistPickResolution => ({ decision: next, accepted: true, rejectReason: null, pickCard })
  if (!Number.isInteger(pick) || pick < -1 || pick > candidates.length) return keep("out_of_range")

  const whole = analysis.whole
  const policyAnswer = answeredWithPolicyCard(index, decision)

  if (pick === -1) {
    if (decision.kind === "clarify") return follow(decision)
    if (policyAnswer) return keep("policy_card")
    if (whole.query.absent.length > 0) return keep("absent")
    return follow({
      ...baseDecision(analysis),
      kind: "clarify",
      card: null,
      conf: decision.conf,
      unexplained: [],
      absentHit: null,
      features: whole.features,
      abstainReason: null,
    })
  }

  if (pick === 0) {
    if (decision.kind === "abstain" || decision.kind === "clarify" || decision.kind === "gap") return follow(decision)
    if (policyAnswer) return keep("policy_card")
    if (whole.absentMatch && whole.absentGapCard !== null) {
      return follow({
        ...baseDecision(analysis),
        kind: "gap",
        card: index.cards[whole.absentGapCard].id,
        conf: decision.conf,
        unexplained: [],
        absentHit: whole.absentMatch.id,
        features: whole.features,
        abstainReason: null,
      })
    }
    return follow({
      ...baseDecision(analysis),
      kind: whole.fallback.kind,
      card: null,
      conf: decision.conf,
      unexplained: [],
      absentHit: null,
      features: whole.features,
      abstainReason: whole.fallback.kind === "abstain" ? (whole.fallback.abstainReason ?? "nodoc") : null,
    })
  }

  const candidate = candidates[pick - 1]
  const pickCard = candidate.id
  if ((decision.kind === "answer" || decision.kind === "gap") && decision.card === candidate.id) return follow(decision, pickCard)
  if (policyAnswer) return keep("policy_card", pickCard)
  if (!analysis.inScope) return keep("scope", pickCard)
  const at = candidate.at
  const ranked = whole.ranked[at]
  const compiled = candidate.card >= 0 && candidate.card < index.cards.length ? index.cards[candidate.card] : undefined
  if (
    !compiled ||
    !ranked ||
    ranked.card !== candidate.card ||
    compiled.id !== candidate.id ||
    compiled.kind === "handoff" ||
    compiled.card.status !== "active" ||
    disabledCardIds(env).has(compiled.id)
  ) {
    return keep("card_unavailable", pickCard)
  }
  // NODOC: 결정형이 '문서에 없음' 신호로 답하지 않은 질문을 그 아래 카드로 바꾸지 않는다(정해 둔 답 승격과 같은 신호). 공백 카드도
  // 막는다: 이 신호가 있을 때 1번 공백 카드는 질문과 다른 주제일 수 있고(예: '클래스인 무료로 써도 돼?'의 1번이 스타일러스 공백 카드),
  // 이 경우의 고름은 잰 적이 없다.
  if (decision.kind !== "answer" && hasNoDocSignal(whole)) return keep("nodoc", pickCard)
  if (!isPolicyGovernedCard(compiled.card) && compiled.kind !== "gap" && options.isPolicyTopic?.()) return keep("policy_topic", pickCard)
  const check = checkPicked(index, analysis, at, env)
  if (check.rejected) return keep("negative", pickCard)
  const uncovered = whole.query.absent.filter((match) => !absentCoveredBy(index, whole.query, match, candidate.card))
  if (uncovered.some((match) => index.absent.byId.get(match.id)?.gapCard !== compiled.id)) return keep("absent", pickCard)
  return follow(
    {
      ...baseDecision(analysis),
      kind: compiled.kind === "gap" ? "gap" : "answer",
      card: compiled.id,
      conf: whole.confs[at] ?? 0,
      unexplained: check.unexplained,
      absentHit: uncovered[0]?.id ?? null,
      features: at < whole.topFeatures.length ? whole.topFeatures[at] : undefined,
      abstainReason: null,
    },
    pickCard
  )
}

// ─── 한 질문 ─────────────────────────────────────────────────────────────

export interface AnswerAssistInput {
  index: CompiledAnswerIndex
  /** decide 와 같은 분석(decideWithAnalysis). */
  analysis: QuestionAnalysis
  /** 결정형 판정. */
  decision: AnswerIndexDecision
  /** 모델에 보낼 질문(가린 글). */
  question: string
  mode: AnswerAssistMode
  request: AnswerCardPickRequest
  isPolicyTopic?: () => boolean
  /** 시간 예산(없으면 CHATBOT_ASSIST_TIMEOUT_MS). */
  timeoutMs?: number
  /**
   * 올림(③, CHATBOT_ASSIST_ESCALATE) 호출 함수. 없으면 올리지 않는다(지금 동작). 고르기(②)가 성공했고 escalationTrigger 가 걸리면
   * 같은 지시문·입력으로 한 번 더 부르고, 그 고름을 최종으로 받아들이는 규칙에 넣는다. 질문당 최대 1회.
   */
  escalate?: AnswerCardPickRequest
  /** 올림 한 번의 시간 상한(기본 ESCALATE_TIMEOUT_DEFAULT_MS). */
  escalateTimeoutMs?: number
  /** 라우트 마감 시각(now() 기준 ms). 있으면 올림 예산은 마감까지 남은 시간을 넘지 않는다. */
  deadlineAt?: number
  /** 올림 조건 (c)의 신호: 대화 맥락으로 넓힌 질문·화남·반복 말투(두 조각은 analysis.parts 로 본다). */
  escalateSignals?: AssistEscalationSignals
  env?: Env
  now?: () => number
}

export interface AssistEscalationSignals {
  expanded?: boolean
  angry?: boolean
  repeated?: boolean
}

/** 올림 한 번의 시간 상한 기본값(CHATBOT_ASSIST_ESCALATE_TIMEOUT_MS). */
export const ESCALATE_TIMEOUT_DEFAULT_MS = 3000
/** 남은 시간이 이보다 짧으면 올리지 않는다. */
const ESCALATE_MIN_MS = 300

export type AssistEscalationTrigger = "disagree" | "none_vs_abstain" | "context"

/**
 * 올림 조건(③). 순서대로 본다.
 * (a) disagree: 고른 번호가 카드이고 결정형 1위(답 판정의 카드)와 다르며 둘 다 답 카드(공백 카드가 아님).
 * (b) none_vs_abstain: 고름이 0(없음)이고 결정형이 못 찾음(abstain)이며 NODOC 신호(hasNoDocSignal)가 없다.
 * (c) context: 대화 맥락으로 넓힌 질문·두 조각 질문(analysis.parts)·말투가 화남/반복.
 * 번호가 범위 밖이면 올리지 않는다(결정형 그대로).
 */
export function escalationTrigger(
  index: CompiledAnswerIndex,
  analysis: QuestionAnalysis,
  decision: AnswerIndexDecision,
  candidates: readonly Pick<AssistCandidate, "card" | "id">[],
  pick: number,
  signals: AssistEscalationSignals = {}
): AssistEscalationTrigger | null {
  if (!Number.isInteger(pick) || pick < -1 || pick > candidates.length) return null
  if (pick >= 1 && decision.kind === "answer" && decision.card) {
    const candidate = candidates[pick - 1]
    const compiled = index.cards[candidate.card]
    if (candidate.id !== decision.card && compiled && compiled.kind !== "gap") return "disagree"
  }
  if (pick === 0 && decision.kind === "abstain" && !hasNoDocSignal(analysis.whole)) return "none_vs_abstain"
  if (signals.expanded || analysis.parts !== null || signals.angry || signals.repeated) return "context"
  return null
}

/** 질문 하나의 Claude 호출 usage 를 흔적 꼴로 합친다. */
function sumUsage(entries: readonly AnswerCardPickCallUsage[]): AnswerIndexAssistUsage | undefined {
  if (entries.length === 0) return undefined
  const total = entries.reduce(
    (sum, entry) => ({
      inputTokens: sum.inputTokens + entry.inputTokens,
      outputTokens: sum.outputTokens + entry.outputTokens,
      cacheReadInputTokens: sum.cacheReadInputTokens + entry.cacheReadInputTokens,
      cacheCreationInputTokens: sum.cacheCreationInputTokens + entry.cacheCreationInputTokens,
      usd: sum.usd + entry.usd,
    }),
    { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, usd: 0 }
  )
  return { ...total, usd: Number(total.usd.toFixed(8)), calls: entries.map((entry) => ({ ...entry })) }
}

export interface AnswerAssistResult {
  /** 최종 판정. */
  decision: AnswerIndexDecision
  /** 흔적(off 면 null). */
  trace: AnswerIndexAssistTrace | null
  /** 모델 호출이 실패했으면 그 이유(답 캐시에 넣지 않는다). 묻지 않았거나 성공했으면 null. */
  modelFailure: AnswerCardPickFailure | null
}

let warnedCalibrationDisabled = false

function round3(value: number) {
  return Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0
}

async function requestWithDeadline(
  request: AnswerCardPickRequest,
  args: { instruction: string; input: string; timeoutMs: number }
): Promise<AnswerCardPickOutcome> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<AnswerCardPickOutcome>((resolve) => {
    timer = setTimeout(() => resolve({ ok: false, reason: "timeout", model: null }), args.timeoutMs + ASSIST_DEADLINE_GRACE_MS)
  })
  try {
    return await Promise.race([
      request(args).catch((): AnswerCardPickOutcome => ({ ok: false, reason: "error", model: null })),
      deadline,
    ])
  } finally {
    clearTimeout(timer)
  }
}

/** 업체 고르기·대체 층이 붙인 칸 → 흔적 칸. 붙이지 않은 호출(llm.ts requestAnswerCardPick)이면 빈 객체(지금 흔적과 같다). */
function providerTraceFields(outcome: AnswerCardPickOutcome, escalateOn: boolean): Partial<AnswerIndexAssistTrace> {
  if (!outcome.provider) return {}
  return {
    provider: outcome.provider,
    crossFallback: Boolean(outcome.crossFallback),
    ...(outcome.budgetBlocked ? { budgetBlocked: true } : {}),
    ...(escalateOn ? { escalated: false } : {}),
  }
}

/** 모델 선택 층(§10). off 면 결정형 판정 그대로, 흔적 없음. 예외를 던지지 않는다. */
export async function maybeAssistWithModel(input: AnswerAssistInput): Promise<AnswerAssistResult> {
  const { decision, mode } = input
  if (mode === "off") return { decision, trace: null, modelFailure: null }
  const env = input.env ?? process.env
  const now = input.now ?? Date.now
  const original = { kind: decision.kind, card: decision.card, conf: round3(decision.conf) }
  const trace = (fields: Partial<AnswerIndexAssistTrace>): AnswerIndexAssistTrace => ({
    mode,
    used: false,
    pick: null,
    pickCard: null,
    model: null,
    ms: null,
    accepted: false,
    rejectReason: null,
    original,
    ...fields,
  })

  const skip = assistSkipReason(mode, input.index, decision)
  if (skip) {
    if (skip === "calibration_disabled" && !warnedCalibrationDisabled) {
      warnedCalibrationDisabled = true
      console.warn("[chatbot] CHATBOT_ANSWER_ASSIST=band 이지만 calibration.json assist.enabled 가 false 라 모델 선택 층을 쓰지 않습니다.")
    }
    return { decision, trace: trace({ rejectReason: skip }), modelFailure: null }
  }
  const candidates = assistCandidates(input.index, input.analysis, env)
  if (candidates.length === 0) return { decision, trace: trace({ rejectReason: "no_candidates" }), modelFailure: null }

  const pickArgs = {
    instruction: ANSWER_CARD_PICK_INSTRUCTION,
    input: buildAnswerCardPickInput(input.question, candidates),
    timeoutMs: input.timeoutMs ?? assistTimeoutMs(env),
  }
  const started = now()
  const outcome = await requestWithDeadline(input.request, pickArgs)
  const ms = Math.max(0, now() - started)
  const escalateOn = Boolean(input.escalate)
  const usageEntries: AnswerCardPickCallUsage[] = [...(outcome.usage ?? [])]
  const extras = providerTraceFields(outcome, escalateOn)
  const withUsage = (fields: Partial<AnswerIndexAssistTrace>): Partial<AnswerIndexAssistTrace> => {
    const usage = sumUsage(usageEntries)
    return usage ? { ...fields, usage } : fields
  }
  if (!outcome.ok) {
    return {
      decision,
      trace: trace(withUsage({ used: true, model: outcome.model, ms, rejectReason: outcome.reason, ...extras })),
      // 하루 상한으로 부르지 않은 것은 실패가 아니다(Gemini 고르기가 따로 실패한 경우는 그 이유가 reason 이다).
      modelFailure: outcome.reason === "budget" ? null : outcome.reason,
    }
  }
  const resolveOptions = { isPolicyTopic: input.isPolicyTopic, env }
  const resolved = resolveAssistPick(input.index, input.analysis, decision, candidates, outcome.pick, resolveOptions)
  const firstFields: Partial<AnswerIndexAssistTrace> = {
    used: true,
    pick: outcome.pick,
    pickCard: resolved.pickCard,
    model: outcome.model,
    ms,
    accepted: resolved.accepted,
    rejectReason: resolved.rejectReason,
    ...extras,
  }

  const trigger = input.escalate
    ? escalationTrigger(input.index, input.analysis, decision, candidates, outcome.pick, input.escalateSignals)
    : null
  if (!input.escalate || !trigger) {
    return { decision: resolved.decision, trace: trace(withUsage(firstFields)), modelFailure: null }
  }

  // ③ 올림: 같은 지시문·입력으로 한 번 더. 결과가 최종(받아들이는 규칙 같음). 실패하면 결정형 판정 그대로.
  const first = { provider: outcome.provider ?? null, model: outcome.model, pick: outcome.pick, pickCard: resolved.pickCard }
  const escalation = (fields: Partial<AnswerIndexAssistEscalation>): AnswerIndexAssistEscalation => ({
    trigger,
    skipped: null,
    model: null,
    pick: null,
    ms: null,
    failure: null,
    first,
    ...fields,
  })
  const remaining = input.deadlineAt !== undefined ? input.deadlineAt - now() : Number.POSITIVE_INFINITY
  const escalateTimeoutMs = Math.min(input.escalateTimeoutMs ?? ESCALATE_TIMEOUT_DEFAULT_MS, remaining)
  if (escalateTimeoutMs < ESCALATE_MIN_MS) {
    return {
      decision: resolved.decision,
      trace: trace(withUsage({ ...firstFields, escalation: escalation({ skipped: "deadline" }) })),
      modelFailure: null,
    }
  }
  const escStarted = now()
  const esc = await requestWithDeadline(input.escalate, { ...pickArgs, timeoutMs: escalateTimeoutMs })
  const escMs = Math.max(0, now() - escStarted)
  usageEntries.push(...(esc.usage ?? []))
  if (!esc.ok && (esc.reason === "budget" || esc.reason === "no_connection")) {
    // 하루 상한·키 없음: 올림을 끈 것과 같다(고르기 결과 그대로).
    return {
      decision: resolved.decision,
      trace: trace(
        withUsage({
          ...firstFields,
          ...(esc.budgetBlocked ? { budgetBlocked: true } : {}),
          escalation: escalation({ skipped: esc.reason, model: esc.model }),
        })
      ),
      modelFailure: null,
    }
  }
  if (!esc.ok) {
    return {
      decision,
      trace: trace(
        withUsage({
          ...firstFields,
          ms: ms + escMs,
          accepted: false,
          rejectReason: `escalation_${esc.reason}`,
          escalated: true,
          escalation: escalation({ model: esc.model, ms: escMs, failure: esc.reason }),
        })
      ),
      modelFailure: esc.reason,
    }
  }
  const final = resolveAssistPick(input.index, input.analysis, decision, candidates, esc.pick, resolveOptions)
  return {
    decision: final.decision,
    trace: trace(
      withUsage({
        ...firstFields,
        pick: esc.pick,
        pickCard: final.pickCard,
        model: esc.model,
        ...(esc.provider ? { provider: esc.provider } : {}),
        ms: ms + escMs,
        accepted: final.accepted,
        rejectReason: final.rejectReason,
        escalated: true,
        escalation: escalation({ model: esc.model, pick: esc.pick, ms: escMs }),
      })
    ),
    modelFailure: null,
  }
}
