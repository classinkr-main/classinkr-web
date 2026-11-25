import "server-only"
import { INSIGHT_SYSTEM_PROMPT, INSIGHT_RESPONSE_SCHEMA } from "./prompt"
import type { InsightInput } from "./input-builder"
import { callGeminiStructured, generateStructured, type InsightMode, type JsonSchema, type StructuredCall, type StructuredResult } from "./llm"
import type { ReportModule, WeeklyReportDraft } from "@/lib/branch/weekly-report-contract"

export type { ReportModule, WeeklyReportDraft }

export interface InsightResult {
  one_liner: string
  next_actions: Array<{ title: string; why: string; owner: string; due?: string; module?: ReportModule }>
  /** 본사 양식 간이 보고. 이전 캐시에는 없을 수 있다. */
  weekly_report?: WeeklyReportDraft
  /** 이전 형식(4줄) — 오래된 캐시 호환용으로만 읽는다. */
  report_notes?: string[]
}

export type GeminiMode = InsightMode

function validateInsight(value: unknown): InsightResult {
  const parsed = value as InsightResult
  if (!parsed || typeof parsed.one_liner !== "string" || !parsed.one_liner || !Array.isArray(parsed.next_actions)) {
    throw new Error("invalid insight response shape")
  }
  return parsed
}

function insightCall(input: InsightInput, mode: InsightMode): StructuredCall<InsightResult> {
  return { system: INSIGHT_SYSTEM_PROMPT, user: JSON.stringify(input), schema: INSIGHT_RESPONSE_SCHEMA as unknown as JsonSchema, mode, validate: validateInsight }
}

/** Gemini만 부른다(Vertex 설정이 있으면 Vertex, 없으면 AI Studio 키). */
export async function callGemini(input: InsightInput, mode: GeminiMode = "quality"): Promise<{ result: InsightResult; raw: unknown; model: string }> {
  const out = await callGeminiStructured(insightCall(input, mode))
  return { result: out.result, raw: out.raw, model: out.model }
}

/** 인사이트 생성 — Claude(Anthropic API) 먼저, 실패하면 Gemini. */
export async function callInsightModel(input: InsightInput, mode: InsightMode = "quality"): Promise<StructuredResult<InsightResult>> {
  return generateStructured(insightCall(input, mode))
}
