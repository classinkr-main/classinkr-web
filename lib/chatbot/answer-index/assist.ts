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
 * 후보 줄: "[번호] (종류) 주제 | 다루는 것: … | 다루지 않음: …(최대 3개) | 답 앞부분: …(200자)".
 * 모델은 {"pick": n} 만 낸다: 1..후보 수 카드 번호, 0 못 찾음, -1 되묻기.
 *
 * 받아들이는 조건(resolveAssistPick, 사양 §3.5·§10):
 * - 번호가 -1..후보 수 밖이면 결정형 그대로(out_of_range).
 * - 결정형과 같은 카드면 결정형 판정 그대로(조각·꼬리 포함).
 * - 결정형이 정책 카드 답이면 바꾸지 않는다(policy_card). 범위 관문 밖이면 바꾸지 않는다(scope).
 * - 카드: 사람이 공개 범위를 정한 주제(service.ts isPolicyGovernedTopic)면 정책 카드·공백 카드만(policy_topic), 반례(negMargin > 0)에
 *   걸리면 거절(negative), 질문의 없는 개념을 덮지 않으면 거절(absent, 그 개념의 공백 카드는 받아들인다).
 * - 0: 결정형이 이미 못 찾음·되묻기·공백이면 그대로, 질문에 없는 개념이 있고 그 공백 카드가 색인에 있으면 그 공백 카드,
 *   아니면 결정형 못 찾음 갈래(analysis.fallback: 증상 신고·문서에 없음·내용 없는 말 되묻기).
 * - -1: 결정형 되묻기 문구(clarify). 질문에 없는 개념이 있으면 받아들이지 않는다(absent).
 * 모델 호출이 실패하면(연결 없음·차단기·402 등 접근 거절·토큰 실패·시간 초과·HTTP 오류·파싱 실패) 결정형 판정 그대로다.
 * compiled 경로는 MODEL_UNAVAILABLE_ANSWER 를 쓰지 않는다.
 *
 * 이 파일은 모델을 직접 부르지 않는다: 호출 함수(AnswerCardPickRequest, lib/chatbot/llm.ts requestAnswerCardPick)를 받는다.
 * 질문당 호출 함수는 한 번만 부른다. 시간 예산은 CHATBOT_ASSIST_TIMEOUT_MS(기본 2,500ms)이고, 호출 함수가 예산을 넘겨도 여기서 끊는다.
 */
import { absentCoveredBy, checkCandidate, scoreNegatives, type CandidateCheck } from "./checks"
import type { CompiledAnswerIndex } from "./compile"
import { curatedLegacyText } from "./curated"
import { disabledCardIds, type QuestionAnalysis } from "./decide"
import { scoreCandidates } from "./score"
import type {
  AnswerAssistMode,
  AnswerCard,
  AnswerIndexAssistTrace,
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
/** 후보 줄의 '다루지 않음' 최대 개수. */
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

export type AnswerCardPickOutcome =
  | { ok: true; pick: number; model: string }
  | { ok: false; reason: AnswerCardPickFailure; model: string | null }

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

/** 후보 줄 칸 글: 공백을 접고, 칸 구분자(|)는 '/'로 바꾼다(표 문장 등). 비면 "-". */
function field(text: string | null | undefined) {
  const value = collapse(String(text ?? "")).replace(/\s*\|\s*/g, " / ")
  return value || "-"
}

/** notCovers 한 줄("… → 행선")에서 행선(카드 id 등 내부 이름)을 뗀다. */
function notCoveredItem(text: string) {
  return collapse(String(text).split("→")[0] ?? "")
}

/** 번호를 뺀 후보 줄 본문: "(종류) 주제 | 다루는 것: … | 다루지 않음: … | 답 앞부분: …". */
export function assistCandidateBody(card: AnswerCard, units: ReadonlyMap<string, AnswerIndexUnit>) {
  const notCovers = (Array.isArray(card.notCovers) ? card.notCovers : [])
    .map(notCoveredItem)
    .filter(Boolean)
    .slice(0, ASSIST_NOT_COVERS_MAX)
    .map((item) => field(item))
  return [
    `(${card.kind}) ${field(card.topic)}`,
    `다루는 것: ${field(card.covers)}`,
    `다루지 않음: ${notCovers.length > 0 ? notCovers.join(" / ") : "-"}`,
    `답 앞부분: ${field(cardAnswerPreview(card, units))}`,
  ].join(" | ")
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
  env?: Env
  now?: () => number
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

  const started = now()
  const outcome = await requestWithDeadline(input.request, {
    instruction: ANSWER_CARD_PICK_INSTRUCTION,
    input: buildAnswerCardPickInput(input.question, candidates),
    timeoutMs: input.timeoutMs ?? assistTimeoutMs(env),
  })
  const ms = Math.max(0, now() - started)
  if (!outcome.ok) {
    return {
      decision,
      trace: trace({ used: true, model: outcome.model, ms, rejectReason: outcome.reason }),
      modelFailure: outcome.reason,
    }
  }
  const resolved = resolveAssistPick(input.index, input.analysis, decision, candidates, outcome.pick, { isPolicyTopic: input.isPolicyTopic, env })
  return {
    decision: resolved.decision,
    trace: trace({
      used: true,
      pick: outcome.pick,
      pickCard: resolved.pickCard,
      model: outcome.model,
      ms,
      accepted: resolved.accepted,
      rejectReason: resolved.rejectReason,
    }),
    modelFailure: null,
  }
}
