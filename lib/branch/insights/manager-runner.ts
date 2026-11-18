import "server-only"
import {
  DEFAULT_GEMINI_FAST_MODEL,
  resolveGeminiModel,
  thinkingConfigFor,
  withGeminiModelFallback,
} from "@/lib/marketing/gemini-model"
import { MANAGER_INSIGHT_SYSTEM_PROMPT, MANAGER_INSIGHT_RESPONSE_SCHEMA } from "./prompt"
import type { ManagerInsightInput } from "./manager-input-builder"

export interface ManagerInsightResult {
  summary: string
  strengths: string[]
  risks: string[]
  next_actions: Array<{ title: string; why: string; due?: string }>
}

export async function callManagerInsight(input: ManagerInsightInput): Promise<{ result: ManagerInsightResult; raw: unknown; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not set")
  const primary = resolveGeminiModel("GEMINI_FAST_MODEL", DEFAULT_GEMINI_FAST_MODEL)
  return withGeminiModelFallback(primary, (model) => callOnce(apiKey, model, input))
}

async function callOnce(
  apiKey: string,
  model: string,
  input: ManagerInsightInput
): Promise<{ result: ManagerInsightResult; raw: unknown; model: string }> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const thinking = thinkingConfigFor(model)
  const body = {
    systemInstruction: { parts: [{ text: MANAGER_INSIGHT_SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: MANAGER_INSIGHT_RESPONSE_SCHEMA,
      temperature: 0.4,
      ...(thinking ? { thinkingConfig: thinking } : {}),
    },
  }
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Connection": "close" }, body: JSON.stringify(body) })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Gemini ${res.status}: ${t}`)
  }
  const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  const parsed = JSON.parse(text) as ManagerInsightResult
  if (!parsed.summary || !Array.isArray(parsed.next_actions)) throw new Error("invalid Gemini response shape")
  return { result: parsed, raw: json, model }
}
