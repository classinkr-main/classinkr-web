"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import dynamic from "next/dynamic"
import { useRouter } from "next/navigation"
import { Activity, Mail, Plus, RefreshCw } from "lucide-react"
import AdminTabs from "@/components/admin/AdminTabs"
import { MarketingCrossLinks } from "@/components/admin/MarketingCrossLinks"
import { ChartSkeleton } from "@/components/admin/viz"
import type { ChannelEfficiencyRow } from "@/components/admin/campaigns/ChannelEfficiencyChart"
import { adminFetchJson, adminFetchJsonCached } from "@/lib/admin-client"
import { eventTokenValues } from "@/lib/events/attribution"
import { buildFunnel } from "@/components/admin/campaigns/EventDetailContent"
import { useUrlState } from "@/lib/use-url-state"
import {
  parseMessagePrefill,
  stripMessagePrefillParams,
  type MessagePrefill,
} from "@/lib/message-prefill"
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
  CampaignTab,
  EventLeadStats,
  MarketingStatsData,
  MetaCampaignDashboard,
  MetaCampaignRow,
  MetaDatePreset,
  Period,
} from "@/components/admin/campaigns/tabs/types"

// ─── helpers ──────────────────────────────────────────────────────────────────


// ChartSkeleton은 components/admin/viz(primitives)의 SSOT를 그대로 위임한다(로컬 재구현 금지).

// ─── 탭 코드 분할 ─────────────────────────────────────────────────────────────
// summary/events/meta/email 네 탭 패널을 components/admin/campaigns/tabs/로 분리하고
// next/dynamic으로 활성 탭 청크만 로드한다(비활성 탭 코드는 번들에서 제외).
// email/meta는 자체 px 래퍼를 포함하므로 로딩 스켈레톤에도 같은 래퍼를 입혀 레이아웃 점프를 막는다.
const EmailTab = dynamic(() => import("@/components/admin/campaigns/tabs/EmailTab"), {
  loading: () => (
    <div className="px-4 pt-6 sm:px-6 lg:px-9">
      <ChartSkeleton className="h-[420px]" />
    </div>
  ),
})

const MetaTab = dynamic(() => import("@/components/admin/campaigns/tabs/MetaTab"), {
  loading: () => (
    <div className="px-4 pt-6 sm:px-6 lg:px-9">
      <ChartSkeleton className="h-[480px]" />
    </div>
  ),
})

// summary/events는 페이지의 공용 래퍼(px-4 …) 안에서 렌더되므로 스켈레톤에 래퍼를 중복하지 않는다.
const EventsTab = dynamic(() => import("@/components/admin/campaigns/tabs/EventsTab"), {
  loading: () => <ChartSkeleton className="h-[480px]" />,
})

const SummaryTab = dynamic(() => import("@/components/admin/campaigns/tabs/SummaryTab"), {
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
function assignEventLeads(
  leads: LeadLookupRow[],
  events: PublicEvent[]
): Map<string, EventLeadStats> {
  const stats = new Map<string, EventLeadStats>()
  const windows = events.map((event) => {
    const startMs = new Date(event.startsAt).getTime()
    // endsAt이 없으면 시작 +1일로 캡한다. Date.now()로 열어두면 과거 단일일 행사가
    // 이후 발생한 무관한 리드를 계속 fallback 집계로 흡수해 매 지표를 부풀린다.
    const endMs = event.endsAt ? new Date(event.endsAt).getTime() : startMs + 24 * 3600 * 1000
    stats.set(event.id, { attributed: 0, during: 0 })
    // 토큰 검색 문자열은 행사당 1회만 만든다 — 리드×행사 쌍마다 배열을 재생성하면
    // (수천 리드 × 수십 행사) 기간 토글마다 수십만 회 할당이 돈다.
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
      // 양수 포함 검사 — start/end가 NaN(잘못된 날짜)이면 비교가 false가 되어 자동 제외된다.
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

// ─── sub-tabs ─────────────────────────────────────────────────────────────────

const CAMPAIGN_TABS: Array<{ id: CampaignTab; label: string; sub: string }> = [
  { id: "summary", label: "요약", sub: "성과 · 전환 · 채널 분포" },
  { id: "events", label: "행사", sub: "행사별 퍼널 · 딜 전환" },
  // id는 딥링크(?tab=meta) 호환을 위해 "meta" 유지 — 라벨은 "광고"로 확장하되 sub에서 Meta만 라이브임을 정직하게 표기.
  { id: "meta", label: "광고", sub: "Meta 라이브 · 캠페인·채널 예산·성과" },
  // id는 기존 딥링크(?tab=email) 호환을 위해 "email" 유지 — 내용은 이메일·문자·카카오 발송 허브.
  { id: "email", label: "메시지", sub: "구독자 · 발송(이메일 라이브 · 문자·카카오 준비 중) · 이력" },
]

// ─── period filter ────────────────────────────────────────────────────────────

function eventInPeriod(event: PublicEvent, period: Period): boolean {
  if (period === "all") return true
  if (period === "active") return event.status === "진행 중" || event.status === "예정"
  const days = period === "30d" ? 30 : 90
  const cutoff = Date.now() - days * 24 * 3600 * 1000
  const end = event.endsAt ? new Date(event.endsAt).getTime() : new Date(event.startsAt).getTime()
  return end >= cutoff
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function AdminCampaignsPage() {
  const router = useRouter()
  // 기본 탭은 광고(meta) — 탭 재구성 스펙 §4.2 "메타 광고를 기본 탭으로" 이행(2026-08-18).
  // 딥링크(?tab=summary 등)는 그대로 동작하고, 기본값과 같은 meta만 URL에서 생략된다.
  const [tabParam, setTabParam] = useUrlState("tab", "meta")
  // 고객 360 딥링크(?message_to=&message_name=) 수신자 프리필 — 마운트 시 1회 소모
  const [messagePrefill, setMessagePrefill] = useState<MessagePrefill | null>(null)
  const [events, setEvents] = useState<PublicEvent[]>([])
  const [leads, setLeads] = useState<LeadRecord[]>([])
  const [metricsMap, setMetricsMap] = useState<Record<string, EventMetrics>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [period, setPeriod] = useState<Period>("all")
  const [editing, setEditing] = useState<PublicEvent | null>(null)
  // 요약 탭 "성과 입력 열기" → 광고 탭 성과 입력 표 착지 요청. 증가하는 nonce로 전달한다 —
  // sessionStorage 플래그는 광고 탭 전환이 유발하는 코어 재조회(coreLoading 사이클)와
  // strict 이중 마운트에서 소비 시점이 어긋나 스크롤이 유실됐다(2026-08-18 실측).
  const [metricsFocusNonce, setMetricsFocusNonce] = useState(0)
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
  const [emailStats, setEmailStats] = useState<MarketingStatsData | null>(null)
  const [emailStatsError, setEmailStatsError] = useState<string | null>(null)
  // 광고 리드 섹션(광고 탭) 전용 데이터. 코어 리드(scope=campaigns)는 귀속 5컬럼뿐이라
  // 트래킹 축·연락처·전환 상태를 못 담는다 — 광고 탭에 들어올 때만 별도 스코프로 지연 조회한다.
  const [adLeads, setAdLeads] = useState<LeadRecord[]>([])
  const [adLeadsLoading, setAdLeadsLoading] = useState(false)
  const [adLeadsError, setAdLeadsError] = useState<string | null>(null)
  const [channelBudgets, setChannelBudgets] = useState<Record<AdChannel, number>>(
    () => Object.fromEntries(AD_CHANNELS.map((c): [AdChannel, number] => [c, 0])) as Record<AdChannel, number>
  )
  const [budgetError, setBudgetError] = useState<string | null>(null)
  const [eventSort, setEventSort] = useState<"date" | "leads" | "deals" | "roi">("date")
  const activeTab: CampaignTab = CAMPAIGN_TABS.some((tab) => tab.id === tabParam)
    ? (tabParam as CampaignTab)
    : "meta"

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
        // 캠페인은 리드를 귀속 해시(source+notes)·기간 창(timestamp) 계산에만 쓴다 —
        // 전체 select 대신 campaigns 스코프(id·source·status·notes·created_at)로 페이로드를 줄인다.
        // 광고 탭 콜드 진입에서는 marketing 스코프(campaigns의 상위집합)를 쓴다 — 같은 URL 을
        // 광고 리드 로더도 동시에 부르므로 in-flight 중복 제거로 리드 전량 다운로드가 1회가 된다.
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

  // 코어(행사·리드·지표)는 소비하는 탭에 처음 진입할 때 1회만 조회한다(탭 무관 마운트 즉시 호출 제거).
  // summary/events가 직접 소비하고, meta도 채널 예산·집행 대조(aggregate·channelEfficiencyData)가
  // 코어 파생값이라 필요하다. email(메시지 허브)은 MarketingHub가 자체 fetch하므로 코어를 건드리지 않는다.
  // ref 1회 게이트: 기존 "마운트 시 1회 로드" 의미를 유지해 탭 전환마다 재조회·스켈레톤 깜빡임을 만들지 않는다.
  const coreLoadRequestedRef = useRef(false)
  useEffect(() => {
    // message_to 프리필 딥링크는 첫 렌더가 summary여도 곧바로 email 탭으로 전환된다(아래 효과).
    // 그 한 사이클에서 코어 fetch가 새어나가지 않도록 URL의 프리필 파라미터도 함께 게이트한다.
    const pendingMessagePrefill = parseMessagePrefill(window.location.search) !== null
    if (activeTab === "email" || pendingMessagePrefill) {
      // 코어를 로드하지 않는 경로에서는 초기 loading=true를 내려
      // 헤더 동기화 버튼이 영구 비활성으로 잠기지 않게 한다.
      if (!coreLoadRequestedRef.current) setLoading(false)
      return
    }
    if (coreLoadRequestedRef.current) return
    coreLoadRequestedRef.current = true
    // 광고 탭 콜드 진입이면 광고 리드 로더와 같은 marketing 스코프로 — 리드 다운로드 1회 공유.
    void load({ leadsScope: activeTab === "meta" ? "marketing" : "campaigns" })
  }, [activeTab, load])

  // 캠페인 메시지 수신자 프리필 딥링크 소모 (message_to / message_name)
  // - 파라미터를 state로 캡처하고 메시지 탭을 활성화한 뒤,
  // - router.replace로 URL에서 제거해(one-shot) 새로고침 시 재적용을 막는다.
  //   탭 활성화는 이 페이지의 탭 상태 메커니즘(useUrlState → history.replaceState)을 그대로 쓰고,
  //   파라미터 제거는 라우터를 통해 수행한다(raw history API로 지우면 useSearchParams 구독과 어긋난다).
  useEffect(() => {
    const prefill = parseMessagePrefill(window.location.search)
    if (!prefill) return
    setMessagePrefill(prefill)
    setTabParam("email") // "메시지" 탭 (id는 딥링크 호환상 email 유지)
    // setTabParam이 동기적으로 URL에 tab=email을 반영한 뒤의 search에서 message_*만 벗겨낸다.
    const rest = stripMessagePrefillParams(window.location.search)
    router.replace(rest ? `${window.location.pathname}?${rest}` : window.location.pathname, {
      scroll: false,
    })
  }, [router, setTabParam])

  const consumeMessagePrefill = useCallback(() => setMessagePrefill(null), [])

  // 기간 프리셋 연속 변경 가드 — 프리셋마다 URL 이 달라 in-flight 중복 제거가 안 걸리므로,
  // 시퀀스 번호로 "마지막 요청"만 화면에 반영한다(90일→7일 연타 시 늦게 온 90일 응답이 덮는 것 방지).
  const metaRequestSeqRef = useRef(0)
  const loadMeta = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    const seq = ++metaRequestSeqRef.current
    setMetaLoading(true)
    setMetaError(null)
    try {
      // AdminSidebar가 /admin/campaigns hover-warm 시 동일 URL(datePreset=last_30d&limit=50)을
      // ttl 60s로 예열한다 — 캐시 키를 일치시켜 첫 진입 조회가 예열을 그대로 재사용하게 한다.
      // 명시 동기화·상태 변경 직후 재조회만 force로 네트워크를 강제한다.
      const data = await adminFetchJsonCached<MetaCampaignDashboard & { ok: boolean }>(
        `/api/admin/meta/campaigns?datePreset=${metaDatePreset}&limit=50`,
        // force 는 서버 메모(45초)까지 헤더로 우회한다 — 쿼리로 보내면 캐시 키가 갈라진다.
        force ? { headers: { "x-meta-fresh": "1" } } : undefined,
        { ttlMs: 60_000, force, staleIfError: !force }
      )
      if (seq !== metaRequestSeqRef.current) return // 더 최신 요청이 이미 나갔다 — 낡은 응답 폐기
      setMetaDashboard(data)
    } catch (e) {
      if (seq !== metaRequestSeqRef.current) return
      setMetaError(e instanceof Error ? e.message : "Meta 캠페인 로딩 실패")
    } finally {
      if (seq === metaRequestSeqRef.current) setMetaLoading(false)
    }
  }, [metaDatePreset])

  // 명시 "동기화" 버튼 전용 — 캐시를 우회해 항상 새로 받는다.
  const refreshMeta = useCallback(() => {
    void loadMeta({ force: true })
  }, [loadMeta])

  const loadEmailStats = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    try {
      const data = await adminFetchJsonCached<MarketingStatsData>("/api/admin/marketing/stats", undefined, {
        ttlMs: 60_000,
        staleIfError: true,
        force,
      })
      setEmailStats(data)
      setEmailStatsError(null)
    } catch {
      // 보조 지표라 화면은 강등해서 계속 쓰되, 무음 대신 실패를 표시한다(재시도 가능).
      setEmailStatsError("이메일·구독자 지표를 불러오지 못했습니다.")
    }
  }, [])

  useEffect(() => {
    if (activeTab === "summary" || activeTab === "meta") {
      loadMeta()
    }
  }, [activeTab, loadMeta])

  useEffect(() => {
    // 이메일 탭은 MarketingHub가 자체 데이터를 불러온다. 요약 탭 채널 카드용만 여기서 조회.
    if (activeTab === "summary") {
      void loadEmailStats()
    }
  }, [activeTab, loadEmailStats])

  const loadAdLeads = useCallback(async ({ force = false }: { force?: boolean } = {}) => {
    setAdLeadsLoading(true)
    setAdLeadsError(null)
    try {
      const data = await adminFetchJsonCached<{ leads: LeadRecord[] }>(
        "/api/admin/leads?scope=marketing",
        undefined,
        { ttlMs: 45_000, force, staleIfError: !force }
      )
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

  const refreshAdLeads = useCallback(() => {
    // 가져오기·전환은 리드 자체를 바꾼다 — 광고 리드 목록만 새로 받으면 요약 탭의
    // 퍼널·평균 CPL(코어 리드 파생)이 낡은 채 남으므로, 코어를 이미 로드했다면 함께 강제 갱신한다.
    void Promise.all([
      loadAdLeads({ force: true }),
      coreLoadRequestedRef.current ? load({ force: true }) : Promise.resolve(),
    ])
  }, [load, loadAdLeads])

  // 광고 탭 첫 진입에만 조회한다 — 탭을 오갈 때마다 다시 부르면 목록이 깜빡이고,
  // 전환으로 갱신해 둔 로컬 상태(status=converted)도 매번 되감긴다.
  const adLeadsRequestedRef = useRef(false)
  useEffect(() => {
    if (activeTab !== "meta" || adLeadsRequestedRef.current) return
    adLeadsRequestedRef.current = true
    void loadAdLeads()
  }, [activeTab, loadAdLeads])

  // 채널 예산(배정)은 광고 탭에서만 필요 — 지연 로드.
  const loadChannelBudgets = useCallback(async () => {
    try {
      const data = await adminFetchJson<{ budgets: Record<AdChannel, number> }>(
        "/api/admin/channel-budgets"
      )
      setChannelBudgets(data.budgets)
      setBudgetError(null)
    } catch {
      // 조용히 0을 확정값처럼 두면 "배정 0원"과 "조회 실패"가 구분되지 않는다 — 저장 실패와
      // 같은 슬롯(예산표 옆 budgetError)에 표면화한다(2026-08-18, 실패≠빈상태).
      setBudgetError("채널 예산을 불러오지 못했습니다 — 표시된 배정액(0원 포함)은 확정값이 아닙니다.")
    }
  }, [])

  useEffect(() => {
    if (activeTab === "meta") void loadChannelBudgets()
  }, [activeTab, loadChannelBudgets])

  const handleChannelBudgetChange = useCallback(async (channel: AdChannel, amount: number) => {
    try {
      const data = await adminFetchJson<{ budgets: Record<AdChannel, number> }>(
        "/api/admin/channel-budgets",
        { method: "PATCH", body: JSON.stringify({ channel, amount }) }
      )
      setChannelBudgets(data.budgets)
      setBudgetError(null)
    } catch (e) {
      // 에러는 사용자가 방금 만진 표(채널 예산) 옆에 떠야 한다 — Meta 대시보드 에러 슬롯에
      // 실으면 연동 장애로 오독되고 다음 loadMeta 가 지워버린다. 실패한 입력값이 저장된
      // 것처럼 남지 않게 서버 정본을 다시 받아 입력칸을 되돌린다.
      const message = e instanceof Error ? e.message : "채널 예산 저장 실패"
      setBudgetError(`${message} — 입력값은 저장 전 상태로 되돌렸습니다.`)
      void loadChannelBudgets()
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

  const filtered = useMemo(
    () => events.filter((ev) => eventInPeriod(ev, period)),
    [events, period]
  )

  const leadLookupRows = useMemo<LeadLookupRow[]>(
    () =>
      leads.map((lead) => ({
        haystack: `${lead.source ?? ""} ${lead.notes ?? ""}`.toLowerCase(),
        timestampMs: new Date(lead.timestamp).getTime(),
      })),
    [leads]
  )

  // 배정은 기간 필터와 무관하게 "전체 행사"를 후보로 계산한다 — 필터로 후보를 줄이면
  // 제외된 행사가 흡수하던 fallback 리드가 남은 행사로 재배정돼, 같은 행사의 리드/CPL이
  // 기간 토글에 따라 달라진다. 표시는 filtered 행사의 셀만 읽으므로 집계 범위는 그대로다.
  const eventLeadStats = useMemo(
    () => assignEventLeads(leadLookupRows, events),
    [events, leadLookupRows]
  )

  // 집계 (전체 KPI) — 요약 탭과 광고 탭(채널 예산 대조)이 공유하므로 페이지 레벨 유지
  const aggregate = useMemo<CampaignAggregate>(() => {
    let totalSpend = 0
    let totalRevenue = 0
    let totalLeads = 0
    let totalDeals = 0
    let totalAttendees = 0
    // ROI 분모는 "매출을 입력한" 행사의 광고비만 합산한다. 매출 미입력 행사의
    // 광고비까지 넣으면 매출 0으로 잡혀 누적 ROI가 거짓 적자로 끌려간다.
    let roiSpend = 0
    let roiRevenue = 0
    const channelTotals = Object.fromEntries(
      AD_CHANNELS.map((c): [AdChannel, number] => [c, 0])
    ) as Record<AdChannel, number>
    for (const ev of filtered) {
      const metrics = metricsMap[ev.id] ?? {
        ...DEFAULT_EVENT_METRICS,
        eventId: ev.id,
        updatedAt: "",
      }
      const leadStats = eventLeadStats.get(ev.id) ?? { attributed: 0, during: 0 }
      const attributed = leadStats.attributed
      const during = leadStats.during
      const funnel = buildFunnel(ev, metrics, attributed, during)
      const econ = computeEconomics(funnel, metrics)
      totalSpend += econ.adSpendTotal
      totalRevenue += econ.revenue
      totalLeads += funnel.leads
      totalDeals += funnel.deals
      totalAttendees += funnel.attendees
      // 개별 행사 ROI(computeEconomics)와 같은 조건 — 광고비가 있는 행사만 넣는다.
      // 광고비 0·매출 입력 행사를 분자에 더하면 개별 ROI 는 "—"인데 누적 ROI 만 부풀어
      // 리더보드 합과 어긋난다.
      if (metrics.dealsRevenue != null && econ.adSpendTotal > 0) {
        roiSpend += econ.adSpendTotal
        roiRevenue += econ.revenue
      }
      for (const e of metrics.adSpendEntries) channelTotals[e.channel] += e.amount
    }
    const avgCpl = totalLeads > 0 ? Math.round(totalSpend / totalLeads) : null
    const overallRoi = roiSpend > 0 ? Math.round(((roiRevenue - roiSpend) / roiSpend) * 100) : null
    const dealConversionRate = totalLeads > 0 ? Math.round((totalDeals / totalLeads) * 100) : null
    const attendanceToDealRate =
      totalAttendees > 0 ? Math.round((totalDeals / totalAttendees) * 100) : null
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
      const metrics: EventMetrics =
        metricsMap[ev.id] ?? { ...DEFAULT_EVENT_METRICS, eventId: ev.id, updatedAt: "" }
      const leadStats = eventLeadStats.get(ev.id) ?? { attributed: 0, during: 0 }
      const funnel = buildFunnel(ev, metrics, leadStats.attributed, leadStats.during)
      const econ = computeEconomics(funnel, metrics)
      return { event: ev, metrics, funnel, econ }
    })
  }, [filtered, metricsMap, eventLeadStats])

  // 채널별 효율 — 광고비는 채널 합산, 리드는 행사 내 광고비 비중으로 안분(추정)
  const channelEfficiencyData = useMemo<ChannelEfficiencyRow[]>(() => {
    const spendByChannel = Object.fromEntries(
      AD_CHANNELS.map((c): [AdChannel, number] => [c, 0])
    ) as Record<AdChannel, number>
    const leadsByChannel = Object.fromEntries(
      AD_CHANNELS.map((c): [AdChannel, number] => [c, 0])
    ) as Record<AdChannel, number>
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
        const leads = leadsByChannel[channel]
        const cpl = leads > 0 ? Math.round(spend / leads) : null
        return {
          channel,
          label: AD_CHANNEL_LABEL[channel],
          color: AD_CHANNEL_COLOR[channel],
          spend,
          leads: Math.round(leads),
          cpl,
        }
      })
  }, [perEventEcon])

  // 행사 탭에서 저장한 성과를 페이지 소유 metricsMap에 반영 (요약·광고 탭 파생값도 함께 갱신)
  const handleMetricsSaved = useCallback((saved: EventMetrics) => {
    setMetricsMap((m) => ({ ...m, [saved.eventId]: saved }))
  }, [])

  // 광고 탭의 채널 집행·성과 표도 이 기간(filtered 파생값)에 종속된다 — 토글을 숨기면
  // 요약에서 정한 기간이 광고 탭을 조용히 지배하므로 광고 탭에도 노출한다(2026-08-18).
  const showFilterRow = activeTab === "summary" || activeTab === "events" || activeTab === "meta"
  const refreshLoading =
    activeTab === "meta"
      ? metaLoading || adLeadsLoading
      : activeTab === "summary"
        ? loading || metaLoading
        : loading
  const refreshCurrent = useCallback(() => {
    if (activeTab === "meta") {
      // 광고 탭은 Meta 성과와 광고 리드가 나란히 놓이므로 헤더 동기화가 둘 다 새로 받는다.
      void Promise.all([loadMeta({ force: true }), loadAdLeads({ force: true })])
      return
    }
    if (activeTab === "summary") {
      // 요약 헤더의 "동기화"는 화면에 보이는 세 축(행사·Meta·이메일 채널 카드)을 전부 새로 받는다
      // — 이메일 지표만 캐시에 남으면 동기화 버튼이 거짓말이 된다(2026-08-18).
      void Promise.all([load({ force: true }), loadMeta({ force: true }), loadEmailStats({ force: true })])
      return
    }
    void load({ force: true })
  }, [activeTab, load, loadAdLeads, loadEmailStats, loadMeta])

  return (
    <div className="pb-24">
      {/* TopBar — branch admin과 동일한 패턴 */}
      <header className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 pb-5 pt-6 sm:px-6 lg:px-9 lg:pt-8">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#615D59]">
              <span>ADMIN</span>
              <span className="opacity-50">›</span>
              <span>그로스</span>
              <span className="opacity-50">›</span>
              <span>캠페인</span>
            </div>
            <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-[-0.02em] text-[#111110] sm:text-[30px]">
              캠페인
            </h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={refreshCurrent}
              disabled={refreshLoading}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(0,0,0,0.08)] bg-white px-3 py-1.5 text-[12px] font-bold text-[#111110] transition hover:bg-[#F6F5F4] disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshLoading ? "animate-spin" : ""}`} />
              동기화
            </button>
            <Link
              href="/admin/events"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-[#084734] px-3 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#065c41]"
            >
              <Plus className="w-3.5 h-3.5" />
              행사 관리
            </Link>
          </div>
        </div>

      </header>

      {/* Sub-tabs — branch admin 스타일. 기간 토글은 이 띠 안에 함께 둔다(2026-08-18) —
          헤더에 떠 있으면 "모든 탭에 걸리는 전역 필터"라는 소속이 안 보이고, 표들이 이 기간에
          조용히 종속된다. 같은 띠에 있으면 탭·기간이 한 묶음의 조회 조건으로 읽힌다. */}
      <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#F6F5F4] px-2 sm:px-4 lg:px-9">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <AdminTabs
            className="-mb-px min-w-0 py-2"
            label="캠페인 보기"
            variant="subtle"
            items={CAMPAIGN_TABS.map((tab) => ({
              value: tab.id,
              label: tab.label,
              // 라이브/준비 중 구분(sub)은 선언만 있고 렌더되지 않던 죽은 데이터였다 — 정직 라벨은
              // 보여야 정직하다(2026-08-18). AdminTabs가 420px 미만에서는 자동으로 숨긴다.
              description: tab.sub,
              icon:
                tab.id === "meta" ? (
                  <Activity className="h-3.5 w-3.5" />
                ) : tab.id === "email" ? (
                  <Mail className="h-3.5 w-3.5" />
                ) : undefined,
            }))}
            value={activeTab}
            onValueChange={setTabParam}
            panelId="campaigns-tabpanel"
          />
          {showFilterRow && (
            <div className="inline-flex shrink-0 rounded-lg border border-[rgba(0,0,0,0.08)] p-[3px] max-sm:mb-2" role="group" aria-label="기간 필터">
              {(["active", "30d", "90d", "all"] as Period[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPeriod(p)}
                  aria-pressed={period === p}
                  className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition ${
                    period === p ? "bg-white text-[#111110] shadow-[0_1px_2px_rgba(0,0,0,0.06)]" : "text-[#615D59]"
                  }`}
                >
                  {p === "active" ? "진행중·예정" : p === "30d" ? "30일" : p === "90d" ? "90일" : "전체"}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 마케팅 워크스페이스 크로스링크 — 형제 마케팅 표면으로 이동(사이드바 그룹 보조).
          공개 행사는 헤더 "행사 관리" CTA로 이미 도달 가능하므로 여기선 제외(한 목적지 중복 라벨 방지). */}
      <div className="border-b border-[rgba(0,0,0,0.08)] bg-[#FAFAF8] px-4 py-2.5 sm:px-6 lg:px-9">
        <MarketingCrossLinks currentHref="/admin/campaigns" excludeHrefs={["/admin/events"]} />
      </div>

      {/* Tab content — 단일 tabpanel 컨테이너(2026-08-18 a11y). AdminTabs의 aria-controls가
          이 컨테이너를 가리키고, 내용은 활성 탭에 따라 교체된다. */}
      <div
        id="campaigns-tabpanel"
        role="tabpanel"
        aria-label={`${CAMPAIGN_TABS.find((tab) => tab.id === activeTab)?.label ?? activeTab} 탭`}
      >
      {activeTab === "email" ? (
        <EmailTab
          recipientPrefill={messagePrefill}
          onRecipientPrefillConsumed={consumeMessagePrefill}
        />
      ) : activeTab === "meta" ? (
        <MetaTab
          dashboard={metaDashboard}
          loading={metaLoading}
          coreLoading={loading}
          error={metaError}
          datePreset={metaDatePreset}
          updatingId={metaUpdatingId}
          onDatePresetChange={setMetaDatePreset}
          onRefresh={refreshMeta}
          onToggleStatus={toggleMetaCampaignStatus}
          channelEfficiencyData={channelEfficiencyData}
          channelBudgets={channelBudgets}
          onBudgetChange={handleChannelBudgetChange}
          budgetError={budgetError}
          aggregate={aggregate}
          adLeads={adLeads}
          adLeadsLoading={adLeadsLoading}
          adLeadsError={adLeadsError}
          onRefreshAdLeads={refreshAdLeads}
          onAdLeadsUpdate={updateAdLeads}
          perEventEcon={perEventEcon}
          metricsMap={metricsMap}
          editing={editing}
          setEditing={setEditing}
          onMetricsSaved={handleMetricsSaved}
          metricsFocusNonce={metricsFocusNonce}
        />
      ) : (
        <div className="px-4 pt-6 sm:px-6 lg:px-9">
          {error && (
            <div className="mb-4 rounded-xl border border-[#F2B8B8] bg-[#FCE9E9] px-4 py-3 text-[13px] text-[#B43E3E]">
              {error}
            </div>
          )}

      {activeTab === "summary" && (
        <SummaryTab
          loading={loading}
          events={events}
          filtered={filtered}
          perEventEcon={perEventEcon}
          aggregate={aggregate}
          channelEfficiencyData={channelEfficiencyData}
          emailStats={emailStats}
          emailStatsError={emailStatsError}
          onRetryEmailStats={loadEmailStats}
          metaDashboard={metaDashboard}
          metaLoading={metaLoading}
          metaError={metaError}
          metaDatePreset={metaDatePreset}
          onRefreshMeta={refreshMeta}
          onGoToTab={setTabParam}
          onOpenMetricsInput={() => {
            setMetricsFocusNonce((nonce) => nonce + 1)
            setTabParam("meta")
          }}
        />
      )}

      {activeTab === "events" && (
        <EventsTab
          loading={loading}
          filtered={filtered}
          metricsMap={metricsMap}
          eventLeadStats={eventLeadStats}
          perEventEcon={perEventEcon}
          galleryView={galleryView}
          setViewParam={setViewParam}
          eventSearch={eventSearch}
          setEventSearch={setEventSearch}
          eventStatusFilter={eventStatusFilter}
          setEventStatusFilter={setEventStatusFilter}
          eventCategoryFilter={eventCategoryFilter}
          setEventCategoryFilter={setEventCategoryFilter}
          eventSort={eventSort}
          setEventSort={setEventSort}
          period={period}
          setPeriod={setPeriod}
          viewingEvent={viewingEvent}
          setViewingEvent={setViewingEvent}
          editing={editing}
          setEditing={setEditing}
          onMetricsSaved={handleMetricsSaved}
        />
      )}
        </div>
      )}
      </div>
    </div>
  )
}
