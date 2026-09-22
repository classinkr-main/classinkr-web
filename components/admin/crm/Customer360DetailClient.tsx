"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Briefcase, ClipboardList, Coins, ExternalLink, LayoutDashboard, ListChecks } from "lucide-react"

import type { Customer360 } from "@/lib/repositories/crm-customer-360"

import Customer360DetailActivity from "./Customer360DetailActivity"
import Customer360DetailDeals from "./Customer360DetailDeals"
import Customer360DetailMoney from "./Customer360DetailMoney"
import Customer360DetailOverview from "./Customer360DetailOverview"
import Customer360DetailTasks from "./Customer360DetailTasks"
import { SEVERITY_CLASS, SEVERITY_LABEL } from "./Customer360DetailShared"

export type Customer360DetailTab = "overview" | "money" | "deals" | "activity" | "tasks"
type TabKey = Customer360DetailTab

const TABS: Array<{ key: TabKey; label: string; icon: React.ReactNode; count?: (data: Customer360) => number }> = [
  { key: "overview", label: "개요", icon: <LayoutDashboard className="h-3.5 w-3.5" /> },
  { key: "money", label: "Revenue", icon: <Coins className="h-3.5 w-3.5" /> },
  { key: "deals", label: "딜", icon: <Briefcase className="h-3.5 w-3.5" />, count: (d) => d.deals.summary.total },
  {
    key: "activity",
    label: "활동·메모",
    icon: <ClipboardList className="h-3.5 w-3.5" />,
    // 탭 배지도 병합 기준으로 센다 — 탭을 열었을 때 보이는 건수와 어긋나지 않게.
    count: (d) => d.activity.summary.total + d.compass.entries.length,
  },
  { key: "tasks", label: "태스크", icon: <ListChecks className="h-3.5 w-3.5" />, count: (d) => d.tasks.summary.total },
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

function renderTabBody(tab: TabKey, data: Customer360) {
  switch (tab) {
    case "money":
      return <MoneyTabWithRelink data={data} />
    case "deals":
      return <Customer360DetailDeals deals={data.deals} />
    case "activity":
      return <Customer360DetailActivity activity={data.activity} compass={data.compass} />
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
export function Customer360DetailTabPanels({ data, activeTab, visitedTabs }: Customer360DetailTabPanelsProps) {
  const visited = new Set(visitedTabs)
  return (
    <>
      {TABS.filter((tab) => visited.has(tab.key)).map((tab) => {
        const isActive = tab.key === activeTab
        return (
          <div
            key={tab.key}
            id={`c360-detail-tabpanel-${tab.key}`}
            role="tabpanel"
            aria-labelledby={`c360-detail-tab-${tab.key}`}
            aria-hidden={!isActive}
            hidden={!isActive}
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

export default function Customer360DetailClient({ data, customerKey }: Props) {
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const header = data.header
  const displayName = header?.name ?? "고객"
  const isLead = data.source !== "neo_account"
  const sourceLabel = header?.sourceLabel ?? (isLead ? "리드" : "고객")
  const metaLine = [
    header?.ownerName ?? "담당 미배정",
    header?.region ?? "지역 미지정",
    header?.score != null ? `점수 ${header.score}` : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const originHref = isLead
    ? `/admin/crm/customers/leads?lead=${encodeURIComponent(data.entityId)}`
    : `/admin/crm/customers/accounts?account=${encodeURIComponent(data.entityId)}`

  return (
    <div className="mx-auto max-w-5xl" data-customer-key={customerKey}>
      <div className="mb-5">
        <Link
          href="/admin/crm/customers/unified"
          className="inline-flex w-fit items-center gap-1 text-[12px] font-semibold text-[#1a1a1a]/45 transition-colors hover:text-[#111110]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          고객DB
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
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
            <p className="mt-1 text-[13px] text-[#1a1a1a]/45">{metaLine}</p>
          </div>
          <Link
            href={originHref}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-[#e8e8e4] bg-white px-3 text-[12px] font-semibold text-[#1a1a1a]/55 transition-colors hover:bg-[#f5f5f2] hover:text-[#111110]"
          >
            원본 화면
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {data.health.warnings.length > 0 ? (
        <div className="mb-4 rounded-xl border border-[#ECD29C] bg-[#FBF1E0] px-3 py-2 text-[12px] text-[#7A520F]">
          {data.health.warnings.join(" ")}
        </div>
      ) : null}

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
              onClick={() => selectTab(tab.key)}
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

      <Customer360DetailTabPanels data={data} activeTab={activeTab} visitedTabs={visitedTabs} />
    </div>
  )
}
