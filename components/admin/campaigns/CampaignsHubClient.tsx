"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { Mail, RefreshCw } from "lucide-react"
import AdminTabs from "@/components/admin/AdminTabs"
import { PeriodToggle } from "@/components/admin/PeriodToggle"
import { ChartSkeleton } from "@/components/admin/viz"
import type { ChannelEfficiencyRow } from "@/components/admin/campaigns/ChannelEfficiencyChart"
import { buildFunnel } from "@/components/admin/campaigns/EventDetailContent"
import { WeeklyReportDialog } from "@/components/admin/campaigns/perf/WeeklyReportDialog"
import type { EventListSectionProps } from "@/components/admin/campaigns/events/EventListSection"
import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import { eventTokenValues } from "@/lib/events/attribution"
import type { MarketingGlanceInitialData } from "@/lib/marketing/glance-initial-data"
import { CAMPAIGN_TABS, resolveCampaignTab, type CampaignTab } from "@/lib/marketing/hub-tabs"
import { PERF_PERIOD_KEYS, PERF_PERIOD_LABEL, isPerfPeriodKey, type PerfPeriodKey } from "@/lib/marketing/perf"
import { parseMessagePrefill, stripMessagePrefillParams, type MessagePrefill } from "@/lib/message-prefill"
import { useUrlState } from "@/lib/use-url-state"
import type { LeadRecord } from "@/lib/db"
import type { EventCategory, EventStatus, PublicEvent } from "@/lib/types/public-events"
import {
  AD_CHANNEL_COLOR,
  AD_CHANNEL_LABEL,
  AD_CHANNELS,
  computeEconomics,
  DEFAULT_EVENT_METRICS,
  type AdChannel,
  type EventMetrics,
} from "@/lib/types/event-metrics"
import type {
  CampaignAggregate,
  EventLeadStats,
  EventSortKey,
  MetaCampaignDashboard,
  MetaCampaignRow,
  MetaDatePreset,
  Period,
} from "@/components/admin/campaigns/tabs/types"

// 마케팅 허브 클라이언트 본체 — 옛 app/admin/campaigns/page.tsx 의 내용을 2026-09-14 재구성과 함께 옮겼다.
//
// 탭 = 정보 층: 한눈에(summary) → 상세(detail) → 데이터(data) ‖ 메시지(email, 도구).
// 옛 탭 id(leads/events/meta)는 lib/marketing/hub-tabs 가 새 층의 섹션 앵커로 매핑한다.
// 데이터 로더는 탭 id 로 게이트한다: 한눈에는 자체 훅(perf·insights·intake·Compass)만 쓰고,
// 상세·데이터가 코어(행사·리드·지표)와 Meta 를, 데이터만 마케팅 스코프 리드와 채널 예산을 부른다.

// ─── 탭 코드 분할 ─────────────────────────────────────────────────────────────
const EmailTab = dynamic(() => import("@/components/admin/campaigns/tabs/EmailTab"), {
  loading: () => (
    <div className="px-4 pt-6 sm:px-6 lg:px-9">
      <ChartSkeleton className="h-[420px]" />
    </div>
  ),
})
const SummaryTab = dynamic(() => import("@/components/admin/campaigns/tabs/SummaryTab"), {
  loading: () => <ChartSkeleton className="h-[480px]" />,
})
const DetailTab = dynamic(() => import("@/components/admin/campaigns/tabs/DetailTab"), {
  loading: () => <ChartSkeleton className="h-[480px]" />,
})
const DataTab = dynamic(() => import("@/components/admin/campaigns/tabs/DataTab"), {
  loading: () => <ChartSkeleton className="h-[480px]" />,
})

// ─── attribution: 행사 ↔ 리드 ──────────────────────────────────────────────────
//   1) source/notes 필드에 event:<id> 또는 event:<slug> 토큰이 있으면 우선 매칭
//   2) 그 외에는 행사 기간 내 발생한 리드를 보조 집계로 사용
type LeadLookupRow = { haystack: string; timestampMs: number }

// 각 리드를 최대 한 행사에만 귀속시킨다. 기간 창이 겹치는 여러 행사가 같은
// 리드를 각각 세면(구 방식) 집계 리드·CPL·퍼널이 이중계상되므로, 리드 1건은
//   1) 명시 토큰이 있으면 그 행사(attributed)
//   2) 없으면 리드를 포함하는 행사 중 "가장 최근 시작(동률이면 기간이 짧은)" 한 곳(during)
// 에만 배정한다. 반환 맵은 배정 결과의 행사별 집계다.
function assignEventLeads(leads: LeadLookupRow[], events: PublicEvent[]): Map<string, EventLeadStats> {
  const stats = new Map<string, EventLeadStats>()
  const windows = events.map((event) => {
    const startMs = new Date(event.startsAt).getTime()
    // endsAt이 없으면 시작 +1일로 캡한다. Date.now()로 열어두면 과거 단일일 행사가
    // 이후 발생한 무관한 리드를 계속 fallback 집계로 흡수해 매 지표를 부풀린다.
    const endMs = event.endsAt ? new Date(event.endsAt).getTime() : startMs + 24 * 3600 * 1000
    stats.set(event.id, { attributed: 0, during: 0 })
    // 토큰 검색 문자열은 행사당 1회만 만든다.
    const tokens = eventTokenValues(event).map((value) => `event:${value}`)
    return { event, startMs, endMs, tokens }
  })

  for (const lead of leads) {
    const tokenHit = windows.find((w) => w.tokens.some((token) => lead.haystack.includes(token)))
    if (tokenHit) {
      stats.get(tokenHit.event.id)!.attributed += 1
      continue
    }
    let best: (typeof windows)[number] | null = null
    for (const w of windows) {
      if (!(lead.timestampMs >= w.startMs && lead.timestampMs <= w.endMs)) continue
      if (
        best === null ||
        w.startMs > best.startMs ||
        (w.startMs === best.startMs && w.endMs - w.startMs < best.endMs - best.startMs)
      ) {
        best = w
      }
    }
    if (best) stats.get(best.event.id)!.during += 1
  }

  return stats
}

// ─── 행사 기간 필터 ───────────────────────────────────────────────────────────
function eventInPeriod(event: PublicEvent, period: Period): boolean {
  if (period === "all") return true
  if (period === "active") return event.status === "진행 중" || event.status === "예정"
  const days = period === "30d" ? 30 : 90
  const cutoff = Date.now() - days * 24 * 3600 * 1000
  const end = event.endsAt ? new Date(event.endsAt).getTime() : new Date(event.startsAt).getTime()
  return end >= cutoff
}

const PERF_PERIOD_OPTIONS = PERF_PERIOD_KEYS.map((id) => ({ id, label: PERF_PERIOD_LABEL[id] }))

/** 탭 버튼 앞의 층 번호 — 1·2·3 이 정보 층이고, 메시지는 도구라 아이콘이다. */
function TierMark({ tier }: { tier: 1 | 2 | 3 }) {
  return (
    <span aria-hidden className="text-[10px] font-semibold tabular-nums tracking-[0.12em] opacity-60">
      {tier}
    </span>
  )
}

export default function CampaignsHubClient({ initialData }: { initialData: MarketingGlanceInitialData }) {
  const router = useRouter()
  const [tabParam] = useUrlState("tab", "summary")
  const resolvedTab = useMemo(() => resolveCampaignTab(tabParam), [tabParam])
  const activeTab: CampaignTab = resolvedTab.tab

  // 옛 탭 id(?tab=meta 등)로 들어오면 URL 을 새 층 + 섹션 해시로 정정한다 — useUrlState 의 setter 는
  // 해시를 버리므로 직접 replaceState 한다(패치된 replaceState 가 URL 상태 이벤트를 쏜다).
  useEffect(() => {
    if (!resolvedTab.legacy || typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    params.set("tab", resolvedTab.tab)
    const query = params.toString()
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${resolvedTab.anchor ? `#${resolvedTab.anchor}` : ""}`
    )
  }, [resolvedTab])

  const selectTab = useCallback((next: string) => {
    if (typeof window === "undefined") return
    const params = new URLSearchParams(window.location.search)
    if (next === "summary") params.delete("tab")
    else params.set("tab", next)
    const query = params.toString()
    // 탭을 바꾸면 이전 층의 섹션 해시는 의미가 없다 — 해시 없이 교체한다.
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`)
  }, [])

  // 고객 360 딥링크(?message_to=&message_name=) 수신자 프리필 — 마운트 시 1회 소모
  const [messagePrefill, setMessagePrefill] = useState<MessagePrefill | null>(null)
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [metricsMap, setMetricsMap] = useState<Record<string, EventMetrics>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>("all")
  const [editing, setEditing] = useState<PublicEvent | null>(null)
  // perf 기간(?perf=) — 한눈에·상세가 같은 축을 쓴다. 토글은 탭 띠가 그린다.
  const [perfParam, setPerfParam] = useUrlState("perf", "30d")
  const perfPeriod: PerfPeriodKey = isPerfPeriodKey(perfParam) ? perfParam : "30d"
  // 헤더 "동기화" → 각 층의 훅(usePerf 등)이 캐시 우회 재조회하도록 nonce 로 전달한다.
  const [perfRefreshNonce, setPerfRefreshNonce] = useState(0)
  const [perfLoading, setPerfLoading] = useState(false)
  const [viewParam, setViewParam] = useUrlState("view", "list")
  const galleryView = viewParam === "gallery"
  const [eventSearch, setEventSearch] = useState("")
  const [eventStatusFilter, setEventStatusFilter] = useState<EventStatus | "all">("all")
  const [eventCategoryFilter, setEventCategoryFilter] = useState<EventCategory | "all">("all")
  const [viewingEvent, setViewingEvent] = useState<PublicEvent | null>(null)
  const [metaDashboard, setMetaDashboard] = useState<MetaCampaignDashboard | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)
  const [metaError, setMetaError] = useState<string | null>(null)
  const [metaDatePreset, setMetaDatePreset] = useState<MetaDatePreset>("last_30d")
  const [metaUpdatingId, setMetaUpdatingId] = useState<string | null>(null)
  // 마케팅 스코프 리드(데이터 층 전용) — 코어 리드(scope=campaigns)는 귀속 5컬럼뿐이라
  // 트래킹 축·연락처·전환 상태를 못 담는다.
  const [adLeads, setAdLeads] = useState<LeadRecord[]>([])
  const [adLeadsLoading, setAdLeadsLoading] = useState(false)
  const [adLeadsError, setAdLeadsError] = useState<string | null>(null)
  const [channelBudgets, setChannelBudgets] = useState<Record<AdChannel, number>>(
    () => Object.fromEntries(AD_CHANNELS.map((c): [AdChannel, number] => [c, 0])) as Record<AdChannel, number>
  )
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const [eventSort, setEventSort] = useState<EventSortKey>("date")

  const needsCore = activeTab === "detail" || activeTab === "data"

  const load = useCallback(async ({
    force = false,
    leadsScope = "campaigns",
  }: { force?: boolean; leadsScope?: "campaigns" | "marketing" } = {}) => {
    setLoading(true)
    setError(null)
    try {
      const [ev, leadData, metricData] = await Promise.all([
        adminFetchJsonCached<PublicEvent[]>("/api/admin/events", undefined, {
          ttlMs: 60_000,
          force,
          staleIfError: !force,
        }),
        // 코어는 리드를 귀속 해시(source+notes)·기간 창(timestamp) 계산에만 쓴다 —
        // 전체 select 대신 campaigns 스코프로 페이로드를 줄인다. 데이터 층 콜드 진입에서는
        // marketing 스코프(상위집합)를 쓴다 — 같은 URL 을 광고 리드 로더도 동시에 부르므로
        // in-flight 중복 제거로 리드 전량 다운로드가 1회가 된다.
        adminFetchJsonCached<{ leads: LeadRecord[] }>(`/api/admin/leads?scope=${leadsScope}`, undefined, {
          ttlMs: 45_000,
          force,
          staleIfError: !force,
        }),
        adminFetchJsonCached<{ metrics: Record<string, EventMetrics> }>("/api/admin/event-metrics", undefined, {
          ttlMs: 60_000,
          force,
          staleIfError: !force,
        }),
      ])
      setEvents(ev)
      setLeads(leadData.leads)
      setMetricsMap(metricData.metrics)
    } catch (e) {
      setError(e instanceof Error ? e.message : "데이터 로딩 실패")
    } finally {
      setLoading(false)
    }
  }, [])

  // 코어(행사·리드·지표)는 소비하는 층(상세·데이터)에 처음 진입할 때 1회만 조회한다.
  // 한눈에는 perf 단일 엔드포인트만 쓰고, 메시지는 MarketingHub 가 자체 fetch 하므로 둘 다 코어를 건드리지 않는다.
  const coreLoadRequestedRef = useRef(false)
  useEffect(() => {
    // message_to 프리필 딥링크는 첫 렌더가 어느 탭이어도 곧바로 email 탭으로 전환된다(아래 효과).
    // 그 한 사이클에서 코어 fetch가 새어나가지 않도록 URL의 프리필 파라미터도 함께 게이트한다.
    const pendingMessagePrefill = parseMessagePrefill(window.location.search) !== null
    if (!needsCore || pendingMessagePrefill) {
      // 코어를 로드하지 않는 경로에서는 초기 loading=true를 내려 헤더 동기화 버튼이 영구 비활성으로 잠기지 않게 한다.
      if (!coreLoadRequestedRef.current) setLoading(false)
      return
    }
    if (coreLoadRequestedRef.current) return
    coreLoadRequestedRef.current = true
    // 데이터 층 콜드 진입이면 광고 리드 로더와 같은 marketing 스코프로 — 리드 다운로드 1회 공유.
    void load({ leadsScope: activeTab === "data" ? "marketing" : "campaigns" })
  }, [activeTab, needsCore, load])

  // 캠페인 메시지 수신자 프리필 딥링크 소모 (message_to / message_name)
  useEffect(() => {
    const prefill = parseMessagePrefill(window.location.search)
    if (!prefill) return
    setMessagePrefill(prefill)
    selectTab("email")
    const rest = stripMessagePrefillParams(window.location.search)
    router.replace(rest ? `${window.location.pathname}?${rest}` : window.location.pathname, { scroll: false })
  }, [router, selectTab])

  const consumeMessagePrefill = useCallback(() => setMessagePrefill(null), [])

  // 기간 프리셋 연속 변경 가드 — 시퀀스 번호로 "마지막 요청"만 화면에 반영한다.
  const metaRequestSeqRef = useRef(0)
  const loadMeta = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    const seq = ++metaRequestSeqRef.current
    setMetaLoading(true)
    setMetaError(null)
    try {
      const data = await adminFetchJsonCached<MetaCampaignDashboard & { ok: boolean }>(
        `/api/admin/meta/campaigns?datePreset=${metaDatePreset}&limit=50`,
        // force 는 서버 메모(45초)까지 헤더로 우회한다 — 쿼리로 보내면 캐시 키가 갈라진다.
        force ? { headers: { "x-meta-fresh": "1" } } : undefined,
        { ttlMs: 60_000, force, staleIfError: !force }
      )
      if (seq !== metaRequestSeqRef.current) return
      setMetaDashboard(data)
    } catch (e) {
      if (seq !== metaRequestSeqRef.current) return
      setMetaError(e instanceof Error ? e.message : "Meta 캠페인 로딩 실패")
    } finally {
      if (seq === metaRequestSeqRef.current) setMetaLoading(false)
    }
  }, [metaDatePreset])

  const refreshMeta = useCallback(() => {
    void loadMeta({ force: true })
  }, [loadMeta])

  useEffect(() => {
    // Meta 라이브 대시보드는 상세(차트)·데이터(표) 층 전용 — 한눈에는 perf 스냅샷 축만 쓴다.
    if (needsCore) loadMeta()
  }, [needsCore, loadMeta])

  const loadAdLeads = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    setAdLeadsLoading(true)
    setAdLeadsError(null)
    try {
      const data = await adminFetchJsonCached<{ leads: LeadRecord[] }>("/api/admin/leads?scope=marketing", undefined, {
        ttlMs: 45_000,
        force,
        staleIfError: !force,
      })
      setAdLeads(data.leads)
    } catch (e) {
      setAdLeadsError(e instanceof Error ? e.message : "광고 리드를 불러오지 못했습니다.")
    } finally {
      setAdLeadsLoading(false)
    }
  }, [])

  // 전환 결과를 목록에 즉시 반영한다 — 전량 재조회 없이 상태만 갈아끼워 선택·스크롤을 보존한다.
  const updateAdLeads = useCallback((updater: (prev: LeadRecord[]) => LeadRecord[]) => {
    setAdLeads(updater)
  }, [])

  // 신규 리드 큐의 "연락함" 체크(낙관적 갱신·롤백 포함) — 해당 1건만 교체한다.
  const updateAdLead = useCallback((lead: LeadRecord) => {
    setAdLeads((prev) => prev.map((row) => (row.id === lead.id ? lead : row)))
  }, [])

  const refreshAdLeads = useCallback(() => {
    // 가져오기·전환은 리드 자체를 바꾼다 — 코어를 이미 로드했다면 함께 강제 갱신한다(퍼널·평균 CPL 정합).
    void Promise.all([
      loadAdLeads({ force: true }),
      coreLoadRequestedRef.current ? load({ force: true }) : Promise.resolve(),
    ])
  }, [load, loadAdLeads])

  // 데이터 층 첫 진입에만 조회한다 — 탭을 오갈 때마다 다시 부르면 목록이 깜빡이고,
  // 전환·연락 체크로 갱신해 둔 로컬 상태도 매번 되감긴다.
  const adLeadsRequestedRef = useRef(false)
  useEffect(() => {
    if (activeTab !== "data" || adLeadsRequestedRef.current) return
    adLeadsRequestedRef.current = true
    void loadAdLeads()
  }, [activeTab, loadAdLeads])

  // 채널 예산(배정)은 데이터 층에서만 필요 — 지연 로드.
  const loadChannelBudgets = useCallback(async () => {
    try {
      const data = await adminFetchJson<{ budgets: Record<AdChannel, number> }>("/api/admin/channel-budgets")
      setChannelBudgets(data.budgets)
      setBudgetError(null)
    } catch {
      // 조용히 0을 확정값처럼 두면 "배정 0원"과 "조회 실패"가 구분되지 않는다 — 표 옆에 표면화한다.
      setBudgetError("채널 예산을 불러오지 못했습니다 — 표시된 배정액(0원 포함)은 확정값이 아닙니다.")
    }
  }, [])

  useEffect(() => {
    if (activeTab === "data") void loadChannelBudgets()
  }, [activeTab, loadChannelBudgets])

  // 채널별 저장 순번 — 그 채널의 마지막 요청 결과만 상태에 반영한다.
  const channelBudgetSeqRef = useRef<Partial<Record<AdChannel, number>>>({})

  const handleChannelBudgetChange = useCallback(async (channel: AdChannel, amount: number) => {
    const seq = (channelBudgetSeqRef.current[channel] ?? 0) + 1
    channelBudgetSeqRef.current[channel] = seq
    try {
      const data = await adminFetchJson<{ budgets: Record<AdChannel, number> }>("/api/admin/channel-budgets", {
        method: "PATCH",
        body: JSON.stringify({ channel, amount }),
      })
      if (channelBudgetSeqRef.current[channel] !== seq) return
      setChannelBudgets(data.budgets)
      setBudgetError(null)
    } catch (e) {
      if (channelBudgetSeqRef.current[channel] !== seq) return
      // 에러는 사용자가 방금 만진 표(채널 예산) 옆에 떠야 한다. 실패한 입력값이 저장된 것처럼
      // 남지 않게 서버 정본을 다시 받아 입력칸을 되돌린다.
      const message = e instanceof Error ? e.message : "채널 예산 저장 실패"
      setBudgetError(`${message} — 입력값은 저장 전 상태로 되돌렸습니다.`)
      void loadChannelBudgets()
      // 표가 만진 행에 인라인 에러를 붙일 수 있게 실패를 그대로 올려보낸다.
      throw e instanceof Error ? e : new Error(message)
    }
  }, [loadChannelBudgets])

  const toggleMetaCampaignStatus = useCallback(
    async (campaign: MetaCampaignRow) => {
      const nextStatus = campaign.status === "ACTIVE" ? "PAUSED" : "ACTIVE"
      const actionLabel = nextStatus === "ACTIVE" ? "재개" : "중지"
      const confirmed = window.confirm(
        `${campaign.name} 캠페인을 ${actionLabel}할까요?\n\n이 작업은 Meta 광고 관리자에 바로 반영됩니다.`
      )
      if (!confirmed) return

      setMetaUpdatingId(campaign.id)
      setMetaError(null)
      try {
        await adminFetchJson(`/api/admin/meta/campaigns/${campaign.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: nextStatus }),
        })
        // 상태 변경 직후에는 캐시(예열 포함)가 낡았으므로 반드시 우회해 재조회한다.
        await loadMeta({ force: true })
      } catch (e) {
        setMetaError(e instanceof Error ? e.message : "Meta 캠페인 상태 변경 실패")
      } finally {
        setMetaUpdatingId(null)
      }
    },
    [loadMeta]
  )

  const filtered = useMemo(() => events.filter((ev) => eventInPeriod(ev, period)), [events, period])

  const leadLookupRows = useMemo<LeadLookupRow[]>(
    () =>
      leads.map((lead) => ({
        haystack: `${lead.source ?? ""} ${lead.notes ?? ""}`.toLowerCase(),
        timestampMs: new Date(lead.timestamp).getTime(),
      })),
    [leads]
  )

  // 배정은 기간 필터와 무관하게 "전체 행사"를 후보로 계산한다 — 필터로 후보를 줄이면
  // 제외된 행사가 흡수하던 fallback 리드가 남은 행사로 재배정돼 수치가 기간 토글에 따라 달라진다.
  const eventLeadStats = useMemo(() => assignEventLeads(leadLookupRows, events), [events, leadLookupRows])

  // 집계 (전체 KPI) — 데이터 층 채널 예산 대조가 읽는다.
  const aggregate = useMemo<CampaignAggregate>(() => {
    let totalSpend = 0
    let totalRevenue = 0
    let totalLeads = 0
    let totalDeals = 0
    let totalAttendees = 0
    // ROI 분모는 "매출을 입력한" 행사의 광고비만 합산한다.
    let roiSpend = 0
    let roiRevenue = 0
    const channelTotals = Object.fromEntries(AD_CHANNELS.map((c): [AdChannel, number] => [c, 0])) as Record<AdChannel, number>
    for (const ev of filtered) {
      const metrics = metricsMap[ev.id] ?? { ...DEFAULT_EVENT_METRICS, eventId: ev.id, updatedAt: "" }
      const leadStats = eventLeadStats.get(ev.id) ?? { attributed: 0, during: 0 }
      const funnel = buildFunnel(ev, metrics, leadStats.attributed, leadStats.during)
      const econ = computeEconomics(funnel, metrics)
      totalSpend += econ.adSpendTotal
      totalRevenue += econ.revenue
      totalLeads += funnel.leads
      totalDeals += funnel.deals
      totalAttendees += funnel.attendees
      if (metrics.dealsRevenue != null && econ.adSpendTotal > 0) {
        roiSpend += econ.adSpendTotal
        roiRevenue += econ.revenue
      }
      for (const e of metrics.adSpendEntries) channelTotals[e.channel] += e.amount
    }
    const avgCpl = totalLeads > 0 ? Math.round(totalSpend / totalLeads) : null
    const overallRoi = roiSpend > 0 ? Math.round(((roiRevenue - roiSpend) / roiSpend) * 100) : null
    const dealConversionRate = totalLeads > 0 ? Math.round((totalDeals / totalLeads) * 100) : null
    const attendanceToDealRate = totalAttendees > 0 ? Math.round((totalDeals / totalAttendees) * 100) : null
    return {
      totalSpend,
      totalRevenue,
      totalLeads,
      totalDeals,
      totalAttendees,
      avgCpl,
      overallRoi,
      dealConversionRate,
      attendanceToDealRate,
      channelTotals,
    }
  }, [eventLeadStats, filtered, metricsMap])

  // 행사별 funnel+economics 단일 소스 — 아래 모든 파생값이 여기서 읽어 일관성 유지
  const perEventEcon = useMemo(() => {
    return filtered.map((ev) => {
      const metrics: EventMetrics = metricsMap[ev.id] ?? { ...DEFAULT_EVENT_METRICS, eventId: ev.id, updatedAt: "" }
      const leadStats = eventLeadStats.get(ev.id) ?? { attributed: 0, during: 0 }
      const funnel = buildFunnel(ev, metrics, leadStats.attributed, leadStats.during)
      const econ = computeEconomics(funnel, metrics)
      return { event: ev, metrics, funnel, econ }
    })
  }, [filtered, metricsMap, eventLeadStats])

  // 채널별 효율 — 광고비는 채널 합산, 리드는 행사 내 광고비 비중으로 안분(추정)
  const channelEfficiencyData = useMemo<ChannelEfficiencyRow[]>(() => {
    const spendByChannel = Object.fromEntries(AD_CHANNELS.map((c): [AdChannel, number] => [c, 0])) as Record<AdChannel, number>
    const leadsByChannel = Object.fromEntries(AD_CHANNELS.map((c): [AdChannel, number] => [c, 0])) as Record<AdChannel, number>
    for (const { metrics, funnel } of perEventEcon) {
      const entries = metrics.adSpendEntries
      const eventSpend = entries.reduce((sum, e) => sum + e.amount, 0)
      for (const e of entries) spendByChannel[e.channel] += e.amount
      if (eventSpend > 0 && funnel.leads > 0) {
        for (const e of entries) {
          leadsByChannel[e.channel] += funnel.leads * (e.amount / eventSpend)
        }
      }
    }
    return (Object.keys(AD_CHANNEL_LABEL) as AdChannel[])
      .filter((channel) => spendByChannel[channel] > 0)
      .map((channel) => {
        const spend = spendByChannel[channel]
        const leadsCount = leadsByChannel[channel]
        const cpl = leadsCount > 0 ? Math.round(spend / leadsCount) : null
        return {
          channel,
          label: AD_CHANNEL_LABEL[channel],
          color: AD_CHANNEL_COLOR[channel],
          spend,
          leads: Math.round(leadsCount),
          cpl,
        }
      })
  }, [perEventEcon])

  // 성과 입력에서 저장한 값을 허브 소유 metricsMap에 반영 (상세·데이터 파생값도 함께 갱신)
  const handleMetricsSaved = useCallback((saved: EventMetrics) => {
    setMetricsMap((m) => ({ ...m, [saved.eventId]: saved }))
  }, [])

  const refreshLoading =
    activeTab === "summary"
      ? perfLoading
      : activeTab === "detail"
        ? perfLoading || metaLoading || loading
        : activeTab === "data"
          ? adLeadsLoading || metaLoading || loading
          : false
  const refreshCurrent = useCallback(() => {
    if (activeTab === "summary") {
      setPerfRefreshNonce((nonce) => nonce + 1)
      return
    }
    if (activeTab === "detail") {
      setPerfRefreshNonce((nonce) => nonce + 1)
      void Promise.all([loadMeta({ force: true }), load({ force: true })])
      return
    }
    if (activeTab === "data") {
      setPerfRefreshNonce((nonce) => nonce + 1)
      void Promise.all([loadMeta({ force: true }), loadAdLeads({ force: true }), load({ force: true })])
    }
  }, [activeTab, load, loadAdLeads, loadMeta])

  const showPerfToggle = activeTab === "summary" || activeTab === "detail"

  const eventListProps: EventListSectionProps = {
    loading,
    filtered,
    metricsMap,
    eventLeadStats,
    perEventEcon,
    galleryView,
    setViewParam,
    eventSearch,
    setEventSearch,
    eventStatusFilter,
    setEventStatusFilter,
    eventCategoryFilter,
    setEventCategoryFilter,
    eventSort,
    setEventSort,
    period,
    setPeriod,
    viewingEvent,
    setViewingEvent,
    editing,
    setEditing,
    onMetricsSaved: handleMetricsSaved,
  }

  return (
    <div className="pb-24">
      {/* TopBar — branch admin과 동일한 패턴. h1 은 사이드바 라벨과 같은 "마케팅"(2026-09-14). */}
      <header className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 pb-5 pt-6 sm:px-6 lg:px-9 lg:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#111110] sm:text-[30px]">마케팅</h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={refreshCurrent}
              disabled={refreshLoading || activeTab === "email"}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshLoading ? "animate-spin" : ""}`} />
              동기화
            </button>
            <WeeklyReportDialog />
          </div>
        </div>
      </header>

      {/* 탭 띠 — 정보 층 셋 + 메시지(도구). 기간 토글은 한눈에·상세에서만 보이고 같은 ?perf= 축을 쓴다. */}
      <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 sm:px-4 lg:px-9">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <AdminTabs
            className="-mb-px min-w-0 py-2"
            label="마케팅 보기"
            variant="subtle"
            items={CAMPAIGN_TABS.map((tab) => ({
              value: tab.id,
              label: tab.label,
              title: tab.title,
              icon: tab.tier ? <TierMark tier={tab.tier} /> : <Mail className="h-3.5 w-3.5" />,
            }))}
            value={activeTab}
            onValueChange={selectTab}
            panelId="campaigns-tabpanel"
          />
          {showPerfToggle && (
            <PeriodToggle
              options={PERF_PERIOD_OPTIONS}
              value={perfPeriod}
              onChange={setPerfParam}
              ariaLabel="퍼포먼스 집계 기간"
              className="max-sm:mb-2"
            />
          )}
        </div>
      </div>

      {/* Tab content — 단일 tabpanel 컨테이너. AdminTabs의 aria-controls가 이 컨테이너를 가리킨다. */}
      <div
        id="campaigns-tabpanel"
        role="tabpanel"
        aria-label={`${CAMPAIGN_TABS.find((tab) => tab.id === activeTab)?.label ?? activeTab} 탭`}
      >
        {activeTab === "email" ? (
          <EmailTab recipientPrefill={messagePrefill} onRecipientPrefillConsumed={consumeMessagePrefill} />
        ) : (
          <div className="px-4 pt-6 sm:px-6 lg:px-9">
            {activeTab === "summary" && (
              <SummaryTab
                period={perfPeriod}
                refreshNonce={perfRefreshNonce}
                onLoadingChange={setPerfLoading}
                initialData={initialData}
              />
            )}

            {activeTab === "detail" && (
              <DetailTab
                period={perfPeriod}
                refreshNonce={perfRefreshNonce}
                metaDashboard={metaDashboard}
                metaLoading={metaLoading}
                metaError={metaError}
                metaDatePreset={metaDatePreset}
                onMetaDatePresetChange={setMetaDatePreset}
                coreLoading={loading}
                coreError={error}
                filtered={filtered}
                perEventEcon={perEventEcon}
                eventPeriod={period}
                setEventPeriod={setPeriod}
              />
            )}

            {activeTab === "data" && (
              <DataTab
                period={perfPeriod}
                refreshNonce={perfRefreshNonce}
                adLeads={adLeads}
                adLeadsLoading={adLeadsLoading}
                adLeadsError={adLeadsError}
                onRefreshAdLeads={refreshAdLeads}
                onAdLeadsUpdate={updateAdLeads}
                onAdLeadUpdated={updateAdLead}
                metaDashboard={metaDashboard}
                metaLoading={metaLoading}
                metaError={metaError}
                metaDatePreset={metaDatePreset}
                onMetaDatePresetChange={setMetaDatePreset}
                onRefreshMeta={refreshMeta}
                metaUpdatingId={metaUpdatingId}
                onToggleMetaStatus={toggleMetaCampaignStatus}
                coreLoading={loading}
                coreError={error}
                channelEfficiencyData={channelEfficiencyData}
                channelBudgets={channelBudgets}
                onBudgetChange={handleChannelBudgetChange}
                budgetError={budgetError}
                aggregate={aggregate}
                onMetricsSaved={handleMetricsSaved}
                setEditing={setEditing}
                eventList={eventListProps}
              />
            )}
          </div>
        )}
      </div>
    </div>
  )
}
