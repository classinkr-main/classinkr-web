// lib/marketing/insights/gemini-runner.ts
// Gemini 호출 — lib/branch/insights/gemini-runner.ts 미러.
//
// 재사용이 아니라 미러인 이유: branch 의 callGemini 는 InsightInput/InsightResult(지사 매출
// 도메인 타입)에 직접 결합돼 있어 마케팅 타입으로 부를 수 없다. 호출 방식·모델 해석 규약·
// JSON 스키마 강제·에러 처리는 동일하게 유지하고 타입과 프롬프트만 도메인 것으로 바꾼다.

import "server-only"
// 모델명 해석·thinkingConfig 판정은 소재 제안과 공유하는 SSOT 에서 온다.
import {
  DEFAULT_GEMINI_FAST_MODEL,
  DEFAULT_GEMINI_MODEL,
  GEMINI_FETCH_TIMEOUT_MS,
  resolveGeminiModel,
  rethrowGeminiFetchError,
  thinkingConfigFor,
} from "@/lib/marketing/gemini-model"
import { MARKETING_INSIGHT_SYSTEM_PROMPT, MARKETING_INSIGHT_RESPONSE_SCHEMA } from "./prompt"
import type { MarketingInsightInput } from "./input-builder"

export interface MarketingInsightResult {
  headline: string
  highlights: string[]
  next_actions: Array<{ title: string; why: string }>
}

export type GeminiMode = "quality" | "fast"

export async function callMarketingGemini(
  input: MarketingInsightInput,
  mode: GeminiMode = "quality"
): Promise<{ result: MarketingInsightResult; raw: unknown; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not set")
  const model =
    mode === "fast"
      ? resolveGeminiModel("GEMINI_FAST_MODEL", DEFAULT_GEMINI_FAST_MODEL)
      : resolveGeminiModel("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
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
  // 타임아웃은 플랫폼 상한보다 먼저 끊어야 runner 의 stale 폴백이 돌 기회를 얻는다.
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Connection: "close" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(GEMINI_FETCH_TIMEOUT_MS),
  }).catch((e: unknown) => rethrowGeminiFetchError(e, model))
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
