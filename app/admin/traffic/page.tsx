"use client"

import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import {
  BarChart2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  Link2,
  MousePointerClick,
  Users,
  XCircle,
} from "lucide-react"
import { adminFetchJsonCached } from "@/lib/admin-client"
import { InsightCard, MetricRankList, Panel, StatTile, TableEmpty } from "@/components/admin/viz"

// 방문자/트래픽 전용 대시보드.
// 기존 /admin/analytics 안에 묻혀 있던 "홈페이지 흐름 · 추적 현황"을 따로 모은 화면이다.
// 데이터는 전부 기존 어드민 API를 재사용한다(신규 백엔드 없음):
//   - /api/admin/visitor-stats          방문자 수 기본
//   - /api/admin/homepage-flow          페이지별 흐름·이탈
//   - /api/admin/event-counts           전환 이벤트 카운트
//   - /api/admin/marketing/conversions/status  GA4·Meta·Google Ads 픽셀 설정 상태

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
  daily: Array<{ date: string; visitors: number; pageViews: number; downloads: number; exits: number }>
  nextStepsFromHome: Array<{ path: string; label: string; count: number; share: number }>
  topPages: HomepageFlowPageRow[]
  highDwellPages: HomepageFlowPageRow[]
  exitPages: HomepageFlowPageRow[]
}

interface ClientEventCounts {
  rangeDays: number
  total: number
  byEvent: Array<{ event: string; count: number; lastSeen: string | null }>
  byButton: Array<{ button: string; event: string; count: number; lastSeen: string | null }>
  daily: Array<{ date: string; count: number }>
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

const DailyEventCountsChart = dynamic(
  () => import("@/components/admin/analytics/AnalyticsCharts").then((m) => m.DailyEventCountsChart),
  { ssr: false, loading: () => <div className="h-56 rounded-xl bg-[#f0f0ec]" /> }
)

function StatusRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-[#e8e8e4] bg-white px-3 py-2.5">
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[#111110]">{label}</p>
        <p className="mt-0.5 truncate text-[11px] text-[#1a1a1a]/45">{detail}</p>
      </div>
      <span
        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-medium ${
          ok ? "border-green-100 bg-green-50 text-green-700" : "border-[#e8e8e4] bg-[#f0f0ec] text-[#1a1a1a]/55"
        }`}
      >
        {ok ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
        {ok ? "연결됨" : "미설정"}
      </span>
    </div>
  )
}

export default function TrafficPage() {
  const [range, setRange] = useState<RangeDays>(30)
  const [visitorStats, setVisitorStats] = useState<VisitorStats | null>(null)
  const [homepageFlow, setHomepageFlow] = useState<HomepageFlow | null>(null)
  const [eventCounts, setEventCounts] = useState<ClientEventCounts | null>(null)
  const [conversionStatus, setConversionStatus] = useState<MarketingConversionStatus | null>(null)
  // 첫 페치가 끝나기 전(state가 null)에는 실패 카피 대신 스켈레톤을 보여준다 —
  // 로딩과 진짜 실패/빈 데이터를 구분한다.
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    // Overview/Analytics와 동일 패턴 — 내부 async 함수로 감싸 로딩 플래그를 관리한다
    // (이펙트 바디에서 setState 직접 호출 회피).
    const load = async () => {
      setLoading(true)
      const [stats, flow, counts, status] = await Promise.all([
        fetchJson<VisitorStats>(`/api/admin/visitor-stats?range=${range}`),
        fetchJson<HomepageFlow>(`/api/admin/homepage-flow?range=${range}`),
        fetchJson<ClientEventCounts>(`/api/admin/event-counts?range=${range}`),
        fetchJson<MarketingConversionStatus>("/api/admin/marketing/conversions/status"),
      ])
      if (cancelled) return
      setVisitorStats(stats ?? null)
      setHomepageFlow(flow ?? null)
      setEventCounts(counts ?? null)
      setConversionStatus(status ?? null)
      setLoading(false)
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [range])

  // 오늘 vs 어제 추세 (방문자 수 기본 카드).
  const todayIndex = visitorStats?.daily.findIndex((d) => d.date === visitorStats.today.date) ?? -1
  const yesterday = visitorStats && todayIndex > 0 ? visitorStats.daily[todayIndex - 1] : null
  const visitorTrend = visitorStats ? visitorStats.today.visitors - (yesterday?.visitors ?? 0) : undefined
  const homeVisitorTrend = visitorStats ? visitorStats.today.homeVisitors - (yesterday?.homeVisitors ?? 0) : undefined

  const allVisitorChartData = visitorStats?.daily.map((d) => ({ date: d.date, count: d.visitors })) ?? []
  const homeVisitorChartData = visitorStats?.daily.map((d) => ({ date: d.date, count: d.homeVisitors })) ?? []

  const eventCountByName = new Map<string, number>()
  for (const e of eventCounts?.byEvent ?? []) eventCountByName.set(e.event, e.count)
  const fmtCount = (n: number | undefined) => (n && n > 0 ? `${n.toLocaleString()}회` : "0회")

  // 전환 이벤트 요약 카드 (자체 client_events 집계).
  const conversionCards = [
    { title: "CTA 클릭", event: "click_cta", icon: <MousePointerClick className="h-4 w-4" /> },
    { title: "데모 신청", event: "submit_demo_request", icon: <CheckCircle2 className="h-4 w-4" /> },
    { title: "뉴스레터 구독", event: "submit_newsletter", icon: <Users className="h-4 w-4" /> },
    { title: "자료 다운로드", event: "download_materials", icon: <Download className="h-4 w-4" /> },
  ].map((c) => ({ ...c, count: eventCountByName.get(c.event) }))

  const tz = visitorStats?.timezone ?? homepageFlow?.timezone ?? "Asia/Seoul"

  // 로딩 스켈레톤 — 중립 톤(#f0f0ec, 어드민 공통), 파스텔/그린 채움 없음.
  const chartSkeleton = <div className="h-56 w-full animate-pulse rounded-xl bg-[#f0f0ec]" />
  const panelSkeleton = (
    <div className="space-y-2.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-11 animate-pulse rounded-xl bg-[#f0f0ec]" />
      ))}
    </div>
  )

  return (
    <div className="px-4 pt-8 pb-16 sm:px-6 sm:pt-10 sm:pb-20 lg:px-8">
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-widest text-[#1a1a1a]/30">Admin</p>
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">방문자 / 트래픽</h1>
          <p className="mt-2 max-w-2xl text-[13px] text-[#1a1a1a]/45">
            홈페이지 방문자 수와 페이지별 흐름·이탈, 전환 추적 상태만 모은 화면입니다. 분석 쿠키에 동의한 방문자의 자체 DB 집계이며, 날짜
            기준은 {tz}입니다.
          </p>
        </div>
        <div className="grid w-full grid-cols-3 gap-1 rounded-lg bg-[#f0f0ec] p-1 sm:w-auto">
          {([7, 14, 30] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={range === value}
              onClick={() => setRange(value)}
              className={`rounded-md px-2.5 py-2 text-[12px] font-medium whitespace-nowrap transition-colors sm:px-3 sm:py-1.5 ${
                range === value ? "bg-white text-[#111110] shadow-sm" : "text-[#1a1a1a]/50"
              }`}
            >
              {value}일
            </button>
          ))}
        </div>
      </div>

      {/* ── 방문자 수 기본 ─────────────────────────────── */}
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile
          icon={<Users className="h-4 w-4" />}
          label="오늘 방문자"
          value={visitorStats ? visitorStats.today.visitors.toLocaleString() : "..."}
          hint={`전체 페이지 · 홈 ${visitorStats?.today.homeVisitors.toLocaleString() ?? 0}명`}
          trend={visitorTrend}
        />
        <StatTile
          icon={<BarChart2 className="h-4 w-4" />}
          label="오늘 홈 방문자"
          value={visitorStats ? visitorStats.today.homeVisitors.toLocaleString() : "..."}
          hint={`홈 페이지뷰 ${visitorStats?.today.homePageViews.toLocaleString() ?? 0}회`}
          trend={homeVisitorTrend}
        />
        <StatTile
          icon={<Users className="h-4 w-4" />}
          label={`${range}일 방문자`}
          value={visitorStats ? visitorStats.totals.visitors.toLocaleString() : "..."}
          hint={`홈 ${visitorStats?.totals.homeVisitors.toLocaleString() ?? 0}명`}
        />
        <StatTile
          icon={<Eye className="h-4 w-4" />}
          label={`${range}일 페이지뷰`}
          value={visitorStats ? visitorStats.totals.pageViews.toLocaleString() : "..."}
          hint={`홈 PV ${visitorStats?.totals.homePageViews.toLocaleString() ?? 0}회`}
        />
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Panel title="일별 방문자" description="전체 공개 페이지 순방문자 추이입니다.">
          {loading ? (
            chartSkeleton
          ) : allVisitorChartData.length > 0 ? (
            <div className="h-56 w-full">
              <DailyEventCountsChart data={allVisitorChartData} />
            </div>
          ) : (
            <TableEmpty message="방문자 집계를 불러오지 못했습니다. Supabase 연결과 client_events 적재 상태를 확인하세요." />
          )}
        </Panel>
        <Panel title="일별 홈 방문자" description="홈(/) 페이지 순방문자 추이입니다.">
          {loading ? (
            chartSkeleton
          ) : homeVisitorChartData.length > 0 ? (
            <div className="h-56 w-full">
              <DailyEventCountsChart data={homeVisitorChartData} />
            </div>
          ) : (
            <TableEmpty message="홈 방문자 데이터가 없습니다." />
          )}
        </Panel>
      </div>

      {/* ── 페이지별 흐름·이탈 ─────────────────────────── */}
      <div className="mb-3 mt-10 flex items-center gap-2">
        <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">페이지별 흐름·이탈</h2>
        <span className="text-[11px] text-[#1a1a1a]/35">최근 {range}일</span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatTile
          icon={<Users className="h-4 w-4" />}
          label="홈 방문자"
          value={homepageFlow ? homepageFlow.totals.homeVisitors.toLocaleString() : "..."}
          hint={`홈 PV ${homepageFlow?.totals.homePageViews.toLocaleString() ?? 0}회`}
        />
        <StatTile
          icon={<BarChart2 className="h-4 w-4" />}
          label="전체 페이지뷰"
          value={homepageFlow ? homepageFlow.totals.pageViews.toLocaleString() : "..."}
          hint={`방문자 ${homepageFlow?.totals.visitors.toLocaleString() ?? 0}명`}
        />
        <StatTile
          icon={<ChevronRight className="h-4 w-4" />}
          label="이탈 후보"
          value={homepageFlow ? homepageFlow.totals.exits.toLocaleString() : "..."}
          hint="pagehide 기준 · 내부 이동 제외"
        />
        <StatTile
          icon={<Clock3 className="h-4 w-4" />}
          label="평균 체류"
          value={homepageFlow ? formatDuration(homepageFlow.totals.avgDwellSeconds) : "..."}
          hint="page_exit 샘플 기준"
        />
      </div>

      <div className="mb-6">
        <Panel
          title="홈에서 다음 행동"
          description="홈 방문 후 다음으로 이동한 경로 또는 사이트 이탈 후보입니다."
          action={<span className="text-[12px] text-[#1a1a1a]/40">{tz}</span>}
        >
          {loading ? (
            panelSkeleton
          ) : homepageFlow ? (
            <div className="grid gap-6 xl:grid-cols-[1.1fr_1fr]">
              <div className="space-y-3">
                {homepageFlow.nextStepsFromHome.map((step) => (
                  <div key={step.path} className="rounded-2xl border border-[#e8e8e4] bg-[#fafaf8] px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#084734]" />
                        <span className="truncate font-mono text-[12px] text-[#111110]">{formatPathLabel(step.label)}</span>
                      </div>
                      <span className="text-[12px] font-semibold text-[#111110]">
                        {step.count.toLocaleString()}회 · {step.share}%
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-[#084734]" style={{ width: `${Math.max(6, step.share)}%` }} />
                    </div>
                  </div>
                ))}
                {homepageFlow.nextStepsFromHome.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-[#e8e8e4] bg-[#fafaf8] px-4 py-8 text-center text-[12px] text-[#1a1a1a]/45">
                    아직 홈 방문 흐름을 만들 만큼 연속 page_view 데이터가 없습니다.
                  </p>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <InsightCard
                  eyebrow="Home"
                  title={`${homepageFlow.totals.homeVisitors.toLocaleString()}명`}
                  description={`홈 조회 ${homepageFlow.totals.homePageViews.toLocaleString()}회`}
                  tone="brand"
                />
                <InsightCard
                  eyebrow="Exit"
                  title={`${homepageFlow.totals.exits.toLocaleString()}회`}
                  description="pagehide로 잡힌 사이트 이탈 후보입니다. SPA 내부 이동은 제외합니다."
                  tone={homepageFlow.totals.exits > 0 ? "caution" : "neutral"}
                />
                <InsightCard
                  eyebrow="Dwell"
                  title={formatDuration(homepageFlow.totals.avgDwellSeconds)}
                  description="route change/pagehide 시점에 기록된 체류 샘플 평균입니다."
                  tone="neutral"
                />
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-[#1a1a1a]/45">
              홈페이지 흐름 데이터를 불러오지 못했습니다. client_events 적재와 Supabase 연결을 확인하세요.
            </p>
          )}
        </Panel>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Panel title="방문 많은 페이지" description="page_view 기준 상위 페이지입니다.">
          <MetricRankList
            rows={homepageFlow?.topPages ?? []}
            empty="페이지뷰 데이터가 없습니다."
            getLabel={(row) => formatPathLabel(row.path)}
            getValue={(row) => `${row.pageViews.toLocaleString()}회`}
            getMeta={(row) => `방문자 ${row.visitors.toLocaleString()}명 · 평균 체류 ${formatDuration(row.avgDwellSeconds)}`}
            getMagnitude={(row) => row.pageViews}
          />
        </Panel>
        <Panel title="체류 많은 페이지" description="page_exit duration_ms 평균 기준입니다.">
          <MetricRankList
            rows={homepageFlow?.highDwellPages ?? []}
            empty="체류시간 샘플이 아직 없습니다."
            getLabel={(row) => formatPathLabel(row.path)}
            getValue={(row) => formatDuration(row.avgDwellSeconds)}
            getMeta={(row) => `PV ${row.pageViews.toLocaleString()}회 · 이탈 후보 ${row.exits.toLocaleString()}회`}
            getMagnitude={(row) => row.avgDwellSeconds}
          />
        </Panel>
      </div>

      <div className="mb-6">
        <Panel title="나가는 곳 많은 페이지" description="pagehide 기반 사이트 이탈 후보입니다. 내부 라우팅 이동은 제외합니다.">
          <MetricRankList
            rows={homepageFlow?.exitPages ?? []}
            empty="이탈 후보 데이터가 아직 없습니다."
            getLabel={(row) => formatPathLabel(row.path)}
            getValue={(row) => `${row.exits.toLocaleString()}회`}
            getMeta={(row) => `이탈률 ${row.exitRate}% · PV ${row.pageViews.toLocaleString()}회`}
            getMagnitude={(row) => row.exits}
          />
        </Panel>
      </div>

      {/* ── 전환 추적 현황 ─────────────────────────────── */}
      <div className="mb-3 mt-10 flex items-center gap-2">
        <h2 className="text-[15px] font-bold tracking-[-0.01em] text-[#111110]">전환 추적 현황</h2>
        <span className="text-[11px] text-[#1a1a1a]/35">최근 {range}일</span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {conversionCards.map((card) => (
          <StatTile
            key={card.event}
            icon={card.icon}
            label={card.title}
            value={fmtCount(card.count)}
            hint={card.event}
            hintMono
          />
        ))}
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Panel
          title="이벤트별 카운트"
          description="자체 DB(client_events)에 적재된 이벤트 타입별 집계입니다."
          action={<span className="text-[12px] text-[#1a1a1a]/40">총 {(eventCounts?.total ?? 0).toLocaleString()}건</span>}
        >
          <div className="space-y-2">
            {(eventCounts?.byEvent ?? []).map((row) => (
              <div
                key={row.event}
                className="flex items-center justify-between rounded-xl border border-[#e8e8e4] bg-white px-3 py-2 text-[13px]"
              >
                <span className="font-mono text-[12px] text-[#111110]">{row.event}</span>
                <span className="font-semibold text-[#111110]">{row.count.toLocaleString()}회</span>
              </div>
            ))}
            {(eventCounts?.byEvent ?? []).length === 0 && (
              <TableEmpty message="아직 적재된 이벤트가 없습니다. NEXT_PUBLIC_INTERNAL_TRACKING_ENABLED 활성 후 공개 사이트에서 CTA를 눌러보세요." />
            )}
          </div>
        </Panel>
        <Panel title="Top CTA 버튼" description="가장 많이 눌린 button 파라미터 상위 항목입니다.">
          <div className="space-y-2">
            {(eventCounts?.byButton ?? []).slice(0, 10).map((row) => (
              <div
                key={`${row.event}::${row.button}`}
                className="flex items-center justify-between rounded-xl border border-[#e8e8e4] bg-white px-3 py-2 text-[13px]"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-mono text-[12px] text-[#111110]">{row.button}</span>
                  <span className="text-[10px] text-[#1a1a1a]/45">{row.event}</span>
                </div>
                <span className="shrink-0 font-semibold text-[#111110]">{row.count.toLocaleString()}회</span>
              </div>
            ))}
            {(eventCounts?.byButton ?? []).length === 0 && <TableEmpty message="CTA 버튼 데이터가 없습니다." />}
          </div>
        </Panel>
      </div>

      <div className="mb-6 grid gap-6 xl:grid-cols-2">
        <Panel title="일별 이벤트" description="자체 DB에 적재된 전체 클라이언트 이벤트 추이입니다.">
          {loading ? (
            chartSkeleton
          ) : eventCounts && eventCounts.daily.length > 0 ? (
            <div className="h-56 w-full">
              <DailyEventCountsChart data={eventCounts.daily} />
            </div>
          ) : (
            <TableEmpty message="적재된 이벤트가 없습니다." />
          )}
        </Panel>
        <Panel
          title="전환 픽셀 설정 상태"
          description="외부 광고 플랫폼(GA4·Meta·Google Ads) 연결 여부입니다. 코드/환경변수 기준으로 판단합니다."
          action={
            conversionStatus ? (
              <Link2 className="h-4 w-4 text-[#1a1a1a]/30" />
            ) : (
              <span className="text-[12px] text-[#1a1a1a]/40">불러오는 중…</span>
            )
          }
        >
          {loading ? (
            panelSkeleton
          ) : conversionStatus ? (
            <div className="space-y-2.5">
              <StatusRow
                label="내부 추적 (client_events)"
                ok={conversionStatus.internal.trackingEnabled}
                detail="공개 사이트 page_view·이벤트 자체 적재"
              />
              <StatusRow
                label="Google Analytics 4"
                ok={Boolean(conversionStatus.google.ga4MeasurementId)}
                detail={conversionStatus.google.ga4MeasurementId ?? "측정 ID 미설정"}
              />
              <StatusRow
                label="Google Ads 전환"
                ok={Boolean(conversionStatus.google.adsId) && conversionStatus.google.demoConversionLabelConfigured}
                detail={conversionStatus.google.adsId || "광고 ID 미설정"}
              />
              <StatusRow
                label="Meta Pixel"
                ok={Boolean(conversionStatus.meta.pixelId)}
                detail={conversionStatus.meta.pixelId ?? "픽셀 ID 미설정"}
              />
              <StatusRow
                label="Meta 전환 API (CAPI)"
                ok={conversionStatus.meta.capiConfigured}
                detail={conversionStatus.meta.capiConfigured ? "서버 전환 전송 구성됨" : "액세스 토큰·데이터셋 미설정"}
              />
              <p className="pt-1 text-[11px] text-[#1a1a1a]/40">
                값 수정은 <a href="/admin/settings" className="underline transition-colors hover:text-[#111110]">설정</a>에서 합니다.
              </p>
            </div>
          ) : (
            <TableEmpty message="전환 설정 상태를 불러오지 못했습니다." />
          )}
        </Panel>
      </div>
    </div>
  )
}
