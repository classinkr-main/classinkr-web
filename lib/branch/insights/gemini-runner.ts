import "server-only"
import { INSIGHT_SYSTEM_PROMPT, INSIGHT_RESPONSE_SCHEMA } from "./prompt"
import type { InsightInput } from "./input-builder"

export interface InsightResult {
  one_liner: string
  next_actions: Array<{ title: string; why: string; owner: string; due?: string }>
}

export type GeminiMode = "quality" | "fast"

const DEFAULT_GEMINI_MODEL = "gemini-2.5-pro"
const DEFAULT_GEMINI_FAST_MODEL = "gemini-2.5-flash"
const UNSUPPORTED_GEMINI_MODELS = new Set(["gemini-3.1-pro"])

function resolveModel(envName: "GEMINI_MODEL" | "GEMINI_FAST_MODEL", fallback: string): string {
  const configured = process.env[envName]?.trim()
  if (!configured || UNSUPPORTED_GEMINI_MODELS.has(configured)) return fallback
  return configured
}

export async function callGemini(input: InsightInput, mode: GeminiMode = "quality"): Promise<{ result: InsightResult; raw: unknown; model: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("GEMINI_API_KEY not set")
  const model = mode === "fast"
    ? resolveModel("GEMINI_FAST_MODEL", DEFAULT_GEMINI_FAST_MODEL)
    : resolveModel("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const body = {
    systemInstruction: { parts: [{ text: INSIGHT_SYSTEM_PROMPT }] },
    contents: [{ role: "user", parts: [{ text: JSON.stringify(input) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: INSIGHT_RESPONSE_SCHEMA,
      temperature: 0.4,
    },
  }
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    throw new Error(`Gemini ${res.status}: ${t}`)
  }
  const json = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
  const text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? ""
  const parsed = JSON.parse(text) as InsightResult
  if (!parsed.one_liner || !Array.isArray(parsed.next_actions)) {
    throw new Error("invalid Gemini response shape")
  }
  return { result: parsed, raw: json, model }
}
