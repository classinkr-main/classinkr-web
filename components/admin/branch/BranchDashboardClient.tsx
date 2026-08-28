"use client"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import type { KeyboardEvent } from "react"
import { useState, useCallback, useEffect, useMemo, useRef } from "react"
import { AlertTriangle, CalendarDays, ChevronLeft, RefreshCw } from "lucide-react"
import SyncStatusBar from "./SyncStatusBar"
import type { DealModalDeal } from "./sections/DealModal"
import { adminFetchJson, clearBranchRequestCache, useBranchJson, type BranchJsonState } from "./client-api"
import { adminFetchJsonCached } from "@/lib/admin-client"
import { buildCrmSyncSummary, type CrmSyncSummary, type RevSyncCoverageView } from "@/lib/crm/rev-sync-health"
import { PERIODS, PIPELINE_MANAGER_DEFAULT_STORAGE_KEY, TEAMS, type BranchKpiResponse, type BranchSummaryResponse, type Period, type Team } from "./types"
import { getBranchTabDataNeeds, type BranchTab } from "./tab-data-needs"
import { ADMIN_NAV, ADMIN_NAV_SECTION_META } from "../admin-nav"

// 브레드크럼 세그먼트는 admin-nav.ts SSOT에서 파생한다 — "분석" 하드코딩 대신 /admin/branch가
// 실제로 속한 섹션 라벨(현재 "영업·매출")을 읽는다. IA가 다시 재편돼도 이 화면은 자동으로 따라간다.
const BRANCH_NAV_ITEM = ADMIN_NAV.find((item) => item.href === "/admin/branch")
const BRANCH_SECTION_LABEL = BRANCH_NAV_ITEM ? ADMIN_NAV_SECTION_META[BRANCH_NAV_ITEM.section].label : "영업·매출"

const BRANCH_TABS: Array<{ id: BranchTab; label: string }> = [
  { id: "overview", label: "개요" },
  { id: "pipeline", label: "파이프라인" },
  { id: "heatmap", label: "지역별 히트맵" },
  { id: "ai", label: "AI 인사이트" },
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

function BranchOverviewLoadError({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] p-5 text-[#8F2C2C]">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-[13px] font-bold">개요 화면을 불러오지 못했습니다</p>
          <p className="mt-1 text-[12px] leading-relaxed">{message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-3 inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-[#F2B8B8] bg-white px-3 py-1.5 text-[11px] font-bold text-[#8F2C2C] md:min-h-0 md:min-w-0"
          >
            페이지 다시 불러오기
          </button>
        </div>
      </div>
    </div>
  )
}

function BranchOverviewFallback() {
  const [slow, setSlow] = useState(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => setSlow(true), 12_000)
    return () => window.clearTimeout(timeout)
  }, [])

  if (slow) {
    return <BranchOverviewLoadError message="화면 구성요소 응답이 12초를 넘었습니다. 네트워크 상태를 확인한 뒤 다시 불러와 주세요." />
  }

  return (
    <div role="status" aria-live="polite" className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-5">
      <p className="text-[13px] font-bold text-[#111110]">개요 화면을 준비하는 중</p>
      <p className="mt-1 text-[12px] text-[#615D59]">KPI와 차트 구성요소를 불러오고 있습니다.</p>
      <div className="mt-4 h-32 animate-pulse rounded-xl bg-[#f0f0ec]" aria-hidden="true" />
    </div>
  )
}

// 개요 탭 전체를 하나의 지연 청크로 묶는다. 이전의 9개 독립 청크는 dev rebuild나 일시적인
// chunk 전송 실패 때 일부만 영구 loading fallback에 남을 수 있었다. 다른 탭 딥링크의 초기
// 번들은 계속 보호하면서 개요 진입의 실패 지점은 하나로 줄이고, 실패·지연을 명시 상태로 끝낸다.
const BranchOverviewPanel = dynamic(
  () => import("./BranchOverviewPanel").catch((error: unknown) => ({
    default: () => (
      <BranchOverviewLoadError
        message={error instanceof Error ? error.message : "개요 화면 구성요소를 불러오지 못했습니다."}
      />
    ),
  })),
  { loading: BranchOverviewFallback },
)
const DealModal = dynamic(() => import("./sections/DealModal"))

// 탭 전용 컴포넌트 코드 스플리팅(품질 웨이브 2 — 항목 6) — 개요를 포함한 각 탭의
// 컴포넌트는 그 탭을 열 때만 청크를 내려받는다.
// 로딩 스켈레톤은 각 컴포넌트 내부의 자체 로딩 상태(데이터 미도착 시)와 동일 톤으로 맞춘다.
const BranchKpiAccordion = dynamic(() => import("./sections/BranchKpiAccordion"), {
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-[#f0f0ec]" />,
})
const ActivityBottleneckSection = dynamic(() => import("./sections/ActivityBottleneckSection"), {
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-[#f0f0ec]" />,
})
const BranchPipelineKanban = dynamic(() => import("./sections/BranchPipelineKanban"), {
  loading: () => <div className="h-72 animate-pulse rounded-xl bg-[#f0f0ec]" />,
})
const PipelineTable = dynamic(() => import("./sections/PipelineTable"), {
  loading: () => <div className="h-64 animate-pulse rounded-2xl bg-[#F6F5F4]" />,
})
const BranchRegionHeatmap = dynamic(() => import("./sections/BranchRegionHeatmap"), {
  loading: () => <div className="h-96 animate-pulse rounded-xl bg-[#f0f0ec]" />,
})
const BranchAiInsights = dynamic(() => import("./sections/BranchAiInsights"), {
  loading: () => <div className="h-96 animate-pulse rounded-xl bg-[#f0f0ec]" />,
})

/** 페이지 서버 프리페치가 내려주는 첫 화면 summary 응답 + 그 응답이 대응하는 요청 URL. */
export interface BranchSummaryPrefetch {
  url: string
  data: BranchSummaryResponse
}

// initialData가 없으면(비인증·역할 부족·프리페치 실패·기본 조합이 아닌 딥링크) 이 화면은
// 지금까지와 100% 동일하게 마운트 후 클라이언트 페치로만 채워진다.
export default function BranchDashboardClient({
  initialData = null,
}: {
  initialData?: BranchSummaryPrefetch | null
}) {
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
  // 품질 웨이브 5 — 항목 6. tab/team/period/month와 동일한 "마운트 시 1회 파싱" 규약 확장 —
  // 장부(SalesLedgerWorkbench)의 pipelineHref가 q/mgr을 동봉해 보내오면(향후 확장) 파이프라인
  // 탭의 테이블/칸반 검색어·담당 필터로 그대로 주입한다.
  const initialPipelineQuery = searchParams.get("q") ?? ""
  const initialPipelineManager = searchParams.get("mgr") ?? ""
  const [pipelineQuery, setPipelineQuery] = useState(initialPipelineQuery)
  const [pipelineManager, setPipelineManager] = useState(initialPipelineManager)
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
  // CRM 싱크 칩(B안) 데이터 — coverage 응답을 요약으로 접어 SyncStatusBar에 prop으로 1회
  // 전달한다(칩은 자체 fetch 없음). 실패·미지원(구 서버)·권한 없음은 null = 칩 미표시(fail-soft).
  const [crmSync, setCrmSync] = useState<CrmSyncSummary | null>(null)
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  useEffect(() => {
    setCanRunAdminOperations(canRunAdminOperationsFromSession())
  }, [])

  useEffect(() => {
    let alive = true
    // CrmCoverageStrip(/admin/crm)과 같은 캐시 키 — 같은 세션에서 두 화면을 오가도 요청 1회.
    adminFetchJsonCached<{ revAccounts?: RevSyncCoverageView | null }>("/api/admin/crm/coverage", undefined, {
      cacheKey: "/api/admin/crm/coverage",
      ttlMs: 90_000,
      staleWhileRevalidateMs: 5 * 60_000,
    })
      .then((response) => {
        if (alive) setCrmSync(buildCrmSyncSummary(response?.revAccounts ?? null))
      })
      .catch(() => {
        // fail-soft — 칩만 조용히 빠진다. 대시보드 본문은 영향 없음.
      })
    return () => {
      alive = false
    }
  }, [])

  // 웨이브 7 — Q5(개인화 라이트). URL에 mgr이 없을 때만(우선순위: URL > localStorage >
  // 없음) 저장된 담당 기본값을 1회 복원한다. window.location.search를 직접 다시 읽는
  // 것은(위에서 이미 계산한 initialPipelineManager를 재사용하지 않는 것은) 이 effect를
  // exhaustive-deps 경고 없이 순수 마운트-1회([])로 유지하기 위함 — outer 렌더 스코프
  // 값(initialPipelineManager)을 클로저로 참조하면 그 값도 deps에 넣어야 하는데, 이
  // 값은 마운트 시점 URL로만 SSR-세이프하게 계산되는 값이라 재실행될 이유가 없다.
  // localStorage는 이 효과(마운트 후에만 실행)에서만 만진다 — canRunAdminOperations와
  // 동일하게 서버 렌더와 클라 첫 렌더 사이 하이드레이션 불일치를 만들지 않기 위함.
  // 개요 탭에서 진입하는 일반적인 경로에서는 파이프라인 탭(PipelineTable·칸반)이 아직
  // 마운트되지 않은 상태라 이 복원이 끝난 뒤 정상적으로 initialManager로 전달된다 —
  // 반대로 ?tab=pipeline 딥링크로 곧장 파이프라인 탭에 랜딩하면서 mgr만 빠진 경우는
  // 자식이 마운트 시 1회만 initialManager를 읽는 기존 규약상 이 복원이 한 박자 늦게
  // 반영될 수 있다 — 드문 조합이라 "라이트" 스코프에서는 알려진 한계로 둔다.
  useEffect(() => {
    if (typeof window === "undefined") return
    if (new URLSearchParams(window.location.search).get("mgr")) return
    const stored = window.localStorage.getItem(PIPELINE_MANAGER_DEFAULT_STORAGE_KEY)
    if (!stored) return
    setPipelineManager(stored)
    const url = new URL(window.location.href)
    url.searchParams.set("mgr", stored)
    window.history.replaceState(null, "", url.toString())
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

  // 파이프라인 테이블/칸반의 검색어·담당 필터 변경을 URL(q/mgr)에 동기화 — tab/team/
  // period/month와 동일한 replaceState 규약(품질 웨이브 5 — 항목 6). 테이블↔칸반 뷰
  // 전환 시 상대편 컴포넌트가 이 값을 초기값으로 재사용해 필터가 이어진다.
  const onPipelineFilterChange = useCallback((next: { query: string; manager: string }) => {
    setPipelineQuery(next.query)
    setPipelineManager(next.manager)
    const url = new URL(window.location.href)
    if (next.query.trim()) url.searchParams.set("q", next.query)
    else url.searchParams.delete("q")
    if (next.manager) url.searchParams.set("mgr", next.manager)
    else url.searchParams.delete("mgr")
    window.history.replaceState(null, "", url.toString())
  }, [])

  // 재시도(품질 웨이브 3 — 항목 3)를 위해 마지막으로 연 딜의 원본 row를 기억해둔다 —
  // selectedDeal(누적된 상세 필드 포함) 대신 이 최소 shape을 다시 넘겨 openDealLog를 그대로 재실행한다.
  const lastDealRowRef = useRef<{ id: string; customer: string; manager: string | null; team: string | null; region: string | null; revenue: number; stageLabel?: string; stageColor?: string; probability?: number } | null>(null)

  const openDealLog = useCallback(async (row: { id: string; customer: string; manager: string | null; team: string | null; region: string | null; revenue: number; stageLabel?: string; stageColor?: string; probability?: number }) => {
    lastDealRowRef.current = row
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
    } catch (e) {
      // 품질 웨이브 3 — 항목 3. 이전엔 여기서 에러를 완전히 삼켜 월별 매출 로그 섹션이
      // 그냥 사라졌다(로딩만 멈추고 아무 설명 없음) — 이제 DealModal에 detailError로
      // 전달해 "상세를 불러오지 못했습니다 — 재시도" 인라인 문구를 보여준다.
      const message = e instanceof Error ? e.message : "상세를 불러오지 못했습니다."
      setSelectedDeal((cur) => cur && cur.id === row.id ? { ...cur, loadingDetail: false, detailError: message } : cur)
    }
  }, [])

  const retryDealDetail = useCallback(() => {
    const row = lastDealRowRef.current
    if (row) void openDealLog(row)
  }, [openDealLog])

  const monthQuery = period === "M" ? `&month=${encodeURIComponent(selectedMonth)}` : ""
  // 개요는 '다가오는 일정' 상위 8개만 쓰므로 전용 projection으로 전체 회계연도
  // 딜·행사·캠페인 타임라인 과전송을 막는다. 다른 탭과 장부는 기존 기본 계약 유지.
  const summaryViewQuery = activeTab === "overview" ? "&view=overview" : ""
  const summaryUrl = `/api/admin/branch/summary?team=${team}&period=${period}${monthQuery}${summaryViewQuery}`
  const kpiUrl = `/api/admin/branch/kpi?team=${team}&period=${period}${monthQuery}`
  const dataNeeds = getBranchTabDataNeeds(activeTab)
  // 서버 프리페치 시드 — 페이지(app/admin/branch/page.tsx)가 라우트와 같은 조립 함수로
  // 만들어 둔 첫 화면 summary다. 지금 URL·refreshKey와 정확히 일치할 때만 쓰고, 그동안
  // useBranchJson은 요청 자체를 만들지 않는다(enabled=false). 필터·탭 변경이나 새로고침으로
  // 키가 한 번이라도 벗어나면 시드는 폐기되어 다시 살아나지 않는다 — 이후는 전부 기존 페치 경로.
  const summaryStateKey = `${refreshKey}:${summaryUrl}`
  const [summarySeedLive, setSummarySeedLive] = useState(initialData != null)
  const summarySeed =
    summarySeedLive && initialData && `0:${initialData.url}` === summaryStateKey
      ? initialData
      : null
  useEffect(() => {
    if (summarySeedLive && summarySeed == null) setSummarySeedLive(false)
  }, [summarySeedLive, summarySeed])
  const summaryFetched = useBranchJson<BranchSummaryResponse>(summaryUrl, refreshKey, {
    enabled: summarySeed == null,
  })
  const summary: BranchJsonState<BranchSummaryResponse> = summarySeed
    ? { key: summaryStateKey, data: summarySeed.data, error: null, loading: false, stale: false, staleSince: null }
    : summaryFetched
  const kpi = useBranchJson<BranchKpiResponse>(kpiUrl, refreshKey, { enabled: dataNeeds.kpi })
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
  // 품질 웨이브 3 — 항목 1. summary GET이 실패해 오래된 캐시로 조용히 대체됐을 때만 세팅 —
  // lastError(완전 실패, 데이터 자체 없음)가 있으면 그쪽이 더 시급하므로 staleSince는 무시.
  const summaryStaleSince = !lastError && summary.stale ? summary.staleSince : null

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
                <ChevronLeft className="h-3 w-3" /> {BRANCH_SECTION_LABEL}
              </span>
              <span className="opacity-50">›</span>
              <span>KR Team</span>
            </div>
            <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#111110] sm:text-[30px]">
              KR Team
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button type="button" onClick={onRefresh} disabled={refreshing}
              className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60 md:min-h-0 md:min-w-0">
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
                    // 웨이브 7 — U5(터치 타깃). 좁은 뷰포트(<md)에서만 최소 44px로
                    // 확대 — 데스크톱 밀도는 md:min-h-0으로 원복.
                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-3 py-1.5 text-[12px] font-semibold transition md:min-h-0 md:min-w-0 ${
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
                      // 웨이브 7 — U5. 팀 필터 칩과 동일한 모바일 44px 규약.
                      className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-md px-3 py-1.5 text-[12px] font-semibold transition md:min-h-0 md:min-w-0 ${
                        period === p ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
                      }`}>
                      {p}
                    </button>
                  ))}
                </div>
                {period === "M" && (
                  <label className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-2.5 text-[12px] font-semibold text-[#615D59] md:min-h-0 md:h-[35px]">
                    <CalendarDays className="h-3.5 w-3.5 text-[#084734]" aria-hidden="true" />
                    <span className="sr-only">월 선택</span>
                    <select
                      value={selectedMonth}
                      onChange={(event) => selectMonth(event.target.value)}
                      className="min-h-11 bg-transparent pr-1 text-[12px] font-semibold text-[#111110] outline-none md:min-h-0 md:h-7"
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
                className={`relative mt-1 flex min-h-11 min-w-11 shrink-0 flex-col items-start justify-center gap-0.5 rounded-t-lg px-4 py-2.5 text-left transition md:min-h-0 md:min-w-0 sm:px-5 sm:py-3 ${
                  active
                    ? "bg-[#FAFAF8] text-[#111110]"
                    : "bg-transparent text-[#615D59] hover:text-[#111110]"
                }`}
              >
                <span className="whitespace-nowrap text-[13px] font-bold tracking-[-0.01em]">{tab.label}</span>
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
          staleSince={summaryStaleSince}
          crmSync={crmSync}
        />

        <div className="mt-6">
          {activeTab === "overview" && (
            <div
              id={activePanelId}
              role="tabpanel"
              aria-labelledby={activeTabId}
              aria-busy={summary.loading && !summary.data}
            >
              <BranchOverviewPanel
                summary={summary}
                kpi={kpi}
                team={team}
                period={period}
                selectedMonth={selectedMonth}
                periodLabel={activePeriodLabel}
                refreshKey={refreshKey}
                canRunAdminOperations={canRunAdminOperations}
                onUpcomingDealClick={setSelectedDeal}
              />
            </div>
          )}

          {activeTab === "pipeline" && (
            <div id={activePanelId} role="tabpanel" aria-labelledby={activeTabId} className="space-y-4">
              {/* 팀 KPI 아코디언 → 활동 병목·담당자 순으로 단일 열 세로 배치(2열 그리드 해제).
                  부모 space-y-4가 아래 파이프라인 카드와 동일한 세로 리듬을 준다. */}
              <BranchKpiAccordion data={kpi.data} loading={kpi.loading} error={kpi.error} team={team} period={period} selectedMonth={selectedMonth} />
              <ActivityBottleneckSection kpi={kpi.data} loading={kpi.loading} error={kpi.error} />
              <section className="rounded-xl border border-[rgba(0,0,0,0.08)] bg-white shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                <div className="flex items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.08)] px-5 py-3.5">
                  <h2 className="text-[14px] font-bold tracking-[-0.01em] text-[#111110]">파이프라인</h2>
                  <div className="inline-flex rounded-md border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-[3px]">
                    {(["table", "kanban"] as const).map((v) => (
                      <button key={v} type="button" onClick={() => setPipelineView(v)}
                        className={`min-h-11 min-w-11 rounded-[5px] px-2.5 py-1 text-[11px] font-semibold transition md:min-h-0 md:min-w-0 ${
                          pipelineView === v ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
                        }`}>
                        {v === "table" ? "테이블" : "칸반"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={pipelineView === "kanban" ? "" : "px-2.5 py-2"}>
                  {pipelineView === "table" ? (
                    // 품질 웨이브 4 — 항목 4. 이 카드가 이미 "파이프라인" 제목을 렌더하므로
                    // PipelineTable 자체의 "REV 고객별 매출" <h2>는 hideHeader로 숨겨 이중화를 없앤다
                    // (장부 링크·필터·표는 그대로 유지). 헤더가 필요한 히트맵 탭 사용처는 기본값 유지.
                    <PipelineTable key={`pipeline-rev-${team}`} team={team} period={period} selectedMonth={selectedMonth} refreshKey={refreshKey} onRowClick={openDealLog} hideHeader
                      initialQuery={pipelineQuery} initialManager={pipelineManager} onFilterChange={onPipelineFilterChange} />
                  ) : (
                    <BranchPipelineKanban
                      team={team}
                      period={period}
                      selectedMonth={selectedMonth}
                      refreshKey={refreshKey}
                      initialQuery={pipelineQuery}
                      initialManager={pipelineManager}
                      onFilterChange={onPipelineFilterChange}
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
              {/* 웨이브 7 — F3(히트맵 탭 이중 렌더 해소). 파이프라인 탭에 이미 전체 기능
                  테이블이 있으므로 여기서는 검색/필터 없는 요약(summaryMode)만 보여주고,
                  "전체 파이프라인에서 보기"는 같은 페이지의 파이프라인 탭으로 전환한다. */}
              <PipelineTable key={`heatmap-rev-${team}`} team={team} period={period} selectedMonth={selectedMonth} refreshKey={refreshKey} onRowClick={openDealLog}
                summaryMode onViewFullPipeline={() => selectTab("pipeline")} />
            </div>
          )}

          {activeTab === "ai" && (
            <div id={activePanelId} role="tabpanel" aria-labelledby={activeTabId} className="space-y-6">
              <BranchAiInsights team={team} refreshKey={refreshKey} summary={summary.data} canGenerate={canRunAdminOperations} />
            </div>
          )}
        </div>
      </div>

      <DealModal deal={selectedDeal} onClose={() => setSelectedDeal(null)} onRetryDetail={retryDealDetail} />
    </div>
  )
}
