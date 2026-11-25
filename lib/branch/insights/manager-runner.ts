import "server-only"
import { MANAGER_INSIGHT_SYSTEM_PROMPT, MANAGER_INSIGHT_RESPONSE_SCHEMA } from "./prompt"
import type { ManagerInsightInput } from "./manager-input-builder"
import { generateStructured, type JsonSchema } from "./llm"

export interface ManagerInsightResult {
  summary: string
  strengths: string[]
  risks: string[]
  next_actions: Array<{ title: string; why: string; due?: string }>
}

function validateManagerInsight(value: unknown): ManagerInsightResult {
  const parsed = value as ManagerInsightResult
  if (!parsed || typeof parsed.summary !== "string" || !parsed.summary || !Array.isArray(parsed.next_actions)) throw new Error("invalid manager insight response shape")
  return parsed
}

/** 매니저 1:1 인사이트 — Claude(Anthropic API) 먼저, 실패하면 Gemini(빠른 모델). */
export async function callManagerInsight(input: ManagerInsightInput): Promise<{ result: ManagerInsightResult; raw: unknown; model: string }> {
  const out = await generateStructured({
    system: MANAGER_INSIGHT_SYSTEM_PROMPT,
    user: JSON.stringify(input),
    schema: MANAGER_INSIGHT_RESPONSE_SCHEMA as unknown as JsonSchema,
    mode: "fast",
    validate: validateManagerInsight,
  })
  return { result: out.result, raw: { ...((out.raw as object) ?? {}), _provider: out.provider, _fallback_reason: out.fallbackReason ?? null }, model: out.model }
}
