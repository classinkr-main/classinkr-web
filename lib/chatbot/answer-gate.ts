/**
 * 정해 둔 답 확인 관문.
 *
 * 공개 챗봇은 정규식이 맞으면 정해 둔 답(필드·기본 사실 답, 증상 안내, CS 운영 가이드, 분류별·제목 틀 답,
 * 약한 신호로 걸린 상담 연결·쇼룸 안내)을 모델 없이 바로 내보냈다. 정규식은 질문의 낱말만 보므로 "수업 방에
 * 비밀번호 걸 수 있어요?"에 로그인 비밀번호 재설정 안내가 나가는 식으로 다른 질문을 가로챘다.
 * 이 관문은 정규식을 후보 고르기에만 쓰고, 그 답이 정말 이 질문에 대한 답인지 모델이 한 번 판정한 뒤 내보낸다.
 * 모델은 판정만 하고 글을 쓰지 않는다(나가는 글은 사람이 쓴 답이나 문서 문장 그대로).
 *
 * - 스위치: CHATBOT_ANSWER_GATE=off 로 끈다(기본 on). CHATBOT_FINAL_ANSWER_LLM=off 이거나 GEMINI_API_KEY 가 없어도 건너뛴다.
 * - 실패에 안전: 호출 실패·시간 초과·형식 오류면 기존 답을 그대로 둔다(skipped).
 * - 같은 (질문, 답) 판정은 프로세스 메모리에 잠깐 둔다. 답 캐시(service.ts 의 answer cache)와는 키 공간이 따로다.
 *
 * 2026-11-18 측정(정적 문서 경로, 판정만 따로 돌림). 기준 묶음(기존 평가셋 1,770문항 중 정해 둔 답 1,693쌍)에서 버린 비율과
 * 지난 라운드에서 확인된 가로채기 24건 중 버린 비율:
 *   - 판정만 쓰게 한 프롬프트(lite): 버림 1.06% / 잡음 66.7%
 *   - asked·quote 를 먼저 쓰게 한 현재 프롬프트(lite, 기본): 버림 1.30% / 잡음 75.0%, 판정 시간 중앙값 0.9초·95번째 1.3초
 *   - 같은 프롬프트를 gemini-3.5-flash 로(CHATBOT_ANSWER_GATE_MODEL): 버림 1.59% / 잡음 83.3%, 중앙값 1.3초·95번째 1.6초
 */

import { judgePreparedAnswerFit, type PreparedAnswerVerdict } from "./llm"

/** 관문 결과. none=관문 대상이 아님, kept=판정 후 유지, rejected=버리고 문서 경로로, skipped=꺼짐·실패로 판정 없이 유지. */
export type AnswerGateOutcome = "kept" | "rejected" | "skipped" | "none"

export interface AnswerGateTrace {
  gate: AnswerGateOutcome
  /** 판정 대상이던 정해 둔 답의 출처(예: field:logo-usage, basics:basics-company-ceo, symptom, template:pricing). */
  gateOriginal?: string
  /** 관문 판정에 쓴 시간(ms). 캐시 적중이면 0에 가깝다. */
  gateMs?: number
  /** skipped 의 이유(off·no_key·llm_off·error·timeout). */
  skipReason?: string
}

// 판정 한 번의 예산. 2026-11-18 실측 95번째 값이 lite 1.3초·3.5-flash 1.6초라, 첫 모델이 실패해도 다음 모델을 한 번 시도할 수 있게
// 3초로 둔다. 시간 안에 판정이 안 나면 기존 답을 유지한다.
export const ANSWER_GATE_TIMEOUT_MS = 3_000

// 프롬프트를 바꾸면 버전을 올려 이전 판정 캐시를 쓰지 않게 한다.
const ANSWER_GATE_CACHE_VERSION = "gate-20261118-v4"
const ANSWER_GATE_CACHE_TTL_MS = 10 * 60 * 1000
const ANSWER_GATE_CACHE_MAX = 500

const verdictCache = new Map<string, { verdict: PreparedAnswerVerdict; expiresAt: number }>()

function getCacheKey(question: string, answer: string) {
  return `${ANSWER_GATE_CACHE_VERSION}\u0000${question}\u0000${answer}`
}

function readCachedVerdict(key: string): PreparedAnswerVerdict | null {
  const entry = verdictCache.get(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    verdictCache.delete(key)
    return null
  }
  return entry.verdict
}

function writeCachedVerdict(key: string, verdict: PreparedAnswerVerdict) {
  verdictCache.set(key, { verdict, expiresAt: Date.now() + ANSWER_GATE_CACHE_TTL_MS })
  while (verdictCache.size > ANSWER_GATE_CACHE_MAX) {
    const oldest = verdictCache.keys().next().value
    if (oldest === undefined) break
    verdictCache.delete(oldest)
  }
}

/** 테스트 전용: 판정 캐시를 비운다. */
export function __clearAnswerGateCacheForTests() {
  verdictCache.clear()
}

/** 관문을 돌릴 수 없는 이유. 돌릴 수 있으면 null. */
export function getAnswerGateDisabledReason(): string | null {
  if (process.env.CHATBOT_ANSWER_GATE?.trim().toLowerCase() === "off") return "off"
  if (process.env.CHATBOT_FINAL_ANSWER_LLM?.trim().toLowerCase() === "off") return "llm_off"
  if (!process.env.GEMINI_API_KEY?.trim()) return "no_key"
  return null
}

function getAnswerGateTimeoutMs() {
  const value = Number(process.env.CHATBOT_ANSWER_GATE_TIMEOUT_MS)
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : ANSWER_GATE_TIMEOUT_MS
}

/**
 * 정해 둔 답이 질문에 대한 답인지 확인한다.
 * kept(유지)·rejected(버림)·skipped(판정 없이 유지) 중 하나를 돌려준다. 이 함수는 예외를 던지지 않는다.
 */
export async function checkPreparedAnswer({
  question,
  answer,
  original,
  timeoutMs: budgetMs,
}: {
  /** PII 가 제거된 질문 */
  question: string
  answer: string
  original: string
  /** 판정 예산(ms). 비우면 CHATBOT_ANSWER_GATE_TIMEOUT_MS(기본 3000)를 쓴다. 남은 요청 시간이 짧은 호출부가 줄여 준다. */
  timeoutMs?: number
}): Promise<AnswerGateTrace> {
  const disabled = getAnswerGateDisabledReason()
  if (disabled) return { gate: "skipped", gateOriginal: original, gateMs: 0, skipReason: disabled }

  const startedAt = Date.now()
  const key = getCacheKey(question, answer)
  const cached = readCachedVerdict(key)
  if (cached) {
    return { gate: cached === "off_target" ? "rejected" : "kept", gateOriginal: original, gateMs: Date.now() - startedAt }
  }

  const timeoutMs = budgetMs !== undefined ? Math.min(budgetMs, getAnswerGateTimeoutMs()) : getAnswerGateTimeoutMs()
  let result: Awaited<ReturnType<typeof judgePreparedAnswerFit>> = null
  let timedOut = false
  try {
    let timer: ReturnType<typeof setTimeout> | undefined
    result = await Promise.race([
      judgePreparedAnswerFit({ question, answer, timeoutMs }),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true
          resolve(null)
        }, timeoutMs + 100)
      }),
    ]).finally(() => clearTimeout(timer))
  } catch {
    result = null
  }

  const gateMs = Date.now() - startedAt
  if (!result) {
    if (process.env.NODE_ENV !== "test") {
      console.warn("[chatbot] answer gate skipped; keeping prepared answer.", { original, gateMs, timedOut })
    }
    return { gate: "skipped", gateOriginal: original, gateMs, skipReason: timedOut || gateMs >= timeoutMs ? "timeout" : "error" }
  }

  writeCachedVerdict(key, result.verdict)
  if (result.verdict === "off_target" && process.env.NODE_ENV !== "test") {
    console.info("[chatbot] answer gate rejected prepared answer.", { original, gateMs, model: result.model })
  }
  return { gate: result.verdict === "off_target" ? "rejected" : "kept", gateOriginal: original, gateMs }
}
