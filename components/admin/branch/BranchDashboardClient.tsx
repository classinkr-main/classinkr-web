"use client"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import type { KeyboardEvent } from "react"
import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { CalendarDays, ChevronLeft, RefreshCw } from "lucide-react"
import SyncStatusBar from "./SyncStatusBar"
import IntegrityStrip from "./IntegrityStrip"
import CoreKpiGrid from "./sections/CoreKpiGrid"
import ActivityBottleneckSection from "./sections/ActivityBottleneckSection"
import BranchHeroGauges from "./sections/BranchHeroGauges"
import BranchKpiAccordion from "./sections/BranchKpiAccordion"
import BranchPipelineKanban from "./sections/BranchPipelineKanban"
import BranchUpcomingDeals from "./sections/BranchUpcomingDeals"
import BranchRegionHeatmap from "./sections/BranchRegionHeatmap"
import BranchAiInsights from "./sections/BranchAiInsights"
import DealModal, { type DealModalDeal } from "./sections/DealModal"
import PipelineTable from "./sections/PipelineTable"
import CampaignsSection from "./sections/CampaignsSection"
import HardwareSection from "./sections/HardwareSection"
import DataQualityPanel from "./sections/DataQualityPanel"
import DealMixSection from "./sections/DealMixSection"
import { adminFetchJson, clearBranchRequestCache, useBranchJson } from "./client-api"
import { PERIODS, TEAMS, type BranchKpiResponse, type BranchSummaryResponse, type Period, type Team } from "./types"

type BranchTab = "overview" | "pipeline" | "heatmap" | "ai"

const BRANCH_TABS: Array<{ id: BranchTab; label: string; sub: string }> = [
  { id: "overview", label: "개요", sub: "실적 · 팀 · 재고 · 캠페인" },
  { id: "pipeline", label: "파이프라인", sub: "단계별 딜 보드 · 팀 KPI" },
  { id: "heatmap", label: "지역별 히트맵", sub: "KR 지역별 매출 · 딜 분포" },
  { id: "ai", label: "AI 인사이트", sub: "내부 인사이트 · 본사 보고서" },
]

const PERIOD_LABEL: Record<Period, string> = { M: "이번 달", Q: "이번 분기", Y: "연간 누적" }

function canRunAdminOperationsFromSession(): boolean {
  if (typeof window === "undefined") return false
  const role = sessionStorage.getItem("admin_role")?.trim().toUpperCase()
  return role === "ADMIN" || role === "SUPER_ADMIN"
}

function ymKeyUtc(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}

function fiscalYearOf(date: Date): number {
  const month = date.getUTCMonth() + 1
  return month >= 4 ? date.getUTCFullYear() : date.getUTCFullYear() - 1
}

function formatMonthLabel(ym: string): string {
  const [year, month] = ym.split("-").map(Number)
  return `${year}년 ${month}월`
}

function buildMonthOptions(now: Date) {
  const fy = fiscalYearOf(now)
  const current = ymKeyUtc(now)
  const previous = new Date(now)
  previous.setUTCMonth(previous.getUTCMonth() - 1)
  const previousKey = ymKeyUtc(previous)
  const fiscalMonths = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3]
    .map((month) => `${month >= 4 ? fy : fy + 1}-${String(month).padStart(2, "0")}`)
  const currentIndex = fiscalMonths.indexOf(current)
  const visibleMonths = currentIndex >= 0 ? fiscalMonths.slice(0, currentIndex + 1) : [current]
  return visibleMonths.reverse().map((value) => ({
    value,
    label: formatMonthLabel(value),
    hint: value === current ? "이번 달" : value === previousKey ? "지난 달" : null,
  }))
}

const RevenueFlowSection = dynamic(() => import("./sections/RevenueFlowSection"), {
  loading: () => <div className="h-72 animate-pulse rounded-2xl bg-[#f0f0ec]" />,
})

export default function BranchDashboardClient() {
  // 장부 등 외부에서 `?tab=pipeline&team=BD&period=M&month=2026-06` 딥링크로 진입할 수 있게
  // 초기 필터를 URL에서 결정한다(탭과 동일 패턴 — 마운트 시 1회 파싱).
  const searchParams = useSearchParams()
  const initialTab = ((): BranchTab => {
    const t = searchParams.get("tab")
    return BRANCH_TABS.some((x) => x.id === t) ? (t as BranchTab) : "overview"
  })()
  const [activeTab, setActiveTab] = useState<BranchTab>(initialTab)
  const initialTeam = ((): Team => {
    const t = searchParams.get("team")
    return t && (TEAMS as readonly string[]).includes(t) ? (t as Team) : "ALL"
  })()
  const [team, setTeam] = useState<Team>(initialTeam)
  const initialPeriod = ((): Period => {
    const p = searchParams.get("period")
    return p && (PERIODS as readonly string[]).includes(p) ? (p as Period) : "Q"
  })()
  const [period, setPeriod] = useState<Period>(initialPeriod)
  const initialMonth = ((): string => {
    const m = searchParams.get("month")
    if (!m) return ymKeyUtc(new Date())
    const valid = buildMonthOptions(new Date()).some((option) => option.value === m)
    return valid ? m : ymKeyUtc(new Date())
  })()
  const [selectedMonth, setSelectedMonth] = useState(initialMonth)
  const [pipelineView, setPipelineView] = useState<"table" | "kanban">("table")
  const [syncError, setSyncError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedDeal, setSelectedDeal] = useState<DealModalDeal | null>(null)
  // SSR은 sessionStorage에 접근할 수 없어 항상 false를 렌더한다 — 초기화 함수로 즉시 세션값을
  // 읽으면 클라 첫 렌더(마운트 전 hydrate 패스)가 서버 렌더와 어긋나 하이드레이션 에러가 난다
  // (RefreshCw 버튼 라벨이 "다시 불러오기" → "지금 동기화"로 갈리는 실측 케이스). false로 고정하고
  // 아래 useEffect가 마운트 후 실제 세션 값으로 갱신한다(라벨이 잠깐 바뀌는 건 허용).
  const [canRunAdminOperations, setCanRunAdminOperations] = useState(false)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    setCanRunAdminOperations(canRunAdminOperationsFromSession())
  }, [])

  // 탭 전환 시 URL도 동기화 — 뒤로가기 히스토리를 오염시키지 않게 replaceState 사용.
  const selectTab = useCallback((tab: BranchTab) => {
    setActiveTab(tab)
    const url = new URL(window.location.href)
    if (tab === "overview") url.searchParams.delete("tab")
    else url.searchParams.set("tab", tab)
    window.history.replaceState(null, "", url.toString())
  }, [])

  // team/period/month 필터도 탭과 동일한 방식으로 URL 쿼리에 동기화한다 — 파라미터 이름은
  // API 쿼리(?team=&period=&month=)와 동일하게 맞춰 딥링크가 그대로 fetch URL 구성에 재사용된다.
  // 기본값(ALL/Q/이번 달)일 땐 쿼리를 생략해 URL을 깨끗하게 유지한다.
  const selectTeam = useCallback((next: Team) => {
    setTeam(next)
    const url = new URL(window.location.href)
    if (next === "ALL") url.searchParams.delete("team")
    else url.searchParams.set("team", next)
    window.history.replaceState(null, "", url.toString())
  }, [])

  const selectPeriod = useCallback((next: Period) => {
    setPeriod(next)
    const url = new URL(window.location.href)
    if (next === "Q") url.searchParams.delete("period")
    else url.searchParams.set("period", next)
    // month는 period === "M"일 때만 API에 실리는 파라미터라(:154) 다른 기간으로 바꾸면
    // URL의 stale ?month=도 함께 지운다 — selectedMonth 상태 자체는 유지되어 다시 M으로
    // 돌아오면 select가 이전 값을 그대로 보여준다.
    if (next === "M" && selectedMonth !== ymKeyUtc(new Date())) url.searchParams.set("month", selectedMonth)
    else if (next !== "M") url.searchParams.delete("month")
    window.history.replaceState(null, "", url.toString())
  }, [selectedMonth])

  const selectMonth = useCallback((next: string) => {
    setSelectedMonth(next)
    const url = new URL(window.location.href)
    if (next === ymKeyUtc(new Date())) url.searchParams.delete("month")
    else url.searchParams.set("month", next)
    window.history.replaceState(null, "", url.toString())
  }, [])

  const openDealLog = useCallback(async (row: { id: string; customer: string; manager: string | null; team: string | null; region: string | null; revenue: number; stageLabel?: string; stageColor?: string; probability?: number }) => {
    setSelectedDeal({
      id: row.id, customer: row.customer, manager: row.manager, team: row.team,
      region: row.region, amount: row.revenue,
      stageLabel: row.stageLabel, stageColor: row.stageColor, probability: row.probability,
      loadingDetail: true,
    })
    try {
      const data = await adminFetchJson<{ deal?: {
        id: string; customer_name: string; manager: string | null; team: string | null;
        region: string | null; status: string | null; note: string | null;
        deal_type: string | null; product_version: string | null;
        contract_target: number | null; first_payment: string | null;
        monthly_payments: Record<string, number>; monthly_red: Record<string, boolean>;
        monthly_confirmed?: Record<string, number> | null; monthly_high_conf?: Record<string, number> | null;
      } }>(`/api/admin/branch/deals/${encodeURIComponent(row.id)}`)
      const d = data?.deal
      if (!d) { setSelectedDeal((cur) => cur && cur.id === row.id ? { ...cur, loadingDetail: false } : cur); return }
      setSelectedDeal((cur) => cur && cur.id === row.id ? {
        ...cur,
        status: d.status,
        note: d.note,
        dealType: d.deal_type,
        productVersion: d.product_version,
        contractTarget: d.contract_target,
        firstPayment: d.first_payment,
        monthlyPayments: d.monthly_payments,
        monthlyRed: d.monthly_red,
        // 확도 금액 맵 — DealModal의 '확정' 표시가 rev-confirmed 캐논(revenue-core)으로
        // 계산되도록 red 불리언과 함께 내려준다(부분 확정·무색상 폴백 반영).
        monthlyConfirmed: d.monthly_confirmed ?? undefined,
        monthlyHighConfidence: d.monthly_high_conf ?? undefined,
        loadingDetail: false,
      } : cur)
    } catch {
      setSelectedDeal((cur) => cur && cur.id === row.id ? { ...cur, loadingDetail: false } : cur)
    }
  }, [])

  const monthQuery = period === "M" ? `&month=${encodeURIComponent(selectedMonth)}` : ""
  const summaryUrl = `/api/admin/branch/summary?team=${team}&period=${period}${monthQuery}`
  const kpiUrl = `/api/admin/branch/kpi?team=${team}&period=${period}${monthQuery}`
  const summary = useBranchJson<BranchSummaryResponse>(summaryUrl, refreshKey)
  const kpi = useBranchJson<BranchKpiResponse>(kpiUrl, refreshKey)
  const monthOptions = useMemo(() => buildMonthOptions(new Date()), [])
  const activePeriodLabel = period === "M" ? formatMonthLabel(selectedMonth) : PERIOD_LABEL[period]

  const onRefresh = useCallback(async () => {
    setSyncError(null)
    setRefreshing(true)
    try {
      if (canRunAdminOperations) {
        await adminFetchJson("/api/admin/branch/sync", { method: "POST" })
      }
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : String(e))
    } finally {
      clearBranchRequestCache()
      setRefreshKey((k) => k + 1)
      setRefreshing(false)
    }
  }, [canRunAdminOperations])

  const lastSync = summary.data?.lastSync ?? null
  const lastError = syncError ?? summary.error ?? summary.data?.lastError ?? null
  const sheetModifiedAt = summary.data?.sheetModifiedAt ?? null
  const dataSources = summary.data?.data_sources ?? null

  // Filter visibility per design
  const showPeriodFilter = activeTab === "overview" || activeTab === "pipeline" || activeTab === "heatmap"
  const showTeamFilter = activeTab !== "ai"
  const activeTabId = `branch-tab-${activeTab}`
  const activePanelId = `branch-tabpanel-${activeTab}`

  const onTabKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = BRANCH_TABS.length - 1
    let nextIndex: number | null = null

    if (event.key === "ArrowRight") nextIndex = index === lastIndex ? 0 : index + 1
    if (event.key === "ArrowLeft") nextIndex = index === 0 ? lastIndex : index - 1
    if (event.key === "Home") nextIndex = 0
    if (event.key === "End") nextIndex = lastIndex

    if (nextIndex == null) return
    event.preventDefault()
    const nextTab = BRANCH_TABS[nextIndex]
    selectTab(nextTab.id)
    tabRefs.current[nextIndex]?.focus()
  }, [selectTab])

  return (
    <div className="pb-24">
      {/* TopBar — breadcrumb + title + description + refresh */}
      <header className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 pb-5 pt-6 sm:px-6 lg:px-9 lg:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#615D59]">
              <span>ADMIN</span>
              <span className="opacity-50">›</span>
              <span className="inline-flex items-center gap-1">
                <ChevronLeft className="h-3 w-3" /> 분석
              </span>
              <span className="opacity-50">›</span>
              <span>KR Team</span>
            </div>
            <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#111110] sm:text-[30px]">
              KR Team
            </h1>
            <p className="mt-2 max-w-[720px] text-[13px] leading-relaxed text-[#615D59]">
              KR 지사의 전체 매출 흐름과 BD · MKT · CSM 팀의 실적, 재고, 일정과 행사를 한 화면에서 확인합니다.
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={onRefresh} disabled={refreshing}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60">
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              새로고침
            </button>
          </div>
        </div>

        {/* Filters: team + period (conditional per tab) */}
        {(showTeamFilter || showPeriodFilter) && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            {showTeamFilter && (
              <div className="flex gap-1 rounded-full border border-[rgba(0,0,0,0.08)] bg-white p-1" role="group" aria-label="팀 필터">
                {TEAMS.map((t) => (
                  <button key={t} type="button" onClick={() => selectTeam(t)}
                    aria-pressed={team === t}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition ${
                      team === t ? "bg-[#111110] text-white" : "text-[#615D59] hover:text-[#111110]"
                    }`}>
                    {t === "ALL" ? "KR 전체" : t}
                  </button>
                ))}
              </div>
            )}
            {showPeriodFilter && (
              <>
                <div className="inline-flex rounded-lg border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]" role="group" aria-label="기간 필터">
                  {PERIODS.map((p) => (
                    <button key={p} type="button" onClick={() => selectPeriod(p)}
                      aria-pressed={period === p}
                      className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                        period === p ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
                {period === "M" && (
                  <label className="inline-flex h-[35px] items-center gap-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-2.5 text-[12px] font-semibold text-[#615D59]">
                    <CalendarDays className="h-3.5 w-3.5 text-[#084734]" aria-hidden="true" />
                    <span className="sr-only">월 선택</span>
                    <select
                      value={selectedMonth}
                      onChange={(event) => selectMonth(event.target.value)}
                      className="h-7 bg-transparent pr-1 text-[12px] font-semibold text-[#111110] outline-none"
                      aria-label="월별 데이터 월 선택"
                    >
                      {monthOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}{option.hint ? ` · ${option.hint}` : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </>
            )}
          </div>
        )}

        {/* 단위 표기 규칙 명시(항목 1) — 화면 전체의 ¥ 축약 표기가 어느 통화 기준인지 1회 고지. */}
        <p className="mt-2 text-[10.5px] font-medium text-[#615D59]/80">통화 ¥ — 본사 보고 기준</p>
      </header>

      {/* Sub-tabs */}
      <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#EBE8E2] px-2 sm:px-4 lg:px-9">
        <div className="admin-scroll-snap-x no-scrollbar -mb-px flex flex-nowrap gap-0 overflow-x-auto" role="tablist" aria-label="지사 대시보드 보기">
          {BRANCH_TABS.map((tab, index) => {
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                id={`branch-tab-${tab.id}`}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`branch-tabpanel-${tab.id}`}
                tabIndex={active ? 0 : -1}
                ref={(node) => { tabRefs.current[index] = node }}
                onClick={() => selectTab(tab.id)}
                onKeyDown={(event) => onTabKeyDown(event, index)}
                className={`relative mt-1 flex shrink-0 flex-col items-start gap-0.5 rounded-t-lg px-4 py-2.5 text-left transition sm:px-5 sm:py-3 ${
                  active
                    ? "bg-[#FAFAF8] text-[#111110]"
                    : "bg-transparent text-[#615D59] hover:text-[#111110]"
                }`}
              >
                <span className="whitespace-nowrap text-[13px] font-bold tracking-[-0.01em]">{tab.label}</span>
                <span className="hidden whitespace-nowrap text-[10.5px] font-medium text-[#615D59] min-[420px]:block">{tab.sub}</span>
                {active && (
                  <span className="absolute inset-x-3 -bottom-px h-[2.5px] rounded-sm bg-[#084734]" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content */}
      <div className="px-4 pt-6 sm:px-6 lg:px-9">
        <SyncStatusBar
          lastSync={lastSync}
          lastError={lastError}
          sheetModifiedAt={sheetModifiedAt}
          dataSources={dataSources}
          onRefresh={onRefresh}
          syncEnabled={canRunAdminOperations}
        />

        <div className="mt-6">
          {activeTab === "overview" && (
            <div id={activePanelId} role="tabpanel" aria-labelledby={activeTabId} className="space-y-6">
              {/* 정합성 배지 승격(항목 3) — SyncStatusBar 바로 아래, 개요 탭에만. */}
              <IntegrityStrip refreshKey={refreshKey} />
              <CoreKpiGrid data={summary.data} loading={summary.loading} error={summary.error} />
              {/* D-1: 매출 목표(HeroGauges) 위, 매출 누적 흐름(RevenueFlowSection) 아래 */}
              <BranchHeroGauges
                summary={summary.data}
                kpi={kpi.data}
                periodLabel={activePeriodLabel}
              />
              <DealMixSection summary={summary.data} loading={summary.loading} />
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
                <RevenueFlowSection
                  summary={summary.data}
                  loading={summary.loading}
                  team={team}
                  period={period}
                  selectedMonth={selectedMonth}
                  refreshKey={refreshKey}
                />
                <BranchUpcomingDeals
                  data={summary.data?.monthly_series ?? null}
                  loading={summary.loading}
                  onDealClick={(d) => setSelectedDeal({
                    id: d.id, customer: d.customer, date: d.date, amount: d.amount,
                  })}
                />
              </div>
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
                <CampaignsSection rows={summary.data?.campaigns_recent ?? null} loading={summary.loading} error={summary.error} />
                <HardwareSection refreshKey={refreshKey} />
              </div>
            </div>
          )}

          {activeTab === "pipeline" && (
            <div id={activePanelId} role="tabpanel" aria-labelledby={activeTabId} className="space-y-4">
              {/* 좌: 기존 KPI 아코디언 유지 / 우: 활동 병목·담당자(장부 KPI 렌즈 이식) — 목업 g2e 동일 */}
              <div className="grid gap-6 xl:grid-cols-2">
                <BranchKpiAccordion data={kpi.data} loading={kpi.loading} error={kpi.error} />
                <ActivityBottleneckSection kpi={kpi.data} loading={kpi.loading} />
              </div>
              <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3.5">
                  <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">파이프라인</h2>
                  <div className="inline-flex rounded-md border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]">
                    {(["table", "kanban"] as const).map((v) => (
                      <button key={v} type="button" onClick={() => setPipelineView(v)}
                        className={`rounded-[5px] px-2.5 py-1 text-[11px] font-semibold transition ${
                          pipelineView === v ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
                        }`}>
                        {v === "table" ? "테이블" : "칸반"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={pipelineView === "kanban" ? "" : "px-2.5 py-2"}>
                  {pipelineView === "table" ? (
                    <PipelineTable key={`pipeline-rev-${team}`} team={team} period={period} selectedMonth={selectedMonth} refreshKey={refreshKey} onRowClick={openDealLog} />
                  ) : (
                    <BranchPipelineKanban
                      team={team}
                      period={period}
                      selectedMonth={selectedMonth}
                      refreshKey={refreshKey}
                      onDealClick={(d) => {
                        void openDealLog({
                          id: d.id, customer: d.customer, manager: d.manager,
                          team: d.team, region: d.region, revenue: d.revenue,
                          stageLabel: d.stageLabel, stageColor: d.stageColor, probability: d.probability,
                        })
                      }}
                    />
                  )}
                </div>
              </section>
            </div>
          )}

          {activeTab === "heatmap" && (
            <div id={activePanelId} role="tabpanel" aria-labelledby={activeTabId} className="space-y-6">
              <BranchRegionHeatmap team={team} period={period} selectedMonth={selectedMonth} refreshKey={refreshKey} />
              <PipelineTable key={`heatmap-rev-${team}`} team={team} period={period} selectedMonth={selectedMonth} refreshKey={refreshKey} pageSize={10} onRowClick={openDealLog} />
            </div>
          )}

          {activeTab === "ai" && (
            <div id={activePanelId} role="tabpanel" aria-labelledby={activeTabId} className="space-y-6">
              <BranchAiInsights team={team} refreshKey={refreshKey} summary={summary.data} canGenerate={canRunAdminOperations} />
              {canRunAdminOperations && <DataQualityPanel refreshKey={refreshKey} />}
            </div>
          )}
        </div>
      </div>

      <DealModal deal={selectedDeal} onClose={() => setSelectedDeal(null)} />
    </div>
  )
}
