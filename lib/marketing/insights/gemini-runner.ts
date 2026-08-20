// lib/marketing/insights/gemini-runner.ts
// Gemini 호출 — lib/branch/insights/gemini-runner.ts 미러.
//
// 재사용이 아니라 미러인 이유: branch 의 callGemini 는 InsightInput/InsightResult(지사 매출
// 도메인 타입)에 직접 결합돼 있어 마케팅 타입으로 부를 수 없다. 호출 방식·모델 해석 규약·
// JSON 스키마 강제·에러 처리는 동일하게 유지하고 타입과 프롬프트만 도메인 것으로 바꾼다.

import "server-only"
import { MARKETING_INSIGHT_SYSTEM_PROMPT, MARKETING_INSIGHT_RESPONSE_SCHEMA } from "./prompt"
import type { MarketingInsightInput } from "./input-builder"

export interface MarketingInsightResult {
  headline: string
  highlights: string[]
  next_actions: Array<{ title: string; why: string }>
}

export type GeminiMode = "quality" | "fast"

const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro"
const DEFAULT_GEMINI_FAST_MODEL = "gemini-2.5-flash"
// 존재하지 않거나 이 호출 형태를 지원하지 않는 모델이 env 에 박혀도 404 로 죽지 않게 방어한다.
const UNSUPPORTED_GEMINI_MODELS = new Set(["gemini-3.1-pro"])

function resolveModel(envName: "GEMINI_MODEL" | "GEMINI_FAST_MODEL", fallback: string): string {
  const configured = process.env[envName]?.trim()
  if (!configured || UNSUPPORTED_GEMINI_MODELS.has(configured)) return fallback
  return configured
}

/**
 * 모델별 thinkingConfig — lib/chatbot/llm.ts 의 buildGenerationConfig 선례와 같은 규약.
 * 이 규약이 존재하는 이유: 이 저장소는 과거 gemini-2.5-flash 가 thinking 토큰을 다 써버려
 * 응답 본문이 빈 채로 오는 무음 실패를 겪었다(챗봇이 답변 대신 raw 청크를 노출). 여기서
 * 실제로 도는 모델도 2.5-flash 라 같은 지뢰를 밟는다. pro 계열은 선례와 동일하게 건드리지
 * 않는다 — 사고 예산이 품질 모드의 본체다.
 */
function thinkingConfigFor(
  model: string
): { thinkingBudget?: number; thinkingLevel?: "minimal" | "low" } | undefined {
  const lower = model.toLowerCase()
  if (lower.startsWith("gemini-3")) {
    return { thinkingLevel: lower.includes("pro") ? "low" : "minimal" }
  }
  if (lower.startsWith("gemini-2.5-flash")) return { thinkingBudget: 0 }
  return undefined
}

export async function callMarketingGemini(
  input: MarketingInsightInput,
  mode: GeminiMode = "quality"
): Promise<{ result: MarketingInsightResult; raw: unknown; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not set")
  const model =
    mode === "fast"
      ? resolveModel("GEMINI_FAST_MODEL", DEFAULT_GEMINI_FAST_MODEL)
      : resolveModel("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const thinking = thinkingConfigFor(model)
  const body = {
    systemInstruction: { parts: [{ text: MARKETING_INSIGHT_SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: MARKETING_INSIGHT_RESPONSE_SCHEMA,
      temperature: 0.4,
      ...(thinking ? { thinkingConfig: thinking } : {}),
    },
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Connection: "close" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Gemini ${res.status}: ${text}`)
  }
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  const parsed = JSON.parse(text) as MarketingInsightResult
  if (!parsed.headline || !Array.isArray(parsed.highlights) || !Array.isArray(parsed.next_actions)) {
    throw new Error("invalid Gemini response shape")
  }
  return { result: parsed, raw: json, model }
}
