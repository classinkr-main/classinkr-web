"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Briefcase, ClipboardList, Coins, ExternalLink, LayoutDashboard, ListChecks, NotebookPen, RefreshCw } from "lucide-react"

import { adminFetchJson } from "@/lib/admin-client"
import { COMPASS_LIVE_REFRESH_MS, COMPASS_LIVE_REFRESH_LABEL } from "@/lib/compass/live-sync"
import { customerDetailHref } from "@/lib/crm/customer-navigation"
import { getRecentCustomers, pushRecentCustomer, type RecentCustomer } from "@/lib/crm/recent-customers"
import { useVisibleInterval } from "@/components/admin/branch/use-visible-interval"
import ActivityQuickForm from "./rail/ActivityQuickForm"
import CrmContactValue from "./CrmContactValue"

import CompassOpenLink from "@/components/admin/compass/CompassOpenLink"
import C360WriteSurfaceBar, { CompassDownWriteCaption, HomeOnlyCaption } from "./drawer/C360WriteSurfaceBar"
import { COMPASS_RECORD_LABEL, HOME_SEPARATE_LOG_LABEL, resolveCrmWriteSurface } from "@/lib/crm/write-surface"
import type { Customer360 } from "@/lib/repositories/crm-customer-360"

import Customer360ContactSummary from "./Customer360ContactSummary"
import Customer360DetailActivity from "./Customer360DetailActivity"
import Customer360DetailDeals from "./Customer360DetailDeals"
import Customer360DetailMoney from "./Customer360DetailMoney"
import Customer360DetailOverview from "./Customer360DetailOverview"
import Customer360DetailTasks from "./Customer360DetailTasks"
import Customer360PurchaseSummary from "./Customer360PurchaseSummary"
import { SEVERITY_CLASS, SEVERITY_LABEL } from "./Customer360DetailShared"

export type Customer360DetailTab = "overview" | "money" | "deals" | "activity" | "tasks"

/** 상세 페이지 Home 기록 입력 칸 — "기록 입력" 버튼·A안 접기 토글이 가리킨다(드로어 컴포저 id 와 겹치지 않게). */
const DETAIL_COMPOSER_BODY_ID = "customer-record-body"
const DETAIL_HOME_COMPOSER_ID = "c360-detail-home-composer"
type TabKey = Customer360DetailTab

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode; count?: (data: Customer360) => number }> = [
  { key: "overview", label: "특징·요약", icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
  { key: "money", label: "매출", icon: <Coins className="h-3.5 w-3.5" /> },
  { key: "deals", label: "딜", icon: <Briefcase className="h-3.5 w-3.5" />, count: (d) => d.deals.summary.total },
  {
    key: "activity",
    label: "로그·구매 기록",
    icon: <ClipboardList className="h-3.5 w-3.5" />,
    // 탭 배지도 병합 기준으로 센다 — 탭을 열었을 때 보이는 건수와 어긋나지 않게.
    count: (d) => d.activity.summary.total + d.compass.entries.length + (d.money.orders?.length ?? 0) + (d.money.collections?.length ?? 0) + d.deals.rows.length + (d.money.lineItems ?? []).reduce((count, item) => count + item.details.length, 0),
  },
  { key: "tasks", label: "다음 액션", icon: <ListChecks className="h-3.5 w-3.5" />, count: (d) => d.tasks.summary.total },
]

const TAB_KEYS = new Set<TabKey>(TABS.map((tab) => tab.key))

function isTabKey(value: string | null): value is TabKey {
  return value != null && TAB_KEYS.has(value as TabKey)
}

/**
 * M4 — 연결 대기 출고를 이 고객에 연결하면 서버가 조립한 360 데이터가 낡는다. 매출 탭이 낙관적으로
 * 행을 옮긴 뒤 onRelinked 로 알려 주면 라우터 refresh 로 서버 재조립을 받는다(탭·URL 상태는 유지).
 */
function MoneyTabWithRelink({ data }: { data: Customer360 }) {
  const router = useRouter()
  const accountId = data.source === "neo_account" ? data.entityId : null
  return (
    <Customer360DetailMoney
      money={data.money}
      deals={data.deals}
      accountId={accountId}
      customerName={data.header?.name ?? null}
      onRelinked={() => router.refresh()}
    />
  )
}

/**
 * A안(2026-09-25) — 기록 위치 판정을 360 페이로드에서 한 번에 만든다(lib/crm/write-surface). 헤더 링크와
 * 활동 탭 안내 문구가 같은 판정을 쓴다. 순수 함수(테스트 고정).
 */
export function detailWriteSurface(data: Customer360) {
  return resolveCrmWriteSurface({
    source: data.source,
    found: data.found,
    compassHref: data.compass?.href,
    compassDown: data.compass?.down,
    leadStatus: data.leadStatus,
    crmRegistered: data.crmRegistered,
  })
}

function renderTabBody(tab: TabKey, data: Customer360) {
  switch (tab) {
    case "money":
      return <MoneyTabWithRelink data={data} />
    case "deals":
      return <Customer360DetailDeals deals={data.deals} />
    case "activity":
      return (
        <Customer360DetailActivity
          activity={data.activity}
          compass={data.compass}
          customerKey={data.key}
          generatedAt={data.generatedAt}
          customerSource={data.source}
          linkedLeads={data.linkedLeads}
          writeSurface={detailWriteSurface(data).surface}
        />
      )
    case "tasks":
      return <Customer360DetailTasks tasks={data.tasks} customerKey={data.key} targetLabel={data.header?.name ?? null} />
    case "overview":
    default:
      return <Customer360DetailOverview data={data} />
  }
}

export interface Customer360DetailTabPanelsProps {
  data: Customer360
  activeTab: TabKey
  /** 지금까지 한 번이라도 열렸던 탭 — 이 목록에 있는 탭만 마운트한다(순서는 TABS 기준). */
  visitedTabs: TabKey[]
  /** 전체 페이지는 이력 큐를 하단에 항상 표시한다. */
  persistentHistory?: boolean
}

/**
 * P3 — 방문한 탭은 마운트를 유지하고 `hidden` 속성으로만 감춘다. 매출 탭의 접힘·더 보기,
 * 기록 탭의 펼침 같은 탭 내부 로컬 상태가 탭 전환에도 사라지지 않는다(기존엔 activeTab
 * 조건부 렌더라 비활성 탭이 매번 언마운트됐다). 미방문 탭은 여전히 마운트하지 않는다(초기
 * 렌더 비용 증가 금지) — TABS 순서를 그대로 두고 방문 집합만 필터한다.
 *
 * 내부 렌더 로직을 컴포넌트 밖으로 뽑아 export한다 — Customer360DetailClient는 클릭으로만
 * visitedTabs를 늘리므로(react-dom/server의 renderToStaticMarkup은 상호작용을 재현하지
 * 못한다), tests/crm/customer-360-tab-keepalive.test.tsx가 이 컴포넌트를 임의의 visitedTabs로
 * 직접 렌더해 "두 탭 방문 시 두 패널이 뜨고 비활성은 hidden"을 정적 마크업으로 고정한다.
 *
 * aria: 활성 패널만 aria-hidden="false"(나머지는 "true", 생략하지 않는다) — role=tabpanel과
 * aria-labelledby(탭 버튼 id)는 방문 여부와 무관하게 유지한다.
 */
export function Customer360DetailTabPanels({ data, activeTab, visitedTabs, persistentHistory = false }: Customer360DetailTabPanelsProps) {
  const visited = new Set(visitedTabs)
  return (
    <>
      {TABS.filter((tab) => visited.has(tab.key) && !(persistentHistory && tab.key === "activity")).map((tab) => {
        const isActive = tab.key === activeTab
        return (
          <div
            key={tab.key}
            id={`c360-detail-tabpanel-${tab.key}`}
            role="tabpanel"
            aria-labelledby={`c360-detail-tab-${tab.key}`}
            aria-hidden={!isActive}
            hidden={!isActive}
            className="scroll-mt-4"
          >
            {renderTabBody(tab.key, data)}
          </div>
        )
      })}
    </>
  )
}

/** `?tab=` 값 → 탭 키. 모르는 값·없음은 개요. */
export function resolveDetailTab(param: string | null): TabKey {
  return isTabKey(param) ? param : "overview"
}

/**
 * 탭 전환 뒤의 검색 문자열 — 개요는 `tab`을 지우고 나머지는 set. 다른 파라미터는 보존한다.
 * 순수 함수라 테스트로 고정한다(c360-01).
 */
export function detailTabSearch(currentSearch: string, tab: TabKey): string {
  const params = new URLSearchParams(currentSearch.startsWith("?") ? currentSearch.slice(1) : currentSearch)
  if (tab === "overview") params.delete("tab")
  else params.set("tab", tab)
  const qs = params.toString()
  return qs ? `?${qs}` : ""
}

interface Props {
  data: Customer360
  customerKey: string
}

export default function Customer360DetailClient({ data: initialData, customerKey }: Props) {
  const [data, setData] = useState(initialData)
  const [seed, setSeed] = useState(initialData)
  const [recents, setRecents] = useState<RecentCustomer[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  const [homeComposerOpen, setHomeComposerOpen] = useState(false)
  const [composerDirty, setComposerDirty] = useState(false)
  const refreshInFlight = useRef(false)
  if (seed !== initialData) { setSeed(initialData); setData(initialData) }
  const refresh = useCallback(async () => {
    if (refreshInFlight.current) return
    refreshInFlight.current = true
    setRefreshing(true)
    try {
      const next = await adminFetchJson<Customer360>(`/api/admin/crm/customers/${encodeURIComponent(customerKey)}/360?eventsLimit=50&tasksLimit=50&dealsLimit=200`)
      if (!next || !next.found || next.key !== customerKey) throw new Error("고객 정보를 확인하지 못했습니다.")
      if (next.money.sourceWarnings?.some(message => message.includes("불러오지 못했습니다."))) throw new Error("구매 원천 연결 실패")
      setData(next)
      setRefreshError(null)
    } catch {
      setRefreshError("최근 확인한 정보를 유지하고 있습니다. 연결을 복구하면 다시 갱신합니다.")
    } finally {
      refreshInFlight.current = false
      setRefreshing(false)
    }
  }, [customerKey])
  useVisibleInterval(() => { void refresh() }, COMPASS_LIVE_REFRESH_MS)
  useEffect(() => {
    const online = () => { void refresh() }
    window.addEventListener("online", online)
    return () => window.removeEventListener("online", online)
  }, [refresh])
  useEffect(() => {
    if (data.header) pushRecentCustomer({ key: data.key, name: data.header.name, source: data.source, sourceLabel: data.header.sourceLabel })
    // 브라우저 영속 저장소는 SSR 렌더에서 읽지 않고 마운트 후 동기화한다.
    setRecents(getRecentCustomers().filter(item => item.key !== data.key).slice(0, 4))
  }, [data.key, data.source, data.header])
  const searchParams = useSearchParams()
  const tabParam = searchParams.get("tab")

  // c360-01 — 탭은 로컬 state가 정본이다. 이전엔 useSearchParams에서만 파생되고 router.replace로만
  // 바뀌어서, 동적 렌더인 /admin 아래에서는 탭 클릭마다 서버가 page.tsx를 재실행해 360 전체
  // (이벤트 50·딜 200·Compass 2회·REV/HW 스캔)를 다시 조립했다. body는 이미 받은 data prop만 쓰므로
  // 서버 재조회는 불필요하다 — 클릭은 state를 즉시 바꾸고 URL 동기화는 history.replaceState로 뒤따른다.
  // activeTab·visitedTabs(P3 keep-alive)를 한 state로 묶는다 — 파생값 두 개를 하나의 갱신으로
  // 묶어 이펙트마다 setState 호출이 하나만 있게 한다.
  const [tabState, setTabState] = useState<{ activeTab: TabKey; visitedTabs: TabKey[] }>(() => {
    const initial = resolveDetailTab(tabParam)
    return { activeTab: initial, visitedTabs: [initial] }
  })
  const { activeTab, visitedTabs } = tabState

  const visitTab = useCallback((tab: TabKey) => {
    setTabState((current) => {
      if (current.activeTab === tab && current.visitedTabs.includes(tab)) return current
      const visited = current.visitedTabs.includes(tab) ? current.visitedTabs : [...current.visitedTabs, tab]
      return { activeTab: tab, visitedTabs: visited }
    })
  }, [])

  // popstate(뒤로/앞으로)·외부 링크로 검색 파라미터가 바뀌면 state를 따라 맞춘다(c360-01).
  // selectTab이 바꾼 URL은 이미 같은 값이라 no-op(위 updater가 current를 그대로 돌려줘 리렌더도 없다).
  // 부작용(브라우저 API 호출 등) 없이 tabParam 변경에만 반응하는 단일 setState 호출이라
  // useChatbotTeaser.ts와 같은 패턴으로 다음 줄만 억제한다.
  useEffect(() => {
    visitTab(resolveDetailTab(tabParam))
  }, [tabParam, visitTab])

  const selectTab = useCallback((tab: TabKey) => {
    visitTab(tab)
    if (typeof window === "undefined") return
    const search = detailTabSearch(window.location.search, tab)
    const next = `${window.location.pathname}${search}${window.location.hash}`
    if (next === `${window.location.pathname}${window.location.search}${window.location.hash}`) return
    // Next App Router는 history.replaceState를 가로채 useSearchParams와 동기화하되 서버 요청은 내지 않는다.
    window.history.replaceState(null, "", next)
  }, [visitTab])

  const focusTab = (tab: TabKey) => {
    selectTab(tab)
    window.requestAnimationFrame(() => {
      document.getElementById(`c360-detail-tabpanel-${tab}`)?.scrollIntoView({
        block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
      })
    })
  }

  const header = data.header
  const displayName = header?.name ?? "고객"
  const isLead = data.source !== "neo_account"
  const sourceLabel = header?.sourceLabel ?? (isLead ? "리드" : "고객")
  const metaLine = [
    header?.ownerName ?? "미배정",
    header?.region ?? "지역 미지정",
    header?.score != null ? `점수 ${header.score}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const originHref = isLead
    ? `/admin/crm/customers/leads?lead=${encodeURIComponent(data.entityId)}`
    : `/admin/crm/customers/accounts?account=${encodeURIComponent(data.entityId)}`
  // A안 — Compass 에서 응대 중인 리드는 헤더 주 행동이 Compass 새 탭 링크, Home 정본(NEO·전환)은 보조 링크.
  const writeSurface = useMemo(() => detailWriteSurface(data), [data])
  // A안 — Compass 리드의 Home 기록 입력 칸은 "기록은 Compass에서" 바 뒤로 접어 둔다(드로어와 같은 규칙).
  // 작성을 시작하면 펼친 채로 두고, 작성 중(composerDirty)이면 절대 숨기지 않는다. 고객이 바뀌면 page.tsx 의
  // key 로 이 컴포넌트가 다시 마운트돼 접힌 상태로 돌아간다.
  const compassPrimary = writeSurface.surface === "compass"
  const composerVisible = !compassPrimary || homeComposerOpen || composerDirty
  const handleComposerDirtyChange = useCallback((dirty: boolean) => {
    setComposerDirty(dirty)
    if (dirty) setHomeComposerOpen(true)
  }, [])
  // 접힌 입력 칸(hidden)은 포커스를 받지 못하므로 먼저 펼치고, 커밋 뒤 프레임에서 포커스한다.
  const focusComposer = useCallback(() => {
    setHomeComposerOpen(true)
    window.requestAnimationFrame(() => document.getElementById(DETAIL_COMPOSER_BODY_ID)?.focus())
  }, [])
  const toggleHomeComposer = useCallback(() => {
    if (composerVisible) {
      if (!composerDirty) setHomeComposerOpen(false)
      return
    }
    focusComposer()
  }, [composerVisible, composerDirty, focusComposer])

  return (
    <div className="mx-auto max-w-7xl" data-customer-key={customerKey}>
      <div className="mb-3">
        <div className="mt-1 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <Link
          href="/admin/crm/customers/unified"
          className="inline-flex min-h-8 w-fit items-center gap-1 text-[13px] font-semibold text-[#615D59] transition-colors hover:text-[#111110]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          고객DB
        </Link>
              <span className="rounded-full bg-[#111110] px-2 py-0.5 text-[11px] font-semibold text-white">{sourceLabel}</span>
              {header?.statusLabel ? (
                <span className="rounded-full bg-[#fafaf8] px-2 py-0.5 text-[11px] font-semibold text-[#1a1a1a]/55">
                  {header.statusLabel}
                </span>
              ) : null}
              <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${SEVERITY_CLASS[data.risk.severity]}`}>
                리스크 {SEVERITY_LABEL[data.risk.severity]}
              </span>
            </div>
            <h1 className="text-xl font-bold tracking-[-0.02em] text-[#111110] sm:text-2xl">{displayName}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]" aria-label="고객 연락처와 담당 정보">
              <span className="text-[#615D59]">담당 {metaLine}</span>
              <CrmContactValue value={data.contacts?.phone ?? null} />
              {data.contacts?.email ? <CrmContactValue value={data.contacts.email} /> : null}
            </div>
            {/* CT9 — 마지막 연락 · 다음 연락(원천 표시, 서버 조립 시각 기준). 좁으면 두 줄로 쌓는다. */}
            <Customer360ContactSummary summary={data.contactSummary} className="mt-1.5" />
            {header?.nextActionLabel || data.tags.length || data.risk.reasons.length ? <p className="mt-1 text-[12px] leading-5 text-[#615D59]">{[header?.nextActionLabel, ...data.risk.reasons, ...data.tags.map(tag => `#${tag}`)].filter(Boolean).join(" · ")}</p> : null}
          </div>
          {/* A안 — Compass 에서 응대 중인 리드는 주 행동이 Compass 새 탭 링크, Home 정본(NEO·전환)은 보조 링크. */}
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {writeSurface.surface === "compass" && writeSurface.compassHref ? (
              <CompassOpenLink
                href={writeSurface.compassHref}
                name={displayName}
                variant="primary"
                className="h-11 sm:h-8"
                testId="c360-detail-open-compass"
              />
            ) : writeSurface.secondaryCompassHref ? (
              <CompassOpenLink
                href={writeSurface.secondaryCompassHref}
                name={displayName}
                variant="secondary"
                label={COMPASS_RECORD_LABEL}
                className="h-11 sm:h-8"
                testId="c360-detail-compass-record"
              />
            ) : null}
            <Link
              href={originHref}
              className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
            >
              원본 화면에서 관리
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </div>

      {data.health.warnings.length > 0 ? (
        <div className="mb-4 rounded-xl border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[12px] text-[#7A520F]">
          {data.health.warnings.join(" ")}
        </div>
      ) : null}

      <Customer360PurchaseSummary data={data} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2 py-1">
        <p role="status" className={`text-[12px] ${refreshError || data.compass.down ? "text-[#B43E3E]" : "text-[#615D59]"}`}>
          {refreshError ?? (data.compass.down ? "Compass 연결 확인 필요" : data.compass.leadIds.length ? `Compass 연결됨 · ${COMPASS_LIVE_REFRESH_LABEL}` : `Compass 전화 매칭 없음 · ${COMPASS_LIVE_REFRESH_LABEL}`)}
          {` · 확인 ${new Date(data.generatedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Seoul" })}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {recents.length ? <details className="relative">
            <summary className="cursor-pointer px-2 py-2 text-[12px] text-[#615D59]">최근 고객</summary>
            <nav aria-label="최근 본 고객" className="absolute right-0 z-10 min-w-48 rounded-lg border border-black/[0.08] bg-white p-2 shadow-sm">{recents.map(item => <Link key={item.key} href={customerDetailHref(item.key)} prefetch={false} className="flex min-h-11 items-center px-2 text-[13px] text-[#111110] hover:text-[#084734]">{item.name}</Link>)}</nav>
          </details> : null}
          {/* Compass 새 탭 링크는 헤더(A안 주·보조 링크) 한 곳에서 그린다 — 같은 링크를 두 번 두지 않는다. */}
          <button type="button" onClick={focusComposer} className={`inline-flex min-h-11 items-center gap-2 rounded-md px-4 text-[13px] font-semibold ${compassPrimary ? "border border-[#e8e8e4] bg-white text-[#084734] hover:bg-[#F6F5F4]" : "bg-[#084734] text-white hover:bg-[#065c41]"}`}><NotebookPen className="h-4 w-4" />{compassPrimary ? HOME_SEPARATE_LOG_LABEL : "기록 입력"}</button>
          <button type="button" disabled={refreshing} onClick={() => void refresh()} aria-label="고객 정보 새로고침" className="inline-flex min-h-11 items-center gap-2 rounded-md border border-[#e8e8e4] bg-white px-3 text-[13px] text-[#615D59] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />새로고침</button>
        </div>
      </div>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(320px,0.9fr)_minmax(0,1.6fr)]">
        <section className="min-w-0 xl:sticky xl:top-4" aria-label="고객 기록 입력 영역">
          {compassPrimary ? (
            <div className="mb-3 rounded-xl border border-[#e8e8e4] bg-white px-3 py-2.5">
              <C360WriteSurfaceBar
                name={displayName}
                open={composerVisible}
                onToggle={toggleHomeComposer}
                canCollapse={!composerDirty}
                controlsId={DETAIL_HOME_COMPOSER_ID}
                standalone
                testId="c360-detail-write-surface-bar"
              />
            </div>
          ) : null}
          {writeSurface.reason === "compass_down" ? <CompassDownWriteCaption className="mb-1.5" /> : null}
          <div id={DETAIL_HOME_COMPOSER_ID} hidden={!composerVisible}>
            {compassPrimary ? <HomeOnlyCaption className="mb-1.5" /> : null}
            <ActivityQuickForm key={customerKey} variant="workspace" compactWorkspace lockTarget defaultTargetType={data.source} defaultTargetId={data.entityId} defaultTargetLabel={displayName} defaultOwnerName={header?.ownerName ?? ""} bodyFieldId={DETAIL_COMPOSER_BODY_ID} onDirtyChange={handleComposerDirtyChange} onSaved={() => void refresh()} />
          </div>
        </section>
        <div className="min-w-0">
      {/* 탭 — 로컬 전환(서버 재요청 없음). role=tablist/aria-selected로 현재 탭을 보조기술에도 알린다. */}
      <div
        role="tablist"
        aria-label="고객 360 상세 탭"
        className="no-scrollbar mb-5 -mx-4 flex gap-1 overflow-x-auto border-b border-[#e8e8e4] px-4 sm:mx-0 sm:px-0"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          const count = tab.count?.(data)
          return (
            <button
              key={tab.key}
              id={`c360-detail-tab-${tab.key}`}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`c360-detail-tabpanel-${tab.key}`}
              onClick={() => tab.key === "activity" ? focusTab(tab.key) : selectTab(tab.key)}
              className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-semibold transition-colors sm:min-h-0 ${
                isActive
                  ? "border-[#084734] text-[#111110]"
                  : "border-transparent text-[#1a1a1a]/45 hover:text-[#111110]"
              }`}
            >
              <span className={isActive ? "text-[#084734]" : "text-[#1a1a1a]/35"}>{tab.icon}</span>
              {tab.label}
              {count != null && count > 0 ? (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${
                    isActive ? "bg-[#ECFDF5] text-[#084734]" : "bg-[#f0f0ec] text-[#1a1a1a]/45"
                  }`}
                >
                  {count}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <Customer360DetailTabPanels data={data} activeTab={activeTab} visitedTabs={visitedTabs} persistentHistory />
      <section id="c360-detail-tabpanel-activity" role={activeTab === "activity" ? "tabpanel" : "region"} aria-labelledby="c360-detail-tab-activity" aria-label="고객 로그·구매 기록 큐" className="mt-5 scroll-mt-4">
        <Customer360DetailActivity
          activity={data.activity}
          compass={data.compass}
          money={data.money}
          deals={data.deals}
          customerKey={data.key}
          generatedAt={data.generatedAt}
          customerSource={data.source}
          linkedLeads={data.linkedLeads}
          writeSurface={writeSurface.surface}
        />
      </section>
        </div>
      </div>
    </div>
  )
}
