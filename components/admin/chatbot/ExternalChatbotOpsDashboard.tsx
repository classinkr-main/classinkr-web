"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Clock3,
  Gauge,
  Headset,
  Loader2,
  MessageSquare,
  MessageSquareText,
  RefreshCcw,
  Send,
  Sparkles,
} from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { cn } from "@/lib/utils"

// 공개 챗봇 운영 대시보드 — 얇은 소비 레이어.
// 데이터·API는 전부 재사용: GET /api/admin/chatbot/stats, GET /api/admin/docs/alpha-readiness,
// POST /api/admin/chatbot/eval. 소비 shape은 components/admin/docs/DocsGapsPanel.tsx와 동일하게
// 맞춘다(그 파일이 이 API들의 정본 소비 코드). 상세 화면(질문 패턴·문서 없는 질문·초안 생성 등)은
// 그대로 문서 보강 큐(/admin/docs?tab=gaps)에 남고, 여기서는 요약 + 실행 + 경로 안내만 담당한다.

interface ChatbotStatsSummary {
  totals: {
    questionCount: number
    unresolvedCount: number
    handoffCount: number
  }
  latency: {
    avgMs: number | null
  }
  avgConfidence: number | null
  channelHandoffs: {
    total: number
    sent: number
  }
  warning?: string
}

type AlphaReadinessStatus = "ok" | "warning" | "blocked"

interface AlphaReadinessCheck {
  key: string
  label: string
  status: AlphaReadinessStatus
  detail: string
  action?: string
}

interface AlphaReadinessReport {
  generatedAt: string
  overallStatus: AlphaReadinessStatus
  summary: Record<AlphaReadinessStatus, number>
  checks: AlphaReadinessCheck[]
  warnings: string[]
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

// 마운트 시 1회 자동 로드 → 실패하면 수동 "다시 시도"로만 재조회한다(무한 재시도 금지).
// components/admin/cs-chat/InternalCsChatWorkspace.tsx의 지표 카드 로드 관례를 그대로 따른다.
type AsyncLoadState = "idle" | "loading" | "loaded" | "failed"

function pct(value: number | null | undefined) {
  if (value == null) return "—"
  return `${Math.round(value * 100)}%`
}

function ms(value: number | null | undefined) {
  if (value == null) return "—"
  if (value >= 1000) return `${(value / 1000).toFixed(1)}초`
  return `${value}ms`
}

function getReadinessStatusMeta(status: AlphaReadinessStatus) {
  if (status === "ok") return { label: "준비됨", badgeClass: "bg-[#ECFDF5] text-[#084734]" }
  if (status === "warning") return { label: "확인 필요", badgeClass: "bg-[#FFF7ED] text-[#B85C33]" }
  return { label: "막힘", badgeClass: "bg-[#FBEAE2] text-[#B85C33]" }
}

// 계약 1(cs-tab-split-plan) — /admin/docs?tab=gaps&source=all|chatbot|internal_cs.
// 병렬 작업(nav·큐 프리셋)이 source 파라미터 소비 쪽을 구현 중이므로, 여기서는 계약된 형식만 코딩한다.
const ROUTE_CARDS = [
  {
    href: "/admin/docs?tab=gaps&source=chatbot",
    title: "보강 큐 (챗봇 발)",
    description: "공개 챗봇에서 올라온 미해결 질문·검색어만 모아 봅니다.",
    icon: Bot,
  },
  {
    href: "/admin/docs?tab=gaps&source=all",
    title: "보강 큐 전체",
    description: "내부 CS까지 합친 전체 문서 보강 큐로 이동합니다.",
    icon: Sparkles,
  },
  {
    href: "/admin/docs?tab=recommended",
    title: "추천 질문 관리",
    description: "시작 화면 추천 질문의 게시 여부와 노출 순서를 관리합니다.",
    icon: MessageSquareText,
  },
] as const

export default function ExternalChatbotOpsDashboard() {
  const [stats, setStats] = useState<ChatbotStatsSummary | null>(null)
  const [statsState, setStatsState] = useState<AsyncLoadState>("idle")

  const [readiness, setReadiness] = useState<AlphaReadinessReport | null>(null)
  const [readinessState, setReadinessState] = useState<AsyncLoadState>("idle")

  const [evalRunningMode, setEvalRunningMode] = useState<"fast" | "judge" | null>(null)
  const [evalReport, setEvalReport] = useState<EvalReport | null>(null)
  const [evalError, setEvalError] = useState("")

  const loadStats = useCallback(async () => {
    setStatsState("loading")
    try {
      const data = await adminFetchJson<ChatbotStatsSummary>("/api/admin/chatbot/stats")
      setStats(data)
      setStatsState("loaded")
    } catch {
      setStats(null)
      setStatsState("failed")
    }
  }, [])

  const loadReadiness = useCallback(async () => {
    setReadinessState("loading")
    try {
      const data = await adminFetchJson<AlphaReadinessReport>("/api/admin/docs/alpha-readiness")
      setReadiness(data)
      setReadinessState("loaded")
    } catch {
      setReadiness(null)
      setReadinessState("failed")
    }
  }, [])

  useEffect(() => {
    if (statsState === "idle") void loadStats()
  }, [statsState, loadStats])

  useEffect(() => {
    if (readinessState === "idle") void loadReadiness()
  }, [readinessState, loadReadiness])

  const runEval = async (judge: boolean) => {
    if (evalRunningMode != null) return
    setEvalRunningMode(judge ? "judge" : "fast")
    setEvalError("")
    try {
      const data = await adminFetchJson<EvalReport>("/api/admin/chatbot/eval", {
        method: "POST",
        body: JSON.stringify({ judge }),
      })
      setEvalReport(data)
    } catch (e) {
      setEvalError(e instanceof Error ? e.message : "품질 평가 실행에 실패했습니다.")
    } finally {
      setEvalRunningMode(null)
    }
  }

  const totals = stats?.totals ?? { questionCount: 0, unresolvedCount: 0, handoffCount: 0 }
  const questionCount = totals.questionCount || 0
  const unresolvedRate = questionCount === 0 ? 0 : totals.unresolvedCount / questionCount
  const handoffRate = questionCount === 0 ? 0 : totals.handoffCount / questionCount
  const statsReady = statsState === "loaded"

  const metricCards = [
    { key: "questions", icon: MessageSquare, label: "질문량", value: `${totals.questionCount}건` },
    { key: "unresolved", icon: AlertTriangle, label: "미해결률", value: `${totals.unresolvedCount}건 · ${pct(unresolvedRate)}` },
    { key: "handoff", icon: Headset, label: "상담 이관", value: `${totals.handoffCount}건 · ${pct(handoffRate)}` },
    { key: "latency", icon: Clock3, label: "응답 속도", value: ms(stats?.latency.avgMs) },
    { key: "confidence", icon: Gauge, label: "평균 신뢰도", value: pct(stats?.avgConfidence) },
    { key: "channel", icon: Send, label: "채널톡 전송", value: `${stats?.channelHandoffs?.sent ?? 0}/${stats?.channelHandoffs?.total ?? 0}` },
  ]

  const readinessChecks = readiness?.checks ?? []
  const failingChecks = readinessChecks.filter((check) => check.status !== "ok")
  const passCount = readiness?.summary.ok ?? 0
  const totalChecks = readinessChecks.length
  const readinessStatusMeta = getReadinessStatusMeta(readiness?.overallStatus ?? "warning")

  return (
    <div className="px-4 pt-8 pb-16 sm:px-6 sm:pt-10 sm:pb-20 lg:px-8">
      <div className="mx-auto max-w-[1200px] text-[#111110]">
        {/* 1. 헤더 */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.02em]">챗봇 운영 (외부)</h1>
            <p className="mt-1.5 text-sm text-[#615D59]">
              공개 챗봇의 질문 흐름, 알파 준비도, 품질 평가를 한 화면에서 확인합니다.
            </p>
          </div>
          <Link
            href="/admin/cs-chatbot"
            className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] bg-white px-3.5 py-2 text-sm font-medium text-[#615D59] transition-colors hover:border-[#084734]/25 hover:text-[#084734]"
          >
            <Headset className="h-3.5 w-3.5" />
            내부 CS 챗봇 열기
          </Link>
        </header>

        {/* 2. 지표 카드 행 */}
        <section className="mt-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">운영 지표</h2>
            {statsState === "failed" ? (
              <button
                type="button"
                onClick={() => void loadStats()}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.08] px-3 py-1.5 text-[12px] font-semibold text-[#615D59] transition-colors hover:bg-[#F6F5F4] hover:text-[#31302E]"
              >
                <RefreshCcw className="h-3.5 w-3.5" />
                다시 시도
              </button>
            ) : null}
          </div>
          {stats?.warning ? (
            <p className="mt-2 rounded-[12px] border border-[#B85C33]/20 bg-[#FBEAE2] px-3 py-2 text-[12px] text-[#B85C33]">
              {stats.warning}
            </p>
          ) : null}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {metricCards.map((card) => {
              const Icon = card.icon
              return (
                <div key={card.key} className="rounded-[14px] border border-black/[0.06] bg-[#FAFAF8] p-3">
                  <div className="flex items-center gap-1.5 text-[#615D59]">
                    <Icon className="h-3.5 w-3.5" />
                    <p className="text-[11px] font-medium">{card.label}</p>
                  </div>
                  <p className="mt-2 text-lg font-bold tabular-nums">{statsReady ? card.value : "—"}</p>
                </div>
              )
            })}
          </div>
        </section>

        {/* 3. 알파 준비도 요약 */}
        <section className="mt-6 rounded-[20px] border border-black/[0.08] bg-[#ECFDF5] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">챗봇 알파 준비도</h2>
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", readinessStatusMeta.badgeClass)}>
                  {readinessState === "loaded" ? readinessStatusMeta.label : "확인 중"}
                </span>
              </div>
              <p className="mt-1 text-sm text-[#615D59]">
                {readinessState === "loaded"
                  ? `통과 ${passCount}/${totalChecks}`
                  : "운영 DB, 문서 근거, 임베딩, 추천 질문 준비 상태를 확인합니다."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              {readinessState === "failed" ? (
                <button
                  type="button"
                  onClick={() => void loadReadiness()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#084734]/15 bg-white px-3 py-1.5 text-[12px] font-semibold text-[#084734] transition-colors hover:bg-white/70"
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  다시 시도
                </button>
              ) : null}
              <Link
                href="/admin/docs?tab=gaps"
                className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#084734] hover:underline"
              >
                상세 보기
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </div>

          {readinessState === "loading" || readinessState === "idle" ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-[#615D59]">
              <Loader2 className="h-4 w-4 animate-spin" /> 상태를 확인하는 중입니다.
            </p>
          ) : null}

          {readinessState === "loaded" && failingChecks.length === 0 ? (
            <p className="mt-4 rounded-[14px] border border-[#084734]/15 bg-white px-3 py-2 text-sm font-semibold text-[#084734]">
              모든 항목이 통과했습니다.
            </p>
          ) : null}

          {failingChecks.length > 0 ? (
            <ul className="mt-4 space-y-2">
              {failingChecks.map((check) => {
                const meta = getReadinessStatusMeta(check.status)
                return (
                  <li key={check.key} className="rounded-[14px] border border-black/[0.06] bg-white p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-sm font-semibold">{check.label}</p>
                      <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", meta.badgeClass)}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="mt-1 text-[12px] leading-5 text-[#615D59]">{check.detail}</p>
                    {check.action ? <p className="mt-1 text-[12px] font-medium text-[#084734]">{check.action}</p> : null}
                  </li>
                )
              })}
            </ul>
          ) : null}
        </section>

        {/* 4. 품질 평가 실행 */}
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
                onClick={() => void runEval(false)}
                disabled={evalRunningMode != null}
                className="inline-flex items-center gap-2 rounded-full border border-[#084734]/15 bg-white px-4 py-2 text-sm font-semibold text-[#084734] transition-colors hover:bg-[#ECFDF5] disabled:opacity-60"
              >
                {evalRunningMode === "fast" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                빠른 회귀 평가
              </button>
              <button
                type="button"
                onClick={() => void runEval(true)}
                disabled={evalRunningMode != null}
                className="inline-flex items-center gap-2 rounded-full bg-[#084734] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#065c41] disabled:opacity-60"
              >
                {evalRunningMode === "judge" ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                심판 포함 평가
              </button>
            </div>
          </div>

          {evalError ? (
            <p className="mt-4 rounded-[12px] border border-[#B85C33]/20 bg-[#FBEAE2] px-3 py-2 text-[12px] text-[#B85C33]">
              {evalError}
            </p>
          ) : null}

          {evalReport ? (
            <>
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <EvalMetric
                  label="카테고리 적중"
                  value={`${pct(evalReport.deterministic.categoryMatchRate)} · ${evalReport.deterministic.categoryMatch}/${evalReport.total}`}
                />
                <EvalMetric
                  label="모드 적합"
                  value={`${pct(evalReport.deterministic.modeOkRate)} · ${evalReport.deterministic.modeOk}/${evalReport.total}`}
                />
                <EvalMetric
                  label="출처 확보"
                  value={`${pct(evalReport.deterministic.sourceRate)} · ${evalReport.deterministic.withSources}/${evalReport.total}`}
                />
                <EvalMetric
                  label={evalReport.judge.enabled ? "근거 충실 (심판)" : "심판 비활성"}
                  value={evalReport.judge.enabled ? pct(evalReport.judge.faithfulRate) : "—"}
                />
                {evalReport.judge.enabled ? (
                  <>
                    <EvalMetric label="환각" value={pct(evalReport.judge.hallucinationRate)} />
                    <EvalMetric label="질문 충족" value={pct(evalReport.judge.addressesRate)} />
                    <EvalMetric
                      label="평균 점수"
                      value={evalReport.judge.avgScore != null ? `${evalReport.judge.avgScore.toFixed(2)}/5` : "—"}
                    />
                  </>
                ) : null}
                <EvalMetric label="케이스" value={`${evalReport.total}개`} />
                <EvalMetric label="평가 시간" value={ms(evalReport.durationMs)} />
              </div>

              {evalReport.failures.length > 0 ? (
                <div className="mt-4 rounded-[14px] border border-[#B85C33]/20 bg-[#FBEAE2] p-3">
                  <p className="text-sm font-semibold text-[#B85C33]">회귀 확인 필요 {evalReport.failures.length}건</p>
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
          ) : null}
        </section>

        {/* 5. 경로 카드 3개 */}
        <section className="mt-6">
          <h2 className="text-base font-semibold">바로가기</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {ROUTE_CARDS.map((route) => {
              const Icon = route.icon
              return (
                <Link
                  key={route.href}
                  href={route.href}
                  className="group rounded-[16px] border border-black/[0.08] bg-white p-4 transition-colors hover:border-[#084734]/25 hover:bg-[#ECFDF5]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F6F5F4] text-[#31302E] transition-colors group-hover:bg-white group-hover:text-[#084734]">
                      <Icon className="h-4 w-4" />
                    </span>
                    <ArrowRight className="h-4 w-4 text-[#A39E98] transition-colors group-hover:text-[#084734]" />
                  </div>
                  <p className="mt-3 text-sm font-semibold">{route.title}</p>
                  <p className="mt-1 text-[12px] leading-5 text-[#615D59]">{route.description}</p>
                </Link>
              )
            })}
          </div>
        </section>
      </div>
    </div>
  )
}

function EvalMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[14px] border border-black/[0.06] bg-[#FAFAF8] p-3">
      <p className="text-[11px] text-[#615D59]">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-[#111110]">{value}</p>
    </div>
  )
}
