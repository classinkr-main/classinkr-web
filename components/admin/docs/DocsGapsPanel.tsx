"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Loader2, Sparkles, RefreshCw, ClipboardCopy, Check, Plus, MessageSquare } from "lucide-react"
import { adminFetchJson } from "@/lib/admin-client"
import { buildDocDraftArticlePayload } from "@/lib/chatbot/doc-draft-article"
import { cn } from "@/lib/utils"

interface GapClusterInternalCsRef {
  conversationId: string
  messageId: string
}

interface GapClusterMetadata {
  // (string & {})로 계약된 리터럴 힌트를 유지하면서 알 수 없는 값도 허용한다.
  source?: "chatbot_mvp_exact_match" | "internal_cs_fallback" | "internal_cs_review" | (string & {})
  internalCs?: GapClusterInternalCsRef[]
}

interface GapCluster {
  id: string
  label: string
  question: string
  category: string | null
  sampleCount: number
  lastSeenAt: string
  status: string
  metadata?: GapClusterMetadata | null
}

interface ZeroResultSearch {
  query: string
  count: number
  lastSeenAt: string
}

interface Backlog {
  gapClusters: GapCluster[]
  zeroResultSearches: ZeroResultSearch[]
  warning?: string
}

interface DocDraft {
  title: string
  contentMarkdown: string
  suggestedCategory: string
  grounding: { title: string; urlPath: string }[]
}

interface DraftSource {
  key: string
  question: string
  clusterId?: string
}

interface CreatedArticle {
  id: string
  publicPath: string
}

interface ClusterUpdateWarning {
  clusterId: string
  articleId: string
}

interface PublishRecommendedResult {
  recommended?: boolean
  clusterUpdated?: boolean
}

interface EvalReport {
  total: number
  durationMs: number
  deterministic: {
    categoryMatch: number
    modeOk: number
    withSources: number
    categoryMatchRate: number
    modeOkRate: number
    sourceRate: number
  }
  judge: {
    enabled: boolean
    judged: number
    faithfulRate: number | null
    hallucinationRate: number | null
    addressesRate: number | null
    avgScore: number | null
  }
  failures: {
    id: string
    question: string
    detectedCategory: string
    expectCategory: string
    answerMode: string
    flags: string[]
  }[]
}

interface ChatbotQuestionStat {
  clusterId: string
  questionLabel: string
  category: string | null
  questionCount: number
  unresolvedCount: number
  handoffCount: number
  directAnswerCount: number
  avgConfidence: number | null
  regressionCandidate?: boolean
}

interface ChatbotDistributionItem {
  key: string
  count: number
  rate: number
}

interface ChatbotStats {
  range: { from: string; to: string | null }
  totals: {
    questionCount: number
    unresolvedCount: number
    handoffCount: number
    directAnswerCount: number
  }
  topQuestions: ChatbotQuestionStat[]
  unresolvedQuestions: ChatbotQuestionStat[]
  feedbackStats: {
    detected_category: string | null
    question_label: string
    feedback_count: number
    helpful_count: number
    not_helpful_count: number
  }[]
  latency: {
    avgMs: number | null
    p95Ms: number | null
    sampleCount: number
  }
  answerModes: ChatbotDistributionItem[]
  categories: ChatbotDistributionItem[]
  channelHandoffs: {
    total: number
    sent: number
    pending: number
    failed: number
    skipped: number
    support: number
    demo: number
    statuses: ChatbotDistributionItem[]
    intents: ChatbotDistributionItem[]
  }
  avgConfidence: number | null
  warning?: string
}

type AlphaReadinessStatus = "ok" | "warning" | "blocked"

interface AlphaReadinessCheck {
  key: string
  label: string
  status: AlphaReadinessStatus
  detail: string
  action?: string
  artifacts?: string[]
}

interface AlphaReadinessReport {
  generatedAt: string
  overallStatus: AlphaReadinessStatus
  summary: Record<AlphaReadinessStatus, number>
  checks: AlphaReadinessCheck[]
  warnings: string[]
}

const READINESS_PLACEHOLDER_LABELS = [
  "Supabase 운영 연결",
  "챗봇 DB 스키마",
  "Gemini 인식 엔진",
  "공개 문서 원본",
  "RAG 문서 청크",
  "임베딩 백필",
  "시작 추천 질문",
  "문서 보강 큐",
]

function pct(value: number | null | undefined) {
  if (value == null) return "—"
  return `${Math.round(value * 100)}%`
}

function ms(value: number | null | undefined) {
  if (value == null) return "—"
  if (value >= 1000) return `${(value / 1000).toFixed(1)}초`
  return `${value}ms`
}

function markStatsRegressionCandidate(stats: ChatbotStats | null, clusterId: string, enabled: boolean) {
  if (!stats) return stats
  const markItem = (item: ChatbotQuestionStat) =>
    item.clusterId === clusterId ? { ...item, regressionCandidate: enabled } : item

  return {
    ...stats,
    topQuestions: stats.topQuestions.map(markItem),
    unresolvedQuestions: stats.unresolvedQuestions.map(markItem),
  }
}

type GapSource = "chatbot" | "internal_cs"
type GapSourceFilter = GapSource | "all"

const GAP_SOURCE_FILTERS: { value: GapSourceFilter; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "chatbot", label: "챗봇" },
  { value: "internal_cs", label: "내부CS" },
]

// metadata.source가 없거나 알 수 없는 값이면 기존과 동일하게 "챗봇" 출처로 취급한다.
const GAP_SOURCE_BADGES: Record<string, { label: string; group: GapSource; className: string }> = {
  internal_cs_fallback: {
    label: "내부CS 폴백",
    group: "internal_cs",
    className: "bg-[#FFF7ED] text-[#B85C33]",
  },
  internal_cs_review: {
    label: "내부CS 검토",
    group: "internal_cs",
    className: "bg-[#ECFDF5] text-[#084734]",
  },
}

const DEFAULT_GAP_SOURCE_BADGE = {
  label: "챗봇",
  group: "chatbot" as GapSource,
  className: "bg-[#F6F5F4] text-[#615D59]",
}

function getGapClusterSourceBadge(cluster: GapCluster) {
  const source = cluster.metadata?.source
  if (source && source in GAP_SOURCE_BADGES) {
    return GAP_SOURCE_BADGES[source]
  }
  return DEFAULT_GAP_SOURCE_BADGE
}

export default function DocsGapsPanel() {
  const router = useRouter()
  const [backlog, setBacklog] = useState<Backlog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [clusterActionId, setClusterActionId] = useState<string | null>(null)
  const [sourceFilter, setSourceFilter] = useState<GapSourceFilter>("all")

  const [draftingKey, setDraftingKey] = useState<string | null>(null)
  const [draft, setDraft] = useState<DocDraft | null>(null)
  const [draftSource, setDraftSource] = useState<DraftSource | null>(null)
  const [savingDraftArticle, setSavingDraftArticle] = useState(false)
  const [copied, setCopied] = useState(false)
  const [clusterUpdateWarning, setClusterUpdateWarning] = useState<ClusterUpdateWarning | null>(null)
  const [retryingClusterUpdate, setRetryingClusterUpdate] = useState(false)

  const [evalRunningMode, setEvalRunningMode] = useState<"fast" | "judge" | null>(null)
  const [evalReport, setEvalReport] = useState<EvalReport | null>(null)
  const [readiness, setReadiness] = useState<AlphaReadinessReport | null>(null)
  const [readinessLoading, setReadinessLoading] = useState(true)
  const [chatbotStats, setChatbotStats] = useState<ChatbotStats | null>(null)
  const [chatbotStatsLoading, setChatbotStatsLoading] = useState(true)
  const [promotingClusterId, setPromotingClusterId] = useState<string | null>(null)

  const loadBacklog = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const data = await adminFetchJson<Backlog>("/api/admin/docs/gaps")
      setBacklog(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "문서 보강 큐를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  const loadReadiness = useCallback(async () => {
    setReadinessLoading(true)
    try {
      const data = await adminFetchJson<AlphaReadinessReport>("/api/admin/docs/alpha-readiness")
      setReadiness(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "알파 준비도를 불러오지 못했습니다.")
    } finally {
      setReadinessLoading(false)
    }
  }, [])

  const loadChatbotStats = useCallback(async () => {
    setChatbotStatsLoading(true)
    try {
      const data = await adminFetchJson<ChatbotStats>("/api/admin/chatbot/stats")
      setChatbotStats(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "챗봇 질문 패턴을 불러오지 못했습니다.")
    } finally {
      setChatbotStatsLoading(false)
    }
  }, [])

  const refreshAll = useCallback(() => {
    void loadBacklog()
    void loadReadiness()
    void loadChatbotStats()
  }, [loadBacklog, loadChatbotStats, loadReadiness])

  useEffect(() => {
    refreshAll()
  }, [refreshAll])

  const generateDraft = async (key: string, question: string) => {
    setDraftingKey(key)
    setDraft(null)
    setDraftSource(null)
    setCopied(false)
    // 이전 초안의 큐 갱신 실패 경고가 남아 새 초안 저장까지 막지 않도록 함께 리셋한다.
    setClusterUpdateWarning(null)
    try {
      const data = await adminFetchJson<DocDraft>("/api/admin/docs/gaps/draft", {
        method: "POST",
        body: JSON.stringify({ question }),
      })
      setDraft(data)
      setDraftSource({
        key,
        question,
        clusterId: key.startsWith("c:") ? key.slice(2) : undefined,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "초안 생성에 실패했습니다.")
    } finally {
      setDraftingKey(null)
    }
  }

  const publishClusterAsRecommended = async (cluster: GapCluster) => {
    setClusterActionId(cluster.id)
    setError("")
    setNotice("")
    try {
      // clusterId를 실어 등록+클러스터 published 처리를 서버에서 한 번에 끝낸다(별도 PATCH 없음).
      const result = await adminFetchJson<PublishRecommendedResult>(
        "/api/admin/chatbot/recommended-questions",
        {
          method: "POST",
          body: JSON.stringify({
            label: cluster.label,
            prompt: cluster.question,
            status: "published",
            category: cluster.category,
            orderIndex: 100,
            clusterId: cluster.id,
          }),
        }
      )
      if (result?.clusterUpdated === false) {
        setError("추천 질문은 등록됐지만 보강 큐 상태 갱신에는 실패했습니다.")
      } else {
        setNotice("추천 질문으로 게시했습니다.")
      }
      await loadBacklog()
    } catch (e) {
      setError(e instanceof Error ? e.message : "추천 질문으로 게시하지 못했습니다.")
    } finally {
      setClusterActionId(null)
    }
  }

  const dismissCluster = async (cluster: GapCluster) => {
    setClusterActionId(cluster.id)
    setError("")
    setNotice("")
    try {
      await adminFetchJson(`/api/admin/chatbot/questions/${cluster.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "ignored" }),
      })
      setNotice("보강 큐에서 무시 처리했습니다.")
      await loadBacklog()
    } catch (e) {
      setError(e instanceof Error ? e.message : "무시 처리하지 못했습니다.")
    } finally {
      setClusterActionId(null)
    }
  }

  const runEval = async (judge: boolean) => {
    setEvalRunningMode(judge ? "judge" : "fast")
    try {
      const data = await adminFetchJson<EvalReport>("/api/admin/chatbot/eval", {
        method: "POST",
        body: JSON.stringify({ judge }),
      })
      setEvalReport(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : "품질 평가 실행에 실패했습니다.")
    } finally {
      setEvalRunningMode(null)
    }
  }

  const setRegressionCandidate = async (
    item: ChatbotQuestionStat,
    mode: "volume" | "risk",
    enabled: boolean
  ) => {
    if (!item.clusterId || item.clusterId === "unclustered") return

    setPromotingClusterId(item.clusterId)
    setError("")
    try {
      const expectedModes =
        mode === "risk" || item.handoffCount > 0 || item.unresolvedCount > 0
          ? ["handoff"]
          : ["direct_answer", "doc_suggestion", "handoff"]

      await adminFetchJson(`/api/admin/chatbot/questions/${item.clusterId}`, {
        method: "PATCH",
        body: JSON.stringify({
          regressionCandidate: {
            enabled,
            expectedCategory: item.category ?? "general",
            expectedModes,
            reason: mode === "risk" ? "admin_unresolved_pattern" : "admin_frequent_pattern",
          },
        }),
      })

      setChatbotStats((current) => markStatsRegressionCandidate(current, item.clusterId, enabled))
    } catch (e) {
      setError(e instanceof Error ? e.message : "회귀 후보 상태를 변경하지 못했습니다.")
    } finally {
      setPromotingClusterId(null)
    }
  }

  const copyDraft = () => {
    if (!draft) return
    navigator.clipboard
      .writeText(`# ${draft.title}\n\n${draft.contentMarkdown}`)
      .then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => {})
  }

  const saveDraftAsArticle = async () => {
    if (!draft || !draftSource) return

    setSavingDraftArticle(true)
    setError("")
    setClusterUpdateWarning(null)
    try {
      const article = await adminFetchJson<CreatedArticle>("/api/admin/docs/articles", {
        method: "POST",
        body: JSON.stringify(
          buildDocDraftArticlePayload({
            draft,
            question: draftSource.question,
          })
        ),
      })

      if (draftSource.clusterId) {
        try {
          await adminFetchJson(`/api/admin/chatbot/questions/${draftSource.clusterId}`, {
            method: "PATCH",
            body: JSON.stringify({ status: "approved", mappedArticleId: article.id }),
          })
        } catch {
          // 문서 저장 자체는 성공했으니 무음 처리하지 않고 화면에 남겨 재시도할 수 있게 한다.
          setClusterUpdateWarning({ clusterId: draftSource.clusterId, articleId: article.id })
          return
        }
      }

      router.push(`/admin/docs/${article.id}/edit`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI 초안을 문서로 저장하지 못했습니다.")
    } finally {
      setSavingDraftArticle(false)
    }
  }

  const retryClusterStatusUpdate = async () => {
    if (!clusterUpdateWarning) return

    setRetryingClusterUpdate(true)
    setError("")
    try {
      await adminFetchJson(`/api/admin/chatbot/questions/${clusterUpdateWarning.clusterId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "approved", mappedArticleId: clusterUpdateWarning.articleId }),
      })
      const { articleId } = clusterUpdateWarning
      setClusterUpdateWarning(null)
      router.push(`/admin/docs/${articleId}/edit`)
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : "큐 상태 갱신 재시도에 실패했습니다.")
    } finally {
      setRetryingClusterUpdate(false)
    }
  }

  const filteredGapClusters = (backlog?.gapClusters ?? []).filter(
    (cluster) => sourceFilter === "all" || getGapClusterSourceBadge(cluster).group === sourceFilter
  )

  return (
    <div className="text-[#111110]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-[-0.02em]">문서 보강 큐</h2>
          <p className="mt-1.5 text-sm text-[#615D59]">
            매핑 문서가 없는 질문 클러스터와 결과 없는 검색어입니다. 초안을 생성해 검토 후 게시하세요.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] px-3.5 py-2 text-sm font-medium text-[#615D59] transition-colors hover:text-[#084734]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          새로고침
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded-xl bg-[#FBEAE2] px-4 py-3 text-sm text-[#B85C33]">{error}</p>
      )}

      {notice && (
        <p className="mt-4 rounded-xl border border-[#dcebd9] bg-[#ECFDF5] px-4 py-3 text-sm text-[#084734]">
          {notice}
        </p>
      )}

      <AlphaReadinessPanel report={readiness} loading={readinessLoading} onRefresh={loadReadiness} />

      <QuestionPatternPanel
        stats={chatbotStats}
        loading={chatbotStatsLoading}
        promotingClusterId={promotingClusterId}
        onRefresh={loadChatbotStats}
        onSetRegressionCandidate={setRegressionCandidate}
      />

      {/* 품질 평가 */}
      <section className="mt-6 rounded-[20px] border border-black/[0.08] bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">챗봇 품질 평가</h2>
            <p className="mt-1 text-sm text-[#615D59]">
              골든셋을 실제 파이프라인에 돌려 회귀 여부와 출처 품질을 확인합니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => runEval(false)}
              disabled={evalRunningMode != null}
              className="inline-flex items-center gap-2 rounded-full border border-[#084734]/15 bg-white px-4 py-2 text-sm font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5] disabled:opacity-60"
            >
              {evalRunningMode === "fast" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              빠른 회귀 평가
            </button>
            <button
              type="button"
              onClick={() => runEval(true)}
              disabled={evalRunningMode != null}
              className="inline-flex items-center gap-2 rounded-full bg-[#084734] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-60"
            >
              {evalRunningMode === "judge" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              심판 포함 평가
            </button>
          </div>
        </div>

        {evalReport && (
          <>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric
                label="카테고리 적중"
                value={`${pct(evalReport.deterministic.categoryMatchRate)} · ${evalReport.deterministic.categoryMatch}/${evalReport.total}`}
              />
              <Metric
                label="모드 적합"
                value={`${pct(evalReport.deterministic.modeOkRate)} · ${evalReport.deterministic.modeOk}/${evalReport.total}`}
              />
              <Metric
                label="출처 확보"
                value={`${pct(evalReport.deterministic.sourceRate)} · ${evalReport.deterministic.withSources}/${evalReport.total}`}
              />
              <Metric
                label={evalReport.judge.enabled ? "근거 충실 (심판)" : "심판 비활성"}
                value={evalReport.judge.enabled ? pct(evalReport.judge.faithfulRate) : "—"}
              />
              {evalReport.judge.enabled && (
                <>
                  <Metric label="환각" value={pct(evalReport.judge.hallucinationRate)} />
                  <Metric label="질문 충족" value={pct(evalReport.judge.addressesRate)} />
                  <Metric
                    label="평균 점수"
                    value={evalReport.judge.avgScore != null ? `${evalReport.judge.avgScore.toFixed(2)}/5` : "—"}
                  />
                </>
              )}
              <Metric label="케이스" value={`${evalReport.total}개`} />
              <Metric label="평가 시간" value={ms(evalReport.durationMs)} />
            </div>

            {evalReport.failures.length > 0 ? (
              <div className="mt-4 rounded-[14px] border border-[#B85C33]/20 bg-[#FBEAE2] p-3">
                <p className="text-sm font-semibold text-[#B85C33]">
                  회귀 확인 필요 {evalReport.failures.length}건
                </p>
                <ul className="mt-2 space-y-2">
                  {evalReport.failures.slice(0, 5).map((failure) => (
                    <li key={failure.id} className="text-[12px] leading-5 text-[#615D59]">
                      <span className="font-semibold text-[#111110]">{failure.question}</span>
                      <span> · {failure.flags.join(", ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 rounded-[14px] border border-[#084734]/15 bg-[#ECFDF5] px-3 py-2 text-sm font-semibold text-[#084734]">
                회귀 실패 없음
              </p>
            )}
          </>
        )}
      </section>

      {loading ? (
        <p className="mt-8 flex items-center gap-2 text-sm text-[#615D59]">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중…
        </p>
      ) : (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          {/* 무매핑 클러스터 */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">
                문서 없는 질문 <span className="text-[#615D59]">({filteredGapClusters.length})</span>
              </h2>
              <div className="flex flex-wrap items-center gap-1.5">
                {GAP_SOURCE_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setSourceFilter(filter.value)}
                    aria-pressed={sourceFilter === filter.value}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                      sourceFilter === filter.value
                        ? "border-[#084734]/15 bg-[#ECFDF5] text-[#084734]"
                        : "border-black/[0.08] bg-white text-[#615D59] hover:border-[#084734]/25 hover:bg-[#ECFDF5] hover:text-[#084734]"
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
            <ul className="space-y-2.5">
              {filteredGapClusters.map((cluster) => {
                const sourceBadge = getGapClusterSourceBadge(cluster)
                const conversationId = cluster.metadata?.internalCs?.[0]?.conversationId
                return (
                  <li key={cluster.id} className="rounded-[16px] border border-black/[0.08] bg-white p-4">
                    <p className="text-sm font-medium text-[#111110]">{cluster.question}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-[#615D59]">
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", sourceBadge.className)}>
                        {sourceBadge.label}
                      </span>
                      {cluster.category && <span>{cluster.category}</span>}
                      <span>샘플 {cluster.sampleCount}건</span>
                      <span>·</span>
                      <span>{cluster.status}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <DraftButton
                        busy={draftingKey === `c:${cluster.id}`}
                        onClick={() => generateDraft(`c:${cluster.id}`, cluster.question)}
                      />
                      <button
                        type="button"
                        onClick={() => void publishClusterAsRecommended(cluster)}
                        disabled={clusterActionId === cluster.id}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#084734] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-60"
                      >
                        {clusterActionId === cluster.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Plus className="h-3.5 w-3.5" />
                        )}
                        추천 질문
                      </button>
                      <button
                        type="button"
                        onClick={() => void dismissCluster(cluster)}
                        disabled={clusterActionId === cluster.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-medium text-[#615D59] transition-colors hover:text-[#111110] disabled:opacity-60"
                      >
                        무시
                      </button>
                      {conversationId && (
                        <Link
                          href={`/admin/cs-chatbot?conversation=${encodeURIComponent(conversationId)}`}
                          className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-medium text-[#615D59] transition-colors hover:border-[#084734]/25 hover:text-[#084734]"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          대화 열기
                        </Link>
                      )}
                    </div>
                  </li>
                )
              })}
              {filteredGapClusters.length === 0 && (
                <li className="text-sm text-[#615D59]">
                  {(backlog?.gapClusters.length ?? 0) === 0
                    ? "문서 없는 질문 클러스터가 없습니다."
                    : "선택한 소스에 해당하는 질문이 없습니다."}
                </li>
              )}
            </ul>
          </section>

          {/* zero-result 검색 */}
          <section>
            <h2 className="mb-3 text-base font-semibold">
              결과 없는 검색어 <span className="text-[#615D59]">({backlog?.zeroResultSearches.length ?? 0})</span>
            </h2>
            <ul className="space-y-2.5">
              {(backlog?.zeroResultSearches ?? []).map((search) => (
                <li key={search.query} className="rounded-[16px] border border-black/[0.08] bg-white p-4">
                  <p className="text-sm font-medium text-[#111110]">{search.query}</p>
                  <p className="mt-1.5 text-[12px] text-[#615D59]">검색 {search.count}회</p>
                  <div className="mt-3">
                    <DraftButton
                      busy={draftingKey === `s:${search.query}`}
                      onClick={() => generateDraft(`s:${search.query}`, search.query)}
                    />
                  </div>
                </li>
              ))}
              {(backlog?.zeroResultSearches.length ?? 0) === 0 && (
                <li className="text-sm text-[#615D59]">결과 없는 검색어가 없습니다.</li>
              )}
            </ul>
          </section>
        </div>
      )}

      {/* 생성된 초안 */}
      {draft && (
        <section className="mt-8 rounded-[20px] border border-[#dcebd9] bg-[#ECFDF5] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#084734]" />
              <h2 className="text-base font-semibold">AI 초안 — 검토 후 게시</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveDraftAsArticle}
                disabled={savingDraftArticle || clusterUpdateWarning != null}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#084734] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-60"
              >
                {savingDraftArticle ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                초안을 문서로 저장
              </button>
              <button
                type="button"
                onClick={copyDraft}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#084734]/15 bg-white px-3 py-1.5 text-[12px] font-medium text-[#084734]"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <ClipboardCopy className="h-3.5 w-3.5" />}
                {copied ? "복사됨" : "Markdown 복사"}
              </button>
            </div>
          </div>
          {clusterUpdateWarning && (
            <div className="mt-3 rounded-[14px] border border-[#B85C33]/20 bg-[#FBEAE2] p-3">
              <p className="text-sm font-semibold text-[#B85C33]">문서는 저장됐지만 큐 상태 갱신 실패</p>
              <p className="mt-1 text-[12px] leading-5 text-[#615D59]">
                문서 자체는 정상 저장됐습니다. 보강 큐의 클러스터 상태만 다시 갱신해 주세요.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void retryClusterStatusUpdate()}
                  disabled={retryingClusterUpdate}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[#084734] px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-60"
                >
                  {retryingClusterUpdate ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  상태 갱신 재시도
                </button>
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/admin/docs/${clusterUpdateWarning.articleId}/edit`)
                    router.refresh()
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3 py-1.5 text-[12px] font-medium text-[#615D59] transition-colors hover:text-[#111110]"
                >
                  문서 편집으로 이동
                </button>
              </div>
            </div>
          )}
          <p className="mt-3 text-lg font-bold text-[#111110]">{draft.title}</p>
          <p className="mt-1 text-[12px] text-[#615D59]">추천 카테고리: {draft.suggestedCategory}</p>
          {draft.grounding.length > 0 && (
            <p className="mt-1 text-[12px] text-[#615D59]">
              근거: {draft.grounding.map((g) => g.title).join(", ")}
            </p>
          )}
          <textarea
            readOnly
            value={draft.contentMarkdown}
            className="mt-3 h-72 w-full rounded-[12px] border border-black/[0.08] bg-white p-3 font-mono text-[13px] leading-6 text-[#111110]"
          />
          <p className="mt-2 text-[11px] text-[#615D59]">
            ※ AI 초안입니다. 저장하면 문서 편집 화면에서 최종 검수하세요.
          </p>
        </section>
      )}
    </div>
  )
}

function QuestionPatternPanel({
  stats,
  loading,
  promotingClusterId,
  onRefresh,
  onSetRegressionCandidate,
}: {
  stats: ChatbotStats | null
  loading: boolean
  promotingClusterId: string | null
  onRefresh: () => void
  onSetRegressionCandidate: (item: ChatbotQuestionStat, mode: "volume" | "risk", enabled: boolean) => void
}) {
  const totals = stats?.totals ?? {
    questionCount: 0,
    unresolvedCount: 0,
    handoffCount: 0,
    directAnswerCount: 0,
  }
  const questionCount = totals.questionCount || 0
  const unresolvedRate = questionCount === 0 ? 0 : totals.unresolvedCount / questionCount
  const handoffRate = questionCount === 0 ? 0 : totals.handoffCount / questionCount
  const directAnswerRate = questionCount === 0 ? 0 : totals.directAnswerCount / questionCount

  return (
    <section className="mt-6 rounded-[20px] border border-black/[0.08] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">챗봇 질문 패턴 분석</h2>
          <p className="mt-1 text-sm text-[#615D59]">
            최근 30일 질문 흐름, 미해결 패턴, 상담 연결 신호, 답변 속도를 같이 봅니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#084734]/15 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#F6F5F4] disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          패턴 새로고침
        </button>
      </div>

      {stats?.warning && (
        <p className="mt-3 rounded-[12px] border border-[#B85C33]/20 bg-[#FBEAE2] px-3 py-2 text-[12px] text-[#B85C33]">
          {stats.warning}
        </p>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Metric label="질문" value={`${totals.questionCount}건`} />
        <Metric label="미해결" value={`${totals.unresolvedCount}건 · ${pct(unresolvedRate)}`} />
        <Metric label="상담 연결" value={`${totals.handoffCount}건 · ${pct(handoffRate)}`} />
        <Metric label="직접 답변" value={`${totals.directAnswerCount}건 · ${pct(directAnswerRate)}`} />
        <Metric label="평균 응답" value={ms(stats?.latency.avgMs)} />
        <Metric label="평균 신뢰도" value={pct(stats?.avgConfidence)} />
        <Metric
          label="채널톡 전송"
          value={`${stats?.channelHandoffs?.sent ?? 0}/${stats?.channelHandoffs?.total ?? 0}`}
        />
        <Metric label="전송 실패" value={`${stats?.channelHandoffs?.failed ?? 0}건`} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <QuestionStatList
          title="반복 질문"
          description="자주 들어오는 질문은 문서/추천 질문/온보딩 UX 후보입니다."
          items={stats?.topQuestions ?? []}
          emptyText={loading ? "질문 패턴을 불러오는 중입니다." : "아직 반복 질문이 없습니다."}
          mode="volume"
          promotingClusterId={promotingClusterId}
          onSetRegressionCandidate={onSetRegressionCandidate}
        />
        <div className="grid gap-4">
          <DistributionList title="답변 모드" items={stats?.answerModes ?? []} labeler={answerModeLabel} />
          <DistributionList title="카테고리" items={stats?.categories ?? []} labeler={categoryLabel} />
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <QuestionStatList
          title="미해결/상담 연결 후보"
          description="원장 문의, 컴플레인, 장애 흐름은 우선적으로 보강합니다."
          items={stats?.unresolvedQuestions ?? []}
          emptyText={loading ? "미해결 패턴을 불러오는 중입니다." : "최근 미해결 질문이 없습니다."}
          mode="risk"
          promotingClusterId={promotingClusterId}
          onSetRegressionCandidate={onSetRegressionCandidate}
        />
        <FeedbackList items={stats?.feedbackStats ?? []} loading={loading} />
      </div>

      {stats?.latency.sampleCount ? (
        <p className="mt-3 text-[11px] text-[#615D59]">
          응답 속도 표본 {stats.latency.sampleCount}건 · p95 {ms(stats.latency.p95Ms)}
        </p>
      ) : null}
    </section>
  )
}

function AlphaReadinessPanel({
  report,
  loading,
  onRefresh,
}: {
  report: AlphaReadinessReport | null
  loading: boolean
  onRefresh: () => void
}) {
  const status = report?.overallStatus ?? "warning"
  const statusMeta = getReadinessStatusMeta(status)
  const checks = report?.checks ?? []

  return (
    <section className="mt-6 rounded-[20px] border border-black/[0.08] bg-[#ECFDF5] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold">챗봇 알파 준비도</h2>
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusMeta.badgeClass}`}>
              {loading ? "확인 중" : statusMeta.label}
            </span>
          </div>
          <p className="mt-1 text-sm text-[#615D59]">
            운영 DB, 문서 근거, 임베딩, 추천 질문, 보강 큐를 한 번에 점검합니다.
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#084734]/15 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#F6F5F4] disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          준비도 확인
        </button>
      </div>

      {report && (
        <div className="mt-3 flex flex-wrap gap-2 text-[12px] text-[#615D59]">
          <span>정상 {report.summary.ok}</span>
          <span>주의 {report.summary.warning}</span>
          <span>막힘 {report.summary.blocked}</span>
          <span>{new Date(report.generatedAt).toLocaleString("ko-KR")}</span>
        </div>
      )}

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {loading && checks.length === 0
          ? READINESS_PLACEHOLDER_LABELS.map((label) => (
              <div key={label} className="rounded-[14px] border border-black/[0.06] bg-white/80 p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[#111110]">{label}</p>
                  <span className="rounded-full bg-[#F6F5F4] px-2 py-0.5 text-[11px] text-[#615D59]">대기</span>
                </div>
                <p className="mt-1 text-[12px] text-[#615D59]">상태를 확인하는 중입니다.</p>
              </div>
            ))
          : checks.map((check) => {
              const meta = getReadinessStatusMeta(check.status)
              return (
                <div key={check.key} className="rounded-[14px] border border-black/[0.06] bg-white p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-[#111110]">{check.label}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.badgeClass}`}>
                      {meta.label}
                    </span>
                  </div>
                  <p className="mt-1 text-[12px] leading-5 text-[#615D59]">{check.detail}</p>
                  {check.action && <p className="mt-1 text-[12px] font-medium text-[#084734]">{check.action}</p>}
                  {check.artifacts && check.artifacts.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {check.artifacts.map((artifact) => (
                        <code
                          key={artifact}
                          className="max-w-full rounded-md border border-black/[0.06] bg-[#F6F5F4] px-1.5 py-1 text-[11px] leading-4 text-[#615D59]"
                        >
                          {artifact}
                        </code>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
      </div>

      {(report?.warnings.length ?? 0) > 0 && (
        <div className="mt-3 rounded-[12px] border border-[#B85C33]/20 bg-[#FBEAE2] px-3 py-2 text-[12px] text-[#B85C33]">
          {report?.warnings.join(" · ")}
        </div>
      )}
    </section>
  )
}

function getReadinessStatusMeta(status: AlphaReadinessStatus) {
  if (status === "ok") {
    return { label: "준비됨", badgeClass: "bg-[#ECFDF5] text-[#084734]" }
  }
  if (status === "warning") {
    return { label: "확인 필요", badgeClass: "bg-[#FFF7ED] text-[#B85C33]" }
  }
  return { label: "막힘", badgeClass: "bg-[#FBEAE2] text-[#B85C33]" }
}

function answerModeLabel(key: string) {
  const labels: Record<string, string> = {
    direct_answer: "직접 답변",
    doc_suggestion: "문서 제안",
    clarifying_question: "추가 질문",
    handoff: "상담 연결",
    fallback: "fallback",
    unknown: "알 수 없음",
  }
  return labels[key] ?? key
}

function categoryLabel(key: string) {
  const labels: Record<string, string> = {
    onboarding: "온보딩",
    classroom: "수업 운영",
    troubleshooting: "문제 해결",
    hardware: "하드웨어",
    billing: "결제",
    admin: "관리자",
    consultation: "상담",
    general: "일반",
    uncategorized: "미분류",
  }
  return labels[key] ?? key
}

function questionPriority(item: ChatbotQuestionStat, mode: "volume" | "risk") {
  const unresolvedRate = item.questionCount === 0 ? 0 : item.unresolvedCount / item.questionCount
  const handoffRate = item.questionCount === 0 ? 0 : item.handoffCount / item.questionCount

  if (mode === "risk" || item.unresolvedCount >= 3 || handoffRate >= 0.5) {
    return {
      label: "높음",
      className: "bg-[#FBEAE2] text-[#B85C33]",
    }
  }
  if (item.questionCount >= 5 || unresolvedRate >= 0.25 || (item.avgConfidence ?? 1) < 0.65) {
    return {
      label: "중간",
      className: "bg-[#FFF7ED] text-[#B85C33]",
    }
  }
  return {
    label: "관찰",
    className: "bg-[#F6F5F4] text-[#615D59]",
  }
}

function recommendedPatternAction(item: ChatbotQuestionStat, mode: "volume" | "risk") {
  if (mode === "risk" || item.handoffCount > 0) return "상담 흐름 점검"
  if (item.unresolvedCount > 0) return "문서 보강"
  if ((item.avgConfidence ?? 1) < 0.7) return "근거 품질 점검"
  if (item.questionCount >= 5) return "FAQ/추천 질문 반영"
  return "계속 관찰"
}

function QuestionStatList({
  title,
  description,
  items,
  emptyText,
  mode,
  promotingClusterId,
  onSetRegressionCandidate,
}: {
  title: string
  description: string
  items: ChatbotQuestionStat[]
  emptyText: string
  mode: "volume" | "risk"
  promotingClusterId: string | null
  onSetRegressionCandidate: (item: ChatbotQuestionStat, mode: "volume" | "risk", enabled: boolean) => void
}) {
  return (
    <div className="rounded-[16px] border border-black/[0.06] bg-[#FAFAF8] p-4">
      <div>
        <h3 className="text-sm font-semibold text-[#111110]">{title}</h3>
        <p className="mt-1 text-[12px] leading-5 text-[#615D59]">{description}</p>
      </div>
      <ul className="mt-3 space-y-2.5">
        {items.slice(0, 6).map((item) => {
          const canPromote = item.clusterId && item.clusterId !== "unclustered"
          const promoting = promotingClusterId === item.clusterId
          const priority = questionPriority(item, mode)
          const action = recommendedPatternAction(item, mode)

          return (
          <li key={`${title}:${item.questionLabel}`} className="rounded-[12px] border border-black/[0.06] bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold leading-5 text-[#111110]">{item.questionLabel}</p>
              {canPromote ? (
                <button
                  type="button"
                  onClick={() => onSetRegressionCandidate(item, mode, !item.regressionCandidate)}
                  disabled={promoting}
                  className={cn(
                    "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-[6px] border px-2 text-[11px] font-bold transition-colors disabled:cursor-default",
                    item.regressionCandidate
                      ? "border-[#084734]/15 bg-[#ECFDF5] text-[#084734]"
                      : "border-black/[0.08] bg-white text-[#615D59] hover:border-[#084734]/25 hover:bg-[#ECFDF5] hover:text-[#084734]"
                  )}
                >
                  {promoting ? <Loader2 className="h-3 w-3 animate-spin" /> : item.regressionCandidate ? <Check className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
                  {item.regressionCandidate ? "후보 해제" : "회귀 후보"}
                </button>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold", priority.className)}>
                우선순위 {priority.label}
              </span>
              <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-bold text-[#084734]">
                {action}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-[#615D59]">
              {item.category && <span>{categoryLabel(item.category)}</span>}
              <span>질문 {item.questionCount}건</span>
              {mode === "risk" ? (
                <>
                  <span>미해결 {item.unresolvedCount}건</span>
                  <span>상담 {item.handoffCount}건</span>
                </>
              ) : (
                <>
                  <span>직접 답변 {item.directAnswerCount}건</span>
                  <span>신뢰도 {pct(item.avgConfidence)}</span>
                </>
              )}
            </div>
          </li>
          )
        })}
        {items.length === 0 && <li className="text-sm text-[#615D59]">{emptyText}</li>}
      </ul>
    </div>
  )
}

function DistributionList({
  title,
  items,
  labeler,
}: {
  title: string
  items: ChatbotDistributionItem[]
  labeler: (key: string) => string
}) {
  return (
    <div className="rounded-[16px] border border-black/[0.06] bg-[#FAFAF8] p-4">
      <h3 className="text-sm font-semibold text-[#111110]">{title}</h3>
      <ul className="mt-3 space-y-2">
        {items.slice(0, 5).map((item) => (
          <li key={`${title}:${item.key}`} className="flex items-center justify-between gap-3 text-[12px]">
            <span className="truncate text-[#615D59]">{labeler(item.key)}</span>
            <span className="shrink-0 font-semibold tabular-nums text-[#111110]">
              {item.count} · {pct(item.rate)}
            </span>
          </li>
        ))}
        {items.length === 0 && <li className="text-sm text-[#615D59]">아직 집계 데이터가 없습니다.</li>}
      </ul>
    </div>
  )
}

function FeedbackList({
  items,
  loading,
}: {
  items: ChatbotStats["feedbackStats"]
  loading: boolean
}) {
  const sorted = [...items]
    .filter((item) => Number(item.not_helpful_count ?? 0) > 0 || Number(item.feedback_count ?? 0) > 0)
    .sort((left, right) => Number(right.not_helpful_count ?? 0) - Number(left.not_helpful_count ?? 0))
    .slice(0, 6)

  return (
    <div className="rounded-[16px] border border-black/[0.06] bg-[#FAFAF8] p-4">
      <h3 className="text-sm font-semibold text-[#111110]">피드백 확인 후보</h3>
      <p className="mt-1 text-[12px] leading-5 text-[#615D59]">
        도움이 안 됐다는 피드백은 회귀 테스트와 문서 보강 케이스로 올립니다.
      </p>
      <ul className="mt-3 space-y-2.5">
        {sorted.map((item) => (
          <li key={`${item.detected_category ?? "none"}:${item.question_label}`} className="rounded-[12px] border border-black/[0.06] bg-white p-3">
            <p className="text-sm font-semibold leading-5 text-[#111110]">{item.question_label}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px] text-[#615D59]">
              {item.detected_category && <span>{categoryLabel(item.detected_category)}</span>}
              <span>피드백 {item.feedback_count}건</span>
              <span>도움됨 {item.helpful_count}건</span>
              <span>아쉬움 {item.not_helpful_count}건</span>
            </div>
          </li>
        ))}
        {sorted.length === 0 && (
          <li className="text-sm text-[#615D59]">
            {loading ? "피드백을 불러오는 중입니다." : "최근 확인할 피드백이 없습니다."}
          </li>
        )}
      </ul>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-black/[0.06] bg-[#FAFAF8] p-3">
      <p className="text-[11px] text-[#615D59]">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-[#111110]">{value}</p>
    </div>
  )
}

function DraftButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex items-center gap-1.5 rounded-full border border-[#084734]/15 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5] disabled:opacity-60"
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      AI 초안 생성
    </button>
  )
}
