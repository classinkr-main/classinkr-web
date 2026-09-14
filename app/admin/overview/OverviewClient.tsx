"use client"

import {
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  Suspense,
  type Dispatch,
  type SetStateAction,
} from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import {
  Users,
  TrendingUp,
  CheckCircle2,
  Mail,
  FileText,
  Eye,
  AlertCircle,
  ArrowUpRight,
  Bot,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Inbox,
  Link2,
  RotateCw,
  Send,
  ShieldAlert,
} from "lucide-react"
import { adminFetchJsonCached } from "@/lib/admin-client"
import { StatCard } from "@/components/admin/StatCard"
import {
  EmptyState,
  KpiSkeleton,
  MiniFunnel,
  SectionCard,
  SectionSkeleton,
  Skeleton,
  SOURCE_PALETTE,
  type FunnelStage,
} from "@/components/admin/viz"
import type {
  AdminLeadsOverviewResponse,
  OverviewLeadSummary,
} from "@/lib/admin/overview/lead-summary"
// 서버 프리페치 계약(타입만 — server-only 모듈은 클라이언트 번들에 들어가지 않는다).
import type { OverviewInitialData } from "@/lib/admin/overview/prefetch"
// 파생 로직(신호 판정·집계·우선순위)은 전부 insights 순수 모듈 소유 — 이 컴포넌트는 주입+렌더만.
import {
  buildOperationalAlerts,
  computePipelineCoverage,
  deriveBugInsights,
  deriveCampaignInsights,
  deriveConnections,
  deriveEventInsights,
  deriveLatestPatchNote,
  formatDateShort,
  formatDateTime,
  resolveUnrespondedSignal,
  SOURCE_LABEL,
  type BranchMonthlySeries,
  type OverviewSignalTone,
} from "@/lib/admin/overview/insights"
// 스트리밍 전환(2026-09-10 2라운드)으로 "refreshKey===0이면서 fresh한가"를 판정하던
// shouldUsePrefetchedSource 대신, 소스별 레인(openPrefetchLane)의 generatedAt을 그 레인이
// 실제로 settle된 시점에 직접 판정한다 — 아래 PrefetchSourceBridge 참고.
import { isPrefetchFresh } from "@/lib/admin/prefetch-freshness"
import type { AdminIntegrationStatusResponse } from "@/lib/admin-integrations/types"
import type { CalendarEvent } from "@/lib/calendar-data"
import type { BlogPostStatus } from "@/lib/blog-types"
import type { AdminBlogOverviewSummary } from "@/lib/admin/overview/blog-summary"
import type { EmailCampaign } from "@/lib/marketing-types"
import type { BugReport } from "@/lib/bugs-data"
import type { PatchNote } from "@/lib/patch-notes-data"

const OVERVIEW_FETCH_TIMEOUT_MS = 12_000

async function fetchJson<T>(url: string, { fresh = false }: { fresh?: boolean } = {}): Promise<T | null> {
  try {
    return await adminFetchJsonCached<T>(url, { adminTimeoutMs: OVERVIEW_FETCH_TIMEOUT_MS }, {
      ttlMs: 60_000,
      // 재방문 시 10분 내 데이터면 스피너 없이 즉시 표시 + 백그라운드 갱신
      staleWhileRevalidateMs: 10 * 60_000,
      force: fresh,
    })
  } catch {
    return null
  }
}

// 뷰포트 밖 위젯(Instagram 채널 지표 카드)의 fetch 시점을 메인 스레드가 한가할 때까지
// 미룬다 — 첫 화면 콜드 순간의 동시 요청 수를 줄이기 위한 지연 로드(감사 P2). Safari에는
// requestIdleCallback이 없어 setTimeout으로 대체한다.
function scheduleIdle(task: () => void) {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(task, { timeout: 2000 })
  } else {
    setTimeout(task, 200)
  }
}

type OverviewSourceKey = "leads" | "visitor" | "chatbot" | "branch" | "leadActions" | "os"
type OverviewSourceState = "loading" | "ready" | "error"

const INITIAL_SOURCE_STATES: Record<OverviewSourceKey, OverviewSourceState> = {
  leads: "loading",
  visitor: "loading",
  chatbot: "loading",
  branch: "loading",
  leadActions: "loading",
  os: "loading",
}

/**
 * 소스 하나를 조용히(로딩 플래시 없이) 다시 페치해 최종 상태만 반영한다 — 사용자가 누른
 * "다시 시도"(retrySource)와 달리 이 함수는 호출 전에 sourceStates를 "loading"으로 되돌리지
 * 않는다: 호출 시점에 화면엔 이미 값(스테일이든, 애초에 loading 상태였든)이 있으므로 여기서
 * loading으로 되돌리면 오히려 화면이 깜빡인다. 두 경로에서 쓴다 —
 *  1) PrefetchSourceBridge: 서버 레인이 null로 끝나면(권한 없음·실패·15초 ceiling) 지금까지
 *     해오던 클라이언트 폴백 페치.
 *  2) 재시도 이펙트(fresh=true): "전체 다시 시도" 버튼 — retrySource와 달리 이쪽은 이미
 *     INITIAL_SOURCE_STATES로 리셋된 뒤라 역시 loading 플래시가 필요 없다.
 * 컴포넌트 바깥의 모듈 스코프 함수인 이유: useCallback으로 감싸면 T가 useCallback의 시그니처
 * (T extends Function)를 한 번 더 거치며 제네릭 추론이 약해질 위험이 있다 — 평범한 최상위
 * 제네릭 함수는 그 위험이 없고, setSourceStates(useState 세터)·unmountedRef(ref 객체)는
 * 원래 항상 안정적이라 인자로 그냥 넘겨도 참조 안정성 문제가 없다.
 */
async function loadSourceQuiet<T>(
  key: OverviewSourceKey,
  url: string,
  apply: (data: T) => void,
  setSourceStates: Dispatch<SetStateAction<Record<OverviewSourceKey, OverviewSourceState>>>,
  unmountedRef: { current: boolean },
  fresh = false
) {
  const data = await fetchJson<T>(url, { fresh })
  if (unmountedRef.current) return
  if (data === null) {
    setSourceStates((current) => ({ ...current, [key]: "error" }))
    return
  }
  apply(data)
  setSourceStates((current) => ({ ...current, [key]: "ready" }))
}

/**
 * 소스 하나의 openPrefetchLane 결과(promise)를 React use()로 풀어, 그 결과를 부모
 * (OverviewClient)의 기존 top-level state로 옮기기만 하는 다리 컴포넌트 — 화면에는
 * 아무것도 그리지 않는다(return null).
 *
 * 왜 "화면에 보이는 타일"이 각자 use()를 걸지 않고 안 보이는 다리를 따로 두는가:
 * leadOverview 하나만 해도 이 화면 안에서 인바운드·흐름 지표 3타일·차트·파이·퍼널까지
 * 6곳 넘게 재사용된다(osSummary도 5~7개 타일이 같은 레인을 본다). 재사용되는 모든 자리에
 * 각자 use()를 걸면 retrySource("leads") 같은 단일 소스 재시도가 그중 한 자리만 갱신하고
 * 나머지는 낡은 값을 들고 있게 된다 — top-level state 하나를 여러 타일이 같이 읽는 지금
 * 구조가 재시도의 "모든 자리가 함께 갱신된다"는 보장을 지키는 유일하게 단순한 방법이다.
 * 대신 이 다리를 소스마다 독립된 형제 <Suspense>로 감싸면(아래 OverviewClient의 return
 * 최상단 참고) "느린 소스가 다른 소스나 화면 전체를 막지 않는다"는 이번 작업의 핵심 요건은
 * 그대로 만족한다 — 여섯 개 다리가 서로 완전히 독립적으로 settle되고, 그중 아무것도 페이지
 * 첫 렌더(SSR 스트림)를 기다리게 하지 않는다.
 *
 * fallback=null인 이유: 화면에 보이는 로딩 표시는 지금처럼 sourceStates 초기값
 * (INITIAL_SOURCE_STATES="loading")이 이미 그린다 — 이 다리가 뭔가 그리면 이중 스켈레톤이
 * 된다. 다리가 resolve된 뒤에도 여전히 null을 반환한다 — 실제 표시는 부모 state 갱신에
 * 뒤따르는 재렌더가 담당한다.
 */
function PrefetchSourceBridge<T>({
  promise,
  onSettled,
}: {
  promise: Promise<T | null>
  onSettled: (value: T | null) => void
}) {
  const value = use(promise)
  useEffect(() => {
    onSettled(value)
    // value는 promise가 한 번 settle되면 그 뒤로 항상 같은 참조/원시값이다(React가 이미
    // resolve된 thenable의 결과를 캐시한다) — onSettled는 각 소스의 seedX 콜백으로,
    // 호출부에서 useCallback으로 참조를 고정해 이 effect가 불필요하게 재실행되지 않는다.
  }, [value, onSettled])
  return null
}

const SOURCE_STATE_LABEL: Record<OverviewSourceKey, string> = {
  leads: "리드",
  visitor: "방문자",
  chatbot: "챗봇",
  branch: "매출",
  leadActions: "CRM 후속",
  os: "운영 OS",
}

function KpiUnavailable({
  label,
  onRetry,
  detail = "0이 아니라 조회 실패입니다.",
}: {
  label: string
  onRetry: () => void
  detail?: string
}) {
  return (
    <div className="flex min-h-[154px] flex-col items-start justify-between rounded-2xl border border-[#F6D5C5] bg-[#FEF9F6] p-5">
      <div>
        <AlertCircle className="h-4 w-4 text-[#B85C33]" aria-hidden="true" />
        <p className="mt-3 text-[12px] font-semibold text-[#111110]">{label}를 불러오지 못했습니다</p>
        <p className="mt-1 text-[11px] leading-relaxed text-[#615D59]">{detail}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-[#E8E8E4] bg-white px-3 text-[11px] font-semibold text-[#615D59] transition-colors hover:border-[#C8C8C4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
      >
        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
        다시 시도
      </button>
    </div>
  )
}

function OsDetailUnavailable({
  label,
  detail,
  onRetry,
}: {
  label: string
  detail?: string | null
  onRetry: () => void
}) {
  return (
    <div role="alert" className="flex min-h-11 items-center gap-2 rounded-lg border border-[#F6D5C5] bg-[#FEF9F6] px-3 py-2">
      <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#B85C33]" aria-hidden="true" />
      <span className="min-w-0 flex-1 text-[11px] leading-relaxed text-[#8F2C2C]">
        {label} 조회 실패<span className="sr-only">. {detail ?? "0건이 아닙니다."}</span>
      </span>
      <button
        type="button"
        onClick={onRetry}
        aria-label={`${label} 지표 다시 시도`}
        className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-semibold text-[#8F2C2C] transition-colors hover:bg-white"
      >
        <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
        다시 시도
      </button>
    </div>
  )
}

function statusToneClasses(tone: OverviewSignalTone) {
  switch (tone) {
    case "info":
      return "bg-[#ECFDF5] text-[#084734] border-[#D1FAE5]"
    case "warning":
      return "bg-amber-50 text-amber-700 border-amber-100"
    case "danger":
      return "bg-[#FEF3EE] text-[#B85C33] border-[#F6D5C5]"
    case "success":
      return "bg-green-50 text-green-700 border-green-100"
    default:
      return "bg-[#f0f0ec] text-[#1a1a1a]/50 border-[#e8e8e4]"
  }
}

// SectionCard·Skeleton·SectionSkeleton·KpiSkeleton·EmptyState는 @/components/admin/viz로 이관(중복 제거).

// Recharts는 무거우므로 KPI 카드가 먼저 그려진 뒤 차트만 지연 로드한다.
const LeadTrendChart = dynamic(
  () => import("@/components/admin/overview/OverviewCharts").then((m) => m.LeadTrendChart),
  { ssr: false, loading: () => <Skeleton className="h-[180px]" /> }
)
const SourcePie = dynamic(
  () => import("@/components/admin/overview/OverviewCharts").then((m) => m.SourcePie),
  { ssr: false, loading: () => <Skeleton className="h-[140px]" /> }
)
// KPI 카드 미니 추이 — Recharts 경계를 overview가 소유.
const Sparkline = dynamic(
  () => import("@/components/admin/viz/Sparkline").then((m) => m.Sparkline),
  { ssr: false, loading: () => <div className="h-[30px]" /> }
)
// SOURCE_LABEL은 insights 모듈로 이관(pieData 집계와 렌더가 같은 라벨을 공유).
const STATUS_LABEL: Record<string, string> = {
  new: "신규",
  contacted: "연락중",
  converted: "전환",
  closed: "종료",
}
const STATUS_COLOR: Record<string, string> = {
  new: "bg-[#ECFDF5] text-[#084734]",
  contacted: "bg-amber-50 text-amber-700",
  converted: "bg-[#D1FAE5] text-[#065c41]",
  closed: "bg-[#f0f0ec] text-[#1a1a1a]/40",
}
const CAMPAIGN_STATUS_LABEL: Record<EmailCampaign["status"], string> = {
  draft: "초안",
  sent: "발송됨",
  failed: "실패",
}
const CAMPAIGN_STATUS_COLOR: Record<EmailCampaign["status"], string> = {
  draft: "bg-amber-50 text-amber-700",
  sent: "bg-[#ECFDF5] text-[#084734]",
  failed: "bg-[#FEF3EE] text-[#B85C33]",
}
const PUBLISH_STATUS_LABEL: Record<BlogPostStatus, string> = {
  draft: "초안",
  review: "검수",
  published: "공개",
  archived: "보관",
}
const PUBLISH_STATUS_COLOR: Record<BlogPostStatus, string> = {
  draft: "bg-amber-50 text-amber-700",
  review: "bg-[#ECFDF5] text-[#084734]",
  published: "bg-green-50 text-green-700",
  archived: "bg-[#f0f0ec] text-[#1a1a1a]/40",
}
const COMPACT_NUMBER = new Intl.NumberFormat("ko-KR", { notation: "compact", maximumFractionDigits: 1 })

// KPI 스트립 공통 레이아웃 — 모바일에서도 카드가 잘리지 않도록 가로 스크롤 대신 세로 그리드로 비교한다.
// Tailwind grid-cols-*는 minmax(0,1fr)라 min-w-0 규약을 만족한다(우측 삐져나옴 방지).
const KPI_STRIP_CLASS =
  "grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5"
// 타일 래퍼 — 모든 뷰포트에서 컨테이너 폭을 넘지 않고 내부 카드/스켈레톤의 높이를 맞춘다.
const KPI_TILE_CLASS = "min-w-0 [&>*]:h-full"
// 인바운드 요약 스트립 — 3타일 전용(KPI_STRIP_CLASS는 5열 고정이라 재사용 불가).
const INBOUND_STRIP_CLASS =
  "grid grid-cols-1 gap-3 sm:grid-cols-3"

// 챗봇 stats 응답의 from 파라미터용 로컬 날짜(YYYY-MM-DD).
function localDateOnly(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

interface InstagramOverviewDashboard {
  account: {
    username?: string
    followersCount: number
  }
  summary: {
    mediaCount: number
    totalViews: number
    averageViews: number
    followerDelta: number
  }
}

// 운영 OS 요약 스트립 전용 (읽기 전용 합성 데이터)
interface BranchSummaryPayload {
  revenue: { confirmed: number; goal: number; pacing_pct: number }
  monthly_series: BranchMonthlySeries
}

// 미응답 정의의 캐논 원천(action-kpis → getLeadActionStats). 타일·주의신호가 같은 수를 쓴다.
interface LeadActionKpisPayload {
  unrespondedCount: number
  unresponded24hCount: number
}

type OsSummarySourceKey = "renewal" | "matching" | "hw" | "content" | "events"

interface OsSummaryPayload {
  // sources가 없는 구 클라이언트 캐시는 안전하게 error로 취급하고 강제 재시도한다.
  sources?: Record<OsSummarySourceKey, { status: "ready" | "error"; error: string | null }>
  renewal: { expiringSoonCount: number | null }
  matching: { coveragePct: number | null; linked: number | null; total: number | null; needsReview: number | null }
  // plannedBoards86: 배송예정(아직 실판매 아님) — 구 캐시 응답에는 없을 수 있어 optional.
  hw: { boards86: number | null; plannedBoards86?: number | null; target: number }
  content: { blogPublished: number | null; target: number }
  events: { count: number | null; target: number }
}

const OS_SOURCE_STATE_LABEL: Record<OsSummarySourceKey, string> = {
  renewal: "리뉴얼",
  matching: "매칭",
  hw: "하드웨어",
  content: "블로그",
  events: "행사",
}

// 인바운드 요약 스트립 전용 — /api/admin/chatbot/stats 응답 중 totals만 소비한다.
interface ChatbotStatsPayload {
  totals: {
    questionCount: number
    unresolvedCount: number
    handoffCount: number
    directAnswerCount: number
  }
}

interface VisitorStatsPayload {
  today: {
    date: string
    homeVisitors: number
    homePageViews: number
  }
  totals: {
    homeVisitors: number
    homePageViews: number
    visitors: number
    pageViews: number
  }
  daily: Array<{
    date: string
    homeVisitors: number
    homePageViews: number
  }>
}

export default function OverviewClient({ initialData }: { initialData: OverviewInitialData }) {
  const [leadOverview, setLeadOverview] = useState<OverviewLeadSummary | null>(null)
  const [subscriberCount, setSubscriberCount] = useState(0)
  const [blogOverview, setBlogOverview] = useState<AdminBlogOverviewSummary | null>(null)
  const [campaigns, setCampaigns] = useState<EmailCampaign[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [integrationStatus, setIntegrationStatus] = useState<AdminIntegrationStatusResponse | null>(null)
  const [bugs, setBugs] = useState<BugReport[]>([])
  const [patchNotes, setPatchNotes] = useState<PatchNote[]>([])
  const [instagramDashboard, setInstagramDashboard] = useState<InstagramOverviewDashboard | null>(null)
  const [branchSummary, setBranchSummary] = useState<BranchSummaryPayload | null>(null)
  const [leadActionKpis, setLeadActionKpis] = useState<LeadActionKpisPayload | null>(null)
  const [osSummary, setOsSummary] = useState<OsSummaryPayload | null>(null)
  const [visitorStats, setVisitorStats] = useState<VisitorStatsPayload | null>(null)
  const [chatbotStats, setChatbotStats] = useState<ChatbotStatsPayload | null>(null)
  // 여섯 소스 모두 처음엔 "loading"으로 시작한다 — 스트리밍 전환 전에는 initialData가
  // 이미 동기 값이라 seededSourceStates로 ready를 앞당겼지만, 이제 initialData.X는
  // {promise, generatedAt}이라 settle되기 전까지는 알 수 없다. 아래 PrefetchSourceBridge가
  // 소스별로 독립 Suspense 안에서 resolve되는 즉시 해당 키만 "ready"/"error"로 올린다.
  const [sourceStates, setSourceStates] =
    useState<Record<OverviewSourceKey, OverviewSourceState>>(INITIAL_SOURCE_STATES)
  const [refreshKey, setRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [chartRange, setChartRange] = useState<7 | 30>(7)
  const [alertsExpanded, setAlertsExpanded] = useState(false)

  // loadSourceQuiet의 안전판 — 언마운트 뒤 도착하는 레인/폴백 페치 결과가 setState를
  // 부르지 않게 한다(15초 ceiling까지 살아있는 레인이 있어, 사용자가 이미 다른 탭으로
  // 이동한 뒤 settle될 수 있다).
  const unmountedRef = useRef(false)
  useEffect(
    () => () => {
      unmountedRef.current = true
    },
    []
  )

  // ─── 소스별 프리페치 시드 콜백 — PrefetchSourceBridge(아래 return 참고)가 promise를
  // use()로 푼 뒤 이 콜백들로 값을 넘긴다. 값이 있으면 즉시 반영하고(스테일이면 조용히
  // 백그라운드 재검증까지), null이면(권한 없음·실패·15초 ceiling) 지금까지처럼 클라이언트
  // 폴백 페치를 곧장 튼다 — "이중 페치 금지" 계약은 "신선하면 아무것도 더 안 부른다"로
  // 지킨다.
  const seedLeadOverview = useCallback(
    (value: OverviewLeadSummary | null) => {
      if (value !== null) {
        setLeadOverview(value)
        setSourceStates((current) => ({ ...current, leads: "ready" }))
        if (isPrefetchFresh(initialData.leadOverview.generatedAt)) return
      }
      void loadSourceQuiet<AdminLeadsOverviewResponse>(
        "leads",
        "/api/admin/leads?scope=overview",
        (data) => setLeadOverview(data.overview),
        setSourceStates,
        unmountedRef
      )
    },
    [initialData.leadOverview.generatedAt]
  )
  const seedVisitorStats = useCallback(
    (value: VisitorStatsPayload | null) => {
      if (value !== null) {
        setVisitorStats(value)
        setSourceStates((current) => ({ ...current, visitor: "ready" }))
        if (isPrefetchFresh(initialData.visitorStats.generatedAt)) return
      }
      void loadSourceQuiet<VisitorStatsPayload>(
        "visitor",
        "/api/admin/visitor-stats?range=7",
        setVisitorStats,
        setSourceStates,
        unmountedRef
      )
    },
    [initialData.visitorStats.generatedAt]
  )
  const seedChatbotStats = useCallback(
    (value: ChatbotStatsPayload | null) => {
      // 마운트 이펙트·retrySource("chatbot")과 같은 오늘-6일 산식(localDateOnly).
      const chatbotFrom = new Date()
      chatbotFrom.setDate(chatbotFrom.getDate() - 6)
      const url = `/api/admin/chatbot/stats?from=${localDateOnly(chatbotFrom)}`
      if (value !== null) {
        setChatbotStats(value)
        setSourceStates((current) => ({ ...current, chatbot: "ready" }))
        if (isPrefetchFresh(initialData.chatbotStats.generatedAt)) return
      }
      void loadSourceQuiet<ChatbotStatsPayload>("chatbot", url, setChatbotStats, setSourceStates, unmountedRef)
    },
    [initialData.chatbotStats.generatedAt]
  )
  const seedBranchSummary = useCallback(
    (value: BranchSummaryPayload | null) => {
      if (value !== null) {
        setBranchSummary(value)
        setSourceStates((current) => ({ ...current, branch: "ready" }))
        if (isPrefetchFresh(initialData.branchSummary.generatedAt)) return
      }
      void loadSourceQuiet<BranchSummaryPayload>(
        "branch",
        "/api/admin/branch/summary?team=ALL&period=Y",
        setBranchSummary,
        setSourceStates,
        unmountedRef
      )
    },
    [initialData.branchSummary.generatedAt]
  )
  const seedOsSummary = useCallback(
    (value: OsSummaryPayload | null) => {
      if (value !== null) {
        setOsSummary(value)
        setSourceStates((current) => ({ ...current, os: "ready" }))
        if (isPrefetchFresh(initialData.osSummary.generatedAt)) return
      }
      void loadSourceQuiet<OsSummaryPayload>(
        "os",
        "/api/admin/os-summary?contract=v3",
        setOsSummary,
        setSourceStates,
        unmountedRef
      )
    },
    [initialData.osSummary.generatedAt]
  )
  const seedLeadActionKpis = useCallback(
    (value: LeadActionKpisPayload | null) => {
      if (value !== null) {
        setLeadActionKpis(value)
        setSourceStates((current) => ({ ...current, leadActions: "ready" }))
        if (isPrefetchFresh(initialData.leadActionKpis.generatedAt)) return
      }
      void loadSourceQuiet<{ leads: LeadActionKpisPayload }>(
        "leadActions",
        "/api/admin/crm/action-kpis",
        (data) => setLeadActionKpis(data.leads),
        setSourceStates,
        unmountedRef
      )
    },
    [initialData.leadActionKpis.generatedAt]
  )

  useEffect(() => {
    let cancelled = false
    const fresh = refreshKey > 0

    const load = async () => {
      setLoading(true)
      // 재시도("전체 다시 시도", refreshKey>0)만 여섯 소스를 강제로 다시 조회한다 — 최초
      // 마운트(refreshKey===0)는 위 PrefetchSourceBridge 6개가 각자 독립적으로 담당하므로
      // 여기서 손대지 않는다(이미 loading으로 시작했거나 브리지가 이미 ready로 올렸다).
      if (fresh) {
        setSourceStates(INITIAL_SOURCE_STATES)
        void loadSourceQuiet<BranchSummaryPayload>(
          "branch",
          "/api/admin/branch/summary?team=ALL&period=Y",
          setBranchSummary,
          setSourceStates,
          unmountedRef,
          true
        )
        void loadSourceQuiet<{ leads: LeadActionKpisPayload }>(
          "leadActions",
          "/api/admin/crm/action-kpis",
          (data) => setLeadActionKpis(data.leads),
          setSourceStates,
          unmountedRef,
          true
        )
        void loadSourceQuiet<OsSummaryPayload>(
          "os",
          "/api/admin/os-summary?contract=v3",
          setOsSummary,
          setSourceStates,
          unmountedRef,
          true
        )
        void loadSourceQuiet<VisitorStatsPayload>(
          "visitor",
          "/api/admin/visitor-stats?range=7",
          setVisitorStats,
          setSourceStates,
          unmountedRef,
          true
        )
        const chatbotFrom = new Date()
        chatbotFrom.setDate(chatbotFrom.getDate() - 6)
        void loadSourceQuiet<ChatbotStatsPayload>(
          "chatbot",
          `/api/admin/chatbot/stats?from=${localDateOnly(chatbotFrom)}`,
          setChatbotStats,
          setSourceStates,
          unmountedRef,
          true
        )
      }

      // Instagram은 외부 Meta API 합성이라(자체 300초 서버 캐시가 있어도, lib/meta/marketing.ts)
      // "채널 지표" 맨 아래 카드 하나에만 쓰는 뷰포트 밖 위젯이다 — 마운트 즉시 다른 13개 소스와
      // 같은 틱에 쏘면 콜드 순간 동시 요청 수만 늘린다(감사 P2, 첫 화면 팬아웃 축소).
      // requestIdleCallback으로 메인 스레드가 비는 시점까지만 미루고(최대 2초, Safari는
      // requestIdleCallback이 없어 setTimeout으로 대체), 핵심 대시보드 완성 시점은 건드리지
      // 않는다 — 실패해도 이 위젯 하나만 "연결 필요"로 격리된다(다른 카드는 영향 없음).
      scheduleIdle(() => {
        if (cancelled) return
        void fetchJson<InstagramOverviewDashboard>(
          "/api/admin/meta/instagram?datePreset=last_30d&limit=25",
          { fresh }
        ).then((instagramData) => {
          if (!cancelled) setInstagramDashboard(instagramData ?? null)
        })
      })

      // branch/leadActions/os/visitor/chatbot의 최초 마운트 조회는 위 fresh 분기(재시도
      // 전용) 또는 각 PrefetchSourceBridge의 seedX 콜백이 이미 전담했다 — 예전엔 여기서
      // "!prefetched.X"로 한 번 더 걸러 클라이언트 폴백을 틀지 말지 판단했지만, 그 판단이
      // 이제 seedX 콜백 내부(isPrefetchFresh 체크)로 옮겨갔다. 대시보드는 앞으로 7일치
      // 일정만 쓰므로 전체 일정 대신 해당 월만 요청한다.
      const now = new Date()
      const weekLater = new Date(now)
      weekLater.setDate(now.getDate() + 7)
      const calendarMonths = [{ year: now.getFullYear(), month: now.getMonth() + 1 }]
      if (weekLater.getMonth() !== now.getMonth() || weekLater.getFullYear() !== now.getFullYear()) {
        calendarMonths.push({ year: weekLater.getFullYear(), month: weekLater.getMonth() + 1 })
      }

      const [
        leadsData,
        subscribersData,
        blogData,
        campaignData,
        calendarData,
        integrationStatusData,
        bugsData,
        patchNotesData,
      ] = await Promise.all([
        // leadOverview는 최초 마운트(fresh=false)에는 seedLeadOverview가 전담한다(레인이
        // null이면 그쪽에서 이미 자기 몫의 클라이언트 폴백을 튼다) — 여기서 또 부르면
        // 이중 페치가 된다. 재시도(fresh=true)에서만 이 Promise.all의 일원으로 강제 조회한다.
        fresh
          ? fetchJson<AdminLeadsOverviewResponse>("/api/admin/leads?scope=overview", { fresh })
          : Promise.resolve<AdminLeadsOverviewResponse | null>(null),
        fetchJson<{ subscribers: unknown[]; total: number }>("/api/admin/subscribers?count=1", { fresh }),
        fetchJson<{ overview: AdminBlogOverviewSummary }>("/api/admin/blog?scope=overview", { fresh }),
        // summary 스코프 — 캠페인 HTML 본문(body)은 이 화면에서 읽지 않는다(T5-B). URL은
        // AdminSidebar NAV_WARMUP_REQUESTS["/admin/overview"]의 항목과 문자 그대로 같아야 예열이 적중한다.
        fetchJson<{ campaigns: EmailCampaign[] }>("/api/admin/email?scope=summary", { fresh }),
        Promise.all(
          calendarMonths.map(({ year, month }) =>
            fetchJson<CalendarEvent[]>(`/api/admin/calendar?year=${year}&month=${month}`, { fresh })
          )
        ).then((results) => {
          const merged = new Map<string, CalendarEvent>()
          for (const events of results) {
            for (const event of events ?? []) merged.set(event.id, event)
          }
          return Array.from(merged.values())
        }),
        // 연동 여부는 GET /api/admin/settings가 webhook URL을 마스킹하므로
        // env+DB 합성 health(integrations/status)를 사용한다. (ops/settings와 동일 소스)
        fetchJson<AdminIntegrationStatusResponse>("/api/admin/settings/integrations/status", { fresh }),
        fetchJson<BugReport[]>("/api/admin/bugs", { fresh }),
        // 최신 1건의 id/version/title/date/status만 쓴다 — changes(jsonb)·전체 목록 불필요(T5-B).
        fetchJson<PatchNote[]>("/api/admin/patch-notes?limit=1&summary=1", { fresh }),
      ])

      if (cancelled) return

      if (fresh) {
        setLeadOverview(leadsData?.overview ?? null)
        setSourceStates((current) => ({ ...current, leads: leadsData?.overview ? "ready" : "error" }))
      }
      setSubscriberCount(subscribersData?.total ?? 0)
      setBlogOverview(blogData?.overview ?? null)
      setCampaigns(campaignData?.campaigns ?? [])
      setCalendarEvents(calendarData ?? [])
      setIntegrationStatus(integrationStatusData ?? null)
      setBugs(bugsData ?? [])
      setPatchNotes(patchNotesData ?? [])
      setLoading(false)
    }

    load().finally(() => {
      if (!cancelled) setLoading(false)
    })

    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const {
    newLeads,
    contactedLeads,
    converted,
    closedLeads,
    activePipelineLeads,
    convRate,
    todayLeads,
    thisWeekLeads,
    weekTrend,
    thisMonthLeads,
    convertedThisMonth,
    convertedTrend,
    homepageToday,
    homepageThisWeek,
    homepageTotal,
    homepageUnconfirmed,
  } = leadOverview?.metrics ?? {
    newLeads: 0,
    contactedLeads: 0,
    converted: 0,
    closedLeads: 0,
    activePipelineLeads: 0,
    convRate: 0,
    todayLeads: 0,
    thisWeekLeads: 0,
    weekTrend: 0,
    thisMonthLeads: 0,
    convertedThisMonth: 0,
    convertedTrend: 0,
    homepageToday: 0,
    homepageThisWeek: 0,
    homepageTotal: 0,
    homepageUnconfirmed: 0,
  }
  const pieData = leadOverview?.sources ?? []
  const recentLeads = leadOverview?.recentLeads ?? []

  const chartData = useMemo(
    () => (chartRange === 7 ? leadOverview?.trends.days7 : leadOverview?.trends.days30) ?? [],
    [leadOverview, chartRange]
  )
  const chartTotal = useMemo(() => chartData.reduce((sum, point) => sum + point.count, 0), [chartData])

  const publishedBlogPostCount = blogOverview?.publishedPosts ?? 0
  const ctaCoverage = blogOverview?.ctaCoverage ?? 0
  const recentPosts = blogOverview?.recentPosts ?? []
  const publishedPostsWithoutCta = blogOverview?.publishedPostsWithoutCta ?? 0

  const { recentCampaigns, draftCampaigns, sentCampaigns, latestFailedCampaign } = useMemo(
    () => deriveCampaignInsights(campaigns),
    [campaigns]
  )

  const { upcomingEvents, nextUpcomingEvent } = useMemo(
    () => deriveEventInsights(calendarEvents),
    [calendarEvents]
  )

  const { openBugs, criticalOpenBugs } = useMemo(() => deriveBugInsights(bugs), [bugs])

  const latestPatchNote = useMemo(() => deriveLatestPatchNote(patchNotes), [patchNotes])

  const instagramViews = instagramDashboard?.summary.totalViews ?? 0
  const instagramMediaCount = instagramDashboard?.summary.mediaCount ?? 0
  const instagramAverageViews = instagramDashboard?.summary.averageViews ?? 0
  const visitorTodayIndex =
    visitorStats?.daily.findIndex((day) => day.date === visitorStats.today.date) ?? -1
  const visitorYesterday =
    visitorStats && visitorTodayIndex > 0 ? visitorStats.daily[visitorTodayIndex - 1] : null
  const homeVisitorTrend = visitorStats
    ? visitorStats.today.homeVisitors - (visitorYesterday?.homeVisitors ?? 0)
    : 0

  // 연동 상태 카드 — 외부 전송 경로 4종. 미연결 판정은 insights.deriveConnections 소유(오탐 방지 규칙 포함).
  const { connections, missingConnections } = deriveConnections(integrationStatus)

  // 세일즈 퍼널 시각화용 단계 (MiniFunnel) — 각 단계는 해당 필터가 켜진 리드 보드로 착지한다.
  const funnelStages: FunnelStage[] = [
    { label: STATUS_LABEL.new, value: newLeads, tone: newLeads > 0 ? "caution" : "brand", href: "/admin/crm/customers/leads?filter=new" },
    { label: STATUS_LABEL.contacted, value: contactedLeads, href: "/admin/crm/customers/leads?filter=contacted" },
    { label: STATUS_LABEL.converted, value: converted, href: "/admin/crm/customers/leads?filter=converted" },
    { label: STATUS_LABEL.closed, value: closedLeads, tone: "neutral", href: "/admin/crm/customers/leads?filter=closed" },
  ]

  // '미응답' 수치는 이 화면 전체에서 resolveUnrespondedSignal 하나로만 산출한다(단일 정의·단일 수치).
  // 캐논 원천은 action-kpis 라우트 — 도착 전이나 실패 시에는 서버가 같은 정의로 집계한
  // Overview 요약값을 사용한다. 브라우저에 전체 리드 행을 다시 보내지 않는다.
  const unrespondedSignal = useMemo(
    () =>
      resolveUnrespondedSignal(
        leadActionKpis ??
          (leadOverview
            ? {
                unrespondedCount: leadOverview.metrics.unrespondedCount,
                unresponded24hCount: leadOverview.metrics.unresponded24hCount,
              }
            : null),
        null
      ),
    [leadActionKpis, leadOverview]
  )

  // 오늘 할 일 / 주의 신호 — 우선순위·tone·임계값 판정은 insights.buildOperationalAlerts 소유.
  const { alerts: operationalAlerts, actionableAlertCount: actionableOperationalAlertCount } =
    buildOperationalAlerts({
      unrespondedCount: unrespondedSignal?.unrespondedCount ?? 0,
      unresponded24hCount: unrespondedSignal?.unresponded24hCount ?? 0,
      todayLeads,
      thisWeekLeads,
      latestFailedCampaign,
      missingConnectionLabels: missingConnections.map((connection) => connection.label),
      openBugs,
      criticalOpenBugs,
      publishedBlogPostCount,
      publishedPostsWithoutCta,
      ctaCoverage,
      draftCampaignCount: draftCampaigns.length,
      sentCampaignCount: sentCampaigns.length,
      nextUpcomingEvent,
      latestPatchNote,
    })

  // REV 장부 금액은 전부 위안화 — CRM CurrencyChip 아이디엄(기호+통화 병기)대로 ¥를 붙여 합산 오독을 막는다.
  const fmtCny = (value: number) => `¥${COMPACT_NUMBER.format(value)}`

  // KPI 카드 스파크라인 데이터.
  const sparkLeads = leadOverview?.trends.days30.slice(-14).map((point) => point.count) ?? []
  const sparkRevenue = branchSummary?.monthly_series.revenue_cum ?? []
  const sparkVisitors = visitorStats?.daily.map((day) => day.homeVisitors) ?? []

  const pipelineCoverage = computePipelineCoverage(branchSummary?.monthly_series)
  const failedRequestSourceLabels = (Object.entries(sourceStates) as Array<
    [OverviewSourceKey, OverviewSourceState]
  >)
    .filter(([, state]) => state === "error")
    .map(([key]) => SOURCE_STATE_LABEL[key])
  const failedOsSourceLabels =
    sourceStates.os === "ready"
      ? (Object.entries(osSummary?.sources ?? {}) as Array<
          [OsSummarySourceKey, { status: "ready" | "error"; error: string | null }]
        >)
          .filter(([, health]) => health.status === "error")
          .map(([key]) => OS_SOURCE_STATE_LABEL[key])
      : []
  const failedSourceLabels = [...failedRequestSourceLabels, ...failedOsSourceLabels]
  const osSourceState = (key: OsSummarySourceKey): OverviewSourceState => {
    if (sourceStates.os !== "ready") return sourceStates.os
    return osSummary?.sources?.[key]?.status === "ready" ? "ready" : "error"
  }
  const osSourceError = (key: OsSummarySourceKey) => osSummary?.sources?.[key]?.error ?? undefined
  const retryOverview = () => setRefreshKey((current) => current + 1)

  // 위젯 단위 재시도 — retryOverview("전체 다시 시도")는 14개 소스를 전부 force로 다시 부르는
  // 넓은 폴백으로 상단 배너에만 남겨 두고, 개별 KPI 카드의 "다시 시도"는 실패한 소스 하나만
  // 다시 부른다(감사 P2 — 지금까지는 카드 하나가 실패해도 무관한 나머지 소스까지 함께 강제
  // 재요청했다). os 서브타일(리뉴얼·매칭·HW·블로그·행사) 다섯 개는 /api/admin/os-summary
  // 응답 하나의 필드라 네트워크 단위로 더 쪼갤 수 없다 — 그 다섯 카드는 os 전체를 다시
  // 부르되, leads·visitor·chatbot·branch·leadActions 등 무관한 키는 건드리지 않는 것이
  // 이 API 형태에서 가능한 최소 단위다.
  const retrySource = useCallback((key: OverviewSourceKey) => {
    setSourceStates((current) => ({ ...current, [key]: "loading" }))
    switch (key) {
      case "leads":
        void fetchJson<AdminLeadsOverviewResponse>("/api/admin/leads?scope=overview", { fresh: true }).then(
          (data) => {
            setLeadOverview(data?.overview ?? null)
            setSourceStates((current) => ({ ...current, leads: data?.overview ? "ready" : "error" }))
          }
        )
        return
      case "visitor":
        void fetchJson<VisitorStatsPayload>("/api/admin/visitor-stats?range=7", { fresh: true }).then((data) => {
          setVisitorStats(data)
          setSourceStates((current) => ({ ...current, visitor: data ? "ready" : "error" }))
        })
        return
      case "chatbot": {
        // 마운트 이펙트의 챗봇 fetch와 같은 오늘-6일 산식(localDateOnly) — 다른 값을 쓰면
        // 재시도가 다른 캐시 슬롯을 데워 인바운드 스트립과 어긋난 숫자를 보여줄 수 있다.
        const chatbotFrom = new Date()
        chatbotFrom.setDate(chatbotFrom.getDate() - 6)
        void fetchJson<ChatbotStatsPayload>(
          `/api/admin/chatbot/stats?from=${localDateOnly(chatbotFrom)}`,
          { fresh: true }
        ).then((data) => {
          setChatbotStats(data)
          setSourceStates((current) => ({ ...current, chatbot: data ? "ready" : "error" }))
        })
        return
      }
      case "branch":
        void fetchJson<BranchSummaryPayload>("/api/admin/branch/summary?team=ALL&period=Y", { fresh: true }).then(
          (data) => {
            setBranchSummary(data)
            setSourceStates((current) => ({ ...current, branch: data ? "ready" : "error" }))
          }
        )
        return
      case "leadActions":
        void fetchJson<{ leads: LeadActionKpisPayload }>("/api/admin/crm/action-kpis", { fresh: true }).then(
          (data) => {
            setLeadActionKpis(data?.leads ?? null)
            setSourceStates((current) => ({ ...current, leadActions: data ? "ready" : "error" }))
          }
        )
        return
      case "os":
        void fetchJson<OsSummaryPayload>("/api/admin/os-summary?contract=v3", { fresh: true }).then((data) => {
          setOsSummary(data)
          setSourceStates((current) => ({ ...current, os: data ? "ready" : "error" }))
        })
        return
    }
  }, [])

  return (
    <div className="relative overflow-hidden px-4 pt-6 pb-16 sm:px-6 sm:pt-8 lg:px-8 lg:pb-20 [&_a]:min-h-11 [&_button]:min-h-11 [&_a]:focus-visible:outline-none [&_a]:focus-visible:ring-2 [&_a]:focus-visible:ring-[#084734] [&_a]:focus-visible:ring-offset-2 [&_button]:focus-visible:outline-none [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-[#084734] [&_button]:focus-visible:ring-offset-2">
      {/* 소스별 독립 Suspense 경계 — 서버가 openPrefetchLane으로 연 6개 레인을 각각
          형제 <Suspense>로 감싼다(화면 전체를 하나로 감싸면 가장 느린 소스가 전체를 막아
          스트리밍 이점이 사라진다 — 이번 작업의 핵심 요건). 각 다리(PrefetchSourceBridge)는
          화면에 아무것도 그리지 않고 결과를 위 seedX 콜백을 통해 top-level state로 옮기기만
          한다. refreshKey>0(재시도) 이후에는 렌더하지 않는다 — 그 뒤로는 위 giant effect가
          fresh=true 분기로 직접 클라이언트에서 강제 재조회한다. */}
      {refreshKey === 0 ? (
        <>
          <Suspense fallback={null}>
            <PrefetchSourceBridge promise={initialData.leadOverview.promise} onSettled={seedLeadOverview} />
          </Suspense>
          <Suspense fallback={null}>
            <PrefetchSourceBridge promise={initialData.visitorStats.promise} onSettled={seedVisitorStats} />
          </Suspense>
          <Suspense fallback={null}>
            <PrefetchSourceBridge promise={initialData.chatbotStats.promise} onSettled={seedChatbotStats} />
          </Suspense>
          <Suspense fallback={null}>
            <PrefetchSourceBridge promise={initialData.branchSummary.promise} onSettled={seedBranchSummary} />
          </Suspense>
          <Suspense fallback={null}>
            <PrefetchSourceBridge promise={initialData.osSummary.promise} onSettled={seedOsSummary} />
          </Suspense>
          <Suspense fallback={null}>
            <PrefetchSourceBridge promise={initialData.leadActionKpis.promise} onSettled={seedLeadActionKpis} />
          </Suspense>
        </>
      ) : null}
      {/* 헤더 — eyebrow·소개문은 제거(사이드바가 위치를, 섹션이 내용을 이미 말한다).
          확보한 공간은 숫자에게 주고, 우측은 상시 바로가기만 남긴다. */}
      <div className="relative mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#111110]">Overview</h1>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { href: "/admin/crm", label: "CRM" },
            { href: "/admin/campaigns", label: "캠페인" },
            { href: "/admin/branch/ledger", label: "매출 장부" },
            { href: "/admin/calendar", label: "캘린더" },
            { href: "/admin/settings", label: "설정" },
          ].map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex items-center justify-center rounded-lg border border-[#e8e8e4] bg-white px-3 py-1.5 text-[12px] font-medium text-[#1a1a1a]/70 transition-colors hover:border-[#c8c8c4] hover:text-[#111110]"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </div>

      {failedSourceLabels.length > 0 ? (
        <div
          role="status"
          aria-live="polite"
          className="relative mb-4 flex flex-col gap-3 rounded-xl border border-[#F6D5C5] bg-[#FEF9F6] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-[12px] leading-relaxed text-[#615D59]">
            <span className="font-semibold text-[#8F2C2C]">일부 지표 확인 필요</span>
            <span aria-hidden="true"> · </span>
            {failedSourceLabels.join(" · ")} 조회에 실패했습니다. 실패를 0으로 표시하지 않습니다.
          </p>
          <button
            type="button"
            onClick={retryOverview}
            className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#E8E8E4] bg-white px-3 text-[11px] font-semibold text-[#615D59] transition-colors hover:border-[#C8C8C4] hover:text-[#111110] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#084734] focus-visible:ring-offset-2"
          >
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            전체 다시 시도
          </button>
        </div>
      ) : null}

      {/* 인바운드 — 홈페이지 방문·문의(contact)·챗봇 질문을 최상단에 고정한다
          ('관망 지표 하강 배치' 규칙의 명시적 예외). 세 타일 모두 '최근 7일' 단일 창. */}
      <section
        className="relative mb-6"
        aria-labelledby="overview-inbound-heading"
        aria-busy={
          sourceStates.visitor === "loading" ||
          sourceStates.leads === "loading" ||
          sourceStates.chatbot === "loading"
        }
      >
        <div className="mb-3 flex items-baseline gap-2">
          <h2 id="overview-inbound-heading" className="text-[14px] font-semibold text-[#111110]">인바운드</h2>
          <span className="text-[11px] text-[#1a1a1a]/40">최근 7일</span>
        </div>
        <div className={INBOUND_STRIP_CLASS}>
          <div className={KPI_TILE_CLASS}>
            {sourceStates.visitor === "ready" && visitorStats ? (
              <StatCard
                icon={<Eye className="h-4 w-4" />}
                label="홈페이지 방문"
                value={`${visitorStats.totals.homeVisitors.toLocaleString("ko-KR")}명`}
                sub={`오늘 ${visitorStats.today.homeVisitors} · PV ${visitorStats.totals.homePageViews.toLocaleString("ko-KR")}`}
                tone="neutral"
                valueSize="lg"
                sparkline={sparkVisitors.length ? <Sparkline data={sparkVisitors} /> : undefined}
                href="/admin/traffic"
              />
            ) : sourceStates.visitor === "error" ? (
              <KpiUnavailable label="방문 지표" onRetry={() => retrySource("visitor")} />
            ) : (
              <KpiSkeleton />
            )}
          </div>
          <div className={KPI_TILE_CLASS}>
            {sourceStates.leads === "loading" ? (
              <KpiSkeleton />
            ) : sourceStates.leads === "error" ? (
              <KpiUnavailable label="문의 지표" onRetry={() => retrySource("leads")} />
            ) : (
              <StatCard
                icon={<Inbox className="h-4 w-4" />}
                label="홈페이지 유입"
                value={`${homepageThisWeek}건`}
                sub={
                  // 누적 옆에 미확인 건수를 같이 낸다. 이 타일은 확인 게이트를 안 걸고 세는데
                  // 눌러서 착지하는 리드 보드는 걸기 때문에, 이 수를 안 밝히면 "타일 4건 →
                  // 목록 3건"이 아무 설명 없이 어긋난다. 링크도 게이트를 연 채로 착지시킨다.
                  homepageUnconfirmed > 0
                    ? `오늘 ${homepageToday} · 누적 ${homepageTotal} · 미확인 ${homepageUnconfirmed}`
                    : `오늘 ${homepageToday} · 누적 ${homepageTotal}`
                }
                tone="neutral"
                valueSize="lg"
                href="/admin/crm/customers/leads?group=homepage&unconfirmed=1"
              />
            )}
          </div>
          <div className={KPI_TILE_CLASS}>
            {sourceStates.chatbot === "ready" && chatbotStats ? (
              <StatCard
                icon={<Bot className="h-4 w-4" />}
                label="챗봇 문의"
                value={`${chatbotStats.totals.questionCount.toLocaleString("ko-KR")}건`}
                sub={`미해결 ${chatbotStats.totals.unresolvedCount} · 상담연결 ${chatbotStats.totals.handoffCount}`}
                tone="neutral"
                valueSize="lg"
                href="/admin/chatbot"
              />
            ) : sourceStates.chatbot === "error" ? (
              <KpiUnavailable label="챗봇 지표" onRetry={() => retrySource("chatbot")} />
            ) : (
              <KpiSkeleton />
            )}
          </div>
        </div>
      </section>

      {/* (a) 운영 OS 커맨드 바 — 이 표면의 존재 이유. 신호는 필터드 딥링크로 행동에 직결한다.
          콜드로드: 각 타일은 자기 원천(fetch)이 null이면 '…' 대신 레이아웃 일치 KpiSkeleton을 렌더한다. */}
      <section
        className="relative mb-6 rounded-2xl border border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] p-4 sm:p-5"
        aria-labelledby="overview-os-heading"
        aria-busy={
          sourceStates.leadActions === "loading" ||
          sourceStates.branch === "loading" ||
          sourceStates.os === "loading"
        }
      >
        <div className="mb-4 flex items-baseline gap-2">
          <h2 id="overview-os-heading" className="text-[14px] font-semibold text-[#111110]">운영 OS</h2>
          <span className="text-[11px] text-[#1a1a1a]/45">지금 잡아야 할 신호</span>
        </div>
        <div className={`${KPI_STRIP_CLASS} -mx-4 px-4 sm:-mx-5 sm:px-5 md:mx-0 md:px-0`}>
          <div className={KPI_TILE_CLASS}>
            {unrespondedSignal ? (
              <StatCard
                icon={<AlertCircle className="h-4 w-4" />}
                label="24h+ 신규 상태"
                value={`${unrespondedSignal.unresponded24hCount}건`}
                // 산정 기준 캡션 — 주의신호 카드와 동일 어휘·동일 기준(미응답 리드=데모·문의·Meta 신규).
                sub="응답 이벤트 대리 지표 · 운영 리드 · 테스트 제외"
                tone={unrespondedSignal.unresponded24hCount > 0 ? "danger" : "neutral"}
                valueSize="lg"
                href="/admin/crm/customers/leads?filter=unresponded_24h&focus=risk"
              />
            ) : sourceStates.leadActions === "error" && sourceStates.leads === "error" ? (
              <KpiUnavailable label="CRM 후속 지표" onRetry={() => retrySource("leadActions")} />
            ) : (
              <KpiSkeleton />
            )}
          </div>
          <div className={KPI_TILE_CLASS}>
            {sourceStates.branch === "ready" && branchSummary ? (
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="파이프 커버리지"
                value={pipelineCoverage != null ? `${pipelineCoverage.toFixed(1)}x` : "—"}
                sub="예상 파이프 ÷ 잔여목표 (≥2.0x 권장)"
                tone={pipelineCoverage != null && pipelineCoverage < 2.0 ? "danger" : "neutral"}
                valueSize="lg"
                // 이 카드는 /api/admin/branch/summary?period=Y(연간) 값으로 계산된다 — 쿼리 없이
                // 착지하면 장부 페이지 기본값(period=Q)이 열려 방금 본 숫자와 다른 화면이 뜬다
                // (components/admin/branch/ledger/workbench-shared.tsx의 period 기본값 확인,
                // 그 파일은 이 작업 소유 밖이라 읽기만 했다).
                href="/admin/branch/ledger?period=Y"
              />
            ) : sourceStates.branch === "error" ? (
              <KpiUnavailable label="매출 지표" onRetry={() => retrySource("branch")} />
            ) : (
              <KpiSkeleton />
            )}
          </div>
          <div className={KPI_TILE_CLASS}>
            {osSourceState("renewal") === "ready" && osSummary?.renewal.expiringSoonCount != null ? (
              <StatCard
                icon={<CalendarDays className="h-4 w-4" />}
                // 원천 임계값이 60일(crm-neo-customer-snapshots)이므로 라벨도 D-60로 고정한다.
                label="리뉴얼 D-60"
                value={`${osSummary.renewal.expiringSoonCount}건`}
                sub="60일 이내 만료 · 선제 대응"
                tone={osSummary.renewal.expiringSoonCount > 0 ? "caution" : "neutral"}
                valueSize="lg"
                href="/admin/crm/customers/accounts?expiring=1"
              />
            ) : osSourceState("renewal") === "error" ? (
              <KpiUnavailable label="리뉴얼 지표" detail={osSourceError("renewal")} onRetry={() => retrySource("os")} />
            ) : (
              <KpiSkeleton />
            )}
          </div>
          <div className={KPI_TILE_CLASS}>
            {osSourceState("matching") === "ready" &&
            osSummary?.matching.coveragePct != null &&
            osSummary.matching.linked != null &&
            osSummary.matching.total != null &&
            osSummary.matching.needsReview != null ? (
              <StatCard
                icon={<Link2 className="h-4 w-4" />}
                label="링크 확정률"
                value={`${osSummary.matching.coveragePct}%`}
                sub={`확정 ${osSummary.matching.linked}/${osSummary.matching.total} · 검토 대기 ${osSummary.matching.needsReview}`}
                tone={osSummary.matching.coveragePct < 80 ? "caution" : "neutral"}
                valueSize="lg"
                href="/admin/crm/matching"
              />
            ) : osSourceState("matching") === "error" ? (
              <KpiUnavailable label="매칭 지표" detail={osSourceError("matching")} onRetry={() => retrySource("os")} />
            ) : (
              <KpiSkeleton />
            )}
          </div>
          <div className={KPI_TILE_CLASS}>
            {osSourceState("hw") === "ready" && osSummary?.hw.boards86 != null ? (
              <StatCard
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="진척 · HW"
                value={`${osSummary.hw.boards86}/${osSummary.hw.target}`}
                sub={
                  // boards86은 실판매만 집계 — 배송예정분은 별도 캡션으로 병기(구 캐시엔 필드 없음).
                  (osSummary.hw.plannedBoards86 ?? 0) > 0
                    ? `86보드 실판매 기준 · 배송예정 ${osSummary.hw.plannedBoards86}대`
                    : "86보드 실판매 기준"
                }
                tone="neutral"
                valueSize="lg"
                href="/admin/hardware"
              />
            ) : osSourceState("hw") === "error" ? (
              <KpiUnavailable label="하드웨어 지표" detail={osSourceError("hw")} onRetry={() => retrySource("os")} />
            ) : (
              <KpiSkeleton />
            )}
          </div>
        </div>
        {/* 진척 세부(콘텐츠·행사)는 타일에서 분리해 도메인별 딥링크로 제공한다. */}
        {sourceStates.os !== "loading" ? (
          <div className="mt-3 border-t border-[rgba(0,0,0,0.08)] pt-3">
            <span className="mb-2 block text-[11px] text-[#1a1a1a]/35">진척 상세</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {osSourceState("content") === "ready" && osSummary?.content.blogPublished != null ? (
                <Link
                  href="/admin/blog"
                  className="inline-flex min-h-11 items-center justify-between gap-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[11px] font-medium text-[#1a1a1a]/55 transition-colors hover:text-[#111110]"
                >
                  <span>블로그 {osSummary.content.blogPublished}/{osSummary.content.target}</span>
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              ) : (
                <OsDetailUnavailable label="블로그" detail={osSourceError("content")} onRetry={() => retrySource("os")} />
              )}
              {osSourceState("events") === "ready" && osSummary?.events.count != null ? (
                <Link
                  href="/admin/events"
                  className="inline-flex min-h-11 items-center justify-between gap-2 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white px-3 text-[11px] font-medium text-[#1a1a1a]/55 transition-colors hover:text-[#111110]"
                >
                  <span>행사 {osSummary.events.count}/{osSummary.events.target}</span>
                  <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                </Link>
              ) : (
                <OsDetailUnavailable label="행사" detail={osSourceError("events")} onRetry={() => retrySource("os")} />
              )}
            </div>
          </div>
        ) : null}
      </section>

      {/* (b) 오늘 할 일 / 주의 신호 — 배너·시그널칩·리스크 통합 */}
      <div className="mb-6">
        <SectionCard
          title="오늘 할 일 / 주의 신호"
          action={
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusToneClasses(
                actionableOperationalAlertCount > 0 ? "warning" : operationalAlerts.length > 0 ? "info" : "success"
              )}`}
            >
              {actionableOperationalAlertCount > 0
                ? `주의 ${actionableOperationalAlertCount}`
                : operationalAlerts.length > 0
                  ? `최근 ${operationalAlerts.length}`
                  : "정상"}
            </span>
          }
        >
          {loading ? (
            <SectionSkeleton rows={4} />
          ) : operationalAlerts.length === 0 ? (
            <EmptyState
              title="지금은 운영 주의 신호가 없습니다."
              description="문의, 캠페인, 연동, 일정, 배포 변경이 안정 상태면 이 영역은 비어 있습니다."
            />
          ) : (
            <>
              <div id="overview-operational-alerts" className="grid gap-3 md:grid-cols-2">
                {(alertsExpanded ? operationalAlerts : operationalAlerts.slice(0, 6)).map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="group flex items-start gap-3 rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-[#c8c8c4] hover:shadow-[0_10px_24px_rgba(17,17,16,0.04)]"
                  >
                    <div className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border ${statusToneClasses(item.tone)}`}>
                      <ShieldAlert className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${statusToneClasses(item.tone)}`}>
                          {item.scope}
                        </span>
                        <span className="text-[11px] text-[#1a1a1a]/35">{item.meta}</span>
                      </div>
                      <p className="mt-1 truncate text-[13px] font-semibold text-[#111110]">{item.title}</p>
                      <p className="mt-1 text-[12px] leading-relaxed text-[#1a1a1a]/40">{item.description}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-[#1a1a1a]/35 group-hover:text-[#111110]">
                      {item.action}
                      <ChevronRight className="h-3 w-3" />
                    </span>
                  </Link>
                ))}
              </div>
              {operationalAlerts.length > 6 ? (
                <button
                  type="button"
                  onClick={() => setAlertsExpanded((prev) => !prev)}
                  aria-expanded={alertsExpanded}
                  aria-controls="overview-operational-alerts"
                  className="mt-3 flex w-full items-center justify-center gap-1 rounded-lg text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
                >
                  {alertsExpanded ? "접기" : `더보기 (${operationalAlerts.length - 6})`}
                  {alertsExpanded ? <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />}
                </button>
              ) : null}
            </>
          )}
        </SectionCard>
      </div>

      {/* (c) 흐름 지표 — 관망 지표는 신호 아래로 하강 배치. 정상 상태는 중립 톤(신호색 예산제). */}
      <section
        className="mb-6"
        aria-labelledby="overview-flow-heading"
        aria-busy={sourceStates.leads === "loading"}
      >
        <div className="mb-3">
          <h2 id="overview-flow-heading" className="text-[14px] font-semibold text-[#111110]">흐름 지표</h2>
        </div>
        {sourceStates.leads === "error" ? (
          <KpiUnavailable label="리드 흐름" onRetry={() => retrySource("leads")} />
        ) : sourceStates.leads === "loading" ? (
          <div className={KPI_STRIP_CLASS}>
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={KPI_TILE_CLASS}>
                <KpiSkeleton />
              </div>
            ))}
          </div>
        ) : (
          <div className={KPI_STRIP_CLASS}>
            <div className={KPI_TILE_CLASS}>
              <StatCard
                icon={<Users className="h-4 w-4" />}
                label="세일즈 파이프라인"
                value={activePipelineLeads}
                sub={`신규 ${newLeads} · 연락중 ${contactedLeads}`}
                tone={newLeads > 0 ? "caution" : "neutral"}
                sparkline={<Sparkline data={sparkLeads} tone={newLeads > 0 ? "caution" : "brand"} />}
                href="/admin/crm/customers/leads"
              />
            </div>
            <div className={KPI_TILE_CLASS}>
              <StatCard
                icon={<TrendingUp className="h-4 w-4" />}
                label="이번 주 유입"
                value={thisWeekLeads}
                sub={`오늘 +${todayLeads} · 이번 달 ${thisMonthLeads}`}
                trend={{ value: weekTrend, label: "지난주 대비" }}
                sparkline={<Sparkline data={sparkLeads.slice(7)} />}
                href="/admin/crm/customers/leads"
              />
            </div>
            <div className={KPI_TILE_CLASS}>
              <StatCard
                icon={<CheckCircle2 className="h-4 w-4" />}
                label="전환율"
                value={`${convRate}%`}
                sub={`전환 ${converted}건 · 이번 달 ${convertedThisMonth}건`}
                trend={{ value: convertedTrend, label: "지난달 대비" }}
                href="/admin/crm/customers/leads?filter=converted"
              />
            </div>
            <div className={KPI_TILE_CLASS}>
              {sourceStates.visitor === "ready" && visitorStats ? (
                <StatCard
                  icon={<Eye className="h-4 w-4" />}
                  label="오늘 홈 방문자"
                  value={visitorStats.today.homeVisitors}
                  sub={`7일 ${visitorStats.totals.homeVisitors}명 · PV ${visitorStats.today.homePageViews}`}
                  trend={{ value: homeVisitorTrend, label: "전일 대비" }}
                  sparkline={sparkVisitors.length ? <Sparkline data={sparkVisitors} /> : undefined}
                  href="/admin/traffic"
                />
              ) : sourceStates.visitor === "error" ? (
                <KpiUnavailable label="방문 지표" onRetry={() => retrySource("visitor")} />
              ) : (
                <KpiSkeleton />
              )}
            </div>
            <div className={KPI_TILE_CLASS}>
              {sourceStates.branch === "ready" && branchSummary ? (
                <StatCard
                  icon={<TrendingUp className="h-4 w-4" />}
                  label="매출 페이싱(연)"
                  value={`${Math.round(branchSummary.revenue.pacing_pct)}%`}
                  sub={`확정 ${fmtCny(branchSummary.revenue.confirmed)} / 목표 ${fmtCny(branchSummary.revenue.goal)} · CNY`}
                  sparkline={sparkRevenue.length ? <Sparkline data={sparkRevenue} /> : undefined}
                  // period=Y 없이 착지하면 장부 페이지 기본값(period=Q)이 열려 방금 본 연간
                  // 페이싱%과 다른 숫자가 뜬다 — 이 카드가 소비하는 branchSummary 자체가
                  // ?period=Y 호출 결과다.
                  href="/admin/branch/ledger?period=Y"
                />
              ) : sourceStates.branch === "error" ? (
                <KpiUnavailable label="매출 지표" onRetry={() => retrySource("branch")} />
              ) : (
                <KpiSkeleton />
              )}
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 mb-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section
          className="rounded-2xl border border-[#e8e8e4] bg-white p-4 shadow-[0_1px_0_rgba(17,17,16,0.02)] sm:p-6"
          aria-labelledby="overview-lead-trend-heading"
          aria-busy={sourceStates.leads === "loading"}
        >
          <div className="mb-5 flex items-start justify-between gap-4">
            <div>
              <h2 id="overview-lead-trend-heading" className="text-[14px] font-semibold text-[#111110]">문의 유입 추이</h2>
              <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5">
                최근 {chartRange}일 · 문의 접수 {chartTotal}건
              </p>
            </div>
            <div
              role="group"
              aria-label="문의 유입 추이 기간"
              className="flex rounded-lg border border-[#e8e8e4] bg-[#fafaf8] p-0.5"
            >
              {([7, 30] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  onClick={() => setChartRange(range)}
                  aria-pressed={chartRange === range}
                  className={`min-w-11 rounded-md px-2 py-1 text-[10px] font-medium transition-colors ${
                    chartRange === range
                      ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(17,17,16,0.08)]"
                      : "text-[#1a1a1a]/40 hover:text-[#1a1a1a]/70"
                  }`}
                >
                  {range}일
                </button>
              ))}
            </div>
          </div>
          {sourceStates.leads === "loading" ? (
            <Skeleton className="h-[180px]" />
          ) : sourceStates.leads === "error" ? (
            <div className="h-[180px]">
              <KpiUnavailable label="문의 추이" onRetry={() => retrySource("leads")} />
            </div>
          ) : chartTotal === 0 ? (
            <div className="flex h-[180px] flex-col items-center justify-center rounded-xl border border-dashed border-[#ecece8] bg-[#fafaf8]">
              <p className="text-[13px] font-medium text-[#1a1a1a]/50">최근 {chartRange}일 문의 유입이 없습니다</p>
              <p className="mt-1 text-[11px] text-[#1a1a1a]/35">문의가 들어오면 일별 추이가 표시됩니다.</p>
            </div>
          ) : (
            <LeadTrendChart data={chartData} range={chartRange} />
          )}
        </section>

        <section
          className="rounded-2xl border border-[#e8e8e4] bg-white p-4 shadow-[0_1px_0_rgba(17,17,16,0.02)] sm:p-6"
          aria-labelledby="overview-source-heading"
          aria-busy={sourceStates.leads === "loading"}
        >
          <div className="mb-4">
            <h2 id="overview-source-heading" className="text-[14px] font-semibold text-[#111110]">주요 유입 경로</h2>
            <p className="text-[11px] text-[#1a1a1a]/40 mt-0.5">전체 기간</p>
          </div>
          {sourceStates.leads === "loading" ? (
            <Skeleton className="h-[180px]" />
          ) : sourceStates.leads === "error" ? (
            <div className="h-[180px]">
              <KpiUnavailable label="유입 경로" onRetry={() => retrySource("leads")} />
            </div>
          ) : pieData.length === 0 ? (
            <div className="flex items-center justify-center h-[180px] text-[12px] text-[#1a1a1a]/30">데이터 없음</div>
          ) : (
            <>
              <SourcePie data={pieData} colors={SOURCE_PALETTE} />
              <div className="space-y-1.5 mt-2">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ background: SOURCE_PALETTE[i % SOURCE_PALETTE.length] }} />
                      <span className="text-[12px] text-[#1a1a1a]/60">{d.name}</span>
                    </div>
                    <span className="text-[12px] font-medium text-[#111110]">{d.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      <div className="overflow-hidden rounded-2xl border border-[#e8e8e4] bg-white shadow-[0_1px_0_rgba(17,17,16,0.02)]">
        <div className="flex flex-col gap-3 border-b border-[#e8e8e4] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <h2 className="text-[14px] font-semibold text-[#111110]">세일즈 퍼널 / 최근 유입</h2>
          <Link href="/admin/crm/customers/leads" className="text-[12px] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors flex items-center gap-1">
            전체 보기 <ArrowUpRight className="w-3 h-3" />
          </Link>
        </div>
        {sourceStates.leads === "loading" ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-2">
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="w-32 h-3" />
                  <Skeleton className="w-20 h-2.5" />
                </div>
                <Skeleton className="w-12 h-5 rounded-full" />
              </div>
            ))}
          </div>
        ) : sourceStates.leads === "error" ? (
          <div className="p-4 sm:p-6">
            <KpiUnavailable label="세일즈 퍼널" onRetry={() => retrySource("leads")} />
          </div>
        ) : recentLeads.length === 0 ? (
            <div className="p-4 sm:p-6">
              <EmptyState
                title="아직 리드가 없습니다."
                description="데모 신청이나 문의가 들어오면 여기에서 팀 단위 세일즈 상태를 관리할 수 있습니다."
              action={
                <Link
                  href="/admin/crm"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#111110] px-3 py-2 text-[12px] font-medium text-white"
                >
                  CRM 열기
                  <ChevronRight className="w-3 h-3" />
                </Link>
              }
            />
          </div>
          ) : (
            <>
              <div className="border-b border-[#e8e8e4] bg-[#fafaf8] p-4 sm:px-6">
                <MiniFunnel stages={funnelStages} />
              </div>
              <ul>
                {recentLeads.map((lead) => (
                  <li key={lead.id} className="border-b border-[#e8e8e4] last:border-0">
                    <Link
                      href={`/admin/crm/customers/leads?lead=${lead.id}`}
                      className="group flex flex-col gap-3 px-4 py-3.5 transition-colors hover:bg-[#fafaf8] sm:flex-row sm:items-center sm:gap-4 sm:px-6"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#f0f0ec] flex items-center justify-center text-[12px] font-semibold text-[#1a1a1a]/50 shrink-0">
                          {(lead.name ?? lead.email ?? "?")[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-[#111110] truncate">
                            {lead.name ?? lead.email ?? "이름 없음"}
                            {lead.org && <span className="font-normal text-[#1a1a1a]/40"> · {lead.org}</span>}
                          </p>
                          <p className="text-[11px] text-[#1a1a1a]/40">{SOURCE_LABEL[lead.source] ?? lead.source}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:ml-auto">
                        <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium shrink-0 ${STATUS_COLOR[lead.status]}`}>
                          {STATUS_LABEL[lead.status]}
                        </span>
                        <p className="text-[11px] text-[#1a1a1a]/30 shrink-0 w-14 text-right">
                          {formatDateShort(lead.timestamp)}
                        </p>
                        <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-[#1a1a1a]/25 transition-transform group-hover:translate-x-0.5 sm:block" />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
        )}
      </div>

      {/* (e) 드릴다운 그리드 — 일정 / 콘텐츠 / 캠페인 */}
      <div className="grid grid-cols-1 gap-6 mt-6 xl:grid-cols-3">
        <SectionCard
          title="이번 주 일정"
          action={
            <Link href="/admin/calendar" className="text-[12px] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors flex items-center gap-1">
              캘린더 보기 <ArrowUpRight className="w-3 h-3" />
            </Link>
          }
        >
          {loading ? (
            <SectionSkeleton rows={4} />
          ) : upcomingEvents.length === 0 ? (
            <EmptyState
              title="이번 주 일정이 없습니다."
              description="운영 회의, 캠페인 일정, 마감 일정이 생기면 여기에서 빠르게 확인할 수 있습니다."
              action={
                <Link
                  href="/admin/calendar"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111110] text-white text-[12px] font-medium"
                >
                  일정 추가
                  <ChevronRight className="w-3 h-3" />
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {upcomingEvents.map((event) => (
                <Link
                  key={event.id}
                  href="/admin/calendar"
                  className="group flex items-start gap-3 rounded-xl border border-[#e8e8e4] px-4 py-3 transition-all hover:-translate-y-0.5 hover:bg-[#fafaf8] hover:border-[#c8c8c4] hover:shadow-[0_10px_24px_rgba(17,17,16,0.04)]"
                >
                  <div className="mt-0.5 w-9 h-9 rounded-xl bg-[#f0f0ec] flex items-center justify-center text-[#1a1a1a]/50">
                    <CalendarDays className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-semibold text-[#111110]">{event.title}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#ECFDF5] text-[#084734]">
                        {event.type === "team"
                          ? "팀 일정"
                          : event.type === "meeting"
                            ? "회의"
                            : event.type === "deadline"
                              ? "마감"
                              : event.type === "launch"
                                ? "런칭"
                                : event.type === "holiday"
                                  ? "휴일"
                                  : "기타"}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#1a1a1a]/40 mt-1">
                      {formatDateShort(event.date)}
                      {event.time ? ` · ${event.time}${event.endTime ? ` ~ ${event.endTime}` : ""}` : ""}
                      {event.assignees?.length ? ` · ${event.assignees.join(", ")}` : ""}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[#1a1a1a]/25 group-hover:text-[#111110] shrink-0 mt-1" />
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="문서/콘텐츠 상태"
          action={
            <Link href="/admin/blog" className="text-[12px] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors flex items-center gap-1">
              콘텐츠 열기 <ArrowUpRight className="w-3 h-3" />
            </Link>
          }
        >
          {loading ? (
            <SectionSkeleton rows={4} />
          ) : recentPosts.length === 0 ? (
            <EmptyState
              title="아직 콘텐츠가 없습니다."
              description="블로그 초안을 만들면 여기에서 발행 상태와 최근 수정 내역을 확인할 수 있습니다."
              action={
                <Link
                  href="/admin/blog/new"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111110] text-white text-[12px] font-medium"
                >
                  새 글 작성
                  <ChevronRight className="w-3 h-3" />
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {recentPosts.map((post) => (
                <Link
                  key={post.id}
                  href="/admin/blog"
                  className="group flex items-start gap-3 rounded-xl border border-[#e8e8e4] px-4 py-3 transition-all hover:-translate-y-0.5 hover:bg-[#fafaf8] hover:border-[#c8c8c4] hover:shadow-[0_10px_24px_rgba(17,17,16,0.04)]"
                >
                  <div className="mt-0.5 w-9 h-9 rounded-xl bg-[#f0f0ec] flex items-center justify-center text-[#1a1a1a]/50">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-semibold text-[#111110] truncate">{post.title}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${PUBLISH_STATUS_COLOR[post.status]}`}>
                        {PUBLISH_STATUS_LABEL[post.status]}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#1a1a1a]/40 mt-1">
                      {post.category} · {post.author} · {formatDateTime(post.updatedAt ?? post.publishedAt)}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[#1a1a1a]/25 group-hover:text-[#111110] shrink-0 mt-1" />
                </Link>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="캠페인 상태"
          action={
            <Link href="/admin/campaigns" className="text-[12px] text-[#1a1a1a]/40 hover:text-[#111110] transition-colors flex items-center gap-1">
              캠페인 열기 <ArrowUpRight className="w-3 h-3" />
            </Link>
          }
        >
          {loading ? (
            <SectionSkeleton rows={4} />
          ) : recentCampaigns.length === 0 ? (
            <EmptyState
              title="아직 발송된 캠페인이 없습니다."
              description="구독자에게 보낼 첫 이메일을 작성하면 이 영역에 발송 히스토리가 쌓입니다."
              action={
                <Link
                  href="/admin/campaigns"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#111110] text-white text-[12px] font-medium"
                >
                  캠페인 만들기
                  <ChevronRight className="w-3 h-3" />
                </Link>
              }
            />
          ) : (
            <div className="space-y-3">
              {recentCampaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  href="/admin/campaigns"
                  className="group flex items-start gap-3 rounded-xl border border-[#e8e8e4] px-4 py-3 transition-all hover:-translate-y-0.5 hover:bg-[#fafaf8] hover:border-[#c8c8c4] hover:shadow-[0_10px_24px_rgba(17,17,16,0.04)]"
                >
                  <div className="mt-0.5 w-9 h-9 rounded-xl bg-[#f0f0ec] flex items-center justify-center text-[#1a1a1a]/50">
                    <Send className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-semibold text-[#111110] truncate">{campaign.subject}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${CAMPAIGN_STATUS_COLOR[campaign.status]}`}>
                        {CAMPAIGN_STATUS_LABEL[campaign.status]}
                      </span>
                    </div>
                    <p className="text-[12px] text-[#1a1a1a]/40 mt-1">
                      {campaign.recipientCount}명 · {campaign.targetTags.length > 0 ? campaign.targetTags.join(", ") : "전체"} · {formatDateTime(campaign.sentAt ?? campaign.createdAt)}
                    </p>
                  </div>
                  <ChevronRight className="w-3.5 h-3.5 text-[#1a1a1a]/25 group-hover:text-[#111110] shrink-0 mt-1" />
                </Link>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      {/* 연동 상태 + 채널 지표 */}
      <div className="grid grid-cols-1 gap-6 mt-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <SectionCard
          title="연동 상태"
          action={
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusToneClasses(
                missingConnections.length > 0 ? "warning" : "success"
              )}`}
            >
              {missingConnections.length > 0 ? `미연결 ${missingConnections.length}` : "연결됨"}
            </span>
          }
        >
          {loading ? (
            <SectionSkeleton rows={4} />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {connections.map((connection) => {
                const connected = connection.connected
                return (
                  <Link
                    key={connection.label}
                    href={connection.href}
                    className="group flex items-start gap-3 rounded-xl border border-[#e8e8e4] bg-white px-4 py-3 transition-all hover:-translate-y-0.5 hover:border-[#c8c8c4] hover:shadow-[0_10px_24px_rgba(17,17,16,0.04)]"
                  >
                    <div
                      className={`mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl border ${
                        connected ? "border-green-100 bg-green-50 text-green-700" : "border-amber-100 bg-amber-50 text-amber-700"
                      }`}
                    >
                      <Link2 className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-semibold text-[#111110]">{connection.label}</p>
                        <span
                          className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                            connected ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {connected ? "연결됨" : "설정 필요"}
                        </span>
                      </div>
                      <p className="mt-1 text-[12px] text-[#1a1a1a]/40">{connection.description}</p>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="채널 지표">
          {loading ? (
            <SectionSkeleton rows={3} />
          ) : (
            <div className="grid grid-cols-1 gap-3">
              <StatCard
                icon={<Mail className="h-4 w-4" />}
                label="구독자"
                value={subscriberCount}
                sub="활성 구독자"
                tone="neutral"
                href="/admin/campaigns"
              />
              <StatCard
                icon={<Eye className="h-4 w-4" />}
                label="인스타 조회수"
                value={instagramDashboard ? COMPACT_NUMBER.format(instagramViews) : "연결 필요"}
                sub={
                  instagramDashboard
                    ? `최근 ${instagramMediaCount}개 · 평균 ${COMPACT_NUMBER.format(instagramAverageViews)}`
                    : "콘텐츠 탭에서 확인"
                }
                tone="neutral"
              />
              <StatCard
                icon={<FileText className="h-4 w-4" />}
                label="블로그"
                value={publishedBlogPostCount}
                sub={`전체 ${blogOverview?.totalPosts ?? 0}개 중 발행`}
                tone="neutral"
                href="/admin/blog"
              />
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  )
}
