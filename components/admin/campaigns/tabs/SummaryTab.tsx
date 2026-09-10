"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { PeriodToggle } from "@/components/admin/PeriodToggle"
import { ChartSkeleton, EmptyState, Skeleton } from "@/components/admin/viz"
import { BriefingCard } from "@/components/admin/campaigns/perf/BriefingCard"
import type {
  BriefingAction,
  BriefingCardProps,
  BriefingContent,
} from "@/components/admin/campaigns/perf/BriefingCard"
import { FunnelCard } from "@/components/admin/campaigns/perf/FunnelCard"
import { KpiStrip } from "@/components/admin/campaigns/perf/KpiStrip"
import { TodayIntakeCard } from "@/components/admin/campaigns/perf/TodayIntakeCard"
import { UpdatesFeed } from "@/components/admin/campaigns/perf/UpdatesFeed"
import type { UpdateSubmitInput } from "@/components/admin/campaigns/perf/UpdatesFeed"
import { WeeklyReportDialog } from "@/components/admin/campaigns/perf/WeeklyReportDialog"
import { COUNT, PCT1, money } from "@/components/admin/campaigns/event-format"
import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import { ANOMALY_KIND_LABEL, type AnomalyFlag, type AnomalyKind } from "@/lib/marketing/anomaly"
import type { MarketingPerfResponse, PerfPeriodKey } from "@/lib/marketing/perf"

// "요약" 탭 = 마케팅 퍼포먼스 대시보드.
// 데이터는 perf 단일 엔드포인트(/api/admin/marketing/perf) 하나만 쓴다 — 행사·리드 코어
// 파생값(구 aggregate/perEventEcon)은 더 이상 받지 않는다(행사 성과 비교는 EventsTab 으로 이동).

// Recharts 를 끄는 두 섹션만 청크 분리 — 나머지(KPI·브리핑·퍼널믹스·피드)는 Recharts-free 정적 import.
const DailyTrendSection = dynamic(
  () => import("@/components/admin/campaigns/perf/DailyTrendSection").then((m) => m.DailyTrendSection),
  { ssr: false, loading: () => <ChartSkeleton className="h-[380px]" /> }
)
const CampaignScoreboard = dynamic(
  () => import("@/components/admin/campaigns/perf/CampaignScoreboard").then((m) => m.CampaignScoreboard),
  { ssr: false, loading: () => <ChartSkeleton className="h-[280px]" /> }
)
// 소재별 CPL(Compass 브리지) — 행마다 스파크라인이 있어 Recharts 를 끈다. 같은 청크 규약.
const CreativeCplCard = dynamic(
  () => import("@/components/admin/campaigns/perf/CreativeCplCard").then((m) => m.CreativeCplCard),
  { ssr: false, loading: () => <ChartSkeleton className="h-[300px]" /> }
)

/* ─── usePerf — perf 응답 fetch + 기간 레이스 가드 ────────────────────────────── */

// 서버 메모(45초)와 동일한 클라이언트 TTL. 명시 새로고침은 force + fresh=1 로 양쪽 다 우회한다.
const PERF_TTL_MS = 45_000

function usePerf(period: PerfPeriodKey, refreshNonce: number) {
  const [data, setData] = useState<MarketingPerfResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 기간 연타 시 늦게 온 이전 기간 응답이 화면을 덮지 않도록 시퀀스로 "마지막 요청"만 반영한다
  // (페이지 loadMeta 의 metaRequestSeqRef 와 동일 패턴).
  const seqRef = useRef(0)

  const load = useCallback(
    async ({ fresh = false }: { fresh?: boolean } = {}) => {
      const seq = ++seqRef.current
      setLoading(true)
      setError(null)
      try {
        // fresh=1 은 서버 45초 메모 우회 — cacheKey 를 고정해 fresh 응답이 같은 클라이언트
        // 캐시 슬롯을 갱신하게 한다(URL 이 달라 캐시가 갈라지는 것 방지).
        const url = `/api/admin/marketing/perf?period=${period}${fresh ? "&fresh=1" : ""}`
        const response = await adminFetchJsonCached<MarketingPerfResponse>(url, undefined, {
          ttlMs: PERF_TTL_MS,
          cacheKey: `marketing-perf:${period}`,
          force: fresh,
          staleIfError: !fresh,
        })
        if (seq !== seqRef.current) return
        setData(response)
      } catch (e) {
        if (seq !== seqRef.current) return
        setError(e instanceof Error ? e.message : "퍼포먼스 집계 로딩 실패")
      } finally {
        if (seq === seqRef.current) setLoading(false)
      }
    },
    [period]
  )

  useEffect(() => {
    void load()
  }, [load])

  // 헤더 "동기화" 버튼 — 페이지가 nonce 를 올리면 캐시를 우회해 새로 받는다(마운트 직후 값은 무시).
  const handledNonceRef = useRef(refreshNonce)
  useEffect(() => {
    if (refreshNonce === handledNonceRef.current) return
    handledNonceRef.current = refreshNonce
    void load({ fresh: true })
  }, [refreshNonce, load])

  return { data, loading, error, reload: load }
}

/* ─── useInsights — AI 주간 브리핑 + 현재 이상 신호 ───────────────────────────── */

/** /api/admin/marketing/insights 응답의 클라이언트 측 최소 사본 — 서버 계약의 정본은
 *  app/api/admin/marketing/insights/route.ts 다. 저장소 타입(lib/repositories/marketing-insights)은
 *  server-only 모듈이라 클라이언트 컴포넌트에서 직접 import 하지 않는다. */
interface MarketingInsightRecord {
  headline: string
  created_at: string
  payload: {
    highlights?: string[]
    next_actions?: Array<{ title?: string; why?: string }>
    /** 브리핑이 실제로 본 기간 — 대시보드 토글과 무관하다(브리핑은 항상 30일 기준). */
    period?: { key?: string }
  }
}

interface MarketingInsightsResponse {
  insight: MarketingInsightRecord | null
  /** 브리핑 신선도와 무관한 "현재" 이상 신호 — 서버가 매 요청 계산한다. */
  anomalies: AnomalyFlag[]
  from?: string
  warnings?: number
  error?: string
}

// 브리핑은 주 1회 크론이 만든다 — perf(45초)보다 훨씬 길게 잡아도 신선도가 상하지 않는다.
const INSIGHTS_TTL_MS = 5 * 60_000

function useInsights(refreshNonce: number) {
  const [data, setData] = useState<MarketingInsightsResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const seqRef = useRef(0)
  // 재생성 연타 방지 — setState 는 비동기라 regenerating 상태만으로는 두 번째 클릭을 못 막는다
  // (MetaTab 의 AiCreativeSuggestSection.runningRef 와 같은 패턴). ?force=1 만 Gemini 를 부르는
  // 유료 경로라 이 경로만 잠근다 — 저장분 재조회(fresh)는 값싸고 seqRef 가 이미 레이스를 막는다.
  const regeneratingRef = useRef(false)

  const load = useCallback(
    async ({ fresh = false, regenerate = false }: { fresh?: boolean; regenerate?: boolean } = {}) => {
      if (regenerate) {
        if (regeneratingRef.current) return
        regeneratingRef.current = true
      }
      const seq = ++seqRef.current
      if (regenerate) setRegenerating(true)
      try {
        // ?force=1 만 Gemini 를 부른다. fresh 는 클라이언트 캐시만 우회(저장된 브리핑 재조회).
        const url = `/api/admin/marketing/insights${regenerate ? "?force=1" : ""}`
        const response = await adminFetchJsonCached<MarketingInsightsResponse>(url, undefined, {
          ttlMs: INSIGHTS_TTL_MS,
          cacheKey: "marketing-insights",
          force: fresh || regenerate,
          staleIfError: !regenerate,
        })
        if (seq !== seqRef.current) return
        setData(response)
        setError(null)
      } catch (e) {
        if (seq !== seqRef.current) return
        // 브리핑은 보조 정보 — 실패해도 대시보드는 그대로 두고 카드만 규칙 기반으로 폴백한다.
        setError(e instanceof Error ? e.message : "브리핑 조회 실패")
      } finally {
        // seq 와 무관하게 잠금을 푼다 — 늦게 온 응답 때문에 버튼이 영구히 잠기면 안 된다.
        if (regenerate) {
          regeneratingRef.current = false
          setRegenerating(false)
        }
      }
    },
    []
  )

  useEffect(() => {
    void load()
  }, [load])

  // 헤더 "동기화" — 저장된 브리핑만 다시 읽는다(재생성은 카드의 명시 버튼으로만).
  const handledNonceRef = useRef(refreshNonce)
  useEffect(() => {
    if (refreshNonce === handledNonceRef.current) return
    handledNonceRef.current = refreshNonce
    void load({ fresh: true })
  }, [refreshNonce, load])

  return { data, error, regenerating, reload: load }
}

/* ─── 브리핑 콘텐츠 — AI payload 우선, 실패 시 규칙 기반 폴백 ───────────────────── */
// 구 InsightsBanner 인사이트 + 추천 액션 규칙의 이식판 — 데이터 축이 행사 수기 집계에서
// perf 응답(Meta 스냅샷·리드 테이블·캠페인 페이싱)으로 바뀌었으므로 같은 정신(실측된 축만
// 말하고, null 은 문장으로 만들지 않는다)으로 재구성했다.
// AI 브리핑이 없거나 생성에 실패하면 이 규칙 생성기로 폴백한다 — 빈 카드는 만들지 않는다.

const PERIOD_BADGE: Record<PerfPeriodKey, string> = {
  "7d": "최근 7일",
  "30d": "최근 30일",
  "90d": "최근 90일",
  quarter: "이번 분기",
}

const signed = (n: number) => (n > 0 ? `+${n}` : `${n}`)

function buildBriefing(perf: MarketingPerfResponse): BriefingContent {
  const { kpis, snapshotAt, scoreboard } = perf
  const spend = kpis.spendUsd.value
  const leads = kpis.leads.value
  const snapshotMissing = spend == null && snapshotAt == null

  const items: string[] = []
  const actions: BriefingAction[] = []

  // 헤드라인 1문장 — 실측된 축만 말한다.
  let headline: string
  if (snapshotMissing) {
    headline = "Meta 인사이트 스냅샷이 아직 적재되지 않아 광고 지표를 집계할 수 없습니다."
  } else if (leads != null && leads === 0) {
    headline = `기간 내 집계된 리드가 없습니다${spend != null ? ` — 광고비는 ${money(spend, "USD")} 집행됐습니다` : ""}.`
  } else {
    const parts: string[] = []
    if (spend != null) parts.push(`광고비 ${money(spend, "USD")}`)
    if (leads != null) {
      parts.push(
        `리드 ${COUNT.format(leads)}건${kpis.leads.deltaPct != null ? ` (이전 기간 대비 ${signed(kpis.leads.deltaPct)}%)` : ""}`
      )
    }
    headline =
      parts.length > 0
        ? `${parts.join(" · ")}.`
        : "집계 가능한 지표가 없습니다 — 소스 연결 상태를 확인하세요."
  }

  // 인사이트 항목 — 값이 실측된 지표만.
  if (kpis.cplUsd.value != null) {
    const delta =
      kpis.cplUsd.deltaPct != null
        ? ` — 이전 기간 대비 ${signed(kpis.cplUsd.deltaPct)}% (${kpis.cplUsd.deltaPct <= 0 ? "개선" : "상승"})`
        : ""
    items.push(`CPL ${money(kpis.cplUsd.value, "USD")}${delta}`)
  }
  if (kpis.leadConversionRate.value != null) {
    const delta =
      kpis.leadConversionRate.deltaPct != null
        ? ` — 이전 기간 대비 ${signed(kpis.leadConversionRate.deltaPct)}%`
        : ""
    items.push(`광고 리드 전환율 ${PCT1.format(kpis.leadConversionRate.value)}%${delta}`)
  }
  if (kpis.budgetExecutionPct.value != null) {
    items.push(`KRW 채널 예산 집행률 ${PCT1.format(kpis.budgetExecutionPct.value)}% — 배정 대비 수기 집행 기준`)
  }
  // 페이싱 뒤처짐(집행률이 기간 경과율보다 20%p 이상 뒤) — 가장 벌어진 진행 캠페인 1건만.
  const lagging = scoreboard
    .filter(
      (row) =>
        row.status === "active" &&
        row.pacing.executionPct != null &&
        row.pacing.elapsedPct != null &&
        row.pacing.elapsedPct - row.pacing.executionPct >= 20
    )
    .sort(
      (a, b) =>
        (b.pacing.elapsedPct ?? 0) - (b.pacing.executionPct ?? 0) -
        ((a.pacing.elapsedPct ?? 0) - (a.pacing.executionPct ?? 0))
    )[0]
  if (lagging) {
    items.push(
      `「${lagging.name}」 집행 ${lagging.pacing.executionPct}% < 기간 경과 ${lagging.pacing.elapsedPct}% — 집행이 일정 대비 뒤처져 있습니다`
    )
  }

  // 번호 액션 최대 3 — 근거(why)와 함께.
  if (snapshotMissing) {
    actions.push({
      title: "Meta 인사이트 스냅샷 적재 확인(크론/백필)",
      why: "스냅샷 미적재 — 광고비·CPL·퍼널 상단이 비어 있습니다",
    })
  }
  if (leads != null && leads === 0) {
    actions.push({
      title: "리드 유입 경로 점검 — Meta 연결·폼 상태 확인",
      why: "기간 내 집계 리드 0건",
    })
  }
  if (kpis.cplUsd.deltaPct != null && kpis.cplUsd.deltaPct >= 20) {
    actions.push({
      title: "CPL 상승 — 소재·타겟 점검",
      why: `이전 기간 대비 +${kpis.cplUsd.deltaPct}%`,
    })
  }
  if (lagging) {
    actions.push({
      title: `「${lagging.name}」 예산 집행 재배분 검토`,
      why: "기간 경과 대비 집행률이 20%p 이상 뒤처짐",
    })
  }
  const staleActive = scoreboard.filter((row) => row.status === "active" && !row.latestUpdate)
  if (staleActive.length > 0) {
    actions.push({
      title: "진행 캠페인에 업데이트 기록 남기기",
      why: `기록 없는 진행 캠페인 ${staleActive.length}개`,
    })
  }

  return {
    headline,
    items: items.slice(0, 4),
    actions: actions.slice(0, 3),
    badges: [PERIOD_BADGE[perf.period.key], "규칙 기반"],
  }
}

/** 이상 신호 배지 — 종류별로 접고 2건 이상이면 개수를 붙인다("CPL 급등 2"). */
function anomalyBadges(flags: readonly AnomalyFlag[]): string[] {
  const counts = new Map<string, number>()
  for (const flag of flags) counts.set(flag.kind, (counts.get(flag.kind) ?? 0) + 1)
  return [...counts].map(([kind, count]) => {
    const label = ANOMALY_KIND_LABEL[kind as AnomalyKind] ?? kind
    return count > 1 ? `${label} ${count}` : label
  })
}

/** AI payload → 표시 콘텐츠. jsonb 라 형태를 신뢰하지 않고 문자열·객체만 통과시킨다. */
function briefingFromInsight(insight: MarketingInsightRecord): BriefingContent {
  const highlights = Array.isArray(insight.payload?.highlights) ? insight.payload.highlights : []
  const nextActions = Array.isArray(insight.payload?.next_actions)
    ? insight.payload.next_actions
    : []
  // 브리핑이 실제로 본 기간을 그대로 표기한다 — 대시보드 기간 토글과 다를 수 있고(브리핑은
  // 항상 30일 기준), 선택한 기간 배지를 붙이면 AI 문장을 그 기간 이야기로 오독하게 된다.
  const insightPeriod = insight.payload?.period?.key
  const periodBadge =
    insightPeriod && insightPeriod in PERIOD_BADGE
      ? PERIOD_BADGE[insightPeriod as PerfPeriodKey]
      : null

  return {
    headline: insight.headline,
    items: highlights.filter((item) => typeof item === "string" && item.trim() !== "").slice(0, 5),
    actions: nextActions
      .filter((action): action is { title: string; why?: string } =>
        Boolean(action && typeof action.title === "string" && action.title.trim() !== "")
      )
      .map((action) => ({ title: action.title, why: action.why }))
      .slice(0, 3),
    badges: periodBadge ? [periodBadge] : [],
  }
}

/**
 * 카드에 넘길 최종 props — AI 브리핑이 있으면 그것을, 없으면 규칙 기반을 쓰고
 * 어느 쪽인지·언제 것인지·왜 강등됐는지를 항상 표기한다(무음 폴백 금지).
 */
function composeBriefing(
  perf: MarketingPerfResponse,
  insights: MarketingInsightsResponse | null,
  insightsError: string | null
): BriefingCardProps {
  const badges = anomalyBadges(insights?.anomalies ?? [])
  const insight = insights?.insight ?? null

  if (insight) {
    const content = briefingFromInsight(insight)
    const stale = insights?.from === "stale"
    return {
      ...content,
      badges: [...content.badges, ...badges],
      meta: `AI · ${formatKstTime(insight.created_at)} 생성`,
      note: stale
        ? `최신 브리핑 재생성에 실패해 ${formatKstTime(insight.created_at)} 기준으로 표시합니다${
            insights?.error ? ` — ${insights.error}` : ""
          }`
        : null,
    }
  }

  // 폴백 — 규칙 기반. 왜 AI 가 아닌지를 한 줄로 밝힌다.
  const content = buildBriefing(perf)
  let note: string | null = null
  if (insightsError) note = `AI 브리핑을 불러오지 못했습니다 — ${insightsError}`
  else if (insights?.from === "error")
    note = `AI 브리핑 생성에 실패했습니다${insights.error ? ` — ${insights.error}` : ""}`
  else if (insights?.from === "empty")
    note = "AI 브리핑 없음 — 「다시 생성」으로 생성"

  return { ...content, badges: [...content.badges, ...badges], meta: null, note }
}

/* ─── 스켈레톤 ────────────────────────────────────────────────────────────────── */

// KpiStrip(StatTile compact, rounded-2xl border p-4)과 같은 셸의 콜드로드 스켈레톤.
function KpiTileSkeleton() {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <Skeleton className="mb-3 h-8 w-8 rounded-xl" />
      <Skeleton className="mb-1.5 h-2.5 w-20" />
      <Skeleton className="h-5 w-16" />
      <Skeleton className="mt-2 h-2.5 w-24" />
      {/* 스파크라인 자리 — 타일 일부가 미니 추이를 그려 그리드 행 전체가 그만큼 높아진다.
          자리를 비워두면 콜드로드 → 실데이터 전환에서 스트립이 통째로 밀린다. */}
      <Skeleton className="mt-3 h-[28px] w-full" />
    </div>
  )
}

function PerfSkeleton() {
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <KpiTileSkeleton key={i} />
        ))}
      </div>
      <ChartSkeleton className="h-[140px]" />
      <ChartSkeleton className="h-[380px]" />
      <ChartSkeleton className="h-[280px]" />
      {/* 소재별 CPL 자리 — 콜드로드에서 이 카드만큼 레이아웃이 밀리지 않게 높이를 예약한다. */}
      <ChartSkeleton className="h-[300px]" />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartSkeleton className="h-[260px]" />
        <ChartSkeleton className="h-[260px]" />
      </div>
    </div>
  )
}

/* ─── 본체 ────────────────────────────────────────────────────────────────────── */

const PERF_PERIOD_OPTIONS = [
  { id: "7d", label: "7일" },
  { id: "30d", label: "30일" },
  { id: "90d", label: "90일" },
  { id: "quarter", label: "분기" },
] as const

const KST_TIME = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
})

/** 스냅샷 시각·브리핑 생성 시각 공용 표기(KST). 깨진 값은 지어내지 않고 원문 그대로. */
function formatKstTime(iso: string): string {
  const time = new Date(iso)
  return Number.isNaN(time.getTime()) ? iso : KST_TIME.format(time)
}

export default function SummaryTab({
  period,
  onPeriodChange,
  refreshNonce,
  onLoadingChange,
}: {
  period: PerfPeriodKey
  onPeriodChange: (next: PerfPeriodKey) => void
  /** 페이지 헤더 "동기화" 트리거 — 증가할 때마다 캐시 우회 재조회. */
  refreshNonce: number
  /** 헤더 동기화 버튼 스피너용 — perf 로딩 상태를 페이지에 올려보낸다. */
  onLoadingChange?: (loading: boolean) => void
}) {
  const { data, loading, error, reload } = usePerf(period, refreshNonce)
  const {
    data: insights,
    error: insightsError,
    regenerating,
    reload: reloadInsights,
  } = useInsights(refreshNonce)

  useEffect(() => {
    onLoadingChange?.(loading)
  }, [loading, onLoadingChange])

  const briefing = useMemo(
    () => (data ? composeBriefing(data, insights, insightsError) : null),
    [data, insights, insightsError]
  )

  const regenerateBriefing = useCallback(() => {
    void reloadInsights({ regenerate: true })
  }, [reloadInsights])

  const campaignOptions = useMemo(
    () => (data ? data.scoreboard.map((row) => ({ id: row.campaignId, name: row.name })) : []),
    [data]
  )

  // 업데이트 저장 — POST 후 perf 를 fresh 재조회해 피드·스코어보드 최신 1줄을 함께 갱신한다.
  const submitUpdate = useCallback(
    async (input: UpdateSubmitInput) => {
      await adminFetchJson(`/api/admin/marketing-campaigns/${input.campaignId}/updates`, {
        method: "POST",
        body: JSON.stringify({ kind: input.kind, body: input.body }),
      })
      await reload({ fresh: true })
    },
    [reload]
  )

  // Meta 스냅샷 축 실측 여부 — 퍼널의 노출·클릭 0 강등을 표시층에서 구분하기 위한 신호.
  const metaMeasured = data != null && data.kpis.spendUsd.value != null && data.snapshotAt != null

  return (
    <div className="space-y-5">
      {/* 1. 헤더 행 — 기간 토글(딥링크 ?perf= 는 페이지 소유) + 스냅샷 시각 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodToggle
          options={PERF_PERIOD_OPTIONS}
          value={period}
          onChange={onPeriodChange}
          ariaLabel="퍼포먼스 집계 기간"
        />
        <div className="flex items-center gap-2">
          {data &&
            (data.snapshotAt ? (
              <span className="text-[11px] tabular-nums text-[#1a1a1a]/45">
                스냅샷 {formatKstTime(data.snapshotAt)}
              </span>
            ) : (
              <span className="text-[11px] text-[#A39E98]">스냅샷 미적재</span>
            ))}
          <WeeklyReportDialog />
        </div>
      </div>

      {error && !data ? (
        <EmptyState
          title="퍼포먼스 집계를 불러오지 못했습니다"
          description={error}
          action={
            <button
              type="button"
              onClick={() => void reload()}
              className="inline-flex items-center rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41]"
            >
              다시 시도
            </button>
          }
        />
      ) : !data ? (
        <PerfSkeleton />
      ) : (
        <div
          aria-busy={loading}
          className={loading ? "space-y-5 opacity-60 transition-opacity" : "space-y-5"}
        >
          {/* 재조회 실패 시 화면은 기존 데이터로 유지하되 실패를 밝힌다(무음 강등 금지). */}
          {error && (
            <div
              role="alert"
              className="flex items-center justify-between gap-3 rounded-xl border border-[#e8e8e4] px-4 py-3 text-[12px] text-[#1a1a1a]/55"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void reload()}
                className="shrink-0 font-medium text-[#084734] hover:underline"
              >
                다시 시도
              </button>
            </div>
          )}

          {/*
            콕핏 2단 구조 — xl 이상: 좌측 데이터 밀도(KPI·추이·스코어보드) + 우측 384px 고정 레일
            (브리핑·퍼널·업데이트). xl 미만: 한 컬럼으로 자연 스택하되 브리핑이 KPI 바로 다음
            (추이보다 먼저) 오도록 순서를 바꾼다 — 서사(현황→판단→근거) 우선, 레일 개념은 없다.

            좌/우 래퍼는 xl 미만에서 contents(자기 박스를 없애고 자식만 남김)로 접혀 8개 카드가
            바깥 그리드 하나에 직접 참여한다 — order 로 두 그룹을 가로질러 인터리브하려면 같은
            그리드의 형제여야 한다(서로 다른 컨테이너의 자식끼리는 order 가 안 먹는다). xl 이상에선
            각 래퍼가 flex-col 로 복원돼 자기 자식만 쌓는다 — 이때 order 값은 그룹 내부 상대
            순서(좌 1<4<5<6, 우 2<3<7<8)로만 작동해 DOM 순서와 같은 결과가 된다.
            한 줄 스택 순서: KPI → 브리핑 → 오늘 유입 → 추이 → 스코어보드 → 소재 CPL →
            퍼널 → 업데이트(현황 → 판단 → 지금 → 근거 → 참조).
            *두 블록을 각각 렌더해 CSS로 숨기는 방식은 쓰지 않는다* — DailyTrendSection·
            CampaignScoreboard는 Recharts 라 숨김 마운트에서 rAF 가 멈춰 얼어붙는 문제가 이미
            실측된 컴포넌트다(각 파일 주석 참조) — 같은 트리를 두 벌 마운트하는 위험을 감수하지 않는다.
          */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_384px] xl:items-start">
            {/* 좌측 — 숫자 밀도 */}
            <div className="contents xl:flex xl:flex-col xl:gap-4">
              <div className="order-1">
                {/* 스파크라인 원천 2종을 함께 넘긴다 — 광고비는 Meta 일자 스냅샷(daily),
                    리드는 우리 leads 테이블 축(leadDailyBySource, 0 채움에 period 필요). */}
                <KpiStrip
                  kpis={data.kpis}
                  daily={data.daily}
                  leadDailyBySource={data.leadDailyBySource}
                  period={data.period}
                  adLeads={data.funnel.adLeads}
                />
              </div>
              <div className="order-4">
                <DailyTrendSection
                  daily={data.daily}
                  leadDailyBySource={data.leadDailyBySource}
                  period={data.period}
                  snapshotAt={data.snapshotAt}
                  leadsMeasured={data.kpis.leads.value != null}
                />
              </div>
              <div className="order-5">
                <CampaignScoreboard rows={data.scoreboard} />
              </div>
              {/* 소재별 CPL — 스코어보드(캠페인 단위) 바로 아래에 둔다. 같은 질문의 한 단 더
                  아래 해상도라, 떨어뜨려 놓으면 두 표를 눈으로 잇지 못한다.
                  기간은 대시보드 토글과 같은 축을 쓰고 데이터는 자기 엔드포인트로 가져온다
                  (Compass 브리지는 perf 조립과 원천이 달라 한 응답에 섞지 않는다). */}
              <div className="order-6">
                <CreativeCplCard period={period} refreshNonce={refreshNonce} />
              </div>
            </div>

            {/* 우측 — 384px 고정 레일. xl 이상에서 sticky — 어드민 셸의 main이 스크롤 컨테이너이고
                이 페이지 안에는 그 위에 겹치는 고정 헤더가 없어 top-4 로 충분하다
                (PartnerWorkspaceShell 의 lg:top-4 레일과 동일 조건). */}
            <div className="contents xl:sticky xl:top-4 xl:flex xl:flex-col xl:gap-4">
              <div className="order-2">
                {/* 브리핑 카드 — AI 주간 브리핑(있으면), 없으면 규칙 기반 폴백 */}
                {briefing && (
                  <BriefingCard
                    {...briefing}
                    onRegenerate={regenerateBriefing}
                    regenerating={regenerating}
                  />
                )}
              </div>
              {/* 오늘 유입 — 기간 토글과 무관한 "지금" 축이라 판단(브리핑) 바로 다음에 둔다.
                  기간 지표들 사이에 끼우면 30일 숫자로 오독된다. */}
              <div className="order-3">
                <TodayIntakeCard refreshNonce={refreshNonce} />
              </div>
              <div className="order-7">
                <FunnelCard funnel={data.funnel} metaMeasured={metaMeasured} />
              </div>
              <div className="order-8">
                <UpdatesFeed
                  updates={data.updatesFeed}
                  campaignOptions={campaignOptions}
                  onSubmit={submitUpdate}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
