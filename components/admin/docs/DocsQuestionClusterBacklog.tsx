"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Bot, FilePlus2, Plus, RefreshCw } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"

interface QuestionCluster {
  id: string
  label: string
  canonical_question: string
  category: string | null
  status: "candidate" | "approved" | "published" | "ignored"
  sample_questions: string[] | null
  mapped_article_id: string | null
  last_seen_at: string
}

interface QuestionsResponse {
  clusters: QuestionCluster[]
  warning?: string
}

interface CreatedArticle {
  id: string
  publicPath: string
}

function slugify(value: string) {
  const ascii = value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
  return ascii || `faq-${Date.now().toString(36)}`
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(date)
}

export default function DocsQuestionClusterBacklog() {
  const [clusters, setClusters] = useState<QuestionCluster[]>([])
  const [loading, setLoading] = useState(true)
  const [workingId, setWorkingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await adminFetchJson<QuestionsResponse>("/api/admin/chatbot/questions?limit=12")
      setClusters(response.clusters ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "질문 클러스터를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function publishAsRecommended(cluster: QuestionCluster) {
    setWorkingId(cluster.id)
    setError(null)
    try {
      await adminFetchJson("/api/admin/chatbot/recommended-questions", {
        method: "POST",
        body: JSON.stringify({
          label: cluster.label,
          prompt: cluster.canonical_question,
          status: "published",
          category: cluster.category,
          mappedArticleId: cluster.mapped_article_id,
          orderIndex: 100,
        }),
      })
      await adminFetchJson(`/api/admin/chatbot/questions/${cluster.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "published" }),
      })
      setNotice("추천 질문으로 게시했습니다.")
      window.setTimeout(() => setNotice(null), 2400)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "추천 질문으로 게시하지 못했습니다.")
    } finally {
      setWorkingId(null)
    }
  }

  async function createFaqDraft(cluster: QuestionCluster) {
    setWorkingId(cluster.id)
    setError(null)
    try {
      const article = await adminFetchJson<CreatedArticle>("/api/admin/docs/articles", {
        method: "POST",
        body: JSON.stringify({
          categoryId: "help",
          slug: slugify(cluster.canonical_question).slice(0, 70),
          title: cluster.label,
          description: `${cluster.canonical_question}에 대한 답변 초안입니다.`,
          docType: "faq",
          productArea: cluster.category === "billing" ? "billing" : "general",
          difficulty: "beginner",
          status: "draft",
          visibility: "public",
          tags: ["FAQ", cluster.category ?? "챗봇 질문"].filter(Boolean),
          keywords: [cluster.canonical_question, ...(cluster.sample_questions ?? [])].slice(0, 6),
          chatbotSummary: `${cluster.canonical_question}에 대한 FAQ 답변을 정리해야 합니다.`,
          contentMarkdown: `# ${cluster.label}

## 질문

${cluster.canonical_question}

## 답변

답변을 작성해 주세요.

## 추가 안내

예외 조건이나 상담 연결 기준을 정리해 주세요.`,
        }),
      })
      await adminFetchJson(`/api/admin/chatbot/questions/${cluster.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "approved", mappedArticleId: article.id }),
      })
      setNotice("FAQ 초안을 만들었습니다.")
      window.setTimeout(() => setNotice(null), 2400)
      window.open(`/admin/docs/${article.id}/edit`, "_blank", "noopener,noreferrer")
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "FAQ 초안을 만들지 못했습니다.")
    } finally {
      setWorkingId(null)
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#e8e8e4] px-4 py-4">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[#1a1a1a]/35" />
          <h2 className="text-[14px] font-semibold text-[#111110]">질문 백로그</h2>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#e8e8e4] bg-white text-[#111110] hover:bg-[#f5f5f2] disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          <span className="sr-only">새로고침</span>
        </button>
      </div>
      {error ? <p className="border-b border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-[13px] text-[#B85C33]">{error}</p> : null}
      {notice ? <p className="border-b border-emerald-100 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">{notice}</p> : null}
      <div className="divide-y divide-[#f0f0ec]">
        {loading ? (
          <p className="px-4 py-8 text-center text-[13px] text-[#1a1a1a]/35">질문을 불러오는 중입니다.</p>
        ) : clusters.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13px] text-[#1a1a1a]/35">쌓인 질문이 없습니다.</p>
        ) : (
          clusters.map((cluster) => (
            <div key={cluster.id} className="px-4 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[13px] font-semibold text-[#111110]">{cluster.label}</p>
                  <p className="mt-1 text-[11px] text-[#1a1a1a]/35">
                    {cluster.category ?? "카테고리 없음"} · {cluster.status} · {formatDate(cluster.last_seen_at)}
                  </p>
                </div>
                {cluster.mapped_article_id ? (
                  <Link
                    href={`/admin/docs/${cluster.mapped_article_id}/edit`}
                    className="shrink-0 text-[11px] font-semibold text-[#084734]"
                  >
                    연결 문서
                  </Link>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void createFaqDraft(cluster)}
                  disabled={workingId === cluster.id}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-2.5 text-[12px] font-semibold text-[#111110] hover:bg-[#f5f5f2] disabled:opacity-50"
                >
                  <FilePlus2 className="h-3.5 w-3.5" />
                  FAQ 초안
                </button>
                <button
                  type="button"
                  onClick={() => void publishAsRecommended(cluster)}
                  disabled={workingId === cluster.id}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#111110] px-2.5 text-[12px] font-semibold text-white hover:bg-[#2a2a28] disabled:opacity-50"
                >
                  <Plus className="h-3.5 w-3.5" />
                  추천 질문
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
