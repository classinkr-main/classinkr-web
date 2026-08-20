"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { PeriodToggle } from "@/components/admin/PeriodToggle"
import { ChartSkeleton, EmptyState, Skeleton } from "@/components/admin/viz"
import { BriefingCard } from "@/components/admin/campaigns/perf/BriefingCard"
import type { BriefingAction, BriefingContent } from "@/components/admin/campaigns/perf/BriefingCard"
import { FunnelMixSection } from "@/components/admin/campaigns/perf/FunnelMixSection"
import { KpiStrip } from "@/components/admin/campaigns/perf/KpiStrip"
import { UpdatesFeed } from "@/components/admin/campaigns/perf/UpdatesFeed"
import type { UpdateSubmitInput } from "@/components/admin/campaigns/perf/UpdatesFeed"
import { COUNT, PCT1, money } from "@/components/admin/campaigns/event-format"
import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
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

/* ─── 브리핑 콘텐츠 규칙(Phase 3 전 규칙 기반) ─────────────────────────────────── */
// 구 InsightsBanner 인사이트 + 추천 액션 규칙의 이식판 — 데이터 축이 행사 수기 집계에서
// perf 응답(Meta 스냅샷·리드 테이블·캠페인 페이싱)으로 바뀌었으므로 같은 정신(실측된 축만
// 말하고, null 은 문장으로 만들지 않는다)으로 재구성했다. Phase 3 에서 AI payload 로 교체된다.

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

/* ─── 스켈레톤 ────────────────────────────────────────────────────────────────── */

// KpiStrip(StatTile compact, rounded-2xl border p-4)과 같은 셸의 콜드로드 스켈레톤.
function KpiTileSkeleton() {
  return (
    <div className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
      <Skeleton className="mb-3 h-8 w-8 rounded-xl" />
      <Skeleton className="mb-1.5 h-2.5 w-20" />
      <Skeleton className="h-5 w-16" />
      <Skeleton className="mt-2 h-2.5 w-24" />
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

const SNAPSHOT_TIME = new Intl.DateTimeFormat("ko-KR", {
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: "Asia/Seoul",
})

function formatSnapshotAt(iso: string): string {
  const time = new Date(iso)
  return Number.isNaN(time.getTime()) ? iso : SNAPSHOT_TIME.format(time)
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

  useEffect(() => {
    onLoadingChange?.(loading)
  }, [loading, onLoadingChange])

  const briefing = useMemo(() => (data ? buildBriefing(data) : null), [data])

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
        {data &&
          (data.snapshotAt ? (
            <span className="text-[11px] tabular-nums text-[#1a1a1a]/45">
              스냅샷 {formatSnapshotAt(data.snapshotAt)}
            </span>
          ) : (
            <span className="text-[11px] text-[#A39E98]">스냅샷 미적재</span>
          ))}
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

          {/* 2. KPI 스트립 5칸 */}
          <KpiStrip kpis={data.kpis} />

          {/* 3. 브리핑 카드 — Phase 3 전까지 규칙 기반 콘텐츠 */}
          {briefing && <BriefingCard {...briefing} />}

          {/* 4. 일자별 추이 */}
          <DailyTrendSection
            daily={data.daily}
            leadDailyBySource={data.leadDailyBySource}
            period={data.period}
            snapshotAt={data.snapshotAt}
            leadsMeasured={data.kpis.leads.value != null}
          />

          {/* 5. 캠페인 스코어보드 */}
          <CampaignScoreboard rows={data.scoreboard} />

          {/* 6. 퍼널 + 채널 믹스 */}
          <FunnelMixSection
            funnel={data.funnel}
            channelMix={data.channelMix}
            metaMeasured={metaMeasured}
          />

          {/* 7. 업데이트 피드 */}
          <UpdatesFeed
            updates={data.updatesFeed}
            campaignOptions={campaignOptions}
            onSubmit={submitUpdate}
          />
        </div>
      )}
    </div>
  )
}
