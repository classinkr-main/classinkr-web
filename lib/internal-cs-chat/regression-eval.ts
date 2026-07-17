/**
 * 내부 CS 회귀 자동 평가 러너(계약 2).
 *
 * 미판정 후보(또는 명시된 messageIds)를 하나씩 재생성(buildInternalCsCopilotContext +
 * generateInternalCsAnswer 재사용, includeInternalDocs=true)한 뒤, 담당자가 확정한 corrected_content 를
 * 기준 정답으로 삼아 LLM 심판이 pass/needs_fix 를 제안한다.
 *
 * 중요: 평가는 "제안"까지만이다. DB 의 regression_outcome 을 절대 바꾸지 않는다(human-in-the-loop).
 * 확정은 기존 판정 PATCH(updateInternalCsRegressionOutcome)의 몫이며 이 모듈은 그 함수를 부르지 않는다.
 *
 * 비용이 있는 재생성·심판은 순차 실행하고 항목 단위 try/catch 로 감싼다 — 한 건 실패가 배치를 죽이지 않는다.
 * 재생성/심판을 하지 못한 항목은 items 에 넣지 않고 skipped 로 분리한다.
 */

import "server-only"

import { normalizeTopicTags } from "@/lib/chatbot/topic-crosswalk"
import { buildInternalCsCopilotContext } from "@/lib/internal-cs-chat/context"
import {
  generateInternalCsAnswer,
  type InternalCsChatTurn,
  type InternalCsRequestedMode,
} from "@/lib/internal-cs-chat/gemini"
import {
  getInternalCsConversation,
  listInternalCsRegressionEvalCandidates,
  type InternalCsMessageRow,
  type InternalCsRegressionEvalCandidate,
} from "@/lib/repositories/internal-cs-chat"

export const REGRESSION_EVAL_DEFAULT_LIMIT = 5
export const REGRESSION_EVAL_MAX_LIMIT = 10

export type RegressionEvalOutcome = "pass" | "needs_fix"

export interface RegressionEvalItem {
  messageId: string
  conversationId: string
  suggestedOutcome: RegressionEvalOutcome
  rationale: string
  regeneratedExcerpt: string
  judgeModel: string
}

export interface RegressionEvalSkipped {
  messageId: string
  reason: string
}

export interface RegressionEvalResult {
  items: RegressionEvalItem[]
  skipped: RegressionEvalSkipped[]
}

export interface RegressionRegeneration {
  question: string
  answer: string
  origin: "model" | "deterministic"
}

export interface RegressionJudgement {
  outcome: RegressionEvalOutcome
  rationale: string
  model: string
}

export interface RegressionEvalDeps {
  loadCandidates(input: {
    messageIds?: string[]
    limit: number
  }): Promise<InternalCsRegressionEvalCandidate[]>
  regenerate(candidate: InternalCsRegressionEvalCandidate): Promise<RegressionRegeneration>
  judge(input: {
    question: string
    reference: string
    regenerated: string
  }): Promise<RegressionJudgement | null>
}

const EXCERPT_LENGTH = 240
const MAX_HISTORY_TURNS = 8

const JUDGE_MODEL =
  process.env.INTERNAL_CS_JUDGE_MODEL?.trim() ||
  process.env.GEMINI_FAST_MODEL?.trim() ||
  "gemini-3.5-flash"

const JUDGE_SYSTEM_INSTRUCTION = [
  "너는 Classin 한국팀 내부 CS 답변의 회귀 평가자다.",
  "'기준 답변'은 CS 담당자가 검토·확정한 정답이고, '재생성 답변'은 같은 질문에 대해 현재 모델이 새로 만든 초안이다.",
  "재생성 답변이 기준 답변의 핵심 사실·판단·확인 유보(가격/계약/환불/개인정보/장애 원인 등은 확정 전 유보)를 지키면 pass 다.",
  "핵심 사실이 어긋나거나, 기준이 유보한 것을 단정하거나, 기준이 담은 중요한 근거·확인 절차를 빠뜨리면 needs_fix 다.",
  "문체·길이·표현 차이만으로는 needs_fix 로 판정하지 않는다. 사실 정합과 안전 경계를 기준으로 판단한다.",
].join("\n")

function excerpt(text: string) {
  return text.replace(/\s+/g, " ").trim().slice(0, EXCERPT_LENGTH)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "알 수 없는 오류"
}

function clampLimit(limit: number | undefined) {
  const parsed = Math.trunc(limit ?? REGRESSION_EVAL_DEFAULT_LIMIT)
  const positive = Number.isFinite(parsed) && parsed > 0 ? parsed : REGRESSION_EVAL_DEFAULT_LIMIT
  return Math.min(positive, REGRESSION_EVAL_MAX_LIMIT)
}

/**
 * 기준 정답: 검토 수정본(corrected_content) 우선. 없으면 승인(approved)된 답변은 원문 자체를
 * 담당자가 인정한 정답으로 본다. 그 외(수정본 없는 changes_requested/rejected)는 기준이 없어 스킵한다.
 */
export function referenceAnswerFor(candidate: InternalCsRegressionEvalCandidate): string | null {
  const corrected = candidate.correctedContent?.trim()
  if (corrected) return corrected
  if (candidate.reviewState === "approved") {
    const content = candidate.content?.trim()
    if (content) return content
  }
  return null
}

export async function runInternalCsRegressionEval(
  input: { messageIds?: string[]; limit?: number },
  deps: RegressionEvalDeps
): Promise<RegressionEvalResult> {
  const limit = clampLimit(input.limit)
  const candidates = await deps.loadCandidates({ messageIds: input.messageIds, limit })

  const items: RegressionEvalItem[] = []
  const skipped: RegressionEvalSkipped[] = []

  for (const candidate of candidates) {
    const reference = referenceAnswerFor(candidate)
    if (!reference) {
      skipped.push({
        messageId: candidate.messageId,
        reason: "검토 수정본(corrected_content)이 없어 기준 정답을 만들 수 없습니다",
      })
      continue
    }

    try {
      const regeneration = await deps.regenerate(candidate)
      if (!regeneration.answer.trim()) {
        skipped.push({ messageId: candidate.messageId, reason: "재생성 결과가 비어 있습니다" })
        continue
      }
      if (regeneration.origin === "deterministic") {
        skipped.push({
          messageId: candidate.messageId,
          reason: "재생성이 모델 실패로 결정적 폴백을 반환해 평가에서 제외합니다",
        })
        continue
      }

      const judgement = await deps.judge({
        question: regeneration.question,
        reference,
        regenerated: regeneration.answer,
      })
      if (!judgement) {
        skipped.push({ messageId: candidate.messageId, reason: "심판 모델을 호출하지 못했습니다" })
        continue
      }

      items.push({
        messageId: candidate.messageId,
        conversationId: candidate.conversationId,
        suggestedOutcome: judgement.outcome,
        rationale: judgement.rationale,
        regeneratedExcerpt: excerpt(regeneration.answer),
        judgeModel: judgement.model,
      })
    } catch (error) {
      skipped.push({ messageId: candidate.messageId, reason: errorMessage(error) })
    }
  }

  return { items, skipped }
}

// ─── 기본 배선(라우트가 쓰는 실제 구현) ───────────────────────

// generate 라우트와 동일한 규칙으로 원 질문을 찾는다: metadata.userMessageId 우선, 없으면 선행 user 메시지.
function resolveOriginalQuestion(
  messages: InternalCsMessageRow[],
  candidate: InternalCsRegressionEvalCandidate
): string | null {
  const linkedId =
    typeof candidate.metadata.userMessageId === "string" ? candidate.metadata.userMessageId : null
  const linked = linkedId
    ? messages.find((message) => message.id === linkedId && message.role === "user")
    : undefined
  if (linked?.content.trim()) return linked.content

  const messageIndex = messages.findIndex((message) => message.id === candidate.messageId)
  const preceding = messageIndex >= 0 ? messages.slice(0, messageIndex) : messages
  for (let index = preceding.length - 1; index >= 0; index -= 1) {
    const entry = preceding[index]
    if (entry.role === "user" && entry.content.trim()) return entry.content
  }
  return null
}

// generate 라우트의 buildApprovedHistory 와 동일 규칙. 단, 후보 메시지 이전 턴만 사용한다(자기 자신 제외).
function buildPriorApprovedHistory(
  messages: InternalCsMessageRow[],
  candidate: InternalCsRegressionEvalCandidate
): InternalCsChatTurn[] {
  const messageIndex = messages.findIndex((message) => message.id === candidate.messageId)
  const prior = messageIndex >= 0 ? messages.slice(0, messageIndex) : messages
  return prior
    .filter((message) => {
      if (message.role === "user") return true
      return message.role === "assistant" && message.review_state === "approved"
    })
    .slice(-MAX_HISTORY_TURNS)
    .map((message) => ({
      role: message.role === "assistant" ? ("model" as const) : ("user" as const),
      text:
        message.role === "assistant" && message.corrected_content
          ? message.corrected_content
          : message.content,
    }))
}

/**
 * 후보 1건을 프로덕션 경로와 동일하게 재생성한다(텍스트 파이프라인 충실 재현).
 * 첨부 이미지 근거는 회귀 텍스트 평가에서 드물고 불가침 generate 라우트 결합을 피하려 제외한다.
 */
export async function regenerateForCandidate(
  candidate: InternalCsRegressionEvalCandidate
): Promise<RegressionRegeneration> {
  const loaded = await getInternalCsConversation(candidate.conversationId)
  if (!loaded) throw new Error("대화를 찾을 수 없습니다")

  const question = resolveOriginalQuestion(loaded.messages, candidate)
  if (!question) throw new Error("원 질문을 찾을 수 없습니다")

  const copilotContext = await buildInternalCsCopilotContext(question, {
    queueTags: loaded.conversation.tags,
    includeInternalDocs: true,
  })

  const normalizedTopic = normalizeTopicTags([...loaded.conversation.tags])
  const queueContext = [
    "[현재 상담 큐]",
    `우선순위: ${loaded.conversation.priority}`,
    `태그: ${loaded.conversation.tags.join(", ") || "없음"}`,
    normalizedTopic ? `정규화 주제: ${normalizedTopic}` : "",
    copilotContext.curatedEvidence.recommendedTags.length
      ? `권장 분류 태그(담당자 확인 전 미적용): ${copilotContext.curatedEvidence.recommendedTags.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n")

  const requestedModeRaw = candidate.metadata.requestedMode
  const requestedMode: InternalCsRequestedMode =
    requestedModeRaw === "fast" || requestedModeRaw === "deep" || requestedModeRaw === "auto"
      ? requestedModeRaw
      : "auto"
  const requiresEvidenceReview =
    candidate.metadata.requiresEvidenceReview === true || copilotContext.curatedEvidence.reviewRequired

  const generation = await generateInternalCsAnswer({
    question,
    requestedMode,
    riskLevel:
      loaded.conversation.priority === "urgent" || loaded.conversation.priority === "high"
        ? "high"
        : "low",
    requiresEvidenceReview,
    internalContext: [copilotContext.internalContext, queueContext].filter(Boolean).join("\n\n"),
    sourceRefs: copilotContext.sourceRefs,
    history: buildPriorApprovedHistory(loaded.messages, candidate),
    deterministicFallback: copilotContext.deterministicFallback,
  })

  return { question, answer: generation.answer, origin: generation.origin }
}

/** eval.ts judge 패턴을 따른 LLM 심판. 키/네트워크/파싱 실패는 전부 null 로 흡수해 항목을 skipped 로 넘긴다. */
export async function judgeRegression(input: {
  question: string
  reference: string
  regenerated: string
}): Promise<RegressionJudgement | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return null

  const body = {
    systemInstruction: { parts: [{ text: JUDGE_SYSTEM_INSTRUCTION }] },
    contents: [
      {
        role: "user",
        parts: [
          {
            text: [
              `질문:\n${input.question}`,
              `기준 답변(담당자 확정 정답):\n${input.reference}`,
              `재생성 답변(현재 모델 초안):\n${input.regenerated}`,
              "위 재생성 답변을 기준 답변에 비추어 pass/needs_fix 로 판정하고, 사유를 한국어 한두 문장으로 적어라.",
            ].join("\n\n"),
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "object",
        properties: {
          outcome: { type: "string", enum: ["pass", "needs_fix"] },
          rationale: { type: "string" },
        },
        required: ["outcome", "rationale"],
      },
      temperature: 0,
    },
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${JUDGE_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify(body),
      }
    )
    if (!response.ok) {
      console.warn(`[regression-judge] ${JUDGE_MODEL} 응답 실패 — HTTP ${response.status}`)
      return null
    }
    const data = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const text = data.candidates?.[0]?.content?.parts
      ?.map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
      .trim()
    if (!text) {
      console.warn(`[regression-judge] ${JUDGE_MODEL} 응답에 판정 텍스트가 없습니다`)
      return null
    }

    const parsed = JSON.parse(text) as { outcome?: unknown; rationale?: unknown }
    const outcome =
      parsed.outcome === "pass" || parsed.outcome === "needs_fix" ? parsed.outcome : null
    if (!outcome) {
      console.warn(`[regression-judge] 판정 파싱 불가 — outcome 값이 pass/needs_fix 가 아닙니다`)
      return null
    }
    const rationale =
      typeof parsed.rationale === "string" && parsed.rationale.trim()
        ? parsed.rationale.trim()
        : "(사유 없음)"
    return { outcome, rationale, model: JUDGE_MODEL }
  } catch (error) {
    console.warn(
      `[regression-judge] 심판 호출 실패: ${error instanceof Error ? error.message : String(error)}`
    )
    return null
  }
}

/** 라우트가 쓰는 실제 의존성 묶음. 어느 것도 DB 를 변경하지 않는다(조회 + LLM 호출만). */
export function createDefaultRegressionEvalDeps(): RegressionEvalDeps {
  return {
    loadCandidates: (input) => listInternalCsRegressionEvalCandidates(input),
    regenerate: (candidate) => regenerateForCandidate(candidate),
    judge: (input) => judgeRegression(input),
  }
}
