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
 *
 * R2 B3(복합 질문·낱말 표시):
 * - 복합 질문(analysis.parts, 나누기 v2)은 따로 된 지시문(ANSWER_CARD_MULTI_PICK_INSTRUCTION)과 입력(조각 목록·주의 줄·조각별 후보 합집합에
 *   "← 조각 n" 꼬리표)으로 한 번 묻고 {"picks": [조각마다 번호]}를 받는다(assistPartCandidates·buildAnswerCardMultiPickInput). 결정형이 이미
 *   답한 조각은 '답함: [n]'으로 보이고 덮어쓰지 않는다. 모든 조각을 결정형이 답했으면 묻지 않는다(segments_decided). 받아들이는 규칙은 조각
 *   분석(그 조각 글·점수·검사·없는 개념) 기준으로 조각마다 적용한다(resolveAssistPicks). {"pick": n} 이 오면 조각 1 번호로 본다. 배열이
 *   짧으면 남은 조각은 그대로(missing), 길면 앞에서부터만 쓴다.
 * - 단일 질문은 지금 지시문·입력·{"pick": n}이 기본(v1, 바이트 고정 시험 assist-single-bytes.test.ts). CHATBOT_ASSIST_PICK_PROMPT=v2 면
 *   두 줄('가능 여부·수치·한도를 묻는데 카드에 그 값이 없으면 고르지 않는다', '증상이 불분명하면 되묻기')과 주의 줄을 더한 새 판.
 * - 정책 주제 거절은 '고른 카드의 개념이 질문의 정책 개념과 겹치고 허용 표시(policyTopicAllowed)가 없을 때만'(policyTopicBlocks).
 *   정책 개념 = 정책 카드(종류 policy)가 가진 비일반 개념. 정규식만 걸리고 겹치지 않으면 받아들이고 주의 표시(policy_topic)를 남긴다.
 * - 없는 개념 거절은 그 자리가 묻는 대상(B2 absentTargets target)일 때만. 수식어·비교·제외·상황 자리는 받아들이고 주의 표시만 남긴다.
 * - 결정형이 정책 카드로 답했으면 다른 카드로 바꾸지 않되 '고르지 않음(0)'만은 받아들인다(못 찾음 갈래로).
 * - 후보 수(CHATBOT_ASSIST_CANDIDATES, 기본 10, 1~20)와 대역 하한·상한(CHATBOT_ASSIST_BAND_LO·HI, 없으면 calibration.json)은 설정값이다.
 */
import { absentCoveredBy, checkCandidate, scoreNegatives, type CandidateCheck } from "./checks"
import type { CompiledAnswerIndex, CompiledCard, IndexQuery } from "./compile"
import { curatedLegacyText } from "./curated"
import { disabledCardIds, hasNoDocSignal, type QuestionAnalysis, type SegmentAnalysis } from "./decide"
import type { AbsentMatch } from "./lexicon"
import { normalizeText } from "./normalize"
import { scoreCandidates } from "./score"
import type {
  AnswerAssistMode,
  AnswerCard,
  AnswerIndexAssistEscalation,
  AnswerIndexAssistPartTrace,
  AnswerIndexAssistTrace,
  AnswerIndexAssistUsage,
  AnswerIndexCaution,
  AnswerIndexDecision,
  AnswerIndexSegmentDecision,
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

/** 두 지시문(단일 새 판·복합)에 더한 줄(R2 B3, PICK-REPORT §4.2): '없음'이 정답인 질문에 비슷한 카드를 붙이지 않게. */
const PICK_RULE_VALUE = "가능 여부·수치·한도·있다/없다를 묻는데 카드가 그 값을 말하지 않으면 그 카드를 고르지 않는다."
const PICK_RULE_SYMPTOM = "증상이 불분명해 무엇이 안 되는지 알 수 없으면 -1(되묻기)."
const PICK_RULE_CAUTION =
  "'주의' 줄은 결정 규칙이 알아본 표시다. '공개 안내에 없음'은 그 부분에 답하는 카드가 없다는 뜻이고, '정책 주제'는 요금·계약·체험·인원 한도 같은 값을 정책 카드(종류 policy)만 말할 수 있다는 뜻이다."

/**
 * 단일 질문 지시문 새 판(CHATBOT_ASSIST_PICK_PROMPT=v2). 옛 판(ANSWER_CARD_PICK_INSTRUCTION)에 두 줄과 주의 줄 설명을 더했다. 출력은 같다.
 * 측정은 이 판으로 하고, 기본은 옛 판이다(옛 판으로 잰 대역·하이쿠 고름을 흔들지 않게).
 */
export const ANSWER_CARD_PICK_INSTRUCTION_V2 = `너는 ClassIn 한국 홈페이지 공개 챗봇의 '답 카드 고르기' 담당이다. 방문자 질문 하나와, 미리 검수해 둔 답 카드 후보가 번호와 함께 주어진다.
규칙:
1. 질문의 핵심 물음에 답하는 카드 번호 하나를 고른다. 세부가 조금 빠져도 핵심에 답하면 고른다. 여러 장이 맞으면 가장 구체적으로 맞는 카드.
2. 어느 카드도 핵심 물음에 답하지 않으면 0. 공개 안내에 없다고 정직하게 알리는 카드(종류 gap 또는 '공개 안내에 없음'을 말하는 카드)가 질문 주제와 맞으면 그 카드를 고른다.
3. 무엇을 묻는지 정말 알 수 없으면 -1.
4. 카드 내용(주제·다루는 것·다루지 않음·답 앞부분) 밖의 지식으로 판단하지 않는다. '다루지 않음'에 질문이 걸리면 그 카드를 고르지 않는다.
5. ${PICK_RULE_VALUE}
6. ${PICK_RULE_SYMPTOM}
7. ${PICK_RULE_CAUTION}
출력은 JSON 한 줄: {"pick": 번호}`

/**
 * 복합 질문 지시문(R2 B3). 질문이 조각(최대 3)으로 나뉘었을 때만 쓴다. 출력은 조각 순서대로 조각 수만큼의 번호 배열.
 */
export const ANSWER_CARD_MULTI_PICK_INSTRUCTION = `너는 ClassIn 한국 홈페이지 공개 챗봇의 '답 카드 고르기' 담당이다. 방문자 질문 하나가 여러 조각(물음)으로 나뉘어 있고, 미리 검수해 둔 답 카드 후보가 번호와 함께 주어진다. 후보 줄 끝의 '← 조각 n'은 그 카드가 어느 조각의 상위 후보인지 알려 준다(다른 조각에 골라도 된다).
규칙:
1. 조각마다 그 조각의 핵심 물음에 답하는 카드 번호 하나를 고른다. 세부가 조금 빠져도 핵심에 답하면 고른다. 여러 장이 맞으면 가장 구체적으로 맞는 카드.
2. 같은 카드는 두 조각을 모두 답할 때만 두 번 쓴다. 한 조각에 맞는 카드를 다른 조각에 억지로 쓰지 않는다.
3. 어느 카드도 그 조각의 핵심 물음에 답하지 않으면 0. 공개 안내에 없다고 정직하게 알리는 카드(종류 gap 또는 '공개 안내에 없음'을 말하는 카드)가 그 조각 주제와 맞으면 그 카드를 고른다.
4. 그 조각이 무엇을 묻는지 정말 알 수 없으면 -1.
5. ${PICK_RULE_VALUE}
6. ${PICK_RULE_SYMPTOM}
7. '답함: [n]'이 붙은 조각은 이미 정해졌다. 그 번호를 그대로 적는다.
8. 카드 내용(주제·다루는 것·다루지 않음·답 앞부분) 밖의 지식으로 판단하지 않는다. '다루지 않음'에 그 조각이 걸리면 그 카드를 고르지 않는다.
9. ${PICK_RULE_CAUTION}
출력은 JSON 한 줄, 조각 순서대로 조각 수만큼: {"picks": [번호, 번호]}`

/** 단일 질문 지시문 판(CHATBOT_ASSIST_PICK_PROMPT): v1(기본, 옛 판) · v2(새 판). */
export type AssistPickPromptVersion = "v1" | "v2"

/** 후보 수 기본값(질문 전체 순위 상위). 설정값 CHATBOT_ASSIST_CANDIDATES 로 바꾼다(assistCandidateCount). */
export const ASSIST_CANDIDATES = 10
/** 후보 수 설정 상한. */
export const ASSIST_CANDIDATES_MAX = 20
/** 복합 질문 조각 글을 모델에 넘기는 최대 길이. */
const ASSIST_MAX_PART_LENGTH = 200
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
  /** picks: 복합 질문 고르기(expect "picks")의 조각별 번호. 그때 pick 은 첫 조각 번호(배열이 비었으면 0). */
  | ({ ok: true; pick: number; picks?: number[]; model: string } & AnswerCardPickOutcomeExtras)
  | ({ ok: false; reason: AnswerCardPickFailure; model: string | null } & AnswerCardPickOutcomeExtras)

/**
 * 모델 호출 함수(lib/chatbot/llm.ts requestAnswerCardPick). instruction 은 지시문, input 은 질문·후보 글.
 * expect 가 "picks" 면 복합 질문 고르기다: 응답 스키마가 {picks: 정수 배열}이고 결과에 picks 가 실린다({"pick": n}이 오면 [n]).
 * 없으면 지금과 같은 단일 고르기({pick: 정수}, 요청 본문도 같다).
 */
export interface AnswerCardPickArgs {
  instruction: string
  input: string
  timeoutMs: number
  expect?: "picks"
}

export type AnswerCardPickRequest = (args: AnswerCardPickArgs) => Promise<AnswerCardPickOutcome>

// ─── 환경변수 ────────────────────────────────────────────────────────────

/** CHATBOT_ANSWER_ASSIST: off(기본) · band · always. 모르는 값은 off. */
export function answerAssistMode(env: Env = process.env): AnswerAssistMode {
  const value = env.CHATBOT_ANSWER_ASSIST?.trim().toLowerCase()
  return value === "band" || value === "always" ? value : "off"
}

/** CHATBOT_ASSIST_PICK_PROMPT: 단일 질문 지시문 판. v2 만 새 판, 그 밖(없음 포함)은 옛 판 v1. */
export function assistPickPromptVersion(env: Env = process.env): AssistPickPromptVersion {
  return env.CHATBOT_ASSIST_PICK_PROMPT?.trim().toLowerCase() === "v2" ? "v2" : "v1"
}

/** CHATBOT_ASSIST_CANDIDATES: 모델에 보일 후보 수(기본 10, 정수 1~20 으로 자름, 모르는 값은 기본). */
export function assistCandidateCount(env: Env = process.env) {
  const raw = env.CHATBOT_ASSIST_CANDIDATES?.trim()
  const value = raw ? Number(raw) : NaN
  if (!Number.isFinite(value) || value < 1) return ASSIST_CANDIDATES
  return Math.min(ASSIST_CANDIDATES_MAX, Math.floor(value))
}

/**
 * band 모드에서 묻는 확신도 대역 [하한, 상한). 기본은 calibration.json assist.band, CHATBOT_ASSIST_BAND_LO·CHATBOT_ASSIST_BAND_HI 가 있으면
 * 그 값(0~1, 하한 < 상한일 때만, 아니면 기본). 색인에 대역이 없으면 null.
 */
export function assistBand(index: CompiledAnswerIndex, env: Env = process.env): [number, number] | null {
  const settings = index.assist
  if (!settings) return null
  const read = (name: string, fallback: number) => {
    const raw = env[name]?.trim()
    const value = raw ? Number(raw) : NaN
    return Number.isFinite(value) && value >= 0 && value <= 1 ? value : fallback
  }
  const lo = read("CHATBOT_ASSIST_BAND_LO", settings.band[0])
  const hi = read("CHATBOT_ASSIST_BAND_HI", settings.band[1])
  return lo < hi ? [lo, hi] : [settings.band[0], settings.band[1]]
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
  /** 질문 전체 순위(analysis.whole.ranked) 안 위치. 복합 질문 후보가 원문 순위에 없으면 -1. */
  at: number
  /** 후보 줄 "[n] …"(복합 질문이면 끝에 " ← 조각 1·2"). */
  line: string
  /** 복합 질문: 이 카드가 상위 후보인 조각 번호(1부터) 또는 답한 조각. 단일 질문이면 없다. */
  parts?: number[]
}

function usableCard(index: CompiledAnswerIndex, card: number, disabled: ReadonlySet<string>) {
  if (card < 0 || card >= index.cards.length) return false
  const compiled = index.cards[card]
  return compiled.kind !== "handoff" && compiled.card.status === "active" && !disabled.has(compiled.id)
}

/**
 * 질문 전체 순위 상위 후보(기본 ASSIST_CANDIDATES 장, CHATBOT_ASSIST_CANDIDATES). none 자리(반례 'none'), 상담 연결 카드, active 가 아니거나 끈
 * (CHATBOT_COMPILED_DISABLED_CARDS) 카드는 뺀다. review·disabled 카드와 nav 표시는 처음부터 색인에 없다.
 */
export function assistCandidates(index: CompiledAnswerIndex, analysis: QuestionAnalysis, env: Env = process.env): AssistCandidate[] {
  const disabled = disabledCardIds(env)
  const limit = assistCandidateCount(env)
  const candidates: AssistCandidate[] = []
  const { ranked } = analysis.whole
  for (let at = 0; at < ranked.length && candidates.length < limit; at += 1) {
    const candidate = ranked[at]
    if (!usableCard(index, candidate.card, disabled)) continue
    const n = candidates.length + 1
    candidates.push({ n, card: candidate.card, id: index.cards[candidate.card].id, at, line: `[${n}] ${cachedBody(index, candidate.card)}` })
  }
  return candidates
}

/** 모델 입력: 방문자 질문(가린 글) + 번호 붙은 후보 줄. 단일 질문 옛 판(v1)은 이 글 그대로다. */
export function buildAnswerCardPickInput(question: string, candidates: readonly Pick<AssistCandidate, "line">[]) {
  const text = collapse(question).slice(0, ASSIST_MAX_QUESTION_LENGTH)
  return `방문자 질문: ${text}\n\n답 카드 후보:\n${candidates.map((candidate) => candidate.line).join("\n")}`
}

/**
 * 조각마다의 후보 몫: 물을 조각이 하나면 전부, 둘이면 반씩(앞 조각이 올림), 셋이면 5:3:2 비율(10 → 5·3·2, 15 → 8·5·2, 20 → 10·6·4).
 */
export function assistPartQuotas(asked: number, total: number): number[] {
  if (asked <= 0) return []
  if (asked === 1) return [total]
  if (asked === 2) return [Math.ceil(total / 2), Math.floor(total / 2)]
  const first = Math.round(total * 0.5)
  const second = Math.round(total * 0.3)
  return [first, second, Math.max(0, total - first - second)]
}

/** 결정형 조각 판정이 이미 답·공백으로 정했는지(모델이 덮어쓰지 않는 조각). */
function segmentDecided(segment: AnswerIndexSegmentDecision | undefined) {
  return Boolean(segment && segment.card && (segment.kind === "answer" || segment.kind === "gap"))
}

/** 복합 질문으로 고를 수 있는 판정인지: 나눈 조각 분석이 있고 결정에 조각 기록이 조각 수만큼 있다. */
function multiSegments(analysis: QuestionAnalysis, decision: AnswerIndexDecision): AnswerIndexSegmentDecision[] | null {
  const parts = analysis.parts
  if (!parts || parts.length < 2 || !decision.segments || decision.segments.length < parts.length) return null
  return decision.segments.slice(0, parts.length)
}

export interface AssistPartCandidates {
  candidates: AssistCandidate[]
  /** 모델에 물을 조각(0부터, 결정형이 답하지 않은 조각). */
  asked: number[]
}

/**
 * 복합 질문 후보(계획 §2.2): 조각 순서대로, 결정형이 답한 조각은 그 카드 한 장(답함 표시용), 물을 조각은 그 조각 순위 상위에서 몫만큼
 * (assistPartQuotas, 전체 몫은 CHATBOT_ASSIST_CANDIDATES). 같은 카드는 한 줄로 합치고 꼬리표에 조각 번호를 모은다("← 조각 1·2").
 */
export function assistPartCandidates(
  index: CompiledAnswerIndex,
  analysis: QuestionAnalysis,
  segments: readonly AnswerIndexSegmentDecision[],
  env: Env = process.env
): AssistPartCandidates {
  const parts = analysis.parts ?? []
  const disabled = disabledCardIds(env)
  const asked = parts.map((_, at) => at).filter((at) => !segmentDecided(segments[at]))
  const quotas = assistPartQuotas(asked.length, assistCandidateCount(env))
  const byCard = new Map<number, { card: number; parts: number[] }>()
  const order: number[] = []
  const add = (card: number, part: number) => {
    const existing = byCard.get(card)
    if (existing) {
      if (!existing.parts.includes(part)) existing.parts.push(part)
      return
    }
    byCard.set(card, { card, parts: [part] })
    order.push(card)
  }
  parts.forEach((part, at) => {
    const segment = segments[at]
    if (segmentDecided(segment)) {
      const card = index.cardById.get(segment.card!)
      if (card !== undefined) add(card, at + 1)
      return
    }
    const quota = quotas[asked.indexOf(at)] ?? 0
    let taken = 0
    for (let rank = 0; rank < part.ranked.length && taken < quota; rank += 1) {
      const card = part.ranked[rank].card
      if (!usableCard(index, card, disabled)) continue
      add(card, at + 1)
      taken += 1
    }
  })
  const wholeAt = new Map<number, number>()
  analysis.whole.ranked.forEach((candidate, at) => {
    if (candidate.card >= 0 && !wholeAt.has(candidate.card)) wholeAt.set(candidate.card, at)
  })
  const candidates = order.map((card, at): AssistCandidate => {
    const entry = byCard.get(card)!
    const n = at + 1
    const tag = entry.parts.slice().sort((a, b) => a - b).join("·")
    return { n, card, id: index.cards[card].id, at: wholeAt.get(card) ?? -1, line: `[${n}] ${cachedBody(index, card)} ← 조각 ${tag}`, parts: entry.parts }
  })
  return { candidates, asked }
}

/** 상황 절 끝(…는데·…지만·…니까): 이 끝으로 닫힌 절은 묻는 절이 아니라 배경이다("베타로 쓰는 중인데, API 연동 되나요?"). */
const SITUATION_CLAUSE_END_RE = /(?:는데|은데|인데|던데|지만|니까)(?:요)?(?=[\s,，.。]|$)/g

/** 없는 개념 형태가 상황 절(마지막 절 앞, 상황 끝으로 닫힌 절) 안에만 있는지. 쉼표만으로 이은 나열은 상황 절로 보지 않는다. */
function inSituationClause(text: string, match: AbsentMatch) {
  const form = normalizeText(match.form).replace(/\s+/g, "")
  if (!form) return false
  const clauses: string[] = []
  let last = 0
  for (const found of text.matchAll(SITUATION_CLAUSE_END_RE)) {
    const end = (found.index ?? 0) + found[0].length
    clauses.push(text.slice(last, end))
    last = end
  }
  if (clauses.length === 0) return false
  const tail = text.slice(last)
  const compact = (value: string) => normalizeText(value).replace(/\s+/g, "")
  // 상황 끝 뒤에 묻는 절이 없으면("베타 신청하려는데") 그 절이 곧 묻는 절이다.
  if (compact(tail).replace(/[?？!.。,，]/g, "").length < 2) return false
  return clauses.some((clause) => compact(clause).includes(form)) && !compact(tail).includes(form)
}

/**
 * 받아들이는 규칙에서 막는 없는 개념(R2 B3): B2 가 묻는 대상으로 본 맞춤(absentTargets target) 가운데 상황 절에만 있는 것은 뺀다.
 * 뺀 것은 주의 표시로만 남는다(결정형 판정 cautions). 결정형 판정 자체(공백 답)는 바꾸지 않는다.
 */
function targetAbsent(analysis: Pick<SegmentAnalysis, "absentTargets" | "text">): AbsentMatch[] {
  return analysis.absentTargets.filter((item) => item.target && !inSituationClause(analysis.text, item.match)).map((item) => item.match)
}

/**
 * 주의 줄(단일 새 판·복합 입력): 묻는 대상인 없는 개념 "'<형태>'는 공개 안내에 없음", 정책 주제면 그 줄. 없으면 빈 배열.
 * 단일 질문 옛 판(v1)에는 넣지 않는다.
 */
export function assistCautionLines(absent: readonly AbsentMatch[], policyTopic: boolean): string[] {
  const lines: string[] = []
  const seen = new Set<string>()
  for (const match of absent) {
    const form = field(match.form)
    if (seen.has(form)) continue
    seen.add(form)
    lines.push(`주의: '${form}'은(는) 공개 안내에 없음`)
  }
  if (policyTopic) lines.push("주의: 정책 주제(요금·계약·체험·인원 한도 등)가 섞여 있음")
  return lines
}

/** 단일 질문 새 판(v2) 입력: 옛 판 입력에 주의 줄을 질문과 후보 사이에 넣는다(주의가 없으면 옛 판과 같은 글). */
export function buildAnswerCardPickInputV2(question: string, candidates: readonly Pick<AssistCandidate, "line">[], cautions: readonly string[]) {
  const text = collapse(question).slice(0, ASSIST_MAX_QUESTION_LENGTH)
  const caution = cautions.length > 0 ? `${cautions.join("\n")}\n\n` : ""
  return `방문자 질문: ${text}\n\n${caution}답 카드 후보:\n${candidates.map((candidate) => candidate.line).join("\n")}`
}

/**
 * 복합 질문 입력: 방문자 질문, 조각 목록("(n) 조각 글", 결정형이 답한 조각은 " — 답함: [번호]"), 주의 줄, 꼬리표 붙은 후보 줄.
 */
export function buildAnswerCardMultiPickInput(
  question: string,
  parts: readonly { text: string; answered: number | null }[],
  candidates: readonly Pick<AssistCandidate, "line">[],
  cautions: readonly string[]
) {
  const text = collapse(question).slice(0, ASSIST_MAX_QUESTION_LENGTH)
  const list = parts
    .map((part, at) => `(${at + 1}) ${collapse(part.text).slice(0, ASSIST_MAX_PART_LENGTH)}${part.answered !== null ? ` — 답함: [${part.answered}]` : ""}`)
    .join("\n")
  const caution = cautions.length > 0 ? `${cautions.join("\n")}\n\n` : ""
  return `방문자 질문: ${text}\n\n조각:\n${list}\n\n${caution}답 카드 후보:\n${candidates.map((candidate) => candidate.line).join("\n")}`
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

/**
 * 모델에 묻지 않는 이유(null 이면 묻는다). 복합 질문(analysis 를 주고 조각 기록이 있을 때)은 모든 조각을 결정형이 답했으면 묻지 않고
 * (segments_decided, always 에서도), band 에서는 못 정한 조각 가운데 하나라도 확신도가 대역 하한 이상이면 묻는다.
 * 정책 카드 답도 묻는다(R2 B3: 받아들이는 것은 '고르지 않음(0)'뿐 — resolveAssistPick).
 */
export function assistSkipReason(
  mode: Exclude<AnswerAssistMode, "off">,
  index: CompiledAnswerIndex,
  decision: AnswerIndexDecision,
  analysis?: QuestionAnalysis,
  env: Env = process.env
): string | null {
  const segments = analysis ? multiSegments(analysis, decision) : null
  if (segments && segments.every(segmentDecided)) return "segments_decided"
  if (mode === "always") return null
  const settings = index.assist
  if (!settings?.enabled) return "calibration_disabled"
  const [lo, hi] = assistBand(index, env) ?? settings.band
  if (segments) {
    return segments.some((segment) => !segmentDecided(segment) && segment.conf >= lo && segment.conf < hi) ? null : "out_of_band"
  }
  if (decision.kind === "gap") return "gap"
  if (decision.absentHit) return "absent"
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
function checkPicked(index: CompiledAnswerIndex, segment: SegmentAnalysis, votes: readonly string[], at: number, env: Env): CandidateCheck {
  const ranked = segment.ranked[at]
  if (ranked.check) return ranked.check
  const query = segment.query
  const scored = scoreCandidates(index, query, votes, { disabled: disabledCardIds(env) })
  return checkCandidate(index, query, ranked.card, {
    negatives: scoreNegatives(index, query),
    maxVariantCos: scored.maxVariantCos,
    centroidCos: scored.centroidCos,
  })
}

const policyConceptCache = new WeakMap<CompiledAnswerIndex, ReadonlySet<string>>()

/**
 * 정책 개념: 정책 카드(종류 policy — 사람이 공개 범위를 정한 답)에 사람이 적은 개념(card.concepts) 가운데 사전에 있고 일반 개념이 아닌 것.
 * 주제·다루는 것 글에서 찾은 개념(ownConcepts)은 넣지 않는다(회원가입·채팅·인증코드처럼 정책 답 글에 곁들여 나온 개념까지 정책 개념이 된다).
 * 색인마다 한 번 만든다.
 */
export function policyConcepts(index: CompiledAnswerIndex): ReadonlySet<string> {
  let set = policyConceptCache.get(index)
  if (!set) {
    const out = new Set<string>()
    for (const compiled of index.cards) {
      if (compiled.kind !== "policy") continue
      const declared = compiled.card.concepts ?? compiled.ownConcepts
      for (const id of declared) {
        const known = index.lexicon.concepts.get(id)
        if (known && !known.generic) out.add(id)
      }
    }
    set = out
    policyConceptCache.set(index, set)
  }
  return set
}

/** 질문(조각)의 정책 개념: 맞은 개념과 그 상위 개념 가운데 정책 개념. */
export function askedPolicyConcepts(index: CompiledAnswerIndex, query: Pick<IndexQuery, "concepts">): string[] {
  const policy = policyConcepts(index)
  const out = new Set<string>()
  for (const concept of query.concepts) {
    if (policy.has(concept.id)) out.add(concept.id)
    for (const ancestor of index.lexicon.concepts.get(concept.id)?.ancestors ?? []) if (policy.has(ancestor)) out.add(ancestor)
  }
  return Array.from(out)
}

/**
 * 정책 주제 거절(R2 B3, 계획 §3 정책 주제 (3)): 질문이 정책 주제(isPolicyTopic)이고, 고른 카드가 정책 카드·공백 카드·허용 표시
 * (policyTopicAllowed) 카드가 아니며, 고른 카드의 개념(상위 포함)이 질문의 정책 개념과 겹칠 때만 막는다. 정규식만 걸리고 겹치지 않으면
 * ('원가'⊂'회원가입' 같은 부분 글자 오탐, 정책 값을 묻지 않는 사용법 질문) 받아들이고 주의 표시를 남긴다.
 */
export function policyTopicBlocks(
  index: CompiledAnswerIndex,
  query: Pick<IndexQuery, "concepts">,
  compiled: CompiledCard,
  isPolicyTopic?: () => boolean
): boolean {
  if (isPolicyGovernedCard(compiled.card) || compiled.kind === "gap" || compiled.card.policyTopicAllowed === true) return false
  if (!isPolicyTopic?.()) return false
  return askedPolicyConcepts(index, query).some((id) => compiled.conceptClosure.has(id))
}

/** 받아들인 판정에 붙일 주의 표시: 결정형의 것 + 정책 주제(정규식이 걸렸는데 받아들였을 때). */
function withCautions(decision: AnswerIndexDecision, base: AnswerIndexDecision, policyTopic: boolean): AnswerIndexDecision {
  const cautions: AnswerIndexCaution[] = [...(base.cautions ?? [])]
  if (policyTopic && !cautions.some((caution) => caution.kind === "policy_topic")) {
    cautions.push({ kind: "policy_topic", id: null, form: null, target: false, reason: "no_concept_overlap" })
  }
  return cautions.length > 0 ? { ...decision, cautions } : decision
}

function baseDecision(analysis: QuestionAnalysis): Pick<AnswerIndexDecision, "askType" | "top" | "segments" | "absentTail" | "partial" | "rescue"> {
  return { askType: analysis.whole.query.askType, top: analysis.whole.top, segments: null, absentTail: null, partial: false, rescue: null }
}

/** 카드를 고를 수 있는지(색인에 있고 그 자리 카드가 같고 상담 연결·꺼진 카드가 아님). */
function pickedCardUsable(index: CompiledAnswerIndex, candidate: Pick<AssistCandidate, "card" | "id">, env: Env): CompiledCard | null {
  const compiled = candidate.card >= 0 && candidate.card < index.cards.length ? index.cards[candidate.card] : undefined
  if (!compiled || compiled.id !== candidate.id || compiled.kind === "handoff" || compiled.card.status !== "active" || disabledCardIds(env).has(compiled.id)) return null
  return compiled
}

/**
 * 모델이 고른 번호 → 최종 판정(단일 질문). 받아들이지 않으면 결정형 판정 그대로(accepted=false, rejectReason).
 * candidates 는 모델에 보인 후보(assistCandidates)다.
 * R2 B3: 정책 카드 답에도 0 은 받아들인다. 정책 주제는 개념이 겹칠 때만(policyTopicBlocks), 없는 개념은 묻는 대상일 때만 막는다.
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
  const targets = targetAbsent(whole)

  if (pick === -1) {
    if (decision.kind === "clarify") return follow(decision)
    if (policyAnswer) return keep("policy_card")
    if (targets.length > 0) return keep("absent")
    return follow(
      withCautions(
        { ...baseDecision(analysis), kind: "clarify", card: null, conf: decision.conf, unexplained: [], absentHit: null, features: whole.features, abstainReason: null },
        decision,
        false
      )
    )
  }

  if (pick === 0) {
    if (decision.kind === "abstain" || decision.kind === "clarify" || decision.kind === "gap") return follow(decision)
    // 정책 카드 답도 '고르지 않음'은 받아들인다(못 찾음 갈래로 — 다른 카드로 바꾸지는 않는다).
    if (whole.absentMatch && whole.absentGapCard !== null && !policyAnswer) {
      return follow(
        withCautions(
          {
            ...baseDecision(analysis),
            kind: "gap",
            card: index.cards[whole.absentGapCard].id,
            conf: decision.conf,
            unexplained: [],
            absentHit: whole.absentMatch.id,
            features: whole.features,
            abstainReason: null,
          },
          decision,
          false
        )
      )
    }
    return follow(
      withCautions(
        {
          ...baseDecision(analysis),
          kind: whole.fallback.kind,
          card: null,
          conf: decision.conf,
          unexplained: [],
          absentHit: null,
          features: whole.features,
          abstainReason: whole.fallback.kind === "abstain" ? (whole.fallback.abstainReason ?? "nodoc") : null,
        },
        decision,
        false
      )
    )
  }

  const candidate = candidates[pick - 1]
  const pickCard = candidate.id
  if ((decision.kind === "answer" || decision.kind === "gap") && decision.card === candidate.id) return follow(decision, pickCard)
  if (policyAnswer) return keep("policy_card", pickCard)
  if (!analysis.inScope) return keep("scope", pickCard)
  const at = candidate.at
  const ranked = whole.ranked[at]
  const compiled = pickedCardUsable(index, candidate, env)
  if (!compiled || !ranked || ranked.card !== candidate.card) return keep("card_unavailable", pickCard)
  // NODOC: 결정형이 '문서에 없음' 신호로 답하지 않은 질문을 그 아래 카드로 바꾸지 않는다(정해 둔 답 승격과 같은 신호). 공백 카드도
  // 막는다: 이 신호가 있을 때 1번 공백 카드는 질문과 다른 주제일 수 있고(예: '클래스인 무료로 써도 돼?'의 1번이 스타일러스 공백 카드),
  // 이 경우의 고름은 잰 적이 없다.
  if (decision.kind !== "answer" && hasNoDocSignal(whole)) return keep("nodoc", pickCard)
  const policyHit = !isPolicyGovernedCard(compiled.card) && compiled.kind !== "gap" && Boolean(options.isPolicyTopic?.())
  if (policyHit && policyTopicBlocks(index, whole.query, compiled, () => true)) return keep("policy_topic", pickCard)
  const check = checkPicked(index, whole, analysis.votes, at, env)
  if (check.rejected) return keep("negative", pickCard)
  // 없는 개념: 묻는 대상인 자리를 고른 카드가 덮지 않으면(그 개념의 공백 카드가 아니면) 막는다. 수식어·비교·제외·상황 자리는 주의 표시만.
  const uncovered = targets.filter((match) => !absentCoveredBy(index, whole.query, match, candidate.card))
  if (uncovered.some((match) => index.absent.byId.get(match.id)?.gapCard !== compiled.id)) return keep("absent", pickCard)
  return follow(
    withCautions(
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
      decision,
      policyHit
    ),
    pickCard
  )
}

// ─── 복합 질문 받아들이기 ────────────────────────────────────────────────

/** 조각 하나의 고름 결과. */
export interface AssistPartResolution extends AnswerIndexAssistPartTrace {
  /** 이 조각의 최종 기록(받아들이지 않으면 결정형 그대로). */
  segment: AnswerIndexSegmentDecision
}

export interface AssistPicksResolution extends AssistPickResolution {
  parts: AssistPartResolution[]
}

/** 조각 하나에 고른 번호 적용(조각 분석 기준). 결정형이 답한 조각은 부르지 않는다. */
function resolvePart(
  index: CompiledAnswerIndex,
  analysis: QuestionAnalysis,
  partAt: number,
  segment: AnswerIndexSegmentDecision,
  candidates: readonly Pick<AssistCandidate, "card" | "id">[],
  pick: number,
  options: ResolveAssistOptions,
  env: Env
): AssistPartResolution {
  const part = analysis.parts![partAt]
  const keep = (rejectReason: string, pickCard: string | null = null): AssistPartResolution => ({ asked: true, pick, pickCard, accepted: false, rejectReason, segment })
  const follow = (next: AnswerIndexSegmentDecision, pickCard: string | null = null): AssistPartResolution => ({ asked: true, pick, pickCard, accepted: true, rejectReason: null, segment: next })
  if (!Number.isInteger(pick) || pick < -1 || pick > candidates.length) return keep("out_of_range")
  const targets = targetAbsent(part)
  const base: AnswerIndexSegmentDecision = { text: segment.text, kind: segment.kind, card: null, conf: segment.conf, by: "assist" }
  if (segment.scoringText) base.scoringText = segment.scoringText

  if (pick === -1) {
    if (targets.length > 0) return keep("absent")
    return follow({ ...base, kind: "clarify" })
  }
  if (pick === 0) {
    if (part.absentMatch && part.absentGapCard !== null) {
      return follow({ ...base, kind: "gap", card: index.cards[part.absentGapCard].id, absentHit: part.absentMatch.id })
    }
    return follow({ ...base, kind: part.fallback.kind, by: "none" })
  }

  const candidate = candidates[pick - 1]
  const pickCard = candidate.id
  if (!analysis.inScope) return keep("scope", pickCard)
  const compiled = pickedCardUsable(index, candidate, env)
  if (!compiled) return keep("card_unavailable", pickCard)
  // 고른 카드가 이 조각 순위에 없으면(다른 조각의 후보를 이 조각에 붙임) 이 조각 확신도·검사를 낼 수 없다.
  const at = part.ranked.findIndex((ranked) => ranked.card === candidate.card)
  if (at < 0) return keep("segment_rank", pickCard)
  if (hasNoDocSignal(part)) return keep("nodoc", pickCard)
  if (policyTopicBlocks(index, part.query, compiled, options.isPolicyTopic)) return keep("policy_topic", pickCard)
  const check = checkPicked(index, part, analysis.partVotes[partAt] ?? [], at, env)
  if (check.rejected) return keep("negative", pickCard)
  const uncovered = targets.filter((match) => !absentCoveredBy(index, part.query, match, candidate.card))
  if (uncovered.some((match) => index.absent.byId.get(match.id)?.gapCard !== compiled.id)) return keep("absent", pickCard)
  return follow(
    {
      ...base,
      kind: compiled.kind === "gap" ? "gap" : "answer",
      card: compiled.id,
      conf: part.confs[at] ?? 0,
      ...(uncovered[0] ? { absentHit: uncovered[0].id } : {}),
    },
    pickCard
  )
}

/** 조각 기록이 바뀐 판정을 다시 잇는다(질문 순서, 결정 카드는 처음 정한 조각의 카드). */
function recombine(decision: AnswerIndexDecision, segments: AnswerIndexSegmentDecision[], changed: boolean): AnswerIndexDecision {
  if (!changed) return decision
  const decided = segments.filter((segment) => segment.card && (segment.kind === "answer" || segment.kind === "gap"))
  if (decided.length === 0) return { ...decision, segments }
  const primary = decided[0]
  const anyAnswer = decided.some((segment) => segment.kind === "answer")
  const sameCard = primary.card === decision.card && (decision.kind === "answer" || decision.kind === "gap")
  const kind = anyAnswer ? "answer" : "gap"
  return {
    ...decision,
    kind,
    card: primary.card,
    conf: Math.min(...decided.map((segment) => segment.conf)),
    segments,
    abstainReason: null,
    partial: kind === "answer" ? Boolean(decision.absentTail) || segments.some((segment) => segment.kind !== "answer") : false,
    rescue: sameCard ? (decision.rescue ?? null) : null,
  }
}

/**
 * 복합 질문의 조각별 번호 → 최종 판정. 결정형이 답한 조각은 그대로(index_kept), 번호가 없는 조각도 그대로(missing). 물은 조각마다
 * 단일 질문과 같은 규칙을 그 조각 분석으로 적용한다(범위 밖·관문·쓸 수 없는 카드·조각 순위 밖·NODOC·정책 주제 겹침·반례·묻는 대상인
 * 없는 개념). 넘친 조각(overflow)은 손대지 않는다. accepted 는 하나라도 따랐는지, rejectReason 은 아무것도 따르지 않았을 때 첫 물은 조각의 까닭.
 */
export function resolveAssistPicks(
  index: CompiledAnswerIndex,
  analysis: QuestionAnalysis,
  decision: AnswerIndexDecision,
  candidates: readonly Pick<AssistCandidate, "card" | "id" | "at">[],
  picks: readonly number[],
  options: ResolveAssistOptions = {}
): AssistPicksResolution {
  const env = options.env ?? process.env
  const segments = multiSegments(analysis, decision)
  if (!segments) {
    const single = resolveAssistPick(index, analysis, decision, candidates, picks[0] ?? Number.NaN, options)
    return { ...single, parts: [] }
  }
  const parts = segments.map((segment, at): AssistPartResolution => {
    const pick = at < picks.length ? picks[at] : null
    if (segmentDecided(segment)) {
      const pickCard = pick !== null && pick >= 1 && pick <= candidates.length ? candidates[pick - 1].id : null
      return { asked: false, pick, pickCard, accepted: false, rejectReason: "index_kept", segment }
    }
    if (pick === null) return { asked: true, pick: null, pickCard: null, accepted: false, rejectReason: "missing", segment }
    return resolvePart(index, analysis, at, segment, candidates, pick, options, env)
  })
  const nextSegments = [...parts.map((part) => part.segment), ...(decision.segments ?? []).slice(segments.length)]
  const changed = parts.some((part) => part.accepted)
  const next = recombine(decision, nextSegments, changed)
  const asked = parts.filter((part) => part.asked)
  const accepted = asked.some((part) => part.accepted)
  const policyHit = accepted && Boolean(options.isPolicyTopic?.())
  return {
    decision: changed ? withCautions(next, decision, policyHit) : decision,
    accepted,
    rejectReason: accepted ? null : (asked[0]?.rejectReason ?? "index_kept"),
    pickCard: parts.find((part) => part.accepted)?.pickCard ?? null,
    parts,
  }
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

async function requestWithDeadline(request: AnswerCardPickRequest, args: AnswerCardPickArgs): Promise<AnswerCardPickOutcome> {
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

/** 한 질문의 고르기 준비: 지시문 판·후보·요청·번호 해석. */
interface PickPlan {
  prompt: "v1" | "v2" | "multi"
  candidates: AssistCandidate[]
  /** 후보 수 설정이 기본(ASSIST_CANDIDATES)과 다른지. */
  countSet: boolean
  args: AnswerCardPickArgs
  resolve: (outcome: Extract<AnswerCardPickOutcome, { ok: true }>) => AssistPicksResolution
  /** 흔적에 남길 조각별 번호(복합 질문). */
  picksOf: (outcome: Extract<AnswerCardPickOutcome, { ok: true }>) => number[] | undefined
}

function planPick(input: AnswerAssistInput, env: Env, timeoutMs: number): PickPlan {
  const { index, analysis, decision } = input
  const resolveOptions = { isPolicyTopic: input.isPolicyTopic, env }
  const segments = multiSegments(analysis, decision)
  if (segments) {
    const { candidates } = assistPartCandidates(index, analysis, segments, env)
    const numberOf = new Map(candidates.map((candidate) => [candidate.id, candidate.n]))
    const parts = analysis.parts!.map((part, at) => ({
      text: part.text,
      answered: segmentDecided(segments[at]) ? (numberOf.get(segments[at].card!) ?? null) : null,
    }))
    const absent = analysis.parts!.flatMap((part) => targetAbsent(part))
    const cautions = assistCautionLines(absent, Boolean(input.isPolicyTopic?.()))
    const picksOf = (outcome: Extract<AnswerCardPickOutcome, { ok: true }>) => outcome.picks ?? [outcome.pick]
    return {
      prompt: "multi",
      candidates,
      countSet: assistCandidateCount(env) !== ASSIST_CANDIDATES,
      args: {
        instruction: ANSWER_CARD_MULTI_PICK_INSTRUCTION,
        input: buildAnswerCardMultiPickInput(input.question, parts, candidates, cautions),
        timeoutMs,
        expect: "picks",
      },
      resolve: (outcome) => resolveAssistPicks(index, analysis, decision, candidates, picksOf(outcome), resolveOptions),
      picksOf,
    }
  }
  const candidates = assistCandidates(index, analysis, env)
  const version = assistPickPromptVersion(env)
  const instruction = version === "v2" ? ANSWER_CARD_PICK_INSTRUCTION_V2 : ANSWER_CARD_PICK_INSTRUCTION
  const pickInput =
    version === "v2"
      ? buildAnswerCardPickInputV2(input.question, candidates, assistCautionLines(targetAbsent(analysis.whole), Boolean(input.isPolicyTopic?.())))
      : buildAnswerCardPickInput(input.question, candidates)
  return {
    prompt: version,
    candidates,
    countSet: assistCandidateCount(env) !== ASSIST_CANDIDATES,
    // 옛 판(v1) 요청은 B3 전과 같은 칸만 넘긴다(요청 본문 바이트 고정).
    args: { instruction, input: pickInput, timeoutMs },
    resolve: (outcome) => ({ ...resolveAssistPick(index, analysis, decision, candidates, outcome.pick, resolveOptions), parts: [] }),
    picksOf: () => undefined,
  }
}

/** 흔적 칸: 지시문 판·후보 수(옛 판 단일 질문·기본 후보 수면 비워 흔적이 B3 전과 같다), 복합 질문의 조각별 번호·결과. */
function planTraceFields(plan: PickPlan, picks?: number[], parts?: AssistPartResolution[]): Partial<AnswerIndexAssistTrace> {
  const fields: Partial<AnswerIndexAssistTrace> = {}
  if (plan.prompt !== "v1") fields.prompt = plan.prompt
  if (plan.prompt === "multi" || plan.countSet) fields.candidates = plan.candidates.length
  if (picks) fields.picks = [...picks]
  if (parts && parts.length > 0) {
    fields.parts = parts.map((part) => ({ asked: part.asked, pick: part.pick, pickCard: part.pickCard, accepted: part.accepted, rejectReason: part.rejectReason }))
  }
  return fields
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

  const skip = assistSkipReason(mode, input.index, decision, input.analysis, env)
  if (skip) {
    if (skip === "calibration_disabled" && !warnedCalibrationDisabled) {
      warnedCalibrationDisabled = true
      console.warn("[chatbot] CHATBOT_ANSWER_ASSIST=band 이지만 calibration.json assist.enabled 가 false 라 모델 선택 층을 쓰지 않습니다.")
    }
    return { decision, trace: trace({ rejectReason: skip }), modelFailure: null }
  }
  const plan = planPick(input, env, input.timeoutMs ?? assistTimeoutMs(env))
  const candidates = plan.candidates
  if (candidates.length === 0) return { decision, trace: trace({ rejectReason: "no_candidates", ...planTraceFields(plan) }), modelFailure: null }

  const pickArgs = plan.args
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
      trace: trace(withUsage({ used: true, model: outcome.model, ms, rejectReason: outcome.reason, ...extras, ...planTraceFields(plan) })),
      // 하루 상한으로 부르지 않은 것은 실패가 아니다(Gemini 고르기가 따로 실패한 경우는 그 이유가 reason 이다).
      modelFailure: outcome.reason === "budget" ? null : outcome.reason,
    }
  }
  const resolved = plan.resolve(outcome)
  const firstPicks = plan.picksOf(outcome)
  const firstFields: Partial<AnswerIndexAssistTrace> = {
    used: true,
    pick: outcome.pick,
    pickCard: resolved.pickCard,
    model: outcome.model,
    ms,
    accepted: resolved.accepted,
    rejectReason: resolved.rejectReason,
    ...extras,
    ...planTraceFields(plan, firstPicks, resolved.parts),
  }

  const trigger = input.escalate
    ? escalationTrigger(input.index, input.analysis, decision, candidates, outcome.pick, input.escalateSignals)
    : null
  if (!input.escalate || !trigger) {
    return { decision: resolved.decision, trace: trace(withUsage(firstFields)), modelFailure: null }
  }

  // ③ 올림: 같은 지시문·입력으로 한 번 더. 결과가 최종(받아들이는 규칙 같음). 실패하면 결정형 판정 그대로.
  const first = {
    provider: outcome.provider ?? null,
    model: outcome.model,
    pick: outcome.pick,
    pickCard: resolved.pickCard,
    ...(firstPicks ? { picks: [...firstPicks] } : {}),
  }
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
  const final = plan.resolve(esc)
  const escPicks = plan.picksOf(esc)
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
        ...planTraceFields(plan, escPicks, final.parts),
        escalation: escalation({ model: esc.model, pick: esc.pick, ms: escMs, ...(escPicks ? { picks: [...escPicks] } : {}) }),
      })
    ),
    modelFailure: null,
  }
}
