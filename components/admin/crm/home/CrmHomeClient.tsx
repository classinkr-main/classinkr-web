"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { RefreshCw, Calendar, ExternalLink, NotebookPen, Search, UserPlus } from "lucide-react"
import { adminFetchJsonCached, getCachedAdminJson, seedAdminRequestCache } from "@/lib/admin-client"
import { Button } from "@/components/ui/button"
import CrmCoverageStrip from "@/components/admin/crm/CrmCoverageStrip"
import CrmPriorityQueuePanel from "@/components/admin/crm/CrmPriorityQueuePanel"
import CrmWeekAheadPanel from "@/components/admin/crm/CrmWeekAheadPanel"
import CrmCustomerPicker from "@/components/admin/crm/CrmCustomerPicker"
import Customer360DrawerSkeleton from "@/components/admin/crm/Customer360DrawerSkeleton"
import type { CrmHomeInitialData } from "@/lib/admin/crm/home-prefetch"
import { CRM_CACHE_SWR_MS, CRM_CACHE_TTL_MS } from "@/lib/crm/client-cache"
import { getRecentCustomers, type RecentCustomer } from "@/lib/crm/recent-customers"
import { Toast } from "@/components/admin/crm/leads/shared"
import LeadSummaryPanel from "@/components/admin/crm/home/LeadSummaryPanel"
import CompassPipelineBand from "@/components/admin/crm/home/CompassPipelineBand"
import CrmCockpitHero from "@/components/admin/crm/home/CrmCockpitHero"
import CrmHealthDonut from "@/components/admin/crm/home/CrmHealthDonut"
import CrmHomeReportSection, { type CrmReportTab } from "@/components/admin/crm/home/CrmHomeReportSection"
import {
  monthDayParts,
  ValueSkeleton,
  type AdminCrmOverview,
  type BranchKpiResponse,
  type CompassPipelineKpis,
  type LeadActionKpis,
} from "@/components/admin/crm/home/shared"

// 이 파일은 CRM 홈의 클라이언트 본체다. 라우트(app/admin/crm/page.tsx)는 서버 컴포넌트로
// 남아 첫 화면 데이터를 프리페치해 initialData로 내려준다(하드웨어·KR Team·장부와 같은 패턴).
//
// 현황 = 한국팀 아침 지휘대. 액션 밴드(딥링크) + Neo CRM 팀 패널 + 돈 흐름 요약만.
// 리드 관리 보드 전체는 /admin/crm/customers/leads (LeadsBoardClient)로 이동했다.
// 섹션 컴포넌트·타입은 components/admin/crm/home/* 로 분해(2026-08-28) — 이 파일은
// fetch 오케스트레이션과 첫 화면 레이아웃 조립만 소유한다.

// 360 드로어·리드 등록 모달 코드 스플리팅(41af51a4 패턴) — 현황 첫 로드에서 청크를 제외하고
// 고객 클릭/리드 등록 클릭 시점에만 내려받는다. 열림 상태에서만 렌더하므로 로딩 폴백이
// 닫힌 화면에 노출될 일은 없다. 폴백은 unified와 동일한 드로어 골격 스켈레톤을 공유한다.
const Customer360Drawer = dynamic(() => import("@/components/admin/crm/Customer360Drawer"), {
  loading: () => <Customer360DrawerSkeleton />,
})
const LeadRegisterModal = dynamic(() => import("@/components/admin/crm/LeadRegisterModal"), {
  loading: () => <div className="fixed inset-0 z-50 bg-black/20" aria-hidden />,
})

const CRM_ACTION_KPIS_URL = "/api/admin/crm/action-kpis"
const CRM_OVERVIEW_URL = "/api/admin/crm/overview"
const CRM_COMPASS_PIPELINE_URL = "/api/admin/crm/compass-pipeline"
// 월 키를 모듈 로드 시점에 굳히면, 탭을 켜 둔 채 달이 바뀐 세션이 지난달 KPI를 이번 달로
// 계속 보여준다. 조회 시점마다 다시 계산한다.
const branchKpiUrl = (month: string) => `/api/admin/branch/kpi?team=ALL&period=M&month=${month}`
const CRM_HOME_TTL_MS = CRM_CACHE_TTL_MS
const CRM_HOME_STALE_WHILE_REVALIDATE_MS = CRM_CACHE_SWR_MS

function getKstMonthKey(date: Date) {
  const kst = new Date(date.getTime() + 9 * 60 * 60 * 1000)
  return `${kst.getUTCFullYear()}-${String(kst.getUTCMonth() + 1).padStart(2, "0")}`
}

// ─── 메인 화면 ─────────────────────────────────────────────────
export default function CrmHomeClient({ initialData }: { initialData?: CrmHomeInitialData | null }) {
  const router = useRouter()
  // 서버 프리페치가 있으면 첫 렌더부터 값이 있다(스켈레톤 없음). 없으면 지금까지처럼
  // null + 로딩으로 시작해 마운트 효과가 클라이언트 페치를 돈다.
  const [leadKpis, setLeadKpis] = useState<LeadActionKpis | null>(initialData?.leadActionKpis ?? null)
  const [leadKpisLoading, setLeadKpisLoading] = useState(!initialData?.leadActionKpis)
  const [leadKpisError, setLeadKpisError] = useState<string | null>(null)
  const [compassPipeline, setCompassPipeline] = useState<CompassPipelineKpis | null>(
    initialData?.compassPipeline ?? null
  )
  const [compassPipelineLoading, setCompassPipelineLoading] = useState(!initialData?.compassPipeline)
  const [compassPipelineError, setCompassPipelineError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [drawerTarget, setDrawerTarget] = useState<{ key: string; name: string } | null>(null)
  const [recentCustomers, setRecentCustomers] = useState<RecentCustomer[]>([])
  const [leadModalOpen, setLeadModalOpen] = useState(false)
  // 리포트(매출 상세·성과·리드·팀 KPI·수납/로그)는 전부 참조 표면 — 기본 접힘으로
  // 첫 화면을 작업대에 집중시키고, 열었을 때도 탭 하나만 렌더한다.
  const [reportOpen, setReportOpen] = useState(false)
  const [reportTab, setReportTab] = useState<CrmReportTab>("revenue")

  // 고객 바로 가기 — 최근 본 고객(로컬). 드로어 열고 닫을 때마다 갱신.
  useEffect(() => {
    setRecentCustomers(getRecentCustomers())
  }, [drawerTarget])
  const [crmOverview, setCrmOverview] = useState<AdminCrmOverview | null>(initialData?.overview ?? null)
  const [crmOverviewLoading, setCrmOverviewLoading] = useState(!initialData?.overview)
  const [crmOverviewError, setCrmOverviewError] = useState<string | null>(null)
  const [branchKpis, setBranchKpis] = useState<BranchKpiResponse | null>(null)
  // 팀 KPI는 기본 접힘인 리포트의 '팀 KPI' 탭에서만 쓴다. 첫 화면에서 미리 요청하면
  // overview·우선순위 작업대와 같은 연결을 경쟁하므로, 해당 탭을 열 때까지 지연한다.
  const [branchKpisLoading, setBranchKpisLoading] = useState(false)
  const [branchKpisError, setBranchKpisError] = useState<string | null>(null)
  const [branchKpiMonth, setBranchKpiMonth] = useState(() => getKstMonthKey(new Date()))
  const [neoCrmRefreshKey, setNeoCrmRefreshKey] = useState(0)

  // 언마운트 후 setState(경고) 방지 + 토스트가 연달아 뜰 때 이전 타이머가 새 토스트를 지우지 않게.
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  const showToast = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, type })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 3000)
  }, [])

  const fetchLeadKpis = useCallback(async (options?: { force?: boolean }) => {
    const requestUrl = options?.force ? `${CRM_ACTION_KPIS_URL}?force=1` : CRM_ACTION_KPIS_URL
    const hasCached = Boolean(
      getCachedAdminJson<{ leads: LeadActionKpis }>(CRM_ACTION_KPIS_URL, {
        cacheKey: CRM_ACTION_KPIS_URL,
      })
    )
    setLeadKpisLoading(options?.force || !hasCached)
    setLeadKpisError(null)
    try {
      const data = await adminFetchJsonCached<{ leads: LeadActionKpis }>(requestUrl, undefined, {
        cacheKey: CRM_ACTION_KPIS_URL,
        ttlMs: CRM_HOME_TTL_MS,
        force: options?.force,
        staleWhileRevalidateMs: CRM_HOME_STALE_WHILE_REVALIDATE_MS,
        // 캐시를 즉시 보여준 회차의 백그라운드 갱신 결과를 화면에 반영한다. 이 통로가 없으면
        // 마운트 1회 로드인 이 화면은 SWR 창 길이만큼 낡은 숫자를 들고 있게 된다.
        onRevalidated: ({ data: fresh }) => {
          if (fresh) setLeadKpis(fresh.leads)
        },
      })
      setLeadKpis(data.leads)
    } catch (err) {
      const message = err instanceof Error ? err.message : "CRM 리드 KPI를 불러오지 못했습니다."
      setLeadKpisError(message)
      showToast(message, "error")
    } finally {
      setLeadKpisLoading(false)
    }
  }, [showToast])

  // M7 — Compass 브리지가 죽어도 다른 밴드를 물들이지 않도록 별도 상태·에러 채널로 분리.
  // down=true는 API 응답 필드(요청 자체는 성공)이므로 catch가 아니라 setCompassPipeline에서 처리한다.
  const fetchCompassPipeline = useCallback(async (options?: { force?: boolean }) => {
    const requestUrl = options?.force ? `${CRM_COMPASS_PIPELINE_URL}?force=1` : CRM_COMPASS_PIPELINE_URL
    const hasCached = Boolean(
      getCachedAdminJson<CompassPipelineKpis>(CRM_COMPASS_PIPELINE_URL, {
        cacheKey: CRM_COMPASS_PIPELINE_URL,
      })
    )
    setCompassPipelineLoading(options?.force || !hasCached)
    setCompassPipelineError(null)
    try {
      const data = await adminFetchJsonCached<CompassPipelineKpis>(requestUrl, undefined, {
        cacheKey: CRM_COMPASS_PIPELINE_URL,
        ttlMs: CRM_HOME_TTL_MS,
        force: options?.force,
        staleWhileRevalidateMs: CRM_HOME_STALE_WHILE_REVALIDATE_MS,
        onRevalidated: ({ data: fresh }) => {
          if (fresh) setCompassPipeline(fresh)
        },
      })
      setCompassPipeline(data)
    } catch (err) {
      setCompassPipelineError(err instanceof Error ? err.message : "마케팅 파이프라인(Compass)을 불러오지 못했습니다.")
    } finally {
      setCompassPipelineLoading(false)
    }
  }, [])

  const fetchCrmOverview = useCallback(async (options?: { force?: boolean }) => {
    const requestUrl = options?.force ? `${CRM_OVERVIEW_URL}?force=1` : CRM_OVERVIEW_URL
    const hasCached = Boolean(
      getCachedAdminJson<AdminCrmOverview>(CRM_OVERVIEW_URL, {
        cacheKey: CRM_OVERVIEW_URL,
      })
    )
    setCrmOverviewLoading(options?.force || !hasCached)
    setCrmOverviewError(null)
    try {
      const data = await adminFetchJsonCached<AdminCrmOverview>(requestUrl, undefined, {
        cacheKey: CRM_OVERVIEW_URL,
        ttlMs: CRM_HOME_TTL_MS,
        force: options?.force,
        staleWhileRevalidateMs: CRM_HOME_STALE_WHILE_REVALIDATE_MS,
        onRevalidated: ({ data: fresh }) => {
          if (fresh) setCrmOverview(fresh)
        },
      })
      setCrmOverview(data)
    } catch (err) {
      setCrmOverviewError(err instanceof Error ? err.message : "CRM 통합 상태를 불러오지 못했습니다.")
    } finally {
      setCrmOverviewLoading(false)
    }
  }, [])

  const fetchBranchKpis = useCallback(async (options?: { force?: boolean }) => {
    // 조회 시점의 KST 월로 URL을 만든다 — 자정을 넘긴 세션도 이번 달을 본다.
    const month = getKstMonthKey(new Date())
    const url = branchKpiUrl(month)
    const hasCached = Boolean(getCachedAdminJson<BranchKpiResponse>(url, { cacheKey: url }))
    setBranchKpiMonth(month)
    setBranchKpisLoading(options?.force || !hasCached)
    setBranchKpisError(null)
    try {
      const data = await adminFetchJsonCached<BranchKpiResponse>(url, undefined, {
        cacheKey: url,
        ttlMs: CRM_HOME_TTL_MS,
        force: options?.force,
        staleWhileRevalidateMs: CRM_HOME_STALE_WHILE_REVALIDATE_MS,
        onRevalidated: ({ data: fresh }) => {
          if (fresh) setBranchKpis(fresh)
        },
      })
      setBranchKpis(data)
    } catch (err) {
      setBranchKpisError(err instanceof Error ? err.message : "지사관리 KPI를 불러오지 못했습니다.")
    } finally {
      setBranchKpisLoading(false)
    }
  }, [])

  // 서버가 만들어 준 첫 화면 데이터를 클라이언트 캐시에도 심는다.
  // prop은 이 회차 렌더에만 존재하므로, 심어 두지 않으면 다른 탭에 갔다 돌아왔을 때
  // 같은 데이터를 다시 네트워크로 받아온다. 아래 페치 효과보다 먼저 선언해야
  // (효과는 선언 순서대로 실행) 그 회차의 요청이 캐시 적중으로 끝난다.
  useEffect(() => {
    if (!initialData) return
    const seed = { ttlMs: CRM_HOME_TTL_MS, staleWhileRevalidateMs: CRM_HOME_STALE_WHILE_REVALIDATE_MS }
    // 라우트 응답과 **같은 shape**으로 심는다 — action-kpis는 { leads } 로 감싸 내려온다.
    if (initialData.leadActionKpis) {
      seedAdminRequestCache(CRM_ACTION_KPIS_URL, { leads: initialData.leadActionKpis }, seed)
    }
    if (initialData.overview) seedAdminRequestCache(CRM_OVERVIEW_URL, initialData.overview, seed)
    if (initialData.compassPipeline) {
      seedAdminRequestCache(CRM_COMPASS_PIPELINE_URL, initialData.compassPipeline, seed)
    }
  }, [initialData])

  useEffect(() => {
    void fetchLeadKpis()
    void fetchCrmOverview()
    void fetchCompassPipeline()
  }, [fetchLeadKpis, fetchCrmOverview, fetchCompassPipeline])

  useEffect(() => {
    if (!reportOpen || reportTab !== "team") return
    void fetchBranchKpis()
  }, [fetchBranchKpis, reportOpen, reportTab])

  const branchKpisVisible = reportOpen && reportTab === "team"
  const pageRefreshing = leadKpisLoading || crmOverviewLoading || (branchKpisVisible && branchKpisLoading)

  const refreshAll = useCallback(() => {
    void fetchLeadKpis({ force: true })
    void fetchCrmOverview({ force: true })
    void fetchCompassPipeline({ force: true })
    if (reportOpen && reportTab === "team") void fetchBranchKpis({ force: true })
    setNeoCrmRefreshKey((current) => current + 1)
  }, [fetchLeadKpis, fetchCrmOverview, fetchCompassPipeline, fetchBranchKpis, reportOpen, reportTab])

  // 기록 입력은 /activity의 단일 컴포저가 소유한다. 홈 우측 레일과 기록 화면에 같은 폼을
  // 중복 노출하면 우선순위 큐가 좁아지고 사용자는 저장 위치를 다시 판단해야 한다.
  const focusQuickRecord = useCallback(() => {
    router.push("/admin/crm/activity")
  }, [router])

  // 빠른 실행 ③ 검색 — 사이드바 '빠른 이동·검색'과 동일 이벤트로 CrmCommandPalette를 연다.
  const openCommandPalette = useCallback(() => {
    window.dispatchEvent(new Event("admin:open-command-palette"))
  }, [])

  return (
    <div>
      {/* 헤더 — 타이틀만. 액션은 아래 sticky 빠른 실행 바로 이동(H2) */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-[#111110] tracking-[-0.02em]">CRM 홈</h1>
        <p className="mt-1 text-[13px] text-[#1a1a1a]/42">
          ClassIn 고객 DB 기준 · 시트와 외부 CRM은 동기화 참고자료
        </p>
      </div>

      {/* 빠른 실행 바 — 액션만: ①리드 등록 ②기록 추가 ③검색 ⌘K ④새로고침.
          화면 이동 링크는 하단 '바로 가기' 한 줄로 모았다(sticky 바에 두 종류가 섞여 있었다).
          lg+에서 sticky(admin main이 스크롤 컨테이너라 body overflow-x 함정 무관).
          <lg는 body 스크롤 + overflow-x:hidden으로 sticky가 깨지는 저장소 함정이 있어 일반 플로우 폴백. */}
      <div className="-mx-4 mb-4 px-4 py-2 sm:-mx-6 sm:px-6 lg:sticky lg:top-0 lg:z-40 lg:-mx-8 lg:border-b lg:border-[#e8e8e4] lg:bg-[#FAFAF8]/92 lg:px-8 lg:backdrop-blur">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setLeadModalOpen(true)}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[#084734] px-3 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <UserPlus className="h-3.5 w-3.5" />
            리드 등록
          </button>
          <button
            type="button"
            onClick={focusQuickRecord}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
          >
            <NotebookPen className="h-3.5 w-3.5" />
            기록 추가
          </button>
          <button
            type="button"
            onClick={openCommandPalette}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#111110] transition-colors hover:bg-[#f5f5f2]"
          >
            <Search className="h-3.5 w-3.5" />
            검색
            <kbd className="rounded border border-[#e8e8e4] bg-[#fafaf8] px-1 py-0.5 text-[10px] font-semibold text-[#1a1a1a]/45">
              ⌘K
            </kbd>
          </button>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshAll}
            disabled={pageRefreshing}
            // 옆의 수제 h-9 버튼들과 높이·radius·글자크기 정렬(size=sm 기본 h-8·13px 오버라이드).
            className="h-9 gap-1.5 rounded-lg text-[12px]"
          >
            <RefreshCw className={`w-4 h-4 ${pageRefreshing ? "animate-spin" : ""}`} />새로고침
          </Button>
        </div>
      </div>

      {/* 구매 전 신규 매출 풀을 먼저 확인하고, 바로 아래 행동 큐에서 처리한다. */}
      <LeadSummaryPanel
        leadKpis={leadKpis}
        loading={leadKpisLoading}
        error={leadKpisError}
        onRetry={() => void fetchLeadKpis({ force: true })}
      />

      {/* M7 — 리드 요약(자체 유입) 바로 아래에 Compass(마케팅팀 앱) 파이프라인 한 줄을 붙인다.
          같은 아침 지휘대 안에서 자체 리드와 Compass 딜 흐름을 한 시야에 둔다. */}
      <CompassPipelineBand
        data={compassPipeline}
        loading={compassPipelineLoading}
        error={compassPipelineError}
        onRetry={() => void fetchCompassPipeline({ force: true })}
      />

      {/* 리드 요약 다음에 오늘의 행동 큐를 붙여 숫자 확인 → 처리 흐름을 한 축으로 만든다. */}
      <CrmPriorityQueuePanel refreshKey={neoCrmRefreshKey} />

      {/* 결과 지표는 행동 큐 뒤의 참고 밴드로 둔다. */}
      <CrmCockpitHero
        overview={crmOverview}
        loading={crmOverviewLoading}
        error={crmOverviewError}
        onRetry={() => void fetchCrmOverview({ force: true })}
      />

      {/* 고객 찾기 — 검색 + 최근 본 + 자주 접촉을 한 표면에. 고객으로 가는 입구를 한 곳으로 모은다
          (자주 접촉 칩은 리드·일정 요약 안에 끼어 있던 것을 여기로 옮겼다). */}
      <section className="mb-4 rounded-2xl border border-[#e8e8e4] bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1a1a1a]/30">고객 찾기</p>
        <CrmCustomerPicker
          label={searchQuery}
          linkedId=""
          onFreeText={setSearchQuery}
          onClear={() => setSearchQuery("")}
          onPick={(pick) => {
            setDrawerTarget({
              key: `${pick.targetType === "neo_account" ? "neo" : "lead"}:${pick.targetId}`,
              name: pick.targetLabel,
            })
            setSearchQuery("")
          }}
        />
        {recentCustomers.length > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[#f0f0ec] pt-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#1a1a1a]/30">최근 본 고객</span>
            {recentCustomers.slice(0, 6).map((rc) => (
              <button
                key={rc.key}
                type="button"
                onClick={() => setDrawerTarget({ key: rc.key, name: rc.name })}
                className="inline-flex items-center gap-1 rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#111110] transition-colors hover:border-[#c8c8c4] hover:bg-[#fafaf8]"
              >
                <span className="max-w-[120px] truncate">{rc.name}</span>
                <span className="text-[10px] text-[#1a1a1a]/35">{rc.sourceLabel}</span>
              </button>
            ))}
          </div>
        ) : null}

        {(crmOverview?.business.frequentCustomers.length ?? 0) > 0 ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-[#f0f0ec] pt-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[#1a1a1a]/30">자주 접촉 · 14일</span>
            {crmOverview?.business.frequentCustomers.map((customer) => (
              <Link
                key={customer.customerId}
                href={customer.href}
                title={customer.latestSummary ?? undefined}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#e8e8e4] bg-white px-2.5 py-1 text-[11px] font-medium text-[#111110] transition-colors hover:border-[#c8c8c4] hover:bg-[#fafaf8]"
              >
                <span className="max-w-[120px] truncate">{customer.customerName}</span>
                <span className="rounded-full bg-[#f0f0ec] px-1.5 text-[10px] font-semibold tabular-nums text-[#1a1a1a]/55">
                  {customer.contactCount}
                </span>
              </Link>
            ))}
          </div>
        ) : null}
      </section>

      {/* 주간 조망 밴드 — 우측 aside에서 본문으로 이동(H4: 우측 열은 액션 레일 전용) · 기능 보존 */}
      <div className="mb-4 grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {/* 이번 주 할 일 — 주간 일정·버킷 조망 */}
        <CrmWeekAheadPanel compact refreshKey={neoCrmRefreshKey} />

        {/* 설치·방문 일정 — upcomingThisWeek(install|visit) 상위 3건 */}
        <section className="rounded-2xl border border-[#e8e8e4] bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[#1a1a1a]/45">
              <Calendar className="h-3.5 w-3.5" />
              <p className="text-[11px] font-bold uppercase tracking-[0.08em]">설치·방문 일정</p>
              {/* 0 플래시 금지(CRM-5) — overview 도착 전엔 스켈레톤 */}
              {crmOverviewLoading && !crmOverview ? (
                <ValueSkeleton className="h-4 w-8" />
              ) : (
                <span className="rounded-full bg-[#ECFDF5] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#084734]">
                  이번 주 {crmOverview?.business.upcomingThisWeek.count ?? 0}
                </span>
              )}
            </div>
            <Link
              href="/admin/calendar"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#1a1a1a]/40 transition-colors hover:text-[#111110]"
            >
              캘린더
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          {(crmOverview?.business.upcomingThisWeek.items.length ?? 0) === 0 ? (
            crmOverviewLoading && !crmOverview ? (
              // 콜드 로드 — 일정 칩 레이아웃과 일치하는 스켈레톤(CRM-5)
              <div className="space-y-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-9 animate-pulse rounded-xl bg-[#f0f0ec]" />
                ))}
              </div>
            ) : (
              <p className="rounded-xl bg-[#fafaf8] px-3 py-4 text-center text-[12px] text-[#1a1a1a]/35">
                예정된 설치·방문이 없습니다.
              </p>
            )
          ) : (
            <ul className="space-y-2">
              {crmOverview?.business.upcomingThisWeek.items.slice(0, 3).map((item) => {
                const parts = monthDayParts(item.startsAt)
                return (
                  <li key={item.id}>
                    <Link href={item.href} className="flex items-center gap-2.5 transition-colors hover:opacity-80">
                      <span className="flex h-9 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-[#ECFDF5] text-[#084734]">
                        <span className="text-[9px] font-semibold leading-none">{parts.month}</span>
                        <span className="text-[13px] font-bold leading-tight">{parts.day}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-[#111110]">{item.title}</p>
                        <p className="truncate text-[11px] text-[#1a1a1a]/45">
                          {item.kind === "install" ? "설치" : "방문"}
                          {item.customerName ? ` · ${item.customerName}` : ""}
                        </p>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* 고객 건강도 — 활성 고객 안전/주의/위험 실분포(없으면 자동 숨김) */}
        <CrmHealthDonut />
      </div>

      <CrmCoverageStrip />

      {/* 리포트 · 분석 — 흩어져 있던 참조 블록 5개를 한 아코디언 안의 탭으로 단일화 */}
      <CrmHomeReportSection
        open={reportOpen}
        onToggle={() => setReportOpen((value) => !value)}
        tab={reportTab}
        onTabChange={setReportTab}
        overview={crmOverview}
        loading={crmOverviewLoading}
        error={crmOverviewError}
        branchKpis={branchKpis}
        branchError={branchKpisError}
        leadKpis={leadKpis}
        refreshing={pageRefreshing}
        neoCrmRefreshKey={neoCrmRefreshKey}
        branchKpiMonth={branchKpiMonth}
      />

      {/* 바로 가기 — 상단 sticky 바의 보조 링크와 하단 '심화 보기'로 갈려 있던 딥링크를 한 줄로 모았다.
          (주요 화면 이동은 사이드바 CRM 확장이 담당 — 여기는 보조 경로) */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-[#1a1a1a]/35">바로 가기</span>
        {[
          { href: "/admin/crm/customers/leads", label: "리드" },
          { href: "/admin/crm/deals", label: "견적·매출" },
          { href: "/admin/crm/customers/unified", label: "고객·후속" },
          { href: "/admin/crm/matching", label: "데이터 매칭 인박스" },
          { href: "/admin/crm/deals/rev-sheet", label: "매출시트" },
          { href: "/admin/crm/insights", label: "인사이트 분석" },
        ].map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="inline-flex h-7 items-center rounded-lg border border-[#e8e8e4] bg-white px-2.5 font-medium text-[#1a1a1a]/60 transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
          >
            {link.label}
          </Link>
        ))}
      </div>

      {/* 열림 상태에서만 렌더 — 닫힘=null 렌더였던 기존과 동일 화면이면서, dynamic 청크를
          열 때만 내려받고 닫힌 첫 로드에 로딩 폴백이 새어 나오지 않는다. */}
      {drawerTarget ? (
        <Customer360Drawer
          customerKey={drawerTarget.key}
          name={drawerTarget.name}
          onClose={() => setDrawerTarget(null)}
        />
      ) : null}

      {leadModalOpen ? (
        <LeadRegisterModal
          open
          onClose={() => setLeadModalOpen(false)}
          onDone={() => void fetchLeadKpis({ force: true })}
        />
      ) : null}

      {toast && <Toast msg={toast.msg} type={toast.type} />}
    </div>
  )
}
