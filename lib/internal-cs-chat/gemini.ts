/**
 * Internal CS copilot — Gemini model routing and failure-safe runtime.
 *
 * This module is intentionally separate from the public chatbot runtime:
 * - internal CS may use internal-only evidence and communication templates;
 * - every generated answer stays in `pending` review until a CS owner approves it;
 * - model/API failure always returns a deterministic fallback instead of throwing.
 *
 * Official model mapping verified against Google AI documentation on 2026-07-15:
 * - fast: gemini-3.5-flash (GA stable)
 * - deep: gemini-3.1-pro-preview (latest Pro, preview)
 * - backup: gemini-3.1-flash-lite (GA stable)
 */

import "server-only"

export type InternalCsModelMode = "fast" | "deep"
export type InternalCsRequestedMode = "auto" | InternalCsModelMode
export type InternalCsRiskLevel = "low" | "medium" | "high"

export interface InternalCsSourceRef {
  id: string
  label?: string
  kind?: "public_doc" | "internal_guide" | "curated_knowledge" | "internal_asset"
  verificationStatus?: "confirmed" | "conditional" | "conflicting_sources" | "hq_confirmation_required"
  externalUse?: "reviewed_summary_allowed" | "internal_only" | "confirmation_required"
  reviewState?: "pending" | "approved" | "changes_requested" | "rejected"
}

export interface InternalCsChatTurn {
  role: "user" | "model"
  text: string
}

export interface GenerateInternalCsAnswerInput {
  question: string
  /** RAG 결과 등 내부 전용 컨텍스트. 고객에게 직접 노출하면 안 된다. */
  internalContext?: string
  sourceRefs?: InternalCsSourceRef[]
  history?: InternalCsChatTurn[]
  requestedMode?: InternalCsRequestedMode
  riskLevel?: InternalCsRiskLevel
  /** 서로 다른 사양/정책/본사 답변을 대조해야 하는 요청. */
  requiresEvidenceReview?: boolean
  /** API 실패 시 그대로 반환할, 코드에서 만든 검증 가능한 안전 초안. */
  deterministicFallback?: string
}

export interface InternalCsAnswerResult {
  answer: string
  mode: InternalCsModelMode
  model: string | null
  origin: "model" | "deterministic"
  fallbackUsed: boolean
  attemptedModels: string[]
  citations: InternalCsSourceRef[]
  reviewState: "pending"
  guardrails: readonly [
    "cs_owner_review_required",
    "internal_only_until_approved",
    "unverified_claims_must_be_labeled"
  ]
}

export interface InternalCsGeminiModels {
  fast: string
  deep: string
  backup: string
}

const DEFAULT_FAST_MODEL = "gemini-3.5-flash"
const DEFAULT_DEEP_MODEL = "gemini-3.1-pro-preview"
const DEFAULT_BACKUP_MODEL = "gemini-3.1-flash-lite"

const DEFAULT_TOTAL_TIMEOUT_MS = 8_000
const DEFAULT_ATTEMPT_TIMEOUT_MS = 3_500
const MIN_REMAINING_ATTEMPT_MS = 500

const MAX_QUESTION_LENGTH = 12_000
const MAX_CONTEXT_LENGTH = 48_000
const MAX_HISTORY_TURNS = 8
const MAX_HISTORY_TURN_LENGTH = 6_000
const MAX_ANSWER_LENGTH = 16_000

const REVIEW_GUARDRAILS = [
  "cs_owner_review_required",
  "internal_only_until_approved",
  "unverified_claims_must_be_labeled",
] as const

// Google가 종료했거나, 실제 공개 모델 ID가 아닌 것으로 확인된 값은 env에 있어도 사용하지 않는다.
const BLOCKED_MODELS = new Set([
  "gemini-3.1-pro",
  "gemini-3-pro-preview",
  "gemini-2.0-flash",
  "gemini-2.0-flash-001",
  "gemini-2.0-flash-lite",
  "gemini-2.0-flash-lite-001",
  "gemini-1.5-flash",
  "gemini-1.5-pro",
])

// 내부 CS 텍스트 생성에 사용할 수 있다고 공식 문서로 확인한 현재 모델만 허용한다.
// 새 모델을 도입할 때는 공식 모델 페이지 확인 + 회귀 테스트 후 이 목록을 갱신한다.
const ALLOWED_CONFIGURED_MODELS = new Set([
  DEFAULT_FAST_MODEL,
  DEFAULT_DEEP_MODEL,
  DEFAULT_BACKUP_MODEL,
  "gemini-2.5-flash",
  "gemini-2.5-pro",
])

const DEEP_KEYWORDS = [
  /충돌|상충|불일치|근거\s*비교|원인\s*분석|로그\s*분석/i,
  /개인정보|보안|법무|계약|환불|장애|데이터\s*(?:손실|유실)/i,
  /본사\s*(?:확인|소통|에스컬레이션)|hq\s*(?:confirm|escalat)/i,
  /사양\s*(?:검증|대조)|세대\s*(?:확인|비교)|재현\s*절차/i,
]

const DEFAULT_DETERMINISTIC_FALLBACK = [
  "AI 초안을 생성하지 못했습니다.",
  "확인된 내부 자료만 기준으로 답변을 작성하고, 충돌하거나 미확정인 내용은 ‘확인 필요’로 표시해 주세요.",
  "외부 전달 전 CS 담당자의 검토와 승인이 필요합니다.",
].join("\n")

const SYSTEM_INSTRUCTION = [
  "너는 Classin 한국팀의 내부 CS 코파일럿이다.",
  "사용자는 고객이 아니라 CS 담당자다. 내부 자료와 외부 공개 자료를 함께 사용할 수 있지만 둘의 공개 가능 범위를 구분한다.",
  "답변의 사실 상태를 확인됨 / 조건부 / 본사 확인 필요 / 자료 충돌로 구분한다.",
  "서로 다른 자료가 충돌하면 임의로 하나를 정답으로 고르지 말고 충돌 지점, 필요한 확인 질문, 권장 임시 응대를 정리한다.",
  "정리된 내부 지식의 외부 사용 경계를 지킨다. ‘담당자 검토 후 고객 안내 가능’만 고객 초안의 사실 근거로 쓰고, ‘내부 전용’은 노출하지 않으며, ‘확인 전 외부 단정 금지’는 확인 질문과 임시 안내에만 쓴다.",
  "고객 답변이나 본사 소통문을 요청받으면 반드시 ‘검토 전 초안’으로 작성하고, 전송·확정·승인을 했다고 말하지 않는다.",
  "가격, 환불, 계약, 개인정보, 보안, 장애 원인, 설치 가능 여부, 제품 사양은 제공된 근거 없이 단정하지 않는다.",
  "개인정보·API 키·내부 비밀번호·불필요한 고객 식별정보를 답변에 복제하지 않는다.",
  "최종 판단과 외부 전송 권한은 CS 담당자에게 있다.",
].join("\n")

function trimTo(value: string | undefined, maxLength: number) {
  return (value ?? "").trim().slice(0, maxLength)
}

function readBoundedInt(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.trunc(parsed)))
}

/**
 * Reject URL/path/query injection and models that have not been explicitly verified for this
 * runtime. Environment variables select among the reviewed models; they cannot invent an ID.
 */
export function isSafeGeminiModelId(value: string) {
  const model = value.trim()
  if (!/^gemini-[a-z0-9][a-z0-9.-]{2,79}$/.test(model)) return false
  return !BLOCKED_MODELS.has(model) && ALLOWED_CONFIGURED_MODELS.has(model)
}

function resolveConfiguredModel(envValue: string | undefined, fallback: string) {
  const configured = envValue?.trim()
  return configured && isSafeGeminiModelId(configured) ? configured : fallback
}

export function getInternalCsGeminiModels(): InternalCsGeminiModels {
  return {
    fast: resolveConfiguredModel(process.env.INTERNAL_CS_GEMINI_FAST_MODEL, DEFAULT_FAST_MODEL),
    deep: resolveConfiguredModel(process.env.INTERNAL_CS_GEMINI_DEEP_MODEL, DEFAULT_DEEP_MODEL),
    backup: resolveConfiguredModel(
      process.env.INTERNAL_CS_GEMINI_BACKUP_MODEL,
      DEFAULT_BACKUP_MODEL
    ),
  }
}

export function selectInternalCsModelMode({
  question,
  requestedMode = "auto",
  riskLevel = "low",
  requiresEvidenceReview = false,
}: Pick<
  GenerateInternalCsAnswerInput,
  "question" | "requestedMode" | "riskLevel" | "requiresEvidenceReview"
>): InternalCsModelMode {
  if (requestedMode === "fast" || requestedMode === "deep") return requestedMode
  if (riskLevel === "high" || requiresEvidenceReview) return "deep"

  const normalizedQuestion = trimTo(question, MAX_QUESTION_LENGTH)
  if (normalizedQuestion.length >= 500) return "deep"
  return DEEP_KEYWORDS.some((pattern) => pattern.test(normalizedQuestion)) ? "deep" : "fast"
}

export function getInternalCsModelChain(mode: InternalCsModelMode) {
  const models = getInternalCsGeminiModels()
  const candidates = mode === "deep"
    ? [models.deep, models.fast, models.backup]
    : [models.fast, models.backup]
  return Array.from(new Set(candidates))
}

function normalizeSourceRefs(sourceRefs: InternalCsSourceRef[] | undefined) {
  if (!sourceRefs) return []
  const seen = new Set<string>()
  const normalized: InternalCsSourceRef[] = []

  for (const source of sourceRefs.slice(0, 20)) {
    const id = trimTo(source.id, 200)
    if (!id || seen.has(id)) continue
    seen.add(id)
    normalized.push({
      id,
      ...(source.label ? { label: trimTo(source.label, 200) } : {}),
      ...(["public_doc", "internal_guide", "curated_knowledge", "internal_asset"].includes(source.kind ?? "")
        ? { kind: source.kind }
        : {}),
      ...(["confirmed", "conditional", "conflicting_sources", "hq_confirmation_required"].includes(source.verificationStatus ?? "")
        ? { verificationStatus: source.verificationStatus }
        : {}),
      ...(["reviewed_summary_allowed", "internal_only", "confirmation_required"].includes(source.externalUse ?? "")
        ? { externalUse: source.externalUse }
        : {}),
      ...(["pending", "approved", "changes_requested", "rejected"].includes(source.reviewState ?? "")
        ? { reviewState: source.reviewState }
        : {}),
    })
  }
  return normalized
}

function buildContents(input: GenerateInternalCsAnswerInput) {
  const history = (input.history ?? [])
    .slice(-MAX_HISTORY_TURNS)
    .map((turn) => ({
      role: turn.role,
      parts: [{ text: trimTo(turn.text, MAX_HISTORY_TURN_LENGTH) }],
    }))
    .filter((turn) => Boolean(turn.parts[0].text))

  const question = trimTo(input.question, MAX_QUESTION_LENGTH)
  const context = trimTo(input.internalContext, MAX_CONTEXT_LENGTH)
  const prompt = [
    context ? `내부 참고 정보:\n${context}` : "내부 참고 정보: 없음",
    `담당자 질문:\n${question}`,
    "내부 검토용 답변을 작성해. 외부 전달 문안이 포함되면 검토 전 초안임을 표시해.",
  ].join("\n\n")

  return [...history, { role: "user" as const, parts: [{ text: prompt }] }]
}

function buildGenerationConfig(model: string, mode: InternalCsModelMode) {
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: mode === "deep" ? 4_096 : 2_048,
  }

  // Gemini 3.x uses thinkingLevel. 3.5 Flash supports low/high and 3.1 Pro supports high.
  if (model.startsWith("gemini-3.5-flash")) {
    generationConfig.thinkingConfig = { thinkingLevel: mode === "deep" ? "high" : "low" }
  } else if (model.startsWith("gemini-3.1-pro")) {
    generationConfig.thinkingConfig = { thinkingLevel: "high" }
  }

  return generationConfig
}

function readCandidateText(data: unknown) {
  const response = data as {
    candidates?: { content?: { parts?: { text?: unknown }[] } }[]
  }
  const answer = response.candidates?.[0]?.content?.parts
    ?.map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim()
  return answer ? answer.slice(0, MAX_ANSWER_LENGTH) : null
}

function deterministicResult({
  input,
  mode,
  attemptedModels,
  citations,
}: {
  input: GenerateInternalCsAnswerInput
  mode: InternalCsModelMode
  attemptedModels: string[]
  citations: InternalCsSourceRef[]
}): InternalCsAnswerResult {
  return {
    answer: trimTo(input.deterministicFallback, MAX_ANSWER_LENGTH) || DEFAULT_DETERMINISTIC_FALLBACK,
    mode,
    model: null,
    origin: "deterministic",
    fallbackUsed: true,
    attemptedModels,
    citations,
    reviewState: "pending",
    guardrails: REVIEW_GUARDRAILS,
  }
}

/**
 * Generate an internal-only CS draft. Never throws for model/key/network/shape failures.
 * The caller should persist `model`, `mode`, `fallbackUsed`, `citations`, and `guardrails`
 * into assistant-message metadata and keep `reviewState` pending until a CS owner approves it.
 */
export async function generateInternalCsAnswer(
  input: GenerateInternalCsAnswerInput
): Promise<InternalCsAnswerResult> {
  const mode = selectInternalCsModelMode(input)
  const citations = normalizeSourceRefs(input.sourceRefs)
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  const attemptedModels: string[] = []

  if (!apiKey || !trimTo(input.question, MAX_QUESTION_LENGTH)) {
    return deterministicResult({ input, mode, attemptedModels, citations })
  }

  const totalTimeoutMs = readBoundedInt(
    process.env.INTERNAL_CS_GEMINI_TOTAL_TIMEOUT_MS,
    DEFAULT_TOTAL_TIMEOUT_MS,
    2_000,
    15_000
  )
  const attemptTimeoutMs = readBoundedInt(
    process.env.INTERNAL_CS_GEMINI_ATTEMPT_TIMEOUT_MS,
    DEFAULT_ATTEMPT_TIMEOUT_MS,
    1_000,
    6_000
  )
  const deadline = Date.now() + totalTimeoutMs
  const contents = buildContents(input)
  const modelChain = getInternalCsModelChain(mode)

  for (const model of modelChain) {
    const remainingMs = deadline - Date.now()
    if (remainingMs < MIN_REMAINING_ATTEMPT_MS) break

    attemptedModels.push(model)
    const controller = new AbortController()
    const timeout = setTimeout(
      () => controller.abort(),
      Math.min(attemptTimeoutMs, remainingMs)
    )

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
            contents,
            generationConfig: buildGenerationConfig(model, mode),
          }),
        }
      )

      if (!response.ok) continue
      const answer = readCandidateText(await response.json())
      if (!answer) continue

      return {
        answer,
        mode,
        model,
        origin: "model",
        fallbackUsed: attemptedModels.length > 1,
        attemptedModels,
        citations,
        reviewState: "pending",
        guardrails: REVIEW_GUARDRAILS,
      }
    } catch {
      // Network, timeout and malformed JSON all move to the next configured safe model.
    } finally {
      clearTimeout(timeout)
    }
  }

  return deterministicResult({ input, mode, attemptedModels, citations })
}
