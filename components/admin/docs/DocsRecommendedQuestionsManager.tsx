"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  Archive,
  Bot,
  CircleAlert,
  ExternalLink,
  Plus,
  RefreshCw,
  Save,
  Search,
} from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import type { AdminDocsArticleSummary } from "@/lib/admin-docs"

type RecommendedQuestionStatus = "draft" | "published" | "archived"

interface RecommendedQuestion {
  id: string
  label: string
  prompt: string
  placement: "starter"
  status: RecommendedQuestionStatus
  orderIndex: number
  category: string | null
  mappedArticleId: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

interface RecommendedQuestionsResponse {
  questions: RecommendedQuestion[]
  warning?: string
  error?: string
}

interface RecommendedQuestionDraft {
  label: string
  prompt: string
  status: RecommendedQuestionStatus
  orderIndex: number
  category: string
  mappedArticleId: string
}

interface Props {
  articles: AdminDocsArticleSummary[]
}

const STATUS_OPTIONS: Array<{ value: "all" | RecommendedQuestionStatus; label: string }> = [
  { value: "all", label: "전체" },
  { value: "draft", label: "초안" },
  { value: "published", label: "게시됨" },
  { value: "archived", label: "보관" },
]

const STATUS_LABELS: Record<RecommendedQuestionStatus, string> = {
  draft: "초안",
  published: "게시됨",
  archived: "보관",
}

function getStatusTone(status: RecommendedQuestionStatus) {
  if (status === "published") return "border-emerald-100 bg-emerald-50 text-emerald-700"
  if (status === "archived") return "border-[#e8e8e4] bg-[#f5f5f2] text-[#1a1a1a]/45"
  return "border-amber-100 bg-amber-50 text-amber-700"
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

function toDraft(question: RecommendedQuestion): RecommendedQuestionDraft {
  return {
    label: question.label,
    prompt: question.prompt,
    status: question.status,
    orderIndex: question.orderIndex,
    category: question.category ?? "",
    mappedArticleId: question.mappedArticleId ?? "",
  }
}

function defaultDraft(): RecommendedQuestionDraft {
  return {
    label: "",
    prompt: "",
    status: "draft",
    orderIndex: 100,
    category: "",
    mappedArticleId: "",
  }
}

function isDirty(question: RecommendedQuestion, draft: RecommendedQuestionDraft) {
  return (
    question.label !== draft.label ||
    question.prompt !== draft.prompt ||
    question.status !== draft.status ||
    question.orderIndex !== draft.orderIndex ||
    (question.category ?? "") !== draft.category ||
    (question.mappedArticleId ?? "") !== draft.mappedArticleId
  )
}

function getPromptLabel(prompt: string) {
  const trimmed = prompt.trim()
  return trimmed.length > 64 ? `${trimmed.slice(0, 64).trim()}...` : trimmed
}

export default function DocsRecommendedQuestionsManager({ articles }: Props) {
  const [questions, setQuestions] = useState<RecommendedQuestion[]>([])
  const [drafts, setDrafts] = useState<Record<string, RecommendedQuestionDraft>>({})
  const [newDraft, setNewDraft] = useState<RecommendedQuestionDraft>(() => defaultDraft())
  const [statusFilter, setStatusFilter] = useState<"all" | RecommendedQuestionStatus>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const articlesById = useMemo(() => {
    return new Map(articles.map((article) => [article.id, article]))
  }, [articles])

  const loadQuestions = useCallback(async () => {
    setLoading(true)
    setError(null)
    setWarning(null)

    try {
      const params = new URLSearchParams({ placement: "starter" })
      if (statusFilter !== "all") params.set("status", statusFilter)

      const response = await adminFetchJson<RecommendedQuestionsResponse>(
        `/api/admin/chatbot/recommended-questions?${params.toString()}`
      )
      setQuestions(response.questions ?? [])
      setDrafts(
        Object.fromEntries((response.questions ?? []).map((question) => [question.id, toDraft(question)]))
      )
      setWarning(response.warning ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : "추천 질문을 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    void loadQuestions()
  }, [loadQuestions])

  const visibleQuestions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return questions

    return questions.filter((question) => {
      const article = question.mappedArticleId ? articlesById.get(question.mappedArticleId) : null
      return (
        question.label.toLowerCase().includes(query) ||
        question.prompt.toLowerCase().includes(query) ||
        (question.category ?? "").toLowerCase().includes(query) ||
        (article?.title ?? "").toLowerCase().includes(query)
      )
    })
  }, [articlesById, questions, searchQuery])

  function getDraft(question: RecommendedQuestion) {
    return drafts[question.id] ?? toDraft(question)
  }

  function updateDraft<K extends keyof RecommendedQuestionDraft>(
    id: string,
    key: K,
    value: RecommendedQuestionDraft[K]
  ) {
    const question = questions.find((item) => item.id === id)
    setDrafts((previous) => ({
      ...previous,
      [id]: {
        ...(question ? toDraft(question) : defaultDraft()),
        ...previous[id],
        [key]: value,
      },
    }))
  }

  function updateNewDraft<K extends keyof RecommendedQuestionDraft>(
    key: K,
    value: RecommendedQuestionDraft[K]
  ) {
    setNewDraft((previous) => ({ ...previous, [key]: value }))
  }

  function buildPayload(draft: RecommendedQuestionDraft) {
    const prompt = draft.prompt.trim()
    return {
      label: draft.label.trim() || getPromptLabel(prompt),
      prompt,
      placement: "starter",
      status: draft.status,
      orderIndex: draft.orderIndex,
      category: draft.category.trim() || null,
      mappedArticleId: draft.mappedArticleId || null,
    }
  }

  async function createQuestion() {
    setError(null)
    setNotice(null)

    if (!newDraft.prompt.trim()) {
      setError("새 추천 질문 문구를 입력해 주세요.")
      return
    }

    setCreating(true)
    try {
      const question = await adminFetchJson<RecommendedQuestion>(
        "/api/admin/chatbot/recommended-questions",
        {
          method: "POST",
          body: JSON.stringify(buildPayload(newDraft)),
        }
      )
      setQuestions((previous) => [...previous, question].sort((left, right) => left.orderIndex - right.orderIndex))
      setDrafts((previous) => ({ ...previous, [question.id]: toDraft(question) }))
      setNewDraft(defaultDraft())
      setNotice("추천 질문을 추가했습니다.")
      window.setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "추천 질문을 추가하지 못했습니다.")
    } finally {
      setCreating(false)
    }
  }

  async function saveQuestion(question: RecommendedQuestion, overrides: Partial<RecommendedQuestionDraft> = {}) {
    const nextDraft = { ...getDraft(question), ...overrides }
    if (!nextDraft.prompt.trim()) {
      setError("추천 질문 문구는 비워둘 수 없습니다.")
      return
    }

    setSavingId(question.id)
    setError(null)
    setNotice(null)

    try {
      const updated = await adminFetchJson<RecommendedQuestion>(
        `/api/admin/chatbot/recommended-questions/${question.id}`,
        {
          method: "PATCH",
          body: JSON.stringify(buildPayload(nextDraft)),
        }
      )
      setQuestions((previous) =>
        previous
          .map((item) => (item.id === updated.id ? updated : item))
          .sort((left, right) => left.orderIndex - right.orderIndex)
      )
      setDrafts((previous) => ({ ...previous, [updated.id]: toDraft(updated) }))
      setNotice("추천 질문을 저장했습니다.")
      window.setTimeout(() => setNotice(null), 2500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "추천 질문을 저장하지 못했습니다.")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="border-b border-[#e8e8e4] px-4 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-[#1a1a1a]/35" />
              <h2 className="text-[14px] font-semibold text-[#111110]">추천 질문 관리</h2>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-[#1a1a1a]/40">
              게시된 항목은 공개 상담창의 첫 추천 질문으로 노출됩니다.
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#1a1a1a]/30" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="질문 검색"
                className="h-9 w-full rounded-lg border border-[#e8e8e4] bg-white pr-3 pl-9 text-[13px] outline-none transition-colors placeholder:text-[#1a1a1a]/25 focus:border-[#084734] sm:w-44"
              />
            </label>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as "all" | RecommendedQuestionStatus)}
              className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] text-[#111110] outline-none transition-colors focus:border-[#084734]"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void loadQuestions()}
              disabled={loading}
              title="추천 질문 새로고침"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white text-[#111110] transition-colors hover:bg-[#f5f5f2] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              <span className="sr-only">추천 질문 새로고침</span>
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <div className="border-b border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-[13px] text-[#B85C33]">
          {error}
        </div>
      ) : null}

      {warning ? (
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          <div className="flex gap-2">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{warning}</span>
          </div>
        </div>
      ) : null}

      {notice ? (
        <div className="border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="border-b border-[#f0f0ec] bg-[#fafaf8] px-4 py-4">
        <div className="grid gap-3">
          <input
            value={newDraft.prompt}
            onChange={(event) => updateNewDraft("prompt", event.target.value)}
            placeholder="새 추천 질문 문구"
            className="h-10 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none transition-colors placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
          />
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_96px_112px_auto]">
            <input
              value={newDraft.label}
              onChange={(event) => updateNewDraft("label", event.target.value)}
              placeholder="관리용 라벨"
              className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none transition-colors placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
            />
            <input
              type="number"
              value={newDraft.orderIndex}
              onChange={(event) => updateNewDraft("orderIndex", Number(event.target.value) || 0)}
              aria-label="새 추천 질문 정렬 순서"
              className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none transition-colors focus:border-[#084734]"
            />
            <select
              value={newDraft.status}
              onChange={(event) =>
                updateNewDraft("status", event.target.value as RecommendedQuestionStatus)
              }
              className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none transition-colors focus:border-[#084734]"
            >
              <option value="draft">초안</option>
              <option value="published">게시</option>
            </select>
            <button
              type="button"
              onClick={() => void createQuestion()}
              disabled={creating}
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Plus className="h-4 w-4" />
              {creating ? "추가 중" : "추가"}
            </button>
          </div>
        </div>
      </div>

      <div className="divide-y divide-[#f0f0ec]">
        {loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-[#1a1a1a]/35">
            추천 질문을 불러오는 중입니다.
          </p>
        ) : visibleQuestions.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[#1a1a1a]/35">
            표시할 추천 질문이 없습니다.
          </p>
        ) : (
          visibleQuestions.map((question) => {
            const draft = getDraft(question)
            const dirty = isDirty(question, draft)
            const mappedArticle = question.mappedArticleId
              ? articlesById.get(question.mappedArticleId)
              : null

            return (
              <div key={question.id} className="px-4 py-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusTone(question.status)}`}
                  >
                    {STATUS_LABELS[question.status]}
                  </span>
                  <span className="text-[11px] text-[#1a1a1a]/35">
                    수정 {formatDateTime(question.updatedAt)}
                  </span>
                </div>

                <div className="grid gap-3">
                  <input
                    value={draft.prompt}
                    onChange={(event) => updateDraft(question.id, "prompt", event.target.value)}
                    className="min-h-10 rounded-lg border border-[#e8e8e4] bg-white px-3 py-2 text-[13px] font-semibold text-[#111110] outline-none transition-colors focus:border-[#084734]"
                  />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input
                      value={draft.label}
                      onChange={(event) => updateDraft(question.id, "label", event.target.value)}
                      placeholder="관리용 라벨"
                      className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none transition-colors placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
                    />
                    <input
                      value={draft.category}
                      onChange={(event) => updateDraft(question.id, "category", event.target.value)}
                      placeholder="카테고리"
                      className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none transition-colors placeholder:text-[#1a1a1a]/25 focus:border-[#084734]"
                    />
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[90px_112px_minmax(0,1fr)]">
                    <input
                      type="number"
                      value={draft.orderIndex}
                      onChange={(event) =>
                        updateDraft(question.id, "orderIndex", Number(event.target.value) || 0)
                      }
                      aria-label={`${question.label} 정렬 순서`}
                      className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none transition-colors focus:border-[#084734]"
                    />
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        updateDraft(question.id, "status", event.target.value as RecommendedQuestionStatus)
                      }
                      className="h-9 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none transition-colors focus:border-[#084734]"
                    >
                      <option value="draft">초안</option>
                      <option value="published">게시</option>
                      <option value="archived">보관</option>
                    </select>
                    <select
                      value={draft.mappedArticleId}
                      onChange={(event) => updateDraft(question.id, "mappedArticleId", event.target.value)}
                      className="h-9 min-w-0 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[13px] outline-none transition-colors focus:border-[#084734]"
                    >
                      <option value="">연결 문서 없음</option>
                      {articles.map((article) => (
                        <option key={article.id} value={article.id}>
                          {article.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-h-8 text-[11px] text-[#1a1a1a]/35">
                      {mappedArticle ? (
                        <Link
                          href={mappedArticle.publicPath}
                          target="_blank"
                          className="inline-flex items-center gap-1.5 transition-colors hover:text-[#084734]"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          {mappedArticle.title}
                        </Link>
                      ) : (
                        "연결된 문서가 없습니다."
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void saveQuestion(question, { status: "archived" })}
                        disabled={savingId === question.id || question.status === "archived"}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        보관
                      </button>
                      <button
                        type="button"
                        onClick={() => void saveQuestion(question)}
                        disabled={savingId === question.id || !dirty}
                        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg bg-[#111110] px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#2a2a28] disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Save className="h-3.5 w-3.5" />
                        {savingId === question.id ? "저장 중" : "저장"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
