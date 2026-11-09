"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import {
  Activity,
  ArrowUpRight,
  Eye,
  Gauge,
  ShieldCheck,
  Users,
} from "lucide-react"

import {
  TrafficConversionPanel,
  type TrafficDetailTab,
} from "@/components/admin/traffic/TrafficConversionPanel"
import PagePerformanceTable, { pageName } from "@/components/admin/traffic/PagePerformanceTable"
import { adminFetchJsonCached } from "@/lib/admin-client"
import type { PublicPageRequests } from "@/lib/admin/public-page-requests"

type RangeDays = 7 | 14 | 30

interface VisitorStatsDay {
  date: string
  visitors: number
  pageViews: number
  homeVisitors: number
  homePageViews: number
}

interface VisitorStats {
  rangeDays: number
  timezone: "Asia/Seoul"
  today: VisitorStatsDay
  totals: {
    visitors: number
    pageViews: number
    homeVisitors: number
    homePageViews: number
  }
  daily: VisitorStatsDay[]
}

interface HomepageFlowPageRow {
  path: string
  pageViews: number
  visitors: number
  avgDwellSeconds: number
  exits: number
  exitRate: number
}

interface HomepageFlow {
  rangeDays: number
  timezone: "Asia/Seoul"
  generatedAt: string
  totals: {
    visitors: number
    pageViews: number
    homeVisitors: number
    homePageViews: number
    downloads: number
    exits: number
    avgDwellSeconds: number
  }
  daily: Array<{
    date: string
    visitors: number
    pageViews: number
    downloads: number
    exits: number
  }>
  nextStepsFromHome: Array<{
    path: string
    label: string
    count: number
    share: number
  }>
  topPages: HomepageFlowPageRow[]
  highDwellPages: HomepageFlowPageRow[]
  exitPages: HomepageFlowPageRow[]
}

interface ClientEventCounts {
  rangeDays: number
  total: number
  byEvent: Array<{ event: string; count: number; lastSeen: string | null }>
  byButton: Array<{
    button: string
    event: string
    count: number
    lastSeen: string | null
  }>
  daily: Array<{ date: string; count: number }>
}

interface TrafficSummary {
  rangeDays: number
  timezone: "Asia/Seoul"
  generatedAt: string
  visitorStats: VisitorStats
  homepageFlow: HomepageFlow
  eventCounts: ClientEventCounts
  /** 전환 지표의 정본 — 동의 게이트가 걸린 client_events 가 아니라 leads 에서 센다. */
  leadConversions?: {
    rangeDays: number
    homepage: number
    newsletter: number
    total: number
  }
  leadConversionsUnavailable?: boolean
}

interface MarketingConversionStatus {
  meta: {
    pixelId: string | null
    datasetId: string | null
    capiConfigured: boolean
    testEventCodeConfigured: boolean
  }
  google: {
    adsId: string
    demoConversionLabelConfigured: boolean
    ga4MeasurementId: string | null
    measurementProtocolConfigured: boolean
  }
  internal: {
    trackingEnabled: boolean
  }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    return await adminFetchJsonCached<T>(url, undefined, { ttlMs: 60_000 })
  } catch {
    return null
  }
}

function formatDuration(seconds: number) {
  if (!seconds || seconds <= 0) return "—"
  const whole = Math.round(seconds)
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return minutes > 0 ? `${minutes}분 ${rest}초` : `${rest}초`
}

// 홈(/)을 본 다음 바로 연 페이지 — 사이트 이탈 포함 상위 8개(API가 자름). 막대 길이 = 비중 그대로.
function HomeNextStepsPanel({
  steps,
  loading,
}: {
  steps: HomepageFlow["nextStepsFromHome"]
  loading: boolean
}) {
  const total = steps.reduce((sum, step) => sum + step.count, 0)
  const exitShare = steps.find((step) => step.path === "__exit__")?.share ?? 0

  return (
    <section
      aria-labelledby="home-next-steps-title"
      className="flex flex-col overflow-hidden rounded-2xl border border-black/[0.08] bg-white"
    >
      <div className="border-b border-black/[0.08] px-4 py-3">
        <h2
          id="home-next-steps-title"
          className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]"
        >
          홈 다음 이동
        </h2>
        <p className="mt-0.5 text-[11px] leading-5 text-[#615D59]">
          홈을 본 뒤 바로 연 페이지
          {total > 0 ? ` · 총 ${total.toLocaleString("ko-KR")}회` : ""}
        </p>
      </div>
      {loading ? (
        <div className="space-y-1.5 p-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-8 animate-pulse rounded-lg bg-[#F0F0EC]" />
          ))}
        </div>
      ) : steps.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12px] text-[#615D59]">
          연속 page_view 데이터가 더 필요합니다.
        </p>
      ) : (
        <ol className="divide-y divide-black/[0.06]">
          {steps.map((step) => {
            const exit = step.path === "__exit__"
            return (
              <li key={step.path} className="px-4 py-2" title={step.path}>
                <div className="flex items-baseline justify-between gap-3 text-[13px]">
                  <span
                    className={`min-w-0 truncate font-semibold ${exit ? "text-[#B43E3E]" : "text-[#111110]"}`}
                  >
                    {pageName(step.path)}
                  </span>
                  <span className="shrink-0 tabular-nums text-[12px] text-[#8A857F]">
                    <span className="text-[13px] font-semibold text-[#111110]">{step.share}%</span>
                    {` · ${step.count.toLocaleString("ko-KR")}회`}
                  </span>
                </div>
                <span aria-hidden="true" className="mt-1 block h-[3px] overflow-hidden rounded-full bg-[#F0F0EC]">
                  <span
                    className={`block h-full rounded-full ${exit ? "bg-[#B43E3E]" : "bg-[#084734]"}`}
                    style={{ width: `${Math.min(step.share, 100)}%` }}
                  />
                </span>
              </li>
            )
          })}
        </ol>
      )}
      {!loading && steps.length > 0 ? (
        <p className="mt-auto flex items-baseline justify-between gap-3 border-t border-black/[0.08] bg-[#FAFAF8] px-4 py-2.5 text-[12px] text-[#615D59]">
          <span>
            계속 둘러봄{" "}
            <strong className="text-[14px] tabular-nums text-[#084734]">{Math.max(0, 100 - exitShare)}%</strong>
          </span>
          <span>
            바로 이탈{" "}
            <strong className="text-[14px] tabular-nums text-[#B43E3E]">{exitShare}%</strong>
          </span>
        </p>
      ) : null}
    </section>
  )
}

function formatUpdatedAt(value: string | null) {
  if (!value) return "업데이트 확인 중"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "업데이트 시각 없음"

  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)
}

// 전환 성과/계측 진단 하위 탭만 URL(?detail=)에 남긴다 — 기간은 Analytics 화면이 쥔다.
function replaceDetailQuery(detailTab: TrafficDetailTab) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  if (detailTab === "diagnostics") {
    url.searchParams.set("detail", "diagnostics")
  } else {
    url.searchParams.delete("detail")
  }
  window.history.replaceState(
    window.history.state,
    "",
    `${url.pathname}${url.search}${url.hash}`
  )
}

const TrafficTrendChart = dynamic(
  () =>
    import("@/components/admin/traffic/TrafficTrendChart").then(
      (module) => module.TrafficTrendChart
    ),
  {
    ssr: false,
    loading: () => (
      <div
        aria-label="방문자 추이 불러오는 중"
        className="h-72 animate-pulse rounded-xl bg-[#F0F0EC]"
      />
    ),
  }
)

function DecisionMetric({
  icon,
  label,
  value,
  hint,
  trend,
  trendDirection = "neutral",
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  trend?: string
  trendDirection?: "positive" | "negative" | "neutral"
}) {
  const trendClass =
    trendDirection === "positive"
      ? "text-[#084734]"
      : trendDirection === "negative"
        ? "text-[#8F2C2C]"
        : "text-[#615D59]"

  return (
    <div className="min-w-0 bg-white p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#ECFDF5] text-[#084734]">
          {icon}
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold text-[#615D59]">{label}</p>
          <p className="mt-1 tabular-nums text-[27px] font-bold leading-none tracking-[-0.035em] text-[#111110]">
            {value}
          </p>
        </div>
      </div>
      <div className="mt-3 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
        <span className="text-[#615D59]">{hint}</span>
        {trend && (
          <span className={`font-semibold tabular-nums ${trendClass}`}>
            {trend}
          </span>
        )}
      </div>
    </div>
  )
}

function InsightItem({
  icon,
  eyebrow,
  title,
  detail,
  tone = "neutral",
}: {
  icon: React.ReactNode
  eyebrow: string
  title: string
  detail: string
  tone?: "danger" | "brand" | "neutral"
}) {
  const iconClass =
    tone === "danger"
      ? "bg-[#FCE9E9] text-[#8F2C2C]"
      : tone === "brand"
        ? "bg-[#ECFDF5] text-[#084734]"
        : "bg-[#F0F0EC] text-[#31302E]"

  const titleClass =
    tone === "danger"
      ? "text-[#8F2C2C]"
      : tone === "brand"
        ? "text-[#084734]"
        : "text-[#111110]"

  return (
    <div className="flex min-w-0 items-start gap-3 bg-white p-4 sm:p-5">
      <span
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconClass}`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-[#615D59]">{eyebrow}</p>
        <p
          className={`mt-0.5 truncate text-[17px] font-bold tracking-[-0.02em] ${titleClass}`}
        >
          {title}
        </p>
        <p className="mt-1 line-clamp-2 text-[12px] leading-5 text-[#615D59]">
          {detail}
        </p>
      </div>
    </div>
  )
}

/**
 * Analytics '방문자' 탭 본문. 방문자/트래픽의 유일한 화면이다 — /admin/traffic 은 이 탭으로
 * 리다이렉트한다(2026-11-03). 기간은 Analytics 상단 버튼(range prop)이 쥔다.
 */
export default function TrafficDashboard({ range }: { range: RangeDays }) {
  const [detailTab, setDetailTab] =
    useState<TrafficDetailTab>("conversions")
  const [visitorStats, setVisitorStats] = useState<VisitorStats | null>(null)
  const [pageRequests, setPageRequests] = useState<{ range: number; data: PublicPageRequests | null } | null>(null)
  const [homepageFlow, setHomepageFlow] = useState<HomepageFlow | null>(null)
  const [leadConversions, setLeadConversions] = useState<TrafficSummary["leadConversions"] | null>(null)
  const [leadConversionsUnavailable, setLeadConversionsUnavailable] = useState(false)
  const [eventCounts, setEventCounts] = useState<ClientEventCounts | null>(
    null
  )
  const [conversionStatus, setConversionStatus] =
    useState<MarketingConversionStatus | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  // 집계 실패 여부 — null 지표가 전부 0으로 렌더되면 "방문자 0명"과 구분되지 않는다
  // (2026-08-18, 실패≠빈상태).
  const [loadError, setLoadError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    // ?detail=diagnostics 딥링크(옛 /admin/traffic 북마크가 리다이렉트로 넘겨준 것 포함)
    if (new URLSearchParams(window.location.search).get("detail") === "diagnostics") {
      queueMicrotask(() => setDetailTab("diagnostics"))
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoading(true)
      const [summary, status] = await Promise.all([
        fetchJson<TrafficSummary>(
          `/api/admin/traffic-summary?range=${range}`
        ),
        fetchJson<MarketingConversionStatus>(
          "/api/admin/marketing/conversions/status"
        ),
      ])

      if (cancelled) return
      setVisitorStats(summary?.visitorStats ?? null)
      setHomepageFlow(summary?.homepageFlow ?? null)
      setEventCounts(summary?.eventCounts ?? null)
      setLeadConversions(summary?.leadConversions ?? null)
      setLeadConversionsUnavailable(Boolean(summary?.leadConversionsUnavailable))
      setConversionStatus(status ?? null)
      setGeneratedAt(summary?.generatedAt ?? null)
      setLoadError(summary === null)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [range, reloadKey])

  useEffect(() => {
    let cancelled = false
    void fetchJson<PublicPageRequests>(`/api/admin/public-page-requests?range=${range}`).then((data) => {
      if (!cancelled) setPageRequests({ range, data })
    })
    return () => { cancelled = true }
  }, [range, reloadKey])

  const requestsLoading = pageRequests?.range !== range
  const publicPageRequests = pageRequests?.range === range ? pageRequests.data : null

  const todayIndex =
    visitorStats?.daily.findIndex(
      (day) => day.date === visitorStats.today.date
    ) ?? -1
  const yesterday =
    visitorStats && todayIndex > 0
      ? visitorStats.daily[todayIndex - 1]
      : null
  const visitorTrend = visitorStats
    ? visitorStats.today.visitors - (yesterday?.visitors ?? 0)
    : undefined

  const visitorChartData =
    visitorStats?.daily.map((day) => ({
      date: day.date,
      visitors: day.visitors,
      homeVisitors: day.homeVisitors,
    })) ?? []

  const eventCountByName = new Map<string, number>()
  for (const event of eventCounts?.byEvent ?? []) {
    eventCountByName.set(event.event, event.count)
  }

  const tz =
    visitorStats?.timezone ?? homepageFlow?.timezone ?? "Asia/Seoul"
  const periodVisitors = visitorStats?.totals.visitors ?? 0
  const periodPageViews = visitorStats?.totals.pageViews ?? 0
  const pageViewsPerVisitor =
    periodVisitors > 0 ? periodPageViews / periodVisitors : 0
  const homeShare =
    periodVisitors > 0
      ? Math.round(
          ((visitorStats?.totals.homeVisitors ?? 0) / periodVisitors) * 100
        )
      : 0
  const exitCandidateRate =
    homepageFlow && homepageFlow.totals.pageViews > 0
      ? Math.round(
          (homepageFlow.totals.exits /
            homepageFlow.totals.pageViews) *
            100
        )
      : 0

  const exitStep = homepageFlow?.nextStepsFromHome.find(
    (step) => step.path === "__exit__"
  )
  const topInternalStep = homepageFlow?.nextStepsFromHome.find(
    (step) => step.path !== "__exit__"
  )

  const trackingChecks = conversionStatus
    ? [
        conversionStatus.internal.trackingEnabled,
        Boolean(conversionStatus.google.ga4MeasurementId),
        Boolean(conversionStatus.google.adsId) &&
          conversionStatus.google.demoConversionLabelConfigured,
        Boolean(conversionStatus.meta.pixelId),
        conversionStatus.meta.capiConfigured,
      ]
    : []
  const connectedTrackingCount = trackingChecks.filter(Boolean).length

  const handleDetailTabChange = (nextTab: TrafficDetailTab) => {
    setDetailTab(nextTab)
    replaceDetailQuery(nextTab)
  }

  const loadingValue = loading ? "—" : null
  const trendText =
    visitorTrend == null
      ? undefined
      : visitorTrend === 0
        ? "어제와 같음"
        : `어제 대비 ${visitorTrend > 0 ? "+" : ""}${visitorTrend}명`

  return (
    <div>
      {loadError && !loading && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#F2B8B8] bg-[#FCE9E9] px-3 py-2 text-[13px] text-[#B43E3E]">
          <span>트래픽 집계를 불러오지 못했습니다 — 아래 0으로 보이는 수치는 실측이 아닙니다.</span>
          <button
            type="button"
            onClick={() => setReloadKey((key) => key + 1)}
            className="rounded-md border border-[#F2B8B8] bg-white px-2 py-0.5 text-[12px] font-semibold text-[#B43E3E] transition-colors hover:bg-[#FCE9E9]"
          >
            다시 시도
          </button>
        </div>
      )}
      <p className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#615D59]">
        <span>페이지 요청은 동의 여부와 무관 · 아래 방문자와 행동은 분석 동의 기준 · 날짜 기준 {tz}</span>
        <span aria-hidden="true">·</span>
        <span>최근 업데이트 {formatUpdatedAt(generatedAt)}</span>
      </p>

      <section aria-labelledby="page-request-title" className="mb-5 overflow-hidden rounded-2xl border border-black/[0.08] bg-white">
        <div className="border-b border-black/[0.08] px-4 py-3 sm:px-6">
          <h2 id="page-request-title" className="text-[15px] font-bold text-[#111110]">전체 페이지 요청</h2>
          <p className="mt-1 text-[12px] leading-5 text-[#615D59]">공개 페이지의 HTML 요청 · 확인된 봇과 미리 불러오기 제외. 반복 접속과 미확인 봇이 포함될 수 있고, 캐시·페이지 내 이동은 빠질 수 있습니다. 방문자 수와는 다릅니다.</p>
        </div>
        <div className="grid grid-cols-2 gap-px bg-black/[0.08]">
          <DecisionMetric icon={<Eye aria-hidden="true" className="h-4 w-4" />} label="오늘 페이지 요청" value={requestsLoading ? "—" : publicPageRequests ? `${publicPageRequests.today.toLocaleString("ko-KR")}회` : "확인 필요"} hint="오늘 0시부터 · 동의 여부 무관" />
          <DecisionMetric icon={<Activity aria-hidden="true" className="h-4 w-4" />} label={`${range}일 페이지 요청`} value={requestsLoading ? "—" : publicPageRequests ? `${publicPageRequests.total.toLocaleString("ko-KR")}회` : "확인 필요"} hint={publicPageRequests ? "운영 도메인 기준" : "서버 트래픽 연결 상태를 확인하세요"} />
        </div>
      </section>

      <section
        aria-labelledby="traffic-summary-title"
        className="mb-5 overflow-hidden rounded-2xl border border-black/[0.08] bg-black/[0.08]"
      >
        <h2 id="traffic-summary-title" className="sr-only">
          핵심 트래픽 지표
        </h2>
        <div className="grid grid-cols-2 gap-px lg:grid-cols-4">
          <DecisionMetric
            icon={<Users aria-hidden="true" className="h-4 w-4" />}
            label="오늘 방문자"
            value={
              loadingValue ??
              (visitorStats?.today.visitors ?? 0).toLocaleString("ko-KR")
            }
            hint={`홈 ${(visitorStats?.today.homeVisitors ?? 0).toLocaleString("ko-KR")}명`}
            trend={trendText}
            trendDirection={
              visitorTrend == null || visitorTrend === 0
                ? "neutral"
                : visitorTrend > 0
                  ? "positive"
                  : "negative"
            }
          />
          <DecisionMetric
            icon={<Activity aria-hidden="true" className="h-4 w-4" />}
            label={`${range}일 방문자`}
            value={
              loadingValue ?? periodVisitors.toLocaleString("ko-KR")
            }
            hint={`홈 유입 비중 ${homeShare}%`}
          />
          <DecisionMetric
            icon={<Eye aria-hidden="true" className="h-4 w-4" />}
            label="방문당 페이지뷰"
            value={
              loadingValue ??
              pageViewsPerVisitor.toLocaleString("ko-KR", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              })
            }
            hint={`총 ${periodPageViews.toLocaleString("ko-KR")}회`}
          />
          <DecisionMetric
            icon={<Gauge aria-hidden="true" className="h-4 w-4" />}
            label="이탈 후보율"
            value={loadingValue ?? `${exitCandidateRate}%`}
            hint={`${(homepageFlow?.totals.exits ?? 0).toLocaleString("ko-KR")}회 · pagehide 기준`}
          />
        </div>
      </section>

      <section
        aria-labelledby="traffic-trend-title"
        className="mb-5 overflow-hidden rounded-2xl border border-black/[0.08] bg-white"
      >
        <div className="border-b border-black/[0.08] px-4 py-4 sm:px-6">
          <h2
            id="traffic-trend-title"
            className="text-[16px] font-bold tracking-[-0.01em] text-[#111110]"
          >
            방문자 추이
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-[#615D59]">
            전체 공개 페이지와 홈 순방문자를 한 축에서 비교합니다.
          </p>
        </div>
        <div className="p-4 sm:p-6">
          {loading ? (
            <div
              aria-label="방문자 추이 불러오는 중"
              className="h-[300px] animate-pulse rounded-xl bg-[#F0F0EC]"
            />
          ) : (
            <TrafficTrendChart rows={visitorChartData} />
          )}
        </div>
      </section>

      <section
        aria-labelledby="traffic-insights-title"
        className="mb-5 overflow-hidden rounded-2xl border border-black/[0.08] bg-white"
      >
        <div className="border-b border-black/[0.08] px-4 py-3 sm:px-6">
          <h2
            id="traffic-insights-title"
            className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]"
          >
            지금 볼 것
          </h2>
        </div>
        <div className="grid gap-px bg-black/[0.08] lg:grid-cols-3">
          <InsightItem
            icon={<Activity aria-hidden="true" className="h-4 w-4" />}
            eyebrow="홈 다음 행동"
            title={
              loading
                ? "확인 중"
                : `사이트 이탈 ${exitStep?.share ?? 0}%`
            }
            detail={`${(exitStep?.count ?? 0).toLocaleString("ko-KR")}회 · 내부 이동을 제외한 이탈 후보`}
            tone="danger"
          />
          <InsightItem
            icon={<ArrowUpRight aria-hidden="true" className="h-4 w-4" />}
            eyebrow="가장 큰 내부 이동"
            title={
              loading
                ? "확인 중"
                : `${topInternalStep ? pageName(topInternalStep.path) : "데이터 없음"} ${topInternalStep?.share ?? 0}%`
            }
            detail={
              topInternalStep
                ? `${topInternalStep.count.toLocaleString("ko-KR")}회 이동`
                : "연속 page_view 데이터가 더 필요합니다."
            }
            tone="brand"
          />
          <InsightItem
            icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
            eyebrow="추적 설정 상태"
            title={
              loading
                ? "확인 중"
                : `${connectedTrackingCount}/${trackingChecks.length || 5} 연결`
            }
            detail={
              connectedTrackingCount === trackingChecks.length &&
              trackingChecks.length > 0
                ? "주요 내부·외부 계측이 연결되어 있습니다."
                : "계측 진단에서 미설정 항목을 확인하세요."
            }
            tone={
              connectedTrackingCount === trackingChecks.length &&
              trackingChecks.length > 0
                ? "brand"
                : "neutral"
            }
          />
        </div>
      </section>

      {/* 넓은 화면: 페이지 성과(체류·이탈) 2 : 홈 다음 이동 1, 같은 높이로 나란히 */}
      <div className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section
          aria-labelledby="page-performance-title"
          className="overflow-hidden rounded-2xl border border-black/[0.08] bg-white"
        >
          <div className="border-b border-black/[0.08] px-4 py-3">
            <h2
              id="page-performance-title"
              className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]"
            >
              페이지 성과
            </h2>
            <p className="mt-0.5 text-[11px] leading-5 text-[#615D59]">
              많이 본 순 · 막대=1위 대비 · %=전체 페이지뷰 비중 · 이탈률 60%↑ 빨간 글씨
            </p>
          </div>
          {loading ? (
            <div className="space-y-1.5 p-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <div
                  key={index}
                  className="h-8 animate-pulse rounded-lg bg-[#F0F0EC]"
                />
              ))}
            </div>
          ) : (
            <div className="p-3 md:p-0">
              <PagePerformanceTable
                rows={homepageFlow?.topPages ?? []}
                totalPageViews={homepageFlow?.totals.pageViews}
                formatDuration={formatDuration}
              />
            </div>
          )}
        </section>

        <HomeNextStepsPanel
          steps={homepageFlow?.nextStepsFromHome ?? []}
          loading={loading}
        />
      </div>

      <TrafficConversionPanel
        activeTab={detailTab}
        onTabChange={handleDetailTabChange}
        loading={loading}
        metrics={{
          // CTA 클릭·자료 다운로드는 리드를 남기지 않는 행동이라 client_events 가 유일한 출처다
          // (그래서 분석 동의한 방문자만 잡힌다 — 패널이 그 사실을 라벨로 밝힌다).
          // 상담·구독 전환은 동의와 무관하게 leads 에 남으므로 그쪽을 정본으로 쓴다.
          cta: eventCountByName.get("click_cta") ?? 0,
          demo: leadConversions?.homepage ?? 0,
          newsletter: leadConversions?.newsletter ?? 0,
          download: eventCountByName.get("download_materials") ?? 0,
        }}
        leadConversionsUnavailable={leadConversionsUnavailable}
        eventTotal={eventCounts?.total ?? 0}
        eventRows={eventCounts?.byEvent ?? []}
        buttonRows={eventCounts?.byButton ?? []}
        status={conversionStatus}
      />
    </div>
  )
}
