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
