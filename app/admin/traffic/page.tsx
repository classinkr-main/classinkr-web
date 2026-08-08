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
import PagePerformanceTable from "@/components/admin/traffic/PagePerformanceTable"
import { adminFetchJsonCached } from "@/lib/admin-client"

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
  if (!seconds || seconds <= 0) return "데이터 없음"
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return minutes > 0 ? `${minutes}분 ${rest}초` : `${rest}초`
}

function formatPathLabel(path: string) {
  if (path === "/") return "홈"
  if (path === "__exit__") return "사이트 이탈"
  return path
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

function replaceTrafficQuery(range: RangeDays, detailTab: TrafficDetailTab) {
  if (typeof window === "undefined") return
  const url = new URL(window.location.href)
  url.searchParams.set("range", String(range))
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

export default function TrafficPage() {
  const [range, setRange] = useState<RangeDays>(30)
  const [rangeReady, setRangeReady] = useState(false)
  const [detailTab, setDetailTab] =
    useState<TrafficDetailTab>("conversions")
  const [visitorStats, setVisitorStats] = useState<VisitorStats | null>(null)
  const [homepageFlow, setHomepageFlow] = useState<HomepageFlow | null>(null)
  const [eventCounts, setEventCounts] = useState<ClientEventCounts | null>(
    null
  )
  const [conversionStatus, setConversionStatus] =
    useState<MarketingConversionStatus | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const requestedRange = Number(params.get("range"))
    const requestedTab =
      params.get("detail") === "diagnostics"
        ? "diagnostics"
        : "conversions"

    queueMicrotask(() => {
      if (
        requestedRange === 7 ||
        requestedRange === 14 ||
        requestedRange === 30
      ) {
        setRange(requestedRange)
      }
      setDetailTab(requestedTab)
      setRangeReady(true)
    })
  }, [])

  useEffect(() => {
    if (!rangeReady) return
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
      setConversionStatus(status ?? null)
      setGeneratedAt(summary?.generatedAt ?? null)
      setLoading(false)
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [range, rangeReady])

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

  const handleRangeChange = (nextRange: RangeDays) => {
    setRange(nextRange)
    replaceTrafficQuery(nextRange, detailTab)
  }

  const handleDetailTabChange = (nextTab: TrafficDetailTab) => {
    setDetailTab(nextTab)
    replaceTrafficQuery(range, nextTab)
  }

  const loadingValue = loading ? "—" : null
  const trendText =
    visitorTrend == null
      ? undefined
      : visitorTrend === 0
        ? "어제와 같음"
        : `어제 대비 ${visitorTrend > 0 ? "+" : ""}${visitorTrend}명`

  return (
    <div className="px-4 pt-8 pb-16 sm:px-6 sm:pt-10 sm:pb-20 lg:px-8">
      <header className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-[26px] font-bold tracking-[-0.035em] text-[#111110]">
            방문자 / 트래픽
          </h1>
          <p className="mt-2 max-w-3xl text-[13px] leading-6 text-[#615D59]">
            홈페이지 방문자 수와 페이지별 흐름·이탈, 전환 추적 상태를
            운영 판단 순서로 봅니다. 분석 쿠키에 동의한 방문자의 자체 DB
            집계이며, 날짜 기준은 {tz}입니다.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#615D59]">
            <span>최근 업데이트 {formatUpdatedAt(generatedAt)}</span>
            <span aria-hidden="true">·</span>
            <span>자체 수집 client_events</span>
          </div>
        </div>

        <div
          className="grid w-full grid-cols-3 gap-1 rounded-lg bg-[#F0F0EC] p-1 xl:w-auto"
          aria-label="조회 기간"
          role="group"
        >
          {([7, 14, 30] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => handleRangeChange(value)}
              className={`min-h-11 rounded-md px-4 text-[13px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2 ${
                range === value
                  ? "bg-white text-[#111110] shadow-[0_1px_4px_rgba(17,17,16,0.08)]"
                  : "text-[#615D59] hover:text-[#111110]"
              }`}
            >
              {value}일
            </button>
          ))}
        </div>
      </header>

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
                : `${formatPathLabel(topInternalStep?.path ?? "데이터 없음")} ${topInternalStep?.share ?? 0}%`
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

      <section
        aria-labelledby="page-performance-title"
        className="mb-5 overflow-hidden rounded-2xl border border-black/[0.08] bg-white"
      >
        <div className="border-b border-black/[0.08] px-4 py-4 sm:px-6">
          <h2
            id="page-performance-title"
            className="text-[16px] font-bold tracking-[-0.01em] text-[#111110]"
          >
            페이지 성과
          </h2>
          <p className="mt-1 text-[12px] leading-5 text-[#615D59]">
            페이지뷰·방문자·체류·이탈을 같은 행에서 비교합니다.
          </p>
        </div>
        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-14 animate-pulse rounded-xl bg-[#F0F0EC]"
                />
              ))}
            </div>
          ) : (
            <PagePerformanceTable
              rows={homepageFlow?.topPages ?? []}
              formatLabel={formatPathLabel}
              formatDuration={formatDuration}
            />
          )}
        </div>
      </section>

      <TrafficConversionPanel
        activeTab={detailTab}
        onTabChange={handleDetailTabChange}
        loading={loading}
        metrics={{
          cta: eventCountByName.get("click_cta") ?? 0,
          demo: eventCountByName.get("submit_demo_request") ?? 0,
          newsletter: eventCountByName.get("submit_newsletter") ?? 0,
          download: eventCountByName.get("download_materials") ?? 0,
        }}
        eventTotal={eventCounts?.total ?? 0}
        eventRows={eventCounts?.byEvent ?? []}
        buttonRows={eventCounts?.byButton ?? []}
        status={conversionStatus}
      />
    </div>
  )
}
