import "server-only"

import {
  getInternalCsModelChain,
  type InternalCsModelMode,
  type InternalCsRequestedMode,
} from "@/lib/internal-cs-chat/gemini"

export const INTERNAL_CS_VISION_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const

export type InternalCsVisionMimeType = (typeof INTERNAL_CS_VISION_MIME_TYPES)[number]

export interface AnalyzeInternalCsImageInput {
  bytes: Uint8Array
  mimeType: InternalCsVisionMimeType
  fileName?: string
  instruction?: string
  requestedMode?: InternalCsRequestedMode
}

export interface InternalCsImageAnalysis {
  summary: string
  extractedText: string[]
  observations: string[]
  sensitiveDataWarnings: string[]
  suggestedTags: string[]
  followUpQuestions: string[]
  needsHumanReview: true
  mode: InternalCsModelMode
  model: string | null
  origin: "model" | "deterministic"
  fallbackUsed: boolean
  attemptedModels: string[]
  guardrails: readonly [
    "cs_owner_review_required",
    "internal_only_until_approved",
    "image_claims_must_be_verified"
  ]
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_INSTRUCTION_LENGTH = 2_000
const MAX_RESULT_TEXT_LENGTH = 8_000
const DEFAULT_TOTAL_TIMEOUT_MS = 12_000
const DEFAULT_ATTEMPT_TIMEOUT_MS = 5_000
const MIN_REMAINING_ATTEMPT_MS = 500

const GUARDRAILS = [
  "cs_owner_review_required",
  "internal_only_until_approved",
  "image_claims_must_be_verified",
] as const

const SYSTEM_INSTRUCTION = [
  "You are an internal-only Classin CS evidence analyst.",
  "Inspect the attached screenshot or photo without inventing unreadable text or hidden context.",
  "Separate visible facts from inference. Flag account identifiers, phone numbers, email addresses, payment data, faces, and other sensitive information.",
  "Never decide that content may be sent to a customer. A CS owner must review and approve every analysis and any derived response.",
  "Return only a JSON object with keys: summary, extractedText, observations, sensitiveDataWarnings, suggestedTags, followUpQuestions.",
].join("\n")

function trimTo(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : ""
}

function readBoundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

function cleanStringList(value: unknown, limit: number, itemLength: number) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => trimTo(item, itemLength)).filter(Boolean))].slice(0, limit)
}

function stripJsonFence(value: string) {
  return value
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim()
}

export function parseInternalCsImageAnalysis(value: string) {
  try {
    const parsed = JSON.parse(stripJsonFence(value)) as Record<string, unknown>
    const summary = trimTo(parsed.summary, 2_000)
    if (!summary) return null
    return {
      summary,
      extractedText: cleanStringList(parsed.extractedText, 80, 500),
      observations: cleanStringList(parsed.observations, 30, 500),
      sensitiveDataWarnings: cleanStringList(parsed.sensitiveDataWarnings, 20, 300),
      suggestedTags: cleanStringList(parsed.suggestedTags, 12, 80),
      followUpQuestions: cleanStringList(parsed.followUpQuestions, 12, 500),
    }
  } catch {
    return null
  }
}

function deterministicAnalysis(
  mode: InternalCsModelMode,
  attemptedModels: string[]
): InternalCsImageAnalysis {
  return {
    summary: "이미지 자동 분석을 완료하지 못했습니다. 원본을 CS 담당자가 직접 확인해 주세요.",
    extractedText: [],
    observations: [],
    sensitiveDataWarnings: ["개인정보와 고객 식별정보 포함 여부를 수동으로 확인해야 합니다."],
    suggestedTags: ["이미지-수동검토"],
    followUpQuestions: ["이미지에서 확인해야 할 핵심 사실과 고객 문의의 연결 관계는 무엇인가요?"],
    needsHumanReview: true,
    mode,
    model: null,
    origin: "deterministic",
    fallbackUsed: true,
    attemptedModels,
    guardrails: GUARDRAILS,
  }
}

function selectMode(input: AnalyzeInternalCsImageInput): InternalCsModelMode {
  if (input.requestedMode === "deep") return "deep"
  if (input.requestedMode === "fast") return "fast"
  return trimTo(input.instruction, MAX_INSTRUCTION_LENGTH).length >= 500 ? "deep" : "fast"
}

function generationConfig(model: string, mode: InternalCsModelMode) {
  const config: Record<string, unknown> = {
    maxOutputTokens: mode === "deep" ? 2_048 : 1_024,
    responseMimeType: "application/json",
  }
  if (model.startsWith("gemini-3.5-flash")) {
    config.thinkingConfig = { thinkingLevel: mode === "deep" ? "high" : "low" }
  } else if (model.startsWith("gemini-3.1-pro")) {
    config.thinkingConfig = { thinkingLevel: "high" }
  }
  return config
}

function readCandidateText(data: unknown) {
  const response = data as {
    candidates?: { content?: { parts?: { text?: unknown }[] } }[]
  }
  const text = response.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim()
  return text ? text.slice(0, MAX_RESULT_TEXT_LENGTH) : null
}

/**
 * Analyzes bytes already accepted by the server. This function never fetches a remote image URL
 * and never throws for model/key/network/response failures. The result always remains pending
 * human review at the persistence layer.
 */
export async function analyzeInternalCsImage(
  input: AnalyzeInternalCsImageInput
): Promise<InternalCsImageAnalysis> {
  const mode = selectMode(input)
  const attemptedModels: string[] = []
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey || input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_IMAGE_BYTES) {
    return deterministicAnalysis(mode, attemptedModels)
  }

  const totalTimeoutMs = readBoundedInt(
    process.env.INTERNAL_CS_VISION_TOTAL_TIMEOUT_MS,
    DEFAULT_TOTAL_TIMEOUT_MS,
    2_000,
    20_000
  )
  const attemptTimeoutMs = readBoundedInt(
    process.env.INTERNAL_CS_VISION_ATTEMPT_TIMEOUT_MS,
    DEFAULT_ATTEMPT_TIMEOUT_MS,
    1_000,
    8_000
  )
  const deadline = Date.now() + totalTimeoutMs
  const instruction = trimTo(input.instruction, MAX_INSTRUCTION_LENGTH)
  const prompt = [
    `File name: ${trimTo(input.fileName, 200) || "attachment"}`,
    instruction ? `CS owner instruction: ${instruction}` : "Analyze visible CS evidence.",
    "Describe only what is visible. If text is unreadable, state that explicitly.",
  ].join("\n")
  const inlineData = {
    mimeType: input.mimeType,
    data: Buffer.from(input.bytes).toString("base64"),
  }

  for (const model of getInternalCsModelChain(mode)) {
    const remainingMs = deadline - Date.now()
    if (remainingMs < MIN_REMAINING_ATTEMPT_MS) break
    attemptedModels.push(model)

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.min(attemptTimeoutMs, remainingMs))
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          signal: controller.signal,
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            contents: [{ role: "user", parts: [{ text: prompt }, { inlineData }] }],
            generationConfig: generationConfig(model, mode),
          }),
        }
      )
      if (!response.ok) continue
      const rawText = readCandidateText(await response.json())
      const analysis = rawText ? parseInternalCsImageAnalysis(rawText) : null
      if (!analysis) continue

      return {
        ...analysis,
        needsHumanReview: true,
        mode,
        model,
        origin: "model",
        fallbackUsed: attemptedModels.length > 1,
        attemptedModels,
        guardrails: GUARDRAILS,
      }
    } catch {
      // Timeouts, network errors and malformed responses continue through the safe model chain.
    } finally {
      clearTimeout(timeout)
    }
  }

  return deterministicAnalysis(mode, attemptedModels)
}
