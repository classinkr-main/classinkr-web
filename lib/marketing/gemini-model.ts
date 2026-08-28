// lib/marketing/gemini-model.ts
// 마케팅 Gemini 호출의 모델 해석 SSOT.
//
// insights/gemini-runner.ts(주간 브리핑)와 creative-suggest.ts(소재 제안)가 같은 상수·같은
// 판정을 각자 들고 있었다 — 한쪽만 고치면 두 호출이 다른 모델·다른 thinking 설정으로 조용히
// 갈라진다. 타입 결합이 없는 부분(모델명 해석 + thinkingConfig 판정)만 여기로 모으고,
// 프롬프트·응답 스키마·결과 타입은 도메인 모듈에 그대로 둔다.

import "server-only"

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro"
export const DEFAULT_GEMINI_FAST_MODEL = "gemini-2.5-flash"

/** 존재하지 않거나 이 호출 형태(v1beta generateContent + responseSchema)를 지원하지 않는
 *  모델이 env 에 박혀도 404 로 죽지 않게 방어한다. */
export const UNSUPPORTED_GEMINI_MODELS = new Set(["gemini-3.1-pro"])

export function resolveGeminiModel(
  envName: "GEMINI_MODEL" | "GEMINI_FAST_MODEL",
  fallback: string
): string {
  const configured = process.env[envName]?.trim()
  if (!configured || UNSUPPORTED_GEMINI_MODELS.has(configured)) return fallback
  return configured
}

/**
 * Gemini fetch 타임아웃. 플랫폼 상한(라우트 maxDuration=60)에만 기대면 안 되는 이유:
 * 한 호출이 60초에 근접하면 플랫폼이 함수를 통째로 죽여서 runner 의 stale 폴백 try/catch 가
 * 실행될 기회조차 없다 — 공들여 만든 강등 사다리가 아예 돌지 않는다. 브리핑 경로는 숫자 검증
 * 실패 시 최대 2회 호출이라 25초 × 2 + 입력 조립이 60초 안에 들어가는 값으로 잡는다.
 */
export const GEMINI_FETCH_TIMEOUT_MS = 25_000

/** 타임아웃으로 끊긴 fetch 실패를 그 사실이 드러나는 에러로 바꾼다(그 외 실패는 원문 그대로). */
export function rethrowGeminiFetchError(error: unknown, model: string): never {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    throw new Error(
      `Gemini 응답 타임아웃(${GEMINI_FETCH_TIMEOUT_MS / 1000}초 초과) — model=${model}`
    )
  }
  throw error
}

export interface GeminiThinkingConfig {
  thinkingBudget?: number
  thinkingLevel?: "minimal" | "low"
}

/**
 * 모델별 thinkingConfig — lib/chatbot/llm.ts 의 buildGenerationConfig 선례와 같은 규약.
 * 이 규약이 존재하는 이유: 이 저장소는 과거 gemini-2.5-flash 가 thinking 토큰을 다 써버려
 * 응답 본문이 빈 채로 오는 무음 실패를 겪었다(챗봇이 답변 대신 raw 청크를 노출).
 * pro 계열은 선례와 동일하게 건드리지 않는다 — 사고 예산이 품질 모드의 본체다.
 */
export function thinkingConfigFor(model: string): GeminiThinkingConfig | undefined {
  const lower = model.toLowerCase()
  if (lower.startsWith("gemini-3")) {
    return { thinkingLevel: lower.includes("pro") ? "low" : "minimal" }
  }
  if (lower.startsWith("gemini-2.5-flash")) return { thinkingBudget: 0 }
  return undefined
}
