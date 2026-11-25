// 운영 데스크(CS 코파일럿 · 운영 도구 탭)의 순수 로직.
// 스탯 스트립 집계와 회귀 판정 메타를 UI에서 분리해 노드 환경 테스트로 계약을 고정한다.

import { checkFinalAnswer } from "@/lib/internal-cs-chat/answer-checks"
import { isSameAsOriginal } from "@/lib/internal-cs-chat/review-guard"

import type { InternalCsMessage, ReviewChecks } from "./types"

export interface DocsGapsDeskSummary {
  chatbot: number
  internalCs: number
  internalCsFallback: number
  internalCsReview: number
  zeroResult: number
  capped: boolean
}

interface DocsGapsBacklogLike {
  gapClusters?: Array<{ metadata?: { source?: string } | null } | null> | null
  zeroResultSearches?: unknown[] | null
}

// 검토 드로어의 고객 전달 경계 — AI 초안(content)은 내부 분석이고, 고객에게 나가는 문안은
// 담당자가 따로 쓴 corrected_content 뿐이다.
interface ReviewMessageLike {
  content: string
  corrected_content?: string | null
}

// 최종 답변 칸 초기값: 이미 확정된 교정본만 복원하고, AI 내부 분석으로는 미리 채우지 않는다.
export function initialCustomerDraft(message: ReviewMessageLike | null | undefined) {
  return message?.corrected_content?.trim() || ""
}

// 저장할 교정본: 승인은 작성된 문안 그대로(비면 undefined → 승인 차단), 수정 요청은 원본과
// 공백 정규화 후 같으면 undefined — 손대지 않은 모델 초안이 회귀 기준 답안으로 채택되지 않게 한다.
export function correctedContentForReview(input: {
  decision: "approved" | "changes_requested"
  draft: string
  original: string
}) {
  const draft = input.draft.trim()
  if (!draft) return undefined
  if (input.decision === "approved") return draft

  const normalizedDraft = draft.replace(/\s+/g, " ")
  const normalizedOriginal = input.original.replace(/\s+/g, " ").trim()
  return normalizedDraft === normalizedOriginal ? undefined : draft
}

// GET /api/admin/docs/gaps 는 최대 30개 클러스터를 돌려준다 — 그 이상은 "30+"로 표기한다.
const DOCS_GAPS_FETCH_CAP = 30

export function summarizeDocsGaps(backlog: DocsGapsBacklogLike): DocsGapsDeskSummary {
  const clusters = Array.isArray(backlog.gapClusters) ? backlog.gapClusters : []
  let internalCsFallback = 0
  let internalCsReview = 0

  for (const cluster of clusters) {
    const source = cluster?.metadata?.source
    if (source === "internal_cs_fallback") internalCsFallback += 1
    else if (source === "internal_cs_review") internalCsReview += 1
  }

  const internalCs = internalCsFallback + internalCsReview
  return {
    // source 미기록(레거시) 클러스터는 공개 챗봇 유입으로 집계한다.
    chatbot: clusters.length - internalCs,
    internalCs,
    internalCsFallback,
    internalCsReview,
    zeroResult: Array.isArray(backlog.zeroResultSearches) ? backlog.zeroResultSearches.length : 0,
    capped: clusters.length >= DOCS_GAPS_FETCH_CAP,
  }
}

export type RegressionJudgeValue = "pass" | "needs_fix" | "promoted" | "excluded"

// DESIGN.md — 행 내 빠른 액션은 기본 중립, hover에서만 의도색을 드러낸다.
export const REGRESSION_JUDGE_ACTIONS: Array<{
  value: RegressionJudgeValue
  label: string
  hoverClassName: string
}> = [
  { value: "pass", label: "통과", hoverClassName: "hover:bg-[#ECFDF5] hover:text-[#084734]" },
  { value: "needs_fix", label: "수정 필요", hoverClassName: "hover:bg-[#FBF1E0] hover:text-[#7A520F]" },
  { value: "promoted", label: "반영됨", hoverClassName: "hover:bg-[#084734] hover:text-white" },
  { value: "excluded", label: "제외", hoverClassName: "hover:bg-[#F6F5F4] hover:text-[#615D59]" },
]

// 판정 완료 행의 결과 칩 — 미판정(not_evaluated)은 칩 대신 판정 세그먼트를 보여준다.
const REGRESSION_OUTCOME_CHIPS: Record<RegressionJudgeValue, { label: string; className: string }> = {
  pass: { label: "통과", className: "bg-[#ECFDF5] text-[#084734]" },
  needs_fix: { label: "수정 필요", className: "bg-[#FBF1E0] text-[#7A520F]" },
  promoted: { label: "반영됨", className: "bg-[#ECFDF5] text-[#084734]" },
  excluded: { label: "제외", className: "bg-[#F6F5F4] text-[#615D59]" },
}

export function regressionOutcomeChip(outcome: string) {
  if (outcome === "pass" || outcome === "needs_fix" || outcome === "promoted" || outcome === "excluded") {
    return REGRESSION_OUTCOME_CHIPS[outcome]
  }
  return null
}

// ── 검토 드로어 승인 조건(IC-04·IC-26) ─────────────────────────────────────────

export interface ReviewWarningLike {
  code: string
  severity: "high" | "medium"
  label: string
  excerpt: string
}

/** 서버(generate)가 metadata.reviewWarnings 에 남긴 답 후검사 결과를 검증해 꺼낸다. 모양이 틀린 항목은 버린다. */
export function readReviewWarnings(message: Pick<InternalCsMessage, "metadata"> | null | undefined): ReviewWarningLike[] {
  const raw = message?.metadata?.reviewWarnings
  if (!Array.isArray(raw)) return []
  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const value = item as Record<string, unknown>
    if (typeof value.code !== "string" || typeof value.label !== "string") return []
    return [{
      code: value.code,
      severity: value.severity === "high" ? ("high" as const) : ("medium" as const),
      label: value.label,
      excerpt: typeof value.excerpt === "string" ? value.excerpt : "",
    }]
  })
}

export interface ReviewApprovalState {
  canApprove: boolean
  /** 승인 버튼이 꺼진 이유 한 줄. 켜져 있으면 null. 화면이 버튼 곁에 그대로 적는다. */
  reason: string | null
}

export function reviewApprovalState(input: {
  checks: ReviewChecks
  warningCount: number
  hasPending: boolean
  finalDraft: string
  original: string | null | undefined
}): ReviewApprovalState {
  if (!input.hasPending) return { canApprove: false, reason: "검토 대기 초안이 없습니다." }
  const draft = input.finalDraft.trim()
  if (!draft) return { canApprove: false, reason: "고객 전달용 최종 답변을 먼저 작성해 주세요." }
  if (input.original && isSameAsOriginal(draft, input.original)) {
    return { canApprove: false, reason: "최종 답변이 AI 초안과 같습니다. 고객용으로 고쳐 써 주세요." }
  }
  // 최종본 재검사(검토 안전-3) — 승인 라우트와 같은 함수. 내부 표시는 확인으로 넘길 수 없다.
  const finalCheck = checkFinalAnswer(draft)
  if (finalCheck.internalMarkers.length > 0) {
    return { canApprove: false, reason: `최종 답에 내부 표시가 남아 있습니다(${finalCheck.internalMarkers.join(", ")}).` }
  }
  if (!input.checks.customer || !input.checks.evidence || !input.checks.externalScope) {
    return { canApprove: false, reason: "확인 3종을 모두 체크해 주세요." }
  }
  if ((input.warningCount > 0 || finalCheck.warnings.length > 0) && !input.checks.warnings) {
    return { canApprove: false, reason: "검토 경고를 읽고 확인했는지 체크해 주세요." }
  }
  return { canApprove: true, reason: null }
}

/** 검토 대기 초안을 오래된 순서로. 가장 마지막이 최신이다(드로어는 최신을 연다). */
export function pendingDrafts(messages: InternalCsMessage[]) {
  return messages.filter((message) => message.role === "assistant" && message.review_state === "pending")
}

/** 이 초안이 모델 실패로 만든 대체 글인가(IC-03). */
export function isDeterministicDraft(message: Pick<InternalCsMessage, "metadata"> | null | undefined) {
  return message?.metadata?.origin === "deterministic"
}

export function readFailureKinds(message: Pick<InternalCsMessage, "metadata"> | null | undefined): string[] {
  const raw = message?.metadata?.failureKinds
  return Array.isArray(raw) ? raw.filter((kind): kind is string => typeof kind === "string") : []
}

// ── 대화 스레드 표시(IC-10·IC-25) ─────────────────────────────────────────────────

import { extractCustomerContextFields } from "@/lib/internal-cs-chat/customer-context"
import { redactInternalCsDraft } from "@/lib/internal-cs-chat/redact"

/** generate 라우트가 맥락 비우기 때 저장하는 경계 행의 metadata.kind (lib/internal-cs-chat/history.ts 와 같은 값). */
export const CONTEXT_RESET_KIND = "copilot_context_reset"

export function isContextResetMessage(message: Pick<InternalCsMessage, "role" | "metadata">) {
  return message.role === "system" && message.metadata?.kind === CONTEXT_RESET_KIND
}

/** 마지막 맥락 경계의 위치. 없으면 -1. */
export function lastContextBoundaryIndex(messages: Array<Pick<InternalCsMessage, "role" | "metadata">>) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (isContextResetMessage(messages[index])) return index
  }
  return -1
}

/** 마지막 경계 뒤의 질문(user) 수. '맥락 비우기' 버튼은 1개 이상일 때만 보인다. */
export function turnsSinceBoundary(messages: Array<Pick<InternalCsMessage, "role" | "metadata">>) {
  const start = lastContextBoundaryIndex(messages) + 1
  return messages.slice(start).filter((message) => message.role === "user").length
}

export type MessageSpeakerKind = "customer" | "staff" | "ai" | "external_ai" | "external_note" | "note" | "hq_reply" | "system"

const BRIDGE_SYSTEM_LABELS: Record<string, string> = {
  "channel-talk": "채널톡",
  channel_talk: "채널톡",
  channeltalk: "채널톡",
}

function bridgeLabel(message: Pick<InternalCsMessage, "metadata">) {
  const raw = message.metadata?.bridgeSourceSystem
  if (typeof raw !== "string" || !raw.trim()) return null
  return BRIDGE_SYSTEM_LABELS[raw.trim().toLowerCase()] ?? raw.trim().slice(0, 24)
}

/**
 * 메시지 머리에 적을 주인. 브리지가 넣은 글(metadata.bridgeEventId)은 외부에서 온 것이고,
 * 그 밖의 user 글은 담당자가 코파일럿에 한 질문이다.
 */
export function describeMessageSpeaker(
  message: Pick<InternalCsMessage, "role" | "metadata">
): { kind: MessageSpeakerKind; label: string } {
  const bridged = Boolean(message.metadata?.bridgeEventId) || Boolean(message.metadata?.bridgeSourceSystem)
  const channel = bridgeLabel(message)
  switch (message.role) {
    case "user":
      return bridged
        ? { kind: "customer", label: channel ? `고객 · ${channel}` : "고객" }
        : { kind: "staff", label: "담당자 질문" }
    case "assistant":
      return bridged
        ? { kind: "external_ai", label: channel ? `외부 AI 초안 · ${channel}` : "외부 AI 초안" }
        : { kind: "ai", label: "AI 초안" }
    case "internal_note":
      if (message.metadata?.kind === "hq_reply") return { kind: "hq_reply", label: "본사 회신(참고)" }
      return bridged
        ? { kind: "external_note", label: "외부 AI 관찰" }
        : { kind: "note", label: "내부 메모" }
    default:
      return { kind: "system", label: "시스템" }
  }
}

const CONTEXT_SOURCE_LABELS: Record<string, string> = {
  public_chatbot: "공개 챗봇",
  chatbot: "공개 챗봇",
  channel_talk: "채널톡",
  "channel-talk": "채널톡",
  channeltalk: "채널톡",
}

export interface ContextCardData {
  source: string | null
  summary: string | null
  lastQuestion: string | null
  institution: string | null
  /** 사이트 안 문서 경로("/docs/...")만. 바깥 주소·상대 경로는 버린다. */
  documents: string[]
}

function readDocumentPaths(context: Record<string, unknown>) {
  const raw: unknown[] = []
  for (const key of ["chatbotSources", "sources", "documents"]) {
    const value = context[key]
    if (Array.isArray(value)) raw.push(...value)
  }
  if (typeof context.page === "string") raw.push(context.page)
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== "string") continue
    const path = item.trim().split("#")[0]
    if (!path.startsWith("/") || path.startsWith("//") || path.length > 200) continue
    seen.add(path)
    if (seen.size >= 5) break
  }
  return [...seen]
}

/** customer_context 를 '상담 맥락' 카드에 보일 칸으로 줄인다. 모든 글은 가림을 거치고, 값이 하나도 없으면 null(카드를 숨긴다). */
export function readContextCard(context: unknown): ContextCardData | null {
  if (!context || typeof context !== "object" || Array.isArray(context)) return null
  const record = context as Record<string, unknown>
  const fields = extractCustomerContextFields(record)
  const documents = readDocumentPaths(record)
  const sourceKey = fields.source?.toLowerCase() ?? null
  // 공개 챗봇 브리지는 요약을 chatbotSummary 로 넘긴다 — 공용 추출기의 이름 목록에 없어 여기서 한 번 더 본다.
  const botSummary = typeof record.chatbotSummary === "string" && record.chatbotSummary.trim()
    ? redactInternalCsDraft(record.chatbotSummary.trim().replace(/\s+/g, " ").slice(0, 200)).text
    : null
  const card: ContextCardData = {
    source: fields.source ? CONTEXT_SOURCE_LABELS[sourceKey ?? ""] ?? fields.source : null,
    summary: fields.summary ?? botSummary,
    lastQuestion: fields.previousQuestion,
    institution: fields.institution,
    documents,
  }
  const any = card.source || card.summary || card.lastQuestion || card.institution || card.documents.length > 0
  return any ? card : null
}

/**
 * 질문 보내기가 실패한 뒤, 서버가 무엇을 이미 저장했는지 본다(검토 동작-4).
 * generate 라우트는 맥락 비우기 경계 행과 사용자 질문을 모델 호출 전에 저장하므로, 뒤에서 실패해도 남아 있을 수 있다.
 * 보내기 전의 메시지 id 목록(knownIds)에 없던 행 중 같은 질문(user)·경계 행이 있으면 저장된 것으로 본다.
 * 질문이 저장됐으면 입력창에 돌려놓지 않는다(다시 보내면 같은 질문·경계 행이 두 번 저장된다).
 */
export function failedSendOutcome(
  knownIds: ReadonlySet<string>,
  messagesAfter: ReadonlyArray<Pick<InternalCsMessage, "id" | "role" | "content" | "metadata">>,
  question: string
) {
  const fresh = messagesAfter.filter((message) => !knownIds.has(message.id))
  return {
    questionSaved: fresh.some((message) => message.role === "user" && message.content.trim() === question.trim()),
    resetSaved: fresh.some((message) => isContextResetMessage(message)),
  }
}

