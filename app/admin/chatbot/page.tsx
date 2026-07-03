"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock3,
  FilePlus2,
  MessageSquareText,
  RefreshCw,
  Zap,
} from "lucide-react"

import AdminTabs from "@/components/admin/AdminTabs"
import { StatTile } from "@/components/admin/viz"
import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import type { AdminDocsAnalyticsResponse } from "@/lib/admin-docs"

type PeriodValue = "7" | "30" | "90"
type AlphaReadinessStatus = "ok" | "warning" | "blocked"

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
  feedbackStats: Array<{
    detected_category: string | null
    question_label: string
    feedback_count: number
    helpful_count: number
    not_helpful_count: number
  }>
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

interface QuestionCluster {
  id: string
  label: string
  canonical_question: string
  category: string | null
  status: "candidate" | "approved" | "published" | "ignored"
  mapped_article_id: string | null
  last_seen_at: string | null
}

interface QuestionClustersResponse {
  clusters: QuestionCluster[]
  warning?: string
}

interface RecommendedQuestion {
  id: string
  label: string
  prompt: string
  status: "draft" | "published" | "archived"
  category: string | null
  mappedArticleId: string | null
  updatedAt: string
}

interface RecommendedQuestionsResponse {
  questions: RecommendedQuestion[]
  warning?: string
}

interface AlphaReadinessReport {
  generatedAt: string
  overallStatus: AlphaReadinessStatus
  summary: Record<AlphaReadinessStatus, number>
  checks: Array<{
    key: string
    label: string
    status: AlphaReadinessStatus
    detail: string
    action?: string
  }>
  warnings: string[]
}

interface EvalReport {
  total: number
  durationMs: number
  deterministic: {
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
  failures: Array<{
    id: string
    question: string
    detectedCategory: string
    expectCategory: string
    answerMode: string
    flags: string[]
  }>
}

const PERIODS = [
  { value: "7", label: "7일" },
  { value: "30", label: "30일" },
  { value: "90", label: "90일" },
] as const

const STATUS_LABEL: Record<AlphaReadinessStatus, string> = {
  ok: "정상",
  warning: "주의",
  blocked: "차단",
}

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("ko-KR").format(value ?? 0)
}

function formatRate(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "-"
  return `${Math.round(value * 100)}%`
}

function formatPercentFromCounts(part: number, total: number) {
  if (total <= 0) return "0%"
  return `${Math.round((part / total) * 100)}%`
}

function formatMs(value: number | null | undefined) {
  if (value == null) return "-"
  if (value >= 1000) return `${(value / 1000).toFixed(1)}초`
  return `${Math.round(value)}ms`
}

function dateOnlyOffset(days: number) {
  const date = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  return date.toISOString().slice(0, 10)
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

// KPI 카드는 공용 StatTile(components/admin/viz)로 통합 — 기존 그린 칩은 tone="brand"로 재현.
function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
}) {
  return <StatTile icon={icon} label={label} value={value} hint={hint} tone="brand" />
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/[0.08] bg-[#FAFAF8] px-4 py-8 text-center text-[13px] text-[#615D59]">
      {label}
    </div>
  )
}

export default function AdminChatbotPage() {
  const [period, setPeriod] = useState<PeriodValue>("30")
  const [stats, setStats] = useState<ChatbotStats | null>(null)
  const [clusters, setClusters] = useState<QuestionCluster[]>([])
  const [recommendedQuestions, setRecommendedQuestions] = useState<RecommendedQuestion[]>([])
  const [docsAnalytics, setDocsAnalytics] = useState<AdminDocsAnalyticsResponse | null>(null)
  const [readiness, setReadiness] = useState<AlphaReadinessReport | null>(null)
  const [evalReport, setEvalReport] = useState<EvalReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [evalLoading, setEvalLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [evalError, setEvalError] = useState<string | null>(null)

  const load = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    if (force) setRefreshing(true)
    else setLoading(true)
    setError(null)

    try {
      const days = Number(period)
      const from = dateOnlyOffset(days)
      const [statsData, clustersData, recommendedData, docsData, readinessData] = await Promise.all([
        adminFetchJsonCached<ChatbotStats>(`/api/admin/chatbot/stats?from=${from}`, undefined, {
          ttlMs: 60_000,
          force,
          staleIfError: !force,
        }),
        adminFetchJsonCached<QuestionClustersResponse>("/api/admin/chatbot/questions?limit=10", undefined, {
          ttlMs: 60_000,
          force,
          staleIfError: !force,
        }),
        adminFetchJsonCached<RecommendedQuestionsResponse>(
          "/api/admin/chatbot/recommended-questions?status=all&placement=starter",
          undefined,
          { ttlMs: 60_000, force, staleIfError: !force }
        ),
        adminFetchJsonCached<AdminDocsAnalyticsResponse>(`/api/admin/docs/analytics?days=${days}`, undefined, {
          ttlMs: 60_000,
          force,
          staleIfError: !force,
        }),
        adminFetchJsonCached<AlphaReadinessReport>("/api/admin/docs/alpha-readiness", undefined, {
          ttlMs: 60_000,
          force,
          staleIfError: !force,
        }),
      ])

      setStats(statsData)
      setClusters(clustersData.clusters ?? [])
      setRecommendedQuestions(recommendedData.questions ?? [])
      setDocsAnalytics(docsData)
      setReadiness(readinessData)
    } catch (err) {
      setError(err instanceof Error ? err.message : "챗봇 운영 데이터를 불러오지 못했습니다.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [period])

  useEffect(() => {
    void load()
  }, [load])

  const model = useMemo(() => {
    const publishedRecommended = recommendedQuestions.filter((item) => item.status === "published")
    const draftRecommended = recommendedQuestions.filter((item) => item.status === "draft")
    const blockedChecks = readiness?.checks.filter((item) => item.status === "blocked") ?? []
    const warningChecks = readiness?.checks.filter((item) => item.status === "warning") ?? []
    const reviewClusters = clusters.filter((cluster) => cluster.status === "candidate" || cluster.status === "approved")

    return {
      publishedRecommended,
      draftRecommended,
      blockedChecks,
      warningChecks,
      reviewClusters,
      unresolvedRate: formatPercentFromCounts(
        stats?.totals.unresolvedCount ?? 0,
        stats?.totals.questionCount ?? 0
      ),
    }
  }, [clusters, readiness, recommendedQuestions, stats])

  async function runEval() {
    setEvalLoading(true)
    setEvalError(null)
    try {
      const report = await adminFetchJson<EvalReport>("/api/admin/chatbot/eval", {
        method: "POST",
        body: JSON.stringify({ judge: false, limit: 20 }),
      })
      setEvalReport(report)
    } catch (err) {
      setEvalError(err instanceof Error ? err.message : "골든셋 평가를 실행하지 못했습니다.")
    } finally {
      setEvalLoading(false)
    }
  }

  return (
    <div className="px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
      <header className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#615D59]">Admin</p>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">챗봇 운영</h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-relaxed text-[#615D59]">
            질문 백로그, 추천 질문, 문서 보강, 상담 연결 상태를 한 화면에서 보고 실제 응답 품질을 관리합니다.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <AdminTabs
            label="챗봇 운영 기간"
            items={PERIODS}
            value={period}
            onValueChange={setPeriod}
            variant="subtle"
          />
          <button
            type="button"
            onClick={() => void load({ force: true })}
            disabled={refreshing}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            새로고침
          </button>
        </div>
      </header>

      {error || stats?.warning ? (
        <div className="mb-6 flex items-start gap-2 rounded-2xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-[13px] text-[#B85C33]">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error ?? stats?.warning}</span>
        </div>
      ) : null}

      <section className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard
          icon={<Bot className="h-5 w-5" />}
          label="질문"
          value={loading ? "..." : formatNumber(stats?.totals.questionCount)}
          hint={`직답 ${formatNumber(stats?.totals.directAnswerCount)}건`}
        />
        <MetricCard
          icon={<AlertCircle className="h-5 w-5" />}
          label="미해결률"
          value={loading ? "..." : model.unresolvedRate}
          hint={`미해결 ${formatNumber(stats?.totals.unresolvedCount)}건`}
        />
        <MetricCard
          icon={<MessageSquareText className="h-5 w-5" />}
          label="상담 연결"
          value={loading ? "..." : formatNumber(stats?.channelHandoffs.total)}
          hint={`성공 ${formatNumber(stats?.channelHandoffs.sent)}건 · 실패 ${formatNumber(stats?.channelHandoffs.failed)}건`}
        />
        <MetricCard
          icon={<Clock3 className="h-5 w-5" />}
          label="P95 응답"
          value={loading ? "..." : formatMs(stats?.latency.p95Ms)}
          hint={`샘플 ${formatNumber(stats?.latency.sampleCount)}건`}
        />
        <MetricCard
          icon={<CheckCircle2 className="h-5 w-5" />}
          label="추천 질문"
          value={loading ? "..." : formatNumber(model.publishedRecommended.length)}
          hint={`초안 ${formatNumber(model.draftRecommended.length)}개`}
        />
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div className="rounded-2xl border border-black/[0.08] bg-white">
          <div className="flex flex-col gap-3 border-b border-black/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-[#111110]">질문 백로그</h2>
              <p className="mt-1 text-[12px] text-[#615D59]">반복 질문을 FAQ 초안, 추천 질문, 상담 연결 기준으로 정리합니다.</p>
            </div>
            <Link
              href="/admin/docs?tab=gaps"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#111110] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#2a2a28]"
            >
              보강 큐 열기
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-black/[0.08]">
            {model.reviewClusters.length === 0 ? (
              <div className="p-5">
                <EmptyState label="검토할 질문 클러스터가 없습니다." />
              </div>
            ) : (
              model.reviewClusters.slice(0, 8).map((cluster) => (
                <div key={cluster.id} className="px-5 py-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-[#111110]">{cluster.label}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#615D59]">{cluster.canonical_question}</p>
                      <p className="mt-2 text-[11px] text-[#615D59]">
                        {cluster.category ?? "카테고리 없음"} · {cluster.status} · {formatDateTime(cluster.last_seen_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {cluster.mapped_article_id ? (
                        <Link
                          href={`/admin/docs/${cluster.mapped_article_id}/edit`}
                          className="inline-flex min-h-10 items-center justify-center rounded-xl border border-black/[0.08] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4]"
                        >
                          연결 문서
                        </Link>
                      ) : (
                        <Link
                          href="/admin/docs?tab=gaps"
                          className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-black/[0.08] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4]"
                        >
                          <FilePlus2 className="h-4 w-4" />
                          FAQ 초안
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white">
          <div className="border-b border-black/[0.08] px-5 py-4">
            <h2 className="text-[15px] font-bold text-[#111110]">알파 준비도</h2>
            <p className="mt-1 text-[12px] text-[#615D59]">챗봇 운영에 영향을 주는 스키마, 문서, 추천 질문 상태입니다.</p>
          </div>
          <div className="p-5">
            <div className="grid grid-cols-3 gap-2">
              {(["ok", "warning", "blocked"] as const).map((status) => (
                <div key={status} className="rounded-2xl border border-black/[0.08] bg-[#FAFAF8] px-3 py-3">
                  <p className="text-[11px] text-[#615D59]">{STATUS_LABEL[status]}</p>
                  <p className="mt-1 text-xl font-bold text-[#111110]">{formatNumber(readiness?.summary[status])}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-3">
              {[...model.blockedChecks, ...model.warningChecks].slice(0, 5).map((check) => (
                <div key={check.key} className="rounded-2xl border border-black/[0.08] bg-[#FAFAF8] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[13px] font-bold text-[#111110]">{check.label}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#615D59]">{check.detail}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                        check.status === "blocked" ? "bg-[#FEF3EE] text-[#B85C33]" : "bg-[#F6F5F4] text-[#615D59]"
                      }`}
                    >
                      {STATUS_LABEL[check.status]}
                    </span>
                  </div>
                  {check.action ? <p className="mt-2 text-[11px] text-[#084734]">{check.action}</p> : null}
                </div>
              ))}
              {model.blockedChecks.length === 0 && model.warningChecks.length === 0 ? (
                <EmptyState label="준비도 경고가 없습니다." />
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-black/[0.08] bg-white">
          <div className="flex flex-col gap-3 border-b border-black/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-[#111110]">추천 질문 운영</h2>
              <p className="mt-1 text-[12px] text-[#615D59]">공개 시작 질문과 문서 매핑 상태를 점검합니다.</p>
            </div>
            <Link
              href="/admin/docs?tab=recommended"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4]"
            >
              추천 질문 편집
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="divide-y divide-black/[0.08]">
            {recommendedQuestions.length === 0 ? (
              <div className="p-5">
                <EmptyState label="추천 질문 데이터가 없습니다." />
              </div>
            ) : (
              recommendedQuestions.slice(0, 8).map((question) => (
                <div key={question.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-bold text-[#111110]">{question.label}</p>
                      <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[#615D59]">{question.prompt}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${
                        question.status === "published" ? "bg-[#ECFDF5] text-[#084734]" : "bg-[#F6F5F4] text-[#615D59]"
                      }`}
                    >
                      {question.status}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-white">
          <div className="flex flex-col gap-3 border-b border-black/[0.08] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-[15px] font-bold text-[#111110]">골든셋 평가</h2>
              <p className="mt-1 text-[12px] text-[#615D59]">최근 변경 후 카테고리, 답변 모드, 출처 포함 여부를 빠르게 확인합니다.</p>
            </div>
            <button
              type="button"
              onClick={() => void runEval()}
              disabled={evalLoading}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#084734] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-50"
            >
              <Zap className="h-4 w-4" />
              {evalLoading ? "실행 중" : "20건 실행"}
            </button>
          </div>
          <div className="p-5">
            {evalError ? (
              <div className="mb-4 flex items-start gap-2 rounded-2xl border border-[#F6D5C5] bg-[#FEF3EE] px-4 py-3 text-[13px] text-[#B85C33]">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{evalError}</span>
              </div>
            ) : null}
            {evalReport ? (
              <div className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl bg-[#FAFAF8] px-3 py-3">
                    <p className="text-[11px] text-[#615D59]">카테고리</p>
                    <p className="mt-1 text-xl font-bold text-[#111110]">{formatRate(evalReport.deterministic.categoryMatchRate)}</p>
                  </div>
                  <div className="rounded-2xl bg-[#FAFAF8] px-3 py-3">
                    <p className="text-[11px] text-[#615D59]">응답 모드</p>
                    <p className="mt-1 text-xl font-bold text-[#111110]">{formatRate(evalReport.deterministic.modeOkRate)}</p>
                  </div>
                  <div className="rounded-2xl bg-[#FAFAF8] px-3 py-3">
                    <p className="text-[11px] text-[#615D59]">출처 포함</p>
                    <p className="mt-1 text-xl font-bold text-[#111110]">{formatRate(evalReport.deterministic.sourceRate)}</p>
                  </div>
                </div>
                <p className="text-[12px] text-[#615D59]">
                  총 {formatNumber(evalReport.total)}건 · {formatMs(evalReport.durationMs)} 소요 · 실패 {formatNumber(evalReport.failures.length)}건
                </p>
                {evalReport.failures.slice(0, 4).map((failure) => (
                  <div key={failure.id} className="rounded-2xl border border-black/[0.08] bg-[#FAFAF8] px-4 py-3">
                    <p className="text-[13px] font-semibold text-[#111110]">{failure.question}</p>
                    <p className="mt-1 text-[11px] text-[#615D59]">
                      {failure.detectedCategory} / 예상 {failure.expectCategory} · {failure.flags.join(", ") || "플래그 없음"}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-[#ECFDF5] px-4 py-5 text-[13px] leading-relaxed text-[#084734]">
                배포 전이나 지식베이스 수정 후 실행하세요. 느린 LLM judge는 꺼두고 deterministic 체크만 먼저 돌립니다.
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-2xl border border-black/[0.08] bg-white">
          <div className="border-b border-black/[0.08] px-5 py-4">
            <h2 className="text-[15px] font-bold text-[#111110]">문서 분석 연결</h2>
            <p className="mt-1 text-[12px] text-[#615D59]">검색 결과 없음과 챗봇 미해결이 같이 늘면 문서 보강이 우선입니다.</p>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            <div className="rounded-2xl bg-[#FAFAF8] px-4 py-4">
              <p className="text-[11px] text-[#615D59]">검색</p>
              <p className="mt-1 text-2xl font-bold text-[#111110]">{formatNumber(docsAnalytics?.summary.searchTotal)}</p>
            </div>
            <div className="rounded-2xl bg-[#FAFAF8] px-4 py-4">
              <p className="text-[11px] text-[#615D59]">결과 없음</p>
              <p className="mt-1 text-2xl font-bold text-[#111110]">{formatNumber(docsAnalytics?.summary.zeroResultSearches)}</p>
            </div>
            <div className="rounded-2xl bg-[#FAFAF8] px-4 py-4">
              <p className="text-[11px] text-[#615D59]">챗봇 미해결</p>
              <p className="mt-1 text-2xl font-bold text-[#111110]">{formatNumber(docsAnalytics?.summary.chatbotUnresolved)}</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-black/[0.08] bg-[#ECFDF5] p-5">
          <h2 className="text-[15px] font-bold text-[#111110]">운영 루틴</h2>
          <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-[#084734]">
            <p>1. 미해결 상위 질문은 FAQ 초안으로 바꾸고 질문 클러스터에 문서를 연결합니다.</p>
            <p>2. 반복 질문 중 바로 답할 수 있는 것은 추천 질문으로 승격합니다.</p>
            <p>3. 상담 연결 실패가 생기면 채널톡/웹훅 상태를 먼저 확인합니다.</p>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/admin/settings?tab=integrations"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#084734] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#065c41]"
            >
              통합 상태
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/admin/ops"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-black/[0.08] bg-white px-3 text-[13px] font-semibold text-[#111110] transition-colors hover:bg-[#F6F5F4]"
            >
              Ops Health
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
