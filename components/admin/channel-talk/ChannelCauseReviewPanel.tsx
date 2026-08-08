"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
} from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"

export type CauseReviewState = "pending" | "approved" | "rejected"
export type CauseConfidenceState = "unresolved" | "suspected" | "confirmed"
export type CauseOutcomeStatus =
  | "unknown"
  | "solution_provided"
  | "customer_confirmed_resolved"
  | "still_unresolved"

export interface ChannelCauseTranscriptMessage {
  id: string
  author: "customer" | "agent" | "bot"
  text: string
  at: string
}

export interface ChannelCauseSuggestion {
  candidateKey: string
  ruleId: string
  symptom: string
  actualCause: string | null
  causeState: CauseConfidenceState
  outcomeStatus: CauseOutcomeStatus
  diagnosticQuestions: string[]
  resolution: string | null
  evidenceMessageIds: string[]
  suggestedTags: string[]
  hasVisualEvidenceMention: boolean
}

export interface ChannelCauseCase {
  id: string
  conversationId: string
  candidateKey: string
  reviewState: CauseReviewState
  causeState: CauseConfidenceState
  outcomeStatus: CauseOutcomeStatus
  surfaceSymptom: string
  actualCause: string | null
  diagnosticQuestions: string[]
  resolution: string | null
  evidenceMessageIds: string[]
  linkedGuideSlug: string | null
  sourceLastMessageAt: string | null
  reviewedBy: string | null
  reviewedAt: string | null
}

interface CauseReviewResponse {
  conversation: {
    id?: string
    firstQuestion?: string
    [key: string]: unknown
  }
  transcript: ChannelCauseTranscriptMessage[]
  suggestions: ChannelCauseSuggestion[]
  cases: ChannelCauseCase[]
  storageReady: boolean
  warning: string | null
}

interface CauseReviewForm {
  candidateKey: string
  reviewState: CauseReviewState
  causeState: CauseConfidenceState
  outcomeStatus: CauseOutcomeStatus
  surfaceSymptom: string
  actualCause: string
  diagnosticQuestionsText: string
  resolution: string
  evidenceMessageIds: string[]
  linkedGuideSlug: string
}

const REVIEW_STATE_OPTIONS: Array<{ value: CauseReviewState; label: string }> = [
  { value: "pending", label: "검토 중" },
  { value: "approved", label: "승인" },
  { value: "rejected", label: "제외" },
]

const CAUSE_STATE_OPTIONS: Array<{ value: CauseConfidenceState; label: string }> = [
  { value: "unresolved", label: "미확인" },
  { value: "suspected", label: "추정" },
  { value: "confirmed", label: "확정" },
]

const OUTCOME_STATUS_OPTIONS: Array<{ value: CauseOutcomeStatus; label: string }> = [
  { value: "unknown", label: "결과 미확인" },
  { value: "solution_provided", label: "해결 방법 안내" },
  { value: "customer_confirmed_resolved", label: "고객 해결 확인" },
  { value: "still_unresolved", label: "아직 미해결" },
]

const EMPTY_FORM: CauseReviewForm = {
  candidateKey: "",
  reviewState: "pending",
  causeState: "unresolved",
  outcomeStatus: "unknown",
  surfaceSymptom: "",
  actualCause: "",
  diagnosticQuestionsText: "",
  resolution: "",
  evidenceMessageIds: [],
  linkedGuideSlug: "",
}

export function isCauseReviewApprovalReady(input: {
  reviewState: CauseReviewState
  causeState: CauseConfidenceState
  actualCause: string
  evidenceMessageIds: string[]
}) {
  if (input.reviewState !== "approved" || input.causeState !== "confirmed") return true
  return input.actualCause.trim().length > 0 && input.evidenceMessageIds.length > 0
}

function toFormFromCase(reviewCase: ChannelCauseCase): CauseReviewForm {
  return {
    candidateKey: reviewCase.candidateKey,
    reviewState: reviewCase.reviewState,
    causeState: reviewCase.causeState,
    outcomeStatus: reviewCase.outcomeStatus,
    surfaceSymptom: reviewCase.surfaceSymptom,
    actualCause: reviewCase.actualCause ?? "",
    diagnosticQuestionsText: reviewCase.diagnosticQuestions.join("\n"),
    resolution: reviewCase.resolution ?? "",
    evidenceMessageIds: reviewCase.evidenceMessageIds,
    linkedGuideSlug: reviewCase.linkedGuideSlug ?? "",
  }
}

function toFormFromSuggestion(suggestion: ChannelCauseSuggestion): CauseReviewForm {
  return {
    candidateKey: suggestion.candidateKey,
    reviewState: "pending",
    causeState: suggestion.causeState,
    outcomeStatus: suggestion.outcomeStatus,
    surfaceSymptom: suggestion.symptom,
    actualCause: suggestion.actualCause ?? "",
    diagnosticQuestionsText: suggestion.diagnosticQuestions.join("\n"),
    resolution: suggestion.resolution ?? "",
    evidenceMessageIds: suggestion.evidenceMessageIds,
    linkedGuideSlug: "",
  }
}

function manualForm(firstQuestion?: string): CauseReviewForm {
  return {
    ...EMPTY_FORM,
    candidateKey: "manual",
    surfaceSymptom: firstQuestion?.trim() ?? "",
  }
}

function reviewCandidateOptions(
  suggestions: ChannelCauseSuggestion[],
  cases: ChannelCauseCase[]
) {
  const labels = new Map<string, string>([["manual", "수동 검토"]])
  for (const suggestion of suggestions) {
    labels.set(
      suggestion.candidateKey,
      suggestion.actualCause?.trim() || suggestion.symptom.trim() || suggestion.candidateKey
    )
  }
  for (const reviewCase of cases) {
    if (!labels.has(reviewCase.candidateKey)) {
      labels.set(
        reviewCase.candidateKey,
        reviewCase.actualCause?.trim() || reviewCase.surfaceSymptom.trim() || reviewCase.candidateKey
      )
    }
  }
  return [...labels.entries()].map(([value, label]) => ({ value, label }))
}

function authorLabel(author: ChannelCauseTranscriptMessage["author"]) {
  if (author === "customer") return "고객"
  if (author === "agent") return "상담원"
  return "봇"
}

function formatMessageAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function lines(value: string) {
  return [...new Set(value.split("\n").map((item) => item.trim()).filter(Boolean))]
}

export default function ChannelCauseReviewPanel({
  conversationId,
}: {
  conversationId: string
}) {
  const [data, setData] = useState<CauseReviewResponse | null>(null)
  const [form, setForm] = useState<CauseReviewForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const endpoint = `/api/admin/channel-talk/conversations/${encodeURIComponent(conversationId)}/cases`

  async function load() {
    setLoading(true)
    setError(null)
    setNotice(null)
    try {
      const response = await adminFetchJson<CauseReviewResponse>(endpoint)
      const suggestions = Array.isArray(response.suggestions) ? response.suggestions : []
      const cases = Array.isArray(response.cases) ? response.cases : []
      const transcript = Array.isArray(response.transcript) ? response.transcript : []
      const normalized = { ...response, suggestions, cases, transcript }
      setData(normalized)

      const firstCase = cases[0]
      const firstSuggestion = suggestions[0]
      setForm(
        firstCase
          ? toFormFromCase(firstCase)
          : firstSuggestion
            ? toFormFromSuggestion(firstSuggestion)
            : manualForm(response.conversation?.firstQuestion)
      )
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "원인 검토 자료를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // conversationId가 바뀌면 새 패널의 자료를 처음부터 읽는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId])

  const candidateOptions = useMemo(
    () => reviewCandidateOptions(data?.suggestions ?? [], data?.cases ?? []),
    [data?.cases, data?.suggestions]
  )

  const selectedSuggestion = useMemo(
    () => data?.suggestions.find((item) => item.candidateKey === form.candidateKey) ?? null,
    [data?.suggestions, form.candidateKey]
  )

  const approvalReady = isCauseReviewApprovalReady(form)

  function selectCandidate(candidateKey: string) {
    const existing = data?.cases.find((item) => item.candidateKey === candidateKey)
    if (existing) {
      setForm(toFormFromCase(existing))
    } else {
      const suggestion = data?.suggestions.find((item) => item.candidateKey === candidateKey)
      setForm(
        suggestion
          ? toFormFromSuggestion(suggestion)
          : candidateKey === "manual"
            ? manualForm(data?.conversation.firstQuestion)
            : { ...EMPTY_FORM, candidateKey }
      )
    }
    setError(null)
    setNotice(null)
  }

  function toggleEvidence(messageId: string) {
    setForm((current) => ({
      ...current,
      evidenceMessageIds: current.evidenceMessageIds.includes(messageId)
        ? current.evidenceMessageIds.filter((id) => id !== messageId)
        : [...current.evidenceMessageIds, messageId],
    }))
  }

  async function saveReview() {
    if (!form.candidateKey) {
      setError("저장할 원인 후보가 없습니다.")
      return
    }
    if (!approvalReady) {
      setError("승인된 확정 원인에는 실제 원인과 근거 메시지가 모두 필요합니다.")
      return
    }

    setSaving(true)
    setError(null)
    setNotice(null)
    try {
      const response = await adminFetchJson<{ case: ChannelCauseCase }>(endpoint, {
        method: "PATCH",
        body: JSON.stringify({
          candidateKey: form.candidateKey,
          reviewState: form.reviewState,
          causeState: form.causeState,
          outcomeStatus: form.outcomeStatus,
          surfaceSymptom: form.surfaceSymptom,
          actualCause: form.actualCause,
          diagnosticQuestions: lines(form.diagnosticQuestionsText),
          resolution: form.resolution,
          evidenceMessageIds: form.evidenceMessageIds,
          linkedGuideSlug: form.linkedGuideSlug.trim() || null,
        }),
      })
      const saved = response.case
      setData((current) => {
        if (!current) return current
        const cases = current.cases.some((item) => item.candidateKey === saved.candidateKey)
          ? current.cases.map((item) => (item.candidateKey === saved.candidateKey ? saved : item))
          : [saved, ...current.cases]
        return { ...current, cases }
      })
      setForm(toFormFromCase(saved))
      setNotice("원인 검토 결과를 저장했습니다. 승인만으로 챗봇에 자동 반영되지는 않습니다.")
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "원인 검토 결과를 저장하지 못했습니다.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center border-t border-black/[0.08] bg-[#FAFAF8] px-5 py-8">
        <p className="inline-flex items-center gap-2 text-[12px] text-[#615D59]">
          <Loader2 className="h-4 w-4 animate-spin" />
          상담 전문과 원인 후보를 불러오는 중…
        </p>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="border-t border-black/[0.08] bg-[#FAFAF8] px-5 py-6">
        <div className="flex items-start justify-between gap-4">
          <p className="text-[12px] text-[#8F2C2C]">{error ?? "원인 검토 자료를 불러오지 못했습니다."}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-black/[0.12] bg-white px-3 text-[11px] font-semibold text-[#31302E] hover:bg-[#F6F5F4]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-t border-black/[0.08] bg-[#FAFAF8] px-4 py-5 sm:px-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-[#A39E98]">Root cause review</p>
          <h3 className="mt-1 text-[14px] font-semibold text-[#111110]">표면 문의와 실제 원인 연결</h3>
          <p className="mt-1 text-[11px] leading-4 text-[#615D59]">
            상담 내용을 근거로 수정하고, 담당자가 확인한 상태만 저장합니다.
          </p>
        </div>
        <a
          href="https://desk.channel.io"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-black/[0.12] bg-white px-3 text-[11px] font-semibold text-[#31302E] hover:bg-[#F6F5F4]"
        >
          채널톡 원본 열기
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      {selectedSuggestion?.hasVisualEvidenceMention ||
      data.transcript.some((message) => /사진|캡처|이미지|스크린샷/i.test(message.text)) ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-[8px] border border-[#ECD29C] bg-[#FBF1E0] px-3.5 py-3 text-[11px] leading-4 text-[#7A520F]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            이 상담에는 사진·캡처 언급이 있습니다. 현재 동기화 데이터에는 첨부 원본이 포함되지 않으므로,
            승인 전에 채널톡 데스크에서 이미지를 직접 확인해 주세요.
          </p>
        </div>
      ) : null}

      {!data.storageReady ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-[8px] border border-[#ECD29C] bg-[#FBF1E0] px-3.5 py-3 text-[11px] leading-4 text-[#7A520F]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            원인 후보는 검토할 수 있지만 저장소 마이그레이션이 아직 적용되지 않아 저장할 수 없습니다.
            {data.warning ? ` ${data.warning}` : ""}
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="min-w-0 overflow-hidden rounded-[10px] border border-black/[0.08] bg-white">
            <div className="border-b border-black/[0.08] px-4 py-3">
              <label htmlFor={`cause-candidate-${conversationId}`} className="text-[11px] font-semibold text-[#31302E]">
                원인 후보
              </label>
              <select
                id={`cause-candidate-${conversationId}`}
                value={form.candidateKey}
                onChange={(event) => selectCandidate(event.target.value)}
                className="mt-2 h-9 w-full rounded-md border border-black/[0.14] bg-white px-2.5 text-[12px] text-[#31302E] outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/10"
              >
                {candidateOptions.map((option, index) => (
                  <option key={option.value} value={option.value}>
                    후보 {index + 1} · {option.label}
                  </option>
                ))}
              </select>
              {selectedSuggestion?.suggestedTags?.length ? (
                <p className="mt-2 text-[10px] text-[#A39E98]">
                  제안 태그 · {selectedSuggestion.suggestedTags.join(" · ")}
                </p>
              ) : null}
            </div>

            <div className="max-h-[600px] overflow-y-auto px-4 py-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-[11px] font-semibold text-[#31302E]">상담 전문 · 근거 선택</p>
                <span className="text-[10px] text-[#A39E98] tabular-nums">
                  {form.evidenceMessageIds.length}/{data.transcript.length}개 선택
                </span>
              </div>
              {data.transcript.length === 0 ? (
                <p className="py-8 text-center text-[11px] text-[#A39E98]">저장된 상담 메시지가 없습니다.</p>
              ) : (
                <ul className="space-y-1.5">
                  {data.transcript.map((message) => {
                    const checked = form.evidenceMessageIds.includes(message.id)
                    return (
                      <li key={message.id}>
                        <label className="flex cursor-pointer items-start gap-2.5 rounded-[7px] border border-black/[0.06] px-3 py-2.5 hover:bg-[#FAFAF8]">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEvidence(message.id)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[#084734]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2 text-[10px]">
                              <span className={message.author === "agent" ? "font-semibold text-[#084734]" : "font-semibold text-[#615D59]"}>
                                {authorLabel(message.author)}
                              </span>
                              <span className="shrink-0 text-[#A39E98] tabular-nums">{formatMessageAt(message.at)}</span>
                            </span>
                            <span className="mt-1 block whitespace-pre-wrap break-words text-[11px] leading-4 text-[#31302E]">
                              {message.text}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </section>

          <section className="min-w-0 rounded-[10px] border border-black/[0.08] bg-white px-4 py-4 sm:px-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="text-[11px] font-semibold text-[#31302E]">
                검토 상태
                <select
                  value={form.reviewState}
                  onChange={(event) => setForm((current) => ({ ...current, reviewState: event.target.value as CauseReviewState }))}
                  className="mt-1.5 h-9 w-full rounded-md border border-black/[0.14] bg-white px-2.5 text-[12px] font-normal outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/10"
                >
                  {REVIEW_STATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-[#31302E]">
                원인 확정도
                <select
                  value={form.causeState}
                  onChange={(event) => setForm((current) => ({ ...current, causeState: event.target.value as CauseConfidenceState }))}
                  className="mt-1.5 h-9 w-full rounded-md border border-black/[0.14] bg-white px-2.5 text-[12px] font-normal outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/10"
                >
                  {CAUSE_STATE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="text-[11px] font-semibold text-[#31302E]">
                해결 결과
                <select
                  value={form.outcomeStatus}
                  onChange={(event) => setForm((current) => ({ ...current, outcomeStatus: event.target.value as CauseOutcomeStatus }))}
                  className="mt-1.5 h-9 w-full rounded-md border border-black/[0.14] bg-white px-2.5 text-[12px] font-normal outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/10"
                >
                  {OUTCOME_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
            </div>

            <div className="mt-4 space-y-3.5">
              <label className="block text-[11px] font-semibold text-[#31302E]">
                표면 증상
                <textarea
                  value={form.surfaceSymptom}
                  onChange={(event) => setForm((current) => ({ ...current, surfaceSymptom: event.target.value }))}
                  rows={2}
                  className="mt-1.5 w-full resize-y rounded-md border border-black/[0.14] px-3 py-2 text-[12px] font-normal leading-5 outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/10"
                />
              </label>
              <label className="block text-[11px] font-semibold text-[#31302E]">
                실제 원인
                <textarea
                  value={form.actualCause}
                  onChange={(event) => setForm((current) => ({ ...current, actualCause: event.target.value }))}
                  rows={3}
                  placeholder="상담원이 확인한 실제 원인을 입력하세요."
                  className="mt-1.5 w-full resize-y rounded-md border border-black/[0.14] px-3 py-2 text-[12px] font-normal leading-5 outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/10"
                />
              </label>
              <label className="block text-[11px] font-semibold text-[#31302E]">
                판별 질문
                <textarea
                  value={form.diagnosticQuestionsText}
                  onChange={(event) => setForm((current) => ({ ...current, diagnosticQuestionsText: event.target.value }))}
                  rows={3}
                  placeholder="질문을 한 줄에 하나씩 입력하세요."
                  className="mt-1.5 w-full resize-y rounded-md border border-black/[0.14] px-3 py-2 text-[12px] font-normal leading-5 outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/10"
                />
              </label>
              <label className="block text-[11px] font-semibold text-[#31302E]">
                해결 방법
                <textarea
                  value={form.resolution}
                  onChange={(event) => setForm((current) => ({ ...current, resolution: event.target.value }))}
                  rows={3}
                  placeholder="실제 적용한 조치와 고객 확인 결과를 적어 주세요."
                  className="mt-1.5 w-full resize-y rounded-md border border-black/[0.14] px-3 py-2 text-[12px] font-normal leading-5 outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/10"
                />
              </label>
              <label className="block text-[11px] font-semibold text-[#31302E]">
                연결 가이드 slug
                <input
                  type="text"
                  value={form.linkedGuideSlug}
                  onChange={(event) => setForm((current) => ({ ...current, linkedGuideSlug: event.target.value }))}
                  placeholder="예: cs-figma-digest-1054"
                  className="mt-1.5 h-9 w-full rounded-md border border-black/[0.14] px-3 text-[12px] font-normal outline-none focus:border-[#084734] focus:ring-2 focus:ring-[#084734]/10"
                />
              </label>
            </div>

            {form.reviewState === "approved" && form.causeState === "confirmed" ? (
              <div className={`mt-4 flex items-start gap-2 rounded-[8px] border px-3 py-2.5 text-[10.5px] leading-4 ${approvalReady ? "border-[#BDEFD8] bg-[#ECFDF5] text-[#084734]" : "border-[#ECD29C] bg-[#FBF1E0] text-[#7A520F]"}`}>
                {approvalReady ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <p>
                  {approvalReady
                    ? "확정 승인에 필요한 실제 원인과 근거 메시지가 준비됐습니다."
                    : "승인된 확정 원인으로 저장하려면 실제 원인과 근거 메시지를 모두 지정해야 합니다."}
                </p>
              </div>
            ) : (
              <p className="mt-4 text-[10.5px] leading-4 text-[#A39E98]">
                추정·미확인 사례는 판별 질문 보강에 참고할 수 있지만, 확정 답변 근거로 자동 사용하지 않습니다.
              </p>
            )}

            {error ? <p role="alert" className="mt-3 text-[11px] text-[#8F2C2C]">{error}</p> : null}
            {notice ? <p role="status" className="mt-3 text-[11px] text-[#084734]">{notice}</p> : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-black/[0.08] pt-4">
              <p className="text-[10px] text-[#A39E98]">저장된 검토는 공개 답변이나 고객 상담으로 자동 전송되지 않습니다.</p>
              <button
                type="button"
                onClick={() => void saveReview()}
                disabled={saving || !data.storageReady || !form.candidateKey || !approvalReady}
                className="inline-flex h-9 items-center gap-2 rounded-md bg-[#084734] px-4 text-[12px] font-semibold text-white transition-colors hover:bg-[#065C41] disabled:cursor-not-allowed disabled:bg-[#A39E98]"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                {saving ? "저장 중…" : "검토 저장"}
              </button>
            </div>
          </section>
      </div>
    </div>
  )
}
